# Rule Engine 无状态重构设计

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `RuleEngine` / `RosterEngine` 重构为纯计算引擎，彻底移除 DB 读取操作；规则加载由调用方负责。

**Architecture:** 引擎只做计算，不持有任何 DB 依赖。调用方先用 `RuleLoader` 加载规则集合，再将 `ResolvedRule[]` 传入引擎执行。HTTP 路由层作为 `RuleLoader` 的持有者，负责在每次请求前完成规则加载。

**Tech Stack:** TypeScript, Fastify, Vitest

---

## 背景与动机

`RuleEngine` 当前设计允许在构造函数中注入 `RuleLoader`，并提供 `check()` 方法在引擎内部调用 `loader.loadRules()`。这导致：

- 引擎持有 DB 依赖，职责不单一
- 测试需要 mock DB 或 loader
- npm 包消费者（PO、RO、Live Server、PBS Server、Gantt）无法用统一的纯计算接口

**调用方分类：**

| 调用方 | 模式 | 规则来源 |
|--------|------|----------|
| PO engine | npm 直接导入 | 调用方自持规则集，直接传入 |
| RO engine | npm 直接导入 | 调用方自持规则集，直接传入 |
| Live Server | npm 直接导入 | 自持 RuleLoader，每次按 groupCode 加载 |
| PBS Server | npm 直接导入 | 自持 RuleLoader，每次按 groupCode 加载 |
| Gantt | HTTP (port 3001) | 通过 HTTP 路由，路由层持有 loader |

所有调用方统一使用 `checkWithRules(input, rules)` 接口，区别仅在于 rules 的来源。

---

## 设计一：引擎接口变更

### RuleEngine

```typescript
// After
class RuleEngine {
  constructor()  // 无参数，无 DB 依赖
  checkWithRules(input: CheckInput, rules: ResolvedRule[], sharedCache?: CalcResultCache): EngineResult
  checkRule(templateCode: string, input: CheckInput, sharedCache?: CalcResultCache): EngineResult
}
```

**删除：**
- `constructor(ruleLoader?: RuleLoader | null)` → `constructor()`
- `get loader(): RuleLoader | null`
- `async check(input: CheckInput): Promise<EngineResult>`

**保留不变：**
- `checkWithRules()`
- `checkRule()`
- 所有私有方法（`runCalculatorsWithCache`, `runCheckers`, `makeMinimalCalcRule`, `makeMinimalCheckRule`）

### RosterEngine

```typescript
// After
class RosterEngine {
  constructor()  // 无参数，无 DB 依赖
  checkWithRules(input: RosterInput, rules: ResolvedRule[]): RosterEngineResult
  checkDeltaWithRules(input: RosterDeltaInput, rules: ResolvedRule[]): RosterEngineResult  // 同步
}
```

**删除：**
- `constructor(ruleLoader?: RuleLoader | null)` → `constructor()`
- `get loader(): RuleLoader | null`
- `async check(input: RosterInput): Promise<RosterEngineResult>`
- `async checkDelta(input: RosterDeltaInput): Promise<RosterEngineResult>`

**新增：**
- `checkDeltaWithRules(input: RosterDeltaInput, rules: ResolvedRule[]): RosterEngineResult`（同步，原 `_checkDeltaWithRules` 改为 public）

**保留不变：**
- `checkWithRules()`
- `_splitRules()`
- `_runRosterCheckers()`

---

## 设计二：HTTP 路由层变更

`RuleLoader` 从引擎构造函数移到路由注册函数参数，路由负责 `loadRules()`。

### server.ts

```typescript
// After
const ruleLoader = app.ruleLoader as RuleLoader
const engine = new RuleEngine()           // 无参数
const rosterEngine = new RosterEngine()   // 无参数

await registerCheckBatch(app, engine, ruleLoader)
await registerCheckRoster(app, rosterEngine, ruleLoader)
await registerRules(app, ruleLoader)      // 不变
```

### check-batch.ts

```typescript
// After
export async function registerCheckBatch(
  app: FastifyInstance,
  engine: RuleEngine,
  loader: RuleLoader | null,
): Promise<void> {
  app.post('/check/batch', async (request, reply) => {
    // ...
    let rules: ResolvedRule[] = []
    if (loader) {
      try {
        rules = await loader.loadRules(ruleGroupCode)
      } catch {
        // DB 不可用 — 以空规则集继续
      }
    }
    // engine.checkWithRules(...)
  })
}
```

### check-roster.ts

```typescript
// After
export async function registerCheckRoster(
  app: FastifyInstance,
  engine: RosterEngine,
  loader: RuleLoader | null,
): Promise<void> {
  app.post('/check/roster', async (request, reply) => {
    let rules: ResolvedRule[] = []
    if (loader) {
      try { rules = await loader.loadRules(input.ruleGroupCode) } catch {}
    }
    const result = engine.checkWithRules(rehydrated, rules)
    // ...
  })

  app.post('/check/roster/delta', async (request, reply) => {
    let rules: ResolvedRule[] = []
    if (loader) {
      try { rules = await loader.loadRules(input.ruleGroupCode) } catch {}
    }
    const result = engine.checkDeltaWithRules(rehydrated, rules)  // 同步
    // ...
  })
}
```

### rules.ts

无需修改，已直接接收 `RuleLoader | null`。

---

## 设计三：npm 包调用约定

所有消费方统一调用模式：

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

---

## 开发规范（写入 rule-engine/CLAUDE.md）

1. **`RuleEngine` / `RosterEngine` 构造函数不接受任何参数**
2. **引擎内部禁止任何 DB / IO 操作**（违反此规范会导致 code review 拒绝）
3. **规则加载（`RuleLoader.loadRules()`）必须在引擎调用前由调用方完成**
4. **HTTP 路由层是 `RuleLoader` 的持有者**，负责将 rules 传递给引擎
5. **npm 包消费方自持 `RuleLoader` 实例**，按 groupCode 加载规则后再调用引擎

---

## 测试策略

- 所有现有引擎测试直接删除 `ruleLoader` 参数即可：`new RuleEngine()` 代替 `new RuleEngine(mockLoader)`
- HTTP 路由测试：mock `loader.loadRules()` 替代通过 `engine.loader` 间接访问
- `RosterEngine.checkDeltaWithRules()` 测试：直接传入 rules 数组，去掉 async/await

---

## 影响范围

| 文件 | 变更类型 |
|------|---------|
| `src/engine/rule-engine.ts` | 删除构造参数、`loader` getter、`check()` |
| `src/engine/roster-engine.ts` | 删除构造参数、`loader` getter、`check()`、`checkDelta()`；新增 `checkDeltaWithRules()` |
| `src/server.ts` | 引擎构造无参数；routes 多传 loader |
| `src/routes/check-batch.ts` | 函数签名加 `loader` 参数 |
| `src/routes/check-roster.ts` | 函数签名加 `loader` 参数；`checkDelta` → `checkDeltaWithRules` |
| `src/__tests__/engine/rule-engine.test.ts` | 更新构造调用 |
| `src/__tests__/engine/roster-engine.test.ts` | 更新构造调用 |
| `src/__tests__/routes/check-batch.test.ts` | 更新 mock 方式 |
| `src/__tests__/routes/check-roster.test.ts` | 更新 mock 方式 |
| `rule-engine/CLAUDE.md` | 新增调用规范章节 |

> **注意：** `RosterEngine` 内部持有 `private readonly pairingEngine: RuleEngine`，构造时需改为 `new RuleEngine()`（无参数）。
