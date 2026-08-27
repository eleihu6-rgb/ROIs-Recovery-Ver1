import { pgTable, bigint, varchar, timestamp } from 'drizzle-orm/pg-core'

export const pairingMemo = pgTable('pairing_memo', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  pairingId: bigint('pairing_id', { mode: 'number' }),
  memo: varchar('memo', { length: 300 }),
  userId: varchar('user_id', { length: 30 }).notNull().default('system'),
  status: varchar('status', { length: 10 }),
  tmst: timestamp('tmst').notNull().defaultNow(),
})
