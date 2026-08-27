---
name: 121-pbs-perf-enhancement
description: Canonical playbook for PBS performance enhancement — diagnosing and fixing slow pbs-server (:3002) / pbs-portal (:3030) paths (transfer size, round trips, unmeasured backend latency, live-table query cost) without changing the {code,data,message} contract. Use when "the PBS X page is slow", when adding indexes/caching/query rewrites to pbs-server, or to pick the right approach + verification discipline for any PBS perf work. Umbrella over skills 119 (overseas size/latency) and 120 (pairing-search hot path).
---

# PBS Performance Enhancement Playbook

The repeatable method behind the shipped PBS perf work. For the two concrete deliverables:
- **119-pbs-overseas-speed-latency** — compression, route metrics, private ETags, `/portal/bootstrap`, byte baseline.
- **120-pbs-pairing-search-perf** — base+period index, sargable period range, grouped LATERAL rollup.

This skill is the *method*; load 119/120 for the *recipes*.

## Step 0 — Find the REAL bottleneck (don't fix the wrong thing)

The single biggest mistake is optimizing the visible-but-cheap thing. In PBS:
- **Page mount is usually NOT the bottleneck.** `/pairing-bids/current` etc. read PBS-schema-only
  tables and are in-process cached (catalog 5min, period 60s TTL). A 120s Playwright `waitFor` is
  *slack tolerance*, not a measured cost. Don't "speed up" a cached mount.
- **The cost is the interactive, live-schema query** that fires on user action (search / autocomplete
  / pool counts / airport options) against `pairing` / `pairing_segment` / `roster_flight`.
- **The "~2 minutes" is rarely warm query time.** Decompose it: overseas RTT × round-trip count +
  cold-cache disk reads + bid-window concurrency (hundreds of crew on the *same* base+period scan).
  Warm single-query time from a dev box can be single-digit ms while users wait minutes.

Method: read the request path top→bottom (page → hook → service → route → service → SQL), then run
`EXPLAIN (ANALYZE, BUFFERS)` on the hot SQL against the remote demo DB to see the plan, not guess.

## The fix patterns (apply the ones the plan proves you need)

1. **Sargable predicates** — never wrap the filtered column in a function. `(col at time zone 'UTC')::date
   between a and b` → half-open range `col >= start and col < endExclusive`. For `timestamp without time
   zone` (UTC wall-clock) columns use **plain timestamps** (no `Z`, no `at time zone`) → session-TZ-independent.
2. **Composite + covering indexes** — `(equality_col, range_col) where is_deleted=0` turns a filter-scan into
   an index range AND can serve the `order by`. `INCLUDE (rollup cols) where is_deleted=0` makes aggregates
   Index-Only (Heap Fetches 0). Ship as `sql/migration/YYYY-MM-DD-*.sql` (idempotent `if not exists`, no
   schema prefix) AND mirror into the canonical `sql/schema/live|pbs/*.sql` so fresh inits get it. Apply to
   live DBs with `CREATE INDEX CONCURRENTLY` (can't run in a txn).
3. **Kill SQL-level N+1** — per-row correlated subqueries → one grouped `LEFT JOIN` / `LEFT JOIN LATERAL`
   computed once over the paged rows. Preserve exact NULL/fallback semantics (zero-child rows).
4. **Fewer round trips** — fold/cache stable per-session lookups (actor base/rank); combine independent GETs
   behind one endpoint (`/portal/bootstrap` = `Promise.all`).
5. **Smaller payloads** — `@fastify/compress` (gzip, threshold 1024); private ETags
   (`sendPrivateJsonWithEtag`, `Cache-Control: private, no-cache`, 304 on `If-None-Match`) on stable GETs.
6. **Caching under concurrency** — short-TTL in-process (`pairing-bid-service.ts` pattern) or PBS Redis,
   keyed by the real tuple (base, period, query, rank); invalidate on import. Collapses N identical reads.
7. **First-paint** — page the first ≤N rows fast, defer heavy detail joins to visible rows (§First-Paint).

## Verification discipline (§No-Illusion) — non-negotiable

- **Route tests MOCK the services.** `pbs-server/src/routes/*.test.ts` inject a mock service, so SQL
  builder changes are NOT exercised by `npm test`. Prove a live-SQL rewrite with a **real-DB
  byte-identical OLD-vs-NEW row diff** (connect via `SOURCE_DATABASE_URL` from a `.mjs` *inside*
  `pbs-server/` so ESM resolves `pg`; `JSON.stringify`-compare every row incl. edge/zero-child cases;
  predicate symmetric-difference over the whole table = 0).
- **EXPLAIN (ANALYZE, BUFFERS) before/after** on a busy key — show scan→seek, buffer drop, Index-Only rollup.
- **Build + full suite**: `npm run build` then `npm test` (currently 434/434, all skipDatabase).
- **e2e (§Simulate-User)**: drive the REAL UI (click the button, let the UI fire the call); assert correct
  data + a non-flaky latency budget. Never `request.post` the API to fake a user action. PBS ids `PBS-3xxx`.
- **Compiled-server smoke**: run `dist/index.js` on a free PORT against the real DB; hit the endpoint; 200 + data.
- **Hard latency numbers come from the harness, not a dev box.** `npm run perf:pbs -- --base-url=https://<host>
  --samples 5` reports per-endpoint p95 + avg/max bytes; run it **from an overseas client, before/after deploy**
  — a warm low-RTT local A/B is dominated by round-trip and will show ~1x even when the structural win is large.

## Estimating the win honestly

- Quote what you measured: EXPLAIN structural deltas (rows examined, `Buffers`, plan shape, Heap Fetches).
- The row/IO reduction **scales with data size**: index win ≈ total_key_rows ÷ filtered_rows; a demo with a few
  months understates production (full year ≈ many× more avoided).
- Per-query DB-work reduction is the solid claim. Tail-under-load (cold cache + concurrency) improvement is an
  *extrapolation* (state it as a range, e.g. 3–10x) until the overseas harness measures it.
- Call out what did NOT change (cached mounts; queries whose cost is elsewhere, e.g. a full child-table scan).

## Environment + workflow

- Remote demo DB: `pbs-server/.env` `SOURCE_DATABASE_URL` (live schema f8) / `DATABASE_URL` (f8_pbs),
  `47.253.173.207:55432/rois`, session TZ `Etc/UTC`. Local f8 is empty — always the remote.
- **iCloud-revert hazard**: do edits in a git worktree OUTSIDE iCloud (symlink node_modules from the iCloud
  checkout for build/test + the pre-push UI gate), then `git push HEAD:main`. Worktree off current `origin/main`.
- **Version**: bump `PBS_BACKEND_VERSION` (pbs-server) / `PBS_FRONTEND_VERSION` (pbs-portal) in
  `gantt/src/version.ts` — NOT the global counters. Pure DDL needs no bump; bump once when code ships.
- pbs-server test env gotchas (node:test not vitest, react symlink for portal vitest, gitignored
  package-lock) — see **119-pbs-overseas-speed-latency**.
