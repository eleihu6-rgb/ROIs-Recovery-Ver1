import { pgTable, bigint, varchar, integer, smallint, numeric, timestamp } from 'drizzle-orm/pg-core'

export const fatigueColour = pgTable('fatigue_colour', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  fatigueIndexMin: numeric('fatigue_index_min', { precision: 6, scale: 2 }).notNull(),
  fatigueIndexMax: numeric('fatigue_index_max', { precision: 6, scale: 2 }).notNull(),
  colour: varchar('colour', { length: 20 }).notNull(),
  displayOrder: smallint('display_order'),
})

export const fatigueResult = pgTable('fatigue_result', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  crewId: varchar('crew_id', { length: 30 }).notNull(),
  dutyStart: timestamp('duty_start').notNull(),
  dutyEnd: timestamp('duty_end').notNull(),
  fatigueIndex: varchar('fatigue_index', { length: 800 }),
  rosterId: bigint('roster_id', { mode: 'number' }),
  dutyId: bigint('duty_id', { mode: 'number' }),
  risk: varchar('risk', { length: 40 }),
  maxSp: varchar('max_sp', { length: 40 }),
  firstSleepStart: timestamp('first_sleep_start'),
  firstSleepEnd: timestamp('first_sleep_end'),
  secondSleepStart: timestamp('second_sleep_start'),
  secondSleepEnd: timestamp('second_sleep_end'),
  maxTod: varchar('max_tod', { length: 20 }),
})
