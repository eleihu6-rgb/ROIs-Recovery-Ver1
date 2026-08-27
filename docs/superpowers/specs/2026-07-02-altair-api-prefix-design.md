# Altair API Prefix Clean-Cut Design

## Goal

Make `/altair` the single public prefix for the Altair frontend and its backend-facing routes. Remove `/fpqe/*` usage from the Gantt runtime contract immediately, with no compatibility alias.

## Approved Scope

- Frontend app base remains `/altair/`.
- Backend-facing Gantt paths move to:
  - `/altair/live`
  - `/altair/rule`
  - `/altair/engine`
  - `/altair/ai`
- ai-server emitted public URLs that currently point at `/fpqe/ai/*` move to `/altair/ai/*`.
- Clean cut only. Old `/fpqe/*` paths are not preserved in code.

## Current Problem

The repo is split across two routing contracts:

- Gantt runtime path builders still default to `/fpqe/*`.
- Vite proxy comments and some tests still assume `/fpqe/*`.
- ai-server public watch URLs still emit `/fpqe/ai/*`.
- Regression E2E coverage already expects `/altair/ai/*`.

This mismatch explains environments where the app shell loads under `/altair/` but API-backed pages fail because the frontend still calls `/fpqe/*`.

## Approach

Use one shared prefix variable for Altair runtime routing and update all Gantt-facing service bases to `/altair/*`. Keep service ports and internal upstream paths unchanged:

- live-server stays on `:3000`
- rule-engine stays on `:3001`
- engine-server stays on `:3003`
- ai-server stays on `:3005`, with public proxy path `/altair/ai/*` mapped to internal `/ai/*`

On the backend side, update ai-server configuration and generated/watch URLs so any user-visible link emitted back to the frontend uses `/altair/ai/*`.

## Files In Scope

- `gantt/src/config/api-paths.ts`
- `gantt/vite.config.ts`
- `gantt/src/config/system-tools.ts`
- `gantt/src/services/timezone-api.ts`
- `gantt/src/__tests__/config/system-tools.test.ts`
- `gantt/src/hooks/__tests__/use-url-sync.test.ts`
- `ai-server/src/config/settings.py`
- `ai-server/src/regression/runner.py`
- `ai-server/src/live/viewer.py`
- `ai-server/CLAUDE.md`
- `ai-server/tests/test_chat_route.py`
- `ai-server/tests/test_crewbids.py`

## Out Of Scope

- PBS Portal routing (`/fpqe/pbs/*` or `/pbs/*`)
- Connector-server public routes
- Historical docs outside the touched Altair/Gantt/ai-server path contract
- Dual-prefix compatibility or rewrite fallback logic

## Risks

1. Shared Gantt API base constants have medium blast radius because many services import them.
2. ai-server watch URLs are user-visible and break live-stream flows if left mixed.
3. Deployment must switch nginx / tunnel routing at the same time as the code cut.
4. Some historical docs will remain stale outside this scoped sweep.

## Testing Strategy

Run the smallest relevant checks first:

1. Targeted frontend unit tests for changed path constants and URL sync behavior.
2. Targeted ai-server pytest coverage for emitted watch URLs.
3. Focused grep to confirm no `/fpqe` remains in the touched runtime/test surface.
4. If local services are available, curl or browser verification for:
   - `/altair/ai/health`
   - a Gantt screen that calls `/altair/live/*`
   - the Regression page loading `/altair/ai/regression/tests`

## Success Criteria

- Gantt runtime no longer builds `/fpqe/live`, `/fpqe/rule`, `/fpqe/engine`, or `/fpqe/ai`.
- ai-server no longer emits `/fpqe/ai/live/streams/...`.
- Touched tests assert `/altair/*`.
- No compatibility alias is added in code.
