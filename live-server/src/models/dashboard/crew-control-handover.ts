import { pgTable, bigint, varchar, smallint, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Shared, persisted shift-handover log shown on the Dashboard.
 *
 * Controllers post one note per handoff item (a delay decision, a standby
 * callout in flight, a pending confirm) so the next shift picks up context
 * instead of relying on verbal handover. Durable history, no TTL.
 */
export const crewControlHandover = pgTable('crew_control_handover', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  filiale: varchar('filiale', { length: 6 }),
  shiftLabel: varchar('shift_label', { length: 30 }).notNull(),
  author: varchar('author', { length: 60 }).notNull(),
  severity: varchar('severity', { length: 10 }).notNull().default('info'),
  caseRef: varchar('case_ref', { length: 20 }),
  note: text('note').notNull(),
  isDeleted: smallint('is_deleted').notNull().default(0),
})
