import type { FastifyInstance } from 'fastify'
import { ensureLegality, forceRecompute } from '../../services/scenario/legality-status.js'
import { liveSchema, liveSchemaName, scenarioSchema } from '../../utils/db-schema.js'

const requestSchema = (request: { authUser?: { schema?: string } }): string =>
  request.authUser?.schema ?? liveSchemaName()

interface ScenarioViolationRow {
  crew_id: string
  pairing_id: number | null
  duty_seq: number | null
  rule_code: string
  rule_instance: string | null
  severity: number
  actual_value: number | null
  limit_value: number | null
  unit: string | null
  message: string
  start_dt: Date
  end_dt: Date
  window_start_dt: Date | null
  window_end_dt: Date | null
}

// GET /api/scenario/:id/legality — first caller triggers an (async, deduped) compute and
// gets { status: 'COMPUTING' }; once ready, callers get the persisted violations from the
// scenario schema. Spec: docs/superpowers/specs/2026-06-15-scenario-persisted-legality-design.md §5.
export default async function scenarioLegalityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { id: string } }>('/:id/legality', async (request, reply) => {
    const scenarioId = Number(request.params.id)
    if (!Number.isInteger(scenarioId)) {
      return reply.code(400).send({ code: 400, data: null, message: 'invalid scenario id' })
    }

    let state: Awaited<ReturnType<typeof ensureLegality>>
    try {
      state = await ensureLegality(fastify, scenarioId, { airlineSchema: requestSchema(request) })
    } catch (err) {
      request.log.error({ err, scenarioId }, 'ensureLegality failed')
      return reply.code(404).send({ code: 404, data: null, message: String(err) })
    }

    if (state.state !== 'READY') {
      return reply.send({
        code: 200,
        data: {
          status: state.state,
          paramsStale: state.paramsStale,
          computedAt: state.computedAt,
          errorText: state.errorText,
          violations: [],
        },
        message: 'ok',
      })
    }

    const rows = (
      await fastify.pgPool.query<ScenarioViolationRow>(
        // Display window = scenario official period (same as Live: no ±1 month pad).
        // Overlap uses coalesce(window_*, start/end) so rolling-window rules still
        // surface when their effective window intersects the official period.
        `with bounds as (
           select
             s.str_dt_loc::date as start_d,
             s.end_dt_loc::date as end_d
           from ${liveSchema()}.scenario s
           where s.id = $1
         )
         select rv.crew_id, rv.pairing_id, rv.duty_seq, rv.rule_code, rv.rule_instance, rv.severity,
                rv.actual_value, rv.limit_value, rv.unit, rv.message, rv.start_dt, rv.end_dt,
                rv.window_start_dt, rv.window_end_dt
           from ${scenarioSchema()}.rule_violation rv
           cross join bounds b
          where rv.scenario_id = $1
            and coalesce(rv.window_start_dt, rv.start_dt) < ((b.end_d + 1)::timestamptz)
            and coalesce(rv.window_end_dt, rv.end_dt) >= (b.start_d::timestamptz)
          order by rv.severity desc, rv.crew_id`,
        [scenarioId],
      )
    ).rows
    return reply.send({
      code: 200,
      data: {
        status: 'READY',
        paramsStale: state.paramsStale,
        computedAt: state.computedAt,
        errorText: null,
        violations: rows,
      },
      message: 'ok',
    })
  })

  // POST /api/scenario/:id/legality/recheck — manual force-recompute for out-of-window
  // scenarios; clears params_stale and returns { status: 'COMPUTING' }.
  fastify.post<{ Params: { id: string } }>('/:id/legality/recheck', async (request, reply) => {
    const scenarioId = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(scenarioId)) {
      return reply.code(400).send({ code: 400, data: null, message: 'invalid id' })
    }
    const state = await forceRecompute(fastify, scenarioId)
    return reply.send({ code: 200, data: { status: state }, message: 'ok' })
  })
}
