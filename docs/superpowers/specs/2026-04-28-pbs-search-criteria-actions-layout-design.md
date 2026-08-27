# PBS Search Pairings 条件区操作按钮布局调整设计

## 背景

`/pairing/search` 页面当前把 `BID THESE PROPERTIES` 和 `ADD MORE SEARCH CRITERIA` 放在 `SEARCH RESULTS` 结果统计行右侧。用户反馈这两个按钮语义上属于 `SEARCH CRITERIA` 条件模块，放在结果区会让人误解它们作用于结果列表。

## 目标

- 将 `BID THESE PROPERTIES` 和 `ADD MORE SEARCH CRITERIA` 移入 `SEARCH CRITERIA` 模块。
- 按钮放在 `SEARCH CRITERIA` 标题行右侧，与标题同一行右对齐。
- `SEARCH RESULTS` 区域只保留结果标题、结果统计、刷新/错误提示和结果列表，不再承载条件操作按钮。
- 两个按钮都使用有边框样式，避免现在 ghost button 看起来不像可点击操作。

## 范围

本次只调整前端布局和样式：

- 修改 `pbs-portal/src/features/pairing/components/pairing-search-panel.tsx` 的按钮渲染位置。
- 修改 `pbs-portal/src/features/pairing/components/pairing-search-panel.module.css` 的标题行布局和按钮样式。
- 同步必要的前端测试断言。

不调整后端接口、不调整搜索条件逻辑、不调整 Layer dialog 行为、不调整 `current-rules-preview` 的隐藏规则。

## 交互设计

### 普通 Search Criteria 模式

`SEARCH CRITERIA` 模块标题行结构：

- 左侧：`SEARCH CRITERIA` 标题。
- 右侧：两个操作按钮。
  - `BID THESE PROPERTIES`
  - `ADD MORE SEARCH CRITERIA`

按钮行为保持不变：

- `BID THESE PROPERTIES`：打开 Layer 选择弹窗并写入当前 draft。
- `ADD MORE SEARCH CRITERIA`：打开 criteria picker。
- `ADD MORE SEARCH CRITERIA` 在 criteria picker 展开时显示选中状态；picker 关闭后恢复普通状态。

按钮禁用规则保持不变：

- `BID THESE PROPERTIES` 在无条件、加载中或写入中时禁用。
- `ADD MORE SEARCH CRITERIA` 保持可用，用于添加条件。

### Current Rules Preview 模式

保持当前设计：不显示 `BID THESE PROPERTIES` 和 `ADD MORE SEARCH CRITERIA`。

## 视觉设计

按钮采用项目内现有紧凑工具按钮风格：

- 高度：32px。
- 边框：1px solid。
- 圆角：4px。
- 背景：白色。
- `BID THESE PROPERTIES`：默认使用深灰文字和浅灰边框；hover、focus、active 时进入选中态。
- `ADD MORE SEARCH CRITERIA`：默认使用深灰文字和浅灰边框；criteria picker 展开时进入选中态。
- 两个按钮必须始终使用同一套 outline button 结构，不能出现一个有边框、一个像 ghost button 的视觉差异。
- 选中态定义为白底、紫色边框和紫色文字，与原 `BID THESE PROPERTIES` 按钮视觉状态一致。
- hover/focus/active 状态使用同一套选中态视觉。

布局要求：

- 标题行使用 flex，两端对齐。
- 小屏或宽度不足时按钮允许换行，避免文字挤压或重叠。
- 不改变结果列表高度计算和分页区域位置。

## 验收标准

- 在 `/pairing/search` 普通 criteria 模式下，两个按钮出现在 `SEARCH CRITERIA` 标题右侧。
- `SEARCH RESULTS` 结果统计行不再显示这两个按钮。
- 两个按钮都有可见边框。
- `ADD MORE SEARCH CRITERIA` 展开 picker 后有选中状态，关闭 picker 后选中状态消失。
- `BID THESE PROPERTIES` 和 `ADD MORE SEARCH CRITERIA` 原有点击行为不变。
- `current-rules-preview` 模式仍不显示这两个按钮。
- 相关前端测试通过。

## 验证计划

- 运行 `pbs-portal` 相关测试：
  - `npx vitest run src/features/pairing/pages/search-pairings-page.test.tsx src/features/pairing/pages/pairing-page.test.tsx`
- 运行 `pbs-portal` 构建：
  - `npm run build`
