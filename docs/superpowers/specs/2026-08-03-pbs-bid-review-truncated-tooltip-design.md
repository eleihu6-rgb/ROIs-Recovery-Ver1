# PBS Bid Review 截断提示 Tooltip 设计

## 目标

Bid 页面 `BID REVIEW` 区域保持当前单行紧凑布局。当提示文字因空间不足出现省略号时，用户可以通过 Tooltip 阅读完整内容。

## 范围

- 修改 `BidReviewPanel` 中预览提示文字的展示行为。
- 保留当前单行高度、横向排列和省略号样式。
- 仅文字实际溢出时启用 Tooltip。
- Tooltip 内容为当前提示的完整原文。
- Tooltip 使用 Portal 已有的实色卡片背景和前景色，不能透出后方文字。
- 同时支持鼠标悬停和键盘聚焦。

## 不在范围内

- 不改成两行或自动换行。
- 不改变提示文案、诊断规则或后端接口。
- 不修改 `+N more` 弹层行为。
- 不新增第三方依赖。

## 实现设计

在 `pbs-portal` 内复用 `@rois/ui` 的 `Tooltip`、`TooltipTrigger`、`TooltipContent` 和 `TooltipProvider`。提示文字渲染后，通过元素的 `scrollWidth > clientWidth` 判断是否发生截断：

- 已截断：Tooltip 可通过 hover 和 focus 打开，展示完整提示。
- 未截断：保持普通文本，不产生无意义 Tooltip。
- 使用 `ResizeObserver` 监听承载文字的元素；元素尺寸、页面缩放或字体布局变化时重新判断。
- 提示文案变化后重新判断溢出状态。

组件继续保留 `truncate` 和 `min-w-0`，因此不会增加 `BID REVIEW` 区域高度或挤压其他页面内容。

## 可访问性

- 截断文字可以获得键盘焦点；未截断文字不增加额外 Tab 停靠点。
- Tooltip 使用 `role="tooltip"`，并通过组件提供的 `aria-describedby` 与触发文字建立关联。
- Tooltip 支持 Esc 和失焦关闭，关闭后焦点位置保持不变。
- 完整内容不能只依赖鼠标操作。

## 验收标准

1. 短提示完整显示时不出现 Tooltip。
2. 长提示出现省略号时，鼠标悬停可查看全文。
3. 长提示通过键盘聚焦时可查看全文。
4. Tooltip 关闭后不影响页面其他操作。
5. `BID REVIEW` 区域高度、单行布局和 `+N more` 行为保持不变。
6. 在 Portal 页面缩放后，Tooltip 是否启用仍与实际截断状态一致。
7. 未截断文字不会进入额外 Tab 顺序；截断文字可通过 Tab 聚焦，Esc 或失焦可关闭 Tooltip 且焦点不丢失。
8. Tooltip 背景不透明，后方页面文字不会穿透并干扰阅读。

## 测试范围

- 组件测试：mock `clientWidth`、`scrollWidth` 和 `ResizeObserver`，稳定覆盖截断与未截断、文案变化、hover、focus、Esc，以及触发文字 `blur` 后 Tooltip 关闭且不发生程序性焦点转移。
- Playwright：使用确定性 fixture/路由响应提供长短两种提示；验证只有长提示触发 Tooltip、`role="tooltip"` 包含全文、Tab 聚焦与 Tab 移出后的关闭行为，以及单行布局。
- QA 案例：新增 `docs/test-cases/pbs/bid/2026-08-03-bid-review-truncated-tooltip.md`，覆盖鼠标、键盘、缩放和未截断边界。
- 交付验证：在 `pbs-portal/` 运行 `npm test`、`npm run lint`、`npm run build`；在仓库根运行 `npm run check:ui`。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该改动集中在一个小组件及其测试，多 Agent 协作成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal` Bid Review 组件、对应测试和 PBS QA 测试案例。
- Conflict risk: Low。
- Execution gate: 用户审阅并批准本 spec 后开始实施。
