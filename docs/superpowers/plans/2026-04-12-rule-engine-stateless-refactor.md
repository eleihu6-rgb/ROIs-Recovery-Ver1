# Rule Engine 无状态重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `RuleEngine` / `RosterEngine` 重构为纯计算引擎，彻底移除 DB 读取操作；规则加载由调用方（HTTP 路由层或 npm 消费方）负责。

**Architecture:** 引擎构造函数无参数，不持有 `RuleLoader` 引用。HTTP 路由接收 `loader: RuleLoader | null` 作为独立参数，在调用引擎前自行完成 `loadRules()`。`RosterEngine.checkDeltaWithRules()` 由私有方法提升为 public 同步方法，取代原来的 async `checkDelta()`。

**Tech Stack:** TypeScript, Vitest, Fastify

---

## File Map

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/engine/rule-engine.ts` | Modify | 删除构造参数、`loader` getter、`check()` 方法 |
| `src/engine/roster-engine.ts` | Modify | 删除构造参数、`loader` getter、`check()`、`checkDelta()`；`_checkDeltaWithRules` → `checkDeltaWithRules` (public) |
| `src/routes/check-batch.ts` | Modify | 函数签名加 `loader: RuleLoader \| null`；直接用 `loader?.loadRules()` |
| `src/routes/check-roster.ts` | Modify | 函数签名加 `loader: RuleLoader \| null`；`engine.checkDelta` → `engine.checkDeltaWithRules` |
| `src/server.ts` | Modify | 引擎构造无参数；routes 多传 `ruleLoader` |
| `src/__tests__/engine/rule-engine.test.ts` | Modify | 删除 `check (with RuleLoader)` describe 块 |
| `src/__tests__/engine/roster-engine.test.ts` | Modify | `await engine.checkDelta` → `engine.checkDeltaWithRules` |
| `src/__tests__/routes/check-batch.test.ts` | Modify | `registerCheckBatch(app, engine)` → `registerCheckBatch(app, engine, null)` |
| `src/__tests__/routes/check-roster.test.ts` | Modify | `registerCheckRoster(app, engine)` → `registerCheckRoster(app, engine, null)` |
| `CLAUDE.md`（rule-engine 目录下） | Modify | 新增调用规范章节 |

---

## Task 1: 重构 RuleEngine — 移除 loader 依赖

**Files:**
- Modify: `src/engine/rule-engine.ts`
- Modify: `src/__tests__/engine/rule-engine.test.ts`

- [ ] **Step 1: 删除 rule-engine.test.ts 中 `check (with RuleLoader)` describe 块**

  删除 `src/__tests__/engine/rule-engine.test.ts` 中第 164-185 行整个块：

  ```typescript
  // 删除以下整个 describe 块：
  describe('check (with RuleLoader)', () => {
    it('throws when no RuleLoader configured', async () => {
      const input = buildCheckInput(normalSingleDutyPairing)
      await expect(engine.check(input)).rejects.toThrow('RuleLoader not configured')
    })

    it('works with a mock RuleLoader', async () => {
      const mockLoader = {
        loadRules: async (_code: string) => [fdpCalcRule, maxFdpRule],
        invalidate: () => {},
        loadGroups: async () => [],
        loadTemplates: async () => [],
        loadGroupDetail: async () => null,
      }
      const engineWithLoader = new RuleEngine(mockLoader as any)
      const input = buildCheckInput(normalSingleDutyPairing)
      const result = await engineWithLoader.check(input)

      expect(result.passedAll).toBe(true)
      expect(result.calcResults).toHaveLength(1)
    })
  })
  ```

- [ ] **Step 2: 运行测试确认删除后仍通过**

  ```bash
  cd rule-engine && npx vitest run src/__tests__/engine/rule-engine.test.ts
  ```

  Expected: 全部通过（被删除的 2 个用例不再出现）

- [ ] **Step 3: 重写 rule-engine.ts — 移除 loader 相关代码**

  将 `src/engine/rule-engine.ts` 替换为：

  ```typescript
  // ============================================================
  // RuleEngine — core execution engine
  //
  // Pure computation — no DB dependency.
  // Callers must load rules via RuleLoader.loadRules() before calling.
  //
  // Usage:
  //   const engine = new RuleEngine()
  //   const rules = await loader.loadRules(groupCode)
  //   const result = engine.checkWithRules(input, rules)
  //
  // Usage (single-rule, auto-injects required calculators):
  //   const result = engine.checkRule('max_fdp', input)
  // ============================================================

  import type { CheckInput } from '../types/input.js'
  import type { EngineResult } from '../types/result.js'
  import type { ResolvedRule } from '../types/rule.js'
  import type { CalcResultCache } from './calc-result-cache.js'
  import { ExecutionContext } from './context.js'
  import { partitionRules } from './rule-sorter.js'
  import { calculatorRegistry } from '../calculators/index.js'
  import { checkerRegistry } from '../checkers/index.js'

  export class RuleEngine {
    constructor() {}

    /**
     * Execute rules against input with pre-loaded rules.
     * No DB needed — rules must be loaded by the caller.
     */
    checkWithRules(input: CheckInput, rules: ResolvedRule[], sharedCache?: CalcResultCache): EngineResult {
      const { calculators, checkers } = partitionRules(rules)
      const ctx = new ExecutionContext(input, rules, sharedCache)

      // Phase 1: run all calculators
      this.runCalculatorsWithCache(calculators, ctx)

      // Phase 2: run all checkers (they use calculator outputs)
      this.runCheckers(checkers, ctx)

      // Aggregate results
      const checkResults = ctx.checkResults
      const passedAll = checkResults.every((r) => r.passed)
      const highestSeverity = checkResults.reduce(
        (max, r) => (!r.passed && r.severity > max ? r.severity : max),
        0,
      )

      return {
        calcResults: ctx.calcResults,
        checkResults,
        passedAll,
        highestSeverity,
      }
    }

    // ── Public: single-rule invocation ──────────────────

    /**
     * Check a single rule by templateCode, auto-injecting required calculators.
     * No RuleLoader or pre-loaded rule set needed.
     *
     * NOTE: Uses stub rule configuration (severity=WARNING, no params, no conditions).
     * For production-configured severity and params, use checkWithRules().
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

      // Validate all declared calculator deps are registered
      for (const code of checker.requiredCalculators) {
        if (!calculatorRegistry.has(code)) {
          throw new Error(
            `Checker '${templateCode}' declares unknown calculator dependency: '${code}'`,
          )
        }
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

    // ── Private ──────────────────────────────────────────

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

          calculator.execute(rule, ctx)

          const result = ctx.getCalcResult(rule.templateCode)
          if (result) {
            ctx.sharedCache.set(cacheKey, result)
          }
        } else {
          calculator.execute(rule, ctx)
        }
      }
    }

    private runCheckers(checkers: ResolvedRule[], ctx: ExecutionContext): void {
      for (const rule of checkers) {
        const checker = checkerRegistry.get(rule.templateCode)
        if (checker) {
          checker.execute(rule, ctx)
        }
        // Silently skip unknown checker template codes
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
  }
  ```

- [ ] **Step 4: 运行测试确认通过**

  ```bash
  cd rule-engine && npx vitest run src/__tests__/engine/rule-engine.test.ts
  ```

  Expected: 全部通过

- [ ] **Step 5: Commit**

  ```bash
  git add rule-engine/src/engine/rule-engine.ts rule-engine/src/__tests__/engine/rule-engine.test.ts
  git commit -m "refactor(rule-engine): RuleEngine 移除 loader 依赖，纯计算引擎"
  ```

---

## Task 2: 重构 RosterEngine — 移除 loader 依赖 + 暴露 checkDeltaWithRules

**Files:**
- Modify: `src/engine/roster-engine.ts`
- Modify: `src/__tests__/engine/roster-engine.test.ts`

- [ ] **Step 1: 更新 roster-engine.test.ts — checkDelta → checkDeltaWithRules**

  将 `src/__tests__/engine/roster-engine.test.ts` 中第 22-33 行替换：

  ```typescript
  // 原来（async + checkDelta）：
  it('checkDelta only re-runs changed pairings', async () => {
    const roster = makeMonthRoster('C001', 5)
    const changedId = roster.pairings[2].pairingId
    const result = await engine.checkDelta({
      ruleGroupCode: 'ccar121_full',
      crew: roster.crew,
      changedPairingIds: [changedId],
      fullRoster: roster,
    })
    expect(result.pairingResults.size).toBe(5)
    expect(result.rosterViolations).toHaveLength(0)
  })

  // 替换为（同步 + checkDeltaWithRules）：
  it('checkDeltaWithRules only re-runs changed pairings', () => {
    const roster = makeMonthRoster('C001', 5)
    const changedId = roster.pairings[2].pairingId
    const result = engine.checkDeltaWithRules(
      {
        ruleGroupCode: 'ccar121_full',
        crew: roster.crew,
        changedPairingIds: [changedId],
        fullRoster: roster,
      },
      [],
    )
    expect(result.pairingResults.size).toBe(5)
    expect(result.rosterViolations).toHaveLength(0)
  })
  ```

- [ ] **Step 2: 运行测试确认失败**

  ```bash
  cd rule-engine && npx vitest run src/__tests__/engine/roster-engine.test.ts
  ```

  Expected: FAIL — `engine.checkDeltaWithRules is not a function`

- [ ] **Step 3: 重写 roster-engine.ts**

  将 `src/engine/roster-engine.ts` 替换为：

  ```typescript
  // rule-engine/src/engine/roster-engine.ts
  //
  // Pure computation — no DB dependency.
  // Callers must load rules via RuleLoader.loadRules() before calling.
  //
  // Usage:
  //   const engine = new RosterEngine()
  //   const rules = await loader.loadRules(groupCode)
  //   const result = engine.checkWithRules(rosterInput, rules)
  //   const delta  = engine.checkDeltaWithRules(deltaInput, rules)

  import type { ResolvedRule } from '../types/rule.js'
  import type { RosterInput, RosterDeltaInput } from '../types/input.js'
  import type { RosterEngineResult, EngineResult, CheckResult } from '../types/result.js'
  import { RosterContext } from './roster-context.js'
  import { RuleEngine } from './rule-engine.js'
  import { CalcResultCache } from './calc-result-cache.js'
  import { rosterCheckerRegistry } from '../checkers-roster/index.js'

  export class RosterEngine {
    private readonly pairingEngine: RuleEngine

    constructor() {
      this.pairingEngine = new RuleEngine()
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

    /**
     * Delta check: only re-runs changed pairings, roster-level always runs.
     * Rules must be loaded by the caller before calling this method.
     */
    checkDeltaWithRules(
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
        // Only re-run changed pairings; use empty rules for unchanged
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

    // ── Private ──────────────────────────────────────────

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
    ): CheckResult[] {
      const violations: CheckResult[] = []
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

- [ ] **Step 4: 运行测试确认通过**

  ```bash
  cd rule-engine && npx vitest run src/__tests__/engine/roster-engine.test.ts
  ```

  Expected: 全部通过

- [ ] **Step 5: Commit**

  ```bash
  git add rule-engine/src/engine/roster-engine.ts rule-engine/src/__tests__/engine/roster-engine.test.ts
  git commit -m "refactor(rule-engine): RosterEngine 移除 loader 依赖，checkDelta → checkDeltaWithRules"
  ```

---

## Task 3: 更新 HTTP 路由 — 接收 loader 作为独立参数

**Files:**
- Modify: `src/routes/check-batch.ts`
- Modify: `src/routes/check-roster.ts`
- Modify: `src/__tests__/routes/check-batch.test.ts`
- Modify: `src/__tests__/routes/check-roster.test.ts`

- [ ] **Step 1: 更新 check-batch.test.ts — 传入 null loader**

  将 `src/__tests__/routes/check-batch.test.ts` 中 `beforeAll` 块替换：

  ```typescript
  beforeAll(async () => {
    app = Fastify()
    const engine = new RuleEngine()
    await registerCheckBatch(app, engine, null)   // ← 加 null
    await app.ready()
  })
  ```

- [ ] **Step 2: 更新 check-roster.test.ts — 传入 null loader**

  将 `src/__tests__/routes/check-roster.test.ts` 中 `beforeAll` 块替换：

  ```typescript
  beforeAll(async () => {
    app = Fastify()
    const engine = new RosterEngine()
    await registerCheckRoster(app, engine, null)  // ← 加 null
    await app.ready()
  })
  ```

- [ ] **Step 3: 运行路由测试确认失败**

  ```bash
  cd rule-engine && npx vitest run src/__tests__/routes/
  ```

  Expected: FAIL — 函数签名不匹配（TS 编译错误 / 参数数量不对）

- [ ] **Step 4: 更新 check-batch.ts — 加 loader 参数**

  将 `src/routes/check-batch.ts` 替换为：

  ```typescript
  // ============================================================
  // POST /check/batch — batch pairing check
  // ============================================================

  import type { FastifyInstance } from 'fastify'
  import type { RuleEngine } from '../engine/rule-engine.js'
  import type { RuleLoader } from '../engine/rule-loader.js'
  import type { ResolvedRule } from '../types/rule.js'
  import { CalcResultCache } from '../engine/calc-result-cache.js'
  import { errorResponse, successResponse } from '../utils/response.js'
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

  export async function registerCheckBatch(
    app: FastifyInstance,
    engine: RuleEngine,
    loader: RuleLoader | null,
  ): Promise<void> {
    app.post<{ Body: BatchCheckBody }>('/check/batch', async (request, reply) => {
      const { ruleGroupCode, items } = request.body ?? {}

      if (!items || items.length === 0) {
        return reply
          .status(400)
          .send(errorResponse('VALIDATION_ERROR', 'items must not be empty'))
      }
      if (items.length > 100) {
        return reply
          .status(400)
          .send(errorResponse('VALIDATION_ERROR', 'items must not exceed 100'))
      }

      const start = Date.now()
      const sharedCache = new CalcResultCache()

      // Load rules from DB loader if available; fallback to empty rules (no-DB / test mode)
      let rules: ResolvedRule[] = []
      if (loader) {
        try {
          rules = await loader.loadRules(ruleGroupCode)
        } catch {
          // DB unavailable — proceed with empty rule set
        }
      }

      const results = items.map((item) => {
        let result
        try {
          result = engine.checkWithRules(
            { ruleGroupCode, pairing: item.pairing, crew: item.crew },
            rules,
            sharedCache,
          )
        } catch (err) {
          return { id: item.id, error: err instanceof Error ? err.message : 'Unknown error' }
        }
        return { id: item.id, result }
      })

      return reply.send(
        successResponse({ items: results, totalDuration: Date.now() - start }),
      )
    })
  }
  ```

- [ ] **Step 5: 更新 check-roster.ts — 加 loader 参数，checkDelta → checkDeltaWithRules**

  将 `src/routes/check-roster.ts` 替换为：

  ```typescript
  // ============================================================
  // POST /check/roster         — full-roster check
  // POST /check/roster/delta   — incremental delta check
  // ============================================================

  import type { FastifyInstance } from 'fastify'
  import type { RosterEngine } from '../engine/roster-engine.js'
  import type { RuleLoader } from '../engine/rule-loader.js'
  import type { EngineResult, RosterEngineResult } from '../types/result.js'
  import type { ResolvedRule } from '../types/rule.js'
  import { successResponse, errorResponse } from '../utils/response.js'
  import type { RosterInput, RosterDeltaInput, DutyPeriod, FlightSegment, PairingInput } from '../types/input.js'

  // ── Date rehydration ──────────────────────────────────────

  function rehydrateSegment(s: FlightSegment): FlightSegment {
    return {
      ...s,
      stdUtc: new Date(s.stdUtc),
      staUtc: new Date(s.staUtc),
    }
  }

  function rehydrateDuty(d: DutyPeriod): DutyPeriod {
    return {
      ...d,
      reportUtc: new Date(d.reportUtc),
      releaseUtc: new Date(d.releaseUtc),
      segments: d.segments.map(rehydrateSegment),
    }
  }

  function rehydratePairing(p: PairingInput): PairingInput {
    return {
      ...p,
      duties: p.duties.map(rehydrateDuty),
    }
  }

  function rehydrateRoster(input: RosterInput): RosterInput {
    return {
      ...input,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      pairings: input.pairings.map(rehydratePairing),
    }
  }

  // ── Serialization (Map → plain object for JSON) ──────────

  function serializeEngineResult(result: EngineResult): unknown {
    return {
      calcResults: result.calcResults,
      checkResults: result.checkResults,
      passedAll: result.passedAll,
      highestSeverity: result.highestSeverity,
    }
  }

  function serializeResult(result: RosterEngineResult): unknown {
    return {
      pairingResults: Object.fromEntries(
        [...result.pairingResults.entries()].map(([k, v]) => [k, serializeEngineResult(v)]),
      ),
      rosterViolations: result.rosterViolations,
      passedAll: result.passedAll,
      highestSeverity: result.highestSeverity,
    }
  }

  // ── Route registration ────────────────────────────────────

  export async function registerCheckRoster(
    app: FastifyInstance,
    engine: RosterEngine,
    loader: RuleLoader | null,
  ): Promise<void> {
    app.post<{ Body: RosterInput }>('/check/roster', async (request, reply) => {
      const input = request.body
      if (!input.pairings || !input.crew) {
        return reply
          .status(400)
          .send(errorResponse('VALIDATION_ERROR', 'pairings and crew are required'))
      }

      // Load rules from DB if loader available; fallback to empty rule set
      let rules: ResolvedRule[] = []
      if (loader) {
        try {
          rules = await loader.loadRules(input.ruleGroupCode)
        } catch {
          // DB unavailable — proceed with empty rule set
        }
      }

      const rehydrated = rehydrateRoster(input)
      const result = engine.checkWithRules(rehydrated, rules)
      return reply.send(successResponse(serializeResult(result)))
    })

    app.post<{ Body: RosterDeltaInput }>('/check/roster/delta', async (request, reply) => {
      const input = request.body
      if (!input.fullRoster || !input.changedPairingIds) {
        return reply
          .status(400)
          .send(errorResponse('VALIDATION_ERROR', 'fullRoster and changedPairingIds are required'))
      }

      // Load rules from DB if loader available; fallback to empty rule set
      let rules: ResolvedRule[] = []
      if (loader) {
        try {
          rules = await loader.loadRules(input.ruleGroupCode)
        } catch {
          // DB unavailable — proceed with empty rule set
        }
      }

      const rehydrated: RosterDeltaInput = {
        ...input,
        fullRoster: rehydrateRoster(input.fullRoster),
      }
      const result = engine.checkDeltaWithRules(rehydrated, rules)
      return reply.send(successResponse(serializeResult(result)))
    })
  }
  ```

- [ ] **Step 6: 运行路由测试确认通过**

  ```bash
  cd rule-engine && npx vitest run src/__tests__/routes/
  ```

  Expected: 全部通过

- [ ] **Step 7: Commit**

  ```bash
  git add rule-engine/src/routes/check-batch.ts rule-engine/src/routes/check-roster.ts \
    rule-engine/src/__tests__/routes/check-batch.test.ts rule-engine/src/__tests__/routes/check-roster.test.ts
  git commit -m "refactor(rule-engine): HTTP 路由接收独立 loader 参数，移除 engine.loader 访问"
  ```

---

## Task 4: 更新 server.ts — 引擎构造无参数，loader 独立传入路由

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: 更新 server.ts 中引擎构造和路由注册**

  将 `src/server.ts` 中第 70-76 行替换：

  ```typescript
  // Before:
  const ruleLoader = app.ruleLoader as RuleLoader
  const engine = new RuleEngine(ruleLoader)
  const rosterEngine = new RosterEngine(ruleLoader)

  await registerCheckBatch(app, engine)
  await registerCheckRoster(app, rosterEngine)
  await registerRules(app, ruleLoader)

  // After:
  const ruleLoader = app.ruleLoader as RuleLoader
  const engine = new RuleEngine()
  const rosterEngine = new RosterEngine()

  await registerCheckBatch(app, engine, ruleLoader)
  await registerCheckRoster(app, rosterEngine, ruleLoader)
  await registerRules(app, ruleLoader)
  ```

- [ ] **Step 2: 运行完整测试套件**

  ```bash
  cd rule-engine && npx vitest run
  ```

  Expected: 所有测试通过，0 failed

- [ ] **Step 3: Commit**

  ```bash
  git add rule-engine/src/server.ts
  git commit -m "refactor(rule-engine): server.ts 引擎构造无参数，loader 独立传入路由"
  ```

---

## Task 5: 更新 CLAUDE.md — 写入调用规范

**Files:**
- Modify: `rule-engine/CLAUDE.md`

- [ ] **Step 1: 在 CLAUDE.md 末尾追加调用规范章节**

  在 `rule-engine/CLAUDE.md` 末尾添加：

  ```markdown
  ## 引擎调用规范（强制）

  ### 核心约束

  1. **`RuleEngine` / `RosterEngine` 构造函数不接受任何参数**
  2. **引擎内部禁止任何 DB / IO 操作**（违反此规范应在 code review 中拒绝）
  3. **规则加载（`RuleLoader.loadRules()`）必须在引擎调用前由调用方完成**
  4. **HTTP 路由层是 `RuleLoader` 的持有者**，负责将 rules 传递给引擎
  5. **npm 包消费方自持 `RuleLoader` 实例**，按 groupCode 加载规则后再调用引擎

  ### 标准调用模式

  ```typescript
  import { RuleEngine, RuleLoader } from '@rois/rule-engine'

  // 1. 调用方自己持有 loader（传入 DB 连接）
  const loader = new RuleLoader(db)
  const engine = new RuleEngine()   // 纯计算，无 DB 依赖

  // 2. 执行前先加载规则集合（调用方负责缓存策略）
  const rules = await loader.loadRules('ccar121_full')

  // 3. 执行检查（rules 可跨多次调用复用）
  const result = engine.checkWithRules({ ruleGroupCode, pairing, crew }, rules)
  ```

  ### RosterEngine delta 检查

  ```typescript
  import { RosterEngine, RuleLoader } from '@rois/rule-engine'

  const loader = new RuleLoader(db)
  const rosterEngine = new RosterEngine()

  const rules = await loader.loadRules('ccar121_full')

  // 全量检查
  const fullResult = rosterEngine.checkWithRules(rosterInput, rules)

  // 增量检查（只重算变更的 pairing）
  const deltaResult = rosterEngine.checkDeltaWithRules(deltaInput, rules)
  ```

  ### 调用方一览

  | 调用方 | 使用方式 | 规则来源 |
  |--------|---------|---------|
  | Live Server | npm 直接导入 | 自持 `RuleLoader`，按 groupCode 加载 |
  | PBS Server | npm 直接导入 | 自持 `RuleLoader`，按 groupCode 加载 |
  | PO engine | npm 直接导入 | 自持规则集（外部传入） |
  | RO engine | npm 直接导入 | 自持规则集（外部传入） |
  | Gantt | HTTP port 3001 | 路由层持有 `RuleLoader`，每次请求加载 |
  ```

- [ ] **Step 2: 运行完整测试套件确认无回归**

  ```bash
  cd rule-engine && npx vitest run
  ```

  Expected: 全部通过

- [ ] **Step 3: Commit**

  ```bash
  git add rule-engine/CLAUDE.md
  git commit -m "docs(rule-engine): CLAUDE.md 写入引擎调用规范"
  ```
