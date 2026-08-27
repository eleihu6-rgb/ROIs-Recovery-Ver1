// verify-rule-batch-parity.mjs — real-data deep-equal gate for the batched 7505/7507/7305 spawns.
//
//   npm run verify:rule-batch-parity   (worksets 103 P June 2026 + 637 C full-year 2026)
//
// Runs the PRE-change per-crew algorithms (embedded as reference) and the batched rule
// functions against the same liveSource on the remote DB authority (§Remote-DB-Only), and
// asserts the two violation arrays are deep-equal INCLUDING row order. The identity `id`
// sequence on rule_violation is decided by insertion order, so order is part of the contract.
//
//   node scripts/verify-rule-batch-parity.mjs --group 103 --from 2026-06-01 --to 2026-07-01 --division P

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import process from 'node:process'
import pg from 'pg'

const databaseUrl = (process.env.DATABASE_URL_F8 || process.env.DATABASE_URL || '').trim()
if (!databaseUrl) throw new Error('Missing DATABASE_URL_F8 (or DATABASE_URL) for the remote PostgreSQL gate.')
if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(databaseUrl)) {
  throw new Error('Refusing to verify against a local database (§Remote-DB-Only).')
}
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const GROUP = String(arg('--group', '103'))
const FROM = String(arg('--from', '2026-06-01'))
const TO = String(arg('--to', '2026-07-01'))
// live-legality.mjs reads --division from process.argv at module load; forward it so the
// source adapter matches the workset's division exactly as the real recheck would.
if (!process.argv.includes('--division')) process.argv.push('--division', String(arg('--division', 'P')))

const { liveSource, applySchemas } = await import('./live-legality.mjs')
const core = await import('./legality-recheck-core.mjs')
const rpWindow = await import('./legality-rp-window.mjs')

const {
  rule7505, rule7507, rule7305, resolveRulesetRules, runBin, DEFAULT_OFFSET_MIN,
  pickDaysOffAnchor, daysOffAnchorPairingId, resolveDaysOffRpBounds, doStartMin,
  withParamRowPrefix, headerIndexer, cleanTsv, fieldOrStar, hasNonWildcard,
  qualOverlapsWindow, dateOrdOrMinusOne, offsetForDuty, resolveCrewOffsetOrFallback,
} = core
const { listInclusiveCalendarMonths, crewLocalRpWindowUtc, calendarRpDisplayWindow } = rpWindow

// Replicate the module-private hashedScopeKey exactly so the legacy 7305 reference emits the
// same scope_key as the batched rule (deep-equal would otherwise fail on scope_key).
const hashedScopeKey = (prefix, cells) =>
  `${prefix}:${createHash('sha1').update(cells.join('\u001f')).digest('hex').slice(0, 8)}`

// ── Legacy per-crew reference implementations (pre-batching) ─────────────────────────────
async function legacy7505(source, ctx) {
  const instances = ctx.instancesOf(7505)
  const validInstances = []
  let needsTeamMap = false
  let needsQualRows = false
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    const ix = (n) => H(n)
    const [iMin, iRp, iLeaveR, iBlank, iPostRest, iLeaveA, iPeriod, iUnit, iLayover] =
      ['Min DO', 'RP Days Range', 'Leave Days Range', 'Count Blank Day', 'Utilize Post Duty Rest', 'Leave Assignments', 'Period', 'Unit', 'Count Layover'].map(ix)
    if (iMin < 0 || iRp < 0) continue
    const rules = []
    for (const [rowIndex, r] of (inst.rows ?? []).entries()) {
      const bases = fieldOrStar(r, H, 'Bases')
      const ranks = fieldOrStar(r, H, 'Ranks')
      const fleets = fieldOrStar(r, H, 'Fleets')
      const teams = fieldOrStar(r, H, 'Crew Teams')
      const hasQualScope = [bases, ranks, fleets].some(hasNonWildcard)
      if (hasQualScope && !source.crewQualEntries) continue
      if (hasNonWildcard(teams) && !source.crewTeams) continue
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
        line, rowIndex,
        period: String(r[iPeriod] ?? '').trim(), unit: String(r[iUnit] ?? '').trim(),
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
  for (const { inst, rules } of validInstances) {
    for (const [crewId, rows] of assignmentsByCrew) {
      for (const month of rpMonths) {
        const dayStartUtcSecs = Math.floor(new Date(`${month.rpFrom}T00:00:00Z`).getTime() / 1000)
        const offsetMin = await resolveCrewOffsetOrFallback(source, crewId, dayStartUtcSecs, fallbackOffsets)
        const { startUtcSec, endUtcSec } = crewLocalRpWindowUtc(month.rpFrom, month.rpTo, offsetMin)
        const anchorRow = pickDaysOffAnchor(rows, startUtcSec, endUtcSec)
        if (!anchorRow) continue
        const activityLines = rows.map((r) => {
          const restEnd = r.end_rest_secs ?? r.r ?? r.rest_start_secs ?? r.e
          const pairingId = r.pairing_id != null && Number(r.pairing_id) > 0 ? String(r.pairing_id) : ''
          return pairingId
            ? `A\t${r.crew_id}\t${r.code}\t${r.s}\t${r.e}\t${restEnd}\t${pairingId}`
            : `A\t${r.crew_id}\t${r.code}\t${r.s}\t${r.e}\t${restEnd}`
        })
        for (const [crew, rpS, rpE, daysOff, minDo, period, unit] of
          await invokeRunBin('check-7505', ['--rp-start', String(startUtcSec), '--rp-end', String(endUtcSec), '--offset', String(offsetMin), '--do-start-min', String(doStart), '--emit-tsv'], [
            ...rules.map((rule) => rule.line),
            ...(qualLinesByCrew.get(crewId) ?? []),
            ...(teamLinesByCrew.get(crewId) ?? []),
            ...activityLines,
          ].join('\n'))) {
          const matchedRule = rules.find((rule) => rule.period === period && rule.unit === unit)
          out.push({
            crew_id: crew, pairing_id: daysOffAnchorPairingId(anchorRow), duty_seq: null,
            rule_code: '7505', rule_instance: inst.instance, scope_key: matchedRule?.scopeKey ?? `${period}${unit}`,
            start_dt: new Date(Number(rpS) * 1000).toISOString(), end_dt: new Date((Number(rpE) - 1) * 1000).toISOString(),
            ...calendarRpDisplayWindow(month.rpFrom, month.rpTo),
            severity: 1,
            actual_value: Number(daysOff), limit_value: Number(minDo), unit,
            message: withParamRowPrefix(matchedRule?.rowIndex ?? 0, `The number of days off(${daysOff}) must be at least ${minDo} in ${period} ${unit} (${month.rpFrom}, ${month.rpTo}).`),
          })
        }
      }
    }
  }
  return out
}

async function legacy7507(source, ctx) {
  const instances = ctx.instancesOf(7507)
  const validInstances = []
  let needsTeamMap = false
  let needsQualRows = false
  for (const inst of instances) {
    const H = headerIndexer(inst.header)
    const ix = (n) => H(n)
    const [iMin, iRp, iLeaveR, iBlank, iPostRest, iLeaveA, iPeriod, iUnit, iFlyR, iFlyA, iResR, iResA, iLayover] =
      ['Min DO', 'RP Days Range', 'Leave Days Range', 'Count Blank Day', 'Utilize Post Duty Rest', 'Leave Assignments', 'Period', 'Unit',
        'NUM FLY DAY', 'FLY ASSIGNMENTS', 'NUM RESERVES', 'RES ASSIGNMENTS', 'Count Layover'].map(ix)
    if (iMin < 0 || iRp < 0 || iFlyR < 0 || iResR < 0) continue
    const rules = []
    for (const [rowIndex, r] of (inst.rows ?? []).entries()) {
      const bases = fieldOrStar(r, H, 'Bases')
      const ranks = fieldOrStar(r, H, 'Ranks')
      const fleets = fieldOrStar(r, H, 'Fleets')
      const teams = fieldOrStar(r, H, 'Crew Teams')
      const hasQualScope = [bases, ranks, fleets].some(hasNonWildcard)
      if (hasQualScope && !source.crewQualEntries) continue
      if (hasNonWildcard(teams) && !source.crewTeams) continue
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
        line, rowIndex,
        period: String(r[iPeriod] ?? '').trim(), unit: String(r[iUnit] ?? '').trim(),
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
  for (const { inst, rules } of validInstances) {
    for (const [crewId, rows] of assignmentsByCrew) {
      for (const month of rpMonths) {
        const dayStartUtcSecs = Math.floor(new Date(`${month.rpFrom}T00:00:00Z`).getTime() / 1000)
        const offsetMin = await resolveCrewOffsetOrFallback(source, crewId, dayStartUtcSecs, fallbackOffsets)
        const { startUtcSec, endUtcSec } = crewLocalRpWindowUtc(month.rpFrom, month.rpTo, offsetMin)
        const anchorRow = pickDaysOffAnchor(rows, startUtcSec, endUtcSec)
        if (!anchorRow) continue
        const activityLines = rows.map((r) => {
          const restEnd = r.end_rest_secs ?? r.r ?? r.rest_start_secs ?? r.e
          const pairingId = r.pairing_id != null && Number(r.pairing_id) > 0 ? String(r.pairing_id) : ''
          return pairingId
            ? `A\t${r.crew_id}\t${r.code}\t${r.s}\t${r.e}\t${restEnd}\t${pairingId}`
            : `A\t${r.crew_id}\t${r.code}\t${r.s}\t${r.e}\t${restEnd}`
        })
        for (const [crew, rpS, rpE, daysOff, minDo, period, unit] of
          await invokeRunBin('check-7507', ['--rp-start', String(startUtcSec), '--rp-end', String(endUtcSec), '--offset', String(offsetMin), '--do-start-min', String(doStart), '--emit-tsv'], [
            ...rules.map((rule) => rule.line),
            ...(qualLinesByCrew.get(crewId) ?? []),
            ...(teamLinesByCrew.get(crewId) ?? []),
            ...activityLines,
          ].join('\n'))) {
          const matchedRule = rules.find((rule) => rule.period === period && rule.unit === unit)
          out.push({
            crew_id: crew, pairing_id: daysOffAnchorPairingId(anchorRow), duty_seq: null,
            rule_code: '7507', rule_instance: inst.instance, scope_key: matchedRule?.scopeKey ?? `${period}${unit}`,
            start_dt: new Date(Number(rpS) * 1000).toISOString(), end_dt: new Date((Number(rpE) - 1) * 1000).toISOString(),
            ...calendarRpDisplayWindow(month.rpFrom, month.rpTo),
            severity: 1,
            actual_value: Number(daysOff), limit_value: Number(minDo), unit,
            message: withParamRowPrefix(matchedRule?.rowIndex ?? 0, `The number of days off(${daysOff}) must be at least ${minDo} in ${period} ${unit} (${month.rpFrom}, ${month.rpTo}).`),
          })
        }
      }
    }
  }
  return out
}

async function legacy7305(source, ctx) {
  const instances = ctx.instancesOf(7305)
  if (!instances.length || !source.crewQualEntries || !source.crewOffsets
    || (!source.rosterDuties && (!source.flyDuties || !source.groundWork))) return []
  const params = []
  let needsQuals = false
  let needsTeams = false
  for (const inst of instances) {
    if (!inst.rows?.length) continue
    for (const [rowIndex, row] of (inst.rows ?? []).entries()) {
      const cells = Array.isArray(row) ? row.map((value) => String(value ?? '').trim()) : []
      if (cells.length !== 12 || (inst.header ?? []).length !== 12
        || String(inst.header?.[4] ?? '').trim().toUpperCase() !== 'CREW TEAMS') continue
      if (!['T', 'D'].includes(cells[9].toUpperCase())) continue
      if (!/^-?\d+$/.test(cells[10]) || !/^-?\d+$/.test(cells[11])) continue
      if ([0, 1, 2, 3].some((index) => hasNonWildcard(cells[index]))) needsQuals = true
      if (hasNonWildcard(cells[4])) needsTeams = true
      params.push({ inst, cells, rowIndex, scopeKey: hashedScopeKey(`r${params.length}`, cells) })
    }
  }
  if (!params.length) return []
  const fallbackOffsets = typeof source.resolveCrewOffset === 'function'
    ? null
    : (source.crewOffsets ? await source.crewOffsets() : new Map())
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
  for (const [crew, duties] of byCrew) {
    const starts = duties.map((line) => Number(line.split('\t')[4])).filter(Number.isFinite)
    const ends = duties.map((line) => Number(line.split('\t')[6])).filter(Number.isFinite)
    if (!starts.length || !ends.length) continue
    const checkedStart = Math.min(...starts)
    const checkedEnd = Math.max(...ends)
    const lines = [
      ['C', checkedStart, checkedEnd, 'editor'].join('\t'),
      ...params.map((p, index) => ['R', index, ...p.cells].map(cleanTsv).join('\t')),
      ...qualLines.filter((line) => line.split('\t')[1] === crew),
      ...teamLines.filter((line) => line.split('\t')[1] === crew),
      ...groupLines,
      ...duties,
    ]
    for (const cols of await invokeRunBin('check-7305', ['--emit-tsv'], lines.join('\n'))) {
      if (cols[0] !== 'V' || cols.length < 10) continue
      const rowIndex = Number(cols[2])
      const matched = params[rowIndex]
      if (!matched) continue
      out.push({
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
      })
    }
  }
  return out
}
// Replicate legality-recheck-core.mjs boolYN verbatim so the D-line flags match the real
// recheck exactly (textual YES/TRUE/NO must map correctly, not just '1'/'Y').
function boolYN(value, fallback = false) {
  const s = String(value ?? '').trim().toUpperCase()
  if (['Y', 'YES', 'TRUE', '1'].includes(s)) return 'Y'
  if (['N', 'NO', 'FALSE', '0'].includes(s)) return 'N'
  return fallback ? 'Y' : 'N'
}

// ── Main ────────────────────────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: databaseUrl })
try {
  await client.connect()
  const rawQuery = client.query.bind(client)
  client.query = (queryConfig, values, callback) => {
    if (typeof queryConfig === 'string') return rawQuery(applySchemas(queryConfig), values, callback)
    if (queryConfig && typeof queryConfig.text === 'string') {
      return rawQuery({ ...queryConfig, text: applySchemas(queryConfig.text) }, values, callback)
    }
    return rawQuery(queryConfig, values, callback)
  }

  const source = liveSource(client, FROM, TO)
  const setRules = await resolveRulesetRules(client, Number(GROUP))
  const byFunction = new Map()
  for (const r of setRules) {
    if (!byFunction.has(r.function)) byFunction.set(r.function, [])
    byFunction.get(r.function).push({ instance: r.instance, header: r.header, rows: r.rows })
  }
  const ctx = {
    ruleGroupCode: GROUP, rulesetId: Number(GROUP),
    dateFrom: FROM, dateTo: TO,
    byFunction,
    instancesOf: (fn) => byFunction.get(Number(fn)) ?? [],
    log: (m) => console.error(`[parity] ${m}`),
  }

  const results = []
  for (const [code, batched, legacy] of [
    ['7505', rule7505, legacy7505],
    ['7507', rule7507, legacy7507],
    ['7305', rule7305, legacy7305],
  ]) {
    const t0 = Date.now()
    const batchedOut = await batched(source, ctx)
    const legacyOut = await legacy(source, ctx)
    try {
      assert.deepEqual(batchedOut, legacyOut)
      results.push(`PASS rule ${code} (${batchedOut.length} rows, deep-equal with legacy; ${Date.now() - t0}ms)`)
    } catch (error) {
      throw new Error(`FAIL rule ${code}: batched vs legacy differ\n${error.message}`)
    }
  }
  console.log(`PASS rule-7505/7507/7305 batch parity (workset ${GROUP}, division ${arg('--division', 'P')}, ${FROM}..${TO}):`)
  for (const line of results) console.log(`  ${line}`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`rule-7505/7507/7305 batch parity failed: ${message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}