# F8 Data Import Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build F8→connector-server→live-server→PostgreSQL import pipeline for crew/flight/pairing/roster_flight data via BullMQ FlowProducer ordered chains.

**Architecture:** connector-server polls F8 API with chunk-retry (10→5→3 days on 5xx), stores raw JSON atomically to disk, preloads crew Set from DB for filtering, transforms to typed job payloads, pushes via BullMQ FlowProducer (flight→pairing→roster ordered; crew independent). live-server workers consume queues, resolve FKs, upsert with savepoint isolation per record.

**Tech Stack:** Fastify, TypeScript, Drizzle ORM, BullMQ + FlowProducer, @bull-board/fastify, PostgreSQL, date-fns, Vitest

---

## File Map

**New files — connector-server:**
- `src/types/import-jobs.ts` — BullMQ job payload types (shared interface definitions)
- `src/utils/chunk-date.ts` — date range chunking + chunk-level retry
- `src/utils/json-store.ts` — atomic JSON file write (tmp→rename)
- `src/utils/rejection-store.ts` — rejected records JSON file write
- `src/utils/db-lookup.ts` — preload crew Set from live-server DB (read-only)
- `src/transform/f8/db/transform-flight.ts` — F8 API → FlightImportRecord[]
- `src/transform/f8/db/transform-crew.ts` — F8 API → CrewImportRecord[]
- `src/transform/f8/db/transform-pairing.ts` — F8 API → PairingImportRecord[]
- `src/transform/f8/db/transform-roster.ts` — F8 API → RosterImportRecord[] (with crew filter)
- `src/services/sync/f8/f8-sync-orchestrator.ts` — main sync dispatch + FlowProducer wiring
- `src/plugins/bull-board.ts` — Bull Board UI plugin

**Modified files — connector-server:**
- `src/models/connector-config.ts` — add `f8_import` protocol; add `chunkDays?`, `rosterGroundUrl?` to EndpointConfig
- `src/models/connector-log.ts` — add `syncId`, `filteredCount`, `rejectionFile` fields
- `src/workers/poll-inbound-worker.ts` — add `f8_import` branch to dispatch F8 orchestrator
- `src/index.ts` — register bull-board plugin

**New files — live-server:**
- `src/workers/flight-inbound-worker.ts`
- `src/workers/crew-inbound-worker.ts`
- `src/workers/pairing-inbound-worker.ts`
- `src/workers/roster-inbound-worker.ts`

**Modified files — live-server:**
- `src/index.ts` — start four inbound workers

**New SQL files:**
- `sql/migration/2026-05-22-connector-log-sync-fields.sql`
- `sql/migration/2026-05-22-unique-indexes-flight-pairing.sql`
- `sql/seed/f8/11_connector_sync_dictionary.sql`

**Modified SQL files:**
- `sql/seed/f8/10_connector_f8.sql` — change protocol to `f8_import`, add chunkDays, add rosterGroundUrl

---

## Task 1: SQL Migrations + Seed Updates

**Files:**
- Create: `sql/migration/2026-05-22-connector-log-sync-fields.sql`
- Create: `sql/migration/2026-05-22-unique-indexes-flight-pairing.sql`
- Create: `sql/seed/f8/11_connector_sync_dictionary.sql`
- Modify: `sql/seed/f8/10_connector_f8.sql`

- [ ] **Step 1: Create connector_log migration**

```sql
-- sql/migration/2026-05-22-connector-log-sync-fields.sql
-- Add sync tracking fields to connector_log
ALTER TABLE connector_log
  ADD COLUMN IF NOT EXISTS sync_id        varchar(36),
  ADD COLUMN IF NOT EXISTS filtered_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejection_file varchar(500);

CREATE INDEX IF NOT EXISTS idx_connector_log_sync_id ON connector_log (sync_id);
```

- [ ] **Step 2: Create unique index migration for flight + pairing**

```sql
-- sql/migration/2026-05-22-unique-indexes-flight-pairing.sql
-- Required for upsert correctness: ON CONFLICT (interface_flt_id, flt_dt)
CREATE UNIQUE INDEX IF NOT EXISTS uq_flight_interface_flt_dt
  ON flight (interface_flt_id, flt_dt)
  WHERE interface_flt_id IS NOT NULL;

-- Required for upsert: ON CONFLICT (interface_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pairing_interface_id
  ON pairing (interface_id)
  WHERE interface_id IS NOT NULL;
```

- [ ] **Step 3: Create dictionary seed for CONNECTOR_SYNC cron config**

```sql
-- sql/seed/f8/11_connector_sync_dictionary.sql
SET search_path = f8;

INSERT INTO dictionary (parent_code, code, label, value, sort_order, is_enabled, created_by, updated_by)
VALUES
  ('CONNECTOR_SYNC', 'f8_crew_cron',         'F8 Crew Sync Cron',         '0 */4 * * *', 10, 1, 'system', 'system'),
  ('CONNECTOR_SYNC', 'f8_flight_cron',        'F8 Flight Sync Cron',       '0 * * * *',   20, 1, 'system', 'system'),
  ('CONNECTOR_SYNC', 'f8_pairing_cron',       'F8 Pairing Sync Cron',      '0 */2 * * *', 30, 1, 'system', 'system'),
  ('CONNECTOR_SYNC', 'f8_roster_flight_cron', 'F8 Roster Flight Sync Cron','0 * * * *',   40, 1, 'system', 'system')
ON CONFLICT (parent_code, code) DO UPDATE SET
  value      = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = now();
```

- [ ] **Step 4: Update 10_connector_f8.sql — change protocol + add chunkDays**

In `sql/seed/f8/10_connector_f8.sql`, change every `'poll_inbound'` to `'f8_import'`, and add `'chunkDays', 10` to each endpoint_config `jsonb_build_object(...)`. For `f8-roster-flight` also add `'rosterGroundUrl', 'https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/rosterGround'`.

Replace in the file:

```sql
-- f8-crew endpoint_config: add chunkDays (not a date-range API but included for consistency)
jsonb_build_object(
  'url',        'https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/crew',
  'method',     'POST',
  'timeout',    60000,
  'retryCount', 3,
  'retryDelay', 2000,
  'chunkDays',  10
),
-- ...protocol changed to 'f8_import' for all four rows
-- f8-roster-flight endpoint_config: add rosterGroundUrl
jsonb_build_object(
  'url',            'https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/rosterFlight',
  'method',         'POST',
  'timeout',        30000,
  'retryCount',     2,
  'retryDelay',     2000,
  'pollBodyDays',   30,
  'chunkDays',      10,
  'rosterGroundUrl','https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/rosterGround'
),
```

- [ ] **Step 5: Apply migrations**

```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" \
  -f sql/migration/2026-05-22-connector-log-sync-fields.sql
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" \
  -f sql/migration/2026-05-22-unique-indexes-flight-pairing.sql
```

Expected: `ALTER TABLE`, `CREATE INDEX` (or `NOTICE: relation ... already exists, skipping`).

- [ ] **Step 6: Apply seeds**

```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" \
  -f sql/seed/f8/10_connector_f8.sql
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" \
  -f sql/seed/f8/11_connector_sync_dictionary.sql
```

Expected: `INSERT 0 4`, `INSERT 0 4` (or `UPDATE N` on re-run).

- [ ] **Step 7: Commit**

```bash
git add sql/migration/2026-05-22-connector-log-sync-fields.sql \
        sql/migration/2026-05-22-unique-indexes-flight-pairing.sql \
        sql/seed/f8/10_connector_f8.sql \
        sql/seed/f8/11_connector_sync_dictionary.sql
git commit -m "feat(connector): add sync tracking fields, unique indexes, and F8 import seed updates"
```

---

## Task 2: connector-server Model + Type Updates

**Files:**
- Modify: `connector-server/src/models/connector-config.ts`
- Modify: `connector-server/src/models/connector-log.ts`
- Create: `connector-server/src/types/import-jobs.ts`

- [ ] **Step 1: Update EndpointConfig interface in connector-config.ts**

In `connector-server/src/models/connector-config.ts`, add two optional fields to `EndpointConfig`:

```typescript
export interface EndpointConfig {
  url: string
  headers?: Record<string, string>
  timeout?: number
  retryCount?: number
  retryDelay?: number
  method?: 'GET' | 'POST'
  pollBodyDays?: number
  chunkDays?: number          // chunk size for date-range APIs (default 10)
  rosterGroundUrl?: string    // separate URL for roster-ground API
}
```

Also add `'f8_import'` to the `protocol` field comment (line 12):
```typescript
protocol: varchar('protocol', { length: 20 }).notNull(), // poll_inbound | push_inbound | push_outbound | query_outbound | f8_import
```

- [ ] **Step 2: Update connector-log.ts — add sync fields**

In `connector-server/src/models/connector-log.ts`, add after `durationMs`:

```typescript
export const connectorLog = pgTable('connector_log', {
  // ...existing fields...
  durationMs: integer('duration_ms'),
  syncId: varchar('sync_id', { length: 36 }),
  filteredCount: integer('filtered_count').notNull().default(0),
  rejectionFile: varchar('rejection_file', { length: 500 }),
  executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_connector_log_executed_at').on(table.executedAt),
  index('idx_connector_log_sync_id').on(table.syncId),
])
```

- [ ] **Step 3: Create import-jobs.ts**

```typescript
// connector-server/src/types/import-jobs.ts

export interface ImportJobMeta {
  syncId: string
  filiale: string
  syncRangeDt: [string, string] // [startDt, endDt] YYYY-MM-DD
}

// ---- Flight ----
export interface FlightImportJob extends ImportJobMeta {
  records: FlightImportRecord[]
}
export interface FlightImportRecord {
  interfaceFltId: string
  fltNum: string
  airline: string
  fltDt: string          // YYYY-MM-DD
  depArp: string
  arvArp: string
  fleet: string
  tailNum: string | null
  schStrDtUtc: string    // ISO datetime string
  schEndDtUtc: string
  actStrDtUtc: string    // defaults to schStrDtUtc if no actual
  actEndDtUtc: string
  blkMin: number
  fltType: string        // 'PAX' default
  fltSts: string | null
}

// ---- Crew ----
export interface CrewImportJob extends ImportJobMeta {
  records: CrewImportRecord[]
}
export interface CrewImportRecord {
  crewId: string         // String(F8 crewId number)
  firstName: string
  lastName: string
  division: string       // 'P' | 'C'
  base: string | null
  rank: string | null    // 'CA' | 'FO' etc, current active rank
  filiale: string
}

// ---- Pairing ----
export interface PairingImportJob extends ImportJobMeta {
  pairings: PairingImportRecord[]
}
export interface PairingImportRecord {
  interfaceId: string
  pairingLabel: string | null
  base: string
  fleet: string
  division: string
  assignmentGroup: string
  assignment: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string
  actEndDtUtc: string
  durationDays: number
  tafb: number
  source: string         // 'F8'
  duties: PairingDutyRecord[]
}
export interface PairingDutyRecord {
  dutySeq: number
  strArp: string
  endArp: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string
  actEndDtUtc: string
  pickupStartUtc?: string;   pickupEndUtc?: string
  briefStartUtc?: string;    briefEndUtc?: string
  debriefStartUtc?: string;  debriefEndUtc?: string
  dropoffStartUtc?: string;  dropoffEndUtc?: string
  doublePickupStartUtc?: string;   doublePickupEndUtc?: string
  doubleBriefStartUtc?: string;    doubleBriefEndUtc?: string
  doubleDebriefStartUtc?: string;  doubleDebriefEndUtc?: string
  doubleDropoffStartUtc?: string;  doubleDropoffEndUtc?: string
  segments: PairingSegmentRecord[]
}
export interface PairingSegmentRecord {
  segSeq: number
  interfaceFltId: string | null
  fltNum: string
  airline: string
  depArp: string
  arvArp: string
  fleet: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string
  actEndDtUtc: string
  segAssignment: string  // 'FLY' | 'DHD' | 'SBY'
}

// ---- Roster ----
export interface RosterImportJob extends ImportJobMeta {
  records: RosterFlightRecord[]
  filteredCount: number
  rejectionFile: string | null
}
export interface RosterFlightRecord {
  crewId: string
  pairingInterfaceId: string
  actingRank: string
  activeRank: string
  division: string
  seqOrder: number
  assignment: string       // 'FLY' | 'DHD' | 'SBY'
  assignmentGroup: string
  base: string
  source: string           // 'F8'
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd connector-server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add connector-server/src/models/connector-config.ts \
        connector-server/src/models/connector-log.ts \
        connector-server/src/types/import-jobs.ts
git commit -m "feat(connector): add F8 import job types and sync tracking fields to models"
```

---

## Task 3: Utilities — chunk-date, json-store, rejection-store

**Files:**
- Create: `connector-server/src/utils/chunk-date.ts`
- Create: `connector-server/src/__tests__/unit/chunk-date.test.ts`
- Create: `connector-server/src/utils/json-store.ts`
- Create: `connector-server/src/__tests__/unit/json-store.test.ts`
- Create: `connector-server/src/utils/rejection-store.ts`

- [ ] **Step 1: Write chunk-date tests**

```typescript
// connector-server/src/__tests__/unit/chunk-date.test.ts
import { describe, it, expect } from 'vitest'
import { chunkDateRange } from '../../utils/chunk-date.js'

describe('chunkDateRange', () => {
  it('returns single chunk when range <= chunkDays', () => {
    const chunks = chunkDateRange('2026-01-01', '2026-01-05', 10)
    expect(chunks).toEqual([{ startDt: '2026-01-01', endDt: '2026-01-05' }])
  })

  it('splits into multiple chunks', () => {
    const chunks = chunkDateRange('2026-01-01', '2026-01-25', 10)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toEqual({ startDt: '2026-01-01', endDt: '2026-01-10' })
    expect(chunks[1]).toEqual({ startDt: '2026-01-11', endDt: '2026-01-20' })
    expect(chunks[2]).toEqual({ startDt: '2026-01-21', endDt: '2026-01-25' })
  })

  it('handles exact boundary', () => {
    const chunks = chunkDateRange('2026-01-01', '2026-01-10', 10)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ startDt: '2026-01-01', endDt: '2026-01-10' })
  })

  it('subChunk returns halved chunk sizes', () => {
    const { chunkDateRange: subChunk } = await import('../../utils/chunk-date.js')
    const chunks = chunkDateRange('2026-01-01', '2026-01-10', 5)
    expect(chunks).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd connector-server && npx vitest run src/__tests__/unit/chunk-date.test.ts
```

Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implement chunk-date.ts**

```typescript
// connector-server/src/utils/chunk-date.ts
import { addDays, format, parseISO, differenceInDays } from 'date-fns'

export interface DateChunk {
  startDt: string  // YYYY-MM-DD
  endDt: string
}

export function chunkDateRange(
  startDt: string,
  endDt: string,
  chunkDays: number,
): DateChunk[] {
  const start = parseISO(startDt)
  const end = parseISO(endDt)
  const chunks: DateChunk[] = []
  let cursor = start

  while (cursor <= end) {
    const chunkEnd = addDays(cursor, chunkDays - 1)
    const clampedEnd = chunkEnd < end ? chunkEnd : end
    chunks.push({
      startDt: format(cursor, 'yyyy-MM-dd'),
      endDt: format(clampedEnd, 'yyyy-MM-dd'),
    })
    cursor = addDays(clampedEnd, 1)
  }

  return chunks
}

export type FetchFn = (startDt: string, endDt: string) => Promise<unknown[]>

/**
 * Fetch a date chunk with automatic sub-chunk retry on 5xx.
 * 10-day chunk → 5-day sub-chunks → 3-day sub-chunks on repeated failure.
 */
export async function fetchWithChunkRetry(
  fn: FetchFn,
  startDt: string,
  endDt: string,
  chunkDays: number,
): Promise<unknown[]> {
  try {
    return await fn(startDt, endDt)
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 401 || status === 403) throw err
    if (chunkDays <= 3) throw err

    // Retry with halved chunk size
    const subChunkDays = chunkDays === 10 ? 5 : 3
    const subChunks = chunkDateRange(startDt, endDt, subChunkDays)
    const results: unknown[] = []
    for (const chunk of subChunks) {
      const subResult = await fetchWithChunkRetry(fn, chunk.startDt, chunk.endDt, subChunkDays)
      results.push(...subResult)
    }
    return results
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd connector-server && npx vitest run src/__tests__/unit/chunk-date.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write json-store tests**

```typescript
// connector-server/src/__tests__/unit/json-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

describe('saveRawJson', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'json-store-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
  })

  it('writes JSON file and returns the path', async () => {
    process.env['DATA_DIR'] = tmpDir
    const { saveRawJson } = await import('../../utils/json-store.js')
    const filePath = await saveRawJson('flight', 'F8', '2026-01-01', '2026-01-10', [{ id: 1 }])
    expect(existsSync(filePath)).toBe(true)
    expect(filePath).toMatch(/2026-01-01_2026-01-10\.json$/)
  })

  it('includes suffix in filename when provided', async () => {
    process.env['DATA_DIR'] = tmpDir
    const { saveRawJson } = await import('../../utils/json-store.js')
    const filePath = await saveRawJson('roster_ground', 'F8', '2026-01-01', '2026-01-10', [], 'Unknown')
    expect(filePath).toMatch(/Unknown\.json$/)
  })
})
```

- [ ] **Step 6: Implement json-store.ts**

```typescript
// connector-server/src/utils/json-store.ts
import { mkdir, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'

const dataDir = () => process.env['DATA_DIR'] ?? path.join(process.cwd(), 'data')

export async function saveRawJson(
  entity: string,
  filiale: string,
  startDt: string,
  endDt: string,
  data: unknown[],
  suffix?: string,
): Promise<string> {
  const dir = path.join(dataDir(), 'raw', filiale.toLowerCase(), entity)
  await mkdir(dir, { recursive: true })

  const filename = suffix
    ? `${startDt}_${endDt}_${suffix}.json`
    : `${startDt}_${endDt}.json`
  const finalPath = path.join(dir, filename)
  const tmpPath = `${finalPath}.tmp`

  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmpPath, finalPath)

  return finalPath
}
```

- [ ] **Step 7: Implement rejection-store.ts**

```typescript
// connector-server/src/utils/rejection-store.ts
import { mkdir, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { format } from 'date-fns'

const dataDir = () => process.env['DATA_DIR'] ?? path.join(process.cwd(), 'data')

export interface RejectionRecord {
  crewId: string
  reason: string
  raw: unknown
}

export async function saveRejectedRecords(
  entity: string,
  filiale: string,
  records: RejectionRecord[],
): Promise<string> {
  const dir = path.join(dataDir(), 'rejected', filiale.toLowerCase(), entity)
  await mkdir(dir, { recursive: true })

  const ts = format(new Date(), 'yyyyMMdd_HHmmss')
  const filename = `${ts}_rejected.json`
  const finalPath = path.join(dir, filename)
  const tmpPath = `${finalPath}.tmp`

  const payload = {
    count: records.length,
    generatedAt: new Date().toISOString(),
    records,
  }

  await writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8')
  await rename(tmpPath, finalPath)

  return finalPath
}
```

- [ ] **Step 8: Run json-store test — expect PASS**

```bash
cd connector-server && npx vitest run src/__tests__/unit/json-store.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add connector-server/src/utils/chunk-date.ts \
        connector-server/src/utils/json-store.ts \
        connector-server/src/utils/rejection-store.ts \
        connector-server/src/__tests__/unit/chunk-date.test.ts \
        connector-server/src/__tests__/unit/json-store.test.ts
git commit -m "feat(connector): add chunk-date, json-store, rejection-store utilities"
```

---

## Task 4: db-lookup — Crew Set Preloader

**Files:**
- Create: `connector-server/src/utils/db-lookup.ts`
- Create: `connector-server/src/__tests__/unit/db-lookup.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// connector-server/src/__tests__/unit/db-lookup.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('loadCrewSet', () => {
  it('returns a Set of crew_id strings from DB result', async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue({
        rows: [{ crew_id: 'C001' }, { crew_id: 'C002' }],
      }),
    }

    const { loadCrewSet } = await import('../../utils/db-lookup.js')
    const result = await loadCrewSet(mockDb as never)

    expect(result).toBeInstanceOf(Set)
    expect(result.has('C001')).toBe(true)
    expect(result.has('C002')).toBe(true)
    expect(result.size).toBe(2)
  })

  it('returns empty Set when no crew in DB', async () => {
    const mockDb = { execute: vi.fn().mockResolvedValue({ rows: [] }) }
    const { loadCrewSet } = await import('../../utils/db-lookup.js')
    const result = await loadCrewSet(mockDb as never)
    expect(result.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd connector-server && npx vitest run src/__tests__/unit/db-lookup.test.ts
```

Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implement db-lookup.ts**

```typescript
// connector-server/src/utils/db-lookup.ts
import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export async function loadCrewSet(
  db: NodePgDatabase<Record<string, never>>,
): Promise<Set<string>> {
  const result = await db.execute(sql`SELECT crew_id FROM crew`)
  const rows = result.rows as Array<{ crew_id: string }>
  return new Set(rows.map(r => String(r.crew_id)))
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd connector-server && npx vitest run src/__tests__/unit/db-lookup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add connector-server/src/utils/db-lookup.ts \
        connector-server/src/__tests__/unit/db-lookup.test.ts
git commit -m "feat(connector): add crew-set DB preloader utility"
```

---

## Task 5: F8 DB Transforms — Flight + Crew

**Files:**
- Create: `connector-server/src/transform/f8/db/transform-flight.ts`
- Create: `connector-server/src/transform/f8/db/transform-crew.ts`
- Create: `connector-server/src/__tests__/unit/transform-flight-db.test.ts`
- Create: `connector-server/src/__tests__/unit/transform-crew-db.test.ts`

- [ ] **Step 1: Write flight transform test**

```typescript
// connector-server/src/__tests__/unit/transform-flight-db.test.ts
import { describe, it, expect } from 'vitest'
import { transformF8Flights } from '../../transform/f8/db/transform-flight.js'

const rawFlight = {
  fltId: '12345',
  datOp: '2026-06-01T00:00:00Z',
  depStn: 'PEK',
  arrStn: 'PVG',
  std: '2026-06-01T08:00:00Z',
  sta: '2026-06-01T10:00:00Z',
  atd: null,
  ata: null,
  acGrp: 'B738',
  acReg: 'B-5678',
}

describe('transformF8Flights', () => {
  it('maps F8 flight to FlightImportRecord', () => {
    const records = transformF8Flights([rawFlight], 'F8')
    expect(records).toHaveLength(1)
    const r = records[0]
    expect(r.interfaceFltId).toBe('12345')
    expect(r.fltNum).toBe('12345')
    expect(r.fltDt).toBe('2026-06-01')
    expect(r.depArp).toBe('PEK')
    expect(r.arvArp).toBe('PVG')
    expect(r.schStrDtUtc).toBe('2026-06-01T08:00:00.000Z')
    expect(r.schEndDtUtc).toBe('2026-06-01T10:00:00.000Z')
    expect(r.actStrDtUtc).toBe('2026-06-01T08:00:00.000Z') // defaults to sch
    expect(r.actEndDtUtc).toBe('2026-06-01T10:00:00.000Z')
    expect(r.blkMin).toBe(120)
    expect(r.fleet).toBe('B738')
    expect(r.tailNum).toBe('B-5678')
    expect(r.airline).toBe('F8')
    expect(r.fltType).toBe('PAX')
  })

  it('uses actual times when provided', () => {
    const records = transformF8Flights([{
      ...rawFlight,
      atd: '2026-06-01T08:15:00Z',
      ata: '2026-06-01T10:05:00Z',
    }], 'F8')
    expect(records[0].actStrDtUtc).toBe('2026-06-01T08:15:00.000Z')
    expect(records[0].actEndDtUtc).toBe('2026-06-01T10:05:00.000Z')
  })

  it('skips records with missing fltId or datOp', () => {
    const records = transformF8Flights([{ fltId: '', datOp: '' }], 'F8')
    expect(records).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd connector-server && npx vitest run src/__tests__/unit/transform-flight-db.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement transform-flight.ts**

```typescript
// connector-server/src/transform/f8/db/transform-flight.ts
import type { FlightImportRecord } from '../../../types/import-jobs.js'

interface F8FlightRaw {
  fltId: string
  datOp: string
  depStn?: string
  arrStn?: string
  std?: string
  sta?: string
  atd?: string | null
  ata?: string | null
  acGrp?: string
  acReg?: string | null
}

const toIso = (val: string | null | undefined): string | null => {
  if (!val) return null
  return new Date(val.replace(' ', 'T')).toISOString()
}

const diffMinutes = (start: string, end: string): number => {
  const diff = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(0, Math.round(diff / 60000))
}

export function transformF8Flights(
  raw: unknown[],
  airline: string,
): FlightImportRecord[] {
  const records: FlightImportRecord[] = []

  for (const item of raw) {
    const f = item as F8FlightRaw
    if (!f.fltId || !f.datOp) continue

    const schStrDtUtc = toIso(f.std)
    const schEndDtUtc = toIso(f.sta)
    if (!schStrDtUtc || !schEndDtUtc) continue

    const actStrDtUtc = toIso(f.atd) ?? schStrDtUtc
    const actEndDtUtc = toIso(f.ata) ?? schEndDtUtc

    records.push({
      interfaceFltId: String(f.fltId),
      fltNum: String(f.fltId),
      airline,
      fltDt: f.datOp.slice(0, 10),
      depArp: f.depStn ?? '',
      arvArp: f.arrStn ?? '',
      fleet: f.acGrp ?? '',
      tailNum: f.acReg ?? null,
      schStrDtUtc,
      schEndDtUtc,
      actStrDtUtc,
      actEndDtUtc,
      blkMin: diffMinutes(schStrDtUtc, schEndDtUtc),
      fltType: 'PAX',
      fltSts: null,
    })
  }

  return records
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd connector-server && npx vitest run src/__tests__/unit/transform-flight-db.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write crew transform test**

```typescript
// connector-server/src/__tests__/unit/transform-crew-db.test.ts
import { describe, it, expect } from 'vitest'
import { transformF8Crew } from '../../transform/f8/db/transform-crew.js'

const rawCrew = {
  crewId: 12345,
  firstName: 'Zhang',
  lastName: 'San',
  bases: [{ base: 'PEK', isPrimary: true }, { base: 'SHA', isPrimary: false }],
  ranks: [{ rank: 'Captain', effDt: '2020-01-01T00:00:00Z', expDt: '2099-12-31T00:00:00Z' }],
}

describe('transformF8Crew', () => {
  it('maps F8 crew to CrewImportRecord', () => {
    const records = transformF8Crew([rawCrew], 'F8')
    expect(records).toHaveLength(1)
    const r = records[0]
    expect(r.crewId).toBe('12345')
    expect(r.firstName).toBe('Zhang')
    expect(r.lastName).toBe('San')
    expect(r.base).toBe('PEK')
    expect(r.rank).toBe('CA')
    expect(r.filiale).toBe('F8')
  })

  it('picks primary base', () => {
    const records = transformF8Crew([rawCrew], 'F8')
    expect(records[0].base).toBe('PEK')
  })

  it('returns null rank when no active rank', () => {
    const expired = { ...rawCrew, ranks: [{ rank: 'Captain', effDt: '2010-01-01T00:00:00Z', expDt: '2015-01-01T00:00:00Z' }] }
    const records = transformF8Crew([expired], 'F8')
    expect(records[0].rank).toBeNull()
  })

  it('skips records without numeric crewId', () => {
    const records = transformF8Crew([{ ...rawCrew, crewId: 'bad' }], 'F8')
    expect(records).toHaveLength(0)
  })
})
```

- [ ] **Step 6: Implement transform-crew.ts**

```typescript
// connector-server/src/transform/f8/db/transform-crew.ts
import type { CrewImportRecord } from '../../../types/import-jobs.js'

const RANK_MAP: Record<string, string> = {
  captain: 'CA', 'first officer': 'FO', fo: 'FO', ca: 'CA',
  purser: 'PS', 'flight attendant': 'FA', fa: 'FA',
}

const RANK_PRIORITY: Record<string, number> = { CA: 2, FO: 1, PS: 2, FA: 1 }

const normalizeRank = (r: string): string | null => {
  const key = r.toLowerCase().trim()
  return RANK_MAP[key] ?? (r.length <= 4 ? r.toUpperCase() : null)
}

const isActive = (effDt: string, expDt: string): boolean => {
  const now = Date.now()
  return new Date(effDt).getTime() <= now && new Date(expDt).getTime() > now
}

interface F8Rank { rank: string; effDt: string; expDt: string }
interface F8Base { base: string; isPrimary: boolean }
interface F8CrewRaw {
  crewId: number | string
  firstName: string
  middleName?: string
  lastName: string
  bases?: F8Base[]
  ranks?: F8Rank[]
  division?: string
}

export function transformF8Crew(raw: unknown[], filiale: string): CrewImportRecord[] {
  const records: CrewImportRecord[] = []

  for (const item of raw) {
    const c = item as F8CrewRaw
    if (typeof c.crewId !== 'number') continue

    const activeRanks = (c.ranks ?? [])
      .filter(r => isActive(r.effDt, r.expDt))
      .map(r => ({ ...r, normalized: normalizeRank(r.rank) }))
      .filter(r => r.normalized !== null)
      .sort((a, b) => (RANK_PRIORITY[b.normalized!] ?? 0) - (RANK_PRIORITY[a.normalized!] ?? 0))

    const primaryBase =
      c.bases?.find(b => b.isPrimary)?.base ?? c.bases?.[0]?.base ?? null

    records.push({
      crewId: String(c.crewId),
      firstName: c.firstName ?? '',
      lastName: c.lastName ?? '',
      division: c.division ?? 'P',
      base: primaryBase,
      rank: activeRanks[0]?.normalized ?? null,
      filiale,
    })
  }

  return records
}
```

- [ ] **Step 7: Run crew test — expect PASS**

```bash
cd connector-server && npx vitest run src/__tests__/unit/transform-crew-db.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add connector-server/src/transform/f8/db/transform-flight.ts \
        connector-server/src/transform/f8/db/transform-crew.ts \
        connector-server/src/__tests__/unit/transform-flight-db.test.ts \
        connector-server/src/__tests__/unit/transform-crew-db.test.ts
git commit -m "feat(connector): add F8 DB-ready flight and crew transforms"
```

---

## Task 6: F8 DB Transform — Pairing

**Files:**
- Create: `connector-server/src/transform/f8/db/transform-pairing.ts`
- Create: `connector-server/src/__tests__/unit/transform-pairing-db.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// connector-server/src/__tests__/unit/transform-pairing-db.test.ts
import { describe, it, expect } from 'vitest'
import { transformF8Pairings } from '../../transform/f8/db/transform-pairing.js'

const rawPairing = {
  pairingId: 'P001',
  pairingDt: '2026-06-01T00:00:00Z',
  label: 'P001-F8',
  base: 'PEK',
  fleet: 'B738',
  durationDays: 2,
  pairingDutyList: [{
    actStrDtUtc: '2026-06-01T06:00:00Z',
    actEndDtUtc: '2026-06-01T18:00:00Z',
    strArp: 'PEK',
    endArp: 'PVG',
    pairingDutyNodes: [
      { node: 'CHECKIN', startUtc: '2026-06-01T06:00:00Z', endUtc: '2026-06-01T06:30:00Z', airport: 'PEK' },
      { node: 'CHECKOUT', startUtc: '2026-06-01T17:30:00Z', endUtc: '2026-06-01T18:00:00Z', airport: 'PVG' },
    ],
    pairingDutySegments: [{
      fltId: '12345',
      depArp: 'PEK',
      arvArp: 'PVG',
      fltNum: 'F8001',
      fleet: 'B738',
      airline: 'F8',
      assignment: 'FLY',
      actStrDtUtc: '2026-06-01T08:00:00Z',
      actEndDtUtc: '2026-06-01T10:00:00Z',
    }],
  }],
}

describe('transformF8Pairings', () => {
  it('maps pairing to PairingImportRecord', () => {
    const records = transformF8Pairings([rawPairing])
    expect(records).toHaveLength(1)
    const p = records[0]
    expect(p.interfaceId).toBe('P001')
    expect(p.pairingLabel).toBe('P001-F8')
    expect(p.base).toBe('PEK')
    expect(p.fleet).toBe('B738')
    expect(p.source).toBe('F8')
    expect(p.duties).toHaveLength(1)
    expect(p.duties[0].dutySeq).toBe(1)
    expect(p.duties[0].segments).toHaveLength(1)
    expect(p.duties[0].segments[0].interfaceFltId).toBe('12345')
  })

  it('expands CHECKIN/CHECKOUT to PICKUP/BRIEF/DEBRIEF/DROPOFF nodes', () => {
    const records = transformF8Pairings([rawPairing])
    const duty = records[0].duties[0]
    expect(duty.pickupStartUtc).toBeDefined()
    expect(duty.briefEndUtc).toBeDefined()
    expect(duty.debriefStartUtc).toBeDefined()
    expect(duty.dropoffEndUtc).toBeDefined()
  })

  it('assigns node fields to first segment for pickup/brief', () => {
    const records = transformF8Pairings([rawPairing])
    const duty = records[0].duties[0]
    expect(duty.pickupStartUtc).toBeDefined()
    expect(duty.debriefStartUtc).toBeDefined()  // single-seg duty gets all nodes
  })

  it('skips pairings with no pairingId', () => {
    const records = transformF8Pairings([{ ...rawPairing, pairingId: '' }])
    expect(records).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd connector-server && npx vitest run src/__tests__/unit/transform-pairing-db.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement transform-pairing.ts**

```typescript
// connector-server/src/transform/f8/db/transform-pairing.ts
import type { PairingImportRecord, PairingDutyRecord, PairingSegmentRecord } from '../../../types/import-jobs.js'

const toIso = (v: string | null | undefined): string =>
  v ? new Date(v.replace(' ', 'T')).toISOString() : ''

const nodeKind = (n: Record<string, unknown>): string =>
  String(n['node'] ?? '').replace('_', '').trim().toLowerCase()

const getDutyList = (raw: Record<string, unknown>): Record<string, unknown>[] =>
  (raw['pairingDutyList'] as Record<string, unknown>[] | undefined)
  ?? (raw['pairingDuties'] as Record<string, unknown>[] | undefined)
  ?? (raw['duties'] as Record<string, unknown>[] | undefined)
  ?? []

const getDutyNodes = (duty: Record<string, unknown>): Record<string, unknown>[] =>
  (duty['pairingDutyNodes'] as Record<string, unknown>[] | undefined)
  ?? (duty['nodes'] as Record<string, unknown>[] | undefined)
  ?? []

const getDutySegments = (duty: Record<string, unknown>): Record<string, unknown>[] =>
  (duty['pairingDutySegments'] as Record<string, unknown>[] | undefined)
  ?? (duty['segments'] as Record<string, unknown>[] | undefined)
  ?? []

const getNodeTime = (n: Record<string, unknown>, key: string): string =>
  toIso((n[key] ?? n[key.replace('Utc', '_utc')]) as string)

function expandNodes(
  rawNodes: Record<string, unknown>[],
  strArp: string,
  endArp: string,
): Partial<PairingDutyRecord> {
  const kinds = new Set(rawNodes.map(nodeKind))
  let nodes = rawNodes

  if (kinds.has('checkin') && kinds.has('checkout') && !kinds.has('pickup')) {
    const ci = rawNodes.find(n => nodeKind(n) === 'checkin')!
    const co = rawNodes.find(n => nodeKind(n) === 'checkout')!
    const ciAp = String(ci['airport'] ?? ci['arp'] ?? strArp)
    const coAp = String(co['airport'] ?? co['arp'] ?? endArp)
    const ciS = getNodeTime(ci, 'startUtc')
    const ciE = getNodeTime(ci, 'endUtc')
    const coS = getNodeTime(co, 'startUtc')
    const coE = getNodeTime(co, 'endUtc')
    nodes = [
      { node: 'PICKUP', airport: ciAp, startUtc: ciS, endUtc: ciS },
      { node: 'BRIEF', airport: ciAp, startUtc: ciS, endUtc: ciE },
      { node: 'DEBRIEF', airport: coAp, startUtc: coS, endUtc: coE },
      { node: 'DROPOFF', airport: coAp, startUtc: coE, endUtc: coE },
    ]
  }

  const result: Partial<PairingDutyRecord> = {}
  for (const n of nodes) {
    const k = nodeKind(n)
    const s = getNodeTime(n, 'startUtc')
    const e = getNodeTime(n, 'endUtc')
    if (k === 'pickup') { result.pickupStartUtc = s; result.pickupEndUtc = e }
    if (k === 'brief') { result.briefStartUtc = s; result.briefEndUtc = e }
    if (k === 'debrief') { result.debriefStartUtc = s; result.debriefEndUtc = e }
    if (k === 'dropoff') { result.dropoffStartUtc = s; result.dropoffEndUtc = e }
  }
  return result
}

export function transformF8Pairings(raw: unknown[]): PairingImportRecord[] {
  const records: PairingImportRecord[] = []

  for (const item of raw) {
    const p = item as Record<string, unknown>
    const interfaceId = String(p['pairingId'] ?? '')
    if (!interfaceId) continue

    const rawDuties = getDutyList(p)
    const duties: PairingDutyRecord[] = []
    let totalSegs = 0

    rawDuties.forEach((duty, di) => {
      const rawSegs = getDutySegments(duty)
      const rawNodes = getDutyNodes(duty)
      const strArp = String(duty['strArp'] ?? duty['str_arp'] ?? '')
      const endArp = String(duty['endArp'] ?? duty['arrArp'] ?? duty['end_arp'] ?? '')
      const dutyActStr = toIso((duty['actStrDtUtc'] ?? duty['act_str_dt_utc']) as string)
      const dutyActEnd = toIso((duty['actEndDtUtc'] ?? duty['act_end_dt_utc']) as string)

      const nodeFields = expandNodes(rawNodes, strArp, endArp)

      const segments: PairingSegmentRecord[] = rawSegs.map((seg, si) => ({
        segSeq: si + 1,
        interfaceFltId: seg['fltId'] ? String(seg['fltId']) : null,
        fltNum: String(seg['fltNum'] ?? ''),
        airline: String(seg['airline'] ?? 'F8'),
        depArp: String(seg['depArp'] ?? ''),
        arvArp: String(seg['arvArp'] ?? ''),
        fleet: String(seg['fleet'] ?? ''),
        schStrDtUtc: toIso((seg['actStrDtUtc'] ?? seg['stdUtc']) as string) || dutyActStr,
        schEndDtUtc: toIso((seg['actEndDtUtc'] ?? seg['staUtc']) as string) || dutyActEnd,
        actStrDtUtc: toIso((seg['actStrDtUtc']) as string) || dutyActStr,
        actEndDtUtc: toIso((seg['actEndDtUtc']) as string) || dutyActEnd,
        segAssignment: String(seg['assignment'] ?? 'FLY'),
      }))

      totalSegs += segments.length

      duties.push({
        dutySeq: di + 1,
        strArp,
        endArp,
        schStrDtUtc: dutyActStr,
        schEndDtUtc: dutyActEnd,
        actStrDtUtc: dutyActStr,
        actEndDtUtc: dutyActEnd,
        ...nodeFields,
        segments,
      })
    })

    const schStr = duties[0]?.actStrDtUtc ?? toIso(p['pairingDt'] as string)
    const schEnd = duties[duties.length - 1]?.actEndDtUtc ?? schStr
    const tafbMs = schStr && schEnd
      ? new Date(schEnd).getTime() - new Date(schStr).getTime()
      : 0

    records.push({
      interfaceId,
      pairingLabel: (p['label'] as string) ?? null,
      base: String(p['base'] ?? ''),
      fleet: String(p['fleet'] ?? ''),
      division: 'P',
      assignmentGroup: 'FLY',
      assignment: 'FLY',
      schStrDtUtc: schStr,
      schEndDtUtc: schEnd,
      actStrDtUtc: schStr,
      actEndDtUtc: schEnd,
      durationDays: Number(p['durationDays'] ?? 1),
      tafb: Math.round(tafbMs / 60000),
      source: 'F8',
      duties,
    })
  }

  return records
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd connector-server && npx vitest run src/__tests__/unit/transform-pairing-db.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add connector-server/src/transform/f8/db/transform-pairing.ts \
        connector-server/src/__tests__/unit/transform-pairing-db.test.ts
git commit -m "feat(connector): add F8 DB-ready pairing transform with node expansion"
```

---

## Task 7: F8 DB Transform — Roster (with crew filter)

**Files:**
- Create: `connector-server/src/transform/f8/db/transform-roster.ts`
- Create: `connector-server/src/__tests__/unit/transform-roster-db.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// connector-server/src/__tests__/unit/transform-roster-db.test.ts
import { describe, it, expect } from 'vitest'
import { transformF8RosterFlight } from '../../transform/f8/db/transform-roster.js'

const rawRecord = {
  pairingId: 1001,
  rosterId: 42,
  fltType: '',
  pairingStrUtc: '2026-06-01T06:00:00Z',
  crew: {
    crewId: '12345',
    actingRank: 'Captain',
    activeRank: 'Captain',
    division: 'P',
    seqOrder: 1,
    assignmentGroup: 'FLY',
  },
}

const crewSet = new Set(['12345', '99999'])

describe('transformF8RosterFlight', () => {
  it('maps valid record to RosterFlightRecord', () => {
    const { records, rejected } = transformF8RosterFlight([rawRecord], crewSet, 'F8')
    expect(records).toHaveLength(1)
    const r = records[0]
    expect(r.crewId).toBe('12345')
    expect(r.pairingInterfaceId).toBe('1001')
    expect(r.actingRank).toBe('CA')
    expect(r.source).toBe('F8')
    expect(rejected).toHaveLength(0)
  })

  it('filters out records where crew_id not in Set', () => {
    const { records, rejected } = transformF8RosterFlight([rawRecord], new Set(['other']), 'F8')
    expect(records).toHaveLength(0)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toMatch(/crew_id not found/)
  })

  it('skips records where pairingId === 0 (SIM/GND)', () => {
    const { records, rejected } = transformF8RosterFlight([{ ...rawRecord, pairingId: 0 }], crewSet, 'F8')
    expect(records).toHaveLength(0)
    expect(rejected).toHaveLength(0) // skip, not reject
  })

  it('deduplicates by (pairingId, crewId)', () => {
    const { records } = transformF8RosterFlight([rawRecord, rawRecord], crewSet, 'F8')
    expect(records).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd connector-server && npx vitest run src/__tests__/unit/transform-roster-db.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement transform-roster.ts**

```typescript
// connector-server/src/transform/f8/db/transform-roster.ts
import type { RosterFlightRecord } from '../../../types/import-jobs.js'
import type { RejectionRecord } from '../../utils/rejection-store.js'

const RANK_MAP: Record<string, string> = {
  captain: 'CA', 'first officer': 'FO', fo: 'FO', ca: 'CA',
  purser: 'PS', 'flight attendant': 'FA', fa: 'FA',
}

const normalizeRank = (r: string): string => {
  const key = r.toLowerCase().trim()
  return RANK_MAP[key] ?? (r.length <= 4 ? r.toUpperCase() : r)
}

const mapFltType = (fltType: string): string => {
  if (fltType === 'Transport') return 'DHD'
  if (fltType === 'Simulator') return 'SIM'
  if (!fltType) return 'FLY'
  return 'GND'
}

export interface TransformRosterResult {
  records: RosterFlightRecord[]
  rejected: RejectionRecord[]
}

export function transformF8RosterFlight(
  raw: unknown[],
  crewSet: Set<string>,
  filiale: string,
): TransformRosterResult {
  const records: RosterFlightRecord[] = []
  const rejected: RejectionRecord[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    const r = item as Record<string, unknown>
    const pairingId = Number(r['pairingId'] ?? 0)

    // Skip SIM/GND records (pairingId === 0)
    if (pairingId === 0) continue

    const crewData = (r['crew'] ?? {}) as Record<string, unknown>
    const crewId = String(crewData['crewId'] ?? r['rosterId'] ?? '').slice(0, 30)

    if (!crewSet.has(crewId)) {
      rejected.push({
        crewId,
        reason: `crew_id not found in DB`,
        raw: item,
      })
      continue
    }

    const key = `${pairingId}:${crewId}`
    if (seen.has(key)) continue
    seen.add(key)

    records.push({
      crewId,
      pairingInterfaceId: String(pairingId),
      actingRank: normalizeRank(String(crewData['actingRank'] ?? '')),
      activeRank: normalizeRank(String(crewData['activeRank'] ?? '')),
      division: String(crewData['division'] ?? 'P').slice(0, 1),
      seqOrder: Math.min(Number(crewData['seqOrder'] ?? 0), 999),
      assignment: mapFltType(String(r['fltType'] ?? '')),
      assignmentGroup: String(crewData['assignmentGroup'] ?? 'FLY').slice(0, 20),
      base: '',
      source: 'F8',
    })
  }

  return { records, rejected }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd connector-server && npx vitest run src/__tests__/unit/transform-roster-db.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add connector-server/src/transform/f8/db/transform-roster.ts \
        connector-server/src/__tests__/unit/transform-roster-db.test.ts
git commit -m "feat(connector): add F8 DB-ready roster transform with crew set filtering"
```

---

## Task 8: F8 Sync Orchestrator + Bull Board Plugin

**Files:**
- Create: `connector-server/src/services/sync/f8/f8-sync-orchestrator.ts`
- Create: `connector-server/src/plugins/bull-board.ts`

- [ ] **Step 1: Install Bull Board**

```bash
cd connector-server && npm install @bull-board/api @bull-board/fastify
```

Verify both are MIT licensed:
```bash
cat node_modules/@bull-board/api/package.json | grep '"license"'
cat node_modules/@bull-board/fastify/package.json | grep '"license"'
```

Expected: `"MIT"` for both.

- [ ] **Step 2: Create Bull Board plugin**

```typescript
// connector-server/src/plugins/bull-board.ts
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js'
import { FastifyAdapter } from '@bull-board/fastify'

export default fp(async (fastify: FastifyInstance) => {
  const serverAdapter = new FastifyAdapter()

  createBullBoard({
    queues: [
      new BullMQAdapter(fastify.queues.flightInbound),
      new BullMQAdapter(fastify.queues.crewInbound),
      new BullMQAdapter(fastify.queues.pairingInbound),
      new BullMQAdapter(fastify.queues.rosterInbound),
      new BullMQAdapter(fastify.queues.rosterOutbound),
      new BullMQAdapter(fastify.queues.pollTrigger),
    ],
    serverAdapter,
  })

  serverAdapter.setBasePath('/admin/queues')
  await fastify.register(serverAdapter.registerPlugin(), { prefix: '/admin/queues' })

  fastify.log.info('Bull Board registered at /admin/queues')
})
```

- [ ] **Step 3: Create F8 sync orchestrator**

```typescript
// connector-server/src/services/sync/f8/f8-sync-orchestrator.ts
import { FlowProducer } from 'bullmq'
import { randomUUID } from 'node:crypto'
import { format, addDays } from 'date-fns'
import type { FastifyInstance } from 'fastify'
import type { ConnectorConfig } from '../../../models/index.js'
import { queueBaseOptions } from '../../../plugins/bullmq.js'
import { connectorConfigService } from '../../connector/index.js'
import { f8TokenAuth } from '../../auth/index.js'
import { chunkDateRange, fetchWithChunkRetry } from '../../../utils/chunk-date.js'
import { saveRawJson } from '../../../utils/json-store.js'
import { saveRejectedRecords } from '../../../utils/rejection-store.js'
import { loadCrewSet } from '../../../utils/db-lookup.js'
import { transformF8Flights } from '../../../transform/f8/db/transform-flight.js'
import { transformF8Crew } from '../../../transform/f8/db/transform-crew.js'
import { transformF8Pairings } from '../../../transform/f8/db/transform-pairing.js'
import { transformF8RosterFlight } from '../../../transform/f8/db/transform-roster.js'
import type {
  FlightImportJob, CrewImportJob, PairingImportJob, RosterImportJob,
} from '../../../types/import-jobs.js'

const DEFAULT_CHUNK_DAYS = 10
const BATCH_SIZE = 200

async function f8Post(url: string, token: string, body: Record<string, unknown>): Promise<unknown[]> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', AuthorizationToken: token },
    body: JSON.stringify(body),
  })
  if (res.status === 401 || res.status === 403) {
    const err = new Error(`F8 auth error: ${res.status}`)
    ;(err as { status?: number }).status = res.status
    throw err
  }
  if (!res.ok) {
    const err = new Error(`F8 HTTP ${res.status}: ${url}`)
    ;(err as { status?: number }).status = res.status
    throw err
  }
  const data = await res.json() as { data?: unknown[]; list?: unknown[] } | unknown[]
  return Array.isArray(data) ? data : ((data as Record<string, unknown>)['data'] as unknown[] ?? (data as Record<string, unknown>)['list'] as unknown[] ?? [])
}

async function getToken(config: ConnectorConfig): Promise<string> {
  return f8TokenAuth.getAccessToken(config)
}

async function fetchChunked(
  config: ConnectorConfig,
  url: string,
  startDt: string,
  endDt: string,
  filiale: string,
  entity: string,
): Promise<unknown[]> {
  const ep = config.endpointConfig as { chunkDays?: number }
  const chunkDays = ep.chunkDays ?? DEFAULT_CHUNK_DAYS
  const chunks = chunkDateRange(startDt, endDt, chunkDays)
  const all: unknown[] = []

  for (const chunk of chunks) {
    const token = await getToken(config)
    const fetchFn = async (s: string, e: string) => {
      return f8Post(url, token, { startDt: s, endDt: e })
    }
    const raw = await fetchWithChunkRetry(fetchFn, chunk.startDt, chunk.endDt, chunkDays)
    await saveRawJson(entity, filiale, chunk.startDt, chunk.endDt, raw)
    all.push(...raw)
  }

  return all
}

function computeRange(config: ConnectorConfig): { startDt: string; endDt: string } {
  const ep = config.endpointConfig as { pollBodyDays?: number }
  const days = ep.pollBodyDays ?? 30
  const today = new Date()
  return {
    startDt: format(today, 'yyyy-MM-dd'),
    endDt: format(addDays(today, days), 'yyyy-MM-dd'),
  }
}

export async function runF8ImportSync(
  fastify: FastifyInstance,
  config: ConnectorConfig,
  overrideStartDt?: string,
  overrideEndDt?: string,
): Promise<{ syncId: string; filteredCount: number; rejectionFile: string | null }> {
  const syncId = randomUUID()
  const filiale = config.connectorCode.split('-')[0].toUpperCase() // 'f8' → 'F8'
  const { startDt, endDt } = overrideStartDt
    ? { startDt: overrideStartDt, endDt: overrideEndDt! }
    : computeRange(config)

  const ep = config.endpointConfig as {
    url: string; rosterGroundUrl?: string; chunkDays?: number
  }

  const flow = new FlowProducer(queueBaseOptions)
  const meta = { syncId, filiale, syncRangeDt: [startDt, endDt] as [string, string] }

  // Always fetch flight data (needed for FK resolution in pairing_segment)
  const flightConfig = await connectorConfigService.getConfig(`${filiale.toLowerCase()}-flight`)
  const flightUrl = flightConfig?.endpointConfig ? (flightConfig.endpointConfig as { url: string }).url : ep.url
  const rawFlights = await fetchChunked(flightConfig ?? config, flightUrl, startDt, endDt, filiale, 'flight')
  const flightRecords = transformF8Flights(rawFlights, filiale)
  const flightJob: FlightImportJob = { ...meta, records: flightRecords }

  if (config.connectorCode === `${filiale.toLowerCase()}-crew`) {
    // Crew-only sync
    const rawCrew = await fetchChunked(config, ep.url, startDt, endDt, filiale, 'crew')
    const crewRecords = transformF8Crew(rawCrew, filiale)
    const crewJob: CrewImportJob = { ...meta, records: crewRecords }
    await fastify.queues.crewInbound.add('crew-import', crewJob, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    })
    return { syncId, filteredCount: 0, rejectionFile: null }
  }

  // Fetch pairing data
  const pairingConfig = await connectorConfigService.getConfig(`${filiale.toLowerCase()}-pairing`)
  const pairingUrl = pairingConfig ? (pairingConfig.endpointConfig as { url: string }).url : ep.url
  const rawPairings = await fetchChunked(pairingConfig ?? config, pairingUrl, startDt, endDt, filiale, 'pairing')
  const pairingRecords = transformF8Pairings(rawPairings)

  // Chunk pairings into batches of BATCH_SIZE
  const pairingBatches: PairingImportJob[] = []
  for (let i = 0; i < pairingRecords.length; i += BATCH_SIZE) {
    pairingBatches.push({ ...meta, pairings: pairingRecords.slice(i, i + BATCH_SIZE) })
  }
  if (pairingBatches.length === 0) pairingBatches.push({ ...meta, pairings: [] })

  const jobOpts = {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 30_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  }

  if (config.connectorCode === `${filiale.toLowerCase()}-pairing`) {
    // flight → pairing chain
    await flow.add({
      name: 'pairing-import',
      queueName: 'connector.pairing.inbound',
      data: pairingBatches[0],
      opts: jobOpts,
      children: [{ name: 'flight-import', queueName: 'connector.flight.inbound', data: flightJob, opts: jobOpts }],
    })
    return { syncId, filteredCount: 0, rejectionFile: null }
  }

  // roster-flight sync: fetch roster + filter by crew set
  const crewSet = await loadCrewSet(fastify.db)
  const rawRoster = await fetchChunked(config, ep.url, startDt, endDt, filiale, 'roster_flight')
  const { records: rosterRecords, rejected } = transformF8RosterFlight(rawRoster, crewSet, filiale)

  let rejectionFile: string | null = null
  if (rejected.length > 0) {
    rejectionFile = await saveRejectedRecords('roster_flight', filiale, rejected)
  }

  const rosterJob: RosterImportJob = {
    ...meta,
    records: rosterRecords,
    filteredCount: rejected.length,
    rejectionFile,
  }

  // flight → pairing → roster chain
  await flow.add({
    name: 'roster-import',
    queueName: 'connector.roster.inbound',
    data: rosterJob,
    opts: jobOpts,
    children: [{
      name: 'pairing-import',
      queueName: 'connector.pairing.inbound',
      data: pairingBatches[0],
      opts: jobOpts,
      children: [{ name: 'flight-import', queueName: 'connector.flight.inbound', data: flightJob, opts: jobOpts }],
    }],
  })

  await flow.close()
  return { syncId, filteredCount: rejected.length, rejectionFile }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd connector-server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add connector-server/src/services/sync/f8/f8-sync-orchestrator.ts \
        connector-server/src/plugins/bull-board.ts \
        connector-server/package.json connector-server/package-lock.json
git commit -m "feat(connector): add F8 sync orchestrator and Bull Board UI plugin"
```

---

## Task 9: connector-server Wiring

**Files:**
- Modify: `connector-server/src/workers/poll-inbound-worker.ts`
- Modify: `connector-server/src/index.ts`

- [ ] **Step 1: Add f8_import branch to poll-inbound-worker.ts**

In `poll-inbound-worker.ts`, after loading config (line 44), add a branch before the existing handler:

```typescript
// After: const config = await connectorConfigService.getConfig(connectorCode)
// After the enabled check, add:

if (config.protocol === 'f8_import') {
  const { runF8ImportSync } = await import('../services/sync/f8/f8-sync-orchestrator.js')
  const startTime = Date.now()
  let syncResult = { syncId: '', filteredCount: 0, rejectionFile: null as string | null }
  let status: 'success' | 'fail' = 'success'
  let errorMessage: string | undefined

  try {
    syncResult = await runF8ImportSync(fastify, config)
  } catch (err) {
    status = 'fail'
    errorMessage = err instanceof Error ? err.message : String(err)
    fastify.log.error({ connectorCode, error: errorMessage }, 'F8 import sync failed')
  }

  const logEntry: NewConnectorLog = {
    connectorId: config.id,
    direction: 'inbound',
    status,
    recordsIn: 0,
    recordsOut: 0,
    errorMessage,
    durationMs: Date.now() - startTime,
    syncId: syncResult.syncId || undefined,
    filteredCount: syncResult.filteredCount,
    rejectionFile: syncResult.rejectionFile ?? undefined,
  }
  await fastify.db.insert(connectorLog).values(logEntry)

  fastify.log.info({ connectorCode, syncId: syncResult.syncId, status }, 'F8 import completed')
  return
}

// Existing handler continues below...
```

- [ ] **Step 2: Register bull-board plugin in index.ts**

In `connector-server/src/index.ts`, after `await fastify.register(swaggerPlugin)`:

```typescript
import bullBoardPlugin from './plugins/bull-board.js'

// After swaggerPlugin registration:
await fastify.register(bullBoardPlugin)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd connector-server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Start connector-server and verify Bull Board is accessible**

```bash
cd connector-server && npm run dev &
sleep 3
curl -s http://localhost:3004/admin/queues | grep -i "bull" | head -3
```

Expected: HTML response mentioning Bull Board.

Kill the dev server: `kill %1`

- [ ] **Step 5: Commit**

```bash
git add connector-server/src/workers/poll-inbound-worker.ts \
        connector-server/src/index.ts
git commit -m "feat(connector): wire F8 import protocol branch and Bull Board UI"
```

---

## Task 10: live-server — flight-inbound-worker + crew-inbound-worker

**Files:**
- Create: `live-server/src/workers/flight-inbound-worker.ts`
- Create: `live-server/src/workers/crew-inbound-worker.ts`
- Create: `live-server/src/__tests__/unit/flight-inbound-worker.test.ts`
- Create: `live-server/src/__tests__/unit/crew-inbound-worker.test.ts`

- [ ] **Step 1: Write flight-inbound-worker test**

```typescript
// live-server/src/__tests__/unit/flight-inbound-worker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = {
  execute: vi.fn(),
}

describe('processFlightImportJob', () => {
  beforeEach(() => { mockDb.execute.mockReset() })

  it('upserts a flight record and returns imported count', async () => {
    mockDb.execute.mockResolvedValue({ rows: [{ id: 1 }] })
    const { processFlightImportJob } = await import('../../workers/flight-inbound-worker.js')
    const job = {
      syncId: 'test-sync',
      filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      records: [{
        interfaceFltId: '12345', fltNum: '12345', airline: 'F8',
        fltDt: '2026-06-01', depArp: 'PEK', arvArp: 'PVG',
        fleet: 'B738', tailNum: null,
        schStrDtUtc: '2026-06-01T08:00:00.000Z',
        schEndDtUtc: '2026-06-01T10:00:00.000Z',
        actStrDtUtc: '2026-06-01T08:00:00.000Z',
        actEndDtUtc: '2026-06-01T10:00:00.000Z',
        blkMin: 120, fltType: 'PAX', fltSts: null,
      }],
    }

    const result = await processFlightImportJob(job, mockDb as never)
    expect(result.imported).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(mockDb.execute).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd live-server && npx vitest run src/__tests__/unit/flight-inbound-worker.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement flight-inbound-worker.ts**

```typescript
// live-server/src/workers/flight-inbound-worker.ts
import { Worker } from 'bullmq'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { env } from '../config/index.js'
import { parseRedisUrl } from '../utils/redis-url.js'
import type { FlightImportJob, FlightImportRecord } from '../../src/types/import-jobs.js'

// Re-export the type from connector-server via a local copy
// (In practice, share via a local types file or copy the interface here)

interface FlightJobResult {
  entity: string
  imported: number
  errors: Array<{ id: string; reason: string }>
}

export async function processFlightImportJob(
  job: FlightImportJob,
  db: NodePgDatabase<Record<string, never>>,
): Promise<FlightJobResult> {
  const result: FlightJobResult = { entity: 'flight', imported: 0, errors: [] }

  for (const rec of job.records) {
    try {
      await db.execute(sql`SAVEPOINT flt_sp`)
      await db.execute(sql`
        INSERT INTO flight (
          flt_dt, flt_num, dep_arp, arv_arp,
          sch_dep_dt_utc, sch_arv_dt_utc,
          act_dep_dt_utc, act_arv_dt_utc,
          act_dep_arp, act_arv_arp,
          fleet, register, airline,
          blk_min, flt_type, interface_flt_id,
          flight_flag, voyage_status, is_locked,
          sch_id, vr_add, is_deleted, manual_comp_flag,
          created_by, updated_by
        ) VALUES (
          ${rec.fltDt}, ${rec.fltNum}, ${rec.depArp}, ${rec.arvArp},
          ${rec.schStrDtUtc}, ${rec.schEndDtUtc},
          ${rec.actStrDtUtc}, ${rec.actEndDtUtc},
          ${rec.depArp}, ${rec.arvArp},
          ${rec.fleet}, ${rec.tailNum}, ${rec.airline},
          ${rec.blkMin}, ${rec.fltType}, ${rec.interfaceFltId},
          'A', 0, 0, 0, 0, 0, 0,
          'F8_IMPORT', 'F8_IMPORT'
        )
        ON CONFLICT (interface_flt_id, flt_dt) WHERE interface_flt_id IS NOT NULL
        DO UPDATE SET
          flt_num       = EXCLUDED.flt_num,
          dep_arp       = EXCLUDED.dep_arp,
          arv_arp       = EXCLUDED.arv_arp,
          sch_dep_dt_utc = EXCLUDED.sch_dep_dt_utc,
          sch_arv_dt_utc = EXCLUDED.sch_arv_dt_utc,
          act_dep_dt_utc = EXCLUDED.act_dep_dt_utc,
          act_arv_dt_utc = EXCLUDED.act_arv_dt_utc,
          fleet          = EXCLUDED.fleet,
          register       = EXCLUDED.register,
          blk_min        = EXCLUDED.blk_min,
          updated_by     = 'F8_IMPORT',
          updated_at     = now()
      `)
      await db.execute(sql`RELEASE SAVEPOINT flt_sp`)
      result.imported++
    } catch (err) {
      await db.execute(sql`ROLLBACK TO SAVEPOINT flt_sp`)
      result.errors.push({
        id: rec.interfaceFltId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}

export function startFlightInboundWorker(fastify: FastifyInstance): Worker {
  const redisOpts = parseRedisUrl(env.REDIS_URL)

  const worker = new Worker(
    'connector.flight.inbound',
    async (job) => {
      fastify.log.info({ syncId: job.data.syncId }, 'flight-inbound-worker processing')
      return processFlightImportJob(job.data as FlightImportJob, fastify.db)
    },
    { connection: redisOpts, concurrency: 1 },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, error: err.message }, 'flight-inbound job failed')
  })

  return worker
}
```

- [ ] **Step 4: Create shared import-jobs types in live-server**

```bash
# Copy the types file from connector-server to live-server
cp connector-server/src/types/import-jobs.ts live-server/src/types/import-jobs.ts
```

Update the import path in flight-inbound-worker.ts to use the local copy:
```typescript
import type { FlightImportJob } from '../types/import-jobs.js'
```

- [ ] **Step 5: Run flight test — expect PASS**

```bash
cd live-server && npx vitest run src/__tests__/unit/flight-inbound-worker.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write crew-inbound-worker test**

```typescript
// live-server/src/__tests__/unit/crew-inbound-worker.test.ts
import { describe, it, expect, vi } from 'vitest'

const mockDb = { execute: vi.fn().mockResolvedValue({ rows: [] }) }

describe('processCrewImportJob', () => {
  it('upserts crew records', async () => {
    const { processCrewImportJob } = await import('../../workers/crew-inbound-worker.js')
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      records: [{
        crewId: 'C001', firstName: 'Zhang', lastName: 'San',
        division: 'P', base: 'PEK', rank: 'CA', filiale: 'F8',
      }],
    }
    const result = await processCrewImportJob(job, mockDb as never)
    expect(result.imported).toBe(1)
    expect(result.errors).toHaveLength(0)
  })
})
```

- [ ] **Step 7: Implement crew-inbound-worker.ts**

```typescript
// live-server/src/workers/crew-inbound-worker.ts
import { Worker } from 'bullmq'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { env } from '../config/index.js'
import { parseRedisUrl } from '../utils/redis-url.js'
import type { CrewImportJob } from '../types/import-jobs.js'

interface CrewJobResult {
  entity: string
  imported: number
  errors: Array<{ id: string; reason: string }>
}

export async function processCrewImportJob(
  job: CrewImportJob,
  db: NodePgDatabase<Record<string, never>>,
): Promise<CrewJobResult> {
  const result: CrewJobResult = { entity: 'crew', imported: 0, errors: [] }

  for (const rec of job.records) {
    try {
      await db.execute(sql`SAVEPOINT crew_sp`)
      await db.execute(sql`
        INSERT INTO crew (
          crew_id, first_name, last_name,
          division, filiale,
          gender, empl_dt,
          created_by, updated_by
        ) VALUES (
          ${rec.crewId}, ${rec.firstName}, ${rec.lastName},
          ${rec.division}, ${rec.filiale},
          'U', now(),
          'F8_IMPORT', 'F8_IMPORT'
        )
        ON CONFLICT (crew_id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name  = EXCLUDED.last_name,
          division   = EXCLUDED.division,
          updated_by = 'F8_IMPORT',
          updated_at = now()
      `)
      await db.execute(sql`RELEASE SAVEPOINT crew_sp`)
      result.imported++
    } catch (err) {
      await db.execute(sql`ROLLBACK TO SAVEPOINT crew_sp`)
      result.errors.push({ id: rec.crewId, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  return result
}

export function startCrewInboundWorker(fastify: FastifyInstance): Worker {
  const worker = new Worker(
    'connector.crew.inbound',
    async (job) => {
      fastify.log.info({ syncId: job.data.syncId }, 'crew-inbound-worker processing')
      return processCrewImportJob(job.data as CrewImportJob, fastify.db)
    },
    { connection: parseRedisUrl(env.REDIS_URL), concurrency: 1 },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, error: err.message }, 'crew-inbound job failed')
  })

  return worker
}
```

- [ ] **Step 8: Run crew test — expect PASS**

```bash
cd live-server && npx vitest run src/__tests__/unit/crew-inbound-worker.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add live-server/src/workers/flight-inbound-worker.ts \
        live-server/src/workers/crew-inbound-worker.ts \
        live-server/src/types/import-jobs.ts \
        live-server/src/__tests__/unit/flight-inbound-worker.test.ts \
        live-server/src/__tests__/unit/crew-inbound-worker.test.ts
git commit -m "feat(live-server): add flight and crew inbound workers"
```

---

## Task 11: live-server — pairing-inbound-worker

**Files:**
- Create: `live-server/src/workers/pairing-inbound-worker.ts`
- Create: `live-server/src/__tests__/unit/pairing-inbound-worker.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// live-server/src/__tests__/unit/pairing-inbound-worker.test.ts
import { describe, it, expect, vi } from 'vitest'

const mockDb = { execute: vi.fn() }

describe('processPairingImportJob', () => {
  it('upserts pairing and its segments', async () => {
    // First call: SAVEPOINT; second: INSERT pairing RETURNING id; third+: segment upserts; last: RELEASE
    mockDb.execute
      .mockResolvedValueOnce({})                       // SAVEPOINT
      .mockResolvedValueOnce({ rows: [{ id: 101 }] }) // INSERT pairing RETURNING id
      .mockResolvedValueOnce({})                       // DELETE old segments
      .mockResolvedValueOnce({})                       // INSERT segment
      .mockResolvedValueOnce({})                       // RELEASE SAVEPOINT

    const { processPairingImportJob } = await import('../../workers/pairing-inbound-worker.js')
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      pairings: [{
        interfaceId: 'P001', pairingLabel: 'P001', base: 'PEK', fleet: 'B738',
        division: 'P', assignmentGroup: 'FLY', assignment: 'FLY',
        schStrDtUtc: '2026-06-01T06:00:00Z', schEndDtUtc: '2026-06-01T18:00:00Z',
        actStrDtUtc: '2026-06-01T06:00:00Z', actEndDtUtc: '2026-06-01T18:00:00Z',
        durationDays: 1, tafb: 720, source: 'F8',
        duties: [{
          dutySeq: 1, strArp: 'PEK', endArp: 'PVG',
          schStrDtUtc: '2026-06-01T06:00:00Z', schEndDtUtc: '2026-06-01T18:00:00Z',
          actStrDtUtc: '2026-06-01T06:00:00Z', actEndDtUtc: '2026-06-01T18:00:00Z',
          segments: [{
            segSeq: 1, interfaceFltId: '12345', fltNum: 'F8001', airline: 'F8',
            depArp: 'PEK', arvArp: 'PVG', fleet: 'B738',
            schStrDtUtc: '2026-06-01T08:00:00Z', schEndDtUtc: '2026-06-01T10:00:00Z',
            actStrDtUtc: '2026-06-01T08:00:00Z', actEndDtUtc: '2026-06-01T10:00:00Z',
            segAssignment: 'FLY',
          }],
        }],
      }],
    }

    const result = await processPairingImportJob(job, mockDb as never)
    expect(result.imported).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it('rolls back savepoint on error, continues next pairing', async () => {
    mockDb.execute
      .mockResolvedValueOnce({})       // SAVEPOINT
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce({})       // ROLLBACK TO SAVEPOINT

    const { processPairingImportJob } = await import('../../workers/pairing-inbound-worker.js')
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      pairings: [{ interfaceId: 'P001', pairingLabel: null, base: 'PEK', fleet: 'B738',
        division: 'P', assignmentGroup: 'FLY', assignment: 'FLY',
        schStrDtUtc: '2026-06-01T06:00:00Z', schEndDtUtc: '2026-06-01T18:00:00Z',
        actStrDtUtc: '2026-06-01T06:00:00Z', actEndDtUtc: '2026-06-01T18:00:00Z',
        durationDays: 1, tafb: 0, source: 'F8', duties: [] }],
    }
    const result = await processPairingImportJob(job, mockDb as never)
    expect(result.imported).toBe(0)
    expect(result.errors).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd live-server && npx vitest run src/__tests__/unit/pairing-inbound-worker.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement pairing-inbound-worker.ts**

```typescript
// live-server/src/workers/pairing-inbound-worker.ts
import { Worker } from 'bullmq'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { env } from '../config/index.js'
import { parseRedisUrl } from '../utils/redis-url.js'
import type { PairingImportJob, PairingImportRecord, PairingDutyRecord } from '../types/import-jobs.js'

interface PairingJobResult {
  entity: string
  imported: number
  errors: Array<{ id: string; reason: string }>
}

export async function processPairingImportJob(
  job: PairingImportJob,
  db: NodePgDatabase<Record<string, never>>,
): Promise<PairingJobResult> {
  const result: PairingJobResult = { entity: 'pairing', imported: 0, errors: [] }

  // Build flight FK lookup: interfaceFltId → flight.id
  const fltRows = await db.execute(sql`
    SELECT id, interface_flt_id FROM flight WHERE interface_flt_id IS NOT NULL
  `)
  const fltMap = new Map<string, number>(
    (fltRows.rows as Array<{ id: number; interface_flt_id: string }>)
      .map(r => [r.interface_flt_id, r.id])
  )

  for (const pairing of job.pairings) {
    try {
      await db.execute(sql`SAVEPOINT pair_sp`)

      // Upsert pairing — returns id for segment FK
      const pairingRes = await db.execute(sql`
        INSERT INTO pairing (
          pairing_label, filiale, division, base, fleet,
          assignment_group, assignment,
          sch_str_dt_utc, sch_end_dt_utc,
          act_str_dt_utc, act_end_dt_utc,
          duration_days, tafb,
          duty_count, seg_count,
          source, interface_id,
          created_by, updated_by
        ) VALUES (
          ${pairing.pairingLabel}, ${job.filiale}, ${pairing.division},
          ${pairing.base}, ${pairing.fleet},
          ${pairing.assignmentGroup}, ${pairing.assignment},
          ${pairing.schStrDtUtc}, ${pairing.schEndDtUtc},
          ${pairing.actStrDtUtc}, ${pairing.actEndDtUtc},
          ${pairing.durationDays}, ${pairing.tafb},
          ${pairing.duties.length},
          ${pairing.duties.reduce((sum, d) => sum + d.segments.length, 0)},
          ${pairing.source}, ${pairing.interfaceId},
          'F8_IMPORT', 'F8_IMPORT'
        )
        ON CONFLICT (interface_id) WHERE interface_id IS NOT NULL
        DO UPDATE SET
          pairing_label  = EXCLUDED.pairing_label,
          base           = EXCLUDED.base,
          fleet          = EXCLUDED.fleet,
          sch_str_dt_utc = EXCLUDED.sch_str_dt_utc,
          sch_end_dt_utc = EXCLUDED.sch_end_dt_utc,
          act_str_dt_utc = EXCLUDED.act_str_dt_utc,
          act_end_dt_utc = EXCLUDED.act_end_dt_utc,
          duration_days  = EXCLUDED.duration_days,
          duty_count     = EXCLUDED.duty_count,
          seg_count      = EXCLUDED.seg_count,
          updated_by     = 'F8_IMPORT',
          updated_at     = now()
        RETURNING id
      `)

      const pairingId = (pairingRes.rows as Array<{ id: number }>)[0].id

      // Delete old segments then re-insert (segments carry FK to flight)
      await db.execute(sql`DELETE FROM pairing_segment WHERE pairing_id = ${pairingId}`)

      for (const duty of pairing.duties) {
        for (const seg of duty.segments) {
          const fltId = seg.interfaceFltId ? (fltMap.get(seg.interfaceFltId) ?? null) : null
          await db.execute(sql`
            INSERT INTO pairing_segment (
              pairing_id, duty_seq, seg_seq,
              duty_str_arp, duty_end_arp,
              duty_sch_str_dt_utc, duty_sch_end_dt_utc,
              duty_act_str_dt_utc, duty_act_end_dt_utc,
              duty_acc_state,
              pickup_start_utc, pickup_end_utc,
              brief_start_utc, brief_end_utc,
              debrief_start_utc, debrief_end_utc,
              dropoff_start_utc, dropoff_end_utc,
              flt_id, flt_num, airline, dep_arp, arv_arp, fleet_seg,
              sch_str_dt_utc, sch_end_dt_utc,
              act_str_dt_utc, act_end_dt_utc,
              seg_assignment,
              created_by, updated_by
            ) VALUES (
              ${pairingId}, ${duty.dutySeq}, ${seg.segSeq},
              ${duty.strArp}, ${duty.endArp},
              ${duty.schStrDtUtc}, ${duty.schEndDtUtc},
              ${duty.actStrDtUtc}, ${duty.actEndDtUtc},
              'D',
              ${duty.pickupStartUtc ?? null}, ${duty.pickupEndUtc ?? null},
              ${duty.briefStartUtc ?? null}, ${duty.briefEndUtc ?? null},
              ${duty.debriefStartUtc ?? null}, ${duty.debriefEndUtc ?? null},
              ${duty.dropoffStartUtc ?? null}, ${duty.dropoffEndUtc ?? null},
              ${fltId}, ${seg.fltNum}, ${seg.airline},
              ${seg.depArp}, ${seg.arvArp}, ${seg.fleet},
              ${seg.schStrDtUtc}, ${seg.schEndDtUtc},
              ${seg.actStrDtUtc}, ${seg.actEndDtUtc},
              ${seg.segAssignment},
              'F8_IMPORT', 'F8_IMPORT'
            )
          `)
        }
      }

      await db.execute(sql`RELEASE SAVEPOINT pair_sp`)
      result.imported++
    } catch (err) {
      await db.execute(sql`ROLLBACK TO SAVEPOINT pair_sp`)
      result.errors.push({
        id: pairing.interfaceId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}

export function startPairingInboundWorker(fastify: FastifyInstance): Worker {
  const worker = new Worker(
    'connector.pairing.inbound',
    async (job) => {
      fastify.log.info({ syncId: job.data.syncId }, 'pairing-inbound-worker processing')
      return processPairingImportJob(job.data as PairingImportJob, fastify.db)
    },
    { connection: parseRedisUrl(env.REDIS_URL), concurrency: 1 },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, error: err.message }, 'pairing-inbound job failed')
  })

  return worker
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd live-server && npx vitest run src/__tests__/unit/pairing-inbound-worker.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/workers/pairing-inbound-worker.ts \
        live-server/src/__tests__/unit/pairing-inbound-worker.test.ts
git commit -m "feat(live-server): add pairing inbound worker with savepoint isolation"
```

---

## Task 12: live-server — roster-inbound-worker

**Files:**
- Create: `live-server/src/workers/roster-inbound-worker.ts`
- Create: `live-server/src/__tests__/unit/roster-inbound-worker.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// live-server/src/__tests__/unit/roster-inbound-worker.test.ts
import { describe, it, expect, vi } from 'vitest'

const mockDb = { execute: vi.fn() }

describe('processRosterImportJob', () => {
  beforeEach(() => { mockDb.execute.mockReset() })

  it('expands roster records to per-segment rows', async () => {
    // pairing lookup returns id=101; segment query returns 2 rows; delete+inserts succeed
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: 101, interface_id: 'P001' }] })  // pairing lookup
      .mockResolvedValueOnce({ rows: [
        { id: 201, duty_seq: 1, seg_seq: 1, flt_id: 10 },
        { id: 202, duty_seq: 1, seg_seq: 2, flt_id: 20 },
      ]})                    // segment query
      .mockResolvedValueOnce({}) // SAVEPOINT
      .mockResolvedValueOnce({}) // DELETE roster_flight
      .mockResolvedValueOnce({}) // INSERT roster row 1
      .mockResolvedValueOnce({}) // INSERT roster row 2
      .mockResolvedValueOnce({}) // RELEASE SAVEPOINT

    const { processRosterImportJob } = await import('../../workers/roster-inbound-worker.js')
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      filteredCount: 0, rejectionFile: null,
      records: [{
        crewId: 'C001', pairingInterfaceId: 'P001',
        actingRank: 'CA', activeRank: 'CA', division: 'P',
        seqOrder: 1, assignment: 'FLY', assignmentGroup: 'FLY',
        base: 'PEK', source: 'F8',
      }],
    }

    const result = await processRosterImportJob(job, mockDb as never)
    expect(result.imported).toBe(2) // 2 segments → 2 roster_flight rows
    expect(result.errors).toHaveLength(0)
  })

  it('emits a warning when pairing not found, skips record', async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] }) // empty pairing lookup

    const { processRosterImportJob } = await import('../../workers/roster-inbound-worker.js')
    const job = {
      syncId: 'test', filiale: 'F8',
      syncRangeDt: ['2026-06-01', '2026-06-30'] as [string, string],
      filteredCount: 0, rejectionFile: null,
      records: [{
        crewId: 'C001', pairingInterfaceId: 'UNKNOWN',
        actingRank: 'CA', activeRank: 'CA', division: 'P',
        seqOrder: 1, assignment: 'FLY', assignmentGroup: 'FLY',
        base: 'PEK', source: 'F8',
      }],
    }

    const result = await processRosterImportJob(job, mockDb as never)
    expect(result.imported).toBe(0)
    expect(result.warnings).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd live-server && npx vitest run src/__tests__/unit/roster-inbound-worker.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement roster-inbound-worker.ts**

```typescript
// live-server/src/workers/roster-inbound-worker.ts
import { Worker } from 'bullmq'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { env } from '../config/index.js'
import { parseRedisUrl } from '../utils/redis-url.js'
import type { RosterImportJob, RosterFlightRecord } from '../types/import-jobs.js'

interface RosterJobResult {
  entity: string
  imported: number
  warnings: string[]
  errors: Array<{ id: string; reason: string }>
}

export async function processRosterImportJob(
  job: RosterImportJob,
  db: NodePgDatabase<Record<string, never>>,
): Promise<RosterJobResult> {
  const result: RosterJobResult = { entity: 'roster_flight', imported: 0, warnings: [], errors: [] }

  // Build pairing FK lookup: interface_id → pairing.id
  const pairingRows = await db.execute(sql`
    SELECT id, interface_id FROM pairing WHERE interface_id IS NOT NULL
  `)
  const pairingMap = new Map<string, number>(
    (pairingRows.rows as Array<{ id: number; interface_id: string }>)
      .map(r => [r.interface_id, r.id])
  )

  // Build pairing_segment lookup: pairing_id → segments ordered by duty_seq, seg_seq
  const allPairingIds = [...new Set(
    job.records
      .map(r => pairingMap.get(r.pairingInterfaceId))
      .filter((id): id is number => id !== undefined)
  )]

  const segMap = new Map<number, Array<{ id: number; duty_seq: number; seg_seq: number; flt_id: number | null }>>()
  if (allPairingIds.length > 0) {
    const segRows = await db.execute(sql`
      SELECT id, pairing_id, duty_seq, seg_seq, flt_id
      FROM pairing_segment
      WHERE pairing_id = ANY(${allPairingIds})
      ORDER BY pairing_id, duty_seq, seg_seq
    `)
    for (const row of segRows.rows as Array<{ id: number; pairing_id: number; duty_seq: number; seg_seq: number; flt_id: number | null }>) {
      if (!segMap.has(row.pairing_id)) segMap.set(row.pairing_id, [])
      segMap.get(row.pairing_id)!.push(row)
    }
  }

  for (const rec of job.records) {
    const pairingId = pairingMap.get(rec.pairingInterfaceId)
    if (!pairingId) {
      result.warnings.push(`pairing ${rec.pairingInterfaceId} not found, skipping crew ${rec.crewId}`)
      continue
    }

    const segments = segMap.get(pairingId) ?? []
    if (segments.length === 0) {
      result.warnings.push(`pairing ${rec.pairingInterfaceId} (id=${pairingId}) has no segments`)
      continue
    }

    try {
      await db.execute(sql`SAVEPOINT roster_sp`)

      // Delete existing roster_flight for this (pairing, crew) then re-insert per segment
      await db.execute(sql`
        DELETE FROM roster_flight
        WHERE pairing_id = ${pairingId} AND crew_id = ${rec.crewId}
      `)

      for (const seg of segments) {
        await db.execute(sql`
          INSERT INTO roster_flight (
            crew_id, pairing_id, ver, base,
            assignment_group, assignment,
            acting_rank, active_rank,
            division, seq_order,
            flt_id, duty_seq, seg_seq,
            source, is_requested, is_deleted, is_swapped,
            created_by, updated_by
          ) VALUES (
            ${rec.crewId}, ${pairingId}, 1, ${rec.base},
            ${rec.assignmentGroup}, ${rec.assignment},
            ${rec.actingRank}, ${rec.activeRank},
            ${rec.division}, ${rec.seqOrder},
            ${seg.flt_id}, ${seg.duty_seq}, ${seg.seg_seq},
            ${rec.source}, 0, 0, 0,
            'F8_IMPORT', 'F8_IMPORT'
          )
        `)
        result.imported++
      }

      await db.execute(sql`RELEASE SAVEPOINT roster_sp`)
    } catch (err) {
      await db.execute(sql`ROLLBACK TO SAVEPOINT roster_sp`)
      result.errors.push({
        id: `${rec.pairingInterfaceId}:${rec.crewId}`,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}

export function startRosterInboundWorker(fastify: FastifyInstance): Worker {
  const worker = new Worker(
    'connector.roster.inbound',
    async (job) => {
      fastify.log.info({ syncId: job.data.syncId }, 'roster-inbound-worker processing')
      return processRosterImportJob(job.data as RosterImportJob, fastify.db)
    },
    { connection: parseRedisUrl(env.REDIS_URL), concurrency: 1 },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, error: err.message }, 'roster-inbound job failed')
  })

  return worker
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd live-server && npx vitest run src/__tests__/unit/roster-inbound-worker.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/workers/roster-inbound-worker.ts \
        live-server/src/__tests__/unit/roster-inbound-worker.test.ts
git commit -m "feat(live-server): add roster inbound worker with per-segment expansion"
```

---

## Task 13: live-server index.ts Wiring + Final Verification

**Files:**
- Modify: `live-server/src/workers/index.ts` (if it exists, else update index.ts directly)
- Modify: `live-server/src/index.ts`

- [ ] **Step 1: Check workers/index.ts**

```bash
cat live-server/src/workers/index.ts 2>/dev/null || echo "no index"
```

If it doesn't exist, create it:

```typescript
// live-server/src/workers/index.ts
export { startCheckPairingWorker } from './check-pairing-worker.js'
export { startCheckRosterWorker } from './check-roster-worker.js'
export { startBatchCrewWorker } from './batch-crew-worker.js'
export { startBatchOrchestratorWorker } from './batch-orchestrator-worker.js'
export { startFlightInboundWorker } from './flight-inbound-worker.js'
export { startCrewInboundWorker } from './crew-inbound-worker.js'
export { startPairingInboundWorker } from './pairing-inbound-worker.js'
export { startRosterInboundWorker } from './roster-inbound-worker.js'
```

- [ ] **Step 2: Add inbound worker imports to live-server/src/index.ts**

Add these imports near the existing worker imports (around line 24):

```typescript
import { startFlightInboundWorker } from './workers/flight-inbound-worker.js'
import { startCrewInboundWorker } from './workers/crew-inbound-worker.js'
import { startPairingInboundWorker } from './workers/pairing-inbound-worker.js'
import { startRosterInboundWorker } from './workers/roster-inbound-worker.js'
```

Add after line 75 (after `startBatchOrchestratorWorker(server)`):

```typescript
startFlightInboundWorker(server)
startCrewInboundWorker(server)
startPairingInboundWorker(server)
startRosterInboundWorker(server)
server.log.info('F8 inbound workers started')
```

- [ ] **Step 3: TypeScript compile check — both services**

```bash
cd connector-server && npx tsc --noEmit && echo "connector-server: OK"
cd ../live-server && npx tsc --noEmit && echo "live-server: OK"
```

Expected: both print "OK".

- [ ] **Step 4: Run all unit tests**

```bash
cd connector-server && npx vitest run
cd ../live-server && npx vitest run
```

Expected: all tests pass with no failures.

- [ ] **Step 5: Smoke test — start both services**

```bash
# Terminal 1
cd live-server && npm run dev &
sleep 3
curl -s http://localhost:3000/api/health | grep '"code":200'

# Terminal 2
cd connector-server && npm run dev &
sleep 3
curl -s http://localhost:3004/health | grep -i ok
curl -s http://localhost:3004/admin/queues | head -5
```

Expected: health checks pass; Bull Board returns HTML.

Kill dev servers: `kill %1 %2`

- [ ] **Step 6: Final commit**

```bash
git add live-server/src/index.ts live-server/src/workers/index.ts
git commit -m "feat(live-server): wire F8 inbound workers into server startup"
```

---

## Self-Review Checklist

| Requirement | Covered in |
|---|---|
| Chunk-based fetch with 10→5→3 day retry on 5xx | Task 3 (chunk-date.ts) |
| Raw JSON saved atomically to disk | Task 3 (json-store.ts) |
| Crew Set preloaded once (no per-record queries) | Task 4 (db-lookup.ts) |
| Rejected records saved to rejection-store | Tasks 7, 8 |
| Flight transform: blkMin computed, act defaults to sch | Task 5 |
| Pairing: CHECKIN/CHECKOUT → 4 canonical nodes | Task 6 |
| Roster: pairingId=0 skipped, duplicate (pairing,crew) deduped | Task 7 |
| FlowProducer: flight→pairing→roster ordered chain | Task 8 |
| Crew job independent (no FlowProducer chain) | Task 8 |
| Bull Board at /admin/queues | Tasks 8, 9 |
| connector_log: syncId, filteredCount, rejectionFile | Tasks 1, 2, 9 |
| Unique indexes for flight(interface_flt_id,flt_dt) and pairing(interface_id) | Task 1 |
| Savepoint isolation per record in all live-server workers | Tasks 10, 11, 12 |
| Flight worker: upsert on (interface_flt_id, flt_dt) | Task 10 |
| Pairing worker: upsert on interface_id + delete/re-insert segments | Task 11 |
| Roster worker: FK lookup pairingMap + segMap + per-segment rows | Task 12 |
| Dictionary seed for CONNECTOR_SYNC cron config | Task 1 |
