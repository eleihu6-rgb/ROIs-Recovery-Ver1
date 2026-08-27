import { Worker, Job } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { format, addDays } from 'date-fns'
import { queueBaseOptions } from '../plugins/bullmq.js'
import { connectorConfigService } from '../services/connector/index.js'
import { PollInboundHandler } from '../services/protocols/index.js'
import { connectorLog, NewConnectorLog } from '../models/index.js'
import type { Queue } from 'bullmq'
import type { EndpointConfig } from '../models/index.js'
import { withPrefix, withBullmqPrefix } from '../utils/redis-key-prefix.js'

interface PollTriggerJob {
  connectorCode: string
}

/**
 * Select the appropriate inbound queue based on data domain
 */
const selectDataQueue = (fastify: FastifyInstance, dataDomain: string): Queue => {
  const map: Record<string, Queue> = {
    flight: fastify.queues.flightInbound,
    crew: fastify.queues.crewInbound,
    pairing: fastify.queues.pairingInbound,
    roster: fastify.queues.rosterInbound,
  }
  const q = map[dataDomain]
  if (!q) {
    throw new Error(`No inbound queue for dataDomain: ${dataDomain}`)
  }
  return q
}

/**
 * Create poll inbound worker
 * Consumes connector.poll.trigger jobs and executes poll handlers
 */
export const createPollInboundWorker = (fastify: FastifyInstance): Worker => {
  const worker = new Worker<PollTriggerJob>(
    withBullmqPrefix('connector.poll.trigger'),
    async (job: Job<PollTriggerJob>) => {
      const { connectorCode } = job.data
      fastify.log.info({ connectorCode }, 'Poll trigger received')

      // Load connector config from DB
      const config = await connectorConfigService.getConfig(connectorCode)
      if (!config || config.isEnabled !== 1 || config.isDeleted !== 0) {
        fastify.log.warn({ connectorCode }, 'Connector not found or disabled - skipping')
        return
      }

      // F8 Import protocol branch
      if (config.protocol === 'f8_import') {
        const { runF8ImportSync } = await import('../services/sync/f8/f8-sync-orchestrator.js')
        const startTime = Date.now()
        let syncResult = { syncId: '', filteredCount: 0, rejectionFile: null as string | null }
        let status: 'success' | 'fail' = 'success'
        let errorMessage: string | undefined

        try {
          syncResult = await runF8ImportSync(fastify, config)
        } catch (err) {
          status = 'fail'
          errorMessage = err instanceof Error ? err.message : String(err)
          fastify.log.error({ connectorCode, error: errorMessage }, 'F8 import sync failed')
        }

        const logEntry: NewConnectorLog = {
          connectorId: config.id,
          direction: 'inbound',
          status,
          recordsIn: 0,
          recordsOut: 0,
          errorMessage,
          durationMs: Date.now() - startTime,
          syncId: syncResult.syncId || undefined,
          filteredCount: syncResult.filteredCount,
          rejectionFile: syncResult.rejectionFile ?? undefined,
        }
        await fastify.db.insert(connectorLog).values(logEntry)

        fastify.log.info({ connectorCode, syncId: syncResult.syncId, status }, 'F8 import completed')
        return
      }

      const endpointConfig = config.endpointConfig as EndpointConfig
      const dataQueue = selectDataQueue(fastify, config.dataDomain)
      const handler = new PollInboundHandler(dataQueue)

      // Compute date range for POST-style polls
      let pollConfig: { startDt?: string; endDt?: string } | undefined
      if (endpointConfig.method === 'POST' && endpointConfig.pollBodyDays) {
        const today = new Date()
        pollConfig = {
          startDt: format(today, 'yyyy-MM-dd'),
          endDt: format(addDays(today, endpointConfig.pollBodyDays), 'yyyy-MM-dd'),
        }
      }

      // Execute poll handler
      const result = await handler.execute(config, pollConfig)

      // Log result to connector_log table
      const logEntry: NewConnectorLog = {
        connectorId: config.id,
        direction: 'inbound',
        status: result.status,
        recordsIn: result.recordsIn,
        recordsOut: result.recordsOut,
        errorMessage: result.errorMessage,
        durationMs: result.durationMs,
      }
      await fastify.db.insert(connectorLog).values(logEntry)

      fastify.log.info({
        connectorCode,
        status: result.status,
        recordsIn: result.recordsIn,
        recordsOut: result.recordsOut,
        durationMs: result.durationMs,
      }, 'Poll inbound completed')
    },
    {
      ...queueBaseOptions,
      concurrency: 3,
    }
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, error: err.message }, 'Poll trigger job failed')
  })

  return worker
}