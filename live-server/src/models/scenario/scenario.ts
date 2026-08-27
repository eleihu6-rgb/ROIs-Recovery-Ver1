import { pgTable, bigint, varchar, integer, smallint, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'

export const scenario = pgTable('scenario', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  worksetId: bigint('workset_id', { mode: 'number' }).notNull(),
  // name lives on workset.name (1:1 via workset_id) — not on scenario
  version: smallint('version').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull(),
  processId: varchar('process_id', { length: 9 }),
  strDtLoc: timestamp('str_dt_loc').notNull(),
  endDtLoc: timestamp('end_dt_loc').notNull(),
  rulesetId: bigint('ruleset_id', { mode: 'number' }).notNull().default(103),
  cqfsetId: varchar('cqfset_id', { length: 9 }).notNull(),
  pairingScenarioId: bigint('pairing_scenario_id', { mode: 'number' }),
  flightScenarioId: bigint('flight_scenario_id', { mode: 'number' }),
  action: varchar('action', { length: 20 }),
  isPublic: smallint('is_public').notNull().default(0),
  isFavorite: smallint('is_favorite').notNull().default(0),
  leadinLive: smallint('leadin_live').notNull().default(0),
  optimizedCount: integer('optimized_count').notNull().default(0),
  rankCross: varchar('rank_cross', { length: 50 }),
  comments: varchar('comments', { length: 500 }),
  fileType: varchar('file_type', { length: 20 }).notNull().default('PO'),
  filterParams: jsonb('filter_params').notNull().default({}),
  filePaths: jsonb('file_paths').notNull().default([]),
  fileSize: bigint('file_size', { mode: 'number' }),
  checksum: varchar('checksum', { length: 64 }),
  taskId: varchar('task_id', { length: 64 }),
}, (table) => [
  uniqueIndex('uq_scenario_workset').on(table.worksetId),
])

export const scenarioGroup = pgTable('scenario_group', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  worksetId: bigint('workset_id', { mode: 'number' }).notNull(),
  scenarioId: bigint('scenario_id', { mode: 'number' }).notNull(),
  sequence: integer('sequence').notNull(),
  isSelected: varchar('is_selected', { length: 1 }).notNull().default('Y'),
}, (table) => [
  uniqueIndex('uq_scenario_group').on(table.worksetId, table.scenarioId),
])

export const schedulePublishRecord = pgTable('schedule_publish_record', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  strDt: timestamp('str_dt').notNull(),
  endDt: timestamp('end_dt').notNull(),
  acType: varchar('ac_type', { length: 100 }),
  division: varchar('division', { length: 100 }).notNull(),
  rosterPeriodId: bigint('roster_period_id', { mode: 'number' }),
  published: smallint('published'),
  crewId: varchar('crew_id', { length: 100 }),
  publishType: varchar('publish_type', { length: 20 }).notNull().default('Normal'),
  base: varchar('base', { length: 50 }),
  batchId: bigint('batch_id', { mode: 'number' }),
  filePath: varchar('file_path', { length: 500 }),
  fileSize: bigint('file_size', { mode: 'number' }),
  checksum: varchar('checksum', { length: 64 }),
}, (table) => [
  index('idx_sch_pub_rec_dt').on(table.strDt, table.endDt),
])
