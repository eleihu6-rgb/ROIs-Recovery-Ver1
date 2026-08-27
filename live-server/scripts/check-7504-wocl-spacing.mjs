/**
 * Rule 7504 (SPACING RULE - WOCL) — live validation harness.
 *
 * Drives the Rust 7504 engine (rule-engine-rs/target/release/check-7504) against the LIVE
 * roster: a WOCL flight duty is one whose FDP overlaps the WOCL window [02:00,05:59] in the
 * crew-base-local time (per the 7504 gtest); between two consecutive WOCL flight duties the
 * rest gap must be at least MIN PERIOD RH, else a violation.
 *
 * Params come from the active RULE workset (prefer workset id 103) via `rule_set` → `rule`.
 * Do NOT hardcode `rule.instance` (F8 currently ships 7504/001 + 7503/001; older docs said 003):
 *   7504 param_json row 0 → Min Period + Unit.
 *   WOCL window from 7503 in the same workset.
 *
 * Work periods: one flight DUTY per (crew, pairing, duty_seq), FDP span = MIN(sch_str)..MAX(sch_end).
 * Each crew's WOCL/base offset comes from its prime crew_base (June 2026 DST offset).
 *
 * Usage:
 *   node live-server/scripts/check-7504-wocl-spacing.mjs [minPeriod] [--from .. --to ..]
 *   node live-server/scripts/check-7504-wocl-spacing.mjs --compare    # Min 55 (legacy) vs 80 (migrated)
 * Prints one JSON object (or, with --compare, { params, at55, at80 }).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { loadRulesetRule, fieldRaw } from './legality-ruleset-params.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const ENV_PATH = path.join(REPO, 'live-server', '.env')
const BIN = path.join(REPO, 'rule-engine-rs', 'target', 'release', 'check-7504')

const BASE_OFFSET_MIN = {
  YYZ: -240, YUL: -240, YOW: -240, YKF: -240,
  YWG: -300,
  YEG: -360, YYC: -360,
  YVR: -420, YXX: -420, YLW: -420,
  OOL: 600,
}
const DEFAULT_OFFSET_MIN = -360

export function readDatabaseUrl() {
  const env = readFileSync(ENV_PATH, 'utf8')
  const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL not found in live-server/.env')
  return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')
}
function argFlag(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}
function hhmmToMin(s) {
  const [h, m] = String(s).split(':').map((x) => parseInt(x, 10))
  return h * 60 + (m || 0)
}

/** Read 7504 Min Period/Unit + WOCL window from 7503 in the RULE workset. */
export async function readParams(c, opts = {}) {
  const rule7504 = await loadRulesetRule(c, 7504, opts)
  const rule7503 = await loadRulesetRule(c, 7503, opts)
  const row0 = rule7504.rows[0]
  const woclRow = rule7503.rows[0]
  const minPeriodRaw = fieldRaw(row0, rule7504.header, 'Min Period')
  const unit = fieldRaw(row0, rule7504.header, 'Unit').toUpperCase()
  const minPeriod = parseInt(minPeriodRaw, 10)
  if (!minPeriodRaw || Number.isNaN(minPeriod)) {
    throw new Error(`7504/${rule7504.instance} workset ${rule7504.rulesetId}: missing Min Period`)
  }
  if (!unit) {
    throw new Error(`7504/${rule7504.instance} workset ${rule7504.rulesetId}: missing Unit`)
  }
  const woclStartRaw = fieldRaw(woclRow, rule7503.header, 'WOCL Start')
  const woclEndRaw = fieldRaw(woclRow, rule7503.header, 'WOCL End')
  if (!woclStartRaw || !woclEndRaw) {
    throw new Error(`7503/${rule7503.instance} workset ${rule7503.rulesetId}: missing WOCL Start/End (required by 7504)`)
  }
  return {
    rulesetId: rule7504.rulesetId,
    instance: rule7504.instance,
    woclInstance: rule7503.instance,
    minPeriod,
    unit,
    woclStartMin: hhmmToMin(woclStartRaw),
    woclEndMin: hhmmToMin(woclEndRaw),
  }
}

/** Crew → prime-base offset (minutes), the WOCL-evaluation TZ (crew-base-local). */
export async function crewOffsets(c) {
  const byCrew = new Map()
  for (const r of (await c.query(`SELECT crew_id, base FROM crew_base WHERE is_prime_base = 1`)).rows) byCrew.set(String(r.crew_id), r.base)
  for (const r of (await c.query(`SELECT crew_id, base FROM crew_base`)).rows) if (!byCrew.has(String(r.crew_id))) byCrew.set(String(r.crew_id), r.base)
  const out = new Map()
  for (const [crew, base] of byCrew) out.set(crew, BASE_OFFSET_MIN[base] ?? DEFAULT_OFFSET_MIN)
  return out
}

/** Flight DUTIES (one per crew×pairing×duty_seq). */
export async function extractDuties(c, from, to) {
  const fly = await c.query(
    `SELECT crew_id, pairing_id, duty_seq,
            EXTRACT(EPOCH FROM MIN(sch_str_dt_utc))::bigint AS start_secs,
            EXTRACT(EPOCH FROM MAX(sch_end_dt_utc))::bigint  AS end_secs
       FROM roster_flight
      WHERE is_deleted = 0 AND assignment_group = 'FLY' AND pairing_id IS NOT NULL
        AND sch_str_dt_utc >= $1::timestamptz AND sch_str_dt_utc < $2::timestamptz
      GROUP BY crew_id, pairing_id, duty_seq`,
    [from, to],
  )
  return fly.rows
}

/** TSV: crew, pairing, start, end, offset_min. */
export function toTsv(duties, offsets) {
  return (
    duties
      .map((r) => {
        const off = offsets.get(String(r.crew_id)) ?? DEFAULT_OFFSET_MIN
        return `${r.crew_id}\t${r.pairing_id}\t${r.start_secs}\t${r.end_secs}\t${off}`
      })
      .join('\n') + '\n'
  )
}

/** Run check-7504 --emit-tsv, return parsed violations. */
export function runEngine(tsv, p, minPeriod) {
  const unit = String(p.unit ?? 'RH').trim().toUpperCase() || 'RH'
  const args = [
    '--emit-tsv',
    '--min-period', String(minPeriod),
    '--wocl-start-min', String(p.woclStartMin),
    '--wocl-end-min', String(p.woclEndMin),
  ]
  if (unit === 'CD') args.push('--unit', 'CD')
  const res = spawnSync(
    BIN,
    args,
    { input: tsv, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  if (res.status !== 0) throw new Error(`check-7504 failed: ${res.stderr || res.error}`)
  return res.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [crewId, pairingId, gapStart, gapEnd, offsetMin, actualMin] = l.split('\t')
      return {
        crewId,
        pairingId: Number(pairingId),
        gapStartSecs: Number(gapStart),
        gapEndSecs: Number(gapEnd),
        offsetMin: Number(offsetMin),
        // RH: minutes; CD: calendar days (same column).
        gapMinutes: Number(actualMin),
      }
    })
}

function summarize(viols, crewEvaluated, minPeriod) {
  viols.sort((a, b) => a.gapMinutes - b.gapMinutes)
  const worst = viols[0] ? { crewId: viols[0].crewId, gapMinutes: viols[0].gapMinutes, pairingId: viols[0].pairingId } : null
  return {
    minPeriod,
    crewEvaluated,
    crewViolating: new Set(viols.map((v) => v.crewId)).size,
    violationCount: viols.length,
    worst,
  }
}

async function main() {
  const from = argFlag('--from', '2026-06-01')
  const to = argFlag('--to', '2026-07-01')
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const p = await readParams(c)
  const offsets = await crewOffsets(c)
  const duties = await extractDuties(c, from, to)
  await c.end()

  const tsv = toTsv(duties, offsets)
  const crewEvaluated = new Set(duties.map((r) => String(r.crew_id))).size

  if (process.argv.includes('--compare')) {
    const at55 = summarize(runEngine(tsv, p, 55), crewEvaluated, 55)
    const at80 = summarize(runEngine(tsv, p, 80), crewEvaluated, 80)
    process.stdout.write(JSON.stringify({ params: p, at55, at80 }))
    return
  }
  const minPeriod = process.argv[2] && !process.argv[2].startsWith('--') ? Number(process.argv[2]) : p.minPeriod
  process.stdout.write(JSON.stringify({ params: p, ...summarize(runEngine(tsv, p, minPeriod), crewEvaluated, minPeriod) }))
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err))
    process.exit(1)
  })
}
