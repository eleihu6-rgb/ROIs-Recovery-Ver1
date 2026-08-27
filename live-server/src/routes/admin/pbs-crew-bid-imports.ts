import { z } from 'zod'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  pbsCrewBidImportRoutes,
  type PbsCrewBidImportOptions,
  type PbsCrewBidImportRollbackRequest,
  type PbsCrewBidImportRunQuery,
  type PbsCrewBidImportServiceRequest,
} from '../../../../packages/contracts/pbs-crew-bid-imports.js'
import { env } from '../../config/index.js'
import { createPbsCrewBidImportService } from '../../services/crew-bid-import/crew-bid-import-service.js'
import { validateCrewBidImportFile } from '../../services/crew-bid-import/upload-file-validation.js'
import { requireMenuAccess } from '../../utils/menu-access.js'
import { error } from '../../utils/response.js'

const PBS_ADMIN_TOOLS_MENU_CODE = 'PBS_ADMIN_TOOLS'

const importOptionsSchema = z.object({
  importCurrentBid: z.boolean().optional(),
  importDefaultAsStanding: z.boolean().optional(),
  useCurrentBidWhenAvailable: z.boolean().optional(),
  fallbackToDefaultBid: z.boolean().optional(),
  firstPairingBidGroupOnly: z.boolean().optional(),
  overwriteCurrentBid: z.boolean().optional(),
  overwriteStandingBid: z.boolean().optional(),
  failOnUnmatchedPairing: z.boolean().optional(),
  failOnUnmatchedAirport: z.boolean().optional(),
})

const importScopeSchema = z.object({
  base: z.string().trim().min(1).optional(),
  categories: z.array(z.string().trim().min(1)).optional(),
  crewIds: z.array(z.string().trim().min(1)).optional(),
})

const runQuerySchema: z.ZodType<PbsCrewBidImportRunQuery> = z.object({
  rosterPeriodId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
})

const rollbackSchema: z.ZodType<PbsCrewBidImportRollbackRequest> = z.object({
  confirm: z.boolean(),
  restorePrevious: z.boolean().optional(),
})

const runParamsSchema = z.object({
  runId: z.string().trim().min(1),
})

const sendSuccess = <TData>(
  reply: FastifyReply,
  data: TData,
  statusCode = 200,
): FastifyReply => reply.status(statusCode).send({ code: statusCode, data, message: 'ok' })

const sendFailure = (reply: FastifyReply, statusCode: number, message: string): FastifyReply =>
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

const buildImportActor = (request: FastifyRequest) => ({
  userCode: request.authUser?.userCode ?? 'unknown',
})

type MultipartImportParseResult =
  | {
      success: true
      request: PbsCrewBidImportServiceRequest
    }
  | {
      success: false
      message: string
    }

const parseBooleanField = (value: string | undefined): boolean | null | undefined => {
  if (value === undefined) {
    return undefined
  }

  const normalizedValue = value.trim().toLowerCase()

  if (['true', '1', 'yes'].includes(normalizedValue)) {
    return true
  }

  if (['false', '0', 'no'].includes(normalizedValue)) {
    return false
  }

  return null
}

const parseJsonStringArrayField = (
  value: string | undefined,
  fieldName: string,
):
  | { success: true; value: string[] | undefined }
  | { success: false; message: string } => {
  if (!value?.trim()) {
    return {
      success: true,
      value: undefined,
    }
  }

  try {
    const parsedValue = JSON.parse(value) as unknown
    const parsedArray = z.array(z.string().trim().min(1)).safeParse(parsedValue)

    if (!parsedArray.success) {
      return {
        success: false,
        message: `${fieldName} must be a JSON string array.`,
      }
    }

    return {
      success: true,
      value: parsedArray.data,
    }
  } catch {
    return {
      success: false,
      message: `${fieldName} must be valid JSON.`,
    }
  }
}

const parseOptionsField = (
  value: string | undefined,
):
  | { success: true; value: PbsCrewBidImportOptions | undefined }
  | { success: false; message: string } => {
  if (!value?.trim()) {
    return {
      success: true,
      value: undefined,
    }
  }

  try {
    const parsedValue = JSON.parse(value) as unknown
    const parsedOptions = importOptionsSchema.safeParse(parsedValue)

    if (!parsedOptions.success) {
      return {
        success: false,
        message: 'options must be a valid JSON object.',
      }
    }

    return {
      success: true,
      value: parsedOptions.data as PbsCrewBidImportOptions,
    }
  } catch {
    return {
      success: false,
      message: 'options must be valid JSON.',
    }
  }
}

const readMultipartImportRequest = async (
  request: FastifyRequest,
): Promise<MultipartImportParseResult> => {
  if (!request.isMultipart()) {
    return {
      success: false,
      message: 'Crew bid import requires multipart/form-data with a file field.',
    }
  }

  const fields = new Map<string, string>()
  let sourceText: string | null = null

  try {
    for await (const part of request.parts({
      limits: {
        files: 1,
        fileSize: 25 * 1024 * 1024,
        fields: 16,
        parts: 20,
      },
    })) {
      if (part.type === 'file') {
        const fileBuffer = await part.toBuffer()

        if (part.fieldname !== 'file') {
          return {
            success: false,
            message: 'Crew bid import file must use form field name file.',
          }
        }

        const validatedFile = validateCrewBidImportFile({
          buffer: fileBuffer,
          filename: part.filename,
          mimetype: part.mimetype,
        })

        if (!validatedFile.success) {
          return {
            success: false,
            message: validatedFile.message,
          }
        }

        sourceText = validatedFile.sourceText
        continue
      }

      fields.set(part.fieldname, String(part.value ?? ''))
    }
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('file size')) {
      return {
        success: false,
        message: 'Crew bid import file is too large.',
      }
    }

    return {
      success: false,
      message: 'Failed to read crew bid import multipart payload.',
    }
  }

  const rosterPeriodId = Number(fields.get('rosterPeriodId'))

  if (!Number.isSafeInteger(rosterPeriodId) || rosterPeriodId <= 0) {
    return {
      success: false,
      message: 'A valid rosterPeriodId is required.',
    }
  }

  if (!sourceText?.trim()) {
    return {
      success: false,
      message: 'file is required and must not be empty.',
    }
  }

  const scopeCategories = parseJsonStringArrayField(fields.get('scopeCategories'), 'scopeCategories')

  if (!scopeCategories.success) {
    return scopeCategories
  }

  const scopeCrewIds = parseJsonStringArrayField(fields.get('scopeCrewIds'), 'scopeCrewIds')

  if (!scopeCrewIds.success) {
    return scopeCrewIds
  }

  const options = parseOptionsField(fields.get('options'))

  if (!options.success) {
    return options
  }

  const confirm = parseBooleanField(fields.get('confirm'))

  if (confirm === null) {
    return {
      success: false,
      message: 'confirm must be true or false.',
    }
  }

  const scope = importScopeSchema.parse({
    base: fields.get('scopeBase')?.trim() || undefined,
    categories: scopeCategories.value,
    crewIds: scopeCrewIds.value,
  })

  return {
    success: true,
    request: {
      rosterPeriodId,
      sourcePeriodCode: fields.get('sourcePeriodCode')?.trim() || undefined,
      sourceText,
      ...(Object.keys(scope).length > 0 ? { scope } : {}),
      ...(options.value ? { options: options.value } : {}),
      ...(confirm !== undefined ? { confirm } : {}),
    },
  }
}

const handleServiceError = (
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  fallbackMessage: string,
): FastifyReply => {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const statusCode = Number((error as { statusCode?: unknown }).statusCode)

    if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
      return sendFailure(reply, statusCode, error instanceof Error ? error.message : fallbackMessage)
    }
  }

  if (error instanceof Error) {
    if (error.message.includes('confirm=true')) {
      return sendFailure(reply, 400, error.message)
    }

    if (error.message.includes('not found')) {
      return sendFailure(reply, 404, error.message)
    }

    if (error.message.includes('already been rolled back')) {
      return sendFailure(reply, 409, error.message)
    }

    if (error.message.includes('still running')) {
      return sendFailure(reply, 409, error.message)
    }
  }

  request.log.error({ error }, fallbackMessage)
  return sendFailure(reply, 500, fallbackMessage)
}

export default async function pbsCrewBidImportsAdminRoutes(fastify: FastifyInstance) {
  const crewBidImportService = createPbsCrewBidImportService({
    pgPool: fastify.pgPool,
    pbsSchema: env.PBS_SCHEMA,
    liveSchema: env.LIVE_SCHEMA,
  })

  fastify.post(pbsCrewBidImportRoutes.dryRun, async (request, reply) => {
    if (!(await requirePbsAdminToolsPermission(fastify, request, reply))) return reply

    const parsed = await readMultipartImportRequest(request)

    if (!parsed.success) {
      return sendFailure(reply, 400, parsed.message)
    }

    try {
      const result = await crewBidImportService.dryRun(buildImportActor(request), parsed.request)

      return sendSuccess(reply, result)
    } catch (error) {
      return handleServiceError(request, reply, error, 'Failed to dry-run crew bid import.')
    }
  })

  fastify.post(pbsCrewBidImportRoutes.runs, async (request, reply) => {
    if (!(await requirePbsAdminToolsPermission(fastify, request, reply))) return reply

    const parsed = await readMultipartImportRequest(request)

    if (!parsed.success) {
      return sendFailure(reply, 400, parsed.message)
    }

    try {
      const result = await crewBidImportService.startImport(buildImportActor(request), parsed.request)

      return sendSuccess(reply, result)
    } catch (error) {
      return handleServiceError(request, reply, error, 'Failed to import crew bids.')
    }
  })

  fastify.get(
    pbsCrewBidImportRoutes.runs,
    async (
      request: FastifyRequest<{ Querystring: PbsCrewBidImportRunQuery }>,
      reply: FastifyReply,
    ) => {
      if (!(await requirePbsAdminToolsPermission(fastify, request, reply))) return reply

      const parsed = runQuerySchema.safeParse(request.query)

      if (!parsed.success) {
        return sendFailure(reply, 400, 'Invalid crew bid import run query.')
      }

      try {
        const result = await crewBidImportService.listRuns(parsed.data)

        return sendSuccess(reply, result)
      } catch (error) {
        return handleServiceError(request, reply, error, 'Failed to list crew bid import runs.')
      }
    },
  )

  fastify.get(
    pbsCrewBidImportRoutes.byRunId(':runId'),
    async (
      request: FastifyRequest<{ Params: { runId: string } }>,
      reply: FastifyReply,
    ) => {
      if (!(await requirePbsAdminToolsPermission(fastify, request, reply))) return reply

      const parsed = runParamsSchema.safeParse(request.params)

      if (!parsed.success) {
        return sendFailure(reply, 400, 'Invalid crew bid import run id.')
      }

      try {
        const result = await crewBidImportService.getRun(parsed.data.runId)

        return sendSuccess(reply, result)
      } catch (error) {
        return handleServiceError(request, reply, error, 'Failed to load crew bid import run.')
      }
    },
  )

  fastify.delete(
    pbsCrewBidImportRoutes.byRunId(':runId'),
    async (
      request: FastifyRequest<{
        Body: PbsCrewBidImportRollbackRequest
        Params: { runId: string }
      }>,
      reply: FastifyReply,
    ) => {
      if (!(await requirePbsAdminToolsPermission(fastify, request, reply))) return reply

      const parsedParams = runParamsSchema.safeParse(request.params)
      const parsedBody = rollbackSchema.safeParse(request.body)

      if (!parsedParams.success || !parsedBody.success) {
        return sendFailure(reply, 400, 'Invalid crew bid import rollback payload.')
      }

      try {
        const result = await crewBidImportService.rollbackRun(
          buildImportActor(request),
          parsedParams.data.runId,
          parsedBody.data,
        )

        return sendSuccess(reply, result)
      } catch (error) {
        return handleServiceError(request, reply, error, 'Failed to clear crew bid import run.')
      }
    },
  )
}
