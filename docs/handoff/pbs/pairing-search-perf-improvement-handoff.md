# Handoff — PBS Pairing-Search Performance Improvement

- **Date:** 2026-06-22
- **Module:** pbs-server (`:3002`) live-schema pairing queries + supporting SQL indexes; pbs-portal (verification only)
- **Status:** Ready to implement. Analysis complete and re-verified. **No product code changed by this handoff.**
- **Source analysis:** `docs/modules/pbs/pairing-page-slow-load-perf-analysis.md` (read it in full)
- **Repo root:** `/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS`

> This document is self-contained. Another agent can implement the fixes from this doc + the codebase with no prior context. Every file:line was re-opened and verified on 2026-06-22 (see the **Re-verification log** at the bottom). Where I found the source analysis slightly off, it is flagged inline with **⚠ CORRECTION**.

---

## 1. Problem & business impact

The Pairing bid page in pbs-portal feels slow. The genuinely expensive work is **not the page mount** — it is the **live-schema pairing queries** that fire when a crew member *interacts* with the page:

- **Pairing Number autocomplete** — `GET /api/pairing-search/pairing-ids`
- **SEARCH / pool-count preview** — `POST /api/pairing-search/preview`, `POST /api/pairing-search/current-rules/counts`, `POST /api/pairing-search/current-rules/tier-pools`
- **Airport options** (config dialog) — `GET /api/pairing-search/airport-options`

Every one of these filters the live `pairing` table by `base` and a **bid-period date derived from `pairing.sch_str_dt_utc`**, for which **there is no usable index** (the only date indexes are on a *different* column, `pairing_act_str_dt_utc`). The preview/details queries also pay **per-row correlated subqueries into `pairing_segment` (×3 per pairing row)** to compute start/end dates. On the remote demo Postgres (high RTT, cold cache, no usable index) this compounds into the **multi-second-to-~2-minute** waits.

The other bid pages (days-off / line / reserve) are fast because they use the rule-bid workspace and **never touch the live `pairing` / `pairing_segment` tables** on the hot path.

**Honesty finding (do not "fix" the wrong thing):** the page-mount endpoint `GET /api/pairing-bids/current` reads **only PBS-schema** tables and is in-process cached (property catalog 5 min TTL, current period 60 s TTL). It is **NOT the bottleneck.** The `120_000`ms wait in the Playwright page object (`e2e/pages/pbs-portal/bid-workbench-page.ts:148`) is **slack tolerance, not a measured mount cost.** The real cost is the *interactive* live-table query.

**Scalability risk:** real bid windows = **hundreds of crew at the same base+period logging in concurrently**, all running the same base/period-scoped pairing scans + per-row segment subqueries. Without indexing + de-duplicating the segment rollups, N concurrent crew multiply DB CPU/IO by N over the **same** data, and each interaction holds ≥2 serial pool connections. This is the genuine scaling risk, distinct from the (already-fine) page mount.

---

## 2. Root causes (ranked)

All file:line below were re-opened and confirmed on 2026-06-22.

| # | Root cause | Status | Evidence (file:line) |
|---|---|---|---|
| **RC1** | **No index on the period-filter column `pairing.sch_str_dt_utc` (live schema).** Every hot query filters `(p.sch_str_dt_utc at time zone 'UTC')::date between …`, but the live `pairing` date indexes are on `pairing_act_str_dt_utc`. The only usable index for these queries is the base-only partial `idx_pairing_base`. | **Verified** | Filter: `pairing-search-preview-query.ts:183` and `:249`; `pairing-airport-options-query.ts:33` and `:46`. Date indexes on the wrong column: `sql/schema/live/02-crew-roster.sql:1089-1090`. Base-only partial index: `:1826-1827`. |
| **RC2** | **Per-row correlated subqueries into `pairing_segment` (×3 per pairing row).** For each returned row, 3 independent scalar subqueries compute `min(coalesce(brief_start_utc, sch_str_dt_utc))`, `min(brief_start_utc)`, `max(debrief_end_utc)`. A single grouped join would compute all rollups once. | **Verified** | Preview: `pairing-search-preview-query.ts:294-316`. Details: `pairing-search-preview-query.ts:443-465`. ⚠ **CORRECTION:** the **autocomplete** (`pairing-id-search-query.ts`) already uses a grouped `LEFT JOIN pairing_segment … group by` for the start/end rollups (`:160-164`). The source analysis claimed autocomplete repeats the 3× correlated pattern at `:115-124,152-159` — that is **not accurate for the rollups**; only its **period filter** (`:113-124`) still embeds one correlated subquery. So RC2's correlated-subquery fix applies to **preview + details only**; autocomplete needs only the RC5 period-filter rewrite. |
| **RC3** | **Non-sargable pairing-label matching.** The display-label expression wraps `interface_id` in a regex (`~ '^[A-Z]+[A-Z0-9]*[0-9][A-Z0-9]*$'`), and autocomplete matches `upper(<expr>) like '%Q%'` (leading-`%`). Both defeat `uq_pairing_interface_id` and `idx_pairing_label_upper_active`. | **Verified** | Regex: `pairing-display-label.ts:5`. Contains-LIKE: `pairing-id-search-query.ts:144` (uses `$1` = `%Q%` built at `:107`). Indexes defeated: `02-crew-roster.sql:1856-1858` (`idx_pairing_label_upper_active`), `:1871-1873` (`uq_pairing_interface_id`). |
| **RC4** | **Extra serial round trips per interaction** — actor base / rank resolved as a separate `pgPool.query` *before* the search query; the result (crew → base/rank) is stable per session. On a high-RTT remote DB each extra query is a full round trip. | **Verified** (structural) | `pairing-search-service.ts` resolves actor base/context before each search; `actor-base.ts` issues its own queries. (Line numbers cited in the source analysis: `pairing-search-service.ts:99,155,238,324`; `actor-base.ts:28-110`. I confirmed the *service imports & uses* actor-base; I did **not** line-by-line re-verify every one of those four call sites — treat the *pattern* as verified, the exact line numbers as **trust-but-confirm-before-editing**.) |
| **RC5** | **Date-filter wrapping defeats indexability even if an index existed.** `(col at time zone 'UTC')::date between …` is a function over the column, so a plain B-tree on `sch_str_dt_utc` only helps if the predicate is rewritten to a half-open timestamp range (`>= start AND < end`) or an expression index is created. Pairs with RC1. | **Verified** (the expression); **fix is a hypothesis to prove with EXPLAIN** | Same lines as RC1. |
| **RC6** | **No result/aggregate caching for hot read paths.** Autocomplete + pool counts for a `(base, period, query, rank)` tuple are recomputed every call; only the catalog/period/reference options are cached. Under a window the same base+period is queried by hundreds of crew. | **Hypothesis** | Caches that exist: `pairing-bid-service.ts:90-91`; `pairing-reference-options.ts:7`. |

**Ranking rationale:** RC1+RC5 are the single biggest lever (turn a filtered scan into an index range). RC2 is the next biggest multiplier on the *preview/details* paths. RC3 affects autocomplete latency specifically. RC4/RC6 are concurrency/RTT levers. An `EXPLAIN ANALYZE` (Task 0) should confirm whether RC1 or RC2 dominates for a given base before heavy investment in RC2.

---

## 3. Implementation plan — ordered tasks

> **Sequencing:** Do **Task 0 (baseline)** first, then **Task 1 (indexes)** — lowest risk, no code change — re-measure, then the query rewrites (Tasks 2–3), then optional Tasks 4–6. Indexes first, measure, then code. See §5 for rollback.

### Conventions you must follow

- **DDL migration files** live in `sql/migration/` (confirmed: `sql/migration/` exists, contains dated `.sql` files + `README.md`). **Naming convention:** `YYYY-MM-DD-<kebab-description>.sql` (e.g. existing `2026-06-15-assignment-add-fixed-credit.sql`). Scripts contain **no schema prefix** — they run under `SET search_path TO <airline>` (`sql/migration/README.md:42`). Make them **idempotent** with `IF NOT EXISTS` (`README.md:39`). Top-of-file comment block is mandatory (date, purpose, background — `README.md:40`). After writing, add a row to the `已执行迁移` / `待执行迁移` tables in `sql/migration/README.md`.
- **Index naming:** lowercase `snake_case`, prefix `idx_<table>_<cols>` for non-unique, `uq_…` for unique. Partial indexes use `where is_deleted = 0` (matches `idx_pairing_base`, `02-crew-roster.sql:1826`). The *canonical* live schema also lists these indexes in `sql/schema/live/02-crew-roster.sql` — **add the new index DDL there too** (in the performance-index block around `:1820-1873`) so a fresh airline init gets them, AND ship the migration for already-initialised schemas. Do **not** modify the confirmed table DDL above line 1088.
- **Version bump:** pbs-server is backend. Per CLAUDE.md, bump `PBS_BACKEND_VERSION` in `gantt/src/version.ts` (+1) for the query-rewrite tasks. (Pure index DDL with no pbs-server code change technically does not require a bump, but bump once when you ship the code rewrites.) ⚠ Note `gantt/src/version.ts` distinguishes a global `BACKEND_VERSION` (currently 159) and a **PBS-specific** `PBS_BACKEND_VERSION` (currently 9). For pbs-server changes bump **`PBS_BACKEND_VERSION`** (the PBS counter); follow the file's own comment.

---

### Task 0 — Capture the measured BEFORE baseline (do this first)

- **Goal:** Replace the source analysis's *estimated* latencies with measured numbers and get a regression gate. Addresses **§No-Illusion** + RC1–RC6 verification.
- **Files:** none changed. Use the existing harness `pbs-server/src/scripts/pbs-performance-baseline.ts` (entry) + `pbs-server/src/scripts/pbs-performance-baseline-core.ts` (logic). The default endpoint set (`buildDefaultPerformanceEndpoints`, `pbs-performance-baseline-core.ts:253-351`) already covers `pairing current draft` (`:269`), `portal bootstrap` (`:299`), `pairing search exact id` (`:305`, hits `POST /api/pairing-search/preview`), and `pairing search duration` (`:327`).
- **How to run:** the npm script is `perf:pbs` (`pbs-server/package.json:13` → `tsx src/scripts/pbs-performance-baseline.ts`).

  ```bash
  cd "/Users/kimi/Library/.../ROIs-Crew-Ver4-PBS/pbs-server"
  # Requires a running pbs-server (:3002 by default) AND DATABASE_URL set (see §8).
  # Config is read from env + CLI flags (parsePerformanceBaselineConfig, core.ts:158-205):
  #   PORT (default 3002), PBS_PERF_BASE_URL, PBS_PERF_SAMPLES / --samples (default 5),
  #   PBS_PERF_BUDGET_MS / --budget-ms (default 2000), PBS_SCHEMA (default f8_pbs),
  #   PBS_PERF_PAIRING_ID / a CLI arg (default "M4959"), DATABASE_URL, JWT_SECRET.
  npm run perf:pbs -- --samples 5 --budget-ms 2000
  ```

  It prints per-endpoint `min/avg/p95/max` (`summarizeDurations`, `core.ts:369-380`) and exits non-zero if any endpoint exceeds the budget (`overBudget = metrics.maxMs > config.budgetMs`, `core.ts:513`; report `core.ts:589`).
- **Output:** paste the BEFORE table into the implementation PR. Save it (e.g. under `docs/dev-context/`) so AFTER is comparable.
- **Effort:** Low. **Risk:** None (read-only).

---

### Task 1 — Add live-schema indexes for the pairing search path

- **Goal:** Turn the `base` + period-date filter from a filtered scan into an index range; ensure the segment rollups are index-backed. Addresses **RC1, RC5, RC2 (supporting)**.
- **Files to change:**
  - **New migration:** `sql/migration/2026-06-22-pairing-search-perf-indexes.sql`
  - **Canonical schema (additive):** `sql/schema/live/02-crew-roster.sql` performance-index block (~`:1820-1873`)
- **Current state (quote):** the only date indexes are on the wrong column —
  ```sql
  -- sql/schema/live/02-crew-roster.sql:1089-1090
  create index idx_pairing_base_fleet   on pairing (base, fleet, pairing_act_str_dt_utc);
  create index idx_pairing_str_end      on pairing (pairing_act_str_dt_utc, pairing_act_end_dt_utc);
  -- :1826-1827 (the only index the hot query can use today)
  create index idx_pairing_base
      on pairing (base) where is_deleted = 0;
  -- :1859-1860 (segment lookup, supports the per-pairing subqueries today)
  create index idx_pairing_segment_pair_active
      on pairing_segment (pairing_id, is_deleted);
  ```
- **Proposed DDL** (lowercase, snake_case, partial-on-`is_deleted` per repo convention). Use `CREATE INDEX CONCURRENTLY` when running against a live DB to avoid table locks; in the committed migration file ship the plain `IF NOT EXISTS` form (migrations run in a transaction and `CONCURRENTLY` cannot run inside one — note this in the file header and run CONCURRENTLY manually on prod if needed):

  ```sql
  -- (a) base + period-date composite for the hot filter (RC1)
  create index if not exists idx_pairing_base_sch_str
      on pairing (base, sch_str_dt_utc)
      where is_deleted = 0;

  -- (b) covering index for the segment min/max rollups (RC2) so the grouped
  --     aggregate (Task 2) is index-only / index-backed.
  create index if not exists idx_pairing_segment_pair_rollup
      on pairing_segment (pairing_id)
      include (brief_start_utc, debrief_end_utc, sch_str_dt_utc, sch_end_dt_utc)
      where is_deleted = 0;
  ```

  Columns confirmed to exist on `pairing_segment`: `brief_start_utc` (`02-crew-roster.sql:1191`), `debrief_end_utc` (`:1194`), `sch_str_dt_utc` (`:1058` on `pairing`; segment has its own at the pairing_segment block — confirm the segment-scoped `sch_str_dt_utc`/`sch_end_dt_utc` before relying on them in the `include`).
  > Index (a) is only fully effective once Task 3 rewrites the predicate to a sargable range on `sch_str_dt_utc`. With the current `(… at time zone 'UTC')::date` wrapper, the planner can still use (a) for the `base` equality prefix but **not** for the date as a range — which is exactly why Task 1 and Task 3 are paired.
  > **Alternative considered:** an expression index `((sch_str_dt_utc at time zone 'UTC')::date)` would make the *current* predicate sargable without a query change. Prefer the half-open range rewrite (Task 3) + plain composite (a): it is simpler, avoids an expression index's planner fragility, and the composite also helps the `order by … sch_str_dt_utc` in the preview query (`pairing-search-preview-query.ts:318`).
- **Expected impact:** High — the biggest single lever. **Effort:** Low (DDL only). **Risk:** Low — additive indexes; the only cost is write-amplification during pairing import (acceptable; pairing import is a batch, not the hot path). Confirm `INCLUDE` is supported (Postgres 11+; the repo is PG 16 per CLAUDE.md — yes).

---

### Task 2 — Replace the 3× per-row correlated subqueries with one grouped join

- **Goal:** Remove result-set-proportional repetition of the segment rollups. Addresses **RC2**.
- **Files to change:**
  - `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts` — `executePreviewQuery` (`:294-316`) and `executePairingDetailsQuery` (`:443-465`).
  - ⚠ **Do NOT** rewrite `pairing-id-search-query.ts` rollups — they already use a grouped join (`:160-164`). (See RC2 CORRECTION.)
- **Current code (quote, from `executePreviewQuery`):**
  ```sql
  -- pairing-search-preview-query.ts:294-316
  (
    coalesce(
      ( select min(coalesce(s.brief_start_utc, s.sch_str_dt_utc))
        from <schema>.pairing_segment s
        where s.pairing_id = fp.id and s.is_deleted = 0 ),
      fp.sch_str_dt_utc
    ) at time zone 'UTC'
  )::date::text as active_start_date,
  ${formatUtcTimestampSql(`(
    select min(s.brief_start_utc) from <schema>.pairing_segment s
    where s.pairing_id = fp.id and s.is_deleted = 0 )`)} as report_start_utc,
  ${formatUtcTimestampSql(`(
    select max(s.debrief_end_utc) from <schema>.pairing_segment s
    where s.pairing_id = fp.id and s.is_deleted = 0 )`)} as release_end_utc
  ```
- **Proposed change (SQL sketch):** compute all three rollups **once** in a single grouped aggregate over `pairing_segment`, LEFT JOINed to the paged rows. The grouped join must run **after** pagination (only roll up the ≤100 paged rows), so add it to the `paged_pairings` CTE, not `filtered_pairings`:
  ```sql
  paged_pairings as (
    select
      fp.id_text as id, fp.pairing_label, fp.base, fp.base_zone_id,
      fp.division, fp.duration_days, fp.duty_count, fp.fleet,
      ( coalesce(seg.min_start, fp.sch_str_dt_utc) at time zone 'UTC' )::date::text as active_start_date,
      <formatUtcTimestampSql>(seg.min_brief_start)  as report_start_utc,
      <formatUtcTimestampSql>(seg.max_debrief_end)  as release_end_utc
    from filtered_pairings fp
    left join lateral (
      select
        min(coalesce(s.brief_start_utc, s.sch_str_dt_utc)) as min_start,
        min(s.brief_start_utc)  as min_brief_start,
        max(s.debrief_end_utc)  as max_debrief_end
      from <schema>.pairing_segment s
      where s.pairing_id = fp.id and s.is_deleted = 0
    ) seg on true
    order by fp.sch_str_dt_utc asc, fp.pairing_label asc nulls last, fp.id asc
    limit $.. offset $..
  )
  ```
  (A `LEFT JOIN LATERAL` over the paged set is equivalent to a `LEFT JOIN (… GROUP BY pairing_id …)` but only touches the paged ids; either is fine — pick whichever the planner likes better in EXPLAIN. The non-lateral grouped form: `left join (select pairing_id, min(...), min(...), max(...) from <schema>.pairing_segment where is_deleted=0 group by pairing_id) seg on seg.pairing_id = fp.id`.)
  - Apply the **identical** rewrite to `executePairingDetailsQuery` (`:443-465`, inside `candidate_pairings`).
- **Critical correctness constraint:** preserve **exact** date semantics — `active_start_date` falls back to `fp.sch_str_dt_utc` when there are no segments (NULL rollups), and `report_start_utc` / `release_end_utc` stay NULL when there are no segments. The `loadSegmentsByPairingId` second query (`:78-131`) and `mapPairingResult` are unchanged.
- **Expected impact:** High on preview/details. **Effort:** Medium (2 query builders). **Risk:** Medium — must produce byte-identical rows/dates. Guard with the regression test in Task 7 (assert identical `results[]` before/after for a fixed base+period) and the existing `pbs-server/src/routes/pairing-search.test.ts` (covers `POST /api/pairing-search/preview`, `:477`; `pairing-details`, `:414`).

---

### Task 3 — Rewrite the period predicate to a sargable half-open range

- **Goal:** Make the period filter index-usable (compounds with Task 1a). Addresses **RC5, RC1**.
- **Files to change (every site that uses the `(… at time zone 'UTC')::date between` form):**
  - `pairing-search-preview-query.ts:183` (`executePreviewCountQueries`)
  - `pairing-search-preview-query.ts:249` (`executePreviewQuery`)
  - `pairing-airport-options-query.ts:33` and `:46`
  - `pairing-id-search-query.ts:113-124` (the correlated period filter — rewrite to compare `p.sch_str_dt_utc` directly, dropping the correlated subquery)
- **Current code (quote):**
  ```sql
  -- pairing-search-preview-query.ts:183 / :249 (identical shape)
  and (p.sch_str_dt_utc at time zone 'UTC')::date
        between $start::date and $end::date
  -- pairing-airport-options-query.ts:33,46
  and (p.sch_str_dt_utc at time zone 'UTC')::date between $2::date and $3::date
  ```
- **Proposed change:** half-open timestamp range on the raw `sch_str_dt_utc`:
  ```sql
  and p.sch_str_dt_utc >= $start_ts          -- inclusive lower
  and p.sch_str_dt_utc <  $end_ts_exclusive  -- exclusive upper (= first day of next month, 00:00 UTC)
  ```
  `buildPeriodRange` (`pairing-search-preview-query.ts:133-150`) currently returns `startDate` = first-of-month and `endDate` = **last day of month** (`Date.UTC(year, monthIndex + 1, 0)`). For a half-open range, compute the **exclusive upper** as the **first day of the next month** at `00:00:00Z`, i.e. `Date.UTC(year, monthIndex + 1, 1)`, and pass both as timestamps:
  ```ts
  // sketch — extend buildPeriodRange to also expose timestamp bounds
  startTs: new Date(Date.UTC(periodMonth.year, periodMonth.monthIndex, 1)).toISOString(),
  endTsExclusive: new Date(Date.UTC(periodMonth.year, periodMonth.monthIndex + 1, 1)).toISOString(),
  ```
  Bind these as `timestamptz` params and compare directly (no `::date`, no `at time zone`).
- **⚠ Timezone-boundary correctness:** the current predicate buckets by **UTC calendar day** of `sch_str_dt_utc`. The half-open `sch_str_dt_utc >= startTs(UTC midnight) AND < endTsExclusive(UTC midnight)` is **equivalent** for `sch_str_dt_utc` being a `timestamptz` compared at UTC — confirm with EXPLAIN + a row-equality test at **month edges** (first/last day, e.g. a pairing starting `2026-06-30T23:30:00Z` and one at `2026-07-01T00:30:00Z`). Keep `pairing-id-search-query.ts`'s **autocomplete** semantics in mind: its period filter currently uses the *segment-derived* origin (`min(coalesce(brief_start_utc, sch_str_dt_utc))`), not `p.sch_str_dt_utc` directly. Switching it to `p.sch_str_dt_utc` changes which pairings match at the month edge. **Decide deliberately:** if the product intends "period = month of the pairing's first brief", keep the segment-derived value but make it sargable differently (e.g. precompute `pairing.pairing_dt` — note `pairing.pairing_dt` already exists as "环日期（计划开始日, sch_str_dt_utc 的 UTC 日历日）", `02-crew-roster.sql:1087`, and may be the intended sargable column). **Open question O3 below.**
- **Expected impact:** High (compounds with Task 1). **Effort:** Low-Medium. **Risk:** Medium — month-edge correctness; cover with the edge test.

---

### Task 4 (optional) — Make the label prefix typeahead index-seekable

- **Goal:** Let exact/prefix autocomplete use an index instead of a full row-by-row regex+contains scan. Addresses **RC3**.
- **Files:** `pairing-id-search-query.ts:135-144` (`sort_rank` + the `like $1` filter at `:144`), `pairing-display-label.ts`.
- **Current code (quote):**
  ```sql
  -- pairing-id-search-query.ts:144 ($1 = '%Q%', leading wildcard → non-sargable)
  and upper(<external_label_expr>) like $1 escape '\'
  ```
  where `<external_label_expr>` is the regex-wrapped expression from `pairing-display-label.ts:1-12`.
- **Proposed change:** for the common **prefix** case, add an index-seekable branch `upper(interface_id) like 'Q%'` against `idx_pairing_label_upper_active` (`02-crew-roster.sql:1856-1858`) or a new `create index idx_pairing_interface_id_upper_active on pairing (upper(interface_id)) where is_deleted = 0 and interface_id is not null;`. Keep the regex classification only to decide *display label*, not in the hot `WHERE`. Keep `contains` (`%Q%`) as a fallback only when prefix yields too few rows.
- **Impact:** Medium-High for autocomplete. **Effort:** Medium. **Risk:** Medium — must keep the same matched set + exact/prefix/contains ranking; regression-test the ranking.

---

### Task 5 (optional) — Fold or cache actor base/rank resolution

- **Goal:** Drop one serial round trip per interaction. Addresses **RC4**.
- **Files:** `pbs-server/src/services/pairing-search/pairing-search-service.ts` (actor-base resolution before each search), `pbs-server/src/services/pairing-search/actor-base.ts`.
- **Change:** cache the `(crewId,userCode) → {base, rank}` result in-process with a bounded TTL (base can change between months — bound TTL or invalidate on period change), or CTE-join the lookup into the main search query. **Verify the exact call sites first** (RC4's line numbers are trust-but-confirm).
- **Impact:** Medium on high-RTT links. **Effort:** Low. **Risk:** Low.

---

### Task 6 (optional) — Short-TTL cache for autocomplete + pool counts

- **Goal:** Collapse N concurrent identical `(base, period, query, rank)` reads during a bid window. Addresses **RC6**.
- **Files:** reuse the in-process TTL-cache pattern (`pairing-bid-service.ts:90`) or the PBS Redis instance (`pbs-server/CLAUDE.md` §缓存一致性 — PBS has an independent Redis). Cache autocomplete option lists + pool counts; invalidate on pairing import.
- **Impact:** Medium-High **under concurrency**. **Effort:** Medium. **Risk:** Low-Medium — stale window acceptable for read-only counts; must invalidate on import.

---

## 4. Verification plan (mandatory — §No-Illusion, §Playwright-Required)

Every "done" needs a **pasted PASS receipt**. No "looks correct".

### 4.1 Baseline harness — BEFORE & AFTER numbers
Run Task 0's command before any change (BEFORE) and again after each shipped task (AFTER):
```bash
cd pbs-server && npm run perf:pbs -- --samples 5 --budget-ms 2000
```
Paste both tables. The relevant endpoints are `pairing search exact id` and `pairing search duration` (both `POST /api/pairing-search/preview`). AFTER should show a materially lower p95/max for those; the budget gate (`maxMs > budgetMs`, `core.ts:513`) should pass.

### 4.2 `EXPLAIN (ANALYZE, BUFFERS)` — prove index usage
Against the demo DB (§8), before/after Task 1+3, run the hot query shape with a real base + period. Query shape to EXPLAIN (mirror `executePreviewQuery`'s `filtered_pairings`):
```sql
SET search_path TO f8;
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p.base, p.sch_str_dt_utc
FROM pairing p
WHERE p.is_deleted = 0
  AND p.base = 'YYZ'                 -- a busy base
  -- BEFORE (non-sargable):
  -- AND (p.sch_str_dt_utc at time zone 'UTC')::date between '2026-06-01'::date and '2026-06-30'::date;
  -- AFTER (sargable, Task 3):
  AND p.sch_str_dt_utc >= '2026-06-01T00:00:00Z'
  AND p.sch_str_dt_utc <  '2026-07-01T00:00:00Z';
```
**PASS criteria:** BEFORE shows a `Seq Scan` / filter on `pairing` (or index-scan on `idx_pairing_base` then a filter on the date); AFTER shows an `Index Scan`/`Bitmap Index Scan` on `idx_pairing_base_sch_str` with far fewer `Buffers`. Repeat with the full preview CTE to show the segment rollup using `idx_pairing_segment_pair_rollup` after Task 2.

### 4.3 pbs-server unit/integration tests (node test runner)
The query builders are guarded by `pbs-server/src/routes/pairing-search.test.ts` (covers `POST /preview` `:477`, `pairing-details` `:414`, `GET /pairing-ids` `:292`, `airport-options` mocked at `:274`). Run them and paste PASS. (See skill `119-pbs-overseas-speed-latency` for how to run pbs-server tests in this repo's environment — it documents the node:test invocation + env gotchas.)

### 4.4 pbs-portal e2e (§Playwright-Required) — drive the REAL UI
Add a spec under `e2e/tests/pbs-portal/` named e.g. `pairing-search-perf.spec.ts`, test id in the `PBS-3xxx` range (PBS = prefix `3xxx` per `docs/test-cases/e2e/README.md`; pick an unused id, existing pairing-search ids are PBS-3200..3204 in `pairing-search.spec.ts`, tier counts PBS-3501). It MUST:
- Log in as a real crew (use `PbsLoginPage`; crew-code / `rois` per existing specs), open the Pairing page via the real workspace (`BidWorkbenchPage.goto('pairing')`, `e2e/pages/pbs-portal/bid-workbench-page.ts:144`).
- Drive the **real UI** — type into the Pairing Number autocomplete and/or press SEARCH (use `fillPairingAutocomplete`, `bid-workbench-page.ts:357`) — **never** call the search API directly to "prove" speed (§Simulate-User).
- Assert **within a budget**: capture the timing of the autocomplete/SEARCH response the UI itself fires (e.g. `page.waitForResponse(r => r.url().includes('/pairing-search/pairing-ids') || r.url().includes('/pairing-search/preview'))` and assert `responseEnd - requestStart` under a threshold), AND assert correct data is shown (options contain the typed label / result footer shows a numeric count) — not just "no error" (anti-pattern table in CLAUDE.md §Playwright-Required).
- Run: `cd e2e && npx playwright test tests/pbs-portal/pairing-search-perf.spec.ts --reporter=list` (use `--workers=1`; PBS auth lockout — see skill `108-npbs-bids-portal-simulation`). Paste the PASS summary.
- **Note:** pbs-portal runs at base `/fpqe/pbs/` on port `:3030` (token in sessionStorage); the e2e `/api` proxies to `:3002` unstripped. See the existing `pairing-search.spec.ts` header for the exact login + conditions.

### 4.5 §Stale-Test
If Task 2/3 changes the SQL shape such that `pairing-search.test.ts` assertions go stale (selectors/row shapes), **rewrite** them to assert the current behaviour (same intent) and paste PASS — do not weaken or skip (CLAUDE.md §Stale-Test). The rows/dates must be **identical** to before, so most assertions should still hold; if any break it likely means a real semantics drift — investigate (§No-Illusion).

### 4.6 UI gate
No frontend style change is expected. If you touch any pbs-portal `.tsx`, run `npm run check:ui` and paste PASS (CLAUDE.md §UI-Standard-Gate). Indexes + pbs-server SQL changes do not trigger this.

---

## 5. Sequencing & rollback

1. **Task 0** — measure BEFORE (read-only).
2. **Task 1** — ship indexes (lowest risk). On a live DB use `CREATE INDEX CONCURRENTLY`. **Re-measure** (4.1) + EXPLAIN (4.2).
3. **Task 3** — sargable predicate rewrite (cheap, compounds with the index). Re-measure + EXPLAIN.
4. **Task 2** — grouped-join rewrite (preview + details only). Re-measure + tests.
5. **Tasks 4–6** — optional, only if measurements still show headroom or concurrency tests demand it.

**Rollback:**
- Index task: `DROP INDEX [CONCURRENTLY] IF EXISTS idx_pairing_base_sch_str;` / `… idx_pairing_segment_pair_rollup;` and revert the schema-file additions. Zero data risk.
- Query rewrites: revert the commit; the queries are pure reads, no data migration, so revert is clean.
- Cache tasks (6): disable the cache lookup (feature-flag or revert); reads fall back to direct query.

---

## 6. Version bump

Per CLAUDE.md «版本号管理»: pbs-server is a **backend** module. When you ship the code rewrites (Tasks 2–6), bump **`PBS_BACKEND_VERSION`** in `gantt/src/version.ts` by **+1** (currently `9` → `10`), and update its trailing comment to describe the change (e.g. "pairing-search perf: base+period index + sargable period range + grouped segment rollup"). Never reuse/lower a version. Pure DDL with no pbs-server code change does not strictly require a bump, but a single +1 covering the whole effort is fine.

---

## 7. Open questions / what to measure first

- **O1 (measure first):** Run Task 0 + 4.2 EXPLAIN on a **busy base** in the demo dataset to confirm whether RC1 (scan) or RC2 (per-row subqueries) dominates. The source analysis ranks RC1 #1 by judgement, not measurement. Let EXPLAIN decide how much to invest in Task 2.
- **O2:** Does the demo dataset have a base with enough pairings for `idx_pairing_base` (base-only) to be insufficient? If every base is tiny, the structural fix is still correct but the *magnitude* won't show in the demo — note this when reporting numbers.
- **O3 (semantics):** Period bucketing — is "period" defined by **`pairing.sch_str_dt_utc`'s UTC day** (what preview/counts/airport-options use) or by the **segment-derived first brief** (what autocomplete's period filter uses)? They differ at month edges. Confirm the product intent before Task 3 unifies them; consider using the existing `pairing.pairing_dt` column (`02-crew-roster.sql:1087`) as the canonical sargable period key.
- **O4:** Confirm the `pairing_segment`-scoped `sch_str_dt_utc` / `sch_end_dt_utc` columns exist (the `INCLUDE` in Task 1b references them) — the table block around `02-crew-roster.sql:1058,1191-1202` shows `brief_start_utc`/`debrief_end_utc` clearly; double-check the segment's own `sch_*` before relying on them, or drop them from `INCLUDE` and keep only `brief_start_utc, debrief_end_utc`.
- **O5:** RC4 call-site line numbers (`pairing-search-service.ts:99,155,238,324`; `actor-base.ts:34,75`) are inherited from the source analysis and **not re-verified line-by-line here** — confirm before editing for Task 5.

---

## 8. DB connection facts (for measuring — reference, do not duplicate secrets)

The demo DB is **REMOTE** (see project note "Live-server remote demo DB" / "Live-server hot-reload, cache & DB query": running services point at a remote Postgres; the local `f8` schema is empty). Connection facts are documented in the root `CLAUDE.md` «数据库» section — **reference it, do not paste passwords beyond what CLAUDE.md already documents.**

| Item | Value (from CLAUDE.md) |
|---|---|
| Host / Port / DB | `localhost` (or the configured remote) / `5432` / `rois` |
| Live schema (pairing data) | `f8` (airline two-letter code, lowercase) |
| PBS schema | `f8_pbs` (baseline harness default, `pbs-performance-baseline-core.ts:99`) |
| search_path | set per query: `SET search_path TO f8;` for the live `pairing`/`pairing_segment` tables |
| Connection string | the `f8` connection string template is in root `CLAUDE.md` «数据库» (uses `options=-c search_path=f8`) — use it; do not reproduce the password here |

For the baseline harness, `DATABASE_URL` and `JWT_SECRET` come from pbs-server's `.env` (loaded via `dotenv.config()`, `pbs-performance-baseline.ts`). The harness needs a running pbs-server (default `:3002`) — point `PBS_PERF_BASE_URL` at it if not local. Per project rule, query the remote DB via `node pg` (no `psql` against remote); for EXPLAIN you can run the SQL through a small `tsx`/`node pg` script against the same `DATABASE_URL`.

---

## Re-verification log (2026-06-22)

| Claim | File:line | Result |
|---|---|---|
| Period filter `(p.sch_str_dt_utc at time zone 'UTC')::date between …` | `pairing-search-preview-query.ts:183`, `:249` | ✅ confirmed both lines |
| 3× per-row correlated subqueries (preview) | `pairing-search-preview-query.ts:294-316` | ✅ confirmed |
| Same pattern in pairing details | `pairing-search-preview-query.ts:443-465` | ✅ confirmed |
| Airport options period filter | `pairing-airport-options-query.ts:33`, `:46` | ✅ confirmed both lines |
| Autocomplete rollups use grouped LEFT JOIN (not correlated) | `pairing-id-search-query.ts:160-164` | ✅ confirmed — **⚠ corrects the source analysis** |
| Autocomplete period filter is correlated | `pairing-id-search-query.ts:113-124` | ✅ confirmed |
| Autocomplete contains-LIKE `$1` = `%Q%` | `pairing-id-search-query.ts:107`, `:144` | ✅ confirmed |
| Label regex defeats index | `pairing-display-label.ts:5` | ✅ confirmed |
| Date indexes on wrong column | `02-crew-roster.sql:1089-1090` | ✅ confirmed (`pairing_act_str_dt_utc`) |
| Base-only partial index | `02-crew-roster.sql:1826-1827` | ✅ confirmed |
| Segment lookup index | `02-crew-roster.sql:1859-1860` | ✅ confirmed |
| `idx_pairing_label_upper_active` / `uq_pairing_interface_id` | `02-crew-roster.sql:1856-1858`, `:1871-1873` | ✅ confirmed |
| `pairing_segment` columns exist | `02-crew-roster.sql:1191` (brief_start_utc), `:1194` (debrief_end_utc) | ✅ confirmed |
| Migration dir + naming + idempotency rules | `sql/migration/` (dir), `sql/migration/README.md:39-42` | ✅ confirmed |
| Baseline harness endpoints + budget | `pbs-performance-baseline-core.ts:253-351`, `:513`, `:589` | ✅ confirmed |
| Baseline npm script | `pbs-server/package.json:13` (`perf:pbs`) | ✅ confirmed |
| Baseline config defaults | `pbs-performance-baseline-core.ts:96-103,158-205` | ✅ confirmed |
| Route paths | `packages/contracts/pbs-search-pairings.d.ts:9-18` | ✅ confirmed |
| e2e page object 120s wait + pairing autocomplete | `bid-workbench-page.ts:148`, `:144`, `:357` | ✅ confirmed |
| Version counters | `gantt/src/version.ts` (`PBS_BACKEND_VERSION = 9`) | ✅ confirmed |
| RC4 actor-base call-site exact lines | `pairing-search-service.ts:99,155,238,324` | ⚠ NOT re-verified line-by-line (pattern verified) |
