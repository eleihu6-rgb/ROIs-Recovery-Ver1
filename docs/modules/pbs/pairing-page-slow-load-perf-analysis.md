# PBS Pairing Bid Page — Slow Load Performance Analysis

Date: 2026-06-22
Module: pbs-portal (bid workbench) + pbs-server (`:3002`)
Author: Claude Code (analysis only — no product code changed)

---

## Summary

The Pairing bid page feels slow because the genuinely expensive work is not the page mount — it is the **live-schema pairing queries** that fire when the crew interacts with the page: the Pairing Number autocomplete (`/api/pairing-search/pairing-ids`), the SEARCH / pool-count preview (`/api/pairing-search/preview`, `…/current-rules/*`), and the airport options the config dialog loads. Every one of these filters the `pairing` table by `base` and a **bid-period date derived from `pairing.sch_str_dt_utc`**, and there is **no index covering that date column** in the live schema (the only date indexes are on a different column, `pairing_act_str_dt_utc`). The query then pays a **per-row correlated subquery into `pairing_segment` three times per pairing** to compute start/end dates, and wraps the pairing label in a **regex (`~`) that defeats the `interface_id` unique index**. On the remote demo Postgres (high network RTT, cold cache, no usable index) that compounds into the multi-second-to-minute waits the Playwright simulation papers over with a 120 s timeout. The other bid pages (days-off / line / reserve) are fast because they never touch the live `pairing`/`pairing_segment` tables on the hot path. **The single biggest lever: add the missing live-schema indexes (base + period-date on `pairing`, and a covering index for the segment min/max date rollups), then replace the per-row correlated subqueries with a single set-based join/aggregate.**

> Honesty note up front: I read all the code and SQL cited below and verified the index gap from `sql/schema/live/02-crew-roster.sql`. I did **not** run `EXPLAIN ANALYZE` against the demo DB, so the per-component millisecond figures in the breakdown table are **estimates** clearly labelled as such. The structural causes (missing index, correlated subqueries, non-sargable regex, RTT count) are **verified from code**.

---

## The data-loading path

### A. Page mount (gates the Playwright `pairing-add-properties-workspace` wait)

| Layer | File:line | What happens |
|---|---|---|
| Page component | `pbs-portal/src/features/pairing/pages/pairing-page.tsx:7` | `usePairingPageData()`; renders loading until data, then `PairingRightPanel`. |
| Query hook | `pbs-portal/src/features/pairing/hooks/use-pairing-page-data.ts:7-13` | TanStack `useQuery(["pairing","page-data"]) → pairingService.getPageData()`. |
| Service | `pbs-portal/src/shared/services/pairing-service.ts:99-102` (`getPageData` → `getCurrentDraft`) | `GET /pairing-bids/current`. |
| Route | `pbs-server/src/routes/pairing-bids.ts` (route table `packages/contracts/pbs-pairing-bids.js:2` `current: "/pairing-bids/current"`) | |
| Service | `pbs-server/src/services/pairing/pairing-bid-service.ts:252-286` `getCurrentDraft` | `Promise.all([getCurrentPeriodBidContext, getPropertyCatalog])`, then if a bid exists `Promise.all([loadDraftProperties, loadFavoriteProperties])`. |
| Read model | `pbs-server/src/services/pairing/pairing-bid-read-model.ts:70-150` `loadDraftProperties` | Reads **only PBS-schema** tables (`pbs_bid_group`, `pbs_bid_tier`, `pbs_bid_property`, occurrences). All indexed and small. |
| Workspace render | `pbs-portal/src/features/pairing/components/pairing-right-panel-sections.tsx:241` `data-testid="pairing-add-properties-workspace"` | Rendered from `data.rightPanel` (the draft) — no extra network call to appear. |

**Verified:** the page-mount endpoint (`/pairing-bids/current`) touches no live `pairing`/`pairing_segment` data; the property catalog (5 min TTL, `pairing-bid-service.ts:90,182-196`) and current period (60 s TTL, `pairing-bid-service.ts:91,198-229`) are cached in-process. So the workspace **can** appear quickly; the 120 s wait in `e2e/pages/pbs-portal/bid-workbench-page.ts:148` is slack tolerance, not the typical mount cost.

### B. The expensive interactions (where users actually wait)

These fire when the crew types a pairing label, presses SEARCH, or opens the config dialog — the steps the simulation drives in `fillPairingAutocomplete` (`bid-workbench-page.ts:357-388`) and `fillAirportSelect`.

1. **Pairing Number autocomplete** (debounced 300 ms, `pbs-portal/src/features/pairing/pairing-number-autocomplete.ts:27,29-33`)
   - Service: `pairing-service.ts:251-265` `searchPairingIds` → `GET /pairing-search/pairing-ids`.
   - Backend resolves the crew base first: `pairing-search-service.ts:95-104` → `resolveActorBaseForAutocomplete` (`:89-92`) → `resolvePairingSearchActorBase` (`actor-base.ts:28-67`) — **one extra round trip / query** (pbs_user + crew_base lateral) per autocomplete call.
   - The search SQL: `pairing-id-search-query.ts:126-167`.

2. **SEARCH / preview pool** — `pairing-service.ts:previewCurrentRules / countCurrentRules / countCurrentRuleTierPools` → `pairing-search-service.ts:154-445` → `executePreviewQuery` / `executePreviewCountQueries` (`pairing-search-preview-query.ts:216-340` / `152-214`). Each first runs `resolveActorContext` (`actor-base.ts:69-110`, another query).

3. **Airport options** (config dialog only) — `pairing-property-config-dialog.tsx:194` → `getAirportOptions` → `pairing-airport-options-query.ts:23-53` (joins `pairing_segment` × `pairing`, two UNION-ed scans).

### C. The SQL and the tables

- **Tables joined:** `pairing` (filtered by `base`, by period date, optionally by `pairing_composition` rank via `exists`), `pairing_segment` (for start/end date rollups and segment detail), `airport` (base zone lookup). This honours the data-model trap that **pairing does not directly join flight** — it goes through `pairing_segment` (`docs/architecture/data-model.md`).
- **The period filter expression (verified, appears in every hot query):**
  `(p.sch_str_dt_utc at time zone 'UTC')::date between $start::date and $end::date`
  e.g. `pairing-search-preview-query.ts:183`, `:249`; `pairing-airport-options-query.ts:33,46`; autocomplete uses a correlated variant `pairing-id-search-query.ts:112-124`.
- **The pairing-label expression (verified, non-sargable):** `pairing-display-label.ts:1-19` wraps `interface_id` in `upper(...) ~ '^[A-Z]+[A-Z0-9]*[0-9][A-Z0-9]*$'` and the autocomplete filters `upper(<expr>) like '%Q%'` (`pairing-id-search-query.ts:144`). The leading-`%` LIKE and the regex both prevent use of `uq_pairing_interface_id` / `idx_pairing_label_upper_active`.
- **Per-row correlated subqueries (verified, the N+1 inside SQL):** the paged-rows CTE runs, *for each returned pairing row*, three independent scalar subqueries against `pairing_segment` (`pairing-search-preview-query.ts:294-316`: `min(coalesce(brief_start,sch_str))`, `min(brief_start)`, `max(debrief_end)`). The autocomplete repeats the same shape (`pairing-id-search-query.ts:115-124,152-159`), and `getPairingDetails` again (`:443-465`).

---

## Where the time goes

Breakdown of a representative slow interaction (typing a pairing label → autocomplete options appear, OR pressing SEARCH on a busy base in the demo environment). Round-trip count is **verified from code**; the per-component latencies are **estimated** (no `EXPLAIN ANALYZE` was run).

| Component | Verified / Estimated | Latency | Why |
|---|---|---|---|
| Network round trips (login state already seeded) | **Verified** count: ≥2 per interaction (actor-base/context query is a separate `pgPool.query`, then the search query) | Estimated 2× RTT; remote demo DB RTT can be 50–300 ms each | `resolveActorBase`/`resolveActorContext` run before the search (`pairing-search-service.ts:99,155`); not batched into the main query. |
| `pairing` scan filtered by `base` + period | **Verified** no usable index on the period column; **Estimated** dominant cost | Estimated hundreds of ms to seconds on a busy base | Only `idx_pairing_base` (partial, base-only, `02-crew-roster.sql:1826`) is usable; the date filter on `sch_str_dt_utc` has **no index** (date indexes are on `pairing_act_str_dt_utc`, `:1089-1090`). |
| Non-sargable label match (regex + leading-`%` LIKE) | **Verified** structure; **Estimated** cost | Estimated adds a per-row CPU cost across the base-filtered set | `pairing-display-label.ts` regex + `like '%Q%'` (`pairing-id-search-query.ts:144`) force a row-by-row evaluation. |
| Per-row correlated subqueries into `pairing_segment` (×3) | **Verified** pattern; **Estimated** cost | Estimated the largest multiplier on result size | 3 scalar subqueries per paged/ matched row (`pairing-search-preview-query.ts:294-316`); `idx_pairing_segment_pair_active` helps each lookup but the repetition is the problem. |
| Payload transfer | **Verified** small for autocomplete (`limit` ≤ 50, `pairing-id-search-query.ts:30`); preview page size ≤ 100 (`pairing-search-service.ts:33`) | Estimated minor | Pagination already caps rows; compression already enabled (`pbs-server/src/app.ts`, `__tests__/plugins/compression.test.ts`). |
| Frontend render | **Verified** virtualization not needed (paged), debounce 300 ms | Estimated minor (<100 ms) | `pairing-number-autocomplete.ts:28` debounce; rows are paged. |

**Timing evidence in repo:** there is a baseline harness, not committed numbers. `pbs-server/src/scripts/pbs-performance-baseline-core.ts:254-351` measures exactly these endpoints — `pairing current draft` (`:269`), `portal bootstrap` (`:299`), `pairing search exact id` and `pairing search duration` (`:305,327`) — with p95/avg/max (`:353-373`) and a default budget asserted via `--budget-ms` (`pbs-performance-baseline.test.ts:82,88`). **Running this against the demo DB is the way to replace the estimates above with measured numbers** (§No-Illusion).

---

## Root causes (ranked)

1. **Missing index on the period-filter column `pairing.sch_str_dt_utc` (live schema).** — *Verified.* Every hot query filters `(p.sch_str_dt_utc at time zone 'UTC')::date between …` (`pairing-search-preview-query.ts:183,249`; `pairing-airport-options-query.ts:33,46`) but the live date indexes are on `pairing_act_str_dt_utc` (`sql/schema/live/02-crew-roster.sql:1089-1090`); the only usable index for these queries is the base-only partial `idx_pairing_base` (`:1826`). On a base with many pairings this is effectively a filtered scan.

2. **Per-row correlated subqueries against `pairing_segment` (N+1 inside one SQL statement).** — *Verified.* Three scalar subqueries per pairing row for start/end-date rollups (`pairing-search-preview-query.ts:294-316`; same in autocomplete `pairing-id-search-query.ts:115-124,152-159`; same in details `:443-465`). Result-set-proportional repetition; a single grouped join would compute all rollups once.

3. **Non-sargable pairing-label matching.** — *Verified.* `pairing-display-label.ts:1-19` wraps `interface_id` in a regex; autocomplete uses `upper(<expr>) like '%Q%'` (`pairing-id-search-query.ts:144`). Both prevent use of `uq_pairing_interface_id` (`02-crew-roster.sql:1871-1873`) and `idx_pairing_label_upper_active` (`:1856-1858`), so even an exact-prefix typeahead can't index-seek.

4. **Extra serial round trips per interaction (actor base/context resolved separately).** — *Verified.* `resolveActorBase`/`resolveActorContext` run as their own `pgPool.query` before the search query (`pairing-search-service.ts:99,155,238,324`; `actor-base.ts:34,75`). On a high-RTT remote DB each extra query adds a full round trip; the result (crew → base/rank) is stable per session and could be cached or folded into the main query.

5. **Date-filter wrapping defeats indexability even if an index existed.** — *Verified (hypothesis on fix).* `(col at time zone 'UTC')::date between …` is a function on the column, so a plain B-tree on `sch_str_dt_utc` only helps if the predicate is rewritten to a half-open timestamp range (`col >= start_ts and col < end_ts`) or an expression index is created. Pairing it with root cause #1.

6. **No result/aggregate caching for hot read paths.** — *Hypothesis.* Autocomplete and pool-count results for a (base, period, query) tuple are recomputed every call; only the property catalog, current period, and reference options are cached (`pairing-bid-service.ts:90-91`; `pairing-reference-options.ts:7`). Under a bid window the same base+period is queried by hundreds of crew.

---

## Recommendations (prioritized)

Each ties to a root cause above. Compression, private ETags (`pbs-server/src/utils/private-etag.ts`) and `/portal/bootstrap` already exist, so those are noted as *done* rather than re-proposed.

| # | Change | Ties to | Expected impact | Effort | Risk |
|---|---|---|---|---|---|
| 1 | **Add live-schema indexes for the pairing search path:** (a) `pairing (base, sch_str_dt_utc) where is_deleted = 0`; (b) an expression index `((sch_str_dt_utc at time zone 'UTC')::date)` or rewrite the predicate to a half-open `sch_str_dt_utc` range (see #3) so a plain B-tree applies; (c) confirm `pairing_segment (pairing_id, is_deleted) include (brief_start_utc, debrief_end_utc, sch_str_dt_utc, sch_end_dt_utc)` covers the rollups (today only `idx_pairing_segment_pair_active` on `(pairing_id,is_deleted)`, `:1859`). | RC1, RC5, RC2 | High — turns the base+period filter from a filtered scan into an index range; biggest single lever | Low (DDL migration under `sql/migration/`, no code change) | Low — additive indexes; verify write-amplification on import is acceptable |
| 2 | **Replace the 3× per-row correlated subqueries with one grouped join.** Compute `min/max` over `pairing_segment` once via `left join (select pairing_id, min(...), max(...) from pairing_segment where is_deleted=0 group by pairing_id) seg`, in `executePreviewQuery`, `searchPairingIdOptions`, and `executePairingDetailsQuery`. | RC2 | High — removes result-set-proportional repetition | Medium (rewrite 3 query builders; existing query tests in `pairing-search.test.ts` guard behaviour) | Medium — must preserve exact date semantics; add a regression test asserting identical rows/dates before/after |
| 3 | **Rewrite the period predicate to a sargable half-open range** on `sch_str_dt_utc` (`>= start_ts AND < end_ts`) instead of `(… at time zone 'UTC')::date between …`. | RC5, RC1 | High (compounds with #1) | Low-Medium (touch the `rpFilter`/`periodFilter` builders) | Medium — timezone boundary correctness; cover with a test at month edges |
| 4 | **Make the pairing-label prefix typeahead index-seekable.** For the common prefix case use `upper(interface_id) like 'Q%'` against `idx_pairing_label_upper_active` / a new `upper(interface_id)` index, keeping the regex only as a fallback classification, not in the `WHERE` of the hot path. | RC3 | Medium-High for autocomplete latency | Medium | Medium — must keep the same matched set; regression-test exact/prefix/contains ranking |
| 5 | **Fold or cache actor base/rank resolution.** Resolve once per session (it is stable) — cache in-process keyed by `crewId:userCode`, or CTE-join it into the main search query — to drop one round trip per interaction. | RC4 | Medium on high-RTT links (removes 1 RTT/call) | Low | Low — base can change between months; bound TTL or invalidate on period change |
| 6 | **Short-TTL cache for autocomplete + pool counts keyed by (base, period, query, rank).** Reuse the existing in-process TTL-cache pattern (`pairing-bid-service.ts:90`) or the PBS Redis instance (`pbs-server/CLAUDE.md` §缓存). | RC6 | Medium-High **under concurrency** (hundreds of crew share base+period) | Medium | Low-Medium — must invalidate on pairing import; stale-window acceptable for read-only counts |
| 7 | **First-paint subset for SEARCH (per §First-Paint).** Already paginated (page size ≤ 100). Ensure the *first* page returns in 1–2 s by deferring the heavier segment-detail join to a second lazy call for visible rows only. | RC2, First-Paint rule | Medium | Low (mostly already in place) | Low |
| 8 | **Capture the measured baseline** with `pbs-performance-baseline` against the demo DB to replace the estimates here and to gate regressions (§No-Illusion). | all | Enables proof | Low | None |

Alignment with existing efforts: response compression and private ETags are already implemented for stable GETs; ETag/`If-None-Match` could additionally be applied to the airport-options and reference-options GETs (stable per base+period) to skip payload on repeat. The live-server perf work (versioned cache keys, route metrics) is the template for #6 and #8 on the PBS side.

---

## Concurrency note (bid window, hundreds of simultaneous logins)

- **Read amplification on the same hot rows.** During a window, crew at the same base+period repeatedly run the same base/period-scoped pairing scans (autocomplete, SEARCH, pool counts). Without root causes #1/#2 fixed, each of those is a filtered scan + per-row segment subqueries, so N concurrent crew multiply DB CPU/IO by N over the *same* data — exactly what caching (#6) and indexing (#1) collapse.
- **Connection-pool pressure.** Every interaction issues ≥2 serial `pgPool.query` calls (actor-base then search; `actor-base.ts` + the search query). Hundreds of concurrent users × multiple slow queries each can saturate the pool; the project mandate is an independent pooled PG for PBS (`pbs-server/CLAUDE.md` §性能隔离: pgBouncer, separate pool, 2–4 instances + LB). Root cause #4/#5 (fewer round trips, cached base) directly reduces concurrent connection-holding time.
- **In-process caches help but are per-instance.** The catalog/period/reference caches (`pairing-bid-service.ts:90-91`, `pairing-reference-options.ts:7`) are per Node process; with horizontal scaling each instance warms independently. A shared Redis cache (#6) gives consistent hit rates across instances under load.
- **Page mount itself scales fine.** Because `/pairing-bids/current` is PBS-schema-only and cached, the *login → see workspace* step should not be the bottleneck at scale; the bottleneck is the *interactive* pairing-search load, which is where the concurrency risk concentrates.

---

## What I verified vs assumed

**Verified from code (cited):**
- The page-mount path and that the workspace render does not require a live-pairing query (`pairing-page.tsx`, `use-pairing-page-data.ts`, `pairing-bid-service.ts:252-286`, `pairing-bid-read-model.ts:70-150`, `pairing-right-panel-sections.tsx:241`).
- The 120 s wait is in the page object, not a measured mount cost (`bid-workbench-page.ts:148`).
- The exact hot SQL: period filter on `sch_str_dt_utc` (`pairing-search-preview-query.ts:183,249`; `pairing-airport-options-query.ts:33,46`; `pairing-id-search-query.ts:112-124`), the 3× per-row correlated subqueries (`pairing-search-preview-query.ts:294-316`; `pairing-id-search-query.ts:115-124,152-159`), the non-sargable label regex + leading-`%` LIKE (`pairing-display-label.ts:1-19`; `pairing-id-search-query.ts:144`).
- The index gap: live `pairing` date indexes are on `pairing_act_str_dt_utc`, **not** `sch_str_dt_utc`; only `idx_pairing_base` (base-only, partial) is usable for these queries (`sql/schema/live/02-crew-roster.sql:1089-1090,1826,1856-1860`).
- Extra serial queries for actor base/rank before each search (`actor-base.ts:28-110`; `pairing-search-service.ts:99,155,238,324`).
- Existing perf infrastructure: compression, private ETags, `/portal/bootstrap`, and the `pbs-performance-baseline` harness measuring these very endpoints (`pbs-server/src/app.ts`, `utils/private-etag.ts`, `scripts/pbs-performance-baseline-core.ts:254-373`).
- Other bid pages (days-off/line/reserve) use the rule-bid workspace, not the pairing workspace, and do not hit live `pairing`/`pairing_segment` on mount (`bid-workbench-page.ts:133-141`).

**Assumed / estimated (not measured here):**
- The per-component latency numbers in "Where the time goes" — no `EXPLAIN ANALYZE` was run against the demo DB. Run recommendation #8 to make them measured.
- That a base in the demo dataset has enough pairings for the base-only index to be insufficient (the structural risk is verified; the *magnitude* is an estimate).
- That remote-demo RTT is the dominant fixed cost per extra round trip (consistent with the repo's overseas-latency work, but not benchmarked in this analysis).
- The relative ranking of root cause #1 vs #2 as "biggest lever" is my judgement from the query shapes; an `EXPLAIN ANALYZE` would confirm which dominates for a given base.
