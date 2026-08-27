import { pgTable, bigint, varchar, smallint, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const crewDepartment = pgTable('crew_department', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  branchCode: varchar('branch_code', { length: 20 }).notNull(),
  branchName: varchar('branch_name', { length: 100 }).notNull(),
  parentCode: varchar('parent_code', { length: 20 }),
  idx: smallint('idx'),
  division: varchar('division', { length: 1 }),
  filiale: varchar('filiale', { length: 6 }),
}, (table) => [
  uniqueIndex('uq_crew_department_code').on(table.branchCode),
])
