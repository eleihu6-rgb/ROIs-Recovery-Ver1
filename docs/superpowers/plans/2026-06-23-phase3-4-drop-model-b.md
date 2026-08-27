# Phase 3+4 — Drop Model B + Delete the Rule Tab (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Run each task's tests and paste the PASS receipt (§No-Illusion) before moving on.

**Goal:** Retire the duplicate rule "Model B" (`rule_template` / `rule_instance` / `rule_group` / `rule_group_instance` / `rule_parameter`) and delete the gantt **Rule tab** that is its CRUD UI, re-pointing the one kept consumer — the **live rule-check (Model C)** — onto Model A (`workset` / `rule_set` / `rule`). The live RUST optimizer already reads legality params from `rule.param_json`; the live rule-check is code-driven and reads no Model B behavior at runtime.

**Architecture:** Phase 3 (drop Model B) and Phase 4 (delete Rule tab) are **coupled** — the Rule tab IS Model B's CRUD UI, so they ship together. **Keep exactly three rule tables: `workset` / `rule_set` / `rule`** (what RUST uses). **Drop all five Model B tables: `rule_group` / `rule_group_instance` / `rule_instance` / `rule_template` / `rule_parameter`.** The live rule-check keeps its `rule_group_code` *result-table columns* (dimensional keys on `rule_check_result_*` / `rule_violation` / `calc_result`) unchanged; only the *source* of the group list and the default moves from `rule_group` → `workset` (category `RULE`). The `ro_input.gz` `RuleParameter` section is **re-pointed to source from `rule.param_json`** (the param rows live there — `pg_rule_params._param_rows` already parses `param_json.tables`), so the `ro_input` contract is preserved while `rule_parameter` the table is dropped. (User decision 2026-06-23: re-point the engine's `rule_parameter` extraction to `rule.param_json`, then drop the table.)

**Tech Stack:** PostgreSQL migration, Fastify + Drizzle (live-server), Python (engine-server `ro_input_builder`), React + Zustand (gantt), Playwright/Vitest.

**Investigation already done (do NOT re-derive):**
- `rule-loader-service.ts` (the only code that read Model B *behavior* — `check_type`/`conditions`/`message_template`) is **dead** (zero imports). Live rule-check is code-driven.
- RUST solver legality params: `rules/rust_checker.py:134` → `io/pg_rule_params.load_rule_params(workset=103)` → reads `rule.param_json`. Not the `ro_input` `RuleParameter` section. Active mode = `rust` (`engine-server/src/config/config.yaml.example:137`).
- Model B FK graph: only `rule_group_instance → rule_group` and `rule_group_instance → rule_instance`. `rule_instance`→`rule_template` and `rule_parameter`→`rule` are by-value (no FK). **Drop order:** `rule_group_instance` first, then `rule_group` / `rule_instance` / `rule_template` / `rule_parameter` in any order.
- Live-check group selector source: `gantt/src/components/common/rule-group-selector.tsx:25` calls `ruleConfigApi.listGroups()` (Model B). Default: `rule-check-trigger.ts:9` `SELECT group_code FROM rule_group WHERE is_default`.

---

## Task 0: Confirm one deferred unknown (verify-at-impl, NO code change)

**Files:** read-only.

> User has decided the `RuleParameter` ro_input section is **re-pointed to `rule.param_json`** (Task 2), not deleted — so its consumer status no longer gates the work. Only the live-check `groupCode` semantics need confirming.

- [ ] **Step 1: Confirm the live rule-check engine treats `groupCode` as a label, not a rule-subset selector.**
  Trace what the check engine does with the `ruleGroupCode`/`groupCode` it receives: `grep -rn "groupCode\|rule_group\|ruleGroupCode\|enabled" rule-engine/src` and `live-server/src/services/rule-check/`. Expected: the engine runs its built-in rule set and uses `groupCode` only as a partition/result key (no DB lookup of which rules are enabled, since `rule-loader-service` is dead). **If the engine selects a rule subset from `rule_group_instance.enabled`, STOP and escalate** — Task 1 must then preserve subset semantics via `rule_set` membership.

- [ ] **Step 2: Record the finding** in the completion message (label vs subset). If subset semantics turn out to be live, Task 1 must preserve them via `rule_set` membership before proceeding.

---

## Task 1: Re-point the live rule-check (Model C) off `rule_group` → `workset` (Model A)

**Files:**
- Modify: `live-server/src/services/rule-check/rule-check-trigger.ts` (`getDefaultRuleGroupCode`, ~line 8-14)
- Modify: `gantt/src/components/common/rule-group-selector.tsx` (data source, ~line 8/25/38)
- Test: `e2e/tests/gantt/rule-check/*.spec.ts` (the live bell), `live-server` unit for the default lookup.

- [ ] **Step 1: Re-point the default-group lookup to the default workset.**
  In `rule-check-trigger.ts`, replace the `SELECT group_code FROM rule_group WHERE is_default = true ...` with the default RULE workset. The default ruleset is workset `103` (the scenario default; see `ruleset_id` default). Query:
  ```ts
  // Default live rule-check ruleset = the default RULE workset (id 103), matching the
  // scenario ruleset_id default. Model B rule_group is being dropped.
  const res = await pool.query<{ id: number; name: string }>(
    `select id, name from f8.workset where category = 'RULE' order by case when id = 103 then 0 else 1 end, id limit 1`,
  )
  // return a stable string key for the result-table rule_group_code column:
  return res.rows[0] ? String(res.rows[0].id) : null
  ```
  Keep the function name `getDefaultRuleGroupCode` (its callers store the return into the result tables' `rule_group_code` column — now a workset-id string).

- [ ] **Step 2: Re-point the toolbar selector to the legality rulesets.**
  In `gantt/src/components/common/rule-group-selector.tsx`: replace `import { ruleConfigApi } from '@/services/rule-config-api'` + `ruleConfigApi.listGroups()` with `import { legalityApi } from '@/services/legality-api'` + `legalityApi.listRulesets()` (returns `{id, name, category, isDefault}[]`, RULE worksets — 103/433). Map each option's value to `String(g.id)` and label to `#{id} {name}`; pick the `isDefault` (or id 103) entry as the initial `setRuleGroup(String(default.id))`. Keep `useRuleCheckStore.setRuleGroup` and the WS `set_rule_group` message unchanged (the value is now a workset-id string).

- [ ] **Step 3: Run the live rule-check e2e (the bell) + the default-group unit.**
  Run: `cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/rule-check --reporter=list --no-deps`
  Expected: PASS — the toolbar lists the RULE worksets, picking one runs checks and the bell shows violations. Fix any spec that asserted the old `rule_group` labels (§Stale-Test). Paste the receipt.

- [ ] **Step 4: Commit** `feat(rule-check): live rule-check sources its ruleset from workset (RULE), not Model B rule_group`.

---

## Task 2: Re-point the `ro_input.gz` Model-B sections off `rule_parameter` → `rule.param_json`

**Files:**
- Modify: `engine-server/F8/ro_input_builder/sections/rules.py` (re-point `RULE_PARAM_ALL`/`RULE_PARAM_SCEN` to derive their rows from `rule.param_json` instead of the `rule_parameter` table; **keep** `RULE_SET` (Model A `rule_set`) and the `Rule` section (Model A `rule`))
- Modify: `live-server/src/services/scenario/scenario-export-service.ts` (drop the dead Model B section queries — `rule_group` / `rule_group_instance` / `rule_instance` / `rule_template` — and re-point the `rule_parameter` section to `rule.param_json`; keep `rule_set`/`rule`)
- Test: `engine-server/tests/`, `e2e/tests/gantt/scenario-538-rust-solver-run.spec.ts`

> Decision (user, 2026-06-23): re-point — do NOT delete the `RuleParameter` section. Source its rows from each in-scope `rule`'s `param_json` so the `ro_input` contract is byte-compatible, then the `rule_parameter` table is safe to drop in Task 5.

- [ ] **Step 1: rules.py — re-point the param sections.** `param_json` holds the same param rows the table did. Mirror `pg_rule_params._param_rows(param_json)` (which yields one UPPERCASE-keyed dict per `param_json["tables"]` row): build `_rule_param_all`/`_rule_param_scen` from `SELECT rule_id, param_json FROM rule WHERE rule_id::text IN (SELECT rule_id::text FROM rule_set ...)`, flattening each `param_json` into the existing `_RULE_PARAM_COLS` row shape (`rule_id, phase_id, param_names, param_values, param_extra`). Keep the same emit order (`rule_set.id`, then param index). Delete the `rule_parameter` `_pg_rows` reads (~122-150). Keep `RULE_SET`/`Rule` (Model A) untouched. If `param_json`'s structure can't reproduce a column 1:1, capture it in `param_extra` and note the mapping in a comment.

- [ ] **Step 2: Golden-diff the ro_input.** Regenerate an `ro_input` for a known scenario (e.g. 538) both ways isn't possible post-drop; instead, BEFORE dropping `rule_parameter`, generate the section from `rule_parameter` and from `param_json` and diff them. Run a one-off compare (script or psql) asserting the `RuleParameter` rows match for workset 103. Paste the diff result (expected: identical, or differences explained).

- [ ] **Step 3: scenario-export-service.ts** — remove the dead Model B section entries (`rule_group`, `rule_group_instance`, `rule_instance`, `rule_template`) and re-point the `rule_parameter` section to `rule.param_json` (same shape as Step 1). Drop the `resolveRulesetId` bridge query at ~117 if it only fed the deleted `rule_group` section; keep it if `rule_set`/`rule` sections still resolve through it. `tsc` clean.

- [ ] **Step 4: Verify the RUST scenario run is unaffected.**
  Run: `cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/scenario-538-rust-solver-run.spec.ts --reporter=list --no-deps`
  Expected: 2 passed (RUNNING → DONE, crew rows present). Run any engine-server pytest that builds ro_input. Paste receipts.

- [ ] **Step 5: Commit** `refactor(ro-input): source RuleParameter section from rule.param_json (drop rule_parameter table dep)`.

---

## Task 3: Delete the Rule-tab UI (gantt) — Model B CRUD surface

**Files:**
- Delete: `gantt/src/components/rule/` Model-B-CRUD files — `rule-group-list.tsx`, `rule-group-card.tsx`, `rule-group-header.tsx`, `rule-group-row.tsx`, `rule-group-rules.tsx`, `rule-catalog-view.tsx`, `rule-manager-view.tsx`, `new-group-dialog.tsx`, `edit-group-dialog.tsx`, `add-rules-dialog.tsx`, `instance-edit-dialog.tsx`, `override-editor.tsx`, `template-var-picker.tsx`
- Delete: `gantt/src/stores/rule-config-store.ts`, `gantt/src/services/rule-config-api.ts`, `gantt/src/services/rule-catalog-api.ts`
- Modify: `gantt/src/components/shell/shell-sidebar.tsx` (remove `RULE_MENU`, the `rule:` section label, `ActiveRuleItem` rendering), `gantt/src/stores/shell-store.ts` (remove `activeRuleItem`/`ActiveRuleItem`/`'rule'` section), and the shell router that mounts `rule-manager`/`rule-instance`.
- **KEEP (these are live rule-check / Model C, NOT Model B CRUD):** `gantt/src/components/common/rule-group-selector.tsx` (re-pointed in Task 1), `gantt/src/stores/rule-check-store.ts`, `gantt/src/components/scenario/filter/rule-group-select.tsx` (verify its source — if it also used `ruleConfigApi.listGroups`, re-point to legality rulesets like Task 1), and everything under `gantt/src/components/legality/` (the Legality tab — the replacement UI).

- [ ] **Step 1: Find every import of the to-be-deleted files** so nothing dangles: `grep -rn "components/rule/\|rule-config-store\|rule-config-api\|rule-catalog-api\|rule-manager\|rule-catalog" gantt/src`. List the importers; they are either (a) the deleted files themselves, (b) the shell nav, or (c) a stray. Repoint/remove each.

- [ ] **Step 2: Remove the Rule section from the shell nav** — delete `RULE_MENU` and the `rule` top-level section in `shell-sidebar.tsx`; remove `ActiveRuleItem` + `activeRuleItem` + the `'rule'` literal from `shell-store.ts`; remove the `case 'rule-manager'`/`'rule-instance'` mounts from the shell content router. (Legality already hosts Rule Instances + Rule Sets from Phase 2.)

- [ ] **Step 3: Delete the files** (`git rm`) and run `cd gantt && npx tsc --noEmit` → clean (no dangling imports). `cd .. && npm run check:ui` → 0 hard violations.

- [ ] **Step 4: E2E** — the Rule tab is gone, Legality still serves Rule Instances/Rule Sets.
  Run: `cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/ -g "legality|rule-instances|rule-sets" --reporter=list --no-deps` (and update/delete any spec that navigated to the old Rule tab — §Stale-Test: if the feature moved to Legality, retarget; if truly removed, delete the spec and say so). Paste the receipt.

- [ ] **Step 5: Commit** `feat(gantt): delete the Rule tab (Model B CRUD UI); Legality is the single rule surface`.

---

## Task 4: Delete the live-server Model B backend (routes, services, models)

**Files:**
- Delete: `live-server/src/routes/rule/rule-config.ts`, `live-server/src/services/rule/rule-config-service.ts`, `live-server/src/services/rule/rule-loader-service.ts` (dead), `live-server/src/models/rule/rule-group.ts`, `live-server/src/models/rule/rule-instance.ts`, `live-server/src/models/rule/rule-template.ts`
- Modify: `live-server/src/routes/rule/index.ts` (remove the `ruleConfigRoutes` register at line 2/7)
- **KEEP:** `live-server/src/models/rule/rule.ts`, `workset.ts`, `calc-result.ts`; `routes/rule/legality.ts`, `routes/rule/workset.ts`; `services/rule/legality-recheck.ts`.

- [ ] **Step 1: Grep for importers** of the to-be-deleted modules: `grep -rn "rule-config\|rule-config-service\|rule-loader-service\|models/rule/rule-group\|models/rule/rule-instance\|models/rule/rule-template" live-server/src`. Repoint/remove each (expected: only `routes/rule/index.ts` + the deleted files + maybe `scenario-export-service.ts` Model B sections already removed in Task 2). Note: `getDefaultRuleGroupCode` (Task 1) no longer reads `rule_group`, so `rule-check-trigger.ts` is clean.

- [ ] **Step 2: Remove the route registration** in `routes/rule/index.ts`. Delete the 6 files (`git rm`).

- [ ] **Step 3: tsc + vitest** — `cd live-server && npx tsc --noEmit` (clean, modulo the 2 known pre-existing `base-cache-control.test.ts` errors) and `npx vitest run src/services/rule src/routes/rule --reporter=dot` (remove/retarget any vitest that targeted `rule-config-service` — §Stale-Test). Paste receipts.

- [ ] **Step 4: Commit** `feat(live-server): remove Model B backend (rule-config routes/service, dead rule-loader, group/instance/template models)`.

---

## Task 5: Drop the 5 Model B tables (SQL migration)

**Files:**
- Create: `sql/migration/2026-06-23-drop-model-b-tables.sql`
- Modify: `sql/schema/**` — remove the 5 tables' DDL from wherever they're defined (grep `create table .*rule_template|rule_instance|rule_group\b|rule_group_instance|rule_parameter`).

- [ ] **Step 1: Write the migration** (FK order: `rule_group_instance` first):
  ```sql
  -- Phase 3: drop Model B (template/instance/group model) now that Model A
  -- (workset/rule_set/rule + rule.param_json) is the single rule model and the
  -- Rule tab + rule-config backend are removed. Idempotent.
  set search_path = f8;
  begin;
  drop table if exists rule_group_instance;   -- FK child of rule_group + rule_instance
  drop table if exists rule_group;
  drop table if exists rule_instance;
  drop table if exists rule_template;
  drop table if exists rule_parameter;
  commit;
  ```

- [ ] **Step 2: Apply + verify**
  Run: `PGPASSWORD=Pier2026AIf8 psql -h localhost -U f8 -d rois -v ON_ERROR_STOP=1 -f sql/migration/2026-06-23-drop-model-b-tables.sql`
  Verify gone: `PGPASSWORD=Pier2026AIf8 psql -h localhost -U f8 -d rois -c "select table_name from information_schema.tables where table_schema='f8' and table_name in ('rule_template','rule_instance','rule_group','rule_group_instance','rule_parameter');"` → 0 rows.

- [ ] **Step 3: Remove the DDL** from `sql/schema/**` (so a fresh airline init doesn't recreate them). Grep first; edit the schema file(s). Do NOT touch the result-table `rule_group_code` *columns* (separate).

- [ ] **Step 4: Commit** `feat(sql): drop Model B tables (rule_template/instance/group/group_instance/parameter)`.

---

## Task 6: Restart, full regression, version bump

**Files:** `gantt/src/version.ts`

- [ ] **Step 1: Restart the affected services** so running instances pick up the dropped tables/code: `~/rois/rois.sh restart live-server` (and `engine-server` if rules.py changed). Wait for `:3000/api/health` = 200.

- [ ] **Step 2: Full regression** — paste each receipt:
  - Live rule-check bell: `tests/gantt/rule-check`
  - Scenario RUST run: `tests/gantt/scenario-538-rust-solver-run.spec.ts`
  - Legality (Rule Instances + Rule Sets): `tests/gantt/ -g "legality|rule-instances|rule-sets"`
  - `cd live-server && npx vitest run --reporter=dot` (full)
  - `npm run check:ui` → 0 hard violations
  Fix any stale test (§Stale-Test). All green before done.

- [ ] **Step 3: Bump versions** in `gantt/src/version.ts` — `BACKEND_VERSION` +1 (live-server + engine-server) and `FRONTEND_VERSION` +1 (gantt), with one-line notes ("Phase 3+4: drop Model B + delete Rule tab; live rule-check sources from workset"). Commit `chore: version bump — Model B retired, Rule tab removed`.

- [ ] **Step 4: Finish the branch** via superpowers:finishing-a-development-branch (merge to main, archive to `done/` per the repo rule).

---

## Self-Review (done)

- **Coverage:** Task 0 confirms the live-check `groupCode` semantics; Task 1 re-points the kept Model C (group source + default → `workset`); Task 2 re-points the `ro_input` `RuleParameter` section to `rule.param_json` (golden-diffed) and drops dead Model B sections; Task 3 deletes the Rule-tab UI; Task 4 deletes the live-server Model B backend; Task 5 drops the five tables (FK-correct order); Task 6 regresses + versions. Keeps exactly `workset`/`rule_set`/`rule`. Matches the consumer inventory from the investigation.
- **Kept (verified separate from Model B):** Model A (`workset`/`rule_set`/`rule`/`rule.param_json`); the Legality tab; the live rule-check engine + its result tables' `rule_group_code` *columns* (dimensional keys, now holding a workset-id string); `rule_set`-sourced `RuleSet` ro_input section.
- **Risk / rollback:** the riskiest steps are Task 1 (live bell) and Task 5 (irreversible drop). Task 5 runs last, after every consumer is removed and tests pass, so a failure before it leaves Model B intact. Each task commits separately for granular revert.
- **Ordering rationale:** re-point (1) → strip ro_input (2) → delete UI (3) → delete backend (4) → drop tables (5). Tables drop only once nothing reads them, so a running live-server never 500s mid-migration.
- **Verify-at-impl flags:** Task 0 (groupCode is a label → safe, else preserve subset via `rule_set` — STOP-and-escalate if it's a subset selector) and Task 2 Step 2 (golden-diff the re-pointed `RuleParameter` rows against the old table before the drop, so the contract is provably unchanged).
