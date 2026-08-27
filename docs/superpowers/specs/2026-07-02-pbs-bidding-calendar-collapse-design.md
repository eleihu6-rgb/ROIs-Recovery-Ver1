# PBS BIDDING CALENDAR 可收起设计

## 背景

PBS Portal 的共享工作台左侧固定显示 `BIDDING CALENDAR`。该区域由 `SharedBiddingWorkbenchLayout` 统一挂载，并在 `Pairing / Tier / Reserve / Award / Days Off` 等工作台页面间共享。

2026-07-03 复核后明确：`Dashboard` 不是共享工作台折叠范围。Dashboard 保持原有左侧用户信息、中间 `BIDDING CALENDAR`、右侧 `MESSAGE CENTER` 的固定三栏布局，不展示收起 / 展开按钮，也不读取共享工作台的折叠偏好。

当前左侧日历固定占用约 `680-712px` 宽度。用户反馈部分工作流并不频繁使用日历，导致右侧业务区可用空间偏低。本设计目标是在不改变日历业务行为和数据契约的前提下，让用户可以按需收起左侧日历，把空间让给右侧业务区。

## 目标

- 支持一键收起和展开共享 `BIDDING CALENDAR`。
- 默认保持展开，避免改变现有用户首屏习惯。
- 用户手动收起或展开后，在当前浏览器持久记住选择。
- 收起后左侧日历容器宽度过渡到 `0px`，日历内容被外层容器裁切，右侧业务区扩展。
- 页面左边缘保留一个小型展开按钮，方便用户找回日历。
- 收起和展开带有接近参考站点的丝滑动画，避免日历瞬间卸载造成卡顿。
- 保持现有日历数据、Tier 选中状态、query cache、Days Off 与 Pairing 日历交互语义不变。
- Dashboard 保持固定三栏布局，不加入日历折叠交互。

## 非目标

- 不调整 `BIDDING CALENDAR` 的数据来源、API contract 或后端服务。
- 不改变 `DashboardSchedulePanel` 内部的 Days Off、Pairing bid、Tier matrix 业务规则。
- 不重构 PBS Portal 顶部导航、右侧业务页面布局或路由结构。
- 不改变 Dashboard 的固定三栏信息布局。
- 不新增新的日历展示模式、顶部工具栏入口或全局设置项。
- 不把本次改动扩展为日历数据懒加载或查询预取策略优化。

## 用户体验

### 展开状态

- 共享工作台页面保持现有两列布局：左侧 `BIDDING CALENDAR`，右侧业务内容。
- 左侧日历标题区域提供一个收起按钮。
- 按钮使用图标为主，`aria-label` 使用英文，例如 `Collapse bidding calendar`。
- 按钮不新增大段说明文字，避免增加视觉噪音。

### Dashboard 固定布局

- Dashboard 保持 `436px / minmax(0, 1fr) / 365px` 三栏布局。
- Dashboard 中间日历不展示 `Collapse bidding calendar` 按钮。
- Dashboard 不展示左边缘 `Expand bidding calendar` 按钮。
- 即使浏览器 `localStorage` 中存在共享工作台折叠偏好，Dashboard 仍保持固定展开的三栏页面。
- Dashboard 不用固定高度裁切中间日历；当内容高度超过当前视口时，页面允许自然纵向滚动，卡片底部圆角和月历最后一行必须完整可达。

### 收起动作

- 用户点击收起按钮后，左侧日历容器向 `0px` 收起，日历内容保持固定宽度并被外层容器连续裁切。
- 右侧业务区随布局过渡同步扩展，避免先隐藏日历再移动内容的跳变。
- 当前动画使用 `400ms cubic-bezier(0.22, 1, 0.36, 1)`，日历内容可配合轻微位移，但不做明显硬淡出。
- 如果系统设置 `prefers-reduced-motion: reduce`，则直接切换布局，不播放动画。

### 收起状态

- 左侧日历不保留布局宽度。
- 右侧业务区占用原日历区域。
- 页面左边缘显示一个小型浮动展开按钮，按钮不占布局宽度。
- 展开按钮使用图标为主，`aria-label` 使用英文，例如 `Expand bidding calendar`。
- 隐藏的日历内容不能继续被鼠标点击或键盘 Tab 聚焦，但组件保持挂载以支持顺滑动画和状态保留。

### 展开动作

- 用户点击左边缘展开按钮后，`0px` 日历容器扩展回完整宽度，左侧日历随容器裁切边界顺滑展开。
- 布局恢复为原两列比例。
- 展开后继续显示之前的共享日历数据和 active Tier。

## 状态与持久化

新增一个共享工作台级 UI 状态：

```text
biddingCalendarCollapsed: boolean
```

状态语义：

- 默认值为 `false`，即默认展开。
- 用户点击收起时写入 `true`。
- 用户点击展开时写入 `false`。
- 状态持久化到当前浏览器，例如 `localStorage` key `pbs.workbench.biddingCalendarCollapsed`。
- 如果浏览器禁用 storage 或读取失败，则回退到本次页面生命周期内的默认展开状态。

该状态只控制共享布局显示，不属于业务草稿状态，不传给后端，也不影响 bid 保存。

## 组件边界

### `SharedBiddingWorkbenchLayout`

主要承载折叠状态和布局切换：

- 读取并更新 `biddingCalendarCollapsed`。
- 根据折叠状态切换日历 flex item 的 `width / flex-basis`：
  - 展开：共享工作台日历宽度为 `712px`。
  - 收起：日历容器宽度为 `0px`，左侧日历不占布局宽度。
- 始终挂载 `DashboardSchedulePanel`，通过外层 `overflow-hidden` 裁切、内容轻微 `transform` 和 `inert/aria-hidden` 控制隐藏状态。
- 在折叠列边缘渲染不占布局宽度的浮动展开按钮。
- 保持现有 query prefetch 逻辑不变。

该布局不包裹 Dashboard。Dashboard 使用自身三栏页面布局，不接入折叠状态。

### `DashboardPage`

- 保持固定三栏 grid。
- 直接渲染 `DashboardSchedulePanel`，不传入 `onCollapse`。
- 外层只保留 page shell 的最小高度，不设置 `overflow:hidden` 裁切内容；loading 态由 loading 组件自身保持紧凑，避免被固定顶部导航遮挡。

### `DashboardSchedulePanel`

保持业务职责不变，只接收一个可选的折叠控制入口：

- 在标题区域附近渲染收起按钮。
- 收起按钮只触发布局状态变化。
- 不在该组件内持久化状态。
- 不改变日历事件、Tier matrix、Days Off、Pairing bid 的业务逻辑。

### 共享状态实现

优先采用最小实现：

- 可在 `SharedBiddingWorkbenchLayout` 附近新增轻量 hook 管理 `localStorage` 持久化。
- 如果实现时发现需要跨更多组件订阅，再考虑提取到 `pbs-portal/src/shared/store`。
- 不新增依赖，不引入新的状态管理库。

## 可访问性

- 收起按钮和展开按钮必须是 `button`。
- 按钮必须有明确英文 `aria-label`。
- 图标按钮必须有 hover cursor，符合 PBS Portal 现有交互规范。
- 收起时隐藏日历内容应避免被 Tab 聚焦；实现优先使用 `aria-hidden` + `inert`，不通过立即卸载组件来隐藏内容。
- 动画必须尊重 `prefers-reduced-motion`。

## 数据与缓存影响

- `useBiddingCalendarStore` 中已有的 `activeTierLabel` 语义保持不变。
- `biddingCalendarQueryKey`、`dashboardUserProfileQueryKey`、`tierPageDataQueryKey` 的预取行为保持不变。
- 路由切换时仍复用同一份共享日历数据和状态。
- 收起日历不会触发业务保存、撤销、重载或清空 query cache。
- 如果收起时存在日历 popover，应关闭浮层，避免隐藏面板外残留操作层。

## 样式与动画

- 不新增魔法字号、硬编码颜色、硬编码圆角或超档字重。
- 图标使用现有图标库，按钮尺寸遵循 PBS Portal 现有紧凑按钮规范。
- 动画只作用于布局 gap、日历容器 `width / flex-basis` 和日历内容轻微位移。
- 不使用大面积装饰、营销式样式或额外说明文本。
- 折叠状态下右侧内容不应出现横向空白列。
- Dashboard 不参与折叠；右侧 `MESSAGE CENTER` 必须保持固定窄列比例，不能被拉伸成大面积空白。

## 测试策略

### 自动化测试

更新或新增 `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`：

- 默认进入共享工作台时日历展开。
- 点击收起按钮后，布局进入收起状态，左侧日历内容 `aria-hidden/inert`，右侧内容使用扩展布局。
- 收起状态写入浏览器持久化；重新渲染后仍保持收起。
- 点击左边缘展开按钮后，日历恢复展开。
- 切换 `Pairing / Tier` 等路由后，active Tier 不丢失。
- 收起后不会触发 Days Off 或 Pairing bid mutation。

新增或更新 PBS Portal Playwright 测试：

- 在共享工作台页面真实点击收起按钮。
- 确认共享工作台 `BIDDING CALENDAR` 内容处于折叠隐藏状态，展开按钮可见。
- 用户点击展开按钮后，共享工作台 `BIDDING CALENDAR` 和当前 period header 恢复可见。
- Dashboard 回归：即使存在共享工作台折叠偏好，也保持固定三栏布局，且无收起 / 展开按钮。
- Dashboard 回归：中间日历 panel 高度随内容自然增长，不能把底部月历和圆角裁掉。
- 使用 mock API 保持测试稳定，不依赖生产数据。

### QA 人工测试文档

新增文档：

```text
docs/test-cases/pbs/dashboard/2026-07-02-bidding-calendar-collapse.md
```

内容覆盖：

- 默认展开。
- 收起后右侧业务区扩展。
- 刷新页面后保持收起。
- 展开后日历恢复。
- 在 `Pairing / Tier / Days Off` 等共享工作台页面间切换时状态保持。
- Dashboard 固定三栏布局不参与折叠。
- Days Off 可编辑页面和 Pairing 日历加 bid 入口不被折叠功能破坏。

## 验收标准

- 默认进入 PBS Portal 共享工作台时，`BIDDING CALENDAR` 展开。
- 用户点击收起后，左侧日历容器宽度收起到 `0px`，右侧业务区扩展。
- 收起状态下页面左边缘有可点击的浮动展开按钮。
- 用户点击展开后，左侧日历恢复原布局。
- 用户刷新页面或重新进入共享工作台后，保留上一次收起或展开选择。
- active Tier 在收起、展开和路由切换后保持一致。
- Dashboard 不出现收起 / 展开按钮，不读取共享工作台折叠偏好，始终保持固定三栏布局。
- 收起和展开有短动画；关闭动画偏好的系统不播放动画。
- 现有日历业务行为、数据请求和保存流程不变。
- 相关自动化测试通过，新增 QA 文档可执行。
- 因为涉及前端运行代码，实施时必须递增 `gantt/src/version.ts` 的 `FRONTEND_VERSION`。

## 风险与处理

- 风险：隐藏日历后仍能 Tab 进入内部按钮。
  - 处理：收起状态使用 `aria-hidden`、`inert` 或不渲染可聚焦内容。
- 风险：动画导致缩放画布内出现横向溢出。
  - 处理：左侧容器使用 `overflow-hidden`，右侧列保持 `minmax(0, 1fr)`。
- 风险：收起时已有 calendar popover 残留。
  - 处理：收起动作触发前关闭日历内当前浮层。
- 风险：直接卸载日历导致 active Tier 丢失。
  - 处理：active Tier 仍由共享 store 管理，折叠状态不清空该 store。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 PBS Portal 共享布局、轻量 UI 状态、测试和 QA 文档，单 agent 可以更好控制边界。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/app/layout`、必要的 shared store 或 hook、对应测试、`e2e/tests/pbs-portal`、`docs/test-cases/pbs`、`gantt/src/version.ts`。
- Conflict risk: 多 agent 容易同时修改共享布局和同一批测试文件，冲突风险高于收益。
- Execution gate: 用户审阅并批准本 spec 后，才能进入实施计划和代码修改。
