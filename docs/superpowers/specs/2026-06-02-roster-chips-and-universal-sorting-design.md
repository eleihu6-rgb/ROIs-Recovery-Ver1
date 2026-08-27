# Roster Pane: Condition Chips + Universal Sorting — Design

> Date: 2026-06-02
> Module: gantt (排班前端)
> Scope: Add filter/sort condition chips to pane title bars, and a multi-key
> "Universal Sorting" dialog for the roster panes (Seniority as the headline field).

## 1. Goal

Two user-facing features on the gantt roster panes (applies to **both** Roster Main
and Roster Sub):

1. **Condition chips** — every active condition on a pane (filters like base/rank,
   plus the active sort) is shown as a chip on the pane title bar. All panes' chip
   strips start at the same horizontal position: the "virtual line" = the boundary
   between the left crew-list area and the right gantt canvas.
2. **Universal Sorting dialog** — a dedicated sort button on each roster pane opens
   a popup (styled per the `@rois/ui` `AppDialog` standard) that lets the user pick
   one or more sort criteria with priority ordering and a global Asc/Desc order.
   A generic multi-key sort engine drives the order; **Seniority** is the headline
   field and sorts numerically, default ascending.

Non-goals (this round):
- No new filter *types* (the "0–80h" hours-range chip in the reference image is
  illustrative only). Chips reflect the filters that already exist.
- No per-criterion sort direction in the dialog UI — a single global Asc/Desc radio
  applies to all selected criteria (matches the reference mockup). The data model is
  per-criterion to keep the door open for the future.

## 2. Reference

- Image #3: chips `TPE ×  0–80h ×  ↑ MBH ×` rendered starting at the canvas-left
  edge; filter chips are solid blue pills, the sort chip is a neutral gray pill with
  a direction arrow.
- Image #4: "Universal Sorting" dialog — dual list (`Sort Item` / `Selected Item` +
  `Priority`), move arrows (→ ← ↑ ↓), `Sort Order: Ascending / Descending`,
  `Apply` / `Cancel`.

## 3. Current behavior (baseline)

- `RosterPane` (`gantt/src/components/panes/roster-pane.tsx`) renders both roster
  instances; `legacyPaneType` is `'roster-main'` or `'roster-sub'`.
- `PaneToolbar` (`gantt/src/components/panes/pane-toolbar.tsx`) renders:
  - Row 1: drag handle, color dot, title, count badges, quick-filter chips, and
    action buttons (including an `ArrowUpDown` "Sort" button gated on `onSortClick`,
    currently **not** wired by `RosterPane`).
  - Row 2 (only when `filterChips.length > 0`): an optional `sortLabel` text, the
    filter chips (session-colored, translucent), and a "Clear all" button.
- Sort state is per-pane in `pane-store.ts`: single `sortColumn: string | null` +
  `sortDirection: 'asc' | 'desc'`. `setSortColumn` toggles asc/desc on repeat.
- Header-column click (`handleColumnHeaderClick`) calls `setSortColumn`.
- Sort is applied in a `useMemo` over `unsortedPanelRows` using a single key with a
  numeric-aware comparator. Result feeds `sortedCrewIds` → canvas + left panel.
- `leftPanelWidth` is shared across all panes in `pane-store.ts` and positions the
  `VerticalSplitter`.
- Panel `values` per row already include: `crewId, rank, base, seniority, fleet,
  crewName, ybh, mbh, yal, mal, ydo, mdo`. `seniority = formatSeniority(seniorityNum)`.
- Test hook `window.__ganttTest` (`gantt/src/utils/gantt-test-hook.ts`) exposes
  `rosterPanel()` → ordered `{ crewId, seniority }[]` (reflects the *displayed* order,
  so it already reflects sorting), `crewSeniority()` → `{ crewId, seniorityNum }[]`,
  and `rosterColumns()`.

## 4. Feature 1 — Condition chips on the pane title bar

### 4.1 Alignment to the virtual line
- Pass `leftPanelWidth` (from `usePaneStore`) into `PaneToolbar`.
- Indent the Row 2 strip's content by `leftPanelWidth` via inline
  `style={{ paddingLeft: leftPanelWidth }}` (dynamic pixel value — allowed by the CSS
  standard for splitter-driven positioning). Because `leftPanelWidth` is shared, all
  panes' chips begin at the same x = the crew-list/canvas boundary.

### 4.2 Show condition
- Render Row 2 when `hasFilters || hasSort` (today: `hasFilters` only), where
  `hasSort = sortChips.length > 0`.

### 4.3 Sort chips
- New prop on `PaneToolbar`: `sortChips?: { key: string; label: string; direction:
  'asc' | 'desc'; onRemove: () => void }[]`.
- Each renders as a neutral solid pill: arrow (`↑` asc / `↓` desc) + column short
  label (e.g. `SEN`) + `×`. Neutral styling via semantic tokens
  (`bg-secondary text-secondary-foreground` or `bg-muted-foreground/15`), distinct
  from the blue/session-colored filter pills. `×` removes that single criterion.
- The existing `sortLabel` text indicator is removed in favor of these chips.

### 4.4 Filter chip styling
- Keep the existing session-color semantics (different crew-query sessions stay color-
  coded). Render as solid rounded-full pills to match the image shape. Existing
  `key:value` content and per-chip remove (`onRemoveFilter`) and "Clear all" preserved.

### 4.5 Test affordances
- Add `data-testid="pane-filter-chip"` to filter pills and
  `data-testid="pane-sort-chip"` to sort pills, plus a `data-testid` on the Row 2
  strip (`pane-condition-strip`). Chips are DOM (not canvas), so e2e asserts text
  directly.

### 4.6 RosterPane wiring
- Build `sortChips` from the pane's `sortCriteria` (see §5.2): map each criterion to
  `{ key: column, label: columnShortLabel(column), direction, onRemove: () =>
  removeSortCriterion(legacyPaneType, column) }`.
- `columnShortLabel(column)` resolves from the pane's column config (so `seniority`
  → `SEN`), falling back to the column key uppercased.

## 5. Feature 2 — Universal Sorting dialog

### 5.1 Dialog component
- New file: `gantt/src/components/panes/sort-dialog.tsx`.
- Built on `@rois/ui` `AppDialog` (blue title bar, left icon `ArrowUpDown`/`ListFilter`,
  draggable, right-aligned footer, `showClose`). `data-testid="sort-dialog"`.
- Props: `{ open, onOpenChange, paneType, paneLabel, columns, initialCriteria,
  initialOrder, onApply }`.
  - `columns`: `{ key: string; label: string }[]` — the pane's sortable fields,
    derived from the pane's visible column config (parameterized, no hardcoded list).
  - `onApply(criteria: SortCriterion[])` — commits the new sort.
- Layout (matches Image #4):
  - A single tab strip showing `paneLabel` (e.g. "Roster Main") — placeholder for
    future multi-pane tabs.
  - Two columns: **Sort Item** (available = columns not yet selected) and
    **Selected Item** with a **Priority** number (1-based = array index + 1).
  - Center move controls: `→` (move highlighted available → selected), `←` (remove
    highlighted selected → available), `↑` / `↓` (reorder highlighted selected).
  - **Double-click** an item in either list to move it to the other list (same effect
    as the →/← buttons for that item).
  - Bottom: `Sort Order:  ( ) Ascending  ( ) Descending` — a single global radio.
  - Footer: `Apply` (primary) and `Cancel`.
- Internal dialog state (local `useState`, committed only on Apply):
  - `selected: string[]` (ordered column keys), `available` derived as
    `columns - selected`, `order: 'asc' | 'desc'`, and a `highlighted` key per list.
- Apply builds `SortCriterion[] = selected.map(col => ({ column: col, direction: order }))`
  and calls `onApply`, then closes. Cancel closes without committing.

### 5.2 Sort state model (`pane-store.ts`)
- Extend `PaneInteractiveState` with `sortCriteria: SortCriterion[]` where
  `type SortCriterion = { column: string; direction: 'asc' | 'desc' }`. Priority =
  array order (index 0 = primary).
- Keep `sortColumn` / `sortDirection` as **derived getters** from `sortCriteria[0]`
  (or null/asc when empty) so the canvas header indicator
  (`PaneHeaderCanvas` consumes `sortColumn`/`sortDirection`) and the header-click path
  keep working unchanged.
  - Implementation: `getSortColumn` returns `sortCriteria[0]?.column ?? null`;
    `getSortDirection` returns `sortCriteria[0]?.direction ?? 'asc'`.
- New/changed actions:
  - `setSortColumn(paneType, column)` (header click): toggles a **single-criterion**
    sort — if the current primary is this column & asc → desc, else asc; replaces
    `sortCriteria` with `[{ column, direction }]`.
  - `setSortCriteria(paneType, criteria)` (dialog Apply): replaces the array.
  - `removeSortCriterion(paneType, column)` (chip ×): filters the column out.
- Default `sortCriteria: []`.

### 5.3 Sort engine (`roster-pane.tsx`)
- Replace the single-key `useMemo` with a multi-key comparator that iterates
  `sortCriteria` in priority order; first non-zero comparison wins. Per-criterion
  compare reuses the existing numeric-aware rule: if both values parse as numbers,
  compare numerically; else `localeCompare`. Apply `direction` per criterion.
- When `sortCriteria` is empty → identity order (unchanged behavior).
- Seniority (`values.seniority`) parses numerically (`formatSeniority` yields a numeric
  string), so Seniority sort is numeric ascending by default.

### 5.4 RosterPane wiring
- Read `sortCriteria` from `pane-store`.
- Local `useState` `sortDialogOpen`. Pass `onSortClick={() => setSortDialogOpen(true)}`
  to `PaneToolbar` (this reveals the existing toolbar Sort button).
- Render `<SortDialog … />` with `columns` from the pane's visible column config,
  `initialCriteria={sortCriteria}`, `onApply={(c) => setSortCriteria(legacyPaneType, c)}`.
- Build and pass `sortChips` (§4.6) to `PaneToolbar`.

## 6. Test introspection

- Add `rosterSort(paneType?: 'roster-main' | 'roster-sub')` to `gantt-test-hook.ts`
  returning the active `SortCriterion[]` for the pane (default `'roster-main'`),
  published from `RosterPane` alongside the existing panel-rows publish. Lets e2e
  assert the committed criteria directly, in addition to the displayed order via
  `rosterPanel()`.

## 7. Versioning

- Frontend-only change → `FRONTEND_VERSION` 43 → **44** in `gantt/src/version.ts`.
  `BACKEND_VERSION` and `RULE_VERSION` unchanged.

## 8. Tests (Playwright, `e2e/tests/gantt/`)

Both are multi-step with intermediate assertions; both exercise Roster Main and the
second roster pane where practical.

### Test 1 — `roster-condition-chips.spec.ts`
1. Seed auth, open Live view, wait for `rosterPanel().length > 0`.
2. Open the sort dialog on Roster Main, select **Seniority**, **Ascending**, Apply.
3. Assert a sort chip `data-testid="pane-sort-chip"` is visible with text containing
   `SEN` and an `↑` arrow.
4. Apply a base filter (existing crew-query filter path) → assert a filter chip
   (`data-testid="pane-filter-chip"`) shows the base value (e.g. `TPE`).
5. Assert the condition strip exists and (sanity) its content is left-indented (the
   strip carries the `leftPanelWidth` padding).
6. Click the sort chip's `×` → assert the sort chip is gone and `rosterSort()` is
   empty for that pane.

### Test 2 — `roster-universal-sorting.spec.ts`
1. Seed auth, open Live view, wait for rows.
2. Open the sort dialog, **double-click** `SENIORITY` in Sort Item → assert it appears
   in Selected Item with Priority `1`. Choose **Ascending**, Apply.
3. Read `rosterPanel()` → assert the `seniority` values are non-decreasing; cross-check
   each against `crewSeniority()` truth map. Assert `rosterSort()` ==
   `[{ column: 'seniority', direction: 'asc' }]`.
4. Re-open dialog, switch to **Descending**, Apply → assert `rosterPanel()` seniority
   values are non-increasing (reversed order).
5. Re-open dialog, **double-click** SENIORITY in Selected Item → assert it returns to
   Sort Item (move-left via double-click), Apply → assert `rosterSort()` is empty and
   order reverts to identity.

Run: `npx playwright test --config=config/playwright.config.ts
tests/gantt/roster-condition-chips.spec.ts tests/gantt/roster-universal-sorting.spec.ts
--reporter=list` (from `e2e/`). Paste the PASS/FAIL summary into the completion message
(No-Illusion rule).

## 9. Files touched

| File | Change |
|------|--------|
| `gantt/src/stores/pane-store.ts` | `sortCriteria` state, derived `sortColumn/Direction`, `setSortCriteria`, `removeSortCriterion`, refactor `setSortColumn` |
| `gantt/src/components/panes/pane-toolbar.tsx` | `leftPanelWidth` indent on Row 2, `sortChips` prop + rendering, solid-pill styling, testids, show-on-sort |
| `gantt/src/components/panes/sort-dialog.tsx` | **new** — Universal Sorting dialog (AppDialog) |
| `gantt/src/components/panes/roster-pane.tsx` | multi-key sort engine, wire dialog + `onSortClick` + `sortChips`, pass `leftPanelWidth` |
| `gantt/src/utils/gantt-test-hook.ts` | `rosterSort()` introspection |
| `gantt/src/version.ts` | `FRONTEND_VERSION` → 44 |
| `e2e/tests/gantt/roster-condition-chips.spec.ts` | **new** test 1 |
| `e2e/tests/gantt/roster-universal-sorting.spec.ts` | **new** test 2 |
