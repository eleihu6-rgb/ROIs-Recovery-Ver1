import { FastifyInstance } from 'fastify'
import { success, fail } from '../utils/response.js'

export default async function healthRoutes(fastify: FastifyInstance) {
  // 基础健康检查
  fastify.get('/api/health', async (_request, reply) => {
    return success(reply, { status: 'ok', timestamp: new Date().toISOString() })
  })

  // 详细健康检查（含 DB + Redis 连通性）
  fastify.get('/api/health/detail', async (_request, reply) => {
    const checks: Record<string, string> = {}

    // PostgreSQL
    try {
      const client = await fastify.pgPool.connect()
      const result = await client.query('SELECT 1')
      client.release()
      checks.database = result.rows.length > 0 ? 'ok' : 'fail'
    } catch {
      checks.database = 'fail'
    }

    // Redis
    try {
      const pong = await fastify.redis.ping()
      checks.redis = pong === 'PONG' ? 'ok' : 'fail'
    } catch {
      checks.redis = 'fail'
    }

    const allOk = Object.values(checks).every((v) => v === 'ok')

    if (allOk) {
      return success(reply, { status: 'ok', checks, timestamp: new Date().toISOString() })
    }
    return fail(reply, 503, `Service degraded: ${JSON.stringify(checks)}`)
  })
}
