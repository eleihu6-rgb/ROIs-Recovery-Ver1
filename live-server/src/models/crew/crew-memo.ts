import { pgTable, bigint, varchar, integer, smallint, numeric, timestamp } from 'drizzle-orm/pg-core'

export const crewMemo = pgTable('crew_memo', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  crewId: varchar('crew_id', { length: 30 }).notNull(),
  strDtLoc: timestamp('str_dt_loc'),
  endDtLoc: timestamp('end_dt_loc'),
  memo: varchar('memo', { length: 300 }),
  userId: varchar('user_id', { length: 30 }).notNull().default('system'),
  tmst: timestamp('tmst').notNull().defaultNow(),
  status: varchar('status', { length: 10 }).notNull().default('Y'),
  rosterId: bigint('roster_id', { mode: 'number' }),
  type: smallint('type'),
  name: varchar('name', { length: 255 }),
  pbsStatus: varchar('pbs_status', { length: 20 }),
})

export const crewProfile = pgTable('crew_profile', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  crewId: varchar('crew_id', { length: 30 }).notNull(),
  profile: varchar('profile', { length: 100 }).notNull(),
  type: varchar('type', { length: 40 }).notNull(),
  effDt: timestamp('eff_dt'),
  expDt: timestamp('exp_dt'),
})

export const crewSeniority = pgTable('crew_seniority', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  crewId: varchar('crew_id', { length: 30 }).notNull(),
  serviceDay: integer('service_day').notNull(),
  seniority: numeric('seniority', { precision: 5, scale: 2 }).notNull(),
})

export const crewKpiAdjust = pgTable('crew_kpi_adjust', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  crewId: varchar('crew_id', { length: 30 }).notNull(),
  rosterFlightId: bigint('roster_flight_id', { mode: 'number' }),
  fltId: bigint('flt_id', { mode: 'number' }),
  type: smallint('type').notNull(),
  adjustDate: timestamp('adjust_date'),
  adjustment: integer('adjustment').notNull(),
  comments: varchar('comments', { length: 255 }),
})
