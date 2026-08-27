import { pgTable, bigint, varchar, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const cqf = pgTable('cqf', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  function: integer('function').notNull(),
  instance: varchar('instance', { length: 3 }),
  class: varchar('class', { length: 10 }),
  description: varchar('description', { length: 200 }),
  reference: varchar('reference', { length: 20 }).notNull(),
  category: varchar('category', { length: 20 }).notNull(),
  storeStructure: varchar('store_structure', { length: 10 }),
  source: varchar('source', { length: 30 }),
  detailDisplay: varchar('detail_display', { length: 100 }),
  filiale: varchar('filiale', { length: 6 }),
  division: varchar('division', { length: 1 }),
  owner: varchar('owner', { length: 1 }).notNull().default('S'),
  locked: varchar('locked', { length: 1 }),
})

export const cqfParameter = pgTable('cqf_parameter', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  cqfId: bigint('cqf_id', { mode: 'number' }).notNull(),
  phaseId: bigint('phase_id', { mode: 'number' }).notNull().default(1),
  paramNames: varchar('param_names', { length: 800 }).notNull(),
  paramValues: varchar('param_values', { length: 800 }),
}, (table) => [
  uniqueIndex('uq_cqf_parameter').on(table.cqfId, table.phaseId, table.paramNames),
])

export const cqfSet = pgTable('cqf_set', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  worksetId: bigint('workset_id', { mode: 'number' }).notNull(),
  cqfId: bigint('cqf_id', { mode: 'number' }).notNull(),
})
