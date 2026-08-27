# PBS Pairing Filters 下拉方向与标题层级修正设计

## 状态

- 文档状态：待用户审阅
- 日期：2026-08-17
- 目标模块：`pbs-portal`
- 目标页面：Crew Portal / Bid / Configure Pairing Preference
- 目标组件：`PairingPreferenceFilterDialog`
- 关联文档：
  - `docs/superpowers/specs/2026-08-17-pbs-pairing-preference-filter-dialog-design.md`
  - `docs/superpowers/specs/2026-08-17-pbs-pairing-preference-filter-dialog-ui-polish-design.md`
- 本文定位：修正上一版 station dropdown 的展开策略，并整理 `Pairing Filters` 弹窗里的标题层级。

## 背景

上一版 UI 修复把 `Pairing Filters` 里的 station dropdown 约束在 filter dialog footer 上方。这个策略能避免下拉被 footer 裁切，但行为不合理：

- 当 dropdown trigger 下方还有浏览器 viewport 空间时，下拉却向上打开。
- 用户看到的是“下面明明有空间，组件却往上挡住上方字段”。
- 这更像是绕过 footer 裁切，而不是解决浮层定位。

对照 Ant Design 这类成熟组件的思路，Select / Dropdown 通常把 popup 挂到 `document.body`，默认向下打开；只有接近浏览器 viewport 边缘、下方真实空间不足时，才自动调整方向或限制高度。它不会因为 modal 内部 footer 在下方就强制向上。

此外，当前 filter dialog 里的信息层级过多：

- 顶部有 `Pairing Filters`
- 内部又有 `BASIC`
- 字段 label 又是全大写
- `Length (days)`、`Credit (HH:MM)` 等字段视觉权重和分组标题混在一起

结果是标题层级不清晰，用户扫一眼很难分辨“分组标题”和“字段名”。

## 目标

- Station dropdown 默认向下展开，符合用户直觉。
- Dropdown 只以浏览器 viewport 作为翻转边界，不以 filter dialog footer 作为向上翻转依据。
- Filter dialog footer 是操作安全区：它可以限制 dropdown 最大高度，但不能导致 dropdown 莫名向上。
- 当下方 viewport 空间不足完整 dropdown 高度时，优先保持向下并压缩列表高度，内部滚动。
- 只有当下方 viewport 空间不足、且上方空间明显更适合时，才向上展开。
- Dropdown 不被外层弹窗 body 的 `overflow` 裁切。
- 整理弹窗标题层级，让 `Pairing Filters` 只有一个主标题，字段 label 清楚但不抢层级。
- 保持现有筛选字段、后端 contract、保存 payload 不变。

## 非目标

- 不引入 Ant Design。
- 不更换现有自定义 station multi-select 为第三方组件。
- 不修改 pairing search 后端筛选语义。
- 不修改 Pairing Preference bid 保存逻辑。
- 不修改 `Search Pairings` 独立页面。
- 不重做 `Configure Pairing Preference` 主弹窗。

## 推荐方案

采用“小范围修正定位策略 + 简化标题层级”的方案。

### Dropdown 定位

保留当前自定义 station multi-select，但修正定位规则：

1. Popup 继续 portal 到 `document.body`，避免被 filter dialog body 的 `overflow-y-auto` 裁切。
2. 默认 placement 为 `bottom`。
3. 可用空间计算只看浏览器 viewport：
   - `spaceBelowViewport = window.innerHeight - triggerRect.bottom - margin`
   - `spaceAboveViewport = triggerRect.top - margin`
4. 若 `spaceBelowViewport` 足够展示目标高度，则向下完整展开。
5. 若 `spaceBelowViewport` 不够展示目标高度，但仍能展示最小可用列表高度，则仍向下展开，并限制 dropdown list 的 `max-height`，内部滚动。
6. 只有当下方连最小可用高度都不足，且上方空间更大时，才向上展开。
7. Filter dialog footer 不是 popup 翻转边界。Dropdown 默认仍向下，但向下展开时需要限制最大高度，避免覆盖 `Clear All / Cancel / Apply Filters` 操作区。

### 高度策略

Dropdown 内部由两部分组成：

- search header
- options list

高度控制：

- Search header 固定高度。
- Options list 使用 `max-height`。
- 当空间不足完整高度时，只压缩 options list，不压缩 search header。
- Options list 最小可用高度应能显示至少约 3 个选项，避免出现只露一条的尴尬状态。
- 选项超过可视高度时，列表内部滚动。

### 标题层级

简化为两级：

1. Dialog title：`Pairing Filters`
2. Field label：字段名

删除或弱化内部大写分组标题：

- 不再显示强视觉的 `BASIC`、`STATIONS`、`ATTRIBUTES`。
- 如果保留分区，只用轻量 spacing / divider 区隔，不使用和字段 label 类似的全大写标题。

字段 label 使用 sentence case，降低视觉噪音：

- `Pairing start dates`
- `Check-in`
- `Check-out`
- `Length (days)`
- `Route station`
- `Layover station`
- `Layover count`
- `Credit (HH:MM)`
- `Attributes`

其中 `Attributes` 可以作为轻量小标题保留，因为它下面是 toggle group，不是单个字段。

## 交互细节

### 打开 dropdown

- 点击 `Route station` 或 `Layover station` trigger 后，dropdown 默认在 trigger 下方出现。
- Dropdown 宽度与 trigger 对齐。
- Dropdown 打开后，search input 自动聚焦。
- Dropdown 可以覆盖 filter dialog 下方内容，但不能被裁切。
- 点击弹窗内其他区域或 Esc 关闭 dropdown。

### 响应式和缩放

当前页面存在 workbench scale。Dropdown 仍需要按 trigger 的视觉缩放比例计算尺寸：

- 读取 trigger 的 `getBoundingClientRect()` 和 `offsetWidth` 计算 scale。
- Popup 挂到 body 后，用 `transform: scale(...)` 保持和弹窗视觉比例一致。
- Dropdown 的 left/top/bottom 坐标使用 viewport 坐标。
- 宽度和最大高度按 scale 反推设计尺寸，避免缩放后错位。

### Footer 关系

Footer 不再决定 dropdown 是否向上，但会作为操作安全区限制 dropdown 最大高度。

允许情况：

- Dropdown 向下打开，视觉上覆盖部分 filter dialog 内容或靠近 footer。
- 用户滚动 dropdown options list，而不是滚动整个 filter dialog body。

不允许情况：

- Dropdown 超出浏览器 viewport 下边缘。
- Dropdown 被 filter dialog body 或 footer 裁切，或覆盖 footer 按钮导致 `Clear All / Cancel / Apply Filters` 不可点击。
- Dropdown 因为 footer 在下面就直接向上挡住前面的字段。

## Playwright 验收标准

更新 `e2e/tests/pbs-portal/pairing-preference.spec.ts`。

### 目标用例

重点覆盖 `PBS-3530` 中的 filter dialog 响应式路径。

### 断言

在 `816 x 1256` 视口下：

- 打开 `Pairing Filters`。
- 点击 `Route station` trigger。
- 断言 route dropdown 可见。
- 断言 route dropdown 的 `data-placement` 默认为 `bottom`，因为截图场景中下方 viewport 空间足够。
- 断言 route dropdown 的 `rect.bottom <= window.innerHeight`。
- 断言 route dropdown 的 `rect.bottom <= footerRect.top + 1`，证明 footer 只限制高度，不触发向上翻转。
- 断言 route dropdown 没有被裁切，且 options list 可滚动。
- 关闭 route dropdown。
- 点击 `Layover station` trigger。
- 对 layover dropdown 做同样断言。

标题层级断言：

- 弹窗只有一个主标题 `Pairing Filters`。
- 不再出现强视觉分组标题文本 `BASIC` / `STATIONS`。
- 字段 label 可见：
  - `Pairing start dates`
  - `Route station`
  - `Layover station`
  - `Credit (HH:MM)`

布局断言：

- 弹窗主体无横向 overflow。
- 输入框和 station trigger 高度仍保持一致。
- Footer 按钮仍可见、可点击。

## 风险与边界

- 因为 dropdown portal 到 body，需要继续防止点击 dropdown 内部时被外层 dialog 的 outside click 关闭。
- 缩放场景下要同时验证坐标和尺寸，不能只看 DOM 是否存在。
- 如果某些极小 viewport 下面空间确实不足，dropdown 可以向上，但这必须由 viewport 空间触发，不由 footer 触发。
- 本轮不处理所有自定义 dropdown 的通用抽象，只修 `PairingPreferenceFilterDialog` 内 station multi-select，避免扩大影响面。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次是单个前端组件的交互和样式修正，改动集中在 `PairingPreferenceFilterDialog` 和对应 Playwright 用例。拆多 agent 会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: 主 agent 只写 `pbs-portal/src/features/pairing/components/pairing-preference-filter-dialog.tsx` 和 `e2e/tests/pbs-portal/pairing-preference.spec.ts`。
- Conflict risk: 低，但要注意当前工作区已有同一功能的大量未提交改动。
- Execution gate: 用户确认本 spec 后再实施。

## 验收命令

实现后至少运行：

```bash
cd /Users/lei/Codehub/rois-ai/e2e && npm run test:pbs-portal -- tests/pbs-portal/pairing-preference.spec.ts -g "PBS-3530"
cd /Users/lei/Codehub/rois-ai/pbs-portal && pnpm exec vitest run src/features/pairing/components/pairing-preference-picker.test.tsx src/features/pairing/components/pairing-preference-picker-filters.test.ts src/features/days-off/components/prefer-off-calendar-picker.test.tsx
cd /Users/lei/Codehub/rois-ai/pbs-portal && pnpm run build
cd /Users/lei/Codehub/rois-ai && npm run check:ui
cd /Users/lei/Codehub/rois-ai && git diff --check
```
