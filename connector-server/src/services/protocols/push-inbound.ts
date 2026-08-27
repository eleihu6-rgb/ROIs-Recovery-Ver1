import { ProtocolHandler, ExecuteResult } from './protocol-handler.js'
import { ConnectorConfig } from '../../models/index.js'
import { getTransform, StandardRecord } from '../../transform/index.js'
import { apiKeyAuth } from '../auth/index.js'
import type { Queue } from 'bullmq'

interface PushInboundExtra {
  rawData: unknown
  sourceRef?: string
}

/**
 * Push inbound handler
 * Receives data pushed from external systems
 * Called by Fastify route handler after authentication
 */
export class PushInboundHandler implements ProtocolHandler {
  private queue: Queue

  constructor(queue: Queue) {
    this.queue = queue
  }

  /**
   * Process pushed data
   * This is called after the route handler verifies authentication
   */
  async execute(
    config: ConnectorConfig,
    extra?: unknown
  ): Promise<ExecuteResult> {
    const startTime = Date.now()
    const transform = getTransform(config.transformPlugin)
    const { rawData, sourceRef } = (extra as PushInboundExtra) || { rawData: null }

    try {
      // Handle array or single record
      const records: unknown[] = Array.isArray(rawData) ? rawData : rawData ? [rawData] : []

      // Transform to standard format
      const standardRecords: StandardRecord[] = records.map(raw => {
        try {
          return transform.toStandard(raw)
        } catch (err) {
          console.error('Transform error:', err)
          return null
        }
      }).filter((r): r is StandardRecord => r !== null)

      // Create sourceRef for deduplication if not provided
      const finalSourceRef = sourceRef || `push:${config.connectorCode}:${Date.now()}`

      // Push to BullMQ queue
      await this.queue.add('inbound', {
        connectorCode: config.connectorCode,
        schema: '', // Will be determined by connectorConfig lookup in live-server
        dataType: config.dataDomain as 'flight' | 'crew',
        records: standardRecords,
        sourceRef: finalSourceRef,
      }, {
        jobId: finalSourceRef,
        removeOnComplete: true,
      })

      return {
        status: standardRecords.length === records.length ? 'success' : 'partial',
        recordsIn: records.length,
        recordsOut: standardRecords.length,
        durationMs: Date.now() - startTime,
      }
    } catch (err) {
      return {
        status: 'fail',
        recordsIn: 0,
        recordsOut: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      }
    }
  }

  /**
   * Verify push request authentication
   * Called by route handler before processing data
   */
  verifyAuth(
    config: ConnectorConfig,
    timestamp: number,
    body: string,
    signature: string
  ): boolean {
    if (config.authType === 'api_key') {
      return apiKeyAuth.verifySignature(config, timestamp, body, signature)
    }
    // OAuth2 JWT verification handled by auth plugin
    return true
  }
}