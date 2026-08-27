# Gantt Rule Engine Migration Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Gantt 前端的法规检查调用从 legacy 路由（`/api/rules/*`）迁移到新路由（`/check/*`），并在此基础上新增 roster 级别违规检查。

**Architecture:** 方案 A — 双层独立检查。pairing 级检查继续走 `POST /check/batch`（增量高效），roster 级检查作为独立动作叠加（`POST /check/roster`），两类违规共用同一个 violations Map，用 `source` 字段区分。

**Tech Stack:** React 19, Zustand, TypeScript, Vitest

**Scope:** `gantt/src/` 内的 API 层、类型定义、store 变更；不涉及 Canvas 渲染层。

---

## 背景

Rule Engine 服务端已完成无状态重构，新路由结构如下：

| 新路由 | 对应旧路由 | 变化 |
|--------|-----------|------|
| `POST /check/batch` | `POST /api/rules/check/batch` | 响应格式变更：`EngineResult[]` → `{ items: [{id, result}], totalDuration }` |
| `POST /check/roster` | （无对应） | 新增，返回 pairingResults + rosterViolations |
| `GET /rules/groups` | `GET /api/rules/groups` | 路径变更，响应格式一致 |

旧路由在服务端保留但 Gantt 不再调用。

---

## 设计一：API 层（`gantt/src/services/rule-api.ts`）

替换旧方法，废弃 `check()`（单 pairing），新增 `checkRoster()`：

```typescript
export const ruleApi = {
  // 替换旧 batchCheck — 路径 /api/rules/check/batch → /check/batch
  async batchCheck(
    ruleGroupCode: string,
    items: CheckItem[],
  ): Promise<BatchCheckResponse> {
    return ruleClient.post('/check/batch', { ruleGroupCode, items })
  },

  // 新增 — roster 级全量检查
  async checkRoster(input: RosterCheckRequest): Promise<RosterCheckResponse> {
    return ruleClient.post('/check/roster', input)
  },

  // 替换旧 getGroups — 路径 /api/rules/groups → /rules/groups
  async getGroups(): Promise<RuleGroup[]> {
    return ruleClient.get('/rules/groups')
  },
}
```

旧 `check()` 方法删除，`batchCheck()` 已覆盖所有单 pairing 场景。

---

## 设计二：类型定义（`gantt/src/types/rule-check.ts`）

新增专用类型文件，现有类型（`EngineResult`、`CheckResult`、`CrewInfo`、`PairingInput`）不变：

```typescript
// 新 batch 端点响应（/check/batch）
export interface BatchCheckItem {
  id: number          // pairingId
  result: EngineResult
}

export interface BatchCheckResponse {
  items: BatchCheckItem[]
  totalDuration: number
}

// roster 检查请求（/check/roster）
export interface RosterCheckRequest {
  ruleGroupCode: string
  crew: CrewInfo
  pairings: PairingInput[]
  periodStart: string   // ISO 8601
  periodEnd: string
}

// roster 检查响应（Map 已序列化为 Record）
export interface RosterCheckResponse {
  pairingResults: Record<number, EngineResult>
  rosterViolations: CheckResult[]
  passedAll: boolean
  highestSeverity: string
}
```

---

## 设计三：Store 变更（`gantt/src/stores/rule-check-store.ts`）

### 3.1 `checkCrews()` — 适配新 batch 响应格式

旧响应 `EngineResult[]` 按入参顺序对应，新响应通过 `id`（pairingId）关联结果。

迁移步骤：
1. 外层仍按 crewId 循环；为每个 crew 调用 `buildCheckInputs()` 得到 `CheckInput[]`
2. 在同一循环内建立 `pairingId → crewId` 映射（crewId 已在循环变量中）
3. 收集所有 items 后一次调用 `ruleApi.batchCheck()`
4. 遍历 `response.items`，通过 `item.id`（pairingId）查映射表得到 `crewId`，写入 violations

```typescript
// pairingId → crewId 映射建立（crewId 来自外层循环变量）
const idToCrewId = new Map<number, string>()
for (const crewId of crewIds) {
  const inputs = buildCheckInputs(crewId, itemsByCrewId.get(crewId) ?? [], ruleGroupCode)
  for (const input of inputs) {
    idToCrewId.set(input.pairing.pairingId, crewId)
  }
  allItems.push(...inputs.map(i => ({ pairing: i.pairing, crew: i.crew })))
}
```

### 3.2 `preCheck()` — 适配新 batch 响应格式

逻辑不变（比较 before/after 违规差异），解包方式从索引取值改为 `id` 查找：

```typescript
// before
const result = results[i]

// after
const result = response.items.find(x => x.id === pairingId)?.result
```

### 3.3 新增 `checkRosterViolations(crewId: string)` action

```typescript
async checkRosterViolations(crewId: string): Promise<void> {
  try {
    // 从 gantt store 取该 crew 的排班数据，组装 RosterCheckRequest
    const rosterItems = useGanttStore.getState().getItemsByCrewId(crewId)
    const crew = useGanttStore.getState().getCrewInfo(crewId)
    const { ruleGroupCode, periodStart, periodEnd } = useRuleCheckStore.getState()
    const pairings = buildPairingInputs(rosterItems)   // 同 buildCheckInputs 的底层方法，返回 PairingInput[]
    const response = await ruleApi.checkRoster({
      ruleGroupCode, crew, pairings, periodStart, periodEnd,
    })
    // 将 rosterViolations 合并到 violations map
    mergeRosterViolations(crewId, response.rosterViolations)
  } catch (err) {
    console.warn('[rule-check] roster check failed for crew', crewId, err)
    // 不抛出，roster 违规降级为空
  }
}
```

`checkRosterViolations` 在 `checkCrews()` 完成一批后非阻塞触发（fire-and-forget）。

### 3.4 违规数据结构扩展

`RuleViolation` 增加可选字段 `source: 'pairing' | 'roster'`，默认 `'pairing'`，UI 层可据此过滤展示。

---

## 设计四：错误处理

| 场景 | 处理方式 |
|------|---------|
| `batchCheck()` 失败 | catch + warn，不中断操作（现有行为不变） |
| `preCheck()` 失败 | catch + warn，不中断操作（现有行为不变） |
| `checkRosterViolations()` 失败 | catch + warn，roster 违规降级为空，不影响 pairing 违规展示 |
| `getGroups()` 失败 | catch + warn，返回空数组（现有行为不变） |

---

## 测试策略

| 测试文件 | 覆盖点 |
|---------|-------|
| `gantt/src/services/__tests__/rule-api.test.ts` | 新路径正确调用、响应正确解包（BatchCheckResponse、RosterCheckResponse） |
| `gantt/src/stores/__tests__/rule-check-store.test.ts` | 新 batch 格式解析、pairingId→crewId 映射、`checkRosterViolations` 合并逻辑、失败降级 |

`buildCheckInputs()` 本身不变，无需额外测试。

---

## 影响范围

| 文件 | 变更类型 |
|------|---------|
| `gantt/src/services/rule-api.ts` | 路径迁移、废弃 `check()`、新增 `checkRoster()` |
| `gantt/src/types/rule-check.ts` | 新建，定义 BatchCheckResponse、RosterCheckRequest、RosterCheckResponse |
| `gantt/src/stores/rule-check-store.ts` | 适配新响应格式、新增 `checkRosterViolations()` |
| `gantt/src/services/__tests__/rule-api.test.ts` | 新建/更新 |
| `gantt/src/stores/__tests__/rule-check-store.test.ts` | 新建/更新 |
