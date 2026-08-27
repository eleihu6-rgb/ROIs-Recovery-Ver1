# PBS Portal Help 图片全屏预览设计

## 目标

让用户能够在不离开 Help 文章的情况下放大页面截图并查看细节。

## 交互设计

- Help 截图显示放大光标和可感知的悬停反馈。
- 点击截图打开覆盖 Portal 的大图预览弹窗，窗口约占视口 `96% × 92%`。
- 图片预览属于沉浸式媒体查看器，不显示紫色标题栏和白色缩放工具栏。
- 预览继续使用项目统一的 `@rois/ui` `AppDialog` 提供 modal 遮罩、焦点约束、遮罩关闭和 `Esc` 关闭；仅在这个 Help 图片预览中隐藏 AppDialog chrome，不修改共享 AppDialog 或其他业务弹窗。
- 标题栏通过当前预览实例 `className` 内的 scoped descendant 样式 `[&_[data-app-dialog-header]]:hidden` 隐藏；禁止修改共享组件或添加全局 CSS。标题栏中的 `DialogTitle` 仍保留在 DOM 中并作为 dialog accessible name。
- 弹窗配置为 `modal=true`、`draggable=false`、`dismissable=true`、`showClose=false`。窗口使用 `width: 96vw`、`height: 92dvh`，同时受 AppDialog 的视口边距约束；body 使用 `min-height: 0`、`overflow: hidden`、无 padding。
- 图片视口填满整个弹窗 body，并在右上角提供一个悬浮圆形关闭按钮；除此之外不显示标题、缩放比例、放大、缩小或重置控件。
- 预览初始缩放为 `100%`。这里的 `100%` 是图片通过 `object-fit: contain` 完整适配图片视口后的基准尺寸，不是图片原始像素尺寸。
- 鼠标滚轮以 `25%` 为步长缩放，范围为 `50%–400%`。
- 滚轮缩放以鼠标在图片视口中的位置为锚点。
- 图片放大后可通过鼠标或触控板按住拖动查看。位移在每次拖动、缩放和窗口尺寸变化后重新夹紧：X/Y 轴只有在缩放后图片尺寸大于对应视口尺寸时才允许移动，最大位移不超过该轴溢出尺寸的一半，图片不能被拖到完全离开视口。
- 图片视口可聚焦；方向键每次沿可溢出轴平移 `40px`，`+`/`-` 调整缩放，`0` 重置视图。
- 每次打开和关闭预览都重置为 `100%` 和居中位置。
- 打开后焦点主动移入图片视口；关闭后通过触发按钮 ref 主动恢复焦点。

## 组件设计

- 新增 `HelpImagePreview`，负责弹窗、缩放、拖动和重置状态。
- `HelpScreenshot` 继续负责文章中的图片、标题、加载失败占位，并且只有缩略图触发 `onLoad` 后才允许打开 `HelpImagePreview`。
- 缩略图加载失败时维持现有占位提示，且不打开预览。
- 预览图片自身加载失败时，在弹窗 body 内显示带 `role="alert"` 的持久错误状态；悬浮关闭按钮、遮罩和 `Esc` 关闭路径继续可用。
- 不新增第三方图片预览或手势依赖。

## 无障碍

- 文章中的截图使用可聚焦按钮承载，并提供包含截图名称的 accessible name。
- 悬浮关闭按钮提供明确的 accessible name。
- `AppDialog` 继续接收标题用于对话框 accessible name，即使视觉标题栏隐藏。
- 图片视口提供 `Image preview canvas` accessible name，以及说明方向键、缩放键和重置键的 accessible description。
- 截图按钮原生支持 `Enter` / `Space` 打开；动态 `aria-live` 文本播报当前缩放比例和按 `0` 重置后的 `100%`，即使视觉缩放比例不显示。
- 悬浮关闭按钮提供清晰的键盘焦点样式。

## 范围

- `pbs-portal/src/features/help/components/help-article.tsx`
- 新增 `pbs-portal/src/features/help/components/help-image-preview.tsx`
- 更新 `e2e/tests/pbs-portal/help/` 下截图交互回归。
- 更新 `docs/test-cases/pbs/help/` 人工测试步骤。
- 不修改截图文件、Help 文案、业务页面或业务接口。

## 验收标准

- 点击任意已加载的 Help 截图后显示唯一一个 `AppDialog` 大图预览。
- 预览中不出现 AppDialog 标题栏或独立工具栏，只显示图片和右上角悬浮关闭按钮。
- 预览图使用同一 `src` 和 `alt`，初始显示 `100%`。
- 滚轮和键盘能调整缩放，并在 `50%` 与 `400%` 正确夹紧。
- 放大后鼠标拖动和方向键会改变允许溢出的图片位置，位移不超过夹紧边界；按 `0` 恢复 `100%` 和居中。
- `Enter` / `Space` 可打开；`Esc`、遮罩和关闭按钮均能关闭；关闭后焦点回到原截图。
- 缩略图加载失败占位不可打开预览；预览图加载失败显示 `role="alert"` 的持久错误状态且仍可关闭。
- E2E 断言打开后焦点进入图片视口、dialog accessible name 存在、键盘缩放与重置更新 `aria-live` 状态、悬浮关闭按钮有 accessible name 和可见焦点样式。
- 在 `1366×640` 与 `2048×1024` 下，E2E 检查 dialog bounding box 不超出视口、顶部 chrome 不存在、悬浮关闭按钮可见、body 和图片视口充满窗口、`100%` 图片完整位于图片视口内、底层页面没有横向溢出。
- Help E2E、ESLint、TypeScript、生产构建和 UI 门禁通过。

## 验证命令

```bash
cd e2e
npx playwright test -c config/playwright.config.ts --project=pbs-portal tests/pbs-portal/help/ --reporter=list --no-deps

cd ../pbs-portal
npx eslint src/features/help
npx tsc -b --pretty false
npm run build

cd ..
npm run check:ui
```

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 交互状态、展示组件和回归测试紧密耦合，单一实现者更稳妥。
- Suggested split: 无。
- Write boundaries: 单一实现者修改 Help 图片组件及 Help E2E。
- Conflict risk: 低。
- Execution gate: 用户确认本设计后实施。
