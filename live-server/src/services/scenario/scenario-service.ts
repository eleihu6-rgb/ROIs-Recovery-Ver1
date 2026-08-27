import { eq, and, or, sql, asc, desc, ilike, getTableColumns, ne } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { scenario, scenarioGroup, schedulePublishRecord } from '../../models/scenario/scenario.js'
import { workset } from '../../models/rule/workset.js'
import { getOrSet, invalidate, invalidatePattern } from '../../utils/cache.js'
import { clearScenarioResult } from './scenario-result-loader.js'
import { deleteScenarioResultExceptNotes, deleteScenarioResultJson, getScenarioResults } from './scenario-result-store.js'
import { scenarioParameterService } from './scenario-parameter-service.js'
import { scenarioVersionService } from './scenario-version-service.js'
import { countScenarioRunScope, type ScenarioRow } from './scenario-export-service.js'
import { normalizeCrewDivision } from './filter-params-normalize.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'
import type { PaginationQuery } from '../../utils/pagination.js'
import { paginate } from '../../utils/pagination.js'
import { scenarioSchema, quoteIdentifier, liveSchemaName } from '../../utils/db-schema.js'
import { resolveFiliale } from '../../utils/filiale.js'

interface ScenarioListQuery extends PaginationQuery {
  search?: string
  name?: string
  fileType?: 'PO' | 'RO' | 'TO'
  status?: 'DRAFT' | 'RUNNING' | 'DONE' | 'FAILED' | 'PUBLISHED'
}

/** Create/update body: scenario columns + workset-owned name/division. */
export type ScenarioWriteInput = Partial<typeof scenario.$inferInsert> & {
  name?: string | null
  division?: string | null
  algorithmParameters?: Array<{ code: string; value: unknown }>
}

const CACHE_PREFIX = 'scenario'
const CACHE_TTL = 600 // 10min

/**
 * Coerce a date-ish value into a Date for Drizzle timestamp columns.
 * The frontend sends 'YYYY-MM-DD' strings, which Drizzle cannot bind to a
 * `timestamp` column directly (it calls `.toISOString()` on the value).
 */
const coerceDate = (value: unknown): Date | undefined => {
  if (value == null) return undefined
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? undefined : d
  }
  return undefined
}
const scenarioDateText = (value: Date | string): string => {
  const text = value instanceof Date ? value.toISOString() : String(value)
  return text.slice(0, 10)
}
const SCHEDULE_CACHE_PREFIX = 'schedule-publish'
const SCHEDULE_CACHE_TTL = 86400 // 24h
const NO_CREW_SCOPE_MESSAGE =
  'No crew matched the selected scenario scope. Check Crew Filters such as Division, Base, Fleet, and Status before running optimization.'
const NO_PAIRING_SCOPE_MESSAGE =
  'No pairings matched the selected scenario scope. Check Pairing Filters such as Base, Fleet, Division, and date range before running optimization.'

// Valid state transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT:     ['RUNNING'],
  RUNNING:   ['DONE', 'FAILED'],
  DONE:      ['DRAFT', 'PUBLISHED'],
  FAILED:    ['DRAFT', 'RUNNING'],
  PUBLISHED: ['DRAFT'],
}

interface ScenarioTransitionOptions {
  deleteVersionFiles?: boolean
  token?: string
  airline?: string
}

/** Scenario-schema tables keyed by scenario_id (PO + RO + legality). */
const SCENARIO_OWNED_TABLES = [
  // PO pairing / flight (dependency order: composition/segment before pairing/flight)
  'pairing_composition',
  'pairing_segment',
  'pairing',
  'flight_composition',
  'flight',
  // RO result + manday
  'roster_flight',
  'crew_manday_fd_daily', 'crew_manday_fd_period', 'crew_manday_fd_yearly',
  'crew_manday_cc_am_daily', 'crew_manday_cc_am_period', 'crew_manday_cc_am_yearly',
  // legality
  'rule_violation', 'legality_status',
] as const

const stripDivisionFromFilterParams = (
  raw: unknown,
): Record<string, unknown> => {
  const fp = (raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {}) as Record<string, unknown>
  delete fp.division
  delete fp.base
  if (fp.crew && typeof fp.crew === 'object') {
    const crew = { ...(fp.crew as Record<string, unknown>) }
    delete crew.division
    fp.crew = crew
  }
  return fp
}

const selectScenarioWithWorkset = {
  ...getTableColumns(scenario),
  name: workset.name,
  division: workset.division,
}

const resolvePoScenarioReference = async (
  fastify: FastifyInstance,
  rawId: number | null | undefined,
): Promise<number | null | undefined> => {
  if (rawId == null || rawId === 0) return rawId
  const refId = Number(rawId)
  if (!Number.isFinite(refId)) return rawId

  const [exactScenario] = await fastify.db
    .select({ id: scenario.id })
    .from(scenario)
    .where(and(eq(scenario.id, refId), eq(scenario.fileType, 'PO')))
    .limit(1)
  if (exactScenario) return refId

  const [legacyWorksetRef] = await fastify.db
    .select({ id: scenario.id })
    .from(scenario)
    .where(and(eq(scenario.worksetId, refId), eq(scenario.fileType, 'PO')))
    .limit(1)
  return legacyWorksetRef?.id ?? refId
}

const normalizeScenarioPairingReference = async <T extends { fileType?: string | null; pairingScenarioId?: number | null }>(
  fastify: FastifyInstance,
  row: T | null,
): Promise<T | null> => {
  if (!row || (row.fileType !== 'RO' && row.fileType !== 'TO')) return row
  const normalized = await resolvePoScenarioReference(fastify, row.pairingScenarioId)
  if (normalized === row.pairingScenarioId) return row
  return { ...row, pairingScenarioId: normalized ?? null }
}

/** Delete all scenario-owned child rows (scenario schema + master meta). Does not delete workset/master. */
export const clearScenarioOwnedData = async (
  pool: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  scenarioId: number,
): Promise<void> => {
  const schema = scenarioSchema()
  for (const t of SCENARIO_OWNED_TABLES) {
    try {
      await pool.query(`delete from ${schema}.${t} where scenario_id = $1`, [scenarioId])
    } catch {
      // optional / missing table must not block delete
    }
  }
  // Also cover clearScenarioResult tables (idempotent overlap with roster/manday above)
  await clearScenarioResult(pool as Parameters<typeof clearScenarioResult>[0], scenarioId)
  await deleteScenarioResultJson(pool, scenarioId)
  await pool.query(`delete from scenario_parameter where scenario_id = $1`, [scenarioId])
  await pool.query(`delete from scenario_group where scenario_id = $1`, [scenarioId])
}

export const scenarioService = {
  // --- Scenario CRUD ---

  async list(fastify: FastifyInstance, query: ScenarioListQuery) {
    const { page, pageSize, search, name, fileType, status } = query
    const searchTerm = (search ?? name)?.trim()
    const cacheKey = `${CACHE_PREFIX}:list:v4:${page}:${pageSize}:${fileType ?? ''}:${status ?? ''}:${searchTerm ?? ''}`

    return getOrSet(fastify.redis, cacheKey, CACHE_TTL, async () => {
      const searchPattern = searchTerm ? `%${searchTerm}%` : null
      const conditions = [
        ...(fileType ? [eq(scenario.fileType, fileType)] : []),
        ...(status   ? [eq(scenario.status, status)]     : []),
        ...(searchPattern ? [
          or(
            ilike(sql<string>`${scenario.id}::text`, searchPattern),
            ilike(workset.name, searchPattern),
            ilike(scenario.updatedBy, searchPattern),
          ),
        ] : []),
      ]
      const where = conditions.length > 0 ? and(...conditions) : undefined
      const scenarioDb = scenarioSchema()

      const [items, countResult] = await Promise.all([
        fastify.db
          .select({
            ...selectScenarioWithWorkset,
            optimizedCount: sql<number>`(
              SELECT (
                count(DISTINCT rf.pairing_id)
                + count(*) - count(rf.pairing_id)
              )::int
              FROM ${sql.raw(scenarioDb)}.roster_flight rf
              WHERE rf.scenario_id = ${scenario.id}
                AND rf.is_deleted = 0
                AND rf.source = 'CR'
            )`,
          })
          .from(scenario)
          .innerJoin(workset, eq(scenario.worksetId, workset.id))
          .where(where)
          // Most-recently-updated first: any edit / status transition (run → RUNNING,
          // finish → DONE/FAILED, publish, rename) bumps updated_at, so the scenario the
          // user just touched floats to the top of page 1. A freshly created/duplicated
          // scenario also lands first (updated_at == created_at at insert time).
          .orderBy(desc(scenario.updatedAt), desc(scenario.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        fastify.db
          .select({ count: sql<number>`count(*)::int` })
          .from(scenario)
          .innerJoin(workset, eq(scenario.worksetId, workset.id))
          .where(where),
      ])

      return paginate({ page, pageSize }, items, countResult[0].count)
    })
  },

  async getById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:${id}`, CACHE_TTL, async () => {
      const [row] = await fastify.db
        .select({
          ...selectScenarioWithWorkset,
        })
        .from(scenario)
        .innerJoin(workset, eq(scenario.worksetId, workset.id))
        .where(eq(scenario.id, id))
      return normalizeScenarioPairingReference(fastify, row ?? null)
    })
  },

  async create(fastify: FastifyInstance, data: ScenarioWriteInput, username: string) {
    const fileType = (data.fileType ?? 'PO') as string
    const division = normalizeCrewDivision(data.division)
    const wsName = (typeof data.name === 'string' && data.name.trim()
      ? data.name.trim()
      : 'New Scenario').slice(0, 200)
    const filterParams = stripDivisionFromFilterParams(data.filterParams)

    let worksetId = data.worksetId
    if (!worksetId) {
      const filiale = await resolveFiliale(fastify)
      const [ws] = await fastify.db
        .insert(workset)
        .values({
          name: wsName,
          division,
          category: 'OPTIMIZER',
          type: fileType.substring(0, 2),
          filiale,
          ...auditCreate(username),
        })
        .returning()
      worksetId = ws.id
    }

    // scenario row — name/division live on workset only
    const { name: _n, division: _d, worksetId: _w, filterParams: _fp, ...scenarioCols } = data
    if (scenarioCols.pairingScenarioId != null) {
      scenarioCols.pairingScenarioId = await resolvePoScenarioReference(fastify, scenarioCols.pairingScenarioId)
    }
    const [row] = await fastify.db
      .insert(scenario)
      .values({
        ...scenarioCols,
        worksetId,
        filterParams,
        status: 'DRAFT',
        strDtLoc: coerceDate(data.strDtLoc) ?? new Date(),
        endDtLoc: coerceDate(data.endDtLoc) ?? new Date(),
        cqfsetId: data.cqfsetId ?? '',
        rulesetId: data.rulesetId ?? 103,
        ...auditCreate(username),
      })
      .returning()
    await scenarioParameterService.ensureDefaults(fastify, row.id, username)
    await invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`)
    return this.getById(fastify, row.id)
  },

  async update(fastify: FastifyInstance, id: number, data: ScenarioWriteInput, username: string) {
    const [current] = await fastify.db
      .select({ worksetId: scenario.worksetId })
      .from(scenario)
      .where(eq(scenario.id, id))
    if (!current) return null

    const { name, division, algorithmParameters, ...rest } = data
    const patch: Partial<typeof scenario.$inferInsert> = { ...rest }
    delete (patch as { name?: unknown }).name
    delete (patch as { division?: unknown }).division
    if ('strDtLoc' in patch) patch.strDtLoc = coerceDate(patch.strDtLoc)
    if ('endDtLoc' in patch) patch.endDtLoc = coerceDate(patch.endDtLoc)
    if ('filterParams' in patch) {
      patch.filterParams = stripDivisionFromFilterParams(patch.filterParams)
    }
    if ('pairingScenarioId' in patch) {
      patch.pairingScenarioId = await resolvePoScenarioReference(fastify, patch.pairingScenarioId)
    }

    const worksetPatch: Partial<typeof workset.$inferInsert> = {}
    if (typeof name === 'string' && name.trim()) {
      worksetPatch.name = name.trim().slice(0, 200)
    }
    if (division !== undefined && division !== null) {
      worksetPatch.division = normalizeCrewDivision(division)
    }
    if (Object.keys(worksetPatch).length > 0) {
      await fastify.db
        .update(workset)
        .set({ ...worksetPatch, ...auditUpdate(username) })
        .where(eq(workset.id, current.worksetId))
    }

    if (Object.keys(patch).length > 0) {
      await fastify.db
        .update(scenario)
        .set({ ...patch, ...auditUpdate(username) })
        .where(eq(scenario.id, id))
    } else {
      // Still bump scenario.updated_at when only workset fields changed so list sort stays correct
      await fastify.db
        .update(scenario)
        .set({ ...auditUpdate(username) })
        .where(eq(scenario.id, id))
    }

    await scenarioParameterService.ensureDefaults(fastify, id, username)
    if (algorithmParameters) {
      await scenarioParameterService.saveValues(fastify, id, algorithmParameters, username)
    }

    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`),
    ])
    return this.getById(fastify, id)
  },

  async remove(fastify: FastifyInstance, id: number) {
    const [row] = await fastify.db
      .select({ worksetId: scenario.worksetId })
      .from(scenario)
      .where(eq(scenario.id, id))

    await clearScenarioOwnedData(fastify.pgPool, id)
    await fastify.db.delete(scenario).where(eq(scenario.id, id))

    if (row?.worksetId) {
      // Only delete the workset if no other scenario references it and it is not RULE
      const [other] = await fastify.db
        .select({ id: scenario.id })
        .from(scenario)
        .where(and(eq(scenario.worksetId, row.worksetId), ne(scenario.id, id)))
        .limit(1)
      if (!other) {
        await fastify.db
          .delete(workset)
          .where(and(
            eq(workset.id, row.worksetId),
            or(
              eq(workset.category, 'OPTIMIZER'),
              sql`${workset.category} is null`,
              eq(workset.category, 'PO'),
              eq(workset.category, 'RO'),
              eq(workset.category, 'TO'),
              sql`btrim(coalesce(${workset.category}, '')) = ''`,
            ),
            sql`${workset.category} is distinct from 'RULE'`,
          ))
      }
    }

    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`),
    ])
  },

  async duplicate(fastify: FastifyInstance, id: number, username: string) {
    const source = await this.getById(fastify, id)
    if (!source) throw new Error('Scenario not found')

    const rawName = `Copy of ${source.name ?? ''}`
    const name = rawName.slice(0, 200)

    const payload: ScenarioWriteInput = {
      name,
      division: source.division ?? 'P',
      fileType: source.fileType as ScenarioWriteInput['fileType'],
      strDtLoc: source.strDtLoc,
      endDtLoc: source.endDtLoc,
      leadinLive: source.leadinLive as ScenarioWriteInput['leadinLive'],
      cqfsetId: source.cqfsetId ?? '',
      rulesetId: source.rulesetId ?? 103,
      pairingScenarioId: source.pairingScenarioId ?? undefined,
      flightScenarioId: source.flightScenarioId ?? undefined,
      rankCross: source.rankCross ?? undefined,
      filterParams: stripDivisionFromFilterParams(source.filterParams),
      comments: source.comments ?? undefined,
      isPublic: source.isPublic as ScenarioWriteInput['isPublic'],
      isFavorite: source.isFavorite as ScenarioWriteInput['isFavorite'],
    }

    const created = await this.create(fastify, payload, username)
    if (!created) throw new Error('Failed to duplicate scenario')
    await scenarioParameterService.copyValues(fastify, id, created.id, username)
    return created
  },

  /**
   * Transition scenario status with validation.
   */
  async transition(
    fastify: FastifyInstance,
    id: number,
    newStatus: string,
    username: string,
    options: ScenarioTransitionOptions = {},
  ) {
    const [current] = await fastify.db
      .select()
      .from(scenario)
      .where(eq(scenario.id, id))

    if (!current) {
      throw new Error('Scenario not found')
    }

    if (current.status === 'PUBLISHED' && newStatus === 'PUBLISHED') {
      return this.getById(fastify, id)
    }

    const allowed = VALID_TRANSITIONS[current.status]
    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(`Invalid status transition: ${current.status} -> ${newStatus}`)
    }

    // "Remove result" (any terminal status → DRAFT) must clear the PERSISTED optimization
    // output, not just flip the status. The gantt DB path is gated on loaded roster rows
    // (hasLoadedRoster counts scenario.roster_flight), NOT on status — so leaving those rows
    // behind makes a "removed" scenario reopen the stale roster. The scenario schema isn't
    // FK-linked to the master row, so clear each partition explicitly (mirrors remove()).
    const clearingResult = newStatus === 'DRAFT'
    const deleteVersionFiles = clearingResult && options.deleteVersionFiles === true
    if (clearingResult) {
      const scenarioTables = [
        'roster_flight',
        'crew_manday_fd_daily', 'crew_manday_fd_period', 'crew_manday_fd_yearly',
        'crew_manday_cc_am_daily', 'crew_manday_cc_am_period', 'crew_manday_cc_am_yearly',
        'rule_violation', 'legality_status',
      ]
      const scenarioDb = scenarioSchema()
      for (const t of scenarioTables) {
        try {
          await fastify.pgPool.query(`delete from ${scenarioDb}.${t} where scenario_id = $1`, [id])
        } catch (err) {
          // A missing optional partition table must not block the reset; the critical one
          // (roster_flight, which the gantt gate reads) is the first and always present.
          fastify.log.warn({ err, table: t, id }, 'transition→DRAFT: partition cleanup skipped')
        }
      }
      // Clear the JSON result store (kpi / credit_hours / distribution / raw_result)
      // but keep the scenario's Notes — they are deleted only with the scenario itself.
      try {
        await deleteScenarioResultExceptNotes(fastify.pgPool, id)
      } catch (err) {
        fastify.log.warn({ err, id }, 'transition→DRAFT: scenario_result cleanup failed')
      }
    }

    await fastify.db
      .update(scenario)
      .set({
        status: newStatus,
        // Drop the result pointers too, so a DRAFT no longer advertises a result file.
        ...(clearingResult ? { fileSize: null, checksum: null, taskId: null } : {}),
        ...auditUpdate(username),
      })
      .where(eq(scenario.id, id))
      .returning()

    if (deleteVersionFiles) {
      if (!options.token || !options.airline) {
        fastify.log.warn({ id }, 'transition→DRAFT: version file cleanup skipped because auth context is missing')
      } else {
        try {
          await scenarioVersionService.clearAllVersionFiles(fastify, id, options.token, options.airline)
        } catch (err) {
          fastify.log.warn({ err, id }, 'transition→DRAFT: version file cleanup failed')
        }
      }
    }

    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`),
    ])

    return this.getById(fastify, id)
  },

  // --- Optimization run ---

  /**
   * Kick off an RO optimization: transition DRAFT→RUNNING, then call
   * engine-server /optimize/start (forwarding the gantt JWT so engine-server
   * can call back /export and /result). Stores the returned task_id.
   * Rolls the scenario back to FAILED if engine-server rejects the start.
   */
  async run(
    fastify: FastifyInstance,
    id: number,
    token: string,
    airline: string,
    liveServerUrl: string,
    username: string,
  ): Promise<{ taskId: string }> {
    const sc = await this.getById(fastify, id)
    if (!sc) throw new Error('Scenario not found')
    if (sc.status === 'RUNNING') throw new Error('Scenario is already running')

    if (sc.fileType === 'RO' || sc.fileType === 'TO') {
      const scope = await countScenarioRunScope(fastify, {
        id: sc.id,
        worksetId: sc.worksetId,
        strDtLoc: sc.strDtLoc,
        endDtLoc: sc.endDtLoc,
        filterParams: (sc.filterParams ?? {}) as Record<string, unknown>,
        rulesetId: sc.rulesetId,
        fileType: sc.fileType,
        division: sc.division ?? 'P',
      } satisfies ScenarioRow)

      if (scope.crewCount === 0) throw new Error(NO_CREW_SCOPE_MESSAGE)
      if (scope.pairingCount === 0) throw new Error(NO_PAIRING_SCOPE_MESSAGE)
    }

    // The scenario-scoped bid package is keyed to a single roster period (live-server
    // algorithm-export validates rosterPeriodId + periodCode against it). Resolve the
    // period by exact date match, mirroring the publish-snapshot rule.
    const rosterPeriod = await fastify.pgPool.query<{
      id: string
      pbsPeriodCode: string | null
    }>(
      `select id, pbs_period_code::varchar as "pbsPeriodCode"
         from ${quoteIdentifier(liveSchemaName())}.roster_period
        where rp_start::date = $1::date
          and rp_end::date = $2::date
        order by id`,
      [scenarioDateText(sc.strDtLoc), scenarioDateText(sc.endDtLoc)],
    )
    if (rosterPeriod.rows.length !== 1) {
      throw new Error('Scenario dates must match exactly one configured roster period before running optimization.')
    }
    const rosterPeriodId = Number(rosterPeriod.rows[0]!.id)
    const periodCode = rosterPeriod.rows[0]!.pbsPeriodCode?.trim()
    if (!rosterPeriodId || !periodCode) {
      throw new Error('The roster period for this scenario is incomplete (missing id or period label); cannot run optimization.')
    }

    await this.transition(fastify, id, 'RUNNING', username)
    try {
      // dynamic import: engine-server-client pulls in env (parsed at load);
      // keeps this module importable in unit tests that don't set env.
      const { engineServerClient } = await import('../engine-server-client.js')
      const version = scenarioVersionService.nextVersionFor(sc)
      const taskId = await engineServerClient.startRoTask({ scenarioId: id, rosterPeriodId, periodCode, liveServerUrl, token, airline, version })
      await fastify.db.update(scenario).set({ taskId }).where(eq(scenario.id, id))
      await invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`)
      return { taskId }
    } catch (err) {
      await this.transition(fastify, id, 'FAILED', username)
      throw err
    }
  },

  // --- Scenario Group ---

  async getGroupByWorksetId(fastify: FastifyInstance, worksetId: number) {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:group:${worksetId}`, CACHE_TTL, async () => {
      return fastify.db
        .select()
        .from(scenarioGroup)
        .where(eq(scenarioGroup.worksetId, worksetId))
        .orderBy(asc(scenarioGroup.sequence))
    })
  },

  async addToGroup(fastify: FastifyInstance, data: typeof scenarioGroup.$inferInsert, username: string) {
    const [row] = await fastify.db
      .insert(scenarioGroup)
      .values({ ...data, ...auditCreate(username) })
      .returning()
    await invalidate(fastify.redis, `${CACHE_PREFIX}:group:${data.worksetId}`)
    return row
  },

  async removeFromGroup(fastify: FastifyInstance, id: number) {
    const [row] = await fastify.db
      .delete(scenarioGroup)
      .where(eq(scenarioGroup.id, id))
      .returning()
    if (row) {
      await invalidate(fastify.redis, `${CACHE_PREFIX}:group:${row.worksetId}`)
    }
    return row
  },

  /**
   * Compare KPIs for all scenarios in a group.
   */
  async compareGroup(fastify: FastifyInstance, groupWorksetId: number) {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:compare:${groupWorksetId}`, CACHE_TTL, async () => {
      // Get all scenarios in this group
      const groupItems = await fastify.db
        .select()
        .from(scenarioGroup)
        .where(eq(scenarioGroup.worksetId, groupWorksetId))
        .orderBy(asc(scenarioGroup.sequence))

      if (groupItems.length === 0) return []

      const scenarioIds = groupItems.map((g) => g.scenarioId)

      // Get scenarios
      const scenarios = await fastify.db
        .select()
        .from(scenario)
        .where(sql`${scenario.id} = ANY(${scenarioIds})`)

      // Get all KPIs for these scenarios from scenario_result type='kpi'
      const { ensureScenarioResultTable } = await import('./scenario-result-store.js')
      await ensureScenarioResultTable(fastify)
      const kpiRows = await fastify.pgPool.query<{ scenario_id: number; json: unknown }>(
        `select scenario_id, json from scenario_result where scenario_id = ANY($1::bigint[]) and type = 'kpi'`,
        [scenarioIds],
      )
      const kpisByScenario = new Map(kpiRows.rows.map((row) => [row.scenario_id, row.json as unknown[]]))

      // Build comparison: each scenario with its KPIs
      return scenarios.map((sc) => ({
        scenario: sc,
        kpis: kpisByScenario.get(sc.id) ?? [],
      }))
    })
  },

  async getResults(fastify: FastifyInstance, scenarioId: number) {
    return getScenarioResults(fastify, scenarioId)
  },

  // --- Schedule Publish Record ---

  async listSchedulePublishRecords(fastify: FastifyInstance, query: PaginationQuery) {
    const { page, pageSize } = query
    const cacheKey = `${SCHEDULE_CACHE_PREFIX}:list:${page}:${pageSize}`

    return getOrSet(fastify.redis, cacheKey, SCHEDULE_CACHE_TTL, async () => {
      const [items, countResult] = await Promise.all([
        fastify.db
          .select()
          .from(schedulePublishRecord)
          .orderBy(asc(schedulePublishRecord.strDt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        fastify.db
          .select({ count: sql<number>`count(*)::int` })
          .from(schedulePublishRecord),
      ])

      return paginate({ page, pageSize }, items, countResult[0].count)
    })
  },

  async createSchedulePublishRecord(fastify: FastifyInstance, data: typeof schedulePublishRecord.$inferInsert, username: string) {
    const {
      published: _published,
      batchId: _batchId,
      filePath: _filePath,
      fileSize: _fileSize,
      checksum: _checksum,
      ...draftData
    } = data
    const [row] = await fastify.db
      .insert(schedulePublishRecord)
      .values({
        ...draftData,
        published: 0,
        batchId: null,
        filePath: null,
        fileSize: null,
        checksum: null,
        ...auditCreate(username),
      })
      .returning()
    await invalidatePattern(fastify.redis, `${SCHEDULE_CACHE_PREFIX}:list:*`)
    return row
  },
}
