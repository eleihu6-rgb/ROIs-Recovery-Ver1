---
name: 005-routing-debug
description: Use when Cloudflare 502/Bad Gateway, flair.rois.cloud, ai.rois.one, /altair, /fpqe/pbs, local Vite origin, cloudflared tunnel, port 5173/3030/5566, or public route-to-local-origin behavior fails or looks misrouted.
---

# Routing Debug

## Core Rule

Use `superpowers:systematic-debugging` first. A public 502 is a symptom; find the first failing boundary before changing configs or restarting services.

Before routing/port work, read:

- Root `CLAUDE.md`
- `/Users/kimi/.codex/local-memos/rois-port-usage.md`

Do not write secrets into docs or logs. Do not touch `ai.rois.one` / EVACC while fixing `flair.rois.cloud` unless the user explicitly asks.

## Known Local Routing

| Public route | Local origin | Notes |
|---|---:|---|
| `https://flair.rois.cloud/altair/*` | `http://localhost:5173` | Altair/Gantt Vite, base `/altair/` |
| `https://flair.rois.cloud/fpqe/pbs/*` | `http://localhost:3030` | PBS portal Vite |
| `https://flair.rois.cloud/api/*` | `http://localhost:3030` | PBS portal proxy/login path |
| `https://ai.rois.one/gantt` | `http://127.0.0.1:5566` | EVACC only |

Rules:

- Keep Altair/Crew Gantt on `5173`.
- Keep EVACC on `5566`.
- Never point `flair.rois.cloud` to `5566`.
- Never start Altair on `5566`; it can make `ai.rois.one` serve the wrong app.

## Boundary Checks

Run checks from outside in:

```bash
curl -I --max-time 10 https://flair.rois.cloud/altair/scenario
sed -n '1,220p' ~/.cloudflared/flair.yml
lsof -nP -iTCP:5173 -sTCP:LISTEN
curl -I --max-time 5 http://localhost:5173/altair/scenario
ps -axo pid,ppid,stat,etime,command | rg 'cloudflared|vite|npm|node'
```

For PBS portal:

```bash
lsof -nP -iTCP:3030 -sTCP:LISTEN
curl -I --max-time 5 http://localhost:3030/fpqe/pbs/
```

For EVACC safety checks only:

```bash
lsof -nP -iTCP:5566 -sTCP:LISTEN
curl -I --max-time 5 http://localhost:5566/gantt
```

## Interpreting Common Failures

| Evidence | Meaning | Next step |
|---|---|---|
| Public 502 and `localhost:5173` refuses connection | Tunnel is up, Altair origin is down | Find why Vite exited; start/supervise `5173` only after preserving evidence |
| Public 502 and local origin returns 200 | Check `cloudflared` connector/config/logs | Verify active tunnel uses `~/.cloudflared/flair.yml` |
| `/altair/*` serves EVACC or wrong title | Port mix-up with `5566` | Stop wrong origin and restore documented ports |
| `/fpqe/pbs/*` fails but `/altair/*` works | PBS portal origin/proxy issue | Check `3030`, not Gantt |

## Root-Cause Standard

Do not report “fixed by restart” as root cause. If a restart restores service, continue until you can say which condition caused the outage, for example:

- no listener on the configured origin port;
- Vite was launched in a terminal/session that exited;
- origin was started on the wrong port;
- Cloudflare config pointed to a stale origin;
- multiple tunnel connectors used conflicting configs.

## Safe Altair Origin Start

Only after evidence shows the origin is down:

```bash
cd gantt
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

Use `--strictPort` so Vite does not silently move to another port.

## Completion Criteria

A routing debug answer must include:

- failing public URL and HTTP status;
- active tunnel config path and service target;
- local listener status for the target port;
- local origin HTTP status;
- what restored service, if anything;
- remaining root-cause gap if the process exit reason is still unknown.
