import { pgTable, bigint, varchar, integer, smallint, timestamp } from 'drizzle-orm/pg-core'

export const language = pgTable('language', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  language: varchar('language', { length: 20 }).notNull(),
  description: varchar('description', { length: 100 }),
  filiale: varchar('filiale', { length: 6 }).notNull(),
  division: varchar('division', { length: 1 }).notNull(),
  languageGroup: varchar('language_group', { length: 40 }),
  displayIndicator: smallint('display_indicator').notNull().default(0),
  crewFilterIndicator: smallint('crew_filter_indicator').notNull().default(0),
  editorFilterLabel: varchar('editor_filter_label', { length: 40 }),
  isDisplayInHeaderpane: smallint('is_display_in_headerpane').notNull().default(0),
  headerpaneText: varchar('headerpane_text', { length: 10 }),
  headerpaneTextColor: varchar('headerpane_text_color', { length: 10 }),
  displayOrder: integer('display_order'),
  languageLevel: varchar('language_level', { length: 1 }),
})
