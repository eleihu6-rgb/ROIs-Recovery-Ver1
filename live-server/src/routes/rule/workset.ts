import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'

export default async function worksetRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const { type } = request.query as { type?: string }
    try {
      let query = 'SELECT id, name, type, division, category FROM workset'
      const params: string[] = []
      if (type) {
        query += ' WHERE position($1 in type) > 0'
        params.push(type)
      }
      query += ' ORDER BY id'
      const result = await fastify.pgPool.query(query, params)
      return success(reply, result.rows)
    } catch (err) {
      return fail(reply, 500, (err as Error).message)
    }
  })
}
