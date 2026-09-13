import type { FastifyInstance } from 'fastify'
import { env } from '../../config/index.js'
import { quoteIdentifier } from '../../utils/db-schema.js'
import { recheckLiveRosterMutation } from '../rule/legality-recheck.js'
import { recomputeMandayAndNotify } from '../manday/manday-operation-service.js'
import { mandayMutationWindow } from '../manday/manday-mutation-window.js'
import { notifyRosterTasksChanged } from '../roster/roster-change-notifier.js'
import { appendNotification } from '../crew-notify/crew-notify-service.js'

/**
 * Crew-app sick leave records unavailability without changing flying assignments.
 * The overlap remains visible to legality / Recovery; only controller Apply +
 * Save reassigns duties. One transaction writes the absence and per-local-day
 * ILL rows. Post-commit effects must never turn a saved request into a failure.
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
  retainedPairingIds: number[]
  groundDays: number
  notificationId: string | null
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
    retainedPairingIds: number[]
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
    const retainedPairingIds = pairingsRes.rows.map((row) => Number(row.pairing_id))

    // 4. Historical removed_pairing_ids means actual removals, never merely affected duties.
    const absenceRes = await client.query<{ id: number }>(
      `insert into ${schema}.crew_absence
         (created_by, updated_by, airline, crew_id, absence_type, assignment,
          from_date, to_date, start_utc, end_utc, base, note, source, removed_pairing_ids)
       values ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'CREW_APP', $12::bigint[])
       returning id`,
      [username, input.airline, crewId, input.type, assignment, input.fromDate, input.toDate,
        startUtc.toISOString(), endUtc.toISOString(), baseRow.base, note, []],
    )
    const absenceId = Number(absenceRes.rows[0]!.id)

    // 5. Keep every original duty row unchanged. Crew Control owns recovery.

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
      absenceId, base: baseRow.base, retainedPairingIds, startUtc, endUtc,
    }
  } catch (err) {
    await client.query('rollback').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }

  // Each hook is independent: committed absence remains successful even if
  // legality, manday or realtime infrastructure is temporarily unavailable.
  const afterCommit = async (name: string, action: () => Promise<unknown>): Promise<void> => {
    try { await action() } catch (err) { fastify.log.error(err, `crew absence ${name} failed after commit`) }
  }
  const touchedDates = [committed.startUtc, committed.endUtc]
  await afterCommit('legality recheck', () => recheckLiveRosterMutation(fastify, undefined, touchedDates, [crewId]))
  await afterCommit('manday recompute', async () => {
    const window = await mandayMutationWindow(fastify, [crewId], touchedDates, {
      backDays: MANDAY_BACK_DAYS, forwardDays: MANDAY_FWD_DAYS,
    })
    if (window) {
      await recomputeMandayAndNotify(fastify, {
        crewIds: [crewId], startDt: window.startDt, endDt: window.endDt, updatedBy: username,
      })
      fastify.wsBroadcastAll(input.wsSchema, { type: 'manday-updated', crewIds: [crewId] })
    }
  })
  await afterCommit('roster notification', () => notifyRosterTasksChanged(fastify, {
    schema: input.wsSchema, crewIds: [crewId], pairingIds: [],
  }))

  // Crew notification: emit only after commit; never fail the recorded absence on it.
  let notificationId: string | null = `absence-${committed.absenceId}`
  try {
    await appendNotification({ pgPool: fastify.pgPool }, {
      airline: input.airline,
      crewId,
      notifId: notificationId,
      type: 'roster_change',
      title: 'Sick leave recorded',
      body: `Sick leave recorded for ${input.fromDate} – ${input.toDate}; ${assignment} added. Original flight duties remain assigned pending Crew Control recovery.`,
      relatedPairingId: committed.retainedPairingIds.length > 0 ? String(committed.retainedPairingIds[0]) : null,
      payload: {
        // Shape consumed by the crew app's alert card (features/notifications/
        // rosterChange.ts): it renders `before` and `after` side by side, so both
        // sides are always present — an array, never a bare id.
        kind: 'absence',
        absenceId: committed.absenceId,
        absenceType: input.type,
        assignment,
        removedPairingIds: [],
        retainedPairingIds: committed.retainedPairingIds,
        fromDate: input.fromDate,
        toDate: input.toDate,
        before: [],
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
    removedPairingIds: [],
    retainedPairingIds: committed.retainedPairingIds,
    groundDays: dayCount,
    notificationId,
  }
}
