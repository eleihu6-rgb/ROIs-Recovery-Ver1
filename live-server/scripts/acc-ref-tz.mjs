import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ACC_REF_BIN = path.resolve(__dirname, '../../rule-engine-rs/target/release/check-7500-ref')

const dutyKey = (crewId, pairingId, dutySeq) => `${crewId}|${pairingId}|${dutySeq}`

const offsetAt = (date, zoneId) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zoneId || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date)
    const get = (type) => Number(parts.find((part) => part.type === type)?.value ?? '0')
    const hour = get('hour') === 24 ? 0 : get('hour')
    const localAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
    return Math.round((localAsUtc - date.getTime()) / 60_000)
  } catch {
    return 0
  }
}

export const buildAccRefUpdates = (rows, params, runner = runAccRefTz) => {
  const byCrew = new Map()
  for (const row of rows) {
    const startUtc = Math.floor(new Date(row.start_utc).getTime() / 1000)
    const endUtc = Math.floor(new Date(row.end_utc).getTime() / 1000)
    if (!row.crew_id || !Number.isFinite(startUtc) || !Number.isFinite(endUtc) || endUtc < startUtc) continue
    const crewId = String(row.crew_id)
    const duties = byCrew.get(crewId) ?? new Map()
    const duty = {
      pairingId: Number(row.pairing_id),
      dutySeq: Number(row.duty_seq),
      startUtc,
      endUtc,
      depTzMin: Number.isFinite(Number(row.dep_tz_min))
        ? Number(row.dep_tz_min)
        : offsetAt(new Date(row.start_utc), row.dep_zone_id),
      arrTzMin: Number.isFinite(Number(row.arr_tz_min))
        ? Number(row.arr_tz_min)
        : offsetAt(new Date(row.end_utc), row.arr_zone_id),
    }
    const key = dutyKey(crewId, duty.pairingId, duty.dutySeq)
    if (!duties.has(key)) duties.set(key, duty)
    byCrew.set(crewId, duties)
  }
  const input = [...byCrew.entries()]
    .map(([crewId, duties]) => ({
      crewId,
      duties: [...duties.values()].sort((a, b) =>
        a.startUtc - b.startUtc || a.endUtc - b.endUtc || a.pairingId - b.pairingId || a.dutySeq - b.dutySeq),
    }))
    .sort((a, b) => a.crewId.localeCompare(b.crewId))
  const refs = runner(input, params)
  return rows.flatMap((row) => {
    const ref = refs.get(dutyKey(String(row.crew_id), Number(row.pairing_id), Number(row.duty_seq)))
    const normalized = typeof ref === 'number' ? { duty_ref_tz: ref, duty_end_ref_tz: ref } : ref
    return normalized == null ? [] : [{
      crew_id: String(row.crew_id),
      pairing_id: Number(row.pairing_id),
      duty_seq: Number(row.duty_seq),
      duty_ref_tz: normalized.duty_ref_tz,
      duty_end_ref_tz: normalized.duty_end_ref_tz,
    }]
  })
}

const runAccRefTz = (input, params) => {
  const lines = input.flatMap((crew) => crew.duties.map((duty) => [
    crew.crewId,
    duty.pairingId,
    duty.dutySeq,
    duty.startUtc,
    duty.endUtc,
    duty.depTzMin,
    duty.arrTzMin,
  ].join('\t')))
  if (lines.length === 0) return new Map()
  const result = spawnSync(ACC_REF_BIN, [
    '--stay-per-min', String(params.stayPerMin),
    '--adjust-min', String(params.adjustMin),
    '--emit-tsv',
  ], {
    input: lines.join('\n'),
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
  if (result.error?.code === 'ENOENT' || !fs.existsSync(ACC_REF_BIN)) {
    throw new Error(
      `check-7500-ref binary missing at ${ACC_REF_BIN} (ENOENT). ` +
      `Deploy it via deploy/sit/deploy.sh rust-bins, or: cargo build --release --bin check-7500-ref`,
    )
  }
  if (result.status !== 0) {
    throw new Error(`check-7500-ref exited ${result.status}: ${result.stderr || result.error || 'unknown error'}`)
  }
  const refs = new Map()
  for (const line of result.stdout.split('\n').map((value) => value.trim()).filter(Boolean)) {
    const [crewId, pairingId, dutySeq, refTz, dutyEndRefTz] = line.split('\t')
    const parsed = Number(refTz)
    const parsedEnd = Number(dutyEndRefTz ?? refTz)
    if (crewId && Number.isFinite(parsed) && Number.isFinite(parsedEnd)) {
      refs.set(dutyKey(crewId, Number(pairingId), Number(dutySeq)), {
        duty_ref_tz: parsed,
        duty_end_ref_tz: parsedEnd,
      })
    }
  }
  return refs
}

const parseHm = (value) => {
  const match = String(value ?? '').match(/^(\d+):(\d{2})$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export const refParamsFromJson = (paramJson) => {
  if (!paramJson || typeof paramJson !== 'object' || !Array.isArray(paramJson.tables) || paramJson.tables.length < 2) return null
  const table = paramJson.tables[1]
  if (!table || !Array.isArray(table.header) || !Array.isArray(table.rows) || !Array.isArray(table.rows[0])) return null
  const stay = table.header.findIndex((value) => String(value).toLowerCase() === 'stay duration per x hours')
  const adjust = table.header.findIndex((value) => String(value).toLowerCase() === 'acc time zone adjust x hours')
  const stayPerMin = parseHm(table.rows[0][stay])
  const adjustMin = parseHm(table.rows[0][adjust])
  return stayPerMin == null || adjustMin == null ? null : { stayPerMin, adjustMin }
}

export const load7500Params = async (db, liveSchema, rulesetId) => {
  const result = await db.query(
    `select r.param_json
       from ${liveSchema}.rule_set rs
       join ${liveSchema}.rule r on r.rule_id = rs.rule_id
      where rs.workset_id = $1 and r.function = 7500
      order by r.instance limit 1`,
    [rulesetId],
  )
  return refParamsFromJson(result.rows[0]?.param_json)
}

export const loadAccRefRows = async (db, {
  rosterTable,
  pairingSegmentTable,
  airportTable,
  pairingSegmentWhereSql = '',
  /** Optional live pairing_segment table — used when scenario segments are missing (live-backed pairings). */
  livePairingSegmentTable = null,
  whereSql = '',
  values = [],
}) => {
  const liveJoin = livePairingSegmentTable
    ? `left join ${livePairingSegmentTable} lps
          on lps.pairing_id = rf.pairing_id
         and lps.duty_seq = rf.duty_seq
         and lps.seg_seq = rf.seg_seq
         and coalesce(lps.is_deleted, 0) = 0`
    : ''
  const depArp = livePairingSegmentTable
    ? `coalesce(nullif(rf.dep_arp, ''), nullif(ps.dep_arp, ''), nullif(lps.dep_arp, ''))`
    : `coalesce(nullif(rf.dep_arp, ''), nullif(ps.dep_arp, ''))`
  const arvArp = livePairingSegmentTable
    ? `coalesce(nullif(rf.arv_arp, ''), nullif(ps.arv_arp, ''), nullif(lps.arv_arp, ''))`
    : `coalesce(nullif(rf.arv_arp, ''), nullif(ps.arv_arp, ''))`
  const result = await db.query(
    `with duty_rows as (
       select rf.crew_id, rf.pairing_id, rf.duty_seq,
              min(coalesce(rf.act_str_dt_utc, rf.sch_str_dt_utc)) as start_utc,
              max(coalesce(rf.act_end_dt_utc, rf.sch_end_dt_utc)) as end_utc,
              (array_agg(${depArp}
                 order by rf.sch_str_dt_utc, rf.seg_seq))[1] as dep_arp,
              (array_agg(${arvArp}
                 order by rf.sch_end_dt_utc desc, rf.seg_seq desc))[1] as arr_arp
         from ${rosterTable} rf
         left join ${pairingSegmentTable} ps
          on ps.pairing_id = rf.pairing_id and ps.duty_seq = rf.duty_seq
          and ps.seg_seq = rf.seg_seq and ps.is_deleted = 0 ${pairingSegmentWhereSql}
         ${liveJoin}
        where ${whereSql} rf.is_deleted = 0
          and rf.pairing_id is not null and rf.assignment_group = 'FLY'
        group by rf.crew_id, rf.pairing_id, rf.duty_seq
     )
     select d.crew_id, d.pairing_id, d.duty_seq, d.start_utc, d.end_utc,
            coalesce(dep.zone_id, 'UTC') as dep_zone_id,
            coalesce(arr.zone_id, 'UTC') as arr_zone_id
       from duty_rows d
       left join ${airportTable} dep on dep.airport = d.dep_arp
       left join ${airportTable} arr on arr.airport = d.arr_arp
      order by d.crew_id, d.start_utc, d.end_utc, d.pairing_id, d.duty_seq`,
    values,
  )
  return result.rows
}

export const persistAccRef = async (db, {
  rosterTable,
  whereSql = '',
  values = [],
  resetWhereSql = whereSql,
}, updates) => {
  await db.query(
    `update ${rosterTable} rf set duty_ref_tz = null, duty_end_ref_tz = null
      where ${resetWhereSql} rf.is_deleted = 0
        and rf.pairing_id is not null and rf.assignment_group = 'FLY'`,
    values,
  )
  if (updates.length === 0) return
  const n = values.length
  await db.query(
    `update ${rosterTable} rf set duty_ref_tz = refs.ref,
                                  duty_end_ref_tz = refs.end_ref
       from unnest($${n + 1}::varchar[], $${n + 2}::bigint[],
                   $${n + 3}::smallint[], $${n + 4}::integer[],
                   $${n + 5}::integer[])
            as refs(crew_id, pairing_id, duty_seq, ref, end_ref)
      where ${whereSql} rf.is_deleted = 0 and rf.pairing_id is not null
        and rf.crew_id = refs.crew_id and rf.pairing_id = refs.pairing_id
        and rf.duty_seq = refs.duty_seq`,
    [
      ...values,
      updates.map((row) => row.crew_id),
      updates.map((row) => row.pairing_id),
      updates.map((row) => row.duty_seq),
      updates.map((row) => row.duty_ref_tz),
      updates.map((row) => row.duty_end_ref_tz),
    ],
  )
}

export const recalculateAccRefTz = async (db, options) => {
  const rows = await loadAccRefRows(db, options)
  const params = await load7500Params(db, options.liveSchema, options.rulesetId)
  const updates = params == null ? [] : buildAccRefUpdates(rows, params)
  await persistAccRef(db, options, updates)
  return updates
}
