// live-server/src/__tests__/unit/legality-rules-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
  },
}))

vi.mock('../../config/index.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
  },
}))

// legality-recheck is imported by legality.ts; stub it so tests don't need Redis/DB
vi.mock('../../services/rule/legality-recheck.js', () => ({
  resolveAffected: vi.fn(async () => ({ inWindowScenarioIds: [], outOfWindowScenarioIds: [], affectsLiveDefault: false, liveWorksetIds: [], scenarioCount: 0 })),
  markScenariosStale: vi.fn(async () => {}),
  flagScenariosParamsStale: vi.fn(async () => {}),
  spawnLiveRecheck: vi.fn(),
  affectedRuleCodes: vi.fn(async () => []),
}))

vi.mock('../../services/permission/permission-service.js', () => ({
  hasMenuAccess: async (_fastify: unknown, authUser: { isAdmin?: number }, code: string) => {
    const granted = (globalThis as { __grantedMenus?: string[] }).__grantedMenus ?? []
    return authUser?.isAdmin === 1 || granted.includes(code)
  },
  getOrResolvePermissionContext: async () => {
    const granted = (globalThis as { __grantedMenus?: string[] }).__grantedMenus ?? []
    return {
      menus: granted,
      ctrls: {},
      dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
      permVersion: 1,
    }
  },
  invalidatePermissionContext: async () => undefined,
  ALL_ACCESS_CONTEXT: { menus: [], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }, permVersion: 1 },
  buildAdminContext: async () => ({ menus: [], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }, permVersion: 1 }),
  resolvePermissionContext: async () => ({ menus: [], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }, permVersion: 1 }),
  permissionKey: () => 'perm:test',
  permissionVersionKey: () => 'perm:ver:test',
  getPermissionVersion: async () => 1,
  bumpPermissionVersion: async () => 1,
}))

import legalityRoutes from '../../routes/rule/legality.js'

const rows = [
  { id: 17, function: 8002, instance: '001', reference: null, category: 'Duty', description: 'Maximum Flight Time', detail: null, severity: 3, overridability: null, division: 'P', owner: 'S', locked: '1', rule_id: 8002001, updated_by: 'admin', param_json: { tables: [{ header: ['PERIOD'], rows: [['28']] }] } },
  { id: 20, function: 8002, instance: '002', reference: null, category: 'Duty', description: 'Maximum Hours of Work', detail: null, severity: 3, overridability: null, division: 'P', owner: 'U', locked: '0', rule_id: 8002002, updated_by: null, param_json: null },
]

const build = async () => {
  const app = Fastify()
  app.decorate('pgPool', { query: vi.fn(async () => ({ rows })) } as never)
  app.decorate('redis', {} as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (req) => { (req as { authUser?: unknown }).authUser = { userCode: 'admin', isAdmin: 1 } })
  await app.register(legalityRoutes)
  return app
}

describe('GET /rules', () => {
  it('returns the full rule catalog with template flag', async () => {
    const app = await build()
    const res = await app.inject({ method: 'GET', url: '/rules' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data).toHaveLength(2)
    expect(body.data[0]).toMatchObject({ id: 17, function: 8002, instance: '001', isTemplate: true, updatedBy: 'admin' })
    expect(body.data[1]).toMatchObject({ id: 20, instance: '002', isTemplate: false, updatedBy: null })
  })
})

describe('POST /rules/:ruleId/copy', () => {
  it('copies a rule into the next free instance, owner=U locked=0', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = []
    const app = Fastify()
    app.decorate('pgPool', {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params: params ?? [] })
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
        if (sql.includes('SELECT') && sql.includes('FROM rule') && sql.includes('WHERE id'))
          return { rows: [{ id: 17, function: 8002, instance: '001', description: 'Maximum Flight Time', category: 'Duty', reference: null, detail: null, severity: 3, overridability: null, division: 'P', filiale: 'F8', store_structure: null, source: null, class: null, exception_code: null, param_json: { tables: [] } }] }
        if (sql.includes('max(') || sql.includes('MAX(') || sql.includes('lpad'))
          return { rows: [{ next_instance: '003' }] }
        if (sql.includes('INSERT INTO rule'))
          return { rows: [{ id: 99, function: 8002, instance: '003', rule_id: 8002003 }] }
        return { rows: [] }
      }),
    } as never)
    app.decorate('redis', {} as never)
    app.decorateRequest('authUser', undefined)
    app.addHook('onRequest', async (req) => { (req as { authUser?: unknown }).authUser = { userCode: 'admin', isAdmin: 1 } })
    await app.register(legalityRoutes)
    const res = await app.inject({ method: 'POST', url: '/rules/17/copy' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ function: 8002, instance: '003' })
    const insert = queries.find((q) => q.sql.includes('INSERT INTO rule'))!
    expect(insert.params).toContain('003')
    expect(insert.params).toContain('U') // owner
    expect(insert.params).toContain('0') // locked
  })

  it('rejects copy for non-admin', async () => {
    ;(globalThis as { __grantedMenus?: string[] }).__grantedMenus = []
    const app = Fastify()
    app.decorate('pgPool', { query: vi.fn(async () => ({ rows: [] })) } as never)
    app.decorate('redis', {} as never)
    app.decorateRequest('authUser', undefined)
    app.addHook('onRequest', async (req) => { (req as { authUser?: unknown }).authUser = { userCode: 'ryan', isAdmin: 0 } })
    await app.register(legalityRoutes)
    const res = await app.inject({ method: 'POST', url: '/rules/17/copy' })
    expect(res.statusCode).toBe(403)
    expect(res.json().message).toBe('Access denied: missing menu permission')
  })

  it('returns 403 with "missing menu permission" for copy endpoint when non-admin has no menu', async () => {
    ;(globalThis as { __grantedMenus?: string[] }).__grantedMenus = []
    const app = Fastify()
    app.decorate('pgPool', { query: vi.fn(async () => ({ rows: [] })) } as never)
    app.decorate('redis', {} as never)
    app.addHook('onRequest', async (req) => { (req as { authUser?: unknown }).authUser = { userCode: 'ryan', isAdmin: 0 } })
    await app.register(legalityRoutes)
    const res = await app.inject({ method: 'POST', url: '/rules/17/copy' })
    expect(res.statusCode).toBe(403)
    expect(res.json().message).toBe('Access denied: missing menu permission')
  })

  it('grants non-admin copy access when LEGALITY_RULE_SETS menu is granted', async () => {
    ;(globalThis as { __grantedMenus?: string[] }).__grantedMenus = ['LEGALITY_RULE_SETS']
    const queries: Array<{ sql: string; params: unknown[] }> = []
    const app = Fastify()
    app.decorate('pgPool', {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params: params ?? [] })
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
        if (sql.includes('SELECT') && sql.includes('FROM rule') && sql.includes('WHERE id'))
          return { rows: [{ id: 17, function: 8002, instance: '001', description: 'Maximum Flight Time', category: 'Duty', reference: null, detail: null, severity: 3, overridability: null, division: 'P', filiale: 'F8', store_structure: null, source: null, class: null, exception_code: null, param_json: { tables: [] } }] }
        if (sql.includes('max(') || sql.includes('MAX(') || sql.includes('lpad'))
          return { rows: [{ next_instance: '003' }] }
        if (sql.includes('INSERT INTO rule'))
          return { rows: [{ id: 99, function: 8002, instance: '003', rule_id: 8002003 }] }
        return { rows: [] }
      }),
    } as never)
    app.decorate('redis', {} as never)
    app.addHook('onRequest', async (req) => { (req as { authUser?: unknown }).authUser = { userCode: 'ryan', isAdmin: 0 } })
    await app.register(legalityRoutes)
    const res = await app.inject({ method: 'POST', url: '/rules/17/copy' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ function: 8002, instance: '003' })
  })
})

describe('DELETE /rules/:ruleId', () => {
  beforeEach(() => {
    ;(globalThis as { __grantedMenus?: string[] }).__grantedMenus = []
  })

  it('deletes a copy but rejects a template (001) and an in-use rule', async () => {
    const make = (rule: Record<string, unknown>, inSet: boolean, isAdmin = 1) => {
      const app = Fastify()
      app.decorate('pgPool', {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('FROM rule WHERE id')) return { rows: [rule] }
          if (sql.includes('FROM rule_set')) return { rows: inSet ? [{ n: 1 }] : [{ n: 0 }] }
          return { rows: [] }
        }),
      } as never)
      app.decorate('redis', {} as never)
      app.decorateRequest('authUser', undefined)
      app.addHook('onRequest', async (req) => { (req as { authUser?: unknown }).authUser = { userCode: 'admin', isAdmin } })
      return app
    }

    let app = make({ id: 99, instance: '003', rule_id: 8002003 }, false)
    await app.register(legalityRoutes)
    expect((await app.inject({ method: 'DELETE', url: '/rules/99' })).statusCode).toBe(200)

    app = make({ id: 17, instance: '001', rule_id: 8002001 }, false)
    await app.register(legalityRoutes)
    expect((await app.inject({ method: 'DELETE', url: '/rules/17' })).statusCode).toBe(400) // template

    app = make({ id: 99, instance: '003', rule_id: 8002003 }, true)
    await app.register(legalityRoutes)
    expect((await app.inject({ method: 'DELETE', url: '/rules/99' })).statusCode).toBe(409) // in use

    app = make({ id: 99, instance: '003', rule_id: 8002003 }, false, 0)
    await app.register(legalityRoutes)
    expect((await app.inject({ method: 'DELETE', url: '/rules/99' })).statusCode).toBe(403) // non-admin
  })
})
