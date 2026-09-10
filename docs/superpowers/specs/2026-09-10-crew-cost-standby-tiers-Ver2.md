# Standby Credit and Configurable GH Tiers

Status: Implementation requested by Ryan; latest parameters supersede the earlier 75-hour example.

- Guaranteed hours: 85, a single configurable floor.
- Marginal overage: credit above 85 through 90 at 1.2 times base hourly pay; credit above 90 at 1.5 times base hourly pay.
- Editable tier rows use contiguous ranges starting at GH, with an unbounded final tier. Add splits the final range; delete merges coverage into the adjacent remaining range. Retain at least one tier. Validate increasing boundaries and nonnegative multipliers before applying/saving.
- Airport standby who flies: `max(0, departure - Y hours - report) * X`, defaults X=0.5 and Y=1. Date/time inputs explicitly use UTC for this prototype and support crossing midnight.
- Standby outputs pay-credit and contractual flight-time-credit hours, not a fixed cash fee and not actual operated block time. Pairing value is added to standby credit.
- Cash = whole-period pay after minus before. Baseline includes any standby credit already owed; remove that baseline entitlement before inserting candidate standby plus pairing credit to prevent duplication. Expose baseline standby credit explicitly. No-flight standby rules remain outside this particular template.
- Default example: 07:00 report, 10:00 departure, 5:45 pairing produces 1:00 standby credit and 6:45 total assignment credit. At USD 100/h, baseline A=84 and B=70 give incremental cash USD 712.50 and USD 0.00 respectively when no standby credit was already included in baseline.
- Use version 2 local configuration; retain old version 1 storage without overwriting it. Version 1 JSON is rejected with a version explanation rather than silently misinterpreted.
- Apply the same model in all three mockups. Recovery fixtures that use reserve teams must sum marginal payroll, never call the old P03 fixed fee.
- Validation: exact GH/tier boundaries, already above threshold, editable GH/rate/multipliers, add/delete/invalid ranges, X/Y changes, zero eligible time, crossing midnight, baseline standby credit, save/reload/import/export, responsive screenshots, and existing booking/quantity/recovery regressions.

Airline comparison rows supplied by Ryan are context, not automatically adopted contract presets. The selected prototype configuration is the explicit 85 / 90 / 1.2 / 1.5 policy above; no claim is made that this is an airline's verified agreement.
