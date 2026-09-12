import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { verifyMobileCrewCredentials } from '../../services/mobile-roster/mobile-roster-service.js'
import { listForCrew, markRead } from '../../services/crew-notify/crew-notify-service.js'
import { submitCrewAbsence } from '../../services/absence/crew-absence-service.js'
import { liveSchemaName } from '../../utils/db-schema.js'
import { error, fail, success } from '../../utils/response.js'

/**
 * Crew-app notification feed for Altair Live (F8/ET).
 *
 * Mirrors the EK/EVACC `crew-app/v1` contract so the crew app keeps a single
 * client: credentials travel in the JSON body (matching
 * `/api/mobile-roster/session`), and responses carry the live-server envelope
 * `{ code, data, message }`.
 */

const credentialsSchema = z.object({
  airline: z.enum(['F8', 'ET']),
  crewId: z.string().trim().min(1),
  password: z.string().min(1),
}).strict()

const listSchema = z.object({
  airline: z.enum(['F8', 'ET']),
  crewId: z.string().trim().min(1),
  password: z.string().min(1),
  since: z.number().int().min(0).optional(),
}).strict()

const absenceSchema = credentialsSchema.extend({
  type: z.enum(['sick', 'emergency', 'personal']),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).optional(),
}).strict()

/** Status codes carried by the shared service errors (roster + notify + absence). */
const statusCodeOf = (err: unknown): number | null => {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const code = (err as { statusCode?: unknown }).statusCode
    if (typeof code === 'number' && Number.isInteger(code) && code >= 400 && code < 600) {
      return code
    }
  }
  return null
}

const replyWithError = (
  fastify: FastifyInstance,
  reply: FastifyReply,
  err: unknown,
  fallback: string,
) => {
  const status = statusCodeOf(err)
  if (status !== null) {
    return error(reply, status, err instanceof Error ? err.message : fallback)
  }
  fastify.log.error(err, 'crew notification request failed')
  return error(reply, 500, fallback)
}

export default async function crewNotifyRoutes(fastify: FastifyInstance) {
  fastify.post('/notifications', async (request, reply) => {
    const parsed = listSchema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    try {
      const { crewId } = await verifyMobileCrewCredentials(
        { pgPool: fastify.pgPool },
        parsed.data,
      )
      const feed = await listForCrew(
        { pgPool: fastify.pgPool },
        { airline: parsed.data.airline, crewId, since: parsed.data.since },
      )
      return success(reply, feed)
    } catch (err) {
      return replyWithError(fastify, reply, err, 'Unable to load crew notifications.')
    }
  })

  fastify.post('/notifications/:notifId/read', async (request, reply) => {
    const parsedCredentials = credentialsSchema.safeParse(request.body)
    if (!parsedCredentials.success) {
      return fail(reply, 400, parsedCredentials.error.message)
    }

    const params = z.object({ notifId: z.string().min(1) }).safeParse(request.params)
    if (!params.success) {
      return fail(reply, 400, params.error.message)
    }

    try {
      const { crewId } = await verifyMobileCrewCredentials(
        { pgPool: fastify.pgPool },
        parsedCredentials.data,
      )
      const found = await markRead(
        { pgPool: fastify.pgPool },
        { airline: parsedCredentials.data.airline, crewId, notifId: params.data.notifId },
      )
      if (!found) {
        return error(reply, 404, 'Notification not found')
      }
      return success(reply, { ok: true })
    } catch (err) {
      return replyWithError(fastify, reply, err, 'Unable to mark the notification read.')
    }
  })

  // Crew recovery story 101: crew-submitted sick leave → Live auto stand-down.
  fastify.post('/absence', async (request, reply) => {
    const parsed = absenceSchema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    try {
      const { crewId } = await verifyMobileCrewCredentials(
        { pgPool: fastify.pgPool },
        parsed.data,
      )
      const result = await submitCrewAbsence(fastify, {
        airline: parsed.data.airline,
        crewId,
        type: parsed.data.type,
        fromDate: parsed.data.fromDate,
        toDate: parsed.data.toDate,
        note: parsed.data.note,
        wsSchema: liveSchemaName(),
      })
      return success(reply, result)
    } catch (err) {
      return replyWithError(fastify, reply, err, 'Unable to submit the absence.')
    }
  })
}
