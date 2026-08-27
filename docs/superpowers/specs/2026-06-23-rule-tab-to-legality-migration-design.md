# Design — Migrate Rule tab into Legality (Phases 1–2, additive)

> Date: 2026-06-23 · Owner: gantt + live-server · Status: proposed
> Scope of THIS spec: **Phase 1 + Phase 2 only** (additive, no table drops).
> Phase 3 (retire Model B + drop tables) and Phase 4 (delete Rule tab) are
> deferred to a separate spec — their gating findings are recorded in §7.

---

## 1. Goal

Consolidate the regulation UI under one tab. Today there are **two** rule UIs on
**two different data models**:

- **Legality tab** → "Model A": `workset` / `rule_set` / `rule` (`rule.param_json`).
  This is what the **RUST** solver legality engine reads (PG workset 103) and what
  the Legality param editor already edits.
- **Rule tab** → "Model B": `rule_template` / `rule_instance` / `rule_group` /
  `rule_group_instance`, plus the Composition pages.

The end state is a single **Legality** tab with a sidebar menu, everything on
Model A, and the Rule tab gone. This spec delivers the **additive** half:

1. **Phase 1** — move **Composition** and **Composition Load** from Rule → Legality.
2. **Phase 2** — add **Rule Instances** and **Rule Sets** pages under Legality,
   built on Model A (`rule` + `workset` + `rule_set`), with a template/copy model.

No tables are dropped and no existing consumer is re-pointed in this spec. The old
Rule-tab pages keep working until Phase 3/4 removes them.

## 2. Success criteria

- Legality tab shows a sidebar menu: **Rule Sets · Rule Instances · Composition ·
  Composition Load**.
- Composition + Composition Load render identically to their Rule-tab versions.
- Rule Instances: templates (`instance='001'`) are listed read-only; a template can
  be **copied** into a new editable instance (`instance` '002', '003', …) whose
  params live in its own `rule.param_json`; copies can be edited and deleted;
  templates cannot be edited or deleted.
- Rule Sets: a workset can be created, renamed, deleted, and **copied** with the two
  options in §5.3.
- Playwright e2e proves each of the above (specific data asserted, not just "renders").
- The Rule tab is unchanged and still works (removed later in Phase 4).

## 3. Non-goals (this spec)

- Dropping `rule_template` / `rule_instance` / `rule_group` / `rule_group_instance`
  / `rule_parameter` (Phase 3).
- Re-pointing the live rule-check, `rule-loader-service`, `scenario-export-service`,
  or the engine `ro_input_builder` off Model B / `rule_parameter` (Phase 3).
- Deleting the Rule tab and its components (Phase 4).
- Changing the `rule` schema (Phase 3 may add columns; not here).

## 4. Phase 1 — Composition → Legality (nav only)

### 4.1 Current state
- Top nav items in `gantt/src/components/shell/shell-top-nav.tsx:23-36` (`rule`,
  `legality`).
- Rule sub-menu `RULE_MENU` in `gantt/src/components/shell/shell-sidebar.tsx:63-68`
  (`rule-instance`, `rule-manager`, `comp-load`, `comp`).
- `legality-view.tsx` is a **single** view (no sub-menu).
- Composition pages: `components/composition/composition-view.tsx`,
  `composition-load-view.tsx` (+ their stores/`composition-api.ts`). Tables
  `composition` / `composition_rank` / `composition_load` — untouched.

### 4.2 Change
- Introduce a `LEGALITY_MENU` in `shell-sidebar.tsx` and a `useShellStore`
  `activeLegalityItem` (mirror of `activeRuleItem`).
- `legality-view.tsx` becomes a thin router over the menu:
  `rule-sets` (current legality content) · `composition` · `comp-load`.
- Register **Composition** and **Composition Load** under `LEGALITY_MENU`, rendering
  the **existing** `composition-view.tsx` / `composition-load-view.tsx` unchanged.
- Leave the Rule-tab `comp` / `comp-load` entries in place for now (removed in Phase 4)
  so nothing breaks mid-migration; the components are shared, not duplicated
  (per §Gantt-Unify — one component, two nav mounts).

### 4.3 Out of scope for Phase 1
No backend, API, store, or table changes. Pure nav/registration.

## 5. Phase 2.0 — data foundation (DONE, merged 2026-06-23 `65c1df55`)

Implemented ahead of the Phase 2 UI as the template/copy data model + plumbing.
Migration: `sql/migration/2026-06-23-rule-instance-001-templates.sql`.

- **Template marker (locked decision):** a **template** = the `rule` row with
  `instance = '001'`. Templates carry `owner = 'S'`, `locked = '1'`. Non-template
  instances (copies, plus the second 8002 base rule) carry `owner = 'U'`,
  `locked = '0'`. (8002 has two base rules → `8002/001` Max Flight Time = block
  bands + `8002/002` Max Hours of Work = duty-period bands; both system rules but
  only `001` is the locked template.)
- **`rule.rule_id` is now authoritative** — the composite `function‖instance`
  (e.g. `8002001`), populated for every rule and `NOT NULL`. EVERY rule↔rule_set
  association joins on **`rule.rule_id = rule_set.rule_id`** (legality routes +
  `legality-recheck`, engine `ro_input_builder/sections/rules.py`, the RUST connector
  `pg_ruleset_to_ro_input.py`) — no more on-the-fly `function::text||instance` build.
- **Params** live in **`rule.param_json`** (`{tables:[{header,rows}]}`) — the column
  RUST reads. No `rule_parameter` rows are created (that table is Phase-3 drop scope).
- **RUST gotcha (fixed, watch in future recodes):** `pg_rule_params.py` extracts each
  param by HARDCODED composite (`bands("8002001")`, `by_comp.get("8030001")`, …). Any
  instance recode MUST update these or `mode=rust` silently loads 0 params and falls
  back to hardcoded F8 defaults.
- **Login is case-SENSITIVE** (`auth.ts`): `Ryan` (is_admin=1) ≠ `ryan` (is_admin=0).
  The earlier case-insensitive login resolved `Ryan` → the non-admin record. E2E admin
  tests log in as **`admin` / `123456`** (is_admin=1).
- Verified: scenario-538 RUST e2e (14 PG params via the `rule_id` join, OPTIMAL) +
  the retargeted legality e2e. (Side-issue fixed in passing: pbs-server needed
  `npm install` for `@fastify/compress`.)

## 5b. Phase 2a / 2b — Rule Instances + Rule Sets on Model A (TODO)

### 5.1 Data model (Model A)
- **Template** = `rule.instance = '001'` (`owner='S'`, `locked='1'`). **Copy / instance**
  = a new `rule` row: same `function`, next free `instance` (`'003'`+ for 8002 since
  001/002 are taken; `'002'`+ for the others), `param_json` copied from the template,
  `owner='U'`, `locked='0'`, and new `rule.rule_id = function‖instance`.
- **Edit permission (KEY — clarified at runtime):** templates are read-only for
  NON-admins, but **`users.is_admin = 1` users CAN edit template (`001`) params** —
  otherwise no one could ever maintain the base rules. The param editor gates on
  **`isAdmin`** (the existing `legality-rule-row.tsx`: `isAdmin && paramJson`), **NOT**
  on `locked`. So: admins edit any rule incl. templates; non-admins get the read-only
  table. Do NOT add a `locked`-based hard block anywhere.
- **Parameters** live in **`rule.param_json`**.
- **Rule Set** = a `workset` row; membership = `rule_set` rows (`workset_id` →
  `rule_id`). The Legality "Rule Sets" list already shows these.

### 5.2 Rule Instances page
UI under Legality (new `components/legality/rule-instances-view.tsx`, reusing the
look of the existing Rule-tab `rule-catalog-view.tsx`):
- List `rule` rows grouped by `function` (template `001` first, then its copies).
  Columns: Function/Instance, Category, Division, Severity, Params (count), Source
  (Template `owner='S'` vs Copy `owner='U'`), Actions.
- Actions:
  - **Copy** — any rule (template or copy) → a new editable instance.
  - **Edit params** — gated on **`isAdmin`** (NOT on template/locked): an admin can
    edit ANY rule including the `001` template; a non-admin sees the read-only param
    table. (Reuse the existing `legality-rule-row` + `legality-param-*` editor, which
    already render the editor iff `isAdmin && paramJson`.)
  - **Delete** — copies only; reject `instance='001'` (templates are never deletable).
  - Show a "Template" badge on `001` rows so the source is obvious even though admins
    can still edit them.

Backend (extend `live-server` `legality` routes/service — already Model A; do **not**
touch `rule-config-service.ts` which is Model B):
- `GET  /api/legality/rules` — list all `rule` rows (templates + copies) for filiale/division.
- `POST /api/legality/rules/{ruleId}/copy` — duplicate with the next free `instance`,
  copy `param_json`, set `owner='U'`, `locked='0'`, and `rule_id = function‖instance`.
- `DELETE /api/legality/rules/{ruleId}` — delete a copy (guard: reject if `instance='001'`;
  reject if referenced by any `rule_set`). Note: do NOT key the guard on `locked` alone —
  `instance='001'` is the template guard.
- Param editing reuses the **existing** `PATCH /api/legality/rule/{ruleId}/params`,
  which is already **admin-only** (`isAdmin`-gated). It must **NOT** reject templates —
  admins must be able to edit `001` params. "Read-only for non-admins" is enforced
  purely by the UI editor gating on `isAdmin`, not by any backend template-lock.

### 5.3 Rule Sets page
Extend the existing legality "Rule Sets" view (`legality-view.tsx` → `rule-sets`)
with management actions migrated from Rule Manager (`rule-group-header.tsx`,
`new-group-dialog.tsx`, `edit-group-dialog.tsx`), rebuilt on `workset`/`rule_set`:
- **New Set** → `POST /api/legality/rulesets` (create `workset`).
- **Edit Set** → `PATCH /api/legality/ruleset/{worksetId}` (name/division/category/type).
- **Delete Set** → `DELETE /api/legality/ruleset/{worksetId}` (delete `workset` + its
  `rule_set` rows; guard: refuse if it's the workset a scenario currently resolves to
  — name-match per `scenario_workset_id`, the same check the RUST connector uses).
- **Copy Set** → `POST /api/legality/ruleset/{worksetId}/copy` with a mode flag:
  - `mode=copy-rules`: create a new `workset`, **duplicate each member `rule` into a
    new `rule` row**, and point new `rule_set` rows at the copies → fully independent
    set (editing its rules does not affect the original).
  - `mode=share-rules`: create a new `workset`, new `rule_set` rows pointing at the
    **same `rule_id`s** → shared rules (editing affects both sets).
- Membership add/remove (add a rule instance to / remove from a set) →
  `POST` / `DELETE /api/legality/ruleset/{worksetId}/rules/{ruleId}`.

### 5.4 Reuse / placement
- Frontend: new views live in `components/legality/`; reuse existing dialogs'
  structure but bind to the new legality store/api. Param editing reuses the existing
  `legality-param-*` editors. All dialogs use `AppDialog` (pop-up standard).
- Backend: extend `live-server/src/routes/rule/legality.ts` +
  `legality`-side service. Do **not** extend `rule-config-service.ts` (Model B).

## 6. Testing (per §Playwright-Required / §No-Illusion)

- **Phase 1** `e2e/tests/gantt/legality-composition-nav.spec.ts`: Legality sidebar
  shows Composition + Composition Load; clicking each shows specific composition data
  (assert a known composition name / a load row), and the Rule tab still shows its own
  copies.
- **Phase 2** `e2e/tests/gantt/legality-rule-instances.spec.ts` (admin login
  **`admin`/`123456`**, is_admin=1):
  - Template row (`instance='001'`) shows a "Template" badge; **Delete disabled**,
    **Copy enabled**, and **as an admin the param editor IS available** (admins can
    edit `001`). As a non-admin the params render read-only.
  - Copy a template → a new instance row appears with a higher instance code
    (`'003'`+ for 8002, `'002'`+ otherwise); editing its param persists (re-fetch
    shows the new value); the template's params are independent.
  - Delete the copy → row gone; template remains. Deleting a template is rejected.
- **Phase 2** `e2e/tests/gantt/legality-rule-sets.spec.ts`:
  - New Set appears in the list; Edit renames it; Copy (`copy-rules`) yields a set whose
    rule edit does NOT change the original; Copy (`share-rules`) yields a set whose rule
    edit DOES change the original; Delete removes it.
- Backend Vitest for the new legality endpoints (copy modes, template guards).
- `npm run check:ui` clean; `BACKEND_VERSION` + `FRONTEND_VERSION` bumped.

## 7. Out of scope / deferred (recorded for the Phase 3 spec)

Gating findings from the investigation (so the next spec starts informed):
- The live rule-check pipeline (`live-server` workers `batch-crew-worker.ts` /
  `batch-orchestrator-worker.ts`, `rule-check-result-service.ts`, and the result
  tables `rule_check_result_pairing` / `rule_check_result_roster` /
  `rule_check_batch_run`) is keyed throughout on **`rule_group_code`** (Model B).
  Per the user's decision these **stay** (Phase: "keep C") — so Phase 3 must re-key
  the live-check from `rule_group_code` → a Model A `workset` identifier.
- `rule` (Model A) is **thinner** than Model B: it lacks `check_type`, `conditions`,
  `message_template`, `param_schema`, `template_vars`, `constraint_type`,
  `template_code`, `is_deleted`. If the kept live-check needs any of these, Phase 3
  must add columns to `rule` before dropping `rule_instance` / `rule_template`.
- `engine-server/F8/ro_input_builder/sections/rules.py` reads `rule_parameter`; the
  `legacy_ro_converter.py` reads it too. Phase 3 must re-point these to `rule.param_json`
  before dropping `rule_parameter`.
- `rule-loader-service.ts` appears unused (defined, never invoked) — confirm before
  Phase 3 and delete if dead.
- **Open item for Phase 3:** confirm whether the live check is code-driven
  (engine logic keyed by `function`/`instance`, params from `param_json` → drops are
  clean after re-keying) or data-driven (needs Model B's `conditions`/`message_template`
  → `rule` needs new columns first).

Phase 4 = delete the Rule tab (`components/rule/`, `RULE_MENU`, the `rule` nav item)
after Phases 1–3 have moved everything off it.

## 8. Risks

- **Mid-migration duplication**: during Phases 1–2 the same features exist under both
  tabs. Mitigated by sharing components (one impl, two nav mounts) per §Gantt-Unify;
  the Rule tab is removed in Phase 4.
- **Workset delete safety**: deleting a workset a scenario resolves to would break RUST
  legality. Guard via the `scenario_workset_id` name-match before delete.
- **Template integrity**: copying/duplicating `rule` rows must keep `function`+`instance`
  unique per filiale/division; backend computes the next free `instance` transactionally.
