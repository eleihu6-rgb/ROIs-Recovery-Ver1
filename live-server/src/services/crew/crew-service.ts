import { eq, and, or, isNull, lte, gt, like, sql, desc, asc, ilike, SQL, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { crew } from '../../models/crew/crew.js'
import { crewRank } from '../../models/crew/crew-rank.js'
import { crewBase } from '../../models/crew/crew-base.js'
import { crewFleet } from '../../models/crew/crew-fleet.js'
import { crewStatus } from '../../models/crew/crew-status.js'
import { crewTeam } from '../../models/crew/crew-team.js'
import { crewQualification } from '../../models/crew/crew-qualification.js'
import { crewCertificate } from '../../models/crew/crew-certificate.js'
import { crewKpiAdjust } from '../../models/crew/crew-memo.js'
import { getOrSet, invalidate, invalidatePattern } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'
import type { PaginationQuery, PaginatedResult } from '../../utils/pagination.js'
import { paginate } from '../../utils/pagination.js'

const CACHE_PREFIX = 'crew'
const CACHE_TTL = 14400 // 4h

// ---------- filters ----------
export interface CrewListFilters {
  division?: string
  rank?: string
  base?: string
  fleet?: string
  status?: string
  search?: string
  empCode?: string
  name?: string
  sortBy?: 'crew_id' | 'name' | 'rank' | 'base' | 'fleet'
  sortOrder?: 'asc' | 'desc'
  /** Global filter: multiple divisions (OR). Applied via crew.division IN (...). */
  divisions?: string[]
  /** Global filter: multiple bases (OR). Checks crew_base validity within date range. */
  bases?: string[]
  /** Global filter: multiple ranks (OR). Checks crew_rank validity within date range. */
  ranks?: string[]
  /** Global filter: multiple fleets (OR). Checks crew_fleet validity within date range. */
  fleets?: string[]
  /** Start of date range for validity checks (YYYY-MM-DD). Defaults to today. */
  dateRangeStart?: string
  /** End of date range for validity checks (YYYY-MM-DD). Defaults to today. */
  dateRangeEnd?: string
  /** Hydrate a specific set of crew by ID (exact match). Used by Find Crew. */
  crewIds?: string[]
}

/**
 * Escape SQL LIKE wildcard characters to prevent pattern manipulation
 */
function escapeLikePattern(str: string): string {
  return str.replace(/[%_]/g, '\\$&')
}

// ---------- helpers ----------
const currentEffCondition = (table: { effDt: { getSQL: () => SQL }; expDt: { getSQL: () => SQL } }) =>
  and(
    lte(table.effDt as any, sql`now()`),
    or(isNull(table.expDt as any), gt(table.expDt as any, sql`now()`)),
  )

// ---------- service ----------
export const crewService = {
  /** Paginated crew list with filters */
  async list(
    fastify: FastifyInstance,
    filters: CrewListFilters,
    pagination: PaginationQuery,
    // P1-3: slim 模式（view=gantt-panel）只取当前生效的 rank/base/fleet，跳过 3 个全量历史查询，
    // 大幅降低 crew 首屏耗时；完整历史由前端首屏后台再拉。
    opts: { slim?: boolean } = {},
  ): Promise<PaginatedResult<typeof crew.$inferSelect>> {
    const conditions: SQL[] = []

    if (filters.division) {
      conditions.push(eq(crew.division, filters.division))
    }
    if (filters.search) {
      const pattern = `%${escapeLikePattern(filters.search)}%`
      conditions.push(
        or(
          ilike(crew.crewId, pattern),
          ilike(crew.firstName, pattern),
          ilike(crew.lastName, pattern),
        )!,
      )
    }
    if (filters.empCode) {
      conditions.push(ilike(crew.crewId, `%${escapeLikePattern(filters.empCode)}%`))
    }
    if (filters.crewIds && filters.crewIds.length > 0) {
      conditions.push(inArray(crew.crewId, filters.crewIds))
    }
    if (filters.name) {
      const namePattern = `%${escapeLikePattern(filters.name)}%`
      const nameCondition = or(
        ilike(crew.firstName, namePattern),
        ilike(crew.lastName, namePattern),
        ilike(crew.preferredName, namePattern),
      )
      if (nameCondition) conditions.push(nameCondition)
    }

    // Sub-query filters for current effective history records (single-value, legacy)
    if (filters.rank) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM crew_rank cr WHERE cr.crew_id = ${crew.crewId} AND cr.rank = ${filters.rank} AND cr.eff_dt <= now() AND (cr.exp_dt IS NULL OR cr.exp_dt > now()))`,
      )
    }
    if (filters.base) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM crew_base cb WHERE cb.crew_id = ${crew.crewId} AND cb.base = ${filters.base} AND cb.eff_dt <= now() AND (cb.exp_dt IS NULL OR cb.exp_dt > now()))`,
      )
    }
    if (filters.fleet) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM crew_fleet cf WHERE cf.crew_id = ${crew.crewId} AND cf.fleet_specific = ${filters.fleet} AND cf.eff_dt <= now() AND (cf.exp_dt IS NULL OR cf.exp_dt > now()))`,
      )
    }
    if (filters.status) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM crew_status cs WHERE cs.crew_id = ${crew.crewId} AND cs.status = ${filters.status} AND cs.eff_dt <= now() AND (cs.exp_dt IS NULL OR cs.exp_dt > now()))`,
      )
    }

    // Global filter: multi-value array conditions with date-range validity (OR within, AND between)
    const rangeStart = filters.dateRangeStart ?? new Date().toISOString().slice(0, 10)
    const rangeEnd   = filters.dateRangeEnd   ?? new Date().toISOString().slice(0, 10)

    if (filters.divisions && filters.divisions.length > 0) {
      conditions.push(inArray(crew.division, filters.divisions))
    }
    if (filters.bases && filters.bases.length > 0) {
      const baseIn = sql.join(filters.bases.map((b) => sql`${b}`), sql`, `)
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM crew_base cb
          WHERE cb.crew_id = ${crew.crewId}
            AND cb.base IN (${baseIn})
            AND cb.eff_dt <= ${rangeEnd}::timestamp
            AND (cb.exp_dt IS NULL OR cb.exp_dt >= ${rangeStart}::timestamp)
        )`,
      )
    }
    if (filters.ranks && filters.ranks.length > 0) {
      const rankIn = sql.join(filters.ranks.map((r) => sql`${r}`), sql`, `)
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM crew_rank cr
          WHERE cr.crew_id = ${crew.crewId}
            AND cr.rank IN (${rankIn})
            AND cr.eff_dt <= ${rangeEnd}::timestamp
            AND (cr.exp_dt IS NULL OR cr.exp_dt >= ${rangeStart}::timestamp)
        )`,
      )
    }
    if (filters.fleets && filters.fleets.length > 0) {
      const fleetIn = sql.join(filters.fleets.map((f) => sql`${f}`), sql`, `)
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM crew_fleet cf
          WHERE cf.crew_id = ${crew.crewId}
            AND cf.fleet_specific IN (${fleetIn})
            AND cf.eff_dt <= ${rangeEnd}::timestamp
            AND (cf.exp_dt IS NULL OR cf.exp_dt >= ${rangeStart}::timestamp)
        )`,
      )
    }

    // 全局有效性门槛：机组必须在窗口内同时有 crew_rank 与 crew_base 记录（rank/base 双有效），
    // 过期组员（含 Division-only、显式 crewId 路径）不进入 Gantt。
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM crew_rank cr
        WHERE cr.crew_id = ${crew.crewId}
          AND cr.eff_dt <= ${rangeEnd}::timestamp
          AND (cr.exp_dt IS NULL OR cr.exp_dt >= ${rangeStart}::timestamp)
      )`,
    )
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM crew_base cb
        WHERE cb.crew_id = ${crew.crewId}
          AND cb.eff_dt <= ${rangeEnd}::timestamp
          AND (cb.exp_dt IS NULL OR cb.exp_dt >= ${rangeStart}::timestamp)
      )`,
    )

    const where = conditions.length > 0 ? and(...conditions) : undefined

    // Sorting
    let orderBy
    const dir = filters.sortOrder === 'desc' ? desc : asc
    switch (filters.sortBy) {
      case 'name':
        orderBy = dir(crew.lastName)
        break
      case 'rank': {
        // Match the roster pane's display sort (compareRosterDefault): the crew's
        // current-effective rank's display_order (unknown ranks last) → rank code →
        // crew_id. This makes the windowed first page == the pane's displayed top rows,
        // so windowed first-paint never reorders when the full set loads. `rank` resolves
        // via search_path (airline schema), like the rest of the app.
        const d = filters.sortOrder === 'desc' ? sql`desc` : sql`asc`
        const curRank = sql`(SELECT cr.rank FROM crew_rank cr WHERE cr.crew_id = ${crew.crewId} AND cr.eff_dt <= now() AND (cr.exp_dt IS NULL OR cr.exp_dt > now()) ORDER BY cr.eff_dt DESC LIMIT 1)`
        // crew_id tiebreak must match the pane's compareCrewId: numeric ids compared
        // numerically (169 < 1001), non-numeric by string.
        const crewIdNum = sql`(CASE WHEN ${crew.crewId} ~ '^[0-9]+$' THEN ${crew.crewId}::numeric ELSE NULL END)`
        orderBy = sql`(SELECT r.display_order FROM "rank" r WHERE r.rank = ${curRank}) ${d} NULLS LAST, ${curRank} ${d} NULLS LAST, ${crewIdNum} ${d} NULLS LAST, ${crew.crewId} ${d}`
        break
      }
      case 'crew_id':
      default:
        orderBy = dir(crew.crewId)
        break
    }

    const countResult = await fastify.db.select({ count: sql<number>`count(*)::int` }).from(crew).where(where)
    const total = countResult[0]?.count ?? 0

    const baseQuery = fastify.db.select().from(crew).where(where).orderBy(orderBy)
    const items = await (
      pagination.pageSize > 0
        ? baseQuery.limit(pagination.pageSize).offset((pagination.page - 1) * pagination.pageSize)
        : baseQuery
    )

    // Batch fetch current rank/base/fleet for all returned crews.
    // P1-3: slim 模式跳过 3 个全量历史查询（allRank/allBase/allFleet），只保留当前生效值。
    const crewIds = items.map((c) => c.crewId)
    const needHistory = !opts.slim

    // 当前生效查询（rank/fleet 原有，base 新增，供 slim 模式作首屏当前值）
    const currentRankQuery = fastify.db
      .select({ crewId: crewRank.crewId, rank: crewRank.rank, division: crewRank.division })
      .from(crewRank)
      .where(and(inArray(crewRank.crewId, crewIds), currentEffCondition(crewRank)))
    const currentFleetQuery = fastify.db
      .select({ crewId: crewFleet.crewId, fleetSpecific: crewFleet.fleetSpecific })
      .from(crewFleet)
      .where(and(inArray(crewFleet.crewId, crewIds), currentEffCondition(crewFleet)))
    const currentBaseQuery = fastify.db
      .select({ crewId: crewBase.crewId, base: crewBase.base })
      .from(crewBase)
      .where(and(inArray(crewBase.crewId, crewIds), currentEffCondition(crewBase)))

    const fullRankHistoryQuery = fastify.db
      .select({ id: crewRank.id, crewId: crewRank.crewId, rank: crewRank.rank, effDt: crewRank.effDt, expDt: crewRank.expDt })
      .from(crewRank).where(inArray(crewRank.crewId, crewIds)).orderBy(crewRank.crewId, crewRank.effDt)
    const fullBaseHistoryQuery = fastify.db
      .select({ id: crewBase.id, crewId: crewBase.crewId, base: crewBase.base, effDt: crewBase.effDt, expDt: crewBase.expDt })
      .from(crewBase).where(inArray(crewBase.crewId, crewIds)).orderBy(crewBase.crewId, crewBase.effDt)
    const fullFleetHistoryQuery = fastify.db
      .select({ id: crewFleet.id, crewId: crewFleet.crewId, fleetSpecific: crewFleet.fleetSpecific, effDt: crewFleet.effDt, expDt: crewFleet.expDt })
      .from(crewFleet).where(inArray(crewFleet.crewId, crewIds)).orderBy(crewFleet.crewId, crewFleet.effDt)
    const fullQualHistoryQuery = fastify.db
      .select().from(crewQualification).where(inArray(crewQualification.crewId, crewIds)).orderBy(crewQualification.crewId, crewQualification.effDt)
    const fullCertHistoryQuery = fastify.db
      .select().from(crewCertificate).where(inArray(crewCertificate.crewId, crewIds)).orderBy(crewCertificate.crewId, crewCertificate.effDt)
    const fullTeamHistoryQuery = fastify.db
      .select().from(crewTeam).where(inArray(crewTeam.crewId, crewIds)).orderBy(crewTeam.crewId, crewTeam.effDt)

    type RankRow = Awaited<typeof currentRankQuery>[number]
    type FleetCurRow = Awaited<typeof currentFleetQuery>[number]
    type BaseCurRow = Awaited<typeof currentBaseQuery>[number]
    type RankHist = Awaited<typeof fullRankHistoryQuery>[number]
    type BaseHist = Awaited<typeof fullBaseHistoryQuery>[number]
    type FleetHist = Awaited<typeof fullFleetHistoryQuery>[number]
    type QualHist = Awaited<typeof fullQualHistoryQuery>[number]
    type CertHist = Awaited<typeof fullCertHistoryQuery>[number]
    type TeamHist = Awaited<typeof fullTeamHistoryQuery>[number]

    let rankRows: RankRow[] = [], fleetRows: FleetCurRow[] = [], baseRows: BaseCurRow[] = []
    let allRankRows: RankHist[] = [], allBaseRows: BaseHist[] = [], allFleetRows: FleetHist[] = []
    let allQualRows: QualHist[] = [], allCertRows: CertHist[] = [], allTeamRows: TeamHist[] = []
    if (crewIds.length > 0) {
      if (needHistory) {
        ;[rankRows, fleetRows, baseRows, allRankRows, allBaseRows, allFleetRows, allQualRows, allCertRows, allTeamRows] = await Promise.all([
          currentRankQuery, currentFleetQuery, currentBaseQuery,
          fullRankHistoryQuery, fullBaseHistoryQuery, fullFleetHistoryQuery,
          fullQualHistoryQuery, fullCertHistoryQuery, fullTeamHistoryQuery,
        ])
      } else {
        ;[rankRows, fleetRows, baseRows] = await Promise.all([
          currentRankQuery, currentFleetQuery, currentBaseQuery,
        ])
      }
    }

    // Group by crewId
    const rankByCrew = new Map<string, { rank: string; division: string | null }>()
    for (const row of rankRows) {
      // Take first (most recent due to orderBy in batch-quals logic)
      if (!rankByCrew.has(row.crewId)) rankByCrew.set(row.crewId, row)
    }

    const fleetByCrew = new Map<string, string[]>()
    for (const row of fleetRows) {
      const arr = fleetByCrew.get(row.crewId) ?? []
      if (row.fleetSpecific) arr.push(row.fleetSpecific)
      fleetByCrew.set(row.crewId, arr)
    }

    // current-effective base per crew (for slim first-paint display)
    const baseByCrew = new Map<string, string>()
    for (const row of baseRows) {
      if (!baseByCrew.has(row.crewId)) baseByCrew.set(row.crewId, row.base)
    }

    // Group history arrays by crewId
    const ranksByCrew = new Map<string, typeof allRankRows>()
    for (const r of allRankRows) {
      const arr = ranksByCrew.get(r.crewId) ?? []
      arr.push(r)
      ranksByCrew.set(r.crewId, arr)
    }

    const basesByCrew = new Map<string, typeof allBaseRows>()
    for (const r of allBaseRows) {
      const arr = basesByCrew.get(r.crewId) ?? []
      arr.push(r)
      basesByCrew.set(r.crewId, arr)
    }

    const fleetsByCrew = new Map<string, typeof allFleetRows>()
    for (const r of allFleetRows) {
      const arr = fleetsByCrew.get(r.crewId) ?? []
      arr.push(r)
      fleetsByCrew.set(r.crewId, arr)
    }

    const qualsByCrew = new Map<string, typeof allQualRows>()
    for (const r of allQualRows) {
      const arr = qualsByCrew.get(r.crewId) ?? []
      arr.push(r)
      qualsByCrew.set(r.crewId, arr)
    }

    const certsByCrew = new Map<string, typeof allCertRows>()
    for (const r of allCertRows) {
      const arr = certsByCrew.get(r.crewId) ?? []
      arr.push(r)
      certsByCrew.set(r.crewId, arr)
    }

    const teamsByCrew = new Map<string, typeof allTeamRows>()
    for (const r of allTeamRows) {
      const arr = teamsByCrew.get(r.crewId) ?? []
      arr.push(r)
      teamsByCrew.set(r.crewId, arr)
    }

    // Attach quals + current-effective values; full history arrays only in full mode.
    const enrichedItems = items.map((c) => {
      const rankInfo = rankByCrew.get(c.crewId)
      const obj = {
        ...c,
        quals: {
          division: rankInfo?.division ?? c.division,
          rank: rankInfo?.rank ?? '',
          fleetQuals: fleetByCrew.get(c.crewId) ?? [],
          airportQuals: [] as string[],
        },
        // P1-3: 当前生效值（slim 首屏即可显示；full 模式也附带，无害）
        panelRank: rankInfo?.rank ?? null,
        panelBase: baseByCrew.get(c.crewId) ?? null,
        panelFleets: fleetByCrew.get(c.crewId) ?? [],
      }
      if (!needHistory) return obj
      return {
        ...obj,
        ranks:  ranksByCrew.get(c.crewId)  ?? [],
        bases:  basesByCrew.get(c.crewId)  ?? [],
        fleets: fleetsByCrew.get(c.crewId) ?? [],
        qualifications: qualsByCrew.get(c.crewId) ?? [],
        certifications: certsByCrew.get(c.crewId) ?? [],
        teams: teamsByCrew.get(c.crewId) ?? [],
      }
    })

    return paginate(pagination, enrichedItems, total)
  },

  /** Get single crew by pk */
  async getById(fastify: FastifyInstance, id: number) {
    const cacheKey = `${CACHE_PREFIX}:${id}`
    return getOrSet(fastify.redis, cacheKey, CACHE_TTL, async () => {
      const rows = await fastify.db.select().from(crew).where(eq(crew.id, id)).limit(1)
      return rows[0] ?? null
    })
  },

  /** Crew detail: main + current effective rank/base/fleet/status/team */
  async getDetail(fastify: FastifyInstance, id: number) {
    const cacheKey = `${CACHE_PREFIX}:detail:${id}`
    return getOrSet(fastify.redis, cacheKey, CACHE_TTL, async () => {
      const rows = await fastify.db.select().from(crew).where(eq(crew.id, id)).limit(1)
      const crewRow = rows[0]
      if (!crewRow) return null

      const cid = crewRow.crewId

      const [currentRank, currentBase, currentFleet, currentStatus, currentTeam] =
        await Promise.all([
          fastify.db
            .select()
            .from(crewRank)
            .where(and(eq(crewRank.crewId, cid), currentEffCondition(crewRank)))
            .orderBy(desc(crewRank.effDt))
            .limit(1),
          fastify.db
            .select()
            .from(crewBase)
            .where(and(eq(crewBase.crewId, cid), currentEffCondition(crewBase)))
            .orderBy(desc(crewBase.effDt))
            .limit(1),
          fastify.db
            .select()
            .from(crewFleet)
            .where(and(eq(crewFleet.crewId, cid), currentEffCondition(crewFleet)))
            .orderBy(desc(crewFleet.effDt))
            .limit(1),
          fastify.db
            .select()
            .from(crewStatus)
            .where(and(eq(crewStatus.crewId, cid), currentEffCondition(crewStatus)))
            .orderBy(desc(crewStatus.effDt))
            .limit(1),
          fastify.db
            .select()
            .from(crewTeam)
            .where(and(eq(crewTeam.crewId, cid), currentEffCondition(crewTeam)))
            .orderBy(desc(crewTeam.effDt))
            .limit(1),
        ])

      return {
        ...crewRow,
        currentRank: currentRank[0] ?? null,
        currentBase: currentBase[0] ?? null,
        currentFleet: currentFleet[0] ?? null,
        currentStatus: currentStatus[0] ?? null,
        currentTeam: currentTeam[0] ?? null,
      }
    })
  },

  /** Create crew */
  async create(fastify: FastifyInstance, data: typeof crew.$inferInsert, username: string) {
    const rows = await fastify.db
      .insert(crew)
      .values({ ...data, ...auditCreate(username) })
      .returning()
    const created = rows[0]
    await invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`)
    return created
  },

  /** Update crew */
  async update(
    fastify: FastifyInstance,
    id: number,
    data: Partial<typeof crew.$inferInsert>,
    username: string,
  ) {
    const rows = await fastify.db
      .update(crew)
      .set({ ...data, ...auditUpdate(username) })
      .where(eq(crew.id, id))
      .returning()
    const updated = rows[0]
    if (updated) {
      await invalidate(
        fastify.redis,
        `${CACHE_PREFIX}:${id}`,
        `${CACHE_PREFIX}:detail:${id}`,
      )
      await invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`)
    }
    return updated ?? null
  },

  /** Soft delete crew (set status = -1) */
  async remove(fastify: FastifyInstance, id: number, username: string) {
    const rows = await fastify.db
      .update(crew)
      .set({ status: -1, ...auditUpdate(username) })
      .where(eq(crew.id, id))
      .returning()
    const removed = rows[0]
    if (removed) {
      await invalidate(
        fastify.redis,
        `${CACHE_PREFIX}:${id}`,
        `${CACHE_PREFIX}:detail:${id}`,
      )
      await invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`)
    }
    return removed ?? null
  },

  // ===================== KPI Adjust =====================

  async listKpiAdjust(fastify: FastifyInstance, crewId: string) {
    return fastify.db
      .select()
      .from(crewKpiAdjust)
      .where(eq(crewKpiAdjust.crewId, crewId))
      .orderBy(desc(crewKpiAdjust.adjustDate))
  },

  async createKpiAdjust(
    fastify: FastifyInstance,
    data: typeof crewKpiAdjust.$inferInsert,
    username: string,
  ) {
    const rows = await fastify.db
      .insert(crewKpiAdjust)
      .values({ ...data, ...auditCreate(username) })
      .returning()
    return rows[0]
  },

  async updateKpiAdjust(
    fastify: FastifyInstance,
    id: number,
    data: Partial<typeof crewKpiAdjust.$inferInsert>,
    username: string,
  ) {
    const rows = await fastify.db
      .update(crewKpiAdjust)
      .set({ ...data, ...auditUpdate(username) })
      .where(eq(crewKpiAdjust.id, id))
      .returning()
    return rows[0] ?? null
  },

  async removeKpiAdjust(fastify: FastifyInstance, id: number) {
    const rows = await fastify.db
      .delete(crewKpiAdjust)
      .where(eq(crewKpiAdjust.id, id))
      .returning()
    return rows[0] ?? null
  },
}
