import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

/**
 * Crew-app notification log for Altair Live (F8/ET).
 *
 * Durable history (no TTL): the app polls `seq > since` for one crew, and push
 * is only a wake-up hint on top of this feed. `notif_id` is the idempotency key
 * so a replayed Live commit cannot create a second row.
 */
export const crewNotification = pgTable('crew_notification', {
  seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  airline: varchar('airline', { length: 4 }).notNull(),
  crewId: varchar('crew_id', { length: 30 }).notNull(),
  notifId: varchar('notif_id', { length: 64 }).notNull(),
  notifType: varchar('notif_type', { length: 32 }).notNull(),
  createdUtc: timestamp('created_utc', { withTimezone: true }).notNull().defaultNow(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  status: varchar('status', { length: 8 }).notNull().default('unread'),
  readUtc: timestamp('read_utc', { withTimezone: true }),
  relatedPairingId: varchar('related_pairing_id', { length: 32 }),
  relatedFlightId: varchar('related_flight_id', { length: 32 }),
  relatedDutyId: varchar('related_duty_id', { length: 64 }),
  payload: jsonb('payload').notNull().default({}),
}, (table) => [
  uniqueIndex('crew_notification_notif_id_uidx').on(table.notifId),
  index('crew_notification_crew_seq_idx').on(table.airline, table.crewId, table.seq),
])
