# flyDuties Duty Bounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Live/Scenario legality `flyDuties` use pairing_segment duty start/end (brief→debrief) so 7501/7503/7504 match PBS/CARS, via one shared SQL helper.

**Architecture:** Export `dutyStartUtcExpr` / `dutyEndUtcExpr` from `assignment-overlap-rest-sql.mjs`. Wire all three legality loaders’ `flyDuties` to `min/max` those expressions. When `byDutySeq` is true, restrict the `pairing_segment` join with `ps.duty_seq = rf.duty_seq` so duty bounds do not span sibling duties (flight-time path used `rf.*` which was already duty-scoped by GROUP BY).

**Tech Stack:** Node ESM (`.mjs`), `node:test` for helper string tests, Vitest for live-server unit tests; remote PG optional smoke for SQL EXPLAIN.

## Global Constraints

- Scope: `flyDuties` only (7501 / 7503 / 7504). Do **not** change `groundWork`, Rust bins, or Gantt paint times.
- Coalesce order (verbatim from spec):
  - start: `duty_act_str_dt_utc` → `duty_sch_str_dt_utc` → `brief_start_utc` → `rf.sch_str_dt_utc`
  - end: `duty_act_end_dt_utc` → `duty_sch_end_dt_utc` → `debrief_end_utc` → `rf.sch_end_dt_utc`
- Do **not** change `pairingEndRestSecsSql` / rule 1001 in this plan.
- Live + Scenario + scenario-source must share the same helper (§Gantt-Unify / no loader drift).
- No DB migration; no secrets in docs/tests.
- Anchor acceptance: crew `2560` + pairings `15152` / `15279` → 7504 once duty bounds feed the engine (verify in Task 3/4).

## File map

| File | Responsibility |
|------|----------------|
| `live-server/scripts/assignment-overlap-rest-sql.mjs` | Shared `dutyStartUtcExpr` / `dutyEndUtcExpr` |
| `live-server/scripts/__tests__/assignment-overlap-rest-sql.test.mjs` | Assert coalesce order + aliases |
| `live-server/scripts/live-legality.mjs` | Live `flyDuties` uses helpers + duty_seq join |
| `live-server/scripts/scenario-legality.mjs` | Scenario `flyDuties` same |
| `live-server/scripts/scenario-legality-source.mjs` | Scenario-source `flyDuties` same |
| `live-server/scripts/__tests__/flyduties-duty-bounds-sql.test.mjs` | Snapshot that each loader SQL text includes duty exprs + duty_seq gate |

---

### Task 1: Shared duty bound SQL helpers

**Files:**
- Modify: `live-server/scripts/assignment-overlap-rest-sql.mjs`
- Test: `live-server/scripts/__tests__/assignment-overlap-rest-sql.test.mjs`

**Interfaces:**
- Consumes: none (pure string builders)
- Produces:
  - `dutyStartUtcExpr({ rosterAlias?: string, segmentAlias?: string }): string`
  - `dutyEndUtcExpr({ rosterAlias?: string, segmentAlias?: string }): string`
  - Defaults: `rosterAlias = 'rf'`, `segmentAlias = 'ps'`

- [ ] **Step 1: Write the failing tests**

Append to `live-server/scripts/__tests__/assignment-overlap-rest-sql.test.mjs`:

```javascript
import {
  pairingEndRestSecsSql,
  endRestSecsFromDutyAndRestMin,
  dutyStartUtcExpr,
  dutyEndUtcExpr,
} from '../assignment-overlap-rest-sql.mjs'

test('dutyStartUtcExpr prefers act → sch → brief → roster sch', () => {
  const expr = dutyStartUtcExpr({})
  assert.match(expr, /ps\.duty_act_str_dt_utc/)
  assert.match(expr, /ps\.duty_sch_str_dt_utc/)
  assert.match(expr, /ps\.brief_start_utc/)
  assert.match(expr, /rf\.sch_str_dt_utc/)
  const act = expr.indexOf('duty_act_str_dt_utc')
  const sch = expr.indexOf('duty_sch_str_dt_utc')
  const brief = expr.indexOf('brief_start_utc')
  const flight = expr.indexOf('rf.sch_str_dt_utc')
  assert.ok(act < sch && sch < brief && brief < flight)
})

test('dutyEndUtcExpr prefers act → sch → debrief → roster sch', () => {
  const expr = dutyEndUtcExpr({})
  assert.match(expr, /ps\.duty_act_end_dt_utc/)
  assert.match(expr, /ps\.duty_sch_end_dt_utc/)
  assert.match(expr, /ps\.debrief_end_utc/)
  assert.match(expr, /rf\.sch_end_dt_utc/)
  const act = expr.indexOf('duty_act_end_dt_utc')
  const sch = expr.indexOf('duty_sch_end_dt_utc')
  const debrief = expr.indexOf('debrief_end_utc')
  const flight = expr.indexOf('rf.sch_end_dt_utc')
  assert.ok(act < sch && sch < debrief && debrief < flight)
})

test('duty bound helpers honor custom aliases', () => {
  const start = dutyStartUtcExpr({ rosterAlias: 'r', segmentAlias: 'seg' })
  const end = dutyEndUtcExpr({ rosterAlias: 'r', segmentAlias: 'seg' })
  assert.match(start, /seg\.duty_act_str_dt_utc/)
  assert.match(start, /r\.sch_str_dt_utc/)
  assert.match(end, /seg\.duty_act_end_dt_utc/)
  assert.match(end, /r\.sch_end_dt_utc/)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd live-server && node --test scripts/__tests__/assignment-overlap-rest-sql.test.mjs
```

Expected: FAIL — `dutyStartUtcExpr` / `dutyEndUtcExpr` not exported.

- [ ] **Step 3: Implement helpers**

Append to `live-server/scripts/assignment-overlap-rest-sql.mjs`:

```javascript
/**
 * SQL timestamp expression: FLY duty start (CARS / PBS PairingDuty aligned).
 * Prefer act duty → sch duty → brief → roster flight sch.
 */
export function dutyStartUtcExpr(opts = {}) {
  const rf = opts.rosterAlias ?? 'rf'
  const ps = opts.segmentAlias ?? 'ps'
  return `coalesce(${ps}.duty_act_str_dt_utc, ${ps}.duty_sch_str_dt_utc, ${ps}.brief_start_utc, ${rf}.sch_str_dt_utc)`
}

/**
 * SQL timestamp expression: FLY duty end (CARS / PBS PairingDuty aligned).
 * Prefer act duty → sch duty → debrief end → roster flight sch.
 */
export function dutyEndUtcExpr(opts = {}) {
  const rf = opts.rosterAlias ?? 'rf'
  const ps = opts.segmentAlias ?? 'ps'
  return `coalesce(${ps}.duty_act_end_dt_utc, ${ps}.duty_sch_end_dt_utc, ${ps}.debrief_end_utc, ${rf}.sch_end_dt_utc)`
}
```

Keep existing `pairingEndRestSecsSql` / `endRestSecsFromDutyAndRestMin` unchanged.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd live-server && node --test scripts/__tests__/assignment-overlap-rest-sql.test.mjs
```

Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add live-server/scripts/assignment-overlap-rest-sql.mjs \
  live-server/scripts/__tests__/assignment-overlap-rest-sql.test.mjs
git commit -m "$(cat <<'EOF'
feat(live-server): add shared FLY duty start/end SQL exprs

Align legality time bounds with PBS/CARS coalesce order for flyDuties.
EOF
)"
```

---

### Task 2: Wire `flyDuties` in Live + Scenario loaders

**Files:**
- Modify: `live-server/scripts/live-legality.mjs` (`flyDuties`)
- Modify: `live-server/scripts/scenario-legality.mjs` (`flyDuties`)
- Modify: `live-server/scripts/scenario-legality-source.mjs` (`flyDuties`)
- Create: `live-server/scripts/__tests__/flyduties-duty-bounds-sql.test.mjs`

**Interfaces:**
- Consumes: `dutyStartUtcExpr`, `dutyEndUtcExpr` from `./assignment-overlap-rest-sql.mjs`
- Produces: `flyDuties` rows whose `start_secs` / `end_secs` / `day_ord` use duty bounds; when `byDutySeq===true`, segment join includes `ps.duty_seq = rf.duty_seq`

- [ ] **Step 1: Write the failing SQL-shape test**

Create `live-server/scripts/__tests__/flyduties-duty-bounds-sql.test.mjs`:

```javascript
/**
 * Guards flyDuties loaders against regressing to bare rf.sch_* duty bounds.
 * Reads source text (no DB) — same style as assignment-overlap-rest-sql tests.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const loaders = [
  '../live-legality.mjs',
  '../scenario-legality.mjs',
  '../scenario-legality-source.mjs',
]

for (const rel of loaders) {
  test(`${path.basename(rel)} flyDuties uses duty bound helpers and duty_seq gate`, () => {
    const src = fs.readFileSync(path.join(dir, rel), 'utf8')
    assert.match(src, /dutyStartUtcExpr/)
    assert.match(src, /dutyEndUtcExpr/)
    // Must not leave the old bare aggregation as the only start/end source inside flyDuties.
    const flyIdx = src.indexOf('async flyDuties')
    assert.ok(flyIdx >= 0, 'flyDuties missing')
    const nextMethod = src.indexOf('async ', flyIdx + 1)
    const block = src.slice(flyIdx, nextMethod > flyIdx ? nextMethod : undefined)
    assert.match(block, /dutyStartUtcExpr/)
    assert.match(block, /dutyEndUtcExpr/)
    assert.match(block, /ps\.duty_seq\s*=\s*rf\.duty_seq/)
    assert.doesNotMatch(
      block,
      /extract\(epoch from min\(rf\.sch_str_dt_utc\)\)::bigint as start_secs/,
    )
    assert.doesNotMatch(
      block,
      /extract\(epoch from max\(rf\.sch_end_dt_utc\)\)::bigint as end_secs/,
    )
  })
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd live-server && node --test scripts/__tests__/flyduties-duty-bounds-sql.test.mjs
```

Expected: FAIL — loaders still use `min(rf.sch_str_dt_utc)` / lack `dutyStartUtcExpr`.

- [ ] **Step 3: Update Live `flyDuties`**

In `live-server/scripts/live-legality.mjs`:

1. Extend import:

```javascript
import { pairingEndRestSecsSql, dutyStartUtcExpr, dutyEndUtcExpr } from './assignment-overlap-rest-sql.mjs'
```

2. Replace `flyDuties` body times + join (keep filters/group/endRestSql). Pattern:

```javascript
async flyDuties(byDutySeq) {
  const grp = byDutySeq ? 'rf.crew_id, rf.pairing_id, rf.duty_seq' : 'rf.crew_id, rf.pairing_id'
  const dutyStart = dutyStartUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
  const dutyEnd = dutyEndUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
  const dutySeqJoin = byDutySeq ? ' and ps.duty_seq = rf.duty_seq' : ''
  const endRestSql = pairingEndRestSecsSql({
    segmentTables: ['pairing_segment'],
    pairingIdExpr: 'rf.pairing_id',
    rosterAlias: 'rf',
  })
  return (await db.query(
    `select rf.crew_id, rf.pairing_id,
            extract(epoch from min(${dutyStart}))::bigint as start_secs,
            extract(epoch from max(${dutyEnd}))::bigint as end_secs,
            ${endRestSql},
            floor(extract(epoch from min(${dutyStart})) / 86400)::bigint as day_ord,
            coalesce((array_agg(nullif(rf.assignment_group, '') order by rf.sch_str_dt_utc))[1], max(p.assignment_group), 'FLY') as assignment_group,
            coalesce((array_agg(nullif(rf.assignment, '') order by rf.sch_str_dt_utc))[1], max(p.assignment), 'FLY') as assignment,
            coalesce(nullif(string_agg(distinct nullif(ps.seg_assignment, ''), '|' order by nullif(ps.seg_assignment, '')), ''), '*') as attributes
       from roster_flight rf
       left join pairing p on p.id = rf.pairing_id and p.is_deleted = 0
       left join pairing_segment ps on ps.pairing_id = rf.pairing_id and coalesce(ps.is_deleted, 0) = 0${dutySeqJoin}
      where rf.is_deleted=0 and rf.sch_str_dt_utc >= $1 and rf.sch_str_dt_utc < $2
        and rf.assignment_group='FLY' and rf.pairing_id is not null
      group by ${grp}`, P)).rows
},
```

Note: `array_agg` / `order by rf.sch_*` stays on flight sch (attribute pick only).

- [ ] **Step 4: Update Scenario `flyDuties`**

Same pattern in `live-server/scripts/scenario-legality.mjs`: import helpers; replace start/end/day_ord; append `${dutySeqJoin}` on the existing `left join scenario.pairing_segment ps ...` line (keep scenario_id join predicates).

- [ ] **Step 5: Update scenario-source `flyDuties`**

Same pattern in `live-server/scripts/scenario-legality-source.mjs` (f8 tables / crew id filters unchanged).

- [ ] **Step 6: Run SQL-shape + helper tests**

```bash
cd live-server && node --test \
  scripts/__tests__/assignment-overlap-rest-sql.test.mjs \
  scripts/__tests__/flyduties-duty-bounds-sql.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add live-server/scripts/live-legality.mjs \
  live-server/scripts/scenario-legality.mjs \
  live-server/scripts/scenario-legality-source.mjs \
  live-server/scripts/__tests__/flyduties-duty-bounds-sql.test.mjs
git commit -m "$(cat <<'EOF'
feat(live-server): flyDuties use duty start/end for 7501/7503/7504

Shared coalesce helper; duty_seq join when byDutySeq so bounds stay per-duty.
EOF
)"
```

---

### Task 3: Anchor regression — duty times make 7504 WOCL for 15152-shaped bounds

**Files:**
- Modify: `live-server/tests/unit/legality-recheck-core-param.spec.ts` (add one `rule7504` case)
- Optional smoke (same task): remote read-only SQL documenting expected duty epochs for pairings `15152` / `15279`

**Interfaces:**
- Consumes: existing `rule7504` + mocked `flyDuties` (already the adapter contract)
- Produces: regression proving that **duty-local** WOCL starts (05:45 PDT) feed 7504 the same way production will after Task 2

Rationale: `rule7504` already mocks `flyDuties`; it does not execute loader SQL. This task locks the **semantic** contract: if loaders emit duty-start epochs for 15152/15279-shaped times, the rule path fires. Loader SQL shape is already guarded in Task 2.

- [ ] **Step 1: Write the failing / documenting Vitest**

In `live-server/tests/unit/legality-recheck-core-param.spec.ts` inside `describe('rule7504')`, add:

```typescript
it('fires when consecutive FLY duties are WOCL only after brief (15152/15279 shape)', async () => {
  // Flight dep would be 13:45Z = 06:45 PDT (outside WOCL). Duty/brief 12:45Z = 05:45 PDT (inside).
  // Crew base YVR offset -420. Gap between duty ends/starts < 55 RH → bin emits violation.
  const p15152Start = Math.floor(Date.parse('2026-07-15T12:45:00.000Z') / 1000)
  const p15152End = Math.floor(Date.parse('2026-07-15T18:05:00.000Z') / 1000)
  const p15279Start = Math.floor(Date.parse('2026-07-17T12:45:00.000Z') / 1000)
  const p15279End = Math.floor(Date.parse('2026-07-17T18:05:00.000Z') / 1000)
  // gap ~46.7h < 55 RH
  fakeBin(`2560\t15152\t${p15152End}\t${p15279Start}\t-420\t2800`)
  const source = {
    crewOffsets: vi.fn().mockResolvedValue(new Map([['2560', -420]])),
    crewBaseTimezone: vi.fn().mockResolvedValue(new Map([['2560', 'America/Vancouver']])),
    flyDuties: vi.fn().mockResolvedValue([
      { crew_id: '2560', pairing_id: 15152, start_secs: p15152Start, end_secs: p15152End },
      { crew_id: '2560', pairing_id: 15279, start_secs: p15279Start, end_secs: p15279End },
    ]),
  }

  const violations = (await rule7504(source as never, ctx7504 as never)) as Array<{
    rule_code: string
    crew_id: string
  }>
  expect(violations).toHaveLength(1)
  expect(violations[0].crew_id).toBe('2560')
})
```

Adjust `fakeBin` TSV fields to match whatever `rule7504` currently expects (copy the field layout from the neighboring test `appends both WOCL duty_start dates...`). If the real binary is not available in CI, keep the same `fakeBin` pattern as siblings — this test documents the **input contract** after duty bounds, not the Rust WOCL classifier.

- [ ] **Step 2: Run Vitest**

```bash
cd live-server && npx vitest run tests/unit/legality-recheck-core-param.spec.ts -t '15152/15279'
```

Expected: PASS (with correct fakeBin layout). If FAIL due to TSV shape, fix the test to match existing `rule7504` fakeBin contract — do not weaken assertions on crew_id / length.

- [ ] **Step 3 (optional but preferred): Remote read-only smoke**

Using `DATABASE_URL_F8` (§Remote-DB-Only), confirm pairings still have duty ≠ flight:

```sql
SELECT pairing_id, duty_seq,
       min(sch_str_dt_utc) AS flt_start,
       min(duty_sch_str_dt_utc) AS duty_start,
       min(brief_start_utc) AS brief_start
  FROM f8.pairing_segment
 WHERE pairing_id IN (15152, 15279) AND coalesce(is_deleted,0)=0
 GROUP BY pairing_id, duty_seq
 ORDER BY 1, 2;
```

Paste result into the commit message body or a short note in the PR; do not commit secrets.

- [ ] **Step 4: Commit**

```bash
git add live-server/tests/unit/legality-recheck-core-param.spec.ts
git commit -m "$(cat <<'EOF'
test(live-server): 7504 regression for duty-brief WOCL (15152/15279 shape)

Locks flyDuties duty-bound epochs as the input contract for spacing rule.
EOF
)"
```

---

### Task 4: Manual / Playwright verification gate (Live recheck)

**Files:**
- None required if Task 2–3 pass and optional remote smoke is green.
- Add Playwright only if the team needs UI proof that Alert Center shows 7504 for crew `2560` after a Live recheck with those pairings assigned.

**Minimum gate (always):**

- [ ] **Step 1: Re-run automated suite**

```bash
cd live-server && node --test \
  scripts/__tests__/assignment-overlap-rest-sql.test.mjs \
  scripts/__tests__/flyduties-duty-bounds-sql.test.mjs
cd live-server && npx vitest run tests/unit/legality-recheck-core-param.spec.ts -t 'rule7504'
```

Expected: PASS. Paste receipt in the delivery message (§No-Illusion).

- [ ] **Step 2: Decide on UI E2E**

If SIT/local Live has crew `2560` with both pairings assigned in-window:

- Prefer a focused Playwright that: open Live gantt → ensure roster shows crew → trigger legality refresh / wait for bell → assert Alert Center or crew-filtered violation list contains rule **7504** for that crew.
- If data is unstable on SIT, document manual steps in the PR and skip E2E; do **not** invent a fake always-green UI test.

- [ ] **Step 3: Final commit only if E2E file added**

```bash
git add e2e/...
git commit -m "test(e2e): assert Live 7504 for crew 2560 after duty-bound flyDuties"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Shared helper for duty coalesce | Task 1 |
| Coalesce order act→sch→brief/debrief→flight | Task 1 |
| Live / Scenario / scenario-source `flyDuties` | Task 2 |
| `start_secs` / `end_secs` / `day_ord` from duty | Task 2 |
| `byDutySeq` must not bleed sibling duties | Task 2 (`duty_seq` join) |
| No `groundWork` / 1001 / Gantt paint / migration | Global Constraints |
| Anchor 2560 / 15152 / 15279 | Task 3 (+ optional Task 4) |

## Out of scope reminders

- `pairingEndRestSecsSql` still uses pairing/`rf` sch end + rest minutes — separate workstream if 1001 drifts.
- Preview path inherits via same `flyDuties` adapters; no separate preview SQL unless a fork is found during Task 2.
