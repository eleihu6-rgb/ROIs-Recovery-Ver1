import { z } from 'zod'
import { inArray, and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { success, fail, error } from '../../utils/response.js'
import { paginationQuerySchema } from '../../utils/pagination.js'
import { scenarioService } from '../../services/scenario/scenario-service.js'
import {
  importS3PairingPrg,
  type ImportS3PairingPrgRequest,
} from '../../services/scenario/s3-pairing-import-service.js'
import { dictionaryService } from '../../services/base/dictionary-service.js'
import { capabilitiesFromDict } from '../../services/scenario/scenario-capabilities.js'
import { pairing as pairingTable } from '../../models/pairing/pairing.js'
import { rosterFlight } from '../../models/roster/roster-flight.js'
import { refreshLiveLegalityAndManday } from '../../services/manday/manday-operation-service.js'
import { notifyRosterTasksChanged } from '../../services/roster/roster-change-notifier.js'
import { env } from '../../config/env.js'
import { getScenarioRunHealth } from '../../services/scenario/scenario-run-health-service.js'
import { scenarioParameterService } from '../../services/scenario/scenario-parameter-service.js'
import { scenarioVersionService } from '../../services/scenario/scenario-version-service.js'
import {
  addNote as addScenarioNote,
  clearNotes as clearScenarioNotes,
  deleteNote as deleteScenarioNote,
  getNotes as getScenarioNotes,
  patchNote as patchScenarioNote,
} from '../../services/scenario/scenario-note-store.js'
import { liveSchemaName, quoteIdentifier, scenarioSchema } from '../../utils/db-schema.js'

type PublishRosterSource = 'IMP' | 'PA' | 'MA' | 'CR'
type PublishRosterStatus = 'PRE_ASSIGN' | 'PENDING' | 'PUBLISHED' | 'EXCEPTION'
type PublishRosterKind = 'FLYING' | 'GROUND'

interface RawPublishAssignment {
  kind: PublishRosterKind
  crewId: string
  pairingId: number | null
  source: PublishRosterSource
  rosterIds: number[]
  assignmentGroup: string
  assignment: string
  pairingLabel: string | null
  base: string
  division: string
  schStrDtUtc: string | null
  schEndDtUtc: string | null
}

export const normalizeRosterSource = (value: string | null | undefined): PublishRosterSource =>
  value === 'IMP' || value === 'PA' || value === 'MA' || value === 'CR' ? value : 'CR'

const toIsoOrNull = (value: unknown): string | null => {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const rosterPeriodForDate = async (fastify: FastifyInstance, date: Date): Promise<string> => {
  const liveSchema = quoteIdentifier(liveSchemaName())
  const { rows } = await fastify.pgPool.query<{ roster_period: string }>(
    `select roster_period
       from ${liveSchema}.roster_period
      where $1::timestamptz >= rp_start and $1::timestamptz <= rp_end
      order by rp_start asc
      limit 1`,
    [date.toISOString()],
  )
  const rp = rows[0]?.roster_period
  if (!rp) {
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    return `${y}RP${m}`
  }
  return rp
}

const publishStatusFor = (source: PublishRosterSource, published: boolean): PublishRosterStatus => {
  if (source === 'PA') return 'PRE_ASSIGN'
  return published ? 'PUBLISHED' : 'PENDING'
}

const publishableFor = (source: PublishRosterSource, status: PublishRosterStatus): boolean =>
  source !== 'PA' && status === 'PENDING'

const publishKey = (a: Pick<RawPublishAssignment, 'kind' | 'source' | 'crewId' | 'pairingId' | 'rosterIds'>): string =>
  a.kind === 'FLYING'
    ? `F|${a.source}|${a.crewId}|${a.pairingId ?? ''}`
    : `G|${a.source}|${a.rosterIds.join(',')}`

const scenarioSupportsLivePublish = (scenario: { fileType?: string | null; pairingScenarioId?: number | null }): boolean =>
  scenario.fileType === 'RO' && Number(scenario.pairingScenarioId ?? 0) === 0

const PUBLISH_ROSTER_COPY_COLUMNS = [
  'crew_id',
  'pairing_id',
  'ver',
  'base',
  'label',
  'assignment_group',
  'assignment',
  'role',
  'sub_role',
  'source',
  'is_requested',
  'is_deleted',
  'is_swapped',
  'preference',
  'comments',
  'score',
  'working_hour',
  'sch_credited_minutes',
  'sch_fm_credited_minutes',
  'sch_per_diem_mins',
  'sch_lh_per_diem_mins',
  'sch_fm_per_diem_mins',
  'sch_fm_lh_per_diem_mins',
  'act_credited_minutes',
  'act_fm_credited_minutes',
  'act_per_diem_mins',
  'act_lh_per_diem_mins',
  'act_fm_per_diem_mins',
  'act_fm_lh_per_diem_mins',
  'flt_id',
  'duty_seq',
  'seg_seq',
  'flt_dt',
  'sch_str_dt_utc',
  'sch_end_dt_utc',
  'act_str_dt_utc',
  'act_end_dt_utc',
  'division',
  'flight_acting_rank',
  'roster_acting_rank',
  'active_rank',
  'position',
  'seq_order',
  'check_type',
  'ts_flag',
  'send_flag',
  'resource_code',
  'tm_program_course_id',
  'group_id',
  'tag_set',
  'parent_tm_program_course_id',
  'course_code',
  'is_extra_course',
  'sub_tm_program_course_id',
  'sub_parent_tm_program_id',
  'sub_course_code',
  'seq_order_source',
  'sub_group_id',
  'request_source',
  'request_id',
  'is_publish',
  'exception_code',
  'act_rest_min',
] as const

const buildPublishRosterInsertSql = (): string => {
  const live = quoteIdentifier(liveSchemaName())
  const scenario = scenarioSchema()
  const columns = [
    'created_by',
    'created_at',
    'updated_by',
    'updated_at',
    ...PUBLISH_ROSTER_COPY_COLUMNS,
  ].map(quoteIdentifier)
  const selectColumns = [
    '$3::text',
    'now()',
    '$3::text',
    'now()',
    ...PUBLISH_ROSTER_COPY_COLUMNS.map((column) => {
      if (column === 'request_source') return `'SCENARIO'::text`
      if (column === 'request_id') return '$1::bigint'
      if (column === 'act_rest_min') return 'coalesce(rf."act_rest_min", ps."duty_act_rest_min")'
      return `rf.${quoteIdentifier(column)}`
    }),
  ]
  return `
    insert into ${live}.roster_flight (${columns.join(', ')})
    select ${selectColumns.join(', ')}
    from ${scenario}.roster_flight rf
    left join ${live}.pairing_segment ps
      on ps.pairing_id = rf.pairing_id
     and ps.duty_seq = rf.duty_seq
     and ps.seg_seq = rf.seg_seq
     and ps.is_deleted = 0
    where rf.scenario_id = $1
      and rf.id = any($2::bigint[])
      and rf.is_deleted = 0
      and coalesce(rf.source, 'CR') in ('CR', 'MA')
    order by rf.crew_id, rf.sch_str_dt_utc nulls last, rf.id
    returning id, crew_id, pairing_id, source, sch_str_dt_utc
  `
}

const countPublishedAssignments = (
  rows: Array<{ id: string | number; crew_id: string; pairing_id: string | number | null; source: string | null }>,
): number => {
  const keys = new Set<string>()
  for (const row of rows) {
    const source = normalizeRosterSource(row.source)
    if (row.pairing_id == null) {
      keys.add(`G|${source}|${row.id}`)
    } else {
      keys.add(`F|${source}|${row.crew_id}|${Number(row.pairing_id)}`)
    }
  }
  return keys.size
}

const findMissingLiveCrewForPublish = async (
  fastify: FastifyInstance,
  scenarioId: number,
  rosterIds: number[],
): Promise<string[]> => {
  const live = quoteIdentifier(liveSchemaName())
  const scenario = scenarioSchema()
  const res = await fastify.pgPool.query<{ crew_id: string }>(
    `
      select distinct rf.crew_id
      from ${scenario}.roster_flight rf
      left join ${live}.crew c on c.crew_id = rf.crew_id
      where rf.scenario_id = $1
        and rf.id = any($2::bigint[])
        and rf.is_deleted = 0
        and coalesce(rf.source, 'CR') in ('CR', 'MA')
        and c.crew_id is null
      order by rf.crew_id
      limit 25
    `,
    [scenarioId, rosterIds],
  )
  return res.rows.map((row) => row.crew_id)
}

/** Enrich raw assignments with pairing metadata + publish status.
 *  Shared by the gz and DB roster paths. */
async function enrichAndMarkAssignments(
  fastify: FastifyInstance,
  assignments: RawPublishAssignment[],
) {
  const pairingIds = assignments
    .map((a) => a.pairingId)
    .filter((pid): pid is number => typeof pid === 'number' && pid > 0)
  let pairingMap = new Map<number, {
    pairingLabel: string | null
    base: string
    assignmentGroup: string
    assignment: string
    division: string
    schStrDtUtc: Date | null
    schEndDtUtc: Date | null
  }>()

  if (pairingIds.length > 0) {
    const rows = await fastify.db
      .select({
        id: pairingTable.id,
        pairingLabel: pairingTable.pairingLabel,
        base: pairingTable.base,
        assignmentGroup: pairingTable.assignmentGroup,
        assignment: pairingTable.assignment,
        division: pairingTable.division,
        schStrDtUtc: pairingTable.schStrDtUtc,
        schEndDtUtc: pairingTable.schEndDtUtc,
      })
      .from(pairingTable)
      .where(inArray(pairingTable.id, pairingIds))
    pairingMap = new Map(rows.map((r) => [r.id, r]))
  }

  const enriched = assignments.map((a) => {
    const p = a.pairingId != null ? pairingMap.get(a.pairingId) : undefined
    return {
      kind: a.kind,
      crewId: a.crewId,
      pairingId: a.pairingId,
      source: a.source,
      rosterIds: a.rosterIds,
      pairingLabel: p?.pairingLabel ?? a.pairingLabel,
      base: p?.base ?? a.base,
      assignmentGroup: p?.assignmentGroup ?? a.assignmentGroup,
      assignment: p?.assignment ?? a.assignment,
      division: p?.division ?? a.division,
      schStrDtUtc: p?.schStrDtUtc?.toISOString() ?? a.schStrDtUtc,
      schEndDtUtc: p?.schEndDtUtc?.toISOString() ?? a.schEndDtUtc,
    }
  })

  // Mark CR/MA assignments already written to Live. PA is handled separately as
  // Pre-assign because those rows are already Live-sourced and must not publish.
  const crewIdList = enriched.map((a) => a.crewId)
  const pairingIdList = enriched
    .map((a) => a.pairingId)
    .filter((pid): pid is number => typeof pid === 'number' && pid > 0)
  const publishedKeys = new Set<string>()
  const missingLiveCrewIds = new Set<string>()
  const importableCrewIds = [...new Set(enriched.filter((a) => a.source !== 'PA').map((a) => a.crewId))]
  if (importableCrewIds.length > 0) {
    const res = await fastify.pgPool.query<{ crew_id: string }>(
      `
        select crew_id
        from ${quoteIdentifier(liveSchemaName())}.crew
        where crew_id = any($1::text[])
      `,
      [importableCrewIds],
    )
    const existingCrewIds = new Set(res.rows.map((row) => row.crew_id))
    for (const crewId of importableCrewIds) {
      if (!existingCrewIds.has(crewId)) missingLiveCrewIds.add(crewId)
    }
  }

  if (crewIdList.length > 0 && pairingIdList.length > 0) {
    const existing = await fastify.db
      .select({ crewId: rosterFlight.crewId, pairingId: rosterFlight.pairingId, source: rosterFlight.source })
      .from(rosterFlight)
      .where(
        and(
          inArray(rosterFlight.crewId, crewIdList),
          inArray(rosterFlight.pairingId, pairingIdList),
          eq(rosterFlight.isDeleted, 0),
        ),
      )
    for (const r of existing) {
      const source = normalizeRosterSource(r.source)
      if (source !== 'PA') publishedKeys.add(`F|${source}|${r.crewId}|${r.pairingId ?? ''}`)
    }
  }

  const groundRows = enriched.filter((a) => a.kind === 'GROUND' && a.source !== 'PA')
  if (groundRows.length > 0) {
    const res = await fastify.pgPool.query<{
      crew_id: string
      source: string | null
      assignment_group: string | null
      assignment: string | null
      sch_str_dt_utc: Date | null
      sch_end_dt_utc: Date | null
    }>(
      `
        select crew_id, source, assignment_group, assignment, sch_str_dt_utc, sch_end_dt_utc
        from ${quoteIdentifier(liveSchemaName())}.roster_flight
        where is_deleted = 0
          and pairing_id is null
          and crew_id = any($1::text[])
      `,
      [[...new Set(groundRows.map((g) => g.crewId))]],
    )
    const liveGroundKeys = new Set(res.rows.map((r) => [
      normalizeRosterSource(r.source),
      r.crew_id,
      r.assignment_group ?? '',
      r.assignment ?? '',
      r.sch_str_dt_utc?.toISOString() ?? '',
      r.sch_end_dt_utc?.toISOString() ?? '',
    ].join('|')))
    for (const g of groundRows) {
      const key = [
        g.source,
        g.crewId,
        g.assignmentGroup,
        g.assignment,
        g.schStrDtUtc ?? '',
        g.schEndDtUtc ?? '',
      ].join('|')
      if (liveGroundKeys.has(key)) publishedKeys.add(publishKey(g))
    }
  }

  return enriched.map((a) => {
    const status: PublishRosterStatus = a.source !== 'PA' && missingLiveCrewIds.has(a.crewId)
      ? 'EXCEPTION'
      : publishStatusFor(a.source, publishedKeys.has(publishKey(a)))
    return {
      ...a,
      status,
      published: status === 'PUBLISHED',
      publishable: publishableFor(a.source, status),
    }
  })
}

/** Whether `scenario.roster_flight` holds any loaded rows for this scenario id.
 *  DB-source rendering gates on row presence, not status/task_id (459/460 are FAILED but loaded). */
async function hasLoadedRoster(fastify: FastifyInstance, scenarioId: number): Promise<boolean> {
  const res = await fastify.db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM ${sql.raw(scenarioSchema())}.roster_flight WHERE scenario_id = ${scenarioId} AND is_deleted = 0`,
  )
  return Number(res.rows[0]?.n ?? 0) > 0
}

const scenarioListQuerySchema = paginationQuerySchema.extend({
  search:   z.string().optional(),
  name:     z.string().optional(),
  fileType: z.enum(['PO', 'RO', 'TO']).optional(),
  status:   z.enum(['DRAFT', 'RUNNING', 'DONE', 'FAILED', 'PUBLISHED']).optional(),
})

const getAuthUsername = (request: FastifyRequest): string => request.authUser?.userCode ?? 'system'

const optionalTrimmedString = z.string().trim().min(1).nullable().optional()
const schedulePublishDraftSchema = z.object({
  strDt: z.coerce.date(),
  endDt: z.coerce.date(),
  acType: optionalTrimmedString,
  division: z.string().trim().min(1),
  rosterPeriodId: z.coerce.number().int().positive().nullable().optional(),
  published: z.preprocess(
    (value) => value == null || value === '' ? null : Number(value),
    z.union([z.literal(0), z.null()]),
  ).optional(),
  crewId: optionalTrimmedString,
  publishType: z.string().trim().min(1).max(20).default('Normal'),
  base: optionalTrimmedString,
}).strict().refine((value) => value.endDt >= value.strDt, {
  message: 'End date must be on or after start date.',
  path: ['endDt'],
})

const multipartBooleanSchema = z.preprocess(
  (value) => value === true || value === 'true' || value === '1',
  z.boolean(),
)

const s3ImportFieldsSchema = z.object({
  targetMode: z.enum(['existing', 'new']),
  targetScenarioId: z.coerce.number().int().positive().optional(),
  clearBeforeImport: multipartBooleanSchema,
  newScenarioName: z.string().trim().optional(),
  newStrDtLoc: z.string().trim().optional(),
  newEndDtLoc: z.string().trim().optional(),
  newDivision: z.string().trim().optional(),
})

type S3MultipartParseResult =
  | { success: true; request: Omit<ImportS3PairingPrgRequest, 'username'> }
  | { success: false; message: string }

const readS3PairingMultipartRequest = async (request: FastifyRequest): Promise<S3MultipartParseResult> => {
  if (!request.isMultipart()) {
    return { success: false, message: 'S3 Pairing import requires multipart/form-data.' }
  }

  const fields = new Map<string, string>()
  let fileName = ''
  let fileText = ''

  try {
    for await (const part of request.parts({
      limits: { files: 1, fileSize: 25 * 1024 * 1024, fields: 16, parts: 20 },
    })) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file') {
          return { success: false, message: 'S3 Pairing import file must use form field name file.' }
        }
        fileName = part.filename
        fileText = (await part.toBuffer()).toString('utf8')
        continue
      }
      fields.set(part.fieldname, String(part.value ?? ''))
    }
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('file size')) {
      return { success: false, message: 'S3 Pairing PRG file is too large.' }
    }
    return { success: false, message: 'Failed to read S3 Pairing import multipart payload.' }
  }

  if (!fileName || !fileText.trim()) {
    return { success: false, message: 'PRG file is required and must not be empty.' }
  }

  const parsed = s3ImportFieldsSchema.safeParse(Object.fromEntries(fields.entries()))
  if (!parsed.success) {
    return { success: false, message: parsed.error.message }
  }

  const data = parsed.data
  return {
    success: true,
    request: {
      fileName,
      fileText,
      targetMode: data.targetMode,
      targetScenarioId: data.targetScenarioId,
      clearBeforeImport: data.clearBeforeImport,
      newScenario: data.targetMode === 'new'
        ? {
            name: data.newScenarioName,
            strDtLoc: data.newStrDtLoc ?? '',
            endDtLoc: data.newEndDtLoc ?? '',
            division: data.newDivision ?? '',
          }
        : undefined,
    },
  }
}

export default async function scenarioRoutes(fastify: FastifyInstance) {
  // --- Scenario CRUD ---

  // GET /api/scenario/run-health — internal service readiness for scenario runs
  fastify.get('/run-health', async (_request, reply) => {
    const result = await getScenarioRunHealth()
    return success(reply, result)
  })

  // GET /api/scenario — list scenarios
  fastify.get('/', async (request, reply) => {
    const parsed = scenarioListQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const result = await scenarioService.list(fastify, parsed.data)
    return success(reply, result)
  })

  // GET /api/scenario/:id — scenario detail
  fastify.get('/import-targets/po', async (_request, reply) => {
    const result = await fastify.pgPool.query<{
      id: string
      workset_id: string
      name: string | null
      status: string
      str_dt_loc: Date
      end_dt_loc: Date
    }>(
      `
        select s.id, s.workset_id, w.name, s.status, s.str_dt_loc, s.end_dt_loc
        from scenario s
        inner join workset w on w.id = s.workset_id
        where s.file_type = 'PO'
        order by s.updated_at desc, s.id desc
        limit 500
      `,
    )
    return success(reply, {
      items: result.rows.map((row) => ({
        id: Number(row.id),
        worksetId: Number(row.workset_id),
        name: row.name ?? `PO Scenario ${row.id}`,
        status: row.status,
        strDtLoc: row.str_dt_loc,
        endDtLoc: row.end_dt_loc,
      })),
    })
  })

  fastify.post('/s3-pairing-import', async (request, reply) => {
    const parsed = await readS3PairingMultipartRequest(request)
    if (!parsed.success) return fail(reply, 400, parsed.message)

    try {
      const result = await importS3PairingPrg(fastify, {
        ...parsed.request,
        username: getAuthUsername(request),
      })
      return success(reply, result)
    } catch (err) {
      const message = (err as Error).message
      if (message.includes('not found')) return fail(reply, 404, message)
      if (message.includes('required') || message.includes('invalid') || message.includes('supported')) {
        return fail(reply, 400, message)
      }
      return error(reply, 500, message)
    }
  })

  fastify.get('/:id/parameters', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const sc = await scenarioService.getById(fastify, numId)
    if (!sc) {
      return fail(reply, 404, 'Scenario not found')
    }

    const result = await scenarioParameterService.getMerged(fastify, numId)
    return success(reply, result)
  })

  fastify.put('/:id/parameters', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const sc = await scenarioService.getById(fastify, numId)
    if (!sc) {
      return fail(reply, 404, 'Scenario not found')
    }
    if (sc.status === 'RUNNING' || sc.status === 'PUBLISHED') {
      return fail(reply, 409, 'Scenario parameters cannot be changed for a running or published scenario')
    }

    const parsed = z.object({
      items: z.array(z.object({
        code: z.string().min(1),
        value: z.custom<unknown>((value) => value !== undefined, { message: 'value is required' }),
      })),
    }).safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const items = parsed.data.items.map((item) => ({ code: item.code, value: item.value as unknown }))
    await scenarioParameterService.saveValues(fastify, numId, items, getAuthUsername(request))
    const result = await scenarioParameterService.getMerged(fastify, numId)
    return success(reply, result)
  })

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const result = await scenarioService.getById(fastify, numId)
    if (!result) {
      return fail(reply, 404, 'Scenario not found')
    }
    return success(reply, result)
  })

  // POST /api/scenario — create scenario (starts as DRAFT)
  fastify.post('/', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const username = getAuthUsername(request)

    try {
      const result = await scenarioService.create(fastify, body as never, username)
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // PUT /api/scenario/:id — update scenario
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const body = request.body as Record<string, unknown>
    const username = getAuthUsername(request)

    try {
      const sc = await scenarioService.getById(fastify, numId)
      if (!sc) {
        return fail(reply, 404, 'Scenario not found')
      }
      if (body.algorithmParameters !== undefined && (sc.status === 'RUNNING' || sc.status === 'PUBLISHED')) {
        return fail(reply, 409, 'Scenario parameters cannot be changed for a running or published scenario')
      }
      const result = await scenarioService.update(fastify, numId, body as never, username)
      if (!result) {
        return fail(reply, 404, 'Scenario not found')
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // DELETE /api/scenario/:id — delete scenario
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    try {
      await scenarioService.remove(fastify, numId)
      return success(reply, null)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/scenario/:id/duplicate — clone scenario as a new DRAFT
  fastify.post('/:id/duplicate', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const username = getAuthUsername(request)

    try {
      const result = await scenarioService.duplicate(fastify, numId, username)
      return success(reply, result)
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'Scenario not found') return fail(reply, 404, msg)
      return error(reply, 500, msg)
    }
  })

  // --- Status Transition ---

  // POST /api/scenario/:id/transition — transition scenario status
  fastify.post('/:id/transition', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const schema = z.object({
      status: z.enum(['DRAFT', 'RUNNING', 'DONE', 'FAILED', 'PUBLISHED']),
      username: z.string().default('system'),
      deleteVersionFiles: z.boolean().optional().default(false),
    })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    try {
      const result = await scenarioService.transition(
        fastify,
        numId,
        parsed.data.status,
        getAuthUsername(request),
        {
          deleteVersionFiles: parsed.data.deleteVersionFiles,
          token: bearerToken(request),
          airline: requestSchema(request),
        },
      )
      return success(reply, result)
    } catch (err) {
      return fail(reply, 400, (err as Error).message)
    }
  })

  // GET /api/scenario/:id/versions — list archived optimizer versions
  fastify.get('/:id/versions', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const sc = await scenarioService.getById(fastify, numId)
    if (!sc) return fail(reply, 404, 'Scenario not found')
    const items = scenarioVersionService.versionsFor(sc)
    const enriched = await Promise.all(items.map(async (item) => {
      try {
        const diff = await scenarioVersionService.diffFor(
          fastify,
          numId,
          item.version,
          bearerToken(request),
          requestSchema(request),
        )
        return {
          ...item,
          hasDifferences: diff.algorithmParameters.length > 0 || diff.ruleParameters.length > 0,
        }
      } catch {
        return item
      }
    }))
    return success(reply, { items: enriched })
  })

  // DELETE /api/scenario/:id/versions/:version — delete one non-current archived version
  fastify.delete('/:id/versions/:version', async (request, reply) => {
    const { id, version } = request.params as { id: string; version: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    try {
      await scenarioVersionService.removeVersion(
        fastify,
        numId,
        version,
        bearerToken(request),
        requestSchema(request),
      )
      return success(reply, null)
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'Scenario not found' || msg === 'Version not found') return fail(reply, 404, msg)
      return fail(reply, 400, msg)
    }
  })

  // GET /api/scenario/:id/versions/:version/gantt-data — read-only Gantt from archived files
  fastify.get('/:id/versions/:version/gantt-data', async (request, reply) => {
    const { id, version } = request.params as { id: string; version: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const sc = await scenarioService.getById(fastify, numId)
    if (!sc) return fail(reply, 404, 'Scenario not found')
    const versions = scenarioVersionService.versionsFor(sc)
    const found = versions.find((item) => item.version === version)
    if (!found) return fail(reply, 404, 'Version not found')

    try {
      const { engineServerClient } = await import('../../services/engine-server-client.js')
      const { buildGanttDataFromSnapshotFiles } = await import(
        '../../services/scenario/scenario-gantt-service.js'
      )
      const { computeScenarioCrewStats } = await import(
        '../../services/scenario/scenario-crew-stats-service.js'
      )
      const [inputGz, outputGz] = await Promise.all([
        engineServerClient.fetchVersionFile(numId, version, 'input.gz', bearerToken(request), requestSchema(request)),
        engineServerClient.fetchVersionFile(numId, version, 'output.gz', bearerToken(request), requestSchema(request)),
      ])
      const data = await buildGanttDataFromSnapshotFiles(
        fastify,
        {
          id: sc.id,
          name: sc.name,
          strDtLoc: new Date(sc.strDtLoc),
          endDtLoc: new Date(sc.endDtLoc),
          leadinLive: sc.leadinLive,
          fileType: sc.fileType,
          rulesetId: sc.rulesetId,
        },
        inputGz,
        outputGz,
      )
      // Version archives do not carry manday themselves — compute per-crew crewStats from the
      // snapshot roster data, mirroring the live-refresh gantt-data path.
      data.crewStats = await computeScenarioCrewStats(fastify.db, data)
      const capRows = await dictionaryService.getByParentCode(fastify, `SCENARIO_CAP_${sc.fileType}`)
      const caps = capabilitiesFromDict(capRows, sc.fileType)
      data.capabilities = {
        ...caps,
        roster: { canAssign: false, canRemove: false, canReassign: false },
        pairing: { canEditSegments: false },
      }
      data.readOnly = true
      return success(reply, data)
    } catch (err) {
      return error(reply, 502, `Failed to build version gantt data: ${(err as Error).message}`)
    }
  })

  fastify.get('/:id/versions/:version/diff', async (request, reply) => {
    const { id, version } = request.params as { id: string; version: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
    const sc = await scenarioService.getById(fastify, numId)
    if (!sc) return fail(reply, 404, 'Scenario not found')
    if (!scenarioVersionService.versionsFor(sc).some((item) => item.version === version)) {
      return fail(reply, 404, 'Version not found')
    }
    try {
      const diff = await scenarioVersionService.diffFor(
        fastify,
        numId,
        version,
        bearerToken(request),
        requestSchema(request),
      )
      return success(reply, diff)
    } catch (err) {
      return error(reply, 502, `Failed to build version diff: ${(err as Error).message}`)
    }
  })

  // --- Scenario Notes ──────────────────────────────────────────────────────
  // Notes live in scenario_result with type='notes'. They survive "Remove result"
  // (transition→DRAFT clears every type except notes) and are deleted with the
  // scenario itself. Author is a display label prefilled with the logged-in
  // user's userCode on the client; the backend stores it verbatim.

  const noteCreateSchema = z.object({
    text: z.string().trim().min(1).max(5000),
    author: z.string().trim().min(1).max(60),
    replyTo: z.string().nullable().optional(),
  })
  const notePatchSchema = z.object({
    text: z.string().trim().min(1).max(5000),
  })

  // GET /api/scenario/:id/notes — list notes for a scenario
  fastify.get('/:id/notes', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
    try {
      const items = await getScenarioNotes(fastify, numId)
      return success(reply, { items })
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // POST /api/scenario/:id/notes — add a question / reply
  fastify.post('/:id/notes', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
    const parsed = noteCreateSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    try {
      const item = await addScenarioNote(fastify, numId, parsed.data, getAuthUsername(request))
      return success(reply, { item })
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // PATCH /api/scenario/:id/notes/:messageId — edit a message (author preserved)
  fastify.patch('/:id/notes/:messageId', async (request, reply) => {
    const { id, messageId } = request.params as { id: string; messageId: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
    const parsed = notePatchSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    try {
      const item = await patchScenarioNote(fastify, numId, messageId, parsed.data.text)
      return success(reply, { item })
    } catch (err) {
      const msg = (err as Error).message
      return fail(reply, msg.includes('not found') ? 404 : 500, msg)
    }
  })

  // DELETE /api/scenario/:id/notes/:messageId — delete a message + its replies
  fastify.delete('/:id/notes/:messageId', async (request, reply) => {
    const { id, messageId } = request.params as { id: string; messageId: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
    try {
      await deleteScenarioNote(fastify.pgPool, numId, messageId)
      return success(reply, { ok: true })
    } catch (err) {
      const msg = (err as Error).message
      return fail(reply, msg.includes('not found') ? 404 : 500, msg)
    }
  })

  // DELETE /api/scenario/:id/notes — clear all notes
  fastify.delete('/:id/notes', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
    try {
      await clearScenarioNotes(fastify.pgPool, numId)
      return success(reply, { ok: true })
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // --- Scenario Group ---

  // GET /api/scenario/group/:worksetId — get scenarios in a group
  fastify.get('/group/:worksetId', async (request, reply) => {
    const { worksetId } = request.params as { worksetId: string }
    const numId = Number(worksetId)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid worksetId')
    }

    const result = await scenarioService.getGroupByWorksetId(fastify, numId)
    return success(reply, result)
  })

  // GET /api/scenario/group/:worksetId/compare — compare KPIs for scenarios in a group
  fastify.get('/group/:worksetId/compare', async (request, reply) => {
    const { worksetId } = request.params as { worksetId: string }
    const numId = Number(worksetId)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid worksetId')
    }

    const result = await scenarioService.compareGroup(fastify, numId)
    return success(reply, result)
  })

  // POST /api/scenario/group — add scenario to group
  fastify.post('/group', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const username = (body.username as string) ?? 'system'

    try {
      const result = await scenarioService.addToGroup(fastify, body as never, username)
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // DELETE /api/scenario/group/:id — remove scenario from group
  fastify.delete('/group/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    try {
      const result = await scenarioService.removeFromGroup(fastify, numId)
      if (!result) {
        return fail(reply, 404, 'Group entry not found')
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // GET /api/scenario/:id/results — KPI + extended result tables for a scenario
  fastify.get('/:id/results', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) {
      return fail(reply, 400, 'Invalid id')
    }

    const result = await scenarioService.getResults(fastify, numId)
    return success(reply, result)
  })

  // --- Schedule Publish Record ---

  // GET /api/scenario/schedule-publish — list schedule publish records
  fastify.get('/schedule-publish', async (request, reply) => {
    const parsed = paginationQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    const result = await scenarioService.listSchedulePublishRecords(fastify, parsed.data)
    return success(reply, result)
  })

  // POST /api/scenario/schedule-publish — create schedule publish record
  fastify.post('/schedule-publish', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    if (Number(body.published) === 1) {
      return error(reply, 403, 'Published schedule records can only be created by Publish Roster.')
    }
    const parsed = schedulePublishDraftSchema.safeParse(body)
    if (!parsed.success) {
      return error(reply, 400, parsed.error.message)
    }

    try {
      const result = await scenarioService.createSchedulePublishRecord(
        fastify,
        parsed.data,
        getAuthUsername(request),
      )
      return success(reply, result)
    } catch {
      request.log.error(
        { route: 'POST /api/scenario/schedule-publish' },
        'Schedule publish draft creation failed',
      )
      return error(reply, 500, 'Schedule publish draft could not be created.')
    }
  })

  // --- Optimization loop (engine-server integration) ---

  const bearerToken = (request: { headers: { authorization?: string } }): string =>
    (request.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  const requestSchema = (request: { authUser?: { schema?: string } }): string =>
    request.authUser?.schema ?? liveSchemaName()
  const responseStatusCode = (err: unknown): number => {
    const statusCode = (err as { statusCode?: unknown }).statusCode
    return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 600 ? statusCode : 500
  }

  // GET /api/scenario/:id/progress — normalized progress for the complete RO run.
  // The engine owns solver progress.json; live-server owns the surrounding
  // input/result/database phases.
  fastify.get('/:id/progress', async (request, reply) => {
    const { id } = request.params as { id: string }
    const scenarioId = Number(id)
    if (Number.isNaN(scenarioId)) return fail(reply, 400, 'Invalid id')

    const sc = await scenarioService.getById(fastify, scenarioId)
    if (!sc) return fail(reply, 404, 'Scenario not found')

    type ProgressPhase =
      | 'starting'
      | 'extracting_input'
      | 'solving'
      | 'producing_result'
      | 'loading_roster'
      | 'done'
      | 'failed'

    const base = {
      scenarioId,
      taskId: sc.taskId ?? null,
      status: sc.status,
      phase: 'starting' as ProgressPhase,
      percent: 0,
      stageLabel: 'Starting optimization',
      detail: null as string | null,
      stageIndex: null as number | null,
      stageTotal: null as number | null,
      stepIndex: null as number | null,
      stepTotal: null as number | null,
      elapsedSec: null as number | null,
      progressAgeSec: null as number | null,
      error: null as string | null,
    }

    if (sc.status === 'DONE') {
      return success(reply, { ...base, phase: 'done', percent: 100, stageLabel: 'Optimization complete' })
    }
    if (sc.status === 'FAILED') {
      return success(reply, {
        ...base,
        phase: 'failed',
        percent: 100,
        stageLabel: 'Optimization failed',
      })
    }
    if (!sc.taskId) {
      return success(reply, base)
    }

    try {
      const token = bearerToken(request)
      const airline = requestSchema(request)
      const { engineServerClient } = await import('../../services/engine-server-client.js')
      const engine = await engineServerClient.fetchProgress(sc.taskId, token, airline)
      const detail = engine.progress_detail ?? null
      const solverPercent = Number(detail?.percent)
      const coarseStage = detail?.stage
      const isProducing = coarseStage === 'producing_result'
      const percent = Number.isFinite(solverPercent)
        ? (isProducing
            ? Math.max(86, Math.min(94, solverPercent))
            : Math.max(20, Math.min(85, solverPercent)))
        : (isProducing
            ? Math.max(86, Math.min(94, Number(engine.progress) || 90))
            : Math.max(5, Math.min(85, Number(engine.progress) || 0)))
      const engineStatus = String(engine.status).toLowerCase()

      if (engineStatus === 'completed') {
        return success(reply, {
          ...base,
          phase: 'loading_roster',
          percent: 95,
          stageLabel: 'Writing optimized roster',
          elapsedSec: detail?.elapsed_sec ?? null,
          progressAgeSec: engine.progress_age_sec ?? null,
        })
      }
      if (engineStatus === 'failed' || engineStatus === 'stopped') {
        return success(reply, {
          ...base,
          phase: 'failed',
          percent,
          stageLabel: 'Optimization failed',
          detail: detail?.error ?? null,
          error: detail?.error ?? null,
          elapsedSec: detail?.elapsed_sec ?? null,
          progressAgeSec: engine.progress_age_sec ?? null,
        })
      }

      const hasSolverProgress = Boolean(detail && (
        detail.state || detail.stage || detail.stage_label || detail.percent != null
      ))
      const phase = isProducing
        ? 'producing_result'
        : coarseStage === 'extracting_input'
          ? 'extracting_input'
          : 'solving'
      return success(reply, {
        ...base,
        phase: hasSolverProgress ? phase : 'extracting_input',
        percent: hasSolverProgress ? percent : Math.max(5, Math.min(20, Number(engine.progress) || 5)),
        stageLabel: hasSolverProgress
          ? (detail?.stage_label || detail?.stage || 'Solving optimization')
          : 'Preparing optimization input',
        detail: detail?.detail ?? null,
        stageIndex: detail?.stage_index ?? null,
        stageTotal: detail?.stage_total ?? null,
        stepIndex: detail?.step_index ?? null,
        stepTotal: detail?.step_total ?? null,
        elapsedSec: detail?.elapsed_sec ?? null,
        progressAgeSec: engine.progress_age_sec ?? null,
        error: detail?.error ?? null,
      })
    } catch (err) {
      // The task can exist in scenario DB before engine-server has persisted
      // its Redis record. Keep the UI useful during that short hand-off.
      return success(reply, {
        ...base,
        phase: 'extracting_input',
        percent: 10,
        stageLabel: 'Preparing optimization input',
        detail: (err as Error).message,
      })
    }
  })

  // POST /api/scenario/:id/run — kick off RO optimization on engine-server
  fastify.post('/:id/run', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const airline = requestSchema(request)
    const token = bearerToken(request)
    const liveServerUrl = `${request.protocol}://${request.headers.host}`

    try {
      const result = await scenarioService.run(fastify, numId, token, airline, liveServerUrl, getAuthUsername(request))
      return success(reply, result)
    } catch (err) {
      return error(reply, responseStatusCode(err), (err as Error).message)
    }
  })

  // POST /api/scenario/export — engine-server pulls ro_input.gz (raw filtered tables)
  fastify.post('/export', async (request, reply) => {
    // engine-server posts the scenarioId as a bare JSON integer (e.g. 5432)
    const raw = request.body as unknown
    const scenarioId =
      typeof raw === 'number' ? raw : Number((raw as { scenarioId?: number })?.scenarioId ?? raw)
    if (Number.isNaN(scenarioId)) return fail(reply, 400, 'Invalid scenarioId')

    const sc = await scenarioService.getById(fastify, scenarioId)
    if (!sc) return fail(reply, 404, 'Scenario not found')

    const { buildRoInputGz } = await import('../../services/scenario/scenario-export-service.js')
    const gz = await buildRoInputGz(fastify, sc as never)
    return reply.header('Content-Type', 'application/gzip').send(gz)
  })

  // POST /api/scenario/result — engine-server writes back optimization result metadata.
  // The payload carries report-shaped scheduling_details / general_kpi derived from the
  // optimizer's result.json (a full monthly roster easily exceeds Fastify's 1MB default
  // body limit → 413, which leaves the scenario stuck RUNNING because the DONE callback
  // never lands). Raise the limit for this route only.
  fastify.post('/result', { bodyLimit: 50 * 1024 * 1024 }, async (request, reply) => {
    const { saveResult } = await import('../../services/scenario/scenario-result-service.js')
    const meta = request.body as Parameters<typeof saveResult>[1]
    if (!meta || typeof meta.scenarioId !== 'number') return fail(reply, 400, 'Invalid result payload')

    try {
      const token = bearerToken(request)
      const airline = requestSchema(request)
      // saveResult also fires the best-effort DB load on DONE (needs token/airline).
      await saveResult(fastify, meta, token, airline)
      // KPI computation is best-effort — a failure must not fail the result callback.
      const { computeAndPersistKpis } = await import('../../services/scenario/scenario-result-service.js')
      computeAndPersistKpis(fastify, meta, token, airline).catch((err) => {
        fastify.log.warn(`scenario ${meta.scenarioId} KPI computation failed: ${(err as Error).message}`)
      })
      return success(reply, null)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // GET /api/scenario/:id/roster — read optimized roster (approach B: pull file from engine-server)
  fastify.get('/:id/roster', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const sc = await scenarioService.getById(fastify, numId)
    if (!sc) return fail(reply, 404, 'Scenario not found')

    const airline = requestSchema(request)
    const token = bearerToken(request)

    // DB source: assignments come from scenario.roster_flight, gated on loaded rows (not status).
    if (env.SCENARIO_GANTT_SOURCE === 'db') {
      try {
        if (!scenarioSupportsLivePublish(sc)) {
          return success(reply, { assignments: [], publishSupported: false })
        }
        if (!(await hasLoadedRoster(fastify, numId))) {
          return fail(reply, 409, 'Scenario has no loaded result')
        }
        const res = await fastify.db.execute<{
          kind: PublishRosterKind
          crew_id: string
          pairing_id: string | null
          source: string | null
          roster_ids: string[] | number[]
          assignment_group: string | null
          assignment: string | null
          pairing_label: string | null
          base: string | null
          division: string | null
          sch_str_dt_utc: Date | null
          sch_end_dt_utc: Date | null
        }>(
          sql`
            WITH flying AS (
              SELECT
                'FLYING'::text AS kind,
                crew_id,
                pairing_id,
                source,
                array_agg(id ORDER BY duty_seq NULLS LAST, seg_seq NULLS LAST, sch_str_dt_utc NULLS LAST, id) AS roster_ids,
                max(assignment_group) AS assignment_group,
                max(assignment) AS assignment,
                null::text AS pairing_label,
                max(base) AS base,
                max(division) AS division,
                min(sch_str_dt_utc) AS sch_str_dt_utc,
                max(sch_end_dt_utc) AS sch_end_dt_utc
              FROM ${sql.raw(scenarioSchema())}.roster_flight
              WHERE scenario_id = ${numId} AND pairing_id IS NOT NULL AND is_deleted = 0
              GROUP BY crew_id, pairing_id, source
            ),
            ground AS (
              SELECT
                'GROUND'::text AS kind,
                crew_id,
                null::bigint AS pairing_id,
                source,
                array[id] AS roster_ids,
                assignment_group,
                assignment,
                label AS pairing_label,
                base,
                division,
                sch_str_dt_utc,
                sch_end_dt_utc
              FROM ${sql.raw(scenarioSchema())}.roster_flight
              WHERE scenario_id = ${numId} AND pairing_id IS NULL AND is_deleted = 0
            )
            SELECT *
            FROM (
              SELECT * FROM flying
              UNION ALL
              SELECT * FROM ground
            ) x
            ORDER BY crew_id DESC, sch_str_dt_utc DESC NULLS LAST
          `,
        )
        const assignments: RawPublishAssignment[] = res.rows.map((r) => ({
          kind: r.kind,
          crewId: r.crew_id,
          pairingId: r.pairing_id == null ? null : Number(r.pairing_id),
          source: normalizeRosterSource(r.source),
          rosterIds: (r.roster_ids ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id)),
          assignmentGroup: r.assignment_group ?? '',
          assignment: r.assignment ?? '',
          pairingLabel: r.pairing_label ?? null,
          base: r.base ?? '',
          division: r.division ?? '',
          schStrDtUtc: toIsoOrNull(r.sch_str_dt_utc),
          schEndDtUtc: toIsoOrNull(r.sch_end_dt_utc),
        }))
        const withPublished = await enrichAndMarkAssignments(fastify, assignments)
        return success(reply, { assignments: withPublished, publishSupported: true })
      } catch (err) {
        return error(reply, 502, `Failed to load result: ${(err as Error).message}`)
      }
    }

    if (sc.status !== 'DONE' || !sc.taskId) return fail(reply, 409, 'Scenario has no optimized result')

    try {
      const { engineServerClient } = await import('../../services/engine-server-client.js')
      const { parseSections, parseAssignments } = await import(
        '../../services/scenario/scenario-result-service.js'
      )
      const gz = await engineServerClient.fetchResultFile(sc.taskId, token, airline)
      const assignments = parseAssignments(parseSections(gz)).map((a) => ({
        kind: 'FLYING' as const,
        crewId: a.crewId,
        pairingId: a.pairingId,
        source: 'CR' as const,
        rosterIds: [],
        assignmentGroup: '',
        assignment: '',
        pairingLabel: null,
        base: '',
        division: '',
        schStrDtUtc: null,
        schEndDtUtc: null,
      }))
      const withPublished = await enrichAndMarkAssignments(fastify, assignments)
      return success(reply, { assignments: withPublished, publishSupported: true })
    } catch (err) {
      return error(reply, 502, `Failed to load result: ${(err as Error).message}`)
    }
  })

  // POST /api/scenario/:id/publish — write selected optimized assignments back to live roster_flight
  fastify.post('/:id/publish', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const schema = z.object({
      rosterIds: z.array(z.number().int().positive()).min(1).optional(),
      assignments: z.array(z.object({
        crewId: z.string(),
        pairingId: z.number().int().positive(),
      })).min(1).optional(),
      username: z.string().default('system'),
    }).refine((value) => (value.rosterIds?.length ?? 0) > 0 || (value.assignments?.length ?? 0) > 0, {
      message: 'rosterIds or assignments is required',
    })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)

    const { rosterIds, assignments, username } = parsed.data

    try {
      const sc = await scenarioService.getById(fastify, numId)
      if (!sc) return fail(reply, 404, 'Scenario not found')
      if (!scenarioSupportsLivePublish(sc)) {
        return fail(reply, 409, 'Publish Roster is only supported for RO scenarios that reference Live pairings.')
      }

      let idsToPublish = [...new Set((rosterIds ?? []).map((rowId) => Number(rowId)).filter((rowId) => Number.isFinite(rowId)))]
      if (idsToPublish.length === 0 && assignments && assignments.length > 0) {
        const pairKeys = assignments.map((a) => [String(a.crewId), Number(a.pairingId)] as const)
        const crewIds = [...new Set(pairKeys.map(([crewId]) => crewId))]
        const pairingIds = [...new Set(pairKeys.map(([, pairingId]) => pairingId))]
        const lookup = new Set(pairKeys.map(([crewId, pairingId]) => `${crewId}|${pairingId}`))
        const candidateRows = await fastify.pgPool.query<{ id: string; crew_id: string; pairing_id: string }>(
          `
            select id, crew_id, pairing_id
            from ${scenarioSchema()}.roster_flight
            where scenario_id = $1
              and crew_id = any($2::text[])
              and pairing_id = any($3::bigint[])
              and is_deleted = 0
              and coalesce(source, 'CR') in ('CR', 'MA')
          `,
          [numId, crewIds, pairingIds],
        )
        idsToPublish = candidateRows.rows
          .filter((row) => lookup.has(`${row.crew_id}|${Number(row.pairing_id)}`))
          .map((row) => Number(row.id))
      }
      if (idsToPublish.length === 0) return fail(reply, 400, 'No publishable roster rows selected.')

      const missingCrewIds = await findMissingLiveCrewForPublish(fastify, numId, idsToPublish)
      if (missingCrewIds.length > 0) {
        return fail(
          reply,
          409,
          `Cannot import roster to Live because ${missingCrewIds.length === 1 ? 'crew' : 'crews'} ${missingCrewIds.join(', ')} ${missingCrewIds.length === 1 ? 'does' : 'do'} not exist in Live crew master.`,
        )
      }

      const inserted = await fastify.pgPool.query<{
        id: string
        crew_id: string
        pairing_id: string | null
        source: string | null
        sch_str_dt_utc: Date | null
      }>(
        buildPublishRosterInsertSql(),
        [numId, idsToPublish, username],
      )

      // Recompute live CrewManday for every published crew via the unified driver in one pass
      // (one Rust spawn, all crew), padding the window around the published pairing starts.
      const crewIds = [...new Set(inserted.rows.map((r) => String(r.crew_id)).filter((s) => s.length > 0))]
      const starts: number[] = []
      for (const row of inserted.rows) {
        const s = row.sch_str_dt_utc
        if (!s) continue
        const t = new Date(s).getTime()
        if (!Number.isNaN(t)) starts.push(t)
      }
      if (crewIds.length) {
        const fallbackStart = new Date(sc.strDtLoc).getTime()
        const fallbackEnd = new Date(sc.endDtLoc).getTime()
        const rangeStarts = starts.length && Number.isFinite(Math.min(...starts)) ? starts : [fallbackStart]
        const rangeEnds = starts.length && Number.isFinite(Math.max(...starts)) ? starts : [fallbackEnd]
        const startDt = new Date(Math.min(...rangeStarts) - 2 * 86_400_000).toISOString().slice(0, 10)
        const endDt = new Date(Math.max(...rangeEnds) + 10 * 86_400_000).toISOString().slice(0, 10)
        await refreshLiveLegalityAndManday(fastify, {
          crewIds,
          legalityDates: starts.length
            ? starts.map((value) => new Date(value))
            : [sc.strDtLoc, sc.endDtLoc],
          startDt,
          endDt,
          updatedBy: username,
        })
      }

      await notifyRosterTasksChanged(fastify, { schema: requestSchema(request), crewIds })

      // The publish path recomputes CrewManday synchronously (refreshLiveLegalityAndManday above),
      // so the authoritative RpCred/RpDO/RpBH are already fresh in the DB. Tell already-open LIVE
      // gantt clients to drop the stale crew-stats cache and refetch — otherwise they keep showing
      // pre-publish credit until a manual page reload. (roster-updated only refreshes roster items;
      // the frontend refreshes crew stats on manday-updated, the same signal the async worker emits.)
      if (crewIds.length > 0) {
        fastify.wsBroadcastAll(requestSchema(request), { type: 'manday-updated', crewIds })
      }

      return success(reply, { published: countPublishedAssignments(inserted.rows) })
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
  })

  // GET /api/scenario/:id/gantt-data — Scenario Gantt rendering data.
  fastify.get('/:id/gantt-data', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const sc = await scenarioService.getById(fastify, numId)
    if (!sc) return fail(reply, 404, 'Scenario not found')

    const airline = requestSchema(request)
    const token = bearerToken(request)

    // DB source: assemble from the partition-backed scenario schema, gated on loaded rows (not status).
    // NOTE: SCENARIO_GANTT_SOURCE DEFAULTS to 'db' in config/env — an unset/empty value is the
    // normal DB path, NOT the gz path. 'gz' (output-parse) only runs when explicitly set.
    if (env.SCENARIO_GANTT_SOURCE === 'db') {
      try {
        if (sc.fileType !== 'PO' && !(await hasLoadedRoster(fastify, numId))) {
          // No loaded roster yet: seed DRAFT/FAILED RO scenarios from scope with
          // live pre-occupied roster data as default read-only context.
          if (sc.fileType === 'RO' && (sc.status === 'DRAFT' || sc.status === 'FAILED')) {
            const { buildGanttDataSeed } = await import(
              '../../services/scenario/scenario-gantt-service.js'
            )
            const { loadLiveMandayStatsForScenario } = await import(
              '../../services/scenario/scenario-crew-stats-service.js'
            )
            const data = await buildGanttDataSeed(fastify, sc as never)
            const rosterPeriod = await rosterPeriodForDate(fastify, new Date(data.scenarioStrDt))
            data.crewStats = await loadLiveMandayStatsForScenario(
              fastify,
              data.crew.map((c) => c.crewId),
              rosterPeriod,
            )
            // Read-only: keep pane visibility from the dictionary, disable all editing.
            const capRows = await dictionaryService.getByParentCode(fastify, `SCENARIO_CAP_${sc.fileType}`)
            const caps = capabilitiesFromDict(capRows, sc.fileType)
            data.capabilities = {
              ...caps,
              roster: { canAssign: false, canRemove: false, canReassign: false },
              pairing: { canEditSegments: false },
            }
            return success(reply, data)
          }
          return fail(reply, 409, 'Scenario has no loaded result')
        }
        const { buildGanttDataFromDb } = await import(
          '../../services/scenario/scenario-gantt-db-service.js'
        )
        const data = await buildGanttDataFromDb(fastify.db, {
          id: sc.id,
          name: sc.name,
          strDtLoc: new Date(sc.strDtLoc),
          endDtLoc: new Date(sc.endDtLoc),
          leadinLive: sc.leadinLive,
          fileType: sc.fileType,
          pairingScenarioId: Number(sc.pairingScenarioId ?? 0),
          flightScenarioId: Number(sc.flightScenarioId ?? 0),
          filterParams: (sc.filterParams ?? {}) as Record<string, unknown>,
          division: sc.division ?? 'P',
          rulesetId: sc.rulesetId,
        })

        // Override code-fallback capabilities with dictionary-driven config (per fileType).
        const capRows = await dictionaryService.getByParentCode(fastify, `SCENARIO_CAP_${sc.fileType}`)
        data.capabilities = capabilitiesFromDict(capRows, sc.fileType)

        return success(reply, data)
      } catch (err) {
        return error(reply, 502, `Failed to build gantt data: ${(err as Error).message}`)
      }
    }

    if (sc.status !== 'DONE' || !sc.taskId) return fail(reply, 409, 'Scenario has no optimized result')

    try {
      const { buildGanttDataLiveRefresh } = await import(
        '../../services/scenario/scenario-gantt-service.js'
      )
      const { computeScenarioCrewStats } = await import(
        '../../services/scenario/scenario-crew-stats-service.js'
      )

      const data = await buildGanttDataLiveRefresh(fastify, sc as never, token, airline)

      data.crewStats = await computeScenarioCrewStats(fastify.db, data)

      // Override code-fallback capabilities with dictionary-driven config (per fileType).
      const capRows = await dictionaryService.getByParentCode(fastify, `SCENARIO_CAP_${sc.fileType}`)
      data.capabilities = capabilitiesFromDict(capRows, sc.fileType)

      return success(reply, data)
    } catch (err) {
      return error(reply, 502, `Failed to build gantt data: ${(err as Error).message}`)
    }
  })

  // GET /api/scenario/:id/crew-stats?crewIds=a,b — targeted crewStats refresh after an
  // async manday recompute (scenario-manday-updated signal). Reads the scenario manday
  // period tables for the affected crews only.
  fastify.get('/:id/crew-stats', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
    const q = (request.query ?? {}) as { crewIds?: string }
    const crewIds = q.crewIds?.split(',').map((s) => s.trim()).filter(Boolean) ?? []
    const { computeScenarioCrewStatsFromDb } = await import(
      '../../services/scenario/scenario-gantt-db-service.js'
    )
    const crewStats = await computeScenarioCrewStatsFromDb(fastify.db, numId, crewIds.length ? crewIds : undefined)
    return success(reply, crewStats)
  })

  // ── Edit lock routes ──────────────────────────────────────────────

  const userCode = (req: { authUser?: { userCode?: string } }) =>
    req.authUser?.userCode ?? 'anonymous'

  // POST /api/scenario/:id/acquire-lock
  fastify.post('/:id/acquire-lock', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const { scenarioLockService } = await import('../../services/scenario/scenario-lock-service.js')
    const acquired = await scenarioLockService.acquire(fastify.redis, numId, userCode(request))
    const status = await scenarioLockService.status(fastify.redis, numId, userCode(request))
    return success(reply, { acquired, ...status })
  })

  // POST /api/scenario/:id/release-lock
  fastify.post('/:id/release-lock', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const { scenarioLockService } = await import('../../services/scenario/scenario-lock-service.js')
    const released = await scenarioLockService.release(fastify.redis, numId, userCode(request))
    return success(reply, { released })
  })

  // GET /api/scenario/:id/lock-status
  fastify.get('/:id/lock-status', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const { scenarioLockService } = await import('../../services/scenario/scenario-lock-service.js')
    const status = await scenarioLockService.status(fastify.redis, numId, userCode(request))
    return success(reply, status)
  })

  // POST /api/scenario/:id/lock-keepalive
  fastify.post('/:id/lock-keepalive', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const { scenarioLockService } = await import('../../services/scenario/scenario-lock-service.js')
    const renewed = await scenarioLockService.keepalive(fastify.redis, numId, userCode(request))
    return success(reply, { renewed })
  })

  // POST /api/scenario/:id/patch-output — apply Scenario roster deltas to DB-backed Gantt data
  fastify.post('/:id/patch-output', async (request, reply) => {
    const { id } = request.params as { id: string }
    const numId = Number(id)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')

    const { patches } = request.body as { patches: import('../../services/scenario/scenario-patch-service.js').AssignmentPatch[] }
    if (!Array.isArray(patches) || patches.length === 0) {
      return fail(reply, 400, 'patches must be a non-empty array')
    }

    // Verify caller holds the edit lock
    const callerCode = request.authUser?.userCode ?? 'anonymous'
    const { scenarioLockService } = await import('../../services/scenario/scenario-lock-service.js')
    const lockSt = await scenarioLockService.status(fastify.redis, numId, callerCode)
    if (!lockSt.isOwner) return fail(reply, 409, 'You do not hold the edit lock for this scenario')

    const sc = await scenarioService.getById(fastify, numId)
    if (!sc) return fail(reply, 404, 'Scenario not found')

    try {
      const {
        validateScenarioRosterPatches,
      } = await import('../../services/scenario/scenario-patch-service.js')
      await validateScenarioRosterPatches(fastify.pgPool, numId, patches)
      const { applyScenarioRosterPatches } = await import('../../services/scenario/scenario-patch-service.js')
      await applyScenarioRosterPatches(fastify.pgPool, numId, patches, callerCode)
      // Fresh assign INSERT omits duty_ref_tz; write Rule 7500 Acc Ref before the
      // client Save reload so Pairing Detail Ref TZ is not blank.
      const { recalculateAccRefTz } = await import('../../services/rule-check/acc-ref-tz-service.js')
      await recalculateAccRefTz(fastify.pgPool, {
        schema: 'scenario',
        scenarioId: numId,
        rulesetId: Number(sc.rulesetId ?? 103),
      })
      // Broadcast the applied patches so OTHER clients viewing the same scenario apply them
      // locally and recompute fills/header (the editor already applied them locally on save).
      // Excluded by userId so the editor never double-applies an add.
      fastify.wsBroadcast(requestSchema(request), {
        type: 'scenario-roster-updated',
        scenarioId: numId,
        patches,
      }, callerCode)
      // Recompute manday for the patched crews asynchronously — the worker broadcasts
      // scenario-manday-updated when done so clients targeted-refresh crew stats.
      const affectedCrewIds = [...new Set(
        patches.flatMap((patch) => [patch.crewId, patch.toCrewId]).filter((id): id is string => !!id),
      )]
      if (affectedCrewIds.length > 0) {
        await fastify.mandayRecomputeQueue.add('manday-recompute', {
          kind: 'scenario',
          schema: 'scenario',
          airlineSchema: requestSchema(request),
          scenarioId: numId,
          crewIds: affectedCrewIds,
          updatedBy: callerCode,
        // BullMQ rejects custom jobIds containing ':' unless they split into exactly 3
        // parts, so use a colon-free jobId (unique per scenario + crew set) for dedup.
        }, { jobId: `manday-scenario-${numId}-${[...affectedCrewIds].sort().join(',')}` })
      }
      // Recompute scenario pairing KPIs asynchronously — the worker broadcasts
      // scenario-kpi-updated when done so clients targeted-refresh the KPI section.
      await fastify.scenarioKpiRecomputeQueue.add('scenario-kpi-recompute', {
        scenarioId: numId,
        strDtLoc: new Date(sc.strDtLoc),
        endDtLoc: new Date(sc.endDtLoc),
        filterParams: (sc.filterParams ?? {}) as Record<string, unknown>,
        division: sc.division ?? 'P',
        airlineSchema: requestSchema(request),
        updatedBy: callerCode,
      }, { jobId: `scenario-kpi-${numId}` })
      const { ensureLegality } = await import('../../services/scenario/legality-status.js')
      await ensureLegality(fastify, numId, { airlineSchema: requestSchema(request) })
      return success(reply, { patched: patches.length })
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 502
      return error(reply, statusCode, `Patch failed: ${(err as Error).message}`)
    }
  })

}
