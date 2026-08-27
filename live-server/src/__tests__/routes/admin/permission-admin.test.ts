import { describe, it, expect, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'

const PermissionReferenceValidationError = vi.hoisted(() => class extends Error {})

const admin = vi.hoisted(() => ({
  user: { list: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), resetPassword: vi.fn(), setProfiles: vi.fn() },
  profile: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), setMenus: vi.fn(), setCtrls: vi.fn(), setDataScope: vi.fn(), getPermissions: vi.fn(), listUsers: vi.fn(), addUsers: vi.fn(), removeUsers: vi.fn() },
  pbsUser: { list: vi.fn(), setStatus: vi.fn(), resetPassword: vi.fn() },
  menu: { tree: vi.fn(), createMenu: vi.fn(), updateMenu: vi.fn(), removeMenu: vi.fn(), createCtrl: vi.fn(), updateCtrl: vi.fn(), removeCtrl: vi.fn() },
  dept: { listUserDepartments: vi.fn(), listCrewDepartments: vi.fn(), createUserDepartment: vi.fn(), createCrewDepartment: vi.fn(), updateUserDepartment: vi.fn(), updateCrewDepartment: vi.fn(), removeUserDepartment: vi.fn(), removeCrewDepartment: vi.fn() },
}))
vi.mock('../../../services/admin/permission-admin-service.js', () => ({
  adminUserService: admin.user,
  adminProfileService: admin.profile,
  adminPbsUserService: admin.pbsUser,
  adminMenuService: admin.menu,
  adminDeptService: admin.dept,
  PermissionReferenceValidationError,
}))

import permissionAdminRoutes from '../../../routes/admin/permission-admin.js'

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  ;(app as unknown as { decorate: (n: string, v: unknown) => void }).decorate('db', {})
  ;(app as unknown as { decorate: (n: string, v: unknown) => void }).decorate('redis', { get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn() })
  app.addHook('onRequest', async (req) => {
    ;(req as unknown as { authUser?: unknown }).authUser = { userCode: 'admin', userName: 'admin', schema: 'f8', isAdmin: 1, tokenVersion: 1, permVersion: 1 }
  })
  await app.register(permissionAdminRoutes, { prefix: '/api/admin' })
  return app
}

describe('permission admin routes', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp()
    return async () => app.close()
  })

  it('GET /users 返回分页列表', async () => {
    admin.user.list.mockResolvedValue({ rows: [{ id: 1, userCode: 'Taylor' }], total: 1 })
    const res = await app.inject({ method: 'GET', url: '/api/admin/users' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.total).toBe(1)
  })

  it('POST /users 密码过短 → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/admin/users',
      payload: { userCode: 'u', userName: 'U', password: 'short', branchCode: 'HQ', pyAbbr: 'U' },
    })
    expect(res.statusCode).toBe(400)
    expect(admin.user.create).not.toHaveBeenCalled()
  })

  it('POST /users 合法 → 调用 create', async () => {
    admin.user.create.mockResolvedValue({ id: 1, userCode: 'Taylor' })
    const res = await app.inject({
      method: 'POST', url: '/api/admin/users',
      payload: { userCode: 'Taylor', userName: 'Taylor', password: 'LongPass123', branchCode: 'HQ', pyAbbr: 'T' },
    })
    expect(res.statusCode).toBe(200)
    expect(admin.user.create).toHaveBeenCalled()
  })

  it('PUT /profiles/:id/menus → 调用 setMenus（权限变更）', async () => {
    admin.profile.setMenus.mockResolvedValue(['LIVE', 'LIVE_ROSTER'])
    const res = await app.inject({
      method: 'PUT', url: '/api/admin/profiles/3/menus',
      payload: { menuCodes: ['LIVE', 'LIVE_ROSTER'] },
    })
    expect(res.statusCode).toBe(200)
    expect(admin.profile.setMenus).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'f8', 3, ['LIVE', 'LIVE_ROSTER'], 'admin')
  })

  it('PUT /profiles/:id/menus rejects markup before persistence', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/admin/profiles/3/menus',
      payload: { menuCodes: ['<INVALID>'] },
    })
    expect(res.statusCode).toBe(400)
    expect(admin.profile.setMenus).not.toHaveBeenCalled()
  })

  it('PUT /profiles/:id/ctrls rejects markup before persistence', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/admin/profiles/3/ctrls',
      payload: { ctrls: [{ menuCode: 'LIVE_ROSTER', ctlCode: '<INVALID>' }] },
    })
    expect(res.statusCode).toBe(400)
    expect(admin.profile.setCtrls).not.toHaveBeenCalled()
  })

  it('PUT /profiles/:id/menus maps canonical reference rejection to 400', async () => {
    admin.profile.setMenus.mockRejectedValue(new PermissionReferenceValidationError('Unknown menu code: UNKNOWN'))
    const res = await app.inject({
      method: 'PUT', url: '/api/admin/profiles/3/menus', payload: { menuCodes: ['UNKNOWN'] },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ code: 400, message: 'Unknown menu code: UNKNOWN' })
  })

  it('PUT /profiles/:id/data-scope → 调用 setDataScope', async () => {
    admin.profile.setDataScope.mockResolvedValue({ FLEET: ['B737'] })
    const res = await app.inject({
      method: 'PUT', url: '/api/admin/profiles/3/data-scope',
      payload: { FLEET: ['B737'], RANK: [] },
    })
    expect(res.statusCode).toBe(200)
    expect(admin.profile.setDataScope).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'f8', 3, expect.objectContaining({ FLEET: ['B737'] }), 'admin')
  })

  it('POST /pbs-users/:id/disable → 调用 pbs setStatus', async () => {
    admin.pbsUser.setStatus.mockResolvedValue(undefined)
    const res = await app.inject({ method: 'POST', url: '/api/admin/pbs-users/7/disable', payload: { disabled: true } })
    expect(res.statusCode).toBe(200)
    expect(admin.pbsUser.setStatus).toHaveBeenCalledWith(expect.anything(), 7, 1, 'admin')
  })

  it('GET /departments?kind=crew → 机组部门列表', async () => {
    admin.dept.listCrewDepartments.mockResolvedValue([{ id: 1, branchCode: 'HQ_FD' }])
    const res = await app.inject({ method: 'GET', url: '/api/admin/departments?kind=crew' })
    expect(res.statusCode).toBe(200)
    expect(admin.dept.listCrewDepartments).toHaveBeenCalled()
  })

  it('GET /profiles/:id/permissions → 返回菜单/按钮/数据权限', async () => {
    admin.profile.getPermissions.mockResolvedValue({ menuCodes: ['LIVE'], ctrls: [{ menuCode: 'LIVE_ROSTER', ctlCode: 'LIVE_SAVE' }], dataScope: { FLEET: ['B737'] } })
    const res = await app.inject({ method: 'GET', url: '/api/admin/profiles/3/permissions' })
    expect(res.statusCode).toBe(200)
    expect(admin.profile.getPermissions).toHaveBeenCalledWith(expect.anything(), 3)
    expect(res.json().data.menuCodes).toEqual(['LIVE'])
  })

  it('角色成员接口支持查询、批量添加和批量移除', async () => {
    admin.profile.listUsers.mockResolvedValue([{ id: 7, userCode: 'Taylor', userName: 'Taylor' }])
    admin.profile.addUsers.mockResolvedValue([{ id: 7, userCode: 'Taylor' }])
    admin.profile.removeUsers.mockResolvedValue([])

    const list = await app.inject({ method: 'GET', url: '/api/admin/profiles/3/users' })
    const add = await app.inject({ method: 'POST', url: '/api/admin/profiles/3/users', payload: { userIds: [7, 8] } })
    const remove = await app.inject({ method: 'DELETE', url: '/api/admin/profiles/3/users', payload: { userIds: [7] } })

    expect(list.statusCode).toBe(200)
    expect(add.statusCode).toBe(200)
    expect(remove.statusCode).toBe(200)
    expect(admin.profile.addUsers).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'f8', 3, [7, 8], 'admin')
    expect(admin.profile.removeUsers).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'f8', 3, [7])
  })

  it('POST /menus/ctrls → 创建按钮', async () => {
    admin.menu.createCtrl.mockResolvedValue({ id: 1, menuCtlCode: 'BTN_X' })
    const res = await app.inject({ method: 'POST', url: '/api/admin/menus/ctrls', payload: { menuCode: 'LIVE_ROSTER', menuCtlCode: 'BTN_X', menuCtlName: 'X' } })
    expect(res.statusCode).toBe(200)
    expect(admin.menu.createCtrl).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ menuCtlCode: 'BTN_X' }), 'admin')
  })

  it('DELETE /menus/ctrls/:id → 删除按钮', async () => {
    admin.menu.removeCtrl.mockResolvedValue(undefined)
    const res = await app.inject({ method: 'DELETE', url: '/api/admin/menus/ctrls/5' })
    expect(res.statusCode).toBe(200)
    expect(admin.menu.removeCtrl).toHaveBeenCalledWith(expect.anything(), 5)
  })

  it('PATCH /departments/:id → 更新部门', async () => {
    admin.dept.updateCrewDepartment.mockResolvedValue({ id: 1, branchName: 'New' })
    const res = await app.inject({ method: 'PATCH', url: '/api/admin/departments/1?kind=crew', payload: { branchName: 'New' } })
    expect(res.statusCode).toBe(200)
    expect(admin.dept.updateCrewDepartment).toHaveBeenCalledWith(expect.anything(), 1, expect.objectContaining({ branchName: 'New' }), 'admin')
  })
})
