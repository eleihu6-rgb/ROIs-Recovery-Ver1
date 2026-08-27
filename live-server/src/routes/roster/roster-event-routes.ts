import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'

export default async function rosterEventRoutes(fastify: FastifyInstance) {
  fastify.get('/events/:eventId', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const numId = Number(eventId)
    if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid eventId')

    const { rows } = await fastify.pgPool.query(
      `SELECT event_id AS "eventId", airline, topic, event_type AS "eventType",
              entity_type AS "entityType", entity_id AS "entityId", ref, created_at AS "createdAt"
       FROM roster_event WHERE event_id = $1`,
      [numId]
    )
    if (rows.length === 0) return fail(reply, 404, 'Event not found')
    return success(reply, rows[0])
  })

  fastify.get('/events', async (request, reply) => {
    const schema = z.object({
      after: z.coerce.number().min(0).default(0),
      airline: z.string().length(2).toUpperCase(),
      limit: z.coerce.number().min(1).max(500).default(500),
    })
    const parsed = schema.safeParse(request.query)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)

    const { after, airline, limit } = parsed.data
    const { rows } = await fastify.pgPool.query(
      `SELECT event_id AS "eventId", airline, topic, event_type AS "eventType",
              entity_type AS "entityType", entity_id AS "entityId", ref, created_at AS "createdAt"
       FROM roster_event
       WHERE event_id > $1 AND airline = $2
       ORDER BY event_id ASC
       LIMIT $3`,
      [after, airline, limit]
    )
    return success(reply, rows)
  })
}
