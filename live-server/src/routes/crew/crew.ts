import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail, error } from '../../utils/response.js'
import { paginationQuerySchema } from '../../utils/pagination.js'
import { crewService } from '../../services/crew/crew-service.js'

// ---------- Zod schemas ----------

const crewListQuerySchema = paginationQuerySchema.extend({
  division: z.string().max(1).optional(),
  rank: z.string().max(10).optional(),
  base: z.string().max(3).optional(),
  fleet: z.string().max(20).optional(),
  status: z.string().max(5).optional(),
  search: z.string().max(100).optional(),
  empCode: z.string().max(30).optional(),
  name: z.string().max(100).optional(),
  sortBy: z.enum(['crew_id', 'name', 'rank', 'base', 'fleet']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  /** Global filter: comma-separated list, OR within each, AND between groups */
  divisions: z.string().max(200).optional(),
  bases: z.string().max(200).optional(),
  ranks: z.string().max(200).optional(),
  fleets: z.string().max(200).optional(),
  /** Hydrate a specific set of crew by ID (comma-separated) — used by Find Crew. */
  crewIds: z.string().max(2000).optional(),
  dateRangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateRangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** P1-3: slim 视图，只返回当前生效 rank/base/fleet，跳过全量历史（首屏提速） */
  view: z.enum(['gantt-panel']).optional(),
})

const crewCreateSchema = z.object({
  crewId: z.string().min(1).max(30),
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).nullish(),
  lastName: z.string().min(1).max(100),
  preferredName: z.string().max(100).nullish(),
  birthday: z.string().datetime().nullish(),
  gender: z.string().length(1),
  division: z.string().length(1),
  emplDt: z.string().datetime(),
  retireDt: z.string().datetime().nullish(),
  termDt: z.string().datetime().nullish(),
  seniorityNum: z.string().max(10).nullish(),
  nationality: z.string().max(2).nullish(),
  nationalId: z.string().max(20).nullish(),
  spouseCrewId: z.string().max(12).nullish(),
  passportFirstName: z.string().max(100).nullish(),
  passportMiddleName: z.string().max(100).nullish(),
  passportLastName: z.string().max(100).nullish(),
  remarks: z.string().max(50).nullish(),
  filiale: z.string().min(1).max(6),
  grade: z.string().max(20).nullish(),
  branchCode: z.string().max(20).nullish(),
  visaType: z.string().max(40).nullish(),
  birthCountry: z.string().max(12).nullish(),
  birthPlace: z.string().max(255).nullish(),
  birthPlaceEn: z.string().max(50).nullish(),
  nation: z.string().max(20).nullish(),
  politics: z.string().max(10).nullish(),
  contractType: z.string().max(40).nullish(),
  avatar: z.string().max(100).nullish(),
  tel: z.string().max(100).nullish(),
  idCard: z.string().max(100).nullish(),
  interfaceCrewId: z.string().max(40).nullish(),
  employeeNo: z.string().max(20).nullish(),
  emailAddr: z.string().max(100).nullish(),
  interfaceId: z.string().max(40).nullish(),
  homeAddress: z.string().max(500).nullish(),
})

const crewUpdateSchema = crewCreateSchema.partial()

const idParamSchema = z.object({ id: z.coerce.number().int().positive() })

// ---------- KPI Adjust schemas ----------

const kpiAdjustCreateSchema = z.object({
  rosterFlightId: z.number().int().nullish(),
  fltId: z.number().int().nullish(),
  type: z.number().int(),
  adjustDate: z.string().datetime().nullish(),
  adjustment: z.number().int(),
  comments: z.string().max(255).nullish(),
})

const kpiAdjustUpdateSchema = kpiAdjustCreateSchema.partial()

// ---------- Routes ----------

export default async function crewRoutes(fastify: FastifyInstance) {
  const USERNAME_HEADER = 'x-username'
  const getUsername = (req: { headers: Record<string, string | string[] | undefined> }) =>
    (req.headers[USERNAME_HEADER] as string) || 'system'

  // GET /api/crew — list with filters + pagination
  fastify.get('/', async (request, reply) => {
    const parsed = crewListQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }
    const { page, pageSize, divisions: rawDivisions, bases: rawBases, ranks: rawRanks, fleets: rawFleets, crewIds: rawCrewIds, view, ...rest } = parsed.data
    const parseCSV = (s?: string) => s?.split(',').map((v) => v.trim()).filter(Boolean)
    const filters = {
      ...rest,
      divisions: parseCSV(rawDivisions),
      bases: parseCSV(rawBases),
      ranks: parseCSV(rawRanks),
      fleets: parseCSV(rawFleets),
      crewIds: parseCSV(rawCrewIds),
    }
    const result = await crewService.list(fastify, filters, { page: page!, pageSize: pageSize! }, { slim: view === 'gantt-panel' })
    return success(reply, result)
  })

  // GET /api/crew/:id — single crew
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return fail(reply, 400, params.error.message)
    const crew = await crewService.getById(fastify, params.data.id)
    if (!crew) return error(reply, 404, 'Crew not found')
    return success(reply, crew)
  })

  // GET /api/crew/:id/detail — crew with current effective records
  fastify.get<{ Params: { id: string } }>('/:id/detail', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return fail(reply, 400, params.error.message)
    const detail = await crewService.getDetail(fastify, params.data.id)
    if (!detail) return error(reply, 404, 'Crew not found')
    return success(reply, detail)
  })

  // POST /api/crew — create
  fastify.post('/', async (request, reply) => {
    const parsed = crewCreateSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    const created = await crewService.create(fastify, parsed.data as never, getUsername(request))
    return success(reply, created)
  })

  // PUT /api/crew/:id — update
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return fail(reply, 400, params.error.message)
    const parsed = crewUpdateSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    const updated = await crewService.update(
      fastify,
      params.data.id,
      parsed.data as never,
      getUsername(request),
    )
    if (!updated) return error(reply, 404, 'Crew not found')
    return success(reply, updated)
  })

  // DELETE /api/crew/:id — soft delete
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return fail(reply, 400, params.error.message)
    const removed = await crewService.remove(fastify, params.data.id, getUsername(request))
    if (!removed) return error(reply, 404, 'Crew not found')
    return success(reply, removed)
  })

  // ===================== KPI Adjust =====================

  // GET /api/crew/:crewId/kpi-adjust
  fastify.get<{ Params: { crewId: string } }>('/:crewId/kpi-adjust', async (request, reply) => {
    const list = await crewService.listKpiAdjust(fastify, request.params.crewId)
    return success(reply, list)
  })

  // POST /api/crew/:crewId/kpi-adjust
  fastify.post<{ Params: { crewId: string } }>('/:crewId/kpi-adjust', async (request, reply) => {
    const parsed = kpiAdjustCreateSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    const created = await crewService.createKpiAdjust(
      fastify,
      { ...parsed.data, crewId: request.params.crewId } as never,
      getUsername(request),
    )
    return success(reply, created)
  })

  // PUT /api/crew/:crewId/kpi-adjust/:id
  fastify.put<{ Params: { crewId: string; id: string } }>(
    '/:crewId/kpi-adjust/:id',
    async (request, reply) => {
      const params = idParamSchema.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const parsed = kpiAdjustUpdateSchema.safeParse(request.body)
      if (!parsed.success) return fail(reply, 400, parsed.error.message)
      const updated = await crewService.updateKpiAdjust(
        fastify,
        params.data.id,
        parsed.data as never,
        getUsername(request),
      )
      if (!updated) return error(reply, 404, 'KPI adjust record not found')
      return success(reply, updated)
    },
  )

  // DELETE /api/crew/:crewId/kpi-adjust/:id
  fastify.delete<{ Params: { crewId: string; id: string } }>(
    '/:crewId/kpi-adjust/:id',
    async (request, reply) => {
      const params = idParamSchema.safeParse({ id: request.params.id })
      if (!params.success) return fail(reply, 400, params.error.message)
      const removed = await crewService.removeKpiAdjust(fastify, params.data.id)
      if (!removed) return error(reply, 404, 'KPI adjust record not found')
      return success(reply, removed)
    },
  )
}
