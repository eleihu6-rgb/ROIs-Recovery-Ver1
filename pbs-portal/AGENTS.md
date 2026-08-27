# PBS Portal 协作约定

## 项目定位

- `pbs-portal` 是员工侧 PBS 门户，不是后台管理台。
- 实现以当前项目已确认的产品方向和指定参考源为准。
- 当参考项目与当前仓库已确认实现不一致时，以当前仓库已确认实现为准，再决定是否回补参考差异。
- 实现必须保持 `React + TypeScript + Vite`，不能引入 Vue 运行时、`.vue` 组件、Pinia 或 Vue Router。

## 技术栈边界

- 基础栈固定为 `React + TypeScript + Vite`。
- UI 使用当前项目既定方案，不随意引入重量级 UI 框架。
- 服务端状态优先使用 `TanStack Query`。
- UI 状态优先使用 `Zustand`。
- 请求统一通过 `src/shared/services` 管理。
- 新增依赖前必须确认许可证、安全性、必要性和长期维护成本。

## UI 与实现原则

- UI 开发优先遵循当前项目已确认的视觉体系与参考源。
- 不要用“更现代”“更通用”为理由擅自改动布局骨架、交互顺序或视觉语言。
- 缺口先核对现有实现和参考页面，再决定修复方式；不要凭感觉补 UI。
- 允许把参考实现的交互思路和布局常量翻译到 React，但不允许把参考项目的运行时依赖直接带进来。
- `pbs-portal` 的桌面工作台界面以 `1920 x 1080` 为视觉基线：`1080-1920` 区间优先按比例自适应，`>1920` 允许放大但要同时受可用高度约束，`<1080` 进入完整缩小展示模式，保证整页可见。
- 响应式修复优先改共享壳层与布局常量，例如顶部导航缩放、`ScaledPageCanvas`、共享列宽和面板最小高度；不要在单页里用零散的 magic number 或额外缩放补丁。
- 页面主工作区应优先“填满可用视口高度但允许内容略微增高”，避免用写死高度把底部留白或把卡片/表格内容裁掉。
- `TIERS` 这类层级切换区必须预留足够的一行宽度，能稳定容纳 `T1-T7` 和标题，不允许因为缩放或像素取整导致标题/按钮换行。
- 左侧 `BIDDING CALENDAR` 属于跨 PBS 模块共享的固定工作台区域，不是每个页面各自独立的数据块；切换 `Dashboard / Pairing / Tier / Reserve / Award / Days Off` 时应尽量保持同一份数据和交互状态。
- 对 `BIDDING CALENDAR` 的用户操作（例如当前选中的 tier）在模块间切换时不应被重置，也不应因为页面切换而重新请求或重新初始化。
- 当页面确实需要不同业务数据时，也应优先在共享壳层或共享 store 中做一次加载和状态保存，再把结果分发给各页；不要让每个页面各自持有一份独立的左侧日历状态。
- 异步页面和工作台面板在首次请求期间必须提供明确的首屏 `loading` 反馈；禁止用 mock/placeholder 内容先顶上再瞬间切换成真实数据，造成闪烁或误导。
- `loading` 态优先保持原有布局骨架和面板尺寸，避免首屏出现空白区域、布局跳动或“先空一下再闪出内容”的体验问题。
- 所有可点击的 icon、tab、文本按钮和图标按钮在 hover 时都必须显示小手光标（`cursor-pointer`）；纯展示型 icon 不要伪装成可点击状态。
- 光标语义优先落在共享按钮、切换器或交互基础样式上，避免每个页面各自补一遍后又出现遗漏。
- PBS Portal 是员工端产品界面，业务配置弹窗优先沿用 Portal 既有白色轻量弹窗风格（半透明遮罩、圆角白色卡片、左上标题/副标题、右上关闭、右下操作按钮）。`@rois/ui` 的 `AppDialog` 蓝色标题栏/可拖拽工具窗口风格不作为员工端业务弹窗的默认标准；除非需求明确要求，否则不要把 Portal 业务弹窗迁成 `AppDialog`。
- Pairing 条件新增或修改必须遵守 [Pairing Condition UI Standard](../docs/modules/pbs/pairing-condition-ui-standard.md)。该文档规定弹窗骨架、默认值、分段选择、日期/日期范围、可选限制、焦点与回归测试；需求明确例外时，必须在对应 spec 和测试中说明，不能凭局部视觉判断绕开。

## 组件与目录边界

- 优先在 feature 内实现本地组件。
- 明确跨模块复用后再上提到 `src/shared/components`。
- 只有跨项目稳定复用的组件才进入 `packages/ui`。
- 顺序固定为 `feature local -> shared -> packages/ui`。

## PBS Tier 术语规范

- PBS Portal 中表达申请层级时统一使用 `Tier / Tiers / TIERS / Tx`，例如 `Tier` 页面、`TIERS` 表头、`T1-T7` 切换按钮。
- 禁止新增 `Layer / Layers / LAYERS / Lx` 作为 PBS 业务术语；代码命名、路由、类型、mock、测试、UI 文案、aria label 都必须使用 tier 命名。
- 正式页面路由是 `/tier`；旧 `/layer` 不保留兼容入口。
- 如果引用 AA 文档，必须写清“AA 原文 Layer，对应本项目 Tier”，不能把 AA 原文术语带回项目代码。
- 只有历史 migration、历史设计文档、AA 原文引用或非 PBS 业务含义的普通英文 `layer` 可以保留。

## PBS Property Catalog 规范

- PBS Portal 展示 bid property 时，默认以旧库 `crew_bids_reference` 的 property 作为可见规则来源。
- AA 文档里的 property 可以保留在 contract / 数据库中，但默认不直接展示；是否展示必须由后端返回的 catalog 和数据库 `is_visible_in_portal` 控制。
- 前端页面不得为了补齐入口而硬编码注入单独 property；Pairing 主页面和 Search Pairings picker 都必须从同一份后端可见 Pairing catalog 派生。
- `Pairing Number / Pairing ID` 使用旧库 `propertyCode=102`；`propertyCode=128` 是 `Deadhead Day`，禁止再作为 Pairing ID 使用。
- `Month-End Carryover` 使用 `propertyCode=163`，运行时只接受 `month-end-carryover` payload（`<` / `=` / `>` / `Between` + 正整数天数），用于在 Pairing/Search Pairings 中过滤跨出当前 bid month 的 pairing；不要在左侧 `BIDDING CALENDAR` 上显示 `C/O Off` 或下月 placeholder，也不要恢复旧 `Carry-Out Days` / `stepper` 员工端实现。
- 表格第一列展示的是 property / rule 名称时，表头使用 `PROPERTY`，不要写成 `PRIORITY`；真正表示 award priority、资历优先级或结果排序的字段才保留 priority 命名。

## 状态、请求与认证边界

- 页面和组件不得直接写裸 `axios` 或 `fetch`。
- 登录态、会话恢复、登出逻辑统一通过认证 store 和 auth service 管理。
- 不要把服务端状态塞进 `Zustand`。
- 不要在页面里重复实现已有的请求、认证或数据转换逻辑。
- 前后端接口应优先遵循明确的 HTTP 方法语义，不要默认把所有交互都建成 `GET + POST` 两种模式。
- PBS 所有业务页面、业务关系操作和可持久化业务对象，后续 CRUD 默认必须使用后端返回的稳定 `id` / `key` 作为主身份。
- 创建、筛选和字典查询可以传业务 `code`，但后端返回稳定 `id` / `key` 后，后续详情读取、修改、删除、绑定、解绑、保存、乐观更新和缓存同步必须继续使用该稳定身份。
- 不要用 `rowSeq`、展示排序、名称、日期文本、UI 文案、可变业务 `code` 或当前页面临时位置定位已有业务记录。
- 同一接口被多个页面共用时，任一入口切换到稳定身份或新契约后，其他入口必须同步更新请求参数、缓存键、mapper、mock 和测试。
- 乐观更新必须在后端确认前保持明确的 pending / disabled 状态，失败时回滚或重新拉取；不要通过刷新整块工作区掩盖写入状态。
- 涉及当前草稿或批量保存的请求必须携带后端要求的最新版本信息，遇到并发冲突要提示用户重新加载或重新保存，不能静默覆盖服务端新版本。
- 禁止提交无意义的调试 `console.log`/`console.debug`；如确有必要保留浏览器端日志，必须有明确诊断目的，避免污染正常使用时的控制台输出。

## 性能要求

- 性能优先于抽象洁癖。
- 懒加载按页面和模块维持。
- `Zustand` 读取尽量使用 selector，避免整 store 订阅。
- 缩放只作用于画布容器，不直接缩放根节点。
- 当页面需要缩放时，优先保留统一的共享缩放源，避免顶部导航、主内容区、右侧工具面板各自计算不同的 scale。
- 不随意引入高成本依赖或影响首屏的额外运行时。

## 测试与交付要求

- 改动前先核对相关页面、服务和测试。
- 涉及路由、认证、核心页面交互的改动必须补回归测试。
- PBS Portal 功能新增、行为变更、关键 bug 修复、性能优化和重构，只要影响可验证业务行为，交付时不能只说明“已跑回归测试”，还必须新增或更新对应测试案例。
- 测试案例包含两类：开发侧自动化测试，以及给后期测试人员使用的 QA 人工测试案例；二者不能互相替代。
- QA 测试案例按功能单独成文，默认路径为 `docs/test-cases/pbs/<module>/<YYYY-MM-DD>-<feature>.md`，内容至少包含前置条件、操作步骤、预期结果、异常/边界场景和回归范围。
- 如果某次改动确实不适合新增自动化测试或 QA 测试案例，交付说明必须写明原因，并提供可执行的人工验证步骤。
- 交付前至少验证：
  - `npm test`
  - `npm run lint`
  - `npm run build`
- 跨模块 PBS 流程改动优先在仓库根执行 `npm run verify:pbs`。
- 关键主流程继续由 `Playwright` 覆盖。

## 修改原则

- 先保边界清晰，再追求局部编码速度。
- 不做与当前目标无关的重构。
- 遇到可复用逻辑先检查是否已有共享实现，避免重复造轮子。
- 这是长期维护项目，修改应优先考虑可读性、可验证性和后续演进成本。
