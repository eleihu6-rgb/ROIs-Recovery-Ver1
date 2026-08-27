import { pgTable, bigint, varchar, smallint, timestamp } from 'drizzle-orm/pg-core'

export const attribute = pgTable('attribute', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  type: varchar('type', { length: 30 }).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  filiale: varchar('filiale', { length: 6 }),
  isVisible: smallint('is_visible').notNull().default(0),
  operation: varchar('operation', { length: 3 }),
  division: varchar('division', { length: 1 }),
  source: varchar('source', { length: 10 }).notNull().default('man'),
})
