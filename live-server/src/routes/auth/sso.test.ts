import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import jwt from 'jsonwebtoken'

const h = vi.hoisted(() => {
  const acsResult: { profile: unknown; loggedOut: boolean } = { profile: null, loggedOut: false }
  return {
    authorizeUrl: 'https://login.microsoftonline.com/t/saml2?SAMLRequest=abc',
    profile: { nameID: '1001', email: 'ryan@flyflair.com', employeeId: '1001' },
    user: {
      userCode: 'Ryan', userName: 'Ryan', schema: 'f8', isAdmin: 0, tokenVersion: 0,
      passwordHash: 'x', status: 0, passwordAccess: 'N', portalAccess: 'Y',
      effDt: new Date(0), expDt: null, email: 'ryan@flyflair.com',
    },
    acsResult,
    /** 最近一次 drizzle sql 查询里捕获的字符串值（lower(email)=lower($1) 的 $1） */
    lastQueriedValue: undefined as string | undefined,
  }
})

// 用 drizzle `sql`/`eq` proxy 捕获 where 条件里的插值，供 db mock 模拟 lower() 比较
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  const originalSql = actual.sql as unknown as (strings: TemplateStringsArray, ...values: unknown[]) => unknown
  const originalEq = actual.eq
  const capture = (value: unknown) => {
    if (typeof value === 'string') h.lastQueriedValue = value
    return value
  }
  return {
    ...actual,
    eq: (...args: Parameters<typeof originalEq>) => {
      capture(args[1])
      return originalEq(...args)
    },
    sql: new Proxy(originalSql, {
      apply(target, thisArg, args) {
        const values = args.slice(1)
        const strVal = values.find((v) => typeof v === 'string')
        if (strVal !== undefined) h.lastQueriedValue = strVal as string
        return Reflect.apply(target, thisArg, args)
      },
    }),
  }
})

vi.mock('../../../../packages/saml/dist/index.js', () => ({
  createSamlSp: vi.fn(() => ({})),
  getAuthorizeUrl: vi.fn(async () => h.authorizeUrl),
  validatePostResponse: vi.fn(async () => h.acsResult),
  generateMetadata: vi.fn(() => '<md:EntityDescriptor entityID="urn:rois:gantt-sso"/>'),
  extractIdentity: vi.fn((profile) => ({ email: profile.email, userCode: profile.employeeId })),
}))

vi.mock('../../config/index.js', () => ({
  env: {
    JWT_SECRET: 'test-secret', LIVE_SCHEMA: 'f8',
    SSO_ENABLED: true, SSO_ENTITY_ID: 'urn:rois:gantt-sso',
    SSO_CALLBACK_URL: 'https://host/live/api/auth/sso/acs',
    SSO_IDP_ENTRY_POINT: 'https://login.microsoftonline.com/t/saml2',
    SSO_IDP_CERT: 'cert', SSO_REDIRECT_BASE: 'https://host/altair',
    SSO_EMAIL_ATTRS: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    SSO_USERCODE_ATTRS: 'employeeId',
  },
}))

const perm = vi.hoisted(() => ({
  ctx: { menus: ['LIVE'], ctrls: { LIVE: ['LIVE_SAVE'] }, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }, permVersion: 1 },
  resolvePermissionContext: vi.fn(async () => perm.ctx),
  storePermissionContext: vi.fn(async () => undefined),
  getPermissionVersion: vi.fn(async () => 1),
}))
vi.mock('../../services/permission/permission-service.js', () => ({
  permissionKey: (schema: string, userCode: string) => `perm:${schema}:${userCode}`,
  resolvePermissionContext: perm.resolvePermissionContext,
  storePermissionContext: perm.storePermissionContext,
  getPermissionVersion: perm.getPermissionVersion,
}))

import { createSamlSp, getAuthorizeUrl, validatePostResponse, extractIdentity } from '../../../../packages/saml/dist/index.js'
import ssoRoutes from './sso.js'

/**
 * db mock 模拟 `lower(email) = lower($value)` / `user_code = $value` 的查询语义：
 * 仅当最近捕获的查询值（大小写不敏感地）等于 h.user.email 或精确等于 userCode 时命中。
 * 这样「大小写不敏感」测试真的验证了路由用了 email 去查（而不是假通过）。
 */
const buildApp = async () => {
  const app = Fastify()
  await app.register(import('@fastify/formbody'))
  app.decorate('db', {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const v = h.lastQueriedValue
            if (v && h.user.email.toLowerCase() === v.toLowerCase()) return [h.user]
            if (v && h.user.userCode === v) return [h.user]
            return []
          },
        }),
      }),
    }),
  } as never)
  app.decorate('redis', {} as never)
  await app.register(ssoRoutes, { prefix: '/api/auth' })
  return app
}

beforeEach(() => {
  h.acsResult = { profile: null, loggedOut: false }
  h.lastQueriedValue = undefined
  vi.mocked(validatePostResponse).mockReset()
  vi.mocked(extractIdentity).mockReset()
})

describe('GET /api/auth/sso/login', () => {
  it('302 到 Azure entryPoint', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/auth/sso/login' })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('https://login.microsoftonline.com')
  })
})

describe('GET /api/auth/sso/metadata', () => {
  it('返回 SP metadata XML', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/auth/sso/metadata' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/xml')
    expect(res.body).toContain('urn:rois:gantt-sso')
  })
})

describe('POST /api/auth/sso/acs', () => {
  it('验签成功 → 匹配用户 → 302 带 token', async () => {
    h.acsResult = { profile: h.profile, loggedOut: false }
    vi.mocked(validatePostResponse).mockResolvedValue(h.acsResult as never)
    vi.mocked(extractIdentity).mockReturnValue({ email: 'ryan@flyflair.com', userCode: '1001' })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST', url: '/api/auth/sso/acs',
      payload: 'SAMLResponse=abc', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    expect(res.statusCode).toBe(302)
    const loc = res.headers.location as string
    expect(loc).toMatch(/^https:\/\/host\/altair\?token=/)
    const token = new URL(loc).searchParams.get('token')!
    const decoded = jwt.verify(token, 'test-secret') as { authMode: string; userCode: string }
    expect(decoded.authMode).toBe('sso')
    expect(decoded.userCode).toBe('Ryan')
  })

  it('email 不区分大小写匹配（路由用 email 查、SQL lower 比较）', async () => {
    h.acsResult = { profile: { ...h.profile, email: 'RYAN@FLYFLAIR.COM' }, loggedOut: false }
    vi.mocked(validatePostResponse).mockResolvedValue(h.acsResult as never)
    vi.mocked(extractIdentity).mockReturnValue({ email: 'RYAN@FLYFLAIR.COM', userCode: undefined })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST', url: '/api/auth/sso/acs',
      payload: 'SAMLResponse=abc', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    // db mock 按 lower() 命中 h.user → 登录成功
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('token=')
  })

  it('匹配不到用户 → 302 sso_error=user_not_found', async () => {
    h.acsResult = { profile: { ...h.profile, email: 'nobody@flyflair.com' }, loggedOut: false }
    vi.mocked(validatePostResponse).mockResolvedValue(h.acsResult as never)
    vi.mocked(extractIdentity).mockReturnValue({ email: 'nobody@flyflair.com', userCode: undefined })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST', url: '/api/auth/sso/acs',
      payload: 'SAMLResponse=abc', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('sso_error=user_not_found')
  })
})

describe('POST /api/auth/sso/callback', () => {
  it('有效 sso token → 返回会话（含 menus）', async () => {
    const app = await buildApp()
    const token = jwt.sign(
      { userCode: 'Ryan', userName: 'Ryan', schema: 'f8', isAdmin: 0, tokenVersion: 0, authMode: 'sso' },
      'test-secret',
    )
    const res = await app.inject({
      method: 'POST', url: '/api/auth/sso/callback', payload: { token },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data.token).toBe(token)
    expect(body.data.userCode).toBe('Ryan')
    expect(body.data.menus).toEqual(['LIVE'])
  })

  it('authMode 非 sso 的 token → 401', async () => {
    const app = await buildApp()
    const token = jwt.sign(
      { userCode: 'Ryan', userName: 'Ryan', schema: 'f8', isAdmin: 0, tokenVersion: 0, authMode: 'password' },
      'test-secret',
    )
    const res = await app.inject({ method: 'POST', url: '/api/auth/sso/callback', payload: { token } })
    expect(res.statusCode).toBe(401)
  })
})

describe('SAML SP 实例复用（InResponseTo request-ID 缓存可见性）', () => {
  it('login 与 acs 复用同一 SP 实例，createSamlSp 全进程只调一次', async () => {
    const app = await buildApp()
    // login：首次触发懒加载单例
    await app.inject({ method: 'GET', url: '/api/auth/sso/login' })
    // acs：复用同一实例
    h.acsResult = { profile: h.profile, loggedOut: false }
    vi.mocked(validatePostResponse).mockResolvedValue(h.acsResult as never)
    vi.mocked(extractIdentity).mockReturnValue({ email: 'ryan@flyflair.com', userCode: '1001' })
    await app.inject({
      method: 'POST', url: '/api/auth/sso/acs',
      payload: 'SAMLResponse=abc', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    // 单例：createSamlSp 只被调用一次（修复前每个 handler 各 new 一次 → 次数 ≥ 3）
    expect(vi.mocked(createSamlSp)).toHaveBeenCalledTimes(1)
    // 且 getAuthorizeUrl 与 validatePostResponse 收到同一个实例
    const sp = vi.mocked(createSamlSp).mock.results[0].value
    expect(vi.mocked(getAuthorizeUrl)).toHaveBeenCalledWith(sp)
    expect(vi.mocked(validatePostResponse)).toHaveBeenCalledWith(sp, 'abc')
  })
})
