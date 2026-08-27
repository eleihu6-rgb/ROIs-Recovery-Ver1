import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import websocket from '@fastify/websocket'
import jwt from 'jsonwebtoken'
import { env } from '../config/index.js'
import { withPrefix } from '../utils/redis-key-prefix.js'
import type { AuthPayload } from './auth.js'
import { validateAuthPayload } from '../services/auth/session-auth.js'
import type { AssignmentPatch } from '../services/scenario/scenario-patch-service.js'

/** Connected client with metadata */
interface WsClient {
  ws: { send: (data: string) => void; close: (code?: number, reason?: string) => void; readyState: number }
  schema: string
  userId: string
  groupCode: string
  authenticated: boolean
}

/** Server → Client message types */
export type WsServerMessage =
  | { type: 'lock-acquired'; crewId: string; pairingIds: number[]; userId: string; expiresAt: number }
  | { type: 'lock-released'; crewId: string; pairingIds: number[]; userId: string }
  | { type: 'lock-expired'; crewId: string; userId: string }
  | { type: 'roster-updated'; crewIds: string[]; pairingIds?: number[] }
  | { type: 'manday-updated'; crewIds: string[] }
  | { type: 'scenario-manday-updated'; scenarioId: number; crewIds: string[] }
  | { type: 'scenario-kpi-updated'; scenarioId: number }
  | { type: 'scenario-legality-updated'; scenarioId: number }
  | { type: 'scenario-roster-updated'; scenarioId: number; patches: AssignmentPatch[] }
  | { type: 'legality-updated'; groupCode: string }
  | { type: 'locks-snapshot'; locks: LockSnapshot[] }
  | { type: 'violation:pairing:updated'; crewId: string; pairingId: number; passedAll: boolean; highestSeverity: number; checkResults: unknown[]; calcResults: unknown[]; isDraft: false }
  | { type: 'violation:roster:updated'; crewId: string; resultMonth: string; passedAll: boolean; highestSeverity: number; violations: unknown[] }
  | { type: 'authenticated' }
  | { type: 'connected'; lastEventId: number }
  | { type: 'violations.updated'; eventId: number; groupCode: string }

/**
 * Parse a detached-script completion channel `scenario-recompute:{schema}:{scenarioId}`
 * into the airline schema + scenarioId needed to broadcast the WS signal.
 */
export const scenarioRecomputeChannelParts = (channel: string): { schema: string; scenarioId: number } | null => {
  const parts = channel.split(':')
  if (parts.length < 3 || parts[0] !== 'scenario-recompute') return null
  const schema = parts[1]
  if (!schema) return null
  const scenarioId = Number(parts.slice(2).join(':'))
  if (!Number.isInteger(scenarioId) || scenarioId <= 0) return null
  return { schema, scenarioId }
}

export interface LockSnapshot {
  lockType: 'crew' | 'pairing'
  lockId: string
  userId: string
  acquiredAt: number
  expiresAt: number
}

/** Client → Server message types */
type WsClientMessage =
  | { type: 'authenticate'; token: string }
  | { type: 'subscribe'; schema?: string; userId?: string }
  | { type: 'set_rule_group'; groupCode: string; clientId?: string }
  | { type: 'change_rule_group'; from?: string; to: string; clientId?: string }

const authenticateToken = async (db: FastifyInstance['db'], token: string): Promise<AuthPayload | null> => {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload
    return await validateAuthPayload(db, payload)
  } catch {
    return null
  }
}

const normalizeGroupCode = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const groupCode = value.trim()
  if (!groupCode || groupCode.length > 128) return null
  if (/[\u0000-\u001F\u007F]/.test(groupCode)) return null
  return groupCode
}

const closePolicyViolation = (client: WsClient, reason: string): void => {
  if (client.ws.readyState === 1) {
    client.ws.close(1008, reason)
  }
}

/**
 * CSWSH guard — reject cross-origin WebSocket handshakes BEFORE the 101 is sent.
 * Browsers always attach an Origin header; non-browser clients (native apps,
 * curl probes) typically do not. Rules:
 *  - no Origin → allow (non-browser client)
 *  - Origin hostname is localhost / 127.0.0.1 → allow (local dev: gantt on
 *    :5173 dials the WS on :3000, cross-origin by host:port)
 *  - Origin host matches the request Host → allow (same-origin via nginx, which
 *    forwards `Host $host` and the browser Origin untouched)
 *  - otherwise reject 403 (foreign origin, e.g. https://evil.example)
 */
export const isAllowedWsOrigin = (origin: string | undefined, host: string | undefined): boolean => {
  if (!origin) return true
  try {
    const originUrl = new URL(origin)
    const originHostname = originUrl.hostname
    if (originHostname === 'localhost' || originHostname === '127.0.0.1') return true
    if (host && originUrl.host === host) return true
    return false
  } catch {
    return false // malformed or `null` Origin (sandboxed iframe / data URI) → reject
  }
}

/**
 * WebSocket plugin for real-time lock status broadcast and rule violations push.
 * Clients connect to /ws/locks, subscribe to a schema channel, and optionally
 * join a rule group to receive targeted violations.updated notifications.
 */
export default fp(async function websocketPlugin(fastify: FastifyInstance) {
  await fastify.register(websocket)

  const clients = new Set<WsClient>()

  fastify.get('/ws/locks', {
    websocket: true,
    // CSWSH guard: reject foreign-origin handshakes before the 101 is sent.
    // Runs through fastify.routing on the upgrade request, so a 403 reply here
    // prevents the handler from ever reaching handleUpgrade.
    onRequest: (request, reply, done) => {
      if (isAllowedWsOrigin(request.headers.origin, request.headers.host)) return done()
      reply.code(403).send('Cross-origin WebSocket connection rejected')
    },
  }, (socket, _req) => {
    const client: WsClient = { ws: socket, schema: '', userId: '', groupCode: '', authenticated: false }
    let messageQueue = Promise.resolve()
    clients.add(client)

    const handleMessage = async (raw: { toString: () => string }): Promise<void> => {
        try {
          const msg = JSON.parse(raw.toString()) as WsClientMessage

          if (!client.authenticated) {
            if (msg.type !== 'authenticate' || typeof msg.token !== 'string') {
              closePolicyViolation(client, 'Authentication required')
              return
            }

            const payload = await authenticateToken(fastify.db, msg.token)
            if (!payload) {
              closePolicyViolation(client, 'Invalid token')
              return
            }

            client.authenticated = true
            client.schema = payload.schema
            client.userId = payload.userCode
            client.groupCode = ''
            client.ws.send(JSON.stringify({ type: 'authenticated' }))
            fastify.log.info(`WS client authenticated: schema=${payload.schema} user=${payload.userCode}`)
            return
          }

          if (msg.type === 'subscribe') {
            fastify.log.info(`WS client subscribed: schema=${client.schema} user=${client.userId}`)
            const lastEventIdStr = await fastify.redis.get(withPrefix(`rule_engine:last_event:${client.schema}`)) ?? '0'
            client.ws.send(JSON.stringify({ type: 'connected', lastEventId: parseInt(lastEventIdStr, 10) }))
          } else if (msg.type === 'set_rule_group') {
            const groupCode = normalizeGroupCode(msg.groupCode)
            if (groupCode) client.groupCode = groupCode
          } else if (msg.type === 'change_rule_group') {
            const groupCode = normalizeGroupCode(msg.to)
            if (groupCode) client.groupCode = groupCode
          }
        } catch {
          // Ignore malformed messages
        }
    }

    socket.on('message', (raw: { toString: () => string }) => {
      messageQueue = messageQueue.then(() => handleMessage(raw), () => handleMessage(raw))
    })

    socket.on('close', () => {
      clients.delete(client)
    })

    socket.on('error', () => {
      clients.delete(client)
    })
  })

  /** Broadcast a message to all clients in a given schema */
  const broadcast = (schema: string, message: WsServerMessage, excludeUserId?: string): void => {
    const payload = JSON.stringify(message)
    let sent = 0
    for (const client of clients) {
      if (client.authenticated && client.schema === schema && client.ws.readyState === 1) {
        if (excludeUserId && client.userId === excludeUserId) continue
        client.ws.send(payload)
        sent += 1
      }
    }
    fastify.log.info({ schema, type: message.type, clients: clients.size, sent }, 'WS broadcast sent')
  }

  /** Broadcast to ALL clients in a schema (including the sender) */
  const broadcastAll = (schema: string, message: WsServerMessage): void => {
    const payload = JSON.stringify(message)
    let sent = 0
    for (const client of clients) {
      if (client.authenticated && client.schema === schema && client.ws.readyState === 1) {
        client.ws.send(payload)
        sent += 1
      }
    }
    fastify.log.info({ schema, type: message.type, clients: clients.size, sent }, 'WS broadcast all sent')
  }

  /** Broadcast to clients matching schema + groupCode */
  const broadcastByGroupCode = (schema: string, groupCode: string, message: WsServerMessage): void => {
    const payload = JSON.stringify(message)
    let sent = 0
    for (const client of clients) {
      if (client.authenticated && client.schema === schema && client.groupCode === groupCode && client.ws.readyState === 1) {
        client.ws.send(payload)
        sent += 1
      }
    }
    fastify.log.info({ schema, groupCode, type: message.type, clients: clients.size, sent }, 'WS broadcast group sent')
  }

  fastify.decorate('wsBroadcast', broadcast)
  fastify.decorate('wsBroadcastAll', broadcastAll)
  fastify.decorate('wsBroadcastByGroupCode', broadcastByGroupCode)

  // Dedicated Redis subscriber — the main fastify.redis client cannot be used in subscribe mode
  const subscriber = fastify.redis.duplicate()
  subscriber.on('error', (err) => {
    fastify.log.error({ err }, 'WebSocket Redis subscriber error')
  })
  subscriber.on('end', () => {
    fastify.log.warn('WebSocket Redis subscriber connection ended')
  })
  subscriber.on('reconnecting', () => {
    fastify.log.warn('WebSocket Redis subscriber reconnecting')
  })
  await subscriber.connect()

  await subscriber.pSubscribe('violations:*', (message, channel) => {
    // channel format: violations:{schema}:{groupCode}
    const parts = channel.split(':')
    if (parts.length < 3) return
    const schema = parts[1]
    const groupCode = parts.slice(2).join(':')
    const eventId = parseInt(message, 10)

    for (const client of clients) {
      if (
        client.authenticated &&
        client.schema === schema &&
        client.groupCode === groupCode &&
        client.ws.readyState === 1
      ) {
        client.ws.send(JSON.stringify({ type: 'violations.updated', eventId, groupCode }))
      }
    }
  })

  // Detached recompute completion (e.g. scenario-legality.mjs / live-legality.mjs) →
  // WS signal, so clients targeted-refresh legality instead of polling.
  await subscriber.pSubscribe('scenario-recompute:*', (_message, channel) => {
    const parsed = scenarioRecomputeChannelParts(channel)
    if (!parsed) return
    broadcastAll(parsed.schema, { type: 'scenario-legality-updated', scenarioId: parsed.scenarioId })
  })

  // LIVE legality recompute completion (channel: legality-recompute:{schema}:{groupCode}).
  await subscriber.pSubscribe('legality-recompute:*', (_message, channel) => {
    const parts = channel.split(':')
    if (parts.length < 3) return
    const schema = parts[1]
    const groupCode = parts.slice(2).join(':')
    if (!groupCode) return
    broadcastByGroupCode(schema, groupCode, { type: 'legality-updated', groupCode })
  })

  fastify.addHook('onClose', async () => {
    await subscriber.pUnsubscribe().catch(() => undefined)
    await subscriber.disconnect().catch(() => undefined)
  })
})

// Type augmentation for Fastify
declare module 'fastify' {
  interface FastifyInstance {
    wsBroadcast: (schema: string, message: WsServerMessage, excludeUserId?: string) => void
    wsBroadcastAll: (schema: string, message: WsServerMessage) => void
    wsBroadcastByGroupCode: (schema: string, groupCode: string, message: WsServerMessage) => void
  }
}
