# Scenario Gantt: Read From DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Serve the scenario Gantt from the database instead of parsing optimizer gz files on every open — frontend and API response shape unchanged.

**Architecture:** A scenario resolves three datasets by **partition pointers** on its `scenario` row: pairings via `pairing_scenario_id`, flights via `flight_scenario_id`, roster via the scenario's own `id`. **Partition `0` = live** (read from `f8.*`); non-zero = a frozen copy in the `scenario` schema. A new partition-aware `buildGanttDataFromDb(scenarioId)` assembles the exact `ScenarioGanttData` the gz path produces. A source flag (`SCENARIO_GANTT_SOURCE` = `gz`|`db`) routes the endpoints, default `gz` until parity is proven, then flipped.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, node-postgres, Vitest, Playwright. Dev DB: `postgresql://f8:Pier2026AIf8@47.253.173.207:55432/rois` (live data in schema `f8`, copies/roster/manday in schema `scenario`). live-server connects with `search_path=f8`, so unqualified table names = `f8.*`; copies are addressed as `scenario.*`.

---

## CURRENT STATE — read before starting (all built/verified in the 2026-06-15 session)

### The partition model
A `scenario` row points at which copy of each dataset to use:

| dataset | partition key column | scenario row column | `0` means |
|---|---|---|---|
| pairing (+ `pairing_segment` + `pairing_composition`) | `scenario_id` | `pairing_scenario_id` | live `f8.pairing` (scenario_id=0) |
| flight (+ `flight_composition`) | `sch_id` | `flight_scenario_id` | live `f8.flight` (sch_id=0) |
| `roster_flight` | `scenario_id` | the scenario's own `id` | n/a (roster is always scenario-scoped) |

Resolution for a query: `table = (pointer === 0) ? 'f8.<t>' : 'scenario.<t>'`, then `WHERE <partCol> = <pointer>`. Because live `f8.*` rows are all `scenario_id/sch_id = 0`, the same `WHERE <partCol> = <pointer>` works against either schema.

### Tables that EXIST now (do not recreate)
- `scenario.roster_flight` — `scenario_id`-scoped, composite-unique on `(scenario_id, …)`.
- `scenario.crew_manday_{fd,cc_am}_{daily,monthly,yearly}` — `scenario_id`-scoped unique indexes.
- `scenario.pairing`, `scenario.pairing_segment`, `scenario.pairing_composition` — created `LIKE f8.*`, **composite PK `(scenario_id, id)`**, ids preserved from live.
- `scenario.flight`, `scenario.flight_composition` — `LIKE f8.*`, **composite PK `(sch_id, id)`**; `sch_id` column was added to `flight_composition` so the flight family is uniformly keyed by `sch_id`.
- Live `f8.roster_flight.scenario_id`, `f8.pairing.scenario_id`, `f8.flight.sch_id` all exist and are uniformly `0`.

### Data loaded now
- `scenario.roster_flight`: partitions **6** (1551 rows), **459** (1638), **460** (1638).
- `scenario.crew_manday_*`: partitions 6 / 459 / 460 (fd only — these scenarios are all division P; cc_am empty).
- `scenario.pairing` (+segment+comp): partition **405** = live **Apr 1–Jul 30 2026** (8736 pairings; widened from May–Jun to cover June scenarios' lead-in/out).
- `scenario.flight` (+comp): partition **456** = live Apr–Jul 2026 (4534 flights; `flight_composition` is 0 because `f8.flight_composition` is empty in dev).

### Scenario pointers set (the two read paths to support + test)
| # | status | pairing_scenario_id | flight_scenario_id | exercises |
|---|---|---|---|---|
| 6 | DONE | 0 | 0 | **live-backed** read path |
| 459 | FAILED* | 0 | 0 | live-backed |
| 460 | FAILED* | **405** | **456** | **copy-backed** read path (182/182 pairing coverage) |
| 462 | DONE | 0 | 0 | "LIVE (baseline)" registry row |
| 463 | DRAFT | 405 | 456 | "WS444" demo (no roster loaded) |

\*459/460 show `FAILED`/null `task_id` in the dev DB because their real runs completed against **CoreServer's** DB, not this one — see the dev/CoreServer split note in Task 7. Their roster/manday were loaded directly. **For DB-source rendering, gate on the presence of `scenario.roster_flight` rows, not on `status`/`task_id`.**

### The read path today (being replaced)
- `live-server/src/routes/scenario/scenario.ts`: `GET /:id/roster` (~line 369, `parseAssignments`), `GET /:id/gantt-data` (~line 528, `buildGanttDataSnapshot`/`buildGanttDataLiveRefresh`).
- `buildGanttDataSnapshot` (`scenario-gantt-service.ts:453`) parses input.gz+output.gz into **`ScenarioGanttData`** (interface `scenario-gantt-service.ts:95-117`; sub-interfaces `ScenarioGanttCrew/Pairing/CompositionSlot/Assignment/PairingSegment/Flight/GroundItem` + `ScenarioMonthStats`, same file).
- `computeScenarioCrewStats` (`scenario-crew-stats-service.ts`) → `crewStats: Record<crewId, Record<'YYYY-MM', ScenarioMonthStats>>`, `ScenarioMonthStats = {credit, dayOffCount, alCount, leaveCount}` (credit in minutes).
- **Frontend consumes only `ScenarioGanttData` — do not change it.**

### Field → DB mapping (partition-aware)
| ScenarioGanttData field | source |
|---|---|
| `assignments[]` | `scenario.roster_flight` WHERE `scenario_id=<id> AND pairing_id IS NOT NULL AND is_deleted=0`, DISTINCT `(crew_id,pairing_id,source)`; `source`: `'leadin'`→`'leadin'` else `'CR'`. |
| `groundItems[]` | `scenario.roster_flight` WHERE `scenario_id=<id> AND pairing_id IS NULL AND is_deleted=0` → `{crewId, assignmentGroup, assignment, schStrDtUtc, schEndDtUtc, actingRank: flight_acting_rank, source, actCreditedMinutes}`. |
| `pairings[]` | `<pairingTable> WHERE scenario_id=<pairing_scenario_id> AND id = ANY(referencedPairingIds) AND is_deleted=0`; `compositions` from `<pairingCompTable>` same partition. |
| `pairingSegments[]` | `<segTable> WHERE scenario_id=<pairing_scenario_id> AND pairing_id = ANY(referencedPairingIds) AND is_deleted=0`. Self-contained (own dep/arv/times/flt_num). |
| `flights[]` | `<flightTable> WHERE sch_id=<flight_scenario_id>` within the canvas date window. **NOT** joined to segments (see linkage note). |
| `crew[]` | always live: `f8.crew` + latest-eff `f8.crew_base` + `f8.crew_rank` for `crew_id = ANY(distinct roster crew_ids)`. |
| `crewStats` | `scenario.crew_manday_{fd,cc_am}_monthly` WHERE `scenario_id=<id>`. |
| dates / `fileType` / `leadinLive` / `scenarioName` / `capabilities` | scenario metadata row. `dataSource:'db'`. |

### CRITICAL linkage facts (verified — do not re-assume)
- **`pairing_segment.flt_id` is NULL** in both live and copies, and `roster_flight.flt_id = 0`. **Never join segment→flight by `flt_id`.** Segments carry their own `flt_num`/`dep_arp`/`arv_arp`/`sch_*` and are self-sufficient for rendering. The gz `## flight` section is an **unrelated** flight set (≈0 flt_num overlap with segments) — so `flights[]` is an independent dataset, not derived from segments.
- `roster_flight.pairing_id` → pairing `id` resolves 100% within the chosen partition (verified: 6/459 in live, 460 in partition 405 = 182/182).
- **Timestamp gotcha:** scenario `timestamp`-without-tz columns hold UTC wall-clock; node-pg reinterprets as machine-local. Read them as text via `to_char(col,'YYYY-MM-DD"T"HH24:MI:SS')` and append `Z`. (See `live-server/scripts/ruletool.mjs` `asUtc`.)

### Loaders that exist (productionize in Task 7)
- `live-server/scripts/load-scenario-roster.mjs <sid> <in.gz> <out.gz>` → `scenario.roster_flight`.
- `live-server/scripts/ruletool.mjs <sid> gz|roster|compare <in.gz> <out.gz>` → `scenario.crew_manday_*` (7502/8002 credit via Rust bin `rule-engine-rs/target/release/ruletool`).

### Version
Backend already at **B123 / R34** this session.

---

## File Structure
- **Create** `live-server/src/services/scenario/scenario-partition.ts` — `resolvePartitions(sc)` → table+partition descriptors.
- **Create** `live-server/src/services/scenario/scenario-gantt-db-service.ts` — `buildGanttDataFromDb` + `computeScenarioCrewStatsFromDb`.
- **Modify** `live-server/src/services/scenario/scenario-gantt-service.ts` — widen `ScenarioGanttData.dataSource` to include `'db'`.
- **Modify** `live-server/src/routes/scenario/scenario.ts` — source switch on `/gantt-data` + `/roster`.
- **Create** `live-server/src/services/scenario/scenario-result-loader.ts` — TS port of the two `.mjs` loaders.
- **Modify** `live-server/src/services/scenario/scenario-result-service.ts` — call loader on DONE.
- **Modify** `live-server/src/config/env.ts` — `SCENARIO_GANTT_SOURCE`.
- **Create** tests: `…/__tests__/scenario-gantt-db-service.test.ts`, `…/__tests__/scenario-partition.test.ts`, `e2e/tests/gantt/scenario/scenario-db-source.spec.ts`.
- **Modify** `gantt/src/version.ts` — bump `BACKEND_VERSION`.

---

## Task 1: `SCENARIO_GANTT_SOURCE` flag

**Files:** Modify `live-server/src/config/env.ts`.

- [ ] **Step 1:** Add to the Zod schema: `SCENARIO_GANTT_SOURCE: z.enum(['gz', 'db']).default('gz'),`
- [ ] **Step 2:** Run `cd live-server && npx tsc --noEmit` → no new errors.
- [ ] **Step 3:** Commit: `git commit -am "feat(scenario): add SCENARIO_GANTT_SOURCE flag"`

---

## Task 2: Partition resolver

**Files:** Create `live-server/src/services/scenario/scenario-partition.ts`; Test `…/__tests__/scenario-partition.test.ts`.

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect } from 'vitest'
import { resolvePartitions } from '../scenario-partition.js'

it('routes partition 0 to f8 (live) and non-zero to scenario schema', () => {
  const live = resolvePartitions({ id: 6, pairingScenarioId: 0, flightScenarioId: 0 })
  expect(live.pairingTable).toBe('f8.pairing')
  expect(live.pairingPart).toBe(0)
  expect(live.flightTable).toBe('f8.flight')
  const copy = resolvePartitions({ id: 460, pairingScenarioId: 405, flightScenarioId: 456 })
  expect(copy.pairingTable).toBe('scenario.pairing')
  expect(copy.segmentTable).toBe('scenario.pairing_segment')
  expect(copy.pairingPart).toBe(405)
  expect(copy.flightTable).toBe('scenario.flight')
  expect(copy.flightPart).toBe(456)
})
```

- [ ] **Step 2:** Run `cd live-server && npx vitest run src/services/scenario/__tests__/scenario-partition.test.ts` → FAIL.
- [ ] **Step 3: Implement**

```typescript
export interface ScenarioPointers { id: number; pairingScenarioId: number; flightScenarioId: number }
export interface ResolvedPartitions {
  rosterPart: number
  pairingTable: string; segmentTable: string; compositionTable: string; pairingPart: number
  flightTable: string; flightCompTable: string; flightPart: number
}
export function resolvePartitions(sc: ScenarioPointers): ResolvedPartitions {
  const p = sc.pairingScenarioId ?? 0
  const f = sc.flightScenarioId ?? 0
  const pSchema = p === 0 ? 'f8' : 'scenario'
  const fSchema = f === 0 ? 'f8' : 'scenario'
  return {
    rosterPart: sc.id,
    pairingTable: `${pSchema}.pairing`, segmentTable: `${pSchema}.pairing_segment`,
    compositionTable: `${pSchema}.pairing_composition`, pairingPart: p,
    flightTable: `${fSchema}.flight`, flightCompTable: `${fSchema}.flight_composition`, flightPart: f,
  }
}
```
NOTE: `f8.flight_composition` has no `sch_id`; only `scenario.flight_composition` does. `flightCompTable` is only used when `flightPart !== 0`, so that's fine. Guard any `flight_composition` query with `if (flightPart !== 0)`.

- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(scenario): partition resolver`.

---

## Task 3: `computeScenarioCrewStatsFromDb`

**Files:** Create `scenario-gantt-db-service.ts`; Test `…/__tests__/scenario-gantt-db-service.test.ts`.

- [ ] **Step 1: Test** (scenario 6 has 26 crew loaded)

```typescript
import pg from 'pg'; import { drizzle } from 'drizzle-orm/node-postgres'
import { computeScenarioCrewStatsFromDb } from '../scenario-gantt-db-service.js'
const DB='postgresql://f8:Pier2026AIf8@47.253.173.207:55432/rois'
let client: pg.Client, db: ReturnType<typeof drizzle>
beforeAll(async()=>{client=new pg.Client({connectionString:DB});await client.connect();db=drizzle(client)})
afterAll(async()=>{await client.end()})
it('crewStats for scenario 6', async()=>{
  const s=await computeScenarioCrewStatsFromDb(db,6)
  expect(Object.keys(s).length).toBe(26)
  const m=Object.values(Object.values(s)[0])[0]
  expect(m).toHaveProperty('credit'); expect(typeof m.credit).toBe('number')
})
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implement**

```typescript
import { sql } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import type { ScenarioMonthStats } from './scenario-gantt-service.js'
type Db = ReturnType<typeof drizzle>
export async function computeScenarioCrewStatsFromDb(db: Db, scenarioId: number) {
  const out: Record<string, Record<string, ScenarioMonthStats>> = {}
  const put=(c:string,ym:string,credit:number,dayOff:number,al:number,leave:number)=>{ (out[c]??={})[ym]={credit,dayOffCount:dayOff,alCount:al,leaveCount:leave} }
  const fd=await db.execute<{crew_id:string;year_month:string;credit:string;is_day_off:string;is_al:string}>(sql`
    SELECT crew_id, year_month, credit, is_day_off, is_al FROM scenario.crew_manday_fd_monthly WHERE scenario_id=${scenarioId}`)
  for(const r of fd.rows) put(r.crew_id,r.year_month,Number(r.credit),Number(r.is_day_off),Number(r.is_al),0)
  const cc=await db.execute<{crew_id:string;year_month:string;credit:string;is_day_off:string;is_leave:string}>(sql`
    SELECT crew_id, year_month, credit, is_day_off, is_leave FROM scenario.crew_manday_cc_am_monthly WHERE scenario_id=${scenarioId}`)
  for(const r of cc.rows) put(r.crew_id,r.year_month,Number(r.credit),Number(r.is_day_off),0,Number(r.is_leave))
  return out
}
```

- [ ] **Step 4:** Run → PASS. **Step 5:** Commit.

---

## Task 4: `buildGanttDataFromDb` (partition-aware)

**Files:** Modify `scenario-gantt-db-service.ts` + `scenario-gantt-service.ts` (widen `dataSource` type to `'live-refresh'|'snapshot'|'db'`); Test same test file.

- [ ] **Step 1: Tests — BOTH paths** (live-backed 459, copy-backed 460)

```typescript
import { buildGanttDataFromDb } from '../scenario-gantt-db-service.js'
const meta=(id:number,p:number,f:number)=>({id,name:`s${id}`,strDtLoc:new Date('2026-06-01T07:00:00Z'),endDtLoc:new Date('2026-06-30T07:00:00Z'),leadinLive:0,fileType:'RO',pairingScenarioId:p,flightScenarioId:f})
it('assembles 459 from LIVE pairings (0/0)', async()=>{
  const d=await buildGanttDataFromDb(db, meta(459,0,0))
  expect(d.dataSource).toBe('db')
  const pids=new Set(d.pairings.map(p=>p.pairingId))
  for(const a of d.assignments) expect(pids.has(a.pairingId)).toBe(true) // 182/182
  expect(d.crew.length).toBe(26)
})
it('assembles 460 from COPY pairings (405/456)', async()=>{
  const d=await buildGanttDataFromDb(db, meta(460,405,456))
  const pids=new Set(d.pairings.map(p=>p.pairingId))
  for(const a of d.assignments) expect(pids.has(a.pairingId)).toBe(true) // 182/182 after widening 405
})
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implement** — assemble exactly per the mapping table, using `resolvePartitions(sc)`:
  - assignments/groundItems from `scenario.roster_flight WHERE scenario_id = sc.id` (timestamps via `to_char`+`Z`).
  - `referencedPairingIds = distinct assignments.pairingId`.
  - pairings from `${r.pairingTable} WHERE scenario_id=${r.pairingPart} AND id = ANY(referencedPairingIds) AND is_deleted=0`; compositions from `${r.compositionTable}` same partition.
  - pairingSegments from `${r.segmentTable} WHERE scenario_id=${r.pairingPart} AND pairing_id = ANY(referencedPairingIds) AND is_deleted=0` (map ALL fields per `ScenarioGanttPairingSegment`; `fltId` will be null — that's expected).
  - flights from `${r.flightTable} WHERE sch_id=${r.flightPart}` within `[deriveDateRange]` window (cap by date to avoid pulling the whole partition; `flights[]` is the Flight-pane dataset, not segment-joined).
  - crew from live `f8.crew`/`crew_base` (latest eff)/`crew_rank` for distinct roster crew_ids.
  - `crewStats = await computeScenarioCrewStatsFromDb(db, sc.id)`.
  - `deriveDateRange` (±7 days, copy from `scenario-gantt-service.ts:268`).
  - Mirror the **output shape** of `buildGanttDataSnapshot` (`scenario-gantt-service.ts:453`) field-for-field — every `ScenarioGanttData` property must be populated identically in TYPE to what the gz path emits (the frontend can't tell which source produced it). The only differences vs the gz path: table names come from `resolvePartitions(sc)` (not hard-coded), there is **no `flt_id`→flight join** (segments are self-contained; `flights[]` comes from `${r.flightTable} WHERE sch_id=${r.flightPart}` within the date window), and `dataSource='db'`. Build each section with `to_char(...)+'Z'` timestamp text (the gotcha above).

- [ ] **Step 4:** Run → PASS (both 459 and 460). **Step 5:** Commit.

---

## Task 5: Parity tests vs gz (both paths)

**Files:** Modify `…/__tests__/scenario-gantt-db-service.test.ts`.

- [ ] **Step 1:** For a loaded scenario with its gz available at `/tmp/sc<ID>/output.gz` (459 and 460 were fetched there; re-fetch via the engine result endpoint if absent), assert the **DB assignment set `(crewId|pairingId)` equals the gz `## ASSIGNMENTS` set**. Do this for 459 (live-backed) AND 460 (copy-backed). (Parse `## ASSIGNMENTS` inline as in the loaders.)
- [ ] **Step 2:** Run → PASS (or documented skip if gz absent). **Step 3:** Commit `test(scenario): DB↔gz assignment parity, live + copy paths`.

---

## Task 6: Route `/gantt-data` + `/roster` through the flag

**Files:** Modify `live-server/src/routes/scenario/scenario.ts`.

- [ ] **Step 1:** In `/:id/gantt-data`, when `env.SCENARIO_GANTT_SOURCE==='db'`, load the scenario row (incl. `pairing_scenario_id`, `flight_scenario_id`) and `return reply.send({code:200, data: await buildGanttDataFromDb(fastify.db, sc), message:'ok'})`. **Gate on `scenario.roster_flight` rows existing for the id, not on `status`/`task_id`** (459/460 are `FAILED` but have data). Keep the gz branch unchanged otherwise.
- [ ] **Step 2:** In `/:id/roster`, when db source, build assignments from `scenario.roster_flight` (DISTINCT crew/pairing) and run the SAME enrichment/published-marking block the gz path uses (factor it so both share it).
- [ ] **Step 3: Manual verify** (live-backed + copy-backed):
```bash
cd live-server && SCENARIO_GANTT_SOURCE=db npx tsx -e "import {buildGanttDataFromDb} from './src/services/scenario/scenario-gantt-db-service.js'; import pg from 'pg'; import {drizzle} from 'drizzle-orm/node-postgres'; const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();const db=drizzle(c); for(const m of [{id:459,p:0,f:0},{id:460,p:405,f:456}]){const d=await buildGanttDataFromDb(db,{id:m.id,name:'x',strDtLoc:new Date('2026-06-01T07:00:00Z'),endDtLoc:new Date('2026-06-30T07:00:00Z'),leadinLive:0,fileType:'RO',pairingScenarioId:m.p,flightScenarioId:m.f}); console.log(m.id,'assignments',d.assignments.length,'pairings',d.pairings.length,'crew',d.crew.length,'segments',d.pairingSegments.length)} await c.end()"
```
Expected: 459 and 460 both ~182 pairings, 26 crew, non-zero segments.
- [ ] **Step 4:** Commit.

---

## Task 7: Auto-load completed result into the scenario schema

**Files:** Create `scenario-result-loader.ts`; Modify `scenario-result-service.ts`.

- [ ] **Step 1:** Port `load-scenario-roster.mjs` + `ruletool.mjs` (gz mode) into `loadScenarioResultIntoDb(fastify,{scenarioId,taskId,token,airline})` — transcribe the `.mjs` logic verbatim (roster rows; manday via the Rust `ruletool` bin; `to_char`/`asUtc` UTC handling; per-grain column filtering — `fd_yearly` has no `is_al`). Also set the scenario row on success: `status='DONE'`, and **`pairing_scenario_id=0, flight_scenario_id=0`** (a freshly-run scenario uses the live pairing/flight it was optimized against; frozen copies are a separate, explicit action).
- [ ] **Step 2:** Call it from `saveResult` after `status==='DONE'` + `computeAndPersistKpis`, wrapped in `.catch` (non-fatal).
- [ ] **Step 3:** Test with scenario 460's gz at `/tmp/sc460/` against a throwaway `scenario_id` (e.g. 999990), assert roster + `crew_manday_fd_monthly` row counts > 0, then `DELETE WHERE scenario_id=999990`.
- [ ] **Step 4:** Commit.

> **dev/CoreServer split (document, don't fix here):** in the current dev setup the UI's run executes on CoreServer's engine-server, whose completion callback updates **CoreServer's** DB — so the dev DB's scenario row/data isn't auto-updated. The `compare`/manual loaders bridge it for now. A proper fix (engine-server posting results back to the initiating live-server, or a dev poll-and-load) is a separate task. This is why Task 6 gates on row presence, not `status`.

---

## Task 8: Playwright — Gantt renders from DB (both paths)

**Files:** Create `e2e/tests/gantt/scenario/scenario-db-source.spec.ts`.

- [ ] **Step 1:** With live-server started `SCENARIO_GANTT_SOURCE=db`, open scenario **459** (live-backed) and **460** (copy-backed). Assert specifics (not just visibility, per CLAUDE.md §Playwright-Required): 26 crew rows, a known crew/pairing puck present, and a non-zero `MCred` for a known crew. Use the `window.__ganttTest` Canvas hook (memory "gantt-live-view-and-test-hook"). Auth/base-path per memory "gantt-e2e-auth-and-base-path"; `--no-deps` if pbs :3002 down.
- [ ] **Step 2:** Run `cd e2e && npx playwright test tests/gantt/scenario/scenario-db-source.spec.ts --reporter=list`. Paste PASS summary (§No-Illusion).
- [ ] **Step 3:** Commit.

---

## Task 9: Flip default + version bump

**Files:** Modify `env.ts` (default `'gz'`→`'db'`, only after Tasks 5 & 8 pass) + `gantt/src/version.ts` (`BACKEND_VERSION` +1).

- [ ] Flip default, keep `SCENARIO_GANTT_SOURCE=gz` as escape hatch; bump version; run full `npx vitest run src/services/scenario` + parity + e2e; paste receipts; commit.

---

## Out of scope (separate follow-ups)
- Widening copy 405 further / re-slicing per scenario (currently Apr–Jul covers the loaded June scenarios).
- `flights[]` exact semantics — confirm what the gz `## flight` section represents vs the flight partition (this plan populates `flights[]` from the flight partition by date window; if the Flight pane needs the precise gz set, refine).
- Retention/purge of old `scenario.*` partitions.
- Loading 114/115 (no `## format` output; needs native→`##` conversion).
- Production UI→engine routing (dev SSH tunnel is a stopgap).

## Verification checklist
- [ ] `cd live-server && npx vitest run src/services/scenario` green.
- [ ] Parity (Task 5) green for **459 (live)** and **460 (copy)**.
- [ ] Playwright (Task 8) green; PASS pasted.
- [ ] `SCENARIO_GANTT_SOURCE=db`: 6/459 (live) and 460 (copy) all render correct crew/pairings/stats; `=gz` still works.
