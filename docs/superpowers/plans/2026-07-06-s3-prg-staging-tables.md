# S3 PRG Staging Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add formal S3 PRG staging tables and route S3 Pairing Import through them so duty grouping and raw field inspection are reliable.

**Architecture:** The import flow gains a staging parser module that extracts type 1/2/3/4 records into structured rows. The existing business import service persists a batch plus record rows, converts those records into the current `S3PairingInput` shape, then reuses the existing batched business-table insert path. Duty assignment is resolved from type 3 duty windows before building `scenario.pairing_segment` rows.

**Tech Stack:** PostgreSQL SQL migration, Fastify live-server, TypeScript, node-postgres transaction client, Vitest.

---

### Task 1: Staging Parser Tests

**Files:**
- Modify: `live-server/src/services/scenario/__tests__/s3-pairing-prg-parser.test.ts`
- Modify: `live-server/src/services/scenario/s3-pairing-prg-parser.ts`

- [x] **Step 1: Add failing tests for staging extraction**

Add tests that call a new exported function `parseS3PairingPrgRecords(content)` and assert:

```ts
expect(records.pairings[0]).toMatchObject({
  recordType: '1',
  pairingNumber: 'T4101',
  pairingDate: '20260131',
  reportDate: '20260131',
  reportMinutes: 600,
  pairingEndDate: '20260201',
  pairingEndMinutes: 720,
  restRequiredAfterPairingMinutes: expect.any(Number),
})
expect(records.onlineSegments[0]).toMatchObject({
  recordType: '2',
  pairingNumber: 'T4101',
  pairingSequenceNumber: 10,
  departureAirport: 'YYZ',
  arrivalAirport: 'YVR',
})
expect(records.duties[0]).toMatchObject({
  recordType: '3',
  dutyPeriodNumber: 10,
  dutyStartDate: '20260131',
  dutyStartMinutes: 540,
  dutyEndDate: '20260131',
  dutyEndMinutes: 900,
})
expect(records.offlineSegments[0]).toMatchObject({
  recordType: '4',
  pairingNumber: 'T4101',
  pairingSequenceNumber: 40,
  carrier: 'LI',
  transportCode: 'MO',
})
```

- [x] **Step 2: Run test to verify red**

Run:

```bash
cd live-server
npm test -- src/services/scenario/__tests__/s3-pairing-prg-parser.test.ts
```

Expected: FAIL because `parseS3PairingPrgRecords` does not exist.

- [x] **Step 3: Implement record parser exports**

Add typed staging record interfaces and parsing functions in `s3-pairing-prg-parser.ts`. Keep existing `parseS3PairingPrg` export working by converting records into the legacy in-memory shape.

- [x] **Step 4: Run parser tests green**

Run the same parser test command. Expected: PASS.

### Task 2: Duty Assignment Tests

**Files:**
- Modify: `live-server/src/services/scenario/__tests__/s3-pairing-prg-parser.test.ts`
- Modify: `live-server/src/services/scenario/s3-pairing-prg-parser.ts`

- [x] **Step 1: Add failing five-segment, three-duty test**

Create a synthetic PRG content with one type 1 master, five type 2 segments, and three type 3 duties. Assert the converted `parseS3PairingPrg(content).pairings[0].segments.map(s => s.dutySeq)` equals `[10, 20, 30, 30, 30]` or normalized `[1, 2, 3, 3, 3]` depending on final conversion convention. Use normalized `1/2/3` in business rows.

- [x] **Step 2: Run test to verify red**

Run parser test command. Expected: FAIL because segments are currently all duty 1.

- [x] **Step 3: Implement duty-window segment assignment**

In conversion, build duty windows from type 3 records. Assign type 2/4 segments by scheduled departure/arrival falling within a duty window. Normalize duty period numbers to chronological `1..N` for business `dutySeq` while preserving original numbers in staging.

- [x] **Step 4: Run parser tests green**

Expected: PASS.

### Task 3: Schema Migration

**Files:**
- Create: `sql/migration/2026-07-06-s3-prg-staging-tables.sql`

- [x] **Step 1: Add idempotent migration**

Create five `scenario.s3_prg_*` tables with `create table if not exists`, plus indexes. Include audit columns and `raw_line` text on all record tables.

- [x] **Step 2: Validate migration syntax**

Run a read-only syntax check where practical by applying against the remote DB only if tables are missing and user-approved operational state is acceptable. Otherwise run `npm run build` after model-free SQL creation and leave DB apply to deployment.

### Task 4: Staging Persistence Tests

**Files:**
- Modify: `live-server/src/services/scenario/__tests__/s3-pairing-import-service.test.ts`
- Modify: `live-server/src/services/scenario/s3-pairing-import-service.ts`

- [x] **Step 1: Add failing service test**

Assert import transaction executes inserts into:

```ts
insert into scenario.s3_prg_import_batch
insert into scenario.s3_prg_pairing_record
insert into scenario.s3_prg_online_segment_record
insert into scenario.s3_prg_duty_record
insert into scenario.s3_prg_offline_segment_record
```

Also assert staging inserts occur before `insert into scenario.pairing`.

- [x] **Step 2: Run service test red**

Run:

```bash
cd live-server
npm test -- src/services/scenario/__tests__/s3-pairing-import-service.test.ts
```

Expected: FAIL because staging inserts do not exist.

- [x] **Step 3: Implement staging batch inserts**

Add helpers in `s3-pairing-import-service.ts` to insert the batch row and record tables using `jsonb_to_recordset` batched inserts.

- [x] **Step 4: Run service test green**

Expected: PASS.

### Task 5: Business Conversion and Node Times

**Files:**
- Modify: `live-server/src/services/scenario/s3-pairing-import-service.ts`
- Modify: `live-server/src/services/scenario/__tests__/s3-pairing-import-service.test.ts`

- [x] **Step 1: Add failing import test for duty node fields**

Use a fixture where a pairing has 5 segments and 3 duties. Assert `pairing_segment` JSON rows include `duty_seq` `[1,2,3,3,3]`, `brief_start_utc = duty start`, `brief_end_utc = first segment start`, `debrief_start_utc = last segment end`, and `debrief_end_utc = duty end` per duty.

- [x] **Step 2: Run service test red**

Expected: FAIL if conversion still groups incorrectly.

- [x] **Step 3: Reuse parser-converted duty assignment in business row build**

Ensure `buildSegmentRows` consumes correctly assigned `segment.dutySeq` and corresponding `pairing.duties` keyed by normalized duty sequence.

- [x] **Step 4: Run service test green**

Expected: PASS.

### Task 6: Verification and Version

**Files:**
- Modify: `gantt/src/version.ts`

- [x] **Step 1: Bump backend version**

Increment `BACKEND_VERSION` by 1 with comment `S3 PRG staging import tables`.

- [x] **Step 2: Run focused tests**

Run:

```bash
cd live-server
npm test -- src/services/scenario/__tests__/s3-pairing-prg-parser.test.ts src/services/scenario/__tests__/s3-pairing-import-service.test.ts src/__tests__/unit/scenario-s3-pairing-import-route.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 3: Manual DB/API check**

After applying the migration and importing a sample PRG, query latest staging batch and compare record counts with parsed PRG type counts. For scenario 546 or a new PO scenario, confirm PO Gantt still opens with Pairing and Flight panes only. Not run in this implementation pass; migration file is created but not applied.
