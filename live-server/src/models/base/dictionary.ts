import { pgTable, bigint, varchar, smallint, timestamp, index } from 'drizzle-orm/pg-core'

export const dictionary = pgTable('dictionary', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  parentCode: varchar('parent_code', { length: 40 }),
  code: varchar('code', { length: 100 }),
  name: varchar('name', { length: 500 }),
  idx: smallint('idx'),
  codeValue: varchar('code_value', { length: 50 }),
}, (table) => [
  index('idx_dictionary_parent').on(table.parentCode),
  index('idx_dictionary_code').on(table.code),
])
