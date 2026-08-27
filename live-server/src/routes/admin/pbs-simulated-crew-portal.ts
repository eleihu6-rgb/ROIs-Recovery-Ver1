import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { env } from '../../config/index.js'
import { error, success } from '../../utils/response.js'
import { requireMenuAccess } from '../../utils/menu-access.js'

const PBS_SIMULATED_CREW_PORTAL_MENU_CODE = 'PBS_SIMULATED_CREW_PORTAL'

const createSessionBodySchema = z.object({
  crewCode: z.string().trim().min(1),
}).strict()

const configBodySchema = z.object({
  portalPublicUrl: z.string(),
  loginTtlSeconds: z.coerce.number().int(),
}).strict()

const logQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
})

const envelopeSchema = z.object({
  code: z.number(),
  data: z.unknown().nullable(),
  message: z.string(),
})

const internalSessionResponseSchema = z.object({
  cleanUrl: z.string().url(),
  token: z.string().trim().min(1),
  expiresAt: z.string().optional(),
  maxAgeSeconds: z.number().int().positive(),
})

const configResponseSchema = z.object({
  portalPublicUrl: z.string(),
  loginTtlSeconds: z.number().int().positive(),
})

const logItemSchema = z.object({
  id: z.string(),
  adminUser: z.string(),
  adminUserCode: z.string(),
  crewCode: z.string(),
  crewName: z.string(),
  result: z.string(),
  loginTime: z.string(),
})

const logsResponseSchema = z.object({
  logs: z.array(logItemSchema),
})

const SECURE_SIMULATED_LOGIN_COOKIE_NAME = '__Secure-pbs-simulated-login'
const LOCAL_SIMULATED_LOGIN_COOKIE_NAME = 'pbs-simulated-login-dev'
const SIMULATED_SESSION_PATH_SUFFIX = '/api/auth/simulated-session'

class PbsInternalApiError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'PbsInternalApiError'
    this.statusCode = statusCode
  }
}

const pbsUrl = (path: string): string => `${env.PBS_SERVER_URL.replace(/\/+$/, '')}${path}`
const PBS_INTERNAL_AUTH_FAILURE_MESSAGE = 'PBS internal service authorization failed. Check simulated portal configuration.'

const normalizeHostname = (value: string): string => {
  const host = value.trim().split(',')[0]?.trim() ?? ''

  if (host.startsWith('[')) {
    const closingBracketIndex = host.indexOf(']')
    return closingBracketIndex > 0 ? host.slice(1, closingBracketIndex).toLowerCase() : ''
  }

  return host.split(':')[0]?.toLowerCase() ?? ''
}

const isLocalPortalHost = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'

const resolveRequestHostname = (request: FastifyRequest): string => {
  const forwardedHost = request.headers['x-forwarded-host']
  const rawHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || request.headers.host || request.hostname

  return normalizeHostname(String(rawHost ?? ''))
}

const appendPath = (basePath: string, suffix: string): string => {
  const normalizedBase = basePath.trim().replace(/\/+$/, '')
  return `${normalizedBase}${suffix}`.replace(/\/{2,}/g, '/')
}

const resolveSimulatedSessionCookiePaths = (cleanUrl: string): string[] => {
  const url = new URL(cleanUrl)
  const loginBasePath = url.pathname.replace(/\/login\/?$/, '')
  const paths = new Set<string>([
    appendPath(loginBasePath, SIMULATED_SESSION_PATH_SUFFIX),
    SIMULATED_SESSION_PATH_SUFFIX,
  ])

  return Array.from(paths)
}

const buildSimulatedLoginCookieHeaders = (
  request: FastifyRequest,
  session: z.infer<typeof internalSessionResponseSchema>,
): string[] => {
  const cleanUrl = new URL(session.cleanUrl)
  const requestHostname = resolveRequestHostname(request)
  const portalHostname = normalizeHostname(cleanUrl.hostname)

  if (!portalHostname || portalHostname !== requestHostname) {
    throw new PbsInternalApiError(
      500,
      'PBS portal URL must use the same hostname as Altair for secure simulated login.',
    )
  }

  const secure = cleanUrl.protocol === 'https:'

  if (!secure && !isLocalPortalHost(portalHostname)) {
    throw new PbsInternalApiError(500, 'PBS portal URL must use HTTPS for simulated login.')
  }

  const cookieName = secure ? SECURE_SIMULATED_LOGIN_COOKIE_NAME : LOCAL_SIMULATED_LOGIN_COOKIE_NAME
  const encodedToken = encodeURIComponent(session.token)
  const attributes = [
    `Max-Age=${session.maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
  ]

  if (secure) {
    attributes.push('Secure')
  }

  return resolveSimulatedSessionCookiePaths(session.cleanUrl).map((path) =>
    `${cookieName}=${encodedToken}; Path=${path}; ${attributes.join('; ')}`)
}

const isPbsInternalAuthFailure = (httpStatus: number, responseCode: number): boolean =>
  httpStatus === 401 || httpStatus === 403 || responseCode === 401 || responseCode === 403

const resolvePbsInternalErrorStatus = (httpStatus: number, responseCode: number): number => {
  if (isPbsInternalAuthFailure(httpStatus, responseCode)) {
    return 502
  }

  return httpStatus >= 400 ? httpStatus : responseCode
}

const resolvePbsInternalErrorMessage = (httpStatus: number, responseCode: number, message: string): string => {
  if (isPbsInternalAuthFailure(httpStatus, responseCode)) {
    return PBS_INTERNAL_AUTH_FAILURE_MESSAGE
  }

  return message || 'PBS server request failed.'
}

const requestPbsInternal = async <T>(
  path: string,
  options: {
    method: 'GET' | 'POST' | 'PUT'
    body?: Record<string, unknown>
    parseData: (data: unknown) => T
  },
): Promise<T> => {
  const response = await fetch(pbsUrl(path), {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': env.PBS_INTERNAL_API_SECRET,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const rawBody: unknown = await response.json().catch(() => null)
  const envelope = envelopeSchema.safeParse(rawBody)

  if (!envelope.success) {
    throw new PbsInternalApiError(502, 'PBS server returned an invalid response.')
  }

  if (!response.ok || envelope.data.code !== 200) {
    throw new PbsInternalApiError(
      resolvePbsInternalErrorStatus(response.status, envelope.data.code),
      resolvePbsInternalErrorMessage(response.status, envelope.data.code, envelope.data.message),
    )
  }

  return options.parseData(envelope.data.data)
}

export default async function pbsSimulatedCrewPortalAdminRoutes(fastify: FastifyInstance) {
  fastify.post('/simulated-crew-portal/sessions', async (request, reply) => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return reply
    }
    if (!(await requireMenuAccess(fastify, authUser, reply, PBS_SIMULATED_CREW_PORTAL_MENU_CODE))) {
      return reply
    }

    const parsed = createSessionBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return error(reply, 400, 'Crew code is required')
    }

    try {
      const session = await requestPbsInternal('/api/internal/simulated-crew-portal/sessions', {
        method: 'POST',
        body: {
          crewCode: parsed.data.crewCode,
          adminUserCode: authUser.userCode,
          adminUserName: authUser.userName,
        },
        parseData: (data) => internalSessionResponseSchema.parse(data),
      })

      reply.header('Set-Cookie', buildSimulatedLoginCookieHeaders(request, session))

      return success(reply, {
        url: session.cleanUrl,
        expiresAt: session.expiresAt,
      })
    } catch (err) {
      if (err instanceof PbsInternalApiError) {
        return error(reply, err.statusCode, err.message)
      }

      request.log.error({ err }, 'Failed to create PBS simulated crew portal session')
      return error(reply, 502, 'Failed to create PBS simulated crew portal session')
    }
  })

  fastify.get('/simulated-crew-portal/config', async (request, reply) => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return reply
    }
    if (!(await requireMenuAccess(fastify, authUser, reply, PBS_SIMULATED_CREW_PORTAL_MENU_CODE))) {
      return reply
    }

    try {
      const config = await requestPbsInternal('/api/internal/simulated-crew-portal/config', {
        method: 'GET',
        parseData: (data) => configResponseSchema.parse(data),
      })

      return success(reply, config)
    } catch (err) {
      if (err instanceof PbsInternalApiError) {
        return error(reply, err.statusCode, err.message)
      }

      request.log.error({ err }, 'Failed to load PBS simulated crew portal configuration')
      return error(reply, 502, 'Failed to load PBS simulated crew portal configuration')
    }
  })

  fastify.put('/simulated-crew-portal/config', async (request, reply) => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return reply
    }
    if (!(await requireMenuAccess(fastify, authUser, reply, PBS_SIMULATED_CREW_PORTAL_MENU_CODE))) {
      return reply
    }

    const parsed = configBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return error(reply, 400, 'Portal configuration is invalid')
    }

    try {
      const config = await requestPbsInternal('/api/internal/simulated-crew-portal/config', {
        method: 'PUT',
        body: {
          portalPublicUrl: parsed.data.portalPublicUrl,
          loginTtlSeconds: parsed.data.loginTtlSeconds,
          updatedBy: authUser.userCode,
        },
        parseData: (data) => configResponseSchema.parse(data),
      })

      return success(reply, config)
    } catch (err) {
      if (err instanceof PbsInternalApiError) {
        return error(reply, err.statusCode, err.message)
      }

      request.log.error({ err }, 'Failed to save PBS simulated crew portal configuration')
      return error(reply, 502, 'Failed to save PBS simulated crew portal configuration')
    }
  })

  fastify.get('/simulated-crew-portal/logs', async (request, reply) => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return reply
    }
    if (!(await requireMenuAccess(fastify, authUser, reply, PBS_SIMULATED_CREW_PORTAL_MENU_CODE))) {
      return reply
    }

    const parsed = logQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return error(reply, 400, 'Invalid log query')
    }

    try {
      const logs = await requestPbsInternal(`/api/internal/simulated-crew-portal/logs?limit=${parsed.data.limit}`, {
        method: 'GET',
        parseData: (data) => logsResponseSchema.parse(data),
      })

      return success(reply, logs)
    } catch (err) {
      if (err instanceof PbsInternalApiError) {
        return error(reply, err.statusCode, err.message)
      }

      request.log.error({ err }, 'Failed to load PBS simulated crew portal logs')
      return error(reply, 502, 'Failed to load PBS simulated crew portal logs')
    }
  })
}
