import { z } from 'zod'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { resolveFiliale } from '../../utils/filiale.js'
import { requireMenuAccess } from '../../utils/menu-access.js'
import { error } from '../../utils/response.js'

const LEGALITY_VIOLATIONS_INIT_MENU_CODE = 'LEGALITY_VIOLATIONS_INIT'

const triggerSchema = z.object({
  ruleGroupCode: z.string().min(1).optional(),
  yearsBack: z.number().int().min(1).max(5).optional(),
})

export default async function violationsInitAdminRoutes(fastify: FastifyInstance) {
  const requireViolationsInitPermission = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return false
    }
    return requireMenuAccess(fastify, authUser, reply, LEGALITY_VIOLATIONS_INIT_MENU_CODE)
  }

  /**
   * POST /api/admin/violations-init
   *
   * Manually trigger the violations init job (normally runs nightly at 2 AM).
   * Populates the rule_violation table for all crews.
   * Requires LEGALITY_VIOLATIONS_INIT menu permission (admins always pass).
   */
  fastify.post('/violations-init', async (request, reply) => {
    if (!(await requireViolationsInitPermission(request, reply))) return reply

    const parsed = triggerSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ code: 400, data: null, message: parsed.error.message })
    }

    const ruleGroupCode = parsed.data.ruleGroupCode ?? 'flair_gantt_rule'
    const yearsBack = parsed.data.yearsBack ?? 1
    const airline = await resolveFiliale(fastify)

    await fastify.violationsInitQueue.add(
      'violationsInit:start',
      { airline, ruleGroupCode, yearsBack, resetProgress: true },
    )

    fastify.log.info(
      { airline, ruleGroupCode, yearsBack, triggeredBy: request.authUser!.userCode },
      'Violations init manually triggered',
    )

    return reply.send({ code: 200, data: { airline, ruleGroupCode, yearsBack }, message: 'Violations init job queued' })
  })

  /**
   * GET /api/admin/violations-init/status
   *
   * Returns current progress of the violations init job.
   */
  fastify.get('/violations-init/status', async (request, reply) => {
    if (!(await requireViolationsInitPermission(request, reply))) return reply

    const airline = await resolveFiliale(fastify)
    const ruleGroupCode = (request.query as { ruleGroupCode?: string }).ruleGroupCode ?? 'flair_gantt_rule'

    const [status, doneCount, totalCount] = await Promise.all([
      fastify.redis.get(`violations:init:${airline}:${ruleGroupCode}:status`),
      fastify.redis.get(`violations:init:${airline}:${ruleGroupCode}:done_count`),
      fastify.redis.get(`violations:init:${airline}:${ruleGroupCode}:total_count`),
    ])

    return reply.send({
      code: 200,
      data: {
        status: status ?? 'idle',
        doneCount: Number(doneCount ?? 0),
        totalCount: Number(totalCount ?? 0),
        progress: totalCount ? Math.round((Number(doneCount ?? 0) / Number(totalCount)) * 100) : 0,
      },
      message: 'ok',
    })
  })
}
