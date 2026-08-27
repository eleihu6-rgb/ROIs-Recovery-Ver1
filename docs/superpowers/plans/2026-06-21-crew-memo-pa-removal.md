# Crew Memo + PA-removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** A 3-stage, human-in-the-loop pipeline where a bot writes range-based crew memos to visualize the PBS solver's to-be-de-assigned duties, the planner confirms/corrects via the memos, and an explicit order soft-deletes the approved duties.

**Architecture:** Reuse the existing `crew_memo` table (range-based, soft-delete via `status`). live-server gets a pure de-assignment classifier + crew-memo CRUD + two PA-removal endpoints (stage 1 analyze→write `type=3` memos, stage 3 execute→soft-delete rosters via existing roster delete endpoints). gantt renders a remastered note icon on the shared roster layer, with add/edit/delete UI. ai-server adds a `prepare_pa_removal` chat tool. Playwright covers all three stages.

**Tech Stack:** Fastify + Drizzle + Zod + Vitest (live-server); React 19 + Zustand + Canvas + `@rois/ui` AppDialog (gantt); FastAPI (ai-server); Playwright (e2e).

## Global Constraints

- API response envelope: `{ code: 200, data: T, message: 'ok' }` (success) / `{ code, data: null, message }` (error). Live-server `/api/*` paths; auth via `Authorization: Bearer`.
- No new DB table; reuse `crew_memo` (`sql/schema/live/02-crew-roster.sql`). No SQL migration.
- `type`: 1=manual, 3=system/bot. Bot never edits/deletes `type=1`. Delete = `status='N'`.
- First-paint: memo fetch is post-first-paint, scoped to loaded crew (global §First-Paint).
- §Gantt-Unify: render memos in the shared roster layer; Live data source first.
- §Minimal-First / §Surgical: no speculative abstraction; touch only what's needed.
- No hard-coded airline/base/rank values — analyzer crew-set is parameterized.
- Version bump: backend changes → `BACKEND_VERSION`+1; frontend → `FRONTEND_VERSION`+1 (`gantt/src/version.ts`).
- UI English only. Icons via `@rois/ui` AppDialog for the dialog.

---

## Phase A — De-assignment classifier (pure logic)

### Task A1: Normalized duty types + pure `classifyDuties`

**Files:**
- Create: `live-server/src/services/crew-memo/deassign-types.ts`
- Create: `live-server/src/services/crew-memo/deassign-analyzer.ts`
- Test: `live-server/src/services/crew-memo/deassign-analyzer.test.ts`

**Interfaces:**
- Produces:
  - `interface Duty { kind: 'FLY' | 'GRD'; assignment: string; pairingId: number | null; pairingLabel: string | null; segCount: number; rosterIds: number[]; start: string; end: string }` (ISO UTC strings)
  - `type Disposition = 'DE_ASSIGN' | 'NO_TOUCH'`
  - `interface ClassifiedDuty extends Duty { disposition: Disposition; reason: string }`
  - `classifyDuties(duties: Duty[], opts: { monthStart: string; monthEnd: string }): ClassifiedDuty[]`

- [ ] **Step 1: Write failing tests** (fixtures derived from the 4 sample crew):

```typescript
import { describe, it, expect } from 'vitest'
import { classifyDuties } from './deassign-analyzer.js'
import type { Duty } from './deassign-types.js'

const OPTS = { monthStart: '2026-06-01T00:00:00Z', monthEnd: '2026-07-01T00:00:00Z' }
const fly = (pairingId: number, label: string, start: string, end: string, segCount = 2): Duty =>
  ({ kind: 'FLY', assignment: 'FLY', pairingId, pairingLabel: label, segCount, rosterIds: [pairingId], start, end })
const grd = (a: string, start: string, end: string, id: number): Duty =>
  ({ kind: 'GRD', assignment: a, pairingId: null, pairingLabel: null, segCount: 0, rosterIds: [id], start, end })

const byPairing = (r: ReturnType<typeof classifyDuties>, id: number) => r.find((d) => d.pairingId === id)!

describe('classifyDuties', () => {
  it('de-assigns line flying + days off', () => {
    const r = classifyDuties([
      fly(10827, 'V4110', '2026-06-03T01:12:00Z', '2026-06-03T12:00:00Z'),
      grd('DO', '2026-06-03T14:01:00Z', '2026-06-04T14:00:00Z', 1),
    ], OPTS)
    expect(byPairing(r, 10827).disposition).toBe('DE_ASSIGN')
    expect(r.find((d) => d.assignment === 'DO')!.disposition).toBe('DE_ASSIGN')
  })

  it('never touches VAC / RES / SIM / GRD / ILL', () => {
    for (const a of ['VAC', 'RES', 'SIM', 'GRD', 'ILL']) {
      const r = classifyDuties([grd(a, '2026-06-10T00:00:00Z', '2026-06-10T06:00:00Z', 1)], OPTS)
      expect(r[0].disposition).toBe('NO_TOUCH')
    }
  })

  it('protects sim-commute F8 pairings flanking a SIM block (crew 535)', () => {
    const r = classifyDuties([
      fly(103442, 'F8604', '2026-06-13T01:50:00Z', '2026-06-13T07:30:00Z', 1),
      grd('SIM', '2026-06-13T20:00:00Z', '2026-06-14T02:15:00Z', 1),
      grd('SIM', '2026-06-15T00:30:00Z', '2026-06-15T06:30:00Z', 2),
      fly(103443, 'F8601', '2026-06-15T17:40:00Z', '2026-06-15T23:50:00Z', 1),
      fly(11768, 'V4152', '2026-06-19T01:15:00Z', '2026-06-19T12:05:00Z'),
    ], OPTS)
    expect(byPairing(r, 103442).disposition).toBe('NO_TOUCH')
    expect(byPairing(r, 103443).disposition).toBe('NO_TOUCH')
    expect(byPairing(r, 11768).disposition).toBe('DE_ASSIGN')
  })

  it('does NOT treat a non-F8 high-id pairing as a commute (97297/VB8221)', () => {
    const r = classifyDuties([
      fly(97297, 'VB8221', '2026-06-08T09:05:00Z', '2026-06-08T12:56:00Z'),
      fly(145531, 'F8606', '2026-06-10T00:15:00Z', '2026-06-10T05:56:00Z', 1),
      grd('SIM', '2026-06-12T00:30:00Z', '2026-06-12T06:30:00Z', 1),
    ], OPTS)
    expect(byPairing(r, 97297).disposition).toBe('DE_ASSIGN')
    expect(byPairing(r, 145531).disposition).toBe('NO_TOUCH')
  })

  it('protects lead-in (May->Jun) and tail (Jun->Jul) pairings', () => {
    const r = classifyDuties([
      fly(10634, 'TB7976', '2026-05-31T02:40:00Z', '2026-06-03T04:02:00Z', 1),
      fly(61681, 'V4152', '2026-06-30T19:00:00Z', '2026-07-01T12:05:00Z'),
    ], OPTS)
    expect(byPairing(r, 10634).disposition).toBe('NO_TOUCH')
    expect(byPairing(r, 61681).disposition).toBe('NO_TOUCH')
  })

  it('protects 2 DOs before and after a VAC block (crew 535 VAC Jun22-26)', () => {
    const do_ = (d: number, id: number) => grd('DO', `2026-06-${String(d).padStart(2,'0')}T14:01:00Z`, `2026-06-${String(d+1).padStart(2,'0')}T14:00:00Z`, id)
    const vac = (d: number, id: number) => grd('VAC', `2026-06-${String(d).padStart(2,'0')}T14:00:00Z`, `2026-06-${String(d+1).padStart(2,'0')}T14:00:00Z`, id)
    const r = classifyDuties([
      do_(19, 1), do_(20, 2), do_(21, 3),
      vac(22, 4), vac(23, 5), vac(24, 6), vac(25, 7), vac(26, 8),
      do_(27, 9), do_(28, 10), do_(29, 11),
    ], OPTS)
    const dispo = (id: number) => r.find((d) => d.rosterIds[0] === id)!.disposition
    expect(dispo(1)).toBe('DE_ASSIGN')   // Jun19 (3rd before)
    expect(dispo(2)).toBe('NO_TOUCH')    // Jun20 (2nd before)
    expect(dispo(3)).toBe('NO_TOUCH')    // Jun21 (1st before)
    expect(dispo(9)).toBe('NO_TOUCH')    // Jun27 (1st after)
    expect(dispo(10)).toBe('NO_TOUCH')   // Jun28 (2nd after)
    expect(dispo(11)).toBe('DE_ASSIGN')  // Jun29 (3rd after)
  })
})
```

- [ ] **Step 2: Run, verify fail** — `cd live-server && npx vitest run src/services/crew-memo/deassign-analyzer.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `deassign-types.ts`** (the interfaces above) and `deassign-analyzer.ts`:

```typescript
import type { Duty, ClassifiedDuty, Disposition } from './deassign-types.js'

const overlapsMonth = (d: Duty, s: number, e: number): boolean =>
  Date.parse(d.start) < e && Date.parse(d.end) > s
const startsInMonth = (d: Duty, s: number, e: number): boolean => {
  const t = Date.parse(d.start); return t >= s && t < e
}
const isFly = (d: Duty): boolean => d.kind === 'FLY' && d.assignment === 'FLY'
const isDayOff = (d: Duty): boolean => d.kind === 'GRD' && d.assignment === 'DO'
const isVac = (d: Duty): boolean => d.assignment === 'VAC'
const isSim = (d: Duty): boolean => d.assignment === 'SIM'
const isCommuteLabel = (d: Duty): boolean => /^F8\d/.test(d.pairingLabel ?? '')

export const classifyDuties = (
  duties: Duty[],
  opts: { monthStart: string; monthEnd: string },
): ClassifiedDuty[] => {
  const s = Date.parse(opts.monthStart)
  const e = Date.parse(opts.monthEnd)
  const sorted = [...duties].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))

  // Index of contiguous SIM blocks → the commute pairing right before / after.
  const commuteIds = new Set<number>()
  for (let i = 0; i < sorted.length; i++) {
    if (!isSim(sorted[i])) continue
    // expand the SIM block [bStart..bEnd]
    let j = i
    while (j + 1 < sorted.length && isSim(sorted[j + 1])) j++
    // nearest FLY before i that is an F8 commute
    for (let k = i - 1; k >= 0; k--) {
      if (isSim(sorted[k])) break
      if (isFly(sorted[k])) { if (isCommuteLabel(sorted[k]) && sorted[k].pairingId) commuteIds.add(sorted[k].pairingId!); break }
    }
    // nearest FLY after j that is an F8 commute
    for (let k = j + 1; k < sorted.length; k++) {
      if (isSim(sorted[k])) break
      if (isFly(sorted[k])) { if (isCommuteLabel(sorted[k]) && sorted[k].pairingId) commuteIds.add(sorted[k].pairingId!); break }
    }
    i = j
  }

  const classify = (d: Duty): { disposition: Disposition; reason: string } => {
    if (!overlapsMonth(d, s, e)) return { disposition: 'NO_TOUCH', reason: 'out-of-range' }
    if (isFly(d)) {
      if (d.pairingId && commuteIds.has(d.pairingId)) return { disposition: 'NO_TOUCH', reason: 'sim-commute' }
      const startsThisMonth = startsInMonth(d, s, e)
      if (!startsThisMonth) return { disposition: 'NO_TOUCH', reason: 'lead-in' }
      if (Date.parse(d.end) >= e) return { disposition: 'NO_TOUCH', reason: 'tail' }
      return { disposition: 'DE_ASSIGN', reason: 'flying' }
    }
    if (isDayOff(d)) return { disposition: 'DE_ASSIGN', reason: 'day-off' }
    return { disposition: 'NO_TOUCH', reason: `keep-${d.assignment}` }
  }

  const result: ClassifiedDuty[] = sorted.map((d) => ({ ...d, ...classify(d) }))

  // VAC-adjacency: protect the 2 DOs immediately before and after each VAC block.
  for (let i = 0; i < result.length; i++) {
    if (!isVac(result[i])) continue
    let j = i; while (j + 1 < result.length && isVac(result[j + 1])) j++
    let kept = 0
    for (let k = i - 1; k >= 0 && kept < 2; k--) {
      if (isVac(result[k])) break
      if (isDayOff(result[k])) { result[k].disposition = 'NO_TOUCH'; result[k].reason = 'vac-adjacent'; kept++ } else break
    }
    kept = 0
    for (let k = j + 1; k < result.length && kept < 2; k++) {
      if (isVac(result[k])) break
      if (isDayOff(result[k])) { result[k].disposition = 'NO_TOUCH'; result[k].reason = 'vac-adjacent'; kept++ } else break
    }
    i = j
  }
  return result
}
```

- [ ] **Step 4: Run, verify pass** — same vitest command → PASS (6 tests).
- [ ] **Step 5: Commit** — `git add live-server/src/services/crew-memo && git commit` (`feat(live-server): pure de-assignment classifier`).

### Task A2: DB duty loader + plan builder

**Files:**
- Create: `live-server/src/services/crew-memo/deassign-loader.ts`
- Test: `live-server/src/services/crew-memo/deassign-loader.test.ts` (mock the db module)

**Interfaces:**
- Consumes: `classifyDuties`, `Duty`.
- Produces:
  - `loadCrewDuties(db, crewIds: string[], from: string, to: string): Promise<Map<string, Duty[]>>` — groups `roster_flight` rows (is_deleted=0) by crew, collapsing FLY rows to one Duty per `pairing_id` (rosterIds = all seg ids, segCount = seg count, label from `pairing.pairing_label`), each GRD row its own Duty (rosterIds=[id]).
  - `buildPlan(byCrew: Map<string, Duty[]>, from: string, to: string): Array<{ crewId: string; memo: string; name: string; start: string; end: string; rosterId: number | null; pairingId: number | null }>` — runs `classifyDuties` per crew, keeps `DE_ASSIGN`, maps each to a memo row: flying → `name:'De-assign pairing', memo:'<label> (<pairingId>)'`; day-off → `name:'De-assign day off', memo:'DO'`. `rosterId` = first roster id.

- [ ] **Step 1–5:** Test `buildPlan` against the 4-crew expected counts (113: 6 fly + 21 DO; 535: 4 fly + 10 DO; 927: 1 fly + 0 DO; 390: 7 fly + 16 DO). Implement, run, commit (`feat(live-server): crew duty loader + plan builder`).

---

## Phase B — crew_memo model + CRUD

### Task B1: Drizzle model `crewMemo`

**Files:** Create `live-server/src/models/crew/crew-memo.ts` (mirror `pairing-memo.ts`, all 16 columns from §2 of the spec; `strDtLoc`/`endDtLoc` as `timestamp`, `type` as `smallint`, `name`/`memo`/`status`/`pbsStatus` as varchar).

- [ ] Create model, `git commit` (`feat(live-server): crewMemo drizzle model`).

### Task B2: crew-memo service (list / upsert / softDelete)

**Files:**
- Create: `live-server/src/services/crew-memo/crew-memo-service.ts`
- Test: `live-server/src/services/crew-memo/crew-memo-service.test.ts`

**Interfaces:**
- Produces:
  - `interface MemoDTO { id: number; crewId: string; strDtLoc: string; endDtLoc: string; memo: string; name: string | null; type: number; status: string }`
  - `listMemos(db, crewIds: string[], from: string, to: string): Promise<MemoDTO[]>` — `status='Y'`, range-overlap, crew in set.
  - `upsertMemo(db, input: { id?: number; crewId; strDtLoc; endDtLoc; memo; name?; type?; rosterId?; userId }): Promise<MemoDTO>`
  - `softDeleteMemo(db, id: number, userId: string): Promise<number>` — sets `status='N'`, returns id.
  - `refreshSystemMemos(db, crewIds, from, to, rows, userId)` — sets prior `type=3 status=Y` rows in range to `'N'`, inserts new plan rows (`type=3`), returns count.

- [ ] **Step 1–5:** Vitest with mocked db; assert list filters status/range, upsert returns row, softDelete sets N, refresh clears+inserts. Commit (`feat(live-server): crew-memo service`).

### Task B3: crew-memo routes

**Files:**
- Create: `live-server/src/routes/crew-memo/index.ts`
- Modify: `live-server/src/index.ts` (import + `await server.register(crewMemoRoutes, { prefix: '/api' })` near line 158)
- Test: `live-server/src/routes/crew-memo/crew-memo.routes.test.ts`

Routes (Zod-validated, `{code,data}`): `GET /api/crew-memo?crewIds=&from=&to=`, `POST /api/crew-memo`, `DELETE /api/crew-memo/:id`. `userId` from `request.authUser.userCode`.

- [ ] **Step 1–5:** Inject a Fastify instance, assert 200 shapes + 400 on bad input. Commit (`feat(live-server): crew-memo routes`).

---

## Phase C — PA-removal stage 1 + stage 3

### Task C1: PA-removal stage-1 endpoint (analyze → write memos)

**Files:**
- Create: `live-server/src/services/crew-memo/pa-removal-service.ts` (`runPaRemoval(db, { bases?, ranks?, crewIds?, from, to }, userId)`: resolve crew set (reuse existing crew query by base/rank, or use crewIds), `loadCrewDuties` → `buildPlan` → `refreshSystemMemos`, return `{ written, byCrew }`).
- Modify: `live-server/src/routes/crew-memo/index.ts` add `POST /api/crew-memo/pa-removal`.
- Test: `live-server/src/services/crew-memo/pa-removal-service.test.ts` (mock loader+service; assert plan→refresh wiring + counts).

- [ ] **Step 1–5:** Implement, test, commit (`feat(live-server): PA-removal stage-1 analyze`).

### Task C2: PA-removal stage-3 endpoint (execute → soft-delete rosters)

**Files:**
- Modify: `pa-removal-service.ts` add `executePaRemoval(db, { crewIds?, from, to }, userId)`: read approved (`type=3 status='Y'`) memos in range; for each, if `pairingId` present call the existing pairing+crew delete service, else delete the `rosterId` row; all in a per-crew transaction; idempotent (skip is_deleted=1). Return `{ deassigned, byCrew }`.
- Modify: routes add `POST /api/crew-memo/pa-removal/execute`.
- Reuse: the delete logic behind `POST /api/roster/pairing/:pairingId/crew/:crewId/delete` and `POST /api/roster/:id/delete` (extract a service fn if currently inline in the route).
- Test: assert only approved duties get `is_deleted=1` and protected ones don't.

- [ ] **Step 1–5:** Implement, test, commit (`feat(live-server): PA-removal stage-3 execute`).

---

## Phase D — gantt memo store + API + types

### Task D1: types + API service + store

**Files:**
- Create: `gantt/src/types/crew-memo.ts` (`CrewMemo` mirroring `MemoDTO`).
- Create: `gantt/src/services/crew-memo-api.ts` (axios: `listCrewMemos`, `saveCrewMemo`, `deleteCrewMemo`, `prepareePaRemoval`, `executePaRemoval`; reuse the shared http-client, mind the `{code}` unwrap — use the dedicated axios pattern per `gantt-httpclient-code-envelope-unwrap` memory).
- Create: `gantt/src/stores/crew-memo-store.ts` (Zustand: `memosByCrew: Map<string, CrewMemo[]>`, `fetchForCrew(ids, from, to)` post-first-paint, `add/update/remove`).
- Test: covered via e2e (store has no isolated unit harness in gantt).

- [ ] Implement, `git commit` (`feat(gantt): crew-memo store + api`).

---

## Phase E — gantt icon overlay + asset

### Task E1: remastered note asset + canvas badge

**Files:**
- Create: `gantt/src/assets/memo-note.svg` (flat yellow note, coral pin top-center, folded bottom-right corner, 3 orange text lines).
- Create: `gantt/src/components/gantt/memo-overlay.ts` (`MEMO_BADGE_SIZE = 14`, `memoBadgePosition(blockX, blockY, blockW, blockH, hasPuck): {x,y}` → free corner when `hasPuck` else centered; `drawMemoBadge(ctx, x, y)` draws the note via 2D API).
- Test: unit-free; asserted in e2e via `__ganttTest`.

- [ ] Implement, `git commit` (`feat(gantt): memo note icon overlay + asset`).

### Task E2: render memos in shared roster renderer

**Files:**
- Modify: `gantt/src/components/gantt/renderers/roster-renderer.ts` — after drawing duty pucks for a crew row, for each memo overlapping the visible range compute its start-day x, find whether a puck occupies that cell (`hasPuck`), and `drawMemoBadge` at `memoBadgePosition(...)`.
- Modify: the shared roster pane to subscribe to `crew-memo-store` and pass memos into the render path (follow how violations are threaded).
- Extend `window.__ganttTest` with `memoBadges(): Array<{ crewId; x; y; w; h }>` and ensure `roster()` already exposes puck rects (add `puckRects()` if absent) for the overlap assertion.

- [ ] Implement, `git commit` (`feat(gantt): draw crew-memo icons on roster rows`).

---

## Phase F — gantt add/edit/delete UI

### Task F1: context-menu entry + AppDialog + popover

**Files:**
- Create: `gantt/src/components/memo/memo-dialog.tsx` (`AppDialog`, title "Crew Memo", note icon, text field + optional title, Save/Cancel).
- Create: `gantt/src/components/memo/memo-popover.tsx` (shows `name`+`memo`, Edit/Delete).
- Modify: roster context-menu (where pairing right-click menu is built) to add "Add memo" (prefill from puck pairing label+id / assignment), and icon click → popover.

- [ ] Implement, `git commit` (`feat(gantt): crew-memo add/edit/delete UI`).

### Task F2: version bump

**Files:** Modify `gantt/src/version.ts` — `BACKEND_VERSION`+1 and `FRONTEND_VERSION`+1.

- [ ] Commit (`chore: bump versions for crew-memo`).

---

## Phase G — ai-server bot tool

### Task G1: `prepare_pa_removal` tool + handler + frontend dispatch

**Files:**
- Modify: `ai-server/src/chat/tools.py` — add tool `prepare_pa_removal` (params bases/ranks/crewIds/from/to; description triggers on "remove pre-assignment (PA) for solver").
- Modify: `ai-server/src/chat/routes.py` — emit an `AiAction { type: 'prepare_pa_removal', payload }`.
- Modify: gantt AI-action dispatcher — on `prepare_pa_removal`, call `prepareePaRemoval` then refresh the memo store.
- Test: `ai-server` pytest asserting the tool is offered and parsed.

- [ ] Implement, run `cd ai-server && .venv/bin/python -m pytest -v`, `git commit` (`feat(ai-server): prepare_pa_removal chat tool`).

---

## Phase H — e2e + skill

### Task H1: crew-memo.spec.ts (CRUD + overlap)

**Files:** Create `e2e/tests/gantt/crew-memo.spec.ts` — add→icon+popover text; edit→text changes; delete→count 0 + GET no `Y` row; overlap badge rect ≠ puck rect via `__ganttTest`. IDs `Live-13xx` (per docs/test-cases/e2e/README.md).

- [ ] Implement; run `cd e2e && npx playwright test tests/gantt/crew-memo.spec.ts --reporter=list`; paste PASS; commit.

### Task H2: pa-removal.spec.ts (3 stages)

**Files:** Create `e2e/tests/gantt/pa-removal.spec.ts` — stage1 counts vs §3 fixtures for 113/390/535/927; stage2 delete a memo; stage3 execute then assert approved `is_deleted=1` and protected `is_deleted=0` (disposable crew). Use DB helper `e2e/utils/db-helper.ts`.

- [ ] Implement; run; paste PASS; commit.

### Task H3: skill 111-pbs-solver-roster-deassign

**Files:** Create `~/.claude/skills/111-pbs-solver-roster-deassign/SKILL.md` + the headed driver (generalize `e2e/scripts/show-crew113-deassign.mjs`): trigger PA-removal → load YVR CA/FO June → assert note icons on flagged duties. Update `MEMORY.md` pointer.

- [ ] Implement; commit.

---

## Self-Review notes
- Spec coverage: §2 data model→B1; §3 rules→A1/A2; §4 icon→E1; §5 CRUD→B/C; §6 frontend→D/E/F; §7 bot→G; §8 tests→H. Covered.
- 3-stage workflow (§1a) → C1 (stage1) / F+G (stage2 corrections via CRUD) / C2 (stage3 execute). Covered.
- Type consistency: `Duty`/`ClassifiedDuty`/`MemoDTO`/`CrewMemo` names reused verbatim across tasks.
