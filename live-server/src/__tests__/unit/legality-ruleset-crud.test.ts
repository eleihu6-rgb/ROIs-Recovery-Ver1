import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'

// legality.ts → legality-recheck.ts → config/env triggers env.parse; mock the config + the
// recheck service so the unit tests need no real env / Redis / DB.
vi.mock('../../config/env.js', () => ({
  env: { DATABASE_URL: 'postgresql://test:test@localhost:5432/test', REDIS_URL: 'redis://localhost:6379', FILIALE: 'F8' },
}))
vi.mock('../../config/index.js', () => ({
  env: { DATABASE_URL: 'postgresql://test:test@localhost:5432/test', REDIS_URL: 'redis://localhost:6379', FILIALE: 'F8' },
}))
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

/** Build an app whose pgPool.query is driven by `q`; auth hook sets admin/non-admin. */
const build = async (q: (sql: string, p: unknown[]) => unknown, isAdmin = 1) => {
  const app = Fastify()
  app.decorate('pgPool', { query: vi.fn(async (sql: string, p: unknown[] = []) => q(sql, p)) } as never)
  app.decorate('db', {} as never)
  app.decorate('redis', {} as never)
  app.addHook('onRequest', async (req) => { (req as { authUser?: unknown }).authUser = { userCode: 'admin', isAdmin } })
  await app.register(legalityRoutes)
  return app
}

describe('Rule Set (workset) management', () => {
  it('GET /rulesets returns RULE worksets even when ruleCount is zero', async () => {
    let listSql = ''
    const app = await build((sql) => {
      if (sql.includes('FROM workset w')) {
        listSql = sql
        return { rows: [
          { id: 433, name: 'F8 Full Ruleset', category: 'RULE', type: 'RO', division: 'P', enabled: false, rule_count: 14, is_default: false },
          { id: 650, name: 'Empty Rule Set', category: 'RULE', type: 'LIVE', division: 'P', enabled: true, rule_count: 0, is_default: true },
        ] }
      }
      return { rows: [] }
    })

    const res = await app.inject({ method: 'GET', url: '/rulesets' })

    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual([
      { id: 433, name: 'F8 Full Ruleset', category: 'RULE', type: 'RO', division: 'P', enabled: false, ruleCount: 14, isDefault: false },
      { id: 650, name: 'Empty Rule Set', category: 'RULE', type: 'LIVE', division: 'P', enabled: true, ruleCount: 0, isDefault: true },
    ])
    expect(listSql).toContain('LEFT JOIN rule_set')
    expect(listSql).toContain("w.category = 'RULE'")
    expect(listSql).toContain('w.type')
    expect(listSql).not.toContain('HAVING count')
  })

  it('POST /rulesets creates a workset (admin)', async () => {
    let insertParams: unknown[] | null = null
    const app = await build((sql, params) => {
      if (sql.includes('INSERT INTO workset')) {
        insertParams = params
        return { rows: [{ id: 900, name: 'My Set', category: 'RULE', type: 'RO', division: 'P', enabled: false }] }
      }
      return { rows: [] }
    })
    const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'My Set', division: 'P' } })
    expect(res.statusCode).toBe(200)
    expect(insertParams).toEqual(['My Set', 'P', 'RO', false, 'F8', 'admin'])
    expect(res.json().data).toMatchObject({ id: 900, name: 'My Set', category: 'RULE', ruleCount: 0, isDefault: false })
  })

  it('POST /rulesets rejects non-admin (403) + missing name (400)', async () => {
    expect((await (await build(() => ({ rows: [] }), 0)).inject({ method: 'POST', url: '/rulesets', payload: { name: 'X' } })).statusCode).toBe(403)
    expect((await (await build(() => ({ rows: [] }))).inject({ method: 'POST', url: '/rulesets', payload: { division: 'P' } })).statusCode).toBe(400)
  })

  it('returns 403 with "missing menu permission" message for non-admin without menu', async () => {
    const app = await build(() => ({ rows: [] }), 0)
    const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'X' } })
    expect(res.statusCode).toBe(403)
    expect(res.json().message).toBe('Access denied: missing menu permission')
  })

  it('grants non-admin access when LEGALITY_RULE_SETS menu is granted', async () => {
    ;(globalThis as { __grantedMenus?: string[] }).__grantedMenus = ['LEGALITY_RULE_SETS']
    try {
      let insertParams: unknown[] | null = null
      const app = await build((sql, params) => {
        if (sql.includes('INSERT INTO workset')) {
          insertParams = params
          return { rows: [{ id: 950, name: 'Granted', category: 'RULE', type: 'RO', division: 'P', enabled: false }] }
        }
        return { rows: [] }
      }, 0)
      const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'Granted', division: 'P' } })
      expect(res.statusCode).toBe(200)
      expect(insertParams).toEqual(['Granted', 'P', 'RO', false, 'F8', 'admin'])
    } finally {
      ;(globalThis as { __grantedMenus?: string[] }).__grantedMenus = []
    }
  })

  it('admin short-circuit grants access without explicit menu', async () => {
    let insertParams: unknown[] | null = null
    const app = await build((sql, params) => {
      if (sql.includes('INSERT INTO workset')) {
        insertParams = params
        return { rows: [{ id: 951, name: 'AdminOnly', category: 'RULE', type: 'RO', division: 'P', enabled: false }] }
      }
      return { rows: [] }
    }, 1)
    const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'AdminOnly', division: 'P' } })
    expect(res.statusCode).toBe(200)
    expect(insertParams).toEqual(['AdminOnly', 'P', 'RO', false, 'F8', 'admin'])
  })

  it('PATCH /ruleset/:id updates name', async () => {
    const app = await build((sql) => sql.includes('UPDATE workset')
      ? { rows: [{ id: 900, name: 'Renamed', category: null, type: 'RO', division: 'P', enabled: false }] }
      : { rows: [{ id: 900, type: 'RO', division: 'P', enabled: false, category: 'RULE' }] })
    const res = await app.inject({ method: 'PATCH', url: '/ruleset/900', payload: { name: 'Renamed' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.name).toBe('Renamed')
  })

  it('DELETE /ruleset/:id — ok when free, 409 when a scenario uses it', async () => {
    const q = (n: number) => (sql: string) =>
      sql.includes('FROM workset WHERE id') ? { rows: [{ id: 900, name: 'My Set' }] }
      : sql.includes('FROM scenario') ? { rows: [{ n }] } : { rows: [] }
    expect((await (await build(q(0))).inject({ method: 'DELETE', url: '/ruleset/900' })).statusCode).toBe(200)
    expect((await (await build(q(2))).inject({ method: 'DELETE', url: '/ruleset/900' })).statusCode).toBe(409)
  })

  it('POST /ruleset/:id/copy share-rules → new workset, membership inserted', async () => {
    const seen: string[] = []
    const app = await build((sql) => { seen.push(sql)
      if (sql.includes('INSERT INTO workset')) return { rows: [{ id: 901, name: 'Copy', category: null }] }
      if (sql.includes('FROM rule_set WHERE workset_id')) return { rows: [{ rule_id: 8002001 }, { rule_id: 8030001 }] }
      return { rows: [{ id: 900, name: 'Src', division: 'P', category: null, type: 'CU', filiale: 'F8' }] } })
    const res = await app.inject({ method: 'POST', url: '/ruleset/900/copy', payload: { name: 'Copy', mode: 'share-rules' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ id: 901, name: 'Copy', ruleCount: 2 })
    expect(seen.some((s) => s.includes('INSERT INTO rule_set'))).toBe(true)
    expect(seen.some((s) => s.includes('INSERT INTO rule (')), 'share-rules must NOT duplicate rules').toBe(false)
  })

  it('POST /ruleset/:id/copy copy-rules → duplicates each member rule', async () => {
    const seen: string[] = []
    const app = await build((sql) => { seen.push(sql)
      if (sql.includes('INSERT INTO workset')) return { rows: [{ id: 902, name: 'Copy2', category: null }] }
      if (sql.includes('FROM rule_set WHERE workset_id')) return { rows: [{ rule_id: 8002001 }] }
      if (sql.includes('FROM rule WHERE rule_id')) return { rows: [{ function: 8002, instance: '001', class: null, description: 'X', reference: null, category: 'Duty', store_structure: null, source: null, detail: null, overridability: null, severity: 3, filiale: 'F8', division: 'P', exception_code: null, param_json: null }] }
      if (sql.includes('max(instance')) return { rows: [{ ni: '003' }] }
      return { rows: [{ id: 900, name: 'Src', division: 'P', category: null, type: 'CU', filiale: 'F8' }] } })
    const res = await app.inject({ method: 'POST', url: '/ruleset/900/copy', payload: { name: 'Copy2', mode: 'copy-rules' } })
    expect(res.statusCode).toBe(200)
    expect(seen.some((s) => s.includes('INSERT INTO rule (')), 'copy-rules duplicates rules').toBe(true)
  })

  it('POST/DELETE /ruleset/:wid/rules/:ruleId manages membership', async () => {
    const app = await build((sql) =>
      sql.includes('FROM rule WHERE id') ? { rows: [{ rule_id: 8002001 }] }
      : sql.includes('count(*)') ? { rows: [{ n: 0 }] } : { rows: [] })
    expect((await app.inject({ method: 'POST', url: '/ruleset/433/rules/17' })).statusCode).toBe(200)
    expect((await app.inject({ method: 'DELETE', url: '/ruleset/433/rules/17' })).statusCode).toBe(200)
  })

  it('membership add rejects a duplicate (409)', async () => {
    const app = await build((sql) =>
      sql.includes('FROM rule WHERE id') ? { rows: [{ rule_id: 8002001 }] }
      : sql.includes('count(*)') ? { rows: [{ n: 1 }] } : { rows: [] })
    expect((await app.inject({ method: 'POST', url: '/ruleset/433/rules/17' })).statusCode).toBe(409)
  })

  it('POST /rulesets normalizes a multi-type array to a canonical comma string', async () => {
    let insertParams: unknown[] | null = null
    const app = await build((sql, params) => {
      if (sql.includes('INSERT INTO workset')) {
        insertParams = params
        return { rows: [{ id: 910, name: 'Unified', category: 'RULE', type: 'LIVE,PBS,RO', division: 'P', enabled: false }] }
      }
      return { rows: [] }
    })
    const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'Unified', division: 'P', type: ['RO', 'LIVE', 'PBS'] } })
    expect(res.statusCode).toBe(200)
    expect(insertParams).toEqual(['Unified', 'P', 'LIVE,PBS,RO', false, 'F8', 'admin'])
    expect(res.json().data.type).toBe('LIVE,PBS,RO')
  })

  it('POST /rulesets rejects an empty type array (400)', async () => {
    const app = await build(() => ({ rows: [] }))
    const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'X', type: [] } })
    expect(res.statusCode).toBe(400)
  })

  it('POST /rulesets rejects an invalid type code (400)', async () => {
    const app = await build(() => ({ rows: [] }))
    const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'X', type: ['LIVE', 'XX'] } })
    expect(res.statusCode).toBe(400)
  })

  it('enabling a LIVE,PBS set deactivates the division’s previous enabled LIVE and PBS sets (per claimed type), RO untouched', async () => {
    const seen: string[] = []
    const app = await build((sql, params) => {
      seen.push(sql)
      if (sql.includes('INSERT INTO workset')) {
        return { rows: [{ id: 910, name: 'U', category: 'RULE', type: 'LIVE,PBS', division: 'P', enabled: true }] }
      }
      if (sql.includes('SELECT id FROM workset')) {
        return { rows: params[0] === 'LIVE' ? [{ id: 752 }] : params[0] === 'PBS' ? [{ id: 754 }] : [] }
      }
      return { rows: [] }
    })
    const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'U', division: 'P', type: ['LIVE', 'PBS'], enabled: true } })
    expect(res.statusCode).toBe(200)
    const disables = seen.filter((s) => s.includes('UPDATE workset SET enabled'))
    expect(disables).toHaveLength(2)
    expect(disables.every((s) => s.includes("LIKE '%") && s.includes("%'"))).toBe(true)
    expect(seen.filter((s) => s.includes('DELETE FROM rule_violation'))).toHaveLength(2)
  })

  it('enabling a pure RO set deactivates nothing and does not trigger a live refresh', async () => {
    const seen: string[] = []
    const app = await build((sql) => { seen.push(sql); return sql.includes('INSERT INTO workset')
      ? { rows: [{ id: 911, name: 'R', category: 'RULE', type: 'RO', division: 'P', enabled: true }] } : { rows: [] } })
    const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'R', division: 'P', type: ['RO'], enabled: true } })
    expect(res.statusCode).toBe(200)
    expect(seen.some((s) => s.includes('UPDATE workset SET enabled'))).toBe(false)
    expect(seen.some((s) => s.includes('FROM roster_period'))).toBe(false)
  })

  it('PATCH type array is normalized to a canonical comma string before storage', async () => {
    let updateParams: unknown[] | null = null
    const app = await build((sql, params) => {
      if (sql.includes('UPDATE workset SET')) {
        updateParams = params
        return { rows: [{ id: 752, name: 'Live Ruleset FD', category: null, type: 'LIVE,RO', division: 'P', enabled: false }] }
      }
      if (sql.includes('FROM workset WHERE id')) return { rows: [{ id: 752, type: 'RO', division: 'P', enabled: false, category: 'RULE' }] }
      return { rows: [] }
    })
    const res = await app.inject({ method: 'PATCH', url: '/ruleset/752', payload: { type: ['LIVE', 'RO'] } })
    expect(res.statusCode).toBe(200)
    expect(updateParams).toEqual(['LIVE,RO', 'admin', 752])
    expect(res.json().data.type).toBe('LIVE,RO')
  })

  it('PATCH moving an enabled LIVE set off LIVE deletes its own violations', async () => {
    const seen: string[] = []
    const app = await build((sql) => {
      seen.push(sql)
      if (sql.includes('UPDATE workset SET')) return { rows: [{ id: 752, name: 'Live Ruleset FD', category: null, type: 'RO', division: 'P', enabled: true }] }
      if (sql.includes('FROM workset WHERE id')) return { rows: [{ id: 752, type: 'LIVE', division: 'P', enabled: true, category: 'RULE' }] }
      return { rows: [] }
    })
    const res = await app.inject({ method: 'PATCH', url: '/ruleset/752', payload: { type: ['RO'] } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.type).toBe('RO')
    expect(seen.some((s) => s.includes('DELETE FROM rule_violation WHERE ruleset_id'))).toBe(true)
  })
})
