import { pgTable, bigint, varchar, timestamp } from 'drizzle-orm/pg-core'

export const division = pgTable('division', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  division: varchar('division', { length: 1 }).notNull(),
  description: varchar('description', { length: 20 }),
})

export const divisionConstruction = pgTable('division_construction', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  loginDivision: varchar('login_division', { length: 6 }).notNull(),
  dataAuthorization: varchar('data_authorization', { length: 6 }),
})
