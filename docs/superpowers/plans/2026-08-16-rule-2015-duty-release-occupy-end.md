# Rule 2015 Duty-Release Occupy End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Live/Scenario 7505/7507 activity occupy end use Duty Release (actual→scheduled), so Rule 2015 compares against release TOD—not flight arrival—without touching any other rule loaders.

**Architecture:** Only rewrite the three `assignmentsAll()` SQL adapters. Reuse existing `dutyEndUtcExpr` inside those methods. Keep per-`roster_flight` row grain (join segment by `duty_seq`+`seg_seq` or lateral duty-end lookup). Rust / PBS / `flyDuties` / `rosterDuties` untouched.

**Tech Stack:** Node `node:test` SQL-capture tests, live-server legality adapters, SIT PG smoke via existing scenario legality scripts, `check-7507` release binary.

## Global Constraints

- Isolation: edit **only** `assignmentsAll()` in `live-legality.mjs`, `scenario-legality.mjs`, `scenario-legality-source.mjs` (plus tests/docs for this change).
- Do **not** modify `flyDuties`, `rosterDuties`, `checkins`, `dutyEndUtcExpr` definition, Rust clamp, or PBS wiring.
- Duty Release coalesce: `duty_act_end_dt_utc → duty_sch_end_dt_utc → debrief_end_utc → rf.sch_end_dt_utc` (via `dutyEndUtcExpr`).
- Live and Scenario both: actual first, else scheduled.
- Scenario: scenario segment first, then live segment fallback (same idea as `flyDuties`).
- Ground / `pairing_id is null`: keep `sch_end_dt_utc` + `act_rest_min`.
- Spec: `docs/superpowers/specs/2026-08-16-rule-2015-duty-release-occupy-end-design.md`
- §No-Auto-Commit: commit only when the user explicitly asks.

---

### Task 1: Failing SQL-capture tests for `assignmentsAll` Duty Release

**Files:**
- Modify: `live-server/scripts/__tests__/flyduties-duty-bounds-sql.test.mjs`
- (Optional later rename is out of scope — keep file name)

**Interfaces:**
- Consumes: `scenarioSource`, `liveSource` / `buildSeedSource` export shapes already used in this file
- Produces: failing assertions that `assignmentsAll` SQL must include duty-end coalesce and segment join / live fallback

- [ ] **Step 1: Write the failing tests**

Replace / extend the existing `scenario-legality assignmentsAll selects pairing_id...` test and add Live + seed coverage:

```js
test('scenario-legality assignmentsAll uses duty release end, not bare sch_end', async () => {
  const { scenarioSource } = await import('../scenario-legality.mjs')
  const captured = []
  const db = {
    query: async (text, values) => {
      captured.push({ text, values })
      return { rows: [] }
    },
  }
  await scenarioSource(db, 740, {}).assignmentsAll()
  const sql = captured.at(-1)?.text ?? ''
  assert.match(sql, /pairing_id/)
  assert.match(sql, /dutyEndUtcExpr|duty_act_end_dt_utc/)
  assert.match(sql, /duty_sch_end_dt_utc|debrief_end_utc/)
  assert.match(sql, /pairing_segment/)
  assert.match(sql, /f8\.pairing_segment|live fallback|lps\.duty_/) // scenario live fallback present
  // Must not be the old one-liner that only reads roster sch_end for e:
  assert.doesNotMatch(
    sql,
    /select crew_id, pairing_id, assignment as code, extract\(epoch from sch_str_dt_utc\)::bigint as s,\s*extract\(epoch from sch_end_dt_utc\)::bigint as e/i,
  )
})

test('live-legality assignmentsAll uses duty release end', async () => {
  const liveMod = await import('../live-legality.mjs')
  // Prefer exported liveSource if available; otherwise read source text of async assignmentsAll block.
  const src = fs.readFileSync(path.join(dir, '../live-legality.mjs'), 'utf8')
  const idx = src.indexOf('async assignmentsAll')
  assert.ok(idx >= 0)
  const next = src.indexOf('async ', idx + 1)
  const block = src.slice(idx, next > idx ? next : undefined)
  assert.match(block, /dutyEndUtcExpr/)
  assert.match(block, /pairing_segment/)
  assert.match(block, /duty_act_end_dt_utc|duty_sch_end_dt_utc/)
  assert.doesNotMatch(
    block,
    /extract\(epoch from sch_end_dt_utc\)::bigint as e,\s*extract\(epoch from sch_end_dt_utc\)::bigint \+ coalesce\(act_rest_min/,
  )
})

test('seed legality assignmentsAll uses live duty release end', async () => {
  const src = fs.readFileSync(path.join(dir, '../scenario-legality-source.mjs'), 'utf8')
  const idx = src.indexOf('async assignmentsAll')
  assert.ok(idx >= 0)
  const next = src.indexOf('async ', idx + 1)
  const block = src.slice(idx, next > idx ? next : undefined)
  assert.match(block, /dutyEndUtcExpr/)
  assert.match(block, /pairing_segment/)
  assert.doesNotMatch(block, /from scenario\.pairing_segment/)
})
```

Tighten regexes to match whatever style you implement in Task 2 (prefer asserting on emitted SQL strings from `dutyEndUtcExpr(...)` after capture, since that helper expands to `coalesce(ps.duty_act_end_dt_utc, ...)`).

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd live-server && node --test scripts/__tests__/flyduties-duty-bounds-sql.test.mjs
```

Expected: new/updated `assignmentsAll` tests FAIL (old bare `sch_end` still present). Existing `flyDuties` tests still PASS.

- [ ] **Step 3: Commit only if user asks** (otherwise skip)

---

### Task 2: Implement Live `assignmentsAll` Duty Release

**Files:**
- Modify: `live-server/scripts/live-legality.mjs` (`assignmentsAll` only, ~1035–1042)

**Interfaces:**
- Consumes: `dutyEndUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })` from `assignment-overlap-rest-sql.mjs`
- Produces: rows `{ crew_id, pairing_id, code, s, e, end_rest_secs }` with `e` = duty release epoch

- [ ] **Step 1: Replace `assignmentsAll` body**

Keep `${W_7505}` / `P_7505`. Join segment 1:1 on duty+seg to avoid row multiplication:

```js
async assignmentsAll() {
  const dutyEnd = dutyEndUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
  return (await db.query(
    `select rf.crew_id, rf.pairing_id, rf.assignment as code,
            extract(epoch from rf.sch_str_dt_utc)::bigint as s,
            extract(epoch from ${dutyEnd})::bigint as e,
            extract(epoch from ${dutyEnd})::bigint
              + coalesce(rf.act_rest_min, 0) * 60 as end_rest_secs
       from roster_flight rf
       left join pairing_segment ps
         on rf.pairing_id is not null
        and ps.pairing_id = rf.pairing_id
        and coalesce(ps.is_deleted, 0) = 0
        and ps.duty_seq = rf.duty_seq
        and ps.seg_seq = rf.seg_seq
      where rf.${/* keep W_7505 but qualify columns */}
```

Qualify `W_7505` columns with `rf.` if the shared predicate currently says bare `is_deleted` / `sch_*`. If rewriting the where-string is risky, use:

```sql
where rf.is_deleted=0 and rf.sch_end_dt_utc > $1 and rf.sch_str_dt_utc < $2
```

(same meaning as today’s `W_7505`) and keep `P_7505`.

`dutyEndUtcExpr` already ends with `rf.sch_end_dt_utc`, so ground rows (null join) still work.

- [ ] **Step 2: Re-run source/SQL tests**

```bash
cd live-server && node --test scripts/__tests__/flyduties-duty-bounds-sql.test.mjs
```

Expected: Live `assignmentsAll` assertion PASS; Scenario/seed still FAIL until Task 3–4.

---

### Task 3: Implement Scenario `assignmentsAll` Duty Release (+ live fallback)

**Files:**
- Modify: `live-server/scripts/scenario-legality.mjs` (`assignmentsAll` only, ~838–845)

**Interfaces:**
- Consumes: `dutyEndUtcExpr` for `ps` and `lps`
- Produces: same row shape; Scenario prefers scenario segment duty end, else live segment, else `rf.sch_end`

- [ ] **Step 1: Replace `assignmentsAll` body**

Mirror `flyDuties` fallback joins:

```js
async assignmentsAll() {
  const scenarioDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
  const liveDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
  const dutyEnd = `coalesce(${scenarioDutyEnd}, ${liveDutyEnd}, rf.sch_end_dt_utc)`
  return (await db.query(
    `select rf.crew_id, rf.pairing_id, rf.assignment as code,
            extract(epoch from rf.sch_str_dt_utc)::bigint as s,
            extract(epoch from ${dutyEnd})::bigint as e,
            extract(epoch from ${dutyEnd})::bigint
              + coalesce(rf.act_rest_min, 0) * 60 as end_rest_secs
       from scenario.roster_flight rf
       left join scenario.pairing_segment ps
         on rf.pairing_id is not null
        and ps.scenario_id = rf.scenario_id
        and ps.pairing_id = rf.pairing_id
        and coalesce(ps.is_deleted, 0) = 0
        and ps.duty_seq = rf.duty_seq
        and ps.seg_seq = rf.seg_seq
       left join f8.pairing_segment lps
         on rf.pairing_id is not null
        and lps.pairing_id = rf.pairing_id
        and coalesce(lps.is_deleted, 0) = 0
        and lps.duty_seq = rf.duty_seq
        and lps.seg_seq = rf.seg_seq
        and not exists (
          select 1 from scenario.pairing_segment ps_fallback
           where ps_fallback.scenario_id = rf.scenario_id
             and ps_fallback.pairing_id = rf.pairing_id
             and coalesce(ps_fallback.is_deleted, 0) = 0
             and ps_fallback.duty_seq = rf.duty_seq
        )
      where rf.scenario_id = $1 and rf.is_deleted = 0
      order by rf.crew_id, rf.sch_str_dt_utc, rf.pairing_id`,
    [scenarioId],
  )).rows
},
```

Adjust `not exists` to match the project’s existing flyDuties gate if it keys only on pairing (not duty_seq)—prefer copying that exact gate from `flyDuties` in the same file for consistency.

- [ ] **Step 2: Re-run tests**

```bash
cd live-server && node --test scripts/__tests__/flyduties-duty-bounds-sql.test.mjs
```

Expected: scenario `assignmentsAll` PASS; seed may still FAIL.

---

### Task 4: Implement seed `assignmentsAll` Duty Release

**Files:**
- Modify: `live-server/scripts/scenario-legality-source.mjs` (`assignmentsAll` only, ~800–813)

**Interfaces:**
- Same row shape; live-only segments (`f8.pairing_segment`), no scenario predicates

- [ ] **Step 1: Replace seed `assignmentsAll`**

Same pattern as Live, but keep existing `crew_id = any($1)` / pairing filter:

```js
async assignmentsAll() {
  const ids = await crewIds()
  if (ids.length === 0) return []
  const dutyEnd = dutyEndUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
  return (await db.query(
    `select rf.crew_id, rf.pairing_id, rf.assignment as code,
            extract(epoch from rf.sch_str_dt_utc)::bigint as s,
            extract(epoch from ${dutyEnd})::bigint as e,
            extract(epoch from ${dutyEnd})::bigint
              + coalesce(rf.act_rest_min, 0) * 60 as end_rest_secs
       from f8.roster_flight rf
       left join f8.pairing_segment ps
         on rf.pairing_id is not null
        and ps.pairing_id = rf.pairing_id
        and coalesce(ps.is_deleted, 0) = 0
        and ps.duty_seq = rf.duty_seq
        and ps.seg_seq = rf.seg_seq
      where rf.crew_id = any($1::varchar[]) and rf.is_deleted=0
        and (rf.pairing_id is null or rf.pairing_id = any($2::bigint[]))
      order by rf.crew_id, rf.sch_str_dt_utc, rf.pairing_id`,
    [ids, await pairingIds()],
  )).rows
},
```

- [ ] **Step 2: All SQL-guard tests green**

```bash
cd live-server && node --test scripts/__tests__/flyduties-duty-bounds-sql.test.mjs
```

Expected: all PASS. Also run a quick isolation grep:

```bash
git diff --stat -- live-server/scripts/live-legality.mjs live-server/scripts/scenario-legality.mjs live-server/scripts/scenario-legality-source.mjs
# Diff should only touch assignmentsAll regions; flyDuties/rosterDuties hunks must be empty
```

---

### Task 5: SIT smoke — crew 2347 / pairing 93184 / DO Start 00:30

**Files:**
- No production edits (verification only)
- Optional one-line note in `docs/superpowers/specs/2026-08-16-rule-2015-duty-release-occupy-end-design.md` Verification section if results differ

**Interfaces:**
- Uses scenario 740, ruleset with 2015=`00:30`, `check-7507 --do-start-min 30`

- [ ] **Step 1: Confirm adapter end for 93184 is duty release (~00:40 local)**

```bash
cd live-server && node --input-type=module <<'NODE'
import pg from 'pg'
import { loadContext, scenarioSource, applySchemas } from './scripts/scenario-legality.mjs'
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
const db = { query: (q, v) => c.query(typeof q === 'string' ? applySchemas(q) : { ...q, text: applySchemas(q.text) }, v) }
try {
  const ctx = await loadContext(740, db)
  const rows = (await scenarioSource(db, 740, ctx).assignmentsAll())
    .filter((r) => String(r.crew_id) === '2347' && Number(r.pairing_id) === 93184)
  const last = rows.sort((a, b) => Number(a.e) - Number(b.e)).at(-1)
  const off = -240
  const tod = (((Number(last.e) + off * 60) % 86400) + 86400) % 86400
  console.log({ e: last.e, localMin: Math.floor(tod / 60), localSec: tod % 60 })
  // Expect local ~00:40 (40 minutes), NOT 00:25
} finally { await c.end() }
NODE
```

Expected: `localMin === 40` (debrief/release), not `25`.

- [ ] **Step 2: Force-measure 7507 days_off with doStart 30 vs 60**

Reuse the earlier forced-min=`1000` band harness on crew 2347 with 138720 present (or simulated). Expect:

| doStartMin | daysOff vs Min 11 |
|------------|-------------------|
| 30 | days_off **10** → would fail |
| 60 | days_off **11** → pass |

- [ ] **Step 3: Isolation confirmation**

```bash
git diff -U0 -- live-server/scripts/ | rg -n 'async flyDuties|async rosterDuties|async checkins|function dutyEndUtcExpr' || true
```

Expected: no hunks on those symbols (only `assignmentsAll` and tests).

---

### Task 6: Doc touch-up

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-rule-2015-do-start-time-design.md` — one sentence under Semantics: occupy end is **Duty Release**, not flight arrival; see duty-release occupy-end spec.
- Modify: `docs/modules/rule-engine/F8-rule.md` only if it currently documents 7505/7507 end as flight arrival (surgical one-line fix).

- [ ] **Step 1: Add cross-reference sentence to original 2015 design**
- [ ] **Step 2: Stop for user review / commit-on-request**

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Occupy end = Duty Release | 2–4 |
| Actual → scheduled coalesce | 2–4 (`dutyEndUtcExpr`) |
| Live + Scenario same policy | 2–3 |
| Scenario live segment fallback | 3 |
| Only `assignmentsAll` changed | 2–5 isolation steps |
| Ground fallback sch_end | 2–4 |
| Per-row grain (no pairing aggregate) | 2–4 |
| SQL tests | 1 |
| 2347 / 00:30 smoke | 5 |
| Doc supplement | 6 |

## Placeholder / consistency self-review

- No TBD steps; SQL sketches are concrete.
- Row fields remain `s` / `e` / `end_rest_secs` / `code` / `pairing_id` as consumed by `rule7505`/`rule7507`.
- Commit steps deferred to user request (§No-Auto-Commit).
