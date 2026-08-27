import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail, error } from '../../utils/response.js'
import { crewEntitlementService } from '../../services/crew/crew-entitlement-service.js'
import { crewMemoService, crewSeniorityService } from '../../services/crew/crew-memo-service.js'

// ---------- common ----------

const idParam = z.object({ id: z.coerce.number().int().positive() })

const getUsername = (req: { headers: Record<string, string | string[] | undefined> }) =>
  (req.headers['x-username'] as string) || 'system'

// ---------- Entitlement schemas ----------

const entitlementCreateSchema = z.object({
  filiale: z.string().max(6).nullish(),
  entitlementType: z.string().min(1).max(10),
  entitlementYear: z.string().max(4).nullish(),
  entitlement: z.string().nullish(),
  used: z.string().nullish(),
  effDt: z.string().datetime().nullish(),
  expDt: z.string().datetime().nullish(),
  carryOver: z.string().nullish(),
  carryOverDt: z.string().datetime().nullish(),
  crewTeam: z.string().max(50).nullish(),
  crewBase: z.string().max(50).nullish(),
  crewRank: z.string().max(50).nullish(),
  crewFleet: z.string().max(50).nullish(),
  balance: z.string().nullish(),
  freezed: z.number().int().nullish(),
  unfrozen: z.string().nullish(),
  groupId: z.number().int().nullish(),
  operator: z.string().max(30).nullish(),
  requestCode: z.string().max(50).nullish(),
  requestName: z.string().max(50).nullish(),
  requestType: z.string().max(50).nullish(),
  seqOrder: z.string().nullish(),
})

const entitlementUpdateSchema = entitlementCreateSchema.partial()

// ---------- Memo schemas ----------

const memoCreateSchema = z.object({
  strDtLoc: z.string().datetime().nullish(),
  endDtLoc: z.string().datetime().nullish(),
  memo: z.string().max(300).nullish(),
  status: z.string().max(10).default('Y'),
  rosterId: z.number().int().nullish(),
  type: z.number().int().nullish(),
  name: z.string().max(255).nullish(),
  pbsStatus: z.string().max(20).nullish(),
})

const memoUpdateSchema = memoCreateSchema.partial()

// ---------- Seniority schemas ----------

const seniorityCreateSchema = z.object({
  serviceDay: z.number().int(),
  seniority: z.string(),
})

const seniorityUpdateSchema = seniorityCreateSchema.partial()

// ---------- Route registration ----------

export default async function crewOtherRoutes(fastify: FastifyInstance) {
  // ===================== Entitlements =====================

  fastify.get<{ Params: { crewId: string } }>(
    '/:crewId/entitlements',
    async (request, reply) => {
      const list = await crewEntitlementService.list(fastify, request.params.crewId)
      return success(reply, list)
    },
  )

  fastify.post<{ Params: { crewId: string } }>(
    '/:crewId/entitlements',
    async (request, reply) => {
      const parsed = entitlementCreateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const created = await crewEntitlementService.create(
        fastify,
        request.params.crewId,
        parsed.data as never,
        getUsername(request),
      )
      return success(reply, created)
    },
  )

  fastify.put<{ Params: { crewId: string; id: string } }>(
    '/:crewId/entitlements/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const parsed = entitlementUpdateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const updated = await crewEntitlementService.update(
        fastify,
        request.params.crewId,
        params.data.id,
        parsed.data as never,
        getUsername(request),
      )
      if (!updated) return error(reply, 404, 'Entitlement not found')
      return success(reply, updated)
    },
  )

  fastify.delete<{ Params: { crewId: string; id: string } }>(
    '/:crewId/entitlements/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const removed = await crewEntitlementService.remove(
        fastify,
        request.params.crewId,
        params.data.id,
      )
      if (!removed) return error(reply, 404, 'Entitlement not found')
      return success(reply, removed)
    },
  )

  // ===================== Memos =====================

  fastify.get<{ Params: { crewId: string } }>(
    '/:crewId/memos',
    async (request, reply) => {
      const list = await crewMemoService.list(fastify, request.params.crewId)
      return success(reply, list)
    },
  )

  fastify.post<{ Params: { crewId: string } }>(
    '/:crewId/memos',
    async (request, reply) => {
      const parsed = memoCreateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const created = await crewMemoService.create(
        fastify,
        request.params.crewId,
        parsed.data as never,
        getUsername(request),
      )
      return success(reply, created)
    },
  )

  fastify.put<{ Params: { crewId: string; id: string } }>(
    '/:crewId/memos/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const parsed = memoUpdateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const updated = await crewMemoService.update(
        fastify,
        request.params.crewId,
        params.data.id,
        parsed.data as never,
        getUsername(request),
      )
      if (!updated) return error(reply, 404, 'Memo not found')
      return success(reply, updated)
    },
  )

  fastify.delete<{ Params: { crewId: string; id: string } }>(
    '/:crewId/memos/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const removed = await crewMemoService.remove(
        fastify,
        request.params.crewId,
        params.data.id,
        getUsername(request),
      )
      if (!removed) return error(reply, 404, 'Memo not found')
      return success(reply, removed)
    },
  )

  // ===================== Seniority =====================

  fastify.get<{ Params: { crewId: string } }>(
    '/:crewId/seniorities',
    async (request, reply) => {
      const list = await crewSeniorityService.list(fastify, request.params.crewId)
      return success(reply, list)
    },
  )

  fastify.post<{ Params: { crewId: string } }>(
    '/:crewId/seniorities',
    async (request, reply) => {
      const parsed = seniorityCreateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const created = await crewSeniorityService.create(
        fastify,
        request.params.crewId,
        parsed.data as never,
        getUsername(request),
      )
      return success(reply, created)
    },
  )

  fastify.put<{ Params: { crewId: string; id: string } }>(
    '/:crewId/seniorities/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const parsed = seniorityUpdateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const updated = await crewSeniorityService.update(
        fastify,
        request.params.crewId,
        params.data.id,
        parsed.data as never,
        getUsername(request),
      )
      if (!updated) return error(reply, 404, 'Seniority not found')
      return success(reply, updated)
    },
  )

  fastify.delete<{ Params: { crewId: string; id: string } }>(
    '/:crewId/seniorities/:id',
    async (request, reply) => {
      const params = idParam.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const removed = await crewSeniorityService.remove(
        fastify,
        request.params.crewId,
        params.data.id,
      )
      if (!removed) return error(reply, 404, 'Seniority not found')
      return success(reply, removed)
    },
  )
}
