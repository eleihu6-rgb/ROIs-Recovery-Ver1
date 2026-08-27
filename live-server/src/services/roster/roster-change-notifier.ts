import type { FastifyInstance } from 'fastify'
import { invalidatePattern } from '../../utils/cache.js'
import { withPrefix } from '../../utils/redis-key-prefix.js'

interface NotifyRosterTasksChangedOptions {
  schema: string
  crewIds: string[]
  pairingIds?: number[]
}

const ROSTER_CHUNK_VER_PREFIX = 'roster:v2:chunkver'

const uniqueCrewIds = (crewIds: string[]): string[] =>
  [...new Set(crewIds.map((crewId) => crewId.trim()).filter((crewId) => crewId.length > 0))]

export const notifyRosterTasksChanged = async (
  fastify: FastifyInstance,
  options: NotifyRosterTasksChangedOptions,
): Promise<string[]> => {
  const crewIds = uniqueCrewIds(options.crewIds)
  const pairingIds = [...new Set((options.pairingIds ?? []).filter(Number.isFinite))]

  // Keep the legacy whole-view cache clear for older readers, and bump the
  // current per-crew chunk version so /api/roster cannot serve stale rows.
  await invalidatePattern(fastify.redis, 'roster:view:*').catch(() => undefined)
  await Promise.all(
    crewIds.map((crewId) => fastify.redis.incr(withPrefix(`${ROSTER_CHUNK_VER_PREFIX}:${crewId}`)).catch(() => undefined)),
  )

  if (crewIds.length > 0 || pairingIds.length > 0) {
    fastify.wsBroadcastAll(options.schema, {
      type: 'roster-updated',
      crewIds,
      pairingIds,
    })
  }

  return crewIds
}
