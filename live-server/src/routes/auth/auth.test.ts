import { describe, it, expect, beforeEach, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import Fastify from 'fastify'
import jwt from 'jsonwebtoken'

// Shared holder so the hoisted drizzle mock can record which user_code was queried.
const h = vi.hoisted(() => ({
  queriedCode: undefined as string | undefined,
  logoutUpdates: 0,
}))

// Spy on drizzle `sql` tagged template to capture the value the route looks up by
// (the route uses `sql\`col = ${normalized}\``, case-SENSITIVE), while keeping the
// real implementation intact for everything else.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  const originalSql = actual.sql as unknown as (strings: TemplateStringsArray, ...values: unknown[]) => unknown
  const originalEq = actual.eq
  return {
    ...actual,
    eq: (...args: Parameters<typeof originalEq>) => {
      const value = args[1]
      if (typeof value === 'string') h.queriedCode = value
      return originalEq(...args)
    },
    sql: new Proxy(originalSql, {
      apply(target, thisArg, args) {
        // args[0] is TemplateStringsArray, args[1..] are interpolated values
        // For `lower(col) = ${normalized}`, the second value (index 1) is the string
        const values = args.slice(1)
        const strVal = values.find((v) => typeof v === 'string')
        if (strVal !== undefined) h.queriedCode = strVal as string
        return Reflect.apply(target, thisArg, args)
      },
    }),
  }
})

// Avoid loading real env validation (JWT_SECRET etc.).
vi.mock('../../config/index.js', () => ({ env: { JWT_SECRET: 'test-secret', LIVE_SCHEMA: 'f8' } }))

// permission-service 的 DB 解析逻辑另有单测；此处 mock 掉，隔离 auth 路由测试
const perm = vi.hoisted(() => ({
  ctx: {
    menus: ['LIVE', 'LIVE_ROSTER'],
    ctrls: { LIVE_ROSTER: ['LIVE_SAVE'] },
    dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
    permVersion: 1,
  },
  resolvePermissionContext: vi.fn(),
  storePermissionContext: vi.fn(),
  getPermissionVersion: vi.fn(),
  buildAdminContext: vi.fn(),
  getOrResolvePermissionContext: vi.fn(),
}))
vi.mock('../../services/permission/permission-service.js', () => ({
  permissionKey: (schema: string, userCode: string) => `perm:${schema}:${userCode}`,
  resolvePermissionContext: perm.resolvePermissionContext,
  storePermissionContext: perm.storePermissionContext,
  getPermissionVersion: perm.getPermissionVersion,
  buildAdminContext: perm.buildAdminContext,
  getOrResolvePermissionContext: perm.getOrResolvePermissionContext,
}))

import authRoutes, { normalizeUserCode } from './auth.js'

// 'Our2027' bcrypt hash (matches sql/seed/06-profile.sql).
const STORED_HASH = bcrypt.hashSync('Our2027', 10)

const createStoredUser = (overrides: Record<string, unknown> = {}) => ({
  userCode: 'Taylor',
  userName: 'Taylor',
  passwordHash: STORED_HASH,
  isAdmin: 0,
  status: 0,
  passwordAccess: 'Y',
  portalAccess: 'Y',
  effDt: new Date(Date.now() - 60_000),
  expDt: null,
  tokenVersion: 2,
  ...overrides,
})

// A case-SENSITIVE store keyed by the EXACT code 'Taylor'. A query for 'taylor'
// or 'TAYLOR' must miss and return [] — accounts distinguish case.
let storedUser = createStoredUser()

const mockDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => (h.queriedCode === 'Taylor' ? [storedUser] : []),
      }),
    }),
  }),
  update: () => ({
    set: (values: Record<string, unknown>) => ({
      where: async () => {
        if (values.tokenVersion !== undefined) {
          h.logoutUpdates += 1
        }
      },
    }),
  }),
}

const redis = {
  get: vi.fn(async () => null),
  set: vi.fn(async () => 'OK'),
  incr: vi.fn(async () => 1),
  del: vi.fn(async () => 1),
}

const buildApp = async () => {
  const app = Fastify()
  app.decorate('db', mockDb as never)
  app.decorate('redis', redis as never)
  await app.register(authRoutes)
  return app
}

const login = (app: Awaited<ReturnType<typeof buildApp>>, userCode: string, password: string) =>
  app.inject({ method: 'POST', url: '/login', payload: { userCode, password } })

const makeToken = (tokenVersion = 2) =>
  jwt.sign({
    userCode: 'Taylor',
    userName: 'Taylor',
    schema: 'f8',
    isAdmin: 0,
    tokenVersion,
  }, 'test-secret', { expiresIn: '1h' })

describe('normalizeUserCode', () => {
  it('trims surrounding whitespace and preserves case', () => {
    expect(normalizeUserCode('  Taylor ')).toBe('Taylor')
    expect(normalizeUserCode('Taylor')).toBe('Taylor')
    expect(normalizeUserCode('TAYLOR')).toBe('TAYLOR')
  })
})

describe('POST /login — case-SENSITIVE user code', () => {
  beforeEach(() => {
    h.queriedCode = undefined
    h.logoutUpdates = 0
    storedUser = createStoredUser()
    perm.resolvePermissionContext.mockImplementation(async () => ({ ...perm.ctx }))
    perm.storePermissionContext.mockResolvedValue(undefined)
    perm.getPermissionVersion.mockResolvedValue(1)
    perm.buildAdminContext.mockImplementation(async () => ({ ...perm.ctx }))
    perm.getOrResolvePermissionContext.mockImplementation(async () => ({ ...perm.ctx }))
  })

  // The user code is stored as the exact 'Taylor'. Only the exact case (after a
  // whitespace trim) logs in successfully with the correct password.
  for (const input of ['Taylor', '  Taylor  ']) {
    it(`accepts "${input}" (exact case) with the correct password`, async () => {
      const app = await buildApp()
      const res = await login(app, input, 'Our2027')
      const body = res.json()

      expect(res.statusCode).toBe(200)
      expect(body.code).toBe(200)
      expect(body.data.userCode).toBe('Taylor')
      expect(body.data.userName).toBe('Taylor')
      expect(typeof body.data.token).toBe('string')
      expect(body.data.schema).toBe('f8')
      expect(h.queriedCode).toBe('Taylor') // proves the lookup preserved case
      expect(jwt.verify(body.data.token, 'test-secret')).toMatchObject({
        schema: 'f8',
        tokenVersion: 2,
        permVersion: 1,
      })
      // 登录响应带权限上下文（menus/ctrls/dataScope）
      expect(body.data.menus).toEqual(perm.ctx.menus)
      expect(body.data.ctrls).toEqual(perm.ctx.ctrls)
      expect(body.data.dataScope).toEqual(perm.ctx.dataScope)
    })
  }

  // A different casing is a DIFFERENT account → not found (e.g. 'Ryan' vs 'ryan').
  for (const input of ['taylor', 'TAYLOR']) {
    it(`rejects "${input}" (wrong case) without revealing whether the user exists`, async () => {
      const app = await buildApp()
      const res = await login(app, input, 'Our2027')
      const body = res.json()
      expect(res.statusCode).toBe(401)
      expect(body.message).toBe('Invalid user code or password.')
    })
  }

  it('rejects a wrong password without revealing whether the user exists', async () => {
    const app = await buildApp()
    const res = await login(app, 'Taylor', 'wrong-password')
    const body = res.json()
    expect(res.statusCode).toBe(401)
    expect(body.data).toBeNull()
    expect(body.message).toBe('Invalid user code or password.')
  })

  it('rejects an unknown user code with the same generic login message', async () => {
    const app = await buildApp()
    const res = await login(app, 'Nobody', 'Our2027')
    const body = res.json()
    expect(res.statusCode).toBe(401)
    expect(body.data).toBeNull()
    expect(body.message).toBe('Invalid user code or password.')
  })

  it('rejects a valid password when the account cannot access the portal', async () => {
    storedUser = createStoredUser({ portalAccess: 'N' })
    const app = await buildApp()
    const res = await login(app, 'Taylor', 'Our2027')
    const body = res.json()

    expect(res.statusCode).toBe(403)
    expect(body.message).toBe('This account cannot access ROIS.')
  })

  it('rejects stale token versions on /me', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: {
        authorization: `Bearer ${makeToken(1)}`,
      },
    })
    const body = res.json()

    expect(res.statusCode).toBe(401)
    expect(body.message).toBe('Token expired or invalid. Please login again.')
  })

  it('returns user + permission context on /me', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: {
        authorization: `Bearer ${makeToken(2)}`,
      },
    })
    const body = res.json()

    expect(res.statusCode).toBe(200)
    expect(body.data.user).toMatchObject({ userCode: 'Taylor', schema: 'f8', isAdmin: 0 })
    expect(body.data.menus).toEqual(perm.ctx.menus)
    expect(body.data.ctrls).toEqual(perm.ctx.ctrls)
    expect(body.data.dataScope).toEqual(perm.ctx.dataScope)
  })

  it('increments token version on DELETE /session', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'DELETE',
      url: '/session',
      headers: {
        authorization: `Bearer ${makeToken(2)}`,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual({ loggedOut: true })
    expect(h.logoutUpdates).toBe(1)
  })
})
