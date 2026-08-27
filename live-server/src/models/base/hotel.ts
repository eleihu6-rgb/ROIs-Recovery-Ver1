import { pgTable, bigint, varchar, integer, smallint, timestamp } from 'drizzle-orm/pg-core'

export const hotel = pgTable('hotel', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  airport: varchar('airport', { length: 3 }).notNull(),
  hotel: varchar('hotel', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 30 }),
  address: varchar('address', { length: 200 }),
  effDt: timestamp('eff_dt').notNull(),
  expDt: timestamp('exp_dt'),
  pickUp: integer('pick_up'),
  dropOff: integer('drop_off'),
  isDefault: smallint('is_default'),
  filiale: varchar('filiale', { length: 3 }),
  fleet: varchar('fleet', { length: 100 }).notNull().default('ALL'),
})
