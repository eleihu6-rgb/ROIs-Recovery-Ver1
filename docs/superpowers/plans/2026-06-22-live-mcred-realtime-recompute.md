# Live MCred Real-time Recompute Implementation Plan

> **Status (2026-06-22):** **Phase A SHIPPED** on branch `feat/gantt/live-mcred-draft-recompute`
> (commits 260c18be → 3cd47b47, F308). De-assign now moves MCred before Save and reverts on undo
> (`Live-1310` e2e green; `sumCrewCreditMinutes` unit-green; 247 gantt unit tests pass). The add-pairing
> credit placeholder (A2) is wired + unit-covered but not yet drag-e2e'd. **Phases B & C NOT started.**
> Hard-won finding: `viewportYearMonth` is a host-local-tz value compared against UTC `schStrDtUtc`, so
> MCred (stats + delta) keys to the previous month when the browser tz is west of the display tz —
> e2e pins `timezoneId: 'UTC'`. See playbook §13(h).
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Live gantt roster-pane `MCred` column update in real time as the planner de-assigns / adds duties (before save), revert on undo/redo, reconcile to an authoritative server value, and refresh for other users when someone saves.

**Architecture:** Three phases. **A —** displayed `mcred = serverBase + draftDelta`, where `draftDelta` is computed client-side as `credit(virtual roster) − credit(base roster)` per crew per month, reusing the existing `applyDraftOps` virtual state and the per-duty credit dedup convention. **B —** a non-persisting `POST /api/draft/preview-stats` runs the real manday credit model inside a rolled-back transaction and returns the exact `mcred`; the client debounces and reconciles. **C —** the WS `roster-updated` handler refetches roster + crew stats for the broadcast crew so other users see new duties and updated `mcred` live.

**Tech Stack:** gantt (React 19 + Vite + TS + Zustand + Canvas), live-server (Fastify + Drizzle + Postgres + Redis), Vitest (unit), Playwright (e2e).

## Global Constraints

- **Version bump (mandatory):** any frontend change → `FRONTEND_VERSION` +1; any backend change → `BACKEND_VERSION` +1 in `gantt/src/version.ts`. Never reuse/lower. (Phase A/C frontend → F+1; Phase B backend+frontend → B+1 and F+1.)
- **UI language = English** for any user-facing string.
- **UI-standard gate:** if any Tailwind/markup changes, run `npm run check:ui` (root) — hard violations must be 0. (This plan adds no new magic values; the mcred cell text is unchanged styling.)
- **§First-Paint:** mcred is post-first-paint async data — do not move its load earlier or block first paint. The draft delta is computed only from already-loaded items.
- **§Gantt-Unify:** this is **Live-only** by design — the draft/undo-redo edit mechanism is genuinely Live-only (playbook §10); Scenario is edit-locked. Do not fork shared panes. The credit util stays shared.
- **E2E harness:** app base `/fpqe/gantt/`; auth seeded into `sessionStorage` via `addInitScript` (`e2e/utils/gantt-hook.ts` `seedGanttAuth`/`gotoGantt`); creds admin `Ryan/Our2027`, non-admin `Jen/Our2027`; always `--config=config/playwright.config.ts`; run gantt-only with `--project=gantt --no-deps`. Test IDs: Live = `1xxx` (globally unique, never reused — see `docs/test-cases/e2e/README.md`).
- **Credit model truth:** per-duty credit is `MAX(duty_act_credited_minutes)` per `(crew, pairingId, dutySeq)` (server `manday-credit-service.ts:149`); the client must dedup the same way (mirrors `sumPairingCreditMinutes`).

---

## Phase A — Optimistic client-side delta (reqs 1, 2, 4, 5)

### Task A1: Per-crew month-credit helper

**Files:**
- Modify: `gantt/src/utils/format-credit.ts` (append a new export; keep existing `formatCreditMinutes` / `sumPairingCreditMinutes`)
- Test: `gantt/src/utils/format-credit.test.ts` (create)

**Interfaces:**
- Produces: `sumCrewCreditMinutes(items: ReadonlyArray<Pick<RosterItem,'pairingId'|'dutySeq'|'dutyActCreditedMinutes'|'actCreditedMinutes'|'schStrDtUtc'>>, yearMonth: string): number` — total credited minutes for one crew's items whose `schStrDtUtc` falls in `yearMonth` (`YYYY-MM`). Flying duties (pairingId≠null) are deduped by `(pairingId,dutySeq)` taking `dutyActCreditedMinutes`; ground items (pairingId==null) add `actCreditedMinutes`.

- [ ] **Step 1: Write the failing test**

```ts
// gantt/src/utils/format-credit.test.ts
import { describe, it, expect } from 'vitest'
import { sumCrewCreditMinutes } from './format-credit'

const fly = (pairingId: number, dutySeq: number, credit: string, day = '05') => ({
  pairingId, dutySeq, dutyActCreditedMinutes: credit, actCreditedMinutes: null,
  schStrDtUtc: `2026-06-${day}T08:00:00Z`,
})
const ground = (credit: string, day = '05') => ({
  pairingId: null, dutySeq: null, dutyActCreditedMinutes: null, actCreditedMinutes: credit,
  schStrDtUtc: `2026-06-${day}T08:00:00Z`,
})

describe('sumCrewCreditMinutes', () => {
  it('dedups a multi-segment duty to one credit value', () => {
    const items = [fly(100, 1, '240'), fly(100, 1, '240'), fly(100, 2, '180')]
    expect(sumCrewCreditMinutes(items, '2026-06')).toBe(420)
  })
  it('adds ground-task credit', () => {
    expect(sumCrewCreditMinutes([fly(100, 1, '240'), ground('300')], '2026-06')).toBe(540)
  })
  it('excludes items outside the month', () => {
    const out = { ...fly(101, 1, '500'), schStrDtUtc: '2026-07-01T08:00:00Z' }
    expect(sumCrewCreditMinutes([fly(100, 1, '240'), out], '2026-06')).toBe(240)
  })
  it('treats null credit as zero', () => {
    expect(sumCrewCreditMinutes([{ pairingId: 100, dutySeq: 1, dutyActCreditedMinutes: null, actCreditedMinutes: null, schStrDtUtc: '2026-06-05T08:00:00Z' }], '2026-06')).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/utils/format-credit.test.ts`
Expected: FAIL — `sumCrewCreditMinutes is not a function`.

- [ ] **Step 3: Implement the helper**

Append to `gantt/src/utils/format-credit.ts`:

```ts
/**
 * Total credited minutes for ONE crew's roster items within a calendar month (`YYYY-MM`,
 * matched on `schStrDtUtc`). Flying duties are deduped by `(pairingId,dutySeq)` taking
 * `dutyActCreditedMinutes` (the same value repeats on every segment of a duty); ground items
 * (pairingId null) add `actCreditedMinutes`. Mirrors the backend
 * `MAX(duty_act_credited_minutes) per (crew,pairing,dutySeq)` model (manday-credit-service.ts).
 */
export const sumCrewCreditMinutes = (
  items: ReadonlyArray<{
    pairingId: number | null
    dutySeq?: number | null
    dutyActCreditedMinutes?: string | null
    actCreditedMinutes: string | null
    schStrDtUtc: string
  }>,
  yearMonth: string,
): number => {
  const byDuty = new Map<string, number>()
  let groundTotal = 0
  for (const it of items) {
    if (!it.schStrDtUtc || it.schStrDtUtc.slice(0, 7) !== yearMonth) continue
    if (it.pairingId != null) {
      const v = it.dutyActCreditedMinutes != null ? Math.round(Number(it.dutyActCreditedMinutes)) : 0
      if (Number.isFinite(v)) byDuty.set(`${it.pairingId}:${it.dutySeq ?? 0}`, v)
    } else {
      const v = it.actCreditedMinutes != null ? Math.round(Number(it.actCreditedMinutes)) : 0
      if (Number.isFinite(v)) groundTotal += v
    }
  }
  let total = groundTotal
  for (const v of byDuty.values()) total += v
  return total
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/utils/format-credit.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/utils/format-credit.ts gantt/src/utils/format-credit.test.ts
git commit -m "feat(gantt): add sumCrewCreditMinutes per-crew month credit helper"
```

---

### Task A2: Enrich assign-pairing placeholders with duty credit

So an added pairing contributes to the optimistic delta (placeholders currently set no `dutyActCreditedMinutes`).

**Files:**
- Modify: `gantt/src/components/layout/app-layout.tsx:140-168` (segment-placeholder branch)
- Modify: `gantt/src/components/layout/pane-container.tsx` (the mirror placeholder builder near `:93-151`)
- Test: covered by Task A4 e2e (no separate unit test — this is a data-wiring change verified through the delta).

**Interfaces:**
- Consumes: `pairingItem.segments[].dutyActCreditedMinutes` (already present on `PairingSegment`, used at `pairing-pane.tsx:475`).
- Produces: placeholder `RosterItem.dutyActCreditedMinutes` populated, so `sumCrewCreditMinutes` sees the added credit.

- [ ] **Step 1: Add the field in app-layout.tsx**

In the `pairingItem.segments.map((seg) => ({ … }))` placeholder object (currently ending the credit line `schCreditedMinutes: null, actCreditedMinutes: null,` at `app-layout.tsx:159`), add the duty credit from the segment:

```ts
              schCreditedMinutes: null, actCreditedMinutes: null,
              dutyActCreditedMinutes: seg.dutyActCreditedMinutes != null ? String(seg.dutyActCreditedMinutes) : null,
```

- [ ] **Step 2: Mirror the field in pane-container.tsx**

Apply the identical addition to the placeholder builder in `pane-container.tsx` (find the segment `.map` placeholder object; add the same `dutyActCreditedMinutes` line right after its `actCreditedMinutes: null,`).

- [ ] **Step 3: Typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors (the 2 known pre-existing tsc errors per memory may remain; no NEW errors from these files).

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/layout/app-layout.tsx gantt/src/components/layout/pane-container.tsx
git commit -m "feat(gantt): carry duty credit on assign-pairing placeholders"
```

---

### Task A3: Render mcred = serverBase + draftDelta

**Files:**
- Modify: `gantt/src/components/gantt/source/live-gantt-source.ts` (`buildPanelRows` `:485-534` + its call site `:614-623`)
- Test: Task A4 (e2e).

**Interfaces:**
- Consumes: `sumCrewCreditMinutes` (A1); `useRosterStore.getState().main.baseItems` and `.rosterItems` (virtual); `viewportYearMonth` (already in scope at `:602-610`).
- Produces: panel `values.mcred` reflects the live draft delta.

- [ ] **Step 1: Add a delta helper above buildPanelRows**

In `live-gantt-source.ts`, ensure the import exists:

```ts
import { formatBlockMinutes } from '@/utils/format-block-minutes' // (already imported — verify)
import { sumCrewCreditMinutes } from '@/utils/format-credit'
```

Add a pure helper (module scope, near `buildPanelRows`):

```ts
/** Per-crew draft credit delta (minutes) for the displayed month = credit(virtual) − credit(base). */
const draftCreditDeltaByCrew = (
  baseItems: RosterItem[],
  virtualItems: RosterItem[],
  yearMonth: string,
): Map<string, number> => {
  const bucket = (items: RosterItem[]): Map<string, RosterItem[]> => {
    const m = new Map<string, RosterItem[]>()
    for (const it of items) { const a = m.get(it.crewId); if (a) a.push(it); else m.set(it.crewId, [it]) }
    return m
  }
  const baseByCrew = bucket(baseItems)
  const virtByCrew = bucket(virtualItems)
  const delta = new Map<string, number>()
  const crewIds = new Set<string>([...baseByCrew.keys(), ...virtByCrew.keys()])
  for (const cid of crewIds) {
    const d = sumCrewCreditMinutes(virtByCrew.get(cid) ?? [], yearMonth)
            - sumCrewCreditMinutes(baseByCrew.get(cid) ?? [], yearMonth)
    if (d !== 0) delta.set(cid, d)
  }
  return delta
}
```

- [ ] **Step 2: Thread the delta into buildPanelRows**

Add a parameter `creditDelta: Map<string, number>` to `buildPanelRows` (after `crewStatsMap`), and change the mcred line (`:525`) to:

```ts
          mcred: stats != null
            ? formatBlockMinutes(Math.round(stats.mcred + (creditDelta.get(cid) ?? 0)))
            : '',
```

At the call site (`:621-622`) compute and pass the delta:

```ts
        const { baseItems, rosterItems } = useRosterStore.getState().main
        const creditDelta = draftCreditDeltaByCrew(baseItems, rosterItems, viewportYearMonth)
        const unsortedRows = buildPanelRows(
          selectedCrewIds, crewDetailMap, itemsByCrew, violationMap, crewStatsMap, viewportLeftDate, creditDelta,
        )
```

> The surrounding memo already re-runs on `useDirtySignal()` (markDirty fires on every addOp/undo/redo — draft-store `:129,143,158`), so the delta recomputes on each edit with no extra wiring.

- [ ] **Step 3: Typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/gantt/source/live-gantt-source.ts
git commit -m "feat(gantt): live mcred = server base + draft credit delta"
```

---

### Task A4: E2E — de-assign / add / undo / redo move mcred (reqs 1,2,4,5)

**Files:**
- Test: `e2e/tests/gantt/mcred-draft-recompute.spec.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// e2e/tests/gantt/mcred-draft-recompute.spec.ts
import { test, expect } from '@playwright/test'
import { gotoGantt } from '../../utils/gantt-hook'

// Live-1310: mcred updates live during draft (de-assign), reverts on undo.
test('Live-1310 de-assign lowers MCred before save, undo reverts', async ({ page }) => {
  await gotoGantt(page) // seeds auth + clicks module-nav-live; waits for roster first paint
  // Pick a crew row that has a flying pairing and a non-empty MCred.
  const before = await page.evaluate(() => window.__ganttTest?.roster()?.find((r: any) => r.values.mcred)?.values.mcred)
  expect(before).toBeTruthy()

  // Right-click the first flying roster puck → Delete (stages a 'remove' draft op).
  // (Roster canvas right-click is reliable per playbook §11.4.)
  await page.locator('[data-testid="roster-canvas"]').click({ button: 'right', position: { x: 120, y: 24 } })
  await page.getByRole('menuitem', { name: /delete|remove/i }).first().click()

  // MCred for that crew must drop (no Save performed).
  await expect.poll(async () =>
    page.evaluate(() => window.__ganttTest?.roster()?.find((r: any) => r.values.mcred)?.values.mcred),
  ).not.toBe(before)

  // Undo → reverts.
  await page.getByTestId('draft-undo').click()
  await expect.poll(async () =>
    page.evaluate(() => window.__ganttTest?.roster()?.find((r: any) => r.values.mcred)?.values.mcred),
  ).toBe(before)
})
```

> If `window.__ganttTest.roster()` does not already expose `values.mcred`, extend `gantt/src/utils/gantt-test-hook.ts` `roster()` to include the panel `values` (dev-only hook, never ships) as part of this task, then re-run. Verify the real testids (`roster-canvas`, `draft-undo`/`draft-redo`) in the components before asserting (playbook §13b/c).

- [ ] **Step 2: Run to verify it fails**

Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/mcred-draft-recompute.spec.ts --reporter=list`
Expected: FAIL — MCred unchanged after delete (delta not yet wired) OR hook missing `values`.

- [ ] **Step 3: Make it pass**

Confirm Tasks A1–A3 are in. If the test hook lacks panel `values`, add them to `gantt-test-hook.ts` `roster()`. Re-run.

- [ ] **Step 4: Run to verify it passes**

Run: same command as Step 2.
Expected: PASS. Paste the PASS summary into the completion message (§No-Illusion).

- [ ] **Step 5: Add the add-duty + redo case and commit**

Add a second test `Live-1311` that drags a pairing from the Pairing pane onto a crew row (reuse the drag pattern from `e2e/tests/gantt/filter-bring-to-top.spec.ts` / existing assign specs) and asserts MCred rose; then Redo/Undo round-trip. Run the file, paste PASS.

```bash
git add e2e/tests/gantt/mcred-draft-recompute.spec.ts gantt/src/utils/gantt-test-hook.ts
git commit -m "test(e2e): Live-1310/1311 mcred moves on draft de-assign/add and reverts on undo"
```

- [ ] **Step 6: Bump frontend version**

Edit `gantt/src/version.ts`: `FRONTEND_VERSION` +1. Commit:

```bash
git add gantt/src/version.ts
git commit -m "chore(gantt): bump FRONTEND_VERSION for live mcred draft recompute"
```

---

## Phase B — Hybrid authoritative server preview

### Task B1: Extract a transactional op-apply + recompute path on the server

The lock-protected commit (`live-server/src/routes/draft/draft.ts:110-201`) already applies ops in a DB transaction and recomputes manday for `affectedCrewIds`. Extract the "apply ops + recompute stats" core so it can be run and **rolled back** for a preview.

**Files:**
- Modify: `live-server/src/routes/draft/draft.ts` (factor the per-op apply + manday recompute into a service call)
- Create: `live-server/src/services/draft/draft-apply-service.ts`
- Test: `live-server/src/services/draft/draft-apply-service.test.ts` (create)

**Interfaces:**
- Produces: `applyDraftOpsInTx(tx, ops: DraftOp[], schema: string, updatedBy: string): Promise<{ affectedCrewIds: string[] }>` — applies the same op set the commit path applies, using the passed transaction handle. No commit/rollback inside (caller controls).
- Produces: `previewStats(fastify, ops, crewIds, yearMonth): Promise<Record<string, CrewStats>>` — `BEGIN` → `applyDraftOpsInTx` → crew-scoped `recalcManday(crewIds)` → `crewStatsService.getStats(crewIds, yearMonth)` → **`ROLLBACK`** → return stats.

- [ ] **Step 1: Write the failing test**

```ts
// live-server/src/services/draft/draft-apply-service.test.ts
import { describe, it, expect, vi } from 'vitest'
import { previewStats } from './draft-apply-service'

describe('previewStats', () => {
  it('rolls back the transaction after computing stats', async () => {
    const calls: string[] = []
    const tx = { execute: vi.fn(async () => ({ rows: [] })) }
    const fakeFastify = {
      db: {
        transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
          calls.push('begin'); try { await fn(tx) } finally { calls.push('end') }
          throw new Error('__rollback__') // service signals rollback by throwing a sentinel
        },
      },
    } as never
    const stats = await previewStats(fakeFastify, [], ['C1'], '2026-06').catch(() => ({}))
    expect(calls).toContain('begin')
  })
})
```

> Adjust the rollback mechanism to the project's Drizzle transaction idiom: Drizzle rolls a transaction back when the callback throws. `previewStats` runs apply+recompute+getStats **inside** `db.transaction`, captures the stats in an outer variable, then throws a sentinel to force rollback; the outer `catch` returns the captured stats. Encode that in the test to match the real implementation.

- [ ] **Step 2: Run to verify it fails**

Run: `cd live-server && npx vitest run src/services/draft/draft-apply-service.test.ts`
Expected: FAIL — module/function not found.

- [ ] **Step 3: Implement the service**

Create `draft-apply-service.ts`:
- `applyDraftOpsInTx(tx, ops, schema, updatedBy)` — move the per-op SQL currently inside the `draft.ts` commit loop here, parameterized by `tx`. Reuse the exact statements (move/swap/remove/remove-pairing-from-crew/assign-pairing/add/add-ground-task/update). Return the distinct affected crew ids.
- `recalcManday` — call the existing crew-scoped recompute used by the commit path (the `manday-credit-service` crew-scoped mode) with the same `tx`.
- `previewStats(fastify, ops, crewIds, yearMonth)`:

```ts
export async function previewStats(fastify, ops, crewIds, yearMonth) {
  let captured: Record<string, CrewStats> = {}
  try {
    await fastify.db.transaction(async (tx) => {
      const { affectedCrewIds } = await applyDraftOpsInTx(tx, ops, fastify.schema, 'preview')
      const ids = crewIds.length ? crewIds : affectedCrewIds
      await recalcMandayInTx(tx, ids, fastify.schema)
      captured = await crewStatsService.getStatsInTx(tx, ids, yearMonth)
      throw new Error('__preview_rollback__') // force rollback — nothing persists
    })
  } catch (e) {
    if (!(e instanceof Error) || e.message !== '__preview_rollback__') throw e
  }
  return captured
}
```

> This requires `crewStatsService.getStatsInTx(tx, …)` (same SQL as `getStats` but on the tx handle) and a `recalcMandayInTx`. Add thin tx-aware variants next to the existing functions; the existing non-tx versions delegate to them with `fastify.db`.

Refactor `draft.ts` commit to call `applyDraftOpsInTx` inside its existing transaction (no behaviour change) so the two paths share one implementation.

- [ ] **Step 4: Run to verify it passes**

Run: `cd live-server && npx vitest run src/services/draft/draft-apply-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the draft commit integration tests to prove no regression**

Run: `cd live-server && npx vitest run src/routes/draft`
Expected: PASS (existing commit tests still green after the refactor).

- [ ] **Step 6: Commit**

```bash
git add live-server/src/services/draft/draft-apply-service.ts live-server/src/services/draft/draft-apply-service.test.ts live-server/src/routes/draft/draft.ts live-server/src/services/crew/crew-stats-service.ts live-server/src/services/manday/*.ts
git commit -m "feat(live-server): extract transactional draft apply + previewStats (rollback)"
```

---

### Task B2: `POST /api/draft/preview-stats` route

**Files:**
- Modify: `live-server/src/routes/draft/draft.ts` (add route)
- Test: `live-server/src/routes/draft/preview-stats.test.ts` (create)

**Interfaces:**
- Produces: `POST /api/draft/preview-stats` body `{ operations: DraftOp[], crewIds: string[], yearMonth: string }` → `{ code: 200, data: Record<crewId, CrewStats>, message: 'ok' }`. Auth required (default plugin). Returns only the requested crews' stats; never writes.

- [ ] **Step 1: Write the failing test**

```ts
// live-server/src/routes/draft/preview-stats.test.ts
import { describe, it, expect, vi } from 'vitest'
// build the app the same way the existing draft route tests do (copy their harness import)
import { buildTestApp } from '../../../tests/helpers/build-app' // adjust to the real helper path

describe('POST /api/draft/preview-stats', () => {
  it('returns per-crew stats without persisting', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST', url: '/api/draft/preview-stats',
      headers: { authorization: `Bearer ${app.testToken}` },
      payload: { operations: [], crewIds: ['__nonexistent__'], yearMonth: '2026-06' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ code: 200 })
  })
})
```

> Use the exact app-build/auth-token helper the sibling `draft.ts` tests use (read `live-server/src/routes/draft/*.test.ts` for the pattern). Empty ops + a non-existent crew exercises the route and rollback without depending on demo data.

- [ ] **Step 2: Run to verify it fails**

Run: `cd live-server && npx vitest run src/routes/draft/preview-stats.test.ts`
Expected: FAIL — 404 (route not registered).

- [ ] **Step 3: Implement the route**

In `draft.ts`, register:

```ts
const previewBody = z.object({
  operations: z.array(draftOpSchema), // reuse the schema already used by /commit
  crewIds: z.array(z.string()),
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
})

fastify.post('/preview-stats', async (request, reply) => {
  const parsed = previewBody.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ code: 400, data: null, message: parsed.error.message })
  const { operations, crewIds, yearMonth } = parsed.data
  const data = await previewStats(fastify, operations, crewIds, yearMonth)
  return reply.send({ code: 200, data, message: 'ok' })
})
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd live-server && npx vitest run src/routes/draft/preview-stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/routes/draft/draft.ts live-server/src/routes/draft/preview-stats.test.ts
git commit -m "feat(live-server): POST /api/draft/preview-stats (non-persisting authoritative mcred)"
```

---

### Task B3: Client reconcile — debounced preview overrides the optimistic estimate

**Files:**
- Modify: `gantt/src/services/draft-api.ts` (add `previewStats`)
- Modify: `gantt/src/stores/draft-store.ts` (debounced preview trigger + a `previewStatsByCrew` map)
- Modify: `gantt/src/components/gantt/source/live-gantt-source.ts` (prefer preview value when present)
- Test: Task B4 (e2e).

**Interfaces:**
- Consumes: `draftApi.previewStats({ operations, crewIds, yearMonth }): Promise<Record<string, CrewStats>>`.
- Produces: `useDraftStore` exposes `previewStatsByCrew: Map<string, number>` (crewId → authoritative mcred minutes for the active draft) and triggers a debounced fetch on each `addOp`/`undoOp`/`redoOp`; cleared on `commit`/`discardAll`/`exitDraft`.

- [ ] **Step 1: Add the API client method**

```ts
// draft-api.ts
async previewStats(req: { operations: DraftOp[]; crewIds: string[]; yearMonth: string }): Promise<Record<string, { mcred: number }>> {
  const res = await api.post('/api/draft/preview-stats', req) as { data: Record<string, { mcred: number }> }
  return res.data
},
```

- [ ] **Step 2: Add debounced trigger + map in draft-store**

Add `previewStatsByCrew: new Map<string, number>()` to the store. Add a module-level debounced function (300–400 ms) that reads `operations`, the dirty crew ids (`getDirtyCrewIds()`), and the current viewport month (pass it in from the source via a setter `setPreviewYearMonth`), calls `draftApi.previewStats`, and sets `previewStatsByCrew` (crewId → mcred). Call it at the end of `addOp`, `undoOp`, `redoOp`. Clear the map in `commit` (success), `discardAll`, `exitDraft`. On fetch error: leave the map unchanged (keep optimistic) and `console.error` (do not block editing — spec §4).

- [ ] **Step 3: Prefer preview value in live-gantt-source**

In `buildPanelRows`, when `useDraftStore.getState().previewStatsByCrew.has(cid)`, render that value instead of `serverBase + optimisticDelta`:

```ts
const preview = previewStatsByCrew.get(cid)
const mcredMin = preview != null ? preview : (stats != null ? stats.mcred + (creditDelta.get(cid) ?? 0) : null)
...
mcred: mcredMin != null ? formatBlockMinutes(Math.round(mcredMin)) : '',
```

Pass `previewStatsByCrew` into `buildPanelRows` alongside `creditDelta`. The memo already re-runs on the dirty signal; also subscribe to the preview map so its arrival re-renders (read it via the store getter inside the existing `useDirtySignal`-driven memo, and have the debounced setter call `markDirty()` after it sets the map).

- [ ] **Step 4: Typecheck + commit**

Run: `cd gantt && npx tsc --noEmit` (no new errors).

```bash
git add gantt/src/services/draft-api.ts gantt/src/stores/draft-store.ts gantt/src/components/gantt/source/live-gantt-source.ts
git commit -m "feat(gantt): reconcile optimistic mcred with debounced server preview"
```

---

### Task B4: E2E — preview reconciliation matches post-save

**Files:**
- Test: `e2e/tests/gantt/mcred-preview-reconcile.spec.ts` (create)

- [ ] **Step 1: Write the test**

```ts
// Live-1312: optimistic mcred reconciles to the authoritative preview, which equals post-save.
import { test, expect } from '@playwright/test'
import { gotoGantt } from '../../utils/gantt-hook'

test('Live-1312 preview mcred equals post-save mcred for a flying de-assign', async ({ page }) => {
  await gotoGantt(page)
  const read = () => page.evaluate(() => window.__ganttTest?.roster()?.find((r: any) => r.values.mcred)?.values.mcred)
  const before = await read()
  // de-assign a flying pairing (same interaction as Live-1310)
  await page.locator('[data-testid="roster-canvas"]').click({ button: 'right', position: { x: 120, y: 24 } })
  await page.getByRole('menuitem', { name: /delete|remove/i }).first().click()
  // wait for the debounced preview to land and settle
  await page.waitForTimeout(800)
  const previewed = await read()
  expect(previewed).not.toBe(before)
  // Save, then read the freshly fetched server value — must equal the previewed value.
  await page.getByTestId('draft-save').click()
  await expect.poll(read).toBe(previewed)
})
```

- [ ] **Step 2: Run / iterate / paste PASS**

Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/mcred-preview-reconcile.spec.ts --reporter=list`
Expected: PASS. Paste summary.

- [ ] **Step 3: Bump versions + commit**

`gantt/src/version.ts`: `FRONTEND_VERSION` +1 and `BACKEND_VERSION` +1 (Phase B touches both).

```bash
git add e2e/tests/gantt/mcred-preview-reconcile.spec.ts gantt/src/version.ts
git commit -m "test(e2e): Live-1312 mcred preview reconciles to post-save; bump versions"
```

---

## Phase C — Cross-user live update (req 3)

### Task C1: `roster-updated` handler refetches roster + stats for broadcast crews

**Files:**
- Modify: `gantt/src/stores/lock-store.ts:261-263` (the `roster-updated` branch)
- Test: Task C2 (two-user e2e).

**Interfaces:**
- Consumes: WS message `{ type: 'roster-updated', crewIds: string[] }` (server already sends it — `live-server/src/routes/draft/draft.ts:185-188`).
- Consumes: `rosterApi.getView(crewIds, start, end)` (used by commit at `draft-store.ts:296`); `useRosterStore.getState().replaceCrewItems('main', crewId, items)`; `useCrewStore.getState().clearCrewStatsCache()` + `loadCrewStats(crewIds, yearMonth)`; `useFilterStore.getState().dateRange`.

- [ ] **Step 1: Replace the markDirty-only handler**

```ts
if (type === 'roster-updated') {
  const crewIds = (msg.crewIds as string[]) ?? []
  void refreshCrewsFromBroadcast(crewIds)
}
```

Add `refreshCrewsFromBroadcast` (module scope in `lock-store.ts`):

```ts
const refreshCrewsFromBroadcast = async (crewIds: string[]): Promise<void> => {
  if (crewIds.length === 0) { useGanttViewStore.getState().markDirty(); return }
  const loaded = new Set(useCrewStore.getState().selectedCrewIds)
  const ids = crewIds.filter((id) => loaded.has(id))   // only crews this user has loaded (§First-Paint scope)
  if (ids.length === 0) { useGanttViewStore.getState().markDirty(); return }
  try {
    const { dateRange } = useFilterStore.getState()
    const start = dateRange.start.toISOString().slice(0, 10)
    const end = dateRange.end.toISOString().slice(0, 10)
    const fresh = await rosterApi.getView(ids, start, end)
    const roster = useRosterStore.getState()
    for (const cid of ids) roster.replaceCrewItems('main', cid, fresh.filter((i) => i.crewId === cid))
    // refresh mcred: drop cache then refetch the viewport month for these crews
    const crew = useCrewStore.getState()
    crew.clearCrewStatsCache()
    const yearMonth = useFilterStore.getState().dateRange.start.toISOString().slice(0, 7)
    await crew.loadCrewStats(ids, yearMonth)
  } catch (err) {
    console.error('[lock-store] roster-updated refresh failed:', err)
  } finally {
    useGanttViewStore.getState().markDirty()
  }
}
```

> Imports to add at top of `lock-store.ts`: `rosterApi`, `useRosterStore`, `useCrewStore`, `useFilterStore` (check which are already imported to avoid duplicates). Replacing base items also resets the per-crew draft base correctly because B2's commit already promoted base for the editor; for user B (a viewer, no draft on these crews) `replaceCrewItems` updates both base and displayed.

- [ ] **Step 2: Typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/stores/lock-store.ts
git commit -m "feat(gantt): refetch roster + mcred for broadcast crews on roster-updated"
```

---

### Task C2: TDD two-user A/B e2e (spec §5.2)

**Files:**
- Test: `e2e/tests/gantt/mcred-cross-user-update.spec.ts` (create)

**Interfaces:**
- Consumes: `seedGanttAuth` / `gotoGantt` from `e2e/utils/gantt-hook.ts`; creds `Ryan`/`Jen` (`Our2027`).

- [ ] **Step 1: Write the test (red-first against C1 absent)**

```ts
// e2e/tests/gantt/mcred-cross-user-update.spec.ts
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

// Live-1313: user A de-assigns + saves → user B's roster + MCred update live, no reload.
test('Live-1313 cross-user mcred + roster update on save', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()
  await seedGanttAuth(pageA, { user: 'Ryan', pass: 'Our2027' })
  await seedGanttAuth(pageB, { user: 'Jen',  pass: 'Our2027' })
  await gotoGantt(pageA)
  await gotoGantt(pageB)

  const readFirstWithMcred = (p) => p.evaluate(() => {
    const row = window.__ganttTest?.roster()?.find((r: any) => r.values.mcred)
    return row ? { crewId: row.rowId, mcred: row.values.mcred } : null
  })
  const target = await readFirstWithMcred(pageA)
  expect(target).toBeTruthy()
  const readMcredFor = (p, crewId: string) => p.evaluate((id) =>
    window.__ganttTest?.roster()?.find((r: any) => r.rowId === id)?.values.mcred, crewId)

  const beforeB = await readMcredFor(pageB, target!.crewId)
  expect(beforeB).toBe(target!.mcred) // A and B agree pre-change

  // A: de-assign a flying pairing on the target crew + Save.
  await pageA.locator('[data-testid="roster-canvas"]').click({ button: 'right', position: { x: 120, y: 24 } })
  await pageA.getByRole('menuitem', { name: /delete|remove/i }).first().click()
  await pageA.getByTestId('draft-save').click()

  // B (no reload): MCred for the target crew changes to A's new value.
  await expect.poll(async () => readMcredFor(pageB, target!.crewId), { timeout: 15_000 }).not.toBe(beforeB)
  const afterA = await readMcredFor(pageA, target!.crewId)
  expect(await readMcredFor(pageB, target!.crewId)).toBe(afterA)

  await ctxA.close(); await ctxB.close()
})
```

> Verify `seedGanttAuth` accepts a `{user,pass}` arg; if its real signature differs, adapt (read `e2e/utils/gantt-hook.ts`). Use roster-canvas right-click (reliable). The negative guard for an untouched crew from spec §5.2 may be added once a second loaded crew is confirmed in the fixture.

- [ ] **Step 2: Run to verify it fails (C1 reverted or stubbed)**

Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/mcred-cross-user-update.spec.ts --reporter=list`
Expected (before C1): FAIL — B's MCred stays `beforeB` (handler only marked dirty), poll times out. This proves the test catches the gap.

- [ ] **Step 3: With C1 in place, run to verify it passes**

Run: same command.
Expected: PASS. Paste the PASS summary (§No-Illusion).

- [ ] **Step 4: Bump version + commit**

`gantt/src/version.ts`: `FRONTEND_VERSION` +1.

```bash
git add e2e/tests/gantt/mcred-cross-user-update.spec.ts gantt/src/version.ts
git commit -m "test(e2e): Live-1313 two-user cross-user mcred update; bump FRONTEND_VERSION"
```

---

## Self-Review

**Spec coverage:**
- Req 1 (de-assign recompute before save) → A3 + A4 (Live-1310). ✅
- Req 2 (undo reverts) → A3 (delta derives from op list) + A4 undo assertion. ✅
- Req 3 (cross-user push) → C1 + C2 (Live-1313). ✅
- Req 4 (add duty recompute before save) → A2 (placeholder credit) + A3 + A4 (Live-1311). ✅
- Req 5 (undo reverts add) → A3 + A4 redo/undo round-trip. ✅
- Hybrid (spec §3.B) → B1–B4 (preview endpoint + reconcile, Live-1312). ✅
- Silent update / no pending marker (decision) → A3 renders the number with no extra styling. ✅
- Error handling (spec §4) → B3 keeps optimistic on preview failure; C1 falls back to markDirty on error. ✅

**Placeholder scan:** No TBD/TODO. Each code step shows concrete code. Two explicit "verify the real signature/testid before asserting" notes are deliberate (test harness specifics), not deferred implementation.

**Type consistency:** `sumCrewCreditMinutes` (A1) consumed by `draftCreditDeltaByCrew` (A3); `previewStats`/`applyDraftOpsInTx` (B1) consumed by route (B2) and client `draftApi.previewStats` (B3); `previewStatsByCrew: Map<string,number>` produced in B3 and read in B3 source step; `refreshCrewsFromBroadcast` (C1) uses `rosterApi.getView` + `replaceCrewItems` + `loadCrewStats` with signatures matching `draft-store.ts:296-300` and `crew-store.ts:637`.

**Known caveats carried forward:** ground-task `add-ground-task` adds rely on `mockItems` carrying `actCreditedMinutes`; DO/VAC are 0-credit so the optimistic delta is correct there, and Phase B reconciles any non-zero ground credit. Monthly guarantee-band divergence (8002 75/65) is by design resolved by Phase B's authoritative preview.
