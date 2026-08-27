import { z } from 'zod'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  pbsAlgorithmExportRoutes,
  type PbsAlgorithmExportQuery,
  type PbsAlgorithmExportScenarioBody,
} from '../../../../packages/contracts/pbs-algorithm-export.js'
import { env } from '../../config/index.js'
import { createPbsAlgorithmExportService } from '../../services/algorithm-export/algorithm-export-service.js'
import type { PbsAlgorithmExportService } from '../../services/algorithm-export/types.js'
import { requireMenuAccess } from '../../utils/menu-access.js'
import { error } from '../../utils/response.js'

const PBS_ADMIN_TOOLS_MENU_CODE = 'PBS_ADMIN_TOOLS'

const queryListSchema = z.preprocess((value) => {
  if (value === undefined) {
    return undefined
  }

  const values = Array.isArray(value) ? value : [value]

  return values
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
}, z.array(z.string().min(1)).max(50).optional())

const algorithmExportQuerySchema = z.object({
  rosterPeriodId: z.coerce.number().int().positive(),
  periodCode: z.string().trim().min(1),
  division: z.enum(['P', 'C', 'A', 'ALL']).optional(),
  status: z.enum(['ACTIVE', 'ALL']).optional(),
  bases: queryListSchema,
  fleetQuals: queryListSchema,
})

const algorithmExportFiltersSchema = algorithmExportQuerySchema.omit({ rosterPeriodId: true, periodCode: true })

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

const algorithmExportScenarioBodySchema = z.object({
  rosterPeriodId: z.coerce.number().int().positive(),
  periodCode: z.string().trim().min(1),
  crewIds: z.array(z.string().trim().min(1)).min(1),
  scenarioStart: isoDate.optional(),
  scenarioEnd: isoDate.optional(),
  filters: algorithmExportFiltersSchema.optional(),
})

const sendFailure = (reply: FastifyReply, statusCode: number, message: string) =>
  reply.status(statusCode).send({ code: statusCode, data: null, message })

const requirePbsAdminToolsPermission = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> => {
  const authUser = request.authUser
  if (!authUser) {
    error(reply, 401, 'Authentication required.')
    return false
  }
  return requireMenuAccess(fastify, authUser, reply, PBS_ADMIN_TOOLS_MENU_CODE)
}

const serviceStatusCode = (error: unknown): number | null => {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return null
  }

  const statusCode = Number((error as { statusCode?: unknown }).statusCode)
  return Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500 ? statusCode : null
}

const handleAlgorithmExport = async (
  fastify: FastifyInstance,
  request: FastifyRequest<{ Querystring: PbsAlgorithmExportQuery }>,
  reply: FastifyReply,
  exportPackage: (query: PbsAlgorithmExportQuery) => ReturnType<PbsAlgorithmExportService['exportCurrentPackage']>,
): Promise<FastifyReply> => {
  if (!(await requirePbsAdminToolsPermission(fastify, request, reply))) return reply

  const parsedQuery = algorithmExportQuerySchema.safeParse(request.query)

  if (!parsedQuery.success) {
    return sendFailure(reply, 400, 'rosterPeriodId and periodCode are required.')
  }

  try {
    const result = await exportPackage(parsedQuery.data)

    return reply
      .status(200)
      .header('Content-Type', result.contentType)
      .header('Content-Disposition', `attachment; filename="${result.filename}"`)
      .send(result.buffer)
  } catch (error) {
    request.log.error({ error }, 'Failed to export PBS algorithm package')
    return sendFailure(reply, 500, 'Failed to export PBS algorithm package.')
  }
}

export default async function pbsAlgorithmExportAdminRoutes(fastify: FastifyInstance) {
  const algorithmExportService = createPbsAlgorithmExportService({
    db: fastify.db,
    pgPool: fastify.pgPool,
    liveSchema: env.LIVE_SCHEMA,
    pbsSchema: env.PBS_SCHEMA,
    onSkippedPairingScoreProperty(event) {
      fastify.log.warn({ pairingScoreExport: event }, 'Skipped unsupported PBS pairing score export property')
    },
    onSkippedReserveScoreProperty(event) {
      fastify.log.warn({ reserveScoreExport: event }, 'Skipped unsupported PBS reserve score export property')
    },
    onSkippedLineRuleProperty(event) {
      fastify.log.warn({ lineRulesExport: event }, 'Skipped unsupported PBS line rule export property')
    },
  })

  fastify.get(
    pbsAlgorithmExportRoutes.currentPackage,
    async (
      request: FastifyRequest<{ Querystring: PbsAlgorithmExportQuery }>,
      reply: FastifyReply,
    ) => handleAlgorithmExport(
      fastify,
      request,
      reply,
      (query) => algorithmExportService.exportCurrentPackage(query.rosterPeriodId, query.periodCode, {
        division: query.division,
        status: query.status,
        bases: query.bases,
        fleetQuals: query.fleetQuals,
      }),
    ),
  )

  fastify.get(
    pbsAlgorithmExportRoutes.yeg14TestPackage,
    async (
      request: FastifyRequest<{ Querystring: PbsAlgorithmExportQuery }>,
      reply: FastifyReply,
    ) => handleAlgorithmExport(
      fastify,
      request,
      reply,
      (query) => algorithmExportService.exportYeg14TestPackage(query.rosterPeriodId, query.periodCode),
    ),
  )

  fastify.post(
    pbsAlgorithmExportRoutes.scenarioPackage,
    async (
      request: FastifyRequest<{ Body: PbsAlgorithmExportScenarioBody }>,
      reply: FastifyReply,
    ) => {
      if (!(await requirePbsAdminToolsPermission(fastify, request, reply))) return reply

      const parsedBody = algorithmExportScenarioBodySchema.safeParse(request.body)

      if (!parsedBody.success) {
        return sendFailure(reply, 400, 'rosterPeriodId, periodCode and crewIds are required.')
      }

      try {
        const result = await algorithmExportService.exportScenarioPackage(
          parsedBody.data.rosterPeriodId,
          parsedBody.data.periodCode,
          parsedBody.data.crewIds,
          parsedBody.data.scenarioStart,
          parsedBody.data.scenarioEnd,
          parsedBody.data.filters,
        )

        return reply
          .status(200)
          .header('Content-Type', result.contentType)
          .header('Content-Disposition', `attachment; filename="${result.filename}"`)
          .send(result.buffer)
      } catch (error) {
        const statusCode = serviceStatusCode(error)
        if (statusCode) {
          return sendFailure(reply, statusCode, error instanceof Error ? error.message : 'Invalid scenario package export request.')
        }

        request.log.error({ error }, 'Failed to export PBS scenario algorithm package')
        return sendFailure(reply, 500, 'Failed to export PBS scenario algorithm package.')
      }
    },
  )
}
