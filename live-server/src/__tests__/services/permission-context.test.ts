import { describe, it, expect } from 'vitest'
import { buildPermissionContext, type PermissionRow } from '../../services/permission/permission-context.js'

const menuRow = (menuCode: string, hidden?: string): PermissionRow => ({
  profileId: 1, menuCode, menuHidden: hidden ?? null, ctlCode: null, ctlHidden: null, authType: null, authValues: null,
})
const ctrlRow = (menuCode: string, ctlCode: string, hidden?: string): PermissionRow => ({
  profileId: 1, menuCode, menuHidden: null, ctlCode, ctlHidden: hidden ?? null, authType: null, authValues: null,
})
const authRow = (authType: string, authValues: string[]): PermissionRow => ({
  profileId: 1, menuCode: null, menuHidden: null, ctlCode: null, ctlHidden: null, authType, authValues,
})

describe('buildPermissionContext', () => {
  it('合并多角色菜单/按钮并集', () => {
    const ctx = buildPermissionContext([
      menuRow('LIVE'),
      ctrlRow('LIVE_ROSTER', 'LIVE_SAVE'),
      menuRow('DATA'),
    ])
    expect(ctx.menus).toContain('LIVE')
    expect(ctx.menus).toContain('DATA')
    expect(ctx.ctrls.LIVE_ROSTER).toContain('LIVE_SAVE')
  })

  it('is_hidden=Y 不进入权限', () => {
    const ctx = buildPermissionContext([menuRow('SECRET', 'Y'), ctrlRow('MENU', 'BTN_X', 'Y')])
    expect(ctx.menus).not.toContain('SECRET')
    expect(ctx.ctrls.MENU).toBeUndefined()
  })

  it('数据权限并集（跨角色合并去重）+ 未配置维度为空数组', () => {
    const ctx = buildPermissionContext([
      authRow('FLEET', ['B737', 'A320']),
      authRow('FLEET', ['B737', 'B787']),
      authRow('DIVISION', ['P']),
    ])
    expect(ctx.dataScope.FLEET).toEqual(['B737', 'A320', 'B787'])
    expect(ctx.dataScope.DIVISION).toEqual(['P'])
    expect(ctx.dataScope.RANK).toEqual([])
    expect(ctx.dataScope.FILIALE).toEqual([])
    expect(ctx.dataScope.CREW_DEPARTMENT).toEqual([])
  })

  it('未知 auth_type 忽略', () => {
    const ctx = buildPermissionContext([authRow('BASE', ['PEK'])])
    expect(ctx.dataScope.FLEET).toEqual([])
  })

  it('permVersion 透传', () => {
    const ctx = buildPermissionContext([menuRow('LIVE')], 7)
    expect(ctx.permVersion).toBe(7)
  })
})
