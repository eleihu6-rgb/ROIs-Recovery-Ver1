import { pgTable, bigint, varchar, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'

export const scenarioResult = pgTable('scenario_result', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  scenarioId: bigint('scenario_id', { mode: 'number' }).notNull().default(0),
  type: varchar('type', { length: 50 }).notNull(),
  json: jsonb('json').notNull().default({}),
}, (table) => [
  uniqueIndex('uq_scenario_result_type').on(table.scenarioId, table.type),
  index('ix_scenario_result_list').on(table.scenarioId, table.type),
])
