---
name: 128-res-pairing-management
description: >
  Canonical how-to for the RES Pairing Creator feature (Live Gantt only).
  Triggers when the user mentions: "RES pairing", "reserve pairing",
  "PRAM", "PRPM", "CRAM", "CRPM", "RES Pairing Creator",
  "create reserve duties", "manage RES", "reserve coverage".
---

# RES Pairing Creator — Skill 128

> Feature shipped on branch `feat/gantt/res-pairing-creator` (unmerged as of 2026-06-23).
> Backend 18/18 vitest PASS · E2E 7/7 Playwright PASS.
> Spec: `docs/superpowers/specs/2026-06-23-res-pairing-creator-design.md`
> Plan: `docs/superpowers/plans/2026-06-23-res-pairing-creator.md`

---

## 1. What RES Pairings Are

Reserve pairings are **real `pairing` rows** (not a separate table), stored with:

| Column | Value |
|---|---|
| `assignment_group` | `RES` (from `RES_DEFAULTS.ASSIGNMENT_GROUP` in `dictionary`) |
| `assignment` | one of `PRAM` / `PRPM` / `CRAM` / `CRPM` (from `RES_CALL_TYPE`) |
| `source` | `MANUAL` |
| `flt_id` | `NULL` on the `pairing_segment` — no real flight |

One `pairing_segment` per pairing (`duty_seq=1, seg_seq=1`, `flt_id=NULL`, `duty_assignment='SBY'`, `seg_assignment=<callCode>`). One `pairing_composition` row per rank (`division, acting_rank, plan`).

**Call codes and division:**

| Division | Dict key | Code | Default window (base-local, from `assignment.fixed_*`) |
|---|---|---|---|
| Pilot (P) | P_AM | `PRAM` | 04:00 – 16:00 |
| Pilot (P) | P_MM | `PRMM` | 10:00 – 22:00 |
| Pilot (P) | P_PM | `PRPM` | 14:00 – 23:59 |
| Cabin (C) | C_AM | `CRAM` | 03:00 – 15:00 |
| Cabin (C) | C_PM | `CRPM` | 10:00 – 22:00 |

Windows are multi-select assignments (not AM/PM binary). Cell key = `date|base|assignment`. See spec `2026-07-13-res-planner-assignment-multi-select-design.md`.

**Ranks in use:** Pilot → `CA`, `FO`; Cabin → `IFD`, `FA` (data-driven, not hard-coded).

**Timezone:** AM/PM window times are interpreted as **base-local wall-clock time** and converted to UTC via `airport.zone_id` (DST-correct). The util is `live-server/src/utils/zoned-time.ts` → `localWallTimeToUtc(y, mo, d, hh, mm, zoneId)`. PM windows that cross midnight (`end ≤ start` by clock minutes) get `endDate = date + 1`.

**Pairing label format:** `<code>-<HHMM>-<HHMM>` e.g. `PRAM-1000-2200`, `PRPM-2000-0559`.

**Live-only:** RES pairings are a documented business-level Live-only feature (spec §10). They are gated by a source capability flag (`pairing.canCreateRes`); the shared `SharedPairingPane` does not fork — it simply does not render the button when the capability is absent (Scenario adapter returns `canCreateRes: false`).

---

## 2. Dictionary Parameters (no hardcoded values)

Seed: `sql/seed/30-res-pairing-config.sql` (idempotent via `WHERE NOT EXISTS`).

**`RES_CALL_TYPE`** (4 rows, `code_value = '<callCode>|<start>|<end>|<crossesMidnight>'`):

| `code` | `code_value` |
|---|---|
| `P_AM` | `PRAM\|10:00\|22:00\|0` |
| `P_PM` | `PRPM\|20:00\|05:59\|1` |
| `C_AM` | `CRAM\|10:00\|22:00\|0` |
| `C_PM` | `CRPM\|20:00\|05:59\|1` |

**`RES_DEFAULTS`** (3 rows):

| `code` | `code_value` |
|---|---|
| `ASSIGNMENT_GROUP` | `RES` |
| `DEFAULT_FLEET` | `737` |
| `CONFLICT_POLICY` | `skip` |

`dictionary` has no unique constraint → the seed uses `INSERT … SELECT … WHERE NOT EXISTS`.

---

## 3. The 4-Screen User Flow

```
[Live Pairing pane condition-strip: ShieldPlus icon "res-pairing-button"]
     ↓ click
[AppDialog "RES Pairing Planner" — data-testid="res-planner-dialog"]
     ↓ 3 tab panels
① Define          — scope (base chips, division, date-range)
                    calendar on left (click / range / day-of-week selection)
                    entry panel on right (base × rank × AM/PM plan matrix + window editor)
                    [Apply] writes cells into store
② Review & Generate — grouped overview (base/rank/timing → days, slots)
                    + conflict policy chips (skip / overwrite / add)
                    [Generate] → POST /api/res-pairing/generate → pane refetch + auto-filter
③ Manage existing   — filter (base/division/date/type) → list of existing RES pairings
                    multi-select → [Modify plan] / [Delete] (409 shown for blocked rows)
```

---

## 4. Frontend Architecture

### Entry button

`gantt/src/components/panes/pane-condition-strip.tsx` — `onResPairingClick` prop renders the `ShieldPlus` icon button (same cluster as Filter/Sort/bell, `h-5 w-5` button, icon `h-3 w-3`). Rendered only when the prop is supplied (capability-gated).

Wired in `gantt/src/components/panes/shared/pairing-pane.tsx`:
```tsx
const canCreateRes = !!source.pairing?.capabilities?.canCreateRes
onResPairingClick={canCreateRes ? () => useResPlannerStore.getState().open() : undefined}
```

Live adapter (`live-gantt-source.ts`): sets `canCreateRes: true`.
Scenario adapter (`scenario-gantt-source.ts`): omits the flag → no button.

### Store

`gantt/src/stores/res-planner-store.ts` — Zustand, exports `useResPlannerStore`.

Key state:
- `isOpen / open() / close()` — dialog lifecycle
- `tab: 'define' | 'review' | 'manage'` — active panel
- `division: 'P' | 'C'` — Pilot / Cabin
- `focusBase: string` — `'ALL'` or a base code chip selection
- `selMode: 'day' | 'range' | 'dow'` — calendar selection mode
- `dow: number[]` — days-of-week (0=Sun … 6=Sat)
- `cells: ResPlannerCell[]` — flat list of `{ date, base, timing, window, composition }` cells
- `mergeCells(incoming)` — idempotent upsert keyed on `date+base+timing`
- `brush: ResBrush` — per-division/base/rank/timing plan values the entry panel edits
- `amWindow / pmWindow` — editable override windows (default from `RES_CALL_TYPE`)
- `lastResult: ResPlannerResult | null` — result shown in banner after dialog closes

### Dialog

`gantt/src/components/res-pairing/res-pairing-planner-dialog.tsx` — `AppDialog` with `Calendar` icon, title "RES Pairing Planner", `data-testid="res-planner-dialog"`, `className="sm:max-w-[1100px]"`. Tab bar renders three buttons (`res-tab-define`, `res-tab-review`, `res-tab-manage`). Mounted once in `AppLayout`.

### Sub-components

| File | Role |
|---|---|
| `gantt/src/components/res-pairing/define-workspace.tsx` | Host for calendar + entry panel; drives the scope toolbar |
| `gantt/src/components/res-pairing/res-calendar.tsx` | Month-grid calendar; cell testids `res-cell-<YYYY-MM-DD>` |
| `gantt/src/components/res-pairing/res-entry-panel.tsx` | Base × rank × AM/PM plan matrix + window editor; base focus chip `res-base-<CODE>`, division `res-div-P/C`, mode `res-mode-day/range/dow`, plan inputs `res-plan-<BASE>-<RANK>-<am|pm>`, Apply `res-apply` |
| `gantt/src/components/res-pairing/review-generate.tsx` | Grouped overview + conflict policy + Generate button (`res-generate`); on success: sets `PairingFilter.assignments` + `applyGanttFilters()` + `lastResult` |
| `gantt/src/components/res-pairing/manage-existing.tsx` | Filterable multi-select list of existing RES pairings; testids `res-row-<n>`, filter fields `manage-filter-base/division/start/end/load`, composition cells `res-pairing-comp-<date>-<code>-<rank>` |

### API client

`gantt/src/services/res-api.ts` — **dedicated `axios` instance** (NOT the shared `http-client`). Reason: the shared http-client auto-unwraps any body with a `code` field. The dedicated `resClient` has its own response interceptor that unwraps `{ code: 200, data: T }` and rejects on errors. Auth Bearer token is copied from `api.defaults.headers.common` via a request interceptor.

```ts
resApi.generate(input)     // POST /api/res-pairing/generate
resApi.batchUpdate(input)  // PATCH /api/res-pairing/batch
resApi.batchDelete(input)  // POST /api/res-pairing/batch-delete
```

### Post-generate hook (requirement #8)

After `resApi.generate` returns:
1. Determine the generated call codes for the division (e.g. `['PRAM','PRPM']`).
2. Set `PairingFilter.assignments = generatedCodes` via the filter-store.
3. Call `applyGanttFilters()` → triggers the pairing pane to refetch and auto-filter.
4. Store `lastResult` in the planner store (banner survives dialog close).
5. Switch to a result view showing `data-testid="res-generate-result"` with the created count.

---

## 5. Backend Architecture

### Service

`live-server/src/services/res-pairing/res-pairing-service.ts`

Key exports:

| Export | Description |
|---|---|
| `buildPairingRow(cell, division, code, zoneId, fleet, group, username)` | Pure — returns the pairing row object with computed `schStrDtUtc/schEndDtUtc`, label, `tafb=0`, `source='MANUAL'` |
| `summarize(cells, division)` | Pure — groups cells by `base+rank+timing`, returns `{ base, rank, timing, days, slots }[]` |
| `loadResConfig(fastify, division)` | Reads `RES_CALL_TYPE` + `RES_DEFAULTS` + base→`airport.zone_id`; returns `{ group, fleet, codeFor(timing), zoneByBase(base) }` |
| `generate(fastify, input, username)` | Main transaction: pre-fetches zone IDs + conflict rows in batch, then per-cell inserts `pairing` + `pairing_segment` + `pairing_composition`; invalidates `pairing:list:*` |
| `recomputeWindowTimes(date, window, zoneId)` | Pure — recomputes UTC start/end + `durationDays` for a new window string |
| `batchUpdate(fastify, body, username)` | Updates `plan` per rank and/or recomputes times for a list of pairing IDs |
| `batchDelete(fastify, ids)` | Delegates to `pairingService.remove` per ID via `Promise.allSettled`; returns `{ deleted, blocked }` |

**Conflict detection:** batch pre-fetched (one query) before the transaction using an O(1) `Map<"date|base|assignment", pairingId>`. Policies: `skip` → count as skipped; `overwrite` → soft-delete composition rows then re-insert; `add` → insert a duplicate pairing.

**`insertComposition`** (private): inserts `pairing_composition` rows with `{ pairingId, division, actingRank, plan, fill: 0 }`. Never writes the `open` generated column.

**`buildSegmentRow`** (exported): fills all required `NOT NULL` fields including `dutyAccState='D'`, `dutyAssignment='SBY'`, `fltId=null`.

**Cache invalidation:** `invalidatePattern(fastify.redis, 'pairing:list:*')` after each write.

### Time utility

`live-server/src/utils/zoned-time.ts` — `localWallTimeToUtc(year, month1to12, day, hh, mm, zoneId): Date`. Uses `Intl.DateTimeFormat` probe-and-correct (two-pass DST-safe), no external deps.

### Route

`live-server/src/routes/res-pairing/res-pairing.ts` — Fastify plugin, registered in `live-server/src/index.ts` alongside other route plugins.

| Method | Path | Body / Response |
|---|---|---|
| `POST` | `/api/res-pairing/generate` | `{ division, conflictPolicy, cells, dryRun? }` → `{ created, skipped, summary }` |
| `PATCH` | `/api/res-pairing/batch` | `{ ids, plan?, window? }` → `{ updated }` |
| `POST` | `/api/res-pairing/batch-delete` | `{ ids }` → `{ deleted, blocked:[{id,reason}] }` |

All three wrapped in `{ code: 200, data: T, message: 'ok' }` via the `success()` helper.

**List existing:** reuse `GET /api/pairing?assignments=PRAM,PRPM&base=&division=&startDate=&endDate=` (no new endpoint).

### Cell shape (backend contract)

```ts
interface ResCell {
  date: string                       // 'YYYY-MM-DD'
  base: string                       // IATA 3-letter
  timing: 'AM' | 'PM'
  window?: { start: string; end: string }  // 'HH:MM' — overrides dictionary default
  composition: { rank: string; plan: number }[]
}
```

---

## 6. Testid Contract

| Testid | Element |
|---|---|
| `res-pairing-button` | ShieldPlus icon button in pairing-pane condition-strip |
| `res-planner-dialog` | AppDialog root |
| `res-tab-define` / `res-tab-review` / `res-tab-manage` | Tab buttons |
| `res-base-<CODE>` | Base chip (e.g. `res-base-YVR`) |
| `res-div-P` / `res-div-C` | Division selector |
| `res-mode-day` / `res-mode-range` / `res-mode-dow` | Selection mode |
| `res-dow-<n>` | Day-of-week chip (0=Sun … 6=Sat); `data-active="true"` when selected |
| `res-cell-<YYYY-MM-DD>` | Calendar cell |
| `res-plan-<BASE>-<RANK>-<am\|pm>` | Plan input (e.g. `res-plan-YVR-CA-am`) |
| `res-apply` | Apply button |
| `res-generate` | Generate button on Review tab |
| `res-generate-result` | Result text element containing the created count |
| `pairing-filter-chip-PRAM` / `pairing-filter-chip-PRPM` | Auto-applied filter chips |
| `pairing-filter-chip-CRAM` / `pairing-filter-chip-CRPM` | (cabin equivalent) |
| `pairing-pane` | Pairing pane host |
| `res-row-<n>` | Manage tab row by index |
| `manage-filter-base` / `manage-filter-division` / `manage-filter-start` / `manage-filter-end` / `manage-filter-load` | Manage tab filter controls |
| `res-pairing-comp-<date>-<code>-<rank>` | Composition plan cell in Manage tab (e.g. `res-pairing-comp-2026-06-06-CRAM-IFD`) |

---

## 7. E2E Acceptance Tests

### How to run the full suite

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps \
  tests/gantt/res-pairing-button.spec.ts \
  tests/gantt/res-pairing-dialog.spec.ts \
  tests/gantt/res-pairing-yvr-acceptance.spec.ts \
  tests/gantt/res-pairing-yyz-cabin-acceptance.spec.ts \
  --reporter=list
```

### Test IDs

| File | ID | What it proves |
|---|---|---|
| `res-pairing-button.spec.ts` | Live-1400 | ShieldPlus button visible on Live pairing pane |
| `res-pairing-dialog.spec.ts` | Live-1401 | Button click opens dialog, Review & Generate tab visible |
| *(define workspace)* | Live-1402 | Base focus filters entry matrix |
| *(define workspace)* | Live-1403 | Apply fills calendar cells |
| *(generate)* | Live-1404 | Generate → PRAM/PRPM filter chips appear + pane shows `PRAM-1000-2200` |
| *(manage)* | Live-1405 | Batch-modify plan value reflected in Manage list |
| `res-pairing-yvr-acceptance.spec.ts` | **Live-1410** | YVR pilot: 30-day Jun 2026 range, CA/FO=10, 60 pairings, `PRAM-1000-2200`/`PRPM-2000-0559` labels, `__ganttTest.pairings().length === 60` |
| `res-pairing-yyz-cabin-acceptance.spec.ts` | **Live-1411** | YYZ cabin: weekend 15/weekday 14 IFD+FA, 60 pairings, composition split verified via Manage tab testids |

### Pre-cleaning (both acceptance tests)

Both acceptance tests (1410/1411) pre-clean the demo DB of any existing PRAM/PRPM (or CRAM/CRPM) pairings in Jun–Jul 2026 using `GET /api/pairing?assignments=…` + `POST /api/res-pairing/batch-delete` via `request` (§Simulate-User permits API for pre-condition seeding; the user action Generate is triggered via the UI only).

---

## 8. Key Gotchas

1. **PM `pairing_dt` is the civil start date, not `schStrDtUtc`**. The PM window `20:00–05:59` starts on date D but `schStrDtUtc` is in UTC (D+offset hours). `pairing_dt = cell.date` (the civil start date) regardless of UTC crossing.

2. **Dedicated axios for `resApi`**. The shared `http-client` unwraps `{ code: 200, data: T }` but then the inner `T` has no `code` field — it would work, but the dedicated client was explicitly required by the spec (§13d) to make the dependency explicit. Do not switch to the shared client.

3. **Demo DB persists RES pairings between test runs**. Acceptance tests always pre-clean their date range; do not skip the cleanup step or the count assertions will fail.

4. **`dictionary` has no unique constraint**. The seed cannot use `ON CONFLICT DO NOTHING`; it uses `INSERT … SELECT … WHERE NOT EXISTS`.

5. **`pairing_composition.open` is a generated column**. Never write it. The insert fills `plan`, `fill` (literal 0); `open` = `plan - fill` is computed by PostgreSQL.

6. **Conflict batch detection is pre-transaction**. `generate()` fetches all potentially conflicting pairings in one query before the transaction loop, builds an O(1) map, and avoids per-cell `SELECT` inside the transaction. Don't regress this to per-cell queries.

7. **`canCreateRes` capability — no UI fork**. The button is rendered only when `onResPairingClick` prop is present in `pane-condition-strip`. The shared `SharedPairingPane` passes this prop only when the Live source capability is true. Scenario never sees the button; no `if (live)` inside the pane itself.

8. **YVR had no historical reserve data in the demo DB**. The Live-1410 acceptance test uses the agreed fallback: 1 AM + 1 PM per day, CA 10 / FO 10, 30 June days → 60 pairings total.

---

## 9. Linked Docs & Context

- Spec: `docs/superpowers/specs/2026-06-23-res-pairing-creator-design.md`
- Plan: `docs/superpowers/plans/2026-06-23-res-pairing-creator.md`
- Mockups: `docs/mockups/res-pairing-creator/` (open `index.html`; `02-define-workspace.html` is interactive)
- Playbook section: `docs/modules/gantt/live-scenario-gantt-playbook.md` §16
- Memory: `~/.claude/projects/…/memory/res-pairing-creator.md`
- Related: `[[noc-integration]]` — reserves were historically imported by NOC as non-pairing ground duties; this feature creates them as real RES pairings via the UI.
