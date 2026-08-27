import { describe, it, expect, beforeEach } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import jwt from 'jsonwebtoken'
import permissionPlugin, { PERMISSION_CODES } from '../../plugins/permission.js'
import type { PermissionContext } from '../../types/permission.js'

const JWT_SECRET = 'test-manage-secret-at-least-32-characters'
const emptyScope = { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }

const contexts: Record<string, PermissionContext> = {
  admin: { menus: ['SYSTEM_SCHEDULER'], ctrls: { SYSTEM_SCHEDULER: ['BTN_ENABLE'] }, dataScope: { ...emptyScope }, permVersion: 1 },
  viewer: { menus: ['LIVE_ROSTER'], ctrls: {}, dataScope: { ...emptyScope }, permVersion: 1 },
}

const sign = (userCode: string, isAdmin: number) =>
  jwt.sign({ userCode, userName: userCode, schema: 'f8', isAdmin, tokenVersion: 1, permVersion: 1 }, JWT_SECRET, { expiresIn: '1h' })

async function buildApp(): Promise<FastifyInstance> {
  const ruleResults = [
    [{ apiUris: '/api/admin/scheduler*', menuCode: 'SYSTEM_SCHEDULER' }],
    [{ apiUris: '/api/admin/scheduler/*/enable', menuCode: 'SYSTEM_SCHEDULER', ctlCode: 'BTN_ENABLE' }],
  ]
  let call = 0
  const db = { select: () => ({ from: () => ({ where: () => Promise.resolve(ruleResults[call++] ?? []) }) }) }
  const redis = { get: (key: string) => Promise.resolve(JSON.stringify(contexts[key.split(':').pop() ?? ''] ?? null)) }

  const app = Fastify({ logger: false })
  ;(app as unknown as { decorate: (n: string, v: unknown) => void }).decorate('db', db)
  ;(app as unknown as { decorate: (n: string, v: unknown) => void }).decorate('redis', redis)
  app.addHook('onRequest', async (req) => {
    const h = req.headers.authorization
    if (h?.startsWith('Bearer ')) {
      ;(req as unknown as { authUser?: unknown }).authUser = jwt.verify(h.slice(7), JWT_SECRET)
    }
  })
  await app.register(permissionPlugin)
  app.all('/api/*', async (_req, reply) => reply.send({ ok: true }))
  return app
}

describe('permission plugin — management API gates', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await buildApp()
    return async () => app.close()
  })
  const auth = (t: string) => ({ authorization: `Bearer ${t}` })

  it('已登记管理接口 + 有菜单 → 放行', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/scheduler/jobs', headers: auth(sign('admin', 0)) })
    expect(res.statusCode).toBe(200)
  })

  it('已登记管理接口 + 有 ctrl → 放行', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/scheduler/jobs/x/enable', headers: auth(sign('admin', 0)) })
    expect(res.statusCode).toBe(200)
  })

  it('已登记管理接口但无菜单 → 403 PERM_MENU', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/scheduler/jobs', headers: auth(sign('viewer', 0)) })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe(PERMISSION_CODES.MENU)
  })

  it('未登记管理接口 → 403 PERM_MANAGE（兜底）', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/unknown-tool/run', headers: auth(sign('viewer', 0)) })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe(PERMISSION_CODES.MANAGE)
  })

  it('未登记管理接口 + is_admin → 放行', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/unknown-tool/run', headers: auth(sign('root', 1)) })
    expect(res.statusCode).toBe(200)
  })

  it('非管理路径不受兜底影响（fail-open）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/crew/1', headers: auth(sign('viewer', 0)) })
    expect(res.statusCode).toBe(200)
  })
})
