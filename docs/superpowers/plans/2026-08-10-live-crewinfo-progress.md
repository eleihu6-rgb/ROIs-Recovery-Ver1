# Live Gantt CrewInfo 提速 + 真实加载进度条 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CrewInfo 打开从 7 请求降到 3 请求；PaneLoadingBar 从 indeterminate 动画改为真实百分比，roster 分批并发 + pairing 单次全量，flight 后台静默，单轮加载消除双取。

**Architecture:** 前端改动全部在 gantt。CrewInfo 用新纯函数 `crewInfoFromStore(crewId)` 从 crew-store 已加载数据取 ranks/bases/fleets、后端只拉 qual/cert/team。进度条用 store 里新增 `progress: number | null` 驱动 determinate 条；roster store 按 crew 批并发更新进度，pairing store 单请求更新进度。`apply-filters.ts` 改为单轮：roster 拆 4 批并发 + pairing 单请求并行，flight 后台。

**Tech Stack:** React 19 + Zustand + TypeScript + Vitest + Playwright。无新依赖。

## Global Constraints

- UI 默认英文；代码注释/commit 可用中文。
- 禁止 `any`；函数参数与返回值必须有类型。
- 组件样式走 token（`bg-primary` 等），PaneLoadingBar 用现有 2px 高度与 `rois-bar` 视觉，不引入新魔法值。
- 改动后必须跑 `npx tsc --noEmit`（0 errors）、相关 Vitest、相关 Playwright、`npm run check:ui`（0 hard violations）。
- 每个 UI 改动配 Playwright 测试（§Playwright-Required）；纯逻辑用 Vitest。
- 遵循 §Minimal-First：只实现 spec 请求的行为，不做投机抽象。
- commit 用 `<类型>(gantt): <描述>` + `Co-Authored-By: Claude <noreply@anthropic.com>`。

---

### Task 1: `crewInfoFromStore` 纯函数 + 单测

**Files:**
- Create: `gantt/src/stores/__tests__/crew-info-from-store.test.ts`
- Modify: `gantt/src/stores/crew-store.ts`（在文件末尾、`useCrewStore` 之后新增导出函数）

**Interfaces:**
- Consumes: `CrewInfo`、`Crew`、`CrewQualificationRecord`、`CrewCertificateRecord`、`CrewTeamRecord`（`@/types`，已存在）；`crewApi`（`@/services/crew-api`，已存在）；`useCrewStore`（本文件）。
- Produces: `export const crewInfoFromStore = async (crewId: string): Promise<CrewInfo>` — 从 store 取 crew 的 ranks/bases/fleets，并行拉 qual/cert/team；store 未命中时回退 `crewApi.getInfo(crewId)`。

- [ ] **Step 1: Write the failing test**

创建 `gantt/src/stores/__tests__/crew-info-from-store.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { crewInfoFromStore } from '../crew-store'
import { useCrewStore } from '../crew-store'
import { crewApi } from '@/services/crew-api'

const baseCrew = {
  id: 1,
  crewId: 'C001',
  firstName: 'A', middleName: null, lastName: 'B', preferredName: null,
  gender: 'F', division: 'P', filiale: 'F8', status: 0, remarks: null, seniorityNum: '100',
}

describe('crewInfoFromStore', () => {
  beforeEach(() => {
    useCrewStore.setState({
      items: [{
        crew: {
          ...baseCrew,
          ranks: [{ id: 1, crewId: 'C001', rank: 'CA', effDt: '2026-01-01', expDt: null }],
          bases: [{ id: 1, crewId: 'C001', base: 'YOW', effDt: '2026-01-01', expDt: null }],
          fleets: [{ id: 1, crewId: 'C001', fleetSpecific: '320', effDt: '2026-01-01', expDt: null }],
        },
        sessionTags: [],
      }],
    })
  })

  it('reads ranks/bases/fleets from store, fetches qual/cert/team from backend', async () => {
    vi.spyOn(crewApi, 'getInfo').mockResolvedValue({} as never)
    // mock the raw api.get paths for qual/cert/team — getQualifications/getCertificates/
    // getTeams do not exist yet; the plan adds them in Step 3, then mock those new methods.
    const http = (await import('@/services/api')).api
    vi.spyOn(http, 'get').mockImplementation((url: unknown) => {
      const u = String(url)
      if (u.includes('/qualifications') || u.includes('/certificates') || u.includes('/teams')) {
        return Promise.resolve([])
      }
      return Promise.reject(new Error('unexpected GET ' + u))
    })
    const info = await crewInfoFromStore('C001')
    expect(info.crew.crewId).toBe('C001')
    expect(info.ranks).toHaveLength(1)
    expect(info.ranks[0].rank).toBe('CA')
    expect(info.bases[0].base).toBe('YOW')
    expect(info.fleets[0].fleetSpecific).toBe('320')
    expect(crewApi.getInfo).not.toHaveBeenCalled()
  })

  it('falls back to crewApi.getInfo when crew not in store', async () => {
    const full = { crew: baseCrew, ranks: [], bases: [], fleets: [], qualifications: [], certifications: [], teams: [] }
    vi.spyOn(crewApi, 'getInfo').mockResolvedValue(full as never)
    const info = await crewInfoFromStore('NOT_IN_STORE')
    expect(info.crew.crewId).toBe('C001')
    expect(crewApi.getInfo).toHaveBeenCalledWith('NOT_IN_STORE')
  })
})
```

> 注意：上面 mock 的 `getQualifications/getCertificates/getTeams` 若不存在，以 Step 3 实现的实际函数名/直接 `api.get` 调用为准调整 mock（测试只 mock 后端 3 项 + 回退 `getInfo`）。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/stores/__tests__/crew-info-from-store.test.ts`
Expected: FAIL — `crewInfoFromStore is not a function`（未导出）。

- [ ] **Step 3: Implement `crewInfoFromStore`**

在 `gantt/src/stores/crew-store.ts` 末尾（`useCrewStore` create 之后）新增：

```ts
/**
 * CrewInfo 数据组装：ranks/bases/fleets 从已加载 crew 数据取（列表全量已内联），
 * qualifications/certifications/teams 后端并行拉。store 未命中（如 Find Crew
 * 带来的未全量 crew）时回退 crewApi.getInfo 全量。
 */
export const crewInfoFromStore = async (crewId: string): Promise<CrewInfo> => {
  const item = useCrewStore.getState().items.find((i) => i.crew.crewId === crewId)
  if (!item) return crewApi.getInfo(crewId)
  const crew = item.crew
  const [qualifications, certifications, teams] = await Promise.all([
    crewApi.getQualifications(crewId),
    crewApi.getCertificates(crewId),
    crewApi.getTeams(crewId),
  ])
  return {
    crew,
    ranks: crew.ranks ?? [],
    bases: crew.bases ?? [],
    fleets: crew.fleets ?? [],
    qualifications,
    certifications,
    teams,
  }
}
```

在 `gantt/src/services/crew-api.ts` 补三个方法（若不存在）：

```ts
async getQualifications(crewId: string): Promise<CrewQualificationRecord[]> {
  return api.get(`/api/crew/${encodeURIComponent(crewId)}/qualifications`) as Promise<CrewQualificationRecord[]>
},
async getCertificates(crewId: string): Promise<CrewCertificateRecord[]> {
  return api.get(`/api/crew/${encodeURIComponent(crewId)}/certificates`) as Promise<CrewCertificateRecord[]>
},
async getTeams(crewId: string): Promise<CrewTeamRecord[]> {
  return api.get(`/api/crew/${encodeURIComponent(crewId)}/teams`) as Promise<CrewTeamRecord[]>
},
```

`crewApi.getInfo` 内部已有这三段 URL 调用，可顺手把 `getInfo` 改为复用这三个方法（可选，不强制）。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/stores/__tests__/crew-info-from-store.test.ts`
Expected: PASS（2 tests）。

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/crew-store.ts gantt/src/services/crew-api.ts gantt/src/stores/__tests__/crew-info-from-store.test.ts
git commit -m "feat(gantt): crewInfoFromStore reads ranks/bases/fleets from store"
```

---

### Task 2: CrewInfoDialog 改用 `crewInfoFromStore`

**Files:**
- Modify: `gantt/src/components/roster/crew-info-dialog.tsx:178-194`（useEffect）
- Test: `gantt/src/stores/__tests__/crew-info-from-store.test.ts`（Task 1 已覆盖底层；本任务加组件级集成验证可选）

**Interfaces:**
- Consumes: `crewInfoFromStore`（Task 1）。
- Produces: 无新接口；`CrewInfoDialog` 行为变化：打开时 3 请求而非 7。

- [ ] **Step 1: 改 useEffect 用 `crewInfoFromStore`**

把 `gantt/src/components/roster/crew-info-dialog.tsx` 的 `crewApi.getInfo` 调用替换：

```ts
import { crewInfoFromStore } from '@/stores/crew-store'
// ...（crewApi 若无其他用途则删除 import）
useEffect(() => {
  if (!open || !crewId) {
    setInfo(null); setError(null); setLoading(false)
    return
  }
  setLoading(true)
  setError(null)
  void crewInfoFromStore(crewId)
    .then(setInfo)
    .catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Failed to load crew info')
    })
    .finally(() => setLoading(false))
}, [open, crewId])
```

若 `crewApi` 不再被本文件使用，删除 `import { crewApi } from '@/services/crew-api'`。

- [ ] **Step 2: 类型检查**

Run: `cd gantt && npx tsc --noEmit`
Expected: 0 errors。

- [ ] **Step 3: 单测确认底层仍绿（防回归）**

Run: `cd gantt && npx vitest run src/stores/__tests__/crew-info-from-store.test.ts`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/roster/crew-info-dialog.tsx
git commit -m "feat(gantt): CrewInfoDialog uses crewInfoFromStore (3 requests not 7)"
```

---

### Task 3: store 进度字段 + PaneLoadingBar determinate

**Files:**
- Modify: `gantt/src/stores/roster-store.ts`（`RosterPaneState` 加 `progress`；`createEmptyPaneState` 加 `progress: null`）
- Modify: `gantt/src/stores/pairing-store.ts`（store 加 `progress: number | null`；初始 `null`）
- Modify: `gantt/src/components/panes/pane-loading-bar.tsx`（`loading` → `progress`，determinate 渲染）
- Modify: `gantt/src/components/panes/roster-pane.tsx:167`（调用点）
- Modify: `gantt/src/components/panes/pairing-pane.tsx:982`（调用点）
- Create: `gantt/src/components/panes/__tests__/pane-loading-bar.test.tsx`

**Interfaces:**
- Consumes: `RosterPaneState.progress`、`PairingStore.progress`（本任务定义）。
- Produces:
  - `PaneLoadingBar({ progress }: { progress: number | null })` — progress 非 null 渲染 determinate 条，null 隐藏。
  - roster/pairing store 各自的 `progress` 字段（Task 4 会写入）。

- [ ] **Step 1: Write the failing test for PaneLoadingBar**

创建 `gantt/src/components/panes/__tests__/pane-loading-bar.test.tsx`（用项目现有 jsdom + createRoot 模式，不用 @testing-library/react——项目未安装 RTL）：

```tsx
import { createRoot } from 'react-dom/client'
import { describe, it, expect } from 'vitest'
import { PaneLoadingBar } from '../pane-loading-bar'

const renderBar = (progress: number | null): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  root.render(<PaneLoadingBar progress={progress} />)
  return container
}

describe('PaneLoadingBar', () => {
  it('renders a determinate bar at the given percentage', () => {
    const container = renderBar(42)
    const bar = container.querySelector('[data-testid="pane-loading-bar-fill"]') as HTMLElement | null
    expect(bar).not.toBeNull()
    expect(bar?.style.width).toBe('42%')
    container.remove()
  })

  it('hidden when progress is null', () => {
    const container = renderBar(null)
    expect(container.querySelector('[data-testid="pane-loading-bar"]')).toBeNull()
    container.remove()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/components/panes/__tests__/pane-loading-bar.test.tsx`
Expected: FAIL — 组件仍接收 `loading`，无 `progress`。

- [ ] **Step 3: Rewrite PaneLoadingBar**

替换 `gantt/src/components/panes/pane-loading-bar.tsx`：

```tsx
/**
 * Deterministic loading bar for Gantt panes.
 * Renders a 2px strip between the toolbar and canvas area while data is fetching.
 * progress: 0-100 real percentage; null = not loading (hidden).
 */
export const PaneLoadingBar = ({ progress }: { progress: number | null }) => {
  if (progress === null) return null
  return (
    <div className="relative shrink-0 h-[2px] overflow-hidden bg-muted/50" data-testid="pane-loading-bar">
      <div
        data-testid="pane-loading-bar-fill"
        className="absolute left-0 top-0 h-full bg-primary/70 transition-[width] duration-150"
        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
      />
    </div>
  )
}
```

更新两个调用点：
- `roster-pane.tsx:167`：`loadingBar: <PaneLoadingBar progress={rosterProgress} />`
- `pairing-pane.tsx:982`：`<PaneLoadingBar progress={pairingProgress} />`

其中 `rosterProgress`/`pairingProgress` 是接下来 Task 4 要接的 store 字段；本任务先用占位（`useRosterStore(s => s.main.progress)` / `usePairingStore(s => s.progress)`），Task 4 会让它们真正有值。若两个 pane 当前已订阅 `loading`，本任务同时更新订阅为 `progress`。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/components/panes/__tests__/pane-loading-bar.test.tsx`
Expected: PASS。

- [ ] **Step 5: Typecheck + UI gate**

Run: `cd gantt && npx tsc --noEmit` → 0 errors；`cd /home/yuan.z/rois/rois-ai && npm run check:ui` → 0 hard violations。

- [ ] **Step 6: Commit**

```bash
git add gantt/src/stores/roster-store.ts gantt/src/stores/pairing-store.ts gantt/src/components/panes/pane-loading-bar.tsx gantt/src/components/panes/roster-pane.tsx gantt/src/components/panes/pairing-pane.tsx gantt/src/components/panes/__tests__/pane-loading-bar.test.tsx
git commit -m "feat(gantt): deterministic PaneLoadingBar with per-pane progress"
```

---

### Task 4: roster 分批并发 + pairing 单请求，驱动进度

**Files:**
- Modify: `gantt/src/utils/apply-filters.ts`（phase-1/phase-2 → 单轮分批）
- Modify: `gantt/src/stores/roster-store.ts`（新增 `setProgress` 或直接 set；分批 append 更新 progress）
- Modify: `gantt/src/stores/pairing-store.ts`（`fetchPairings` 设置 progress）
- Modify: `gantt/src/stores/gantt-view-store.ts`（`loadRosterProgressive` 或新增分批方法）
- Test: `gantt/src/utils/__tests__/apply-filters-batch.test.ts`（新增）

**Interfaces:**
- Consumes: `RosterPaneState.progress`、`PairingStore.progress`（Task 3）、`fetchPairings(dateRange, filter)`、`fetchRoster`/`appendRoster`（已存在）。
- Produces:
  - `ROSTER_BATCH_SIZE = 205`（≈ 817/4）常量。
  - `useGanttViewStore.loadRosterBatched(crewIds, dateRange): Promise<void>` — 拆 `ceil(crewIds.length / ROSTER_BATCH_SIZE)` 批并发 `fetchRoster`，每批完成 `useRosterStore.setState` 更新 `main.progress = done/total*100`，全部完成后置 `progress: null`。
  - `applyGanttFilters` 单轮：`fetchCrews()` → `loadRosterBatched(all, dateRange)`（与 pairing 并行）；pairing `fetchPairings(dateRange, filter)` 内设置 `progress` 0→100→null。

- [ ] **Step 1: Write the failing unit test for batch progress calc**

创建 `gantt/src/utils/__tests__/apply-filters-batch.test.ts`（测纯进度计算，不测网络）：

```ts
import { describe, it, expect } from 'vitest'
import { batchProgresses } from '../apply-filters'

describe('batchProgresses', () => {
  it('returns 0..100 per completed batch', () => {
    expect(batchProgresses(4, 817)).toEqual([25, 50, 75, 100])
    expect(batchProgresses(1, 817)).toEqual([100])
  })
  it('empty crew list -> empty array (no batches)', () => {
    expect(batchProgresses(4, 0)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/utils/__tests__/apply-filters-batch.test.ts`
Expected: FAIL — `batchProgresses is not defined`。

- [ ] **Step 3: 实现 `batchProgresses` + `loadRosterBatched` + apply-filters 单轮**

在 `gantt/src/utils/apply-filters.ts` 顶部新增：

```ts
/** 分批并发的进度序列：N 批完成时依次为 100/N, 200/N, ..., 100。 */
export const batchProgresses = (batchCount: number, totalItems: number): number[] => {
  if (totalItems <= 0 || batchCount <= 0) return []
  return Array.from({ length: batchCount }, (_, i) => Math.round(((i + 1) / batchCount) * 100))
}
```

在 `gantt/src/stores/gantt-view-store.ts` 新增方法（`loadRosterProgressive` 旁）：

```ts
/** roster 按 crew 分批并发加载，每批完成更新 main.progress（0-100）。 */
loadRosterBatched: async (crewIds: string[], dateRange: { start: Date; end: Date }) => {
  const BATCH = 205
  const batches: string[][] = []
  for (let i = 0; i < crewIds.length; i += BATCH) batches.push(crewIds.slice(i, i + BATCH))
  if (batches.length === 0) {
    useRosterStore.setState((s) => ({ main: { ...s.main, progress: null } }))
    return
  }
  const progresses = batchProgresses(batches.length, crewIds.length)
  await Promise.all(
    batches.map((batch, idx) =>
      (async () => {
        await useRosterStore.getState().fetchRoster('main', batch, dateRange)
        useRosterStore.setState((s) => ({ main: { ...s.main, progress: progresses[idx] } }))
      })(),
    ),
  )
  useRosterStore.setState((s) => ({ main: { ...s.main, progress: null } }))
  useGanttViewStore.getState().markDirty()
},
```

改写 `apply-filters.ts` 的加载主体（替换 phase-1/phase-2 的 crewWindowed 分支）：

```ts
// 单轮：crew 全量 → roster 分批并发（与 pairing 并行）
const rosterBatchPromise =
  crewChanged && rosterVisible
    ? (async () => {
        if (hasCrewFilter) await useCrewStore.getState().fetchCrewsWithFilter(crewFilter, dateRange)
        else await useCrewStore.getState().fetchCrews()
        const { selectedCrewIds } = useCrewStore.getState()
        if (selectedCrewIds.length > 0) {
          await useGanttViewStore.getState().loadRosterBatched(selectedCrewIds, dateRange)
        }
      })()
    : Promise.resolve()

const pairingPromise =
  pairingChanged && pairingVisible
    ? usePairingStore.getState().fetchPairings(dateRange, pairingFilter)
    : Promise.resolve()

await Promise.all([rosterBatchPromise, pairingPromise])
```

> 注意：`fetchPairings` 内部已置 `loading`；本任务在 pairing-store 的 `fetchPairings` 开头加 `set({ progress: 0 })`、成功 `set({ progress: 100 })`、finally 或结尾 `set({ progress: null })`（保留 `loading` 布尔不变）。flight 保持现有后台 `void fetchFlights` 不变。
>
> 删除旧的 `loadFromBootstrap` 调用、`markPartiallyLoaded`、phase-2 里 `fetchCrews()`+`loadRosterProgressive` 重复加载、`checkCrews` 之后的重复 rule-check 触发（保留一次 `checkCrews(all, items)`）。`markFullyLoaded` 在 `loadRosterBatched` 全部完成后调用（保持 `whenFullyLoaded` 语义）。

- [ ] **Step 4: Run tests to verify pass**

Run: `cd gantt && npx vitest run src/utils/__tests__/apply-filters-batch.test.ts`
Expected: PASS。

再跑相关存量单测确认没破坏：
Run: `cd gantt && npx vitest run src/stores/__tests__/gantt-view-store-zoom-rp.test.ts src/stores/__tests__/roster-store-draft-legality.test.ts`
Expected: PASS。

- [ ] **Step 5: Typecheck + UI gate**

Run: `cd gantt && npx tsc --noEmit` → 0 errors；`npm run check:ui` → 0 hard violations。

- [ ] **Step 6: E2E 验证进度条真实推进**

新增 `e2e/tests/gantt/load-progress.spec.ts`（基于 `live-empty-start.spec.ts` 的 `gotoLiveRaw` 模式，避免慢的全量 apply 卡住）：

```ts
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const gotoLiveRaw = async (page: Page): Promise<void> => {
  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  await page.getByTestId('module-nav-live').click()
}

test('load progress bar reaches 100 then hides; no reload after', async ({ page }) => {
  await seedGanttAuth(page, page.request)
  await gotoLiveRaw(page)

  await page.getByTestId('live-empty-state').click()
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).not.toBeVisible()

  // Roster progress bar appears and reaches 100.
  const rosterBar = page.getByTestId('roster-pane').locator('[data-testid="pane-loading-bar-fill"]')
  await expect.poll(async () => {
    const width = await rosterBar.getAttribute('style').catch(() => null)
    return width?.includes('100%') ?? false
  }, { timeout: 60_000 }).toBe(true)
  // Bar hides after load.
  await expect(page.getByTestId('roster-pane').locator('[data-testid="pane-loading-bar"]')).toHaveCount(0, { timeout: 60_000 })

  // No reload after: capture roster count, wait, assert unchanged.
  const rosterBefore = await page.evaluate(() => window.__ganttTest?.counts?.().roster ?? 0)
  await page.waitForTimeout(3000)
  const rosterAfter = await page.evaluate(() => window.__ganttTest?.counts?.().roster ?? 0)
  expect(rosterAfter).toBe(rosterBefore)
  expect(rosterBefore).toBeGreaterThan(0)
})
```

Run: `cd e2e && npx playwright test --config=config/playwright.gantt-only.config.ts -g "load progress bar reaches 100" --timeout=300000`
Expected: PASS（若本机 UAT 数据加载超时，按 §Stale-Test 先确认是否环境问题——参考 live-full-load 已知超时）。

> 若 `roster-pane` 的 loadingBar 挂载位置在 canvas 外层且有独立 testid，按实际 DOM 调整 locator。进度条 testid 用 Task 3 加的 `pane-loading-bar`/`pane-loading-bar-fill`。

- [ ] **Step 7: Commit**

```bash
git add gantt/src/utils/apply-filters.ts gantt/src/stores/roster-store.ts gantt/src/stores/pairing-store.ts gantt/src/stores/gantt-view-store.ts gantt/src/utils/__tests__/apply-filters-batch.test.ts e2e/tests/gantt/load-progress.spec.ts
git commit -m "feat(gantt): batched concurrent roster load with real progress; single-round apply"
```

---

### Task 5: 更新受影响的存量 E2E（windowed-first-paint / first-paint-phases）

**Files:**
- Modify: `e2e/tests/gantt/windowed-first-paint.spec.ts`（若断言旧窗口化行为）
- Modify: `e2e/tests/gantt/first-paint-phases.spec.ts`（若断言 bootstrap 阶段）
- Modify: `e2e/tests/gantt/live-empty-start.spec.ts`（若 `Live-1091` 依赖 phase-1 先 40 行）

**Interfaces:**
- Consumes: 无新接口；验证 Task 4 后的行为。
- Produces: 更新后的断言。

- [ ] **Step 1: 审阅两个 spec 是否断言旧窗口化**

```bash
grep -n "windowed\|bootstrap\|first-40\|40\|phase-1\|phase-2\|partiallyLoaded\|markPartiallyLoaded" e2e/tests/gantt/windowed-first-paint.spec.ts e2e/tests/gantt/first-paint-phases.spec.ts
```

对每个命中断言，评估是否与新单轮分批行为冲突。冲突的按 §Stale-Test 更新为「roster 分批并发加载」语义；不冲突的不动。

- [ ] **Step 2: 运行并确认这两个 spec 通过（或更新后通过）**

Run: `cd e2e && npx playwright test --config=config/playwright.gantt-only.config.ts windowed-first-paint.spec.ts first-paint-phases.spec.ts --timeout=300000`
Expected: PASS（或按 Step 1 更新后 PASS）。若因本机 UAT 数据加载慢而超时，先确认与改动无关（对照 clean main 同 spec）。

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/gantt/windowed-first-paint.spec.ts e2e/tests/gantt/first-paint-phases.spec.ts e2e/tests/gantt/live-empty-start.spec.ts
git commit -m "test(gantt): update first-paint specs for single-round batched load"
```

---

### Task 6: CrewInfo E2E + 全量回归 + 收尾

**Files:**
- Create: `e2e/tests/gantt/crew-info-from-store.spec.ts`
- Modify: 无（若回归发现问题再改）

**Interfaces:**
- Consumes: Task 1-5 全部产物。
- Produces: 最终验证。

- [ ] **Step 1: 写 CrewInfo E2E**

创建 `e2e/tests/gantt/crew-info-from-store.spec.ts`，复用 `scenario-context-menu.spec.ts` 的右键打开方式（roster 行右键 → `Crew Info` 菜单项）：

```ts
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

const gotoLiveRaw = async (page: Page): Promise<void> => {
  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  await page.getByTestId('module-nav-live').click()
}

/** Right-click a roster row at a fixed screen point (mirrors scenario-context-menu.spec.ts). */
const rightClickFirstRosterRow = async (page: Page): Promise<void> => {
  const canvas = page.getByTestId('roster-canvas')
  const box = (await canvas.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }
  await page.mouse.click(box.x + 24, box.y + 30 + 21, { button: 'right' })
}

test('CrewInfo Base/Rank blocks come from loaded store data', async ({ page }) => {
  await seedGanttAuth(page, page.request)
  await gotoLiveRaw(page)

  // Apply to load crew list (stores ranks/bases/fleets).
  await page.getByTestId('live-empty-state').click()
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).not.toBeVisible()
  await expect.poll(async () => (await readHook<{ total: number }>(page, 'crewTotals')).total, { timeout: 60_000 }).toBeGreaterThan(0)

  // Open Crew Info via right-click on first roster row.
  await rightClickFirstRosterRow(page)
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible({ timeout: 15_000 })
  await menu.getByText('Crew Info', { exact: true }).click()

  // Base + Rank blocks render concrete values (from store), not a backend round-trip placeholder.
  const baseTable = page.getByTestId('crew-info-table-base')
  await expect(baseTable.locator('tbody tr').first()).toContainText(/[A-Z]{3}/, { timeout: 15_000 })
  const rankTable = page.getByTestId('crew-info-table-rank')
  await expect(rankTable.locator('tbody tr').first()).toContainText(/CA|FO|FA|CS|P[A-Z]|1P|2P|[A-Z]{2}/, { timeout: 15_000 })
})
```

> 说明：`roster-canvas` 首行坐标参考 `scenario-context-menu.spec.ts:361`（`+30 + rowIndex*43 + 21`）。若 Live roster 行高或坐标不同，按实际 boundingBox 微调。rank 正则按实际 rank 代码（如 CA/FO）放宽。菜单 testid 若与 scenario 不同，以 `context-menu.tsx` 实际渲染为准。

- [ ] **Step 2: Run CrewInfo E2E**

Run: `cd e2e && npx playwright test --config=config/playwright.gantt-only.config.ts crew-info-from-store.spec.ts --timeout=300000`
Expected: PASS。

- [ ] **Step 3: 全量回归（gantt 单测 + UI gate + 受影响 E2E）**

Run:
```bash
cd gantt && npx vitest run 2>&1 | tail -5   # 期望：仅 3 个已知预存在失败
cd /home/yuan.z/rois/rois-ai && npm run check:ui 2>&1 | tail -3   # 0 hard violations
cd e2e && npx playwright test --config=config/playwright.gantt-only.config.ts live-empty-start.spec.ts toolbar-rp-multiselect.spec.ts load-progress.spec.ts --timeout=300000
```
Expected: 除已知预存在失败外全绿。

- [ ] **Step 4: gitnexus detect_changes**

Run: `node .gitnexus/run.cjs detect_changes --scope working 2>&1 | grep -E "Changes:|Affected processes|Risk level"`
Expected: 无 HIGH/CRITICAL，改动符号与本次相关。

- [ ] **Step 5: Commit 收尾**

```bash
git add e2e/tests/gantt/crew-info-from-store.spec.ts
git commit -m "test(gantt): e2e for CrewInfo reading store data + load progress"
```

---

## Self-Review

- **Spec 覆盖：** Part A（CrewInfo 7→3 请求）→ Task 1 + 2 + 6；Part B（真实进度条）→ Task 3 + 4；「roster 分批并发 + pairing 单次全量 + flight 后台」→ Task 4；「完成后不重复加载」→ Task 4（单轮 + seq 守卫）覆盖；存量 E2E 更新 → Task 5。无缺口。
- **占位符扫描：** Step 3 中 `loadRosterBatched` 与 `batchProgresses` 均有完整代码；E2E 打开 CrewInfo 的探针方式标注「以代码为准」，需实施者核对 `gantt-test-hook.ts` 是否暴露（属必要的现场核对，非占位）。
- **类型一致性：** `progress: number | null` 贯穿 Task 3/4；`PaneLoadingBar({ progress })` 与两个调用点一致；`crewInfoFromStore(crewId): Promise<CrewInfo>` 在 Task 1/2/6 一致。
