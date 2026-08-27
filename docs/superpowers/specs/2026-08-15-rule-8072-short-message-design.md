# Design: Shorten rule 8072 Alert Center message

**Status:** Pending user review  
**Date:** 2026-08-15  
**Choice:** Approach 1 — inline message replace in legality recheck only (user selected B for all user-facing surfaces; this path is the sole producer of English 8072 Alert text)

## Problem

Rule 8072 persisted violations show a long English message, e.g.:

> Row 1: The number of crews (2) with valid qualification (*) on flight (,) and acting rank (*) does not meet the requirement (min=0, max=1). Parameters: dep-arr=\*-*, attribute=\*, assignment group=FLY, composition=\*. Current composition plan/fill=0/2.

Planners need a short, scannable Alert Center / violation-dialog line.

## Target message

Keep the existing `withParamRowPrefix(rowIndex, body)` prefix (`Row N:`).

Body only:

```text
Crew count out of range (Current: {qualified}, Allowed: {min}–{max}).
```

Example:

```text
Row 1: Crew count out of range (Current: 2, Allowed: 0–1).
```

Notes:

- Use an en-dash (`–`, U+2013) between min and max, matching the requested copy.
- `{qualified}` / `{min}` / `{max}` are the same values already mapped into `actual_value` / `limit_value` today (`qualified`, `minLimits`, `maxLimits` from `check-8072`).
- Drop qualification / flight / acting rank / parameter / plan-fill prose from the message. Those details remain available via rule instance params and structured violation fields; they are not deleted from the engine.

## Scope (in)

| Area | Change |
|------|--------|
| `live-server/scripts/legality-recheck-core.mjs` | Replace the `rule8072` `message:` template with the short body above |
| `live-server/scripts/__tests__/legality-recheck-core.test.mjs` | Assert the new message shape (replace `/valid qualification …/` match) |
| `e2e/tests/gantt/rule-8072-flight-qualification.spec.ts` | Assert Alert Center / API rows contain the short text instead of `valid qualification` |

## Scope (out)

- Rule evaluation / `check-8072` / Rust `rule8072` semantics — unchanged
- PBS PyO3 machine strings (`8072|segment=…`) — not user-facing English
- Legacy C++ `crewrule-dev/RuleEngine/rule8072.cpp` message — not on the active F8 Live/Scenario path
- Historical design docs that quote the old template — leave as history unless a follow-up doc cleanup is requested
- Recomputing or rewriting already-persisted `rule_violation` rows in SIT/UAT — new wording appears after the next recheck

## Behavior contract

1. Violation detection, anchors (`pairing_id`, `segment_id`, `scope_key`), severity, and numeric fields stay the same.
2. Only `message` text changes.
3. Idempotent `withParamRowPrefix` behavior unchanged.

## Verification

1. Unit: `node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs` (or the project’s usual filter for the 8072 tests) — expect PASS with new message assertion.
2. E2E: `npx playwright test e2e/tests/gantt/rule-8072-flight-qualification.spec.ts --reporter=list` — expect PASS showing the short message in Alert Center / API payload.

## Risks

- Low: any external consumer scraping the old English sentence breaks; none known in-repo beyond the tests listed above.
- Existing DB violations keep the old text until rechecked — expected; not a migration.
