# Live Server Performance Enhancement — Completion Note (ver1)

> Plan: `docs/superpowers/plans/2026-06-22-0628-live-server-performance-enhancement-ver1.md`
> Branch: `feat/live-server/perf-wt` (worktree, isolated from iCloud sync)
> Date: 2026-06-22

## AI Coder Feedback

### Implemented

- **P0 route + cache metrics** — `utils/metrics.ts` (idempotent prom-client factories, reused),
  `utils/cache.ts` (`cache_hit_total` / `cache_miss_total`, labels `cache_group`, `mode=single|chunk`),
  `plugins/metrics.ts` (`http_request_duration_seconds` + `http_response_bytes` histograms via
  `onResponse`/`onSend`, labeled by **route template** — no id leakage).
- **P1 versioned roster chunk cache** — `services/roster/roster-service.ts`. Chunk key now embeds a
  per-crew version (`roster:chunk:<crewId>:v<ver>:<start>:<end>`); writes `INCR roster:chunkver:<crewId>`
  (O(1)) instead of `SCAN`+`DEL roster:chunk:<crewId>:*`. `getView` reads versions via `mGet`.
  `invalidateAllChunks` kept for the rare reassign where the old crew is unknown.
- **P1 lightweight pairing summary mode** — `?view=summary` (route + service). Skips the per-pairing
  segment fetch and omits the `segments` array; composition kept for coverage/isFull. Default `detail`
  unchanged; full segments still via `getById`.
- **P1 lightweight flight window mode** — `?grouping=none` (route + service). Windowed flat rows
  paginated in SQL (LIMIT/OFFSET), no global bin-packing. Default `grouped` path byte-for-byte unchanged.
- **P2 legality recheck metrics + status meta** — `services/rule/legality-recheck.ts`. Metrics
  `legality_recheck_total{group,status}`, `_duration_seconds`, `_rule_count`, `_range_days`; a `:meta`
  JSON status record (startedAt/finishedAt/durationSec/ruleCodes/ruleCount/rangeDays). Non-zero-exit
  backstop and scoped-ruleCodes behavior preserved. Labels expose no roster data.
- **P2 query-plan guardrails** — `scripts/live-server-query-plan-check.sh` +
  `docs/modules/live-server/query-plan-guardrails.md` (runnable EXPLAIN harness + acceptance checklist).

### Changed files

- live-server/src/utils/metrics.ts (new)
- live-server/src/utils/cache.ts
- live-server/src/plugins/metrics.ts
- live-server/src/services/roster/roster-service.ts
- live-server/src/routes/pairing/pairing.ts, live-server/src/services/pairing/pairing-service.ts
- live-server/src/routes/flight/flight.ts, live-server/src/services/flight/flight-service.ts
- live-server/src/services/rule/legality-recheck.ts
- tests: __tests__/plugins/metrics, __tests__/utils/cache, __tests__/services/{roster,pairing,flight}/*, __tests__/services/rule/legality-recheck (new)
- scripts/live-server-query-plan-check.sh (new), docs/modules/live-server/query-plan-guardrails.md (new)
- gantt/src/version.ts: BACKEND_VERSION 157 → 158

### Measured result

- Not captured. `/api/gantt/bootstrap`, `/api/roster`, `/api/pairing`, `/api/flight` before/after
  timings require a running live-server against the **remote** demo Postgres (local `f8` is empty).
  Run with the new metrics scraped from `/metrics`, and run the query-plan harness, against live.
  **Follow-up — run against live.** The P0 metrics now make these numbers observable.

### Correctness verification

- Gantt bootstrap response unchanged (route untouched; only metrics hooks added globally).
- Roster DTO shape unchanged (only the cache key + invalidation strategy changed). 19/19 roster tests pass.
- Pairing detail still loads full segments (`getById` untouched; summary is opt-in). 16/16 pairing tests.
- Flight grouped mode unchanged by default; `grouping=none` is additive. listGrouped tests pass.
- Legality recheck status remains accurate; backstop preserved. 3/3 recheck tests.
- Test receipt: **72/73 passing** across the 6 touched suites; the 1 failure
  (`flightService.getCompositions > per-flight per-rank` → `allRanks.filter is not a function`) is
  **pre-existing** (its mock doesn't stub `rankService.list`) — reproduced identically on the clean base.
- `tsc`: zero new errors from this work; only 3 pre-existing test-file errors
  (`base-cache-control.test.ts`, `auth/auth.test.ts`).

### Rejected / deferred

- **Early-304 bootstrap (P0)** — deferred per the plan's own guidance: `gantt-service.ts` has no
  reliable server-side data-version source, and the plan says "If a reliable table-version source does
  not exist, implement metrics first and defer this item." Revisit once a crew/roster table-version
  key exists.
- **Live before/after measurement (sequence step 2) & EXPLAIN runs (P2)** — require the running
  server + remote DB; delivered as the metrics + the query-plan harness to run against live.

### Follow-up (priority order)

1. Run the query-plan harness + scrape `/metrics` against live; fill the before/after tables; add any
   missing indexes via `sql/migration/` (not the confirmed schema scripts).
2. Wire the gantt frontend to opt into `?view=summary` (pairing) and `?grouping=none` (flight) for the
   initial first-paint window, then fall back to full detail on demand (§First-Paint).
3. Revisit early-304 bootstrap once a table-version source exists.
4. Surface the legality `:meta` record through the recheck-status route for the UI.
