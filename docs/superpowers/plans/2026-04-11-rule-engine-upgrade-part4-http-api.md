# Rule Engine 升级实现计划 — Part 4: HTTP API

> **索引：** [Part 1: Foundation](2026-04-11-rule-engine-upgrade-part1-foundation.md) | [Part 2: Roster Engine](2026-04-11-rule-engine-upgrade-part2-roster-engine.md) | [Part 3: Checkers](2026-04-11-rule-engine-upgrade-part3-checkers.md) | [Part 4: HTTP API](2026-04-11-rule-engine-upgrade-part4-http-api.md)

**Goal:** 将 rule-engine 从 Pairing 级扩展到 Roster 级检查，新增插件式单条规则调用、CalcResultCache 性能优化、7 条新规则、完整 HTTP 服务。

**Architecture:** 方案一½ — 保留现有 RuleEngine，新增平行 RosterEngine；BaseChecker 声明 `requiredCalculators` 实现插件自包含；CalcResultCache 在批量检查时跨规则共享计算结果避免重算。

**Tech Stack:** TypeScript, Vitest, Fastify, @fastify/rate-limit

**Spec:** `docs/superpowers/specs/2026-04-11-rule-engine-design.md`

---

## Task 10: HTTP /check/roster + /check/roster/delta 端点

**Files:**
- Create: `rule-engine/src/routes/check-roster.ts`
- Create: `rule-engine/src/__tests__/routes/check-roster.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// rule-engine/src/__tests__/routes/check-roster.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { registerCheckRoster } from '../../routes/check-roster.js'
import { RosterEngine } from '../../engine/roster-engine.js'
import { makeMonthRoster } from '../fixtures/test-roster.js'

let app: ReturnType<typeof Fastify>

beforeAll(async () => {
  app = Fastify()
  const engine = new RosterEngine()
  await registerCheckRoster(app, engine)
  await app.ready()
})

afterAll(() => app.close())

describe('POST /check/roster', () => {
  it('returns RosterEngineResult', async () => {
    const roster = makeMonthRoster('C001', 3)
    const res = await app.inject({
      method: 'POST',
      url: '/check/roster',
      payload: roster,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data).toHaveProperty('rosterViolations')
    expect(body.data).toHaveProperty('passedAll')
  })
})

describe('POST /check/roster/delta', () => {
  it('returns RosterEngineResult for delta input', async () => {
    const roster = makeMonthRoster('C001', 5)
    const res = await app.inject({
      method: 'POST',
      url: '/check/roster/delta',
      payload: {
        ruleGroupCode: 'ccar121_full',
        crew: roster.crew,
        changedPairingIds: [roster.pairings[0].pairingId],
        fullRoster: roster,
      },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data).toHaveProperty('rosterViolations')
  })
})
```

- [ ] **Step 2: 实现 check-roster.ts**

```typescript
// rule-engine/src/routes/check-roster.ts
import type { FastifyInstance } from 'fastify'
import type { RosterEngine } from '../engine/roster-engine.js'
import { successResponse, errorResponse } from '../utils/response.js'
import type { RosterInput, RosterDeltaInput } from '../types/input.js'

export async function registerCheckRoster(
  app: FastifyInstance,
  engine: RosterEngine,
): Promise<void> {
  app.post<{ Body: RosterInput }>('/check/roster', async (request, reply) => {
    const input = request.body
    if (!input.pairings || !input.crew) {
      return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'pairings and crew are required'))
    }
    // Rehydrate dates (JSON deserializes them as strings)
    const rehydrated: RosterInput = {
      ...input,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      pairings: input.pairings.map((p) => ({
        ...p,
        duties: p.duties.map((d) => ({
          ...d,
          reportUtc: new Date(d.reportUtc),
          releaseUtc: new Date(d.releaseUtc),
          segments: d.segments.map((s) => ({
            ...s,
            stdUtc: new Date(s.stdUtc),
            staUtc: new Date(s.staUtc),
          })),
        })),
      })),
    }

    const result = engine.checkWithRules(rehydrated, [])
    // Convert Map to plain object for JSON serialization
    return reply.send(successResponse({
      pairingResults: Object.fromEntries(result.pairingResults),
      rosterViolations: result.rosterViolations,
      passedAll: result.passedAll,
      highestSeverity: result.highestSeverity,
    }))
  })

  app.post<{ Body: RosterDeltaInput }>('/check/roster/delta', async (request, reply) => {
    const input = request.body
    if (!input.fullRoster || !input.changedPairingIds) {
      return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'fullRoster and changedPairingIds are required'))
    }
    const result = await engine.checkDelta(input)
    return reply.send(successResponse({
      pairingResults: Object.fromEntries(result.pairingResults),
      rosterViolations: result.rosterViolations,
      passedAll: result.passedAll,
      highestSeverity: result.highestSeverity,
    }))
  })
}
```

- [ ] **Step 3: 运行测试**

```bash
cd rule-engine && npx vitest run src/__tests__/routes/check-roster.test.ts
```
预期：所有测试通过

- [ ] **Step 4: Commit**

```bash
git add rule-engine/src/routes/check-roster.ts \
        rule-engine/src/__tests__/routes/check-roster.test.ts
git commit -m "feat(rule-engine): POST /check/roster + /check/roster/delta 整月检查接口"
```

---

## Task 11: HTTP /rules/* 查询端点

**Files:**
- Create: `rule-engine/src/routes/rules.ts`
- Create: `rule-engine/src/__tests__/routes/rules.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// rule-engine/src/__tests__/routes/rules.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { registerRules } from '../../routes/rules.js'
import { checkerRegistry } from '../../checkers/index.js'

let app: ReturnType<typeof Fastify>

beforeAll(async () => {
  app = Fastify()
  await registerRules(app, null)
  await app.ready()
})

afterAll(() => app.close())

describe('GET /rules/templates', () => {
  it('returns all registered checker template codes', async () => {
    const res = await app.inject({ method: 'GET', url: '/rules/templates' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.checkers.length).toBeGreaterThanOrEqual(checkerRegistry.size)
  })
})

describe('GET /rules/groups', () => {
  it('returns 503 when no DB loader configured', async () => {
    const res = await app.inject({ method: 'GET', url: '/rules/groups' })
    expect(res.statusCode).toBe(503)
  })
})
```

- [ ] **Step 2: 实现 rules.ts**

```typescript
// rule-engine/src/routes/rules.ts
import type { FastifyInstance } from 'fastify'
import type { RuleLoader } from '../engine/rule-loader.js'
import { checkerRegistry } from '../checkers/index.js'
import { calculatorRegistry } from '../calculators/index.js'
import { rosterCheckerRegistry } from '../checkers-roster/index.js'
import { successResponse, errorResponse } from '../utils/response.js'

export async function registerRules(
  app: FastifyInstance,
  ruleLoader: RuleLoader | null,
): Promise<void> {
  // GET /rules/templates — return all registered implementations (no DB needed)
  app.get('/rules/templates', async (_request, reply) => {
    const checkers = [...checkerRegistry.entries()].map(([code, c]) => ({
      templateCode: code,
      scope: 'PAIRING',
      requiredCalculators: c.requiredCalculators,
    }))
    const rosterCheckers = [...rosterCheckerRegistry.entries()].map(([code]) => ({
      templateCode: code,
      scope: 'ROSTER',
      requiredCalculators: [],
    }))
    const calculators = [...calculatorRegistry.entries()].map(([code]) => ({
      templateCode: code,
      scope: 'PAIRING',
    }))
    return reply.send(successResponse({ checkers: [...checkers, ...rosterCheckers], calculators }))
  })

  // GET /rules/groups — requires DB
  app.get('/rules/groups', async (_request, reply) => {
    if (!ruleLoader) {
      return reply.status(503).send(errorResponse('ENGINE_ERROR', 'No database loader configured'))
    }
    const groups = await ruleLoader.loadGroups()
    return reply.send(successResponse(groups))
  })

  // GET /rules/groups/:code — requires DB
  app.get<{ Params: { code: string } }>('/rules/groups/:code', async (request, reply) => {
    if (!ruleLoader) {
      return reply.status(503).send(errorResponse('ENGINE_ERROR', 'No database loader configured'))
    }
    const detail = await ruleLoader.loadGroupDetail(request.params.code)
    if (!detail) {
      return reply.status(404).send(errorResponse('RULE_NOT_FOUND', `Group ${request.params.code} not found`))
    }
    return reply.send(successResponse(detail))
  })

  // POST /rules/groups/:code/validate
  app.post<{ Params: { code: string } }>('/rules/groups/:code/validate', async (request, reply) => {
    if (!ruleLoader) {
      return reply.status(503).send(errorResponse('ENGINE_ERROR', 'No database loader configured'))
    }
    const rules = await ruleLoader.loadRules(request.params.code)
    const unknownCheckers = rules
      .filter((r) => r.checkType === 'CHECK' || r.checkType === 'BOTH')
      .filter((r) => !checkerRegistry.has(r.templateCode) && !rosterCheckerRegistry.has(r.templateCode))
      .map((r) => r.templateCode)
    const unknownCalcs = rules
      .filter((r) => r.checkType === 'CALC' || r.checkType === 'BOTH')
      .filter((r) => !calculatorRegistry.has(r.templateCode))
      .map((r) => r.templateCode)

    const valid = unknownCheckers.length === 0 && unknownCalcs.length === 0
    return reply.send(successResponse({ valid, unknownCheckers, unknownCalcs, totalRules: rules.length }))
  })
}
```

- [ ] **Step 3: 运行测试**

```bash
cd rule-engine && npx vitest run src/__tests__/routes/rules.test.ts
```
预期：所有测试通过

- [ ] **Step 4: Commit**

```bash
git add rule-engine/src/routes/rules.ts \
        rule-engine/src/__tests__/routes/rules.test.ts
git commit -m "feat(rule-engine): GET /rules/templates + /rules/groups + POST validate"
```

---

## Task 12: 限流 + 熔断插件 + 更新 server.ts

**Files:**
- Create: `rule-engine/src/plugins/circuit-breaker.ts`
- Modify: `rule-engine/src/plugins/rate-limit.ts` (或新建)
- Modify: `rule-engine/src/server.ts`

- [ ] **Step 1: 安装 @fastify/rate-limit**

```bash
cd rule-engine && npm install @fastify/rate-limit
```

验证 `package.json` 中出现 `@fastify/rate-limit`（MIT 许可，Fastify 官方插件）。

- [ ] **Step 2: 实现 CircuitBreaker**

```typescript
// rule-engine/src/plugins/circuit-breaker.ts
export class CircuitBreaker {
  private failures = 0
  private lastFailTime = 0

  constructor(
    private readonly threshold = 5,
    private readonly resetAfterMs = 30_000,
  ) {}

  isOpen(): boolean {
    if (this.failures < this.threshold) return false
    // Auto-reset after timeout
    if (Date.now() - this.lastFailTime > this.resetAfterMs) {
      this.failures = 0
      return false
    }
    return true
  }

  recordSuccess(): void {
    this.failures = 0
  }

  recordFailure(): void {
    this.failures++
    this.lastFailTime = Date.now()
  }
}
```

- [ ] **Step 3: 更新 server.ts 注册所有路由和插件**

```typescript
// rule-engine/src/server.ts — 在现有基础上追加新路由注册

// 追加 import
import rateLimit from '@fastify/rate-limit'
import { registerCheckBatch } from './routes/check-batch.js'
import { registerCheckRoster } from './routes/check-roster.js'
import { registerRules } from './routes/rules.js'
import { RosterEngine } from './engine/roster-engine.js'
import { CircuitBreaker } from './plugins/circuit-breaker.js'
```

在 `buildServer()` 函数内，现有路由注册之后追加：

```typescript
// Rate limiting (per endpoint)
await app.register(rateLimit, { global: false })

const rosterEngine = new RosterEngine(ruleLoader)
const cb = new CircuitBreaker()

// Circuit breaker hook
app.addHook('onRequest', async (_req, reply) => {
  if (cb.isOpen()) {
    return reply.status(503).send(errorResponse('CIRCUIT_OPEN', 'Service temporarily unavailable'))
  }
})
app.addHook('onError', async () => { cb.recordFailure() })
app.addHook('onResponse', async (_req, reply) => {
  if (reply.statusCode < 500) cb.recordSuccess()
})

// Register new routes
await registerCheckBatch(app, engine)
await registerCheckRoster(app, rosterEngine)
await registerRules(app, ruleLoader)
```

- [ ] **Step 4: 运行全部测试**

```bash
cd rule-engine && npx vitest run
```
预期：所有测试通过

- [ ] **Step 5: Commit**

```bash
git add rule-engine/src/plugins/circuit-breaker.ts \
        rule-engine/src/server.ts \
        rule-engine/package.json rule-engine/package-lock.json
git commit -m "feat(rule-engine): 限流 + 熔断插件 + server.ts 完整路由注册"
```

---

## Task 13: 更新 index.ts 导出 + 覆盖率验证

**Files:**
- Modify: `rule-engine/src/index.ts`

- [ ] **Step 1: 追加新类型和类的导出**

在 `rule-engine/src/index.ts` 末尾追加：

```typescript
// Roster engine and types
export { RosterEngine } from './engine/roster-engine.js'
export { RosterContext } from './engine/roster-context.js'
export { CalcResultCache } from './engine/calc-result-cache.js'

export type {
  RosterInput,
  RosterDeltaInput,
} from './types/input.js'

export type {
  RosterEngineResult,
} from './types/result.js'
```

- [ ] **Step 2: 运行全部测试并检查覆盖率**

```bash
cd rule-engine && npx vitest run --coverage
```

检查输出中各模块覆盖率是否达到：
- `calculators/` ≥ 90%
- `checkers/` ≥ 90%
- `engine/` ≥ 85%
- 整体 ≥ 85%

若未达到，检查哪个文件覆盖率低并补充测试用例。

- [ ] **Step 3: 最终全量测试**

```bash
cd rule-engine && npx vitest run
```
预期：全部测试通过，0 failures

- [ ] **Step 4: Commit**

```bash
git add rule-engine/src/index.ts
git commit -m "feat(rule-engine): 完整导出 + 覆盖率验证通过"
git push origin main
```

---

## 自检结果

**Spec 覆盖：**
- ✅ CalcResultCache → Task 1
- ✅ requiredCalculators → Task 2
- ✅ checkRule() → Task 3
- ✅ RosterInput/RosterEngineResult 类型 → Task 4
- ✅ RosterContext O(n) 滑动窗口 → Task 5
- ✅ RosterEngine + checkDelta → Task 6
- ✅ 4 条 Roster 级 checkers → Task 7
- ✅ 3 条新 Pairing 级 checkers → Task 8
- ✅ /check/batch → Task 9
- ✅ /check/roster + /check/roster/delta → Task 10
- ✅ /rules/* → Task 11
- ✅ 限流 + 熔断 → Task 12
- ✅ 导出更新 + 覆盖率 → Task 13
