# Rule Engine 升级实现计划 — Part 1: Foundation

> **索引：** [Part 1: Foundation](2026-04-11-rule-engine-upgrade-part1-foundation.md) | [Part 2: Roster Engine](2026-04-11-rule-engine-upgrade-part2-roster-engine.md) | [Part 3: Checkers](2026-04-11-rule-engine-upgrade-part3-checkers.md) | [Part 4: HTTP API](2026-04-11-rule-engine-upgrade-part4-http-api.md)

**Goal:** 将 rule-engine 从 Pairing 级扩展到 Roster 级检查，新增插件式单条规则调用、CalcResultCache 性能优化、7 条新规则、完整 HTTP 服务。

**Architecture:** 方案一½ — 保留现有 RuleEngine，新增平行 RosterEngine；BaseChecker 声明 `requiredCalculators` 实现插件自包含；CalcResultCache 在批量检查时跨规则共享计算结果避免重算。

**Tech Stack:** TypeScript, Vitest, Fastify, @fastify/rate-limit

**Spec:** `docs/superpowers/specs/2026-04-11-rule-engine-design.md`

---

## 已知 Template Codes（实现前必读）

| 类 | templateCode |
|---|---|
| FdpCalculator | `fdp_calculator` |
| FlightTimeCalculator | `flight_hour_calculator` |
| DutyTimeCalculator | `duty_period_calculator` |
| RestTimeCalculator | `rest_calculator` |
| FatigueCalculator | `fatigue_risk_index` |
| FdpChecker | `max_fdp` |
| FlightTimeChecker | `max_ft_24h` / `max_ft_7d` / `max_ft_28d` / `max_ft_365d` |
| DutyPeriodChecker | `max_dp` |
| DutyCumulativeChecker | `max_dp_7d` |
| MinRestChecker | `min_rest` |
| WeeklyRestChecker | `min_rest_weekly` |
| AirportQualChecker | `qual_airport` |
| FleetQualChecker | `qual_fleet` |
| RecencyChecker | `recency` |

---

## Task 1: CalcResultCache

**Files:**
- Create: `rule-engine/src/engine/calc-result-cache.ts`
- Create: `rule-engine/src/__tests__/engine/calc-result-cache.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// rule-engine/src/__tests__/engine/calc-result-cache.test.ts
import { describe, it, expect } from 'vitest'
import { CalcResultCache } from '../../engine/calc-result-cache.js'
import type { PairingInput } from '../../types/input.js'
import { normalSingleDutyPairing } from '../fixtures/test-pairing.js'

describe('CalcResultCache', () => {
  it('returns undefined for cache miss', () => {
    const cache = new CalcResultCache()
    const key = cache.pairingKey(normalSingleDutyPairing, 'fdp_calculator')
    expect(cache.get(key)).toBeUndefined()
  })

  it('returns stored result on cache hit', () => {
    const cache = new CalcResultCache()
    const key = cache.pairingKey(normalSingleDutyPairing, 'fdp_calculator')
    const result = { ruleCode: 'fdp_calculator', ruleName: 'FDP', value: 600, unit: 'minutes' }
    cache.set(key, result)
    expect(cache.get(key)).toEqual(result)
  })

  it('generates different keys for different template codes', () => {
    const cache = new CalcResultCache()
    const k1 = cache.pairingKey(normalSingleDutyPairing, 'fdp_calculator')
    const k2 = cache.pairingKey(normalSingleDutyPairing, 'rest_calculator')
    expect(k1).not.toBe(k2)
  })

  it('generates different keys for different pairings', () => {
    const cache = new CalcResultCache()
    const p2: PairingInput = { ...normalSingleDutyPairing, pairingId: 9999 }
    const k1 = cache.pairingKey(normalSingleDutyPairing, 'fdp_calculator')
    const k2 = cache.pairingKey(p2, 'fdp_calculator')
    expect(k1).not.toBe(k2)
  })

  it('clear() removes all entries', () => {
    const cache = new CalcResultCache()
    const key = cache.pairingKey(normalSingleDutyPairing, 'fdp_calculator')
    cache.set(key, { ruleCode: 'fdp_calculator', ruleName: 'FDP', value: 600, unit: 'minutes' })
    cache.clear()
    expect(cache.get(key)).toBeUndefined()
  })

  it('size reflects entries', () => {
    const cache = new CalcResultCache()
    expect(cache.size).toBe(0)
    const key = cache.pairingKey(normalSingleDutyPairing, 'fdp_calculator')
    cache.set(key, { ruleCode: 'fdp_calculator', ruleName: 'FDP', value: 600, unit: 'minutes' })
    expect(cache.size).toBe(1)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd rule-engine && npx vitest run src/__tests__/engine/calc-result-cache.test.ts
```
预期：`Error: Cannot find module '../../engine/calc-result-cache.js'`

- [ ] **Step 3: 实现 CalcResultCache**

```typescript
// rule-engine/src/engine/calc-result-cache.ts
import type { CalcResult } from '../types/result.js'
import type { PairingInput } from '../types/input.js'

export class CalcResultCache {
  private readonly store = new Map<string, CalcResult>()

  /**
   * Build a cache key for a pairing-level calculation.
   * Uses pairingId when > 0; falls back to first/last duty timestamps for unsaved pairings.
   */
  pairingKey(pairing: PairingInput, templateCode: string): string {
    let pairingHash: string
    if (pairing.pairingId > 0) {
      pairingHash = String(pairing.pairingId)
    } else {
      const first = pairing.duties[0]
      const last = pairing.duties[pairing.duties.length - 1]
      pairingHash = `${first?.reportUtc.getTime() ?? 0}-${last?.releaseUtc.getTime() ?? 0}`
    }
    return `${templateCode}:${pairingHash}`
  }

  get(key: string): CalcResult | undefined {
    return this.store.get(key)
  }

  set(key: string, result: CalcResult): void {
    this.store.set(key, result)
  }

  clear(): void {
    this.store.clear()
  }

  get size(): number {
    return this.store.size
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd rule-engine && npx vitest run src/__tests__/engine/calc-result-cache.test.ts
```
预期：`6 tests passed`

- [ ] **Step 5: Commit**

```bash
git add rule-engine/src/engine/calc-result-cache.ts \
        rule-engine/src/__tests__/engine/calc-result-cache.test.ts
git commit -m "feat(rule-engine): CalcResultCache — 跨规则共享计算结果缓存"
```

---

## Task 2: BaseChecker.requiredCalculators + 更新现有 12 个 Checkers

**Files:**
- Modify: `rule-engine/src/checkers/base-checker.ts`
- Modify: `rule-engine/src/checkers/fdp-checker.ts`
- Modify: `rule-engine/src/checkers/flight-time-checker.ts`
- Modify: `rule-engine/src/checkers/duty-checker.ts`
- Modify: `rule-engine/src/checkers/rest-checker.ts`
- Modify: `rule-engine/src/checkers/qualification-checker.ts`

- [ ] **Step 1: 在 BaseChecker 新增抽象字段**

编辑 `rule-engine/src/checkers/base-checker.ts`，在 `templateCode` 之后加一行：

```typescript
/** Calculator templateCodes this checker depends on. Engine auto-injects them for checkRule(). */
abstract readonly requiredCalculators: string[]
```

- [ ] **Step 2: 写验证测试（确保所有 checker 都实现了该字段）**

在 `rule-engine/src/__tests__/checkers/` 新增文件 `required-calculators.test.ts`：

```typescript
// rule-engine/src/__tests__/checkers/required-calculators.test.ts
import { describe, it, expect } from 'vitest'
import { checkerRegistry } from '../../checkers/index.js'

describe('BaseChecker.requiredCalculators', () => {
  it('every registered checker declares requiredCalculators array', () => {
    for (const [code, checker] of checkerRegistry) {
      expect(
        Array.isArray(checker.requiredCalculators),
        `${code} is missing requiredCalculators`,
      ).toBe(true)
    }
  })

  it('fdp checker has no calculator dependencies', () => {
    expect(checkerRegistry.get('max_fdp')?.requiredCalculators).toEqual([])
  })

  it('flight time checkers depend on flight_hour_calculator', () => {
    for (const code of ['max_ft_24h', 'max_ft_7d', 'max_ft_28d', 'max_ft_365d']) {
      expect(checkerRegistry.get(code)?.requiredCalculators).toContain('flight_hour_calculator')
    }
  })

  it('min_rest depends on rest_calculator', () => {
    expect(checkerRegistry.get('min_rest')?.requiredCalculators).toContain('rest_calculator')
  })

  it('min_rest_weekly depends on rest_calculator', () => {
    expect(checkerRegistry.get('min_rest_weekly')?.requiredCalculators).toContain('rest_calculator')
  })

  it('max_dp_7d depends on duty_period_calculator', () => {
    expect(checkerRegistry.get('max_dp_7d')?.requiredCalculators).toContain('duty_period_calculator')
  })
})
```

- [ ] **Step 3: 运行测试，确认失败**

```bash
cd rule-engine && npx vitest run src/__tests__/checkers/required-calculators.test.ts
```
预期：TypeScript 编译错误或运行时 `undefined` 断言失败

- [ ] **Step 4: 更新 fdp-checker.ts**

在 `FdpChecker` 类中加一行（`templateCode` 之后）：
```typescript
readonly requiredCalculators = [] as string[]
```

- [ ] **Step 5: 更新 flight-time-checker.ts**

在 `FlightTimeChecker` 类中加一行：
```typescript
readonly requiredCalculators = ['flight_hour_calculator']
```

- [ ] **Step 6: 更新 duty-checker.ts**

`DutyPeriodChecker` 加：
```typescript
readonly requiredCalculators = [] as string[]
```
`DutyCumulativeChecker` 加：
```typescript
readonly requiredCalculators = ['duty_period_calculator']
```

- [ ] **Step 7: 更新 rest-checker.ts**

`MinRestChecker` 和 `WeeklyRestChecker` 都加：
```typescript
readonly requiredCalculators = ['rest_calculator']
```

- [ ] **Step 8: 更新 qualification-checker.ts**

`AirportQualChecker`、`FleetQualChecker`、`RecencyChecker` 都加：
```typescript
readonly requiredCalculators = [] as string[]
```

- [ ] **Step 9: 运行所有测试，确认全部通过**

```bash
cd rule-engine && npx vitest run
```
预期：所有原有 149 个 + 新增 6 个 = 155 个测试通过

- [ ] **Step 10: Commit**

```bash
git add rule-engine/src/checkers/ \
        rule-engine/src/__tests__/checkers/required-calculators.test.ts
git commit -m "feat(rule-engine): BaseChecker.requiredCalculators — 插件式依赖声明"
```

---

## Task 3: RuleEngine.checkRule() + ExecutionContext sharedCache

**Files:**
- Modify: `rule-engine/src/engine/rule-engine.ts`
- Modify: `rule-engine/src/engine/context.ts`
- Create: `rule-engine/src/__tests__/engine/check-rule.test.ts`

- [ ] **Step 1: 更新 ExecutionContext，接受可选 sharedCache**

编辑 `rule-engine/src/engine/context.ts`，在 import 区域顶部加：

```typescript
import type { CalcResultCache } from './calc-result-cache.js'
```

将构造函数改为：

```typescript
constructor(
  input: CheckInput,
  rules: ResolvedRule[],
  readonly sharedCache?: CalcResultCache,
) {
  this.input = input
  this.rules = rules
}
```

- [ ] **Step 2: 写 checkRule() 的失败测试**

```typescript
// rule-engine/src/__tests__/engine/check-rule.test.ts
import { describe, it, expect } from 'vitest'
import { RuleEngine } from '../../engine/rule-engine.js'
import { CalcResultCache } from '../../engine/calc-result-cache.js'
import { buildCheckInput, normalSingleDutyPairing, normalCrew } from '../fixtures/test-pairing.js'

const engine = new RuleEngine()

describe('RuleEngine.checkRule()', () => {
  it('checks a single rule by templateCode without needing DB', () => {
    const input = buildCheckInput(normalSingleDutyPairing, normalCrew)
    const result = engine.checkRule('max_fdp', input)
    expect(result.checkResults).toHaveLength(1)
    expect(result.checkResults[0].ruleCode).toBe('max_fdp')
  })

  it('auto-injects calculator dependency for flight time checker', () => {
    const input = buildCheckInput(normalSingleDutyPairing, normalCrew)
    const result = engine.checkRule('max_ft_24h', input)
    // Should have one calc result (flight_hour_calculator) and one check result
    expect(result.calcResults.length).toBeGreaterThan(0)
    expect(result.checkResults[0].ruleCode).toBe('max_ft_24h')
  })

  it('throws when templateCode is not registered', () => {
    const input = buildCheckInput(normalSingleDutyPairing)
    expect(() => engine.checkRule('nonexistent_rule', input)).toThrow('Unknown rule')
  })

  it('uses shared cache to avoid redundant calculation', () => {
    const cache = new CalcResultCache()
    const input = buildCheckInput(normalSingleDutyPairing, normalCrew)

    // First call populates cache
    engine.checkRule('max_ft_24h', input, cache)
    expect(cache.size).toBeGreaterThan(0)

    // Second call should hit cache (we verify by checking size doesn't grow)
    const sizeBefore = cache.size
    engine.checkRule('max_ft_7d', input, cache)  // same calc dependency
    expect(cache.size).toBe(sizeBefore)           // no new entries — hit cached flight_hour_calculator
  })
})
```

- [ ] **Step 3: 运行测试，确认失败**

```bash
cd rule-engine && npx vitest run src/__tests__/engine/check-rule.test.ts
```
预期：`engine.checkRule is not a function`

- [ ] **Step 4: 在 rule-engine.ts 中实现 checkRule()**

在 `rule-engine.ts` 顶部新增 import：

```typescript
import type { CalcResultCache } from './calc-result-cache.js'
import { calculatorRegistry } from '../calculators/index.js'
```

（已有的 import 保留）在 `RuleEngine` 类中新增两个方法（放在 `checkWithRules` 之后）：

```typescript
/**
 * Check a single rule by templateCode, auto-injecting required calculators.
 * No RuleLoader or pre-loaded rule set needed.
 */
checkRule(
  templateCode: string,
  input: CheckInput,
  sharedCache?: CalcResultCache,
): EngineResult {
  const checker = checkerRegistry.get(templateCode)
  if (!checker) {
    throw new Error(`Unknown rule: ${templateCode}. Not registered in checkerRegistry.`)
  }

  // Build minimal resolved rules: dependencies first, then the checker
  const calcRules: ResolvedRule[] = checker.requiredCalculators.map((code) =>
    this.makeMinimalCalcRule(code),
  )
  const checkRule = this.makeMinimalCheckRule(templateCode)

  const rules = [...calcRules, checkRule]
  const ctx = new ExecutionContext(input, rules, sharedCache)

  this.runCalculatorsWithCache(calcRules, ctx)
  this.runCheckers([checkRule], ctx)

  const checkResults = ctx.checkResults
  return {
    calcResults: ctx.calcResults,
    checkResults,
    passedAll: checkResults.every((r) => r.passed),
    highestSeverity: checkResults.reduce(
      (max, r) => (!r.passed && r.severity > max ? r.severity : max),
      0,
    ),
  }
}

private makeMinimalCalcRule(templateCode: string): ResolvedRule {
  return {
    templateCode,
    instanceCode: `${templateCode}_auto`,
    name: templateCode,
    category: 'AUTO',
    checkType: 'CALC',
    severity: 'INFO',
    overridable: false,
    params: {},
    conditions: null,
    constraintType: null,
    ccarReference: null,
    sortOrder: 0,
  }
}

private makeMinimalCheckRule(templateCode: string): ResolvedRule {
  return {
    templateCode,
    instanceCode: `${templateCode}_standalone`,
    name: templateCode,
    category: 'AUTO',
    checkType: 'CHECK',
    severity: 'WARNING',
    overridable: true,
    params: {},
    conditions: null,
    constraintType: null,
    ccarReference: null,
    sortOrder: 999,
  }
}
```

- [ ] **Step 5: 替换现有 runCalculators() 为带缓存版本**

将现有私有方法 `runCalculators` 改名为 `runCalculatorsWithCache` 并加入缓存逻辑：

```typescript
private runCalculatorsWithCache(
  calculators: ResolvedRule[],
  ctx: ExecutionContext,
): void {
  for (const rule of calculators) {
    const calculator = calculatorRegistry.get(rule.templateCode)
    if (!calculator) continue

    if (ctx.sharedCache) {
      const cacheKey = ctx.sharedCache.pairingKey(ctx.input.pairing, rule.templateCode)
      const cached = ctx.sharedCache.get(cacheKey)
      if (cached) {
        ctx.setCalcResult(rule.templateCode, cached)
        continue
      }
    }

    calculator.execute(rule, ctx)

    if (ctx.sharedCache) {
      const result = ctx.getCalcResult(rule.templateCode)
      if (result) {
        const cacheKey = ctx.sharedCache.pairingKey(ctx.input.pairing, rule.templateCode)
        ctx.sharedCache.set(cacheKey, result)
      }
    }
  }
}
```

在现有 `checkWithRules` 中，将 `this.runCalculators(calculators, ctx)` 改为：

```typescript
this.runCalculatorsWithCache(calculators, ctx)
```

删除原来的 `private runCalculators` 方法。

- [ ] **Step 6: 运行全部测试**

```bash
cd rule-engine && npx vitest run
```
预期：所有测试通过（含新增 4 个）

- [ ] **Step 7: Commit**

```bash
git add rule-engine/src/engine/rule-engine.ts \
        rule-engine/src/engine/context.ts \
        rule-engine/src/__tests__/engine/check-rule.test.ts
git commit -m "feat(rule-engine): checkRule() 单条规则独立调用 + CalcResultCache 集成"
```

---
