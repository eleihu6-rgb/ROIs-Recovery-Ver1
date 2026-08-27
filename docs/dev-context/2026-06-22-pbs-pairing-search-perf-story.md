# PBS Pairing-Search Performance — End-to-End Story & Improvement Estimate

- **Date:** 2026-06-22
- **Module:** pbs-server (`:3002`) live-schema pairing queries + supporting SQL indexes; pbs-portal (verification only)
- **Shipped:** `main` @ `7a5bf3ed` — PBS Ver **B10** (`PBS_BACKEND_VERSION` 9 → 10)
- **Companion docs:**
  - Diagnosis: `docs/modules/pbs/pairing-page-slow-load-perf-analysis.md`
  - Handoff (7 ordered tasks): `docs/handoff/pbs/pairing-search-perf-improvement-handoff.md`
- **Skills:** `120-pbs-pairing-search-perf` (this recipe), `121-pbs-perf-enhancement` (the general method)

This document is the narrative of the whole effort: the problem, what we validated, what we
shipped, how we proved it, and an honest estimate of the resulting improvement.

---

## 1. The problem

The PBS Pairing bid page "feels slow" — perceived waits ranging from several seconds up to roughly
two minutes during real use. Two prior agents produced a diagnosis + a handoff with 7 ordered tasks.
This effort **validated** that analysis against the live code and database, then **executed** the
high-value, low-risk subset and proved the result.

---

## 2. Diagnosis — where the time actually goes

The expensive work is **not the page mount**. It is the **live-schema pairing queries** that fire
when a crew member *interacts* with the page (Pairing-Number autocomplete, SEARCH preview, pool
counts, airport options). Root causes, ranked:

| # | Root cause | Status |
|---|---|---|
| **RC1/RC5** | The period filter `(p.sch_str_dt_utc at time zone 'UTC')::date between …` is **non-sargable** and there is **no index** on `sch_str_dt_utc` (the live date indexes are on a *different* column, `pairing_act_str_dt_utc`). Only the base-only partial `idx_pairing_base` is usable → the query degrades to "scan all rows for the base, then Filter by date". | **Verified by EXPLAIN** |
| **RC2** | preview + details run **3× per-row correlated subqueries** into `pairing_segment` for the start/end-date rollups. | **Verified** (autocomplete already used a grouped join — left alone) |
| RC3 | Non-sargable pairing-label matching (regex + leading-`%` LIKE). | Verified; deferred |
| RC4 | Extra serial round trips (actor base/rank resolved separately). | Verified; deferred |
| RC6 | No result/aggregate caching for hot reads. | Hypothesis; deferred |

**The red herring (do not "fix"):** the page-mount endpoint `/pairing-bids/current` reads only
PBS-schema tables and is in-process cached. The 120s wait in the Playwright page object is *slack
tolerance*, not a measured mount cost.

**Why "~2 minutes":** it is not warm query time (single-digit ms from a dev box). It is overseas
RTT × round-trip count + cold-cache disk reads + bid-window concurrency (hundreds of crew hitting
the *same* base+period scan at once).

### Validation findings (beyond the handoff)

- Re-opened every cited `file:line` — all confirmed, including the correction that **autocomplete
  already uses a grouped `LEFT JOIN`** (only its period filter is correlated, and it is
  *segment-derived*, see §4 O3).
- `pairing.sch_str_dt_utc` is `timestamp without time zone` (UTC wall-clock); DB session TZ is
  `Etc/UTC`.
- `pairing.pairing_dt` (a pre-existing UTC-day column) is only **~80% populated** → unreliable, so
  it was **not** used as the sargable key.
- The busy base **YYZ has 7024 pairings**; June 2026 ≈ 1052 — a good dataset for before/after EXPLAIN.

---

## 3. What was implemented (shipped)

All backend / SQL. **No UI change** — the user-facing output is byte-identical.

1. **Indexes** (`sql/migration/2026-06-22-pairing-search-perf-indexes.sql`, mirrored into the
   canonical `sql/schema/live/02-crew-roster.sql` so fresh airline inits get them):
   - `idx_pairing_base_sch_str on pairing (base, sch_str_dt_utc) where is_deleted = 0`
   - `idx_pairing_segment_pair_rollup on pairing_segment (pairing_id) include (brief_start_utc, debrief_end_utc, sch_str_dt_utc, sch_end_dt_utc) where is_deleted = 0`
   - Applied to the remote **f8** schema with `CREATE INDEX CONCURRENTLY`; `tg` pending (user not built).
2. **Sargable half-open period range** — `p.sch_str_dt_utc >= $start::timestamp and < $endExclusive::timestamp`,
   using **plain timestamps** (no `Z`, no `at time zone`) so it is session-TZ-independent and exactly
   equals the old UTC-day bucket. Applied in `executePreviewCountQueries`, `executePreviewQuery`, and
   both UNION branches of `pairing-airport-options-query.ts`; `buildPeriodRange` gained
   `startTs` / `endTsExclusive`.
3. **Grouped `LEFT JOIN LATERAL` rollup** replacing the 3× per-row correlated subqueries in
   `executePreviewQuery` (paged_pairings) and `executePairingDetailsQuery` (candidate_pairings).
   The lateral runs only over the ≤100 paged rows; `LEFT JOIN` preserves the zero-segment → NULL →
   fallback semantics.

Plus: `PBS_BACKEND_VERSION` 9 → 10, migration README row (`f8 ✅`), and a `PBS-3205` e2e spec.

---

## 4. Deliberately deferred / not changed

- **O3 — autocomplete period semantics.** Autocomplete buckets by the *segment-derived first brief*
  (`min(coalesce(brief_start, sch_str))`), not `p.sch_str_dt_utc`. Unifying it would change which
  pairings match at month edges → needs product sign-off. Left intact; the new index still helps its
  base-equality prefix.
- **Airport-options is ~neutral.** Its dominant cost is a full `pairing_segment` scan, which these
  changes do not address; only its pairing-side scan became index-backed.
- **RC3 (label index), RC4 (fold actor lookup), RC6 (result cache)** — optional, deferred to a later
  pass if measurements warrant.

---

## 5. How it was proven (§No-Illusion)

> The route tests (`pairing-search.test.ts`) **mock** the service, so the SQL rewrites are *not*
> covered by `npm test`. The load-bearing correctness proof is a real-DB diff.

| Check | Result |
|---|---|
| `pbs-server` build (tsc) | clean |
| Full unit suite (`npm test`) | **434 / 434 pass** |
| Real-DB OLD-vs-NEW row diff — preview (multi-page), details (incl. **20 zero-segment** pairings), airport-options | **byte-identical** |
| Period predicate: whole-table symmetric difference / `(at tz UTC)::date` no-op | **0 / 0** |
| EXPLAIN before → after (YYZ June) | scan→seek; see §6 |
| e2e **PBS-3205** (real UI: login → SEARCH → preview within budget + numeric Total matches payload) | **pass** (576ms, totalItems=82) |
| Compiled worktree server smoke (preview + airport-options vs real DB) | **200 + correct data** |
| UI Standard Gate (pre-push) | **0 hard violations** |

Work was done in a git worktree **outside iCloud** (the repo lives in iCloud Drive, which silently
reverts on-disk edits to tracked files mid-session), then pushed `HEAD:main`.

---

## 6. The measured per-query win (EXPLAIN, YYZ June, busy base)

| | BEFORE | AFTER | Δ |
|---|---|---|---|
| Index used | `idx_pairing_base` (base only) | `idx_pairing_base_sch_str` (base + date) | scan → seek |
| Date predicate | `Filter` (post-scan) | `Index Cond` (seek) | — |
| Rows examined → discarded | 7024 → **5972 discarded** | 1052 → **0 discarded** | **−85% rows** |
| `Buffers: shared hit` | **642** | **175** | **−73% I/O** |
| Filter exec (warm) | 3.38 ms | 0.76 ms | ~4.4× |
| Segment rollup | 3 correlated subqueries/row | one **Index Only Scan**, `Heap Fetches: 0` | ~3× fewer probes, no heap |

The composite index also serves the `order by sch_str_dt_utc` (planner uses an Incremental Sort).

---

## 7. Improvement estimate

### Why a wall-clock A/B from a dev box is inconclusive

A direct timing A/B from the developer machine is **dominated by network RTT** to the remote DB
(~80 ms/query), which is identical for old and new:

- Serial median full-preview: OLD **83 ms** vs NEW **79 ms** = **1.06×** (the ~80 ms is round-trip).
- Concurrent bursts (20/50/100) came back noisy (6.2× / 0.94× / 1.2×) — warm cache + a smallish demo
  base + RTT, no clean signal.

So the reliable evidence is the **structural EXPLAIN metrics**, not a stopwatch from here.

### The estimate, by dimension

1. **Hot preview / pool-count query DB work: ~4–7× less, and it scales up.**
   The 6.7× row reduction (7024 → 1052) is a *floor* tied to the demo holding ~7 months of YYZ data.
   In production a base carries more months → the ratio (total base rows ÷ one month) grows; a full
   year ≈ **~12× fewer rows scanned per query**.

2. **Under the real slow conditions (overseas + cold cache + bid-window concurrency): the tails
   collapse.** Those waits were cold-cache disk reads × hundreds of crew on the *same* scan. Cutting
   per-query buffers ~73% and rows ~85% reduces DB CPU/I/O and connection-hold time per concurrent
   user by roughly the same factor, so contention falls super-linearly. Estimated **p95/p99 tail
   improvement on the order of 3–10×**. *This is an extrapolation* — it needs the `perf:pbs` harness
   run from an overseas client to become a hard number.

3. **No change (correctly):**
   - **Page mount** (the 120s Playwright wait) — already cached / PBS-schema-only; never the bottleneck.
   - **Airport-options** — roughly **neutral** (cost is a full `pairing_segment` scan, untouched).
   - **Autocomplete** — gains the base-prefix index; period filter unchanged (O3).

### Bottom line

- **Confident, measured:** the dominant pairing-search query now does **~4–7× less DB work**
  (rows + I/O), growing with base size; segment rollups are index-only.
- **Strong but unmeasured-here:** under overseas + cold-cache + concurrent bid-window load — the
  conditions that produced the "feels like ~2 min" — the user-perceived tail should drop
  **several-fold (est. 3–10×)**.

---

## 8. How to convert the estimate into a hard number

Run the existing byte-aware baseline harness **from an overseas client, before and after** the
optimised server is deployed:

```bash
cd pbs-server
npm run perf:pbs -- --base-url=https://<overseas-host> --samples 5 --budget-ms 2000
```

It reports per-endpoint `min/avg/p95/max` + avg/max bytes; the relevant rows are
`pairing search exact id` and `pairing search duration` (both `POST /api/pairing-search/preview`).
Capture BEFORE (pre-deploy) and AFTER (post-deploy) tables and diff the p95/max.

Optionally tighten the `PBS-3205` e2e budget (`PBS_PERF_BUDGET_MS`) once deployed, to gate regressions.

---

## 9. Follow-ups (optional, only if measurements warrant)

- RC3 — index-seekable label prefix typeahead (autocomplete latency).
- RC4 — fold/cache actor base/rank to drop a round trip per interaction.
- RC6 — short-TTL cache (in-process or PBS Redis) for autocomplete + pool counts keyed by
  (base, period, query, rank); invalidate on import. Highest leverage **under concurrency**.
- O3 — decide the product-intended period definition, then unify autocomplete's period filter.
- Apply the migration to the `tg` schema once that airline user exists.
