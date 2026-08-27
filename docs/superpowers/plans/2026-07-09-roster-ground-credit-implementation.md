# RosterGround Credit Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist F8 RosterGround `credit`, export it as optimizer `RosterGround.creditedMinutes`, and make manday use roster-level ground credit before assignment defaults.

**Architecture:** Keep `roster_flight` as the single source of ground-duty credit. Connector inbound remains `credit`; optimizer output adds `creditedMinutes`; the manday driver passes optional roster credit overrides to the backward-compatible Rust `ruletool` TSV protocol.

**Tech Stack:** TypeScript, Vitest, Fastify/BullMQ worker code, Python pytest ro_input builder tests, Rust cargo integration tests.

---

## File Structure

- Modify `connector-server/src/__tests__/unit/transform-roster-ground-db.test.ts`
  - Assert inbound `credit` maps to `RosterGroundRecord.credit`.
- Modify `live-server/src/__tests__/unit/roster-ground-inbound-worker.test.ts`
  - Assert inserted ground SQL includes both `act_credited_minutes` and `sch_credited_minutes`.
- Modify `live-server/src/workers/roster-ground-inbound-worker.ts`
  - Insert `sch_credited_minutes` beside existing `act_credited_minutes`.
- Modify `engine-server/F8/ro_input_builder/sections/roster.py`
  - Add `creditedMinutes` to `RosterGround`, sourced from `act_credited_minutes`.
- Modify `engine-server/tests/test_ro_input_roster_sections.py`
  - Replace golden-only `RosterGround` header assertion with the new explicit header expectation.
  - Assert `creditedMinutes` is present and maps to emitted data.
- Modify `live-server/src/services/manday/manday-tool-rust.ts`
  - Extend `ActivityRow` with optional `actCreditMin` and `schCreditMin`.
  - Append those values to TSV only when present; old 8-column rows still work.
- Modify `live-server/src/services/manday/manday-tool.ts`
  - Load ground `act_credited_minutes` and `sch_credited_minutes`.
  - Build GND rows with roster credit override values.
- Modify `rule-engine-rs/src/bin/ruletool.rs`
  - For GND rows, prefer appended act/sch credit before falling back to `ground_credit`.
- Modify `rule-engine-rs/tests/ruletool_aggregation.rs`
  - Add tests for actual-credit, scheduled-credit, and assignment fallback priority.

## Preliminary Checks

### Task 0: Confirm Worktree and Impact Tooling

**Files:**
- Read only.

- [ ] **Step 1: Check worktree**

Run:

```bash
git status --short
```

Expected: only the approved spec/plan docs or a clean worktree. If unrelated user changes appear, do not modify or revert them.

- [ ] **Step 2: Try GitNexus detect_changes baseline**

Run:

```bash
node .gitnexus/run.cjs detect_changes
```

Expected: either a successful report or the known local failure:

```text
LadybugDB package (@ladybugdb/core) is not installed.
Run: npm install
```

If GitNexus is unavailable, record the exact failure in the final verification notes and continue with focused tests plus `git diff --stat`.

- [ ] **Step 3: Run impact analysis before symbol edits when tooling is available**

For each symbol before editing, run the GitNexus impact command exposed in this environment. Required target symbols:

```text
transformF8RosterGround
importGroundRecords
processRosterGroundImportJob
loadActivity
buildRows
runRust
main
```

If the tool is still unavailable because of `@ladybugdb/core`, record that blocker and continue only after manually reviewing direct callers with `rg` and the tests named in this plan.

## Connector Transform

### Task 1: Prove RosterGround `credit` Mapping

**Files:**
- Modify `connector-server/src/__tests__/unit/transform-roster-ground-db.test.ts`

- [ ] **Step 1: Add the failing assertion**

In the first test, add `credit: 155` to the raw ground record and assert the mapped record:

```ts
const ground = [{
  crewId: 'C001', assignment: 'Illness', assignmentGroup: 'GRD',
  location: 'PEK', division: 'P', label: 'sick',
  trainingRole: 'x',
  credit: 155,
  startTimeUtc: '2026-06-10T00:00:00Z', endTimeUtc: '2026-06-11T00:00:00Z',
}]

expect(groundRecords[0].credit).toBe(155)
```

- [ ] **Step 2: Run the focused connector test**

Run:

```bash
npm --prefix connector-server test -- src/__tests__/unit/transform-roster-ground-db.test.ts
```

Expected before implementation: PASS, because the mapping already exists. This test locks the contract.

- [ ] **Step 3: Commit only if this task creates a standalone change**

Do not commit yet if executing the whole plan inline. If committing per task:

```bash
git add connector-server/src/__tests__/unit/transform-roster-ground-db.test.ts
git commit -m "test: cover roster ground credit transform"
```

## RosterGround Import Persistence

### Task 2: Test sch/act Credit Insert

**Files:**
- Modify `live-server/src/__tests__/unit/roster-ground-inbound-worker.test.ts`

- [ ] **Step 1: Add a SQL-render assertion to the ground insert test**

In `inserts ground records as roster_flight rows with null pairing`, change `credit: 0` to `credit: 155`, then render the INSERT SQL after `processRosterGroundImportJob`:

```ts
const dialect = new PgDialect()
const inserts = mockDb.execute.mock.calls
  .map(([q]) => dialect.sqlToQuery(q as never))
  .filter((r) => /^\s*insert\s+into\s+roster_flight/i.test(r.sql))
const groundInsert = inserts.find((r) => r.params.includes(155))

expect(groundInsert, 'expected ground roster_flight insert').toBeDefined()
expect(groundInsert!.sql).toContain('act_credited_minutes')
expect(groundInsert!.sql).toContain('sch_credited_minutes')
expect(groundInsert!.params.filter((p) => p === 155)).toHaveLength(2)
```

- [ ] **Step 2: Run the focused live-server worker test and confirm failure**

Run:

```bash
npm --prefix live-server test -- src/__tests__/unit/roster-ground-inbound-worker.test.ts
```

Expected: FAIL because `sch_credited_minutes` is not in the INSERT yet.

### Task 3: Implement sch/act Credit Insert

**Files:**
- Modify `live-server/src/workers/roster-ground-inbound-worker.ts`

- [ ] **Step 1: Add `sch_credited_minutes` to the ground INSERT**

Replace the ground INSERT column/value portion with this shape:

```ts
await tx.execute(sql`
  INSERT INTO roster_flight (
    crew_id, pairing_id, base, label,
    assignment_group, assignment, role,
    division, flight_acting_rank, roster_acting_rank,
    sch_str_dt_utc, sch_end_dt_utc,
    dep_arp, arv_arp, sch_credited_minutes, act_credited_minutes,
    source, is_requested, is_deleted, is_swapped,
    created_by, updated_by
  ) VALUES (
    ${rec.crewId}, NULL, '', ${rec.label},
    ${rec.assignmentGroup}, ${rec.assignment}, ${rec.role},
    ${rec.division}, ${divisionDefaultRank(rec.division)}, ${divisionDefaultRank(rec.division)},
    ${rec.strDtUtc}, ${rec.endDtUtc},
    ${rec.depArp || null}, ${rec.arvArp || null}, ${rec.credit ?? null}, ${rec.credit ?? null},
    ${rec.source}, 0, 0, 0,
    'F8_IMPORT', 'F8_IMPORT'
  )
`)
```

Use `rec.credit ?? null` so `0` is preserved as a real value.

- [ ] **Step 2: Run the focused live-server worker test**

Run:

```bash
npm --prefix live-server test -- src/__tests__/unit/roster-ground-inbound-worker.test.ts
```

Expected: PASS.

## ro_input RosterGround Export

### Task 4: Test `creditedMinutes` Header and Mapping

**Files:**
- Modify `engine-server/tests/test_ro_input_roster_sections.py`

- [ ] **Step 1: Replace the RosterGround golden header assertion**

Change `test_roster_ground_header_matches_golden` to an explicit contract test:

```py
def test_roster_ground_header_includes_credited_minutes(conn):
    sec = _emit(conn, roster.ROSTER_GROUND)
    assert "creditedMinutes" in sec.columns
    assert "dpMin" in sec.columns
    assert sec.columns.index("creditedMinutes") > sec.columns.index("dpMin")
```

- [ ] **Step 2: Add a value mapping test**

Add:

```py
def test_roster_ground_credited_minutes_matches_actual_credit(conn):
    sec = _emit(conn, roster.ROSTER_GROUND)
    ci = sec.columns.index("creditedMinutes")
    di = sec.columns.index("dpMin")
    assert sec.rows
    assert all(r[ci] == r[di] for r in sec.rows)
```

This verifies `creditedMinutes` uses the same source as current `dpMin`, which is `act_credited_minutes`.

- [ ] **Step 3: Run the focused pytest and confirm failure**

Run:

```bash
python -m pytest engine-server/tests/test_ro_input_roster_sections.py -q
```

Expected: FAIL because `creditedMinutes` is not emitted yet, or SKIP if the remote F8 DB is unavailable. If skipped for DB availability, continue implementation and report the skip reason in final verification.

### Task 5: Add `creditedMinutes` to RosterGround Export

**Files:**
- Modify `engine-server/F8/ro_input_builder/sections/roster.py`

- [ ] **Step 1: Add the column after `dpMin`**

In `_RG_COLS`, replace:

```py
Col("dpMin", "act_credited_minutes"), Col("isAgreeWork", None),
```

with:

```py
Col("dpMin", "act_credited_minutes"),
Col("creditedMinutes", "act_credited_minutes"),
Col("isAgreeWork", None),
```

- [ ] **Step 2: Run the focused pytest**

Run:

```bash
python -m pytest engine-server/tests/test_ro_input_roster_sections.py -q
```

Expected: PASS or SKIP only if the F8 DB is unavailable.

## Rust Ruletool Credit Priority

### Task 6: Test GND Credit Override Priority

**Files:**
- Modify `rule-engine-rs/tests/ruletool_aggregation.rs`

- [ ] **Step 1: Add the priority test**

Add:

```rust
#[test]
fn ground_credit_prefers_roster_actual_then_scheduled_then_assignment() {
    let tsv = "\
A\tP\t2026-06-01\tGND\t600\t240\t0\t\t155\t300
A\tP\t2026-06-02\tGND\t600\t240\t0\t\t\t180
A\tP\t2026-06-03\tGND\t600\t240\t0\t";
    let out = run(tsv);
    let d = rows(&out, "D");

    let d1 = d.iter().find(|r| r[3] == "2026-06-01").unwrap();
    assert_eq!(d1[5], "155", "actual roster credit wins");

    let d2 = d.iter().find(|r| r[3] == "2026-06-02").unwrap();
    assert_eq!(d2[5], "180", "scheduled roster credit wins when actual missing");

    let d3 = d.iter().find(|r| r[3] == "2026-06-03").unwrap();
    assert_eq!(d3[5], "240", "assignment fixed credit remains fallback");
}
```

- [ ] **Step 2: Run the focused cargo test and confirm failure**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml ground_credit_prefers_roster_actual_then_scheduled_then_assignment --test ruletool_aggregation
```

Expected: FAIL because the current Rust parser ignores appended credit columns.

### Task 7: Implement Rust GND Credit Priority

**Files:**
- Modify `rule-engine-rs/src/bin/ruletool.rs`

- [ ] **Step 1: Add a parser helper near `arg_value`**

Add:

```rust
fn parse_optional_i64(value: Option<&&str>) -> Option<i64> {
    value.and_then(|v| {
        let trimmed = v.trim();
        if trimmed.is_empty() {
            None
        } else {
            trimmed.parse::<i64>().ok()
        }
    })
}
```

- [ ] **Step 2: Update the GND match arm**

Replace the current GND arm with:

```rust
"GND" => {
    let duty = a1.parse::<i64>().unwrap_or(0);
    let fixed = a2.parse::<i64>().unwrap_or(-1);
    let pct = a3.parse::<f64>().unwrap_or(0.0);
    let act_credit = parse_optional_i64(f.get(8));
    let sch_credit = parse_optional_i64(f.get(9));
    let fixed_opt = if fixed >= 0 { Some(fixed) } else { None };
    let credit = act_credit
        .or(sch_credit)
        .unwrap_or_else(|| ground_credit(fixed_opt, pct, duty));
    (0, credit)
}
```

This keeps 8-column TSV rows valid.

- [ ] **Step 3: Run the focused cargo test**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml ground_credit_prefers_roster_actual_then_scheduled_then_assignment --test ruletool_aggregation
```

Expected: PASS.

## Live Manday Driver

### Task 8: Extend TSV ActivityRow Contract

**Files:**
- Modify `live-server/src/services/manday/manday-tool-rust.ts`

- [ ] **Step 1: Extend `ActivityRow`**

Change the interface to:

```ts
export interface ActivityRow {
  crewId: string
  division: string
  localDate: string
  kind: 'FLY' | 'GND'
  a1: number
  a2: number
  a3: number
  flag: '' | 'DO' | 'VAC' | 'ILL'
  actCreditMin?: number | null
  schCreditMin?: number | null
}
```

- [ ] **Step 2: Append optional GND credit fields in `toTsv`**

Replace `toTsv` with:

```ts
const nullableNum = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? '' : String(v)

const toTsv = (r: ActivityRow): string => {
  const base = `${r.crewId}\t${r.division}\t${r.localDate}\t${r.kind}\t${r.a1}\t${r.a2}\t${r.a3}\t${r.flag}`
  if (r.kind !== 'GND') return base
  return `${base}\t${nullableNum(r.actCreditMin)}\t${nullableNum(r.schCreditMin)}`
}
```

- [ ] **Step 3: Run live-server type check via build**

Run:

```bash
npm --prefix live-server run build
```

Expected: PASS. This bumps ignored runtime version state only; do not stage ignored files.

### Task 9: Load and Pass Ground Credit Overrides

**Files:**
- Modify `live-server/src/services/manday/manday-tool.ts`

- [ ] **Step 1: Extend `RosterActivity.ground`**

Change the ground type to:

```ts
ground: Array<{
  crewId: string
  assignment: string
  startUtc: string | null
  endUtc: string | null
  actCreditMin: number | null
  schCreditMin: number | null
}>
```

- [ ] **Step 2: Select the credit columns**

Replace the ground query select with:

```ts
`SELECT rf.crew_id, rf.assignment, rf.assignment_group,
        rf.act_credited_minutes, rf.sch_credited_minutes,
        ${TS('rf.sch_str_dt_utc')} s, ${TS('rf.sch_end_dt_utc')} e
   FROM ${table} rf WHERE ${W} AND rf.pairing_id IS NULL`
```

- [ ] **Step 3: Map nullable numeric values without losing zero**

Add a helper near `asUtc`:

```ts
const nullableNumber = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v)
```

Map ground rows as:

```ts
const ground = gnd.rows.map((r) => ({
  crewId: r.crew_id,
  assignment: r.assignment || r.assignment_group || '',
  startUtc: asUtc(r.s),
  endUtc: asUtc(r.e),
  actCreditMin: nullableNumber(r.act_credited_minutes),
  schCreditMin: nullableNumber(r.sch_credited_minutes),
}))
```

- [ ] **Step 4: Pass overrides from `buildRows`**

Replace the GND row push with:

```ts
rows.push({
  crewId: g.crewId,
  division: m.division,
  localDate: toLocalDate(g.startUtc, zoneOf(g.crewId)),
  kind: 'GND',
  a1: dutyMin,
  a2: def.fixed,
  a3: def.pct,
  flag,
  actCreditMin: g.actCreditMin,
  schCreditMin: g.schCreditMin,
})
```

- [ ] **Step 5: Run live-server build and worker test**

Run:

```bash
npm --prefix live-server run build
npm --prefix live-server test -- src/__tests__/unit/roster-ground-inbound-worker.test.ts
```

Expected: both PASS.

## Final Verification

### Task 10: Run Focused Verification Set

**Files:**
- Read only after implementation.

- [ ] **Step 1: Connector transform test**

Run:

```bash
npm --prefix connector-server test -- src/__tests__/unit/transform-roster-ground-db.test.ts
```

Expected: PASS.

- [ ] **Step 2: Live worker test**

Run:

```bash
npm --prefix live-server test -- src/__tests__/unit/roster-ground-inbound-worker.test.ts
```

Expected: PASS.

- [ ] **Step 3: ro_input roster tests**

Run:

```bash
python -m pytest engine-server/tests/test_ro_input_roster_sections.py -q
```

Expected: PASS, or SKIP only if the F8 DB is unavailable.

- [ ] **Step 4: Rust ruletool tests**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml --test ruletool_aggregation
```

Expected: PASS.

- [ ] **Step 5: Live-server build**

Run:

```bash
npm --prefix live-server run build
```

Expected: PASS.

- [ ] **Step 6: Git scope review**

Run:

```bash
git diff --stat
git status --short
```

Expected: only files listed in this plan are modified.

- [ ] **Step 7: Try GitNexus detect_changes before final commit**

Run:

```bash
node .gitnexus/run.cjs detect_changes
```

Expected: report changed symbols, or the same `@ladybugdb/core` local dependency blocker. Include the result in final notes.

### Task 11: Commit Implementation

**Files:**
- All modified implementation and test files.

- [ ] **Step 1: Stage reviewed changes**

Run:

```bash
git add connector-server/src/__tests__/unit/transform-roster-ground-db.test.ts \
  live-server/src/__tests__/unit/roster-ground-inbound-worker.test.ts \
  live-server/src/workers/roster-ground-inbound-worker.ts \
  engine-server/F8/ro_input_builder/sections/roster.py \
  engine-server/tests/test_ro_input_roster_sections.py \
  live-server/src/services/manday/manday-tool-rust.ts \
  live-server/src/services/manday/manday-tool.ts \
  rule-engine-rs/src/bin/ruletool.rs \
  rule-engine-rs/tests/ruletool_aggregation.rs
```

- [ ] **Step 2: Commit**

Run:

```bash
git commit -m "feat: integrate roster ground credited minutes"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage:
  - Inbound `credit` mapping: Task 1.
  - Persist to act/sch roster columns: Tasks 2 and 3.
  - ro_input `creditedMinutes`: Tasks 4 and 5.
  - Manday priority act, sch, fixed, pct: Tasks 6 through 9.
  - Focused verification: Task 10.
- Placeholder scan:
  - No `TBD`, `TODO`, `placeholder`, or open-ended "add tests" instructions.
- Type consistency:
  - `actCreditMin` and `schCreditMin` are introduced in `ActivityRow`, populated by `manday-tool.ts`, and consumed by `toTsv`.
  - Rust appended TSV positions are field indexes 8 and 9 after the existing 8-column protocol.
