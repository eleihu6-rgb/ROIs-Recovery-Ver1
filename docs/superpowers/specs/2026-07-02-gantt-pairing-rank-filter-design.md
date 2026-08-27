# Gantt Pairing Rank Filter Design

Date: 2026-07-02
Status: Draft for Ryan review

## Goal

Add a `Rank` filter to the Gantt `Pairing` filter tab so planners can narrow pairings by required crew rank and combine that rank with the existing `Division` and `Coverage` controls.

The behavior must be unified for Live and Scenario Gantt. The filter UI and matching rule should be implemented once through the shared filter store/source path, not as separate Live-only and Scenario-only behavior.

## Current Context

The Gantt filter dialog is shared by context and already supports `Crew`, `Pairing`, and `Flight` tabs. Pairing filters currently include label, pairing ID, division, base, fleet, type, origin airport, and coverage.

Pairing records already expose rank-level composition data:

- `pairing.composition[].rank`
- `pairing.composition[].plan`
- `pairing.composition[].fill`

Coverage is currently derived from composition and defaults to `Open + Partial`, matching the planner focus on uncovered work.

## User-Approved Behavior

Use a simple strict filter model while making invalid combinations visible.

The Pairing `Rank` control lists all configured crew ranks, such as `CA`, `FO`, `FA`, and `IFD`. It does not hide or disable ranks based on the selected division.

When a user selects a conflicting division/rank combination, for example:

- `Division = P` with `Rank = FA` or `IFD`
- `Division = C` with `Rank = CA` or `FO`

the system should:

- keep the user selection unchanged,
- apply the filter strictly,
- return zero matching pairings when no pairing can satisfy both values,
- animate the rank control with a short attention motion,
- show an inline warning below the rank control:
  `Invalid rank for selected division. Use P with CA/FO, or C with FA/IFD.`

No auto-clear is allowed. The planner remains in control of the selected filters.

## Filter Semantics

`PairingFilter` gains:

```ts
ranks: string[]
```

Rank filtering is a hard pairing filter:

- empty `ranks` means no rank restriction,
- non-empty `ranks` means a pairing must have at least one composition slot whose `rank` is selected.

Division and rank combine as an AND:

```text
pairing.division is in selected divisions
AND pairing.composition contains a selected rank
```

**Rank-scoped coverage (2026-07-19):** When `ranks` is non-empty, `classifyCoverage` / `coverageMatches` use only composition slots whose `rank` is selected. Empty `ranks` keeps whole-pairing coverage (unchanged). Live hard-hides coverage mismatches when ranks are set (float alone would still show CA-full rows).

Example:

- `Division = P`, `Rank = CA`, `Coverage = Open + Partial` keeps pilot pairings that require CA and whose **CA slots** are open or partial (excludes `CA(1)FO(1:0)`).
- `Division = P`, `Rank = FA`, `Coverage = Open + Partial` keeps the invalid UI state visible and returns zero rows in normal data because pilot pairings do not contain cabin ranks.
- No rank + `Open + Partial` still keeps whole-pairing partials such as `CA(1)FO(1:0)`.

## UI Design

Add a `Rank` row to the Pairing tab after `Division` and before `Base`.

Use the existing `MultiSelectDropdown` and `rankOptions` source. The control should match the Crew tab rank dropdown instead of introducing a new selector pattern.

Invalid combination feedback:

- Add a lightweight validation helper for the dialog, for example `getPairingRankDivisionConflict(divisions, ranks)`.
- Use the reference rank list where possible, but keep the pilot/cabin recommendation explicit:
  - pilot ranks: `CA`, `FO`
  - cabin ranks: `FA`, `IFD`
- When invalid, apply a short CSS animation class to the rank field wrapper.
- Render a compact inline warning below the control.
- Do not use a modal, toast, or blocking confirmation.

The active filter summary should include a `pairing:rank` chip so an empty-result state is explainable from the filter bar.

## Data Flow

Shared filter store:

- add `PairingFilter.ranks`,
- update defaults,
- update equality checks,
- update active count,
- update storage load compatibility so older stored filters without `ranks` load safely,
- update reset and applied snapshot behavior.

Filter dialog:

- initialize and update the local pairing filter with `ranks`,
- render the new rank selector,
- show the chip and invalid-combination feedback.

Pairing matching:

- update the shared scenario predicate `pairingMatchesSharedFilter`,
- ensure Live uses the same rank predicate, or extract a shared helper so the Live legacy pairing pane and Scenario shared pairing pane cannot diverge.

Server query behavior:

- Keep rank filtering client-side for this version.
- Do not add backend filtering or indexes in this pass. That avoids touching live-server and keeps the change surgical.

## Live and Scenario Unification

This is a common Gantt feature. It must be implemented in the shared filter model and shared predicate path so Live and Scenario behave the same.

Known implementation wrinkle: Live pairing pane still has legacy filtering logic for some paths. The implementation should avoid duplicating rank semantics by moving the rank check to a shared helper consumed by both:

- Live pairing pane / Live pairing source
- Scenario pairing source `pairingMatchesSharedFilter`

## Testing

Required automated coverage:

- Unit or focused component/predicate coverage for rank matching:
  - no rank selected keeps pairings,
  - selected rank matches composition,
  - selected rank does not match composition,
  - selected division plus conflicting rank returns no rows.
- Gantt Playwright coverage for real UI:
  - Live Pairing filter can select `Rank = CA` and apply,
  - Scenario Pairing filter can select `Rank = CA` and apply,
  - invalid `Division = P` + `Rank = FA` shows the inline warning and keeps the active chips visible.

Verification commands should include:

- targeted test command for the changed predicate or store tests,
- targeted Gantt Playwright spec,
- `npm run check:ui` because this changes frontend UI styling,
- `gantt/src/version.ts` frontend version bump with the implementation.

## Risks and Constraints

First-paint risk is low because filtering uses already loaded pairing composition. Do not introduce a blocking backend fetch on dialog open or pane first render.

Data-model risk is moderate if any pairing rows lack composition. Empty composition should not match a selected rank.

UX risk is deliberate: invalid combinations are allowed and produce zero rows. The motion and inline message are required so users understand why.

Performance risk is low for loaded rows, but avoid repeated expensive transforms inside render loops. Use small helpers and memoized filtering where the existing pane already does so.

## Out of Scope

- Rank-scoped coverage, such as `CA + Partial` meaning only CA shortage.
- Backend rank query support.
- Changing the existing default coverage selection.
- Auto-clearing invalid rank or division selections.
- Reworking Scenario division-scoping export behavior.
