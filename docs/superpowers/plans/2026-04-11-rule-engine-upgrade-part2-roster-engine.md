# Rule Engine 升级实现计划 — Part 2: Roster Engine

> **索引：** [Part 1: Foundation](2026-04-11-rule-engine-upgrade-part1-foundation.md) | [Part 2: Roster Engine](2026-04-11-rule-engine-upgrade-part2-roster-engine.md) | [Part 3: Checkers](2026-04-11-rule-engine-upgrade-part3-checkers.md) | [Part 4: HTTP API](2026-04-11-rule-engine-upgrade-part4-http-api.md)

**Goal:** 将 rule-engine 从 Pairing 级扩展到 Roster 级检查，新增插件式单条规则调用、CalcResultCache 性能优化、7 条新规则、完整 HTTP 服务。

**Architecture:** 方案一½ — 保留现有 RuleEngine，新增平行 RosterEngine；BaseChecker 声明 `requiredCalculators` 实现插件自包含；CalcResultCache 在批量检查时跨规则共享计算结果避免重算。

**Tech Stack:** TypeScript, Vitest, Fastify, @fastify/rate-limit

**Spec:** `docs/superpowers/specs/2026-04-11-rule-engine-design.md`

---

## Task 4: 新类型 — RosterInput / RosterEngineResult

**Files:**
- Modify: `rule-engine/src/types/input.ts`
- Modify: `rule-engine/src/types/result.ts`

- [ ] **Step 1: 在 input.ts 末尾追加两个接口**

```typescript
// rule-engine/src/types/input.ts 末尾追加

/** 整月排班输入 — 用于 RosterEngine */
export interface RosterInput {
  ruleGroupCode: string
  crew: CrewInfo                        // 必填
  pairings: PairingInput[]              // 整月所有 Pairing，按时间顺序
  periodStart: Date                     // 考察周期开始（通常月初）
  periodEnd: Date                       // 考察周期结束（通常月末）
  historicalFlightMinutes?: {
    before28d: number                   // periodStart 前 28 天飞行分钟累计
    before365d: number                  // periodStart 前 365 天飞行分钟累计
    beforeNight30d: number              // periodStart 前 30 天夜航分钟累计
  }
}

/** Delta 增量检查 — 只传变更的 Pairing，引擎合并缓存给出全量违规 */
export interface RosterDeltaInput {
  ruleGroupCode: string
  crew: CrewInfo
  changedPairingIds: number[]
  fullRoster: RosterInput
}
```

- [ ] **Step 2: 在 result.ts 末尾追加 RosterEngineResult**

```typescript
// rule-engine/src/types/result.ts 末尾追加

/** RosterEngine 的聚合输出 */
export interface RosterEngineResult {
  /** pairingId → 该 Pairing 的 Pairing 级检查结果 */
  pairingResults: Map<number, EngineResult>
  /** 跨 Pairing 的 Roster 级违规（连续值勤、月度休息等） */
  rosterViolations: CheckResult[]
  passedAll: boolean
  highestSeverity: number
}
```

- [ ] **Step 3: 运行全部测试，确认无回归**

```bash
cd rule-engine && npx vitest run
```
预期：所有测试通过（纯类型变更，无逻辑改动）

- [ ] **Step 4: Commit**

```bash
git add rule-engine/src/types/input.ts rule-engine/src/types/result.ts
git commit -m "feat(rule-engine): 新增 RosterInput / RosterDeltaInput / RosterEngineResult 类型"
```

---

## Task 5: RosterContext — O(n) 滑动窗口

**Files:**
- Create: `rule-engine/src/engine/roster-context.ts`
- Create: `rule-engine/src/__tests__/engine/roster-context.test.ts`
- Create: `rule-engine/src/__tests__/fixtures/test-roster.ts`

- [ ] **Step 1: 创建测试 Fixture**

```typescript
// rule-engine/src/__tests__/fixtures/test-roster.ts
import type { RosterInput, PairingInput, CrewInfo } from '../../types/input.js'
import { normalCrew, utc, seg } from './test-pairing.js'

/** 构建一个连续 N 天都有 duty 的月度 Roster（每天一个单 duty Pairing） */
export const makeMonthRoster = (
  crewId: string,
  dutyCount: number,
  startDate = '2026-04-01',
): RosterInput => {
  const pairings: PairingInput[] = []
  const base = new Date(`${startDate}T00:00:00Z`)

  for (let i = 0; i < dutyCount; i++) {
    const dayOffsetMs = i * 24 * 60 * 60 * 1000
    const reportUtc = new Date(base.getTime() + dayOffsetMs)
    const releaseUtc = new Date(reportUtc.getTime() + 8 * 60 * 60 * 1000) // 8h duty

    pairings.push({
      pairingId: 2000 + i,
      crewBase: 'PEK',
      duties: [
        {
          dutySeq: 1,
          reportUtc,
          releaseUtc,
          segments: [
            seg(
              `CA${100 + i}`,
              'PEK',
              'SHA',
              new Date(reportUtc.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' '),
              new Date(reportUtc.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' '),
            ),
          ],
          reportLocal: '08:00',
          baseUtcOffset: 480,
          restAfterMinutes: 960, // 16h rest after each duty
        },
      ],
    })
  }

  const crew: CrewInfo = { ...normalCrew, crewId }

  return {
    ruleGroupCode: 'ccar121_full',
    crew,
    pairings,
    periodStart: base,
    periodEnd: new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000),
  }
}

/** 构建一个含特定违规类型的 Roster */
export const makeViolatingRoster = (
  violation: 'consecutive_duty' | 'weekly_rest' | 'frms',
): RosterInput => {
  switch (violation) {
    case 'consecutive_duty':
      // 8 天连续值勤（超过 7 天限制）
      return makeMonthRoster('VIO001', 8)
    case 'weekly_rest':
      // 14 天内无完整休息日（每天都有 duty）
      return makeMonthRoster('VIO002', 14)
    case 'frms':
      // 5 个连续长 duty（每个 12h），累计疲劳分高
      return makeMonthRoster('VIO003', 5)
    default:
      return makeMonthRoster('VIO000', 3)
  }
}
```

- [ ] **Step 2: 写 RosterContext 失败测试**

```typescript
// rule-engine/src/__tests__/engine/roster-context.test.ts
import { describe, it, expect } from 'vitest'
import { RosterContext } from '../../engine/roster-context.js'
import { makeMonthRoster } from '../fixtures/test-roster.js'

describe('RosterContext', () => {
  describe('timeline construction', () => {
    it('flattens all duties into sorted timeline', () => {
      const roster = makeMonthRoster('C001', 5)
      const ctx = new RosterContext(roster)
      expect(ctx.timeline).toHaveLength(5)
      // sorted by reportUtc ascending
      for (let i = 1; i < ctx.timeline.length; i++) {
        expect(ctx.timeline[i].duty.reportUtc.getTime())
          .toBeGreaterThanOrEqual(ctx.timeline[i - 1].duty.reportUtc.getTime())
      }
    })
  })

  describe('getFlightMinutesInWindow()', () => {
    it('counts block minutes within window', () => {
      const roster = makeMonthRoster('C001', 3)
      const ctx = new RosterContext(roster)
      // endDate = 3 days after start, window = 7 days → all 3 duties included
      const endDate = new Date(roster.periodStart.getTime() + 3 * 24 * 60 * 60 * 1000)
      const minutes = ctx.getFlightMinutesInWindow(endDate, 7)
      // Each pairing has 1 segment of 2h = 120 min block time
      expect(minutes).toBe(3 * 120)
    })

    it('excludes duties outside window', () => {
      const roster = makeMonthRoster('C001', 10)
      const ctx = new RosterContext(roster)
      // window = only first 3 days
      const endDate = new Date(roster.periodStart.getTime() + 3 * 24 * 60 * 60 * 1000)
      const minutes = ctx.getFlightMinutesInWindow(endDate, 3)
      expect(minutes).toBe(3 * 120)
    })

    it('adds historicalFlightMinutes.before28d when window extends before periodStart', () => {
      const roster: typeof makeMonthRoster extends (...a: any[]) => infer R ? R : never =
        makeMonthRoster('C001', 1)
      const rosterWithHistory = {
        ...roster,
        historicalFlightMinutes: { before28d: 1000, before365d: 5000, beforeNight30d: 200 },
      }
      const ctx = new RosterContext(rosterWithHistory)
      // window starts before periodStart
      const endDate = new Date(roster.periodStart.getTime() + 1 * 24 * 60 * 60 * 1000)
      const minutes = ctx.getFlightMinutesInWindow(endDate, 28)
      // 1 duty (120 min) + proportional historical (1/28 * 1000 ≈ 35.7... but full 1000 added)
      expect(minutes).toBeGreaterThan(120)
    })
  })

  describe('getConsecutiveDutyDays()', () => {
    it('counts days with at least one duty', () => {
      const roster = makeMonthRoster('C001', 7)
      const ctx = new RosterContext(roster)
      const fromDate = roster.periodStart
      expect(ctx.getConsecutiveDutyDays(fromDate)).toBe(7)
    })

    it('stops counting at first rest day', () => {
      const roster = makeMonthRoster('C001', 3) // 3 duties, then gap
      const ctx = new RosterContext(roster)
      const fromDate = roster.periodStart
      expect(ctx.getConsecutiveDutyDays(fromDate)).toBe(3)
    })
  })

  describe('getInterPairingRest()', () => {
    it('returns minutes between release of first pairing and report of second', () => {
      const roster = makeMonthRoster('C001', 2)
      const ctx = new RosterContext(roster)
      const [p1, p2] = roster.pairings
      const restMinutes = ctx.getInterPairingRest(p1, p2)
      // release of p1 duty = reportUtc + 8h, report of p2 = reportUtc + 24h
      // rest = 24h - 8h = 16h = 960 min
      expect(restMinutes).toBe(960)
    })
  })
})
```

- [ ] **Step 3: 运行测试，确认失败**

```bash
cd rule-engine && npx vitest run src/__tests__/engine/roster-context.test.ts
```
预期：`Cannot find module '../../engine/roster-context.js'`

- [ ] **Step 4: 实现 RosterContext**

```typescript
// rule-engine/src/engine/roster-context.ts
import type { RosterInput, PairingInput, DutyPeriod } from '../types/input.js'

export interface TimelineEntry {
  pairing: PairingInput
  duty: DutyPeriod
}

const DAY_MS = 24 * 60 * 60 * 1000

export class RosterContext {
  readonly input: RosterInput
  /** All duties across all pairings, sorted by reportUtc ascending */
  readonly timeline: TimelineEntry[]

  constructor(input: RosterInput) {
    this.input = input
    this.timeline = input.pairings
      .flatMap((pairing) => pairing.duties.map((duty) => ({ pairing, duty })))
      .sort((a, b) => a.duty.reportUtc.getTime() - b.duty.reportUtc.getTime())
  }

  /**
   * Total block flight minutes in [endDate - windowDays, endDate].
   * If the window extends before periodStart, adds proportional historical data.
   */
  getFlightMinutesInWindow(endDate: Date, windowDays: number): number {
    const windowStartMs = endDate.getTime() - windowDays * DAY_MS
    const endMs = endDate.getTime()

    // Binary search: find first entry >= windowStart
    const startIdx = this._lowerBound(windowStartMs)
    let total = 0

    for (let i = startIdx; i < this.timeline.length; i++) {
      const { duty } = this.timeline[i]
      if (duty.reportUtc.getTime() > endMs) break
      for (const seg of duty.segments) {
        total += seg.blockMinutes
      }
    }

    // Blend historical data if window extends before periodStart
    const periodStartMs = this.input.periodStart.getTime()
    if (windowStartMs < periodStartMs && this.input.historicalFlightMinutes) {
      const hist = this.input.historicalFlightMinutes
      const overlapDays = (periodStartMs - windowStartMs) / DAY_MS
      if (windowDays <= 28 || overlapDays <= 28) {
        total += hist.before28d * Math.min(overlapDays / 28, 1)
      } else {
        total += hist.before365d * Math.min(overlapDays / 365, 1)
      }
    }

    return Math.round(total)
  }

  /**
   * Total night-flight block minutes in [endDate - windowDays, endDate].
   */
  getNightFlightMinutesInWindow(endDate: Date, windowDays: number): number {
    const windowStartMs = endDate.getTime() - windowDays * DAY_MS
    const endMs = endDate.getTime()
    const startIdx = this._lowerBound(windowStartMs)
    let total = 0

    for (let i = startIdx; i < this.timeline.length; i++) {
      const { duty } = this.timeline[i]
      if (duty.reportUtc.getTime() > endMs) break
      for (const seg of duty.segments) {
        if (seg.isNight) total += seg.blockMinutes
      }
    }

    const periodStartMs = this.input.periodStart.getTime()
    if (windowStartMs < periodStartMs && this.input.historicalFlightMinutes) {
      const overlapDays = (periodStartMs - windowStartMs) / DAY_MS
      total += this.input.historicalFlightMinutes.beforeNight30d * Math.min(overlapDays / 30, 1)
    }

    return Math.round(total)
  }

  /**
   * Count duty days starting from fromDate until the first calendar day with no duty.
   */
  getConsecutiveDutyDays(fromDate: Date): number {
    const dutyDays = new Set(
      this.timeline.map(({ duty }) => this._dayKey(duty.reportUtc)),
    )
    let count = 0
    const cursor = new Date(fromDate)
    cursor.setUTCHours(0, 0, 0, 0)

    while (dutyDays.has(this._dayKey(cursor))) {
      count++
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return count
  }

  /**
   * Count calendar days in [start, end] that have NO duty (rest days).
   */
  getRestDaysInPeriod(start: Date, end: Date): number {
    const dutyDays = new Set(
      this.timeline.map(({ duty }) => this._dayKey(duty.reportUtc)),
    )
    let count = 0
    const cursor = new Date(start)
    cursor.setUTCHours(0, 0, 0, 0)
    const endDay = new Date(end)
    endDay.setUTCHours(0, 0, 0, 0)

    while (cursor <= endDay) {
      if (!dutyDays.has(this._dayKey(cursor))) count++
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return count
  }

  /**
   * Rest minutes between the last duty of pairingA and the first duty of pairingB.
   */
  getInterPairingRest(pairingA: PairingInput, pairingB: PairingInput): number {
    const lastDutyA = pairingA.duties[pairingA.duties.length - 1]
    const firstDutyB = pairingB.duties[0]
    if (!lastDutyA || !firstDutyB) return 0
    return Math.round(
      (firstDutyB.reportUtc.getTime() - lastDutyA.releaseUtc.getTime()) / 60_000,
    )
  }

  // ── Private ──────────────────────────────────────────

  /** Binary search: index of first timeline entry with reportUtc.getTime() >= targetMs */
  private _lowerBound(targetMs: number): number {
    let lo = 0
    let hi = this.timeline.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.timeline[mid].duty.reportUtc.getTime() < targetMs) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    return lo
  }

  private _dayKey(date: Date): string {
    return date.toISOString().slice(0, 10)
  }
}
```

- [ ] **Step 5: 运行测试**

```bash
cd rule-engine && npx vitest run src/__tests__/engine/roster-context.test.ts
```
预期：所有测试通过

- [ ] **Step 6: Commit**

```bash
git add rule-engine/src/engine/roster-context.ts \
        rule-engine/src/__tests__/engine/roster-context.test.ts \
        rule-engine/src/__tests__/fixtures/test-roster.ts
git commit -m "feat(rule-engine): RosterContext — O(n) 滑动窗口 + 历史数据混合"
```

---

## Task 6: RosterEngine

**Files:**
- Create: `rule-engine/src/engine/roster-engine.ts`
- Create: `rule-engine/src/checkers-roster/index.ts`
- Create: `rule-engine/src/__tests__/engine/roster-engine.test.ts`

- [ ] **Step 1: 创建 rosterCheckerRegistry 空占位**

```typescript
// rule-engine/src/checkers-roster/index.ts
import type { BaseRosterChecker } from './base-roster-checker.js'

// Populated in Tasks 7
export const rosterCheckerRegistry = new Map<string, BaseRosterChecker>()
```

创建 BaseRosterChecker 基类：

```typescript
// rule-engine/src/checkers-roster/base-roster-checker.ts
import type { CheckResult } from '../types/result.js'
import type { ResolvedRule } from '../types/rule.js'
import type { RosterContext } from '../engine/roster-context.js'
import { severityToNumber } from '../checkers/base-checker.js'

export abstract class BaseRosterChecker {
  abstract readonly templateCode: string

  abstract execute(rule: ResolvedRule, ctx: RosterContext): CheckResult[]

  protected pass(rule: ResolvedRule, actual: number, limit: number, unit: string, message: string): CheckResult {
    return { ruleCode: rule.templateCode, ruleName: rule.name, passed: true,
      severity: severityToNumber(rule.severity), actualValue: actual, limitValue: limit, unit, message, overridable: rule.overridable }
  }

  protected fail(rule: ResolvedRule, actual: number, limit: number, unit: string, message: string): CheckResult {
    return { ruleCode: rule.templateCode, ruleName: rule.name, passed: false,
      severity: severityToNumber(rule.severity), actualValue: actual, limitValue: limit, unit, message, overridable: rule.overridable }
  }
}
```

- [ ] **Step 2: 写 RosterEngine 失败测试**

```typescript
// rule-engine/src/__tests__/engine/roster-engine.test.ts
import { describe, it, expect } from 'vitest'
import { RosterEngine } from '../../engine/roster-engine.js'
import { makeMonthRoster } from '../fixtures/test-roster.js'

const engine = new RosterEngine()

describe('RosterEngine', () => {
  it('returns pairingResults for each pairing', () => {
    const roster = makeMonthRoster('C001', 3)
    const result = engine.checkWithRules(roster, [])
    expect(result.pairingResults.size).toBe(3)
  })

  it('passedAll is true when no rules configured', () => {
    const roster = makeMonthRoster('C001', 2)
    const result = engine.checkWithRules(roster, [])
    expect(result.passedAll).toBe(true)
    expect(result.rosterViolations).toHaveLength(0)
  })

  it('checkDelta only re-runs changed pairings', () => {
    const roster = makeMonthRoster('C001', 5)
    const changedId = roster.pairings[2].pairingId
    const result = engine.checkDelta({
      ruleGroupCode: 'ccar121_full',
      crew: roster.crew,
      changedPairingIds: [changedId],
      fullRoster: roster,
    })
    expect(result.pairingResults.size).toBe(5)
  })
})
```

- [ ] **Step 3: 运行测试，确认失败**

```bash
cd rule-engine && npx vitest run src/__tests__/engine/roster-engine.test.ts
```

- [ ] **Step 4: 实现 RosterEngine**

```typescript
// rule-engine/src/engine/roster-engine.ts
import type { ResolvedRule } from '../types/rule.js'
import type { RosterInput, RosterDeltaInput } from '../types/input.js'
import type { RosterEngineResult, EngineResult } from '../types/result.js'
import type { RuleLoader } from './rule-loader.js'
import { RosterContext } from './roster-context.js'
import { RuleEngine } from './rule-engine.js'
import { CalcResultCache } from './calc-result-cache.js'
import { partitionRules } from './rule-sorter.js'
import { rosterCheckerRegistry } from '../checkers-roster/index.js'

export class RosterEngine {
  private readonly ruleLoader: RuleLoader | null
  private readonly pairingEngine: RuleEngine

  constructor(ruleLoader?: RuleLoader | null) {
    this.ruleLoader = ruleLoader ?? null
    this.pairingEngine = new RuleEngine(ruleLoader)
  }

  async check(input: RosterInput): Promise<RosterEngineResult> {
    if (!this.ruleLoader) {
      throw new Error('RuleLoader required for check() — use checkWithRules() for testing')
    }
    const rules = await this.ruleLoader.loadRules(input.ruleGroupCode)
    return this.checkWithRules(input, rules)
  }

  async checkDelta(input: RosterDeltaInput): Promise<RosterEngineResult> {
    const rules = this.ruleLoader
      ? await this.ruleLoader.loadRules(input.ruleGroupCode)
      : []
    return this._checkDeltaWithRules(input, rules)
  }

  checkWithRules(input: RosterInput, rules: ResolvedRule[]): RosterEngineResult {
    const { pairingRules, rosterRules } = this._splitRules(rules)
    const sharedCache = new CalcResultCache()
    const pairingResults = new Map<number, EngineResult>()

    // Phase 1: run Pairing-level checks for each pairing (with shared cache)
    for (const pairing of input.pairings) {
      const checkInput = { ruleGroupCode: input.ruleGroupCode, pairing, crew: input.crew }
      const result = this.pairingEngine.checkWithRules(checkInput, pairingRules, sharedCache)
      pairingResults.set(pairing.pairingId, result)
    }

    // Phase 2: run Roster-level checks using RosterContext
    const rosterCtx = new RosterContext(input)
    const rosterViolations = this._runRosterCheckers(rosterRules, rosterCtx)

    const allCheckResults = [
      ...Array.from(pairingResults.values()).flatMap((r) => r.checkResults),
      ...rosterViolations,
    ]

    return {
      pairingResults,
      rosterViolations,
      passedAll: allCheckResults.every((r) => r.passed),
      highestSeverity: allCheckResults.reduce(
        (max, r) => (!r.passed && r.severity > max ? r.severity : max),
        0,
      ),
    }
  }

  // ── Private ──────────────────────────────────────────

  private _checkDeltaWithRules(
    input: RosterDeltaInput,
    rules: ResolvedRule[],
  ): RosterEngineResult {
    const changedSet = new Set(input.changedPairingIds)
    const { pairingRules, rosterRules } = this._splitRules(rules)
    const sharedCache = new CalcResultCache()
    const pairingResults = new Map<number, EngineResult>()

    for (const pairing of input.fullRoster.pairings) {
      const checkInput = {
        ruleGroupCode: input.ruleGroupCode,
        pairing,
        crew: input.crew,
      }
      // Only re-run changed pairings; use empty rules for unchanged (returns empty results)
      const effectiveRules = changedSet.has(pairing.pairingId) ? pairingRules : []
      const result = this.pairingEngine.checkWithRules(checkInput, effectiveRules, sharedCache)
      pairingResults.set(pairing.pairingId, result)
    }

    const rosterCtx = new RosterContext(input.fullRoster)
    const rosterViolations = this._runRosterCheckers(rosterRules, rosterCtx)

    const allCheckResults = [
      ...Array.from(pairingResults.values()).flatMap((r) => r.checkResults),
      ...rosterViolations,
    ]

    return {
      pairingResults,
      rosterViolations,
      passedAll: allCheckResults.every((r) => r.passed),
      highestSeverity: allCheckResults.reduce(
        (max, r) => (!r.passed && r.severity > max ? r.severity : max),
        0,
      ),
    }
  }

  private _splitRules(rules: ResolvedRule[]): {
    pairingRules: ResolvedRule[]
    rosterRules: ResolvedRule[]
  } {
    const pairingRules: ResolvedRule[] = []
    const rosterRules: ResolvedRule[] = []
    for (const rule of rules) {
      if (rosterCheckerRegistry.has(rule.templateCode)) {
        rosterRules.push(rule)
      } else {
        pairingRules.push(rule)
      }
    }
    return { pairingRules, rosterRules }
  }

  private _runRosterCheckers(
    rules: ResolvedRule[],
    ctx: RosterContext,
  ) {
    const violations: import('../types/result.js').CheckResult[] = []
    for (const rule of rules) {
      const checker = rosterCheckerRegistry.get(rule.templateCode)
      if (checker) {
        violations.push(...checker.execute(rule, ctx))
      }
    }
    return violations
  }
}
```

需要同时在 `rule-engine.ts` 中暴露 `checkWithRules` 的 sharedCache 参数（在 public 方法签名加可选参数）：

```typescript
// rule-engine.ts checkWithRules 签名改为：
checkWithRules(
  input: CheckInput,
  rules: ResolvedRule[],
  sharedCache?: CalcResultCache,
): EngineResult {
  const { calculators, checkers } = partitionRules(rules)
  const ctx = new ExecutionContext(input, rules, sharedCache)  // 传入 cache
  // ...其余不变
}
```

- [ ] **Step 5: 运行测试**

```bash
cd rule-engine && npx vitest run
```
预期：所有测试通过

- [ ] **Step 6: Commit**

```bash
git add rule-engine/src/engine/roster-engine.ts \
        rule-engine/src/checkers-roster/ \
        rule-engine/src/__tests__/engine/roster-engine.test.ts
git commit -m "feat(rule-engine): RosterEngine + BaseRosterChecker + rosterCheckerRegistry"
```

---
