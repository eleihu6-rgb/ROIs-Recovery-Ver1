import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { dictionary } from '../models/base/dictionary.js'
import { success, fail } from '../utils/response.js'
import { resolveFiliale } from '../utils/filiale.js'

/**
 * Public config routes — no authentication required.
 * Used by login page to fetch default system configuration.
 */
export default async function publicConfigRoutes(fastify: FastifyInstance) {
  // GET /api/public/config — get all DEFAULT config values
  fastify.get('/api/public/config', async (_request, reply) => {
    const rows = await fastify.db
      .select()
      .from(dictionary)
      .where(eq(dictionary.parentCode, 'DEFAULT'))

    // Transform to key-value map for easy frontend consumption
    const config: Record<string, string> = {}
    for (const row of rows) {
      if (row.code && row.codeValue) {
        config[row.code] = row.codeValue
      }
    }

    return success(reply, {
      airline: config.AIRLINE || await resolveFiliale(fastify),
      timezone: config.TIMEZONE || 'Asia/Shanghai',
      language: config.LANGUAGE || 'en',
      theme: config.THEME || 'ocean',
      dateFormat: config.DATE_FORMAT || 'YYYY-MM-DD',
    })
  })

  // GET /api/public/config/:key — get single DEFAULT config value
  fastify.get<{ Params: { key: string } }>('/api/public/config/:key', async (request, reply) => {
    const { key } = request.params
    const rows = await fastify.db
      .select()
      .from(dictionary)
      .where(eq(dictionary.parentCode, 'DEFAULT'))

    const row = rows.find((r) => r.code === key.toUpperCase())
    if (!row || !row.codeValue) {
      return fail(reply, 404, `Config key '${key}' not found`)
    }

    return success(reply, { key: row.code, value: row.codeValue })
  })
}
