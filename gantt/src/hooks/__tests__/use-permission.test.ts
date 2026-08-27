import { describe, it, expect } from 'vitest'
import { evaluatePermission } from '../use-permission'

const menus = ['LIVE', 'LIVE_ROSTER']
const ctrls = { LIVE_ROSTER: ['LIVE_SAVE', 'LIVE_DELETE'] }

describe('evaluatePermission', () => {
  it('is_admin 全放行', () => {
    expect(evaluatePermission({ isAdmin: true, menus, ctrls, menuCode: 'SYSTEM' })).toBe(true)
    expect(evaluatePermission({ isAdmin: true, menus, ctrls, menuCode: 'SYSTEM', ctlCode: 'BTN_ADD' })).toBe(true)
  })

  it('menuCode 为空不限菜单', () => {
    expect(evaluatePermission({ isAdmin: false, menus, ctrls, menuCode: undefined })).toBe(true)
  })

  it('菜单不可访问 → false', () => {
    expect(evaluatePermission({ isAdmin: false, menus, ctrls, menuCode: 'SYSTEM' })).toBe(false)
  })

  it('菜单可访问 + 无 ctlCode → true', () => {
    expect(evaluatePermission({ isAdmin: false, menus, ctrls, menuCode: 'LIVE_ROSTER' })).toBe(true)
  })

  it('菜单可访问 + 有 ctl 权限 → true', () => {
    expect(evaluatePermission({ isAdmin: false, menus, ctrls, menuCode: 'LIVE_ROSTER', ctlCode: 'LIVE_SAVE' })).toBe(true)
  })

  it('菜单可访问 + 无 ctl 权限 → false', () => {
    expect(evaluatePermission({ isAdmin: false, menus, ctrls, menuCode: 'LIVE_ROSTER', ctlCode: 'BTN_EXPORT' })).toBe(false)
  })

  it('权限未加载（menus 空）非 admin → false', () => {
    expect(evaluatePermission({ isAdmin: false, menus: [], ctrls: {}, menuCode: 'LIVE' })).toBe(false)
  })
})
