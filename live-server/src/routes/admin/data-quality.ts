import { sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { DATA_QUALITY_CHECKS } from '../../config/data-quality-checks.js'
import { requireMenuAccess } from '../../utils/menu-access.js'
import { error } from '../../utils/response.js'

const SYSTEM_DATA_QUALITY_MENU_CODE = 'SYSTEM_DATA_QUALITY'

interface CheckResult {
  id: string
  name: string
  description: string
  severity: 'error' | 'warning'
  count: number
  samples: string[]
  pass: boolean
}

export default async function dataQualityAdminRoutes(fastify: FastifyInstance) {
  const requireDataQualityPermission = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return false
    }
    return requireMenuAccess(fastify, authUser, reply, SYSTEM_DATA_QUALITY_MENU_CODE)
  }

  fastify.get('/data-quality', async (request, reply) => {
    if (!(await requireDataQualityPermission(request, reply))) return reply

    const results: CheckResult[] = []

    for (const check of DATA_QUALITY_CHECKS) {
      try {
        const rows = await fastify.db.execute(sql.raw(check.sql))
        const samples = (rows.rows as Array<{ sample_info: string }>)
          .map(r => String(r.sample_info ?? ''))
          .filter(Boolean)
        results.push({
          id: check.id,
          name: check.name,
          description: check.description,
          severity: check.severity,
          count: samples.length,
          samples,
          pass: samples.length === 0,
        })
      } catch (err) {
        results.push({
          id: check.id,
          name: check.name,
          description: check.description,
          severity: check.severity,
          count: -1,
          samples: [`Error running check: ${err instanceof Error ? err.message : String(err)}`],
          pass: false,
        })
      }
    }

    const errorCount = results.filter(r => r.severity === 'error' && !r.pass).length
    const warnCount = results.filter(r => r.severity === 'warning' && !r.pass).length

    return reply.send({
      code: 200,
      data: {
        summary: { total: results.length, errors: errorCount, warnings: warnCount, passed: results.filter(r => r.pass).length },
        checks: results,
        checkedAt: new Date().toISOString(),
      },
      message: 'ok',
    })
  })
}
