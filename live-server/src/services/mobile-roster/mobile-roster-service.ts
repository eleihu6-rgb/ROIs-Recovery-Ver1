import bcrypt from 'bcryptjs'
import type { QueryResultRow } from 'pg'
import { env } from '../../config/index.js'
import { quoteIdentifier } from '../../utils/db-schema.js'

export type MobileRosterAirline = 'F8' | 'ET'

export interface MobileRosterLoginInput {
  airline: MobileRosterAirline
  crewId: string
  password: string
  startDate?: string
  endDate?: string
}

export interface MobileRosterFlight {
  flightId: string
  flightNumber: string
  /**
   * Operating carrier of THIS flight (`flight.airline`, e.g. "EK" for a leg on
   * an Emirates aircraft even when the crew signed in through another portal).
   * Null when the roster row has no flight master row to read it from.
   */
  carrier: string | null
  /** Aircraft fleet/type code the flight is scheduled with (e.g. "7M8", "788"). */
  fleet: string | null
  /** Aircraft tail/registration when the flight row carries one (e.g. "ET-AVK"). */
  register: string | null
  departureAirport: string | null
  arrivalAirport: string | null
  startUtc: string
  endUtc: string
  /**
   * Rolling operational times from the same flight row (nullable — a planned
   * flight has no estimate/actual yet):
   *   est  → ETD / ETA (estimated departure / arrival)
   *   act  → ATD / ATA (actual departure / arrival)
   * `blockMinutes` is the planned block time the airline filed.
   */
  estStartUtc: string | null
  estEndUtc: string | null
  actStartUtc: string | null
  actEndUtc: string | null
  blockMinutes: number | null
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
  airline: MobileRosterAirline
  crew: {
    crewId: string
    firstName: string
    lastName: string
    base: string
    rank: string
    /** ISO-2 country code from `crew.nationality` (null when the roster has none). */
    nationality: string | null
    /**
     * The crew's own carrier, taken from the flights they operate in the loaded
     * window (most common `flight.airline`). This is what the app brands with —
     * the sign-in portal only says which roster service answered, so a UAE crew
     * fetched through another carrier's option would otherwise be branded wrong
     * (crew K1003 showed the Ethiopian wordmark). Null when the window has no
     * flights at all (the app then falls back to the carrier it signed in with).
     */
    carrier: string | null
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
  nationality: string | null
}

type RosterRow = {
  pairing_id: string | number | null
  pairing_label: string | null
  assignment: string | null
  pairing_check_in_utc: string | null
  pairing_release_utc: string | null
  flt_id: string | number | null
  flt_num: string | null
  carrier: string | null
  fleet: string | null
  register: string | null
  dep_arp: string | null
  arv_arp: string | null
  start_utc: string | null
  end_utc: string | null
  est_start_utc: string | null
  est_end_utc: string | null
  act_start_utc: string | null
  act_end_utc: string | null
  blk_min: number | null
}

export class MobileRosterServiceError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'MobileRosterServiceError'
    this.statusCode = statusCode
  }
}

/**
 * The roster/pairing time columns (`roster_flight.sch_str_dt_utc`,
 * `pairing_segment.duty_sch_*_dt_utc`, …) are `timestamp without time zone` holding
 * UTC wall-clock. Selecting them raw hands node-postgres a naive string, which it
 * parses as the SERVER's local time — so the API used to answer with instants shifted
 * by the machine offset (e.g. +7h on a Vancouver host), which the app then drew on the
 * wrong day. Render them as explicit UTC ISO strings in SQL so the value never passes
 * through local-time parsing (same rule as crew-memo/deassign-loader.ts).
 */
const utcIsoColumn = (column: string): string =>
  `to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`

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

/**
 * Same rendering as `toUtcString`, but for the operational columns that are
 * legitimately absent (a planned flight has no estimate/actual yet).
 */
const optionalUtcString = (value: Date | string | null): string | null => {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const isWithinEffectiveWindow = (user: PbsUserRow, now: Date): boolean =>
  new Date(user.eff_dt) <= now
  && (user.exp_dt === null || new Date(user.exp_dt) > now)

/**
 * The carrier the crew actually flies, from the flights in the loaded window:
 * the most common `flight.airline`, ties broken by the earliest first leg. A
 * crew that only has ground duties in the window has no carrier here (null) and
 * the app falls back to the carrier it signed in with.
 *
 * Why the roster and not the sign-in airline: the login's `airline` field only
 * picks which roster service answers, and both ROIS mobile-roster carriers share
 * one endpoint — so a UAE crew (K1003) signed in through the ET option came back
 * branded as Ethiopian. The roster itself knows the real carrier.
 */
const resolveCrewCarrier = (pairings: MobileRosterPairing[]): string | null => {
  const tally = new Map<string, {count: number; firstIndex: number}>()
  let index = 0
  for (const pairing of pairings) {
    for (const flight of pairing.flights) {
      const carrier = flight.carrier?.trim().toUpperCase()
      if (!carrier) {
        continue
      }
      const seen = tally.get(carrier)
      if (seen) {
        seen.count += 1
      } else {
        tally.set(carrier, {count: 1, firstIndex: index})
      }
      index += 1
    }
  }
  let best: string | null = null
  let bestCount = 0
  let bestIndex = Number.POSITIVE_INFINITY
  for (const [carrier, seen] of tally) {
    if (seen.count > bestCount || (seen.count === bestCount && seen.firstIndex < bestIndex)) {
      best = carrier
      bestCount = seen.count
      bestIndex = seen.firstIndex
    }
  }
  return best
}

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

/**
 * The single crew-credential gate for mobile surfaces (roster + crew-app
 * notifications): verifies the PBS portal password against
 * `pbs_user.password_hash` and the account's access window, then returns the
 * canonical crew id. Keeping one gate here means the notify routes cannot drift
 * from the roster route's authorization rules.
 */
export const verifyMobileCrewCredentials = async (
  options: MobileRosterServiceOptions,
  input: { crewId: string; password: string },
): Promise<{ crewId: string }> => {
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

  return { crewId: user.crew_id }
}

export const authenticateAndLoadMobileRoster = async (
  options: MobileRosterServiceOptions,
  input: MobileRosterLoginInput,
): Promise<MobileRosterResponse> => {
  const liveSchema = quoteIdentifier(options.liveSchema ?? env.LIVE_SCHEMA)
  const now = options.now ?? new Date()
  const { crewId } = await verifyMobileCrewCredentials(options, {
    crewId: input.crewId,
    password: input.password,
  })

  const profileResult = await options.pgPool.query<CrewProfileRow>(
    `select c.crew_id, c.first_name, c.last_name, c.nationality, cb.base, cr.rank
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
    [crewId, now.toISOString()],
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
              ${utcIsoColumn('ps.duty_sch_str_dt_utc')} as segment_check_in_utc,
              ${utcIsoColumn('ps.duty_sch_end_dt_utc')} as segment_release_utc,
              rf.flt_id,
              f.flt_num,
              f.airline as carrier,
              f.fleet,
              f.register,
              coalesce(f.dep_arp, rf.dep_arp) as dep_arp,
              coalesce(f.arv_arp, rf.arv_arp) as arv_arp,
              ${utcIsoColumn('rf.sch_str_dt_utc')} as start_utc,
              ${utcIsoColumn('rf.sch_end_dt_utc')} as end_utc,
              ${utcIsoColumn('f.est_dep_dt_utc')} as est_start_utc,
              ${utcIsoColumn('f.est_arv_dt_utc')} as est_end_utc,
              ${utcIsoColumn('f.act_dep_dt_utc')} as act_start_utc,
              ${utcIsoColumn('f.act_arv_dt_utc')} as act_end_utc,
              f.blk_min,
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
         -- Compare UTC wall-clock against UTC wall-clock: casting a timestamptz
         -- parameter against these naive columns would silently apply the session's
         -- timezone to the boundary and drop/include rows near midnight.
         and rf.sch_str_dt_utc >= ($2::timestamptz at time zone 'UTC')
         and rf.sch_str_dt_utc < ($3::timestamptz at time zone 'UTC')
     ), pairing_boundaries as (
       select distinct wr.pairing_id,
              coalesce(
                (select ${utcIsoColumn('min(ps_all.duty_sch_str_dt_utc)')}
                 from ${liveSchema}.pairing_segment ps_all
                 where ps_all.pairing_id = wr.pairing_id
                   and coalesce(ps_all.is_deleted, 0) = 0),
                (select ${utcIsoColumn('min(rf_all.sch_str_dt_utc)')}
                 from ${liveSchema}.roster_flight rf_all
                 where rf_all.crew_id = $1
                   and rf_all.pairing_id = wr.pairing_id
                   and rf_all.is_deleted = 0)
              ) as pairing_check_in_utc,
              coalesce(
                (select ${utcIsoColumn('max(ps_all.duty_sch_end_dt_utc)')}
                 from ${liveSchema}.pairing_segment ps_all
                 where ps_all.pairing_id = wr.pairing_id
                   and coalesce(ps_all.is_deleted, 0) = 0),
                (select ${utcIsoColumn('max(rf_all.sch_end_dt_utc)')}
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
            wr.carrier,
            wr.fleet,
            wr.register,
            wr.dep_arp,
            wr.arv_arp,
            wr.start_utc,
            wr.end_utc,
            wr.est_start_utc,
            wr.est_end_utc,
            wr.act_start_utc,
            wr.act_end_utc,
            wr.blk_min
     from window_rows wr
     left join pairing_boundaries pb on pb.pairing_id = wr.pairing_id
     order by wr.start_utc, wr.pairing_id, wr.duty_seq, wr.seg_seq`,
    [crewId, window.start.toISOString(), window.end.toISOString()],
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
      carrier: row.carrier?.trim() || null,
      fleet: row.fleet ?? null,
      register: row.register?.trim() || null,
      departureAirport: row.dep_arp,
      arrivalAirport: row.arv_arp,
      startUtc: toUtcString(row.start_utc),
      endUtc: toUtcString(row.end_utc),
      estStartUtc: optionalUtcString(row.est_start_utc),
      estEndUtc: optionalUtcString(row.est_end_utc),
      actStartUtc: optionalUtcString(row.act_start_utc),
      actEndUtc: optionalUtcString(row.act_end_utc),
      blockMinutes: row.blk_min === null ? null : Number(row.blk_min),
    })
  }

  const orderedPairings = [...pairings.values()]

  return {
    apiVersion: '1',
    airline: input.airline,
    crew: {
      crewId: profile.crew_id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      base: profile.base ?? '',
      rank: profile.rank ?? '',
      nationality: profile.nationality ?? null,
      carrier: resolveCrewCarrier(orderedPairings),
    },
    pairings: orderedPairings,
    groundDuties,
  }
}
