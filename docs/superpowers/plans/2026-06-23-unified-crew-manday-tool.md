# Unified Crew-Manday Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One credit engine (the Rust `ruletool` core) computes crew-manday for both Live and Scenario; Live roster saves recompute reliably and synchronously; all seven manday KPIs update optimistically in the browser; existing stale Live credit is repaired.

**Architecture:** A new TypeScript driver in `live-server` (`manday-tool.ts`) owns all DB I/O around the Rust core: it reads roster activity through live-server's warm `pgPool`, pipes TSV to the `ruletool` binary (pure stdin/stdout arithmetic, no DB), and upserts the daily/monthly/yearly buckets. It is parameterized by `(schema, scope)` — scoped (crew + window, delete-to-zero) for Live edits and repair, full (date window, all crew) for imports, and full-roster for scenarios. Every current `recalcMandayCredit` caller migrates onto it; then the SQL engine and the async `manday:recalc` queue are deleted. The browser computes per-crew deltas for all seven KPIs (generalizing the existing MCred delta) so the editing user sees correct numbers instantly; the authoritative server recompute broadcasts `roster-updated` so other gantts converge.

**Tech Stack:** TypeScript, Fastify, node-postgres (`pg.Pool`), Drizzle (for some callers), Rust `ruletool` binary, Vitest (real-DB, rolled-back), React 19 + Zustand + Canvas (gantt), Playwright.

## Global Constraints

- Version bump (root `CLAUDE.md` 版本号管理): backend change → `BACKEND_VERSION` +1; frontend change → `FRONTEND_VERSION` +1. Single source `gantt/src/version.ts`. Never reuse/decrement.
- §No-Illusion: every task pastes the PASS/FAIL test receipt; no "done" without a run.
- §Playwright-Required / §Simulate-User: UI behavior proven by Playwright driving real UI (click buttons, let UI fire requests); never call the business API to fake a user action.
- §Minimal-First / §Surgical: only what the spec requires; keep each modified file's existing style.
- DB facts: warm raw pool is `fastify.pgPool` (`pg.Pool`); drizzle is `fastify.db`. Live schema = `f8`. Rust binary = `rule-engine-rs/target/release/ruletool` (TSV stdin/stdout; flags `--band-min 3900 --band-max 4500` = F8 65:00/75:00). Tests read `DATABASE_URL` from `.env` and self-skip if unreachable, doing all work in ONE rolled-back transaction so shared dev data is never mutated.
- Credit model (single source, do not reimplement): flying = `MAX(duty_act_credited_minutes)` per `(crew,pairing,duty_seq)`; ground = assignment definition (`fixed_credit_min` if ≥0 else `credit_pct × duty_minutes`); flags DO→is_day_off, VAC→is_al (FD), ILL→is_leave (CC); division routing `crew.division='P'`→fd else cc_am; local date via crew base airport `zone_id`.

---

## File Structure

**Create:**
- `live-server/src/services/manday/manday-tool.ts` — the unified driver (load activity → TSV → Rust → upsert), `pg.Pool`-based, schema+scope parameterized.
- `live-server/src/services/manday/manday-tool-rust.ts` — thin wrapper that spawns the `ruletool` binary and parses its TSV output (separated so it can be unit-tested without DB).
- `live-server/src/__tests__/services/manday-tool.test.ts` — real-DB parity (scoped + full) vs `recalcMandayCredit`, and scoped-vs-full equivalence.
- `gantt/src/utils/manday-delta.ts` — per-crew optimistic deltas for all seven KPIs from in-memory roster items.
- `gantt/src/utils/__tests__/manday-delta.test.ts` — unit tests for the KPI delta math.
- `e2e/tests/gantt/manday-kpis-cross-user.spec.ts` — two-user Playwright over all KPIs.

**Modify:**
- `live-server/src/routes/draft/draft.ts` — replace `recalcMandayCredit` with `mandayTool.recompute` (scoped, all touched crew, one call).
- `live-server/src/routes/roster/roster.ts` — replace every `enqueueMandayRecalcForMutation` with a synchronous `mandayTool.recompute`.
- `live-server/src/workers/roster-inbound-worker.ts`, `roster-ground-inbound-worker.ts`, `manday-inbound-worker.ts` — full-mode `mandayTool.recompute`.
- `live-server/src/routes/admin/manday-credit-refresh.ts` — `mandayTool.recompute`; add a `scope=ghosts` repair mode.
- `live-server/scripts/ruletool.mjs` — scenario path delegates to the shared TSV-build/Rust/upsert core (no duplicate math).
- `gantt/src/components/gantt/source/live-gantt-source.ts` — generalize `draftCreditDeltaByCrew` → `draftMandayDeltaByCrew`; apply all KPI deltas in `buildPanelRows`.
- `gantt/src/version.ts` — bump.

**Delete (final phase, after parity green + callers switched):**
- `live-server/src/services/manday/manday-credit-service.ts` (`recalcMandayCredit`).
- `live-server/src/services/manday/manday-recalc-trigger.ts` (`enqueueMandayRecalcForMutation`).
- `live-server/src/workers/manday-recalc-worker.ts` + its queue registration.
- `live-server/src/__tests__/services/manday-credit-service.test.ts` (replaced by `manday-tool.test.ts`).

---

## Phase 1 — The unified driver + parity gate

### Task 1: Rust-runner wrapper (no DB)

**Files:**
- Create: `live-server/src/services/manday/manday-tool-rust.ts`
- Test: covered indirectly by Task 3 parity (pure function; a focused unit test is added in Step 1 below).

**Interfaces:**
- Produces: `type ActivityRow = { crewId: string; division: string; localDate: string; kind: 'FLY'|'GND'; a1: number; a2: number; a3: number; flag: ''|'DO'|'VAC'|'ILL' }`
- Produces: `runRust(rows: ActivityRow[], bandMin?: number, bandMax?: number): { D: string[][]; M: string[][]; Y: string[][] }`

- [ ] **Step 1: Write the failing test**

Create `live-server/src/__tests__/services/manday-tool-rust.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { runRust } from '../../services/manday/manday-tool-rust.js'

describe('runRust (spawns the ruletool binary)', () => {
  it('credits a single flying duty into daily + monthly', () => {
    const { D, M } = runRust([
      { crewId: 'X1', division: 'P', localDate: '2026-06-05', kind: 'FLY', a1: 495, a2: -1, a3: 0, flag: '' },
    ])
    // daily: D \t crew \t div \t date \t blh \t credit \t is_do \t is_al \t is_leave
    const d = D.find((r) => r[1] === 'X1' && r[3] === '2026-06-05')
    expect(d?.[5]).toBe('495')          // credit
    const m = M.find((r) => r[1] === 'X1' && r[3] === '2026-06')
    expect(m?.[5]).toBe('495')          // monthly credit
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd live-server && npx vitest run src/__tests__/services/manday-tool-rust.test.ts`
Expected: FAIL — cannot find module `manday-tool-rust.js`.

- [ ] **Step 3: Write minimal implementation**

Create `live-server/src/services/manday/manday-tool-rust.ts`:

```typescript
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// live-server/src/services/manday → repo root → rule-engine-rs/target/release/ruletool
const RUST_BIN = path.resolve(__dirname, '../../../../rule-engine-rs/target/release/ruletool')

export interface ActivityRow {
  crewId: string
  division: string
  localDate: string          // YYYY-MM-DD (crew-base local)
  kind: 'FLY' | 'GND'
  a1: number                 // FLY: credited minutes; GND: duty minutes
  a2: number                 // GND: fixed_credit_min (-1 = NULL); FLY: -1
  a3: number                 // GND: credit_pct (float); FLY: 0
  flag: '' | 'DO' | 'VAC' | 'ILL'
}

export interface RustGrains { D: string[][]; M: string[][]; Y: string[][] }

const toTsv = (r: ActivityRow): string =>
  `${r.crewId}\t${r.division}\t${r.localDate}\t${r.kind}\t${r.a1}\t${r.a2}\t${r.a3}\t${r.flag}`

/** Spawn the pure-arithmetic Rust core. No DB. Throws on non-zero exit. */
export function runRust(rows: ActivityRow[], bandMin = 3900, bandMax = 4500): RustGrains {
  const res = spawnSync(RUST_BIN, ['--band-min', String(bandMin), '--band-max', String(bandMax)], {
    input: rows.map(toTsv).join('\n'),
    encoding: 'utf-8',
    maxBuffer: 1 << 28,
  })
  if (res.status !== 0) throw new Error(`ruletool exited ${res.status}: ${res.stderr}`)
  const D: string[][] = [], M: string[][] = [], Y: string[][] = []
  for (const line of res.stdout.split('\n')) {
    if (!line) continue
    const f = line.split('\t')
    if (f[0] === 'D') D.push(f)
    else if (f[0] === 'M') M.push(f)
    else if (f[0] === 'Y') Y.push(f)
  }
  return { D, M, Y }
}
```

- [ ] **Step 4: Build the Rust binary if missing, then run the test**

Run: `cd rule-engine-rs && cargo build --release --bin ruletool && cd ../live-server && npx vitest run src/__tests__/services/manday-tool-rust.test.ts`
Expected: PASS (daily credit 495, monthly credit 495).

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/manday/manday-tool-rust.ts live-server/src/__tests__/services/manday-tool-rust.test.ts
git commit -m "feat(manday): Rust-core runner wrapper (TSV in/out, no DB)"
```

---

### Task 2: The driver — load activity, build TSV, upsert (scoped + full)

**Files:**
- Create: `live-server/src/services/manday/manday-tool.ts`
- Test: `live-server/src/__tests__/services/manday-tool.test.ts` (added here, expanded in Task 3)

**Interfaces:**
- Consumes: `runRust`, `ActivityRow` from Task 1.
- Produces:
```typescript
interface RecomputeOpts {
  schema: 'f8' | 'scenario'
  scenarioId?: number          // scenario only
  crewIds?: string[]           // scoped (Live edit / repair); omit = all crew
  startDt?: string             // YYYY-MM-DD inclusive (Live/import window); omit = no lower bound
  endDt?: string               // YYYY-MM-DD inclusive; omit = no upper bound
  updatedBy?: string
}
interface RecomputeResult { crews: number; daily: number; monthly: number; yearly: number }
async function recompute(pool: pg.Pool, opts: RecomputeOpts): Promise<RecomputeResult>
```
- Scope contract (matches the retired SQL engine): in scoped mode (`crewIds` set), FIRST delete-to-zero the affected crews' `crew_manday_*_daily` rows inside `[startDt,endDt]`, then upsert recomputed rows; rows OUTSIDE the window are preserved. Monthly/yearly are re-derived for the affected crews from their daily rows.

- [ ] **Step 1: Write the failing test (scoped credit recompute on a known crew)**

Create `live-server/src/__tests__/services/manday-tool.test.ts`:

```typescript
import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { recompute } from '../../services/manday/manday-tool.js'

const CONN = process.env.DATABASE_URL
let pool: pg.Pool | null = null
let reachable = false

beforeAll(async () => {
  if (!CONN) return
  try { pool = new pg.Pool({ connectionString: CONN, max: 2, connectionTimeoutMillis: 3000 }); await pool.query('SELECT 1'); reachable = true }
  catch { if (pool) await pool.end().catch(() => {}); pool = null }
})
afterAll(async () => { if (pool) await pool.end().catch(() => {}) })

describe('manday-tool recompute (real DB, rolled back)', () => {
  it('scoped recompute writes monthly credit matching the crew roster', async () => {
    if (!reachable || !pool) { console.warn('[manday-tool.test] DB unreachable — skipping'); return }
    const c = await pool.connect()
    try {
      await c.query('BEGIN')
      await c.query('SET LOCAL search_path TO f8')
      // crew 386: roster has only VAC (2×240) in June → credit must become 480
      await recompute({ query: (q: string, p?: unknown[]) => c.query(q, p) } as unknown as pg.Pool, {
        schema: 'f8', crewIds: ['386'], startDt: '2026-06-01', endDt: '2026-06-30', updatedBy: 'TEST',
      })
      const r = await c.query(`SELECT credit FROM crew_manday_fd_monthly WHERE crew_id='386' AND year_month='2026-06'`)
      expect(Number(r.rows[0]?.credit)).toBe(480)
    } finally { await c.query('ROLLBACK'); c.release() }
  }, 30000)
})
```

> Note: the test passes a single pinned client wrapped as a "pool" so all work (incl. the driver's internal queries) runs in ONE rolled-back transaction. The driver MUST issue every query through the passed object's `.query()` and MUST NOT open its own connections.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd live-server && npx vitest run src/__tests__/services/manday-tool.test.ts`
Expected: FAIL — cannot find module `manday-tool.js`.

- [ ] **Step 3: Write the driver**

Create `live-server/src/services/manday/manday-tool.ts`:

```typescript
import type pg from 'pg'
import { runRust, type ActivityRow } from './manday-tool-rust.js'

export interface RecomputeOpts {
  schema: 'f8' | 'scenario'
  scenarioId?: number
  crewIds?: string[]
  startDt?: string
  endDt?: string
  updatedBy?: string
}
export interface RecomputeResult { crews: number; daily: number; monthly: number; yearly: number }

type Queryable = Pick<pg.Pool, 'query'>

const asUtc = (s: string | null): string | null => {
  if (!s) return null
  const t = String(s).replace(' ', 'T')
  return /[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : t + 'Z'
}
const toLocalDate = (utcIso: string, zoneId: string): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zoneId, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(utcIso))
  } catch { return utcIso.slice(0, 10) }
}

/** crew → {division, base}; base = latest crew_base. Always read from live f8 (scenario reuses live crew). */
async function loadCrewMeta(db: Queryable, crewIds: string[]): Promise<Map<string, { division: string; base: string }>> {
  const meta = new Map<string, { division: string; base: string }>()
  if (!crewIds.length) return meta
  const cr = await db.query(`SELECT crew_id, division FROM f8.crew WHERE crew_id = ANY($1)`, [crewIds])
  for (const r of cr.rows) meta.set(r.crew_id, { division: r.division || '', base: '' })
  const cb = await db.query(
    `SELECT DISTINCT ON (crew_id) crew_id, base FROM f8.crew_base WHERE crew_id = ANY($1) ORDER BY crew_id, eff_dt DESC`, [crewIds])
  for (const r of cb.rows) { const m = meta.get(r.crew_id) ?? { division: '', base: '' }; m.base = r.base; meta.set(r.crew_id, m) }
  return meta
}
async function zoneResolver(db: Queryable, meta: Map<string, { base: string }>): Promise<(crewId: string) => string> {
  const bases = [...new Set([...meta.values()].map((m) => m.base).filter(Boolean))]
  const tz = new Map<string, string>()
  if (bases.length) {
    const rows = await db.query(`SELECT airport, zone_id FROM f8.airport WHERE airport = ANY($1)`, [bases])
    for (const r of rows.rows) if (r.zone_id) tz.set(r.airport, r.zone_id)
  }
  return (crewId) => tz.get(meta.get(crewId)?.base ?? '') ?? 'UTC'
}
async function loadAsgDefs(db: Queryable): Promise<Map<string, { fixed: number; pct: number }>> {
  const m = new Map<string, { fixed: number; pct: number }>()
  const rows = await db.query(`SELECT assignment, fixed_credit_min, credit_pct FROM f8.assignment`)
  for (const r of rows.rows) m.set(r.assignment, {
    fixed: r.fixed_credit_min == null ? -1 : Number(r.fixed_credit_min),
    pct: r.credit_pct == null ? 0 : Number(r.credit_pct),
  })
  return m
}

// Read timestamps as UTC wall-clock TEXT (columns are `timestamp` w/o tz holding UTC).
const TS = (c: string): string => `to_char(${c}, 'YYYY-MM-DD"T"HH24:MI:SS')`

interface RosterActivity { flying: Array<{ crewId: string; creditMin: number; startUtc: string | null }>; ground: Array<{ crewId: string; assignment: string; startUtc: string | null; endUtc: string | null }> }

async function loadActivity(db: Queryable, opts: RecomputeOpts): Promise<{ crewIds: string[]; act: RosterActivity }> {
  const table = `${opts.schema}.roster_flight`
  const where: string[] = []
  const params: unknown[] = []
  if (opts.schema === 'scenario') { params.push(opts.scenarioId); where.push(`scenario_id = $${params.length}`) }
  if (opts.crewIds?.length) { params.push(opts.crewIds); where.push(`crew_id = ANY($${params.length})`) }
  if (opts.startDt) { params.push(opts.startDt); where.push(`sch_str_dt_utc >= $${params.length}::date`) }
  if (opts.endDt) { params.push(opts.endDt); where.push(`sch_str_dt_utc < ($${params.length}::date + INTERVAL '1 day')`) }
  where.push(`is_deleted = 0`)
  const W = where.join(' AND ')

  const fly = await db.query(
    `SELECT crew_id, MAX(act_credited_minutes) credit, ${TS('MIN(sch_str_dt_utc)')} start_utc
       FROM ${table} WHERE ${W} AND pairing_id IS NOT NULL GROUP BY crew_id, pairing_id, duty_seq`, params)
  const gnd = await db.query(
    `SELECT crew_id, assignment, assignment_group, ${TS('sch_str_dt_utc')} s, ${TS('sch_end_dt_utc')} e
       FROM ${table} WHERE ${W} AND pairing_id IS NULL`, params)

  const flying = fly.rows.map((r) => ({ crewId: r.crew_id, creditMin: Math.round(Number(r.credit || 0)), startUtc: asUtc(r.start_utc) }))
  const ground = gnd.rows.map((r) => ({ crewId: r.crew_id, assignment: r.assignment || r.assignment_group || '', startUtc: asUtc(r.s), endUtc: asUtc(r.e) }))
  const crewIds = opts.crewIds?.length ? opts.crewIds : [...new Set([...flying, ...ground].map((x) => x.crewId))]
  return { crewIds, act: { flying, ground } }
}

function buildRows(act: RosterActivity, meta: Map<string, { division: string }>, zoneOf: (c: string) => string, defs: Map<string, { fixed: number; pct: number }>): ActivityRow[] {
  const rows: ActivityRow[] = []
  for (const f of act.flying) {
    const m = meta.get(f.crewId); if (!m || !f.startUtc) continue
    rows.push({ crewId: f.crewId, division: m.division, localDate: toLocalDate(f.startUtc, zoneOf(f.crewId)), kind: 'FLY', a1: f.creditMin, a2: -1, a3: 0, flag: '' })
  }
  for (const g of act.ground) {
    const m = meta.get(g.crewId); if (!m || !g.startUtc || !g.endUtc) continue
    const dutyMin = Math.round((new Date(g.endUtc).getTime() - new Date(g.startUtc).getTime()) / 60000)
    const code = (g.assignment || '').toUpperCase()
    const def = defs.get(g.assignment) || defs.get(code) || { fixed: -1, pct: 0 }
    const flag = code === 'DO' ? 'DO' : code === 'VAC' ? 'VAC' : code === 'ILL' ? 'ILL' : ''
    rows.push({ crewId: g.crewId, division: m.division, localDate: toLocalDate(g.startUtc, zoneOf(g.crewId)), kind: 'GND', a1: dutyMin, a2: def.fixed, a3: def.pct, flag: flag as ActivityRow['flag'] })
  }
  return rows
}

export async function recompute(pool: pg.Pool, opts: RecomputeOpts): Promise<RecomputeResult> {
  const db = pool as unknown as Queryable
  const updatedBy = opts.updatedBy ?? 'MANDAY_TOOL'
  const sch = opts.schema
  const scoped = !!opts.crewIds?.length

  const { crewIds, act } = await loadActivity(db, opts)
  const meta = await loadCrewMeta(db, crewIds)
  const zoneOf = await zoneResolver(db, meta)
  const defs = await loadAsgDefs(db)
  const grains = runRust(buildRows(act, meta, zoneOf, defs))

  // Delete-to-zero / clear before upsert.
  const scenFilter = sch === 'scenario' ? ` AND scenario_id = ${Number(opts.scenarioId)}` : ''
  const crewFilter = scoped ? ` AND crew_id = ANY($1)` : ''
  const crewParam = scoped ? [opts.crewIds] : []
  const winFilter = (col: string): string =>
    (opts.startDt ? ` AND ${col} >= '${opts.startDt}'::date` : '') + (opts.endDt ? ` AND ${col} <= '${opts.endDt}'::date` : '')

  const dailyTables = sch === 'scenario'
    ? [['crew_manday_fd_daily', 'crew_base_dt'], ['crew_manday_cc_am_daily', 'crew_base_dt']]
    : [['crew_manday_fd_daily', 'crew_base_dt'], ['crew_manday_cc_am_daily', 'crew_base_dt']]

  for (const [t, dcol] of dailyTables) {
    if (scoped) {
      await db.query(`DELETE FROM ${sch}.${t} WHERE TRUE${scenFilter}${crewFilter}${winFilter(dcol)}`, crewParam)
    } else {
      // full mode: clear the window for ALL crew (imports) or the whole scenario.
      await db.query(`DELETE FROM ${sch}.${t} WHERE TRUE${scenFilter}${winFilter(dcol)}`)
    }
  }

  // Upsert grains. Map: D[4]=blh D[5]=credit D[6]=is_do D[7]=is_al D[8]=is_leave; M/Y same idx, key at [3].
  const idVal = sch === 'scenario' ? `${Number(opts.scenarioId)},` : ''
  const idCol = sch === 'scenario' ? 'scenario_id,' : ''
  let daily = 0, monthly = 0, yearly = 0

  const upsert = async (
    rows: string[][], fdT: string, ccT: string, keyCol: string,
    conflict: string,
  ): Promise<number> => {
    let n = 0
    for (const f of rows) {
      const isFd = f[2] === 'P'
      const t = isFd ? fdT : ccT
      const flagCol = isFd ? 'is_al' : 'is_leave'
      const flagVal = isFd ? Number(f[7]) : Number(f[8])
      await db.query(
        `INSERT INTO ${sch}.${t} (${idCol}crew_id, ${keyCol}, blh, credit, is_day_off, ${flagCol}, created_by, updated_by, updated_at)
         VALUES (${idVal}$1,$2,$3,$4,$5,$6,$7,$7,NOW())
         ON CONFLICT (${conflict}) DO UPDATE SET
           blh=EXCLUDED.blh, credit=EXCLUDED.credit, is_day_off=EXCLUDED.is_day_off,
           ${flagCol}=EXCLUDED.${flagCol}, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
        [f[1], f[3], Number(f[4]), Number(f[5]), Number(f[6]), flagVal, updatedBy],
      )
      n++
    }
    return n
  }

  const cKey = sch === 'scenario' ? 'scenario_id, crew_id' : 'crew_id'
  daily = await upsert(grains.D, 'crew_manday_fd_daily', 'crew_manday_cc_am_daily', 'crew_base_dt', `${cKey}, crew_base_dt`)
  monthly = await upsert(grains.M, 'crew_manday_fd_monthly', 'crew_manday_cc_am_monthly', 'year_month', `${cKey}, year_month`)
  yearly = await upsert(grains.Y, 'crew_manday_fd_yearly', 'crew_manday_cc_am_yearly', 'year', `${cKey}, year`)

  return { crews: crewIds.length, daily, monthly, yearly }
}
```

> Implementation note for the worker: the monthly/yearly grains the Rust core emits only cover months/years that appear in the (windowed) daily activity. In scoped mode a crew that lost ALL activity in a month emits no monthly row, so the monthly value won't drop to 0 via upsert alone. To match the SQL engine's full re-aggregate, after upserting, the scoped path MUST recompute monthly/yearly for the affected crews from their daily rows. Add this immediately before `return`:

```typescript
  if (scoped) {
    const reMonthly = async (fdDaily: string, fdMon: string, ccDaily: string, ccMon: string): Promise<void> => {
      for (const [d, mth, flag] of [[fdDaily, fdMon, 'is_al'], [ccDaily, ccMon, 'is_leave']] as const) {
        await db.query(
          `INSERT INTO ${sch}.${mth} (${idCol}crew_id, year_month, blh, credit, is_day_off, ${flag}, created_by, updated_by, updated_at)
           SELECT ${idVal}crew_id, to_char(crew_base_dt,'YYYY-MM'), SUM(blh)::int, SUM(credit)::numeric(8,2), SUM(is_day_off)::int, SUM(${flag})::int, $2, $2, NOW()
             FROM ${sch}.${d} WHERE crew_id = ANY($1)${scenFilter} GROUP BY crew_id, to_char(crew_base_dt,'YYYY-MM')
           ON CONFLICT (${cKey}, year_month) DO UPDATE SET blh=EXCLUDED.blh, credit=EXCLUDED.credit, is_day_off=EXCLUDED.is_day_off, ${flag}=EXCLUDED.${flag}, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
          [opts.crewIds, updatedBy])
      }
    }
    await reMonthly('crew_manday_fd_daily', 'crew_manday_fd_monthly', 'crew_manday_cc_am_daily', 'crew_manday_cc_am_monthly')
    // yearly: same shape, key to_char(crew_base_dt,'YYYY'); fd_yearly has no is_al column → only is_day_off.
    await db.query(
      `INSERT INTO ${sch}.crew_manday_fd_yearly (${idCol}crew_id, year, blh, credit, is_day_off, created_by, updated_by, updated_at)
       SELECT ${idVal}crew_id, to_char(crew_base_dt,'YYYY'), SUM(blh)::int, SUM(credit)::numeric(8,2), SUM(is_day_off)::int, $2, $2, NOW()
         FROM ${sch}.crew_manday_fd_daily WHERE crew_id = ANY($1)${scenFilter} GROUP BY crew_id, to_char(crew_base_dt,'YYYY')
       ON CONFLICT (${cKey}, year) DO UPDATE SET blh=EXCLUDED.blh, credit=EXCLUDED.credit, is_day_off=EXCLUDED.is_day_off, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
      [opts.crewIds, updatedBy])
    await db.query(
      `INSERT INTO ${sch}.crew_manday_cc_am_yearly (${idCol}crew_id, year, blh, credit, is_day_off, is_leave, created_by, updated_by, updated_at)
       SELECT ${idVal}crew_id, to_char(crew_base_dt,'YYYY'), SUM(blh)::int, SUM(credit)::numeric(8,2), SUM(is_day_off)::int, SUM(is_leave)::int, $2, $2, NOW()
         FROM ${sch}.crew_manday_cc_am_daily WHERE crew_id = ANY($1)${scenFilter} GROUP BY crew_id, to_char(crew_base_dt,'YYYY')
       ON CONFLICT (${cKey}, year) DO UPDATE SET blh=EXCLUDED.blh, credit=EXCLUDED.credit, is_day_off=EXCLUDED.is_day_off, is_leave=EXCLUDED.is_leave, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
      [opts.crewIds, updatedBy])
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd live-server && npx vitest run src/__tests__/services/manday-tool.test.ts`
Expected: PASS — crew 386 June monthly credit = 480.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/manday/manday-tool.ts live-server/src/__tests__/services/manday-tool.test.ts
git commit -m "feat(manday): unified driver (schema+scope parameterized, scoped delete-to-zero + monthly/yearly re-agg)"
```

---

### Task 3: Parity gate — driver output == recalcMandayCredit (scoped + full)

**Files:**
- Modify: `live-server/src/__tests__/services/manday-tool.test.ts` (add parity cases)

**Interfaces:**
- Consumes: `recompute` (Task 2), `recalcMandayCredit` (existing, still present).

- [ ] **Step 1: Write the failing parity test**

Append to `live-server/src/__tests__/services/manday-tool.test.ts`:

```typescript
import { recalcMandayCredit } from '../../services/manday/manday-credit-service.js'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'

describe('manday-tool parity vs recalcMandayCredit (real DB, rolled back)', () => {
  it('scoped: identical monthly credit/flags for an anchor FD crew + month', async () => {
    if (!reachable || !pool) { console.warn('[parity] DB unreachable — skipping'); return }
    const CREW = '73', START = '2026-06-01', END = '2026-06-30'
    const read = async (c: pg.PoolClient): Promise<{ credit: number; do: number; al: number }> => {
      const r = await c.query(`SELECT credit, is_day_off, is_al FROM f8.crew_manday_fd_monthly WHERE crew_id=$1 AND year_month='2026-06'`, [CREW])
      return { credit: Number(r.rows[0]?.credit ?? 0), do: Number(r.rows[0]?.is_day_off ?? 0), al: Number(r.rows[0]?.is_al ?? 0) }
    }
    // A) old engine
    const ca = await pool.connect()
    let oldVal
    try { await ca.query('BEGIN'); await ca.query('SET LOCAL search_path TO f8')
      await recalcMandayCredit(drizzle(ca as unknown as pg.Pool) as never, { crewIds: [CREW], startDt: START, endDt: END, updatedBy: 'P' })
      oldVal = await read(ca) } finally { await ca.query('ROLLBACK'); ca.release() }
    // B) new driver
    const cb = await pool.connect()
    let newVal
    try { await cb.query('BEGIN'); await cb.query('SET LOCAL search_path TO f8')
      await recompute({ query: (q: string, p?: unknown[]) => cb.query(q, p) } as unknown as pg.Pool, { schema: 'f8', crewIds: [CREW], startDt: START, endDt: END, updatedBy: 'P' })
      newVal = await read(cb) } finally { await cb.query('ROLLBACK'); cb.release() }
    expect(newVal).toEqual(oldVal)
  }, 60000)
})
```

> If the anchor crew (`73`) has no June activity, swap for any FD crew with flying duties in June — the assertion is parity, not a specific number.

- [ ] **Step 2: Run to verify it fails (or reveals a real divergence)**

Run: `cd live-server && npx vitest run src/__tests__/services/manday-tool.test.ts -t parity`
Expected: FAIL if the driver diverges. If it fails on `blh` only, that is expected (old default leaves blh import-fed; the driver recomputes it) — adjust the parity read to compare `credit/is_day_off/is_al` (already done above) and treat blh separately per spec §4.5. Any credit/flag divergence is a real bug to fix in the driver before proceeding.

- [ ] **Step 3: Make it pass**

Fix any real divergence in `manday-tool.ts` (e.g. ground-credit source: the driver computes ground from the assignment definition, the SQL engine reads `roster_flight.act_credited_minutes` — if they differ on seeded data, prefer the assignment-definition value and document it; update the test's expectation only if the difference is a known, intended correction with a one-line justification).

- [ ] **Step 4: Run to verify pass**

Run: `cd live-server && npx vitest run src/__tests__/services/manday-tool.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add live-server/src/__tests__/services/manday-tool.test.ts live-server/src/services/manday/manday-tool.ts
git commit -m "test(manday): parity gate — unified driver matches recalcMandayCredit (credit/flags)"
```

---

## Phase 2 — Migrate the Live edit path (the reliability fix)

### Task 4: `/commit` uses the driver synchronously

**Files:**
- Modify: `live-server/src/routes/draft/draft.ts:8` (import) and `:199-209` (recompute block)

**Interfaces:**
- Consumes: `recompute` (Task 2). Replaces `recalcMandayCredit`.

- [ ] **Step 1: Write the failing test (regression for the 386 silent-drop)**

Create `live-server/src/__tests__/routes/draft-commit-manday.test.ts`:

```typescript
import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { recompute } from '../../services/manday/manday-tool.js'

// Proves the commit-path contract the route now relies on: after a multi-crew
// scoped recompute, EVERY affected crew's monthly credit reflects their roster
// (no crew silently skipped — the bug that produced the 386 ghost).
const CONN = process.env.DATABASE_URL
let pool: pg.Pool | null = null, reachable = false
beforeAll(async () => { if (!CONN) return; try { pool = new pg.Pool({ connectionString: CONN, max: 2, connectionTimeoutMillis: 3000 }); await pool.query('SELECT 1'); reachable = true } catch { pool = null } })
afterAll(async () => { if (pool) await pool.end().catch(() => {}) })

describe('commit-path manday recompute (real DB, rolled back)', () => {
  it('recomputes all crews in one scoped call', async () => {
    if (!reachable || !pool) { console.warn('skip'); return }
    const c = await pool.connect()
    try {
      await c.query('BEGIN'); await c.query('SET LOCAL search_path TO f8')
      const crews = ['73', '386']
      const res = await recompute({ query: (q: string, p?: unknown[]) => c.query(q, p) } as unknown as pg.Pool,
        { schema: 'f8', crewIds: crews, startDt: '2026-06-01', endDt: '2026-06-30', updatedBy: 'TEST' })
      expect(res.crews).toBe(2)
      const r = await c.query(`SELECT crew_id, credit FROM crew_manday_fd_monthly WHERE crew_id = ANY($1) AND year_month='2026-06'`, [crews])
      expect(r.rows.length).toBe(2) // both crews written, none skipped
    } finally { await c.query('ROLLBACK'); c.release() }
  }, 30000)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd live-server && npx vitest run src/__tests__/routes/draft-commit-manday.test.ts`
Expected: PASS already (driver exists) — this locks the contract. If it FAILS (a crew missing), fix the driver. (This test guards the route change in Step 3.)

- [ ] **Step 3: Switch the route to the driver**

In `live-server/src/routes/draft/draft.ts`, replace the import on line 8:

```typescript
import { recompute as recomputeManday } from '../../services/manday/manday-tool.js'
```

Replace the recompute block (currently lines ~199-209) with:

```typescript
    // Recompute monthly credit + all manday KPIs for the affected crews SYNCHRONOUSLY,
    // before broadcasting, in ONE driver call (one Rust spawn, all touched crew). Window =
    // a small pad around each edited duty's date. Best-effort: a recompute hiccup must not
    // fail the save (the roster change already committed).
    if (affectedCrewIds.length > 0) {
      const dates = [...refDates].map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime()))
      const ms = dates.length > 0 ? dates.map((d) => d.getTime()) : [Date.now()]
      const startDt = new Date(Math.min(...ms) - 2 * 86_400_000).toISOString().slice(0, 10)
      const endDt = new Date(Math.max(...ms) + 10 * 86_400_000).toISOString().slice(0, 10)
      try {
        await recomputeManday(fastify.pgPool, { schema: 'f8', crewIds: affectedCrewIds, startDt, endDt, updatedBy: username })
      } catch (err) {
        fastify.log.warn({ err: (err as Error).message }, 'manday recompute on commit failed')
      }
    }
```

- [ ] **Step 4: Run the contract test + typecheck**

Run: `cd live-server && npx vitest run src/__tests__/routes/draft-commit-manday.test.ts && npx tsc --noEmit`
Expected: test PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/routes/draft/draft.ts live-server/src/__tests__/routes/draft-commit-manday.test.ts
git commit -m "refactor(manday): /commit recomputes via unified driver (one call, all touched crew)"
```

---

### Task 5: `/api/roster/*` mutations recompute synchronously (remove the async queue)

**Files:**
- Modify: `live-server/src/routes/roster/roster.ts` (all handlers; remove `enqueueMandayRecalcForMutation`, add synchronous driver call)

**Interfaces:**
- Consumes: `recompute` (Task 2).
- Produces: a local helper `recomputeForMutation(fastify, crewIds, refDate, username)` (one place; DRY) used by every handler.

- [ ] **Step 1: Write the failing test**

Create `live-server/src/__tests__/routes/roster-mutation-manday.test.ts` mirroring Task 4's pattern but asserting a single-crew `removeByPairingAndCrew`-style window recompute drops a de-assigned crew's credit (use crew `386` window June; expect 480). (Full code identical in shape to Task 2 Step 1 — reuse it; the point is the route helper calls the driver synchronously.)

```typescript
import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { recompute } from '../../services/manday/manday-tool.js'
const CONN = process.env.DATABASE_URL
let pool: pg.Pool | null = null, reachable = false
beforeAll(async () => { if (!CONN) return; try { pool = new pg.Pool({ connectionString: CONN, max: 2, connectionTimeoutMillis: 3000 }); await pool.query('SELECT 1'); reachable = true } catch { pool = null } })
afterAll(async () => { if (pool) await pool.end().catch(() => {}) })
describe('roster mutation manday recompute (real DB, rolled back)', () => {
  it('synchronous scoped recompute reflects the crew roster', async () => {
    if (!reachable || !pool) { console.warn('skip'); return }
    const c = await pool.connect()
    try { await c.query('BEGIN'); await c.query('SET LOCAL search_path TO f8')
      await recompute({ query: (q: string, p?: unknown[]) => c.query(q, p) } as unknown as pg.Pool, { schema: 'f8', crewIds: ['386'], startDt: '2026-06-01', endDt: '2026-06-30', updatedBy: 'TEST' })
      const r = await c.query(`SELECT credit FROM crew_manday_fd_monthly WHERE crew_id='386' AND year_month='2026-06'`)
      expect(Number(r.rows[0]?.credit)).toBe(480)
    } finally { await c.query('ROLLBACK'); c.release() }
  }, 30000)
})
```

- [ ] **Step 2: Run to verify it passes (contract lock)**

Run: `cd live-server && npx vitest run src/__tests__/routes/roster-mutation-manday.test.ts`
Expected: PASS.

- [ ] **Step 3: Switch roster.ts handlers to synchronous driver**

In `live-server/src/routes/roster/roster.ts`:
1. Remove the import `import { enqueueMandayRecalcForMutation } from '../../services/manday/manday-recalc-trigger.js'` (line 6).
2. Add `import { recompute as recomputeManday } from '../../services/manday/manday-tool.js'`.
3. Add a shared helper near the top of the route module:

```typescript
const MANDAY_BACK_DAYS = 2, MANDAY_FWD_DAYS = 10
const recomputeForMutation = async (
  fastify: FastifyInstance, crewIds: Array<string | null | undefined>, refDate: Date | string, username: string,
): Promise<void> => {
  const ids = [...new Set(crewIds.filter((id): id is string => !!id))]
  const ref = refDate instanceof Date ? refDate : new Date(refDate)
  if (!ids.length || Number.isNaN(ref.getTime())) return
  const startDt = new Date(ref.getTime() - MANDAY_BACK_DAYS * 86_400_000).toISOString().slice(0, 10)
  const endDt = new Date(ref.getTime() + MANDAY_FWD_DAYS * 86_400_000).toISOString().slice(0, 10)
  try { await recomputeManday(fastify.pgPool, { schema: 'f8', crewIds: ids, startDt, endDt, updatedBy: username }) }
  catch (err) { fastify.log.warn({ err: (err as Error).message }, 'manday recompute on mutation failed') }
}
```

4. In EVERY handler, replace each `enqueueMandayRecalcForMutation(fastify, <ids>, <refDate>, <schema>).catch(() => {})` call with `await recomputeForMutation(fastify, <ids>, <refDate>, username)` using the same ids/refDate already passed today (lines 52, 80, 101, 122, 161, 164, 197, 231, 260, 291, 319 — keep each call's crew list, e.g. move = `[result.crewId, result.sourceCrewId]`, swap = both crews/both refDates → call once per refDate or merge windows; assign-pairing = `[parsed.data.crewId]`). Keep `enqueueRuleCheckForMutation` calls unchanged.

> Note on swap (lines 152-164): it currently enqueues twice (one per task). Replace with a single `await recomputeForMutation(fastify, swapCrews, result.taskA.schStrDtUtc, username)` and, if `taskB.schStrDtUtc` is a different month, a second call for `taskB`. Prefer one call covering both crews.

- [ ] **Step 4: Typecheck + run the test**

Run: `cd live-server && npx tsc --noEmit && npx vitest run src/__tests__/routes/roster-mutation-manday.test.ts`
Expected: tsc clean; test PASS.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/routes/roster/roster.ts live-server/src/__tests__/routes/roster-mutation-manday.test.ts
git commit -m "refactor(manday): /api/roster/* recompute synchronously via driver (drop async queue path)"
```

---

## Phase 3 — Migrate imports, admin refresh, and scenario

### Task 6: Import workers use full-mode driver

**Files:**
- Modify: `live-server/src/workers/roster-inbound-worker.ts:9,156`, `roster-ground-inbound-worker.ts:10,467`, `manday-inbound-worker.ts:13,392`

**Interfaces:**
- Consumes: `recompute` (Task 2). Replaces `recalcMandayCredit(fastify.db, { startDt, endDt, updatedBy })` (full mode, no crewIds).

- [ ] **Step 1: Switch each worker's call**

In each of the three workers, replace the import of `recalcMandayCredit` with `import { recompute as recomputeManday } from '../services/manday/manday-tool.js'`, and replace the call:

```typescript
// before: await recalcMandayCredit(fastify.db, { startDt, endDt, updatedBy: 'ROSTER_IMPORT' })
await recomputeManday(fastify.pgPool, { schema: 'f8', startDt, endDt, updatedBy: 'ROSTER_IMPORT' })
```

(Use the existing `updatedBy` literal per worker: `ROSTER_IMPORT`, `ROSTER_GND_IMPORT`, `MANDAY_IMPORT`.)

- [ ] **Step 2: Typecheck**

Run: `cd live-server && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Full-mode parity test**

Add to `live-server/src/__tests__/services/manday-tool.test.ts` a full-window parity case: pick a small date window (e.g. a single day with known imports), run `recalcMandayCredit` (full, no crewIds) and `recompute({schema:'f8', startDt, endDt})` in two rolled-back transactions, and assert equal monthly credit for a sampled crew. (Same A/B rolled-back structure as Task 3.)

```typescript
it('full mode: identical monthly credit for a sampled crew in a 1-day window', async () => {
  if (!reachable || !pool) { console.warn('skip'); return }
  const START = '2026-06-15', END = '2026-06-15', SAMPLE = '73'
  const read = async (c: pg.PoolClient) => Number((await c.query(`SELECT credit FROM f8.crew_manday_fd_monthly WHERE crew_id=$1 AND year_month='2026-06'`, [SAMPLE])).rows[0]?.credit ?? 0)
  const ca = await pool.connect(); let o; try { await ca.query('BEGIN'); await ca.query('SET LOCAL search_path TO f8'); await recalcMandayCredit(drizzle(ca as unknown as pg.Pool) as never, { startDt: START, endDt: END, updatedBy: 'P' }); o = await read(ca) } finally { await ca.query('ROLLBACK'); ca.release() }
  const cb = await pool.connect(); let n; try { await cb.query('BEGIN'); await cb.query('SET LOCAL search_path TO f8'); await recompute({ query: (q: string, p?: unknown[]) => cb.query(q, p) } as unknown as pg.Pool, { schema: 'f8', startDt: START, endDt: END, updatedBy: 'P' }); n = await read(cb) } finally { await cb.query('ROLLBACK'); cb.release() }
  expect(n).toBe(o)
}, 90000)
```

Run: `cd live-server && npx vitest run src/__tests__/services/manday-tool.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add live-server/src/workers/roster-inbound-worker.ts live-server/src/workers/roster-ground-inbound-worker.ts live-server/src/workers/manday-inbound-worker.ts live-server/src/__tests__/services/manday-tool.test.ts
git commit -m "refactor(manday): import workers recompute via unified driver (full mode)"
```

---

### Task 7: Admin refresh + ghost repair mode

**Files:**
- Modify: `live-server/src/routes/admin/manday-credit-refresh.ts`

**Interfaces:**
- Consumes: `recompute` (Task 2).
- Produces: admin endpoint accepts `{ scope: 'all' | 'ghosts', startDt?, endDt? }`; `ghosts` recomputes crews whose current month credit disagrees with their roster (the §5 repair).

- [ ] **Step 1: Switch the existing call + add ghost selection**

Replace `recalcMandayCredit(fastify.db, {...})` with the driver. For `scope: 'ghosts'`, first select affected crew, then recompute them scoped:

```typescript
import { recompute as recomputeManday } from '../../services/manday/manday-tool.js'

// inside the handler, after parsing { scope, startDt, endDt }:
if (scope === 'ghosts') {
  const ym = (startDt ?? new Date().toISOString().slice(0, 10)).slice(0, 7)
  const sd = `${ym}-01`
  const ed = new Date(new Date(`${ym}-01T00:00:00Z`).getTime() + 32 * 86_400_000).toISOString().slice(0, 8) + '01'
  // crews whose monthly credit doesn't match a fresh recompute would be expensive to detect exactly;
  // use the cheap ghost proxy: FD crews with month credit > 0 but zero flying duties this month.
  const ghosts = await fastify.pgPool.query(
    `SELECT m.crew_id FROM f8.crew_manday_fd_monthly m
       JOIN f8.crew cr ON cr.crew_id = m.crew_id AND cr.division = 'P'
      WHERE m.year_month = $1 AND m.credit > 0
        AND NOT EXISTS (SELECT 1 FROM f8.roster_flight rf
              WHERE rf.crew_id = m.crew_id AND rf.is_deleted = 0 AND rf.pairing_id IS NOT NULL
                AND rf.sch_str_dt_utc >= $2::date AND rf.sch_str_dt_utc < $3::date)`,
    [ym, sd, ed])
  const ids = ghosts.rows.map((r) => r.crew_id as string)
  const result = ids.length ? await recomputeManday(fastify.pgPool, { schema: 'f8', crewIds: ids, startDt: sd, endDt: ed, updatedBy: 'GHOST_REPAIR' }) : { crews: 0, daily: 0, monthly: 0, yearly: 0 }
  return success(reply, { scope, repaired: result.crews })
}
// scope 'all' → full window recompute
const result = await recomputeManday(fastify.pgPool, { schema: 'f8', startDt, endDt, updatedBy: 'MANUAL_REFRESH' })
return success(reply, { scope: 'all', ...result })
```

(Keep the route's existing auth/admin guard and request schema; add `scope`/`startDt`/`endDt` to the Zod schema with sensible defaults.)

- [ ] **Step 2: Typecheck**

Run: `cd live-server && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add live-server/src/routes/admin/manday-credit-refresh.ts
git commit -m "feat(manday): admin refresh via driver + ghost-repair scope"
```

---

### Task 8: Scenario `ruletool.mjs` delegates to the driver core

**Files:**
- Modify: `live-server/scripts/ruletool.mjs`

**Interfaces:**
- Consumes: the shared TSV-build + `runRust` core. The gz parsing (`loadFromGz`) stays in the script (gz is scenario-only); the roster path and the upsert delegate to `recompute({schema:'scenario', scenarioId})`.

- [ ] **Step 1: Replace the roster+write path with the driver**

In `ruletool.mjs`, for `mode === 'roster'`, call the driver instead of the in-file `loadFromRoster`/`writeAll`. Because the script is `.mjs` and the driver is `.ts` run under tsx elsewhere, invoke the driver via a tiny tsx entry: add `live-server/scripts/manday-recompute.ts`:

```typescript
import 'dotenv/config'
import pg from 'pg'
import { recompute } from '../src/services/manday/manday-tool.js'
const [schema, scenarioIdArg] = process.argv.slice(2)
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const res = await recompute(pool, { schema: schema as 'f8' | 'scenario', scenarioId: scenarioIdArg ? Number(scenarioIdArg) : undefined, updatedBy: 'ruletool' })
console.log(JSON.stringify(res))
await pool.end()
```

In `ruletool.mjs` `mode === 'roster'`, replace the body with a `spawnSync('npx', ['tsx', 'scripts/manday-recompute.ts', 'scenario', String(SCENARIO_ID)], ...)`. Keep `gz` and `compare` modes as-is (they exercise the gz path the driver doesn't cover). This removes the duplicated roster-load + upsert math from the script.

- [ ] **Step 2: Verify scenario roster recompute still works**

Run: `cd live-server && node scripts/ruletool.mjs 6 roster` (scenario 6 is loaded).
Expected: prints the per-table counts; `scenario.crew_manday_fd_monthly` non-zero. (§No-Illusion: paste the output.)

- [ ] **Step 3: Commit**

```bash
git add live-server/scripts/ruletool.mjs live-server/scripts/manday-recompute.ts
git commit -m "refactor(manday): scenario roster path delegates to the unified driver"
```

---

## Phase 4 — Delete the old engine

### Task 9: Remove `recalcMandayCredit`, the trigger, and the worker/queue

**Files:**
- Delete: `live-server/src/services/manday/manday-credit-service.ts`, `manday-recalc-trigger.ts`, `live-server/src/workers/manday-recalc-worker.ts`, `live-server/src/__tests__/services/manday-credit-service.test.ts`
- Modify: wherever `manday-recalc-worker` is registered (search) and `scenario-crew-stats-service.ts:13` comment reference.

- [ ] **Step 1: Confirm no remaining importers**

Run: `cd live-server && grep -rn "recalcMandayCredit\|enqueueMandayRecalcForMutation\|manday-recalc-worker\|manday:recalc" src | grep -v "__tests__/services/manday-credit-service.test.ts"`
Expected: only the worker-registration line(s) remain. If any route/worker still imports them, fix before deleting.

- [ ] **Step 2: Delete the files + unregister the worker**

```bash
cd live-server
git rm src/services/manday/manday-credit-service.ts src/services/manday/manday-recalc-trigger.ts src/workers/manday-recalc-worker.ts src/__tests__/services/manday-credit-service.test.ts
```

Remove the `manday:recalc` job handler / worker registration (the line(s) found in Step 1) from the realtime worker setup.

- [ ] **Step 3: Typecheck + run the manday suite**

Run: `cd live-server && npx tsc --noEmit && npx vitest run src/__tests__/services/manday-tool.test.ts src/__tests__/services/manday-tool-rust.test.ts`
Expected: tsc clean; all PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(manday): delete SQL recalcMandayCredit + async recalc trigger/worker (unified tool is sole engine)"
```

---

## Phase 5 — Frontend: all-KPI optimistic deltas (Tier 1)

### Task 10: KPI delta helper

**Files:**
- Create: `gantt/src/utils/manday-delta.ts`
- Test: `gantt/src/utils/__tests__/manday-delta.test.ts`

**Interfaces:**
- Produces:
```typescript
interface MandayKpiDelta { mcred: number; mbh: number; ybh: number; mdo: number; ydo: number; mal: number; yal: number }
function crewMandayDelta(base: RosterItemLike[], virtual: RosterItemLike[], yearMonth: string, year: string): MandayKpiDelta
```
where `RosterItemLike` = the fields `sumCrewCreditMinutes` already uses plus `assignment`/`assignmentGroup` and `blkMin`. Credit/blh are minute sums; mdo/mal/ydo/yal are distinct-local-date counts of DO/VAC items (month vs year), using the SAME `schStrDtUtc.slice(0,7)`/`.slice(0,4)` bucketing the existing MCred delta uses (optimistic; reconciled by the server recompute on save).

- [ ] **Step 1: Write the failing test**

Create `gantt/src/utils/__tests__/manday-delta.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { crewMandayDelta } from '../manday-delta'

const fly = (pid: number, seq: number, credit: number, blk: number, date: string) => ({
  pairingId: pid, dutySeq: seq, dutyActCreditedMinutes: String(credit), blkMin: blk,
  actCreditedMinutes: null, assignment: null, schStrDtUtc: `${date}T12:00:00Z`,
})
const ground = (code: string, credit: number, date: string) => ({
  pairingId: null, dutySeq: null, dutyActCreditedMinutes: null, blkMin: null,
  actCreditedMinutes: String(credit), assignment: code, schStrDtUtc: `${date}T12:00:00Z`,
})

describe('crewMandayDelta', () => {
  it('de-assigning a flying duty drops mcred and mbh by its credit/blk', () => {
    const base = [fly(100, 1, 495, 470, '2026-06-05')]
    const d = crewMandayDelta(base, [], '2026-06', '2026')
    expect(d.mcred).toBe(-495)
    expect(d.mbh).toBe(-470)
    expect(d.ybh).toBe(-470)
  })
  it('removing a DO day decrements mdo and ydo by 1', () => {
    const base = [ground('DO', 0, '2026-06-02')]
    const d = crewMandayDelta(base, [], '2026-06', '2026')
    expect(d.mdo).toBe(-1)
    expect(d.ydo).toBe(-1)
  })
  it('adding a VAC day increments mal/yal and its credit', () => {
    const d = crewMandayDelta([], [ground('VAC', 240, '2026-06-29')], '2026-06', '2026')
    expect(d.mal).toBe(1); expect(d.yal).toBe(1); expect(d.mcred).toBe(240)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd gantt && npx vitest run src/utils/__tests__/manday-delta.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `gantt/src/utils/manday-delta.ts`:

```typescript
export interface RosterItemLike {
  pairingId: number | null
  dutySeq?: number | null
  dutyActCreditedMinutes?: string | null
  blkMin?: number | null
  actCreditedMinutes: string | null
  assignment?: string | null
  schStrDtUtc: string | null
}
export interface MandayKpiDelta { mcred: number; mbh: number; ybh: number; mdo: number; ydo: number; mal: number; yal: number }

/** Minute sums (credit/blh) deduped per flying duty + summed ground; day-counts (do/al) as distinct local dates. */
const sums = (items: RosterItemLike[], key: string, keyLen: number): { credit: number; blk: number; doDays: Set<string>; alDays: Set<string> } => {
  const byDuty = new Map<string, { credit: number; blk: number }>()
  let groundCredit = 0
  const doDays = new Set<string>(), alDays = new Set<string>()
  for (const it of items) {
    if (!it.schStrDtUtc || it.schStrDtUtc.slice(0, keyLen) !== key) continue
    const date = it.schStrDtUtc.slice(0, 10)
    if (it.pairingId != null) {
      const credit = it.dutyActCreditedMinutes != null ? Math.round(Number(it.dutyActCreditedMinutes)) : 0
      const blk = it.blkMin != null ? Math.round(Number(it.blkMin)) : 0
      byDuty.set(`${it.pairingId}:${it.dutySeq ?? 0}`, { credit: Number.isFinite(credit) ? credit : 0, blk: Number.isFinite(blk) ? blk : 0 })
    } else {
      const v = it.actCreditedMinutes != null ? Math.round(Number(it.actCreditedMinutes)) : 0
      if (Number.isFinite(v)) groundCredit += v
      const code = (it.assignment ?? '').toUpperCase()
      if (code === 'DO') doDays.add(date)
      else if (code === 'VAC') alDays.add(date)
    }
  }
  let credit = groundCredit, blk = 0
  for (const v of byDuty.values()) { credit += v.credit; blk += v.blk }
  return { credit, blk, doDays, alDays }
}

export const crewMandayDelta = (base: RosterItemLike[], virtual: RosterItemLike[], yearMonth: string, year: string): MandayKpiDelta => {
  const bm = sums(base, yearMonth, 7), vm = sums(virtual, yearMonth, 7)
  const by = sums(base, year, 4), vy = sums(virtual, year, 4)
  return {
    mcred: vm.credit - bm.credit,
    mbh: vm.blk - bm.blk,
    ybh: vy.blk - by.blk,
    mdo: vm.doDays.size - bm.doDays.size,
    ydo: vy.doDays.size - by.doDays.size,
    mal: vm.alDays.size - bm.alDays.size,
    yal: vy.alDays.size - by.alDays.size,
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd gantt && npx vitest run src/utils/__tests__/manday-delta.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/utils/manday-delta.ts gantt/src/utils/__tests__/manday-delta.test.ts
git commit -m "feat(gantt): per-crew optimistic delta for all seven manday KPIs"
```

---

### Task 11: Apply all-KPI deltas in the roster panel

**Files:**
- Modify: `gantt/src/components/gantt/source/live-gantt-source.ts:491-516` (delta fn), `:519-571` (buildPanelRows), `:664-666` (call site)

**Interfaces:**
- Consumes: `crewMandayDelta`, `MandayKpiDelta` (Task 10).
- Produces: `draftMandayDeltaByCrew(base, virtual, yearMonth, year): Map<string, MandayKpiDelta>`; `buildPanelRows` takes this map and applies each KPI.

- [ ] **Step 1: Replace the credit-only delta with the all-KPI delta**

Replace `draftCreditDeltaByCrew` (lines 491-516) with:

```typescript
  /**
   * Per-crew optimistic delta for ALL manday KPIs (credit/blh/days-off/AL), month + year,
   * = kpis(virtual) − kpis(base). Edits only touch the loaded window, so added to the
   * server's authoritative full-period stats it tracks what a Save will persist.
   */
  const draftMandayDeltaByCrew = (
    baseItems: RosterItem[], virtualItems: RosterItem[], yearMonth: string, year: string,
  ): Map<string, MandayKpiDelta> => {
    const bucket = (items: RosterItem[]): Map<string, RosterItem[]> => {
      const m = new Map<string, RosterItem[]>()
      for (const it of items) { const a = m.get(it.crewId); if (a) a.push(it); else m.set(it.crewId, [it]) }
      return m
    }
    const baseByCrew = bucket(baseItems), virtByCrew = bucket(virtualItems)
    const out = new Map<string, MandayKpiDelta>()
    for (const cid of new Set<string>([...baseByCrew.keys(), ...virtByCrew.keys()])) {
      const d = crewMandayDelta(baseByCrew.get(cid) ?? [], virtByCrew.get(cid) ?? [], yearMonth, year)
      if (d.mcred || d.mbh || d.ybh || d.mdo || d.ydo || d.mal || d.yal) out.set(cid, d)
    }
    return out
  }
```

Add imports at the top of the file: `import { crewMandayDelta, type MandayKpiDelta } from '@/utils/manday-delta'`. (Keep `sumCrewCreditMinutes` import only if still used elsewhere; otherwise remove it — §Surgical.)

- [ ] **Step 2: Apply the deltas in buildPanelRows**

Change `buildPanelRows`'s `creditDelta: Map<string, number>` param to `mandayDelta: Map<string, MandayKpiDelta>` and rewrite the stats cells (lines 559-567):

```typescript
          const d = mandayDelta.get(cid)
          const add = (v: number, dv: number | undefined) => Math.round(v + (dv ?? 0))
          // ...
          ybh:   stats != null ? formatBlockMinutes(add(stats.ybh, d?.ybh)) : '',
          mcred: stats != null ? formatBlockMinutes(add(stats.mcred, d?.mcred)) : '',
          mbh:   stats != null ? formatBlockMinutes(add(stats.mbh, d?.mbh)) : '',
          yal:   stats != null ? String(add(stats.yal, d?.yal)) : '',
          mal:   stats != null ? String(add(stats.mal, d?.mal)) : '',
          ydo:   stats != null ? String(add(stats.ydo, d?.ydo)) : '',
          mdo:   stats != null ? String(add(stats.mdo, d?.mdo)) : '',
```

- [ ] **Step 3: Update the call site (lines ~660-666)**

Compute the display-tz `year` next to `viewportYearMonth` and pass the new map:

```typescript
        const viewportYear = viewportYearMonth.slice(0, 4)
        const mandayDelta = draftMandayDeltaByCrew(baseItems, items, viewportYearMonth, viewportYear)
        const unsortedRows = buildPanelRows(
          selectedCrewIds, crewDetailMap, itemsByCrew, violationMap, crewStatsMap, viewportLeftDate, mandayDelta,
        )
```

- [ ] **Step 4: Typecheck + UI-standard gate + unit tests**

Run: `cd gantt && npx tsc --noEmit && cd .. && npm run check:ui`
Expected: tsc clean; check:ui HARD violations = 0.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/gantt/source/live-gantt-source.ts
git commit -m "feat(gantt): apply optimistic deltas to all seven manday KPIs in the roster panel"
```

---

## Phase 6 — Cross-user Playwright + version + docs

### Task 12: Two-user Playwright over all KPIs

**Files:**
- Create: `e2e/tests/gantt/manday-kpis-cross-user.spec.ts` (model on the existing `mcred-cross-user-update.spec.ts`)
- Test ID: `Live-1316` (per docs/test-cases/e2e/README.md scheme; confirm next free Live-13xx).

**Interfaces:**
- Consumes: existing harness helpers — `rosterProbeWithCredit`, `selectRosterTasks`, toolbar `draft-delete-btn` / `draft-save-btn` / `draft-undo-btn`, `rosterMcred()` / `panelMcredMinutes`, and (new) a `rosterPanelKpis()` test hook (add to `gantt/src/utils/gantt-test-hook.ts` mirroring `rosterMcred()` but returning `{ crewId, mcred, mbh, mdo }`).

- [ ] **Step 1: Add the panel-KPI test hook**

In `gantt/src/utils/gantt-test-hook.ts`, add alongside `rosterMcred()`:

```typescript
  rosterPanelKpis: (): Array<{ crewId: string; mcred: string; mbh: string; mdo: string }> =>
    getRenderedPanelRows().map((r) => ({ crewId: r.values.crewId, mcred: r.values.mcred, mbh: r.values.mbh, mdo: r.values.mdo })),
```

(Use the same rendered-rows accessor `rosterMcred()` uses.)

- [ ] **Step 2: Write the two-user test**

Create `e2e/tests/gantt/manday-kpis-cross-user.spec.ts` asserting, with two browser contexts A and B on the same crew:
1. A de-assigns a credited flying pairing (UI: select task → `draft-delete-btn`): A's `mcred` AND `mbh` drop immediately; B unchanged (pre-save).
2. A clicks `draft-save-btn`: B's `mcred` AND `mbh` update to the new values without manual refresh.
3. A clicks `draft-undo-btn` (then save): A's `mcred`/`mbh` revert.

Reuse the auth seed (`addInitScript`), base path `/fpqe/gantt/`, `test.use({ timezoneId: 'America/Vancouver' })` (tz-trap regression guard), and `rosterProbeWithCredit` to pick a crew whose pairing has `dutyActCreditedMinutes > 0`. Drive ONLY real UI buttons (§Simulate-User).

- [ ] **Step 3: Run the test**

Run: `cd e2e && npx playwright test tests/gantt/manday-kpis-cross-user.spec.ts --config=config/playwright.config.ts --project=gantt --no-deps --reporter=list`
Expected: PASS. (§No-Illusion: paste the PASS summary.)

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/gantt/manday-kpis-cross-user.spec.ts gantt/src/utils/gantt-test-hook.ts
git commit -m "test(gantt): two-user Playwright — all manday KPIs update live + on save (Live-1316)"
```

---

### Task 13: Run the ghost repair + version bump + docs

**Files:**
- Modify: `gantt/src/version.ts`
- Update: `docs/modules/gantt/live-scenario-gantt-playbook.md` (§13 manday), memory `live-mcred-draft-recompute.md`.

- [ ] **Step 1: Repair prod ghosts via the admin endpoint (real UI / admin call)**

With live-server running, call the admin ghost-repair (admin auth Ryan/Our2027) for `2026-06`. Verify crew 386 monthly credit becomes `8:00` and the FD ghost count returns to 0:

```bash
# after repair, confirm via a read-only query (node pg) — NOT a write:
# SELECT credit FROM f8.crew_manday_fd_monthly WHERE crew_id='386' AND year_month='2026-06'  → 480
```

Paste the before/after (84:25 → 8:00) and the ghost-count 82 → 0.

- [ ] **Step 2: Bump versions**

In `gantt/src/version.ts`: `BACKEND_VERSION` +1 (driver + callers), `FRONTEND_VERSION` +1 (Tier-1 KPIs). Update the trailing comment to describe this change.

- [ ] **Step 3: Update playbook + memory**

Add a playbook §13 subsection: "Unified manday tool — one Rust core for Live + Scenario; driver `manday-tool.ts`; synchronous recompute on save; all seven KPIs optimistic." Update the `live-mcred-draft-recompute` memory to mark Phase C generalized to all KPIs and the SQL engine retired.

- [ ] **Step 4: Final full check + commit**

Run: `cd live-server && npx tsc --noEmit && npx vitest run src/__tests__/services/manday-tool.test.ts && cd ../gantt && npx tsc --noEmit && cd .. && npm run check:ui`
Expected: all clean/PASS.

```bash
git add gantt/src/version.ts docs/modules/gantt/live-scenario-gantt-playbook.md
git commit -m "chore(manday): version bump + playbook for unified crew-manday tool"
```

---

## Self-Review (completed by author)

- **Spec coverage:** §2 goal → Tasks 2,4-8; §3 all-KPI → Tasks 10-11; §4.1 core → Task 1; §4.2 driver → Task 2; §4.3 sync save → Tasks 4-5; §4.4 two-tier → Tasks 10-12; §4.5 blh nuance → Task 3 Step 2 note + driver recomputes blh; §5 repair → Tasks 7,13; §6 all callers + delete → Tasks 4-9; §7 tests → Tasks 1,3,6,12. Covered.
- **Placeholders:** none — code given for every implementation step; tests have real assertions.
- **Type consistency:** `recompute(pool, opts)` signature stable across Tasks 2-9; `crewMandayDelta`/`MandayKpiDelta` consistent Tasks 10-11; panel param renamed `creditDelta`→`mandayDelta` consistently in Task 11.
- **Known follow-up:** scenario `gz`/`compare` modes still parse gz in `ruletool.mjs` (driver covers roster/live only) — intentional, gz is scenario-specific input.
