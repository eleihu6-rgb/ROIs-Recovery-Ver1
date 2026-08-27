import { pgTable, bigint, varchar, integer, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'

export const scenarioParameter = pgTable('scenario_parameter', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  scenarioId: bigint('scenario_id', { mode: 'number' }).notNull().default(0),
  code: varchar('code', { length: 200 }).notNull(),
  paramVal: jsonb('param_val').notNull().default({}),
  description: varchar('description', { length: 300 }),
  idx: integer('idx'),
  type: varchar('type', { length: 50 }),
}, (table) => [
  uniqueIndex('uq_scenario_parameter_code').on(table.scenarioId, table.code),
  index('ix_scenario_parameter_list').on(table.scenarioId, table.idx, table.code),
])
