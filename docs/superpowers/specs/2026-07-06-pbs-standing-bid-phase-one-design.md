# PBS Standing Bid Phase A 页面与保存能力设计

## 背景

当前 PBS Portal 顶部导航已经展示 `Standing Bid`，但实际仍跳转到 `/404`：

- `pbs-portal/src/shared/constants/top-nav-items.ts`
- `pbs-portal/src/app/router/app-routes.tsx`

AA PBS Guide 中的 `Standing Bid Tab` 是独立顶层 tab，用于维护长期备用 bid。它不是当月 bid，也不是某个 bid period 的申请入口。AA 原文使用 `Layer`，本项目统一映射为 `Tier / T1-T7`，后续 UI、API、代码、数据库命名都不得新增 PBS 业务含义的 `Layer`。

用户确认本阶段采用 Phase A：

- 先做独立 `Standing Bid` 页面。
- 支持长期模板的编辑和保存。
- 不在本阶段接入最终 engine fallback。
- 不在本阶段实现 `Export to Current Bid` / `Import from Current Bid`。

## AA 业务语义对齐

Standing Bid 的业务定位：

- 当用户没有录入当月 bid 时，系统可使用 Standing Bid 作为备用偏好。
- Standing Bid 可长期保存，可随时修改，不应受当月 bidding open / close 时间窗口限制。
- Standing Bid 可用于任意月份，所以不能包含强绑定具体月份的数据。
- Lineholder Standing Bid 和 Reserve Standing Bid 是两套独立备用模板，各自有 7 个 Tier。

Lineholder Standing Bid 允许：

- 通用 Days Off 偏好。
- 通用 Pairing 偏好。
- 通用 Line 偏好。
- Standing 专属 `Day of Week Off`。

Lineholder Standing Bid 不允许：

- 具体日期休息日。
- 具体 pairing run / pairing occurrence。
- `on Date` 类属性。
- `Avoid Person`、`Buddy With`。

Reserve Standing Bid 允许：

- Standing 专属 `Reserve Day of Week Off`。
- Standing 专属 `Reserve Work Block Size`。
- `Waive to Allow Carry over to be Days Off`。
- 其他经过 whitelist 确认的通用 Reserve standing 属性。

Reserve Standing Bid 不允许：

- 当月 Reserve tab 中的具体日期偏好直接混入 Standing Bid。
- import/export 到 current bid。
- 依赖当前 bid period 的日期型数据。

## 目标

1. `Standing Bid` 顶部 tab 进入真实页面，不再跳转 `/404`。
2. 页面支持 `Lineholder Standing Bid` 与 `Reserve Standing Bid` 两种模式切换。
3. 两种模式各自支持 `T1-T7` 编辑。
4. 页面能展示、添加、编辑、删除、保存 Standing Bid properties。
5. Standing Bid 保存为长期模板，与当前 period 的 `Current` draft 严格隔离。
6. Standing Bid 编辑不受 bidding calendar open/close 状态限制。
7. 页面布局、缩放、自适应必须遵守 PBS Portal 现有工作台规范，不能重复 Award 页面曾出现的适配偏差。
8. 新增行为必须有单元测试、后端测试、Playwright 覆盖和 QA 人工测试案例。

## 非目标

- 不实现 engine / award fallback：即“当月 bid 为空时真正自动使用 Standing Bid”不在 Phase A。
- 不实现 `Export to Current Bid`。
- 不实现 `Import from Current Bid`。
- 不修改最终 submit / lock 流程。
- 不把 Standing Bid 内容合并进当前 `Tier` review 页面。
- 不在左侧 `BIDDING CALENDAR` 上添加 Standing Bid 的具体日期操作。
- 不用 AA 原文 `Layer / Lx` 作为新增 UI、API、代码、数据库术语。
- 不为了快速上线把 Standing Bid 暂存到当前月度 draft。

## 推荐方案

### 方案 A：复用 `pbs_bid` 主链，新增 Standing 上下文（推荐）

在现有 PBS bid 数据模型上增加 Standing Bid 的明确上下文：

- `bid_context = StandingLineholder`
- `bid_context = StandingReserve`
- `period_code = STANDING`
- `pbs_period_id = null`

复用现有：

- `pbs_bid`
- `pbs_bid_tier`
- `pbs_bid_group`
- `pbs_bid_condition`
- 收藏和 property definition 机制中可复用的部分

需要 migration：

- 放宽 `pbs_bid.bid_context` 长度，当前 `varchar(10)` 无法容纳清晰语义。
- 更新 `pbs_bid.bid_context` comment。
- 可补充 standing 查询索引，例如 `(crew_id, bid_context)`，避免每次用 synthetic period 扫描。

优点：

- 最大程度复用 current draft 的 tier/group/condition 结构。
- 后端 formatter、property validation、summary 逻辑可以按上下文扩展，而不是复制一套表。
- Phase B 做 export/import 时更容易在同构结构之间转换。

风险：

- 必须严格限制 current bid API 只读取 `bid_context = Current`。
- 必须严格限制 Standing Bid API 只读取 standing contexts。
- migration 和 service 命名要清楚，避免把 `STANDING` 误认为真实 bid period。

### 方案 B：新增完整 `pbs_standing_bid_*` 表

新建独立 standing bid 主表、tier 表、group 表、condition 表。

优点：

- 数据语义最干净，不需要 synthetic period。
- Standing Bid 与 Current Bid 在数据库层完全隔离。

缺点：

- 会复制大量 `pbs_bid_*` 结构和 service 逻辑。
- 后续 export/import 需要在两套结构之间做映射。
- Phase A 工程量明显变大，且容易出现两个 bid 模型长期分叉。

### 方案 C：把 Standing Bid 暂存在 current/default bid

不推荐。

原因：

- Standing Bid 不属于某个 bid period。
- 它可以在 bidding close 后继续编辑。
- 混入 current/default 会污染当月申请、锁定规则、Tier review 和后续 export 语义。

## 最终选择

采用方案 A。

关键约束：

- `STANDING` 只能作为内部 synthetic period code，不展示给用户。
- 用户界面不显示 bid period。
- Standing Bid API 和 current bid API 必须分离，不能通过参数随意切换上下文。
- 后续 engine fallback 需要另开 Phase C spec，不在本次暗接。

## 页面信息架构

### 路由与导航

- 顶部 `Standing Bid` tab 路由改为 `/standing-bid`。
- 新增 `/standing-bid` protected route。
- 页面仍在 PBS Portal 主壳层内，遵守现有顶部导航、缩放和认证逻辑。

### 页面结构

页面建议结构：

```text
Standing Bid
Used as a long-term backup when no monthly bid exists.

[Lineholder Standing Bid] [Reserve Standing Bid]

T1 T2 T3 T4 T5 T6 T7

┌───────────────────────────────┬──────────────────────────────┐
│ Existing Standing Bid Rules   │ Add Standing Bid Rule         │
│ - current mode + current tier  │ - categorized property list   │
│ - readable bid summary        │ - configure rule dialog       │
│ - edit / delete               │ - save to standing template   │
└───────────────────────────────┴──────────────────────────────┘
```

说明：

- 不复用左侧 `BIDDING CALENDAR` 作为 Standing Bid 的主交互，因为 Standing Bid 不允许具体日期，不属于某个 bid period。
- 但页面必须复用 PBS Portal 的页面画布、缩放策略、字体、间距、按钮、卡片和表格视觉标准。
- 页面顶部必须有一句业务解释，避免用户误以为 Standing Bid 会覆盖当前 monthly bid。

### Lineholder 模式

Lineholder 模式使用分组 property picker：

- `Days Off`
- `Pairing`
- `Line`
- `Standing`

其中 `Standing` 第一阶段至少包含：

- `Day of Week Off`

Lineholder 模式的 property catalog 必须由后端返回，不允许前端硬编码注入。后端需要按 standing whitelist 返回可见属性：

- 保留通用属性。
- 排除具体日期属性。
- 排除具体 pairing occurrence 属性。
- 排除 `on Date` 类属性。
- 排除 `Avoid Person` / `Buddy With`。

### Reserve 模式

Reserve 模式使用分组 property picker：

- `Reserve`
- `Standing`

Standing 专属属性第一阶段至少包含：

- `Reserve Day of Week Off`
- `Reserve Work Block Size`
- `Waive to Allow Carry over to be Days Off`

Reserve Standing Bid 不显示 import/export 入口。

## 数据与 API 设计

### 数据边界

Standing Bid 和 Current Bid 的读取、保存、缓存 key 必须完全分离：

- Current monthly bid：`bid_context = Current`，真实 `period_code`。
- Standing lineholder：`bid_context = StandingLineholder`，`period_code = STANDING`。
- Standing reserve：`bid_context = StandingReserve`，`period_code = STANDING`。

Standing Bid 不写入：

- `pbs_bid_day_off` 的具体日期记录。
- `pbs_bid_pairing_occurrence` 的具体 pairing run 记录。

Standing Bid 使用：

- `pbs_bid_tier`
- `pbs_bid_group`
- `pbs_bid_condition`

### API 建议

新增独立 route，不复用 current bid route：

- `GET /api/standing-bids/current`
- `PUT /api/standing-bids/current`

返回结构建议包含：

- `lineholderDraft`
- `reserveDraft`
- `propertyCatalog`
- `draftVersion`
- `lastModifiedAt`

保存要求：

- 使用 `draftVersion` 做乐观锁。
- 保存时只覆盖对应 mode 的 standing draft。
- 保存不检查 bidding open/close。
- 保存仍检查登录用户、crew identity、property whitelist、property 参数合法性。

错误处理：

- property 不在 standing whitelist：`400`。
- 具体日期或具体 pairing run 被提交：`400`。
- draft version 过期：`409`。
- 未登录：`401`。
- 用户无 crew 映射：`403` 或既有项目一致错误。

## UI 与屏幕适配硬性规则

这部分是本次开发的重点约束，必须按项目规范执行。

### 统一画布

- 页面必须使用 PBS Portal 当前统一的页面缩放来源。
- 不允许在 Standing Bid 页面内部单独计算一套 scale。
- 不允许通过写死 `width: 1920px`、`height: 1080px` 后局部 overflow 来“假适配”。
- 不允许为了对齐单个卡片添加散落 magic number。

### 视觉基线

- 以 `1920 x 1080` 为视觉基线。
- `1080-1920` 区间按现有工作台策略等比例适配。
- `>1920` 可以放大，但必须受可用高度约束。
- `<1080` 进入完整缩小展示，保证页面主要内容仍可见。

### 布局行为

- 顶部导航、页面标题、mode toggle、T1-T7 必须在常见宽度下保持一行稳定展示。
- 主内容左右两栏应随可用宽度自适应，不能固定死导致右侧被挤出。
- 卡片高度应尽量填满可用视口高度，但允许内容多时自然增高。
- 不允许页面出现无意义横向滚动条。
- 弹窗继续使用 PBS Portal 员工端既有白色轻量弹窗风格；除非另有明确需求，不迁移到 Gantt 风格 `AppDialog`。
- UI 文案使用英文。

### 与其他页面的一致性

Standing Bid 应与 `Days Off / Pairing / Line / Reserve / Tier / Award` 保持：

- 顶部导航激活态一致。
- 页面卡片标题风格一致。
- `T1-T7` 控件一致。
- 表格/列表的空状态、loading、error 状态一致。
- 按钮 hover cursor、disabled、pending 状态一致。
- 字体、色值、圆角、边框使用项目 token，不新增硬编码视觉体系。

## 实现影响范围

预计实现涉及：

### 前端

- `pbs-portal/src/shared/constants/top-nav-items.ts`
- `pbs-portal/src/app/router/app-routes.tsx`
- `pbs-portal/src/features/standing-bid/**`
- 可复用的 bid rule 展示/配置组件
- Standing Bid API service / query hook
- 对应 Vitest
- 对应 Playwright
- `gantt/src/version.ts` 中 `PBS_FRONTEND_VERSION`

### 后端

- `pbs-server/src/routes/standing-bids.ts`
- `pbs-server/src/services/standing-bid/**`
- property whitelist / validation 扩展
- summary formatter 扩展
- 对应 route/service tests
- `gantt/src/version.ts` 中 `PBS_BACKEND_VERSION`

### 数据库与 contract

- `sql/migration/<date>-pbs-standing-bid-context.sql`
- 必要的 seed / property catalog 更新
- `packages/contracts` 中 standing bid contract 或复用 bid property contract 的明确扩展

## 测试策略

### 后端测试

新增或更新 Vitest：

- `GET /api/standing-bids/current` 首次访问时返回空 standing drafts。
- `PUT /api/standing-bids/current` 可以保存 Lineholder Standing Bid。
- `PUT /api/standing-bids/current` 可以保存 Reserve Standing Bid。
- 保存不依赖 bidding open/close。
- 提交具体日期 day off 返回 `400`。
- 提交具体 pairing occurrence 返回 `400`。
- 提交不在 whitelist 的 property 返回 `400`。
- draft version 过期返回 `409`。
- current monthly bid API 不读取 standing 数据。

### 前端单元测试

覆盖：

- `/standing-bid` route 渲染。
- 顶部导航 `Standing Bid` 激活态。
- Lineholder / Reserve 模式切换。
- T1-T7 切换。
- whitelist catalog 渲染。
- 空状态、loading、error 状态。
- 保存成功后列表更新。
- 保存失败后错误提示。

### Playwright

必须新增真实 UI E2E：

- 登录后点击顶部 `Standing Bid` tab，进入真实页面而非 `/404`。
- 切换 `Lineholder Standing Bid`，添加 `Day of Week Off`，保存后刷新仍存在。
- 切换 `Reserve Standing Bid`，添加 `Reserve Work Block Size`，保存后刷新仍存在。
- 验证页面没有 `Layer` 文案。
- 验证页面不显示可点击的具体日期 calendar 操作。
- 验证 1920x1080、1366x768、1280x720 三个 viewport 下：
  - 顶部导航不乱序。
  - mode toggle 和 `T1-T7` 不换行错位。
  - 主卡片不被裁切。
  - 页面无横向滚动条。

### UI 标准检查

前端样式改动后必须运行：

- `npm run check:ui`
- `pnpm run lint`
- `pnpm run build`
- `pnpm test`

如果项目实际命令在模块内执行，应记录准确命令和 PASS / FAIL。

### QA 人工测试案例

新增：

- `docs/test-cases/pbs/standing-bid/<YYYY-MM-DD>-standing-bid-phase-one.md`

内容至少覆盖：

- 页面入口。
- Lineholder standing 保存。
- Reserve standing 保存。
- close period 仍可编辑。
- current monthly bid 不被污染。
- 屏幕适配检查。

## 验收标准

1. 顶部 `Standing Bid` tab 可进入 `/standing-bid`，不再进入 `/404`。
2. 页面能在 Lineholder / Reserve 两种 Standing Bid 间切换。
3. 两种 Standing Bid 都有独立 `T1-T7`。
4. 保存 Lineholder Standing Bid 后刷新仍存在。
5. 保存 Reserve Standing Bid 后刷新仍存在。
6. Standing Bid 不受 bidding open/close 限制。
7. Standing Bid 不允许具体日期、具体 pairing run、`on Date` 类属性。
8. Current monthly bid 不读取、不展示、不保存 Standing Bid 数据。
9. 页面在 1920x1080、1366x768、1280x720 下符合 PBS Portal 自适应规范，无明显错位和无意义横向滚动。
10. 新增/更新的单元测试、后端测试、Playwright、QA 文档全部到位。

## 风险与控制

### 风险 1：Standing Bid 污染 Current Bid

控制：

- API 分离。
- query key 分离。
- service 层显式 standing context。
- 测试断言 current API 不返回 standing 数据。

### 风险 2：页面复用工作台不当，误导用户可以选具体日期

控制：

- Standing Bid 不使用左侧 `BIDDING CALENDAR` 作为主交互。
- 页面顶部明确说明长期备用模板语义。
- whitelist 禁止日期型和具体 pairing run。

### 风险 3：自适应再次偏离项目标准

控制：

- 使用现有统一缩放来源。
- Playwright 覆盖多个 viewport。
- 不用页面内部独立 scale。
- 不用散落 magic number。

### 风险 4：property catalog 边界不清

控制：

- 后端返回 standing 专用 catalog。
- 前端只渲染后端 catalog。
- whitelist 和 validation 在服务端执行。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: Phase A 涉及前端页面、后端 API、数据库 migration、contract、测试和 QA 文档，范围较大，可以并行探索和实现，但最终需要主 agent 集成。
- Suggested split:
  - Agent 1：后端 API、service、validation、migration、route tests。
  - Agent 2：前端页面、routing、API hook、Vitest、屏幕适配。
  - Agent 3：Playwright、QA 文档、current bid 隔离回归。
- Write boundaries:
  - 后端 agent 只写 `pbs-server/**`、`sql/**`、`packages/contracts/**` 中 Standing Bid 相关文件。
  - 前端 agent 只写 `pbs-portal/**`、`gantt/src/version.ts`。
  - 测试文档 agent 只写 `e2e/**`、`docs/test-cases/pbs/standing-bid/**`。
- Conflict risk: 中。contract 和 version 文件可能产生冲突，需主 agent 统一集成。
- Execution gate: 用户审核本 spec 并明确批准实现后，才允许进入 implementation；并行执行前需再次明确每个 agent 的写入边界。

## 开发前检查清单

实现前必须确认：

- 当前工作树中其他窗口的未提交改动，不能被本任务误提交。
- `pbs_bid.bid_context` 扩展是否与现有 sync/import/export 脚本冲突。
- standing property whitelist 的初始清单。
- 是否需要同步更新 Help；Phase A 默认不写完整 Help 操作手册，只在后续页面稳定后补。
- 是否需要在 SIT 数据库执行 migration；有 schema/seed 改动时必须同步远端库并记录命令。
