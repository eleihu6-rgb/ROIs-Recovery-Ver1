---
name: 117-playwright-live-stream
description: Use when watching a headed Playwright run (e.g. R'Bot's create_crew_bids) live from another PC, or when extending the universal "Playwright Live Stream" subsystem (producer fixture → ai-server relay → full-page viewer). Triggers on "watch the browser", "live stream playwright", "watch the run", "view the headed browser remotely", or adding a new streamed consumer.
---

# Playwright Live Stream — watch a headed run from another PC

R'Bot's ai-server runs the **headed browser on the ai-server host**, not on the PC where the
user typed into chat. This subsystem streams the browser's frames to a full-page viewer the user
opens from the chat reply, so they can watch from anywhere. **Universal:** crew-bids is the first
consumer; any Playwright job plugs in with ~3 lines.

Key fact (answers the common confusion): a `--headed` run launched by R'Bot/ai-server opens its
Chromium window **on the ai-server machine** (verify: `ps -axo pid,ppid,command | grep playwright`
— its ppid is the `com.rois.ai-server` LaunchAgent). The user's chat PC only sends an HTTP request.
"headed" only controls whether a window is *drawn*; bids land regardless of who watches.

## Architecture (3 bounded units + thin consumers)

```
PRODUCER (e2e/utils/live-stream)      RELAY (ai-server/src/live)        VIEWER (served by relay)
 test.ts  = base.extend(context)       registry.py StreamHub              viewer.py VIEWER_HTML
 live-stream.ts attachLiveStream()     routes.py:                         full-page <canvas>,
 frame-sink.ts createFrameSink()        POST /ai/live/streams  {id,token}  derives WS path from
  • env-gated by PW_STREAM_URL          WS   {id}/ingest  (producer in)    its own /watch URL
  • CDP Page.startScreencast      ──►   WS   {id}/stream?token (viewer out)──► (proxy-prefix safe)
  • best-effort: drops/never stalls     GET  {id}/watch?token  (HTML)
                                        GET  /ai/live/streams  (list)
```

## File map

| Purpose | Path |
|---|---|
| Producer fixture (drop-in for `@playwright/test`) | `e2e/utils/live-stream/test.ts` |
| Attach CDP screencast to a context | `e2e/utils/live-stream/live-stream.ts` |
| WS sink (back-pressure, no-op w/o url) — unit-testable | `e2e/utils/live-stream/frame-sink.ts` |
| Relay registry (StreamHub: meta/lastFrame/viewers) | `ai-server/src/live/registry.py` |
| Relay routes (register/ingest/stream/watch/list) | `ai-server/src/live/routes.py` |
| Viewer page (self-contained HTML/JS) | `ai-server/src/live/viewer.py` |
| Crew-bids consumer wiring | `ai-server/src/crewbids/runner.py` (`start_run`/`run_crew_bids(stream)`) |
| Chat watch link | `ai-server/src/chat/routes.py` (`get_run(run_id)['watchUrl']`) |
| Relay tests | `ai-server/tests/test_live.py` (7) |
| Producer unit test | `e2e/tests/live-stream/frame-sink.spec.ts` (4, fake socket) |
| E2E smoke gate (real producer→relay→viewer) | `e2e/tests/live-stream/live-stream-smoke.spec.ts` |
| Real-UI e2e (R'Bot chat → watch link → live frames) | `e2e/tests/gantt/rbot-crew-bids-live-watch.spec.ts` |
| Playwright project | `live-stream` in `e2e/config/playwright.config.ts` (no auth deps) |
| Design spec | `docs/superpowers/specs/2026-06-22-playwright-live-stream-viewer-design.md` |

## Add a new streamed consumer (the universal payoff)

```python
from src.live.registry import register_stream
stream = register_stream("regression", title)          # {id, token}
env["PW_STREAM_URL"]  = f"ws://127.0.0.1:{settings.port}/ai/live/streams/{stream['id']}/ingest"
env["PW_STREAM_KIND"] = "regression"; env["PW_STREAM_TITLE"] = title
watch_url = f"{settings.public_ai_prefix}/live/streams/{stream['id']}/watch?token={stream['token']}"
```
Then the spec imports `{ test, expect }` from `e2e/utils/live-stream/test` (one-line swap) instead
of `@playwright/test`. No env var → identical to stock test (no-op).

## Run the tests

```bash
# relay (no server)            ai-server $ .venv/bin/python -m pytest tests/test_live.py -q
# producer + smoke gate        e2e $ npx playwright test --config=config/playwright.config.ts \
#                                      --project=live-stream --reporter=list
# (smoke needs ai-server :3005 up with /ai/live routes — restart after editing src/live:)
launchctl kickstart -k gui/$(id -u)/com.rois.ai-server
```

## Gotchas (verified)

- **ai-server has reload=False** (LaunchAgent runs `main:app`): after ANY `src/live` or route edit,
  `launchctl kickstart -k gui/$(id -u)/com.rois.ai-server`, else it serves the old routes.
- **Proxy prefix:** nginx maps `/fpqe/ai/` → `:3005/ai/`. The viewer JS derives the stream WS by
  replacing `/watch` → `/stream` on its OWN `location.pathname`, so it works locally (`/ai/live/...`)
  AND tunnelled (`/fpqe/ai/live/...`). Don't hardcode `/ai/live/`. The chat watch URL uses
  `settings.public_ai_prefix` (default `/fpqe/ai`).
- **CDP screencast must ack every frame** (`Page.screencastFrameAck`) or Chromium stops sending.
- **Back-pressure:** never `await` a frame send; drop when `bufferedAmount` exceeds the cap and when
  the socket is closed/erroring. Streaming is best-effort — it must NEVER stall or fail the run.
- **Late joiner:** relay stores only the latest frame (in memory, never disk/log — frames show real
  crew schedules) and replays it + meta on connect, so a viewer joining mid-run paints immediately.
- **Token-gated:** viewer WS + watch page require the per-stream token; dies when the stream ends.
- **Screencast works headless too** — the smoke gate runs headless and still proves the path; only
  the real feature uses `--headed` so a human can watch.
- **Concurrent streams** (e.g. YYC + YUL) get distinct ids/tokens → independent viewers, no clash.
- **Signature change** `run_crew_bids(params, run_id, stream=None)` made the two `test_crewbids`
  fakes stale — they now take `stream=None` (§Stale-Test).
