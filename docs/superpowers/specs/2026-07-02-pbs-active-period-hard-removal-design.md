# PBS Active Period 硬删除设计

## 背景

`Gantt > PBS > Period` 页面当前有一个 `Portal Active Period` 卡片，用于给 PBS Portal 配置当前显示哪个申请周期。这个功能最初解决测试数据不足时“强制指定月份”的问题，但后来已经新增 `PBS Business Time`：

- 管理员可以通过 `PBS Business Time` 控制系统业务日。
- Portal 当前可申请周期可以根据业务日、`pbs_period.bid_open_at`、`pbs_period.bid_close_at` 自动计算。
- `Manual Period` 成为第二套周期控制口径，会和业务日口径冲突，并污染前端、后端、数据库配置与测试。

本次需求不是隐藏 UI，而是彻底删除旧的 `Active Period` 管理功能：以后不能在页面、后端 API、数据库配置、共享 contract、测试口径里继续依赖它。

## 目标

1. 删除 Gantt 管理端 `Portal Active Period` 卡片。
2. 删除 live-server 的 `portal-active-period` 管理 API。
3. 删除 pbs-server 对 `PBS_PORTAL_ACTIVE_PERIOD_*` dictionary 配置的读取逻辑。
4. 删除数据库中已有的 `PBS_PORTAL_ACTIVE_PERIOD_*` 配置数据。
5. 将 Portal 运行时返回的周期元数据从 `activePeriod` 改名为 `currentPeriod`，避免旧概念继续残留在前后端代码里。
6. Portal 当前周期只由 `PBS Business Time + pbs_period` 自动计算。
7. 不做兼容字段、不做 fallback、不保留隐藏开关；如果还有旧调用，应直接暴露为错误并修复调用方。

## 非目标

- 不删除 `pbs_period` 表，也不删除 `PBS Business Time`。
- 不删除 Portal 顶部/日历右侧显示的 bidding window 状态；它仍然需要显示当前周期是否 open、close、not open。
- 不改变 `bid_open_at` / `bid_close_at` 的业务含义。
- 不改变 Pairing / Days Off / Line / Reserve 的具体 bid 写入逻辑，只替换它们获取当前周期的来源与字段命名。
- 不为了兼容旧前端继续返回 `activePeriod`。

## 方案对比

### 方案 A：只隐藏前端卡片

删除 Gantt 卡片，但保留 live-server API、pbs-server 手动解析、dictionary 配置。

缺点：旧配置仍可能影响 Portal，问题更隐蔽，不符合“彻底去掉”。

结论：不采用。

### 方案 B：运行时忽略旧配置，但保留 API 和字段

pbs-server 不再读取 `PBS_PORTAL_ACTIVE_PERIOD_*`，但 live-server API、contract 的 `activePeriod` 字段继续存在。

缺点：代码和数据库概念仍残留，后续开发者会误以为还能配置 active period。

结论：不采用。

### 方案 C：硬删除并统一命名为 current period

删除管理 UI、删除 API、删除 dictionary 配置读取和数据，Portal 运行时字段改名为 `currentPeriod`。

优点：业务口径单一，代码概念干净，后续只需要理解 `PBS Business Time` 和 `pbs_period`。

结论：采用。

## 目标行为

### 管理端

`Gantt > PBS > Period` 页面只保留：

- `PBS Business Time`
- Period filters
- Period table
- Generate Year / Add Period / edit / delete period

页面不再出现：

- `Portal Active Period`
- `Selection Mode`
- `Manual Period`
- portal active period 的 Load / Save
- `AUTOMATIC` / `MANUAL` active-period badge

### Portal 当前周期解析

pbs-server 解析当前周期时：

1. 根据登录 crew 找到 `division`，找不到时默认 `C`。
2. 根据当前 schema 推导 `filiale`。
3. 读取 PBS Business Time 得到 `businessNow`。
4. 在同一 `filiale + division` 的 `pbs_period` 中自动选择当前周期：
   - 当前业务时间落在 `bid_open_at <= businessNow <= bid_close_at` 内的周期优先。
   - 没有 open 周期时，选择最近即将开放的周期。
   - 没有未来周期时，选择最近关闭的周期。
5. 根据 `businessNow` 计算 `computedStage` 和 `canEditBid`。

不再读取：

- `PBS_PORTAL_ACTIVE_PERIOD_MODE_*`
- `PBS_PORTAL_ACTIVE_PERIOD_ID_*`
- `Manual Period`
- `Selection Mode`

### API / Contract 命名

旧字段：

```ts
activePeriod?: PbsActivePeriod
```

改为：

```ts
currentPeriod?: PbsCurrentPeriod
```

`PbsCurrentPeriod` 保留当前页面真正需要的信息：

```ts
type PbsCurrentPeriod = {
  id: number | null
  periodCode: string
  filiale?: string | null
  division?: string | null
  status?: string | null
  computedStage: PbsComputedPeriodStage
  bidOpenAt?: string | null
  bidCloseAt?: string | null
  canEditBid: boolean
  readOnlyReason: string | null
}
```

不再保留 `selectionMode`，因为手动/自动模式已经不存在。

### 缺失周期时的安全行为

Portal 如果拿不到 `currentPeriod`，前端必须 fail closed：

- 不允许编辑 bid。
- 显示只读提示。
- 不因为字段缺失默认允许提交。

这是为了避免前后端部署不同步时产生越权编辑风险。

## 影响范围

### Gantt

需要修改：

- `gantt/src/components/pbs/pbs-period-view.tsx`
- `gantt/src/services/pbs-period-admin-api.ts`
- `e2e/tests/gantt/pbs-period.spec.ts`

删除内容：

- `PbsPortalActivePeriodMode`
- `PbsPortalActivePeriodConfig`
- `PbsPortalActivePeriodInput`
- `fetchPbsPortalActivePeriodConfig`
- `savePbsPortalActivePeriodConfig`
- 管理页内所有 portal active period state / handler / JSX / test id

保留内容：

- PBS Business Time 的加载、保存、清除。
- period 列表、过滤、生成年份、编辑、删除。

### live-server

需要修改：

- `live-server/src/routes/pbs/period-admin.ts`
- `live-server/src/__tests__/unit/pbs-period-admin-route.test.ts`

删除内容：

- `GET /api/pbs/period-admin/portal-active-period`
- `PUT /api/pbs/period-admin/portal-active-period`
- `buildPortalActivePeriodConfigKey`
- portal active period query/body schema
- 对 `PBS_PORTAL_ACTIVE_PERIOD_*` 的读写测试

保留内容：

- `/api/pbs/period-admin`
- `/api/pbs/period-admin/business-time`
- Generate Year
- Period CRUD
- dictionary upsert helper，因为 Business Time 仍使用 dictionary。

### pbs-server

需要修改：

- `pbs-server/src/services/lineholder/current-bid.ts`
- Pairing / Days Off / Line / Reserve / Calendar current draft 响应组装处
- 相关测试与 test-utils

删除内容：

- `active_config` CTE
- `manual_period` CTE
- manual 优先于 automatic 的 union 逻辑
- `toPbsActivePeriod`
- `selectionMode`
- `activePeriod` response field

新增或替换：

- `toPbsCurrentPeriod`
- `currentPeriod` response field
- 自动 current period resolver 的回归测试

### packages/contracts

需要修改：

- 删除或替换 `packages/contracts/pbs-active-period.d.ts`
- 新增 `packages/contracts/pbs-current-period.d.ts`
- 更新 `pbs-bidding-calendar.d.ts`
- 更新 `pbs-days-off-bids.d.ts`
- 更新 `pbs-pairing-bids.d.ts`
- 更新 `pbs-line-bids.d.ts`
- 更新 `pbs-reserve-bids.d.ts`

目标是代码里不再出现 `PbsActivePeriod` / `activePeriod` contract。

### pbs-portal

需要修改：

- `pbs-portal/src/shared/components/active-period-banner.tsx`
- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`
- Pairing / Days Off / Line / Reserve / Rule Bids mappers 与 types
- 相关单测和 test-utils

重命名建议：

- `active-period-banner.tsx` → `current-period-status.tsx`
- `ActivePeriodBanner` → `CurrentPeriodStatus`
- `activePeriod` prop/state → `currentPeriod`
- `bidding-calendar-active-period-status` → `bidding-calendar-current-period-status`

UI 文案保留业务表达：

- `Bidding open for Jun 2026`
- `Open May 01, 00:00 · Close May 08, 23:59`

不显示 `Active Period` 这个管理概念。

### 数据库

需要新增 migration：

`sql/migration/2026-07-02-remove-pbs-portal-active-period-config.sql`

脚本内容：

```sql
-- Date: 2026-07-02
-- Purpose: Remove obsolete PBS Portal Active Period override configuration.
-- Background: Current bid period is now derived only from PBS Business Time and pbs_period.
-- Usage: Run under the target PBS schema search_path, for example f8.

delete from dictionary
where parent_code = 'SYS_PARAM'
  and code like 'PBS_PORTAL_ACTIVE_PERIOD\_%' escape '\';
```

执行后不应再有：

```sql
select code
from dictionary
where parent_code = 'SYS_PARAM'
  and code like 'PBS_PORTAL_ACTIVE_PERIOD\_%' escape '\';
```

返回 0 行。

## 测试策略

### 后端单元 / 集成

live-server：

- 删除 portal active period route 测试。
- 增加或调整 period admin route 测试，确认 business-time、period list、generate year 仍正常。
- 如果旧 `portal-active-period` 路径仍被注册，应测试它不存在；推荐直接移除路由，让调用方得到 404。

pbs-server：

- 增加 current period resolver 测试：
  - dictionary 中存在旧 `PBS_PORTAL_ACTIVE_PERIOD_*` 时也不会影响结果。
  - businessNow 落在 open window 时选择 open period。
  - 没有 open period 时选择最近未来 period。
  - 没有未来 period 时选择最近关闭 period。
- 验证返回字段是 `currentPeriod`，不再包含 `activePeriod`。
- 验证 `canEditBid` 只由 `computedStage` / bid window 决定。

### 前端单测

pbs-portal：

- Dashboard status 使用 `currentPeriod` 渲染。
- 缺失 `currentPeriod` 时 fail closed，不允许编辑。
- Pairing / Days Off / Line / Reserve right panel 使用 `currentPeriod.canEditBid` 控制只读。

### E2E

Gantt：

- `PBS Period` 页面不再出现 `Portal Active Period`。
- 页面仍能加载 Business Time、period filters、period table。
- 移除旧的 division switch / manual period 保存 E2E。

PBS Portal：

- business time 设置到 open window 后，Portal 可编辑。
- business time 设置到 close 后，Portal 只读。
- 页面不出现 `Active Period` 管理概念。

### 验证命令

实施后至少运行：

```bash
pnpm --filter live-server test -- pbs-period-admin-route
pnpm --filter pbs-server test -- current-bid
pnpm --filter pbs-portal test -- dashboard-page
pnpm --filter gantt test:e2e -- e2e/tests/gantt/pbs-period.spec.ts
npm run check:ui
```

如果仓库实际脚本名不同，执行时以各模块 `package.json` 为准，并在最终结果说明实际命令。

## 风险与约束

1. `activePeriod` → `currentPeriod` 是破坏性 API 变更，pbs-server 与 pbs-portal 必须同批发布。
2. 旧前端如果连到新 pbs-server，可能拿不到旧字段；因此新前端必须 fail closed，避免错误放开编辑。
3. 旧 dictionary 数据删除后，无法再恢复 manual override；这符合本需求。
4. 历史 spec 文档可以保留为历史记录，但新的测试用例和运行时文档不能继续把 `Portal Active Period` 描述为有效功能。
5. 本次不清理所有历史 spec 中的旧描述，避免大范围重写历史文档；只更新仍会指导测试或开发的 QA / test docs。

## 验收标准

1. Gantt `PBS > Period` 页面看不到 `Portal Active Period` 卡片。
2. 前端代码中不再存在 portal active period 管理 API wrapper 和卡片 state。
3. live-server 不再注册 `/api/pbs/period-admin/portal-active-period`。
4. pbs-server 不再查询 `PBS_PORTAL_ACTIVE_PERIOD_*` dictionary key。
5. 共享 contract 和 pbs-portal 运行时字段使用 `currentPeriod`，不再使用 `activePeriod`。
6. 数据库迁移删除 `PBS_PORTAL_ACTIVE_PERIOD_*` dictionary rows。
7. Portal 当前周期只受 `PBS Business Time` 和 `pbs_period` 影响。
8. 缺失 `currentPeriod` 时 Portal 不允许编辑。
9. 相关自动化测试通过，并记录执行命令。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次是跨 contract 的破坏性删除，前端、后端、数据库和测试都围绕同一个字段命名与周期解析逻辑，拆给多个 agent 容易出现 contract 不一致。
- Suggested split: 不拆分。由一个 agent 按顺序完成：contract → pbs-server → pbs-portal → live-server/Gantt → migration/tests。
- Write boundaries: 单 agent 统一修改所有受影响文件，避免 `activePeriod/currentPeriod` 混用。
- Conflict risk: 高。多个 agent 同时改共享 contract 和测试 fixture 容易冲突。
- Execution gate: 用户确认本 spec 后再实施。
