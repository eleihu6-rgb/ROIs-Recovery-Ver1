# Live View Flight Detail Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live Roster and Live Pairing right-click menus show **View flight detail** when a flight id is known, opening the shared Live Flight Detail dialog (parity with Scenario).

**Architecture:** Minimal additions in `gantt/src/components/roster/context-menu.tsx` only — Roster uses `task.fltId`, Pairing uses `findFltId`; both call existing `openFlightDetail(fltId)` with no `scenarioId`. Help + Playwright prove the menu and dialog.

**Tech Stack:** React/TS gantt, Lucide `Plane`, Playwright e2e, in-app Help topics.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-24-live-view-flight-detail-menu-design.md`
- Label exactly: `View flight detail`; icon: `Plane`
- Live path only: `openFlightDetail(fltId)` — no `scenarioId`
- Show only when `fltId != null` / `findFltId != null`
- Placement: immediately after **View pairing detail**
- §Minimal-First / §Surgical — do not extract shared menu helpers or unify with Scenario menu
- §Playwright-Required / §Simulate-User / §No-Illusion
- Commit only when the user asks (§No-Auto-Commit)

---

### File map

| File | Role |
|------|------|
| `gantt/src/components/roster/context-menu.tsx` | Add menu items (Roster + Pairing) |
| `gantt/src/components/help/topics/live/live-context-menu.tsx` | Document Live + Scenario for View flight detail |
| `gantt/src/components/help/topics/live/live-edit.tsx` | Mention View flight detail where pairing detail is listed (if still Live-only wording) |
| `gantt/src/components/help/topics/live/live-panes.tsx` | Optional one-line controls ref if pairing-detail-only |
| `e2e/tests/gantt/live-view-flight-detail-menu.spec.ts` | New Playwright coverage |
| `e2e/tests/gantt/help/help-feat-inspection.spec.ts` | Tighten Live-1299 if wording changes require it |

---

### Task 1: Wire Live Roster + Pairing menu items

**Files:**
- Modify: `gantt/src/components/roster/context-menu.tsx`
- Test: `e2e/tests/gantt/live-view-flight-detail-menu.spec.ts` (written in Task 2; this task lands the code)

**Interfaces:**
- Consumes: `openFlightDetail` from `useUiStore` (already in component); `task.fltId` on `RosterItem`; `findFltId` on pairing mock task
- Produces: Menu button labeled `View flight detail` that opens Live Flight Detail for that id

- [ ] **Step 1: Roster — insert item after View pairing detail**

Inside the `if (task.pairingId != null) { items.push(...) }` block (~lines 224–236), after the View pairing detail entry and before Locate Pairing, add:

```tsx
...(task.fltId != null
  ? [{
      icon: Plane,
      label: 'View flight detail',
      onClick: () => {
        openFlightDetail(task.fltId!)
        closeContextMenu()
      },
    }]
  : []),
```

Or push a second object when `task.fltId != null` (clearer than spread):

```tsx
if (task.pairingId != null) {
  items.push({
    icon: Link2,
    label: 'View pairing detail',
    onClick: () => {
      useUiStore.getState().openPairingInfo(task.pairingId!, undefined, task.crewId)
      closeContextMenu()
    },
  })
  if (task.fltId != null) {
    items.push({
      icon: Plane,
      label: 'View flight detail',
      onClick: () => {
        openFlightDetail(task.fltId!)
        closeContextMenu()
      },
    })
  }
  items.push({ icon: Link2, label: 'Locate Pairing', onClick: handleLocatePairing })
}
```

Also update the file header comment to list View flight detail.

- [ ] **Step 2: Pairing pane — insert after View pairing detail**

In the `paneType === 'pairing' && hasTask` block (~276–286), after the View pairing detail push:

```tsx
if (findCtx.findFltId != null) {
  items.push({
    icon: Plane,
    label: 'View flight detail',
    onClick: () => {
      openFlightDetail(findCtx.findFltId as number)
      closeContextMenu()
    },
  })
}
```

Keep existing Find Crew by Flight / Find Pairing by Flight blocks unchanged.

- [ ] **Step 3: Sanity check types**

`Plane` is already imported. `openFlightDetail` is already bound. No new files.

- [ ] **Step 4: Manual smoke (optional in agent session)**

Live → right-click flying roster puck → see **View flight detail** → dialog `#<fltId>`. Pairing segment with `fltId` → same.

---

### Task 2: Playwright regression

**Files:**
- Create: `e2e/tests/gantt/live-view-flight-detail-menu.spec.ts`

**Interfaces:**
- Consumes: `rosterProbe`, `pairingProbe`, `roster` hook (`fltId`), `GanttDashboardPage`, `seedGanttAuth`, `counts`
- Produces: Live-14xx tests that fail before Task 1 and pass after

- [ ] **Step 1: Write the failing e2e file**

Mirror coordinate helpers from `e2e/tests/gantt/swap-dialog.spec.ts`. Prefer real canvas right-click (§Simulate-User). Do **not** use `openLivePairingContextMenu` (that stub sets `fltId: null`).

```ts
/**
 * Live context menu — View flight detail (Roster + Pairing).
 * Spec: docs/superpowers/specs/2026-08-24-live-view-flight-detail-menu-design.md
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'

interface RosterProbe {
  id: number; pairingId: number; crewId: string; schStrDtUtc: string; rowIndex: number
  scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string
  headerHeight: number; rowHeight: number
}

interface PairingProbe {
  segId: number; pairingId: number; fltId: number | null; schStrDtUtc: string; rowIndex: number
  scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string
  headerHeight: number; rowHeight: number
}

interface RosterItem { id: number; fltId: number | null }

const puckClickXY = (probe: {
  schStrDtUtc: string; scrollX: number; scrollY: number; pxPerHour: number
  rangeStartIso: string; headerHeight: number; rowHeight: number; rowIndex: number
}): { x: number; y: number } => {
  const iso = probe.schStrDtUtc
  const ms = Date.parse(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  const rangeStartMs = Date.parse(probe.rangeStartIso)
  const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * probe.pxPerHour - probe.scrollX
  const rowTop = probe.headerHeight + probe.rowIndex * probe.rowHeight - probe.scrollY
  return { x: x + 6, y: rowTop + Math.floor(probe.rowHeight / 2) }
}

const rightClickPuck = async (
  canvas: Locator,
  probe: Parameters<typeof puckClickXY>[0],
): Promise<void> => {
  const box = await canvas.boundingBox()
  const { x, y } = puckClickXY(probe)
  test.skip(!box || x < 0 || x > box.width - 4 || y < 0 || y > box.height - 4,
    'probed puck is outside the visible canvas')
  await canvas.click({ position: { x, y }, button: 'right' })
}

test.describe('Live View flight detail menu', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect
      .poll(async () => (await counts(page)).roster, { message: 'roster loaded', timeout: 30_000 })
      .toBeGreaterThan(0)
  })

  test('Live-1460 — roster right-click View flight detail opens Flight Detail', async ({ page }) => {
    const probe = await readHook<RosterProbe | null>(page, 'rosterProbe')
    expect(probe, 'visible roster flying puck').not.toBeNull()
    const items = await readHook<RosterItem[]>(page, 'roster')
    const row = items.find((i) => i.id === probe!.id)
    expect(row?.fltId, 'roster puck must carry fltId').toBeTruthy()
    const fltId = row!.fltId!

    await rightClickPuck(dashboard.rosterCanvas, probe!)

    const viewFlight = page.getByRole('button', { name: 'View flight detail', exact: true })
    await expect(viewFlight).toBeVisible({ timeout: 5_000 })
    await viewFlight.click()

    const dialog = dashboard.flightDetailDialog
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByTestId('flight-detail-flight-id')).toHaveText(`#${fltId}`)
  })

  test('Live-1461 — pairing segment right-click View flight detail opens Flight Detail', async ({ page }) => {
    await expect
      .poll(async () => (await counts(page)).pairing, { message: 'pairing loaded', timeout: 30_000 })
      .toBeGreaterThan(0)

    const probe = await readHook<PairingProbe | null>(page, 'pairingProbe')
    expect(probe, 'visible pairing segment').not.toBeNull()
    test.skip(probe!.fltId == null, 'pairingProbe segment has no fltId')

    await rightClickPuck(dashboard.pairingCanvas, probe!)

    const viewFlight = page.getByRole('button', { name: 'View flight detail', exact: true })
    await expect(viewFlight).toBeVisible({ timeout: 5_000 })
    await viewFlight.click()

    const dialog = dashboard.flightDetailDialog
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByTestId('flight-detail-flight-id')).toHaveText(`#${probe!.fltId}`)
  })
})
```

Canvas locators: `dashboard.rosterCanvas` / `dashboard.pairingCanvas` / `dashboard.flightDetailDialog` (`e2e/pages/gantt/gantt-dashboard-page.ts`), same pattern as `swap-dialog.spec.ts`.

- [ ] **Step 2: Run e2e — expect FAIL before Task 1 (or PASS after Task 1 if done first)**

```bash
cd e2e && PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright" \
  GANTT_BASE_URL=http://localhost:5566 \
  npx playwright test --config=config/playwright.gantt-only.config.ts \
  live-view-flight-detail-menu.spec.ts --reporter=list
```

Expected after Task 1: **2 passed**. Paste PASS/FAIL summary in the delivery note (§No-Illusion).

If `rosterProbe` puck has `fltId: null` in the environment, tighten the probe via `page.evaluate` to find the first visible roster item with `fltId != null` and right-click that geometry (same formula as `puckClickXY`) — still real UI click, not `openFlightDetail` injection.

---

### Task 3: Help copy + Help inspection

**Files:**
- Modify: `gantt/src/components/help/topics/live/live-context-menu.tsx`
- Modify: `gantt/src/components/help/topics/live/live-edit.tsx` (pairing/flight wording)
- Modify: `gantt/src/components/help/topics/live/live-panes.tsx` if controls list still omits View flight detail
- Test: `e2e/tests/gantt/help/help-feat-inspection.spec.ts` Live-1299 (already asserts `View flight detail` text exists)

- [ ] **Step 1: Update live-context-menu.tsx**

HelpStep 1 (Live roster duty): after mentioning View pairing detail, add View flight detail when the duty has a flight.

ControlsRef entry currently:

```tsx
{ name: 'View flight detail', icon: <Plane ... />, description: 'Scenario — opens the flight detail for the task’s flight.' },
```

Change description to:

```tsx
{ name: 'View flight detail', icon: <Plane className="h-3.5 w-3.5" />, description: 'Live or Scenario — roster/pairing duty with a flight id — opens Flight Detail for that flight.' },
```

HelpStep 1 body: include **View flight detail** alongside **View pairing detail** / **Locate Pairing**.

- [ ] **Step 2: Update live-edit.tsx / live-panes.tsx**

Where Live menus list only View pairing detail for paired duties, add View flight detail in the same sentence (English UI/Help).

- [ ] **Step 3: Run Help inspection**

```bash
cd e2e && PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright" \
  GANTT_BASE_URL=http://localhost:5566 \
  npx playwright test --config=config/playwright.gantt-only.config.ts \
  help/help-feat-inspection.spec.ts -g 'Live-1299' --reporter=list
```

Expected: **1 passed**.

---

### Task 4: Spec status + delivery

**Files:**
- Modify: `docs/superpowers/specs/2026-08-24-live-view-flight-detail-menu-design.md` Status → Implemented (link this plan)

- [ ] **Step 1: Mark spec Implemented**

```markdown
## Status

Implemented (2026-08-24). Plan: `docs/superpowers/plans/2026-08-24-live-view-flight-detail-menu.md`.
```

- [ ] **Step 2: Delivery checklist**

Report: files touched; Live-1460 / Live-1461 / Live-1299 PASS receipts; note Crew Assignment remains Live API when opened from Live.

- [ ] **Step 3: Commit when user asks**

Suggested message:

```
feat(gantt): add View flight detail to Live roster/pairing menus

Parity with Scenario: open Live Flight Detail from right-click when
fltId / findFltId is present.
```

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| Live Roster menu item when `fltId != null` | Task 1 |
| Live Pairing menu item when `findFltId != null` | Task 1 |
| Label/icon/placement/openFlightDetail(no scenarioId) | Task 1 |
| Playwright roster + pairing | Task 2 |
| Help updates | Task 3 |
| No Crew Assignment logic change | (explicit non-touch) |
| Spec status Implemented | Task 4 |

Placeholder scan: cleared — e2e uses `dashboard.rosterCanvas` / `pairingCanvas` / `flightDetailDialog` explicitly.
