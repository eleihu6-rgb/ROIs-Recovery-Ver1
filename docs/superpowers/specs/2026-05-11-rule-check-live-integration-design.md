# 法规检查与实时排班数据集成设计

**日期**：2026-05-11  
**模块**：live-server / rule-engine  
**状态**：待实现

---

## 1. 背景与目标

### 1.1 背景

法规引擎（`@rois/rule-engine`）已实现为无状态纯计算库，支持按 `ruleGroupCode` 加载法规集合并执行检查。当前 Gantt 仅在前端 session 内做实时草稿检查（结果不持久化），尚未建立与数据库的持久化违规结果体系。

### 1.2 目标

- 建立权威的法规检查结果持久化机制，供 Gantt、PBS、报表、移动端共享读取
- 支持历史排班数据（3年）的批量法规检查（4000 crew，约 500-600K pairing 记录）
- 支持实时排班变动的增量检查（毫秒级触发，不阻塞用户操作）
- 草稿状态（用户拖拽未提交）保持前端 session 级，不写入数据库

---

## 2. 核心设计决策

### 2.1 单一权威法规集

每个航司 schema 在 `dictionary` 表中配置一个默认法规集合：

```
dictionary.parent_code = 'RULE_CONFIG'
dictionary.code        = 'default_rule_group_code'
dictionary.value       = 'ccar121_gantt'  （按航司各自配置）
```

- 权威违规结果始终基于此默认法规集生成并持久化
- 用户在 Gantt 选择其他法规集进行"预览"属于 session-only 操作，不写 DB
- 这样确保违规数据只有一份，无跨用户同步问题

### 2.2 草稿违规 vs. 权威违规

| 维度 | 草稿违规 | 权威违规 |
|------|---------|---------|
| 触发时机 | 用户拖拽/修改（未提交） | 排班变动提交入库后 |
| 存储位置 | 前端 rule-check-store（内存） | `rule_check_result_pairing` / `_roster` 表 |
| 撤回处理 | 前端 store 恢复，DB 不受影响 | N/A |
| 用户提交后 | 被权威违规替换（WebSocket 推送） | 由 BullMQ worker 计算写入 |
| 跨用户可见 | 否 | 是 |
| 视觉区分 | 虚线铃铛（半透明） | 实线铃铛（正常颜色） |

### 2.3 两级检查

| 级别 | 引擎 | 粒度 | 处理规则 | 结果表 |
|------|------|------|---------|--------|
| Level 1 | `RuleEngine` | crew × pairing | FDP / 休息时间 / 资质 / 机组配置 | `rule_check_result_pairing` |
| Level 2 | `RosterEngine` | crew × 月份 | 连续执勤天数 / 滚动飞时精确计算 / 每周休息 | `rule_check_result_roster` |

Level 1 处理 pairing 内部规则，Level 2 处理跨 pairing 的滚动窗口规则。

---

## 3. 数据库表结构

### 3.1 Level 1：Pairing 级检查结果

```sql
CREATE TABLE rule_check_result_pairing (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  crew_id          varchar        NOT NULL,
  pairing_id       bigint         NOT NULL REFERENCES pairing(id),
  rule_group_code  varchar        NOT NULL,
  passed_all       boolean        NOT NULL,
  highest_severity smallint       NOT NULL DEFAULT 0,
  check_results    jsonb          NOT NULL DEFAULT '[]',
  calc_results     jsonb          NOT NULL DEFAULT '{}',
  checked_at       timestamptz    NOT NULL DEFAULT now(),
  created_by       varchar        NOT NULL DEFAULT 'system',
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_by       varchar        NOT NULL DEFAULT 'system',
  updated_at       timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (crew_id, pairing_id, rule_group_code)
);

CREATE INDEX ON rule_check_result_pairing (pairing_id, rule_group_code);
CREATE INDEX ON rule_check_result_pairing (crew_id, rule_group_code, checked_at);
```

**`check_results` JSONB 结构**：

```json
[
  {
    "templateCode": "max_fdp",
    "instanceCode": "max_fdp_std",
    "passed": false,
    "severity": 3,
    "actualValue": 840,
    "limitValue": 780,
    "unit": "minutes",
    "message": "FDP 14h00 exceeds limit 13h00",
    "dutySeq": 1
  }
]
```

**`calc_results` JSONB 结构**：

```json
{
  "fdp_calculator":         { "value": 840, "unit": "minutes" },
  "rest_calculator":        { "value": 600, "unit": "minutes" },
  "flight_hour_calculator": { "value": 360, "unit": "minutes" }
}
```

### 3.2 Level 2：Roster 月份级检查结果

```sql
CREATE TABLE rule_check_result_roster (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  crew_id          varchar        NOT NULL,
  rule_group_code  varchar        NOT NULL,
  result_month     char(7)        NOT NULL,  -- 'YYYY-MM'
  passed_all       boolean        NOT NULL,
  highest_severity smallint       NOT NULL DEFAULT 0,
  violations       jsonb          NOT NULL DEFAULT '[]',
  calc_summary     jsonb          NOT NULL DEFAULT '{}',
  checked_at       timestamptz    NOT NULL DEFAULT now(),
  created_by       varchar        NOT NULL DEFAULT 'system',
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_by       varchar        NOT NULL DEFAULT 'system',
  updated_at       timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (crew_id, rule_group_code, result_month)
);

CREATE INDEX ON rule_check_result_roster (crew_id, rule_group_code, result_month);
```

**`violations` JSONB 结构**（跨 pairing 违规含溯源）：

```json
[
  {
    "templateCode": "consecutive_duty_days",
    "severity": 2,
    "message": "9 consecutive duty days, limit 7",
    "pairingIds": [101, 102, 103],
    "dateRange": { "from": "2026-05-01", "to": "2026-05-09" },
    "actualValue": 9,
    "limitValue": 7
  },
  {
    "templateCode": "max_ft_28d",
    "severity": 2,
    "message": "105h flight time in 28 days, limit 100h",
    "pairingIds": [95, 98, 101, 102],
    "windowEnd": "2026-05-10",
    "actualValue": 6300,
    "limitValue": 6000,
    "unit": "minutes"
  }
]
```

**`calc_summary` JSONB 结构**：

```json
{
  "ft_28d_peak":               { "value": 6300, "unit": "minutes", "peakDate": "2026-05-10" },
  "ft_365d_ytd":               { "value": 54000, "unit": "minutes" },
  "consecutive_duty_days_peak": { "value": 9, "startDate": "2026-05-01" }
}
```

### 3.3 批量检查进度追踪

```sql
CREATE TABLE rule_check_batch_run (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_group_code     varchar      NOT NULL,
  date_from           date         NOT NULL,
  date_to             date         NOT NULL,
  filiale             varchar      NOT NULL,
  reason              varchar      NOT NULL,  -- 'import' | 'rule-config-change' | 'manual'
  status              varchar      NOT NULL DEFAULT 'pending',
                      -- pending → running → completed | failed | cancelled
  total_crew          int          NOT NULL DEFAULT 0,
  processed_crew      int          NOT NULL DEFAULT 0,
  total_pairings      int          NOT NULL DEFAULT 0,
  processed_pairings  int          NOT NULL DEFAULT 0,
  started_at          timestamptz,
  completed_at        timestamptz,
  error_summary       jsonb,
  created_by          varchar      NOT NULL,
  created_at          timestamptz  NOT NULL DEFAULT now()
);
```

### 3.4 支撑索引（roster_flight）

历史飞时滚动窗口查询依赖此索引：

```sql
CREATE INDEX ON roster_flight (crew_id, std_utc)
  INCLUDE (block_minutes)
  WHERE task_type IN ('FLT', 'DHD');
```

---

## 4. BullMQ Job 设计

### 4.1 双队列架构

```
rule-check-realtime 队列（高优先级）
  并发：20 workers
  粒度：crew × pairing（单条）
  场景：Gantt 提交 / 航班动态 / 单条 roster 变动

rule-check-batch 队列（低优先级）
  并发：10 workers（保护 DB 连接池）
  粒度：crew × 全范围（一个 job 处理该 crew 所有 pairing）
  场景：历史导入后检查 / 法规集变更重算 / 手动触发
```

两个队列互不阻塞：批量跑时，实时检查正常响应。

### 4.2 Job 类型定义

```typescript
// 实时路径：单条 pairing 检查
type CheckPairingJob = {
  name: 'rule:check:pairing'
  data: { crewId: string; pairingId: number; ruleGroupCode: string }
}

// 批量路径：一个 crew 的全量检查
type CheckCrewFullJob = {
  name: 'rule:batch:crew-full'
  data: {
    crewId: string
    dateFrom: string       // 'YYYY-MM-DD'
    dateTo: string
    ruleGroupCode: string
    batchRunId: number
  }
}

// 批量编排：扫描范围，拆分 crew-full job
type CheckBatchJob = {
  name: 'rule:check:batch'
  data: {
    ruleGroupCode: string
    dateFrom: string
    dateTo: string
    filiale: string
    reason: 'import' | 'rule-config-change' | 'manual'
    batchRunId: number
  }
}
```

### 4.3 幂等性策略

所有 job 使用 `jobId` 去重，相同 jobId 已在队列中时自动跳过：

```typescript
// 实时路径
jobId: `pairing:${crewId}:${pairingId}:${ruleGroupCode}`

// 批量路径
jobId: `crew-full:${crewId}:${dateFrom}:${dateTo}:${ruleGroupCode}`
```

用户 10 秒内多次修改同一 pairing → 队列中只存一个待执行 job，不堆积。

### 4.4 实时 Worker 执行逻辑

```typescript
worker.process('rule:check:pairing', async (job) => {
  const { crewId, pairingId, ruleGroupCode } = job.data

  const pairing = await loadPairing(pairingId)
  if (!pairing) return  // pairing 已删除

  const crew    = await loadCrewInfo(crewId)
  const history = await calcRecentFlightHistory(
    crewId,
    pairing.duties[0].reportUtc,
    db
  )

  const rules  = await ruleLoader.loadRules(ruleGroupCode)  // 内存缓存
  const input  = buildCheckInput(pairing, crew, history)
  const result = ruleEngine.checkWithRules(input, rules)

  await upsertPairingResult(crewId, pairingId, ruleGroupCode, result)

  // Level 2：入队受影响月份的 roster check
  const months = getAffectedMonths(pairing.startDate, 28)
  for (const month of months) {
    await realtimeQueue.add('rule:check:roster',
      { crewId, resultMonth: month, ruleGroupCode },
      { jobId: `roster:${crewId}:${month}:${ruleGroupCode}` }
    )
  }

  await ws.broadcast(`violations:${filiale}:${crewId}`, {
    type: 'violation:pairing:updated',
    crewId, pairingId,
    passedAll: result.passedAll,
    highestSeverity: result.highestSeverity,
    checkResults: result.checkResults,
    isDraft: false,
  })
})
```

### 4.5 批量 Worker 执行逻辑（crew-full）

```typescript
worker.process('rule:batch:crew-full', async (job) => {
  const { crewId, dateFrom, dateTo, ruleGroupCode, batchRunId } = job.data

  // 2 次 DB 查询拿全量数据
  const pairings = await loadCrewPairings(crewId, dateFrom, dateTo)
  if (pairings.length === 0) return

  const historyFrom = subDays(pairings[0].duties[0].reportUtc, 365)
  const flights     = await loadCrewFlights(crewId, historyFrom, dateTo)
  const crew        = await loadCrewInfo(crewId)
  const rules       = await ruleLoader.loadRules(ruleGroupCode)

  // 纯内存计算，不再访问 DB
  // Level 1：逐 pairing 独立计算，每条 pairing 使用自己的历史快照（保证累积飞时精确）
  const pairingRows: PairingCheckRow[] = []
  for (const pairing of pairings) {
    const history = computeWindowSums(pairing.duties[0].reportUtc, flights)
    const input   = buildCheckInput(pairing, crew, history)
    const result  = ruleEngine.checkWithRules(input, rules)
    pairingRows.push(toPairingRow(crewId, pairing.id, ruleGroupCode, result))
  }

  // Level 2：RosterEngine 按月份窗口处理跨 pairing 规则
  // 注意：historicalFlightMinutes 以 periodStart（月初）为基准，由内存滑窗计算得出
  const rosterRows: RosterCheckRow[] = []
  for (const [month, monthPairings] of groupByMonth(pairings)) {
    const periodStart = startOfMonth(month)
    const periodEnd   = endOfMonth(month)
    const histMinutes = computeWindowSums(periodStart, flights)
    const rosterInput: RosterInput = {
      ruleGroupCode,
      crew,
      pairings: monthPairings,
      periodStart,
      periodEnd,
      historicalFlightMinutes: {
        before28d:   histMinutes.last28d,
        before365d:  histMinutes.last365d,
        beforeNight30d: 0,  // 夜航历史由调用方按需填充
      },
    }
    // checkWithRules 内部也会跑 Level 1，此处只取 rosterViolations
    const { rosterViolations } = rosterEngine.checkWithRules(rosterInput, rules)
    rosterRows.push(toRosterRow(crewId, ruleGroupCode, month, rosterViolations))
  }

  // Bulk upsert（每批 200 行一个 INSERT）
  await bulkUpsertPairingResults(pairingRows)
  await bulkUpsertRosterResults(rosterRows)

  await incrementBatchProgress(batchRunId, pairings.length)
})
```

---

## 5. recentFlightHistory 预计算

### 5.1 单次检查（实时路径）

```sql
-- 一条 SQL 算出所有滚动窗口，referenceTime = pairing 第一个 duty 的 reportUtc
SELECT
  SUM(CASE WHEN std_utc >= $2 - INTERVAL '1 day'   THEN block_minutes ELSE 0 END) AS last_24h,
  SUM(CASE WHEN std_utc >= $2 - INTERVAL '7 days'  THEN block_minutes ELSE 0 END) AS last_7d,
  SUM(CASE WHEN std_utc >= $2 - INTERVAL '28 days' THEN block_minutes ELSE 0 END) AS last_28d,
  SUM(CASE WHEN std_utc >= $2 - INTERVAL '90 days' THEN block_minutes ELSE 0 END) AS last_90d,
  SUM(block_minutes)                                                                AS last_365d
FROM roster_flight
WHERE crew_id   = $1
  AND sta_utc  <= $2
  AND std_utc  >= $2 - INTERVAL '365 days'
  AND task_type IN ('FLT', 'DHD')
```

### 5.2 批量检查（内存滑窗，批量路径）

```typescript
// crew 的全部历史飞行段一次性加载（已排序），后续不再查 DB
function computeWindowSums(ref: Date, flights: FlightRow[]): RecentFlightHours {
  const windows = [1, 7, 28, 90, 365].map(d => subDays(ref, d))
  const sums    = [0, 0, 0, 0, 0]
  for (const f of flights) {
    if (f.sta_utc > ref) break
    for (let i = 0; i < 5; i++) {
      if (f.std_utc >= windows[i]) sums[i] += f.block_minutes
    }
  }
  return { last24h: sums[0], last7d: sums[1], last28d: sums[2],
           last90d: sums[3], last365d: sums[4] }
}
```

---

## 6. 级联重算范围

排班变动触发时，除当前 pairing 外还需重算：

| 触发事件 | 需要重算的范围 |
|---------|-------------|
| Pairing P 内容变更 | P 本身 + P 的下一个 pairing（休息时间变了） |
| Crew 分配到 P | P 本身 + P 后 28 天内该 crew 的所有 pairing（累积飞时） |
| Crew 从 P 移除 | 同上 |
| 航班动态（延误/取消） | P 所属 pairing 的所有 crew + 各自的下一个 pairing |

Level 2 月份级检查：受影响月份 = `pairing.startMonth` 到 `(pairing.end + 28d) month`，通常 1~2 个月。

---

## 7. 前端读取协议

### 7.1 API 接口

```
# Level 1：按 crew+日期范围查 pairing 级违规（Gantt 打开时调用）
GET /api/rule-check/pairings
    ?crewIds=CA001,CA002
    &dateFrom=2026-05-01
    &dateTo=2026-05-31
    &ruleGroupCode=ccar121_gantt

# Level 2：按 crew+月份查 roster 级违规（crew 行头部告警指示器）
GET /api/rule-check/roster
    ?crewIds=CA001,CA002
    &months=2026-05
    &ruleGroupCode=ccar121_gantt

# 按需触发（missing 列表的懒加载补偿）
POST /api/rule-check/on-demand
{ crewId, pairingIds, ruleGroupCode }

# 批量检查管理（管理后台）
POST /api/rule-check/batch
{ ruleGroupCode, dateFrom, dateTo, filiale, reason }

GET  /api/rule-check/batch/:id/progress
```

### 7.2 Level 1 响应格式

```typescript
{
  code: 200,
  data: {
    byPairing: {               // pairingId → 违规结果，O(1) Canvas 查询
      "101": {
        crewId: "CA001",
        pairingId: 101,
        passedAll: false,
        highestSeverity: 3,
        checkResults: [...],
        calcResults: {...},
        checkedAt: "2026-05-10T08:00:00Z"
      }
    },
    missing: [                 // DB 无结果，前端触发懒加载
      { crewId: "CA001", pairingId: 99 }
    ]
  }
}
```

### 7.3 WebSocket 推送格式

```typescript
// 订阅频道
socket.subscribe(`violations:${filiale}:${crewId}`)

// Level 1 推送
{
  type: 'violation:pairing:updated',
  crewId: 'CA001',
  pairingId: 101,
  passedAll: false,
  highestSeverity: 3,
  checkResults: [...],
  isDraft: false
}

// Level 2 推送
{
  type: 'violation:roster:updated',
  crewId: 'CA001',
  resultMonth: '2026-05',
  passedAll: false,
  highestSeverity: 2,
  violations: [...]
}
```

### 7.4 Gantt 加载时序

```
用户打开 2026-05 班表
  1. 加载 rosterItems（现有逻辑）
  2. GET /api/rule-check/pairings → byPairing 写入 rule-check-store 权威层
     → missing 列表自动发 on-demand 请求
  3. GET /api/rule-check/roster  → crew 行头部告警数据写入 store
  4. WebSocket 订阅所有可见 crewId 频道
  5. 草稿编辑 → draft 层覆盖显示，权威层不变
     提交后 → WebSocket 推送更新权威层，draft 层清除
```

### 7.5 前端 Store 双层设计

```typescript
// rule-check-store
type RuleCheckStore = {
  authoritative: Map<string, PairingViolation>  // key: `${crewId}:${pairingId}`
  draft:         Map<string, PairingViolation>  // 同 key，覆盖显示
  // 渲染时：draft 有值用 draft，否则用 authoritative
  getViolation(crewId: string, pairingId: number): PairingViolation | undefined
}
```

---

## 8. 触发时机总览

| 场景 | 触发方式 | 队列 | 时机 |
|------|---------|------|------|
| 上线前历史数据 | 管理员验数据后手动触发 | batch（低优先级） | 上线前一次性 |
| 法规集配置变更 | 管理员手动确认后触发 | batch | 偶发 |
| 增量历史补导 | 导入验证后手动触发 | batch | 偶发 |
| Roster 实时变动 | BullMQ 事件自动触发 | realtime（高优先级） | 持续 |
| 航班动态进入 | connector-server 事件 | realtime | 持续 |
| 历史数据懒加载 | 用户打开时自动补偿 | realtime | 按需 |

---

## 9. 性能估算

### 批量检查（4000 crew，3年历史）

```
每个 crew-full job：
  DB 读：  2 次（pairings + flights）≈ 50ms
  内存计算：450 pairing × 规则引擎  ≈ 200ms
  DB 写：  bulk upsert（200行/批）  ≈ 60ms
  单 crew 总耗时：≈ 310ms

并发 10 workers：
  4000 ÷ 10 = 400 轮 × 310ms ≈ 2 分钟

DB I/O 总量：
  读：4000 × 2  = 8,000 次
  写：180万 ÷ 200 = 9,000 次 bulk INSERT
  （原设计 720 万次 → 降低 40x）
```

### 实时检查（单条 roster 变动）

```
DB 读：  3 次（pairing + crew + history）≈ 30ms
规则引擎：                                ≈ 5ms
DB 写：  1 次 upsert                     ≈ 10ms
总耗时：≈ 45ms
WebSocket 推送：< 50ms 到达前端
```

---

## 10. 检查范围按规则类型

| 规则类型 | 级别 | 检查窗口 |
|---------|------|---------|
| FDP / 休息时间 / 资质 / 机组配置 | Level 1 | pairing 内部 |
| max_ft_24h / 7d / 28d | Level 2 | pairing.start - 28d ~ pairing.end |
| max_ft_365d | Level 2 | pairing.start - 365d ~ pairing.end |
| consecutive_duty_days | Level 2 | pairing.start - 14d ~ pairing.end + 14d |
| min_rest_weekly | Level 2 | pairing.start - 7d ~ pairing.end + 7d |

Level 2 单次检查窗口由规则集中最长窗口决定（最大 365d），但每次只处理**受影响 crew 的该窗口内 pairing**，不全库扫描。

---

## 11. 不在此设计范围内

- 用户自定义法规集的持久化违规（预览功能为 session-only，不存 DB）
- 法规集合的 UI 配置界面（另行设计）
- PBS 端的法规检查（PBS 模块独立设计，共用 rule-engine npm 包）
- FRMS/疲劳风险计算的独立展示界面
