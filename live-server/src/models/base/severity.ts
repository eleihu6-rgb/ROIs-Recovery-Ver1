import { pgTable, bigint, varchar, smallint, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const severity = pgTable('severity', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  severity: smallint('severity').notNull(),
  definition: varchar('definition', { length: 100 }),
  colorHex: varchar('color_hex', { length: 6 }).notNull(),
}, (table) => [
  uniqueIndex('uq_severity').on(table.severity),
])
