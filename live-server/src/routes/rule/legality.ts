import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { success, fail, error } from '../../utils/response.js'
import { requireMenuAccess } from '../../utils/menu-access.js'
import { resolveAffected, markScenariosStale, flagScenariosParamsStale, spawnLiveRecheck, affectedRuleCodes } from '../../services/rule/legality-recheck.js'
import { previewDraftLegality } from '../../services/rule/legality-preview.js'
import { resolveFiliale } from '../../utils/filiale.js'
import { dictionaryService } from '../../services/base/dictionary-service.js'

const LEGALITY_RULE_SETS_MENU_CODE = 'LEGALITY_RULE_SETS'

/** Return the inclusive window covering the previous, current and next RP. */
async function liveRulesetRefreshWindow(fastify: FastifyInstance): Promise<{ from: string; to: string } | null> {
  const current = await fastify.pgPool.query<{ rp_start: string; rp_end: string }>(
    `SELECT rp_start, rp_end FROM roster_period
      WHERE rp_start <= now() AND rp_end >= now()
      ORDER BY rp_start DESC LIMIT 1`,
  )
  if (!current.rows[0]) return null
  const [previous, next] = await Promise.all([
    fastify.pgPool.query<{ rp_start: string; rp_end: string }>(
      `SELECT rp_start, rp_end FROM roster_period WHERE rp_end < $1 ORDER BY rp_end DESC LIMIT 1`,
      [current.rows[0].rp_start]),
    fastify.pgPool.query<{ rp_start: string; rp_end: string }>(
      `SELECT rp_start, rp_end FROM roster_period WHERE rp_start > $1 ORDER BY rp_start LIMIT 1`,
      [current.rows[0].rp_end]),
  ])
  const periods = [previous.rows[0], current.rows[0], next.rows[0]].filter(Boolean)
  return {
    from: new Date(Math.min(...periods.map((p) => new Date(p.rp_start).getTime()))).toISOString().slice(0, 10),
    to: new Date(Math.max(...periods.map((p) => new Date(p.rp_end).getTime()))).toISOString().slice(0, 10),
  }
}

async function refreshLiveRuleset(fastify: FastifyInstance, worksetId: number): Promise<void> {
  const window = await liveRulesetRefreshWindow(fastify)
  if (!window) return
  spawnLiveRecheck(fastify, String(worksetId), window.from, window.to)
}

async function refreshAllLiveRulesets(fastify: FastifyInstance, rulesetIds: number[], ruleCodes?: string[] | null): Promise<void> {
  const window = await liveRulesetRefreshWindow(fastify)
  if (!window) return
  for (const id of rulesetIds) {
    spawnLiveRecheck(fastify, String(id), window.from, window.to, ruleCodes)
  }
}

const RULE_SET_TYPE_ORDER = ['LIVE', 'PBS', 'RO'] as const

/**
 * Normalize a claimed-type input (string[] or comma string) to the canonical
 * 'LIVE,PBS,RO' storage string. Throws on empty or any invalid code.
 */
function normalizeRuleSetTypes(input: unknown): string {
  const raw = Array.isArray(input) ? input.map(String) : String(input ?? '').split(',')
  const codes = [...new Set(raw.map((s) => s.trim()).filter(Boolean))]
  if (codes.length === 0) throw new Error('type must include at least one of LIVE, RO, PBS')
  for (const c of codes) {
    if (!(RULE_SET_TYPE_ORDER as readonly string[]).includes(c)) {
      throw new Error(`type must be one of LIVE, RO, PBS — got ${c}`)
    }
  }
  return RULE_SET_TYPE_ORDER.filter((t) => codes.includes(t)).join(',')
}

/**
 * Legality routes — serve the LEGACY rule model (rule / rule_set / workset) for the
 * gantt "Legality" tab. A workset (e.g. 103 = "PBS Solver Ruleset") groups rules via
 * rule_set; each rule carries its faithful param JSON (rule.param_json), which preserves
 * the applicability columns (Bases/Ranks/Fleets/Crew Teams) the new model dropped.
 *
 * NOTE: rule_set.rule_id holds the COMPOSITE code = function‖instance (e.g. 8002001 = fn
 * 8002 + inst '001'), NOT rule.id. rule.rule_id now carries that same composite, so we
 * join rule ↔ rule_set directly on rule_id (no on-the-fly function‖instance build).
 */
export default async function legalityRoutes(fastify: FastifyInstance) {
  fastify.post('/preview-draft', async (request, reply) => {
    const rosterItemSchema = z.object({
      id: z.number().int(),
      crewId: z.string().min(1),
      pairingId: z.number().int().nullable(),
      ver: z.number().int().nullable().optional(),
      base: z.string().nullable().optional(),
      label: z.string().nullable().optional(),
      assignmentGroup: z.string().nullable().optional(),
      assignment: z.string().nullable().optional(),
      role: z.string().nullable().optional(),
      subRole: z.string().nullable().optional(),
      source: z.string().nullable().optional(),
      isRequested: z.number().int().nullable().optional(),
      isSwapped: z.number().int().nullable().optional(),
      preference: z.string().nullable().optional(),
      comments: z.string().nullable().optional(),
      score: z.number().nullable().optional(),
      workingHour: z.string().nullable().optional(),
      schStrDtUtc: z.string().nullable(),
      schEndDtUtc: z.string().nullable(),
      actStrDtUtc: z.string().nullable().optional(),
      actEndDtUtc: z.string().nullable().optional(),
      fltId: z.number().int().nullable().optional(),
      fltDt: z.string().nullable().optional(),
      dutySeq: z.number().int().nullable().optional(),
      segSeq: z.number().int().nullable().optional(),
      division: z.string().nullable().optional(),
      flightActingRank: z.string().nullable().optional(),
      rosterActingRank: z.string().nullable().optional(),
      activeRank: z.string().nullable().optional(),
      position: z.string().nullable().optional(),
      schCreditedMinutes: z.union([z.string(), z.number()]).nullable().optional(),
      actCreditedMinutes: z.union([z.string(), z.number()]).nullable().optional(),
      tagSet: z.string().nullable().optional(),
      exceptionCode: z.string().nullable().optional(),
      actRestMin: z.number().int().nullable().optional(),
    }).passthrough()
    const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    const schema = z.object({
      contextType: z.enum(['live', 'scenario']),
      scenarioId: z.number().int().positive().optional(),
      rulesetId: z.number().int().positive().optional(),
      affectedCrewIds: z.array(z.string().min(1)).min(1),
      afterItems: z.array(rosterItemSchema).min(1),
      focusPairingIds: z.array(z.number().int().positive()).optional(),
      // Inclusive Gantt RP calendar bounds for 7505/7507 (both or neither).
      rpFrom: ymd.optional(),
      rpTo: ymd.optional(),
    }).refine((b) => (b.rpFrom == null) === (b.rpTo == null), {
      message: 'rpFrom and rpTo must both be set or both omitted',
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    try {
      const result = await previewDraftLegality(fastify, parsed.data)
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  /**
   * List every legacy ruleset (workset) that actually maps ≥1 rule. This naturally
   * excludes the hundreds of empty "New Scenario"/PO/RO worksets and returns only the
   * real rulesets — currently 433 "F8 Full Ruleset" (14 rules) and 103 "PBS Solver
   * Ruleset" (2-rule 8002 subset). Ordered most-rules-first so the gantt can default
   * its selection to the full ruleset.
   */
  fastify.get('/rulesets', async (_request, reply) => {
    try {
      // The gantt's default rule set = workset 103 ("PBS Solver Ruleset"), which is also the
      // scenario.ruleset_id default. Flag it so the UI can badge it. (Model B rule_group, the
      // former source of the is_default flag, has been dropped.)
      const { rows } = await fastify.pgPool.query<{
        id: number; name: string; category: string | null; type: string; division: string; enabled: boolean; updated_by: string | null; rule_count: number; is_default: boolean
      }>(`
        SELECT w.id, w.name, w.category, w.type, w.division, w.enabled, w.updated_by, count(r.id)::int AS rule_count,
          (w.enabled = true) AS is_default
        FROM workset w
          LEFT JOIN rule_set rs ON rs.workset_id = w.id
          LEFT JOIN rule r ON r.rule_id = rs.rule_id
        WHERE w.category = 'RULE'
        GROUP BY w.id, w.name, w.category, w.type, w.division, w.enabled, w.updated_by
        ORDER BY count(r.id) DESC, w.id
      `)
      return success(reply, rows.map((r) => ({
        // workset.id is bigint → serialized as a string by pg; coerce so the gantt gets a number.
        id: Number(r.id), name: r.name, category: r.category, type: r.type, division: r.division,
        enabled: r.enabled === true, updatedBy: r.updated_by, ruleCount: r.rule_count,
        isDefault: r.is_default === true,
      })))
    } catch (err) {
      return fail(reply, 500, (err as Error).message)
    }
  })

  fastify.get('/ruleset-types', async (_request, reply) => {
    try {
      const rows = await dictionaryService.getByParentCode(fastify, 'RULE_SET_TYPE')
      return success(reply, rows.filter((r) => r.code).sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0)).map((r) => ({
        // codeValue is the persisted workset.type; name stores the configurable UI color.
        code: r.code!, name: r.code!, value: r.codeValue ?? r.code!,
      })))
    } catch (err) { return error(reply, 500, (err as Error).message) }
  })

  fastify.get('/ruleset/:worksetId', async (request, reply) => {
    const { worksetId } = request.params as { worksetId: string }
    const id = Number.parseInt(worksetId, 10)
    if (Number.isNaN(id)) return fail(reply, 400, 'invalid worksetId')

    try {
      const ws = await fastify.pgPool.query<{ id: number; name: string; category: string | null }>(
        'SELECT id, name, category FROM workset WHERE id = $1',
        [id],
      )
      if (ws.rows.length === 0) return fail(reply, 404, `workset ${id} not found`)

      const { rows } = await fastify.pgPool.query<Record<string, unknown>>(`
        SELECT
          r.id, r.function, r.instance, r.reference, r.category,
          r.description, r.detail, r.severity, r.overridability,
          r.division, r.owner, r.locked, r.updated_by, r.param_json
        FROM rule_set rs
          JOIN rule r ON r.rule_id = rs.rule_id
        WHERE rs.workset_id = $1
        ORDER BY r.function, r.instance
      `, [id])

      const rules = rows.map((r) => ({
        id: r.id,
        function: r.function,
        instance: r.instance,
        reference: r.reference,
        category: r.category,
        description: r.description,
        detail: r.detail,
        severity: r.severity,
        overridability: r.overridability,
        division: r.division,
        owner: r.owner,
        locked: r.locked,
        updatedBy: r.updated_by,
        paramJson: r.param_json,
      }))

      return success(reply, {
        workset: { id: ws.rows[0].id, name: ws.rows[0].name, category: ws.rows[0].category },
        rules,
      })
    } catch (err) {
      return fail(reply, 500, (err as Error).message)
    }
  })

  /**
   * PATCH /rule/:ruleId/params  (admin-only)
   * Updates rule.param_json in the DB. Body: { paramJson: LegalityParamJson }
   */
  fastify.patch('/rule/:ruleId/params', async (request, reply) => {
    if (!(await requireLegalityPermission(request, reply))) return reply
    const { ruleId } = request.params as { ruleId: string }
    const id = Number.parseInt(ruleId, 10)
    if (Number.isNaN(id)) return fail(reply, 400, 'invalid ruleId')

    const body = request.body as { paramJson?: unknown }
    if (!body?.paramJson || typeof body.paramJson !== 'object') {
      return fail(reply, 400, 'paramJson is required')
    }

    const paramJson = body.paramJson as { tables?: unknown }
    if (!Array.isArray(paramJson.tables)) {
      return fail(reply, 400, 'paramJson.tables must be an array')
    }
    for (const t of paramJson.tables as Array<unknown>) {
      const table = t as { header?: unknown; rows?: unknown }
      if (!Array.isArray(table.header) || !Array.isArray(table.rows)) {
        return fail(reply, 400, 'each table must have header[] and rows[]')
      }
    }

    try {
      const existing = await fastify.pgPool.query(
        'SELECT id FROM rule WHERE id = $1',
        [id],
      )
      if (existing.rows.length === 0) return fail(reply, 404, `rule ${id} not found`)

      await fastify.pgPool.query(
        `UPDATE rule SET param_json = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
        [JSON.stringify(body.paramJson), request.authUser!.userCode, id],
      )
      // Recheck scope (relevance-windowed): in-window scenarios recompute on next open;
      // out-of-window ones get a soft "outdated" flag only. Tell the client whether the rule
      // is in the live default ruleset so it can trigger the live recheck for its date range.
      const affected = await resolveAffected(fastify.pgPool, id)
      await markScenariosStale(fastify.pgPool, affected.inWindowScenarioIds)
      await flagScenariosParamsStale(fastify.pgPool, affected.outOfWindowScenarioIds)
      // Scoped recheck: which engine rules this change requires recomputing (the changed rule
      // + its dependents). null → whole group. The client passes this back to POST /recheck so
      // a single-rule edit recomputes one rule (~seconds), not all 9 (~minutes).
      const recheckRuleCodes = await affectedRuleCodes(fastify.pgPool, id)
      if (affected.liveWorksetIds.length > 0) await refreshAllLiveRulesets(fastify, affected.liveWorksetIds, recheckRuleCodes)
      return success(reply, {
        paramJson: body.paramJson,
        affectsLiveDefault: affected.affectsLiveDefault,
        scenarioCount: affected.scenarioCount,
        recheckRuleCodes,
        liveRecheck: affected.affectsLiveDefault ? 'computing' : null,
      })
    } catch (err) {
      return fail(reply, 500, (err as Error).message)
    }
  })

  /**
   * PATCH /rule/:ruleId/meta  (admin-only)
   * Updates rule metadata: reference, category, division, severity, description.
   */
  fastify.patch('/rule/:ruleId/meta', async (request, reply) => {
    if (!(await requireLegalityPermission(request, reply))) return reply
    const id = Number.parseInt((request.params as { ruleId: string }).ruleId, 10)
    if (Number.isNaN(id)) return fail(reply, 400, 'invalid ruleId')

    const existing = await fastify.pgPool.query('SELECT id FROM rule WHERE id = $1', [id])
    if (existing.rows.length === 0) return fail(reply, 404, `rule ${id} not found`)

    const b = request.body as {
      reference?: string | null
      category?: string | null
      division?: string | null
      severity?: number
      description?: string | null
    }

    const sets: string[] = []
    const vals: unknown[] = []

    if (b.reference !== undefined) {
      sets.push(`reference = $${sets.length + 1}`)
      vals.push(typeof b.reference === 'string' ? b.reference.trim() || null : null)
    }
    if (b.category !== undefined) {
      sets.push(`category = $${sets.length + 1}`)
      vals.push(typeof b.category === 'string' ? b.category.trim() || null : null)
    }
    if (b.division !== undefined) {
      sets.push(`division = $${sets.length + 1}`)
      vals.push(typeof b.division === 'string' ? b.division.trim() || null : null)
    }
    if (b.description !== undefined) {
      sets.push(`description = $${sets.length + 1}`)
      vals.push(typeof b.description === 'string' ? b.description.trim() || null : null)
    }
    if (b.severity !== undefined) {
      if (![1, 2, 3].includes(Number(b.severity))) return fail(reply, 400, 'severity must be 1, 2, or 3')
      sets.push(`severity = $${sets.length + 1}`)
      vals.push(Number(b.severity))
    }

    if (sets.length === 0) return fail(reply, 400, 'no fields to update')
    sets.push(`updated_by = $${sets.length + 1}`)
    vals.push(request.authUser!.userCode)
    sets.push('updated_at = NOW()')
    vals.push(id)

    try {
      const { rows } = await fastify.pgPool.query<Record<string, unknown>>(
        `UPDATE rule SET ${sets.join(', ')} WHERE id = $${vals.length}
         RETURNING id, function, instance, reference, category, description, detail,
                   severity, overridability, division, owner, locked, param_json`,
        vals,
      )
      const r = rows[0]
      return success(reply, {
        id: r.id, function: r.function, instance: r.instance, reference: r.reference,
        category: r.category, description: r.description, detail: r.detail,
        severity: r.severity, overridability: r.overridability, division: r.division,
        owner: r.owner, locked: r.locked, paramJson: r.param_json,
      })
    } catch (err) {
      return fail(reply, 500, (err as Error).message)
    }
  })

  /**
   * GET /rules — the full rule catalog (templates + copies), grouped client-side by
   * function. isTemplate = instance '001' (read-only for non-admins; admins can edit).
   */
  fastify.get('/rules', async (_request, reply) => {
    try {
      const { rows } = await fastify.pgPool.query<Record<string, unknown>>(`
        SELECT r.id, r.function, r.instance, r.reference, r.category, r.description,
               r.detail, r.severity, r.overridability, r.division, r.owner, r.locked,
               r.rule_id, r.updated_by, r.param_json
        FROM rule r
        ORDER BY r.function, r.instance
      `)
      return success(reply, rows.map((r) => ({
        id: r.id, function: r.function, instance: r.instance, reference: r.reference,
        category: r.category, description: r.description, detail: r.detail,
        severity: r.severity, overridability: r.overridability, division: r.division,
        owner: r.owner, locked: r.locked, paramJson: r.param_json,
        updatedBy: r.updated_by,
        isTemplate: r.instance === '001',
      })))
    } catch (err) {
      return fail(reply, 500, (err as Error).message)
    }
  })

  /**
   * POST /rules/:ruleId/copy (admin) — duplicate a rule into the next free instance.
   * New row: owner='U', locked='0', rule_id=function‖instance, param_json copied.
   */
  fastify.post('/rules/:ruleId/copy', async (request, reply) => {
    if (!(await requireLegalityPermission(request, reply))) return reply
    const id = Number.parseInt((request.params as { ruleId: string }).ruleId, 10)
    if (Number.isNaN(id)) return fail(reply, 400, 'invalid ruleId')
    try {
      await fastify.pgPool.query('BEGIN')
      const src = await fastify.pgPool.query(`SELECT * FROM rule WHERE id = $1`, [id])
      if (src.rows.length === 0) {
        await fastify.pgPool.query('ROLLBACK')
        return reply.status(404).send({ code: 404, data: null, message: `rule ${id} not found` })
      }
      const r = src.rows[0]
      // next free instance for this function: max(instance::int)+1, zero-padded to 3.
      const nx = await fastify.pgPool.query(
        `SELECT lpad((coalesce(max(instance::int), 0) + 1)::text, 3, '0') AS next_instance
           FROM rule WHERE function = $1`, [r.function])
      const inst = nx.rows[0].next_instance as string
      const ruleId = Number(`${r.function}${inst}`)
      const ins = await fastify.pgPool.query(
        `INSERT INTO rule (function, instance, class, description, reference, category,
            store_structure, source, detail, overridability, severity, filiale, division,
            owner, locked, exception_code, param_json, rule_id, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)
         RETURNING id, function, instance, rule_id`,
        [r.function, inst, r.class, r.description, r.reference, r.category, r.store_structure,
         r.source, r.detail, r.overridability, r.severity, r.filiale, r.division,
         'U', '0', r.exception_code, r.param_json, ruleId, request.authUser!.userCode])
      await fastify.pgPool.query('COMMIT')
      return success(reply, { ...ins.rows[0], isTemplate: false })
    } catch (err) {
      await fastify.pgPool.query('ROLLBACK')
      return fail(reply, 500, (err as Error).message)
    }
  })

  /** DELETE /rules/:ruleId (admin) — delete a copy. Never a template (instance='001'); never if in a rule_set. */
  fastify.delete('/rules/:ruleId', async (request, reply) => {
    if (!(await requireLegalityPermission(request, reply))) return reply
    const id = Number.parseInt((request.params as { ruleId: string }).ruleId, 10)
    if (Number.isNaN(id)) return fail(reply, 400, 'invalid ruleId')
    const r = await fastify.pgPool.query(`SELECT id, instance, rule_id FROM rule WHERE id = $1`, [id])
    if (r.rows.length === 0) return reply.status(404).send({ code: 404, data: null, message: `rule ${id} not found` })
    if (r.rows[0].instance === '001') {
      return reply.status(400).send({ code: 400, data: null, message: 'templates (instance 001) cannot be deleted' })
    }
    const used = await fastify.pgPool.query(`SELECT count(*)::int AS n FROM rule_set WHERE rule_id = $1`, [r.rows[0].rule_id])
    if (used.rows[0].n > 0) {
      return reply.status(409).send({ code: 409, data: null, message: 'rule is used by a rule set; remove it from all sets first' })
    }
    await fastify.pgPool.query(`DELETE FROM rule WHERE id = $1`, [id])
    return success(reply, { id })
  })

  // ── Phase 2b: Rule Set (workset) management ──────────────────────────────
  const userOf = (request: { authUser?: { userCode: string } }) => request.authUser!.userCode

  const requireLegalityPermission = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return false
    }
    return requireMenuAccess(fastify, authUser, reply, LEGALITY_RULE_SETS_MENU_CODE)
  }

  /** POST /rulesets (admin) — create a RULE workset. Body { name, division?, type?: string[], enabled? }. */
  fastify.post('/rulesets', async (request, reply) => {
    if (!(await requireLegalityPermission(request, reply))) return reply
    const b = request.body as { name?: string; division?: string; type?: unknown; enabled?: boolean }
    if (!b?.name?.trim()) return error(reply, 400, 'name is required')
    let type = 'RO'
    if (b.type !== undefined) {
      try { type = normalizeRuleSetTypes(b.type) } catch (e) { return error(reply, 400, (e as Error).message) }
    }
    const types = type.split(',')
    try {
      const filiale = await resolveFiliale(fastify)
      const division = b.division?.trim() || 'P'
      const enabled = b.enabled === true
      await fastify.pgPool.query('BEGIN')
      if (enabled) {
        for (const t of ['LIVE', 'PBS'] as const) {
          if (!types.includes(t)) continue
          const old = await fastify.pgPool.query<{ id: number }>(`SELECT id FROM workset
            WHERE category = 'RULE' AND type LIKE '%' || $1 || '%' AND division = $2 AND enabled = true`, [t, division])
          await fastify.pgPool.query(`UPDATE workset SET enabled = false, updated_by = $3, updated_at = now()
            WHERE category = 'RULE' AND type LIKE '%' || $1 || '%' AND division = $2`, [t, division, userOf(request)])
          for (const row of old.rows) await fastify.pgPool.query(`DELETE FROM rule_violation WHERE ruleset_id = $1`, [row.id])
        }
      }
      const { rows } = await fastify.pgPool.query<{ id: number; name: string; category: string | null; type: string; division: string; enabled: boolean; updated_by: string | null }>(
        `INSERT INTO workset (name, division, category, type, enabled, filiale, created_by, updated_by)
         VALUES ($1, $2, 'RULE', $3, $4, $5, $6, $6) RETURNING id, name, category, type, division, enabled, updated_by`,
        [b.name.trim(), division, type, enabled, filiale, userOf(request)])
      await fastify.pgPool.query('COMMIT')
      if (enabled && types.includes('LIVE')) await refreshLiveRuleset(fastify, Number(rows[0].id))
      return success(reply, { id: Number(rows[0].id), name: rows[0].name, category: rows[0].category, type: rows[0].type, division: rows[0].division, enabled: rows[0].enabled, updatedBy: rows[0].updated_by, ruleCount: 0, isDefault: rows[0].enabled })
    } catch (err) { await fastify.pgPool.query('ROLLBACK'); return error(reply, 500, (err as Error).message) }
  })

  /** PATCH /ruleset/:worksetId (admin) — edit name/division/type/enabled. Category remains RULE. */
  fastify.patch('/ruleset/:worksetId', async (request, reply) => {
    if (!(await requireLegalityPermission(request, reply))) return reply
    const wid = Number.parseInt((request.params as { worksetId: string }).worksetId, 10)
    if (Number.isNaN(wid)) return error(reply, 400, 'invalid worksetId')
    const b = request.body as { name?: string; division?: string; type?: unknown; enabled?: boolean }
    let nextTypeString: string | null = null
    if (b.type !== undefined) {
      try { nextTypeString = normalizeRuleSetTypes(b.type) } catch (e) { return error(reply, 400, (e as Error).message) }
    }
    const sets: string[] = []; const vals: unknown[] = []
    if (b.name !== undefined) { sets.push(`name = $${sets.length + 1}`); vals.push(b.name) }
    if (b.division !== undefined) { sets.push(`division = $${sets.length + 1}`); vals.push(b.division) }
    if (nextTypeString !== null) { sets.push(`type = $${sets.length + 1}`); vals.push(nextTypeString) }
    if (b.enabled !== undefined) { sets.push(`enabled = $${sets.length + 1}`); vals.push(b.enabled === true) }
    if (sets.length === 0) return error(reply, 400, 'no fields to update')
    sets.push(`updated_by = $${sets.length + 1}`); vals.push(userOf(request))
    sets.push('updated_at = now()')
    vals.push(wid)
    try {
      const current = await fastify.pgPool.query<{ type: string; division: string; enabled: boolean; category: string | null }>(
        `SELECT type, division, enabled, category FROM workset WHERE id = $1`, [wid])
      if (current.rows.length === 0) return error(reply, 404, `workset ${wid} not found`)
      const oldTypes = current.rows[0].type.split(',')
      const newTypes = nextTypeString === null ? oldTypes : nextTypeString.split(',')
      const nextDivision = b.division ?? current.rows[0].division
      const nextEnabled = b.enabled ?? current.rows[0].enabled
      if (nextEnabled) {
        for (const t of ['LIVE', 'PBS'] as const) {
          if (!newTypes.includes(t)) continue
          const old = await fastify.pgPool.query<{ id: number }>(`SELECT id FROM workset
            WHERE category = 'RULE' AND type LIKE '%' || $1 || '%' AND division = $2 AND enabled = true AND id <> $3`, [t, nextDivision, wid])
          await fastify.pgPool.query(`UPDATE workset SET enabled = false, updated_by = $3, updated_at = now()
            WHERE category = 'RULE' AND type LIKE '%' || $1 || '%' AND division = $2 AND id <> $4`, [t, nextDivision, userOf(request), wid])
          for (const row of old.rows) await fastify.pgPool.query(`DELETE FROM rule_violation WHERE ruleset_id = $1`, [row.id])
        }
      }
      // The set itself was an enabled LIVE set and no longer is → drop its own violations.
      if (current.rows[0].enabled && oldTypes.includes('LIVE') &&
          (!nextEnabled || !newTypes.includes('LIVE') || nextDivision !== current.rows[0].division)) {
        await fastify.pgPool.query(`DELETE FROM rule_violation WHERE ruleset_id = $1`, [wid])
      }
      // Transition into an enabled LIVE set → background live recheck.
      const refreshLive = nextEnabled && newTypes.includes('LIVE') &&
        (!oldTypes.includes('LIVE') || !current.rows[0].enabled ||
          b.enabled !== undefined || b.type !== undefined || b.division !== undefined)
      const { rows } = await fastify.pgPool.query<{ id: number; name: string; category: string | null; type: string; division: string; enabled: boolean }>(
        `UPDATE workset SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id, name, category, type, division, enabled`, vals)
      if (rows.length === 0) return error(reply, 404, `workset ${wid} not found`)
      if (refreshLive) await refreshLiveRuleset(fastify, wid)
      return success(reply, { id: Number(rows[0].id), name: rows[0].name, category: rows[0].category, type: rows[0].type, division: rows[0].division, enabled: rows[0].enabled })
    } catch (err) { return error(reply, 500, (err as Error).message) }
  })

  /** DELETE /ruleset/:worksetId (admin) — delete the workset + its rule_set rows.
   *  Guard: refuse if a scenario resolves to it by name (rule_group.name = workset.name). */
  fastify.delete('/ruleset/:worksetId', async (request, reply) => {
    if (!(await requireLegalityPermission(request, reply))) return reply
    const wid = Number.parseInt((request.params as { worksetId: string }).worksetId, 10)
    if (Number.isNaN(wid)) return error(reply, 400, 'invalid worksetId')
    const ws = await fastify.pgPool.query<{ id: number; name: string }>(`SELECT id, name FROM workset WHERE id = $1`, [wid])
    if (ws.rows.length === 0) return error(reply, 404, `workset ${wid} not found`)
    const used = await fastify.pgPool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM scenario WHERE ruleset_id = $1`, [wid])
    if (used.rows[0].n > 0) return error(reply, 409, `ruleset is used by ${used.rows[0].n} scenario(s); cannot delete`)
    try {
      await fastify.pgPool.query('BEGIN')
      await fastify.pgPool.query(`DELETE FROM rule_set WHERE workset_id = $1`, [wid])
      await fastify.pgPool.query(`DELETE FROM workset WHERE id = $1`, [wid])
      await fastify.pgPool.query('COMMIT')
      return success(reply, { id: wid })
    } catch (err) { await fastify.pgPool.query('ROLLBACK'); return error(reply, 500, (err as Error).message) }
  })

  /** POST /ruleset/:worksetId/copy (admin) — Body { name, mode: 'copy-rules' | 'share-rules' }.
   *  share-rules: new workset + rule_set rows at the SAME rule_ids.
   *  copy-rules:  new workset + each member rule duplicated into a new instance, membership → the copies. */
  fastify.post('/ruleset/:worksetId/copy', async (request, reply) => {
    if (!(await requireLegalityPermission(request, reply))) return reply
    const wid = Number.parseInt((request.params as { worksetId: string }).worksetId, 10)
    if (Number.isNaN(wid)) return error(reply, 400, 'invalid worksetId')
    const b = request.body as { name?: string; mode?: string }
    if (!b?.name?.trim()) return error(reply, 400, 'name is required')
    const mode = b.mode === 'copy-rules' ? 'copy-rules' : 'share-rules'
    const by = userOf(request)
    try {
      await fastify.pgPool.query('BEGIN')
      const src = await fastify.pgPool.query(`SELECT * FROM workset WHERE id = $1`, [wid])
      if (src.rows.length === 0) { await fastify.pgPool.query('ROLLBACK'); return error(reply, 404, `workset ${wid} not found`) }
      const s = src.rows[0]
      const filiale = await resolveFiliale(fastify)
      const nw = await fastify.pgPool.query<{ id: number; name: string; category: string | null }>(
        `INSERT INTO workset (name, division, category, type, filiale, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id, name, category`,
        [b.name.trim(), s.division, s.category, s.type, s.filiale ?? filiale, by])
      const newWid = Number(nw.rows[0].id)
      const members = await fastify.pgPool.query<{ rule_id: number }>(`SELECT rule_id FROM rule_set WHERE workset_id = $1`, [wid])
      for (const m of members.rows) {
        let ruleId = m.rule_id
        if (mode === 'copy-rules') {
          const r = await fastify.pgPool.query(`SELECT * FROM rule WHERE rule_id = $1`, [m.rule_id])
          if (r.rows.length === 0) continue
          const rr = r.rows[0]
          const nx = await fastify.pgPool.query<{ ni: string }>(
            `SELECT lpad((coalesce(max(instance::int),0)+1)::text,3,'0') AS ni FROM rule WHERE function = $1`, [rr.function])
          const inst = nx.rows[0].ni
          ruleId = Number(`${rr.function}${inst}`)
          await fastify.pgPool.query(
            `INSERT INTO rule (function, instance, class, description, reference, category, store_structure,
               source, detail, overridability, severity, filiale, division, owner, locked, exception_code,
               param_json, rule_id, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'U','0',$14,$15,$16,$17,$17)`,
            [rr.function, inst, rr.class, rr.description, rr.reference, rr.category, rr.store_structure, rr.source,
             rr.detail, rr.overridability, rr.severity, rr.filiale, rr.division, rr.exception_code, rr.param_json, ruleId, by])
        }
        await fastify.pgPool.query(
          `INSERT INTO rule_set (workset_id, rule_id, created_by, updated_by) VALUES ($1,$2,$3,$3)`, [newWid, ruleId, by])
      }
      await fastify.pgPool.query('COMMIT')
      return success(reply, { id: newWid, name: nw.rows[0].name, category: nw.rows[0].category, ruleCount: members.rows.length, isDefault: false })
    } catch (err) { await fastify.pgPool.query('ROLLBACK'); return error(reply, 500, (err as Error).message) }
  })

  /** POST /ruleset/:worksetId/rules/:ruleId (admin) — add a rule (by rule.id) to the workset. */
  fastify.post('/ruleset/:worksetId/rules/:ruleId', async (request, reply) => {
    if (!(await requireLegalityPermission(request, reply))) return reply
    const p = request.params as { worksetId: string; ruleId: string }
    const wid = Number.parseInt(p.worksetId, 10), rid = Number.parseInt(p.ruleId, 10)
    if (Number.isNaN(wid) || Number.isNaN(rid)) return error(reply, 400, 'invalid ids')
    const r = await fastify.pgPool.query<{ rule_id: number }>(`SELECT rule_id FROM rule WHERE id = $1`, [rid])
    if (r.rows.length === 0) return error(reply, 404, `rule ${rid} not found`)
    const dup = await fastify.pgPool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM rule_set WHERE workset_id = $1 AND rule_id = $2`, [wid, r.rows[0].rule_id])
    if (dup.rows[0].n > 0) return error(reply, 409, 'rule already in this set')
    await fastify.pgPool.query(
      `INSERT INTO rule_set (workset_id, rule_id, created_by, updated_by) VALUES ($1,$2,$3,$3)`,
      [wid, r.rows[0].rule_id, userOf(request)])
    return success(reply, { worksetId: wid, ruleId: rid })
  })

  /** DELETE /ruleset/:worksetId/rules/:ruleId (admin) — remove a rule from the workset. */
  fastify.delete('/ruleset/:worksetId/rules/:ruleId', async (request, reply) => {
    if (!(await requireLegalityPermission(request, reply))) return reply
    const p = request.params as { worksetId: string; ruleId: string }
    const wid = Number.parseInt(p.worksetId, 10), rid = Number.parseInt(p.ruleId, 10)
    if (Number.isNaN(wid) || Number.isNaN(rid)) return error(reply, 400, 'invalid ids')
    const r = await fastify.pgPool.query<{ rule_id: number }>(`SELECT rule_id FROM rule WHERE id = $1`, [rid])
    if (r.rows.length === 0) return error(reply, 404, `rule ${rid} not found`)
    await fastify.pgPool.query(`DELETE FROM rule_set WHERE workset_id = $1 AND rule_id = $2`, [wid, r.rows[0].rule_id])
    return success(reply, { worksetId: wid, ruleId: rid })
  })

  /** POST /recheck  (admin) — body { groupCode, from, to } → spawn live recheck for the range. */
  fastify.post('/recheck', async (request, reply) => {
    if (!(await requireLegalityPermission(request, reply))) return reply
    const b = request.body as { groupCode?: string; from?: string; to?: string; ruleCodes?: string[] }
    if (!b?.groupCode || !b?.from || !b?.to) return fail(reply, 400, 'groupCode, from, to are required')
    let rulesetId: string = b.groupCode
    if (!/^\d+$/.test(b.groupCode)) {
      const r = await fastify.pgPool.query<{ id: number }>(
        `select id from workset where category = 'RULE' and type like '%LIVE%' and enabled = true and division = 'P' order by id limit 1`)
      if (!r.rows[0]) return fail(reply, 400, 'no enabled LIVE RULE workset found')
      rulesetId = String(r.rows[0].id)
    }
    const airline = await resolveFiliale(fastify)
    const k = (s: string) => `legality:recheck:${airline}:${rulesetId}:${s}`
    const cur = await fastify.redis.get(k('status'))
    if (cur === 'computing') return success(reply, { status: 'computing' }) // dedupe concurrent triggers
    await fastify.redis.set(k('status'), 'computing', { EX: 1800 })
    // ruleCodes (optional) scopes the recompute to a subset; omitted → whole group.
    spawnLiveRecheck(fastify, rulesetId, b.from, b.to, Array.isArray(b.ruleCodes) ? b.ruleCodes : null)
    return success(reply, { status: 'computing' })
  })

  /** GET /recheck-status?groupCode= — Redis-backed status + last-checked timestamp. */
  fastify.get('/recheck-status', async (request, reply) => {
    const groupCode = (request.query as { groupCode?: string }).groupCode
    if (!groupCode) return fail(reply, 400, 'groupCode is required')
    const airline = await resolveFiliale(fastify)
    const k = (s: string) => `legality:recheck:${airline}:${groupCode}:${s}`
    const [status, lastCheckedAt, error] = await Promise.all([
      fastify.redis.get(k('status')), fastify.redis.get(k('last_checked_at')), fastify.redis.get(k('error')),
    ])
    return success(reply, { status: status ?? 'idle', lastCheckedAt: lastCheckedAt ?? null, error: error || null })
  })
}
