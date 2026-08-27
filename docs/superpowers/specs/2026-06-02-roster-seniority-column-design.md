# Roster Seniority Column — Design

> Date: 2026-06-02
> Module: gantt
> Status: Approved (ready for implementation plan)

## Goal

Surface each crew member's seniority (`crew.seniority_num`) as a new column **`SEN`** in
the Roster panes. The column must appear in two UI locations, both driven by the same
column config:

1. **Column Settings dialog** (`column-config-dialog.tsx`) — listed, toggleable, reorderable.
2. **Roster Main / Sub pane header** (`pane-header-canvas.tsx`) — rendered as a column.

Display decisions (confirmed with user):
- Column key: `seniority`, label: `SEN`
- **Visible by default** (in fresh / Reset config)
- Positioned **right after `Base`** (order: CrewId, Rank, Base, SEN, Fleet, YBH, …)

## Why no backend change

`seniority_num` already exists on the `crew` table
(`live-server/src/models/crew/crew.ts:20`, `numeric('seniority_num', { precision: 10, scale: 2 })`)
and is already returned by the slim list endpoint used by the Roster panes
(`GET /api/crew?view=gantt-panel`) — `crew-service.ts` builds each item with `...c`, which
includes every crew column. The value already reaches the frontend `crew` object at runtime;
it is simply not typed on the list `Crew` interface and not displayed.

The YBH/MBH/YAL/MAL/YDO/MDO columns are sourced from **roster items** (`firstItem.ybh` …).
Seniority is different: it is a **crew attribute**, sourced from the crew object via
`crewDetailMap` in `roster-pane.tsx`.

## Changes (all in `gantt/`)

### 1. `src/types/crew.ts`
Add `seniorityNum: string | null` to the **`Crew`** interface (currently only declared on
`CrewDetail`). Drizzle returns `numeric(10,2)` as a string.

### 2. `src/stores/column-store.ts`
- Insert into `DEFAULT_ROSTER_COLUMNS`:
  `{ key: 'seniority', label: 'SEN', width: 50, visible: true, order: 4, row: 1 }`
- Renumber the columns after Base so SEN sits at order 4:
  Fleet → 5, YBH → 6, MBH → 7, YAL → 8, MAL → 9, YDO → 10, MDO → 11.
- **localStorage migration**: existing stored configs (`gantt-column-config`) will not contain
  the `seniority` key, so the new column would never appear for existing users. In
  `loadFromStorage`, mirror the existing `isStaleRoster` (`crewName`) pattern: if a stored
  roster pane config does **not** contain a column with key `seniority`, reset that pane to
  defaults. This is a one-time migration; the trade-off is that a user's custom roster column
  ordering/visibility is reset once on first load after this ships. Accepted by user.

### 3. `src/components/panes/roster-pane.tsx`
In the `unsortedPanelRows` `useMemo`, add `seniority` to the `values` object, read from the
crew object (not the roster item):

```ts
seniority: formatSeniority(crew?.seniorityNum),
```

`formatSeniority(v: string | null | undefined): string`:
- returns `''` for null / undefined / empty
- strips a trailing `.00` so `1234.00` → `1234`, while `12.50` is preserved

Sorting requires no change — the existing `sortedRows` logic does numeric comparison when both
values parse as numbers, and seniority values are numeric.

### No change required
- `column-config-dialog.tsx` — reads columns dynamically from `useColumnStore`.
- `pane-header-canvas.tsx` — renders `row.values[col.key]` dynamically.

## Testing

Per `§Playwright-Required` and `§No-Illusion`: write `e2e/gantt/roster/seniority-column.spec.ts`
and paste the PASS/FAIL summary into the completion message. Coverage:

1. **Rendered column shows real data** — open Gantt Live view; assert the Roster Main pane
   header contains `SEN`, and a known seeded crew row shows its expected seniority value
   (`toContainText(value)` / canvas test-hook assertion — not bare `toBeVisible`).
2. **Column Settings integration** — open the dialog; assert `SEN` is listed; toggle it off and
   assert the column disappears from the pane (header absent / count changes); toggle back on.
3. **Regression angle** — assert the displayed value derives from crew data for a specific
   seeded crew (a concrete number), distinguishing real data from a blank/placeholder.

> Roster panes render on Canvas — use the `window.__ganttTest` hook for header/cell assertions
> where DOM queries are not possible (see memory: *Gantt Live view & test hook*).

## Out of scope
- No backend / SQL changes (data already flows).
- No new sort modes beyond the existing numeric-aware sort.
- Pairing / Flight pane columns are unchanged.

## Version bump
Frontend-only change → `FRONTEND_VERSION` +1 in `gantt/src/version.ts`.
