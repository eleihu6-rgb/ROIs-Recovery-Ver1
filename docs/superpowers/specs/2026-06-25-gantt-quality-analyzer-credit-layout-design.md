# Gantt Quality Analyzer Credit Layout Design

## Context

The Scenario Roster Quality Analyzer currently shows five detail columns:

- Crew ID
- Base/Rank
- Lead-in CRD
- Awarded credit
- Finding detail

The `Lead-in CRD` column consumes horizontal space but is not needed in the requested analyzer view. The `Finding detail` cards need more room. The existing quality computation also separates:

- lead-in ground credit
- pre-assignment pairing credit
- solver pairing credit

The requested business wording is:

- All pre-assignment credit comes from Live before optimization.
- `Before opt` should report that live pre-assignment credit.
- `After opt` should report newly added optimization result credit only, including both pairings and reserve duties when they carry credit.

## Goals

1. Remove the visible `Lead-in CRD` column from the Quality Analyzer table.
2. Make `Crew ID` and `Base/Rank` compact dynamic/fixed-content columns so the detail column receives the remaining width.
3. Preserve `Before opt` as live pre-assignment credit.
4. Change `After opt` to include only newly added `source='CR'` credit:
   - solver-assigned pairings
   - credit-bearing RES/SBY ground duties
5. Keep the computation client-side because the loaded scenario data already contains the needed assignments, pairing segments, and ground item credit.

## Non-Goals

- Do not add backend API fields.
- Do not change the quality rule definitions or affected-crew counts.
- Do not add airline-specific hardcoded logic.
- Do not change the left-side rule navigation behavior.

## Data Semantics

### Before Opt

`Before opt` is the total credit for live pre-assignments carried into the scenario.

Implementation source:

- Pairing assignments where `assignment.source === 'leadin'`.
- Credit remains calculated from pairing segments by distinct `dutySeq`, matching the existing de-duplication behavior.

Lead-in ground credit will no longer be displayed as a separate column. It should not be silently added to `Before opt` unless the data model explicitly represents it as a pre-assigned pairing or a later confirmed pre-assignment source. This avoids mixing contextual lead-in ground items with the requested live pre-assignment credit.

### After Opt

`After opt` is newly added optimization result credit only.

Implementation source:

- Pairing assignments where `assignment.source === 'CR'`.
- Ground items where `ground.source === 'CR'`, the duty is reserve/standby by existing `isReserveStandby()` logic, and `actCreditedMinutes > 0`.

This includes optimized reserve duties that are not represented as pairings but carry credit. It excludes day-off, leave, training, sim, and other non-reserve ground items from the awarded-credit total.

## UI Design

The analyzer table should use a stable width strategy:

- `Crew ID`: compact width, mono tabular text, enough for current crew identifiers.
- `Base/Rank`: compact width, mono text.
- `Awarded credit`: compact but stable width for the two-line Before/After display.
- `Finding detail`: flexible column that consumes remaining width.

The table header becomes:

- Crew ID
- Base/Rank
- Awarded credit
- Finding detail

The removed `Lead-in CRD` value should not appear elsewhere in the dialog.

## Files

Expected implementation files:

- `gantt/src/components/panes/quality-analysis-dialog.tsx`
- `gantt/src/components/scenario-gantt/quality-analysis.ts`
- `gantt/src/components/scenario-gantt/__tests__/quality-analysis.test.ts`

Potential documentation/help follow-up:

- `gantt/src/components/help/topics/scenario/scenario-quality.tsx`

The help text currently describes awarded credit as Before/After and may need a wording update if it mentions the removed column or old solver-only behavior.

## Testing

Unit tests should cover:

1. Existing pairing credit de-duplication by `dutySeq` remains unchanged.
2. `Before opt` counts `source='leadin'` pairing credit.
3. `After opt` counts `source='CR'` pairing credit.
4. `After opt` also counts credit-bearing `source='CR'` RES/SBY ground duties.
5. `After opt` excludes lead-in ground, DO, leave, training, sim, and non-reserve ground duties.

Verification commands:

```bash
npm --prefix gantt test -- quality-analysis
npm --prefix gantt exec tsc -- --noEmit
```

If a dev server is running, visually verify the analyzer dialog at desktop width and confirm the `Finding detail` column has more available space.

## Risks

- Some historical fixtures may have used `source='leadin'` ground credit as contextual lead-in. Removing the column makes that credit invisible by design.
- The term `preassignment` depends on current scenario source mapping. If future data introduces a dedicated pre-assignment source distinct from `leadin`, the computation should be extended rather than hardcoding airline-specific behavior.

## Acceptance Criteria

- The Quality Analyzer no longer shows `Lead-in CRD`.
- `Crew ID` and `Base/Rank` do not consume unnecessary horizontal space.
- `Finding detail` receives the freed width.
- `Before opt` shows live pre-assignment pairing credit.
- `After opt` shows only newly added CR credit from pairings and credit-bearing RES/SBY ground duties.
- Quality-analysis unit tests and TypeScript verification pass.
