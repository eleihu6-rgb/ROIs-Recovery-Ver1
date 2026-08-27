import { z } from 'zod'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../../config/index.js'
import { loadPbsBusinessNow } from '../../services/pbs-business-time.js'
import { success, error } from '../../utils/response.js'
import { asSafeIdentifier } from '../../utils/schema-identifier.js'
import { requireMenuAccess } from '../../utils/menu-access.js'

const PBS_PERIOD_MENU_CODE = 'PBS_PERIOD'

const COMPUTED_STAGES = ['NOT_OPEN', 'OPEN', 'CLOSED', 'INCOMPLETE'] as const
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const FRIDAY = 5

const WALL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/

const isValidWallDateTime = (value: string): boolean => {
  const match = WALL_DATE_TIME_PATTERN.exec(value)
  if (!match) return false
  const [, year, month, day, hour, minute, second] = match.map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
    && candidate.getUTCHours() === hour
    && candidate.getUTCMinutes() === minute
    && candidate.getUTCSeconds() === second
}

const requiredDate = z.string().trim().refine(isValidWallDateTime, {
  message: 'Expected local wall time in YYYY-MM-DDTHH:mm:ss format',
})

const listQuerySchema = z.object({
  periodCode: z.string().trim().max(20).optional(),
  filiale: z.never().optional(),
  division: z.never().optional(),
  status: z.enum(COMPUTED_STAGES).optional(),
})

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

const periodBodyFields = {
  periodCode: z.string().trim().min(1).max(20),
  rosterPeriodId: z.never().optional(),
  filiale: z.never().optional(),
  division: z.never().optional(),
  awardRunAt: z.never().optional(),
  awardPublishAt: requiredDate,
  awardFinalAt: requiredDate,
  misAwardDeadlineAt: requiredDate,
  maxTiers: z.never().optional(),
  description: z.never().optional(),
  rpStart: requiredDate,
  rpEnd: requiredDate,
  bidOpenAt: requiredDate,
  bidCloseAt: requiredDate,
}

const validatePeriodDates = (
  value: Partial<Record<
    'rpStart' | 'rpEnd' | 'bidOpenAt' | 'bidCloseAt' | 'awardPublishAt' | 'awardFinalAt' | 'misAwardDeadlineAt',
    string
  >>,
  context: z.RefinementCtx,
): void => {
  if (value.rpStart && value.rpEnd && value.rpStart > value.rpEnd) {
    context.addIssue({ code: 'custom', path: ['rpEnd'], message: 'Roster End must be on or after Roster Start' })
  }
  if (value.bidOpenAt && value.bidCloseAt && value.bidOpenAt >= value.bidCloseAt) {
    context.addIssue({ code: 'custom', path: ['bidCloseAt'], message: 'Bid Close must be after Bid Open' })
  }
  if (value.bidCloseAt && value.awardPublishAt && value.bidCloseAt > value.awardPublishAt) {
    context.addIssue({ code: 'custom', path: ['awardPublishAt'], message: 'Award Publish must be on or after Bid Close' })
  }
  if (value.awardPublishAt && value.awardFinalAt && value.awardPublishAt > value.awardFinalAt) {
    context.addIssue({ code: 'custom', path: ['awardFinalAt'], message: 'Final At must be on or after Award Publish' })
  }
  if (value.awardFinalAt && value.misAwardDeadlineAt && value.awardFinalAt >= value.misAwardDeadlineAt) {
    context.addIssue({
      code: 'custom',
      path: ['misAwardDeadlineAt'],
      message: 'Mis-award Deadline must be after Final At',
    })
  }
}

const periodBodySchema = z.object(periodBodyFields).superRefine(validatePeriodDates)

const updateBodySchema = z.object(periodBodyFields).partial().superRefine(validatePeriodDates)
const idParamSchema = z.object({ id: z.coerce.number().int().positive() })
const generateYearBodySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  filiale: z.never().optional(),
  division: z.never().optional(),
  maxTiers: z.never().optional(),
  bidOpenTime: timeSchema.default('00:00'),
  bidCloseTime: timeSchema.default('23:59'),
})

interface PbsPeriodRow {
  id: string | number
  period_code: string
  rp_start: string | Date
  rp_end: string | Date
  bid_open_at: string | Date
  bid_close_at: string | Date
  award_publish_at: string | Date
  award_final_at: string | Date
  mis_award_deadline_at: string | Date
  status: string
  first_published_at?: string | Date | null
  latest_published_at?: string | Date | null
  latest_publish_batch_id?: string | number | null
  created_at?: string | Date
  updated_at?: string | Date
}

interface GeneratedPeriodCandidate {
  periodCode: string
  rpStart: string
  rpEnd: string
  bidOpenAt: string
  bidCloseAt: string
  awardPublishAt: string
  awardFinalAt: string
  misAwardDeadlineAt: string
}

type ComputedStage = typeof COMPUTED_STAGES[number]

const formatUtcWallDateTime = (value: Date): string => [
  value.getUTCFullYear(),
  '-',
  String(value.getUTCMonth() + 1).padStart(2, '0'),
  '-',
  String(value.getUTCDate()).padStart(2, '0'),
  'T',
  String(value.getUTCHours()).padStart(2, '0'),
  ':',
  String(value.getUTCMinutes()).padStart(2, '0'),
  ':',
  String(value.getUTCSeconds()).padStart(2, '0'),
].join('')

const asWallDateTime = (value: string | Date | null | undefined): string | null => {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return formatUtcWallDateTime(value)
  const normalized = String(value).replace(' ', 'T').slice(0, 19)
  return isValidWallDateTime(normalized) ? normalized : String(value)
}

const asInstantIso = (value: string | Date | null | undefined): string | null => {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const computePeriodStage = (
  bidOpenAt: string | Date | null | undefined,
  bidCloseAt: string | Date | null | undefined,
  businessNow: Date,
): ComputedStage => {
  const bidOpen = asWallDateTime(bidOpenAt)
  const bidClose = asWallDateTime(bidCloseAt)
  const nowWall = formatUtcWallDateTime(businessNow)

  if (!bidOpen || !bidClose || !isValidWallDateTime(bidOpen) || !isValidWallDateTime(bidClose)) {
    return 'INCOMPLETE'
  }

  if (bidOpen > nowWall) {
    return 'NOT_OPEN'
  }

  if (bidClose <= nowWall) {
    return 'CLOSED'
  }

  return 'OPEN'
}

const mapPeriodRow = (row: PbsPeriodRow, businessNow: Date) => ({
  id: Number(row.id),
  periodCode: row.period_code,
  rpStart: asWallDateTime(row.rp_start),
  rpEnd: asWallDateTime(row.rp_end),
  bidOpenAt: asWallDateTime(row.bid_open_at),
  bidCloseAt: asWallDateTime(row.bid_close_at),
  awardPublishAt: asWallDateTime(row.award_publish_at),
  awardFinalAt: asWallDateTime(row.award_final_at),
  misAwardDeadlineAt: asWallDateTime(row.mis_award_deadline_at),
  status: row.status,
  computedStage: computePeriodStage(row.bid_open_at, row.bid_close_at, businessNow),
  firstPublishedAt: asInstantIso(row.first_published_at),
  latestPublishedAt: asInstantIso(row.latest_published_at),
  latestPublishBatchId: row.latest_publish_batch_id === null || row.latest_publish_batch_id === undefined
    ? null
    : Number(row.latest_publish_batch_id),
  createdAt: asInstantIso(row.created_at),
  updatedAt: asInstantIso(row.updated_at),
})

const parseTime = (value: string): [number, number] => {
  const [hour, minute] = value.split(':').map(Number)
  return [hour, minute]
}

const firstFridayOfPreviousMonth = (
  targetYear: number,
  targetMonthIndex: number,
  hour: number,
  minute: number,
): Date => {
  const firstDay = new Date(Date.UTC(targetYear, targetMonthIndex - 1, 1, hour, minute, 0, 0))
  const dayOffset = (FRIDAY - firstDay.getUTCDay() + 7) % 7
  return new Date(Date.UTC(
    firstDay.getUTCFullYear(),
    firstDay.getUTCMonth(),
    firstDay.getUTCDate() + dayOffset,
    hour,
    minute,
    0,
    0,
  ))
}

const rosterRangeForMonth = (year: number, month: number): { rpStart: Date; rpEnd: Date } => {
  if (month === 1) {
    return { rpStart: new Date(Date.UTC(year, 0, 1)), rpEnd: new Date(Date.UTC(year, 0, 30)) }
  }
  if (month === 2) {
    return { rpStart: new Date(Date.UTC(year, 0, 31)), rpEnd: new Date(Date.UTC(year, 2, 1)) }
  }
  if (month === 3) {
    return { rpStart: new Date(Date.UTC(year, 2, 2)), rpEnd: new Date(Date.UTC(year, 2, 31)) }
  }
  return {
    rpStart: new Date(Date.UTC(year, month - 1, 1)),
    rpEnd: new Date(Date.UTC(year, month, 0)),
  }
}

const buildYearCandidates = (input: z.infer<typeof generateYearBodySchema>): GeneratedPeriodCandidate[] => {
  const [openHour, openMinute] = parseTime(input.bidOpenTime)
  const [closeHour, closeMinute] = parseTime(input.bidCloseTime)

  return MONTH_LABELS.map((month, monthIndex) => {
    const bidOpenAt = firstFridayOfPreviousMonth(input.year, monthIndex, openHour, openMinute)
    const bidCloseAt = new Date(Date.UTC(
      bidOpenAt.getUTCFullYear(),
      bidOpenAt.getUTCMonth(),
      bidOpenAt.getUTCDate() + 7,
      closeHour,
      closeMinute,
      0,
      0,
    ))
    const awardPublishAt = new Date(bidCloseAt)
    awardPublishAt.setUTCDate(awardPublishAt.getUTCDate() + 10)
    const awardFinalAt = new Date(awardPublishAt)
    awardFinalAt.setUTCDate(awardFinalAt.getUTCDate() + 2)
    const misAwardDeadlineAt = new Date(awardFinalAt)
    misAwardDeadlineAt.setUTCDate(misAwardDeadlineAt.getUTCDate() + 4)
    const rosterRange = rosterRangeForMonth(input.year, monthIndex + 1)

    return {
      periodCode: `${month} ${input.year}`,
      rpStart: formatUtcWallDateTime(rosterRange.rpStart),
      rpEnd: formatUtcWallDateTime(rosterRange.rpEnd),
      bidOpenAt: formatUtcWallDateTime(bidOpenAt),
      bidCloseAt: formatUtcWallDateTime(bidCloseAt),
      awardPublishAt: formatUtcWallDateTime(awardPublishAt),
      awardFinalAt: formatUtcWallDateTime(awardFinalAt),
      misAwardDeadlineAt: formatUtcWallDateTime(misAwardDeadlineAt),
    }
  })
}

const periodColumnsSql = () => `
    id,
    pbs_period_code as period_code,
    to_char(rp_start, 'YYYY-MM-DD"T"HH24:MI:SS') as rp_start,
    to_char(rp_end, 'YYYY-MM-DD"T"HH24:MI:SS') as rp_end,
    to_char(pbs_bid_open_at, 'YYYY-MM-DD"T"HH24:MI:SS') as bid_open_at,
    to_char(pbs_bid_close_at, 'YYYY-MM-DD"T"HH24:MI:SS') as bid_close_at,
    to_char(pbs_award_publish_at, 'YYYY-MM-DD"T"HH24:MI:SS') as award_publish_at,
    to_char(pbs_award_final_at, 'YYYY-MM-DD"T"HH24:MI:SS') as award_final_at,
    to_char(pbs_mis_award_deadline_at, 'YYYY-MM-DD"T"HH24:MI:SS') as mis_award_deadline_at,
    coalesce(pbs_status, 'DRAFT')::varchar as status,
    created_at,
    updated_at
`

const selectSql = (liveSchema: string): string => `
  select
    ${periodColumnsSql()},
    publication.first_published_at,
    publication.latest_published_at,
    publication.latest_publish_batch_id
  from ${liveSchema}.roster_period
  left join lateral (
    select
      min(record.created_at) as first_published_at,
      max(record.created_at) as latest_published_at,
      (array_agg(record.batch_id order by record.created_at desc, record.id desc))[1] as latest_publish_batch_id
    from ${liveSchema}.schedule_publish_record record
    where record.roster_period_id = roster_period.id
      and record.published = 1
      and record.str_dt::date <= roster_period.rp_start::date
      and record.end_dt::date >= roster_period.rp_end::date
  ) publication on true
`

const loadExistingPeriods = async (
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  liveSchema: string,
  candidates: GeneratedPeriodCandidate[],
): Promise<Map<string, PbsPeriodRow>> => {
  const periodCodes = candidates.map((candidate) => candidate.periodCode)
  const result = await client.query(
    `${selectSql(liveSchema)}
     where pbs_period_code = any($1::text[])`,
    [periodCodes],
  )
  return new Map((result.rows as PbsPeriodRow[]).map((row) => [row.period_code, row]))
}

const mapYearPreviewItems = (
  candidates: GeneratedPeriodCandidate[],
  existingByCode: Map<string, PbsPeriodRow>,
  businessNow: Date,
) => candidates.map((candidate) => {
  const existing = existingByCode.get(candidate.periodCode)
  return {
    ...candidate,
    computedStage: existing
      ? computePeriodStage(existing.bid_open_at, existing.bid_close_at, businessNow)
      : computePeriodStage(candidate.bidOpenAt, candidate.bidCloseAt, businessNow),
    exists: Boolean(existing),
    existingId: existing ? Number(existing.id) : null,
  }
})

const monthNumberFromPeriodCode = (periodCode: string): number | null => {
  const [monthLabel] = periodCode.trim().split(/\s+/)
  const index = MONTH_LABELS.findIndex((label) => label.toLowerCase() === monthLabel?.toLowerCase())
  return index >= 0 ? index + 1 : null
}

const yearFromPeriodCode = (periodCode: string): number | null => {
  const match = /\b(\d{4})\b/.exec(periodCode)
  if (!match) return null
  const year = Number(match[1])
  return Number.isInteger(year) ? year : null
}

const rosterDefaultsFromPeriodCode = (periodCode: string) => {
  const year = yearFromPeriodCode(periodCode)
  const month = monthNumberFromPeriodCode(periodCode)

  if (!year || !month) {
    return null
  }

  const monthText = String(month).padStart(2, '0')
  const { rpStart, rpEnd } = rosterRangeForMonth(year, month)
  const rosterPublicationDate = new Date(Date.UTC(year, month - 1, 20, 0, 0, 0, 0))
  const paidDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))

  return {
    year: String(year),
    name: `${year}-${monthText}`,
    rosterPeriod: `${year}RP${monthText}`,
    rpStart: formatUtcWallDateTime(rpStart),
    rpEnd: formatUtcWallDateTime(rpEnd),
    rosterPublicationDate: formatUtcWallDateTime(rosterPublicationDate),
    paidDate: formatUtcWallDateTime(paidDate),
  }
}

class PeriodConflictError extends Error {}

const assertNoPeriodOverlap = async (
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  liveSchema: string,
  input: {
    excludeId?: number | null
    rpStart: string
    rpEnd: string
    bidOpenAt: string
    bidCloseAt: string
  },
): Promise<void> => {
  const result = await client.query(
    `select
       exists (
         select 1 from ${liveSchema}.roster_period other
         where other.id <> coalesce($1::bigint, -1)
           and other.pbs_period_code is not null
           and other.rp_start::date <= $3::date
           and other.rp_end::date >= $2::date
       ) as rp_overlap,
       exists (
         select 1 from ${liveSchema}.roster_period other
         where other.id <> coalesce($1::bigint, -1)
           and other.pbs_period_code is not null
           and other.pbs_bid_open_at < $5::timestamp
           and other.pbs_bid_close_at > $4::timestamp
       ) as bid_overlap`,
    [input.excludeId ?? null, input.rpStart, input.rpEnd, input.bidOpenAt, input.bidCloseAt],
  )
  const row = result.rows[0]
  if (row?.rp_overlap) throw new PeriodConflictError('Roster period overlaps another PBS period')
  if (row?.bid_overlap) throw new PeriodConflictError('Bid window overlaps another PBS period')
}

const createOrUpdateRosterPeriodByPeriodCode = async (
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  liveSchema: string,
  userCode: string,
  body: z.infer<typeof periodBodySchema>,
) => {
  const defaults = rosterDefaultsFromPeriodCode(body.periodCode)

  if (!defaults) {
    throw new Error(`Cannot derive roster period from PBS period code: ${body.periodCode}`)
  }

  const updated = await client.query(
    `update ${liveSchema}.roster_period
     set updated_by = $1,
         updated_at = now(),
         pbs_period_code = $2,
         rp_start = $3,
         rp_end = $4,
         pbs_bid_open_at = $5,
         pbs_bid_close_at = $6,
         pbs_award_publish_at = $7,
         pbs_award_final_at = $8,
         pbs_mis_award_deadline_at = $9,
         pbs_status = coalesce(pbs_status, 'DRAFT')
     where name = $10
        or roster_period = $11
     returning ${periodColumnsSql()}`,
    [
      userCode,
      body.periodCode,
      body.rpStart,
      body.rpEnd,
      body.bidOpenAt,
      body.bidCloseAt,
      body.awardPublishAt,
      body.awardFinalAt,
      body.misAwardDeadlineAt,
      defaults.name,
      defaults.rosterPeriod,
    ],
  )

  if (updated.rows.length > 0) {
    return updated
  }

  return client.query(
    `insert into ${liveSchema}.roster_period (
       created_by,
       updated_by,
       year,
       name,
       roster_period,
       rp_start,
       rp_end,
       roster_publication_date,
       paid_date,
       lock_status,
       pbs_period_code,
       pbs_bid_open_at,
       pbs_bid_close_at,
       pbs_award_publish_at,
       pbs_award_final_at,
       pbs_mis_award_deadline_at,
       pbs_status
     )
     values ($1,$1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12,$13,$14,'DRAFT')
     returning ${periodColumnsSql()}`,
    [
      userCode,
      defaults.year,
      defaults.name,
      defaults.rosterPeriod,
      body.rpStart,
      body.rpEnd,
      defaults.rosterPublicationDate,
      defaults.paidDate,
      body.periodCode,
      body.bidOpenAt,
      body.bidCloseAt,
      body.awardPublishAt,
      body.awardFinalAt,
      body.misAwardDeadlineAt,
    ],
  )
}

const createOrUpdateRosterPeriodForCandidate = async (
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  liveSchema: string,
  userCode: string,
  candidate: GeneratedPeriodCandidate,
) => createOrUpdateRosterPeriodByPeriodCode(client, liveSchema, userCode, {
  periodCode: candidate.periodCode,
  rpStart: candidate.rpStart,
  rpEnd: candidate.rpEnd,
  bidOpenAt: candidate.bidOpenAt,
  bidCloseAt: candidate.bidCloseAt,
  awardPublishAt: candidate.awardPublishAt,
  awardFinalAt: candidate.awardFinalAt,
  misAwardDeadlineAt: candidate.misAwardDeadlineAt,
})

export default async function pbsPeriodAdminRoutes(fastify: FastifyInstance) {
  const pbsSchema = asSafeIdentifier(env.PBS_SCHEMA)
  const liveSchema = asSafeIdentifier(env.LIVE_SCHEMA)

  const requirePbsPeriodPermission = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return false
    }
    return requireMenuAccess(fastify, authUser, reply, PBS_PERIOD_MENU_CODE)
  }

  fastify.get('/period-admin', async (request, reply) => {
    if (!(await requirePbsPeriodPermission(request, reply))) return reply

    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return error(reply, 400, 'Invalid period filters')
    }

    const conditions: string[] = [
      'pbs_period_code is not null',
      "nullif(pbs_period_code, '') is not null",
    ]
    const params: unknown[] = []

    if (parsed.data.periodCode) {
      params.push(`%${parsed.data.periodCode}%`)
      conditions.push(`pbs_period_code ilike $${params.length}`)
    }
    const whereSql = ` where ${conditions.join(' and ')}`
    const querySql = `${selectSql(liveSchema)}${whereSql} order by pbs_bid_open_at asc, id asc limit 500`

    const client = await fastify.pgPool.connect()
    try {
      const businessNow = await loadPbsBusinessNow(client, liveSchema)
      const result = await client.query(querySql, params)
      const mappedRows = (result.rows as PbsPeriodRow[]).map((row) => mapPeriodRow(row, businessNow))
      const rows = parsed.data.status
        ? mappedRows.filter((row) => row.computedStage === parsed.data.status)
        : mappedRows
      return success(reply, { rows, total: rows.length })
    } finally {
      client.release()
    }
  })

  fastify.post('/period-admin/generate-year/preview', async (request, reply) => {
    if (!(await requirePbsPeriodPermission(request, reply))) return reply

    const parsed = generateYearBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return error(reply, 400, 'Invalid PBS period year generation payload')
    }

    const candidates = buildYearCandidates(parsed.data)
    const client = await fastify.pgPool.connect()
    try {
      const businessNow = await loadPbsBusinessNow(client, liveSchema)
      const existingByCode = await loadExistingPeriods(client, liveSchema, candidates)
      const items = mapYearPreviewItems(candidates, existingByCode, businessNow)
      return success(reply, {
        items,
        total: items.length,
        newCount: items.filter((item) => !item.exists).length,
        existingCount: items.filter((item) => item.exists).length,
      })
    } finally {
      client.release()
    }
  })

  fastify.post('/period-admin/generate-year', async (request, reply) => {
    if (!(await requirePbsPeriodPermission(request, reply))) return reply

    const parsed = generateYearBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return error(reply, 400, 'Invalid PBS period year generation payload')
    }

    const candidates = buildYearCandidates(parsed.data)
    const client = await fastify.pgPool.connect()
    try {
      await client.query('begin')
      const businessNow = await loadPbsBusinessNow(client, liveSchema)
      const existingByCode = await loadExistingPeriods(client, liveSchema, candidates)
      const missing = candidates.filter((candidate) => !existingByCode.has(candidate.periodCode))

      const createdRows: PbsPeriodRow[] = []
      for (const candidate of missing) {
        await assertNoPeriodOverlap(client, liveSchema, {
          rpStart: candidate.rpStart,
          rpEnd: candidate.rpEnd,
          bidOpenAt: candidate.bidOpenAt,
          bidCloseAt: candidate.bidCloseAt,
        })
        const result = await createOrUpdateRosterPeriodForCandidate(
          client,
          liveSchema,
          request.authUser?.userCode ?? 'system',
          candidate,
        )
        createdRows.push(...result.rows as PbsPeriodRow[])
      }
      await client.query('commit')

      const createdByCode = new Map(createdRows.map((row) => [row.period_code, row]))
      const items = candidates.map((candidate) => ({
        ...candidate,
        computedStage: computePeriodStage(
          existingByCode.get(candidate.periodCode)?.bid_open_at ?? createdByCode.get(candidate.periodCode)?.bid_open_at ?? candidate.bidOpenAt,
          existingByCode.get(candidate.periodCode)?.bid_close_at ?? createdByCode.get(candidate.periodCode)?.bid_close_at ?? candidate.bidCloseAt,
          businessNow,
        ),
        exists: existingByCode.has(candidate.periodCode) || createdByCode.has(candidate.periodCode),
        existingId: Number(existingByCode.get(candidate.periodCode)?.id ?? createdByCode.get(candidate.periodCode)?.id ?? 0) || null,
        created: createdByCode.has(candidate.periodCode),
      }))

      return success(reply, {
        items,
        created: createdRows.map((row) => mapPeriodRow(row, businessNow)),
        createdCount: createdRows.length,
        skippedCount: candidates.length - createdRows.length,
      })
    } catch (err) {
      await client.query('rollback').catch(() => undefined)
      if (err instanceof PeriodConflictError) {
        return error(reply, 409, err.message)
      }
      fastify.log.error({ err }, 'Failed to generate PBS periods')
      return error(reply, 500, 'Failed to generate PBS periods')
    } finally {
      client.release()
    }
  })

  fastify.post('/period-admin', async (request, reply) => {
    if (!(await requirePbsPeriodPermission(request, reply))) return reply

    const parsed = periodBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return error(reply, 400, 'Invalid PBS period payload')
    }

    const body = parsed.data
    const userCode = request.authUser?.userCode ?? 'system'
    const client = await fastify.pgPool.connect()
    try {
      await client.query('begin')
      const defaults = rosterDefaultsFromPeriodCode(body.periodCode)
      const existing = defaults
        ? await client.query(
            `select id from ${liveSchema}.roster_period where name = $1 or roster_period = $2 limit 1`,
            [defaults.name, defaults.rosterPeriod],
          )
        : { rows: [] }
      await assertNoPeriodOverlap(client, liveSchema, {
        excludeId: Number(existing.rows[0]?.id ?? 0) || null,
        rpStart: body.rpStart,
        rpEnd: body.rpEnd,
        bidOpenAt: body.bidOpenAt,
        bidCloseAt: body.bidCloseAt,
      })
      const result = await createOrUpdateRosterPeriodByPeriodCode(client, liveSchema, userCode, body)
      await client.query('commit')

      if (result.rows.length === 0) {
        return error(reply, 404, 'Roster period not found')
      }
      const businessNow = await loadPbsBusinessNow(client, liveSchema)
      return success(reply, mapPeriodRow(result.rows[0] as PbsPeriodRow, businessNow))
    } catch (err) {
      await client.query('rollback').catch(() => undefined)
      if (err instanceof PeriodConflictError) {
        return error(reply, 409, err.message)
      }
      fastify.log.error({ err }, 'Failed to create PBS period')
      return error(reply, 500, 'Failed to create PBS period')
    } finally {
      client.release()
    }
  })

  fastify.patch('/period-admin/:id', async (request, reply) => {
    if (!(await requirePbsPeriodPermission(request, reply))) return reply

    const parsedParams = idParamSchema.safeParse(request.params)
    const parsedBody = updateBodySchema.safeParse(request.body)
    if (!parsedParams.success || !parsedBody.success) {
      return error(reply, 400, 'Invalid PBS period update')
    }

    const updates: string[] = ['updated_by = $1', 'updated_at = now()']
    const params: unknown[] = [request.authUser?.userCode ?? 'system']

    const pushUpdate = (column: string, value: unknown): void => {
      params.push(value)
      updates.push(`${column} = $${params.length}`)
    }

    const body = parsedBody.data
    if (body.periodCode !== undefined) pushUpdate('pbs_period_code', body.periodCode)
    if (body.rpStart !== undefined) pushUpdate('rp_start', body.rpStart)
    if (body.rpEnd !== undefined) pushUpdate('rp_end', body.rpEnd)
    if (body.bidOpenAt !== undefined) pushUpdate('pbs_bid_open_at', body.bidOpenAt)
    if (body.bidCloseAt !== undefined) pushUpdate('pbs_bid_close_at', body.bidCloseAt)
    if (body.awardPublishAt !== undefined) pushUpdate('pbs_award_publish_at', body.awardPublishAt)
    if (body.awardFinalAt !== undefined) pushUpdate('pbs_award_final_at', body.awardFinalAt)
    if (body.misAwardDeadlineAt !== undefined) {
      pushUpdate('pbs_mis_award_deadline_at', body.misAwardDeadlineAt)
    }

    params.push(parsedParams.data.id)

    const client = await fastify.pgPool.connect()
    try {
      const currentResult = await client.query(
        `select
           to_char(rp_start, 'YYYY-MM-DD"T"HH24:MI:SS') as rp_start,
           to_char(rp_end, 'YYYY-MM-DD"T"HH24:MI:SS') as rp_end,
           to_char(pbs_bid_open_at, 'YYYY-MM-DD"T"HH24:MI:SS') as pbs_bid_open_at,
           to_char(pbs_bid_close_at, 'YYYY-MM-DD"T"HH24:MI:SS') as pbs_bid_close_at,
           to_char(pbs_award_publish_at, 'YYYY-MM-DD"T"HH24:MI:SS') as pbs_award_publish_at,
           to_char(pbs_award_final_at, 'YYYY-MM-DD"T"HH24:MI:SS') as pbs_award_final_at,
           to_char(pbs_mis_award_deadline_at, 'YYYY-MM-DD"T"HH24:MI:SS') as pbs_mis_award_deadline_at
         from ${liveSchema}.roster_period where id = $1`,
        [parsedParams.data.id],
      )
      const current = currentResult.rows[0] as Record<string, string | Date | null> | undefined
      if (!current) return error(reply, 404, 'PBS period not found')
      const merged = {
        rpStart: body.rpStart ?? asWallDateTime(current.rp_start)!,
        rpEnd: body.rpEnd ?? asWallDateTime(current.rp_end)!,
        bidOpenAt: body.bidOpenAt ?? asWallDateTime(current.pbs_bid_open_at)!,
        bidCloseAt: body.bidCloseAt ?? asWallDateTime(current.pbs_bid_close_at)!,
        awardPublishAt: body.awardPublishAt ?? asWallDateTime(current.pbs_award_publish_at),
        awardFinalAt: body.awardFinalAt ?? asWallDateTime(current.pbs_award_final_at),
        misAwardDeadlineAt: body.misAwardDeadlineAt ?? asWallDateTime(current.pbs_mis_award_deadline_at),
      }
      if (merged.rpStart > merged.rpEnd) {
        return error(reply, 400, 'Roster End must be on or after Roster Start')
      }
      if (merged.bidOpenAt >= merged.bidCloseAt) {
        return error(reply, 400, 'Bid Close must be after Bid Open')
      }
      if (!merged.awardPublishAt || merged.bidCloseAt > merged.awardPublishAt) {
        return error(reply, 400, 'Award Publish must be on or after Bid Close')
      }
      if (!merged.awardFinalAt || merged.awardPublishAt > merged.awardFinalAt) {
        return error(reply, 400, 'Final At must be on or after Award Publish')
      }
      if (!merged.misAwardDeadlineAt || merged.awardFinalAt >= merged.misAwardDeadlineAt) {
        return error(reply, 400, 'Mis-award Deadline must be after Final At')
      }
      await assertNoPeriodOverlap(client, liveSchema, {
        excludeId: parsedParams.data.id,
        rpStart: merged.rpStart,
        rpEnd: merged.rpEnd,
        bidOpenAt: merged.bidOpenAt,
        bidCloseAt: merged.bidCloseAt,
      })
      const result = await client.query(
        `update ${liveSchema}.roster_period
         set ${updates.join(', ')}
         where id = $${params.length}
         returning ${periodColumnsSql()}`,
        params,
      )
      if (result.rows.length === 0) {
        return error(reply, 404, 'PBS period not found')
      }
      const businessNow = await loadPbsBusinessNow(client, liveSchema)
      return success(reply, mapPeriodRow(result.rows[0] as PbsPeriodRow, businessNow))
    } catch (err) {
      if (err instanceof PeriodConflictError) {
        return error(reply, 409, err.message)
      }
      fastify.log.error({ err }, 'Failed to update PBS period')
      return error(reply, 500, 'Failed to update PBS period')
    } finally {
      client.release()
    }
  })

  fastify.delete('/period-admin/:id', async (request, reply) => {
    if (!(await requirePbsPeriodPermission(request, reply))) return reply

    const parsedParams = idParamSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return error(reply, 400, 'Invalid PBS period id')
    }

    const client = await fastify.pgPool.connect()
    try {
      const usage = await client.query(
        `select
           (select count(*)::int from ${pbsSchema}.pbs_bid where roster_period_id = $1) as bid_count,
           (select count(*)::int from ${pbsSchema}.pbs_award_result where roster_period_id = $1) as award_count`,
        [parsedParams.data.id],
      )
      const bidCount = Number(usage.rows[0]?.bid_count ?? 0)
      const awardCount = Number(usage.rows[0]?.award_count ?? 0)
      if (bidCount > 0 || awardCount > 0) {
        return error(reply, 409, 'PBS period is in use and cannot be deleted')
      }

      const result = await client.query(
        `update ${liveSchema}.roster_period
         set updated_by = $1,
             updated_at = now(),
             pbs_period_code = null,
             pbs_bid_open_at = null,
             pbs_bid_close_at = null,
             pbs_award_publish_at = null,
             pbs_status = 'DRAFT'
         where id = $2
         returning id`,
        [request.authUser?.userCode ?? 'system', parsedParams.data.id],
      )
      if (result.rows.length === 0) {
        return error(reply, 404, 'PBS period not found')
      }
      return success(reply, { id: parsedParams.data.id })
    } catch (err) {
      fastify.log.error({ err }, 'Failed to delete PBS period')
      return error(reply, 500, 'Failed to delete PBS period')
    } finally {
      client.release()
    }
  })
}
