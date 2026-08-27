# Design: Rule 2015 DO Start Time (7505 / 7507 only)

**Status:** Approved for implementation  
**Date:** 2026-08-16

## Problem

F8 FD allows a pairing to end slightly into the next GDO / blank day at home base without spoiling that day as a day off. Today `count_days_off` paints every local calendar day from duty start through occupy end at **local midnight**, so an end at 00:59 paints that morning as working and can drop Min-GDO counts.

## Solution

Add Definition rule **2015** (`DO Start Time`, `HH:MM`). Only **7505 / 7507** `count_days_off` (including pairing span-fill) reads it.

### Semantics

- Time base: crew **home-base local** (`offset_min`), same as existing 7505 day math.
- For 7505/7507 (and 2015), **occupy end** is **Duty Release** (duty/debrief end), not per-segment flight arrival; see `2026-08-16-rule-2015-duty-release-occupy-end-design.md`.
- If activity **occupy end** local time-of-day **`<` DO Start**, that calendar day is **not painted** by that end → can remain blank / DO.
- Example: DO Start `01:00`, end `00:59` → day blank/DO eligible; end `01:00` → day occupied.
- **Start-side** unchanged (duty starting 00:30 still paints that day).
- Occupy end still follows Utilize Post Duty Rest (`activity_occupy_end_utc`).

### Missing / unparsable 2015

**Keep today’s DO / blank logic.** Do not skip 7505/7507. Implementation: `do_start_min = 0` → no grace clamp.

### F8 seed

`2015/001` with `01:00`, mapped into worksets that already contain 7505/7507 (103, 433).

Note: `F8-rule.md` §4.4 historically said “默认 30 分钟” duration; product form here is absolute **HH:MM** via 2015.

## Surfaces

| Surface | Wiring |
|---------|--------|
| Live / Scenario | `legality-recheck-core` → `check-7505` / `check-7507` `--do-start-min` |
| PBS / PyO3 | Engine `do_start_min`; load from ruleset 2015 |
| Recheck deps | Editing 2015 → recompute 7505 + 7507 + **1001** (FLY→DO overlap grace) |

## Non-goals

- No changes to 2014, 7501, 7508, 7305, 7506, Gantt empty-cell UI, CC-specific forbid-extension.
- ~~1001 Assignment Overlap~~ — **1001 FLY→DO now consumes 2015** (see [`2026-08-19-rule-1001-2015-fly-do-grace-design.md`](2026-08-19-rule-1001-2015-fly-do-grace-design.md)).
- No change to `count_assignment_days` / leave-day filters (not DO paint).
- Count Layover=Y middle overwrite left as-is this phase (F8 seed Count Layover=N).

## Verification

- Rust unit tests: grace 00:59 vs 01:00; `do_start_min=0` ≡ pre-change; span-fill does not re-spoil.
- Live unit: bin receives `--do-start-min` when 2015 present.
