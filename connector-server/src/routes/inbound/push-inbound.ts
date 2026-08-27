import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { success, fail, error } from '../../utils/response.js'
import { connectorConfigService } from '../../services/connector/index.js'
import { PushInboundHandler } from '../../services/protocols/index.js'

const inboundSchema = z.object({
  data: z.union([z.object({}), z.array(z.object({}))]),
  sourceRef: z.string().optional(),
})

interface InboundParams {
  connectorCode: string
}

/**
 * Push inbound routes
 * POST /api/inbound/:connectorCode/flight
 * POST /api/inbound/:connectorCode/crew
 */
export const inboundRoutes = async (fastify: FastifyInstance) => {
  const flightHandler = new PushInboundHandler(fastify.queues.flightInbound)
  const crewHandler = new PushInboundHandler(fastify.queues.crewInbound)

  // Flight inbound
  fastify.post<{
    Params: InboundParams
    Body: z.infer<typeof inboundSchema>
  }>('/flight/:connectorCode', async (request, reply) => {
    const { connectorCode } = request.params

    // Validate body
    const parseResult = inboundSchema.safeParse(request.body)
    if (!parseResult.success) {
      return fail(reply, 400, `Invalid request body: ${parseResult.error.message}`)
    }

    // Get connector config
    const config = await connectorConfigService.getConfig(connectorCode)
    if (!config) {
      return fail(reply, 404, `Connector '${connectorCode}' not found`)
    }

    if (!config.isEnabled || config.isDeleted) {
      return fail(reply, 403, `Connector '${connectorCode}' is disabled`)
    }

    if (config.protocol !== 'push_inbound' || config.dataDomain !== 'flight') {
      return fail(reply, 400, `Connector '${connectorCode}' is not configured for flight push inbound`)
    }

    // Verify HMAC signature if API Key auth
    if (config.authType === 'api_key') {
      const apiKey = request.headers['x-api-key'] as string
      const timestamp = parseInt(request.headers['x-timestamp'] as string)
      const signature = request.headers['x-signature'] as string
      const body = JSON.stringify(request.body)

      if (!flightHandler.verifyAuth(config, timestamp, body, signature)) {
        return error(reply, 401, 'Invalid HMAC signature')
      }
    }

    // Process inbound data
    const result = await flightHandler.execute(config, {
      rawData: parseResult.data.data,
      sourceRef: parseResult.data.sourceRef,
    })

    if (result.status === 'fail') {
      return fail(reply, 500, result.errorMessage || 'Processing failed')
    }

    return success(reply, {
      status: result.status,
      recordsIn: result.recordsIn,
      recordsOut: result.recordsOut,
      durationMs: result.durationMs,
    })
  })

  // Crew inbound
  fastify.post<{
    Params: InboundParams
    Body: z.infer<typeof inboundSchema>
  }>('/crew/:connectorCode', async (request, reply) => {
    const { connectorCode } = request.params

    // Validate body
    const parseResult = inboundSchema.safeParse(request.body)
    if (!parseResult.success) {
      return fail(reply, 400, `Invalid request body: ${parseResult.error.message}`)
    }

    // Get connector config
    const config = await connectorConfigService.getConfig(connectorCode)
    if (!config) {
      return fail(reply, 404, `Connector '${connectorCode}' not found`)
    }

    if (!config.isEnabled || config.isDeleted) {
      return fail(reply, 403, `Connector '${connectorCode}' is disabled`)
    }

    if (config.protocol !== 'push_inbound' || config.dataDomain !== 'crew') {
      return fail(reply, 400, `Connector '${connectorCode}' is not configured for crew push inbound`)
    }

    // Verify HMAC signature if API Key auth
    if (config.authType === 'api_key') {
      const apiKey = request.headers['x-api-key'] as string
      const timestamp = parseInt(request.headers['x-timestamp'] as string)
      const signature = request.headers['x-signature'] as string
      const body = JSON.stringify(request.body)

      if (!crewHandler.verifyAuth(config, timestamp, body, signature)) {
        return error(reply, 401, 'Invalid HMAC signature')
      }
    }

    // Process inbound data
    const result = await crewHandler.execute(config, {
      rawData: parseResult.data.data,
      sourceRef: parseResult.data.sourceRef,
    })

    if (result.status === 'fail') {
      return fail(reply, 500, result.errorMessage || 'Processing failed')
    }

    return success(reply, {
      status: result.status,
      recordsIn: result.recordsIn,
      recordsOut: result.recordsOut,
      durationMs: result.durationMs,
    })
  })
}