# connector-server BullMQ Redis Auth Fix

## Context

`connector-server` starts and registers Bull Board at `/admin/queues`, but BullMQ emits `NOAUTH Authentication required` because its queue connection only parses host and port from `REDIS_URL`. The normal Redis client uses the full URL and connects successfully.

## Design

Update `connector-server/src/plugins/bullmq.ts` so BullMQ queue options are derived from the full Redis URL:

- `host`
- `port`
- decoded `password`
- database index from the URL path, such as `/3`

Keep the existing queue names, dashboard path, server port, and worker startup behavior unchanged.

## Test

Add a focused Vitest unit test that sets `REDIS_URL=redis://:Pier2026!qwer%23@192.168.199.120:6379/3` and verifies `queueBaseOptions.connection` includes password `Pier2026!qwer#` and `db: 3`.

## Rollout

Restart `connector-server` on port `3004` with the same Postgres and Redis environment variables. Verify `/admin/queues/` returns HTTP 200 and fresh logs no longer contain `NOAUTH`.
