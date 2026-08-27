import { pgTable, bigint, varchar, integer, smallint, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const rank = pgTable('rank', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  rank: varchar('rank', { length: 10 }).notNull(),
  division: varchar('division', { length: 10 }).notNull(),
  displayOrder: integer('display_order').notNull(),
  description: varchar('description', { length: 100 }),
  isIncludeInFt: smallint('is_include_in_ft').notNull().default(1),
  isActingRank: smallint('is_acting_rank').notNull().default(1),
  isCrewRank: smallint('is_crew_rank').notNull().default(1),
  isMustCrewRank: smallint('is_must_crew_rank').notNull().default(0),
}, (table) => [
  uniqueIndex('uq_rank_code').on(table.rank),
])

export const rankActing = pgTable('rank_acting', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  filiale: varchar('filiale', { length: 6 }).notNull(),
  activeRank: varchar('active_rank', { length: 10 }).notNull(),
  actingRank: varchar('acting_rank', { length: 10 }).notNull(),
  qual: varchar('qual', { length: 10 }),
}, (table) => [
  uniqueIndex('uq_rank_acting').on(table.filiale, table.activeRank, table.actingRank, table.qual),
])

export const rankPosition = pgTable('rank_position', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  rank: varchar('rank', { length: 10 }).notNull(),
  position: varchar('position', { length: 20 }).notNull(),
  division: varchar('division', { length: 2 }).notNull(),
  displayOrder: integer('display_order').notNull(),
  description: varchar('description', { length: 100 }),
})
