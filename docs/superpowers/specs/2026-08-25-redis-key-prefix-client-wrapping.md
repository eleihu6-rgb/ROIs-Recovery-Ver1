# 2026-08-25 Redis Key Prefix — Client-Level Wrapping (v2)

## Problem

`2026-08-25-redis-key-prefix-isolation.md` (v1) defined opt-in wrapping:
every call site that touches Redis is supposed to pass its key through
`withPrefix(key)` before sending to the client.

In practice that contract is leaky. After deploying v1 to SIT and reading
the live db 7 directly we see:

- 1604 keys with first segment `roster` — written bare, e.g. `roster:v2:list:123`
- 35 keys with first segment `legality` — bare
- 53 keys already correctly prefixed `dev:crew:rank:list:*` (these are the
  few call sites that remember to use `withPrefix`)

The bare keys come from ~93 call sites in `live-server` and ~12 in
`connector-server` that use `fastify.redis.get|set|del|mGet|hGet|hSet|scan|eval`
directly without going through `withPrefix`. Retrofitting every call site
to use `withPrefix` is brittle: any new service that opens `fastify.redis`
is one forgotten wrapper away from polluting the global keyspace.

## Goal

Move prefix injection from the call site to the client. Every call into
the Redis client (`get` / `set` / `del` / `mGet` / `mSet` / `scan` /
`keys` / `eval` / `evalSha` / `hGet` / `hSet` / `hDel` / `hGetAll` /
`sAdd` / `sRem` / `sIsMember` / `sMembers` / `incr` / `decr` / `expire`
/ `publish` / `subscribe` / etc.) is automatically prefixed with
`<REDIS_KEY_PREFIX>:` so that callers can use bare keys and the client
layer does the right thing.

## Non-Goals

- Not touching BullMQ's internal `ioredis` client. BullMQ's queue/worker
  names already come pre-prefixed via `withBullmqPrefix` (`_` separator,
  not `:`), and BullMQ itself uses `bull:` as its key prefix internally.
- Not migrating historical keys. Existing bare keys stay; new code
  reads/writes `<env>:<key>`.
- Not changing the prefix format. `withPrefix` still uses `:` separator.

## Design

### 1. New file: `live-server/src/utils/prefixed-redis.ts` (mirror in pbs/connector)

Exports `createPrefixedRedis(rawClient)` that returns a Proxy wrapping
`RedisClientType` (node-redis v4). Key-accepting methods transparently
prepend `${REDIS_KEY_PREFIX}:` to their first argument. Multi-key
methods prefix all keys. `eval` / `evalSha` prefix the `options.keys`
array. `scan` / `scanStream` prefix the `MATCH` pattern. `publish` /
`subscribe` / `pSubscribe` prefix channels.

### 2. Wire in each service's `plugins/redis.ts`

`fastify.decorate('redis', createPrefixedRedis(raw))`. The decorated
type is the same `RedisClientType` so call sites compile unchanged.

### 3. `withPrefix` becomes a no-op (kept for back-compat)

Returns the input unchanged. Existing `withPrefix(...)` call sites
continue to work without producing double-prefixed keys.

### 4. Operational

SIT `live-server.env` / `pbs-server.env` / `connector-server.env` /
`engine-server.env` already have `REDIS_KEY_PREFIX=sit` set (applied
8/25 ~08:53). UAT stays untouched per user.

## Files Touched (this commit)

- `live-server/src/utils/prefixed-redis.ts` (new)
- `live-server/src/utils/redis-key-prefix.ts` (deprecate `withPrefix` to no-op)
- `live-server/src/plugins/redis.ts` (wire the proxy)
- `live-server/src/__tests__/utils/prefixed-redis.test.ts` (new)
- `live-server/src/__tests__/utils/redis-key-prefix.test.ts` (update to no-op assertions)
- `live-server/src/__tests__/utils/cache.test.ts` (update to bare-key assertions)
