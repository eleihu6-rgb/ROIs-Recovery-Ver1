# Rule 7505 Crew Teams Filtering Design

## Summary

Rule 7505 structured rows must support non-wildcard `Teams` / `Crew Teams` filters the same way rule 7504 does in the PyO3 PBS adapter. A 7505 row with `*` applies to all crews. A row with explicit teams applies only when the checked crew has at least one matching `crew_teams` value.

## Behavior

- Keep the core Rust 7505 days-off calculation unchanged.
- Apply team filtering in the PyO3 structured 7505 scope check before passing matching rows to the core 7505 kernel.
- Match explicit team values case-insensitively against `crew_teams[crew_idx]`.
- If a 7505 row has explicit teams but no crew-team context is available, fail loudly with `ValueError` instead of silently skipping the row.
- Preserve existing base, rank, and fleet qualification matching.

## Tests

- Non-wildcard 7505 team matching a crew team emits the expected 7505 violation.
- Non-wildcard 7505 team not matching the crew skips that row.
- Wildcard `*` 7505 team behavior remains unchanged.
- Explicit 7505 team without `crew_teams` context raises `ValueError`.

## Delivery

- Change only `rule-engine-rs` PyO3 adapter behavior and focused tests unless adapter inspection shows a forwarding gap.
- After the `rule-engine-rs` commit is pushed, update the nested `pbs-engine` rule-engine submodule pointer, then update the root `rois-ai` submodule pointers.
