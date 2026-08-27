import { pgTable, bigint, varchar, smallint, timestamp, index } from 'drizzle-orm/pg-core'

export const crewBase = pgTable('crew_base', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  crewId: varchar('crew_id', { length: 30 }).notNull(),
  base: varchar('base', { length: 3 }).notNull(),
  effDt: timestamp('eff_dt').notNull(),
  expDt: timestamp('exp_dt'),
  isPrimeBase: smallint('is_prime_base').notNull().default(1),
  interfaceBaseId: varchar('interface_base_id', { length: 40 }),
  interfaceCrewBaseId: varchar('interface_crew_base_id', { length: 40 }),
  effDtUtc: timestamp('eff_dt_utc'),
  expDtUtc: timestamp('exp_dt_utc'),
}, (table) => [
  index('idx_crew_base_crew_id').on(table.crewId),
])
