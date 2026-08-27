# Gantt Rule Engine Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Gantt 前端的法规检查从 legacy 路由（`/api/rules/*`）迁移到新路由（`/check/*`），并新增 roster 级别违规检查。

**Architecture:** 双层独立检查。`runChecks()` 内部函数适配新 `/check/batch` 响应格式（id-based 映射替代 index-based）；新增 `checkRosterViolations(crewId, items)` action 调用 `/check/roster` 取得 roster 级违规，fire-and-forget 方式在 `checkCrews()` 后触发，失败降级为空不中断主流程。

**Tech Stack:** TypeScript, React 19, Zustand 5, Vitest 3, axios

---

## File Structure

| 文件 | 操作 |
|------|------|
| `gantt/src/types/rule-check.ts` | 新建 — BatchCheckResponse / RosterCheckRequest / RosterCheckResponse |
| `gantt/src/services/rule-api.ts` | 修改 — 迁移路由，新增 `checkRoster()`，删除 `check()` |
| `gantt/src/stores/rule-check-store.ts` | 修改 — 适配新 batch 格式，扩展 `RuleViolation`，新增 `checkRosterViolations()` |
| `gantt/package.json` | 修改 — 新增 vitest 等测试依赖 |
| `gantt/vite.config.ts` | 修改 — 新增 test 配置块 |
| `gantt/src/services/__tests__/rule-api.test.ts` | 新建 |
| `gantt/src/stores/__tests__/rule-check-store.test.ts` | 新建 |

---

### Task 1: 创建类型文件 `gantt/src/types/rule-check.ts`

**Files:**
- Create: `gantt/src/types/rule-check.ts`

> 无测试步骤：纯类型定义文件，TypeScript 编译即是验证。

- [ ] **Step 1: 创建文件**

```typescript
// gantt/src/types/rule-check.ts
import type { CheckInput } from '@/utils/roster-to-check-input'
import type { EngineResult, CheckResult } from '@/services/rule-api'

// ── /check/batch 响应 ────────────────────────────────────

export interface BatchCheckItem {
  id: number          // pairingId
  result: EngineResult
}

export interface BatchCheckResponse {
  items: BatchCheckItem[]
  totalDuration: number
}

// ── /check/roster 请求与响应 ─────────────────────────────

export interface RosterCheckRequest {
  ruleGroupCode: string
  crew: CheckInput['crew']
  pairings: CheckInput['pairing'][]
  periodStart: string   // ISO 8601
  periodEnd: string
}

export interface RosterCheckResponse {
  pairingResults: Record<number, EngineResult>
  rosterViolations: CheckResult[]
  passedAll: boolean
  highestSeverity: number
}
```

- [ ] **Step 2: 确认 TypeScript 无报错**

Run: `cd gantt && npx tsc --noEmit 2>&1 | head -20`
Expected: 无 `rule-check.ts` 相关错误

- [ ] **Step 3: Commit**

```bash
git add gantt/src/types/rule-check.ts
git commit -m "feat(gantt): 新增 rule-check 类型定义文件

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 迁移 `gantt/src/services/rule-api.ts`

**Files:**
- Modify: `gantt/src/services/rule-api.ts`

> 无单元测试步骤：路由层变更用 TypeScript 编译验证，功能验证在 Task 6（测试）。

- [ ] **Step 1: 替换文件内容**

完整替换 `gantt/src/services/rule-api.ts`：

```typescript
import { RULE_API_BASE } from '@/config/api-paths'
import { createHttpClient } from './http-client'
import type { CheckInput } from '@/utils/roster-to-check-input'
import type { BatchCheckResponse, RosterCheckRequest, RosterCheckResponse } from '@/types/rule-check'

/** Rule engine response types */
export interface CalcResult {
  ruleCode: string
  ruleName: string
  value: number
  unit: string
  details?: Record<string, unknown>
}

export interface CheckResult {
  ruleCode: string
  ruleName: string
  passed: boolean
  severity: number
  actualValue: number
  limitValue: number
  unit: string
  message: string
  overridable?: boolean
}

export interface EngineResult {
  calcResults: CalcResult[]
  checkResults: CheckResult[]
  passedAll: boolean
  highestSeverity: number
}

export interface RuleGroup {
  groupCode: string
  name: string
  usage: string
}

const ruleClient = createHttpClient({ baseURL: RULE_API_BASE })

export const ruleApi = {
  /** Batch check multiple pairings — new /check/batch endpoint */
  async batchCheck(
    ruleGroupCode: string,
    items: { pairing: CheckInput['pairing']; crew?: CheckInput['crew'] }[],
  ): Promise<BatchCheckResponse> {
    return ruleClient.post('/check/batch', { ruleGroupCode, items }) as Promise<BatchCheckResponse>
  },

  /** Full roster check — returns pairing-level results + roster-level violations */
  async checkRoster(input: RosterCheckRequest): Promise<RosterCheckResponse> {
    return ruleClient.post('/check/roster', input) as Promise<RosterCheckResponse>
  },

  /** List available rule groups */
  async getGroups(): Promise<RuleGroup[]> {
    return ruleClient.get('/rules/groups') as Promise<RuleGroup[]>
  },
}
```

- [ ] **Step 2: 确认 TypeScript 无报错**

Run: `cd gantt && npx tsc --noEmit 2>&1 | head -30`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add gantt/src/services/rule-api.ts
git commit -m "feat(gantt): 迁移 rule-api 到新路由，新增 checkRoster()

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: 适配 `runChecks()` — 新 batch 响应格式

**Files:**
- Modify: `gantt/src/stores/rule-check-store.ts:91-165`

旧代码用 `engineResults[i]` 按索引取结果；新响应用 `items[].id`（= pairingId）关联结果。

同时在 `RuleViolation` 接口上新增 `source?: 'pairing' | 'roster'` 字段。

- [ ] **Step 1: 在 `RuleViolation` 接口新增 `source` 字段**

在 `rule-check-store.ts` 第 22 行 `canOverride` 下方加一行：

```typescript
  /** origin of the violation: pairing-level check or roster-level check */
  source?: 'pairing' | 'roster'
```

- [ ] **Step 2: 替换 `runChecks()` 函数（第 98–165 行）**

```typescript
/**
 * Run rule engine checks via batch API (single HTTP request).
 * Fetches crew qualifications first, then converts to CheckInput with real quals.
 */
const runChecks = async (
  crewIds: string[],
  items: RosterItem[],
  ruleGroupCode: string,
): Promise<{ violations: RuleViolation[]; hasBlocking: boolean }> => {
  // Fetch qualifications for affected crews (uses cache, only fetches missing)
  const crewStore = useCrewStore.getState()
  await crewStore.fetchQuals(crewIds)

  // Build quals map from cache
  const qualsMap = new Map<string, CrewQuals>()
  for (const cid of crewIds) {
    const q = crewStore.getQuals(cid)
    if (q) qualsMap.set(cid, q)
  }

  // Build all check inputs and a pairingId → crewId mapping
  const allCheckInputs = crewIds.flatMap((crewId) =>
    buildCheckInputs(crewId, items, ruleGroupCode, qualsMap),
  )

  if (allCheckInputs.length === 0) {
    console.debug('[RuleCheck] No check inputs (0 pairings with flights)')
    return { violations: [], hasBlocking: false }
  }
  console.debug(`[RuleCheck] Checking ${allCheckInputs.length} pairings for ${crewIds.length} crews`)

  // Build pairingId → crewId mapping for result association
  const pairingToCrewId = new Map<number, string>()
  for (const input of allCheckInputs) {
    if (input.crew?.crewId) {
      pairingToCrewId.set(input.pairing.pairingId, input.crew.crewId)
    }
  }

  // Build batch request
  const batchItems = allCheckInputs.map((input) => ({
    pairing: input.pairing,
    crew: input.crew,
  }))

  const response = await ruleApi.batchCheck(ruleGroupCode, batchItems)

  const violations: RuleViolation[] = []
  let hasBlocking = false

  for (const { id: pairingId, result: engineResult } of response.items) {
    const crewId = pairingToCrewId.get(pairingId) ?? ''

    for (const cr of engineResult.checkResults) {
      if (cr.passed) continue

      const violation: RuleViolation = {
        ruleCode: cr.ruleCode,
        ruleName: cr.ruleName,
        severity: cr.severity,
        canOverride: cr.overridable ?? cr.severity < 3,
        message: cr.message,
        targetId: pairingId,
        targetType: 'pairing',
        source: 'pairing',
      }
      violations.push(violation)

      violations.push({
        ...violation,
        targetType: 'crew',
        targetId: Number(crewId) || 0,
      })

      if (!violation.canOverride) hasBlocking = true
    }
  }

  return { violations, hasBlocking }
}
```

- [ ] **Step 3: 确认 TypeScript 无报错**

Run: `cd gantt && npx tsc --noEmit 2>&1 | head -30`
Expected: 无新增错误

- [ ] **Step 4: Commit**

```bash
git add gantt/src/stores/rule-check-store.ts
git commit -m "refactor(gantt): runChecks 适配新 batch 响应格式，RuleViolation 增加 source 字段

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: 新增 `checkRosterViolations()` action

**Files:**
- Modify: `gantt/src/stores/rule-check-store.ts`

> 依赖 Task 2（`ruleApi.checkRoster`）和 Task 3（`RuleViolation.source`）。

- [ ] **Step 1: 在 `RuleCheckStore` 接口新增方法签名**

在 `clearViolations` 方法声明下方新增：

```typescript
  /**
   * Fire-and-forget roster-level check for a single crew.
   * Merges rosterViolations into the violations map (source: 'roster').
   * Failure is silently warned — never throws.
   */
  checkRosterViolations: (crewId: string, items: RosterItem[]) => Promise<void>
```

- [ ] **Step 2: 新增必要 import**

在文件顶部 import 区域新增：

```typescript
import { usePaneStore } from './pane-store'
import type { RosterCheckRequest } from '@/types/rule-check'
```

- [ ] **Step 3: 在 store 实现体新增 `checkRosterViolations` 方法**

在 `clearViolations` 实现下方新增：

```typescript
  checkRosterViolations: async (crewId, items) => {
    const { ruleGroupCode } = get()

    // Build check inputs to extract pairings and crew info
    const crewStore = useCrewStore.getState()
    await crewStore.fetchQuals([crewId])
    const quals = crewStore.getQuals(crewId)
    const qualsMap: Map<string, CrewQuals> = new Map()
    if (quals) qualsMap.set(crewId, quals)

    const checkInputs = buildCheckInputs(crewId, items, ruleGroupCode, qualsMap)
    if (checkInputs.length === 0) return

    const pairings = checkInputs.map((i) => i.pairing)
    const crew = checkInputs[0].crew
    if (!crew) return

    const { dateRange } = usePaneStore.getState()
    const request: RosterCheckRequest = {
      ruleGroupCode,
      crew,
      pairings,
      periodStart: dateRange.start.toISOString(),
      periodEnd: dateRange.end.toISOString(),
    }

    try {
      const response = await ruleApi.checkRoster(request)

      if (response.rosterViolations.length === 0) return

      set((state) => {
        const merged = new Map(state.violations)
        for (const cr of response.rosterViolations) {
          if (cr.passed) continue
          const violation: RuleViolation = {
            ruleCode: cr.ruleCode,
            ruleName: cr.ruleName,
            severity: cr.severity,
            canOverride: cr.overridable ?? cr.severity < 3,
            message: cr.message,
            targetId: Number(crewId) || 0,
            targetType: 'crew',
            source: 'roster',
          }
          const key = makeKey('crew', violation.targetId)
          const arr = merged.get(key) ?? []
          arr.push(violation)
          merged.set(key, arr)
        }
        return { violations: merged }
      })
    } catch (err) {
      console.warn('[RuleCheck] roster check failed for crew', crewId, err)
    }
  },
```

- [ ] **Step 4: 在 `checkCrews` 成功后触发 `checkRosterViolations`（fire-and-forget）**

在 `checkCrews` 方法中，`set({ violations: merged, checking: false })` 这行之后、`return !result.hasBlocking` 之前，新增：

```typescript
      // Fire-and-forget roster-level check for each crew
      for (const crewId of crewIds) {
        void get().checkRosterViolations(crewId, allItems)
      }
```

- [ ] **Step 5: 确认 TypeScript 无报错**

Run: `cd gantt && npx tsc --noEmit 2>&1 | head -30`
Expected: 无报错

- [ ] **Step 6: Commit**

```bash
git add gantt/src/stores/rule-check-store.ts
git commit -m "feat(gantt): 新增 checkRosterViolations，在 checkCrews 后触发 roster 级违规检查

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: 配置 Vitest

**Files:**
- Modify: `gantt/package.json`
- Modify: `gantt/vite.config.ts`

- [ ] **Step 1: 安装 vitest 和相关依赖**

```bash
cd gantt && npm install --save-dev vitest@^3.0.0 @vitest/coverage-v8@^3.0.0 jsdom@^26.0.0 @testing-library/jest-dom@^6.0.0
```

Expected: package-lock.json 更新，无安全漏洞提示

- [ ] **Step 2: 更新 `gantt/package.json` 新增测试脚本**

在 `scripts` 块新增：

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: 更新 `gantt/vite.config.ts` 新增 test 配置**

在 `defineConfig({` 对象内最末尾（`server` 块之后）新增：

```typescript
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
```

同时在文件顶部 import 行下方新增类型注释，使 vite.config.ts 识别 test 字段：

在 `import { defineConfig } from "vite"` 这行改为：

```typescript
import { defineConfig } from 'vitest/config'
```

- [ ] **Step 4: 验证配置正确**

```bash
cd gantt && npx vitest run --reporter=verbose 2>&1 | head -10
```

Expected: 无配置错误（找不到测试文件是正常的，此时还没有测试）

- [ ] **Step 5: Commit**

```bash
git add gantt/package.json gantt/vite.config.ts gantt/package-lock.json
git commit -m "chore(gantt): 配置 Vitest 测试环境

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: 为 `rule-api.ts` 编写测试

**Files:**
- Create: `gantt/src/services/__tests__/rule-api.test.ts`

- [ ] **Step 1: 创建测试文件**

```typescript
// gantt/src/services/__tests__/rule-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock http-client before importing ruleApi
const mockPost = vi.fn()
const mockGet = vi.fn()

vi.mock('@/services/http-client', () => ({
  createHttpClient: vi.fn(() => ({ post: mockPost, get: mockGet })),
}))

// Import after mock is in place
import { ruleApi } from '../rule-api'

describe('ruleApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('batchCheck', () => {
    it('posts to /check/batch with correct body and returns BatchCheckResponse', async () => {
      const mockResponse = {
        items: [{ id: 101, result: { calcResults: [], checkResults: [], passedAll: true, highestSeverity: 0 } }],
        totalDuration: 5,
      }
      mockPost.mockResolvedValueOnce(mockResponse)

      const result = await ruleApi.batchCheck('ccar121_gantt', [
        { pairing: { pairingId: 101, crewBase: 'PEK', duties: [] } },
      ])

      expect(mockPost).toHaveBeenCalledWith('/check/batch', {
        ruleGroupCode: 'ccar121_gantt',
        items: [{ pairing: { pairingId: 101, crewBase: 'PEK', duties: [] } }],
      })
      expect(result.items[0].id).toBe(101)
      expect(result.totalDuration).toBe(5)
    })
  })

  describe('checkRoster', () => {
    it('posts to /check/roster with correct body', async () => {
      const mockResponse = {
        pairingResults: {},
        rosterViolations: [],
        passedAll: true,
        highestSeverity: 0,
      }
      mockPost.mockResolvedValueOnce(mockResponse)

      const input = {
        ruleGroupCode: 'ccar121_gantt',
        crew: undefined,
        pairings: [{ pairingId: 200, crewBase: 'SHA', duties: [] }],
        periodStart: '2026-04-01T00:00:00.000Z',
        periodEnd: '2026-04-30T23:59:59.000Z',
      }

      const result = await ruleApi.checkRoster(input)

      expect(mockPost).toHaveBeenCalledWith('/check/roster', input)
      expect(result.passedAll).toBe(true)
      expect(result.rosterViolations).toHaveLength(0)
    })
  })

  describe('getGroups', () => {
    it('calls /rules/groups (new path, not legacy /api/rules/groups)', async () => {
      mockGet.mockResolvedValueOnce([
        { groupCode: 'ccar121_gantt', name: 'CCAR 121 Gantt', usage: 'gantt' },
      ])

      const result = await ruleApi.getGroups()

      expect(mockGet).toHaveBeenCalledWith('/rules/groups')
      expect(result[0].groupCode).toBe('ccar121_gantt')
    })
  })
})
```

- [ ] **Step 2: 运行测试确认通过**

Run: `cd gantt && npm test -- --reporter=verbose 2>&1`
Expected: 3 tests pass

- [ ] **Step 3: Commit**

```bash
git add gantt/src/services/__tests__/rule-api.test.ts
git commit -m "test(gantt): 新增 rule-api 单元测试

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: 为 `rule-check-store.ts` 编写测试

**Files:**
- Create: `gantt/src/stores/__tests__/rule-check-store.test.ts`

覆盖三个关键行为：
1. 新 batch 响应格式解析（pairingId → crewId 映射）
2. `checkRosterViolations` 合并 rosterViolations
3. 失败时降级（不抛出）

- [ ] **Step 1: 创建测试文件**

```typescript
// gantt/src/stores/__tests__/rule-check-store.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RosterItem } from '@/types'

// ── Mock dependencies ──────────────────────────────────

vi.mock('@/services/rule-api', () => ({
  ruleApi: {
    batchCheck: vi.fn(),
    checkRoster: vi.fn(),
  },
}))

vi.mock('@/stores/crew-store', () => ({
  useCrewStore: {
    getState: vi.fn(() => ({
      fetchQuals: vi.fn(),
      getQuals: vi.fn(() => ({
        division: 'P',
        rank: 'FO',
        fleetQuals: ['B737'],
        airportQuals: [],
      })),
    })),
  },
}))

vi.mock('@/stores/pane-store', () => ({
  usePaneStore: {
    getState: vi.fn(() => ({
      dateRange: {
        start: new Date('2026-04-01T00:00:00Z'),
        end: new Date('2026-04-30T23:59:59Z'),
      },
    })),
  },
}))

import { ruleApi } from '@/services/rule-api'
import { useRuleCheckStore } from '../rule-check-store'

// ── Helpers ──────────────────────────────────────────────

/** Create a minimal RosterItem for testing */
const makeItem = (crewId: string, pairingId: number, dutySeq = 1): RosterItem => ({
  id: pairingId * 10,
  crewId,
  pairingId,
  ver: 1,
  base: 'PEK',
  label: 'CA1234 PEK-SHA',
  assignmentGroup: 'FLT',
  assignment: 'CA1234',
  role: 'FO',
  subRole: null,
  source: null,
  isRequested: 0,
  isSwapped: 0,
  preference: null,
  comments: null,
  score: null,
  workingHour: null,
  schStrDtUtc: '2026-04-10T06:00:00Z',
  schEndDtUtc: '2026-04-10T08:00:00Z',
  actStrDtUtc: null,
  actEndDtUtc: null,
  fltId: 1,
  fltDt: '2026-04-10',
  dutySeq,
  segSeq: 1,
  division: 'P',
  actingRank: 'FO',
  activeRank: null,
  position: null,
  schCreditedMinutes: '120',
  actCreditedMinutes: null,
})

// ── Tests ─────────────────────────────────────────────────

describe('useRuleCheckStore', () => {
  beforeEach(() => {
    useRuleCheckStore.getState().clearViolations()
    vi.clearAllMocks()
  })

  describe('checkCrews — new batch response format', () => {
    it('maps pairingId→crewId from response.items.id instead of array index', async () => {
      // Crew "C001" has pairingId=101, Crew "C002" has pairingId=202
      const items = [makeItem('C001', 101), makeItem('C002', 202)]

      vi.mocked(ruleApi.batchCheck).mockResolvedValueOnce({
        totalDuration: 10,
        items: [
          {
            id: 101,
            result: {
              calcResults: [],
              checkResults: [
                {
                  ruleCode: 'MAX_FDP',
                  ruleName: 'Max FDP',
                  passed: false,
                  severity: 3,
                  actualValue: 15,
                  limitValue: 14,
                  unit: 'h',
                  message: 'FDP exceeded',
                  overridable: false,
                },
              ],
              passedAll: false,
              highestSeverity: 3,
            },
          },
          {
            id: 202,
            result: {
              calcResults: [],
              checkResults: [],
              passedAll: true,
              highestSeverity: 0,
            },
          },
        ],
      })

      // checkRosterViolations is fire-and-forget — prevent it from running in this test
      vi.mocked(ruleApi.checkRoster).mockResolvedValue({
        pairingResults: {},
        rosterViolations: [],
        passedAll: true,
        highestSeverity: 0,
      })

      await useRuleCheckStore.getState().checkCrews(['C001', 'C002'], items)

      const store = useRuleCheckStore.getState()
      // Violation for pairing 101 should exist
      expect(store.hasViolations('pairing', 101)).toBe(true)
      // Violation for pairing 202 should NOT exist
      expect(store.hasViolations('pairing', 202)).toBe(false)
    })
  })

  describe('checkRosterViolations', () => {
    it('merges rosterViolations into violations map with source=roster', async () => {
      const items = [makeItem('C001', 101)]

      vi.mocked(ruleApi.checkRoster).mockResolvedValueOnce({
        pairingResults: {},
        rosterViolations: [
          {
            ruleCode: 'MAX_BLOCK_MONTH',
            ruleName: 'Max Block Month',
            passed: false,
            severity: 2,
            actualValue: 85,
            limitValue: 80,
            unit: 'h',
            message: 'Monthly block exceeded',
            overridable: true,
          },
        ],
        passedAll: false,
        highestSeverity: 2,
      })

      await useRuleCheckStore.getState().checkRosterViolations('C001', items)

      const violations = useRuleCheckStore.getState().getViolations('crew', 0)  // crewId 'C001' → Number('C001') = 0
      const rosterViolation = violations.find((v) => v.source === 'roster')
      expect(rosterViolation).toBeDefined()
      expect(rosterViolation?.ruleCode).toBe('MAX_BLOCK_MONTH')
    })

    it('does not throw when checkRoster fails', async () => {
      const items = [makeItem('C001', 101)]

      vi.mocked(ruleApi.checkRoster).mockRejectedValueOnce(new Error('DB unavailable'))

      // Should not throw
      await expect(
        useRuleCheckStore.getState().checkRosterViolations('C001', items),
      ).resolves.toBeUndefined()
    })

    it('does nothing when crew has no pairings with flights', async () => {
      // Empty items means buildCheckInputs returns []
      await useRuleCheckStore.getState().checkRosterViolations('C001', [])

      expect(ruleApi.checkRoster).not.toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: 运行测试确认通过**

Run: `cd gantt && npm test -- --reporter=verbose 2>&1`
Expected: 5 tests pass (3 from rule-api.test.ts + 5 from rule-check-store.test.ts... 合计约 8 tests)

- [ ] **Step 3: Commit**

```bash
git add gantt/src/stores/__tests__/rule-check-store.test.ts
git commit -m "test(gantt): 新增 rule-check-store 单元测试

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## 注意事项

1. **axios mock 的写法**：`createHttpClient` 内部调用 `axios.create()`，mock 需要拦截 `axios.default.create` 的返回值。测试文件中的 mock 写法已考虑 interceptors 链。如测试中 mock 行为与预期不符，可改用 `vi.spyOn` 直接 spy `ruleClient`（import 后 reassign）。

2. **`Number(crewId)`**：当前 `crewId` 是字符串（如 `'C001'`），转为数字结果为 `NaN`，`|| 0` 处理为 0。roster 违规的 `targetId` 在真实数据中应是数字型 crewId，测试中用 `0` 验证即可。真实数据中 crewId 格式确认后可按需调整。

3. **`usePaneStore` import**：`pane-store` 与 `rule-check-store` 在同一 stores 目录，注意避免循环依赖（两者不互相导入实例，只在 action 中用 `.getState()` 调用）。
