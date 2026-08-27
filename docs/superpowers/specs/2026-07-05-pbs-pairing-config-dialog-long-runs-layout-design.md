# PBS Pairing 配置弹窗长列表布局修复 Spec

## 背景

在 `Search Pairings` 页面编辑 `Pairing Number` criteria 时，如果该 bid 已经包含大量 `CONFIRMED RUNS`，当前配置弹窗会被列表内容直接撑高。

截图中的现象是：

- 弹窗顶部被页面导航栏压住。
- `CONFIRMED RUNS` 长列表把整个弹窗撑到超过可视区。
- 底部 `CANCEL / UPDATE BID` 按钮贴近屏幕底部，操作不稳定。
- 背景页面已经被遮罩，但弹窗本体没有形成清晰的可滚动工作区。

这不是业务数据错误，而是弹窗布局缺少可视区约束。

## 目标

让 `Configure Pairing Number` 弹窗在长列表场景下仍然稳定、可读、可操作：

- 弹窗整体不能超过浏览器可视高度。
- 弹窗标题区和底部操作按钮始终可见。
- 中间内容区域内部滚动。
- `CONFIRMED RUNS` 自身应有合理最大高度，不再撑爆整个弹窗。
- 长列表场景下仍能删除 run、切换 mode、点击 `UPDATE BID`。

## 非目标

- 不改变 `Pairing Number` bid 的数据结构。
- 不改变 `pairing-occurrence-list` 的保存语义。
- 不改变 run 的增删逻辑。
- 不改变 Search Pairings 查询、preview、分页结果。
- 不重做 Pairing Number 选择交互。

## 当前实现定位

相关文件：

- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
- `pbs-portal/src/features/pairing/components/pairing-property-run-section.tsx`
- `pbs-portal/src/features/pairing/components/pairing-property-dialog-footer.tsx`
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
- `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`
- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`

当前关键问题：

- `PairingPropertyConfigDialog` 使用自建 fixed overlay。
- 弹窗容器只有固定宽度，没有 `max-height`。
- 弹窗 body 和 footer 没有分成固定头尾 + 中间滚动。
- `PairingPropertyRunSection` 里 `RUN DATE` 有 `max-h-[190px]`，但 `CONFIRMED RUNS` 没有限高。

## 推荐方案

### 方案 A：最小修复现有弹窗布局

保留当前 `PairingPropertyConfigDialog` 结构，只做布局约束：

- overlay 保持 `fixed inset-0`。
- 弹窗容器改为 `max-h-[calc(100vh-96px)] flex flex-col overflow-hidden`。
- 标题区固定在顶部。
- 中间表单区域改为 `min-h-0 flex-1 overflow-y-auto`。
- footer 固定在底部，不随列表滚走。
- `CONFIRMED RUNS` 列表增加 `max-height` 和 `overflow-y-auto`。

优点：

- 改动小。
- 风险低。
- 能快速解决截图里的实际问题。

缺点：

- 仍然保留自建弹窗，不完全符合项目 `AppDialog` 标准。

### 方案 B：迁移到标准 `AppDialog`

把 `PairingPropertyConfigDialog` 改为使用 `@rois/ui` 的 `AppDialog`：

- 标题、关闭按钮、body 滚动、footer 固定都交给标准组件。
- `bodyClassName` 控制内部布局。
- footer 复用现有 `PairingPropertyDialogFooter` 的按钮逻辑或拆成 footer 内容。

优点：

- 符合项目弹窗规范。
- 后续维护更统一。
- 天然具备 `max-h-[85vh]` 和 body scroll。

缺点：

- 触及 dialog chrome，视觉变化比方案 A 大。
- 需要检查所有 Pairing config dialog 场景，不只是 Pairing Number。

### 推荐

本次建议采用 **方案 B：迁移到标准 `AppDialog`**。

原因：

- 项目还没有上线，现在统一弹窗标准的成本低于上线后再迁移。
- 当前问题的根因不是某一个列表样式，而是自建弹窗缺少标准弹窗能力。
- `AppDialog` 已经内置固定标题栏、body 滚动、footer 固定、可视区最大高度，正好覆盖本次问题。
- 项目规范已经要求业务弹窗使用 `AppDialog`；继续给自建弹窗补丁会留下技术债。
- 为避免范围过大，本次只迁移 `PairingPropertyConfigDialog`，不顺手迁移其他旧弹窗。

## 设计细节

### 弹窗整体

`PairingPropertyConfigDialog` 应从当前手写 `fixed overlay + role="dialog"` 迁移为 `@rois/ui` 的 `AppDialog`：

- `open={isOpen}`。
- `onOpenChange` 在关闭时调用现有 `onCancel`。
- `title` 使用 `Configure Pairing Number` / `Configure <property name>` 这类明确标题。
- `className` 控制宽度，建议继续接近当前 `760px`。
- `bodyClassName` 用于表单内容布局。
- `footer` 承载现有 `CANCEL / SAVE FAVORITE / ADD BID / UPDATE BID` 操作。
- `dismissable={false}`，保持当前“不会误点背景丢编辑内容”的行为。
- `draggable` 可保留 `AppDialog` 默认行为，不影响业务。

### 内容滚动

`AppDialog` 已经提供固定 title bar、可滚动 body、固定 footer；本次实现需要把现有内容拆进对应区域：

- 现有标题区不再手写，由 `AppDialog.title` 表达。
- 现有表单字段放入 `AppDialog` children。
- 现有 `PairingPropertyDialogFooter` 需要适配为 `AppDialog.footer` 内容。
- body 内部保持 `grid gap-4`，但不能再撑爆 dialog。

这样即使 `CONFIRMED RUNS` 很多，`UPDATE BID` 仍然可见。

### CONFIRMED RUNS

`CONFIRMED RUNS` 区域改成独立卡片：

- 标题行显示 `CONFIRMED RUNS`。
- 可选显示数量，例如 `25 selected`。
- 列表区域设置最大高度，例如 `max-h-[260px] overflow-y-auto`。
- 每条 run 保持当前 `pairingNumber + originDate + remove` 结构。

如果屏幕高度较小，整体 body 仍然可以滚动，列表本身也不会撑爆弹窗。

### 交互保持

- 点击 `x` 删除 run 的逻辑不变。
- `Specific Date / Entire Month` 切换逻辑不变。
- `UPDATE BID` 保存逻辑不变。
- `CANCEL` 关闭逻辑不变。

## 验收标准

- 打开含 25 条 confirmed runs 的 `Configure Pairing Number` 弹窗，弹窗顶部不被导航栏遮挡。
- `CANCEL / UPDATE BID` 始终可见，或者在弹窗内部稳定可访问。
- `CONFIRMED RUNS` 列表内部可以滚动。
- 删除 confirmed run 后列表和保存数据正常更新。
- 普通短列表 property 的配置弹窗视觉不明显退化。
- Search Pairings criteria 编辑和 Pairing existing property 编辑都生效。

## 测试计划

### 自动化测试

更新或新增 Vitest：

- 在 `pairing-page.test.tsx` 构造大量 `pairing-occurrence-list`。
- 打开 `Configure Pairing Number`。
- 断言：
  - dialog 可见。
  - `CONFIRMED RUNS` 可见。
  - `UPDATE BID` 可见。
  - 至少一个靠后的 run 可在列表中被定位或通过滚动后可见。

更新或新增 Search Pairings 相关 Vitest：

- 从 `Search Pairings` criteria 编辑入口打开 Pairing Number 配置弹窗。
- 断言 footer 按钮仍可操作。

更新 Playwright：

- 在已有 PBS pairing 搜索 mock 用例里覆盖长 confirmed runs 编辑入口。
- 断言弹窗 bounding box 在 viewport 内：
  - `dialog.y >= headerHeight`。
  - `dialog.y + dialog.height <= viewport.height`。
  - `UPDATE BID` 按钮可见可点击。

### 验证命令

预计执行：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
pnpm exec vitest run src/features/pairing/pages/pairing-page.test.tsx src/features/pairing/pages/search-pairings-page.test.tsx --reporter=basic
pnpm lint
pnpm build

cd /Users/lei/Codehub/rois-ai/e2e
npx playwright test tests/pbs-portal/condition-default-favorites.spec.ts -g "PBS-3510" --reporter=list --config=config/playwright.config.ts --project=pbs-portal

cd /Users/lei/Codehub/rois-ai
npm run check:ui
git diff --check
```

## 风险和注意事项

- `AppDialog` 会带来标准蓝色标题栏和默认弹窗 chrome，视觉上会比当前白色自建弹窗更统一，但不是完全无感改动。
- `AppDialog` 默认 overlay click / Esc 可关闭；本次应设置 `dismissable={false}`，避免用户误关闭丢失未保存编辑。
- footer 迁入 `AppDialog.footer` 后，需要确保 `SAVE FAVORITE`、`UPDATE BID` 的 disabled / pending 逻辑不变。
- `CONFIRMED RUNS` 仍必须单独限高；只迁移 `AppDialog` 而不给长列表限高，体验仍会变成 body 内很长滚动。
- 本次只迁移 `PairingPropertyConfigDialog`，不顺手迁移 `PairingOccurrenceBidDialog` 或其他旧弹窗，避免范围扩散。
- 当前项目要求 UI 改动 bump 版本：如果实现涉及 `pbs-portal` 前端，需要同步更新 `pbs-portal/src/version.ts` 和 `gantt/src/version.ts` 的 PBS frontend version。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单个弹窗布局和局部测试修复，多 agent 协作成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal` pairing dialog 组件、相关测试、QA 文档。
- Conflict risk: 低，但需要避免同时改 `pairing-property-config-dialog.tsx`。
- Execution gate: 用户确认本 spec 后再实现。

## 结论

本次修复应优先把 `PairingPropertyConfigDialog` 迁移到标准 `AppDialog`，用标准弹窗能力解决固定头尾、body 滚动和视口高度约束问题；同时给 `CONFIRMED RUNS` 单独限高滚动。这样既修复截图里的长列表溢出，也减少自建弹窗带来的长期维护债务，不改变业务数据和保存逻辑。
