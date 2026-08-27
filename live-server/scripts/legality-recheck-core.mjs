// legality-recheck-core.mjs — engine-agnostic legality recheck shared by the LIVE and
// SCENARIO recheck entries (§Gantt-Unify). Each entry supplies a `source` adapter that
// knows HOW to read roster rows (live tables vs scenario.* under a scenario_id) and a
// `param` reader for legacy rule.param_json. The core spawns the rule-engine-rs check_*
// binaries (reading the SAME legacy params the Legality tab edits) and returns violation
// rows; the entry persists them to its own rule_violation target.
//
// source adapter accessors (the COMPLETE set the core's rule fns call — a `source`
// MUST provide all of these; verified by grepping this file for `source.`):
//   blockByDay()                  -> per-crew/day block-minute rows           [rule8002]
//   crewBaseTimezone()            -> Map<crewId, IANA zone_id>                [rule8002]
//   flyByPairing()                -> fly duties grouped by pairing            [rule8056]
//   pilotAge()                    -> per-flt_id crew-on-flight rows           [rule8030]
//   assignmentsRaw()              -> raw roster assignment rows               [rule8004]
//   baseQuals(crewIds)            -> base-qualification rows for crewIds      [rule8004]
//   assignmentOverlapRosters()    -> crew timelines (pairing report/release)  [rule1001]
//   assignmentsAll()              -> all assignment rows (incl. ground/leave, pairing_id when present) [rule7505]
//   rosterProperties(filters)     -> normalized roster-property rows         [rule8071]
//   qualificationFlightSegments(filters) -> normalized crew-on-flight segment rows [rule8072]
//   firstPairingByCrew()          -> Map<crewId, firstPairingId>             [rule7505]
//   firstPairingSpanByCrew()      -> Map<crewId,{id,startIso,endIso}>        [rule8002 anchoring]
//   pairingSpansByCrew()          -> Map<crewId,[{id,startIso,endIso}]>      [rule8002 window attribution]
//   crewOffsets()                 -> Map<crewId, base UTC offset min>        [legacy fallback when resolveCrewOffset absent]
//   crewQualEntries()             -> effective-dated B/R/F/P qualification rows [rule7504, rule7305, rule8002]
//   crewTeams?()                  -> optional Map<crewId,[team]>             [rule7504, rule7505]
//   checkins()                    -> per-crew check-in rows                   [rule7506]
//   flyDuties(byDutySeq)          -> fly duties (byDutySeq toggles ordering)  [rule7501, rule7503, rule7504]
//   rosterDuties?()               -> complete crew roster activities          [rule7305]
//   avoidCoPairing(filters)       -> physical-flight crew complement          [rule7509]
// Rule params/instances are NOT read via per-rule accessors anymore — the core resolves the
// whole rule set once (resolveRulesetRules → ctx.instancesOf) keyed on ctx.rulesetId.
//   groundWork(includeRest?)      -> ground-work duty rows                    [rule7501, rule7503, rule7508]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import { calendarRpDisplayWindow, crewLocalRpWindowUtc, listInclusiveCalendarMonths } from './legality-rp-window.mjs'
import { loadMessages, renderRuleBody } from '@rois/legality-messages'

const LEGALITY_MESSAGES = loadMessages()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BIN_DIR = path.resolve(__dirname, '../../rule-engine-rs/target/release')
const SRC_DIR = path.resolve(__dirname, '../../rule-engine-rs/src')

// Staleness guard: the check-* binaries are BUILD ARTIFACTS (git-ignored), so a `git pull`
// that changes rule-engine-rs/src leaves an out-of-date binary that silently produces WRONG
// legality results (e.g. a pre-filter 8056 flagging DO↔DO). Rather than trust an old binary,
// compare its mtime to the newest source file and fail LOUD with the fix. (.githooks/post-merge
// rebuilds automatically on pull; this catches fresh clones / deleted target / skipped hooks.)
let _srcNewest // ms | null (no source tree → skip, e.g. prod ships only the binary) | undefined
const newestSrcMtime = () => {
  if (_srcNewest !== undefined) return _srcNewest
  try {
    let newest = 0
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) walk(p)
        else { const m = fs.statSync(p).mtimeMs; if (m > newest) newest = m }
      }
    }
    walk(SRC_DIR)
    _srcNewest = newest
  } catch { _srcNewest = null }
  return _srcNewest
}
const REBUILD_HINT = 'Rebuild: cargo build --release --manifest-path rule-engine-rs/Cargo.toml'
const assertFresh = (binPath, bin) => {
  const src = newestSrcMtime()
  if (src == null) return // no source tree to compare against (deployed binary-only) → trust it
  let binM
  try { binM = fs.statSync(binPath).mtimeMs } catch {
    throw new Error(`rule-engine binary '${bin}' is missing at ${binPath}. ${REBUILD_HINT}`)
  }
  if (binM < src) throw new Error(`rule-engine binary '${bin}' is STALE (older than rule-engine-rs/src) — refusing to produce wrong legality results. ${REBUILD_HINT}`)
}

export const BASE_OFFSET_MIN = { YYZ: -240, YUL: -240, YOW: -240, YKF: -240, YWG: -300, YEG: -360, YYC: -360, YVR: -420, YXX: -420, YLW: -420, OOL: 600 }
export const DEFAULT_OFFSET_MIN = -360
export const REST_LEAVE_CODES = new Set(['DO', 'VAC', 'ILL', 'LO', 'LEA'])
export const hhmmToMin = (s) => { const [h, m] = String(s).split(':').map((x) => parseInt(x, 10)); return h * 60 + (m || 0) }
export const epochSec = (iso) => Math.floor(new Date(iso).getTime() / 1000)

/** YYYY-MM-DD (or ISO datetime) → calendar date string for crew_base as-of checks. */
export const asOfDateOnly = (value) => {
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const t = Date.parse(raw)
  if (!Number.isFinite(t)) return null
  return new Date(t).toISOString().slice(0, 10)
}

const dateOnlyMs = (value) => {
  const d = asOfDateOnly(value)
  if (!d) return null
  return Date.parse(`${d}T00:00:00Z`)
}

/**
 * Pick one crew_base row per crew as of a legality window date.
 * Prefer rows whose [eff_dt, exp_dt] covers asOf, then prime, then latest eff_dt.
 * Prevents a future prime base (e.g. YYZ from Dec) from overriding the current base (YYC in Aug).
 *
 * @param {Array<{ crew_id: unknown, base: unknown, is_prime_base?: unknown, eff_dt?: unknown, exp_dt?: unknown }>} rows
 * @param {string} asOf YYYY-MM-DD or ISO datetime
 * @returns {Map<string, string>} crewId → base code
 */
export function pickEffectiveCrewBase(rows, asOf) {
  const asOfMs = dateOnlyMs(asOf)
  const byCrew = new Map()
  for (const row of rows ?? []) {
    const crew = String(row.crew_id ?? '').trim()
    const base = String(row.base ?? '').trim()
    if (!crew || !base) continue
    const list = byCrew.get(crew) ?? []
    list.push(row)
    byCrew.set(crew, list)
  }
  const out = new Map()
  for (const [crew, list] of byCrew) {
    const ranked = [...list].sort((a, b) => {
      const cover = (r) => {
        if (asOfMs == null) return 1
        const effMs = dateOnlyMs(r.eff_dt)
        const expMs = r.exp_dt == null || String(r.exp_dt).trim() === '' ? null : dateOnlyMs(r.exp_dt)
        const effOk = effMs == null || effMs <= asOfMs
        const expOk = expMs == null || expMs >= asOfMs
        return effOk && expOk ? 0 : 1
      }
      const c = cover(a) - cover(b)
      if (c !== 0) return c
      const prime = Number(b.is_prime_base ?? 0) - Number(a.is_prime_base ?? 0)
      if (prime !== 0) return prime
      return (dateOnlyMs(b.eff_dt) ?? 0) - (dateOnlyMs(a.eff_dt) ?? 0)
    })
    out.set(crew, String(ranked[0].base).trim())
  }
  return out
}

/** Map crew → BASE_OFFSET_MIN minutes from pickEffectiveCrewBase result. */
export function crewOffsetsFromBaseMap(baseByCrew) {
  const off = new Map()
  for (const [crew, base] of baseByCrew ?? []) {
    off.set(crew, BASE_OFFSET_MIN[base] ?? DEFAULT_OFFSET_MIN)
  }
  return off
}

/** Group crew_base rows by crew for timeline resolve (raw rows; resolve uses pickEffectiveCrewBase). */
export function buildCrewBaseTimeline(rows) {
  const byCrew = new Map()
  for (const row of rows ?? []) {
    const crew = String(row.crew_id ?? '').trim()
    const base = String(row.base ?? '').trim()
    if (!crew || !base) continue
    const list = byCrew.get(crew) ?? []
    list.push(row)
    byCrew.set(crew, list)
  }
  return byCrew
}

export function resolveBaseAt(timeline, crewId, asOfDay) {
  const rows = timeline.get(String(crewId)) ?? []
  return pickEffectiveCrewBase(rows, asOfDay).get(String(crewId))
}

export function resolveOffsetAt(timeline, crewId, asOfDay) {
  const base = resolveBaseAt(timeline, crewId, asOfDay)
  if (!base) return DEFAULT_OFFSET_MIN
  return BASE_OFFSET_MIN[base] ?? DEFAULT_OFFSET_MIN
}

/** UTC epoch seconds → YYYY-MM-DD (UTC calendar day of the instant; duty-local day is the bin's job). */
export function utcSecsToUtcDateOnly(utcSecs) {
  const n = Number(utcSecs)
  if (!Number.isFinite(n)) return null
  return new Date(n * 1000).toISOString().slice(0, 10)
}

/** Resolve offset at UTC instant via UTC calendar day probe (bin applies offset to local midnights). */
export function resolveOffsetAtUtc(timeline, crewId, utcSecs) {
  const day = utcSecsToUtcDateOnly(utcSecs)
  if (!day) return DEFAULT_OFFSET_MIN
  return resolveOffsetAt(timeline, crewId, day)
}

/** Duty-level base offset: row override, then resolveCrewOffset at duty start, else crewOffsets map. */
export async function offsetForDuty(source, crewId, startSecs, rowOffsetMin) {
  if (rowOffsetMin != null && rowOffsetMin !== '' && Number.isFinite(Number(rowOffsetMin))) {
    return Number(rowOffsetMin)
  }
  if (typeof source.resolveCrewOffset === 'function') {
    return source.resolveCrewOffset(String(crewId), Number(startSecs))
  }
  const offsets = source.crewOffsets ? await source.crewOffsets() : new Map()
  return offsets.get(String(crewId)) ?? DEFAULT_OFFSET_MIN
}

/** Calendar/day-level base offset: resolveCrewOffset at UTC instant, else preloaded crewOffsets map. */
export async function resolveCrewOffsetOrFallback(source, crewId, utcSecs, fallbackOffsets) {
  if (typeof source.resolveCrewOffset === 'function') {
    return source.resolveCrewOffset(String(crewId), Number(utcSecs))
  }
  return fallbackOffsets?.get(String(crewId)) ?? DEFAULT_OFFSET_MIN
}

export function midpointDateOnly(fromIso, toIso) {
  const a = asOfDateOnly(fromIso)
  const b = asOfDateOnly(toIso)
  if (!a || !b) return a ?? b
  const am = Date.parse(`${a}T00:00:00Z`)
  const bm = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(am) || !Number.isFinite(bm)) return a
  const mid = new Date(Math.floor((am + bm) / 2))
  return mid.toISOString().slice(0, 10)
}

export function crewTeamRowsToMap(rows) {
  const byCrew = new Map()
  for (const row of rows ?? []) {
    const crew = String(row.crew_id ?? '').trim()
    const team = String(row.team ?? '').trim()
    if (!crew || !team) continue
    const teams = byCrew.get(crew) ?? []
    if (!teams.includes(team)) teams.push(team)
    byCrew.set(crew, teams)
  }
  for (const teams of byCrew.values()) teams.sort()
  return byCrew
}

// ── Dynamic rule-set resolution ───────────────────────────────────────────────
// Rules + params are pulled from each context's OWN rule set (workset, keyed by
// ruleset_id) at recheck time — never hardcoded. A function (e.g. 8002) is a template;
// each instance (001 BH, 002 DP) carries its own param_json and is enforced+tagged
// independently. See docs/superpowers/specs/2026-06-23-dynamic-ruleset-legality-recheck-design.md.

/** Prefix a violation message with the 1-based param-table row number shown in Legality UI. */
export const withParamRowPrefix = (rowIndex0, body) => {
  const text = String(body ?? '')
  if (/^Row \d+:/.test(text)) return text
  const n = Number(rowIndex0)
  const row = Number.isFinite(n) && n >= 0 ? Math.floor(n) + 1 : 1
  return `Row ${row}: ${text}`
}

/** Case-insensitive column lookup for a param-table header → index, or -1 if absent. */
export const headerIndexer = (header) => (name) =>
  (header ?? []).findIndex((h) => String(h).toUpperCase() === String(name).toUpperCase())

/** Rostering-period calendar bounds for 7505/7507. Preview may set rpFrom/rpTo to the
 *  Gantt RP while dateFrom/dateTo stay as the padded data/check window for other rules. */
export const resolveDaysOffRpBounds = (ctx) => ({
  rpFrom: ctx.rpFrom ?? ctx.dateFrom,
  rpTo: ctx.rpTo ?? ctx.dateTo,
})

/**
 * Pick a persistence anchor for 7505/7507 inside one crew-local RP window.
 * Prefer a row with pairing_id (FLY/RES puck), but fall back to any overlapping
 * activity so reserve-only / ground-only months (pairing_id NULL) still run.
 * Returning null means the crew has no activity overlapping the RP at all.
 */
export const pickDaysOffAnchor = (rows, startUtcSec, endUtcSec) => {
  const overlapping = [...rows]
    .filter((r) => Number(r.e) > startUtcSec && Number(r.s) < endUtcSec)
    .sort((a, b) => Number(a.s) - Number(b.s) || Number(a.pairing_id ?? 0) - Number(b.pairing_id ?? 0))
  if (!overlapping.length) return null
  return overlapping.find((r) => r.pairing_id != null && Number(r.pairing_id) > 0) ?? overlapping[0]
}

/** Roster-level 7505/7507 rows persist pairing_id NULL when the anchor is a ground task. */
export const daysOffAnchorPairingId = (anchor) => {
  if (anchor?.pairing_id == null) return null
  const id = Number(anchor.pairing_id)
  return Number.isFinite(id) && id > 0 ? id : null
}

/** Stable per-row window signature, e.g. "28CD". Empty when Period/Unit are absent. */
export const scopeKeyOf = (row, H) => {
  const p = H('Period'), u = H('Unit')
  if (p < 0 || u < 0) return ''
  return `${String(row?.[p] ?? '').trim()}${String(row?.[u] ?? '').trim()}`
}
const rowScopeKey = (row, H, rowIndex, rowCount) =>
  rowCount > 1 ? String(rowIndex) : scopeKeyOf(row, H)
const hashedScopeKey = (prefix, cells) =>
  `${prefix}:${createHash('sha1').update(cells.join('\u001f')).digest('hex').slice(0, 8)}`

/**
 * Resolve every (function, instance) in a context's rule set with its param header+rows.
 * Keyed on ruleset_id (= workset.id; Model-B rule_group dropped). rule.rule_id is the
 * composite (function‖instance) populated on Model A. Shared by live + scenario.
 */
export async function resolveRulesetRules(db, rulesetId) {
  const { rows } = await db.query(
    `select r.function::int as function, coalesce(r.instance, '') as instance,
            r.severity::int as severity,
            r.param_json#>'{tables,0,header}' as header,
            r.param_json#>'{tables,0,rows}'   as rows
       from rule_set rs
       join rule r on r.rule_id = rs.rule_id
      where rs.workset_id = $1`, [rulesetId])
  return rows.map((r) => ({
    function: Number(r.function), instance: String(r.instance),
    severity: Number(r.severity),
    header: r.header ?? [], rows: r.rows ?? [],
  }))
}

/**
 * Overlay catalog `rule.severity` onto engine-emitted rows.
 * Engine rule fns historically hardcode Soft/Overridable/Hard; UI + persist must
 * follow the ruleset catalog so Soft (1) never displays as Overridable (2).
 */
export function applyRulesetSeverity(violations, setRules) {
  const map = new Map()
  for (const r of setRules) {
    map.set(`${Number(r.function)}:${String(r.instance ?? '').trim()}`, Number(r.severity))
  }
  for (const v of violations) {
    const key = `${String(v.rule_code)}:${String(v.rule_instance ?? '').trim()}`
    if (map.has(key)) v.severity = map.get(key)
  }
  return violations
}

const stableArgs = (args) => args.map((a) => {
  if (a === null) return 'null:'
  if (a === undefined) return 'u:'
  const t = typeof a
  if (t === 'number') return `n:${a}`
  if (t === 'boolean') return `b:${a}`
  if (t === 'string') return `s:${a}`
  return `j:${JSON.stringify(a)}`
}).join('|')

/** resolveOffsetAtUtc / resolveCrewTimezone only depend on UTC calendar day, not sub-day instant. */
const memoArgsForKey = (key, args) => {
  if ((key === 'resolveCrewOffset' || key === 'resolveCrewTimezone') && args.length >= 2) {
    const day = utcSecsToUtcDateOnly(args[1])
    return day != null ? [String(args[0]), day] : args
  }
  return args
}

export function memoizeSource(source) {
  const cache = new Map()
  const out = {}
  for (const key of Object.keys(source)) {
    const fn = source[key]
    if (typeof fn !== 'function') {
      out[key] = fn
      continue
    }
    out[key] = (...args) => {
      const ck = `${key}|${stableArgs(memoArgsForKey(key, args))}`
      if (!cache.has(ck)) {
        const p = fn(...args)
        cache.set(ck, p)
        p.catch(() => { cache.delete(ck) })
      }
      return cache.get(ck)
    }
  }
  return out
}

// Global cap on concurrently-running rule binaries. runBin is async (spawn) so a
// concurrent batch (e.g. pbs-server bid eligibility, N pairings × several rules)
// could otherwise spawn dozens of check-* processes at once.
const MAX_CONCURRENT_BINS = 8
let activeBins = 0
const binWaiters = []
const acquireBinSlot = () => new Promise((resolve) => {
  if (activeBins < MAX_CONCURRENT_BINS) { activeBins++; resolve() }
  else binWaiters.push(resolve)
})
const releaseBinSlot = () => {
  const next = binWaiters.shift()
  if (next) next()
  else activeBins--
}

export async function runBin(bin, args, tsv) {
  await acquireBinSlot()
  const binPath = path.join(BIN_DIR, bin)
  try {
    assertFresh(binPath, bin)
    // Node 22 can leave stdin pipes open for stdin-to-EOF CLIs; feeding the child from
    // a real temp file keeps all rule binaries deterministic and avoids hung checks.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rois-rule-'))
    const tmpFile = path.join(tmpDir, `${bin}.tsv`)
    let fd
    try {
      fs.writeFileSync(tmpFile, tsv, 'utf-8')
      fd = fs.openSync(tmpFile, 'r')
      const { stdout, stderr } = await new Promise((resolve, reject) => {
        const child = spawn(binPath, args, { stdio: [fd, 'pipe', 'pipe'] })
        let out = ''
        let err = ''
        let settled = false
        child.stdout.on('data', (d) => { out += d })
        child.stderr.on('data', (d) => { err += d })
        child.on('error', (e) => { if (!settled) { settled = true; reject(e) } })
        child.on('close', (code) => {
          if (settled) return
          settled = true
          if (code !== 0) reject(new Error(`${bin} failed (exit ${code}): ${err.trim()}`))
          else resolve({ stdout: out, stderr: err })
        })
      })
      return stdout.trim().split('\n').filter(Boolean).map((l) => l.split('\t'))
    } finally {
      if (fd != null) fs.closeSync(fd)
      try { fs.unlinkSync(tmpFile) } catch {}
      try { fs.rmdirSync(tmpDir) } catch {}
    }
  } finally {
    releaseBinSlot()
  }
}

/**
 * Build a single batched INSERT for many rows (one round-trip instead of N).
 * columns = ordered column list; rows = array of value arrays in that order;
 * conflict = ON CONFLICT (...) target; update = DO UPDATE SET tail. Returns {text,values} or null.
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

// ── Rule 8002 — MAX CUMULATIVE (full C++ port via check-8002-full) ────────────
// Template: for EACH 8002 instance, for EACH param row, feed ALL 15 C++ columns
// (Bases/Ranks/Fleets/Crew Teams qualification lists, Period, Unit
// CD/RD/CW/RW/CM/RM/CY/RH/RP/YTM, Max/Min Limits, Type BH/DP/FT/CH, BLH band
// filters, HAS SBY OR FLY, REDUCTION PER DUTY) plus per-crew effective-dated
// qualifications and per-local-day manday metrics to the check-8002-full
// binary (rule8002::check_max_cumulative_row — the same kernel the RO path
// uses). Qualification matching and window judgment happen entirely in Rust.
// The binary reports EVERY violating window (editor semantics); this driver
// aggregates to the WORST window per (crew × param row) so the bell
// cardinality, the rule_violation UNIQUE key, and the windowed delete all
// stay exactly as before. Unsupported C++ types (WP/PH/COSMIC/…) log + skip.
//
// Metrics source: manday (crew_manday_fd_daily) primary — same source the C++
// engine reads — with blockByDay (roster_flight) synthesis for crews that have
// no manday rows (BLH-only fallback; their DP/CH/FT contributions are 0).
const CUM_TYPES = new Set(['BH', 'DP', 'FT', 'CH'])
const CUM_UNITS = new Set(['CD', 'RD', 'CW', 'RW', 'CM', 'RM', 'CY', 'RH', 'RP', 'YTM'])
const DAY_MS = 86_400_000
const dayOrd = (isoDate) => Math.floor(new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`).getTime() / DAY_MS)
const ordOfSecs = (s) => new Date(Math.floor(Number(s) / 86_400) * DAY_MS).toISOString().slice(0, 10)
const isoStartOfOrdSecs = (s) => new Date(Math.floor(Number(s) / 86_400) * DAY_MS).toISOString()
const localDateOfIso = (iso, zoneId) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zoneId || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(iso))
  } catch {
    return new Date(iso).toISOString().slice(0, 10)
  }
}
// Limit parse keeps this driver's legacy convention: HH:MM → minutes, plain
// int → HOURS×60 ('' / '*' / bad → dflt). (The RO drivers read plain ints as
// minutes per C++ atoi; F8 configs always use HH:MM so the two never diverge.)
const cumLimitMin = (v, dflt) => {
  const s = String(v ?? '').trim()
  if (!s || s === '*') return dflt
  if (s.includes(':')) return hhmmToMin(s)
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n * 60 : dflt
}
const cumBandPair = (v) => {
  const s = String(v ?? '').trim()
  if (!s || s === '*' || !s.includes('-')) return [-1, -1]
  const [lo, hi] = s.split('-', 2)
  try { return [hhmmToMin(lo), hhmmToMin(hi)] } catch { return [-1, -1] }
}
const rawOrStar = (v) => { const s = String(v ?? '').trim(); return s === '' ? '*' : s }

export async function rule8002(source, ctx) {
  const instances = ctx.instancesOf(8002)
  if (!instances.length) { ctx.log('8002: no instances in rule set — skipped'); return [] }
  // Anchor each finding to a real FLY pairing that overlaps the violating rolling window.
  // Older code used the crew's first in-period pairing, which could put a July 8002 window
  // on a June 1 roster. Prefer the latest overlapping pairing so the bell lands near the
  // event that makes the cumulative window visible; fall back to the legacy first span for
  // adapters that have not implemented the richer accessor.
  const firstSpan = await source.firstPairingSpanByCrew()
  const spansByCrew = source.pairingSpansByCrew ? await source.pairingSpansByCrew() : new Map()
  const tzMap = await source.crewBaseTimezone()

  // Param rows → U lines (one global rule_idx per row; single spawn for all).
  const uLines = []
  const meta = [] // rule_idx → { inst, sk, type }
  let needsQualMap = false
  let needsTeamMap = false
  let needsRosterPeriods = false
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    for (const [rowIndex, row] of (inst.rows ?? []).entries()) {
      const sk = scopeKeyOf(row, H)
      const type = String(row[H('Type')] ?? 'BH').trim().toUpperCase() || 'BH'
      if (!CUM_TYPES.has(type)) { ctx.log(`skip 8002/${inst.instance} ${sk}: Type=${type} not ported (BH/DP/FT/CH)`); continue }
      const unit = String(row[H('Unit')] ?? 'CD').trim().toUpperCase() || 'CD'
      if (!CUM_UNITS.has(unit)) { ctx.log(`skip 8002/${inst.instance} ${sk}: Unit=${unit} unknown`); continue }
      if (unit === 'RP') {
        if (!source.rosterPeriods) {
          ctx.log(`skip 8002/${inst.instance} ${sk}: Unit=RP but source has no roster-period data`)
          continue
        }
        needsRosterPeriods = true
      }
      const period = parseInt(row[H('Period')], 10)
      if (!period) { ctx.log(`skip 8002/${inst.instance} ${sk}: missing Period`); continue }
      const teams = rawOrStar(row[H('Crew Teams')])
      const bases = rawOrStar(row[H('Bases')])
      const ranks = rawOrStar(row[H('Ranks')])
      const fleets = rawOrStar(row[H('Fleets')])
      const hasQualScope = [bases, ranks, fleets].some(hasNonWildcard)
      if (hasQualScope) {
        if (!source.crewQualEntries) {
          ctx.log(`skip 8002/${inst.instance} ${sk}: qualification filters=${bases}/${ranks}/${fleets} but source has no crew qualification data`)
          continue
        }
        needsQualMap = true
      }
      if (teams !== '*') {
        if (!source.crewTeams) {
          ctx.log(`skip 8002/${inst.instance} ${sk}: Crew Teams=${teams} but source has no crew-team data`)
          continue
        }
        needsTeamMap = true
      }
      const prorated = rawOrStar(row[H('Prorated')])
      const maxMin = cumLimitMin(row[H('Max Limits')], 999999)
      const minMin = cumLimitMin(row[H('Min Limits')], 0)
      const [intLo, intHi] = cumBandPair(row[H('INT OPERATION BLH')])
      const [augLo, augHi] = cumBandPair(row[H('AUG OPERATION BLH')])
      const [aloLo, aloHi] = cumBandPair(row[H('DUTY ALOT TIME')])
      const sbyRaw = String(row[H('HAS SBY OR FLY(Y/N)')] ?? '').trim().toUpperCase()
      const sbyFlag = sbyRaw === 'Y' ? 1 : sbyRaw === 'N' ? 0 : -1
      const redIdx = ['REDUCTION PER DUTY', 'DP REDUCTION FOR 06:00+ TIME ZONE DUTY', 'REDUCTION FOR 06:00+ TIME ZONE DUTY']
        .map(H).find((i) => i >= 0)
      const reduction = redIdx != null && isSet(row[redIdx]) ? cumLimitMin(row[redIdx], 0) : 0
      const idx = meta.length
      meta.push({ inst, sk, type, period, unit, maxMin, minMin, prorated, rowIndex })
      uLines.push(['U', idx, bases, ranks, fleets, teams, period, unit, maxMin, minMin, type,
        intLo, intHi, augLo, augHi, aloLo, aloHi, sbyFlag, reduction].join('\t'))
    }
  }
  if (!uLines.length) return []

  // Daily metrics: manday primary. BLH falls back to blockByDay (roster_flight)
  // per crew when the crew has NO manday rows at all, OR when its manday blh is
  // entirely ZERO inside the checked window — on live the blh column is
  // unmaintained for most crews (blh=0 rows) while dp/credit are populated, so
  // the overlay keeps BH bells alive without giving up manday DP/CH parity.
  // The bin merges same-day M rows additively, and overlay days carry manday
  // blh=0, so each day still has exactly one BLH source.
  const mandayRows = source.mandayMetricsByDay ? await source.mandayMetricsByDay() : []
  const mandayCrews = new Set(mandayRows.map((r) => String(r.crew_id)))
  const windowBlh = new Map() // crew → Σ manday blh inside [dateFrom, dateTo]
  for (const r of mandayRows) {
    const day = String(r.day)
    if (day < ctx.dateFrom || day > ctx.dateTo) continue
    const c = String(r.crew_id)
    windowBlh.set(c, (windowBlh.get(c) ?? 0) + Number(r.blh))
  }
  const mLines = mandayRows.map((r) => ['M', r.crew_id, dayOrd(r.day), r.blh, r.ft, r.dp,
    r.credit_min, r.sby, r.int_blh, r.aug_blh, r.duty_aloft, r.cross_tz].join('\t'))
  let synthesized = 0
  let overlaid = 0
  for (const r of await source.blockByDay()) {
    const c = String(r.crew_id)
    if (!mandayCrews.has(c)) synthesized += 1
    else if ((windowBlh.get(c) ?? 0) === 0) overlaid += 1
    else continue // crew maintains manday blh → manday is the BH source
    mLines.push(['M', r.crew_id, dayOrd(r.day), r.blk, 0, 0, 0, 0, 0, 0, 0, 0].join('\t'))
  }
  if (synthesized) ctx.log(`8002: ${synthesized} blockByDay rows synthesized for crews without manday metrics (BLH only)`)
  if (overlaid) ctx.log(`8002: ${overlaid} blockByDay rows overlaid for crews whose manday blh is all-zero in the window`)
  if (!mLines.length) return []

  // Crew qualification windows (matching happens in the binary).
  const qLines = (needsQualMap ? await source.crewQualEntries() : []).map((q) =>
    ['Q', q.crew_id, q.dim, q.value, q.eff ? dayOrd(q.eff) : -1000000, q.exp ? dayOrd(q.exp) : -1].join('\t'))
  const teamMap = needsTeamMap ? await source.crewTeams() : null
  const teamLines = []
  if (teamMap) {
    for (const [crew, teams] of teamMap) {
      for (const team of teams ?? []) {
        teamLines.push(['Q', crew, 'T', team, -1000000, -1].join('\t'))
      }
    }
  }
  const rpRows = needsRosterPeriods ? await source.rosterPeriods() : []
  const pLines = rpRows.map((rp) => ['P', dayOrd(rp.start), dayOrd(rp.end)].join('\t'))

  // Checked window = [FROM, TO+1d) + the C++ scenario-end +24h buffer.
  const fromOrd = dayOrd(ctx.dateFrom)
  const toExclOrd = dayOrd(ctx.dateTo) + 1
  const cLine = ['C', fromOrd * 86400, toExclOrd * 86400 + 86400, toExclOrd * 86400, 'SUN'].join('\t')

  const input = [cLine, ...uLines, ...qLines, ...teamLines, ...pLines, ...mLines].join('\n')
  const binRunner = ctx.runBin ?? runBin
  const vRows = await binRunner('check-8002-full', ['--emit-tsv'], input)

  // Aggregate to the WORST window per (crew × param row): over-max beats
  // under-min; within a kind, the largest breach wins.
  const best = new Map()
  for (const cols of vRows) {
    if (cols[0] !== 'V' || cols.length < 13) continue
    const [, crew, idx, , , , actualMin, maxMin, minMin, wStart, wEnd, over] = cols
    const key = `${crew}\u0000${idx}`
    const isOver = over === '1'
    const breach = isOver ? Number(actualMin) - Number(maxMin) : Number(minMin) - Number(actualMin)
    const cur = best.get(key)
    if (!cur || (isOver && !cur.isOver) || (isOver === cur.isOver && breach > cur.breach)) {
      best.set(key, { crew: String(crew), idx: Number(idx), actualMin: Number(actualMin), isOver, breach, wStart: Number(wStart), wEnd: Number(wEnd) })
    }
  }

  const out = []
  for (const v of best.values()) {
    const m = meta[v.idx]
    const tz = typeof source.resolveCrewTimezone === 'function'
      ? await source.resolveCrewTimezone(v.crew, v.wStart)
      : (tzMap.get(v.crew) ?? 'UTC')
    const wStartIso = ordOfSecs(v.wStart)
    const wEndIso = ordOfSecs(v.wEnd)
    const spans = spansByCrew.get(v.crew) ?? []
    const overlapping = spans
      .filter((sp) => localDateOfIso(sp.endIso, tz) >= wStartIso && localDateOfIso(sp.startIso, tz) <= wEndIso)
      .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime() || a.id - b.id)
    const sp = overlapping.at(-1) ?? firstSpan.get(v.crew)
    if (!sp) continue // crew with metrics but no in-window FLY pairing can't render a bell
    // BH+CD over-max keeps the historical message shape; durations use HH:MM to match manday.
    const actualHHMM = formatMinutesHHMM(v.actualMin)
    const limitHHMM = formatMinutesHHMM(v.isOver ? m.maxMin : m.minMin)
    const message = withParamRowPrefix(m.rowIndex, m.type === 'BH' && m.unit === 'CD' && v.isOver
      ? `Cumulative block ${actualHHMM} exceeds ${limitHHMM} in the ${m.period}-day window ${wStartIso}..${wEndIso} (${tz}).`
      : `Cumulative ${m.type} ${actualHHMM} ${v.isOver ? 'exceeds' : 'is below'} ${limitHHMM} in the ${m.period}${m.unit} window ${wStartIso}..${wEndIso} (${tz}).`)
    out.push({
      crew_id: v.crew, pairing_id: sp.id, duty_seq: null,
      rule_code: '8002', rule_instance: m.inst.instance, scope_key: m.sk,
      start_dt: sp.startIso, end_dt: sp.endIso,
      window_start_dt: isoStartOfOrdSecs(v.wStart),
      window_end_dt: isoStartOfOrdSecs(v.wEnd),
      severity: 3,
      actual_value: v.actualMin, limit_value: v.isOver ? m.maxMin : m.minMin, unit: 'MINUTE',
      message,
    })
  }
  return out
}

// ── Rule 8056 — ROSTER SPACING (A → B min gap) ────────────────────────────────
// C++ ref: rule8056.cpp:637-839; param_json header uses title-case column names.
// Each instance can carry MULTIPLE rows, each an independent spacing rule. A row matches
// its A/B side by "Assignment Group A/B" (group bucket) and/or "Assignment A/B" (specific
// code) — both pulled from the latest param_json, no hardcoding. A wildcard ('*'/empty)
// filter matches anything, so a row may use group only, code only, or both
// (e.g. assignment FLY → assignment VAC, independent of the broad GRD bucket).
const filterValues = (v) => String(v ?? '').split('|').map((s) => s.trim()).filter((s) => s && s !== '*')
const isSet = (v) => { const t = String(v ?? '').trim(); return t !== '' && t !== '*' }
const HDR8071 = [
  'Bases', 'Ranks', 'Fleets', 'Crew Teams', 'Labels', 'Attributes', 'Override Duty Attributes',
  'Assignment Groups', 'Qualifiers', 'Flights', 'Destinations', 'Positions',
  'Period', 'Unit', 'Max Times', 'Min Times', 'Check Mode',
]
const HDR8072 = [
  'Flight Fleets', 'Flight Assignment Groups', 'Crew Teams', 'Crew Nationality',
  'Destination Countries', 'Acting Ranks', 'Flight Compositions', 'Required Qualifications',
  'Attributes', 'Dep', 'Arr', 'Min Limits', 'Max Limits',
]
const formatUtcDutyDateTime = (epochSeconds) => {
  const d = new Date(Number(epochSeconds) * 1000)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

const formatDutyDateTime = (epochSeconds, zoneId = 'UTC') => {
  const d = new Date(Number(epochSeconds) * 1000)
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zoneId || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d)
    const get = (type) => parts.find((p) => p.type === type)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
  } catch {
    return formatUtcDutyDateTime(epochSeconds)
  }
}

/** Epoch seconds → 'YYYY-MM-DD' in the given IANA zone (native Intl, no deps). */
const localDateOf = (epochSeconds, zoneId) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zoneId || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(Number(epochSeconds) * 1000))
  } catch {
    return new Date(Number(epochSeconds) * 1000).toISOString().slice(0, 10)
  }
}

/** Minutes → HH:MM (e.g. 2140 → 35:40); negative gaps keep a leading '-'. */
const formatMinutesHHMM = (min) => {
  const n = Math.round(Number(min) || 0)
  const neg = n < 0
  const abs = Math.abs(n)
  const body = `${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
  return neg ? `-${body}` : body
}

export const cleanTsv = (value) => String(value ?? '').replace(/[\t\n\r]/g, ' ').trim()
const boolYN = (value, fallback = false) => {
  const s = String(value ?? '').trim().toUpperCase()
  if (['Y', 'YES', 'TRUE', '1'].includes(s)) return 'Y'
  if (['N', 'NO', 'FALSE', '0'].includes(s)) return 'N'
  return fallback ? 'Y' : 'N'
}
export const fieldOrStar = (row, H, name) => {
  const idx = H(name)
  return idx >= 0 ? rawOrStar(row[idx]) : '*'
}
const fieldRaw = (row, H, name, fallback = '') => {
  const idx = H(name)
  const value = idx >= 0 ? String(row[idx] ?? '').trim() : ''
  return value || fallback
}
export const hasNonWildcard = (value) => filterValues(value).length > 0
const qualTagOf = (dim) => {
  const value = String(dim ?? '').trim().toUpperCase()
  if (value === 'B' || value === 'BASE') return 'bases'
  if (value === 'R' || value === 'RANK') return 'ranks'
  if (value === 'F' || value === 'FLEET') return 'fleets'
  return ''
}
export const qualOverlapsWindow = (qual, ctx) => {
  const eff = String(qual.eff ?? qual.eff_date ?? '').slice(0, 10)
  const exp = String(qual.exp ?? qual.exp_date ?? '').slice(0, 10)
  return (!eff || eff <= ctx.dateTo) && (!exp || exp >= ctx.dateFrom)
}
const crewQualRowsToScopeMap = (rows, ctx) => {
  const byCrew = new Map()
  for (const row of rows ?? []) {
    const crew = String(row.crew_id ?? '').trim()
    const tag = qualTagOf(row.dim ?? row.dimension)
    const value = String(row.value ?? '').trim().toUpperCase()
    if (!crew || !tag || !value || !qualOverlapsWindow(row, ctx)) continue
    const scoped = byCrew.get(crew) ?? { bases: new Set(), ranks: new Set(), fleets: new Set() }
    scoped[tag].add(value)
    byCrew.set(crew, scoped)
  }
  return byCrew
}
const matchesCrewScope = (filter, values) => {
  const filters = filterValues(filter).map((value) => value.toUpperCase())
  if (!filters.length) return true
  return filters.some((value) => values?.has(value))
}
const dayOrdFromSecs = (value) => Math.floor(Number(value) / 86_400)
export const dateOrdOrMinusOne = (value) => {
  const s = String(value ?? '').trim()
  if (!s) return '-1'
  if (/^-?\d+$/.test(s)) return s
  const t = Date.parse(`${s.slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(t) ? String(Math.floor(t / DAY_MS)) : '-1'
}

export async function rule8056(source, ctx) {
  const instances = ctx.instancesOf(8056)
  if (!instances.length) { ctx.log('8056: no instances in rule set — skipped'); return [] }
  const groupSet = new Set()
  const codeSet = new Set()
  const validRows = []
  let needsTeamMap = false
  let needsQualRows = false
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    if (!inst.rows?.length) { ctx.log(`skip 8056/${inst.instance}: no param rows`); continue }
    for (const [rowIndex, row] of (inst.rows ?? []).entries()) {
      for (const key of ['Assignment Group A', 'Assignment Group B']) filterValues(row[H(key)]).forEach((g) => groupSet.add(g))
      for (const key of ['Assignment A', 'Assignment B', 'Qualifier A', 'Qualifier B']) filterValues(row[H(key)]).forEach((c) => codeSet.add(c))
    }
    inst.rows.forEach((row, rowIndex) => {
      const space = Number(row[H('Space')])
      const unit = String(row[H('Unit')] ?? 'RH').trim().toUpperCase() || 'RH'
      if (!space) {
        ctx.log(`skip 8056/${inst.instance} row${rowIndex}: missing Space`)
        return
      }
      if (!['RH', 'CD', 'LN'].includes(unit)) {
        ctx.log(`skip 8056/${inst.instance} row${rowIndex}: Unit=${unit} (only RH/CD/LN supported)`)
        return
      }
      const bases = fieldOrStar(row, H, 'Bases')
      const ranks = fieldOrStar(row, H, 'Ranks')
      const fleets = fieldOrStar(row, H, 'Fleets')
      const teams = fieldOrStar(row, H, 'Crew Teams')
      const hasQualScope = [bases, ranks, fleets].some(hasNonWildcard)
      if (hasQualScope && !source.crewQualEntries) {
        ctx.log(`skip 8056/${inst.instance}: Bases/Ranks/Fleets scoped row but source has no crew qualification data`)
        return
      }
      if (hasNonWildcard(teams) && !source.crewTeams) {
        ctx.log(`skip 8056/${inst.instance}: Crew Teams=${teams} but source has no crew-team data`)
        return
      }
      if (hasQualScope) needsQualRows = true
      if (hasNonWildcard(teams)) needsTeamMap = true
      const groupA = fieldOrStar(row, H, 'Assignment Group A')
      const groupB = fieldOrStar(row, H, 'Assignment Group B')
      const assignA = fieldOrStar(row, H, 'Assignment A')
      const assignB = fieldOrStar(row, H, 'Assignment B')
      const sk = (scopeKeyOf(row, H) || `${hasNonWildcard(assignA) ? assignA : groupA}>${hasNonWildcard(assignB) ? assignB : groupB}`).slice(0, 40)
      validRows.push({
        inst,
        row,
        rowIndex,
        H,
        space,
        unit,
        sk,
        line: [
          'R',
          bases,
          ranks,
          fleets,
          teams,
          fieldOrStar(row, H, 'Attribute A'),
          fieldOrStar(row, H, 'Label A'),
          groupA,
          assignA,
          fieldOrStar(row, H, 'Qualifier A'),
          fieldOrStar(row, H, 'Airport A'),
          fieldOrStar(row, H, 'Roles A'),
          fieldOrStar(row, H, 'Is Requested A'),
          fieldOrStar(row, H, 'Attribute B'),
          fieldOrStar(row, H, 'Label B'),
          groupB,
          assignB,
          fieldOrStar(row, H, 'Qualifier B'),
          fieldOrStar(row, H, 'Airport B'),
          fieldOrStar(row, H, 'Roles B'),
          fieldOrStar(row, H, 'Is Requested B'),
          String(space),
          unit,
          boolYN(fieldRaw(row, H, 'Directional', 'Y'), true),
          fieldOrStar(row, H, 'Is Location Equal Base A'),
          fieldOrStar(row, H, 'Is Location Equal Base B'),
          boolYN(fieldRaw(row, H, 'Utilize Post Duty Rest', 'Y'), true),
        ].map(cleanTsv).join('\t'),
      })
    })
  }
  if (!validRows.length) return []
  const rows = await source.flyByPairing(groupSet.size ? [...groupSet] : undefined, codeSet.size ? [...codeSet] : undefined)
  const qualRows = needsQualRows ? await source.crewQualEntries() : []
  const teamMap = needsTeamMap ? await source.crewTeams() : null
  const qualLines = []
  if (needsQualRows) {
    for (const q of qualRows ?? []) {
      const dim = String(q.dim ?? q.dimension ?? '').trim().toUpperCase()
      const tag = dim === 'B' || dim === 'BASE' ? 'B' : dim === 'R' || dim === 'RANK' ? 'R' : dim === 'F' || dim === 'FLEET' ? 'F' : ''
      if (!tag || !qualOverlapsWindow(q, ctx)) continue
      const exp = q.exp ?? q.exp_date
      qualLines.push(['Q', q.crew_id, tag, q.value,
        dateOrdOrMinusOne(q.eff ?? q.eff_date),
        exp == null || String(exp).trim() === '' ? '-1' : dateOrdOrMinusOne(exp),
      ].map(cleanTsv).join('\t'))
    }
  }
  const teamLines = []
  if (teamMap) {
    for (const [crew, teams] of teamMap) {
      for (const team of teams ?? []) teamLines.push(['T', crew, team].map(cleanTsv).join('\t'))
    }
  }
  const zoneByGapStart = new Map(
    rows.map((r) => [`${String(r.crew_id)}\t${String(r.pairing_id)}\t${String(r.end_secs)}`, String(r.zone_id ?? 'UTC')]),
  )
  const dutyLines = []
  for (const r of rows) {
    const crew = String(r.crew_id)
    const endRest = r.end_rest_secs ?? r.end_including_rest_secs ?? r.rest_end_secs ?? r.end_secs
    const assignment = r.assignment ?? ''
    const location = r.location ?? r.airport ?? r.arv_arp ?? r.dep_arp ?? r.crew_base ?? r.base ?? ''
    const crewBase = r.crew_base ?? r.base ?? ''
    const off = await offsetForDuty(source, crew, r.start_secs, r.offset_min)
    dutyLines.push([
      'D',
      crew,
      r.pairing_id ?? 0,
      r.start_secs,
      r.end_secs,
      endRest,
      r.label ?? '',
      r.assignment_group ?? 'FLY',
      assignment,
      r.attributes ?? r.attribute ?? '*',
      r.qualifier ?? assignment,
      r.airport ?? location,
      r.role ?? '',
      boolYN(r.is_requested, false),
      location,
      crewBase,
      boolYN(r.is_pre_assigned ?? (String(r.source ?? '').toUpperCase() === 'PA' ? 'Y' : 'N'), false),
      off,
    ].map(cleanTsv).join('\t'))
  }
  const tsv = [
    ...validRows.map((row) => row.line),
    ...qualLines,
    ...teamLines,
    ...dutyLines,
  ].join('\n')
  const fmt = (min) => { const n = min < 0, m = Math.abs(min); const b = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; return n ? `-${b}` : b }
  const out = []
  const binRunner = ctx.runBin ?? runBin
  for (const [crewId, pairingId, gapStart, gapEnd, mins, curLabel, nextLabel, ruleIndex] of await binRunner('check-8056', ['--emit-tsv'], tsv)) {
    const zoneId = zoneByGapStart.get(`${String(crewId)}\t${String(pairingId)}\t${String(gapStart)}`) ?? 'UTC'
    const matched = validRows[Number(ruleIndex) || 0] ?? validRows[0]
    const unit = matched.unit
    const actual = Number(mins)
    const actualValue = unit === 'CD' || unit === 'LN' ? actual : Math.round((actual / 60) * 100) / 100
    const actualText = unit === 'CD' || unit === 'LN' ? String(actual) : fmt(actual)
    out.push({
      crew_id: crewId, pairing_id: Number(pairingId), duty_seq: null,
      rule_code: '8056', rule_instance: matched.inst.instance, scope_key: matched.sk,
      start_dt: new Date(Number(gapStart) * 1000).toISOString(), end_dt: new Date(Number(gapEnd) * 1000).toISOString(),
      severity: 2, actual_value: actualValue, limit_value: matched.space, unit: unit === 'RH' ? 'HOUR' : 'DAY',
      message: withParamRowPrefix(matched.rowIndex, `Rest between (${curLabel} ${formatDutyDateTime(gapStart, zoneId)}) and (${nextLabel} ${formatDutyDateTime(gapEnd, zoneId)}) is ${actualText}, which is below the required ${matched.space} ${unit}.`),
    })
  }
  return out
}

// ── Rule 8071 — MAX ROSTER PROPERTIES (count matching roster rows) ───────────
// Param rows are resolved from the selected rule set and evaluated by the Rust
// check-8071 kernel. Source filters only narrow dimensions explicitly configured
// by the params; '*' stays an empty filter so the adapter does not restrict it.
export async function rule8071(source, ctx) {
  const instances = ctx.instancesOf(8071)
  if (!instances.length) { ctx.log('8071: no instances in rule set — skipped'); return [] }
  const groupSet = new Set()
  const flightSet = new Set()
  const destinationSet = new Set()
  const positionSet = new Set()
  const ruleLines = []
  const meta = []
  let requiresFullRosterPopulation = false
  let needsTeams = false
  let needsRosterPeriods = false
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    for (const [rowIndex, row] of (inst.rows ?? []).entries()) {
      const period = parseInt(row[H('Period')], 10)
      const unit = String(row[H('Unit')] ?? '').trim().toUpperCase()
      const maxTimes = Number(row[H('Max Times')])
      const minTimes = Number(row[H('Min Times')] ?? 0)
      if (!period || !unit || Number.isNaN(maxTimes) || Number.isNaN(minTimes)) {
        ctx.log(`skip 8071/${inst.instance}: missing Period/Unit/Max Times/Min Times`)
        continue
      }
      for (const value of filterValues(row[H('Assignment Groups')])) groupSet.add(value)
      for (const value of filterValues(row[H('Flights')])) flightSet.add(value)
      for (const value of filterValues(row[H('Destinations')])) destinationSet.add(value)
      for (const value of filterValues(row[H('Positions')])) positionSet.add(value)
      const teams = rawOrStar(row[H('Crew Teams')])
      if (hasNonWildcard(teams)) {
        if (!source.crewTeams) {
          ctx.log(`skip 8071/${inst.instance}: Crew Teams=${teams} but source has no crew-team data`)
          continue
        }
        needsTeams = true
      }
      if (unit === 'RP') {
        if (!source.rosterPeriods) {
          ctx.log(`skip 8071/${inst.instance}: Unit=RP but source has no roster-period data`)
          continue
        }
        needsRosterPeriods = true
      }
      const idx = meta.length
      const modeRaw = String(row[H('Check Mode')] ?? '*').trim().toUpperCase()
      const mode = modeRaw === 'F' ? 'F' : modeRaw === 'D' ? 'D' : 'R'
      const sk = `${period}${unit}:${rawOrStar(row[H('Flights')])}:${rawOrStar(row[H('Assignment Groups')])}:${mode}`.slice(0, 40)
      meta.push({ inst, row, H, sk, period, unit, maxTimes, minTimes, mode, rowIndex })
      ruleLines.push(['R', idx, ...HDR8071.map((name) => rawOrStar(row[H(name)]))].join('\t'))
      if (minTimes > 0) requiresFullRosterPopulation = true
    }
  }
  if (!ruleLines.length) return []
  // Under-min rows must see crews with rosters that do NOT match the row's
  // property filters; otherwise source prefiltering turns "0 matching" into
  // "crew absent" before the Rust checker can count it.
  const rows = await source.rosterProperties({
    groups: requiresFullRosterPopulation ? [] : [...groupSet],
    flights: requiresFullRosterPopulation ? [] : [...flightSet],
    destinations: requiresFullRosterPopulation ? [] : [...destinationSet],
    positions: requiresFullRosterPopulation ? [] : [...positionSet],
  })
  const teamMap = needsTeams ? await source.crewTeams() : null
  const activityLines = rows.map((r) => ['A',
    r.crew_id, r.pairing_id, r.duty_seq ?? 0, r.segment_id ?? 0,
    r.start_utc, r.end_utc,
    r.bases ?? '*', r.ranks ?? '*', r.fleets ?? '*',
    needsTeams ? (teamMap.get(String(r.crew_id)) ?? []).join('|') : (r.teams ?? '*'),
    r.label ?? '*', r.attributes ?? '*', r.override_duty_attributes ?? '*',
    r.assignment_group ?? '', r.qualifier ?? '*', r.flight_number ?? '',
    r.destination ?? '', r.position ?? '',
  ].map((v) => String(v).replace(/[\t\n\r]/g, ' ')).join('\t'))
  const cLine = ['C', epochSec(`${ctx.dateFrom}T00:00:00Z`), epochSec(`${ctx.dateTo}T23:59:59Z`)].join('\t')
  const rpRows = needsRosterPeriods ? await source.rosterPeriods() : []
  const pLines = rpRows.map((rp) => ['P', epochSec(rp.start + 'T00:00:00Z'), epochSec(rp.end + 'T00:00:00Z')].join('\t'))
  const out = []
  const binRunner = ctx.runBin ?? runBin
  for (const cols of await binRunner('check-8071', ['--emit-tsv'], [cLine, ...ruleLines, ...activityLines, ...pLines].join('\n'))) {
    if (cols[0] !== 'V' || cols.length < 11) continue
    const [, crewId, idxRaw, pairingId, ws, we, actual, maxTimes, minTimes, mode, overRaw] = cols
    const m = meta[Number(idxRaw)]
    if (!m || Number(pairingId) <= 0) continue
    const over = overRaw === '1' || String(overRaw).toUpperCase() === 'TRUE'
    out.push({
      crew_id: crewId,
      pairing_id: Number(pairingId),
      duty_seq: null,
      rule_code: '8071',
      rule_instance: m.inst.instance,
      scope_key: m.sk,
      start_dt: new Date(Number(ws) * 1000).toISOString(),
      end_dt: new Date(Number(we) * 1000).toISOString(),
      window_start_dt: new Date(Number(ws) * 1000).toISOString(),
      window_end_dt: new Date(Number(we) * 1000).toISOString(),
      severity: 2,
      actual_value: Number(actual),
      limit_value: over ? Number(maxTimes) : Number(minTimes),
      unit: 'COUNT',
      message: withParamRowPrefix(m.rowIndex, `Roster Period [${new Date(Number(ws) * 1000).toISOString().slice(0, 10)}, ${new Date(Number(we) * 1000).toISOString().slice(0, 10)}]: The number of matching rosters (${Number(actual)}) does NOT meet the allowed range of [${minTimes}, ${maxTimes}]. Rule parameters: attribute=${rawOrStar(m.row[m.H('Attributes')])}, assignment group=${rawOrStar(m.row[m.H('Assignment Groups')])}, label=${rawOrStar(m.row[m.H('Labels')])}, qualifier=${rawOrStar(m.row[m.H('Qualifiers')])}, destination=${rawOrStar(m.row[m.H('Destinations')])}.`),
    })
  }
  return out
}

// ── Rule 8072 — MIN/MAX QUALIFIED CREW PER FLIGHT/FLEET/RANK ────────────────
// Segment qualification counts are evaluated by the Rust check-8072 kernel.
// Source filters only narrow dimensions explicitly configured by the params;
// '*' stays an empty filter so the adapter does not restrict it.
export async function rule8072(source, ctx) {
  const instances = ctx.instancesOf(8072)
  if (!instances.length) { ctx.log('8072: no instances in rule set — skipped'); return [] }
  const groupSet = new Set()
  const fleetSet = new Set()
  const depSet = new Set()
  const arrSet = new Set()
  const ruleLines = []
  const meta = []
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    for (const [rowIndex, row] of (inst.rows ?? []).entries()) {
      const qualIdx = H('Required Qualifications')
      const minIdx = H('Min Limits')
      const maxIdx = H('Max Limits')
      const quals = qualIdx >= 0 ? rawOrStar(row[qualIdx]) : ''
      const minLimits = minIdx >= 0 ? Number(row[minIdx]) : Number.NaN
      const maxLimits = maxIdx >= 0 ? Number(row[maxIdx]) : Number.NaN
      if (Number.isNaN(minLimits) || Number.isNaN(maxLimits) || !quals) {
        ctx.log(`skip 8072/${inst.instance}: missing Required Qualifications/Min Limits/Max Limits`)
        continue
      }
      for (const value of filterValues(row[H('Flight Assignment Groups')])) groupSet.add(value)
      for (const value of filterValues(row[H('Flight Fleets')])) fleetSet.add(value)
      for (const value of filterValues(row[H('Dep')])) depSet.add(value)
      for (const value of filterValues(row[H('Arr')])) arrSet.add(value)
      const idx = meta.length
      const sk = `${rawOrStar(row[H('Required Qualifications')])}:${rawOrStar(row[H('Flight Assignment Groups')])}:${minLimits}-${maxLimits}`.slice(0, 40)
      meta.push({ inst, row, H, sk, minLimits, maxLimits, rowIndex })
      ruleLines.push(['R', idx, ...HDR8072.map((name) => rawOrStar(row[H(name)]))].join('\t'))
    }
  }
  if (!ruleLines.length) return []
  const rows = await source.qualificationFlightSegments({
    groups: [...groupSet],
    fleets: [...fleetSet],
    deps: [...depSet],
    arrs: [...arrSet],
    focusPairingIds: Array.isArray(ctx.focusPairingIds) ? ctx.focusPairingIds : [],
  })
  const inputLines = [...ruleLines]
  for (const r of rows) {
    const matchingRules = meta.map((_, idx) => String(idx)).join('|')
    inputLines.push(['S',
      r.segment_id, r.pairing_id, r.duty_seq ?? 0, r.seg_seq ?? 0, r.flight_id ?? 0,
      r.flight_number ?? '', r.flight_date ?? '', r.start_utc, r.end_utc,
      r.fleet ?? '', r.dep ?? '', r.arr ?? '', r.assignment ?? '',
      r.assignment_group ?? '', r.composition ?? '', r.attributes ?? '*',
      r.destination_country ?? '', r.planned_by_rank ?? '', r.filled_by_rank ?? '',
      matchingRules,
    ].map((v) => String(v).replace(/[\t\n\r]/g, ' ')).join('\t'))
    for (const c of r.crews ?? []) {
      inputLines.push(['C',
        r.segment_id, c.crew_id, c.division ?? '', c.acting_rank ?? '',
        c.assignment ?? '', c.assignment_group ?? '', c.nationality ?? '',
        c.teams ?? '', c.source ?? '', c.qualifications ?? '',
      ].map((v) => String(v).replace(/[\t\n\r]/g, ' ')).join('\t'))
    }
  }
  const out = []
  for (const cols of await runBin('check-8072', ['--emit-tsv'], inputLines.join('\n'))) {
    if (cols[0] !== 'V' || cols.length < 17) continue
    const [, idxRaw, crewId, pairingId, segmentId, dutySeq, startUtc, endUtc, flightNumber, fleet, actingRank, qualified, planned, filled, minLimits, maxLimits, overRaw] = cols
    const m = meta[Number(idxRaw)]
    if (!m || Number(pairingId) <= 0 || Number(segmentId) <= 0) continue
    const over = overRaw === '1' || String(overRaw).toUpperCase() === 'TRUE'
    const body8072 = renderRuleBody(LEGALITY_MESSAGES, '8072', {
      qualified: String(qualified),
      min: String(minLimits),
      max: String(maxLimits),
    })
    if (!body8072) throw new Error('8072 message template render failed')
    out.push({
      crew_id: crewId,
      pairing_id: Number(pairingId),
      segment_id: Number(segmentId),
      duty_seq: Number(dutySeq) || null,
      rule_code: '8072',
      rule_instance: m.inst.instance,
      scope_key: `seg:${segmentId}:${m.sk}`.slice(0, 40),
      start_dt: new Date(Number(startUtc) * 1000).toISOString(),
      end_dt: new Date(Number(endUtc) * 1000).toISOString(),
      window_start_dt: new Date(Number(startUtc) * 1000).toISOString(),
      window_end_dt: new Date(Number(endUtc) * 1000).toISOString(),
      severity: 2,
      actual_value: Number(qualified),
      limit_value: over ? Number(maxLimits) : Number(minLimits),
      unit: 'COUNT',
      message: withParamRowPrefix(m.rowIndex, body8072),
    })
  }
  return out
}

// ── Rule 7509 — AVOID CO-PAIRING (physical-flight complement) ───────────────
// Parameter rows are validated here so the source adapter only needs to load the
// affected flight complement. The Rust binary owns the matching, date-overlap,
// deduplication, and optimizer PA-only semantics.
const parse7509DateOrd = (value) => {
  const raw = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const ms = Date.parse(`${raw}T00:00:00Z`)
  if (!Number.isFinite(ms)) return null
  const check = new Date(ms).toISOString().slice(0, 10)
  return check === raw ? Math.floor(ms / 86400000) : null
}

const format7509FlightLabel = (row) => {
  const number = String(row?.flight_number ?? '').trim()
  return number || String(row?.flight_id ?? '')
}

export async function rule7509(source, ctx) {
  const instances = ctx.instancesOf(7509)
  if (!instances.length) { ctx.log('7509: no instances in rule set — skipped'); return [] }
  if (typeof source.avoidCoPairing !== 'function') {
    ctx.log('7509: source does not provide avoidCoPairing() — skipped')
    return []
  }

  const valid = []
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    const crewAIdx = H('Crew A')
    const crewBIdx = H('Crew B')
    const effIdx = H('Eff Date')
    const expIdx = H('Exp Date')
    if ([crewAIdx, crewBIdx, effIdx, expIdx].some((idx) => idx < 0)) {
      ctx.log(`skip 7509/${inst.instance}: parameter header must be Crew A/Crew B/Eff Date/Exp Date`)
      continue
    }
    for (const [rowIndex, row] of (inst.rows ?? []).entries()) {
      const crewA = String(row?.[crewAIdx] ?? '').trim()
      const crewB = String(row?.[crewBIdx] ?? '').trim()
      const eff = String(row?.[effIdx] ?? '').trim()
      const exp = String(row?.[expIdx] ?? '').trim()
      if (!crewA || !crewB) {
        ctx.log(`skip 7509/${inst.instance} row ${rowIndex + 1}: empty crew ID`)
        continue
      }
      if (crewA === crewB) {
        ctx.log(`skip 7509/${inst.instance} row ${rowIndex + 1}: self-pair ignored`)
        continue
      }
      const effOrd = parse7509DateOrd(eff)
      const expOrd = parse7509DateOrd(exp)
      if (effOrd == null || expOrd == null || expOrd < effOrd) {
        ctx.log(`skip 7509/${inst.instance} row ${rowIndex + 1}: invalid date range`)
        continue
      }
      const pair = [crewA, crewB].sort((a, b) => a.localeCompare(b))
      valid.push({
        instance: inst.instance,
        rowIndex,
        row: [crewA, crewB, eff, exp],
        pair,
        key: `instance:${inst.instance}:row:${rowIndex}:pair:${pair.join('-')}`,
      })
    }
  }
  if (!valid.length) return []

  const crewIds = [...new Set(valid.flatMap((m) => m.pair))].sort()
  const rows = await source.avoidCoPairing({
    crewIds,
    focusPairingIds: Array.isArray(ctx.focusPairingIds) ? ctx.focusPairingIds : [],
  })
  const metaByIndex = new Map()
  const ruleLines = []
  valid.forEach((m, index) => {
    metaByIndex.set(index, m)
    ruleLines.push(['R', index, ...m.row].join('\t'))
  })
  const memberRows = (rows ?? []).filter((r) =>
    Number.isFinite(Number(r.flight_id))
    && Number(r.pairing_id) > 0
    && String(r.crew_id ?? '').trim()
    && Number.isFinite(Number(r.pairing_start_secs))
    && Number.isFinite(Number(r.pairing_end_secs)),
  )
  if (!memberRows.length) return []
  const memberLines = memberRows.map((r) => [
    'M', Number(r.flight_id), String(r.crew_id).trim(), Number(r.pairing_id),
    Number(r.pairing_start_secs), Number(r.pairing_end_secs),
    r.source_is_pa ? 'Y' : 'N',
  ].join('\t'))
  const binRunner = ctx.runBin ?? runBin
  const out = []
  for (const cols of await binRunner('check-7509', ['--emit-tsv'], [...ruleLines, ...memberLines].join('\n'))) {
    if (cols[0] !== 'V' || cols.length < 6) continue
    const meta = metaByIndex.get(Number(cols[1]))
    if (!meta) continue
    const crewId = String(cols[2]).trim()
    const pairedCrewId = String(cols[3]).trim()
    const pairingId = Number(cols[4])
    const flightId = Number(cols[5])
    const member = memberRows.find((r) =>
      String(r.crew_id).trim() === crewId
      && Number(r.pairing_id) === pairingId
      && Number(r.flight_id) === flightId,
    )
    if (!member) continue
    const pairKey = `${meta.key}:${flightId}`
    const body7509 = renderRuleBody(LEGALITY_MESSAGES, '7509', {
      crew_id: String(crewId),
      paired_crew_id: String(pairedCrewId),
      flight_label: format7509FlightLabel(member),
    })
    if (!body7509) throw new Error('7509 message template render failed')
    out.push({
      crew_id: crewId,
      pairing_id: pairingId,
      duty_seq: null,
      rule_code: '7509',
      rule_instance: meta.instance,
      scope_key: hashedScopeKey(pairKey, [String(flightId)]).slice(0, 40),
      flight_id: flightId,
      start_dt: new Date(Number(member.pairing_start_secs) * 1000).toISOString(),
      end_dt: new Date(Number(member.pairing_end_secs) * 1000).toISOString(),
      window_start_dt: new Date(Number(member.pairing_start_secs) * 1000).toISOString(),
      window_end_dt: new Date(Number(member.pairing_end_secs) * 1000).toISOString(),
      severity: 2,
      actual_value: 1,
      limit_value: 0,
      unit: 'PAIR',
      message: withParamRowPrefix(meta.rowIndex, body7509),
    })
  }
  const seen = new Set()
  return out.filter((row) => {
    const key = `${row.crew_id}|${row.pairing_id}|${row.flight_id}|${row.rule_instance}|${row.scope_key}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Planner-facing flight label: prefer flt_num, fall back to flt_id.
 * Dirty rows sometimes store airline+number (e.g. airline F8 + 604 → F8604). */
export function resolve8030FlightLabel(fltId, fltNum, airline) {
  const raw = String(fltNum ?? '').trim()
  if (!raw) return String(fltId)
  const al = String(airline ?? '').trim()
  if (al) {
    const upper = raw.toUpperCase()
    const prefix = al.toUpperCase()
    if (upper.startsWith(prefix)) {
      const rest = raw.slice(prefix.length)
      if (/^\d/.test(rest)) return rest
    }
  }
  const letterStripped = raw.replace(/^[A-Za-z]+(?=\d)/, '')
  return letterStripped || raw
}

export function format8030ViolationMessage({
  ageYears, flightLabel, onFlightCount, ageLimit, maxNumber, depLocalDate,
}) {
  const date = String(depLocalDate ?? '').trim()
  const flightPart = date ? `${flightLabel} (${date})` : flightLabel
  return withParamRowPrefix(
    0,
    `Pilot aged ${ageYears} on flight ${flightPart} carrying ${onFlightCount} crew aged ${ageLimit}+ (limit ${maxNumber}).`,
  )
}

// ── Rule 8030 — PILOT AGE (per-flt_id complement, cross-pairing) ─────────────
// Division / Age Define / Max Number now come from the rule set per instance (row 0),
// not hardcoded CLI values. COF key is flt_id (physical flight).
export async function rule8030(source, ctx) {
  const instances = ctx.instancesOf(8030)
  if (!instances.length) { ctx.log('8030: no instances in rule set — skipped'); return [] }
  const validInstances = []
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    const row0 = inst.rows[0]
    if (!row0) { ctx.log(`skip 8030/${inst.instance}: no param rows`); continue }
    const sk = scopeKeyOf(row0, H)
    const division = row0[H('Division')]
    const ageLimit = parseInt(row0[H('Age Define')], 10)
    const maxNumber = parseInt(row0[H('Max Number')], 10)
    if (!division || !ageLimit || Number.isNaN(maxNumber)) { ctx.log(`skip 8030/${inst.instance}: missing Division/Age Define/Max Number`); continue }
    validInstances.push({ inst, sk, division, ageLimit, maxNumber })
  }
  if (!validInstances.length) return []
  const rows = await source.pilotAge()
  // Span keyed by crew|pairing|flt for attribution window (segment times from source).
  const span = new Map()
  const fltNumById = new Map()
  const airlineByFlt = new Map()
  const depMetaByFlt = new Map()
  for (const r of rows) {
    const key = `${r.crew_id}|${r.pairing_id}|${r.flt_id}`
    span.set(key, { s: Number(r.start_secs), e: Number(r.end_secs) })
    const fid = String(r.flt_id)
    const num = String(r.flt_num ?? '').trim()
    if (num && !fltNumById.has(fid)) fltNumById.set(fid, num)
    const airline = String(r.airline ?? '').trim()
    if (airline && !airlineByFlt.has(fid)) airlineByFlt.set(fid, airline)
    if (!depMetaByFlt.has(fid)) {
      const depSecs = Number(r.dep_secs ?? r.start_secs)
      const zoneId = String(r.dep_zone_id ?? '').trim() || 'UTC'
      depMetaByFlt.set(fid, { depSecs, zoneId })
    }
  }
  const tsv = rows
    .map((r) => `${r.flt_id}\t${r.pairing_id}\t${r.start_date}\t${r.crew_id}\t${r.division}\t${r.birth_date}`)
    .join('\n')
  const out = []
  for (const { inst, sk, division, ageLimit, maxNumber } of validInstances) {
    for (const [crewId, pairingId, fltId, ageYears, onFlightCount] of
      await runBin('check-8030', ['--division', division, '--age-limit', String(ageLimit), '--max-number', String(maxNumber), '--emit-tsv'], tsv)) {
      const sp = span.get(`${crewId}|${pairingId}|${fltId}`) ?? { s: 0, e: 0 }
      const flightLabel = resolve8030FlightLabel(
        fltId,
        fltNumById.get(String(fltId)),
        airlineByFlt.get(String(fltId)),
      )
      const depMeta = depMetaByFlt.get(String(fltId))
      const depLocalDate = depMeta && Number.isFinite(depMeta.depSecs)
        ? localDateOf(depMeta.depSecs, depMeta.zoneId)
        : null
      out.push({
        crew_id: crewId, pairing_id: Number(pairingId), duty_seq: null,
        rule_code: '8030', rule_instance: inst.instance, scope_key: sk,
        flight_id: Number(fltId),
        start_dt: new Date(sp.s * 1000).toISOString(), end_dt: new Date(sp.e * 1000).toISOString(), severity: 2,
        actual_value: Number(onFlightCount), limit_value: maxNumber, unit: 'PERSON',
        message: format8030ViolationMessage({
          ageYears, flightLabel, onFlightCount, ageLimit, maxNumber, depLocalDate,
        }),
      })
    }
  }
  return out
}

// ── Rule 8004 — BASIC COMPETENCY (roster base must be a valid crew_base) ──────
// Grace Period now comes from the rule set per instance (row 0), not a hardcoded 0.
export async function rule8004(source, ctx) {
  const instances = ctx.instancesOf(8004)
  if (!instances.length) { ctx.log('8004: no instances in rule set — skipped'); return [] }
  const rosters = await source.assignmentsRaw()
  const crewIds = [...new Set(rosters.map((r) => r.crew_id))]
  const quals = await source.baseQuals(crewIds)
  const tzMap = await source.crewBaseTimezone()
  const span = new Map(rosters.map((r) => [`${r.crew_id}:${r.pairing_id}`, { s: Number(r.start_secs), e: Number(r.end_secs) }]))
  const lines = []
  for (const r of rosters) lines.push(`R\t${r.crew_id}\t${r.pairing_id}\t${r.base ?? ''}\t${r.start_date}\t${r.end_date}`)
  for (const q of quals) lines.push(`Q\t${q.crew_id}\t${q.base}\t${q.eff_date ?? '-'}\t${q.exp_date ?? '-'}`)
  const tsv = lines.join('\n')
  const out = []
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    const row0 = inst.rows[0]
    const gi = row0 ? H('Grace Period') : -1
    const graceDays = gi >= 0 ? (parseInt(row0[gi], 10) || 0) : 0
    const sk = scopeKeyOf(row0 ?? [], H)
    for (const [crewId, pairingId, base] of await runBin('check-8004', ['--grace-days', String(graceDays), '--emit-tsv'], tsv)) {
      const sp = span.get(`${crewId}:${pairingId}`) ?? { s: 0, e: 0 }
      out.push({
        crew_id: crewId, pairing_id: Number(pairingId), duty_seq: null,
        rule_code: '8004', rule_instance: inst.instance, scope_key: sk,
        start_dt: new Date(sp.s * 1000).toISOString(), end_dt: new Date(sp.e * 1000).toISOString(), severity: 2,
        actual_value: null, limit_value: null, unit: null,
        message: withParamRowPrefix(0, `Crew base ${base} is not a valid qualification for the roster (${localDateOf(sp.s, tzMap.get(crewId))}).`),
      })
    }
  }
  return out
}

// ── Rule 1001 — ASSIGNMENT OVERLAP (same Rust kernel as the solver gate) ─────
// Param rows are Before/After filters + Rest Before (blacklist). Unmatched time
// overlaps fail closed. FLY→DO pairs respect rule 2015 DO Start via --do-start-min.
export async function rule1001(source, ctx) {
  const instances = ctx.instancesOf(1001)
  if (!instances.length) { ctx.log('1001: no instances in rule set — skipped'); return [] }
  const rosters = await source.assignmentOverlapRosters()
  if (!rosters.length) return []
  const tzMap = source.crewBaseTimezone ? await source.crewBaseTimezone() : new Map()
  const { doStartMin, assignments, groups } = doStartGrace1001(ctx)
  const binArgs = ['--emit-tsv', '--do-start-min', String(doStartMin)]
  if (assignments.length) binArgs.push('--do-start-assignments', assignments.join('|'))
  if (groups.length) binArgs.push('--do-start-groups', groups.join('|'))
  const rosterById = new Map(rosters.map((r) => [`${r.crew_id}:${r.id}`, r]))
  const lines = []
  const out = []
  for (const r of rosters) {
    const off = await offsetForDuty(source, r.crew_id, r.start_secs, r.offset_min)
    lines.push(['A', r.crew_id, r.id, r.pairing_id ?? 0, r.start_secs, r.end_duty_secs, r.end_rest_secs,
      r.assignment_group ?? '', r.assignment ?? '', r.assignment_type ?? '',
      off].join('\t'))
  }
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    if (!inst.rows?.length) { ctx.log(`skip 1001/${inst.instance}: no param rows`); continue }
    const ruleLines = []
    for (const row of inst.rows) {
      ruleLines.push(['R',
        row[H('Assignment Group Before')] ?? '*',
        row[H('Assignment Before')] ?? '*',
        row[H('Assignment Rest Before')] ?? '',
        row[H('Assignment Type Before')] ?? '*',
        row[H('Assignment Group After')] ?? '*',
        row[H('Assignment After')] ?? '*',
        row[H('Assignment Type After')] ?? '*',
      ].join('\t'))
    }
    const tsv = [...ruleLines, ...lines].join('\n')
    for (const [crewId, pairingId, beforeId, afterId, start, end, beforeAssignment, afterAssignment] of
      await runBin('check-1001', binArgs, tsv)) {
      const before = rosterById.get(`${crewId}:${beforeId}`)
      const after = rosterById.get(`${crewId}:${afterId}`)
      const zoneId = tzMap.get(crewId)
      const codeBefore = beforeAssignment || before?.assignment || 'before'
      const codeAfter = afterAssignment || after?.assignment || 'after'
      const epochBefore = before?.start_secs ?? Number(start)
      const epochAfter = after?.start_secs ?? Number(start)
      const dateBefore = localDateOf(epochBefore, zoneId)
      const dateAfter = localDateOf(epochAfter, zoneId)
      out.push({
        crew_id: crewId, pairing_id: Number(pairingId), duty_seq: null,
        rule_code: '1001', rule_instance: inst.instance, scope_key: `${beforeId}>${afterId}`.slice(0, 40),
        start_dt: new Date(Number(start) * 1000).toISOString(), end_dt: new Date(Number(end) * 1000).toISOString(), severity: 2,
        actual_value: null, limit_value: null, unit: null,
        message: withParamRowPrefix(0, `Overlapping assignments between ${codeBefore} (${dateBefore}) and ${codeAfter} (${dateAfter}) are not allowed.`),
      })
    }
  }
  return out
}

// Group crews for one (instance, month) by base offset for the days-off rules.
// Only crews with a days-off anchor in the month's local RP window are included,
// matching the legacy per-crew spawn skip exactly (crews without an anchor produce
// no rows and must not be evaluated).
const groupCrewsByOffsetForMonth = async (source, assignmentsByCrew, month, fallbackOffsets) => {
  const dayStartUtcSecs = Math.floor(new Date(`${month.rpFrom}T00:00:00Z`).getTime() / 1000)
  const groups = new Map() // offsetMin → Array<{ crewId, rows, anchorRow }>
  for (const [crewId, rows] of assignmentsByCrew) {
    const offsetMin = await resolveCrewOffsetOrFallback(source, crewId, dayStartUtcSecs, fallbackOffsets)
    const { startUtcSec, endUtcSec } = crewLocalRpWindowUtc(month.rpFrom, month.rpTo, offsetMin)
    const anchorRow = pickDaysOffAnchor(rows, startUtcSec, endUtcSec)
    if (!anchorRow) continue
    let group = groups.get(offsetMin)
    if (!group) { group = []; groups.set(offsetMin, group) }
    group.push({ crewId, rows, anchorRow })
  }
  return groups
}

// ── Rule 7505 — MIN # GDOs in a RP (days-off floor per rostering period) ─────
// Instance + all param rows resolved from the rule set; findings tagged instance + scope_key.
export async function rule7505(source, ctx) {
  const instances = ctx.instancesOf(7505)
  if (!instances.length) { ctx.log('7505: no instances in rule set — skipped'); return [] }
  const validInstances = []
  let needsTeamMap = false
  let needsQualRows = false
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    const ix = (n) => H(n)
    const [iMin, iRp, iLeaveR, iBlank, iPostRest, iLeaveA, iPeriod, iUnit, iLayover] =
      ['Min DO', 'RP Days Range', 'Leave Days Range', 'Count Blank Day', 'Utilize Post Duty Rest', 'Leave Assignments', 'Period', 'Unit', 'Count Layover'].map(ix)
    if (iMin < 0 || iRp < 0) { ctx.log(`skip 7505/${inst.instance}: missing Min DO / RP Days Range`); continue }
    const rules = []
    for (const [rowIndex, r] of (inst.rows ?? []).entries()) {
      const bases = fieldOrStar(r, H, 'Bases')
      const ranks = fieldOrStar(r, H, 'Ranks')
      const fleets = fieldOrStar(r, H, 'Fleets')
      const teams = fieldOrStar(r, H, 'Crew Teams')
      const hasQualScope = [bases, ranks, fleets].some(hasNonWildcard)
      if (hasQualScope && !source.crewQualEntries) {
        ctx.log(`skip 7505/${inst.instance}: Bases/Ranks/Fleets scoped row but source has no crew qualification data`)
        continue
      }
      if (hasNonWildcard(teams) && !source.crewTeams) {
        ctx.log(`skip 7505/${inst.instance}: Crew Teams=${teams} but source has no crew-team data`)
        continue
      }
      if (hasQualScope) needsQualRows = true
      if (hasNonWildcard(teams)) needsTeamMap = true
      const [rpLo, rpHi] = String(r[iRp]).split('-')
      const [lvLo, lvHi] = String(r[iLeaveR] ?? '0-0').split('-')
      const leaveCodes = r[iLeaveA] === '*' ? '' : String(r[iLeaveA] ?? '').split('|').join(',')
      const line = ['R', bases, ranks, fleets, teams, String(Number(r[iMin])), rpLo, rpHi, lvLo, lvHi, 'DO', leaveCodes,
        r[iBlank] === 'Y' ? '1' : '0', r[iPostRest] === 'Y' ? '1' : '0', r[iPeriod], r[iUnit],
        (iLayover >= 0 && r[iLayover] === 'Y') ? '1' : '0'].join('\t')
      const scopes = [bases, ranks, fleets, teams].filter(hasNonWildcard)
      rules.push({
        line,
        rowIndex,
        period: String(r[iPeriod] ?? '').trim(),
        unit: String(r[iUnit] ?? '').trim(),
        scopeKey: scopes.length
          ? `${scopes.join('|')}|${String(r[iPeriod] ?? '').trim()}${String(r[iUnit] ?? '').trim()}`
          : `${String(r[iPeriod] ?? '').trim()}${String(r[iUnit] ?? '').trim()}`,
      })
    }
    if (rules.length) validInstances.push({ inst, rules })
  }
  if (!validInstances.length) return []
  const teamMap = needsTeamMap ? await source.crewTeams() : null
  const qualRows = needsQualRows ? await source.crewQualEntries() : []
  const qualLinesByCrew = new Map()
  if (needsQualRows) {
    for (const row of qualRows ?? []) {
      const crewId = String(row.crew_id ?? '').trim()
      const dim = String(row.dim ?? row.dimension ?? '').trim().toUpperCase()
      const value = String(row.value ?? '').trim()
      if (!crewId || !['B', 'R', 'F'].includes(dim) || !value || !qualOverlapsWindow(row, ctx)) continue
      const exp = row.exp ?? row.exp_date
      const line = ['Q', crewId, dim, cleanTsv(value),
        dateOrdOrMinusOne(row.eff ?? row.eff_date),
        exp == null || String(exp).trim() === '' ? '-1' : dateOrdOrMinusOne(exp),
      ].join('\t')
      const lines = qualLinesByCrew.get(crewId) ?? []
      lines.push(line)
      qualLinesByCrew.set(crewId, lines)
    }
  }
  const teamLinesByCrew = new Map()
  if (needsTeamMap) {
    for (const [crewIdRaw, teams] of teamMap ?? new Map()) {
      const crewId = String(crewIdRaw)
      for (const team of teams ?? []) {
        const teamValue = String(team ?? '').trim()
        if (!teamValue) continue
        const lines = teamLinesByCrew.get(crewId) ?? []
        lines.push(['T', crewId, cleanTsv(teamValue)].join('\t'))
        teamLinesByCrew.set(crewId, lines)
      }
    }
  }
  const fallbackOffsets = typeof source.resolveCrewOffset === 'function'
    ? null
    : (source.crewOffsets ? await source.crewOffsets() : new Map())
  const assignmentsByCrew = new Map()
  for (const row of await source.assignmentsAll()) {
    const crewId = String(row.crew_id)
    if (!assignmentsByCrew.has(crewId)) assignmentsByCrew.set(crewId, [])
    assignmentsByCrew.get(crewId).push(row)
  }
  const out = []
  const invokeRunBin = ctx.runBin ?? runBin
  const { rpFrom, rpTo } = resolveDaysOffRpBounds(ctx)
  const rpMonths = listInclusiveCalendarMonths(rpFrom, rpTo)
  const doStart = doStartMin(ctx)
  const crewOrderIndex = new Map([...assignmentsByCrew.keys()].map((id, index) => [id, index]))
  const ordered = []
  for (const [instanceIndex, { inst, rules }] of validInstances.entries()) {
    for (const [monthIndex, month] of rpMonths.entries()) {
      for (const [offsetMin, group] of await groupCrewsByOffsetForMonth(source, assignmentsByCrew, month, fallbackOffsets)) {
        const { startUtcSec, endUtcSec } = crewLocalRpWindowUtc(month.rpFrom, month.rpTo, offsetMin)
        const anchorByCrew = new Map(group.map((entry) => [entry.crewId, entry.anchorRow]))
        const activityLines = []
        for (const { rows } of group) {
          for (const r of rows) {
            const restEnd = r.end_rest_secs ?? r.r ?? r.rest_start_secs ?? r.e
            const pairingId = r.pairing_id != null && Number(r.pairing_id) > 0 ? String(r.pairing_id) : ''
            activityLines.push(pairingId
              ? `A\t${r.crew_id}\t${r.code}\t${r.s}\t${r.e}\t${restEnd}\t${pairingId}`
              : `A\t${r.crew_id}\t${r.code}\t${r.s}\t${r.e}\t${restEnd}`)
          }
        }
        const emitted = await invokeRunBin('check-7505',
          ['--rp-start', String(startUtcSec), '--rp-end', String(endUtcSec), '--offset', String(offsetMin), '--do-start-min', String(doStart), '--emit-tsv'],
          [
            ...rules.map((rule) => rule.line),
            ...group.flatMap(({ crewId }) => qualLinesByCrew.get(crewId) ?? []),
            ...group.flatMap(({ crewId }) => teamLinesByCrew.get(crewId) ?? []),
            ...activityLines,
          ].join('\n'))
        for (const [crew, rpS, rpE, daysOff, minDo, period, unit] of emitted) {
          const matchedRule = rules.find((rule) => rule.period === period && rule.unit === unit)
          ordered.push({
            key: [instanceIndex, crewOrderIndex.get(crew) ?? Infinity, monthIndex],
            row: {
              crew_id: crew, pairing_id: daysOffAnchorPairingId(anchorByCrew.get(crew)), duty_seq: null,
              rule_code: '7505', rule_instance: inst.instance, scope_key: matchedRule?.scopeKey ?? `${period}${unit}`,
              start_dt: new Date(Number(rpS) * 1000).toISOString(), end_dt: new Date((Number(rpE) - 1) * 1000).toISOString(),
              ...calendarRpDisplayWindow(month.rpFrom, month.rpTo),
              severity: 1,
              actual_value: Number(daysOff), limit_value: Number(minDo), unit,
              message: withParamRowPrefix(matchedRule?.rowIndex ?? 0, `The number of days off(${daysOff}) must be at least ${minDo} in ${period} ${unit} (${month.rpFrom}, ${month.rpTo}).`),
            },
          })
        }
      }
    }
  }
  return ordered
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2])
    .map(({ row }) => row)
}

// ── Rule 7305 — max consecutive duty times/days ─────────────────────────────
// The source adapters only normalize database rows; all matching, continuity,
// PA handling, messages, and spans live in the shared Rust kernel.
export async function rule7305(source, ctx) {
  const instances = ctx.instancesOf(7305)
  if (!instances.length) { ctx.log('7305: no instances in rule set — skipped'); return [] }
  if (!source.crewQualEntries || !source.crewOffsets
    || (!source.rosterDuties && (!source.flyDuties || !source.groundWork))) {
    ctx.log('skip 7305: source lacks qualification, offset, or roster accessors')
    return []
  }

  const params = []
  let needsQuals = false
  let needsTeams = false
  for (const inst of instances) {
    if (!inst.rows?.length) { ctx.log(`skip 7305/${inst.instance}: no param rows`); continue }
    for (const [rowIndex, row] of (inst.rows ?? []).entries()) {
      const cells = Array.isArray(row)
        ? row.map((value) => String(value ?? '').trim())
        : []
      if (cells.length !== 12 || (inst.header ?? []).length !== 12
        || String(inst.header?.[4] ?? '').trim().toUpperCase() !== 'CREW TEAMS') {
        ctx.log(`skip 7305/${inst.instance}: expected 12 positional columns with CREW TEAMS`)
        continue
      }
      if (!['T', 'D'].includes(cells[9].toUpperCase())) {
        ctx.log(`skip 7305/${inst.instance}: Consecutive Type must be T or D`)
        continue
      }
      if (!/^-?\d+$/.test(cells[10]) || !/^-?\d+$/.test(cells[11])) {
        ctx.log(`skip 7305/${inst.instance}: numeric max/severity is invalid`)
        continue
      }
      if ([0, 1, 2, 3].some((index) => hasNonWildcard(cells[index]))) needsQuals = true
      if (hasNonWildcard(cells[4])) needsTeams = true
      params.push({ inst, cells, rowIndex, scopeKey: hashedScopeKey(`r${params.length}`, cells) })
    }
  }
  if (!params.length) return []

  const qualRows = needsQuals ? await source.crewQualEntries() : []
  const teamMap = needsTeams && source.crewTeams ? await source.crewTeams() : new Map()
  const qualLines = []
  for (const q of qualRows ?? []) {
    const dim = String(q.dim ?? q.dimension ?? '').trim().toUpperCase()
    if (!['B', 'R', 'F', 'P'].includes(dim) || !q.crew_id || !q.value || !qualOverlapsWindow(q, ctx)) continue
    qualLines.push(['Q', q.crew_id, dim, q.value,
      dateOrdOrMinusOne(q.eff ?? q.eff_date),
      q.exp == null || String(q.exp).trim() === '' ? '-1' : dateOrdOrMinusOne(q.exp),
    ].map(cleanTsv).join('\t'))
  }
  const teamLines = []
  for (const [crew, teams] of teamMap ?? new Map()) {
    for (const team of teams ?? []) teamLines.push(['T', crew, team].map(cleanTsv).join('\t'))
  }
  const groupLines = []
  const groupRows = source.assignmentGroups ? await source.assignmentGroups() : []
  for (const row of groupRows ?? []) {
    groupLines.push(['G', row.assignment ?? row.code ?? '', row.assignment_group ?? row.group ?? ''].map(cleanTsv).join('\t'))
  }

  // C++ 7305 evaluates the complete crew roster list. `flyDuties()` is intentionally
  // narrower because the other rules only need FLY rows, so prefer the dedicated
  // complete-activity accessor and retain the fallback for older adapters/tests.
  const activities = source.rosterDuties
    ? await source.rosterDuties()
    : [...await source.flyDuties(false), ...await source.groundWork(true)]
  const byCrew = new Map()
  for (const row of activities ?? []) {
    const crew = String(row.crew_id ?? '')
    if (!crew) continue
    const list = byCrew.get(crew) ?? []
    const isGround = row.pairing_id == null || Number(row.pairing_id) <= 0
    const off = await offsetForDuty(source, crew, row.start_secs ?? row.s, row.offset_min)
    list.push(['D', crew, row.id ?? row.activity_id ?? row.pairing_id ?? 0,
      row.pairing_id ?? 0, row.start_secs ?? row.s, row.end_secs ?? row.e,
      row.end_including_rest_secs ?? row.end_rest_secs ?? row.e,
      off,
      row.assignment ?? row.code ?? '', row.assignment_group ?? '',
      row.attributes ?? '', row.label ?? '', boolYN(row.is_pre_assigned, isGround),
      boolYN(row.phase_checked, true), isGround ? '1' : '0',
    ].map(cleanTsv).join('\t'))
    byCrew.set(crew, list)
  }

  const out = []
  const invokeRunBin = ctx.runBin ?? runBin
  const crewOrderIndex = new Map([...byCrew.keys()].map((id, index) => [id, index]))
  const input = [
    ...params.map((p, index) => ['R', index, ...p.cells].map(cleanTsv).join('\t')),
    ...qualLines,
    ...teamLines,
    ...groupLines,
    ...[...byCrew.values()].flat(),
  ].join('\n')
  const ordered = []
  for (const cols of await invokeRunBin('check-7305', ['--emit-tsv', '--per-crew-window'], input)) {
    if (cols[0] !== 'V' || cols.length < 10) continue
    const rowIndex = Number(cols[2])
    const matched = params[rowIndex]
    if (!matched) continue
    ordered.push({
      key: crewOrderIndex.get(cols[1]) ?? Infinity,
      row: {
        crew_id: cols[1],
        pairing_id: Number(cols[3]) > 0 ? Number(cols[3]) : null,
        duty_seq: null,
        rule_code: '7305',
        rule_instance: matched.inst.instance,
        scope_key: matched.scopeKey,
        start_dt: new Date(Number(cols[4]) * 1000).toISOString(),
        end_dt: new Date(Number(cols[5]) * 1000).toISOString(),
        severity: Number(cols[8]),
        actual_value: Number(cols[6]),
        limit_value: Number(cols[7]),
        unit: matched.cells[9].toUpperCase() === 'D' ? 'DAY' : 'TIME',
        message: withParamRowPrefix(matched.rowIndex ?? rowIndex, cols[9]),
      },
    })
  }
  return ordered.sort((a, b) => a.key - b.key).map(({ row }) => row)
}

// ── Rule 7507 — Min # GDOs in a RP + fly/reserve day filters (extends 7505) ─
export async function rule7507(source, ctx) {
  const instances = ctx.instancesOf(7507)
  if (!instances.length) { ctx.log('7507: no instances in rule set — skipped'); return [] }
  const validInstances = []
  let needsTeamMap = false
  let needsQualRows = false
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    const ix = (n) => H(n)
    const [iMin, iRp, iLeaveR, iBlank, iPostRest, iLeaveA, iPeriod, iUnit, iFlyR, iFlyA, iResR, iResA, iLayover] =
      ['Min DO', 'RP Days Range', 'Leave Days Range', 'Count Blank Day', 'Utilize Post Duty Rest', 'Leave Assignments', 'Period', 'Unit',
        'NUM FLY DAY', 'FLY ASSIGNMENTS', 'NUM RESERVES', 'RES ASSIGNMENTS', 'Count Layover'].map(ix)
    if (iMin < 0 || iRp < 0) { ctx.log(`skip 7507/${inst.instance}: missing Min DO / RP Days Range`); continue }
    if (iFlyR < 0 || iResR < 0) { ctx.log(`skip 7507/${inst.instance}: missing NUM FLY DAY / NUM RESERVES`); continue }
    const rules = []
    for (const [rowIndex, r] of (inst.rows ?? []).entries()) {
      const bases = fieldOrStar(r, H, 'Bases')
      const ranks = fieldOrStar(r, H, 'Ranks')
      const fleets = fieldOrStar(r, H, 'Fleets')
      const teams = fieldOrStar(r, H, 'Crew Teams')
      const hasQualScope = [bases, ranks, fleets].some(hasNonWildcard)
      if (hasQualScope && !source.crewQualEntries) {
        ctx.log(`skip 7507/${inst.instance}: Bases/Ranks/Fleets scoped row but source has no crew qualification data`)
        continue
      }
      if (hasNonWildcard(teams) && !source.crewTeams) {
        ctx.log(`skip 7507/${inst.instance}: Crew Teams=${teams} but source has no crew-team data`)
        continue
      }
      if (hasQualScope) needsQualRows = true
      if (hasNonWildcard(teams)) needsTeamMap = true
      const [rpLo, rpHi] = String(r[iRp]).split('-')
      const [lvLo, lvHi] = String(r[iLeaveR] ?? '0-0').split('-')
      const [flyLo, flyHi] = String(r[iFlyR] ?? '0-31').split('-')
      const [resLo, resHi] = String(r[iResR] ?? '0-31').split('-')
      const leaveCodes = r[iLeaveA] === '*' ? '' : String(r[iLeaveA] ?? '').split('|').join(',')
      const flyCodes = (!r[iFlyA] || r[iFlyA] === '*') ? '' : String(r[iFlyA]).split('|').join(',')
      const resCodes = (!r[iResA] || r[iResA] === '*') ? '' : String(r[iResA]).split('|').join(',')
      const line = ['R', bases, ranks, fleets, teams, String(Number(r[iMin])), rpLo, rpHi, lvLo, lvHi, 'DO', leaveCodes,
        r[iBlank] === 'Y' ? '1' : '0', r[iPostRest] === 'Y' ? '1' : '0', r[iPeriod], r[iUnit],
        flyLo, flyHi, flyCodes, resLo, resHi, resCodes,
        (iLayover >= 0 && r[iLayover] === 'Y') ? '1' : '0'].join('\t')
      const scopes = [bases, ranks, fleets, teams].filter(hasNonWildcard)
      rules.push({
        line,
        rowIndex,
        period: String(r[iPeriod] ?? '').trim(),
        unit: String(r[iUnit] ?? '').trim(),
        scopeKey: scopes.length
          ? `${scopes.join('|')}|${String(r[iPeriod] ?? '').trim()}${String(r[iUnit] ?? '').trim()}`
          : `${String(r[iPeriod] ?? '').trim()}${String(r[iUnit] ?? '').trim()}`,
      })
    }
    if (rules.length) validInstances.push({ inst, rules })
  }
  if (!validInstances.length) return []
  const teamMap = needsTeamMap ? await source.crewTeams() : null
  const qualRows = needsQualRows ? await source.crewQualEntries() : []
  const qualLinesByCrew = new Map()
  if (needsQualRows) {
    for (const row of qualRows ?? []) {
      const crewId = String(row.crew_id ?? '').trim()
      const dim = String(row.dim ?? row.dimension ?? '').trim().toUpperCase()
      const value = String(row.value ?? '').trim()
      if (!crewId || !['B', 'R', 'F'].includes(dim) || !value || !qualOverlapsWindow(row, ctx)) continue
      const exp = row.exp ?? row.exp_date
      const line = ['Q', crewId, dim, cleanTsv(value),
        dateOrdOrMinusOne(row.eff ?? row.eff_date),
        exp == null || String(exp).trim() === '' ? '-1' : dateOrdOrMinusOne(exp),
      ].join('\t')
      const lines = qualLinesByCrew.get(crewId) ?? []
      lines.push(line)
      qualLinesByCrew.set(crewId, lines)
    }
  }
  const teamLinesByCrew = new Map()
  if (needsTeamMap) {
    for (const [crewIdRaw, teams] of teamMap ?? new Map()) {
      const crewId = String(crewIdRaw)
      for (const team of teams ?? []) {
        const teamValue = String(team ?? '').trim()
        if (!teamValue) continue
        const lines = teamLinesByCrew.get(crewId) ?? []
        lines.push(['T', crewId, cleanTsv(teamValue)].join('\t'))
        teamLinesByCrew.set(crewId, lines)
      }
    }
  }
  const fallbackOffsets = typeof source.resolveCrewOffset === 'function'
    ? null
    : (source.crewOffsets ? await source.crewOffsets() : new Map())
  const assignmentsByCrew = new Map()
  for (const row of await source.assignmentsAll()) {
    const crewId = String(row.crew_id)
    if (!assignmentsByCrew.has(crewId)) assignmentsByCrew.set(crewId, [])
    assignmentsByCrew.get(crewId).push(row)
  }
  const out = []
  const invokeRunBin = ctx.runBin ?? runBin
  const { rpFrom, rpTo } = resolveDaysOffRpBounds(ctx)
  const rpMonths = listInclusiveCalendarMonths(rpFrom, rpTo)
  const doStart = doStartMin(ctx)
  const crewOrderIndex = new Map([...assignmentsByCrew.keys()].map((id, index) => [id, index]))
  const ordered = []
  for (const [instanceIndex, { inst, rules }] of validInstances.entries()) {
    for (const [monthIndex, month] of rpMonths.entries()) {
      for (const [offsetMin, group] of await groupCrewsByOffsetForMonth(source, assignmentsByCrew, month, fallbackOffsets)) {
        const { startUtcSec, endUtcSec } = crewLocalRpWindowUtc(month.rpFrom, month.rpTo, offsetMin)
        const anchorByCrew = new Map(group.map((entry) => [entry.crewId, entry.anchorRow]))
        const activityLines = []
        for (const { rows } of group) {
          for (const r of rows) {
            const restEnd = r.end_rest_secs ?? r.r ?? r.rest_start_secs ?? r.e
            const pairingId = r.pairing_id != null && Number(r.pairing_id) > 0 ? String(r.pairing_id) : ''
            activityLines.push(pairingId
              ? `A\t${r.crew_id}\t${r.code}\t${r.s}\t${r.e}\t${restEnd}\t${pairingId}`
              : `A\t${r.crew_id}\t${r.code}\t${r.s}\t${r.e}\t${restEnd}`)
          }
        }
        const emitted = await invokeRunBin('check-7507',
          ['--rp-start', String(startUtcSec), '--rp-end', String(endUtcSec), '--offset', String(offsetMin), '--do-start-min', String(doStart), '--emit-tsv'],
          [
            ...rules.map((rule) => rule.line),
            ...group.flatMap(({ crewId }) => qualLinesByCrew.get(crewId) ?? []),
            ...group.flatMap(({ crewId }) => teamLinesByCrew.get(crewId) ?? []),
            ...activityLines,
          ].join('\n'))
        for (const [crew, rpS, rpE, daysOff, minDo, period, unit] of emitted) {
          const matchedRule = rules.find((rule) => rule.period === period && rule.unit === unit)
          ordered.push({
            key: [instanceIndex, crewOrderIndex.get(crew) ?? Infinity, monthIndex],
            row: {
              crew_id: crew, pairing_id: daysOffAnchorPairingId(anchorByCrew.get(crew)), duty_seq: null,
              rule_code: '7507', rule_instance: inst.instance, scope_key: matchedRule?.scopeKey ?? `${period}${unit}`,
              start_dt: new Date(Number(rpS) * 1000).toISOString(), end_dt: new Date((Number(rpE) - 1) * 1000).toISOString(),
              ...calendarRpDisplayWindow(month.rpFrom, month.rpTo),
              severity: 1,
              actual_value: Number(daysOff), limit_value: Number(minDo), unit,
              message: withParamRowPrefix(matchedRule?.rowIndex ?? 0, `The number of days off(${daysOff}) must be at least ${minDo} in ${period} ${unit} (${month.rpFrom}, ${month.rpTo}).`),
            },
          })
        }
      }
    }
  }
  return ordered
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2])
    .map(({ row }) => row)
}

// ── Rule 7506 — ONE CHECKIN PER DAY (≤1 checked-group check-in per crew-local day) ─
// Resolves instance + the checked Assignments list from the rule set per instance (row 0).
// `source.checkins()` may return FLY pairings and ground rows (duty = assignment code).
// All D rows are forwarded; check-7506 filters by R.Assignments (structured R/D/Q/T).
export async function rule7506(source, ctx) {
  const instances = ctx.instancesOf(7506)
  if (!instances.length) { ctx.log('7506: no instances in rule set — skipped'); return [] }
  const validRows = []
  let needsQualRows = false
  let needsTeamMap = false
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    const rowCount = inst.rows?.length ?? 0
    for (const [rowIndex, row] of (inst.rows ?? []).entries()) {
      const ai = H('Assignments')
      const checkedRaw = String(ai >= 0 ? row[ai] ?? '' : '').trim()
      if (!checkedRaw) { ctx.log(`skip 7506/${inst.instance}: missing Assignments`); continue }
      const bases = fieldOrStar(row, H, 'Bases')
      const ranks = fieldOrStar(row, H, 'Ranks')
      const fleets = fieldOrStar(row, H, 'Fleets')
      const teams = fieldOrStar(row, H, 'Crew Teams')
      const hasQualScope = [bases, ranks, fleets].some(hasNonWildcard)
      if (hasQualScope) {
        if (!source.crewQualEntries) {
          ctx.log(`skip 7506/${inst.instance}: qualification filters=${bases}/${ranks}/${fleets} but source has no crew qualification data`)
          continue
        }
        needsQualRows = true
      }
      if (hasNonWildcard(teams)) {
        if (!source.crewTeams) {
          ctx.log(`skip 7506/${inst.instance}: Crew Teams=${teams} but source has no crew-team data`)
          continue
        }
        needsTeamMap = true
      }
      validRows.push({ inst, row, rowIndex, bases, ranks, fleets, teams, checkedRaw, sk: rowScopeKey(row, H, rowIndex, rowCount) })
    }
  }
  if (!validRows.length) return []
  const tzMap = source.crewBaseTimezone ? await source.crewBaseTimezone() : new Map()
  const checkins = await source.checkins()
  const qualRows = needsQualRows ? await source.crewQualEntries() : []
  const teamMap = needsTeamMap ? await source.crewTeams() : null
  const out = []
  for (const { checkedRaw, sk, inst, rowIndex, bases, ranks, fleets, teams } of validRows) {
    const lines = [['R', bases, ranks, fleets, teams, checkedRaw].map(cleanTsv).join('\t')]
    const byCrew = new Map()
    for (const q of qualRows ?? []) {
      const dim = String(q.dim ?? q.dimension ?? '').trim().toUpperCase()
      const tag = dim === 'B' || dim === 'BASE' ? 'BASE' : dim === 'R' || dim === 'RANK' ? 'RANK' : dim === 'F' || dim === 'FLEET' ? 'FLEET' : ''
      if (!tag || !qualOverlapsWindow(q, ctx)) continue
      const exp = q.exp ?? q.exp_date
      lines.push(['Q', q.crew_id, tag, q.value,
        dateOrdOrMinusOne(q.eff ?? q.eff_date),
        exp == null || String(exp).trim() === '' ? '-1' : dateOrdOrMinusOne(exp),
      ].map(cleanTsv).join('\t'))
    }
    if (teamMap) {
      for (const [crew, teamsForCrew] of teamMap) {
        for (const team of teamsForCrew ?? []) lines.push(['T', crew, team].map(cleanTsv).join('\t'))
      }
    }
    for (const r of checkins) {
      const duty = String(r.duty ?? r.assignment_group ?? r.assignment ?? 'FLY').trim().toUpperCase()
      const crew = String(r.crew_id)
      const start = Number(r.start_secs), end = Number(r.end_secs)
      const off = await offsetForDuty(source, crew, start, r.offset_min)
      lines.push(['D', crew, duty, start, end, off].map(cleanTsv).join('\t'))
      if (!byCrew.has(crew)) byCrew.set(crew, [])
      byCrew.get(crew).push({ pairingId: Number(r.pairing_id) || 0, start, off, duty })
    }
    const DAY = 24 * 3600
    const binRunner = ctx.runBin ?? runBin
    for (const [crew, dayStart, vStart, vEnd] of await binRunner('check-7506', ['--emit-tsv'], lines.join('\n'))) {
      const sameDay = (byCrew.get(crew) ?? [])
        .filter((p) => p.start - ((((p.start + p.off * 60) % DAY) + DAY) % DAY) === Number(dayStart))
        .sort((a, b) => a.start - b.start)
      const curr = sameDay[sameDay.length - 1]
      if (!curr) continue
      const zoneId = typeof source.resolveCrewTimezone === 'function'
        ? await source.resolveCrewTimezone(String(crew), Number(dayStart))
        : tzMap.get(String(crew))
      const dayYmd = zoneId
        ? localDateOf(Number(dayStart), zoneId)
        : localDateOf(Number(dayStart) + (curr.off ?? DEFAULT_OFFSET_MIN) * 60, 'UTC')
      const body7506 = renderRuleBody(LEGALITY_MESSAGES, '7506', { day: dayYmd })
      if (!body7506) throw new Error('7506 message template render failed')
      out.push({
        crew_id: crew, pairing_id: curr.pairingId, duty_seq: null,
        rule_code: '7506', rule_instance: inst.instance, scope_key: sk,
        start_dt: new Date(Number(vStart) * 1000).toISOString(), end_dt: new Date(Number(vEnd) * 1000).toISOString(), severity: 1,
        actual_value: null, limit_value: 1, unit: 'DAY',
        message: withParamRowPrefix(rowIndex, body7506),
      })
    }
  }
  return out
}

/** Local Night definition row [start, end, minInterval] from the rule set, or null. */
function localNight(ctx) {
  const inst = ctx.instancesOf(2014)[0]
  return inst?.rows?.[0] ?? null
}

/** Rule 2015 Start Time (minutes past local midnight). Missing/unparsable → 0 (today's paint). */
function rule2015StartTimeRaw(inst) {
  if (!inst?.rows?.[0]) return null
  const row = inst.rows[0]
  const H = headerIndexer(inst.header)
  for (const name of ['Start Time', 'DO Start Time']) {
    const i = H(name)
    if (i >= 0) return row[i]
  }
  return row[0]
}

export function doStartMin(ctx) {
  const inst = ctx.instancesOf?.(2015)?.[0]
  const raw = rule2015StartTimeRaw(inst)
  if (raw == null || String(raw).trim() === '') return 0
  try {
    const m = hhmmToMin(raw)
    return Number.isFinite(m) && m > 0 ? m : 0
  } catch {
    return 0
  }
}

/** Parse rule 2015 pipe-separated codes; `*` tokens are ignored. */
export function parse2015PipeCodes(raw) {
  if (raw == null || String(raw).trim() === '') return []
  return String(raw)
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s && s !== '*')
}

/**
 * Rule 2015 params for 1001 FLY→After grace only.
 * Both filter lists empty → doStartMin effective 0 for 1001.
 */
export function doStartGrace1001(ctx) {
  const inst = ctx.instancesOf?.(2015)?.[0]
  if (!inst?.rows?.[0]) return { doStartMin: 0, assignments: [], groups: [] }
  const H = headerIndexer(inst.header)
  const row = inst.rows[0]
  const assignments = parse2015PipeCodes(
    row[H('Assignments')] ?? row[H('ASSIGNMENTS')] ?? '',
  )
  const groups = parse2015PipeCodes(
    row[H('Assignment Groups')] ?? row[H('ASSIGNMENT GROUPS')] ?? '',
  )
  let startMin = doStartMin(ctx)
  if (assignments.length === 0 && groups.length === 0) startMin = 0
  return { doStartMin: startMin, assignments, groups }
}

// ── Rule 7501 — SDFD (≥ min single-days-free-from-duty in a rolling 168h window) ─
// Instance + the 2014 Local Night definition resolved from the rule set; no fallback arrays.
export async function rule7501(source, ctx) {
  const instances = ctx.instancesOf(7501)
  const night = localNight(ctx)
  if (!instances.length) { ctx.log('7501: no instances in rule set — skipped'); return [] }
  if (!night) { ctx.log('7501: 2014 Local Night definition missing — skipped'); return [] }
  const params = []
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    if (!inst.rows?.length) { ctx.log(`skip 7501/${inst.instance}: no param rows`); continue }
    for (const [rowIndex, row] of inst.rows.entries()) {
      const periodHours = parseInt(row[H('Period')], 10)
      const unit = fieldRaw(row, H, 'Unit', 'RH').toUpperCase()
      const bufferMin = hhmmToMin(fieldRaw(row, H, 'Duty End Buffer'))
      const minLimits = parseInt(row[H('Min Limits')], 10)
      if (!periodHours || !unit || Number.isNaN(bufferMin) || Number.isNaN(minLimits)) {
        ctx.log(`skip 7501/${inst.instance} row${rowIndex}: missing Period/Unit/Duty End Buffer/Min Limits`)
        continue
      }
      if (unit !== 'RH') {
        ctx.log(`skip 7501/${inst.instance} row${rowIndex}: Unit=${unit} (only RH supported)`)
        continue
      }
      const bases = fieldOrStar(row, H, 'Bases')
      const ranks = fieldOrStar(row, H, 'Ranks')
      const fleets = fieldOrStar(row, H, 'Fleets')
      const teams = fieldOrStar(row, H, 'Crew Teams')
      const needsQuals = [bases, ranks, fleets].some(hasNonWildcard)
      if (needsQuals && !source.crewQualEntries) {
        ctx.log(`skip 7501/${inst.instance} row${rowIndex}: qualification scope configured but source has no crew qualification data`)
        continue
      }
      if (hasNonWildcard(teams) && !source.crewTeams) {
        ctx.log(`skip 7501/${inst.instance} row${rowIndex}: Crew Teams=${teams} but source has no crew-team data`)
        continue
      }
      const rowId = params.length
      params.push({
        inst,
        rowId,
        rowIndex,
        bases,
        ranks,
        fleets,
        teams,
        p: {
          periodHours,
          unit,
          bufferMin,
          minLimits,
          nightStartMin: hhmmToMin(night[0]),
          nightEndMin: hhmmToMin(night[1]),
          minRestMin: hhmmToMin(night[2]),
        },
      })
    }
  }
  if (!params.length) return []
  const tzMap = source.crewBaseTimezone ? await source.crewBaseTimezone() : new Map()
  const fly = await source.flyDuties(false)
  const ground = await source.groundWork()
  const checkedEndSecs = epochSec(ctx.dateTo + 'T23:59:59Z')
  const needsQuals = params.some(({ bases, ranks, fleets }) => [bases, ranks, fleets].some(hasNonWildcard))
  const needsTeams = params.some(({ teams }) => hasNonWildcard(teams))
  const qualRows = needsQuals ? await source.crewQualEntries() : []
  const teamMap = needsTeams ? await source.crewTeams() : null
  const lines = params.map(({ rowId, bases, ranks, fleets, teams, p }) => [
    'R',
    rowId,
    bases,
    ranks,
    fleets,
    teams,
    p.periodHours,
    p.unit,
    p.bufferMin,
    p.minLimits,
  ].map(cleanTsv).join('\t'))
  for (const r of fly) {
    const crew = String(r.crew_id)
    const off = await offsetForDuty(source, crew, r.start_secs, r.offset_min)
    lines.push(['D', crew, r.pairing_id, r.start_secs, r.end_secs, off].map(cleanTsv).join('\t'))
  }
  for (const r of ground) {
    const crew = String(r.crew_id)
    const off = await offsetForDuty(source, crew, r.start_secs, r.offset_min)
    lines.push(['D', crew, 0, r.start_secs, r.end_secs, off].map(cleanTsv).join('\t'))
  }
  if (needsQuals) {
    for (const q of qualRows ?? []) {
      const dim = String(q.dim ?? q.dimension ?? '').trim().toUpperCase()
      const tag = dim === 'B' || dim === 'BASE' ? 'BASE'
        : dim === 'R' || dim === 'RANK' ? 'RANK'
          : dim === 'F' || dim === 'FLEET' ? 'FLEET' : ''
      if (!tag || !qualOverlapsWindow(q, ctx)) continue
      const exp = q.exp ?? q.exp_date
      lines.push(['Q', q.crew_id, tag, q.value,
        dateOrdOrMinusOne(q.eff ?? q.eff_date),
        exp == null || String(exp).trim() === '' ? '-1' : dateOrdOrMinusOne(exp),
      ].map(cleanTsv).join('\t'))
    }
  }
  if (teamMap) {
    for (const [crew, teams] of teamMap) {
      for (const team of teams ?? []) lines.push(['T', crew, team].map(cleanTsv).join('\t'))
    }
  }
  const out = []
  const binRunner = ctx.runBin ?? runBin
  const args = ['--emit-tsv', '--night-start-min', String(hhmmToMin(night[0])),
    '--night-end-min', String(hhmmToMin(night[1])), '--min-rest-min', String(hhmmToMin(night[2])),
    '--checked-end-secs', String(checkedEndSecs)]
  for (const f of ctx.focusIntervals ?? []) {
    const a = Number(f.startSecs), b = Number(f.endSecs)
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      args.push('--focus-start-secs', String(a), '--focus-end-secs', String(b))
    }
  }
  const focusCrewIds = [...new Set((ctx.focusCrewIds ?? []).map(String).filter(Boolean))]
  if (focusCrewIds.length > 0) args.push('--focus-crew-ids', focusCrewIds.join(','))
  for (const [rowIndex, crewId, ws, we, sdfd, lim, period, u, trig] of
    await binRunner('check-7501', args, lines.join('\n'))) {
    if (!trig || trig === '0') continue
    const matched = params.find((param) => param.rowId === Number(rowIndex) && param.p.periodHours === Number(period))
    if (!matched) continue
    const zoneId = tzMap.get(String(crewId))
    const w0 = formatDutyDateTime(Number(ws), zoneId)
    const w1 = formatDutyDateTime(Number(we), zoneId)
    out.push({
      crew_id: crewId, pairing_id: Number(trig), duty_seq: null,
      rule_code: '7501', rule_instance: matched.inst.instance, scope_key: `${rowIndex}:${period}${u}`,
      start_dt: new Date(Number(ws) * 1000).toISOString(), end_dt: new Date(Number(we) * 1000).toISOString(), severity: 1,
      actual_value: Number(sdfd), limit_value: Number(lim), unit: u,
      message: withParamRowPrefix(Number(rowIndex), `Single day free from duty (${sdfd}) must be at least ${lim} in ${period} ${u} (${w0} .. ${w1}).`),
    })
  }
  return out
}

// ── Rule 7508 — calendar-day SDFD variant ────────────────────────────────────
// Uses the same 7501 parameter shape and local-night definition, but the Rust
// kernel evaluates aligned crew-base-local calendar days. Unlike 7501, each
// FLY pairing is split to duty level and complete rest ground rows are included.
export async function rule7508(source, ctx) {
  const instances = ctx.instancesOf(7508)
  const night = localNight(ctx)
  if (!instances.length) { ctx.log('7508: no instances in rule set — skipped'); return [] }
  if (!night) { ctx.log('7508: 2014 Local Night definition missing — skipped'); return [] }

  const params = []
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    if (!inst.rows?.length) { ctx.log(`skip 7508/${inst.instance}: no param rows`); continue }
    for (const [rowIndex, row] of inst.rows.entries()) {
      const periodHours = parseInt(row[H('Period')], 10)
      const unit = fieldRaw(row, H, 'Unit', 'RH').toUpperCase()
      const dutyReport = boolYN(fieldRaw(row, H, 'Duty Report', 'Y'), true)
      const dutyRelease = boolYN(fieldRaw(row, H, 'Duty Release', 'Y'), true)
      const bufferMin = hhmmToMin(fieldRaw(row, H, 'Duty End Buffer'))
      const minLimits = parseInt(row[H('Min Limits')], 10)
      if (!periodHours || !unit || Number.isNaN(bufferMin) || Number.isNaN(minLimits)) {
        ctx.log(`skip 7508/${inst.instance} row${rowIndex}: missing Period/Unit/Duty End Buffer/Min Limits`)
        continue
      }
      if (unit !== 'RH' || periodHours % 24 !== 0) {
        ctx.log(`skip 7508/${inst.instance} row${rowIndex}: Unit=${unit} and Period=${periodHours} (only whole-day RH rows supported)`)
        continue
      }
      const bases = fieldOrStar(row, H, 'Bases')
      const ranks = fieldOrStar(row, H, 'Ranks')
      const fleets = fieldOrStar(row, H, 'Fleets')
      const teams = fieldOrStar(row, H, 'Crew Teams')
      const needsQuals = [bases, ranks, fleets].some(hasNonWildcard)
      if (needsQuals && !source.crewQualEntries) {
        ctx.log(`skip 7508/${inst.instance} row${rowIndex}: qualification scope configured but source has no crew qualification data`)
        continue
      }
      if (hasNonWildcard(teams) && !source.crewTeams) {
        ctx.log(`skip 7508/${inst.instance} row${rowIndex}: Crew Teams=${teams} but source has no crew-team data`)
        continue
      }
      params.push({
        inst,
        rowId: params.length,
        rowIndex,
        bases,
        ranks,
        fleets,
        teams,
        periodHours,
        unit,
        dutyReport,
        dutyRelease,
        bufferMin,
        minLimits,
      })
    }
  }
  if (!params.length) return []

  const tzMap = source.crewBaseTimezone ? await source.crewBaseTimezone() : new Map()
  const duties = await source.flyDuties(true)
  const ground = await source.groundWork(true)
  const checkedStartSecs = epochSec(`${ctx.dateFrom}T00:00:00Z`)
  const checkedEndSecs = epochSec(`${ctx.dateTo}T23:59:59Z`)
  const needsQuals = params.some(({ bases, ranks, fleets }) => [bases, ranks, fleets].some(hasNonWildcard))
  const needsTeams = params.some(({ teams }) => hasNonWildcard(teams))
  const qualRows = needsQuals ? await source.crewQualEntries() : []
  const teamMap = needsTeams ? await source.crewTeams() : null
  const lines = params.map(({ rowId, bases, ranks, fleets, teams, periodHours, unit, dutyReport, dutyRelease, bufferMin, minLimits }) => [
    'R', rowId, bases, ranks, fleets, teams, periodHours, unit, dutyReport, dutyRelease, bufferMin, minLimits,
  ].map(cleanTsv).join('\t'))

  for (const r of [...duties, ...ground]) {
    const crew = String(r.crew_id)
    const pairingId = Number(r.pairing_id) || 0
    const start = Number(r.start_secs)
    const end = Number(r.end_secs)
    const firstFlightDeparture = Number(r.first_flight_departure_secs ?? start)
    const lastFlightArrival = Number(r.last_flight_arrival_secs ?? end)
    const baseOffset = await offsetForDuty(source, crew, start, r.offset_min)
    const startRef = (r.offset_min != null && r.offset_min !== '' && Number.isFinite(Number(r.offset_min)))
      ? Number(r.offset_min) : baseOffset
    const endRef = (r.end_offset_min != null && r.end_offset_min !== '' && Number.isFinite(Number(r.end_offset_min)))
      ? Number(r.end_offset_min) : startRef
    const isRest = r.is_rest === true || r.is_rest === 1 || String(r.is_rest).toLowerCase() === 'true'
    const isPa = r.is_pre_assigned !== false && r.is_pre_assigned !== 0 && String(r.is_pre_assigned).toLowerCase() !== 'false'
    lines.push([
      'D', crew, pairingId, start, end, firstFlightDeparture, lastFlightArrival, baseOffset, startRef, endRef, isRest ? 1 : 0, isPa ? 1 : 0,
    ].map(cleanTsv).join('\t'))
  }
  if (needsQuals) {
    for (const q of qualRows ?? []) {
      const dim = String(q.dim ?? q.dimension ?? '').trim().toUpperCase()
      const tag = dim === 'B' || dim === 'BASE' ? 'BASE'
        : dim === 'R' || dim === 'RANK' ? 'RANK'
          : dim === 'F' || dim === 'FLEET' ? 'FLEET' : ''
      if (!tag || !qualOverlapsWindow(q, ctx)) continue
      const exp = q.exp ?? q.exp_date
      lines.push(['Q', q.crew_id, tag, q.value,
        dateOrdOrMinusOne(q.eff ?? q.eff_date),
        exp == null || String(exp).trim() === '' ? '-1' : dateOrdOrMinusOne(exp),
      ].map(cleanTsv).join('\t'))
    }
  }
  if (teamMap) {
    for (const [crew, teams] of teamMap) {
      for (const team of teams ?? []) lines.push(['T', crew, team].map(cleanTsv).join('\t'))
    }
  }

  const args = [
    '--emit-tsv',
    '--night-start-min', String(hhmmToMin(night[0])),
    '--night-end-min', String(hhmmToMin(night[1])),
    '--min-rest-min', String(hhmmToMin(night[2])),
    '--checked-start-secs', String(checkedStartSecs),
    '--checked-end-secs', String(checkedEndSecs),
  ]
  for (const f of ctx.focusIntervals ?? []) {
    const a = Number(f.startSecs), b = Number(f.endSecs)
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      args.push('--focus-start-secs', String(a), '--focus-end-secs', String(b))
    }
  }
  const focusCrewIds = [...new Set((ctx.focusCrewIds ?? []).map(String).filter(Boolean))]
  if (focusCrewIds.length > 0) args.push('--focus-crew-ids', focusCrewIds.join(','))

  const out = []
  const binRunner = ctx.runBin ?? runBin
  for (const [rowId, crewId, ws, we, sdfd, lim, period, unit, trig] of
    await binRunner('check-7508', args, lines.join('\n'))) {
    if (!trig || trig === '0') continue
    const matched = params.find((param) => param.rowId === Number(rowId) && param.periodHours === Number(period))
    if (!matched) continue
    const zoneId = typeof source.resolveCrewTimezone === 'function'
      ? await source.resolveCrewTimezone(String(crewId), Number(ws))
      : tzMap.get(String(crewId))
    const w0 = formatDutyDateTime(Number(ws), zoneId)
    const w1 = formatDutyDateTime(Number(we), zoneId)
    out.push({
      crew_id: crewId, pairing_id: Number(trig), duty_seq: null,
      rule_code: '7508', rule_instance: matched.inst.instance,
      scope_key: `${rowId}:${period}${unit}`,
      start_dt: new Date(Number(ws) * 1000).toISOString(),
      end_dt: new Date(Number(we) * 1000).toISOString(),
      window_start_dt: new Date(Number(ws) * 1000).toISOString(),
      window_end_dt: new Date(Number(we) * 1000).toISOString(),
      severity: 1, actual_value: Number(sdfd), limit_value: Number(lim), unit,
      message: withParamRowPrefix(matched.rowIndex ?? Number(rowId), `Single day free from duty (${sdfd}) must be at least ${lim} in ${period} ${unit} (${w0} .. ${w1}).`),
    })
  }
  return out
}

// ── Rule 7503 — LIMITS OF CONSECUTIVE WOCLs ──────────────────────────────────
// Instance + WOCL window + Max Consecutive + the 2014 definition resolved from the rule set.
export async function rule7503(source, ctx) {
  const instances = ctx.instancesOf(7503)
  const night = localNight(ctx)
  if (!instances.length) { ctx.log('7503: no instances in rule set — skipped'); return [] }
  if (!night) { ctx.log('7503: 2014 Local Night definition missing — skipped'); return [] }
  const params = []
  let needsQualRows = false
  let needsTeamMap = false
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    const rowCount = inst.rows?.length ?? 0
    for (const [rowIndex, row] of (inst.rows ?? []).entries()) {
      const maxConsecutive = parseInt(row[H('Max Consecutive WOCLs')], 10)
      if (!maxConsecutive) { ctx.log(`skip 7503/${inst.instance}: missing Max Consecutive WOCLs`); continue }
      const bases = fieldOrStar(row, H, 'Bases')
      const ranks = fieldOrStar(row, H, 'Ranks')
      const fleets = fieldOrStar(row, H, 'Fleets')
      const teams = fieldOrStar(row, H, 'Crew Teams')
      const hasQualScope = [bases, ranks, fleets].some(hasNonWildcard)
      if (hasQualScope) {
        if (!source.crewQualEntries) {
          ctx.log(`skip 7503/${inst.instance}: qualification filters=${bases}/${ranks}/${fleets} but source has no crew qualification data`)
          continue
        }
        needsQualRows = true
      }
      if (hasNonWildcard(teams)) {
        if (!source.crewTeams) {
          ctx.log(`skip 7503/${inst.instance}: Crew Teams=${teams} but source has no crew-team data`)
          continue
        }
        needsTeamMap = true
      }
      params.push({
        inst,
        row,
        rowIndex,
        H,
        bases,
        ranks,
        fleets,
        teams,
        sk: rowScopeKey(row, H, rowIndex, rowCount),
        p: { woclStartMin: hhmmToMin(row[H('WOCL Start')]), woclEndMin: hhmmToMin(row[H('WOCL End')]), maxConsecutive,
          nightStartMin: hhmmToMin(night[0]), nightEndMin: hhmmToMin(night[1]), minRestMin: hhmmToMin(night[2]) },
      })
    }
  }
  if (!params.length) return []
  const fly = await source.flyDuties(true)
  const ground = await source.groundWork()
  const qualRows = needsQualRows ? await source.crewQualEntries() : []
  const teamMap = needsTeamMap ? await source.crewTeams() : null
  const out = []
  for (const { inst, row, H, p, bases, ranks, fleets, teams, sk, rowIndex } of params) {
    const lines = [['R', bases, ranks, fleets, teams, p.woclStartMin, p.woclEndMin, p.maxConsecutive].map(cleanTsv).join('\t')]
    for (const q of qualRows ?? []) {
      const dim = String(q.dim ?? q.dimension ?? '').trim().toUpperCase()
      const tag = dim === 'B' || dim === 'BASE' ? 'BASE' : dim === 'R' || dim === 'RANK' ? 'RANK' : dim === 'F' || dim === 'FLEET' ? 'FLEET' : ''
      if (!tag || !qualOverlapsWindow(q, ctx)) continue
      const exp = q.exp ?? q.exp_date
      lines.push(['Q', q.crew_id, tag, q.value,
        dateOrdOrMinusOne(q.eff ?? q.eff_date),
        exp == null || String(exp).trim() === '' ? '-1' : dateOrdOrMinusOne(exp),
      ].map(cleanTsv).join('\t'))
    }
    if (teamMap) {
      for (const [crew, teamsForCrew] of teamMap) {
        for (const team of teamsForCrew ?? []) lines.push(['T', crew, team].map(cleanTsv).join('\t'))
      }
    }
    for (const r of fly) {
      const off = await offsetForDuty(source, r.crew_id, r.start_secs, r.offset_min)
      lines.push(['D', r.crew_id, r.pairing_id, r.start_secs, r.end_secs, off, 0].map(cleanTsv).join('\t'))
    }
    for (const r of ground) {
      const off = await offsetForDuty(source, r.crew_id, r.start_secs, r.offset_min)
      lines.push(['D', r.crew_id, '', r.start_secs, r.end_secs, off, 1].map(cleanTsv).join('\t'))
    }
    const binRunner = ctx.runBin ?? runBin
    for (const [crew, pairing, start, end, count] of
      await binRunner('check-7503', ['--emit-tsv', '--wocl-start-min', String(p.woclStartMin), '--wocl-end-min', String(p.woclEndMin),
        '--max-consecutive', String(p.maxConsecutive), '--night-start-min', String(p.nightStartMin),
        '--night-end-min', String(p.nightEndMin), '--min-rest-min', String(p.minRestMin)], lines.join('\n'))) {
      out.push({
        crew_id: crew, pairing_id: Number(pairing), duty_seq: null,
        rule_code: '7503', rule_instance: inst.instance, scope_key: sk,
        start_dt: new Date(Number(start) * 1000).toISOString(), end_dt: new Date(Number(end) * 1000).toISOString(), severity: 2,
        actual_value: Number(count), limit_value: p.maxConsecutive, unit: 'COUNT',
        message: withParamRowPrefix(rowIndex, `Concecutive WOCL duties(${count}) is more than the limitation(${p.maxConsecutive}).`),
      })
    }
  }
  return out
}

// ── Rule 7504 — SPACING RULE - WOCL (min rest between WOCL flight duties) ─────
// Instance + Min Period from the rule set; the WOCL window comes from 7503's instance (also in the set).
// Message dates = the two WOCL duties' duty_start calendar days in crew-base IANA zone (8056-style).
export async function rule7504(source, ctx) {
  const instances = ctx.instancesOf(7504)
  const wocl7503 = ctx.instancesOf(7503)[0]
  if (!instances.length) { ctx.log('7504: no instances in rule set — skipped'); return [] }
  if (!wocl7503) { ctx.log('7504: 7503 WOCL window missing — skipped'); return [] }
  const W = headerIndexer(wocl7503.header)
  const wRow = wocl7503.rows[0] ?? []
  const woclStartMin = hhmmToMin(wRow[W('WOCL Start')])
  const woclEndMin = hhmmToMin(wRow[W('WOCL End')])
  const tzMap = source.crewBaseTimezone ? await source.crewBaseTimezone() : new Map()
  const duties = await source.flyDuties(true)
  let qualRows = null
  let teamMap = null
  // gapStart = earlier duty end → look up that duty's start; pairing_id fallback if needed.
  const startByCrewEnd = new Map()
  const startByCrewPairing = new Map()
  for (const r of duties) {
    const crew = String(r.crew_id)
    const gapStart = Number(r.end_including_rest_secs ?? r.end_rest_secs ?? r.end_secs)
    startByCrewEnd.set(`${crew}\t${String(gapStart)}`, Number(r.start_secs))
    startByCrewEnd.set(`${crew}\t${String(r.end_secs)}`, Number(r.start_secs))
    startByCrewPairing.set(`${crew}\t${String(r.pairing_id)}`, Number(r.start_secs))
  }
  const out = []
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    for (const [rowIndex, row0] of (inst.rows ?? []).entries()) {
      const mp = parseInt(row0[H('Min Period')], 10)
      if (!mp) { ctx.log(`skip 7504/${inst.instance}: missing Min Period`); continue }
      const unit = fieldRaw(row0, H, 'Unit', 'RH').toUpperCase()
      if (unit !== 'RH' && unit !== 'CD') {
        ctx.log(`skip 7504/${inst.instance}: Unit=${unit} (only RH/CD supported)`)
        continue
      }
      const teams = fieldOrStar(row0, H, 'Crew Teams')
      if (hasNonWildcard(teams)) {
        if (!source.crewTeams) {
          ctx.log(`skip 7504/${inst.instance}: Crew Teams=${teams} but source has no crew-team data`)
          continue
        }
        if (teamMap == null) teamMap = await source.crewTeams()
      }
      const needsQuals = ['Bases', 'Ranks', 'Fleets'].some((name) => hasNonWildcard(fieldOrStar(row0, H, name)))
      if (needsQuals && !source.crewQualEntries) {
        ctx.log(`skip 7504/${inst.instance}: qualification filters configured but source has no crew qualification data`)
        continue
      }
      if (needsQuals && qualRows == null) qualRows = await source.crewQualEntries()
      const usePostRest = boolYN(fieldRaw(row0, H, 'Utilize Post Rest', 'N'), false) === 'Y'
      if (usePostRest && duties.some((r) => r.end_including_rest_secs == null && r.end_rest_secs == null)) {
        ctx.log(`skip 7504/${inst.instance}: Utilize Post Rest=Y but flyDuties lacks post-rest end data`)
        continue
      }
      const lines = [
        [
          'R',
          fieldOrStar(row0, H, 'Prev Assignment Group'),
          fieldOrStar(row0, H, 'Next Assignment Group'),
          fieldOrStar(row0, H, 'Prev Assignment'),
          fieldOrStar(row0, H, 'Next Assignment'),
          fieldOrStar(row0, H, 'Prev Attributes'),
          fieldOrStar(row0, H, 'Next Attributes'),
          boolYN(fieldRaw(row0, H, 'Apply Prelabelled Attributes', 'N'), false),
          usePostRest ? 'Y' : 'N',
          fieldOrStar(row0, H, 'Bases'),
          fieldOrStar(row0, H, 'Ranks'),
          fieldOrStar(row0, H, 'Fleets'),
          teams,
          fieldRaw(row0, H, 'Level', 'D').toUpperCase(),
          String(mp),
          unit,
          String(woclStartMin),
          String(woclEndMin),
        ].map(cleanTsv).join('\t'),
      ]
      for (const r of duties) {
        const crew = String(r.crew_id)
        const endIncludingRest = Number(r.end_including_rest_secs ?? r.end_rest_secs ?? r.end_secs)
        const off = await offsetForDuty(source, crew, r.start_secs, r.offset_min)
        lines.push([
          'D',
          crew,
          r.pairing_id,
          r.start_secs,
          r.end_secs,
          endIncludingRest,
          r.day_ord ?? dayOrdFromSecs(r.start_secs),
          off,
          r.assignment_group ?? 'FLY',
          r.assignment ?? '',
          r.attributes ?? '*',
          boolYN(r.is_pre_assigned, false),
        ].map(cleanTsv).join('\t'))
      }
      for (const q of qualRows ?? []) {
        const dim = String(q.dim ?? q.dimension ?? '').trim().toUpperCase()
        const tag = dim === 'B' || dim === 'BASE' ? 'BASE' : dim === 'R' || dim === 'RANK' ? 'RANK' : dim === 'F' || dim === 'FLEET' ? 'FLEET' : ''
        if (!tag) continue
        lines.push([
          'Q',
          q.crew_id,
          tag,
          q.value,
          dateOrdOrMinusOne(q.eff ?? q.eff_date),
          dateOrdOrMinusOne(q.exp ?? q.exp_date),
        ].map(cleanTsv).join('\t'))
      }
      if (teamMap) {
        for (const [crew, teamsForCrew] of teamMap) {
          for (const team of teamsForCrew ?? []) lines.push(['T', crew, team].map(cleanTsv).join('\t'))
        }
      }
      const binArgs = [
        '--emit-tsv',
        '--min-period', String(mp),
        '--wocl-start-min', String(woclStartMin),
        '--wocl-end-min', String(woclEndMin),
      ]
      if (unit === 'CD') binArgs.push('--unit', 'CD')
      const binRunner = ctx.runBin ?? runBin
      for (const [crewId, pairingId, gapStart, gapEnd, , actual] of
        await binRunner('check-7504', binArgs, lines.join('\n'))) {
        const crew = String(crewId)
        const duty1Start = startByCrewEnd.get(`${crew}\t${String(gapStart)}`)
          ?? startByCrewPairing.get(`${crew}\t${String(pairingId)}`)
          ?? Number(gapStart)
        const duty2Start = Number(gapEnd)
        const zoneId = typeof source.resolveCrewTimezone === 'function'
          ? await source.resolveCrewTimezone(crew, duty1Start)
          : (tzMap.get(crew) ?? 'UTC')
        const d1 = localDateOf(duty1Start, zoneId)
        const d2 = localDateOf(duty2Start, zoneId)
        if (unit === 'CD') {
          const actualDays = Number(actual)
          out.push({
            crew_id: crewId, pairing_id: Number(pairingId), duty_seq: null,
            rule_code: '7504', rule_instance: inst.instance, scope_key: scopeKeyOf(row0, H),
            start_dt: new Date(Number(gapStart) * 1000).toISOString(), end_dt: new Date(Number(gapEnd) * 1000).toISOString(), severity: 2,
            actual_value: actualDays, limit_value: mp, unit: 'DAY',
            message: withParamRowPrefix(rowIndex, `Rest between consecutive WOCL flight duties (${d1}, ${d2}) is ${actualDays} less than ${mp} CD.`),
          })
        } else {
          const gapHHMM = formatMinutesHHMM(Number(actual))
          out.push({
            crew_id: crewId, pairing_id: Number(pairingId), duty_seq: null,
            rule_code: '7504', rule_instance: inst.instance, scope_key: scopeKeyOf(row0, H),
            start_dt: new Date(Number(gapStart) * 1000).toISOString(), end_dt: new Date(Number(gapEnd) * 1000).toISOString(), severity: 2,
            actual_value: Math.round((Number(actual) / 60) * 100) / 100, limit_value: mp, unit: 'HOUR',
            message: withParamRowPrefix(rowIndex, `Rest between consecutive WOCL flight duties (${d1}, ${d2}) is ${gapHHMM} less than ${mp} RH.`),
          })
        }
      }
    }
  }
  return out
}

export const RULES = [rule1001, rule8002, rule8056, rule8071, rule8072, rule7509, rule8030, rule8004, rule7305, rule7505, rule7507, rule7506, rule7501, rule7508, rule7503, rule7504]

/** Rule function code a rule fn computes (e.g. rule8002 → '8002'). */
export const ruleCodeOf = (fn) => fn.name.replace(/^rule/, '')

/**
 * Run the rule engine and collect violation rows.
 * @param onlyCodes optional Set/Array of rule codes (e.g. ['8002']) to limit the recompute
 *   to a subset — used by the scoped recheck so a single-rule param change doesn't recompute
 *   all 9 rules. Omit/empty → run the whole group (default, e.g. scenario recompute).
 */
export async function computeViolations(source, ctx, onlyCodes) {
  source = memoizeSource(source)
  const only = onlyCodes && onlyCodes.length ? new Set([...onlyCodes].map(String)) : null
  const rules = only ? RULES.filter((r) => only.has(ruleCodeOf(r))) : RULES
  // Resolve the context's OWN rule set once (by ruleset_id); expose function→instances + a log.
  const setRules = await resolveRulesetRules(source.db, ctx.rulesetId)
  const byFunction = new Map()
  for (const r of setRules) {
    if (!byFunction.has(r.function)) byFunction.set(r.function, [])
    byFunction.get(r.function).push({ instance: r.instance, header: r.header, rows: r.rows })
  }
  ctx.byFunction = byFunction
  ctx.instancesOf = (fn) => byFunction.get(Number(fn)) ?? []
  ctx.log = ctx.log ?? ((m) => console.error(`[recheck] ${m}`))
  const all = []
  const profile = !!process.env.RECHECK_PROFILE
  for (const rule of rules) {
    const t0 = profile ? Date.now() : 0
    const rows = await rule(source, ctx)
    if (profile) console.error(`[recheck-profile] ${rule.name}: ${Date.now() - t0}ms, ${rows.length} rows`)
    // all.push(...rows) overflows the call stack when a rule returns >~125k rows (spread
    // creates one call argument per element — rule1001 can emit 100k+ overlap rows on a
    // busy 4-month window). Append with a loop so large result sets never blow the stack.
    for (const r of rows) all.push(r)
  }
  return applyRulesetSeverity(all, setRules)
}
