import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { baseService } from '../../services/base/base-service.js'
import { crewDepartmentService } from '../../services/base/crew-department-service.js'
import { divisionService } from '../../services/base/division-service.js'
import { rankService } from '../../services/base/rank-service.js'
import { fleetService } from '../../services/base/fleet-service.js'
import { aircraftService } from '../../services/base/aircraft-service.js'
import { airportService } from '../../services/base/airport-service.js'
import { dictionaryService } from '../../services/base/dictionary-service.js'
import { compositionService } from '../../services/base/composition-service.js'
import { crewService } from '../../services/crew/crew-service.js'
import { crewBaseService } from '../../services/crew/crew-base-service.js'
import { crewRankService } from '../../services/crew/crew-rank-service.js'
import { crewFleetService } from '../../services/crew/crew-fleet-service.js'
import { crewQualificationService } from '../../services/crew/crew-qual-service.js'
import { crewTeamService } from '../../services/crew/crew-team-service.js'
import { crewStatusService } from '../../services/crew/crew-status-service.js'
import { crewCertificateService, crewLicenseService, crewLanguageService } from '../../services/crew/crew-cert-service.js'
import { crewEntitlementService } from '../../services/crew/crew-entitlement-service.js'
import { crewMemoService, crewSeniorityService } from '../../services/crew/crew-memo-service.js'
import { crewKpiAdjust } from '../../models/crew/crew-memo.js'
import { eq } from 'drizzle-orm'
import { qualification } from '../../models/base/qualification.js'
import { holiday as holidayTable } from '../../models/base/holiday.js'
import { assignment, assignmentGroup, assignmentGroupMap } from '../../models/base/assignment.js'
import { team } from '../../models/base/base.js'
import { dataValidationService } from '../../services/data/data-validation-service.js'
import { dataSaveService } from '../../services/data/data-save-service.js'
import { rosterPeriodService } from '../../services/base/roster-period-service.js'
import { rosterPeriodConfig } from '../../models/base/roster-period.js'

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

const ALLOWED_CATALOG: { pageId: string; entityId: string; label: string }[] = [
  { pageId: 'basic.org-base',        entityId: 'base',               label: 'Base' },
  { pageId: 'basic.org-base',        entityId: 'department',         label: 'Department' },
  { pageId: 'basic.org-base',        entityId: 'division',           label: 'Division' },
  { pageId: 'basic.rank',            entityId: 'rank',               label: 'Rank' },
  { pageId: 'basic.fleet-aircraft',  entityId: 'fleet',              label: 'Fleet' },
  { pageId: 'basic.fleet-aircraft',  entityId: 'aircraft',           label: 'Aircraft' },
  { pageId: 'basic.location-route',  entityId: 'airport',            label: 'Airport' },
  { pageId: 'basic.assignment',      entityId: 'assignment',           label: 'Assignment' },
  { pageId: 'basic.assignment',      entityId: 'assignment_group',     label: 'Assignment Group' },
  { pageId: 'basic.assignment',      entityId: 'assignment_group_map', label: 'Assignment Group Map' },
  { pageId: 'basic.qualification',   entityId: 'qualification',      label: 'Qualification' },
  { pageId: 'basic.composition',     entityId: 'composition',        label: 'Composition' },
  { pageId: 'basic.composition',     entityId: 'composition_rank',   label: 'Composition Rank' },
  { pageId: 'basic.composition',     entityId: 'composition_load',   label: 'Composition Load' },
  { pageId: 'basic.config-dictionary', entityId: 'dictionary',       label: 'Dictionary' },
  { pageId: 'basic.holiday',         entityId: 'holiday',            label: 'Holiday' },
  { pageId: 'crew.master',           entityId: 'crew',               label: 'Crew Basic' },
  { pageId: 'crew.master',           entityId: 'crew_base',          label: 'Crew Base' },
  { pageId: 'crew.master',           entityId: 'crew_rank',          label: 'Crew Rank' },
  { pageId: 'crew.master',           entityId: 'crew_fleet',         label: 'Crew Fleet' },
  { pageId: 'crew.master',           entityId: 'crew_qualification', label: 'Crew Qualification' },
  { pageId: 'crew.master',           entityId: 'crew_team',          label: 'Crew Team' },
  { pageId: 'crew.master',           entityId: 'crew_status',        label: 'Crew Status' },
  { pageId: 'crew.master',           entityId: 'crew_certificate',   label: 'Crew Certificate' },
  { pageId: 'crew.master',           entityId: 'crew_license',       label: 'Crew License' },
  { pageId: 'crew.master',           entityId: 'crew_language',      label: 'Crew Language' },
  { pageId: 'crew.master',           entityId: 'crew_entitlement',   label: 'Crew Entitlement' },
  { pageId: 'crew.master',           entityId: 'crew_memo',          label: 'Crew Memo' },
  { pageId: 'crew.master',           entityId: 'crew_seniority',     label: 'Crew Seniority' },
  { pageId: 'crew.master',           entityId: 'crew_kpi_adjust',    label: 'Crew KPI Adjust' },
  { pageId: 'basic.roster-period',   entityId: 'roster_period',      label: 'Roster Period' },
  { pageId: 'basic.roster-period',   entityId: 'roster_period_config', label: 'Roster Period Config' },
]

const ALLOWED_ENTITY_IDS = new Set(ALLOWED_CATALOG.map((c) => c.entityId))

// ---------------------------------------------------------------------------
// Expiry filter helper
// ---------------------------------------------------------------------------

interface ExpiryFilter {
  mode: string
  referenceDate: string
  days?: number
  from?: string
  to?: string
}

function applyExpiryFilter<T extends { expDt?: Date | null; effDt?: Date | null }>(
  rows: T[],
  expiry: ExpiryFilter,
): T[] {
  const refDate = new Date(expiry.referenceDate)
  if (expiry.mode === 'current') {
    return rows.filter((r) => !r.expDt || r.expDt >= refDate)
  }
  if (expiry.mode === 'expired') {
    return rows.filter((r) => r.expDt && r.expDt < refDate)
  }
  if (expiry.mode === 'expiring_in_days' && expiry.days) {
    const cutoff = new Date(refDate)
    cutoff.setDate(cutoff.getDate() + expiry.days)
    return rows.filter((r) => r.expDt && r.expDt >= refDate && r.expDt <= cutoff)
  }
  if (expiry.mode === 'range' && expiry.from && expiry.to) {
    const from = new Date(expiry.from)
    const to = new Date(expiry.to)
    return rows.filter((r) => r.expDt && r.expDt >= from && r.expDt <= to)
  }
  return rows
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const referenceOptionsQuerySchema = z.object({
  entityId: z.string(),
})

const tableBodySchema = z.object({
  pageId: z.string(),
  entityId: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(0).max(10000).default(50),
  filters: z.record(z.unknown()).optional(),
  expiry: z
    .object({
      scope: z
        .enum([
          'all',
          'base',
          'rank',
          'fleet',
          'qualification',
          'team',
          'status',
          'certificate',
          'license',
          'language',
          'entitlement',
          'profile',
        ])
        .optional(),
      mode: z.enum(['current', 'expired', 'expiring_in_days', 'range']),
      referenceDate: z.string(),
      days: z.number().int().positive().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional(),
})

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export default async function dataRoutes(fastify: FastifyInstance) {
  // GET /api/data/catalog
  fastify.get('/catalog', async (_request, reply) => {
    return success(reply, ALLOWED_CATALOG)
  })

  // GET /api/data/reference-options?entityId=xxx
  fastify.get('/reference-options', async (request, reply) => {
    const { entityId } = referenceOptionsQuerySchema.parse(request.query)

    switch (entityId) {
      case 'base': {
        const rows = await baseService.list(fastify)
        return success(
          reply,
          rows.map((b) => ({ value: b.base, label: b.name || b.base })),
        )
      }
      case 'rank': {
        const rows = await rankService.list(fastify)
        return success(
          reply,
          rows.map((r) => ({ value: r.rank, label: r.description || r.rank })),
        )
      }
      case 'fleet': {
        const rows = await fleetService.list(fastify)
        return success(
          reply,
          rows.map((f) => ({ value: f.fleet, label: f.description || f.fleet })),
        )
      }
      case 'qualification': {
        const rows = await fastify.db.select().from(qualification).execute()
        return success(
          reply,
          rows.map((q) => ({ value: q.qualification, label: q.description || q.qualification })),
        )
      }
      case 'team': {
        const rows = await fastify.db.select().from(team).execute()
        return success(
          reply,
          rows.map((t) => ({ value: t.team, label: t.description || t.team })),
        )
      }
      case 'composition': {
        const rows = await compositionService.list(fastify)
        return success(
          reply,
          rows.map((c) => ({ value: String(c.id), label: c.name })),
        )
      }
      default:
        return fail(reply, 400, 'Unknown reference entity')
    }
  })

  // POST /api/data/save
  fastify.post('/save', async (request, reply) => {
    const body = z.object({
      changes: z.array(z.object({
        clientChangeId: z.string(),
        entityId: z.string(),
        action: z.enum(['create', 'update', 'expire', 'delete']),
        rowId: z.number().int().optional(),
        crewId: z.string().optional(),
        before: z.record(z.unknown()).optional(),
        after: z.record(z.unknown()),
      }))
    }).parse(request.body)

    const userId = (request as { authUser?: { userCode?: string } }).authUser?.userCode ?? 'system'
    try {
      const result = await dataSaveService.save(fastify, body.changes, userId)

      if (result.committed === 0 && result.issues.some((i) => i.severity === 'error')) {
        return fail(reply, 422, 'Validation failed')
      }
      return success(reply, result)
    } catch (err) {
      const code = (err as { code?: unknown } | null)?.code
      if (code === '23503') {
        const deleteChange = body.changes.find((change) => change.action === 'delete')
        const entityId = deleteChange?.entityId ?? 'unknown'
        const rowId = deleteChange?.rowId ?? null
        const message = 'Delete blocked because the record is still referenced by business data'
        return reply.code(409).send({
          code: 409,
          data: {
            entityId,
            rowId,
            references: [],
          },
          message,
        })
      }
      throw err
    }
  })

  // POST /api/data/validate
  fastify.post('/validate', async (request, reply) => {
    const body = z.object({
      changes: z.array(z.object({
        clientChangeId: z.string(),
        entityId: z.string(),
        action: z.enum(['create', 'update', 'expire', 'delete']),
        rowId: z.number().int().optional(),
        crewId: z.string().optional(),
        before: z.record(z.unknown()).optional(),
        after: z.record(z.unknown()),
      }))
    }).parse(request.body)

    const issues = await dataValidationService.validate(fastify, body.changes)
    return success(reply, issues)
  })

  // POST /api/data/table
  fastify.post('/table', async (request, reply) => {
    const body = tableBodySchema.parse(request.body)
    const { pageId, entityId, page, pageSize, filters = {}, expiry } = body

    // Determine the resolved entity ID (fall back to first catalog entry for the pageId)
    const resolvedEntityId =
      entityId ??
      ALLOWED_CATALOG.find((c) => c.pageId === pageId)?.entityId

    if (!resolvedEntityId || !ALLOWED_ENTITY_IDS.has(resolvedEntityId)) {
      return fail(reply, 400, 'Entity not in allowed scope')
    }

    // Helper: paginate an array
    const slicePage = <T>(rows: T[]) => {
      const total = rows.length
      if (pageSize === 0) return { rows, total, page: 1, pageSize }
      const start = (page - 1) * pageSize
      const sliced = rows.slice(start, start + pageSize)
      return { rows: sliced, total, page, pageSize }
    }

    // Helper: extract one or more crew IDs from filters.crewId (comma-separated).
    const requireCrewIds = (): string[] | null => {
      const v = (filters as Record<string, unknown>).crewId
      if (typeof v !== 'string' || !v) return null
      const ids = v.split(',').map((s) => s.trim()).filter(Boolean)
      return ids.length > 0 ? ids : null
    }

    switch (resolvedEntityId) {
      // ── Reference tables ──────────────────────────────────────────────────

      case 'base': {
        const rows = await baseService.list(fastify)
        return success(reply, slicePage(rows))
      }

      case 'department': {
        const rows = await crewDepartmentService.list(fastify)
        return success(reply, slicePage(rows))
      }

      case 'division': {
        const rows = await divisionService.list(fastify)
        return success(reply, slicePage(rows))
      }

      case 'rank': {
        const rows = await rankService.list(fastify)
        return success(reply, slicePage(rows))
      }

      case 'fleet': {
        const rows = await fleetService.list(fastify)
        return success(reply, slicePage(rows))
      }

      case 'aircraft': {
        const rows = await aircraftService.list(fastify)
        return success(reply, slicePage(rows))
      }

      case 'airport': {
        const rows = await airportService.list(fastify)
        return success(reply, slicePage(rows))
      }

      case 'qualification': {
        const rows = await fastify.db.select().from(qualification).orderBy(qualification.qualification).execute()
        return success(reply, slicePage(rows))
      }

      case 'dictionary': {
        const f = filters as Record<string, unknown>
        const parentCodeFilter = typeof f.parentCode === 'string' ? f.parentCode : undefined
        let rows = await dictionaryService.list(fastify)
        if (parentCodeFilter) rows = rows.filter((r) => r.parentCode === parentCodeFilter)
        return success(reply, slicePage(rows))
      }

      case 'holiday': {
        const f = filters as Record<string, unknown>
        const yearFilter = typeof f.year === 'string' ? f.year : undefined
        const cityFilter = typeof f.city === 'string' ? f.city : undefined
        let rows = await fastify.db.select().from(holidayTable).orderBy(holidayTable.strDt, holidayTable.city).execute()
        if (yearFilter) rows = rows.filter((r) => {
          const dt = r.strDt instanceof Date ? r.strDt : new Date(r.strDt as string)
          return dt.getFullYear().toString() === yearFilter
        })
        if (cityFilter) rows = rows.filter((r) => r.city === cityFilter)
        return success(reply, slicePage(rows))
      }

      // ── Assignment ────────────────────────────────────────────────────────

      case 'assignment': {
        const f = filters as Record<string, unknown>
        const typeFilter = typeof f.type === 'string' ? f.type : undefined
        let rows = await fastify.db.select().from(assignment).orderBy(assignment.assignment).execute()
        if (typeFilter) rows = rows.filter((r) => r.type === typeFilter)
        return success(reply, slicePage(rows))
      }

      case 'assignment_group': {
        const rows = await fastify.db.select().from(assignmentGroup).orderBy(assignmentGroup.assignmentGroup).execute()
        return success(reply, slicePage(rows))
      }

      case 'assignment_group_map': {
        // Resolve the raw FK ids to human-readable codes/names — a bare
        // group_id/assignment_id pair is meaningless to a user.
        const rows = await fastify.db
          .select({
            id: assignmentGroupMap.id,
            assignmentGroupId: assignmentGroupMap.assignmentGroupId,
            assignmentId: assignmentGroupMap.assignmentId,
            groupCode: assignmentGroup.assignmentGroup,
            groupName: assignmentGroup.name,
            assignmentCode: assignment.assignment,
            assignmentDesc: assignment.description,
          })
          .from(assignmentGroupMap)
          .leftJoin(assignmentGroup, eq(assignmentGroup.id, assignmentGroupMap.assignmentGroupId))
          .leftJoin(assignment, eq(assignment.id, assignmentGroupMap.assignmentId))
          .orderBy(assignmentGroup.assignmentGroup, assignment.assignment)
          .execute()
        return success(reply, slicePage(rows))
      }

      // ── Composition ───────────────────────────────────────────────────────

      case 'composition': {
        const rows = await compositionService.list(fastify)
        return success(reply, slicePage(rows))
      }

      case 'composition_rank': {
        const rows = await compositionService.listRanks(fastify)
        return success(reply, slicePage(rows))
      }

      case 'composition_load': {
        const rows = await compositionService.listLoads(fastify)
        return success(reply, slicePage(rows))
      }

      // ── Crew master ───────────────────────────────────────────────────────

      case 'crew': {
        // crewService.list handles its own DB-level pagination
        const f = filters as Record<string, unknown>
        const crewIds = Array.isArray(f.crewIds)
          ? (f.crewIds as unknown[]).filter((x): x is string => typeof x === 'string')
          : undefined
        const crewFilters = {
          division: typeof f.division === 'string' ? f.division : undefined,
          rank:     typeof f.rank     === 'string' ? f.rank     : undefined,
          base:     typeof f.base     === 'string' ? f.base     : undefined,
          fleet:    typeof f.fleet    === 'string' ? f.fleet    : undefined,
          status:   typeof f.status   === 'string' ? f.status   : undefined,
          search:   typeof f.search   === 'string' ? f.search   : undefined,
          empCode:  typeof f.empCode  === 'string' ? f.empCode  : undefined,
          name:     typeof f.name     === 'string' ? f.name     : undefined,
          crewIds:  crewIds && crewIds.length > 0 ? crewIds : undefined,
        }
        const result = await crewService.list(fastify, crewFilters, { page, pageSize })
        // Normalise PaginatedResult → { rows, total, page, pageSize }
        return success(reply, {
          rows:     result.items,
          total:    result.total,
          page:     result.page,
          pageSize: result.pageSize,
        })
      }

      // ── Crew sub-resources ────────────────────────────────────────────────

      case 'crew_base': {
        const crewIds = requireCrewIds()
        if (!crewIds) return success(reply, { rows: [], total: 0, page, pageSize })
        const allRows = (await Promise.all(crewIds.map((id) => crewBaseService.list(fastify, id)))).flat()
        const rows = expiry ? applyExpiryFilter(allRows, expiry) : allRows
        return success(reply, slicePage(rows))
      }

      case 'crew_rank': {
        const crewIds = requireCrewIds()
        if (!crewIds) return success(reply, { rows: [], total: 0, page, pageSize })
        const allRows = (await Promise.all(crewIds.map((id) => crewRankService.list(fastify, id)))).flat()
        const rows = expiry ? applyExpiryFilter(allRows, expiry) : allRows
        return success(reply, slicePage(rows))
      }

      case 'crew_fleet': {
        const crewIds = requireCrewIds()
        if (!crewIds) return success(reply, { rows: [], total: 0, page, pageSize })
        const allRows = (await Promise.all(crewIds.map((id) => crewFleetService.list(fastify, id)))).flat()
        const rows = expiry ? applyExpiryFilter(allRows, expiry) : allRows
        return success(reply, slicePage(rows))
      }

      case 'crew_qualification': {
        const crewIds = requireCrewIds()
        if (!crewIds) return success(reply, { rows: [], total: 0, page, pageSize })
        const allRows = (await Promise.all(crewIds.map((id) => crewQualificationService.list(fastify, id)))).flat()
        const rows = expiry ? applyExpiryFilter(allRows, expiry) : allRows
        return success(reply, slicePage(rows))
      }

      case 'crew_team': {
        const crewIds = requireCrewIds()
        if (!crewIds) return success(reply, { rows: [], total: 0, page, pageSize })
        const allRows = (await Promise.all(crewIds.map((id) => crewTeamService.list(fastify, id)))).flat()
        const rows = expiry ? applyExpiryFilter(allRows, expiry) : allRows
        return success(reply, slicePage(rows))
      }

      case 'crew_status': {
        const crewIds = requireCrewIds()
        if (!crewIds) return success(reply, { rows: [], total: 0, page, pageSize })
        const allRows = (await Promise.all(crewIds.map((id) => crewStatusService.list(fastify, id)))).flat()
        const rows = expiry ? applyExpiryFilter(allRows, expiry) : allRows
        return success(reply, slicePage(rows))
      }

      case 'crew_certificate': {
        const crewIds = requireCrewIds()
        if (!crewIds) return success(reply, { rows: [], total: 0, page, pageSize })
        const allRows = (await Promise.all(crewIds.map((id) => crewCertificateService.list(fastify, id)))).flat()
        const rows = expiry ? applyExpiryFilter(allRows, expiry) : allRows
        return success(reply, slicePage(rows))
      }

      case 'crew_license': {
        const crewIds = requireCrewIds()
        if (!crewIds) return success(reply, { rows: [], total: 0, page, pageSize })
        const allRows = (await Promise.all(crewIds.map((id) => crewLicenseService.list(fastify, id)))).flat()
        const rows = expiry ? applyExpiryFilter(allRows, expiry) : allRows
        return success(reply, slicePage(rows))
      }

      case 'crew_language': {
        const crewIds = requireCrewIds()
        if (!crewIds) return success(reply, { rows: [], total: 0, page, pageSize })
        const allRows = (await Promise.all(crewIds.map((id) => crewLanguageService.list(fastify, id)))).flat()
        const rows = expiry ? applyExpiryFilter(allRows, expiry) : allRows
        return success(reply, slicePage(rows))
      }

      case 'crew_entitlement': {
        const crewIds = requireCrewIds()
        if (!crewIds) return success(reply, { rows: [], total: 0, page, pageSize })
        const rows = (await Promise.all(crewIds.map((id) => crewEntitlementService.list(fastify, id)))).flat()
        return success(reply, slicePage(rows))
      }

      case 'crew_memo': {
        const crewIds = requireCrewIds()
        if (!crewIds) return success(reply, { rows: [], total: 0, page, pageSize })
        const rows = (await Promise.all(crewIds.map((id) => crewMemoService.list(fastify, id)))).flat()
        return success(reply, slicePage(rows))
      }

      case 'crew_seniority': {
        const crewIds = requireCrewIds()
        if (!crewIds) return success(reply, { rows: [], total: 0, page, pageSize })
        const rows = (await Promise.all(crewIds.map((id) => crewSeniorityService.list(fastify, id)))).flat()
        return success(reply, slicePage(rows))
      }

      case 'crew_kpi_adjust': {
        const crewIds = requireCrewIds()
        if (!crewIds) return success(reply, { rows: [], total: 0, page, pageSize })
        const rows = (await Promise.all(
          crewIds.map((id) => fastify.db.select().from(crewKpiAdjust).where(eq(crewKpiAdjust.crewId, id)))
        )).flat()
        return success(reply, slicePage(rows))
      }

      // ── Roster Period ─────────────────────────────────────────────────────

      case 'roster_period': {
        const f = filters as Record<string, unknown>
        const year   = typeof f.year       === 'string' ? f.year       : undefined
        const status = typeof f.lockStatus === 'string' ? f.lockStatus : undefined
        let rows = await rosterPeriodService.list(fastify)
        if (year)   rows = rows.filter((r: { year?: string }) => r.year === year)
        if (status !== undefined) {
          const lockVal = Number(status)
          rows = rows.filter((r: { lockStatus?: number }) => r.lockStatus === lockVal)
        }
        return success(reply, slicePage(rows))
      }

      case 'roster_period_config': {
        const f = filters as Record<string, unknown>
        const rpTypeFilter = typeof f.rpType === 'string' && f.rpType !== '' ? Number(f.rpType) : undefined
        const periodTypeFilter = typeof f.periodType === 'string' && f.periodType !== '' ? Number(f.periodType) : undefined
        let rows = await fastify.db
          .select()
          .from(rosterPeriodConfig)
          .orderBy(rosterPeriodConfig.id)
          .execute()

        if (rpTypeFilter !== undefined && !Number.isNaN(rpTypeFilter)) {
          rows = rows.filter((r) => r.rpType === rpTypeFilter)
        }
        if (periodTypeFilter !== undefined && !Number.isNaN(periodTypeFilter)) {
          rows = rows.filter((r) => r.periodType === periodTypeFilter)
        }

        return success(reply, slicePage(rows))
      }

      default:
        return fail(reply, 400, 'Entity not in allowed scope')
    }
  })
}
