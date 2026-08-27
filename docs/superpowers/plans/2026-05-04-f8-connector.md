# F8 Connector Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full F8 airline poll-inbound connector — fetching crew, flight, pairing, and roster-flight data from F8's AWS API Gateway into the ROIS system via the existing connector-server framework.

**Architecture:** connector-server polls 4 F8 endpoints on a cron schedule using a new `poll-inbound-worker`. Each poll call uses F8's custom token auth (`AuthorizationToken` header, not standard OAuth2) and sends POST requests with a date-range JSON body. Transformed data lands in BullMQ inbound queues for live-server to consume.

**Tech Stack:** Fastify + TypeScript + Drizzle ORM + BullMQ + Redis (connector-server), Vitest (tests)

---

## Context

### F8 API endpoints (all POST, all UTC)

| Interface | URL | Body |
|-----------|-----|------|
| Token | `https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken` | `{ clientId, timestamp, sign }` |
| Crew | `https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/crew` | none |
| Flight | `https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/flight` | `{ startDt, endDt }` |
| Pairing | `https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/pairing` | `{ startDt, endDt }` |
| Roster-Flight | `https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/rosterFlight` | `{ startDt, endDt }` |

### Auth spec
- Token request: `POST` with fixed `clientId: "ROIS"`, `sign: "f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c"`, dynamic `timestamp`
- Token response: `{ accessToken, accessTokenExpirationTime }` (ISO datetime)
- All business requests carry header: `AuthorizationToken: <accessToken>`
- On 401/403: immediately re-fetch token, retry once
- Crew endpoint: timeout 60s, retry 3x, delay 2s between retries

### Business rules
- Rank normalization: `CAP/CP → CA`, only `CA` or `FO` allowed
- Rank priority: `CA > FO`, keep highest effective rank (check `effDt`/`expDt`)
- Expired ranks/certs: filter out (expDt < now)
- RHS cert: keep if `isValid === true`
- Roster-flight `pairingId === 0`: SIM/DHD, skip entirely — do not queue

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `connector-server/src/services/auth/f8-token-auth.ts` | F8 custom token acquisition + Redis cache |
| `connector-server/src/transform/f8/crew.ts` | F8 crew JSON → StandardCrew (rank priority + cert filter) |
| `connector-server/src/transform/f8/flight.ts` | F8 flight JSON → StandardFlight |
| `connector-server/src/transform/f8/pairing.ts` | F8 pairing JSON → StandardPairing (rank normalization) |
| `connector-server/src/transform/f8/roster-flight.ts` | F8 roster-flight JSON → StandardRoster (pairingId=0 skip) |
| `connector-server/src/transform/f8/index.ts` | Register all 4 F8 transforms into the registry |
| `connector-server/src/workers/poll-inbound-worker.ts` | BullMQ worker: consumes `connector.poll.trigger` → executes PollInboundHandler → logs result |
| `connector-server/src/__tests__/unit/f8-token-auth.test.ts` | Unit tests for F8 auth service |
| `connector-server/src/__tests__/unit/f8-transforms.test.ts` | Unit tests for all 4 F8 transform plugins |
| `sql/seed/f8/10_connector_f8.sql` | INSERT rows for 4 F8 connector configs in f8 schema |

### Modified files
| File | Change |
|------|--------|
| `connector-server/src/transform/base.ts` | Add `'pairing'` to `StandardRecord.recordType` union; add `StandardPairing` interface |
| `connector-server/src/transform/index.ts` | Re-export `StandardPairing` |
| `connector-server/src/models/connector-config.ts` | Add `method?: 'GET' \| 'POST'` and `pollBodyDays?: number` to `EndpointConfig` |
| `connector-server/src/services/auth/index.ts` | Export `f8TokenAuth` singleton |
| `connector-server/src/services/protocols/poll-inbound.ts` | Support POST body + F8 `AuthorizationToken` header + `retryCount/retryDelay` retry loop |
| `connector-server/src/plugins/bullmq.ts` | Add `pairingInbound`, `rosterInbound`, `pollTrigger` queues to `fastify.queues` |
| `connector-server/src/services/connector/connector-scheduler.ts` | Use `pollTrigger` queue (not `flightInbound`) for repeatable poll jobs |
| `connector-server/src/workers/index.ts` | Export `createPollInboundWorker` |
| `connector-server/src/index.ts` | Init `f8TokenAuth.setRedis`, start poll-inbound worker |

---

## Task 1: Extend StandardRecord — add `pairing` type

**Files:**
- Modify: `connector-server/src/transform/base.ts`

- [ ] **Step 1: Write the failing test**

Add to `connector-server/src/__tests__/unit/transform.test.ts` (at end of file, before closing brace of describe block):

```typescript
describe('StandardRecord types', () => {
  it('should allow pairing as recordType', () => {
    const record: StandardRecord = {
      recordType: 'pairing',
      data: { pairingId: '101198' },
    }
    expect(record.recordType).toBe('pairing')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd connector-server && npx vitest run src/__tests__/unit/transform.test.ts 2>&1 | tail -20
```

Expected: TypeScript compile error — `'pairing' is not assignable to type 'flight' | 'crew' | 'roster'`

- [ ] **Step 3: Update `base.ts`**

In `connector-server/src/transform/base.ts`, change the `recordType` union and add `StandardPairing`:

```typescript
export interface StandardRecord {
  recordType: 'flight' | 'crew' | 'roster' | 'pairing'
  data: Record<string, unknown>
  metadata?: {
    sourceRef?: string
    externalId?: string
    version?: number
  }
}

// ... keep existing interfaces ...

/**
 * Pairing standard record structure
 */
export interface StandardPairing {
  pairingId: string
  pairingDate: string             // ISO date yyyy-MM-dd
  label?: string                  // route label e.g. "YYZ/KIN/YYZ"
  base?: string                   // crew base IATA
  fleet?: string
  durationDays?: number
  compositions?: Array<{
    rank: string                  // CA or FO (normalized)
    planValue: number
  }>
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd connector-server && npx vitest run src/__tests__/unit/transform.test.ts 2>&1 | tail -10
```

Expected: `✓ StandardRecord types > should allow pairing as recordType`

- [ ] **Step 5: Re-export from transform/index.ts**

In `connector-server/src/transform/index.ts`, add to the last export line:

```typescript
export { TransformPlugin, StandardRecord, StandardFlight, StandardCrew, StandardRoster, StandardPairing } from './base.js'
```

- [ ] **Step 6: Commit**

```bash
cd connector-server && git add src/transform/base.ts src/transform/index.ts src/__tests__/unit/transform.test.ts
git commit -m "feat(connector): add pairing to StandardRecord recordType union"
```

---

## Task 2: Extend EndpointConfig model

**Files:**
- Modify: `connector-server/src/models/connector-config.ts`

- [ ] **Step 1: Add fields to EndpointConfig interface**

In `connector-server/src/models/connector-config.ts`, update `EndpointConfig`:

```typescript
export interface EndpointConfig {
  url: string
  headers?: Record<string, string>
  timeout?: number
  retryCount?: number
  retryDelay?: number   // milliseconds between retries
  method?: 'GET' | 'POST'   // default GET
  pollBodyDays?: number     // for POST polls: query window = today to today+N days
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd connector-server && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd connector-server && git add src/models/connector-config.ts
git commit -m "feat(connector): add method and pollBodyDays to EndpointConfig"
```

---

## Task 3: F8 Token Auth Service

**Files:**
- Create: `connector-server/src/services/auth/f8-token-auth.ts`
- Create: `connector-server/src/__tests__/unit/f8-token-auth.test.ts`
- Modify: `connector-server/src/services/auth/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `connector-server/src/__tests__/unit/f8-token-auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { F8TokenAuthService } from '../../services/auth/f8-token-auth.js'

const mockFetch = vi.fn()
global.fetch = mockFetch

const mockRedis = {
  get: vi.fn(),
  setEx: vi.fn(),
}

const mockConfig = {
  connectorCode: 'f8-crew',
  authType: 'f8_token',
  authConfig: {
    tokenUrl: 'https://auth.example.com/getToken',
    clientId: 'ROIS',
    sign: 'f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c',
  },
}

describe('F8TokenAuthService', () => {
  let service: F8TokenAuthService

  beforeEach(() => {
    service = new F8TokenAuthService()
    service.setRedis(mockRedis as never)
    vi.clearAllMocks()
  })

  it('fetches token when cache is empty', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: 'test-token-abc',
        accessTokenExpirationTime: new Date(Date.now() + 3600_000).toISOString(),
      }),
    })

    const token = await service.getAccessToken(mockConfig as never)

    expect(token).toBe('test-token-abc')
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://auth.example.com/getToken')
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body.clientId).toBe('ROIS')
    expect(body.sign).toBe('f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c')
    expect(typeof body.timestamp).toBe('number')
    expect(mockRedis.setEx).toHaveBeenCalledOnce()
  })

  it('returns cached token when still valid', async () => {
    const cachedData = JSON.stringify({
      accessToken: 'cached-token',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    })
    mockRedis.get.mockResolvedValue(cachedData)

    const token = await service.getAccessToken(mockConfig as never)

    expect(token).toBe('cached-token')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('re-fetches token when cache is within 30s of expiry', async () => {
    const cachedData = JSON.stringify({
      accessToken: 'expiring-token',
      expiresAt: Math.floor(Date.now() / 1000) + 20, // 20s left — within 30s buffer
    })
    mockRedis.get.mockResolvedValue(cachedData)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: 'new-token',
        accessTokenExpirationTime: new Date(Date.now() + 3600_000).toISOString(),
      }),
    })

    const token = await service.getAccessToken(mockConfig as never)

    expect(token).toBe('new-token')
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('throws when token endpoint returns non-ok response', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockFetch.mockResolvedValue({ ok: false, status: 401 })

    await expect(service.getAccessToken(mockConfig as never)).rejects.toThrow(
      'F8 token request failed: 401'
    )
  })

  it('throws when authConfig is missing tokenUrl', async () => {
    const badConfig = { ...mockConfig, authConfig: { clientId: 'ROIS' } }
    await expect(service.getAccessToken(badConfig as never)).rejects.toThrow(
      'F8 auth config incomplete'
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd connector-server && npx vitest run src/__tests__/unit/f8-token-auth.test.ts 2>&1 | tail -10
```

Expected: `Cannot find module '../../services/auth/f8-token-auth.js'`

- [ ] **Step 3: Implement `f8-token-auth.ts`**

Create `connector-server/src/services/auth/f8-token-auth.ts`:

```typescript
import type { ConnectorConfig } from '../../models/index.js'
import type { RedisClientType } from 'redis'

interface F8AuthConfig {
  tokenUrl: string
  clientId: string
  sign: string
}

interface F8TokenResponse {
  accessToken: string
  accessTokenExpirationTime: string // ISO datetime
}

interface CachedToken {
  accessToken: string
  expiresAt: number // Unix timestamp seconds
}

export class F8TokenAuthService {
  private redis: RedisClientType | null = null
  private readonly cacheKeyPrefix = 'connector:f8:token:'
  private readonly refreshBufferSeconds = 30

  setRedis(redis: RedisClientType) {
    this.redis = redis
  }

  async getAccessToken(config: ConnectorConfig): Promise<string> {
    const auth = config.authConfig as unknown as F8AuthConfig
    if (!auth?.tokenUrl || !auth?.clientId || !auth?.sign) {
      throw new Error('F8 auth config incomplete: tokenUrl, clientId, sign required')
    }

    const cacheKey = `${this.cacheKeyPrefix}${config.connectorCode}`

    if (this.redis) {
      const cached = await this.redis.get(cacheKey)
      if (cached) {
        const token: CachedToken = JSON.parse(cached)
        if (token.expiresAt > Math.floor(Date.now() / 1000) + this.refreshBufferSeconds) {
          return token.accessToken
        }
      }
    }

    return this.fetchAndCache(auth, cacheKey)
  }

  private async fetchAndCache(auth: F8AuthConfig, cacheKey: string): Promise<string> {
    const body = {
      clientId: auth.clientId,
      timestamp: Math.floor(Date.now() / 1000),
      sign: auth.sign,
    }

    const response = await fetch(auth.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`F8 token request failed: ${response.status}`)
    }

    const data = (await response.json()) as F8TokenResponse
    const expiresAt = Math.floor(new Date(data.accessTokenExpirationTime).getTime() / 1000)
    const ttl = Math.max(expiresAt - Math.floor(Date.now() / 1000) - this.refreshBufferSeconds, 60)

    if (this.redis) {
      const cached: CachedToken = { accessToken: data.accessToken, expiresAt }
      await this.redis.setEx(cacheKey, ttl, JSON.stringify(cached))
    }

    return data.accessToken
  }
}

export const f8TokenAuth = new F8TokenAuthService()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd connector-server && npx vitest run src/__tests__/unit/f8-token-auth.test.ts 2>&1 | tail -10
```

Expected: `5 tests passed`

- [ ] **Step 5: Export from auth/index.ts**

In `connector-server/src/services/auth/index.ts`:

```typescript
export { apiKeyAuth, ApiKeyAuthService } from './api-key-auth.js'
export { oauth2Auth, OAuth2AuthService } from './oauth2-cc-auth.js'
export { f8TokenAuth, F8TokenAuthService } from './f8-token-auth.js'
```

- [ ] **Step 6: Commit**

```bash
cd connector-server && git add src/services/auth/f8-token-auth.ts src/services/auth/index.ts src/__tests__/unit/f8-token-auth.test.ts
git commit -m "feat(connector): add F8 custom token auth service with Redis cache"
```

---

## Task 4: Extend PollInboundHandler — POST body + retry + F8 token

**Files:**
- Modify: `connector-server/src/services/protocols/poll-inbound.ts`

- [ ] **Step 1: Write the failing tests**

Create `connector-server/src/__tests__/unit/poll-inbound-post.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PollInboundHandler } from '../../services/protocols/poll-inbound.js'

const mockFetch = vi.fn()
global.fetch = mockFetch

const mockQueue = { add: vi.fn() }

const baseConfig = {
  connectorCode: 'f8-flight',
  dataDomain: 'flight',
  authType: 'f8_token',
  authConfig: {
    tokenUrl: 'https://auth.example.com/getToken',
    clientId: 'ROIS',
    sign: 'abc123',
  },
  endpointConfig: {
    url: 'https://api.example.com/flight',
    method: 'POST',
    timeout: 30000,
    retryCount: 2,
    retryDelay: 100,
  },
  transformPlugin: null,
}

describe('PollInboundHandler — POST + F8 token', () => {
  let handler: PollInboundHandler

  beforeEach(() => {
    handler = new PollInboundHandler(mockQueue as never)
    vi.clearAllMocks()
    // Mock F8 token fetch
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'mock-f8-token',
          accessTokenExpirationTime: new Date(Date.now() + 3600_000).toISOString(),
        }),
      })
  })

  it('sends POST with AuthorizationToken header and date body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ flightNo: 'F8804', depDate: '2026-03-04', depAirport: 'YVR', arrAirport: 'YYC' }],
    })

    const result = await handler.execute(baseConfig as never, {
      startDt: '2026-03-01',
      endDt: '2026-03-05',
    })

    expect(result.status).toBe('success')
    const [url, options] = mockFetch.mock.calls[1]
    expect(url).toBe('https://api.example.com/flight')
    expect(options.method).toBe('POST')
    expect(options.headers['AuthorizationToken']).toBe('mock-f8-token')
    expect(JSON.parse(options.body)).toEqual({ startDt: '2026-03-01', endDt: '2026-03-05' })
  })

  it('retries on failure up to retryCount times', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

    const result = await handler.execute(baseConfig as never, {
      startDt: '2026-03-01',
      endDt: '2026-03-05',
    })

    // retryCount: 2 means 1 initial + 2 retries = 3 total fetch calls (after token fetch)
    expect(mockFetch).toHaveBeenCalledTimes(4) // 1 token + 3 data fetches
    expect(result.status).toBe('success')
  })

  it('returns fail after exhausting retries', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })

    const result = await handler.execute(baseConfig as never, {
      startDt: '2026-03-01',
      endDt: '2026-03-05',
    })

    expect(result.status).toBe('fail')
  })

  it('sends GET without body when method is GET', async () => {
    const getConfig = {
      ...baseConfig,
      endpointConfig: { url: 'https://api.example.com/crew', method: 'GET', timeout: 60000 },
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    await handler.execute(getConfig as never)

    const [, options] = mockFetch.mock.calls[1]
    expect(options.method).toBe('GET')
    expect(options.body).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd connector-server && npx vitest run src/__tests__/unit/poll-inbound-post.test.ts 2>&1 | tail -15
```

Expected: tests fail (handler does GET, no retry, no AuthorizationToken)

- [ ] **Step 3: Rewrite `poll-inbound.ts`**

Replace the entire file `connector-server/src/services/protocols/poll-inbound.ts`:

```typescript
import { ProtocolHandler, ExecuteResult } from './protocol-handler.js'
import { ConnectorConfig, EndpointConfig } from '../../models/index.js'
import { getTransform, StandardRecord } from '../../transform/index.js'
import { oauth2Auth, f8TokenAuth } from '../auth/index.js'
import type { Queue } from 'bullmq'

interface PollInboundConfig {
  fromTime?: string   // ISO datetime — incremental GET polling
  toTime?: string
  startDt?: string    // yyyy-MM-dd — POST date range polling (F8 style)
  endDt?: string
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class PollInboundHandler implements ProtocolHandler {
  private queue: Queue

  constructor(queue: Queue) {
    this.queue = queue
  }

  async execute(config: ConnectorConfig, pollConfig?: PollInboundConfig): Promise<ExecuteResult> {
    const startTime = Date.now()
    const transform = getTransform(config.transformPlugin)
    const endpointConfig = config.endpointConfig as EndpointConfig
    const retryCount = endpointConfig.retryCount ?? 0
    const retryDelay = endpointConfig.retryDelay ?? 2000

    // Build auth headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...endpointConfig.headers,
    }

    if (config.authType === 'f8_token') {
      const token = await f8TokenAuth.getAccessToken(config)
      headers['AuthorizationToken'] = token
    } else if (config.authType === 'oauth2_cc') {
      const token = await oauth2Auth.getAccessToken(config)
      headers['Authorization'] = `Bearer ${token}`
    }

    // Build request options
    const method = endpointConfig.method ?? 'GET'
    let url = endpointConfig.url
    let body: string | undefined

    if (method === 'POST') {
      if (pollConfig?.startDt && pollConfig?.endDt) {
        body = JSON.stringify({ startDt: pollConfig.startDt, endDt: pollConfig.endDt })
      }
    } else {
      // GET: append query params if provided
      if (pollConfig?.fromTime || pollConfig?.toTime) {
        const params = new URLSearchParams()
        if (pollConfig.fromTime) params.set('from', pollConfig.fromTime)
        if (pollConfig.toTime) params.set('to', pollConfig.toTime)
        url = `${url}?${params.toString()}`
      }
    }

    // Execute with retry
    let lastError = ''
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      if (attempt > 0) {
        await sleep(retryDelay)
      }

      try {
        const response = await fetch(url, {
          method,
          headers,
          body,
          signal: endpointConfig.timeout
            ? AbortSignal.timeout(endpointConfig.timeout)
            : undefined,
        })

        if (!response.ok) {
          // Re-auth on 401/403, then retry
          if (response.status === 401 || response.status === 403) {
            if (config.authType === 'f8_token') {
              const token = await f8TokenAuth.getAccessToken(config)
              headers['AuthorizationToken'] = token
            }
          }
          lastError = `External API returned ${response.status}`
          continue
        }

        const rawData = await response.json()
        const records: unknown[] = Array.isArray(rawData)
          ? rawData
          : (rawData as { body?: unknown[] }).body ?? [rawData]

        const standardRecords: StandardRecord[] = records
          .map(raw => {
            try {
              return transform.toStandard(raw)
            } catch {
              return null
            }
          })
          .filter((r): r is StandardRecord => r !== null)

        const sourceRef = `poll:${config.connectorCode}:${Date.now()}`
        await this.queue.add('inbound', {
          connectorCode: config.connectorCode,
          schema: '',
          dataType: config.dataDomain as 'flight' | 'crew' | 'pairing' | 'roster',
          records: standardRecords,
          sourceRef,
        }, {
          jobId: sourceRef,
          removeOnComplete: true,
        })

        return {
          status: standardRecords.length === records.length ? 'success' : 'partial',
          recordsIn: records.length,
          recordsOut: standardRecords.length,
          durationMs: Date.now() - startTime,
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        if (attempt < retryCount) continue
      }
    }

    return {
      status: 'fail',
      recordsIn: 0,
      recordsOut: 0,
      errorMessage: lastError,
      durationMs: Date.now() - startTime,
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd connector-server && npx vitest run src/__tests__/unit/poll-inbound-post.test.ts 2>&1 | tail -15
```

Expected: `4 tests passed`

- [ ] **Step 5: Run all existing tests to check no regressions**

```bash
cd connector-server && npx vitest run 2>&1 | tail -20
```

Expected: all existing tests still pass

- [ ] **Step 6: Commit**

```bash
cd connector-server && git add src/services/protocols/poll-inbound.ts src/__tests__/unit/poll-inbound-post.test.ts
git commit -m "feat(connector): extend PollInboundHandler with POST body, F8 token auth, and retry"
```

---

## Task 5: Add BullMQ queues + poll-inbound worker

**Files:**
- Modify: `connector-server/src/plugins/bullmq.ts`
- Create: `connector-server/src/workers/poll-inbound-worker.ts`
- Modify: `connector-server/src/services/connector/connector-scheduler.ts`
- Modify: `connector-server/src/workers/index.ts`
- Modify: `connector-server/src/index.ts`

- [ ] **Step 1: Extend bullmq.ts with new queues**

Replace `connector-server/src/plugins/bullmq.ts`:

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { Queue, QueueBaseOptions } from 'bullmq'
import { env } from '../config/index.js'

const queueBaseOptions: QueueBaseOptions = {
  connection: {
    host: env.REDIS_URL.split('@')[1]?.split(':')[0] || 'localhost',
    port: parseInt(env.REDIS_URL.split(':').pop() || '6379'),
  },
}

declare module 'fastify' {
  interface FastifyInstance {
    queues: {
      flightInbound: Queue
      crewInbound: Queue
      pairingInbound: Queue
      rosterInbound: Queue
      rosterOutbound: Queue
      pollTrigger: Queue
    }
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const flightInbound = new Queue('connector.flight.inbound', queueBaseOptions)
  const crewInbound = new Queue('connector.crew.inbound', queueBaseOptions)
  const pairingInbound = new Queue('connector.pairing.inbound', queueBaseOptions)
  const rosterInbound = new Queue('connector.roster.inbound', queueBaseOptions)
  const rosterOutbound = new Queue('connector.roster.outbound', queueBaseOptions)
  const pollTrigger = new Queue('connector.poll.trigger', queueBaseOptions)

  fastify.decorate('queues', {
    flightInbound,
    crewInbound,
    pairingInbound,
    rosterInbound,
    rosterOutbound,
    pollTrigger,
  })

  fastify.log.info('BullMQ queues initialized')

  fastify.addHook('onClose', async () => {
    await Promise.all([
      flightInbound.close(),
      crewInbound.close(),
      pairingInbound.close(),
      rosterInbound.close(),
      rosterOutbound.close(),
      pollTrigger.close(),
    ])
    fastify.log.info('BullMQ queues closed')
  })
})

export { queueBaseOptions }
```

- [ ] **Step 2: Create `poll-inbound-worker.ts`**

Create `connector-server/src/workers/poll-inbound-worker.ts`:

```typescript
import { Worker, Job } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { format, addDays } from 'date-fns'
import { queueBaseOptions } from '../plugins/bullmq.js'
import { connectorConfigService } from '../services/connector/index.js'
import { PollInboundHandler } from '../services/protocols/index.js'
import { connectorLog, NewConnectorLog } from '../models/index.js'
import type { Queue } from 'bullmq'
import type { EndpointConfig } from '../models/index.js'

interface PollTriggerJob {
  connectorCode: string
}

const selectDataQueue = (fastify: FastifyInstance, dataDomain: string): Queue => {
  const map: Record<string, Queue> = {
    flight: fastify.queues.flightInbound,
    crew: fastify.queues.crewInbound,
    pairing: fastify.queues.pairingInbound,
    roster: fastify.queues.rosterInbound,
  }
  const q = map[dataDomain]
  if (!q) throw new Error(`No inbound queue for dataDomain: ${dataDomain}`)
  return q
}

export const createPollInboundWorker = (fastify: FastifyInstance): Worker => {
  const worker = new Worker<PollTriggerJob>(
    'connector.poll.trigger',
    async (job: Job<PollTriggerJob>) => {
      const { connectorCode } = job.data
      fastify.log.info({ connectorCode }, 'Poll trigger received')

      const config = await connectorConfigService.getConfig(connectorCode)
      if (!config || config.isEnabled !== 1 || config.isDeleted !== 0) {
        fastify.log.warn({ connectorCode }, 'Connector not found or disabled — skipping')
        return
      }

      const endpointConfig = config.endpointConfig as EndpointConfig
      const dataQueue = selectDataQueue(fastify, config.dataDomain)
      const handler = new PollInboundHandler(dataQueue)

      // Compute date range for POST-style polls
      let pollConfig: { startDt?: string; endDt?: string } | undefined
      if (endpointConfig.method === 'POST' && endpointConfig.pollBodyDays) {
        const today = new Date()
        pollConfig = {
          startDt: format(today, 'yyyy-MM-dd'),
          endDt: format(addDays(today, endpointConfig.pollBodyDays), 'yyyy-MM-dd'),
        }
      }

      const result = await handler.execute(config, pollConfig)

      const logEntry: NewConnectorLog = {
        connectorId: config.id,
        direction: 'inbound',
        status: result.status,
        recordsIn: result.recordsIn,
        recordsOut: result.recordsOut,
        errorMessage: result.errorMessage,
        durationMs: result.durationMs,
      }
      await fastify.db.insert(connectorLog).values(logEntry)

      fastify.log.info({
        connectorCode,
        status: result.status,
        recordsIn: result.recordsIn,
        recordsOut: result.recordsOut,
        durationMs: result.durationMs,
      }, 'Poll inbound completed')
    },
    {
      ...queueBaseOptions,
      concurrency: 3,
    }
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, error: err.message }, 'Poll trigger job failed')
  })

  return worker
}
```

- [ ] **Step 3: Update connector-scheduler.ts to use pollTrigger queue**

Replace `connector-server/src/services/connector/connector-scheduler.ts`:

```typescript
import type { FastifyInstance } from 'fastify'
import { connectorConfigService } from './connector-config-service.js'

export class ConnectorScheduler {
  private fastify: FastifyInstance | null = null

  setFastify(fastify: FastifyInstance) {
    this.fastify = fastify
  }

  async schedulePollInbound(connectorCode: string, cron: string): Promise<void> {
    if (!this.fastify) throw new Error('Fastify instance not set')

    await this.fastify.queues.pollTrigger.add(
      'poll',
      { connectorCode },
      {
        repeat: { pattern: cron },
        jobId: `poll:${connectorCode}`,
      }
    )
    this.fastify.log.info({ connectorCode, cron }, 'Scheduled poll inbound')
  }

  async unschedulePollInbound(connectorCode: string): Promise<void> {
    if (!this.fastify) throw new Error('Fastify instance not set')

    const repeatableJobs = await this.fastify.queues.pollTrigger.getRepeatableJobs()
    const job = repeatableJobs.find(j => j.id === `poll:${connectorCode}`)
    if (job) {
      await this.fastify.queues.pollTrigger.removeRepeatableByKey(job.key)
      this.fastify.log.info({ connectorCode }, 'Unscheduled poll inbound')
    }
  }

  async triggerNow(connectorCode: string): Promise<void> {
    if (!this.fastify) throw new Error('Fastify instance not set')

    await this.fastify.queues.pollTrigger.add('poll', { connectorCode }, {
      jobId: `manual:${connectorCode}:${Date.now()}`,
    })
  }
}

export const connectorScheduler = new ConnectorScheduler()
```

- [ ] **Step 4: Update workers/index.ts**

```typescript
export { createRosterOutboundWorker } from './roster-outbound-worker.js'
export { createPollInboundWorker } from './poll-inbound-worker.js'
```

- [ ] **Step 5: Update src/index.ts to init f8TokenAuth and start poll worker**

In `connector-server/src/index.ts`, add imports and initialization:

```typescript
import 'dotenv/config'
import Fastify from 'fastify'
import formbody from '@fastify/formbody'
import { env } from './config/index.js'
import databasePlugin from './plugins/database.js'
import redisPlugin from './plugins/redis.js'
import bullmqPlugin from './plugins/bullmq.js'
import authPlugin from './plugins/auth.js'
import swaggerPlugin from './plugins/swagger.js'
import { registerRoutes } from './routes/index.js'
import { connectorConfigService, connectorScheduler } from './services/connector/index.js'
import { oauth2Auth, f8TokenAuth } from './services/auth/index.js'
import { createRosterOutboundWorker, createPollInboundWorker } from './workers/index.js'
import { registerF8Transforms } from './transform/f8/index.js'

const fastify = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport: { target: 'pino-pretty', options: { colorize: true } }
  }
})

const start = async () => {
  try {
    // Register transforms first (stateless, no deps)
    registerF8Transforms()

    await fastify.register(databasePlugin)
    await fastify.register(redisPlugin)
    await fastify.register(bullmqPlugin)
    await fastify.register(formbody)
    await fastify.register(authPlugin)
    await fastify.register(swaggerPlugin)

    connectorConfigService.setFastify(fastify)
    connectorConfigService.setRedis(fastify.redis)
    connectorScheduler.setFastify(fastify)
    oauth2Auth.setRedis(fastify.redis)
    f8TokenAuth.setRedis(fastify.redis)

    registerRoutes(fastify)

    const rosterWorker = createRosterOutboundWorker(fastify)
    const pollWorker = createPollInboundWorker(fastify)

    fastify.addHook('onClose', async () => {
      await rosterWorker.close()
      await pollWorker.close()
    })

    await fastify.listen({ host: env.HOST, port: env.PORT })
    console.log(`Connector server listening on ${env.HOST}:${env.PORT}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
```

- [ ] **Step 6: Check date-fns is available**

```bash
cd connector-server && cat package.json | grep date-fns
```

If not present, add it:

```bash
cd connector-server && npm install date-fns
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd connector-server && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
cd connector-server && git add src/plugins/bullmq.ts src/workers/poll-inbound-worker.ts src/services/connector/connector-scheduler.ts src/workers/index.ts src/index.ts
git commit -m "feat(connector): add poll-inbound-worker and pairingInbound/rosterInbound/pollTrigger queues"
```

---

## Task 6: F8 Crew Transform

**Files:**
- Create: `connector-server/src/transform/f8/crew.ts`
- Create: `connector-server/src/__tests__/unit/f8-transforms.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `connector-server/src/__tests__/unit/f8-transforms.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { F8CrewTransform } from '../../transform/f8/crew.js'

const now = new Date()
const future = new Date(now.getTime() + 365 * 24 * 3600_000).toISOString()
const past = new Date(now.getTime() - 10_000).toISOString()

const sampleCrew = {
  owner: 'F8',
  crewId: 5510,
  firstName: 'Peter',
  middleName: '',
  lastName: 'Adams',
  gender: 'Male',
  telephone: '647-449-2247',
  workEmail: 'peter.adams@flyflair.com',
  bases: [
    { crewId: 5510, base: 'YYZ', effDt: '2018-06-22T00:00:00Z', expDt: '2055-09-16T23:59:59Z', isPrimary: true },
    { crewId: 5510, base: 'YVR', effDt: '2018-06-22T00:00:00Z', expDt: '2055-09-16T23:59:59Z', isPrimary: false },
  ],
  ranks: [
    { rank: 'CA', effDt: '2018-06-22T00:00:00Z', expDt: future },
    { rank: 'FO', effDt: '2025-11-30T00:00:00Z', expDt: '2055-12-01T23:59:59Z' },
  ],
  certificates: [
    { certificate: 'RHS', isValid: true, expDt: future },
  ],
}

describe('F8CrewTransform', () => {
  const transform = new F8CrewTransform()

  it('maps crewId to crewCode string', () => {
    const result = transform.toStandard(sampleCrew)
    expect(result.recordType).toBe('crew')
    expect(result.data.crewCode).toBe('5510')
  })

  it('sets crewName as firstName + lastName', () => {
    const result = transform.toStandard(sampleCrew)
    expect(result.data.crewName).toBe('Peter Adams')
  })

  it('picks highest effective rank (CA > FO)', () => {
    const result = transform.toStandard(sampleCrew)
    expect(result.data.rank).toBe('CA')
  })

  it('falls back to FO when CA is expired', () => {
    const crewFoOnly = {
      ...sampleCrew,
      ranks: [
        { rank: 'CA', effDt: '2018-06-22T00:00:00Z', expDt: past },
        { rank: 'FO', effDt: '2020-01-01T00:00:00Z', expDt: future },
      ],
    }
    const result = transform.toStandard(crewFoOnly)
    expect(result.data.rank).toBe('FO')
  })

  it('normalizes CAP to CA', () => {
    const crewWithCap = {
      ...sampleCrew,
      ranks: [{ rank: 'CAP', effDt: '2018-06-22T00:00:00Z', expDt: future }],
    }
    const result = transform.toStandard(crewWithCap)
    expect(result.data.rank).toBe('CA')
  })

  it('picks primary base', () => {
    const result = transform.toStandard(sampleCrew)
    expect(result.data.base).toBe('YYZ')
  })

  it('sets hasRhs true when valid RHS cert exists', () => {
    const result = transform.toStandard(sampleCrew)
    expect(result.data.hasRhs).toBe(true)
  })

  it('sets hasRhs false when RHS cert isValid=false', () => {
    const crew = { ...sampleCrew, certificates: [{ certificate: 'RHS', isValid: false, expDt: future }] }
    const result = transform.toStandard(crew)
    expect(result.data.hasRhs).toBe(false)
  })

  it('sets hasRhs false when RHS cert is expired', () => {
    const crew = { ...sampleCrew, certificates: [{ certificate: 'RHS', isValid: true, expDt: past }] }
    const result = transform.toStandard(crew)
    expect(result.data.hasRhs).toBe(false)
  })

  it('sets externalId in metadata', () => {
    const result = transform.toStandard(sampleCrew)
    expect(result.metadata?.externalId).toBe('5510')
  })

  it('throws on invalid input', () => {
    expect(() => transform.toStandard(null)).toThrow()
    expect(() => transform.toStandard({ notACrew: true })).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd connector-server && npx vitest run src/__tests__/unit/f8-transforms.test.ts 2>&1 | tail -10
```

Expected: `Cannot find module '../../transform/f8/crew.js'`

- [ ] **Step 3: Implement `f8/crew.ts`**

Create `connector-server/src/transform/f8/crew.ts`:

```typescript
import { TransformPlugin, StandardRecord } from '../base.js'

const RANK_PRIORITY: Record<string, number> = { CA: 2, FO: 1 }

const normalizeRank = (rank: string): string => {
  if (rank === 'CAP' || rank === 'CP') return 'CA'
  return rank
}

interface F8RankRecord {
  rank: string
  effDt: string
  expDt: string
}

interface F8Base {
  base: string
  isPrimary: boolean
}

interface F8Certificate {
  certificate: string
  isValid: boolean
  expDt: string
}

interface F8Crew {
  crewId: number
  firstName: string
  middleName?: string
  lastName: string
  bases: F8Base[]
  ranks: F8RankRecord[]
  certificates: F8Certificate[]
}

const isActive = (effDt: string, expDt: string): boolean => {
  const now = Date.now()
  return new Date(effDt).getTime() <= now && new Date(expDt).getTime() > now
}

export class F8CrewTransform implements TransformPlugin {
  toStandard(raw: unknown): StandardRecord {
    if (!raw || typeof raw !== 'object') {
      throw new Error('F8CrewTransform: invalid input')
    }
    const crew = raw as F8Crew
    if (typeof crew.crewId !== 'number') {
      throw new Error('F8CrewTransform: missing crewId')
    }

    // Determine effective rank (highest priority among active ranks)
    const activeRanks = (crew.ranks ?? [])
      .map(r => ({ ...r, normalized: normalizeRank(r.rank) }))
      .filter(r => isActive(r.effDt, r.expDt) && RANK_PRIORITY[r.normalized] !== undefined)
      .sort((a, b) => (RANK_PRIORITY[b.normalized] ?? 0) - (RANK_PRIORITY[a.normalized] ?? 0))

    const rank = activeRanks[0]?.normalized ?? null

    // Primary base
    const primaryBase = (crew.bases ?? []).find(b => b.isPrimary)?.base ?? crew.bases?.[0]?.base

    // RHS cert: isValid true AND not expired
    const hasRhs = (crew.certificates ?? []).some(
      c => c.certificate === 'RHS' && c.isValid && isActive('2000-01-01T00:00:00Z', c.expDt)
    )

    const crewCode = String(crew.crewId)

    return {
      recordType: 'crew',
      data: {
        crewCode,
        crewName: [crew.firstName, crew.lastName].filter(Boolean).join(' '),
        rank,
        base: primaryBase,
        status: 'active',
        hasRhs,
      },
      metadata: { externalId: crewCode },
    }
  }

  fromStandard(record: StandardRecord): unknown {
    return record.data
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd connector-server && npx vitest run src/__tests__/unit/f8-transforms.test.ts --reporter=verbose 2>&1 | grep -E "(✓|✗|PASS|FAIL|F8Crew)" | head -20
```

Expected: all F8CrewTransform tests pass

- [ ] **Step 5: Commit**

```bash
cd connector-server && git add src/transform/f8/crew.ts src/__tests__/unit/f8-transforms.test.ts
git commit -m "feat(connector/f8): add F8 crew transform with rank priority and RHS cert logic"
```

---

## Task 7: F8 Flight Transform

**Files:**
- Create: `connector-server/src/transform/f8/flight.ts`
- Modify: `connector-server/src/__tests__/unit/f8-transforms.test.ts`

- [ ] **Step 1: Add failing tests to `f8-transforms.test.ts`**

Append to the existing `f8-transforms.test.ts` file (after the crew describe block):

```typescript
import { F8FlightTransform } from '../../transform/f8/flight.js'

const sampleFlight = {
  owner: 'F8 - Flair Airlines',
  legNo: 804,
  datOp: '2026-03-04T00:00:00Z',
  fltId: 'F8804',
  depStn: 'YVR',
  arrStn: 'YYC',
  status: 'Completed',
  std: '2026-03-04T16:50:00Z',
  sta: '2026-03-04T18:20:00Z',
  atd: '2026-03-04T16:50:00Z',
  ata: '2026-03-04T18:18:00Z',
  acGrp: '7M8',
  acReg: 'C-FLGD',
}

describe('F8FlightTransform', () => {
  const transform = new F8FlightTransform()

  it('maps fltId to flightNo', () => {
    const result = transform.toStandard(sampleFlight)
    expect(result.recordType).toBe('flight')
    expect(result.data.flightNo).toBe('F8804')
  })

  it('extracts date portion of datOp as depDate', () => {
    const result = transform.toStandard(sampleFlight)
    expect(result.data.depDate).toBe('2026-03-04')
  })

  it('maps depStn/arrStn to depAirport/arrAirport', () => {
    const result = transform.toStandard(sampleFlight)
    expect(result.data.depAirport).toBe('YVR')
    expect(result.data.arrAirport).toBe('YYC')
  })

  it('uses std as depTime and sta as arrTime', () => {
    const result = transform.toStandard(sampleFlight)
    expect(result.data.depTime).toBe('2026-03-04T16:50:00Z')
    expect(result.data.arrTime).toBe('2026-03-04T18:20:00Z')
  })

  it('maps acGrp to aircraftType and acReg to acReg', () => {
    const result = transform.toStandard(sampleFlight)
    expect(result.data.aircraftType).toBe('7M8')
    expect(result.data.acReg).toBe('C-FLGD')
  })

  it('throws on invalid input', () => {
    expect(() => transform.toStandard(null)).toThrow()
    expect(() => transform.toStandard({ noFltId: true })).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd connector-server && npx vitest run src/__tests__/unit/f8-transforms.test.ts 2>&1 | grep -E "F8Flight|Cannot find" | head -5
```

Expected: `Cannot find module '../../transform/f8/flight.js'`

- [ ] **Step 3: Implement `f8/flight.ts`**

Create `connector-server/src/transform/f8/flight.ts`:

```typescript
import { TransformPlugin, StandardRecord } from '../base.js'

interface F8Flight {
  fltId: string
  datOp: string
  depStn: string
  arrStn: string
  std?: string
  sta?: string
  atd?: string
  ata?: string
  acGrp?: string
  acReg?: string
}

export class F8FlightTransform implements TransformPlugin {
  toStandard(raw: unknown): StandardRecord {
    if (!raw || typeof raw !== 'object') {
      throw new Error('F8FlightTransform: invalid input')
    }
    const f = raw as F8Flight
    if (!f.fltId || !f.datOp) {
      throw new Error('F8FlightTransform: missing fltId or datOp')
    }

    const depDate = f.datOp.slice(0, 10) // "2026-03-04"

    return {
      recordType: 'flight',
      data: {
        flightNo: f.fltId,
        depDate,
        depAirport: f.depStn,
        arrAirport: f.arrStn,
        depTime: f.std ?? f.atd,
        arrTime: f.sta ?? f.ata,
        aircraftType: f.acGrp,
        acReg: f.acReg,
      },
      metadata: { externalId: `${f.fltId}:${depDate}` },
    }
  }

  fromStandard(record: StandardRecord): unknown {
    return record.data
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd connector-server && npx vitest run src/__tests__/unit/f8-transforms.test.ts --reporter=verbose 2>&1 | grep -E "(✓|✗|F8Flight)" | head -10
```

Expected: all F8FlightTransform tests pass

- [ ] **Step 5: Commit**

```bash
cd connector-server && git add src/transform/f8/flight.ts src/__tests__/unit/f8-transforms.test.ts
git commit -m "feat(connector/f8): add F8 flight transform"
```

---

## Task 8: F8 Pairing Transform

**Files:**
- Create: `connector-server/src/transform/f8/pairing.ts`
- Modify: `connector-server/src/__tests__/unit/f8-transforms.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `f8-transforms.test.ts`:

```typescript
import { F8PairingTransform } from '../../transform/f8/pairing.js'

const samplePairing = {
  pairingId: '101198',
  pairingDt: '2026-02-23 00:00:00',
  label: 'YYZ/KIN/YYZ/FLL/YYZ',
  base: 'YUL',
  fleet: '737',
  durationDays: 5,
  pairingCompositions: [
    { actingRank: 'CAP', planValue: 1 },
    { actingRank: 'FO', planValue: 1 },
  ],
  pairingDutyList: [],
}

describe('F8PairingTransform', () => {
  const transform = new F8PairingTransform()

  it('maps pairingId and base fields', () => {
    const result = transform.toStandard(samplePairing)
    expect(result.recordType).toBe('pairing')
    expect(result.data.pairingId).toBe('101198')
    expect(result.data.base).toBe('YUL')
    expect(result.data.fleet).toBe('737')
    expect(result.data.durationDays).toBe(5)
  })

  it('converts pairingDt to ISO date string', () => {
    const result = transform.toStandard(samplePairing)
    expect(result.data.pairingDate).toBe('2026-02-23')
  })

  it('normalizes CAP → CA in compositions', () => {
    const result = transform.toStandard(samplePairing)
    const comps = result.data.compositions as Array<{ rank: string; planValue: number }>
    expect(comps[0].rank).toBe('CA')
    expect(comps[1].rank).toBe('FO')
  })

  it('throws on missing pairingId', () => {
    expect(() => transform.toStandard({ base: 'YYZ' })).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd connector-server && npx vitest run src/__tests__/unit/f8-transforms.test.ts 2>&1 | grep "F8Pairing\|Cannot find" | head -5
```

- [ ] **Step 3: Implement `f8/pairing.ts`**

Create `connector-server/src/transform/f8/pairing.ts`:

```typescript
import { TransformPlugin, StandardRecord } from '../base.js'

const normalizeRank = (rank: string): string => {
  if (rank === 'CAP' || rank === 'CP') return 'CA'
  return rank
}

interface F8PairingComposition {
  actingRank: string
  planValue: number
}

interface F8Pairing {
  pairingId: string
  pairingDt: string
  label?: string
  base?: string
  fleet?: string
  durationDays?: number
  pairingCompositions?: F8PairingComposition[]
}

export class F8PairingTransform implements TransformPlugin {
  toStandard(raw: unknown): StandardRecord {
    if (!raw || typeof raw !== 'object') {
      throw new Error('F8PairingTransform: invalid input')
    }
    const p = raw as F8Pairing
    if (!p.pairingId) {
      throw new Error('F8PairingTransform: missing pairingId')
    }

    // pairingDt may be "2026-02-23 00:00:00" or ISO — extract date part
    const pairingDate = p.pairingDt?.slice(0, 10) ?? ''

    const compositions = (p.pairingCompositions ?? []).map(c => ({
      rank: normalizeRank(c.actingRank),
      planValue: c.planValue,
    }))

    return {
      recordType: 'pairing',
      data: {
        pairingId: String(p.pairingId),
        pairingDate,
        label: p.label,
        base: p.base,
        fleet: p.fleet,
        durationDays: p.durationDays,
        compositions,
      },
      metadata: { externalId: String(p.pairingId) },
    }
  }

  fromStandard(record: StandardRecord): unknown {
    return record.data
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd connector-server && npx vitest run src/__tests__/unit/f8-transforms.test.ts --reporter=verbose 2>&1 | grep -E "(✓|✗|F8Pairing)" | head -10
```

Expected: all F8PairingTransform tests pass

- [ ] **Step 5: Commit**

```bash
cd connector-server && git add src/transform/f8/pairing.ts src/__tests__/unit/f8-transforms.test.ts
git commit -m "feat(connector/f8): add F8 pairing transform with rank normalization"
```

---

## Task 9: F8 Roster-Flight Transform

**Files:**
- Create: `connector-server/src/transform/f8/roster-flight.ts`
- Modify: `connector-server/src/__tests__/unit/f8-transforms.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `f8-transforms.test.ts`:

```typescript
import { F8RosterFlightTransform } from '../../transform/f8/roster-flight.js'

const sampleRosterFlight = {
  rosterFlightId: 2656138,
  pairingId: 101198,
  fltId: 'F8804',
  depArp: 'YVR',
  arrArp: 'YYC',
  dutyStrUtc: '2026-06-12T17:35:00Z',
  crew: {
    crewId: '535',
    crewName: 'Alistair Camplin',
    actingRank: 'CA',
  },
}

describe('F8RosterFlightTransform', () => {
  const transform = new F8RosterFlightTransform()

  it('maps crew and flight fields to StandardRoster', () => {
    const result = transform.toStandard(sampleRosterFlight)
    expect(result.recordType).toBe('roster')
    expect(result.data.crewCode).toBe('535')
    expect(result.data.flightId).toBe('F8804')
    expect(result.data.depAirport).toBe('YVR')
    expect(result.data.arrAirport).toBe('YYC')
    expect(result.data.role).toBe('CA')
    expect(result.data.pairingId).toBe('101198')
  })

  it('extracts date from dutyStrUtc as rosterDate', () => {
    const result = transform.toStandard(sampleRosterFlight)
    expect(result.data.rosterDate).toBe('2026-06-12')
  })

  it('throws when pairingId is 0 (SIM/DHD — must be filtered out)', () => {
    const simRecord = { ...sampleRosterFlight, pairingId: 0 }
    expect(() => transform.toStandard(simRecord)).toThrow('SIM/DHD record')
  })

  it('normalizes CAP actingRank to CA', () => {
    const record = { ...sampleRosterFlight, crew: { ...sampleRosterFlight.crew, actingRank: 'CAP' } }
    const result = transform.toStandard(record)
    expect(result.data.role).toBe('CA')
  })

  it('throws on invalid input', () => {
    expect(() => transform.toStandard(null)).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd connector-server && npx vitest run src/__tests__/unit/f8-transforms.test.ts 2>&1 | grep "F8Roster\|Cannot find" | head -5
```

- [ ] **Step 3: Implement `f8/roster-flight.ts`**

Create `connector-server/src/transform/f8/roster-flight.ts`:

```typescript
import { TransformPlugin, StandardRecord } from '../base.js'

const normalizeRank = (rank: string): string => {
  if (rank === 'CAP' || rank === 'CP') return 'CA'
  return rank
}

interface F8RosterFlightCrew {
  crewId: string
  crewName?: string
  actingRank?: string
}

interface F8RosterFlight {
  rosterFlightId: number
  pairingId: number
  fltId?: string
  depArp?: string
  arrArp?: string
  dutyStrUtc?: string
  crew: F8RosterFlightCrew
}

export class F8RosterFlightTransform implements TransformPlugin {
  toStandard(raw: unknown): StandardRecord {
    if (!raw || typeof raw !== 'object') {
      throw new Error('F8RosterFlightTransform: invalid input')
    }
    const r = raw as F8RosterFlight
    if (!r.crew?.crewId) {
      throw new Error('F8RosterFlightTransform: missing crew.crewId')
    }

    // pairingId === 0 means SIM/DHD — must not be scheduled
    if (r.pairingId === 0) {
      throw new Error('SIM/DHD record: pairingId=0, skip this record')
    }

    const rosterDate = r.dutyStrUtc?.slice(0, 10) ?? ''

    return {
      recordType: 'roster',
      data: {
        crewCode: String(r.crew.crewId),
        rosterDate,
        dutyType: 'FLT',
        pairingId: String(r.pairingId),
        flightId: r.fltId,
        depTime: r.dutyStrUtc,
        depAirport: r.depArp,
        arrAirport: r.arrArp,
        role: normalizeRank(r.crew.actingRank ?? ''),
      },
      metadata: { externalId: String(r.rosterFlightId) },
    }
  }

  fromStandard(record: StandardRecord): unknown {
    return record.data
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd connector-server && npx vitest run src/__tests__/unit/f8-transforms.test.ts --reporter=verbose 2>&1 | grep -E "(✓|✗|F8Roster)" | head -10
```

Expected: all F8RosterFlightTransform tests pass

- [ ] **Step 5: Run all tests**

```bash
cd connector-server && npx vitest run 2>&1 | tail -10
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
cd connector-server && git add src/transform/f8/roster-flight.ts src/__tests__/unit/f8-transforms.test.ts
git commit -m "feat(connector/f8): add F8 roster-flight transform with SIM/DHD filter"
```

---

## Task 10: Register F8 Transforms

**Files:**
- Create: `connector-server/src/transform/f8/index.ts`

- [ ] **Step 1: Create `f8/index.ts`**

Create `connector-server/src/transform/f8/index.ts`:

```typescript
import { registerTransform } from '../index.js'
import { F8CrewTransform } from './crew.js'
import { F8FlightTransform } from './flight.js'
import { F8PairingTransform } from './pairing.js'
import { F8RosterFlightTransform } from './roster-flight.js'

export const registerF8Transforms = (): void => {
  registerTransform('f8/crew', new F8CrewTransform())
  registerTransform('f8/flight', new F8FlightTransform())
  registerTransform('f8/pairing', new F8PairingTransform())
  registerTransform('f8/roster-flight', new F8RosterFlightTransform())
}
```

- [ ] **Step 2: Verify registration works in test**

Add a small test to `f8-transforms.test.ts` (append at end):

```typescript
import { registerF8Transforms } from '../../transform/f8/index.js'
import { getTransform, listTransforms } from '../../transform/index.js'

describe('registerF8Transforms', () => {
  it('registers all 4 F8 transform plugins', () => {
    registerF8Transforms()
    const transforms = listTransforms()
    expect(transforms).toContain('f8/crew')
    expect(transforms).toContain('f8/flight')
    expect(transforms).toContain('f8/pairing')
    expect(transforms).toContain('f8/roster-flight')
  })

  it('getTransform returns F8CrewTransform for f8/crew', () => {
    registerF8Transforms()
    const t = getTransform('f8/crew')
    expect(t).toBeInstanceOf(F8CrewTransform)
  })
})
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd connector-server && npx vitest run src/__tests__/unit/f8-transforms.test.ts 2>&1 | tail -10
```

Expected: all tests pass

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd connector-server && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd connector-server && git add src/transform/f8/index.ts src/__tests__/unit/f8-transforms.test.ts
git commit -m "feat(connector/f8): register all F8 transform plugins"
```

---

## Task 11: F8 Connector Seed SQL

**Files:**
- Create: `sql/seed/f8/10_connector_f8.sql`

- [ ] **Step 1: Verify migration has been applied to f8 schema**

```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" -c "\dt connector_config" 2>&1
```

If table doesn't exist, apply migration first:

```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" -f connector-server/migrations/001_connector_tables.sql
```

- [ ] **Step 2: Create seed file**

Create `sql/seed/f8/10_connector_f8.sql`:

```sql
-- F8 Connector configurations
-- Pre-requisite: run connector-server/migrations/001_connector_tables.sql in f8 schema
-- Credentials are dev-environment values; replace in production via environment-specific seed override

SET search_path = f8;

INSERT INTO connector_config (
  connector_code, connector_name, direction, protocol, data_domain,
  auth_type, auth_config, endpoint_config,
  schedule_cron, transform_plugin,
  is_enabled, is_deleted, created_by, updated_by
) VALUES
-- 1. Crew (full pull, no date range, poll every 4 hours)
(
  'f8-crew',
  'F8 Crew Full Pull',
  'inbound',
  'poll_inbound',
  'crew',
  'f8_token',
  jsonb_build_object(
    'tokenUrl', 'https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken',
    'clientId', 'ROIS',
    'sign',      'f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c'
  ),
  jsonb_build_object(
    'url',        'https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/crew',
    'method',     'POST',
    'timeout',    60000,
    'retryCount', 3,
    'retryDelay', 2000
  ),
  '0 */4 * * *',
  'f8/crew',
  1, 0, 'system', 'system'
),
-- 2. Flight (next 30 days, poll every hour)
(
  'f8-flight',
  'F8 Flight Schedule Pull',
  'inbound',
  'poll_inbound',
  'flight',
  'f8_token',
  jsonb_build_object(
    'tokenUrl', 'https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken',
    'clientId', 'ROIS',
    'sign',      'f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c'
  ),
  jsonb_build_object(
    'url',          'https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/flight',
    'method',       'POST',
    'timeout',      30000,
    'retryCount',   2,
    'retryDelay',   2000,
    'pollBodyDays', 30
  ),
  '0 * * * *',
  'f8/flight',
  1, 0, 'system', 'system'
),
-- 3. Pairing (next 60 days, poll every 2 hours)
(
  'f8-pairing',
  'F8 Pairing Pull',
  'inbound',
  'poll_inbound',
  'pairing',
  'f8_token',
  jsonb_build_object(
    'tokenUrl', 'https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken',
    'clientId', 'ROIS',
    'sign',      'f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c'
  ),
  jsonb_build_object(
    'url',          'https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/pairing',
    'method',       'POST',
    'timeout',      30000,
    'retryCount',   2,
    'retryDelay',   2000,
    'pollBodyDays', 60
  ),
  '0 */2 * * *',
  'f8/pairing',
  1, 0, 'system', 'system'
),
-- 4. Roster-Flight (next 30 days, poll every hour)
(
  'f8-roster-flight',
  'F8 Roster Flight Pull',
  'inbound',
  'poll_inbound',
  'roster',
  'f8_token',
  jsonb_build_object(
    'tokenUrl', 'https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken',
    'clientId', 'ROIS',
    'sign',      'f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c'
  ),
  jsonb_build_object(
    'url',          'https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out/rosterFlight',
    'method',       'POST',
    'timeout',      30000,
    'retryCount',   2,
    'retryDelay',   2000,
    'pollBodyDays', 30
  ),
  '0 * * * *',
  'f8/roster-flight',
  1, 0, 'system', 'system'
)
ON CONFLICT (connector_code) DO UPDATE SET
  endpoint_config  = EXCLUDED.endpoint_config,
  schedule_cron    = EXCLUDED.schedule_cron,
  transform_plugin = EXCLUDED.transform_plugin,
  updated_by       = EXCLUDED.updated_by,
  updated_at       = now();
```

- [ ] **Step 3: Apply seed to dev database**

```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" -f sql/seed/f8/10_connector_f8.sql
```

Expected output: `INSERT 0 4` or `UPDATE 4` (idempotent)

- [ ] **Step 4: Verify rows inserted**

```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8" -c "SELECT connector_code, data_domain, schedule_cron FROM connector_config ORDER BY id;"
```

Expected: 4 rows (f8-crew, f8-flight, f8-pairing, f8-roster-flight)

- [ ] **Step 5: Commit**

```bash
git add sql/seed/f8/10_connector_f8.sql
git commit -m "feat(connector/f8): add F8 connector config seed for all 4 data domains"
```

---

## Task 12: Final integration check

- [ ] **Step 1: Run full test suite**

```bash
cd connector-server && npx vitest run 2>&1 | tail -20
```

Expected: all tests pass, 0 failures

- [ ] **Step 2: TypeScript full compile check**

```bash
cd connector-server && npx tsc --noEmit 2>&1
```

Expected: no errors

- [ ] **Step 3: Start server in dev mode and verify startup**

```bash
cd connector-server && npm run dev 2>&1 | head -30
```

Expected: server starts on port 3004, logs show `BullMQ queues initialized`, no errors

- [ ] **Step 4: Manual trigger test for f8-crew**

```bash
# Trigger a manual poll for f8-crew
curl -s -X POST http://localhost:3004/api/admin/connectors/f8-crew/trigger \
  -H "Authorization: Bearer <admin-token>" | jq .
```

Expected: `{ code: 200, data: { triggered: true } }`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(connector/f8): final integration wiring for F8 connector"
```

---

## Self-Review: Spec Coverage

| Requirement | Task |
|-------------|------|
| F8 custom token auth (`clientId/timestamp/sign`) | Task 3 |
| Token caching + 30s refresh buffer | Task 3 |
| Token in `AuthorizationToken` header | Task 4 |
| 401/403 → re-auth + retry | Task 4 |
| POST requests with JSON body | Task 4 |
| Date range `{ startDt, endDt }` body for flight/pairing/roster | Tasks 4 + 5 |
| Crew: 60s timeout, 3 retries, 2s delay | Task 4 (via EndpointConfig) + Task 11 (seed config) |
| Rank normalization: CAP/CP → CA | Tasks 6, 8, 9 |
| Rank priority: CA > FO, only effective ranks | Task 6 |
| RHS cert: isValid=true AND not expired | Task 6 |
| pairingId=0 → skip SIM/DHD | Task 9 |
| New `pairing` data domain + queue | Tasks 1, 5 |
| Roster inbound queue | Task 5 |
| BullMQ poll scheduling worker | Task 5 |
| F8 connector configs in DB | Task 11 |
| All existing tests still pass | Tasks 4, 5 |
