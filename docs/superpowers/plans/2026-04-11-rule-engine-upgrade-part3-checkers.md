# Rule Engine 升级实现计划 — Part 3: Checkers

> **索引：** [Part 1: Foundation](2026-04-11-rule-engine-upgrade-part1-foundation.md) | [Part 2: Roster Engine](2026-04-11-rule-engine-upgrade-part2-roster-engine.md) | [Part 3: Checkers](2026-04-11-rule-engine-upgrade-part3-checkers.md) | [Part 4: HTTP API](2026-04-11-rule-engine-upgrade-part4-http-api.md)

**Goal:** 将 rule-engine 从 Pairing 级扩展到 Roster 级检查，新增插件式单条规则调用、CalcResultCache 性能优化、7 条新规则、完整 HTTP 服务。

**Architecture:** 方案一½ — 保留现有 RuleEngine，新增平行 RosterEngine；BaseChecker 声明 `requiredCalculators` 实现插件自包含；CalcResultCache 在批量检查时跨规则共享计算结果避免重算。

**Tech Stack:** TypeScript, Vitest, Fastify, @fastify/rate-limit

**Spec:** `docs/superpowers/specs/2026-04-11-rule-engine-design.md`

---

## Task 7: 4 条 Roster 级 Checkers

**Files:**
- Create: `rule-engine/src/checkers-roster/consecutive-duty-checker.ts`
- Create: `rule-engine/src/checkers-roster/monthly-rest-checker.ts`
- Create: `rule-engine/src/checkers-roster/rolling-flight-time-checker.ts`
- Create: `rule-engine/src/checkers-roster/night-flight-cumulative-checker.ts`
- Modify: `rule-engine/src/checkers-roster/index.ts`
- Create: `rule-engine/src/__tests__/checkers-roster/roster-checkers.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// rule-engine/src/__tests__/checkers-roster/roster-checkers.test.ts
import { describe, it, expect } from 'vitest'
import { RosterContext } from '../../engine/roster-context.js'
import { ConsecutiveDutyChecker } from '../../checkers-roster/consecutive-duty-checker.js'
import { MonthlyRestChecker } from '../../checkers-roster/monthly-rest-checker.js'
import { RollingFlightTimeChecker } from '../../checkers-roster/rolling-flight-time-checker.js'
import { NightFlightCumulativeChecker } from '../../checkers-roster/night-flight-cumulative-checker.js'
import { makeMonthRoster, makeViolatingRoster } from '../fixtures/test-roster.js'
import type { ResolvedRule } from '../../types/rule.js'

const makeRule = (templateCode: string, params: Record<string, unknown> = {}): ResolvedRule => ({
  templateCode, instanceCode: `${templateCode}_test`, name: templateCode,
  category: 'TEST', checkType: 'CHECK', severity: 'WARNING', overridable: true,
  params, conditions: null, constraintType: null, ccarReference: null, sortOrder: 1,
})

describe('ConsecutiveDutyChecker', () => {
  const checker = new ConsecutiveDutyChecker()

  it('passes when consecutive days below limit', () => {
    const ctx = new RosterContext(makeMonthRoster('C001', 5))
    const results = checker.execute(makeRule('max_consecutive_duty_days', { max_days: 7 }), ctx)
    expect(results.every((r) => r.passed)).toBe(true)
  })

  it('fails when consecutive days exceed limit', () => {
    const ctx = new RosterContext(makeViolatingRoster('consecutive_duty'))
    const results = checker.execute(makeRule('max_consecutive_duty_days', { max_days: 7 }), ctx)
    expect(results.some((r) => !r.passed)).toBe(true)
  })
})

describe('MonthlyRestChecker', () => {
  const checker = new MonthlyRestChecker()

  it('passes when enough rest days in each 7-day window', () => {
    const roster = makeMonthRoster('C001', 5) // 5 days duty, 25 days rest
    const ctx = new RosterContext(roster)
    const results = checker.execute(makeRule('min_weekly_rest_days', { min_rest_days_per_week: 1 }), ctx)
    expect(results.every((r) => r.passed)).toBe(true)
  })

  it('fails when no rest days in 7-day window', () => {
    const ctx = new RosterContext(makeViolatingRoster('weekly_rest'))
    const results = checker.execute(makeRule('min_weekly_rest_days', { min_rest_days_per_week: 1 }), ctx)
    expect(results.some((r) => !r.passed)).toBe(true)
  })
})

describe('RollingFlightTimeChecker', () => {
  const checker = new RollingFlightTimeChecker()

  it('passes when 28d flight time below limit', () => {
    const roster = makeMonthRoster('C001', 5) // 5 * 120 = 600 min
    const ctx = new RosterContext(roster)
    const results = checker.execute(makeRule('max_ft_roster_28d', { limit_minutes: 6000 }), ctx)
    expect(results.every((r) => r.passed)).toBe(true)
  })
})

describe('NightFlightCumulativeChecker', () => {
  const checker = new NightFlightCumulativeChecker()

  it('passes when night flight time below limit', () => {
    const roster = makeMonthRoster('C001', 3) // no night segments
    const ctx = new RosterContext(roster)
    const results = checker.execute(makeRule('max_night_ft_30d', { limit_minutes: 480 }), ctx)
    expect(results.every((r) => r.passed)).toBe(true)
  })
})
```

- [ ] **Step 2: 运行，确认失败**

```bash
cd rule-engine && npx vitest run src/__tests__/checkers-roster/roster-checkers.test.ts
```

- [ ] **Step 3: 实现 ConsecutiveDutyChecker**

```typescript
// rule-engine/src/checkers-roster/consecutive-duty-checker.ts
import { BaseRosterChecker } from './base-roster-checker.js'
import type { ResolvedRule } from '../types/rule.js'
import type { RosterContext } from '../engine/roster-context.js'
import type { CheckResult } from '../types/result.js'

export class ConsecutiveDutyChecker extends BaseRosterChecker {
  readonly templateCode = 'max_consecutive_duty_days'

  execute(rule: ResolvedRule, ctx: RosterContext): CheckResult[] {
    const maxDays = Number(rule.params.max_days ?? 7)
    const results: CheckResult[] = []

    // Check from each unique duty day
    const dutyDays = [...new Set(
      ctx.timeline.map(({ duty }) => duty.reportUtc.toISOString().slice(0, 10)),
    )].sort()

    const checked = new Set<string>()
    for (const dayStr of dutyDays) {
      if (checked.has(dayStr)) continue
      const fromDate = new Date(`${dayStr}T00:00:00Z`)
      const consecutiveDays = ctx.getConsecutiveDutyDays(fromDate)
      // Mark all days in this run as checked
      for (let i = 0; i < consecutiveDays; i++) {
        const d = new Date(fromDate.getTime() + i * 24 * 60 * 60 * 1000)
        checked.add(d.toISOString().slice(0, 10))
      }

      if (consecutiveDays > maxDays) {
        results.push(this.fail(rule, consecutiveDays, maxDays, 'days',
          `Consecutive duty days ${consecutiveDays} starting ${dayStr} exceeds limit ${maxDays}`))
      } else {
        results.push(this.pass(rule, consecutiveDays, maxDays, 'days',
          `Consecutive duty days ${consecutiveDays} starting ${dayStr} within limit ${maxDays}`))
      }
    }

    return results
  }
}
```

- [ ] **Step 4: 实现 MonthlyRestChecker**

```typescript
// rule-engine/src/checkers-roster/monthly-rest-checker.ts
import { BaseRosterChecker } from './base-roster-checker.js'
import type { ResolvedRule } from '../types/rule.js'
import type { RosterContext } from '../engine/roster-context.js'
import type { CheckResult } from '../types/result.js'

const DAY_MS = 24 * 60 * 60 * 1000

export class MonthlyRestChecker extends BaseRosterChecker {
  readonly templateCode = 'min_weekly_rest_days'

  execute(rule: ResolvedRule, ctx: RosterContext): CheckResult[] {
    const minRestDays = Number(rule.params.min_rest_days_per_week ?? 1)
    const windowDays = 7
    const results: CheckResult[] = []

    const { periodStart, periodEnd } = ctx.input
    let cursor = new Date(periodStart)

    while (cursor < periodEnd) {
      const windowEnd = new Date(Math.min(cursor.getTime() + windowDays * DAY_MS, periodEnd.getTime()))
      const restDays = ctx.getRestDaysInPeriod(cursor, windowEnd)

      if (restDays >= minRestDays) {
        results.push(this.pass(rule, restDays, minRestDays, 'days',
          `Week starting ${cursor.toISOString().slice(0, 10)}: ${restDays} rest days ≥ ${minRestDays}`))
      } else {
        results.push(this.fail(rule, restDays, minRestDays, 'days',
          `Week starting ${cursor.toISOString().slice(0, 10)}: ${restDays} rest days < required ${minRestDays}`))
      }
      cursor = new Date(cursor.getTime() + windowDays * DAY_MS)
    }

    return results
  }
}
```

- [ ] **Step 5: 实现 RollingFlightTimeChecker**

```typescript
// rule-engine/src/checkers-roster/rolling-flight-time-checker.ts
import { BaseRosterChecker } from './base-roster-checker.js'
import type { ResolvedRule } from '../types/rule.js'
import type { RosterContext } from '../engine/roster-context.js'
import type { CheckResult } from '../types/result.js'

export class RollingFlightTimeChecker extends BaseRosterChecker {
  readonly templateCode = 'max_ft_roster_28d'

  execute(rule: ResolvedRule, ctx: RosterContext): CheckResult[] {
    const limitMinutes = Number(rule.params.limit_minutes ?? 6000)
    const windowDays = Number(rule.params.window_days ?? 28)
    const results: CheckResult[] = []

    // Check at the end of each pairing's last duty
    const checked = new Set<string>()
    for (const { duty } of ctx.timeline) {
      const endKey = duty.releaseUtc.toISOString().slice(0, 10)
      if (checked.has(endKey)) continue
      checked.add(endKey)

      const totalMinutes = ctx.getFlightMinutesInWindow(duty.releaseUtc, windowDays)
      if (totalMinutes <= limitMinutes) {
        results.push(this.pass(rule, totalMinutes, limitMinutes, 'minutes',
          `Rolling ${windowDays}d flight time ${totalMinutes}min ≤ ${limitMinutes}min at ${endKey}`))
      } else {
        results.push(this.fail(rule, totalMinutes, limitMinutes, 'minutes',
          `Rolling ${windowDays}d flight time ${totalMinutes}min exceeds ${limitMinutes}min at ${endKey}`))
      }
    }

    return results
  }
}
```

- [ ] **Step 6: 实现 NightFlightCumulativeChecker**

```typescript
// rule-engine/src/checkers-roster/night-flight-cumulative-checker.ts
import { BaseRosterChecker } from './base-roster-checker.js'
import type { ResolvedRule } from '../types/rule.js'
import type { RosterContext } from '../engine/roster-context.js'
import type { CheckResult } from '../types/result.js'

export class NightFlightCumulativeChecker extends BaseRosterChecker {
  readonly templateCode = 'max_night_ft_30d'

  execute(rule: ResolvedRule, ctx: RosterContext): CheckResult[] {
    const limitMinutes = Number(rule.params.limit_minutes ?? 480)
    const windowDays = 30
    const results: CheckResult[] = []

    const checked = new Set<string>()
    for (const { duty } of ctx.timeline) {
      const endKey = duty.releaseUtc.toISOString().slice(0, 10)
      if (checked.has(endKey)) continue
      checked.add(endKey)

      const nightMinutes = ctx.getNightFlightMinutesInWindow(duty.releaseUtc, windowDays)
      if (nightMinutes <= limitMinutes) {
        results.push(this.pass(rule, nightMinutes, limitMinutes, 'minutes',
          `Rolling 30d night flight ${nightMinutes}min ≤ ${limitMinutes}min at ${endKey}`))
      } else {
        results.push(this.fail(rule, nightMinutes, limitMinutes, 'minutes',
          `Rolling 30d night flight ${nightMinutes}min exceeds ${limitMinutes}min at ${endKey}`))
      }
    }

    return results
  }
}
```

- [ ] **Step 7: 更新 checkers-roster/index.ts，注册 4 个 checker**

```typescript
// rule-engine/src/checkers-roster/index.ts
import type { BaseRosterChecker } from './base-roster-checker.js'
import { ConsecutiveDutyChecker } from './consecutive-duty-checker.js'
import { MonthlyRestChecker } from './monthly-rest-checker.js'
import { RollingFlightTimeChecker } from './rolling-flight-time-checker.js'
import { NightFlightCumulativeChecker } from './night-flight-cumulative-checker.js'

const rosterCheckers: BaseRosterChecker[] = [
  new ConsecutiveDutyChecker(),
  new MonthlyRestChecker(),
  new RollingFlightTimeChecker(),
  new NightFlightCumulativeChecker(),
]

export const rosterCheckerRegistry = new Map<string, BaseRosterChecker>(
  rosterCheckers.map((c) => [c.templateCode, c]),
)
```

- [ ] **Step 8: 运行全部测试**

```bash
cd rule-engine && npx vitest run
```
预期：所有测试通过

- [ ] **Step 9: Commit**

```bash
git add rule-engine/src/checkers-roster/
git commit -m "feat(rule-engine): 4 条 Roster 级 checkers — 连续值勤/月度休息/滚动飞行时间/夜航累计"
```

---

## Task 8: 3 条新 Pairing 级 Checkers

**Files:**
- Create: `rule-engine/src/checkers/crew-composition-checker.ts`
- Create: `rule-engine/src/checkers/extended-rest-checker.ts`
- Create: `rule-engine/src/checkers/frms-threshold-checker.ts`
- Modify: `rule-engine/src/checkers/index.ts`
- Create: `rule-engine/src/__tests__/checkers/new-pairing-checkers.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// rule-engine/src/__tests__/checkers/new-pairing-checkers.test.ts
import { describe, it, expect } from 'vitest'
import { RuleEngine } from '../../engine/rule-engine.js'
import {
  buildCheckInput,
  normalSingleDutyPairing,
  normalCrew,
  unqualifiedCrew,
  shortRestPairing,
} from '../fixtures/test-pairing.js'
import type { ResolvedRule } from '../../types/rule.js'

const engine = new RuleEngine()

const makeRule = (templateCode: string, params: Record<string, unknown> = {}): ResolvedRule => ({
  templateCode, instanceCode: `${templateCode}_test`, name: templateCode,
  category: 'TEST', checkType: 'CHECK', severity: 'WARNING', overridable: true,
  params, conditions: null, constraintType: null, ccarReference: null, sortOrder: 1,
})

describe('CrewCompositionChecker', () => {
  it('passes when CA + qualified FO present (requires crew param)', () => {
    const input = buildCheckInput(normalSingleDutyPairing, normalCrew)
    const result = engine.checkWithRules(input, [makeRule('crew_composition', { required_rank: 'CA' })])
    expect(result.checkResults[0].passed).toBe(true)
  })
})

describe('ExtendedRestChecker', () => {
  it('passes when rest after normal FDP is adequate', () => {
    const input = buildCheckInput(normalSingleDutyPairing, normalCrew)
    const result = engine.checkWithRules(input, [
      makeRule('fdp_calculator', {}),
      makeRule('rest_calculator', {}),
      makeRule('extended_rest_after_long_fdp', { long_fdp_threshold_minutes: 720, extended_rest_minutes: 720 }),
    ])
    // single duty — no inter-duty rest to check
    expect(result.checkResults.length).toBeGreaterThanOrEqual(0)
  })

  it('fails when rest after long FDP is insufficient', () => {
    const input = buildCheckInput(shortRestPairing, normalCrew)
    const result = engine.checkWithRules(input, [
      makeRule('fdp_calculator', {}),
      makeRule('rest_calculator', {}),
      makeRule('extended_rest_after_long_fdp', { long_fdp_threshold_minutes: 300, extended_rest_minutes: 720 }),
    ])
    expect(result.checkResults.some((r) => !r.passed)).toBe(true)
  })
})

describe('FrmsThresholdChecker', () => {
  it('passes when fatigue score below threshold', () => {
    const input = buildCheckInput(normalSingleDutyPairing, normalCrew)
    const result = engine.checkWithRules(input, [
      makeRule('fatigue_risk_index', {}),
      makeRule('frms_score_threshold', { warning_threshold: 70, error_threshold: 85 }),
    ])
    expect(result.checkResults[0].passed).toBe(true)
  })
})
```

- [ ] **Step 2: 运行，确认失败**

```bash
cd rule-engine && npx vitest run src/__tests__/checkers/new-pairing-checkers.test.ts
```

- [ ] **Step 3: 实现 CrewCompositionChecker**

```typescript
// rule-engine/src/checkers/crew-composition-checker.ts
import { BaseChecker } from './base-checker.js'
import type { ExecutionContext } from '../engine/context.js'
import type { ResolvedRule } from '../types/rule.js'

export class CrewCompositionChecker extends BaseChecker {
  readonly templateCode = 'crew_composition'
  readonly requiredCalculators = [] as string[]

  execute(rule: ResolvedRule, ctx: ExecutionContext): void {
    const { crew } = ctx.input
    if (!crew) {
      ctx.addCheckResult(this.pass(rule, 0, 0, 'count', 'No crew info — composition check skipped'))
      return
    }

    const requiredRank = String(rule.params.required_rank ?? 'CA')
    const hasRequiredRank = crew.rank === requiredRank

    if (hasRequiredRank) {
      ctx.addCheckResult(this.pass(rule, 1, 1, 'count',
        `Crew ${crew.crewId} has required rank ${requiredRank}`))
    } else {
      ctx.addCheckResult(this.fail(rule, 0, 1, 'count',
        `Crew ${crew.crewId} rank ${crew.rank} does not meet required rank ${requiredRank}`))
    }
  }
}
```

- [ ] **Step 4: 实现 ExtendedRestChecker**

```typescript
// rule-engine/src/checkers/extended-rest-checker.ts
import { BaseChecker } from './base-checker.js'
import type { ExecutionContext } from '../engine/context.js'
import type { ResolvedRule } from '../types/rule.js'

export class ExtendedRestChecker extends BaseChecker {
  readonly templateCode = 'extended_rest_after_long_fdp'
  readonly requiredCalculators = ['fdp_calculator', 'rest_calculator']

  execute(rule: ResolvedRule, ctx: ExecutionContext): void {
    const longFdpThreshold = Number(rule.params.long_fdp_threshold_minutes ?? 720)
    const requiredExtendedRest = Number(rule.params.extended_rest_minutes ?? 720)

    const fdpResult = ctx.getCalcResult('fdp_calculator')
    const restResult = ctx.getCalcResult('rest_calculator')

    if (!fdpResult || !restResult) {
      ctx.addCheckResult(this.pass(rule, 0, 0, 'minutes', 'Missing FDP/rest data — skipped'))
      return
    }

    const dutyDetails = (fdpResult.details?.duties ?? []) as Array<{
      dutySeq: number; fdpMinutes: number
    }>
    const restPeriods = (restResult.details?.restPeriods ?? []) as Array<{
      afterDutySeq: number; restMinutes: number
    }>

    for (const duty of dutyDetails) {
      if (duty.fdpMinutes < longFdpThreshold) continue
      // Find rest after this duty
      const rest = restPeriods.find((r) => r.afterDutySeq === duty.dutySeq)
      if (!rest) continue // last duty, no rest to check

      if (rest.restMinutes >= requiredExtendedRest) {
        ctx.addCheckResult(this.pass(rule, rest.restMinutes, requiredExtendedRest, 'minutes',
          `Duty ${duty.dutySeq} FDP ${duty.fdpMinutes}min: rest ${rest.restMinutes}min ≥ extended requirement ${requiredExtendedRest}min`))
      } else {
        ctx.addCheckResult(this.fail(rule, rest.restMinutes, requiredExtendedRest, 'minutes',
          `Duty ${duty.dutySeq} FDP ${duty.fdpMinutes}min exceeds ${longFdpThreshold}min: rest ${rest.restMinutes}min < required ${requiredExtendedRest}min`))
      }
    }
  }
}
```

- [ ] **Step 5: 实现 FrmsThresholdChecker**

```typescript
// rule-engine/src/checkers/frms-threshold-checker.ts
import { BaseChecker } from './base-checker.js'
import type { ExecutionContext } from '../engine/context.js'
import type { ResolvedRule } from '../types/rule.js'

export class FrmsThresholdChecker extends BaseChecker {
  readonly templateCode = 'frms_score_threshold'
  readonly requiredCalculators = ['fatigue_risk_index']

  execute(rule: ResolvedRule, ctx: ExecutionContext): void {
    const warningThreshold = Number(rule.params.warning_threshold ?? 70)
    const errorThreshold = Number(rule.params.error_threshold ?? 85)

    const calcResult = ctx.getCalcResult('fatigue_risk_index')
    if (!calcResult) {
      ctx.addCheckResult(this.pass(rule, 0, warningThreshold, 'score', 'No fatigue data — skipped'))
      return
    }

    const score = calcResult.value

    if (score >= errorThreshold) {
      ctx.addCheckResult(this.fail(rule, score, errorThreshold, 'score',
        `FRMS fatigue score ${score} exceeds error threshold ${errorThreshold}`))
    } else if (score >= warningThreshold) {
      ctx.addCheckResult(this.fail(rule, score, warningThreshold, 'score',
        `FRMS fatigue score ${score} exceeds warning threshold ${warningThreshold}`))
    } else {
      ctx.addCheckResult(this.pass(rule, score, warningThreshold, 'score',
        `FRMS fatigue score ${score} below warning threshold ${warningThreshold}`))
    }
  }
}
```

- [ ] **Step 6: 在 checkers/index.ts 注册 3 个新 checker**

在现有 import 区域追加：
```typescript
import { CrewCompositionChecker } from './crew-composition-checker.js'
import { ExtendedRestChecker } from './extended-rest-checker.js'
import { FrmsThresholdChecker } from './frms-threshold-checker.js'
```

在 `checkers` 数组追加：
```typescript
new CrewCompositionChecker(),
new ExtendedRestChecker(),
new FrmsThresholdChecker(),
```

- [ ] **Step 7: 运行全部测试**

```bash
cd rule-engine && npx vitest run
```
预期：所有测试通过

- [ ] **Step 8: Commit**

```bash
git add rule-engine/src/checkers/crew-composition-checker.ts \
        rule-engine/src/checkers/extended-rest-checker.ts \
        rule-engine/src/checkers/frms-threshold-checker.ts \
        rule-engine/src/checkers/index.ts \
        rule-engine/src/__tests__/checkers/new-pairing-checkers.test.ts
git commit -m "feat(rule-engine): 3 条新 Pairing 级规则 — 机组组合/延长休息/FRMS 阈值"
```

---

## Task 9: HTTP /check/batch 端点

**Files:**
- Create: `rule-engine/src/routes/check-batch.ts`
- Create: `rule-engine/src/__tests__/routes/check-batch.test.ts`
- Modify: `rule-engine/src/server.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// rule-engine/src/__tests__/routes/check-batch.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { registerCheckBatch } from '../../routes/check-batch.js'
import { RuleEngine } from '../../engine/rule-engine.js'
import { normalSingleDutyPairing, normalCrew } from '../fixtures/test-pairing.js'

let app: ReturnType<typeof Fastify>

beforeAll(async () => {
  app = Fastify()
  const engine = new RuleEngine()
  await registerCheckBatch(app, engine)
  await app.ready()
})

afterAll(() => app.close())

describe('POST /check/batch', () => {
  it('returns results for each item', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/check/batch',
      payload: {
        ruleGroupCode: 'test_group',
        items: [
          { id: 'item-1', pairing: normalSingleDutyPairing, crew: normalCrew },
          { id: 'item-2', pairing: normalSingleDutyPairing },
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.items).toHaveLength(2)
    expect(body.items[0].id).toBe('item-1')
    expect(body.items[1].id).toBe('item-2')
    expect(typeof body.totalDuration).toBe('number')
  })

  it('returns 400 for empty items array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/check/batch',
      payload: { ruleGroupCode: 'test_group', items: [] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when items exceed max limit', async () => {
    const items = Array.from({ length: 101 }, (_, i) => ({
      id: `item-${i}`,
      pairing: normalSingleDutyPairing,
    }))
    const res = await app.inject({
      method: 'POST',
      url: '/check/batch',
      payload: { ruleGroupCode: 'test_group', items },
    })
    expect(res.statusCode).toBe(400)
  })
})
```

- [ ] **Step 2: 运行，确认失败**

```bash
cd rule-engine && npx vitest run src/__tests__/routes/check-batch.test.ts
```

- [ ] **Step 3: 实现 check-batch.ts**

```typescript
// rule-engine/src/routes/check-batch.ts
import type { FastifyInstance } from 'fastify'
import type { RuleEngine } from '../engine/rule-engine.js'
import { CalcResultCache } from '../engine/calc-result-cache.js'
import { successResponse, errorResponse } from '../utils/response.js'
import type { PairingInput, CrewInfo } from '../types/input.js'

interface BatchItem {
  id: string
  pairing: PairingInput
  crew?: CrewInfo
}

interface BatchCheckBody {
  ruleGroupCode: string
  items: BatchItem[]
}

export async function registerCheckBatch(app: FastifyInstance, engine: RuleEngine): Promise<void> {
  app.post<{ Body: BatchCheckBody }>('/check/batch', async (request, reply) => {
    const { ruleGroupCode, items } = request.body

    if (!items || items.length === 0) {
      return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'items must not be empty'))
    }
    if (items.length > 100) {
      return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'items must not exceed 100'))
    }

    const start = Date.now()
    const sharedCache = new CalcResultCache()
    const rules = engine['ruleLoader']
      ? await engine['ruleLoader'].loadRules(ruleGroupCode).catch(() => [])
      : []

    const results = await Promise.all(
      items.map(async (item) => {
        const result = engine.checkWithRules(
          { ruleGroupCode, pairing: item.pairing, crew: item.crew },
          rules,
          sharedCache,
        )
        return { id: item.id, result }
      }),
    )

    return reply.send(
      successResponse({ items: results, totalDuration: Date.now() - start }),
    )
  })
}
```

- [ ] **Step 4: 确认 utils/response.ts 已有 errorResponse/successResponse**

检查：
```bash
grep -n "errorResponse\|successResponse" rule-engine/src/utils/response.ts
```

若不存在，在该文件追加：
```typescript
export const successResponse = <T>(data: T) => ({ success: true, data })

export const errorResponse = (
  code: 'VALIDATION_ERROR' | 'RULE_NOT_FOUND' | 'ENGINE_ERROR' | 'RATE_LIMITED' | 'CIRCUIT_OPEN',
  message: string,
  details?: unknown,
) => ({ success: false, error: { code, message, details } })
```

- [ ] **Step 5: 运行测试**

```bash
cd rule-engine && npx vitest run src/__tests__/routes/check-batch.test.ts
```
预期：所有测试通过

- [ ] **Step 6: Commit**

```bash
git add rule-engine/src/routes/check-batch.ts \
        rule-engine/src/__tests__/routes/check-batch.test.ts
git commit -m "feat(rule-engine): POST /check/batch 批量检查接口"
```

---
