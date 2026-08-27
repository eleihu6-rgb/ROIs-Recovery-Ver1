# Rule Engine 升级设计文档

**日期：** 2026-04-11  
**作者：** yuan.zhu + Claude  
**状态：** 已批准，待实现  
**优先级：** C → A → D → B（Roster 级检查 → 规则扩充 → HTTP 服务 → 测试覆盖率）

---

## 背景

`rule-engine` 当前实现（P1b 约 60% 完成）：
- 5 个 Calculators：FDP / FlightTime / DutyTime / RestTime / Fatigue
- 12 个 Checkers：FDP / FlightTime(×4) / DutyPeriod / DutyCumulative / MinRest / WeeklyRest / AirportQual / FleetQual / Recency
- 149 个单元测试，全部通过
- 仅支持 Pairing 级别检查（单个配对，多个值勤段）

**老系统核心痛点（新系统必须解决）：**
- 计算值不准确：DB 触发器级联更新，同一事务内死锁，部分更新失败无法重试
- 无法判断值是否陈旧：没有脏标记机制
- 读时计算导致性能抖动：每次查询重新计算

---

## 目标

1. **Roster 级检查**：从 Pairing 级扩展到整月排班（跨 Pairing 累计）
2. **规则扩充**：补全 CCAR-121 缺失规则（连续值勤、夜航累计、机组组合、延长休息、FRMS）
3. **HTTP 服务完善**：批量检查、Roster 接口、规则查询、限流熔断
4. **测试覆盖率**：整体 ≥ 85%

---

## 方案选型：方案一½

### 三个候选方案

**方案一（扩展现有）：** 新建平行 `RosterEngine`，两引擎共享 calculator/checker 注册表。  
**方案二（统一引擎）：** 单一引擎加 `scope` 参数切换。上下文耦合，条件分支多。  
**方案三（插件式）：** 纯函数管道，每条规则完全自包含。最灵活但工程量最大。

**选择：方案一½** — 方案一架构 + 方案三的插件自包含能力：

- 每个 Checker 声明 `requiredCalculators: string[]`（自描述依赖）
- 引擎支持单条规则独立调用 `checkRule(templateCode, input)`，自动注入依赖
- 批量/Roster 运行时共享 `CalcResultCache`，相同 duty 不重复计算
- 性能优先：O(n) 滚动窗口、Promise.all 并发、delta 增量检查

---

## 架构

### 目录结构

```
rule-engine/src/
├── calculators/               ← 现有，不变
├── checkers/                  ← 现有 + 新增 requiredCalculators 字段
├── checkers-roster/           ← 新增：Roster 级专属 checkers（需要跨 Pairing 上下文）
│   ├── consecutive-duty-checker.ts
│   ├── monthly-rest-checker.ts
│   ├── rolling-flight-time-checker.ts    ← 28d 滚动窗口（含历史数据）
│   └── night-flight-cumulative-checker.ts ← 30d 夜航累计
├── calculators-roster/        ← 新增：复杂聚合计算，供 Roster checkers 复用
│   └── rolling-window-calculator.ts      ← RosterContext 的底层实现，O(n) 滑动指针
├── engine/
│   ├── context.ts             ← 现有 + sharedCache 参数
│   ├── calc-result-cache.ts   ← 新增
│   ├── roster-context.ts      ← 新增：跨 Pairing 滚动窗口
│   ├── rule-engine.ts         ← 现有 + checkRule() 单条调用
│   ├── roster-engine.ts       ← 新增
│   ├── rule-loader.ts         ← 现有，不变
│   └── rule-sorter.ts         ← 现有 + 依赖解析
├── routes/
│   ├── check.ts               ← 现有 /check（Pairing）
│   ├── check-roster.ts        ← 新增 /check/roster + /check/roster/delta
│   ├── check-batch.ts         ← 新增 /check/batch
│   └── rules.ts               ← 新增 /rules 查询接口
└── plugins/
    └── rate-limit.ts          ← 新增：限流 + 熔断
```

### 两个引擎的职责边界

```
调用方（Gantt / PO / RO）
    ├── 单 Pairing / 批量  →  RuleEngine（现有扩展）
    │                           checkRule()        单条规则独立调用
    │                           checkWithRules()   已有
    │                           check()            已有
    └── 整月 Roster        →  RosterEngine（新增）
                                check(rosterInput)
                                checkDelta(deltaInput)

共享：
  calculatorRegistry       Pairing 级
  checkerRegistry          Pairing 级
  rosterCheckerRegistry    Roster 级（新增）
  CalcResultCache          请求级共享缓存
```

---

## 核心合约变更

### 1. BaseChecker 新增 requiredCalculators

```typescript
export abstract class BaseChecker {
  abstract readonly templateCode: string
  abstract readonly requiredCalculators: string[]  // 新增，可为 []

  abstract execute(rule: ResolvedRule, ctx: ExecutionContext): void
  // pass() / fail() helpers 不变
}

// 示例
class FdpChecker extends BaseChecker {
  readonly templateCode = 'max_fdp'
  readonly requiredCalculators = ['fdp_calculator']
}

class AirportQualChecker extends BaseChecker {
  readonly templateCode = 'airport_qual'
  readonly requiredCalculators = []  // 纯数据检查
}
```

### 2. RuleEngine.checkRule() — 单条规则独立调用

```typescript
// 调用方无需知道依赖关系
const result = engine.checkRule('max_fdp', { pairing, crew })

// 内部：自动解析 requiredCalculators，构建最小规则集执行
checkRule(templateCode: string, input: CheckInput): EngineResult {
  const checker = checkerRegistry.get(templateCode)
  const calcRules = checker.requiredCalculators.map(makeMinimalCalcRule)
  return this.checkWithRules(input, [...calcRules, makeMinimalCheckRule(templateCode)])
}
```

### 3. CalcResultCache — 跨规则共享计算结果

```typescript
// engine/calc-result-cache.ts
export class CalcResultCache {
  private readonly cache = new Map<string, CalcResult>()

  key(dutyPeriod: DutyPeriod, templateCode: string): string {
    return `${templateCode}:${hashDutyPeriod(dutyPeriod)}`
  }

  get(key: string): CalcResult | undefined
  set(key: string, result: CalcResult): void
  clear(): void
}
```

**性能效果（批量场景）：**
- 100 Pairing × 10 规则，无 cache：1000 次 FDP 计算
- 有 cache：300 次 hash 查找，相同 duty 命中后 0 次重算

### 4. ExecutionContext 扩展

```typescript
constructor(
  input: CheckInput,
  rules: ResolvedRule[],
  sharedCache?: CalcResultCache,  // 新增：批量运行时共享
)
```

---

## Roster 级检查

### 新输入类型

```typescript
// types/input.ts 新增
export interface RosterInput {
  ruleGroupCode: string
  crew: CrewInfo                      // 必填
  pairings: PairingInput[]            // 整月 Pairing，按时间顺序
  periodStart: Date
  periodEnd: Date
  historicalFlightMinutes?: {
    before28d: number                 // 周期开始前 28 天飞行时间累计（供 max_ft_roster_28d）
    before365d: number                // 周期开始前 365 天飞行时间累计（供 max_ft_365d）
    beforeNight30d: number            // 周期开始前 30 天夜航时间累计（供 max_night_ft_30d）
  }
}

export interface RosterDeltaInput {
  ruleGroupCode: string
  crew: CrewInfo
  changedPairingIds: number[]
  fullRoster: RosterInput             // 完整上下文
}
```

### RosterContext — O(n) 滑动窗口

```typescript
export class RosterContext {
  readonly input: RosterInput
  readonly timeline: Array<{ pairing: PairingInput; duty: DutyPeriod }>

  // 所有窗口查询 O(n) — 滑动指针，每个 duty 只进出一次
  getFlightMinutesInWindow(endDate: Date, windowDays: number): number
  getDutyDaysInWindow(endDate: Date, windowDays: number): number
  getConsecutiveDutyDays(fromDate: Date): number
  getRestDaysInPeriod(start: Date, end: Date): number
  getInterPairingRest(pairingA: PairingInput, pairingB: PairingInput): number
}
```

### Roster 级 Checkers（新增 4 条，需跨 Pairing 上下文）

放入 `checkers-roster/`，依赖 `RosterContext` 的滚动窗口方法：

| templateCode | 检查内容 | CCAR 参考 |
|-------------|---------|-----------|
| `max_consecutive_duty_days` | 7天内连续值勤不超过 N 天 | 121.481 |
| `min_weekly_rest_days` | 每7天至少1个完整休息日 | 121.479 |
| `max_ft_roster_28d` | 滚动28天飞行时间（含 periodStart 前历史） | 121.471 |
| `max_night_ft_30d` | 滚动30天夜航累计上限（含历史） | 121.473 |

### Pairing 级 Checkers（新增 3 条，仅需单 Pairing 上下文）

放入 `checkers/`，`requiredCalculators` 声明依赖，可独立调用：

| templateCode | 检查内容 | requiredCalculators | CCAR 参考 |
|-------------|---------|---------------------|-----------|
| `crew_composition` | CA+FO 资质匹配、机组组合合法性 | `[]` | 121.385 |
| `extended_rest_after_long_fdp` | 超长 FDP 后的延长休息要求 | `['fdp_calculator', 'rest_time_calculator']` | 121.475 |
| `frms_score_threshold` | 疲劳评分超阈值告警 | `['fatigue_calculator']` | FRMS |

### RosterEngine 接口

```typescript
export class RosterEngine {
  constructor(ruleLoader: RuleLoader | null) {}

  async check(input: RosterInput): Promise<RosterEngineResult>
  async checkDelta(input: RosterDeltaInput): Promise<RosterEngineResult>
  checkWithRules(input: RosterInput, rules: ResolvedRule[]): RosterEngineResult
}

export interface RosterEngineResult {
  pairingResults: Map<number, EngineResult>  // pairingId → Pairing 级结果
  rosterViolations: CheckResult[]            // Roster 级违规（跨 Pairing）
  passedAll: boolean
  highestSeverity: number
}
```

---

## HTTP 服务

### 端点清单

| 方法 | 路径 | 功能 | 限流 |
|------|------|------|------|
| `POST` | `/check` | 单 Pairing 检查（现有） | 100 req/s |
| `POST` | `/check/batch` | 批量 Pairing 检查 | 20 req/s |
| `POST` | `/check/roster` | 整月 Roster 检查 | 10 req/s |
| `POST` | `/check/roster/delta` | Delta 增量检查 | 50 req/s |
| `GET` | `/rules/groups` | 查询所有规则组 | 200 req/s |
| `GET` | `/rules/groups/:code` | 规则组详情 + 规则列表 | 200 req/s |
| `GET` | `/rules/templates` | 查询所有规则模板 | 200 req/s |
| `POST` | `/rules/groups/:code/validate` | 验证规则组配置合法性 | 50 req/s |

### 批量检查接口

```typescript
// POST /check/batch
interface BatchCheckInput {
  ruleGroupCode: string
  items: Array<{
    id: string              // 调用方自定义 ID，原样返回
    pairing: PairingInput
    crew?: CrewInfo
  }>
}

interface BatchCheckResult {
  items: Array<{ id: string; result: EngineResult }>
  totalDuration: number     // ms
}
// 执行策略：共享同一 CalcResultCache，相同 duty 跨 item 命中缓存
```

### 限流 + 熔断

```typescript
// 使用 @fastify/rate-limit（MIT 许可）
// 熔断：纯计数器实现，无额外依赖
class CircuitBreaker {
  private failures = 0
  private readonly threshold = 5        // 连续 5 次失败触发
  private readonly resetAfterMs = 30_000
  isOpen(): boolean
  recordFailure(): void
  recordSuccess(): void
}
```

### 统一错误响应

```typescript
interface ErrorResponse {
  success: false
  error: {
    code: 'VALIDATION_ERROR' | 'RULE_NOT_FOUND' | 'ENGINE_ERROR' | 'RATE_LIMITED' | 'CIRCUIT_OPEN'
    message: string
    details?: unknown
  }
}
```

---

## 计算值存储与数据变更流

### 分层存储策略

| 存储位置 | 内容 | 一致性 | 写入方 |
|---------|------|--------|--------|
| `pairing_segment.duty_max_fdp_min` | 该 duty 法规最大 FDP 上限 | **同步**，随 pairing 保存立即写入 | rule-engine calc |
| `pairing_segment.duty_sch_fdp_min` | 计划 FDP 时长 | **同步** | live-server |
| `calc_result` (PAIRING) | 完整法规检查 JSONB（违规详情 + 数值） | **最终一致**，BullMQ 异步 | rule-engine |
| `calc_result` (ROSTER) | 整月 Roster 级违规 | **最终一致** | roster-engine |
| `crew_manday_fd_daily` / `cc_am_daily` | 按天累计 FDP/BLH/飞行时间 | **最终一致** | manday-calculator |

### 变更传播链

```
事件                    立即执行（同步）              异步（BullMQ）
────────────────────────────────────────────────────────────────
flight.updated          标脏相关 pairing             calc:pairing（所有脏 pairing）
(STD/STA 变化)          标脏相关 crew_manday          calc:manday（受影响机组 × 天）

pairing.modified        写 duty_max_fdp_min          calc:pairing（全量重算）
(duty 增删/调序)         标脏 calc_result              calc:roster（该机组当月）
                        标脏 crew_manday               calc:manday

roster.assigned         标脏 calc_result(ROSTER)     calc:roster
(机组上/撤环)            标脏 crew_manday               calc:manday

crew.base_changed       —                            calc:roster（资质重检）
```

### BullMQ 队列设计

```typescript
// 三个队列，优先级分级
'calc:pairing'  → { gantt 触发: priority 1, bulk: priority 10 }
'calc:roster'   → { priority 5 }
'calc:manday'   → { priority 8, batchSize: 50 }

interface CalcPairingJob {
  pairingId: number
  ruleGroupCode: string
  triggeredBy: 'gantt_edit' | 'flight_import' | 'batch'
}
```

### Gantt 拖拽完整时序

```
用户拖拽航班
  ├─① 前端乐观更新（立即显示）
  ├─② POST /check/roster/delta → 同步返回违规（< 200ms）
  │       rule-engine 用 CalcResultCache 快速计算
  │       前端收到违规 → 高亮显示
  └─③ live-server 保存变更
          ├─ 写 pairing_segment.duty_max_fdp_min（同步）
          ├─ 标脏 calc_result.is_dirty = true
          └─ 推送 BullMQ（calc:pairing + calc:manday）
                  ↓ 异步完成
                  crew_manday_fd_daily 更新
```

### 老系统问题对照

| 老系统问题 | 新系统方案 |
|-----------|-----------|
| DB 触发器级联更新，同事务死锁 | 标脏 + 异步 BullMQ，脱离事务边界 |
| 部分更新失败无法重试 | BullMQ 自带重试 + 失败队列 |
| 无法判断值是否陈旧 | `is_dirty` + `computed_at` + `version` 三字段 |
| 读时计算性能抖动 | 计算结果持久化，读时直接取 `calc_result` |
| Gantt 拖拽等待法规结果 | `/check/roster/delta` 同步快速返回 |

---

## 测试策略

### 分层

| 层级 | 工具 | 覆盖目标 |
|------|------|---------|
| 单元测试 | Vitest | 每个 calculator/checker 独立逻辑、边界条件 |
| 集成测试 | Vitest + 真实 DB | RuleLoader、calc_result 写回 |
| 引擎测试 | Vitest | RuleEngine/RosterEngine 端到端场景 |
| HTTP 测试 | Vitest + supertest | 全部端点、限流、错误响应 |
| 性能测试 | Vitest bench | CalcResultCache 命中率、批量吞吐量 |

### 覆盖率目标

| 模块 | 目标 |
|------|------|
| calculators（现有+新增） | ≥ 90% |
| checkers（现有+新增） | ≥ 90% |
| RuleEngine + RosterEngine | ≥ 85% |
| HTTP routes | ≥ 80% |
| **整体** | **≥ 85%** |

### 关键必测场景

- **CalcResultCache**：相同 duty hash 命中缓存；修改后 hash 不同触发重算
- **checkRule() 依赖注入**：`max_fdp` 自动注入 `fdp_calculator`；无依赖规则正常调用
- **RosterEngine 滚动窗口**：28d/365d 窗口边界精确性；跨 Pairing 边界的 inter-pairing rest
- **checkDelta()**：只重算变更 Pairing，未变更 Pairing 从 cache 取
- **数据变更流**（集成）：`duty_max_fdp_min` 同步写入；标脏后 BullMQ 触发重算；`is_dirty` 回 false
- **Roster 级新规则边界**：连续值勤天数恰好在阈值（N vs N+1）；月度休息日跨月边界

### Fixture 扩展

```typescript
// __tests__/fixtures/test-roster.ts
export const makeMonthRoster = (crewId: string, pairingCount: number): RosterInput
export const makeViolatingRoster = (
  violation: 'consecutive_duty' | 'weekly_rest' | 'frms'
): RosterInput

// __tests__/fixtures/test-flight-change.ts
export const makePairingWithFlightChange = (
  deltaMinutes: number
): { before: PairingInput; after: PairingInput }
```

---

## 实现优先级

| 优先级 | 内容 | 涉及文件 |
|--------|------|---------|
| P1 | `CalcResultCache` + `BaseChecker.requiredCalculators` + `checkRule()` | `calc-result-cache.ts`, `base-checker.ts`, `rule-engine.ts` |
| P2 | `RosterContext` + `RosterEngine` + 4 条 Roster 级 checkers | `roster-context.ts`, `roster-engine.ts`, `checkers-roster/` |
| P3 | 3 条新 Pairing 级规则（crew_composition / extended_rest / frms_score_threshold） | `checkers/` |
| P4 | HTTP 新端点（batch/roster/delta/rules） + 限流熔断 | `routes/`, `plugins/` |
| P5 | 测试补全至覆盖率目标 | `__tests__/` |
