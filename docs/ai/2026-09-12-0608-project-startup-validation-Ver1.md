# Project startup validation — 2026-09-12, Ver1

Started the configured local services and validated the real Gantt login and data-loading flow. No application source or database records were edited directly.

## Running services

| Service | Port | Verification |
|---|---:|---|
| Existing PostgreSQL 16 cluster | 5432 | Live detailed health reports database ok |
| Live Redis | 6379 | Live detailed health reports Redis ok |
| PBS Redis | 6380 | Listener active |
| Live API | 3000 | GET /api/health/detail HTTP 200, database and Redis ok |
| PBS API | 3002 | GET /api/health HTTP 200 |
| Engine API | 3103 | GET /health HTTP 200, Redis connected |
| Connector API | 3104 | GET /api/health HTTP 200 |
| AI API | 3005 | GET /ai/health HTTP 200 |
| Gantt | 5173 | GET /altair/ HTTP 200; UI validation below |
| Gantt (`cr.rois.one` origin) | 5567 | GET /altair/ HTTP 200; public login validation below |
| PBS Portal | 3030 | GET /pbs/ HTTP 200 |

Ports follow the existing module configuration. Historical scripts mention absent altair-server and legacy rule-engine services; those were not fabricated or started. Rust legality is invoked by the current application rather than a standalone legacy port-3001 server. No optimizer run was requested or tested.

The existing machine PostgreSQL cluster was stopped, causing all three Node APIs to exit with ECONNREFUSED on localhost:5432. Starting that cluster and restarting those APIs restored service, without replacing their existing DATABASE_URL configuration. The engine initially fell back to default configuration; restarting with ROIS_CONFIG_PATH pointing to engine-server/config.yaml and loading its existing .env restored the configured authenticated service and Redis connection.

## Commands

Processes were started detached, with logs and PID records under /tmp/rois-services/.

- PostgreSQL: `/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 -l /tmp/rois-services/postgresql.log start`
- Redis: `redis-server --bind 127.0.0.1 --port 6379 --dir /tmp/rois-services --dbfilename live-dump.rdb`; second instance uses port 6380 and pbs-dump.rdb.
- Live, PBS, connector: `npm run dev` in each module.
- AI: `.venv/bin/python main.py` in ai-server.
- Engine: `ROIS_CONFIG_PATH="$PWD/config.yaml" .venv/bin/python -c "from dotenv import load_dotenv; load_dotenv('.env'); import uvicorn; uvicorn.run('main:app', host='0.0.0.0', port=3103)"` in engine-server.
- Gantt: `npm run dev -- --host 0.0.0.0 --port 5173 --strictPort` in gantt.
- Portal: `npm run dev -- --host 0.0.0.0 --port 3030 --strictPort` in pbs-portal.

## Real UI validation

`node /tmp/rois-validate-startup.cjs` — **PASS**. Uses installed Chrome through the e2e module's Playwright package. The browser remains open on the resulting Live Gantt.

The script types the existing test user's credentials into the real login form, clicks Sign In, opens Live, opens and applies the Filter dialog, waits for loading guidance to disappear, asserts nonzero roster and pairing Canvas rows, then clicks Zoom In and verifies the zoom increases. It reads test hooks only for assertions; it does not inject authentication or call business-write APIs.

Final loaded object counts: {'roster': 9196, 'pairing': 4056, 'flightRegistrations': 131, 'flightLegs': 11892}. These are object counts, not crew counts. No browser page errors occurred.

Screenshots from the same successful run, visually inspected:

- `docs/assets/screenshots/gantt/startup-login-20260912-Ver3.png`
- `docs/assets/screenshots/gantt/startup-gantt-20260912-Ver3.png`

Earlier harness attempts failed because the root and e2e directories have different Playwright versions and because the script initially used wrapper names instead of the actual hook names. Both harness issues were corrected. The first successful screenshot still showed the loading hint, so the final run waits for full apply completion and also verifies pairing rendering.

## Public checks

- `curl -I --max-time 10 https://cr.rois.one/api/health` — HTTP 200.
- `curl -I --max-time 10 https://flair.rois.cloud/altair/` — HTTP 200.
- Existing Cloudflare processes were reused. flair.yml routes Altair to 5173; config.yml routes the crew API to 3000. No tunnel configuration was changed.

### `cr.rois.one/altair` 502 restoration (10:40 PDT)

Reported failing URL: `https://cr.rois.one/altair` → HTTP 502.

The active tunnel is `rois-one` using `/Users/kimi/.cloudflared/config.yml`. Its route for `/altair/.*` targets `http://localhost:5567`. No process was listening on 5567; the only Gantt origin was the 5173 instance started for `flair.rois.cloud`. `gantt/.env.local` declares `VITE_PORT=5567`, so 5567 is this worktree's configured origin for the `cr.rois.one` tunnel.

Restoration: started a second Gantt/Vite dev server detached on port 5567:

```bash
cd gantt
npm run dev -- --host 0.0.0.0 --port 5567 --strictPort
```

Verification after restart:

- Local origin `http://localhost:5567/altair/` → HTTP 200.
- Public `https://cr.rois.one/altair/` → HTTP 200 on five consecutive requests.
- Real public-UI Playwright login (`node /tmp/rois-validate-cr.cjs`) → PASS: `Sign In` rendered, Ryan's credentials were typed into the actual form and submitted, and the authenticated Dashboard loaded with no failed requests or page errors.
- Screenshot from that run: `docs/assets/screenshots/gantt/cr-public-login-20260912-Ver1.png`.
- Screenshot content check (macOS Vision OCR): `ALTAIR`, `ROIS.`, `Sign In`, `USER NAME`, `PASSWORD`, `INTELLIGENT CREW RESOURCE OPTIMIZATION`.

Remaining root-cause gap: `cr.rois.one` expects 5567 while `flair.rois.cloud` expects 5173, so both Gantt origins must run on this Mac. Neither is registered for reboot auto-start in the current configuration; after a reboot `cr.rois.one` will return to 502 until the 5567 origin is started.

## iPhone Air simulator evidence

The prior iPhone 17 simulator was shut down without erasing its data. Simulator was selected with `open -a Simulator --args -CurrentDeviceUDID 50EBA799-7D94-4136-98BA-A24DEA041922`; the final `simctl list devices booted` output lists only iPhone Air.

| Item | Evidence |
|---|---|
| Device | iPhone Air, iOS 26.5, UDID `50EBA799-7D94-4136-98BA-A24DEA041922` |
| Build | `xcodebuild -workspace ios/RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplate -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,id=50EBA799-7D94-4136-98BA-A24DEA041922' CODE_SIGNING_ALLOWED=NO build` — PASS |
| Derived data selected by the successful workspace build | `/Users/kimi/Library/Developer/Xcode/DerivedData/RoyceTravelTemplate-enpsnmgbvynlhxdcceagedxgvteh` |
| Install | `xcrun simctl install '50EBA799-7D94-4136-98BA-A24DEA041922' /Users/kimi/Library/Developer/Xcode/DerivedData/RoyceTravelTemplate-enpsnmgbvynlhxdcceagedxgvteh/Build/Products/Debug-iphonesimulator/RoyceTravelTemplate.app` — PASS |
| Relaunch | `xcrun simctl terminate '50EBA799-7D94-4136-98BA-A24DEA041922' org.reactjs.native.example.RoyceTravelTemplate && xcrun simctl launch '50EBA799-7D94-4136-98BA-A24DEA041922' org.reactjs.native.example.RoyceTravelTemplate` — PASS |
| Bundle | `org.reactjs.native.example.RoyceTravelTemplate` |
| Metro | `npm start` in `crew-app/`, port 8081 — running |

To force the same DerivedData location on a later build, add `-derivedDataPath /Users/kimi/Library/Developer/Xcode/DerivedData/RoyceTravelTemplate-enpsnmgbvynlhxdcceagedxgvteh` to the recorded successful build command. The iPhone Air login UI rendered after app relaunch and Metro availability; the visually inspected capture is `docs/assets/screenshots/crew-app/iphone-air-login-Ver1.png`.

## Limits

This verifies startup, Gantt login/data pull/zoom, and the public `cr.rois.one` login path. It does not certify all business workflows or a solver run. Processes started here are detached for this session, not newly registered for reboot startup; the `cr.rois.one` 5567 origin has the same reboot dependency. The physical iPhone package has not been replaced; see the separate build-provenance audit.
