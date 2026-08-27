# Rule Migration Playbook — C++ → Rust → Gantt (end user)

> How we migrate one crew-rostering rule, from the proven C++ engine all the way to a
> warning the planner sees on the gantt. Derived from migrating the **first** rule
> (8002 MAX_CUM_BLOCK) on 2026-06-14. Do rules **one at a time**; each pass hardens this
> playbook. Includes recommendations (§7) — read them before rule #2.

---

## 1. Goal & principles

- `crewrule-dev/` is the legacy C++ rule source and test oracle. New legality implementation belongs in `rule-engine-rs/`; use C++ files only to understand and verify rule behavior.
- **C++ is the proven oracle.** Every migrated rule must reproduce the C++ `*_gtest.cpp`
  pass/fail exactly before anything else.
- **Target language is Rust** (`rule-engine-rs/`) — the plan is to move the PBS solver /
  rule checks to Rust. Rust is fast enough to check a whole roster in well under a
  millisecond (8002: **0.058 ms / 673 crew**), vs the legacy TS `violations-init` worker
  (~13 min / 815 crew) and C++ ("a few seconds").
- **The job is not done until the alarm fires in the END-USER VIEWPORT** (the gantt),
  and the **UI warning count == the DB violation count**. Validate with Playwright.
- **Param authority = legacy `rule.param_json`** (faithful CSV mirror incl. applicability
  Bases/Ranks/Fleets/Crew Teams). Viewable in the **Legality tab** (workset 103). See
  `docs/handoff/rule-migration/2026-06-14-8002-rust-migration-and-legality.md`.

---

## 2. The process (per rule) — six phases, each a gate

### Phase 0 — Scope
- Identify the rule's function code (e.g. 8002) and instance(s) (`8002006` BH, `8002009` DP).
  Composite id = `function‖instance`.
- Pull its params from `rule.param_json` (Legality tab / DB). Confirm the limits/periods.
- Find the C++ files: `crewrule-dev/RuleEngine/rule<NNNN>.cpp` + `crewrule-dev/RuleTest/rule<NNNN>_gtest.cpp`.

### Phase 1 — Study the C++ logic + gtest
- Read the gtest: what fixture data, what's the legal case, what's the illegal case, what
  exact numbers. (8002: 26-segment fixture summing 6715 min → legal at 112:00; +10 = 6725 → violation.)
- Note the *semantics*: how the metric is accumulated (8002: block min per crew per
  **crew-base-local calendar day**, cross-midnight split; rolling N-CD window; strict `>`).

### Phase 2 — Rust unit test = the GATE
- Implement the rule in `rule-engine-rs/src/` (dependency-free core in `lib.rs`).
- Replicate the gtest in `tests/rule_<NNNN>_cpp_replica.rs` with the **exact** fixture +
  expected pass/fail. `cargo test --release` must be green before moving on.
- `export PATH="/opt/homebrew/bin:$PATH"` (Rust is brew-installed).

### Phase 3 — Live run + performance
- Data adapter: node queries the remote DB → TSV (`crew_id\tYYYY-MM-DD\tblock_minutes`).
- `target/release/check-<rule> --window-days N --limit-hours H` → violating crew + worst windows.
- Record the **eval time** (the binary prints it) and the violation count for the period.
- Sanity-check against expectation; if a month looks empty, verify the data density (the
  f8 demo is sparse outside January).

### Phase 4 — Persist violations to `rule_violation`
- The gantt reads `rule_violation` via `GET /api/violations?crewIds&groupCode&start&end`.
- Either trigger the real worker (`POST /api/admin/violations-init {ruleGroupCode}`, admin
  only — **Ryan/Our2027**) OR insert the Rust-computed violations directly (faster, exact).
- **Two non-obvious requirements (cost us the most time — see §3):**
  1. `rule_group_code` MUST equal the gantt's active group — currently **`ccar121_gantt`**.
  2. Cumulative/roster-level violations MUST be attached to a **triggering pairing**
     (`pairing_id` NOT NULL) — the gantt drops `pairing_id NULL` rows.

### Phase 5 — Validate the END-USER VIEWPORT (Playwright)
- Endpoint check (necessary, not sufficient): `e2e/tests/gantt/legality-8002-violations.spec.ts`
  asserts `/api/violations` serves the alarm + the firing decision (illegal crew fires,
  legal crew doesn't).
- **UI render check (the real gate):** assert the gantt actually renders the warning and
  the **count matches the DB**. Use `window.__ganttTest.liveViolations()` (added this
  session) to read what the canvas draws. ⚠️ Make the test **select all/known crew** —
  `applyFilter` sometimes loads a subset that excludes the violator (why
  `legality-8002-ui.spec.ts` currently flakes).
- Run: `GANTT_TEST_USER=Jen GANTT_TEST_PASS=Our2027 npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps <spec>`.
- **Counts drift on the shared demo DB** (other sessions edit rosters). Assert the
  *invariant* the rule proves (e.g. "24h fires ≫ 13h") + lower bounds, NOT hard-coded
  headcounts, or the test flakes.
- **Prefer the Alert Center over eyeballing the canvas bells for observing counts.** The
  canvas "bell" indicator is per-crew and visual — you can't read a number off it, and a
  Playwright assertion on it has to reverse-engineer `__ganttTest.liveViolations()`. The
  **Alert Center** (`violations-button` → `violation-list-dialog`), grouped by **Rule**
  (`alert-groupby-rule`), renders one `alert-group-item` per rule id (`8002/006`) with a
  ready-made **count badge** (the trailing tabular-nums span) and a non-virtualized row
  table you can count directly (`[data-rule-id="8002/006"]`). For any "how many messages
  did this param change produce?" check, read the Alert Center group badge — it is far
  easier and less brittle than inspecting the gantt bells. Worked example:
  `e2e/tests/gantt/legality-recheck-8002-count-compare.spec.ts` (Viol-8011, 59h vs 100h cap).

### Phase 5b — Capture proof snapshots (MANDATORY) → `image/RUST/<function-id>/`
- Every migrated rule MUST leave proof screenshots under **`image/RUST/<function-id>/`**
  (e.g. `image/RUST/8002/`, `image/RUST/8056/`) — this is the standing convention for ALL
  rule-dev work, not optional decoration.
- Capture from the END-USER VIEWPORT with a throwaway Playwright spec (underscore-prefixed,
  e.g. `e2e/tests/gantt/_capture-<rule>.spec.ts`, deleted after the run so it is not
  imported into the Regression tab). Save with `page.screenshot()` / `dialog.screenshot()`.
- Minimum set: (1) the gantt with crew violation bells, (2) the Alert Center listing the
  rule's instance rows with the real message, (3) the Alert Center grouped-by-rule showing
  the new rule coexisting with the previously-migrated ones.
- Read each PNG back with the Read tool to confirm it shows the right content (not a blank /
  wrong view) before considering the rule done.

### Phase 6 — Learn & advance
- Record new gotchas here. Only then start the next rule.

---

## 3. Architecture / data flow

```
crewrule-dev/RuleEngine/rule8002.cpp        (proven logic)
crewrule-dev/RuleTest/rule8002_gtest.cpp    (oracle)
        │  port + replicate
        ▼
rule-engine-rs/  (Rust)  lib.rs rule  +  tests/*_cpp_replica.rs (GATE)  +  bin/check_*
        │  data adapter: node → TSV (block min per crew per day)
        ▼
rule_violation  (rule_group_code='ccar121_gantt', rule_code='8002',
                 pairing_id=triggering pairing, start_dt/end_dt=pairing span)
        │  GET /api/violations?crewIds&groupCode&start&end  (live-server/src/routes/roster/roster-violations.ts)
        ▼
gantt: use-persisted-violations → session-violation-store.displayViolations
        → roster-pane builds PanelRowData.maxViolationSeverity per crew
        → pane-header-canvas drawCrewViolationIndicator (the per-crew indicator/"bell")
           + onViolationHover → tooltip
```

Param authority (separate, for config): `rule.param_json` (workset 103 "PBS Solver
Ruleset" = 8002-only; workset 433 "F8 Full Ruleset" = all 14). New-model instance the
gantt engine actually computes from = `max_ft_flair_f8_p` (set to 40h/28d).

---

## 4. Critical gotchas (learned from 8002)

1. **Active rule group is `ccar121_gantt`** (not `flair_gantt_rule`, despite the latter's
   `is_default`). Source: `use-persisted-violations.ts` → `selectedGroupCode ?? 'ccar121_gantt'`.
   Write violations under the group the gantt actually queries, or they're invisible.
2. **Roster-level (`pairing_id NULL`) violations are DROPPED** by the gantt
   (`if (item.pairingId !== null)`). Cumulative rules are roster-level → attach to the
   triggering pairing (schema: *"7/28/365 cumulative: triggering pairing start → end"*).
3. **Display window filter** `start_dt>=start AND end_dt<=end`; gantt window ≈ current
   view ± ~2 months. The violation's span AND the crew must be inside the loaded view.
4. **Demo data density:** f8 June 2026 is sparse (max ~37h block/crew) → 1 violator at
   40h. The "large number" (158; top 3 **13187=105h, 869=102.8h, 784=96.3h**) is in
   January. Pick a dense month to exercise scale.
5. **Per-crew violation indicator already exists** — `PanelRowData.maxViolationSeverity`
   → `drawCrewViolationIndicator` (`gantt/src/components/gantt/violation-overlay.ts`) at the
   row's right edge, with `onViolationHover` hit-testing already wired in
   `pane-header-canvas.tsx`. The requested "bell right of MDO" is an **extension** of this
   (reposition + feed crew/roster-level violations + message tooltip), not a new build.
6. **TS `violations-init` worker is slow and wrote 0 rows** in this env — prefer the Rust
   path for computing; use the worker only to exercise the real pipeline.
7. **Brew-installing Rust upgraded llhttp and broke node** → `brew reinstall node`.

---

## 5. Reference: 8002 worked example (done)

- Rust: `rule-engine-rs/` — 4/4 cpp-replica tests pass; 0.058 ms / 673 crew.
- DB: `max_ft_flair_f8_p` 28d=2400 (40h); 158 violations in `rule_violation`
  (ccar121_gantt, pairing-attached).
- Worksets: 103 = 8002 only; 433 "F8 Full Ruleset" = all 14.
- Playwright: `legality-8002-violations.spec.ts` (firing decision, green); UI-render test
  exists but flaky (crew-selection).
- Migrations: `sql/migration/2026-06-14-*` (legacy param_json, 8002→40h, gantt max_ft→40h,
  worksets). Memories: `rust-rule-engine-8002`, `legacy-rule-param-json-restore`, `legality-tab-feature`.
- **Proof snapshots:** `image/RUST/8002/` (gantt bells + Alert Center).

---

## 5b. Reference: 8056 worked example (done — rule #2, 2026-06-15)

Rule **8056/006 ROSTER SPACING** — a *pairwise* (roster-to-roster gap) rule, the first of
a different class from 8002's cumulative window. Confirms the playbook generalises.

- **Scope:** A=`FLY` → B=`FLY|SBY|SIM`, Directional=Y, UtilizePostDutyRest=Y, UNIT=RH.
  `interval = next.start − current.end`; violation ⇔ `interval < SPACE` (strict `<`).
  Param authority: `rule.param_json` for 8056/006. **No `rule8056_gtest.cpp` exists** — the
  contract was derived from the active checker (`rule8056.cpp:637-839`), not a gtest.
- **Param change:** added 8056006 to **workset 103** (it already lived in 433 "F8 Full
  Ruleset") and raised SPACE **13 → 24 RH** so the many sub-24h turnarounds surface as
  warnings. Migration: `sql/migration/2026-06-15-rule-8056-006-add-to-103-and-24h.sql`
  (idempotent `rule_set` insert + `jsonb_set` on `{tables,0,rows,0,18}`).
- **Rust:** `rule-engine-rs` — `check_roster_spacing` / `RosterDuty` / `SpacingViolation`
  / `format_hhmm` / `parse_utc_seconds` in `lib.rs`; `bin/check_8056.rs`; replica test
  `tests/rule_8056_cpp_replica.rs` (6/6 green; 8002's 4/4 still green). Live-port
  simplification: scan each crew's FLY duties (one per crew×pairing, start=MIN/end=MAX seg)
  and check **consecutive** pairs — non-consecutive gaps are only larger, and
  consecutive-only keeps one row per triggering pairing (satisfies the `rule_violation`
  UNIQUE).
- **Live (June 2026):** ~690–740 crew evaluated. **24h → ~460–550 crew / ~1460–1770
  violations**; **13h → ~115–120 / ~138–140** (raising SPACE triggers strictly more —
  ~10× the violations, ~4× the crew). Eval well under 1 ms. ⚠️ **The shared demo DB drifts**
  (other sessions edit June rosters), so absolute counts move between runs — Rule-3005
  asserts the *invariant* (24h ≫ 13h) + lower bounds, NOT hard-coded headcounts. The 8002
  windows test's exact counts are similarly at risk on this DB; prefer invariants.
  Harness `live-server/scripts/check-8056-spacing.mjs`; persist
  `live-server/scripts/persist-8056-violations.mjs` (sev **2 Overridable/amber**, group
  `pbs_solver_ruleset`, attached to the earlier pairing). 8002's 848 rows untouched.
- **Playwright (Rule-3004/3005/3006, registered in the Regression tab):**
  `e2e/tests/gantt/rule-8056-spacing.spec.ts` — param=24 RH; engine 24h>13h; **end goal**:
  8056 "less than 24 RH" warnings reach the bell + Alert Center AND 8002 is still there.
  All green.
- **Proof snapshots:** `image/RUST/8056/` — `8056-alert-spacing-rows.png` (sev-2 amber
  spacing rows "…is HH:MM, which is less than 24 RH"), `8056-alert-groupby-rule-with-8002.png`
  (both 8002/006 + 8056/006 groups coexisting), `8056-gantt-bells.png`.

> **Snapshot convention:** put rule-migration proof screenshots under
> `image/RUST/<function-id>/` (e.g. `image/RUST/8002/`, `image/RUST/8056/`, `image/RUST/7502/`).

## 5c. Reference: 7502 worked example (done — rule #3, 2026-06-15)

Rule **7502/002 CALCULATION OF CREDIT HOURS** — the first **CALC** rule (a calculator, not
a checker). It computes a credit-hour value per activity and emits **no violations**, so
the "end goal" is not an Alert Center alarm — it is a credit-hours report + the rule made
visible in the gantt **Legality (config) tab**.

- **Scope:** `credit = max(MinimumCH_floor, block × FT-ratio, dutyPeriod × DP-ratio)`
  (`rule/rule7502/CalculateCreditHoursForCARSRule.cpp:611-647`). **No gtest** — derived
  from `CalculateCredit`. F8 7502/002 params: FLY→FT 1.0, GND→DP 0.5, DO|LO|LEA|SBY→MinCH
  04:00, plus a hardcoded **240-min (4:00) default floor** when a param doesn't set MinCH.
- **Param change:** none. A pure calculator has no threshold to "trigger" and writes no
  `rule_violation` rows; the migration only maps 7502002 into workset 103
  (`sql/migration/2026-06-15-rule-7502-002-add-to-103.sql`).
- **Rust:** `lib.rs` — `CreditParam`/`credit_segment`/`credit_ground`/`credit_for_activity`/
  `f8_credit_ruleset`; `bin/check_7502.rs`; `tests/rule_7502_cpp_replica.rs` (8/8 green;
  8002 4/4 + 8056 6/6 still green).
- **Live (June 2026):** 808 crew, ~64,272 h total credit (~3 ms). Harness
  `live-server/scripts/check-7502-credit.mjs` (reads ratios from param_json; CALC only,
  no DB writes). **Data gotcha:** the demo's `assignment_group='GRD'` lumps days-off (DO),
  leave (VAC/ILL), standby (RES) with real ground duty (GRD/SIM/DHD) — match on the live
  `assignment` CODE, not the coarse group, or a 24h day-off is wrongly credited 12 h via
  DP×0.5 instead of the flat 4:00. June FLY block is sparse (~158 segments join `flight`),
  so credit is floor-dominated — that's honest, not a bug.
- **Playwright (Rule-3007/3008/3009, registered):** `e2e/tests/gantt/rule-7502-credit.spec.ts`
  — param via Legality API; Rust engine June credit (invariants); Legality TAB shows
  7502/002 in ruleset 103 **and** 7502 emits **zero** violations (pure calc). All green.
  Adding 7502 to 103 made `legality-tab.spec.ts` stale (103: 3→4 rules) — updated per
  §Stale-Test.
- **Proof snapshots:** `image/RUST/7502/` — `7502-legality-credit-params.png` (ruleset 103
  with the FT/DP/MinCH credit table), `7502-legality-ruleset-103.png`,
  `7502-credit-report.txt` (the per-crew CLI report).

> **CALC-rule note:** a calculator's "end-user viewport" gate is NOT an Alert Center alarm
> (it has none). Use (a) the Legality config tab showing the rule + params, and (b) an
> assertion that it produces **zero** `rule_violation` rows, plus the engine credit report.

## 5d. Reference: 8002 enriched with a standalone CREDIT-HOUR band (done — 2026-06-15)

A *feature enrichment* of an already-migrated rule (not a new function): a **4th row** added
to 8002/006 — `1 | CM | Y | 75:00 | 65:00 | CH`. Type **CH** is the credit-hour type the
C++ 8002 already supports (`rule8002.cpp:657-684`): violate if `totalCredit > Max ||
totalCredit < Min`. 8002 fires it **standalone** — it computes the crew's monthly credit
itself and does NOT consume 7502's man-day store (per the user's "make 8002 fire by itself").

- **Param:** `sql/migration/2026-06-15-rule-8002-006-add-credit-band-row.sql` (jsonb append;
  also normalises an earlier `Credit` label → `CH`). 8002/006 now has 4 rows (3 BH + 1 CH).
- **Rust (8002 section of `lib.rs`):** `activity_credit_8002` (FLY → max(4:00, block);
  ground/off → flat 4:00 — deliberately simpler than 7502's FT/DP ratios), `check_credit_band`
  (prorated min/max, strict), `days_in_month`; bin `check-8002-credit`; test
  `tests/rule_8002_credit_band_cpp_replica.rs` (7/7). Proration = active-days / days-in-month.
- **Live June:** 812 crew-months, **691 warnings persisted** (all over-max — the floored
  monthly credit ~80–330h ≫ 75h on the dense roster; the under-min bound is covered by unit
  tests, no crew is idle enough in June). Harness `live-server/scripts/check-8002-credit.mjs`
  (`--persist`; sev **2**, rule_code 8002 / instance 006, `created_by='rust_8002_credit'` so
  it's deletable independently of the BH-window 8002 rows). Coexists with the 848 sev-3 block
  8002 rows + 1461 8056.
- **Playwright Rule-3010/3011/3012** (`e2e/tests/gantt/rule-8002-credit.spec.ts`, registered):
  param (4th CH row), engine band warnings, Alert Center shows the credit warnings **and** the
  block 8002 + 8056 still there. Adding the row made `rule-8002-windows.spec.ts` (Rule-3001),
  `legality-tab.spec.ts` (Legal-6002), and `alert-center-8002.spec.ts` (Viol-8001) stale
  (3→4 rows / "every 8002 is sev 3") — all updated per §Stale-Test.
- **Proof:** `image/RUST/8002/8002-credit-band-alert-center.png` (8002/006 group showing both
  the sev-3 "Cumulative block … 40h" rows and the sev-2 "Monthly credit … 1 CM … 75:00 max"
  rows, with proration visible).

> **Enrichment vs migration:** when a check rule already supports a Type/branch in the C++
> (here `CH`), prefer adding that param row + porting the branch over inventing a new metric.
> A standalone metric (no cross-rule data dependency) keeps the rule independently testable.

## 5e. Reference: 8030 worked example (done — rule #4, 2026-06-15)

Rule **8030/004 PILOT AGE ("Age Restriction")** — the first **aggregate-per-flight** rule
(a count over the crew complement, not a per-crew metric). Source:
`crewrule-dev/RuleEngine/rule8030.cpp` (`checkPilotAge`). **No gtest** — contract derived
from the active checker.

- **Scope:** DIVISION=P, AIRPORT=*, AGE DEFINE, MAX NUMBER=1. Per flight, count division-P
  crew aged ≥ AGE DEFINE at the flight start; violation ⇔ count **> MAX NUMBER** (strict `>`).
  Message `rule8030.cpp:176`. The C++ ground-duty branch is a per-crew count of 1 (never
  exceeds MAX=1) → no violations, omitted.
- **Param change:** added 8030004 to **workset 103** (already in 433) and lowered AGE DEFINE
  **65 → 35** (`sql/migration/2026-06-15-rule-8030-004-add-to-103-age35.sql`, `jsonb_set` on
  `{tables,0,rows,0,2}`, guarded by old value `65`) so the many two-pilots-over-35 flights
  surface as warnings.
- **Rust (`lib.rs`):** `FlightCrew`/`AgeFlight`/`AgeViolation`/`age_years_at` (calendar age
  via `civil_from_days`) / `check_pilot_age`; bin `check-8030`; test
  `tests/rule_8030_cpp_replica.rs` (5/5; all prior suites still green).
- **Live-port key:** `roster_flight.flt_id` is NULL in the demo, so "crew on the same
  flight" is keyed by the shared **`pairing_id`** (the crew complement flying together) —
  the same per-pairing reduction 8056 used. Age evaluated at the pairing start.
- **Live (June 2026):** 1922 flights; **age 35 → 263 flights / 541 violations / 154 crew**;
  **age 65 → 1 flight / 2 violations** (the 65→35 invariant: ~270× more). Harness
  `live-server/scripts/check-8030-age.mjs`; persist `persist-8030-violations.mjs` (sev **2**,
  group `pbs_solver_ruleset`, attached to the firing pairing, `created_by='rust_8030'`).
- **Playwright Rule-3013/3014/3015** (`e2e/tests/gantt/rule-8030-age.spec.ts`, registered):
  live param Age Define=35; engine 35 ≫ 65 invariant; Alert Center "older than 35" warnings
  reach the gantt AND 8002 still there. All green.
- **Proof:** `image/RUST/8030/` — `8030-alert-age-rows.png` (sev-2 "older than 35 … must not
  exceed (1)" rows), `8030-alert-groupby-rule.png` (8030/004 coexisting with 8002/8004/8056),
  `8030-gantt-bells.png`.

## 5f. Reference: 8004 worked example (done — rule #5, 2026-06-15)

Rule **8004/004 BASIC COMPETENCY ("Basic Competency-F8")** — a **qualification** rule. Source:
`crewrule-dev/RuleEngine/RuleEngine.cpp` (`checkBasicCompetency`, line 8429). **No gtest** —
contract derived from the active checker.

- **Scope:** three Type rows; only **BASE** has Enable Check=Y (RANK/FLEET=N), Grace=0. Per
  roster (crew×pairing): the pairing's base must be a valid `crew_base` row with
  `eff ≤ roster_start AND exp(+grace) > roster_end`. Else violation `RuleEngine.cpp:8554`.
- **Param change:** none — only mapped 8004004 into **workset 103**
  (`sql/migration/2026-06-15-rule-8004-004-add-to-103.sql`). The enabled BASE check already
  fires on live data.
- **Rust (`lib.rs`):** `BaseQual`/`BaseRoster`/`CompetencyViolation`/`base_is_covered`/
  `check_base_competency`; bin `check-8004`; test `tests/rule_8004_cpp_replica.rs` (6/6).
- **Live-port null handling (documented):** the demo leaves EVERY `crew_base.eff` null and
  most `roster_flight.base` empty. So: null exp → far-future (the C++ does this), null eff →
  always-effective (the C++ doesn't, but a strict eff check would spuriously fail every
  base), and empty/'*'-base rosters are SKIPPED (no base requirement — without this, ~5157
  meaningless "empty base" alarms would flood the gantt). `isInSameBase` → exact match.
- **Live (June 2026):** 691 crew, 242 rosters with a real base, **142 violations / 124 crew**
  (crew based YKF/YYZ flying a YVR pairing → "No base (YVR) assigned in roster.") — fires on
  *some but not all* rosters, the honest signal. Harness
  `live-server/scripts/check-8004-competency.mjs`; persist `persist-8004-violations.mjs`
  (sev **2**, `actual_value`/`limit_value` NULL, unit `BASE`, `created_by='rust_8004'`).
- **Playwright Rule-3016/3017/3018** (`e2e/tests/gantt/rule-8004-competency.spec.ts`,
  registered): live param BASE-only; engine `0 < viols ≤ rosters-with-base`; Alert Center
  "assigned in roster" warnings reach the gantt AND 8002 still there. All green.
- **Proof:** `image/RUST/8004/` — `8004-alert-base-rows.png`, `8004-alert-groupby-rule.png`,
  `8004-gantt-bells.png`.
- **§Stale-Test:** adding 8030+8004 to 103 grew it 4 → 6 rules → `legality-tab.spec.ts`
  (Legal-6001 "4 rules"→"6 rules"; Legal-6008 count 4→6, 8004 now PRESENT in 103, "absent"
  probe switched to 7503/003) updated.

> **Aggregate-per-flight note (8030):** rules that count over a flight's whole crew
> complement need a crew-on-flight key. With `flt_id` null, the shared `pairing_id` is the
> faithful live proxy; attach each over-the-cap crew's violation to that pairing.
> **Empty-data note (8004):** when demo data leaves the rule's key field (base, eff dates)
> blank, decide null-handling *per the rule's intent* (skip empty requirements; open-ended
> null windows) and DOCUMENT it — a literal port would either flood or never fire.

## 5g. Reference: 7501 worked example + 2014 dependency (done — rule #6, 2026-06-15)

Rule **7501/004 SINGLE DAY FREE FROM DUTY** — by far the most complex so far: a 3-phase
pipeline (True Rest → flexible **local-night** SDFD → minute-aligned rolling-window scan). The
first rule that DEPENDS on another rule's params: the **Local Night Definition (2014/014)**.

- **Concept:** an **SDFD** = a True Rest fully covering **two consecutive local nights** (a valid
  `MinInterval` placement in each band, no duty in the daytime gap). The crew must accumulate ≥
  **MIN LIMITS** SDFDs in every rolling **PERIOD**-hour window; fewer → violation (strict `<`).
  Source `rule/rule7501/LimitSingleDayFreeFromDutyForCARSRule.cpp`; oracle `rule7501_gtest.cpp`.
- **2014 dependency (the new pattern):** 7501 reads the band from `getLocalNightDefinition()`
  (法规 **2014014**). 2014 is a **Definition** rule (category Definition, class B) — a *parameter
  source*, emits NO violations. Live value **22:00–08:00, min 8h**. The Rust engine is driven
  from it (`LocalNightDef`) — **no hardcoded 22:00/08:00/8h**. Both 7501 + 2014 added to ws 103.
- **Param change:** row-1 (168 RH) **MIN LIMITS 1 → 3**.
  `sql/migration/2026-06-15-rule-7501-004-and-2014-014-add-to-103-minlimits-3.sql` (idempotent
  rule_set inserts for 7501004 + 2014014 + `jsonb_set` on `{tables,0,rows,0,7}`).
- **Rust (`lib.rs` 7501 section):** `LocalNightDef`/`WorkPeriod7501`/`SdfdViolation` +
  `check_sdfd_rolling`; `bin/check_7501.rs`; `tests/rule_7501_cpp_replica.rs` (**12/12** green
  across UTC / YYZ −240 / YEG −360 / UTC+8 fixtures; all other rules still green). Single-month
  fixtures → a fixed offset reproduces the C++ IANA local night exactly (no DST crossed).
- **Work-period classification (the SDFD trap):** `WorkPeriod::GetWorkPeriods` (`WorkPeriod.cpp:28-33`)
  **drops rest/leave** (`isRestAssignment` TYPE L/O, `IsLeaveAssignment`) → days-off + leave are
  FREE TIME, not work. Live exclude **DO/VAC/ILL/LO/LEA**; keep FLY + standby (RES/SBY) + training
  (SIM) + ground (GRD/SFT) + deadhead (DHD). ⚠️ The **gtest fixture** registers only "FLY", so its
  GDO is NOT rest there → it IS a work period (same engine, different input classification — the
  replica keeps the GDO; the live harness drops DO).
- **Live (June 2026):** 726 crew. **MinLimits 1 → 440 crew; MinLimits 3 → 657 crew** (raising the
  limit fires strictly more — the change's point). **638 persisted** (sev **1** yellow, group
  `pbs_solver_ruleset`, instance 004, attached to the triggering/nearest pairing; 19 pure-ground
  crew with no FLY pairing skipped). Eval < 1 ms. Harness `live-server/scripts/check-7501-sdfd.mjs`
  (`--compare`; params read from DB); persist `live-server/scripts/persist-7501-violations.mjs`.
- **Playwright Rule-3019/3020/3021** (`e2e/tests/gantt/rule-7501-sdfd.spec.ts`, registered):
  Legality API carries 7501/004 (168 RH/MinLimits 3) + 2014/014 (22:00/08:00/8h); engine 3 ≫ 1;
  Legality tab shows both in 103 AND 7501 fires on bell + Alert Center with 8002/8056 present.
  Adding 7501+2014 to 103 made `legality-tab.spec.ts` stale (103: 6 → 8 rules) — updated.
- **Proof:** `image/RUST/7501/` — `7501-alert-sdfd-rows.png` (sev-1 "Single day free from duty
  (N) must be at least 3 in 168 RH", N∈{0,1,2}), `7501-alert-groupby-rule.png` (7501/004 = 29
  coexisting with 8002/8004/8030/8056), `7501-gantt-bells.png`.

> **Dependency-rule note:** when a rule reads another rule's config (here 7501 ← 2014 Local Night
> Definition), migrate the **definition** at the same time — surface it as engine parameters (no
> hardcode), add it to the same workset so it shows in the Legality tab, and assert its values in
> the endpoint test. A Definition rule emits no violations (like a CALC).

## 5h. Cross-cutting: optimizer / pre-assignment (PA) tolerance (done — 2026-06-15)

A capability added to **every** migrated checker, not a new rule. The C++ engine, when run by
the **optimizer** (`ROSTER_OPTIMIZER`), tolerates a violation that arises **entirely among
pre-assigned rosters** (`source == "PA"`) — it only flags a breach when at least one
*contributing* roster is newly assigned (non-PA), so the solver is never blamed for legality it
did not create. The **editor** (and the live gantt) always reports.

- **C++ sources:** `rule8056.cpp:719-721` (report unless both `source == "PA"`); `rule7501.cpp`
  `ShouldApplyOptimizerPaIgnore` (only 168/672 RH) + `HasRoAssignedRosterInRange` (window holds a
  non-PA roster); `rule8002.cpp:176` (optimizer only re-checks windows overlapping the candidate
  roster). Oracle: the **7501 gtest** Crew247 optimizer cases (all-PA → tolerate; a CR roster in
  the window → fire) + the DISABLED 5-overnight case.
- **Rust design (additive, zero churn):** added `pub enum Application { Editor, Optimizer }`. Each
  checker keeps its original (editor) signature **unchanged** and delegates to an `*_app(…, app,
  pre_assigned)` variant that carries the pre-assignment info — `check_roster_spacing_app`,
  `check_base_competency_app`, `check_pilot_age_app`, `check_max_cum_block_app` /
  `max_rolling_window_opt`, `check_credit_band_app`, `check_sdfd_rolling_app`. "Contributing
  roster" per rule: the two rosters (8056), the roster (8004), the flight's crew (8030), the
  window's days (8002 — via a `non_pa_days` set), the crew-month (8002 credit band), the work
  periods overlapping the window (7501, restricted to 168/672 RH). PA info is passed as a slice/set
  alongside the existing inputs, so **no struct or existing call-site changed** — editor behaviour,
  the bins, the live harnesses and the gantt are untouched. 7502 is a CALC (no violation → N/A).
- **Tests:** `tests/rule_optimizer_pa_cpp_replica.rs` — for every rule the three states (EDITOR
  fires · OPTIMIZER all-PA tolerates · OPTIMIZER with a non-PA contributor fires), 8/8 green; all
  other replicas still green.
- **Why no live demo:** live demo data has **no `PA`/`CR` source** (only F8/OPT/SCENARIO) and the
  gantt is editor-mode, so optimizer/PA-ignore changes nothing the planner sees today — it is an
  engine capability for when the Rust engine drives the **PBS solver** (where rosters are tagged
  PA = pre-assigned vs CR = newly assigned).

> **Optimizer-rule note:** when porting any future rule, add the `*_app` variant and the three
> optimizer-state tests from the start. The skip is uniform — "tolerate iff all contributing
> rosters are PA" — but each rule defines its own "contributing roster" set.

## 5i. Reference: 7503 worked example + 7500 dependency (done — rule #7, 2026-06-15)

Rule **7503/003 LIMITS OF CONSECUTIVE WOCLs** + its definition dependency **7500/002 Basic
definition of Acc State** — a RELATED PAIR (like 7501+2014). Sources:
`rule/rule7503/LimitConsecutiveWoclForCARSRule.cpp` (`CheckRule`) and
`rule/rule7500/AcclimatizationForCARSRule.cpp` (`CalculateDuty`). **No gtest** for either.

- **7500 = a DEFINITION rule (no violations), consumed by 7503 + others** (7005/7025/6038/7482
  in the C++). It computes each crew's acclimatisation **reference timezone** (start acclimatised
  to base; drift toward a stayed-in TZ by "ACC TZ Adjust" per "Stay Duration per X Hours", F8 =
  01:00/24:00; `adjustTimezone` clamps). 7503's `GetAdjustOffsetTZ` reads it, **falling back to the
  crew base TZ** when unset.
- **7503 contract:** a **WOCL duty** = a flight duty whose FDP overlaps the WOCL window
  [WOCL Start, WOCL End] (02:00–05:59, F8) in the acclimatisation-local time (`IsTimesCovered`,
  an overlap test mapped onto a 2-day period). Consecutive WOCL duties accumulate UNLESS a full
  **local night** of rest (rule **2014**'s band, `GetLocalNightNums` ≥ Min Interval), a ground
  duty, or a non-WOCL duty resets the run. Violation ⇔ run size **> MAX CONSECUTIVE WOCLs**
  (strict `>`). Message: `"Concecutive WOCL duties(N) is more than the limitation(M)."` — the C++
  **typo "Concecutive" is replicated verbatim** (oracle fidelity).
- **Two dependencies, both already-or-now in 103:** 7500 (acc TZ) + 2014 (local-night reset, in
  103 since the 7501 migration). The 7503 local-night count REUSES 2014's `LocalNightDef`.
- **Param change:** added 7500002 + 7503003 to **workset 103** and lowered 7503's MAX 3 → 2
  (`sql/migration/2026-06-15-rule-7503-003-and-7500-002-add-to-103-maxwocl-2.sql`, `jsonb_set`
  `{tables,0,rows,0,6}` guarded by `3`).
- **Rust (`lib.rs`):** 7500 — `acc_state` consts, `AccDuty`, `adjust_timezone`,
  `acc_ref_timezones`; 7503 — `WoclWorkPeriod`/`WoclViolation`, `wocl_times_covered`
  (=`IsTimesCovered`), `local_night_count` (=`GetLocalNightNums`), `check_consecutive_wocl`. Bin
  `check-7503` (7500 has no bin — a definition rule, like 2014). Tests
  `rule_7500_cpp_replica.rs` (4/4) + `rule_7503_cpp_replica.rs` (5/5); all prior green.
- **Live-port note:** roster_flight has no per-segment airport TZ (dep_arp/flt_id null), so the
  acc drift can't run live → the harness uses the **crew prime-base TZ** as the WOCL-eval TZ (the
  C++ fallback; for a domestic op dep TZ == arr TZ == base TZ so the drift is a no-op anyway). The
  drift model is exercised by the 7500 unit tests with synthetic multi-TZ duties.
- **Live (June 2026):** 726 crew evaluated. **MAX 2 → 14 crew / 14 violations**; **MAX 3 → 4 crew
  / 4** (the 3→2 change ≈3.5×). Harness `live-server/scripts/check-7503-wocl.mjs` (`--compare`
  shows 3 vs 2); persist `persist-7503-violations.mjs` (sev **2**, unit `WOCL`, attached to the
  first WOCL duty's pairing, `created_by='rust_7503'`).
- **Playwright Rule-3022/3023/3024** (`e2e/tests/gantt/rule-7503-wocl.spec.ts`, registered): live
  params (7503 Max=2 + 7500 dependency present in 103); engine 2 ≫ 3 invariant; Alert Center
  "Concecutive WOCL duties…" warnings reach the gantt AND 8002 still there. All green. §Stale-Test:
  adding 7500+7503 grew 103 8 → 10 → `legality-tab.spec.ts` (Legal-6001 "10 rules"; Legal-6008
  count 10, 7503/003 + 7500/002 PRESENT, "absent" probe moved to 7504/003) updated.
- **Proof:** `image/RUST/7503/` (`7503-alert-wocl-rows.png`, `7503-alert-groupby-rule.png`,
  `7503-gantt-bells.png`) + `image/RUST/7500/` (`7500-legality-ruleset-103.png`,
  `7500-legality-acc-params.png` — the definition rule's Legality-tab surface, like 7502/2014).

> **Definition-dependency note:** a rule that consumes a shared DEFINITION (7503←7500,
> 7501←2014) needs that definition represented too — as a Rust input (LocalNightDef) or a ref-TZ
> provider — and added to 103 so the dependency is visible. When the live data can't drive the
> definition (no segment TZ), use the C++ fallback (base TZ) and DOCUMENT it; unit-test the full
> model with synthetic data.

## 5j. Reference: 7504 worked example (done — rule #8, 2026-06-15)

Rule **7504/003 SPACING RULE - WOCL** — a min-rest-between-WOCL-duties rule, 8056-shaped
(prev/next pattern + gap check) but filtered to WOCL flight duties. Source:
`rule/rule7504/CheckMinSpaceBetweenDutyForF8Rule.cpp` + `…RuleParam.cpp` (`CheckMinRest`).
**Has a gtest** (`RuleTest/rule7504_gtest.cpp`) — the first migrated rule with a real oracle
since 8002/7501 (7500/7503/8030/8004/8056 were derived from the active checker).

- **Scope:** Prev=FLY, Next=FLY, Prev/Next Attributes=WOCL, Level=D, Utilize Post Rest=Y,
  Min Period=55, Unit=RH. A **WOCL duty** = FDP overlaps [02:00,05:59] in **crew-base-local**
  time (the gtest's `APPLY PRELABELLED ATTRIBUTES=N` path — "WOCL evaluated in crew-base local
  time", same base-TZ simplification 7503 uses live; reuses `wocl_times_covered`). Between two
  consecutive WOCL flight duties the rest gap must be ≥ Min Period RH; gap < Min Period →
  violation (`CheckMinRest`: `gapEnd < gapStart + minPeriod*3600`, strict). Utilize Post Rest=Y
  → gap starts at the duty end.
  message: `"The space between duty(START - END) is less than the minumum rest time (P unit)."`
  — C++ **typo "minumum" replicated verbatim**.
- **gtest oracle (replicated):** YEG (MDT) daytime duties (local 14:00–23:59) are NOT WOCL → no
  fire; overnight duties (local 00:00–05:00) ARE WOCL → <55h apart fires. Both encoded in
  `tests/rule_7504_cpp_replica.rs` (5/5).
- **Param change:** added 7504003 to **workset 103** and raised Min Period **55 → 80 RH**
  (`sql/migration/2026-06-15-rule-7504-003-add-to-103-minperiod-80.sql`, `jsonb_set`
  `{tables,0,rows,0,13}` guarded by `55`). The WOCL window comes from 7503/003 (already in 103).
- **Rust (`lib.rs`):** `WoclSpacingDuty`/`WoclSpacingViolation`/`format_local_dt`/
  `check_min_space_wocl` (reuses `wocl_times_covered`); bin `check-7504`. Live emission is
  **consecutive WOCL-duty pairs** (the 8056 precedent — the C++ all-pairs check adds only
  redundant rows on the same earlier duty; consecutive-only = one row per triggering pairing).
- **Live (June 2026):** 691 crew. **Min 80 → 178 crew / 390 violations**; **Min 55 → 120 / 240**
  (raising the minimum rest triggers strictly more — the user's goal). Harness
  `live-server/scripts/check-7504-wocl-spacing.mjs` (`--compare` 55 vs 80); persist
  `persist-7504-violations.mjs` (sev **2**, unit RH, attached to the earlier duty's pairing,
  `created_by='rust_7504'`). Some worst gaps are negative (overlapping demo rosters) — faithfully
  flagged (gap < 80h) but a data artifact, not the typical case.
- **Playwright Rule-3025/3026/3027** (`e2e/tests/gantt/rule-7504-wocl-spacing.spec.ts`,
  registered): live param (Min 80, FLY+WOCL pattern); engine 80 ≫ 55 invariant; Alert Center
  "minumum rest time (80 RH)" warnings reach the gantt AND 8002 still there. All green.
  §Stale-Test: adding 7504 grew 103 10 → 11 → `legality-tab.spec.ts` (Legal-6001 "11 rules";
  Legal-6008 count 11, 7504/003 PRESENT, "absent" probe moved to 7505/002) updated.
- **Proof:** `image/RUST/7504/` — `7504-alert-spacing-rows.png` (sev-2 "less than the minumum
  rest time (80 RH)" rows), `7504-alert-groupby-rule.png`, `7504-gantt-bells.png`.

> **gtest-backed rule note:** when a `*_gtest.cpp` exists, encode its exact fixtures
> (here the YEG daytime-vs-overnight WOCL cases) as the replica — a stronger oracle than a
> checker-derived contract. Min-rest "spacing" rules (8056, 7504) share the gap-check machinery;
> the only deltas are the matched-duty filter (all FLY vs WOCL-FLY) and the limit param.

## 5k. Reference: 7505 worked example + a param-RESTORE prequel (done — rule #9, 2026-06-15)

Rule **7505/002 MIN # GDOs IN A RP** (Min Guaranteed Days Off per rostering period) — the
first **per-period day-counting** rule, and the first migration that began by **restoring a
truncated param**. Sources: `rule/rule7505/MinimumDaysOffForCARSRule.cpp` (+ `…Param.cpp`);
oracle `RuleTest/rule7505_gtest.cpp` (crew 247 daily-PRPM-SBY block → too few days off).

- **Param-restore prequel (new pattern):** the GUI showed only **1 of 27** band rows for
  7505/002 — `rule.param_json` had been truncated to a single row (RP 30-30 / DO 12 / VAC 0-1).
  Diagnosed by a direct DB read (1 row, not a render bug), restored to the full **27 rows**
  (14 RP 31-31 with MIN DO 13→0 + 13 RP 30-30 with MIN DO 12→0) from the legacy 433 table via
  `sql/migration/2026-06-15-rule-7505-002-restore-do-band-rows.sql` (`jsonb_set` on
  `{tables,0,rows}`, idempotent). Regression `Legal-6010` asserts API serves 27 + GUI renders 27.
- **Contract:** per crew per RP, a **day off** = a calendar day that is blank (Count Blank
  Day=Y), or covered only by DO-group assignments (or a LAYOVER, or DO + an exception
  {SNY,DPW,DPV}). The applicable band row is selected by **RP length** (June=30 → 30-30 rows)
  AND the crew's **leave (VAC) day-count** — more leave ⇒ lower MIN DO. Violation ⇔ daysOff <
  MIN DO (strict). Message (verbatim C++): `"The number of days off(N) must be at least M in 1 RP."`
- **Param change: NONE (the first rule that needed no bump).** The real F8 band already flags
  **191 of 812** crew in live June (the over-worked, < 12-days-off crew). Migration
  `2026-06-15-rule-7505-002-add-to-103.sql` only maps 7505002 into workset 103. Param-sensitivity
  is still proven via the harness `--bump N` debug flag (in-memory MIN DO raise, **DB untouched**):
  +1 ⇒ 246 crew, strictly ≥ 191.
- **Rust (`lib.rs`):** `Activity7505`/`DaysOffRow`/`MinDaysOffViolation` + `local_day_start_utc`,
  `count_days_off`, `count_leave_days`, `check_min_days_off` (+ `_app` optimizer/PA variant); bin
  `check-7505` (R band-rows + A activities on stdin). Test `tests/rule_7505_cpp_replica.rs`
  (**6/6**: crew 247 fires `iDaysOff=9 < 12`; boundary at exactly 12 legal; leave-band selection
  picks the MIN-4 row for a 20-VAC crew; optimizer PA-ignore). All prior suites still green.
- **Live-port notes:** day bucketing is **UTC-day** (offset 0), matching the other harnesses'
  `::date` convention; DO/LEAVE use the **roster vocabulary** (`'DO'`/`'VAC'`), NOT the assignment
  dictionary's groups (where 'DO' is grouped LVE — the demo roster and dictionary use different
  codes); post-duty-rest start = scheduled duty end (roster_flight stores `act_rest_min` as a
  duration, no rest-start timestamp).
- **Live (June 2026):** 812 crew, **191 violating** (fire against MIN DO 12 / 11 / 10 / 9 / 6 —
  the lower floors prove leave-band selection). **188 persisted** (sev **1** Soft/yellow, group
  `pbs_solver_ruleset`, instance 002, attached to a June pairing, `created_by='rust_7505'`; 3 crew
  with no June pairing skipped). Harness `live-server/scripts/check-7505-gdo.mjs` (`--persist`,
  `--bump N`).
- **Playwright Rule-3028/3029/3030** (`e2e/tests/gantt/rule-7505-gdo.spec.ts`, registered): live
  param (27-row band in 103); engine fires honestly + `--bump` monotonicity; Alert Center "number
  of days off … 1 RP" warnings reach the gantt AND 8002 still there. All green. §Stale-Test: adding
  7505 to 103 grew it 11 → 12 → `legality-tab.spec.ts` (Legal-6001 "12 rules"; Legal-6008 count 12,
  7505/002 PRESENT, "absent" probe moved to 7506/002) updated.
- **Proof:** `image/RUST/7505/` — `7505-alert-gdo-rows.png` (sev-1 "days off(N) must be at least
  12 in 1 RP" rows), `7505-alert-groupby-rule.png`, `7505-gantt-bells.png`.

> **Param-restore note:** before migrating, verify the rule's `param_json` is COMPLETE — a
> truncated band (here 1 of 27 rows) silently changes the rule's meaning. Read the DB directly to
> tell data-loss from a render bug; restore from the legacy 433 table with an idempotent `jsonb_set`.
> **Day-counting rule note:** "days off / GDO / blank-day" rules classify each calendar day from
> the union of assignments covering it (blank vs DO-only vs DO+exception); bucket by a consistent
> local-day grid and use the ROSTER assignment codes, not the dictionary groups.

## 5l. Reference: 7506 worked example (done — rule #10, 2026-06-15)

Rule **7506/002 ONE CHECKIN PER DAY ("One Checkin Per Day.")** — a **per-crew, per-local-day
uniqueness** rule, the LAST of the 14-rule "F8 Full Ruleset" (433) ported (7272/001 is a
CALC/Definition handled in parallel). Source:
`rule/rule7506/SingleDailyCheckinForCARSRule.cpp` (`CheckRuleForCrew`) + a real gtest
`RuleTest/rule7506_gtest.cpp`.

- **Contract:** a crew may CHECK IN (roster start) at most once per crew-LOCAL calendar day
  for the checked assignment groups (F8 = "FLY"). Walking the crew's rosters in time order and
  tracking the previous CHECKED roster, two consecutive checked rosters whose START local-days
  are equal → violation (severity **1**, ROSTER). Local day = `getLocalDayStartInUTC` bucketed
  with the PREVIOUS roster's END-station offset (prime-base fallback when empty); the rule keys
  off the START day, NOT the end day (gtest case 3). Message (verbatim C++):
  `"Only one roster allowed (FLY) in one local day."`
- **gtest oracle (replicated, 4 cases):** different start days→pass; same start day→fail;
  cross-midnight but different start days→pass; non-checked groups ignored. Encoded in
  `tests/rule_7506_cpp_replica.rs` (6/6: the 4 gtest cases + a non-UTC local-day-bucketing case
  + the optimizer/PA three-state). **Faithful quirk documented:** the C++ inits `iPrevRoster=0`,
  so if a crew's FIRST roster is non-checked the first checked roster is compared against
  roster[0]; the replica notes it, and the LIVE harness sidesteps it by emitting only the
  checked (FLY) check-ins (the rule's intent — compare consecutive check-ins).
- **Param change: NONE** (like 7505) — the real F8 config already flags honest live cases.
  Migration `2026-06-15-rule-7506-002-add-to-103.sql` only maps 7506002 into workset 103.
- **Rust (`lib.rs`):** `CheckinRoster`/`CheckinViolation`/`check_single_daily_checkin` (+ `_app`
  optimizer/PA variant — tolerate iff BOTH rosters PA, stop after first optimizer breach). Reuses
  `local_day_start_utc`. Bin `check-7506` (roster TSV on stdin). All prior suites still green.
- **Live-port note:** the check-ins are the crew's FLY PAIRINGS (one per crew×pairing, start =
  earliest segment); ground/DO/leave are not in the "FLY" group so never count. Local-day
  bucketing uses the crew PRIME-BASE offset (the demo has no reliable per-pairing end-station TZ
  — same base-TZ simplification 7503/7504 use). Checked group read from `param_json`, not hardcoded.
- **Live (June 2026):** 691 crew, 5257 FLY check-ins → **79 violations / 74 crew** (crew assigned
  two separate FLY pairings the same local day; all 79 attachable to a triggering pairing, 0
  dropped). Cross-checked vs a UTC-day SQL approximation (107 day-buckets / 92 crew — local-offset
  bucketing shifts some, as expected). Eval ~0.1 ms. Harness
  `live-server/scripts/check-7506-checkin.mjs` (`--persist`, `--json`; sev **1**, group
  `pbs_solver_ruleset`, instance 002, `created_by='rust_7506'`).
- **Playwright Rule-3031/3032/3033** (`e2e/tests/gantt/rule-7506-checkin.spec.ts`, registered):
  live param (FLY in 103); engine fires honestly (>0, < check-ins, every breach attachable);
  Alert Center "Only one roster allowed (FLY) in one local day." warnings reach the gantt bell AND
  8002 still there. All green.
- **§Stale-Test (the parity flip):** adding 7506 (+ the parallel 7272) brought **103 to 14 rules =
  parity with 433**, so the Legality tab now auto-selects the Default (103) on load instead of the
  larger 433. `legality-tab.spec.ts`'s `openLegality` helper (hard-assumed 433-first) was updated
  to select the 433 card explicitly. All 9 legality-tab tests green (incl. the parallel Legal-6011
  7272-params and Legal-6012 Definition-chip).
- **Proof:** `image/RUST/7506/` — `7506-alert-checkin-rows.png` (sev-1 "Only one roster allowed
  (FLY) in one local day." rows), `7506-alert-groupby-rule.png` (7506/002 coexisting with
  8002/7501/7504/7505/8004/8030/8056), `7506-gantt-bells.png`.

> **Uniqueness-rule note:** "at most one X per local day" rules walk the crew's checked rosters in
> order and compare consecutive same-local-day starts. Emit only the checked group's rosters to
> the engine to avoid the C++ `iPrevRoster=0` init quirk; bucket by the same local-day grid the
> other rules use. **Parity-flip note:** once workset 103 reaches the same size as 433, any test
> that assumed "the bigger/full ruleset loads first" goes stale — select the ruleset explicitly.

## 5m. Reference: 7272 worked example (done — rule #11, 2026-06-15)

Rule **7272/001 CALCULATE DP OF THE RESERVES** — a **DEFINITION / CALC rule** (category=Definition,
class R) like 7502/2014/7500: it computes the duty-period a standby/reserve assignment earns and
emits **NO violations**; other duty rules consume the DP. The 2nd migrated rule that came with a real
gtest (after 8002/7501/7504). Source `rule/rule7272/CalculateStandbyDPForTGRule.cpp`; oracle
`RuleTest/rule7272_gtest.cpp`. It was the last 433 member whose params were only config-restored
(`2026-06-15-rule-7272-001-param-json.sql` + Definition category) before this engine migration.

- **Contract:** `Calculate(roster, nextRoster)` matches the roster qualifier against the param's
  Assignments (else returns **-1**). Regular standby: `dp = (long)(max(0, restStart−start −
  offsetMin·60)·rate)` (seconds, truncated). Callout (notificationTime>0 + next pairing): sbyDuration
  = notify−start; callout = nextReport−notify; if sbyDuration > sbyLimit·60 → regular(sbyDuration)
  (+ callout·rate if callout < notifyLimit·60); else if callout < notifyLimit·60 → callout·rate; else
  0. The duty/pairing path stores DP rounded to whole MINUTES (`dp/60`), so seconds become min·60
  (gtest 14256→237→14220). F8 params: Assignments=SBY|PRAM|PRPM, Standby Offset 00:00, Rate 0.33,
  SBY/Notification Limit 00:00 ⇒ live DP = standby_duration·0.33.
- **Param change: NONE** (CALC rule, no threshold). `2026-06-15-rule-7272-001-add-to-103.sql` only
  maps 7272001 into workset 103.
- **Rust (`lib.rs`):** `StandbyDpParam`/`StandbyRoster` + `regular_standby_dp`/`callout_standby_dp`/
  `calc_standby_dp`/`standby_dp_minutes`; bin `check-7272` (reserve-roster TSV on stdin). Test
  `tests/rule_7272_cpp_replica.rs` (**9/9** — all gtest cases: 14256 s, qualifier match/no-match → -1,
  offset reduction, floor-at-0, minute rounding, callout 7128, live RES). All prior suites green.
- **Live-port note (vocabulary gotcha, §5c class):** the param lists dictionary codes SBY|PRAM|PRPM,
  but live roster_flight uses **'RES'** for reserve standby (same RES dictionary group as PRAM/PRPM);
  the harness adds 'RES' to the matched assignments. No notification data live → all reserves use the
  regular path (the callout branch is exercised by the unit test).
- **Live (June 2026):** **1475 reserve rosters / 212 crew / ~5480 reserve DP-hours** (avg 3.71 h,
  longest 7:55), **0 violations** (CALC). Harness `live-server/scripts/check-7272-standby-dp.mjs`
  (no `--persist`: a CALC rule writes nothing).
- **Playwright Rule-3034/3035/3036** (`e2e/tests/gantt/rule-7272-standby-dp.spec.ts`, registered):
  live param (standby-DP table in 103); engine computes DP + writes 0 violations; Legality tab shows
  7272/001 in 103 AND it emits no bell/Alert-Center rows (8002 still there). All green. ⚠️ **ID note:**
  7506 (rule #10, parallel session) took Rule-3031/3032/3033 — 7272 uses **3034/3035/3036** (IDs are
  globally unique, never reused). §Stale-Test: 7272 was the rule that tipped **103 to 14 = 433** (the
  parity flip, §5l note) — `legality-tab.spec.ts` Legal-6001/6008 updated to 14 + `openLegality`
  selects 433 explicitly.
- **Proof:** `image/RUST/7272/` — `7272-legality-ruleset-103.png` (7272/001 among the 14 migrated
  rules), `7272-legality-standby-dp-params.png` (Assignments/Standby Offset/Rate/SBY Limit/Notification
  Limit = SBY|PRAM|PRPM / 00:00 / 0.33 / 00:00 / 00:00) — the CALC "end goal" is the Legality config
  tab, like 7502/2014/7500.

> **CALC-rule recap:** a calculator's gate is the Legality config tab + an assertion of **zero**
> rule_violation rows, plus the engine's value report (here per-crew reserve DP) — NOT an Alert Center
> alarm. With 7272 + 7506 migrated, **all 14 F8 rules are now ported** (103 == 433).

### Group-code correction (supersedes §4.1 / §3 for current code)

The gantt's active rule group is now **`pbs_solver_ruleset`** (the workset 103 slug), NOT
`ccar121_gantt`. Source: `use-persisted-violations.ts` →
`useRuleCheckStore.ruleGroupCode || 'pbs_solver_ruleset'` (the TOOLBAR RuleGroupSelector's
value, not the Rule-management page's `selectedGroupCode`). Persist violations under
`pbs_solver_ruleset` or the gantt queries the wrong group and shows zero. Verify with a
`/api/violations` probe before wiring any new rule's UI.

---

## 6. Open items / next features

- **Crew violation bell** (user request): extend `drawCrewViolationIndicator` to sit right
  of the MDO column, color by severity, include **roster-level + pairing-level** messages,
  hover → popup. Requires feeding crew/roster-level violations into the row (fix #2 →
  keep roster-level keyed by crew). Add a `__ganttTest` getter + Playwright (bell present
  for violating crew, absent for legal, count == DB).
- **Feature #6** — rule_template column ranking rules by historical **violation
  likelihood**, to check the most-likely-to-violate rules first. Not started.

---

## 7. My suggestions / recommendations

1. **Make a generic Rust rule runner, not one binary per rule.** As rules grow, take
   `(rule_code, param_json, roster)` → violations. Drive params straight from
   `rule.param_json` so config and engine never drift. One `cargo test` suite, one CLI.
2. **Fix roster-level violations properly, once.** The `pairing_id !== null` drop in
   `use-persisted-violations.ts` will bite EVERY cumulative rule (7/28/365 BH, DP, GDO,
   rest). Add first-class crew-level violation handling (store keyed by crew) and the bell
   — this unblocks a whole rule class, not just 8002.
3. **Expose the Rust engine as a service or WASM** consumed by live-server (replace the
   13-min worker). Sync block-time bucketing to crew-base-local + cross-midnight split to
   match C++ exactly (our live check uses UTC-day bucketing — fine for counts, refine for
   boundary fidelity).
4. **Three-number contract per rule, every time:** (a) cargo gtest replica green,
   (b) live violation count, (c) gantt UI count == (b). Treat (c) as the definition of
   done; an endpoint-only check is not enough (it hid the group + roster-level bugs).
5. **Don't trust default rule-group assumptions — observe.** A 30-line Playwright probe
   intercepting `/api/violations` revealed `ccar121_gantt` instantly. Do this first for
   any rule whose UI you're wiring.
6. **Track demo-data density.** Keep a note of which months are dense (January) so tests
   exercise real scale; don't infer "rule broken" from a sparse month.
7. **Order of operations:** logic-gate (Rust) → data → group/pairing wiring → UI count.
   Most lost time was UI-wiring assumptions, not rule logic. Front-load §4 gotchas.
8. **Migrate by rule *class*, not strictly sequentially, after #2 lands.** Cumulative-window
   rules (8002 BH/DP, GDO, max-local-nights) share machinery (rolling window + triggering
   pairing) — the second one will be cheap once the class is wired.

---

## 8. Performance: rule-check parallelism (measured 2026-06-19)

**How the check runs today (Live init + Scenario first-open).** Both paths share
`legality-recheck-core.mjs`. The dispatch is **sequential at every level**:

- **Across the 9 rules:** `computeViolations()` does `for (const rule of RULES) { await rule(...) }`
  (`legality-recheck-core.mjs:262`; scenario driver `scenario-legality.mjs:210` mirrors it) — one
  rule fully finishes before the next starts.
- **Each rule's binary:** `runBin()` uses `spawnSync` (`:38`) — blocking.
- **Inside each binary:** single-threaded crew loop, std-only, no rayon/tokio.

**The bottleneck is DB round-trips, NOT the Rust engine.** Each `check-XXXX` binary runs
sub-millisecond; ~all wall-time is Node waiting on serial queries to the (remote) DB.

**Measured — scenario 460 (26 crew, 1,638 roster rows), remote DB, 2 runs:**

| Mode | Wall time | Speedup |
|---|---|---|
| Current — sequential (`for…await` over 9 rules) | **~28.9 s** | 1× |
| Parallel (`Promise.all` over the 9 rules, pooled conns) | **~5.8–8.3 s** | **3.5–4.9×** |

Per-rule sequential cost (DB query + binary), slowest first: 7505 ~12 s (3 serial remote
round-trips) · 7503 ~5.1 s · 8004 ~4.4 s · 8030 ~3.0 s · 7504/7506/7501 ~1.1 s · 8056 ~0.7 s ·
8002 ~0.09 s. Note parallel (~6 s) beats even the slowest single rule (12 s) — because that
12 s is itself 3 *serial* network waits that overlap with other rules' waits under concurrency.

**Recommendations (cheap → structural):**

1. **One-line win:** replace the `for…await` loop in `computeViolations()` with
   `await Promise.all(RULES.map(r => r(source, ctx)))`. Delivers the measured 3.5–4.9×.
   **No need** to convert `spawnSync`→async `spawn` — binaries are too fast for the brief
   event-loop block to matter; the expensive `await db.query` parts already overlap.
   Cap concurrency (~4–5) only if many scenarios compute at once. No correctness risk —
   rules write disjoint `rule_code` rows.
2. **Bigger lever — load shared data once.** Both modes re-query: `crewOffsets()` (2 full
   `crew_base` scans) is called by 4 rules = 8 scans; several rules re-read
   `scenario.roster_flight` with different groupings. Load roster + offsets once and pass in —
   shrinks the *sum*, helping both modes. Combined with #1, scenario 460 should land in ~2–4 s.
3. Absolute numbers are inflated by the slow remote link; the *ratio* (parallel ≈ 3–5×) holds
   wherever round-trip latency dominates. On a LAN/local DB both modes are far faster.

To re-measure: a throwaway pooled harness (pg.Pool max 12) that times each rule via
`process.hrtime`, then a sequential `for…await` vs a `Promise.all` pass.
