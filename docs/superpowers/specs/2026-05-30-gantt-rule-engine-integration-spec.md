# Gantt × Rule Engine 全链路集成设计规范

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将法规告警系统从无状态批量检查模式改造为实时持久化推送架构——Rule Engine 作为单一 Python 服务常驻，监听排班变更、维护持久化告警、实现 per-user 会话隔离，Gantt 通过 WebSocket 接收实时推送后按需拉取告警数据。

**Architecture:** 单一 Rule Engine 服务（Python FastAPI，port 3011）+ 持久化 `rule_violation` 表（月分区）+ Redis Pub/Sub 双频道（`roster:{airline}` + `violations:{airline}:{groupCode}`）+ live-server WS Hub 路由推送 + Gantt 前端 sessionViolationStore 覆盖层。

**Tech Stack:** Python 3.12 / FastAPI / pydantic-v2（rule engine）；TypeScript / Fastify / Drizzle（live-server）；React 19 / Zustand / Zustand devtools（gantt frontend）；PostgreSQL 16 分区表；Redis Pub/Sub。

**Scope:** `engine-server/`（Rule Engine Service）、`live-server/`（WS Hub、clientSessions、violations 路由）、`sql/`（rule_violation + roster_event 表）、`gantt/src/`（sessionViolationStore、displayViolations、undo/redo 防抖）。

---

## 背景与问题

当前 Gantt 法规检查为请求-响应模式：前端发 `/check/batch` → 规则引擎返回结果 → 前端临时展示。  
问题：结果不持久、多客户端不同步、undo/redo 每步检查开销大、PO/RO 引擎无法 import TypeScript 包。

本设计解决以下问题：

1. **持久化告警**：告警写入 `rule_violation` 表，所有客户端按需拉取，断线重连无需重算
2. **实时推送**：排班变更 → Rule Engine 重算 → Redis → live-server → WS 推送，< 200ms
3. **多法规集隔离**：动态 groupCode，按需加载；每个客户端只收到自己法规集的推送
4. **Per-User 会话隔离**：undo/redo 实时检查结果仅当前用户可见，不影响其他客户端
5. **Python 统一生态**：Rule Engine 迁移至 Python，PO/RO/TO 直接 `import rois_rule_engine`

---

## 架构全景

```
┌────────────────────────────────────────────────────────────────┐
│  客户端层                                                       │
│  Gantt A (ccar121_gantt) / Gantt B (custom_003)                │
│  PBS Portal (ccar121_pbs)                                       │
│  均通过 WebSocket 连接 live-server                              │
└────────────────────────┬───────────────────────────────────────┘
                         │ WebSocket（单一 Hub）
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  live-server（Fastify + WS Hub）                                │
│  · 接收排班操作 → DB 写入 + roster_event 写入                  │
│  · Redis PUBLISH roster:{airline}                              │
│  · 维护 clientSessions：clientId → { groupCode, airline }     │
│  · 订阅 violations:{airline}:{groupCode} → 按 groupCode 路由  │
└─────────┬──────────────────────┬──────────────────────────────┘
          │ PostgreSQL           │ Redis Pub/Sub
          ▼                     ▼
┌──────────────────┐  ┌──────────────────────────────────────────┐
│  roster_event 表  │  │  roster:{airline}                        │
│  (持久化事件日志) │  │  violations:{airline}:{groupCode}        │
│  event_id 单调↑  │  │  (groupCode 动态，按需创建)              │
└──────────────────┘  └────────────────────────┬─────────────────┘
          │                                    │ 订阅
          │ 兜底追读（重启按 event_id 追读）    ▼
          └────────────────→ ┌────────────────────────────────────┐
                             │  Rule Engine Service（单一部署）   │
                             │  Python FastAPI  port 3011         │
                             │                                    │
                             │  roster_snapshot（共用）           │
                             │  rule_cache { groupCode→rules }   │
                             │  active_groups { groupCode→state } │
                             │  user_sessions { userId→session }  │
                             │                                    │
                             │  PINNED: ccar121_gantt, ccar121_pbs│
                             │  按需激活: custom_003, ...         │
                             └────────────────────────────────────┘
```

---

## 一、数据库设计

### 1.1 `rule_violation` 表（月分区）

```sql
CREATE TABLE rule_violation (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- 关联实体
  crew_id         varchar(20)   NOT NULL,
  pairing_id      bigint,                  -- NULL = roster 级别违规
  duty_seq        smallint,

  -- 法规标识
  rule_group_code varchar(50)   NOT NULL,  -- 'ccar121_gantt' / 'custom_003' 等
  rule_code       varchar(50)   NOT NULL,

  -- 时间范围（与 Gantt 视图窗口求交集决定是否展示）
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

  -- 审计（必须）
  created_by      varchar(50)   NOT NULL DEFAULT 'system',
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_by      varchar(50)   NOT NULL DEFAULT 'system',
  updated_at      timestamptz   NOT NULL DEFAULT now()
) PARTITION BY RANGE (start_dt);

-- 唯一约束（支持 UPSERT）
ALTER TABLE rule_violation
  ADD CONSTRAINT uq_rule_violation
  UNIQUE (crew_id, pairing_id, duty_seq, rule_group_code, rule_code);

-- 索引
CREATE INDEX idx_rv_crew_group_time
  ON rule_violation (crew_id, rule_group_code, start_dt, end_dt);

CREATE INDEX idx_rv_pairing
  ON rule_violation (pairing_id)
  WHERE pairing_id IS NOT NULL;
```

**`start_dt` / `end_dt` 语义：**

| 法规类型 | start_dt | end_dt |
|---|---|---|
| FDP 超限 | duty 报到时间 | duty 结束时间 |
| 最小休息不足 | 前 duty 结束 | 后 duty 报到 |
| 7/28/365 天累计超限 | 触发超限 pairing 开始 | 该 pairing 结束 |
| Roster 级违规（整月） | 当月 1 日 | 当月末日 |

**Gantt 查询（展示窗口 = 当前月 ±1 月）：**

```sql
SELECT * FROM rule_violation
WHERE crew_id = ANY($crew_ids)
  AND rule_group_code = $group_code
  AND start_dt < $view_end
  AND end_dt   > $view_start
ORDER BY crew_id, start_dt;
```

### 1.2 `roster_event` 表

```sql
CREATE TABLE roster_event (
  event_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  airline     char(2)       NOT NULL,
  topic       varchar(50)   NOT NULL,
  event_type  varchar(50)   NOT NULL,
  entity_type varchar(30)   NOT NULL,
  entity_id   bigint        NOT NULL,
  ref         jsonb,        -- { "pairing_id": 16, "crew_ids": [101, 102] }
  created_at  timestamptz   NOT NULL DEFAULT now(),
  created_by  varchar(50)   NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_roster_event_airline_id ON roster_event (airline, event_id);
CREATE INDEX idx_roster_event_created_at ON roster_event (created_at);
```

- Rule Engine 重启后按 `event_id` 追读漏掉的事件
- `roster_event` 保留 7 天，超期行可定期清理（不 DROP 分区）

---

## 二、Rule Engine Service（Python FastAPI）

### 2.1 代码结构

```
engine-server/
├── services/
│   └── rule_engine_service.py   # active_groups + user_sessions + roster_snapshot
├── routes/
│   ├── check.py                 # POST /api/rules/check, /check/session
│   ├── session.py               # POST /api/rules/session/commit, /discard
│   └── config.py                # GET /api/rules/config（PO/RO 启动读取）
├── workers/
│   └── violation_worker.py      # Redis 订阅 + 重算 + UPSERT
└── main.py

rois-rule-engine/                # pip 包（Python）
├── rule_engine/
│   ├── calculators/             # FDP、休息时间、累计工时（从 TS 版翻译）
│   ├── checkers/                # 各项法规检查
│   ├── checkers_roster/         # Roster 级法规（年度累计等）
│   ├── engine.py                # RuleEngine / RosterEngine（纯计算，无 IO）
│   ├── loader.py                # 规则配置加载 + 内存缓存
│   └── context.py               # RosterContext
└── __init__.py
```

### 2.2 服务内部状态模型

```python
@dataclass
class ActiveGroupState:
    clients:  set[str]          # 在线客户端 ID 集合
    rules:    list[Rule]        # 已加载的规则列表
    pinned:   bool = False      # 常驻，不回收
    ttl_task: asyncio.Task | None = None  # 回收倒计时任务

@dataclass
class UserSession:
    user_id:             str
    group_code:          str
    roster_overlay:      dict[int, PairingInput]    # pairingId → 未保存状态
    session_violations:  dict[int, list[Violation]] # pairingId → violations（不入库）
    last_active:         datetime
    ttl_minutes:         int = 120

class RuleEngineService:
    active_groups:    dict[str, ActiveGroupState]
    roster_snapshot:  dict[str, CrewRoster]   # 共用，全法规集共享同一份排班数据
    rule_cache:       dict[str, list[Rule]]   # per-groupCode
    user_sessions:    dict[str, UserSession]  # userId → session

# 启动时 PINNED_GROUPS = ['ccar121_gantt', 'ccar121_pbs']
```

**核心洞察：** `roster_snapshot` 在所有 groupCode 中共用，只有 `rule_cache` 按 groupCode 独立。

### 2.3 多法规集动态管理

**冷启动流程（用户首次选择 custom_003）：**

```
Step 1  Gantt 发送 WS: { type: 'set_rule_group', groupCode: 'custom_003', clientId: 'client-B' }
Step 2  live-server 更新 clientSessions，通知 Rule Engine: activate custom_003 for client-B
Step 3  Rule Engine:
          custom_003 不在 active_groups → DB 加载规则（~50ms）
          active_groups['custom_003'] = { clients: {'client-B'} }
          用当前 roster_snapshot 全量计算 custom_003 违规
          UPSERT rule_violation WHERE rule_group_code='custom_003'
          PUBLISH violations:{airline}:custom_003
Step 4  live-server → WS 推送 → client-B 拉取告警

首次冷启动延迟：~50ms（DB 读规则）+ ~300–500ms（全量计算）
```

**法规集回收（TTL 30 分钟）：**

```python
if len(active_groups[group_code].clients) == 0 and group_code not in PINNED_GROUPS:
    # 启动 30 分钟倒计时，期间重连则取消
    # rule_violation 表数据保留，重连后立即展示
```

**切换法规集：**

```
WS: { type: 'change_rule_group', from: 'custom_003', to: 'custom_007' }
→ live-server: deactivate custom_003 for client-B; activate custom_007 for client-B
→ Rule Engine 按需加载 custom_007 → 计算 → PUBLISH violations:{airline}:custom_007
→ client-B 收到 custom_007 告警，刷新显示
```

### 2.4 排班变更时只重算活跃法规集

```python
async def on_roster_event(self, event: RosterEvent):
    affected_crews = event.ref['crew_ids']
    for group_code, state in self.active_groups.items():
        if not state.clients:       # 无客户端连接，跳过
            continue
        violations = await self.recompute(group_code, state.rules, affected_crews)
        await self.upsert_violations(violations)
        await self.redis.publish(f'violations:{event.airline}:{group_code}', event.event_id)
```

---

## 三、Per-User 会话违规隔离（Undo/Redo 实时检查）

### 3.1 双层违规模型

```
层 1 — 持久化违规（rule_violation 表）
  来源：数据保存入库后，Rule Engine 全量重算
  可见性：所有客户端共享
  生命周期：长期持久

层 2 — 会话违规（Rule Engine 内存，per-user）
  来源：用户每步 undo/redo 触发的实时检查
  可见性：仅当前用户
  生命周期：保存后转持久化；放弃编辑后丢弃
```

**前端显示规则：**

- 被编辑的 pairing → 使用会话违规覆盖（含"已修复 = 空列表"情况）
- 未被编辑的 pairing → 直接用持久化违规
- `displayViolations = persistedViolations(base) ← sessionViolations(overlay)`

### 3.2 会话内实时检查接口

```
POST /api/rules/check/session

请求体：
{
  "sessionId":  "user-A-sess-001",
  "userId":     "user-A",
  "groupCode":  "ccar121_gantt",
  "operation":  "edit" | "undo" | "redo",
  "pairing":    { ... },   // 当前操作后的 pairing 完整状态（undo 到初始传 null）
  "crew":       { ... }
}

响应（仅返回给当前用户，不广播，不入库）：
{
  "sessionId":       "user-A-sess-001",
  "pairingId":       16,
  "violations":      [...],
  "passedAll":       false,
  "highestSeverity": 3
}
```

**服务端处理逻辑：**

```python
async def check_session(self, req: SessionCheckRequest) -> SessionCheckResponse:
    session = self._get_or_create_session(req.user_id, req.group_code)

    if req.operation == 'undo' and req.pairing is None:
        session.roster_overlay.pop(req.pairing_id, None)  # 恢复为 base
    else:
        session.roster_overlay[req.pairing.pairing_id] = req.pairing

    effective_roster = self._merge_roster(
        base=self.roster_snapshot,
        overlay=session.roster_overlay
    )
    rules = await self.rule_loader.load_rules(req.group_code)
    violations = self.engine.check_with_rules(
        req.pairing, req.crew, rules, context=effective_roster
    )
    session.session_violations[req.pairing.pairing_id] = violations
    session.last_active = datetime.now()
    return SessionCheckResponse(...)
```

### 3.3 会话提交接口（保存入库时）

```
POST /api/rules/session/commit
{ "sessionId": "...", "userId": "user-A", "eventId": 1044 }

Rule Engine:
  ① session_overlay 合并到 roster_snapshot（更新 base）
  ② session_violations UPSERT 到 rule_violation 表
  ③ 清空该用户的 session_overlay 和 session_violations
  ④ PUBLISH violations:{airline}:{groupCode} → "1044"（推送其他客户端）
```

### 3.4 会话丢弃接口（放弃编辑时）

```
POST /api/rules/session/discard
{ "sessionId": "...", "userId": "user-A" }

Rule Engine:
  del user_sessions[userId].roster_overlay      # 不更新 roster_snapshot
  del user_sessions[userId].session_violations   # 不入库，不推送
```

### 3.5 会话内存估算

```
1 session_overlay：平均 5 pairing × 10KB = ~50KB / 用户
100 并发用户 → ~5MB，可接受
TTL 120 分钟，每 10 分钟扫描清理
```

---

## 四、实时同步数据流

### 4.1 排班变更触发链

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

### 4.2 live-server clientSessions 路由

```typescript
// live-server 内存
const clientSessions = new Map<string, { groupCode: string; airline: string }>()

// violations 推送路由：只推给 groupCode 匹配的客户端
redis.subscribe(`violations:${airline}:${groupCode}`, (eventId) => {
  for (const [clientId, session] of clientSessions) {
    if (session.groupCode === groupCode && session.airline === airline) {
      ws.send(clientId, { type: 'violations.updated', eventId })
    }
  }
})
```

---

## 五、无遗漏消息协议（Late Joiner）

### 5.1 Gantt 打开时握手

```
Step 1  建立 WS 连接
        Server: { type:'connected', lastEventId:1042 }
        客户端记录 anchorEventId = 1042

Step 2  HTTP 快照请求（此期间 WS 消息先 buffer）

Step 3  快照返回，应用数据
        处理 buffer 中 eventId > 1042 的消息
        之后正常接收推送
```

### 5.2 断线重连追读

```
断线时 lastEventId=1050，重连时 lastEventId=1065
→ GET /api/events?after=1050&airline=F8
→ 追读 1051~1065，处理完毕切换正常模式
```

---

## 六、Gantt 前端改造

### 6.1 违规 Store 设计

```typescript
// gantt/src/stores/violation-store.ts
interface ViolationStore {
  // 持久化违规（来自 rule_violation 表）
  persistedViolations: Map<number, Violation[]>   // pairingId → violations
  // 会话违规（undo/redo 实时结果，仅当前用户）
  sessionViolations:   Map<number, Violation[]>
  // 合并结果（Canvas 渲染用）
  displayViolations:   Map<number, Violation[]>   // computed
}

// displayViolations 计算规则
const displayViolations = computed(() => {
  const merged = new Map(persistedViolations)
  for (const [pairingId, sessionVios] of sessionViolationStore) {
    merged.set(pairingId, sessionVios)  // 会话覆盖持久化（含空列表）
  }
  return merged
})
```

### 6.2 undo/redo 防抖触发

```typescript
// gantt/src/hooks/use-rule-check-session.ts
const checkSession = useDebouncedCallback(async (pairing: Pairing, op: Operation) => {
  const result = await ruleApi.checkSession({
    sessionId: currentSessionId,
    userId:    currentUser.id,
    groupCode: selectedGroupCode,
    operation: op,
    pairing,
    crew:      crewInfo
  })
  sessionViolationStore.set(pairing.pairingId, result.violations)
}, 300)  // 防抖 300ms，避免连续操作打爆服务
```

### 6.3 法规集切换 WS 消息

```typescript
// 用户切换法规集下拉
function handleGroupChange(newGroupCode: string) {
  ws.send({ type: 'change_rule_group', from: selectedGroupCode, to: newGroupCode })
  setSelectedGroupCode(newGroupCode)
  sessionViolationStore.clear()  // 清空旧会话
}
```

---

## 七、PO/RO/TO 法规对接

优化引擎在启动时一次性读取法规配置（HTTP，只调一次）：

```python
# PO/RO/TO 引擎启动时
config = requests.get(
    'http://localhost:3011/api/rules/config?groupCode=ccar121_po'
).json()

# 转化为 OR-Tools 约束（本地，无网络）
model.Add(duty_end - duty_start <= config['max_fdp_minutes'])
model.Add(next_start - duty_end >= config['min_rest_minutes'])
# 求解，输出方案已 100% 合规
```

PO/RO/TO 是 engine-server 按需启动的优化任务，不是长驻服务，不需要独立法规服务进程。

---

## 八、性能策略

### 8.1 规模估算

```
5000 机组 × 30 违规/人 × 活跃法规集数 = ~15 万行（活跃期）
3 年历史初始化 → ~200–400 万行（按月分区，每分区 < 20 万行）
```

### 8.2 分级计算频率

| 场景 | 写入量 | 策略 |
|---|---|---|
| 单次 pairing 修改 | 1–4 crew × 活跃 groupCode 数 | 同步，< 200ms |
| 批量导入 500 航班 | 50–200 crew | Redis 队列分批，不阻塞 HTTP |
| 夜间兜底刷新 | dirty crew 集合 | 凌晨 02:00，限速 100 crew/分钟 |
| 3 年历史初始化 | 5000 crew | 独立 BullMQ 任务，断点续传，限速 |

### 8.3 告警显示窗口 vs 计算窗口

```
展示窗口 = 当前月 ±1 月（SQL 过滤 start_dt/end_dt）
计算窗口 = 过去 365 天（Rule Engine 内部，保证年度累计准确）
```

---

## 九、实施优先级

### P0（阻塞后续所有工作）

- [ ] 建 `rule_violation` 表（含月分区） — `sql/schema/`
- [ ] 建 `roster_event` 表 — `sql/schema/`
- [ ] 法规引擎 Python 版骨架（翻译现有 TS 逻辑）— `rois-rule-engine/`
- [ ] Rule Engine 单一服务（active_groups + roster_snapshot 管理）— `engine-server/services/rule_engine_service.py`
- [ ] Rule Engine 订阅 `roster:` Redis → 重算 → UPSERT — `engine-server/workers/violation_worker.py`
- [ ] Rule Engine `user_sessions` 层（session_overlay + session_violations）
- [ ] `POST /api/rules/check/session` 接口
- [ ] `POST /api/rules/session/commit` 接口
- [ ] `POST /api/rules/session/discard` 接口

### P1（核心体验）

- [ ] live-server WS 握手返回 `lastEventId`
- [ ] live-server `clientSessions` 按 `groupCode` 路由推送
- [ ] Gantt 前端 `GanttSyncManager`（buffer 协议，Late Joiner）
- [ ] Gantt 前端 `sessionViolationStore` + `displayViolations` 合并逻辑
- [ ] Gantt 前端 undo/redo 300ms 防抖触发 `checkSession`
- [ ] 告警变更推送（violations 频道 → WS → 客户端拉取）
- [ ] 3 年历史告警初始化 BullMQ 任务（限速 + 断点续传）

### P2（稳定性与运维）

- [ ] 月分区自动创建定时任务（每月提前建下月分区）
- [ ] `active_groups` TTL 回收逻辑（避免法规集内存泄漏）
- [ ] `user_sessions` TTL 回收（120 分钟，每 10 分钟扫描）
- [ ] 旧分区定时清理（> 2 年 DROP）
- [ ] `input_hash` 去重（相同输入跳过重算）
- [ ] 更新 CLAUDE.md 服务拓扑描述（废弃双服务设计描述）

---

## 十、废弃设计（已明确不采用）

| 废弃设计 | 原因 |
|---|---|
| 双法规服务（port 3011 + 3012） | 用户可选动态法规集，无法在部署时穷举所有 groupCode |
| TypeScript Rule Engine | Python 直接 import，解锁 PO/RO/TO；OR-Tools 原生支持；FRMS/疲劳模型 |
| 无状态批量检查（/check/batch）替代持久化 | 结果不持久、多客户端不同步、undo/redo 每步开销高 |
| session 违规写入 rule_violation 表 | 未保存数据不应对其他客户端可见；保存时提交即转持久化 |
