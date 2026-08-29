import bcrypt from 'bcryptjs'
import type { QueryResultRow } from 'pg'
import { env } from '../../config/index.js'
import { quoteIdentifier } from '../../utils/db-schema.js'

export interface MobileRosterLoginInput {
  airline: 'F8'
  crewId: string
  password: string
  startDate?: string
  endDate?: string
}

export interface MobileRosterFlight {
  flightId: string
  flightNumber: string
  departureAirport: string | null
  arrivalAirport: string | null
  startUtc: string
  endUtc: string
}

export interface MobileRosterPairing {
  pairingId: string
  label: string
  checkInUtc: string
  releaseUtc: string
  assignment: string | null
  flights: MobileRosterFlight[]
}

export interface MobileRosterGroundDuty {
  assignment: string | null
  label: string | null
  startUtc: string
  endUtc: string
  departureAirport: string | null
  arrivalAirport: string | null
}

export interface MobileRosterResponse {
  apiVersion: '1'
  airline: 'F8'
  crew: {
    crewId: string
    firstName: string
    lastName: string
    base: string
    rank: string
  }
  pairings: MobileRosterPairing[]
  groundDuties: MobileRosterGroundDuty[]
}

export interface MobileRosterServiceOptions {
  pgPool: {
    query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>
  }
  liveSchema?: string
  pbsSchema?: string
  now?: Date
}

type PbsUserRow = {
  crew_id: string
  password_hash: string
  status: number
  password_access: string | null
  portal_access: string | null
  app_access: string | null
  eff_dt: Date | string
  exp_dt: Date | string | null
}

type CrewProfileRow = {
  crew_id: string
  first_name: string
  last_name: string
  base: string | null
  rank: string | null
}

type RosterRow = {
  pairing_id: string | number | null
  pairing_label: string | null
  assignment: string | null
  pairing_check_in_utc: Date | string | null
  pairing_release_utc: Date | string | null
  flt_id: string | number | null
  flt_num: string | null
  dep_arp: string | null
  arv_arp: string | null
  start_utc: Date | string | null
  end_utc: Date | string | null
}

export class MobileRosterServiceError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'MobileRosterServiceError'
    this.statusCode = statusCode
  }
}

const toUtcString = (value: Date | string | null): string => {
  if (value === null) {
    throw new MobileRosterServiceError(500, 'Roster row is missing a required timestamp.')
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new MobileRosterServiceError(500, 'Roster row contains an invalid timestamp.')
  }

  return date.toISOString()
}

const isWithinEffectiveWindow = (user: PbsUserRow, now: Date): boolean =>
  new Date(user.eff_dt) <= now
  && (user.exp_dt === null || new Date(user.exp_dt) > now)

const hasMobileRosterAccess = (user: PbsUserRow, now: Date): boolean =>
  user.status === 0
  && user.password_access === '1'
  && user.portal_access === '1'
  && user.app_access === '1'
  && isWithinEffectiveWindow(user, now)

const parseDateBoundary = (value: string, name: string): Date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MobileRosterServiceError(400, `${name} must use YYYY-MM-DD.`)
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new MobileRosterServiceError(400, `${name} must be a valid calendar date.`)
  }

  return date
}

const resolveDateWindow = (input: MobileRosterLoginInput, now: Date): { start: Date; end: Date } => {
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1))
  const start = input.startDate ? parseDateBoundary(input.startDate, 'startDate') : defaultStart
  const end = input.endDate ? parseDateBoundary(input.endDate, 'endDate') : defaultEnd

  if (end <= start) {
    throw new MobileRosterServiceError(400, 'endDate must be after startDate.')
  }

  return { start, end }
}

export const authenticateAndLoadMobileRoster = async (
  options: MobileRosterServiceOptions,
  input: MobileRosterLoginInput,
): Promise<MobileRosterResponse> => {
  const liveSchema = quoteIdentifier(options.liveSchema ?? env.LIVE_SCHEMA)
  const pbsSchema = quoteIdentifier(options.pbsSchema ?? env.PBS_SCHEMA)
  const crewId = input.crewId.trim()
  const now = options.now ?? new Date()

  if (!crewId) {
    throw new MobileRosterServiceError(400, 'crewId is required.')
  }

  const userResult = await options.pgPool.query<PbsUserRow>(
    `select crew_id, password_hash, status, password_access, portal_access, app_access, eff_dt, exp_dt
       from ${pbsSchema}.pbs_user
       where user_code = $1
       limit 1`,
    [crewId],
  )
  const user = userResult.rows[0]

  if (!user) {
    throw new MobileRosterServiceError(401, 'Invalid crew ID or password.')
  }

  if (!hasMobileRosterAccess(user, now)) {
    throw new MobileRosterServiceError(403, 'This account cannot access the mobile roster.')
  }

  if (!await bcrypt.compare(input.password, user.password_hash)) {
    throw new MobileRosterServiceError(401, 'Invalid crew ID or password.')
  }

  const profileResult = await options.pgPool.query<CrewProfileRow>(
    `select c.crew_id, c.first_name, c.last_name, cb.base, cr.rank
     from ${liveSchema}.crew c
     left join lateral (
       select base
       from ${liveSchema}.crew_base
       where crew_id = c.crew_id
         and eff_dt <= $2
         and (exp_dt is null or exp_dt > $2)
       order by is_prime_base desc, eff_dt desc
       limit 1
     ) cb on true
     left join lateral (
       select rank
       from ${liveSchema}.crew_rank
       where crew_id = c.crew_id
         and eff_dt <= $2
         and (exp_dt is null or exp_dt > $2)
       order by eff_dt desc
       limit 1
     ) cr on true
     where c.crew_id = $1
     limit 1`,
    [user.crew_id, now.toISOString()],
  )
  const profile = profileResult.rows[0]

  if (!profile) {
    throw new MobileRosterServiceError(404, 'Crew profile was not found.')
  }

  const window = resolveDateWindow(input, now)
  const rosterResult = await options.pgPool.query<RosterRow>(
    `with window_rows as (
       select rf.pairing_id,
              coalesce(p.pairing_label, rf.label) as pairing_label,
              rf.assignment,
              ps.duty_sch_str_dt_utc as segment_check_in_utc,
              ps.duty_sch_end_dt_utc as segment_release_utc,
              rf.flt_id,
              f.flt_num,
              coalesce(f.dep_arp, rf.dep_arp) as dep_arp,
              coalesce(f.arv_arp, rf.arv_arp) as arv_arp,
              rf.sch_str_dt_utc as start_utc,
              rf.sch_end_dt_utc as end_utc,
              rf.duty_seq,
              rf.seg_seq
       from ${liveSchema}.roster_flight rf
       left join ${liveSchema}.pairing p
         on p.id = rf.pairing_id and coalesce(p.is_deleted, 0) = 0
       left join ${liveSchema}.pairing_segment ps
         on ps.pairing_id = rf.pairing_id
        and ps.duty_seq is not distinct from rf.duty_seq
        and ps.seg_seq is not distinct from rf.seg_seq
        and coalesce(ps.is_deleted, 0) = 0
       left join ${liveSchema}.flight f
         on f.id = rf.flt_id and coalesce(f.is_deleted, 0) = 0
       where rf.crew_id = $1
         and rf.is_deleted = 0
         and rf.sch_str_dt_utc >= $2
         and rf.sch_str_dt_utc < $3
     ), pairing_boundaries as (
       select distinct wr.pairing_id,
              coalesce(
                (select min(ps_all.duty_sch_str_dt_utc)
                 from ${liveSchema}.pairing_segment ps_all
                 where ps_all.pairing_id = wr.pairing_id
                   and coalesce(ps_all.is_deleted, 0) = 0),
                (select min(rf_all.sch_str_dt_utc)
                 from ${liveSchema}.roster_flight rf_all
                 where rf_all.crew_id = $1
                   and rf_all.pairing_id = wr.pairing_id
                   and rf_all.is_deleted = 0)
              ) as pairing_check_in_utc,
              coalesce(
                (select max(ps_all.duty_sch_end_dt_utc)
                 from ${liveSchema}.pairing_segment ps_all
                 where ps_all.pairing_id = wr.pairing_id
                   and coalesce(ps_all.is_deleted, 0) = 0),
                (select max(rf_all.sch_end_dt_utc)
                 from ${liveSchema}.roster_flight rf_all
                 where rf_all.crew_id = $1
                   and rf_all.pairing_id = wr.pairing_id
                   and rf_all.is_deleted = 0)
              ) as pairing_release_utc
       from window_rows wr
       where wr.pairing_id is not null
     )
     select wr.pairing_id,
            wr.pairing_label,
            wr.assignment,
            coalesce(pb.pairing_check_in_utc, wr.segment_check_in_utc, wr.start_utc) as pairing_check_in_utc,
            coalesce(pb.pairing_release_utc, wr.segment_release_utc, wr.end_utc) as pairing_release_utc,
            wr.flt_id,
            wr.flt_num,
            wr.dep_arp,
            wr.arv_arp,
            wr.start_utc,
            wr.end_utc
     from window_rows wr
     left join pairing_boundaries pb on pb.pairing_id = wr.pairing_id
     order by wr.start_utc, wr.pairing_id, wr.duty_seq, wr.seg_seq`,
    [user.crew_id, window.start.toISOString(), window.end.toISOString()],
  )

  const pairings = new Map<string, MobileRosterPairing>()
  const groundDuties: MobileRosterGroundDuty[] = []

  for (const row of rosterResult.rows) {
    const pairingId = row.pairing_id === null ? null : String(row.pairing_id)
    const flightId = row.flt_id === null ? null : String(row.flt_id)

    if (!pairingId || !flightId) {
      groundDuties.push({
        assignment: row.assignment,
        label: row.pairing_label,
        startUtc: toUtcString(row.start_utc),
        endUtc: toUtcString(row.end_utc),
        departureAirport: row.dep_arp,
        arrivalAirport: row.arv_arp,
      })
      continue
    }

    let pairing = pairings.get(pairingId)
    if (!pairing) {
      pairing = {
        pairingId,
        label: row.pairing_label ?? pairingId,
        checkInUtc: toUtcString(row.pairing_check_in_utc),
        releaseUtc: toUtcString(row.pairing_release_utc),
        assignment: row.assignment,
        flights: [],
      }
      pairings.set(pairingId, pairing)
    }

    pairing.flights.push({
      flightId,
      flightNumber: row.flt_num ?? '',
      departureAirport: row.dep_arp,
      arrivalAirport: row.arv_arp,
      startUtc: toUtcString(row.start_utc),
      endUtc: toUtcString(row.end_utc),
    })
  }

  return {
    apiVersion: '1',
    airline: 'F8',
    crew: {
      crewId: profile.crew_id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      base: profile.base ?? '',
      rank: profile.rank ?? '',
    },
    pairings: [...pairings.values()],
    groundDuties,
  }
}
