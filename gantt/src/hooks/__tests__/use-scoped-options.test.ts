import { describe, it, expect } from 'vitest'
import { filterOptionsByScope, isValueInScope } from '../use-scoped-options'
import type { PermissionInfo } from '../../stores/auth-store'

const scope = (partial: Partial<PermissionInfo['dataScope']>): PermissionInfo['dataScope'] => ({
  FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [], ...partial,
})

describe('isValueInScope', () => {
  it('is_admin 全放行（不看白名单）', () => {
    expect(isValueInScope({ isAdmin: true, scope: scope({ FLEET: ['B737'] }), dim: 'FLEET', value: 'A320' })).toBe(true)
  })

  it('未配置维度（空数组）不限', () => {
    expect(isValueInScope({ isAdmin: false, scope: scope({ FLEET: [] }), dim: 'FLEET', value: 'ANY' })).toBe(true)
  })

  it('scope 未加载（undefined）→ 不限（fail-open）', () => {
    expect(isValueInScope({ isAdmin: false, scope: undefined, dim: 'FLEET', value: 'B737' })).toBe(true)
  })

  it('白名单内 OR、白名单外拒绝', () => {
    const s = scope({ FLEET: ['B737', 'A320'] })
    expect(isValueInScope({ isAdmin: false, scope: s, dim: 'FLEET', value: 'B737' })).toBe(true)
    expect(isValueInScope({ isAdmin: false, scope: s, dim: 'FLEET', value: 'B787' })).toBe(false)
  })

  it('不同维度互不影响', () => {
    const s = scope({ FLEET: ['B737'] })
    expect(isValueInScope({ isAdmin: false, scope: s, dim: 'RANK', value: 'CA' })).toBe(true) // RANK 未配置 → 不限
  })
})

describe('filterOptionsByScope', () => {
  const opts = [{ value: 'B737' }, { value: 'A320' }, { value: 'B787' }]

  it('按维度过滤', () => {
    const got = filterOptionsByScope(false, scope({ FLEET: ['B737', 'A320'] }), 'FLEET', opts)
    expect(got.map((o) => o.value)).toEqual(['B737', 'A320'])
  })

  it('未配置维度返回全量', () => {
    expect(filterOptionsByScope(false, scope({}), 'FLEET', opts)).toHaveLength(3)
  })

  it('admin 返回全量', () => {
    expect(filterOptionsByScope(true, scope({ FLEET: ['B737'] }), 'FLEET', opts)).toHaveLength(3)
  })
})
