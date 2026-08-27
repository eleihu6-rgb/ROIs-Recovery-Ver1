# PBS Bid Feedback 布局优化设计

## 1. 目标

优化 Crew Portal `Bid Feedback` 的信息层级，使大量 Pairing 可以快速浏览、比较和查看资格原因，同时保持现有 Feedback 数据、API 与业务计算逻辑不变。

## 2. 已确认方案

采用双栏主从布局：

- 左侧约 42%：紧凑列表/表格。
- 右侧约 58%：当前选中记录的详情。
- 弹窗打开、切换 `Award / Avoid / Days Off` 或分页后，默认选中当前结果的第一条。
- `Calendar` 保持整页视图，不强行套入双栏。

不采用当前大卡片重复展示详情的布局，也不采用行内展开详情。

## 3. 工具栏入口

- 删除独立的感叹号冲突按钮。
- 只保留一个紧凑的 `Bid Feedback` 图标按钮，视觉尺寸沿用原感叹号按钮，使用表示反馈的 `ChatBubbleLeftRightIcon`，不继续使用警告三角图标。
- 按钮右上角保留红色冲突数量徽标；数量为 `0` 时不显示徽标。
- 按钮提供可访问名称和 Tooltip：`Bid Feedback`。
- 点击该按钮打开现有 Bid Feedback 弹窗。

## 4. 弹窗信息层级

### 4.1 删除内容

弹窗中不再展示：

- `Rank, Base, and pre-assignment...` 灰色说明条；
- 黄色 `BID CONFLICTS` 摘要区。

冲突数量仍通过入口徽标提示，但不在弹窗顶部重复占用空间。

### 4.2 顶部控制区

- 保留标题、Crew、Period、Base Local Time 和关闭按钮。
- 保留 `Award / Avoid / Days Off` 页签。
- 保留 `Bids / Calendar` 视图切换。
- 控制区保持单层、紧凑，不增加新的说明横幅。

### 4.3 Bids 双栏布局

`Award` 和 `Avoid` 使用相同布局：

- 左侧基础表格列：`Pairing`、`Base`、`Start`、`End`、`Days`、`Credit`。
- `Award` 额外展示 Eligibility 状态图标；`Avoid` 不展示该列，因为 Avoid 不执行 Eligibility 检查。
- 表格支持当前分页；行可通过鼠标和键盘选择。
- 选中行具有明确背景和 `aria-selected` 状态。
- 不在每一行重复渲染完整 Eligibility 原因。
- 右侧展示 Pairing Number、Eligibility 状态、基地本地时间、Base、Days、Credit、Route、匹配的 Bid，以及具体资格原因；不展示现有 API 未提供的 Crew Rank 值。
- `Avoid` 不伪造 Eligibility 检查，右侧只展示 Pairing 与匹配 Bid 信息。
- 当前 `Award / Avoid` 页签以 `rawDirection` 为列表归类依据；详情不重复显示一个可能与页签混淆的方向字段。`exportDirection` 本次不新增展示。

`Days Off` 使用同一主从骨架：

- 左侧展示日期/范围、Tier、Property 和 Action。
- 右侧展示当前选中 Days Off 的完整日期集合、Tier、Property、Action 与现有结构化描述；不解析描述来伪造 API 未提供的时间范围。

### 4.4 Calendar

- 切换到 `Calendar` 后使用弹窗完整内容宽度。
- 保持现有 Award Pairing 与 Days Off 连续日历块语义。
- 返回 `Bids` 时恢复当前页签，并默认选中该页当前第一条记录。

## 5. 状态与边界

- 加载、错误、重试和空状态继续沿用现有实现。
- 当前页无记录时，左侧显示页签对应空状态，右侧不显示伪详情。
- 分页后若原选中项不在新页，自动选中新页第一条。
- 长 Route 和 Bid 名称允许换行，不新增横向滚动。
- 弹窗以 `1920×1080` 为视觉基线；视口宽度 `>=1280px` 使用左右双栏，`<1280px` 使用上下堆叠布局。
- 至少以 `1280×720` 和 `1024×768` 做响应式验收；内容允许纵向滚动，但不能出现横向滚动或被裁切。

## 6. 可访问性

- 紧凑入口支持键盘操作、Tooltip 和可访问名称。
- 表格行支持 `Enter` / `Space` 选择。
- 页签、视图切换、分页和关闭保持现有键盘语义。
- Eligibility 状态不能只依赖颜色，必须同时显示文字或图标的可访问标签。
- 弹窗关闭后焦点返回 `Bid Feedback` 入口。

## 7. 实现边界

- 仅调整 `pbs-portal` Bid Feedback 入口、弹窗布局及相关测试。
- 不修改 Feedback API contract、PBS Server、Redis、数据库或算法导出。
- 不新增依赖，不新增 migration。
- 复用现有 `PbsDialogFrame`、Feedback query 和 Calendar 组件。

## 8. 验收标准

- 工具栏只有一个带冲突数量徽标的紧凑 Bid Feedback 入口。
- 弹窗不再显示灰色说明条和黄色冲突区。
- Award/Avoid/Days Off 均采用左列表、右详情的主从布局。
- 打开、切换页签和分页后自动选中第一条。
- 列表不重复显示长 Eligibility 文案，右侧详情完整显示资格原因。
- 1920×1080 下无横向滚动，长 Route 可换行完整查看。
- 1280×720 下双栏完整可用；1024×768 下自动变为上下布局，内容不横向滚动、不裁切。
- 现有 Calendar、加载、错误、空状态和 Retry 行为不回归。
- 更新组件测试、Bid Feedback Playwright 和 QA 人工测试案例。
- `pbs-portal` test、lint、build、根目录 `check:ui` 与定向 Playwright 全部通过。

## 9. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一工具栏和弹窗组件，拆分会增加状态与测试冲突。
- Suggested split: 不拆分，由单一实现链路完成 UI、组件测试、Playwright 与 QA 更新。
- Write boundaries: `pbs-portal` Bid Feedback 组件、对应测试、`e2e/tests/pbs-portal` 与现有 QA 文档。
- Conflict risk: Low
- Execution gate: 用户审阅并明确批准本 spec 后再实施。
