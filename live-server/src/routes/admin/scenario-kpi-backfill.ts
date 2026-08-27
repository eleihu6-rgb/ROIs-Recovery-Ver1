import { z } from 'zod'
import { eq, and, isNotNull } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { scenario } from '../../models/scenario/scenario.js'
import { computeAndPersistKpis } from '../../services/scenario/scenario-result-service.js'
import { liveSchemaName } from '../../utils/db-schema.js'
import { requireMenuAccess } from '../../utils/menu-access.js'
import { error } from '../../utils/response.js'

const SCENARIO_KPI_BACKFILL_MENU_CODE = 'SCENARIO_KPI_BACKFILL'

const querySchema = z.object({
  scenarioId: z.coerce.number().optional(),
})

export default async function scenarioKpiBackfillRoutes(fastify: FastifyInstance) {
  const requireScenarioKpiBackfillPermission = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return false
    }
    return requireMenuAccess(fastify, authUser, reply, SCENARIO_KPI_BACKFILL_MENU_CODE)
  }

  /**
   * POST /api/admin/scenario-kpi-backfill
   *
   * Recompute and persist KPI statistics for DONE scenarios that were
   * optimized before the rich-KPI calculation was introduced.
   *
   * Optional query param:
   *   scenarioId  only backfill this one scenario (otherwise all DONE scenarios with task_id)
   *
   * Requires SCENARIO_KPI_BACKFILL menu permission (admins always pass).
   */
  fastify.post('/scenario-kpi-backfill', async (request, reply) => {
    if (!(await requireScenarioKpiBackfillPermission(request, reply))) return reply

    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({ code: 400, data: null, message: parsed.error.message })
    }

    const bearerToken = (request.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    const airline = request.authUser!.schema ?? liveSchemaName()

    // Fetch target scenarios
    const conditions = [
      eq(scenario.status, 'DONE'),
      isNotNull(scenario.taskId),
    ]
    if (parsed.data.scenarioId) {
      conditions.push(eq(scenario.id, parsed.data.scenarioId))
    }

    const rows = await fastify.db
      .select({ id: scenario.id, taskId: scenario.taskId })
      .from(scenario)
      .where(and(...conditions))

    const results: { id: number; status: string }[] = []

    for (const row of rows) {
      if (!row.taskId) continue
      try {
        await computeAndPersistKpis(
          fastify,
          {
            scenarioId: row.id,
            taskId: row.taskId,
            status: 'DONE',
            filePath: '',
            fileSize: 0,
            checksum: '',
            kpi: [],
            resultMeta: {},
          },
          bearerToken,
          airline,
        )
        results.push({ id: row.id, status: 'ok' })
      } catch (err) {
        fastify.log.warn({ scenarioId: row.id, err: (err as Error).message }, 'KPI backfill failed for scenario')
        results.push({ id: row.id, status: `error: ${(err as Error).message}` })
      }
    }

    fastify.log.info({ count: results.length, triggeredBy: request.authUser!.userCode }, 'scenario-kpi-backfill completed')

    return reply.send({ code: 200, data: results, message: 'ok' })
  })
}
