import { pgTable, bigint, varchar, integer, boolean, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'

export const calcResult = pgTable('calc_result', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  targetType: varchar('target_type', { length: 20 }).notNull(),
  targetId: bigint('target_id', { mode: 'number' }).notNull(),
  calcData: jsonb('calc_data').notNull(),
  computedAt: timestamp('computed_at').notNull().defaultNow(),
  rulesetId: bigint('ruleset_id', { mode: 'number' }),
  version: integer('version').notNull().default(1),
  isDirty: boolean('is_dirty').notNull().default(false),
  dirtyReason: varchar('dirty_reason', { length: 50 }),
}, (table) => [
  uniqueIndex('uq_calc_result_target').on(table.targetType, table.targetId),
  index('idx_calc_result_computed').on(table.computedAt),
])
