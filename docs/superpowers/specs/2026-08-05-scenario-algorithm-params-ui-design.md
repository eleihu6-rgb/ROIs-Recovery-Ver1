# Scenario Algorithm Parameters UI — Design

**Date:** 2026-08-05
**Status:** Approved (design review)

## Problem

The Scenario → Algorithm Parameters dialog has several UX gaps the operator wants closed:

1. The dialog is too small for the editors it hosts.
2. Reserve Priority tab: the weekday inputs are laid out horizontally (4 columns) and the
   description omits the algorithm's default weekday priority.
3. Team Rules: teams and rules cannot be deleted.
4. Add Team dialog: Name/Description don't align with the body columns; the crew table has no
   per-crew selection, no select-all, and no virtualization (a scenario can have hundreds of
   crews, so a non-virtualized table will degrade).
5. Add Rule dialog: same column-alignment, selection, and virtualization gaps on the pairing table.
6. On Done, the explicit crew/pairing selection must be recorded.

## Decisions (user-confirmed 2026-08-05)

- **Selection storage:** add explicit `crew_ids` / `pairing_ids` arrays to the team/rule objects,
  alongside the existing `crew_filter` / `pairing_filter`. The filter keeps working as the
  table-narrowing control; the checked IDs are the source of truth for membership.
- **Virtualization:** add `@tanstack/react-virtual` (MIT, TanStack — trusted source). The repo has
  no virtual-scroll library today (pbs-portal's multi-select hand-rolls a scrollTop window; that
  pattern is not reused here per explicit choice).
- **Team delete guard:** deleting a Team that still has Team Rules is blocked, with an inline error
  listing the rule names to delete first.
- **Delete confirmation:** once the guard passes, team/rule deletion is immediate — no confirm dialog.

## Scope

Frontend only (`gantt`). No `live-server` / `engine-server` / `pbs-engine` service changes —
`team_rules` is passed through as opaque JSON today, and the solver's `TEAM_RULES.json` contract
already consumes `crew_ids` / `pairing_ids`.

## Changes

### 1. Algorithm Parameters dialog sizing — `scenario-parameters-dialog.tsx`

- `AppDialog` `sm:max-w-[760px]` → `sm:max-w-[960px]`.
- Body scroll wrapper `max-h-[65vh]` → `max-h-[80vh]`.

### 2. Reserve Priority tab — `renderReservePriority`

- Append to the existing description paragraph:
  `Algorithm default: Tue/Wed 1, Fri/Sat/Sun 2, Mon/Thu 3.`
  (display-only; matches the algorithm's documented default).
- Replace the horizontal `grid grid-cols-2 sm:grid-cols-4` of weekday inputs with a **single
  vertical column** ordered Mon → Sun. Each row: weekday label + number input (unchanged
  `Input` semantics: `min=1 max=9`).

### 3. Team Rules deletion — `TeamRulesEditor`

- Add a **Delete** button (ghost, destructive) to each Team row and each Rule row.
- Team delete handler:
  - `const dependent = rules.filter((r) => String(r.team_id) === String(team.id))`
  - If `dependent.length > 0` → block the delete and set an inline error state listing the rule
    names, e.g. `Cannot delete team — delete these Team Rules first: <names>.` Cleared when a
    rule is deleted or the user retries after cleanup.
  - Else → remove the team from `source.teams`.
- Rule delete handler: remove the rule from `source.rules` immediately.
- Both handlers call `onChange({ ...source, teams/rules })` (same merge shape as `saveTeam`/`saveRule`).

### 4. `PreviewTable` — virtual scrolling + optional checkbox column

`PreviewTable` (`scenario-parameter-editors.tsx`) gains optional selection support:

```ts
interface PreviewTableProps {
  rows: JsonRecord[]
  columns: { key: string; label: string }[]
  emptyText: string
  caption: string
  warning?: string | null
  selectable?: boolean
  rowId?: (row: JsonRecord) => string
  selectedIds?: string[]
  onToggleRow?: (id: string) => void
  onToggleAll?: () => void
  rowHeight?: number // default ~30
}
```

- When `selectable`, prepend a checkbox column:
  - Header cell: a tri-state checkbox — checked when every visible row is selected,
    unchecked when none, indeterminate otherwise — `onClick` calls `onToggleAll()`.
  - Body cells: per-row checkbox, `checked = selectedIds.includes(rowId(row))`.
- Virtualization: `useVirtualizer({ count: rows.length, getScrollElement, estimateSize: () => rowHeight, overscan: 10 })`.
  The tbody scroll container gets a fixed height (e.g. `h-80`) so virtualization bounds the DOM.
  The sticky header stays; only body rows virtualize. Both the caption and warning bars remain
  outside the scroll region.
- `@tanstack/react-virtual` added to `gantt/package.json` (`^3.x`).

### 5. Add Team dialog — `TeamEditor`

- **Layout:** change the Name/Description row to the same grid as the body
  (`grid-cols-[15rem_minmax(0,1fr)]`). Result: Name column width = Crew Filter column width;
  Description spans the same width as the preview table.
- **Selection state** (`crew_ids`): lazy-init from
  - existing team with `Array.isArray(team.crew_ids)` → `team.crew_ids`;
  - legacy team (no `crew_ids`) → crews matching `team.crew_filter`;
  - new team → all scenario-scoped crews (`crews` prop).
  `TeamEditor` mounts only after `crewRows` are loaded (user opens it from the loaded list), so a
  mount-time lazy initializer is sufficient.
- Checkbox column before `Crew`, select-all in header (acts on currently-shown rows), per-row
  toggle. `PreviewTable` called with `selectable`, `rowId = (r) => r.crew_id`, `selectedIds`,
  `onToggleRow`, `onToggleAll`.
- Footer count changes from `shown.length` to the total selected count (`selectedIds.length`).
  **Done** writes `{ ...draft, name, crew_filter, crew_ids: selectedIds }`.

### 6. Add Rule dialog — `RuleEditor`

- **Layout:** Name moves into the left 15rem column (aligned with Pairing Filter); Team select +
  Mode buttons are grouped in the right column (flex row).
- **Selection state** (`pairing_ids`): same lazy-init semantics as crews —
  existing → stored array; legacy → filter-matching pairings; new → all scenario-scoped pairings.
- Checkbox as first column, select-all header, per-row toggle, virtualized `PreviewTable`.
- Footer count reflects total selected pairings. **Done** writes
  `{ ...draft, name, pairing_filter, pairing_ids: selectedIds }`.

### 7. Data model & list badges — `TeamRulesEditor`

- Team object: `{ id, name, description, crew_filter, crew_ids }`.
- Rule object: `{ id, name, team_id, mode, enabled, pairing_filter, pairing_ids }`.
- `teamCount` badge: if `Array.isArray(team.crew_ids)` use `team.crew_ids.length`, else fall back
  to filter-match count (legacy rows).
- `ruleCount` badge: same — `rule.pairing_ids.length` when present, else filter-match count.
- `ruleWarning` / ONLY-empty semantics unchanged (based on filter match for legacy rows; for rows
  with explicit `pairing_ids`, warn when `pairing_ids.length === 0`).

### 8. Testing

- **Vitest** (`gantt/src/components/scenario/__tests__/scenario-parameter-editors.test.tsx`):
  - Extract pure selection helpers (`defaultSelectedIds`, `toggleId`, `applyToggleAll`) into a
    small testable module; unit-test each.
  - Component tests: Add Team checkbox default-all, uncheck-one then Done emits `crew_ids` with
    the unchecked crew removed; select-all header toggles; team delete blocked when rules exist
    (error shown, no `onChange` call) and allowed when none; rule delete immediate; Reserve
    Priority vertical layout renders Mon→Sun with the appended default text.
- **Playwright** (`e2e/gantt/`): a scenario-parameters spec driving the real dialog via the
  `scenario-page` helper:
  - Reserve Priority tab shows the appended default text and stacked weekday inputs.
  - Add Team: header select-all checked by default; uncheck one crew; Done; reopen the team →
    the unchecked crew stays unchecked (selection persisted).
  - Delete a team that has a rule → deletion blocked with the rule name in the error; delete the
    rule, then the team → succeeds.

## Out of scope / notes

- No changes to scenario parameter save/load contracts (`live-server` `cleanTeamRules` is a JSON
  passthrough).
- No solver changes — `crew_ids`/`pairing_ids` already match the `TEAM_RULES.json` contract.
- Immediate deletes have no undo (accepted).
- Existing persisted teams/rules (legacy, `crew_ids` absent) remain readable; reopening migrates
  them to the explicit-array form on next Done.
