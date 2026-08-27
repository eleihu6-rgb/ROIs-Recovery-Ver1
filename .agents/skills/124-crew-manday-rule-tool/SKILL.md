---
name: 124-crew-manday-rule-tool
description: >-
  How ROIS-AI computes crew-manday credit and runs the rule tool. Invoke when the
  user says "crew manday", "rule tool", "ruletool", "manday credit", "MCred/MBH/days off",
  or asks how Live vs Scenario crew-manday is computed, what the crew_manday_* tables hold,
  the seven roster-panel KPIs, the save→recompute→broadcast flow, the unified Rust ruletool
  driver, or the "ghost credit" bug (inflated MCred on an empty roster) and its repair.
  Also for touching manday recompute on save, the import workers, or scenario manday.
---

# Crew Manday + Rule Tool (ROIS-AI)

Repo: current `rois-ai` checkout. Resolve paths from the repo root; this skill may be used from
Linux or macOS worktrees.

"Crew manday" = per-crew, per-period accumulated **credit hours / block hours / day-off /
annual-leave** counters, derived from each crew's roster. They feed the gantt roster-panel
KPIs. The "rule tool" (`ruletool`) is the credit-arithmetic core that computes them.

This is a navigational skill — read the canonical files below, don't re-derive. Project
enforces §No-Illusion (prove it, don't claim it): verify any number against code/DB before stating.

## 1. One unified driver (SHIPPED on `feat/manday/unified-tool`, unmerged)

The TS SQL engine `recalcMandayCredit` and the async `manday:recalc` queue are **deleted**. One
driver now computes manday for Live AND Scenario via the Rust core:

`live-server/src/services/manday/manday-tool.ts` →
`recompute(pool, {schema:'f8'|'scenario', scenarioId?, crewIds?, startDt?, endDt?, updatedBy?})`
(+ `manday-tool-rust.ts` spawns the binary via `__dirname` — package is commonjs, no import.meta).

Flow: load roster_flight activity for the scope → build TSV → spawn Rust `ruletool` (credit/flags
arithmetic, no DB) → **UPSERT** the credit-model columns into the target schema's `crew_manday_*`.

- **Column-preserving (critical):** it UPSERTs ONLY the credit-model columns
  (`credit`, `is_day_off`, `is_al/is_leave`, and current `blh`) and **never DELETEs rows** — live tables
  carry import-fed columns (fdp/dp/per_diem...). A DELETE+reinsert would erase them.
- **Scope:** `crewIds` set (Live edit / repair) → zero the credit-model cols in the window via UPDATE,
  then upsert. No `crewIds` (imports / scenario) → operate on the crew that had activity in the window
  (not every crew). Monthly/yearly re-aggregate from daily.
- **BLH current behavior:** the driver always recomputes `blh` from `flight.blk_min` through
  `roster_flight.flt_id` (`ownsBlh = true` in `manday-tool.ts`). Do not pass a `recomputeBlh` option;
  it no longer exists in the current interface. Daily upsert is **batched** (chunks of 500), not per-row.

Spec/plan: `docs/superpowers/{specs,plans}/2026-06-23-unified-crew-manday-tool*.md` (corrected §4.2/4.5
for column-preserving + real-blh).

## 2. The credit model (single source — never reimplement)

Implemented in Rust `rois_rule_engine` (`ground_credit`, `check_credit_band`), used by both the
`ruletool` binary and the PyO3 solver binding, so the 7502/8002 math is single-sourced.

- **Flying credit** = `MAX(duty_act_credited_minutes)` per `(crew, pairing, duty_seq)`. FT 1.0 ⇒
  block ≈ credit ⇒ flying credited minutes also count as `blh`.
- **Ground credit** = roster actual credit, else roster scheduled credit, else assignment fixed fallback
  `fixed_credit_min` (from `f8.assignment`). Missing fixed credit resolves to 0; there is no
  proportional credit fallback.
- **Flags:** `DO` → `is_day_off`; `VAC` → `is_al` (FD); `ILL` → `is_leave` (CC). Ground tasks have
  `pairing_id IS NULL`.
- **Division routing:** `crew.division = 'P'` → FD tables, else → CC/AM tables. (From `crew.division`,
  NOT `roster_flight.division`.)
- **Local date** via the crew's base airport `zone_id` (`crew_base.base` → `airport.zone_id`); falls
  back to UTC date. Watch the `timestamp`-without-tz columns — read as UTC wall-clock TEXT
  (`to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS')` + `Z`) so near-midnight dates don't shift.

## 3. The six manday tables

`crew_manday_fd_{daily,monthly,yearly}` + `crew_manday_cc_am_{daily,monthly,yearly}`.

- Keys: daily = `crew_base_dt`; monthly = `year_month` ('YYYY-MM'); yearly = `year` ('YYYY').
  Scenario tables add `scenario_id` to the key.
- Columns: `credit`, `blh`, `is_day_off`, plus `is_al` (FD) / `is_leave` (CC). **`fd_yearly` has NO
  `is_al` column** (only `is_day_off`).
- Monthly/yearly are faithful rollups of daily (full re-aggregate from daily rows).

## 4. The seven roster-panel KPIs

`CrewStats` in `gantt/src/types/crew.ts` — all derived from crew manday:

| Field | KPI | manday source |
|---|---|---|
| `mcred` | Monthly credit | `credit` (monthly) |
| `mbh` | Monthly block hours | `blh` (monthly) |
| `ybh` | Yearly block hours | `blh` (yearly) |
| `mdo` | Monthly days off | `is_day_off` (monthly) |
| `ydo` | Yearly days off | `is_day_off` (yearly) |
| `mal` | Monthly annual leave | `is_al` (monthly) |
| `yal` | Yearly annual leave | `is_al` (yearly) |

**Two-tier freshness** (ALL seven KPIs now optimistic, not just mcred):
- Tier 1 — browser optimistic delta: `gantt/src/utils/manday-delta.ts` `crewMandayDelta(base,
  virtual, yearMonth)` → per-crew delta for all 7 KPIs, applied in `live-gantt-source.ts
  buildPanelRows`. credit/do/al exact from RosterItem; mbh/ybh use flying-duty credit as a block
  proxy (RosterItem has no block minutes — server reconciles real blh on save). Test hook
  `window.__ganttTest.rosterPanelKpis()`. tz trap (viewportYearMonth in display tz) — see skill 123.
- Tier 2 — server authoritative: save recomputes via the driver → broadcast `roster-updated` →
  other gantts refetch all seven KPIs (`lock-store.ts:refreshCrewsFromBroadcast`).

## 5. Save → recompute → broadcast (now uniformly synchronous)

Every Live write recomputes synchronously via the driver, then broadcasts `roster-updated`:
- **`/api/draft/commit`** (`draft.ts`) — one driver pass for all touched crew.
- **`/api/roster/*` mutations** (`roster.ts`) — module-level `recomputeForMutation(...)` `await`s the
  driver per mutation (pad MANDAY_BACK_DAYS=2 / FWD=10), best-effort try/catch. Replaced the old
  `enqueueMandayRecalcForMutation` async queue (deleted).
- **scenario publish** (`routes/scenario/scenario.ts`) — one driver pass for the published crew.
- **imports** (roster-inbound / roster-ground-inbound / manday-inbound) + **admin refresh** — full
  mode (no crewIds), operates on window-active crew.
- **scenario load** (`scenario-result-loader.ts`) — delegates manday to the driver in-tx.

## 6. The "ghost credit" failure mode + repair (FIXED)

**Root cause (fixed):** the old async `manday:recalc` queue deduped by `jobId` and silently dropped
jobs. A 2026-06-22 bulk de-assign (crew 386) collapsed ~20 mutations into one dropped job → ~82 FD
pilots with **inflated "ghost" credit** (e.g. 386 showing 84:25 on an empty roster; correct = 8:00 from
2 VAC days). The synchronous driver removes the drop.

**Repair the already-corrupted rows:** `POST /api/admin/manday-credit-refresh?scope=ghosts&startDt=
2026-06-01&endDt=2026-06-30` (admin auth) → `findStaleFdCrews` (FD credit>0 + zero flying duties) then
scoped recompute. **RUN 2026-06-25** (committed): June true-ghosts (>75h, no-fly)
82→6, crew 386 84:25→8:00 (480); the 6 residual are legit high-ground-credit crew (15–25 ground duties),
not ghosts. Env note: shared `node_modules` had been corrupted (iCloud/concurrent install broke
pg-protocol + tsx/esbuild) — fixed with `rm -rf node_modules/pg-protocol && npm i pg-protocol@1.14.0
--no-save`; ran via a throwaway committing vitest spec (tsx file-run was broken).

## 7. Run / verify manually

- **Live repair after direct roster data fixes:** use the unified driver with an explicit `crewIds`
  scope and date window. This zeroes credit-model columns in the window first, then recomputes credit
  and BLH from the remaining roster rows. If the deleted rows are already gone and you did not preserve
  their crew IDs, build the crew scope from current window-active `roster_flight` rows so you do not
  miss affected crew.

  ```bash
  cd live-server
  set -a; source .env >/dev/null 2>&1; set +a
  npx tsx -e "import pg from 'pg'; import { recompute } from './src/services/manday/manday-tool.ts'; import { liveSchemaName } from './src/utils/db-schema.ts'; void (async () => { const startDt = '2026-01-01'; const endDt = '2026-06-30'; const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }); try { const crew = await pool.query(\"select distinct crew_id from roster_flight where is_deleted=0 and sch_str_dt_utc >= \\$1::date and sch_str_dt_utc < (\\$2::date + interval '1 day') order by crew_id\", [startDt, endDt]); const crewIds = crew.rows.map((r)=>String(r.crew_id)); console.log(JSON.stringify({ phase: 'scope', crews: crewIds.length, startDt, endDt, schema: liveSchemaName() })); const result = await recompute(pool, { schema: liveSchemaName(), crewIds, startDt, endDt, updatedBy: 'codex:manual-manday-refresh' }); console.log(JSON.stringify({ phase: 'recompute', ...result })); } finally { await pool.end(); } })().catch((err) => { console.error(err instanceof Error ? err.stack || err.message : err); process.exit(1); });"
  ```

  `tsx -e` in this repo uses CommonJS transform: wrap awaits in an async IIFE, and import local TS
  sources with `.ts` specifiers. Importing `./src/.../*.js` from eval can fail before the driver runs.
- **Scenario manday recompute (unified):** `tsx live-server/scripts/manday-recompute.ts <scenarioId>`
  (calls the driver). The old `ruletool.mjs <id> roster` now delegates to it; `gz`/`compare` modes stay.
- **Rust core directly:** `rule-engine-rs/target/release/ruletool --band-min 3900 --band-max 4500`
  reads activity TSV on stdin (`crew\tdivision\tlocal_date\tkind\ta1\ta2\ta3\tflag`; kind FLY/GND),
  writes daily/monthly/yearly TSV on stdout, **connects to NO database**. Bands 3900/4500 = F8
  65:00 / 75:00. Build: `cd rule-engine-rs && cargo build --release --bin ruletool`.
- **Driver test pattern (real DB, rolled back):**
  `live-server/src/__tests__/services/manday-tool*.test.ts` — read `DATABASE_URL` from `.env`,
  **self-skip if unreachable**, ALL work in ONE rolled-back tx, pass a pinned client wrapped as
  `{query} as unknown as pg.Pool`. Golden anchors: crew `386` (ghost→480), `73` (June = 2640/0/6/10),
  scenario `6` (driver reproduces loader output). Remote demo DB: cold connect ~445 ms.
- **DB inspection:** query via node `pg` (no `psql`).
- **Verification after Live repair:** check updated rows by `updated_by`, monthly-vs-daily rollup
  parity for the target months, and yearly-vs-daily parity only for rows touched by this refresh. Clear
  `roster:*` and `crew:*` Redis caches afterward if the UI may show stale KPIs.

## Cross-references

- Spec/plan: `docs/superpowers/{specs,plans}/2026-06-23-unified-crew-manday-tool*.md`
- Driver: `live-server/src/services/manday/manday-tool.ts` (+ `manday-tool-rust.ts`)
- Rust core: `rule-engine-rs/src/bin/ruletool.rs`
- Save paths: `routes/draft/draft.ts`, `routes/roster/roster.ts`, `routes/scenario/scenario.ts`
- Imports/admin: `workers/{roster-inbound,roster-ground-inbound,manday-inbound}-worker.ts`, `routes/admin/manday-credit-refresh.ts`
- Scenario load: `services/scenario/scenario-result-loader.ts`; dev CLI `scripts/manday-recompute.ts` + `scripts/ruletool.mjs`
- Frontend: `gantt/src/utils/manday-delta.ts`, `live-gantt-source.ts`, `gantt/src/types/crew.ts` (`CrewStats`); e2e `e2e/tests/gantt/manday-kpis-all.spec.ts`
- Memory: [[unified-crew-manday-tool]]; related skill **123-live-mcred-draft-recompute** (tz trap)
