import { pgTable, bigint, varchar, smallint, timestamp, index } from 'drizzle-orm/pg-core'

export const crewStatus = pgTable('crew_status', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  crewId: varchar('crew_id', { length: 30 }).notNull(),
  status: varchar('status', { length: 5 }),
  effDt: timestamp('eff_dt').notNull(),
  expDt: timestamp('exp_dt'),
  reason: varchar('reason', { length: 100 }),
  description: varchar('description', { length: 100 }),
  disable: smallint('disable').notNull().default(0),
}, (table) => [
  index('idx_crew_status_crew_exp').on(table.crewId, table.expDt),
])
