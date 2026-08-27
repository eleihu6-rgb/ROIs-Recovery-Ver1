# live-server Redis URL Password Decode Fix

## Context

`live-server` starts against the provided Postgres and Redis endpoints, but BullMQ workers fail to authenticate when the Redis password contains `#`. The normal Redis client accepts the URL-encoded password, while the local BullMQ connection helper passes the encoded text through unchanged.

## Design

Update `live-server/src/utils/redis-url.ts` so `parseRedisUrl()` decodes the URL password before returning BullMQ connection options. Keep the existing fallback behavior for invalid URLs and do not change ports, hosts, worker setup, or environment variable names.

## Test

Add a focused Vitest unit test proving `redis://:Pier2026!qwer%23@192.168.199.120:6379/3` returns password `Pier2026!qwer#`. Also keep coverage for URLs without passwords and malformed URLs.

## Rollout

Restart `live-server` with the supplied Redis endpoint and verify that port `3000` is listening and the logs no longer show `WRONGPASS` from BullMQ workers.
