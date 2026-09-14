import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { verifyMobileCrewCredentials } from '../../services/mobile-roster/mobile-roster-service.js'
import { listForCrew, markRead } from '../../services/crew-notify/crew-notify-service.js'
import { listCrewAbsences, submitCrewAbsence, type CrewAbsenceDto } from '../../services/absence/crew-absence-service.js'
import { createConsent, decideConsent, discretionProposalSchema, getControllerConsent, getCrewConsent, listConsents, listOpenConsents, prepareConsent } from '../../services/crew-notify/discretion-consent-service.js'
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

/**
 * Absence credentials are wider than the notification ones: absence is a ROIS
 * live-server feature (crew recovery story 101), so it is available for every
 * airline whose mobile roster this service answers — Emirates included (Ryan,
 * 2026-09-13: a DXB crew must file and read back a request). EK's notifications
 * and FDP discretion remain on the EVACC gateway, which is why
 * `credentialsSchema` above stays F8/ET.
 */
const ABSENCE_AIRLINES = ['F8', 'ET', 'EK'] as const
const absenceCredentialsSchema = z.object({
  airline: z.enum(ABSENCE_AIRLINES),
  crewId: z.string().trim().min(1),
  password: z.string().min(1),
}).strict()

const listSchema = z.object({
  airline: z.enum(['F8', 'ET']),
  crewId: z.string().trim().min(1),
  password: z.string().min(1),
  since: z.number().int().min(0).optional(),
}).strict()

const absenceSchema = absenceCredentialsSchema.extend({
  type: z.enum(['sick', 'emergency', 'personal']),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).optional(),
}).strict()

const absenceHistorySchema = absenceCredentialsSchema.extend({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict()

/**
 * Crew-facing projection of a `crew_absence` row. Name, source and the retained
 * pairing ids stay controller-side: the crew only reads what they submitted.
 */
const toCrewAbsence = (row: CrewAbsenceDto) => ({
  id: row.id,
  absenceType: row.absenceType,
  assignment: row.assignment,
  fromDate: row.fromDate,
  toDate: row.toDate,
  status: row.status,
  note: row.note,
  createdAt: row.createdAt,
})

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
      return success(reply, { ...feed, openDiscretions: await listOpenConsents({ pgPool: fastify.pgPool }, parsed.data.airline, crewId) })
    } catch (err) {
      return replyWithError(fastify, reply, err, 'Unable to load crew notifications.')
    }
  })

  // Crew-owned FDP-discretion history (pending + terminal), used by the
  // crew-app Home "Discretion" page. Same durable records as the Alerts feed,
  // read-only, recipient-scoped.
  fastify.post('/discretions', async (request, reply) => {
    const parsed = z.object({
      airline: z.enum(['F8', 'ET']), crewId: z.string().trim().min(1), password: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional(),
    }).strict().safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    try {
      const { crewId } = await verifyMobileCrewCredentials({ pgPool: fastify.pgPool }, parsed.data)
      const requests = await listConsents({ pgPool: fastify.pgPool }, parsed.data.airline, crewId, parsed.data.limit)
      return success(reply, { requests })
    } catch (err) {
      return replyWithError(fastify, reply, err, 'Unable to load FDP discretion history.')
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

  // Controller endpoints retain normal JWT authentication. Crew endpoints use
  // exactly the existing mobile credential verifier and recipient ownership.
  fastify.get('/discretion-duty/:pairingId/:dutySeq', async (request, reply) => {
    if (!request.authUser) return error(reply, 401, 'Authentication required.')
    const params = z.object({ pairingId: z.coerce.number().int().positive(), dutySeq: z.coerce.number().int().positive() }).safeParse(request.params)
    if (!params.success) return fail(reply, 400, params.error.message)
    try { return success(reply, await prepareConsent({ pgPool: fastify.pgPool }, params.data.pairingId, params.data.dutySeq, request.authUser.userCode)) }
    catch (err) { return replyWithError(fastify, reply, err, 'Unable to load duty details.') }
  })
  fastify.post('/discretion-requests', async (request, reply) => {
    if (!request.authUser) return error(reply, 401, 'Authentication required.')
    const parsed = discretionProposalSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)
    try {
      return success(reply, await createConsent({ pgPool: fastify.pgPool }, parsed.data, request.authUser.userCode))
    } catch (err) { return replyWithError(fastify, reply, err, 'Unable to send FDP request.') }
  })
  fastify.get('/discretion-requests/:proposalId', async (request, reply) => {
    if (!request.authUser) return error(reply, 401, 'Authentication required.')
    const params = z.object({ proposalId: z.string().uuid() }).safeParse(request.params)
    if (!params.success) return fail(reply, 400, params.error.message)
    try {
      return success(reply, await getControllerConsent({ pgPool: fastify.pgPool }, params.data.proposalId, request.authUser.userCode))
    } catch (err) { return replyWithError(fastify, reply, err, 'Unable to load crew feedback.') }
  })
  for (const isDecision of [false, true]) {
    fastify.post(`/discretion/:discretionId${isDecision ? '/decision' : ''}`, async (request, reply) => {
      const bodySchema = isDecision ? credentialsSchema.extend({
        decision: z.enum(['accept', 'reject']), idempotencyKey: z.string().min(1).max(150),
        reason: z.string().max(500).optional(),
      }) : credentialsSchema
      const parsed = bodySchema.safeParse(request.body)
      const params = z.object({ discretionId: z.string().uuid() }).safeParse(request.params)
      if (!parsed.success || !params.success) return fail(reply, 400, 'Invalid FDP request.')
      try {
        const { crewId } = await verifyMobileCrewCredentials({ pgPool: fastify.pgPool }, parsed.data)
        const input = { ...parsed.data, crewId, discretionId: params.data.discretionId }
        const result = isDecision
          ? await decideConsent({ pgPool: fastify.pgPool }, { ...input, ...z.object({ decision: z.enum(['accept', 'reject']), idempotencyKey: z.string(), reason: z.string().optional() }).parse(parsed.data) })
          : await getCrewConsent({ pgPool: fastify.pgPool }, input)
        return success(reply, result)
      } catch (err) { return replyWithError(fastify, reply, err, 'Unable to process FDP agreement.') }
    })
  }

  // Crew recovery story 101: crew-submitted sick leave → retained-duty overlap for Live Recovery.
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

  // Crew Recovery Story 101 follow-up (Ryan, 2026-09-13): the crew reviews what
  // they already submitted. The window is the caller's (the app scopes it to the
  // current calendar month); ownership comes from the verified credential, never
  // from the body, so a crew can only read their own rows. Rows overlapping the
  // window come back, cancelled ones included — the crew must see a recovery
  // cancellation rather than silence.
  fastify.post('/absences', async (request, reply) => {
    const parsed = absenceHistorySchema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, parsed.error.message)
    }

    try {
      const { crewId } = await verifyMobileCrewCredentials(
        { pgPool: fastify.pgPool },
        parsed.data,
      )
      const rows = await listCrewAbsences(fastify, {
        crewId,
        fromDate: parsed.data.fromDate,
        toDate: parsed.data.toDate,
      })
      return success(reply, { absences: rows.map(toCrewAbsence) })
    } catch (err) {
      return replyWithError(fastify, reply, err, 'Unable to load the absence history.')
    }
  })
}
