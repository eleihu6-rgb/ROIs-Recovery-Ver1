import { pgTable, bigint, varchar, smallint, integer, timestamp, jsonb, text, index } from 'drizzle-orm/pg-core'

export const rosterPublishOutboundLog = pgTable('roster_publish_outbound_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  batchId: bigint('batch_id', { mode: 'number' }).notNull(),
  requestId: varchar('request_id', { length: 80 }).notNull(),
  requestPayload: jsonb('request_payload').notNull(),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms'),
  success: smallint('success').notNull().default(0),
}, (table) => [
  index('idx_roster_pub_out_log_batch').on(table.batchId, table.createdAt),
  index('idx_roster_pub_out_log_request').on(table.requestId, table.createdAt),
  index('idx_roster_pub_out_log_success').on(table.success, table.createdAt),
])
