# 权限控制系统 — P0+P1 后端基础实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立角色（profile）驱动的权限后端：数据模型迁移、菜单 seed 重建、权限解析/鉴权/me 下发、可选项收窄，全部经 Vitest 验收且不劣化现有接口性能。

**Architecture:** 复用老表（5 项已审批结构变更）；登录时解析权限上下文写 Redis，请求时经内存 TTL 缓存读取（微秒级）；鉴权插件用 api_uris 双索引（`system_menu.api_uris` 读接口 + `system_menu_ctrl.api_uris` 动作接口）做路径匹配门禁；本轮 Gantt 数据加载不加数据过滤，数据权限只收窄查询界面可选项。

**Tech Stack:** Fastify + Drizzle ORM + PostgreSQL 16 + Redis + Vitest；TypeScript（live-server）。

## Global Constraints

- 复用老表；新表/新字段一律需审批。本轮仅允许 5 项结构变更：`profile_authorization.auth_values→jsonb`、删 `profile_authorization_detail`、`department→crew_department`、`profile.profile_code`、`system_menu.api_uris`
- 权限存 Redis（JWT 只带 `{userCode,userName,schema,isAdmin,tokenVersion,permVersion}`），不用 route meta，用 api_uris 匹配
- 数据权限维度组合：维度内 OR、维度间 AND、未配置维度不限；User Department 非数据维度
- 本轮 Gantt（Live/Scenario）后端数据加载**不设过滤**；可选项收窄只影响下拉数据源，**不强制过滤实际加载数据**
- `system_menu_ctrl` 覆盖**所有弹窗内按钮**（含确认/提交/导出）
- seed 预设初始 `profile_code`：Administrator / RosterPlanner / Viewer 等
- 权限校验必须内存级（Map 查找），不得影响现有接口请求响应速度；`is_admin=1` 短路；未列入索引的接口放行（fail-open）
- 所有 SQL 操作走远端 PostgreSQL（`DATABASE_URL_F8` 等 env 注入，见 `.env.example`）；`sql/schema/` 已确认建表脚本不改，本轮只新增 `sql/migration/` 脚本
- UI 语言英文；代码风格遵循 `CLAUDE.md` §TypeScript 通用规范
- 测试纪律：后端 Vitest 单测/集成测试；性能基准测试必须贴 p50/p99 结果（§No-Illusion）
- §Minimal-First / §Surgical：只动任务所需文件，不顺手重构

---

### Task 1: 数据模型变更 + Drizzle model 更新

**Files:**
- Create: `sql/migration/2026-08-11-permission-model.sql`
- Modify: `live-server/src/models/system/profile.ts`（authValues jsonb、删 detail、加 profileCode）
- Modify: `live-server/src/models/system/system-menu.ts`（加 apiUris）
- Modify: `live-server/src/models/base/department.ts` → rename 到 `crew-department.ts`（表 `crew_department`）
- Modify: `live-server/src/models/index.ts`（导出调整）
- Test: `live-server/src/__tests__/scripts/migration-verify.test.ts`（新建）

**Interfaces:**
- Consumes: 现有 `profile` / `profileAuthorization` / `systemMenu` / `department` model
- Produces: `profileCode: varchar('profile_code')`；`authValues: jsonb`；删除 `profileAuthorizationDetail`；`crewDepartment = pgTable('crew_department', ...)`；`apiUris: varchar('api_uris')`

- [ ] **Step 1: 写迁移脚本** `sql/migration/2026-08-11-permission-model.sql`（幂等，可回滚注释标明）

```sql
-- ① auth_values varchar(3000) → jsonb（逗号分隔 → jsonb 数组）
ALTER TABLE profile_authorization ALTER COLUMN auth_values TYPE jsonb
USING (CASE WHEN auth_values IS NULL OR auth_values = '' THEN '[]'::jsonb
            ELSE jsonb_build_array(regexp_split_to_table(auth_values, ',')) END);
-- 注意：正则拆分后逐行聚合，上面 USING 需改为子查询形式，见下方说明

-- ② 删 detail 表
DROP TABLE IF EXISTS profile_authorization_detail;

-- ③ department → crew_department
ALTER TABLE department RENAME TO crew_department;
ALTER INDEX IF EXISTS uq_department_code RENAME TO uq_crew_department_code;

-- ④ profile.profile_code
ALTER TABLE profile ADD COLUMN IF NOT EXISTS profile_code varchar(50);
-- 回填：老 seed 的 Administrator/RosterPlanner/Viewer 由 Step 3 的 seed 处理；此处先置空允许 null

-- ⑤ system_menu.api_uris
ALTER TABLE system_menu ADD COLUMN IF NOT EXISTS api_uris varchar(2000);
```

> ⚠️ ① 的 USING 表达式在 PG 里需用 `regexp_split_to_table` 配合聚合，不能直接在 `ALTER ... USING` 里展开成数组。正确写法：
> ```sql
> UPDATE profile_authorization
> SET auth_values = (
>   SELECT coalesce(jsonb_agg(trim(x)), '[]'::jsonb)
>   FROM regexp_split_to_table(nullif(auth_values::text,''), ',') AS x
>   WHERE trim(x) <> ''
> ) WHERE auth_values IS NOT NULL;
> ALTER TABLE profile_authorization ALTER COLUMN auth_values TYPE jsonb;
> ```

- [ ] **Step 2: 更新 Drizzle models**（`profile.ts`）

```ts
export const profile = pgTable('profile', {
  // ...现有字段不变
  profileCode: varchar('profile_code', { length: 50 }),
})

export const profileAuthorization = pgTable('profile_authorization', {
  // ...现有字段不变
  authValues: jsonb('auth_values').notNull(),   // varchar → jsonb
})

// 删除 export const profileAuthorizationDetail 整段
```

- [ ] **Step 3: 更新 system-menu model**（`system-menu.ts`）

```ts
export const systemMenu = pgTable('system_menu', {
  // ...现有字段不变
  apiUris: varchar('api_uris', { length: 2000 }),
})
```

- [ ] **Step 4: 重命名 department model → crew-department.ts**（`models/base/department.ts` → `models/base/crew-department.ts`）

```ts
import { pgTable, bigint, varchar, smallint, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
export const crewDepartment = pgTable('crew_department', {
  // ...原 department 字段不变
})
export type CrewDepartment = typeof crewDepartment.$inferSelect
export type NewCrewDepartment = typeof crewDepartment.$inferInsert
```

- [ ] **Step 5: 更新所有 `department` 引用到 `crewDepartment` / `crew_department`**（grep 逐个改）
  - `live-server/src/models/index.ts`：`export * from './base/crew-department.js'`，删 `./base/department.js`
  - `live-server/src/routes/base/department.ts` → `crew-department.ts`（路由路径 `/crew-department`，见 Task 2 决策或保持 `/department` 由用户定）
  - `live-server/src/services/base/department-service.ts` → `crew-department-service.ts`
  - `live-server/src/services/data/data-save-service.ts`、`live-server/src/routes/data/index.ts` 里的 `department` 表引用改 `crewDepartment`
  - `live-server/src/models/system/users.ts` 若引用 department 同步改

- [ ] **Step 6: 编译 + 单测跑通**

Run: `cd live-server && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: 远端 DB 迁移验证（§Remote-DB-Only）**

Run: `cd live-server && node --env-file=.env -e "用 pg 连 DATABASE_URL_F8 执行迁移脚本（prepare-only 校验）"`（或用 psql 连接远端执行 `\i`）
Expected: 脚本幂等可重复执行；`\d crew_department` 存在；`profile_authorization.auth_values` 为 jsonb

> ⚠️ 真正对远端库执行 `ALTER` 属写操作，执行前须与团队确认目标环境（默认 DEV `f8` schema）。此步骤可用 `EXPLAIN` 或最小只读验证替代，迁移执行单独走发布流程。

- [ ] **Step 8: Commit**

```bash
git add sql/migration/2026-08-11-permission-model.sql live-server/src/models/
git commit -m "feat(perm): migrate permission data model (jsonb auth, crew_department rename, profile_code, system_menu.api_uris)"
```

---

### Task 2: 菜单盘点 + seed 重建

**Files:**
- Modify: `sql/seed/05-system-menu.sql`（**整文件重写**：清理旧树，重建 3 级菜单 + 全按钮）
- Modify: `sql/seed/06-profile.sql`（预设 profile_code：Administrator / RosterPlanner / Viewer）
- Create: `docs/modules/live-server/permission-menu-inventory.md`（菜单盘点清单文档）
- Test: `live-server/src/__tests__/scripts/seed-verify.test.ts`（新建，校验 seed 引用的 menu_code 不悬空）

**Interfaces:**
- Consumes: §6.1 菜单树结构（spec）；真实 gantt 组件源码（按钮枚举来源）
- Produces: 新 `system_menu`（3 级）+ `system_menu_ctrl`（全按钮）+ `profile.profile_code` 预设；盘点文档

- [ ] **Step 1: 枚举 gantt 顶部 Tab 与页面/子视图**，输出盘点文档初稿

对照 `gantt/src/components/shell/shell-top-nav.tsx`（NAV_ITEMS）与 `gantt/src/components/shell/shell-sidebar.tsx`（LIVE_MENU/DATA_MENU/scenario/legality/system/pbs 子项），列出：一级 Tab、二级页面、三级子视图，逐个定 `menu_code`（`模块_页面[_子视图]` 语义）+ `factory_name`（对应视图组件名）。

- [ ] **Step 2: 逐页枚举按钮（含弹窗内）** 到盘点文档

对每个二级/三级页面，读其组件源码收集按钮：工具栏按钮 + 弹窗内按钮（AppDialog footer 主操作/取消、确认/提交/导出等）。每个按钮定 `menu_ctl_code`（BTN_*）+ `api_uris`（调用的后端接口路径，含 method）。**必须覆盖所有弹窗内按钮。**

- [ ] **Step 3: 逐页枚举读接口 → `system_menu.api_uris`**

对每个页面，读其数据加载调用（services/api 路径），把读接口列表填入对应菜单行 `api_uris`（逗号分隔，支持 `/api/path*` 通配）。

- [ ] **Step 4: 重写 `sql/seed/05-system-menu.sql`**（幂等，`ON CONFLICT DO NOTHING`）

按 §6.1 树结构生成；保持现有唯一索引 `uq_system_menu_code` / `uq_system_menu_ctrl_code`。示例（一个叶子菜单 + 其按钮）：

```sql
create unique index if not exists uq_system_menu_code on system_menu (menu_code);
create unique index if not exists uq_system_menu_ctrl_code on system_menu_ctrl (menu_code, menu_ctl_code);

INSERT INTO system_menu (menu_code, menu_name, parent_menu_code, factory_name, system_type, idx, api_uris) VALUES
    ('LIVE', 'Live / 排班', 'ROOT', '', 'S', 2)
ON CONFLICT (menu_code) DO NOTHING;

INSERT INTO system_menu (menu_code, menu_name, parent_menu_code, factory_name, system_type, idx, api_uris) VALUES
    ('LIVE_ROSTER', 'Roster / 排班甘特', 'LIVE', 'RosterView', 'S', 1,
     '/api/gantt/gantt-data*,/api/roster*,/api/crew*,/api/pairing*,/api/flight*')
ON CONFLICT (menu_code) DO NOTHING;

INSERT INTO system_menu_ctrl (menu_code, menu_ctl_code, menu_ctl_name, idx, api_uris) VALUES
    ('LIVE_ROSTER', 'BTN_ASSIGN',   'Assign / 分配',   1, '/api/roster/assign'),
    ('LIVE_ROSTER', 'BTN_UNASSIGN', 'Unassign / 取消', 2, '/api/roster/unassign'),
    ('LIVE_ROSTER', 'BTN_SWAP',     'Swap / 交换',     3, '/api/roster/swap'),
    ('LIVE_ROSTER', 'BTN_SAVE',     'Save / 保存',     4, '/api/draft/save'),
    ('LIVE_ROSTER', 'BTN_EXPORT',   'Export / 导出',   5, '/api/roster/export')
ON CONFLICT (menu_code, menu_ctl_code) DO NOTHING;
```

> ⚠️ 上面的 `LIVE_ROSTER.api_uris` 为示意。真实值必须来自 Step 3 的枚举结果，且**不得把本轮不设过滤的 Gantt 数据读接口漏掉**（漏了会导致它们 fail-open——可接受；但绝不能把读接口配到错误菜单导致误伤）。

- [ ] **Step 5: 更新 `sql/seed/06-profile.sql` 预设 profile_code**

在 profile INSERT 中加 `profile_code`：`('Administrator','Administrator','P',1)`、`('RosterPlanner-P','Roster Planner - Pilot','P',2)`、`('RosterPlanner-C',...)`、`('Viewer-P',...)`、`('Viewer-C',...)`（on conflict 语义与现有 `uq_profile_name` 一致）。

- [ ] **Step 6: 写 seed 校验测试** `seed-verify.test.ts`

```ts
// 读 05/06 seed 的 INSERT 列表，断言：
// 1) system_menu_ctrl.menu_code 都能在 system_menu 找到（无悬空按钮）
// 2) system_menu.api_uris / system_menu_ctrl.api_uris 非空（除纯容器节点）
// 3) 每个顶层菜单下至少一个叶子菜单
```

Run: `cd live-server && npx vitest run src/__tests__/scripts/seed-verify.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add sql/seed/05-system-menu.sql sql/seed/06-profile.sql docs/modules/live-server/permission-menu-inventory.md
git commit -m "feat(perm): rebuild menu/ctrl seed from real gantt UI + preset profile_code"
```

---

### Task 3: 权限上下文解析服务 + Redis 缓存

**Files:**
- Create: `live-server/src/services/permission/permission-context.ts`（类型 + 解析逻辑）
- Create: `live-server/src/services/permission/permission-cache.ts`（Redis 读写 + 内存 TTL 缓存）
- Create: `live-server/src/services/permission/permission-service.ts`（入口：`getPermissionContext(db, redis, userCode)`）
- Test: `live-server/src/__tests__/services/permission-context.test.ts`
- Test: `live-server/src/__tests__/services/permission-cache.test.ts`

**Interfaces:**
- Consumes: `users` / `user_profile` / `profile` / `profile_menu_privilege` / `profile_ctrl_privilege` / `profile_authorization` models；`env.JWT_SECRET`；Redis client
- Produces:
```ts
export interface DataScope { FILIALE: string[]; DIVISION: string[]; CREW_DEPARTMENT: string[]; RANK: string[]; FLEET: string[] }
export interface PermissionContext {
  menus: string[]
  ctrls: Record<string, string[]>
  dataScope: DataScope
  permVersion: number
}
export const EMPTY_SCOPE: DataScope  // 全空数组 = 维度不限
export const buildPermissionContext: (rows: PermissionRow[]) => PermissionContext
export const resolvePermissionContext: (db, userCode) => Promise<PermissionContext>
export const loadPermissionContext: (redis, key) => Promise<PermissionContext | null>
export const storePermissionContext: (redis, key, ctx, ttlSec) => Promise<void>
export const invalidatePermissionContext: (redis, key) => Promise<void>
export class PermissionCache { get(key, loadFn): Promise<PermissionContext>; invalidate(key): void }  // 内存 TTL
```

- [ ] **Step 1: 写解析逻辑失败测试** `permission-context.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { buildPermissionContext, EMPTY_SCOPE } from '../../../services/permission/permission-context.js'

describe('buildPermissionContext', () => {
  it('合并多角色菜单/按钮并集', () => {
    const rows = [
      { profileId: 1, menuCode: 'LIVE', menuHidden: null, ctlCode: null, ctlHidden: null, authType: null, authValues: null },
      { profileId: 1, menuCode: 'LIVE_ROSTER', menuHidden: null, ctlCode: 'BTN_ASSIGN', ctlHidden: null, authType: null, authValues: null },
      { profileId: 2, menuCode: 'DATA', menuHidden: null, ctlCode: null, ctlHidden: null, authType: null, authValues: null },
    ]
    const ctx = buildPermissionContext(rows)
    expect(ctx.menus).toContain('LIVE_ROSTER')
    expect(ctx.menus).toContain('DATA')
    expect(ctx.ctrls.LIVE_ROSTER).toContain('BTN_ASSIGN')
  })
  it('is_hidden=Y 不进入权限', () => {
    const ctx = buildPermissionContext([{ profileId: 1, menuCode: 'SECRET', menuHidden: 'Y', ctlCode: null, ctlHidden: null, authType: null, authValues: null }])
    expect(ctx.menus).not.toContain('SECRET')
  })
  it('数据权限并集 + 未配置维度为空数组', () => {
    const ctx = buildPermissionContext([
      { profileId: 1, menuCode: null, menuHidden: null, ctlCode: null, ctlHidden: null, authType: 'FLEET', authValues: ['B737', 'A320'] },
      { profileId: 1, menuCode: null, menuHidden: null, ctlCode: null, ctlHidden: null, authType: 'DIVISION', authValues: ['P'] },
    ])
    expect(ctx.dataScope.FLEET).toEqual(['B737', 'A320'])
    expect(ctx.dataScope.RANK).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd live-server && npx vitest run src/__tests__/services/permission-context.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `permission-context.ts`**

```ts
import type { DataScope, PermissionContext } from '../../types/permission.js'

export const EMPTY_SCOPE: DataScope = { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }
export const AUTH_DIMENSIONS = ['FILIALE', 'DIVISION', 'CREW_DEPARTMENT', 'RANK', 'FLEET'] as const

export interface PermissionRow {
  profileId: number
  menuCode: string | null
  menuHidden: string | null
  ctlCode: string | null
  ctlHidden: string | null
  authType: string | null
  authValues: unknown | null
}

export function buildPermissionContext(rows: PermissionRow[]): PermissionContext {
  const menus = new Set<string>()
  const ctrls: Record<string, Set<string>> = {}
  const dataScope: DataScope = { ...EMPTY_SCOPE }
  for (const r of rows) {
    if (r.menuCode && r.menuHidden !== 'Y') menus.add(r.menuCode)
    if (r.ctlCode && r.ctlHidden !== 'Y') {
      if (r.menuCode) (ctrls[r.menuCode] ??= new Set()).add(r.ctlCode)
    }
    if (r.authType && AUTH_DIMENSIONS.includes(r.authType as (typeof AUTH_DIMENSIONS)[number]) && Array.isArray(r.authValues)) {
      const key = r.authType as keyof DataScope
      for (const v of r.authValues) if (typeof v === 'string' && v) (dataScope[key] as string[]).push(v)
    }
  }
  return {
    menus: [...menus],
    ctrls: Object.fromEntries(Object.entries(ctrls).map(([k, s]) => [k, [...s]])),
    dataScope,
    permVersion: 1,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd live-server && npx vitest run src/__tests__/services/permission-context.test.ts`
Expected: PASS

- [ ] **Step 5: 写 Redis/内存缓存测试** `permission-cache.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'
import { PermissionCache } from '../../../services/permission/permission-cache.js'

describe('PermissionCache', () => {
  it('TTL 内只加载一次，invalidate 后重新加载', async () => {
    const load = vi.fn(async () => ({ version: 1 }))
    const cache = new PermissionCache(60_000)
    await cache.get('u1', load)
    await cache.get('u1', load)
    expect(load).toHaveBeenCalledTimes(1)
    cache.invalidate('u1')
    await cache.get('u1', load)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 6: 实现 `permission-cache.ts`**（内存 TTL Map，get 时按 key+TTL 懒失效；invalidate 删键）

```ts
interface Entry<V> { value: V; expiresAt: number }
export class PermissionCache<V> {
  private map = new Map<string, Entry<V>>()
  constructor(private ttlMs: number) {}
  async get(key: string, load: () => Promise<V>): Promise<V> {
    const now = Date.now()
    const hit = this.map.get(key)
    if (hit && hit.expiresAt > now) return hit.value
    const value = await load()
    this.map.set(key, { value, expiresAt: now + this.ttlMs })
    return value
  }
  invalidate(key: string): void { this.map.delete(key) }
}
```

- [ ] **Step 7: 实现 `permission-service.ts`（`resolvePermissionContext` + Redis 读写）**

`resolvePermissionContext`：一条 SQL（LEFT JOIN `user_profile→profile→profile_menu_privilege`、`profile_ctrl_privilege`、`profile_authorization`）取 `is_admin` 与该用户全部权限行；`is_admin=1` 返回全放行上下文（`ALL_ACCESS`：menus 含全部、ctrls 全放行、dataScope 全空=不限）。
`loadPermissionContext`/`storePermissionContext`/`invalidatePermissionContext`：Redis key `perm:{schema}:{userCode}`，value 为 JSON 序列化 `PermissionContext`。

- [ ] **Step 8: 跑全测试**

Run: `cd live-server && npx vitest run src/__tests__/services/permission-*.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add live-server/src/services/permission/ live-server/src/types/permission.ts
git commit -m "feat(perm): permission context resolver + Redis/memory cache"
```

---

### Task 4: api_uris 索引 + 鉴权插件

**Files:**
- Create: `live-server/src/services/permission/api-uri-index.ts`
- Create: `live-server/src/plugins/permission.ts`
- Modify: `live-server/src/index.ts`（注册 permission 插件，在 auth 之后）
- Test: `live-server/src/__tests__/plugins/permission.test.ts`

**Interfaces:**
- Consumes: `PermissionContext`（Task 3）；`system_menu.apiUris` / `system_menu_ctrl.apiUris` 表；`request.authUser`
- Produces:
```ts
export interface ApiRule { pattern: string; menuCode: string | null; ctlCode: string | null }
export const matchApiRule: (rules: ApiRule[], normalizedPath: string) => ApiRule | null
export const normalizeApiPath: (rawPath: string) => string   // '/altair/live/...' → '/api/...'
export const loadApiRules: (db) => Promise<ApiRule[]>
export default fp(async (fastify) => { /* permission 插件 */ })
```

- [ ] **Step 1: 写 `matchApiRule` / `normalizeApiPath` 失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { matchApiRule, normalizeApiPath, type ApiRule } from '../../../services/permission/api-uri-index.js'

describe('normalizeApiPath', () => {
  it('去掉 /altair/live 前缀', () => {
    expect(normalizeApiPath('/altair/live/api/roster/assign')).toBe('/api/roster/assign')
  })
  it('已带 /api 的不动', () => {
    expect(normalizeApiPath('/api/crew')).toBe('/api/crew')
  })
})
describe('matchApiRule', () => {
  const rules: ApiRule[] = [
    { pattern: '/api/roster/assign', menuCode: 'LIVE_ROSTER', ctlCode: 'BTN_ASSIGN' },
    { pattern: '/api/crew*', menuCode: 'DATA_CREW_MASTER', ctlCode: null },
  ]
  it('精确命中 ctrl 规则', () => {
    expect(matchApiRule(rules, '/api/roster/assign')).toEqual(rules[0])
  })
  it('通配命中读接口规则', () => {
    expect(matchApiRule(rules, '/api/crew/123')).toEqual(rules[1])
  })
  it('无命中返回 null', () => {
    expect(matchApiRule(rules, '/api/pairing')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败** → `npx vitest run src/__tests__/services/api-uri-index.test.ts`（新建此测试文件）

- [ ] **Step 3: 实现 `api-uri-index.ts`**

```ts
const STRIP_PREFIX = /^\/[a-z0-9-]+(\/live|\/rule|\/engine|\/ai)?(?=\/api\/)/i

export function normalizeApiPath(rawPath: string): string {
  const p = rawPath.split('?')[0]
  // /altair/live/api/x → /api/x；/api/x 不变
  const m = p.match(/^\/([^/]+)\/live\/api\//i)
  return m ? p.slice(m[0].length - 5) : p   // 保留 /api 前缀
}

export function matchApiRule(rules: ApiRule[], path: string): ApiRule | null {
  for (const r of rules) {
    const re = new RegExp('^' + r.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
    if (re.test(path)) return r
  }
  return null
}

export async function loadApiRules(db): Promise<ApiRule[]> {
  const menus = await db.select({ apiUris: systemMenu.apiUris, menuCode: systemMenu.menuCode })
    .from(systemMenu).where(isNotNull(systemMenu.apiUris))
  const ctls = await db.select({ apiUris: systemMenuCtrl.apiUris, menuCode: systemMenuCtrl.menuCode, ctlCode: systemMenuCtrl.menuCtlCode })
    .from(systemMenuCtrl).where(isNotNull(systemMenuCtrl.apiUris))
  const rules: ApiRule[] = []
  for (const m of menus) for (const p of splitUris(m.apiUris)) rules.push({ pattern: p, menuCode: m.menuCode, ctlCode: null })
  for (const c of ctls) for (const p of splitUris(c.apiUris)) rules.push({ pattern: p, menuCode: c.menuCode, ctlCode: c.ctlCode })
  return rules
}
function splitUris(s: string | null): string[] { return (s ?? '').split(',').map(x => x.trim()).filter(Boolean) }
```

- [ ] **Step 4: 写鉴权插件测试** `permission.test.ts`

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import Fastify from 'fastify'
import { buildApp } from '../helpers/test-app.js'   // 或按 live-server 现有测试基建构造
import { PERMISSION_CODES } from '../../../src/plugins/permission.js'

describe('permission plugin', () => {
  it('菜单读接口命中但无权限 → 403 code=PERM_MENU', async () => {
    const app = await buildApp({ rules: [{ pattern: '/api/crew*', menuCode: 'DATA_CREW_MASTER', ctlCode: null }] })
    const res = await app.inject({ method: 'GET', url: '/api/crew/123', headers: { authorization: 'Bearer ' + tokenFor({ menus: [], ctrls: {}, isAdmin: 0 }) } })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe(PERMISSION_CODES.MENU)
    await app.close()
  })
  it('动作接口命中但无 ctrl → 403 code=PERM_CTRL', async () => {
    const app = await buildApp({ rules: [{ pattern: '/api/roster/assign', menuCode: 'LIVE_ROSTER', ctlCode: 'BTN_ASSIGN' }] })
    const res = await app.inject({ method: 'POST', url: '/api/roster/assign', headers: { authorization: 'Bearer ' + tokenFor({ menus: ['LIVE_ROSTER'], ctrls: { LIVE_ROSTER: [] }, isAdmin: 0 }) } })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe(PERMISSION_CODES.CTRL)
    await app.close()
  })
  it('未映射接口放行（fail-open）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: { authorization: 'Bearer ' + tokenFor({ menus: [], ctrls: {}, isAdmin: 0 }) } })
    expect(res.statusCode).toBe(200)
  })
  it('is_admin 短路放行', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/crew/123', headers: { authorization: 'Bearer ' + tokenFor({ isAdmin: 1 }) } })
    expect(res.statusCode).not.toBe(403)
  })
})
```

> `tokenFor()` / `buildApp()` 复用 live-server 现有 auth 测试基建（`__tests__/helpers/`），把 permission 插件以 `fastify.inject` 全链路注入验证。

- [ ] **Step 5: 实现 `plugins/permission.ts`**

插件逻辑（挂 `onRequest`，在 auth 插件之后）：
1. `if (request.authUser?.isAdmin === 1) return`（短路）
2. 从 `PermissionCache` 取 `PermissionContext`（loadFn 优先 Redis，miss 再 `resolvePermissionContext`）
3. 校验 `payload.permVersion !== ctx.permVersion` → 403 `code:'SESSION_STALE'` 提示重登
4. `normalizeApiPath` → `matchApiRule(rules)`；命中 menu 规则且 menus 不含 → 403 `code:'PERM_MENU'`；命中 ctrl 规则且 `ctrls[menuCode]` 不含 ctl → 403 `code:'PERM_CTRL'`
5. 管理接口：路径以 `/api/admin/` 开头或命中管理菜单 → 未过菜单校验即 403
6. 未命中任何规则 → 放行（fail-open）
`api-rules` 索引启动时 `loadApiRules` 一次，供插件闭包使用。

- [ ] **Step 6: 注册插件 + 跑测试**

`index.ts` 在 `auth` 插件后 `await server.register(permissionPlugin)`；测试跑 `npx vitest run src/__tests__/plugins/permission.test.ts` Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add live-server/src/services/permission/api-uri-index.ts live-server/src/plugins/permission.ts live-server/src/index.ts
git commit -m "feat(perm): api_uris index + permission authz plugin (fail-open, is_admin shortcut)"
```

---

### Task 5: 登录下发权限 + /auth/me 扩展

**Files:**
- Modify: `live-server/src/routes/auth/auth.ts`
- Modify: `live-server/src/services/auth/session-auth.ts`（JWT payload 加 permVersion）
- Modify: `live-server/src/stores/auth-store.ts`（gantt 侧，随 me 响应存 menus/ctrls/dataScope）— 见 Task 8 前端，此处仅后端
- Test: `live-server/src/routes/auth/auth.test.ts`（扩展）

**Interfaces:**
- Consumes: `resolvePermissionContext` / `storePermissionContext`（Task 3）
- Produces: 登录响应 + `/api/auth/me` 响应扩展为
```ts
interface AuthMeResponse {
  user: { userCode: string; userName: string; schema: string; isAdmin: number }
  menus: string[]          // 过滤后的菜单 code 列表（前端据此渲染树，含父子）
  ctrls: Record<string, string[]>
  dataScope: DataScope
}
```

- [ ] **Step 1: 扩展 JWT payload 带 permVersion**（`session-auth.ts`）

```ts
export interface AuthPayload {
  userCode: string; userName: string; schema: string
  isAdmin: number; tokenVersion: number; permVersion: number
}
// buildAuthPayload(user, permVersion) — 登录时解析出 permVersion 后签名
```

- [ ] **Step 2: 登录时解析权限 → 写 Redis → 签名**（`auth.ts`）

`POST /login` 成功分支：`const ctx = await resolvePermissionContext(db, user.userCode)`；`await storePermissionContext(redis, key, ctx)`；`permVersion = ctx.permVersion`；JWT 签名带 `permVersion`；响应加 `{ token, userCode, userName, schema, isAdmin, menus, ctrls, dataScope }`。

- [ ] **Step 3: 扩展 `/api/auth/me`**：`getValidatedPayload` 后，走 `PermissionCache.get` 取上下文，返回 `{ user, menus, ctrls, dataScope }`；`is_admin` 时返回全放行（menus=全部菜单 code，ctrls 全量，dataScope 全空）。

- [ ] **Step 4: 扩展 auth 测试**（`auth.test.ts`）
  - 登录成功 → 响应含 menus/ctrls/dataScope，JWT 可解出 permVersion
  - /me 返回权限上下文
  - 无 profile 绑定用户 → menus=[]（但仍可登录）

- [ ] **Step 5: 跑测试 + 编译**

Run: `cd live-server && npx vitest run src/routes/auth/auth.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add live-server/src/routes/auth/ live-server/src/services/auth/session-auth.ts
git commit -m "feat(perm): embed permVersion in JWT + deliver menus/ctrls/dataScope at login and /me"
```

---

### Task 6: 可选项收窄（查询界面数据源按 dataScope）

**Files:**
- Modify: `live-server/src/routes/base/department.ts`（→crew-department 后的列表接口）
- Modify: `live-server/src/routes/base/index.ts`、`live-server/src/routes/crew/crew.ts`、`live-server/src/routes/flight/` 等**选项类接口**（fleet/rank/division/crew_department/crew 下拉数据源）
- Create: `live-server/src/services/permission/scope-option.ts`
- Test: `live-server/src/__tests__/services/scope-option.test.ts`

**Interfaces:**
- Consumes: `PermissionContext.dataScope`（Task 3）
- Produces:
```ts
export const filterByScope: <T>(items: T[], scope: DataScope, key: (item: T) => { dim: keyof DataScope; value: string }) => T[]
export const isInScope: (scope: DataScope, dim: keyof DataScope, value: string) => boolean  // 空数组=不限
```

- [ ] **Step 1: 写过滤函数失败测试** `scope-option.test.ts`

```ts
it('维度内白名单过滤 + 未配置维度不限', () => {
  const scope: DataScope = { FILIALE: [], DIVISION: ['P'], CREW_DEPARTMENT: [], RANK: [], FLEET: ['B737'] }
  const fleets = ['B737', 'A320', 'B787']
  const got = fleets.filter(f => isInScope(scope, 'FLEET', f))
  expect(got).toEqual(['B737'])
  const divs = ['P', 'C', 'A']
  expect(divs.filter(d => isInScope(scope, 'DIVISION', d))).toEqual(['P'])
})
```

- [ ] **Step 2: 实现 `scope-option.ts`**（`isInScope`：空数组返回 true；`filterByScope` 复用）

- [ ] **Step 3: 选项类接口接入**——对 fleet 列表、rank 列表、division 选项、crew_department 列表、crew 选择器（下拉分页接口）**五个数据源接口**，从 `request.authUser` 关联权限上下文（`PermissionCache.get`），用 `filterByScope` 收窄返回。crew 选择器只收窄下拉数据源，**不改 gantt 主数据加载**。

- [ ] **Step 4: 集成测试**（构造有 dataScope 的用户 → 调选项接口 → 断言返回子集；无 scope 维度 → 全量）

- [ ] **Step 5: 跑测试**

Run: `cd live-server && npx vitest run src/__tests__/services/scope-option.test.ts && npx vitest run <选项接口集成测试>`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add live-server/src/services/permission/scope-option.ts <选项接口路由文件>
git commit -m "feat(perm): narrow query option data sources by dataScope"
```

---

### Task 7: 管理接口门禁 + 性能基准

**Files:**
- Modify: `live-server/src/plugins/permission.ts`（管理接口强制门禁）
- Create: `live-server/src/__tests__/plugins/permission-manage.test.ts`
- Create: `live-server/src/__tests__/perf/permission-latency.test.ts`

**Interfaces:**
- Consumes: Task 4 插件；现有 `/api/admin/*` 路由
- Produces: 管理接口门禁规则；延迟基准 p50/p99 报告

- [ ] **Step 1: 管理接口门禁测试** `permission-manage.test.ts`

```ts
// /api/admin/scheduler/* 无 is_admin 且无 SYSTEM_SCHEDULER 菜单 → 403
// 有 is_admin → 放行
```

- [ ] **Step 2: 插件加管理门禁**：路径以 `/api/admin/` 开头 → 校验 menus 含对应管理菜单或 `isAdmin===1`；用户/角色/菜单/pbs_user 管理路由（Task 2 盘点出的管理菜单）同规则。

- [ ] **Step 3: 性能基准测试** `permission-latency.test.ts`

```ts
// 基准：n 次 plugin 全链路（JWT verify + 内存缓存 get + 规则匹配）耗时，输出 p50/p99
// 断言 p99 < 5ms（相对现有毫秒级 DB 查询可忽略）；对比基线（不加权限插件）不超过 10%
```

- [ ] **Step 4: 跑测试并记录结果**（§No-Illusion：贴 p50/p99 数值）

Run: `cd live-server && npx vitest run src/__tests__/perf/permission-latency.test.ts`
Expected: PASS + 输出延迟数据

- [ ] **Step 5: Commit**

```bash
git add live-server/src/plugins/permission.ts live-server/src/__tests__/
git commit -m "feat(perm): enforce management API gates + permission latency benchmark"
```

---

### Task 8: 前端最小接入（收尾 P1，为 P2 铺路）

**Files:**
- Modify: `gantt/src/stores/auth-store.ts`（存 menus/ctrls/dataScope；logout 清理）
- Modify: `gantt/src/services/api.ts` 或对应 client（/me 解析新字段）
- Test: `gantt/src/stores/__tests__/auth-store.test.ts`（扩展）

**Interfaces:**
- Consumes: Task 5 的 `/api/auth/me` 响应
- Produces: `useAuthStore.getState().permissions` 含 `{ menus, ctrls, dataScope }`，供 P2 消费

- [ ] **Step 1: auth-store 存权限**：login/me 响应存入 `permissions`；logout 清空；不改变现有 is_admin 逻辑
- [ ] **Step 2: 单元测试**：login 后 permissions 填充；logout 清空
- [ ] **Step 3: 跑测试**

Run: `cd gantt && npx vitest run src/stores/__tests__/auth-store.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add gantt/src/stores/auth-store.ts
git commit -m "feat(perm): store menus/ctrls/dataScope in gantt auth store"
```

---

## Self-Review 记录

- **Spec 覆盖**：§5 数据模型→Task 1；§6 菜单重建→Task 2；§7.1-7.3 后端链路→Task 3/4/5/7；§7.4 可选项收窄→Task 6；§8 前端→Task 8（仅权限存储，P2 动态导航/管理界面为计划 2）；§10 connector/engine→计划 3；§11 分阶段对应任务分组；§12 测试内置各任务。
- **开放问题**：Task 2 Step 5 标注 `route /department` 路径是否随表重命名改 `/crew-department` 需实施时定（避免误伤现有前端 data-maintenance 依赖）。
- **后续计划**：计划 2 = P2 前端（菜单树驱动导航 / PermissionGate / System 管理界面）；计划 3 = P3 connector/engine 鉴权 + 运营工具入口权限。两计划在计划 1 完成后单独编写。
