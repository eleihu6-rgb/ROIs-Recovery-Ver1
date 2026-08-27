# Playwright Live Stream Viewer — Design

> Date: 2026-06-22
> Status: Approved (brainstorming) → ready for plan
> Module: ai-server (relay + viewer) + e2e (producer lib) + crew-bids runner (first consumer)

## Goal

When a user triggers a headed Playwright job from R'Bot (e.g. `create_crew_bids`) **from another PC**,
let them **watch the headed browser at full size on their own PC**. The headed browser runs on the
ai-server host, so the user can't see it locally today. We stream the browser's frames to a full-page
viewer they open from the chat reply.

**Universal, not crew-bids-specific.** Build a reusable "Playwright Live Stream" subsystem; crew-bids
is its first consumer. Future Playwright jobs (regression runner, other sims) plug in with ~3 lines.

Non-goal: interaction/takeover (view-only). Non-goal: persisting recordings (Playwright already records
video/trace separately). Non-goal: token-cost — this is pure infra, **no LLM tokens** involved.

## Architecture (three bounded units + thin consumers)

```
 PRODUCER (e2e, any spec)            RELAY (ai-server, generic)        VIEWER (generic page)
 e2e/utils/live-stream/              ai-server/src/live/               served by ai-server
  attachLiveStream(context)           registry id→meta/status/token     full-page <canvas>
  • env-gated by PW_STREAM_URL        {id}/ingest  (WS in)              connects {id}/stream
  • CDP Page.startScreencast    ──►   {id}/stream  (WS out)      ──►    paints frames,
  • pushes meta/page/frame/end        {id}/watch   (HTML page)          shows kind·title·status
                                      GET /streams (list active)
        ▲ PW_STREAM_URL set by…              ▲ register_stream() → {id, token}
   crew-bids runner (now) · regression runner (later) · future jobs
```

### Unit 1 — Producer (`e2e/utils/live-stream/`)

- A Playwright **fixture extension** (`test.ts`) that overrides the `context` fixture: if
  `PW_STREAM_URL` is set, calls `attachLiveStream(context)`; otherwise a no-op. Specs opt in by
  importing `test` from here instead of `@playwright/test`. CLI runs (no env) are byte-for-byte
  unchanged.
- `attachLiveStream(context)`:
  - Opens a WS client to `PW_STREAM_URL`. Sends `{type:'meta', kind, title}` from
    `PW_STREAM_KIND`/`PW_STREAM_TITLE`.
  - For the active page and any new page (`context.on('page')`): open a CDP session
    (`context.newCDPSession(page)`), `Page.startScreencast({format:'jpeg', quality, maxWidth,
    maxHeight, everyNthFrame})`. On each `Page.screencastFrame`: **ack immediately**
    (`Page.screencastFrameAck`, required or CDP stalls), then forward `{type:'frame', data:<base64>}`.
  - On page main-frame navigation: emit `{type:'page', title, url}`.
  - On context close: emit `{type:'end'}` and close the WS.
- **Back-pressure:** never `await` a frame send; if `ws.bufferedAmount` exceeds a cap, **drop** the
  frame. If the WS is closed/erroring, drop silently. Streaming MUST NOT stall or fail the run.
- **Throttle defaults (env-overridable):** `maxWidth 1280, quality 55, everyNthFrame 2`.

### Unit 2 — Relay (`ai-server/src/live/`, generic — knows nothing about bids)

- **Registry** (in-memory, process-local, mirrors the existing run registry):
  `id → {kind, title, status:'live'|'ended', token, startedAt, viewerCount, lastFrame|None}`.
  `register_stream(kind, title) -> {id, token}` (id = `uuid4().hex[:12]`, token = `secrets`-random).
- **WS `/ai/live/streams/{id}/ingest`** — the producer connects (loopback). Updates meta/page,
  stores `lastFrame`, broadcasts frame to viewers. On disconnect/`end` → status `ended`.
- **WS `/ai/live/streams/{id}/stream?token=…`** — viewers connect. Token required. On connect: send
  current meta + `lastFrame` (so a late joiner paints immediately), then live frames + page/end events.
- **HTTP `GET /ai/live/streams/{id}/watch?token=…`** — serves the viewer HTML (token embedded for the
  WS). Unknown id → 404; bad token → 403.
- **HTTP `GET /ai/live/streams`** — list active streams (id, kind, title, status, viewerCount) for a
  future "live runs" panel.

### Unit 3 — Viewer (generic full-page HTML/JS, served by ai-server)

- Self-contained page (no build step, no gantt dep). Connects to `{id}/stream?token`, paints frames
  into a full-window `<canvas>` (letterboxed to aspect). Slim top bar: kind · title · status ·
  current page · viewer count. States: "waiting for first frame…", "live", "disconnected, retrying",
  "stream ended". Auto-reconnect with backoff.

### Consumer wiring (crew-bids — the only bids-specific part)

- `start_run` → `register_stream("crewbids", "<base> · <ranks> · <period>")` → `{id, token}`.
- Sets `PW_STREAM_URL=ws://127.0.0.1:3005/ai/live/streams/{id}/ingest`, `PW_STREAM_KIND`,
  `PW_STREAM_TITLE` on the Playwright env in `run_crew_bids`.
- Crew-bids spec: one-line import swap to the extended `test`.
- Chat reply / `get_run` payload gains `watchUrl = /ai/live/streams/{id}/watch?token=…`.
- Regression runner later: identical 3 lines.

## Error handling (streaming is best-effort; the run is sacred)

- Producer WS down/refused → drop frames, **run keeps placing bids**.
- No viewers → relay keeps only `lastFrame`, drops the rest. (Future: signal producer to pause
  screencast when `viewerCount==0`; not in MVP.)
- Run finishes/crashes → `end` or WS close → status `ended` → viewers show "stream ended".
- ai-server restart → registry lost (same trade-off as today's run registry) → viewer shows
  disconnected then not-found. Acceptable.
- Concurrent streams (e.g. YYC + YUL) → distinct ids/tokens, independent viewers, no interference.

## Security (matches repo data-safety rules)

- Frames show real crew schedules → **sensitive**. Per-stream **random token** required on the watch
  page and the stream WS. Frames live **only in memory (latest frame)** — never written to disk or
  logged. Token dies when the stream ends. No external egress — relay is the user's own ai-server,
  reachable from their PC over the LAN exactly as the portal already is, gated by the token. Ingest WS
  expects loopback (producer is a local subprocess).

## Test plan (§Playwright-Required / §No-Illusion / §Simulate-User)

1. **Relay** — pytest + FastAPI `TestClient` WebSocket: `register_stream` issues id+token; frames sent
   on ingest fan out to a connected viewer WS; viewer with missing/wrong token is rejected; a
   late-joining viewer receives the stored `lastFrame` + meta.
2. **Producer** — `node --test`: `attachLiveStream` is a **no-op without `PW_STREAM_URL`**; with a fake
   local WS server it emits `meta` → `frame` → `end`, and **drops without throwing** when the sink is
   gone.
3. **E2E smoke (real UI, the gate)** — a small headed streamed spec drives ONE real portal page with
   `PW_STREAM_URL` set while a **Playwright-opened viewer tab** asserts the canvas receives ≥N
   non-blank frames and the status bar shows a page title. Proves the whole path without all 24 crew.
   This is the passing test that ends the work.

## Build order

1. Relay module + pytest.
2. Producer lib + fixture + node tests.
3. Viewer page.
4. Crew-bids consumer wiring + chat link + route test.
5. E2E smoke (real UI) — the completion gate.
6. Docs + skill update.

## Versioning

ai-server change → `BACKEND_VERSION +1` (the viewer HTML is served by ai-server, not a
gantt/portal/packages-ui frontend module). E2E/test files don't bump.
