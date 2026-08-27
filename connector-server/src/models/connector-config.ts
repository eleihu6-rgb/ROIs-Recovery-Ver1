import { pgTable, bigint, varchar, jsonb, smallint, timestamp, index } from 'drizzle-orm/pg-core'

/**
 * connector_config - 连接器注册表
 * Stores configuration for each external system connector
 */
export const connectorConfig = pgTable('connector_config', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  connectorCode: varchar('connector_code', { length: 50 }).notNull().unique(),
  connectorName: varchar('connector_name', { length: 100 }).notNull(),
  direction: varchar('direction', { length: 20 }).notNull(), // inbound | outbound
  protocol: varchar('protocol', { length: 20 }).notNull(), // poll_inbound | push_inbound | push_outbound | query_outbound | f8_import
  dataDomain: varchar('data_domain', { length: 20 }).notNull(), // flight | crew | roster
  authType: varchar('auth_type', { length: 20 }).notNull(), // api_key | oauth2_cc | f8_token
  authConfig: jsonb('auth_config').notNull().$type<AuthConfig>(),
  endpointConfig: jsonb('endpoint_config').notNull().$type<EndpointConfig>(),
  scheduleCron: varchar('schedule_cron', { length: 50 }),
  transformPlugin: varchar('transform_plugin', { length: 100 }),
  isEnabled: smallint('is_enabled').notNull().default(1),
  isDeleted: smallint('is_deleted').notNull().default(0),
  createdBy: varchar('created_by', { length: 50 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 50 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ConnectorConfig = typeof connectorConfig.$inferSelect
export type NewConnectorConfig = typeof connectorConfig.$inferInsert

/** Auth configuration stored in connector_config */
export interface AuthConfig {
  apiKey?: string
  apiSecret?: string // HMAC secret, encrypted in DB
  clientId?: string // OAuth2 client_id
  clientSecret?: string // OAuth2 client_secret, encrypted in DB
  tokenUrl?: string // OAuth2 token endpoint
  scopes?: string[] // OAuth2 scopes to request
}

/** Endpoint configuration stored in connector_config */
export interface EndpointConfig {
  url: string
  headers?: Record<string, string>
  timeout?: number // milliseconds
  retryCount?: number
  retryDelay?: number // milliseconds
  method?: 'GET' | 'POST' // HTTP method for poll requests, default GET
  pollBodyDays?: number // For POST polls: query window = today to today+N days
  chunkDays?: number // chunk size for date-range APIs (default 10)
  maxRowsPerResponse?: number // upstream row cap; capped responses are split/fail-safe
  rosterGroundUrl?: string // separate URL for roster-ground API
}
