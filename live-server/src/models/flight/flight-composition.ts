import { pgTable, bigint, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { flight } from './flight.js'

export const flightComposition = pgTable('flight_composition', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  fltId: bigint('flt_id', { mode: 'number' }).notNull().references(() => flight.id, { onDelete: 'restrict' }),
  division: varchar('division', { length: 2 }).notNull(),
  actingRank: varchar('acting_rank', { length: 20 }),
  plan: integer('plan'),
  fill: integer('fill').notNull().default(0),
  // open is GENERATED ALWAYS AS (plan - fill) STORED — never write to it
  open: integer('open'),
}, (table) => [
  index('idx_flight_comp_flt').on(table.fltId, table.actingRank),
])
