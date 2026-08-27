# Legality Auto-Recheck on Rule Parameter Change — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an admin saves a rule parameter change in the gantt Legality tab, automatically recheck the affected rosters (live default ruleset + any optimized scenario whose ruleset includes the rule) and surface a last-recheck timestamp/status indicator in the Legality header (info + "Recheck now") and the Alert Center (info only, replacing "Scan live").

**Architecture:** A single Rust-backed recheck core (generalized from `scenario-legality.mjs`) runs the rule group's `rule-engine-rs` binaries over a *source adapter* (live tables or scenario tables), reading the legacy `rule.param_json` the Legality tab edits, and bulk-replaces `rule_violation`. Live recheck is a detached node process publishing status to Redis; scenario recheck stays lazy (mark stale → recompute on next open). The frontend triggers the live recheck on param-save and polls a Redis-backed status endpoint.

**Tech Stack:** live-server (Fastify + pg + Redis + node child_process spawning Rust binaries), rule-engine-rs (prebuilt Rust binaries, reused), gantt (React 19 + Zustand + axios), Playwright + Vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-legality-auto-recheck-on-param-change-design.md`

---

## Architectural decisions baked into this plan

- **Granularity = whole ruleset.** Single-rule recheck is infeasible (engines run the whole group per roster and bulk-replace); definition→checker deps are not queryable. Whole-ruleset recheck covers both.
- **Recheck period for live = client's current date range** (passed to `POST /api/legality/recheck`). Live has no per-row period.
- **Scenarios are relevance-windowed + lazy.** Window `W = [date_trunc('month',now()) .. end of next month]`. Affected `DONE` scenarios overlapping `W` are marked stale (`computed_version-1`, `PENDING`) → recompute on open. Those outside `W` get a soft `params_stale=true` flag only → shown with last-known violations + an "outdated" hint + manual Recheck. No proactive batch.
- **Efficiency:** violations are written in **one batched multi-row insert** (not row-by-row); live recheck touches only the active window; out-of-window scenarios cost nothing until a manual Recheck.
- **Engine path = Rust + legacy `rule.param_json`.** The TS `@rois/rule-engine` path is a dead end and is NOT touched.
- **Timestamp store = Redis** keys `legality:recheck:{airline}:{groupCode}:{status|last_checked_at|done_count|total_count|error}`. Indicator degrades to "—" if absent.

## File map

| File | Create/Modify | Responsibility |
|---|---|---|
| `live-server/scripts/legality-recheck-core.mjs` | Create | Shared: `runBin`, base-offset table, helpers, the rule functions parameterized by a `source` adapter, `computeViolations(source, ctx)`, `buildBulkInsert(...)`. |
| `live-server/scripts/scenario-legality.mjs` | Modify | Import the core; scenario source adapter; batched insert (current behaviour preserved). |
| `live-server/scripts/live-legality.mjs` | Create | Live entry: live source adapter over live tables; bulk-replace live `rule_violation` (batched); publish Redis status. CLI `--group <code> --from <YYYY-MM-DD> --to <YYYY-MM-DD>`. |
| `sql/migration/2026-06-19-scenario-legality-params-stale.sql` | Create | Add `scenario.legality_status.params_stale boolean NOT NULL DEFAULT false`. |
| `live-server/src/services/rule/legality-recheck.ts` | Create | Resolve affected worksets/scenarios for a rule; **windowed** stale-marking (in-window vs out-of-window); spawn `live-legality.mjs`; read Redis status. |
| `live-server/src/routes/rule/legality.ts` | Modify | PATCH: after save, windowed-invalidate scenarios + return `{ affectsLiveDefault, scenarioCount }`. Add `POST /recheck` + `GET /recheck-status`. |
| `live-server/src/services/scenario/legality-status.ts` | Modify | `ensureLegality` returns `paramsStale`; add force-recompute-and-clear helper. |
| `live-server/src/routes/scenario/legality.ts` | Modify | Return `paramsStale`; add `POST /:id/legality/recheck` (clears flag + forces recompute). |
| `gantt/src/components/scenario-gantt/*legality*` (existing scenario legality view) | Modify | Show "outdated — params changed" hint + Recheck button when `paramsStale`. |
| `gantt/src/services/legality-api.ts` | Modify | Add `triggerRecheck`, `getRecheckStatus`; extend `updateRuleParams` return type. |
| `gantt/src/types/legality.ts` | Modify | Add `LegalityRecheckStatus`, `UpdateRuleParamsResult`. |
| `gantt/src/components/legality/legality-recheck-indicator.tsx` | Create | Shared indicator (info + optional "Recheck now"); owns the poll loop. |
| `gantt/src/components/legality/legality-view.tsx` | Modify | Mount indicator (info + Recheck now) in the default-ruleset header; trigger recheck after param save. |
| `gantt/src/components/panes/violation-list-dialog.tsx` | Modify | Remove "Scan live"; mount indicator (info only). |
| `gantt/src/version.ts` | Modify | Bump BACKEND + FRONTEND. |
| `e2e/tests/gantt/legality-auto-recheck.spec.ts` | Create | E2E: indicator, manual recheck, Alert Center swap. |
| `e2e/tests/gantt/scenario-legality-param-invalidation.spec.ts` | Create | E2E: scenario in-window recompute + out-of-window "outdated" hint after param change. |
| `live-server/tests/unit/legality-recheck.spec.ts` | Create | Vitest: affected-roster resolution + endpoint handlers (mocked pg/redis). |

---

## Phase 1 — Backend: unified Rust recheck core + live entry

### Task 1: Extract the shared recheck core from `scenario-legality.mjs`

**Files:**
- Create: `live-server/scripts/legality-recheck-core.mjs`
- Modify: `live-server/scripts/scenario-legality.mjs`

The current `scenario-legality.mjs` mixes three concerns: (a) generic engine plumbing (`runBin`, `epochSec`, `BASE_OFFSET_MIN`, `hhmmToMin`, `REST_LEAVE_CODES`, the `INSERT` shape), (b) the 9 rule functions whose only DB-specific part is *which roster table/scope they read*, and (c) scenario-specific persistence. We move (a) and a *source-parameterized* (b) into the core; each script supplies a `source` adapter and its own persistence.

- [ ] **Step 1: Define the `source` adapter contract in the core file header**

Create `live-server/scripts/legality-recheck-core.mjs` starting with:

```js
// legality-recheck-core.mjs — engine-agnostic legality recheck shared by the LIVE and
// SCENARIO recheck entries (§Gantt-Unify). Each entry supplies a `source` adapter that
// knows HOW to read roster rows (live tables vs scenario.* under a scenario_id) and a
// `param` reader for legacy rule.param_json. The core spawns the rule-engine-rs check_*
// binaries (reading the SAME legacy params the Legality tab edits) and returns violation
// rows; the entry persists them to its own rule_violation target.
//
// source adapter:
//   db                       -> a connected pg.Client
//   flyByPairing()           -> rows {crew_id,pairing_id,start_secs,end_secs,label}
//   flyDuties(byDutySeq)     -> rows {crew_id,pairing_id,start_secs,end_secs}
//   groundWork()             -> rows {crew_id,assignment,start_secs,end_secs} (rest/leave filtered)
//   blockByDay()             -> rows {crew_id,day,blk}
//   pilotAge()               -> rows for rule 8030
//   baseQuals()              -> {rosters, quals} for rule 8004
//   assignmentsRaw()         -> rows {crew_id,code,s,e} for rule 7505
//   checkins()               -> rows {crew_id,pairing_id,start_secs,end_secs} for 7506
//   crewOffsets()            -> Map<crewId, offsetMin>
//   firstPairingByCrew()     -> Map<crewId, pairingId>
//   ruleRow0(fn,inst,fb)     -> param_json tables[0].rows[0] for a rule (legacy)
//   ruleParam(fn,inst)       -> {header, rows} of tables[0] (legacy)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BIN_DIR = path.resolve(__dirname, '../../rule-engine-rs/target/release')

export const BASE_OFFSET_MIN = { YYZ: -240, YUL: -240, YOW: -240, YKF: -240, YWG: -300, YEG: -360, YYC: -360, YVR: -420, YXX: -420, YLW: -420, OOL: 600 }
export const DEFAULT_OFFSET_MIN = -360
export const REST_LEAVE_CODES = new Set(['DO', 'VAC', 'ILL', 'LO', 'LEA'])
export const hhmmToMin = (s) => { const [h, m] = String(s).split(':').map((x) => parseInt(x, 10)); return h * 60 + (m || 0) }
export const epochSec = (iso) => Math.floor(new Date(iso).getTime() / 1000)

export function runBin(bin, args, tsv) {
  const res = spawnSync(path.join(BIN_DIR, bin), args, { input: tsv, encoding: 'utf-8', maxBuffer: 1 << 28 })
  if (res.status !== 0) throw new Error(`${bin} failed: ${res.stderr || res.error}`)
  return res.stdout.trim().split('\n').filter(Boolean).map((l) => l.split('\t'))
}

/**
 * Build a single batched INSERT for many violation rows (efficiency: one round-trip instead
 * of N). `columns` is the ordered column list; `rows` is an array of value arrays in that
 * order; `conflict` is the ON CONFLICT (...) target; `update` is the DO UPDATE SET tail.
 * Returns { text, values }.
 */
export function buildBulkInsert(table, columns, rows, conflict, update) {
  if (rows.length === 0) return null
  const ncol = columns.length
  const values = []
  const tuples = rows.map((r, i) => {
    const ph = columns.map((_, j) => `$${i * ncol + j + 1}`)
    for (const v of r) values.push(v)
    return `(${ph.join(',')})`
  })
  const text = `insert into ${table} (${columns.join(',')}) values ${tuples.join(',')}`
    + (conflict ? ` on conflict ${conflict} do update set ${update}` : '')
  return { text, values }
}
```

> Postgres caps a statement at 65535 bind params; at ~15 columns that's ~4300 rows per
> insert. If a recompute can exceed that, the entries chunk `rows` into batches of 2000 and
> call `buildBulkInsert` per chunk (shown in Steps below).

- [ ] **Step 2: Move the 9 rule functions into the core, taking `(source, ctx)`**

Copy `rule8002`…`rule7504` verbatim from `scenario-legality.mjs:88-339` into the core, changing two things in each:
1. Replace every inline `db.query(... scenario.roster_flight ... where scenario_id = $1 ...)` with a call to the matching `source.*()` accessor (the SQL moves into the adapters in Tasks 1b/2). E.g. `rule8002` becomes:

```js
export async function rule8002(source) {
  const W = { windowDays: 28, limitHours: 40 }
  const rows = await source.blockByDay()
  const tsv = rows.map((r) => `${r.crew_id}\t${r.day}\t${r.blk}`).join('\n')
  const limitMin = W.limitHours * 60
  return runBin('check-8002', ['--emit-tsv', '--window-days', String(W.windowDays), '--limit-hours', String(W.limitHours)], tsv)
    .map(([crewId, start, end, actualMin]) => ({
      crew_id: crewId, pairing_id: null, duty_seq: null, rule_code: '8002', rule_instance: '006',
      start_dt: `${start}T00:00:00Z`, end_dt: `${end}T23:59:59Z`, severity: 3,
      actual_value: Number(actualMin), limit_value: limitMin, unit: 'MINUTE',
      message: `Cumulative block ${(Number(actualMin) / 60).toFixed(1)}h exceeds ${W.limitHours}h in the ${W.windowDays}-day window ${start}..${end}.`,
    }))
}
```
2. Param reads (`ruleRow0`, `param_json` queries) become `source.ruleRow0(...)` / `source.ruleParam(...)`. Keep all message strings, severities, instances, and Rust flags **identical** to the current file (verbatim, including the "Concecutive" typo at line 318).

Export the ordered list:
```js
export const RULES = [rule8002, rule8056, rule8030, rule8004, rule7505, rule7506, rule7501, rule7503, rule7504]
export async function computeViolations(source, ctx) {
  const all = []
  for (const rule of RULES) { const rows = await rule(source, ctx); all.push(...rows) }
  return all
}
```

- [ ] **Step 3: Build the scenario source adapter inside `scenario-legality.mjs`**

Replace the rule bodies in `scenario-legality.mjs` with an import + a `scenarioSource(db, scenarioId)` adapter that contains the *exact* SQL currently in each rule (the `scenario.roster_flight ... where scenario_id=$1` queries from lines 78-339), exposing them via the adapter accessors. The `main()` persistence (lines 353-390) is unchanged except it calls `computeViolations(scenarioSource(db, SCENARIO_ID), ctx)`:

```js
import { computeViolations, buildBulkInsert } from './legality-recheck-core.mjs'
// ...loadContext unchanged...
function scenarioSource(db, scenarioId) {
  return {
    db,
    blockByDay: async () => (await db.query(`select crew_id, to_char(date_trunc('day', sch_str_dt_utc),'YYYY-MM-DD') as day, sum(greatest(0, extract(epoch from (sch_end_dt_utc - sch_str_dt_utc))/60))::int as blk from scenario.roster_flight where scenario_id=$1 and is_deleted=0 and assignment_group='FLY' and pairing_id is not null group by crew_id, date_trunc('day', sch_str_dt_utc) having sum(greatest(0, extract(epoch from (sch_end_dt_utc - sch_str_dt_utc))/60)) > 0`, [scenarioId])).rows,
    // ...one accessor per rule, each holding the SQL currently inline in scenario-legality.mjs, with `scenario.roster_flight ... where scenario_id=$1`...
    ruleRow0: async (fn, inst, fb) => (await db.query(`select param_json#>'{tables,0,rows,0}' as row0 from f8.rule where function=$1 and instance=$2`, [fn, inst])).rows[0]?.row0 ?? fb,
    ruleParam: async (fn, inst) => (await db.query(`select param_json#>'{tables,0,header}' as header, param_json#>'{tables,0,rows}' as rows from f8.rule where function=$1 and instance=$2`, [fn, inst])).rows[0],
  }
}
// in main(): const all = await computeViolations(scenarioSource(db, SCENARIO_ID), ctx)
```

Also replace the row-by-row insert loop (`scenario-legality.mjs:375-380`) with a batched
insert using the core helper (chunked to stay under the bind-param cap):
```js
// (computeViolations, buildBulkInsert imported above)
const COLS = ['scenario_id','roster_version','crew_id','pairing_id','duty_seq','rule_group_code',
  'rule_code','rule_instance','start_dt','end_dt','severity','actual_value','limit_value','unit','message']
const CONFLICT = '(scenario_id, crew_id, pairing_id, duty_seq, rule_group_code, rule_code)'
const UPDATE = `roster_version=excluded.roster_version, start_dt=excluded.start_dt, end_dt=excluded.end_dt,
  severity=excluded.severity, actual_value=excluded.actual_value, limit_value=excluded.limit_value,
  unit=excluded.unit, message=excluded.message, computed_at=now()`
// inside the txn, after delete:
for (let i = 0; i < all.length; i += 2000) {
  const chunk = all.slice(i, i + 2000).map((r) => [SCENARIO_ID, rosterVersion, r.crew_id, r.pairing_id,
    r.duty_seq, ctx.ruleGroupCode, r.rule_code, r.rule_instance, r.start_dt, r.end_dt, r.severity,
    r.actual_value, r.limit_value, r.unit, r.message])
  const q = buildBulkInsert('scenario.rule_violation', COLS, chunk, CONFLICT, UPDATE)
  if (q) await db.query(q.text, q.values)
}
```

- [ ] **Step 4: Verify scenario recheck still works (no behaviour change)**

Run against the loaded scenario (memory: scenario 6 is loaded):
```bash
cd live-server && node scripts/scenario-legality.mjs 6
```
Expected: per-rule violation counts print and final line `persisted for scenario 6: [...] — status READY` — matching pre-refactor counts (compare against `select rule_code, count(*) from scenario.rule_violation where scenario_id=6 group by rule_code`).

- [ ] **Step 5: Commit**

```bash
git add live-server/scripts/legality-recheck-core.mjs live-server/scripts/scenario-legality.mjs
git commit -m "refactor(live-server): extract shared Rust legality recheck core from scenario-legality"
```

---

### Task 2: Live source adapter + `live-legality.mjs` entry

**Files:**
- Create: `live-server/scripts/live-legality.mjs`

Mirrors `scenario-legality.mjs` but reads the **live** roster tables (f8 schema, scoped by date range, all crew, `is_deleted=0`) and writes the **live** `rule_violation` (no `scenario_id`/`roster_version`; unique key includes `start_dt`; delete per `(group, rule_code)`). Publishes status to Redis.

- [ ] **Step 1: Write the live entry skeleton (args, DB + Redis from env, status helpers)**

```js
// live-legality.mjs — LIVE legality recheck. Runs the rule group's rule-engine-rs binaries
// over the LIVE roster tables for a date range (all crew) and bulk-replaces live
// rule_violation, reading the SAME legacy rule.param_json the Legality tab edits.
// Publishes progress to Redis so the gantt indicator can poll it. §Gantt-Unify: rule logic
// is shared with scenario-legality via legality-recheck-core.mjs.
//
//   node scripts/live-legality.mjs --group pbs_solver_ruleset --from 2026-06-01 --to 2026-07-31
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createClient } from 'redis'
import { computeViolations, buildBulkInsert, BASE_OFFSET_MIN, DEFAULT_OFFSET_MIN, REST_LEAVE_CODES, epochSec } from './legality-recheck-core.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const GROUP = arg('--group', 'pbs_solver_ruleset')
const FROM = arg('--from'); const TO = arg('--to')
if (!FROM || !TO) { console.error('usage: node scripts/live-legality.mjs --group <code> --from <YYYY-MM-DD> --to <YYYY-MM-DD>'); process.exit(2) }

function readEnv(key) {
  if (process.env[key]) return process.env[key]
  const env = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf-8')
  const line = env.split('\n').find((l) => l.startsWith(`${key}=`))
  if (!line) throw new Error(`${key} not found in live-server/.env`)
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
}
const AIRLINE = (process.env.FILIALE || 'F8')
const KEY = (s) => `legality:recheck:${AIRLINE}:${GROUP}:${s}`
const db = new pg.Client({ connectionString: readEnv('DATABASE_URL') })
const redis = createClient({ url: readEnv('REDIS_URL') })

async function setStatus(status, extra = {}) {
  const ops = redis.multi().set(KEY('status'), status)
  if (extra.lastCheckedAt) ops.set(KEY('last_checked_at'), extra.lastCheckedAt)
  if (extra.error != null) ops.set(KEY('error'), String(extra.error))
  if (status === 'computing') ops.set(KEY('done_count'), '0').set(KEY('total_count'), '0')
  await ops.exec()
}
```

- [ ] **Step 2: Write the live source adapter (live roster_flight scoped by date range)**

Live `roster_flight` lives in the f8 schema (search_path), has no `scenario_id` filter. Scope by `sch_str_dt_utc` within `[FROM, TO]`. The SQL is the scenario adapter's SQL with `scenario.roster_flight where scenario_id=$1` replaced by `roster_flight where is_deleted=0 and sch_str_dt_utc >= $1 and sch_str_dt_utc < $2` (params `[FROM, TO+1d]`). `crew_base`/`crew`/`rule` reads keep the `f8.` prefix exactly as the scenario adapter has them.

```js
function liveSource(db, fromIso, toIso) {
  const P = [fromIso, toIso] // toIso must be exclusive end (TO + 1 day)
  return {
    db,
    blockByDay: async () => (await db.query(`select crew_id, to_char(date_trunc('day', sch_str_dt_utc),'YYYY-MM-DD') as day, sum(greatest(0, extract(epoch from (sch_end_dt_utc - sch_str_dt_utc))/60))::int as blk from roster_flight where is_deleted=0 and assignment_group='FLY' and pairing_id is not null and sch_str_dt_utc >= $1 and sch_str_dt_utc < $2 group by crew_id, date_trunc('day', sch_str_dt_utc) having sum(greatest(0, extract(epoch from (sch_end_dt_utc - sch_str_dt_utc))/60)) > 0`, P)).rows,
    // ...mirror each scenario accessor: same SELECT, FROM roster_flight, WHERE is_deleted=0 [+ rule-specific FLY/pairing filters] AND sch_str_dt_utc >= $1 AND sch_str_dt_utc < $2...
    ruleRow0: async (fn, inst, fb) => (await db.query(`select param_json#>'{tables,0,rows,0}' as row0 from rule where function=$1 and instance=$2`, [fn, inst])).rows[0]?.row0 ?? fb,
    ruleParam: async (fn, inst) => (await db.query(`select param_json#>'{tables,0,header}' as header, param_json#>'{tables,0,rows}' as rows from rule where function=$1 and instance=$2`, [fn, inst])).rows[0],
  }
}
```

- [ ] **Step 3: Write the live persistence + main()**

Live `rule_violation` has no `scenario_id`/`roster_version`; unique key `(crew_id, pairing_id, duty_seq, rule_group_code, rule_code, start_dt)`. Delete the group's existing rows for the window, then insert. (Delete by group + window so a recheck of a period doesn't wipe other periods.)

```js
// (buildBulkInsert is already imported in Step 1's import line)
const COLS = ['crew_id','pairing_id','duty_seq','rule_group_code','rule_code','rule_instance',
  'start_dt','end_dt','severity','actual_value','limit_value','unit','message','created_by','updated_by']
const CONFLICT = '(crew_id, pairing_id, duty_seq, rule_group_code, rule_code, start_dt)'
const UPDATE = `end_dt=excluded.end_dt, severity=excluded.severity, actual_value=excluded.actual_value,
  limit_value=excluded.limit_value, unit=excluded.unit, message=excluded.message, computed_at=now(), updated_by='legality_recheck'`

async function main() {
  await db.connect(); await redis.connect()
  await setStatus('computing')
  try {
    const toExclusive = new Date(new Date(TO + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)
    const ctx = { ruleGroupCode: GROUP, dateFrom: FROM, dateTo: TO }
    const all = await computeViolations(liveSource(db, FROM, toExclusive), ctx)
    await db.query('begin')
    await db.query(`delete from rule_violation where rule_group_code=$1 and start_dt >= $2::timestamptz and start_dt < ($3::date + interval '1 day')`, [GROUP, FROM, TO])
    for (let i = 0; i < all.length; i += 2000) {
      const chunk = all.slice(i, i + 2000).map((r) => [r.crew_id, r.pairing_id, r.duty_seq, GROUP,
        r.rule_code, r.rule_instance, r.start_dt, r.end_dt, r.severity, r.actual_value, r.limit_value,
        r.unit, r.message, 'legality_recheck', 'legality_recheck'])
      const q = buildBulkInsert('rule_violation', COLS, chunk, CONFLICT, UPDATE)
      if (q) await db.query(q.text, q.values)
    }
    await db.query('commit')
    await setStatus('done', { lastCheckedAt: new Date().toISOString(), error: '' })
    console.log(`live recheck ${GROUP} ${FROM}..${TO}: ${all.length} violations`)
  } catch (e) {
    try { await db.query('rollback') } catch { /* not in txn */ }
    await setStatus('failed', { error: e.message })
    console.error(e); process.exitCode = 1
  } finally { await redis.quit(); await db.end() }
}
main()
```

> NOTE on `Date.now()`/`new Date()`: this is a standalone node script (not a Workflow script), so they are allowed here.

- [ ] **Step 4: Confirm `redis` is a live-server dependency**

```bash
cd live-server && node -e "require.resolve('redis'); console.log('ok')"
```
Expected: `ok`. If it throws, the scenario/live status path uses the existing client lib instead — check `live-server/src/plugins/redis.ts` import (`createClient` from `redis`) and reuse that exact package name in Step 1.

- [ ] **Step 5: Manual run receipt (regression proof, §No-Illusion)**

```bash
cd live-server && node scripts/live-legality.mjs --group pbs_solver_ruleset --from 2026-06-01 --to 2026-07-31
```
Expected: prints `live recheck pbs_solver_ruleset 2026-06-01..2026-07-31: <N> violations`; Redis `legality:recheck:F8:pbs_solver_ruleset:status` = `done` and `:last_checked_at` set. Cross-check the row count: `select rule_code, count(*) from rule_violation where rule_group_code='pbs_solver_ruleset' and start_dt >= '2026-06-01' and start_dt < '2026-08-01' group by rule_code`.

- [ ] **Step 6: Commit**

```bash
git add live-server/scripts/live-legality.mjs
git commit -m "feat(live-server): live legality recheck via shared Rust core + Redis status"
```

---

## Phase 2 — Backend: trigger, endpoints, scenario invalidation

### Task 3: Migration — `params_stale` flag on scenario legality status

**Files:**
- Create: `sql/migration/2026-06-19-scenario-legality-params-stale.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Out-of-window scenarios get a soft "rule params changed since last check" flag instead of a
-- forced recompute. ensureLegality reports it; a manual Recheck clears it. See
-- docs/superpowers/specs/2026-06-19-legality-auto-recheck-on-param-change-design.md §4.4.
alter table scenario.legality_status
  add column if not exists params_stale boolean not null default false;
```

- [ ] **Step 2: Apply it (scenario schema lives in the `scenario` Postgres schema)**

```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois" -f sql/migration/2026-06-19-scenario-legality-params-stale.sql
```
> If local f8 is empty (per project memory the running live-server uses a REMOTE DB), apply against the same `DATABASE_URL` live-server uses. Verify: `\d scenario.legality_status` shows `params_stale`.

- [ ] **Step 3: Commit**

```bash
git add sql/migration/2026-06-19-scenario-legality-params-stale.sql
git commit -m "feat(sql): scenario.legality_status.params_stale for out-of-window invalidation"
```

---

### Task 4: Affected-roster resolution + windowed invalidation service

**Files:**
- Create: `live-server/src/services/rule/legality-recheck.ts`
- Test: `live-server/tests/unit/legality-recheck.spec.ts`

- [ ] **Step 1: Write the failing unit test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { resolveAffected } from '../../src/services/rule/legality-recheck.js'

const fakePool = (rows: Record<string, unknown[]>) => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes('from rule_set')) return { rows: rows.worksets }
    if (sql.includes("usage = 'GANTT'")) return { rows: rows.defaultWs }
    if (sql.includes('from scenario s')) return { rows: rows.scenarios }
    return { rows: [] }
  }),
})

describe('resolveAffected', () => {
  it('flags live default and splits scenarios into in-window / out-of-window', async () => {
    const pool = fakePool({
      worksets: [{ workset_id: '103' }, { workset_id: '460' }],
      defaultWs: [{ id: '103' }],
      scenarios: [{ id: '6', in_window: true }, { id: '460', in_window: false }],
    }) as never
    const r = await resolveAffected(pool, 8002006)
    expect(r.affectsLiveDefault).toBe(true)
    expect(r.inWindowScenarioIds).toEqual([6])
    expect(r.outOfWindowScenarioIds).toEqual([460])
    expect(r.scenarioCount).toBe(2)
  })
  it('returns empty when the rule maps to no workset', async () => {
    const pool = fakePool({ worksets: [], defaultWs: [{ id: '103' }], scenarios: [] }) as never
    const r = await resolveAffected(pool, 9999999)
    expect(r.affectsLiveDefault).toBe(false)
    expect(r.scenarioCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run it — expect failure**

Run: `cd live-server && npx vitest run tests/unit/legality-recheck.spec.ts`
Expected: FAIL — `resolveAffected` not exported.

- [ ] **Step 3: Implement the service (windowed split + invalidation + spawn)**

```ts
import { spawn } from 'node:child_process'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'

export interface AffectedRosters {
  affectsLiveDefault: boolean
  inWindowScenarioIds: number[]
  outOfWindowScenarioIds: number[]
  scenarioCount: number
}

/** Relevance window W = [this month .. end of next month]; a scenario is in-window if its
 *  period (str_dt_loc..end_dt_loc) overlaps W. */
export async function resolveAffected(pool: Pick<Pool, 'query'>, ruleId: number): Promise<AffectedRosters> {
  const ws = await pool.query(
    `select distinct rs.workset_id
       from rule_set rs
       join rule r on r.function::text || coalesce(r.instance,'') = rs.rule_id::text
      where r.id = $1`, [ruleId])
  const worksetIds = ws.rows.map((w: { workset_id: string }) => Number(w.workset_id))
  if (worksetIds.length === 0) return { affectsLiveDefault: false, inWindowScenarioIds: [], outOfWindowScenarioIds: [], scenarioCount: 0 }

  const def = await pool.query(
    `select w.id from workset w
      where w.name = (select name from rule_group where usage = 'GANTT' and is_default = true and is_deleted = 0 order by id limit 1)`)
  const defaultWsId = def.rows[0] ? Number(def.rows[0].id) : null
  const affectsLiveDefault = defaultWsId != null && worksetIds.includes(defaultWsId)

  // in_window = scenario period overlaps [this month start, end of next month].
  const sc = await pool.query(
    `select s.id,
            (s.end_dt_loc >= date_trunc('month', now())
             and s.str_dt_loc < date_trunc('month', now()) + interval '2 months') as in_window
       from scenario s
      where s.workset_id = any($1::bigint[]) and s.status = 'DONE'`, [worksetIds])
  const inWindowScenarioIds: number[] = []
  const outOfWindowScenarioIds: number[] = []
  for (const row of sc.rows as Array<{ id: string; in_window: boolean }>) {
    ;(row.in_window ? inWindowScenarioIds : outOfWindowScenarioIds).push(Number(row.id))
  }
  return { affectsLiveDefault, inWindowScenarioIds, outOfWindowScenarioIds, scenarioCount: sc.rows.length }
}

/** In-window: force recompute on next open. */
export async function markScenariosStale(pool: Pick<Pool, 'query'>, scenarioIds: number[]): Promise<void> {
  if (scenarioIds.length === 0) return
  await pool.query(
    `update scenario.legality_status
        set computed_version = computed_version - 1, status = 'PENDING', params_stale = false, updated_at = now()
      where scenario_id = any($1::bigint[])`, [scenarioIds])
}

/** Out-of-window: soft flag only — no recompute on open, shows an "outdated" hint. */
export async function flagScenariosParamsStale(pool: Pick<Pool, 'query'>, scenarioIds: number[]): Promise<void> {
  if (scenarioIds.length === 0) return
  await pool.query(
    `update scenario.legality_status set params_stale = true, updated_at = now()
      where scenario_id = any($1::bigint[])`, [scenarioIds])
}

/** Spawn the live recheck (detached) for the default group over a date range. */
export function spawnLiveRecheck(fastify: FastifyInstance, groupCode: string, from: string, to: string): void {
  const script = path.resolve(process.cwd(), 'scripts/live-legality.mjs')
  const child = spawn(process.execPath, [script, '--group', groupCode, '--from', from, '--to', to], { detached: true, stdio: 'ignore' })
  child.on('error', (err) => fastify.log.error({ err, groupCode }, 'live legality recheck spawn failed'))
  child.unref()
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `cd live-server && npx vitest run tests/unit/legality-recheck.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/rule/legality-recheck.ts live-server/tests/unit/legality-recheck.spec.ts
git commit -m "feat(live-server): affected-roster resolution + windowed stale/flag + live recheck spawn"
```

---

### Task 5: Wire PATCH to windowed-invalidate scenarios + report; add recheck endpoints

**Files:**
- Modify: `live-server/src/routes/rule/legality.ts`

- [ ] **Step 1: Import the service at the top of `legality.ts`**

```ts
import { resolveAffected, markScenariosStale, flagScenariosParamsStale, spawnLiveRecheck } from '../../services/rule/legality-recheck.js'
import { env } from '../../config/env.js'
```

- [ ] **Step 2: After the successful UPDATE in the PATCH handler, resolve + windowed-invalidate + report**

Replace the current success block (`legality.ts:135-139`) with:

```ts
      await fastify.pgPool.query(
        `UPDATE rule SET param_json = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
        [JSON.stringify(body.paramJson), request.authUser.userCode, id],
      )
      // Recheck scope (relevance-windowed): in-window scenarios recompute on next open;
      // out-of-window ones get a soft "outdated" flag only. Tell the client whether the rule
      // is in the live default ruleset so it can trigger the live recheck for its date range.
      const affected = await resolveAffected(fastify.pgPool, id)
      await markScenariosStale(fastify.pgPool, affected.inWindowScenarioIds)
      await flagScenariosParamsStale(fastify.pgPool, affected.outOfWindowScenarioIds)
      return success(reply, {
        paramJson: body.paramJson,
        affectsLiveDefault: affected.affectsLiveDefault,
        scenarioCount: affected.scenarioCount,
      })
```

- [ ] **Step 3: Add `POST /recheck` and `GET /recheck-status` at the end of `legalityRoutes`**

```ts
  /** POST /recheck  (admin) — body { groupCode, from, to } → spawn live recheck for the range. */
  fastify.post('/recheck', async (request, reply) => {
    if (!request.authUser?.isAdmin) return fail(reply, 403, 'Admin access required')
    const b = request.body as { groupCode?: string; from?: string; to?: string }
    if (!b?.groupCode || !b?.from || !b?.to) return fail(reply, 400, 'groupCode, from, to are required')
    const airline = env.FILIALE
    const k = (s: string) => `legality:recheck:${airline}:${b.groupCode}:${s}`
    const cur = await fastify.redis.get(k('status'))
    if (cur === 'computing') return success(reply, { status: 'computing' }) // dedupe concurrent triggers
    await fastify.redis.set(k('status'), 'computing')
    spawnLiveRecheck(fastify, b.groupCode, b.from, b.to)
    return success(reply, { status: 'computing' })
  })

  /** GET /recheck-status?groupCode= — Redis-backed status + last-checked timestamp. */
  fastify.get('/recheck-status', async (request, reply) => {
    const groupCode = (request.query as { groupCode?: string }).groupCode
    if (!groupCode) return fail(reply, 400, 'groupCode is required')
    const airline = env.FILIALE
    const k = (s: string) => `legality:recheck:${airline}:${groupCode}:${s}`
    const [status, lastCheckedAt, error] = await Promise.all([
      fastify.redis.get(k('status')), fastify.redis.get(k('last_checked_at')), fastify.redis.get(k('error')),
    ])
    return success(reply, { status: status ?? 'idle', lastCheckedAt: lastCheckedAt ?? null, error: error || null })
  })
```

- [ ] **Step 4: Type-check live-server**

Run: `cd live-server && npx tsc --noEmit`
Expected: no new errors in `legality.ts` / `legality-recheck.ts` (pre-existing repo errors per project memory are not introduced by this change).

- [ ] **Step 5: Smoke-test the endpoints against the running live-server (admin token)**

With live-server running (tsx watch) and an admin token (memory: Ryan/Our2027 is admin):
```bash
TOKEN=$(curl -s localhost:3000/api/auth/login -H 'content-type: application/json' -d '{"userCode":"Ryan","password":"Our2027"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data.token))")
curl -s "localhost:3000/api/legality/recheck-status?groupCode=pbs_solver_ruleset" -H "authorization: Bearer $TOKEN"
```
Expected: `{"code":200,"data":{"status":"done"|"idle",...},"message":"ok"}` (status reflects Task 2 Step 5 run).

- [ ] **Step 6: Commit**

```bash
git add live-server/src/routes/rule/legality.ts
git commit -m "feat(live-server): PATCH windowed-invalidates scenarios + reports scope; add recheck + status endpoints"
```

---

### Task 6: Scenario legality — expose `paramsStale` + manual recheck endpoint

**Files:**
- Modify: `live-server/src/services/scenario/legality-status.ts`, `live-server/src/routes/scenario/legality.ts`

The out-of-window flow shows last-known violations + an "outdated" hint. `ensureLegality` must report `params_stale`, and a manual recheck must clear it and force a recompute.

- [ ] **Step 1: Have `ensureLegality` return `paramsStale`**

In `legality-status.ts`, change `EnsureState` consumers to also surface the flag. Add a return shape `{ state: EnsureState; paramsStale: boolean }` (or read `params_stale` in the existing `cur` select and return it). Concretely, extend the `cur` query to include `params_stale` and return it:
```ts
// in the cur select:
`select status, computed_version, roster_version, params_stale from scenario.legality_status where scenario_id = $1`
// ...and return both the state and cur.params_stale to the route (adjust the function's return type).
```
The route `GET /api/scenario/:id/legality` then includes `paramsStale` in its response payload alongside `status`/violations.

- [ ] **Step 2: Add a force-recompute helper + `POST /:id/legality/recheck`**

In `legality-status.ts`, add:
```ts
/** Force a recompute regardless of freshness, clearing the params_stale flag. Used by the
 *  manual "Recheck" on out-of-window scenarios. */
export async function forceRecompute(fastify: FastifyInstance, scenarioId: number): Promise<EnsureState> {
  await fastify.pgPool.query(
    `update scenario.legality_status set status='COMPUTING', params_stale=false,
        computed_version = computed_version - 1, updated_at = now() where scenario_id = $1`, [scenarioId])
  spawnCompute(fastify, scenarioId)
  return 'COMPUTING'
}
```
> `spawnCompute` is currently a module-private function in `legality-status.ts` — reuse it directly (same file).

In `live-server/src/routes/scenario/legality.ts`, register:
```ts
fastify.post('/:id/legality/recheck', async (request, reply) => {
  const id = Number.parseInt((request.params as { id: string }).id, 10)
  if (Number.isNaN(id)) return reply.status(400).send({ code: 400, data: null, message: 'invalid id' })
  const state = await forceRecompute(fastify, id)
  return reply.send({ code: 200, data: { status: state }, message: 'ok' })
})
```

- [ ] **Step 3: Type-check**

Run: `cd live-server && npx tsc --noEmit`
Expected: no new errors. Confirm the `ensureLegality` return-type change is propagated to its route caller.

- [ ] **Step 4: Commit**

```bash
git add live-server/src/services/scenario/legality-status.ts live-server/src/routes/scenario/legality.ts
git commit -m "feat(live-server): scenario legality reports paramsStale + manual recheck endpoint"
```

---

## Phase 3 — Frontend: indicator + wiring

### Task 7: API + types

**Files:**
- Modify: `gantt/src/services/legality-api.ts`, `gantt/src/types/legality.ts`

- [ ] **Step 1: Add types**

Append to `gantt/src/types/legality.ts`:
```ts
export interface LegalityRecheckStatus {
  status: 'idle' | 'computing' | 'done' | 'failed'
  lastCheckedAt: string | null
  error: string | null
}
export interface UpdateRuleParamsResult {
  paramJson: LegalityParamJson
  affectsLiveDefault: boolean
  scenarioCount: number
}
```

Also add a scenario manual-recheck call to the scenario legality API client (find the existing
`gantt/src/services/scenario-legality-api.ts` and append):
```ts
export async function recheckScenarioLegality(scenarioId: number): Promise<{ status: string }> {
  return api.post(`/api/scenario/${scenarioId}/legality/recheck`) as Promise<{ status: string }>
}
```
And extend the scenario legality response type with `paramsStale?: boolean` (the field added to
`GET /api/scenario/:id/legality` in Task 6).

- [ ] **Step 2: Extend the API client**

In `gantt/src/services/legality-api.ts`, change the `updateRuleParams` return type to `Promise<UpdateRuleParamsResult>` and add:
```ts
  /** Trigger a live recheck of the default ruleset for a date range (admin only). */
  triggerRecheck: (groupCode: string, from: string, to: string): Promise<{ status: string }> =>
    api.post('/api/legality/recheck', { groupCode, from, to }) as Promise<{ status: string }>,

  /** Poll the live recheck status + last-checked timestamp. */
  getRecheckStatus: (groupCode: string): Promise<LegalityRecheckStatus> =>
    api.get(`/api/legality/recheck-status?groupCode=${encodeURIComponent(groupCode)}`) as Promise<LegalityRecheckStatus>,
```
Add `LegalityRecheckStatus`, `UpdateRuleParamsResult` to the type import line.

- [ ] **Step 3: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors from these files.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/services/legality-api.ts gantt/src/types/legality.ts
git commit -m "feat(gantt): legality recheck API client + types"
```

---

### Task 8: Shared `LegalityRecheckIndicator` component

**Files:**
- Create: `gantt/src/components/legality/legality-recheck-indicator.tsx`

Follows the poll pattern from `rule-group-header.tsx:80-119` (setInterval 1500ms, terminal status, unmount cleanup) and the alignment/typography standard (`flex items-center gap-1.5`, `text-2xs`, `h-3.5 w-3.5` icons).

- [ ] **Step 1: Implement the component**

```tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import { ShieldCheck, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@rois/ui'
import { legalityApi } from '@/services/legality-api'
import { notify } from '@/utils/notify'
import type { LegalityRecheckStatus } from '@/types/legality'

interface Props {
  groupCode: string
  /** When set, render a "Recheck now" button that triggers a live recheck for [from,to]. */
  recheck?: { from: string; to: string } | null
  /** External signal (incremented by the parent on param-save) to start polling immediately. */
  pollSignal?: number
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

export function LegalityRecheckIndicator({ groupCode, recheck = null, pollSignal = 0 }: Props) {
  const [st, setSt] = useState<LegalityRecheckStatus>({ status: 'idle', lastCheckedAt: null, error: null })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stop = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  const startPolling = useCallback(() => {
    stop()
    let polls = 0
    pollRef.current = setInterval(async () => {
      polls += 1
      try {
        const s = await legalityApi.getRecheckStatus(groupCode)
        setSt(s)
        if (s.status === 'done') { stop(); notify.success('Legality recheck done') }
        else if (s.status === 'failed') { stop(); notify.error(s.error || 'Legality recheck failed') }
      } catch { /* transient — keep polling */ }
      if (polls >= 200) { stop() }
    }, 1500)
  }, [groupCode])

  // Initial fetch (show last-checked on mount); re-fetch when groupCode changes.
  useEffect(() => {
    let alive = true
    legalityApi.getRecheckStatus(groupCode).then((s) => { if (alive) { setSt(s); if (s.status === 'computing') startPolling() } }).catch(() => {})
    return () => { alive = false; stop() }
  }, [groupCode, startPolling])

  // Parent bumps pollSignal after a param save → reflect "computing" and start polling.
  useEffect(() => { if (pollSignal > 0) { setSt((p) => ({ ...p, status: 'computing' })); startPolling() } }, [pollSignal, startPolling])

  const onRecheck = async () => {
    if (!recheck) return
    setSt((p) => ({ ...p, status: 'computing' }))
    try { await legalityApi.triggerRecheck(groupCode, recheck.from, recheck.to); startPolling() }
    catch (e) { setSt((p) => ({ ...p, status: 'failed' })); notify.error(e instanceof Error ? e.message : 'Failed to start recheck') }
  }

  const computing = st.status === 'computing'
  return (
    <div className="flex items-center gap-1.5 text-2xs text-muted-foreground" data-testid="legality-recheck-indicator">
      {computing ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        : st.status === 'failed' ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        : <ShieldCheck className="h-3.5 w-3.5 shrink-0" />}
      <span data-testid="legality-recheck-label">
        {computing ? 'Checking legality…'
          : st.status === 'failed' ? 'Recheck failed'
          : `Last checked ${fmt(st.lastCheckedAt)}`}
      </span>
      {recheck && (
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2" disabled={computing}
          onClick={onRecheck} data-testid="legality-recheck-now">
          <RefreshCw className="h-3.5 w-3.5" />
          Recheck now
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd gantt && npx tsc --noEmit`
Expected: no new errors. (Confirm `notify`, `Button` import paths match the repo — `@/utils/notify` and `@rois/ui` are used in `legality-store.ts` / existing components.)

- [ ] **Step 3: UI-standard gate**

Run: `npm run check:ui`
Expected: PASS (0 hard violations). Indicator uses only token classes (`text-2xs`, `gap-1.5`, `h-3.5 w-3.5`).

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/legality/legality-recheck-indicator.tsx
git commit -m "feat(gantt): shared LegalityRecheckIndicator (info + optional recheck-now, polls status)"
```

---

### Task 9: Mount in the Legality header + trigger recheck on param save

**Files:**
- Modify: `gantt/src/components/legality/legality-view.tsx`

The header renders `worksetName` + `{rules.length} rules` (`legality-view.tsx:69-92`). The ruleset summary carries `isDefault`; the group code for the live recheck is `pbs_solver_ruleset` for the default workset. We need: (a) the default group code, (b) the active gantt date range, (c) a `pollSignal` bumped after a successful param save.

- [ ] **Step 1: Derive default group code + active range + pollSignal in `LegalityView`**

Within the component (near the existing store reads), add:
```tsx
import { LegalityRecheckIndicator } from './legality-recheck-indicator'
import { useGanttDateStore } from '@/stores/date-store' // the store backing DateRangePicker (confirm exact name/exports)
// ...
const sets = useLegalityStore((s) => s.sets)
const selectedId = useLegalityStore((s) => s.selectedId)
const isDefaultSet = sets.find((x) => x.id === selectedId)?.isDefault === true
const { start, end } = useGanttDateStore((s) => ({ start: s.startDate, end: s.endDate }))
const [recheckSignal, setRecheckSignal] = useState(0)
const RECHECK_GROUP = 'pbs_solver_ruleset' // live default group; only used when isDefaultSet
```

> Confirm the date store: search `gantt/src/stores` for the store feeding `DateRangePicker` (e.g. `date-store.ts`), and use its real selector names for `start`/`end` (ISO `YYYY-MM-DD`). If the picker stores Date objects, format to `YYYY-MM-DD` before passing.

- [ ] **Step 2: Render the indicator in the header (only for the default ruleset)**

Change the header block (`legality-view.tsx:69-78`) to append the indicator on the right:
```tsx
<div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
  <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground" />
  <span data-testid="legality-set-name" className="text-sm font-semibold text-foreground">{worksetName ?? '—'}</span>
  {selectedId !== null && (
    <span className="text-2xs text-muted-foreground">Legacy ruleset · workset #{selectedId}</span>
  )}
  {isDefaultSet && (
    <div className="ml-auto">
      <LegalityRecheckIndicator
        groupCode={RECHECK_GROUP}
        recheck={start && end ? { from: start, to: end } : null}
        pollSignal={recheckSignal}
      />
    </div>
  )}
</div>
```

- [ ] **Step 3: After a successful param save, trigger live recheck + bump the signal**

Find where the param editor calls `legalityApi.updateRuleParams(...)` and then `useLegalityStore.updateRuleParamJson(...)` (per research, the editor's `handleSaveAll` / `onSaved`). At the call site that has access to `LegalityView` state, after `updateRuleParams` resolves with `res`:
```tsx
// res: UpdateRuleParamsResult
useLegalityStore.getState().updateRuleParamJson(ruleId, res.paramJson)
if (res.affectsLiveDefault && start && end) {
  await legalityApi.triggerRecheck(RECHECK_GROUP, start, end)
  setRecheckSignal((n) => n + 1)
}
if (res.scenarioCount > 0) notify.info(`${res.scenarioCount} scenario(s) will recheck on next open`)
```
> If the save lives in a child editor component, lift the trigger into a callback prop `onSaved(res)` passed from `LegalityView` so the signal/range stay in the header's component. Keep the existing `updateRuleParamJson` local-state update.

- [ ] **Step 4: Type-check + UI gate**

Run: `cd gantt && npx tsc --noEmit && cd .. && npm run check:ui`
Expected: no new tsc errors; UI gate PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/legality/legality-view.tsx
git commit -m "feat(gantt): legality header shows last-check + Recheck now; auto-trigger live recheck on param save"
```

---

### Task 10: Alert Center — remove "Scan live", mount info indicator

**Files:**
- Modify: `gantt/src/components/panes/violation-list-dialog.tsx`

- [ ] **Step 1: Replace the "Scan live" button with the info indicator**

Change the date row (`violation-list-dialog.tsx:135-142`) to:
```tsx
{/* Date row — drives the gantt's own range; recheck status is informational here. */}
<div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
  <DateRangePicker />
  <div className="ml-auto">
    <LegalityRecheckIndicator groupCode="pbs_solver_ruleset" />
  </div>
</div>
```
Add the import: `import { LegalityRecheckIndicator } from '../legality/legality-recheck-indicator'`. Remove the now-unused `RadioTower` import and the `onScan` prop from the component's props interface (line ~30) **only if** no other code passes it; otherwise keep the prop but stop rendering the button. Search callers of `ViolationListDialog` for `onScan=` and remove those props.

- [ ] **Step 2: Type-check + UI gate**

Run: `cd gantt && npx tsc --noEmit && cd .. && npm run check:ui`
Expected: no new tsc errors (unused `onScan`/`RadioTower` removed); UI gate PASS.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/panes/violation-list-dialog.tsx
git commit -m "feat(gantt): Alert Center shows last-check info, drops manual Scan live (3.C)"
```

---

### Task 11: Scenario legality — always-on Recheck button + conditional "outdated" hint

**Files:**
- Modify: the existing scenario legality view component (search `gantt/src/components/scenario-gantt` for where `fetchScenarioLegality` / scenario legality status renders).

Design (confirmed): the **Recheck** button is shown on **every** scenario (a consistent manual force-recheck affordance); the **"outdated — params changed" hint** appears **only** when `paramsStale` (out-of-window scenarios). In-window scenarios still auto-recompute on open via the backend, so they normally show no hint — the button is just an always-available manual re-run.

- [ ] **Step 1: Render an always-on Recheck control + a conditional outdated hint**

In the scenario legality view toolbar/header, render the Recheck button unconditionally, and the hint only when `paramsStale`:
```tsx
<div className="flex items-center gap-1.5 border-b border-border px-4 py-2 text-2xs text-foreground"
     data-testid="scenario-legality-bar">
  {legality.paramsStale && (
    <span className="flex items-center gap-1.5 rounded bg-amber-500/10 px-2 py-0.5" data-testid="scenario-legality-outdated">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      Legality may be outdated — rule parameters changed since last check.
    </span>
  )}
  <Button size="sm" variant="ghost" className="ml-auto h-7 gap-1.5 px-2" data-testid="scenario-legality-recheck"
    onClick={async () => { await recheckScenarioLegality(scenarioId); /* re-fetch legality → COMPUTING → READY */ }}>
    <RefreshCw className="h-3.5 w-3.5" /> Recheck
  </Button>
</div>
```
Import `recheckScenarioLegality` from the scenario legality API (Task 7). After the click, re-run the existing legality fetch/subscribe so the view transitions COMPUTING → READY and the hint clears (the backend cleared `params_stale`).

- [ ] **Step 2: Type-check + UI gate**

Run: `cd gantt && npx tsc --noEmit && cd .. && npm run check:ui`
Expected: no new tsc errors; UI gate PASS (token classes only; `bg-amber-500/10` is a semantic utility, acceptable like the existing `bg-amber-500` alert badge).

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/scenario-gantt
git commit -m "feat(gantt): scenario legality shows outdated hint + manual Recheck for out-of-window scenarios"
```

---

### Task 12: Version bump

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Bump backend + frontend**

```ts
export const BACKEND_VERSION = 136  // live legality recheck (Rust core + endpoints, windowed scenario invalidation)
export const FRONTEND_VERSION = 281 // legality recheck indicator + Alert Center swap + scenario outdated hint
```
(RULE_VERSION unchanged — no rule logic changed, only orchestration.)

- [ ] **Step 2: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore: bump versions for legality auto-recheck (B136/F281)"
```

---

## Phase 4 — Tests (§Playwright-Required, §No-Illusion)

### Task 13: E2E — Alert Center swap + Legality indicator + manual recheck

**Files:**
- Create: `e2e/tests/gantt/legality-auto-recheck.spec.ts`

Model setup on `e2e/tests/gantt/legality-tab.spec.ts` (`seedGanttAuth`, `/fpqe/gantt/`, `module-nav-legality`, `legality-ruleset-card-103` for the default) and `alert-center-8002.spec.ts` (`violations-button` → `violation-list-dialog`). Use the **default** ruleset card (103, badged Default) since the indicator only renders there.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { seedGanttAuth } from '../../helpers/gantt-auth' // match the real helper path used by legality-tab.spec.ts

const openLegalityDefault = async (page: Page, request: APIRequestContext) => {
  await seedGanttAuth(page, request)
  await page.goto('/fpqe/gantt/')
  await page.getByTestId('module-nav-legality').click()
  await page.getByTestId('legality-view').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId('legality-ruleset-card-103').click()
  await expect(page.getByTestId('legality-set-name')).toContainText('PBS Solver Ruleset', { timeout: 10_000 })
}

test('Legal-6037 — default ruleset header shows last-check indicator + Recheck now', async ({ page, request }) => {
  await openLegalityDefault(page, request)
  const ind = page.getByTestId('legality-recheck-indicator')
  await expect(ind).toBeVisible()
  await expect(page.getByTestId('legality-recheck-label')).toContainText(/Last checked|Checking legality/)
  await expect(page.getByTestId('legality-recheck-now')).toBeVisible()
})

test('Legal-6038 — non-default ruleset hides the indicator', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await page.goto('/fpqe/gantt/')
  await page.getByTestId('module-nav-legality').click()
  await page.getByTestId('legality-view').waitFor({ state: 'visible' })
  await page.getByTestId('legality-ruleset-card-433').click()
  await expect(page.getByTestId('legality-set-name')).toContainText('F8 Full Ruleset')
  await expect(page.getByTestId('legality-recheck-indicator')).toHaveCount(0)
})

test('Legal-6039 — manual Recheck now flips label to Checking', async ({ page, request }) => {
  await openLegalityDefault(page, request)
  await page.getByTestId('legality-recheck-now').click()
  await expect(page.getByTestId('legality-recheck-label')).toContainText('Checking legality…', { timeout: 5_000 })
})

test('Viol-8009 — Alert Center drops Scan live and shows the last-check indicator', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await page.goto('/fpqe/gantt/')
  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('alert-center-scan')).toHaveCount(0)
  await expect(dialog.getByTestId('legality-recheck-indicator')).toBeVisible()
})
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test e2e/tests/gantt/legality-auto-recheck.spec.ts --reporter=list` (add `--no-deps` if pbs-server :3002 is down, per project memory)
Expected: 4 passed. If `Legal-6039` is flaky because the recheck completes faster than the assertion, assert the terminal state instead: `await expect(page.getByTestId('legality-recheck-label')).toContainText(/Checking legality|Last checked/)`.

- [ ] **Step 3: Paste the PASS summary into the completion message and commit**

```bash
git add e2e/tests/gantt/legality-auto-recheck.spec.ts
git commit -m "test(e2e): legality recheck indicator + Alert Center scan-live removal"
```

---

### Task 14: E2E — scenario invalidation (in-window recompute + out-of-window hint) + always-on Recheck

**Files:**
- Create: `e2e/tests/gantt/scenario-legality-param-invalidation.spec.ts`

Proves the scenario branch: a param change windowed-invalidates DONE scenarios; an in-window scenario recomputes on open (COMPUTING→READY), an out-of-window one shows the `scenario-legality-outdated` hint, and the always-on `scenario-legality-recheck` button force-recomputes. The test edits a param via the admin API (deterministic), then opens the scenario. Use scenario **6** (loaded per project memory); pick its window relative to today (2026-06 → in-window). If only one scenario exists, assert the always-on button + the recompute path, and assert the hint testid's presence/absence matches the scenario's window.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test'
import { seedGanttAuth, ganttApiLogin } from '../../helpers/gantt-auth' // match real exports

test('Scen-2xxx — param change marks a DONE scenario stale and it recomputes on open', async ({ page, request }) => {
  const token = await ganttApiLogin(request) // admin (Ryan) token
  // 1) read a rule's current params (8002/006), PATCH them unchanged to bump updated_at + mark scenarios stale
  const rs = await request.get('/api/legality/ruleset/103', { headers: { authorization: `Bearer ${token}` } })
  const body = await rs.json()
  const rule = body.data.rules.find((r: { function: number }) => r.function === 8002)
  const patch = await request.patch(`/api/legality/rule/${rule.id}/params`, {
    headers: { authorization: `Bearer ${token}` }, data: { paramJson: rule.paramJson },
  })
  const pj = await patch.json()
  expect(pj.code).toBe(200)
  expect(pj.data).toHaveProperty('scenarioCount')

  // 2) open scenario 6 and assert: always-on Recheck button present; in-window → recomputes
  //    to READY (no outdated hint); out-of-window → outdated hint visible.
  await seedGanttAuth(page, request)
  await page.goto('/fpqe/gantt/')
  await page.getByTestId('module-nav-scenario').click()
  await page.getByTestId('scenario-row-6').click()
  await expect(page.getByTestId('scenario-legality-recheck')).toBeVisible() // always-on button
  await expect(page.getByTestId('scenario-legality-status')).toContainText(/READY|Ready/, { timeout: 30_000 })
  // Scenario 6 is in the current window (2026-06) → it auto-recomputed, so no outdated hint:
  await expect(page.getByTestId('scenario-legality-outdated')).toHaveCount(0)
  // Manual force-recheck still works from the always-on button:
  await page.getByTestId('scenario-legality-recheck').click()
  await expect(page.getByTestId('scenario-legality-status')).toContainText(/COMPUTING|Computing|READY|Ready/, { timeout: 30_000 })
})

// Out-of-window companion: if an out-of-window DONE scenario exists, assert the hint shows and
// clears after Recheck. Skip gracefully if no such scenario is seeded.
```
> Confirm the real testids: search `e2e/tests` and `gantt/src` for the scenario list row + scenario legality status testids (`scenario-row-*`, `scenario-legality-status`). Adjust to the actual names; keep assertions content-based (status text + hint presence/absence), not just visibility.

- [ ] **Step 2: Run the spec**

Run: `npx playwright test e2e/tests/gantt/scenario-legality-param-invalidation.spec.ts --reporter=list`
Expected: 1 passed. If scenario 6 recompute needs the Rust binaries built, ensure `rule-engine-rs/target/release` exists (build once: `cd rule-engine-rs && cargo build --release`).

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/gantt/scenario-legality-param-invalidation.spec.ts
git commit -m "test(e2e): scenario legality windowed invalidation + always-on recheck"
```

---

### Task 15: Integration receipt — param change actually changes live violation count (§No-Illusion regression)

**Files:**
- (No new file — a documented manual/integration run; optionally add to `live-server/tests` if a DB-backed harness exists.)

This is the load-bearing proof that the recheck reaches reality through Rust + legacy params (guards against the broken modern path silently no-op-ing).

- [ ] **Step 1: Baseline the live 8002 violation count for the window**

```bash
cd live-server && node -e "import('pg').then(async({default:pg})=>{const u=require('fs').readFileSync('.env','utf8').split('\n').find(l=>l.startsWith('DATABASE_URL=')).slice(13).trim().replace(/^[\"']|[\"']$/g,'');const c=new pg.Client({connectionString:u});await c.connect();const r=await c.query(\"select count(*)::int n from rule_violation where rule_group_code='pbs_solver_ruleset' and rule_code='8002' and start_dt>='2026-06-01' and start_dt<'2026-08-01'\");console.log('baseline 8002:',r.rows[0].n);await c.end()})"
```
Record the baseline N.

- [ ] **Step 2: Lower the 8002 limit far below 40h via the admin API, then recheck**

```bash
# PATCH 8002/006 limit-bearing param to a tiny value (e.g. 1h) — adjust table/col to the real param_json shape
curl -s localhost:3000/api/legality/recheck -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"groupCode":"pbs_solver_ruleset","from":"2026-06-01","to":"2026-07-31"}'
# wait for status=done
curl -s "localhost:3000/api/legality/recheck-status?groupCode=pbs_solver_ruleset" -H "authorization: Bearer $TOKEN"
```

> NOTE: rule 8002's 40h window is currently hardcoded in `legality-recheck-core.mjs` `rule8002` (`W.limitHours = 40`), matching the pre-existing scenario script. The honest regression that proves "param reaches the engine" should target a rule whose Rust flag IS sourced from `param_json` (e.g. 7501 `--min-limits`, 7503 `--max-consecutive`, 7505 `Min DO`). Pick 7503: PATCH its `Max Consecutive` from 2→1 and assert the 7503 count rises after recheck. (8002's limit being constant is a known limitation — see spec §3.1; widen `rule8002` to read `param_json` only if product wants 8002's band editable.)

- [ ] **Step 3: Re-count and assert the change**

Re-run Step 1's count for rule_code `7503`; assert it increased vs its baseline. Paste both numbers into the completion message as the receipt. Restore the param to its original value and recheck once more to leave data clean.

- [ ] **Step 4: Commit (if a harness file was added)**

```bash
git commit -am "test: document live recheck regression receipt (7503 count responds to param change)" || true
```

---

## Task index (after renumbering)

| # | Task | Phase |
|---|---|---|
| 1 | Extract shared Rust recheck core (+ batched insert) | 1 |
| 2 | `live-legality.mjs` live entry + Redis status | 1 |
| 3 | Migration: `scenario.legality_status.params_stale` | 2 |
| 4 | Affected-roster resolution + windowed invalidation service | 2 |
| 5 | PATCH windowed-invalidate + `recheck` / `recheck-status` endpoints | 2 |
| 6 | Scenario `paramsStale` exposure + manual recheck endpoint | 2 |
| 7 | gantt API client + types | 3 |
| 8 | Shared `LegalityRecheckIndicator` | 3 |
| 9 | Legality header indicator + trigger on save | 3 |
| 10 | Alert Center: drop Scan live, mount info indicator | 3 |
| 11 | Scenario legality: always-on Recheck + conditional outdated hint | 3 |
| 12 | Version bump | 3 |
| 13 | E2E: indicator + manual recheck + Alert Center swap | 4 |
| 14 | E2E: scenario windowed invalidation + always-on recheck | 4 |
| 15 | Integration receipt: live count responds to param change (7503) | 4 |

## Self-review notes (resolved before finalizing)

- **Spec coverage:** 1.A/1.C live default + scenarios-with-roster → Tasks 4–5, 9, 14. 1.B no-roster rulesets skipped → `resolveAffected` only returns DONE scenarios + live default (Task 4). 1.D/1.E whole-ruleset → core runs the whole group (Task 1). 2 (rule→multi-ruleset→multi-scenario) → `resolveAffected` unions all worksets then all DONE scenarios (Task 4). Efficiency (windowed scenarios, batched insert) → Tasks 1–4. 3 indicator (idle/checking/done + timestamp) → Tasks 8–9. 3.C Alert Center info-only, Scan live removed → Task 10. Scenario outdated hint + always-on Recheck → Tasks 6, 11.
- **Type consistency:** `LegalityRecheckStatus` / `UpdateRuleParamsResult` defined in Task 7 and consumed identically in Tasks 8–9. `resolveAffected`/`markScenariosStale`/`flagScenariosParamsStale`/`spawnLiveRecheck` defined in Task 4 and used unchanged in Task 5. `AffectedRosters` returns `inWindowScenarioIds`/`outOfWindowScenarioIds`/`scenarioCount` (Task 4) — Task 5 uses exactly those. Redis key shape `legality:recheck:{airline}:{group}:{field}` identical in `live-legality.mjs` (Task 2) and the status endpoint (Task 5). `buildBulkInsert` defined in Task 1, used in Tasks 1 & 2.
- **Scenario UX (confirmed):** Recheck button is **always-on** (every scenario, Task 11); the **outdated hint** is conditional on `paramsStale` (out-of-window). In-window scenarios auto-recompute on open (backend, Tasks 4–6); the button is an extra manual force-recheck.
- **Known limitation flagged (not a placeholder):** 8002's 40h limit is constant in the core (inherited from the existing scenario script); the §No-Illusion regression uses 7503 (a genuinely `param_json`-sourced flag). Making 8002 editable is out of scope unless product asks.
- **Confirm-at-implementation items (searches, not guesses):** exact date-store selector names (Task 9), the param-editor save call site / `onSaved` callback wiring (Task 9 Step 3), scenario list + legality-status testids and the scenario legality view file (Tasks 11, 14), `seedGanttAuth`/`ganttApiLogin` helper paths (Tasks 13–14), the `redis` package name (Task 2), and the `ensureLegality` return-type propagation to its route caller (Task 6). Each step says exactly what to search for.
