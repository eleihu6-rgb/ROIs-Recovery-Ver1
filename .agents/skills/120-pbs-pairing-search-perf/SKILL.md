---
name: 120-pbs-pairing-search-perf
description: Optimize the pbs-server (:3002) interactive pairing-search hot path against the live pairing/pairing_segment tables — the missing base+period index, the non-sargable period predicate, and the per-row ×3 correlated segment subqueries. Use when the PBS pairing bid page / Pairing-Number autocomplete / SEARCH preview / pool counts / airport-options feels slow, or when adding/validating these query rewrites. Also the canonical recipe for proving a live-SQL rewrite byte-identical against the remote demo DB + EXPLAIN before/after.
---

# PBS Pairing-Search Hot-Path Performance

Shipped to `main` @ `7a5bf3ed` (PBS Ver **B10**). Implements
`docs/handoff/pbs/pairing-search-perf-improvement-handoff.md` (+ analysis
`docs/modules/pbs/pairing-page-slow-load-perf-analysis.md`).

## The problem (verified by EXPLAIN on remote f8)

The interactive pairing search filters live `pairing` by `base` + a bid-period date
derived from `pairing.sch_str_dt_utc`. Three compounding causes:

- **RC1/RC5** — no usable index + non-sargable predicate. Date indexes are on the WRONG
  column (`pairing_act_str_dt_utc`); only base-only `idx_pairing_base` exists. The filter
  `(p.sch_str_dt_utc at time zone 'UTC')::date between …` wraps the column → planner does a
  base-only bitmap scan then **Filters** the date (YYZ June: reads 7024, discards 5972,
  `Buffers hit=642`).
- **RC2** — preview + details run **3× per-row correlated subqueries** into `pairing_segment`
  (`min(coalesce(brief_start,sch_str))`, `min(brief_start)`, `max(debrief_end)`).
  (Autocomplete `pairing-id-search-query.ts` already uses a grouped join — do NOT "fix" it.)

## The fix (3 tasks, all backend/SQL — no UI change, behavior byte-identical)

1. **Indexes** (`sql/migration/2026-06-22-pairing-search-perf-indexes.sql` + mirror into the
   canonical `sql/schema/live/02-crew-roster.sql` perf-index block so fresh inits get them):
   - `idx_pairing_base_sch_str on pairing (base, sch_str_dt_utc) where is_deleted=0`
   - `idx_pairing_segment_pair_rollup on pairing_segment (pairing_id) include (brief_start_utc, debrief_end_utc, sch_str_dt_utc, sch_end_dt_utc) where is_deleted=0`
   - Apply to a live DB with `CREATE INDEX CONCURRENTLY` (can't run in a txn). README table marks `f8 ✅`.
2. **Sargable half-open range** (`pairing-search-preview-query.ts` count+preview,
   `pairing-airport-options-query.ts` both UNION branches; `buildPeriodRange` gains
   `startTs`/`endTsExclusive`): `p.sch_str_dt_utc >= $start::timestamp and < $endExclusive::timestamp`.
   - **Use PLAIN timestamp** (`'2026-06-01 00:00:00'`, no `Z`, no `at time zone`). The column is
     `timestamp without time zone` (UTC wall-clock), so plain-timestamp compare is session-TZ-
     independent and exactly equals the old UTC-day bucket. (A `…Z` timestamptz literal would
     reintroduce session-TZ conversion — don't.)
3. **Grouped LATERAL rollup** replacing the 3 correlated subqueries in `executePreviewQuery`
   (paged_pairings) and `executePairingDetailsQuery` (candidate_pairings):
   `left join lateral (select min(coalesce(s.brief_start_utc,s.sch_str_dt_utc)) min_start,
   min(s.brief_start_utc) min_brief_start, max(s.debrief_end_utc) max_debrief_end from
   <schema>.pairing_segment s where s.pairing_id = <fp|p>.id and s.is_deleted=0) seg on true`.
   Then `formatUtcTimestampSql("seg.min_brief_start")` (= `to_char(...)`). Lateral runs only on
   the ≤100 paged rows. LEFT JOIN preserves the zero-segment → NULL → fallback semantics.

AFTER EXPLAIN: `idx_pairing_base_sch_str` index range (1052 rows, 0 discarded, `Buffers hit=175`,
−73%) + lateral uses `idx_pairing_segment_pair_rollup` **Index Only Scan, Heap Fetches: 0**; the
composite also serves the `order by sch_str_dt_utc` (Incremental Sort).

## Deliberately NOT changed (O3)

Autocomplete's period filter (`pairing-id-search-query.ts:113-124`) buckets by the
**segment-derived first brief** (`min(coalesce(brief_start,sch_str))`), not `p.sch_str_dt_utc`.
That differs from preview/counts at month edges; unifying it changes which pairings match →
needs product sign-off. Left intact. The new index still helps its base-equality prefix.

## Verification recipe (§No-Illusion) — the important part

`pairing-search.test.ts` **MOCKS** `PbsPairingSearchService`, so the SQL builders are NOT
covered by unit tests. Prove SQL rewrites another way:

- **Real-DB byte-identical diff** (strongest): connect to remote f8 via `SOURCE_DATABASE_URL`
  from a `.mjs` placed INSIDE `pbs-server/` (so ESM resolves `pg`); build OLD and NEW SQL strings
  with the same literals and `JSON.stringify`-compare every row. Cover preview (multi-page),
  details (include zero-segment pairings), airport-options. Also: period-predicate symmetric
  difference over the whole table = 0, and `(sch at tz 'UTC')::date <> sch::date` count = 0
  (proves the transform is a no-op under UTC session, month-agnostic).
- **EXPLAIN (ANALYZE, BUFFERS)** before/after on a busy base (YYZ, 7024 pairings) — show
  scan→seek + buffer drop + Index Only Scan rollup.
- **Build + full suite**: `npm run build` then `npm test` (434/434, all skipDatabase).
- **e2e PBS-3205** (`e2e/tests/pbs-portal/pairing-search-perf.spec.ts`): real UI login (user
  `247`/`rois`) → /pairing → click SEARCH PAIRINGS → `waitForResponse(/pairing-search/preview/)`
  under budget + footer `Total N items` numeric == payload `data.summary.totalItems`. §Simulate-User.
- **Compiled-server smoke**: `PORT=<free> node dist/index.js` (worktree, .env copied) → POST
  `/api/auth/session` then `/api/pairing-search/preview` `{preview:{property:{propertyCode:142,
  name:'Min Duty Credit',action:'award',bid:{type:'duration',value:'00:00',operator:'>'}},
  page:1,pageSize:5}}` → 200 + numeric totalItems. (page/pageSize go INSIDE `preview`.)

## Environment facts

- Remote demo DB: `SOURCE_DATABASE_URL` (f8 live) / `DATABASE_URL` (f8_pbs) in `pbs-server/.env`,
  host `47.253.173.207:55432/rois`, session TZ `Etc/UTC`. ~600ms connect; queries fast from here
  (the ~2min is overseas RTT + cold cache + concurrency, not raw query time).
- `pairing.pairing_dt` (UTC-day of sch_str_dt_utc) exists but is only ~80% populated → unreliable,
  don't use it as the sargable key.
- e2e: config at `e2e/config/playwright.config.ts` (run via `--config=config/playwright.config.ts`,
  npm `test:pbs-portal`), `--project=pbs-portal`, baseURL `http://localhost:3030/fpqe/pbs/`,
  `reuseExistingServer:true`. User `247` = CA @ **YEG**.
- iCloud-revert hazard: do edits in a git worktree OUTSIDE iCloud (symlink node_modules from the
  iCloud checkout), build/test there, push `HEAD:main`. See `119-pbs-overseas-speed-latency` for the
  pbs-server/pbs-portal test-env gotchas (node:test, react symlink, gitignored package-lock).
