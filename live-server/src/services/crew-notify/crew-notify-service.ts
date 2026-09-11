import type { QueryResultRow } from 'pg'
import { env } from '../../config/index.js'
import { quoteIdentifier } from '../../utils/db-schema.js'

/**
 * Durable crew-app notification feed for Altair Live (F8/ET).
 *
 * The app polls `listForCrew` with a `seq` cursor; push (a later phase) only
 * wakes the device so it can poll. Rows are history: no expiry, and `notif_id`
 * is the idempotency key so a replayed Live commit cannot duplicate.
 */

export class CrewNotifyServiceError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'CrewNotifyServiceError'
    this.statusCode = statusCode
  }
}

export interface CrewNotifyServiceOptions {
  pgPool: {
    query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>
  }
  liveSchema?: string
  now?: Date
}

export interface CrewNotificationDto {
  notifId: string
  crewId: string
  type: string
  createdUtc: string
  title: string
  body: string
  status: 'unread' | 'read'
  readUtc: string | null
  seq: number
  relatedPairingId: string | null
  relatedFlightId: string | null
  relatedDutyId: string | null
  /** Always null here — the FDP-discretion concept is EK/EVACC only. Kept for
   *  contract parity so the app keeps one notification shape. */
  discretionId: null
}

export interface AppendNotificationInput {
  airline: string
  crewId: string
  /** Idempotency key. Derive deterministically (event + pairing + duty) so a
   *  replayed or rapidly repeated commit collapses onto one row. */
  notifId: string
  type: string
  title: string
  body?: string
  relatedPairingId?: string | null
  relatedFlightId?: string | null
  relatedDutyId?: string | null
  payload?: Record<string, unknown>
  createdUtc?: Date
}

type NotificationRow = {
  seq: number | string
  airline: string
  crew_id: string
  notif_id: string
  notif_type: string
  created_utc: Date | string
  title: string
  body: string
  status: string
  read_utc: Date | string | null
  related_pairing_id: string | null
  related_flight_id: string | null
  related_duty_id: string | null
}

/** One page is the whole history a fresh install needs; older rows stay in the
 *  table and remain fetchable by lowering the cursor. */
const MAX_PAGE = 200

const COLUMNS = `seq, airline, crew_id, notif_id, notif_type, created_utc, title, body,
                 status, read_utc, related_pairing_id, related_flight_id, related_duty_id`

const toIso = (value: Date | string): string => new Date(value).toISOString()

const toDto = (row: NotificationRow): CrewNotificationDto => ({
  notifId: row.notif_id,
  crewId: row.crew_id,
  type: row.notif_type,
  createdUtc: toIso(row.created_utc),
  title: row.title,
  body: row.body,
  status: row.status === 'read' ? 'read' : 'unread',
  readUtc: row.read_utc === null ? null : toIso(row.read_utc),
  seq: Number(row.seq),
  relatedPairingId: row.related_pairing_id,
  relatedFlightId: row.related_flight_id,
  relatedDutyId: row.related_duty_id,
  discretionId: null,
})

const liveSchemaOf = (options: CrewNotifyServiceOptions): string =>
  quoteIdentifier(options.liveSchema ?? env.LIVE_SCHEMA)

export interface ListForCrewInput {
  /** 'F8' | 'ET' — scopes the feed so a shared crew id across airlines cannot leak. */
  airline: string
  crewId: string
  /** Return only rows with `seq > since`. Omit for full history. */
  since?: number
}

export interface CrewNotificationFeed {
  cursor: number
  notifications: CrewNotificationDto[]
  /** Contract parity with the EK/EVACC feed; always empty for Live. */
  openDiscretions: never[]
}

export const listForCrew = async (
  options: CrewNotifyServiceOptions,
  input: ListForCrewInput,
): Promise<CrewNotificationFeed> => {
  const schema = liveSchemaOf(options)
  const crewId = input.crewId.trim()
  const since = Number.isFinite(input.since) && (input.since ?? 0) > 0 ? Number(input.since) : 0

  const result = await options.pgPool.query<NotificationRow>(
    `select ${COLUMNS}
       from ${schema}.crew_notification
      where airline = $1
        and crew_id = $2
        and seq > $3
      order by seq desc
      limit $4`,
    [input.airline, crewId, since, MAX_PAGE],
  )

  // Newest-first for the bounded page, then ascending for the client.
  const rows = [...result.rows].reverse()
  const cursor = rows.length > 0 ? Number(rows[rows.length - 1]!.seq) : since

  return {
    cursor,
    notifications: rows.map(toDto),
    openDiscretions: [],
  }
}

export const markRead = async (
  options: CrewNotifyServiceOptions,
  input: { airline: string; crewId: string; notifId: string },
): Promise<boolean> => {
  const schema = liveSchemaOf(options)
  const at = (options.now ?? new Date()).toISOString()

  const result = await options.pgPool.query<{ notif_id: string }>(
    `update ${schema}.crew_notification
        set status = 'read',
            read_utc = coalesce(read_utc, $4)
      where airline = $1
        and crew_id = $2
        and notif_id = $3
      returning notif_id`,
    [input.airline, input.crewId.trim(), input.notifId, at],
  )

  return result.rows.length > 0
}

export const appendNotification = async (
  options: CrewNotifyServiceOptions,
  input: AppendNotificationInput,
): Promise<CrewNotificationDto> => {
  const schema = liveSchemaOf(options)
  const createdAt = (input.createdUtc ?? options.now ?? new Date()).toISOString()

  const inserted = await options.pgPool.query<NotificationRow>(
    `insert into ${schema}.crew_notification
       (airline, crew_id, notif_id, notif_type, created_utc, title, body,
        related_pairing_id, related_flight_id, related_duty_id, payload)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (notif_id) do nothing
     returning ${COLUMNS}`,
    [
      input.airline,
      input.crewId.trim(),
      input.notifId,
      input.type,
      createdAt,
      input.title,
      input.body ?? '',
      input.relatedPairingId ?? null,
      input.relatedFlightId ?? null,
      input.relatedDutyId ?? null,
      JSON.stringify(input.payload ?? {}),
    ],
  )

  if (inserted.rows[0]) {
    return toDto(inserted.rows[0])
  }

  // Replayed idempotency key: return the row that already exists.
  const existing = await options.pgPool.query<NotificationRow>(
    `select ${COLUMNS}
       from ${schema}.crew_notification
      where notif_id = $1
      limit 1`,
    [input.notifId],
  )

  const row = existing.rows[0]
  if (!row) {
    throw new CrewNotifyServiceError(500, 'Notification could not be stored.')
  }

  return toDto(row)
}
