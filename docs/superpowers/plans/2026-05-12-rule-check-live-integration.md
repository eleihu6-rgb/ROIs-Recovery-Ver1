# Rule Check Live Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist authoritative law-compliance violations to DB via BullMQ workers, serve them through live-server APIs, and display them in Gantt with real-time WebSocket updates.

**Architecture:** Two-level check (Level 1 = per pairing, Level 2 = per crew-month roster window) run by BullMQ workers in live-server. Workers read from DB, call `@rois/rule-engine` for pure computation, upsert results into `rule_check_result_pairing` / `rule_check_result_roster`. Gantt loads authoritative results on mount and merges real-time updates from WebSocket; draft (uncommitted) violations remain session-only in the existing rule-check-store.

**Tech Stack:** live-server (Fastify + BullMQ v5 + pg + @rois/rule-engine), gantt (Zustand + axios + WebSocket)

**Spec:** `docs/superpowers/specs/2026-05-11-rule-check-live-integration-design.md`

---

## File Map

### New files — live-server
| File | Responsibility |
|------|---------------|
| `src/services/rule-check/flight-history.ts` | Rolling window block-minute sums (pure, no DB) |
| `src/services/rule-check/rule-check-data-service.ts` | Load pairing+segments+flights and crew history from DB |
| `src/services/rule-check/rule-check-result-service.ts` | Upsert and query result tables |
| `src/plugins/bullmq.ts` | Declare queues, decorate Fastify |
| `src/workers/check-pairing-worker.ts` | Level-1 realtime worker (`rule:check:pairing`) |
| `src/workers/check-roster-worker.ts` | Level-2 roster worker (`rule:check:roster`) |
| `src/workers/batch-crew-worker.ts` | Batch per-crew worker (`rule:batch:crew-full`) |
| `src/workers/batch-orchestrator-worker.ts` | Batch dispatcher (`rule:check:batch`) |
| `src/routes/rule-check/index.ts` | Route registration |
| `src/routes/rule-check/rule-check-routes.ts` | HTTP handlers |
| `src/__tests__/services/rule-check/flight-history.test.ts` | |
| `src/__tests__/services/rule-check/rule-check-data-service.test.ts` | |
| `src/__tests__/services/rule-check/rule-check-result-service.test.ts` | |
| `src/__tests__/workers/check-pairing-worker.test.ts` | |

### Modified files — live-server
| File | Change |
|------|--------|
| `package.json` | Add `@rois/rule-engine: file:../rule-engine` |
| `src/plugins/websocket.ts` | Add `violation:pairing:updated` and `violation:roster:updated` message types |
| `src/index.ts` | Register bullmq plugin + rule-check routes; start workers |
| `src/routes/roster/roster.ts` | Enqueue `rule:check:pairing` on POST/PUT/DELETE |

### New files — sql
| File | Responsibility |
|------|---------------|
| `sql/schema/04-rule-check-result.sql` | 3 result tables |
| `sql/migration/2026-05-12-rule-check-result-index.sql` | `roster_flight` index for history queries |

### New files — gantt
| File | Responsibility |
|------|---------------|
| `src/services/live-rule-check-api.ts` | Calls live-server `/api/rule-check/*` endpoints |
| `src/hooks/use-rule-check-ws.ts` | Handle `violation:*` WebSocket messages → update store |

### Modified files — gantt
| File | Change |
|------|--------|
| `src/stores/rule-check-store.ts` | Add `authoritative` layer; merge WS updates |
| `src/hooks/use-rule-check.ts` | Load authoritative results on mount |

---

## Task 1: SQL Schema — 3 tables + 1 index

**Files:**
- Create: `sql/schema/04-rule-check-result.sql`
- Create: `sql/migration/2026-05-12-rule-check-result-index.sql`

- [ ] **Step 1: Create `sql/schema/04-rule-check-result.sql`**

```sql
-- rule_check_result_pairing: Level 1 check results per crew × pairing
CREATE TABLE rule_check_result_pairing (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  crew_id          varchar(30)    NOT NULL,
  pairing_id       bigint         NOT NULL REFERENCES pairing(id),
  rule_group_code  varchar(50)    NOT NULL,
  passed_all       boolean        NOT NULL,
  highest_severity smallint       NOT NULL DEFAULT 0,
  check_results    jsonb          NOT NULL DEFAULT '[]',
  calc_results     jsonb          NOT NULL DEFAULT '{}',
  checked_at       timestamptz    NOT NULL DEFAULT now(),
  created_by       varchar(30)    NOT NULL DEFAULT 'system',
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_by       varchar(30)    NOT NULL DEFAULT 'system',
  updated_at       timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (crew_id, pairing_id, rule_group_code)
);
CREATE INDEX idx_rcr_pairing_group ON rule_check_result_pairing (pairing_id, rule_group_code);
CREATE INDEX idx_rcr_crew_group ON rule_check_result_pairing (crew_id, rule_group_code, checked_at);

-- rule_check_result_roster: Level 2 check results per crew × month
CREATE TABLE rule_check_result_roster (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  crew_id          varchar(30)    NOT NULL,
  rule_group_code  varchar(50)    NOT NULL,
  result_month     char(7)        NOT NULL,   -- 'YYYY-MM'
  passed_all       boolean        NOT NULL,
  highest_severity smallint       NOT NULL DEFAULT 0,
  violations       jsonb          NOT NULL DEFAULT '[]',
  calc_summary     jsonb          NOT NULL DEFAULT '{}',
  checked_at       timestamptz    NOT NULL DEFAULT now(),
  created_by       varchar(30)    NOT NULL DEFAULT 'system',
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_by       varchar(30)    NOT NULL DEFAULT 'system',
  updated_at       timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (crew_id, rule_group_code, result_month)
);
CREATE INDEX idx_rcrr_crew_group_month ON rule_check_result_roster (crew_id, rule_group_code, result_month);

-- rule_check_batch_run: progress tracking for bulk checks
CREATE TABLE rule_check_batch_run (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_group_code     varchar(50)    NOT NULL,
  date_from           date           NOT NULL,
  date_to             date           NOT NULL,
  filiale             varchar(6)     NOT NULL,
  reason              varchar(30)    NOT NULL,
  status              varchar(20)    NOT NULL DEFAULT 'pending',
  total_crew          int            NOT NULL DEFAULT 0,
  processed_crew      int            NOT NULL DEFAULT 0,
  total_pairings      int            NOT NULL DEFAULT 0,
  processed_pairings  int            NOT NULL DEFAULT 0,
  started_at          timestamptz,
  completed_at        timestamptz,
  error_summary       jsonb,
  created_by          varchar(30)    NOT NULL,
  created_at          timestamptz    NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Create `sql/migration/2026-05-12-rule-check-result-index.sql`**

```sql
-- Performance index for rolling flight-history queries
-- Partial: only rows that contribute to crew flight-time totals
CREATE INDEX IF NOT EXISTS idx_rf_crew_str_dt
  ON roster_flight (crew_id, sch_str_dt_utc)
  WHERE is_deleted = 0 AND assignment_group IN ('FLT', 'DHD');
```

- [ ] **Step 3: Apply schemas to the database (f8 schema)**

```bash
cd /home/yuan.z/rois/rois-ai
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" \
  -f sql/schema/04-rule-check-result.sql \
  -f sql/migration/2026-05-12-rule-check-result-index.sql
```

Expected: `CREATE TABLE` × 3, `CREATE INDEX` × 5

- [ ] **Step 4: Commit**

```bash
git add sql/schema/04-rule-check-result.sql sql/migration/2026-05-12-rule-check-result-index.sql
git commit -m "feat(sql): add rule_check_result tables and roster_flight history index"
```

---

## Task 2: Install @rois/rule-engine in live-server

**Files:**
- Modify: `live-server/package.json`

- [ ] **Step 1: Build the rule-engine package**

```bash
cd /home/yuan.z/rois/rois-ai/rule-engine
npm run build
```

Expected: `dist/index.js` and `dist/index.d.ts` created

- [ ] **Step 2: Add file dependency in live-server**

In `live-server/package.json`, under `"dependencies"`, add:
```json
"@rois/rule-engine": "file:../rule-engine"
```

- [ ] **Step 3: Install**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npm install
```

Expected: `node_modules/@rois/rule-engine` symlink appears

- [ ] **Step 4: Verify import resolves**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
node -e "import('@rois/rule-engine').then(m => console.log(Object.keys(m)))"
```

Expected output includes: `[ 'RuleEngine', 'RuleLoader', 'RosterEngine', ... ]`

- [ ] **Step 5: Commit**

```bash
git add live-server/package.json live-server/package-lock.json
git commit -m "feat(live-server): add @rois/rule-engine local dependency"
```

---

## Task 3: Flight History Utility

**Files:**
- Create: `live-server/src/services/rule-check/flight-history.ts`
- Create: `live-server/src/__tests__/services/rule-check/flight-history.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// live-server/src/__tests__/services/rule-check/flight-history.test.ts
import { describe, it, expect } from 'vitest'
import { computeWindowSums } from '../../../services/rule-check/flight-history.js'

describe('computeWindowSums', () => {
  const ref = new Date('2026-05-10T08:00:00Z')

  it('returns zeros when flights array is empty', () => {
    const result = computeWindowSums(ref, [])
    expect(result).toEqual({ last24h: 0, last7d: 0, last28d: 0, last90d: 0, last365d: 0 })
  })

  it('counts a flight that ended before ref and started within 24h', () => {
    const flight = {
      stdUtc: new Date('2026-05-09T20:00:00Z'),  // within 24h
      staUtc: new Date('2026-05-09T23:00:00Z'),  // before ref
      blkMin: 180,
    }
    const result = computeWindowSums(ref, [flight])
    expect(result.last24h).toBe(180)
    expect(result.last7d).toBe(180)
    expect(result.last28d).toBe(180)
  })

  it('excludes a flight that started within window but landed after ref', () => {
    const flight = {
      stdUtc: new Date('2026-05-09T20:00:00Z'),
      staUtc: new Date('2026-05-10T09:00:00Z'),  // after ref
      blkMin: 180,
    }
    const result = computeWindowSums(ref, [flight])
    expect(result.last24h).toBe(0)
  })

  it('correctly buckets flights into different windows', () => {
    const flights = [
      { stdUtc: new Date('2026-05-09T10:00:00Z'), staUtc: new Date('2026-05-09T13:00:00Z'), blkMin: 60 },   // within 24h
      { stdUtc: new Date('2026-05-05T10:00:00Z'), staUtc: new Date('2026-05-05T13:00:00Z'), blkMin: 120 },  // within 7d, not 24h
      { stdUtc: new Date('2026-04-15T10:00:00Z'), staUtc: new Date('2026-04-15T13:00:00Z'), blkMin: 90 },   // within 28d, not 7d
    ]
    const result = computeWindowSums(ref, flights)
    expect(result.last24h).toBe(60)
    expect(result.last7d).toBe(60 + 120)
    expect(result.last28d).toBe(60 + 120 + 90)
    expect(result.last365d).toBe(60 + 120 + 90)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npx vitest run src/__tests__/services/rule-check/flight-history.test.ts
```

Expected: FAIL — `computeWindowSums` not found

- [ ] **Step 3: Implement `flight-history.ts`**

```typescript
// live-server/src/services/rule-check/flight-history.ts

export interface FlightRow {
  stdUtc: Date   // sch_str_dt_utc
  staUtc: Date   // sch_end_dt_utc
  blkMin: number // flight.blk_min
}

export interface RecentFlightHours {
  last24h: number   // minutes
  last7d: number
  last28d: number
  last90d: number
  last365d: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Compute rolling block-minute sums for multiple windows.
 * Pure function — no DB access. Expects flights sorted by stdUtc ascending.
 *
 * A flight counts if: staUtc <= referenceTime (landed before pairing starts)
 * Window boundary: stdUtc >= referenceTime - N days
 */
export function computeWindowSums(
  referenceTime: Date,
  flights: FlightRow[],
): RecentFlightHours {
  const refMs = referenceTime.getTime()
  const windows = [1, 7, 28, 90, 365].map((d) => refMs - d * DAY_MS)
  const sums = [0, 0, 0, 0, 0]

  for (const f of flights) {
    if (f.staUtc.getTime() > refMs) break  // flights are sorted; once we hit future we're done
    if (f.staUtc.getTime() > refMs) continue
    const startMs = f.stdUtc.getTime()
    for (let i = 0; i < 5; i++) {
      if (startMs >= windows[i]) sums[i] += f.blkMin
    }
  }

  return {
    last24h: sums[0],
    last7d: sums[1],
    last28d: sums[2],
    last90d: sums[3],
    last365d: sums[4],
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/__tests__/services/rule-check/flight-history.test.ts
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/rule-check/flight-history.ts \
        live-server/src/__tests__/services/rule-check/flight-history.test.ts
git commit -m "feat(live-server): add flight-history rolling window utility"
```

---

## Task 4: Rule Check Data Loading Service

**Files:**
- Create: `live-server/src/services/rule-check/rule-check-data-service.ts`
- Create: `live-server/src/__tests__/services/rule-check/rule-check-data-service.test.ts`

This service loads raw data from DB and converts it into the types `@rois/rule-engine` expects.

- [ ] **Step 1: Write failing tests**

```typescript
// live-server/src/__tests__/services/rule-check/rule-check-data-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ruleCheckDataService } from '../../../services/rule-check/rule-check-data-service.js'

const mockPgPool = {
  query: vi.fn(),
}
const mockFastify = { pgPool: mockPgPool, log: { warn: vi.fn() } } as any

describe('ruleCheckDataService.loadPairingInput', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when pairing not found', async () => {
    mockPgPool.query.mockResolvedValueOnce({ rows: [] })
    const result = await ruleCheckDataService.loadPairingInput(mockFastify, 999)
    expect(result).toBeNull()
  })

  it('builds PairingInput from segment rows', async () => {
    mockPgPool.query.mockResolvedValueOnce({
      rows: [{
        pairing_id: 1, base: 'TPE',
        duty_seq: 1,
        brief_start_utc: new Date('2026-05-01T02:00:00Z'),
        debrief_end_utc: new Date('2026-05-01T10:00:00Z'),
        duty_sch_rest_min: 600,
        seg_seq: 1,
        flt_num: 'F8001',
        dep_arp: 'TPE', arv_arp: 'NRT',
        sch_str_dt_utc: new Date('2026-05-01T02:00:00Z'),
        sch_end_dt_utc: new Date('2026-05-01T05:00:00Z'),
        fleet_seg: 'A320',
        blk_min: 180,
      }],
    })
    const result = await ruleCheckDataService.loadPairingInput(mockFastify, 1)
    expect(result).not.toBeNull()
    expect(result!.pairingId).toBe(1)
    expect(result!.crewBase).toBe('TPE')
    expect(result!.duties).toHaveLength(1)
    expect(result!.duties[0].segments).toHaveLength(1)
    expect(result!.duties[0].segments[0].fltNo).toBe('F8001')
    expect(result!.duties[0].segments[0].blockMinutes).toBe(180)
  })
})

describe('ruleCheckDataService.loadFlightHistory', () => {
  it('returns zero object on empty result', async () => {
    mockPgPool.query.mockResolvedValueOnce({
      rows: [{ last_24h: null, last_7d: null, last_28d: null, last_90d: null, last_365d: null }],
    })
    const result = await ruleCheckDataService.loadFlightHistory(
      mockFastify, 'CA001', new Date('2026-05-10T08:00:00Z'),
    )
    expect(result).toEqual({ last24h: 0, last7d: 0, last28d: 0, last90d: 0, last365d: 0 })
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npx vitest run src/__tests__/services/rule-check/rule-check-data-service.test.ts
```

Expected: FAIL — `ruleCheckDataService` not found

- [ ] **Step 3: Implement `rule-check-data-service.ts`**

```typescript
// live-server/src/services/rule-check/rule-check-data-service.ts
import type { FastifyInstance } from 'fastify'
import type { PairingInput, DutyPeriod, FlightSegment, CrewInfo } from '@rois/rule-engine'
import type { FlightRow, RecentFlightHours } from './flight-history.js'

interface SegmentRow {
  pairing_id: number
  base: string
  duty_seq: number
  brief_start_utc: Date | null
  debrief_end_utc: Date | null
  duty_sch_str_dt_utc: Date
  duty_sch_end_dt_utc: Date
  duty_sch_rest_min: number | null
  seg_seq: number
  flt_num: string
  dep_arp: string
  arv_arp: string
  sch_str_dt_utc: Date
  sch_end_dt_utc: Date
  fleet_seg: string
  blk_min: number
}

export const ruleCheckDataService = {

  /**
   * Load a PairingInput from the DB for use with @rois/rule-engine.
   * Returns null if the pairing is not found or deleted.
   */
  async loadPairingInput(
    fastify: FastifyInstance,
    pairingId: number,
  ): Promise<PairingInput | null> {
    const { rows } = await fastify.pgPool.query<SegmentRow>(`
      SELECT
        p.id         AS pairing_id,
        p.base,
        ps.duty_seq,
        ps.brief_start_utc,
        ps.debrief_end_utc,
        ps.duty_sch_str_dt_utc,
        ps.duty_sch_end_dt_utc,
        ps.duty_sch_rest_min,
        ps.seg_seq,
        ps.flt_num,
        ps.dep_arp,
        ps.arv_arp,
        ps.sch_str_dt_utc,
        ps.sch_end_dt_utc,
        ps.fleet_seg,
        COALESCE(f.blk_min, 0) AS blk_min
      FROM pairing p
      JOIN pairing_segment ps ON ps.pairing_id = p.id AND ps.is_deleted = 0
      LEFT JOIN flight f       ON f.id = ps.flt_id
      WHERE p.id = $1 AND p.is_deleted = 0
      ORDER BY ps.duty_seq, ps.seg_seq
    `, [pairingId])

    if (rows.length === 0) return null

    return buildPairingInput(rows)
  },

  /**
   * Single SQL query for recentFlightHours (realtime check path).
   * referenceTime = first duty's reportUtc.
   */
  async loadFlightHistory(
    fastify: FastifyInstance,
    crewId: string,
    referenceTime: Date,
  ): Promise<RecentFlightHours> {
    const { rows } = await fastify.pgPool.query(`
      SELECT
        SUM(CASE WHEN rf.sch_str_dt_utc >= $2 - INTERVAL '1 day'
                 THEN COALESCE(f.blk_min, 0) ELSE 0 END) AS last_24h,
        SUM(CASE WHEN rf.sch_str_dt_utc >= $2 - INTERVAL '7 days'
                 THEN COALESCE(f.blk_min, 0) ELSE 0 END) AS last_7d,
        SUM(CASE WHEN rf.sch_str_dt_utc >= $2 - INTERVAL '28 days'
                 THEN COALESCE(f.blk_min, 0) ELSE 0 END) AS last_28d,
        SUM(CASE WHEN rf.sch_str_dt_utc >= $2 - INTERVAL '90 days'
                 THEN COALESCE(f.blk_min, 0) ELSE 0 END) AS last_90d,
        SUM(COALESCE(f.blk_min, 0))                       AS last_365d
      FROM roster_flight rf
      JOIN pairing_segment ps ON ps.pairing_id = rf.pairing_id
                              AND ps.duty_seq  = rf.duty_seq
                              AND ps.seg_seq   = rf.seg_seq
                              AND ps.is_deleted = 0
      JOIN flight f            ON f.id = ps.flt_id
      WHERE rf.crew_id          = $1
        AND rf.pairing_id       IS NOT NULL
        AND rf.is_deleted       = 0
        AND rf.assignment_group IN ('FLT', 'DHD')
        AND rf.sch_end_dt_utc  <= $2
        AND rf.sch_str_dt_utc  >= $2 - INTERVAL '365 days'
    `, [crewId, referenceTime])

    const r = rows[0] ?? {}
    return {
      last24h:  Number(r.last_24h  ?? 0),
      last7d:   Number(r.last_7d   ?? 0),
      last28d:  Number(r.last_28d  ?? 0),
      last90d:  Number(r.last_90d  ?? 0),
      last365d: Number(r.last_365d ?? 0),
    }
  },

  /**
   * Batch load: all flight rows for a crew in a window (for in-memory computation).
   * Returns rows sorted by stdUtc ascending — pass directly to computeWindowSums.
   */
  async loadCrewFlightRows(
    fastify: FastifyInstance,
    crewId: string,
    fromUtc: Date,
    toUtc: Date,
  ): Promise<FlightRow[]> {
    const { rows } = await fastify.pgPool.query<{
      std_utc: Date; sta_utc: Date; blk_min: number
    }>(`
      SELECT rf.sch_str_dt_utc AS std_utc,
             rf.sch_end_dt_utc AS sta_utc,
             COALESCE(f.blk_min, 0) AS blk_min
      FROM roster_flight rf
      JOIN pairing_segment ps ON ps.pairing_id = rf.pairing_id
                              AND ps.duty_seq  = rf.duty_seq
                              AND ps.seg_seq   = rf.seg_seq
                              AND ps.is_deleted = 0
      JOIN flight f            ON f.id = ps.flt_id
      WHERE rf.crew_id          = $1
        AND rf.pairing_id       IS NOT NULL
        AND rf.is_deleted       = 0
        AND rf.assignment_group IN ('FLT', 'DHD')
        AND rf.sch_str_dt_utc  >= $2
        AND rf.sch_str_dt_utc  <  $3
      ORDER BY rf.sch_str_dt_utc
    `, [crewId, fromUtc, toUtc])

    return rows.map((r) => ({ stdUtc: r.std_utc, staUtc: r.sta_utc, blkMin: r.blk_min }))
  },

  /**
   * Load distinct (crewId, pairingId) pairs for a filiale + date range.
   * Used by the batch orchestrator to enumerate what needs checking.
   */
  async loadCrewPairingPairs(
    fastify: FastifyInstance,
    filiale: string,
    dateFrom: string,
    dateTo: string,
    offset: number,
    limit: number,
  ): Promise<Array<{ crewId: string; pairingId: number; pairingStart: Date }>> {
    const { rows } = await fastify.pgPool.query<{
      crew_id: string; pairing_id: number; pairing_start: Date
    }>(`
      SELECT DISTINCT rf.crew_id, rf.pairing_id, p.sch_str_dt_utc AS pairing_start
      FROM roster_flight rf
      JOIN pairing p ON p.id = rf.pairing_id AND p.is_deleted = 0
      WHERE rf.pairing_id IS NOT NULL
        AND rf.is_deleted = 0
        AND rf.assignment_group IN ('FLT', 'DHD')
        AND p.filiale = $1
        AND p.sch_str_dt_utc >= $2::date
        AND p.sch_str_dt_utc <  $3::date + INTERVAL '1 day'
      ORDER BY rf.crew_id, p.sch_str_dt_utc
      LIMIT $4 OFFSET $5
    `, [filiale.toUpperCase(), dateFrom, dateTo, limit, offset])

    return rows.map((r) => ({
      crewId: r.crew_id,
      pairingId: r.pairing_id,
      pairingStart: r.pairing_start,
    }))
  },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildPairingInput(rows: SegmentRow[]): PairingInput {
  const first = rows[0]
  const dutiesMap = new Map<number, { segs: SegmentRow[]; restMin: number | null; briefStart: Date | null; debriefEnd: Date | null }>()

  for (const row of rows) {
    const entry = dutiesMap.get(row.duty_seq) ?? {
      segs: [], restMin: null, briefStart: null, debriefEnd: null,
    }
    entry.segs.push(row)
    // brief_start comes from the first segment of the duty
    if (row.seg_seq === 1) {
      entry.briefStart = row.brief_start_utc
    }
    // debrief_end and rest come from the last segment (highest seg_seq)
    entry.debriefEnd = row.debrief_end_utc ?? row.duty_sch_end_dt_utc
    entry.restMin = row.duty_sch_rest_min
    dutiesMap.set(row.duty_seq, entry)
  }

  const duties: DutyPeriod[] = []
  for (const [dutySeq, duty] of [...dutiesMap.entries()].sort(([a], [b]) => a - b)) {
    const reportUtc = duty.briefStart ?? duty.segs[0].duty_sch_str_dt_utc
    const releaseUtc = duty.debriefEnd ?? duty.segs[duty.segs.length - 1].duty_sch_end_dt_utc

    const segments: FlightSegment[] = duty.segs
      .sort((a, b) => a.seg_seq - b.seg_seq)
      .map((s) => ({
        fltNo: s.flt_num,
        depPort: s.dep_arp,
        arrPort: s.arv_arp,
        stdUtc: s.sch_str_dt_utc,
        staUtc: s.sch_end_dt_utc,
        blockMinutes: s.blk_min,
        isNight: isNightFlight(s.sch_str_dt_utc),
        fleetCode: s.fleet_seg,
      }))

    duties.push({
      dutySeq,
      reportUtc,
      releaseUtc,
      segments,
      restAfterMinutes: duty.restMin ?? undefined,
    })
  }

  return { pairingId: first.pairing_id, crewBase: first.base, duties }
}

function isNightFlight(stdUtc: Date): boolean {
  const hour = stdUtc.getUTCHours()
  return hour >= 22 || hour < 6
}
```

- [ ] **Step 4: Run tests**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npx vitest run src/__tests__/services/rule-check/rule-check-data-service.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/rule-check/rule-check-data-service.ts \
        live-server/src/__tests__/services/rule-check/rule-check-data-service.test.ts
git commit -m "feat(live-server): add rule-check data loading service"
```

---

## Task 5: Rule Check Result Persistence Service

**Files:**
- Create: `live-server/src/services/rule-check/rule-check-result-service.ts`
- Create: `live-server/src/__tests__/services/rule-check/rule-check-result-service.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// live-server/src/__tests__/services/rule-check/rule-check-result-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ruleCheckResultService } from '../../../services/rule-check/rule-check-result-service.js'

const mockPool = { query: vi.fn() }
const mockFastify = { pgPool: mockPool } as any

describe('ruleCheckResultService.upsertPairingResult', () => {
  beforeEach(() => vi.clearAllMocks())

  it('executes INSERT ... ON CONFLICT DO UPDATE', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] })
    await ruleCheckResultService.upsertPairingResult(mockFastify, {
      crewId: 'CA001', pairingId: 1, ruleGroupCode: 'ccar121_gantt',
      passedAll: false, highestSeverity: 3,
      checkResults: [{ ruleCode: 'max_fdp', passed: false, severity: 3 }],
      calcResults: { fdp_calculator: { value: 840, unit: 'minutes' } },
    })
    const sql = mockPool.query.mock.calls[0][0] as string
    expect(sql).toContain('ON CONFLICT')
    expect(sql).toContain('rule_check_result_pairing')
  })
})

describe('ruleCheckResultService.queryPairingResults', () => {
  it('returns results keyed by pairingId', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        crew_id: 'CA001', pairing_id: 42, rule_group_code: 'ccar121_gantt',
        passed_all: false, highest_severity: 3,
        check_results: [], calc_results: {}, checked_at: new Date(),
      }],
    })
    const result = await ruleCheckResultService.queryPairingResults(
      mockFastify, ['CA001'], 'ccar121_gantt', '2026-05-01', '2026-05-31',
    )
    expect(result.byPairing['42']).toBeDefined()
    expect(result.missing).toEqual([])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npx vitest run src/__tests__/services/rule-check/rule-check-result-service.test.ts
```

- [ ] **Step 3: Implement `rule-check-result-service.ts`**

```typescript
// live-server/src/services/rule-check/rule-check-result-service.ts
import type { FastifyInstance } from 'fastify'
import type { EngineResult, RosterEngineResult } from '@rois/rule-engine'

interface UpsertPairingInput {
  crewId: string
  pairingId: number
  ruleGroupCode: string
  passedAll: boolean
  highestSeverity: number
  checkResults: unknown[]
  calcResults: unknown
}

interface PairingResultRow {
  crewId: string
  pairingId: number
  ruleGroupCode: string
  passedAll: boolean
  highestSeverity: number
  checkResults: unknown[]
  calcResults: unknown
  checkedAt: Date
}

interface QueryPairingResultsOutput {
  byPairing: Record<string, PairingResultRow>
  missing: Array<{ crewId: string; pairingId: number }>
}

export const ruleCheckResultService = {

  async upsertPairingResult(
    fastify: FastifyInstance,
    input: UpsertPairingInput,
  ): Promise<void> {
    await fastify.pgPool.query(`
      INSERT INTO rule_check_result_pairing
        (crew_id, pairing_id, rule_group_code, passed_all, highest_severity,
         check_results, calc_results, checked_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())
      ON CONFLICT (crew_id, pairing_id, rule_group_code)
      DO UPDATE SET
        passed_all       = EXCLUDED.passed_all,
        highest_severity = EXCLUDED.highest_severity,
        check_results    = EXCLUDED.check_results,
        calc_results     = EXCLUDED.calc_results,
        checked_at       = EXCLUDED.checked_at,
        updated_at       = now()
    `, [
      input.crewId,
      input.pairingId,
      input.ruleGroupCode,
      input.passedAll,
      input.highestSeverity,
      JSON.stringify(input.checkResults),
      JSON.stringify(input.calcResults),
    ])
  },

  async bulkUpsertPairingResults(
    fastify: FastifyInstance,
    rows: UpsertPairingInput[],
  ): Promise<void> {
    const BATCH = 200
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH)
      const placeholders = chunk
        .map((_, j) => `($${j * 7 + 1},$${j * 7 + 2},$${j * 7 + 3},$${j * 7 + 4},$${j * 7 + 5},$${j * 7 + 6},$${j * 7 + 7},now(),now())`)
        .join(',')
      const values = chunk.flatMap((r) => [
        r.crewId, r.pairingId, r.ruleGroupCode,
        r.passedAll, r.highestSeverity,
        JSON.stringify(r.checkResults),
        JSON.stringify(r.calcResults),
      ])
      await fastify.pgPool.query(`
        INSERT INTO rule_check_result_pairing
          (crew_id, pairing_id, rule_group_code, passed_all, highest_severity,
           check_results, calc_results, checked_at, updated_at)
        VALUES ${placeholders}
        ON CONFLICT (crew_id, pairing_id, rule_group_code)
        DO UPDATE SET
          passed_all = EXCLUDED.passed_all, highest_severity = EXCLUDED.highest_severity,
          check_results = EXCLUDED.check_results, calc_results = EXCLUDED.calc_results,
          checked_at = EXCLUDED.checked_at, updated_at = now()
      `, values)
    }
  },

  async upsertRosterResult(
    fastify: FastifyInstance,
    crewId: string,
    ruleGroupCode: string,
    resultMonth: string,
    rosterResult: RosterEngineResult,
  ): Promise<void> {
    const violations = rosterResult.rosterViolations.filter((v) => !v.passed)
    await fastify.pgPool.query(`
      INSERT INTO rule_check_result_roster
        (crew_id, rule_group_code, result_month, passed_all, highest_severity,
         violations, calc_summary, checked_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())
      ON CONFLICT (crew_id, rule_group_code, result_month)
      DO UPDATE SET
        passed_all       = EXCLUDED.passed_all,
        highest_severity = EXCLUDED.highest_severity,
        violations       = EXCLUDED.violations,
        calc_summary     = EXCLUDED.calc_summary,
        checked_at       = EXCLUDED.checked_at,
        updated_at       = now()
    `, [
      crewId, ruleGroupCode, resultMonth,
      rosterResult.passedAll,
      rosterResult.highestSeverity,
      JSON.stringify(violations),
      JSON.stringify({}),
    ])
  },

  async queryPairingResults(
    fastify: FastifyInstance,
    crewIds: string[],
    ruleGroupCode: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<QueryPairingResultsOutput> {
    const { rows } = await fastify.pgPool.query<Record<string, unknown>>(`
      SELECT r.crew_id, r.pairing_id, r.rule_group_code,
             r.passed_all, r.highest_severity,
             r.check_results, r.calc_results, r.checked_at
      FROM rule_check_result_pairing r
      JOIN pairing p ON p.id = r.pairing_id
      WHERE r.crew_id         = ANY($1::text[])
        AND r.rule_group_code = $2
        AND p.sch_str_dt_utc >= $3::date
        AND p.sch_str_dt_utc <  $4::date + INTERVAL '1 day'
    `, [crewIds, ruleGroupCode, dateFrom, dateTo])

    const byPairing: Record<string, PairingResultRow> = {}
    for (const r of rows) {
      byPairing[String(r.pairing_id)] = {
        crewId: r.crew_id as string,
        pairingId: Number(r.pairing_id),
        ruleGroupCode: r.rule_group_code as string,
        passedAll: r.passed_all as boolean,
        highestSeverity: Number(r.highest_severity),
        checkResults: r.check_results as unknown[],
        calcResults: r.calc_results,
        checkedAt: r.checked_at as Date,
      }
    }

    return { byPairing, missing: [] }
  },

  async queryRosterResults(
    fastify: FastifyInstance,
    crewIds: string[],
    ruleGroupCode: string,
    months: string[],
  ): Promise<Record<string, unknown>[]> {
    const { rows } = await fastify.pgPool.query<Record<string, unknown>>(`
      SELECT crew_id, rule_group_code, result_month, passed_all,
             highest_severity, violations, calc_summary, checked_at
      FROM rule_check_result_roster
      WHERE crew_id         = ANY($1::text[])
        AND rule_group_code = $2
        AND result_month    = ANY($3::text[])
    `, [crewIds, ruleGroupCode, months])
    return rows
  },

  async incrementBatchProgress(
    fastify: FastifyInstance,
    batchRunId: number,
    pairingsProcessed: number,
  ): Promise<void> {
    await fastify.pgPool.query(`
      UPDATE rule_check_batch_run
      SET processed_crew      = processed_crew + 1,
          processed_pairings  = processed_pairings + $2,
          updated_at          = now()
      WHERE id = $1
    `, [batchRunId, pairingsProcessed])
  },
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/__tests__/services/rule-check/rule-check-result-service.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/rule-check/rule-check-result-service.ts \
        live-server/src/__tests__/services/rule-check/rule-check-result-service.test.ts
git commit -m "feat(live-server): add rule-check result persistence service"
```

---

## Task 6: BullMQ Plugin

**Files:**
- Create: `live-server/src/plugins/bullmq.ts`

- [ ] **Step 1: Create `plugins/bullmq.ts`**

```typescript
// live-server/src/plugins/bullmq.ts
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import { env } from '../config/index.js'

const parseRedisConnection = (url: string) => {
  try {
    const parsed = new URL(url)
    return {
      host: parsed.hostname || 'localhost',
      port: Number(parsed.port) || 6379,
      password: parsed.password || undefined,
    }
  } catch {
    return { host: 'localhost', port: 6379 }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    realtimeQueue: Queue
    batchQueue: Queue
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const connection = parseRedisConnection(env.REDIS_URL)

  const realtimeQueue = new Queue('rule-check-realtime', {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    },
  })

  const batchQueue = new Queue('rule-check-batch', {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 20 },
    },
  })

  fastify.decorate('realtimeQueue', realtimeQueue)
  fastify.decorate('batchQueue', batchQueue)

  fastify.addHook('onClose', async () => {
    await realtimeQueue.close()
    await batchQueue.close()
    fastify.log.info('BullMQ queues closed')
  })

  fastify.log.info('BullMQ queues initialized')
})
```

- [ ] **Step 2: Add violation types to `plugins/websocket.ts`**

In `live-server/src/plugins/websocket.ts`, extend `WsServerMessage`:

```typescript
export type WsServerMessage =
  | { type: 'lock-acquired'; crewId: string; pairingIds: number[]; userId: string; expiresAt: number }
  | { type: 'lock-released'; crewId: string; pairingIds: number[]; userId: string }
  | { type: 'lock-expired'; crewId: string; userId: string }
  | { type: 'roster-updated'; crewIds: string[] }
  | { type: 'locks-snapshot'; locks: LockSnapshot[] }
  | { type: 'violation:pairing:updated'; crewId: string; pairingId: number; passedAll: boolean; highestSeverity: number; checkResults: unknown[]; isDraft: false }
  | { type: 'violation:roster:updated'; crewId: string; resultMonth: string; passedAll: boolean; highestSeverity: number; violations: unknown[] }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add live-server/src/plugins/bullmq.ts live-server/src/plugins/websocket.ts
git commit -m "feat(live-server): add BullMQ plugin and violation WS message types"
```

---

## Task 7: Workers

**Files:**
- Create: `live-server/src/workers/check-pairing-worker.ts`
- Create: `live-server/src/workers/check-roster-worker.ts`
- Create: `live-server/src/workers/batch-crew-worker.ts`
- Create: `live-server/src/workers/batch-orchestrator-worker.ts`
- Create: `live-server/src/__tests__/workers/check-pairing-worker.test.ts`

- [ ] **Step 1: Write failing test for check-pairing-worker**

```typescript
// live-server/src/__tests__/workers/check-pairing-worker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/rule-check/rule-check-data-service.js', () => ({
  ruleCheckDataService: {
    loadPairingInput: vi.fn(),
    loadFlightHistory: vi.fn(),
  },
}))
vi.mock('../../services/rule-check/rule-check-result-service.js', () => ({
  ruleCheckResultService: { upsertPairingResult: vi.fn() },
}))

import { ruleCheckDataService } from '../../services/rule-check/rule-check-data-service.js'
import { ruleCheckResultService } from '../../services/rule-check/rule-check-result-service.js'
import { processPairingCheckJob } from '../../workers/check-pairing-worker.js'

describe('processPairingCheckJob', () => {
  const mockFastify = {
    pgPool: {},
    wsBroadcastAll: vi.fn(),
    log: { error: vi.fn(), info: vi.fn() },
  } as any

  beforeEach(() => vi.clearAllMocks())

  it('skips and returns early when pairing not found', async () => {
    vi.mocked(ruleCheckDataService.loadPairingInput).mockResolvedValueOnce(null)
    await processPairingCheckJob(
      mockFastify,
      { crewId: 'CA001', pairingId: 999, ruleGroupCode: 'ccar121_gantt' },
      [],
    )
    expect(ruleCheckResultService.upsertPairingResult).not.toHaveBeenCalled()
  })

  it('calls upsert and broadcasts WebSocket on success', async () => {
    vi.mocked(ruleCheckDataService.loadPairingInput).mockResolvedValueOnce({
      pairingId: 1, crewBase: 'TPE',
      duties: [{
        dutySeq: 1,
        reportUtc: new Date('2026-05-01T02:00:00Z'),
        releaseUtc: new Date('2026-05-01T10:00:00Z'),
        segments: [{ fltNo: 'F8001', depPort: 'TPE', arrPort: 'NRT',
          stdUtc: new Date('2026-05-01T02:00:00Z'),
          staUtc: new Date('2026-05-01T05:00:00Z'),
          blockMinutes: 180, isNight: false }],
      }],
    })
    vi.mocked(ruleCheckDataService.loadFlightHistory).mockResolvedValueOnce(
      { last24h: 0, last7d: 0, last28d: 300, last90d: 1200, last365d: 5000 },
    )
    vi.mocked(ruleCheckResultService.upsertPairingResult).mockResolvedValueOnce(undefined)

    await processPairingCheckJob(
      mockFastify,
      { crewId: 'CA001', pairingId: 1, ruleGroupCode: 'ccar121_gantt' },
      [],   // empty rules → passedAll = true
    )

    expect(ruleCheckResultService.upsertPairingResult).toHaveBeenCalledOnce()
    expect(mockFastify.wsBroadcastAll).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'violation:pairing:updated', pairingId: 1 }),
    )
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npx vitest run src/__tests__/workers/check-pairing-worker.test.ts
```

- [ ] **Step 3: Create `workers/check-pairing-worker.ts`**

```typescript
// live-server/src/workers/check-pairing-worker.ts
import type { FastifyInstance } from 'fastify'
import { Worker } from 'bullmq'
import { RuleEngine, RuleLoader } from '@rois/rule-engine'
import type { ResolvedRule, CrewInfo } from '@rois/rule-engine'
import { ruleCheckDataService } from '../services/rule-check/rule-check-data-service.js'
import { ruleCheckResultService } from '../services/rule-check/rule-check-result-service.js'
import { env } from '../config/index.js'

export interface CheckPairingJobData {
  crewId: string
  pairingId: number
  ruleGroupCode: string
  filiale?: string
}

const engine = new RuleEngine()

/** Exported for unit testing without a Worker wrapper */
export async function processPairingCheckJob(
  fastify: FastifyInstance,
  data: CheckPairingJobData,
  rules: ResolvedRule[],
): Promise<void> {
  const { crewId, pairingId, ruleGroupCode, filiale = 'f8' } = data

  const pairing = await ruleCheckDataService.loadPairingInput(fastify, pairingId)
  if (!pairing) return   // deleted pairing — skip silently

  const referenceTime = pairing.duties[0]?.reportUtc ?? new Date()
  const history = await ruleCheckDataService.loadFlightHistory(fastify, crewId, referenceTime)

  const crew: CrewInfo = {
    crewId,
    division: 'P',
    rank: 'CA',
    fleetQuals: [],
    airportQuals: [],
    recentFlightHours: history,
  }

  const checkInput = { ruleGroupCode, pairing, crew }
  const result = engine.checkWithRules(checkInput, rules)

  await ruleCheckResultService.upsertPairingResult(fastify, {
    crewId,
    pairingId,
    ruleGroupCode,
    passedAll: result.passedAll,
    highestSeverity: result.highestSeverity,
    checkResults: result.checkResults,
    calcResults: result.calcResults,
  })

  fastify.wsBroadcastAll(filiale, {
    type: 'violation:pairing:updated',
    crewId,
    pairingId,
    passedAll: result.passedAll,
    highestSeverity: result.highestSeverity,
    checkResults: result.checkResults,
    isDraft: false,
  })
}

/** Start the realtime pairing-check worker. Called once at server startup. */
export function startCheckPairingWorker(
  fastify: FastifyInstance,
  ruleLoader: RuleLoader,
): Worker {
  const { host, port, password } = parseRedisUrl(env.REDIS_URL)

  const worker = new Worker<CheckPairingJobData>(
    'rule-check-realtime',
    async (job) => {
      const rules = await ruleLoader.loadRules(job.data.ruleGroupCode)
      await processPairingCheckJob(fastify, job.data, rules)
    },
    { connection: { host, port, password }, concurrency: 20 },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, err }, 'rule:check:pairing job failed')
  })

  return worker
}

const parseRedisUrl = (url: string) => {
  try {
    const p = new URL(url)
    return { host: p.hostname || 'localhost', port: Number(p.port) || 6379, password: p.password || undefined }
  } catch {
    return { host: 'localhost', port: 6379, password: undefined }
  }
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run src/__tests__/workers/check-pairing-worker.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Create `workers/check-roster-worker.ts`**

```typescript
// live-server/src/workers/check-roster-worker.ts
import type { FastifyInstance } from 'fastify'
import { Worker } from 'bullmq'
import { RosterEngine, RuleLoader } from '@rois/rule-engine'
import type { PairingInput, CrewInfo } from '@rois/rule-engine'
import { ruleCheckDataService } from '../services/rule-check/rule-check-data-service.js'
import { ruleCheckResultService } from '../services/rule-check/rule-check-result-service.js'
import { computeWindowSums } from '../services/rule-check/flight-history.js'
import { env } from '../config/index.js'
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns'

export interface CheckRosterJobData {
  crewId: string
  resultMonth: string   // 'YYYY-MM'
  ruleGroupCode: string
  filiale?: string
}

const rosterEngine = new RosterEngine()

export function startCheckRosterWorker(
  fastify: FastifyInstance,
  ruleLoader: RuleLoader,
): Worker {
  const { host, port, password } = parseRedisUrl(env.REDIS_URL)

  const worker = new Worker<CheckRosterJobData>(
    'rule-check-realtime',
    async (job) => {
      if (job.name !== 'rule:check:roster') return
      const { crewId, resultMonth, ruleGroupCode, filiale = 'f8' } = job.data

      const [year, month] = resultMonth.split('-').map(Number)
      const periodStart = startOfMonth(new Date(year, month - 1))
      const periodEnd = endOfMonth(periodStart)
      const historyFrom = subDays(periodStart, 365)

      // Load all pairings for this crew in the month window
      const pairs = await ruleCheckDataService.loadCrewPairingPairs(
        fastify, filiale, format(periodStart, 'yyyy-MM-dd'), format(periodEnd, 'yyyy-MM-dd'), 0, 1000,
      )
      if (pairs.length === 0) return

      const pairingInputs: PairingInput[] = []
      for (const p of pairs) {
        const pi = await ruleCheckDataService.loadPairingInput(fastify, p.pairingId)
        if (pi) pairingInputs.push(pi)
      }
      if (pairingInputs.length === 0) return

      // Compute period-level history
      const flightRows = await ruleCheckDataService.loadCrewFlightRows(
        fastify, crewId, historyFrom, periodStart,
      )
      const histMinutes = computeWindowSums(periodStart, flightRows)

      const crew: CrewInfo = {
        crewId, division: 'P', rank: 'CA',
        fleetQuals: [], airportQuals: [],
        recentFlightHours: histMinutes,
      }

      const rules = await ruleLoader.loadRules(ruleGroupCode)
      const rosterInput = {
        ruleGroupCode, crew,
        pairings: pairingInputs,
        periodStart, periodEnd,
        historicalFlightMinutes: {
          before28d: histMinutes.last28d,
          before365d: histMinutes.last365d,
          beforeNight30d: 0,
        },
      }

      const result = rosterEngine.checkWithRules(rosterInput, rules)

      await ruleCheckResultService.upsertRosterResult(
        fastify, crewId, ruleGroupCode, resultMonth, result,
      )

      fastify.wsBroadcastAll(filiale, {
        type: 'violation:roster:updated',
        crewId, resultMonth,
        passedAll: result.passedAll,
        highestSeverity: result.highestSeverity,
        violations: result.rosterViolations.filter((v) => !v.passed),
      })
    },
    { connection: { host, port, password }, concurrency: 10 },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, err }, 'rule:check:roster job failed')
  })

  return worker
}

const parseRedisUrl = (url: string) => {
  try {
    const p = new URL(url)
    return { host: p.hostname || 'localhost', port: Number(p.port) || 6379, password: p.password || undefined }
  } catch {
    return { host: 'localhost', port: 6379, password: undefined }
  }
}
```

- [ ] **Step 6: Create `workers/batch-crew-worker.ts`**

```typescript
// live-server/src/workers/batch-crew-worker.ts
import type { FastifyInstance } from 'fastify'
import { Worker } from 'bullmq'
import { RuleEngine, RosterEngine, RuleLoader } from '@rois/rule-engine'
import type { PairingInput, CrewInfo } from '@rois/rule-engine'
import { ruleCheckDataService } from '../services/rule-check/rule-check-data-service.js'
import { ruleCheckResultService } from '../services/rule-check/rule-check-result-service.js'
import { computeWindowSums } from '../services/rule-check/flight-history.js'
import { env } from '../config/index.js'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'

export interface BatchCrewJobData {
  crewId: string
  dateFrom: string
  dateTo: string
  ruleGroupCode: string
  batchRunId: number
  filiale: string
}

const engine = new RuleEngine()
const rosterEngine = new RosterEngine()

export function startBatchCrewWorker(
  fastify: FastifyInstance,
  ruleLoader: RuleLoader,
): Worker {
  const { host, port, password } = parseRedisUrl(env.REDIS_URL)

  const worker = new Worker<BatchCrewJobData>(
    'rule-check-batch',
    async (job) => {
      if (job.name !== 'rule:batch:crew-full') return
      const { crewId, dateFrom, dateTo, ruleGroupCode, batchRunId, filiale } = job.data

      // 1. Load all pairing ids for this crew in range
      const pairs = await ruleCheckDataService.loadCrewPairingPairs(
        fastify, filiale, dateFrom, dateTo, 0, 2000,
      )
      if (pairs.length === 0) {
        await ruleCheckResultService.incrementBatchProgress(fastify, batchRunId, 0)
        return
      }

      // 2. Load full flight history once (365d lookback)
      const earliest = new Date(Math.min(...pairs.map((p) => p.pairingStart.getTime())))
      const historyFrom = subDays(earliest, 365)
      const allFlights = await ruleCheckDataService.loadCrewFlightRows(
        fastify, crewId, historyFrom, new Date(dateTo + 'T23:59:59Z'),
      )

      const rules = await ruleLoader.loadRules(ruleGroupCode)

      const crew: CrewInfo = {
        crewId, division: 'P', rank: 'CA',
        fleetQuals: [], airportQuals: [],
        recentFlightHours: { last24h: 0, last7d: 0, last28d: 0, last90d: 0, last365d: 0 },
      }

      // 3. Level-1: check each pairing with per-pairing history
      const pairingRows = []
      const pairingInputsForRoster: PairingInput[] = []

      for (const p of pairs) {
        const pairing = await ruleCheckDataService.loadPairingInput(fastify, p.pairingId)
        if (!pairing) continue

        const refTime = pairing.duties[0]?.reportUtc ?? p.pairingStart
        const history = computeWindowSums(refTime, allFlights)
        const crewWithHistory: CrewInfo = { ...crew, recentFlightHours: history }
        const result = engine.checkWithRules({ ruleGroupCode, pairing, crew: crewWithHistory }, rules)

        pairingRows.push({
          crewId, pairingId: p.pairingId, ruleGroupCode,
          passedAll: result.passedAll,
          highestSeverity: result.highestSeverity,
          checkResults: result.checkResults,
          calcResults: result.calcResults,
        })
        pairingInputsForRoster.push(pairing)
      }

      await ruleCheckResultService.bulkUpsertPairingResults(fastify, pairingRows)

      // 4. Level-2: check roster per month
      const months = [...new Set(
        pairs.map((p) => format(p.pairingStart, 'yyyy-MM')),
      )]
      for (const resultMonth of months) {
        const [y, m] = resultMonth.split('-').map(Number)
        const periodStart = startOfMonth(new Date(y, m - 1))
        const periodEnd = endOfMonth(periodStart)
        const periodPairings = pairingInputsForRoster.filter((pi) => {
          const start = pi.duties[0]?.reportUtc
          return start && start >= periodStart && start <= periodEnd
        })
        if (periodPairings.length === 0) continue

        const histMs = computeWindowSums(periodStart, allFlights)
        const rosterInput = {
          ruleGroupCode, crew,
          pairings: periodPairings,
          periodStart, periodEnd,
          historicalFlightMinutes: {
            before28d: histMs.last28d,
            before365d: histMs.last365d,
            beforeNight30d: 0,
          },
        }
        const rosterResult = rosterEngine.checkWithRules(rosterInput, rules)
        await ruleCheckResultService.upsertRosterResult(
          fastify, crewId, ruleGroupCode, resultMonth, rosterResult,
        )
      }

      await ruleCheckResultService.incrementBatchProgress(fastify, batchRunId, pairingRows.length)
    },
    { connection: { host, port, password }, concurrency: 10 },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, err }, 'rule:batch:crew-full job failed')
  })

  return worker
}

const parseRedisUrl = (url: string) => {
  try {
    const p = new URL(url)
    return { host: p.hostname || 'localhost', port: Number(p.port) || 6379, password: p.password || undefined }
  } catch {
    return { host: 'localhost', port: 6379, password: undefined }
  }
}
```

- [ ] **Step 7: Create `workers/batch-orchestrator-worker.ts`**

```typescript
// live-server/src/workers/batch-orchestrator-worker.ts
import type { FastifyInstance } from 'fastify'
import { Worker } from 'bullmq'
import { ruleCheckDataService } from '../services/rule-check/rule-check-data-service.js'
import { env } from '../config/index.js'
import { format } from 'date-fns'

export interface BatchJobData {
  ruleGroupCode: string
  dateFrom: string
  dateTo: string
  filiale: string
  reason: string
  batchRunId: number
}

export function startBatchOrchestratorWorker(fastify: FastifyInstance): Worker {
  const { host, port, password } = parseRedisUrl(env.REDIS_URL)

  const worker = new Worker<BatchJobData>(
    'rule-check-batch',
    async (job) => {
      if (job.name !== 'rule:check:batch') return
      const { ruleGroupCode, dateFrom, dateTo, filiale, batchRunId } = job.data

      // Count total and update batch run status
      const { rows: countRows } = await fastify.pgPool.query<{ cnt: string }>(`
        SELECT COUNT(DISTINCT rf.crew_id || ':' || rf.pairing_id::text) AS cnt
        FROM roster_flight rf
        JOIN pairing p ON p.id = rf.pairing_id AND p.is_deleted = 0
        WHERE rf.pairing_id IS NOT NULL AND rf.is_deleted = 0
          AND rf.assignment_group IN ('FLT','DHD')
          AND p.filiale = $1
          AND p.sch_str_dt_utc >= $2::date
          AND p.sch_str_dt_utc <  $3::date + INTERVAL '1 day'
      `, [filiale.toUpperCase(), dateFrom, dateTo])

      const totalPairings = Number(countRows[0]?.cnt ?? 0)

      // Get distinct crew ids
      const { rows: crewRows } = await fastify.pgPool.query<{ crew_id: string }>(`
        SELECT DISTINCT rf.crew_id
        FROM roster_flight rf
        JOIN pairing p ON p.id = rf.pairing_id AND p.is_deleted = 0
        WHERE rf.pairing_id IS NOT NULL AND rf.is_deleted = 0
          AND rf.assignment_group IN ('FLT','DHD')
          AND p.filiale = $1
          AND p.sch_str_dt_utc >= $2::date
          AND p.sch_str_dt_utc <  $3::date + INTERVAL '1 day'
      `, [filiale.toUpperCase(), dateFrom, dateTo])

      await fastify.pgPool.query(`
        UPDATE rule_check_batch_run
        SET status = 'running', total_crew = $2, total_pairings = $3, started_at = now()
        WHERE id = $1
      `, [batchRunId, crewRows.length, totalPairings])

      // Enqueue one crew-full job per crew
      for (const { crew_id: crewId } of crewRows) {
        await fastify.batchQueue.add(
          'rule:batch:crew-full',
          { crewId, dateFrom, dateTo, ruleGroupCode, batchRunId, filiale },
          { jobId: `crew-full:${crewId}:${dateFrom}:${dateTo}:${ruleGroupCode}` },
        )
      }

      fastify.log.info(
        `Batch run ${batchRunId}: queued ${crewRows.length} crew-full jobs (${totalPairings} total pairings)`,
      )
    },
    { connection: { host, port, password }, concurrency: 2 },
  )

  worker.on('completed', async (job) => {
    if (job.name !== 'rule:check:batch') return
    const { batchRunId } = job.data as BatchJobData
    // Mark batch as completed when all crew jobs finish — tracked by progress
    await fastify.pgPool.query(
      `UPDATE rule_check_batch_run SET status = 'completed', completed_at = now() WHERE id = $1
       AND processed_crew >= total_crew`,
      [batchRunId],
    )
  })

  return worker
}

const parseRedisUrl = (url: string) => {
  try {
    const p = new URL(url)
    return { host: p.hostname || 'localhost', port: Number(p.port) || 6379, password: p.password || undefined }
  } catch {
    return { host: 'localhost', port: 6379, password: undefined }
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add live-server/src/workers/ \
        live-server/src/__tests__/workers/
git commit -m "feat(live-server): add BullMQ rule-check workers (pairing, roster, batch)"
```

---

## Task 8: Rule Check API Routes

**Files:**
- Create: `live-server/src/routes/rule-check/index.ts`
- Create: `live-server/src/routes/rule-check/rule-check-routes.ts`

- [ ] **Step 1: Create route registration `routes/rule-check/index.ts`**

```typescript
// live-server/src/routes/rule-check/index.ts
import type { FastifyInstance } from 'fastify'
import ruleCheckRoutes from './rule-check-routes.js'

export default async function ruleCheckRouteGroup(fastify: FastifyInstance) {
  await fastify.register(ruleCheckRoutes, { prefix: '/api/rule-check' })
}
```

- [ ] **Step 2: Create route handlers `routes/rule-check/rule-check-routes.ts`**

```typescript
// live-server/src/routes/rule-check/rule-check-routes.ts
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { ruleCheckResultService } from '../../services/rule-check/rule-check-result-service.js'
import { format } from 'date-fns'

const filiale = (req: { authUser?: { schema: string } }) =>
  (req.authUser?.schema ?? 'f8').toUpperCase()

export default async function ruleCheckRoutes(fastify: FastifyInstance) {

  // GET /api/rule-check/pairings — Level-1 violations for Gantt canvas
  fastify.get('/pairings', async (request, reply) => {
    const schema = z.object({
      crewIds:       z.string().transform((s) => s.split(',')).pipe(z.array(z.string().min(1)).min(1)),
      dateFrom:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dateTo:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ruleGroupCode: z.string().min(1),
    })
    const parsed = schema.safeParse(request.query)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    const { crewIds, dateFrom, dateTo, ruleGroupCode } = parsed.data

    const result = await ruleCheckResultService.queryPairingResults(
      fastify, crewIds, ruleGroupCode, dateFrom, dateTo,
    )
    return success(reply, result)
  })

  // GET /api/rule-check/roster — Level-2 violations for crew row indicators
  fastify.get('/roster', async (request, reply) => {
    const schema = z.object({
      crewIds:       z.string().transform((s) => s.split(',')).pipe(z.array(z.string().min(1)).min(1)),
      months:        z.string().transform((s) => s.split(',')).pipe(z.array(z.string().regex(/^\d{4}-\d{2}$/))),
      ruleGroupCode: z.string().min(1),
    })
    const parsed = schema.safeParse(request.query)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    const { crewIds, months, ruleGroupCode } = parsed.data

    const results = await ruleCheckResultService.queryRosterResults(
      fastify, crewIds, ruleGroupCode, months,
    )
    return success(reply, results)
  })

  // POST /api/rule-check/on-demand — lazy check for missing results
  fastify.post('/on-demand', async (request, reply) => {
    const schema = z.object({
      crewId:        z.string().min(1),
      pairingIds:    z.array(z.number().int().positive()),
      ruleGroupCode: z.string().min(1),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    const { crewId, pairingIds, ruleGroupCode } = parsed.data
    const f = filiale(request).toLowerCase()

    for (const pairingId of pairingIds) {
      await fastify.realtimeQueue.add(
        'rule:check:pairing',
        { crewId, pairingId, ruleGroupCode, filiale: f },
        { jobId: `pairing:${crewId}:${pairingId}:${ruleGroupCode}` },
      )
    }
    return success(reply, { queued: pairingIds.length })
  })

  // POST /api/rule-check/batch — start a batch check run
  fastify.post('/batch', async (request, reply) => {
    const schema = z.object({
      ruleGroupCode: z.string().min(1),
      dateFrom:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dateTo:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason:        z.enum(['import', 'rule-config-change', 'manual']),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    const { ruleGroupCode, dateFrom, dateTo, reason } = parsed.data
    const f = filiale(request)

    const { rows } = await fastify.pgPool.query<{ id: number }>(`
      INSERT INTO rule_check_batch_run
        (rule_group_code, date_from, date_to, filiale, reason, created_by)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id
    `, [ruleGroupCode, dateFrom, dateTo, f, reason, request.authUser?.userCode ?? 'system'])

    const batchRunId = rows[0].id

    await fastify.batchQueue.add(
      'rule:check:batch',
      { ruleGroupCode, dateFrom, dateTo, filiale: f, reason, batchRunId },
      { jobId: `batch:${batchRunId}` },
    )

    return success(reply, { batchRunId })
  })

  // GET /api/rule-check/batch/:id/progress — check batch status
  fastify.get('/batch/:id/progress', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { rows } = await fastify.pgPool.query<Record<string, unknown>>(
      `SELECT id, status, total_crew, processed_crew, total_pairings, processed_pairings,
              started_at, completed_at, reason
       FROM rule_check_batch_run WHERE id = $1`,
      [Number(id)],
    )
    if (rows.length === 0) return fail(reply, 404, 'Batch run not found')
    const r = rows[0]
    const totalCrew = Number(r.total_crew)
    const processedCrew = Number(r.processed_crew)
    const eta = estimateEta(r.started_at as Date | null, processedCrew, totalCrew)
    return success(reply, { ...r, eta })
  })
}

function estimateEta(startedAt: Date | null, processed: number, total: number): string | null {
  if (!startedAt || processed === 0 || total === 0) return null
  const elapsed = Date.now() - startedAt.getTime()
  const msPerCrew = elapsed / processed
  const remaining = (total - processed) * msPerCrew
  return `${Math.ceil(remaining / 60000)}min`
}
```

- [ ] **Step 3: Wire plugin + routes into `src/index.ts`**

In `live-server/src/index.ts`, add imports and registrations:

```typescript
// add imports after existing imports:
import bullmqPlugin from './plugins/bullmq.js'
import { RuleLoader } from '@rois/rule-engine'
import { startCheckPairingWorker } from './workers/check-pairing-worker.js'
import { startCheckRosterWorker } from './workers/check-roster-worker.js'
import { startBatchCrewWorker } from './workers/batch-crew-worker.js'
import { startBatchOrchestratorWorker } from './workers/batch-orchestrator-worker.js'
import ruleCheckRouteGroup from './routes/rule-check/index.js'

// inside start(), after existing plugins:
await server.register(bullmqPlugin)

// after all routes:
await server.register(ruleCheckRouteGroup)

// after server.listen():
const ruleLoader = new RuleLoader(server.pgPool)
startCheckPairingWorker(server, ruleLoader)
startCheckRosterWorker(server, ruleLoader)
startBatchCrewWorker(server, ruleLoader)
startBatchOrchestratorWorker(server)
server.log.info('Rule check workers started')
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add live-server/src/routes/rule-check/ live-server/src/index.ts
git commit -m "feat(live-server): add rule-check API routes and wire workers at startup"
```

---

## Task 9: Trigger Rule Check on Roster Mutations

**Files:**
- Modify: `live-server/src/routes/roster/roster.ts`

When a roster assignment is saved, enqueue a `rule:check:pairing` job.

- [ ] **Step 1: Add enqueue helper to `routes/roster/roster.ts`**

After a successful POST/PUT/DELETE on roster entries that involve a `pairingId`, enqueue the check. Find the section in `roster.ts` where it calls `rosterService.create` / `rosterService.update` and add after the success response:

```typescript
// Add this import at top of roster.ts:
import { getDefaultRuleGroupCode } from '../../services/rule-check/rule-check-trigger.js'

// After rosterService.create/update succeeds, before returning success:
const pairingId = result?.pairingId ?? (body as any).pairingId
if (pairingId && fastify.realtimeQueue) {
  const crewId = result?.crewId ?? (body as any).crewId
  const schema = request.authUser?.schema ?? 'f8'
  const ruleGroupCode = await getDefaultRuleGroupCode(fastify, schema)
  if (ruleGroupCode) {
    void fastify.realtimeQueue.add(
      'rule:check:pairing',
      { crewId, pairingId: Number(pairingId), ruleGroupCode, filiale: schema },
      { jobId: `pairing:${crewId}:${pairingId}:${ruleGroupCode}` },
    )
  }
}
```

- [ ] **Step 2: Create `services/rule-check/rule-check-trigger.ts`**

```typescript
// live-server/src/services/rule-check/rule-check-trigger.ts
import type { FastifyInstance } from 'fastify'

/**
 * Look up the default rule group code for a filiale.
 * Returns null if not configured (check is skipped gracefully).
 */
export async function getDefaultRuleGroupCode(
  fastify: FastifyInstance,
  schema: string,
): Promise<string | null> {
  try {
    const { rows } = await fastify.pgPool.query<{ value: string }>(`
      SELECT value FROM dictionary
      WHERE parent_code = 'RULE_CONFIG'
        AND code = 'default_rule_group_code'
      LIMIT 1
    `)
    return rows[0]?.value ?? null
  } catch {
    return null
  }
}

/**
 * Enqueue Level-1 + Level-2 checks for a crew × pairing mutation.
 * Safe to call fire-and-forget; never throws.
 */
export async function enqueueRuleCheckForMutation(
  fastify: FastifyInstance,
  crewId: string,
  pairingId: number,
  pairingStartDate: Date,
  schema: string,
): Promise<void> {
  try {
    const ruleGroupCode = await getDefaultRuleGroupCode(fastify, schema)
    if (!ruleGroupCode) return

    const filiale = schema.toLowerCase()

    // Level-1
    await fastify.realtimeQueue.add(
      'rule:check:pairing',
      { crewId, pairingId, ruleGroupCode, filiale },
      { jobId: `pairing:${crewId}:${pairingId}:${ruleGroupCode}` },
    )

    // Level-2: affected months (current + next 28 days)
    const months = getAffectedMonths(pairingStartDate, 28)
    for (const month of months) {
      await fastify.realtimeQueue.add(
        'rule:check:roster',
        { crewId, resultMonth: month, ruleGroupCode, filiale },
        { jobId: `roster:${crewId}:${month}:${ruleGroupCode}` },
      )
    }
  } catch {
    // Non-fatal — rule check is best-effort on mutations
  }
}

function getAffectedMonths(from: Date, cascadeDays: number): string[] {
  const months = new Set<string>()
  const end = new Date(from.getTime() + cascadeDays * 24 * 60 * 60 * 1000)
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1)
  while (cursor <= end) {
    months.add(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return [...months]
}
```

- [ ] **Step 3: Add seed data for default rule group code**

```sql
-- sql/seed/08-rule-check-config.sql
-- Default rule group for authoritative background checks
INSERT INTO dictionary (parent_code, code, value, name, sort_order, created_by, updated_by)
VALUES ('RULE_CONFIG', 'default_rule_group_code', 'ccar121_gantt', 'Default rule group for background checks', 1, 'system', 'system')
ON CONFLICT (parent_code, code) DO NOTHING;
```

Apply it:
```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" \
  -f sql/seed/08-rule-check-config.sql
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add live-server/src/routes/roster/roster.ts \
        live-server/src/services/rule-check/rule-check-trigger.ts \
        sql/seed/08-rule-check-config.sql
git commit -m "feat(live-server): enqueue rule checks on roster mutations"
```

---

## Task 10: date-fns dependency in live-server

Workers use `date-fns` (startOfMonth, endOfMonth, subDays, format). Verify or install.

- [ ] **Step 1: Check if date-fns is already available**

```bash
ls /home/yuan.z/rois/rois-ai/live-server/node_modules/date-fns 2>/dev/null && echo "present" || echo "missing"
```

- [ ] **Step 2: If missing, install**

```bash
cd /home/yuan.z/rois/rois-ai/live-server
npm install date-fns
```

- [ ] **Step 3: Verify compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit if package.json changed**

```bash
git add live-server/package.json live-server/package-lock.json
git commit -m "chore(live-server): add date-fns dependency"
```

---

## Task 11: Gantt — live-server rule-check API client

**Files:**
- Create: `gantt/src/services/live-rule-check-api.ts`

The existing `rule-api.ts` targets the rule-engine (port 7789). The new endpoints for persisted results are on live-server (port 3000 / `/api/rule-check/*`).

- [ ] **Step 1: Check the existing `api-paths.ts` / `http-client.ts` to understand base URLs**

```bash
cat /home/yuan.z/rois/rois-ai/gantt/src/config/api-paths.ts 2>/dev/null || \
  grep -r "LIVE_API_BASE\|createHttpClient" /home/yuan.z/rois/rois-ai/gantt/src/config/ | head -10
```

- [ ] **Step 2: Create `services/live-rule-check-api.ts`**

Adjust `LIVE_RULE_CHECK_BASE` to whatever pattern matches existing live-server API client usage in the gantt (e.g., if existing calls use `createHttpClient({ baseURL: LIVE_API_BASE + '/api' })` adapt accordingly):

```typescript
// gantt/src/services/live-rule-check-api.ts
import { createHttpClient } from './http-client'
import { LIVE_API_BASE } from '@/config/api-paths'

const client = createHttpClient({ baseURL: `${LIVE_API_BASE}/api/rule-check` })

export interface AuthoritativePairingViolation {
  crewId: string
  pairingId: number
  passedAll: boolean
  highestSeverity: number
  checkResults: Array<{
    ruleCode: string
    ruleName: string
    passed: boolean
    severity: number
    actualValue: number
    limitValue: number
    unit: string
    message: string
    overridable?: boolean
  }>
  calcResults: Record<string, { value: number; unit: string }>
  checkedAt: string
}

export interface PairingResultsResponse {
  byPairing: Record<string, AuthoritativePairingViolation>
  missing: Array<{ crewId: string; pairingId: number }>
}

export interface RosterViolation {
  templateCode: string
  severity: number
  message: string
  pairingIds: number[]
  actualValue: number
  limitValue: number
}

export interface RosterResult {
  crewId: string
  resultMonth: string
  passedAll: boolean
  highestSeverity: number
  violations: RosterViolation[]
}

export interface BatchStartResponse {
  batchRunId: number
}

export interface BatchProgress {
  id: number
  status: string
  totalCrew: number
  processedCrew: number
  totalPairings: number
  processedPairings: number
  eta: string | null
  startedAt: string | null
  completedAt: string | null
}

export const liveRuleCheckApi = {
  async getPairingResults(
    crewIds: string[],
    dateFrom: string,
    dateTo: string,
    ruleGroupCode: string,
  ): Promise<PairingResultsResponse> {
    return client.get('/pairings', {
      params: { crewIds: crewIds.join(','), dateFrom, dateTo, ruleGroupCode },
    }) as Promise<PairingResultsResponse>
  },

  async getRosterResults(
    crewIds: string[],
    months: string[],
    ruleGroupCode: string,
  ): Promise<RosterResult[]> {
    return client.get('/roster', {
      params: { crewIds: crewIds.join(','), months: months.join(','), ruleGroupCode },
    }) as Promise<RosterResult[]>
  },

  async triggerOnDemand(
    crewId: string,
    pairingIds: number[],
    ruleGroupCode: string,
  ): Promise<{ queued: number }> {
    return client.post('/on-demand', { crewId, pairingIds, ruleGroupCode }) as Promise<{ queued: number }>
  },

  async startBatch(
    ruleGroupCode: string,
    dateFrom: string,
    dateTo: string,
    reason: 'import' | 'rule-config-change' | 'manual',
  ): Promise<BatchStartResponse> {
    return client.post('/batch', { ruleGroupCode, dateFrom, dateTo, reason }) as Promise<BatchStartResponse>
  },

  async getBatchProgress(batchRunId: number): Promise<BatchProgress> {
    return client.get(`/batch/${batchRunId}/progress`) as Promise<BatchProgress>
  },
}
```

- [ ] **Step 3: Verify TypeScript compiles in gantt**

```bash
cd /home/yuan.z/rois/rois-ai/gantt
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add gantt/src/services/live-rule-check-api.ts
git commit -m "feat(gantt): add live-server rule-check API client"
```

---

## Task 12: Gantt — Authoritative Store Layer + WebSocket Handler

**Files:**
- Modify: `gantt/src/stores/rule-check-store.ts`
- Create: `gantt/src/hooks/use-rule-check-ws.ts`
- Modify: `gantt/src/hooks/use-rule-check.ts`

- [ ] **Step 1: Add `authoritative` Map to rule-check-store**

In `gantt/src/stores/rule-check-store.ts`, add to the `RuleCheckStore` interface:

```typescript
/** Authoritative violations loaded from live-server DB */
authoritative: Map<string, AuthoritativePairingViolation>

/** Load authoritative results from live-server on mount */
loadAuthoritative: (
  crewIds: string[],
  dateFrom: string,
  dateTo: string,
  ruleGroupCode: string,
) => Promise<void>

/** Apply a WebSocket violation:pairing:updated push to authoritative layer */
applyWsPairingUpdate: (msg: {
  crewId: string; pairingId: number; passedAll: boolean;
  highestSeverity: number; checkResults: unknown[]
}) => void

/** Apply a WebSocket violation:roster:updated push */
applyWsRosterUpdate: (msg: {
  crewId: string; resultMonth: string; passedAll: boolean;
  highestSeverity: number; violations: unknown[]
}) => void
```

Add types import at top:
```typescript
import type { AuthoritativePairingViolation } from '@/services/live-rule-check-api'
import { liveRuleCheckApi } from '@/services/live-rule-check-api'
```

Add the implementations in `create<RuleCheckStore>((set, get) => ({`:

```typescript
authoritative: new Map<string, AuthoritativePairingViolation>(),

loadAuthoritative: async (crewIds, dateFrom, dateTo, ruleGroupCode) => {
  try {
    const result = await liveRuleCheckApi.getPairingResults(crewIds, dateFrom, dateTo, ruleGroupCode)
    const newMap = new Map<string, AuthoritativePairingViolation>()
    for (const [pairingId, v] of Object.entries(result.byPairing)) {
      newMap.set(`${v.crewId}:${pairingId}`, v)
    }
    set({ authoritative: newMap })

    // Trigger on-demand check for any missing pairings
    if (result.missing.length > 0) {
      const byCrewId = new Map<string, number[]>()
      for (const m of result.missing) {
        const arr = byCrewId.get(m.crewId) ?? []
        arr.push(m.pairingId)
        byCrewId.set(m.crewId, arr)
      }
      for (const [crewId, pairingIds] of byCrewId) {
        void liveRuleCheckApi.triggerOnDemand(crewId, pairingIds, ruleGroupCode)
      }
    }
  } catch (err) {
    console.warn('[RuleCheck] loadAuthoritative failed:', err)
  }
},

applyWsPairingUpdate: (msg) => {
  set((state) => {
    const updated = new Map(state.authoritative)
    const key = `${msg.crewId}:${msg.pairingId}`
    updated.set(key, {
      crewId: msg.crewId,
      pairingId: msg.pairingId,
      passedAll: msg.passedAll,
      highestSeverity: msg.highestSeverity,
      checkResults: msg.checkResults as AuthoritativePairingViolation['checkResults'],
      calcResults: {},
      checkedAt: new Date().toISOString(),
    })
    return { authoritative: updated }
  })
},

applyWsRosterUpdate: (_msg) => {
  // roster-level violations are displayed on crew row; store update reserved for future
},
```

Update `getViolations` to merge authoritative into display (authoritative violations are converted to RuleViolation format):

Add a helper method for the canvas to get the highest severity for a pairing from EITHER layer:

```typescript
/** Get the highest severity to display for a pairing (authoritative wins over draft) */
getHighestSeverityForPairing: (pairingId: number, crewId: string): number => {
  const { authoritative, violations } = get()
  const authKey = `${crewId}:${pairingId}`
  const authResult = authoritative.get(authKey)
  const draftViolations = violations.get(`pairing:${pairingId}`) ?? []
  const draftMax = draftViolations.reduce((m, v) => Math.max(m, v.severity), 0)
  const authMax = authResult?.highestSeverity ?? 0
  return Math.max(draftMax, authMax)
},
```

- [ ] **Step 2: Create `hooks/use-rule-check-ws.ts`**

```typescript
// gantt/src/hooks/use-rule-check-ws.ts
import { useEffect } from 'react'
import { wsClient } from '@/services/ws'
import { useRuleCheckStore } from '@/stores/rule-check-store'

/**
 * Listen for violation WebSocket messages and update the authoritative store layer.
 * Must be mounted once at the app level (e.g., in App.tsx or RosterPane).
 */
export const useRuleCheckWs = () => {
  const applyPairingUpdate = useRuleCheckStore((s) => s.applyWsPairingUpdate)
  const applyRosterUpdate  = useRuleCheckStore((s) => s.applyWsRosterUpdate)

  useEffect(() => {
    const unsubscribe = wsClient.onMessage((msg) => {
      if (msg.type === 'violation:pairing:updated') {
        applyPairingUpdate(msg as Parameters<typeof applyPairingUpdate>[0])
      } else if (msg.type === 'violation:roster:updated') {
        applyRosterUpdate(msg as Parameters<typeof applyRosterUpdate>[0])
      }
    })
    return unsubscribe
  }, [applyPairingUpdate, applyRosterUpdate])
}
```

- [ ] **Step 3: Update `hooks/use-rule-check.ts` to load authoritative on first load**

In `use-rule-check.ts`, in the `isFirstLoad` block (where `crewsToCheck = selectedCrewIds`), add:

```typescript
// After determining isFirstLoad and selectedCrewIds are set:
if (isFirstLoad) {
  crewsToCheck = selectedCrewIds

  // Load authoritative violations from DB in parallel
  const { dateRange } = usePaneStore.getState()
  const { ruleGroupCode, loadAuthoritative } = useRuleCheckStore.getState()
  void loadAuthoritative(
    selectedCrewIds,
    format(dateRange.start, 'yyyy-MM-dd'),
    format(dateRange.end, 'yyyy-MM-dd'),
    ruleGroupCode,
  )
}
```

Add imports at top:
```typescript
import { usePaneStore } from '@/stores/pane-store'
import { format } from 'date-fns'
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/yuan.z/rois/rois-ai/gantt
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/rule-check-store.ts \
        gantt/src/hooks/use-rule-check-ws.ts \
        gantt/src/hooks/use-rule-check.ts
git commit -m "feat(gantt): add authoritative violation layer + WS handler + load on mount"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ §3.1/3.2 — Two result tables in Task 1
- ✅ §3.3 — batch_run table in Task 1
- ✅ §3.4 — roster_flight index in Task 1
- ✅ §4/4.1–4.5 — BullMQ workers in Tasks 6–7
- ✅ §5.1 — Single SQL query history in Task 4
- ✅ §5.2 — In-memory batch history in Task 7 (batch-crew-worker)
- ✅ §6 (cascade) — trigger service in Task 9 calls getAffectedMonths
- ✅ §7.1 — API routes in Task 8
- ✅ §7.2 — PairingResultsResponse in Task 11
- ✅ §7.3 — WS push types in Task 6
- ✅ §7.4 — Gantt load sequence in Task 12
- ✅ §7.5 — store dual-layer in Task 12
- ✅ §8 (triggers) — dictionary seed + trigger in Task 9
- ✅ §9 (batch performance) — crew-full worker with in-memory sliding window in Task 7
- ⚠️ Crew qualifications (fleetQuals, airportQuals) are hardcoded empty — qual-checker rules will always pass. This is a known limitation; crew qual loading is a separate future task.

**Type consistency check:**
- `AuthoritativePairingViolation` defined in Task 11, imported in Task 12 ✅
- `CheckPairingJobData` defined in Task 7, used in Task 8 (on-demand enqueue) — ensure `filiale` field matches ✅
- `RuleCheckResultService.upsertPairingResult` takes `UpsertPairingInput` — used in Task 7 workers with matching fields ✅
- `computeWindowSums(ref, flights)` signature: `(Date, FlightRow[]) → RecentFlightHours` — consistent across Tasks 3, 4, 7 ✅
- `getAffectedMonths` defined in Task 9 trigger service, returns `string[]` — used correctly ✅

**Placeholder check:** No TBD/TODO/placeholder patterns found in code blocks above.
