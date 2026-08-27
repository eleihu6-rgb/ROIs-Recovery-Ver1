import { pgTable, bigint, varchar, integer, smallint, timestamp } from 'drizzle-orm/pg-core'

export const pairingTemplate = pgTable('pairing_template', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  templateName: varchar('template_name', { length: 200 }).notNull(),
  templatePeriod: smallint('template_period').notNull(),
  fleetGroup: varchar('fleet_group', { length: 100 }).notNull(),
  tolerance: integer('tolerance').notNull(),
  lockedStatus: smallint('locked_status').notNull(),
  pairingCompositions: varchar('pairing_compositions', { length: 200 }),
})

export const pairingTemplateDetail = pgTable('pairing_template_detail', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  templateId: bigint('template_id', { mode: 'number' }).notNull().references(() => pairingTemplate.id, { onDelete: 'restrict' }),
  pairingSeq: smallint('pairing_seq').notNull(),
  daySeq: smallint('day_seq').notNull(),
  dutySeq: smallint('duty_seq').notNull(),
  segSeq: smallint('seg_seq').notNull(),
  fltNum: varchar('flt_num', { length: 100 }).notNull(),
  segAssignment: varchar('seg_assignment', { length: 20 }).notNull(),
  segDep: varchar('seg_dep', { length: 3 }).notNull(),
  segArr: varchar('seg_arr', { length: 3 }).notNull(),
  dow: varchar('dow', { length: 20 }),
  remark: varchar('remark', { length: 200 }),
  pairingCompositions: varchar('pairing_compositions', { length: 200 }),
})
