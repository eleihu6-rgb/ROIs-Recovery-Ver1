import { describe, it, expect, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'

const perm = vi.hoisted(() => ({
  getOrResolvePermissionContext: vi.fn(),
  buildAdminContext: vi.fn(),
}))
vi.mock('../../../services/permission/permission-service.js', () => ({
  getOrResolvePermissionContext: perm.getOrResolvePermissionContext,
  buildAdminContext: perm.buildAdminContext,
  permissionKey: (s: string, u: string) => `perm:${s}:${u}`,
}))

import authMenusRoutes from '../../../routes/auth/menus.js'

const menuRows = [
  { id: 1, menuCode: 'ROOT', menuName: 'Root', parentMenuCode: '', factoryName: '', systemType: 'S', idx: 0 },
  { id: 2, menuCode: 'LIVE', menuName: 'Live', parentMenuCode: 'ROOT', factoryName: '', systemType: 'S', idx: 2 },
  { id: 3, menuCode: 'LIVE_ROSTER', menuName: 'Roster', parentMenuCode: 'LIVE', factoryName: 'RosterView', systemType: 'S', idx: 1 },
  { id: 4, menuCode: 'SYSTEM', menuName: 'System', parentMenuCode: 'ROOT', factoryName: '', systemType: 'S', idx: 6 },
]
const ctrlRows = [
  { menuCode: 'LIVE_ROSTER', ctlCode: 'LIVE_SAVE' },
  { menuCode: 'LIVE_ROSTER', ctlCode: 'LIVE_DELETE' },
]

const emptyScope = { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }

async function buildApp(): Promise<FastifyInstance> {
  const results = [menuRows, ctrlRows]
  let call = 0
  const db = {
    select: () => ({
      from: () => {
        const rows = results[call++] ?? []
        const p = Promise.resolve(rows) as Promise<unknown> & { where?: () => Promise<unknown>; orderBy?: () => Promise<unknown> }
        p.where = () => p
        p.orderBy = () => p
        return p
      },
    }),
  }
  const app = Fastify({ logger: false })
  ;(app as unknown as { decorate: (n: string, v: unknown) => void }).decorate('db', db)
  ;(app as unknown as { decorate: (n: string, v: unknown) => void }).decorate('redis', { get: vi.fn(async () => null) })
  app.addHook('onRequest', async (req) => {
    ;(req as unknown as { authUser?: unknown }).authUser = { userCode: 'u', userName: 'u', schema: 'f8', isAdmin: 0, tokenVersion: 1, permVersion: 1 }
  })
  await app.register(authMenusRoutes, { prefix: '/api/auth' })
  return app
}

describe('GET /api/auth/menus', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await buildApp()
    return async () => app.close()
  })

  it('非 admin 按权限过滤 hasAccess + 附带按钮', async () => {
    perm.getOrResolvePermissionContext.mockResolvedValue({ menus: ['ROOT', 'LIVE', 'LIVE_ROSTER'], ctrls: { LIVE_ROSTER: ['LIVE_SAVE'] }, dataScope: { ...emptyScope }, permVersion: 1 })
    const res = await app.inject({ method: 'GET', url: '/api/auth/menus' })
    const nodes = res.json().data.nodes as { menuCode: string; hasAccess: boolean; ctrls: string[] }[]
    expect(res.statusCode).toBe(200)
    expect(nodes.find((n) => n.menuCode === 'LIVE_ROSTER')?.hasAccess).toBe(true)
    expect(nodes.find((n) => n.menuCode === 'LIVE_ROSTER')?.ctrls).toEqual(['LIVE_SAVE'])
    expect(nodes.find((n) => n.menuCode === 'SYSTEM')?.hasAccess).toBe(false)
  })

  it('未授权请求 → 401', async () => {
    const app2 = Fastify({ logger: false })
    ;(app2 as unknown as { decorate: (n: string, v: unknown) => void }).decorate('db', {})
    await app2.register(authMenusRoutes, { prefix: '/api/auth' })
    const res = await app2.inject({ method: 'GET', url: '/api/auth/menus' })
    expect(res.statusCode).toBe(401)
    await app2.close()
  })
})
