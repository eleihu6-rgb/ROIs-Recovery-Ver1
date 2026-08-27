import { pgTable, bigint, varchar, integer, smallint, timestamp, index } from 'drizzle-orm/pg-core'
import { pairing } from './pairing.js'

export const pairingComposition = pgTable('pairing_composition', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  pairingId: bigint('pairing_id', { mode: 'number' }).notNull().references(() => pairing.id, { onDelete: 'restrict' }),
  division: varchar('division', { length: 2 }).notNull(),
  isDeleted: smallint('is_deleted').notNull().default(0),
  actingRank: varchar('acting_rank', { length: 30 }),
  plan: integer('plan'),
  fill: integer('fill').notNull().default(0),
  // open is GENERATED ALWAYS AS (plan - fill) STORED — never write to it
  open: integer('open'),
}, (table) => [
  index('idx_pair_comp_pair_id').on(table.pairingId),
  index('idx_pair_comp_cover').on(table.pairingId, table.actingRank, table.isDeleted),
])
