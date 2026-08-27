# RP-Centric Gantt — Design

> Status: Draft for review
> Date: 2026-07-26
> Owner: gantt + live-server
> Affects: `gantt/`, `live-server/`, `engine-server/`, `pbs-server/` (all full migration)

## 1. Goals

Make the Live + Scenario Gantt roster-period (RP) centric instead of calendar-month centric:

1. **GO TO RPDate** — right-click the Live/Scenario time axis → "GO TO RPDate"; options list `roster_period.roster_period` (e.g. `2026RP07`); selecting one zooms the viewport to that RP's `[rp_start, rp_end]`.
2. **Toolbar RP multi-select (Live)** — replace the two free-form start/end date inputs with an RP multi-select; window = `[min(rp_start)−7d, max(rp_end)+7d]`; max 5 RPs selected.
3. **Rp-columns** — rename `MCred/MDO/MBH` → `RpCred/RpDO/RpBH`; values become true roster-period totals (aggregated over `[rp_start, rp_end]`), not calendar-month totals.
4. **Roster header** — show crew loaded/total above the header; show the current RP (color block) on the right; both the RP indicator and the viewport's Rp-columns follow the RP of the leftmost visible day on horizontal scroll and on RP-nav.
5. **Shared RP-select foundation** — dictionary-configurable selectable window (back/forward counts around the current RP) used by the new multi-select, the GO TO menu, and the 3 existing RP single-selects (`scenario-basic-info`, `import-pbs-dialog`, `roster-publish-dialog`).

## 2. Non-goals

- **No compatibility VIEWs / shims.** All four consumers (live-server, engine-server, pbs-server, gantt) migrate to `_period` in one coordinated cutover. Owner-confirmed: legacy-named VIEWs are avoided because they mislead AI agents and future readers about which relation is real.
- **Yearly tables stay calendar-year** (`crew_manday_*_yearly`, `year char(4)`). Only the monthly grain becomes RP-period grain.
- **YBH / YDO / YAL columns** (year-to-date) keep their calendar-year semantics.
- No new web fonts, no styling outside the token standard (§UI-Standard-Gate).

## 3. Phasing

One spec, two implementation phases (detailed plan generated separately):

| Phase | Scope | Cross-service risk |
|---|---|---|
| **P1 — Gantt nav + select foundation** | Dictionary params; non-admin RP-list endpoint; `roster-period-store`; shared `RpSelect` + `RpMultiSelect`; refactor 3 dropdowns; GO TO RPDate menu; toolbar `RpMultiSelect`; header RP indicator + crew count. Columns stay `MCred/MDO/MBH` (monthly) until P2. | None (no table rename, no engine/pbs change). |
| **P2 — Data migration + Rp-columns** | Rename `_monthly` → `_period` (+`rp_start/rp_end`); switch re-aggregation to RP grouping; update live-server + gantt + engine-server + pbs-server; truncate + RuleTool repopulate; conflict regression; rename columns to `Rp*` and switch stats to RP totals. | High — touches engine-server + pbs-server in one cutover (no compat layer). |

Rationale: P1 ships all user-facing nav/toolbar/header value with zero migration risk. P2 lands the column relabel together with the data switch so labels are never misleading.

## 4. Data model changes (P2)

### 4.1 Tables (both schemas `f8` + `scenario`)

Rename, repurpose to RP grain, add denormalized date columns:

```
crew_manday_fd_monthly    → crew_manday_fd_period
crew_manday_cc_am_monthly → crew_manday_cc_am_period

year_month char(7)  →  roster_period varchar(100)   -- mirrors roster_period.roster_period ('2026RP07')
+ rp_start timestamptz NOT NULL                     -- copied from roster_period at aggregation time
+ rp_end   timestamptz NOT NULL
```

- Unique key: live `(crew_id, roster_period)`; scenario `(scenario_id, crew_id, roster_period)`.
- Rename unique indexes `uq_manday_fd_monthly`/`uq_manday_cc_am_monthly` accordingly.
- All other columns (`credit`, `blh`, `is_day_off`, `is_al`/`is_leave`, audit) unchanged.

### 4.2 Re-aggregation (the core derivation change)

`live-server/src/services/manday/manday-tool.ts` `reaggMonthly` (~L397): replace calendar grouping

```
to_char(crew_base_dt,'YYYY-MM')
```

with an RP lookup that joins `roster_period`:

```sql
INSERT INTO ${sch}.${periodT} (crew_id, scenario_id?, roster_period, rp_start, rp_end, credit, blh, is_day_off, <leave>)
SELECT d.crew_id, rp.roster_period, rp.rp_start, rp.rp_end,
       SUM(d.credit), SUM(d.blh), SUM(d.is_day_off), SUM(d.<leave>)
  FROM ${sch}.${dailyT} d
  JOIN ${liveSchema}.roster_period rp
    ON d.crew_base_dt::date >= rp.rp_start::date
   AND d.crew_base_dt::date <= rp.rp_end::date
 GROUP BY d.crew_id, rp.roster_period, rp.rp_start, rp.rp_end
ON CONFLICT (<key>, roster_period) DO UPDATE SET ...
```

Daily rows that fall outside any RP (a gap) are dropped from period buckets and logged — RPs are seeded contiguously (2026–2036) so this is an edge case only. The yearly re-aggregation (`to_char(crew_base_dt,'YYYY')`) is unchanged.

`manday-partition.ts` `mandayTimeKeys()` and the inbound worker's monthly upsert (`manday-inbound-worker.ts` `upsertFdMonthly`/`upsertCcMonthly`) adopt the same date→RP resolution; the import path writes `roster_period + rp_start + rp_end`.

### 4.3 Migration SQL + repopulation

`sql/migration/2026-07-26-crew-manday-period-rename.sql` (idempotent, both schemas via `SET search_path`, following `2026-07-08-…consolidation.sql` idiom):

1. `ALTER TABLE … RENAME TO crew_manday_*_period` (guard with `information_schema.tables`).
2. `ALTER TABLE … RENAME COLUMN year_month TO roster_period`; `ALTER COLUMN … TYPE varchar(100)`.
3. `ADD COLUMN IF NOT EXISTS rp_start/rp_end timestamptz`.
4. `RENAME INDEX` / recreate unique index on the new key.
5. `TRUNCATE crew_manday_*_period` — existing monthly data is discarded (owner-confirmed). No `year_month → roster_period` conversion is attempted.

**Repopulation (post-deploy):** run the manday RuleTool — the `recompute()` driver (`live-server/src/services/manday/manday-tool.ts`) via `POST /api/admin/manday-credit-refresh` over the full needed range, or the owner's manday refresh script — to rebuild `_period` rows from the daily tables (truth source). The RuleTool already handles RP date boundaries (Feb ends Mar-01; Mar starts Mar-02) correctly via `splitBlhByBaseMidnight`, so boundary mapping is explicitly out of scope. The `_period` write path in `recompute()` and `manday-partition`/inbound-worker (§4.2) must be in place before this run.

**Deploy ordering** (coordinated cutover, no compatibility layer):
1. Run migration (rename + truncate).
2. Deploy new live-server + engine-server + pbs-server code (all read/write `_period`).
3. Run manday RuleTool to repopulate `_period`.

Transient window between steps 1–3: gantt Rp-columns and the pbs dashboard show empty stats until the RuleTool finishes. Coordinated as a maintenance window.

### 4.4 Conflict regression (migration gate §4)

Construct a crew with duty on `2026-03-01` (Feb RP's last day per seed). Assert that duty's credit/blh/day-off land in bucket `2026RP02`, **not** `2026RP03` — i.e. the table is RP-keyed, not calendar-month-keyed. This test must fail if anyone reverts the grouping to `to_char(crew_base_dt,'YYYY-MM')`.

## 5. Backend changes

### 5.1 Dictionary parameters (P1)

Seed two (+one) rows under `SYS_PARAM` in `sql/seed/01-dictionary.sql` (continue `idx` after 17, reuse the existing `ON CONFLICT … DO NOTHING`):

| code | name | code_value |
|---|---|---|
| `RP_SELECT_BACK_COUNT` | Roster-period selectable window — RPs before current | `6` |
| `RP_SELECT_FORWARD_COUNT` | Roster-period selectable window — RPs after current | `6` |
| `RP_GANTT_MAX_PERIODS` | Max RPs selectable in the Gantt toolbar multi-select | `5` |

Read pattern: batched `select code, code_value from dictionary where parent_code='SYS_PARAM' and code = any($1)` (mirror `loadBusinessTimeConfig` in `routes/pbs/period-admin.ts`), parse with `Number()` + `Number.isFinite` guard. Admins edit these immediately via the existing Dictionary admin page (`basic.config-dictionary`); no registry change needed.

### 5.2 Non-admin RP-list endpoint (P1)

New `GET /api/roster-periods` in `live-server` (registered under `/api`):

- Non-admin (any authenticated user).
- Reads `RP_SELECT_BACK_COUNT` / `RP_SELECT_FORWARD_COUNT` from dictionary; returns the windowed set around the current RP (the RP whose `[rp_start, rp_end]` contains `now()`), reusing the windowing SQL already in `routes/scenario/import-pbs-material.ts:549-566`.
- Response: `{ items: [{ id, rosterPeriod, name, rpStart, rpEnd, isCurrent }] }` (note: adds `name`; existing `ImportPbsRosterPeriodOption` is extended).
- The existing admin-only `GET /api/scenario/import-pbs-material/roster-periods` is removed once the 3 dropdowns migrate off it (the inventory confirmed those are its only callers).

### 5.3 Crew stats by RP (P2)

`GET /api/crew/stats` (`routes/crew/crew-stats.ts` + `services/crew/crew-stats-service.ts`): extend to accept `rosterPeriod` (or `rpStart&rpEnd`). When present, read RpCred/RpDO/RpBH directly from the materialized `_period` table (`select credit, blh, is_day_off … where roster_period = $1 and crew_id = any($2)`). Y* fields still come from `_yearly`. The monthly-bucket `LIKE '${year}-%'` logic is removed.

### 5.4 engine-server (P2)

`engine-server/F8/ro_input_builder/sections/manday.py` `_crew_month_manday()`: read `crew_manday_fd_period`, window by `roster_period` (or `rp_start/rp_end`) instead of `year_month BETWEEN lo AND hi`. `_MONTH_MANDAY_COLS` `Col("month","year_month")` → `Col("period","roster_period")`. Rules now reason over RP buckets (accepted decision); rule outcomes at Feb/Mar boundaries must be spot-checked during P2.

### 5.5 pbs-server (P2 — migrated)

`pbs-server/src/services/dashboard-profile/dashboard-profile-service.ts` is migrated alongside live-server (no compatibility VIEW):
- `creditTableFor()` returns `crew_manday_fd_period` / `crew_manday_cc_am_period` (~L105/L109).
- The `left join lateral` query reads `${schema}.crew_manday_*_period` and windows by `roster_period` (or `rp_start/rp_end`) instead of `year_month` (~L168-184).
- `formatYearMonth()` (~L91-99) is repurposed to produce a `roster_period` string.
- Test `dashboard-profile-service.test.ts` updated (~L109/L164/L176 assert `_period` table names).

## 6. No compatibility layer

No legacy-named VIEWs, aliases, or shims are created. All four consumers (live-server, engine-server, pbs-server, gantt) migrate to `_period` in the same coordinated release (§4.3 deploy ordering). Owner-confirmed: compatibility VIEWs are avoided because they mislead AI agents and future readers about which relation is real.

## 7. Frontend changes (`gantt/`)

### 7.1 `roster-period-store.ts` (P1, new)

Zustand store: fetch `GET /api/roster-periods` once, cache. Holds the windowed list + dictionary counts. Exposes:
- `useRosterPeriods()` — the list.
- `useCurrentRp()` — derives the RP of the leftmost visible day from the active gantt store's `scrollX/pxPerHour/rangeStart` (leftmost visible time = `rangeStart + scrollX/pxPerHour`; find the RP whose `[rp_start,rp_end]` contains it). Re-subscribes to scroll state so it updates on horizontal pan and on RP-nav.

### 7.2 Shared `RpSelect` + `RpMultiSelect` (P1, new)

New shared components under `gantt/src/components/common/` (or `roster/`):
- `RpSelect` — single-select, items from `roster-period-store`, label = `rosterPeriod`. Replaces the inline `<Select>` in:
  - `scenario/scenario-basic-info.tsx`
  - `scenario/import-pbs-dialog.tsx`
  - `roster/roster-publish-dialog.tsx`
  Each keeps its own default-selection policy (date-match vs `isCurrent`).
- `RpMultiSelect` — multi-select for the Live toolbar; enforces `RP_GANTT_MAX_PERIODS` (default 5); computes window `[min(rp_start)−7d, max(rp_end)+7d]`, writes to `useFilterStore.dateRange`, then `applyGanttFilters()` (reuse `scheduleAutoApply` debounce + `fitToRange`). Fully **replaces** `DateRangePicker` in `gantt-sub-toolbar.tsx`; the free-form date inputs are removed and `date-range-picker.tsx` is deleted. The parallel legacy `DateRangePicker` in `layout/header.tsx` is also removed/replaced in P1 (P1 verifies whether `header.tsx` is still rendered chrome; if so, it adopts `RpMultiSelect`, else the picker is simply dropped).

### 7.3 GO TO RPDate menu (P1)

New shared `TimeAxisRpMenu` + shared store action `zoomToRp(rpStart, rpEnd, rangeStart, viewportWidth)` added to both `gantt-view-store.ts` (Live) and `scenario-gantt-store.ts` (Scenario) — same math as `zoomToMonth` but the viewport fills `[rp_start, rp_end]` instead of a calendar month. Live + Scenario time-axis right-click handlers open `TimeAxisRpMenu` (items = windowed RP list, label `rosterPeriod`). The two duplicated month menus (`time-axis-menu.tsx`, `scenario-time-axis-menu.tsx`) are retired (§Gantt-Unify). Live retains the "widen `dateRange` + refetch if the RP is outside the loaded window" behavior, adapted to RP ranges.

### 7.4 Header RP indicator + crew count (P1)

Shared sub-components (`RpIndicator`, `CrewCount`) consumed by both `PaneToolbar` (Live) and `ScenarioPaneToolbar` (Scenario) via the existing `toolbar` render-prop slot in `SharedRosterPane`:
- **Crew loaded/total** (left/center) — render the currently-dead `loadedCount` alongside `unfilteredTotal` (Live) / `rowCount` (Scenario). Vertical count; does not track horizontal scroll.
- **RP color block** (right) — driven by `useCurrentRp()`; deterministic color per RP (hashed from `roster_period`); updates on horizontal scroll and on RP-nav.

Layout (ASCII):
```
┌─ Roster ──────────────── 50/200 ──────── [ 2026RP03 ] ─┐
│ CrewId Rank Base Sen RpCred RpDO RpBH   <time axis>     │
```
Styling follows the token standard (§UI-Standard-Gate); the RP block uses semantic tokens + a deterministic hue from the `--gantt-*` canvas palette family.

### 7.5 Column rename + RP stats wiring (P2)

- `stores/column-store.ts`: change labels `MCred→RpCred`, `MDO→RpDO`, `MBH→RpBH` in both `DEFAULT_ROSTER_COLUMNS` and `DEFAULT_SCENARIO_ROSTER_COLUMNS`. **Keys stay** `mcred/mdo/mbh` (preserves persisted column visibility/order in localStorage). Visibility/order unchanged.
- `CrewStats` type field names stay (`mcred/mbh/mdo`); only their source switches to `_period`.
- Sources fetch stats keyed off the viewport's current RP (via `useCurrentRp()` → `rosterPeriod`), re-fetching when the RP changes (not every calendar month):
  - `live-gantt-source.ts buildPanelRows` — Rp values from `_period`; optimistic draft delta still applied.
  - `scenario-gantt-source.ts` — Rp values from `_period` (scenario rows).
- `utils/manday-delta.ts`: replace `d.slice(0,7) === yearMonth` client calendar grouping with RP grouping (map each draft duty's date to its RP via the windowed list).
- `stores/crew-store.ts` `loadCrewStats` + `services/crew-api.ts` `getCrewStats`: accept `rosterPeriod` instead of `yearMonth`; cache key `crewId:rosterPeriod`.

## 8. Source-of-truth migration gate compliance

Per `docs/architecture/source-of-truth-migration-gate.md`:

- **Old source:** `crew_manday_*_monthly` keyed by calendar `year_month`; M* stats = calendar-month totals.
- **New source:** `crew_manday_*_period` keyed by `roster_period`; Rp* stats = RP-window totals.
- **Consumers audited (mapped):**
  - live-server readers: `crew-stats-service`, `scenario-gantt-db-service`, `scenario-export-service`, `pairing-service`, `manday-credit-refresh`.
  - live-server writers: `manday-tool.recompute`, `manday-partition`, `manday-inbound-worker`, `scenario-service` (clone/delete), `scenario-result-loader` (clear).
  - gantt: `crew-store`, `crew-api`, `manday-delta`, `live-gantt-source`, `scenario-gantt-source`.
  - engine-server: `manday.py` (migrated).
  - pbs-server: `dashboard-profile-service` (migrated — reads `_period`).
- **Old-source behavior:** the physical `_monthly` tables and the `year_month` column are gone; nothing writes calendar-month buckets after migration. `applyGanttFilters`/`fitToRange` pipeline is reused, not duplicated.
- **Conflict regression:** §4.4 (duty on 2026-03-01 lands in `2026RP02`).
- **Tests kept current:** all `__tests__` referencing the old table/column (`draft-commit-manday`, `roster-mutation-manday`, `manday-tool*`, `manday-ghost-repair`, `scenario-export-service`, `scenario-result-*`, `dashboard-profile-service.test`) updated to the new names/keys.
- **Residual / unchecked paths:** rule-outcome re-validation at RP boundaries (engine-server now reasons over RP buckets, not calendar months) — to be spot-checked during P2 before release. pbs dashboard empty-stats window during the §4.3 cutover until the RuleTool finishes.

## 9. Testing plan (§Playwright-Required, §No-Illusion, §Simulate-User)

- **Playwright (`e2e/gantt/`):**
  - GO TO RPDate: right-click axis → menu lists `2026RPxx`; selecting one zooms so the RP range fills the viewport; the header RP block updates to that RP.
  - Toolbar multi-select (Live): pick 2 RPs → gantt opens `[min−7d, max+7d]`; picking a 6th is blocked; cleared selection reverts.
  - Header RP block: drag the horizontal scrollbar → block follows the leftmost visible day's RP; use GO TO RPDate → block matches.
  - 3 refactored dropdowns still resolve the correct default (scenario-basic-info date-match; import-pbs / roster-publish `isCurrent`).
  - Rp-columns (P2): values match `_period` totals for the current RP (seed a known crew, assert specific values, not just visibility).
- **Vitest:** `zoomToRp` math; `useCurrentRp` derivation; `mandayTimeKeys`/`reaggMonthly` RP grouping; conflict regression (§4.4); crew-stats-by-RP service.
- Paste PASS receipts; no "should work" claims.

## 10. UI-standard & first-paint checks

- `npm run check:ui` clean (no magic font sizes/weights/radii) — paste result.
- §First-Paint: the RP multi-select and header additions must not block first paint; RP list fetch is lazy (after first crew batch). Rp-column stats (P2) load only for the viewport's current RP, asynchronously, never blocking the crew/flight first frame.

## 11. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Column data semantics | True RP totals (not label-only) | User request; RP is the planning unit. |
| Header count | Crew loaded / total (vertical) | User clarification. |
| Overall approach | A — shared layer | §Gantt-Unify; building blocks exist. |
| Engine/rules under rename | Full migration (rules reason over RP buckets) | User decision; single source of truth. |
| pbs-server under rename | Fully migrated (no VIEW) | User decision — VIEWs mislead AI agents. |
| Compatibility VIEWs | None | User decision — VIEWs mislead AI; full coordinated cutover instead. |
| Backfill strategy | TRUNCATE + RuleTool repopulate | User has manday RuleTool; avoids fragile year_month→RP conversion; RuleTool handles RP boundaries. |
| Date inputs | Removed (RPs are the only scope) | User request ("改为"). |
| Spec shape | One spec, phased plan | User decision. |
| Column keys | Unchanged (`mcred/mdo/mbh`); labels only | Preserves persisted column prefs (§Surgical). |
| Yearly tables | Calendar-year, unchanged | Out of scope; Y* semantics preserved. |
| Dead surface (P1) | Remove `date-range-picker.tsx`, legacy `header.tsx` picker, and old admin `import-pbs-material/roster-periods` endpoint | §Minimal-First / §Surgical — no orphaned date UI or duplicate RP endpoint after the switch. |
