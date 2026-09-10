import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { CostLibraryError } from '../../services/cost/cost-library-service.js'
import type { AuthPayload } from '../../plugins/auth.js'

const service = vi.hoisted(() => ({
  catalog: vi.fn(),
  revisions: vi.fn(),
  copyInstance: vi.fn(),
  updateInstance: vi.fn(),
  deleteInstance: vi.fn(),
  addRevision: vi.fn(),
  createSet: vi.fn(),
  updateSet: vi.fn(),
  setMembers: vi.fn(),
  copySet: vi.fn(),
  deleteSet: vi.fn(),
  calculate: vi.fn(),
}))

const emptyDataScope = {
  FILIALE: [],
  DIVISION: [],
  CREW_DEPARTMENT: [],
  RANK: [],
  FLEET: [],
}

vi.mock('../../utils/menu-access.js', () => ({
  requireMenuAccess: vi.fn(async () => true),
}))

vi.mock('../../services/permission/permission-service.js', () => ({
  getOrResolvePermissionContext: vi.fn(async () => ({
    menus: ['LEGALITY_RULE_SETS'],
    ctrls: { LEGALITY_RULE_SETS: [] },
    dataScope: emptyDataScope,
    permVersion: 1,
  })),
}))

vi.mock('../../services/cost/cost-library-service.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/cost/cost-library-service.js')>(
    '../../services/cost/cost-library-service.js',
  )
  return {
    ...actual,
    CostLibraryService: vi.fn(() => service),
  }
})

const buildApp = async (authUser?: AuthPayload): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false })
  ;(app as unknown as { decorate: (name: string, value: unknown) => void }).decorate('pgPool', {})
  ;(app as unknown as { decorate: (name: string, value: unknown) => void }).decorate('db', {})
  ;(app as unknown as { decorate: (name: string, value: unknown) => void }).decorate('redis', {})
  app.addHook('onRequest', async (request) => {
    if (authUser) {
      ;(request as typeof request & { authUser: typeof authUser }).authUser = authUser
    }
  })
  const module = await import('./cost-library.js')
  const costLibraryRoutes = module.default as unknown as FastifyPluginAsync
  await app.register(costLibraryRoutes)
  return app
}

const admin: AuthPayload = { userCode: 'admin', userName: 'Admin', schema: 'f8_sit_live', isAdmin: 1, tokenVersion: 1 }
const planner: AuthPayload = { userCode: 'planner', userName: 'Planner', schema: 'f8_sit_live', isAdmin: 0, tokenVersion: 1 }

describe('cost library routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires authentication for all cost routes', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/catalog' })

    expect(res.statusCode).toBe(401)
    expect(res.json().message).toBe('Authentication required')
    expect(service.catalog).not.toHaveBeenCalled()
  })

  it('allows authenticated catalog reads through the Legality menu permission', async () => {
    service.catalog.mockResolvedValue({ types: [], instances: [], sets: [] })
    const app = await buildApp(planner)
    const res = await app.inject({ method: 'GET', url: '/catalog' })

    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual({ types: [], instances: [], sets: [] })
    expect(service.catalog).toHaveBeenCalledOnce()
  })

  it('requires control permission for non-admin mutations', async () => {
    const app = await buildApp(planner)
    const res = await app.inject({ method: 'POST', url: '/instances/1/copy' })

    expect(res.statusCode).toBe(403)
    expect(res.json().message).toBe('Access denied: missing control permission')
    expect(service.copyInstance).not.toHaveBeenCalled()
  })

  it('requires BTN_EDIT_META rather than BTN_EDIT for instance metadata writes', async () => {
    const permissions = await import('../../services/permission/permission-service.js')
    vi.mocked(permissions.getOrResolvePermissionContext).mockResolvedValue({
      menus: ['LEGALITY_RULE_SETS'],
      ctrls: { LEGALITY_RULE_SETS: ['BTN_EDIT'] },
      dataScope: emptyDataScope,
      permVersion: 1,
    })
    const app = await buildApp(planner)
    const res = await app.inject({
      method: 'PATCH',
      url: '/instances/1',
      payload: { name: 'Rename', enabled: true },
    })

    expect(res.statusCode).toBe(403)
    expect(service.updateInstance).not.toHaveBeenCalled()
  })

  it('passes admin mutation requests to the service with the authenticated user', async () => {
    service.copyInstance.mockResolvedValue({ id: 88 })
    const app = await buildApp(admin)
    const res = await app.inject({ method: 'POST', url: '/instances/7/copy' })

    expect(res.statusCode).toBe(200)
    expect(service.copyInstance).toHaveBeenCalledWith(7, 'admin')
    expect(res.json().data).toEqual({ id: 88 })
  })

  it('validates request payloads before writes', async () => {
    const app = await buildApp(admin)
    const res = await app.inject({
      method: 'POST',
      url: '/sets',
      payload: { name: '', description: '', division: 'P', enabled: true },
    })

    expect(res.statusCode).toBe(400)
    expect(service.createSet).not.toHaveBeenCalled()
  })

  it('maps typed calculate validation and domain errors to 400', async () => {
    service.calculate.mockRejectedValue(new CostLibraryError(400, 'quantity is required'))
    const app = await buildApp(admin)
    const res = await app.inject({
      method: 'POST',
      url: '/calculate',
      payload: { revisionId: 1, inputs: {} },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toBe('quantity is required')
  })

  it('sanitizes unexpected calculate errors as 500', async () => {
    service.calculate.mockRejectedValue(new Error('database connection failed: internal detail'))
    const app = await buildApp(admin)
    const res = await app.inject({
      method: 'POST',
      url: '/calculate',
      payload: { revisionId: 1, inputs: {} },
    })

    expect(res.statusCode).toBe(500)
    expect(res.json().message).toBe('Cost library request failed')
  })
})
