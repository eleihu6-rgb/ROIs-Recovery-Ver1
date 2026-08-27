import { describe, it, expect, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import jwt from 'jsonwebtoken'

const JWT_SECRET = 'test-scope-secret-at-least-32-characters'

// mock fleetService（返回全量机队）与 permission-service（返回指定 dataScope）
vi.mock('../../../services/base/fleet-service.js', () => ({
  fleetService: {
    list: vi.fn(async () => [
      { id: 1, fleet: 'B737', description: 'Boeing 737' },
      { id: 2, fleet: 'A320', description: 'Airbus 320' },
      { id: 3, fleet: 'B787', description: 'Boeing 787' },
    ]),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

const perm = vi.hoisted(() => ({
  scope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: ['B737'] },
  getOrResolvePermissionContext: vi.fn(),
}))
vi.mock('../../../services/permission/permission-service.js', () => ({
  permissionKey: (s: string, u: string) => `perm:${s}:${u}`,
  getOrResolvePermissionContext: perm.getOrResolvePermissionContext,
  loadPermissionContext: vi.fn(async () => null),
  storePermissionContext: vi.fn(async () => undefined),
  resolvePermissionContext: vi.fn(async () => ({ menus: [], ctrls: {}, dataScope: { ...perm.scope }, permVersion: 1 })),
}))

import fleetRoutes from '../../../routes/base/fleet.js'

const sign = (userCode: string, isAdmin: number) =>
  jwt.sign({ userCode, userName: userCode, schema: 'f8', isAdmin, tokenVersion: 1, permVersion: 1 }, JWT_SECRET, { expiresIn: '1h' })

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  ;(app as unknown as { decorate: (n: string, v: unknown) => void }).decorate('db', {})
  ;(app as unknown as { decorate: (n: string, v: unknown) => void }).decorate('redis', { get: vi.fn(async () => null), set: vi.fn() })
  app.addHook('onRequest', async (req) => {
    const h = req.headers.authorization
    if (h?.startsWith('Bearer ')) {
      ;(req as unknown as { authUser?: unknown }).authUser = jwt.verify(h.slice(7), JWT_SECRET)
    }
  })
  await app.register(fleetRoutes, { prefix: '/api/fleet' })
  return app
}

describe('option endpoint dataScope narrowing (GET /api/fleet)', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    perm.getOrResolvePermissionContext.mockImplementation(async () => ({ menus: [], ctrls: {}, dataScope: { ...perm.scope }, permVersion: 1 }))
    app = await buildApp()
    return async () => app.close()
  })

  it('有 FLEET 白名单 → 只返回授权机队', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/fleet', headers: { authorization: `Bearer ${sign('planner', 0)}` } })
    const body = res.json()
    expect(res.statusCode).toBe(200)
    expect(body.data.map((f: { fleet: string }) => f.fleet)).toEqual(['B737'])
  })

  it('is_admin → 返回全量（scope 为空不限）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/fleet', headers: { authorization: `Bearer ${sign('root', 1)}` } })
    const body = res.json()
    expect(res.statusCode).toBe(200)
    expect(body.data).toHaveLength(3)
  })

  it('未配置 FLEET 维度 → 全量', async () => {
    perm.getOrResolvePermissionContext.mockImplementation(async () => ({ menus: [], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }, permVersion: 1 }))
    const res = await app.inject({ method: 'GET', url: '/api/fleet', headers: { authorization: `Bearer ${sign('planner', 0)}` } })
    const body = res.json()
    expect(body.data).toHaveLength(3)
  })

  it('无 Authorization → 不限定（未登录按全量）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/fleet' })
    const body = res.json()
    expect(res.statusCode).toBe(200)
    expect(body.data).toHaveLength(3)
  })
})
