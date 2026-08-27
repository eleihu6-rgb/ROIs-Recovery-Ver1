# Rule 7504 — Unit RH vs CD

Date: 2026-07-21  
Status: approved for implementation

## Goal

Read `Unit` from 7504 `param_json`. **RH** keeps the existing hour-gap path. **CD** uses crew-base calendar days (C++ `CheckMinRest` formula). RH and CD are fully forked — CD must not change RH behavior.

## Formulas (C++)

Source: `CheckMinSpaceBetweenDutyForF8RuleParam::CheckMinRest`

| Unit | Violate when |
|------|----------------|
| RH | `gapEnd < gapStart + minPeriod * 3600` |
| CD | `gapEnd < localDayStart(gapStart, offset) + 1d + minPeriod * 1d` |
| other | no check (pass) |

## Timezone (locked)

- **Crew-base** `offset_min` for CD day boundary (same as WOCL classification in Rust).
- C++ uses gap-start **airport** offset — intentional divergence, documented (same class as WOCL base-TZ simplification).

## Isolation

| | RH | CD |
|--|----|----|
| Rust API | `check_min_space_wocl` **unchanged** | new `check_min_space_wocl_cd` |
| CLI | `--unit` default `RH` | `--unit CD` |
| TSV col 6 | minutes | calendar days |
| Message | `is HH:MM less than N RH` | `is D less than N CD` |
| DB unit | `HOUR` | `DAY` |
| Solver `engine.rs` | unchanged this round | not wired |

`D = floor((gapEnd - localDayStart(gapStart, offset)) / 86400) - 1` (matches CD threshold; may be negative).

## Change sites

1. `rule-engine-rs`: `check_min_space_wocl_cd` + `check-7504 --unit`
2. `live-server/scripts/legality-recheck-core.mjs` → `rule7504`
3. Harness / `persist-7504-violations.mjs`
4. Unit tests: RH assertions unchanged; add CD cases

## Non-goals

- Do not refactor RH loop into a shared “actual” semantic.
- Do not change PBS `engine.rs` 7504 path this round.
