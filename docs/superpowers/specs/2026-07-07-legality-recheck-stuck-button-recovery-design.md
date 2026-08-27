# Legality Recheck — recover from a stuck "Checking legality…" state

**Date:** 2026-07-07
**Status:** Approved, pending implementation plan
**Scope:** `gantt/src/components/legality/scenario-recheck-indicator.tsx`,
`gantt/src/components/gantt/source/scenario-gantt-source.ts`,
`gantt/src/services/scenario-legality-api.ts`,
`gantt/src/components/legality/legality-recheck-indicator.tsx`

## 1. Problem

Scenario #535's Recheck button spun forever and its Alert dialog showed "Checking
legality…" indefinitely. Root cause (see chat log / `scenario.legality_status` DB
row): the persisted status had been pinned at `COMPUTING` for ~10 hours because the
detached compute child process died without going through the code's own
exit/error handlers (which only catch *thrown* JS errors or a clean non-zero exit,
not an externally-killed process). Manually re-running
`node scripts/scenario-legality.mjs 535` fixed that one scenario, but the
**frontend** has no way for a user to recover from this themselves:

- The Recheck button is `disabled={computing}` — permanently disabled while
  `status` is `COMPUTING`/`PENDING`, with no escape hatch.
- Scenario's poll (`pollScenarioLegality`) has no notification on settling —
  the user has to notice the indicator text change themselves.
- Live's own recheck button (`legality-recheck-indicator.tsx`) has the same
  shape of bug: it silently stops polling after 200×1.5s (5 minutes) with no
  notification and no button recovery — the button also just stays disabled
  until the component remounts.

Backend note: **no backend changes are required.** Both recompute endpoints
already handle being re-triggered correctly:
- Scenario's `forceRecompute` (`live-server/src/services/scenario/legality-status.ts`)
  unconditionally flips status to `COMPUTING` and spawns a fresh compute
  regardless of current status — this is exactly what fixed scenario #535 by hand.
- Live's `POST /recheck` (`live-server/src/routes/rule/legality.ts`) either
  genuinely restarts (if its 30-minute Redis dedupe key has expired) or
  harmlessly no-ops and returns `{status: 'computing'}` — the frontend's
  `onRecheck` doesn't inspect that response, it just calls `startPolling()`
  either way, which is the correct recovery behavior already.

The gap is entirely in the frontend: no way to force a retry when the button
is stuck disabled, and no notification when a recheck (auto-observed or
manually triggered) finishes.

## 2. Design

### 2.1 Stuck-timer → re-enable the button

Each recheck indicator hook tracks, client-side, the timestamp when `computing`
first became `true` (a ref, reset to `null` whenever `computing` flips back to
`false`). On an interval tick, if `now - startedAt` exceeds a threshold, a new
`stuck` boolean flips to `true`. The button's `disabled` condition becomes
`computing && !stuck` (previously just `computing`).

Thresholds (chosen generously — well above real run times, so a merely-slow
but healthy check is never mistaken for stuck):
- **Scenario: 90 seconds** — real scenario computes finish in seconds (confirmed
  manually: scenario #535 took ~2s end-to-end for an empty ruleset).
- **Live: 10 minutes** — Live's recheck walks the whole live roster over a wide
  date window, sequentially invoking 9 rule binaries; this is a legitimately
  multi-minute operation.

Once `stuck` is `true` while still `computing`:
- The Recheck button becomes clickable again (still shows the spinning icon —
  a check IS still nominally in progress from the server's point of view).
- The status label gets a hint appended, e.g. `"Checking legality… (taking
  longer than usual — click Recheck to retry)"`.

Clicking Recheck in this state re-POSTs the recheck endpoint, resets the
stuck-timer to `null`/restart, and restarts polling — using the exact same
code path as a normal (non-stuck) click.

### 2.2 Notify on settle

When a poll transitions status to `READY` (scenario) / `done` (Live) or
`FAILED`/`failed`, fire a toast via the existing `@/utils/notify` utility:
- Success: `notify.success('Legality recheck complete')` (Live already does
  this — `notify.success('Legality recheck done')` — reuse the same wording
  style, scenario gets the equivalent).
- Failure: `notify.error(errorText ?? 'Legality recheck failed')`.

This is centralized in the shared poll function so it fires whether the
in-progress check was first observed passively (page load / mount) or
started by a manual click — matching Live's existing precedent (Live already
notifies from its mount-time `startPolling()` call, not just the manual one).

For Scenario, this means adding the notify calls to `pollScenarioLegality`
(`gantt/src/services/scenario-legality-api.ts`) itself, so both call sites
(`scenario-gantt-view.tsx`'s mount-time load and `scenario-gantt-source.ts`'s
`useLegalityRecheck.onRecheck`) get it for free.

### 2.3 Live's silent poll-cap give-up

`legality-recheck-indicator.tsx`'s `startPolling` currently stops after
200 polls × 1500ms = 5 minutes, silently, with no notification and no way to
resume except a full remount. This cap is shorter than the new 10-minute
stuck-threshold from 2.1, which would leave a confusing window (5–10 min)
where polling has already stopped but the button doesn't yet look "stuck."
Raise the cap so it doesn't lapse before the backend's own 30-minute Redis
dedupe TTL, and if it does exhaust without settling, notify the user
(`notify.error('Still checking — click Recheck to retry')`) instead of going
quiet.

### 2.4 Out of scope

- No backend changes (see §1).
- No change to Scenario's poll interval/cap — it's a cheap Postgres read and
  currently has no cap; leaving it uncapped is fine and not part of this fix.
- No change to the 7-day idle sweep or to adding a server-side reconciliation
  watchdog for genuinely-killed compute processes — that's a separate,
  larger backend design (flagged in chat, not requested for this pass).

## 3. Testing

Per this repo's testing discipline, both affected surfaces need Playwright
coverage:
- Scenario: mock `/api/scenario/:id/legality` to stay `COMPUTING` past the
  90s threshold (using Playwright's clock-mocking API to fast-forward
  deterministically rather than a real 90s wait), assert the Recheck button
  becomes enabled and the label shows the "taking longer than usual" hint;
  then mock the POST recheck + a subsequent `READY` response and assert a
  success toast appears.
- Also cover the failure path (`FAILED` status → error toast).
- Live: same shape, reusing `legality-recheck-indicator.tsx`'s existing
  `data-testid`s (`legality-recheck-indicator`, `legality-recheck-now`).

The implementation plan should confirm exactly how to fast-forward the
client-side stuck-timer deterministically in Playwright (clock mocking vs.
an injectable/short threshold in test builds) before writing the tests.
