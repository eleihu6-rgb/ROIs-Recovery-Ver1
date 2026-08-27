# Handoff — Legacy rule restore → Legality tab → Rust 8002 migration → live check

**Date:** 2026-06-14
**Author:** Claude (Opus 4.8)
**Status:** 3 phases DONE & verified; 1 phase (show 8002 violations in the live gantt) PENDING a decision the user has now made (January @ 40h).

---

## 0. The arc (what the user asked, in order)

1. Restore/enhance the **legacy** rule tables as the single param authority for re-migrating rules C++→Python/Rust.
2. Build a **Legality tab** in gantt that views legacy ruleset 103 ("PBS Solver Ruleset") + all rule params.
3. Make the param view user-friendly (inline-by-default table + pop-out dialog).
4. Change rule **8002/006** 28-day Max Limit `112:00 → 40:00` ("ready to migrate our first rule").
5. Migrate the first rule (**8002**) C++→**Rust** (not Python — they plan to move the PBS solver to Rust), validated by the C++ gtest.
6. Run the Rust rule against the **live Jun-2026 roster**, expecting "many violations" from the 40h limit.
7. (PENDING) "open live gantt, find many crew got violation in Jun" + "use playwright to validate".

---

## 1. Environment / access (READ FIRST)

- **Remote demo DB** (the real data; local f8 schema is EMPTY): connection string in `live-server/.env` and `rule-engine/.env` → `postgresql://...@47.253.173.207:55432/rois?...search_path=f8`. Query it via **node + pg** (no psql):
  ```
  cd live-server && node -e 'const{Client}=require("pg");const url=require("fs").readFileSync(".env","utf8").split("\n").find(l=>l.startsWith("DATABASE_URL=")).slice(13).trim();(async()=>{const c=new Client({connectionString:url});await c.connect();/*...*/await c.end();})()'
  ```
- **Services up:** live-server :3000, gantt vite :5173 (app at `/fpqe/gantt/`), pbs :3002. ai-server :3005.
- **Gantt e2e:** `cd e2e && GANTT_TEST_USER=Jen GANTT_TEST_PASS=Our2027 npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/<file>.spec.ts --reporter=list`
  - MUST pass `--config=config/playwright.config.ts` (config is in `config/`, else baseURL is unset → "invalid URL").
  - Creds **Jen/Our2027** (default admin/123456 is rejected by the remote DB).
- **Rust** was installed this session via `brew install rust` (cargo 1.96). ⚠️ GOTCHA: that brew op upgraded `llhttp` and **broke Homebrew node** (dyld libllhttp.9.3 missing) — fixed with `brew reinstall node` (now node v26.3.0). If node dyld-errors again, `brew reinstall node`.
- Repo has stray iCloud `* 2.tsx` / `* 2.docx` duplicate files that throw ~22 pre-existing tsc errors — IGNORE them; filter tsc with `grep -v " 2\."`.

---

## 2. Phase 1 — Legacy rule param restore  ✅ DONE

Legacy `rule`/`rule_set`/`workset` deliberately revived as the migration source (reverses the "delete legacy" note in schema).

- **`rule` table** gained `param_json jsonb` (schema: `sql/schema/live/01-base.sql`; migration: `sql/migration/2026-06-14-legacy-rule-param-json-and-pbs-ruleset.sql`, idempotent, applied to remote).
- Format = **faithful CSV mirror**: `{"tables":[{"header":[...],"rows":[[...]]}]}`. Preserves applicability cols (Bases/Ranks/Fleets/Crew Teams) the new model dropped. One table per legacy sub-table (only 7500 has 2; rest 1).
- **`rule_set` workset_id=103** maps all 14 F8 rules. **`rule_id` is a COMPOSITE = function‖instance** (e.g. `8002006` = fn 8002 + inst `006`), NOT `rule.id`. Join: `r.function::text||coalesce(r.instance,'') = rs.rule_id::text`.
- **`workset` 103** renamed → **"PBS Solver Ruleset"** (category PBS, type CU, F8/P).
- 11/14 rules have param_json; **3 are NULL** (7272/7505/7506 — no legacy params; values come from C++).
- 2014 quirk: rule row `2014014` but params under `2014012` (mapped explicitly).
- Memory: `legacy-rule-param-json-restore.md`.

## 3. Phase 2/3 — Legality tab  ✅ DONE (e2e Legal-6001..6004 green)

Gantt tab after Data (`module-nav-legality`, Scale icon) viewing workset 103.

**Backend:** `GET /api/legality/ruleset/:worksetId` → `live-server/src/routes/rule/legality.ts` (registered `/api/legality` in `routes/rule/index.ts`). Returns `{workset,rules[]}` with `paramJson`. Drizzle `rule` model gained `paramJson` (`models/rule/rule.ts`).

**Frontend** (`gantt/src/components/legality/`):
- `legality-view.tsx` — Rule-tab layout: left "Rule Sets" card (PBS Solver Ruleset) + rules table.
- `legality-rule-row.tsx` — name **`fn/inst - description`** (e.g. "8002/006 - Maximum Flight Time"); **Edit** toggles INLINE param table (default); **pop-out icon** (Maximize2, `legality-rule-popup-`) opens dialog.
- `legality-param-table.tsx` — compact aligned table (one row per entry, all cols on a line; applicability cols tinted `bg-primary/5`). Shared by inline + dialog.
- `legality-param-dialog.tsx` — wide AppDialog (`min(1180px,94vw)`) for roomy view (8056 = 24 cols).
- store `stores/legality-store.ts` (`PBS_SOLVER_WORKSET_ID=103`), api `services/legality-api.ts`, types `types/legality.ts`.
- Shell wiring: `shell-store.ts` (KnownModule + sidebar hidden for legality), `shell-top-nav.tsx`, `app-shell.tsx`, `shell-sidebar.tsx`.
- **Design history:** key→value grid (`legality-param-view.tsx`) was tried then REJECTED (bad for multi-row) and DELETED. Don't reintroduce it.
- **UI is read-only.** Param edits go via SQL migration.

**e2e:** `e2e/tests/gantt/legality-tab.spec.ts` (Legal-6001..6004, all pass). New prefix `Legal- = 6xxx` registered in `docs/test-cases/e2e/README.md`.
- Memory: `legality-tab-feature.md`.

## 4. Phase 4 — 8002/006 value change  ✅ DONE

28-day Max Limit `112:00 → 40:00` in `param_json`: `sql/migration/2026-06-14-rule-8002-006-max-limit-40h.sql` (idempotent `jsonb_set {tables,0,rows,0,7}`), applied to remote. Row now `["*","*","*","*","28","CD","Y","40:00","00:00","BH"]`. e2e Legal-6002 asserts `40:00`.

## 5. Phase 5 — Rust 8002 engine  ✅ DONE & validated

New crate **`rule-engine-rs/`** (parallels TS `rule-engine/` + Python `rois-rule-engine/`). Dependency-free (std only).
- `src/lib.rs` — rule **8002 MAX_CUM_BLOCK**: `days_from_civil`/`parse_date_ord`/`civil_from_days` (calendar-day ordinals), `max_rolling_window`, `check_max_cum_block` (strict `>` limit). Cumulative block min per crew per calendar day must not exceed limit in any rolling N-CD window.
- `tests/rule_8002_cpp_replica.rs` — replicates C++ gtest `crewrule-dev/RuleTest/rule8002_gtest.cpp` (26-segment fixture summing 6715): **111:55 legal / 112:05 (6725) violation** at 112:00 limit. **`cargo test --release` → 4/4 pass.**
- `src/bin/check_8002.rs` — live CLI: reads TSV `crew_id\tYYYY-MM-DD\tblock_minutes` on stdin, args `--window-days 28 --limit-hours 40 --top N`, prints violating crew + worst windows.
- `README.md` documents provenance + results.

**C++ logic learned:** BLH accumulated per crew per local calendar day at **crew-base TZ** (`accumulateSegmentBlhAtCrewBase`), with cross-midnight segment block SPLIT across days; then rolling 28-CD window vs limit. Our live check uses scheduled block (`sch_end_dt_utc − sch_str_dt_utc`) bucketed by **UTC** day (crew-base-local bucketing + cross-midnight split is the noted refinement).

**Live run receipts** (build: `export PATH="/opt/homebrew/bin:$PATH"; cd rule-engine-rs && cargo build --release`; data via node→TSV piped to `target/release/check-8002`):
- **Jun 2026 @ 40h/28d: 1 / 113 crew violating** (crew 998, 54.5h, worst window 2026-05-04…05-31). June roster is SPARSE (max 37.1h block/crew).
- **Jan 2026 @ 40h/28d: 151 / 546 crew violating (27.7%)**, worst crew 13187 = 105.0h. ← the real "many".

---

## 6. PENDING — show 8002 violations in the LIVE GANTT + Playwright validate

### The blocker (verified facts — DO NOT ignore)
1. The gantt computes 8002 from the **NEW-model** instance `max_ft_flair_f8_p` (params `{"periods":[{"days":28,"limit_minutes":6720},...]}` = **112h**), NOT the legacy `param_json` we edited. **Our 40h legacy edit has ZERO effect on the gantt.**
2. **`rule_violation` table = 0 rows.** The gantt currently shows NO violations for anyone — no rule check has persisted results.
3. June @ 40h = **0 crew** over (max 37.1h). "Many June violations at 40h" is impossible in this demo. **January is where 'many' exists.**

### User's decision
- Scenario: **January @ 40h** ("real many" — 151 crew). (User selected this.)
- Rule-source sub-question (NOT answered): (a) edit the new-model `max_ft_flair_f8_p` 28d param to 2400 min [recommended — simplest, correct for current arch], vs (b) wire the live-server engine to read legacy `param_json`. **Default to (a) unless user says otherwise.**

### Proposed next steps for the continuing agent
1. Set `max_ft_flair_f8_p` 28-day limit to **2400 min (40h)** (new migration, idempotent `jsonb_set` on the `periods` array element where days=28). This is the instance the gantt engine actually reads.
2. Populate `rule_violation` (+ `rule_check_result_*`) for **Jan-2026** under group `flair_gantt_rule`. Options:
   - Trigger the live-server rule-check / violations worker for the period (preferred — exercises the real pipeline; investigate `live-server/src/workers/violations-init-worker.ts` + any rule-check route/batch trigger), OR
   - If the worker can't be driven easily, insert the computed violations directly into `rule_violation` (partitioned monthly on `start_dt`; cols crew_id, rule_group_code='flair_gantt_rule', rule_code, start_dt/end_dt, severity, actual_value, limit_value, unit, message). Our Rust engine already produces the crew+window+actual; map those in.
3. Confirm the gantt reads them: how does the gantt surface violations? (find the violation API/store the canvas uses — likely a `rule_violation` query keyed by crew_id + date range + rule_group_code). Verify Jan crew show markers.
4. **Playwright** (`e2e/tests/gantt/`, prefix **`Legal-6xxx`** or a new `Viol-`): open gantt on Jan-2026 (set the date range), assert multiple crew rows show 8002 violation markers with concrete content (count ≥ N, a specific crew's actual hours, the "block hours"/limit message) — §No-Illusion: assert real content, not bare visibility. Run with the e2e command in §1, paste the PASS receipt.
5. If the user still wants JUNE specifically: the only honest way to get "many" in June is a much lower limit (~20h) — confirm with them first; at 40h June is ~0–1.

### Watch-outs
- §No-Illusion: never assert violations that aren't really computed/persisted. If the data says 0, say 0.
- Gantt may need its date range set to January to load that roster (the default visible month is current). See how Live view sets date range.
- The `rule_violation` UNIQUE constraint is `(crew_id, pairing_id, duty_seq, rule_group_code, rule_code, start_dt)`; roster-level (whole-window) violations have `pairing_id IS NULL`.

---

## 7. Versions / housekeeping
- `gantt/src/version.ts`: BACKEND 93→94, FRONTEND 208→210 (this session). RULE_VERSION still 20 — **bump RULE_VERSION +1 for the new Rust engine if not yet done.**
- Migrations added (all idempotent, applied to remote): legacy-rule-param-json-and-pbs-ruleset, rule-8002-006-max-limit-40h.
- Memories written: `legacy-rule-param-json-restore.md`, `legality-tab-feature.md`, plus existing `rule-engine-migration-layers.md`, `live-server-remote-demo-db.md`, `gantt-e2e-auth-and-base-path.md`.
- TODO not yet done: a memory for the Rust engine (`rule-engine-rs`, 8002 cpp-validated, live Jun=1/Jan=151, node-broke-on-rust-install gotcha).
