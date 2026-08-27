# Design: Align 7505/7507 Count Layover with C++

## Problem

C++ `howManyDaysOffInRanges` (`MinimumDaysOffForCARSRule.cpp`):

1. Paints each roster across its span onto crew-base-local calendar days.
2. When **Count Layover=Y** and the roster is a multi-duty pairing: for each consecutive duty pair whose local-day gap is **> 1**, overwrite the middle calendar days with assignment `LAYOVER` (clear other codes) and treat them as days off.
3. When **N**: those middle days stay painted as the pairing’s working code (not blank, not DO).
4. Day classification: a sole `LAYOVER` assignment always counts as a day off (the Y/N flag only gates **synthesis**, not classification of an existing LAYOVER code).

Today:

- Live/Scenario `check-7505` R-lines **drop** Count Layover; Rust parses `count_layover: false` always.
- Live feeds **segment-level** activities → inter-duty gaps are blank → with Count Blank=Y they inflate days off (closer to C++ **Y**, opposite of F8’s **N**).
- PBS PyO3 already passes the bool, but builds one activity per pairing and never synthesizes LAYOVER for **Y**.

## Approach

Shared Rust kernel in `count_days_off`:

1. Paint activities as today.
2. **Pairing-span fill**: for activities sharing `pairing_id`, fill empty local days from min(start)…max(occupy_end) with a representative working activity (C++ roster-level paint) so Count Layover=N does not treat gaps as blank-DO.
3. **Layover synthesis** when `count_layover`: overwrite middle days between consecutive duties (same pairing) with synthetic `LAYOVER` (C++ clear+push).
4. Classification: sole `LAYOVER` always counts as DO; `count_layover` is not required for that branch.

## Wire format

- Live/Scenario R-line: optional trailing `count_layover` (0/1) after `unit` (16-col → col 16; 22-col 7507 → col 22). Missing → false.
- A-line: optional `pairing_id` after rest secs.
- PBS: existing `days_off_rules` tuple bool unchanged; emit duty-level `Activity7505` with `pairing_id` when `pairing_duty_*` present.

## Out of scope

- F8 param_json value changes (remains N).
- C++ `layoverTimemode=LOCAL TIME` per-airport offset (keep crew-base offset).

## Intentional fidelity change

With F8 Count Layover=N, Live multi-duty pairings will report **fewer** days off than the previous blank-gap behavior (gaps become working, matching C++).
