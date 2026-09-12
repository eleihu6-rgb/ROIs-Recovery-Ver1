import type { FastifyInstance } from 'fastify'
import type { QueryResultRow } from 'pg'
import { env } from '../../config/index.js'
import { quoteIdentifier } from '../../utils/db-schema.js'
import { invalidate } from '../../utils/cache.js'
import { refreshPairingCompositionFillBulk } from '../../utils/composition-fill.js'
import { recheckLiveRosterMutation } from '../rule/legality-recheck.js'
import { recomputeMandayAndNotify } from '../manday/manday-operation-service.js'
import { mandayMutationWindow } from '../manday/manday-mutation-window.js'
import { notifyRosterTasksChanged } from '../roster/roster-change-notifier.js'
import { appendNotification } from '../crew-notify/crew-notify-service.js'

/**
 * Crew recovery story 101 — crew-app sick leave → Live auto stand-down.
 *
 * One transaction: record the absence, soft-delete every flying pairing that
 * overlaps the range (whole pairing, crew×leg rows are not a legal unit), and
 * insert one `ILL` ground row per crew-base local day. Post-commit side effects
 * mirror `routes/roster` + `routes/draft`: composition fill (reopens the slot),
 * Rust legality recheck, manday recompute, `roster-updated` broadcast, and the
 * crew notification (logged, never fails the request).
 *
 * Spec: docs/superpowers/specs/2026-09-11-crew-recovery-story-101-sick-leave-stand-down.md
 */

export class CrewAbsenceServiceError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'CrewAbsenceServiceError'
    this.statusCode = statusCode
  }
}

/** v1 supports sick leave only; other types return 400 until their flow is designed. */
const ABSENCE_ASSIGNMENT: Record<string, string> = { sick: 'ILL' }
/** Crew-facing name of each supported absence code (the alert's "after" side). */
const ABSENCE_LABEL: Record<string, string> = { sick: 'Sick leave' }
const MAX_RANGE_DAYS = 30
/** Same padding the roster routes use for the synchronous manday recompute. */
const MANDAY_BACK_DAYS = 2
const MANDAY_FWD_DAYS = 10
/** Imported F8 ILL rows use group GRD (108k rows); keep new rows consistent with them. */
const ILL_ASSIGNMENT_GROUP = 'GRD'

export interface SubmitCrewAbsenceInput {
  airline: string
  /** Canonical crew id returned by `verifyMobileCrewCredentials`. */
  crewId: string
  type: string
  /** Crew-base local dates, YYYY-MM-DD. */
  fromDate: string
  toDate: string
  note?: string
  /** JWT/request schema used for the websocket broadcast (diverges from LIVE_SCHEMA on SIT). */
  wsSchema: string
}

export interface SubmitCrewAbsenceResult {
  absenceId: number
  assignment: string
  fromDate: string
  toDate: string
  removedPairingIds: number[]
  groundDays: number
  notificationId: string | null
}

/** One leg of a rotation the crew lost — the "before" side of the alert. */
export interface BeforeDutyLeg {
  fltNum: string | null
  dep: string | null
  arv: string | null
  /** ISO-8601 UTC. */
  std: string | null
  sta: string | null
  register: string | null
  fleet: string | null
}

/** A whole removed rotation, dated by the crew-base local day it started on. */
export interface BeforeDuty {
  pairingId: number
  date: string
  legs: BeforeDutyLeg[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const parseDate = (value: string, name: string): Date => {
  if (!DATE_RE.test(value)) throw new CrewAbsenceServiceError(400, `${name} must be YYYY-MM-DD.`)
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new CrewAbsenceServiceError(400, `${name} is not a valid date.`)
  }
  return date
}

const isoDate = (date: Date): string => date.toISOString().slice(0, 10)

/** Minutes east of UTC for `zoneId` at `date` (same approach as acc-ref-tz-service). */
const offsetAt = (date: Date, zoneId: string): number => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zoneId || 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(date)
    const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? '0')
    const hour = get('hour') === 24 ? 0 : get('hour')
    const localAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
    return Math.round((localAsUtc - date.getTime()) / 60_000)
  } catch {
    return 0
  }
}

/** UTC instant of local `YYYY-MM-DD` + `hh:mm:ss` in `zoneId` (two-pass to absorb DST edges). */
const localToUtc = (dayUtc: Date, seconds: number, zoneId: string): Date => {
  const naive = dayUtc.getTime() + seconds * 1000
  const guess = new Date(naive - offsetAt(new Date(naive), zoneId) * 60_000)
  return new Date(naive - offsetAt(guess, zoneId) * 60_000)
}

const END_OF_DAY_SECONDS = 23 * 3600 + 59 * 60 + 59

/** Crew-base local date (`YYYY-MM-DD`) of a UTC instant. */
const localDateOf = (utc: Date, zoneId: string): string =>
  isoDate(new Date(utc.getTime() + offsetAt(utc, zoneId) * 60_000))

export interface ListCrewAbsencesInput {
  crewId?: string
  status?: 'active' | 'cancelled'
  /** Inclusive local-date window (YYYY-MM-DD) intersected with from_date..to_date. */
  fromDate?: string
  toDate?: string
  limit?: number
}

export interface CrewAbsenceDto {
  id: number
  airline: string
  crewId: string
  crewName: string | null
  absenceType: string
  assignment: string
  fromDate: string
  toDate: string
  base: string
  note: string
  status: string
  source: string
  removedPairingIds: number[]
  createdAt: string
}

const MAX_LIST = 500

/** Planner-side query for the roster-pane Crew Absence dialog. */
export const listCrewAbsences = async (
  fastify: FastifyInstance,
  input: ListCrewAbsencesInput,
): Promise<CrewAbsenceDto[]> => {
  const schema = quoteIdentifier(env.LIVE_SCHEMA)
  const where: string[] = []
  const values: unknown[] = []
  const push = (clause: string, value: unknown): void => {
    values.push(value)
    where.push(clause.replace('?', `$${values.length}`))
  }
  if (input.crewId?.trim()) push('a.crew_id = ?', input.crewId.trim())
  if (input.status) push('a.status = ?', input.status)
  if (input.fromDate) push('a.to_date >= ?::date', parseDate(input.fromDate, 'fromDate').toISOString().slice(0, 10))
  if (input.toDate) push('a.from_date <= ?::date', parseDate(input.toDate, 'toDate').toISOString().slice(0, 10))
  values.push(Math.min(Math.max(input.limit ?? MAX_LIST, 1), MAX_LIST))

  const result = await fastify.pgPool.query<{
    id: number; airline: string; crew_id: string; crew_name: string | null; absence_type: string
    assignment: string; from_date: string; to_date: string; base: string; note: string; status: string
    source: string; removed_pairing_ids: number[] | null; created_at: Date
  }>(
    `select a.id, a.airline, a.crew_id,
            nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '') as crew_name,
            a.absence_type, a.assignment, a.from_date::text, a.to_date::text, a.base, a.note,
            a.status, a.source, a.removed_pairing_ids, a.created_at
       from ${schema}.crew_absence a
       left join ${schema}.crew c on c.crew_id = a.crew_id
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by a.from_date desc, a.id desc
      limit $${values.length}`,
    values,
  )
  return result.rows.map((row) => ({
    id: Number(row.id),
    airline: row.airline,
    crewId: row.crew_id,
    crewName: row.crew_name,
    absenceType: row.absence_type,
    assignment: row.assignment,
    fromDate: row.from_date,
    toDate: row.to_date,
    base: row.base,
    note: row.note,
    status: row.status,
    source: row.source,
    removedPairingIds: (row.removed_pairing_ids ?? []).map(Number),
    createdAt: new Date(row.created_at).toISOString(),
  }))
}

/**
 * Read the flying rotations that a stand-down is about to remove, grouped per
 * pairing, with the flight identity/times the crew recognises. Read inside the
 * transaction but before the soft-delete, so the "before" side matches what the
 * crew actually had on their roster.
 */
const readRemovedDuties = async (
  client: { query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }> },
  schema: string,
  crewId: string,
  pairingIds: number[],
  zoneId: string,
): Promise<BeforeDuty[]> => {
  if (pairingIds.length === 0) return []

  const result = await client.query<{
    pairing_id: number | string
    sch_str_dt_utc: Date | string
    sch_end_dt_utc: Date | string | null
    flt_num: string | null
    dep_arp: string | null
    arv_arp: string | null
    register: string | null
    fleet: string | null
  }>(
    `select rf.pairing_id, rf.sch_str_dt_utc, rf.sch_end_dt_utc,
            f.flt_num, f.dep_arp, f.arv_arp, f.register, f.fleet
       from ${schema}.roster_flight rf
       left join ${schema}.flight f on f.id = rf.flt_id
      where rf.crew_id = $1
        and rf.pairing_id = any($2::bigint[])
        and rf.is_deleted = 0
      order by rf.pairing_id, rf.sch_str_dt_utc`,
    [crewId, pairingIds],
  )

  const iso = (value: Date | string | null): string | null => {
    if (value === null) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }

  const byPairing = new Map<number, BeforeDuty>()
  for (const row of result.rows) {
    const pairingId = Number(row.pairing_id)
    const start = new Date(row.sch_str_dt_utc)
    let duty = byPairing.get(pairingId)
    if (!duty) {
      duty = {
        pairingId,
        date: Number.isNaN(start.getTime()) ? '' : localDateOf(start, zoneId),
        legs: [],
      }
      byPairing.set(pairingId, duty)
    }
    duty.legs.push({
      fltNum: row.flt_num ?? null,
      dep: row.dep_arp ?? null,
      arv: row.arv_arp ?? null,
      std: iso(row.sch_str_dt_utc),
      sta: iso(row.sch_end_dt_utc),
      register: row.register ?? null,
      fleet: row.fleet ?? null,
    })
  }
  return [...byPairing.values()]
}

export const submitCrewAbsence = async (
  fastify: FastifyInstance,
  input: SubmitCrewAbsenceInput,
): Promise<SubmitCrewAbsenceResult> => {
  const assignment = ABSENCE_ASSIGNMENT[input.type]
  if (!assignment) {
    throw new CrewAbsenceServiceError(400, `Absence type "${input.type}" is not supported yet.`)
  }
  const from = parseDate(input.fromDate, 'fromDate')
  const to = parseDate(input.toDate, 'toDate')
  const dayCount = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
  if (dayCount < 1) throw new CrewAbsenceServiceError(400, 'toDate must not be before fromDate.')
  if (dayCount > MAX_RANGE_DAYS) {
    throw new CrewAbsenceServiceError(400, `Absence range cannot exceed ${MAX_RANGE_DAYS} days.`)
  }

  const schema = quoteIdentifier(env.LIVE_SCHEMA)
  const crewId = input.crewId.trim()
  const username = `crew:${crewId}`
  const note = (input.note ?? '').trim()

  const client = await fastify.pgPool.connect()
  let committed: {
    absenceId: number
    base: string
    removedPairingIds: number[]
    before: BeforeDuty[]
    removedDates: Date[]
    startUtc: Date
    endUtc: Date
  }
  try {
    await client.query('begin')

    // 1. Crew base effective on fromDate → airport zone → UTC window of the local days.
    const baseRes = await client.query<{ base: string; zone_id: string | null }>(
      `select cb.base, a.zone_id
         from ${schema}.crew_base cb
         left join ${schema}.airport a on a.airport = cb.base
        where cb.crew_id = $1
          and cb.eff_dt <= $2::date + interval '1 day'
          and (cb.exp_dt is null or cb.exp_dt >= $2::date)
        order by cb.is_prime_base desc, cb.eff_dt desc
        limit 1`,
      [crewId, input.fromDate],
    )
    const baseRow = baseRes.rows[0]
    if (!baseRow) throw new CrewAbsenceServiceError(400, 'Crew has no base effective on fromDate.')
    const zoneId = baseRow.zone_id ?? 'UTC'
    const startUtc = localToUtc(from, 0, zoneId)
    const endUtc = localToUtc(to, END_OF_DAY_SECONDS, zoneId)

    // 2. One active absence per day: reject overlapping submissions.
    const overlap = await client.query<{ id: number }>(
      `select id from ${schema}.crew_absence
        where airline = $1 and crew_id = $2 and status = 'active'
          and from_date <= $4::date and to_date >= $3::date
        limit 1`,
      [input.airline, crewId, input.fromDate, input.toDate],
    )
    if (overlap.rows[0]) {
      throw new CrewAbsenceServiceError(409, 'An active absence already covers part of this range.')
    }

    // 3. Overlapping flying pairings (whole pairing, any leg touching the window).
    const pairingsRes = await client.query<{ pairing_id: number }>(
      `select distinct pairing_id
         from ${schema}.roster_flight
        where crew_id = $1 and pairing_id is not null and is_deleted = 0
          and sch_str_dt_utc <= $3 and sch_end_dt_utc >= $2
        order by pairing_id`,
      [crewId, startUtc.toISOString(), endUtc.toISOString()],
    )
    const removedPairingIds = pairingsRes.rows.map((row) => Number(row.pairing_id))

    // 3b. Snapshot the flying duties the crew is about to lose, BEFORE the
    //     soft-delete below. The crew notification shows these as the "before"
    //     side of the change, so the crew sees the rotation they had next to the
    //     sick-leave day they gained instead of reading prose.
    const before = await readRemovedDuties(client, schema, crewId, removedPairingIds, zoneId)

    // 4. Absence record (carries the removed pairing ids for the absence window / best-fit).
    const absenceRes = await client.query<{ id: number }>(
      `insert into ${schema}.crew_absence
         (created_by, updated_by, airline, crew_id, absence_type, assignment,
          from_date, to_date, start_utc, end_utc, base, note, source, removed_pairing_ids)
       values ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'CREW_APP', $12::bigint[])
       returning id`,
      [username, input.airline, crewId, input.type, assignment, input.fromDate, input.toDate,
        startUtc.toISOString(), endUtc.toISOString(), baseRow.base, note, removedPairingIds],
    )
    const absenceId = Number(absenceRes.rows[0]!.id)

    // 5. Stand down: soft-delete every row of those pairings for this crew.
    let removedDates: Date[] = []
    if (removedPairingIds.length > 0) {
      const removed = await client.query<{ sch_str_dt_utc: Date }>(
        `update ${schema}.roster_flight
            set is_deleted = 1, request_source = 'CREW_APP', request_id = $3,
                updated_by = $4, updated_at = now()
          where crew_id = $1 and pairing_id = any($2::bigint[]) and is_deleted = 0
          returning sch_str_dt_utc`,
        [crewId, removedPairingIds, absenceId, username],
      )
      removedDates = removed.rows.map((row) => new Date(row.sch_str_dt_utc))
    }

    // 6. One ILL ground row per local day — same shape as rosterService.createGroundTask.
    const assignRes = await client.query<{ fixed_credit_min: number | null; dp_pct: number | null; rest_time: number | null }>(
      `select fixed_credit_min, dp_pct, rest_time from ${schema}.assignment where assignment = $1 limit 1`,
      [assignment],
    )
    const assign = assignRes.rows[0]
    if (!assign) throw new CrewAbsenceServiceError(500, `Assignment code ${assignment} is missing from the dictionary.`)
    for (let i = 0; i < dayCount; i += 1) {
      const dayUtc = new Date(from.getTime() + i * 86_400_000)
      const dayStart = localToUtc(dayUtc, 0, zoneId)
      const dayEnd = localToUtc(dayUtc, END_OF_DAY_SECONDS, zoneId)
      const durationMin = Math.max(0, Math.round((dayEnd.getTime() - dayStart.getTime()) / 60_000))
      const credit = assign.fixed_credit_min
      const dpMin = Math.round(durationMin * Number(assign.dp_pct ?? 0))
      await client.query(
        `insert into ${schema}.roster_flight
           (created_by, updated_by, crew_id, pairing_id, base, dep_arp, arv_arp,
            assignment_group, assignment, flight_acting_rank, sch_str_dt_utc, sch_end_dt_utc,
            comments, act_rest_min, sch_credited_minutes, act_credited_minutes, dp_min,
            source, request_source, request_id)
         values ($1, $1, $2, null, $3, $3, $3, $4, $5, '', $6, $7, $8, $9, $10, $10, $11,
                 'MA', 'CREW_APP', $12)`,
        [username, crewId, baseRow.base, ILL_ASSIGNMENT_GROUP, assignment,
          dayStart.toISOString(), dayEnd.toISOString(), note || null, assign.rest_time,
          credit, dpMin, absenceId],
      )
    }

    await client.query('commit')
    committed = {
      absenceId, base: baseRow.base, removedPairingIds, before, removedDates, startUtc, endUtc,
    }
  } catch (err) {
    await client.query('rollback').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }

  // ---- Post-commit side effects (same order as the roster/draft routes). ----
  if (committed.removedPairingIds.length > 0) {
    await refreshPairingCompositionFillBulk(fastify.db, committed.removedPairingIds, username)
      .catch((err) => fastify.log.error(err, 'refreshPairingCompositionFill failed after crew absence'))
    await Promise.all(committed.removedPairingIds.flatMap((id) => [
      invalidate(fastify.redis, `pairing:${id}`),
      invalidate(fastify.redis, `pairing:comp:${id}`),
    ]))
  }

  const touchedDates = [committed.startUtc, committed.endUtc, ...committed.removedDates]
  await recheckLiveRosterMutation(fastify, undefined, touchedDates, [crewId])
  const window = await mandayMutationWindow(fastify, [crewId], touchedDates, {
    backDays: MANDAY_BACK_DAYS, forwardDays: MANDAY_FWD_DAYS,
  })
  if (window) {
    await recomputeMandayAndNotify(fastify, {
      crewIds: [crewId], startDt: window.startDt, endDt: window.endDt, updatedBy: username,
    })
    fastify.wsBroadcastAll(input.wsSchema, { type: 'manday-updated', crewIds: [crewId] })
  }
  await notifyRosterTasksChanged(fastify, {
    schema: input.wsSchema, crewIds: [crewId], pairingIds: committed.removedPairingIds,
  })

  // Crew notification: emit only after commit; never fail the stand-down on it.
  let notificationId: string | null = `absence-${committed.absenceId}`
  const removedCount = committed.removedPairingIds.length
  try {
    await appendNotification({ pgPool: fastify.pgPool }, {
      airline: input.airline,
      crewId,
      notifId: notificationId,
      type: 'roster_change',
      title: 'Sick leave recorded',
      body: removedCount > 0
        ? `${removedCount} flight dut${removedCount === 1 ? 'y' : 'ies'} removed for ${input.fromDate} – ${input.toDate}; ${assignment} added to your roster.`
        : `${assignment} added to your roster for ${input.fromDate} – ${input.toDate}. No flight duties were affected.`,
      relatedPairingId: removedCount > 0 ? String(committed.removedPairingIds[0]) : null,
      payload: {
        // Shape consumed by the crew app's alert card (features/notifications/
        // rosterChange.ts): it renders `before` and `after` side by side, so both
        // sides are always present — an array, never a bare id.
        kind: 'absence',
        absenceId: committed.absenceId,
        absenceType: input.type,
        assignment,
        removedPairingIds: committed.removedPairingIds,
        fromDate: input.fromDate,
        toDate: input.toDate,
        before: committed.before,
        after: Array.from({ length: dayCount }, (_, i) => ({
          date: isoDate(new Date(from.getTime() + i * 86_400_000)),
          assignment,
          label: ABSENCE_LABEL[input.type] ?? assignment,
          base: committed.base,
        })),
      },
    })
  } catch (err) {
    fastify.log.error(err, 'crew absence notification failed')
    notificationId = null
  }

  return {
    absenceId: committed.absenceId,
    assignment,
    fromDate: input.fromDate,
    toDate: input.toDate,
    removedPairingIds: committed.removedPairingIds,
    groundDays: dayCount,
    notificationId,
  }
}
