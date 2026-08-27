import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { env } from '../../config/index.js'
import {
  loadPbsBusinessTimeStatus,
  savePbsBusinessTimeConfig,
} from '../../services/pbs-business-time.js'
import { error, success } from '../../utils/response.js'
import { requireMenuAccess } from '../../utils/menu-access.js'

const PBS_BUSINESS_TIME_MENU_CODE = 'PBS_BUSINESS_TIME'

const businessTimeBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('CLEAR') }),
  z.object({
    action: z.literal('SET'),
    businessTimeLocal: z.string().trim().regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/,
      'Business time must use YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss',
    ),
  }),
])

const asSafeIdentifier = (value: string): string => {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error(`Invalid database schema identifier: ${value}`)
  }
  return value.toLowerCase()
}

export default async function pbsBusinessTimeAdminRoutes(fastify: FastifyInstance) {
  const liveSchema = asSafeIdentifier(env.LIVE_SCHEMA)

  fastify.get('/pbs-business-time', async (request, reply) => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return reply
    }
    if (!(await requireMenuAccess(fastify, authUser, reply, PBS_BUSINESS_TIME_MENU_CODE))) {
      return reply
    }

    const client = await fastify.pgPool.connect()
    try {
      return success(reply, await loadPbsBusinessTimeStatus(client, liveSchema))
    } catch (err) {
      fastify.log.error({ err }, 'Failed to load PBS business time config')
      return error(reply, 500, 'Failed to load PBS business time config')
    } finally {
      client.release()
    }
  })

  fastify.put('/pbs-business-time', async (request, reply) => {
    const authUser = request.authUser
    if (!authUser) {
      error(reply, 401, 'Authentication required.')
      return reply
    }
    if (!(await requireMenuAccess(fastify, authUser, reply, PBS_BUSINESS_TIME_MENU_CODE))) {
      return reply
    }

    const parsed = businessTimeBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return error(reply, 400, 'Invalid PBS business time payload')
    }

    const client = await fastify.pgPool.connect()
    try {
      await client.query('begin')
      await savePbsBusinessTimeConfig(
        client,
        liveSchema,
        parsed.data,
        authUser.userCode,
      )
      await client.query('commit')
      return success(reply, await loadPbsBusinessTimeStatus(client, liveSchema))
    } catch (err) {
      await client.query('rollback').catch(() => undefined)
      if (err instanceof Error && err.message === 'INVALID_BUSINESS_TIME') {
        return error(reply, 400, 'Invalid PBS business time value')
      }
      fastify.log.error({ err }, 'Failed to save PBS business time config')
      return error(reply, 500, 'Failed to save PBS business time config')
    } finally {
      client.release()
    }
  })
}
