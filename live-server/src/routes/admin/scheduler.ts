import { z } from 'zod'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireMenuAccess } from '../../utils/menu-access.js'
import { error } from '../../utils/response.js'

const SYSTEM_SCHEDULER_MENU_CODE = 'SYSTEM_SCHEDULER'

const jobParamsSchema = z.object({
  jobCode: z.string().trim().min(1).max(80),
})

const scheduleBodySchema = z.discriminatedUnion('scheduleType', [
  z.object({
    scheduleType: z.literal('fixed_delay'),
    intervalSeconds: z.number().int().positive(),
  }),
  z.object({
    scheduleType: z.literal('cron'),
    cronExpr: z.string().trim().min(5).max(80),
  }),
])

const runsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
})

const sendFailure = (reply: FastifyReply, statusCode: number, message: string): FastifyReply =>
  reply.status(statusCode).send({ code: statusCode, data: null, message })

const requireSchedulerPermission = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> => {
  const authUser = request.authUser
  if (!authUser) {
    error(reply, 401, 'Authentication required.')
    return false
  }
  return requireMenuAccess(fastify, authUser, reply, SYSTEM_SCHEDULER_MENU_CODE)
}

const actor = (request: FastifyRequest): string =>
  request.authUser?.userCode ?? request.authUser?.userName ?? 'system'

export default async function schedulerAdminRoutes(fastify: FastifyInstance) {
  fastify.get('/scheduler/jobs', async (request, reply) => {
    if (!(await requireSchedulerPermission(fastify, request, reply))) return reply

    const jobs = await fastify.schedulerService.listJobs()
    return reply.send({ code: 200, data: { jobs }, message: 'ok' })
  })

  fastify.post('/scheduler/jobs/:jobCode/enable', async (request, reply) => {
    if (!(await requireSchedulerPermission(fastify, request, reply))) return reply

    const parsed = jobParamsSchema.safeParse(request.params)
    if (!parsed.success) return sendFailure(reply, 400, parsed.error.message)

    const job = await fastify.schedulerService.setEnabled(parsed.data.jobCode, true, actor(request))
    if (!job) return sendFailure(reply, 404, `Scheduler job ${parsed.data.jobCode} not found`)
    return reply.send({ code: 200, data: { job }, message: 'ok' })
  })

  fastify.post('/scheduler/jobs/:jobCode/disable', async (request, reply) => {
    if (!(await requireSchedulerPermission(fastify, request, reply))) return reply

    const parsed = jobParamsSchema.safeParse(request.params)
    if (!parsed.success) return sendFailure(reply, 400, parsed.error.message)

    const job = await fastify.schedulerService.setEnabled(parsed.data.jobCode, false, actor(request))
    if (!job) return sendFailure(reply, 404, `Scheduler job ${parsed.data.jobCode} not found`)
    return reply.send({ code: 200, data: { job }, message: 'ok' })
  })

  fastify.patch('/scheduler/jobs/:jobCode/schedule', async (request, reply) => {
    if (!(await requireSchedulerPermission(fastify, request, reply))) return reply

    const parsedParams = jobParamsSchema.safeParse(request.params)
    if (!parsedParams.success) return sendFailure(reply, 400, parsedParams.error.message)

    const parsedBody = scheduleBodySchema.safeParse(request.body)
    if (!parsedBody.success) return sendFailure(reply, 400, parsedBody.error.message)

    try {
      const job = await fastify.schedulerService.updateSchedule(parsedParams.data.jobCode, parsedBody.data, actor(request))
      if (!job) return sendFailure(reply, 404, `Scheduler job ${parsedParams.data.jobCode} not found`)
      return reply.send({ code: 200, data: { job }, message: 'ok' })
    } catch (err) {
      return sendFailure(reply, 400, err instanceof Error ? err.message : String(err))
    }
  })

  fastify.post('/scheduler/jobs/:jobCode/run', async (request, reply) => {
    if (!(await requireSchedulerPermission(fastify, request, reply))) return reply

    const parsed = jobParamsSchema.safeParse(request.params)
    if (!parsed.success) return sendFailure(reply, 400, parsed.error.message)

    try {
      const run = await fastify.schedulerService.runNow(parsed.data.jobCode, actor(request))
      return reply.send({ code: 200, data: { run }, message: 'ok' })
    } catch (err) {
      return sendFailure(reply, 500, err instanceof Error ? err.message : String(err))
    }
  })

  fastify.get('/scheduler/jobs/:jobCode/runs', async (request, reply) => {
    if (!(await requireSchedulerPermission(fastify, request, reply))) return reply

    const parsedParams = jobParamsSchema.safeParse(request.params)
    if (!parsedParams.success) return sendFailure(reply, 400, parsedParams.error.message)

    const parsedQuery = runsQuerySchema.safeParse(request.query)
    if (!parsedQuery.success) return sendFailure(reply, 400, parsedQuery.error.message)

    const runs = await fastify.schedulerService.listRuns(parsedParams.data.jobCode, parsedQuery.data.limit)
    return reply.send({ code: 200, data: { runs }, message: 'ok' })
  })
}
