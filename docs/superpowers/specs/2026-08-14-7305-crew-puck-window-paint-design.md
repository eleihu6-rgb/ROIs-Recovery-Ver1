# Design: Crew-level violation pucks respect time window (7305)

**Date:** 2026-08-14  
**Status:** approved — implemented 2026-08-14  
**Scope:** Gantt Live + Scenario puck “!” badges (§Gantt-Unify)

## Problem

Scenario 740 / crew 13645 has one rule **7305** finding:

- Message window: `[2026-08-31, 2026-09-05]` (correct)
- Persisted `pairing_id = null` because the consecutive run starts on a ground RES row

Frontend maps `pairing_id == null` → `targetType: 'crew'`. In `buildViolationMap` / `buildLiveViolationMap`, the crew branch bumps **every** roster task for that crew with no `start_dt`/`end_dt` filter. Result: “!” on all September pucks even though only Aug 31–Sep 5 is in violation.

7505/7507 avoid this via `CREW_BELL_ONLY_RULES` (bell only). 7305 should still mark the duties inside the consecutive span, so bell-only is the wrong product choice.

## Goal

For crew-targeted violations that carry a usable paint window (`window_*` or `start`/`end`):

- Paint puck “!” only on that crew’s tasks whose schedule interval overlaps the window
- Keep crew-row bell / Alert Center unchanged (still show the finding)
- Align puck-hover tooltip with the same overlap rule (no “!” tooltip on out-of-window pucks)
- Live and Scenario share the same behavior

## Non-goals

- Do not add 7305 to `CREW_BELL_ONLY_RULES`
- Do not change Rust 7305 pairing_id persistence in this change
- Do not change severity / message / recheck persistence schema

## Approaches considered

| | Approach | Pros | Cons |
|---|---|---|---|
| **A (chosen)** | Crew-branch paint uses existing `pairingTasksOverlapViolationWindow` | Minimal; reuses 7501/8002 window helper; Live+Scenario one pattern | Crew rules with no window still paint all tasks (legacy) |
| B | Mark 7305 crew-bell-only | Tiny change | Loses in-span puck cues planners want |
| C | Persist a pairing_id from the run in the engine | Frontend stays naive | Misses ground-only runs; still wrong if first duty is ground |

## Design

### Paint maps (§Gantt-Unify)

In both:

- `gantt/src/components/gantt/source/scenario-gantt-source.ts` → `buildViolationMap` crew branch
- `gantt/src/components/gantt/source/live-gantt-source.ts` → `buildLiveViolationMap` crew branch

Replace “bump all crew tasks” with per-violation:

1. Skip `isCrewBellOnlyRule` / severity ≤ 0 (unchanged intent)
2. For each crew task, `continue` unless `pairingTasksOverlapViolationWindow([task], v)`
3. `bump(task.id, v.severity)`

`resolveViolationPaintWindow` already prefers `windowStartDt`/`windowEndDt`, and Scenario `toPersistedViolation` already sets those from `window_* ?? start_dt/end_dt`, so 7305 rows get Aug 31–Sep 5 without a schema change.

If the window is missing/invalid, `pairingTasksOverlapViolationWindow` returns `true` → keep legacy full-crew paint for other crew-level findings.

### Tooltip

In `violation-tooltip.tsx`, when matching `targetType === 'crew'` on **puck** hover, also require `pairingTasksOverlapViolationWindow([task], v)` (same helper). Crew-header / bell hover stays crew-wide (list all crew findings).

### Tests

Extend `gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts`:

- Crew-target 7305 with `windowStartDt`/`windowEndDt` = Aug 31–Sep 5: in-window task gets badge; out-of-window September task does not; crew severity map still lit
- Mirror Live + Scenario builders
- Optional tooltip unit: puck outside window does not list the crew 7305 row

Optional Playwright (scenario 740 / crew 13645) only if unit coverage is insufficient for §Playwright-Required UI surface — unit map tests prove the badge map the canvas reads; prefer unit first (§Minimal-First).

## Success criteria

- Crew 13645 scenario 740: “!” only on duties overlapping `[2026-08-31, 2026-09-05]` (ground RES + CRAM in span), not later Sep DO/CRAM/CRPM
- Crew bell still shows for 7305
- Existing 7505 crew-bell-only and 7501 window tests remain green

## Risks

- Other crew-target rules that relied on painting the whole month will start respecting windows when `start_dt`/`end_dt` are present — intended correction, not a regression for 7305; call out if any rule needs full-crew paint despite having dates (none known)
