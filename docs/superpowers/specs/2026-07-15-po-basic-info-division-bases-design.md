# PO Basic Info Division / Bases + Division Source Unification

**Date**: 2026-07-15  
**Status**: Approved — implemented  


> **Superseded (division storage)**: As of 2026-07-16, Division is stored on `workset.division` only — not in `filter_params`. See `2026-07-16-scenario-list-workset-ownership-design.md`.
**Module**: gantt scenario UI + live-server scenario scope + shared Division options  
**Approach**: A — extend `PoFilterParams` with top-level `division` / `bases`

---

## 1. Goal

1. Add **Division** (required) and **Bases** (optional multi-select) to **PO scenario Basic Info**.
2. Persist them in `scenario.filter_params` and use them when scoping flights / pairings for PO run and related export paths.
3. Align **RO/TO Crew Filters › Division** with PO: required, default `P`, **no `ALL`**.
4. Stop using dictionary `parent_code = 'DIVISION'` as the option source for product Division pickers; load options from the **`division` table** via `GET /api/division`.

---

## 2. Confirmed decisions

| Topic | Decision |
|-------|----------|
| Purpose | Scenario scope: which Division / Bases this scenario covers |
| Storage | `filter_params` JSONB (no new DB columns) |
| PO shape | Flat: `filterParams.division`, `filterParams.bases` |
| Division required | Yes; empty / invalid → fallback to `P` (if present in Division table, else first table row) |
| Bases optional | Yes; `[]` = all bases |
| Division options | From **Division table** (`division.division` + `description`) |
| RO Division | Same rules as PO: required, default `P`, no `ALL` |
| S3 Pairing import | Division options also from Division table (same source) |
| Dictionary `DIVISION` | Remove as option source for these pickers; unify on Division table |

---

## 3. Data model

### 3.1 PO filter params

```ts
interface PoFilterParams {
  /** Required scope. Code from division table (e.g. 'P', 'C'). */
  division: string
  /** Optional. Empty = all bases. */
  bases: string[]
  flightNos: string[]
  depAirports: string[]
  arrAirports: string[]
  fleets: string[]
  flightStatus: FlightStatusFilter
}
```

Default when creating / merging PO filters:

```ts
{
  division: 'P',
  bases: [],
  flightNos: [],
  depAirports: [],
  arrAirports: [],
  fleets: [],
  flightStatus: 'ALL',
}
```

### 3.2 RO / TO crew division

```ts
// Before
type CrewDivisionFilter = 'P' | 'C' | 'ALL'

// After — value is a division-table code; product UI no longer offers ALL
type CrewDivisionFilter = string  // runtime-validated against Division table; default 'P'
```

Keep nested RO shape unchanged:

```ts
filterParams.crew.division  // required, default 'P'
filterParams.crew.bases
filterParams.pairing.bases
// ...
```

### 3.3 Read compatibility (normalize on load / merge)

| Legacy / partial input | Normalized |
|------------------------|------------|
| PO missing `division` | `division = 'P'` (or first Division-table code if `P` absent) |
| PO `base: "YYZ"` (S3 import history) | `bases: ["YYZ"]` |
| PO `bases` already array | keep |
| RO/TO `crew.division` missing / `''` / `'ALL'` | `'P'` (or first table code if `P` absent) |
| Save path | write only new shapes; do **not** write singular `base` |

Shared helper (frontend + backend, same rules):

```ts
normalizePoFilterParams(raw): PoFilterParams
normalizeCrewDivision(raw): string  // never returns ALL / empty
```

---

## 4. UI

### 4.1 PO Basic Info (`scenario-basic-info.tsx`)

When `detail.fileType === 'PO'`, under Date:

```
Type:     [PO badge]
Date:     [start] → [end]
Division: [Select — required, from Division table]
Bases:    [MultiSelect — optional, from base list; empty = All bases]
```

- Layout matches existing Basic Info `Field` row style (`h-6` / `text-xs`).
- `data-testid`: `scenario-po-division`, `scenario-po-bases`.
- Disabled when scenario status is `RUNNING` (same as other fields).
- On change: merge into `filterParams` via `patchDraft`, preserving existing flight-filter fields.
- Clearing Division in the control immediately re-selects default `P` (no empty committed state).

RO/TO Basic Info is unchanged (Rule Set / Pairing Sc. / Parameters / Comment stay as today).

### 4.2 RO/TO Crew Filters (`ro-crew-filter.tsx`)

- Division options load from Division table (shared hook), **not** hard-coded Pilots/Cabin/All.
- Remove `SelectItem value="ALL"`.
- Default / normalize to `P`.
- Label: keep **Division**; option text from table `description` (fallback to code).
- Bases remain multi-select via `useBaseOptions()` (already correct).

### 4.3 S3 Pairing import dialog

- `scenario-list-panel.tsx` currently loads:

  ```ts
  dictionaryApi.getByParentCode('DIVISION')
  ```

- Change to Division table API (same as Basic Info / Crew Filters).
- Keep required Division + Base behavior for new-target mode.
- Persist on create still becomes normalized PO shape:

  ```ts
  filterParams: {
    division: '<code>',
    bases: ['<base>'],   // normalize singular import base → bases[]
    // flight filters default empty
  }
  ```

  Update S3 create path if it still writes `{ base, division }`.

### 4.4 Shared Division options

Add one shared client path (prefer extending existing reference layer):

1. `referenceApi.listDivisions()` → `GET /api/division`
2. Optionally cache on `useReferenceStore` next to bases/ranks/fleets
3. Hook `useDivisionOptions()` used by:
   - PO Basic Info
   - RO/TO Crew Filters
   - S3 Pairing import
   - Legality rule-set / rule-row Division pickers that currently use dictionary `DIVISION`

Option mapping:

| API field | UI |
|-----------|-----|
| `division` | value |
| `description` | label (fallback to code if empty) |

Sort: stable by code (`P`, `C`, then others if present in table).

**Note:** seed `division` may include `A` (Airmarshal). Table is authority — if the row exists, it is selectable. Product no longer invents `ALL`. Scenario defaults remain `P`.

---

## 5. Remove dictionary `DIVISION` as option source

### In scope (must switch to Division table)

| Location | Current | After |
|----------|---------|--------|
| `scenario-list-panel.tsx` (S3 options) | `dictionaryApi.getByParentCode('DIVISION')` | `referenceApi.listDivisions()` / shared hook |
| `legality-rule-sets-view.tsx` | dictionary `DIVISION` | Division table |
| `legality-rule-row.tsx` (comment / options prop) | dictionary-fed options | Division table options |
| Scenario PO/RO Division selects | hard-coded P/C/ALL | Division table, no ALL |

### Out of scope (do not churn unless they literally read dictionary DIVISION)

| Location | Why leave |
|----------|-----------|
| `sql/seed/01-dictionary.sql` `DIVISION` rows | Historical seed; may still be referenced by Data dictionary UI. Do not delete in this change unless a follow-up cleans unused dictionary parents. |
| `filter-dialog.tsx` hard-coded P/C | Live Gantt filter, not dictionary; optional follow-up to share `useDivisionOptions`. |
| `rule-set-dialogs.tsx` hard-coded list | Same — prefer switch if touched; not blocking PO Basic Info. |
| PBS period `A` shared-division constants | Domain-specific PBS period semantics, not scenario scope pickers. |
| `DIVISION_RANKS` in res-planner | Rank matrix keyed by division, not an options source. |

**Rule for this feature:** any UI that today loads **dictionary parent `DIVISION`** for a Division dropdown must load **`division` table** instead. Hard-coded scenario pickers that duplicate that list must also use the table.

---

## 6. Backend scope behavior

### 6.1 PO create / update

- Accept `filterParams.division` + `filterParams.bases` on scenario create/update (already free-form JSONB).
- When auto-creating a workset for PO, set `workset.division` from `filterParams.division` after normalize (replace hard-coded `'P'` only when filter provides a value; still default `P`).

### 6.2 PO run / export / pairing-flight scope

Read PO scope from flat fields:

```
filterParams.division  → require / apply pairing.division = :division
filterParams.bases     → if non-empty, pairing.base = ANY(:bases)
```

Flight inclusion for PO follows the existing pairing/flight linkage already used by PO export / gantt load; apply the same division/bases predicates on the pairing (or equivalent flight composition path if that is what PO input uses today).

Implementation discipline:

- Reuse or extend `scenario-export-service` helpers rather than copy-paste SQL.
- PO reader must understand flat `division`/`bases`; RO reader keeps `crew.*` / `pairing.*`.
- Shared normalize step before SQL build so S3 legacy `{ base, division }` still scopes correctly until rewritten on next save.

### 6.3 RO/TO

- Existing `crewIdSet` / `pairingIdSet` already apply `division` when set.
- After UI removes `ALL`, export always receives `P` or `C` (or another table code), so division predicate is consistently present for normal drafts.
- Normalize `'ALL'` → `'P'` on backend read for old rows.

### 6.4 Validation

- Soft: never persist empty division; server normalize to `P` if missing.
- No hard 400 required for empty division (matches “clear → fallback P”).
- Bases: array of strings; empty allowed.

---

## 7. Frontend draft / save flow

1. Load scenario detail → merge defaults + normalize filterParams into draft.
2. User edits Division / Bases → `patchDraft({ filterParams: { ...merged, division, bases } })`.
3. Save → existing `update` PUT with full draft `filterParams`.
4. Run → existing run path uses saved (or last-saved) scenario row; ensure run pre-check uses normalized division (warn if needed — reuse existing scope warnings where applicable).

PO toolbar warnings (if any today only mention flight filters) may optionally note empty bases (= all). Not required for MVP if no existing PO warning pattern.

---

## 8. Testing

### Unit / component

| Test | Expectation |
|------|-------------|
| PO Basic Info render | Division + Bases controls present; RO fields absent |
| PO change Division/Bases | `patchDraft` receives merged `filterParams` with flight fields preserved |
| PO clear Division | committed value becomes `P` |
| Normalize helper | `base`→`bases`; missing division→`P`; `ALL`→`P` |
| RO Crew Filter | no All option; options from Division API mock |
| S3 import options | no `dictionaryApi.getByParentCode('DIVISION')`; uses Division list |
| Legality division options | loaded from Division API |

### Backend

| Test | Expectation |
|------|-------------|
| PO pairing scope SQL | includes `division =` when set; includes `base = ANY(...)` when bases non-empty |
| Legacy PO `{base,division}` | scopes same as `{bases:[base], division}` |
| RO `crew.division = 'ALL'` | treated as `P` (or omitted-only if we choose fallback-before-SQL; **chosen: fallback P then apply predicate**) |
| Workset create for PO | division from filterParams |

### Playwright (required for UI)

| Id (suggested) | Flow |
|----------------|------|
| Scen-PO-Div-1 | Create/open PO → Basic Info shows Division default P and Bases multi-select |
| Scen-PO-Div-2 | Set Division + Bases → Save → reload → values restored |
| Scen-RO-Div-1 | Open RO → Crew Division has no All; default/normalized P |
| Scen-S3-Div-1 | Open S3 import → Division options from Division API (or visible P/C labels without dictionary call) |

Drive real UI only (§Simulate-User). Assert specific values, not mere visibility (§No-Illusion).

---

## 9. Files likely touched

**Gantt**

- `gantt/src/types/scenario.ts` — `PoFilterParams`, `CrewDivisionFilter`
- `gantt/src/services/reference-api.ts` — `listDivisions`
- `gantt/src/stores/reference-store.ts` and/or `filter/use-division-options.ts`
- `gantt/src/components/scenario/scenario-basic-info.tsx`
- `gantt/src/components/scenario/scenario-filter-section.tsx` — PO defaults
- `gantt/src/components/scenario/filter/ro-crew-filter.tsx`
- `gantt/src/components/scenario/scenario-list-panel.tsx`
- `gantt/src/components/scenario/s3-pairing-import-dialog.tsx` (if it owns option rendering only — parent supplies options)
- `gantt/src/components/legality/legality-rule-sets-view.tsx` (+ tests)
- Related unit + e2e tests

**live-server**

- `scenario-service.ts` — PO workset division from filterParams; optional normalize on write
- `s3-pairing-import-service.ts` — write `bases[]` not singular `base`
- `scenario-export-service.ts` (and any PO-specific export/run scope builders) — read flat PO division/bases
- Unit tests for normalize + SQL predicates

**Docs**

- This spec
- Optional follow-up: `docs/modules/gantt/scenario.md` field table update after implementation

---

## 10. Non-goals

- No new scenario table columns.
- No multi-select Division.
- No moving Bases into Scope Filters for PO (Basic Info only for PO scope).
- No deletion of dictionary seed rows in this change (UI stop reading them for Division pickers).
- No PBS period / res-planner rank-matrix redesign.
- No speculative caching beyond existing reference-store patterns.

---

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Old RO rows with `crew.division = 'ALL'` become Pilot-scoped | Explicit product decision; normalize to `P` and document |
| S3 legacy `base` singular ignored by new UI | Normalize on read; rewrite on next save |
| Division table includes `A` while users expect only P/C | Table is authority; default still `P`; no synthetic ALL |
| PO run path does not yet read flight filters either | Wire division/bases into the same path that builds PO pairing/flight scope; if PO export currently ignores filterParams, implement the minimal predicates needed for division/bases without inventing unused flight-filter SQL |
| Legality + scenario share options | One `listDivisions` path avoids drift |

---

## 12. Acceptance

1. PO Basic Info shows Division (required, default P) and Bases (optional multi-select from base list).
2. Values persist in `filter_params` and reload correctly.
3. PO scope/run/export applies division and non-empty bases.
4. RO/TO Division has no All; default/fallback P; options from Division table.
5. S3 import Division options from Division table; create writes normalized PO filter shape.
6. No remaining scenario/legality Division dropdown loads dictionary parent `DIVISION`.
7. Automated tests above pass with recorded receipts.

---

## 13. Open implementation notes (resolved in this spec)

- Clear Division → **fallback P** (not block Save/Run).
- S3 Division source → **Division table in this change**.
- Dictionary DIVISION option usage in scenario/legality → **remove / replace with Division table**.
