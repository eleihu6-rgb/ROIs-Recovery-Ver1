# Gantt Live View: Empty Start + Filter-Driven Data Pull

> Spec date: 2026-06-03 · Module: gantt · Status: approved design, pending implementation plan

## Goal

Change the Live view initiation flow: remove the "Open Live View" pop-up, land the user
on an **empty** gantt (no crew / roster / pairing / flight auto-load), and make the global
**Filter dialog** the single mechanism that pulls data. Guide the user to the filter with
a motion-animated empty state.

## Background (current behavior)

- Clicking **Live** in the top nav opens `live-setup-dialog.tsx` ("Open Live View") when
  `filter-store.appliedFilters === null`: the user picks a planning period + crew filters,
  then **Load** orchestrates `fetchCrewsWithFilter` / `loadFromBootstrap` +
  `loadRosterProgressive` + deferred pairing/flight fetches.
- The Filter dialog (funnel icon in `gantt-sub-toolbar.tsx`) already performs
  **server-side selective refetch** via `applyGanttFilters()` (`utils/apply-filters.ts`),
  diffing against the `appliedFilters` snapshot.
- Default `dateRange` in `filter-store.ts` is previous month → end of next month (3 months).

## Decisions (confirmed with user)

1. **Empty-state guidance**: animated toolbar funnel icon **and** a centered clickable
   overlay in the gantt area (opens the Filter dialog).
2. **Empty filter allowed**: Apply with zero filters loads ALL crews (fast bootstrap path).
3. **Date range source**: toolbar From/To pickers only; the Filter dialog stays date-free.
4. **Default planning period**: **start of current month → end of next month** (2 months).
5. **Animation library**: `motion` (motiondivision, MIT, formerly Framer Motion) — import
   from `motion/react` only. Passes dependency-security rules (MIT, known maintainer,
   no telemetry).

## Design

### 1. Remove the pop-up

- `shell/shell-top-nav.tsx`: "Live" click → `setModule('live')` unconditionally.
  Delete the `appliedFilters === null` branch and all `LiveSetupDialog` wiring.
- Delete `components/layout/live-setup-dialog.tsx`.
- `stores/filter-store.ts`: `defaultStart = startOfMonth(today)` (was `subMonths(today, 1)`).
  `defaultEnd` unchanged (`endOfMonth(addMonths(today, 1))`) → default period =
  **current month + next month**.
- `loadFromStorage` stops restoring `dateRange` (filter values remain persisted — they
  prefill the dialog), so every fresh session starts at the default 2-month period.
  Note: `appliedFilters` was never persisted, so `appliedFilters === null` reliably marks
  "nothing loaded yet" on every page load.

### 2. Empty Live view

- No data fetch on Live mount. Panes already render an empty timeline grid with
  `totalRows = 0` — no canvas changes needed.
- **Empty condition** (single source of truth): `useFilterStore((s) => s.appliedFilters === null)`
  — true only before the first successful apply, persists across module switches within
  the session.

### 3. Guided empty state (motion)

- New `components/layout/live-empty-state.tsx`: overlay centered over the gantt area,
  rendered by `shell/roster-view.tsx` when `appliedFilters === null` and module is live.
  - Spring entrance for a funnel icon, then a soft repeating pulse ring around it.
  - Text: **"No data loaded"** / "Apply filters to pull crew, pairing and flight data".
  - Entire card clickable → opens the Filter dialog. `data-testid="live-empty-state"`.
  - While the first apply is in flight: overlay fades out (motion exit) and the existing
    loading indicators take over.
- `shell/gantt-sub-toolbar.tsx`: funnel icon gets a motion pulse/glow loop while the
  empty condition holds; static once data is loaded.
- Filter-dialog open state lifts from local `useState` in `GanttSubToolbar` to
  `shell-store` (`filterDialogOpen: boolean`, `setFilterDialogOpen`), so both the overlay
  and the toolbar button can open it.
- All UI strings in English. Styling per CSS/typography standard (semantic tokens,
  standard type scale, no magic px).

### 4. Data pull = Apply Filters

- Apply → existing `applyGanttFilters()` (unchanged for the re-filter case — user point 4).
- Extension in `utils/apply-filters.ts`: when `appliedFilters === null` (first pull) and
  **no crew filter** is set → use `useGanttViewStore.getState().loadFromBootstrap(dateRange)`
  (single round-trip: slim crew list + first-screen roster) instead of
  `fetchCrews()` + `loadRosterProgressive()`. With a crew filter, the current
  `fetchCrewsWithFilter` + `loadRosterProgressive` path is used as today.
- Pairing/flight fetches follow the existing visible-pane-gated logic in
  `applyGanttFilters` (first apply sees all filters as changed → everything visible loads).
- Re-applying filters later performs the existing selective refetch (only changed panes).

### 5. Out of scope (planned follow-up)

- **User profiles** defining access-filter criteria (crew managed by base + rank).
  The `appliedFilters === null` gate and filter-driven pull are deliberately shaped so a
  profile can later pre-seed `filter-store` and optionally auto-apply on Live entry.

## Dependency

- `motion` (npm package `motion`): MIT license, motiondivision (Matt Perry / ex-Framer),
  >25k GitHub stars, no telemetry. Added to `gantt/package.json` dependencies.
  Import surface: `motion/react` (`motion.div`, `AnimatePresence`).

## Affected files

| File | Change |
|---|---|
| `gantt/src/components/layout/live-setup-dialog.tsx` | **delete** |
| `gantt/src/shell/shell-top-nav.tsx` | Live click → `setModule('live')`; remove dialog wiring |
| `gantt/src/stores/filter-store.ts` | default range = current month start → next month end |
| `gantt/src/stores/shell-store.ts` | add `filterDialogOpen` / `setFilterDialogOpen` |
| `gantt/src/shell/gantt-sub-toolbar.tsx` | use shell-store dialog state; animated funnel while empty |
| `gantt/src/components/layout/live-empty-state.tsx` | **new** — motion empty-state overlay |
| `gantt/src/shell/roster-view.tsx` | render overlay when empty |
| `gantt/src/utils/apply-filters.ts` | first-pull bootstrap fast path |
| `gantt/package.json` | add `motion` |
| `gantt/src/version.ts` | `FRONTEND_VERSION` +1 |

## Testing (Playwright, `e2e/tests/gantt/`)

1. **No pop-up + empty start**: navigate to Live → no "Open Live View" dialog; roster pane
   shows 0 rows (`__ganttTest` render stats / crew count badge `0`); empty-state overlay
   visible with exact text "No data loaded".
2. **Overlay opens dialog**: click overlay → Filter dialog visible (Crew tab).
3. **Filtered pull**: set Base + Rank, Apply → overlay gone, roster rows > 0, all visible
   crew match the filter (left header values), toolbar count badge matches.
4. **Re-filter**: change Base, Apply → visible set changes accordingly (old base absent).
5. **Load-all**: reset filters, Apply with none → rows load via bootstrap path (count > 0).
6. **Default date range**: toolbar From/To show current-month start / next-month end.

Anti-patterns avoided per §Playwright-Required: assertions on specific values/counts,
multi-step flows with intermediate assertions.
