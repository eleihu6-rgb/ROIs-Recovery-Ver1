# Live Server Redis Resilience and Alerting

Last updated: 2026-07-29

## Purpose

`live-server` uses Redis for cache, edit locks, WebSocket fan-out, import progress, and BullMQ queues. PostgreSQL remains the authority for business data.

This document defines the expected behavior when Redis restarts or stays unavailable, and the observability signals that should be used to distinguish a healthy service from a degraded one.

## Redis Responsibilities

Redis-backed behavior in `live-server` includes:

- Cache-aside reads and cache invalidation for roster, pairing, flight, scenario, base-data, and related endpoints.
- Live edit locks for crew, pairing, draft, and scenario edit flows.
- WebSocket violation update subscription through a dedicated duplicate Redis subscriber.
- BullMQ queue producers, queue events, and workers for rule checks, imports, partition management, and scenario legality sweep.
- Import progress history and SSE replay state.

Redis is not the source of truth for roster, pairing, scenario, or crew business rows. Those rows are written to PostgreSQL.

## Expected Failure Behavior

### Short Redis Restart

When Redis restarts briefly:

- The main Redis client logs the connection error and reconnect lifecycle.
- The WebSocket duplicate subscriber handles `error`, `end`, and `reconnecting` events without crashing the Node process.
- BullMQ `Queue`, `QueueEvents`, and worker instances have `error` listeners so Redis socket errors are logged instead of becoming unhandled process errors.
- Cache reads normally fall back to PostgreSQL when Redis read fails.
- Cache backfill failures are ignored after the authoritative PostgreSQL read has succeeded.

Expected user impact is temporary degradation: cache misses, delayed queue work, missed transient WebSocket notifications, or short-lived request failures on Redis-dependent flows.

### Long Redis Outage

If Redis stays unavailable, `live-server` may keep the process alive, but the service is degraded:

- `/api/health` can still return `200`; it only indicates the HTTP process is alive.
- `/api/health/detail` is the operational health endpoint and should return `503` when Redis ping fails.
- Cache-heavy reads can become slower because they fall back to PostgreSQL repeatedly.
- Edit locks cannot be acquired, renewed, or released reliably.
- BullMQ enqueue/worker paths can fail or stall.
- Import progress publish/read paths can fail.
- WebSocket Redis-backed violation update fan-out is unavailable.

Long Redis outage is therefore not a normal operating mode.

## Data Consistency Risk

Redis outage should not directly create invalid PostgreSQL business rows because Redis is not authoritative storage.

Remaining risk areas:

- Cache invalidation can fail after a successful PostgreSQL write, leaving stale Redis cache until TTL expiry or later invalidation.
- Some write flows may return an error after PostgreSQL has already committed if a mandatory Redis operation fails afterward. A client retry can create duplicate-intent risk unless the write path is idempotent.
- Redis edit locks are unavailable during the outage, so concurrent editing protection is weakened.
- BullMQ-backed async workflows can be partially completed, delayed, or marked failed depending on where Redis failed.

When Redis is down, operators should treat write workflows and multi-user edit workflows as degraded, not fully safe.

## Alerting Signals

The primary signals are:

- `/api/health/detail`
  - `200` with `checks.redis = "ok"`: Redis is reachable.
  - `503` with `checks.redis = "fail"`: service is degraded.
- Structured logs from the primary Redis client:
  - `Redis connection ready`
  - `Redis reconnecting`
  - `Redis connection restored`
  - `Redis connection ended`
  - `Redis connection error`
- Structured logs from Redis-dependent secondary clients:
  - `WebSocket Redis subscriber error`
  - `WebSocket Redis subscriber reconnecting`
  - `WebSocket Redis subscriber connection ended`
  - `<queue label> error` for BullMQ queues, queue events, and workers.
- Prometheus metrics when `/metrics` is enabled:
  - `rois_live_server_redis_connection_up`
    - `1`: primary Redis client is ready.
    - `0`: primary Redis client is unavailable or reconnecting.
  - `rois_live_server_redis_connection_errors_total`
  - `rois_live_server_redis_reconnects_total`

Suggested alert policy:

- Page or urgent alert: `rois_live_server_redis_connection_up == 0` for more than 2 minutes, or `/api/health/detail` returns `503` because Redis failed.
- Warning: any sustained increase in `rois_live_server_redis_connection_errors_total` or `rois_live_server_redis_reconnects_total`.
- Investigate: repeated BullMQ/WebSocket Redis errors even if the primary Redis client is healthy.

## Operational Checks

Use the detail health endpoint, not only the basic health endpoint:

```bash
curl -sS -i http://127.0.0.1:3000/api/health/detail
```

Check local Redis service:

```bash
systemctl status redis-server --no-pager -l
journalctl -u redis-server --since '30 minutes ago' --no-pager
```

Check live-server logs:

```bash
tail -n 200 logs/live-server.log
```

On the local UAT host, restart `live-server` through the canonical service script:

```bash
~/rois/rois.sh restart live-server
```

## Implementation Notes

The resilience hooks are intentionally narrow:

- They add error listeners and observability around existing Redis and BullMQ clients.
- They do not change queue semantics, job retry policy, lock semantics, cache TTLs, or PostgreSQL write behavior.
- They avoid turning Redis outage into silent success for workflows that require Redis correctness.

Future hardening should focus on separating mandatory Redis operations from best-effort cache invalidation after PostgreSQL commits, and on making write APIs idempotent where retries can occur after a partial failure.
