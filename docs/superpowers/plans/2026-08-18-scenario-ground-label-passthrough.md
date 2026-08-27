# Scenario Ground-Duty Label Passthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scenario DB Gantt ground items carry `roster_flight.label` so crew 1485 reserve pucks on scenario 743 show PRAM/PRPM, matching Live.

**Architecture:** `buildGanttDataFromDb` already maps pairing-less `roster_flight` rows to `ScenarioGanttGroundItem`. Add `label` to that SELECT and mapping. Keep `assignment` as the generic code (`RES`). `injectSbyAssignments` still lifts only `assignmentGroup === 'SBY'`; `GRD`+`RES` rows stay ground items. Frontend `buildScenarioRosterItems` / `buildGroundTaskPuckLabel` already prefer `label`.

**Tech Stack:** TypeScript, Drizzle `sql`, Vitest.

## Global Constraints

- Keep `assignment` as the generic code (`RES`, `DO`, …). Do **not** rewrite it to PRAM/PRPM.
- Map `label: row.label ?? null` onto existing `ScenarioGanttGroundItem.label`.
- Do **not** convert `GRD`+`RES` ground rows into SBY pairings.
- Do **not** change schema, backfill scenario 705 (null labels), renderer, Live Gantt, snapshot/gz, or lead-in loaders.
- No Playwright; no `check:ui` (no Gantt/CSS files).
- No secrets in docs/tests. Do not copy `DATABASE_URL` from existing mocks.
- §No-Auto-Commit: do not `git commit` unless the user asks.
- Spec: `docs/superpowers/specs/2026-08-18-scenario-ground-label-passthrough-design.md`.

## File map

| File | Responsibility |
|------|----------------|
| `live-server/src/services/scenario/__tests__/scenario-gantt-db-service.test.ts` | Failing-then-passing mapper test: RES + `label=PRPM` |
| `live-server/src/services/scenario/scenario-gantt-db-service.ts` | Ground-item SELECT + map (`~203–241`) |

Blast radius: `buildGanttDataFromDb` is called from `live-server/src/routes/scenario/scenario.ts` (~1573) and mocked in `live-server/src/__tests__/unit/scenario-s3-pairing-import-route.test.ts`. Adding a column to one SELECT does not change the function signature. Existing SQL-text mocks use `SELECT crew_id, base, assignment_group`, which already does **not** match the current ground SELECT (`crew_id, base, dep_arp, arv_arp, assignment_group, assignment`); do **not** “fix” those matchers.

---

### Task 1: Failing ground-item `label` test

**Files:**
- Modify: `live-server/src/services/scenario/__tests__/scenario-gantt-db-service.test.ts` (inside `describe('buildGanttDataFromDb')`, after the `loads only flights referenced by scoped pairing segments` test)

**Interfaces:**
- Consumes: `buildGanttDataFromDb(db, meta)`, `meta(id, pairingScenarioId, flightScenarioId)` already in this file
- Produces: a test that fails until the ground SELECT includes `label` and the mapped item keeps `assignment='RES'` with `label='PRPM'`

- [ ] **Step 1: Write the failing test**

Insert this `it(...)` in `describe('buildGanttDataFromDb')`. Reuse the file’s existing `PgDialect` / `meta` helpers. Ground-query detector must use `pairing_id IS NULL` (not a substring of `IS NOT NULL`).

```typescript
  it('passes roster_flight.label through DB ground items (RES → PRPM)', async () => {
    const dialect = new PgDialect()
    const executed: string[] = []
    const fakeDb = {
      execute: async (query: unknown) => {
        const { sql: text } = dialect.sqlToQuery(query as never)
        executed.push(text)

        if (text.includes('pairing_id IS NULL') && text.includes('assignment_group')) {
          return {
            rows: [{
              crew_id: '1485',
              base: 'YVR',
              dep_arp: 'YVR',
              arv_arp: 'YVR',
              assignment_group: 'GRD',
              assignment: 'RES',
              label: 'PRPM',
              sch_str: '2026-08-06T22:00:00Z',
              sch_end: '2026-08-07T07:59:00Z',
              flight_acting_rank: null,
              source: 'PA',
              act_credited_minutes: null,
            }],
          }
        }
        if (text.includes('max(active_rank) AS active_rank')) {
          return { rows: [] }
        }
        if (text.includes('SELECT id') && text.includes('.pairing') && !text.includes('pairing_label')) {
          return { rows: [] }
        }
        if (text.includes('SELECT id, pairing_label, interface_id, base')) {
          return { rows: [] }
        }
        if (text.includes('SELECT pairing_id, acting_rank')) {
          return { rows: [] }
        }
        if (text.includes('SELECT ps.pairing_id, ps.duty_seq')) {
          return { rows: [] }
        }
        if (text.includes('SELECT id, flt_num, dep_arp, arv_arp')) {
          return { rows: [] }
        }
        if (/SELECT\s+crew_id\s+FROM\s+\S+\.crew\s+WHERE\s+crew_id\s+IN/s.test(text) && !text.includes('first_name')) {
          return { rows: [] }
        }
        if (text.includes('scenario.crew_manday_')) {
          return { rows: [] }
        }
        return { rows: [] }
      },
    }

    const d = await buildGanttDataFromDb(fakeDb as never, meta(904, 0, 0))

    const groundQuery = executed.find((text) => text.includes('pairing_id IS NULL') && text.includes('assignment_group'))
    expect(groundQuery).toMatch(/assignment,\s*label/)
    expect(d.groundItems).toEqual([
      expect.objectContaining({
        crewId: '1485',
        assignmentGroup: 'GRD',
        assignment: 'RES',
        label: 'PRPM',
      }),
    ])
  })
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd live-server && npx vitest run src/services/scenario/__tests__/scenario-gantt-db-service.test.ts -t "passes roster_flight.label"
```

Expected: FAIL. The SQL assertion fails because the SELECT is still `assignment_group, assignment,` with no `label`. If the SQL assert is skipped, `groundItems[0].label` is `undefined`.

Do not implement the loader in this task.

---

### Task 2: Select and map `label`

**Files:**
- Modify: `live-server/src/services/scenario/scenario-gantt-db-service.ts:203-241`

**Interfaces:**
- Consumes: `ScenarioGanttGroundItem.label?: string | null` (already defined in `scenario-gantt-service.ts`)
- Produces: `buildGanttDataFromDb` ground items with `label` copied from `roster_flight.label`

- [ ] **Step 1: Impact check (before edit)**

GitNexus `impact({target: "buildGanttDataFromDb", direction: "upstream"})` if MCP is available. If not, callers are: `live-server/src/routes/scenario/scenario.ts` (~1573) and a mock in `scenario-s3-pairing-import-route.test.ts`. Signature unchanged; risk is LOW. Warn the user only if impact returns HIGH/CRITICAL.

- [ ] **Step 2: Add `label` to the ground-item query and map**

In `buildGanttDataFromDb`, change the ground-item block to:

```typescript
  const rawGroundItems: ScenarioGanttGroundItem[] = isPairingOnlyPo
    ? []
    : (await db.execute<{
        crew_id: string
        base: string | null
        dep_arp: string | null
        arv_arp: string | null
        assignment_group: string | null
        assignment: string | null
        label: string | null
        sch_str: string
        sch_end: string
        flight_acting_rank: string | null
        source: string | null
        act_credited_minutes: string | null
      }>(sql`
        SELECT crew_id, base, dep_arp, arv_arp, assignment_group, assignment, label,
          ${sql.raw(utc('sch_str_dt_utc', 'sch_str'))},
          ${sql.raw(utc('sch_end_dt_utc', 'sch_end'))},
          flight_acting_rank, source, act_credited_minutes
        FROM ${sql.raw(roster)}
        WHERE scenario_id = ${sc.id} AND pairing_id IS NULL AND is_deleted = 0
          AND sch_str_dt_utc IS NOT NULL AND sch_end_dt_utc IS NOT NULL
      `)).rows.map((row) => ({
        crewId: row.crew_id,
        base: row.base || '',
        depArp: row.dep_arp || row.base || '',
        arvArp: row.arv_arp || '',
        assignmentGroup: row.assignment_group || 'GRD',
        assignment: row.assignment || row.assignment_group || 'GRD',
        label: row.label ?? null,
        schStrDtUtc: row.sch_str,
        schEndDtUtc: row.sch_end,
        actingRank: row.flight_acting_rank || '',
        source: normalizeRosterSource(row.source),
        actCreditedMinutes:
          row.act_credited_minutes != null && Number.isFinite(Number(row.act_credited_minutes))
            ? Number(row.act_credited_minutes)
            : undefined,
      }))
```

Do not change `injectSbyAssignments` or `assignment`.

- [ ] **Step 3: Re-run the new test**

```bash
cd live-server && npx vitest run src/services/scenario/__tests__/scenario-gantt-db-service.test.ts -t "passes roster_flight.label"
```

Expected: PASS (1 test).

- [ ] **Step 4: Run the surrounding file tests**

```bash
cd live-server && npx vitest run src/services/scenario/__tests__/scenario-gantt-db-service.test.ts
```

Expected: all tests in that file PASS. Do not “fix” stale `SELECT crew_id, base, assignment_group` matchers unless a test actually fails because of the new `label` column.

- [ ] **Step 5: Commit only if the user asks**

If asked, commit spec + plan + test + loader together. Message:

```
fix(live-server): pass roster_flight.label to scenario Gantt ground items

Scenario DB Gantt dropped ground-duty labels, so RES showed instead of PRAM/PRPM.
```

Do not commit in this task unless the user explicitly requested it.
