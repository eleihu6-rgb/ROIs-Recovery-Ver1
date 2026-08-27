import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { lockService } from '../../services/lock/lock-service.js'
import { liveSchemaName } from '../../utils/db-schema.js'

const LOCK_TTL = 300 // 5 minutes
const requestSchema = (request: { authUser?: { schema?: string } }): string =>
  request.authUser?.schema ?? liveSchemaName()
const crewIdSchema = z.string().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/)

const acquireSchema = z.object({
  crewId: crewIdSchema,
  pairingIds: z.array(z.number()).default([]),
  username: z.string().min(1),
})

const releaseSchema = z.object({
  crewId: crewIdSchema,
  pairingIds: z.array(z.number()).default([]),
  username: z.string().min(1),
})

const heartbeatSchema = z.object({
  lockKeys: z.array(z.string()),
  username: z.string().min(1),
})

export default async function lockRoutes(fastify: FastifyInstance) {

  /** POST /api/locks/acquire — acquire crew + pairing locks */
  fastify.post('/acquire', async (request, reply) => {
    const parsed = acquireSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)

    const { crewId, pairingIds, username } = parsed.data

    const result = await lockService.acquireCrewLocks(
      fastify.redis, crewId, pairingIds, username, LOCK_TTL,
    )

    if (!result.success) {
      return reply.code(200).send({
        code: 409,
        data: { conflicts: result.conflicts },
        message: `Lock conflict: ${result.conflicts.map((c) => `${c.lockKey} held by ${c.heldBy}`).join(', ')}`,
      })
    }

    // Broadcast lock acquired to other clients
    fastify.wsBroadcast(requestSchema(request), {
      type: 'lock-acquired',
      crewId,
      pairingIds,
      userId: username,
      expiresAt: Date.now() + LOCK_TTL * 1000,
    }, username)

    return success(reply, {
      crewId,
      pairingIds,
      expiresAt: Date.now() + LOCK_TTL * 1000,
    })
  })

  /** POST /api/locks/release — release crew + pairing locks */
  fastify.post('/release', async (request, reply) => {
    const parsed = releaseSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)

    const { crewId, pairingIds, username } = parsed.data

    await lockService.releaseCrewLocks(fastify.redis, crewId, pairingIds, username)

    // Broadcast lock released
    fastify.wsBroadcast(requestSchema(request), {
      type: 'lock-released',
      crewId,
      pairingIds,
      userId: username,
    }, username)

    return success(reply, { released: true })
  })

  /** POST /api/locks/heartbeat — renew TTL on held locks */
  fastify.post('/heartbeat', async (request, reply) => {
    const parsed = heartbeatSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)

    const { lockKeys, username } = parsed.data

    const renewed = await lockService.renewLocks(fastify.redis, lockKeys, username, LOCK_TTL)

    return success(reply, { renewed })
  })

  /** GET /api/locks — get all active locks (for initial sync) */
  fastify.get('/', async (_request, reply) => {
    const locks = await lockService.getAllLocks(fastify.redis)

    const formatted = locks.map((l) => {
      const parts = l.key.split(':')
      return {
        lockType: parts[1] as 'crew' | 'pairing',
        lockId: parts[2],
        userId: l.info.userId,
        acquiredAt: l.info.acquiredAt,
        expiresAt: l.info.acquiredAt + l.ttl * 1000,
      }
    })

    return success(reply, formatted)
  })
}
