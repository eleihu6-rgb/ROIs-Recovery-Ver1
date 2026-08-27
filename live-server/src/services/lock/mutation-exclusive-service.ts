import { randomUUID } from 'node:crypto'
import type { RedisClientType } from 'redis'
import { withPrefix } from '../../utils/redis-key-prefix.js'

const MUTATION_LEASE_TTL_SECONDS = 15 * 60
const MUTATION_LEASE_RENEW_INTERVAL_MS = 5 * 60 * 1000
const MUTATION_KEY_PREFIX = 'mutation:exclusive:'

const RELEASE_SCRIPT = `
local current = redis.call('get', KEYS[1])
if not current then return 0 end
local ok, value = pcall(cjson.decode, current)
if not ok or value['token'] ~= ARGV[1] then return 0 end
return redis.call('del', KEYS[1])
`

const RENEW_SCRIPT = `
local current = redis.call('get', KEYS[1])
if not current then return 0 end
local ok, value = pcall(cjson.decode, current)
if not ok or value['token'] ~= ARGV[1] then return 0 end
return redis.call('expire', KEYS[1], tonumber(ARGV[2]))
`

export type MutationOperation = 'import-pbs-material' | 'roster-bulk-delete'

export interface MutationLeaseRef {
  schema: string
  token: string
}

export interface MutationLease extends MutationLeaseRef {
  operation: MutationOperation
  userCode: string
  acquiredAt: number
}

export interface MutationLockOwner {
  operation: MutationOperation
  userCode: string
  acquiredAt: number
}

export type MutationAcquireResult =
  | { acquired: true; lease: MutationLease }
  | { acquired: false; owner: MutationLockOwner | null }

export class MutationLeaseLostError extends Error {
  constructor() {
    super('The exclusive roster mutation lease was lost. The operation was stopped to protect data consistency.')
    this.name = 'MutationLeaseLostError'
  }
}

export interface MutationLeaseHeartbeat {
  stop: () => void
}

const operationLabels: Record<MutationOperation, string> = {
  'import-pbs-material': 'Import PBS Material',
  'roster-bulk-delete': 'Bulk Delete Roster Flights',
}

const normalizeSchema = (schema: string): string => {
  const normalized = schema.toLowerCase()
  if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
    throw new Error(`Invalid mutation lease schema: ${schema}`)
  }
  return normalized
}

const keyFor = (schema: string): string => withPrefix(`${MUTATION_KEY_PREFIX}${normalizeSchema(schema)}`)

const parseOwner = (raw: string | null): MutationLockOwner | null => {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (value.operation !== 'import-pbs-material' && value.operation !== 'roster-bulk-delete') return null
    if (typeof value.userCode !== 'string' || typeof value.acquiredAt !== 'number') return null
    return {
      operation: value.operation,
      userCode: value.userCode,
      acquiredAt: value.acquiredAt,
    }
  } catch {
    return null
  }
}

export const mutationOperationLabel = (operation: MutationOperation): string => operationLabels[operation]

export const mutationConflictMessage = (
  requestedOperation: MutationOperation,
  owner: MutationLockOwner | null,
  requestedBy?: string,
): string => {
  if (!owner) {
    return 'Your request was not started because another user is performing a roster data operation. Please wait until it finishes, then try again.'
  }

  const ownerOperation = mutationOperationLabel(owner.operation)
  const ownerText = owner.userCode ? ` (user: ${owner.userCode})` : ''
  if (requestedBy && requestedBy === owner.userCode) {
    return `Your ${mutationOperationLabel(requestedOperation)} request was not started because you already have ${ownerOperation} in progress. Please wait until it finishes, then try again.`
  }
  return `Your ${mutationOperationLabel(requestedOperation)} request was not started. Another user is currently running ${ownerOperation}${ownerText}. Please wait until it finishes, then try again.`
}

export const mutationExclusiveService = {
  key: keyFor,

  async tryAcquire(
    redis: RedisClientType,
    schema: string,
    operation: MutationOperation,
    userCode: string,
  ): Promise<MutationAcquireResult> {
    const normalizedSchema = normalizeSchema(schema)
    const token = randomUUID()
    const acquiredAt = Date.now()
    const value = JSON.stringify({ token, operation, userCode, acquiredAt })
    const result = await redis.set(
      keyFor(normalizedSchema),
      value,
      { NX: true, EX: MUTATION_LEASE_TTL_SECONDS },
    )
    if (result === 'OK') {
      return {
        acquired: true,
        lease: { schema: normalizedSchema, token, operation, userCode, acquiredAt },
      }
    }
    return { acquired: false, owner: parseOwner(await redis.get(keyFor(normalizedSchema))) }
  },

  async renew(redis: RedisClientType, lease: MutationLeaseRef): Promise<boolean> {
    const result = await redis.eval(RENEW_SCRIPT, {
      keys: [keyFor(lease.schema)],
      arguments: [lease.token, String(MUTATION_LEASE_TTL_SECONDS)],
    })
    return Number(result) === 1
  },

  async assertOwned(redis: RedisClientType, lease: MutationLeaseRef): Promise<void> {
    if (!await mutationExclusiveService.renew(redis, lease)) {
      throw new MutationLeaseLostError()
    }
  },

  async release(redis: RedisClientType, lease: MutationLeaseRef): Promise<boolean> {
    const result = await redis.eval(RELEASE_SCRIPT, {
      keys: [keyFor(lease.schema)],
      arguments: [lease.token],
    })
    return Number(result) === 1
  },

  startRenewal(
    redis: RedisClientType,
    lease: MutationLeaseRef,
    onLost: (error: Error) => void,
    intervalMs = MUTATION_LEASE_RENEW_INTERVAL_MS,
  ): MutationLeaseHeartbeat {
    let stopped = false
    let reported = false
    const reportLost = (error: Error): void => {
      if (stopped || reported) return
      reported = true
      onLost(error)
    }
    const timer = setInterval(() => {
      void mutationExclusiveService.renew(redis, lease)
        .then((owned) => {
          if (!owned) reportLost(new MutationLeaseLostError())
        })
        .catch((error: unknown) => {
          reportLost(error instanceof Error ? error : new Error(String(error)))
        })
    }, intervalMs)
    timer.unref?.()
    return {
      stop: () => {
        stopped = true
        clearInterval(timer)
      },
    }
  },
}
