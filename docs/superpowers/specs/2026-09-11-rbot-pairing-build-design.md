# R'Bot → Pairing Build Automation (design)

**Date:** 2026-09-11
**Goal:** Let a planner say a plain-English pairing-build order to R'Bot
("build pairings for ADD 7M8 from 25 Aug to 7 Oct") and land in the existing
**Pairing Build Automation** dialog, pre-filled and already searched, with live
progress and a build summary the planner can act on.
**Touched modules:** `ai-server/` (R'Bot tool + prompt), `gantt/` (chat action,
roundtrip builder store/dialog), `e2e/` (Playwright proof).

## Scope

R'Bot gains one tool, `build_pairings`, mapped to a new `AiAction`
`{ type: 'build_pairings', base, start, end, fleets?, composition?, rules? }`.
The gantt dispatch:

1. sets the Gantt date range to the requested window (the dialog clamps its scope
   to the visible Gantt range, so the window must cover the request);
2. opens `RoundtripBuilderDialog` with a prefill and auto-runs **Find open flights**.

The planner reviews the open-flight list and the rotation count, then presses
**Build all**. Pairing build writes real `pairing` rows (no draft/Save step), so
R'Bot prepares the build and the human commits — consistent with the existing
R'Bot rule that mutations are staged, never committed, on the user's behalf.

## Parameters R'Bot accepts (all plain English)

| Dialog control | Tool input | Notes |
|---|---|---|
| Pairing base | `base` | required; airport code |
| From/To date | `start`, `end` (YYYY-MM-DD) or `month` + `year` | required (one form) |
| Fleet (multi) | `fleets[]` | omitted → `ALL` |
| Crew composition | `composition[]` (`{rank, plan}`) | omitted → dialog default by body type |
| Min rest / multiduty block / check-in / debrief | `restMin`, `maxDutyBlockMin`, `checkinMin`, `debriefMin` | clamped to sane bounds; omitted → profile defaults |
| Single-leg long-haul exemption | `singleLegExemption` | boolean |

If the base or the period is missing, the tool is not called; R'Bot asks for the
missing piece (same pattern as `create_crew_bids`).

## Dialog additions (leverage the existing feature, show progress + summary)

- **R'Bot prepared banner** when the dialog was opened from chat, naming the
  request and telling the planner what to press next (plus the example phrasing).
- **Build progress** card while a run is in flight: `built / requested`, latest
  pairing id, and the same footer `rt-progress` text E2E already reads.
- **Build summary** card after the run: built vs requested, the created pairing
  ids/labels, flights left uncovered by the search, and any build-time warnings
  returned by the service.

## Risks / decisions

- The build is a real write. Kept human-committed on purpose (see above).
- Warnings are currently empty for scoped (roundtrip) builds because
  `pairing-build-service` only runs `validateBuildRules` for unscoped builds.
  The summary surfaces them when present and warns nothing when absent; changing
  scoped-build warning behavior is out of scope.
- Pinning the Gantt date range to the requested window is a visible side effect;
  it is required by the dialog's scope clamp and keeps the built pairs on screen.

## Verification

- `ai-server`: `python -m pytest tests/test_chat_tools.py` (new `build_pairings` cases).
- `gantt`: `npx vitest run src/components/ai-chat/__tests__/dispatch-ai-action.test.ts`.
- `e2e`: `tests/gantt/rbot-pairing-build.spec.ts` — types the plain-English order
  into the real chat input, asserts the dialog opens pre-filled, builds, and shows
  the summary; screenshot under `docs/assets/screenshots/gantt/`.

## Delivered (2026-09-11)

- Tool + prompt + missing-scope dialogue in `ai-server`; action/dispatch/store/dialog in
  `gantt`; rotating chat tip `"build pairings for <base> <fleet>"`.
- **Deliberate UX change:** the dialog now STAYS OPEN through a run (it used to close
  immediately) so the progress card and the final summary are readable; the planner closes
  it with **View Gantt**. `e2e/tests/gantt/roundtrip-builder.spec.ts` was updated for this.
- **Backend robustness fix (required by arbitrary user date ranges):**
  `roundtrip-chooser.chooseRotations()` no longer aborts the whole search with
  "Check-in is outside selected scope" when a single seed rotation's check-in falls before
  the scope start; it skips those candidates and rethrows only when nothing is buildable.
  Probe: ADD 7M8 2026-09-20 → 2026-09-30 went from HTTP 400 to 614 flights / 133 rotations.
- Real-LLM smoke against the restarted local ai-server confirmed plain English →
  `build_pairings` inputs for: date range, month, missing-period question, fleet,
  composition counts and rule overrides.
- Playwright proof ran against the LOCAL stack (this repo's vite + live-server); the public
  `cr.rois.one` target from `e2e/.env` serves older code and was therefore not used.

## Known gaps

- Scoped (round-trip) builds return no build-rule warnings today
  (`pairing-build-service` only validates unscoped builds); the summary surfaces them when
  present and stays silent when absent.
- `roundtrip-builder.spec.ts` cannot pass in the current SIT data state: it needs ≥3
  four-segment ADD rotations departing 2026-09-20 and none remain (confirmed pre-existing
  by re-running with the chooser change stashed).
