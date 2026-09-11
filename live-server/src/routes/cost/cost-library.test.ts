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

  it('maps generic JS errors to a structured 500 with category=internal', async () => {
    service.calculate.mockRejectedValue(new Error('database connection failed: internal detail'))
    const app = await buildApp(admin)
    const res = await app.inject({
      method: 'POST',
      url: '/calculate',
      payload: { revisionId: 1, inputs: {} },
    })

    expect(res.statusCode).toBe(500)
    // Must NOT leak the raw error message
    expect(res.json().message).not.toBe('database connection failed: internal detail')
    // Must be a client-safe summary
    expect(res.json().message).toMatch(/unexpected error/i)
    expect(res.json().data).toEqual({
      category: 'internal',
      hint: expect.stringMatching(/administrator/i),
      sqlState: null,
    })
  })

  it('maps PostgreSQL FK violation (23503) to 409 with hint about referenced table', async () => {
    const err = Object.assign(new Error('insert or update on table "cost_set_member" violates foreign key constraint'), {
      code: '23503',
      table: 'cost_set_member',
      constraint: 'fk_member_instance',
    })
    service.deleteSet.mockRejectedValue(err)
    const app = await buildApp(admin)
    const res = await app.inject({ method: 'DELETE', url: '/sets/1' })

    expect(res.statusCode).toBe(409)
    const body = res.json()
    expect(body.message).toMatch(/referenced by other data/i)
    expect(body.data.category).toBe('conflict')
    expect(body.data.sqlState).toBe('23503')
    expect(body.data.hint).toMatch(/cost_set_member/)
    // Raw constraint / table info must NOT leak into the user-facing message
    expect(body.message).not.toMatch(/fk_member_instance/)
  })

  it('maps PostgreSQL unique violation (23505) to 409 with "duplicate" hint', async () => {
    const err = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      constraint: 'uq_cost_set_name',
    })
    service.createSet.mockRejectedValue(err)
    const app = await buildApp(admin)
    const res = await app.inject({
      method: 'POST',
      url: '/sets',
      payload: { name: 'dup', description: '', division: 'F8', enabled: true },
    })

    expect(res.statusCode).toBe(409)
    const body = res.json()
    expect(body.message).toMatch(/already exists/i)
    expect(body.data.category).toBe('conflict')
    expect(body.data.sqlState).toBe('23505')
    expect(body.data.hint).toMatch(/different name/i)
  })

  it('maps PostgreSQL not-null violation (23502) to 400 and names the missing column', async () => {
    const err = Object.assign(new Error('null value in column "unit_price" violates not-null constraint'), {
      code: '23502',
      column: 'unit_price',
      table: 'cost_revision',
    })
    service.addRevision.mockRejectedValue(err)
    const app = await buildApp(admin)
    const res = await app.inject({
      method: 'POST',
      url: '/instances/1/revisions',
      payload: {
        expectedRevisionNo: 1,
        calculatorCode: 'fixed',
        effectiveFrom: '2026-01-01T00:00:00Z',
        effectiveTo: null,
        currencyCode: 'USD',
        unitCode: 'HOUR',
        unitPrice: 10,
        paramsJson: {},
        applicabilityJson: {},
        reference: '',
        ghPolicyRevisionId: null,
      },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.message).toMatch(/unit_price.*required/i)
    expect(body.data.category).toBe('validation')
    expect(body.data.sqlState).toBe('23502')
  })

  it('maps PostgreSQL bad text representation (22P02) to 400 with format hint', async () => {
    const err = Object.assign(new Error('invalid input syntax for type bigint: "abc"'), {
      code: '22P02',
    })
    service.updateInstance.mockRejectedValue(err)
    const app = await buildApp(admin)
    const res = await app.inject({
      method: 'PATCH',
      url: '/instances/999',
      payload: { name: 'X', enabled: true },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.message).toMatch(/not in the expected format/i)
    expect(body.data.category).toBe('validation')
    expect(body.data.sqlState).toBe('22P02')
    // Raw pg message must not leak
    expect(body.message).not.toMatch(/bigint/)
  })

  it('maps connection errors (ECONNREFUSED) to 503 with retry hint', async () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })
    service.catalog.mockRejectedValue(err)
    const app = await buildApp(planner)
    const res = await app.inject({ method: 'GET', url: '/catalog' })

    expect(res.statusCode).toBe(503)
    const body = res.json()
    expect(body.message).toMatch(/database is unreachable/i)
    expect(body.data.category).toBe('unavailable')
    expect(body.data.hint).toMatch(/DATABASE_URL/)
    // Connection details must not leak
    expect(body.message).not.toMatch(/127\.0\.0\.1/)
  })

  it('maps transaction conflict (40001 serialization_failure) to 503', async () => {
    const err = Object.assign(new Error('could not serialize access'), { code: '40001' })
    service.updateSet.mockRejectedValue(err)
    const app = await buildApp(admin)
    const res = await app.inject({
      method: 'PATCH',
      url: '/sets/1',
      payload: { name: 'n', description: '', division: 'F8', enabled: true, expectedVersion: 1 },
    })

    expect(res.statusCode).toBe(503)
    const body = res.json()
    expect(body.message).toMatch(/concurrent update conflict/i)
    expect(body.data.category).toBe('unavailable')
    expect(body.data.hint).toMatch(/newer version/i)
  })

  it('maps developer error (42P01 undefined_table) to 500 with admin-contact hint', async () => {
    const err = Object.assign(new Error('relation "cost_set" does not exist'), { code: '42P01' })
    service.catalog.mockRejectedValue(err)
    const app = await buildApp(planner)
    const res = await app.inject({ method: 'GET', url: '/catalog' })

    expect(res.statusCode).toBe(500)
    const body = res.json()
    expect(body.message).toMatch(/table is missing/i)
    expect(body.data.category).toBe('internal')
    expect(body.data.sqlState).toBe('42P01')
    expect(body.message).not.toMatch(/cost_set/)
  })
})
