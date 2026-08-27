import { pgTable, bigint, char, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core'

export const rosterEvent = pgTable('roster_event', {
  eventId: bigint('event_id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  airline: char('airline', { length: 2 }).notNull(),
  topic: varchar('topic', { length: 50 }).notNull(),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  entityType: varchar('entity_type', { length: 30 }).notNull(),
  entityId: bigint('entity_id', { mode: 'number' }).notNull(),
  ref: jsonb('ref'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  createdBy: varchar('created_by', { length: 50 }).notNull().default('system'),
})
