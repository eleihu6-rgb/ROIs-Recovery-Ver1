# Live Server Performance Enhancement Ver2 (validated)

**Created**: 2026-06-13 23:04:03 America/Vancouver (Ver1) → validated 2026-06-13 (Ver2)
**Scope**: `live-server` only
**Audience**: next AI coder implementing targeted performance work
**Status**: audit / implementation backlog — **every claim below code-verified against `main @ 987a5e28`**, no code changes applied in this pass

## What changed from Ver1 → Ver2

Ver1 was an audit written from inspection. Ver2 is the same backlog after a line-by-line validation of every claim against the actual source. Result:

- **All 9 items confirmed real.** Every cited file, function, bottleneck, and "already exists" claim was checked and matched the code (file:line stamped inline below).
- **Two claims sharpened** (they were directionally right but imprecise):
  - **Item 4 (flight invalidation)**: `create()` and `batchImport()` already clear the *entire* `flight:*` namespace, so they are NOT leaky. Only `update()` and `remove()` are the stale-cache paths. The fix narrows to those two methods.
  - **Item 7 (rule input hash)**: the hash includes `crewId` **and** sorted `pairingIds` (not "only pairing ids"). The correctness gap is still real — composition/time/rule changes that keep the same pairing-id set are not detected — but the framing is corrected.
- **Validation Log appendix** added at the end: every claim → TRUE / PARTIAL with file:line.

Do not modify `sql/` confirmed schema files directly unless the user asks. If indexes are needed, create a separate migration plan first.

## Executive Summary

The highest potential wins are not in Fastify setup anymore. The following already exist and were verified present:

- **brotli compression** — `live-server/src/index.ts:73-80` (`@fastify/compress`, `encodings: ['br','gzip','deflate']`, brotli quality 5, threshold 1024). ✓
- **CORS preflight caching** — `live-server/src/index.ts:68` (`maxAge: 3600`). ✓
- **Gantt bootstrap ETag/304** — `live-server/src/routes/gantt/gantt.ts:31-35` (SHA1 ETag, `if-none-match` → 304). ✓
- **roster slim DTOs** — `live-server/src/services/roster/roster-service.ts:69-142` (explicit ~25-column projection + duty fields, not full 79-column row). ✓
- **roster chunk caching** — `live-server/src/utils/cache.ts:43-89` (`getOrSetChunks` mGet + batched miss-fill) used by `roster-service.ts:52-56`. ✓

The remaining high-value work is mostly:

1. Bulk-writing connector import workers instead of issuing many single-row statements.
2. Reducing full-table/full-range materialization in flight and pairing list endpoints.
3. Tightening Redis cache-key and invalidation strategy to avoid expensive `SCAN` patterns and stale grouped/count keys.
4. Adding endpoint-level timing/DB/cache metrics so future optimization is measured instead of guessed.

## Priority Matrix

| Rank | Item | Potential Enhance | Quick Window | Risk | Validated |
|---:|---|---|---|---|---|
| 1 | Bulk import workers | Very high for connector loads, DB round trips, lock time | Large | Medium | ✓ all 6 workers single-row |
| 2 | Pairing list payload/count/coverage filtering | High for Gantt pairing pane and full-load mode | Medium | Medium | ✓ all 4 sub-claims |
| 3 | Flight grouped list materialization | High for flight pane first load and filters | Medium | Medium | ✓ all 3 sub-claims |
| 4 | Cache invalidation and cache-key hygiene | Medium-high for write latency and stale cache avoidance | Small/Medium | Medium | ✓ (sharpened, see item) |
| 5 | Flight compositions bulk cache shape | Medium for hover/status-bar paths | Small | Low | ✓ |
| 6 | Crew list count/history query reduction | Medium for Gantt bootstrap/full crew list | Medium | Medium | ✓ all 3 sub-claims |
| 7 | Rule/violation init per-pairing loads | Medium-high for nightly/background jobs | Large | Medium | ✓ (hash sharpened) |
| 8 | Request/DB/cache instrumentation | Enables all future work | Small | Low | ✓ only default node metrics |
| 9 | DB index review for current queries | Potentially high, depends on `EXPLAIN` | Medium | Medium | query shapes confirmed |

## 1. Bulk Import Workers

**Potential enhance**: Very high. Current connector workers perform many single-row `INSERT`/`DELETE` statements inside transactions. This is likely the largest backend throughput opportunity during inbound sync/import.

**Quick window**: Large, 1-2 focused implementation sessions.

**Target files**:

- `live-server/src/workers/flight-inbound-worker.ts`
- `live-server/src/workers/crew-inbound-worker.ts`
- `live-server/src/workers/pairing-inbound-worker.ts`
- `live-server/src/workers/roster-inbound-worker.ts`
- `live-server/src/workers/roster-ground-inbound-worker.ts`
- `live-server/src/workers/manday-inbound-worker.ts`

**Current bottleneck** (✓ verified):

- `flight-inbound-worker.ts:22-71` — loops `job.records`; `SAVEPOINT flt_sp` (`:24`) + one `INSERT ... ON CONFLICT` (`:25-70`) + `RELEASE SAVEPOINT` (`:71`) per record.
- `crew-inbound-worker.ts:126-130` — per-crew `SAVEPOINT crew_sp`, `upsertCrew`, then `syncChildren` (`:58-104`) does a bulk `DELETE ... WHERE crew_id = $1` per child table followed by **one-by-one** INSERT loops (bases `:59-63`, ranks `:68-77`, certs `:81-85`, etc.).
- `pairing-inbound-worker.ts:35-156` — per-pairing UPSERT (`:40-89`), `DELETE pairing_segment` (`:94`), nested `for duties → for segments` individual INSERT (`:97-146`), then per-composition INSERT loop (`:150-156`).
- `roster-inbound-worker.ts:77-126` — per record `DELETE roster_flight WHERE pairing_id AND crew_id` (`:93-95`) then one INSERT per segment (`:98-126`).
- `roster-ground-inbound-worker.ts` and `manday-inbound-worker.ts` confirmed present; both also do per-row inserts in loops (manday: one statement per row per date/tier partition).

**Implementation direction**:

- Keep per-record error behavior where the connector depends on it, but add a fast path for trusted batches.
- Convert flight imports to chunked multi-row `INSERT ... VALUES ... ON CONFLICT`.
- Convert pairing segments and compositions to chunked multi-row inserts per job or per pairing chunk.
- Convert roster inserts to chunked `INSERT ... SELECT FROM unnest(...)` or multi-row `VALUES`.
- For child syncs, prefer delete by `crew_id = ANY($1)` / `pairing_id = ANY($1)` once per chunk, then bulk insert children.
- Use chunks sized to stay under PostgreSQL parameter limits; start with 200-500 parent records per chunk.

**Verification** (✓ all 5 test files exist at `live-server/src/__tests__/unit/`):

- `cd live-server && npm test -- src/__tests__/unit/flight-inbound-worker.test.ts`
- `cd live-server && npm test -- src/__tests__/unit/crew-inbound-worker.test.ts`
- `cd live-server && npm test -- src/__tests__/unit/pairing-inbound-worker.test.ts`
- `cd live-server && npm test -- src/__tests__/unit/roster-inbound-worker.test.ts`
- (also present: `roster-ground-inbound-worker.test.ts`)
- Add a benchmark-style test or local script comparing statement count/time for 500, 2,000, and 10,000 records.

**Caution**:

- Do not remove savepoint/error semantics blindly. If partial import must continue after a bad record, preserve a fallback path. (Savepoints are the current per-record isolation mechanism — a bulk fast path must keep an equivalent fallback for poison rows.)
- Watch trigger-side effects and composition-fill refreshes after bulk writes.

## 2. Pairing List: Payload, Count, and Coverage Filtering

**Potential enhance**: High for Gantt pairing pane, especially full-load `pageSize=0` and coverage filters.

**Quick window**: Medium.

**Target file**: `live-server/src/services/pairing/pairing-service.ts`

**Current bottleneck** (✓ all verified):

- `list` builds `pairingDataQuery` with bare `.select()` → full pairing rows (`:302`).
- It always runs a separate `count(*)` in parallel, even when `pageSize=0` (`:307-315`, count at `:311-314`).
- It fetches all segments + compositions after paging (`:317-337`), enriches with `isCoverageMet()` in Node (`:355-367`), then post-filters `isFull` / coverage in Node (`:370-379`).
- Batch child fetches use raw `sql\`${pairingComposition.pairingId} IN ${pairingIds}\`` (`:325`) and the same for `pairingSegment` (`:332`) instead of Drizzle `inArray(...)`.

**Implementation direction**:

- Create a Gantt pairing DTO projection instead of `select()`.
- For `pageSize=0`, set `total = items.length` and skip the extra `count(*)`.
- Add optional `includeSegments` / `includeComposition` behavior only if all current callers allow it. If the Gantt client already has local flight/segment detail, return a lighter list by default.
- Move coverage filtering closer to SQL when possible:
  - Use `pairing_composition` aggregate by `pairing_id`.
  - Compute `open`, `partial`, `full`, `over` in SQL or via a materialized/precomputed coverage column if this becomes a hot path.
- Replace raw `IN` SQL with `inArray(pairingComposition.pairingId, pairingIds)` and `inArray(pairingSegment.pairingId, pairingIds)`.

**Verification**:

- `cd live-server && npm test -- src/__tests__/services/pairing/pairing-service.test.ts`
- Add tests for `pageSize=0` ensuring no pagination regression.
- Add tests for coverage filtering with totals (note: when coverage/`isFull` filters are active, current `total` comes from the SQL `count(*)` but page contents are Node-filtered — a test should assert they stay consistent).
- Use `EXPLAIN (ANALYZE, BUFFERS)` before and after for:
  - no filters, `pageSize=0`
  - date + base/fleet
  - date + coverage
  - date + `segFltNum`

**Caution**:

- Frontend may depend on current `segments` shape in the pairing pane. Confirm Gantt callers before shrinking payload. (Note from this session's gantt work: pairing list `segments` ARE consumed client-side — e.g. `bring-matches-to-top.ts` reads `item.segments[].fltId` for local flight→pairing matching. Do not drop `segments` from the default payload without updating those local-first consumers.)

## 3. Flight Grouped List Materialization

**Potential enhance**: High for flight pane when date range is wide or `pageSize=0`.

**Quick window**: Medium.

**Target file**: `live-server/src/services/flight/flight-service.ts`

**Current bottleneck** (✓ all verified):

- `listGrouped` loads all matching flights (`:237-241`, no SQL LIMIT/OFFSET), converts every row via `toFlightApi` (`:244`), groups via `groupFlights` (`:247`), then slices the page (`:251`).
- The query uses bare `.select()` → full `flight` row width (`:238`).
- The cache key includes `:${page}:${pageSize}` (`:221`), so each page recomputes all grouping on a cold key.

**Implementation direction**:

- Add a slim projection for fields used by `toFlightApi` and grouping only.
- Consider two modes:
  - exact mode for `pageSize=0` / export / full load
  - fast paged mode for first page, fetching a bounded date/window plus overfetch
- If exact grouped pagination must remain, cache the full grouped result by filter without page/pageSize, then slice cached grouped data for page keys. Today the cache key includes page/pageSize, causing each page to recompute all grouping.
- For `pageSize > 0`, store `flight:grouped-base:<filterHash>` and page results can be derived from it.
- Add local timing around query, conversion, grouping, and cache hit/miss.

**Verification**:

- `cd live-server && npm test -- src/__tests__/services/flight/flight-service.test.ts`
- Add tests that grouped pagination results are unchanged.
- Measure cold and warm cache times for one-month and two-month date ranges.

**Caution**:

- Bin-packing can move flights between rows if partial data is used. Only use fast paged mode if the UI accepts approximate/viewport-first grouping.

## 4. Cache Invalidation and Cache-Key Hygiene

**Potential enhance**: Medium-high. Reduces write latency and avoids stale or duplicate cache work.

**Quick window**: Small for bug fixes, medium for versioned namespaces.

**Target files**:

- `live-server/src/utils/cache.ts`
- `live-server/src/services/flight/flight-service.ts`
- `live-server/src/services/pairing/pairing-service.ts`
- `live-server/src/services/roster/roster-service.ts`
- base services under `live-server/src/services/base/`

**Current bottleneck / risk** (✓ verified, sharpened):

- `invalidatePattern` uses Redis `SCAN` with `MATCH`/`COUNT: 200` (`cache.ts:116-125`) — safer than `KEYS`, still expensive on large keyspaces.
- `invalidateChunks` calls `invalidatePattern` once per id via `Promise.all` (`cache.ts:103-110`) — N ids ⇒ N concurrent SCAN loops.
- **Flight writes (sharpened)**: `create()` (`flight-service.ts:367`) and `batchImport()` (`:426`) already do `invalidatePattern(redis, \`${CACHE_PREFIX}:*\`)` — they clear the WHOLE `flight:*` namespace, so they are **not** leaky. The stale-cache risk is only in **`update()` (`:378-379`) and `remove()` (`:411-412`)**, which clear only `flight:${id}` + `flight:list:*`, leaving `flight:grouped:*`, `flight:navicounts:*`, `flight:compositions:*`, `flight:pairings:*`, `flight:crew:*` stale. **Fix scope = those two methods.**
- **Pairing writes**: `create()` (`pairing-service.ts:420`), `update()` (`:431-432`), `remove()` (`:456-457`) invalidate `pairing:${id}` + `pairing:list:*` only. They leave `pairing:crewids:*`, `pairing:crewdetail:*`, `pairing:comp:*`, and cross-service `flight:pairings:*` stale — these depend on `roster_flight` links that can change outside pairing-service.

Confirmed cache-key prefixes:

- **flight**: `flight:list:*`, `flight:grouped:*`, `flight:navicounts:*`, `flight:${id}`, `flight:crew:${flightId}`, `flight:compositions:${ids}`, `flight:pairings:${flightId}`
- **pairing**: `pairing:list:*`, `pairing:${id}`, `pairing:crewids:${id}`, `pairing:crewdetail:${id}`, `pairing:comp:${id}`, `pairing:types`
- **roster**: `roster:chunk:${crewId}:${start}:${end}`, `roster:${id}`

**Implementation direction**:

- Introduce versioned cache namespaces:
  - `cachever:flight`
  - `cachever:pairing`
  - `cachever:roster`
  - `cachever:base`
- Include the version value in cache keys. On broad invalidation, increment the version key instead of scanning/deleting all old keys.
- Keep targeted direct `DEL` for known entity keys.
- For chunked roster invalidation, consider an id-specific version:
  - `roster:chunkver:<crewId>`
  - chunk key includes that version, avoiding per-crew `SCAN`.
- Fix `update()`/`remove()` flight invalidation to cover grouped/navicounts/composition/pairings keys (or — cheapest correct fix — make them call the same full `flight:*` clear that `create()` already uses).
- Fix pairing write paths to invalidate `pairing:crewids:*` / `pairing:crewdetail:*` and the cross-service `flight:pairings:*`. Note that `roster:chunkver` / `pairing:crewdetail` already get busted out-of-band today (this session: manual `pairing:crewdetail:*` bust to see roster edits) — a versioned namespace removes that manual step.

**Verification**:

- `cd live-server && npm test -- src/__tests__/utils/cache.test.ts`
- Add tests proving:
  - broad invalidation increments namespace version.
  - stale version keys are not read after writes.
  - flight `update`/`remove` invalidates grouped/navi/composition dependent data.

**Caution**:

- Versioned keys leave old keys to expire by TTL. Keep TTLs bounded and monitor Redis memory.

## 5. Flight Compositions Bulk Cache Shape

**Potential enhance**: Medium. The endpoint is called with up to 1000 ids and can create large cache keys.

**Quick window**: Small.

**Target files**:

- `live-server/src/services/flight/flight-service.ts`
- `live-server/src/routes/flight/flight.ts`

**Current bottleneck** (✓ verified):

- `getCompositions` dedups+sorts ids (`:521`) and builds `flight:compositions:${ids.join(',')}` (`:522`) — one monolithic key over all ids.
- Different overlapping id sets cannot reuse partial cached data.
- Large id lists produce long Redis keys and force one cache miss to recompute all requested ids.
- Response shape is `Record<number, Record<string, { plan: number; actual: number }>>` (`:551`).

**Implementation direction**:

- Reuse the existing chunked cache pattern from `utils/cache.ts` (`getOrSetChunks`).
- Cache per flight id:
  - `flight:composition:<flightId>`
- On miss, fetch all missed ids in one DB batch, then backfill one key per id.
- Keep the response contract as `Record<number, Record<string, { plan; actual }>>`.
- This change also fixes the item-4 stale risk for compositions: per-id keys can be invalidated by id on flight write instead of relying on the namespace clear.

**Verification**:

- `cd live-server && npm test -- src/__tests__/services/flight/flight-service.test.ts`
- Add cache hit/miss tests similar to roster chunk cache tests.

## 6. Crew List Count and History Query Reduction

**Potential enhance**: Medium for Gantt bootstrap and full crew list.

**Quick window**: Medium.

**Target file**: `live-server/src/services/crew/crew-service.ts`

**Current bottleneck** (✓ all verified):

- `list` runs `count(*)::int` unconditionally before rows (`:197`); row query is `pageSize`-gated (`:200-205`) but count is not.
- Rank sort (`case 'rank'`, `:177-189`) uses correlated subqueries: current rank `crew_rank` lookup (`:184`) and `rank.display_order` lookup (`:188`). Valuable for stable pane ordering (it mirrors the roster pane's `compareRosterDefault`), but scales with crew count. *(This is the rank-sort added earlier this session so server SQL matches pane order — keep its behavior; only optimize the query shape, never the ordering.)*
- Non-slim mode runs 6 parallel queries incl. full rank/base/fleet **history** when `needHistory` (`:246-255`); slim mode (`view=gantt-panel`) runs only 3 current-state queries (`:252-254`).

**Implementation direction**:

- For `pagination.pageSize === 0`, skip count and use `items.length`.
- For `view=gantt-panel`, keep slim mode and avoid history.
- Consider a dedicated SQL projection for current rank/base/fleet using `DISTINCT ON` subqueries or lateral joins rather than several separate queries when crew count grows.
- Confirm index support for:
  - `crew_rank (crew_id, eff_dt, exp_dt)`
  - `crew_base (crew_id, eff_dt, exp_dt)`
  - `crew_fleet (crew_id, eff_dt, exp_dt)`
  Existing schema has some single-column indexes, but current-effective lookups (used by both the rank sort subquery and the slim current-state queries) may need composite coverage.

**Verification**:

- `cd live-server && npm test -- src/__tests__/services/crew/crew-service.test.ts`
- Add a `pageSize=0` test.
- Compare `EXPLAIN` for rank sort before/after if query structure changes.

## 7. Rule / Violations Init Per-Pairing Loads

**Potential enhance**: Medium-high for nightly and manual rule init jobs.

**Quick window**: Large.

**Target files**:

- `live-server/src/workers/violations-init-worker.ts`
- `live-server/src/services/rule-check/rule-check-data-service.ts`
- `live-server/src/services/rule-check/rule-check-result-service.ts`

**Current bottleneck** (✓ verified, hash sharpened):

- `handleCrew` loads all pairing IDs for the crew once via `loadCrewPairingsForPeriod` (`violations-init-worker.ts:360`), then loops and calls `loadPairingInput` once per pairing (`:404-407`).
- `loadCrewInfo` runs **4 separate** `pgPool.query()` per crew: crew div/birthday (`rule-check-data-service.ts:170`), current rank (`:173-177`), current fleet (`:180-183`), distinct qualification airports (`:186-189`).
- `loadPairingInput` exists (`:117-154`) — single JOIN query per pairing.
- **Hash (corrected)**: `computeInputHash(crewId, pairingIds)` hashes `{ crewId, ids: [...pairingIds].sort() }` (`violations-init-worker.ts:145-148`). So it keys on crew + the *set* of pairing ids — NOT "only pairing ids". The real gap: if a pairing's composition / times / rules change but the id set is unchanged, the hash matches and recompute is skipped. That is a cache-confidence/correctness concern, not just performance.
- `rule-check-result-service.ts` confirmed present — upsert/query of pairing- and roster(monthly)-level violation results (`upsertPairingResult`, `bulkUpsertPairingResults`, `upsertRosterResult`, `query*`, `incrementBatchProgress`). It does NOT consume the input hash; the hash is stored separately in Redis (32-day TTL) for dedup.

**Implementation direction**:

- Add `loadPairingInputs(fastify, pairingIds: number[])` that loads all pairing segments for a crew's period in one query and groups in memory.
- Add `loadCrewInfoBatch` for orchestrated runs, or at least combine rank/fleet/airport lookups into fewer SQL calls.
- Expand input hash to include `pairing.updated_at`, relevant `pairing_segment.updated_at`, `roster_flight.updated_at`, and rule group version if available — so same-id-set-but-changed-content correctly invalidates.
- Preserve concurrency limiter while reducing per-crew DB round trips.

**Verification**:

- Existing rule-check tests:
  - `cd live-server && npm test -- src/__tests__/services/rule-check/rule-check-data-service.test.ts`
  - `cd live-server && npm test -- src/__tests__/services/rule-check/rule-check-result-service.test.ts`
- Add a batch loader test comparing output to repeated single loaders.

## 8. Endpoint-Level Metrics

**Potential enhance**: Enables future work and prevents blind tuning.

**Quick window**: Small.

**Target files**:

- `live-server/src/plugins/metrics.ts`
- `live-server/src/index.ts`

**Current gap** (✓ verified):

- `metrics.ts` is ~12 lines: only `collectDefaultMetrics({ prefix: 'rois_live_server_' })` + `/metrics` route. No per-route request-duration histogram.
- No DB query timing wrapper, no Redis cache hit/miss counter, no payload-size metric.

**Implementation direction**:

- Add `Histogram` for HTTP request duration:
  - labels: `method`, `route`, `status_code`
  - buckets suitable for API latency, e.g. `0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10`
- Add cache counters in `getOrSet` / `getOrSetChunks`:
  - `cache_hit_total`
  - `cache_miss_total`
  - labels: `namespace`
- Optionally add response payload byte histogram from `reply.getHeader('content-length')` when available.

**Verification**:

- `cd live-server && npm test -- src/__tests__/plugins/metrics.test.ts`
- Add a test that a sample route increments the request histogram.

**Caution**:

- Do not label metrics with raw URLs, crew ids, flight ids, or user data. Use route patterns only.

## 9. DB Index Review for Current Query Shape

**Potential enhance**: Potentially high, but must be measured.

**Quick window**: Medium.

**Target area**:

- Do not edit confirmed schema files directly.
- Create a migration proposal after `EXPLAIN` proves benefit.

**Queries worth checking** (shapes confirmed against the services above):

- `roster_flight`: `crew_id IN (...) AND sch_str_dt_utc BETWEEN ... AND is_deleted = 0`
- `pairing`: `sch_str_dt_utc BETWEEN ... AND is_deleted = 0`, plus sort by `sch_str_dt_utc`, `fleet`, `base`, `tafb`, `duration_days`
- `pairing_segment`: `pairing_id`, `flt_id`, `dep_arp`, `flt_num`, `is_deleted`
- `flight`: `flt_dt BETWEEN ... AND is_deleted = 0 ORDER BY sch_dep_dt_utc`
- `crew_rank`, `crew_base`, `crew_fleet`: current-effective lookups by `crew_id`, `eff_dt`, `exp_dt` (hit by both the crew rank-sort subquery and the slim current-state queries)

**Implementation direction**:

- Gather `EXPLAIN (ANALYZE, BUFFERS)` from the f8 schema using representative dates.
- Prefer partial indexes where `is_deleted = 0` is always present.
- Prefer composite indexes matching filter + sort order:
  - Example candidate only after measurement: `flight (flt_dt, sch_dep_dt_utc) WHERE is_deleted = 0`
  - Example candidate only after measurement: `pairing (sch_str_dt_utc) WHERE is_deleted = 0`
  - Example candidate only after measurement: `roster_flight (crew_id, sch_str_dt_utc) WHERE is_deleted = 0`

**Verification**:

- Attach before/after `EXPLAIN` output to the implementation PR or handoff.
- Confirm write/import slowdown from added indexes is acceptable.

## Suggested Quick Wins First

1. Skip `count(*)` for `pageSize=0` in `crewService.list` (`crew-service.ts:197`) and `pairingService.list` (`pairing-service.ts:311-314`).
2. Change `flightService.listGrouped` cache to cache the unpaged grouped result per filter, then slice per page (`flight-service.ts:221`).
3. Add request duration histogram and cache hit/miss counters.
4. Convert `flightService.getCompositions` to per-flight chunked cache (`flight-service.ts:521-522`).
5. Fix flight `update()`/`remove()` invalidation (`flight-service.ts:378-379, 411-412`) so grouped/navi/composition/pairings caches cannot stay stale — cheapest correct fix is to reuse the full `flight:*` clear that `create()` already does.

## Suggested Implementation Order

1. Instrument first, so later changes have timing evidence.
2. Apply safe request-time quick wins: skip redundant counts, slim projections, cache-key fixes.
3. Optimize flight grouped list.
4. Optimize pairing list coverage/payload behavior.
5. Refactor import workers in one worker at a time, starting with `flight-inbound-worker.ts`.
6. Revisit DB indexes only after `EXPLAIN` points to a real bottleneck.

## Test Command Starter Pack

```bash
cd live-server
npm run build
npm test -- src/__tests__/utils/cache.test.ts
npm test -- src/__tests__/plugins/metrics.test.ts
npm test -- src/__tests__/services/flight/flight-service.test.ts
npm test -- src/__tests__/services/pairing/pairing-service.test.ts
npm test -- src/__tests__/services/crew/crew-service.test.ts
npm test -- src/__tests__/unit/flight-inbound-worker.test.ts
npm test -- src/__tests__/unit/pairing-inbound-worker.test.ts
npm test -- src/__tests__/unit/roster-inbound-worker.test.ts
```

> Pre-existing baseline (from this session): live-server has ~5-7 known-red vitest cases unrelated to these items. Capture a clean baseline run before starting so new failures are attributable.

## Notes for the Next AI Coder

- Use existing patterns first: Fastify services, Drizzle, `getOrSet`, `getOrSetChunks`, Vitest tests.
- Do not add new dependencies for performance unless the user explicitly approves after license/security review.
- Avoid broad refactors. Each enhancement should be independently testable.
- Keep cache consistency rules from `live-server/CLAUDE.md`: DB transaction first, then cache invalidation/update.
- Any SQL/index change should be backed by measured `EXPLAIN`; do not tune by instinct.
- The crew rank-sort SQL (item 6) intentionally mirrors the gantt roster pane order. If you touch it, the gantt windowed-first-paint safeguard suite (`e2e/tests/gantt/windowed-first-paint.spec.ts`) asserts top-crew stability — run it after any ordering-adjacent change.

## Validation Log (Ver2)

Every Ver1 claim re-checked against `main @ 987a5e28` on 2026-06-13.

| # | Claim | Status | Evidence |
|---|---|---|---|
| Sum | brotli compression registered | TRUE | index.ts:73-80 |
| Sum | CORS preflight caching (maxAge) | TRUE | index.ts:68 |
| Sum | Gantt bootstrap ETag/304 | TRUE | gantt.ts:31-35 |
| Sum | roster slim DTOs | TRUE | roster-service.ts:69-142 |
| Sum | roster chunk caching | TRUE | cache.ts:43-89; roster-service.ts:52-56 |
| 1a | flight worker single-row + savepoint per record | TRUE | flight-inbound-worker.ts:22-71 |
| 1b | crew worker per-crew bulk delete + one-by-one child inserts | TRUE | crew-inbound-worker.ts:126-130, 58-104 |
| 1c | pairing worker one-by-one segment + composition inserts | TRUE | pairing-inbound-worker.ts:35-156 |
| 1d | roster worker delete + per-segment inserts | TRUE | roster-inbound-worker.ts:77-126 |
| 1e | ground + manday workers exist (also per-row) | TRUE | files present |
| 1f | 5 worker unit tests exist | TRUE | src/__tests__/unit/*-inbound-worker.test.ts |
| 2a | pairing list bare .select() | TRUE | pairing-service.ts:302 |
| 2b | always count(*) even pageSize=0 | TRUE | pairing-service.ts:311-314 |
| 2c | segments/comp fetched post-page, coverage filtered in Node | TRUE | pairing-service.ts:317-379 |
| 2d | raw `IN` instead of inArray | TRUE | pairing-service.ts:325, 332 |
| 3a | listGrouped loads all → group → slice | TRUE | flight-service.ts:237-251 |
| 3b | bare .select() full row | TRUE | flight-service.ts:238 |
| 3c | cache key includes page/pageSize | TRUE | flight-service.ts:221 |
| 4a | invalidatePattern uses SCAN | TRUE | cache.ts:116-125 |
| 4b | invalidateChunks SCANs once per id | TRUE | cache.ts:103-110 |
| 4c | getOrSet/getOrSetChunks signatures | TRUE | cache.ts:6-30, 43-89 |
| 4d | flight writes leak grouped/navi/comp/pairings | **PARTIAL** | create/batchImport clear all (367,426); only update/remove leak (378-379,411-412) |
| 4e | pairing writes leave crewids/crewdetail stale | TRUE | pairing-service.ts:420,431-432,456-457 |
| 5a | compositions cache key = all ids joined | TRUE | flight-service.ts:521-522 |
| 5b | response shape Record<number,Record<string,{plan;actual}>> | TRUE | flight-service.ts:551 |
| 6a | crew list always count(*) | TRUE | crew-service.ts:197 |
| 6b | rank sort uses correlated subqueries | TRUE | crew-service.ts:184,188 |
| 6c | non-slim fetches history; slim avoids it | TRUE | crew-service.ts:246-255 |
| 7a | handleCrew loops loadPairingInput per pairing | TRUE | violations-init-worker.ts:360,404-407 |
| 7b | loadCrewInfo = 4 queries per crew | TRUE | rule-check-data-service.ts:170-190 |
| 7c | input hash = crewId + sorted pairingIds | **PARTIAL** | hash includes crewId too (violations-init-worker.ts:145-148); content-change gap still real |
| 7d | rule-check-result-service exists | TRUE | file present; no hash usage |
| 8a | only collectDefaultMetrics, no request histogram | TRUE | metrics.ts (full file) |
| 8b | no DB/cache/payload metrics | TRUE | metrics.ts (full file) |
