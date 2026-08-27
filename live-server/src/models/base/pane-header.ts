import { pgTable, bigint, varchar, integer, smallint, timestamp } from 'drizzle-orm/pg-core'

export const paneHeader = pgTable('pane_header', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  pane: varchar('pane', { length: 20 }).notNull(),
  kpi: varchar('kpi', { length: 20 }).notNull(),
  isDisplay: integer('is_display').notNull(),
  positionIndex: smallint('position_index'),
  expectedFormat: varchar('expected_format', { length: 40 }),
  remark: varchar('remark', { length: 20 }),
  width: varchar('width', { length: 100 }),
})
