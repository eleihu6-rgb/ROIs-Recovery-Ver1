# PBS Bidding Calendar 多余纵向滚动条修复设计

日期：2026-07-16
状态：已确认，已实施
范围：`pbs-portal` 左侧共享 `BIDDING CALENDAR` 内容区与 Pairing 日期操作弹层

## 1. 背景

在 Pairing 页面点击左侧 `BIDDING CALENDAR` 的日期并打开 Pairing bid 操作弹层后，左侧白色日历卡片右边会出现一条接近整栏高度的原生纵向滚动条。

这不是内容真的放不下。当前日历网格和 Pairing 操作弹层下方仍有明显空白，现有工作台设计高度足以容纳完整内容。

问题来自 `DashboardSchedulePanel` 的内容外层使用了 `overflow-x-auto`。CSS 中一个方向使用 `auto` 时，另一个方向的 `visible` 会按滚动容器规则计算为 `auto`。Pairing 操作弹层采用绝对定位，只要其溢出范围进入该内容层的 scroll overflow，浏览器就会为整块内容生成纵向滚动条。结果是：

- 左侧卡片底部空白没有被自然用于展示操作弹层。
- 用户看到一条没有业务意义、视觉很重的外层滚动条。
- 用户可能误以为必须滚动才能完成 Pairing bid。

这条外层滚动条与 `PAIRING NUMBERS` 列表内部用于浏览大量 pairing 的小滚动条不是同一个滚动区域。

## 2. 目标

1. 左侧 `BIDDING CALENDAR` 不再出现多余的整栏纵向滚动条。
2. Pairing 日期操作弹层自然使用日历卡片下方的可用空白，不因外层 scroll container 被迫滚动。
3. `PAIRING NUMBERS` 列表内部仍可独立纵向滚动。
4. 不修改日历网格、事件条、操作弹层的业务字段、保存逻辑或定位语义。
5. 不破坏共享工作台现有的缩放、自适应、展开/收起和左右栏布局。
6. 不影响刚恢复的 Pairing 日历详情 viewport portal。

## 3. 非目标

- 不通过 `scrollbar-width: none`、`::-webkit-scrollbar { display: none }` 等方式把错误滚动条视觉隐藏。
- 不把 Pairing 日期操作弹层迁移到 `document.body` portal。
- 不重做日历高度计算或按浏览器尺寸增加第二套响应式状态。
- 不修改 `ScaledPageCanvas` 的 `pageScale`、design width/height 或 fit/adaptive 分界。
- 不移除 Pairing Numbers 内部列表的滚动能力。
- 不处理 Pairing 详情的 base/rank 匹配问题。

## 4. 方案比较

### 方案 A：只隐藏外层滚动条

给内容容器增加 scrollbar hide 样式。

优点：

- 视觉上立即看不到滚动条。

缺点：

- 错误的滚动容器仍然存在。
- 内容仍可能在不可见滚动区域内移动或被裁切。
- 键盘、触控板和浏览器之间的行为不一致。

结论：不采用。

### 方案 B：操作弹层改为 body portal

把日期操作弹层移出日历内容容器。

优点：

- 弹层不再贡献日历容器的 scroll overflow。

缺点：

- 需要重新处理缩放后的 anchor 坐标、浏览器 resize、外部点击和焦点。
- Pairing 日期操作弹层本来就应属于左侧卡片，不需要变成视口级 modal。
- 改动和回归风险明显超过问题本身。

结论：不采用。

### 方案 C：移除不必要的外层滚动容器（推荐）

共享日历在设计坐标中具有固定且足够的宽度：共享工作台左栏为 `712px`，内容最小宽度为 `632px`，再加现有左右 padding 后仍能放入卡片；窄屏由 `ScaledPageCanvas` 对整个设计画布缩放。因此该内容层不需要 `overflow-x-auto`。

移除内容外层的 `overflow-x-auto`，让日历和绝对定位操作弹层按普通布局在左侧卡片内部显示。左侧 section 继续保留自身的圆角和裁切边界，折叠时仍由 shared calendar clipper 负责裁切。

优点：

- 从根因消除错误的纵向 scroll container。
- 不新增 portal、定位状态或 scrollbar hack。
- 不修改内部 Pairing Numbers 列表的滚动。
- 改动集中且符合现有固定设计宽度与整体缩放架构。

结论：采用。

## 5. 详细设计

### 5.1 日历内容区

`DashboardSchedulePanel` 中包裹 `ScheduleTierMatrix` 和 `ScheduleEventCalendar` 的内容层：

- 移除 `overflow-x-auto`。
- 保留现有 `px-6 pb-6` 间距。
- 不增加 `overflow-y-auto`、固定高度或隐藏 scrollbar 样式。
- 增加稳定的测试标识，用于验证该区域没有成为纵向滚动容器。

日历 card 自身继续使用现有 `min-h-full` 和圆角裁切。Pairing 操作弹层仍由 `ScheduleEventCalendar` 绝对定位，但可以自然覆盖日历下方尚未占用的卡片空间。

实施前必须记录当前 Pairing 页面打开日期操作弹层后的 computed style 与几何基线：

- 内容层的 `overflow-x` / `overflow-y`。
- `DashboardSchedulePanel`、shared calendar clipper、calendar grid 和 action popover 的 bounding box。
- 内容层设置非零 `scrollTop` 后是否产生有效滚动。

移除 `overflow-x-auto` 后，内容层的 computed `overflow-x` / `overflow-y` 都不得为 `auto` 或 `scroll`。不得用 `scrollHeight <= clientHeight` 代替这项判断，因为非滚动元素的可见溢出同样可能计入 `scrollHeight`。

### 5.2 裁切边界与最坏几何状态

`DashboardSchedulePanel` 的 section 和 shared workbench calendar clipper 仍保留 `overflow-hidden`，用于圆角与折叠裁切。因此实施不能只证明滚动条消失，还必须证明 action popover 完整位于实际裁切祖先边界内。

必须覆盖：

- 第一周日期：popover 按现有规则向下展开。
- 第二周及后续日期：popover 按现有规则向上展开。
- Pairing 数量较多，内部列表发生滚动。
- 出现 `blockedMessage`。
- 出现 `saveError`，导致 popover 高度增加。
- shared workbench 的 Pairing 页面调用位置负责验证上述 action popover 几何状态。
- Dashboard 独立页面不提供 Pairing 日期操作入口，只负责验证移除 overflow 后的横向布局与基础日历边界。

在这些状态下，popover 的 top/bottom/left/right 都必须位于 `DashboardSchedulePanel` 可视边界内，按钮不得被 section 或 shared clipper 裁切。

如果基线或自动化证明单纯移除 `overflow-x-auto` 后仍存在裁切，则不得通过恢复外层滚动、隐藏 scrollbar 或迁移到 body portal 解决。回退方案限定为：在 `ScheduleEventCalendar` 内对 action popover 做局部纵向位置校正，在渲染后依据 popover 与 `DashboardSchedulePanel` 可视边界的差值仅向上或向下平移，使其保持在卡片内部；保持原 anchor 的横向位置、业务内容、外部点击和焦点行为。几何计算必须使用同一布局坐标系；若使用 `getBoundingClientRect()` 得到视口像素差值，应用到缩放画布内部 CSS 位移前必须按当前有效 scale 换算，禁止把屏幕像素直接当成设计坐标。只有几何测试失败时才实施该校正，避免预先增加测量状态。

### 5.3 内部列表滚动

`PairingCalendarBidPopoverContent` 的 Pairing Numbers 列表继续保持：

- 正常状态保持 `118px` 可视高度。
- `blockedMessage` 或 `saveError` 出现时使用 `102px` 紧凑高度，为状态信息释放空间；记录仍通过内部滚动完整访问。
- `overflow-y-auto`。
- 搜索、checkbox、选中态和日期范围展示不变。

只有 pairing 记录列表内部允许出现滚动条；左侧整个日历卡片不应因为该列表或弹层而滚动。

### 5.4 自适应约束

- `1920 × 1080`：日历、操作弹层和按钮完整位于左侧白色卡片内，不出现外层纵向滚动条。
- `1440 × 900`：沿用 adaptive scale，逻辑设计宽高不变；不产生额外横向或纵向滚动。
- `1024 × 768`：沿用 full-fit scale，整页缩小展示；操作弹层仍可见且可操作。
- 页面 resize 后继续由 `ScaledPageCanvas` 统一重新计算 scale，不新增 resize listener。
- 左侧日历折叠/展开的宽度、clipper、transition 和持久化状态不变。

### 5.5 与详情弹窗的边界

本次只修改日历卡片内部的日期操作弹层容器。点击蓝色 Pairing 事件打开的详情弹窗继续使用已确认的 `portalToBody` viewport modal：

- overlay 仍覆盖浏览器视口。
- 不受本次日历 content overflow 调整影响。
- 焦点陷阱和关闭后焦点恢复不变。

## 6. 测试与验收

### 6.1 组件测试

更新 `DashboardSchedulePanel` 或共享工作台相关测试：

- 内容区不再包含 `overflow-x-auto` / 纵向 scroll container 行为。
- Pairing Numbers 内部列表仍包含 `overflow-y-auto`。
- Pairing 日期操作弹层仍能渲染、搜索、选择 pairing、选择 Tier 和提交。

### 6.2 Playwright

使用真实 PBS Portal 工作台路径验证：

1. 打开 Pairing 页面。
2. 点击左侧日历可添加 Pairing bid 的日期。
3. 在 `1920 × 1080`、`1440 × 900`、`1024 × 768` 下验证：
   - 日历内容层的 computed `overflow-x` / `overflow-y` 均不是 `auto` 或 `scroll`。
   - 尝试设置内容层 `scrollTop` 后仍为 `0`，不能产生有效外层滚动。
   - 分别打开第一周向下展开、后续周向上展开的 Pairing 操作弹层。
   - 普通状态、`blockedMessage` 和 `saveError` 状态下，popover bounding box 均位于左侧卡片实际裁切边界内，允许 1px 取整误差。
   - `Cancel` 和 `ADD BID` 可见且可点击。
   - Pairing Numbers 列表 computed `overflow-y` 为 `auto`；记录超出固定高度时 `scrollHeight > clientHeight` 且可改变 `scrollTop`。
4. 打开蓝色 Pairing 详情，确认其仍是 viewport 级弹窗。
5. 折叠并重新展开左侧日历，确认布局与滚动状态正常。
6. 在 Dashboard 独立页面确认日历内容没有横向溢出，matrix、weekday 和 calendar grid 均位于卡片内。

### 6.3 UI 门禁

至少执行：

- 相关 Vitest。
- 相关 Playwright。
- `pbs-portal npm run lint -- --quiet`。
- `pbs-portal npm run build`。
- 根目录 `npm run check:ui`，hard violations 必须为 0。
- `git diff --check`。
- GitNexus `detect_changes`。

### 6.4 人工 QA

更新现有 Pairing 日历 QA 文档，明确区分：

- 外层日历不滚动。
- Pairing Numbers 内部列表可滚动。
- 卡片底部空白可以容纳操作弹层。
- 三个目标视口与浏览器 resize 均不裁切按钮。

## 7. 预计影响范围

预计只修改：

- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`
- 相关 Portal 组件/页面测试
- `e2e/tests/pbs-portal/` 下 Pairing 日历回归测试
- `docs/test-cases/pbs/dashboard/` 下人工 QA 文档

不修改：

- API、contract、server、database、migration。
- `ScaledPageCanvas`。
- Pairing Numbers 业务数据和保存 payload。
- Pairing 日历详情 portal 实现。

## 8. 风险与回滚

主要风险有两个：

1. 移除横向滚动容器后，在非标准调用位置出现内容横向溢出。当前 `DashboardSchedulePanel` 的两个调用位置都在固定设计画布内，且最小内容宽度小于可用栏宽；Playwright 必须覆盖 Dashboard 独立页面和 shared workbench Pairing 页面。
2. action popover 的绝对定位溢出继续向祖先传播后，被 section 或 shared clipper 的 `overflow-hidden` 裁切。必须用第一周/后续周、blocked/error 增高状态的几何断言证明安全；若失败，使用第 5.2 节限定的局部纵向位置校正。

若验证发现某个调用位置确实需要横向滚动，不应恢复当前混合轴滚动容器；应把横向滚动限制在基础 matrix/calendar grid 层，同时让 action popover 位于该 scroll layer 外。该拆分属于备选修复，不在正常实现路径中预先增加。

## 9. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个共享日历内容容器和紧邻测试，拆分会增加同文件冲突。
- Suggested split: 不拆。
- Write boundaries: `DashboardSchedulePanel`、相关 Vitest/Playwright、QA 文档。
- Conflict risk: Medium；共享 Bidding Calendar 同时服务 Dashboard、Pairing、Tier、Reserve、Days Off 等页面。
- Execution gate: 用户审阅并明确批准本 spec 后再实施；实施前必须对目标 symbol 跑 GitNexus impact。
