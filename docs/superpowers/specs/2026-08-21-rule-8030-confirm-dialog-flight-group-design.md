# Rule 8030 Confirm Dialog — Flight-Level Grouping

Date: 2026-08-21

## Goal

Align **RuleConfirmDialog** 8030 aggregation with segment-grain COF (`flt_id`), not pairing attribution.

## Problem

After [segment-grain 8030](./2026-08-20-rule-8030-segment-grain-design.md), evaluation keys on physical flight, but `groupRuleConfirmViolations` still groups by pairing `targetId` and parses the obsolete message shape `Pilot aged N on a flight carrying…`. Engine text is now `Pilot aged N on flight {fltId} carrying…`.

Cross-pairing mates on the same `flt_id` therefore do not merge in the confirm dialog. Multiple flights can also flood the dialog with several 8030 cards.

## Scope

- **In:** Gantt `RuleConfirmDialog` grouping only (`gantt/src/components/roster/rule-confirm-groups.ts` + unit tests; update Playwright if selectors/assertions break).
- **Out:** Alert Center / persisted `rule_violation` rows / recheck / Rust / PBS; preview API contract (`flightId` field); changing engine message format.

## Behavior

1. **Group key (8030, pairing-attributed):** `ruleCode` + `ruleName` + parsed `fltId` (+ optional Row prefix if present). Do **not** use pairing `targetId`.
2. **Same flight, different pairings:** one card; `members` lists each over-age `crewId` + age (dedupe by `crewId`).
3. **Multiple flights with 8030:** keep **only** the group whose members’ earliest `windowStartDt` is smallest (segment start). Drop other 8030 groups from the confirm list. Tie-break: smaller `fltId`, then stable first-seen order.
4. **Missing `fltId` in message:** do not merge across rows; each finding stays its own non-flight group (or fall back to previous per-violation card without members merge). Prefer not inventing a pairing key that falsely merges cross-flight.
5. **Missing `windowStartDt`:** treat as `+Infinity` for “first flight” selection so dated flights win; if all lack dates, keep first group in encounter order after flight grouping.
6. **Shared message:** strip per-crew age; keep flight-level text, e.g. `Row N: Flight {fltId} carrying K crew aged A+ (limit M).` (capitalize after optional Row prefix).
7. **Other rules:** unchanged (message-level dedupe, no members).

## Approach

Frontend-only parse of `on flight (\d+)` from existing engine messages + `windowStartDt` for first-flight filter. No API / schema change.

## Verification

- Unit: same `fltId` different `targetId` → one group with both members.
- Unit: two flights → only earlier `windowStartDt` group remains.
- Unit: non-8030 still message-deduped.
- Playwright: existing 8030 confirm grouping e2e updated if message/grouping assertions assume pairing grain.
