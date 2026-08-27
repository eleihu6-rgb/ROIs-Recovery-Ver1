import { describe, it, expect, beforeEach } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import jwt from 'jsonwebtoken'
import permissionPlugin, { PERMISSION_CODES } from '../../plugins/permission.js'
import type { PermissionContext } from '../../types/permission.js'

const JWT_SECRET = 'test-permission-secret-at-least-32-characters'

const emptyScope = { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }
const contexts: Record<string, PermissionContext> = {
  alice: { menus: ['DATA_CREW_MASTER'], ctrls: { LIVE_ROSTER: ['LIVE_SAVE'] }, dataScope: { ...emptyScope }, permVersion: 1 },
  bob: { menus: [], ctrls: {}, dataScope: { ...emptyScope }, permVersion: 1 },
}

const sign = (userCode: string, isAdmin: number, permVersion?: number): string =>
  jwt.sign({ userCode, userName: userCode, schema: 'f8', isAdmin, tokenVersion: 1, ...(permVersion !== undefined ? { permVersion } : {}) }, JWT_SECRET, { expiresIn: '1h' })

async function buildApp(): Promise<FastifyInstance> {
  // loadApiRules 按序调用两次 select：先菜单后 ctrl
  const ruleResults = [
    [{ apiUris: '/api/crew*', menuCode: 'DATA_CREW_MASTER' }],
    [{ apiUris: '/api/roster/assign', menuCode: 'LIVE_ROSTER', ctlCode: 'LIVE_SAVE' }],
  ]
  let call = 0
  const db = {
    select: () => ({ from: () => ({ where: () => Promise.resolve(ruleResults[call++] ?? []) }) }),
  }
  const redis = {
    get: (key: string) => Promise.resolve(JSON.stringify(contexts[key.split(':').pop() ?? ''] ?? null)),
  }

  const app = Fastify({ logger: false })
  ;(app as unknown as { decorate: (n: string, v: unknown) => void }).decorate('db', db)
  ;(app as unknown as { decorate: (n: string, v: unknown) => void }).decorate('redis', redis)

  // stub auth：解码 JWT 设置 authUser（等价于 auth 插件）
  app.addHook('onRequest', async (req, _reply) => {
    const h = req.headers.authorization
    if (h?.startsWith('Bearer ')) {
      ;(req as unknown as { authUser?: unknown }).authUser = jwt.verify(h.slice(7), JWT_SECRET)
    }
  })

  await app.register(permissionPlugin)

  // 回退路由：权限判定通过后由它返回 200（测试不注册真实业务路由）
  app.all('/api/*', async (_req, reply) => reply.send({ ok: true }))
  return app
}

describe('permission plugin', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await buildApp()
    return async () => app.close()
  })

  const auth = (token: string) => ({ authorization: `Bearer ${token}` })

  it('菜单读接口命中且有菜单 → 放行', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/crew/123', headers: auth(sign('alice', 0, 1)) })
    expect(res.statusCode).toBe(200)
  })

  it('菜单读接口命中但无菜单 → 403 PERM_MENU', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/crew/123', headers: auth(sign('bob', 0, 1)) })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe(PERMISSION_CODES.MENU)
  })

  it('按钮接口命中且有 ctrl → 放行', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/roster/assign', headers: auth(sign('alice', 0, 1)) })
    expect(res.statusCode).toBe(200)
  })

  it('按钮接口命中但无 ctrl → 403 PERM_CTRL', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/roster/assign', headers: auth(sign('bob', 0, 1)) })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe(PERMISSION_CODES.CTRL)
  })

  it('未映射接口放行（fail-open）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/pairing', headers: auth(sign('bob', 0, 1)) })
    expect(res.statusCode).toBe(200)
  })

  it('is_admin 短路放行', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/crew/123', headers: auth(sign('root', 1)) })
    expect(res.statusCode).toBe(200)
  })

  it('permVersion 不一致 → 403 SESSION_STALE', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/crew/123', headers: auth(sign('alice', 0, 999)) })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe(PERMISSION_CODES.STALE)
  })

  it('无 Authorization → 跳过（由 auth 插件管）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/crew/123' })
    expect(res.statusCode).toBe(200)
  })
})
