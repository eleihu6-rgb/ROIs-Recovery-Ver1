# Composition Fill/Open & Roster Acting Rank — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `fill`/`open` to `pairing_composition`/`flight_composition`, split `roster_flight.acting_rank` into `flight_acting_rank` + `roster_acting_rank`, and keep fills up-to-date on every roster change.

**Architecture:** A migration renames columns and adds `fill integer` + `open GENERATED ALWAYS AS (plan - fill) STORED` to both composition tables. A thin utility function refreshes fill values after DB mutations. `assignPairing` accepts a new `rosterActingRank` parameter, which is stored on all segment rows and used to count fill. Frontend renames `actingRank` → `flightActingRank` on `RosterItem`/`CreateRosterInput`/`FlightRosterItem`.

**Tech Stack:** PostgreSQL 16 generated columns, Drizzle ORM (drizzle-orm/node-postgres), Fastify, React 19 + TypeScript, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-08-composition-fill-open-design.md`

---

## File Map

| Action | Path |
|--------|------|
| Create | `sql/migration/2026-06-08-composition-fill-open-roster-acting-rank.sql` |
| Modify | `live-server/src/models/pairing/pairing-composition.ts` |
| Modify | `live-server/src/models/flight/flight-composition.ts` |
| Modify | `live-server/src/models/roster/roster-flight.ts` |
| Create | `live-server/src/utils/composition-fill.ts` |
| Modify | `live-server/src/services/pairing/pairing-service.ts` |
| Modify | `live-server/src/services/roster/roster-service.ts` |
| Modify | `live-server/src/routes/draft/draft.ts` |
| Modify | `live-server/src/routes/roster/roster.ts` |
| Modify | `live-server/src/workers/roster-inbound-worker.ts` |
| Modify | `live-server/src/workers/roster-ground-inbound-worker.ts` |
| Modify | `live-server/src/services/rule-check/rule-check-data-service.ts` |
| Modify | `live-server/src/services/scenario/scenario-gantt-service.ts` |
| Modify | `live-server/src/routes/scenario/scenario.ts` |
| Modify | `gantt/src/types/roster.ts` |
| Modify | `gantt/src/types/flight.ts` |
| Modify | `gantt/src/stores/roster-store.ts` |
| Modify | `gantt/src/utils/roster-to-check-input.ts` |
| Modify | `gantt/src/components/roster/task-detail-dialog.tsx` |
| Modify | `gantt/src/components/roster/add-task-dialog.tsx` |
| Modify | `gantt/src/components/flight/flight-detail-dialog.tsx` |
| Modify | `gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx` |
| Modify | `gantt/src/components/layout/pane-container.tsx` |
| Modify | `gantt/src/components/layout/app-layout.tsx` |
| Modify | `gantt/src/components/panes/roster-pane.tsx` |
| Create | `e2e/tests/gantt/pairing-composition-fill.spec.ts` |

---

## Task 1: SQL Migration

**Files:**
- Create: `sql/migration/2026-06-08-composition-fill-open-roster-acting-rank.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Migration: 2026-06-08-composition-fill-open-roster-acting-rank.sql
-- pairing_composition: plan_value → plan, add fill, open (generated)
ALTER TABLE pairing_composition RENAME COLUMN plan_value TO plan;
ALTER TABLE pairing_composition ADD COLUMN fill integer NOT NULL DEFAULT 0;
ALTER TABLE pairing_composition ADD COLUMN open integer GENERATED ALWAYS AS (plan - fill) STORED;

-- flight_composition: plan_value → plan, add fill, open (generated)
ALTER TABLE flight_composition RENAME COLUMN plan_value TO plan;
ALTER TABLE flight_composition ADD COLUMN fill integer NOT NULL DEFAULT 0;
ALTER TABLE flight_composition ADD COLUMN open integer GENERATED ALWAYS AS (plan - fill) STORED;

-- roster_flight: acting_rank → flight_acting_rank, add roster_acting_rank
ALTER TABLE roster_flight RENAME COLUMN acting_rank TO flight_acting_rank;
ALTER TABLE roster_flight ADD COLUMN roster_acting_rank varchar(10);

-- Update index that references acting_rank in pairing_composition (it stays acting_rank — no rename needed there)
-- Update comments
COMMENT ON COLUMN pairing_composition.plan             IS '该职级在此环中需要的人数，RO 引擎分配时使用';
COMMENT ON COLUMN pairing_composition.fill             IS '已分配机组人数（来自 roster_flight DISTINCT crew_id 计数）';
COMMENT ON COLUMN pairing_composition.open             IS '剩余未分配人数（plan - fill），PostgreSQL 自动计算';
COMMENT ON COLUMN flight_composition.plan              IS '计划需要人数，法规引擎和 PO 优化引擎参考此值';
COMMENT ON COLUMN flight_composition.fill              IS '已被环引用的人数（来自 pairing_composition.plan 汇总）';
COMMENT ON COLUMN flight_composition.open              IS '剩余未分配人数（plan - fill），PostgreSQL 自动计算';
COMMENT ON COLUMN roster_flight.flight_acting_rank     IS '在该航班上实际担任的职级（可能与环槽位不同）';
COMMENT ON COLUMN roster_flight.roster_acting_rank     IS '对应 pairing_composition 的职级槽位，同一环内所有航段一致';
```

- [ ] **Step 2: Apply the migration**

```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" \
  -f sql/migration/2026-06-08-composition-fill-open-roster-acting-rank.sql
```

Expected: no errors, 8 `ALTER TABLE` + 8 `COMMENT ON COLUMN` messages.

- [ ] **Step 3: Verify schema**

```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" -c "
  SELECT column_name, data_type, column_default, is_nullable, generation_expression
  FROM information_schema.columns
  WHERE table_name IN ('pairing_composition','flight_composition','roster_flight')
    AND column_name IN ('plan','fill','open','flight_acting_rank','roster_acting_rank')
  ORDER BY table_name, column_name;"
```

Expected: 9 rows — `pairing_composition` (fill, open, plan), `flight_composition` (fill, open, plan), `roster_flight` (flight_acting_rank, roster_acting_rank). `open` rows should show a generation expression.

- [ ] **Step 4: Commit**

```bash
git add sql/migration/2026-06-08-composition-fill-open-roster-acting-rank.sql
git commit -m "chore: add fill/open to composition tables, split roster acting_rank"
```

---

## Task 2: Update Drizzle ORM Models

**Files:**
- Modify: `live-server/src/models/pairing/pairing-composition.ts`
- Modify: `live-server/src/models/flight/flight-composition.ts`
- Modify: `live-server/src/models/roster/roster-flight.ts`

- [ ] **Step 1: Update `pairing-composition.ts`**

Replace the entire file content:

```typescript
import { pgTable, bigint, varchar, integer, smallint, timestamp, index } from 'drizzle-orm/pg-core'
import { pairing } from './pairing.js'

export const pairingComposition = pgTable('pairing_composition', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  pairingId: bigint('pairing_id', { mode: 'number' }).notNull().references(() => pairing.id, { onDelete: 'restrict' }),
  division: varchar('division', { length: 2 }).notNull(),
  isDeleted: smallint('is_deleted').notNull().default(0),
  actingRank: varchar('acting_rank', { length: 30 }),
  plan: integer('plan'),
  fill: integer('fill').notNull().default(0),
  // open is GENERATED ALWAYS AS (plan - fill) STORED — never write to it
  open: integer('open'),
}, (table) => [
  index('idx_pair_comp_pair_id').on(table.pairingId),
  index('idx_pair_comp_cover').on(table.pairingId, table.actingRank, table.isDeleted),
])
```

- [ ] **Step 2: Update `flight-composition.ts`**

Replace the entire file content:

```typescript
import { pgTable, bigint, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { flight } from './flight.js'

export const flightComposition = pgTable('flight_composition', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  fltId: bigint('flt_id', { mode: 'number' }).notNull().references(() => flight.id, { onDelete: 'restrict' }),
  division: varchar('division', { length: 2 }).notNull(),
  actingRank: varchar('acting_rank', { length: 20 }),
  plan: integer('plan'),
  fill: integer('fill').notNull().default(0),
  // open is GENERATED ALWAYS AS (plan - fill) STORED — never write to it
  open: integer('open'),
}, (table) => [
  index('idx_flight_comp_flt').on(table.fltId, table.actingRank),
])
```

- [ ] **Step 3: Update `roster-flight.ts`** — rename `actingRank` → `flightActingRank`, add `rosterActingRank`

Find these two lines (around lines 54-55):
```typescript
  actingRank: varchar('acting_rank', { length: 10 }).notNull(),
  activeRank: varchar('active_rank', { length: 20 }),
```

Replace with:
```typescript
  flightActingRank: varchar('flight_acting_rank', { length: 10 }).notNull(),
  rosterActingRank: varchar('roster_acting_rank', { length: 10 }),
  activeRank: varchar('active_rank', { length: 20 }),
```

- [ ] **Step 4: Verify TypeScript compiles in live-server**

```bash
cd /home/yuan.z/rois/rois-ai/live-server && npx tsc --noEmit 2>&1 | head -40
```

Expected: errors only for downstream files that still reference `actingRank` on `rosterFlight` — those get fixed in later tasks. The models themselves should be error-free.

- [ ] **Step 5: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add live-server/src/models/pairing/pairing-composition.ts \
        live-server/src/models/flight/flight-composition.ts \
        live-server/src/models/roster/roster-flight.ts
git commit -m "feat: update Drizzle models for fill/open and split acting_rank"
```

---

## Task 3: Create Fill Recalculation Utility

**Files:**
- Create: `live-server/src/utils/composition-fill.ts`

This file provides two raw-SQL helpers that can run inside or outside a Drizzle transaction.

- [ ] **Step 1: Write the utility**

```typescript
import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

// Accepts both the top-level db instance and a transaction object.
type AnyDb = Pick<NodePgDatabase, 'execute'>

/**
 * Recompute pairing_composition.fill for a specific (pairing_id, acting_rank) pair.
 * fill = COUNT(DISTINCT crew_id) from roster_flight WHERE pairing_id = X
 *        AND roster_acting_rank = rank AND is_deleted = 0
 */
export async function refreshPairingCompositionFill(
  db: AnyDb,
  pairingId: number,
  actingRank: string,
  username: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE pairing_composition
    SET fill       = (
          SELECT COUNT(DISTINCT crew_id)
          FROM   roster_flight
          WHERE  pairing_id          = ${pairingId}
            AND  roster_acting_rank  = ${actingRank}
            AND  is_deleted          = 0
        ),
        updated_at = now(),
        updated_by = ${username}
    WHERE pairing_id  = ${pairingId}
      AND acting_rank = ${actingRank}
      AND is_deleted  = 0
  `)
}

/**
 * Recompute flight_composition.fill for all rows matching the given flt_ids.
 * fill = SUM(pc.plan) from pairing_composition pc JOIN pairing_segment ps
 *        WHERE ps.flt_id = fc.flt_id AND pc.acting_rank = fc.acting_rank AND pc.is_deleted = 0
 */
export async function refreshFlightCompositionFill(
  db: AnyDb,
  fltIds: number[],
  username: string,
): Promise<void> {
  if (fltIds.length === 0) return
  await db.execute(sql`
    UPDATE flight_composition fc
    SET fill       = (
          SELECT COALESCE(SUM(pc.plan), 0)
          FROM   pairing_composition pc
          JOIN   pairing_segment     ps ON ps.pairing_id = pc.pairing_id
          WHERE  ps.flt_id       = fc.flt_id
            AND  pc.acting_rank  = fc.acting_rank
            AND  pc.is_deleted   = 0
        ),
        updated_at = now(),
        updated_by = ${username}
    WHERE fc.flt_id = ANY(${fltIds})
  `)
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/yuan.z/rois/rois-ai/live-server && npx tsc --noEmit 2>&1 | grep "composition-fill" | head -10
```

Expected: no errors for the new file.

- [ ] **Step 3: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add live-server/src/utils/composition-fill.ts
git commit -m "feat: add composition fill recalculation utilities"
```

---

## Task 4: Update pairing-service — Remove Hardcoded fill:0, Add flight_composition Refresh

**Files:**
- Modify: `live-server/src/services/pairing/pairing-service.ts`

- [ ] **Step 1: Add imports at the top of pairing-service.ts**

After the existing imports, add:

```typescript
import { flightComposition } from '../../models/flight/flight-composition.js'
import { rank as rankTable } from '../../models/base/rank.js'
import { refreshFlightCompositionFill } from '../../utils/composition-fill.js'
```

- [ ] **Step 2: Remove hardcoded `fill: 0` in the list query**

Find this block (around line 188-193):

```typescript
        const composition = comps.map((c) => ({
          rank: c.actingRank ?? '',
          plan: c.planValue ?? 0,
          fill: 0,
        }))
```

Replace with (reads `fill` from the DB record, uses renamed `plan`):

```typescript
        const composition = comps.map((c) => ({
          rank: c.actingRank ?? '',
          plan: c.plan ?? 0,
          fill: c.fill ?? 0,
        }))
```

- [ ] **Step 3: Add cap validation helper inside pairing-service (above the exported object)**

After the `CACHE_TTL` constant and before the `export const pairingService = {` line, add:

```typescript
/**
 * For ranks with is_must_crew_rank=1, verify adding `delta` plan slots to the pairing
 * would not push any flight's composition fill over its plan.
 * Throws an error with statusCode=409 on violation.
 */
async function checkCompositionCap(
  db: FastifyInstance['db'],
  pairingId: number,
  actingRankCode: string,
  delta: number,
): Promise<void> {
  // Look up whether this rank requires cap enforcement
  const [rankRow] = await db
    .select({ isMustCrewRank: rankTable.isMustCrewRank })
    .from(rankTable)
    .where(eq(rankTable.rank, actingRankCode))
    .limit(1)

  if (!rankRow || rankRow.isMustCrewRank !== 1) return // uncapped

  // Get flt_ids from pairing_segment for this pairing
  const segments = await db
    .select({ fltId: pairingSegment.fltId })
    .from(pairingSegment)
    .where(and(eq(pairingSegment.pairingId, pairingId), notDeleted(pairingSegment.isDeleted)))

  const fltIds = [...new Set(segments.map((s) => s.fltId).filter((id): id is number => id !== null))]
  if (fltIds.length === 0) return

  // Check each flight's composition cap
  const flightComps = await db
    .select({ fltId: flightComposition.fltId, plan: flightComposition.plan, fill: flightComposition.fill })
    .from(flightComposition)
    .where(and(
      sql`${flightComposition.fltId} = ANY(${fltIds})`,
      eq(flightComposition.actingRank, actingRankCode),
    ))

  for (const fc of flightComps) {
    const projected = (fc.fill ?? 0) + delta
    if (projected > (fc.plan ?? 0)) {
      const err = Object.assign(
        new Error(`Rank ${actingRankCode} on flight #${fc.fltId}: fill ${projected} would exceed plan ${fc.plan}`),
        { statusCode: 409 },
      )
      throw err
    }
  }
}
```

- [ ] **Step 4: Update `createComposition` — add cap check + flight fill refresh**

Current `createComposition` (around line 293):
```typescript
  async createComposition(fastify: FastifyInstance, data: typeof pairingComposition.$inferInsert, username: string) {
    const [row] = await fastify.db
      .insert(pairingComposition)
      .values({ ...data, ...auditCreate(username) })
      .returning()
    await invalidate(fastify.redis, `${CACHE_PREFIX}:comp:${data.pairingId}`, `${CACHE_PREFIX}:${data.pairingId}`)
    return row
  },
```

Replace with:
```typescript
  async createComposition(fastify: FastifyInstance, data: typeof pairingComposition.$inferInsert, username: string) {
    const delta = data.plan ?? 0
    if (delta > 0 && data.actingRank) {
      await checkCompositionCap(fastify.db, data.pairingId, data.actingRank, delta)
    }
    const [row] = await fastify.db
      .insert(pairingComposition)
      .values({ ...data, ...auditCreate(username) })
      .returning()
    await invalidate(fastify.redis, `${CACHE_PREFIX}:comp:${data.pairingId}`, `${CACHE_PREFIX}:${data.pairingId}`)
    // Refresh flight_composition.fill for all flights in this pairing
    const segs = await fastify.db
      .select({ fltId: pairingSegment.fltId })
      .from(pairingSegment)
      .where(and(eq(pairingSegment.pairingId, data.pairingId), notDeleted(pairingSegment.isDeleted)))
    const fltIds = [...new Set(segs.map((s) => s.fltId).filter((id): id is number => id !== null))]
    await refreshFlightCompositionFill(fastify.db, fltIds, username)
    return row
  },
```

- [ ] **Step 5: Update `updateComposition` — add cap check + flight fill refresh**

Current `updateComposition` (around line 302):
```typescript
  async updateComposition(fastify: FastifyInstance, id: number, data: Partial<typeof pairingComposition.$inferInsert>, username: string) {
    const [row] = await fastify.db
      .update(pairingComposition)
      .set({ ...data, ...auditUpdate(username) })
      .where(eq(pairingComposition.id, id))
      .returning()
    if (row) {
      await invalidate(fastify.redis, `${CACHE_PREFIX}:comp:${row.pairingId}`, `${CACHE_PREFIX}:${row.pairingId}`)
    }
    return row
  },
```

Replace with:
```typescript
  async updateComposition(fastify: FastifyInstance, id: number, data: Partial<typeof pairingComposition.$inferInsert>, username: string) {
    // Cap check: only needed if plan is changing
    if (data.plan !== undefined) {
      const [existing] = await fastify.db
        .select({ pairingId: pairingComposition.pairingId, actingRank: pairingComposition.actingRank, plan: pairingComposition.plan })
        .from(pairingComposition)
        .where(eq(pairingComposition.id, id))
        .limit(1)
      if (existing?.actingRank) {
        const delta = (data.plan ?? 0) - (existing.plan ?? 0)
        if (delta > 0) {
          await checkCompositionCap(fastify.db, existing.pairingId, existing.actingRank, delta)
        }
      }
    }
    const [row] = await fastify.db
      .update(pairingComposition)
      .set({ ...data, ...auditUpdate(username) })
      .where(eq(pairingComposition.id, id))
      .returning()
    if (row) {
      await invalidate(fastify.redis, `${CACHE_PREFIX}:comp:${row.pairingId}`, `${CACHE_PREFIX}:${row.pairingId}`)
      const segs = await fastify.db
        .select({ fltId: pairingSegment.fltId })
        .from(pairingSegment)
        .where(and(eq(pairingSegment.pairingId, row.pairingId), notDeleted(pairingSegment.isDeleted)))
      const fltIds = [...new Set(segs.map((s) => s.fltId).filter((id): id is number => id !== null))]
      await refreshFlightCompositionFill(fastify.db, fltIds, username)
    }
    return row
  },
```

- [ ] **Step 6: Update `removeComposition` — add flight fill refresh**

Current `removeComposition` (around line 314):
```typescript
  async removeComposition(fastify: FastifyInstance, id: number, username: string) {
    const [row] = await fastify.db
      .update(pairingComposition)
      .set({ isDeleted: 1, ...auditUpdate(username) })
      .where(eq(pairingComposition.id, id))
      .returning()
    if (row) {
      await invalidate(fastify.redis, `${CACHE_PREFIX}:comp:${row.pairingId}`, `${CACHE_PREFIX}:${row.pairingId}`)
    }
    return row
  },
```

Replace with:
```typescript
  async removeComposition(fastify: FastifyInstance, id: number, username: string) {
    const [row] = await fastify.db
      .update(pairingComposition)
      .set({ isDeleted: 1, ...auditUpdate(username) })
      .where(eq(pairingComposition.id, id))
      .returning()
    if (row) {
      await invalidate(fastify.redis, `${CACHE_PREFIX}:comp:${row.pairingId}`, `${CACHE_PREFIX}:${row.pairingId}`)
      const segs = await fastify.db
        .select({ fltId: pairingSegment.fltId })
        .from(pairingSegment)
        .where(and(eq(pairingSegment.pairingId, row.pairingId), notDeleted(pairingSegment.isDeleted)))
      const fltIds = [...new Set(segs.map((s) => s.fltId).filter((id): id is number => id !== null))]
      await refreshFlightCompositionFill(fastify.db, fltIds, username)
    }
    return row
  },
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd /home/yuan.z/rois/rois-ai/live-server && npx tsc --noEmit 2>&1 | grep "pairing-service" | head -20
```

Expected: no errors in pairing-service.ts.

- [ ] **Step 8: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add live-server/src/services/pairing/pairing-service.ts
git commit -m "feat(pairing): refresh flight_composition.fill on composition change, add cap validation"
```

---

## Task 5: Update roster-service — assignPairing with rosterActingRank + fill Refresh

**Files:**
- Modify: `live-server/src/services/roster/roster-service.ts`

- [ ] **Step 1: Add imports to roster-service.ts**

After existing imports, add:
```typescript
import { pairingComposition } from '../../models/pairing/pairing-composition.js'
import { refreshPairingCompositionFill } from '../../utils/composition-fill.js'
```

- [ ] **Step 2: Update `assignPairing` signature and all `actingRank` → `flightActingRank` references**

Find the function signature (around line 326):
```typescript
  async assignPairing(fastify: FastifyInstance, pairingId: number, crewId: string, username: string) {
```

Replace with:
```typescript
  async assignPairing(fastify: FastifyInstance, pairingId: number, crewId: string, rosterActingRank: string, username: string) {
```

- [ ] **Step 3: Update roster_flight insert inside `assignPairing`**

Find (around line 371-396):
```typescript
        const [newTask] = await tx
          .insert(rosterFlight)
          .values({
            crewId,
            pairingId,
            base: pair.base,
            label,
            assignmentGroup: pair.assignmentGroup ?? 'FLT',
            assignment: seg.segAssignment ?? pair.assignment,
            role: 'CREW',
            division: pair.division,
            actingRank: '',  // filled by caller or crew lookup
            fltId: seg.fltId,
```

Replace `actingRank: '',  // filled by caller or crew lookup` with:
```typescript
            flightActingRank: rosterActingRank,
            rosterActingRank,
```

- [ ] **Step 4: Add fill refresh after the transaction in `assignPairing`**

Find the `return result` just before the closing of the `assignPairing` function (after `await invalidateCrewChunks`):

```typescript
    await invalidateCrewChunks(fastify, [crewId])

    return result
  },
```

Replace with:
```typescript
    await invalidateCrewChunks(fastify, [crewId])

    // Refresh pairing_composition.fill for the assigned rank
    await refreshPairingCompositionFill(fastify.db, pairingId, rosterActingRank, username)

    return result
  },
```

- [ ] **Step 5: Fix `actingRank` references in the roster list select (line ~80)**

In the roster list query select object, find:
```typescript
            actingRank: rosterFlight.actingRank,
```
Replace with:
```typescript
            flightActingRank: rosterFlight.flightActingRank,
```

Also find the mapping line ~158:
```typescript
          actingRank: roster.actingRank,
```
Replace with:
```typescript
          flightActingRank: roster.flightActingRank,
```

- [ ] **Step 6: Fix `actingRank` in `assignFlight` (line ~464)**

Find:
```typescript
          actingRank: '',
```
Replace with:
```typescript
          flightActingRank: '',
```

- [ ] **Step 7: Fix `actingRank` in `createGroundTask` (line ~562)**

Find the INSERT values object in `createGroundTask`:
```typescript
            actingRank: '',
```
Replace with:
```typescript
            flightActingRank: '',
```

- [ ] **Step 8: Verify no remaining `actingRank` references in roster-service.ts**

```bash
grep -n "actingRank\|acting_rank" /home/yuan.z/rois/rois-ai/live-server/src/services/roster/roster-service.ts
```

Expected: zero results.

- [ ] **Step 9: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add live-server/src/services/roster/roster-service.ts
git commit -m "feat(roster): add rosterActingRank to assignPairing, refresh pairing_composition.fill"
```

---

## Task 6: Update roster-service — removeByPairingAndCrew + remove fill Refresh

**Files:**
- Modify: `live-server/src/services/roster/roster-service.ts`

- [ ] **Step 1: Update `removeByPairingAndCrew` to fetch affected ranks before deletion**

Find the `removeByPairingAndCrew` function body (around line 582). Replace the entire function:

```typescript
  async removeByPairingAndCrew(fastify: FastifyInstance, pairingId: number, crewId: string, username: string) {
    // Capture the roster_acting_rank values before soft-deleting
    const tasks = await fastify.db
      .select({ id: rosterFlight.id, rosterActingRank: rosterFlight.rosterActingRank })
      .from(rosterFlight)
      .where(and(
        eq(rosterFlight.pairingId, pairingId),
        eq(rosterFlight.crewId, crewId),
        notDeleted(rosterFlight.isDeleted),
      ))

    if (tasks.length === 0) return []

    const audit = auditUpdate(username)
    const deleted = await fastify.db
      .update(rosterFlight)
      .set({ isDeleted: 1, ...audit })
      .where(and(
        eq(rosterFlight.pairingId, pairingId),
        eq(rosterFlight.crewId, crewId),
        notDeleted(rosterFlight.isDeleted),
      ))
      .returning()

    await invalidateCrewChunks(fastify, [crewId])

    // Refresh fill for each affected rank
    const affectedRanks = [...new Set(tasks.map((t) => t.rosterActingRank).filter((r): r is string => r !== null))]
    await Promise.all(
      affectedRanks.map((rank) => refreshPairingCompositionFill(fastify.db, pairingId, rank, username))
    )

    return deleted
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/yuan.z/rois/rois-ai/live-server && npx tsc --noEmit 2>&1 | grep "roster-service" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add live-server/src/services/roster/roster-service.ts
git commit -m "feat(roster): refresh pairing_composition.fill on crew removal from pairing"
```

---

## Task 7: Update API Routes

**Files:**
- Modify: `live-server/src/routes/draft/draft.ts`
- Modify: `live-server/src/routes/roster/roster.ts`

- [ ] **Step 1: Update `assignPairingSchema` in draft.ts**

Find (around line 63):
```typescript
const assignPairingSchema = z.object({
  type: z.literal('assign-pairing'),
  pairingId: z.number(),
  crewId: z.string(),
})
```

Replace with:
```typescript
const assignPairingSchema = z.object({
  type: z.literal('assign-pairing'),
  pairingId: z.number(),
  crewId: z.string(),
  rosterActingRank: z.string().min(1),
})
```

- [ ] **Step 2: Pass `rosterActingRank` in the `case 'assign-pairing'` handler in draft.ts**

Find (around line 159):
```typescript
            case 'assign-pairing':
              await rosterService.assignPairing(fastify, op.pairingId, op.crewId, username)
              break
```

Replace with:
```typescript
            case 'assign-pairing':
              await rosterService.assignPairing(fastify, op.pairingId, op.crewId, op.rosterActingRank, username)
              break
```

- [ ] **Step 3: Update `POST /api/roster/assign-pairing` in roster.ts**

Find the schema (around line 181):
```typescript
    const schema = z.object({
      pairingId: z.number().int().positive(),
      crewId: z.string().min(1),
      username: z.string().default('system'),
    })
```

Replace with:
```typescript
    const schema = z.object({
      pairingId: z.number().int().positive(),
      crewId: z.string().min(1),
      rosterActingRank: z.string().min(1),
      username: z.string().default('system'),
    })
```

Find the `rosterService.assignPairing` call (around line 193):
```typescript
      const result = await rosterService.assignPairing(
        fastify,
        parsed.data.pairingId,
        parsed.data.crewId,
        parsed.data.username,
      )
```

Replace with:
```typescript
      const result = await rosterService.assignPairing(
        fastify,
        parsed.data.pairingId,
        parsed.data.crewId,
        parsed.data.rosterActingRank,
        parsed.data.username,
      )
```

- [ ] **Step 4: Verify TypeScript compiles for routes**

```bash
cd /home/yuan.z/rois/rois-ai/live-server && npx tsc --noEmit 2>&1 | grep -E "draft\.ts|roster\.ts" | head -20
```

Expected: no errors in these files.

- [ ] **Step 5: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add live-server/src/routes/draft/draft.ts live-server/src/routes/roster/roster.ts
git commit -m "feat(api): add rosterActingRank to assign-pairing endpoint and draft schema"
```

---

## Task 8: Fix Raw SQL and Service References to `acting_rank`

**Files:**
- Modify: `live-server/src/workers/roster-inbound-worker.ts`
- Modify: `live-server/src/workers/roster-ground-inbound-worker.ts`
- Modify: `live-server/src/services/rule-check/rule-check-data-service.ts`
- Modify: `live-server/src/services/scenario/scenario-gantt-service.ts`
- Modify: `live-server/src/routes/scenario/scenario.ts`

- [ ] **Step 1: Fix `roster-inbound-worker.ts`**

Line 100 — rename column in INSERT:
```typescript
              acting_rank, active_rank,
```
→
```typescript
              flight_acting_rank, active_rank,
```

Line 111 — the value `${rec.actingRank}` stays the same (the input field name), only the DB column name changed.

- [ ] **Step 2: Fix `roster-ground-inbound-worker.ts`**

Line 68 — roster_flight INSERT columns:
```typescript
          division, acting_rank,
```
→
```typescript
          division, flight_acting_rank,
```

Line 311 — roster_flight INSERT columns:
```typescript
        division, acting_rank, active_rank, seq_order,
```
→
```typescript
        division, flight_acting_rank, active_rank, seq_order,
```

- [ ] **Step 3: Fix `rule-check-data-service.ts`**

Lines 211-217 — the raw SELECT query:
```typescript
    const { rows } = await fastify.pgPool.query<{ acting_rank: string | null }>(
      `SELECT acting_rank FROM roster_flight
```
→
```typescript
    const { rows } = await fastify.pgPool.query<{ flight_acting_rank: string | null }>(
      `SELECT flight_acting_rank FROM roster_flight
```

Line 217:
```typescript
    return rows[0]?.acting_rank ?? null
```
→
```typescript
    return rows[0]?.flight_acting_rank ?? null
```

- [ ] **Step 4: Fix `scenario-gantt-service.ts`**

The `ScenarioGanttGroundItem` interface in this file (line 80) has `actingRank: string` — this is populated from BOTH the engine CSV (`r['acting_rank']` at line 240 — do NOT change this, it's a file format) AND from the DB query. Keep the interface name `actingRank`.

Line 346 — Drizzle query field:
```typescript
          actingRank:      rosterFlight.actingRank,
```
→
```typescript
          actingRank:      rosterFlight.flightActingRank,
```

Line 369 — mapping from query result:
```typescript
      actingRank:      r.actingRank ?? '',
```
→
```typescript
      actingRank:      r.flightActingRank ?? '',
```

- [ ] **Step 5: Fix `scenario.ts`**

Line 516 — roster_flight insert:
```typescript
          actingRank: p.assignment,
```
→
```typescript
          flightActingRank: p.assignment,
```

- [ ] **Step 6: Verify full live-server compiles**

```bash
cd /home/yuan.z/rois/rois-ai/live-server && npx tsc --noEmit 2>&1 | grep -v "^$" | head -30
```

Expected: zero TypeScript errors.

- [ ] **Step 7: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add live-server/src/workers/roster-inbound-worker.ts \
        live-server/src/workers/roster-ground-inbound-worker.ts \
        live-server/src/services/rule-check/rule-check-data-service.ts \
        live-server/src/services/scenario/scenario-gantt-service.ts \
        live-server/src/routes/scenario/scenario.ts
git commit -m "fix: rename acting_rank → flight_acting_rank in raw SQL and service layer"
```

---

## Task 9: Update Frontend Types

**Files:**
- Modify: `gantt/src/types/roster.ts`
- Modify: `gantt/src/types/flight.ts`

`gantt/src/types/scenario-gantt.ts` line 76 (`ScenarioGanttGroundItem.actingRank`) stays unchanged — it is populated by the engine file format AND the service maps DB data to this same property name.

- [ ] **Step 1: Update `gantt/src/types/roster.ts` — RosterItem**

Find (around line 33):
```typescript
  actingRank: string
```
Replace with:
```typescript
  flightActingRank: string
  rosterActingRank: string | null
```

- [ ] **Step 2: Update `gantt/src/types/roster.ts` — CreateRosterInput**

Find (around line 79):
```typescript
  actingRank: string
```
Replace with:
```typescript
  flightActingRank: string
```

- [ ] **Step 3: Update `gantt/src/types/flight.ts`**

Find (around line 82):
```typescript
  actingRank: string
```
Replace with:
```typescript
  actingRank: string  // flight_detail_dialog reads this from a raw SQL result — keep name
```

Actually, check what this interface is for. It's `FlightRosterItem` which is populated from a raw SQL query in `flight-service.ts`. Let me verify before changing:

```bash
grep -n "actingRank\|acting_rank" /home/yuan.z/rois/rois-ai/live-server/src/services/flight/flight-service.ts | head -10
```

If the flight-service maps `acting_rank` DB column to `actingRank` property manually in a raw SQL result, keep `actingRank` in the type (only the DB column was renamed, not the service output field). If it uses Drizzle and `rosterFlight.actingRank`, update to `flightActingRank`.

- [ ] **Step 4: Fix flight.ts based on Step 3 findings**

If flight-service uses raw SQL aliasing `acting_rank AS "actingRank"` → keep `actingRank` in type.
If flight-service uses Drizzle `rosterFlight.actingRank` → rename type field to `flightActingRank`.

- [ ] **Step 5: Verify gantt TypeScript compiles**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep "roster\.ts\|flight\.ts" | head -20
```

- [ ] **Step 6: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add gantt/src/types/roster.ts gantt/src/types/flight.ts
git commit -m "feat(gantt-types): rename actingRank → flightActingRank on RosterItem/CreateRosterInput"
```

---

## Task 10: Update Frontend Store and Utils

**Files:**
- Modify: `gantt/src/stores/roster-store.ts`
- Modify: `gantt/src/utils/roster-to-check-input.ts`

- [ ] **Step 1: Update `roster-store.ts` — all `actingRank` usages**

Run:
```bash
grep -n "actingRank" /home/yuan.z/rois/rois-ai/gantt/src/stores/roster-store.ts
```

For each occurrence:
- Line 347: `actingRank: task.actingRank` → `flightActingRank: task.flightActingRank`
- Line 448: `actingRank: ''` → `flightActingRank: ''`
- Line 616: `actingRank: task.actingRank` → `flightActingRank: task.flightActingRank`
- Line 712: `actingRank: task.actingRank` → `flightActingRank: task.flightActingRank`

Also, where the store calls the `assign-pairing` operation (the draft op of type `assign-pairing`), add `rosterActingRank` to the payload. Find where the store dispatches an `assign-pairing` op and add:
```typescript
rosterActingRank: '<rank from context>',
```
The rank comes from the crew being dragged or the rank slot they are dropped into. Check the drag-drop or assign handler to find what value to use.

- [ ] **Step 2: Update `roster-to-check-input.ts`**

Line 173:
```typescript
      const seatPosition = pItems.find((...))?.actingRank ?? null
```
→
```typescript
      const seatPosition = pItems.find((...))?.flightActingRank ?? null
```

Line 186:
```typescript
          rank: quals?.rank ?? crewItems[0]?.actingRank ?? 'FO',
```
→
```typescript
          rank: quals?.rank ?? crewItems[0]?.flightActingRank ?? 'FO',
```

- [ ] **Step 3: Verify store compiles**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep "roster-store\|roster-to-check" | head -20
```

- [ ] **Step 4: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add gantt/src/stores/roster-store.ts gantt/src/utils/roster-to-check-input.ts
git commit -m "feat(gantt-store): rename actingRank → flightActingRank in roster store and utils"
```

---

## Task 11: Update Frontend Components

**Files:**
- Modify: `gantt/src/components/roster/task-detail-dialog.tsx`
- Modify: `gantt/src/components/roster/add-task-dialog.tsx`
- Modify: `gantt/src/components/flight/flight-detail-dialog.tsx`
- Modify: `gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx`
- Modify: `gantt/src/components/layout/pane-container.tsx`
- Modify: `gantt/src/components/layout/app-layout.tsx`
- Modify: `gantt/src/components/panes/roster-pane.tsx`

- [ ] **Step 1: Fix `task-detail-dialog.tsx`**

Line 84:
```tsx
            <span className="font-medium">{task.actingRank}</span>
```
→
```tsx
            <span className="font-medium">{task.flightActingRank}</span>
```

- [ ] **Step 2: Fix `flight-detail-dialog.tsx`**

Lines 310, 312, 322 — three occurrences of `item.actingRank`. Whether to rename depends on the type of `item` in this context. If `item` is `FlightRosterItem` from `flight.ts` and Task 9 Step 3 kept `actingRank`, leave unchanged. If it was renamed, update here too. Confirm via the type of `item` in context.

- [ ] **Step 3: Fix `scenario-gantt-canvas.tsx`**

Lines 125, 155 — object literals constructing a mock roster item:
```tsx
        division: pairing.division, actingRank: '', activeRank: null, position: null,
```
→
```tsx
        division: pairing.division, flightActingRank: '', rosterActingRank: null, activeRank: null, position: null,
```

Line 194 — `actingRank: g.actingRank` where `g` is `ScenarioGanttGroundItem`. This interface keeps `actingRank`, so the value `g.actingRank` is correct. The destination object may need updating if it expects `flightActingRank`. Check the type of the destination and update accordingly.

- [ ] **Step 4: Fix `pane-container.tsx`**

Lines 108, 136:
```tsx
              actingRank: '', activeRank: null, position: null,
```
→
```tsx
              flightActingRank: '', rosterActingRank: null, activeRank: null, position: null,
```

- [ ] **Step 5: Fix `app-layout.tsx`**

Lines 150, 178:
```tsx
              actingRank: '', activeRank: null, position: null,
```
→
```tsx
              flightActingRank: '', rosterActingRank: null, activeRank: null, position: null,
```

- [ ] **Step 6: Fix `roster-pane.tsx`**

Line 288:
```tsx
        : (crew?.panelRank ?? firstItem?.actingRank ?? '')
```
→
```tsx
        : (crew?.panelRank ?? firstItem?.flightActingRank ?? '')
```

- [ ] **Step 7: Fix `add-task-dialog.tsx`**

Lines 36, 53: object literals:
```tsx
    actingRank: '',
```
→
```tsx
    flightActingRank: '',
```

Line 62: validation check:
```tsx
    if (!form.crewId || !form.schStrDtUtc || !form.schEndDtUtc || !form.base || !form.actingRank) {
```
→
```tsx
    if (!form.crewId || !form.schStrDtUtc || !form.schEndDtUtc || !form.base || !form.flightActingRank) {
```

Lines 73, 151, 152: field references:
```tsx
        actingRank: form.actingRank,
...
              value={form.actingRank}
              onChange={(e) => updateField('actingRank', e.target.value)}
```
→
```tsx
        flightActingRank: form.flightActingRank,
...
              value={form.flightActingRank}
              onChange={(e) => updateField('flightActingRank', e.target.value)}
```

- [ ] **Step 8: Full TypeScript check for gantt**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep -v "^$" | head -30
```

Expected: zero errors.

- [ ] **Step 9: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add gantt/src/components/roster/task-detail-dialog.tsx \
        gantt/src/components/roster/add-task-dialog.tsx \
        gantt/src/components/flight/flight-detail-dialog.tsx \
        gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx \
        gantt/src/components/layout/pane-container.tsx \
        gantt/src/components/layout/app-layout.tsx \
        gantt/src/components/panes/roster-pane.tsx
git commit -m "feat(gantt-ui): rename actingRank → flightActingRank in all components"
```

---

## Task 12: Version Bump

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Bump versions**

Read the file:
```bash
cat gantt/src/version.ts
```

Increment `BACKEND_VERSION` +1 (live-server changed) and `FRONTEND_VERSION` +1 (gantt changed). Leave `RULE_VERSION` as-is.

- [ ] **Step 2: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add gantt/src/version.ts
git commit -m "chore: bump B/F versions for fill/open and acting_rank refactor"
```

---

## Task 13: E2E Test — pairing_composition.fill updates after crew assignment

**Files:**
- Create: `e2e/tests/gantt/pairing-composition-fill.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
/**
 * Pairing composition fill updates after crew assignment/removal.
 * Tests via API calls (no UI drag-drop required for fill assertions).
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, waitGanttReady } from '../../utils/gantt-hook'

const BASE_URL = 'http://localhost:3000'

test.describe('pairing_composition fill tracking', () => {
  let authHeaders: Record<string, string>

  test.beforeAll(async ({ request }) => {
    // Login and get auth token
    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { userCode: 'admin', password: 'admin123', schema: 'f8' },
    })
    const loginBody = await loginRes.json()
    authHeaders = { Authorization: `Bearer ${loginBody.data?.token}` }
  })

  test('fill increases after assigning crew to a pairing, decreases after removal', async ({ request, page }) => {
    // --- Setup: find a pairing that has composition (plan > 0) and is not full ---
    const listRes = await request.get(`${BASE_URL}/api/pairing?isFull=false&pageSize=1`, {
      headers: authHeaders,
    })
    const listBody = await listRes.json()
    const pairings = listBody.data?.items ?? []
    test.skip(pairings.length === 0, 'No non-full pairings available for testing')

    const pairing = pairings[0]
    const composition = pairing.composition as Array<{ rank: string; plan: number; fill: number }>
    const slot = composition.find((c) => c.plan > c.fill)
    test.skip(!slot, 'No open composition slot found')

    const pairingId: number = pairing.id
    const rosterActingRank: string = slot!.rank
    const fillBefore: number = slot!.fill

    // --- Setup: find a crew member not already assigned to this pairing ---
    const crewRes = await request.get(`${BASE_URL}/api/crew?pageSize=5`, { headers: authHeaders })
    const crewBody = await crewRes.json()
    const crews = crewBody.data?.items ?? crewBody.data ?? []
    test.skip(crews.length === 0, 'No crew available for testing')
    const crewId: string = crews[0].crewId ?? crews[0].crew_id

    // --- Act: assign the crew to the pairing ---
    const assignRes = await request.post(`${BASE_URL}/api/roster/assign-pairing`, {
      headers: authHeaders,
      data: { pairingId, crewId, rosterActingRank, username: 'e2e-test' },
    })
    expect(assignRes.status()).toBe(200)

    // --- Assert: pairing's fill for that rank increased by 1 ---
    const afterAssignRes = await request.get(`${BASE_URL}/api/pairing/${pairingId}`, {
      headers: authHeaders,
    })
    const afterAssignBody = await afterAssignRes.json()
    const updatedComposition = (afterAssignBody.data?.composition ?? afterAssignBody.composition) as Array<{ rank: string; plan: number; fill: number }>
    const updatedSlot = updatedComposition.find((c) => c.rank === rosterActingRank)
    expect(updatedSlot, `Composition slot for ${rosterActingRank} must exist`).toBeTruthy()
    expect(updatedSlot!.fill).toBe(fillBefore + 1)

    // --- Act: remove the crew from the pairing ---
    const removeRes = await request.post(`${BASE_URL}/api/roster/remove-pairing`, {
      headers: authHeaders,
      data: { pairingId, crewId, username: 'e2e-test' },
    })
    expect(removeRes.status()).toBe(200)

    // --- Assert: fill returns to original value ---
    const afterRemoveRes = await request.get(`${BASE_URL}/api/pairing/${pairingId}`, {
      headers: authHeaders,
    })
    const afterRemoveBody = await afterRemoveRes.json()
    const restoredComposition = (afterRemoveBody.data?.composition ?? afterRemoveBody.composition) as Array<{ rank: string; plan: number; fill: number }>
    const restoredSlot = restoredComposition.find((c) => c.rank === rosterActingRank)
    expect(restoredSlot!.fill).toBe(fillBefore)
  })
})
```

- [ ] **Step 2: Run the test**

```bash
npx playwright test --config=config/playwright.config.ts \
  tests/gantt/pairing-composition-fill.spec.ts --reporter=list
```

Expected: `1 passed` (or `1 skipped` if the test DB has no non-full pairings, which is also acceptable — set up seed data if needed).

- [ ] **Step 3: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add e2e/tests/gantt/pairing-composition-fill.spec.ts
git commit -m "test(e2e): pairing_composition fill increases/decreases with crew assignment"
```

---

## Self-Review Checklist

- [x] **SQL**: migration covers all 3 tables, `open` is GENERATED STORED
- [x] **Drizzle models**: `plan_value` → `plan`, `fill`, `open` added to both composition models; `acting_rank` → `flight_acting_rank` + `roster_acting_rank` in roster-flight
- [x] **Fill utility**: `refreshPairingCompositionFill` + `refreshFlightCompositionFill` in `utils/composition-fill.ts`
- [x] **pairing-service**: hardcoded `fill: 0` removed; `createComposition`/`updateComposition`/`removeComposition` refresh flight fill; cap validation with `is_must_crew_rank` guard
- [x] **roster-service**: `assignPairing` accepts `rosterActingRank`, stores on all segment rows, refreshes pairing fill; `removeByPairingAndCrew` refreshes fill after soft-delete; `actingRank` → `flightActingRank` in all create calls
- [x] **Routes**: draft schema and direct endpoint both accept `rosterActingRank`
- [x] **Raw SQL workers/services**: `acting_rank` → `flight_acting_rank` in all 5 files
- [x] **Frontend types**: `RosterItem.actingRank` → `flightActingRank`, `rosterActingRank` added
- [x] **Frontend stores/components**: 28 references updated across 9 files
- [x] **Version bump**: B and F incremented
- [x] **E2E test**: fill increase/decrease after assign/remove
- [x] **`ScenarioGanttGroundItem.actingRank`** stays unchanged (engine CSV format + service remaps DB field to same property name)
- [x] **`composition_rank.plan_value`** (the separate composition management system) is NOT touched — different table/feature
