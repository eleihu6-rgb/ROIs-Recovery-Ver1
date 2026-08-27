import { describe, it, expect } from 'vitest'
import { isInScope, filterByScope, NO_SCOPE } from '../../services/permission/scope-option.js'
import type { DataScope } from '../../types/permission.js'

const scope = (partial: Partial<DataScope>): DataScope => ({ ...NO_SCOPE, ...partial })

describe('isInScope', () => {
  it('未配置维度（空数组）不限', () => {
    const s = scope({ FLEET: [] })
    expect(isInScope(s, 'FLEET', 'ANY')).toBe(true)
  })

  it('白名单精确匹配', () => {
    const s = scope({ FLEET: ['B737', 'A320'] })
    expect(isInScope(s, 'FLEET', 'B737')).toBe(true)
    expect(isInScope(s, 'FLEET', 'B787')).toBe(false)
  })

  it('不同维度互不影响', () => {
    const s = scope({ FLEET: ['B737'] })
    expect(isInScope(s, 'RANK', 'CA')).toBe(true) // RANK 未配置 → 不限
  })
})

describe('filterByScope', () => {
  const fleets = [
    { code: 'B737' },
    { code: 'A320' },
    { code: 'B787' },
  ]

  it('按维度过滤列表', () => {
    const s = scope({ FLEET: ['B737', 'A320'] })
    const got = filterByScope(fleets, s, 'FLEET', (f) => f.code)
    expect(got.map((f) => f.code)).toEqual(['B737', 'A320'])
  })

  it('未配置维度返回全量', () => {
    const got = filterByScope(fleets, scope({}), 'FLEET', (f) => f.code)
    expect(got).toHaveLength(3)
  })
})
