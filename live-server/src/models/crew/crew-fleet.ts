import { pgTable, bigint, varchar, timestamp, index } from 'drizzle-orm/pg-core'

export const crewFleet = pgTable('crew_fleet', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  crewId: varchar('crew_id', { length: 30 }).notNull(),
  fleetSpecific: varchar('fleet_specific', { length: 20 }).notNull(),
  effDt: timestamp('eff_dt').notNull(),
  expDt: timestamp('exp_dt'),
  acType: varchar('ac_type', { length: 10 }),
  fleetGrp: varchar('fleet_grp', { length: 20 }),
  interfaceFleetId: varchar('interface_fleet_id', { length: 40 }),
  interfaceCrewFleetId: varchar('interface_crew_fleet_id', { length: 40 }),
}, (table) => [
  index('idx_crew_fleet_crew_id').on(table.crewId),
])
