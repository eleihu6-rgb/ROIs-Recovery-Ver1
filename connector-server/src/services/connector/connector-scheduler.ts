import type { FastifyInstance } from 'fastify'
import { connectorConfigService } from './connector-config-service.js'

export class ConnectorScheduler {
  private fastify: FastifyInstance | null = null

  setFastify(fastify: FastifyInstance) {
    this.fastify = fastify
  }

  /**
   * Schedule a connector for periodic execution
   * Only for poll_inbound protocol
   */
  async schedulePollInbound(connectorCode: string, cron: string): Promise<void> {
    if (!this.fastify) {
      throw new Error('Fastify instance not set')
    }

    await this.fastify.queues.pollTrigger.add(
      'poll',
      { connectorCode },
      {
        repeat: { pattern: cron },
        jobId: `poll:${connectorCode}`,
      }
    )
    this.fastify.log.info({ connectorCode, cron }, 'Scheduled poll inbound')
  }

  /**
   * Remove scheduled job for a connector
   */
  async unschedulePollInbound(connectorCode: string): Promise<void> {
    if (!this.fastify) {
      throw new Error('Fastify instance not set')
    }

    const repeatableJobs = await this.fastify.queues.pollTrigger.getRepeatableJobs()
    const job = repeatableJobs.find(j => j.id === `poll:${connectorCode}`)
    if (job) {
      await this.fastify.queues.pollTrigger.removeRepeatableByKey(job.key)
      this.fastify.log.info({ connectorCode }, 'Unscheduled poll inbound')
    }
  }

  /**
   * Trigger a manual poll for a connector (non-repeating)
   */
  async triggerNow(connectorCode: string): Promise<void> {
    if (!this.fastify) {
      throw new Error('Fastify instance not set')
    }

    await this.fastify.queues.pollTrigger.add('poll', { connectorCode }, {
      jobId: `manual:${connectorCode}:${Date.now()}`,
    })
  }
}

export const connectorScheduler = new ConnectorScheduler()