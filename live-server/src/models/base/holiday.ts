import { pgTable, bigint, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const holiday = pgTable('holiday', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  filiale: varchar('filiale', { length: 6 }).notNull(),
  country: varchar('country', { length: 2 }).notNull(),
  city: varchar('city', { length: 3 }).notNull(),
  strDt: timestamp('str_dt').notNull(),
  endDt: timestamp('end_dt').notNull(),
  holiday: varchar('holiday', { length: 80 }).notNull(),
  mark: varchar('mark', { length: 50 }),
  doType: varchar('do_type', { length: 6 }),
}, (table) => [
  uniqueIndex('uq_holiday').on(table.filiale, table.country, table.city, table.strDt),
])
