import type { FastifyInstance } from 'fastify'

interface ViolationRow {
  crew_id: string
  pairing_id: number | null
  rule_code: string
  rule_instance: string | null
  ruleset_id: number
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

export default async function rosterViolationsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/violations
   *
   * Query params:
   *   crewIds  — comma-separated crew IDs (required)
   *   groupCode — rule group code (required)
   *   start     — ISO date string, inclusive (required)
   *   end       — ISO date string, inclusive (required)
   *
   * Returns violations from rule_violation table grouped by pairingId.
   * Roster-level violations (pairing_id IS NULL) are returned with pairingId: null.
   */
  fastify.get<{
    Querystring: {
      crewIds: string
      groupCode: string
      start: string
      end: string
    }
  }>('/violations', async (request, reply) => {
    const { crewIds, groupCode, start, end } = request.query

    if (!crewIds || !groupCode || !start || !end) {
      return reply.status(400).send({ code: 400, data: null, message: 'crewIds, groupCode, start, end are required' })
    }

    const crewIdList = crewIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (crewIdList.length === 0) {
      return reply.send({ code: 200, data: [], message: 'ok' })
    }

    // Cap crew list to prevent abuse. Must cover the whole loaded roster — violations
    // are fetched for exactly the crew the gantt has loaded (selectedCrewIds), so a cap
    // below the roster size would silently drop violations for later-loaded crew (e.g.
    // a crew beyond position 500 would never show its bell). Sized above any real roster.
    const MAX_CREWS = 5000
    const safeCrewIds = crewIdList.slice(0, MAX_CREWS)

    // groupCode is the engine-side label carrying the ruleset (workset) id as a string;
    // the rule_violation table now keys on bigint ruleset_id, so coerce it for the bind.
    const rulesetId = Number(groupCode)
    if (!Number.isInteger(rulesetId)) {
      return reply.status(400).send({ code: 400, data: null, message: 'groupCode must be a numeric ruleset id' })
    }

    const result = await fastify.pgPool.query<ViolationRow>(
      `SELECT crew_id, pairing_id, rule_code, rule_instance, ruleset_id, severity,
              actual_value, limit_value, unit, message,
              start_dt, end_dt, window_start_dt, window_end_dt
       FROM rule_violation
       WHERE crew_id = ANY($1)
         AND ruleset_id = $2
         AND coalesce(window_start_dt, start_dt) < (($4::date + 1)::timestamptz)
         AND coalesce(window_end_dt, end_dt) >= ($3::date::timestamptz)
       ORDER BY crew_id, pairing_id NULLS LAST, severity DESC`,
      [safeCrewIds, rulesetId, start, end],
    )

    // Group by pairingId (null for roster-level violations)
    const grouped: Array<{
      pairingId: number | null
      crewId: string
      groupCode: string
      checkResults: Array<{
        ruleCode: string
        ruleInstance: string | null
        severity: number
        actualValue: number | null
        limitValue: number | null
        unit: string | null
        message: string
      }>
    }> = []

    const keyMap = new Map<string, number>()

    for (const row of result.rows) {
      const key = `${row.crew_id}:${row.pairing_id ?? 'null'}`
      const existingIdx = keyMap.get(key)

      const entry = {
        ruleCode:     row.rule_code,
        ruleInstance: row.rule_instance,
        severity:     row.severity,
        actualValue:  row.actual_value,
        limitValue:   row.limit_value,
        unit:         row.unit,
        message:      row.message,
        startDt:      row.start_dt.toISOString(),
        endDt:        row.end_dt.toISOString(),
        windowStartDt: row.window_start_dt?.toISOString() ?? null,
        windowEndDt: row.window_end_dt?.toISOString() ?? null,
      }

      if (existingIdx !== undefined) {
        grouped[existingIdx].checkResults.push(entry)
      } else {
        keyMap.set(key, grouped.length)
        grouped.push({
          pairingId:    row.pairing_id,
          crewId:       row.crew_id,
          // Response key kept as `groupCode` (the gantt-facing engine label); it now carries
          // the numeric ruleset_id rendered back as a string to preserve the API shape.
          groupCode:    String(row.ruleset_id),
          checkResults: [entry],
        })
      }
    }

    return reply.send({ code: 200, data: grouped, message: 'ok' })
  })
}
