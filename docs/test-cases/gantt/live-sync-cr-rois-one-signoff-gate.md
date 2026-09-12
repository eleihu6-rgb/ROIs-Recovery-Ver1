# Live pane-sync — cr.rois.one is the sign-off gate

**Rule (per root/global CLAUDE.md):** any change that affects Live real-time pane
sync (flight → pairing → roster propagation, locks, manday push) MUST be
validated against **`https://cr.rois.one/altair/live`**, not only localhost,
before it is called done. Localhost passing is necessary but **not sufficient**.

## Why localhost alone is not enough

The browser WebSocket upgrade behaves differently over the proxy/tunnel than on
localhost:

- On localhost the browser's `Origin` is a localhost origin, which the
  live-server CSWSH guard (`isAllowedWsOrigin`, `live-server/src/plugins/websocket.ts`)
  always allows — so the realtime channel is up regardless of the guard's
  cross-origin logic.
- Over `cr.rois.one`, vite's ws proxy uses `changeOrigin: true`, so live-server
  sees `Host: 127.0.0.1:3000` while the browser `Origin` is `https://cr.rois.one`.
  The `Origin === Host` branch can never match; the handshake is only allowed
  because `https://cr.rois.one` is in the `CORS_ORIGIN` allowlist.

A ws-upgrade regression (a 403, a proxy/CSP change, an allowlist drop) is
therefore **invisible on localhost** and only reproduces over the tunnel. This
is the exact gap that let a real bug ship: the flight puck got its ghost bar but
already-open pairing/roster panes stayed stale until a full reload.

## What guards it now

1. **`window.__ganttTest.wsConnected()`** (`gantt/src/utils/gantt-test-hook.ts`)
   exposes `wsClient.isConnected()`.
2. **The spec asserts the socket is open before relying on live push.**
   `e2e/tests/gantt/duty-node-dialog-atd-sync.spec.ts` polls `wsConnected()` →
   `true` before the first pane-sync assertion, so a ws-403 regression fails with
   a clear message instead of an opaque 20s poll timeout.
3. **The client-side fallback poller does not mask it.** `GanttSyncManager` now
   catches missed events over HTTP every 15s when the socket is down — which
   would otherwise let panes recover and hide a ws regression. The explicit
   `wsConnected()` assertion checks the primary channel directly, so the fallback
   cannot conceal a broken socket.

## How to run the gate

```bash
# from e2e/
# localhost (fast inner loop)
GANTT_BASE_URL=http://localhost:5567 GANTT_API_URL=http://127.0.0.1:3000 \
  npx playwright test --config=config/playwright.config.ts --project=gantt \
  tests/gantt/duty-node-dialog-atd-sync.spec.ts --reporter=list

# cr.rois.one (SIGN-OFF GATE — must pass)
GANTT_BASE_URL=https://cr.rois.one GANTT_API_URL=https://cr.rois.one \
  npx playwright test --config=config/playwright.config.ts --project=gantt \
  tests/gantt/duty-node-dialog-atd-sync.spec.ts --reporter=list
```

Last verified 2026-09-11: both pass (localhost 14.4s, cr.rois.one 18.1s).

## Known pre-existing, unrelated failures

`e2e/tests/gantt/flight-delay-pairing-roster-propagation.spec.ts` Scenarios 1 & 2
(`buildRoundTripPairing`, flights 153914/153913) fail on **both** localhost and
cr.rois.one — a fixture-state issue (the flights are already consumed), NOT a
ws/tunnel regression. Scenarios 3 & 4 (crewed, pairing 611) pass on both and are
the roster live-sync proof. Fixing 1 & 2 is separate fixture work.
