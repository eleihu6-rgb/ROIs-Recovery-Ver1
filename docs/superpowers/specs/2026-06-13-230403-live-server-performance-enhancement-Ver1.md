# Live Server Performance Enhancement Ver1

**Created**: 2026-06-13 23:04:03 America/Vancouver  
**Scope**: `live-server` only  
**Audience**: next AI coder implementing targeted performance work  
**Status**: audit / implementation backlog, no code changes applied in this pass

## Executive Summary

The highest potential wins are not in Fastify setup anymore. Compression, CORS preflight caching, Gantt bootstrap ETag, roster slim DTOs, and roster chunk caching already exist. The remaining high-value work is mostly:

1. Bulk-writing connector import workers instead of issuing many single-row statements.
2. Reducing full-table/full-range materialization in flight and pairing list endpoints.
3. Tightening Redis cache-key and invalidation strategy to avoid expensive `SCAN` patterns and stale grouped/count keys.
4. Adding endpoint-level timing/DB/cache metrics so future optimization is measured instead of guessed.

Do not modify `sql/` confirmed schema files directly unless the user asks. If indexes are needed, create a separate migration plan first.

## Priority Matrix

| Rank | Item | Potential Enhance | Quick Window | Risk |
|---:|---|---|---|---|
| 1 | Bulk import workers | Very high for connector loads, DB round trips, lock time | Large | Medium |
| 2 | Pairing list payload/count/coverage filtering | High for Gantt pairing pane and full-load mode | Medium | Medium |
| 3 | Flight grouped list materialization | High for flight pane first load and filters | Medium | Medium |
| 4 | Cache invalidation and cache-key hygiene | Medium-high for write latency and stale cache avoidance | Small/Medium | Medium |
| 5 | Flight compositions bulk cache shape | Medium for hover/status-bar paths | Small | Low |
| 6 | Crew list count/history query reduction | Medium for Gantt bootstrap/full crew list | Medium | Medium |
| 7 | Rule/violation init per-pairing loads | Medium-high for nightly/background jobs | Large | Medium |
| 8 | Request/DB/cache instrumentation | Enables all future work | Small | Low |
| 9 | DB index review for current queries | Potentially high, depends on `EXPLAIN` | Medium | Medium |

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

**Current bottleneck**:

- `flight-inbound-worker.ts` loops `job.records` and upserts one flight per statement with a savepoint per record.
- `crew-inbound-worker.ts` deletes/reinserts child tables per crew and per child row.
- `pairing-inbound-worker.ts` upserts one pairing, deletes segments, inserts each segment and composition row one by one.
- `roster-inbound-worker.ts` deletes by pairing/crew and inserts every segment row one by one.

**Implementation direction**:

- Keep per-record error behavior where the connector depends on it, but add a fast path for trusted batches.
- Convert flight imports to chunked multi-row `INSERT ... VALUES ... ON CONFLICT`.
- Convert pairing segments and compositions to chunked multi-row inserts per job or per pairing chunk.
- Convert roster inserts to chunked `INSERT ... SELECT FROM unnest(...)` or multi-row `VALUES`.
- For child syncs, prefer delete by `crew_id = ANY($1)` / `pairing_id = ANY($1)` once per chunk, then bulk insert children.
- Use chunks sized to stay under PostgreSQL parameter limits; start with 200-500 parent records per chunk.

**Verification**:

- Run existing worker unit tests:
  - `cd live-server && npm test -- src/__tests__/unit/flight-inbound-worker.test.ts`
  - `cd live-server && npm test -- src/__tests__/unit/crew-inbound-worker.test.ts`
  - `cd live-server && npm test -- src/__tests__/unit/pairing-inbound-worker.test.ts`
  - `cd live-server && npm test -- src/__tests__/unit/roster-inbound-worker.test.ts`
- Add a benchmark-style test or local script comparing statement count/time for 500, 2,000, and 10,000 records.

**Caution**:

- Do not remove savepoint/error semantics blindly. If partial import must continue after a bad record, preserve a fallback path.
- Watch trigger-side effects and composition-fill refreshes after bulk writes.

## 2. Pairing List: Payload, Count, and Coverage Filtering

**Potential enhance**: High for Gantt pairing pane, especially full-load `pageSize=0` and coverage filters.

**Quick window**: Medium.

**Target file**: `live-server/src/services/pairing/pairing-service.ts`

**Current bottleneck**:

- `pairingService.list` builds `pairingDataQuery.select()` and returns full pairing rows.
- It always runs a separate `count(*)`, even when `pageSize=0` returns all rows.
- It fetches all segments and compositions after paging, then applies `isFull` / `coverage` in Node. If those filters are active with normal pagination, `total` and page contents can be shaped by post-processing rather than SQL.
- Batch child fetches use raw `sql\`${pairingComposition.pairingId} IN ${pairingIds}\`` instead of the safer existing Drizzle `inArray(...)` pattern.

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
- Add tests for coverage filtering with totals.
- Use `EXPLAIN (ANALYZE, BUFFERS)` before and after for:
  - no filters, `pageSize=0`
  - date + base/fleet
  - date + coverage
  - date + `segFltNum`

**Caution**:

- Frontend may depend on current `segments` shape in the pairing pane. Confirm Gantt callers before shrinking payload.

## 3. Flight Grouped List Materialization

**Potential enhance**: High for flight pane when date range is wide or `pageSize=0`.

**Quick window**: Medium.

**Target file**: `live-server/src/services/flight/flight-service.ts`

**Current bottleneck**:

- `listGrouped` loads all matching flights, converts every row, groups/bin-packs everything, then slices the requested page.
- The comment says grouping needs all rows, which is partly true for exact grouped pagination. But normal first-page UI still pays the full range cost.
- The query uses `.select()` and returns full `flight` row width.

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

**Current bottleneck / risk**:

- `invalidatePattern` uses Redis `SCAN`; this is safer than `KEYS`, but still expensive on large keyspaces.
- `invalidateChunks` calls `invalidatePattern` once per id, so many affected crew ids can become many scans.
- Some flight writes invalidate `flight:list:*` but not `flight:grouped:*`, `flight:navicounts:*`, `flight:compositions:*`, or `flight:pairings:*`.
- Pairing writes invalidate `pairing:list:*`, but related detail keys (`pairing:crewids:*`, `pairing:crewdetail:*`, `flight:pairings:*`, flight composition cache) may remain stale depending on mutation path.

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
- Fix write invalidation coverage for flight grouped/count/composition keys.

**Verification**:

- `cd live-server && npm test -- src/__tests__/utils/cache.test.ts`
- Add tests proving:
  - broad invalidation increments namespace version.
  - stale version keys are not read after writes.
  - flight update invalidates grouped/navi/composition dependent data.

**Caution**:

- Versioned keys leave old keys to expire by TTL. Keep TTLs bounded and monitor Redis memory.

## 5. Flight Compositions Bulk Cache Shape

**Potential enhance**: Medium. The endpoint is called with up to 1000 ids and can create large cache keys.

**Quick window**: Small.

**Target files**:

- `live-server/src/services/flight/flight-service.ts`
- `live-server/src/routes/flight/flight.ts`

**Current bottleneck**:

- `getCompositions` builds a cache key with all sorted ids joined by comma.
- Different overlapping id sets cannot reuse partial cached data.
- Large id lists produce long Redis keys and force one cache miss to recompute all requested ids.

**Implementation direction**:

- Reuse the existing chunked cache pattern from `utils/cache.ts`.
- Cache per flight id:
  - `flight:composition:<flightId>`
- On miss, fetch all missed ids in one DB batch, then backfill one key per id.
- Keep the response contract as `Record<number, Record<string, { plan; actual }>>`.

**Verification**:

- `cd live-server && npm test -- src/__tests__/services/flight/flight-service.test.ts`
- Add cache hit/miss tests similar to roster chunk cache tests.

## 6. Crew List Count and History Query Reduction

**Potential enhance**: Medium for Gantt bootstrap and full crew list.

**Quick window**: Medium.

**Target file**: `live-server/src/services/crew/crew-service.ts`

**Current bottleneck**:

- `crewService.list` always executes `count(*)` before loading rows.
- In `pageSize=0` full-load mode, count can be derived from returned items.
- Rank sort uses correlated subqueries for current rank and rank display order. It is valuable for stable pane ordering, but may become expensive at larger crew scale.
- Non-slim mode fetches full rank/base/fleet history in separate queries for all returned crew.

**Implementation direction**:

- For `pagination.pageSize === 0`, skip count and use `items.length`.
- For `view=gantt-panel`, keep slim mode and avoid history.
- Consider a dedicated SQL projection for current rank/base/fleet using `DISTINCT ON` subqueries or lateral joins rather than several separate queries when crew count grows.
- Confirm index support for:
  - `crew_rank (crew_id, eff_dt, exp_dt)`
  - `crew_base (crew_id, eff_dt, exp_dt)`
  - `crew_fleet (crew_id, eff_dt, exp_dt)`
  Existing schema has some single-column indexes, but current-effective lookups may need composite coverage.

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

**Current bottleneck**:

- `handleCrew` loads pairing IDs for one crew, then loops pairings and calls `loadPairingInput` once per pairing.
- `loadCrewInfo` performs four separate queries per crew.
- The input hash only includes pairing ids. It may skip recompute when pairing composition/times/rules changed but pairing ids stayed the same. This is more correctness than performance, but it affects cache confidence.

**Implementation direction**:

- Add `loadPairingInputs(fastify, pairingIds: number[])` that loads all pairing segments for a crew's period in one query and groups in memory.
- Add `loadCrewInfoBatch` for orchestrated runs, or at least combine rank/fleet/airport lookups into fewer SQL calls.
- Expand input hash to include `pairing.updated_at`, relevant `pairing_segment.updated_at`, `roster_flight.updated_at`, and rule group version if available.
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

**Current gap**:

- Prometheus default Node metrics are exposed, but there is no request duration histogram by route/method/status.
- There is no DB query timing wrapper, Redis cache hit/miss counter, or endpoint payload-size metric.

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

**Queries worth checking**:

- `roster_flight`: `crew_id IN (...) AND sch_str_dt_utc BETWEEN ... AND is_deleted = 0`
- `pairing`: `sch_str_dt_utc BETWEEN ... AND is_deleted = 0`, plus sort by `sch_str_dt_utc`, `fleet`, `base`, `tafb`, `duration_days`
- `pairing_segment`: `pairing_id`, `flt_id`, `dep_arp`, `flt_num`, `is_deleted`
- `flight`: `flt_dt BETWEEN ... AND is_deleted = 0 ORDER BY sch_dep_dt_utc`
- `crew_rank`, `crew_base`, `crew_fleet`: current-effective lookups by `crew_id`, `eff_dt`, `exp_dt`

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

1. Skip `count(*)` for `pageSize=0` in `crewService.list` and `pairingService.list`.
2. Change `flightService.listGrouped` cache to cache the unpaged grouped result per filter, then slice per page.
3. Add request duration histogram and cache hit/miss counters.
4. Convert `flightService.getCompositions` to per-flight chunked cache.
5. Fix flight write invalidation so grouped/navi/composition-related caches cannot stay stale.

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

## Notes for the Next AI Coder

- Use existing patterns first: Fastify services, Drizzle, `getOrSet`, `getOrSetChunks`, Vitest tests.
- Do not add new dependencies for performance unless the user explicitly approves after license/security review.
- Avoid broad refactors. Each enhancement should be independently testable.
- Keep cache consistency rules from `live-server/CLAUDE.md`: DB transaction first, then cache invalidation/update.
- Any SQL/index change should be backed by measured `EXPLAIN`; do not tune by instinct.
