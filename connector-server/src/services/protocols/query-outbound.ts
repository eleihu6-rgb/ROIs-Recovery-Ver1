import { ProtocolHandler, ExecuteResult } from './protocol-handler.js'
import { ConnectorConfig, ConnectorLog } from '../../models/index.js'
import { getTransform, StandardRecord } from '../../transform/index.js'
import type { FastifyInstance } from 'fastify'

interface QueryParams {
  from: string // ISO datetime
  to: string // ISO datetime
  page?: number
  size?: number
}

interface QueryResult {
  status: 'success' | 'fail'
  records: unknown[]
  total: number
  page: number
  size: number
}

/**
 * Query outbound handler
 * Provides incremental query interface for external systems
 * Reads directly from PostgreSQL to avoid additional API in live-server
 */
export class QueryOutboundHandler implements ProtocolHandler {
  private fastify: FastifyInstance

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify
  }

  /**
   * Query roster data incrementally
   * This is called by the route handler after authentication
   */
  async query(
    config: ConnectorConfig,
    params: QueryParams
  ): Promise<QueryResult> {
    const transform = getTransform(config.transformPlugin)
    const page = params.page || 1
    const size = Math.min(params.size || 100, 1000) // Max 1000 per page

    try {
      // Query roster data from PostgreSQL
      // Note: Actual query implementation will depend on live-server schema
      // This is a placeholder that should be customized per airline
      const result = await this.queryRosterFromDb(config, params)

      // Transform to external format
      const externalRecords = result.records.map(record =>
        transform.fromStandard({
          recordType: 'roster',
          data: record,
        })
      )

      return {
        status: 'success',
        records: externalRecords,
        total: result.total,
        page,
        size,
      }
    } catch (err) {
      return {
        status: 'fail',
        records: [],
        total: 0,
        page,
        size,
      }
    }
  }

  /**
   * Query roster from database
   * Placeholder - actual implementation needs live-server schema integration
   */
  private async queryRosterFromDb(
    config: ConnectorConfig,
    params: QueryParams
  ): Promise<{ records: Record<string, unknown>[]; total: number }> {
    // TODO: Implement actual database query
    // This requires knowledge of live-server's roster schema
    // For now, return empty result
    return {
      records: [],
      total: 0,
    }
  }

  /**
   * Execute method for ProtocolHandler interface
   * Note: Query outbound is passive, so execute is mainly for logging
   */
  async execute(config: ConnectorConfig): Promise<ExecuteResult> {
    // Query outbound is triggered by external request, not by schedule
    // This method is used for logging/metrics only
    return {
      status: 'success',
      recordsIn: 0,
      recordsOut: 0,
      durationMs: 0,
    }
  }
}