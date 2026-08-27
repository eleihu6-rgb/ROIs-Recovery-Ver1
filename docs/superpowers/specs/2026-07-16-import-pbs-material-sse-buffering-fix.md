# Import PBS Material SSE buffering fix

Date: 2026-07-16

## Problem

SIT re-imports complete successfully, but the Import PBS dialog does not show staged progress in real time. The dialog eventually shows success and crew counts, but the bar/stage labels do not visibly advance during the import.

Recent evidence:

- `connector-server` does emit full stage history into Redis for the import.
- `live-server` creates the SSE endpoint and receives the events.
- The browser-facing UI still appears to receive the progress too late, which is consistent with buffering on the SSE response path.

## Goal

Make Import PBS progress visibly update while the import is running, without changing import semantics or the final result payload.

## Proposed fix

1. Make the SSE response explicitly non-buffering.
2. Flush headers immediately before subscribing to Redis.
3. Keep the existing Redis history replay and complete/error close behavior.
4. Add a regression test that asserts the SSE route emits the expected headers and that streamed events are written in order.

## Files to touch

- `live-server/src/routes/scenario/import-pbs-material.ts`
- `live-server/src/__tests__/unit/scenario-import-pbs-material-route.test.ts`

## Validation

- `npm --prefix live-server test -- scenario-import-pbs-material-route`
- `npm --prefix live-server run build`
- SIT redeploy of `live-server`
- Manual SIT re-import: verify progress changes before completion and crew count is not just the final total

