# Scenario List Type Sync + Workset Ownership (Name / Division / Cascade Delete)

**Date**: 2026-07-16  
**Status**: Implemented (pending remote migration + live-server rebuild)  
**Module**: gantt scenario list/detail + live-server scenario/workset lifecycle  
**Supersedes (partial)**: `2026-07-15-po-basic-info-division-bases-design.md` — Division no longer lives in `filter_params`; it lives on `workset.division` for PO/RO/TO.

---

## 1. Goals

1. **Type filter ↔ sidebar sync**: Scenario search bar Type dropdown drops TO; selecting PO/RO/All Types drives the left Scenario sidebar (and vice versa).
2. **Division on workset**: Scenario Division (PO Basic Info + RO/TO Basic Info) reads/writes **`workset.division` only** — not `filter_params` JSON.
3. **Name on workset (hard switch)**: Display/edit/search use **`workset.name`**; stop writing `scenario.name`; migrate existing names; drop `scenario.name` column in the same change set (or immediate follow-up migration in the same PR).
4. **Workset field hygiene** on create: `filiale` = dictionary DEFAULT airline, `category` = `OPTIMIZER`, `division` / `name` / `type` set correctly.
5. **Cascade delete**: Deleting a scenario removes its workset (1:1) **and** all scenario-scoped child data (RO results, PO pairings, KPIs, parameters, legality, …).
6. **Docs**: Update every product/module/spec note that still documents `scenario.name`, `filter_params.division`, or incomplete delete cleanup.

---

## 2. Confirmed decisions

| Topic | Decision |
|-------|----------|
| Type dropdown options | `All Types` / `PO` / `RO` only — **remove TO** |
| Type ↔ sidebar | Two-way: dropdown → `setScenarioItem`; sidebar → `setFilterType` (existing one-way kept) |
| Division storage | **`workset.division` only** (PO + RO + TO) |
| Name storage | **`workset.name` only** — hard switch; migrate then drop `scenario.name` |
| Empty Division | Fallback `P` (same as prior product rule) |
| Bases | Stay in `filter_params` for PO (`bases[]`); RO crew/pairing bases unchanged in JSON |
| Create workset.filiale | From dictionary `DEFAULT` / `AIRLINE` (existing `getDefaultFiliale` util) |
| Create workset.category | `OPTIMIZER` for scenario-owned worksets |
| Create workset.type | Keep existing `fileType` prefix (`PO`/`RO`/`TO` → first 2 chars) unless product later redefines ST/CU |
| Delete | Cascade: child scenario-schema data + `scenario_parameter` + KPIs + master `scenario` + **linked workset** |
| Orphan worksets | One-shot SQL cleanup for optimizer worksets with no scenario; never touch `category = 'RULE'` |
| TO product | Still may exist as `fileType` in DB/API for legacy rows; UI list filter no longer offers creating/filtering TO via Type dropdown. Sidebar already has no TO item. |

---

## 3. UI

### 3.1 Type filter + sidebar linkage

**Search bar** (`scenario-search-bar.tsx`):

```
Type: [ All Types | PO | RO ]   // no TO
```

On Type change:

| Selected | `filterType` | `activeScenarioItem` |
|----------|--------------|----------------------|
| All Types | `''` | `'all'` |
| PO | `'PO'` | `'po'` |
| RO | `'RO'` | `'ro'` |

**Sidebar** (already sets `filterType` from `activeScenarioItem`):

| Sidebar | `filterType` |
|---------|--------------|
| All Scenarios | `''` |
| PO | `'PO'` |
| RO | `'RO'` |
| Crew Bids | unchanged (not a fileType filter) |

Avoid feedback loops: when sidebar changes filterType, search bar Select is controlled by store `filterType` only — no second write. When dropdown changes, call both `setFilterType` and `setScenarioItem` once.

### 3.2 Division in Basic Info (PO + RO + TO)

- **PO**: keep Division + Bases under Date (Bases still `filter_params.bases`).
- **RO/TO**: **move** Division from Scope Filters › Crew Filters into Basic Info under Date (same control as PO: Division table options, required, default `P`).
- **Remove** Division control from `ro-crew-filter.tsx` (Bases / Fleets stay).
- Draft field: top-level `division` on scenario detail DTO (joined from workset), **not** inside `filterParams`.
- On Save: API updates `workset.division` (and name if changed).

### 3.3 Name field

- Detail header name input, list rename, create default name → all map to **workset.name** via API.
- List / search / tab labels use workset name.

---

## 4. API / data model

### 4.1 Scenario DTO (list + detail)

Join `workset` on `scenario.workset_id = workset.id`:

```ts
{
  id, worksetId, fileType, status, ...
  name: workset.name,           // was scenario.name
  division: workset.division,   // new top-level field for UI
  filterParams: { ... },        // no division fields for PO; no crew.division for RO after migrate
}
```

### 4.2 Create

1. Resolve `filiale` = dictionary DEFAULT airline (`live-server` `getDefaultFiliale` / equivalent).
2. Insert workset:

```ts
{
  name: input.name,
  division: normalizeDivision(input.division ?? 'P'),
  category: 'OPTIMIZER',
  type: fileType.slice(0, 2),  // PO / RO / TO
  filiale,
  ...audit
}
```

3. Insert scenario **without** relying on `name` column (after drop: omit; before drop in same PR: stop writing or set null if column still nullable during migration).
4. Do **not** put division into `filter_params`.

### 4.3 Update

If patch includes `name` and/or `division`:

```sql
UPDATE workset SET name = $1, division = $2, updated_by, updated_at
WHERE id = scenario.workset_id
```

Scenario row patch: dates, filterParams (sans division), comments, rulesetId, etc. only.

### 4.4 Delete (full cascade)

Order (transaction recommended):

**A. Scenario-schema child data** (`scenarioSchema()`):

| Area | Tables |
|------|--------|
| RO result | `roster_flight`, `crew_manday_fd_*`, `crew_manday_cc_am_*` (existing `clearScenarioResult`) |
| PO pairing | `pairing_composition`, `pairing_segment`, `pairing`, `flight` (same order as S3 clear) |
| Legality | `rule_violation`, `legality_status` (already) |
| Other scenario-id tables if present | e.g. import batches / any table with `scenario_id` used by product — scan schema and include all non-RULE tables keyed by scenario_id |

**B. Public / live schema meta** (current master DB):

- `scenario_parameter` (already)
- `scenario_kpi` (add if not already deleted)
- `scenario_group` rows for this scenario (if any)
- master `scenario` row

**C. Workset**:

```sql
DELETE FROM workset WHERE id = :workset_id
  AND (category = 'OPTIMIZER' OR category IS NULL OR category IN ('PO','RO','TO'))
  -- never delete category = 'RULE'
```

Safety: only delete workset if no other scenario still references it (1:1 unique today). If shared, skip workset delete and log.

Centralize as `clearScenarioOwnedData(pool, scenarioId)` + `remove` calling it then deleting master + workset.

### 4.5 Export / run scope

- Division for crew/pairing scope comes from **`workset.division`** (join scenario → workset), not `filter_params.crew.division` / flat `filter_params.division`.
- Bases still from filter_params (PO flat / RO nested).
- Normalize: empty workset.division → treat as `P` at read time for scope SQL.

### 4.6 Search

Name search: `ilike(workset.name, …)` (join workset in list query).

---

## 5. Migrations (remote F8 — run with care)

File under `sql/migration/` (idempotent where possible):

### 5.1 Backfill workset from scenario

```sql
-- Name: scenario.name → workset.name when scenario has a non-empty name
UPDATE workset w
SET name = s.name,
    updated_at = now(),
    updated_by = 'migration'
FROM scenario s
WHERE s.workset_id = w.id
  AND s.name IS NOT NULL
  AND btrim(s.name) <> ''
  AND (w.name IS DISTINCT FROM s.name);

-- Division from filter_params (PO flat or RO crew.division)
UPDATE workset w
SET division = COALESCE(
      NULLIF(btrim(s.filter_params #>> '{division}'), ''),
      NULLIF(btrim(s.filter_params #>> '{crew,division}'), ''),
      w.division
    ),
    updated_at = now(),
    updated_by = 'migration'
FROM scenario s
WHERE s.workset_id = w.id;

-- Normalize ALL / empty / * → P
UPDATE workset
SET division = 'P'
WHERE division IS NULL OR btrim(division) = '' OR division IN ('ALL', '*', 'A');
-- Note: product rule for scenario worksets is P/C; legacy RO workset 'A' becomes P per hard switch.
```

Document risk: historical RO with intentional `A` becomes Pilot-scoped after this migration — accepted per product.

### 5.2 Strip division from filter_params JSON

```sql
UPDATE scenario
SET filter_params = (filter_params - 'division' - 'base')
WHERE filter_params ? 'division' OR filter_params ? 'base';

UPDATE scenario
SET filter_params = jsonb_set(
  filter_params,
  '{crew}',
  (filter_params -> 'crew') - 'division',
  true
)
WHERE filter_params #> '{crew,division}' IS NOT NULL;
```

### 5.3 Workset create-field backfill for existing OPTIMIZER rows

```sql
UPDATE workset w
SET filiale = COALESCE(w.filiale, (SELECT code_value FROM dictionary WHERE parent_code = 'DEFAULT' AND code = 'AIRLINE' LIMIT 1)),
    category = COALESCE(NULLIF(w.category, ''), 'OPTIMIZER')
FROM scenario s
WHERE s.workset_id = w.id;
```

### 5.4 Orphan workset cleanup

```sql
DELETE FROM workset w
WHERE NOT EXISTS (SELECT 1 FROM scenario s WHERE s.workset_id = w.id)
  AND NOT EXISTS (SELECT 1 FROM rule_set rs WHERE rs.workset_id = w.id)  -- if rule_set links
  AND (w.category IS NULL OR w.category IN ('OPTIMIZER', 'PO', 'RO', 'TO', ''))
  AND (w.category IS DISTINCT FROM 'RULE');
```

Tune against real F8 FK usage before run.

### 5.5 Drop `scenario.name`

```sql
ALTER TABLE scenario DROP COLUMN IF EXISTS name;
```

Drizzle model + all queries updated in the **same** PR so app never reads the column after migrate.

---

## 6. Frontend type / store changes

- `ScenarioItem` / `ScenarioDetail`: `name` from workset; add `division: string`.
- `PoFilterParams`: **remove** `division` field (keep `bases` + flight filters).
- `RoFilterParams.crew`: **remove** `division` (keep bases/fleets/status).
- Normalize helpers: drop PO/RO division JSON paths; division normalize applies to top-level / workset only.
- Create/update payloads: `{ name, division, filterParams, ... }` — server maps name/division to workset.
- `scenario-basic-info`: PO + RO/TO show Division bound to `detail.division` → `patchDraft({ division })`.
- Prior PO seed effect that wrote `filterParams.division` → write `division` top-level instead.

---

## 7. Documentation to update (same delivery)

| Doc | Change |
|------|--------|
| `docs/superpowers/specs/2026-07-15-po-basic-info-division-bases-design.md` | Add supersession note: division → workset |
| `docs/modules/gantt/scenario.md` | Basic Info fields; name source; Type filter; delete cascade |
| `docs/architecture/data-model.md` / codebase-index if they list scenario.name | Point name/division to workset |
| Help topics under `gantt/src/components/help/topics/scenario/*` | Name / Division wording |
| Any e2e comments asserting filter_params.division | Update |

Do **not** invent new long-form docs beyond this spec + the module doc touch-ups required for accuracy.

---

## 8. Testing

### Unit / service

- Create scenario → workset has `category=OPTIMIZER`, non-null filiale, name, division.
- Update name/division → workset row changes; scenario filter_params has no division.
- List/search by name uses workset.name.
- Export `pairingIdSet` / `crewIdSet` use workset.division.
- Remove scenario → deletes workset + pairing tables + roster/manday + kpi + parameters; RULE worksets untouched.
- Type dropdown has no TO option (component test).

### Playwright

| Id | Flow |
|----|------|
| Scen-Type-1 | Select Type PO → sidebar PO active; Type RO → RO; All Types → All Scenarios |
| Scen-Type-2 | Click sidebar PO → Type select shows PO |
| Scen-Div-1 | RO Basic Info has Division under Date; Crew Filters has no Division |
| Scen-Div-2 | Change Division → Save → reload shows same; DB workset.division matches |
| Scen-Name-1 | Rename scenario → list shows new name (workset) |
| Scen-Del-1 | Delete PO with pairings / RO with roster → no orphan workset (API or UI + API assert) |

### Migration dry-run

- Count rows before/after name/division backfill.
- Confirm no scenario still selected by dropped column.

---

## 9. Implementation order

1. Migration scripts (backfill → strip JSON → orphan cleanup → drop name) — run on remote with team approval.
2. live-server: join workset for list/get; create/update/delete; export scope.
3. gantt types + Basic Info + Crew filter + search bar sidebar sync.
4. Tests + docs.
5. Rebuild/restart live-server dist if production path uses compiled output.

---

## 10. Non-goals

- Multi-airline workset redesign (only DEFAULT airline for now).
- Removing TO from `fileType` enum / DB forever (legacy rows may remain).
- Moving Bases off filter_params.
- Deleting dictionary `DIVISION` seed rows.
- Changing legality RULE workset lifecycle.

---

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Dropping `scenario.name` breaks external readers | Grep repo + connectors; hard switch is intentional |
| RO workset `A` → `P` narrows historical scope | Product-accepted; document in migration note |
| Cascade misses a scenario_id table | Schema scan in implementation; expand `clearScenarioOwnedData` checklist |
| RULE workset deleted by mistake | Guard on category + rule_set existence |
| Type dropdown ↔ sidebar loop | Single store write path; controlled Select |

---

## 12. Acceptance

1. Type dropdown: no TO; PO/RO/All syncs sidebar both ways.
2. PO + RO Basic Info Division under Date; values persist on `workset.division` only.
3. Scenario display name is always `workset.name`; `scenario.name` column gone after migrate.
4. New scenarios: workset filiale from DEFAULT airline, category `OPTIMIZER`.
5. Delete cleans RO/PO child tables + workset; orphans cleaned by migration.
6. Docs listed in §7 updated; tests in §8 pass with receipts.
