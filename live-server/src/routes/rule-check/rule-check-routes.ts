import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { ruleCheckResultService } from '../../services/rule-check/rule-check-result-service.js'
import { liveSchemaName } from '../../utils/db-schema.js'
import { resolveFilialeLower } from '../../utils/filiale.js'

const requestSchema = (req: { authUser?: { schema?: string } }): string =>
  (req.authUser?.schema ?? liveSchemaName()).toLowerCase()

export default async function ruleCheckRoutes(fastify: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // GET /pairings — query pairing-level check results
  // ---------------------------------------------------------------------------
  // ruleGroupCode is the engine-side label carrying the ruleset (workset) id as a string;
  // the result tables now key on bigint ruleset_id, so coerce it to a number here.
  const rulesetIdField = z.string().min(1).transform((s) => Number(s)).refine(
    (n) => Number.isInteger(n), { message: 'ruleGroupCode must be a numeric ruleset id' },
  )

  const pairingsQuerySchema = z.object({
    crewIds: z.string().min(1).transform((s) => s.split(',').map((c) => c.trim()).filter(Boolean)),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ruleGroupCode: rulesetIdField,
  })

  fastify.get('/pairings', async (request, reply) => {
    const parsed = pairingsQuerySchema.safeParse(request.query)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)

    const { crewIds: crewIdList, dateFrom, dateTo, ruleGroupCode: rulesetId } = parsed.data
    if (crewIdList.length === 0) return fail(reply, 400, 'crewIds must contain at least one crew ID')

    const result = await ruleCheckResultService.queryPairingResults(
      fastify, crewIdList, rulesetId, dateFrom, dateTo,
    )

    return success(reply, result.byPairing)
  })

  // ---------------------------------------------------------------------------
  // GET /roster — query roster-level check results
  // ---------------------------------------------------------------------------
  const rosterQuerySchema = z.object({
    crewIds: z.string().min(1).transform((s) => s.split(',').map((c) => c.trim()).filter(Boolean)),
    months: z.string().min(1).transform((s) => s.split(',').map((m) => m.trim()).filter(Boolean)),
    ruleGroupCode: rulesetIdField,
  })

  fastify.get('/roster', async (request, reply) => {
    const parsed = rosterQuerySchema.safeParse(request.query)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)

    const { crewIds: crewIdList, months: monthList, ruleGroupCode: rulesetId } = parsed.data
    if (crewIdList.length === 0) return fail(reply, 400, 'crewIds must contain at least one crew ID')
    if (monthList.length === 0) return fail(reply, 400, 'months must contain at least one month')

    const result = await ruleCheckResultService.queryRosterResults(
      fastify, crewIdList, rulesetId, monthList,
    )

    return success(reply, result)
  })

  // ---------------------------------------------------------------------------
  // POST /on-demand — trigger on-demand check for specific crew + pairings
  // ---------------------------------------------------------------------------
  const onDemandSchema = z.object({
    crewId: z.string().min(1),
    pairingIds: z.array(z.number().int().positive()).min(1),
    ruleGroupCode: rulesetIdField,
  })

  fastify.post('/on-demand', async (request, reply) => {
    const parsed = onDemandSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)

    const { crewId, pairingIds, ruleGroupCode: rulesetId } = parsed.data
    const fil = await resolveFilialeLower(fastify)
    const schema = requestSchema(request)

    const jobs = pairingIds.map((pairingId) => ({
      name: 'rule:check:pairing',
      data: { crewId, pairingId, rulesetId, filiale: fil, schema },
    }))

    await fastify.realtimeQueue.addBulk(jobs)

    return success(reply, { enqueued: pairingIds.length })
  })

  // ---------------------------------------------------------------------------
  // POST /batch — start a batch check for all crew + pairings in a date range
  // ---------------------------------------------------------------------------
  const batchSchema = z.object({
    ruleGroupCode: rulesetIdField,
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.enum(['import', 'rule-config-change', 'manual']),
  })

  fastify.post('/batch', async (request, reply) => {
    const parsed = batchSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)

    const { ruleGroupCode: rulesetId, dateFrom, dateTo, reason } = parsed.data
    const fil = await resolveFilialeLower(fastify)
    const user = request.authUser?.userCode ?? 'system'

    // Create batch_run record
    const { rows } = await fastify.pgPool.query<{ id: number }>(
      `INSERT INTO rule_check_batch_run
         (ruleset_id, filiale, date_from, date_to, reason, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $6)
       RETURNING id`,
      [rulesetId, fil, dateFrom, dateTo, reason, user],
    )

    const batchRunId = rows[0].id

    // Enqueue batch orchestration job
    await fastify.batchQueue.add('rule:check:batch', {
      batchRunId,
      rulesetId,
      filiale: fil,
      dateFrom,
      dateTo,
    })

    return success(reply, { batchRunId })
  })

  // ---------------------------------------------------------------------------
  // GET /batch/:id/progress — check progress of a batch run
  // ---------------------------------------------------------------------------
  fastify.get('/batch/:id/progress', async (request, reply) => {
    const { id } = request.params as { id: string }
    const batchRunId = Number(id)

    if (!Number.isInteger(batchRunId) || batchRunId <= 0) {
      return fail(reply, 400, 'Invalid batch run ID')
    }

    const { rows } = await fastify.pgPool.query(
      `SELECT
         id, status, ruleset_id, filiale, date_from, date_to, reason,
         total_crew, total_pairings, processed_crew, processed_pairings,
         started_at, completed_at, error_summary, created_at
       FROM rule_check_batch_run
       WHERE id = $1`,
      [batchRunId],
    )

    if (rows.length === 0) return fail(reply, 404, 'Batch run not found')

    const row = rows[0]

    // Calculate ETA in seconds
    let etaSeconds: number | null = null
    if (row.status === 'running' && row.total_pairings > 0 && row.processed_pairings > 0) {
      const elapsedMs = Date.now() - new Date(row.started_at).getTime()
      const ratePerSecond = row.processed_pairings / (elapsedMs / 1000)
      if (ratePerSecond > 0) {
        const remaining = row.total_pairings - row.processed_pairings
        etaSeconds = Math.round(remaining / ratePerSecond)
      }
    }

    return success(reply, { ...row, etaSeconds })
  })
}
