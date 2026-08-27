import { pgTable, bigint, varchar, numeric, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const crewRank = pgTable('crew_rank', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  crewId: varchar('crew_id', { length: 30 }).notNull(),
  rank: varchar('rank', { length: 10 }).notNull(),
  effDt: timestamp('eff_dt').notNull(),
  expDt: timestamp('exp_dt'),
  probationEndDt: timestamp('probation_end_dt'),
  position: varchar('position', { length: 20 }).notNull().default('1'),
  preCumulatedExpDays: numeric('pre_cumulated_exp_days').notNull().default('0'),
  fleetGrp: varchar('fleet_grp', { length: 20 }),
  acType: varchar('ac_type', { length: 10 }),
  interfaceCrewRankId: varchar('interface_crew_rank_id', { length: 40 }),
  division: varchar('division', { length: 1 }),
  interfaceRankId: varchar('interface_rank_id', { length: 40 }),
}, (table) => [
  uniqueIndex('uq_crew_rank').on(table.crewId, table.acType, table.rank, table.position, table.effDt),
])
