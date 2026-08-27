# Pairing Duty Node Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Edit Duty Nodes" dialog reachable via right-click on a Pairing in the Gantt Pairing Pane, allowing schedulers to edit Pickup/Brief/Debrief/Dropoff timestamps for each Duty (including optional double sign-in/out blocks).

**Architecture:** Backend adds `PATCH /api/pairing/:id/duty-nodes` which writes to the `pairing_segment` table. Frontend adds a full-screen dialog component that loads the pairing via the existing `GET /api/pairing/:id` endpoint, renders per-duty Gantt puck bars and time input forms with auto-link cascade logic, and sends the PATCH payload on save.

**Tech Stack:** Fastify + Drizzle ORM + Zod + Vitest (live-server); React 19 + Zustand + Tailwind + `@rois/ui` + Vitest (gantt)

---

## File Map

### New files

| Path | Role |
|---|---|
| `live-server/src/services/pairing/pairing-duty-node-service.ts` | Service: `updateDutyNodes()` — validates + writes pairing_segment |
| `live-server/src/__tests__/services/pairing/pairing-duty-node-service.test.ts` | Unit tests for `updateDutyNodes` |
| `gantt/src/utils/duty-node-utils.ts` | Pure auto-link functions |
| `gantt/src/utils/__tests__/duty-node-utils.test.ts` | Unit tests for auto-link functions |
| `gantt/src/services/pairing-duty-node-api.ts` | Frontend API client: `PATCH /api/pairing/:id/duty-nodes` |
| `gantt/src/components/pairing/duty-node-gantt-bar.tsx` | Gantt puck bar sub-component (visual only) |
| `gantt/src/components/pairing/duty-node-edit-block.tsx` | Single sign-in/out edit form sub-component |
| `gantt/src/components/pairing/duty-node-dialog.tsx` | Main dialog component |

### Modified files

| Path | Change |
|---|---|
| `live-server/src/routes/pairing/pairing.ts` | Add `PATCH /:id/duty-nodes` route |
| `gantt/src/types/pairing.ts` | Add `actStrDtUtc`/`actEndDtUtc` to `PairingSegment` |
| `gantt/src/stores/ui-store.ts` | Add `dutyNodeDialog*` state + actions |
| `gantt/src/services/pairing-api.ts` | Re-export or add `getById` returning full segment data |
| `gantt/src/components/roster/context-menu.tsx` | Add "Edit Duty Nodes" item in pairing pane branch |
| `gantt/src/components/layout/app-layout.tsx` | Mount `<DutyNodeDialog />` in dialogs section |

---

## Task 1: Backend — `updateDutyNodes` service + unit tests

**Files:**
- Create: `live-server/src/services/pairing/pairing-duty-node-service.ts`
- Create: `live-server/src/__tests__/services/pairing/pairing-duty-node-service.test.ts`

### Background

The DB model (`pairing_segment`) already has all columns needed. The write logic:
- First segment of each duty (min `seg_seq`): write `pickup_start_utc`, `pickup_end_utc` (= `brief_start_utc`), `brief_start_utc`
- Last segment of each duty (max `seg_seq`): write `debrief_end_utc`, `dropoff_start_utc` (= `debrief_end_utc`), `dropoff_end_utc`
- When `double` present, additionally:
  - Segment at `restAfterSegSeq` (Block 1 last): write `double_pickup_start_utc`, `double_pickup_end_utc` (= `double_brief_start_utc`), `double_brief_start_utc`
  - Last segment of duty: also write `double_debrief_end_utc`, `double_dropoff_start_utc` (= `double_debrief_end_utc`), `double_dropoff_end_utc`
- When `double: null`: clear ALL `double_*` columns on all segments of that duty

- [ ] **Step 1: Write the failing tests**

Create `live-server/src/__tests__/services/pairing/pairing-duty-node-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updateDutyNodes } from '../../../services/pairing/pairing-duty-node-service.js'

vi.mock('../../../utils/cache.js', () => ({
  invalidate: vi.fn(),
}))

vi.mock('../../../utils/audit.js', () => ({
  auditUpdate: vi.fn((u: string) => ({ updatedBy: u, updatedAt: new Date() })),
}))

import { invalidate } from '../../../utils/cache.js'

const createChainableDb = () => {
  const chain: any = {}
  const methods = ['select', 'from', 'where', 'update', 'set', 'orderBy', '$dynamic']
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = vi.fn((resolve: any) => resolve([]))
  chain.transaction = vi.fn(async (fn: (tx: any) => Promise<void>) => {
    await fn(chain)
  })
  return chain
}

const createFastify = () => {
  const db = createChainableDb()
  return { db, redis: {} as any } as any
}

const T = (iso: string) => new Date(iso)

const seg = (segSeq: number, overrides: Record<string, unknown> = {}) => ({
  id: segSeq,
  segSeq,
  actStrDtUtc: T('2026-03-01T10:00:00Z'),
  actEndDtUtc:  T('2026-03-01T12:00:00Z'),
  ...overrides,
})

describe('updateDutyNodes', () => {
  let fastify: ReturnType<typeof createFastify>

  beforeEach(() => {
    vi.clearAllMocks()
    fastify = createFastify()
  })

  it('writes pickup/brief to first segment and debrief/dropoff to last segment', async () => {
    const firstSeg = seg(1)
    const lastSeg  = seg(2, { actEndDtUtc: T('2026-03-01T14:00:00Z') })
    let callIdx = 0
    fastify.db.then.mockImplementation((resolve: any) => {
      callIdx++
      if (callIdx === 1) return resolve([firstSeg, lastSeg]) // fetchSegments
      return resolve([])
    })

    await updateDutyNodes(fastify, 1, [{
      dutySeq: 1,
      pickupStartUtc: '2026-03-01T08:30:00.000Z',
      briefStartUtc:  '2026-03-01T09:00:00.000Z',
      debriefEndUtc:  '2026-03-01T14:30:00.000Z',
      dropoffEndUtc:  '2026-03-01T15:00:00.000Z',
      double: undefined,
    }], 'admin')

    // set was called twice: once for first seg, once for last seg
    expect(fastify.db.set).toHaveBeenCalledTimes(2)

    const firstCall = fastify.db.set.mock.calls[0][0]
    expect(firstCall.pickupStartUtc).toEqual(new Date('2026-03-01T08:30:00.000Z'))
    expect(firstCall.pickupEndUtc).toEqual(new Date('2026-03-01T09:00:00.000Z'))
    expect(firstCall.briefStartUtc).toEqual(new Date('2026-03-01T09:00:00.000Z'))

    const lastCall = fastify.db.set.mock.calls[1][0]
    expect(lastCall.debriefEndUtc).toEqual(new Date('2026-03-01T14:30:00.000Z'))
    expect(lastCall.dropoffStartUtc).toEqual(new Date('2026-03-01T14:30:00.000Z'))
    expect(lastCall.dropoffEndUtc).toEqual(new Date('2026-03-01T15:00:00.000Z'))
  })

  it('validates that briefStart <= briefEnd (first segment actStrDtUtc)', async () => {
    const firstSeg = seg(1, { actStrDtUtc: T('2026-03-01T09:00:00Z') })
    fastify.db.then.mockImplementation((resolve: any) => resolve([firstSeg]))

    await expect(
      updateDutyNodes(fastify, 1, [{
        dutySeq: 1,
        pickupStartUtc: '2026-03-01T09:30:00.000Z',
        briefStartUtc:  '2026-03-01T09:30:00.000Z', // >= briefEnd (actStrDtUtc = 09:00)
        debriefEndUtc:  '2026-03-01T14:30:00.000Z',
        dropoffEndUtc:  '2026-03-01T15:00:00.000Z',
        double: undefined,
      }], 'admin'),
    ).rejects.toThrow('briefStartUtc must be before flight actStrDtUtc')
  })

  it('clears all double_* columns on all segments when double is null', async () => {
    const segs = [seg(1), seg(2), seg(3)]
    let callIdx = 0
    fastify.db.then.mockImplementation((resolve: any) => {
      callIdx++
      if (callIdx === 1) return resolve(segs)
      return resolve([])
    })

    await updateDutyNodes(fastify, 1, [{
      dutySeq: 1,
      pickupStartUtc: '2026-03-01T08:30:00.000Z',
      briefStartUtc:  '2026-03-01T09:00:00.000Z',
      debriefEndUtc:  '2026-03-01T14:30:00.000Z',
      dropoffEndUtc:  '2026-03-01T15:00:00.000Z',
      double: null,
    }], 'admin')

    // 3 segments: each should have double_* cleared
    const clearCalls = fastify.db.set.mock.calls.filter((call: any[]) =>
      call[0].doublePickupStartUtc === null,
    )
    expect(clearCalls.length).toBe(3)
  })

  it('invalidates cache after successful write', async () => {
    const segs = [seg(1)]
    fastify.db.then.mockImplementation((resolve: any) => resolve(segs))

    await updateDutyNodes(fastify, 42, [{
      dutySeq: 1,
      pickupStartUtc: '2026-03-01T08:30:00.000Z',
      briefStartUtc:  '2026-03-01T09:00:00.000Z',
      debriefEndUtc:  '2026-03-01T14:30:00.000Z',
      dropoffEndUtc:  '2026-03-01T15:00:00.000Z',
      double: undefined,
    }], 'admin')

    expect(invalidate).toHaveBeenCalledWith(
      expect.anything(),
      'pairing:42',
      'pairing-segments:42',
    )
  })

  it('writes double block fields to correct segments', async () => {
    const firstSeg  = seg(1)
    const splitSeg  = seg(2, { actEndDtUtc: T('2026-03-01T12:00:00Z') })
    const lastSeg   = seg(3, { actEndDtUtc: T('2026-03-02T10:00:00Z') })
    let callIdx = 0
    fastify.db.then.mockImplementation((resolve: any) => {
      callIdx++
      if (callIdx === 1) return resolve([firstSeg, splitSeg, lastSeg])
      return resolve([])
    })

    await updateDutyNodes(fastify, 1, [{
      dutySeq: 1,
      pickupStartUtc: '2026-03-01T08:30:00.000Z',
      briefStartUtc:  '2026-03-01T09:00:00.000Z',
      debriefEndUtc:  '2026-03-01T12:30:00.000Z',
      dropoffEndUtc:  '2026-03-01T13:00:00.000Z',
      double: {
        restAfterSegSeq: 2,
        pickupStartUtc:  '2026-03-02T08:00:00.000Z',
        briefStartUtc:   '2026-03-02T08:30:00.000Z',
        debriefEndUtc:   '2026-03-02T10:30:00.000Z',
        dropoffEndUtc:   '2026-03-02T11:00:00.000Z',
      },
    }], 'admin')

    // seg 2 (splitSeg) gets double_pickup/brief
    const splitCall = fastify.db.set.mock.calls.find((call: any[]) =>
      call[0].doublePickupStartUtc != null,
    )
    expect(splitCall[0].doublePickupStartUtc).toEqual(new Date('2026-03-02T08:00:00.000Z'))
    expect(splitCall[0].doubleBriefStartUtc).toEqual(new Date('2026-03-02T08:30:00.000Z'))

    // seg 3 (lastSeg) gets double_debrief/dropoff
    const lastCall = fastify.db.set.mock.calls.find((call: any[]) =>
      call[0].doubleDebriefEndUtc != null,
    )
    expect(lastCall[0].doubleDebriefEndUtc).toEqual(new Date('2026-03-02T10:30:00.000Z'))
    expect(lastCall[0].doubleDropoffEndUtc).toEqual(new Date('2026-03-02T11:00:00.000Z'))
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd live-server
npx vitest run src/__tests__/services/pairing/pairing-duty-node-service.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `updateDutyNodes`**

Create `live-server/src/services/pairing/pairing-duty-node-service.ts`:

```typescript
import { eq, and, asc } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { pairingSegment } from '../../models/pairing/pairing-segment.js'
import { invalidate } from '../../utils/cache.js'
import { auditUpdate } from '../../utils/audit.js'

export interface DutyNodeDouble {
  restAfterSegSeq: number
  pickupStartUtc: string
  briefStartUtc: string
  debriefEndUtc: string
  dropoffEndUtc: string
}

export interface DutyNodeUpdate {
  dutySeq: number
  pickupStartUtc: string
  briefStartUtc: string
  debriefEndUtc: string
  dropoffEndUtc: string
  double?: DutyNodeDouble | null
}

export async function updateDutyNodes(
  fastify: FastifyInstance,
  pairingId: number,
  duties: DutyNodeUpdate[],
  username: string,
): Promise<number> {
  let updated = 0

  await fastify.db.transaction(async (tx) => {
    for (const duty of duties) {
      const segs = await tx
        .select()
        .from(pairingSegment)
        .where(
          and(
            eq(pairingSegment.pairingId, pairingId),
            eq(pairingSegment.dutySeq, duty.dutySeq),
          ),
        )
        .orderBy(asc(pairingSegment.segSeq))

      if (segs.length === 0) continue

      const firstSeg = segs[0]
      const lastSeg  = segs[segs.length - 1]

      // Validate: briefStart must be before first flight actStart
      const briefEnd = firstSeg.actStrDtUtc
      if (new Date(duty.briefStartUtc) >= briefEnd) {
        throw new Error(
          `duty ${duty.dutySeq}: briefStartUtc must be before flight actStrDtUtc (${briefEnd.toISOString()})`,
        )
      }

      const audit = auditUpdate(username)

      // Write Block 1 first segment: pickup + brief
      await tx
        .update(pairingSegment)
        .set({
          pickupStartUtc: new Date(duty.pickupStartUtc),
          pickupEndUtc:   new Date(duty.briefStartUtc),
          briefStartUtc:  new Date(duty.briefStartUtc),
          ...audit,
        })
        .where(eq(pairingSegment.id, firstSeg.id))
      updated++

      // Write Block 1 last segment: debrief + dropoff
      const lastSegUpdates: Record<string, unknown> = {
        debriefEndUtc:   new Date(duty.debriefEndUtc),
        dropoffStartUtc: new Date(duty.debriefEndUtc),
        dropoffEndUtc:   new Date(duty.dropoffEndUtc),
        ...audit,
      }

      // Handle double block
      if (duty.double === null) {
        // Clear all double_* on every segment of this duty
        for (const s of segs) {
          await tx
            .update(pairingSegment)
            .set({
              doublePickupStartUtc: null,
              doublePickupEndUtc:   null,
              doubleBriefStartUtc:  null,
              doubleBriefEndUtc:    null,
              doubleDebriefStartUtc: null,
              doubleDebriefEndUtc:  null,
              doubleDropoffStartUtc: null,
              doubleDropoffEndUtc:  null,
              ...audit,
            })
            .where(eq(pairingSegment.id, s.id))
          updated++
        }
      } else if (duty.double != null) {
        const d = duty.double
        const splitSeg = segs.find((s) => s.segSeq === d.restAfterSegSeq)
        if (!splitSeg) {
          throw new Error(
            `duty ${duty.dutySeq}: restAfterSegSeq ${d.restAfterSegSeq} not found in segments`,
          )
        }

        // Block 1 split segment: double pickup + brief (Block 2 sign-in)
        await tx
          .update(pairingSegment)
          .set({
            doublePickupStartUtc: new Date(d.pickupStartUtc),
            doublePickupEndUtc:   new Date(d.briefStartUtc),
            doubleBriefStartUtc:  new Date(d.briefStartUtc),
            ...audit,
          })
          .where(eq(pairingSegment.id, splitSeg.id))
        updated++

        // Last segment also gets double debrief + dropoff (Block 2 sign-out)
        lastSegUpdates.doubleDebriefEndUtc   = new Date(d.debriefEndUtc)
        lastSegUpdates.doubleDropoffStartUtc = new Date(d.debriefEndUtc)
        lastSegUpdates.doubleDropoffEndUtc   = new Date(d.dropoffEndUtc)
      }

      await tx
        .update(pairingSegment)
        .set(lastSegUpdates)
        .where(eq(pairingSegment.id, lastSeg.id))
      updated++
    }
  })

  await invalidate(fastify.redis, `pairing:${pairingId}`, `pairing-segments:${pairingId}`)
  return updated
}
```

- [ ] **Step 4: Run tests again to confirm they pass**

```bash
cd live-server
npx vitest run src/__tests__/services/pairing/pairing-duty-node-service.test.ts
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/pairing/pairing-duty-node-service.ts \
        live-server/src/__tests__/services/pairing/pairing-duty-node-service.test.ts
git commit -m "feat(live-server): add updateDutyNodes service with validation and cache invalidation"
```

---

## Task 2: Backend — PATCH route

**Files:**
- Modify: `live-server/src/routes/pairing/pairing.ts`

- [ ] **Step 1: Add the Zod schema and route**

In `live-server/src/routes/pairing/pairing.ts`, add after the existing imports at the top:

```typescript
import { updateDutyNodes } from '../../services/pairing/pairing-duty-node-service.js'
```

Then add the route inside `pairingRoutes` (before the closing brace), after the existing DELETE route:

```typescript
  // PATCH /api/pairing/:id/duty-nodes — update duty node timestamps
  fastify.patch('/:id/duty-nodes', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const doubleSchema = z.object({
      restAfterSegSeq: z.number().int().positive(),
      pickupStartUtc:  z.string().datetime(),
      briefStartUtc:   z.string().datetime(),
      debriefEndUtc:   z.string().datetime(),
      dropoffEndUtc:   z.string().datetime(),
    })

    const dutySchema = z.object({
      dutySeq:        z.number().int().positive(),
      pickupStartUtc: z.string().datetime(),
      briefStartUtc:  z.string().datetime(),
      debriefEndUtc:  z.string().datetime(),
      dropoffEndUtc:  z.string().datetime(),
      double:         doubleSchema.nullable().optional(),
    })

    const bodySchema = z.object({
      duties: z.array(dutySchema).min(1),
    })

    const parsed = bodySchema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const username = (request as any).authUser?.userCode ?? 'system'

    try {
      const updated = await updateDutyNodes(fastify, numId, parsed.data.duties, username)
      return success(reply, { updated })
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('briefStartUtc') || msg.includes('restAfterSegSeq')) {
        return fail(reply, 400, msg)
      }
      return error(reply, 500, msg)
    }
  })
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd live-server
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Quick smoke test with curl**

```bash
# Start server: npm run dev (in live-server)
# Then:
curl -s -X PATCH http://localhost:3000/api/pairing/999/duty-nodes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"duties":[{"dutySeq":1,"pickupStartUtc":"bad"}]}' | jq .
```

Expected: `{ "code": 400, ... }` validation error

- [ ] **Step 4: Commit**

```bash
git add live-server/src/routes/pairing/pairing.ts
git commit -m "feat(live-server): add PATCH /api/pairing/:id/duty-nodes route"
```

---

## Task 3: Frontend — Types + pure auto-link functions + unit tests

**Files:**
- Modify: `gantt/src/types/pairing.ts`
- Create: `gantt/src/utils/duty-node-utils.ts`
- Create: `gantt/src/utils/__tests__/duty-node-utils.test.ts`

The `PairingSegment` type currently lacks `actStrDtUtc` / `actEndDtUtc` (both exist in DB and are returned by the backend — just missing from the frontend type). These are needed to lock Brief End and Debrief Start in the editor.

- [ ] **Step 1: Write the failing tests**

Create `gantt/src/utils/__tests__/duty-node-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  applyBriefStartChange,
  applyDebriefEndChange,
  applyBlock2BriefStartChange,
  applyBlock2DebriefEndChange,
  detectRestGap,
} from '../duty-node-utils'
import type { DutyEditState } from '../duty-node-utils'

const D = (iso: string) => new Date(iso)

const baseState = (): DutyEditState => ({
  dutySeq:     1,
  pickupStart: D('2026-03-01T08:30:00Z'),
  briefStart:  D('2026-03-01T09:00:00Z'),
  debriefEnd:  D('2026-03-01T14:30:00Z'),
  dropoffEnd:  D('2026-03-01T15:00:00Z'),
  double: null,
})

describe('applyBriefStartChange', () => {
  it('shifts briefStart and preserves pickup duration', () => {
    const state = baseState() // pickup: 08:30→09:00 = 30min
    const result = applyBriefStartChange(state, D('2026-03-01T10:00:00Z'))
    expect(result.briefStart).toEqual(D('2026-03-01T10:00:00Z'))
    expect(result.pickupStart).toEqual(D('2026-03-01T09:30:00Z')) // 10:00 - 30min
    expect(result.debriefEnd).toEqual(state.debriefEnd) // unchanged
    expect(result.dropoffEnd).toEqual(state.dropoffEnd) // unchanged
  })

  it('handles zero pickup duration (briefStart === pickupStart)', () => {
    const state = { ...baseState(), pickupStart: D('2026-03-01T09:00:00Z') }
    const result = applyBriefStartChange(state, D('2026-03-01T10:00:00Z'))
    expect(result.briefStart).toEqual(D('2026-03-01T10:00:00Z'))
    expect(result.pickupStart).toEqual(D('2026-03-01T10:00:00Z'))
  })
})

describe('applyDebriefEndChange', () => {
  it('shifts debriefEnd and preserves dropoff duration', () => {
    const state = baseState() // dropoff: 14:30→15:00 = 30min
    const result = applyDebriefEndChange(state, D('2026-03-01T15:00:00Z'))
    expect(result.debriefEnd).toEqual(D('2026-03-01T15:00:00Z'))
    expect(result.dropoffEnd).toEqual(D('2026-03-01T15:30:00Z')) // 15:00 + 30min
    expect(result.briefStart).toEqual(state.briefStart) // unchanged
  })
})

describe('independent edits', () => {
  it('pickupStart change does not affect briefStart or dropoffEnd', () => {
    const state = baseState()
    const result = { ...state, pickupStart: D('2026-03-01T08:00:00Z') }
    expect(result.briefStart).toEqual(state.briefStart)
    expect(result.dropoffEnd).toEqual(state.dropoffEnd)
  })

  it('dropoffEnd change does not affect debriefEnd or briefStart', () => {
    const state = baseState()
    const result = { ...state, dropoffEnd: D('2026-03-01T16:00:00Z') }
    expect(result.debriefEnd).toEqual(state.debriefEnd)
    expect(result.briefStart).toEqual(state.briefStart)
  })
})

describe('applyBlock2BriefStartChange', () => {
  it('shifts block 2 briefStart and preserves block 2 pickup duration', () => {
    const state: DutyEditState = {
      ...baseState(),
      double: {
        pickupStart: D('2026-03-02T07:30:00Z'),
        briefStart:  D('2026-03-02T08:00:00Z'),
        debriefEnd:  D('2026-03-02T14:00:00Z'),
        dropoffEnd:  D('2026-03-02T14:30:00Z'),
      },
    }
    const result = applyBlock2BriefStartChange(state, D('2026-03-02T09:00:00Z'))
    expect(result.double!.briefStart).toEqual(D('2026-03-02T09:00:00Z'))
    expect(result.double!.pickupStart).toEqual(D('2026-03-02T08:30:00Z')) // 09:00 - 30min
    expect(result.double!.debriefEnd).toEqual(state.double!.debriefEnd)
  })
})

describe('applyBlock2DebriefEndChange', () => {
  it('shifts block 2 debriefEnd and preserves block 2 dropoff duration', () => {
    const state: DutyEditState = {
      ...baseState(),
      double: {
        pickupStart: D('2026-03-02T07:30:00Z'),
        briefStart:  D('2026-03-02T08:00:00Z'),
        debriefEnd:  D('2026-03-02T14:00:00Z'),
        dropoffEnd:  D('2026-03-02T14:30:00Z'),
      },
    }
    const result = applyBlock2DebriefEndChange(state, D('2026-03-02T15:00:00Z'))
    expect(result.double!.debriefEnd).toEqual(D('2026-03-02T15:00:00Z'))
    expect(result.double!.dropoffEnd).toEqual(D('2026-03-02T15:30:00Z'))
  })
})

describe('detectRestGap', () => {
  it('returns null when all gaps < 120 min', () => {
    const segs = [
      { segSeq: 1, actEndDtUtc: '2026-03-01T10:00:00Z', actStrDtUtc: '2026-03-01T08:00:00Z' },
      { segSeq: 2, actEndDtUtc: '2026-03-01T14:00:00Z', actStrDtUtc: '2026-03-01T11:00:00Z' },
    ]
    expect(detectRestGap(segs as any)).toBeNull()
  })

  it('returns the largest gap >= 120 min', () => {
    const segs = [
      { segSeq: 1, actEndDtUtc: '2026-03-01T10:00:00Z', actStrDtUtc: '2026-03-01T08:00:00Z' },
      { segSeq: 2, actEndDtUtc: '2026-03-01T16:00:00Z', actStrDtUtc: '2026-03-01T13:00:00Z' }, // gap from 10→13 = 180min
      { segSeq: 3, actEndDtUtc: '2026-03-01T20:00:00Z', actStrDtUtc: '2026-03-01T17:00:00Z' }, // gap from 16→17 = 60min
    ]
    const result = detectRestGap(segs as any)
    expect(result).toEqual({ restAfterSegIdx: 0, restAfterSegSeq: 1, gapMinutes: 180 })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd gantt
npx vitest run src/utils/__tests__/duty-node-utils.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Add `actStrDtUtc` / `actEndDtUtc` to `PairingSegment`**

In `gantt/src/types/pairing.ts`, find the `PairingSegment` interface and add after `schEndDtUtc`:

```typescript
  actStrDtUtc: string    // actual flight departure — locks Brief End (Block 1 first seg)
  actEndDtUtc: string    // actual flight arrival  — locks Debrief Start (Block 1 last seg)
```

The full interface section becomes:
```typescript
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string
  actEndDtUtc: string
  segAssignment: string
```

- [ ] **Step 4: Create `duty-node-utils.ts`**

Create `gantt/src/utils/duty-node-utils.ts`:

```typescript
import type { PairingSegment } from '@/types'

export interface DutyDoubleState {
  pickupStart: Date
  briefStart:  Date
  debriefEnd:  Date
  dropoffEnd:  Date
}

export interface DutyEditState {
  dutySeq:     number
  pickupStart: Date
  briefStart:  Date
  // briefEnd: readonly — = first seg actStrDtUtc
  // debriefStart: readonly — = last seg actEndDtUtc
  debriefEnd:  Date
  dropoffEnd:  Date
  double:      DutyDoubleState | null
}

export interface RestGapResult {
  restAfterSegIdx: number   // 0-based index in the duty's segment array
  restAfterSegSeq: number   // the seg_seq value of Block 1 last segment
  gapMinutes:      number
}

const REST_GAP_MIN_MINUTES = 120

/** Returns the largest inter-segment gap >= REST_GAP_MIN_MINUTES, or null. */
export function detectRestGap(segs: PairingSegment[]): RestGapResult | null {
  if (segs.length < 2) return null

  let best: RestGapResult | null = null

  for (let i = 0; i < segs.length - 1; i++) {
    const gapMs = new Date(segs[i + 1].actStrDtUtc).getTime() - new Date(segs[i].actEndDtUtc).getTime()
    const gapMin = gapMs / 60000
    if (gapMin >= REST_GAP_MIN_MINUTES && (best === null || gapMin > best.gapMinutes)) {
      best = { restAfterSegIdx: i, restAfterSegSeq: segs[i].segSeq, gapMinutes: gapMin }
    }
  }

  return best
}

export function applyBriefStartChange(state: DutyEditState, newBriefStart: Date): DutyEditState {
  const pickupDuration = state.briefStart.getTime() - state.pickupStart.getTime()
  return {
    ...state,
    briefStart:  newBriefStart,
    pickupStart: new Date(newBriefStart.getTime() - pickupDuration),
  }
}

export function applyDebriefEndChange(state: DutyEditState, newDebriefEnd: Date): DutyEditState {
  const dropoffDuration = state.dropoffEnd.getTime() - state.debriefEnd.getTime()
  return {
    ...state,
    debriefEnd: newDebriefEnd,
    dropoffEnd: new Date(newDebriefEnd.getTime() + dropoffDuration),
  }
}

export function applyBlock2BriefStartChange(state: DutyEditState, newBriefStart: Date): DutyEditState {
  if (!state.double) return state
  const pickupDuration = state.double.briefStart.getTime() - state.double.pickupStart.getTime()
  return {
    ...state,
    double: {
      ...state.double,
      briefStart:  newBriefStart,
      pickupStart: new Date(newBriefStart.getTime() - pickupDuration),
    },
  }
}

export function applyBlock2DebriefEndChange(state: DutyEditState, newDebriefEnd: Date): DutyEditState {
  if (!state.double) return state
  const dropoffDuration = state.double.dropoffEnd.getTime() - state.double.debriefEnd.getTime()
  return {
    ...state,
    double: {
      ...state.double,
      debriefEnd: newDebriefEnd,
      dropoffEnd: new Date(newDebriefEnd.getTime() + dropoffDuration),
    },
  }
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd gantt
npx vitest run src/utils/__tests__/duty-node-utils.test.ts
```

Expected: all 8 tests PASS

- [ ] **Step 6: Commit**

```bash
git add gantt/src/types/pairing.ts \
        gantt/src/utils/duty-node-utils.ts \
        gantt/src/utils/__tests__/duty-node-utils.test.ts
git commit -m "feat(gantt): add actStrDtUtc/actEndDtUtc to PairingSegment, duty-node-utils with auto-link + REST gap detection"
```

---

## Task 4: Frontend — API client

**Files:**
- Create: `gantt/src/services/pairing-duty-node-api.ts`

- [ ] **Step 1: Create the API client**

Create `gantt/src/services/pairing-duty-node-api.ts`:

```typescript
import { api } from './api'

export interface DutyNodeDoublePayload {
  restAfterSegSeq: number
  pickupStartUtc:  string
  briefStartUtc:   string
  debriefEndUtc:   string
  dropoffEndUtc:   string
}

export interface DutyNodeUpdatePayload {
  dutySeq:        number
  pickupStartUtc: string
  briefStartUtc:  string
  debriefEndUtc:  string
  dropoffEndUtc:  string
  double?:        DutyNodeDoublePayload | null
}

export interface DutyNodePatchResponse {
  updated: number
}

export const pairingDutyNodeApi = {
  async updateDutyNodes(
    pairingId: number,
    duties: DutyNodeUpdatePayload[],
  ): Promise<DutyNodePatchResponse> {
    return api.patch(`/api/pairing/${pairingId}/duty-nodes`, { duties }) as Promise<DutyNodePatchResponse>
  },
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd gantt
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add gantt/src/services/pairing-duty-node-api.ts
git commit -m "feat(gantt): add pairing-duty-node-api service client"
```

---

## Task 5: Frontend — ui-store additions

**Files:**
- Modify: `gantt/src/stores/ui-store.ts`

- [ ] **Step 1: Add state and actions to `UiStore` interface**

In `gantt/src/stores/ui-store.ts`, add to the `UiStore` interface (after `groundTaskPrefill`):

```typescript
  /** Duty node editor dialog */
  dutyNodeDialogOpen:     boolean
  dutyNodeDialogPairingId: number | null

  openDutyNodeDialog:  (pairingId: number) => void
  closeDutyNodeDialog: () => void
```

- [ ] **Step 2: Add initial state and implementations**

In the `create<UiStore>((set) => ({ ... }))` call, add after `groundTaskPrefill: null,`:

```typescript
  dutyNodeDialogOpen:      false,
  dutyNodeDialogPairingId: null,

  openDutyNodeDialog:  (pairingId) => set({ dutyNodeDialogOpen: true,  dutyNodeDialogPairingId: pairingId }),
  closeDutyNodeDialog: ()          => set({ dutyNodeDialogOpen: false, dutyNodeDialogPairingId: null }),
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd gantt
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add gantt/src/stores/ui-store.ts
git commit -m "feat(gantt): add dutyNodeDialog state to ui-store"
```

---

## Task 6: Frontend — `DutyNodeGanttBar` component

**Files:**
- Create: `gantt/src/components/pairing/duty-node-gantt-bar.tsx`

This is a **display-only** sub-component that renders a proportional Gantt puck bar for a single duty. It accepts the current edit state (dates) plus readonly segment boundaries to position pucks.

- [ ] **Step 1: Create the component**

Create `gantt/src/components/pairing/duty-node-gantt-bar.tsx`:

```typescript
import type { DutyEditState } from '@/utils/duty-node-utils'
import type { PairingSegment } from '@/types'

interface Props {
  state:       DutyEditState
  segments:    PairingSegment[]   // all segs for this duty, ordered by segSeq
  firstSeg:    PairingSegment
  lastSeg:     PairingSegment
  restAfterSegSeq: number | null  // null = no double available or active
  onAddDouble: () => void
}

function pct(value: Date, start: Date, end: Date): number {
  const total = end.getTime() - start.getTime()
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, ((value.getTime() - start.getTime()) / total) * 100))
}

function widthPct(from: Date, to: Date, start: Date, end: Date): number {
  return Math.max(0, pct(to, start, end) - pct(from, start, end))
}

export function DutyNodeGanttBar({ state, segments, firstSeg, lastSeg, restAfterSegSeq, onAddDouble }: Props) {
  const isDouble = state.double != null

  const barStart = isDouble
    ? state.pickupStart
    : state.pickupStart
  const barEnd   = isDouble
    ? state.double!.dropoffEnd
    : state.dropoffEnd

  // Brief end = first flight actStart; Debrief start = last flight actEnd
  const briefEnd     = new Date(firstSeg.actStrDtUtc)
  const debriefStart = new Date(lastSeg.actEndDtUtc)

  const splitSeg = restAfterSegSeq != null
    ? segments.find((s) => s.segSeq === restAfterSegSeq)
    : null

  const restBarStart = splitSeg ? new Date(splitSeg.actEndDtUtc)           : null
  const restBarEnd   = isDouble  ? state.double!.pickupStart : null

  const b1DropEnd    = isDouble ? state.dropoffEnd          : null
  const b2BriefEnd   = isDouble ? new Date(lastSeg.actStrDtUtc) : null  // first seg of block 2

  return (
    <div className="relative h-8 w-full my-2" style={{ overflow: 'visible' }}>
      {/* Gantt bar container */}
      <div className="absolute inset-0 rounded overflow-hidden bg-muted/30 border border-border">
        {/* Pickup puck */}
        <div
          className="absolute h-full bg-amber-500/70"
          style={{
            left:  `${pct(state.pickupStart, barStart, barEnd)}%`,
            width: `${widthPct(state.pickupStart, state.briefStart, barStart, barEnd)}%`,
          }}
          title="Pickup"
        />
        {/* Brief puck */}
        <div
          className="absolute h-full bg-blue-500/70"
          style={{
            left:  `${pct(state.briefStart, barStart, barEnd)}%`,
            width: `${widthPct(state.briefStart, briefEnd, barStart, barEnd)}%`,
          }}
          title="Brief"
        />
        {/* Flights puck */}
        <div
          className="absolute h-full bg-sky-400/60"
          style={{
            left:  `${pct(briefEnd, barStart, barEnd)}%`,
            width: `${widthPct(briefEnd, isDouble && b1DropEnd ? b1DropEnd : debriefStart, barStart, barEnd)}%`,
          }}
          title="Flights / Debrief period"
        />
        {/* Debrief puck (single block or block 2) */}
        {!isDouble && (
          <div
            className="absolute h-full bg-blue-500/70"
            style={{
              left:  `${pct(debriefStart, barStart, barEnd)}%`,
              width: `${widthPct(debriefStart, state.debriefEnd, barStart, barEnd)}%`,
            }}
            title="Debrief"
          />
        )}
        {/* Dropoff puck (single block) */}
        {!isDouble && (
          <div
            className="absolute h-full bg-amber-500/70"
            style={{
              left:  `${pct(state.debriefEnd, barStart, barEnd)}%`,
              width: `${widthPct(state.debriefEnd, state.dropoffEnd, barStart, barEnd)}%`,
            }}
            title="Dropoff"
          />
        )}
        {/* REST gap puck */}
        {isDouble && restBarStart && restBarEnd && (
          <div
            className="absolute h-full bg-purple-500/50"
            style={{
              left:  `${pct(restBarStart, barStart, barEnd)}%`,
              width: `${widthPct(restBarStart, restBarEnd, barStart, barEnd)}%`,
            }}
            title="Hotel REST"
          />
        )}
        {/* Block 2 pucks */}
        {isDouble && (
          <>
            <div
              className="absolute h-full bg-amber-400/70"
              style={{
                left:  `${pct(state.double!.pickupStart, barStart, barEnd)}%`,
                width: `${widthPct(state.double!.pickupStart, state.double!.briefStart, barStart, barEnd)}%`,
              }}
              title="Block 2 Pickup"
            />
            <div
              className="absolute h-full bg-blue-400/70"
              style={{
                left:  `${pct(state.double!.briefStart, barStart, barEnd)}%`,
                width: `${widthPct(state.double!.briefStart, b2BriefEnd!, barStart, barEnd)}%`,
              }}
              title="Block 2 Brief"
            />
            <div
              className="absolute h-full bg-blue-400/70"
              style={{
                left:  `${pct(new Date(lastSeg.actEndDtUtc), barStart, barEnd)}%`,
                width: `${widthPct(new Date(lastSeg.actEndDtUtc), state.double!.debriefEnd, barStart, barEnd)}%`,
              }}
              title="Block 2 Debrief"
            />
            <div
              className="absolute h-full bg-amber-400/70"
              style={{
                left:  `${pct(state.double!.debriefEnd, barStart, barEnd)}%`,
                width: `${widthPct(state.double!.debriefEnd, state.double!.dropoffEnd, barStart, barEnd)}%`,
              }}
              title="Block 2 Dropoff"
            />
          </>
        )}
      </div>

      {/* ⊕ Add Double button — floats above bar over the REST gap */}
      {!isDouble && restAfterSegSeq != null && splitSeg && (
        <button
          type="button"
          onClick={onAddDouble}
          className="absolute -top-6 text-xs bg-purple-600 hover:bg-purple-700 text-white px-2 py-0.5 rounded cursor-pointer z-10"
          style={{
            left: `${pct(new Date(splitSeg.actEndDtUtc), barStart, barEnd)}%`,
            transform: 'translateX(-50%)',
          }}
          title="Add double sign-in/out block"
        >
          ⊕ Add Double
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd gantt
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/pairing/duty-node-gantt-bar.tsx
git commit -m "feat(gantt): add DutyNodeGanttBar proportional puck visualization component"
```

---

## Task 7: Frontend — `DutyNodeEditBlock` component

**Files:**
- Create: `gantt/src/components/pairing/duty-node-edit-block.tsx`

This component renders a single sign-in/out edit block (either Block 1 or Block 2). It shows:
- Brief Start* (linked → shifts Pickup Start), Brief End (locked)
- Pickup Start (independent)
- A pickup summary line
- Debrief Start (locked), Debrief End* (linked → shifts Dropoff End)
- Dropoff End (independent)
- A dropoff summary line

For Block 2 (double), a "× Remove" button separator row appears between the blocks (rendered from the parent dialog).

- [ ] **Step 1: Create the component**

Create `gantt/src/components/pairing/duty-node-edit-block.tsx`:

```typescript
import { useTimezoneStore } from '@/stores/timezone-store'

const localToUtc = (dateStr: string, timeStr: string, timezone: string): string => {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute]     = timeStr.split(':').map(Number)
  const noonUtcMs = Date.UTC(year, month - 1, day, 12)
  const offsetMs  = new Intl.DateTimeFormat('en', { timeZone: timezone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(noonUtcMs))
    .filter((p) => p.type === 'timeZoneName')
    .map((p) => {
      const m = p.value.match(/UTC([+-])(\d+):?(\d*)/)
      if (!m) return 0
      const sign = m[1] === '+' ? 1 : -1
      return sign * (Number(m[2]) * 60 + Number(m[3] || 0))
    })[0] ?? 0
  const localAsUtcMs = Date.UTC(year, month - 1, day, hour, minute)
  return new Date(localAsUtcMs - offsetMs * 60000).toISOString()
}

const utcToLocalDate = (utcStr: string, timezone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(utcStr))

const utcToLocalTime = (utcStr: string, timezone: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(utcStr))

const fmtDuration = (from: Date, to: Date): string => {
  const mins = Math.round((to.getTime() - from.getTime()) / 60000)
  if (mins < 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h${m.toString().padStart(2, '0')}`
}

interface Props {
  blockLabel: string           // "Block 1" or "Block 2"
  pickupStart: Date
  briefStart:  Date
  briefEnd:    Date            // locked (from flight actStrDtUtc)
  debriefStart: Date           // locked (from flight actEndDtUtc)
  debriefEnd:  Date
  dropoffEnd:  Date
  validationError?: string

  onBriefStartChange:  (d: Date) => void  // linked change (cascades to pickupStart)
  onPickupStartChange: (d: Date) => void  // independent
  onDebriefEndChange:  (d: Date) => void  // linked change (cascades to dropoffEnd)
  onDropoffEndChange:  (d: Date) => void  // independent
}

const LockedBadge = () => (
  <span className="text-xs text-muted-foreground ml-1" title="Locked to flight schedule">🔒</span>
)
const LinkedBadge = () => (
  <span className="text-xs text-blue-400 ml-1" title="Linked — shifts adjacent node">⟳</span>
)

export function DutyNodeEditBlock({
  blockLabel,
  pickupStart, briefStart, briefEnd, debriefStart, debriefEnd, dropoffEnd,
  validationError,
  onBriefStartChange, onPickupStartChange, onDebriefEndChange, onDropoffEndChange,
}: Props) {
  const tz = useTimezoneStore((s) => s.timezone)

  const handleDateTimeChange = (
    handler: (d: Date) => void,
    currentDate: Date,
  ) => (field: 'date' | 'time', value: string) => {
    const dateStr = field === 'date' ? value : utcToLocalDate(currentDate.toISOString(), tz)
    const timeStr = field === 'time' ? value : utcToLocalTime(currentDate.toISOString(), tz)
    if (dateStr && timeStr) {
      handler(new Date(localToUtc(dateStr, timeStr, tz)))
    }
  }

  const TimeInput = ({
    label,
    value,
    locked,
    linked,
    onChange,
  }: {
    label: string
    value: Date
    locked?: boolean
    linked?: boolean
    onChange?: (field: 'date' | 'time', val: string) => void
  }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground flex items-center">
        {label}
        {locked && <LockedBadge />}
        {linked && <LinkedBadge />}
      </label>
      <div className="flex gap-1">
        <input
          type="date"
          className="border rounded px-2 py-1 text-sm bg-background text-foreground w-32 disabled:opacity-50"
          value={utcToLocalDate(value.toISOString(), tz)}
          disabled={locked}
          onChange={(e) => onChange?.('date', e.target.value)}
        />
        <input
          type="time"
          className="border rounded px-2 py-1 text-sm bg-background text-foreground w-24 disabled:opacity-50"
          value={utcToLocalTime(value.toISOString(), tz)}
          disabled={locked}
          onChange={(e) => onChange?.('time', e.target.value)}
        />
      </div>
    </div>
  )

  const isValid = briefStart < briefEnd && debriefStart <= debriefEnd

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {blockLabel}
      </div>

      {validationError && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-2 py-1">
          {validationError}
        </div>
      )}

      {/* Sign-in section */}
      <div className="grid grid-cols-2 gap-4">
        <TimeInput
          label="Brief Start"
          value={briefStart}
          linked
          onChange={handleDateTimeChange(onBriefStartChange, briefStart)}
        />
        <TimeInput
          label="Brief End"
          value={briefEnd}
          locked
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TimeInput
          label="Pickup Start"
          value={pickupStart}
          onChange={handleDateTimeChange(onPickupStartChange, pickupStart)}
        />
        <div className="text-xs text-muted-foreground self-end pb-2">
          Pickup: {fmtDuration(pickupStart, briefStart)}
        </div>
      </div>

      {!isValid && (
        <div className="text-xs text-destructive">Brief Start must be before flight departure</div>
      )}

      {/* Sign-out section */}
      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
        <TimeInput
          label="Debrief Start"
          value={debriefStart}
          locked
        />
        <TimeInput
          label="Debrief End"
          value={debriefEnd}
          linked
          onChange={handleDateTimeChange(onDebriefEndChange, debriefEnd)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="text-xs text-muted-foreground self-end pb-2">
          Dropoff: {fmtDuration(debriefEnd, dropoffEnd)}
        </div>
        <TimeInput
          label="Dropoff End"
          value={dropoffEnd}
          onChange={handleDateTimeChange(onDropoffEndChange, dropoffEnd)}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd gantt
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/pairing/duty-node-edit-block.tsx
git commit -m "feat(gantt): add DutyNodeEditBlock sign-in/out edit form component"
```

---

## Task 8: Frontend — `DutyNodeDialog` main dialog

**Files:**
- Create: `gantt/src/components/pairing/duty-node-dialog.tsx`

This dialog orchestrates loading, state management (one `DutyEditState` per duty), Gantt bar, and edit blocks per duty. It mounts only when `dutyNodeDialogOpen === true`.

- [ ] **Step 1: Create the dialog component**

Create `gantt/src/components/pairing/duty-node-dialog.tsx`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useUiStore } from '@/stores/ui-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { pairingApi } from '@/services/pairing-api'
import { pairingDutyNodeApi } from '@/services/pairing-duty-node-api'
import type { PairingSegment } from '@/types'
import type { DutyEditState } from '@/utils/duty-node-utils'
import {
  detectRestGap,
  applyBriefStartChange,
  applyDebriefEndChange,
  applyBlock2BriefStartChange,
  applyBlock2DebriefEndChange,
} from '@/utils/duty-node-utils'
import { DutyNodeGanttBar } from './duty-node-gantt-bar'
import { DutyNodeEditBlock } from './duty-node-edit-block'
import { Button } from '@rois/ui'
import { toast } from '@rois/ui'
import { Hotel } from 'lucide-react'

/** Group flat segments by dutySeq, ordered by segSeq within each duty */
function groupByDuty(segments: PairingSegment[]): Map<number, PairingSegment[]> {
  const map = new Map<number, PairingSegment[]>()
  for (const seg of segments) {
    const list = map.get(seg.dutySeq) ?? []
    list.push(seg)
    map.set(seg.dutySeq, list)
  }
  for (const [key, segs] of map) {
    map.set(key, segs.sort((a, b) => a.segSeq - b.segSeq))
  }
  return map
}

/** Build initial DutyEditState from the first + last segment of a duty */
function buildInitialState(dutySeq: number, segs: PairingSegment[]): DutyEditState {
  const first = segs[0]
  const last  = segs[segs.length - 1]

  const defaultBrief    = new Date(first.actStrDtUtc)
  const defaultDebrief  = new Date(last.actEndDtUtc)
  const defaultPickupDur = 30 * 60000  // 30min default
  const defaultDropoffDur = 30 * 60000

  const pickupStart = first.pickupStartUtc
    ? new Date(first.pickupStartUtc)
    : new Date(defaultBrief.getTime() - defaultPickupDur)

  const briefStart = first.briefStartUtc
    ? new Date(first.briefStartUtc)
    : defaultBrief

  const debriefEnd = last.debriefEndUtc
    ? new Date(last.debriefEndUtc)
    : defaultDebrief

  const dropoffEnd = last.dropoffEndUtc
    ? new Date(last.dropoffEndUtc)
    : new Date(defaultDebrief.getTime() + defaultDropoffDur)

  // Double block
  const splitSeg = last.doublePickupStartUtc ? segs.find((s) => s.doublePickupStartUtc != null) : null
  const double = splitSeg && last.doubleDebriefEndUtc ? {
    pickupStart: new Date(splitSeg.doublePickupStartUtc!),
    briefStart:  new Date(splitSeg.doubleBriefStartUtc!),
    debriefEnd:  new Date(last.doubleDebriefEndUtc),
    dropoffEnd:  new Date(last.doubleDropoffEndUtc!),
  } : null

  return { dutySeq, pickupStart, briefStart, debriefEnd, dropoffEnd, double }
}

export function DutyNodeDialog() {
  const open      = useUiStore((s) => s.dutyNodeDialogOpen)
  const pairingId = useUiStore((s) => s.dutyNodeDialogPairingId)
  const close     = useUiStore((s) => s.closeDutyNodeDialog)
  const tz        = useTimezoneStore((s) => s.timezone)

  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [label,    setLabel]    = useState<string>('')
  const [dutyMap,  setDutyMap]  = useState<Map<number, PairingSegment[]>>(new Map())
  const [states,   setStates]   = useState<DutyEditState[]>([])
  const [saving,   setSaving]   = useState(false)
  const [dirty,    setDirty]    = useState(false)

  const dutySeqs = [...dutyMap.keys()].sort((a, b) => a - b)

  // Load pairing data on open
  useEffect(() => {
    if (!open || pairingId == null) return
    setLoading(true)
    setError(null)
    setDirty(false)
    pairingApi.getDetail(pairingId)
      .then(({ pairing, segments }) => {
        setLabel(pairing.pairingLabel ?? `Pairing #${pairingId}`)
        const map = groupByDuty(segments)
        setDutyMap(map)
        const initial = [...map.entries()]
          .sort(([a], [b]) => a - b)
          .map(([dutySeq, segs]) => buildInitialState(dutySeq, segs))
        setStates(initial)
      })
      .catch(() => setError('Failed to load pairing data'))
      .finally(() => setLoading(false))
  }, [open, pairingId])

  const updateState = useCallback((dutySeq: number, updater: (s: DutyEditState) => DutyEditState) => {
    setStates((prev) => prev.map((s) => s.dutySeq === dutySeq ? updater(s) : s))
    setDirty(true)
  }, [])

  const handleAddDouble = useCallback((dutySeq: number, restAfterSegSeq: number) => {
    const segs = dutyMap.get(dutySeq) ?? []
    const splitSeg = segs.find((s) => s.segSeq === restAfterSegSeq)!
    const lastSeg  = segs[segs.length - 1]

    const defaultPickupDur  = 30 * 60000
    const defaultDropoffDur = 30 * 60000
    const block2BriefEnd    = new Date(segs[segs.indexOf(splitSeg) + 1].actStrDtUtc)
    const block2DebriefStart = new Date(lastSeg.actEndDtUtc)

    updateState(dutySeq, (s) => ({
      ...s,
      // Re-anchor Block 1 debrief to split seg's actEnd
      debriefEnd: new Date(splitSeg.actEndDtUtc.getTime?.() ?? new Date(splitSeg.actEndDtUtc).getTime() + 30 * 60000),
      dropoffEnd: new Date(new Date(splitSeg.actEndDtUtc).getTime() + 30 * 60000),
      double: {
        pickupStart: new Date(block2BriefEnd.getTime() - defaultPickupDur),
        briefStart:  block2BriefEnd,
        debriefEnd:  new Date(block2DebriefStart.getTime() + 30 * 60000),
        dropoffEnd:  new Date(block2DebriefStart.getTime() + defaultDropoffDur + 30 * 60000),
      },
    }))
  }, [dutyMap, updateState])

  const handleRemoveDouble = useCallback((dutySeq: number) => {
    if (!window.confirm('Remove double sign-in/out block? This will clear all Block 2 data.')) return
    const segs = dutyMap.get(dutySeq) ?? []
    const lastSeg = segs[segs.length - 1]
    updateState(dutySeq, (s) => ({
      ...s,
      debriefEnd: new Date(lastSeg.actEndDtUtc),
      dropoffEnd: new Date(new Date(lastSeg.actEndDtUtc).getTime() + 30 * 60000),
      double: null,
    }))
  }, [dutyMap, updateState])

  const validate = (): boolean => {
    for (const s of states) {
      const segs = dutyMap.get(s.dutySeq) ?? []
      if (segs.length === 0) continue
      const firstSeg = segs[0]
      const briefEnd = new Date(firstSeg.actStrDtUtc)
      if (s.briefStart >= briefEnd) return false
      if (s.pickupStart > s.briefStart) return false
      if (s.debriefEnd > s.dropoffEnd) return false
      if (s.double) {
        const nextSeg = segs.find((seg) => seg.segSeq > (segs.find((ss) => ss.doublePickupStartUtc != null)?.segSeq ?? 0))
        if (nextSeg && s.double.briefStart >= new Date(nextSeg.actStrDtUtc)) return false
      }
    }
    return true
  }

  const handleSave = async () => {
    if (!pairingId || !validate()) return
    setSaving(true)
    try {
      const duties = states.map((s) => {
        const segs = dutyMap.get(s.dutySeq) ?? []
        const restGap = detectRestGap(segs)
        return {
          dutySeq:        s.dutySeq,
          pickupStartUtc: s.pickupStart.toISOString(),
          briefStartUtc:  s.briefStart.toISOString(),
          debriefEndUtc:  s.debriefEnd.toISOString(),
          dropoffEndUtc:  s.dropoffEnd.toISOString(),
          double: s.double === null ? null : s.double ? {
            restAfterSegSeq: restGap!.restAfterSegSeq,
            pickupStartUtc:  s.double.pickupStart.toISOString(),
            briefStartUtc:   s.double.briefStart.toISOString(),
            debriefEndUtc:   s.double.debriefEnd.toISOString(),
            dropoffEndUtc:   s.double.dropoffEnd.toISOString(),
          } : undefined,
        }
      })
      await pairingDutyNodeApi.updateDutyNodes(pairingId, duties)
      toast({ title: 'Duty nodes saved', variant: 'default' })
      setDirty(false)
      close()
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'Failed to save'
      toast({ title: 'Save failed', description: msg, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (dirty && !window.confirm('You have unsaved changes. Close anyway?')) return
    close()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Edit Duty Nodes</h2>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8">
          {loading && (
            <div className="text-sm text-muted-foreground text-center py-8">Loading...</div>
          )}
          {error && (
            <div className="flex flex-col items-center gap-2 py-8">
              <div className="text-sm text-destructive">{error}</div>
              <Button size="sm" onClick={() => { setError(null); setLoading(true) }}>Retry</Button>
            </div>
          )}
          {!loading && !error && dutySeqs.map((dutySeq, di) => {
            const state    = states[di]
            if (!state) return null
            const segs     = dutyMap.get(dutySeq) ?? []
            const firstSeg = segs[0]
            const lastSeg  = segs[segs.length - 1]
            const restGap  = detectRestGap(segs)
            const isDouble = state.double != null

            const fltNums = segs.map((s) => s.fltNum).join(' / ')

            return (
              <div key={dutySeq} className="space-y-3 border border-border rounded-lg p-4">
                {/* Duty header */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold bg-muted text-muted-foreground rounded px-2 py-0.5">
                    Duty {dutySeq}
                  </span>
                  <span className="text-sm font-medium">{firstSeg?.dutyStrArp} → {lastSeg?.dutyEndArp}</span>
                  <span className="text-xs text-muted-foreground">{fltNums}</span>
                </div>

                {/* Gantt bar */}
                <DutyNodeGanttBar
                  state={state}
                  segments={segs}
                  firstSeg={firstSeg}
                  lastSeg={lastSeg}
                  restAfterSegSeq={restGap?.restAfterSegSeq ?? null}
                  onAddDouble={() => restGap && handleAddDouble(dutySeq, restGap.restAfterSegSeq)}
                />

                {/* Edit forms */}
                <DutyNodeEditBlock
                  blockLabel={isDouble ? 'Block 1 — Sign in/out' : 'Sign in/out'}
                  pickupStart={state.pickupStart}
                  briefStart={state.briefStart}
                  briefEnd={new Date(firstSeg.actStrDtUtc)}
                  debriefStart={isDouble && restGap
                    ? new Date(segs.find((s) => s.segSeq === restGap.restAfterSegSeq)!.actEndDtUtc)
                    : new Date(lastSeg.actEndDtUtc)}
                  debriefEnd={state.debriefEnd}
                  dropoffEnd={state.dropoffEnd}
                  onBriefStartChange={(d) => updateState(dutySeq, (s) => applyBriefStartChange(s, d))}
                  onPickupStartChange={(d) => updateState(dutySeq, (s) => ({ ...s, pickupStart: d }))}
                  onDebriefEndChange={(d) => updateState(dutySeq, (s) => applyDebriefEndChange(s, d))}
                  onDropoffEndChange={(d) => updateState(dutySeq, (s) => ({ ...s, dropoffEnd: d }))}
                />

                {/* Hotel REST separator + Block 2 */}
                {isDouble && state.double && (
                  <>
                    <div className="flex items-center gap-2 py-2 border-y border-purple-500/40 bg-purple-500/5 rounded px-3">
                      <Hotel size={14} className="text-purple-400" />
                      <span className="text-xs text-purple-300 font-medium">HOTEL REST</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {Math.round((state.double.pickupStart.getTime() - state.dropoffEnd.getTime()) / 60000)} min
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDouble(dutySeq)}
                        className="text-xs text-destructive hover:underline ml-2"
                      >
                        × Remove
                      </button>
                    </div>

                    <DutyNodeEditBlock
                      blockLabel="Block 2 — Sign in/out"
                      pickupStart={state.double.pickupStart}
                      briefStart={state.double.briefStart}
                      briefEnd={new Date(segs[segs.findIndex((s) => s.segSeq > (restGap?.restAfterSegSeq ?? 0))].actStrDtUtc)}
                      debriefStart={new Date(lastSeg.actEndDtUtc)}
                      debriefEnd={state.double.debriefEnd}
                      dropoffEnd={state.double.dropoffEnd}
                      onBriefStartChange={(d) => updateState(dutySeq, (s) => applyBlock2BriefStartChange(s, d))}
                      onPickupStartChange={(d) => updateState(dutySeq, (s) => ({ ...s, double: s.double ? { ...s.double, pickupStart: d } : null }))}
                      onDebriefEndChange={(d) => updateState(dutySeq, (s) => applyBlock2DebriefEndChange(s, d))}
                      onDropoffEndChange={(d) => updateState(dutySeq, (s) => ({ ...s, double: s.double ? { ...s.double, dropoffEnd: d } : null }))}
                    />
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !dirty || !validate()}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd gantt
npx tsc --noEmit
```

Expected: no errors (fix any prop mismatches if needed)

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/pairing/duty-node-dialog.tsx
git commit -m "feat(gantt): add DutyNodeDialog main dialog component"
```

---

## Task 9: Frontend — Wire up (app-layout + context-menu)

**Files:**
- Modify: `gantt/src/components/layout/app-layout.tsx`
- Modify: `gantt/src/components/roster/context-menu.tsx`

- [ ] **Step 1: Mount dialog in `app-layout.tsx`**

In `gantt/src/components/layout/app-layout.tsx`, add the import at the top with the other dialog imports:

```typescript
import { DutyNodeDialog } from '@/components/pairing/duty-node-dialog'
```

Then in the dialogs section (currently lines 309–317), add `<DutyNodeDialog />` after `<FlightDetailDialog />`:

```typescript
      {/* Dialogs */}
      <TaskDetailDialog />
      <AddTaskDialog />
      <GroundTaskDialog />
      <SwapDialog />
      <FlightDetailDialog />
      <DutyNodeDialog />
```

- [ ] **Step 2: Add context menu item in `context-menu.tsx`**

In `gantt/src/components/roster/context-menu.tsx`, add the `openDutyNodeDialog` selector alongside the existing store selectors near the top of the component (after the `closeContextMenu` line):

```typescript
  const openDutyNodeDialog = useUiStore((s) => s.openDutyNodeDialog)
```

Then in the `pairing` pane branch (currently after `} else if (paneType === 'pairing' && hasTask) {`), add the "Edit Duty Nodes" item **before** the existing Select and Delete entries:

```typescript
  } else if (paneType === 'pairing' && hasTask) {
    // Pairing pane actions
    items.push(
      {
        icon: ClipboardEdit,
        label: 'Edit Duty Nodes',
        onClick: () => {
          openDutyNodeDialog(task.id)
          closeContextMenu()
        },
      },
      { icon: Crosshair, label: 'Select', onClick: () => { selectTask(task.id); closeContextMenu() } },
      {
        icon: Trash2, label: 'Delete Pairing', onClick: () => {
          // ... existing delete logic unchanged
        }, danger: true,
      },
    )
  }
```

Also add the `ClipboardEdit` import at the top of the file alongside the other lucide imports:

```typescript
import { ClipboardEdit, Crosshair, Link2, Trash2, /* ... existing */ } from 'lucide-react'
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd gantt
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Smoke test in browser**

1. Start gantt dev server: `npm run dev` in `gantt/`
2. Start live-server: `npm run dev` in `live-server/`
3. Log in, navigate to Gantt → ensure Pairing Pane is visible
4. Right-click a Pairing task → verify "Edit Duty Nodes" appears in context menu
5. Click "Edit Duty Nodes" → dialog opens
6. Verify duty rows render with Gantt bars
7. Change Brief Start → verify Pickup Start shifts proportionally
8. Click Save Changes → verify PATCH request fires (Network tab) and toast appears
9. Verify dialog closes on success

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/layout/app-layout.tsx \
        gantt/src/components/roster/context-menu.tsx
git commit -m "feat(gantt): wire up DutyNodeDialog — mount in app-layout, add context menu entry"
```

---

## Summary

After all 9 tasks:

- `PATCH /api/pairing/:id/duty-nodes` handles single and double duty blocks with server-side validation
- Right-click on a Pairing → "Edit Duty Nodes" opens the full dialog
- Each duty shows a proportional puck Gantt bar + linked time inputs
- Auto-link rules preserve Pickup/Dropoff duration on Brief/Debrief edits
- REST gap (≥ 120 min) shows ⊕ button to activate double block; × Remove deactivates
- All writes invalidate `pairing:{id}` and `pairing-segments:{id}` Redis keys
