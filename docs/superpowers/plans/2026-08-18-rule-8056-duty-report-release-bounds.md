# Rule 8056 Pairing Bounds = Duty Report / Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 8056 `flyByPairing` pairing windows use CARS duty report/release instead of first-flight STD / last-flight STA, keeping one window per `(crew, pairing)`.

**Architecture:** Reuse `dutyStartUtcExpr` / `dutyEndUtcExpr` exactly as `flyDuties` does. Live joins `pairing_segment` on `pairing_id` + `duty_seq`. Scenario coalesces scenario then live `pairing_segment` (same `lps` fallback as 1001 / scenario `flyDuties`). Rust `check-8056` stays `next.start_utc - current.end_utc`. Ground rows stay on `rf.sch_*`.

**Tech Stack:** Node ESM (`.mjs`), `node:test`, remote PostgreSQL `EXPLAIN` via existing `--env-file=.env` verify scripts.

## Global Constraints

- Grain: one 8056 window per `(crew_id, pairing_id)` — do **not** split by `duty_seq`.
- Pairing `start_secs` = `extract(epoch from min(dutyStartUtcExpr))`; `end_secs` = `extract(epoch from max(dutyEndUtcExpr))`. Do **not** alias `end_duty_secs` (8056 TSV expects `end_secs`).
- Coalesce order (verbatim): start `duty_act_str_dt_utc` → `duty_sch_str_dt_utc` → `brief_start_utc` → `rf.sch_str_dt_utc`; end `duty_act_end_dt_utc` → `duty_sch_end_dt_utc` → `debrief_end_utc` → `rf.sch_end_dt_utc`.
- `pairingEndRestSecsSql` must pass `segmentAlias: 'ps'` (rest from duty end, not last STA).
- Ground / `pairing_id is null` rows: leave `rf.sch_str_dt_utc` / `rf.sch_end_dt_utc` unchanged.
- Do **not** change Rust `check-8056`, TSV column layout, or same-`pairing_id` skip.
- Do **not** change `dep_arp` / `arv_arp` usage (label / airport / location / zone only).
- Live + Scenario + seed `flyByPairing` must stay aligned (§Gantt-Unify).
- No DB migration; no secrets in docs/tests.
- §No-Auto-Commit: do not `git commit` unless the user asks.
- Spec: `docs/superpowers/specs/2026-08-18-rule-8056-duty-report-release-bounds-design.md`.

## File map

| File | Responsibility |
|------|----------------|
| `live-server/scripts/__tests__/flybypairing-duty-bounds-sql.test.mjs` | Capture `flyByPairing` SQL; assert report/release |
| `live-server/scripts/live-legality.mjs` | Live `flyByPairing` |
| `live-server/scripts/scenario-legality.mjs` | Scenario `flyByPairing` + live segment fallback |
| `live-server/scripts/scenario-legality-source.mjs` | Seed `flyByPairing` |
| `live-server/scripts/check-8056-spacing.mjs` | Live harness matches persisted bounds |
| `live-server/scripts/verify-assignment-overlap-sql.mjs` | Also `EXPLAIN` the three `flyByPairing` shapes |
| `docs/superpowers/specs/2026-08-18-rule-1001-duty-report-release-bounds-design.md` | Strike 8056 out-of-scope line |

---

### Task 1: Failing `flyByPairing` SQL capture tests

**Files:**
- Create: `live-server/scripts/__tests__/flybypairing-duty-bounds-sql.test.mjs`

**Interfaces:**
- Consumes: `liveSource(db, from, to).flyByPairing(groups, codes)`, `scenarioSource(db, scenarioId, ctx).flyByPairing`, `buildSeedSource(db, scenarioId, ctx).flyByPairing`
- Produces: tests that fail until pairing `start_secs`/`end_secs` use duty helpers

- [ ] **Step 1: Write the failing test file**

```javascript
/**
 * Capture 8056 flyByPairing SQL from Live / Scenario / seed loaders
 * and assert pairing rows use duty report/release, not first/last flight sch.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { liveSource } from '../live-legality.mjs'
import { scenarioSource } from '../scenario-legality.mjs'
import { buildSeedSource } from '../scenario-legality-source.mjs'

function captureDb() {
  const captured = []
  return {
    captured,
    query: async (queryConfig, values) => {
      const text = typeof queryConfig === 'string' ? queryConfig : queryConfig?.text
      captured.push({ text, values })
      return { rows: [] }
    },
  }
}

function assertPairingDutyBounds(sql, label) {
  assert.match(sql, /duty_act_str_dt_utc/, `${label} must select duty report`)
  assert.match(sql, /brief_start_utc/, `${label} must fall back to brief`)
  assert.match(sql, /duty_act_end_dt_utc/, `${label} must select duty release`)
  assert.match(sql, /debrief_end_utc/, `${label} must fall back to debrief`)
  assert.match(sql, /ps\.duty_seq = rf\.duty_seq/, `${label} must gate pairing_segment on duty_seq`)
  assert.doesNotMatch(
    sql,
    /extract\(epoch from min\(rf\.sch_str_dt_utc\)\)::bigint as start_secs/,
    `${label} must not use first-flight STD as pairing start`,
  )
  assert.doesNotMatch(
    sql,
    /extract\(epoch from max\(rf\.sch_end_dt_utc\)\)::bigint as end_secs/,
    `${label} must not use last-flight STA as pairing end`,
  )
}

test('live flyByPairing pairing rows use report/release', async () => {
  const db = captureDb()
  await liveSource(db, '2026-08-01', '2026-09-01').flyByPairing([], [])
  const sql = db.captured.at(-1)?.text ?? ''
  assertPairingDutyBounds(sql, 'live')
  assert.match(sql, /join pairing_segment ps/)
})

test('scenario flyByPairing pairing rows use report/release with live segment fallback', async () => {
  const db = captureDb()
  await scenarioSource(db, 718, {}).flyByPairing([], [])
  const sql = db.captured.at(-1)?.text ?? ''
  assertPairingDutyBounds(sql, 'scenario')
  assert.match(sql, /f8\.pairing_segment lps/)
})

test('seed flyByPairing pairing rows use report/release', async () => {
  const db = captureDb()
  await buildSeedSource(db, 0, { seedCrewIds: ['2496'], seedPairingIds: [15264] }).flyByPairing([], [])
  const sql = db.captured.at(-1)?.text ?? ''
  assertPairingDutyBounds(sql, 'seed')
  assert.match(sql, /f8\.pairing_segment ps/)
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `cd live-server && node --test scripts/__tests__/flybypairing-duty-bounds-sql.test.mjs`

Expected: FAIL — pairing SQL still has `min(rf.sch_str_dt_utc)` / `max(rf.sch_end_dt_utc)` as `start_secs` / `end_secs`; scenario missing `lps`.

---

### Task 2: Wire Live / Scenario / seed `flyByPairing`

**Files:**
- Modify: `live-server/scripts/live-legality.mjs` (`async flyByPairing`)
- Modify: `live-server/scripts/scenario-legality.mjs` (`async flyByPairing`)
- Modify: `live-server/scripts/scenario-legality-source.mjs` (`async flyByPairing`)

**Interfaces:**
- Consumes: `dutyStartUtcExpr`, `dutyEndUtcExpr`, `pairingEndRestSecsSql` from `assignment-overlap-rest-sql.mjs` (already imported in all three files)
- Produces: pairing `start_secs`/`end_secs` from duty report/release; `end_rest_secs` from duty end + rest

Before editing, run GitNexus `impact({target: "flyByPairing", direction: "upstream"})` if the MCP is available; blast radius is `rule8056` in `legality-recheck-core.mjs` plus the three loaders. Do not rename the method.

- [ ] **Step 1: Live loader**

In `live-legality.mjs` `flyByPairing`, before `endRestSql`:

```javascript
const dutyBoundOpts = { rosterAlias: 'rf', segmentAlias: 'ps' }
const dutyStart = dutyStartUtcExpr(dutyBoundOpts)
const dutyEnd = dutyEndUtcExpr(dutyBoundOpts)
const endRestSql = pairingEndRestSecsSql({
  segmentTables: ['pairing_segment'],
  pairingIdExpr: 'rf.pairing_id',
  rosterAlias: 'rf',
  segmentAlias: 'ps',
})
```

Replace pairing-row start/end and the `pairing_segment` join (ground `union all` unchanged):

```sql
extract(epoch from min(${dutyStart}))::bigint as start_secs,
extract(epoch from max(${dutyEnd}))::bigint as end_secs,
```

```sql
left join pairing_segment ps on ps.pairing_id = rf.pairing_id and coalesce(ps.is_deleted, 0) = 0 and ps.duty_seq = rf.duty_seq
```

Leave `duty_end_ts` as `max(rf.sch_end_dt_utc)` (crew_base lateral only; not in the 8056 gap).

- [ ] **Step 2: Scenario loader**

Mirror scenario `flyDuties` / 1001 `assignmentOverlapRosters`:

```javascript
const scenarioDutyStart = dutyStartUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
const liveDutyStart = dutyStartUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
const dutyStart = `coalesce(${scenarioDutyStart}, ${liveDutyStart}, rf.sch_str_dt_utc)`
const scenarioDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
const liveDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
const dutyEnd = `coalesce(${scenarioDutyEnd}, ${liveDutyEnd}, rf.sch_end_dt_utc)`
const endRestSql = pairingEndRestSecsSql({
  segmentTables: ['scenario.pairing_segment', 'f8.pairing_segment'],
  pairingIdExpr: 'rf.pairing_id',
  rosterAlias: 'rf',
  segmentAlias: 'ps',
  scenarioIdParam: '$1',
})
```

Pairing start/end: `min(${dutyStart})` / `max(${dutyEnd})` as `start_secs` / `end_secs`.

Joins (keep existing `scenario.pairing` join):

```sql
left join scenario.pairing_segment ps on ps.scenario_id = rf.scenario_id and ps.pairing_id = rf.pairing_id and coalesce(ps.is_deleted, 0) = 0 and ps.duty_seq = rf.duty_seq
left join f8.pairing_segment lps
  on lps.pairing_id = rf.pairing_id
 and coalesce(lps.is_deleted, 0) = 0
 and lps.duty_seq = rf.duty_seq
 and not exists (
   select 1
     from scenario.pairing_segment ps_fallback
    where ps_fallback.scenario_id = rf.scenario_id
      and ps_fallback.pairing_id = rf.pairing_id
      and coalesce(ps_fallback.is_deleted, 0) = 0
      and ps_fallback.duty_seq = rf.duty_seq
 )
```

Ground `union all` unchanged.

- [ ] **Step 3: Seed loader**

Same as Live, against `f8.roster_flight` / `f8.pairing_segment`. Keep `::bigint::text` on `start_secs`/`end_secs` if the seed mapper still stringifies epochs. `endRestSql` already uses `segmentTables: ['f8.pairing_segment']`; add `segmentAlias: 'ps'` and `ps.duty_seq = rf.duty_seq` on the join.

- [ ] **Step 4: Re-run capture tests**

Run: `cd live-server && node --test scripts/__tests__/flybypairing-duty-bounds-sql.test.mjs scripts/__tests__/flyduties-duty-bounds-sql.test.mjs scripts/__tests__/assignment-overlap-rosters-sql.test.mjs`

Expected: all PASS (8056 tests now green; 7501/1001 loaders unchanged).

---

### Task 3: Harness + remote `EXPLAIN` gate

**Files:**
- Modify: `live-server/scripts/check-8056-spacing.mjs` (`extractDuties`)
- Modify: `live-server/scripts/verify-assignment-overlap-sql.mjs`

**Interfaces:**
- Consumes: `dutyStartUtcExpr` / `dutyEndUtcExpr` from `assignment-overlap-rest-sql.mjs`
- Produces: harness SQL matches Live `flyByPairing` pairing bounds; `npm run verify:assignment-overlap-sql` also EXPLAINs three `flyByPairing` shapes

- [ ] **Step 1: Update the live 8056 harness pairing query**

At top of `check-8056-spacing.mjs` import the helpers. In `extractDuties`, replace the pairing `SELECT` so start/end use duty expressions and join `pairing_segment` on `duty_seq`. Keep `GROUP BY crew_id, pairing_id`. Do not add rest/group filters this harness never had.

```javascript
import { dutyStartUtcExpr, dutyEndUtcExpr } from './assignment-overlap-rest-sql.mjs'

const dutyStart = dutyStartUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
const dutyEnd = dutyEndUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
```

SQL core:

```sql
SELECT rf.crew_id,
       rf.pairing_id,
       EXTRACT(EPOCH FROM MIN(${dutyStart}))::bigint AS start_secs,
       EXTRACT(EPOCH FROM MAX(${dutyEnd}))::bigint AS end_secs,
       ...
  FROM roster_flight rf
  LEFT JOIN pairing_segment ps
    ON ps.pairing_id = rf.pairing_id
   AND coalesce(ps.is_deleted, 0) = 0
   AND ps.duty_seq = rf.duty_seq
 WHERE rf.is_deleted = 0
   AND rf.assignment_group = 'FLY'
   AND rf.pairing_id IS NOT NULL
   AND rf.sch_str_dt_utc >= $1::timestamptz
   AND rf.sch_str_dt_utc <  $2::timestamptz
 GROUP BY rf.crew_id, rf.pairing_id
```

Update the file header comment: start/end are duty report/release, not `MIN(sch_str)` / `MAX(sch_end)`.

- [ ] **Step 2: Extend the remote EXPLAIN gate**

In `verify-assignment-overlap-sql.mjs`, after the overlap loop, capture `flyByPairing([], [])` from the same three factories and `EXPLAIN` each. Fail loud on parse errors; do not skip.

Rename the final log line so it covers both `assignmentOverlapRosters` and `flyByPairing` (keep the npm script name `verify:assignment-overlap-sql`).

- [ ] **Step 3: Run unit tests + remote EXPLAIN**

Run:

```bash
cd live-server && node --test scripts/__tests__/flybypairing-duty-bounds-sql.test.mjs
cd live-server && npm run verify:assignment-overlap-sql
```

Expected: capture tests PASS; EXPLAIN prints `PASS live`, `PASS scenario`, `PASS scenario-source` for overlap **and** flyByPairing (6 shapes total, or 3+3 logged clearly).

Do not run Playwright 8056 e2e in this task. If a later recheck shows stale message times, update those tests under §Stale-Test — do not weaken them.

---

### Task 4: Spec cross-link

**Files:**
- Modify: `docs/superpowers/specs/2026-08-18-rule-1001-duty-report-release-bounds-design.md` (Out of scope)

- [ ] **Step 1: Replace the 8056 out-of-scope bullet**

Change:

```
- 8056 `flyByPairing` still uses flight STD/STA (separate follow-up)
```

to:

```
- 8056 `flyByPairing` duty report/release: see `2026-08-18-rule-8056-duty-report-release-bounds-design.md`
```

- [ ] **Step 2: Confirm spec coverage**

Spec requirements vs tasks: pairing grain (all tasks), report/release helpers (Task 2), scenario live fallback (Task 2), ground unchanged (Task 2), rest `segmentAlias` (Task 2), harness (Task 3), EXPLAIN (Task 3), Rust unchanged (no task). No placeholders.

---

## Self-review

1. **Spec coverage:** grain, helpers, loaders, harness, EXPLAIN, ground, rest, Rust — each has a task.
2. **Placeholders:** none.
3. **Types:** `start_secs` / `end_secs` (not `end_duty_secs`); seed may keep `::bigint::text`.
