# Local Start Playbook

## Scope

This is the canonical repo-tracked reference for the local ROIS-AI development stack on Mac. It covers:

- current local ports
- recommended startup order
- exact commands
- health checks
- reboot-safe engine-server startup
- known blockers and stale paths

It does not:

- fix broken services automatically
- replace broader orchestration or process-manager work
- recreate the legacy `rule-engine` HTTP service on `3001`

## Canonical Local Ports

| Service | Port | Auto-start | Notes |
|---|---:|:---:|---|
| `gantt` | `5173` | ✅ LaunchAgent | Base path `/altair/`; `VITE_PORT=5173` required (default is 5566/EVACC) |
| `live-server` | `3000` | ✅ LaunchAgent | Health: `/api/health` |
| `altair-server` | `3006` | ✅ LaunchAgent | PBS Optimization Report wrapper; proxies `/altair/report/api/*` → `:8008` |
| `ai-server` | `3005` | ✅ LaunchAgent | Optional/future AI workflows; outside current F8 delivery scope. Health: `/ai/health`; owned by `com.rois.ai-server` |
| `pbs-server` | `3002` | — | Health: `/api/health` |
| `engine-server` | `3003` | — | Use `engine-server/scripts/start-local.sh` |
| `connector-server` | `3004` | — | Currently blocked; does not bind |
| `pbs-portal` | `3030` | — | Base path `/fpqe/pbs/` |

> **LaunchAgent ownership:** `gantt`, `live-server`, and `altair-server` are managed by `com.rois.altair-stack`
> (`~/Library/LaunchAgents/com.rois.altair-stack.plist`) via `scripts/start-extended-altair.mjs`.
> That script checks each port with `isPortOpen` before spawning — it will skip any port already held by
> another process rather than evicting it. `ai-server` is managed separately by `com.rois.ai-server`.
> Do not start these four services manually in a terminal; the LaunchAgents own them.
>
> To restart the altair stack: `launchctl kickstart -k gui/$(id -u)/com.rois.altair-stack`

## Preconditions

- Redis should already be listening on `6379`.
- Each module should already have dependencies installed.
- `engine-server/.venv` should be created with `python3.13 -m venv .venv` and contain required Python packages.
- `pbs-engine/.venv` should
  be a `python3.13` venv with `requirements.txt` installed for local PBS engine runs.
- For local Rust-mode RO runs, rebuild `rois_rule_engine_rs` into that same snapshot
  venv with `maturin develop --manifest-path rule-engine-rs/py/Cargo.toml`.
- If `ai-server` is already running on `3005`, reuse it instead of starting a second copy; it is optional for current F8 delivery.

Useful checks:

```bash
lsof -nP -iTCP -sTCP:LISTEN | rg ':(6379|3000|3002|3003|3004|3005|3030|5173)\b'
test -x engine-server/.venv/bin/uvicorn && echo "engine-server venv ok"
python3.13 -V
```

## Recommended Startup Order

1. Confirm Redis is up on `6379`.
2. Reuse `ai-server` if it is already listening on `3005`; it is optional for current F8 delivery.
3. Start `live-server`.
4. Start `pbs-server`.
5. Start `gantt`.
6. Start `pbs-portal`.
7. Start `engine-server` through the reboot-safe helper on `3003`.
8. Check `connector-server` separately because it is still a known blocker.

This order gets the local UI and API stack up first while keeping current connector issues isolated.

## Exact Commands

Open one terminal per service unless you use a process manager.

### `live-server`

```bash
cd live-server
npm run dev
```

Expected log:

```text
Live server running at http://0.0.0.0:3000
```

### `pbs-server`

```bash
cd pbs-server
npm run dev
```

Expected log:

```text
PBS server listening on 0.0.0.0:3002
```

### `gantt`

```bash
cd gantt
VITE_PORT=5173 npm run dev -- --host 0.0.0.0
```

Expected URL:

```text
http://localhost:5173/altair/
```

### `pbs-portal`

```bash
cd pbs-portal
npm run dev -- --host 0.0.0.0
```

Expected URL:

```text
http://localhost:3030/pbs/
```

### `engine-server`

Canonical local startup:

```bash
cd engine-server
python3.13 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip setuptools wheel
./.venv/bin/python -m pip install -r requirements.txt
./scripts/start-local.sh
```

Fast check of the resolved local env without starting the server:

```bash
cd engine-server
./.venv/bin/python -V
./scripts/start-local.sh --check
```

Local override file:

- `engine-server/.env.local` is optional and gitignored
- it may define `JWT_SECRET`, `ROIS_API_KEY`, `ROIS_BEARER_TOKEN`, `ROIS_CONFIG_PATH`
- if `JWT_SECRET` is not set, the helper falls back to the repo local dev secret `rois-dev-jwt-secret-2026`

Expected log:

```text
Uvicorn running on http://0.0.0.0:3003
```

### `ai-server`

If it is not already running:

```bash
cd ai-server
./.venv/bin/python main.py
```

Expected health endpoint:

```text
http://localhost:3005/ai/health
```

### `connector-server`

Current command:

```bash
cd connector-server
npm run dev
```

Current status:

- enters `tsx watch src/index.ts`
- does not bind `3004`
- should still be treated as a known blocker until fixed

## Verification

Run these after startup:

```bash
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3002/api/health
curl http://127.0.0.1:3003/health
curl http://127.0.0.1:3005/ai/health
curl -I http://127.0.0.1:5173/altair/
curl -I http://127.0.0.1:3030/pbs/
lsof -nP -iTCP -sTCP:LISTEN | rg ':(3000|3002|3003|3004|3005|3030|5173)\b'
```

Engine auth readiness check:

```bash
cd engine-server
./scripts/start-local.sh --check
```

Expected outcomes:

- `3000`, `3002`, `3003`, `3005`, `3030`, `5173` should respond
- `3004` may still be absent because `connector-server` is currently blocked
- `./scripts/start-local.sh --check` should print a non-empty `JWT_SECRET` and `PORT=3003`

## Known Blockers And Stale Paths

- Root `service.sh` is stale and still reflects older local startup assumptions.
- Do not run local Gantt on `5566` on this machine.
- `python3 main.py` in `engine-server` starts on `8000`; that is not the canonical repo-local stack port.
- `engine-server/scripts/start.sh` still starts the old generic path on `8000`; use `engine-server/scripts/start-local.sh` for local scenario work.
- `connector-server` currently hangs before binding `3004`.
- Historical docs and configs still reference `rule-engine` on `3001`, but no runnable `rule-engine/` module is expected in this checkout.

## Future Automation

If the full stack flow stays stable, a second pass can add a broader helper such as `scripts/start-local-stack.sh` that:

- starts only missing services
- reuses already-running services
- runs health and readiness checks
- reports blockers without hiding them

That is still phase 2. The current long-term fix is the canonical engine startup helper plus the documented reboot-safe path above.
