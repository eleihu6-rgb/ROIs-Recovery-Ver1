import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { listMemos, upsertMemo, softDeleteMemo } from '../../services/crew-memo/crew-memo-service.js'
import { runPaRemoval, executePaRemoval } from '../../services/crew-memo/pa-removal-service.js'

const listQuery = z.object({
  crewIds: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
})

const upsertBody = z.object({
  id: z.number().int().positive().optional(),
  crewId: z.string().min(1),
  strDtLoc: z.string().min(1),
  endDtLoc: z.string().min(1),
  memo: z.string().min(1).max(300),
  name: z.string().max(255).optional(),
  type: z.number().int().optional(),
  rosterId: z.number().int().nullable().optional(),
})

const paRemovalBody = z.object({
  bases: z.array(z.string()).optional(),
  ranks: z.array(z.string()).optional(),
  crewIds: z.array(z.string()).optional(),
  from: z.string().min(1),
  to: z.string().min(1),
})

const executeBody = z.object({
  crewIds: z.array(z.string()).optional(),
  from: z.string().min(1),
  to: z.string().min(1),
})

export default async function crewMemoRoutes(fastify: FastifyInstance) {
  // GET /api/crew-memo?crewIds=a,b&from=ISO&to=ISO
  fastify.get('/crew-memo', async (request, reply) => {
    const q = listQuery.safeParse(request.query)
    if (!q.success) return fail(reply, 400, q.error.message)
    const crewIds = q.data.crewIds.split(',').map((s) => s.trim()).filter(Boolean)
    const memos = await listMemos(fastify, crewIds, q.data.from, q.data.to)
    return success(reply, memos)
  })

  // POST /api/crew-memo — insert or update
  fastify.post('/crew-memo', async (request, reply) => {
    const b = upsertBody.safeParse(request.body)
    if (!b.success) return fail(reply, 400, b.error.message)
    const userId = request.authUser?.userCode ?? 'system'
    const memo = await upsertMemo(fastify, b.data, userId)
    return success(reply, memo)
  })

  // DELETE /api/crew-memo/:id — soft delete (status='N')
  fastify.delete('/crew-memo/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    if (!Number.isInteger(id) || id <= 0) return fail(reply, 400, 'invalid id')
    const userId = request.authUser?.userCode ?? 'system'
    const deleted = await softDeleteMemo(fastify, id, userId)
    return success(reply, { id: deleted })
  })

  // POST /api/crew-memo/pa-removal — stage 1: analyze → write type=3 memos
  fastify.post('/crew-memo/pa-removal', async (request, reply) => {
    const b = paRemovalBody.safeParse(request.body)
    if (!b.success) return fail(reply, 400, b.error.message)
    const userId = request.authUser?.userCode ?? 'system'
    const result = await runPaRemoval(fastify, b.data, userId)
    return success(reply, result)
  })

  // POST /api/crew-memo/pa-removal/execute — stage 3: soft-delete approved rosters
  fastify.post('/crew-memo/pa-removal/execute', async (request, reply) => {
    const b = executeBody.safeParse(request.body)
    if (!b.success) return fail(reply, 400, b.error.message)
    const userId = request.authUser?.userCode ?? 'system'
    const result = await executePaRemoval(fastify, b.data, userId)
    return success(reply, result)
  })
}
