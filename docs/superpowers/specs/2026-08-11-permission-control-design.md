# 权限控制系统设计（菜单/按钮/数据权限）

> 日期：2026-08-11
> 状态：已确认，待实施
> 适用范围：gantt（live-server）/ pbs_user 账号管理 / connector-server / engine-server

## 1. 背景与目标

系统当前只有 JWT 认证（`live-server/src/plugins/auth.ts` 仅验 token），没有菜单、按钮、数据层面的权限控制。需要建立一套**角色（profile）驱动的权限体系**，实现：

1. **菜单权限**：gantt 顶部 Tab / 页面 / 子视图按角色可见可控
2. **按钮权限**：每个菜单对应的操作按钮、弹窗内按钮按角色控制（未授权不渲染、后端写接口拒绝）
3. **数据权限**：Filiale / Division / Crew Department / Rank / Fleet 五个维度的白名单数据范围
4. **pbs_user 账号管理**：机组成员 PBS 账号的启停、重置密码、基础资料维护
5. **connector / engine 管理 API 鉴权** + 运营工具入口权限

## 2. 范围

| 模块 | 范围 |
|---|---|
| gantt（live-server） | 完整菜单/按钮/数据权限控制 |
| pbs_user（pbs schema） | 仅账号管理（启停/重置密码/基础资料），**不做** pbs-portal/pbs-app 菜单权限控制 |
| connector-server / engine-server | 关键管理 API 鉴权 + 运营工具入口权限 |
| Gantt 数据加载（Live/Scenario） | **本轮不做后端数据过滤**；仅收窄查询界面可选项 + 控制按钮可见性 |

## 3. 术语

| 术语 | 说明 |
|---|---|
| profile（角色） | 权限档案，聚合菜单/按钮/数据权限；用户可绑多个角色，权限取并集 |
| menu（菜单） | system_menu，3 级结构：Tab → 页面 → 子视图 |
| ctrl（按钮/控件） | system_menu_ctrl，挂在菜单叶子下的操作项（含 api_uris） |
| dataScope | 数据权限范围，5 个维度（FILIALE/DIVISION/CREW_DEPARTMENT/RANK/FLEET）白名单 |
| permVersion | 权限版本号，权限变更后递增，用于失效旧会话的权限缓存 |

## 4. 已确认需求决策

| 项 | 决策 |
|---|---|
| 菜单衔接 | 重构 system_menu 树驱动 gantt 导航（完全动态），后端过滤下发、前端动态渲染 |
| 菜单层级 | 3 级：Tab → 页面 → 子视图；按钮 ctrl 挂叶子 |
| 旧菜单数据 | **作废清理**，以当前 gantt 真实 Tab/页面/按钮为素材重建 seed |
| 维度组合 | 维度内 OR（白名单）、维度间 AND、未配置维度不限 |
| 数据权限维度 | FILIALE / DIVISION / CREW_DEPARTMENT / RANK / FLEET（精确匹配）；User Department 仅组织归属，非过滤维度 |
| 数据过滤面 | Gantt 机组范围 / 机组列表 / 航班 Pairing / 报表统计（本轮：可选项收窄；后端过滤后续阶段） |
| 权限存储 | **Redis**（登录时写入），JWT 只带身份 + permVersion；请求时查内存 TTL 缓存（Redis 兜底） |
| 鉴权方式 | api_uris 模式匹配（读接口用 `system_menu.api_uris`，动作接口用 `system_menu_ctrl.api_uris`），**不用 route meta** |
| 管理界面 | 并入 gantt 现有 System 页（自定义组件） |
| 性能 | 权限校验内存级（Map 查找），不得影响现有接口请求响应速度 |
| 表策略 | 尽量复用老表；加表/加字段须审批（见 §5） |

## 5. 数据模型设计

### 5.1 复用表（不改结构）

| 表 | 用途 |
|---|---|
| `users` | 排班用户/系统用户（status/is_admin/password_hash/is_first_login/token_version/portal_access/app_access 已覆盖） |
| `user_profile` | 用户↔角色绑定（多对多，权限并集） |
| `profile` | 角色（profile_name/filiale/division/idx，新增 profile_code 见 5.2） |
| `profile_menu_privilege` | 角色→菜单（is_hidden=Y 隐藏） |
| `profile_ctrl_privilege` | 角色→按钮（is_hidden=Y 隐藏） |
| `system_menu_ctrl` | 按钮定义（menu_code/menu_ctl_code/api_uris，结构复用，seed 重建见 6.2） |
| `user_department` | 排班员部门组织（branch_code 树） |
| `pbs_user` | 机组 PBS 账号（status/locked/password_changed_at/base/rank/division 已覆盖） |
| `system_menu` | 菜单树（结构复用，seed 全部重做，新增 api_uris 见 5.2） |

### 5.2 结构变更（5 项，已审批）

| # | 变更 | 说明 |
|---|---|---|
| ① | `profile_authorization.auth_values` `varchar(3000)` → `jsonb` | 一行 `(profile_id, auth_type)`，auth_values 存 jsonb 数组（如 `["B737","A320"]`）；auth_type 枚举 = FILIALE / DIVISION / CREW_DEPARTMENT / RANK / FLEET |
| ② | 删除 `profile_authorization_detail` | 老系统细粒度表，并入 jsonb 数组 |
| ③ | `department` 重命名 → `crew_department` | 迁移影响：live-server `models/base/department.ts`、`routes/base/department.ts`、`services/base/department-service.ts`、`services/data/data-save-service.ts`、`models/index.ts`、gantt `data-entity-registry.ts` 等引用同步改名 |
| ④ | `profile` 加 `profile_code`（varchar，唯一） | 角色唯一代码，管理界面/前端引用 |
| ⑤ | `system_menu` 加 `api_uris`（varchar） | 页面级读接口清单，用于读接口菜单门禁 |

### 5.3 数据权限取值来源（只读引用，不加表）

| 维度 | 取值来源 | 过滤谓词 |
|---|---|---|
| FILIALE | `filiale` 表 | `crew.filiale IN(...)` / `pairing.filiale IN(...)` |
| DIVISION | division 常量（P/C/A） | `crew.division IN(...)` / `pairing.division IN(...)` |
| CREW_DEPARTMENT | `crew_department.branch_code` | `crew.branch_code IN(...)` |
| RANK | `rank.rank`（精确） | `crew_rank.rank IN(...)` |
| FLEET | `fleet` 表 | `pairing.fleet IN(...)` / `flight.fleet IN(...)` / 机组机队资质 |

### 5.4 迁移脚本

新建 `sql/migration/2026-08-11-permission-model.sql`（幂等）：
1. `ALTER TABLE profile_authorization ALTER COLUMN auth_values TYPE jsonb USING ...`
2. `DROP TABLE profile_authorization_detail`
3. `ALTER TABLE department RENAME TO crew_department` + 更新约束/索引名
4. `ALTER TABLE profile ADD COLUMN profile_code varchar(50)` + 唯一索引（回填现有行）
5. `ALTER TABLE system_menu ADD COLUMN api_uris varchar(2000)`

## 6. 菜单树重构

### 6.1 结构（3 级）

```
ROOT
├── DASHBOARD        （Dashboard）
├── LIVE             （Live）         ─ LIVE_ROSTER（Roster 甘特）
├── SCENARIO         （Scenario）     ─ SCENARIO_LIST / SCENARIO_PO / SCENARIO_RO / SCENARIO_CREW_BIDS
├── DATA             （Data）
│    ├── DATA_ORG_BASE / DATA_RANK / DATA_FLEET_AIRCRAFT / DATA_LOCATION_ROUTE
│    ├── DATA_ASSIGNMENT / DATA_QUALIFICATION / DATA_COMPOSITION / DATA_ROSTER_PERIOD
│    ├── DATA_DICT / DATA_QUERY / DATA_HOLIDAY
│    └── DATA_CREW_MASTER / DATA_CREW_WORKLOAD
├── LEGALITY         （Legality）     ─ LEGALITY_RULE_SETS / LEGALITY_RULE_INSTANCES / LEGALITY_COMPOSITION / LEGALITY_COMP_LOAD
├── SYSTEM           （System）
│    ├── SYSTEM_SCHEDULER / SYSTEM_QUEUE_TASKS / SYSTEM_GRAFANA / SYSTEM_PROMETHEUS / SYSTEM_WINDMILL / SYSTEM_DATA_QUALITY
│    └── 新增管理页（并入 System）── SYSTEM_USER_MGMT / SYSTEM_PROFILE_MGMT / SYSTEM_MENU_MGMT / SYSTEM_PBS_USER_MGMT / SYSTEM_DEPT_MGMT
├── PBS              （PBS）         ─ PBS_PERIOD / PBS_BID_DEFINITIONS / PBS_BUSINESS_TIME / PBS_ADMIN_TOOLS
└── HELP             （Help）
```

- `menu_code` 按 `模块_页面` 语义命名；`factory_name` 复用为前端组件注册表 key
- 内部工具页（Regression/Dev/Release）继续走 env 门禁，不进权限菜单树
- 子视图按实际页面内视图/功能块拆（如 Scenario 列表/详情、Live Roster 视图）

### 6.2 菜单盘点（P0）

清理旧 `sql/seed/05-system-menu.sql`，以真实 UI 为素材重建：
1. 枚举 gantt 顶部 Tab（一级）、侧栏/页面（二级）、页面内子视图（三级）
2. 逐页枚举按钮（工具栏 + **所有弹窗内按钮**）→ `system_menu_ctrl` 行，填 `menu_ctl_code`（BTN_*）与 `api_uris`；弹窗内每个可操作按钮（含确认/提交/导出等）都必须登记
3. 逐页枚举读接口 → `system_menu.api_uris`
4. 输出《菜单盘点清单》文档 + 新 seed 脚本（幂等）；seed 中**预设初始角色 profile_code**（Administrator / RosterPlanner / Viewer 等），与现有 profile 模板对应

### 6.3 前端渲染

- 登录后 `/api/auth/me` 返回按权限过滤后的菜单树 + 按钮权限 + dataScope
- 顶部 Tab 与侧栏 sub-item 改为菜单树驱动（替代硬编码 `NAV_ITEMS` / `LIVE_MENU` / `DATA_MENU` 等），未授权不渲染、不可访问
- 前端维护 `menu_code → 视图组件` 静态注册表（对齐现有 ModuleView 映射）

## 7. 后端权限链路

### 7.1 权限上下文数据结构

```typescript
interface PermissionContext {
  menus: string[]                       // 可见 menuCode 列表（含父路径）
  ctrls: Record<string, string[]>       // menuCode → 可用 ctlCode 列表
  dataScope: {
    FILIALE: string[]                   // 空数组 = 该维度不限
    DIVISION: string[]
    CREW_DEPARTMENT: string[]
    RANK: string[]
    FLEET: string[]
  }
}
```

解析逻辑：`user_profile → profiles → 并集(profile_menu_privilege is_hidden!='Y') → menus`；`并集(profile_ctrl_privilege is_hidden!='Y') → ctrls`；`并集(profile_authorization jsonb) → dataScope`。`is_admin=1` 全放行。

### 7.2 存储与缓存（性能关键）

```
登录 → 解析 PermissionContext → 写 Redis perm:{schema}:{userCode}（TTL 60s）
请求 → JWT verify → 内存 TTL 缓存(10~30s) 查 PermissionContext → api_uris 索引匹配 → 命中才校验
权限变更 → 递增 permVersion + invalidate Redis/内存 → 旧会话下次请求 401/403 提示重登
```

- **内存 TTL 缓存为主、Redis 兜底**：热路径零网络往返
- **api_uris 索引启动时加载一次**（`[{pattern, menuCode, ctlCode}]`，支持精确 + 通配 `/api/crew*`），菜单/按钮表变更后按 permVersion 重载
- **is_admin 短路**、**未列入索引的接口直接放行**（fail-open，防止误伤 Gantt 主显示）
- 权限校验开销 = 一次 Map 查找（微秒级），不影响现有接口（Gantt 现有 DB 查询毫秒级）

### 7.3 鉴权规则

每请求归一化路径（`/altair/live` 前缀 → `/api/...`）匹配索引：

| 接口类型 | 匹配源 | 校验 |
|---|---|---|
| 页面级读接口 | `system_menu.api_uris` | menus 含该 menuCode，否则 403 |
| 按钮动作接口（写/操作） | `system_menu_ctrl.api_uris` | ctrls[menuCode] 含该 ctlCode，否则 403 |
| 管理接口 | `/api/admin/*` + 用户/角色/菜单/pbs_user 管理路由 | 强制 is_admin 或对应菜单权限 |
| 未列入索引 | — | 放行（公共/内部接口） |

未授权统一 403 + `code` 区分「菜单不可见 / 无按钮权限 / 会话失效（permVersion 过期）」。

### 7.4 数据权限落地（本轮）

- **查询界面/选择器数据源按 dataScope 收窄**：fleet / rank / division / crew_department / crew 选择器等下拉、筛选的可选项，其数据源接口返回 scope 内子集；**crew 选择器只收窄下拉数据源，不强制过滤实际加载数据**
- **Gantt 数据加载不设后端过滤**（Live/Scenario 本轮不加 WHERE）
- 后端数据过滤（crew/roster/pairing/flight/report）**留后续阶段**在数据访问层统一加，本轮不动 service
- 维度内 OR、维度间 AND、未配置不限；前端可选展示「当前数据范围」

## 8. 前端改造

1. **会话与权限下发**：`/api/auth/me` 扩展返回 `{ user, menus(过滤后菜单树), ctrls, dataScope }`；登录/恢复会话时拉取
2. **动态导航**：ShellTopNav（顶部 Tab）+ ShellSidebar（页面/子视图）菜单树驱动渲染；未授权不渲染、不可访问
3. **按钮权限**：新增 `usePermission(menuCode, ctlCode)` hook + `<PermissionGate>`；页面与弹窗内按钮统一接入
4. **查询界面可选项**：Filter 弹窗 / 筛选下拉 / 数据维护页筛选的可选项按 dataScope 收窄
5. **System 管理页**：用户/角色/菜单/pbs_user/部门管理作为 System 页 CustomComponent（与 Scheduler/DataQuality 并列）

## 9. 管理功能清单（System 页）

| 功能 | 说明 |
|---|---|
| 排班用户管理 | users CRUD、绑定角色（多选）、绑定部门、启停、重置密码、登录方式（portal/app/password） |
| 角色管理 | profile CRUD（含 profile_code）、菜单权限勾选树、按钮权限配置、数据权限配置（5 维度白名单） |
| 菜单管理 | system_menu 树 CRUD + system_menu_ctrl 按钮 CRUD + api_uris 维护 |
| pbs_user 管理 | 启停、重置密码、基础资料（base/rank/division 从 crew 同步只读 + 手动重同步按钮） |
| 部门管理 | user_department + crew_department CRUD |

## 10. connector / engine 鉴权

- connector-server / engine-server 关键管理 API（队列控制/调度/引擎触发）：校验 JWT（共享 secret）+ 按 permVersion 查权限
- 运营工具 iframe 入口（grafana / prometheus / queue-tasks / windmill）按菜单权限控制可见
- 内部数据管道（BullMQ / Redis 内部通信）保持内部信任域，不改造

## 11. 分阶段交付

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P0 数据模型** | 5 项结构变更 + 迁移脚本 + 菜单盘点重建 seed | 迁移幂等可回滚；seed 覆盖真实 Tab/页面/按钮 |
| **P1 后端权限** | 权限服务 + 内存/Redis 缓存 + 鉴权插件（读/写/管理门禁）+ /me 下发 + 可选项收窄 + 性能基准 | 权限校验延迟不劣化；门禁集成测试通过 |
| **P2 前端** | 菜单树驱动导航 + usePermission/PermissionGate + 管理界面 | Playwright 权限用例通过 |
| **P3 后端扩展** | connector/engine 鉴权 + 运营工具入口权限 | 管理 API 401/403 用例通过 |
| **后续阶段** | Gantt/crew/pairing/flight/report 后端数据过滤 | — |

## 12. 测试策略

**后端 Vitest**
- 权限服务单测（解析/并集/is_admin 短路）
- 鉴权插件集成（读/写/管理门禁、未映射放行、permVersion 失效、403 code 区分）
- 可选项收窄（各维度白名单/未配置不限）
- **性能基准**：权限校验延迟 p50/p99，对比不加权限的基线

**前端 Playwright**
- 未授权 Tab/按钮不渲染；授权后可见
- 可选项收窄后下拉范围正确（白名单内可见、白名单外缺失）
- 管理界面 CRUD（用户/角色/菜单/pbs_user/部门）
- pbs_user 启停 / 重置密码流程

> 遵循 §No-Illusion：每项交付跑测试并贴 PASS 结果；§Playwright-Required：UI 变更必须带 Playwright 测试。

## 13. 风险与权衡

| 风险 | 缓解 |
|---|---|
| 读接口门禁误伤 Gantt 主显示 | 未映射接口 fail-open；P1 逐个核对 Gantt 数据端点映射 |
| api_uris 漏登记新接口导致未受门禁 | dev 期脚本校验「所有注册路由都有 api_uris 或声明为公共」 |
| 权限缓存失效延迟（内存 TTL 10~30s） | 写操作立即 invalidate + permVersion 递增，Admin 操作低频可接受 |
| JWT 不带权限 → 服务间校验需查共享存储 | connector/engine 复用同一 Redis perm 键 + 共享 JWT secret |
| pbs_user 基础资料被手动改与 crew 源冲突 | 本轮设计为只读 + 重同步按钮，禁止直接改 base/rank/division |

## 14. 已定开放问题（2026-08-11 确认）

| # | 问题 | 决定 |
|---|---|---|
| 1 | system_menu_ctrl 按钮粒度 | **覆盖所有弹窗内按钮**（含确认/提交/导出等），不只关键操作按钮 |
| 2 | crew 选择器可选项 | **只收窄下拉数据源，不强制过滤实际加载数据** |
| 3 | profile_code 预设 | **seed 中预设初始角色**（Administrator / RosterPlanner / Viewer 等） |
