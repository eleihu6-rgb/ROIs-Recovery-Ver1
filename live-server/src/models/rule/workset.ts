import { pgTable, bigint, varchar, timestamp, boolean } from 'drizzle-orm/pg-core'

export const workset = pgTable('workset', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  filiale: varchar('filiale', { length: 6 }),
  division: varchar('division', { length: 6 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  category: varchar('category', { length: 10 }),
  type: varchar('type', { length: 4 }).notNull(),
  enabled: boolean('enabled').notNull().default(false),
})
