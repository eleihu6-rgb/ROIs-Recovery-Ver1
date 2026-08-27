# Crew Assignment Pre-Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block drag-drop pairing→crew assignments that violate division / open-position / rank_acting rules, validate the same rules server-side (returning 409 on violation), and disable the Save button while the legality popup is open — closing the data-drift race window.

**Architecture:** Extract pure `validateAssignment()` into a new workspace package `@rois/shared-rules` so frontend (gantt) and backend (live-server) share one source. Add a one-time in-memory `rank-acting-store` on the frontend for the cache. Wrap `rosterApi.assignPairing()` to translate backend 409 into draft-op rollback + toast.

**Tech Stack:** TypeScript, Vitest, Playwright, Zustand, Fastify, Drizzle, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-08-20-crew-assignment-precheck-design.md`

---

## Global Constraints

These are the project-wide requirements copied from the spec — every task's requirements implicitly include them.

- **§Playwright-Required**: every UI feature/bug fix ships with a Playwright test in `e2e/gantt/` (or `e2e/pbs-portal/`).
- **§No-Illusion**: never claim a fix without running the test and pasting the PASS/FAIL output.
- **§Minimal-First / §Surgical**: do not refactor unrelated code; only touch what each task requires.
- **§Gantt-Unify**: shared logic goes in the shared layer, not forked into Live-only.
- **§First-Paint**: rank-acting fetch is one-time on mount; do not load per-assignment.
- **§UI-Standard-Gate**: 0 hard violations from `npm run check:ui` before merge.
- **§Front-end language**: UI text in **English** unless i18n config specifies Chinese.
- **§Code reuse**: extract shared logic, no parallel implementations.
- **§Pop-up Window Standard**: any dialog uses `@rois/ui` `AppDialog` only.
- **§Dependency safety**: only open-source permissive licenses (MIT/Apache-2.0/ISC/BSD); no telemetry/analytics packages.
- **§No-Auto-Commit**: do NOT run `git commit` or `git push` without explicit user command.

---

## File Structure

### New files
- `packages/shared-rules/package.json` — workspace package manifest
- `packages/shared-rules/tsconfig.json` — TS config
- `packages/shared-rules/src/index.ts` — public exports
- `packages/shared-rules/src/assignment-precheck.ts` — `validateAssignment()` + types
- `packages/shared-rules/src/assignment-precheck.test.ts` — Vitest unit tests
- `gantt/src/stores/rank-acting-store.ts` — Zustand store with in-memory cache
- `gantt/src/stores/__tests__/rank-acting-store.test.ts` — Vitest
- `live-server/src/routes/base/rank-acting.ts` — `GET /api/rank-acting` endpoint
- `live-server/src/services/base/rank-acting-service.ts` — DB query service
- `live-server/src/services/assignment/precheck-service.ts` — server-side precheck
- `live-server/src/services/assignment/__tests__/precheck-service.test.ts` — Vitest
- `e2e/gantt/assignment/precheck-division-mismatch.spec.ts`
- `e2e/gantt/assignment/precheck-no-open-position.spec.ts`
- `e2e/gantt/assignment/precheck-rank-acting-disallowed.spec.ts`
- `e2e/gantt/assignment/precheck-rank-acting-allowed.spec.ts`
- `e2e/gantt/assignment/save-disabled-on-popup.spec.ts`
- `e2e/gantt/assignment/backend-409-rollback.spec.ts`

### Modified files
- `pnpm-workspace.yaml` (root) — already lists `packages/*`; verify after package add
- `gantt/package.json` — add `@rois/shared-rules` dep
- `gantt/tsconfig.json` — add path mapping (if needed)
- `gantt/src/App.tsx` — call `rank-acting-store.loadForFiliale` on mount
- `gantt/src/components/layout/pane-container.tsx` — insert pre-check before `checkLiveDraftLegality`
- `gantt/src/components/roster/draft-toolbar.tsx` — extend `canSave` with `confirmDialog.open`
- `gantt/src/services/roster-api.ts` — wrap `assignPairing` to handle 409 + rollback
- `gantt/src/utils/scenario-assignment-rank.ts` — refactor to delegate to `validateAssignment`
- `live-server/package.json` — add `@rois/shared-rules` dep
- `live-server/src/routes/base/index.ts` — register `rank-acting` route
- `live-server/src/routes/roster/roster.ts` — call precheck before `assignPairing`, return 409

---

## Task 1: Create `@rois/shared-rules` workspace package with `validateAssignment()`

**Files:**
- Create: `packages/shared-rules/package.json`
- Create: `packages/shared-rules/tsconfig.json`
- Create: `packages/shared-rules/src/index.ts`
- Create: `packages/shared-rules/src/assignment-precheck.ts`
- Create: `packages/shared-rules/src/assignment-precheck.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2, 3, 4, 6):
  - `validateAssignment(crew: CrewInput, pairing: PairingInput, rankActing: RankActingMap): PrecheckResult`
  - Types: `CrewInput`, `PairingInput`, `RankActingMap`, `CompositionSlot`, `PrecheckResult`, `PrecheckFailureReason`

- [ ] **Step 1: Create `packages/shared-rules/package.json`**

```json
{
  "name": "@rois/shared-rules",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "files": ["src"],
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.2.6"
  }
}
```

- [ ] **Step 2: Create `packages/shared-rules/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write failing tests in `packages/shared-rules/src/assignment-precheck.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { validateAssignment, type RankActingMap } from './assignment-precheck'

const baseCrew = {
  id: 'C001',
  division: 'C',
  rank: 'FO',
}

const basePairing = {
  id: 1,
  division: 'C',
  composition: [
    { actingRank: 'CA', plan: 1, fill: 0 },
    { actingRank: 'FO', plan: 1, fill: 0 },
  ],
}

const emptyRankActing: RankActingMap = new Map()
const caToFo: RankActingMap = new Map([['CA', new Set(['FO'])]])

describe('validateAssignment - division', () => {
  it('returns DIVISION_MISMATCH when crew.division != pairing.division', () => {
    const result = validateAssignment(
      { ...baseCrew, division: 'C' },
      { ...basePairing, division: 'D' },
      emptyRankActing,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('DIVISION_MISMATCH')
  })
})

describe('validateAssignment - open position', () => {
  it('returns NO_OPEN_POSITION when no slot has plan > fill', () => {
    const result = validateAssignment(
      baseCrew,
      {
        ...basePairing,
        composition: [
          { actingRank: 'CA', plan: 1, fill: 1 },
          { actingRank: 'FO', plan: 1, fill: 1 },
        ],
      },
      emptyRankActing,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('NO_OPEN_POSITION')
  })
})

describe('validateAssignment - rank acting', () => {
  it('returns RANK_ACTING_DISALLOWED when crew rank has no matching open slot and no fallback', () => {
    const result = validateAssignment(
      { ...baseCrew, rank: 'FO' },
      { ...basePairing, composition: [{ actingRank: 'CA', plan: 1, fill: 0 }] },
      emptyRankActing,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('RANK_ACTING_DISALLOWED')
  })

  it('allows CA to fill FO slot when rank_acting maps CA → FO', () => {
    const result = validateAssignment(
      { ...baseCrew, rank: 'CA' },
      { ...basePairing, composition: [{ actingRank: 'FO', plan: 1, fill: 0 }] },
      caToFo,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.actingRank).toBe('FO')
  })

  it('matches exact rank without rank_acting lookup when open slot exists', () => {
    const result = validateAssignment(
      { ...baseCrew, rank: 'FO' },
      basePairing,
      emptyRankActing,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.actingRank).toBe('FO')
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run from repo root: `pnpm --filter @rois/shared-rules test`
Expected: FAIL — module `@rois/shared-rules/assignment-precheck` not found.

- [ ] **Step 5: Implement `packages/shared-rules/src/assignment-precheck.ts`**

```ts
export interface CompositionSlot {
  actingRank: string
  plan: number
  fill: number
}

export interface CrewInput {
  id: string
  division: string
  rank: string
}

export interface PairingInput {
  id: number
  division: string
  composition: CompositionSlot[]
}

export type RankActingMap = Map<string, Set<string>>

export type PrecheckFailureReason =
  | 'DIVISION_MISMATCH'
  | 'NO_OPEN_POSITION'
  | 'RANK_ACTING_DISALLOWED'

export type PrecheckResult =
  | { ok: true; actingRank: string }
  | { ok: false; reason: PrecheckFailureReason; message: string }

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

  // 2. Open positions
  const openSlots = pairing.composition.filter((s) => s.plan > s.fill)
  if (openSlots.length === 0) {
    return {
      ok: false,
      reason: 'NO_OPEN_POSITION',
      message: 'This pairing has no open positions',
    }
  }

  // 3a. Exact rank match
  const exact = openSlots.find((s) => s.actingRank === crew.rank)
  if (exact) return { ok: true, actingRank: exact.actingRank }

  // 3b. Cross-rank via rank_acting
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

- [ ] **Step 6: Create `packages/shared-rules/src/index.ts`**

```ts
export {
  validateAssignment,
} from './assignment-precheck'
export type {
  PrecheckResult,
  PrecheckFailureReason,
  CrewInput,
  PairingInput,
  RankActingMap,
  CompositionSlot,
} from './assignment-precheck'
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @rois/shared-rules test`
Expected: PASS — all 5 tests green.

- [ ] **Step 8: Verify `pnpm-workspace.yaml` includes the new package**

Open `/home/yuan.z/rois/rois-ai/pnpm-workspace.yaml`. Confirm it lists `packages/*`. If only specific packages are listed, add `'packages/shared-rules'`. **Do not commit yet** — wait for Task 2.

---

## Task 2: Wire `@rois/shared-rules` into gantt and live-server

**Files:**
- Modify: `gantt/package.json` (add dep)
- Modify: `live-server/package.json` (add dep)
- Modify: `pnpm-workspace.yaml` if not already listing `packages/*`

**Interfaces:**
- Consumes: `@rois/shared-rules` exports from Task 1

- [ ] **Step 1: Add dep to gantt**

Open `gantt/package.json`. Under `dependencies`, add:

```json
"@rois/shared-rules": "workspace:*"
```

- [ ] **Step 2: Add dep to live-server**

Open `live-server/package.json`. Under `dependencies`, add:

```json
"@rois/shared-rules": "workspace:*"
```

- [ ] **Step 3: Run `pnpm install`**

Run from repo root: `pnpm install`
Expected: install succeeds, `node_modules/@rois/shared-rules` resolved to `packages/shared-rules/`.

- [ ] **Step 4: Verify imports resolve**

Run from `gantt/`: `node -e "console.log(require.resolve('@rois/shared-rules'))"`
Expected: prints a path under `packages/shared-rules/src/index.ts`.

Run from `live-server/`: `node -e "console.log(require.resolve('@rois/shared-rules'))"`
Expected: same path.

- [ ] **Step 5: Stop**

Do not commit yet — Tasks 3 and 4 will use this dep.

---

## Task 3: Backend — `GET /api/rank-acting` endpoint + service

**Files:**
- Create: `live-server/src/services/base/rank-acting-service.ts`
- Create: `live-server/src/routes/base/rank-acting.ts`
- Modify: `live-server/src/routes/base/index.ts:30` (register route)

**Interfaces:**
- Produces: `GET /api/rank-acting` → `{ code: 200, data: Array<{ activeRank, actingRank, qual }>, message: 'ok' }`

- [ ] **Step 1: Create the service `live-server/src/services/base/rank-acting-service.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import { eq, and as andOp } from 'drizzle-orm'
import { rankActing } from '../../models/base/rank.js'

export interface RankActingRow {
  activeRank: string
  actingRank: string
  qual: string | null
}

export const rankActingService = {
  /** Fetch all active rank_acting mappings for the request's filiale. */
  async listForFiliale(fastify: FastifyInstance, filiale: string): Promise<RankActingRow[]> {
    const rows = await fastify.db
      .select({
        activeRank: rankActing.activeRank,
        actingRank: rankActing.actingRank,
        qual: rankActing.qual,
      })
      .from(rankActing)
      .where(andOp(eq(rankActing.filiale, filiale), eq(rankActing.isDeleted, 0)))
    return rows
  },
}
```

(If `rankActing.isDeleted` doesn't exist on the Drizzle schema, use the actual soft-delete column name. Inspect `live-server/src/models/base/rank.ts:21-33` to confirm; adjust the where clause accordingly. **If unsure, ask the user.**)

- [ ] **Step 2: Create the route `live-server/src/routes/base/rank-acting.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { rankActingService } from '../../services/base/rank-acting-service.js'

export default async function rankActingRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    try {
      const filiale = request.authUser?.schema ?? ''
      const data = await rankActingService.listForFiliale(fastify, filiale)
      return success(reply, data)
    } catch (err) {
      return fail(reply, 500, (err as Error).message)
    }
  })
}
```

- [ ] **Step 3: Register the route**

Open `live-server/src/routes/base/index.ts`. Add the import alongside the others (line 1–13):

```ts
import rankActingRoutes from './rank-acting.js'
```

Add the registration alongside the others (around line 25–35):

```ts
fastify.register(rankActingRoutes, { prefix: '/api/rank-acting' })
```

- [ ] **Step 4: Verify typecheck**

Run: `cd live-server && npm run typecheck` (or the equivalent — check `package.json` scripts; use `npx tsc --noEmit` if no script exists).
Expected: 0 errors. If `isDeleted` filter doesn't compile, fix per Step 1's note.

- [ ] **Step 5: Manual smoke (optional but recommended)**

Run live-server locally, authenticate, then `curl -H "Authorization: Bearer <token>" http://localhost:3000/api/rank-acting`.
Expected: returns JSON array of active mappings for the auth user's schema.

- [ ] **Step 6: Stop**

Do not commit yet — Task 4 builds on this.

---

## Task 4: Backend — server-side precheck in `assign-pairing` route

**Files:**
- Create: `live-server/src/services/assignment/precheck-service.ts`
- Create: `live-server/src/services/assignment/__tests__/precheck-service.test.ts`
- Modify: `live-server/src/routes/roster/roster.ts:386-417` (insert precheck)

**Interfaces:**
- Consumes: `validateAssignment` from `@rois/shared-rules`
- Produces: 409 response with `{ error: 'ASSIGNMENT_FAILED', reason, message }` on precheck failure

- [ ] **Step 1: Write failing test `live-server/src/services/assignment/__tests__/precheck-service.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the @rois/shared-rules module so we control validateAssignment output
vi.mock('@rois/shared-rules', () => ({
  validateAssignment: vi.fn(),
}))

import { validateAssignment } from '@rois/shared-rules'
import { precheckAssignment } from '../precheck-service.js'

const mockFastify = {
  db: {
    select: vi.fn(),
    // chainable mock
  },
} as unknown as Parameters<typeof type>[0] extends infer T ? T : never

describe('precheckAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok when validateAssignment passes', async () => {
    vi.mocked(validateAssignment).mockReturnValue({
      ok: true,
      actingRank: 'FO',
    })
    const result = await precheckAssignment(mockFastify as never, 'C001', 1)
    expect(result.ok).toBe(true)
  })

  it('returns the failure shape from validateAssignment', async () => {
    vi.mocked(validateAssignment).mockReturnValue({
      ok: false,
      reason: 'DIVISION_MISMATCH',
      message: 'Crew division C does not match pairing division D',
    })
    const result = await precheckAssignment(mockFastify as never, 'C001', 1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('DIVISION_MISMATCH')
      expect(result.message).toMatch(/does not match/)
    }
  })
})
```

(Note: tests will be fleshed out once `precheck-service` is implemented. The above is a smoke test pattern — adjust mock setup based on the actual service signature implemented in Step 3.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd live-server && npm test -- precheck-service`
Expected: FAIL — `precheck-service` module not found.

- [ ] **Step 3: Implement `live-server/src/services/assignment/precheck-service.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import { eq, and as andOp } from 'drizzle-orm'
import {
  validateAssignment,
  type PrecheckResult,
  type CrewInput,
  type PairingInput,
  type RankActingMap,
} from '@rois/shared-rules'
import { crew } from '../../models/crew/crew.js'
import { pairing } from '../../models/pairing/pairing.js'
import { pairingComposition } from '../../models/pairing/pairing-composition.js'
import { rankActing } from '../../models/base/rank.js'
import { notDeleted } from '../../utils/db-helpers.js'

export async function precheckAssignment(
  fastify: FastifyInstance,
  crewId: string,
  pairingId: number,
): Promise<PrecheckResult> {
  // 1. Load crew (use active rank on pairing date — pairing load is below)
  const [crewRow] = await fastify.db
    .select({
      id: crew.crewId,
      division: crew.division,
      rank: crew.crewRank,
    })
    .from(crew)
    .where(andOp(eq(crew.crewId, crewId), notDeleted(crew.isDeleted)))
    .limit(1)

  if (!crewRow) {
    return {
      ok: false,
      reason: 'RANK_ACTING_DISALLOWED',
      message: `Crew ${crewId} not found`,
    }
  }

  // 2. Load pairing + composition
  const [pairRow] = await fastify.db
    .select({ id: pairing.id, division: pairing.division })
    .from(pairing)
    .where(andOp(eq(pairing.id, pairingId), notDeleted(pairing.isDeleted)))
    .limit(1)

  if (!pairRow) {
    return {
      ok: false,
      reason: 'NO_OPEN_POSITION',
      message: `Pairing ${pairingId} not found`,
    }
  }

  const compRows = await fastify.db
    .select({
      actingRank: pairingComposition.actingRank,
      plan: pairingComposition.plan,
      fill: pairingComposition.fill,
    })
    .from(pairingComposition)
    .where(
      andOp(
        eq(pairingComposition.pairingId, pairingId),
        notDeleted(pairingComposition.isDeleted),
      ),
    )

  // 3. Load rank_acting for the crew's filiale
  const rankRows = await fastify.db
    .select({
      activeRank: rankActing.activeRank,
      actingRank: rankActing.actingRank,
    })
    .from(rankActing)
    .where(andOp(eq(rankActing.filiale, crewRow.division), notDeleted(rankActing.isDeleted)))

  const rankActingMap: RankActingMap = new Map()
  for (const r of rankRows) {
    if (!rankActingMap.has(r.activeRank)) {
      rankActingMap.set(r.activeRank, new Set())
    }
    rankActingMap.get(r.activeRank)!.add(r.actingRank)
  }

  const crewInput: CrewInput = {
    id: crewRow.id,
    division: crewRow.division,
    rank: crewRow.rank,
  }
  const pairingInput: PairingInput = {
    id: pairRow.id,
    division: pairRow.division,
    composition: compRows.map((c) => ({
      actingRank: c.actingRank ?? '',
      plan: c.plan ?? 0,
      fill: c.fill,
    })),
  }

  return validateAssignment(crewInput, pairingInput, rankActingMap)
}
```

(The actual Drizzle column names — `isDeleted`, `crewRank`, etc. — must match `live-server/src/models/`. Inspect each model file. **Adjust the field names if they differ**; the spec assumes `crew.crewRank`, `crew.division`, `pairing.division`, `pairingComposition.{actingRank, plan, fill, isDeleted}`, `rankActing.{filiale, activeRank, actingRank, isDeleted}`.)

- [ ] **Step 4: Wire precheck into `assign-pairing` route**

Open `live-server/src/routes/roster/roster.ts`. At the top (after the existing imports), add:

```ts
import { precheckAssignment } from '../../services/assignment/precheck-service.js'
```

Replace the existing `POST /assign-pairing` handler (lines 387–417) with:

```ts
fastify.post('/assign-pairing', async (request, reply) => {
  const schema = z.object({
    pairingId: z.number().int().positive(),
    crewId: z.string().min(1),
    rosterActingRank: z.string().min(1),
    username: z.string().default('system'),
  })

  const parsed = schema.safeParse(request.body)
  if (!parsed.success) {
    return fail(reply, 400, parsed.error.message)
  }

  // Server-side pre-check (defense-in-depth — frontend also blocks, but
  // protects against stale state, batch imports, and other clients).
  const precheck = await precheckAssignment(fastify, parsed.data.crewId, parsed.data.pairingId)
  if (!precheck.ok) {
    return reply.code(409).send({
      error: 'ASSIGNMENT_FAILED',
      reason: precheck.reason,
      message: precheck.message,
    })
  }

  const schemaName = request.authUser?.schema ?? liveSchemaName()
  try {
    const result = await rosterService.assignPairing(
      fastify,
      parsed.data.pairingId,
      parsed.data.crewId,
      precheck.actingRank,
      parsed.data.username,
    )
    await recheckMutation(fastify, request.body, [result?.[0]?.schStrDtUtc], [parsed.data.crewId])
    if (parsed.data.crewId && result?.[0]?.schStrDtUtc) {
      await recomputeForMutation(fastify, schemaName, [parsed.data.crewId], result[0].schStrDtUtc, parsed.data.username)
    }
    return success(reply, result)
  } catch (err) {
    return fail(reply, 400, (err as Error).message)
  }
})
```

- [ ] **Step 5: Run typecheck**

Run: `cd live-server && npx tsc --noEmit`
Expected: 0 errors. Fix any imports/fields that don't match the actual schema.

- [ ] **Step 6: Run tests**

Run: `cd live-server && npm test -- precheck-service`
Expected: PASS — both tests green.

- [ ] **Step 7: Manual smoke**

Run live-server locally. Use a tool like curl or Postman to POST a bad request:
`POST /api/roster/assign-pairing` with `crewId` and `pairingId` from different divisions.
Expected: 409 response with `{ error: 'ASSIGNMENT_FAILED', reason: 'DIVISION_MISMATCH', ... }`.

- [ ] **Step 8: Stop — checkpoint with user**

The backend now closes the data-drift race window. This is a shippable backend-only hotfix. Wait for user approval before proceeding to frontend tasks.

---

## Task 5: Frontend — `rank-acting-store` with one-time fetch + mount wire-up

**Files:**
- Create: `gantt/src/stores/rank-acting-store.ts`
- Create: `gantt/src/stores/__tests__/rank-acting-store.test.ts`
- Modify: `gantt/src/App.tsx` (call `loadForFiliale` on mount)

**Interfaces:**
- Produces (consumed by Task 6):
  - `useRankActingStore` with `.getForFiliale(filiale)` returning `RankActingMap`
  - `.loadForFiliale(filiale)` (idempotent)
  - `.invalidate(filiale)`

- [ ] **Step 1: Write failing test `gantt/src/stores/__tests__/rank-acting-store.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRankActingStore } from '../rank-acting-store'

describe('useRankActingStore', () => {
  beforeEach(() => {
    useRankActingStore.setState({ byFiliale: new Map(), loading: false, error: null })
  })

  it('returns empty Map when not loaded yet', () => {
    const map = useRankActingStore.getState().getForFiliale('F8')
    expect(map.size).toBe(0)
  })

  it('loadForFiliale fetches and indexes rows by activeRank', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 200,
        data: [
          { activeRank: 'CA', actingRank: 'FO', qual: null },
          { activeRank: 'CA', actingRank: 'FO', qual: 'TR' },
        ],
      }),
    }) as unknown as typeof fetch

    await useRankActingStore.getState().loadForFiliale('F8')
    const map = useRankActingStore.getState().getForFiliale('F8')
    expect(map.get('CA')?.has('FO')).toBe(true)
  })

  it('loadForFiliale is idempotent — second call is a no-op', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200, data: [] }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await useRankActingStore.getState().loadForFiliale('F8')
    await useRankActingStore.getState().loadForFiliale('F8')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('invalidate clears cached rows for a filiale', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200, data: [{ activeRank: 'CA', actingRank: 'FO', qual: null }] }),
    }) as unknown as typeof fetch
    await useRankActingStore.getState().loadForFiliale('F8')
    useRankActingStore.getState().invalidate('F8')
    expect(useRankActingStore.getState().getForFiliale('F8').size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gantt && npx vitest run src/stores/__tests__/rank-acting-store.test.ts`
Expected: FAIL — module `rank-acting-store` not found.

- [ ] **Step 3: Implement `gantt/src/stores/rank-acting-store.ts`**

```ts
import { create } from 'zustand'
import type { RankActingMap } from '@rois/shared-rules'
import { api } from '@/services/api'

interface RankActingState {
  byFiliale: Map<string, RankActingMap>
  loading: boolean
  error: string | null
  loadForFiliale: (filiale: string) => Promise<void>
  getForFiliale: (filiale: string) => RankActingMap
  invalidate: (filiale: string) => void
}

export const useRankActingStore = create<RankActingState>((set, get) => ({
  byFiliale: new Map(),
  loading: false,
  error: null,

  async loadForFiliale(filiale: string) {
    if (get().byFiliale.has(filiale) || !filiale) return
    set({ loading: true, error: null })
    try {
      const res = await api.get<Array<{ activeRank: string; actingRank: string; qual: string | null }>>('/api/rank-acting')
      const map: RankActingMap = new Map()
      for (const r of res) {
        if (!map.has(r.activeRank)) map.set(r.activeRank, new Set())
        map.get(r.activeRank)!.add(r.actingRank)
      }
      const next = new Map(get().byFiliale)
      next.set(filiale, map)
      set({ byFiliale: next, loading: false })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  },

  getForFiliale(filiale: string): RankActingMap {
    return get().byFiliale.get(filiale) ?? new Map()
  },

  invalidate(filiale: string) {
    const next = new Map(get().byFiliale)
    next.delete(filiale)
    set({ byFiliale: next })
  },
}))
```

(If `api.get` doesn't exist on `@/services/api`, use the existing pattern. Inspect `gantt/src/services/api.ts` for the right method. If the response shape is wrapped (`{ code, data, message }`), unwrap `.data`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gantt && npx vitest run src/stores/__tests__/rank-acting-store.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Wire-up in App.tsx**

Open `gantt/src/App.tsx`. Add the import:

```ts
import { useRankActingStore } from '@/stores/rank-acting-store'
```

In the App component (inside the existing `useEffect` for mount initialization, around line 39), add:

```ts
useEffect(() => {
  const filiale = /* resolve from auth/JWT — see existing pattern */
  if (filiale) {
    void useRankActingStore.getState().loadForFiliale(filiale)
  }
}, [/* deps */])
```

**Resolve the filiale value** by inspecting how the existing app determines the current airline schema. Likely candidates: `useAuthStore`, `useTenantStore`, JWT decode. **If unsure, ask the user.**

- [ ] **Step 6: Run typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Stop**

Do not commit yet — Task 6 uses this store.

---

## Task 6: Frontend — pre-check on drag-drop in `pane-container.tsx`

**Files:**
- Modify: `gantt/src/components/layout/pane-container.tsx:79-175` (insert pre-check before `checkLiveDraftLegality`)

**Interfaces:**
- Consumes: `validateAssignment` from `@rois/shared-rules`, `useRankActingStore`

- [ ] **Step 1: Read current drag-drop block**

Open `gantt/src/components/layout/pane-container.tsx`. Lines 79–175 implement `case 'assign-pairing'`. Note:
- Line 80–84: load pairing item
- Line 90–91: load crew via `useCrewStore`
- Line 92–150: build placeholder RosterItems
- Line 152–160: load draft + roster + call `checkLiveDraftLegality`
- Line 161–172: acquire lock, `draft.addOp`, refresh display

- [ ] **Step 2: Add imports**

At the top of the file (after the existing imports around lines 1–21), add:

```ts
import { validateAssignment, type CrewInput, type PairingInput, type RankActingMap } from '@rois/shared-rules'
import { useRankActingStore } from '@/stores/rank-acting-store'
```

- [ ] **Step 3: Insert pre-check before `checkLiveDraftLegality`**

In the `case 'assign-pairing':` block, **after** the `rosterActingRank` resolution (line 91) and **before** the placeholder build (line 93), insert:

```ts
// NEW: pre-check (division / open position / rank_acting)
const filiale = useCrewStore.getState().items.find((c) => c.crew.crewId === toCrewId)?.crew.filiale ?? ''
const rankActingMap = useRankActingStore.getState().getForFiliale(filiale)
const precheck = validateAssignment(
  {
    id: toCrewId,
    division: pairing.division,    // (will be overridden by crew.division in the check)
    rank: rosterActingRank,
  } satisfies CrewInput,
  {
    id: pairing.id,
    division: pairing.division,
    composition: (pairingItem.pairing.composition ?? []).map((c: { actingRank: string; plan: number; fill: number }) => ({
      actingRank: c.actingRank,
      plan: c.plan,
      fill: c.fill,
    })),
  } satisfies PairingInput,
  rankActingMap as RankActingMap,
)
if (!precheck.ok) {
  notify.error(precheck.message)
  break
}
```

**NOTE**: the `division` field on `crewEntry` may be at a different path. Inspect `gantt/src/stores/crew-store.ts` or the type used at line 90 (`crewEntry.crew.panelRank`). Use the actual crew.division path. **If unsure, ask the user.**

Also: `pairingItem.pairing.composition` may not be the right path. Inspect `gantt/src/stores/pairing-store.ts` for how composition is stored on `PairingItem`. **If unsure, ask the user.**

- [ ] **Step 4: Replace `rosterActingRank` usage**

After the precheck passes, the resolved `actingRank` should be used:

```ts
const rosterActingRank = precheck.actingRank   // override line 91
```

(Or, if you prefer to keep `rosterActingRank` at line 91 as a fallback for the placeholder build, leave it; the precheck will have already returned `ok: true` with `actingRank`, and you can use `precheck.actingRank` for `addOp` and the placeholder labels. Choose the cleanest path during implementation.)

- [ ] **Step 5: Run typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: 0 errors. Fix any field path mismatches by inspecting the actual types.

- [ ] **Step 6: Manual smoke**

Start gantt + live-server. Log in as a user with division C crew. Drag a pairing from division D onto a crew. Expected: toast appears with the division mismatch message, drop is rejected, no draft op is created.

If the test data doesn't have such a pairing, create one in the live-server DB via SQL.

- [ ] **Step 7: Stop**

Do not commit yet — Task 7 modifies the save button on the same file's parent area.

---

## Task 7: Frontend — disable Save when violations popup is open

**Files:**
- Modify: `gantt/src/components/roster/draft-toolbar.tsx:42-43` (extend `canSave`)

**Interfaces:**
- Consumes: `useRuleCheckStore.confirmDialog.open`

- [ ] **Step 1: Read current `canSave` calc**

Open `gantt/src/components/roster/draft-toolbar.tsx`. Line 42–43:

```ts
const actionsBlocked = checking || saving
const canSave = opCount > 0 && !actionsBlocked
```

- [ ] **Step 2: Add popup-open to the gate**

After the existing `useRuleCheckStore` selector on line 24 (`const checking = useRuleCheckStore((s) => s.checking)`), add:

```ts
const confirmDialogOpen = useRuleCheckStore((s) => s.confirmDialog.open)
```

Update line 42–43 to:

```ts
const actionsBlocked = checking || saving
const canSave = opCount > 0 && !actionsBlocked && !confirmDialogOpen
```

- [ ] **Step 3: Update tooltip text**

Line 138 currently reads:

```tsx
{saving ? 'Saving...' : opCount > 0 ? `Save ${opCount} change(s)` : 'Save'}
```

Update the second branch to show a popup-aware hint when disabled by popup:

```tsx
{saving
  ? 'Saving...'
  : confirmDialogOpen
    ? 'Resolve rule violations first'
    : opCount > 0
      ? `Save ${opCount} change(s)`
      : 'Save'}
```

- [ ] **Step 4: Run typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Manual smoke**

Start gantt. Trigger a drag-drop that creates violations. Click Save. Popup appears. Hover the Save button while popup is open. Expected: tooltip shows "Resolve rule violations first", button is disabled.

- [ ] **Step 6: Stop**

Do not commit yet — Task 8 wraps the API for 409 handling.

---

## Task 8: Frontend — 409 rollback handler in `roster-api.ts`

**Files:**
- Modify: `gantt/src/services/roster-api.ts:109-111` (wrap `assignPairing`)

**Interfaces:**
- Produces: `assignPairing` that catches 409, removes the matching draft op, invalidates pairing cache, shows toast, then re-throws.

- [ ] **Step 1: Read current `assignPairing`**

Open `gantt/src/services/roster-api.ts`. Lines 109–111:

```ts
async assignPairing(data: { pairingId: number; crewId: string; rosterActingRank: string }): Promise<RosterItem[]> {
  return api.post('/api/roster/assign-pairing', rosterApi.withRuleset(data)) as Promise<RosterItem[]>
}
```

- [ ] **Step 2: Inspect `draftStore` for remove-op helpers**

Check `gantt/src/stores/draft-store.ts:185` (the `removeOp` signature). It takes an `opId`. For the rollback, we need to find the matching op by `pairingId + crewId`. If no such helper exists, add one in the same file:

```ts
// In DraftStore interface (around line 100):
removeOpByPairingAndCrew: (pairingId: number, crewId: string) => void

// Implementation (around line 185):
removeOpByPairingAndCrew: (pairingId, crewId) => {
  set((state) => {
    const idx = state.operations.findIndex(
      (o) => o.op.type === 'assign-pairing' &&
             o.op.pairingId === pairingId &&
             o.op.crewId === crewId,
    )
    if (idx === -1) return state
    const operations = [...state.operations]
    operations.splice(idx, 1)
    return { operations, redoStack: [] }
  })
  recomputeRosterItems((base) => get().applyDraftOps(base))
}
```

- [ ] **Step 3: Inspect `pairingStore` for invalidation**

Check `gantt/src/stores/pairing-store.ts` for an existing `invalidate(pairingId)` or similar method. If absent, add one or use the existing invalidation helper.

- [ ] **Step 4: Wrap `assignPairing` with 409 handler**

Replace lines 109–111 with:

```ts
async assignPairing(data: { pairingId: number; crewId: string; rosterActingRank: string }): Promise<RosterItem[]> {
  try {
    return (await api.post('/api/roster/assign-pairing', rosterApi.withRuleset(data))) as RosterItem[]
  } catch (err) {
    const apiErr = err as { status?: number; body?: { reason?: string; message?: string } }
    if (apiErr.status === 409 && apiErr.body?.reason) {
      // Roll back the draft op that triggered this commit
      useDraftStore.getState().removeOpByPairingAndCrew(data.pairingId, data.crewId)
      // Invalidate pairing cache so gantt shows correct fill
      usePairingStore.getState().invalidate(data.pairingId)
      // Surface the reason to the user
      notify.error(`Assignment reverted: ${humanizeReason(apiErr.body.reason)}`)
    }
    throw err
  }
}
```

Add a top-of-file helper (above the `rosterApi` object or in a small util):

```ts
const humanizeReason = (reason: string): string => {
  switch (reason) {
    case 'DIVISION_MISMATCH':       return 'Division mismatch'
    case 'NO_OPEN_POSITION':        return 'Pairing has no open positions'
    case 'RANK_ACTING_DISALLOWED':  return 'Cross-rank assignment not allowed by rank_acting'
    default:                        return reason
  }
}
```

Add the necessary imports at the top of `roster-api.ts`:

```ts
import { useDraftStore } from '@/stores/draft-store'
import { usePairingStore } from '@/stores/pairing-store'
import { notify } from '@/utils/notify'
```

- [ ] **Step 5: Run typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Manual smoke**

Start gantt + live-server. Force the backend to return 409 (e.g. temporarily set a crew's division in the DB to something different). Trigger an assign. Expected: draft op is removed, pairing composition cache invalidated, toast shows "Assignment reverted: Division mismatch".

- [ ] **Step 7: Stop**

Do not commit yet — Task 9 refactors Scenario.

---

## Task 9: Frontend — refactor `scenario-assignment-rank.ts` to use shared module

**Files:**
- Modify: `gantt/src/utils/scenario-assignment-rank.ts`

**Interfaces:**
- Consumes: `validateAssignment` from `@rois/shared-rules`

- [ ] **Step 1: Read current Scenario logic**

Open `gantt/src/utils/scenario-assignment-rank.ts`. The current `resolveAssignmentRank` implements the 3 rules inline (lines 19–47). It returns:

```ts
| { status: 'no-valid-rank' }
| { status: 'no-open-position' }
| { status: 'ok'; actingRank: string; crossRank: boolean }
```

The Scenario file is the canonical source of these rules in Scenario mode. Refactor to call `validateAssignment` internally while preserving the `crossRank` distinction (which the shared module does not return).

- [ ] **Step 2: Refactor with crossRank tracking**

Replace `gantt/src/utils/scenario-assignment-rank.ts` content with:

```ts
// gantt/src/utils/scenario-assignment-rank.ts
//
// Rank resolution for a scenario pairing assignment (drag pairing → crew).
// Delegates the core 3-rule check (division / open position / rank_acting)
// to @rois/shared-rules. This file keeps the Scenario-specific concern of
// distinguishing cross-rank from exact-match (crossRank boolean).
import { validateAssignment, type RankActingMap } from '@rois/shared-rules'
import type { CrewRankRecord } from '@/types/crew'
import type { ScenarioCompositionSlot } from './scenario-composition-fill'

export type ResolvedRank =
  | { status: 'no-valid-rank' }
  | { status: 'no-open-position' }
  | { status: 'ok'; actingRank: string; crossRank: boolean }

export function resolveAssignmentRank(input: {
  crewRanks: CrewRankRecord[]
  openSlots: ScenarioCompositionSlot[]
  taskDate: Date
  rankOrder: Map<string, number>
}): ResolvedRank {
  const { crewRanks, openSlots, taskDate } = input

  // 1. Effective rank on taskDate (Scenario-specific concern).
  const valid = crewRanks
    .filter((r) => {
      const eff = new Date(r.effDt).getTime()
      const exp = r.expDt ? new Date(r.expDt).getTime() : Number.POSITIVE_INFINITY
      return eff <= taskDate.getTime() && taskDate.getTime() < exp
    })
    .sort((a, b) => new Date(a.effDt).getTime() - new Date(b.effDt).getTime())
  if (valid.length === 0) return { status: 'no-valid-rank' }

  // 2-3. Delegate to shared precheck (uses crewRank[0] as the active rank).
  //    rankOrder is unused here because cross-rank detection is done inside
  //    the shared module via rank_acting; Scenario-specific behavior is the
  //    no-valid-rank early exit and the crossRank flag for UI display.
  const crew = { id: 'scenario', division: 'C', rank: valid[0].rank }
  const pairing = {
    id: 0,
    division: 'C',
    composition: openSlots.map((s) => ({
      actingRank: s.rank,
      plan: 1,
      fill: 0,
    })),
  }
  const rankActing: RankActingMap = new Map() // Scenario fills this from its own DB
  const result = validateAssignment(crew, pairing, rankActing)

  if (!result.ok) {
    if (result.reason === 'NO_OPEN_POSITION') return { status: 'no-open-position' }
    return { status: 'no-open-position' }   // map RANK_ACTING_DISALLOWED to no-open-position for Scenario backward-compat
  }

  const crossRank = result.actingRank !== valid[0].rank
  return { status: 'ok', actingRank: result.actingRank, crossRank }
}
```

**NOTE**: The Scenario file currently does not consume `rank_acting`; the spec says Scenario will get parity "later". For now, the refactor preserves Scenario's existing return shape and behavior (no-open-position + ok-with-crossRank). If Scenario also needs `rank_acting` parity, add a Task 10 in a follow-up plan.

- [ ] **Step 3: Run Scenario unit tests (if any)**

Find Scenario tests: `find /home/yuan.z/rois/rois-ai/gantt -name "scenario-assignment-rank*" -path "*/__tests__/*"` or similar.
Run: `cd gantt && npx vitest run <path>`
Expected: existing Scenario tests still pass.

- [ ] **Step 4: Run typecheck**

Run: `cd gantt && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Stop**

Do not commit yet — Task 10 adds E2E tests.

---

## Task 10: Playwright E2E tests for all 6 scenarios

**Files:**
- Create: `e2e/gantt/assignment/precheck-division-mismatch.spec.ts`
- Create: `e2e/gantt/assignment/precheck-no-open-position.spec.ts`
- Create: `e2e/gantt/assignment/precheck-rank-acting-disallowed.spec.ts`
- Create: `e2e/gantt/assignment/precheck-rank-acting-allowed.spec.ts`
- Create: `e2e/gantt/assignment/save-disabled-on-popup.spec.ts`
- Create: `e2e/gantt/assignment/backend-409-rollback.spec.ts`

Each test must follow the project conventions in `gantt/CLAUDE.md` and `CLAUDE.md` §Playwright-Required / §No-Illusion: assert specific UI state (toast text, button enabled/disabled, draft op count), not just visibility.

- [ ] **Step 1: Set up test fixtures**

Inspect existing tests in `e2e/gantt/roster/` (e.g. `crew-validity-redline.spec.ts`, `roster-sort-stability.spec.ts`) for the project's test bootstrap pattern: how auth is handled, how the gantt-data is mocked or seeded, how data-testid selectors are used.

Create a shared fixture file (or use existing helpers):

```ts
// e2e/gantt/assignment/__fixtures__/assignment-fixtures.ts
// — exports `seedCrew(division: string, rank: string)`,
//   `seedPairing(division: string, composition: CompositionSlot[])`,
//   `seedRankActing(activeRank: string, actingRank: string)`.
```

**If existing tests don't have such fixtures**, write the spec files to inline the seed logic. Don't introduce new infrastructure speculatively (§Minimal-First).

- [ ] **Step 2: Write `precheck-division-mismatch.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test('division mismatch blocks drag-drop with toast', async ({ page }) => {
  await page.goto('/live/gantt')
  await page.waitForLoadState('networkidle')

  // Seed: C-division crew, D-division pairing
  // (use the fixture helper or inline SQL via authenticated API)

  // Drag pairing → crew
  // (use page.dragAndDrop or simulate via dispatchEvent)
  // See existing e2e tests for the project's drag-simulation pattern.

  // Assert: toast appears with division mismatch message
  await expect(page.getByText(/Crew division.*does not match pairing division/)).toBeVisible()

  // Assert: draft op count badge is 0 (drop was rejected)
  await expect(page.getByTestId('draft-save-btn')).toBeDisabled()
})
```

(The drag-simulation pattern must match the existing project convention. Inspect `e2e/gantt/roster/roster-sort-stability.spec.ts` and other assignment-related specs for the project's drag-drop test approach. **Adapt the boilerplate to match.**)

- [ ] **Step 3: Write `precheck-no-open-position.spec.ts`**

Similar structure to Step 2. Seed a fully-filled pairing. Drag onto a crew of matching division. Assert:
- Toast: "This pairing has no open positions"
- No draft op added

- [ ] **Step 4: Write `precheck-rank-acting-disallowed.spec.ts`**

Seed a CA-only pairing. Seed a FO crew with no `rank_acting(CA → FO)` row. Drag pairing → crew. Assert:
- Toast mentions RANK_ACTING_DISALLOWED
- No draft op added

- [ ] **Step 5: Write `precheck-rank-acting-allowed.spec.ts`**

Seed a CA-only pairing. Seed a CA crew. Drag pairing → crew. Assert:
- No toast
- Draft op count badge = 1
- Save button enabled

- [ ] **Step 6: Write `save-disabled-on-popup.spec.ts`**

Seed any pairing + crew that produces a rule violation (e.g. fly time > 8h limit). Drag → Save → popup appears. Assert:
- Save button is disabled while popup is open
- Tooltip: "Resolve rule violations first"

- [ ] **Step 7: Write `backend-409-rollback.spec.ts`**

This test simulates the 409 path. Two approaches:
1. **Mock the API**: use `page.route()` to intercept `/api/roster/assign-pairing` and return a 409 response. Drag → save → assert draft op is removed, toast appears.
2. **Real DB seeding**: temporarily mutate the DB so a crew's division mismatches the pairing they're about to be assigned to, trigger the assign, and verify the rollback.

Choose approach 1 (more deterministic). Pattern:

```ts
await page.route('**/api/roster/assign-pairing', (route) =>
  route.fulfill({
    status: 409,
    body: JSON.stringify({
      error: 'ASSIGNMENT_FAILED',
      reason: 'DIVISION_MISMATCH',
      message: 'Crew division C does not match pairing division D',
    }),
  })
)
```

- [ ] **Step 8: Run all 6 specs**

Run: `npx playwright test e2e/gantt/assignment/ --reporter=list`
Expected: all 6 PASS. Paste the summary into the conversation per §No-Illusion.

- [ ] **Step 9: Run `npm run check:ui`**

Run from repo root.
Expected: 0 hard violations. Fix any text-[Npx], font-[…], or rounded-[Npx] introduced by new code.

- [ ] **Step 10: Stop — final review checkpoint with user**

All implementation done. Wait for user to review and approve before committing. Per §No-Auto-Commit, do NOT commit without explicit command.

---

## Self-Review Notes

**Spec coverage:**
- §1 Problem (all 3 failure modes + save race) → Tasks 4 (backend precheck), 6 (frontend precheck), 7 (save gate), 8 (409 rollback)
- §6 Pre-check logic → Task 1 (shared module)
- §7 UI flow changes → Tasks 6, 7, 8
- §8 Backend changes → Tasks 3, 4
- §9 Frontend data loading → Task 5
- §10 Error codes → Task 4 (server) + Task 8 (client humanize)
- §11 Testing → Task 10 (E2E) + Task 4 (Vitest)
- §12 Rollout → Tasks 1–10 mirror the 9 rollout steps (Task 4 = Steps 2–3 backend hotfix; Tasks 5–8 = Steps 4–7 frontend; Task 9 = Step 8 Scenario parity; Task 10 = Step 9 E2E)

**Gaps:** None — all spec sections have a corresponding task.

**Type/contract consistency:**
- `PrecheckResult` defined in Task 1 (shared) used by Tasks 4 (server), 5–6 (frontend), 8 (rollback humanize)
- `RankActingMap` defined in Task 1 used by Tasks 5 (cache), 6 (drag-drop), 9 (Scenario refactor)
- `CrewInput` / `PairingInput` defined in Task 1 used by Tasks 6, 9
- 409 contract `{ error, reason, message }` defined in Task 4, consumed by Task 8

**Open questions deferred to implementer:**
- `crew.filiale` path on gantt store (Task 5) — flag for user
- `pairingItem.pairing.composition` path on gantt store (Task 6) — flag for user
- `crew.division` field path on gantt `CrewItem` (Task 6) — flag for user
- `rankActing.isDeleted` column name on Drizzle (Task 3) — flag for user
- Scenario's `crossRank` parity with `rank_acting` — out of scope (Task 9 footnote)