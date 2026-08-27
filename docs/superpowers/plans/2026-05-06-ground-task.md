# Ground Task Create & Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add create/edit dialogs for ground tasks (roster_flight rows with pairing_id = NULL) to the Gantt interface, supporting multi-crew batch creation, assignment-driven auto-fill, and REST block rendering.

**Architecture:** Single batch endpoint on live-server handles atomic multi-crew creation in one DB transaction. Frontend uses a new `GroundTaskDialog` component triggered from toolbar button or Roster Pane right-click (with time prefill). A new draft op type `'add-ground-task'` carries the batch payload so commit sends one API call for all N crew members.

**Tech Stack:** Fastify + Drizzle ORM + Zod (live-server); React 19 + Zustand + @rois/ui (gantt)

**Spec:** `docs/superpowers/specs/2026-05-06-ground-task-design.md`

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Create | `sql/migration/2026-05-06-add-roster-flight-act-rest-min.sql` | DB migration: add act_rest_min column |
| Modify | `live-server/src/models/roster/roster-flight.ts` | Add actRestMin field to Drizzle schema |
| Modify | `live-server/src/services/roster/roster-service.ts` | Add createGroundTask method |
| Modify | `live-server/src/routes/roster/roster.ts` | Add POST /create-ground-task route |
| Modify | `live-server/src/__tests__/services/roster/roster-service.test.ts` | Tests for createGroundTask |
| Modify | `gantt/src/types/roster.ts` | Add actRestMin to RosterItem; add CreateGroundTaskInput; extend UpdateRosterInput |
| Modify | `gantt/src/services/roster-api.ts` | Add createGroundTask() |
| Modify | `gantt/src/services/draft-api.ts` | Add 'add-ground-task' to DraftOp union |
| Modify | `gantt/src/stores/ui-store.ts` | Add ground task dialog state + prefill |
| Modify | `gantt/src/stores/roster-store.ts` | Add addGroundTask() |
| Modify | `gantt/src/stores/draft-store.ts` | Handle 'add-ground-task' in commit + applyDraftOps |
| Create | `gantt/src/components/roster/ground-task-dialog.tsx` | Create/Edit dialog component |
| Modify | `gantt/src/components/roster/context-menu.tsx` | "Create Ground Task" + "Edit Ground Task" items |
| Modify | `gantt/src/components/panes/roster-pane.tsx` | Compute + store time prefill on background right-click; open edit dialog on ground task double-click |
| Modify | `gantt/src/components/shell/gantt-sub-toolbar.tsx` | Add "Create Ground Task" toolbar button |
| Modify | `gantt/src/components/gantt/renderers/roster-renderer.ts` | Draw REST block after ground task bar |
| Modify | `gantt/src/components/layout/app-layout.tsx` | Mount GroundTaskDialog |

---

## Task 1: DB Migration + Drizzle Model

**Files:**
- Create: `sql/migration/2026-05-06-add-roster-flight-act-rest-min.sql`
- Modify: `live-server/src/models/roster/roster-flight.ts`

- [ ] **Step 1: Create the migration SQL file**

```sql
-- sql/migration/2026-05-06-add-roster-flight-act-rest-min.sql
-- Adds act_rest_min to roster_flight for ground task REST time rendering.
-- Ground tasks: populated from assignment.rest_time at insert time.
-- Flight tasks: always NULL (REST comes from pairing_segment.duty_act_rest_min).
ALTER TABLE roster_flight ADD COLUMN IF NOT EXISTS act_rest_min integer;
```

- [ ] **Step 2: Run the migration**

```bash
cd /home/yuan.z/rois/rois-ai
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" \
  -f sql/migration/2026-05-06-add-roster-flight-act-rest-min.sql
```

Expected output: `ALTER TABLE`

- [ ] **Step 3: Verify the column exists**

```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" \
  -c "\d roster_flight" | grep act_rest_min
```

Expected: `act_rest_min | integer | |`

- [ ] **Step 4: Add actRestMin to the Drizzle model**

In `live-server/src/models/roster/roster-flight.ts`, add after the `exceptionCode` field:

```typescript
  actRestMin: integer('act_rest_min'),
```

Full file after change — add `integer` to the import and the field:

```typescript
import { pgTable, bigint, varchar, integer, smallint, numeric, timestamp } from 'drizzle-orm/pg-core'
// (integer was already imported — no change needed to import line)
```

Add inside the `pgTable` definition after `exceptionCode`:
```typescript
  actRestMin: integer('act_rest_min'),
```

- [ ] **Step 5: Commit**

```bash
git add sql/migration/2026-05-06-add-roster-flight-act-rest-min.sql \
        live-server/src/models/roster/roster-flight.ts
git commit -m "feat(db): add act_rest_min to roster_flight for ground task REST rendering"
```

---

## Task 2: Backend — createGroundTask Service Method

**Files:**
- Modify: `live-server/src/services/roster/roster-service.ts`

- [ ] **Step 1: Write the failing test first (see Task 3) — skip for now, come back**

- [ ] **Step 2: Add `createGroundTask` to rosterService**

Open `live-server/src/services/roster/roster-service.ts`. Add these imports at the top (after existing imports):

```typescript
import { assignment as assignmentTable } from '../../models/base/assignment.js'
import { crewBase } from '../../models/crew/crew-base.js'
import { lte, or, isNull, gt } from 'drizzle-orm'
```

Then add the method after `assignFlight`:

```typescript
  /**
   * Create ground task roster entries for one or more crew members in a single transaction.
   * Ground tasks always have pairing_id = NULL.
   * act_rest_min is copied from assignment.rest_time.
   * Base is resolved from crew_base effective at startDtUtc; if missing → 400 error.
   */
  async createGroundTask(
    fastify: FastifyInstance,
    data: {
      crewIds: string[]
      assignment: string
      startDtUtc: string
      endDtUtc: string
      comments?: string
    },
    username: string,
  ) {
    const startDate = new Date(data.startDtUtc)
    const endDate = new Date(data.endDtUtc)

    const result = await fastify.db.transaction(async (tx) => {
      // 1. Load assignment → get default_assignment_group and rest_time
      const [assign] = await tx
        .select({
          assignment: assignmentTable.assignment,
          defaultAssignmentGroup: assignmentTable.defaultAssignmentGroup,
          restTime: assignmentTable.restTime,
        })
        .from(assignmentTable)
        .where(eq(assignmentTable.assignment, data.assignment))

      if (!assign) {
        throw new Error(`Assignment '${data.assignment}' not found`)
      }

      // 2. Resolve effective base for each crew member at startDtUtc
      const baseMap = new Map<string, string>()
      const missingBase: string[] = []

      for (const crewId of data.crewIds) {
        const [baseRow] = await tx
          .select({ base: crewBase.base })
          .from(crewBase)
          .where(
            and(
              eq(crewBase.crewId, crewId),
              lte(crewBase.effDt, startDate),
              or(isNull(crewBase.expDt), gt(crewBase.expDt, startDate)),
            ),
          )
          .orderBy(asc(crewBase.effDt))
          .limit(1)

        if (!baseRow) {
          missingBase.push(crewId)
        } else {
          baseMap.set(crewId, baseRow.base)
        }
      }

      if (missingBase.length > 0) {
        throw new Error(
          `No valid crew_base record for ${missingBase.join(', ')} on ${startDate.toISOString().slice(0, 10)} — fix base data before creating tasks`,
        )
      }

      // 3. Batch insert all rows in one statement
      const audit = auditCreate(username)
      const rows = data.crewIds.map((crewId) => ({
        crewId,
        pairingId: null,
        base: baseMap.get(crewId)!,
        assignmentGroup: assign.defaultAssignmentGroup ?? 'GND',
        assignment: assign.assignment,
        actingRank: '',
        schStrDtUtc: startDate,
        schEndDtUtc: endDate,
        comments: data.comments ?? null,
        actRestMin: assign.restTime ?? null,
        source: 'MANUAL' as const,
        ...audit,
      }))

      return tx.insert(rosterFlight).values(rows).returning()
    })

    await invalidatePattern(fastify.redis, `${CACHE_PREFIX}:view:*`)
    return result
  },
```

Note: `asc` is already imported from `drizzle-orm` at the top of the file. Verify it is; if not, add it to the existing import.

- [ ] **Step 3: Commit**

```bash
git add live-server/src/services/roster/roster-service.ts
git commit -m "feat(roster): add createGroundTask service method with batch insert"
```

---

## Task 3: Backend — Route + Tests

**Files:**
- Modify: `live-server/src/routes/roster/roster.ts`
- Modify: `live-server/src/__tests__/services/roster/roster-service.test.ts`

- [ ] **Step 1: Add the route**

In `live-server/src/routes/roster/roster.ts`, add after the `assign-flight` route:

```typescript
  // POST /api/roster/create-ground-task — batch create ground tasks for multiple crew members
  fastify.post('/create-ground-task', async (request, reply) => {
    const schema = z.object({
      crewIds: z.array(z.string().min(1)).min(1, 'At least one crew ID required'),
      assignment: z.string().min(1),
      startDtUtc: z.string().datetime(),
      endDtUtc: z.string().datetime(),
      comments: z.string().optional(),
      username: z.string().default('system'),
    }).refine((d) => new Date(d.endDtUtc) > new Date(d.startDtUtc), {
      message: 'endDtUtc must be after startDtUtc',
      path: ['endDtUtc'],
    })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const { username, ...taskData } = parsed.data
    try {
      const result = await rosterService.createGroundTask(fastify, taskData, username)
      return success(reply, result)
    } catch (err) {
      return fail(reply, 400, (err as Error).message)
    }
  })
```

- [ ] **Step 2: Write failing tests**

Open `live-server/src/__tests__/services/roster/roster-service.test.ts`. Add a new `describe` block at the end:

```typescript
describe('createGroundTask', () => {
  const crewId = 'TEST_CREW'
  const assignment = 'APT'
  const startDtUtc = '2026-05-10T06:00:00.000Z'
  const endDtUtc = '2026-05-10T14:00:00.000Z'

  beforeEach(async () => {
    // Insert assignment fixture
    await fastify.db.insert(assignmentTable).values({
      assignment: 'APT',
      description: 'Airport Standby',
      type: 'SBY',
      colorHex: 'f97316',
      defaultAssignmentGroup: 'SBY',
      restTime: 480,
      ftPct: '0',
      wpPct: '0',
      divideCrewManday: 'E',
      recaLabel: 'Y',
      dpGap: 0,
      isAdhoc: 0,
      isRecency: 0,
      isQualifier: 0,
      displayLabelWhenAvailable: 'N',
      createdBy: 'test',
      updatedBy: 'test',
    }).onConflictDoNothing()

    // Insert crew_base fixture for crewId
    await fastify.db.insert(crewBase).values({
      crewId,
      base: 'PEK',
      effDt: new Date('2026-01-01'),
      expDt: null,
      isPrimeBase: 1,
      createdBy: 'test',
      updatedBy: 'test',
    }).onConflictDoNothing()
  })

  it('creates one roster_flight row per crew with pairing_id = NULL and actRestMin from assignment', async () => {
    const crewIds = [crewId, 'TEST_CREW_2']

    // Also add crew_base for second crew
    await fastify.db.insert(crewBase).values({
      crewId: 'TEST_CREW_2',
      base: 'SHA',
      effDt: new Date('2026-01-01'),
      expDt: null,
      isPrimeBase: 1,
      createdBy: 'test',
      updatedBy: 'test',
    }).onConflictDoNothing()

    const result = await rosterService.createGroundTask(
      fastify,
      { crewIds, assignment, startDtUtc, endDtUtc },
      'test_user',
    )

    expect(result).toHaveLength(2)
    for (const row of result) {
      expect(row.pairingId).toBeNull()
      expect(row.assignmentGroup).toBe('SBY')
      expect(row.assignment).toBe('APT')
      expect(row.actRestMin).toBe(480)
      expect(row.source).toBe('MANUAL')
    }
    expect(result.find((r) => r.crewId === crewId)?.base).toBe('PEK')
    expect(result.find((r) => r.crewId === 'TEST_CREW_2')?.base).toBe('SHA')
  })

  it('throws with crew IDs listed when any crew has no valid crew_base', async () => {
    await expect(
      rosterService.createGroundTask(
        fastify,
        { crewIds: [crewId, 'NO_BASE_CREW'], assignment, startDtUtc, endDtUtc },
        'test_user',
      ),
    ).rejects.toThrow('NO_BASE_CREW')
  })

  it('throws when assignment does not exist', async () => {
    await expect(
      rosterService.createGroundTask(
        fastify,
        { crewIds: [crewId], assignment: 'NONEXISTENT', startDtUtc, endDtUtc },
        'test_user',
      ),
    ).rejects.toThrow("Assignment 'NONEXISTENT' not found")
  })

  it('is atomic — rolls back all rows if one crew has no base', async () => {
    const before = await fastify.db
      .select({ id: rosterFlight.id })
      .from(rosterFlight)
      .where(eq(rosterFlight.crewId, crewId))

    await expect(
      rosterService.createGroundTask(
        fastify,
        { crewIds: [crewId, 'NO_BASE_CREW'], assignment, startDtUtc, endDtUtc },
        'test_user',
      ),
    ).rejects.toThrow()

    const after = await fastify.db
      .select({ id: rosterFlight.id })
      .from(rosterFlight)
      .where(eq(rosterFlight.crewId, crewId))

    expect(after).toHaveLength(before.length) // no new rows
  })
})
```

Add the missing import at the top of the test file (after existing imports):
```typescript
import { assignment as assignmentTable } from '../../../models/base/assignment.js'
import { crewBase } from '../../../models/crew/crew-base.js'
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npx vitest run src/__tests__/services/roster/roster-service.test.ts 2>&1 | tail -20
```

Expected: Tests fail because `createGroundTask` method references are not resolved (if running before Task 2 is done) — or if Task 2 is done, all 4 tests should pass now.

- [ ] **Step 4: Run full test suite to check no regressions**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npx vitest run 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/routes/roster/roster.ts \
        live-server/src/__tests__/services/roster/roster-service.test.ts
git commit -m "feat(roster): add POST /create-ground-task route and tests"
```

---

## Task 4: Frontend Types + API Layer

**Files:**
- Modify: `gantt/src/types/roster.ts`
- Modify: `gantt/src/services/roster-api.ts`
- Modify: `gantt/src/services/draft-api.ts`

- [ ] **Step 1: Update `RosterItem` — add `actRestMin`**

In `gantt/src/types/roster.ts`, add after `exceptionCode`:

```typescript
  // Ground task REST time (minutes). Populated from assignment.rest_time at create time.
  // Null for flight tasks (those use dutyActRestMin from pairing_segment).
  actRestMin?: number | null
```

- [ ] **Step 2: Add `CreateGroundTaskInput` type**

After the `CreateRosterInput` interface, add:

```typescript
/** Input for batch-creating ground tasks for multiple crew members */
export interface CreateGroundTaskInput {
  crewIds: string[]
  assignment: string
  startDtUtc: string
  endDtUtc: string
  comments?: string
}
```

- [ ] **Step 3: Extend `UpdateRosterInput`**

Add three optional fields to `UpdateRosterInput`:

```typescript
export interface UpdateRosterInput {
  label?: string
  assignment?: string
  assignmentGroup?: string
  actRestMin?: number | null
  role?: string
  schStrDtUtc?: string
  schEndDtUtc?: string
  comments?: string
}
```

- [ ] **Step 4: Add `createGroundTask` to `rosterApi`**

In `gantt/src/services/roster-api.ts`, add import at the top and the method:

```typescript
import type { RosterItem, CreateRosterInput, CreateGroundTaskInput, UpdateRosterInput, SwapTasksInput, MoveTaskInput } from '@/types'
```

Add the method after `assignFlight`:

```typescript
  /** Batch-create ground task entries for multiple crew members (single transaction) */
  async createGroundTask(data: CreateGroundTaskInput): Promise<RosterItem[]> {
    return api.post('/api/roster/create-ground-task', data) as Promise<RosterItem[]>
  },
```

- [ ] **Step 5: Add `'add-ground-task'` op type to `DraftOp`**

In `gantt/src/services/draft-api.ts`, update the `DraftOp` type and add the new fields:

```typescript
export interface DraftOp {
  type: 'move' | 'swap' | 'add' | 'remove' | 'update' | 'remove-pairing' | 'remove-pairing-from-crew' | 'add-flight-to-pairing' | 'create-pairing-from-flights' | 'assign-pairing' | 'add-ground-task'
  taskId?: number
  toCrewId?: string
  taskIdA?: number
  taskIdB?: number
  task?: Record<string, unknown>
  tasks?: Record<string, unknown>[]
  data?: Record<string, unknown>
  pairingId?: number
  crewId?: string
  flightId?: number
  flightIds?: number[]
  base?: string
  division?: string
  // add-ground-task fields
  groundTaskData?: {
    crewIds: string[]
    assignment: string
    startDtUtc: string
    endDtUtc: string
    comments?: string
  }
  mockItems?: Record<string, unknown>[]
}
```

- [ ] **Step 6: Commit**

```bash
git add gantt/src/types/roster.ts \
        gantt/src/services/roster-api.ts \
        gantt/src/services/draft-api.ts
git commit -m "feat(types): add actRestMin, CreateGroundTaskInput, add-ground-task DraftOp"
```

---

## Task 5: UI Store + Roster Store

**Files:**
- Modify: `gantt/src/stores/ui-store.ts`
- Modify: `gantt/src/stores/roster-store.ts`
- Modify: `gantt/src/stores/draft-store.ts`

- [ ] **Step 1: Add ground task dialog state to `ui-store.ts`**

Add to the `UiStore` interface (after the `addPaneMenu` block):

```typescript
  /** Ground task dialog */
  groundTaskDialogOpen: boolean
  groundTaskMode: 'create' | 'edit'
  groundTaskEditItem: RosterItem | null
  groundTaskPrefill: { crewId?: string; startDate?: string; startTime?: string } | null

  openGroundTaskCreate: (prefill?: { crewId?: string; startDate?: string; startTime?: string }) => void
  openGroundTaskEdit: (item: RosterItem) => void
  closeGroundTaskDialog: () => void
```

Add initial state values in `create<UiStore>`:

```typescript
  groundTaskDialogOpen: false,
  groundTaskMode: 'create',
  groundTaskEditItem: null,
  groundTaskPrefill: null,
```

Add the action implementations:

```typescript
  openGroundTaskCreate: (prefill) => set({
    groundTaskDialogOpen: true,
    groundTaskMode: 'create',
    groundTaskEditItem: null,
    groundTaskPrefill: prefill ?? null,
  }),
  openGroundTaskEdit: (item) => set({
    groundTaskDialogOpen: true,
    groundTaskMode: 'edit',
    groundTaskEditItem: item,
    groundTaskPrefill: null,
  }),
  closeGroundTaskDialog: () => set({
    groundTaskDialogOpen: false,
    groundTaskEditItem: null,
    groundTaskPrefill: null,
  }),
```

- [ ] **Step 2: Add `addGroundTask` to roster-store**

In `gantt/src/stores/roster-store.ts`, add `addGroundTask` to the store interface (after `addTask`):

```typescript
  addGroundTask: (paneId: PaneId, data: CreateGroundTaskInput) => Promise<RosterItem[] | null>
```

Add the import at the top of the file:
```typescript
import type { RosterItem, CreateRosterInput, CreateGroundTaskInput, UpdateRosterInput } from '@/types'
```

Add the implementation after the `addTask` method:

```typescript
  addGroundTask: async (paneId, data) => {
    const draft = useDraftStore.getState()
    let _tempId = -Date.now() // unique negative IDs for mock items

    // Build mock items (one per crew) for immediate Gantt rendering
    const mockItems: RosterItem[] = data.crewIds.map((crewId) => ({
      id: --_tempId,
      crewId,
      pairingId: null,
      ver: 0,
      base: '',
      label: null,
      assignmentGroup: '', // will be resolved by server; empty for draft
      assignment: data.assignment,
      role: null,
      subRole: null,
      source: 'MANUAL',
      isRequested: 0,
      isSwapped: 0,
      preference: null,
      comments: data.comments ?? null,
      score: null,
      workingHour: null,
      schStrDtUtc: data.startDtUtc,
      schEndDtUtc: data.endDtUtc,
      actStrDtUtc: null,
      actEndDtUtc: null,
      fltId: null,
      fltDt: null,
      dutySeq: null,
      segSeq: null,
      division: null,
      actingRank: '',
      activeRank: null,
      position: null,
      schCreditedMinutes: null,
      actCreditedMinutes: null,
      tagSet: null,
      exceptionCode: null,
      actRestMin: null,
      ybh: null,
      mbh: null,
      yal: null,
      mal: null,
      ydo: null,
      mdo: null,
    }))

    if (draft.active) {
      // Acquire locks for all affected crew
      for (const crewId of data.crewIds) {
        await useLockStore.getState().acquireLock(crewId, []).catch(() => {})
      }
      draft.addOp(
        {
          type: 'add-ground-task',
          groundTaskData: data,
          mockItems: mockItems as unknown as Record<string, unknown>[],
        },
        data.crewIds,
        [],
      )
      // Add mock items to base so Gantt renders them immediately
      set((state) => ({
        [paneId]: {
          ...state[paneId],
          baseItems: [...state[paneId].baseItems, ...mockItems],
          rosterItems: draft.applyDraftOps([...state[paneId].baseItems, ...mockItems]),
        },
      }))
      return mockItems
    }

    // Direct mode (no draft): call API immediately
    try {
      const created = await rosterApi.createGroundTask(data)
      set((state) => ({
        [paneId]: {
          ...state[paneId],
          baseItems: [...state[paneId].baseItems, ...created],
          rosterItems: [...state[paneId].rosterItems, ...created],
        },
      }))
      return created
    } catch (err) {
      throw err
    }
  },
```

- [ ] **Step 3: Handle `'add-ground-task'` in draft-store**

In `gantt/src/stores/draft-store.ts`, in the `commit` method's fallback branch (no locks), add the case after `'add'`:

```typescript
            case 'add-ground-task':
              if (op.groundTaskData) {
                await rosterApi.createGroundTask(op.groundTaskData)
              }
              break
```

Also add it to `applyDraftOps` in the switch statement:

```typescript
        case 'add-ground-task':
          if (op.mockItems) {
            items = [...items, ...(op.mockItems as unknown as RosterItem[])]
          }
          break
```

Add the import for `rosterApi` if not already present at the top of draft-store.ts (it already is — check and skip if so).

- [ ] **Step 4: Commit**

```bash
git add gantt/src/stores/ui-store.ts \
        gantt/src/stores/roster-store.ts \
        gantt/src/stores/draft-store.ts
git commit -m "feat(stores): add ground task dialog state, addGroundTask, add-ground-task draft op"
```

---

## Task 6: GroundTaskDialog Component

**Files:**
- Create: `gantt/src/components/roster/ground-task-dialog.tsx`

- [ ] **Step 1: Create the component**

```typescript
// gantt/src/components/roster/ground-task-dialog.tsx
import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Badge,
} from '@rois/ui'
import { X, Lock } from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { useRosterStore } from '@/stores/roster-store'
import { useCrewStore } from '@/stores/crew-store'
import { api } from '@/services/api'
import { format } from 'date-fns'

interface AssignmentOption {
  assignment: string
  description: string
  defaultAssignmentGroup: string | null
  restTime: number | null
}

const toDateStr = (iso: string | null | undefined): string =>
  iso ? iso.slice(0, 10) : ''

const toTimeStr = (iso: string | null | undefined): string =>
  iso ? iso.slice(11, 16) : ''

const combineUtc = (date: string, time: string): string =>
  `${date}T${time}:00.000Z`

const calcDuration = (startDate: string, startTime: string, endDate: string, endTime: string): string | null => {
  if (!startDate || !startTime || !endDate || !endTime) return null
  const s = new Date(combineUtc(startDate, startTime))
  const e = new Date(combineUtc(endDate, endTime))
  const diff = e.getTime() - s.getTime()
  if (diff <= 0) return 'warn'
  const h = Math.floor(diff / 3600000)
  const m = Math.round((diff % 3600000) / 60000)
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

export const GroundTaskDialog = () => {
  const open = useUiStore((s) => s.groundTaskDialogOpen)
  const mode = useUiStore((s) => s.groundTaskMode)
  const editItem = useUiStore((s) => s.groundTaskEditItem)
  const prefill = useUiStore((s) => s.groundTaskPrefill)
  const close = useUiStore((s) => s.closeGroundTaskDialog)
  const addGroundTask = useRosterStore((s) => s.addGroundTask)
  const updateTask = useRosterStore((s) => s.updateTask)
  const removeTask = useRosterStore((s) => s.removeTask)
  const crewIds = useCrewStore((s) => s.selectedCrewIds)

  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([])
  const [crewInput, setCrewInput] = useState('')
  const [assignment, setAssignment] = useState('')
  const [assignmentGroup, setAssignmentGroup] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [remark, setRemark] = useState('')
  const [assignments, setAssignments] = useState<AssignmentOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load assignment options once on mount
  useEffect(() => {
    api.get('/api/assignment').then((data) => {
      const list = (data as AssignmentOption[]).filter(
        (a) => a.defaultAssignmentGroup !== 'FLT' && a.defaultAssignmentGroup !== 'DHD',
      )
      setAssignments(list)
    }).catch(() => {})
  }, [])

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && editItem) {
      setSelectedCrewIds([editItem.crewId])
      setAssignment(editItem.assignment ?? '')
      setAssignmentGroup(editItem.assignmentGroup ?? '')
      setStartDate(toDateStr(editItem.schStrDtUtc))
      setStartTime(toTimeStr(editItem.schStrDtUtc))
      setEndDate(toDateStr(editItem.schEndDtUtc))
      setEndTime(toTimeStr(editItem.schEndDtUtc))
      setRemark(editItem.comments ?? '')
    } else {
      const today = format(new Date(), 'yyyy-MM-dd')
      setSelectedCrewIds(prefill?.crewId ? [prefill.crewId] : [])
      setAssignment('')
      setAssignmentGroup('')
      setStartDate(prefill?.startDate ?? today)
      setStartTime(prefill?.startTime ?? '')
      setEndDate(prefill?.startDate ?? today)
      setEndTime(prefill?.startTime ?? '')
      setRemark('')
    }
    setCrewInput('')
    setError(null)
    setSaving(false)
  }, [open, mode, editItem, prefill])

  const handleAssignmentChange = (val: string) => {
    setAssignment(val)
    const opt = assignments.find((a) => a.assignment === val)
    setAssignmentGroup(opt?.defaultAssignmentGroup ?? '')
  }

  const addCrew = (id: string) => {
    const trimmed = id.trim().toUpperCase()
    if (!trimmed || selectedCrewIds.includes(trimmed)) return
    setSelectedCrewIds((prev) => [...prev, trimmed])
    setCrewInput('')
  }

  const removeCrew = (id: string) => {
    setSelectedCrewIds((prev) => prev.filter((c) => c !== id))
  }

  const duration = calcDuration(startDate, startTime, endDate, endTime)

  const validate = (): string | null => {
    if (mode === 'create' && selectedCrewIds.length === 0) return 'Select at least one crew member'
    if (!assignment) return 'Assignment is required'
    if (!startDate || !startTime) return 'Start date and time are required'
    if (!endDate || !endTime) return 'End date and time are required'
    if (duration === 'warn') return 'End must be after start'
    return null
  }

  const handleSubmit = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setSaving(true)
    setError(null)
    try {
      if (mode === 'create') {
        await addGroundTask('main', {
          crewIds: selectedCrewIds,
          assignment,
          startDtUtc: combineUtc(startDate, startTime),
          endDtUtc: combineUtc(endDate, endTime),
          comments: remark || undefined,
        })
        close()
      } else if (editItem) {
        await updateTask('main', editItem.id, {
          assignment,
          assignmentGroup,
          schStrDtUtc: combineUtc(startDate, startTime),
          schEndDtUtc: combineUtc(endDate, endTime),
          comments: remark || undefined,
        })
        close()
      }
    } catch (e) {
      setError((e as Error).message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editItem) return
    if (!window.confirm('Delete this ground task? This cannot be undone.')) return
    setSaving(true)
    try {
      await removeTask('main', editItem.id)
      close()
    } catch (e) {
      setError((e as Error).message ?? 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'create' ? 'Create Ground Task' : 'Edit Ground Task'}
            {mode === 'edit' && editItem && (
              <Badge variant="outline" className="text-[10px]">#{editItem.id}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="mx-0 mb-1 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-3">
          {/* Crew */}
          <div className="grid grid-cols-[110px_1fr] items-start gap-2">
            <label className="pt-1.5 text-xs text-muted-foreground">
              {mode === 'create' ? 'Crew IDs *' : 'Crew ID'}
            </label>
            {mode === 'edit' ? (
              <div className="flex h-8 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-xs">
                <span className="font-mono font-semibold">{editItem?.crewId}</span>
                <Lock className="ml-auto h-3 w-3 text-muted-foreground/60" />
              </div>
            ) : (
              <div className="rounded-md border border-input bg-background px-2 py-1 focus-within:ring-1 focus-within:ring-ring">
                <div className="flex flex-wrap gap-1">
                  {selectedCrewIds.map((id) => (
                    <span key={id} className="flex items-center gap-1 rounded bg-accent/60 px-1.5 py-0.5 text-[11px] font-mono">
                      {id}
                      <button onClick={() => removeCrew(id)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                  <input
                    className="min-w-[80px] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    placeholder="Type ID, press Enter…"
                    value={crewInput}
                    onChange={(e) => setCrewInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addCrew(crewInput) }
                      if (e.key === ',' || e.key === ' ') { e.preventDefault(); addCrew(crewInput) }
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Assignment */}
          <div className="grid grid-cols-[110px_1fr] items-center gap-2">
            <label className="text-xs text-muted-foreground">Assignment *</label>
            <Select value={assignment} onValueChange={handleAssignmentChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select assignment…" />
              </SelectTrigger>
              <SelectContent>
                {assignments.map((a) => (
                  <SelectItem key={a.assignment} value={a.assignment} className="text-xs">
                    <span className="font-mono font-semibold">{a.assignment}</span>
                    <span className="ml-2 text-muted-foreground">— {a.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Assignment Group (auto-fill) */}
          {assignmentGroup && (
            <div className="grid grid-cols-[110px_1fr] items-center gap-2">
              <label className="text-xs text-muted-foreground">Group</label>
              <div className="flex h-8 items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 text-xs text-muted-foreground">
                <span className="font-mono font-semibold text-foreground">{assignmentGroup}</span>
                <span className="text-[10px]">auto-filled</span>
              </div>
            </div>
          )}

          {/* Start */}
          <div className="grid grid-cols-[110px_1fr] items-center gap-2">
            <label className="text-xs text-muted-foreground">Start *</label>
            <div className="flex items-center gap-1.5">
              <Input type="date" className="h-8 flex-1 text-xs" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <Input type="time" className="h-8 w-24 text-center font-mono text-xs" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              <span className="text-[10px] text-muted-foreground">UTC</span>
            </div>
          </div>

          {/* End */}
          <div className="grid grid-cols-[110px_1fr] items-start gap-2">
            <label className="pt-1.5 text-xs text-muted-foreground">End *</label>
            <div>
              <div className="flex items-center gap-1.5">
                <Input type="date" className="h-8 flex-1 text-xs" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                <Input type="time" className="h-8 w-24 text-center font-mono text-xs" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                <span className="text-[10px] text-muted-foreground">UTC</span>
              </div>
              {duration && duration !== 'warn' && (
                <p className="mt-1 text-[11px] text-green-500">✓ Duration: {duration}</p>
              )}
              {duration === 'warn' && (
                <p className="mt-1 text-[11px] text-amber-500">⚠ End must be after start</p>
              )}
            </div>
          </div>

          {/* Remark */}
          <div className="grid grid-cols-[110px_1fr] items-start gap-2">
            <label className="pt-1.5 text-xs text-muted-foreground">Remark</label>
            <textarea
              className="min-h-[52px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Optional notes…"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>
        </div>

        {/* Delete zone — edit mode only */}
        {mode === 'edit' && editItem?.pairingId === null && (
          <div className="mt-2 border-t border-border pt-3">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Danger Zone</p>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving} className="text-xs">
              Delete This Task
            </Button>
          </div>
        )}

        <DialogFooter className="items-center">
          {mode === 'create' && selectedCrewIds.length > 0 && (
            <span className="flex-1 text-[11px] text-muted-foreground">
              Will create <strong>{selectedCrewIds.length}</strong> roster {selectedCrewIds.length === 1 ? 'entry' : 'entries'}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={close} className="text-xs">Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving} className="text-xs">
            {saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add gantt/src/components/roster/ground-task-dialog.tsx
git commit -m "feat(gantt): add GroundTaskDialog component (create/edit modes)"
```

---

## Task 7: Context Menu Additions

**Files:**
- Modify: `gantt/src/components/roster/context-menu.tsx`

- [ ] **Step 1: Add "Create Ground Task" and "Edit Ground Task" to context menu**

In `context-menu.tsx`, add `SquarePlus` to the lucide imports:

```typescript
import { Edit, Trash2, ArrowRightLeft, Crosshair, Link2, PackagePlus, Pin, PinOff, Plane, SquarePlus } from 'lucide-react'
```

Add these store selectors at the top of `ContextMenu` (after existing ones):

```typescript
  const openGroundTaskCreate = useUiStore((s) => s.openGroundTaskCreate)
  const openGroundTaskEdit = useUiStore((s) => s.openGroundTaskEdit)
  const groundTaskPrefill = useUiStore((s) => s.groundTaskPrefill)
```

In the roster items section (inside `if (paneType?.startsWith('roster') && hasTask)`), replace:

```typescript
    items.push(
      { icon: Edit, label: 'Edit Task', shortcut: 'Enter', onClick: handleEdit },
      { icon: ArrowRightLeft, label: 'Swap Task', onClick: handleSwap },
    )
```

with:

```typescript
    // Ground task (pairingId === null and id > 0) → show Edit Ground Task
    if (task.pairingId === null && task.id > 0) {
      items.push({
        icon: Edit,
        label: 'Edit Ground Task',
        shortcut: 'Enter',
        onClick: () => { openGroundTaskEdit(task); closeContextMenu() },
      })
    } else {
      items.push(
        { icon: Edit, label: 'Edit Task', shortcut: 'Enter', onClick: handleEdit },
        { icon: ArrowRightLeft, label: 'Swap Task', onClick: handleSwap },
      )
    }
```

Add "Create Ground Task" item for background rows (id === -1 means background click).
Find the block `} else if (hasTask) {` and add before it:

```typescript
  // Background right-click on roster row (mockTask id = -1) → "Create Ground Task"
  if (paneType?.startsWith('roster') && task.id === -1 && task.crewId) {
    items.push({
      icon: SquarePlus,
      label: 'Create Ground Task',
      onClick: () => {
        openGroundTaskCreate(groundTaskPrefill ?? { crewId: task.crewId })
        closeContextMenu()
      },
    })
  }
```

- [ ] **Step 2: Commit**

```bash
git add gantt/src/components/roster/context-menu.tsx
git commit -m "feat(context-menu): add Create/Edit Ground Task menu items"
```

---

## Task 8: Roster Pane — Time Prefill on Background Right-Click + Double-Click Edit

**Files:**
- Modify: `gantt/src/components/panes/roster-pane.tsx`

- [ ] **Step 1: Import `xToTime` and new store actions**

In `roster-pane.tsx`, ensure `xToTime` is imported (it's in `gantt-utils`):

```typescript
import { hitTestTask, hitTestTasksInRect, yToRow, xToTime } from '@/components/gantt/gantt-utils'
```

Add store selectors in the component body (near other `useUiStore` selectors):

```typescript
  const openGroundTaskCreate = useUiStore((s) => s.openGroundTaskCreate)
  const openGroundTaskEdit = useUiStore((s) => s.openGroundTaskEdit)
  const setGroundTaskPrefill = useUiStore((s) => s.openGroundTaskCreate) // we use this to store prefill before context menu opens
```

Actually add a single selector for each:
```typescript
  const openGroundTaskCreate = useUiStore((s) => s.openGroundTaskCreate)
  const openGroundTaskEdit = useUiStore((s) => s.openGroundTaskEdit)
```

- [ ] **Step 2: Store time prefill on background right-click**

In `interactionCallbacks`, find `onItemRightClick` and update the background case:

```typescript
    onItemRightClick: (hit, clientX, clientY) => {
      if (hit.itemId !== null) {
        selectTask(hit.itemId)
        const task = items.find((i) => i.id === hit.itemId)
        if (task) openContextMenu(clientX, clientY, task, legacyPaneType, hit.rowIndex)
      } else if (hit.rowIndex >= 0) {
        // Compute click time from canvas X for ground task prefill
        const canvasEl = canvasElementRef.current
        const canvasRect = canvasEl?.getBoundingClientRect()
        const canvasX = canvasRect ? (clientX - canvasRect.left + scrollX) : 0
        const clickTime = xToTime(canvasX, dateRange.start, pxPerHour)
        const clickDateStr = clickTime.toISOString().slice(0, 10)
        const clickTimeStr = clickTime.toISOString().slice(11, 16)
        // Store prefill so context menu "Create Ground Task" can read it
        openGroundTaskCreate({ crewId: hit.rowId, startDate: clickDateStr, startTime: clickTimeStr })
        // Then immediately open context menu (openGroundTaskCreate stores prefill but also opens dialog —
        // we don't want to open dialog yet, only store prefill). Use the ui-store directly:
        useUiStore.getState().closeGroundTaskDialog()
        const mockTask = { id: -1, crewId: hit.rowId } as RosterItem
        openContextMenu(clientX, clientY, mockTask, legacyPaneType, hit.rowIndex)
      }
    },
```

Wait — `openGroundTaskCreate` both stores prefill AND opens the dialog. We need to separate these. Instead, use a simpler approach: call `openGroundTaskCreate` to store the prefill (dialog opens), then immediately close it, then open context menu. That's a flash. Better: store prefill separately without opening dialog.

Update `ui-store.ts` to add a dedicated `setGroundTaskPrefill` action (does NOT open dialog):

```typescript
  setGroundTaskPrefill: (prefill: { crewId?: string; startDate?: string; startTime?: string } | null) => void
```

Implementation:
```typescript
  setGroundTaskPrefill: (prefill) => set({ groundTaskPrefill: prefill }),
```

Then in `roster-pane.tsx`:

```typescript
  const setGroundTaskPrefill = useUiStore((s) => s.setGroundTaskPrefill)
```

And in `onItemRightClick` background case:

```typescript
      } else if (hit.rowIndex >= 0) {
        const canvasEl = canvasElementRef.current
        const canvasRect = canvasEl?.getBoundingClientRect()
        const canvasX = canvasRect ? (clientX - canvasRect.left + scrollX) : 0
        const clickTime = xToTime(canvasX, dateRange.start, pxPerHour)
        // Store prefill so context menu item can open dialog with pre-filled values
        setGroundTaskPrefill({
          crewId: hit.rowId,
          startDate: clickTime.toISOString().slice(0, 10),
          startTime: clickTime.toISOString().slice(11, 16),
        })
        const mockTask = { id: -1, crewId: hit.rowId } as RosterItem
        openContextMenu(clientX, clientY, mockTask, legacyPaneType, hit.rowIndex)
      }
```

Apply this pattern. Also add `setGroundTaskPrefill` to `ui-store.ts` interface + implementation (edit the ui-store file from Task 5 to add this method).

- [ ] **Step 3: Open edit dialog on double-click of ground task**

In `interactionCallbacks`, find `onItemDoubleClick`:

```typescript
    onItemDoubleClick: (hit) => {
      if (hit.itemId !== null) {
        const task = items.find((i) => i.id === hit.itemId)
        if (task) {
          // Ground tasks → open ground task edit dialog
          if (task.pairingId === null) {
            openGroundTaskEdit(task)
          } else {
            openTaskDetail(task)
          }
        }
      }
    },
```

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/panes/roster-pane.tsx \
        gantt/src/stores/ui-store.ts
git commit -m "feat(roster-pane): prefill time on right-click, open edit dialog on ground task double-click"
```

---

## Task 9: Toolbar Button + Mount Dialog

**Files:**
- Modify: `gantt/src/components/shell/gantt-sub-toolbar.tsx`
- Modify: `gantt/src/components/layout/app-layout.tsx`

- [ ] **Step 1: Add Create Ground Task button to toolbar**

In `gantt-sub-toolbar.tsx`, add `SquarePlus` to lucide imports:

```typescript
import {
  PanelLeftClose, PanelLeftOpen, RefreshCw,
  Filter, Keyboard, SquarePlus,
} from 'lucide-react'
```

Add the store selector inside `GanttSubToolbar`:

```typescript
  const openGroundTaskCreate = useUiStore((s) => s.openGroundTaskCreate)
```

Add the button in the right-side section of the toolbar (before or after the PaneToggles divider). Find the `ToolbarDivider` before PaneToggles and insert:

```tsx
        <ToolbarDivider />
        <ToolBtn tip="Create Ground Task" onClick={() => openGroundTaskCreate()}>
          <SquarePlus className="h-4 w-4" />
        </ToolBtn>
```

- [ ] **Step 2: Mount `GroundTaskDialog` in `app-layout.tsx`**

Add import:

```typescript
import { GroundTaskDialog } from '@/components/roster/ground-task-dialog'
```

Add inside the return JSX, alongside the other dialogs (e.g. after `<AddTaskDialog />`):

```tsx
        <GroundTaskDialog />
```

- [ ] **Step 3: Start dev server and verify dialog opens from toolbar**

```bash
cd /home/yuan.z/rois/rois-ai/gantt
npm run dev
```

Open http://localhost:5173, log in, click the SquarePlus toolbar button. Verify dialog opens in create mode with no prefill.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/shell/gantt-sub-toolbar.tsx \
        gantt/src/components/layout/app-layout.tsx
git commit -m "feat(toolbar): add Create Ground Task button; mount GroundTaskDialog"
```

---

## Task 10: Gantt Renderer — Ground Task REST Block

**Files:**
- Modify: `gantt/src/components/gantt/renderers/roster-renderer.ts`

- [ ] **Step 1: Understand the existing REST rendering pattern**

In `roster-renderer.ts`, the existing REST block for flight tasks (around line 244–279) uses:
- `SEGMENT_REST_BG`, `SEGMENT_REST_BORDER`, `SEGMENT_REST_LABEL_COLOR` constants (already imported)
- `restStart = lastDutyLastItem.dropoffEndUtc`
- `restMin = lastDutyLastItem.dutyActRestMin ?? lastDutyLastItem.dutySchRestMin ?? 0`

Ground tasks have none of these pairing_segment fields. Instead:
- `restStart = item.schEndDtUtc` (right after the task bar ends)
- `restMin = item.actRestMin`

- [ ] **Step 2: Find the ground task rendering section**

Ground tasks are rendered in the "non-segment mode" path where `item.pairingId === null` (or similar). Search for where individual task bars are drawn for ground tasks. Look for `pairingId` or the path where `dutyGroups.length === 0`.

Open `roster-renderer.ts` and find the function that renders individual roster items. Identify the block that handles non-flight tasks (items without pairing segments). Ground tasks end up in a simple bar draw path.

After that simple bar draw, add:

```typescript
    // Draw REST block for ground tasks that have a rest time
    if (item.pairingId === null && item.actRestMin && item.actRestMin > 0 && item.schEndDtUtc) {
      const restStartX = timeToX(parseISO(item.schEndDtUtc), rangeStart, pxPerHour) - scrollX
      const restEndX = restStartX + (item.actRestMin / 60) * pxPerHour
      const restWidth = Math.max(restEndX - restStartX, 1)

      if (restStartX < canvasWidth && restEndX > 0) {
        ctx.fillStyle = SEGMENT_REST_BG
        ctx.fillRect(restStartX, barY, restWidth, barHeight)

        ctx.strokeStyle = SEGMENT_REST_BORDER
        ctx.setLineDash([4, 3])
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(restStartX, barY)
        ctx.lineTo(restStartX, barY + barHeight)
        ctx.stroke()
        ctx.setLineDash([])

        if (restWidth > 30) {
          ctx.fillStyle = SEGMENT_REST_LABEL_COLOR
          ctx.font = `7px ${PUCK_FONT_FAMILY}`
          ctx.textBaseline = 'middle'
          ctx.textAlign = 'center'
          ctx.fillText('REST', restStartX + restWidth / 2, barY + barHeight / 2)
        }
      }
    }
```

Note: `barHeight`, `barY`, `canvasWidth`, `pxPerHour`, `scrollX`, `rangeStart`, `ctx` are all already in scope in the render function. Verify the exact variable names match the surrounding code and adjust if needed (e.g. `SEGMENT_BAR_HEIGHT` vs `barHeight`).

- [ ] **Step 3: Verify the REST block renders correctly**

With dev server running, create a ground task for a crew member using an assignment that has `rest_time > 0` (e.g. `APT` with `rest_time = 480` minutes). After saving, the Gantt should show a semi-transparent REST block immediately to the right of the task bar, labeled "REST".

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/gantt/renderers/roster-renderer.ts
git commit -m "feat(renderer): draw REST block after ground task bar using actRestMin"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Multi-crew create with pairing_id = NULL | Task 2 (service), Task 6 (dialog) |
| assignment → auto-fill assignment_group | Task 6 (dialog handleAssignmentChange) |
| Separate date + time inputs (UTC) | Task 6 (dialog fields) |
| Remark / comments field | Task 6 |
| base from crew_base by start_dt | Task 2 (service step 2) |
| Missing crew_base → 400 + crew IDs listed | Task 2 + Task 3 (test) |
| All-or-nothing atomicity | Task 2 (single transaction) |
| act_rest_min new DB column | Task 1 |
| act_rest_min from assignment.rest_time | Task 2 (rows construction) |
| REST block rendered in Gantt | Task 10 |
| Right-click background → Create with prefill | Task 7, 8 |
| Toolbar button → Create no prefill | Task 9 |
| Right-click ground task → Edit Ground Task | Task 7 |
| Double-click ground task → Edit Ground Task | Task 8 |
| Edit mode: crew locked | Task 6 (Lock icon, read-only) |
| Edit sends PUT /api/roster/:id | Task 6 (updateTask call) |
| Delete ground task from edit dialog | Task 6 (handleDelete) |
| Draft mode integration | Task 5 (addGroundTask + add-ground-task op) |
| Draft commit uses batch endpoint | Task 5 (draft-store 'add-ground-task' case) |

**Placeholder scan:** No TBD or TODO found. All code blocks are complete.

**Type consistency:**
- `CreateGroundTaskInput` defined in Task 4, used in Task 5, Task 6 — consistent ✓
- `actRestMin` added to `RosterItem` in Task 4, used in Task 6 (GroundTaskDialog edit mode), Task 10 (renderer) — consistent ✓
- `'add-ground-task'` DraftOp defined in Task 4, handled in Task 5 (draft-store commit + applyDraftOps) — consistent ✓
- `setGroundTaskPrefill` added to ui-store in Task 8 Step 2 (note: ui-store interface must be updated in that step) — flagged for attention ✓
- `groundTaskPrefill` read in context-menu (Task 7) and stored in roster-pane (Task 8) — both reference `useUiStore((s) => s.groundTaskPrefill)` — consistent ✓
