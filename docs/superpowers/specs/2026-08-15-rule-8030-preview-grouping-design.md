# Rule 8030 Preview Grouping Design

Status: approved and implemented

## Goal

When a draft assignment returns one rule 8030 finding per affected crew member
for the same rule instance and pairing, show one confirmation card instead of
one visually duplicated card per crew.

## Design

- Group only pairing-targeted 8030 findings.
- Group key: rule code + rule instance (`ruleName`) + pairing id + parameter-row
  prefix from the message.
- Keep the shared flight-level condition once.
- Parse each finding's crew id and age into a member list.
- Count grouped cards, not raw findings, in the Soft/Warning/Error summary.
- Preserve the existing message-level deduplication for every other rule.
- Render through the shared shell-mounted `RuleConfirmDialog`, so Live and
  Scenario use the same presentation.

## Verification

- Pure unit coverage for same-pairing grouping, pairing separation, and
  non-8030 deduplication.
- Playwright drives a real Scenario pairing-to-roster drag and asserts one
  8030/001 card with both crew ids and ages.
