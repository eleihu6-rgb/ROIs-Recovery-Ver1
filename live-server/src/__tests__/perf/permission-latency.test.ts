import { describe, it, expect } from 'vitest'
import { decidePermission, matchApiRule, normalizeApiPath, type ApiRule } from '../../services/permission/api-uri-index.js'
import type { PermissionContext } from '../../types/permission.js'

/**
 * 性能基准：权限校验热路径（decidePermission = 路径归一化 + 规则匹配 + 判定）。
 * 内存 Map 查找，开销应远低于 5ms p99，不影响现有接口（现有 Gantt DB 查询毫秒级）。
 */
describe('permission check latency benchmark', () => {
  // 模拟接近真实规模的规则集（~120 条：菜单读接口 + 按钮动作接口）
  const rules: ApiRule[] = []
  const menus = ['LIVE_ROSTER', 'DATA_ORG_BASE', 'DATA_CREW_MASTER', 'LEGALITY_RULE_SETS', 'PBS_PERIOD', 'SYSTEM_SCHEDULER']
  for (const m of menus) {
    rules.push({ pattern: `/api/${m.toLowerCase()}*`, menuCode: m, ctlCode: null })
    for (let i = 0; i < 20; i++) {
      rules.push({ pattern: `/api/${m.toLowerCase()}/${i}/op`, menuCode: m, ctlCode: `BTN_${i}` })
    }
  }

  const ctx: PermissionContext = {
    menus: ['LIVE_ROSTER', 'DATA_CREW_MASTER'],
    ctrls: { LIVE_ROSTER: ['BTN_0', 'BTN_1', 'BTN_2', 'BTN_3', 'BTN_4'] },
    dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: ['B737'] },
    permVersion: 1,
  }

  const percentile = (sorted: number[], p: number): number => {
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
    return sorted[idx] ?? 0
  }

  it('decidePermission p50/p99 < 5ms（放行路径）', () => {
    const samples: number[] = []
    for (let i = 0; i < 20_000; i++) {
      const path = i % 2 === 0 ? '/api/live_roster/3/op' : '/api/data_crew_master/7/op'
      const t0 = performance.now()
      const d = decidePermission({ isAdmin: 0, jwtPermVersion: 1, path, rules, ctx })
      samples.push((performance.now() - t0) * 1000)
      expect(d.pass).toBe(true)
    }
    samples.sort((a, b) => a - b)
    const p50 = percentile(samples, 50)
    const p99 = percentile(samples, 99)
    // eslint-disable-next-line no-console
    console.log(`  decidePermission p50=${p50.toFixed(2)}µs p99=${p99.toFixed(2)}µs`)
    expect(p99).toBeLessThan(5000)
  })

  it('decidePermission 拒绝路径同样 < 5ms p99', () => {
    const samples: number[] = []
    for (let i = 0; i < 20_000; i++) {
      const t0 = performance.now()
      decidePermission({ isAdmin: 0, jwtPermVersion: 1, path: '/api/pbs_period/1/op', rules, ctx })
      samples.push((performance.now() - t0) * 1000)
    }
    samples.sort((a, b) => a - b)
    const p99 = percentile(samples, 99)
    // eslint-disable-next-line no-console
    console.log(`  decidePermission(deny) p99=${p99.toFixed(2)}µs`)
    expect(p99).toBeLessThan(5000)
  })

  it('matchApiRule 单次匹配微秒级', () => {
    const t0 = performance.now()
    for (let i = 0; i < 50_000; i++) matchApiRule(rules, '/api/live_roster/3/op')
    const perOp = (performance.now() - t0) * 1000 / 50_000
    // eslint-disable-next-line no-console
    console.log(`  matchApiRule 单次平均 ${perOp.toFixed(2)}µs`)
    expect(perOp).toBeLessThan(1000)
  })

  it('normalizeApiPath 幂等', () => {
    expect(normalizeApiPath('/altair/live/api/roster/assign')).toBe('/api/roster/assign')
    expect(normalizeApiPath('/api/roster/assign')).toBe('/api/roster/assign')
  })
})
