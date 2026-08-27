# 权限控制系统 — P2+P3 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成权限系统前端落地（P2：动态导航 + 按钮权限 + 管理界面）与后端扩展（P3：connector/engine 鉴权 + 工具入口权限）。

**Architecture:** 前端基于 auth-store 已下发的 `permissions`（menus/ctrls/dataScope）做：菜单树驱动导航、`usePermission`/`PermissionGate` 按钮控制、查询界面可选项收窄、System 页 5 个管理界面。后端新增 `/api/admin/*` 管理路由（users/profiles/menus/pbs-users/departments），is_admin 或 SYSTEM_* 菜单门禁。P3 让 connector-server/engine-server 关键管理 API 校验 JWT + 权限，运营工具 iframe 入口按菜单权限控制。

**Tech Stack:** React 19 + Vite（gantt）、Fastify + Drizzle（live-server）、FastAPI（engine-server）、Fastify（connector-server）。

## Global Constraints

- 菜单树 seed（P0 已建）为权威；前端 factory_name→组件注册表对齐 `system_menu.factory_name`
- 权限存储：Redis `perm:{schema}:{userCode}`；JWT 带 permVersion；权限变更 bump + invalidate
- 管理接口：`/api/admin/*` 未登记 → 403 PERM_MANAGE（P0 已实现）；已登记按菜单/按钮门禁
- 数据权限本轮：查询界面可选项按 dataScope 收窄，不强制 Gantt 数据过滤（沿用 P0 决策）
- UI 语言英文；样式 token 驱动；`npm run check:ui` 门禁
- 测试纪律：Vitest（后端管理路由）+ Playwright（前端权限用例，§Playwright-Required）；§No-Illusion
- §Minimal-First / §Surgical

---

### Task 1: usePermission hook + PermissionGate

**Files:**
- Create: `gantt/src/hooks/use-permission.ts`
- Create: `gantt/src/components/common/permission-gate.tsx`
- Test: `gantt/src/hooks/__tests__/use-permission.test.ts`
- Test: `gantt/src/components/common/__tests__/permission-gate.test.tsx`

**Interfaces:**
- Consumes: `useAuthStore.getState().permissions`（P0 已存 menus/ctrls/dataScope）
- Produces:
```ts
export const usePermission: () => {
  canAccessMenu: (menuCode: string) => boolean
  canAccessCtl: (menuCode: string, ctlCode: string) => boolean
}
export function PermissionGate({ menuCode, ctlCode, fallback?, children }): React.ReactNode
```
- `canAccessMenu`：`isAdmin===1` 或 `permissions.menus.includes(menuCode)` 或 menuCode 为空（不限制）
- `canAccessCtl`：`isAdmin===1` 或 `permissions.ctrls[menuCode]?.includes(ctlCode)`

- [ ] **Step 1: 写失败测试**（hook：无权限→false，admin→true，菜单不配置→true；组件：无权限不渲染 children）
- [ ] **Step 2: 实现 usePermission + PermissionGate**
- [ ] **Step 3: 跑测试 + check:ui** PASS
- [ ] **Step 4: Commit**

### Task 2: 菜单树驱动导航

**Files:**
- Create: `live-server/src/routes/auth/menus.ts`（GET /api/auth/menus → 按用户权限过滤的菜单树）
- Modify: `gantt/src/components/shell/shell-top-nav.tsx`、`shell-sidebar.tsx`、`app-shell.tsx`
- Create: `gantt/src/config/menu-registry.ts`（menu_code/factory_name → 视图组件映射）

**Interfaces:**
- 后端 `GET /api/auth/menus` 返回 `{ nodes: [{ menuCode, menuName, parentMenuCode, factoryName, hasAccess, ctrls: string[] }] }`；is_admin 全量
- 前端 `useMenuTree()` 拉取并在 auth 变化时刷新；ShellTopNav 渲染 hasAccess 的顶层 Tab；ShellSidebar 渲染各模块 hasAccess 子项；app-shell 用 registry 映射 factory_name→视图

- [ ] **Step 1: 后端 menus 路由 + 测试**（admin 全量 / 非 admin 过滤 / 未授权 403）
- [ ] **Step 2: 前端 menu-registry + useMenuTree**
- [ ] **Step 3: 重构 ShellTopNav/ShellSidebar/app-shell**（未授权不渲染）
- [ ] **Step 4: Playwright 用例**：admin 看到全部 Tab；受限角色看不到 System 等
- [ ] **Step 5: 跑测试 + check:ui + Commit**

### Task 3: 查询界面可选项收窄（前端）

**Files:**
- Modify: `gantt/src/components/.../filter-dialog.tsx` 等筛选/选择器组件
- Create: `gantt/src/hooks/use-scoped-options.ts`

**Interfaces:**
- `useScopedOptions(dim: keyof DataScope)`：读 auth permissions.dataScope，返回 `(options) => options.filter(inScope)` 与 `isOptionAllowed(v)`

- [ ] **Step 1: 实现 useScopedOptions + 测试**
- [ ] **Step 2: Filter 弹窗 fleet/rank/division/crew_department 下拉接入**
- [ ] **Step 3: 跑测试 + check:ui + Commit**

### Task 4: 后端管理接口（admin routes）

**Files:**
- Create: `live-server/src/routes/admin/permission-admin.ts`（users/profiles/menus/pbs-users/departments CRUD + 权限配置）
- Create: `live-server/src/services/admin/permission-admin-service.ts`
- Test: `live-server/src/__tests__/routes/admin/permission-admin.test.ts`

**Interfaces:**
- `POST /api/admin/users`（创建含密码哈希）、`PATCH /api/admin/users/:id`、`POST /api/admin/users/:id/disable`、`POST /api/admin/users/:id/reset-password`、`POST /api/admin/users/:id/profiles`（绑定角色）
- `GET/POST/PATCH/DELETE /api/admin/profiles*` + `PUT /api/admin/profiles/:id/menus` + `PUT /api/admin/profiles/:id/ctrls` + `PUT /api/admin/profiles/:id/data-scope`
- `GET/POST/PATCH/DELETE /api/admin/menus*`、`/api/admin/menus/:id/ctrls`
- `POST /api/admin/pbs-users/:id/disable`、`POST /api/admin/pbs-users/:id/reset-password`、`GET /api/admin/pbs-users`（分页 + base/rank/division）
- `GET/POST/PATCH/DELETE /api/admin/departments*`（user_department + crew_department）
- 写操作后 `bumpPermissionVersion` + invalidate 相关缓存

- [ ] **Step 1: permission-admin-service（users 管理）**：bcrypt 哈希、启停、重置密码、绑定 profile；Vitest
- [ ] **Step 2: profiles 管理**：CRUD + 菜单/按钮/数据权限配置（写 profile_menu_privilege / profile_ctrl_privilege / profile_authorization）；权限变更 bump permVersion
- [ ] **Step 3: menus + pbs-users + departments 管理**
- [ ] **Step 4: 路由接入 + 管理门禁测试 + tsc + Commit**

### Task 5: System 页管理界面

**Files:**
- Create: `gantt/src/components/system/user-mgmt.tsx`、`profile-mgmt.tsx`、`menu-mgmt.tsx`、`pbs-user-mgmt.tsx`、`dept-mgmt.tsx`
- Modify: `gantt/src/components/system/system-view.tsx`、`config/system-tools.ts`、`shell-sidebar.tsx`

- [ ] **Step 1: UsersManagement**（用户列表/新建/编辑/启停/重置密码/绑定角色）
- [ ] **Step 2: ProfilesManagement**（角色 CRUD + 菜单勾选树 + 按钮 + 数据权限配置）
- [ ] **Step 3: MenusManagement + PbsUsersManagement + DepartmentsManagement**
- [ ] **Step 4: 注册进 SystemView + 侧栏 + Playwright 用例 + Commit**

### Task 6: 页面按钮权限接入

**Files:**
- Modify: `gantt/src/components/shell/gantt-sub-toolbar.tsx`、`scenario-gantt-toolbar.tsx`、`data/basic-table-page.tsx` 等

- [ ] **Step 1: Live roster 工具栏 + 弹窗按钮接入 PermissionGate**（LIVE_ROSTER ctrls）
- [ ] **Step 2: Scenario / Data / Legality / PBS 主要按钮接入**
- [ ] **Step 3: Playwright 用例 + check:ui + Commit**

### Task 7: P3 — connector/engine 鉴权 + 工具入口权限

**Files:**
- Modify: `connector-server/src/plugins/`（JWT + 权限校验 onRequest）
- Modify: `engine-server/app/`（FastAPI 依赖校验）
- Modify: `gantt/src/components/system/system-view.tsx`（iframe 入口按菜单权限）

**Interfaces:**
- connector-server/engine-server 共享 `JWT_SECRET` + 查 `perm:{schema}:{userCode}` Redis（或直接查 rois DB）
- 管理端点（队列控制/调度/引擎触发）→ 校验 JWT 签名 + permVersion + 对应菜单/按钮权限
- System 页 iframe 工具按 `SYSTEM_*` 菜单权限渲染/隐藏

- [ ] **Step 1: connector-server 鉴权插件 + 测试**
- [ ] **Step 2: engine-server FastAPI 鉴权依赖 + 测试**
- [ ] **Step 3: 工具入口权限（前端）+ Playwright**
- [ ] **Step 4: 全量测试 + Commit**

---

## 分阶段验收
- P2-T1..T6 每个任务：Vitest/Playwright + check:ui + §No-Illusion 贴结果
- P3：connector/engine 管理 API 401/403 用例；工具入口权限 Playwright
