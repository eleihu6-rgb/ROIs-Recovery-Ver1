import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import type { RedisClientType } from 'redis'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { env } from '../../config/index.js'
import {
  crewDepartment,
  profile,
  profileAuthorization,
  profileCtrlPrivilege,
  profileMenuPrivilege,
  systemMenu,
  userDepartment,
  userProfile,
  users,
} from '../../models/index.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'
import {
  bumpPermissionVersion,
  permissionKey,
  invalidatePermissionContext,
} from '../permission/permission-service.js'
import type { DataScope } from '../../types/permission.js'

type LiveDb = NodePgDatabase<Record<string, unknown>>

export class PermissionReferenceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermissionReferenceValidationError'
  }
}

/** 初始密码重置统一入口：bcrypt 哈希 + 强制首登改密 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

// ---------------------------------------------------------------------------
// users（排班用户/系统用户）
// ---------------------------------------------------------------------------
export const adminUserService = {
  async list(db: LiveDb, page = 1, pageSize = 50) {
    const offset = (page - 1) * pageSize
    const rows = await db
      .select({
        id: users.id, userCode: users.userCode, userName: users.userName, branchCode: users.branchCode,
        gender: users.gender, email: users.email,
        status: users.status, isAdmin: users.isAdmin, isFirstLogin: users.isFirstLogin,
        passwordAccess: users.passwordAccess, portalAccess: users.portalAccess, appAccess: users.appAccess,
        effDt: users.effDt, expDt: users.expDt, updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(users.userCode)
      .limit(pageSize)
      .offset(offset)
    const total = (await db.select({ c: sql<number>`count(*)::int` }).from(users))[0]?.c ?? 0

    // 附加每个用户的角色（profile_codes）与部门名（user_department）
    const codes = rows.map((r) => r.userCode)
    const [roleRows, deptRows] = await Promise.all([
      codes.length > 0
        ? db
            .select({ userCode: userProfile.userCode, profileCode: profile.profileCode, profileName: profile.profileName })
            .from(userProfile)
            .innerJoin(profile, eq(profile.id, userProfile.profileId))
            .where(inArray(userProfile.userCode, codes))
        : Promise.resolve([]),
      codes.length > 0
        ? db
            .select({ branchCode: userDepartment.branchCode, branchName: userDepartment.branchName })
            .from(userDepartment)
            .where(inArray(userDepartment.branchCode, rows.map((r) => r.branchCode).filter(Boolean)))
        : Promise.resolve([]),
    ])
    const rolesByUser = new Map<string, string[]>()
    for (const r of roleRows) {
      const arr = rolesByUser.get(r.userCode) ?? []
      arr.push(r.profileCode ?? r.profileName ?? '')
      rolesByUser.set(r.userCode, arr)
    }
    const deptNameByCode = new Map(deptRows.map((d) => [d.branchCode, d.branchName]))
    const enriched = rows.map((r) => ({
      ...r,
      roles: rolesByUser.get(r.userCode) ?? [],
      deptName: deptNameByCode.get(r.branchCode) ?? null,
    }))
    return { rows: enriched, total }
  },

  async getById(db: LiveDb, id: number) {
    const [row] = await db
      .select({
        id: users.id, userCode: users.userCode, userName: users.userName, branchCode: users.branchCode,
        gender: users.gender, email: users.email,
        status: users.status, isAdmin: users.isAdmin, isFirstLogin: users.isFirstLogin,
        passwordAccess: users.passwordAccess, portalAccess: users.portalAccess, appAccess: users.appAccess,
        effDt: users.effDt, expDt: users.expDt, updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    return row ?? null
  },

  async create(db: LiveDb, data: { userCode: string; userName: string; password: string; branchCode: string; pyAbbr: string; gender?: string | null; email?: string | null; effDt: Date; portalAccess: string; passwordAccess: string }, username: string) {
    const passwordHash = await hashPassword(data.password)
    const [row] = await db
      .insert(users)
      .values({
        userCode: data.userCode, userName: data.userName, passwordHash,
        branchCode: data.branchCode, pyAbbr: data.pyAbbr, gender: data.gender, email: data.email,
        effDt: data.effDt, status: 0, isFirstLogin: 'Y',
        passwordAccess: data.passwordAccess, portalAccess: data.portalAccess, appAccess: 'Y',
        ...auditCreate(username),
      })
      .returning({ id: users.id, userCode: users.userCode })
    return row
  },

  async update(db: LiveDb, id: number, data: { userName?: string; branchCode?: string; gender?: string | null; email?: string | null; effDt?: Date; expDt?: Date | null; portalAccess?: string; passwordAccess?: string; appAccess?: string; status?: number }, username: string) {
    const [row] = await db.update(users).set({ ...data, ...auditUpdate(username) }).where(eq(users.id, id)).returning({ id: users.id, userCode: users.userCode })
    return row
  },

  async setStatus(db: LiveDb, id: number, status: 0 | 1, username: string) {
    // 禁用时递增 tokenVersion 使现有会话立即失效
    const [row] = await db.update(users).set({ status, tokenVersion: sql`${users.tokenVersion} + 1`, ...auditUpdate(username) }).where(eq(users.id, id)).returning({ id: users.id, userCode: users.userCode })
    return row
  },

  async resetPassword(db: LiveDb, id: number, newPassword: string, username: string) {
    const passwordHash = await hashPassword(newPassword)
    const [row] = await db.update(users).set({ passwordHash, isFirstLogin: 'Y', tokenVersion: sql`${users.tokenVersion} + 1`, ...auditUpdate(username) }).where(eq(users.id, id)).returning({ id: users.id, userCode: users.userCode })
    return row
  },

  /** 设置用户绑定的角色（全量替换）；返回最终 profileIds */
  async setProfiles(db: LiveDb, userCode: string, profileIds: number[], username: string) {
    await db.delete(userProfile).where(eq(userProfile.userCode, userCode))
    if (profileIds.length > 0) {
      await db.insert(userProfile).values(profileIds.map((profileId) => ({ userCode, profileId, ...auditCreate(username) })))
    }
    return profileIds
  },
}

// ---------------------------------------------------------------------------
// profiles（角色）—— 权限变更必须 bump permVersion + invalidate 缓存
// ---------------------------------------------------------------------------
async function invalidateUsersOfProfile(db: LiveDb, redis: RedisClientType, schema: string, profileId: number) {
  const bound = await db.select({ userCode: userProfile.userCode }).from(userProfile).where(eq(userProfile.profileId, profileId))
  await bumpPermissionVersion(redis, schema)
  await Promise.all(bound.map((b) => invalidatePermissionContext(redis, permissionKey(schema, b.userCode))))
}

export const adminProfileService = {
  async list(db: LiveDb) {
    return db.select().from(profile).orderBy(profile.idx)
  },

  async create(db: LiveDb, data: { profileName: string; profileCode?: string; filiale: string; division: string; idx?: number }, username: string) {
    const [row] = await db.insert(profile).values({ ...data, ...auditCreate(username) }).returning()
    return row
  },

  async update(db: LiveDb, id: number, data: { profileName?: string; profileCode?: string; division?: string; idx?: number }, username: string) {
    const [row] = await db.update(profile).set({ ...data, ...auditUpdate(username) }).where(eq(profile.id, id)).returning()
    return row
  },

  async remove(db: LiveDb, id: number) {
    await db.delete(profileMenuPrivilege).where(eq(profileMenuPrivilege.profileId, id))
    await db.delete(profileCtrlPrivilege).where(eq(profileCtrlPrivilege.profileId, id))
    await db.delete(profileAuthorization).where(eq(profileAuthorization.profileId, id))
    await db.delete(userProfile).where(eq(userProfile.profileId, id))
    await db.delete(profile).where(eq(profile.id, id))
  },

  async listUsers(db: LiveDb, profileId: number) {
    return db
      .select({
        id: users.id,
        userCode: users.userCode,
        userName: users.userName,
        branchCode: users.branchCode,
        status: users.status,
      })
      .from(userProfile)
      .innerJoin(users, eq(users.userCode, userProfile.userCode))
      .where(eq(userProfile.profileId, profileId))
      .orderBy(users.userCode)
  },

  async addUsers(db: LiveDb, redis: RedisClientType, schema: string, profileId: number, userIds: number[], username: string) {
    const requested = await db.select({ userCode: users.userCode }).from(users).where(inArray(users.id, userIds))
    const existing = await db.select({ userCode: userProfile.userCode }).from(userProfile).where(eq(userProfile.profileId, profileId))
    const existingCodes = new Set(existing.map((row) => row.userCode))
    const rows = requested.filter((row) => !existingCodes.has(row.userCode)).map((row) => ({ profileId, userCode: row.userCode, ...auditCreate(username) }))
    if (rows.length > 0) await db.insert(userProfile).values(rows)
    await invalidateUsersOfProfile(db, redis, schema, profileId)
    return this.listUsers(db, profileId)
  },

  async removeUsers(db: LiveDb, redis: RedisClientType, schema: string, profileId: number, userIds: number[]) {
    const requested = await db.select({ userCode: users.userCode }).from(users).where(inArray(users.id, userIds))
    const userCodes = requested.map((row) => row.userCode)
    if (userCodes.length > 0) await db.delete(userProfile).where(and(eq(userProfile.profileId, profileId), inArray(userProfile.userCode, userCodes)))
    await invalidateUsersOfProfile(db, redis, schema, profileId)
    return this.listUsers(db, profileId)
  },

  /** 设置角色菜单权限（全量替换；menuCodes=可见列表） */
  async setMenus(db: LiveDb, redis: RedisClientType, schema: string, profileId: number, menuCodes: string[], username: string) {
    const all = await db.select({ menuCode: systemMenu.menuCode, systemType: systemMenu.systemType }).from(systemMenu)
    const menus = all.filter((menu) => menu.systemType !== 'B')
    const knownCodes = new Set(menus.map((menu) => menu.menuCode))
    // Drop orphan codes (profileMenuPrivilege rows that reference menus which
    // were deleted out from under the role). Silently cleaning them up lets
    // the user save other changes without being blocked by stale rows; the
    // caller surfaces the dropped list so the operator sees what was removed.
    const validCodes = menuCodes.filter((code) => knownCodes.has(code))
    const droppedCodes = menuCodes.filter((code) => !knownCodes.has(code))

    await db.delete(profileMenuPrivilege).where(eq(profileMenuPrivilege.profileId, profileId))
    if (validCodes.length > 0) {
      await db.insert(profileMenuPrivilege).values(validCodes.map((menuCode) => ({ profileId, menuCode, isHidden: 'N', ...auditCreate(username) })))
    }
    // 未授予的菜单显式标记隐藏（is_hidden=Y），语义明确
    const hidden = menus.map((menu) => menu.menuCode).filter((menuCode) => !validCodes.includes(menuCode))
    if (hidden.length > 0) {
      await db.insert(profileMenuPrivilege).values(hidden.map((menuCode) => ({ profileId, menuCode, isHidden: 'Y', ...auditCreate(username) })))
    }
    await invalidateUsersOfProfile(db, redis, schema, profileId)
    return { menuCodes: validCodes, droppedCodes }
  },

  /** 设置角色按钮权限（全量替换；keys = [{menuCode, ctlCode}]） */
  async setCtrls(db: LiveDb, redis: RedisClientType, schema: string, profileId: number, ctrls: { menuCode: string; ctlCode: string }[], username: string) {
    const buttons = await db
      .select({ menuCode: systemMenu.menuCode, parentMenuCode: systemMenu.parentMenuCode, systemType: systemMenu.systemType })
      .from(systemMenu)
    const knownPairs = new Set(
      buttons
        .filter((button) => button.systemType === 'B')
        .map((button) => `${button.parentMenuCode}\u0000${button.menuCode}`),
    )
    // Drop orphan ctrl pairs (deleted-menu orphans), same rationale as setMenus.
    const validCtrls = ctrls.filter((ctrl) => knownPairs.has(`${ctrl.menuCode}\u0000${ctrl.ctlCode}`))
    const droppedCtrls = ctrls.filter((ctrl) => !knownPairs.has(`${ctrl.menuCode}\u0000${ctrl.ctlCode}`))

    await db.delete(profileCtrlPrivilege).where(eq(profileCtrlPrivilege.profileId, profileId))
    if (validCtrls.length > 0) {
      await db.insert(profileCtrlPrivilege).values(validCtrls.map((c) => ({ profileId, menuCode: c.menuCode, menuCtlCode: c.ctlCode, isHidden: 'N', ...auditCreate(username) })))
    }
    await invalidateUsersOfProfile(db, redis, schema, profileId)
    return { ctrls: validCtrls, droppedCtrls }
  },

  /** 设置角色数据权限（按维度 upsert profile_authorization） */
  async setDataScope(db: LiveDb, redis: RedisClientType, schema: string, profileId: number, scope: DataScope, username: string) {
    await db.delete(profileAuthorization).where(eq(profileAuthorization.profileId, profileId))
    const entries = Object.entries(scope).filter(([, v]) => v.length > 0) as [keyof DataScope, string[]][]
    if (entries.length > 0) {
      await db.insert(profileAuthorization).values(entries.map(([authType, authValues]) => ({ profileId, authType, authValues, ...auditCreate(username) })))
    }
    await invalidateUsersOfProfile(db, redis, schema, profileId)
    return scope
  },

  /** 读取角色当前权限配置（菜单/按钮/数据范围） */
  async getPermissions(db: LiveDb, profileId: number) {
    const [menus, ctrls, auths] = await Promise.all([
      db.select({ menuCode: profileMenuPrivilege.menuCode, isHidden: profileMenuPrivilege.isHidden }).from(profileMenuPrivilege).where(eq(profileMenuPrivilege.profileId, profileId)),
      db.select({ menuCode: profileCtrlPrivilege.menuCode, ctlCode: profileCtrlPrivilege.menuCtlCode, isHidden: profileCtrlPrivilege.isHidden }).from(profileCtrlPrivilege).where(eq(profileCtrlPrivilege.profileId, profileId)),
      db.select({ authType: profileAuthorization.authType, authValues: profileAuthorization.authValues }).from(profileAuthorization).where(eq(profileAuthorization.profileId, profileId)),
    ])
    const dataScope: DataScope = { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }
    for (const a of auths) {
      if (a.authType in dataScope && Array.isArray(a.authValues)) {
        dataScope[a.authType as keyof DataScope] = (a.authValues as unknown[]).filter((v): v is string => typeof v === 'string')
      }
    }
    return {
      menuCodes: menus.filter((m) => m.isHidden !== 'Y').map((m) => m.menuCode),
      ctrls: ctrls.filter((c) => c.isHidden !== 'Y').map((c) => ({ menuCode: c.menuCode, ctlCode: c.ctlCode })),
      dataScope,
    }
  },
}

// ---------------------------------------------------------------------------
// pbs_user（机组账号）—— 用限定 schema 名访问 pbs 库
// ---------------------------------------------------------------------------
const pbsUserTable = `${env.PBS_SCHEMA}.pbs_user`

export const adminPbsUserService = {
  async list(db: LiveDb, page = 1, pageSize = 50, filter?: { crewId?: string; base?: string; rank?: string; status?: number }) {
    const offset = (page - 1) * pageSize
    const where = [
      filter?.crewId ? sql`p.crew_id ilike ${`%${filter.crewId}%`}` : undefined,
      filter?.base ? sql`cb.base = ${filter.base}` : undefined,
      filter?.rank ? sql`cr.rank = ${filter.rank}` : undefined,
      filter?.status !== undefined ? sql`p.status = ${filter.status}` : undefined,
    ].filter(Boolean)
    const cond = where.length > 0 ? sql` where ${sql.join(where, sql` and `)}` : sql``
    const activeAssignmentJoins = sql`
      left join lateral (
        select base
        from ${sql.raw(`${env.LIVE_SCHEMA}.crew_base`)}
        where crew_id = p.crew_id
          and eff_dt <= now()
          and (exp_dt is null or exp_dt >= now())
        order by is_prime_base desc, eff_dt desc, id desc
        limit 1
      ) cb on true
      left join lateral (
        select rank
        from ${sql.raw(`${env.LIVE_SCHEMA}.crew_rank`)}
        where crew_id = p.crew_id
          and eff_dt <= now()
          and (exp_dt is null or exp_dt >= now())
        order by eff_dt desc, id desc
        limit 1
      ) cr on true
    `
    const rows = await db.execute(sql`
      select p.id, p.crew_id as "crewId", p.user_code as "userCode", p.user_name as "userName", p.status,
             cb.base, cr.rank, p.division,
             p.email, p.tel, p.branch_code as "branchCode", p.py_abbr as "pyAbbr", p.gender,
             p.eff_dt as "effDt", p.exp_dt as "expDt",
             p.last_login_at as "lastLoginAt", p.locked_until as "lockedUntil"
      from ${sql.raw(pbsUserTable)} p ${activeAssignmentJoins} ${cond}
      order by p.crew_id
      limit ${pageSize} offset ${offset}
    `)
    const total = await db.execute(sql`select count(*)::int as c from ${sql.raw(pbsUserTable)} p ${activeAssignmentJoins} ${cond}`)
    return { rows: rows.rows as Record<string, unknown>[], total: Number((total.rows as { c: number }[])[0]?.c ?? 0) }
  },

  async setStatus(db: LiveDb, id: number, status: 0 | 1, username: string) {
    await db.execute(sql`
      update ${sql.raw(pbsUserTable)} set status = ${status}, token_version = token_version + 1,
        updated_by = ${username}, updated_at = now() where id = ${id}
    `)
  },

  async resetPassword(db: LiveDb, id: number, newPassword: string, username: string) {
    const passwordHash = await hashPassword(newPassword)
    await db.execute(sql`
      update ${sql.raw(pbsUserTable)} set password_hash = ${passwordHash}, is_first_login = 'Y',
        token_version = token_version + 1, updated_by = ${username}, updated_at = now() where id = ${id}
    `)
  },
}

// ---------------------------------------------------------------------------
// menus（系统菜单 + 按钮）
// ---------------------------------------------------------------------------
export const adminMenuService = {
  async tree(db: LiveDb) {
    const menus = await db.select().from(systemMenu).where(ne(systemMenu.systemType, 'B')).orderBy(systemMenu.idx)
    const ctrls = await db.select().from(systemMenu).where(eq(systemMenu.systemType, 'B')).orderBy(systemMenu.idx)
    const ctrlMap = new Map<string, typeof systemMenu.$inferSelect[]>()
    for (const c of ctrls) {
      const arr = ctrlMap.get(c.parentMenuCode) ?? []
      arr.push(c)
      ctrlMap.set(c.parentMenuCode, arr)
    }
    return menus.map((m) => ({
      ...m,
      ctrls: (ctrlMap.get(m.menuCode) ?? []).map((c) => ({
        ...c,
        menuCtlCode: c.menuCode,
        menuCtlName: c.menuName,
      })),
    }))
  },

  async createMenu(db: LiveDb, data: { menuCode: string; menuName: string; parentMenuCode: string; factoryName?: string | null; systemType: string; idx?: number; apiUris?: string | null; icon?: string | null }, username: string) {
    const [row] = await db.insert(systemMenu).values({ ...data, ...auditCreate(username) }).returning()
    return row
  },

  async updateMenu(db: LiveDb, id: number, data: { menuName?: string; parentMenuCode?: string; factoryName?: string | null; idx?: number; apiUris?: string | null; isHidden?: string; icon?: string | null }, username: string) {
    const [row] = await db.update(systemMenu).set({ ...data, ...auditUpdate(username) }).where(eq(systemMenu.id, id)).returning()
    return row
  },

  async removeMenu(db: LiveDb, id: number) {
    const m = (await db.select({ menuCode: systemMenu.menuCode }).from(systemMenu).where(eq(systemMenu.id, id)))[0]
    if (m) {
      await db.delete(profileMenuPrivilege).where(eq(profileMenuPrivilege.menuCode, m.menuCode))
      await db.delete(systemMenu).where(and(eq(systemMenu.parentMenuCode, m.menuCode), eq(systemMenu.systemType, 'B')))
    }
    await db.delete(systemMenu).where(eq(systemMenu.id, id))
  },

  async createCtrl(db: LiveDb, data: { menuCode: string; menuCtlCode: string; menuCtlName: string; idx?: number; icon?: string | null; apiUris?: string | null }, username: string) {
    const [row] = await db.insert(systemMenu).values({
      menuCode: data.menuCtlCode,
      menuName: data.menuCtlName,
      parentMenuCode: data.menuCode,
      systemType: 'B',
      idx: data.idx,
      icon: data.icon,
      apiUris: data.apiUris,
      ...auditCreate(username),
    }).returning()
    return { ...row, menuCtlCode: row.menuCode, menuCtlName: row.menuName }
  },

  async updateCtrl(db: LiveDb, id: number, data: { menuCtlName?: string; idx?: number; icon?: string | null; apiUris?: string | null }, username: string) {
    const [row] = await db.update(systemMenu).set({
      menuName: data.menuCtlName,
      idx: data.idx,
      icon: data.icon,
      apiUris: data.apiUris,
      ...auditUpdate(username),
    }).where(and(eq(systemMenu.id, id), eq(systemMenu.systemType, 'B'))).returning()
    return { ...row, menuCtlCode: row.menuCode, menuCtlName: row.menuName }
  },

  async removeCtrl(db: LiveDb, id: number) {
    await db.delete(systemMenu).where(and(eq(systemMenu.id, id), eq(systemMenu.systemType, 'B')))
  },
}

// ---------------------------------------------------------------------------
// departments（user_department + crew_department）
// ---------------------------------------------------------------------------
export const adminDeptService = {
  async listUserDepartments(db: LiveDb) {
    return db.select().from(userDepartment).orderBy(userDepartment.idx)
  },
  async listCrewDepartments(db: LiveDb) {
    return db.select().from(crewDepartment).orderBy(crewDepartment.idx)
  },
  async createUserDepartment(db: LiveDb, data: { branchCode: string; branchName: string; parentCode?: string | null; division?: string | null; filiale?: string | null; idx?: number }, username: string) {
    const [row] = await db.insert(userDepartment).values({ ...data, ...auditCreate(username) }).returning()
    return row
  },
  async createCrewDepartment(db: LiveDb, data: { branchCode: string; branchName: string; parentCode?: string | null; division?: string | null; filiale?: string | null; idx?: number }, username: string) {
    const [row] = await db.insert(crewDepartment).values({ ...data, ...auditCreate(username) }).returning()
    return row
  },
  async updateUserDepartment(db: LiveDb, id: number, data: { branchCode?: string; branchName?: string; parentCode?: string | null; division?: string | null; idx?: number }, username: string) {
    const [row] = await db.update(userDepartment).set({ ...data, ...auditUpdate(username) }).where(eq(userDepartment.id, id)).returning()
    return row
  },
  async updateCrewDepartment(db: LiveDb, id: number, data: { branchCode?: string; branchName?: string; parentCode?: string | null; division?: string | null; idx?: number }, username: string) {
    const [row] = await db.update(crewDepartment).set({ ...data, ...auditUpdate(username) }).where(eq(crewDepartment.id, id)).returning()
    return row
  },
  async removeUserDepartment(db: LiveDb, id: number) {
    await db.delete(userDepartment).where(eq(userDepartment.id, id))
  },
  async removeCrewDepartment(db: LiveDb, id: number) {
    await db.delete(crewDepartment).where(eq(crewDepartment.id, id))
  },
}
