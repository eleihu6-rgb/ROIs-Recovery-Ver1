import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  formatPbsEfficientFlyingPercentileDefinition,
  formatPbsMinimumBaseLayoverDefinition,
  formatPbsMinimumTimeBetweenFlightsDefinition,
  formatPbsRedeyeDefinition,
  formatPbsWeekendDefinition,
  getPbsWeekendDurationMinutes,
  parsePbsEfficientFlyingPercentileDefinition,
  parsePbsMinimumBaseLayoverDefinition,
  parsePbsMinimumTimeBetweenFlightsDefinition,
  parsePbsRedeyeDefinition,
  pbsBidDefinitionCodes,
} from '../../../../packages/contracts/pbs-bid-definitions.js'
import { env } from '../../config/index.js'
import { error, success } from '../../utils/response.js'
import { asSafeIdentifier } from '../../utils/schema-identifier.js'
import { requireMenuAccess } from '../../utils/menu-access.js'

const PBS_BID_DEFINITIONS_MENU_CODE = 'PBS_BID_DEFINITIONS'

const clockTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const endClockTimeSchema = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/)
const redeyeBodySchema = z.object({
  startTime: clockTimeSchema,
  endTime: clockTimeSchema,
}).strict().refine((value) => value.startTime !== value.endTime, {
  message: 'Redeye start and end time must be different',
  path: ['endTime'],
})
const weekendBodySchema = z.object({
  startDayCode: z.string().trim().min(1).max(10).transform((value) => value.toUpperCase()),
  startTime: clockTimeSchema,
  endDayCode: z.string().trim().min(1).max(10).transform((value) => value.toUpperCase()),
  endTime: endClockTimeSchema,
}).strict()
const creditWindowBodySchema = z.object({
  deltaHours: z.coerce.number().int().min(1).max(20),
}).strict()
const minimumBaseLayoverBodySchema = z.object({
  minDuration: z.string().trim().regex(/^\d{1,3}:[0-5]\d$/),
}).strict()
const efficientFlyingPercentileBodySchema = z.object({
  percentile: z.number().int().min(1).max(50),
}).strict()
const minimumTimeBetweenFlightsBodySchema = z.object({
  minimumMinutes: z.number().int().min(1).max(59_999),
}).strict()

type DictionaryRow = {
  parent_code: string | null
  code: string
  name: string | null
  code_value: string | null
  updated_by: string
  updated_at: string | Date
}

const asIso = (value: string | Date): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

const latestAudit = (rows: DictionaryRow[]) => {
  const latest = [...rows].sort((left, right) =>
    new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())[0]
  return {
    updatedBy: latest?.updated_by ?? 'system',
    updatedAt: latest ? asIso(latest.updated_at) : null,
  }
}

const loadDefinitionRows = async (
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  liveSchema: string,
): Promise<DictionaryRow[]> => {
  const result = await client.query(
    `select parent_code, code, name, code_value, updated_by, updated_at
     from ${liveSchema}.dictionary
     where parent_code = any($1::text[])
     order by parent_code, idx nulls last, code`,
    [[
      'DOW',
      pbsBidDefinitionCodes.redeyeParent,
      pbsBidDefinitionCodes.weekendParent,
      pbsBidDefinitionCodes.creditWindowParent,
      pbsBidDefinitionCodes.minimumBaseLayoverParent,
      pbsBidDefinitionCodes.efficientFlyingParent,
    ]],
  )
  return result.rows as DictionaryRow[]
}

const mapDefinitions = (rows: DictionaryRow[]) => {
  const value = (parentCode: string, code: string) => rows.find((row) =>
    row.parent_code === parentCode && row.code === code)?.code_value?.trim() ?? ''
  const definitionRows = (parentCode: string, codes: string[]) => rows.filter((row) =>
    row.parent_code === parentCode && codes.includes(row.code))

  const redeyeRows = definitionRows(pbsBidDefinitionCodes.redeyeParent, [
    pbsBidDefinitionCodes.redeyeStartTime,
    pbsBidDefinitionCodes.redeyeEndTime,
  ])
  const redeye = parsePbsRedeyeDefinition({
    startTime: value(pbsBidDefinitionCodes.redeyeParent, pbsBidDefinitionCodes.redeyeStartTime),
    endTime: value(pbsBidDefinitionCodes.redeyeParent, pbsBidDefinitionCodes.redeyeEndTime),
  })

  const weekdays = rows
    .filter((row) => row.parent_code === 'DOW')
    .map((row) => ({
      code: row.code.toUpperCase(),
      name: row.name?.trim() || row.code,
      isoDay: Number(row.code_value),
    }))
    .filter((day) => Number.isInteger(day.isoDay) && day.isoDay >= 1 && day.isoDay <= 7)
  const startDayCode = value(pbsBidDefinitionCodes.weekendParent, pbsBidDefinitionCodes.weekendStartDay).toUpperCase()
  const endDayCode = value(pbsBidDefinitionCodes.weekendParent, pbsBidDefinitionCodes.weekendEndDay).toUpperCase()
  const startTime = value(pbsBidDefinitionCodes.weekendParent, pbsBidDefinitionCodes.weekendStartTime)
  const endTime = value(pbsBidDefinitionCodes.weekendParent, pbsBidDefinitionCodes.weekendEndTime)
  const startDay = weekdays.find((day) => day.code === startDayCode)
  const endDay = weekdays.find((day) => day.code === endDayCode)
  const weekendDurationMinutes = startDay && endDay
    ? getPbsWeekendDurationMinutes({
      startDayIso: startDay.isoDay,
      startTime,
      endDayIso: endDay.isoDay,
      endTime,
    })
    : null
  const weekend = weekendDurationMinutes
    ? {
      available: true as const,
      startDayCode,
      startDayName: startDay!.name,
      startTime,
      endDayCode,
      endDayName: endDay!.name,
      endTime,
      durationMinutes: weekendDurationMinutes,
      version: `${startDayCode}|${startTime}|${endDayCode}|${endTime}`,
    }
    : { available: false as const }

  const creditRows = definitionRows(pbsBidDefinitionCodes.creditWindowParent, [
    pbsBidDefinitionCodes.creditWindowDeltaHours,
  ])
  const deltaHours = Number(value(
    pbsBidDefinitionCodes.creditWindowParent,
    pbsBidDefinitionCodes.creditWindowDeltaHours,
  ))
  const creditWindow = Number.isInteger(deltaHours) && deltaHours >= 1 && deltaHours <= 20
    ? { available: true as const, deltaHours, version: String(deltaHours) }
    : { available: false as const }
  const minimumBaseLayoverRows = definitionRows(pbsBidDefinitionCodes.minimumBaseLayoverParent, [
    pbsBidDefinitionCodes.minimumBaseLayoverDuration,
  ])
  const minimumBaseLayover = parsePbsMinimumBaseLayoverDefinition({
    minDuration: value(
      pbsBidDefinitionCodes.minimumBaseLayoverParent,
      pbsBidDefinitionCodes.minimumBaseLayoverDuration,
    ),
  })
  const efficientFlyingRows = definitionRows(pbsBidDefinitionCodes.efficientFlyingParent, [
    pbsBidDefinitionCodes.efficientFlyingPercentile,
  ])
  const efficientFlyingPercentile = parsePbsEfficientFlyingPercentileDefinition(
    efficientFlyingRows.length === 1
      ? { percentile: efficientFlyingRows[0]?.code_value }
      : undefined,
  )
  const minimumTimeBetweenFlightsRows = definitionRows(
    pbsBidDefinitionCodes.minimumTimeBetweenFlightsParent,
    [pbsBidDefinitionCodes.minimumTimeBetweenFlightsMinutes],
  )
  const minimumTimeBetweenFlights = parsePbsMinimumTimeBetweenFlightsDefinition(
    minimumTimeBetweenFlightsRows.length === 1
      ? { minimumMinutes: minimumTimeBetweenFlightsRows[0]?.code_value }
      : undefined,
  )

  return {
    rows: [
      {
        code: 'redeye' as const,
        name: 'Redeye',
        value: redeye,
        displayValue: formatPbsRedeyeDefinition(redeye),
        description: 'Local operating window used to identify Redeye legs.',
        ...latestAudit(redeyeRows),
      },
      {
        code: 'weekend' as const,
        name: 'Weekend',
        value: weekend,
        displayValue: formatPbsWeekendDefinition(weekend),
        description: 'Recurring local interval used by Weekend preferences.',
        ...latestAudit(definitionRows(pbsBidDefinitionCodes.weekendParent, [
          pbsBidDefinitionCodes.weekendStartDay,
          pbsBidDefinitionCodes.weekendStartTime,
          pbsBidDefinitionCodes.weekendEndDay,
          pbsBidDefinitionCodes.weekendEndTime,
        ])),
      },
      {
        code: 'credit-window' as const,
        name: 'Credit Window',
        value: creditWindow,
        displayValue: creditWindow.available
          ? `±${creditWindow.deltaHours} hours from period credit target`
          : 'Unavailable',
        description: 'Hours added to or subtracted from the period credit target.',
        ...latestAudit(creditRows),
      },
      {
        code: 'minimum-base-layover' as const,
        name: 'Minimum Base Layover',
        value: minimumBaseLayover,
        displayValue: formatPbsMinimumBaseLayoverDefinition(minimumBaseLayover),
        description: 'Minimum home-base spacing allowed for Line bids.',
        ...latestAudit(minimumBaseLayoverRows),
      },
      {
        code: 'efficient-flying-percentile' as const,
        name: 'Efficient Flying Percentile',
        value: efficientFlyingPercentile,
        displayValue: formatPbsEfficientFlyingPercentileDefinition(efficientFlyingPercentile),
        description: 'Top and bottom average-daily-credit cohort used by Efficient Flying bids.',
        ...latestAudit(efficientFlyingRows),
      },
      {
        code: 'minimum-time-between-flights' as const,
        name: 'Minimum Time Between Flights',
        value: minimumTimeBetweenFlights,
        displayValue: formatPbsMinimumTimeBetweenFlightsDefinition(minimumTimeBetweenFlights),
        description: 'Minimum spacing allowed between flights in Time Between Flights bids.',
        ...latestAudit(minimumTimeBetweenFlightsRows),
      },
    ],
    weekdays,
  }
}

const updateValues = async (
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount?: number | null }> },
  liveSchema: string,
  parentCode: string,
  values: Array<{ code: string; value: string }>,
  userCode: string,
) => {
  for (const item of values) {
    const result = await client.query(
      `update ${liveSchema}.dictionary
       set code_value = $1, updated_by = $2, updated_at = now()
       where parent_code = $3 and code = $4`,
      [item.value, userCode, parentCode, item.code],
    )
    if (result.rowCount !== 1) {
      throw new BidDefinitionConflictError(`Invalid PBS Bid Definition row count: ${parentCode}/${item.code}`)
    }
  }
}

class BidDefinitionConflictError extends Error {}

export default async function pbsBidDefinitionRoutes(fastify: FastifyInstance) {
  const liveSchema = asSafeIdentifier(env.LIVE_SCHEMA)

  fastify.get('/bid-definitions', async (request, reply) => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return reply
    }
    if (!(await requireMenuAccess(fastify, authUser, reply, PBS_BID_DEFINITIONS_MENU_CODE))) {
      return reply
    }

    const client = await fastify.pgPool.connect()
    try {
      return success(reply, mapDefinitions(await loadDefinitionRows(client, liveSchema)))
    } catch (caught) {
      request.log.error({ error: caught }, 'Failed to load PBS Bid Definitions')
      return error(reply, 500, 'Failed to load PBS Bid Definitions')
    } finally {
      client.release()
    }
  })

  fastify.patch('/bid-definitions/redeye', async (request, reply) => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return reply
    }
    if (!(await requireMenuAccess(fastify, authUser, reply, PBS_BID_DEFINITIONS_MENU_CODE))) {
      return reply
    }
    const parsed = redeyeBodySchema.safeParse(request.body)
    if (!parsed.success) return error(reply, 400, 'Invalid Redeye definition')

    const client = await fastify.pgPool.connect()
    try {
      await client.query('begin')
      await updateValues(client, liveSchema, pbsBidDefinitionCodes.redeyeParent, [
        { code: pbsBidDefinitionCodes.redeyeStartTime, value: parsed.data.startTime },
        { code: pbsBidDefinitionCodes.redeyeEndTime, value: parsed.data.endTime },
      ], request.authUser?.userCode ?? 'system')
      await client.query('commit')
      return success(reply, mapDefinitions(await loadDefinitionRows(client, liveSchema)).rows[0])
    } catch (caught) {
      await client.query('rollback')
      request.log.error({ error: caught }, 'Failed to save Redeye definition')
      return error(reply, 500, 'Failed to save Redeye definition')
    } finally {
      client.release()
    }
  })

  fastify.patch('/bid-definitions/weekend', async (request, reply) => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return reply
    }
    if (!(await requireMenuAccess(fastify, authUser, reply, PBS_BID_DEFINITIONS_MENU_CODE))) {
      return reply
    }
    const parsed = weekendBodySchema.safeParse(request.body)
    if (!parsed.success) return error(reply, 400, 'Invalid Weekend definition')

    const client = await fastify.pgPool.connect()
    try {
      const rows = await loadDefinitionRows(client, liveSchema)
      const weekdays = rows
        .filter((row) => row.parent_code === 'DOW')
        .map((row) => ({ code: row.code.toUpperCase(), isoDay: Number(row.code_value) }))
      const startDay = weekdays.find((day) => day.code === parsed.data.startDayCode)
      const endDay = weekdays.find((day) => day.code === parsed.data.endDayCode)
      const duration = startDay && endDay
        ? getPbsWeekendDurationMinutes({
          startDayIso: startDay.isoDay,
          startTime: parsed.data.startTime,
          endDayIso: endDay.isoDay,
          endTime: parsed.data.endTime,
        })
        : null
      if (!duration) return error(reply, 400, 'Invalid Weekend definition')

      await client.query('begin')
      await updateValues(client, liveSchema, pbsBidDefinitionCodes.weekendParent, [
        { code: pbsBidDefinitionCodes.weekendStartDay, value: parsed.data.startDayCode },
        { code: pbsBidDefinitionCodes.weekendStartTime, value: parsed.data.startTime },
        { code: pbsBidDefinitionCodes.weekendEndDay, value: parsed.data.endDayCode },
        { code: pbsBidDefinitionCodes.weekendEndTime, value: parsed.data.endTime },
      ], request.authUser?.userCode ?? 'system')
      await client.query('commit')
      return success(reply, mapDefinitions(await loadDefinitionRows(client, liveSchema)).rows[1])
    } catch (caught) {
      await client.query('rollback')
      request.log.error({ error: caught }, 'Failed to save Weekend definition')
      return error(reply, 500, 'Failed to save Weekend definition')
    } finally {
      client.release()
    }
  })

  fastify.patch('/bid-definitions/credit-window', async (request, reply) => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return reply
    }
    if (!(await requireMenuAccess(fastify, authUser, reply, PBS_BID_DEFINITIONS_MENU_CODE))) {
      return reply
    }
    const parsed = creditWindowBodySchema.safeParse(request.body)
    if (!parsed.success) return error(reply, 400, 'Invalid Credit Window definition')

    const client = await fastify.pgPool.connect()
    try {
      await client.query('begin')
      await updateValues(client, liveSchema, pbsBidDefinitionCodes.creditWindowParent, [{
        code: pbsBidDefinitionCodes.creditWindowDeltaHours,
        value: String(parsed.data.deltaHours),
      }], request.authUser?.userCode ?? 'system')
      await client.query('commit')
      return success(reply, mapDefinitions(await loadDefinitionRows(client, liveSchema)).rows[2])
    } catch (caught) {
      await client.query('rollback')
      request.log.error({ error: caught }, 'Failed to save Credit Window definition')
      return error(reply, 500, 'Failed to save Credit Window definition')
    } finally {
      client.release()
    }
  })

  fastify.patch('/bid-definitions/minimum-base-layover', async (request, reply) => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return reply
    }
    if (!(await requireMenuAccess(fastify, authUser, reply, PBS_BID_DEFINITIONS_MENU_CODE))) {
      return reply
    }
    const parsed = minimumBaseLayoverBodySchema.safeParse(request.body)
    if (!parsed.success) return error(reply, 400, 'Invalid Minimum Base Layover definition')
    const definition = parsePbsMinimumBaseLayoverDefinition(parsed.data)
    if (!definition.available) return error(reply, 400, 'Invalid Minimum Base Layover definition')

    const client = await fastify.pgPool.connect()
    try {
      await client.query('begin')
      await updateValues(client, liveSchema, pbsBidDefinitionCodes.minimumBaseLayoverParent, [{
        code: pbsBidDefinitionCodes.minimumBaseLayoverDuration,
        value: definition.minDuration,
      }], request.authUser?.userCode ?? 'system')
      await client.query('commit')
      return success(reply, mapDefinitions(await loadDefinitionRows(client, liveSchema)).rows[3])
    } catch (caught) {
      await client.query('rollback')
      request.log.error({ error: caught }, 'Failed to save Minimum Base Layover definition')
      return error(reply, 500, 'Failed to save Minimum Base Layover definition')
    } finally {
      client.release()
    }
  })

  fastify.patch('/bid-definitions/efficient-flying-percentile', async (request, reply) => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return reply
    }
    if (!(await requireMenuAccess(fastify, authUser, reply, PBS_BID_DEFINITIONS_MENU_CODE))) {
      return reply
    }
    const parsed = efficientFlyingPercentileBodySchema.safeParse(request.body)
    if (!parsed.success) return error(reply, 400, 'Invalid Efficient Flying Percentile definition')

    const client = await fastify.pgPool.connect()
    try {
      await client.query('begin')
      await updateValues(client, liveSchema, pbsBidDefinitionCodes.efficientFlyingParent, [{
        code: pbsBidDefinitionCodes.efficientFlyingPercentile,
        value: String(parsed.data.percentile),
      }], request.authUser?.userCode ?? 'system')
      await client.query('commit')
      return success(reply, mapDefinitions(await loadDefinitionRows(client, liveSchema)).rows[4])
    } catch (caught) {
      await client.query('rollback')
      request.log.error({ error: caught }, 'Failed to save Efficient Flying Percentile definition')
      return error(reply, 500, 'Failed to save Efficient Flying Percentile definition')
    } finally {
      client.release()
    }
  })

  fastify.patch('/bid-definitions/minimum-time-between-flights', async (request, reply) => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return reply
    }
    if (!(await requireMenuAccess(fastify, authUser, reply, PBS_BID_DEFINITIONS_MENU_CODE))) {
      return reply
    }
    const parsed = minimumTimeBetweenFlightsBodySchema.safeParse(request.body)
    if (!parsed.success) return error(reply, 400, 'Invalid Minimum Time Between Flights definition')

    const client = await fastify.pgPool.connect()
    try {
      await client.query('begin')
      await updateValues(client, liveSchema, pbsBidDefinitionCodes.minimumTimeBetweenFlightsParent, [{
        code: pbsBidDefinitionCodes.minimumTimeBetweenFlightsMinutes,
        value: String(parsed.data.minimumMinutes),
      }], request.authUser?.userCode ?? 'system')
      await client.query('commit')
      return success(reply, mapDefinitions(await loadDefinitionRows(client, liveSchema)).rows[5])
    } catch (caught) {
      await client.query('rollback')
      request.log.error({ error: caught }, 'Failed to save Minimum Time Between Flights definition')
      return error(
        reply,
        caught instanceof BidDefinitionConflictError ? 409 : 500,
        caught instanceof BidDefinitionConflictError
          ? 'Minimum Time Between Flights definition is unavailable'
          : 'Failed to save Minimum Time Between Flights definition',
      )
    } finally {
      client.release()
    }
  })
}
