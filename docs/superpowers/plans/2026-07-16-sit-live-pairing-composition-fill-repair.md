# SIT Live Pairing Composition Fill Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair SIT live pairing composition fill values and prevent import workers from silently leaving stale Pairing pane coverage counts.

**Architecture:** Keep `pairing_composition.fill` as the persisted backend authority. Import workers recompute fill after roster/pairing writes and fail loudly if recompute fails. Admin/manual recompute invalidates pairing caches so Gantt reads repaired values.

**Tech Stack:** live-server Fastify + Drizzle SQL + Redis cache, Vitest unit tests, remote PostgreSQL `f8_sit_live` for the one-time repair.

## Global Constraints

- Use the canonical fill formula: `count(distinct roster_flight.crew_id)` by `pairing_id + roster_acting_rank`, non-deleted rows only.
- Do not change Gantt to compute coverage from roster rows.
- Do not change schema or SQL schema files.
- Keep changes scoped to live-server import/admin recompute behavior and focused tests.
- Run smallest relevant verification commands and record PASS / FAIL.

---

### Task 1: Import Worker Recompute Must Be Reliable

**Files:**
- Modify: `live-server/src/workers/roster-inbound-worker.ts`
- Modify: `live-server/src/workers/pairing-inbound-worker.ts`
- Modify: `live-server/src/__tests__/unit/roster-inbound-worker.test.ts`
- Modify: `live-server/src/__tests__/unit/pairing-inbound-worker.test.ts`

**Interfaces:**
- Consumes: `refreshPairingCompositionFillBulk(db, pairingIds, username): Promise<void>`
- Consumes: `invalidatePattern(redis, pattern): Promise<void>` when a Fastify `redis` client is available in worker entry points.
- Produces: import jobs fail if fill recompute fails; successful import recompute clears pairing list cache.

- [ ] **Step 1: Write failing tests for roster import recompute**

Add assertions in `live-server/src/__tests__/unit/roster-inbound-worker.test.ts`:

```ts
vi.mock('../../utils/composition-fill.js', () => ({
  refreshPairingCompositionFillBulk: workerMocks.refreshPairingCompositionFillBulk,
}))

// in hoisted mocks:
refreshPairingCompositionFillBulk: vi.fn(),

it('refreshes pairing composition fill for touched roster-import pairings', async () => {
  workerMocks.refreshPairingCompositionFillBulk.mockResolvedValue(undefined)
  // Use the existing successful job setup with pairing id 101.
  const result = await processRosterImportJob(job, mockDb as never)
  expect(result.imported).toBe(2)
  expect(workerMocks.refreshPairingCompositionFillBulk)
    .toHaveBeenCalledWith(mockDb, [101], 'F8_IMPORT')
})

it('fails roster import when pairing composition fill refresh fails', async () => {
  workerMocks.refreshPairingCompositionFillBulk.mockRejectedValue(new Error('fill refresh failed'))
  // Use the existing successful job setup with pairing id 101.
  await expect(processRosterImportJob(job, mockDb as never))
    .rejects.toThrow('fill refresh failed')
})
```

- [ ] **Step 2: Write failing tests for pairing import recompute**

Add a mock for `refreshPairingCompositionFillBulk` in `live-server/src/__tests__/unit/pairing-inbound-worker.test.ts` and assert:

```ts
it('refreshes pairing composition fill for imported pairings', async () => {
  workerMocks.refreshPairingCompositionFillBulk.mockResolvedValue(undefined)
  const result = await processPairingImportJob(job, mockDb as never)
  expect(result.imported).toBe(1)
  expect(workerMocks.refreshPairingCompositionFillBulk)
    .toHaveBeenCalledWith(mockDb, [101], 'F8_IMPORT')
})

it('fails pairing import when pairing composition fill refresh fails', async () => {
  workerMocks.refreshPairingCompositionFillBulk.mockRejectedValue(new Error('fill refresh failed'))
  await expect(processPairingImportJob(job, mockDb as never))
    .rejects.toThrow('fill refresh failed')
})
```

- [ ] **Step 3: Run tests and confirm they fail**

Run:

```bash
npm --prefix live-server test -- --run src/__tests__/unit/roster-inbound-worker.test.ts src/__tests__/unit/pairing-inbound-worker.test.ts
```

Expected: FAIL because current workers catch and suppress recompute errors.

- [ ] **Step 4: Implement worker fix**

In both workers, replace:

```ts
await refreshPairingCompositionFillBulk(db, ids, 'F8_IMPORT')
  .catch(err => console.error('refreshPairingCompositionFillBulk failed after roster import', err))
```

with:

```ts
await refreshPairingCompositionFillBulk(db, ids, 'F8_IMPORT')
```

Use the pairing equivalent in `pairing-inbound-worker.ts`. Do not suppress the error.

- [ ] **Step 5: Run tests and confirm pass**

Run the same Vitest command.

Expected: PASS.

---

### Task 2: Admin Refresh Invalidates Pairing Cache

**Files:**
- Modify: `live-server/src/routes/admin/pairing-composition-refresh.ts`
- Create: `live-server/src/routes/admin/pairing-composition-refresh.test.ts`

**Interfaces:**
- Consumes: `invalidatePattern(fastify.redis, 'pairing:list:*')`
- Produces: admin recompute route updates fill and clears list cache after success.

- [ ] **Step 1: Write failing route test**

Create `live-server/src/routes/admin/pairing-composition-refresh.test.ts` with a Fastify app that registers the route, injects `authUser`, mocks `fastify.db.execute`, and mocks `fastify.redis.scan/del`.

Assert:

```ts
const res = await app.inject({ method: 'POST', url: '/pairing-composition-refresh?startDt=2026-06-01&endDt=2026-06-30' })
expect(res.statusCode).toBe(200)
expect(redis.scan).toHaveBeenCalledWith(0, { MATCH: 'pairing:list:*', COUNT: 200 })
expect(redis.del).toHaveBeenCalledWith(['pairing:list:abc'])
```

- [ ] **Step 2: Run route test and confirm it fails**

Run:

```bash
npm --prefix live-server test -- --run src/routes/admin/pairing-composition-refresh.test.ts
```

Expected: FAIL because the route does not invalidate pairing list cache.

- [ ] **Step 3: Implement route invalidation**

Import `invalidatePattern`:

```ts
import { invalidatePattern } from '../../utils/cache.js'
```

After successful `db.execute`, add:

```ts
await invalidatePattern(fastify.redis, 'pairing:list:*')
```

- [ ] **Step 4: Run route test and confirm pass**

Run the same Vitest command.

Expected: PASS.

---

### Task 3: SIT Live Data Repair and Verification

**Files:**
- No source file changes.
- Use the approved SIT live PostgreSQL connection supplied by the user.

**Interfaces:**
- Consumes: PostgreSQL SQL transaction against schema `f8_sit_live`.
- Produces: repaired `pairing_composition.fill` values in SIT live.

- [ ] **Step 1: Capture before state**

Run a read-only SQL query for `pairing_id=11714` and the global mismatch count.

Expected before state includes `CA fill=0`, `FO fill=0`, and a non-zero mismatch count.

- [ ] **Step 2: Run one-time repair transaction**

Run:

```sql
begin;
update pairing_composition pc
set fill = (
      select count(distinct rf.crew_id)::int
      from roster_flight rf
      where rf.pairing_id = pc.pairing_id
        and rf.roster_acting_rank = pc.acting_rank
        and rf.is_deleted = 0
    ),
    updated_at = now(),
    updated_by = 'codex:sit-fill-repair'
where pc.is_deleted = 0;
commit;
```

- [ ] **Step 3: Verify after state**

Run the same read-only SQL query.

Expected:

- `pairing_id=11714` reports `CA fill=1`, `FO fill=1`
- global mismatch count is `0`

- [ ] **Step 4: Pairing API/Gantt path check**

If deployed cache invalidation cannot be triggered directly, note the remaining 10-minute cache TTL risk. Otherwise run the admin recompute route or clear pairing list keys and verify the pairing API reports `CA(1:1) FO(1:1)`.

---

### Task 4: Final Verification

**Files:**
- No additional source files.

**Interfaces:**
- Consumes: changed live-server code and repaired SIT DB.
- Produces: final PASS/FAIL report.

- [ ] **Step 1: Run focused live-server tests**

Run:

```bash
npm --prefix live-server test -- --run src/__tests__/unit/roster-inbound-worker.test.ts src/__tests__/unit/pairing-inbound-worker.test.ts src/routes/admin/pairing-composition-refresh.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
npm --prefix live-server exec tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 3: Report exact evidence**

Final response must include:

- SQL before/after summary for 11714
- mismatch count after repair
- test commands and PASS/FAIL results
- any cache visibility limitation if Redis/API cache clear was not available
