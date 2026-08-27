import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { eq, desc, and, gte, lte, SQL } from 'drizzle-orm'
import { success, fail } from '../../utils/response.js'
import { connectorConfig, connectorLog, NewConnectorConfig } from '../../models/index.js'
import { connectorConfigService, connectorScheduler } from '../../services/connector/index.js'
import { PollInboundHandler } from '../../services/protocols/index.js'
import { maskConnectorConfig } from '../../utils/mask-config.js'

const connectorSchema = z.object({
  connectorCode: z.string().max(50),
  connectorName: z.string().max(100),
  direction: z.enum(['inbound', 'outbound']),
  protocol: z.enum(['poll_inbound', 'push_inbound', 'push_outbound', 'query_outbound', 'f8_import']),
  dataDomain: z.enum(['flight', 'crew', 'roster']),
  authType: z.enum(['api_key', 'oauth2_cc']),
  authConfig: z.object({
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    tokenUrl: z.string().optional(),
    scopes: z.array(z.string()).optional(),
  }),
  endpointConfig: z.object({
    url: z.string(),
    headers: z.record(z.string()).optional(),
    timeout: z.number().optional(),
    retryCount: z.number().optional(),
    retryDelay: z.number().optional(),
  }),
  scheduleCron: z.string().max(50).optional(),
  transformPlugin: z.string().max(100).optional(),
  isEnabled: z.number().int().min(0).max(1).default(1),
})

const logQuerySchema = z.object({
  connectorId: z.coerce.number().int().optional(),
  status: z.enum(['success', 'fail', 'partial']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
})

const queryBoolean = z.preprocess(
  (value) => value === true || value === 'true' || value === '1',
  z.boolean(),
)

const f8ImportScopeSchema = z.object({
  flight: queryBoolean.optional(),
  pairing: queryBoolean.optional(),
  roster: queryBoolean.optional(),
  rosterGround: queryBoolean.optional(),
  crew: queryBoolean.optional(),
  manday: queryBoolean.optional(),
})

interface IdParams {
  id: string
}

/**
 * Admin routes
 * Requires connector:admin scope
 */
export const adminRoutes = async (fastify: FastifyInstance) => {
  // List connectors
  fastify.get('/connectors', async (request: FastifyRequest, reply: FastifyReply) => {
    const configs = await fastify.db
      .select()
      .from(connectorConfig)
      .orderBy(desc(connectorConfig.createdAt))

    return success(reply, configs.map(maskConnectorConfig))
  })

  // Get connector by ID
  fastify.get<{
    Params: IdParams
  }>('/connectors/:id', async (request, reply) => {
    const id = parseInt(request.params.id)
    if (!id) {
      return fail(reply, 400, 'Invalid connector ID')
    }

    const result = await fastify.db
      .select()
      .from(connectorConfig)
      .where(eq(connectorConfig.id, id))
      .limit(1)

    if (result.length === 0) {
      return fail(reply, 404, 'Connector not found')
    }

    return success(reply, maskConnectorConfig(result[0]))
  })

  // Create connector
  fastify.post<{
    Body: z.infer<typeof connectorSchema>
  }>('/connectors', async (request, reply) => {
    const parseResult = connectorSchema.safeParse(request.body)
    if (!parseResult.success) {
      return fail(reply, 400, `Invalid request: ${parseResult.error.message}`)
    }

    const data = parseResult.data
    const admin = request.authAdmin

    const newConfig: NewConnectorConfig = {
      ...data,
      createdBy: admin?.userCode || 'system',
      updatedBy: admin?.userCode || 'system',
    }

    const result = await fastify.db
      .insert(connectorConfig)
      .values(newConfig)
      .returning()

    // Schedule poll_inbound if enabled
    if (data.protocol === 'poll_inbound' && data.scheduleCron && data.isEnabled) {
      await connectorScheduler.schedulePollInbound(data.connectorCode, data.scheduleCron)
    }

    return success(reply, maskConnectorConfig(result[0]))
  })

  // Update connector
  fastify.put<{
    Params: IdParams
    Body: Partial<z.infer<typeof connectorSchema>>
  }>('/connectors/:id', async (request, reply) => {
    const id = parseInt(request.params.id)
    if (!id) {
      return fail(reply, 400, 'Invalid connector ID')
    }

    const admin = request.authAdmin

    const existing = await fastify.db
      .select()
      .from(connectorConfig)
      .where(eq(connectorConfig.id, id))
      .limit(1)

    if (existing.length === 0) {
      return fail(reply, 404, 'Connector not found')
    }

    const oldConfig = existing[0]
    const updates = request.body as Partial<z.infer<typeof connectorSchema>>

    await fastify.db
      .update(connectorConfig)
      .set({
        ...updates,
        updatedBy: admin?.userCode || 'system',
        updatedAt: new Date(),
      })
      .where(eq(connectorConfig.id, id))

    // Invalidate cache
    await connectorConfigService.invalidateCache(oldConfig.connectorCode)

    // Handle schedule changes
    if (oldConfig.protocol === 'poll_inbound') {
      if (!updates.isEnabled || !updates.scheduleCron) {
        await connectorScheduler.unschedulePollInbound(oldConfig.connectorCode)
      } else if (updates.scheduleCron && updates.scheduleCron !== oldConfig.scheduleCron) {
        await connectorScheduler.unschedulePollInbound(oldConfig.connectorCode)
        await connectorScheduler.schedulePollInbound(oldConfig.connectorCode, updates.scheduleCron)
      }
    }

    const result = await fastify.db
      .select()
      .from(connectorConfig)
      .where(eq(connectorConfig.id, id))
      .limit(1)

    return success(reply, maskConnectorConfig(result[0]))
  })

  // Delete connector (soft delete)
  fastify.delete<{
    Params: IdParams
  }>('/connectors/:id', async (request, reply) => {
    const id = parseInt(request.params.id)
    if (!id) {
      return fail(reply, 400, 'Invalid connector ID')
    }

    const admin = request.authAdmin

    const existing = await fastify.db
      .select()
      .from(connectorConfig)
      .where(eq(connectorConfig.id, id))
      .limit(1)

    if (existing.length === 0) {
      return fail(reply, 404, 'Connector not found')
    }

    const oldConfig = existing[0]

    await fastify.db
      .update(connectorConfig)
      .set({
        isDeleted: 1,
        isEnabled: 0,
        updatedBy: admin?.userCode || 'system',
        updatedAt: new Date(),
      })
      .where(eq(connectorConfig.id, id))

    // Invalidate cache and unschedule
    await connectorConfigService.invalidateCache(oldConfig.connectorCode)
    if (oldConfig.protocol === 'poll_inbound') {
      await connectorScheduler.unschedulePollInbound(oldConfig.connectorCode)
    }

    return success(reply, { deleted: true })
  })

  // Trigger connector execution (manual)
  fastify.post<{
    Params: IdParams
  }>('/connectors/:id/trigger', async (request, reply) => {
    const id = parseInt(request.params.id)
    if (!id) {
      return fail(reply, 400, 'Invalid connector ID')
    }

    const config = await fastify.db
      .select()
      .from(connectorConfig)
      .where(eq(connectorConfig.id, id))
      .limit(1)

    if (config.length === 0) {
      return fail(reply, 404, 'Connector not found')
    }

    const c = config[0]
    if (!c.isEnabled || c.isDeleted) {
      return fail(reply, 403, 'Connector is disabled')
    }

    // Execute based on protocol
    if (c.protocol === 'f8_import') {
      const { runF8ImportSync } = await import('../../services/sync/f8/f8-sync-orchestrator.js')
      const startTime = Date.now()
      const query = request.query as Record<string, string> | undefined
      const overrideStartDt = query?.startDt
      const overrideEndDt = query?.endDt
      const scopeParse = f8ImportScopeSchema.safeParse(query ?? {})
      if (!scopeParse.success) {
        return fail(reply, 400, `Invalid F8 import scope: ${scopeParse.error.message}`)
      }

      let syncResult: Awaited<ReturnType<typeof runF8ImportSync>> = {
        syncId: '',
        filteredCount: 0,
        rejectionFile: null as string | null,
        timings: [],
        queueJobs: [],
      }
      let status: 'success' | 'fail' = 'success'
      let errorMessage: string | undefined

      try {
        const importId = query?.importId
        syncResult = await runF8ImportSync(fastify, c, overrideStartDt, overrideEndDt, scopeParse.data, importId)
      } catch (err) {
        status = 'fail'
        errorMessage = err instanceof Error ? err.message : String(err)
      }

      await fastify.db.insert(connectorLog).values({
        connectorId: c.id,
        direction: 'inbound',
        status,
        recordsIn: 0,
        recordsOut: 0,
        errorMessage,
        durationMs: Date.now() - startTime,
        syncId: syncResult.syncId || undefined,
        filteredCount: syncResult.filteredCount,
        rejectionFile: syncResult.rejectionFile ?? undefined,
      })

      return success(reply, { ...syncResult, status })
    }

    if (c.protocol === 'poll_inbound') {
      const queue = c.dataDomain === 'flight'
        ? fastify.queues.flightInbound
        : fastify.queues.crewInbound
      const handler = new PollInboundHandler(queue)
      const result = await handler.execute(c)

      // Log execution
      await fastify.db.insert(connectorLog).values({
        connectorId: c.id,
        direction: 'inbound',
        status: result.status,
        recordsIn: result.recordsIn,
        recordsOut: result.recordsOut,
        errorMessage: result.errorMessage,
        durationMs: result.durationMs,
      })

      return success(reply, result)
    }

    return fail(reply, 400, 'Manual trigger only supports poll_inbound and f8_import protocols')
  })

  // Query logs
  fastify.get<{
    Querystring: z.infer<typeof logQuerySchema>
  }>('/connectors/logs', async (request, reply) => {
    const query = logQuerySchema.parse(request.query)
    const { connectorId, status, from, to, page, size } = query

    const conditions: SQL[] = []

    if (connectorId) {
      conditions.push(eq(connectorLog.connectorId, connectorId))
    }
    if (status) {
      conditions.push(eq(connectorLog.status, status))
    }
    if (from) {
      conditions.push(gte(connectorLog.executedAt, new Date(from)))
    }
    if (to) {
      conditions.push(lte(connectorLog.executedAt, new Date(to)))
    }

    const logs = await fastify.db
      .select()
      .from(connectorLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(connectorLog.executedAt))
      .limit(size)
      .offset((page - 1) * size)

    return success(reply, logs)
  })
}
