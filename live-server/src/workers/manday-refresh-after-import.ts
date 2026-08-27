import type { FastifyInstance } from 'fastify'
import { recompute as recomputeManday } from '../services/manday/manday-tool.js'
import { liveSchemaName } from '../utils/db-schema.js'

interface MandayRefreshAfterImportOpts {
  startDt: string
  endDt: string
  updatedBy: string
  logMessage: string
}

export async function refreshMandayAfterImport(
  fastify: FastifyInstance,
  opts: MandayRefreshAfterImportOpts,
): Promise<void> {
  const result = await recomputeManday(fastify.pgPool, {
    schema: liveSchemaName(),
    startDt: opts.startDt,
    endDt: opts.endDt,
    updatedBy: opts.updatedBy,
  })
  fastify.log.info(
    { startDt: opts.startDt, endDt: opts.endDt, ...result },
    opts.logMessage,
  )
}
