# roster_flight.source Domain Split (IMP / PA / MA / CR) — Design

- **Date:** 2026-07-24
- **Status:** Approved (design), pending implementation plan
- **Scope:** `live.roster_flight`, `scenario.roster_flight`, `roster_publish`, `roster_publish_adjust`, ro_input builder, NOC outbound
- **Modules:** live-server, engine-server, connector-server (no code change), gantt (read/display), sql

## 1. Background & Problem

`roster_flight.source` (added 2026-07-15, migration `2026-07-15-roster-flight-source-pa-ma-cr.sql`)
currently has domain `PA / MA / CR`:

- `PA` = 预分配 / 外部接口或文件导入 (pre-allocation / external interface or file import)
- `MA` = Gantt 人工分配 (manual assignment)
- `CR` = 优化器计算结果 (optimizer output)

**Problem:** `PA` is ambiguous. In **Live** it is used for external interface imports, but it is
also the value used for *lead-in / pre-allocated* data extracted from Live into an optimization
scenario. A single value cannot distinguish "imported from the upstream interface" from
"pre-allocated input pulled into a scenario," and the ambiguity leaks into downstream flows
(e.g. which rows are sent back to NOC).

## 2. Goals

1. Disambiguate provenance by introducing **`IMP`** (external interface import) as a distinct
   `source` value, used **only in Live**.
2. Make **which table a row lives in** part of the value's meaning:
   - Live `roster_flight.source ∈ {IMP, MA, CR}` — **PA is forbidden**.
   - Scenario `roster_flight.source ∈ {PA, MA, CR}` — **IMP is forbidden**.
3. Preserve the original "once external, always external" intent **structurally**: an imported
   (IMP) row never mutates into MA/CR through the optimization round-trip; PA (lead-in) is never
   published back to Live; IMP is never transmitted downstream to NOC.
4. Do **not** add a separate `origin` field — reuse `source` with an expanded domain.

## 3. Non-Goals

- Changing optimizer internals or the optimizer's own source semantics.
- Changing `assignment_group` (FLT/DHD/GRD/RES/SBY) or any task-type taxonomy — `source` is the
  only field affected.
- Adding a `filiale` column to `roster_flight` (none exists; resolved via `crew_id`/`pairing_id`).
- Restricting `roster_flight → roster_publish` — that copy stays complete (PBS consumes it).

## 4. The Model

### 4.1 Domain per table

| Value | Live `roster_flight` | Scenario `roster_flight` |
|-------|----------------------|--------------------------|
| `IMP` | external interface import (connector F8 inbound) | **forbidden** |
| `PA`  | **forbidden** | data extracted from Live / lead-in / ro_input |
| `MA`  | manual assignment in Live Gantt | manual adjustment in Scenario Gantt |
| `CR`  | optimizer written direct-to-Live (`legacy_ro_converter`) | optimizer output |

### 4.2 The three transitions (hard rules)

1. **Live → Scenario / ro_input:** any Live row becomes **`PA`** at this boundary, regardless of
   its Live value (IMP/MA/CR). Applies to (a) the ro_input snapshot fed to the optimizer and
   (b) Live-sourced rows shown in an empty Scenario Gantt / lead-in display.
2. **Scenario → Live (publish, a.k.a. "Import Roster to Live"):** only `CR`/`MA` flow back;
   **`PA` is never published** (already enforced, §6.3).
3. **Live → NOC (outbound callback):** only `MA`/`CR` are transmitted; **`IMP` is filtered out**
   at the `roster_publish_adjust` egress (§6.4).

### 4.3 Gantt `source` display rule

The `source` value shown in the Gantt depends on **where the row is sourced from**, not a blanket
normalization:

| Gantt context | Row source | Displayed `source` |
|---|---|---|
| Live Gantt | `live.roster_flight` (stored) | verbatim `IMP/MA/CR` |
| Scenario Gantt, scenario.roster_flight **has stored rows** (post-optimization / post-manual-edit) | `scenario.roster_flight` (stored) | verbatim `PA/CR/MA` — **do not force PA** |
| Scenario Gantt, **empty scenario** (no stored rows) — rows sourced from Live | Live, read for display | **force `PA`** |
| Scenario Gantt, **lead-in** rows (pairings straddling/outside the window, never stored in scenario) | Live, read for display | **force `PA`** (existing behavior) |

Rationale: before optimization the planner sees current Live state as pre-allocated input (PA);
after optimization the scenario holds the optimizer's PA/CR plus any manual MA, and those stored
values must be shown as-is.

## 5. Current write-site inventory (baseline)

All `INSERT INTO roster_flight` sites (verified by exhaustive grep across live-server /
engine-server / connector-server / pbs-server):

| # | File:line | Target schema | Trigger | Current `source` | New `source` |
|---|---|---|---|---|---|
| 1 | `live-server/src/workers/roster-inbound-worker.ts:191` | live | F8 rosterFlight inbound | `PA` | **`IMP`** |
| 2 | `live-server/src/workers/roster-ground-inbound-worker.ts:201` | live | F8 rosterGround (ground, `pairing_id NULL`) | `PA` | **`IMP`** |
| 3 | `live-server/src/workers/roster-ground-inbound-worker.ts:575` | live | F8 rosterGround (single-leg synthetic) | `PA` | **`IMP`** |
| 4 | `live-server/src/services/roster/roster-service.ts:438` `assignPairing` | live | manual assign | `MA` | `MA` ✓ |
| 5 | `live-server/src/services/roster/roster-service.ts:507` `assignFlight` | live | manual assign | `MA` | `MA` ✓ |
| 6 | `live-server/src/services/roster/roster-service.ts:647` `createGroundTask` | live | manual create | `MA` | `MA` ✓ |
| 7 | `live-server/src/services/roster/roster-service.ts:250` `create()` | live | generic `POST /api/roster` + draft `add` | pass-through (often NULL) | **`MA`** |
| 8 | `engine-server/F8/legacy_ro_converter.py:218` | live | legacy RO direct-to-live | `CR` | `CR` ✓ |
| 9 | `live-server/src/routes/scenario/scenario.ts:155` (executed `:1111`) | live | scenario publish-back | copied through; filter `coalesce(source,'CR') in ('CR','MA')` | unchanged ✓ |
| 10 | `live-server/src/services/scenario/scenario-result-loader.ts:173` | scenario | optimizer result load | flying: `PA/leadin→PA else CR`; ground: `CR→CR else PA` | widen flying guard (§6.5) |

Manual adjustments made inside a **Scenario** Gantt also write `MA` into
`scenario.roster_flight` (the manual-assign service path, schema-aware). That path already stamps
`MA`, which is valid in the scenario domain — **no `source` change needed**, but the plan must
confirm the scenario-targeting write path exists and stamps `MA`.

## 6. Change Inventory (target state)

### 6.1 Database — `roster_flight.source` domain (Phase 2 target end-state)

The DDL/contract below is the **final** state reached after the phased migration in §7 (Phase 1
lands a non-breaking widening + backfill; Phase 2 adds `NOT NULL` + the strict per-table CHECK).

- **Live DDL** `sql/schema/live/02-crew-roster.sql` (~L1331 `source` column; constraint at L1930):
  - column → `source varchar(8) not null`
  - replace `chk_roster_flight_source_pa_ma_cr` with
    `chk_roster_flight_source_live check (source in ('IMP','MA','CR'))`
- **Scenario DDL** `sql/schema/scenario/01-scenario-tables.sql` (~L447; constraint at L537) —
  field structure MUST mirror live per that file's hard header rule:
  - column → `source varchar(8) not null`
  - constraint → `chk_roster_flight_source_scenario check (source in ('PA','MA','CR'))`
- **Drizzle model** `live-server/src/models/roster/roster-flight.ts:21` →
  `source: varchar('source', { length: 8 }).notNull()`; widen the TS union type
  (`'IMP' | 'PA' | 'MA' | 'CR'`).

Migration is **phased** to avoid breaking in-flight writes (see §7).

### 6.2 Database — `roster_publish_adjust` new columns

`roster_publish_adjust` (`sql/schema/live/02-crew-roster.sql:1547`) already uses an
`old_*` / `new_*` snapshot pattern and has **no** `source`-like column today. Add:

```sql
alter table roster_publish_adjust
  add column if not exists old_source varchar(8) null,
  add column if not exists new_source varchar(8) null;
comment on column roster_publish_adjust.old_source is 'Previous snapshot roster_flight.source (IMP/MA/CR); null for ADD';
comment on column roster_publish_adjust.new_source is 'Current roster_flight.source (IMP/MA/CR); null for DELETE';
```

(Nullable by nature: `old_source` is null on ADD, `new_source` is null on DELETE.)

### 6.3 live-server — inbound imports → `IMP`

Three sites stamp `IMP` (with `created_by='F8_IMPORT'` unchanged):
`roster-inbound-worker.ts:191`, `roster-ground-inbound-worker.ts:201,575`.

`rosterService.create()` (`roster-service.ts:250`) → explicit `source: 'MA'`.

### 6.4 live-server — NOC outbound IMP filter (via roster_publish_adjust)

**Do not** add a `source` predicate to `diffSql` / `applyInsertSql` / `adjustSnapshotSql` reads —
`roster_publish` must keep a complete snapshot (PBS consumes it).

Instead:
1. `adjustSnapshotSql` (`roster-publish-service.ts` ~L619-771): populate `old_source` from the
   `roster_publish` snapshot row and `new_source` from the `roster_flight` row, for each
   ADD/UPDATE/DELETE row written. (Requires `roster_publish` to carry `source` — verify it is in
   the apply copy-column list; add if missing.)
2. `buildRosterPublishCallbackPayload` (`roster-publish-outbound-service.ts:129`): at the top of
   the per-row loop, **skip** any row where `old_source = 'IMP'` **or** `new_source = 'IMP'`:

   ```ts
   for (const row of rows) {
     if (row.old_source === 'IMP' || row.new_source === 'IMP') continue
     ...
   }
   ```

The `IMP → MA` transition this rule was meant to handle is now **prevented upstream** (§6.8: IMP
rows are immutable in the Gantt), so it cannot reach this filter. What remains is straightforward:
IMP ADD rows (`new_source='IMP'`) and IMP DELETE rows (`old_source='IMP'`) are dropped (NOC never
received the imported data, so it is neither added nor retracted downstream), while MA/CR changes
transmit normally.

### 6.5 live-server — Scenario Gantt `source` display rule

Read-time normalizers currently force/normalize `source`:
- `scenario.ts:41` `normalizeRosterSource` — defaults unknown → `'CR'`; widen the accepted set to
  include `IMP` and stop masking stored scenario values.
- `scenario-gantt-db-service.ts:154,195` and `scenario-gantt-service.ts` (`loadLeadinFromLive` /
  `mapLeadinRows` ~L631/669, which already force `PA` for display-only lead-in).

Target behavior per §4.3: rows read from **stored** `scenario.roster_flight` → return `source`
verbatim (`PA/CR/MA`); rows synthesized from **Live** for display (empty-scenario fallback and
lead-in) → force `PA`. The plan must locate the empty-scenario in-window Live-sourcing path and
ensure it also forces `PA`.

### 6.6 engine-server — ro_input forces `PA`

`engine-server/F8/ro_input_builder/sections/roster.py`: the builder reads **Live**
(`scenario_id = 0`) and today emits `source` verbatim (`Col("source","source")`). Change it to
emit literal `'PA'` for all Live-sourced rows in all three sections:
- `_roster_flight` (`Col` at L19)
- `_roster_ground` (`Col` at L68)
- `_roster` reconstructed (`Col("source","MIN(source)")` at L121 → `'PA'`)

Since the builder only ever reads Live, hardcoding `'PA'` is correct (every row it emits is
Live-sourced lead-in input).

`scenario-result-loader.ts:108` (flying branch): widen the guard from
`a.source === 'PA' || a.source === 'leadin' ? 'PA' : 'CR'` to `a.source !== 'CR' ? 'PA' : 'CR'`
(matches the ground branch at L135). With ro_input normalized to PA this is mostly belt-and-
suspenders, but it prevents an echoed non-PA/non-CR value from leaking through as CR.

### 6.7 No change required (verified)

- `legacy_ro_converter.py:218` — already `CR`.
- Manual assign services (`assignPairing/assignFlight/createGroundTask`) — already `MA`.
- `scenario.ts:155` publish-back — already excludes `PA` via `coalesce(rf.source,'CR') in ('CR','MA')`
  (three-layer: SQL filter + `publishableFor` `source !== 'PA'` + disabled checkboxes in
  `gantt/src/components/scenario/publish-roster-dialog.tsx`).
- connector-server — never writes `roster_flight`; only enqueues typed records. No change.

### 6.8 live-server + gantt — IMP rows are immutable (delete only, no update)

Imported (`IMP`) `roster_flight` rows are authoritative data from the upstream interface and must
not be mutated in place. In the **Live** Gantt, IMP rows support **delete only**; any UPDATE is
rejected. This structurally prevents the `IMP → MA` transition, so the §6.4 NOC edge case cannot
arise — there is no path by which an imported row is re-stamped `MA`.

**Backend — reject UPDATE on IMP rows** (add a `source` guard before each `.update()`):
- `rosterService.update` (`roster-service.ts:257`; route `POST/PUT /api/roster/:id` `roster.ts:106`;
  draft `case 'update'` `draft.ts:173`) — if the target row `source='IMP'`, reject **409**.
- `rosterService.swap` (`roster-service.ts` ~L290; route `roster.ts:178`; draft `case 'swap'`) —
  if **either** involved row is `IMP`, reject 409.
- `rosterService.move` (route `roster.ts:216`; draft `case 'move'`) — if the moved row is `IMP`,
  reject 409.

> Swap/move are treated as edits (they mutate existing rows). Confirm during review that move/swap
> of imported rows should indeed be blocked; if business wants move/swap permitted on IMP, narrow
> the guard to `update` only.

**Backend — allow deletion** of IMP rows (unchanged):
- `rosterService.remove` (`roster-service.ts:271`; route `roster.ts:129/150`; draft `case 'remove'`)
- `rosterService.removeByPairingAndCrew` (`roster-service.ts:658`; route `roster.ts:339`;
  draft `case 'remove-pairing-from-crew'`)

**Frontend (gantt):** disable in-place edit / drag-move / swap affordances on IMP-sourced rows
(grey-out + tooltip, e.g. "Imported — not editable"); keep the delete affordance enabled. Reuse the
same row-level `source` the backend returns (Live IMP/MA/CR).

**Scope:** IMP exists only in Live, so this constraint is Live-only. Scenario rows (PA/MA/CR) are
unaffected; manual adjustments in the Scenario Gantt continue to create new `MA` rows.

## 7. Migration Plan (phased)

Per `sql/migration/README.md` conventions (idempotent, schema-agnostic, run once per schema via
`SET search_path`).

**Phase 1 — non-breaking (lands with the code changes):**
- `sql/migration/2026-07-2x-roster-flight-source-imp.sql`:
  - Widen both tables' CHECK to `source is null or source in ('IMP','PA','MA','CR')`.
  - Backfill **Live**: `update roster_flight set source='IMP' where source='PA' or source is null;`
    (NULL → IMP: the overwhelming majority of NULLs are legacy imports by `created_by`; the
    migration comment records this assumption and the `created_by` basis).
  - Backfill **Scenario**: leave as-is (PA stays PA; any NULL → `PA` as the lead-in default).
  - Add `roster_publish_adjust.old_source` / `new_source`.

**Phase 2 — lockdown (after Phase 1 is confirmed stable in SIT, all write paths verified):**
- `roster_flight.source` → `not null`.
- Replace CHECK with the strict per-table constraints (Live `in ('IMP','MA','CR')`,
  Scenario `in ('PA','MA','CR')`).

Phase 2 is a hard gate: any write path that still inserts the wrong value will throw at the DB.
The full write-site inventory in §5 is the confidence basis; Phase 2 is deferred precisely so an
unforeseen path surfaces as bad data (Phase 1) rather than an outage (immediate NOT NULL).

## 8. Source-of-Truth Migration Gate Compliance

Per `docs/architecture/source-of-truth-migration-gate.md`, this is a source-of-truth change for
`source` (domain redefined, PA repurposed, IMP added, per-table split). Gate checklist:

1. **Search old & new sources** — `source` column, the `normalizeRosterSource` helper, the
   `PublishRosterSource` type, `Col("source",...)` in the ro_input builder, CHECK constraints,
   the `publish-roster-dialog.tsx` display, and the `2026-07-15` migration comment. (Covered by §5/§6.)
2. **Map every consumer** — roster inbound workers, manual assign services, `create()`,
   `legacy_ro_converter`, scenario publish, scenario result loader, scenario Gantt readers,
   ro_input builder, `roster_publish` apply/diff/adjust, NOC outbound payload builder. (Covered.)
3. **Decide old-source behavior** — old Live `PA` → migrated to `IMP` (§7). Old `NULL` → `IMP`.
   Scenario `PA` retained with its lead-in meaning. No value silently keeps participating under
   an old meaning.
4. **Conflict regression test** — see §9.1 (the round-trip test is the canonical conflict case).
5. **Keep touched-area tests current** — update any fixture/test asserting `PA` for imported rows.
6. **Record unchecked paths** — see §11.

## 9. Testing Strategy

### 9.1 Conflict regression (gate step 4) — round-trip immutability

A test (Vitest integration against the remote DB, or a focused service test) that:
1. Seeds a Live `roster_flight` row with `source='IMP'`.
2. Runs the ro_input build → asserts the emitted `source` is `'PA'`.
3. Simulates optimizer output echo + result load → asserts `scenario.roster_flight` stores `PA`
   for the carried row, `CR` for an optimizer-placed row.
4. Publishes to Live → asserts the original IMP row is **unchanged** and **no PA row** is
   inserted into Live.
5. Builds the NOC payload → asserts **no row with `old_source`/`new_source = 'IMP'`** appears.

This single test fails if any boundary forgets the rule.

### 9.2 Unit

- `buildRosterPublishCallbackPayload`: rows with `old_source='IMP'` / `new_source='IMP'` are
  excluded; `MA`/`CR` rows pass.
- `normalizeRosterSource`: recognizes `IMP`; returns stored scenario values verbatim.
- IMP immutability guard: `rosterService.update` / `swap` / `move` on an `source='IMP'` row
  rejects with 409; `remove` / `removeByPairingAndCrew` on an IMP row succeed.

### 9.3 Playwright (gantt)

- Scenario publish dialog: PA rows remain unselectable (regression for §6.3 unchanged path).
- Scenario Gantt, post-optimization: displays stored `PA`/`CR`/`MA` (not forced to PA).
- Scenario Gantt, empty scenario / lead-in: displays `PA` for Live-sourced rows.
- **Live Gantt IMP immutability:** an imported (IMP) row cannot be edited/moved/swapped (affordance
  disabled); it can be deleted.

### 9.4 Data verification (remote DB)

- After Phase 1 backfill: `select source, count(*) from f8.roster_flight group by 1` → only
  `IMP/MA/CR` (no `PA`, no `NULL`). Same for `scenario.roster_flight` → only `PA/MA/CR`.

## 10. Risks

- **R1 — Phase 2 NOT NULL breaks an unseen write path.** Mitigation: phased migration; the §5
  inventory is exhaustive per grep, but Phase 2 is deferred to surface gaps as bad data first.
- **R2 — optimizer consumes input `source`.** Forcing ro_input `source='PA'` assumes the optimizer
  treats it as inert metadata (echoed, not used to fix/move rows). The user confirms this is the
  intended input contract. The plan includes a sanity check that optimizer output is structurally
  unchanged on a known scenario.
- **R3 — IMP→MA edge case (NOC).** *Resolved:* the transition is prevented upstream by the IMP
  immutability rule (§6.8), so it cannot reach the NOC filter. The filter still drops IMP ADD/DELETE
  rows (which NOC never received).
- **R4 — `roster_publish` may not carry `source`.** If the apply copy-column list omits it,
  `old_source` cannot be populated. Plan verifies and adds `source` to the copy list if missing.
- **R5 — empty-scenario Gantt in-window Live sourcing.** The exact code path that sources in-window
  Live roster into an empty scenario Gantt (distinct from lead-in) must be located and made to
  force `PA`; if it currently passes Live `source` through, IMP/MA/CR would show before optimization.

## 11. Unchecked / To-verify during planning

- Confirm `roster_publish` schema includes `source` (for `old_source` derivation).
- Locate and confirm the Scenario manual-assign write path targets `scenario.roster_flight` and
  stamps `MA`.
- Locate the empty-scenario in-window Live-sourcing path in the scenario Gantt backend.
- Confirm the `PublishRosterSource` TS type and any DTOs/zod schemas referencing `source` are
  widened to `IMP/PA/MA/CR`.

## 12. Out of Scope

- A separate `origin` column (rejected — `source` domain split replaces it).
- `send_flag` / `is_publish` gating (not used for outbound; not the lever).
- Any UI label/i18n work beyond ensuring `IMP` renders where `source` is shown.
