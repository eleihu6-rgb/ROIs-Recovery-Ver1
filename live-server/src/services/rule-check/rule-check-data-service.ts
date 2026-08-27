import type { FastifyInstance } from 'fastify'
import type { PairingInput, DutyPeriod, FlightSegment, GroundDutyInput } from '../../types/rule-engine.js'
import type { FlightRow, RecentFlightHours } from './flight-history.js'

interface PairingSegmentRow {
  pairing_id: number
  base: string
  duty_seq: number
  duty_sch_str_dt_utc: Date
  duty_sch_end_dt_utc: Date
  duty_sch_rest_min: number | null
  brief_start_utc: Date | null
  debrief_end_utc: Date | null
  seg_seq: number
  flt_num: string
  dep_arp: string
  arv_arp: string
  sch_str_dt_utc: Date
  sch_end_dt_utc: Date
  fleet_seg: string
  blk_min: number
  seg_assignment: string
}

const FREE_FROM_DUTY_ASSIGNMENTS = new Set(['DO', 'VAC', 'ILL'])

interface GroundDutyRow {
  assignment_group: string
  assignment: string
  start_utc: Date
  end_utc: Date
}

interface FlightHistoryRow {
  last_24h: number | null
  last_7d: number | null
  last_28d: number | null
  last_90d: number | null
  last_365d: number | null
}

interface FlightRowRaw {
  sch_str_dt_utc: Date
  sch_end_dt_utc: Date
  blk_min: number
}

interface CrewPairingPairRow {
  crew_id: string
  pairing_id: number
  pairing_start: Date
}

function isNightFlight(stdUtc: Date): boolean {
  const h = stdUtc.getUTCHours()
  return h >= 22 || h < 6
}

/**
 * Group raw segment rows by duty_seq and build a PairingInput.
 */
function buildPairingInput(rows: PairingSegmentRow[]): PairingInput {
  const dutyMap = new Map<number, PairingSegmentRow[]>()

  for (const row of rows) {
    const list = dutyMap.get(row.duty_seq) ?? []
    list.push(row)
    dutyMap.set(row.duty_seq, list)
  }

  const duties: DutyPeriod[] = []

  for (const [dutySeq, segRows] of dutyMap) {
    const first = segRows[0]

    const reportUtc = first.brief_start_utc ?? first.duty_sch_str_dt_utc
    const releaseUtc = first.debrief_end_utc ?? first.duty_sch_end_dt_utc

    const segments: FlightSegment[] = segRows.map((sr) => ({
      fltNo: sr.flt_num,
      depPort: sr.dep_arp,
      arrPort: sr.arv_arp,
      stdUtc: sr.sch_str_dt_utc,
      staUtc: sr.sch_end_dt_utc,
      blockMinutes: sr.blk_min,
      isNight: isNightFlight(sr.sch_str_dt_utc),
      fleetCode: sr.fleet_seg,
      isDeadhead: sr.seg_assignment === 'DH',
    }))

    const duty: DutyPeriod = {
      dutySeq,
      reportUtc,
      releaseUtc,
      segments,
    }

    if (first.duty_sch_rest_min != null) {
      duty.restAfterMinutes = first.duty_sch_rest_min
    }

    duties.push(duty)
  }

  return {
    pairingId: Number(rows[0].pairing_id),
    crewBase: rows[0].base,
    duties,
  }
}

export const ruleCheckDataService = {
  /**
   * Load a pairing with all duties and segments, build PairingInput.
   * Returns null if pairing is deleted or does not exist.
   */
  async loadPairingInput(
    fastify: FastifyInstance,
    pairingId: number,
  ): Promise<PairingInput | null> {
    const sql = `
      SELECT
        p.id         AS pairing_id,
        p.base,
        ps.duty_seq,
        ps.duty_sch_str_dt_utc,
        ps.duty_sch_end_dt_utc,
        ps.duty_sch_rest_min,
        ps.brief_start_utc,
        ps.debrief_end_utc,
        ps.seg_seq,
        ps.flt_num,
        ps.dep_arp,
        ps.arv_arp,
        ps.sch_str_dt_utc,
        ps.sch_end_dt_utc,
        ps.fleet_seg,
        ps.seg_assignment,
        COALESCE(f.blk_min, 0) AS blk_min
      FROM pairing p
      JOIN pairing_segment ps ON ps.pairing_id = p.id AND ps.is_deleted = 0
      LEFT JOIN flight f       ON f.id = ps.flt_id
      WHERE p.id = $1 AND p.is_deleted = 0
      ORDER BY ps.duty_seq, ps.seg_seq
    `

    const { rows } = await fastify.pgPool.query<PairingSegmentRow>(sql, [pairingId])

    if (rows.length === 0) {
      return null
    }

    return buildPairingInput(rows)
  },

  /**
   * Load basic crew info needed for building CrewInfo.
   * Returns division, current rank, fleet qualifications, airport qualifications, and date of birth.
   */
  async loadCrewInfo(
    fastify: FastifyInstance,
    crewId: string,
  ): Promise<{
    division: string
    rank: string
    fleetQuals: string[]
    airportQuals: string[]
    dateOfBirth: string | null
  }> {
    const crewSql = `SELECT division, birthday FROM crew WHERE crew_id = $1`
    const crewRes = await fastify.pgPool.query<{ division: string; birthday: Date | null }>(crewSql, [crewId])

    const rankSql = `
      SELECT rank FROM crew_rank
      WHERE crew_id = $1 AND eff_dt <= now() AND (exp_dt IS NULL OR exp_dt > now())
      ORDER BY eff_dt DESC LIMIT 1
    `
    const rankRes = await fastify.pgPool.query<{ rank: string }>(rankSql, [crewId])

    const fleetSql = `
      SELECT fleet_specific FROM crew_fleet
      WHERE crew_id = $1 AND eff_dt <= now() AND (exp_dt IS NULL OR exp_dt > now())
    `
    const fleetRes = await fastify.pgPool.query<{ fleet_specific: string }>(fleetSql, [crewId])

    const airportSql = `
      SELECT DISTINCT airport FROM crew_qualification
      WHERE crew_id = $1 AND airport IS NOT NULL AND is_valid = 1
    `
    const airportRes = await fastify.pgPool.query<{ airport: string }>(airportSql, [crewId])

    const birthday = crewRes.rows[0]?.birthday ?? null
    return {
      division: crewRes.rows[0]?.division ?? '',
      rank: rankRes.rows[0]?.rank ?? '',
      fleetQuals: fleetRes.rows.map((r) => r.fleet_specific),
      airportQuals: airportRes.rows.map((r) => r.airport),
      dateOfBirth: birthday ? birthday.toISOString().split('T')[0] : null,
    }
  },

  /**
   * Load the crew's acting_rank for a specific pairing assignment (seat position).
   * Returns null if no roster_flight record found.
   */
  async loadCrewSeatPosition(
    fastify: FastifyInstance,
    crewId: string,
    pairingId: number,
  ): Promise<string | null> {
    const { rows } = await fastify.pgPool.query<{ flight_acting_rank: string | null }>(
      `SELECT flight_acting_rank FROM roster_flight
       WHERE crew_id = $1 AND pairing_id = $2 AND is_deleted = 0
       ORDER BY duty_seq ASC, seg_seq ASC LIMIT 1`,
      [crewId, pairingId],
    )
    return rows[0]?.flight_acting_rank ?? null
  },

  /**
   * Load all pairing IDs for a specific crew in a date range.
   */
  async loadCrewPairingsForPeriod(
    fastify: FastifyInstance,
    crewId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<Array<{ pairingId: number; pairingStart: Date }>> {
    const sql = `
      SELECT DISTINCT rf.pairing_id, p.sch_str_dt_utc AS pairing_start
      FROM roster_flight rf
      JOIN pairing p ON p.id = rf.pairing_id AND p.is_deleted = 0
      WHERE rf.crew_id = $1
        AND rf.is_deleted = 0
        AND rf.assignment_group = 'FLY'
        AND rf.pairing_id IS NOT NULL
        AND p.sch_str_dt_utc >= $2::date
        AND p.sch_str_dt_utc < $3::date + INTERVAL '1 day'
      ORDER BY p.sch_str_dt_utc
    `

    const { rows } = await fastify.pgPool.query<CrewPairingPairRow>(sql, [
      crewId,
      dateFrom,
      dateTo,
    ])

    return rows.map((r) => ({
      pairingId: Number(r.pairing_id),
      pairingStart: r.pairing_start,
    }))
  },

  /**
   * Load rolling block-minute sums for a crew member via a single SQL query.
   */
  async loadFlightHistory(
    fastify: FastifyInstance,
    crewId: string,
    referenceTime: Date,
  ): Promise<RecentFlightHours> {
    const sql = `
      SELECT
        COALESCE(SUM(CASE WHEN ps.sch_str_dt_utc >= $2 - INTERVAL '24 hours' THEN f.blk_min ELSE 0 END), 0) AS last_24h,
        COALESCE(SUM(CASE WHEN ps.sch_str_dt_utc >= $2 - INTERVAL '7 days'  THEN f.blk_min ELSE 0 END), 0) AS last_7d,
        COALESCE(SUM(CASE WHEN ps.sch_str_dt_utc >= $2 - INTERVAL '28 days' THEN f.blk_min ELSE 0 END), 0) AS last_28d,
        COALESCE(SUM(CASE WHEN ps.sch_str_dt_utc >= $2 - INTERVAL '90 days' THEN f.blk_min ELSE 0 END), 0) AS last_90d,
        COALESCE(SUM(CASE WHEN ps.sch_str_dt_utc >= $2 - INTERVAL '365 days' THEN f.blk_min ELSE 0 END), 0) AS last_365d
      FROM roster_flight rf
      JOIN pairing_segment ps ON ps.pairing_id = rf.pairing_id AND ps.is_deleted = 0
      JOIN flight f ON f.id = ps.flt_id
      WHERE rf.crew_id = $1
        AND rf.is_deleted = 0
        AND rf.assignment_group = 'FLY'
        AND rf.pairing_id IS NOT NULL
        AND ps.seg_assignment NOT IN ('DH', 'DHD')
        AND ps.sch_str_dt_utc <= $2
        AND ps.sch_end_dt_utc <= $2
        AND ps.sch_str_dt_utc >= $2 - INTERVAL '365 days'
    `

    const { rows } = await fastify.pgPool.query<FlightHistoryRow>(sql, [crewId, referenceTime])
    const row = rows[0]

    return {
      last24h: row.last_24h ?? 0,
      last7d: row.last_7d ?? 0,
      last28d: row.last_28d ?? 0,
      last90d: row.last_90d ?? 0,
      last365d: row.last_365d ?? 0,
    }
  },

  /**
   * Load all GRD-group roster entries for a crew in a date range.
   * Includes DO, VAC, ILL (free from duty) and SBY, GRD, DHD, SIM, SFT (duty).
   */
  async loadCrewGroundDuties(
    fastify: FastifyInstance,
    crewId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<GroundDutyInput[]> {
    const sql = `
      SELECT
        assignment_group,
        assignment,
        sch_str_dt_utc AS start_utc,
        sch_end_dt_utc AS end_utc
      FROM roster_flight
      WHERE crew_id = $1
        AND is_deleted = 0
        AND assignment_group = 'GRD'
        AND sch_str_dt_utc >= $2::date
        AND sch_str_dt_utc <  $3::date + INTERVAL '1 day'
      ORDER BY sch_str_dt_utc
    `

    const { rows } = await fastify.pgPool.query<GroundDutyRow>(sql, [crewId, dateFrom, dateTo])

    return rows.map((r) => ({
      assignment:       r.assignment,
      assignmentGroup:  r.assignment_group,
      startUtc:         r.start_utc,
      endUtc:           r.end_utc,
      isFreeFromDuty:   FREE_FROM_DUTY_ASSIGNMENTS.has(r.assignment),
    }))
  },

  /**
   * Load raw flight rows for a crew in a date range (batch mode).
   * Returns FlightRow[] to pass into computeWindowSums.
   */
  async loadCrewFlightRows(
    fastify: FastifyInstance,
    crewId: string,
    fromUtc: Date,
    toUtc: Date,
  ): Promise<FlightRow[]> {
    const sql = `
      SELECT rf.sch_str_dt_utc, rf.sch_end_dt_utc, COALESCE(f.blk_min, 0) AS blk_min
      FROM roster_flight rf
      JOIN pairing_segment ps ON ps.pairing_id = rf.pairing_id AND ps.is_deleted = 0
      JOIN flight f ON f.id = ps.flt_id
      WHERE rf.crew_id = $1
        AND rf.is_deleted = 0
        AND rf.assignment_group = 'FLY'
        AND rf.pairing_id IS NOT NULL
        AND rf.sch_str_dt_utc >= $2
        AND rf.sch_str_dt_utc <= $3
      ORDER BY rf.sch_str_dt_utc
    `

    const { rows } = await fastify.pgPool.query<FlightRowRaw>(sql, [crewId, fromUtc, toUtc])

    return rows.map((r) => ({
      stdUtc: r.sch_str_dt_utc,
      staUtc: r.sch_end_dt_utc,
      blkMin: r.blk_min,
    }))
  },

}
