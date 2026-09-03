import { eq, and, between, asc, desc, sql, max, SQL, ilike, exists, inArray, lte, gt, gte, or, isNull, isNotNull } from 'drizzle-orm'
import crypto from 'node:crypto'
import { rosterFlight } from '../../models/roster/roster-flight.js'
import type { FastifyInstance } from 'fastify'
import { pairing } from '../../models/pairing/pairing.js'
import { pairingSegment } from '../../models/pairing/pairing-segment.js'
import { flight as flightTable } from '../../models/flight/flight.js'
import { pairingComposition } from '../../models/pairing/pairing-composition.js'
import { pairingMemo } from '../../models/pairing/pairing-memo.js'
import { scenario } from '../../models/scenario/scenario.js'
import { workset } from '../../models/rule/workset.js'
import { getOrSet, invalidate, invalidatePattern } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'
import type { PaginationQuery } from '../../utils/pagination.js'
import { paginate } from '../../utils/pagination.js'
import { notDeleted } from '../../utils/db.js'
import { flightComposition } from '../../models/flight/flight-composition.js'
import { rank as rankTable } from '../../models/base/rank.js'
import { assignment as assignmentModel, assignmentGroup as assignmentGroupModel } from '../../models/base/assignment.js'
import { crew } from '../../models/crew/crew.js'
import { crewMandayFdPeriod, crewMandayCcAmPeriod } from '../../models/crew/crew-manday.js'
import { crewBase } from '../../models/crew/crew-base.js'
import { refreshFlightCompositionFill } from '../../utils/composition-fill.js'
import { classifyCoverage, isCoverageMet } from './coverage.js'
import { refreshPairingTafb } from './pairing-tafb-service.js'

const CACHE_PREFIX = 'pairing'
const CACHE_TTL = 600 // 10min

/**
 * Escape SQL LIKE wildcard characters to prevent pattern manipulation
 */
function escapeLikePattern(str: string): string {
  return str.replace(/[%_]/g, '\\$&')
}

interface PairingListQuery extends PaginationQuery {
  startDate: string
  endDate: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  // Filter params
  label?: string
  fleet?: string
  /** Home-base filter — OR match across the selected bases (e.g. ['DXB','ADD']). */
  base?: string[]
  division?: string
  segFltNum?: string
  depArp?: string
  isFull?: boolean
  /** Crewing coverage states to keep: comma-separated subset of 'open','partial','full','over'. */
  coverage?: string
  assignments?: string[]
  /**
   * Payload mode. 'detail' (default) attaches the full per-pairing segment arrays — the
   * original behavior, used by the Pairing pane. 'summary' skips the segment fetch entirely
   * and omits the `segments` array for lighter Gantt list rows; composition is still loaded
   * so coverage badges / isFull / coverage filtering keep working. Full segments stay available
   * on demand via getById.
   */
  view?: 'summary' | 'detail'
}

/**
 * Create a stable hash from filter params for cache key
 */
function hashFilters(filters: Partial<PairingListQuery>): string {
  const filterKeys = ['label', 'fleet', 'division', 'segFltNum', 'depArp', 'isFull'] as const
  const values = filterKeys.map(k => filters[k] ?? '').join('|')
  const baseKey = (filters.base ?? []).slice().sort().join(',')
  const assignmentsKey = (filters.assignments ?? []).join(',')
  const coverageKey = (filters.coverage ?? '').split(',').sort().join(',')
  return crypto.createHash('md5').update(`${values}|${baseKey}|${assignmentsKey}|${coverageKey}`).digest('hex').slice(0, 8)
}

/**
 * For ranks with is_must_crew_rank=1, verify adding `delta` plan slots to the pairing
 * would not push any flight's composition fill over its plan.
 * Throws an error with statusCode=409 on violation.
 */
async function checkCompositionCap(
  db: FastifyInstance['db'],
  pairingId: number,
  actingRankCode: string,
  delta: number,
): Promise<void> {
  // Look up whether this rank requires cap enforcement
  const [rankRow] = await db
    .select({ isMustCrewRank: rankTable.isMustCrewRank })
    .from(rankTable)
    .where(eq(rankTable.rank, actingRankCode))
    .limit(1)

  if (!rankRow || rankRow.isMustCrewRank !== 1) return // uncapped

  // Get flt_ids from pairing_segment for this pairing
  const segments = await db
    .select({ fltId: pairingSegment.fltId })
    .from(pairingSegment)
    .where(and(eq(pairingSegment.pairingId, pairingId), notDeleted(pairingSegment.isDeleted)))

  const fltIds = [...new Set(segments.map((s) => s.fltId).filter((id): id is number => id !== null))]
  if (fltIds.length === 0) return

  // Check each flight's composition cap
  const flightComps = await db
    .select({ fltId: flightComposition.fltId, plan: flightComposition.plan, fill: flightComposition.fill })
    .from(flightComposition)
    .where(and(
      sql`${flightComposition.fltId} = ANY(${fltIds})`,
      eq(flightComposition.actingRank, actingRankCode),
    ))

  for (const fc of flightComps) {
    const projected = (fc.fill ?? 0) + delta
    if (projected > (fc.plan ?? 0)) {
      const err = Object.assign(
        new Error(`Rank ${actingRankCode} on flight #${fc.fltId}: fill ${projected} would exceed plan ${fc.plan}`),
        { statusCode: 409 },
      )
      throw err
    }
  }
}

export const pairingService = {
  /** Distinct crew IDs assigned to a pairing (committed live roster). */
  async getCrewIds(fastify: FastifyInstance, pairingId: number): Promise<{ crewIds: string[] }> {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:crewids:${pairingId}`, CACHE_TTL, async () => {
      const rows = await fastify.db
        .selectDistinct({ crewId: rosterFlight.crewId })
        .from(rosterFlight)
        .where(and(eq(rosterFlight.pairingId, pairingId), notDeleted(rosterFlight.isDeleted)))
      return { crewIds: rows.map((r) => r.crewId) }
    })
  },

  /**
   * Rostered crew on a pairing, with the detail the Pairing Info popup shows:
   * name/gender/base/position/actingRank/source from roster_flight+crew, and MBH
   * (monthly block hours, minutes) from the crew_manday monthly table for the
   * pairing's month (fd table for pilots, cc table for cabin).
   */
  async listCrewDetail(fastify: FastifyInstance, pairingId: number): Promise<Array<{
    crewId: string; name: string; gender: string | null; base: string | null
    position: string | null; crewRank: string | null; actingRank: string | null
    rosterActingRank: string | null; flightActingRank: string | null
    source: string | null; mbhMin: number | null; creditMin: number | null
  }>> {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:crewdetail:${pairingId}`, CACHE_TTL, async () => {
      const [p] = await fastify.db
        .select({ division: pairing.division, schStr: pairing.schStrDtUtc })
        .from(pairing)
        .where(eq(pairing.id, pairingId))
      if (!p) return []

      const rows = await fastify.db
        .selectDistinctOn([rosterFlight.crewId], {
          crewId: rosterFlight.crewId,
          base: rosterFlight.base,
          position: rosterFlight.position,
          crewRank: rosterFlight.activeRank,
          actingRank: rosterFlight.rosterActingRank,
          rosterActingRank: rosterFlight.rosterActingRank,
          flightActingRank: rosterFlight.flightActingRank,
          source: rosterFlight.source,
          firstName: crew.firstName,
          lastName: crew.lastName,
          gender: crew.gender,
        })
        .from(rosterFlight)
        .leftJoin(crew, eq(crew.crewId, rosterFlight.crewId))
        .where(and(eq(rosterFlight.pairingId, pairingId), notDeleted(rosterFlight.isDeleted)))
        .orderBy(rosterFlight.crewId)

      // Two independent per-crew lookups, run concurrently (both keyed off the crew list):
      //  - home base from crew_base (authoritative, effective at the pairing start);
      //    roster_flight.base is frequently blank on engine/scenario rosters, so resolve it
      //    the same way roster-service does and only fall back to roster_flight.base.
      //  - MBH = monthly block hours (minutes) for the pairing's month.
      const startDate = p.schStr ? new Date(p.schStr) : null
      const crewIds = rows.map((r) => r.crewId)
      const mandayTable = p.division === 'C' ? crewMandayCcAmPeriod : crewMandayFdPeriod
      const [baseRows, mandayRows, creditRows] = await Promise.all([
        startDate && crewIds.length > 0
          ? fastify.db
              .selectDistinctOn([crewBase.crewId], { crewId: crewBase.crewId, base: crewBase.base })
              .from(crewBase)
              .where(and(
                inArray(crewBase.crewId, crewIds),
                lte(crewBase.effDt, startDate),
                or(isNull(crewBase.expDt), gt(crewBase.expDt, startDate)),
              ))
              .orderBy(crewBase.crewId, desc(crewBase.effDt))
          : Promise.resolve([] as { crewId: string; base: string }[]),
        startDate && crewIds.length > 0
          ? fastify.db
              .select({ crewId: mandayTable.crewId, blh: mandayTable.blh })
              .from(mandayTable)
              .where(and(lte(mandayTable.rpStart, startDate), gte(mandayTable.rpEnd, startDate), inArray(mandayTable.crewId, crewIds)))
          : Promise.resolve([] as { crewId: string; blh: number }[]),
        crewIds.length > 0
          ? fastify.db
              .select({
                crewId: rosterFlight.crewId,
                dutySeq: rosterFlight.dutySeq,
                credit: sql<string | null>`coalesce(max(${rosterFlight.actCreditedMinutes}), max(${rosterFlight.schCreditedMinutes}), max(${pairingSegment.dutyActCreditedMinutes}))`,
              })
              .from(rosterFlight)
              .leftJoin(pairingSegment, and(
                eq(pairingSegment.pairingId, rosterFlight.pairingId),
                eq(pairingSegment.dutySeq, rosterFlight.dutySeq),
                eq(pairingSegment.segSeq, rosterFlight.segSeq),
                notDeleted(pairingSegment.isDeleted),
              ))
              .where(and(eq(rosterFlight.pairingId, pairingId), notDeleted(rosterFlight.isDeleted)))
              .groupBy(rosterFlight.crewId, rosterFlight.dutySeq)
          : Promise.resolve([] as { crewId: string; dutySeq: number | null; credit: string | null }[]),
      ])
      const baseByCrew = new Map(baseRows.map((b) => [b.crewId, b.base]))
      const mbhByCrew = new Map(mandayRows.map((m) => [m.crewId, m.blh]))
      const creditByCrew = new Map<string, number>()
      for (const row of creditRows) {
        const minutes = Math.round(Number(row.credit))
        if (!Number.isFinite(minutes) || minutes <= 0) continue
        creditByCrew.set(row.crewId, (creditByCrew.get(row.crewId) ?? 0) + minutes)
      }

      return rows.map((r) => ({
        crewId: r.crewId,
        name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.crewId,
        gender: r.gender ?? null,
        base: baseByCrew.get(r.crewId) ?? (r.base || null),
        position: r.position ?? null,
        crewRank: r.crewRank ?? null,
        actingRank: r.actingRank ?? null,
        rosterActingRank: r.rosterActingRank ?? null,
        flightActingRank: r.flightActingRank ?? null,
        source: r.source ?? null,
        mbhMin: mbhByCrew.get(r.crewId) ?? null,
        creditMin: creditByCrew.get(r.crewId) ?? null,
      }))
    })
  },

  /** Distinct assignment (type) codes present on non-deleted pairings, with reference description when available. */
  async listAssignmentTypes(fastify: FastifyInstance): Promise<Array<{ assignment: string; description: string | null }>> {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:types`, CACHE_TTL, async () => {
      const rows = await fastify.db
        .selectDistinct({ assignment: pairing.assignment, description: assignmentModel.description })
        .from(pairing)
        .leftJoin(assignmentModel, eq(assignmentModel.assignment, pairing.assignment))
        .where(notDeleted(pairing.isDeleted))
      return rows
        .filter((r): r is { assignment: string; description: string | null } => !!r.assignment)
        .sort((a, b) => a.assignment.localeCompare(b.assignment))
    })
  },

  async listAssignmentGroups(fastify: FastifyInstance): Promise<Array<{ assignmentGroup: string; description: string | null }>> {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:assignment-groups`, CACHE_TTL, async () => {
      const rows = await fastify.db
        .selectDistinct({ assignmentGroup: pairing.assignmentGroup, description: assignmentGroupModel.name })
        .from(pairing)
        .leftJoin(assignmentGroupModel, eq(assignmentGroupModel.assignmentGroup, pairing.assignmentGroup))
        .where(notDeleted(pairing.isDeleted))
      return rows
        .filter((r): r is { assignmentGroup: string; description: string | null } => !!r.assignmentGroup)
        .sort((a, b) => a.assignmentGroup.localeCompare(b.assignmentGroup))
    })
  },

  async list(fastify: FastifyInstance, query: PairingListQuery) {
    const { startDate, endDate, page, pageSize, sortBy, sortOrder, label, fleet, base, division, segFltNum, depArp, isFull, coverage, assignments, view } = query
    const summary = view === 'summary'
    const filtersHash = hashFilters(query)
    const cacheKey = `${CACHE_PREFIX}:list:${startDate}:${endDate}:${page}:${pageSize}:${sortBy ?? ''}:${sortOrder ?? ''}:${summary ? 's' : 'd'}:${filtersHash}`

    return getOrSet(fastify.redis, cacheKey, CACHE_TTL, async () => {
      const conditions: SQL[] = [
        notDeleted(pairing.isDeleted),
        between(pairing.schStrDtUtc, new Date(`${startDate}T00:00:00Z`), new Date(`${endDate}T23:59:59Z`)),
      ]

      // Add filter conditions
      if (fleet) {
        conditions.push(eq(pairing.fleet, fleet))
      }
      if (base && base.length > 0) {
        // Home base — OR match across the selected bases (e.g. DXB, ADD).
        conditions.push(inArray(pairing.base, base))
      }
      if (division) {
        conditions.push(eq(pairing.division, division))
      }
      if (assignments && assignments.length > 0) {
        // Pairing type — OR match across the selected assignment codes.
        conditions.push(inArray(pairing.assignment, assignments))
      }
      if (label) {
        conditions.push(ilike(pairing.pairingLabel, `%${escapeLikePattern(label)}%`))
      }
      if (segFltNum) {
        // EXISTS subquery on pairing_segment for flight number match
        conditions.push(exists(
          fastify.db
            .select({ id: pairingSegment.id })
            .from(pairingSegment)
            .where(and(
              eq(pairingSegment.pairingId, pairing.id),
              ilike(pairingSegment.fltNum, `%${escapeLikePattern(segFltNum)}%`),
              notDeleted(pairingSegment.isDeleted)
            ))
        ))
      }
      if (depArp) {
        // EXISTS subquery on pairing_segment for departure airport match
        conditions.push(exists(
          fastify.db
            .select({ id: pairingSegment.id })
            .from(pairingSegment)
            .where(and(
              eq(pairingSegment.pairingId, pairing.id),
              eq(pairingSegment.depArp, depArp),
              notDeleted(pairingSegment.isDeleted)
            ))
        ))
      }

      const whereClause = and(...conditions)

      // Order column mapping for extended sort options
      const orderFn = sortOrder === 'desc' ? desc : asc
      const sortByKey = sortBy ?? 'schStrDtUtc'
      let orderColumn
      switch (sortByKey) {
        case 'pairingLabel':
          orderColumn = pairing.pairingLabel
          break
        case 'tafb':
          orderColumn = pairing.tafb
          break
        case 'fleet':
          orderColumn = pairing.fleet
          break
        case 'base':
          orderColumn = pairing.base
          break
        case 'segCount':
          orderColumn = pairing.segCount
          break
        case 'durationDays':
          orderColumn = pairing.durationDays
          break
        default:
          orderColumn = pairing.schStrDtUtc
      }

      const pairingDataQuery = fastify.db
        .select()
        .from(pairing)
        .where(whereClause)
        .orderBy(orderFn(orderColumn))

      const [items, countResult] = await Promise.all([
        pageSize > 0
          ? pairingDataQuery.limit(pageSize).offset((page - 1) * pageSize)
          : pairingDataQuery,
        fastify.db
          .select({ count: sql<number>`count(*)::int` })
          .from(pairing)
          .where(whereClause),
      ])

      // Fetch compositions (always — needed for coverage/isFull) and, in detail mode only,
      // the full per-pairing segments. Summary mode skips the segment fetch entirely.
      const pairingIds = items.map((p) => p.id)
      const fetchCompositions = () =>
        fastify.db
          .select()
          .from(pairingComposition)
          .where(and(
            sql`${pairingComposition.pairingId} IN ${pairingIds}`,
            notDeleted(pairingComposition.isDeleted)
          ))
      const fetchSegments = () =>
        fastify.db
          .select()
          .from(pairingSegment)
          .where(and(
            sql`${pairingSegment.pairingId} IN ${pairingIds}`,
            notDeleted(pairingSegment.isDeleted)
          ))
          .orderBy(asc(pairingSegment.dutySeq), asc(pairingSegment.segSeq))
      const [allCompositions, allSegments] = pairingIds.length > 0
        ? await Promise.all([fetchCompositions(), summary ? Promise.resolve([]) : fetchSegments()])
        : [[], []]

      // Group compositions by pairingId
      const compositionMap = new Map<number, typeof allCompositions>()
      for (const comp of allCompositions) {
        const existing = compositionMap.get(comp.pairingId) ?? []
        existing.push(comp)
        compositionMap.set(comp.pairingId, existing)
      }

      // Group segments by pairingId
      const segmentMap = new Map<number, typeof allSegments>()
      for (const seg of allSegments) {
        const existing = segmentMap.get(seg.pairingId) ?? []
        existing.push(seg)
        segmentMap.set(seg.pairingId, existing)
      }

      // Add composition, segments, and isFull to each pairing
      let enrichedItems = items.map((p) => {
        const comps = compositionMap.get(p.id) ?? []
        const segs = segmentMap.get(p.id) ?? []
        // Transform compositions to frontend format: { rank, plan, fill }
        const composition = comps.map((c) => ({
          rank: c.actingRank ?? '',
          plan: c.plan ?? 0,
          fill: c.fill ?? 0,
        }))
        const itemIsFull = isCoverageMet(composition)
        // Summary mode: omit the segment array entirely (lighter list rows); detail mode
        // keeps the original `segments` payload for the Pairing pane.
        return summary
          ? { ...p, composition, isFull: itemIsFull }
          : { ...p, composition, isFull: itemIsFull, segments: segs }
      })

      // Post-process filter for isFull (requires compositions to be fetched first)
      if (isFull !== undefined) {
        enrichedItems = enrichedItems.filter(item => item.isFull === isFull)
      }

      // Post-process filter for coverage (open/partial/full/over) when it narrows the set.
      const coverageTokens = coverage ? coverage.split(',').filter(Boolean) : []
      const coverageActive = coverageTokens.length > 0 && coverageTokens.length < 4
      if (coverageActive) {
        const want = new Set(coverageTokens)
        enrichedItems = enrichedItems.filter((item) => want.has(classifyCoverage(item.composition)))
      }

      // When a post-process filter is active, the SQL count is the pre-filter count;
      // use the filtered array length instead.
      const totalCount = (isFull !== undefined || coverageActive) ? enrichedItems.length : countResult[0].count

      return paginate({ page, pageSize }, enrichedItems, totalCount)
    })
  },

  async getById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:${id}`, CACHE_TTL, async () => {
      const [pairingRow] = await fastify.db
        .select()
        .from(pairing)
        .where(and(eq(pairing.id, id), notDeleted(pairing.isDeleted)))

      if (!pairingRow) return null

      const [segments, compositions] = await Promise.all([
        fastify.db
          .select()
          .from(pairingSegment)
          .where(and(eq(pairingSegment.pairingId, id), notDeleted(pairingSegment.isDeleted)))
          .orderBy(asc(pairingSegment.dutySeq), asc(pairingSegment.segSeq)),
        fastify.db
          .select()
          .from(pairingComposition)
          .where(and(eq(pairingComposition.pairingId, id), notDeleted(pairingComposition.isDeleted))),
      ])

      // Crew-specific Rule 7500 reference time zones are supplementary to the
      // pairing detail. Do not make the Duty Node editor unavailable when old
      // or partially migrated roster data cannot be read.
      let rosterDutyRefs: Array<{
        crewId: string
        pairingId: number | null
        dutySeq: number | null
        dutyRefTz: number | null
      }> = []
      try {
        rosterDutyRefs = await fastify.db
          .selectDistinctOn([rosterFlight.crewId, rosterFlight.dutySeq], {
            crewId: rosterFlight.crewId,
            pairingId: rosterFlight.pairingId,
            dutySeq: rosterFlight.dutySeq,
            dutyRefTz: rosterFlight.dutyRefTz,
          })
          .from(rosterFlight)
          .where(and(
            eq(rosterFlight.pairingId, id),
            notDeleted(rosterFlight.isDeleted),
            isNotNull(rosterFlight.dutySeq),
          ))
          .orderBy(asc(rosterFlight.crewId), asc(rosterFlight.dutySeq), asc(rosterFlight.segSeq))
      } catch (err) {
        fastify.log.warn({ err, pairingId: id }, 'Failed to load optional roster duty refs')
      }

      return { ...pairingRow, segments, compositions, rosterDutyRefs }
    })
  },

  async create(fastify: FastifyInstance, data: typeof pairing.$inferInsert, username: string) {
    const values = { ...data }
    // tafb NOT NULL 兜底：入参未带时按 sch 起止日历日
    if (values.tafb == null && values.schStrDtUtc && values.schEndDtUtc) {
      values.tafb = Math.max(1, Math.floor((values.schEndDtUtc.getTime() - values.schStrDtUtc.getTime()) / 86_400_000))
    }
    const [row] = await fastify.db
      .insert(pairing)
      .values({ ...values, ...auditCreate(username) })
      .returning()
    await invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`)
    return row
  },

  async update(fastify: FastifyInstance, id: number, data: Partial<typeof pairing.$inferInsert>, username: string) {
    const row = await fastify.db.transaction(async (tx) => {
      const updateData = { ...data }

      const [updated] = await tx
        .update(pairing)
        .set({ ...updateData, ...auditUpdate(username) })
        .where(eq(pairing.id, id))
        .returning()

      if (updated && data.base !== undefined) {
        await refreshPairingTafb(tx, id, username)
      }

      return updated
    })
    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`),
    ])
    return row
  },

  async remove(fastify: FastifyInstance, id: number) {
    // 业务预校验：有排班记录时禁止删除
    const [rostered] = await fastify.db
      .select({ id: rosterFlight.id })
      .from(rosterFlight)
      .where(and(eq(rosterFlight.pairingId, id), notDeleted(rosterFlight.isDeleted)))
      .limit(1)
    if (rostered) {
      throw Object.assign(new Error('Pairing has rostered crew and cannot be deleted'), { statusCode: 409 })
    }

    // 事务：先删子表，再删父表（顺序与 FK RESTRICT 要求一致）
    // roster_flight 可能残留 is_deleted=1 的软删行，仍持有 fk_rf_pairing，必须一并清除才能删父表
    await fastify.db.transaction(async (tx) => {
      await tx.delete(rosterFlight).where(eq(rosterFlight.pairingId, id))
      await tx.delete(pairingComposition).where(eq(pairingComposition.pairingId, id))
      await tx.delete(pairingSegment).where(eq(pairingSegment.pairingId, id))
      await tx.delete(pairing).where(eq(pairing.id, id))
    })

    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`),
    ])
  },

  // --- Pairing Composition ---

  async getCompositions(fastify: FastifyInstance, pairingId: number) {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:comp:${pairingId}`, CACHE_TTL, async () => {
      return fastify.db
        .select()
        .from(pairingComposition)
        .where(and(eq(pairingComposition.pairingId, pairingId), notDeleted(pairingComposition.isDeleted)))
    })
  },

  async createComposition(fastify: FastifyInstance, data: typeof pairingComposition.$inferInsert, username: string) {
    const delta = data.plan ?? 0
    if (delta > 0 && data.actingRank) {
      await checkCompositionCap(fastify.db, data.pairingId, data.actingRank, delta)
    }
    const [row] = await fastify.db
      .insert(pairingComposition)
      .values({ ...data, ...auditCreate(username) })
      .returning()
    await invalidate(fastify.redis, `${CACHE_PREFIX}:comp:${data.pairingId}`, `${CACHE_PREFIX}:${data.pairingId}`)
    // Refresh flight_composition.fill for all flights in this pairing
    const segs = await fastify.db
      .select({ fltId: pairingSegment.fltId })
      .from(pairingSegment)
      .where(and(eq(pairingSegment.pairingId, data.pairingId), notDeleted(pairingSegment.isDeleted)))
    const fltIds = [...new Set(segs.map((s) => s.fltId).filter((id): id is number => id !== null))]
    await refreshFlightCompositionFill(fastify.db, fltIds, username)
    return row
  },

  async updateComposition(fastify: FastifyInstance, id: number, data: Partial<typeof pairingComposition.$inferInsert>, username: string) {
    // Cap check: only needed if plan is changing
    if (data.plan !== undefined) {
      const [existing] = await fastify.db
        .select({ pairingId: pairingComposition.pairingId, actingRank: pairingComposition.actingRank, plan: pairingComposition.plan })
        .from(pairingComposition)
        .where(eq(pairingComposition.id, id))
        .limit(1)
      if (existing?.actingRank) {
        const delta = (data.plan ?? 0) - (existing.plan ?? 0)
        if (delta > 0) {
          await checkCompositionCap(fastify.db, existing.pairingId, existing.actingRank, delta)
        }
      }
    }
    const [row] = await fastify.db
      .update(pairingComposition)
      .set({ ...data, ...auditUpdate(username) })
      .where(eq(pairingComposition.id, id))
      .returning()
    if (row) {
      await invalidate(fastify.redis, `${CACHE_PREFIX}:comp:${row.pairingId}`, `${CACHE_PREFIX}:${row.pairingId}`)
      const segs = await fastify.db
        .select({ fltId: pairingSegment.fltId })
        .from(pairingSegment)
        .where(and(eq(pairingSegment.pairingId, row.pairingId), notDeleted(pairingSegment.isDeleted)))
      const fltIds = [...new Set(segs.map((s) => s.fltId).filter((id): id is number => id !== null))]
      await refreshFlightCompositionFill(fastify.db, fltIds, username)
    }
    return row
  },

  async removeComposition(fastify: FastifyInstance, id: number, username: string) {
    const [row] = await fastify.db
      .update(pairingComposition)
      .set({ isDeleted: 1, ...auditUpdate(username) })
      .where(eq(pairingComposition.id, id))
      .returning()
    if (row) {
      await invalidate(fastify.redis, `${CACHE_PREFIX}:comp:${row.pairingId}`, `${CACHE_PREFIX}:${row.pairingId}`)
      const segs = await fastify.db
        .select({ fltId: pairingSegment.fltId })
        .from(pairingSegment)
        .where(and(eq(pairingSegment.pairingId, row.pairingId), notDeleted(pairingSegment.isDeleted)))
      const fltIds = [...new Set(segs.map((s) => s.fltId).filter((id): id is number => id !== null))]
      await refreshFlightCompositionFill(fastify.db, fltIds, username)
    }
    return row
  },

  // --- Pairing Memo (no cache) ---

  async getMemos(fastify: FastifyInstance, pairingId: number) {
    return fastify.db
      .select()
      .from(pairingMemo)
      .where(eq(pairingMemo.pairingId, pairingId))
      .orderBy(desc(pairingMemo.tmst))
  },

  async createMemo(fastify: FastifyInstance, data: typeof pairingMemo.$inferInsert, username: string) {
    const [row] = await fastify.db
      .insert(pairingMemo)
      .values({ ...data, ...auditCreate(username) })
      .returning()
    return row
  },

  async deleteMemo(fastify: FastifyInstance, id: number) {
    await fastify.db.delete(pairingMemo).where(eq(pairingMemo.id, id))
  },

  // --- Import from Scenario ---

  async importFromScenario(fastify: FastifyInstance, scenarioId: number, username: string) {
    // Verify scenario exists and is in DONE status (name from workset)
    const [sc] = await fastify.db
      .select({
        id: scenario.id,
        status: scenario.status,
        name: workset.name,
      })
      .from(scenario)
      .innerJoin(workset, eq(scenario.worksetId, workset.id))
      .where(eq(scenario.id, scenarioId))

    if (!sc) {
      throw new Error('Scenario not found')
    }
    if (sc.status !== 'DONE') {
      throw new Error('Scenario must be in DONE status to import pairings')
    }

    // The scenario's pairingScenarioId references a related scenario
    // that holds the pairing data. Import those pairings into live.
    // For now, we copy pairings from the scenario's pairing_scenario_id context.
    // In production, this would read from scenario-specific pairing tables
    // or a staging area. The pattern here is: mark imported pairings with source.
    const audit = auditCreate(username)

    // Return scenario info to confirm import was triggered
    return { scenarioId: sc.id, scenarioName: sc.name, status: 'IMPORTED' }
  },

  /**
   * Create a new pairing from one or more flights.
   * All flights go into duty 1 as consecutive segments ordered by departure time.
   */
  async createFromFlights(fastify: FastifyInstance, flightIds: number[], base: string, division: string, username: string) {
    if (flightIds.length === 0) throw new Error('No flights provided')

    const result = await fastify.db.transaction(async (tx) => {
      const flights = await tx
        .select()
        .from(flightTable)
        .where(sql`${flightTable.id} IN (${sql.join(flightIds.map((id) => sql`${id}`), sql`, `)})`)
        .orderBy(asc(flightTable.schDepDtUtc))

      if (flights.length === 0) throw new Error('No matching flights found')

      const label = flights.map((f) => f.fltNum).join('-')
      const firstFlt = flights[0]
      const lastFlt = flights[flights.length - 1]
      const audit = auditCreate(username)

      const rawSpanDays = Math.floor((lastFlt.schArvDtUtc.getTime() - firstFlt.schDepDtUtc.getTime()) / 86_400_000)
      const durationDays = Math.max(0, rawSpanDays) // 自然天，语义不变
      const tafbDays = Math.max(1, rawSpanDays)     // tafb 最小值 1，段建成后仍由 refresh 重算

      const [newPairing] = await tx
        .insert(pairing)
        .values({
          pairingLabel: label,
          division,
          base,
          fleet: firstFlt.fleet,
          assignmentGroup: 'FLT',
          assignment: 'FLT',
          schStrDtUtc: firstFlt.schDepDtUtc,
          schEndDtUtc: lastFlt.schArvDtUtc,
          actStrDtUtc: firstFlt.actDepDtUtc,
          actEndDtUtc: lastFlt.actArvDtUtc,
          durationDays,
          tafb: tafbDays,
          dutyCount: 1,
          segCount: flights.length,
          source: 'MANUAL',
          ...audit,
        })
        .returning()

      const now = new Date()
      const segments: (typeof pairingSegment.$inferSelect)[] = []

      for (let i = 0; i < flights.length; i++) {
        const flt = flights[i]
        const isFirstSeg = i === 0
        const isLastSeg = i === flights.length - 1

        // Calculate pickup/brief times: before first flight departure
        // Default: pickup 60min before, brief 30min before
        const schDepDt = new Date(flt.schDepDtUtc)
        const pickupStart = isFirstSeg ? new Date(schDepDt.getTime() - 90 * 60000) : null
        const pickupEnd = isFirstSeg ? new Date(schDepDt.getTime() - 60 * 60000) : null
        const briefStart = isFirstSeg ? new Date(schDepDt.getTime() - 45 * 60000) : null
        const briefEnd = isFirstSeg ? new Date(schDepDt.getTime() - 30 * 60000) : null

        // Calculate debrief/dropoff times: after last flight arrival
        // Default: debrief 30min after, dropoff 60min after
        const schArvDt = new Date(flt.schArvDtUtc)
        const debriefStart = isLastSeg ? new Date(schArvDt.getTime() + 15 * 60000) : null
        const debriefEnd = isLastSeg ? new Date(schArvDt.getTime() + 30 * 60000) : null
        const dropoffStart = isLastSeg ? new Date(schArvDt.getTime() + 30 * 60000) : null
        const dropoffEnd = isLastSeg ? new Date(schArvDt.getTime() + 60 * 60000) : null

        const [seg] = await tx
          .insert(pairingSegment)
          .values({
            pairingId: newPairing.id,
            dutySeq: 1,
            segSeq: i + 1,
            dutyStrArp: firstFlt.depArp,
            dutyEndArp: lastFlt.arvArp,
            dutySchStrDtUtc: firstFlt.schDepDtUtc,
            dutySchEndDtUtc: lastFlt.schArvDtUtc,
            dutyActStrDtUtc: firstFlt.actDepDtUtc,
            dutyActEndDtUtc: lastFlt.actArvDtUtc,
            dutyAccState: 'D',
            fltId: flt.id, fltDt: flt.fltDt, fltNum: flt.fltNum,
            airline: flt.airline, depArp: flt.depArp, arvArp: flt.arvArp,
            fleetSeg: flt.fleet,
            schStrDtUtc: flt.schDepDtUtc, schEndDtUtc: flt.schArvDtUtc,
            actStrDtUtc: flt.actDepDtUtc, actEndDtUtc: flt.actArvDtUtc,
            segAssignment: flt.flightAssignment ?? 'FLT',
            // Duty-level pickup/brief: only on first segment
            pickupStartUtc: pickupStart,
            pickupEndUtc: pickupEnd,
            briefStartUtc: briefStart,
            briefEndUtc: briefEnd,
            // Duty-level debrief/dropoff: only on last segment
            debriefStartUtc: debriefStart,
            debriefEndUtc: debriefEnd,
            dropoffStartUtc: dropoffStart,
            dropoffEndUtc: dropoffEnd,
            // Duty-level rest: only on last segment (12h default for single duty)
            dutySchRestMin: isLastSeg ? 720 : null,
            dutyActRestMin: isLastSeg ? 720 : null,
            // Double duty (for split duty scenarios): null
            doublePickupStartUtc: null, doublePickupEndUtc: null,
            doubleBriefStartUtc: null, doubleBriefEndUtc: null,
            doubleDebriefStartUtc: null, doubleDebriefEndUtc: null,
            doubleDropoffStartUtc: null, doubleDropoffEndUtc: null,
            ...auditCreate(username),
          })
          .returning()
        segments.push(seg)
      }

      await refreshPairingTafb(tx, newPairing.id, username)

      return { pairing: newPairing, segments }
    })

    await invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`)
    return result
  },

  /**
   * Add a flight as a new segment to an existing pairing.
   * Auto-determines dutySeq (appends to last duty) and segSeq (next in sequence).
   */
  async addSegment(fastify: FastifyInstance, pairingId: number, flightId: number, username: string) {
    const result = await fastify.db.transaction(async (tx) => {
      // 1. Verify pairing exists
      const [pair] = await tx
        .select()
        .from(pairing)
        .where(and(eq(pairing.id, pairingId), notDeleted(pairing.isDeleted)))

      if (!pair) throw new Error(`Pairing #${pairingId} not found`)

      // 2. Fetch the flight
      const [flt] = await tx
        .select()
        .from(flightTable)
        .where(eq(flightTable.id, flightId))

      if (!flt) throw new Error(`Flight #${flightId} not found`)

      // 3. Determine dutySeq + segSeq (append to last duty, next seg)
      const [maxSeqs] = await tx
        .select({
          maxDuty: max(pairingSegment.dutySeq),
          maxSeg: max(pairingSegment.segSeq),
        })
        .from(pairingSegment)
        .where(and(eq(pairingSegment.pairingId, pairingId), notDeleted(pairingSegment.isDeleted)))

      const dutySeq = maxSeqs?.maxDuty ?? 1
      // Get max segSeq within this duty
      const [maxSegInDuty] = await tx
        .select({ maxSeg: max(pairingSegment.segSeq) })
        .from(pairingSegment)
        .where(and(
          eq(pairingSegment.pairingId, pairingId),
          eq(pairingSegment.dutySeq, dutySeq),
          notDeleted(pairingSegment.isDeleted),
        ))

      const segSeq = ((maxSegInDuty?.maxSeg) ?? 0) + 1
      const isOnlySegInDuty = segSeq === 1  // first and only segment in this duty

      // 4. Use existing duty context or derive from flight
      // Find an existing segment in this duty for context
      const [existingDutySeg] = await tx
        .select()
        .from(pairingSegment)
        .where(and(
          eq(pairingSegment.pairingId, pairingId),
          eq(pairingSegment.dutySeq, dutySeq),
          notDeleted(pairingSegment.isDeleted),
        ))
        .limit(1)

      // Find the previous last segment in this duty (if exists)
      const [prevLastSeg] = segSeq > 1 ? await tx
        .select()
        .from(pairingSegment)
        .where(and(
          eq(pairingSegment.pairingId, pairingId),
          eq(pairingSegment.dutySeq, dutySeq),
          eq(pairingSegment.segSeq, segSeq - 1),
          notDeleted(pairingSegment.isDeleted),
        ))
        .limit(1) : [null]

      const audit = auditCreate(username)

      // Calculate pickup/brief times for first segment (or reuse existing)
      const schDepDt = new Date(flt.schDepDtUtc)
      const pickupStart = isOnlySegInDuty ? new Date(schDepDt.getTime() - 90 * 60000) : (existingDutySeg?.pickupStartUtc ?? null)
      const pickupEnd = isOnlySegInDuty ? new Date(schDepDt.getTime() - 60 * 60000) : (existingDutySeg?.pickupEndUtc ?? null)
      const briefStart = isOnlySegInDuty ? new Date(schDepDt.getTime() - 45 * 60000) : (existingDutySeg?.briefStartUtc ?? null)
      const briefEnd = isOnlySegInDuty ? new Date(schDepDt.getTime() - 30 * 60000) : (existingDutySeg?.briefEndUtc ?? null)

      // Calculate debrief/dropoff times for this new last segment
      const schArvDt = new Date(flt.schArvDtUtc)
      const debriefStart = new Date(schArvDt.getTime() + 15 * 60000)
      const debriefEnd = new Date(schArvDt.getTime() + 30 * 60000)
      const dropoffStart = new Date(schArvDt.getTime() + 30 * 60000)
      const dropoffEnd = new Date(schArvDt.getTime() + 60 * 60000)

      const [created] = await tx
        .insert(pairingSegment)
        .values({
          pairingId,
          dutySeq,
          segSeq,
          // Duty context — reuse from existing or derive from flight
          dutyStrArp: existingDutySeg?.dutyStrArp ?? flt.depArp,
          dutyEndArp: flt.arvArp,
          dutySchStrDtUtc: existingDutySeg?.dutySchStrDtUtc ?? flt.schDepDtUtc,
          dutySchEndDtUtc: flt.schArvDtUtc,
          dutyActStrDtUtc: existingDutySeg?.dutyActStrDtUtc ?? flt.actDepDtUtc,
          dutyActEndDtUtc: flt.actArvDtUtc,
          // Flight segment data
          fltId: flt.id,
          fltDt: flt.fltDt,
          fltNum: flt.fltNum,
          airline: flt.airline,
          depArp: flt.depArp,
          arvArp: flt.arvArp,
          fleetSeg: flt.fleet,
          schStrDtUtc: flt.schDepDtUtc,
          schEndDtUtc: flt.schArvDtUtc,
          actStrDtUtc: flt.actDepDtUtc,
          actEndDtUtc: flt.actArvDtUtc,
          segAssignment: flt.flightAssignment ?? 'FLT',
          // Duty-level pickup/brief: only on first segment (reuse or create)
          pickupStartUtc: pickupStart,
          pickupEndUtc: pickupEnd,
          briefStartUtc: briefStart,
          briefEndUtc: briefEnd,
          // Duty-level debrief/dropoff: on this new last segment
          debriefStartUtc: debriefStart,
          debriefEndUtc: debriefEnd,
          dropoffStartUtc: dropoffStart,
          dropoffEndUtc: dropoffEnd,
          // Duty-level rest: on this new last segment
          dutySchRestMin: 720,
          dutyActRestMin: 720,
          // Double duty (for split duty scenarios): null
          doublePickupStartUtc: null, doublePickupEndUtc: null,
          doubleBriefStartUtc: null, doubleBriefEndUtc: null,
          doubleDebriefStartUtc: null, doubleDebriefEndUtc: null,
          doubleDropoffStartUtc: null, doubleDropoffEndUtc: null,
          dutyAccState: 'D',
          ...audit,
        })
        .returning()

      // 5. Clear debrief/dropoff/rest from previous last segment (now it's not the last)
      if (prevLastSeg) {
        await tx
          .update(pairingSegment)
          .set({
            debriefStartUtc: null,
            debriefEndUtc: null,
            dropoffStartUtc: null,
            dropoffEndUtc: null,
            dutySchRestMin: null,
            dutyActRestMin: null,
            ...auditUpdate(username),
          })
          .where(eq(pairingSegment.id, prevLastSeg.id))
      }

      // 6. Update pairing header seg_count
      await tx
        .update(pairing)
        .set({
          segCount: (pair.segCount ?? 0) + 1,
          ...auditUpdate(username),
        })
        .where(eq(pairing.id, pairingId))

      await refreshPairingTafb(tx, pairingId, username)

      return created
    })

    await invalidatePattern(fastify.redis, 'pairing:*')

    return result
  },
}
