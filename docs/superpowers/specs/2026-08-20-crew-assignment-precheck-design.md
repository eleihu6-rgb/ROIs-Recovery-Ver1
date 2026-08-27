# Crew Assignment Pre-Check — Live Gantt

**Date:** 2026-08-20
**Status:** Draft (pending user review)
**Author:** Claude (brainstorming session)
**Scope:** Live Gantt crew ↔ pairing assignment flow

---

## 1. Problem

In Live mode, a user can assign a Pairing to a Pilot Crew via drag-drop without any
front-end validation. Three classes of bad assignments slip through:

1. **Division mismatch** — `crew.division` ≠ `pairing.division` (e.g. C-crew dragged
   onto a D-division pairing). No check is performed at any layer.
2. **No open position** — the pairing's `pairing_composition` has
   `plan = fill` for all ranks. The drag visually succeeds but the
   roster entries overflow the planned crew count.
3. **Rank acting not allowed** — `crew.crew_rank` cannot occupy the pairing's
   open `acting_rank` slots, and `rank_acting` does not list the cross-rank
   mapping. Example: FO crew dropped onto a CA-only pairing without an
   explicit `rank_acting(CA → FO)` row.

In addition, the **Save button has a race window**: the legality popup appears
only when the user clicks Save (in `save-draft.ts::preCheck`). Until then, the
Save button stays enabled. If the user clicks Save, sees the popup, and clicks
Cancel, the in-flight `commit()` may have already issued
`POST /api/roster/assign-pairing`, which writes to `roster_flight` even though
the popup was cancelled. This causes UI ↔ DB drift.

---

## 2. Goals

- Block drag-drop entirely when any of the 3 rules fails, with a clear toast.
- Port the same 3 rules to the backend `assignPairing` route as defense-in-depth.
  If any stale state reaches the server, the API returns `409` with a reason and
  the frontend rolls back the draft op.
- Close the Save button race window: while the legality popup is open, Save is
  disabled — the popup is the only way forward (Continue or Cancel).
- Reuse the existing Scenario rank-resolution logic by hoisting it into a shared
  module consumed by both Live and Scenario.
- One-time fetch of `rank_acting` per session, cached in gantt memory
  (§First-Paint discipline).

## 3. Non-Goals

- Soft warnings / override flows. All 3 rules are hard-blockers (§Failure severity).
- Multi-crew batch assignment pre-check (out of scope; future work).
- Real-time legality pre-check via the Rust engine; current `preCheck()` runs
  JS-side and is good enough for the popup. Backend validation is added on the
  assignment path only.
- Changes to the legality engine itself or to `RuleConfirmDialog` rendering.
- E2E coverage for Scenario's pre-check (Scenario port is unit-tested only in
  this round; E2E comes when its drag-drop work resumes).

---

## 4. Design Decisions (from brainstorming)

| Decision                  | Choice                                                      |
| ------------------------- | ----------------------------------------------------------- |
| Pre-check failure UX      | Block drop entirely, show toast with reason                 |
| Save button gate          | Disable Save while `RuleConfirmDialog` is open              |
| Server-side validation    | Yes, return `409 { reason, message }` on violation          |
| Code sharing (Gantt-Unify)| Shared `assignment-precheck.ts` used by Live + Scenario     |
| Failure severity          | All 3 rules are hard-blockers (no override)                 |
| Data loading              | One-time `GET /api/rank-acting` on mount, in-memory cache   |
| Visual companion          | Not used (terminal-only brainstorming was sufficient)       |

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (gantt)                                             │
│                                                              │
│  App mount                                                   │
│    └─ GET /api/rank-acting ──┐                              │
│                               ▼                              │
│  ┌──────────────────── rankActingStore ───────────────────┐ │
│  │ Map<filiale, Map<activeRank, Set<actingRank>>>         │ │
│  └─────────────────────────┬───────────────────────────────┘ │
│                            │                                  │
│  Drag-drop (pane-container.tsx)                              │
│    └─ validateAssignment(crew, pairing, rankActing)         │
│         ├─ ok → draft.addOp()                               │
│         └─ ✗   → toast.error(message) + drop rejected       │
│                                                              │
│  Save (save-draft.ts)                                       │
│    └─ preCheck() ─┬─ no violations → commit()               │
│                    └─ violations → showConfirmDialog()      │
│                                       ├─ popup open         │
│                                       │   → Save button      │
│                                       │     DISABLED         │
│                                       ├─ Continue → commit()│
│                                       └─ Cancel   → rollback│
│                                                              │
│  409 rollback (roster-api.ts)                               │
│    └─ draft.removeOpByPairingAndCrew()                      │
│    └─ pairingStore.invalidate(pairingId)                    │
│    └─ toast.error("Assignment reverted: <reason>")          │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Backend (live-server)                                         │
│                                                              │
│  POST /api/roster/assign-pairing                             │
│    └─ validateAssignment(crew, pairing, rankActing)         │
│         ├─ ok  → assignPairing()                             │
│         └─ ✗   → 409 { reason, message }                    │
│                                                              │
│  GET /api/rank-acting  (new)                                │
│    └─ returns active rows for current filiale               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Pre-check Logic (Shared Module)

**File (new):** `packages/shared-rules/src/assignment-precheck.ts`

Exported from `packages/shared-rules/src/index.ts`:

```ts
export { validateAssignment } from './assignment-precheck'
export type {
  PrecheckResult,
  PrecheckFailureReason,
  CrewInput,
  PairingInput,
  RankActingMap,
  CompositionSlot,
} from './assignment-precheck'
```

```ts
export type PrecheckResult =
  | { ok: true; actingRank: string }
  | { ok: false; reason: PrecheckFailureReason; message: string }

export type PrecheckFailureReason =
  | 'DIVISION_MISMATCH'
  | 'NO_OPEN_POSITION'
  | 'RANK_ACTING_DISALLOWED'

export interface CrewInput {
  id: string
  division: string
  rank: string                 // crew_rank on the effective date
  rankValidFrom?: Date
  rankValidTo?: Date
}

export interface PairingInput {
  id: number
  division: string
  composition: CompositionSlot[]   // [{ actingRank, plan, fill }]
}

export type RankActingMap = Map<string, Set<string>>   // activeRank → allowed actingRanks

export function validateAssignment(
  crew: CrewInput,
  pairing: PairingInput,
  rankActing: RankActingMap,
): PrecheckResult {
  // 1. Division
  if (crew.division !== pairing.division) {
    return {
      ok: false,
      reason: 'DIVISION_MISMATCH',
      message: `Crew division ${crew.division} does not match pairing division ${pairing.division}`,
    }
  }

  // 2. Open positions (plan > fill)
  const openSlots = pairing.composition.filter((s) => s.plan > s.fill)
  if (openSlots.length === 0) {
    return {
      ok: false,
      reason: 'NO_OPEN_POSITION',
      message: 'This pairing has no open positions',
    }
  }

  // 3. Rank acting — first try exact match, then downgrade via rank_acting
  const exact = openSlots.find((s) => s.actingRank === crew.rank)
  if (exact) return { ok: true, actingRank: exact.actingRank }

  const allowed = rankActing.get(crew.rank) ?? new Set<string>()
  const downgrade = openSlots.find((s) => allowed.has(s.actingRank))
  if (downgrade) return { ok: true, actingRank: downgrade.actingRank }

  return {
    ok: false,
    reason: 'RANK_ACTING_DISALLOWED',
    message:
      `Crew rank ${crew.rank} cannot fill any open rank ` +
      `(${openSlots.map((s) => s.actingRank).join(', ')}) on this pairing`,
  }
}
```

**Port from Scenario:** `gantt/src/utils/scenario-assignment-rank.ts` currently
implements these 3 rules. Refactor it to delegate to
`validateAssignment()` (imported from `@rois/shared-rules`); its
Scenario-specific extension (multiple-crew-batch logic) stays in the
Scenario file.

---

## 7. UI Flow Changes

### 7.1 Drag-drop (`gantt/src/components/layout/pane-container.tsx`)

Current code at lines 79–174 already runs `checkLiveDraftLegality` before
`draft.addOp`. Insert the new pre-check before that call:

```ts
case 'assign-pairing': {
  const pairingItem = usePairingStore.getState().items.find((i) => i.pairing.id === operation.pairingId)
  const crew = useCrewStore.getState().byId(operation.toCrewId)
  // ... existing prep

  // NEW: pre-check
  const rankActing = useRankActingStore.getState().getForFiliale(crew.filiale)
  const precheck = validateAssignment(
    { id: crew.id, division: crew.division, rank: crew.effectiveRank },
    {
      id: pairing.id,
      division: pairing.division,
      composition: pairing.composition,
    },
    rankActing,
  )
  if (!precheck.ok) {
    toast.error(precheck.message)
    break   // drop rejected; no draft op added
  }

  // Existing flow: build placeholders, checkLiveDraftLegality, draft.addOp
  // Use precheck.actingRank instead of crewEntry.crew.panelRank
  // ...
}
```

### 7.2 Save button gate (`gantt/src/components/roster/draft-toolbar.tsx`)

Current `canSave` calc:

```ts
const actionsBlocked = checking || saving
const canSave = opCount > 0 && !actionsBlocked
```

New calc:

```ts
const confirmDialog = useRuleCheckStore((s) => s.confirmDialog)
const actionsBlocked = checking || saving
const canSave = opCount > 0 && !actionsBlocked && !confirmDialog.open
```

When disabled by popup, button shows `disabled` with a tooltip
"Resolve rule violations first".

### 7.3 Backend 409 rollback (`gantt/src/services/roster-api.ts`)

Wrap `assignPairing`:

```ts
async assignPairing(payload: AssignPairingPayload) {
  try {
    return await api.post<AssignPairingResult>('/assign-pairing', payload)
  } catch (err) {
    if (isApiError(err) && err.status === 409 && err.body?.reason) {
      // Remove the draft op for this pairing+crew
      useDraftStore.getState().removeOpByPairingAndCrew(payload.pairingId, payload.crewId)
      // Invalidate pairing composition cache so gantt shows correct fill
      usePairingStore.getState().invalidate(payload.pairingId)
      // Show toast with reason
      toast.error(`Assignment reverted: ${humanizeReason(err.body.reason)}`)
    }
    throw err
  }
}
```

`humanizeReason` maps:

```
DIVISION_MISMATCH       → "Division mismatch"
NO_OPEN_POSITION        → "Pairing has no open positions"
RANK_ACTING_DISALLOWED  → "Cross-rank assignment not allowed by rank_acting"
```

---

## 8. Backend Changes

### 8.1 New endpoint — `live-server/src/routes/rank-acting.ts`

```ts
fastify.get('/api/rank-acting', async (request, reply) => {
  const filiale = request.user.filiale  // from JWT
  const rows = await db
    .select({
      activeRank: rankActing.activeRank,
      actingRank: rankActing.actingRank,
      qual: rankActing.qual,
    })
    .from(rankActing)
    .where(and(eq(rankActing.filiale, filiale), eq(rankActing.isDeleted, 0)))
  return success(reply, rows)
})
```

Registered in `live-server/src/routes/index.ts` under the existing pattern.

### 8.2 New service — `live-server/src/services/assignment/precheck-service.ts`

Calls the shared `validateAssignment` from `@rois/shared-rules` after
loading crew, pairing, and rank_acting from the DB:

```ts
import { validateAssignment } from '@rois/shared-rules'

export async function validateAssignmentOnServer(
  fastify: FastifyInstance,
  crewId: string,
  pairingId: number,
  username: string,
): Promise<PrecheckResult> {
  // Load crew (with effective rank on pairing date)
  // Load pairing header + composition
  // Load rank_acting for the crew's filiale
  const rankActing = buildRankActingMap(rows)
  return validateAssignment(crewInput, pairingInput, rankActing)
}
```

**Where the rules live:** `@rois/shared-rules` — both frontend and backend
import from the same source. No duplicated logic.

### 8.3 Modify `assign-pairing` route

```ts
fastify.post('/assign-pairing', async (request, reply) => {
  const parsed = assignPairingSchema.parse(request.body)

  // NEW: server-side pre-check
  const precheck = await validateAssignmentOnServer(
    fastify, parsed.crewId, parsed.pairingId, parsed.username,
  )
  if (!precheck.ok) {
    return reply.code(409).send({
      error: 'ASSIGNMENT_FAILED',
      reason: precheck.reason,
      message: precheck.message,
    })
  }

  const result = await rosterService.assignPairing(
    fastify,
    parsed.pairingId,
    parsed.crewId,
    precheck.actingRank,    // use precheck result
    parsed.username,
  )
  // ... existing post-mutation work
})
```

---

## 9. Frontend Data Loading

### 9.1 New store — `gantt/src/stores/rank-acting-store.ts`

```ts
interface RankActingState {
  // filiale → activeRank → Set<actingRank>
  byFiliale: Map<string, Map<string, Set<string>>>
  loading: boolean
  error: string | null

  loadForFiliale(filiale: string): Promise<void>
  getForFiliale(filiale: string): RankActingMap   // empty Map if not loaded yet
  invalidate(filiale: string): void
}
```

Behavior:

- `loadForFiliale` called on app mount from `App.tsx` (or wherever filiale is
  determined from JWT).
- Idempotent — calling again for the same filiale is a no-op unless invalidated.
- `getForFiliale` returns empty Map if not loaded yet → pre-check fails open
  with `RANK_ACTING_DISALLOWED` until loaded. Toast on first drag-drop after
  mount should be acceptable; if not, defer drag-drop until load completes.
- `invalidate` triggered on `filiale` change or after `data-save-service` writes
  to `rank_acting` (subscribe to existing Data maintenance events if any).

### 9.2 Wire-up

`gantt/src/App.tsx` (or the auth bootstrap):

```ts
useEffect(() => {
  if (filiale) {
    useRankActingStore.getState().loadForFiliale(filiale)
  }
}, [filiale])
```

---

## 10. Error Codes (Contract)

Backend → frontend contract:

```ts
type PreCheckError = {
  status: 409
  body: {
    error: 'ASSIGNMENT_FAILED'
    reason: 'DIVISION_MISMATCH' | 'NO_OPEN_POSITION' | 'RANK_ACTING_DISALLOWED'
    message: string
  }
}
```

`humanizeReason` on the frontend maps `reason` → user-facing text.

Toast messages must be **English** per the project language standard.

---

## 11. Testing Strategy

### 11.1 Playwright (per §Playwright-Required)

New spec files under `e2e/gantt/assignment/`:

| File                                                   | Coverage                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `precheck-division-mismatch.spec.ts`                   | Drag pairing from division D onto crew from division C → drop rejected, toast shown, draft op absent |
| `precheck-no-open-position.spec.ts`                    | Drag fully-filled pairing → drop rejected                                                           |
| `precheck-rank-acting-disallowed.spec.ts`              | CA-only pairing, FO crew, no `rank_acting(CA→FO)` row → drop rejected                               |
| `precheck-rank-acting-allowed.spec.ts`                 | CA-only pairing, FO crew, `rank_acting(CA→FO)` exists → drop allowed, draft op present              |
| `save-disabled-on-popup.spec.ts`                       | Drag + violations + click Save → popup opens → Save button disabled while popup open                |
| `backend-409-rollback.spec.ts`                         | Stale state path: stub `assignPairing` to return 409 → draft op removed, toast, pairing composition refreshed |

Each spec must assert concrete UI state, not just `toBeVisible` (per §No-Illusion).

### 11.2 Backend unit tests (Vitest)

`live-server/src/services/assignment/__tests__/precheck-service.test.ts`:

- All 3 failure reasons return 409 with correct shape
- Success: exact rank match
- Success: downgrade via rank_acting
- Edge case: empty composition (plan = 0)
- Edge case: crew not found → 404
- Edge case: pairing not found → 404

### 11.3 Manual verification

Before merge:

- Run `npm run check:ui` — 0 hard violations (§UI-Standard-Gate)
- Run all `e2e/gantt/assignment/` specs — all pass
- Run `live-server` Vitest — all pass

---

## 12. Rollout

- **Step 1:** Create `packages/shared-rules/` package with `validateAssignment()`
  + types + unit tests. Wire into `pnpm-workspace.yaml` (already covers
  `packages/*`).
- **Step 2:** Add `live-server` endpoint `GET /api/rank-acting`.
- **Step 3:** Add `live-server` service `precheck-service.ts` and wire into
  `assign-pairing` route — backend validation active, frontend unchanged.
  (Step 2 + 3 shippable as backend-only hotfix to close the data-drift bug
  immediately.)
- **Step 4:** Add `gantt` `rank-acting-store` + App.tsx mount-load wire-up.
- **Step 5:** Add `gantt` pre-check on drag-drop (`pane-container.tsx`).
- **Step 6:** Add Save button gate (`draft-toolbar.tsx`).
- **Step 7:** Add 409 rollback handler in `roster-api.ts` + toast.
- **Step 8:** Refactor `scenario-assignment-rank.ts` to delegate to
  `validateAssignment()` (Scenario parity).
- **Step 9:** E2E suite (`e2e/gantt/assignment/*.spec.ts`) + backend unit tests.

---

## 13. Risks and Open Questions

1. **Race on app mount** — if the user drag-drops before `rank-acting-store`
   finishes loading, the pre-check falls back to "disallowed" and may reject a
   valid assignment. Mitigation: defer drag-drop until store reports `loaded`
   (small loader at pane level). To be decided during implementation.

2. **Schema switch** — when the user switches between SIT/UAT/DEV schemas, the
   store must invalidate. Current draft already invalidates on schema change in
   some places; verify the existing pattern covers this.

3. **Filiale in JWT vs in crew record** — `crew.filiale` may differ from the
   JWT's filiale in multi-tenant setups. Use crew.filiale for the rank_acting
   lookup; if a crew has no filiale, fall back to JWT's.

4. **Scenario parity** — Scenario's existing logic handles multiple-crew-batch
   assignment differently from Live's single-crew drag. The shared
   `validateAssignment` covers the per-crew case; Scenario's batch wrapper
   stays in `scenario-assignment-rank.ts`.

---

## 14. Spec Self-Review

- [x] Placeholders: TBD only in §8.2 (implementation note). All other sections
      concrete.
- [x] Internal consistency: architecture matches flow described in §1.
- [x] Scope check: single feature, single plan, ~6 files modified + ~3 new.
- [x] Ambiguity check: failure reasons enumerated; backend contract fixed;
      frontend toast text documented.

---

**Next step:** User review. After approval, invoke `superpowers:writing-plans`
to create the implementation plan following the 9-step rollout in §12.