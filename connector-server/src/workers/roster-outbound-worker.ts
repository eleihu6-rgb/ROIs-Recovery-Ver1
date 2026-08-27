import { Worker, Job } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { queueBaseOptions } from '../plugins/bullmq.js'
import { connectorConfigService } from '../services/connector/index.js'
import { PushOutboundHandler } from '../services/protocols/index.js'
import { connectorLog, NewConnectorLog } from '../models/index.js'
import { withPrefix, withBullmqPrefix } from '../utils/redis-key-prefix.js'

interface OutboundJobData {
  rosterIds?: number[]
  schema: string
  publishedBy: string
  publishedAt: string
  payload?: {
    requestId: string
    rosters?: unknown[]
  }
}

const rawErrorDetails = (err: unknown): string =>
  err instanceof Error ? err.stack ?? err.message : String(err)

/**
 * Roster outbound worker
 * Consumes connector:roster:outbound queue and pushes to external systems
 */
export const createRosterOutboundWorker = (fastify: FastifyInstance): Worker => {
  const worker = new Worker<OutboundJobData>(
    withBullmqPrefix('connector.roster.outbound'),
    async (job: Job<OutboundJobData>) => {
      const { rosterIds = [], schema, publishedBy, publishedAt, payload } = job.data

      fastify.log.info({
        jobId: job.id,
        rosterIds,
        requestId: payload?.requestId,
        schema,
        publishedBy,
        publishedAt,
      }, 'Processing roster outbound job')

      // Get all enabled outbound connectors for roster domain
      const connectors = (await connectorConfigService.getEnabledOutboundConnectors('roster'))
        .filter((connector) => connector.protocol === 'push_outbound')

      if (connectors.length === 0) {
        fastify.log.info('No enabled outbound connectors for roster')
        return { pushed: 0, results: [] }
      }

      // Push to each connector
      const handler = new PushOutboundHandler()
      const results: Array<{
        connectorCode: string
        status: string
        responseStatus?: number
        responseBody?: string
        errorMessage?: string
      }> = []

      for (const connector of connectors) {
        try {
          const result = await handler.execute(connector, {
            payload,
            records: [],
            recordCount: payload?.rosters?.length ?? rosterIds.length,
          })

          // Log execution
          const logEntry: NewConnectorLog = {
            connectorId: connector.id,
            direction: 'outbound',
            status: result.status,
            recordsIn: result.recordsIn,
            recordsOut: result.recordsOut,
            errorMessage: result.errorMessage,
            durationMs: result.durationMs,
          }

          await fastify.db.insert(connectorLog).values(logEntry)

          results.push({
            connectorCode: connector.connectorCode,
            status: result.status,
            responseStatus: result.responseStatus,
            responseBody: result.responseBody,
            errorMessage: result.errorMessage,
          })

          fastify.log.info({
            connectorCode: connector.connectorCode,
            requestId: payload?.requestId,
            status: result.status,
            recordsIn: result.recordsIn,
            recordsOut: result.recordsOut,
            responseStatus: result.responseStatus,
            responseBody: result.responseBody,
            errorMessage: result.errorMessage,
            durationMs: result.durationMs,
          }, 'Outbound push completed')
        } catch (err) {
          fastify.log.error({
            connectorCode: connector.connectorCode,
            error: rawErrorDetails(err),
          }, 'Outbound push failed')

          results.push({
            connectorCode: connector.connectorCode,
            status: 'fail',
            errorMessage: rawErrorDetails(err),
          })
        }
      }

      return { pushed: results.length, results }
    },
    {
      ...queueBaseOptions,
      concurrency: 1, // Process one job at a time for roster outbound
    }
  )

  worker.on('completed', (job) => {
    fastify.log.info({ jobId: job.id }, 'Roster outbound job completed')
  })

  worker.on('failed', (job, err) => {
    fastify.log.error({
      jobId: job?.id,
      error: err.message,
    }, 'Roster outbound job failed')
  })

  return worker
}
