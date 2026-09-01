import { eq, and, between, ilike, asc, desc, inArray, or, isNull, lte, gt, SQL, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { flight } from '../../models/flight/flight.js'
import { flightComposition } from '../../models/flight/flight-composition.js'
import { pairing } from '../../models/pairing/pairing.js'
import { pairingComposition } from '../../models/pairing/pairing-composition.js'
import { pairingSegment } from '../../models/pairing/pairing-segment.js'
import { rosterFlight } from '../../models/roster/roster-flight.js'
import { crew } from '../../models/crew/crew.js'
import { crewBase } from '../../models/crew/crew-base.js'
import { getOrSet, invalidate, invalidatePattern } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'
import { notDeleted } from '../../utils/db.js'
import { rankService } from '../base/rank-service.js'
import { propagateFlightActualTimeChange } from './flight-delay-propagation-service.js'

const CACHE_PREFIX = 'flight'
const CACHE_TTL = 600 // 10min

/** Deadhead codes on pairing_segment.seg_assignment for this physical flight. */
export const isDeadheadSegAssignment = (segAssignment: string | null | undefined): boolean => {
  const code = String(segAssignment ?? '').trim().toUpperCase()
  return code === 'DHD' || code === 'DH'
}

function escapeLikePattern(str: string): string {
  return str.replace(/[%_]/g, '\\$&')
}

function formatMinutes(minutes: number | string | null): string {
  if (!minutes) return '0:00'
  const num = Number(minutes)
  if (isNaN(num)) return '0:00'
  const hours = Math.floor(num / 60)
  const mins = Math.round(num % 60)
  return `${hours}:${mins.toString().padStart(2, '0')}`
}

/** Flight row from DB (Date types from Drizzle timestamp) */
interface FlightRowDB {
  id: number
  airline: string
  fltDt: string
  fltNum: string
  depArp: string
  arvArp: string
  schDepDtUtc: Date
  schArvDtUtc: Date
  actDepDtUtc: Date | null
  actArvDtUtc: Date | null
  actDepArp: string
  actArvArp: string
  flightFlag: string
  blkMin: number
  fleet: string
  register: string | null
  fltType: string
  fltSts: string | null
  isDeleted: number
}

/** Flight for API response (ISO string dates) */
interface FlightApi {
  id: number
  airline: string
  fltDt: string
  fltNum: string
  depArp: string
  arvArp: string
  schDepDtUtc: string
  schArvDtUtc: string
  actDepDtUtc: string
  actArvDtUtc: string
  actDepArp: string
  actArvArp: string
  flightFlag: string
  blkMin: number
  fleet: string
  register: string | null
  fltType: string
  fltSts: string | null
  isDeleted: number
  isCancelled: boolean
}

/** FlightItem for grouped display */
interface FlightItem {
  registration: string
  fleet: string
  flights: FlightApi[]
  isFleetGrouped?: boolean
}

/** Convert DB row to API format */
function toFlightApi(row: FlightRowDB): FlightApi {
  // isCancelled: fltSts contains 'CX' or flightFlag is 'X'
  const isCancelled = row.fltSts?.toUpperCase().includes('CX') || row.flightFlag?.toUpperCase() === 'X'
  return {
    id: row.id,
    airline: row.airline,
    fltDt: row.fltDt,
    fltNum: row.fltNum,
    depArp: row.depArp,
    arvArp: row.arvArp,
    schDepDtUtc: row.schDepDtUtc.toISOString(),
    schArvDtUtc: row.schArvDtUtc.toISOString(),
    actDepDtUtc: row.actDepDtUtc?.toISOString() ?? '',
    actArvDtUtc: row.actArvDtUtc?.toISOString() ?? '',
    actDepArp: row.actDepArp ?? '',
    actArvArp: row.actArvArp ?? '',
    flightFlag: row.flightFlag ?? '',
    blkMin: row.blkMin ?? 0,
    fleet: row.fleet ?? '',
    register: row.register,
    fltType: row.fltType ?? '',
    fltSts: row.fltSts,
    isDeleted: row.isDeleted,
    isCancelled,
  }
}

/** Bin-pack sorted flights into sub-rows with no time overlap */
function packIntoRows(sorted: FlightApi[], chainAware: boolean): FlightApi[][] {
  const rows: FlightApi[][] = []

  for (const f of sorted) {
    let bestRow: FlightApi[] | null = null

    for (const row of rows) {
      const last = row[row.length - 1]
      // No time overlap: last arrival <= this departure (ISO string compare, zero GC)
      if (last.schArvDtUtc <= f.schDepDtUtc) {
        if (chainAware && last.arvArp === f.depArp) {
          // Perfect chain — use immediately
          bestRow = row
          break
        }
        if (!bestRow) {
          bestRow = row
        }
      }
    }

    if (bestRow) {
      bestRow.push(f)
    } else {
      rows.push([f])
    }
  }

  return rows
}

/** Group flights by register (priority) or fleet, then bin-pack */
function groupFlights(flights: FlightApi[]): FlightItem[] {
  const registered = new Map<string, FlightApi[]>()
  const unregistered = new Map<string, FlightApi[]>()

  for (const f of flights) {
    const reg = f.register?.trim()
    if (reg) {
      const arr = registered.get(reg) ?? []
      arr.push(f)
      registered.set(reg, arr)
    } else {
      const fleet = f.fleet || 'UNKNOWN'
      const arr = unregistered.get(fleet) ?? []
      arr.push(f)
      unregistered.set(fleet, arr)
    }
  }

  const result: FlightItem[] = []

  // Phase 2A: registered flights — bin-pack by time only
  for (const [reg, flts] of registered) {
    flts.sort((a, b) => (a.schDepDtUtc < b.schDepDtUtc ? -1 : 1))
    const subRows = packIntoRows(flts, false)
    for (let i = 0; i < subRows.length; i++) {
      result.push({
        registration: i === 0 ? reg : `${reg}#${i + 1}`,
        fleet: subRows[i][0].fleet,
        flights: subRows[i],
      })
    }
  }

  // Phase 2B: unregistered flights — bin-pack with chain logic
  for (const [fleet, flts] of unregistered) {
    flts.sort((a, b) => (a.schDepDtUtc < b.schDepDtUtc ? -1 : 1))
    const subRows = packIntoRows(flts, true)
    for (let i = 0; i < subRows.length; i++) {
      result.push({
        registration: `${fleet}-${i + 1}`,
        fleet,
        flights: subRows[i],
        isFleetGrouped: true,
      })
    }
  }

  return result
}

interface FlightListQuery {
  startDate: string
  endDate: string
  depArp?: string
  arvArp?: string
  fltNum?: string
  fleet?: string
  status?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export const flightService = {
  /**
   * List flights with pagination. Two modes:
   *  - grouping='grouped' (default): register/fleet bin-packed FlightItems. Loads ALL matching
   *    rows because grouping by registration needs global knowledge, then paginates in memory.
   *  - grouping='none': windowed flat FlightApi rows, paginated in SQL (LIMIT/OFFSET) with no
   *    global grouping/bin-packing — a lighter, faster first paint for long ranges.
   * The grouped path is byte-for-byte unchanged; 'none' is purely additive.
   */
  async listGrouped(fastify: FastifyInstance, query: {
    startDate: string
    endDate: string
    depArp?: string
    arvArp?: string
    fltNum?: string
    fleet?: string
    status?: string
    page: number
    pageSize: number
    grouping?: 'grouped' | 'none'
  }) {
    const { startDate, endDate, depArp, arvArp, fltNum, fleet, status, page, pageSize, grouping } = query
    const summary = grouping === 'none'
    const cacheKey = `${CACHE_PREFIX}:grouped:${startDate}:${endDate}:${depArp ?? ''}:${arvArp ?? ''}:${fltNum ?? ''}:${fleet ?? ''}:${status ?? ''}:${page}:${pageSize}:${summary ? 'n' : 'g'}:ft1`

    return getOrSet(fastify.redis, cacheKey, CACHE_TTL, async () => {
      const conditions: SQL[] = [
        notDeleted(flight.isDeleted),
        between(flight.fltDt, startDate, endDate),
      ]

      if (depArp) conditions.push(eq(flight.depArp, depArp))
      if (arvArp) conditions.push(eq(flight.arvArp, arvArp))
      if (fltNum) conditions.push(ilike(flight.fltNum, `%${escapeLikePattern(fltNum)}%`))
      if (fleet) conditions.push(eq(flight.fleet, fleet))
      if (status) conditions.push(eq(flight.fltSts, status))

      // Summary/windowed mode: paginate flat rows in SQL — no full-range load, no bin-packing.
      if (summary) {
        const baseQuery = fastify.db
          .select()
          .from(flight)
          .where(and(...conditions))
          .orderBy(asc(flight.schDepDtUtc))
        const [rowsDB, countRows] = await Promise.all([
          pageSize > 0 ? baseQuery.limit(pageSize).offset((page - 1) * pageSize) : baseQuery,
          fastify.db
            .select({ count: sql<number>`count(*)::int` })
            .from(flight)
            .where(and(...conditions)),
        ])
        const flights = (rowsDB as FlightRowDB[]).map(toFlightApi)
        const flightTotal = countRows[0].count
        return { items: flights, total: flightTotal, flightTotal, grouping: 'none' as const }
      }

      // Query all flights matching filters (needed for proper grouping by registration)
      // Performance: Ensure DB has index on (fltDt, schDepDtUtc)
      const allFlightsDB = await fastify.db
        .select()
        .from(flight)
        .where(and(...conditions))
        .orderBy(asc(flight.schDepDtUtc)) as FlightRowDB[]

      // Convert DB rows to API format
      const allFlights = allFlightsDB.map(toFlightApi)

      // Group flights into FlightItems
      const allItems = groupFlights(allFlights)

      // Paginate FlightItems (pageSize=0 → return all)
      // total = RegNo rows after bin-pack; flightTotal = single-leg flight count.
      const total = allItems.length
      const flightTotal = allFlights.length
      const items = pageSize === 0 ? allItems : allItems.slice((page - 1) * pageSize, page * pageSize)

      return { items, total, flightTotal }
    })
  },

  /**
   * Per-flight pairing & crew counts for a date range, for the Flight Navi table.
   * Two GROUP BY aggregates (one per source table) — NOT N+1; one round trip covers the
   * whole range. The flight→pairing link lives in pairing_segment.flt_id and the
   * flight→crew link in roster_flight.flt_id; neither is present in the pairing list or the
   * roster pane view, so this must be resolved server-side.
   */
  async naviCounts(fastify: FastifyInstance, startDate: string, endDate: string) {
    const cacheKey = `${CACHE_PREFIX}:navicounts:${startDate}:${endDate}`
    return getOrSet(fastify.redis, cacheKey, CACHE_TTL, async () => {
      const crewRows = await fastify.db
        .select({
          fltId: rosterFlight.fltId,
          crewCount: sql<number>`count(distinct ${rosterFlight.crewId})`,
        })
        .from(rosterFlight)
        .innerJoin(flight, eq(flight.id, rosterFlight.fltId))
        .where(and(
          notDeleted(rosterFlight.isDeleted),
          notDeleted(flight.isDeleted),
          between(flight.fltDt, startDate, endDate),
        ))
        .groupBy(rosterFlight.fltId)

      const pairingRows = await fastify.db
        .select({
          fltId: pairingSegment.fltId,
          pairingCount: sql<number>`count(distinct ${pairingSegment.pairingId})`,
        })
        .from(pairingSegment)
        .innerJoin(flight, eq(flight.id, pairingSegment.fltId))
        .where(and(
          notDeleted(pairingSegment.isDeleted),
          notDeleted(flight.isDeleted),
          between(flight.fltDt, startDate, endDate),
        ))
        .groupBy(pairingSegment.fltId)

      const map = new Map<number, { fltId: number; pairingCount: number; crewCount: number }>()
      for (const r of crewRows) {
        if (r.fltId == null) continue
        map.set(Number(r.fltId), { fltId: Number(r.fltId), pairingCount: 0, crewCount: Number(r.crewCount) })
      }
      for (const r of pairingRows) {
        if (r.fltId == null) continue
        const id = Number(r.fltId)
        const entry = map.get(id) ?? { fltId: id, pairingCount: 0, crewCount: 0 }
        entry.pairingCount = Number(r.pairingCount)
        map.set(id, entry)
      }
      return { counts: [...map.values()] }
    })
  },

  /** Legacy list method (kept for backward compatibility) */
  async list(fastify: FastifyInstance, query: FlightListQuery) {
    const { startDate, endDate, depArp, arvArp, fltNum, fleet, status, sortBy, sortOrder } = query
    const cacheKey = `${CACHE_PREFIX}:list:${startDate}:${endDate}:${depArp ?? ''}:${arvArp ?? ''}:${fltNum ?? ''}:${fleet ?? ''}:${status ?? ''}:${sortBy ?? ''}:${sortOrder ?? ''}`

    return getOrSet(fastify.redis, cacheKey, CACHE_TTL, async () => {
      const conditions: SQL[] = [
        notDeleted(flight.isDeleted),
        between(flight.fltDt, startDate, endDate),
      ]

      if (depArp) conditions.push(eq(flight.depArp, depArp))
      if (arvArp) conditions.push(eq(flight.arvArp, arvArp))
      if (fltNum) conditions.push(ilike(flight.fltNum, `%${escapeLikePattern(fltNum)}%`))
      if (fleet) conditions.push(eq(flight.fleet, fleet))
      if (status) conditions.push(eq(flight.fltSts, status))

      const orderColumn = sortBy === 'fltNum' ? flight.fltNum
        : sortBy === 'depArp' ? flight.depArp
        : sortBy === 'arvArp' ? flight.arvArp
        : flight.schDepDtUtc
      const orderFn = sortOrder === 'desc' ? desc : asc

      const items = await fastify.db
        .select()
        .from(flight)
        .where(and(...conditions))
        .orderBy(orderFn(orderColumn))

      return { items, total: items.length }
    })
  },

  async getById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:${id}`, CACHE_TTL, async () => {
      const [flightRow] = await fastify.db
        .select()
        .from(flight)
        .where(and(eq(flight.id, id), notDeleted(flight.isDeleted)))

      if (!flightRow) return null

      const compositions = await fastify.db
        .select()
        .from(flightComposition)
        .where(eq(flightComposition.fltId, id))

      return { ...toFlightApi(flightRow as FlightRowDB), compositions }
    })
  },

  async create(fastify: FastifyInstance, data: typeof flight.$inferInsert, username: string) {
    const [row] = await fastify.db
      .insert(flight)
      .values({ ...data, ...auditCreate(username) })
      .returning()
    await invalidatePattern(fastify.redis, `${CACHE_PREFIX}:*`)
    return row
  },

  /**
   * Updates a flight row. When the incoming data changes actDepDtUtc/actArvDtUtc from
   * their previous values, cascades that change into pairing_segment/roster_flight in
   * the same transaction (see flight-delay-propagation-service.ts) so downstream
   * ghost bars and KPI can be kept in sync by the caller (§Flight-Change-Ripple-Required).
   */
  async update(fastify: FastifyInstance, id: number, data: Partial<typeof flight.$inferInsert>, username: string) {
    const result = await fastify.db.transaction(async (tx) => {
      const [before] = await tx.select().from(flight).where(eq(flight.id, id))
      if (!before) return null

      const [row] = await tx
        .update(flight)
        .set({ ...data, ...auditUpdate(username) })
        .where(eq(flight.id, id))
        .returning()
      if (!row) return null

      let affectedCrewIds: string[] = []
      let affectedPairingIds: number[] = []
      const actDepChanged = data.actDepDtUtc != null && new Date(data.actDepDtUtc as Date).getTime() !== new Date((before as FlightRowDB).actDepDtUtc as Date).getTime()
      const actArvChanged = data.actArvDtUtc != null && new Date(data.actArvDtUtc as Date).getTime() !== new Date((before as FlightRowDB).actArvDtUtc as Date).getTime()
      if (actDepChanged || actArvChanged) {
        const propagation = await propagateFlightActualTimeChange(
          tx,
          id,
          row.actDepDtUtc as Date,
          row.actArvDtUtc as Date,
          username,
        )
        affectedCrewIds = propagation.affectedCrewIds
        affectedPairingIds = propagation.affectedPairingIds
      }

      return { flight: toFlightApi(row as FlightRowDB), affectedCrewIds, affectedPairingIds }
    })
    if (!result) return null

    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`),
      ...(result.affectedPairingIds.length > 0
        ? [
          invalidatePattern(fastify.redis, 'pairing:list:*'),
          ...result.affectedPairingIds.flatMap((pairingId) => [
            invalidate(fastify.redis, `pairing:${pairingId}`, `pairing-segments:${pairingId}`),
          ]),
        ]
        : []),
    ])
    return result
  },

  /** Mark a flight cancelled (fltSts = 'CX') — reuses the existing isCancelled derivation in toFlightApi. */
  async cancel(fastify: FastifyInstance, id: number, username: string) {
    const [row] = await fastify.db
      .update(flight)
      .set({ fltSts: 'CX', ...auditUpdate(username) })
      .where(and(eq(flight.id, id), notDeleted(flight.isDeleted)))
      .returning()
    if (!row) return null
    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`),
    ])
    return toFlightApi(row as FlightRowDB)
  },

  /** Clear a flight's cancelled status (fltSts = null). */
  async restore(fastify: FastifyInstance, id: number, username: string) {
    const [row] = await fastify.db
      .update(flight)
      .set({ fltSts: null, ...auditUpdate(username) })
      .where(and(eq(flight.id, id), notDeleted(flight.isDeleted)))
      .returning()
    if (!row) return null
    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`),
    ])
    return toFlightApi(row as FlightRowDB)
  },

  async remove(fastify: FastifyInstance, id: number, username: string) {
    // 预校验：航班已组环时禁止删除
    const [inPairing] = await fastify.db
      .select({ id: pairingSegment.id })
      .from(pairingSegment)
      .where(eq(pairingSegment.fltId, id))
      .limit(1)
    if (inPairing) {
      throw Object.assign(new Error('Flight is part of a pairing and cannot be deleted'), { statusCode: 409 })
    }

    // 预校验：有编组配置时禁止删除
    const [hasComp] = await fastify.db
      .select({ id: flightComposition.id })
      .from(flightComposition)
      .where(eq(flightComposition.fltId, id))
      .limit(1)
    if (hasComp) {
      throw Object.assign(new Error('Flight has composition config and cannot be deleted'), { statusCode: 409 })
    }

    const [row] = await fastify.db
      .update(flight)
      .set({ isDeleted: 1, ...auditUpdate(username) })
      .where(eq(flight.id, id))
      .returning()
    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`),
    ])
    return row
  },

  async batchImport(fastify: FastifyInstance, flights: (typeof flight.$inferInsert)[], username: string) {
    const audit = auditCreate(username)
    const rows = await fastify.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(flight)
        .values(flights.map((f) => ({ ...f, ...audit })))
        .returning()
      return inserted
    })
    await invalidatePattern(fastify.redis, `${CACHE_PREFIX}:*`)
    return rows
  },

  async getCrewList(fastify: FastifyInstance, flightId: number) {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:crew:${flightId}`, CACHE_TTL, async () => {
      // Resolve assignees like 8030: coalesce(rf.flt_id, ps.flt_id). Exclude DHD/DH on this flight.
      const assignmentRows = await fastify.db
        .select({
          seqOrder: rosterFlight.seqOrder,
          crewId: rosterFlight.crewId,
          crewName: sql<string>`concat_ws(' ', ${crew.lastName}, ${crew.firstName})`,
          seniorityNum: crew.seniorityNum,
          crewRank: rosterFlight.activeRank,
          actingRank: rosterFlight.flightActingRank,
          label: rosterFlight.label,
          source: rosterFlight.source,
          mbhMinutes: rosterFlight.schCreditedMinutes,
          segAssignment: pairingSegment.segAssignment,
        })
        .from(rosterFlight)
        .innerJoin(crew, eq(rosterFlight.crewId, crew.crewId))
        .leftJoin(
          pairingSegment,
          and(
            eq(pairingSegment.pairingId, rosterFlight.pairingId),
            eq(pairingSegment.fltId, flightId),
            notDeleted(pairingSegment.isDeleted),
          ),
        )
        .where(and(
          notDeleted(rosterFlight.isDeleted),
          sql`${rosterFlight.pairingId} is not null`,
          eq(rosterFlight.assignmentGroup, 'FLY'),
          or(
            eq(rosterFlight.fltId, flightId),
            and(isNull(rosterFlight.fltId), eq(pairingSegment.fltId, flightId)),
          ),
        ))
        .orderBy(asc(rosterFlight.seqOrder), asc(rosterFlight.crewId))

      // Dedupe by crew; drop deadhead on this physical flight.
      const seen = new Set<string>()
      const assignments: typeof assignmentRows = []
      for (const row of assignmentRows) {
        if (isDeadheadSegAssignment(row.segAssignment)) continue
        if (seen.has(row.crewId)) continue
        seen.add(row.crewId)
        assignments.push(row)
      }

      // Query composition plan from flight_composition
      const compositions = await fastify.db
        .select({
          division: flightComposition.division,
          actingRank: flightComposition.actingRank,
          plan: flightComposition.plan,
        })
        .from(flightComposition)
        .where(eq(flightComposition.fltId, flightId))

      // Aggregate pairing_composition.plan over distinct operating pairings on this flt
      // (P + C). Exclude DHD/DH segments so deadhead-only coverage does not add plan.
      const operatingPairingRows = await fastify.db
        .selectDistinct({ pairingId: pairingSegment.pairingId })
        .from(pairingSegment)
        .innerJoin(
          pairing,
          and(eq(pairing.id, pairingSegment.pairingId), notDeleted(pairing.isDeleted)),
        )
        .where(and(
          eq(pairingSegment.fltId, flightId),
          notDeleted(pairingSegment.isDeleted),
          sql`upper(trim(${pairingSegment.segAssignment})) not in ('DHD', 'DH')`,
        ))
      const operatingPairingIds = operatingPairingRows
        .map((r) => r.pairingId)
        .filter((id): id is number => id != null)

      const pairingPlanRows = operatingPairingIds.length === 0
        ? [] as Array<{ actingRank: string | null; plan: number | null }>
        : await fastify.db
          .select({
            actingRank: pairingComposition.actingRank,
            plan: sql<number>`coalesce(sum(${pairingComposition.plan}), 0)`,
          })
          .from(pairingComposition)
          .where(and(
            inArray(pairingComposition.pairingId, operatingPairingIds),
            notDeleted(pairingComposition.isDeleted),
          ))
          .groupBy(pairingComposition.actingRank)

      // Build composition map from rank table (display_order drives column order)
      const allRanks = await rankService.list(fastify)
      const orderedRanks = allRanks
        .filter(r => r.isActingRank === 1)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(r => r.rank)

      const compMap: Record<string, { plan: number; actual: number }> = {}
      for (const r of orderedRanks) compMap[r] = { plan: 0, actual: 0 }

      const flightPlanRanks = new Set<string>()
      for (const c of compositions) {
        if (c.actingRank && compMap[c.actingRank] !== undefined) {
          compMap[c.actingRank].plan = c.plan ?? 0
          flightPlanRanks.add(c.actingRank)
        }
      }
      for (const p of pairingPlanRows) {
        if (!p.actingRank || compMap[p.actingRank] === undefined) continue
        if (flightPlanRanks.has(p.actingRank)) continue
        compMap[p.actingRank].plan = Number(p.plan) || 0
      }

      for (const a of assignments) {
        if (a.actingRank && compMap[a.actingRank] !== undefined) {
          compMap[a.actingRank].actual++
        }
      }

      // Determine status
      const isFull = Object.values(compMap).every(c => c.actual >= c.plan)
      const isPartial = Object.values(compMap).some(c => c.actual < c.plan && c.plan > 0)
      const status: 'full' | 'partial' | 'cancelled' = isFull ? 'full' : isPartial ? 'partial' : 'cancelled'

      // Home base as of Flight Date (same DISTINCT ON pattern as Pairing Info).
      const baseByCrew = new Map<string, string>()
      if (assignments.length > 0) {
        const flightRows = await fastify.db
          .select({ fltDt: flight.fltDt, schDepDtUtc: flight.schDepDtUtc })
          .from(flight)
          .where(eq(flight.id, flightId))
          .limit(1)
        const fr = flightRows[0]
        const fltDtRaw = fr?.fltDt != null ? String(fr.fltDt).slice(0, 10) : ''
        const schDep = fr?.schDepDtUtc
        const asOfDate = fltDtRaw.length === 10
          ? new Date(`${fltDtRaw}T00:00:00.000Z`)
          : schDep
            ? (schDep instanceof Date ? schDep : new Date(schDep))
            : null
        if (asOfDate && !Number.isNaN(asOfDate.getTime())) {
          const crewIds = assignments.map((a) => a.crewId)
          const baseRows = await fastify.db
            .selectDistinctOn([crewBase.crewId], { crewId: crewBase.crewId, base: crewBase.base })
            .from(crewBase)
            .where(and(
              inArray(crewBase.crewId, crewIds),
              lte(crewBase.effDt, asOfDate),
              or(isNull(crewBase.expDt), gt(crewBase.expDt, asOfDate)),
            ))
            .orderBy(crewBase.crewId, desc(crewBase.effDt))
          for (const row of baseRows) {
            if (row.crewId && row.base) baseByCrew.set(row.crewId, row.base)
          }
        }
      }

      // Format items
      const items = assignments.map(a => ({
        seqOrder: a.seqOrder ?? 0,
        crewId: a.crewId,
        crewName: a.crewName ?? '',
        seniorityNum: a.seniorityNum ?? null,
        crewRank: a.crewRank ?? a.actingRank ?? '',
        actingRank: a.actingRank ?? '',
        label: a.label ?? '',
        source: (a.source as 'SYSTEM' | 'IMPORT' | 'MANUAL') ?? 'SYSTEM',
        mbh: formatMinutes(a.mbhMinutes),
        mfdp: null as string | null,
        base: baseByCrew.get(a.crewId) ?? null,
      }))

      return {
        items,
        composition: compMap,
        status,
      }
    })
  },

  /**
   * Bulk per-flight composition (plan/actual) for a set of flight ids — the gantt-wide
   * companion to getCrewList's single-flight composition. Plan comes from flight_composition
   * (grouped by acting_rank), actual from non-deleted roster_flight (counted by acting_rank).
   * Powers the hover status-bar line and the Flight-pane composition coloring.
   */
  async getCompositions(
    fastify: FastifyInstance,
    flightIds: number[],
  ): Promise<Record<number, Record<string, { plan: number; actual: number }>>> {
    if (flightIds.length === 0) return {}
    const ids = [...new Set(flightIds)].sort((a, b) => a - b)
    const cacheKey = `${CACHE_PREFIX}:compositions:${ids.join(',')}`
    return getOrSet(fastify.redis, cacheKey, CACHE_TTL, async () => {
      const [planRows, actualResult, allRanks] = await Promise.all([
        fastify.db
          .select({
            fltId: flightComposition.fltId,
            actingRank: flightComposition.actingRank,
            plan: sql<number>`sum(${flightComposition.plan})`,
          })
          .from(flightComposition)
          .where(inArray(flightComposition.fltId, ids))
          .groupBy(flightComposition.fltId, flightComposition.actingRank),
        // Same flt resolve + DHD exclusion as getCrewList (8030 grain).
        fastify.db.execute(sql`
          select x.flt_id as "fltId",
                 x.acting_rank as "actingRank",
                 count(distinct x.crew_id)::int as actual
            from (
              select coalesce(rf.flt_id, ps.flt_id) as flt_id,
                     rf.flight_acting_rank as acting_rank,
                     rf.crew_id
                from roster_flight rf
                left join pairing_segment ps
                  on ps.pairing_id = rf.pairing_id
                 and coalesce(ps.is_deleted, 0) = 0
                 and (
                   (rf.flt_id is not null and ps.flt_id = rf.flt_id)
                   or (rf.flt_id is null and ps.flt_id = any(${sql.raw(`ARRAY[${ids.join(',')}]::bigint[]`)}))
                 )
               where coalesce(rf.is_deleted, 0) = 0
                 and rf.pairing_id is not null
                 and rf.assignment_group = 'FLY'
                 and coalesce(rf.flt_id, ps.flt_id) = any(${sql.raw(`ARRAY[${ids.join(',')}]::bigint[]`)})
                 and upper(trim(coalesce(ps.seg_assignment, ''))) not in ('DHD', 'DH')
            ) x
           group by x.flt_id, x.acting_rank
        `),
        rankService.list(fastify),
      ])

      const actualRows =
        ((actualResult as unknown as { rows?: Array<{ fltId: number; actingRank: string; actual: number }> }).rows)
        ?? (Array.isArray(actualResult)
          ? actualResult as Array<{ fltId: number; actingRank: string; actual: number }>
          : [])

      const orderedRanks = allRanks
        .filter(r => r.isActingRank === 1)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(r => r.rank)

      const result: Record<number, Record<string, { plan: number; actual: number }>> = {}
      const ensure = (id: number) => {
        if (!result[id]) {
          result[id] = Object.fromEntries(orderedRanks.map(r => [r, { plan: 0, actual: 0 }]))
        }
        return result[id]
      }

      for (const r of planRows) {
        if (r.fltId == null || !r.actingRank) continue
        const entry = ensure(Number(r.fltId))
        if (entry[r.actingRank] !== undefined) entry[r.actingRank].plan = Number(r.plan) || 0
      }
      for (const r of actualRows) {
        if (r.fltId == null || !r.actingRank) continue
        const entry = ensure(Number(r.fltId))
        if (entry[r.actingRank] !== undefined) entry[r.actingRank].actual = Number(r.actual) || 0
      }
      return result
    })
  },

  /**
   * Distinct pairing ids that USE this flight — i.e. pairings whose segments
   * include it (pairing_segment.flt_id), independent of crew rostering. This is
   * the pairing↔flight link (backed by idx_pair_seg_flt_id), not roster_flight
   * (which is the crew↔flight link used by getCrewList). Backs "Find Pairing by
   * Flight".
   */
  async getPairingIds(fastify: FastifyInstance, flightId: number) {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:pairings:${flightId}`, CACHE_TTL, async () => {
      const rows = await fastify.db
        .selectDistinct({ pairingId: pairingSegment.pairingId })
        .from(pairingSegment)
        .where(and(
          eq(pairingSegment.fltId, flightId),
          notDeleted(pairingSegment.isDeleted),
        ))

      const pairingIds = rows
        .map((r) => r.pairingId)
        .filter((id): id is number => id != null)
        .sort((a, b) => a - b)

      return { pairingIds }
    })
  },
}
