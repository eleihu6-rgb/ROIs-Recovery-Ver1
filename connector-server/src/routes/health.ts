import type { FastifyInstance } from 'fastify'
import { success } from '../utils/response.js'

export const healthRoutes = (fastify: FastifyInstance) => {
  fastify.get('/health', {
    schema: {
      tags: ['health'],
      summary: 'Health check',
      description: 'Returns server health status',
      response: {
        200: {
          type: 'object',
          properties: {
            code: { type: 'integer' },
            data: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                timestamp: { type: 'string' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (_, reply) => {
    return success(reply, { status: 'ok', timestamp: new Date().toISOString() })
  })
}