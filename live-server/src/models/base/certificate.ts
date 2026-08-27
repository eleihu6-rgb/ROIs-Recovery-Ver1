import { pgTable, bigint, varchar, integer, smallint, timestamp } from 'drizzle-orm/pg-core'

export const certificate = pgTable('certificate', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  certificate: varchar('certificate', { length: 20 }).notNull(),
  description: varchar('description', { length: 100 }),
  divisions: varchar('divisions', { length: 10 }).notNull(),
  certificateGroup: varchar('certificate_group', { length: 40 }),
  displayIndicator: smallint('display_indicator').notNull().default(0),
  crewFilterIndicator: smallint('crew_filter_indicator').notNull().default(0),
  editorFilterLabel: varchar('editor_filter_label', { length: 80 }),
  isDisplayInHeaderpane: smallint('is_display_in_headerpane').notNull().default(0),
  headerpaneText: varchar('headerpane_text', { length: 20 }),
  headerpaneTextColor: varchar('headerpane_text_color', { length: 10 }),
  displayOrder: integer('display_order'),
  certificateType: varchar('certificate_type', { length: 40 }).notNull().default('O'),
  abbr: varchar('abbr', { length: 10 }),
})
