import { pgTable, bigint, varchar, integer, smallint, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const rule = pgTable('rule', {
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
  category: varchar('category', { length: 30 }).notNull(),
  storeStructure: varchar('store_structure', { length: 10 }),
  source: varchar('source', { length: 30 }),
  detail: varchar('detail', { length: 400 }),
  overridability: varchar('overridability', { length: 1 }),
  severity: smallint('severity').notNull(),
  filiale: varchar('filiale', { length: 6 }).notNull(),
  division: varchar('division', { length: 1 }).notNull(),
  owner: varchar('owner', { length: 1 }).notNull().default('S'),
  locked: varchar('locked', { length: 1 }),
  exceptionCode: varchar('exception_code', { length: 48 }),
  // Faithful JSON mirror of legacy rule_parameter CSV — {"tables":[{"header":[...],"rows":[[...]]}]}.
  // Preserves applicability columns (Bases/Ranks/Fleets/Crew Teams) dropped by the new rule_instance model.
  paramJson: jsonb('param_json'),
})

export const ruleSet = pgTable('rule_set', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  worksetId: bigint('workset_id', { mode: 'number' }).notNull(),
  ruleId: bigint('rule_id', { mode: 'number' }).notNull(),
})
