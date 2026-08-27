---
name: 130-crew-bell-click-popup
description: >
  Per-crew bell click in roster pane → ViolationListDialog filtered to that crew's violations
  (Scen-2045 + Viol-8012). Covers the stale-bell guard (crew 295 bug fix) and E2E recipe.
metadata:
  type: skill
---

# Crew Bell Click → Per-Crew Popup

**Shipped**: feat/gantt/res-pairing-creator (F323)
**Tests**: Scen-2045 (mocked Scenario) + Viol-8012 (Live)

## Feature

When a crew row in the roster header canvas shows a violation bell (red/amber dot at right edge),
clicking that bell opens `ViolationListDialog` filtered to ONLY that crew's violations — distinct
from the toolbar bell (Alert Center, all crews).

**Stale-bell guard**: if `alertCenter.rows` has no violations for the clicked crew
(bell visible in canvas via `violations` map, but `persistedRaw` is out of sync),
`handleCrewBellClick` triggers `alertCenter.onScan()` and opens the full Alert Center
instead of an empty per-crew dialog. Root cause: `runPreCheck` writes to `violations`
without touching `persistedRaw`; the guard prevents the confusing empty popup.

## Key files

| File | Role |
|------|------|
| `gantt/src/components/panes/shared/roster-pane.tsx` | `handleCrewBellClick` + per-crew dialog state |
| `gantt/src/components/panes/violation-list-dialog.tsx` | shared dialog (Alert Center + per-crew) — has a `alert-search-input` search box (F324) that filters the already-loaded `rows` by crew id / rank / base, client-side; scopes the message table, GROUP BY counts, the "all" count, AND the hard/overridable title badges (all derive from `searchedRows`). No server query — data source is the loaded popup rows. Test: `e2e/tests/gantt/alert-center-search.spec.ts` (Live-1413). |
| `gantt/src/components/gantt/pane-header-canvas.tsx` | `onViolationClick` hit-test (width-10, radius 8) |
| `gantt/src/stores/scenario-violation-store.ts` | `persistedRaw` vs `violations` divergence |
| `e2e/tests/gantt/crew-bell-click-popup.spec.ts` | Scen-2045 + Viol-8012 |

## handleCrewBellClick logic (roster-pane.tsx)

```typescript
const handleCrewBellClick = useCallback((rowId: string) => {
  if (!alertCenter) return
  const hasViolations = alertCenter.rows.some((r) => r.crewId === rowId)
  if (hasViolations) {
    setCrewBellCrewId(rowId)        // open per-crew popup
  } else {
    alertCenter.onScan()            // re-sync persistedRaw from server
    setAlertCenterOpen(true)        // show full Alert Center with updated state
  }
}, [alertCenter])
```

## E2E recipe

### Scen-2045 mock gotcha: ground items required

`buildViolationMap` for `targetType === 'crew'` iterates `itemsByCrew.get(crewId)`. If
a crew has no assignments or groundItems in the mock, `itemsByCrew` is empty → no item
IDs to bump → `maxViolationSeverity = 0` → canvas bell never drawn.

**Fix**: add at least one `groundItems` entry per crew that has violations in the mock:

```typescript
groundItems: [
  { crewId: 'C0001', assignmentGroup: 'DO', assignment: 'DO',
    schStrDtUtc: '2026-06-01T00:00:00', schEndDtUtc: '2026-06-01T23:59:59',
    actingRank: 'CA', source: 'CR' as const },
]
```

### Close button testid

`AppDialog` renders TWO elements named "Close": the X in the title bar AND the footer button.
Use `page.getByTestId('violation-list-dialog-close')` (not `getByRole('button', { name: 'Close' })`).

### Poll pattern for severity

The badge (`violations-button-count`) updates from `persistedRaw`, but `maxViolationSeverity`
in panel rows comes from `violations` map + `itemsByCrew`. Wait for the badge first, then poll:

```typescript
await expect(view.getByTestId('violations-button-count')).toHaveText('3', { timeout: 15_000 })
await expect
  .poll(
    () => page.evaluate(() => window.__ganttTest?.scenarioCrewViolationSeverities?.()[0]?.severity ?? 0),
    { timeout: 5_000 },
  )
  .toBeGreaterThan(0)
```

### Canvas bell click helper

```typescript
async function clickCrewBell(page, canvasTestId, rowIndex) {
  const canvas = page.getByTestId(canvasTestId)
  const box = await canvas.boundingBox()
  if (!box) throw new Error(`${canvasTestId} has no bounding box`)
  await page.mouse.click(
    box.x + box.width - 10,
    box.y + HEADER_HEIGHT + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
  )
}
// HEADER_HEIGHT = 30, ROW_HEIGHT = 43 (from gantt-constants.ts)
// canvas testids: 'pane-header-canvas-scenario-roster' | 'pane-header-canvas-roster-main'
```
