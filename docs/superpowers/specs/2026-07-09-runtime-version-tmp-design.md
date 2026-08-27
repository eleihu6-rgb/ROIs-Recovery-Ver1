# Runtime Version Tmp Design

## Problem

`gantt/src/version.ts` stored frequently changing runtime counters in tracked source. Any frontend, backend, rule, or PBS version bump created noisy Git changes and merge pressure around a single file.

## Design

Use `live-server/version.tmp` as the local runtime counter file. It is JSON, ignored by Git, and managed by `scripts/version-state.mjs`.

The Gantt UI still displays the same visible global version format:

`Ver:B{backend}/F{frontend}/R{rule}`

Vite injects the initial value through `__ROIS_APP_VERSION__`. At runtime, Gantt refreshes the value from live-server `GET /api/version`, and Vite HMR pushes frontend-version updates through a custom websocket event.

## Increment Rules

- `gantt` `dev` / `build` increments `frontend`.
- Vite HMR increments `frontend`.
- `live-server` `build` increments `backend`.
- `live-server` process startup increments `backend`, so watch restarts are counted.
- `connector-server` `dev` / `build` increments `backend`.
- `pbs-server` `dev` / `build` increments `pbsBackend`.
- `pbs-portal` `dev` / `build` increments `pbsFrontend`.

## Cleanup

`gantt/src/version.ts` is deleted. Canonical project docs now point to `live-server/version.tmp` and `scripts/version-state.mjs` instead of tracked source counters.
