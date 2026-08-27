import { pgTable, bigint, varchar, smallint, jsonb, timestamp, index } from 'drizzle-orm/pg-core'

export const tagAssignment = pgTable('tag_assignment', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  tagId: bigint('tag_id', { mode: 'number' }).notNull(),
  targetType: varchar('target_type', { length: 20 }).notNull(),
  targetId: bigint('target_id', { mode: 'number' }).notNull(),
  source: varchar('source', { length: 20 }).notNull().default('AUTO'),
  calcSnapshot: jsonb('calc_snapshot'),
  validFrom: timestamp('valid_from'),
  validTo: timestamp('valid_to'),
  isDeleted: smallint('is_deleted').notNull().default(0),
}, (table) => [
  index('idx_tag_assignment_target').on(table.targetType, table.targetId),
  index('idx_tag_assignment_tag').on(table.tagId),
])
