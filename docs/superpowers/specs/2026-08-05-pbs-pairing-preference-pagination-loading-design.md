# PBS Pairing Preference 结果刷新回顶与骨架屏修复设计

## 背景

`Configure Pairing Preference` 弹窗中的 Pairing 列表在分页、关键词搜索、应用筛选或清除筛选后存在两个体验问题：列表滚动位置可能仍停留在旧结果底部；请求期间继续显示旧数据，且仅展示刷新文案，没有表格骨架屏，容易让用户误认为旧数据已经符合新条件。

## 目标

- 分页、关键词搜索、应用筛选或清除筛选导致结果条件变化后，Pairing 列表滚动容器立即回到顶部。
- 新结果请求期间隐藏旧数据，改为展示保持表格尺寸和列结构的骨架行。
- 加载期间禁用分页按钮，防止重复翻页。
- 请求完成后展示目标页数据，并保持跨页已选 Pairing 不变。

## 实现范围

- 仅修改 `PairingPreferencePicker` 的结果查询过渡加载与列表滚动行为。
- 为实际承载数据行的滚动容器增加稳定引用和测试标识。
- 使用 TanStack Query 的 placeholder 状态识别查询键已经变化、当前仍持有旧结果的过渡阶段，覆盖分页、关键词搜索、`Apply filters` 和 `Clear filters`。
- 普通后台重新拉取未改变查询键时沿用现有刷新行为，不显示骨架屏。
- 不删除 TanStack Query 的缓存策略；缓存只用于请求衔接，不允许旧结果继续呈现为新条件或新页内容。
- 不修改后端接口、分页契约、筛选逻辑、选择数据结构和弹窗整体布局。

## 交互规则

1. 用户切换分页、输入关键词完成 debounce，或在校验成功且筛选条件实际变化时执行 `Apply filters` / `Clear filters`，列表滚动容器回到 `scrollTop = 0`。
2. 新结果返回前，旧数据行不可见，数据滚动区显示不可交互的骨架行，并设置 `aria-busy="true"`。
3. 骨架屏保留表头，并使用 7 行、每行 40px 的逐列骨架，占满现有 280px 数据滚动区，避免弹窗明显跳动。
4. 加载期间上一页和下一页按钮及当前页列表选择均禁用。
5. 请求失败时沿用现有局部错误与 Retry 行为，不恢复误导性的旧页数据。
6. 分页加载期间页码文案展示用户刚刚选择的目标页；搜索或筛选统一回到第一页。
7. 校验失败、重复应用相同筛选或在空筛选状态重复清除不会改变查询键，因此不显示骨架屏，也不重置滚动位置。

## 验收标准

- 将 Pairing 列表滚动到底部后执行分页、关键词搜索、`Apply filters` 或 `Clear filters`，滚动位置均回到顶部。
- 在延迟响应期间能够看到表格骨架屏，看不到旧业务数据。
- 加载期间分页按钮不可点击；加载结束后按页码恢复可用状态。
- 跨页选择仍然保留，现有筛选与搜索行为不回归。
- 单元测试和真实 Playwright 用例分别覆盖分页、关键词 debounce 搜索、`Apply filters`、`Clear filters` 四种查询键变化时的回顶、骨架屏和旧数据隐藏。
- `pbs-portal` 相关测试、构建、Lint 与根目录 `npm run check:ui` 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单个组件及其对应测试的局部修复，工作内容紧密耦合，拆分会增加协调成本。
- Suggested split: 不拆分，由主 agent 完成实现、测试与验证。
- Write boundaries: `PairingPreferencePicker`、对应单元测试、Playwright 用例和 QA 测试文档。
- Conflict risk: 低；实施时保留工作区内其他模块的既有改动。
- Execution gate: spec 审查通过并由用户确认后开始实施。
