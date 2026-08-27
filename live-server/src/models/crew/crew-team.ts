import { pgTable, bigint, varchar, smallint, numeric, timestamp } from 'drizzle-orm/pg-core'

export const crewTeam = pgTable('crew_team', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  crewId: varchar('crew_id', { length: 30 }).notNull(),
  team: varchar('team', { length: 50 }).notNull(),
  effDt: timestamp('eff_dt').notNull(),
  expDt: timestamp('exp_dt'),
  isValid: smallint('is_valid').notNull().default(1),
  remarks: varchar('remarks', { length: 512 }),
  source: varchar('source', { length: 10 }),
  teamTaskId: numeric('team_task_id'),
})
