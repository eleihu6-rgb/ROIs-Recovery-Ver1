import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail, error } from '../../utils/response.js'
import { generate, batchUpdate, batchDelete } from '../../services/res-pairing/res-pairing-service.js'

// ─── Zod schemas (exported for unit tests) ─────────────────────────────────

export const batchDeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
})

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

export const batchSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
  plan: z
    .array(z.object({ rank: z.string(), value: z.number().int().min(0) }))
    .optional(),
  window: z
    .object({
      start: z.string().regex(HHMM_REGEX, 'start must be HH:MM (00:00–23:59)'),
      end: z.string().regex(HHMM_REGEX, 'end must be HH:MM (00:00–23:59)'),
    })
    .optional(),
})

const cellSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  base: z.string().min(3).max(3),
  /** Reserve assignment code (PRAM / PRMM / PRPM / CRAM / CRPM …). */
  assignment: z.string().min(1).max(20),
  window: z
    .object({
      start: z.string().regex(HHMM_REGEX, 'start must be HH:MM (00:00–23:59)'),
      end: z.string().regex(HHMM_REGEX, 'end must be HH:MM (00:00–23:59)'),
    })
    .optional(),
  composition: z.array(
    z.object({ rank: z.string(), plan: z.number().int().min(0) }),
  ),
})

export const genSchema = z.object({
  division: z.enum(['P', 'C']),
  conflictPolicy: z.enum(['skip', 'overwrite', 'add']),
  cells: z.array(cellSchema).min(1),
  dryRun: z.boolean().optional(),
})

// ─── Route plugin ──────────────────────────────────────────────────────────

export default async function resPairingRoutes(fastify: FastifyInstance) {
  // POST /api/res-pairing/generate
  // Generates RES pairings from a grid of cells (date × base × assignment × composition).
  // With dryRun:true returns summary only without writing to the database.
  fastify.post('/res-pairing/generate', async (request, reply) => {
    const parsed = genSchema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const username = request.authUser?.userCode ?? 'system'

    try {
      const data = await generate(fastify, parsed.data, username)
      return success(reply, data)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // PATCH /api/res-pairing/batch
  // Updates plan slots per rank and/or recomputes pairing + segment UTC times
  // for a list of existing RES pairing IDs.
  fastify.patch('/res-pairing/batch', async (request, reply) => {
    const parsed = batchSchema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const username = request.authUser?.userCode ?? 'system'

    try {
      const data = await batchUpdate(fastify, parsed.data, username)
      return success(reply, data)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/res-pairing/batch-delete
  // Deletes a list of RES pairing IDs. IDs blocked by a 409 (crew assigned)
  // are collected and returned in the `blocked` array rather than failing fast,
  // so the caller can show partial results to the user.
  fastify.post('/res-pairing/batch-delete', async (request, reply) => {
    const parsed = batchDeleteSchema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    try {
      const data = await batchDelete(fastify, parsed.data.ids)
      return success(reply, data)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })
}
