# Rule 7507 — Min GDOs with fly/reserve day filters

## Goal

Rule **7507** clones **7505** (minimum guaranteed days off in an RP), then adds four parameter columns after **Count Layover**. A band row applies only when the crew’s period fly-day and reserve-day counts fall inside the row’s ranges; matching rows then apply the same Min DO logic as 7505.

## Param header

Existing 7505 columns through **Count Layover**, then:

| Column | Meaning |
|--------|---------|
| NUM FLY DAY | `[lo,hi]` range of crew-base-local calendar days with a matching fly assignment |
| FLY ASSIGNMENTS | `\|`-separated **assignment** codes (e.g. `FLY`); `*` / empty = no fly filter |
| NUM RESERVES | `[lo,hi]` for reserve-day count |
| RES ASSIGNMENTS | `\|`-separated assignment codes; `*` / empty = no reserve filter |
| Leave Assignments / Leave Days Range | unchanged from 7505 |

## Counting

- Window = same as 7505 for the path (Live/Scenario crew-local RP; PBS scenario RP ordinals).
- Day bucket = crew-base local calendar day.
- A day counts for FLY/RES if **any** activity that day has `assignment` in the corresponding code list (not `assignment_group`).
- Outside either active range → skip row (same pattern as RP / Leave Days Range).

## Seed

- Instance `7507/001`, `rule_id` `7507001`, soft DO-category.
- **One wildcard template row** only; full bands filled later.
- Worksets **103** and **433**.

## Paths

| Layer | Touch |
|-------|--------|
| Rust | Extend `DaysOffRow`; `count_assignment_days`; `check-7507` CLI |
| PBS | `rule_params` / gates / Engine `days_off_rules_7507` |
| Live | `rule7507` → `check-7507`; deps map |
| Gantt | crew-bell-only; Help stub |

## Non-goals

- Changing 7505 semantics/columns.
- C++ 7507 oracle (none exists).
