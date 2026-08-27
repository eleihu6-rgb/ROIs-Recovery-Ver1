import { pgTable, bigint, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const liveConfig = pgTable('live_config', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  filiale: varchar('filiale', { length: 6 }).notNull(),
  division: varchar('division', { length: 1 }).notNull(),
  rulesetId: bigint('ruleset_id', { mode: 'number' }).notNull(),
  ruleSetName: varchar('rule_set_name', { length: 100 }),
  defaultRulesetFlag: varchar('default_ruleset_flag', { length: 1 }),
  module: varchar('module', { length: 20 }),
}, (table) => [
  uniqueIndex('uq_live_config').on(table.filiale, table.division, table.rulesetId),
])
