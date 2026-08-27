import { ProtocolHandler, ExecuteResult } from './protocol-handler.js'
import { ConnectorConfig, EndpointConfig } from '../../models/index.js'
import { getTransform, StandardRecord } from '../../transform/index.js'
import { oauth2Auth, f8TokenAuth } from '../auth/index.js'
import type { Queue } from 'bullmq'

interface PollInboundConfig {
  startDt?: string // Start date for POST body (YYYY-MM-DD)
  endDt?: string // End date for POST body (YYYY-MM-DD)
  fromTime?: string // ISO datetime for incremental polling (GET)
  toTime?: string
}

/**
 * Poll inbound handler
 * Polls external API on schedule to fetch data
 * Supports GET and POST methods with retry logic
 */
export class PollInboundHandler implements ProtocolHandler {
  private queue: Queue

  constructor(queue: Queue) {
    this.queue = queue
  }

  async execute(config: ConnectorConfig, pollConfig?: PollInboundConfig): Promise<ExecuteResult> {
    const startTime = Date.now()
    const transform = getTransform(config.transformPlugin)

    try {
      const endpointConfig = config.endpointConfig as EndpointConfig
      const method = endpointConfig.method || 'GET'

      // Get initial access token
      let accessToken = await this.getAccessToken(config)

      // Build request with auth headers
      const headers: Record<string, string> = {
        ...endpointConfig.headers,
      }

      // Add authentication header based on auth type
      if (config.authType === 'f8_token') {
        headers['AuthorizationToken'] = accessToken
      } else if (config.authType === 'oauth2_cc') {
        headers['Authorization'] = `Bearer ${accessToken}`
      }

      // Build URL and body based on method
      let url = endpointConfig.url
      let body: string | undefined

      if (method === 'POST') {
        // For POST, build JSON body with date range
        const { startDt, endDt } = this.computeDateRange(pollConfig, endpointConfig.pollBodyDays)
        body = JSON.stringify({ startDt, endDt })
      } else {
        // For GET, use query params
        if (pollConfig?.fromTime || pollConfig?.toTime) {
          const params = new URLSearchParams()
          if (pollConfig.fromTime) params.set('from', pollConfig.fromTime)
          if (pollConfig.toTime) params.set('to', pollConfig.toTime)
          url = `${url}?${params.toString()}`
        }
      }

      // Retry loop
      const retryCount = endpointConfig.retryCount || 0
      const retryDelay = endpointConfig.retryDelay || 1000
      let lastError: string | undefined
      let tokenRefreshed = false

      for (let attempt = 0; attempt <= retryCount; attempt++) {
        if (attempt > 0) {
          await this.sleep(retryDelay)
        }

        try {
          const response = await fetch(url, {
            method,
            headers,
            body,
            signal: endpointConfig.timeout
              ? AbortSignal.timeout(endpointConfig.timeout)
              : undefined,
          })

          // Handle 401/403 - refresh token and retry once
          if ((response.status === 401 || response.status === 403) && !tokenRefreshed) {
            tokenRefreshed = true
            // Re-fetch token
            accessToken = await this.getAccessToken(config, true)
            if (config.authType === 'f8_token') {
              headers['AuthorizationToken'] = accessToken
            } else if (config.authType === 'oauth2_cc') {
              headers['Authorization'] = `Bearer ${accessToken}`
            }
            // Don't count this as a retry attempt
            attempt--
            continue
          }

          if (!response.ok) {
            lastError = `External API returned ${response.status}`
            continue
          }

          const rawData = await response.json()

          // Handle array or single record
          const records: unknown[] = Array.isArray(rawData) ? rawData : [rawData]

          // Transform to standard format
          const standardRecords: StandardRecord[] = records.map(raw => {
            try {
              return transform.toStandard(raw)
            } catch (err) {
              console.error('Transform error:', err)
              return null
            }
          }).filter((r): r is StandardRecord => r !== null)

          // Create sourceRef for deduplication
          const sourceRef = `poll:${config.connectorCode}:${Date.now()}`

          // Push to BullMQ queue
          await this.queue.add('inbound', {
            connectorCode: config.connectorCode,
            schema: '', // Will be determined by connectorConfig lookup in live-server
            dataType: config.dataDomain as 'flight' | 'crew',
            records: standardRecords,
            sourceRef,
          }, {
            jobId: `${sourceRef}`,
            removeOnComplete: true,
          })

          return {
            status: standardRecords.length === records.length ? 'success' : 'partial',
            recordsIn: records.length,
            recordsOut: standardRecords.length,
            durationMs: Date.now() - startTime,
          }
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err)
        }
      }

      // All retries exhausted
      return {
        status: 'fail',
        recordsIn: 0,
        recordsOut: 0,
        errorMessage: lastError || 'All retry attempts exhausted',
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
   * Get access token for authentication
   */
  private async getAccessToken(config: ConnectorConfig, forceRefresh = false): Promise<string> {
    if (config.authType === 'f8_token') {
      return f8TokenAuth.getAccessToken(config, forceRefresh)
    } else if (config.authType === 'oauth2_cc') {
      return oauth2Auth.getAccessToken(config)
    } else if (config.authConfig?.apiKey) {
      return config.authConfig.apiKey
    }
    throw new Error(`Unsupported auth type: ${config.authType}`)
  }

  /**
   * Compute date range for POST body
   * Uses pollConfig if provided, otherwise computes from pollBodyDays
   */
  private computeDateRange(
    pollConfig: PollInboundConfig | undefined,
    pollBodyDays: number | undefined
  ): { startDt: string; endDt: string } {
    if (pollConfig?.startDt && pollConfig?.endDt) {
      return { startDt: pollConfig.startDt, endDt: pollConfig.endDt }
    }

    // Compute from pollBodyDays
    const days = pollBodyDays || 7
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const startDt = today.toISOString().split('T')[0]
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + days)
    const endDt = endDate.toISOString().split('T')[0]

    return { startDt, endDt }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}