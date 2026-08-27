import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { PoolClient } from 'pg'
import { invalidate, invalidatePattern } from '../../utils/cache.js'
import { scenarioService } from './scenario-service.js'
import { getS3PairingFileProfile, parseS3PairingPrg, parseS3PairingPrgRecords } from './s3-pairing-prg-parser.js'
import type { S3PairingInput, S3PairingPrgRecordsParseResult, S3PairingSegmentInput } from './s3-pairing-prg-parser.js'
import { scenarioSchema } from '../../utils/db-schema.js'
import { refreshScenarioPairingsTafb } from '../pairing/pairing-tafb-service.js'

interface S3PairingNewScenarioInput {
  name?: string
  strDtLoc: string
  endDtLoc: string
  division: string
}

export interface ImportS3PairingPrgRequest {
  fileName: string
  fileText: string
  targetMode: 'existing' | 'new'
  targetScenarioId?: number
  clearBeforeImport: boolean
  newScenario?: S3PairingNewScenarioInput
  username: string
}

export interface ImportS3PairingPrgResult {
  scenarioId: number
  createdScenario: boolean
  importedPairings: number
  importedSegments: number
  importedCompositions: number
  warnings: string[]
}

interface Queryable {
  query: PoolClient['query']
}

const scenarioSql = (text: string): string => text.replaceAll('scenario.', `${scenarioSchema()}.`)

interface InsertedIdRow {
  id: string
}

interface PairingIdRow extends InsertedIdRow {
  logical_key: string
}

interface FlightIdRow extends InsertedIdRow {
  segment_key: string
}

const assertPrgFile = (fileName: string): void => {
  if (!/\.prg$/i.test(fileName)) {
    throw new Error('Only .PRG files are supported')
  }
}

const assertNewScenario = (input: S3PairingNewScenarioInput | undefined): S3PairingNewScenarioInput => {
  if (!input) throw new Error('New scenario options are required')
  if (!input.strDtLoc || !input.endDtLoc) throw new Error('New scenario date range is required')
  if (input.strDtLoc > input.endDtLoc) throw new Error('New scenario date range is invalid')
  if (!input.division.trim()) throw new Error('New scenario division is required')
  return input
}

interface ExistingPoScenario {
  fileType?: string | null
  division?: string | null
}

const assertExistingScenario = async (
  fastify: FastifyInstance,
  scenarioId: number,
): Promise<ExistingPoScenario> => {
  const target = await scenarioService.getById(fastify, scenarioId)
  if (!target) throw new Error('PO scenario not found')
  if (target.fileType !== 'PO') throw new Error('S3 Pairing import target must be a PO scenario')
  return target as ExistingPoScenario
}

const normalizeDivision = (value: string | null | undefined): 'P' | 'C' | null => {
  const division = value?.trim().toUpperCase().slice(0, 1)
  return division === 'P' || division === 'C' ? division : null
}

const assertExistingScenarioDivision = (
  target: ExistingPoScenario,
  fileDivision: 'P' | 'C',
): void => {
  const targetDivision = normalizeDivision(target?.division)
  if (targetDivision !== fileDivision) {
    const label = fileDivision === 'C' ? 'Cabin' : 'Pilot'
    throw new Error(`This file contains ${label} ranks. Select a ${label} PO scenario before importing.`)
  }
}

const defaultScenarioName = (fileName: string): string => {
  const stem = fileName.replace(/\.[^.]+$/, '').trim()
  return `S3 Pairing ${stem || 'Import'}`.slice(0, 200)
}

const createNewPoScenario = async (
  fastify: FastifyInstance,
  request: ImportS3PairingPrgRequest,
): Promise<number> => {
  const newScenario = assertNewScenario(request.newScenario)
  const created = await scenarioService.create(
    fastify,
    {
      name: newScenario.name?.trim() || defaultScenarioName(request.fileName),
      fileType: 'PO',
      strDtLoc: newScenario.strDtLoc,
      endDtLoc: newScenario.endDtLoc,
      // Division is workset-owned. S3 imports are full imports; RO scenarios
      // apply pairing Base filters after import.
      division: newScenario.division.trim(),
      filterParams: {
        bases: [],
        flightNos: [],
        depAirports: [],
        arrAirports: [],
        fleets: [],
        flightStatus: 'ALL',
      },
    } as never,
    request.username,
  )
  if (!created) throw new Error('Failed to create PO scenario for S3 pairing import')
  return created.id
}

const clearScenarioPairingData = async (db: Queryable, scenarioId: number): Promise<void> => {
  await db.query(scenarioSql('delete from scenario.pairing_composition where scenario_id = $1'), [scenarioId])
  await db.query(scenarioSql('delete from scenario.pairing_segment where scenario_id = $1'), [scenarioId])
  await db.query(scenarioSql('delete from scenario.pairing where scenario_id = $1'), [scenarioId])
  await db.query(scenarioSql('delete from scenario.flight where scenario_id = $1'), [scenarioId])
}

const checksumText = (content: string): string => createHash('sha256').update(content).digest('hex')

const insertPrgImportBatch = async (
  db: Queryable,
  scenarioId: number,
  fileName: string,
  fileText: string,
  records: S3PairingPrgRecordsParseResult,
  username: string,
): Promise<number> => {
  const result = await db.query<InsertedIdRow>(
    scenarioSql(`
      insert into scenario.s3_prg_import_batch (
        scenario_id, file_name, file_checksum, pairing_record_count,
        online_segment_record_count, duty_record_count, offline_segment_record_count,
        warning_count, warnings, created_by, updated_by
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $10)
      returning id
    `),
    [
      scenarioId,
      fileName,
      checksumText(fileText),
      records.pairings.length,
      records.onlineSegments.length,
      records.duties.length,
      records.offlineSegments.length,
      records.warnings.length,
      JSON.stringify(records.warnings),
      username,
    ],
  )
  const row = result.rows[0]
  if (!row) throw new Error('Failed to create S3 PRG import batch')
  return Number(row.id)
}

const insertPrgPairingRecords = async (
  db: Queryable,
  batchId: number,
  scenarioId: number,
  records: S3PairingPrgRecordsParseResult,
  username: string,
): Promise<void> => {
  if (records.pairings.length === 0) return
  await db.query(
    scenarioSql(`
      insert into scenario.s3_prg_pairing_record (
        batch_id, scenario_id, raw_line_no, raw_line, pairing_number, pairing_date,
        effective_from_date, effective_to_date, frequency, pairing_no_op_dates_raw,
        report_date, report_minutes, pairing_end_date, pairing_end_minutes,
        first_flight_number, first_departure_minutes, duty_count, tafb_minutes,
        standup_overnight_indicator, positions_raw, rest_required_after_pairing_minutes,
        total_block_minutes, deadhead_credit_minutes, language_positions_raw,
        created_by, updated_by
      )
      select
        $2, $3, raw_line_no, raw_line, pairing_number, pairing_date,
        effective_from_date, effective_to_date, frequency, pairing_no_op_dates_raw,
        report_date, report_minutes, pairing_end_date, pairing_end_minutes,
        first_flight_number, first_departure_minutes, duty_count, tafb_minutes,
        standup_overnight_indicator, positions_raw, rest_required_after_pairing_minutes,
        total_block_minutes, deadhead_credit_minutes, language_positions_raw,
        $4, $4
      from jsonb_to_recordset($1::jsonb) as x(
        raw_line_no int, raw_line text, pairing_number text, pairing_date text,
        effective_from_date text, effective_to_date text, frequency text, pairing_no_op_dates_raw text,
        report_date text, report_minutes int, pairing_end_date text, pairing_end_minutes int,
        first_flight_number text, first_departure_minutes int, duty_count int, tafb_minutes int,
        standup_overnight_indicator text, positions_raw text, rest_required_after_pairing_minutes int,
        total_block_minutes int, deadhead_credit_minutes int, language_positions_raw text
      )
    `),
    [JSON.stringify(records.pairings.map((record) => ({
      raw_line_no: record.rawLineNo,
      raw_line: record.rawLine,
      pairing_number: record.pairingNumber,
      pairing_date: record.pairingDate,
      effective_from_date: record.effectiveFromDate,
      effective_to_date: record.effectiveToDate,
      frequency: record.frequency,
      pairing_no_op_dates_raw: record.pairingNoOpDatesRaw,
      report_date: record.reportDate,
      report_minutes: record.reportMinutes,
      pairing_end_date: record.pairingEndDate,
      pairing_end_minutes: record.pairingEndMinutes,
      first_flight_number: record.firstFlightNumber,
      first_departure_minutes: record.firstDepartureMinutes,
      duty_count: record.dutyCount,
      tafb_minutes: record.tafbMinutes,
      standup_overnight_indicator: record.standupOvernightIndicator,
      positions_raw: record.positionsRaw,
      rest_required_after_pairing_minutes: record.restRequiredAfterPairingMinutes,
      total_block_minutes: record.totalBlockMinutes,
      deadhead_credit_minutes: record.deadheadCreditMinutes,
      language_positions_raw: record.languagePositionsRaw,
    }))), batchId, scenarioId, username],
  )
}

const insertPrgOnlineSegmentRecords = async (
  db: Queryable,
  batchId: number,
  scenarioId: number,
  records: S3PairingPrgRecordsParseResult,
  username: string,
): Promise<void> => {
  if (records.onlineSegments.length === 0) return
  await db.query(
    scenarioSql(`
      insert into scenario.s3_prg_online_segment_record (
        batch_id, scenario_id, raw_line_no, raw_line, pairing_number, pairing_date,
        flight_number, flight_segment_date, departure_airport, departure_date, departure_minutes,
        arrival_airport, arrival_date, arrival_minutes, pairing_sequence_number,
        deadhead_indicator, leg_break_indicator, far_domestic_international_indicator,
        block_minutes, block_crossover_minutes, leg_credit_minutes, leg_deadhead_pay_minutes,
        far_type, pilot_crew_complement, departure_utc_offset_minutes, arrival_utc_offset_minutes,
        equipment_type, contract_domestic_international_indicator, created_by, updated_by
      )
      select
        $2, $3, raw_line_no, raw_line, pairing_number, pairing_date,
        flight_number, flight_segment_date, departure_airport, departure_date, departure_minutes,
        arrival_airport, arrival_date, arrival_minutes, pairing_sequence_number,
        deadhead_indicator, leg_break_indicator, far_domestic_international_indicator,
        block_minutes, block_crossover_minutes, leg_credit_minutes, leg_deadhead_pay_minutes,
        far_type, pilot_crew_complement, departure_utc_offset_minutes, arrival_utc_offset_minutes,
        equipment_type, contract_domestic_international_indicator, $4, $4
      from jsonb_to_recordset($1::jsonb) as x(
        raw_line_no int, raw_line text, pairing_number text, pairing_date text,
        flight_number text, flight_segment_date text, departure_airport text, departure_date text,
        departure_minutes int, arrival_airport text, arrival_date text, arrival_minutes int,
        pairing_sequence_number int, deadhead_indicator text, leg_break_indicator text,
        far_domestic_international_indicator text, block_minutes int, block_crossover_minutes int,
        leg_credit_minutes int, leg_deadhead_pay_minutes int, far_type text, pilot_crew_complement int,
        departure_utc_offset_minutes int, arrival_utc_offset_minutes int, equipment_type text,
        contract_domestic_international_indicator text
      )
    `),
    [JSON.stringify(records.onlineSegments.map((record) => ({
      raw_line_no: record.rawLineNo,
      raw_line: record.rawLine,
      pairing_number: record.pairingNumber,
      pairing_date: record.pairingDate,
      flight_number: record.flightNumber,
      flight_segment_date: record.flightSegmentDate,
      departure_airport: record.departureAirport,
      departure_date: record.departureDate,
      departure_minutes: record.departureMinutes,
      arrival_airport: record.arrivalAirport,
      arrival_date: record.arrivalDate,
      arrival_minutes: record.arrivalMinutes,
      pairing_sequence_number: record.pairingSequenceNumber,
      deadhead_indicator: record.deadheadIndicator,
      leg_break_indicator: record.legBreakIndicator,
      far_domestic_international_indicator: record.farDomesticInternationalIndicator,
      block_minutes: record.blockMinutes,
      block_crossover_minutes: record.blockCrossoverMinutes,
      leg_credit_minutes: record.legCreditMinutes,
      leg_deadhead_pay_minutes: record.legDeadheadPayMinutes,
      far_type: record.farType,
      pilot_crew_complement: record.pilotCrewComplement,
      departure_utc_offset_minutes: record.departureUtcOffsetMinutes,
      arrival_utc_offset_minutes: record.arrivalUtcOffsetMinutes,
      equipment_type: record.equipmentType,
      contract_domestic_international_indicator: record.contractDomesticInternationalIndicator,
    }))), batchId, scenarioId, username],
  )
}

const insertPrgDutyRecords = async (
  db: Queryable,
  batchId: number,
  scenarioId: number,
  records: S3PairingPrgRecordsParseResult,
  username: string,
): Promise<void> => {
  if (records.duties.length === 0) return
  await db.query(
    scenarioSql(`
      insert into scenario.s3_prg_duty_record (
        batch_id, scenario_id, raw_line_no, raw_line, pairing_number, pairing_date,
        pairing_sequence_number, duty_period_number, duty_start_date, duty_start_minutes,
        duty_end_date, duty_end_minutes, far_domestic_international_indicator,
        scheduled_duty_minutes, scheduled_layover_minutes, layover_city, hotel_name,
        hotel_phone_number, rest_far_type, rest_far_type_number, rest_far_must_begin_minutes,
        rest_far_required_minutes, duty_period_guarantee_minutes, total_block_minutes,
        total_deadhead_credit_minutes, total_deadhead_pay_minutes, total_duty_credit_minutes,
        total_duty_pay_minutes, duty_period_type_day_night, fatigue_units_raw, created_by, updated_by
      )
      select
        $2, $3, raw_line_no, raw_line, pairing_number, pairing_date,
        pairing_sequence_number, duty_period_number, duty_start_date, duty_start_minutes,
        duty_end_date, duty_end_minutes, far_domestic_international_indicator,
        scheduled_duty_minutes, scheduled_layover_minutes, layover_city, hotel_name,
        hotel_phone_number, rest_far_type, rest_far_type_number, rest_far_must_begin_minutes,
        rest_far_required_minutes, duty_period_guarantee_minutes, total_block_minutes,
        total_deadhead_credit_minutes, total_deadhead_pay_minutes, total_duty_credit_minutes,
        total_duty_pay_minutes, duty_period_type_day_night, fatigue_units_raw, $4, $4
      from jsonb_to_recordset($1::jsonb) as x(
        raw_line_no int, raw_line text, pairing_number text, pairing_date text,
        pairing_sequence_number int, duty_period_number int, duty_start_date text, duty_start_minutes int,
        duty_end_date text, duty_end_minutes int, far_domestic_international_indicator text,
        scheduled_duty_minutes int, scheduled_layover_minutes int, layover_city text, hotel_name text,
        hotel_phone_number text, rest_far_type text, rest_far_type_number text,
        rest_far_must_begin_minutes int, rest_far_required_minutes int, duty_period_guarantee_minutes int,
        total_block_minutes int, total_deadhead_credit_minutes int, total_deadhead_pay_minutes int,
        total_duty_credit_minutes int, total_duty_pay_minutes int, duty_period_type_day_night text,
        fatigue_units_raw text
      )
    `),
    [JSON.stringify(records.duties.map((record) => ({
      raw_line_no: record.rawLineNo,
      raw_line: record.rawLine,
      pairing_number: record.pairingNumber,
      pairing_date: record.pairingDate,
      pairing_sequence_number: record.pairingSequenceNumber,
      duty_period_number: record.dutyPeriodNumber,
      duty_start_date: record.dutyStartDate,
      duty_start_minutes: record.dutyStartMinutes,
      duty_end_date: record.dutyEndDate,
      duty_end_minutes: record.dutyEndMinutes,
      far_domestic_international_indicator: record.farDomesticInternationalIndicator,
      scheduled_duty_minutes: record.scheduledDutyMinutes,
      scheduled_layover_minutes: record.scheduledLayoverMinutes,
      layover_city: record.layoverCity,
      hotel_name: record.hotelName,
      hotel_phone_number: record.hotelPhoneNumber,
      rest_far_type: record.restFarType,
      rest_far_type_number: record.restFarTypeNumber,
      rest_far_must_begin_minutes: record.restFarMustBeginMinutes,
      rest_far_required_minutes: record.restFarRequiredMinutes,
      duty_period_guarantee_minutes: record.dutyPeriodGuaranteeMinutes,
      total_block_minutes: record.totalBlockMinutes,
      total_deadhead_credit_minutes: record.totalDeadheadCreditMinutes,
      total_deadhead_pay_minutes: record.totalDeadheadPayMinutes,
      total_duty_credit_minutes: record.totalDutyCreditMinutes,
      total_duty_pay_minutes: record.totalDutyPayMinutes,
      duty_period_type_day_night: record.dutyPeriodTypeDayNight,
      fatigue_units_raw: record.fatigueUnitsRaw,
    }))), batchId, scenarioId, username],
  )
}

const insertPrgOfflineSegmentRecords = async (
  db: Queryable,
  batchId: number,
  scenarioId: number,
  records: S3PairingPrgRecordsParseResult,
  username: string,
): Promise<void> => {
  if (records.offlineSegments.length === 0) return
  await db.query(
    scenarioSql(`
      insert into scenario.s3_prg_offline_segment_record (
        batch_id, scenario_id, raw_line_no, raw_line, pairing_number, pairing_date,
        pairing_sequence_number, carrier, transport_code, flight_segment_date,
        departure_airport, departure_date, departure_minutes, arrival_airport, arrival_date,
        arrival_minutes, tail_assignment, assignment, created_by, updated_by
      )
      select
        $2, $3, raw_line_no, raw_line, pairing_number, pairing_date,
        pairing_sequence_number, carrier, transport_code, flight_segment_date,
        departure_airport, departure_date, departure_minutes, arrival_airport, arrival_date,
        arrival_minutes, tail_assignment, assignment, $4, $4
      from jsonb_to_recordset($1::jsonb) as x(
        raw_line_no int, raw_line text, pairing_number text, pairing_date text,
        pairing_sequence_number int, carrier text, transport_code text, flight_segment_date text,
        departure_airport text, departure_date text, departure_minutes int, arrival_airport text,
        arrival_date text, arrival_minutes int, tail_assignment text, assignment text
      )
    `),
    [JSON.stringify(records.offlineSegments.map((record) => ({
      raw_line_no: record.rawLineNo,
      raw_line: record.rawLine,
      pairing_number: record.pairingNumber,
      pairing_date: record.pairingDate,
      pairing_sequence_number: record.pairingSequenceNumber,
      carrier: record.carrier,
      transport_code: record.transportCode,
      flight_segment_date: record.flightSegmentDate,
      departure_airport: record.departureAirport,
      departure_date: record.departureDate,
      departure_minutes: record.departureMinutes,
      arrival_airport: record.arrivalAirport,
      arrival_date: record.arrivalDate,
      arrival_minutes: record.arrivalMinutes,
      tail_assignment: record.tailAssignment,
      assignment: record.assignment,
    }))), batchId, scenarioId, username],
  )
}

const insertPrgStagingRecords = async (
  db: Queryable,
  scenarioId: number,
  fileName: string,
  fileText: string,
  records: S3PairingPrgRecordsParseResult,
  username: string,
): Promise<number> => {
  const batchId = await insertPrgImportBatch(db, scenarioId, fileName, fileText, records, username)
  await insertPrgPairingRecords(db, batchId, scenarioId, records, username)
  await insertPrgOnlineSegmentRecords(db, batchId, scenarioId, records, username)
  await insertPrgDutyRecords(db, batchId, scenarioId, records, username)
  await insertPrgOfflineSegmentRecords(db, batchId, scenarioId, records, username)
  return batchId
}
const minutesBetween = (startIso: string, endIso: string): number => {
  const diff = new Date(endIso).getTime() - new Date(startIso).getTime()
  return Math.max(0, Math.round(diff / 60_000))
}

const insertPairings = async (
  db: Queryable,
  scenarioId: number,
  pairings: S3PairingInput[],
  username: string,
): Promise<Map<string, number>> => {
  const rows = pairings.map((pairing) => ({
    logical_key: pairing.logicalKey,
    pairing_label: pairing.pairingLabel,
    filiale: pairing.filiale,
    division: pairing.division,
    base: pairing.base,
    fleet: pairing.fleet,
    assignment_group: pairing.assignmentGroup,
    assignment: pairing.assignment,
    sch_str_dt_utc: pairing.schStrDtUtc,
    sch_end_dt_utc: pairing.schEndDtUtc,
    act_str_dt_utc: pairing.actStrDtUtc,
    act_end_dt_utc: pairing.actEndDtUtc,
    pairing_dt: pairing.pairingDate,
    duration_days: pairing.durationDays,
    tafb: pairing.tafb,
    duty_count: pairing.dutyCount,
    seg_count: pairing.segCount,
    interface_id: pairing.interfaceId,
    comments: pairing.comments,
  }))

  const result = await db.query<PairingIdRow>(
    scenarioSql(`
      with input as (
        select *
        from jsonb_to_recordset($1::jsonb) as x(
          logical_key text, pairing_label text, filiale text, division text, base text, fleet text,
          assignment_group text, assignment text, sch_str_dt_utc text, sch_end_dt_utc text,
          act_str_dt_utc text, act_end_dt_utc text, pairing_dt text, duration_days int,
          tafb int, duty_count int, seg_count int, interface_id text, comments text
        )
      ), inserted as (
        insert into scenario.pairing (
          scenario_id, pairing_label, filiale, division, base, fleet,
          assignment_group, assignment, sch_str_dt_utc, sch_end_dt_utc,
          act_str_dt_utc, act_end_dt_utc, pairing_dt, duration_days, tafb,
          duty_count, seg_count, interface_id, source, comments, created_by, updated_by
        )
        select
          $2, pairing_label, filiale, division, base, fleet,
          assignment_group, assignment, sch_str_dt_utc::timestamp, sch_end_dt_utc::timestamp,
          act_str_dt_utc::timestamp, act_end_dt_utc::timestamp, pairing_dt::date, duration_days, tafb,
          duty_count, seg_count, interface_id, 'IMPORT', comments, $3, $3
        from input
        returning id, interface_id
      )
      select input.logical_key, inserted.id
      from inserted
      join input on input.interface_id = inserted.interface_id
    `),
    [JSON.stringify(rows), scenarioId, username],
  )
  return new Map(result.rows.map((row) => [row.logical_key, Number(row.id)]))
}

const insertCompositions = async (
  db: Queryable,
  scenarioId: number,
  pairings: S3PairingInput[],
  pairingIds: Map<string, number>,
  username: string,
): Promise<void> => {
  const rows = pairings.flatMap((pairing) => {
    const pairingId = pairingIds.get(pairing.logicalKey)
    if (!pairingId) throw new Error(`Missing inserted pairing id for ${pairing.logicalKey}`)
    return pairing.compositions.map((composition) => ({
      pairing_id: pairingId,
      division: pairing.division,
      acting_rank: composition.rank,
      plan: composition.plan,
    }))
  })
  if (rows.length === 0) return

  await db.query(
    scenarioSql(`
      insert into scenario.pairing_composition (
        scenario_id, pairing_id, division, acting_rank, plan, created_by, updated_by
      )
      select $2, pairing_id, division, acting_rank, plan, $3, $3
      from jsonb_to_recordset($1::jsonb) as x(
        pairing_id bigint, division text, acting_rank text, plan int
      )
    `),
    [JSON.stringify(rows), scenarioId, username],
  )
}

interface SegmentBatchRow {
  segment_key: string
  interface_flt_id: string
  flight_key: string
  pairing_id: number
  duty_seq: number
  duty_str_arp: string
  duty_end_arp: string
  duty_sch_str_dt_utc: string
  duty_sch_end_dt_utc: string
  duty_sch_fdp_min: number
  duty_sch_rest_min: number
  duty_act_rest_min: number
  duty_layover_nits: number
  duty_act_credited_minutes: number
  pickup_start_utc: string
  pickup_end_utc: string
  brief_start_utc: string
  brief_end_utc: string
  debrief_start_utc: string
  debrief_end_utc: string
  dropoff_start_utc: string
  dropoff_end_utc: string
  seg_seq: number
  flt_dt: string
  flt_num: string
  airline: string
  dep_arp: string
  arv_arp: string
  fleet: string
  act_str_dt_utc: string
  act_end_dt_utc: string
  sch_str_dt_utc: string
  sch_end_dt_utc: string
  seg_assignment: string
}

const segmentKey = (pairing: S3PairingInput, segment: S3PairingSegmentInput): string =>
  `${pairing.logicalKey}:${segment.dutySeq}:${segment.segSeq}:${segment.fltNum}:${segment.schStrDtUtc}`

const bySegmentSeq = (a: S3PairingSegmentInput, b: S3PairingSegmentInput): number => a.segSeq - b.segSeq

const compactYmd = (dateText: string): string => dateText.replace(/-/g, '')

const s3InterfaceFlightId = (pairingId: number, index: number): string =>
  `S3${pairingId}-${String(index + 1).padStart(6, '0')}`

const s3FlightKey = (row: Pick<SegmentBatchRow, 'airline' | 'flt_num' | 'flt_dt' | 'dep_arp'>, index: number): string => {
  const baseKey = `${row.airline}${row.flt_num}-${compactYmd(row.flt_dt)}-${row.dep_arp}`
  return baseKey.length <= 30 ? baseKey : `S3F-${String(index + 1).padStart(6, '0')}`
}

const assertMaxLength = (field: string, value: string, max: number): void => {
  if (value.length > max) {
    throw new Error(`${field} value is too long for import (${value.length}/${max}): ${value}`)
  }
}

const assertSegmentRowSchemaLengths = (row: SegmentBatchRow): void => {
  assertMaxLength('scenario.flight.interface_flt_id', row.interface_flt_id, 40)
  assertMaxLength('scenario.flight.flight_key', row.flight_key, 30)
  assertMaxLength('scenario.flight.airline', row.airline, 3)
  assertMaxLength('scenario.flight.dep_arp', row.dep_arp, 3)
  assertMaxLength('scenario.flight.arv_arp', row.arv_arp, 3)
  assertMaxLength('scenario.pairing_segment.duty_str_arp', row.duty_str_arp, 3)
  assertMaxLength('scenario.pairing_segment.duty_end_arp', row.duty_end_arp, 3)
}

const groupSegmentsByDuty = (segments: S3PairingSegmentInput[]): Map<number, S3PairingSegmentInput[]> => {
  const grouped = new Map<number, S3PairingSegmentInput[]>()
  for (const segment of segments) {
    const dutySegments = grouped.get(segment.dutySeq) ?? []
    dutySegments.push(segment)
    grouped.set(segment.dutySeq, dutySegments)
  }
  for (const dutySegments of grouped.values()) {
    dutySegments.sort(bySegmentSeq)
  }
  return grouped
}

const dutyNodeTimes = (
  pairing: S3PairingInput,
  segment: S3PairingSegmentInput,
  dutySegments: S3PairingSegmentInput[],
): Pick<SegmentBatchRow,
  'pickup_start_utc' | 'pickup_end_utc' | 'brief_start_utc' | 'brief_end_utc' |
  'debrief_start_utc' | 'debrief_end_utc' | 'dropoff_start_utc' | 'dropoff_end_utc'
> => {
  const duty = pairing.duties.get(segment.dutySeq)
  const firstSegment = dutySegments[0] ?? segment
  const lastSegment = dutySegments[dutySegments.length - 1] ?? segment
  const dutyStart = duty?.dutySchStrDtUtc ?? firstSegment.schStrDtUtc
  const dutyEnd = duty?.dutySchEndDtUtc ?? lastSegment.schEndDtUtc

  return {
    pickup_start_utc: dutyStart,
    pickup_end_utc: dutyStart,
    brief_start_utc: dutyStart,
    brief_end_utc: firstSegment.schStrDtUtc,
    debrief_start_utc: lastSegment.schEndDtUtc,
    debrief_end_utc: dutyEnd,
    dropoff_start_utc: dutyEnd,
    dropoff_end_utc: dutyEnd,
  }
}

const buildSegmentRows = (pairings: S3PairingInput[], pairingIds: Map<string, number>): SegmentBatchRow[] =>
  pairings.flatMap((pairing) => {
    const pairingId = pairingIds.get(pairing.logicalKey)
    if (!pairingId) throw new Error(`Missing inserted pairing id for ${pairing.logicalKey}`)
    const segmentsByDuty = groupSegmentsByDuty(pairing.segments)
    return pairing.segments.map((segment) => {
      const duty = pairing.duties.get(segment.dutySeq)
      const currentDutySegments = segmentsByDuty.get(segment.dutySeq) ?? [segment]
      const dutyStrDt = duty?.dutySchStrDtUtc ?? segment.schStrDtUtc
      const dutyEndDt = duty?.dutySchEndDtUtc ?? segment.schEndDtUtc
      return {
        segment_key: segmentKey(pairing, segment),
        interface_flt_id: '',
        flight_key: '',
        pairing_id: pairingId,
        duty_seq: segment.dutySeq,
        duty_str_arp: duty?.dutyStrArp ?? segment.depArp,
        duty_end_arp: duty?.dutyEndArp ?? segment.arvArp,
        duty_sch_str_dt_utc: dutyStrDt,
        duty_sch_end_dt_utc: dutyEndDt,
        duty_sch_fdp_min: duty?.dutySchFdpMin ?? minutesBetween(dutyStrDt, dutyEndDt),
        duty_sch_rest_min: duty?.dutySchRestMin ?? 0,
        duty_act_rest_min: duty?.dutyActRestMin ?? 0,
        duty_layover_nits: duty?.dutyLayoverNits ?? 0,
        duty_act_credited_minutes: duty?.dutyActCreditedMinutes ?? minutesBetween(segment.schStrDtUtc, segment.schEndDtUtc),
        ...dutyNodeTimes(pairing, segment, currentDutySegments),
        seg_seq: segment.segSeq,
        flt_dt: segment.fltDt,
        flt_num: segment.fltNum,
        airline: segment.airline,
        dep_arp: segment.depArp,
        arv_arp: segment.arvArp,
        fleet: segment.fleet,
        act_str_dt_utc: segment.actStrDtUtc,
        act_end_dt_utc: segment.actEndDtUtc,
        sch_str_dt_utc: segment.schStrDtUtc,
        sch_end_dt_utc: segment.schEndDtUtc,
        seg_assignment: segment.segAssignment,
      }
    })
  }).map((row, index) => ({
    ...row,
    interface_flt_id: s3InterfaceFlightId(row.pairing_id, index),
    flight_key: s3FlightKey(row, index),
  })).map((row) => {
    assertSegmentRowSchemaLengths(row)
    return row
  })

const insertFlights = async (
  db: Queryable,
  scenarioId: number,
  rows: SegmentBatchRow[],
  username: string,
): Promise<Map<string, number>> => {
  const result = await db.query<FlightIdRow>(
    scenarioSql(`
      with input as (
        select *
        from jsonb_to_recordset($1::jsonb) as x(
          segment_key text, interface_flt_id text, flight_key text, airline text, flt_dt text,
          flt_num text, dep_arp text, arv_arp text, sch_str_dt_utc text, sch_end_dt_utc text,
          seg_assignment text, fleet text
        )
      ), inserted as (
        insert into scenario.flight (
          scenario_id, airline, flt_dt, flt_num, dep_arp, arv_arp,
          sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
          act_dep_arp, act_arv_arp, flight_assignment, blk_min, fleet,
          flt_type, interface_flt_id, flight_key, flt_dt_utc, created_by, updated_by
        )
        select
          $2, airline, flt_dt::date, flt_num, dep_arp, arv_arp,
          sch_str_dt_utc::timestamp, sch_end_dt_utc::timestamp,
          sch_str_dt_utc::timestamp, sch_end_dt_utc::timestamp,
          dep_arp, arv_arp, seg_assignment,
          greatest(0, round(extract(epoch from (sch_end_dt_utc::timestamp - sch_str_dt_utc::timestamp)) / 60))::int,
          fleet, 'PAX', interface_flt_id, flight_key, flt_dt::date, $3, $3
        from input
        returning id, interface_flt_id
      )
      select input.segment_key, inserted.id
      from inserted
      join input on input.interface_flt_id = inserted.interface_flt_id
    `),
    [JSON.stringify(rows), scenarioId, username],
  )
  return new Map(result.rows.map((row) => [row.segment_key, Number(row.id)]))
}

const insertSegments = async (
  db: Queryable,
  scenarioId: number,
  rows: SegmentBatchRow[],
  flightIds: Map<string, number>,
  username: string,
): Promise<void> => {
  const segmentRows = rows.map((row) => {
    const flightId = flightIds.get(row.segment_key)
    if (!flightId) throw new Error(`Missing inserted flight id for ${row.segment_key}`)
    return { ...row, flight_id: flightId }
  })
  if (segmentRows.length === 0) return

  await db.query(
    scenarioSql(`
      insert into scenario.pairing_segment (
        scenario_id, pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_sch_fdp_min, duty_act_credited_minutes, seg_seq, flt_id, flt_dt, flt_num,
        duty_sch_rest_min, duty_act_rest_min, duty_layover_nits,
        pickup_start_utc, pickup_end_utc, brief_start_utc, brief_end_utc,
        debrief_start_utc, debrief_end_utc, dropoff_start_utc, dropoff_end_utc,
        airline, dep_arp, arv_arp, fleet_seg, act_str_dt_utc, act_end_dt_utc,
        sch_str_dt_utc, sch_end_dt_utc, seg_assignment, created_by, updated_by
      )
      select
        $2, pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc::timestamp, duty_sch_end_dt_utc::timestamp,
        duty_sch_str_dt_utc::timestamp, duty_sch_end_dt_utc::timestamp,
        duty_sch_fdp_min, duty_act_credited_minutes, seg_seq, flight_id, flt_dt::date, flt_num,
        duty_sch_rest_min, duty_act_rest_min, duty_layover_nits,
        pickup_start_utc::timestamp, pickup_end_utc::timestamp,
        brief_start_utc::timestamp, brief_end_utc::timestamp,
        debrief_start_utc::timestamp, debrief_end_utc::timestamp,
        dropoff_start_utc::timestamp, dropoff_end_utc::timestamp,
        airline, dep_arp, arv_arp, fleet, act_str_dt_utc::timestamp, act_end_dt_utc::timestamp,
        sch_str_dt_utc::timestamp, sch_end_dt_utc::timestamp, seg_assignment, $3, $3
      from jsonb_to_recordset($1::jsonb) as x(
        segment_key text, pairing_id bigint, duty_seq int, duty_str_arp text, duty_end_arp text,
        duty_sch_str_dt_utc text, duty_sch_end_dt_utc text, duty_sch_fdp_min int,
        duty_act_credited_minutes int, seg_seq int, flight_id bigint, flt_dt text, flt_num text,
        duty_sch_rest_min int, duty_act_rest_min int, duty_layover_nits int,
        pickup_start_utc text, pickup_end_utc text, brief_start_utc text, brief_end_utc text,
        debrief_start_utc text, debrief_end_utc text, dropoff_start_utc text, dropoff_end_utc text,
        airline text, dep_arp text, arv_arp text, fleet text, act_str_dt_utc text, act_end_dt_utc text,
        sch_str_dt_utc text, sch_end_dt_utc text, seg_assignment text
      )
    `),
    [JSON.stringify(segmentRows), scenarioId, username],
  )
}

const insertParsedPairingData = async (
  db: Queryable,
  scenarioId: number,
  pairings: S3PairingInput[],
  username: string,
): Promise<{ importedSegments: number; importedCompositions: number }> => {
  const pairingIds = await insertPairings(db, scenarioId, pairings, username)
  await insertCompositions(db, scenarioId, pairings, pairingIds, username)
  const segmentRows = buildSegmentRows(pairings, pairingIds)
  const flightIds = await insertFlights(db, scenarioId, segmentRows, username)
  await insertSegments(db, scenarioId, segmentRows, flightIds, username)
  await refreshScenarioPairingsTafb(db, scenarioSchema(), [...pairingIds.values()], username)

  return {
    importedSegments: segmentRows.length,
    importedCompositions: pairings.reduce((sum, pairing) => sum + pairing.compositions.length, 0),
  }
}

const invalidateScenarioImportCaches = async (fastify: FastifyInstance, scenarioId: number): Promise<void> => {
  await Promise.all([
    invalidate(fastify.redis, `scenario:${scenarioId}`),
    invalidatePattern(fastify.redis, 'scenario:list:*'),
    invalidatePattern(fastify.redis, 'pairing:list:*'),
    invalidatePattern(fastify.redis, 'flight:list:*'),
  ])
}

export const importS3PairingPrg = async (
  fastify: FastifyInstance,
  request: ImportS3PairingPrgRequest,
): Promise<ImportS3PairingPrgResult> => {
  assertPrgFile(request.fileName)
  if (!request.fileText.trim()) throw new Error('PRG file is empty')

  const parsedRecords = parseS3PairingPrgRecords(request.fileText)
  const parsed = parseS3PairingPrg(request.fileText)
  const fileProfile = getS3PairingFileProfile(parsed.pairings)
  const stagingRecords = { ...parsedRecords, warnings: parsed.warnings }
  if (parsed.pairings.length === 0) throw new Error('PRG file contains no pairings')

  if (request.targetMode === 'existing') {
    const targetScenarioId = Number(request.targetScenarioId)
    if (!Number.isInteger(targetScenarioId) || targetScenarioId <= 0) {
      throw new Error('Target PO scenario is required')
    }
    const target = await assertExistingScenario(fastify, targetScenarioId)
    assertExistingScenarioDivision(target, fileProfile.division)
  }

  const scenarioId = request.targetMode === 'new'
    ? await createNewPoScenario(fastify, {
        ...request,
        newScenario: request.newScenario
          ? { ...request.newScenario, division: fileProfile.division }
          : request.newScenario,
      })
    : Number(request.targetScenarioId)

  if (!Number.isInteger(scenarioId) || scenarioId <= 0) {
    throw new Error('Target PO scenario is required')
  }
  const client = await fastify.pgPool.connect()
  let importedSegments = 0
  let importedCompositions = 0

  try {
    await client.query('BEGIN')
    if (request.clearBeforeImport) {
      await clearScenarioPairingData(client, scenarioId)
    }

    await insertPrgStagingRecords(client, scenarioId, request.fileName, request.fileText, stagingRecords, request.username)

    const inserted = await insertParsedPairingData(client, scenarioId, parsed.pairings, request.username)
    importedSegments = inserted.importedSegments
    importedCompositions = inserted.importedCompositions

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }

  await invalidateScenarioImportCaches(fastify, scenarioId)

  return {
    scenarioId,
    createdScenario: request.targetMode === 'new',
    importedPairings: parsed.pairings.length,
    importedSegments,
    importedCompositions,
    warnings: parsed.warnings,
  }
}
