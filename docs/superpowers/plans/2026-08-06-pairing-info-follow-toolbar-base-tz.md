# Pairing Info 时区跟随 Toolbar Base 时区 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pairing Info（Live 与 Scenario 共用）的默认时区档跟随 Toolbar 选择的 Base 时区：Toolbar=UTC 时默认 UTC（Airport 按钮显示 "Airport"），Toolbar=非 UTC Base 时默认 Airport 档（按钮显示 Base 代码，时刻按 Base 时区换算，DST-aware）；用户手动点档后尊重手动选择，重开回到跟随默认。

**Architecture:** 改动只在 `gantt/src/components/pairing/pairing-info-dialog.tsx`：把单一 `tzMode` state 改为「手动覆盖 `manualTzMode` + 派生默认」。派生默认 = `manualTzMode ?? (displayAirport !== 'UTC' && displayZone !== 'UTC' ? 'airport' : 'utc')`，其中 `displayZone`/`displayAirport` 来自全局 `useTimezoneStore`（Toolbar 与 Scenario 写入同一 store）。Airport 档渲染逻辑与按钮 label 已正确，无需改动。`Intl.DateTimeFormat` 的 IANA zone 换算天然 DST-aware。

**Tech Stack:** React 19 + TypeScript（gantt）；Vitest（组件测试）；Playwright（Live + Scenario e2e）。

## Global Constraints

- 只改 `pairing-info-dialog.tsx` 一个组件；禁止 Live/Scenario 分叉代码（共享组件天然一致）。
- UI 文字用英文（按钮显示机场代码 / "Airport"），代码注释可用中文。
- 测试纪律（§Playwright-Required / §No-Illusion）：UI 变更必须有 Playwright/Vitest 证明；不得以代码检查代替运行结果。
- 样式标准：改到的按钮沿用现有 token class（`bg-primary`/`text-primary-foreground`/`bg-muted`/`text-muted-foreground`），禁止新增魔法值；改动后跑 `npm run check:ui` 并贴 PASS。
- 提交信息遵循根 `CLAUDE.md` 的 `<type>: <desc>` 格式，含 `Co-Authored-By: Claude <noreply@anthropic.com>`。
- 不手动 bump 版本号（gantt dev/build 自动递增）。
- 远程库是空的：gantt 前端无需查库；e2e 走真实后端（Live）或 route mock（Scenario）。

---

### Task 1: Pairing Info 派生时区默认（核心实现 + 组件测试，TDD）

**Files:**
- Create: `gantt/src/components/pairing/__tests__/pairing-info-dialog-tz-follow.test.tsx`
- Modify: `gantt/src/components/pairing/pairing-info-dialog.tsx`

**Interfaces:**
- Consumes: 现有 `useTimezoneStore`（`timezone`/`timezoneAirport`/`timezoneOptions`）、`useUiStore`（`pairingInfoOpen`/`pairingInfoId`）、`getPairingInfoWithLocalFirst`、`useAirportTzStore`。
- Produces: `tzMode` 派生逻辑（`manualTzMode ?? (displayAirport !== 'UTC' && displayZone !== 'UTC' ? 'airport' : 'utc')`）；时区按钮 `onClick` 改走 `setManualTzMode`。后续任务的 e2e 断言依赖此行为。

- [ ] **Step 1: 写失败测试（Vitest 组件测试）**

新建 `gantt/src/components/pairing/__tests__/pairing-info-dialog-tz-follow.test.tsx`（内容完整照抄）：

```tsx
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUiStore } from '@/stores/ui-store'

const getPairingInfoWithLocalFirst = vi.hoisted(() => vi.fn())
const loadAirportTz = vi.hoisted(() => vi.fn(async () => undefined))
// Mutable toolbar-timezone state — each test sets UTC or a Base before render.
const tzState = vi.hoisted(() => ({ timezone: 'UTC', timezoneAirport: 'UTC' }))

vi.mock('@rois/ui', () => ({
  AppDialog: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? <div data-testid="mock-dialog"><div>{title}</div>{children}</div> : null,
  formatUiDate: (value: string) => value,
}))

vi.mock('@/services/pairing-info-service', () => ({
  getPairingInfoWithLocalFirst,
}))

vi.mock('@/utils/scenario-pairing-adapter', () => ({
  buildScenarioPairingInfo: vi.fn(),
}))

vi.mock('@/stores/timezone-store', () => ({
  useTimezoneStore: (selector: (state: {
    timezoneOptions: never[]
    timezone: string
    timezoneAirport: string
  }) => unknown) => selector({
    timezoneOptions: [],
    timezone: tzState.timezone,
    timezoneAirport: tzState.timezoneAirport,
  }),
}))

vi.mock('@/stores/airport-tz-store', () => ({
  useAirportTzStore: (selector: (state: { map: Record<string, string>; load: () => Promise<void> }) => unknown) =>
    selector({ map: {}, load: loadAirportTz }),
}))

import { PairingInfoDialog } from '../pairing-info-dialog'

const detail = {
  pairing: {
    id: 10,
    pairingLabel: 'P10',
    base: 'YVR',
    schStrDtUtc: '2026-08-01T08:00:00Z',
    tags: null,
  },
  segments: [{
    id: 1,
    pairingId: 10,
    dutySeq: 1,
    segSeq: 1,
    fltNum: '100',
    airline: 'F8',
    depArp: 'YVR',
    arvArp: 'YYZ',
    schStrDtUtc: '2026-08-01T08:00:00Z',
    schEndDtUtc: '2026-08-01T12:00:00Z',
    actStrDtUtc: '2026-08-01T08:00:00Z',
    actEndDtUtc: '2026-08-01T12:00:00Z',
    segAssignment: 'FLT',
    dutyRefTz: -420,
    dutyActCreditedMinutes: null,
  }],
  compositions: [],
}

const crew = [{ crewId: 'C1', name: 'One', base: 'YVR', actingRank: 'FO', source: 'CR', creditMin: null }]
const bundle = { detail, crew, rosterDutyRefs: [] }

const renderDialog = async (): Promise<{ container: HTMLDivElement; root: Root }> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<PairingInfoDialog />)
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
    await Promise.resolve()
  })
  return { container, root }
}

/** First row's STD cell (segment table column index 9). */
const firstStd = (container: HTMLDivElement): string => {
  const row = container.querySelector('[data-testid="pairing-info-segments"] tbody tr')
  const td = row?.querySelectorAll('td')[9]
  return (td?.textContent ?? '').trim()
}

const allStd = (container: HTMLDivElement): string[] =>
  [...container.querySelectorAll('[data-testid="pairing-info-segments"] tbody tr')]
    .map((r) => (r.querySelectorAll('td')[9]?.textContent ?? '').trim())

afterEach(() => {
  useUiStore.getState().closePairingInfo()
  getPairingInfoWithLocalFirst.mockReset()
  tzState.timezone = 'UTC'
  tzState.timezoneAirport = 'UTC'
  document.body.innerHTML = ''
})

describe('PairingInfoDialog — timezone default follows the Toolbar', () => {
  it('Toolbar UTC → UTC mode active by default; Airport button reads "Airport"', async () => {
    tzState.timezone = 'UTC'
    tzState.timezoneAirport = 'UTC'
    getPairingInfoWithLocalFirst.mockResolvedValue(bundle)
    useUiStore.getState().openPairingInfo(10)
    const { container, root } = await renderDialog()

    const utcBtn = container.querySelector<HTMLButtonElement>('[data-testid="pairing-info-tz-utc"]')!
    const airportBtn = container.querySelector<HTMLButtonElement>('[data-testid="pairing-info-tz-airport"]')!
    expect(utcBtn.className).toContain('bg-primary')
    expect(airportBtn.className).not.toContain('bg-primary')
    expect(airportBtn.textContent).toBe('Airport')
    expect(firstStd(container)).toBe('8/1 08:00') // UTC
    act(() => root.unmount())
  })

  it('Toolbar Base (YVR) → Airport(YVR) active by default; times render in the Base zone', async () => {
    tzState.timezone = 'America/Vancouver'
    tzState.timezoneAirport = 'YVR'
    getPairingInfoWithLocalFirst.mockResolvedValue(bundle)
    useUiStore.getState().openPairingInfo(10)
    const { container, root } = await renderDialog()

    const utcBtn = container.querySelector<HTMLButtonElement>('[data-testid="pairing-info-tz-utc"]')!
    const airportBtn = container.querySelector<HTMLButtonElement>('[data-testid="pairing-info-tz-airport"]')!
    expect(airportBtn.className).toContain('bg-primary')
    expect(utcBtn.className).not.toContain('bg-primary')
    expect(airportBtn.textContent).toBe('YVR')
    // 08:00Z in America/Vancouver (PDT, UTC-7 on 2026-08-01) → 01:00.
    expect(firstStd(container)).toBe('8/1 01:00')
    act(() => root.unmount())
  })

  it('manual override (click UTC) wins over the Toolbar Base; reopen resets to the default', async () => {
    tzState.timezone = 'America/Vancouver'
    tzState.timezoneAirport = 'YVR'
    getPairingInfoWithLocalFirst.mockResolvedValue(bundle)
    useUiStore.getState().openPairingInfo(10)
    const { container, root } = await renderDialog()

    const utcBtn = container.querySelector<HTMLButtonElement>('[data-testid="pairing-info-tz-utc"]')!
    await act(async () => { utcBtn.click() })
    expect(utcBtn.className).toContain('bg-primary')
    expect(firstStd(container)).toBe('8/1 08:00') // manual override → UTC

    // Reopen: manual override cleared, default follows the Toolbar Base again.
    act(() => { useUiStore.getState().closePairingInfo() })
    act(() => { useUiStore.getState().openPairingInfo(10) })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      await Promise.resolve()
    })
    const airportBtn = container.querySelector<HTMLButtonElement>('[data-testid="pairing-info-tz-airport"]')!
    expect(airportBtn.className).toContain('bg-primary')
    expect(firstStd(container)).toBe('8/1 01:00')
    act(() => root.unmount())
  })

  it('DST-aware: same UTC hour renders with the DST-varying offset (EST vs EDT)', async () => {
    tzState.timezone = 'America/Toronto'
    tzState.timezoneAirport = 'YOW'
    const seg = detail.segments[0]
    const d = {
      ...detail,
      pairing: { ...detail.pairing, schStrDtUtc: '2026-01-15T08:00:00Z' },
      segments: [
        { ...seg, id: 1, segSeq: 1, schStrDtUtc: '2026-01-15T08:00:00Z', schEndDtUtc: '2026-01-15T12:00:00Z', actStrDtUtc: '2026-01-15T08:00:00Z', actEndDtUtc: '2026-01-15T12:00:00Z' },
        { ...seg, id: 2, segSeq: 2, schStrDtUtc: '2026-07-15T08:00:00Z', schEndDtUtc: '2026-07-15T12:00:00Z', actStrDtUtc: '2026-07-15T08:00:00Z', actEndDtUtc: '2026-07-15T12:00:00Z' },
      ],
    }
    getPairingInfoWithLocalFirst.mockResolvedValue({ detail: d, crew, rosterDutyRefs: [] })
    useUiStore.getState().openPairingInfo(10)
    const { container, root } = await renderDialog()

    const stds = allStd(container)
    expect(stds[0]).toBe('1/15 03:00') // EST = UTC-5
    expect(stds[1]).toBe('7/15 04:00') // EDT = UTC-4
    act(() => root.unmount())
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd gantt && npx vitest run src/components/pairing/__tests__/pairing-info-dialog-tz-follow.test.tsx`
Expected: FAIL —— 例如 `Toolbar Base (YVR) → Airport(YVR) active by default` 期望 `airportBtn.className` 含 `bg-primary` 实际是 `utcBtn` 激活（当前默认固定 `'utc'`）。

- [ ] **Step 3: 最小实现**

修改 `gantt/src/components/pairing/pairing-info-dialog.tsx`。

先把（当前第 75 行）：
```ts
const [tzMode, setTzMode] = useState<TzMode>('utc')
```
替换为：
```ts
// Pairing-Info 默认时区档跟随 Toolbar 选择的 Base（Live/Scenario 共享本组件、读同一全局 store）。
// Toolbar=UTC → 默认 UTC；Toolbar=非 UTC 机场 → 默认 Airport 档（= 所选 Base），时刻按该 Base 换算。
// `manualTzMode` 记录用户显式点选的档位；一旦点选，本次打开期间 Toolbar 不再驱动档位（重开时复位）。
const [manualTzMode, setManualTzMode] = useState<TzMode | null>(null)

// 每次（重新）打开弹窗时清掉手动覆盖，让默认跟随当前 Toolbar 选择。
useEffect(() => {
  if (open) setManualTzMode(null)
}, [open])

const tzMode: TzMode = manualTzMode
  ?? (displayAirport !== 'UTC' && displayZone !== 'UTC' ? 'airport' : 'utc')
```

再把时区按钮的 `onClick`（当前 `tzButtons.map((b) => (... onClick={() => setTzMode(b.mode)} ...))`）改为：
```tsx
onClick={() => setManualTzMode(b.mode)}
```

其余不动（`zoneForCell` 的 airport 档、按钮 label 已正确）。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd gantt && npx vitest run src/components/pairing/__tests__/pairing-info-dialog-tz-follow.test.tsx`
Expected: PASS（4 个用例全绿）。

- [ ] **Step 5: 跑既有相关单测，确认无回归**

Run: `cd gantt && npx vitest run src/components/pairing/__tests__/pairing-info-dialog-crew-ref.test.tsx`
Expected: PASS（该用例 mock 的 Toolbar 为 UTC，派生默认仍是 utc，Ref 单元格不受影响）。

- [ ] **Step 6: 提交**

```bash
git add gantt/src/components/pairing/pairing-info-dialog.tsx gantt/src/components/pairing/__tests__/pairing-info-dialog-tz-follow.test.tsx
git commit -m "feat(gantt): Pairing Info 默认时区档跟随 Toolbar Base 时区

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Live e2e —— 默认跟随 + 打开期间实时跟随

**Files:**
- Create: `e2e/tests/gantt/pairing-info-follow-toolbar-tz.spec.ts`
- Reuse: `e2e/utils/pairing-info.ts`（`openByScan`/`readSegmentCells`/`parseAirport`/`parseOffsetMin`/`validateTzCells`）

**Interfaces:**
- Consumes: Task 1 的派生默认行为（Toolbar UTC→utc 激活；Toolbar Base→airport 激活）。
- Produces: 证明「Live 真实 UI」下默认跟随与实时跟随的 e2e 断言。

- [ ] **Step 1: 写 e2e**

新建 `e2e/tests/gantt/pairing-info-follow-toolbar-tz.spec.ts`：

```ts
/**
 * Pairing Info — default timezone follows the Toolbar Base selection (Live).
 *
 * Live-1130 — Toolbar on UTC: opening Pairing Info selects UTC by default and the
 *   "Airport" toggle reads "Airport".
 * Live-1131 — switching the Toolbar to a Base (YVR) while the dialog is open follows
 *   it live (no manual mode click): "Airport" (YVR) becomes active and every time
 *   renders in the Base zone (America/Vancouver).
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, counts } from '../../utils/gantt-hook'
import {
  SEG, openByScan, readSegmentCells, parseAirport, parseOffsetMin, validateTzCells,
} from '../../utils/pairing-info'

test.describe('Pairing Info — default timezone follows Toolbar Base', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).pairing, {
      message: 'pairing objects loaded', timeout: 30_000,
    }).toBeGreaterThan(1)
  })

  test('Live-1130 — Toolbar UTC → Pairing Info defaults to UTC; Airport button reads "Airport"', async ({ page }) => {
    const dialog = page.getByTestId('pairing-info-dialog')
    let opened = false
    for (let row = 0; row < 8 && !opened; row++) opened = await openByScan(dashboard.pairingCanvas, dialog, row)
    expect(opened, 'a pairing popup opened').toBe(true)
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 8_000 })

    await expect(dialog.getByTestId('pairing-info-tz-utc')).toHaveClass(/bg-primary/)
    await expect(dialog.getByTestId('pairing-info-tz-airport')).toHaveText('Airport')
    await expect(dialog.getByTestId('pairing-info-tz-airport')).not.toHaveClass(/bg-primary/)
  })

  test('Live-1131 — switching the Toolbar to a Base (YVR) while Pairing Info is open follows it live', async ({ page }) => {
    const dialog = page.getByTestId('pairing-info-dialog')
    // Find a pairing with a YVR-departing sector so airport-mode can be cross-checked.
    let utcCells: string[][] | null = null
    const seen = new Set<string>()
    for (let row = 0; row < 8 && !utcCells; row++) {
      if (!(await openByScan(dashboard.pairingCanvas, dialog, row))) continue
      await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 8_000 })
      const title = ((await dialog.getByText(/#\d+/).first().textContent()) ?? '').trim()
      if (!seen.has(title)) {
        seen.add(title)
        // No tz button is clicked — the default (Toolbar UTC) already renders UTC.
        const cells = await readSegmentCells(dialog)
        if (cells.some((r) => parseAirport(r[SEG.DEP]) === 'YVR')) { utcCells = cells; continue }
      }
      await page.getByTestId('pairing-info-dialog-close').click()
      await expect(dialog).toBeHidden()
    }
    expect(utcCells, 'found a pairing with a YVR-departing sector').not.toBeNull()
    const utc = utcCells as string[][]

    // Toolbar is still UTC → the default active mode is UTC (no manual click happened).
    await expect(dialog.getByTestId('pairing-info-tz-utc')).toHaveClass(/bg-primary/)

    // Drive the REAL toolbar switcher to a Base.
    await page.getByTestId('timezone-switcher').click()
    const menu = page.getByTestId('timezone-menu')
    await expect(menu).toBeVisible()
    await page.getByTestId('timezone-option-YVR').click()
    await expect(menu).toBeHidden()
    await expect(page.getByTestId('timezone-switcher')).toContainText('YVR')

    // Pairing Info follows live: Airport (YVR) active, UTC no longer active.
    await expect(dialog.getByTestId('pairing-info-tz-airport')).toHaveClass(/bg-primary/)
    await expect(dialog.getByTestId('pairing-info-tz-airport')).toHaveText('YVR')
    await expect(dialog.getByTestId('pairing-info-tz-utc')).not.toHaveClass(/bg-primary/)

    // Times render in the Base zone: on YVR-departing rows, airport-mode == UTC + YVR offset.
    const airportCells = await readSegmentCells(dialog)
    const yvrOff = (r: number) => parseAirport(utc[r][SEG.DEP]) === 'YVR' ? parseOffsetMin(utc[r][SEG.DEP]) : null
    const result = validateTzCells(
      utc, airportCells,
      [{ col: SEG.STD, offset: yvrOff }, { col: SEG.STA, offset: yvrOff }],
      'airport→YVR',
    )
    expect(result.cellsChecked, 'at least one YVR-departing sector validated in the Base zone').toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 运行 e2e**

Run: `cd e2e && npx playwright test tests/gantt/pairing-info-follow-toolbar-tz.spec.ts --reporter=list`
Expected: PASS（2 个用例全绿）。若 `Live-1131` 报「found a pairing with a YVR-departing sector」为 null，说明 seed 数据首 8 行无 YVR 出发航段，把扫描行数提到 12 并重跑（与既有 `pairing-info-timezone.spec.ts` 的 TARGETS 覆盖逻辑一致）。

- [ ] **Step 3: 提交**

```bash
git add e2e/tests/gantt/pairing-info-follow-toolbar-tz.spec.ts
git commit -m "test(gantt): Pairing Info 默认跟随 Toolbar Base 时区 e2e（Live）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Scenario e2e —— Scenario toolbar Base → Pairing Info 跟随

**Files:**
- Create: `e2e/tests/gantt/scenario-pairing-info-follow-toolbar-tz.spec.ts`
- Reuse: `e2e/pages/gantt/scenario-page.ts`、`e2e/utils/gantt-hook.ts`（`seedGanttAuth`）、`e2e/utils/pairing-info.ts`（`SEG`/`readSegmentCells`）

**Interfaces:**
- Consumes: Task 1 的派生默认行为 + 现有 scenario gantt-data 构建（参照 `scenario-pairing-info-zless-timestamp.spec.ts`）。
- Produces: 证明「Scenario toolbar 选 Base → 共享 dialog 跟随」的 e2e。

- [ ] **Step 1: 写 e2e**

新建 `e2e/tests/gantt/scenario-pairing-info-follow-toolbar-tz.spec.ts`：

```ts
/**
 * Pairing Info — Scenario mode follows the Scenario Toolbar's Base timezone.
 *
 * The scenario toolbar's TimezoneSwitcher writes the picked Base into the shared
 * global timezone store — the same store the Pairing Info dialog reads. So with the
 * scenario toolbar on YVR the dialog must default to Airport (YVR) and render every
 * time in America/Vancouver. Drives the real scenario toolbar switcher, then asserts
 * the dialog follows — same behavior as Live (shared dialog component).
 */
import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth } from '../../utils/gantt-hook'
import { SEG, readSegmentCells } from '../../utils/pairing-info'

const SCENARIO_ID = 702
const SCENARIO_NAME = 'RO-TZ-Follow'
const OWNER_CREW = 'C0702'
const PAIRING_ID = 22010
const PAIRING_LABEL = 'F22010'
// 08:15Z on 2026-07-07 in America/Vancouver = PDT (UTC-7) → 7/7 01:15.
const SCH_STR_DT = '2026-07-07T08:15:00Z'
const SCH_END_DT = '2026-07-07T16:45:00Z'

const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
})

const TZ_OPTIONS = [
  { airport: 'YVR', airportName: 'VANCOUVER INTL', zoneId: 'America/Vancouver', utcOffset: 'UTC-420', isBase: true },
  { airport: 'YOW', airportName: 'MACDONALD-CARTIER INTL', zoneId: 'America/Toronto', utcOffset: 'UTC-240', isBase: true },
  { airport: 'UTC', airportName: 'Coordinated Universal Time', zoneId: 'UTC', utcOffset: 'UTC+0', isBase: false },
]

const RO_CAPABILITIES = {
  panes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

const MOCK_PAIRING = {
  pairingId: PAIRING_ID,
  pairingLabel: PAIRING_LABEL,
  base: 'YVR',
  schStrDtUtc: SCH_STR_DT,
  schEndDtUtc: SCH_END_DT,
  assignmentGroup: 'FLT',
  assignment: 'FLT',
  division: 'Pilots',
  compositions: [{ rank: 'CA', plan: 1, fill: 1 }],
}

const MOCK_SEGMENT = {
  pairingId: PAIRING_ID,
  dutySeq: 1,
  segSeq: 1,
  fltId: 22010,
  fltNum: '2010',
  airline: 'F8',
  depArp: 'YVR',
  arvArp: 'YYZ',
  segAssignment: 'FLT',
  schStrDtUtc: SCH_STR_DT,
  schEndDtUtc: SCH_END_DT,
  dutyStrArp: 'YVR',
  dutyEndArp: 'YVR',
  dutySchStrDtUtc: SCH_STR_DT,
  dutySchEndDtUtc: SCH_END_DT,
  dutySchRestMin: null,
  dutyActRestMin: null,
  dutyActCreditedMinutes: 480,
  brief1StartUtc: SCH_STR_DT,
  brief1EndUtc: SCH_STR_DT,
  debrief1StartUtc: SCH_END_DT,
  debrief1EndUtc: SCH_END_DT,
  pickup1StartUtc: SCH_STR_DT,
  pickup1EndUtc: SCH_STR_DT,
  dropoff1StartUtc: SCH_END_DT,
  dropoff1EndUtc: SCH_END_DT,
}

const buildGanttData = () => ({
  scenarioId: SCENARIO_ID,
  scenarioName: SCENARIO_NAME,
  fileType: 'RO' as const,
  capabilities: RO_CAPABILITIES,
  strDtLoc: '2026-07-01T00:00:00.000Z',
  endDtLoc: '2026-07-31T23:59:59.000Z',
  scenarioStrDt: '2026-07-01T00:00:00',
  scenarioEndDt: '2026-07-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: [{ crewId: OWNER_CREW, base: 'YVR', division: 'Pilots', rank: 'CA', seniorityNum: '702', crewName: 'Crew 702' }],
  pairings: [MOCK_PAIRING],
  assignments: [{ crewId: OWNER_CREW, pairingId: PAIRING_ID, source: 'CR' as const }],
  pairingSegments: [MOCK_SEGMENT],
  flights: [],
  groundItems: [],
  crewStats: {},
})

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

const MOCK_SCENARIO_ITEM = {
  id: SCENARIO_ID,
  name: SCENARIO_NAME,
  fileType: 'RO',
  status: 'DONE',
  strDtLoc: '2026-07-01',
  endDtLoc: '2026-07-31',
  optimizedCount: 1,
  leadinLive: 1,
  updatedBy: 'test',
  updatedByName: 'Test User',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

const MOCK_SCENARIO_DETAIL = {
  ...MOCK_SCENARIO_ITEM,
  worksetId: null,
  version: 1,
  rulesetId: 103,
  pairingScenarioId: null,
  filterParams: null,
  comments: null,
  createdBy: 'test',
  createdAt: '2026-07-01T00:00:00.000Z',
}

const openScenario = async (page: Page): Promise<void> => {
  await page.route('**/api/scenario?**', (route) => route.fulfill(ok({
    items: [MOCK_SCENARIO_ITEM], total: 1, page: 1, pageSize: 20, totalPages: 1,
  })))
  await page.route(`**/api/scenario/${SCENARIO_ID}`, (route) => route.fulfill(ok(MOCK_SCENARIO_DETAIL)))
  await page.route(`**/api/scenario/${SCENARIO_ID}/kpi`, (route) => route.fulfill(ok([])))
  await page.route(`**/api/scenario/${SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(buildGanttData())))
  await page.route(`**/api/scenario/${SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(MOCK_LOCK_STATUS)))
  await page.route((url) => url.pathname === '/altair/live/base/timezone-options', (route) => route.fulfill(ok(TZ_OPTIONS)))

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  await page.getByPlaceholder('Search scenarios…').fill(SCENARIO_NAME)
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(String(SCENARIO_ID), { exact: true }),
  })
  await expect(item).toHaveCount(1, { timeout: 10_000 })
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })
}

const readPuck = (page: Page): Promise<{ x: number; y: number; pairingId: number; crewId: string; itemId: number } | null> =>
  page.evaluate(
    ({ sid, pid }) => window.__ganttTest!.scenarioRosterPuck!(sid, pid) ?? null,
    { sid: SCENARIO_ID, pid: PAIRING_ID },
  )

const waitForPuck = async (page: Page): Promise<{ x: number; y: number; pairingId: number; crewId: string; itemId: number }> => {
  await expect
    .poll(() => readPuck(page), { timeout: 15_000, message: 'no scenario-roster pairing puck rendered' })
    .not.toBeNull()
  return (await readPuck(page))!
}

const rightClickPuck = async (page: Page, puck: { x: number; y: number }): Promise<void> => {
  const canvas = page.getByTestId('scenario-roster-canvas')
  const box = await canvas.boundingBox()
  expect(box, 'scenario-roster-canvas must have a bounding box').toBeTruthy()
  const clientX = box!.x + puck.x
  const clientY = box!.y + puck.y
  await page.evaluate(
    ({ cx, cy }) => {
      const el = document.querySelector('[data-testid="scenario-roster-canvas"]') as HTMLCanvasElement | null
      if (!el) throw new Error('scenario-roster-canvas not found')
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2, clientX: cx, clientY: cy }))
    },
    { cx: clientX, cy: clientY },
  )
}

test.describe('Pairing Info — Scenario toolbar Base → dialog follows (Scen-702)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Scenario toolbar selects YVR → Pairing Info defaults to Airport(YVR) and renders in YVR zone', async ({ page }) => {
    await openScenario(page)
    const puck = await waitForPuck(page)

    await rightClickPuck(page, puck)
    const menu = page.getByTestId('scenario-context-menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    await menu.getByText('View pairing detail', { exact: true }).click()

    const dialog = page.getByTestId('pairing-info-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 10_000 })

    // Scenario toolbar is still UTC here → default is UTC.
    await expect(dialog.getByTestId('pairing-info-tz-utc')).toHaveClass(/bg-primary/)
    await expect(dialog.getByTestId('pairing-info-tz-airport')).toHaveText('Airport')
    const utcCells = await readSegmentCells(dialog)
    expect(utcCells[0][SEG.STD], 'UTC baseline').toBe('7/7 08:15')

    // Drive the scenario toolbar switcher to YVR (real UI).
    await page.getByTestId('timezone-switcher').click()
    const tzMenu = page.getByTestId('timezone-menu')
    await expect(tzMenu).toBeVisible()
    await page.getByTestId('timezone-option-YVR').click()
    await expect(tzMenu).toBeHidden()
    await expect(page.getByTestId('timezone-switcher')).toContainText('YVR')

    // Pairing Info follows: Airport (YVR) active, times in America/Vancouver (PDT -7).
    await expect(dialog.getByTestId('pairing-info-tz-airport')).toHaveClass(/bg-primary/)
    await expect(dialog.getByTestId('pairing-info-tz-airport')).toHaveText('YVR')
    await expect(dialog.getByTestId('pairing-info-tz-utc')).not.toHaveClass(/bg-primary/)
    const cells = await readSegmentCells(dialog)
    expect(cells[0][SEG.STD], 'STD in YVR zone (08:15Z → 01:15 PDT)').toBe('7/7 01:15')
    expect(cells[0][SEG.STA], 'STA in YVR zone (16:45Z → 09:45 PDT)').toBe('7/7 09:45')
  })
})
```

- [ ] **Step 2: 运行 e2e**

Run: `cd e2e && npx playwright test tests/gantt/scenario-pairing-info-follow-toolbar-tz.spec.ts --reporter=list`
Expected: PASS（1 个用例绿）。

- [ ] **Step 3: 提交**

```bash
git add e2e/tests/gantt/scenario-pairing-info-follow-toolbar-tz.spec.ts
git commit -m "test(gantt): Scenario Pairing Info 跟随 Scenario Toolbar Base 时区 e2e

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 全量回归 + UI 标准门禁

**Files:** 无新增；可能改动前面任务的文件。

**Interfaces:** 消耗 Task 1–3 全部产物。

- [ ] **Step 1: 跑既有 Pairing Info 时区 e2e 与全量单测，确认无回归**

Run:
```bash
cd e2e && npx playwright test tests/gantt/pairing-info-timezone.spec.ts tests/gantt/pairing-info.spec.ts --reporter=list
cd gantt && npx vitest run
```
Expected: 全绿。重点确认：
- `pairing-info-timezone.spec.ts` 各模式显式点选，不受默认档变化影响。
- `scenario-pairing-info-zless-timestamp.spec.ts` 断言默认 = UTC（未 seed scenario 时区 → 全局 UTC → 派生默认 utc）。
- 若 `Live-1125` 的「Airport(default→UTC)」断言失败，说明 airport 档在 Toolbar=UTC 时未回退 UTC —— 属于实现回归，回到 Task 1 检查。

- [ ] **Step 2: UI 标准门禁**

Run: `npm run check:ui`
Expected: 硬违规 0，输出 PASS。若报 WARN 仅限既有问题且非本次改动引入，则说明并跳过。

- [ ] **Step 3: 提交（若有残留改动）**

```bash
git status --short
# 若有未提交改动，按 §Surgical 只提交本次相关文件
git add <相关文件>
git commit -m "chore(gantt): 时区跟随回归微调

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- 默认跟随（UTC→utc / Base→airport）：Task 1 组件测试 + Task 2 e2e `Live-1130`/`Live-1131`。
- Airport 按钮 label（UTC→"Airport"，Base→代码）：Task 1 组件测试断言 + Task 2/3 e2e 断言。
- 时刻按 Base 时区换算：Task 1 组件测试（YVR 01:00）+ Task 2 `validateTzCells` 交叉校验 + Task 3 确定性断言。
- DST-aware：Task 1「EST vs EDT」组件测试；e2e 交叉校验用 DEP 单元格的即时偏移（DST-aware）。
- 手动覆盖 / 重开复位：Task 1「manual override + reopen」组件测试。
- Live 与 Scenario 一致：共享组件（Task 1 实现位置）+ Task 2（Live）+ Task 3（Scenario）。

**Placeholder scan:** 无 TBD/TODO；每步含完整代码与运行命令。

**Type consistency:** 组件测试用 `data-testid="pairing-info-tz-*"`、`bg-primary`、STD 列 index 9 与 `e2e/utils/pairing-info.ts` 的 `SEG.STD=9` 一致；`validateTzCells`/`parseAirport`/`parseOffsetMin` 签名与现有工具一致；scenario mock 字段与 `scenario-pairing-info-zless-timestamp.spec.ts` 模板一致。
