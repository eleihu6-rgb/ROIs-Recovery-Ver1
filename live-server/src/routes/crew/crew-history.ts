import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail, error } from '../../utils/response.js'
import { crewRankService } from '../../services/crew/crew-rank-service.js'
import { crewBaseService } from '../../services/crew/crew-base-service.js'
import { crewFleetService } from '../../services/crew/crew-fleet-service.js'
import { crewStatusService } from '../../services/crew/crew-status-service.js'
import { crewTeamService } from '../../services/crew/crew-team-service.js'

// ---------- common ----------

const idParamSchema = z.object({ id: z.coerce.number().int().positive() })

const getUsername = (req: { headers: Record<string, string | string[] | undefined> }) =>
  (req.headers['x-username'] as string) || 'system'

// ---------- Rank schemas ----------

const rankCreateSchema = z.object({
  rank: z.string().min(1).max(10),
  effDt: z.string().datetime(),
  expDt: z.string().datetime().nullish(),
  probationEndDt: z.string().datetime().nullish(),
  position: z.string().max(20).default('1'),
  preCumulatedExpDays: z.string().max(30).default('0'),
  fleetGrp: z.string().max(20).nullish(),
  acType: z.string().max(10).nullish(),
  interfaceCrewRankId: z.string().max(40).nullish(),
  division: z.string().max(1).nullish(),
  interfaceRankId: z.string().max(40).nullish(),
})

const rankUpdateSchema = rankCreateSchema.partial()

// ---------- Base schemas ----------

const baseCreateSchema = z.object({
  base: z.string().min(1).max(3),
  effDt: z.string().datetime(),
  expDt: z.string().datetime().nullish(),
  isPrimeBase: z.number().int().min(0).max(1).default(1),
  interfaceBaseId: z.string().max(40).nullish(),
  interfaceCrewBaseId: z.string().max(40).nullish(),
  effDtUtc: z.string().datetime().nullish(),
  expDtUtc: z.string().datetime().nullish(),
})

const baseUpdateSchema = baseCreateSchema.partial()

// ---------- Fleet schemas ----------

const fleetCreateSchema = z.object({
  fleetSpecific: z.string().min(1).max(20),
  effDt: z.string().datetime(),
  expDt: z.string().datetime().nullish(),
  acType: z.string().max(10).nullish(),
  fleetGrp: z.string().max(20).nullish(),
  interfaceFleetId: z.string().max(40).nullish(),
  interfaceCrewFleetId: z.string().max(40).nullish(),
})

const fleetUpdateSchema = fleetCreateSchema.partial()

// ---------- Status schemas ----------

const statusCreateSchema = z.object({
  status: z.string().max(5).nullish(),
  effDt: z.string().datetime(),
  expDt: z.string().datetime().nullish(),
  reason: z.string().max(100).nullish(),
  description: z.string().max(100).nullish(),
  disable: z.number().int().min(0).max(1).default(0),
})

const statusUpdateSchema = statusCreateSchema.partial()

// ---------- Team schemas ----------

const teamCreateSchema = z.object({
  team: z.string().max(50),
  effDt: z.string().datetime(),
  expDt: z.string().datetime().nullish(),
  isValid: z.number().int().min(0).max(1).default(1),
  remarks: z.string().max(512).nullish(),
  source: z.string().max(10).nullish(),
  teamTaskId: z.string().nullish(),
})

const teamUpdateSchema = teamCreateSchema.partial()

// ---------- Helper: register CRUD for a history entity ----------

function registerHistoryRoutes<T extends { list: Function; getCurrent: Function; create: Function; update: Function; remove: Function }>(
  fastify: FastifyInstance,
  prefix: string,
  service: T,
  createSchema: z.ZodType,
  updateSchema: z.ZodType,
) {
  // GET /:crewId/<prefix>
  fastify.get<{ Params: { crewId: string } }>(
    `/:crewId/${prefix}`,
    async (request, reply) => {
      const list = await service.list(fastify, request.params.crewId)
      return success(reply, list)
    },
  )

  // GET /:crewId/<prefix>/current
  fastify.get<{ Params: { crewId: string } }>(
    `/:crewId/${prefix}/current`,
    async (request, reply) => {
      const current = await service.getCurrent(fastify, request.params.crewId)
      return success(reply, current)
    },
  )

  // POST /:crewId/<prefix>
  fastify.post<{ Params: { crewId: string } }>(
    `/:crewId/${prefix}`,
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, (parsed as { error: z.ZodError }).error.message)
      const created = await service.create(
        fastify,
        request.params.crewId,
        parsed.data as never,
        getUsername(request),
      )
      return success(reply, created)
    },
  )

  // PUT /:crewId/<prefix>/:id
  fastify.put<{ Params: { crewId: string; id: string } }>(
    `/:crewId/${prefix}/:id`,
    async (request, reply) => {
      const params = idParamSchema.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const parsed = updateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, (parsed as { error: z.ZodError }).error.message)
      const updated = await service.update(
        fastify,
        request.params.crewId,
        params.data.id,
        parsed.data as never,
        getUsername(request),
      )
      if (!updated) return error(reply, 404, `${prefix} record not found`)
      return success(reply, updated)
    },
  )

  // DELETE /:crewId/<prefix>/:id
  fastify.delete<{ Params: { crewId: string; id: string } }>(
    `/:crewId/${prefix}/:id`,
    async (request, reply) => {
      const params = idParamSchema.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const removed = await service.remove(
        fastify,
        request.params.crewId,
        params.data.id,
        getUsername(request),
      )
      if (!removed) return error(reply, 404, `${prefix} record not found`)
      return success(reply, removed)
    },
  )
}

// ---------- Route registration ----------

export default async function crewHistoryRoutes(fastify: FastifyInstance) {
  registerHistoryRoutes(fastify, 'ranks', crewRankService, rankCreateSchema, rankUpdateSchema)
  registerHistoryRoutes(fastify, 'bases', crewBaseService, baseCreateSchema, baseUpdateSchema)
  registerHistoryRoutes(fastify, 'fleets', crewFleetService, fleetCreateSchema, fleetUpdateSchema)
  registerHistoryRoutes(fastify, 'statuses', crewStatusService, statusCreateSchema, statusUpdateSchema)
  registerHistoryRoutes(fastify, 'teams', crewTeamService, teamCreateSchema, teamUpdateSchema)
}
