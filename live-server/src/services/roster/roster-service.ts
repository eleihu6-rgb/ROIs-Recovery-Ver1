import { eq, and, between, inArray, asc, sql, SQL, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { isReservedPbsAwardComment } from '../../../../packages/contracts/pbs-award-results.js'
import { rosterFlight } from '../../models/roster/roster-flight.js'
import { pairing as pairingTable } from '../../models/pairing/pairing.js'
import { pairingSegment } from '../../models/pairing/pairing-segment.js'
import { flight as flightTable } from '../../models/flight/flight.js'
import { assignment as assignmentTable } from '../../models/base/assignment.js'
import { pairingComposition } from '../../models/pairing/pairing-composition.js'
import { refreshPairingCompositionFillBulk } from '../../utils/composition-fill.js'
import { getOrSet, getOrSetChunks, invalidate, invalidatePattern } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'
import { notDeleted } from '../../utils/db.js'
import { liveSchema } from '../../utils/db-schema.js'
import { withPrefix } from '../../utils/redis-key-prefix.js'

const CACHE_PREFIX = 'roster:v2'
/** 分片缓存前缀：每个 crew × 版本 × 日期窗口一个分片（roster:chunk:<crewId>:v<ver>:<start>:<end>）。 */
const CHUNK_PREFIX = `${CACHE_PREFIX}:chunk`
/** 每 crew 的分片版本计数器（roster:chunkver:<crewId>）；写操作 INCR，读端把版本编进分片 key。 */
const CHUNK_VER_PREFIX = `${CACHE_PREFIX}:chunkver`
const CACHE_TTL = 600 // 10min
const RESERVED_PBS_AWARD_COMMENT_ERROR = 'Comments cannot use the reserved PBS_AWARD_ prefix.'

export const assertCommentsNamespaceAvailable = (comments: unknown): void => {
  if (isReservedPbsAwardComment(comments)) {
    throw Object.assign(new Error(RESERVED_PBS_AWARD_COMMENT_ERROR), { statusCode: 400 })
  }
}

interface RosterViewQuery {
  crewIds: string[]
  startDate: string
  endDate: string
}

export interface RosterBulkDeleteListQuery {
  startDate: string
  endDate: string
  groupKeys?: string[]
  divisions?: string[]
  bases?: string[]
  crewIds?: string[]
  sources?: string[]
}

export interface RosterBulkDeleteCandidate {
  id: number
  pairingId: number | null
  crewId: string
  source: string | null
  startDt: string
  assignmentGroup: string
  assignment: string | null
  pairingLabel: string | null
  rosterActingRank: string | null
  fltNum: string | null
  depArp: string | null
  arvArp: string | null
}

export interface RosterBulkDeleteGroup {
  mode: 'PAIRED' | 'STANDALONE'
  assignment: string
  assignmentGroup: string
  count: number
}

const parseBulkDeleteGroupKey = (value: string): { mode: 'PAIRED' | 'STANDALONE'; assignmentGroup: string; assignment: string } | null => {
  const [mode, assignmentGroup, assignment] = value.split('\u001f')
  if (mode !== 'PAIRED' && mode !== 'STANDALONE') return null
  return {
    mode,
    assignmentGroup: decodeURIComponent(assignmentGroup ?? ''),
    assignment: decodeURIComponent(assignment ?? ''),
  }
}

/**
 * 写操作后失效受影响 crew 的 roster 分片：**自增**其版本计数器（O(1) INCR/crew），
 * 取代旧的「SCAN + DEL `roster:chunk:<crewId>:*`」按 crew 通配删除。读端把版本号编进
 * 分片 key，版本一变旧分片即不再被引用，靠 TTL（CACHE_TTL）自然过期——重编辑、多 crew、
 * 多日期窗口下不再产生 SCAN 噪音。Redis 故障时 INCR 失败被吞掉，分片 TTL 仍兜底纠正。
 */
const bumpCrewChunkVersions = (fastify: FastifyInstance, crewIds: (string | null | undefined)[]): Promise<void> => {
  const unique = [...new Set(crewIds.filter((c): c is string => !!c))]
  if (unique.length === 0) return Promise.resolve()
  return Promise.all(
    unique.map((cid) => fastify.redis.incr(withPrefix(`${CHUNK_VER_PREFIX}:${cid}`)).catch(() => undefined)),
  ).then(() => undefined)
}

/** 读取各 crew 当前分片版本（缺省/故障 = '0'），用于拼装版本化分片 key。 */
const readCrewChunkVersions = async (
  fastify: FastifyInstance,
  crewIds: string[],
): Promise<Map<string, string>> => {
  if (crewIds.length === 0) return new Map()
  let vers: (string | null)[]
  try {
    vers = await fastify.redis.mGet(crewIds.map((c) => withPrefix(`${CHUNK_VER_PREFIX}:${c}`)))
  } catch {
    vers = crewIds.map(() => null) // Redis 故障 → 全部按版本 0（读端 miss → 回源）
  }
  return new Map(crewIds.map((c, i) => [c, vers[i] ?? '0']))
}

/** crew 无法确定时的兜底（改派但旧 crew 未知）：删除全部 roster 分片（含所有版本）。 */
const invalidateAllChunks = (fastify: FastifyInstance) =>
  invalidatePattern(fastify.redis, `${CHUNK_PREFIX}:*`)

const startMs = (v: unknown): number => {
  if (v == null) return Number.POSITIVE_INFINITY
  const t = new Date(v as string | Date).getTime()
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

export const rosterService = {
  /**
   * Gantt chart data source: get all tasks assigned to specified crew within a date range.
   * Returns both flight tasks (pairingId IS NOT NULL) and ground tasks (pairingId IS NULL).
   * For flight tasks, JOIN pairing_segment to get duty-level info (brief/debrief/rest times).
   */
  async getView(fastify: FastifyInstance, query: RosterViewQuery) {
    const { crewIds, startDate, endDate } = query
    const uniqueCrew = [...new Set(crewIds)]

    // 读各 crew 当前分片版本（缺省 0）。版本编进分片 key → 写操作只需 INCR 版本即让该 crew
    // 的旧分片失效，无需 SCAN/DEL（见 bumpCrewChunkVersions）。
    const verByCrew = await readCrewChunkVersions(fastify, uniqueCrew)

    // R(ver4) 分片缓存：按 crew 复用分片，跨请求只要包含同一 crew 且版本未变即命中
    // （旧实现要求整批 crewIds 完全一致）。未命中 crew 一次性批量回源后按 crew 回填分片。
    const items = await getOrSetChunks<Record<string, unknown>>(
      fastify.redis,
      uniqueCrew,
      (cid) => `${CHUNK_PREFIX}:${cid}:v${verByCrew.get(cid) ?? '0'}:${startDate}:${endDate}`,
      CACHE_TTL,
      async (missCrew) => {
      const startTs = new Date(`${startDate}T00:00:00Z`)
      const endTs = new Date(`${endDate}T23:59:59Z`)

      // LEFT JOIN pairing_segment to get duty-level info for flights with pairingId
      // Match by pairingId + dutySeq + segSeq
      // Use COALESCE so imported flight tasks (sch_str_dt_utc=NULL in roster_flight) are
      // matched via pairing_segment.sch_str_dt_utc.
      const rows = await fastify.db
        .select({
          // P0-1：仅取 gantt DTO 实际消费的 roster_flight 列（而非整表 79 列），
          // 降低 DB 行宽、网络 DB→Node 传输与 Drizzle 对象构造成本。
          roster: {
            id: rosterFlight.id,
            crewId: rosterFlight.crewId,
            pairingId: rosterFlight.pairingId,
            dutySeq: rosterFlight.dutySeq,
            segSeq: rosterFlight.segSeq,
            fltId: rosterFlight.fltId,
            fltDt: rosterFlight.fltDt,
            dutyRefTz: rosterFlight.dutyRefTz,
            base: rosterFlight.base,
            depArp: rosterFlight.depArp,
            arvArp: rosterFlight.arvArp,
            label: rosterFlight.label,
            assignmentGroup: rosterFlight.assignmentGroup,
            assignment: rosterFlight.assignment,
            division: rosterFlight.division,
            flightActingRank: rosterFlight.flightActingRank,
            activeRank: rosterFlight.activeRank,
            comments: rosterFlight.comments,
            source: rosterFlight.source,
            schStrDtUtc: rosterFlight.schStrDtUtc,
            schEndDtUtc: rosterFlight.schEndDtUtc,
            actStrDtUtc: rosterFlight.actStrDtUtc,
            actEndDtUtc: rosterFlight.actEndDtUtc,
            actRestMin: rosterFlight.actRestMin,
            schCreditedMinutes: rosterFlight.schCreditedMinutes,
            actCreditedMinutes: rosterFlight.actCreditedMinutes,
            dpMin: rosterFlight.dpMin,
          },
          // Duty-level fields from pairing_segment with explicit selection
          dutyPickupStartUtc: pairingSegment.pickupStartUtc,
          dutyPickupEndUtc: pairingSegment.pickupEndUtc,
          dutyBriefStartUtc: pairingSegment.briefStartUtc,
          dutyBriefEndUtc: pairingSegment.briefEndUtc,
          dutyDebriefStartUtc: pairingSegment.debriefStartUtc,
          dutyDebriefEndUtc: pairingSegment.debriefEndUtc,
          dutyDropoffStartUtc: pairingSegment.dropoffStartUtc,
          dutyDropoffEndUtc: pairingSegment.dropoffEndUtc,
          dutySchRestMin: pairingSegment.dutySchRestMin,
          dutyActRestMin: pairingSegment.dutyActRestMin,
          segAssignment: pairingSegment.segAssignment,
          // Duty-level credit (minutes). The only populated credit source — roster_flight's own
          // sch/act_credited_minutes are NULL across the dataset — so the roster-pane hover line
          // sources "Credit" from here. Same value for every segment of a duty.
          dutyActCreditedMinutes: pairingSegment.dutyActCreditedMinutes,
          pairingLabel: pairingTable.pairingLabel,
          pairingInterfaceId: pairingTable.interfaceId,
          // Fallback time/identity fields for imported flight tasks missing sch_str_dt_utc
          segSchStrDtUtc: pairingSegment.schStrDtUtc,
          segSchEndDtUtc: pairingSegment.schEndDtUtc,
          segActStrDtUtc: pairingSegment.actStrDtUtc,
          segActEndDtUtc: pairingSegment.actEndDtUtc,
          segFltId: pairingSegment.fltId,
          segFltDt: pairingSegment.fltDt,
          segFltNum: pairingSegment.fltNum,
          segDepArp: pairingSegment.depArp,
          segArvArp: pairingSegment.arvArp,
        })
        .from(rosterFlight)
        .leftJoin(
          pairingSegment,
          and(
            eq(rosterFlight.pairingId, pairingSegment.pairingId),
            eq(rosterFlight.dutySeq, pairingSegment.dutySeq),
            eq(rosterFlight.segSeq, pairingSegment.segSeq),
            notDeleted(pairingSegment.isDeleted),
          ),
        )
        .leftJoin(
          pairingTable,
          and(
            eq(rosterFlight.pairingId, pairingTable.id),
            notDeleted(pairingTable.isDeleted),
          ),
        )
        .where(and(
          notDeleted(rosterFlight.isDeleted),
          inArray(rosterFlight.crewId, missCrew),
          // P0-2：直接按 roster_flight.sch_str_dt_utc 过滤/排序，使复合索引
          // (crew_id, sch_str_dt_utc) 同时用于机组与日期，避免 COALESCE 导致的整段后置过滤
          // （旧实现取回约 2× 行再过滤）。前提：sch_str_dt_utc 始终有值（已核实 NULL=0，
          // 导入侧已回填）；输出 map 仍保留 pairing_segment 兜底以防极端情况。
          between(rosterFlight.schStrDtUtc, startTs, endTs),
        ))
        .orderBy(asc(rosterFlight.schStrDtUtc))

      // R4 性能：返回精简 DTO（仅 gantt 实际消费的字段），而非 roster_flight 全部 79 列。
      // 丢弃 gantt 从不读取的审计/版本/学分/per-diem/训练课程等字段，显著降低负载与
      // 客户端解析成本。/api/roster 仅 gantt 消费（已核实无其他调用方），故安全。
      // duty 级字段（pickup/brief/debrief/dropoff/rest）本就在此显式拼装，不受影响。
      const dtos = rows.map((row) => {
        const { roster, ...dutyFields } = row
        return {
          // 标识与分组
          id: roster.id,
          crewId: roster.crewId,
          pairingId: roster.pairingId,
          pairingLabel: roster.pairingId != null ? dutyFields.pairingLabel ?? null : null,
          pairingInterfaceId: roster.pairingId != null ? dutyFields.pairingInterfaceId ?? null : null,
          dutySeq: roster.dutySeq,
          segSeq: roster.segSeq,
          fltId: roster.fltId ?? dutyFields.segFltId ?? null,
          fltDt: roster.fltDt ?? dutyFields.segFltDt ?? null,
          dutyRefTz: roster.dutyRefTz ?? null,
          // 展示
          base: roster.base,
          depArp: roster.depArp ?? dutyFields.segDepArp ?? null,
          arvArp: roster.arvArp ?? dutyFields.segArvArp ?? null,
          label: roster.label ?? (
            dutyFields.segFltNum && dutyFields.segDepArp && dutyFields.segArvArp
              ? `${dutyFields.segFltNum} ${dutyFields.segDepArp}-${dutyFields.segArvArp}`
              : null
          ),
          assignmentGroup: roster.assignmentGroup,
          assignment: roster.assignment,
          division: roster.division,
          flightActingRank: roster.flightActingRank,
          activeRank: roster.activeRank,
          comments: roster.comments,
          source: roster.source,
          // 时间（带 pairing_segment 兜底）
          schStrDtUtc: roster.schStrDtUtc ?? dutyFields.segSchStrDtUtc ?? null,
          schEndDtUtc: roster.schEndDtUtc ?? dutyFields.segSchEndDtUtc ?? null,
          actStrDtUtc: roster.actStrDtUtc ?? dutyFields.segActStrDtUtc ?? null,
          actEndDtUtc: roster.actEndDtUtc ?? dutyFields.segActEndDtUtc ?? null,
          actRestMin: roster.actRestMin,
          // 注：资历 KPI（ybh/mbh/yal/mal/ydo/mdo）不是 roster_flight 的列，
          // 原响应里本就没有；左面板按 `firstItem?.ybh != null` 兜底，故无需输出。
          // duty 级字段（来自 pairing_segment）
          pickupStartUtc: dutyFields.dutyPickupStartUtc ?? null,
          pickupEndUtc: dutyFields.dutyPickupEndUtc ?? null,
          briefStartUtc: dutyFields.dutyBriefStartUtc ?? null,
          briefEndUtc: dutyFields.dutyBriefEndUtc ?? null,
          debriefStartUtc: dutyFields.dutyDebriefStartUtc ?? null,
          debriefEndUtc: dutyFields.dutyDebriefEndUtc ?? null,
          dropoffStartUtc: dutyFields.dutyDropoffStartUtc ?? null,
          dropoffEndUtc: dutyFields.dutyDropoffEndUtc ?? null,
          dutySchRestMin: dutyFields.dutySchRestMin ?? null,
          dutyActRestMin: dutyFields.dutyActRestMin ?? null,
          dutyActCreditedMinutes: dutyFields.dutyActCreditedMinutes ?? null,
          segAssignment: dutyFields.segAssignment ?? null,
          schCreditedMinutes: roster.schCreditedMinutes ?? null,
          actCreditedMinutes: roster.actCreditedMinutes ?? null,
          dpMin: roster.dpMin ?? null,
        }
      })

        // 按 crew 分组成分片（未命中 crew 即使无数据也建空分片，供 getOrSetChunks 缓存空结果）。
        const byCrew = new Map<string, Record<string, unknown>[]>()
        for (const cid of missCrew) byCrew.set(cid, [])
        for (const d of dtos) byCrew.get(d.crewId as string)?.push(d)
        return byCrew
      },
    )

    // 保持旧契约：全局按 schStrDtUtc 升序（分片是按 crew 分组拼回的）。
    return items.sort((a, b) => startMs(a.schStrDtUtc) - startMs(b.schStrDtUtc))
  },

  async getById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:${id}`, CACHE_TTL, async () => {
      const [row] = await fastify.db
        .select()
        .from(rosterFlight)
        .where(and(eq(rosterFlight.id, id), notDeleted(rosterFlight.isDeleted)))
      return row ?? null
    })
  },

  async create(fastify: FastifyInstance, data: typeof rosterFlight.$inferInsert, username: string) {
    assertCommentsNamespaceAvailable(data.comments)
    const [row] = await fastify.db
      .insert(rosterFlight)
      .values({ ...data, source: data.source ?? 'MA', ...auditCreate(username) })
      .returning()
    await bumpCrewChunkVersions(fastify, [row?.crewId])
    return row
  },

  async update(fastify: FastifyInstance, id: number, data: Partial<typeof rosterFlight.$inferInsert>, username: string) {
    assertCommentsNamespaceAvailable(data.comments)
    const depArp = typeof data.depArp === 'string' ? data.depArp : undefined
    const updateData: Partial<typeof rosterFlight.$inferInsert> = {
      ...data,
      ...(depArp !== undefined ? { base: depArp } : {}),
    }
    const [existing] = await fastify.db
      .select({ source: rosterFlight.source })
      .from(rosterFlight)
      .where(eq(rosterFlight.id, id))
    if (existing?.source === 'IMP') {
      throw Object.assign(new Error('Imported (IMP) tasks cannot be edited; delete and re-create instead'), { statusCode: 409 })
    }
    const [row] = await fastify.db
      .update(rosterFlight)
      .set({ ...updateData, ...auditUpdate(username) })
      .where(eq(rosterFlight.id, id))
      .returning()
    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      // data 改了 crewId（改派）→ 旧 crew 未知，整批兜底；否则按本 crew 精准失效。
      data.crewId !== undefined ? invalidateAllChunks(fastify) : bumpCrewChunkVersions(fastify, [row?.crewId]),
    ])
    return row
  },

  async remove(fastify: FastifyInstance, id: number, username: string) {
    const [row] = await fastify.db
      .update(rosterFlight)
      .set({ isDeleted: 1, ...auditUpdate(username) })
      .where(eq(rosterFlight.id, id))
      .returning()
    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      bumpCrewChunkVersions(fastify, [row?.crewId]),
    ])
    if (row?.pairingId != null) {
      await refreshPairingCompositionFillBulk(fastify.db, [row.pairingId], username)
      await invalidate(fastify.redis,
        `pairing:${row.pairingId}`,
        `pairing:comp:${row.pairingId}`,
        `pairing:crewids:${row.pairingId}`,
        `pairing:crewdetail:${row.pairingId}`,
      )
    }
    return row
  },

  async listBulkDeleteCandidates(
    fastify: FastifyInstance,
    query: RosterBulkDeleteListQuery,
  ): Promise<{ groups: RosterBulkDeleteGroup[]; rows: RosterBulkDeleteCandidate[] }> {
    const filterParams: unknown[] = [query.startDate, query.endDate]
    const groupFilters = (query.groupKeys ?? []).map(parseBulkDeleteGroupKey).filter((v): v is NonNullable<typeof v> => v !== null)
    const modeExpr = "case when coalesce(rf.pairing_id, 0) > 0 then 'PAIRED' else 'STANDALONE' end"
    const groupingAssignmentExpr = "case when coalesce(rf.pairing_id, 0) > 0 then coalesce(p.assignment, '') else coalesce(rf.assignment, '') end"
    const localStartDateExpr = "(((rf.sch_str_dt_utc at time zone 'UTC') at time zone coalesce(valid_timezone.name, 'UTC'))::date)"
    const crewFilter = [
      ...(query.divisions?.length
        ? [`and upper(coalesce(c.division, '')) = any($${filterParams.push(query.divisions.map((v) => v.trim().toUpperCase()).filter(Boolean))}::text[])`]
        : []),
      ...(query.bases?.length
        ? [`and upper(coalesce(cb.base, '')) = any($${filterParams.push(query.bases.map((v) => v.trim().toUpperCase()).filter(Boolean))}::text[])`]
        : []),
      ...(query.crewIds?.length
        ? [`and upper(rf.crew_id) = any($${filterParams.push(query.crewIds.map((v) => v.trim().toUpperCase()).filter(Boolean))}::text[])`]
        : []),
      ...(query.sources?.length
        ? [`and upper(coalesce(rf.source, '')) = any($${filterParams.push(query.sources.map((v) => v.trim().toUpperCase()).filter(Boolean))}::text[])`]
        : []),
    ].join('\n        ')
    const rowsParams = [...filterParams]
    const groupFilter = groupFilters.length > 0
      ? `and (${modeExpr}, coalesce(rf.assignment_group, ''), ${groupingAssignmentExpr}) in (${groupFilters.map((g) => `($${rowsParams.push(g.mode)}::text, $${rowsParams.push(g.assignmentGroup)}::text, $${rowsParams.push(g.assignment)}::text)`).join(', ')})`
      : ''

    const baseSql = `
      from ${liveSchema()}.roster_flight rf
      left join ${liveSchema()}.pairing p
        on p.id = rf.pairing_id and coalesce(p.is_deleted, 0) = 0
      left join ${liveSchema()}.pairing_segment ps
        on ps.pairing_id = rf.pairing_id
       and ps.duty_seq is not distinct from rf.duty_seq
       and ps.seg_seq is not distinct from rf.seg_seq
       and coalesce(ps.is_deleted, 0) = 0
      left join ${liveSchema()}.flight f
        on f.id = rf.flt_id and coalesce(f.is_deleted, 0) = 0
      left join ${liveSchema()}.crew c
        on c.crew_id = rf.crew_id
      left join lateral (
        select cb.base
        from ${liveSchema()}.crew_base cb
        where cb.crew_id = rf.crew_id
          and cb.eff_dt <= rf.sch_str_dt_utc
          and (cb.exp_dt is null or cb.exp_dt > rf.sch_str_dt_utc)
        order by cb.eff_dt desc
        limit 1
      ) cb on true
      left join ${liveSchema()}.airport a
        on a.airport = coalesce(cb.base, rf.base)
      left join pg_timezone_names valid_timezone
        on valid_timezone.name = nullif(btrim(a.zone_id), '')
      where coalesce(rf.is_deleted, 0) = 0
        and rf.sch_str_dt_utc >= ($1::date - interval '2 day')
        and rf.sch_str_dt_utc < ($2::date + interval '3 day')
        and ${localStartDateExpr} >= $1::date
        and ${localStartDateExpr} < ($2::date + interval '1 day')
        ${crewFilter}
    `

    const groupsResult = await fastify.pgPool.query<{
      mode: 'PAIRED' | 'STANDALONE'
      assignment: string | null
      assignment_group: string | null
      count: string
    }>(`
      select
        ${modeExpr} as mode,
        ${groupingAssignmentExpr} as assignment,
        coalesce(rf.assignment_group, '') as assignment_group,
        count(*)::text as count
      ${baseSql}
      group by
        ${modeExpr},
        ${groupingAssignmentExpr},
        coalesce(rf.assignment_group, '')
      order by mode, assignment_group, assignment
    `, filterParams)

    const rowsResult = groupFilters.length === 0
      ? { rows: [] as Array<{
        id: string
        pairing_id: string | null
        crew_id: string
        source: string | null
        start_dt: string
        assignment_group: string | null
        assignment: string | null
        pairing_label: string | null
        roster_acting_rank: string | null
        flt_num: string | null
        dep_arp: string | null
        arv_arp: string | null
      }> }
      : await fastify.pgPool.query<{
        id: string
        pairing_id: string | null
        crew_id: string
        source: string | null
        start_dt: string
        assignment_group: string | null
        assignment: string | null
        pairing_label: string | null
        roster_acting_rank: string | null
        flt_num: string | null
        dep_arp: string | null
        arv_arp: string | null
      }>(`
        select
          rf.id::text as id,
          rf.pairing_id::text as pairing_id,
          rf.crew_id,
          rf.source,
          to_char(((rf.sch_str_dt_utc at time zone 'UTC') at time zone coalesce(valid_timezone.name, 'UTC'))::date, 'YYYY-MM-DD') as start_dt,
          coalesce(rf.assignment_group, '') as assignment_group,
          case when coalesce(rf.pairing_id, 0) > 0 then p.assignment else rf.assignment end as assignment,
          case
            when coalesce(rf.pairing_id, 0) > 0 then p.pairing_label
            else rf.label
          end as pairing_label,
          rf.roster_acting_rank,
          coalesce(ps.flt_num, f.flt_num, nullif(rf.assignment, '')) as flt_num,
          coalesce(rf.dep_arp, ps.dep_arp, f.dep_arp) as dep_arp,
          coalesce(rf.arv_arp, ps.arv_arp, f.arv_arp) as arv_arp
        ${baseSql}
        ${groupFilter}
        order by rf.assignment_group nulls last, assignment nulls last, rf.crew_id, rf.sch_str_dt_utc, rf.id
      `, rowsParams)

    return {
      groups: groupsResult.rows.map((r) => ({
        mode: r.mode,
        assignment: r.assignment ?? '',
        assignmentGroup: r.assignment_group ?? '',
        count: Number(r.count) || 0,
      })),
      rows: rowsResult.rows.map((r) => ({
        id: Number(r.id),
        pairingId: r.pairing_id == null ? null : Number(r.pairing_id),
        crewId: r.crew_id,
        source: r.source,
        startDt: r.start_dt,
        assignmentGroup: r.assignment_group ?? '',
        assignment: r.assignment,
        pairingLabel: r.pairing_label,
        rosterActingRank: r.roster_acting_rank,
        fltNum: r.flt_num,
        depArp: r.dep_arp,
        arvArp: r.arv_arp,
      })),
    }
  },

  async bulkRemove(
    fastify: FastifyInstance,
    ids: number[],
    pairingCrewKeys: Array<{ pairingId: number; crewId: string }>,
    username: string,
  ) {
    const uniqueIds = [...new Set(ids)]
    const uniquePairingCrew = [...new Map(pairingCrewKeys.map((p) => [`${p.pairingId}:${p.crewId}`, p])).values()]
    if (uniqueIds.length === 0 && uniquePairingCrew.length === 0) {
      return { deleted: 0, crewIds: [] as string[], pairingIds: [] as number[], firstSchStrDtUtc: null as Date | null, lastSchStrDtUtc: null as Date | null }
    }
    const params: unknown[] = [uniqueIds, username]
    const pairingCrewFilter = uniquePairingCrew.length > 0
      ? `or (pairing_id, crew_id) in (${uniquePairingCrew.map((p) => `($${params.push(p.pairingId)}::bigint, $${params.push(p.crewId)}::text)`).join(', ')})`
      : ''
    // Aggregate inside PostgreSQL so a large delete does not send one full row per
    // roster entry through the DB driver. Keep IDs for the per-row cache keys, but
    // return only the small summary needed by the worker for Manday/recheck.
    const result = await fastify.pgPool.query<{
      deleted_ids: string[] | null
      crew_ids: string[] | null
      pairing_ids: string[] | null
      deleted: string
      first_sch_str_dt_utc: Date | null
      last_sch_str_dt_utc: Date | null
    }>(`
      with updated as (
        update ${liveSchema()}.roster_flight
        set is_deleted = 1, updated_by = $2, updated_at = now()
        where (id = any($1::bigint[]) ${pairingCrewFilter})
          and coalesce(is_deleted, 0) = 0
        returning id, crew_id, pairing_id, sch_str_dt_utc
      )
      select
        coalesce(array_agg(id::text), '{}') as deleted_ids,
        coalesce(array_agg(distinct crew_id) filter (where crew_id is not null), '{}') as crew_ids,
        coalesce(array_agg(distinct pairing_id) filter (where pairing_id is not null), '{}') as pairing_ids,
        count(*)::text as deleted,
        min(sch_str_dt_utc) as first_sch_str_dt_utc,
        max(sch_str_dt_utc) as last_sch_str_dt_utc
      from updated
    `, params)

    const summary = result.rows[0]
    const deletedIds = summary?.deleted_ids ?? []
    const crewIds = summary?.crew_ids ?? []
    const pairingIds = (summary?.pairing_ids ?? []).map(Number).filter(Number.isFinite)
    await Promise.all([
      invalidate(fastify.redis, ...deletedIds.map((id) => `${CACHE_PREFIX}:${id}`)),
      bumpCrewChunkVersions(fastify, crewIds),
    ])

    return {
      deleted: Number(summary?.deleted ?? 0),
      crewIds,
      pairingIds,
      firstSchStrDtUtc: summary?.first_sch_str_dt_utc ?? null,
      lastSchStrDtUtc: summary?.last_sch_str_dt_utc ?? null,
    }
  },

  /**
   * Swap tasks between two crew members. Must run in a transaction.
   * Swaps all roster_flight entries for two specific task IDs.
   */
  async swap(fastify: FastifyInstance, taskIdA: number, taskIdB: number, username: string) {
    const result = await fastify.db.transaction(async (tx) => {
      const [[taskA], [taskB]] = await Promise.all([
        tx.select().from(rosterFlight).where(and(eq(rosterFlight.id, taskIdA), notDeleted(rosterFlight.isDeleted))),
        tx.select().from(rosterFlight).where(and(eq(rosterFlight.id, taskIdB), notDeleted(rosterFlight.isDeleted))),
      ])

      if (!taskA || !taskB) {
        throw new Error('One or both tasks not found')
      }
      if (taskA.source === 'IMP' || taskB.source === 'IMP') {
        throw Object.assign(new Error('Imported (IMP) tasks cannot be swapped'), { statusCode: 409 })
      }

      const audit = auditUpdate(username)

      // Swap crew assignments
      const [updatedA] = await tx
        .update(rosterFlight)
        .set({ crewId: taskB.crewId, isSwapped: 1, ...audit })
        .where(eq(rosterFlight.id, taskIdA))
        .returning()

      const [updatedB] = await tx
        .update(rosterFlight)
        .set({ crewId: taskA.crewId, isSwapped: 1, ...audit })
        .where(eq(rosterFlight.id, taskIdB))
        .returning()

      return { taskA: updatedA, taskB: updatedB }
    })

    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${taskIdA}`, `${CACHE_PREFIX}:${taskIdB}`),
      // 互换涉及的两个 crew（result 里已是换好后的归属，覆盖两侧）。
      bumpCrewChunkVersions(fastify, [result.taskA?.crewId, result.taskB?.crewId]),
    ])

    return result
  },

  /**
   * Move a task from one crew to another. Must run in a transaction.
   */
  async move(fastify: FastifyInstance, taskId: number, targetCrewId: string, username: string) {
    let sourceCrewId: string | undefined
    const result = await fastify.db.transaction(async (tx) => {
      const [task] = await tx
        .select()
        .from(rosterFlight)
        .where(and(eq(rosterFlight.id, taskId), notDeleted(rosterFlight.isDeleted)))

      if (!task) {
        throw new Error('Task not found')
      }
      if (task.source === 'IMP') {
        throw Object.assign(new Error('Imported (IMP) tasks cannot be moved'), { statusCode: 409 })
      }
      sourceCrewId = task.crewId

      const audit = auditUpdate(username)

      const [updated] = await tx
        .update(rosterFlight)
        .set({ crewId: targetCrewId, ...audit })
        .where(eq(rosterFlight.id, taskId))
        .returning()

      return updated
    })

    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${taskId}`),
      // 改派涉及源 crew 与目标 crew 两侧。
      bumpCrewChunkVersions(fastify, [sourceCrewId, targetCrewId]),
    ])

    // Expose the source crew so callers can recompute BOTH sides' CrewManday
    // (the source lost the task, the target gained it).
    return { ...result, sourceCrewId }
  },

  /**
   * Assign a pairing to a crew member.
   * Creates roster_flight entries directly from pairing + pairing_segment source data.
   * One roster_flight row per segment in the pairing.
   * Returns roster entries with duty-level fields (pickup/brief/debrief/dropoff/rest) for rendering.
   */
  async assignPairing(fastify: FastifyInstance, pairingId: number, crewId: string, rosterActingRank: string, username: string) {
    const result = await fastify.db.transaction(async (tx) => {
      // 1. Load pairing header
      const [pair] = await tx
        .select()
        .from(pairingTable)
        .where(and(eq(pairingTable.id, pairingId), notDeleted(pairingTable.isDeleted)))

      if (!pair) {
        throw new Error(`Pairing #${pairingId} not found`)
      }

      // 2. Check if crew already has this pairing
      const [existing] = await tx
        .select({ id: rosterFlight.id })
        .from(rosterFlight)
        .where(and(
          eq(rosterFlight.pairingId, pairingId),
          eq(rosterFlight.crewId, crewId),
          notDeleted(rosterFlight.isDeleted),
        ))
        .limit(1)

      if (existing) {
        throw new Error(`Crew ${crewId} already has pairing #${pairingId}`)
      }

      // 3. Load all segments for this pairing
      const segments = await tx
        .select()
        .from(pairingSegment)
        .where(and(eq(pairingSegment.pairingId, pairingId), notDeleted(pairingSegment.isDeleted)))
        .orderBy(asc(pairingSegment.dutySeq), asc(pairingSegment.segSeq))

      if (segments.length === 0) {
        throw new Error(`Pairing #${pairingId} has no segments`)
      }

      // 4. Create one roster_flight per segment — batch insert (single statement)
      //    instead of N sequential inserts inside the transaction.
      const audit = auditCreate(username)
      const insertValues = segments.map((seg) => ({
        crewId,
        pairingId,
        base: pair.base,
        label: `${seg.fltNum} ${seg.depArp}-${seg.arvArp}`,
        assignmentGroup: pair.assignmentGroup ?? 'FLT',
        assignment: seg.segAssignment ?? pair.assignment,
        role: 'CREW',
        division: pair.division,
        flightActingRank: rosterActingRank,
        rosterActingRank,
        fltId: seg.fltId,
        fltDt: seg.fltDt,
        dutySeq: seg.dutySeq,
        segSeq: seg.segSeq,
        schStrDtUtc: seg.schStrDtUtc,
        schEndDtUtc: seg.schEndDtUtc,
        actStrDtUtc: seg.actStrDtUtc,
        actEndDtUtc: seg.actEndDtUtc,
        schCreditedMinutes: seg.schCreditedMinutesSeg,
        schFmCreditedMinutes: seg.schFmCreditedMinutesSeg,
        // Flight task rest: from pairing_segment.duty_act_rest_min (persisted to roster_flight)
        actRestMin: seg.dutyActRestMin ?? null,
        source: 'MA',
        ...audit,
      }))

      const newTasks = await tx.insert(rosterFlight).values(insertValues).returning()

      // Merge duty-level fields from each pairing_segment into the returned roster item
      // (lets the frontend immediately render pickup/brief/debrief/dropoff).
      // INSERT ... RETURNING preserves the VALUES order, so newTasks[i] ↔ segments[i].
      const created = newTasks.map((newTask, i) => {
        const seg = segments[i]
        return {
          ...newTask,
          pickupStartUtc: seg.pickupStartUtc,
          pickupEndUtc: seg.pickupEndUtc,
          briefStartUtc: seg.briefStartUtc,
          briefEndUtc: seg.briefEndUtc,
          debriefStartUtc: seg.debriefStartUtc,
          debriefEndUtc: seg.debriefEndUtc,
          dropoffStartUtc: seg.dropoffStartUtc,
          dropoffEndUtc: seg.dropoffEndUtc,
          segAssignment: seg.segAssignment,
        } as typeof rosterFlight.$inferSelect & Record<string, unknown>
      })

      return created
    })

    await bumpCrewChunkVersions(fastify, [crewId])

    // Refresh every rank for the pairing. A stale fill on another rank must also be
    // corrected (e.g. CA assigned while an old FO fill incorrectly says full).
    await refreshPairingCompositionFillBulk(fastify.db, [pairingId], username)
      .catch((err) => fastify.log.error(err, 'refreshPairingCompositionFill failed after assignPairing'))
    // Invalidate pairing caches so fill reflects immediately
    await Promise.all([
      invalidate(fastify.redis, `pairing:${pairingId}`),
      invalidate(fastify.redis, `pairing:comp:${pairingId}`),
      invalidate(fastify.redis, `pairing:crewids:${pairingId}`, `pairing:crewdetail:${pairingId}`),
    ])

    return result
  },

  async assignFlight(fastify: FastifyInstance, flightId: number, crewId: string, username: string) {
    const result = await fastify.db.transaction(async (tx) => {
      // 1. Load the flight
      const [flt] = await tx
        .select()
        .from(flightTable)
        .where(and(eq(flightTable.id, flightId), notDeleted(flightTable.isDeleted)))

      if (!flt) {
        throw new Error(`Flight #${flightId} not found`)
      }

      // 2. Check if crew already has this flight assigned (via fltId)
      const [existing] = await tx
        .select({ id: rosterFlight.id })
        .from(rosterFlight)
        .where(and(
          eq(rosterFlight.fltId, flightId),
          eq(rosterFlight.crewId, crewId),
          notDeleted(rosterFlight.isDeleted),
        ))
        .limit(1)

      if (existing) {
        throw new Error(`Crew ${crewId} already has flight #${flightId} assigned`)
      }

      // 3. Create roster entry for this flight
      const audit = auditCreate(username)
      const label = `${flt.fltNum} ${flt.depArp}-${flt.arvArp}`

      const [newTask] = await tx
        .insert(rosterFlight)
        .values({
          crewId,
          pairingId: null,         // standalone flight, no pairing (NULL, not 0)
          base: flt.depArp,      // use departure airport as base
          label,
          assignmentGroup: 'FLT',
          assignment: flt.fltNum,
          role: 'CREW',
          division: null,
          flightActingRank: '',
          fltId: flt.id,
          fltDt: String(flt.fltDt),
          dutySeq: 1,
          segSeq: 1,
          schStrDtUtc: flt.schDepDtUtc,
          schEndDtUtc: flt.schArvDtUtc,
          actStrDtUtc: flt.actDepDtUtc ?? null,
          actEndDtUtc: flt.actArvDtUtc ?? null,
          schCreditedMinutes: String(flt.blkMin),
          schFmCreditedMinutes: null,
          source: 'MA',
          ...audit,
        })
        .returning()

      return newTask
    })

    await bumpCrewChunkVersions(fastify, [crewId])

    return result
  },

  /**
   * Create ground task roster entries for one or more crew members in a single transaction.
   * Ground tasks always have pairing_id = NULL.
   * act_rest_min is copied from assignment.rest_time.
   * Base is kept as a compatibility field and follows depArp for ground tasks.
   */
  async createGroundTask(
    fastify: FastifyInstance,
    data: {
      crewIds: string[]
      assignment: string
      depArp: string
      arvArp: string
      startDtUtc: string
      endDtUtc: string
      comments?: string
      creditMin?: number | null
      dpMin?: number | null
    },
    username: string,
  ) {
    assertCommentsNamespaceAvailable(data.comments)
    const startDate = new Date(data.startDtUtc)
    const endDate = new Date(data.endDtUtc)

    const result = await fastify.db.transaction(async (tx) => {
      // 1. Load assignment → get default_assignment_group and rest_time
      const [assign] = await tx
        .select({
        assignment: assignmentTable.assignment,
        defaultAssignmentGroup: assignmentTable.defaultAssignmentGroup,
        restTime: assignmentTable.restTime,
        fixedCreditMin: assignmentTable.fixedCreditMin,
        dpPct: assignmentTable.dpPct,
        })
        .from(assignmentTable)
        .where(eq(assignmentTable.assignment, data.assignment))

      if (!assign) {
        throw new Error(`Assignment '${data.assignment}' not found`)
      }

      // 2. Idempotency guard: skip crew that ALREADY have an identical active ground task
      //    (same assignment + window, pairingId null). A draft Save that partially fails
      //    leaves the add-ground-task op queued; retrying re-calls this with the same input.
      //    Without this guard every retry inserted fresh rows → stacked, un-deletable
      //    duplicate DOs (mirrors the existing assignPairing/addFlightToPairing dup-check).
      const existing = await tx
        .select({ crewId: rosterFlight.crewId })
        .from(rosterFlight)
        .where(
          and(
            inArray(rosterFlight.crewId, data.crewIds),
            isNull(rosterFlight.pairingId),
            eq(rosterFlight.assignment, assign.assignment),
            eq(rosterFlight.depArp, data.depArp),
            eq(rosterFlight.arvArp, data.arvArp),
            eq(rosterFlight.schStrDtUtc, startDate),
            eq(rosterFlight.schEndDtUtc, endDate),
            notDeleted(rosterFlight.isDeleted),
          ),
        )
      const existingCrew = new Set(existing.map((r) => r.crewId))
      const crewToInsert = data.crewIds.filter((crewId) => !existingCrew.has(crewId))

      // All requested crew already have the task → nothing to insert (avoids empty VALUES).
      if (crewToInsert.length === 0) return []

      // 3. Batch insert all rows in one statement
      const audit = auditCreate(username)
      const creditedMinutes = data.creditMin ?? assign.fixedCreditMin
      const durationMin = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000))
      const defaultDpMin = Math.round(durationMin * Number(assign.dpPct ?? 0))
      const dpMin = data.dpMin == null ? defaultDpMin : Math.max(0, Math.round(data.dpMin))
      const rows = crewToInsert.map((crewId) => ({
        crewId,
        pairingId: null,
        base: data.depArp,
        depArp: data.depArp,
        arvArp: data.arvArp,
        assignmentGroup: assign.defaultAssignmentGroup ?? 'GND',
        assignment: assign.assignment,
        flightActingRank: '',
        schStrDtUtc: startDate,
        schEndDtUtc: endDate,
        comments: data.comments ?? null,
        actRestMin: assign.restTime ?? null,
        schCreditedMinutes: creditedMinutes != null ? String(creditedMinutes) : null,
        actCreditedMinutes: creditedMinutes != null ? String(creditedMinutes) : null,
        dpMin,
        source: 'MA' as const,
        ...audit,
      }))

      return tx.insert(rosterFlight).values(rows).returning()
    })

    await bumpCrewChunkVersions(fastify, data.crewIds)
    return result
  },

  /**
   * Remove all roster entries for a specific pairing + crew combination.
   * Used when deleting an entire pairing assignment from a crew's roster.
   */
  async removeByPairingAndCrew(fastify: FastifyInstance, pairingId: number, crewId: string, username: string) {
    // Capture the roster_acting_rank values before soft-deleting
    const tasks = await fastify.db
      .select({ id: rosterFlight.id, rosterActingRank: rosterFlight.rosterActingRank })
      .from(rosterFlight)
      .where(and(
        eq(rosterFlight.pairingId, pairingId),
        eq(rosterFlight.crewId, crewId),
        notDeleted(rosterFlight.isDeleted),
      ))

    if (tasks.length === 0) return []

    const audit = auditUpdate(username)
    const deleted = await fastify.db
      .update(rosterFlight)
      .set({ isDeleted: 1, ...audit })
      .where(and(
        eq(rosterFlight.pairingId, pairingId),
        eq(rosterFlight.crewId, crewId),
        notDeleted(rosterFlight.isDeleted),
      ))
      .returning()

    await bumpCrewChunkVersions(fastify, [crewId])

    // Refresh every rank so stale fills on untouched ranks are corrected too.
    await refreshPairingCompositionFillBulk(fastify.db, [pairingId], username)
      .catch((err) => fastify.log.error(err, 'refreshPairingCompositionFill failed after removeByPairingAndCrew'))
    // Invalidate pairing caches so fill reflects immediately
    await Promise.all([
      invalidate(fastify.redis, `pairing:${pairingId}`),
      invalidate(fastify.redis, `pairing:comp:${pairingId}`),
    ])

    return deleted
  },
}
