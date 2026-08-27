import { pgTable, bigint, varchar, integer, smallint, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const base = pgTable('base', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  filiale: varchar('filiale', { length: 6 }).notNull(),
  base: varchar('base', { length: 3 }).notNull(),
  name: varchar('name', { length: 20 }),
  displayOrder: integer('display_order').notNull(),
  isPrimeDisplayBase: smallint('is_prime_display_base').notNull(),
}, (table) => [
  uniqueIndex('uq_base_filiale').on(table.filiale, table.base),
])

export const filiale = pgTable('filiale', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  filiale: varchar('filiale', { length: 6 }).notNull(),
  filialeName: varchar('filiale_name', { length: 100 }).notNull(),
  airline: varchar('airline', { length: 2 }).notNull(),
}, (table) => [
  uniqueIndex('uq_filiale_code').on(table.filiale),
])

export const team = pgTable('team', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  filiale: varchar('filiale', { length: 6 }).notNull(),
  team: varchar('team', { length: 50 }).notNull(),
  description: varchar('description', { length: 100 }),
  displayOrder: integer('display_order'),
  headColor: varchar('head_color', { length: 20 }),
  division: varchar('division', { length: 10 }).notNull(),
  teamGroup: varchar('team_group', { length: 40 }),
}, (table) => [
  uniqueIndex('uq_team').on(table.filiale, table.team),
])
