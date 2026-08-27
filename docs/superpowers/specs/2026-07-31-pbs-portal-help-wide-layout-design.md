# PBS Portal Help 宽屏布局设计

## 目标

修复 Help 文章在 2K 等宽屏窗口中集中于左侧、右侧留白过多的问题，同时让截图与正文保持统一对齐，并继续支持较小桌面窗口。

## 设计

- Help 右侧使用 `width: 100%`、`max-width: 1280px` 的居中内容画布，画布左右 padding 在桌面窗口中为 `32–40px`。
- 标题、说明文字、操作步骤、提示、字段表格、Controls 区域和 `HelpScreenshot` 统一使用 `max-width: 880px`，并通过 `margin-inline: auto` 在画布内水平居中。
- `HelpScreenshot` 不再使用独立的宽媒体宽度；其左右边缘应与同一文章的正文内容对齐，显示宽度不得超过图片 `naturalWidth`。
- 所有 `HelpFieldTable` 和 `HelpControlsRef` 均属于正文宽度，不根据文章单独分流。
- 当右侧可用宽度小于上述上限时，画布、正文和截图都使用 `width: 100%` 收缩；不新增横向断点布局。
- 左侧目录与右侧文章继续独立纵向滚动。
- `HelpHome` 仅允许复用同一个 `1280px` 居中画布规则，卡片结构和内容不变。

## 范围

- `pbs-portal/src/features/help/components/help-article.tsx`
- `pbs-portal/src/features/help/components/help-home.tsx`
- 更新 Help Playwright 视觉尺寸和滚动回归测试。
- 不修改 Help 文案、业务规则、页面路由或其他 Portal 业务页面。

## 验收标准

- 在 `2048×1024` 窗口下，内容画布宽度为 `1280px`，其相对右侧文章滚动区域水平居中，左右空余偏差不超过 `2px`。
- 在 `2048×1024` 窗口下，正文 DOM 和 Dashboard Overview、Bid Overview 截图宽度均不超过 `880px`，且截图不超过图片 `naturalWidth`；同一文章内正文与截图的左右边缘偏差均不超过 `2px`。
- 在 `1366×768` 和 `1366×640` 窗口下，页面级横向滚动宽度不超过视口宽度，文章内容不被裁切，截图宽度不超过右侧文章滚动容器。
- 分别滚动左侧目录和右侧文章：目标容器 `scrollTop` 增加，另一侧容器的 `scrollTop` 保持不变，页面根节点不承担文章滚动。
- Help E2E、TypeScript、ESLint、生产构建和 UI 门禁通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 Help 展示组件和对应测试，拆分会增加协调成本。
- Suggested split: 无。
- Write boundaries: 单一实现者修改 Help 布局与 Help E2E。
- Conflict risk: 低。
- Execution gate: 用户确认本设计后实施。
