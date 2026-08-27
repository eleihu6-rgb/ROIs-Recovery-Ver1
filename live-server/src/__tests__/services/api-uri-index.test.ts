import { describe, it, expect } from 'vitest'
import {
  normalizeApiPath,
  matchApiRule,
  decidePermission,
  PERMISSION_CODES,
  type ApiRule,
} from '../../services/permission/api-uri-index.js'
import type { PermissionContext } from '../../types/permission.js'

const emptyCtx: PermissionContext = {
  menus: [],
  ctrls: {},
  dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
  permVersion: 1,
}

describe('normalizeApiPath', () => {
  it('去掉 /altair/live 代理前缀', () => {
    expect(normalizeApiPath('/altair/live/api/roster/assign')).toBe('/api/roster/assign')
  })
  it('去掉自定义前缀（如 /dev/live）', () => {
    expect(normalizeApiPath('/dev/live/api/crew')).toBe('/api/crew')
  })
  it('已带 /api 的不动', () => {
    expect(normalizeApiPath('/api/crew')).toBe('/api/crew')
  })
  it('去掉 query string', () => {
    expect(normalizeApiPath('/api/crew?page=1')).toBe('/api/crew')
  })
})

describe('matchApiRule', () => {
  const rules: ApiRule[] = [
    { pattern: '/api/roster/assign', menuCode: 'LIVE_ROSTER', ctlCode: 'LIVE_SAVE' },
    { pattern: '/api/crew*', menuCode: 'DATA_CREW_MASTER', ctlCode: null },
    { pattern: '/api/roster/*/delete', menuCode: 'LIVE_ROSTER', ctlCode: 'LIVE_DELETE' },
  ]
  it('精确命中 ctrl 规则', () => {
    expect(matchApiRule(rules, '/api/roster/assign')).toEqual(rules[0])
  })
  it('通配命中读接口规则', () => {
    expect(matchApiRule(rules, '/api/crew/123')).toEqual(rules[1])
  })
  it('通配路径段命中', () => {
    expect(matchApiRule(rules, '/api/roster/42/delete')).toEqual(rules[2])
  })
  it('无命中返回 null', () => {
    expect(matchApiRule(rules, '/api/pairing')).toBeNull()
  })
})

describe('decidePermission', () => {
  const rules: ApiRule[] = [
    { pattern: '/api/roster/assign', menuCode: 'LIVE_ROSTER', ctlCode: 'LIVE_SAVE' },
    { pattern: '/api/crew*', menuCode: 'DATA_CREW_MASTER', ctlCode: null },
  ]
  const base = { path: '/api/x', rules, ctx: emptyCtx, isAdmin: 0 }

  it('is_admin 短路放行', () => {
    expect(decidePermission({ ...base, isAdmin: 1, path: '/api/crew/1' })).toEqual({ pass: true })
  })
  it('命中 ctrl 但无按钮权限 → 403 CTRL', () => {
    const d = decidePermission({ ...base, path: '/api/roster/assign', ctx: { ...emptyCtx, ctrls: { LIVE_ROSTER: [] } } })
    expect(d).toMatchObject({ pass: false, code: PERMISSION_CODES.CTRL })
  })
  it('命中 ctrl 且有按钮权限 → 放行', () => {
    const d = decidePermission({ ...base, path: '/api/roster/assign', ctx: { ...emptyCtx, ctrls: { LIVE_ROSTER: ['LIVE_SAVE'] } } })
    expect(d.pass).toBe(true)
  })
  it('命中菜单读接口但无菜单 → 403 MENU', () => {
    const d = decidePermission({ ...base, path: '/api/crew/1' })
    expect(d).toMatchObject({ pass: false, code: PERMISSION_CODES.MENU })
  })
  it('命中菜单读接口且有菜单 → 放行', () => {
    const d = decidePermission({ ...base, path: '/api/crew/1', ctx: { ...emptyCtx, menus: ['DATA_CREW_MASTER'] } })
    expect(d.pass).toBe(true)
  })
  it('未映射接口放行（fail-open）', () => {
    expect(decidePermission({ ...base, path: '/api/pairing' }).pass).toBe(true)
  })
  it('permVersion 不一致 → 403 STALE', () => {
    const d = decidePermission({ ...base, jwtPermVersion: 2 })
    expect(d).toMatchObject({ pass: false, code: PERMISSION_CODES.STALE })
  })
  it('JWT 无 permVersion（旧 token）跳过陈旧校验', () => {
    const d = decidePermission({ ...base, path: '/api/roster/assign', ctx: { ...emptyCtx, ctrls: { LIVE_ROSTER: ['LIVE_SAVE'] } } })
    expect(d.pass).toBe(true)
  })
})
