# RES Pairing Creator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Live-Gantt feature to define, generate, and manage reserve (RES) pairings by base × rank × AM/PM date, replacing hand-written SQL inserts.

**Architecture:** A new `AppDialog` ("RES Pairing Planner") opens from an icon in the Live Pairing-pane toolbar (gated by a new source capability so it never forks the shared pane). A combined Define workspace (calendar + entry panel) builds a flat list of "cells"; a new live-server `res-pairing-service` expands each cell into `pairing` + `pairing_segment` + `pairing_composition` rows in one transaction, with base-local→UTC time conversion via `airport.zone_id`. After generate, the pairing pane refetches and auto-applies the existing `PairingFilter.assignments` filter to surface the new RES pairings.

**Tech Stack:** live-server (Fastify + Drizzle + TS, vitest), gantt (React 19 + Vite + TS, Zustand), Playwright e2e, PostgreSQL 16, `dictionary` for parameterization.

## Global Constraints

- **No hardcoded business constants** — call-codes, default windows, assignment_group, default fleet come from `dictionary` (`RES_CALL_TYPE`, `RES_DEFAULTS`). (CLAUDE.md)
- **RES pairings are Live-only** — gated by source capability, not a UI fork (§Gantt-Unify).
- **assignment_group = `RES`**, composition column = **`plan`** (not `plan_value`), `pairing_composition.fill/open` are derived — never write them.
- **Times are base-local → UTC** via `airport.zone_id` (DST-correct); PM window crosses midnight (end date +1). (Decision D3)
- **Ranks:** Pilot → CA, FO; Cabin → IFD, FA — read data-driven (distinct crew `acting_rank` per division).
- **UI language English**; pop-ups use `@rois/ui` `AppDialog`; pane buttons icon-only in `pane-condition-strip` (§Pane-Toolbar-Home); run `npm run check:ui` (0 hard violations).
- **Every change ships a test** (§Playwright-Required); e2e drives the REAL UI, never calls the generate API to fake a user action (§Simulate-User); paste PASS receipts (§No-Illusion).
- **Version bump:** `gantt/src/version.ts` `FRONTEND_VERSION +1` and `BACKEND_VERSION +1`.
- **Live-server runs against the REMOTE demo Postgres**; vitest service tests follow the existing co-located pattern (e.g. `live-server/src/services/crew-memo/crew-memo-service.test.ts`). There is **no `buildTestApp` harness** — for route coverage, prefer unit-testing the service/handler logic; only add app-injection if an existing route test demonstrates a harness.

### Verified integration facts (checked against the live schema 2026-06-23 — use these, do not re-guess)

- **`dictionary` columns:** `parent_code, code, name, idx (smallint), code_value` only. **No** `value`/`attr*`/`display_order`, and **no unique constraint** → idempotent seeds use `insert … select … where not exists`, not `on conflict`. Pack multi-field config into `code_value` as a pipe string.
- **`airport`** code column is **`airport varchar(3)`** (IATA), timezone in **`zone_id varchar(50)`**. Base→zone join: `select zone_id from airport where airport = <base>`.
- **Route registration** is in `live-server/src/index.ts` (`server.register(...)`, ~line 133-142), **not** `app.ts`. Register `resPairingRoutes` alongside `pairingRoutes`.
- **`pairing_composition`** real columns: `pairing_id, division, acting_rank, plan, fill, is_deleted` (+ audit, `scenario_id default 0`); `open` is generated — never write `fill`/`open`.

### Capstone acceptance test — Phases D–G must turn this GREEN

`e2e/tests/gantt/res-pairing-yvr-acceptance.spec.ts` (`Live-1410`) is the definition of done for the
frontend. It is browser-only (§Simulate-User — no API calls) and exercises: open planner → focus YVR →
Pilot → Range Jun 1–30 → CA/FO = 10 AM & PM → Apply → Review → Generate → assert result count **60**,
auto PRAM/PRPM filter chips, the `PRAM-1000-2200` / `PRPM-2000-0559` labels visible, and
`window.__ganttTest.pairings().length === 60`. (May-2026 study found no historical YVR reserve data →
fallback 1 AM + 1 PM/day, CA 10 / FO 10.)

**Required test-id contract the UI MUST expose** (use these exact ids in phases D–G):
`res-pairing-button`, `res-planner-dialog`, `res-base-<CODE>` (e.g. `res-base-YVR`), `res-div-P` / `res-div-C`,
`res-mode-day|range|dow`, `res-cell-<YYYY-MM-DD>`, `res-plan-<BASE>-<RANK>-<am|pm>` (e.g. `res-plan-YVR-CA-am`),
`res-apply`, `res-tab-review`, `res-generate`, `res-generate-result` (text contains the created count),
`pairing-filter-chip-PRAM` / `pairing-filter-chip-PRPM`, `pairing-pane`; and the live `__ganttTest.pairings()`
hook must include the new RES pairings. When wiring per-task e2e in D–G, also keep this capstone in mind.

---

## Phase A — Parameterization seed

### Task A1: Seed `RES_CALL_TYPE` + `RES_DEFAULTS` dictionary rows

**Files:**
- Create: `sql/seed/30-res-pairing-config.sql`

**Interfaces:**
- Produces: dictionary rows (columns `parent_code, code, name, idx, code_value` — see Verified facts):
  - `parent_code='RES_CALL_TYPE'`, `code` in `{P_AM,P_PM,C_AM,C_PM}`,
    `code_value='<callCode>|<start HH:MM>|<end HH:MM>|<crossesMidnight 0|1>'`
    (e.g. `'PRAM|10:00|22:00|0'`, `'PRPM|20:00|05:59|1'`).
  - `parent_code='RES_DEFAULTS'`, codes `ASSIGNMENT_GROUP` (`code_value='RES'`), `DEFAULT_FLEET` (`'737'`), `CONFLICT_POLICY` (`'skip'`).

- [ ] **Step 1: Write the idempotent seed (dictionary has NO unique constraint → use `where not exists`)**

```sql
-- 30-res-pairing-config.sql — RES Pairing Creator parameters (idempotent)
-- code_value packs '<callCode>|<start>|<end>|<crossesMidnight>' for RES_CALL_TYPE; plain value for RES_DEFAULTS
insert into dictionary (parent_code, code, name, idx, code_value)
select v.parent_code, v.code, v.name, v.idx, v.code_value
from (values
  ('RES_CALL_TYPE','P_AM','Pilot Reserve AM',1,'PRAM|10:00|22:00|0'),
  ('RES_CALL_TYPE','P_PM','Pilot Reserve PM',2,'PRPM|20:00|05:59|1'),
  ('RES_CALL_TYPE','C_AM','Cabin Reserve AM',3,'CRAM|10:00|22:00|0'),
  ('RES_CALL_TYPE','C_PM','Cabin Reserve PM',4,'CRPM|20:00|05:59|1'),
  ('RES_DEFAULTS','ASSIGNMENT_GROUP','RES assignment group',1,'RES'),
  ('RES_DEFAULTS','DEFAULT_FLEET','Default fleet for reserve',2,'737'),
  ('RES_DEFAULTS','CONFLICT_POLICY','Default conflict policy',3,'skip')
) as v(parent_code, code, name, idx, code_value)
where not exists (select 1 from dictionary d where d.parent_code = v.parent_code and d.code = v.code);
```

- [ ] **Step 2: Apply to the dev DB and verify**

Run: `psql "$DATABASE_URL" -f sql/seed/30-res-pairing-config.sql && psql "$DATABASE_URL" -c "select parent_code,code,code_value from dictionary where parent_code like 'RES_%' order by parent_code,idx"`
Expected: 7 rows; RES_CALL_TYPE rows show the packed `CODE|start|end|cross` strings.

- [ ] **Step 4: Commit**

```bash
git add sql/seed/30-res-pairing-config.sql
git commit -m "feat(res): seed RES_CALL_TYPE + RES_DEFAULTS dictionary params"
```

---

## Phase B — Backend: time util + generate

### Task B1: Base-local → UTC conversion util (TDD)

**Files:**
- Create: `live-server/src/utils/zoned-time.ts`
- Test: `live-server/src/utils/__tests__/zoned-time.test.ts`

**Interfaces:**
- Produces: `localWallTimeToUtc(year:number, month1to12:number, day:number, hh:number, mm:number, zoneId:string): Date` — interprets the wall-clock time in `zoneId` and returns the corresponding UTC `Date`, DST-correct.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { localWallTimeToUtc } from '../zoned-time'

describe('localWallTimeToUtc', () => {
  it('converts YVR (PDT, UTC-7 in June) 10:00 to 17:00Z', () => {
    const d = localWallTimeToUtc(2026, 6, 1, 10, 0, 'America/Vancouver')
    expect(d.toISOString()).toBe('2026-06-01T17:00:00.000Z')
  })
  it('converts YYZ (EDT, UTC-4 in June) 20:00 to 00:00Z next day', () => {
    const d = localWallTimeToUtc(2026, 6, 1, 20, 0, 'America/Toronto')
    expect(d.toISOString()).toBe('2026-06-02T00:00:00.000Z')
  })
  it('handles standard time (YEG, MST UTC-7 in January) 10:00 to 17:00Z', () => {
    const d = localWallTimeToUtc(2026, 1, 1, 10, 0, 'America/Edmonton')
    expect(d.toISOString()).toBe('2026-01-01T17:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd live-server && npx vitest run src/utils/__tests__/zoned-time.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the util**

```ts
// zoned-time.ts — convert a wall-clock time in an IANA zone to a UTC Date (DST-correct, no deps)
const offsetMinutes = (date: Date, zoneId: string): number => {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zoneId, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = dtf.formatToParts(date).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a }, {})
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === '24' ? '0' : p.hour), +p.minute, +p.second)
  return (asUTC - date.getTime()) / 60000
}

export const localWallTimeToUtc = (
  year: number, month1to12: number, day: number, hh: number, mm: number, zoneId: string,
): Date => {
  const guess = Date.UTC(year, month1to12 - 1, day, hh, mm)
  const off1 = offsetMinutes(new Date(guess), zoneId)
  let utc = guess - off1 * 60000
  const off2 = offsetMinutes(new Date(utc), zoneId)
  if (off2 !== off1) utc = guess - off2 * 60000
  return new Date(utc)
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd live-server && npx vitest run src/utils/__tests__/zoned-time.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add live-server/src/utils/zoned-time.ts live-server/src/utils/__tests__/zoned-time.test.ts
git commit -m "feat(res): DST-correct local-wall-time to UTC util"
```

### Task B2: `res-pairing-service.generate` core (TDD)

**Files:**
- Create: `live-server/src/services/res-pairing/res-pairing-service.ts`
- Test: `live-server/src/services/res-pairing/__tests__/res-pairing-service.test.ts`

**Interfaces:**
- Consumes: `localWallTimeToUtc` (B1); drizzle models `pairing`, `pairingSegment`, `pairingComposition` (`live-server/src/models/pairing/*`); `pairing-service` cache invalidation `invalidatePattern(fastify,'pairing:list:*')`.
- Produces:
  - Type `ResCell = { date: string; base: string; timing: 'AM'|'PM'; window?: { start: string; end: string }; composition: { rank: string; plan: number }[] }`
  - Type `GenerateInput = { division: 'P'|'C'; conflictPolicy: 'skip'|'overwrite'|'add'; cells: ResCell[]; dryRun?: boolean }`
  - `buildPairingRow(cell, division, code, zoneId, fleet, group, username): NewPairing` (pure, unit-tested)
  - `generate(fastify, input, username): Promise<{ created: number; skipped: number; summary: ResSummaryRow[] }>`
  - `ResSummaryRow = { base: string; rank: string; timing: 'AM'|'PM'; days: number; slots: number }`

- [ ] **Step 1: Write the failing unit test for `buildPairingRow`**

```ts
import { describe, it, expect } from 'vitest'
import { buildPairingRow } from '../res-pairing-service'

describe('buildPairingRow', () => {
  const cell = { date: '2026-06-01', base: 'YVR', timing: 'AM' as const,
    window: { start: '10:00', end: '22:00' }, composition: [{ rank: 'CA', plan: 5 }] }
  it('sets RES group, code, label, computed UTC times, source MANUAL', () => {
    const row = buildPairingRow(cell, 'P', 'PRAM', 'America/Vancouver', '737', 'RES', 'tester')
    expect(row.assignmentGroup).toBe('RES')
    expect(row.assignment).toBe('PRAM')
    expect(row.pairingLabel).toBe('PRAM-1000-2200')
    expect(row.base).toBe('YVR')
    expect(row.division).toBe('P')
    expect(row.fleet).toBe('737')
    expect(row.source).toBe('MANUAL')
    expect(row.schStrDtUtc.toISOString()).toBe('2026-06-01T17:00:00.000Z') // 10:00 PDT
    expect(row.schEndDtUtc.toISOString()).toBe('2026-06-02T05:00:00.000Z') // 22:00 PDT
    expect(row.durationDays).toBe(1)
    expect(row.tafb).toBe(0)
  })
  it('PM crosses midnight: end date is next day', () => {
    const pm = { ...cell, timing: 'PM' as const, window: { start: '20:00', end: '05:59' } }
    const row = buildPairingRow(pm, 'P', 'PRPM', 'America/Vancouver', '737', 'RES', 'tester')
    expect(row.pairingLabel).toBe('PRPM-2000-0559')
    expect(row.schStrDtUtc.toISOString()).toBe('2026-06-02T03:00:00.000Z') // 20:00 PDT
    expect(row.schEndDtUtc.toISOString()).toBe('2026-06-02T12:59:00.000Z') // 05:59 PDT next day
    expect(row.durationDays).toBe(2)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd live-server && npx vitest run src/services/res-pairing/__tests__/res-pairing-service.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `buildPairingRow` + types**

```ts
// res-pairing-service.ts
import { localWallTimeToUtc } from '../../utils/zoned-time'

export type Timing = 'AM' | 'PM'
export interface ResCell { date: string; base: string; timing: Timing; window?: { start: string; end: string }; composition: { rank: string; plan: number }[] }
export interface GenerateInput { division: 'P' | 'C'; conflictPolicy: 'skip' | 'overwrite' | 'add'; cells: ResCell[]; dryRun?: boolean }
export interface ResSummaryRow { base: string; rank: string; timing: Timing; days: number; slots: number }

const hhmm = (t: string) => { const [h, m] = t.split(':').map(Number); return { h, m } }
const compact = (t: string) => t.replace(':', '')

export const buildPairingRow = (
  cell: ResCell, division: 'P' | 'C', code: string, zoneId: string, fleet: string, group: string, username: string,
) => {
  const [y, mo, d] = cell.date.split('-').map(Number)
  const w = cell.window!
  const s = hhmm(w.start), e = hhmm(w.end)
  const crosses = (e.h * 60 + e.m) <= (s.h * 60 + s.m)
  const start = localWallTimeToUtc(y, mo, d, s.h, s.m, zoneId)
  const endDay = crosses ? d + 1 : d
  const end = localWallTimeToUtc(y, mo, endDay, e.h, e.m, zoneId)
  const now = new Date()
  return {
    ver: 1,
    pairingDt: cell.date,
    pairingLabel: `${code}-${compact(w.start)}-${compact(w.end)}`,
    division, base: cell.base, fleet,
    assignmentGroup: group, assignment: code,
    schStrDtUtc: start, schEndDtUtc: end,
    actStrDtUtc: start, actEndDtUtc: end,
    durationDays: crosses ? 2 : 1,
    tafb: 0,
    source: 'MANUAL' as const,
    comments: code,
    isDeleted: 0,
    createdBy: username, updatedBy: username, createdAt: now, updatedAt: now,
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd live-server && npx vitest run src/services/res-pairing/__tests__/res-pairing-service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/res-pairing/
git commit -m "feat(res): buildPairingRow with base-local UTC + label"
```

### Task B3: `generate` transaction + conflict policy (TDD against test harness)

**Files:**
- Modify: `live-server/src/services/res-pairing/res-pairing-service.ts`
- Test: `live-server/src/services/res-pairing/__tests__/res-pairing-generate.test.ts`

**Interfaces:**
- Consumes: `buildPairingRow` (B2); a config loader `loadResConfig(fastify, division)` reading `RES_CALL_TYPE` + `RES_DEFAULTS` + base→`airport.zone_id`.
- Produces: `generate(fastify, input, username)` returning `{ created, skipped, summary }`; helper `summarize(cells, division): ResSummaryRow[]` (pure).

- [ ] **Step 1: Write the failing test for `summarize` (pure)**

```ts
import { describe, it, expect } from 'vitest'
import { summarize } from '../res-pairing-service'

describe('summarize', () => {
  it('groups by base+rank+timing with day & slot counts', () => {
    const cells = [
      { date: '2026-06-01', base: 'YVR', timing: 'AM' as const, composition: [{ rank: 'CA', plan: 5 }, { rank: 'FO', plan: 5 }] },
      { date: '2026-06-08', base: 'YVR', timing: 'AM' as const, composition: [{ rank: 'CA', plan: 5 }, { rank: 'FO', plan: 5 }] },
    ]
    const rows = summarize(cells, 'P')
    const caAm = rows.find(r => r.base === 'YVR' && r.rank === 'CA' && r.timing === 'AM')!
    expect(caAm.days).toBe(2)
    expect(caAm.slots).toBe(10)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd live-server && npx vitest run src/services/res-pairing/__tests__/res-pairing-generate.test.ts`
Expected: FAIL (summarize not exported).

- [ ] **Step 3: Implement `summarize`, `loadResConfig`, `generate`**

```ts
import { pairing } from '../../models/pairing/pairing'
import { pairingSegment } from '../../models/pairing/pairing-segment'
import { pairingComposition } from '../../models/pairing/pairing-composition'
import { and, eq, inArray } from 'drizzle-orm'

export const summarize = (cells: ResCell[], _division: 'P' | 'C'): ResSummaryRow[] => {
  const m = new Map<string, ResSummaryRow>()
  for (const c of cells) for (const comp of c.composition) {
    const k = `${c.base}|${comp.rank}|${c.timing}`
    const row = m.get(k) ?? { base: c.base, rank: comp.rank, timing: c.timing, days: 0, slots: 0 }
    row.days += 1; row.slots += comp.plan; m.set(k, row)
  }
  return [...m.values()]
}

// Reads dictionary RES_CALL_TYPE / RES_DEFAULTS (code_value is the extension col) and base->airport.zone_id.
// Use the project's drizzle `sql` template for parameterized queries (see crew-memo-service for the pattern).
export const loadResConfig = async (fastify: any, division: 'P' | 'C') => {
  const callRows = await fastify.db.execute(/* sql */`select code, code_value from dictionary where parent_code = 'RES_CALL_TYPE'`)
  const defRows  = await fastify.db.execute(/* sql */`select code, code_value from dictionary where parent_code = 'RES_DEFAULTS'`)
  const defs = Object.fromEntries(defRows.rows.map((r: any) => [r.code, r.code_value]))
  const parseCall = (cv: string) => { const [code, start, end, cross] = cv.split('|'); return { code, start, end, crosses: cross === '1' } }
  const codeFor = (timing: Timing) => parseCall(callRows.rows.find((r: any) => r.code === `${division}_${timing}`).code_value) // { code, start, end, crosses }
  const zoneByBase = async (base: string) => {
    const r = await fastify.db.execute(/* sql */`select zone_id from airport where airport = '${base}' limit 1`) // parameterize via sql\`\` in real code
    return r.rows[0]?.zone_id ?? 'UTC'
  }
  return {
    group: defs.ASSIGNMENT_GROUP ?? 'RES',
    fleet: defs.DEFAULT_FLEET ?? '737',
    codeFor, zoneByBase,
  }
}

export const generate = async (fastify: any, input: GenerateInput, username: string) => {
  const cfg = await loadResConfig(fastify, input.division)
  const summary = summarize(input.cells, input.division)
  if (input.dryRun) return { created: 0, skipped: 0, summary }

  let created = 0, skipped = 0
  await fastify.db.transaction(async (tx: any) => {
    for (const cell of input.cells) {
      const cc = cfg.codeFor(cell.timing)   // { code, start, end, crosses }
      const code = cc.code
      const window = cell.window ?? { start: cc.start, end: cc.end }
      const zoneId = await cfg.zoneByBase(cell.base)
      const row = buildPairingRow({ ...cell, window }, input.division, code, zoneId, cfg.fleet, cfg.group, username)

      const existing = await tx.select({ id: pairing.id }).from(pairing).where(and(
        eq(pairing.pairingDt, cell.date), eq(pairing.base, cell.base),
        eq(pairing.division, input.division), eq(pairing.assignment, code), eq(pairing.isDeleted, 0),
      ))
      if (existing.length) {
        if (input.conflictPolicy === 'skip') { skipped++; continue }
        if (input.conflictPolicy === 'overwrite') {
          await tx.update(pairingComposition).set({ isDeleted: 1 }).where(eq(pairingComposition.pairingId, existing[0].id))
          await insertComposition(tx, existing[0].id, input.division, cell, username)
          created++; continue
        }
        // 'add' falls through to insert a duplicate
      }
      const [ins] = await tx.insert(pairing).values(row).returning({ id: pairing.id })
      await tx.insert(pairingSegment).values(buildSegmentRow(ins.id, row, code, username))
      await insertComposition(tx, ins.id, input.division, cell, username)
      created++
    }
  })
  await fastify.pairingService?.invalidateListCache?.(fastify) // or invalidatePattern('pairing:list:*')
  return { created, skipped, summary }
}

const insertComposition = async (tx: any, pairingId: number, division: string, cell: ResCell, username: string) => {
  const rows = cell.composition.filter(c => c.plan > 0).map(c => ({
    pairingId, division, actingRank: c.rank, plan: c.plan, fill: 0, isDeleted: 0,
    createdBy: username, updatedBy: username,
  }))
  if (rows.length) await tx.insert(pairingComposition).values(rows)
}

export const buildSegmentRow = (pairingId: number, p: ReturnType<typeof buildPairingRow>, code: string, username: string) => ({
  pairingId, dutySeq: 1, segSeq: 1, fltId: null,
  dutyStrArp: p.base, dutyEndArp: p.base, depArp: p.base, arvArp: p.base,
  dutySchStrDtUtc: p.schStrDtUtc, dutySchEndDtUtc: p.schEndDtUtc,
  schStrDtUtc: p.schStrDtUtc, schEndDtUtc: p.schEndDtUtc,
  actStrDtUtc: p.schStrDtUtc, actEndDtUtc: p.schEndDtUtc,
  dutyAssignment: 'SBY', segAssignment: code, airline: 'F8', fleetSeg: p.fleet,
  fltDt: p.pairingDt, fltNum: code, dutyBriefMin: 0, dutyDebriefMin: 0, isDeleted: 0,
  createdBy: username, updatedBy: username,
})
```

> Note: adapt `fastify.db.execute` / model field names to the project's drizzle setup — confirm column→property names in `live-server/src/models/pairing/*.ts` and the dictionary/airport models before running. If `pairing.pairingDt` is a date column, pass `cell.date` string.

- [ ] **Step 4: Run the `summarize` test, verify pass**

Run: `cd live-server && npx vitest run src/services/res-pairing/__tests__/res-pairing-generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/res-pairing/
git commit -m "feat(res): generate transaction + conflict policy + summarize"
```

### Task B4: Route `POST /api/res-pairing/generate`

**Files:**
- Create: `live-server/src/routes/res-pairing/res-pairing.ts`
- Modify: register the route where other routes are registered (search `app.register` / route index, e.g. `live-server/src/routes/index.ts` or `app.ts`).
- Test: `live-server/src/routes/res-pairing/__tests__/res-pairing-route.test.ts`

**Interfaces:**
- Consumes: `generate` (B3); Zod for body validation.
- Produces: `POST /api/res-pairing/generate` → `{ code, data: { created, skipped, summary }, message }` (project envelope).

- [ ] **Step 1: Write the failing route test (dryRun path)**

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { buildTestApp } from '../../../test/build-test-app' // use the project's existing harness

describe('POST /api/res-pairing/generate', () => {
  let app: any
  beforeAll(async () => { app = await buildTestApp() })
  it('dryRun returns a grouped summary without writing', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/res-pairing/generate',
      headers: { authorization: `Bearer ${app.testToken}` },
      payload: { division: 'P', conflictPolicy: 'skip', dryRun: true,
        cells: [{ date: '2026-06-01', base: 'YVR', timing: 'AM', composition: [{ rank: 'CA', plan: 5 }] }] } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.summary[0]).toMatchObject({ base: 'YVR', rank: 'CA', timing: 'AM', days: 1, slots: 5 })
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd live-server && npx vitest run src/routes/res-pairing/__tests__/res-pairing-route.test.ts`
Expected: FAIL (404 — route not registered).

- [ ] **Step 3: Implement the route + register it**

```ts
// res-pairing.ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { generate } from '../../services/res-pairing/res-pairing-service'

const cellSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), base: z.string().min(3).max(3),
  timing: z.enum(['AM', 'PM']),
  window: z.object({ start: z.string(), end: z.string() }).optional(),
  composition: z.array(z.object({ rank: z.string(), plan: z.number().int().min(0) })),
})
const genSchema = z.object({
  division: z.enum(['P', 'C']), conflictPolicy: z.enum(['skip', 'overwrite', 'add']),
  cells: z.array(cellSchema).min(1), dryRun: z.boolean().optional(),
})

export default async function resPairingRoutes(fastify: FastifyInstance) {
  fastify.post('/api/res-pairing/generate', async (req, reply) => {
    const input = genSchema.parse(req.body)
    const username = (req.user as any)?.userCode ?? 'system'
    const data = await generate(fastify, input, username)
    return reply.send({ code: 0, data, message: 'ok' })
  })
}
```

Register in `live-server/src/index.ts` next to `server.register(pairingRoutes)` (~line 138): `await server.register(resPairingRoutes)`. (Routes register in `index.ts`, not `app.ts`.)

> Test harness note: there is no `buildTestApp` in this repo. If no existing route uses an app-injection harness, drop the inject-based route test and instead unit-test `generate(...)` with `dryRun:true` against a mocked `fastify.db` (follow `src/services/crew-memo/crew-memo-service.test.ts` for the db-mock pattern), asserting the `summary` shape.

- [ ] **Step 4: Run the route test, verify pass**

Run: `cd live-server && npx vitest run src/routes/res-pairing/__tests__/res-pairing-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/routes/res-pairing/ live-server/src/app.ts
git commit -m "feat(res): POST /api/res-pairing/generate route"
```

---

## Phase C — Backend: batch modify & delete

### Task C1: Batch modify endpoint (TDD)

**Files:**
- Modify: `live-server/src/services/res-pairing/res-pairing-service.ts` (add `batchUpdate`)
- Modify: `live-server/src/routes/res-pairing/res-pairing.ts` (add `PATCH /api/res-pairing/batch`)
- Test: `live-server/src/services/res-pairing/__tests__/res-pairing-batch.test.ts`

**Interfaces:**
- Produces: `batchUpdate(fastify, { ids, plan?, window? }, username): Promise<{ updated: number }>` — updates `pairing_composition.plan` per rank and/or recomputes `sch_*`/segment times from a new window.

- [ ] **Step 1: Write a failing unit test for the window→times recompute helper**

```ts
import { describe, it, expect } from 'vitest'
import { recomputeWindowTimes } from '../res-pairing-service'

describe('recomputeWindowTimes', () => {
  it('recomputes UTC start/end for a new window in base tz', () => {
    const r = recomputeWindowTimes('2026-06-01', { start: '09:00', end: '21:00' }, 'America/Vancouver')
    expect(r.schStrDtUtc.toISOString()).toBe('2026-06-01T16:00:00.000Z')
    expect(r.schEndDtUtc.toISOString()).toBe('2026-06-02T04:00:00.000Z')
    expect(r.durationDays).toBe(1)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd live-server && npx vitest run src/services/res-pairing/__tests__/res-pairing-batch.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `recomputeWindowTimes` + `batchUpdate` + route**

```ts
export const recomputeWindowTimes = (date: string, window: { start: string; end: string }, zoneId: string) => {
  const [y, mo, d] = date.split('-').map(Number)
  const [sh, sm] = window.start.split(':').map(Number)
  const [eh, em] = window.end.split(':').map(Number)
  const crosses = (eh * 60 + em) <= (sh * 60 + sm)
  return {
    schStrDtUtc: localWallTimeToUtc(y, mo, d, sh, sm, zoneId),
    schEndDtUtc: localWallTimeToUtc(y, mo, crosses ? d + 1 : d, eh, em, zoneId),
    durationDays: crosses ? 2 : 1,
  }
}

export const batchUpdate = async (
  fastify: any, body: { ids: number[]; plan?: { rank: string; value: number }[]; window?: { start: string; end: string } }, username: string,
) => {
  let updated = 0
  await fastify.db.transaction(async (tx: any) => {
    for (const id of body.ids) {
      if (body.plan) for (const p of body.plan) {
        await tx.update(pairingComposition).set({ plan: p.value, updatedBy: username })
          .where(and(eq(pairingComposition.pairingId, id), eq(pairingComposition.actingRank, p.rank), eq(pairingComposition.isDeleted, 0)))
      }
      if (body.window) {
        const [pr] = await tx.select({ base: pairing.base, dt: pairing.pairingDt }).from(pairing).where(eq(pairing.id, id))
        const zoneId = (await loadResConfig(fastify, 'P')).zoneByBase ? await (await loadResConfig(fastify, 'P')).zoneByBase(pr.base) : 'UTC'
        const t = recomputeWindowTimes(String(pr.dt), body.window, zoneId)
        await tx.update(pairing).set({ schStrDtUtc: t.schStrDtUtc, schEndDtUtc: t.schEndDtUtc, durationDays: t.durationDays, updatedBy: username }).where(eq(pairing.id, id))
        await tx.update(pairingSegment).set({ schStrDtUtc: t.schStrDtUtc, schEndDtUtc: t.schEndDtUtc, dutySchStrDtUtc: t.schStrDtUtc, dutySchEndDtUtc: t.schEndDtUtc, updatedBy: username }).where(eq(pairingSegment.pairingId, id))
      }
      updated++
    }
  })
  await fastify.pairingService?.invalidateListCache?.(fastify)
  return { updated }
}
```

Route:

```ts
fastify.patch('/api/res-pairing/batch', async (req, reply) => {
  const schema = z.object({ ids: z.array(z.number()).min(1),
    plan: z.array(z.object({ rank: z.string(), value: z.number().int().min(0) })).optional(),
    window: z.object({ start: z.string(), end: z.string() }).optional() })
  const body = schema.parse(req.body)
  const data = await (await import('../../services/res-pairing/res-pairing-service')).batchUpdate(fastify, body, (req.user as any)?.userCode ?? 'system')
  return reply.send({ code: 0, data, message: 'ok' })
})
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd live-server && npx vitest run src/services/res-pairing/__tests__/res-pairing-batch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/res-pairing/ live-server/src/routes/res-pairing/
git commit -m "feat(res): batch modify plan/window endpoint"
```

### Task C2: Batch delete with 409 guard (reuse pairing-service.remove)

**Files:**
- Modify: `res-pairing-service.ts` (add `batchDelete`), `res-pairing.ts` (add `POST /api/res-pairing/batch-delete`)
- Test: `live-server/src/services/res-pairing/__tests__/res-pairing-delete.test.ts`

**Interfaces:**
- Consumes: existing `pairing-service.remove(fastify, id)` (throws/returns 409 when `roster_flight` references the pairing).
- Produces: `batchDelete(fastify, ids): Promise<{ deleted: number; blocked: { id: number; reason: string }[] }>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
import * as svc from '../res-pairing-service'

describe('batchDelete', () => {
  it('collects blocked ids when remove throws a 409', async () => {
    const remove = vi.fn()
      .mockResolvedValueOnce(undefined)                       // id 1 ok
      .mockRejectedValueOnce(Object.assign(new Error('crew assigned'), { statusCode: 409 })) // id 2 blocked
    const fastify: any = { pairingService: { remove } }
    const res = await svc.batchDelete(fastify, [1, 2])
    expect(res.deleted).toBe(1)
    expect(res.blocked).toEqual([{ id: 2, reason: 'crew assigned' }])
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd live-server && npx vitest run src/services/res-pairing/__tests__/res-pairing-delete.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `batchDelete` + route**

```ts
export const batchDelete = async (fastify: any, ids: number[]) => {
  let deleted = 0; const blocked: { id: number; reason: string }[] = []
  for (const id of ids) {
    try { await fastify.pairingService.remove(fastify, id); deleted++ }
    catch (e: any) { blocked.push({ id, reason: e?.message ?? 'blocked' }) }
  }
  return { deleted, blocked }
}
```

Route:

```ts
fastify.post('/api/res-pairing/batch-delete', async (req, reply) => {
  const { ids } = z.object({ ids: z.array(z.number()).min(1) }).parse(req.body)
  const data = await (await import('../../services/res-pairing/res-pairing-service')).batchDelete(fastify, ids)
  return reply.send({ code: 0, data, message: 'ok' })
})
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd live-server && npx vitest run src/services/res-pairing/__tests__/res-pairing-delete.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/res-pairing/ live-server/src/routes/res-pairing/
git commit -m "feat(res): batch delete with 409 guard"
```

---

## Phase D — Frontend: capability, button, dialog scaffold

### Task D1: Add `canCreateRes` capability + Live-only button

**Files:**
- Modify: `gantt/src/components/gantt/source/gantt-pane-source.ts` (add `canCreateRes` to `PairingPaneSource` capabilities or as an optional flag)
- Modify: `gantt/src/components/gantt/source/live-gantt-source.ts` (set `canCreateRes: true`)
- Modify: `gantt/src/components/panes/pane-condition-strip.tsx` (render the button when `onResPairingClick` provided)
- Modify: `gantt/src/components/panes/shared/pairing-pane.tsx` or `gantt/src/components/panes/pairing-pane.tsx` (wire the handler when capability true)
- Test: `e2e/tests/gantt/res-pairing-button.spec.ts`

**Interfaces:**
- Produces: `PairingPaneSource.capabilities.canCreateRes?: boolean`; `PaneConditionStripProps.onResPairingClick?: () => void`; opens the dialog via a new `useResPlannerStore.getState().open()`.

- [ ] **Step 1: Write the failing e2e (button visible on Live pairing pane, absent on Scenario)**

```ts
import { test, expect } from '@playwright/test'
import { gotoGantt } from '../../utils/gantt-hook'

test('Live-1400: RES button shows on Live pairing pane', async ({ page }) => {
  await gotoGantt(page)
  await page.getByTestId('module-nav-live').click()
  await expect(page.getByTestId('res-pairing-button')).toBeVisible()
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/res-pairing-button.spec.ts --reporter=list`
Expected: FAIL (testid not found).

- [ ] **Step 3: Add capability, button, wiring**

In `gantt-pane-source.ts` extend the pairing capabilities type with `canCreateRes?: boolean`. In `live-gantt-source.ts` set it true on the pairing source. In `pane-condition-strip.tsx` add to the action cluster:

```tsx
{onResPairingClick && (
  <button data-testid="res-pairing-button" title="RES Pairing Creator"
    className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground active:scale-95"
    onClick={onResPairingClick}>
    <ShieldPlus className="h-3 w-3" />
  </button>
)}
```

In the pairing pane wrapper:

```tsx
const source = useGanttSource()
const canCreateRes = !!source.pairing?.capabilities?.canCreateRes
// pass to PaneConditionStrip:
onResPairingClick={canCreateRes ? () => useResPlannerStore.getState().open() : undefined}
```

- [ ] **Step 4: Run the e2e, verify pass**

Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/res-pairing-button.spec.ts --reporter=list`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components e2e/tests/gantt/res-pairing-button.spec.ts
git commit -m "feat(res): Live-only RES button in pairing pane toolbar"
```

### Task D2: `res-planner-store` + `ResPairingPlannerDialog` shell

**Files:**
- Create: `gantt/src/stores/res-planner-store.ts`
- Create: `gantt/src/components/res-pairing/res-pairing-planner-dialog.tsx`
- Modify: mount the dialog once in the Live layout (e.g. `app-layout.tsx`)
- Test: `e2e/tests/gantt/res-pairing-dialog.spec.ts`

**Interfaces:**
- Produces: `useResPlannerStore` with `{ open(): void; close(): void; isOpen: boolean; tab: 'define'|'review'|'manage'; setTab(t): void; division; focusBase; dateRange; cells; ... }`; `ResPairingPlannerDialog` rendering an `AppDialog` with the 3 header tabs and a `data-testid="res-planner-dialog"`.

- [ ] **Step 1: Write the failing e2e (clicking the button opens the dialog with 3 tabs)**

```ts
test('Live-1401: RES button opens planner dialog', async ({ page }) => {
  await gotoGantt(page)
  await page.getByTestId('module-nav-live').click()
  await page.getByTestId('res-pairing-button').click()
  await expect(page.getByTestId('res-planner-dialog')).toBeVisible()
  await expect(page.getByText('Review & Generate')).toBeVisible()
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/res-pairing-dialog.spec.ts --reporter=list`
Expected: FAIL.

- [ ] **Step 3: Implement store + dialog shell**

Create a Zustand store mirroring the interactive mockup's `state` (division, focusBase, selMode, dow, days, brush, data/cells, windows). Build `ResPairingPlannerDialog` with `AppDialog` (icon `Calendar`, title "RES Pairing Planner", footer per tab) and three tab panels (`DefineWorkspace`, `ReviewGenerate`, `ManageExisting` — stubs for now).

- [ ] **Step 4: Run the e2e, verify pass**

Run: same as Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/res-planner-store.ts gantt/src/components/res-pairing/ e2e/tests/gantt/res-pairing-dialog.spec.ts
git commit -m "feat(res): planner dialog shell + store"
```

---

## Phase E — Frontend: Define workspace (port the interactive mockup)

### Task E1: `DefineWorkspace` component (calendar + entry panel)

**Files:**
- Create: `gantt/src/components/res-pairing/define-workspace.tsx`
- Create: `gantt/src/components/res-pairing/res-calendar.tsx`
- Create: `gantt/src/components/res-pairing/res-entry-panel.tsx`
- Reference: `docs/mockups/res-pairing-creator/02-define-workspace.html` (the proven interactive behavior + data model)
- Test: `e2e/tests/gantt/res-define-workspace.spec.ts`

**Interfaces:**
- Consumes: `useResPlannerStore`; `/api/base`, ranks-in-use, `RES_CALL_TYPE` config.
- Produces: a working Define tab where base focus filters calendar + matrix, division swaps ranks (CA/FO ↔ IFD/FA), day/range/day-of-week selection + Apply fills cells (writes into `store.cells`).

- [ ] **Step 1: Write the failing e2e (base focus filters the matrix)**

```ts
test('Live-1402: focusing YVR filters the entry matrix to YVR only', async ({ page }) => {
  await gotoGantt(page)
  await page.getByTestId('module-nav-live').click()
  await page.getByTestId('res-pairing-button').click()
  await page.getByTestId('res-base-YVR').click()
  await expect(page.getByTestId('res-matrix-base-YVR')).toBeVisible()
  await expect(page.getByTestId('res-matrix-base-YEG')).toHaveCount(0)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/res-define-workspace.spec.ts --reporter=list`
Expected: FAIL.

- [ ] **Step 3: Implement the three components**

Port the mockup's render logic into React using Tailwind tokens (no magic font sizes). Drive everything from the store. Add `data-testid` hooks: `res-base-<code>`, `res-div-<P|C>`, `res-mode-<day|range|dow>`, `res-dow-<n>`, `res-matrix-base-<code>`, `res-cell-<YYYY-MM-DD>`, `res-apply`. Selecting + Apply mutates `store.cells`.

- [ ] **Step 4: Run the e2e, verify pass**

Run: same as Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/res-pairing/ e2e/tests/gantt/res-define-workspace.spec.ts
git commit -m "feat(res): Define workspace (calendar + entry panel)"
```

### Task E2: Apply fills the calendar (regression test)

**Files:**
- Modify: `define-workspace.tsx` / `res-entry-panel.tsx` as needed
- Test: extend `e2e/tests/gantt/res-define-workspace.spec.ts`

- [ ] **Step 1: Write the failing assertion**

```ts
test('Live-1403: Apply fills selected days with CA/FO values', async ({ page }) => {
  await gotoGantt(page); await page.getByTestId('module-nav-live').click()
  await page.getByTestId('res-pairing-button').click()
  await page.getByTestId('res-base-YVR').click()
  await page.getByTestId('res-mode-dow').click()
  await page.getByTestId('res-dow-1').click() // Mondays
  await page.getByTestId('res-apply').click()
  await expect(page.getByTestId('res-cell-2026-06-01')).toContainText('CA')
})
```

- [ ] **Step 2: Run it, verify it fails (or passes if E1 already covers it; if it passes, tighten the assertion to a specific value)**

Run: same config as E1.
Expected: FAIL until Apply writes cells and the calendar re-renders.

- [ ] **Step 3: Implement Apply → cells → calendar re-render**

- [ ] **Step 4: Run, verify pass** — same command, Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(res): Apply fills calendar cells (regression-guarded)"
```

---

## Phase F — Frontend: Review & Generate + post-generate (requirement #8)

### Task F1: `ReviewGenerate` + `res-api.generate`

**Files:**
- Create: `gantt/src/services/res-api.ts`
- Create: `gantt/src/components/res-pairing/review-generate.tsx`
- Test: `e2e/tests/gantt/res-generate.spec.ts`

**Interfaces:**
- Produces: `resApi.generate(input): Promise<{ created; skipped; summary }>`; `resApi.batchUpdate`, `resApi.batchDelete`; a Review tab showing the grouped summary + conflict policy + a Generate button (`data-testid="res-generate"`).

- [ ] **Step 1: Write the failing e2e (generate → pane shows PRAM/PRPM + filter applied)** — drives the REAL UI per §Simulate-User

```ts
test('Live-1404: generate creates RES pairings and pane filters to PRAM/PRPM', async ({ page }) => {
  await gotoGantt(page); await page.getByTestId('module-nav-live').click()
  await page.getByTestId('res-pairing-button').click()
  await page.getByTestId('res-base-YVR').click()
  await page.getByTestId('res-mode-dow').click(); await page.getByTestId('res-dow-1').click()
  await page.getByTestId('res-apply').click()
  await page.getByText('Review & Generate').click()
  await page.getByTestId('res-generate').click()
  // post-generate: pairing pane shows the new RES pairings with the Type filter active
  await expect(page.getByTestId('pairing-filter-chip-PRAM')).toBeVisible()
  await expect(page.getByTestId('pairing-pane')).toContainText('PRAM-1000-2200')
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/res-generate.spec.ts --reporter=list`
Expected: FAIL.

- [ ] **Step 3: Implement `res-api.ts`, Review tab, and the post-generate hook**

`resApi` uses a dedicated `axios.create()` (NOT the shared http-client — the response body contains a `code` field; see playbook §13d). On Generate success: call the pairing source's refetch (bust + reload) and set `PairingFilter.assignments = generatedCodes` via the per-context filter store (`useFilterStoreForContext`), then `applyGanttFilters()`. Close the dialog or switch to a result view.

- [ ] **Step 4: Run the e2e, verify pass** — same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/services/res-api.ts gantt/src/components/res-pairing/review-generate.tsx e2e/tests/gantt/res-generate.spec.ts
git commit -m "feat(res): generate + post-generate pane refresh & PRAM/PRPM filter"
```

---

## Phase G — Frontend: Manage existing

### Task G1: `ManageExisting` tab (list + batch modify/delete)

**Files:**
- Create: `gantt/src/components/res-pairing/manage-existing.tsx`
- Test: `e2e/tests/gantt/res-manage.spec.ts`

**Interfaces:**
- Consumes: `GET /api/pairing?assignments=PRAM,PRPM&…`; `resApi.batchUpdate`, `resApi.batchDelete`.
- Produces: a filterable, multi-select table with batch Modify (plan/window) and batch Delete (shows blocked 409 rows).

- [ ] **Step 1: Write the failing e2e (modify plan reflects after reload)**

```ts
test('Live-1405: batch-modify a RES pairing plan value', async ({ page }) => {
  await gotoGantt(page); await page.getByTestId('module-nav-live').click()
  await page.getByTestId('res-pairing-button').click()
  await page.getByText('Manage existing').click()
  await page.getByTestId('res-row-checkbox-0').check()
  await page.getByTestId('res-modify').click()
  await page.getByTestId('res-modify-CA').fill('6')
  await page.getByTestId('res-modify-apply').click()
  await expect(page.getByTestId('res-row-0')).toContainText('6')
})
```

- [ ] **Step 2: Run it, verify it fails** — same config. Expected: FAIL.

- [ ] **Step 3: Implement the Manage tab**

- [ ] **Step 4: Run, verify pass** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/res-pairing/manage-existing.tsx e2e/tests/gantt/res-manage.spec.ts
git commit -m "feat(res): manage existing RES (batch modify/delete)"
```

---

## Phase H — Finalize

### Task H1: Version bump + UI gate

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Bump versions** — `FRONTEND_VERSION +1`, `BACKEND_VERSION +1` (never reuse/lower).
- [ ] **Step 2: Run UI gate**

Run: `npm run check:ui`
Expected: 0 hard violations. Paste the PASS.

- [ ] **Step 3: Commit**

```bash
git commit -am "chore(res): version bump + ui gate"
```

### Task H2: Full test sweep + docs + skill

**Files:**
- Modify: `docs/modules/gantt/live-scenario-gantt-playbook.md` (add a RES Pairing section)
- Create: skill `~/.claude/skills/<n>-res-pairing-management/SKILL.md`

- [ ] **Step 1: Run backend tests**

Run: `cd live-server && npx vitest run src/services/res-pairing src/routes/res-pairing src/utils/__tests__/zoned-time.test.ts`
Expected: all PASS. Paste the summary.

- [ ] **Step 2: Run the e2e suite**

Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/res-*.spec.ts --reporter=list`
Expected: all PASS. Paste the summary.

- [ ] **Step 3: Update playbook + write the skill** (how to define/generate/manage RES, the dictionary params, the endpoints, the e2e recipe). Add to `MEMORY.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/ ~/.claude/skills/
git commit -m "docs(res): playbook section + res-pairing-management skill"
```

---

## Self-Review

**Spec coverage:** Entry button (D1) · combined Define workspace (E1/E2) · base/rank/AM-PM/plan (E1) · AM/PM windows (E1) · batch day/range/day-of-week (E1) · date range default (E1, store init) · generate + overview (F1) · backend row creation (B2/B3) · tz conversion (B1) · conflict policy (B3) · pane refresh + PRAM/PRPM filter (F1) · manage modify/delete + 409 (C1/C2/G1) · parameterization (A1) · Live-only capability (D1) · version/gate/skill (H1/H2). All spec sections map to a task.

**Open confirmation before execution:** Decision **D3** (proper base-local→UTC conversion vs. matching the legacy no-conversion rows) — the plan implements conversion (B1/B2); if the user chooses legacy behavior, replace `localWallTimeToUtc(...)` with a direct `Date.UTC(...)` in `buildPairingRow`/`recomputeWindowTimes` and update the B1/B2 test expectations.

**Placeholder scan:** backend tasks carry full code; frontend port tasks reference the proven interactive mockup as the spec for behavior and list exact testids/files (no "implement later").

**Type consistency:** `ResCell`, `GenerateInput`, `ResSummaryRow`, `buildPairingRow`, `summarize`, `generate`, `batchUpdate`, `recomputeWindowTimes`, `batchDelete` are used consistently across B/C/F. Capability `canCreateRes` and testid `res-pairing-button` consistent across D/E/F.
