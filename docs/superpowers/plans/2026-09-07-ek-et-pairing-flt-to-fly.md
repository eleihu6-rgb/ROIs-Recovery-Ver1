# EK/ET pairing FLT → FLY Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or subagent-driven-development. Steps use checkbox syntax.

**Goal:** Remap EK/ET live pairing `FLT`/`PAX` to F8 `FLY`/`DHD`, and stop new pairings from writing `FLT`.

**Architecture:** One transactional SQL migration on `dev_live` fact tables, plus three live-server create-path default changes. No `getCrewList` query change.

**Tech Stack:** PostgreSQL (`dev_live`), live-server TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-ek-et-pairing-flt-to-fly-design.md`

## Global Constraints

- Schema: `dev_live` only. Do not write `dev_scenario`.
- Do not change `getCrewList` FLY/DHD filters.
- Do not mutate assignment dictionary master rows.
- §No-Auto-Commit: do not git commit unless the user asks.
- Stamp data `updated_by = 'flt_to_fly_2026-09-07'`.

---

### Task 1: Failing tests for FLY create-path defaults

**Files:**
- Modify: `live-server/src/__tests__/services/roster/roster-service.test.ts` (`assignPairing` describe)

**Steps:**
- [x] Add an `assignPairing` case where `mockPair.assignmentGroup` is `null` and assert `insertedValues[0].assignmentGroup === 'FLY'`.
- [x] Run roster-service vitest — PASS 22 tests
- [x] Create-path defaults FLT → FLY
- [x] SQL remap: pairing 201, segments 429, roster 6
- [x] Post-check leftover FLT/PAX = 0
- [x] Targeted Redis DEL of remapped flight/pairing keys (0 keys present)

### Task 2: Create-path defaults FLT → FLY

**Files:**
- Modify: `live-server/src/services/roster/roster-service.ts` (`pair.assignmentGroup ?? 'FLT'` and `assignFlight` `'FLT'`)
- Modify: `live-server/src/services/pairing/pairing-service.ts` (header + two `segAssignment` fallbacks)
- Modify: `live-server/src/services/pairing/pairing-build-service.ts` (header + `segAssignment` fallback)

Replace only those writer defaults with `'FLY'`. Re-run the roster test; expect GREEN.

### Task 3: Data remap + post-checks

**Files:**
- Create: `sql/migration/2026-09-07-ek-et-pairing-flt-to-fly.sql`

SQL (run with `live-server/.env` `DATABASE_URL`, search_path already `dev_live`):

```sql
BEGIN;

UPDATE pairing p
SET assignment_group = 'FLY',
    assignment = 'FLY',
    updated_by = 'flt_to_fly_2026-09-07',
    updated_at = now()
WHERE p.assignment_group = 'FLT'
  AND coalesce(p.is_deleted, 0) = 0;

UPDATE pairing_segment ps
SET seg_assignment = CASE
      WHEN upper(btrim(ps.seg_assignment)) = 'PAX' THEN 'DHD'
      WHEN upper(btrim(ps.seg_assignment)) = 'FLT' THEN 'FLY'
      ELSE ps.seg_assignment
    END,
    updated_by = 'flt_to_fly_2026-09-07',
    updated_at = now()
WHERE ps.pairing_id IN (
    SELECT id FROM pairing WHERE updated_by = 'flt_to_fly_2026-09-07'
  )
  AND upper(btrim(coalesce(ps.seg_assignment, ''))) IN ('FLT', 'PAX');

UPDATE roster_flight rf
SET assignment_group = CASE
      WHEN rf.assignment_group = 'FLT' THEN 'FLY'
      ELSE rf.assignment_group
    END,
    assignment = CASE
      WHEN rf.assignment = 'PAX' THEN 'DHD'
      WHEN rf.assignment = 'FLT' THEN 'FLY'
      ELSE rf.assignment
    END,
    updated_by = 'flt_to_fly_2026-09-07',
    updated_at = now()
WHERE rf.pairing_id IN (
    SELECT id FROM pairing WHERE updated_by = 'flt_to_fly_2026-09-07'
  )
  AND (
    rf.assignment_group = 'FLT'
    OR rf.assignment IN ('FLT', 'PAX')
  );

-- post-checks (raise if leftover)
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pairing WHERE assignment_group = 'FLT' AND coalesce(is_deleted,0)=0;
  IF n <> 0 THEN RAISE EXCEPTION 'pairing FLT leftover: %', n; END IF;
  SELECT count(*) INTO n FROM roster_flight rf
    JOIN pairing p ON p.id = rf.pairing_id AND p.updated_by = 'flt_to_fly_2026-09-07'
   WHERE rf.assignment_group = 'FLT' OR rf.assignment IN ('FLT','PAX');
  IF n <> 0 THEN RAISE EXCEPTION 'roster FLT/PAX leftover: %', n; END IF;
END $$;

COMMIT;
```

Expected counts: pairing 201, segments 429 (24 PAX + 405 FLT), roster 6.

Invalidate Redis `flight:crew:*` and `pairing:crewdetail:*` after commit.

Verify: pairing `#150398` group `FLY`; K1002 roster assignment `DHD`; T2001 roster assignment `FLY`.

### Task 4: User-visible proof

- [ ] SQL: Flight 145625 crew rows are DHD (Crew Assignment empty is correct).
- [ ] SQL: T2001 / pairing 150406 is FLY (would list in Crew Assignment).
- [ ] Do not claim UI-fixed without this receipt.

---

## Spec coverage

| Spec item | Task |
|---|---|
| pairing FLT→FLY | 3 |
| segment FLT→FLY, PAX→DHD | 3 |
| roster_flight remap | 3 |
| create-path FLY defaults | 1–2 |
| Redis invalidation | 3 |
| EK201 still empty (DHD) | 4 |
| T2001 visible as FLY | 4 |
| `dev_scenario` untouched | 3 (not in SQL) |
