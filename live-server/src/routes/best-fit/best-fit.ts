import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail, error } from '../../utils/response.js'
import { planBestFitForPairing, previewCombinedSelection } from '../../services/best-fit/best-fit-service.js'

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const rosterPeriod = z.string().regex(/^\d{4}RP\d{2}$/)

/**
 * Best-fit crew for open pairings — READ-ONLY planning endpoints.
 *
 * The planner picks one or more open pairings; each pairing is planned separately
 * (per open rank slot). Nothing here writes roster/coverage/locks: acting on a
 * shortlist still goes through the normal assign-pairing draft path.
 *
 * Same brain/hands split as `/api/roster/auto-assign/plan`: the backend decides,
 * the frontend replays.
 */
export default async function bestFitRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/best-fit/pairing — rank crew for ONE open pairing.
  //
  // One pairing per request (not a batch job) is deliberate: the frontend fires
  // the selected pairings in parallel and each returns as soon as its own bounded
  // candidate set has been simulated, so per-pairing progress and cancellation
  // come for free. Every request is capped (candidates per slot / slots).
  fastify.post('/pairing', async (request, reply) => {
    const schema = z
      .object({
        pairingId: z.number().int().positive(),
        rulesetId: z.number().int().positive().optional(),
        rosterPeriod: rosterPeriod.optional(),
        rpFrom: ymd.optional(),
        rpTo: ymd.optional(),
        basis: z.enum(['fairness', 'cost']).optional(),
        costSetId: z.number().int().positive().optional(),
        maxCandidatesPerSlot: z.number().int().positive().max(20).optional(),
        rankSlots: z.array(z.string().trim().min(1)).max(8).optional(),
      })
      .strict()
      .refine((body) => (body.rpFrom == null) === (body.rpTo == null), {
        message: 'rpFrom and rpTo must both be set or both omitted',
      })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)

    try {
      const result = await planBestFitForPairing(fastify, parsed.data)
      return success(reply, result)
    } catch (err) {
      request.log.error({ err }, 'best-fit pairing plan failed')
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/best-fit/combined-preview — joint legality + cost for a shortlist.
  fastify.post('/combined-preview', async (request, reply) => {
    const schema = z
      .object({
        selections: z
          .array(
            z.object({
              pairingId: z.number().int().positive(),
              slotRank: z.string().trim().min(1),
              crewId: z.string().trim().min(1),
            }),
          )
          .min(1)
          .max(24),
        rulesetId: z.number().int().positive().optional(),
        rosterPeriod: rosterPeriod.optional(),
        rpFrom: ymd.optional(),
        rpTo: ymd.optional(),
        costSetId: z.number().int().positive().optional(),
      })
      .strict()
      .refine((body) => (body.rpFrom == null) === (body.rpTo == null), {
        message: 'rpFrom and rpTo must both be set or both omitted',
      })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)

    try {
      const result = await previewCombinedSelection(fastify, parsed.data)
      return success(reply, result)
    } catch (err) {
      request.log.error({ err }, 'best-fit combined preview failed')
      return error(reply, 500, (err as Error).message)
    }
  })
}
