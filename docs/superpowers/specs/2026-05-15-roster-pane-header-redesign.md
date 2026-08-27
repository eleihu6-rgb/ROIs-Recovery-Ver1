# Roster Pane Header Redesign

**Date:** 2026-05-15
**Module:** `gantt` — `roster-pane.tsx`, `column-store.ts`, `pane-header-canvas.tsx`
**Backend:** `live-server` — crew service / crew detail API

## Problem

The Roster Pane left panel header has three data quality issues:

1. **Rank** is taken from `RosterItem.actingRank` (the first task in the row). When the viewport shows a past or future date period, this value may not match the crew's rank at that time.
2. **Base** is similarly taken from `RosterItem.base` — same staleness risk.
3. **Fleet** is always an empty string — never populated.
4. **Crew Name** displays only `lastName + firstName` (no middle name), shown in a fixed 70px column in the bottom row alongside Fleet and YBH, wasting space.

## Solution

Load full rank/base/fleet history for each crew (once, alongside the crew list). Derive the effective values on the frontend based on the timeline's current leftmost visible date. Display multiple matching records separated by `|`. Move crew name to a full-width spanning bottom row.

---

## Design

### 1. Backend — Extend CrewDetail with History Arrays

**File:** `live-server/src/types/crew.ts`

Add three history array fields to `CrewDetail`:

```typescript
export interface CrewDetail extends Crew {
  // existing fields unchanged ...
  currentRank:  CrewRankRecord  | null   // kept for backward compatibility
  currentBase:  CrewBaseRecord  | null
  currentFleet: CrewFleetRecord | null

  // new: full history, no date filter applied server-side
  ranks:  CrewRankRecord[]
  bases:  CrewBaseRecord[]
  fleets: CrewFleetRecord[]
}
```

**File:** `live-server/src/services/crew/crew-service.ts`

After fetching the crew list, batch-query the three history tables once each:

```sql
SELECT * FROM crew_rank  WHERE crew_id = ANY($crewIds) ORDER BY crew_id, eff_dt;
SELECT * FROM crew_base  WHERE crew_id = ANY($crewIds) ORDER BY crew_id, eff_dt;
SELECT * FROM crew_fleet WHERE crew_id = ANY($crewIds) ORDER BY crew_id, eff_dt;
```

Group results by `crew_id` and attach to each `CrewDetail`. No date filtering on the backend — the full history is sent so the frontend can compute effective values for any viewport date without additional API calls.

Existing `currentRank / currentBase / currentFleet` population logic is unchanged.

---

### 2. Frontend — Utility Functions

**New file:** `gantt/src/utils/crew-history.ts`

Two pure, generic helper functions (no side effects, easily unit-tested):

```typescript
// Returns all records effective on `date`:
//   eff_dt <= date AND (exp_dt IS NULL OR exp_dt > date)
// Multiple records can be active simultaneously (e.g., dual ratings).
export function getAllEffective<T extends { effDt: string; expDt: string | null }>(
  records: T[],
  date: Date
): T[]

// Convenience: single record (latest eff_dt wins when multiple match)
export function getEffective<T extends { effDt: string; expDt: string | null }>(
  records: T[],
  date: Date
): T | null
```

---

### 3. Frontend — roster-pane.tsx Changes

**Viewport date derivation** (added near top of component, outside panel-row memo):

```typescript
const scrollX    = useGanttViewStore(s => s.scrollX)
const pxPerHour  = useGanttViewStore(s => s.pxPerHour)
const rangeStart = usePaneStore(s => s.dateRange.start)

// Truncate to start-of-day to avoid re-computing panel rows on every scroll pixel.
// The header only needs day-level granularity for rank/base/fleet lookups.
const viewportLeftDate = useMemo(
  () => startOfDay(xToTime(scrollX, rangeStart, pxPerHour)),
  [scrollX, pxPerHour, rangeStart]
)
```

**Panel rows memo** — replace existing rank/base/fleet/crewName derivation:

```typescript
const unsortedPanelRows = useMemo((): PanelRowData[] => {
  return selectedCrewIds.map((cid) => {
    const crew      = crewDetailMap.get(cid)
    const firstItem = items.find(i => i.crewId === cid)

    const rank  = crew
      ? getAllEffective(crew.ranks,  viewportLeftDate).map(r => r.rank).join(' | ') || ''
      : (firstItem?.actingRank ?? '')                              // fallback if detail not loaded

    const base  = crew
      ? getAllEffective(crew.bases,  viewportLeftDate).map(b => b.base).join(' | ') || ''
      : (firstItem?.base ?? '')

    const fleet = crew
      ? getAllEffective(crew.fleets, viewportLeftDate).map(f => f.fleetSpecific).join(' | ') || ''
      : ''

    const crewName = crew
      ? [crew.firstName, crew.middleName, crew.lastName].filter(Boolean).join(' ')
      : cid

    return {
      rowId: cid,
      values: {
        crewId: cid,
        rank,
        base,
        fleet,
        crewName,
        ybh:  firstItem?.ybh  != null ? String(firstItem.ybh)  : '',
        mbh:  firstItem?.mbh  != null ? String(firstItem.mbh)  : '',
        yal:  firstItem?.yal  != null ? String(firstItem.yal)  : '',
        mal:  firstItem?.mal  != null ? String(firstItem.mal)  : '',
        ydo:  firstItem?.ydo  != null ? String(firstItem.ydo)  : '',
        mdo:  firstItem?.mdo  != null ? String(firstItem.mdo)  : '',
      },
      // ... maxViolationSeverity, lockStatus, etc. unchanged
    }
  })
}, [selectedCrewIds, crewDetailMap, viewportLeftDate, items, violationMap])
```

**`drawTwoLineRow` call** — pass `bottomRowKey = 'crewName'` so the full name spans the 18px bottom strip.

---

### 4. Column Configuration Changes

**File:** `gantt/src/stores/column-store.ts`

`DEFAULT_ROSTER_COLUMNS` changes:

| key | Before | After | Notes |
|-----|--------|-------|-------|
| crewId | row 1, 70px | row 1, 70px | unchanged |
| rank | row 1, 45px | row 1, 45px | source changes |
| base | row 1, 45px | row 1, 45px | source changes |
| **fleet** | **row 2, 50px** | **row 1, 50px** | moved up; now populated |
| **ybh** | **row 2, 55px** | **row 1, 55px** | moved up |
| mbh / yal / mal / ydo / mdo | row 2, hidden | row 1, hidden | moved up |
| **crewName** | row 2, 70px | **bottomRowKey, full width** | spans entire bottom strip |

Total visible row 1 width: 70 + 45 + 45 + 50 + 55 = **265px** (down from 335px).

`crewName` is no longer a `ColumnConfig` entry — it is rendered by `drawTwoLineRow` as the `bottomRowKey` spanning the full panel width.

> **localStorage migration note:** existing persisted column configs (`gantt-column-config`) will be stale after this change. The store should detect and reset to defaults if the schema version doesn't match, or if `crewName` is found as a column key.

---

### 5. Data Flow Summary

```
GET /api/crew
  → CrewDetail[] with rankHistory / baseHistory / fleetHistory

crew-store → crewDetailMap: Map<crewId, CrewDetail>

roster-pane.tsx
  scrollX + pxPerHour + rangeStart
    → viewportLeftDate (startOfDay, useMemo)

  panelRows useMemo [crewDetailMap, viewportLeftDate, items]
    per crew:
      rank  = getAllEffective(crew.ranks,  viewportLeftDate).map(r=>r.rank).join(' | ')
      base  = getAllEffective(crew.bases,  viewportLeftDate).map(b=>b.base).join(' | ')
      fleet = getAllEffective(crew.fleets, viewportLeftDate).map(f=>f.fleetSpecific).join(' | ')
      crewName = firstName + middleName? + lastName

  → PanelRowData[] → drawTwoLineRow(bottomRowKey='crewName')
```

---

## Files Changed

| File | Change |
|------|--------|
| `live-server/src/types/crew.ts` | Add `ranks`, `bases`, `fleets` to `CrewDetail` |
| `live-server/src/services/crew/crew-service.ts` | Batch-fetch three history tables and attach to crew detail |
| `live-server/src/routes/crew/crew.ts` | Serialize new history fields in response |
| `gantt/src/utils/crew-history.ts` | New file: `getAllEffective`, `getEffective` helpers |
| `gantt/src/types/crew.ts` | Add `ranks`, `bases`, `fleets` array fields to `CrewDetail` interface |
| `gantt/src/stores/column-store.ts` | Move fleet/ybh/mbh/yal/mal/ydo/mdo to row 1; remove crewName from columns |
| `gantt/src/components/panes/roster-pane.tsx` | Add `viewportLeftDate`; replace rank/base/fleet/crewName derivation |
| `gantt/src/components/gantt/pane-header-canvas.tsx` | Confirm `bottomRowKey='crewName'` for roster pane draw calls |

## Out of Scope

- No changes to Pairing Pane or Flight Pane
- No changes to sorting / filtering logic
- No changes to `actingRank` on `RosterItem` (used for task-level display inside the timeline, not the panel header)
