# PBS Days Off Add Properties 区域排版优化

日期：2026-05-20  
状态：已确认并实施  
范围：仅优化 Days Off 右侧 `ADD DAYS OFF PROPERTIES` 区域的 available properties 列表排版，解决隐藏 `TIERS` 后右侧空白过大、`BID` 内容显示不完整的问题。

## 背景

Days Off 页面已根据业务语义隐藏 available properties 底部的 `TIERS` 控件，但该区域仍沿用共享 `RuleBidRightPanel` 的四列布局：

```text
PROPERTY | BID | utility | TIERS
```

当 `TIERS` 被隐藏后，右侧列仍占据空间，导致：

- 右侧出现明显空白。
- `BID` 列宽不足，`Min Consecutive Days Off In Window`、`Days Off / Days On Pattern` 等长条件显示不完整。
- 视觉上像表格没有重新适配 Days Off 的业务布局。

## 目标

1. 只优化 `ADD DAYS OFF PROPERTIES` 区域。
2. 当 available properties 隐藏 tiers 时，让 `BID` 列使用释放出的宽度。
3. 保持 `PROPERTY`、加号、收藏按钮的对齐和当前轻量表格风格。
4. 不影响上方 existing properties 区域。
5. 不影响 Line / Pairing 等仍显示 tiers 的共享面板。

## 方案

在 `RuleBidRightPanel` 中为 available properties 区域区分布局：

- existing properties 继续使用当前 `tableLayout`，不改。
- available properties 如果 `hideAvailablePropertyTiers=true`，使用一个无 tiers 的专用布局。
- 无 tiers 布局只保留实际需要的视觉列：

```text
PROPERTY/actions | BID
```

`RuleBidPropertyTableHeader` 和 `RuleBidAvailablePropertyRow` 需要支持这种无 tiers 布局，避免继续渲染空 utility / tiers 列造成右侧空白。

## 不做范围

- 不调整弹窗 UI。
- 不调整 API、保存 payload、字段语义或校验逻辑。
- 不调整 existing properties 区域。
- 不改变收藏、添加、搜索、分页等交互行为。
- 不做全局 table layout 重构。

## 验收标准

1. Days Off 的 `ADD DAYS OFF PROPERTIES` 区域在隐藏 tiers 后右侧不再留出大块空白。
2. `BID` 列明显变宽，长文案比当前显示更完整。
3. `PROPERTY` 文案、加号按钮、收藏按钮仍保持水平对齐。
4. `ALL PROPERTIES` / `FAVORITED PROPERTIES`、搜索框和分页布局不被破坏。
5. Existing properties 区域视觉和交互保持不变。
6. 补充或更新前端测试，覆盖无 tiers available list 的渲染行为。

## 测试计划

1. 运行 Days Off 页面相关测试，确认 available properties 能正常渲染、添加、收藏。
2. 运行 RuleBid 共享面板相关测试，确认默认显示 tiers 的布局不受影响。
3. 运行 lint / typecheck / build。
4. 使用浏览器检查 Days Off 页面视觉效果，重点确认 `BID` 列宽和右侧空白。

## 实施记录

1. 新增 `getRuleBidRightPanelAvailableTableLayout`，当 available properties 隐藏 tiers 时使用两列布局：

```text
PROPERTY/actions | BID
```

2. `RuleBidRightPanel` 中 existing properties 继续使用原布局，available properties 单独使用 `availableTableLayout`。
3. `RuleBidPropertyTableHeader` 和 `RuleBidAvailablePropertyRow` 在 `showTiers=false` 时不再渲染空 utility / tiers 单元格。
4. 更新布局单元测试，覆盖有 tiers 和无 tiers 两种 available layout。
5. 更新 Days Off 页面回归测试，确认 Add 区域隐藏 tiers 后使用两列布局。

## 验证记录

1. `pnpm --dir pbs-portal test -- rule-bid-right-panel-layout.test.ts days-off-page.test.tsx`：通过，实际执行 48 个文件、304 个测试。
2. `pnpm --dir pbs-portal lint -- src/features/rule-bids/rule-bid-right-panel-layout.ts src/features/rule-bids/rule-bid-right-panel-layout.test.ts src/features/rule-bids/components/rule-bid-property-table.tsx src/features/rule-bids/components/rule-bid-right-panel.tsx src/features/days-off/pages/days-off-page.test.tsx`：通过。
3. `pnpm --dir pbs-portal exec tsc --noEmit --pretty false`：通过。
4. `pnpm --dir pbs-portal build`：通过；Vite 仍有既有 chunk size warning。
5. Browser 视觉检查 `http://localhost:3030/fpqe/pbs/days-off`：通过，`ADD DAYS OFF PROPERTIES` 中 `BID` 列已明显变宽，长条件完整显示。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 小范围 UI 布局修复，主要改共享面板的一处布局分支和测试，拆分会增加同步成本。
- Suggested split: 不拆分。
- Write boundaries: 主 agent 修改 `RuleBidRightPanel` / `RuleBidPropertyTable` 相关布局和对应测试。
- Conflict risk: 中等；当前工作树已有 Days Off 相关未提交改动，实施时只做增量修改。
- Execution gate: 用户确认本 spec 后实施。
