import { spawnSync } from 'node:child_process'
import path from 'node:path'
import type pg from 'pg'
import { liveSchema, scenarioSchema } from '../../utils/db-schema.js'

const ACC_REF_BIN = path.resolve(__dirname, '../../../../rule-engine-rs/target/release/check-7500-ref')

export interface AccRefDutyRow {
  crewId: string
  pairingId: number
  dutySeq: number
  startUtc: Date
  endUtc: Date
  depZoneId: string
  arrZoneId: string
}

export interface AccRefDutyInput {
  pairingId: number
  dutySeq: number
  startUtc: number
  endUtc: number
  depTzMin: number
  arrTzMin: number
}

export interface AccRefCrewInput {
  crewId: string
  duties: AccRefDutyInput[]
}

export interface AccRefTzUpdate {
  crewId: string
  pairingId: number
  dutySeq: number
  dutyRefTz: number
  dutyEndRefTz: number
}

interface AccRefTzResult {
  dutyRefTz: number
  dutyEndRefTz: number
}

type AccRefRunner = (
  input: AccRefCrewInput[],
  params: { stayPerMin: number; adjustMin: number },
) => Map<string, AccRefTzResult>

type Queryable = Pick<pg.Pool, 'query'>

const offsetAt = (date: Date, zoneId: string): number => {
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
    const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? '0')
    const hour = get('hour') === 24 ? 0 : get('hour')
    const localAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
    return Math.round((localAsUtc - date.getTime()) / 60_000)
  } catch {
    return 0
  }
}

const dutyKey = (crewId: string, pairingId: number, dutySeq: number): string =>
  `${crewId}|${pairingId}|${dutySeq}`

export const buildAccRefTzInput = (
  rows: AccRefDutyRow[],
  _params: { stayPerMin: number; adjustMin: number },
): AccRefCrewInput[] => {
  const byCrew = new Map<string, AccRefDutyInput[]>()
  for (const row of rows) {
    if (!row.crewId || !Number.isFinite(row.pairingId) || !Number.isFinite(row.dutySeq)) continue
    const duties = byCrew.get(row.crewId) ?? []
    const startUtc = Math.floor(row.startUtc.getTime() / 1000)
    const endUtc = Math.floor(row.endUtc.getTime() / 1000)
    if (!Number.isFinite(startUtc) || !Number.isFinite(endUtc) || endUtc < startUtc) continue
    duties.push({
      pairingId: row.pairingId,
      dutySeq: row.dutySeq,
      startUtc,
      endUtc,
      depTzMin: offsetAt(row.startUtc, row.depZoneId),
      arrTzMin: offsetAt(row.endUtc, row.arrZoneId),
    })
    byCrew.set(row.crewId, duties)
  }
  return [...byCrew.entries()]
    .map(([crewId, duties]) => ({
      crewId,
      duties: duties.sort((a, b) =>
        a.startUtc - b.startUtc || a.endUtc - b.endUtc || a.pairingId - b.pairingId || a.dutySeq - b.dutySeq),
    }))
    .sort((a, b) => a.crewId.localeCompare(b.crewId))
}

const runAccRefTz: AccRefRunner = (input, params) => {
  const lines = input.flatMap((crew) =>
    crew.duties.map((duty) => [
      crew.crewId,
      duty.pairingId,
      duty.dutySeq,
      duty.startUtc,
      duty.endUtc,
      duty.depTzMin,
      duty.arrTzMin,
    ].join('\t')),
  )
  const result = spawnSync(ACC_REF_BIN, [
    '--stay-per-min', String(params.stayPerMin),
    '--adjust-min', String(params.adjustMin),
    '--emit-tsv',
  ], {
    input: lines.join('\n'),
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new Error(
      `check-7500-ref binary missing at ${ACC_REF_BIN} (ENOENT). ` +
      `Deploy it via deploy/sit/deploy.sh rust-bins, or: cargo build --release --bin check-7500-ref`,
    )
  }
  if (result.status !== 0) {
    throw new Error(`check-7500-ref exited ${result.status}: ${result.stderr || result.error || 'unknown error'}`)
  }

  const output = new Map<string, AccRefTzResult>()
  for (const line of result.stdout.split('\n').map((value) => value.trim()).filter(Boolean)) {
    const [crewId, pairingId, dutySeq, refTz, dutyEndRefTz] = line.split('\t')
    const parsed = Number(refTz)
    const parsedEnd = Number(dutyEndRefTz ?? refTz)
    if (crewId && Number.isFinite(parsed) && Number.isFinite(parsedEnd)) {
      output.set(dutyKey(crewId, Number(pairingId), Number(dutySeq)), {
        dutyRefTz: parsed,
        dutyEndRefTz: parsedEnd,
      })
    }
  }
  return output
}

export const applyAccRefTzRows = (
  rows: AccRefDutyRow[],
  params: { stayPerMin: number; adjustMin: number },
  runner: AccRefRunner = runAccRefTz,
): AccRefTzUpdate[] => {
  const input = buildAccRefTzInput(rows, params)
  const refs = runner(input, params)
  return rows.flatMap((row) => {
    const ref = refs.get(dutyKey(row.crewId, row.pairingId, row.dutySeq))
    return ref == null ? [] : [{
      crewId: row.crewId,
      pairingId: row.pairingId,
      dutySeq: row.dutySeq,
      dutyRefTz: ref.dutyRefTz,
      dutyEndRefTz: ref.dutyEndRefTz,
    }]
  })
}

export const refParamsFromRuleJson = (paramJson: unknown): { stayPerMin: number; adjustMin: number } => {
  const fallback = { stayPerMin: 1440, adjustMin: 60 }
  if (!paramJson || typeof paramJson !== 'object') return fallback
  const tables = (paramJson as { tables?: unknown }).tables
  if (!Array.isArray(tables) || tables.length < 2) return fallback
  const second = tables[1]
  if (!second || typeof second !== 'object') return fallback
  const header = (second as { header?: unknown }).header
  const rows = (second as { rows?: unknown }).rows
  if (!Array.isArray(header) || !Array.isArray(rows) || !Array.isArray(rows[0])) return fallback
  const stayIndex = header.findIndex((value) => String(value).toLowerCase() === 'stay duration per x hours')
  const adjustIndex = header.findIndex((value) => String(value).toLowerCase() === 'acc time zone adjust x hours')
  const row = rows[0] as unknown[]
  const parseHm = (value: unknown): number | null => {
    const match = String(value ?? '').match(/^(\d+):(\d{2})$/)
    if (!match) return null
    return Number(match[1]) * 60 + Number(match[2])
  }
  return {
    stayPerMin: parseHm(row[stayIndex]) ?? fallback.stayPerMin,
    adjustMin: parseHm(row[adjustIndex]) ?? fallback.adjustMin,
  }
}

interface AccRefDutyDbRow {
  crew_id: string
  pairing_id: number
  duty_seq: number
  start_utc: Date
  end_utc: Date
  dep_zone_id: string | null
  arr_zone_id: string | null
}

export interface AccRefLoadOptions {
  schema: 'live' | 'scenario'
  scenarioId?: number
}

const accRefWhere = (options: AccRefLoadOptions): { table: string; where: string; values: unknown[] } => {
  if (options.schema === 'scenario') {
    if (options.scenarioId == null) throw new Error('scenarioId is required for scenario acc ref calculation')
    return {
      table: `${scenarioSchema()}.roster_flight`,
      where: 'rf.scenario_id = $1 AND',
      values: [options.scenarioId],
    }
  }
  return { table: `${liveSchema()}.roster_flight`, where: '', values: [] }
}

export const loadAccRefDutyRows = async (
  db: Queryable,
  options: AccRefLoadOptions,
): Promise<AccRefDutyRow[]> => {
  const { table, where, values } = accRefWhere(options)
  const isScenario = options.schema === 'scenario'
  const scenarioSeg = `${scenarioSchema()}.pairing_segment`
  const liveSeg = `${liveSchema()}.pairing_segment`
  const liveJoin = isScenario
    ? `left join ${liveSeg} lps
          on lps.pairing_id = rf.pairing_id
         and lps.duty_seq = rf.duty_seq
         and lps.seg_seq = rf.seg_seq
         and coalesce(lps.is_deleted, 0) = 0`
    : ''
  const depArp = isScenario
    ? `coalesce(nullif(rf.dep_arp, ''), nullif(ps.dep_arp, ''), nullif(lps.dep_arp, ''))`
    : `coalesce(nullif(rf.dep_arp, ''), nullif(ps.dep_arp, ''))`
  const arvArp = isScenario
    ? `coalesce(nullif(rf.arv_arp, ''), nullif(ps.arv_arp, ''), nullif(lps.arv_arp, ''))`
    : `coalesce(nullif(rf.arv_arp, ''), nullif(ps.arv_arp, ''))`
  const result = await db.query<AccRefDutyDbRow>(
    `with duty_rows as (
       select rf.crew_id,
              rf.pairing_id,
              rf.duty_seq,
              min(coalesce(rf.act_str_dt_utc, rf.sch_str_dt_utc)) as start_utc,
              max(coalesce(rf.act_end_dt_utc, rf.sch_end_dt_utc)) as end_utc,
              (array_agg(
                 ${depArp}
                 order by rf.sch_str_dt_utc, rf.seg_seq
               ))[1] as dep_arp,
              (array_agg(
                 ${arvArp}
                 order by rf.sch_end_dt_utc desc, rf.seg_seq desc
               ))[1] as arr_arp
         from ${table} rf
         left join ${isScenario ? scenarioSeg : liveSeg} ps
           on ps.pairing_id = rf.pairing_id
          and ps.duty_seq = rf.duty_seq
          and ps.seg_seq = rf.seg_seq
          and ps.is_deleted = 0
          ${isScenario ? 'and ps.scenario_id = rf.scenario_id' : ''}
         ${liveJoin}
         where ${where} rf.is_deleted = 0
           and rf.pairing_id is not null
           and rf.assignment_group = 'FLY'
         group by rf.crew_id, rf.pairing_id, rf.duty_seq
     )
     select d.crew_id,
            d.pairing_id,
            d.duty_seq,
            d.start_utc,
            d.end_utc,
            coalesce(dep_airport.zone_id, 'UTC') as dep_zone_id,
            coalesce(arr_airport.zone_id, 'UTC') as arr_zone_id
       from duty_rows d
       left join ${liveSchema()}.airport dep_airport
         on dep_airport.airport = d.dep_arp
       left join ${liveSchema()}.airport arr_airport
         on arr_airport.airport = d.arr_arp
      order by d.crew_id, d.start_utc, d.end_utc, d.pairing_id, d.duty_seq`,
    values,
  )
  return result.rows.map((row) => ({
    crewId: row.crew_id,
    pairingId: Number(row.pairing_id),
    dutySeq: Number(row.duty_seq),
    startUtc: new Date(row.start_utc),
    endUtc: new Date(row.end_utc),
    depZoneId: row.dep_zone_id ?? 'UTC',
    arrZoneId: row.arr_zone_id ?? 'UTC',
  }))
}

export const load7500Params = async (
  db: Queryable,
  rulesetId: number,
): Promise<{ stayPerMin: number; adjustMin: number }> => {
  const result = await db.query<{ param_json: unknown }>(
    `select r.param_json
       from ${liveSchema()}.rule_set rs
       join ${liveSchema()}.rule r on r.rule_id = rs.rule_id
      where rs.workset_id = $1
        and r.function = 7500
      order by r.instance
      limit 1`,
    [rulesetId],
  )
  return refParamsFromRuleJson(result.rows[0]?.param_json)
}

export const persistAccRefTzRows = async (
  db: Queryable,
  options: AccRefLoadOptions,
  updates: AccRefTzUpdate[],
): Promise<void> => {
  const { table, where, values } = accRefWhere(options)
  const crewIds = updates.map((row) => row.crewId)
  const pairingIds = updates.map((row) => row.pairingId)
  const dutySeqs = updates.map((row) => row.dutySeq)
  const refs = updates.map((row) => row.dutyRefTz)
  const endRefs = updates.map((row) => row.dutyEndRefTz)
  const scenarioPredicate = options.schema === 'scenario' ? 'and rf.scenario_id = $1' : ''
  await db.query(
    `update ${table} rf
        set duty_ref_tz = refs.ref,
            duty_end_ref_tz = refs.end_ref
       from unnest(
         $${values.length + 1}::varchar[],
         $${values.length + 2}::bigint[],
         $${values.length + 3}::smallint[],
         $${values.length + 4}::integer[],
         $${values.length + 5}::integer[]
       ) as refs(crew_id, pairing_id, duty_seq, ref, end_ref)
      where ${where} rf.is_deleted = 0
        and rf.pairing_id is not null
        ${scenarioPredicate}
        and rf.crew_id = refs.crew_id
        and rf.pairing_id = refs.pairing_id
        and rf.duty_seq = refs.duty_seq`,
    [...values, crewIds, pairingIds, dutySeqs, refs, endRefs],
  )
}

export const recalculateAccRefTz = async (
  db: Queryable,
  options: AccRefLoadOptions & { rulesetId: number },
): Promise<AccRefTzUpdate[]> => {
  const rows = await loadAccRefDutyRows(db, options)
  const params = await load7500Params(db, options.rulesetId)
  const updates = applyAccRefTzRows(rows, params)
  const { table, where, values } = accRefWhere(options)
  await db.query(
    `update ${table} rf
        set duty_ref_tz = null,
            duty_end_ref_tz = null
      where ${where} rf.is_deleted = 0
        and rf.pairing_id is not null
        and rf.assignment_group = 'FLY'`,
    values,
  )
  await persistAccRefTzRows(db, options, updates)
  return updates
}
