import { pgTable, bigint, varchar, integer, text, timestamp, index } from 'drizzle-orm/pg-core'
import { connectorConfig } from './connector-config.js'

/**
 * connector_log - 执行日志
 * Records execution history for each connector run
 */
export const connectorLog = pgTable('connector_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  connectorId: bigint('connector_id', { mode: 'number' }).notNull().references(() => connectorConfig.id),
  direction: varchar('direction', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(), // success | fail | partial
  recordsIn: integer('records_in').notNull().default(0),
  recordsOut: integer('records_out').notNull().default(0),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms'),
  syncId: varchar('sync_id', { length: 36 }),
  filteredCount: integer('filtered_count').notNull().default(0),
  rejectionFile: varchar('rejection_file', { length: 500 }),
  executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_connector_log_executed_at').on(table.executedAt),
  index('idx_connector_log_sync_id').on(table.syncId),
])

export type ConnectorLog = typeof connectorLog.$inferSelect
export type NewConnectorLog = typeof connectorLog.$inferInsert