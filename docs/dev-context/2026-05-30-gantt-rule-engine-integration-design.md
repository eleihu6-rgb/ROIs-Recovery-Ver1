# Gantt × Rule Engine 数据流完整设计

> 2026-05-30 讨论记录（持续更新）
> 覆盖：法规告警产生机制 · rule_violation 表设计 · 语言迁移决策 · 实时同步架构 · 服务部署拓扑 · 多法规集动态管理 · Per-User 会话违规隔离 · 性能策略

---

## 一、架构全景

```
┌────────────────────────────────────────────────────────────────────────────┐
│  客户端层                                                                   │
│  Gantt A（ccar121_gantt）/ Gantt B（custom_003）/ PBS Portal（ccar121_pbs）│
│  均通过 WebSocket 连接 live-server                                          │
└──────────────────────────┬─────────────────────────────────────────────────┘
                           │ WebSocket（单一 Hub）
                           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  live-server（Fastify + WS Hub）                                            │
│  · 接收排班操作 → DB 写入 + roster_event 写入                               │
│  · Redis PUBLISH roster:{airline}                                           │
│  · 记录每个客户端当前使用的 groupCode                                        │
│  · 订阅 Redis violations:{airline}:{groupCode} → 按 groupCode 路由推送      │
└──────────┬─────────────────────────────┬──────────────────────────────────┘
           │ PostgreSQL                  │ Redis Pub/Sub
           ▼                            ▼
┌──────────────────────┐    ┌──────────────────────────────────────────────┐
│  roster_event 表      │    │  roster:{airline}                            │
│  （持久化事件日志）   │    │  violations:{airline}:{groupCode}            │
│  event_id 单调递增    │    │  （groupCode 动态，按需创建频道）             │
└──────────────────────┘    └──────────────────────┬───────────────────────┘
           │                                       │
           │ 兜底追读（重启后按 event_id 追读）      │ 订阅
           │                                       ▼
           │                        ┌──────────────────────────────────────┐
           └──────────────────────→ │  Rule Engine Service（单一部署）      │
                                    │  port 3011  Python FastAPI            │
                                    │                                       │
                                    │  内存：roster_snapshot（共用）        │
                                    │  内存：rule_cache { groupCode→rules } │
                                    │  内存：active_groups { groupCode→Set<clientId> }
                                    │                                       │
                                    │  PINNED: ccar121_gantt, ccar121_pbs  │
                                    │  按需激活：custom_003, custom_007...  │
                                    └──────────────────────────────────────┘
```

---

## 二、法规引擎服务部署拓扑（修订版）

### 部署结论：只有一套法规服务

**之前的错误设计（已废弃）：**

```
rule-engine-gantt (port 3011) → 只处理 ccar121_gantt
rule-engine-pbs   (port 3012) → 只处理 ccar121_pbs
```

此设计在用户选择动态法规集时无解——法规集是数据库里的数据，可动态增删，无法在部署时穷举所有可能的 groupCode 逐一起服务。

**正确设计：单一服务，多法规集动态管理**

```
Rule Engine Service（port 3011，单一进程）
  · 预加载（PINNED，始终常驻内存）：ccar121_gantt, ccar121_pbs
  · 按需激活：任何其他 groupCode，有客户端时加载，无客户端后回收
  · 单一 Redis 订阅者
  · 单一 DB 连接池
```

**核心洞察：排班数据（roster）是共用的，只有规则（rules）因 groupCode 而异。**

```
用户 A 用 ccar121_gantt
用户 B 用 custom_003

两个用户看到同一份 roster_snapshot（同一套排班数据）
区别仅在于：用哪套 rules 检查这份数据
因此 roster_snapshot 在服务内共用，rule_cache 按 groupCode 独立
```

### 优化引擎调用（包调用，无独立服务）

```
PO engine (Python)  ─── import rois_rule_engine ──→ ccar121_po 法规集
RO engine (Python)  ─── import rois_rule_engine ──→ ccar121_ro 法规集
TO engine (Python)  ─── import rois_rule_engine ──→ ccar121_to 法规集
```

PO/RO/TO 是 engine-server 按需启动的优化任务，不是长驻服务，不需要独立法规服务进程。
优化启动前一次性读取法规配置，转化为 OR-Tools 约束，优化过程中不再调法规服务。

---

## 三、多法规集动态管理

### 服务内部状态

```
active_groups:
  ┌───────────────┬──────────────────┬────────┬────────────────────┐
  │ groupCode     │ clients          │ pinned │ 状态               │
  ├───────────────┼──────────────────┼────────┼────────────────────┤
  │ ccar121_gantt │ {A, C, D}        │ ✓      │ 常驻，不回收        │
  │ ccar121_pbs   │ {E}              │ ✓      │ 常驻，不回收        │
  │ custom_003    │ {B}              │        │ 活跃，B 在线中      │
  │ custom_007    │ {}               │        │ 待回收（TTL 30min）│
  └───────────────┴──────────────────┴────────┴────────────────────┘

roster_snapshot:                rule_cache:
  crew_101: { pairings:[...] }    ccar121_gantt: [rule1, rule2, ...]
  crew_102: { pairings:[...] }    ccar121_pbs:   [rule1, rule3, ...]
  crew_103: { pairings:[...] }    custom_003:    [rule2, rule4, ...]
  ...（所有 groupCode 共用）       custom_007:    [rule5, ...]（TTL 中）
```

### 用户 B 首次选择 custom_003（冷启动流程）

```
Step 1  Gantt 客户端发送：
          { type: 'set_rule_group', groupCode: 'custom_003', clientId: 'client-B' }

Step 2  live-server 更新 clientSessions：client-B → 'custom_003'
        通知 Rule Engine：activate 'custom_003' for client-B

Step 3  Rule Engine 处理激活请求：
          custom_003 不在 active_groups → 从 DB 加载规则（约 50ms）
          加入 active_groups: { 'custom_003': {'client-B'} }
          用当前 roster_snapshot 全量计算 custom_003 的违规
          UPSERT rule_violation WHERE rule_group_code='custom_003'
          PUBLISH violations:{airline}:custom_003

Step 4  live-server 收到 violations 推送 → 转发给 client-B

首次冷启动延迟：~50ms（DB 读规则）+ ~300-500ms（全量计算）
后续访问：命中缓存，DB 已有 rule_violation，立即返回
```

### 用户 B 断开连接（法规集回收）

```
Rule Engine 收到断开通知：
  active_groups['custom_003'].discard('client-B')

  if active_groups['custom_003'] is empty
  and 'custom_003' not in PINNED_GROUPS:
    启动 TTL 30 分钟倒计时
    → 30 分钟内无新客户端接入 → 从 active_groups 和 rule_cache 中清除
    → 30 分钟内有新客户端接入 → 取消 TTL，恢复活跃

注意：rule_violation 表中的数据保留
      用户 B 重连后可立即展示上次告警结果，后台做增量更新
```

### 用户 B 切换法规集

```
用户 B 在 Gantt 下拉将法规集从 custom_003 切换为 custom_007：

  ① WS 发送：{ type: 'change_rule_group', from: 'custom_003', to: 'custom_007' }
  ② live-server 更新 clientSessions：client-B → 'custom_007'
  ③ 通知 Rule Engine：
       deactivate custom_003 for client-B
       activate   custom_007 for client-B
  ④ Rule Engine 按需加载 custom_007 规则 → 计算告警 → PUBLISH
  ⑤ client-B 收到 custom_007 的告警，Gantt 刷新显示
```

### 排班变更时只重算活跃法规集

```python
async def on_roster_event(self, event: RosterEvent):
    affected_crews = event.ref['crew_ids']

    for group_code, state in self.active_groups.items():
        if not state.clients:       # 无客户端连接，跳过
            continue
        violations = await self.recompute(group_code, state.rules, affected_crews)
        await self.upsert_violations(violations)
        await self.redis.publish(f'violations:{event.airline}:{group_code}', event.event_id)

# 示例：active_groups = { ccar121_gantt:{A,C}, custom_003:{} }
# 只重算 ccar121_gantt（有客户端），custom_003 无客户端跳过
# 下次 custom_003 的用户重连时，读取 rule_violation 表 + 检查是否有未处理事件
```

---

## 四、live-server 客户端会话与告警路由

```
clientSessions（live-server 内存）：
  client-A → { groupCode: 'ccar121_gantt', airline: 'F8' }
  client-B → { groupCode: 'custom_003',    airline: 'F8' }
  client-E → { groupCode: 'ccar121_pbs',   airline: 'F8' }

收到 Redis 推送 violations:F8:ccar121_gantt（event_id=1043）：
  → 只推给 client-A（groupCode 匹配）
  → client-B、client-E 不受干扰

收到 Redis 推送 violations:F8:custom_003（event_id=1043）：
  → 只推给 client-B
```

---

## 五、语言迁移决策：TypeScript → Python

### 决策结论

**法规引擎核心迁移至 Python**，原有 TypeScript 版本作为翻译参考。

### 迁移理由

| 维度 | TypeScript 现状 | Python 迁移后 |
|---|---|---|
| Gantt / live-server 集成 | ✅ npm import 零延迟 | ⚠️ HTTP 本地回环（< 2ms，可接受） |
| pbs-server 集成 | ✅ npm import 零延迟 | ⚠️ HTTP 本地回环 |
| **PO/RO/TO 方法调用** | ❌ Python 无法 import TS 包 | ✅ Python 直接 import |
| OR-Tools 约束建模 | ❌ 无原生支持 | ✅ 原生 |
| engine-server（FastAPI）生态 | ❌ 跨语言 | ✅ 同一生态 |
| FRMS / 疲劳模型扩展 | ⚠️ 生态受限 | ✅ scipy / numpy / ML 全齐 |

### Python 包结构

```
rois-rule-engine/               # Python 包（pip install）
├── rule_engine/
│   ├── calculators/            # FDP、休息时间、累计工时（从 TS 版翻译）
│   ├── checkers/               # 各项法规检查
│   ├── checkers_roster/        # Roster 级法规（年度累计等）
│   ├── engine.py               # RuleEngine / RosterEngine（纯计算，无 IO）
│   ├── loader.py               # 规则配置加载 + 内存缓存
│   └── context.py              # RosterContext
└── __init__.py

engine-server/                  # FastAPI 服务（单一实例）
├── services/
│   └── rule_engine_service.py  # active_groups 管理 + roster_snapshot 维护
├── routes/
│   ├── check.py                # POST /api/rules/check（HTTP 供 live-server 调用）
│   └── config.py               # GET /api/rules/config（PO/RO 启动时读取）
├── workers/
│   └── violation_worker.py     # Redis 订阅 + 重算 + UPSERT
└── main.py
```

---

## 六、rule_violation 表设计

### 表结构

```sql
CREATE TABLE rule_violation (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- 关联实体
  crew_id         varchar(20)   NOT NULL,
  pairing_id      bigint,                  -- NULL 表示 roster 级别违规
  duty_seq        smallint,

  -- 法规标识
  rule_group_code varchar(50)   NOT NULL,  -- 'ccar121_gantt' / 'custom_003' 等
  rule_code       varchar(50)   NOT NULL,

  -- 时间范围（Gantt 视图窗口与此字段求交集决定是否展示）
  start_dt        timestamptz   NOT NULL,
  end_dt          timestamptz   NOT NULL,

  -- 违规内容
  severity        smallint      NOT NULL,  -- 1=INFO  2=WARNING  3=ERROR
  actual_value    numeric,
  limit_value     numeric,
  unit            varchar(20),
  message         text          NOT NULL,

  -- 重算控制
  input_hash      varchar(64),             -- 输入数据 hash，相同则跳过重算
  computed_at     timestamptz   NOT NULL DEFAULT now(),

  -- 审计
  created_by      varchar(50)   NOT NULL DEFAULT 'system',
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_by      varchar(50)   NOT NULL DEFAULT 'system',
  updated_at      timestamptz   NOT NULL DEFAULT now()
) PARTITION BY RANGE (start_dt);

ALTER TABLE rule_violation
  ADD CONSTRAINT uq_rule_violation
  UNIQUE (crew_id, pairing_id, duty_seq, rule_group_code, rule_code);
```

### 索引

```sql
CREATE INDEX idx_rv_crew_group_time
  ON rule_violation (crew_id, rule_group_code, start_dt, end_dt);

CREATE INDEX idx_rv_pairing
  ON rule_violation (pairing_id)
  WHERE pairing_id IS NOT NULL;
```

### start_dt / end_dt 语义

| 法规类型 | start_dt | end_dt |
|---|---|---|
| FDP 超限 | duty 报到时间 | duty 结束时间 |
| 最小休息不足 | 前 duty 结束 | 后 duty 报到 |
| 7/28/365 天累计超限 | 触发超限的 pairing 开始 | 该 pairing 结束 |
| Roster 级违规（整月） | 当月 1 日 | 当月末日 |

### Gantt 查询

```sql
SELECT * FROM rule_violation
WHERE crew_id = ANY($crew_ids)
  AND rule_group_code = $group_code
  AND start_dt < $view_end
  AND end_dt   > $view_start
ORDER BY crew_id, start_dt;
```

---

## 七、持久化事件日志（roster_event 表）

```sql
CREATE TABLE roster_event (
  event_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  airline     char(2)       NOT NULL,
  topic       varchar(50)   NOT NULL,
  event_type  varchar(50)   NOT NULL,
  entity_type varchar(30)   NOT NULL,
  entity_id   bigint        NOT NULL,
  ref         jsonb,                    -- { "pairing_id": 16, "crew_ids": [101, 102] }
  created_at  timestamptz   NOT NULL DEFAULT now(),
  created_by  varchar(50)   NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_roster_event_airline_id ON roster_event (airline, event_id);
CREATE INDEX idx_roster_event_created_at ON roster_event (created_at);
```

Rule Engine 重启后按 `event_id` 追读漏掉的事件，roster_event 保留 7 天。

---

## 八、实时同步数据流

### 排班变更触发链

```
用户保存修改（POST /api/roster/pairing/16）
  │
  ▼
live-server（DB 原子事务）
  ① UPDATE pairing
  ② INSERT roster_event → event_id = 1043
  COMMIT
  │
  └─ PUBLISH Redis: roster:F8 → "1043"

Rule Engine（Redis 订阅者）
  收到 "1043"
  → GET /api/events/1043 → { pairingId:16, crewIds:[101,102] }
  → 更新 roster_snapshot
  → for each active groupCode with clients:
       重算 crew 101, 102 的违规
       UPSERT rule_violation
       PUBLISH violations:F8:{groupCode} → "1043"

live-server（violations 订阅者）
  收到 violations:F8:ccar121_gantt → "1043"
  → 只推给 groupCode='ccar121_gantt' 的 WS 客户端

Gantt 客户端
  收到 { type:'violations.updated', eventId:1043 }
  → GET /api/violations?groupCode=...&crewIds=...&viewStart=...&viewEnd=...
  → 刷新 Canvas 告警
```

### 序列图

```
用户A       live-server    roster_event   Redis           Rule Engine    Gantt B
 │               │               │           │                  │            │
 │── POST ──────→│               │           │                  │            │
 │               │── INSERT ────→│           │                  │            │
 │               │←── id=1043 ───│           │                  │            │
 │               │── PUBLISH ───────────────→│                  │            │
 │←── 200 OK ────│               │           │── '1043' ───────→│            │
 │               │               │           │                  │── GET ─────│
 │               │               │           │                  │   event    │
 │               │               │           │                  │── UPSERT ──│
 │               │               │           │                  │   violations
 │               │               │           │←─ PUBLISH ───────│            │
 │               │←── violations ────────────│                  │            │
 │               │── WS push ──────────────────────────────────────────────→│
 │               │               │           │                  │── 拉取 ───→│
 │               │               │           │                  │←── 告警 ───│
```

---

## 九、无遗漏消息协议（Late Joiner）

### Gantt 打开时的握手

```
Step 1  建立 WS 连接
        Server 握手响应：{ type:'connected', lastEventId:1042 }
        客户端记录 anchorEventId = 1042

Step 2  发起 HTTP 快照请求（此期间 WS 仍接收，消息先 buffer）

Step 3  快照返回，应用数据
        处理 buffer 中 eventId > 1042 的消息
        之后正常接收 WS 推送
```

### 断线重连追读

```
断线时 lastEventId = 1050，重连时 lastEventId = 1065
→ GET /api/events?after=1050&airline=F8
→ 追读 1051~1065，处理完毕切换正常模式
```

---

## 十、告警显示窗口 vs 计算窗口

```
展示窗口 = 当前月 ±1 月（Gantt UI，用于 SQL 过滤 start_dt/end_dt）
计算窗口 = 过去 365 天（Rule Engine 内部，保证年度累计法规准确）
```

| 法规 | 计算所需历史 |
|---|---|
| FDP、最小休息 | 当天 / 相邻 duty |
| 7 天累计飞行 | 过去 7 天 |
| 28 天累计飞行 | 过去 28 天 |
| 年度累计飞行（CCAR 1000h）| 过去 365 天 |

---

## 十一、大数据量性能策略

### 规模估算

```
5000 机组 × 30 违规/人 × 活跃法规集数 = 约 15 万行（活跃期）
3 年历史初始化 → 约 200~400 万行（按月分区后每分区 < 20 万行）
```

### 分区与清理

```sql
-- 按月 RANGE 分区，默认 3 个月视图只扫 3 个分区
-- 超过保留期直接 DROP 分区（毫秒级）
DROP TABLE rule_violation_2024_01;
```

### 分级计算频率

| 场景 | 写入量 | 策略 |
|---|---|---|
| 单次 pairing 修改 | 1–4 crew × 活跃 groupCode 数 | 同步，< 200ms |
| 批量导入 500 航班 | 50–200 crew | Redis 队列分批，不阻塞 HTTP |
| 夜间兜底刷新 | dirty crew 集合 | 凌晨 02:00，限速 100 crew/分钟 |
| 3 年历史初始化 | 5000 crew | 独立任务，断点续传，限速 |

---

## 十二、PO/RO/TO 法规对接

```python
# 优化启动时一次性读取（HTTP，只调一次）
config = requests.get(
    'http://localhost:3011/api/rules/config?groupCode=ccar121_po'
).json()

# 转化为 OR-Tools 约束（本地，无网络）
model.Add(duty_end - duty_start <= config['max_fdp_minutes'])
model.Add(next_start - duty_end >= config['min_rest_minutes'])

# 求解，输出方案已 100% 合规
```

---

## 十三、Per-User 会话违规隔离（Undo/Redo 实时检查）

### 背景与问题

用户在 Gantt 中编辑排班时，每一步操作（包括 undo/redo）都需要实时法规检查。
这些检查结果在**保存入库前只属于当前用户**，不应推送给其他客户端，也不应写入 rule_violation 表。

### 双层违规模型

```
层 1 — 持久化违规（rule_violation 表）
  来源：数据保存入库后，rule engine 全量重算
  可见性：所有客户端共享
  生命周期：长期持久

层 2 — 会话违规（rule engine 内存，per-user）
  来源：用户每步 undo/redo 触发的实时检查
  可见性：仅当前用户本人
  生命周期：会话期间；保存后转为持久化；放弃编辑后丢弃
```

**前端显示：会话违规覆盖持久化违规**

```
用户看到的告警 = 持久化违规（base）← 会话违规（overlay）

· 被编辑的 pairing → 用会话违规结果（以会话为准，无论多少）
· 未被编辑的 pairing → 直接用持久化违规
· 会话违规为空（edit 修复了违规）→ 屏蔽该 pairing 的持久化违规
```

### 为什么 Rule Engine 需要维护会话状态

法规中有**累计类规则**（28 天、365 天飞行时间），需要 crew 的完整排班历史作为上下文。

```
用户 A 编辑（未保存）Pairing #16（crew_101 的某执勤日）
  → 检查"28 天累计飞行时间"需要 crew_101 近 28 天所有 pairing
  → 若 rule engine 只用 roster_snapshot（已入库），#16 仍是旧版本 → 结果不准确

解决方案：
  rule engine 为每个用户维护 session_overlay
  effective_roster = roster_snapshot（base）+ session_overlay[userId]（增量）
  用 effective_roster 作为累计计算的上下文，结果准确
```

### Rule Engine 新增会话层

```python
@dataclass
class UserSession:
    user_id:            str
    group_code:         str
    # 只存被用户改动的 pairing（增量），非全量排班
    roster_overlay:     dict[int, PairingInput]    # pairingId → 未保存状态
    # 会话计算出的违规，不入库，仅返回给该用户
    session_violations: dict[int, list[Violation]] # pairingId → violations
    last_active:        datetime
    ttl_minutes:        int = 120   # 2 小时无操作自动清理

class RuleEngineService:
    # 已有状态
    active_groups:    dict[str, ActiveGroupState]
    roster_snapshot:  dict[str, CrewRoster]     # 已入库排班（所有 group 共用）

    # 新增：per-user 会话
    user_sessions:    dict[str, UserSession]    # userId → session
```

### 会话内实时检查接口

```
POST /api/rules/check/session

请求体：
{
  "sessionId":  "user-A-sess-001",
  "userId":     "user-A",
  "groupCode":  "ccar121_gantt",
  "operation":  "edit" | "undo" | "redo",
  "pairing":    { ... },   // 当前操作后的 pairing 完整状态
  "crew":       { ... }
}

响应（仅返回给当前用户，不广播）：
{
  "sessionId":       "user-A-sess-001",
  "pairingId":       16,
  "violations":      [...],
  "passedAll":       false,
  "highestSeverity": 3
}
```

### Rule Engine 处理逻辑

```python
async def check_session(self, req: SessionCheckRequest) -> SessionCheckResponse:
    session = self._get_or_create_session(req.user_id, req.group_code)

    # undo 到初始状态：从 overlay 移除，恢复用 roster_snapshot
    if req.operation == 'undo' and req.pairing is None:
        session.roster_overlay.pop(req.pairing_id, None)
    else:
        # edit / redo / undo 到中间状态：更新 overlay
        session.roster_overlay[req.pairing.pairing_id] = req.pairing

    # 构建有效排班：base + 用户当前会话 overlay
    effective_roster = self._merge_roster(
        base=self.roster_snapshot,
        overlay=session.roster_overlay
    )

    # 用 effective_roster 作上下文，检查当前 pairing
    rules = await self.rule_loader.load_rules(req.group_code)
    violations = self.engine.check_with_rules(
        req.pairing, req.crew, rules, context=effective_roster
    )

    # 存入会话（不入库，不推送其他客户端）
    session.session_violations[req.pairing.pairing_id] = violations
    session.last_active = datetime.now()

    return SessionCheckResponse(
        session_id=req.session_id,
        pairing_id=req.pairing.pairing_id,
        violations=violations
    )
```

### 前端防抖控制

```typescript
// 每步 undo/redo 后防抖 300ms 再触发检查（避免连续操作打爆服务）
const checkSession = useDebouncedCallback(async (pairing: Pairing, op: Operation) => {
  const result = await ruleApi.checkSession({
    sessionId: currentSessionId,
    userId:    currentUser.id,
    groupCode: selectedGroupCode,
    operation: op,
    pairing,
    crew: crewInfo
  })
  // 更新前端 session violations store（仅当前用户可见）
  sessionViolationStore.set(pairing.pairingId, result.violations)
}, 300)
```

### 前端违规显示合并

```typescript
// displayViolations = persistedViolations（base）← sessionViolations（overlay）
const displayViolations = computed(() => {
  const merged = new Map(persistedViolations)   // 从 rule_violation 表加载

  for (const [pairingId, sessionVios] of sessionViolationStore) {
    // 被编辑的 pairing：完全用会话结果替换（含"清空"的情况）
    merged.set(pairingId, sessionVios)
  }

  return merged   // Canvas 渲染此结果
})
```

### 保存入库时的提交流程

```
用户点击保存

Step 1  live-server 接收 POST /api/roster/pairing/16
         DB 事务：UPDATE pairing + INSERT roster_event → event_id = 1044
         COMMIT

Step 2  通知 Rule Engine 提交会话
         POST /api/rules/session/commit { sessionId, userId, eventId: 1044 }

Step 3  Rule Engine 处理：
         ① 将 session_overlay[userId] 合并到 roster_snapshot（更新 base）
         ② 将 session_violations[userId] UPSERT 到 rule_violation 表
         ③ 清空该用户的 session_overlay 和 session_violations
         ④ PUBLISH violations:{airline}:{groupCode} → "1044"（推送其他客户端）

Step 4  其他 Gantt 客户端收到推送
         → 拉取 rule_violation 更新 → 刷新持久化违规显示

Step 5  当前用户 Gantt
         → sessionViolations 清空（已提交）
         → persistedViolations 重新拉取（已含最新结果）
         → displayViolations 恢复为纯持久化层
```

### 放弃编辑时的清理

```
用户点击放弃 / 关闭页面 / 会话超时（TTL 120 分钟）

POST /api/rules/session/discard { sessionId, userId }

Rule Engine：
  del user_sessions[userId].roster_overlay     # 不更新 roster_snapshot
  del user_sessions[userId].session_violations  # 不入库
  # 其他客户端不收到任何推送（无数据变化入库）

Gantt 前端：
  sessionViolationStore.clear()
  displayViolations 退回为纯持久化违规
```

### 完整会话隔离状态图

```
Rule Engine 内存：

roster_snapshot（base，已入库）：
  crew_101: [pairing_10, pairing_16(saved-v1), pairing_20]
  crew_102: [pairing_05, pairing_08]

user_sessions：
  user-A:
    roster_overlay:     { 16: pairing_16(unsaved-v2) }
    session_violations: { 16: [violation_fdp_exceed] }   ← 仅 A 可见

  user-B:
    roster_overlay:     { 20: pairing_20(unsaved-v3) }
    session_violations: { 20: [] }                       ← 仅 B 可见，修改后合规

user-A 的 effective_roster：
  crew_101: [pairing_10, pairing_16(v2←overlay), pairing_20]
                                  ↑ overlay 覆盖 base

user-B 的 effective_roster：
  crew_101: [pairing_10, pairing_16(v1←base), pairing_20(v3←overlay)]
                                  ↑ base（A 未保存，B 看不到 A 的修改）
```

### 会话内存估算

```
1 个 session_overlay：平均 5 个 pairing × 10KB = 约 50KB / 用户
100 个并发用户 → 约 5MB，可接受
TTL 定时清理（每 10 分钟扫描一次过期会话）
```

---

## 十四、待决策与待实现事项

| 优先级 | 事项 | 说明 |
|---|---|---|
| P0 | 建 `rule_violation` 表（含月分区） | 存量告警显示的前提 |
| P0 | 建 `roster_event` 表 | 无遗漏消息保障的前提 |
| P0 | 法规引擎 Python 版骨架（翻译 TS 逻辑） | 解锁 PO/RO/TO 方法调用 |
| P0 | Rule Engine 单一服务（active_groups 管理） | 替代已废弃的双服务设计 |
| P0 | Rule Engine 订阅 roster Redis → 重算 → UPSERT | 核心持久化数据流 |
| P0 | Rule Engine `user_sessions` 层（session_overlay + session_violations）| Per-user 会话隔离前提 |
| P0 | `POST /api/rules/check/session` 接口 | Undo/Redo 每步实时检查 |
| P0 | `POST /api/rules/session/commit` 接口 | 保存时将会话违规提交入库并推送他人 |
| P0 | `POST /api/rules/session/discard` 接口 | 放弃编辑时清理会话状态 |
| P1 | live-server WS 握手返回 lastEventId | Late Joiner 协议前提 |
| P1 | live-server clientSessions 按 groupCode 路由推送 | 多法规集客户端隔离 |
| P1 | Gantt 前端 GanttSyncManager（buffer 协议） | Late Joiner 无遗漏 |
| P1 | Gantt 前端 sessionViolationStore + displayViolations 合并逻辑 | 会话覆盖持久化显示 |
| P1 | Gantt 前端 undo/redo 300ms 防抖触发 checkSession | 性能保护 |
| P1 | 告警变更推送（violations 频道 → WS 广播） | Gantt 实时告警刷新 |
| P1 | 3 年历史告警初始化 BullMQ 任务（限速+断点） | 存量数据上线 |
| P2 | 月分区自动创建定时任务 | 每月提前建下月分区 |
| P2 | active_groups TTL 回收逻辑 | 避免法规集内存泄漏 |
| P2 | user_sessions TTL 回收（120 分钟，每 10 分钟扫描） | 避免会话内存泄漏 |
| P2 | 旧分区定时清理（> 2 年 DROP） | 控制数据量 |
| P2 | input_hash 去重（相同输入跳过重算） | 减少无效计算 |
| P2 | CLAUDE.md 中服务拓扑描述修正 | 文档准确性 |
