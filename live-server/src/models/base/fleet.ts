import { pgTable, bigint, varchar, integer, smallint, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const fleet = pgTable('fleet', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  fleet: varchar('fleet', { length: 10 }).notNull(),
  description: varchar('description', { length: 30 }),
  displayOrder: integer('display_order').notNull(),
  fleetGrp: varchar('fleet_grp', { length: 20 }).notNull(),
  acType: varchar('ac_type', { length: 10 }).notNull(),
  restfacility: smallint('restfacility').notNull().default(0),
  marketAcType: varchar('market_ac_type', { length: 30 }),
  body: varchar('body', { length: 1 }),
}, (table) => [
  uniqueIndex('uq_fleet_code').on(table.fleet),
])
