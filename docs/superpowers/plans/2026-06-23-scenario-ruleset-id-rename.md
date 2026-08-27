# Pieces 2+3 — `scenario.rule_group_code` → `ruleset_id` + Scenario UI (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Rename `scenario.rule_group_code` (varchar group-code, name-matched to a workset) to **`ruleset_id`** (bigint = `workset.id`, default **103**), re-point every consumer from the name-match to a direct id, source the scenario **RuleSet dropdown** from `workset.category='RULE'`, and adjust the Scenario UI (Division select under Date / default Pilots, remove Status).

**Architecture:** The resolution `scenario.rule_group_code → rule_group.name → workset.name → workset.id` collapses to `scenario.ruleset_id = workset.id`. The rule-check tables' own `rule_group_code` columns (`rule_check_result_*`, `rule_check_batch_run`, `rule_violation`, `calc_result`) and the live-default group constant `'pbs_solver_ruleset'` are **separate and unchanged**. Spec context: the Rule-tab→Legality migration; workset 103/433 are now `category='RULE'` (Piece 1).

**Tech Stack:** PostgreSQL migration, Fastify + Drizzle (live-server), Python (engine-server `ro_input_builder`), React + Zustand (gantt), Playwright/Vitest/pytest.

---

## Phase A — Schema migration

### Task A1: migrate `scenario.ruleset_id` + `scenario.legality_status.ruleset_id`

**Files:** Create `sql/migration/2026-06-23-scenario-ruleset-id.sql`; Modify `sql/schema/live/02-crew-roster.sql` (the `scenario` DDL) + `sql/migration/2026-06-15-scenario-legality-tables.sql`'s on-disk schema is historical — update the live DDL only.

- [ ] **Step 1: Write the migration** (add bigint, backfill from the old code, drop varchar; same for legality_status):

```sql
set search_path = f8;
begin;

-- scenario.rule_group_code (varchar 'pbs_solver_ruleset' / '' / 'DFLT') → ruleset_id (bigint workset.id, default 103)
alter table scenario add column ruleset_id bigint;
-- backfill: name-match the old code to a workset; everything else → 103 (PBS Solver Ruleset)
update scenario sc
   set ruleset_id = coalesce((
     select w.id from rule_group rg
       join workset w on w.name = rg.name
      where rg.group_code = sc.rule_group_code and rg.is_deleted = 0
      order by w.id limit 1), 103);
alter table scenario alter column ruleset_id set not null;
alter table scenario alter column ruleset_id set default 103;
alter table scenario drop column rule_group_code;

-- scenario.legality_status.rule_group_code → ruleset_id (same mapping)
alter table legality_status add column ruleset_id bigint;
update legality_status ls
   set ruleset_id = coalesce((
     select w.id from rule_group rg join workset w on w.name = rg.name
      where rg.group_code = ls.rule_group_code and rg.is_deleted = 0 order by w.id limit 1), 103);
alter table legality_status alter column ruleset_id set default 103;
alter table legality_status drop column rule_group_code;

commit;
```

- [ ] **Step 2: Update the live DDL** — `sql/schema/live/02-crew-roster.sql:1618`: `rule_group_code varchar(50) not null` → `ruleset_id bigint not null default 103` (comment: 法规集 workset.id). Update the `legality_status` DDL likewise.

- [ ] **Step 3: Apply + verify**

Run: `PGPASSWORD=Pier2026AIf8 psql -h localhost -U f8 -d rois -v ON_ERROR_STOP=1 -f sql/migration/2026-06-23-scenario-ruleset-id.sql`
Verify: `select id, ruleset_id from scenario order by id desc limit 8;` — all non-null, `'pbs_solver_ruleset'` scenarios → 103.

- [ ] **Step 4: Commit** `feat(sql): rename scenario.rule_group_code → ruleset_id (bigint workset.id, default 103)`

---

## Phase B — Backend re-point

### Task B1: Drizzle model + scenario create/run

**Files:** `live-server/src/models/scenario/scenario.ts`, `live-server/src/services/scenario/scenario-service.ts`, `live-server/src/routes/scenario/scenario.ts`, the scenario DTO types.

- [ ] `scenario.ts:16` — `ruleGroupCode: varchar('rule_group_code',{length:50}).notNull()` → `rulesetId: bigint('ruleset_id',{mode:'number'}).notNull().default(103)`.
- [ ] `scenario-service.ts:119` (create) — `ruleGroupCode: data.ruleGroupCode ?? ''` → `rulesetId: data.rulesetId ?? 103`; PATCH likewise (`:128-142`). Validate the id exists in `workset` (else 400).
- [ ] `routes/scenario/scenario.ts:136` — accept `rulesetId: number` in the body (Zod), drop `ruleGroupCode`.
- [ ] Update the scenario row DTOs (read paths that returned `ruleGroupCode`) to `rulesetId`.
- [ ] tsc clean; commit `feat(live-server): scenario create/run uses ruleset_id (workset.id)`.

### Task B2: resolution chain + legality delete guard + export + legality-status

**Files:** `engine-server/F8/ro_input_builder/cli.py`, `live-server/src/routes/rule/legality.ts`, `live-server/src/services/scenario/scenario-export-service.ts`, `live-server/src/services/scenario/legality-status.ts`, `engine-server/F8/ro_input_builder/sections/meta.py`.

- [ ] `cli.py` `scenario_workset_id()` (≈160-167) — replace the `rule_group → workset name-match` join with `SELECT ruleset_id FROM scenario WHERE id = %s` (direct). `scenario_crew_division()` — unchanged (uses division, not the code) unless it also name-matched.
- [ ] `legality.ts` DELETE-ruleset guard (≈298) — replace `JOIN rule_group rg ON rg.group_code = sc.rule_group_code … WHERE rg.name = $1` with `... WHERE sc.ruleset_id = $1` (the workset id). (Simpler; the guard already has `$1 = wid`.)
- [ ] `scenario-export-service.ts:113-120` `resolveRuleGroupCode()` → `resolveRulesetId()` returns `s.rulesetId` (bigint); its `rule_group` query becomes `… WHERE workset_id = ${rulesetId}` or is removed if no longer needed.
- [ ] `legality-status.ts:40,56` — select/insert `ruleset_id` (bigint) into `legality_status`.
- [ ] `meta.py:22` `Col("ruleSetId","rule_group_code")` → `Col("ruleSetId","ruleset_id")`; `:69-76` `_scenario()` — emit the actual `sc.ruleset_id` (it already hardcoded 103; now use the column).
- [ ] Verify: scenario-538/540 RUST e2e still passes (workset resolves from `ruleset_id`); legality DELETE guard test still 409s for an in-use workset. Commit `feat: resolve scenario→workset directly via ruleset_id`.

---

## Phase C — Frontend RuleSet dropdown

### Task C1: dropdown sources `workset.category='RULE'`, writes workset.id

**Files:** `gantt/src/types/scenario-gantt.ts`, `gantt/src/stores/scenario-store.ts`, `gantt/src/services/scenario-api.ts`, the scenario create/detail RuleSet selector component (find via `ruleGroupCode` / "RuleGroupSelector" — likely `gantt/src/components/scenario/scenario-basic-info.tsx` and/or `gantt-sub-toolbar.tsx`).

- [ ] Types: `ScenarioDetail`/`CreateScenarioInput` `ruleGroupCode: string` → `rulesetId: number`.
- [ ] `scenario-api.ts`: a `listRuleWorksets()` → `GET /api/legality/rulesets` filtered to `category='RULE'` (or a new param), returning `{id, name}`. (The legality `/rulesets` already returns rule-mapping worksets — 103/433; confirm it only returns RULE-category ones, else add a filter.)
- [ ] Dropdown: options = those worksets, label `#{id} {name}`, value `workset.id`; on select set `rulesetId`; default 103. Replace the old name-based code binding.
- [ ] tsc + `npm run check:ui` clean. Commit `feat(gantt): scenario RuleSet dropdown from RULE worksets → ruleset_id`.

---

## Phase D — Scenario UI (division + status)

### Task D1: Division under Date (default Pilots); remove Status

**Files:** `gantt/src/components/scenario/scenario-basic-info.tsx` (Basic Info form), and wherever the Status field is rendered in the scenario create/detail.

- [ ] Move the **Division** select into Basic Info's left column, directly under the **Date** field; default value **`P` (Pilots)**. Source options from `dictionary.DIVISION` (P/C) if not already.
- [ ] Remove the **Status** field from the scenario create/detail UI (status is system-managed: DRAFT/RUNNING/DONE/FAILED — not user-editable). Keep the backend status; just drop the UI control.
- [ ] tsc + check:ui clean. Commit `feat(gantt): scenario Basic Info — Division under Date (default Pilots), remove Status field`.

---

## Phase E — Tests + version

### Task E1: update tests, add coverage, bump versions

**Files:** `e2e/tests/gantt/scenario-run.spec.ts` + `scenario-539/540/541-*.spec.ts` (rename `ruleGroupCode`→`rulesetId` assertions/comments); `live-server` scenario tests; `gantt/src/version.ts`.

- [ ] Update e2e assertions: `saved.ruleGroupCode` → `saved.rulesetId` (number, e.g. 103). Update the "resolved from scenario.rule_group_code" comments.
- [ ] Add an e2e: create a scenario, pick a RuleSet from the dropdown, run it, assert `scenario.ruleset_id` = the chosen workset.id and the RUST run resolves that workset (solver log "workset N").
- [ ] Run the affected scenario RUST e2e(s) + the legality suite — paste PASS receipts.
- [ ] Bump `BACKEND_VERSION` + `FRONTEND_VERSION`. Commit `test+chore: ruleset_id rename test updates + version bump`.

---

## Self-Review (done)

- **Coverage:** schema (A1) + legality_status; model/create/run (B1); resolution chain + delete guard + export + legality-status + meta.py (B2); dropdown (C1); UI division/status (D1); tests/version (E1). Matches the consumer inventory.
- **Left alone (verified separate):** `rule_group` table + `rule_check_result_*` / `rule_check_batch_run` / `rule_violation` / `calc_result` `rule_group_code` columns + the `'pbs_solver_ruleset'` live-default constant.
- **Data safety:** the migration backfills `ruleset_id` by the SAME name-match the engine used, so existing scenarios keep their effective workset; unmapped/blank → 103. The RUST path keys legality by `RUST_RULE_WORKSET` (already resolved per-scenario), so it follows `ruleset_id` after B2.
- **Verify-at-impl:** confirm `legality_status` is the exact table name; confirm `GET /api/legality/rulesets` returns only RULE-category worksets (now 103/433 are `category='RULE'`) or add the filter; locate the exact Status-field + Division-select components before editing.
