# Crew Rank/Base 有效期过滤 + Gantt 失效红线 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Live 与 Scenario 的 crew 列表只加载在窗口内 rank/base 双有效（Rule 1），并在 rank/base 失效点之后画红色虚线段（Rule 2）。

**Architecture:** 后端在 `crewService.list()` 与 `scenario-crew-scope.crewIdSet()` 追加两条全局 EXISTS 有效性条件（rank 与 base 各须与窗口相交）；前端新增纯函数 `computeValidityBlock`，在 Live/Scenario 共享 roster model 中构建 `crewId → 失效点ms` 映射，共享 `roster-renderer` 按该映射画横向红虚线。窗口 = Live RP 派生范围 / Scenario 自身 `strDtLoc/endDtLoc`。

**Tech Stack:** Fastify + Drizzle + PostgreSQL（后端）；React 19 + Zustand + Canvas + Vitest + Playwright（前端）。

## Global Constraints

- 窗口语义：Live = `[min(rp_start) − 7d, max(rp_end) + 7d]`（`filter-store.dateRange`，已传后端 `dateRangeStart/dateRangeEnd`）；Scenario = 自身 `strDtLoc/endDtLoc`。
- Rule 1：rank **且** base 各须存在与窗口相交的记录；显式 crewId 也遵守（§决策3）。
- Rule 2：红色横向虚线段，从失效点延伸到**窗口最后一天**；晋升链（后续覆盖记录）不触发（§决策1/2/4）。
- §Remote-DB-Only：后端验证必须打远端库（本地 `.env` = UAT `f8_uat_live`，密码只从 env 注入，禁止回显/写入）。
- §Gantt-Unify：Live 与 Scenario 共用共享层实现。
- §Minimal-First / §Surgical：只动任务所需代码，不做顺带重构。
- §Playwright-Required + §No-Illusion：每个改动配测试并贴 PASS 输出。
- §UI-Standard-Gate：改前端后 `npm run check:ui` 硬违规必须为 0。
- 提交信息按仓库规范，结尾 `Co-Authored-By: Claude <noreply@anthropic.com>`。

## File Structure

| 文件 | 责任 |
|---|---|
| `gantt/src/utils/crew-validity.ts` | **新增**。`computeValidityBlock(ranks, bases, winStartMs, winEndMs)` 纯函数 |
| `gantt/src/utils/crew-validity.test.ts` | **新增**。该函数的 Vitest 单测 |
| `live-server/src/services/crew/crew-service.ts` | Rule 1：全局 rank+base EXISTS 条件 |
| `live-server/src/services/gantt/gantt-service.ts` | bootstrap 补传 dateRangeStart/dateRangeEnd |
| `live-server/src/services/scenario/scenario-crew-scope.ts` | Rule 1：全局 rank+base 条件（strDtLoc/endDtLoc） |
| `gantt/src/stores/crew-store.ts` | 各 crew list 调用补传当前 dateRange |
| `gantt/src/components/gantt/source/gantt-pane-source.ts` | `RosterModel` 增加 `crewValidityBlock` |
| `gantt/src/components/gantt/source/live-gantt-source.ts` | `useRosterModel` 构建 `crewValidityBlock` |
| `gantt/src/components/gantt/source/scenario-gantt-source.ts` | 同上（scenario） |
| `gantt/src/components/gantt/renderers/roster-renderer.ts` | `RosterRenderContext.crewValidityBlock` + 画红虚线 |
| `gantt/src/components/panes/shared/roster-pane.tsx` | 把 `model.crewValidityBlock` 传入 rc；发布测试探针 |
| `gantt/src/utils/gantt-test-hook.ts` | 新增 `publishValidityBlocks` + `rosterValidityBlocks`/`scenarioRosterValidityBlocks` 探针 |
| `e2e/gantt/filter/crew-validity-filter.spec.ts` | **新增**。Rule 1 E2E（live） |
| `e2e/gantt/roster/crew-validity-redline.spec.ts` | **新增**。Rule 2 E2E（live） |
| `e2e/gantt/scenario/crew-validity-scenario.spec.ts` | **新增**。Scenario Rule 1 + Rule 2 E2E |

---

### Task 1: `computeValidityBlock` 纯函数 + 单测（TDD）

**Files:**
- Create: `gantt/src/utils/crew-validity.ts`
- Create: `gantt/src/utils/crew-validity.test.ts`

**Interfaces:**
- Consumes: 无（纯函数，与 `crew-history.ts` 同款结构类型 `{ effDt: string; expDt: string | null }`）。
- Produces: `computeValidityBlock(ranks, bases, winStartMs, winEndMs): number | null` — 窗口内首个「rank 或 base 双覆盖断档」时刻的 UTC ms；无断档返回 `null`。

- [ ] **Step 1: Write the failing test**

`gantt/src/utils/crew-validity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeValidityBlock } from './crew-validity'

type Rec = { effDt: string; expDt: string | null }
const rec = (effDt: string, expDt: string | null = null): Rec => ({ effDt, expDt })
// 窗口 2026-07-25 ~ 2026-09-07（与 RP08 2026 ±7d 一致）
const W0 = Date.UTC(2026, 6, 25)
const W1 = Date.UTC(2026, 8, 7)

describe('computeValidityBlock', () => {
  it('returns null when rank and base both cover window end', () => {
    const ranks = [rec('2022-06-09T00:00:00Z', '2055-12-31T00:00:00Z')]
    const bases = [rec('2020-02-01T00:00:00Z')]
    expect(computeValidityBlock(ranks, bases, W0, W1)).toBeNull()
  })

  it('returns the rank expiry when rank ends inside the window and nothing covers after', () => {
    const ranks = [rec('2025-03-02T00:00:00Z', '2026-07-31T00:00:00Z')] // crew 1901
    const bases = [rec('2022-08-01T00:00:00Z', '2052-08-02T00:00:00Z')]
    expect(computeValidityBlock(ranks, bases, W0, W1)).toBe(Date.UTC(2026, 6, 31))
  })

  it('returns the base expiry when base ends inside the window', () => {
    const ranks = [rec('2022-06-09T00:00:00Z', '2055-12-31T00:00:00Z')]
    const bases = [rec('2020-02-01T00:00:00Z', '2026-08-15T00:00:00Z')]
    expect(computeValidityBlock(ranks, bases, W0, W1)).toBe(Date.UTC(2026, 7, 15))
  })

  it('returns the EARLIER of rank/base ends when both end inside the window', () => {
    const ranks = [rec('2022-06-09T00:00:00Z', '2026-08-10T00:00:00Z')]
    const bases = [rec('2020-02-01T00:00:00Z', '2026-08-15T00:00:00Z')]
    expect(computeValidityBlock(ranks, bases, W0, W1)).toBe(Date.UTC(2026, 7, 10))
  })

  it('does NOT fire on a promotion chain (a later rank record covers window end)', () => {
    const ranks = [
      rec('2024-05-01T00:00:00Z', '2026-08-04T00:00:00Z'), // old rank expires 08-04
      rec('2026-08-05T00:00:00Z'),                          // new rank covers end (promotion)
    ]
    const bases = [rec('2020-02-01T00:00:00Z', '2055-12-31T00:00:00Z')]
    expect(computeValidityBlock(ranks, bases, W0, W1)).toBeNull()
  })

  it('returns null when the only expiry lies before window start', () => {
    const ranks = [rec('2022-06-09T00:00:00Z', '2026-03-31T00:00:00Z')] // crew 895
    const bases = [rec('2020-02-01T00:00:00Z', '2055-12-31T00:00:00Z')]
    expect(computeValidityBlock(ranks, bases, W0, W1)).toBeNull()
  })

  it('returns null for empty records', () => {
    expect(computeValidityBlock([], [], W0, W1)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/utils/crew-validity.test.ts`
Expected: FAIL — `Cannot find module './crew-validity'`.

- [ ] **Step 3: Write minimal implementation**

`gantt/src/utils/crew-validity.ts`（解析约定与 `crew-history.ts` 一致，用 `new Date(iso)`）：

```ts
type EffRecord = { effDt: string; expDt: string | null }

const ms = (iso: string | null | undefined): number | null => {
  if (iso == null) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : null
}

const coversWindowEnd = (recs: EffRecord[], winEndMs: number): boolean =>
  recs.some((r) => {
    const eff = ms(r.effDt)
    const exp = ms(r.expDt)
    return eff !== null && eff <= winEndMs && (exp === null || exp >= winEndMs)
  })

/** Last covered instant (max expDt) among records overlapping the window, or null. */
const lastCoverageMs = (recs: EffRecord[], winStartMs: number, winEndMs: number): number | null => {
  let max: number | null = null
  for (const r of recs) {
    const eff = ms(r.effDt)
    const exp = ms(r.expDt)
    if (eff == null || exp == null) continue // null exp ⇒ covers end, handled by coversWindowEnd
    if (eff <= winEndMs && exp >= winStartMs && (max === null || exp > max)) max = exp
  }
  return max
}

/**
 * Earliest instant inside [winStartMs, winEndMs) at which the crew loses rank OR base
 * coverage (no record covering after that instant). Returns null when the crew is
 * covered through the window end, or the gap is outside the window.
 */
export function computeValidityBlock(
  ranks: EffRecord[],
  bases: EffRecord[],
  winStartMs: number,
  winEndMs: number,
): number | null {
  const rankCovers = coversWindowEnd(ranks, winEndMs)
  const baseCovers = coversWindowEnd(bases, winEndMs)
  if (rankCovers && baseCovers) return null
  const ends = [
    rankCovers ? null : lastCoverageMs(ranks, winStartMs, winEndMs),
    baseCovers ? null : lastCoverageMs(bases, winStartMs, winEndMs),
  ].filter((v): v is number => v !== null)
  if (ends.length === 0) return null
  const block = Math.min(...ends)
  return block > winStartMs && block < winEndMs ? block : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/utils/crew-validity.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/utils/crew-validity.ts gantt/src/utils/crew-validity.test.ts
git commit -m "feat(gantt): computeValidityBlock — earliest rank/base coverage-gap instant in window"
```

---

### Task 2: Backend — `crewService.list()` 全局 rank/base 有效性过滤

**Files:**
- Modify: `live-server/src/services/crew/crew-service.ts`（在 fleets 多值块之后、`const where` 之前插入）
- Test: 远端只读 SQL 验证（§Remote-DB-Only）

**Interfaces:**
- Consumes: 现有 `rangeStart`/`rangeEnd`（L125-126，缺省 today）、`crew`、`sql` 均已导入。
- Produces: `list()` 的 WHERE 增加两条 EXISTS 条件；所有调用方（bootstrap / fetchCrews / filtered / loadMore / crewIds / 计数）自动继承。

- [ ] **Step 1: 插入全局条件**

在 `crew-service.ts` L166（fleets `}` 之后）与 L168（`const where` 之前）之间插入：

```ts
// 全局有效性门槛：机组必须在窗口内同时有 crew_rank 与 crew_base 记录（rank/base 双有效），
// 过期组员（含 Division-only、显式 crewId 路径）不进入 Gantt。
conditions.push(
  sql`EXISTS (SELECT 1 FROM crew_rank cr WHERE cr.crew_id = ${crew.crewId}
    AND cr.eff_dt <= ${rangeEnd}::timestamp
    AND (cr.exp_dt IS NULL OR cr.exp_dt >= ${rangeStart}::timestamp))`,
)
conditions.push(
  sql`EXISTS (SELECT 1 FROM crew_base cb WHERE cb.crew_id = ${crew.crewId}
    AND cb.eff_dt <= ${rangeEnd}::timestamp
    AND (cb.exp_dt IS NULL OR cb.exp_dt >= ${rangeStart}::timestamp))`,
)
```

- [ ] **Step 2: 远端只读 SQL 验证（先看失败前行为再改后的期望）**

```bash
set -a && . ./live-server/.env && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
\pset pager off
-- 模拟新 WHERE（division=C + 全局有效性 + 显式 ID）：895 应被排除，1901/2109 应在
SELECT crew_id FROM f8_uat_live.crew
WHERE division = 'C'
  AND crew_id IN ('895','1901','2109')
  AND EXISTS (SELECT 1 FROM f8_uat_live.crew_rank cr
              WHERE cr.crew_id = crew.crew_id AND cr.eff_dt <= '2026-09-07'::timestamp
                AND (cr.exp_dt IS NULL OR cr.exp_dt >= '2026-07-25'::timestamp))
  AND EXISTS (SELECT 1 FROM f8_uat_live.crew_base cb
              WHERE cb.crew_id = crew.crew_id AND cb.eff_dt <= '2026-09-07'::timestamp
                AND (cb.exp_dt IS NULL OR cb.exp_dt >= '2026-07-25'::timestamp))
ORDER BY crew_id;
SQL
```

Expected: 返回 `1901` 与 `2109`（不含 `895`）。再对条件跑 `EXPLAIN` 确认走 crew_id 索引路径（`EXPLAIN (ANALYZE, COSTS OFF)` 一次，只读）。

- [ ] **Step 3: 运行后端相关测试确认无回归**

Run: `cd live-server && npx vitest run tests/unit/services/crew 2>/dev/null || npx vitest run 2>&1 | tail -20`
Expected: 既有 crew service 测试（若存在）通过；无新增红。若现有测试因新增条件断言失效，属 §Stale-Test——按当前实现更新断言并说明，不得弱化。

- [ ] **Step 4: Commit**

```bash
git add live-server/src/services/crew/crew-service.ts
git commit -m "feat(engine): crew list global rank/base validity gate (expired crew excluded)"
```

---

### Task 3: Backend — bootstrap 补传窗口 + scenario crew scope 全局条件

**Files:**
- Modify: `live-server/src/services/gantt/gantt-service.ts:34-40`
- Modify: `live-server/src/services/scenario/scenario-crew-scope.ts:47-48`
- Test: 远端只读 SQL 验证 + 既有 scenario 测试

**Interfaces:**
- Consumes: `BootstrapParams.startDate/endDate`（YYYY-MM-DD）；`scenario.strDtLoc/endDtLoc`（Date）。
- Produces: bootstrap 传 `dateRangeStart/dateRangeEnd`；`crewIdSet()` 生成的 SQL 含全局 rank+base IN 子查询。

- [ ] **Step 1: bootstrap 补传日期**

`gantt-service.ts` 的 `crewService.list` 调用改为：

```ts
const crew = await crewService.list(
  fastify,
  {
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    dateRangeStart: params.startDate,
    dateRangeEnd: params.endDate,
  },
  { page: 1, pageSize: params.pageSize },
  { slim: true },
)
```

（确认 `BootstrapParams.startDate/endDate` 为 `'YYYY-MM-DD'` 字符串，与 `CrewListFilters.dateRangeStart/dateRangeEnd` 一致。）

- [ ] **Step 2: scenario crew scope 全局条件**

在 `scenario-crew-scope.ts` 的 `parts.push(sql\` AND division = ${division}\`)`（L48）之后、`bases.length` 块之前插入：

```ts
// 全局有效性门槛：与 Live 一致，rank 与 base 各须与 scenario 窗口相交。
parts.push(sql` AND crew_id IN (
  SELECT crew_id FROM ${table('crew_rank')}
  WHERE eff_dt <= ${scenario.endDtLoc}
    AND (exp_dt IS NULL OR exp_dt >= ${scenario.strDtLoc}))`)
parts.push(sql` AND crew_id IN (
  SELECT crew_id FROM ${table('crew_base')}
  WHERE eff_dt <= ${scenario.endDtLoc}
    AND (exp_dt IS NULL OR exp_dt >= ${scenario.strDtLoc}))`)
```

- [ ] **Step 3: 远端只读 SQL 验证 scenario 条件**

```bash
set -a && . ./live-server/.env && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
\pset pager off
-- 模拟 strDtLoc='2026-08-01' endDtLoc='2026-08-31' 的全局条件（895 rank 已过期→排除，1901 部分覆盖→保留）
SELECT crew_id FROM f8_uat_live.crew
WHERE division = 'C' AND crew_id IN ('895','1901','2109')
  AND crew_id IN (SELECT crew_id FROM f8_uat_live.crew_rank
                  WHERE eff_dt <= '2026-08-31'::timestamptz AND (exp_dt IS NULL OR exp_dt >= '2026-08-01'::timestamptz))
  AND crew_id IN (SELECT crew_id FROM f8_uat_live.crew_base
                  WHERE eff_dt <= '2026-08-31'::timestamptz AND (exp_dt IS NULL OR exp_dt >= '2026-08-01'::timestamptz))
ORDER BY crew_id;
SQL
```

Expected: 返回 `1901`、`2109`（不含 `895`）。

- [ ] **Step 4: 运行 scenario 既有测试确认无回归**

Run: `cd live-server && npx vitest run tests/unit/services/scenario 2>/dev/null | tail -15`
Expected: 既有测试通过或仅因新增条件触发 §Stale-Test 更新。

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/gantt/gantt-service.ts live-server/src/services/scenario/scenario-crew-scope.ts
git commit -m "feat(engine): bootstrap passes validity window; scenario crew scope global rank/base gate"
```

---

### Task 4: Frontend — crew-store 各 list 调用补传当前 dateRange

**Files:**
- Modify: `gantt/src/stores/crew-store.ts`

**Interfaces:**
- Consumes: `useFilterStore.getState().dateRange`（`{ start: Date; end: Date }`）。
- Produces: 所有 crew list 请求携带 `dateRangeStart/dateRangeEnd`（YYYY-MM-DD），使 Rule 1 窗口语义正确。

- [ ] **Step 1: 加 import 与辅助函数**

文件顶部加 `import { useFilterStore } from '@/stores/filter-store'`。新增模块级辅助：

```ts
/** 当前 Gantt 窗口（RP±7d），作为 crew 有效性的 dateRange 参数。 */
const currentDateRangeParams = (): Pick<CrewListFilters, 'dateRangeStart' | 'dateRangeEnd'> => {
  const { start, end } = useFilterStore.getState().dateRange
  return {
    dateRangeStart: start.toISOString().slice(0, 10),
    dateRangeEnd: end.toISOString().slice(0, 10),
  }
}
```

（`CrewListFilters` 已从 `@/services/crew-api` 或类型文件导入——按文件现状使用其已有导入。）

- [ ] **Step 2: fetchCrews 补传**

`fetchCrews`（L236-255）的 params 增加：

```ts
const params: CrewListFilters & CrewFilters = {
  page: 1,
  pageSize,
  ...currentDateRangeParams(),
  ...(pageSize > 0 ? { sortBy: get().sortBy, sortOrder: get().sortOrder } : {}),
}
```

- [ ] **Step 3: loadMore 两条分支补传**

- 全局筛选分支（L382-389）：`...(globalFilter ?? {})` 改为 `...(globalFilter ?? { ...currentDateRangeParams() })`。
- Append 模式分支（L427-433）：params 增加 `...currentDateRangeParams()`。

- [ ] **Step 4: 无筛选总数计数补传（badge 一致性）**

`fetchCrewsWithFilter` 里 `crewApi.list({ page: 1, pageSize: 1 })`（L624）改为
`crewApi.list({ page: 1, pageSize: 1, ...currentDateRangeParams() })`。

- [ ] **Step 5: fetchCrewsByIds 补传（显式 ID 也用同一窗口）**

`fetchCrewsByIds`（L530-539）的 params 增加 `...currentDateRangeParams()`。

- [ ] **Step 6: 运行 gantt 既有测试确认无回归**

Run: `cd gantt && npx vitest run 2>&1 | tail -15`
Expected: 既有单测通过（若 crew-store 有单测）。

- [ ] **Step 7: Commit**

```bash
git add gantt/src/stores/crew-store.ts
git commit -m "feat(gantt): pass current dateRange on every crew list call (validity window)"
```

---

### Task 5: Frontend — 共享 roster model 构建失效点 + 画红虚线 + 测试探针

**Files:**
- Modify: `gantt/src/components/gantt/source/gantt-pane-source.ts`
- Modify: `gantt/src/components/gantt/source/live-gantt-source.ts`
- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts`
- Modify: `gantt/src/components/gantt/renderers/roster-renderer.ts`
- Modify: `gantt/src/components/panes/shared/roster-pane.tsx`
- Modify: `gantt/src/utils/gantt-test-hook.ts`

**Interfaces:**
- Consumes: `computeValidityBlock`（Task 1）；`RosterModel`；`BaseRenderContext.rangeStart/rangeEnd`。
- Produces: `RosterModel.crewValidityBlock: Map<string, number>`（仅含窗口内有失效点的机组）；`RosterRenderContext.crewValidityBlock?`；探针 `rosterValidityBlocks()`/`scenarioRosterValidityBlocks()`。

- [ ] **Step 1: RosterModel 接口加字段**

`gantt-pane-source.ts` 的 `RosterModel`（L137-156）增加：

```ts
  /** crewId → 窗口内首个 rank/base 覆盖断档时刻（ms）；仅含需要画红线的机组。 */
  crewValidityBlock: Map<string, number>
```

- [ ] **Step 2: live-gantt-source 构建映射**

`live-gantt-source.ts` 的 `useRosterModel`（L672 起）内、返回 model 之前构建：

```ts
const { start: winStartMs, end: winEndMs } = usePaneStore((s) => s.dateRange)
const crewValidityBlock = new Map<string, number>()
for (const cid of selectedCrewIds) {
  const crew = crewDetailMap.get(cid)
  if (!crew) continue
  const block = computeValidityBlock(crew.ranks ?? [], crew.bases ?? [], winStartMs, winEndMs)
  if (block !== null) crewValidityBlock.set(cid, block)
}
```

（`usePaneStore` 与 `crewDetailMap` 需在作用域内；若该源已有 `getViewPortLeftDate` 之类的日期读取，改用同一来源，保证与 `useRange()` 一致。把 `winStartMs/winEndMs` 与 `crewDetailMap` 加入 model 的 useMemo 依赖。）把 `crewValidityBlock` 加入返回的 model 对象。文件顶部 `import { computeValidityBlock } from '@/utils/crew-validity'`。

- [ ] **Step 3: scenario-gantt-source 构建映射**

`scenario-gantt-source.ts` 的 `useRosterModel`（L699 起）内同样构建（crew 类型为 `ScenarioGanttCrew`，已有 `ranks/bases`，见 L592-597）：

```ts
const { start: winStartMs, end: winEndMs } = <scenario pane date range 读取，与 useRange() 同源>
const crewValidityBlock = new Map<string, number>()
for (const c of crewList) {
  const block = computeValidityBlock(c.ranks ?? [], c.bases ?? [], winStartMs, winEndMs)
  if (block !== null) crewValidityBlock.set(c.crewId, block)
}
```

加入返回的 model 对象与 useMemo 依赖；顶部 import `computeValidityBlock`。

- [ ] **Step 4: roster-renderer 增加字段并绘制**

`roster-renderer.ts` 的 `RosterRenderContext`（L173-206）增加：

```ts
  /** crewId → 失效点 ms（窗口内首个覆盖断档）；有此值的行画红色虚线段。 */
  crewValidityBlock?: Map<string, number>
```

在 `renderRosterTasks` 内、`drawBucketsForRows(frozenCrewRowMap)` 与 `withScrollableClip(() => drawBucketsForRows(scrollableCrewRowMap))` 之后调用：

```ts
const drawValidityLines = (rowMap: Map<string, number>): void => {
  const blocks = rc.crewValidityBlock
  if (!blocks || blocks.size === 0) return
  const { rangeStart, rangeEnd, scrollX, pxPerHour } = rc
  for (const [crewId, rowIndex] of rowMap) {
    const blockMs = blocks.get(crewId)
    if (blockMs == null) continue
    const x = timeToX(blockMs, rangeStart, pxPerHour, 'UTC') - scrollX
    const endX = timeToX(rangeEnd, rangeStart, pxPerHour, 'UTC') - scrollX
    if (endX <= 0 || x >= rc.canvasWidth) continue
    const y = rowY(rowIndex, rc.scrollY, rc.frozenRowCount) + ROW_HEIGHT / 2
    ctx.save()
    ctx.strokeStyle = '#ef4444' // 与 drawNowLine 的 nowLineColor 同红
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(Math.min(endX, rc.canvasWidth), y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }
}
drawValidityLines(frozenCrewRowMap)
withScrollableClip(() => drawValidityLines(scrollableCrewRowMap))
```

（`timeToX`、`rowY`、`ROW_HEIGHT` 均已导入，见文件头。）

- [ ] **Step 5: roster-pane 传入 rc 并发布探针**

`roster-pane.tsx` 的 `renderContent`（L464-481）rc 对象增加：

```ts
      crewValidityBlock: model.crewValidityBlock,
```

`renderContent` 的 `useCallback` 依赖数组加入该字段来源（model 已在其作用域）。另在 L570-578 的 `publishPanelRows` useEffect 内（或紧随其后）增加：

```ts
useEffect(() => {
  publishValidityBlocks(
    testPaneType,
    Array.from(model.crewValidityBlock, ([crewId, blockMs]) => ({ crewId, blockMs })),
  )
}, [model.crewValidityBlock, testPaneType])
```

文件顶部 `import { publishValidityBlocks } from '@/utils/gantt-test-hook'`。

- [ ] **Step 6: 测试探针**

`gantt-test-hook.ts`：
- 在 `panelRowsByPane`（L462）附近加：
  ```ts
  const validityBlocksByPane = new Map<string, Array<{ crewId: string; blockMs: number }>>()
  export const publishValidityBlocks = (
    paneType: string,
    blocks: Array<{ crewId: string; blockMs: number }>,
  ): void => {
    if (import.meta.env.PROD) return
    validityBlocksByPane.set(paneType, blocks)
  }
  ```
- `GanttTestApi` 接口（L133 附近）加：
  ```ts
  rosterValidityBlocks: () => Array<{ crewId: string; blockMs: number }>
  scenarioRosterValidityBlocks: () => Array<{ crewId: string; blockMs: number }>
  ```
- 实现（仿 `rosterPanelOrder` L704）：
  ```ts
  const rosterValidityBlocks = (): Array<{ crewId: string; blockMs: number }> =>
    validityBlocksByPane.get('roster-main') ?? []
  const scenarioRosterValidityBlocks = (): Array<{ crewId: string; blockMs: number }> =>
    validityBlocksByPane.get('scenario-roster') ?? []
  ```
- 在返回对象（L2038 附近）注册 `rosterValidityBlocks, scenarioRosterValidityBlocks`。

- [ ] **Step 7: 类型检查**

Run: `cd gantt && npx tsc -b --pretty false`
Expected: 无类型错误。

- [ ] **Step 8: 运行 gantt 单测 + check:ui**

Run: `cd gantt && npx vitest run 2>&1 | tail -15 && cd .. && npm run check:ui 2>&1 | tail -15`
Expected: 单测通过；`check:ui` 硬违规为 0（贴 PASS）。

- [ ] **Step 9: Commit**

```bash
git add gantt/src/components/gantt/source/gantt-pane-source.ts \
  gantt/src/components/gantt/source/live-gantt-source.ts \
  gantt/src/components/gantt/source/scenario-gantt-source.ts \
  gantt/src/components/gantt/renderers/roster-renderer.ts \
  gantt/src/components/panes/shared/roster-pane.tsx \
  gantt/src/utils/gantt-test-hook.ts
git commit -m "feat(gantt): red dashed validity line on crew lanes from coverage-gap to window end (Live+Scenario)"
```

---

### Task 6: E2E — Live Rule 1（过滤排除过期组员）

**Files:**
- Create: `e2e/gantt/filter/crew-validity-filter.spec.ts`

**Interfaces:**
- Consumes: 真实后端 + UAT 数据（895 过期、2109 有效、RP08 2026）；`__ganttTest` 探针。
- Produces: 证明 Division=C + RP08 窗口下 895 不在 roster、有效机组在。

- [ ] **Step 1: 写测试**

沿用 `e2e/gantt/` 既有登录/打开 Gantt/选 RP 的辅助（参考同目录现有 spec 的 helper 用法）。核心断言：

```ts
test('division-only Cabin filter excludes expired crew within the RP window', async ({ page }) => {
  // 1. 登录并打开 live Gantt
  // 2. 用 toolbar RP 多选选中 '2026RP08'
  // 3. 打开 Filter 对话框 → Crew tab → Division 选 'C — Cabin' → Apply
  // 4. 等待 roster 加载完成（用既有 loading 消失 + 行数变化的判定）
  // 5. 断言 895 不在左侧表头面板行中
  const rows = await page.evaluate(() => window.__ganttTest?.rosterPanel?.() ?? [])
  const crewIds = rows.map((r) => r.crewId)
  expect(crewIds).not.toContain('895')            // rank 已过期（2026-03-31 < 窗口）
  expect(crewIds).toContain('2109')               // rank/base 窗口内有效
})
```

> 依赖目标环境数据：895/2109/RP08 2026 必须存在于被测环境（本地 UAT 已验证）。若目标环境数据不同，改用该环境下确认过期的 crew（先在 DB 验证其 rank/base 与窗口无交集）。

- [ ] **Step 2: 运行测试并贴 PASS**

Run: `npx playwright test e2e/gantt/filter/crew-validity-filter.spec.ts --reporter=list`
Expected: PASS（把摘要贴到完成消息）。

- [ ] **Step 3: Commit**

```bash
git add e2e/gantt/filter/crew-validity-filter.spec.ts
git commit -m "test(gantt): division-only filter excludes expired crew within RP window"
```

---

### Task 7: E2E — Live Rule 2（红线）+ Scenario Rule 1 & 2

**Files:**
- Create: `e2e/gantt/roster/crew-validity-redline.spec.ts`
- Create: `e2e/gantt/scenario/crew-validity-scenario.spec.ts`

**Interfaces:**
- Consumes: 探针 `rosterValidityBlocks()` / `scenarioRosterValidityBlocks()`；UAT 数据 1901（rank 2026-07-31 失效）；scenario mock gantt-data 模式。
- Produces: 1901 行 red-line 探针 blockMs ≈ 2026-07-31；scenario 排除过期 + 失效机组红线。

- [ ] **Step 1: Live 红线测试**

```ts
test('crew with rank expiry inside window draws a validity line at the expiry', async ({ page }) => {
  // 登录 → 打开 live Gantt → 选 '2026RP08'
  const blocks = await page.evaluate(() => window.__ganttTest?.rosterValidityBlocks?.() ?? [])
  const row = blocks.find((b) => b.crewId === '1901')
  expect(row).toBeTruthy()
  // 1901 的 rank IFD 失效于 2026-07-31（窗口 07-25..09-07 内）
  expect(row.blockMs).toBe(Date.UTC(2026, 6, 31))
  // 有效机组（2109）不应有 block 条目
  expect(blocks.find((b) => b.crewId === '2109')).toBeUndefined()
})
```

（若 1901 在目标环境数据不同，改为该环境下实测的失效点；DB 验证先行。）

- [ ] **Step 2: Scenario 测试**

沿用既有 scenario E2E 的 mock gantt-data + `__ganttTest` 模式（见 `e2e/gantt/scenario/` 现有 spec）。mock 数据需含：一个 rank/base 全过期的 crew（验证不进 roster）、一个 rank 在 scenario 窗口内失效且有后续覆盖的晋升 crew（验证无红线）、一个 rank 窗口内失效无覆盖的 crew（验证 `scenarioRosterValidityBlocks` 含其 blockMs）。断言：
- 过期 crew 不在 scenario roster 面板行中；
- 晋升 crew 的 block 探针无条目；
- 失效 crew 的 block 探针有对应 blockMs。

- [ ] **Step 3: 运行两个 spec 并贴 PASS**

Run: `npx playwright test e2e/gantt/roster/crew-validity-redline.spec.ts e2e/gantt/scenario/crew-validity-scenario.spec.ts --reporter=list`
Expected: 全部 PASS。

- [ ] **Step 4: Commit**

```bash
git add e2e/gantt/roster/crew-validity-redline.spec.ts e2e/gantt/scenario/crew-validity-scenario.spec.ts
git commit -m "test(gantt): validity red line (Live) + scenario validity filter & red line"
```

---

### Task 8: 全局收尾 — 全量验证 + check:ui 门禁

**Files:**
- 无新增。

- [ ] **Step 1: 全量单测**

Run: `cd live-server && npx vitest run 2>&1 | tail -15; cd ../gantt && npx vitest run 2>&1 | tail -15`
Expected: 无新增失败（既有失败见 memory `project-pre-existing-test-failures`，不属于本改动）。

- [ ] **Step 2: check:ui 门禁**

Run: `cd /home/yuan.z/rois/rois-ai && npm run check:ui 2>&1 | tail -15`
Expected: 硬违规 0。把 PASS 摘要贴到完成消息。

- [ ] **Step 3: 全量相关 E2E**

Run: `npx playwright test e2e/gantt/filter/crew-validity-filter.spec.ts e2e/gantt/roster/crew-validity-redline.spec.ts e2e/gantt/scenario/crew-validity-scenario.spec.ts --reporter=list`
Expected: 全 PASS。

- [ ] **Step 4: detect_changes 影响面核对（GitNexus）**

Run: `node .gitnexus/run.cjs analyze` 后 `detect_changes({scope:"compare", base_ref:"main"})`
Expected: 仅上述文件相关符号受影响；无 HIGH/CRITICAL 未告知项。

- [ ] **Step 5: 收尾提交（若 Task 1-7 有遗留未提交改动）**

```bash
git status --short
git add -A
git commit -m "chore: crew rank/base validity feature — final sweep"
```

---

## Self-Review

**Spec 覆盖核对：**
- Rule 1 过滤（Live）：Task 2 + Task 4（窗口补传）+ 探针/E2E Task 6。✓
- Rule 1 过滤（Scenario）：Task 3。✓
- Rule 2 红线（Live + Scenario 共享）：Task 1 + Task 5 + E2E Task 7。✓
- 显式 crewId 也排除（§决策3）：Task 2（同一 WHERE）+ Task 4 Step 5。✓
- 红线延伸到窗口最后一天（§决策4）：Task 5 Step 4 用 `rangeEnd`。✓
- 晋升链不误触（数据实证）：Task 1 测试用例 5。✓

**占位符扫描：** 无 TBD/TODO；两处「若目标环境数据不同」是环境依赖说明，非占位符。

**类型一致性：** `computeValidityBlock(ranks, bases, winStartMs, winEndMs): number | null` 在 Task 1 定义、Task 5 Step 2/3 消费；`RosterModel.crewValidityBlock: Map<string, number>` 在 Step 1 定义、Step 4/5 消费；探针 `rosterValidityBlocks`/`scenarioRosterValidityBlocks` 一致。✓
