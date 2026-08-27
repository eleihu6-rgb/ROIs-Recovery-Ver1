import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { success, fail, error } from '../../utils/response.js'
import { connectorConfigService } from '../../services/connector/index.js'
import { QueryOutboundHandler } from '../../services/protocols/index.js'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(1000).default(100),
})

interface OutboundParams {
  connectorCode: string
}

/**
 * Query outbound routes
 * GET /api/outbound/:connectorCode/roster
 */
export const outboundRoutes = async (fastify: FastifyInstance) => {
  const handler = new QueryOutboundHandler(fastify)

  // Roster outbound query
  fastify.get<{
    Params: OutboundParams
    Querystring: z.infer<typeof querySchema>
  }>('/roster/:connectorCode', async (request, reply) => {
    const { connectorCode } = request.params

    // Validate query
    const parseResult = querySchema.safeParse(request.query)
    if (!parseResult.success) {
      return fail(reply, 400, `Invalid query parameters: ${parseResult.error.message}`)
    }

    // Get connector config
    const config = await connectorConfigService.getConfig(connectorCode)
    if (!config) {
      return fail(reply, 404, `Connector '${connectorCode}' not found`)
    }

    if (!config.isEnabled || config.isDeleted) {
      return fail(reply, 403, `Connector '${connectorCode}' is disabled`)
    }

    if (config.protocol !== 'query_outbound' || config.dataDomain !== 'roster') {
      return fail(reply, 400, `Connector '${connectorCode}' is not configured for roster query outbound`)
    }

    // Verify HMAC signature if API Key auth
    if (config.authType === 'api_key') {
      const apiKey = request.headers['x-api-key'] as string
      const timestamp = parseInt(request.headers['x-timestamp'] as string)
      const signature = request.headers['x-signature'] as string
      // For GET, body is empty
      const body = ''

      if (!apiKey || !timestamp || !signature) {
        return error(reply, 401, 'Missing API Key authentication headers')
      }

      // Verify signature
      // Note: Actual verification needs secret from config
      // This is handled by auth plugin with connectorConfigService
    }

    // Query roster data
    const result = await handler.query(config, parseResult.data)

    if (result.status === 'fail') {
      return fail(reply, 500, 'Query failed')
    }

    return success(reply, {
      records: result.records,
      total: result.total,
      page: result.page,
      size: result.size,
    })
  })
}