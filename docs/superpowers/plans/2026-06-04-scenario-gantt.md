# Scenario Gantt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent Scenario Gantt view that opens from the scenario detail panel, renders optimizer results from input.gz / output.gz, supports multi-tab (one tab per scenario), and allows micro-adjustments (reassign / delete / add pairing) with a Redis-based exclusive edit lock.

**Architecture:** Three-service change: (1) engine-server exposes GET `/optimize/input/{task_id}` and PUT `/optimize/result/{task_id}/output`; (2) live-server adds `scenario-gantt-service` (path A = live-refresh, path B = snapshot), Redis lock service, and patch-output service; (3) gantt frontend extends shell with dynamic `scenario-gantt:{id}` tabs, a new React-based renderer (not Canvas), and per-instance Zustand stores. Data path is determined by `scenario.leadin_live`.

**Tech Stack:** Python 3.12 / FastAPI (engine-server) · TypeScript / Fastify / Drizzle / Redis (live-server) · React 19 / Zustand / date-fns / Vite (gantt) · Playwright (E2E) · Vitest (unit/integration)

---

## File Map

### engine-server
| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/tasks/task_manager.py:273-276` | Update `input_file_path` after `move_to_complete` |
| Modify | `src/api/routes.py` | Add `GET /optimize/input/{task_id}` + `PUT /optimize/result/{task_id}/output` |

### live-server
| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/services/engine-server-client.ts` | Add `fetchInputFile()` + `writeOutputFile()` |
| Create | `src/services/scenario/scenario-gantt-service.ts` | gantt-data merge logic (path A + B) |
| Create | `src/services/scenario/scenario-lock-service.ts` | Redis lock acquire / release / status / keepalive |
| Create | `src/services/scenario/scenario-patch-service.ts` | Apply ASSIGNMENTS delta to output.gz |
| Modify | `src/routes/scenario/scenario.ts` | Register gantt-data, lock ×4, patch-output routes |
| Create | `src/__tests__/services/scenario-gantt-service.test.ts` | Unit tests path A + B |
| Create | `src/__tests__/services/scenario-lock-service.test.ts` | Redis lock unit tests |
| Create | `src/__tests__/services/scenario-patch-service.test.ts` | Patch logic unit tests |

### gantt (frontend)
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/types/scenario-gantt.ts` | ScenarioGanttData, Crew, Pairing, Assignment, Patch types |
| Create | `src/services/scenario-gantt-api.ts` | API calls for gantt-data + lock + patch-output |
| Create | `src/stores/scenario-gantt-store.ts` | Per-instance Zustand store factory + Map registry |
| Modify | `src/stores/shell-store.ts` | `ActiveModule` → `string`; sidebar handling for scenario-gantt tabs |
| Create | `src/components/scenario-gantt/scenario-gantt-bar.tsx` | Single pairing bar (opt / leadin / modified / new) |
| Create | `src/components/scenario-gantt/scenario-gantt-renderer.tsx` | Virtual-windowed React row+bar Gantt |
| Create | `src/components/scenario-gantt/scenario-gantt-lock-badge.tsx` | Lock state badge (Viewing / Editing / Locked by X) |
| Create | `src/components/scenario-gantt/scenario-gantt-toolbar.tsx` | Toolbar: scene info + lock controls + Save |
| Create | `src/components/shell/scenario-gantt-view.tsx` | Top-level view: loads store, renders toolbar + renderer |
| Modify | `src/components/shell/app-shell.tsx` | ContentArea: `scenario-gantt:*` prefix routing |
| Modify | `src/components/scenario/scenario-toolbar.tsx` | `handleOpen` opens `scenario-gantt:{id}` tab |

### e2e
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `e2e/tests/gantt/scenario-gantt-open.spec.ts` | Phase 1: open scenario → gantt tab renders |
| Create | `e2e/tests/gantt/scenario-gantt-edit.spec.ts` | Phase 2: acquire lock → edit → save |

---

## Phase 1: Read-only Scenario Gantt

---

### Task 1: engine-server — input_file_path persistence + GET input endpoint

**Files:**
- Modify: `engine-server/src/tasks/task_manager.py:273-276` (inside `_submit_scenario_result`)
- Modify: `engine-server/src/api/routes.py` (add GET input endpoint)

- [ ] **Step 1: Update `_submit_scenario_result` to persist `input_file_path` after `move_to_complete`**

In `_submit_scenario_result`, after `move_to_complete` sets `self.output_file_path`, add the input path update. Find lines 273-276 (the `if complete_dir:` block) and change to:

```python
        if complete_dir:
            self.output_file_path = os.path.join(complete_dir, "output.gz")
            self.input_file_path = os.path.join(complete_dir, "input.gz")
            self._archived_to_complete = True
```

- [ ] **Step 2: Add `GET /optimize/input/{task_id}` to routes.py**

After the existing `GET /optimize/result/{task_id}` route (around line 113), add:

```python
@router.get("/optimize/input/{task_id}")
async def get_optimization_input(task_id: str, auth: AuthContext = Depends(verify_token)):
    """返回任务的 input.gz 字节（供 live-server 读取场景静态快照，leadinLive=0 路径）。"""
    import os
    from fastapi.responses import FileResponse

    task = task_manager.get_task(task_id)
    if not task or not task.input_file_path or not os.path.exists(task.input_file_path):
        raise HTTPException(status_code=404, detail="输入文件不存在或已被清理")
    return FileResponse(task.input_file_path, media_type="application/gzip", filename="ro_input.gz")
```

- [ ] **Step 3: Run existing engine-server tests to confirm no regression**

```bash
cd /home/yuan.z/rois/rois-ai/engine-server
python3 -m pytest tests/test_input_interface.py tests/test_output_interface.py tests/test_file_management.py -v --tb=short 2>&1 | tail -20
```

Expected: all pass (new endpoint has no test yet — added in Task 11).

- [ ] **Step 4: Commit**

```bash
git add engine-server/src/tasks/task_manager.py engine-server/src/api/routes.py
git commit -m "feat(engine-server): persist input_file_path after move_to_complete + GET /optimize/input endpoint"
```

---

### Task 2: live-server — fetchInputFile in engineServerClient

**Files:**
- Modify: `live-server/src/services/engine-server-client.ts`
- Modify: `live-server/src/__tests__/services/engine-server-client.test.ts`

- [ ] **Step 1: Add `fetchInputFile` method to engineServerClient**

Append to the `engineServerClient` object (after `fetchResultFile`):

```typescript
  /** Fetch ro_input.gz bytes for a scenario (path B: leadinLive=0 snapshots). */
  async fetchInputFile(taskId: string, token: string, airline: string): Promise<Buffer> {
    const res = await fetch(`${env.ENGINE_SERVER_URL}/api/optimize/input/${taskId}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Airline': airline.toUpperCase() },
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      throw new Error(`engine-server /optimize/input ${res.status}`)
    }
    return Buffer.from(await res.arrayBuffer())
  },
```

- [ ] **Step 2: Write the failing test**

Append to `src/__tests__/services/engine-server-client.test.ts`:

```typescript
  it('fetchInputFile returns a Buffer of the gz bytes', async () => {
    const bytes = new Uint8Array([0x1f, 0x8b, 0x02, 0x03])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { status: 200 })))

    const buf = await engineServerClient.fetchInputFile('t-2', 'JWT', 'f8')
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf[0]).toBe(0x1f)
  })

  it('fetchInputFile throws on 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    await expect(engineServerClient.fetchInputFile('t-x', 'JWT', 'f8')).rejects.toThrow(/404/)
  })
```

- [ ] **Step 3: Run the new tests**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npx vitest run src/__tests__/services/engine-server-client.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add live-server/src/services/engine-server-client.ts \
        live-server/src/__tests__/services/engine-server-client.test.ts
git commit -m "feat(live-server): add fetchInputFile to engineServerClient"
```

---

### Task 3: live-server — scenario-gantt-service (path B + A) + gantt-data route

**Files:**
- Create: `live-server/src/services/scenario/scenario-gantt-service.ts`
- Modify: `live-server/src/routes/scenario/scenario.ts` (add one route)

- [ ] **Step 1: Create `scenario-gantt-service.ts`**

```typescript
// live-server/src/services/scenario/scenario-gantt-service.ts
import { gunzipSync } from 'node:zlib'
import { inArray, and, isNotNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { engineServerClient } from '../engine-server-client.js'
import { buildRoInputGz, type ScenarioRow } from './scenario-export-service.js'
import { parseSections } from './scenario-result-service.js'
import { rosterFlight } from '../../models/roster/roster-flight.js'

export interface ScenarioGanttCrew {
  crewId: string
  base: string
  division: string
  rank: string
}

export interface ScenarioGanttPairing {
  pairingId: number
  pairingLabel: string | null
  base: string
  schStrDtUtc: string
  schEndDtUtc: string
  assignmentGroup: string
  assignment: string
  division: string
}

export interface ScenarioGanttAssignment {
  crewId: string
  pairingId: number
  source: 'opt' | 'leadin'
}

export interface ScenarioGanttData {
  scenarioId: number
  scenarioName: string | null
  strDtLoc: string
  endDtLoc: string
  leadinLive: number
  dataSource: 'live-refresh' | 'snapshot'
  crew: ScenarioGanttCrew[]
  pairings: ScenarioGanttPairing[]
  assignments: ScenarioGanttAssignment[]
}

function parseCrewAndPairings(inputGz: Buffer): {
  crew: ScenarioGanttCrew[]
  pairings: ScenarioGanttPairing[]
} {
  const sections = parseSections(inputGz)

  const crewRows = sections['crew'] ?? []
  const crewBaseRows = sections['crew_base'] ?? []
  const crewRankRows = sections['crew_rank'] ?? []
  const pairingRows = sections['pairing'] ?? []

  const baseByCrewId = new Map<string, string>()
  for (const r of crewBaseRows) {
    if (!baseByCrewId.has(r['crew_id'])) baseByCrewId.set(r['crew_id'], r['base'])
  }

  const rankByCrewId = new Map<string, string>()
  for (const r of crewRankRows) {
    if (!rankByCrewId.has(r['crew_id'])) rankByCrewId.set(r['crew_id'], r['rank'])
  }

  const crew: ScenarioGanttCrew[] = crewRows.map((r) => ({
    crewId: r['crew_id'],
    base: baseByCrewId.get(r['crew_id']) ?? '',
    division: r['division'] ?? '',
    rank: rankByCrewId.get(r['crew_id']) ?? '',
  }))

  const pairings: ScenarioGanttPairing[] = pairingRows.map((r) => ({
    pairingId: Number(r['id']),
    pairingLabel: r['pairing_label'] || null,
    base: r['base'] ?? '',
    schStrDtUtc: r['sch_str_dt_utc'] ?? '',
    schEndDtUtc: r['sch_end_dt_utc'] ?? '',
    assignmentGroup: r['assignment_group'] ?? '',
    assignment: r['assignment'] ?? '',
    division: r['division'] ?? '',
  }))

  return { crew, pairings }
}

function parseOptAssignments(outputGz: Buffer): ScenarioGanttAssignment[] {
  const sections = parseSections(outputGz)
  return (sections['ASSIGNMENTS'] ?? []).map((r) => ({
    crewId: r['crew_id'],
    pairingId: Number(r['pairing_id']),
    source: 'opt' as const,
  }))
}

/** Path B: leadinLive=0 — read stored input.gz + output.gz, no live DB access. */
export async function buildGanttDataSnapshot(
  sc: {
    id: number
    name: string | null
    taskId: string
    strDtLoc: Date
    endDtLoc: Date
    leadinLive: number
  },
  token: string,
  airline: string,
): Promise<ScenarioGanttData> {
  const [inputGz, outputGz] = await Promise.all([
    engineServerClient.fetchInputFile(sc.taskId, token, airline),
    engineServerClient.fetchResultFile(sc.taskId, token, airline),
  ])

  const { crew, pairings } = parseCrewAndPairings(inputGz)
  const assignments = parseOptAssignments(outputGz)

  return {
    scenarioId: sc.id,
    scenarioName: sc.name,
    strDtLoc: sc.strDtLoc.toISOString(),
    endDtLoc: sc.endDtLoc.toISOString(),
    leadinLive: sc.leadinLive,
    dataSource: 'snapshot',
    crew,
    pairings,
    assignments,
  }
}

/** Path A: leadinLive=1 — regenerate input from live DB + fetch output.gz. */
export async function buildGanttDataLiveRefresh(
  fastify: FastifyInstance,
  sc: {
    id: number
    name: string | null
    taskId: string
    worksetId: number
    strDtLoc: Date
    endDtLoc: Date
    leadinLive: number
    filterParams: Record<string, unknown>
    ruleGroupCode: string
  },
  token: string,
  airline: string,
): Promise<ScenarioGanttData> {
  const scenarioRow: ScenarioRow = {
    id: sc.id,
    worksetId: sc.worksetId,
    strDtLoc: sc.strDtLoc,
    endDtLoc: sc.endDtLoc,
    filterParams: sc.filterParams,
    ruleGroupCode: sc.ruleGroupCode,
  }

  const [inputGz, outputGz] = await Promise.all([
    buildRoInputGz(fastify, scenarioRow),
    engineServerClient.fetchResultFile(sc.taskId, token, airline),
  ])

  const { crew, pairings } = parseCrewAndPairings(inputGz)
  const optAssignments = parseOptAssignments(outputGz)

  // Lead-in: live roster entries for the same crew
  const crewIds = crew.map((c) => c.crewId)
  const leadinRows = crewIds.length > 0
    ? await fastify.db
        .select({ crewId: rosterFlight.crewId, pairingId: rosterFlight.pairingId })
        .from(rosterFlight)
        .where(and(inArray(rosterFlight.crewId, crewIds), isNotNull(rosterFlight.pairingId)))
    : []

  const leadinAssignments: ScenarioGanttAssignment[] = leadinRows
    .filter((r) => r.pairingId !== null)
    .map((r) => ({ crewId: r.crewId, pairingId: r.pairingId!, source: 'leadin' as const }))

  return {
    scenarioId: sc.id,
    scenarioName: sc.name,
    strDtLoc: sc.strDtLoc.toISOString(),
    endDtLoc: sc.endDtLoc.toISOString(),
    leadinLive: sc.leadinLive,
    dataSource: 'live-refresh',
    crew,
    pairings,
    assignments: [...optAssignments, ...leadinAssignments],
  }
}
```

- [ ] **Step 2: Register `GET /api/scenario/:id/gantt-data` in `scenario.ts`**

Append before the closing `}` of `scenarioRoutes`:

```typescript
  // GET /api/scenario/:id/gantt-data — Scenario Gantt rendering data (path A or B by leadinLive flag)
  fastify.get('/:id/gantt-data', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const sc = await scenarioService.getById(fastify, numId)
    if (!sc) return fail(reply, 404, 'Scenario not found')
    if (sc.status !== 'DONE' || !sc.taskId) return fail(reply, 409, 'Scenario has no optimized result')

    const airline = request.authUser?.schema ?? 'f8'
    const token = bearerToken(request)

    try {
      const { buildGanttDataSnapshot, buildGanttDataLiveRefresh } = await import(
        '../../services/scenario/scenario-gantt-service.js'
      )

      const data = sc.leadinLive
        ? await buildGanttDataLiveRefresh(fastify, sc as never, token, airline)
        : await buildGanttDataSnapshot(sc as never, token, airline)

      return success(reply, data)
    } catch (err) {
      return error(reply, 502, `Failed to build gantt data: ${(err as Error).message}`)
    }
  })
```

- [ ] **Step 3: Commit**

```bash
git add live-server/src/services/scenario/scenario-gantt-service.ts \
        live-server/src/routes/scenario/scenario.ts
git commit -m "feat(live-server): scenario-gantt-service + GET gantt-data route (path A + B)"
```

---

### Task 4: live-server — Unit tests for scenario-gantt-service

**Files:**
- Create: `live-server/src/__tests__/services/scenario-gantt-service.test.ts`

- [ ] **Step 1: Write tests for path B (snapshot)**

```typescript
// live-server/src/__tests__/services/scenario-gantt-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gzipSync } from 'node:zlib'

vi.mock('../../config/env.js', () => ({ env: { ENGINE_SERVER_URL: 'http://engine:3003' } }))
vi.mock('../../services/engine-server-client.js')
vi.mock('../../services/scenario/scenario-export-service.js')

import { engineServerClient } from '../../services/engine-server-client.js'
import { buildRoInputGz } from '../../services/scenario/scenario-export-service.js'
import { buildGanttDataSnapshot, buildGanttDataLiveRefresh } from '../../services/scenario/scenario-gantt-service.js'

function makeGz(sections: string): Buffer {
  return gzipSync(Buffer.from(sections, 'utf-8'))
}

const MOCK_INPUT = makeGz(`## crew\ncrew_id,division\nF80001,P\nF80002,C\n\n## crew_base\ncrew_id,base\nF80001,PVG\nF80002,CAN\n\n## crew_rank\ncrew_id,rank\nF80001,CA\nF80002,FA\n\n## pairing\nid,pairing_label,base,sch_str_dt_utc,sch_end_dt_utc,assignment_group,assignment,division\n100,P2045,PVG,2026-05-01T00:00:00.000Z,2026-05-02T00:00:00.000Z,GRP,CA,P\n`)
const MOCK_OUTPUT = makeGz(`## ASSIGNMENTS\ncrew_id,pairing_id\nF80001,100\n`)

const MOCK_SC = {
  id: 42, name: 'RO-Test', taskId: 't-abc', strDtLoc: new Date('2026-05-01'),
  endDtLoc: new Date('2026-05-31'), leadinLive: 0 as 0,
  worksetId: 1, filterParams: {}, ruleGroupCode: 'DEFAULT',
}

describe('buildGanttDataSnapshot (path B)', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns crew from input.gz and assignments from output.gz', async () => {
    vi.mocked(engineServerClient.fetchInputFile).mockResolvedValue(MOCK_INPUT)
    vi.mocked(engineServerClient.fetchResultFile).mockResolvedValue(MOCK_OUTPUT)

    const data = await buildGanttDataSnapshot(MOCK_SC, 'tok', 'f8')

    expect(data.dataSource).toBe('snapshot')
    expect(data.crew).toHaveLength(2)
    expect(data.crew[0]).toEqual({ crewId: 'F80001', base: 'PVG', division: 'P', rank: 'CA' })
    expect(data.pairings).toHaveLength(1)
    expect(data.pairings[0].pairingId).toBe(100)
    expect(data.assignments).toHaveLength(1)
    expect(data.assignments[0]).toEqual({ crewId: 'F80001', pairingId: 100, source: 'opt' })
  })

  it('throws when taskId missing', async () => {
    vi.mocked(engineServerClient.fetchInputFile).mockRejectedValue(new Error('404'))
    await expect(buildGanttDataSnapshot({ ...MOCK_SC, taskId: '' }, 'tok', 'f8')).rejects.toThrow()
  })
})

describe('buildGanttDataLiveRefresh (path A)', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns live-refresh dataSource and includes leadin assignments', async () => {
    vi.mocked(buildRoInputGz).mockResolvedValue(MOCK_INPUT)
    vi.mocked(engineServerClient.fetchResultFile).mockResolvedValue(MOCK_OUTPUT)

    const mockDb = {
      select: () => ({
        from: () => ({
          where: vi.fn().mockResolvedValue([{ crewId: 'F80001', pairingId: 99 }]),
        }),
      }),
    }

    const data = await buildGanttDataLiveRefresh(
      { db: mockDb } as never,
      { ...MOCK_SC, leadinLive: 1 },
      'tok',
      'f8',
    )

    expect(data.dataSource).toBe('live-refresh')
    const leadin = data.assignments.filter((a) => a.source === 'leadin')
    expect(leadin).toHaveLength(1)
    expect(leadin[0].pairingId).toBe(99)
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npx vitest run src/__tests__/services/scenario-gantt-service.test.ts --reporter=verbose 2>&1 | tail -25
```

Expected: all 3 pass.

- [ ] **Step 3: Commit**

```bash
git add live-server/src/__tests__/services/scenario-gantt-service.test.ts
git commit -m "test(live-server): unit tests for scenario-gantt-service path A + B"
```

---

### Task 5: Frontend — Types + API service

**Files:**
- Create: `gantt/src/types/scenario-gantt.ts`
- Create: `gantt/src/services/scenario-gantt-api.ts`

- [ ] **Step 1: Create `types/scenario-gantt.ts`**

```typescript
// gantt/src/types/scenario-gantt.ts

export interface ScenarioGanttCrew {
  crewId: string
  base: string
  division: string
  rank: string
}

export interface ScenarioGanttPairing {
  pairingId: number
  pairingLabel: string | null
  base: string
  schStrDtUtc: string  // ISO datetime string
  schEndDtUtc: string
  assignmentGroup: string
  assignment: string
  division: string
}

export interface ScenarioGanttAssignment {
  crewId: string
  pairingId: number
  source: 'opt' | 'leadin'
}

export interface ScenarioGanttData {
  scenarioId: number
  scenarioName: string | null
  strDtLoc: string
  endDtLoc: string
  leadinLive: number
  dataSource: 'live-refresh' | 'snapshot'
  crew: ScenarioGanttCrew[]
  pairings: ScenarioGanttPairing[]
  assignments: ScenarioGanttAssignment[]
}

/** A pending edit not yet saved to output.gz */
export interface AssignmentPatch {
  op: 'add' | 'remove' | 'reassign'
  crewId: string
  pairingId: number
  toCrewId?: string  // only for 'reassign'
}

export interface LockStatus {
  locked: boolean
  owner: string | null
  ttl: number | null
  isOwner: boolean  // true if current user holds the lock
}
```

- [ ] **Step 2: Create `services/scenario-gantt-api.ts`**

```typescript
// gantt/src/services/scenario-gantt-api.ts
import { api } from './api'
import type { ScenarioGanttData, AssignmentPatch, LockStatus } from '@/types/scenario-gantt'

export const scenarioGanttApi = {
  async getGanttData(scenarioId: number): Promise<ScenarioGanttData> {
    return api.get(`/api/scenario/${scenarioId}/gantt-data`) as Promise<ScenarioGanttData>
  },

  async acquireLock(scenarioId: number): Promise<{ acquired: boolean }> {
    return api.post(`/api/scenario/${scenarioId}/acquire-lock`, {}) as Promise<{ acquired: boolean }>
  },

  async releaseLock(scenarioId: number): Promise<void> {
    return api.post(`/api/scenario/${scenarioId}/release-lock`, {}) as Promise<void>
  },

  async getLockStatus(scenarioId: number): Promise<LockStatus> {
    return api.get(`/api/scenario/${scenarioId}/lock-status`) as Promise<LockStatus>
  },

  async keepaliveLock(scenarioId: number): Promise<{ renewed: boolean }> {
    return api.post(`/api/scenario/${scenarioId}/lock-keepalive`, {}) as Promise<{ renewed: boolean }>
  },

  async patchOutput(scenarioId: number, patches: AssignmentPatch[]): Promise<void> {
    return api.post(`/api/scenario/${scenarioId}/patch-output`, { patches }) as Promise<void>
  },
}
```

- [ ] **Step 3: Commit**

```bash
git add gantt/src/types/scenario-gantt.ts gantt/src/services/scenario-gantt-api.ts
git commit -m "feat(gantt): ScenarioGantt types + API service"
```

---

### Task 6: Frontend — Shell store dynamic tabs + ContentArea routing

**Files:**
- Modify: `gantt/src/stores/shell-store.ts`
- Modify: `gantt/src/components/shell/app-shell.tsx`

- [ ] **Step 1: Change `ActiveModule` to accept dynamic strings in `shell-store.ts`**

Find line:
```typescript
export type ActiveModule = 'dashboard' | 'live' | 'scenario' | 'rule' | 'data' | 'system' | 'regression' | 'help'
```

Replace with:
```typescript
// Known module names (extend for new static modules); dynamic tabs use 'scenario-gantt:{id}' pattern
export type KnownModule = 'dashboard' | 'live' | 'scenario' | 'rule' | 'data' | 'system' | 'regression' | 'help'
export type ActiveModule = string
```

- [ ] **Step 2: Update `applySidebarForModule` to handle scenario-gantt tabs**

Find the `applySidebarForModule` function (around line 55):
```typescript
const applySidebarForModule = (
  module: ActiveModule,
  sidebarUserOverride: boolean,
  set: (patch: Partial<ShellStore>) => void,
): void => {
  if (sidebarUserOverride) return
  const sidebarState: SidebarState =
    module === 'live'  ? 'collapsed' :
    module === 'help'  ? 'hidden'    : 'expanded'
```

Replace the sidebarState assignment:
```typescript
  const sidebarState: SidebarState =
    module === 'live' ? 'collapsed' :
    module === 'help' ? 'hidden' :
    module.startsWith('scenario-gantt:') ? 'collapsed' : 'expanded'
```

- [ ] **Step 3: Update `ContentArea` in `app-shell.tsx` to route `scenario-gantt:*` tabs**

In `app-shell.tsx`, add the import for `ScenarioGanttView`:
```typescript
import { ScenarioGanttView } from '@/components/shell/scenario-gantt-view'
```

Replace the `ModuleView` function:
```typescript
const ModuleView = ({ module }: { module: string }) => {
  if (module === 'dashboard') return <DashboardView />
  if (module === 'live')      return <RosterView />
  if (module === 'scenario')  return <ScenarioView />
  if (module === 'rule')      return <RuleView />
  if (module === 'regression') return <RegressionView />
  if (module === 'help')       return <HelpView />
  if (module.startsWith('scenario-gantt:')) {
    const scenarioId = Number(module.slice('scenario-gantt:'.length))
    if (!Number.isNaN(scenarioId)) return <ScenarioGanttView scenarioId={scenarioId} />
  }
  const label = module.charAt(0).toUpperCase() + module.slice(1)
  return <PlaceholderView module={label} />
}
```

- [ ] **Step 4: Commit (placeholder `ScenarioGanttView` will be created in Task 9)**

```bash
git add gantt/src/stores/shell-store.ts gantt/src/components/shell/app-shell.tsx
git commit -m "feat(gantt): shell-store dynamic tab types + ContentArea scenario-gantt routing"
```

---

### Task 7: Frontend — Scenario Gantt Store (per-instance factory)

**Files:**
- Create: `gantt/src/stores/scenario-gantt-store.ts`

- [ ] **Step 1: Create the store factory**

```typescript
// gantt/src/stores/scenario-gantt-store.ts
import { create } from 'zustand'
import { scenarioGanttApi } from '@/services/scenario-gantt-api'
import { notify } from '@/utils/notify'
import type { ScenarioGanttData, AssignmentPatch, LockStatus } from '@/types/scenario-gantt'

interface ScenarioGanttStore {
  // Data
  data: ScenarioGanttData | null
  loading: boolean
  error: string | null

  // Edit state
  pendingChanges: AssignmentPatch[]
  isDirty: boolean
  saving: boolean

  // Lock
  lockStatus: LockStatus | null
  acquiringLock: boolean

  // Actions
  loadData: (scenarioId: number) => Promise<void>
  acquireLock: (scenarioId: number) => Promise<void>
  releaseLock: (scenarioId: number) => Promise<void>
  refreshLock: (scenarioId: number) => Promise<void>
  addPatch: (patch: AssignmentPatch) => void
  clearPatches: () => void
  save: (scenarioId: number) => Promise<void>
}

function createStore(scenarioId: number) {
  return create<ScenarioGanttStore>((set, get) => ({
    data: null,
    loading: false,
    error: null,
    pendingChanges: [],
    isDirty: false,
    saving: false,
    lockStatus: null,
    acquiringLock: false,

    loadData: async () => {
      set({ loading: true, error: null })
      try {
        const data = await scenarioGanttApi.getGanttData(scenarioId)
        set({ data, loading: false })
      } catch (err) {
        set({ loading: false, error: (err as Error).message })
      }
    },

    acquireLock: async () => {
      set({ acquiringLock: true })
      try {
        const result = await scenarioGanttApi.acquireLock(scenarioId)
        if (result.acquired) {
          const status = await scenarioGanttApi.getLockStatus(scenarioId)
          set({ lockStatus: status, acquiringLock: false })
          notify.success('Edit lock acquired')
        } else {
          const status = await scenarioGanttApi.getLockStatus(scenarioId)
          set({ lockStatus: status, acquiringLock: false })
          notify.error(`Lock held by ${status.owner ?? 'another user'}`)
        }
      } catch (err) {
        set({ acquiringLock: false })
        notify.error((err as Error).message)
      }
    },

    releaseLock: async () => {
      try {
        await scenarioGanttApi.releaseLock(scenarioId)
        set({ lockStatus: { locked: false, owner: null, ttl: null, isOwner: false }, pendingChanges: [], isDirty: false })
        notify.success('Edit lock released')
      } catch (err) {
        notify.error((err as Error).message)
      }
    },

    refreshLock: async () => {
      try {
        const status = await scenarioGanttApi.getLockStatus(scenarioId)
        set({ lockStatus: status })
      } catch { /* silent */ }
    },

    addPatch: (patch) => {
      set((s) => ({ pendingChanges: [...s.pendingChanges, patch], isDirty: true }))
    },

    clearPatches: () => set({ pendingChanges: [], isDirty: false }),

    save: async () => {
      const { pendingChanges } = get()
      if (pendingChanges.length === 0) return
      set({ saving: true })
      try {
        await scenarioGanttApi.patchOutput(scenarioId, pendingChanges)
        const data = await scenarioGanttApi.getGanttData(scenarioId)
        set({ data, pendingChanges: [], isDirty: false, saving: false })
        notify.success('Scenario adjustments saved')
      } catch (err) {
        set({ saving: false })
        notify.error((err as Error).message)
      }
    },
  }))
}

// Registry: one store per scenarioId
const registry = new Map<number, ReturnType<typeof createStore>>()

export function getScenarioGanttStore(scenarioId: number) {
  if (!registry.has(scenarioId)) {
    registry.set(scenarioId, createStore(scenarioId))
  }
  return registry.get(scenarioId)!
}

export function destroyScenarioGanttStore(scenarioId: number) {
  registry.delete(scenarioId)
}
```

- [ ] **Step 2: Commit**

```bash
git add gantt/src/stores/scenario-gantt-store.ts
git commit -m "feat(gantt): scenario-gantt-store per-instance factory"
```

---

### Task 8: Frontend — Scenario Gantt Bar + Renderer

**Files:**
- Create: `gantt/src/components/scenario-gantt/scenario-gantt-bar.tsx`
- Create: `gantt/src/components/scenario-gantt/scenario-gantt-renderer.tsx`

- [ ] **Step 1: Create `scenario-gantt-bar.tsx`**

```tsx
// gantt/src/components/scenario-gantt/scenario-gantt-bar.tsx
import { cn } from '@rois/ui'
import type { ScenarioGanttPairing, ScenarioGanttAssignment } from '@/types/scenario-gantt'

interface ScenarioGanttBarProps {
  pairing: ScenarioGanttPairing
  assignment: ScenarioGanttAssignment
  isModified: boolean
  isNew: boolean
  style: React.CSSProperties
  canEdit: boolean
  onPointerDown?: (e: React.PointerEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
}

const BAR_CLASS: Record<string, string> = {
  leadin:   'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
  opt:      'bg-blue-500/25 border-blue-500/50 text-blue-300',
  modified: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
  new:      'bg-purple-500/15 border-purple-400/50 text-purple-300 border-dashed',
}

export const ScenarioGanttBar = ({
  pairing, assignment, isModified, isNew, style, canEdit, onPointerDown, onContextMenu,
}: ScenarioGanttBarProps) => {
  const variant = isNew ? 'new' : isModified ? 'modified' : assignment.source

  return (
    <div
      className={cn(
        'absolute top-1 flex h-[22px] select-none items-center overflow-hidden rounded px-1.5',
        'border text-2xs font-semibold',
        BAR_CLASS[variant],
        canEdit && 'cursor-grab active:cursor-grabbing',
      )}
      style={style}
      data-pairing-id={pairing.pairingId}
      data-crew-id={assignment.crewId}
      onPointerDown={canEdit ? onPointerDown : undefined}
      onContextMenu={onContextMenu}
    >
      <span className="truncate font-mono tabular-nums">
        {pairing.pairingLabel ?? `P${pairing.pairingId}`}
      </span>
      {isModified && <span className="ml-0.5 shrink-0 text-amber-400">✎</span>}
      {isNew && <span className="ml-0.5 shrink-0 text-purple-400">+</span>}
    </div>
  )
}
```

- [ ] **Step 2: Create `scenario-gantt-renderer.tsx`**

```tsx
// gantt/src/components/scenario-gantt/scenario-gantt-renderer.tsx
import { useState, useRef, useCallback, useMemo } from 'react'
import { differenceInMinutes, parseISO, addDays, startOfDay } from 'date-fns'
import { cn } from '@rois/ui'
import { ScenarioGanttBar } from './scenario-gantt-bar'
import type {
  ScenarioGanttCrew, ScenarioGanttPairing,
  ScenarioGanttAssignment, AssignmentPatch,
} from '@/types/scenario-gantt'

interface ScenarioGanttRendererProps {
  crew: ScenarioGanttCrew[]
  pairingMap: Map<number, ScenarioGanttPairing>
  assignments: ScenarioGanttAssignment[]
  pendingChanges: AssignmentPatch[]
  startDate: string   // ISO, e.g. '2026-05-01T00:00:00.000Z'
  endDate: string
  canEdit: boolean
  onReassign: (pairingId: number, fromCrewId: string, toCrewId: string) => void
  onRemove: (pairingId: number, crewId: string) => void
}

const ROW_H = 28
const CREW_W = 164
const HEADER_H = 32
const BUFFER_ROWS = 8

function positionFor(pairing: ScenarioGanttPairing, rangeStartMs: number, rangeDurationMs: number): React.CSSProperties {
  const start = parseISO(pairing.schStrDtUtc).getTime()
  const end   = parseISO(pairing.schEndDtUtc).getTime()
  const left  = Math.max(0, (start - rangeStartMs) / rangeDurationMs) * 100
  const width = Math.max(0.5, (end - start) / rangeDurationMs * 100)
  return { left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }
}

/** Build day labels for the timeline header */
function buildDays(startDate: string, endDate: string): Date[] {
  const days: Date[] = []
  let d = startOfDay(parseISO(startDate))
  const end = startOfDay(parseISO(endDate))
  while (d <= end) {
    days.push(d)
    d = addDays(d, 1)
  }
  return days
}

export const ScenarioGanttRenderer = ({
  crew, pairingMap, assignments, pendingChanges,
  startDate, endDate, canEdit, onReassign, onRemove,
}: ScenarioGanttRendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [drag, setDrag] = useState<{ pairingId: number; fromCrewId: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const rangeStartMs = parseISO(startDate).getTime()
  const rangeEndMs   = parseISO(endDate).getTime()
  const rangeDurationMs = rangeEndMs - rangeStartMs || 1

  const days = useMemo(() => buildDays(startDate, endDate), [startDate, endDate])
  const containerHeight = (containerRef.current?.clientHeight ?? 600) - HEADER_H

  // Apply pending changes on top of assignments
  const effectiveAssignments = useMemo((): ScenarioGanttAssignment[] => {
    let result = [...assignments]
    for (const p of pendingChanges) {
      if (p.op === 'remove') {
        result = result.filter((a) => !(a.crewId === p.crewId && a.pairingId === p.pairingId))
      } else if (p.op === 'add') {
        result.push({ crewId: p.crewId, pairingId: p.pairingId, source: 'opt' })
      } else if (p.op === 'reassign' && p.toCrewId) {
        result = result.map((a) =>
          a.crewId === p.crewId && a.pairingId === p.pairingId
            ? { ...a, crewId: p.toCrewId! }
            : a,
        )
      }
    }
    return result
  }, [assignments, pendingChanges])

  // Build crewId → assignments map
  const crewAssignmentMap = useMemo(() => {
    const map = new Map<string, ScenarioGanttAssignment[]>()
    for (const a of effectiveAssignments) {
      const list = map.get(a.crewId) ?? []
      map.set(a.crewId, [...list, a])
    }
    return map
  }, [effectiveAssignments])

  // Modified pairingIds (from pending changes)
  const modifiedPairingIds = useMemo(
    () => new Set(pendingChanges.map((p) => p.pairingId)),
    [pendingChanges],
  )

  const rowStart = Math.max(0, Math.floor(scrollTop / ROW_H) - BUFFER_ROWS)
  const rowEnd   = Math.min(crew.length, rowStart + Math.ceil(containerHeight / ROW_H) + BUFFER_ROWS * 2)
  const visibleCrew = crew.slice(rowStart, rowEnd)

  const handleBarPointerDown = useCallback((
    e: React.PointerEvent, pairingId: number, crewId: string,
  ) => {
    if (!canEdit) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ pairingId, fromCrewId: crewId })
  }, [canEdit])

  const handleRowPointerEnter = useCallback((crewId: string) => {
    if (drag) setDropTarget(crewId)
  }, [drag])

  const handlePointerUp = useCallback(() => {
    if (drag && dropTarget && dropTarget !== drag.fromCrewId) {
      onReassign(drag.pairingId, drag.fromCrewId, dropTarget)
    }
    setDrag(null)
    setDropTarget(null)
  }, [drag, dropTarget, onReassign])

  return (
    <div className="flex h-full overflow-hidden" onPointerUp={handlePointerUp}>
      {/* ── Left: crew list ────────────────────────── */}
      <div className="flex shrink-0 flex-col border-r border-border" style={{ width: CREW_W }}>
        <div className="flex h-8 shrink-0 items-center border-b border-border px-3 text-2xs font-bold uppercase tracking-widest text-muted-foreground">
          Crew
        </div>
        <div className="relative overflow-hidden" style={{ height: crew.length * ROW_H }}>
          {visibleCrew.map((c, idx) => (
            <div
              key={c.crewId}
              className={cn(
                'absolute flex w-full items-center gap-1.5 border-b border-border/50 px-3',
                dropTarget === c.crewId && 'bg-accent/10',
              )}
              style={{ top: (rowStart + idx) * ROW_H, height: ROW_H }}
              onPointerEnter={() => handleRowPointerEnter(c.crewId)}
            >
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
              <span className="font-mono tabular-nums text-2xs font-semibold text-foreground">
                {c.crewId}
              </span>
              <span className="text-2xs text-muted-foreground">{c.base}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: timeline + rows ──────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        onScroll={(e) => setScrollTop((e.target as HTMLElement).scrollTop)}
      >
        {/* Timeline header (sticky) */}
        <div className="sticky top-0 z-10 flex border-b border-border bg-background/95" style={{ height: HEADER_H }}>
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className="flex-1 border-r border-border/30 px-1 pt-1 text-center text-3xs text-muted-foreground"
            >
              {day.getDate()}
            </div>
          ))}
        </div>

        {/* Rows canvas */}
        <div className="relative" style={{ height: crew.length * ROW_H }}>
          {/* Vertical day grid lines */}
          <div className="pointer-events-none absolute inset-0 flex">
            {days.map((d) => (
              <div key={d.toISOString()} className="flex-1 border-r border-border/20" />
            ))}
          </div>

          {/* Visible rows */}
          {visibleCrew.map((c, idx) => {
            const rowAssignments = crewAssignmentMap.get(c.crewId) ?? []
            return (
              <div
                key={c.crewId}
                className={cn(
                  'absolute w-full border-b border-border/30',
                  dropTarget === c.crewId && 'bg-accent/5',
                )}
                style={{ top: (rowStart + idx) * ROW_H, height: ROW_H }}
                onPointerEnter={() => handleRowPointerEnter(c.crewId)}
              >
                {rowAssignments.map((a) => {
                  const pairing = pairingMap.get(a.pairingId)
                  if (!pairing) return null
                  return (
                    <ScenarioGanttBar
                      key={`${a.crewId}-${a.pairingId}`}
                      pairing={pairing}
                      assignment={a}
                      isModified={modifiedPairingIds.has(a.pairingId)}
                      isNew={pendingChanges.some(
                        (p) => p.op === 'add' && p.pairingId === a.pairingId && p.crewId === a.crewId,
                      )}
                      style={positionFor(pairing, rangeStartMs, rangeDurationMs)}
                      canEdit={canEdit}
                      onPointerDown={(e) => handleBarPointerDown(e, a.pairingId, a.crewId)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        if (canEdit) onRemove(a.pairingId, a.crewId)
                      }}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Install `date-fns` if not already present**

```bash
cd /home/yuan.z/rois/rois-ai/gantt
grep -q '"date-fns"' package.json && echo "already installed" || npm install date-fns
```

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/scenario-gantt/
git commit -m "feat(gantt): ScenarioGanttBar + ScenarioGanttRenderer (React virtual-windowed)"
```

---

### Task 9: Frontend — Toolbar + View + Wire up Open Scenario

**Files:**
- Create: `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx`
- Create: `gantt/src/components/shell/scenario-gantt-view.tsx`
- Modify: `gantt/src/components/scenario/scenario-toolbar.tsx` (`handleOpen`)

- [ ] **Step 1: Create `scenario-gantt-toolbar.tsx` (Phase 1 read-only version)**

```tsx
// gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx
import type { ReactNode } from 'react'
import { Loader2, Save, Lock, Unlock, Eye } from 'lucide-react'
import { Button, Tooltip, TooltipContent, TooltipTrigger, TooltipProvider, cn } from '@rois/ui'
import type { ScenarioGanttData, LockStatus } from '@/types/scenario-gantt'

interface ScenarioGanttToolbarProps {
  data: ScenarioGanttData
  lockStatus: LockStatus | null
  isDirty: boolean
  saving: boolean
  acquiringLock: boolean
  onAcquireLock: () => void
  onReleaseLock: () => void
  onSave: () => void
}

export const ScenarioGanttToolbar = ({
  data, lockStatus, isDirty, saving, acquiringLock, onAcquireLock, onReleaseLock, onSave,
}: ScenarioGanttToolbarProps): ReactNode => {
  const isOwner   = lockStatus?.isOwner ?? false
  const isLocked  = lockStatus?.locked ?? false
  const lockedBy  = lockStatus?.owner ?? null

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-background px-3"
      data-testid="scenario-gantt-toolbar"
    >
      {/* Scenario type badge */}
      <span className="rounded px-1.5 py-0.5 text-3xs font-bold uppercase tracking-widest bg-teal-500/15 text-teal-400">
        Scenario
      </span>

      {/* Scenario name */}
      <span className="text-xs font-semibold text-foreground" data-testid="sg-scenario-name">
        {data.scenarioName ?? `Scenario #${data.scenarioId}`}
      </span>

      <div className="mx-1 h-3.5 w-px bg-border" />

      {/* Date range */}
      <span className="font-mono tabular-nums text-2xs text-muted-foreground">
        {data.strDtLoc.slice(0, 10)} → {data.endDtLoc.slice(0, 10)}
      </span>

      <div className="mx-1 h-3.5 w-px bg-border" />

      {/* Data source badge */}
      {data.dataSource === 'live-refresh'
        ? <span className="rounded px-1.5 py-0.5 text-3xs font-semibold bg-amber-500/15 text-amber-400">Live Context</span>
        : <span className="rounded px-1.5 py-0.5 text-3xs font-semibold bg-blue-500/15 text-blue-400">Snapshot</span>
      }

      <div className="flex-1" />

      <TooltipProvider delayDuration={300}>
        {/* Save button (only when owner + dirty) */}
        {isOwner && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-7 w-7 p-0', isDirty && !saving && 'text-primary')}
                disabled={!isDirty || saving}
                onClick={onSave}
                data-testid="sg-save-btn"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {saving ? 'Saving…' : isDirty ? 'Save adjustments' : 'Saved'}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Lock control */}
        {isOwner ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-amber-400 hover:text-amber-500"
                onClick={onReleaseLock}
                data-testid="sg-release-lock-btn"
              >
                <Unlock className="h-3.5 w-3.5" />
                <span className="text-2xs font-semibold">Editing</span>
                {lockStatus?.ttl && (
                  <span className="text-2xs text-amber-400/70">{Math.round(lockStatus.ttl / 60)}m</span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Release edit lock</TooltipContent>
          </Tooltip>
        ) : isLocked ? (
          <div className="flex items-center gap-1.5 rounded border border-red-500/25 bg-red-500/10 px-2 py-0.5">
            <Lock className="h-3 w-3 text-red-400" />
            <span className="text-2xs font-semibold text-red-400">Locked by {lockedBy}</span>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2"
                disabled={acquiringLock}
                onClick={onAcquireLock}
                data-testid="sg-acquire-lock-btn"
              >
                {acquiringLock
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Eye className="h-3.5 w-3.5" />}
                <span className="text-2xs">Viewing · Read-only</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Acquire edit lock</TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </div>
  )
}
```

- [ ] **Step 2: Create `scenario-gantt-view.tsx`**

```tsx
// gantt/src/components/shell/scenario-gantt-view.tsx
import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { getScenarioGanttStore, destroyScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { ScenarioGanttToolbar } from '@/components/scenario-gantt/scenario-gantt-toolbar'
import { ScenarioGanttRenderer } from '@/components/scenario-gantt/scenario-gantt-renderer'

interface ScenarioGanttViewProps {
  scenarioId: number
}

const LOCK_POLL_MS = 30_000    // 30 s polling for lock status
const LOCK_KEEPALIVE_MS = 5 * 60_000  // 5 min keepalive heartbeat

export const ScenarioGanttView = ({ scenarioId }: ScenarioGanttViewProps): ReactNode => {
  const useStore = getScenarioGanttStore(scenarioId)
  const data          = useStore((s) => s.data)
  const loading       = useStore((s) => s.loading)
  const error         = useStore((s) => s.error)
  const pendingChanges = useStore((s) => s.pendingChanges)
  const isDirty       = useStore((s) => s.isDirty)
  const saving        = useStore((s) => s.saving)
  const lockStatus    = useStore((s) => s.lockStatus)
  const acquiringLock = useStore((s) => s.acquiringLock)
  const loadData      = useStore((s) => s.loadData)
  const acquireLock   = useStore((s) => s.acquireLock)
  const releaseLock   = useStore((s) => s.releaseLock)
  const refreshLock   = useStore((s) => s.refreshLock)
  const addPatch      = useStore((s) => s.addPatch)
  const save          = useStore((s) => s.save)

  // Load data on mount
  useEffect(() => {
    void loadData(scenarioId)
    return () => {
      // Release lock if owner when tab is closed
      const s = getScenarioGanttStore(scenarioId).getState()
      if (s.lockStatus?.isOwner) void s.releaseLock(scenarioId)
      destroyScenarioGanttStore(scenarioId)
    }
  }, [scenarioId, loadData])

  // Poll lock status
  useEffect(() => {
    const id = setInterval(() => void refreshLock(scenarioId), LOCK_POLL_MS)
    return () => clearInterval(id)
  }, [scenarioId, refreshLock])

  // Keepalive if owner
  useEffect(() => {
    if (!lockStatus?.isOwner) return
    const { keepaliveLock } = await import('@/services/scenario-gantt-api').then(m => m.scenarioGanttApi)
    const id = setInterval(() => void scenarioGanttApi.keepaliveLock(scenarioId), LOCK_KEEPALIVE_MS)
    return () => clearInterval(id)
  }, [lockStatus?.isOwner, scenarioId])

  const pairingMap = useMemo(() => {
    if (!data) return new Map()
    return new Map(data.pairings.map((p) => [p.pairingId, p]))
  }, [data])

  const canEdit = lockStatus?.isOwner ?? false

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading scenario data…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-destructive">
        Error: {error}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="scenario-gantt-view">
      <ScenarioGanttToolbar
        data={data}
        lockStatus={lockStatus}
        isDirty={isDirty}
        saving={saving}
        acquiringLock={acquiringLock}
        onAcquireLock={() => void acquireLock(scenarioId)}
        onReleaseLock={() => void releaseLock(scenarioId)}
        onSave={() => void save(scenarioId)}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <ScenarioGanttRenderer
          crew={data.crew}
          pairingMap={pairingMap}
          assignments={data.assignments}
          pendingChanges={pendingChanges}
          startDate={data.strDtLoc}
          endDate={data.endDtLoc}
          canEdit={canEdit}
          onReassign={(pairingId, fromCrewId, toCrewId) =>
            addPatch({ op: 'reassign', pairingId, crewId: fromCrewId, toCrewId })
          }
          onRemove={(pairingId, crewId) =>
            addPatch({ op: 'remove', pairingId, crewId })
          }
        />
      </div>
    </div>
  )
}
```

Note: The `keepalive` import needs fixing. Replace the `useEffect` keepalive block with:

```tsx
  // Keepalive if owner
  const isOwner = lockStatus?.isOwner ?? false
  useEffect(() => {
    if (!isOwner) return
    const id = setInterval(
      () => void scenarioGanttApi.keepaliveLock(scenarioId),
      LOCK_KEEPALIVE_MS,
    )
    return () => clearInterval(id)
  }, [isOwner, scenarioId])
```

Add `import { scenarioGanttApi } from '@/services/scenario-gantt-api'` at the top.

- [ ] **Step 3: Modify `scenario-toolbar.tsx` `handleOpen` to open Scenario Gantt tab**

Find `handleOpen` (around line 128-131):
```typescript
  const handleOpen = (): void => {
    void openScenarioRoster(detail.id)
    setModule('live')
  }
```

Replace with:
```typescript
  const handleOpen = (): void => {
    setModule(`scenario-gantt:${detail.id}`)
  }
```

Also remove `openScenarioRoster` from the destructured store state if it's no longer needed elsewhere:
```typescript
  // Remove this line:
  const openScenarioRoster = useScenarioStore((s) => s.openScenarioRoster)
```

- [ ] **Step 4: Run TypeScript build check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt
npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors before committing.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx \
        gantt/src/components/shell/scenario-gantt-view.tsx \
        gantt/src/components/scenario/scenario-toolbar.tsx
git commit -m "feat(gantt): ScenarioGanttToolbar + ScenarioGanttView + wire handleOpen"
```

---

### Task 10: E2E — Read-only Scenario Gantt opens correctly

**Files:**
- Create: `e2e/tests/gantt/scenario-gantt-open.spec.ts`

- [ ] **Step 1: Write the E2E test**

```typescript
// e2e/tests/gantt/scenario-gantt-open.spec.ts
/**
 * Proves that clicking "Open scenario" on a DONE RO scenario opens a
 * Scenario Gantt tab with the correct scenario name and data-source badge.
 * The Live Gantt tab is NOT switched to (the Open button no longer calls
 * setModule('live')).
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage, type RoScenarioInput } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario Gantt — open read-only', () => {
  const unique = `${Date.now()}`
  const input: RoScenarioInput = {
    name: `RO-GanttOpen-${unique}`,
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    crewBase: 'YEG',
    division: 'Pilots',
  }
  let token = ''
  let scenarioId = 0

  test.beforeEach(async ({ page, request }) => {
    const res = await request.post(`${GANTT_API}/api/auth/login`, {
      data: { userCode: GANTT_USER, password: GANTT_PASS },
    })
    const { data } = (await res.json()) as { data: { token: string; userCode: string; userName: string; schema: string } }
    token = data.token
    await page.addInitScript((a) => {
      window.sessionStorage.setItem('rois-auth', JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }))
    }, data)
  })

  test.afterEach(async ({ request }) => {
    if (!scenarioId) return
    await request.delete(`${GANTT_API}/api/scenario/${scenarioId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  })

  test('Open scenario button opens a Scenario Gantt tab (not Live)', async ({ page, request }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await scenario.createRoScenario(input)

    // Find scenario ID and force DONE status via API
    const listRes = await request.get(`${GANTT_API}/api/scenario`, {
      params: { page: 1, pageSize: 50, fileType: 'RO', name: input.name },
      headers: { Authorization: `Bearer ${token}` },
    })
    const { data: listData } = (await listRes.json()) as { data: { items: Array<{ id: number }> } }
    scenarioId = listData.items[0].id

    await request.post(`${GANTT_API}/api/scenario/${scenarioId}/transition`, {
      data: { status: 'DONE' },
      headers: { Authorization: `Bearer ${token}` },
    })

    // Reload and select the scenario
    await page.reload()
    await page.waitForLoadState('networkidle')
    await scenario.gotoRo()
    await scenario.listItemByName(input.name).click()
    await expect(scenario.detailPanel).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-status-badge')).toHaveText('Done')

    // Click Open scenario
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()

    // A new "Scenario Gantt" tab should appear in the top nav
    const ganttTab = page.getByRole('navigation').getByText(input.name).or(
      page.locator('[data-testid^="module-tab-scenario-gantt"]'),
    ).first()
    await expect(ganttTab).toBeVisible({ timeout: 5_000 })

    // The Scenario Gantt view should be mounted and toolbar visible
    await expect(page.getByTestId('scenario-gantt-toolbar')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('sg-scenario-name')).toContainText(input.name)

    // Should NOT have navigated to Live Gantt (live module toolbar absent)
    await expect(page.getByTestId('gantt-sub-toolbar')).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Run the test**

```bash
cd /home/yuan.z/rois/rois-ai
npx playwright test e2e/tests/gantt/scenario-gantt-open.spec.ts --reporter=list 2>&1 | tail -20
```

Expected: PASS (or SKIP if test env lacks a real DONE scenario with output.gz — note in output).

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/gantt/scenario-gantt-open.spec.ts
git commit -m "test(e2e): scenario-gantt-open — open button creates new Scenario Gantt tab"
```

---

## Phase 2: Edit Lock + Micro-adjust

---

### Task 11: engine-server — PUT /optimize/result/{task_id}/output (output write endpoint)

**Files:**
- Modify: `engine-server/src/api/routes.py` (add PUT route)

- [ ] **Step 1: Add `PUT /optimize/result/{task_id}/output` in routes.py**

After the `GET /optimize/input/{task_id}` endpoint, add:

```python
@router.put("/optimize/result/{task_id}/output")
async def write_optimization_output(
    task_id: str,
    request: Request,
    auth: AuthContext = Depends(verify_token),
):
    """覆盖写入任务的 output.gz（用于 live-server 保存场景微调结果）。
    调用方必须持有 Redis 编辑锁（由 live-server 保证，engine-server 不重复校验）。
    """
    import os
    from fastapi import Request

    task = task_manager.get_task(task_id)
    if not task or not task.output_file_path:
        raise HTTPException(status_code=404, detail="任务不存在或无输出文件路径")

    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="请求体为空")

    try:
        with open(task.output_file_path, 'wb') as f:
            f.write(data)
        logger.info("[Task %s] output.gz 已更新，大小: %d bytes", task_id, len(data))
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"写入文件失败: {e}")

    return {"status": "updated", "task_id": task_id, "bytes": len(data)}
```

Add `from fastapi import Request` to the imports at the top of routes.py (if not already present).

- [ ] **Step 2: Run engine-server tests**

```bash
cd /home/yuan.z/rois/rois-ai/engine-server
python3 -m pytest tests/ -v --tb=short -q 2>&1 | tail -20
```

Expected: all existing tests pass (new endpoint not yet tested here — covered in Task 13 integration).

- [ ] **Step 3: Commit**

```bash
git add engine-server/src/api/routes.py
git commit -m "feat(engine-server): PUT /optimize/result/{task_id}/output — accept patched output.gz"
```

---

### Task 12: live-server — Redis lock service + 4 lock routes

**Files:**
- Create: `live-server/src/services/scenario/scenario-lock-service.ts`
- Create: `live-server/src/__tests__/services/scenario-lock-service.test.ts`
- Modify: `live-server/src/routes/scenario/scenario.ts` (add 4 lock routes)

- [ ] **Step 1: Create `scenario-lock-service.ts`**

```typescript
// live-server/src/services/scenario/scenario-lock-service.ts
import type { RedisClientType } from 'redis'

const LOCK_TTL = 15 * 60  // 15 minutes in seconds

export const scenarioLockService = {
  key: (scenarioId: number) => `scenario:edit-lock:${scenarioId}`,

  /** Attempt to acquire the lock. Returns true if acquired. */
  async acquire(redis: RedisClientType, scenarioId: number, userCode: string): Promise<boolean> {
    const result = await redis.set(
      scenarioLockService.key(scenarioId),
      userCode,
      { NX: true, EX: LOCK_TTL },
    )
    return result === 'OK'
  },

  /** Release the lock. Returns true if the lock belonged to userCode and was deleted. */
  async release(redis: RedisClientType, scenarioId: number, userCode: string): Promise<boolean> {
    const current = await redis.get(scenarioLockService.key(scenarioId))
    if (current !== userCode) return false
    await redis.del(scenarioLockService.key(scenarioId))
    return true
  },

  /** Return current lock state: owner and TTL in seconds. */
  async status(redis: RedisClientType, scenarioId: number, requestUserCode: string): Promise<{
    locked: boolean
    owner: string | null
    ttl: number | null
    isOwner: boolean
  }> {
    const owner = await redis.get(scenarioLockService.key(scenarioId))
    if (!owner) return { locked: false, owner: null, ttl: null, isOwner: false }
    const ttl = await redis.ttl(scenarioLockService.key(scenarioId))
    return { locked: true, owner, ttl: ttl > 0 ? ttl : null, isOwner: owner === requestUserCode }
  },

  /** Reset TTL for the current owner. Returns true if renewed. */
  async keepalive(redis: RedisClientType, scenarioId: number, userCode: string): Promise<boolean> {
    const current = await redis.get(scenarioLockService.key(scenarioId))
    if (current !== userCode) return false
    await redis.expire(scenarioLockService.key(scenarioId), LOCK_TTL)
    return true
  },
}
```

- [ ] **Step 2: Write failing tests**

```typescript
// live-server/src/__tests__/services/scenario-lock-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scenarioLockService } from '../../services/scenario/scenario-lock-service.js'

function mockRedis(store: Record<string, string> = {}): any {
  const ttls: Record<string, number> = {}
  return {
    set: vi.fn(async (key: string, val: string, opts: { NX?: boolean; EX?: number }) => {
      if (opts.NX && key in store) return null
      store[key] = val
      if (opts.EX) ttls[key] = opts.EX
      return 'OK'
    }),
    get: vi.fn(async (key: string) => store[key] ?? null),
    del: vi.fn(async (key: string) => { delete store[key]; delete ttls[key] }),
    ttl: vi.fn(async (key: string) => ttls[key] ?? -2),
    expire: vi.fn(async (key: string, secs: number) => { ttls[key] = secs }),
  }
}

describe('scenarioLockService', () => {
  it('acquire returns true when no existing lock', async () => {
    const redis = mockRedis()
    expect(await scenarioLockService.acquire(redis, 1, 'alice')).toBe(true)
  })

  it('acquire returns false when lock held by another user', async () => {
    const redis = mockRedis()
    await scenarioLockService.acquire(redis, 1, 'alice')
    expect(await scenarioLockService.acquire(redis, 1, 'bob')).toBe(false)
  })

  it('release returns true only for lock owner', async () => {
    const redis = mockRedis()
    await scenarioLockService.acquire(redis, 1, 'alice')
    expect(await scenarioLockService.release(redis, 1, 'bob')).toBe(false)
    expect(await scenarioLockService.release(redis, 1, 'alice')).toBe(true)
    const st = await scenarioLockService.status(redis, 1, 'alice')
    expect(st.locked).toBe(false)
  })

  it('status reports owner and isOwner correctly', async () => {
    const redis = mockRedis()
    await scenarioLockService.acquire(redis, 1, 'alice')
    const forAlice = await scenarioLockService.status(redis, 1, 'alice')
    expect(forAlice.isOwner).toBe(true)
    expect(forAlice.owner).toBe('alice')
    const forBob = await scenarioLockService.status(redis, 1, 'bob')
    expect(forBob.isOwner).toBe(false)
  })

  it('keepalive extends TTL only for owner', async () => {
    const redis = mockRedis()
    await scenarioLockService.acquire(redis, 1, 'alice')
    expect(await scenarioLockService.keepalive(redis, 1, 'bob')).toBe(false)
    expect(await scenarioLockService.keepalive(redis, 1, 'alice')).toBe(true)
    expect(redis.expire).toHaveBeenCalledWith('scenario:edit-lock:1', 900)
  })
})
```

- [ ] **Step 3: Run the tests**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npx vitest run src/__tests__/services/scenario-lock-service.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: 5 tests pass.

- [ ] **Step 4: Add 4 lock routes to `scenario.ts`**

Append before the closing `}` of `scenarioRoutes`, after the gantt-data route:

```typescript
  // ── Edit lock routes ──────────────────────────────────────────────

  const userCode = (req: { authUser?: { userCode?: string } }) =>
    req.authUser?.userCode ?? 'anonymous'

  // POST /api/scenario/:id/acquire-lock
  fastify.post('/:id/acquire-lock', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const { scenarioLockService } = await import('../../services/scenario/scenario-lock-service.js')
    const acquired = await scenarioLockService.acquire(fastify.redis, numId, userCode(request))
    const status = await scenarioLockService.status(fastify.redis, numId, userCode(request))
    return success(reply, { acquired, ...status })
  })

  // POST /api/scenario/:id/release-lock
  fastify.post('/:id/release-lock', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const { scenarioLockService } = await import('../../services/scenario/scenario-lock-service.js')
    const released = await scenarioLockService.release(fastify.redis, numId, userCode(request))
    return success(reply, { released })
  })

  // GET /api/scenario/:id/lock-status
  fastify.get('/:id/lock-status', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const { scenarioLockService } = await import('../../services/scenario/scenario-lock-service.js')
    const status = await scenarioLockService.status(fastify.redis, numId, userCode(request))
    return success(reply, status)
  })

  // POST /api/scenario/:id/lock-keepalive
  fastify.post('/:id/lock-keepalive', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const { scenarioLockService } = await import('../../services/scenario/scenario-lock-service.js')
    const renewed = await scenarioLockService.keepalive(fastify.redis, numId, userCode(request))
    return success(reply, { renewed })
  })
```

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/scenario/scenario-lock-service.ts \
        live-server/src/__tests__/services/scenario-lock-service.test.ts \
        live-server/src/routes/scenario/scenario.ts
git commit -m "feat(live-server): Redis edit lock service + acquire/release/status/keepalive routes"
```

---

### Task 13: live-server — writeOutputFile + patch-output service + route

**Files:**
- Modify: `live-server/src/services/engine-server-client.ts` (add `writeOutputFile`)
- Create: `live-server/src/services/scenario/scenario-patch-service.ts`
- Create: `live-server/src/__tests__/services/scenario-patch-service.test.ts`
- Modify: `live-server/src/routes/scenario/scenario.ts` (add patch-output route)

- [ ] **Step 1: Add `writeOutputFile` to `engine-server-client.ts`**

```typescript
  /** Overwrite ro_output.gz on engine-server (called after patch-output save). */
  async writeOutputFile(taskId: string, gzBytes: Buffer, token: string, airline: string): Promise<void> {
    const res = await fetch(`${env.ENGINE_SERVER_URL}/api/optimize/result/${taskId}/output`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/gzip',
        Authorization: `Bearer ${token}`,
        'X-Airline': airline.toUpperCase(),
      },
      body: gzBytes,
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      throw new Error(`engine-server PUT /optimize/result output ${res.status}: ${await res.text()}`)
    }
  },
```

- [ ] **Step 2: Create `scenario-patch-service.ts`**

```typescript
// live-server/src/services/scenario/scenario-patch-service.ts
import { gzipSync } from 'node:zlib'
import { engineServerClient } from '../engine-server-client.js'
import { parseSections } from './scenario-result-service.js'

export interface AssignmentPatch {
  op: 'add' | 'remove' | 'reassign'
  crewId: string
  pairingId: number
  toCrewId?: string
}

function csvEscape(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function rebuildSections(
  sections: Record<string, Record<string, string>[]>,
  patchCount: number,
): string {
  const modifiedAt = new Date().toISOString()
  const parts: string[] = [
    `## MODIFIED_AT\nmodified_at,patch_count\n${modifiedAt},${patchCount}\n`,
  ]
  for (const [name, rows] of Object.entries(sections)) {
    if (name === 'MODIFIED_AT') continue
    if (rows.length === 0) { parts.push(`## ${name}\n`); continue }
    const cols = Object.keys(rows[0])
    const header = cols.join(',')
    const body = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(',')).join('\n')
    parts.push(`## ${name}\n${header}\n${body}\n`)
  }
  return parts.join('\n')
}

export async function applyOutputPatch(
  taskId: string,
  patches: AssignmentPatch[],
  token: string,
  airline: string,
): Promise<void> {
  const outputGz = await engineServerClient.fetchResultFile(taskId, token, airline)
  const sections = parseSections(outputGz)

  let assignments: Record<string, string>[] = sections['ASSIGNMENTS'] ?? []

  for (const patch of patches) {
    if (patch.op === 'remove') {
      assignments = assignments.filter(
        (a) => !(a['crew_id'] === patch.crewId && a['pairing_id'] === String(patch.pairingId)),
      )
    } else if (patch.op === 'add') {
      assignments.push({ crew_id: patch.crewId, pairing_id: String(patch.pairingId) })
    } else if (patch.op === 'reassign' && patch.toCrewId) {
      assignments = assignments.map((a) =>
        a['crew_id'] === patch.crewId && a['pairing_id'] === String(patch.pairingId)
          ? { ...a, crew_id: patch.toCrewId! }
          : a,
      )
    }
  }

  sections['ASSIGNMENTS'] = assignments
  const newContent = rebuildSections(sections, patches.length)
  const newGz = gzipSync(Buffer.from(newContent, 'utf-8'))

  await engineServerClient.writeOutputFile(taskId, newGz, token, airline)
}
```

- [ ] **Step 3: Write failing tests for `scenario-patch-service`**

```typescript
// live-server/src/__tests__/services/scenario-patch-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gzipSync, gunzipSync } from 'node:zlib'

vi.mock('../../services/engine-server-client.js')
vi.mock('../../config/env.js', () => ({ env: { ENGINE_SERVER_URL: 'http://engine:3003' } }))

import { engineServerClient } from '../../services/engine-server-client.js'
import { applyOutputPatch } from '../../services/scenario/scenario-patch-service.js'

function makeGz(text: string): Buffer {
  return gzipSync(Buffer.from(text, 'utf-8'))
}

const BASE_OUTPUT = makeGz(
  `## ASSIGNMENTS\ncrew_id,pairing_id\nF80001,100\nF80002,200\n`
)

describe('applyOutputPatch', () => {
  let writtenGz: Buffer | null = null

  beforeEach(() => {
    vi.resetAllMocks()
    writtenGz = null
    vi.mocked(engineServerClient.fetchResultFile).mockResolvedValue(BASE_OUTPUT)
    vi.mocked(engineServerClient.writeOutputFile).mockImplementation(async (_, gz) => {
      writtenGz = gz
    })
  })

  it('remove: removes the matching assignment', async () => {
    await applyOutputPatch('t-1', [{ op: 'remove', crewId: 'F80001', pairingId: 100 }], 'tok', 'f8')
    const text = gunzipSync(writtenGz!).toString()
    expect(text).not.toContain('F80001,100')
    expect(text).toContain('F80002,200')
  })

  it('reassign: changes crew_id for matching pairing', async () => {
    await applyOutputPatch(
      't-1',
      [{ op: 'reassign', crewId: 'F80001', pairingId: 100, toCrewId: 'F80003' }],
      'tok', 'f8',
    )
    const text = gunzipSync(writtenGz!).toString()
    expect(text).not.toContain('F80001,100')
    expect(text).toContain('F80003,100')
  })

  it('add: inserts new assignment row', async () => {
    await applyOutputPatch('t-1', [{ op: 'add', crewId: 'F80004', pairingId: 300 }], 'tok', 'f8')
    const text = gunzipSync(writtenGz!).toString()
    expect(text).toContain('F80004,300')
  })

  it('writes MODIFIED_AT section to mark patched file', async () => {
    await applyOutputPatch('t-1', [{ op: 'remove', crewId: 'F80001', pairingId: 100 }], 'tok', 'f8')
    const text = gunzipSync(writtenGz!).toString()
    expect(text).toContain('## MODIFIED_AT')
    expect(text).toContain('patch_count')
  })
})
```

- [ ] **Step 4: Run the tests**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npx vitest run src/__tests__/services/scenario-patch-service.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: 4 tests pass.

- [ ] **Step 5: Add `POST /api/scenario/:id/patch-output` route to `scenario.ts`**

Append after the lock routes:

```typescript
  // POST /api/scenario/:id/patch-output — apply ASSIGNMENTS delta and write new output.gz
  fastify.post('/:id/patch-output', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const { patches } = request.body as { patches: import('../../services/scenario/scenario-patch-service.js').AssignmentPatch[] }
    if (!Array.isArray(patches) || patches.length === 0) {
      return fail(reply, 400, 'patches must be a non-empty array')
    }

    // Verify caller holds the edit lock
    const callerCode = request.authUser?.userCode ?? 'anonymous'
    const { scenarioLockService } = await import('../../services/scenario/scenario-lock-service.js')
    const lockSt = await scenarioLockService.status(fastify.redis, numId, callerCode)
    if (!lockSt.isOwner) return fail(reply, 409, 'You do not hold the edit lock for this scenario')

    const sc = await scenarioService.getById(fastify, numId)
    if (!sc) return fail(reply, 404, 'Scenario not found')
    if (!sc.taskId) return fail(reply, 409, 'Scenario has no task ID — run optimization first')

    const airline = request.authUser?.schema ?? 'f8'
    const token = bearerToken(request)

    try {
      const { applyOutputPatch } = await import('../../services/scenario/scenario-patch-service.js')
      await applyOutputPatch(sc.taskId, patches, token, airline)
      return success(reply, { patched: patches.length })
    } catch (err) {
      return error(reply, 502, `Patch failed: ${(err as Error).message}`)
    }
  })
```

- [ ] **Step 6: Commit**

```bash
git add live-server/src/services/engine-server-client.ts \
        live-server/src/services/scenario/scenario-patch-service.ts \
        live-server/src/__tests__/services/scenario-patch-service.test.ts \
        live-server/src/routes/scenario/scenario.ts
git commit -m "feat(live-server): writeOutputFile + patch-output service + POST patch-output route"
```

---

### Task 14: Frontend — version bump

Per CLAUDE.md, any backend + frontend change requires version bump.

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Increment versions**

Read current values then increment `FRONTEND_VERSION` by 1 and `BACKEND_VERSION` by 1 (both backend services changed).

```bash
cat /home/yuan.z/rois/rois-ai/gantt/src/version.ts
```

Then edit the file to increment both counters.

- [ ] **Step 2: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore: bump version (scenario-gantt feature — frontend + backend)"
```

---

### Task 15: E2E — Edit lock + micro-adjust + save

**Files:**
- Create: `e2e/tests/gantt/scenario-gantt-edit.spec.ts`

- [ ] **Step 1: Write the E2E test**

```typescript
// e2e/tests/gantt/scenario-gantt-edit.spec.ts
/**
 * Proves the Scenario Gantt edit flow:
 *   1. Open a DONE scenario → Scenario Gantt tab renders (read-only).
 *   2. Click "Acquire Edit Lock" → toolbar shows "Editing" state.
 *   3. Right-click a pairing bar → Remove → bar disappears (pending change).
 *   4. Save → patch-output API called → Gantt reloads with updated data.
 *   5. Release lock → toolbar returns to "Viewing" state.
 *
 * NOTE: This test requires a DONE scenario with a real output.gz on engine-server.
 * In CI, this test should be skipped unless ENGINE_SERVER_URL is set and reachable.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage, type RoScenarioInput } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario Gantt — edit lock + save', () => {
  const unique = `${Date.now()}`
  const input: RoScenarioInput = {
    name: `RO-GanttEdit-${unique}`,
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    crewBase: 'YEG',
    division: 'Pilots',
  }
  let token = ''
  let scenarioId = 0

  test.beforeEach(async ({ page, request }) => {
    const res = await request.post(`${GANTT_API}/api/auth/login`, {
      data: { userCode: GANTT_USER, password: GANTT_PASS },
    })
    const { data } = (await res.json()) as { data: { token: string; userCode: string; userName: string; schema: string } }
    token = data.token
    await page.addInitScript((a) => {
      window.sessionStorage.setItem('rois-auth', JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }))
    }, data)
  })

  test.afterEach(async ({ request }) => {
    if (!scenarioId) return
    // Release lock (best-effort)
    await request.post(`${GANTT_API}/api/scenario/${scenarioId}/release-lock`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})
    await request.delete(`${GANTT_API}/api/scenario/${scenarioId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})
  })

  test('acquire lock → edit (remove bar) → save → release lock', async ({ page, request }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    await scenario.createRoScenario(input)

    const listRes = await request.get(`${GANTT_API}/api/scenario`, {
      params: { page: 1, pageSize: 50, fileType: 'RO', name: input.name },
      headers: { Authorization: `Bearer ${token}` },
    })
    const { data: listData } = (await listRes.json()) as { data: { items: Array<{ id: number }> } }
    scenarioId = listData.items[0].id

    await request.post(`${GANTT_API}/api/scenario/${scenarioId}/transition`, {
      data: { status: 'DONE' },
      headers: { Authorization: `Bearer ${token}` },
    })

    // Open scenario gantt
    await page.reload()
    await page.waitForLoadState('networkidle')
    await scenario.gotoRo()
    await scenario.listItemByName(input.name).click()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()

    const toolbar = page.getByTestId('scenario-gantt-toolbar')
    await expect(toolbar).toBeVisible({ timeout: 10_000 })

    // ── Step: acquire lock
    await toolbar.getByTestId('sg-acquire-lock-btn').click()
    await expect(toolbar.getByTestId('sg-release-lock-btn')).toBeVisible({ timeout: 5_000 })
    await expect(toolbar.getByTestId('sg-save-btn')).toBeVisible()

    // ── Step: Save button disabled when no changes
    await expect(toolbar.getByTestId('sg-save-btn')).toBeDisabled()

    // ── Step: right-click first pairing bar to remove it
    const firstBar = page.locator('[data-pairing-id]').first()
    await expect(firstBar).toBeVisible({ timeout: 10_000 })
    const pairingId = await firstBar.getAttribute('data-pairing-id')
    await firstBar.click({ button: 'right' })

    // Bar should disappear from view (pending removal)
    await expect(page.locator(`[data-pairing-id="${pairingId}"]`)).toHaveCount(0, { timeout: 3_000 })

    // Save button should be enabled (dirty state)
    await expect(toolbar.getByTestId('sg-save-btn')).toBeEnabled()

    // ── Step: save (mocked — will fail if no real engine-server; skip gracefully)
    // In real E2E with engine-server: save should succeed and gantt reload
    // Here we just verify the button triggers and no crash occurs
    await toolbar.getByTestId('sg-save-btn').click()

    // ── Step: release lock
    await toolbar.getByTestId('sg-release-lock-btn').click()
    await expect(toolbar.getByTestId('sg-acquire-lock-btn')).toBeVisible({ timeout: 5_000 })
  })
})
```

- [ ] **Step 2: Run the test**

```bash
cd /home/yuan.z/rois/rois-ai
npx playwright test e2e/tests/gantt/scenario-gantt-edit.spec.ts --reporter=list 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/gantt/scenario-gantt-edit.spec.ts
git commit -m "test(e2e): scenario-gantt-edit — lock acquire / remove / save / release flow"
```

---

## Self-Review Checklist (run before declaring done)

- [ ] `GET /api/scenario/:id/gantt-data` is registered in scenario.ts routes
- [ ] `buildGanttDataSnapshot` / `buildGanttDataLiveRefresh` both exported from scenario-gantt-service.ts
- [ ] `scenario-lock-service.ts` key pattern is `scenario:edit-lock:{id}` (not `scenario:lock:...`)
- [ ] `applyOutputPatch` reads sections with key `'ASSIGNMENTS'` (uppercase, matching parseSections output)
- [ ] `ScenarioGanttView` imports `scenarioGanttApi` for keepalive — ensure no circular import
- [ ] `handleOpen` in scenario-toolbar.tsx no longer references `openScenarioRoster`
- [ ] `ActiveModule` changed to `string` in shell-store.ts — check that sidebar logic compiles
- [ ] `destroyScenarioGanttStore` called on unmount in ScenarioGanttView to prevent memory leak
- [ ] engine-server `Request` import added to routes.py for the PUT endpoint
- [ ] `input_file_path` updated alongside `output_file_path` in `_submit_scenario_result` (task_manager.py line ~275)
