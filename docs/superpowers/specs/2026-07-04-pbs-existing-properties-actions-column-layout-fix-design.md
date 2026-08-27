# PBS Existing Properties 操作列裁切修复

## 背景

`Pairing` 页面右侧 `EXISTING PAIRING PROPERTIES` 中，第一行右侧 `ACTIONS` 列被裁切：

- 表头 `ACTIONS` 只显示成 `ACTI`。
- 编辑 / 查看 icon 贴近右边界，部分被裁掉。
- 第二行也有同样趋势，说明不是单条数据问题，而是 Existing Properties 表格列布局问题。

当前 Pairing 页面已有专用 layout helper：

- `pbs-portal/src/features/pairing/pairing-right-panel-layout.ts`
- `pbs-portal/src/features/pairing/components/pairing-property-table.tsx`

截图中的表格实际列是：

```text
PROPERTY | BID | TIERS | COUNT | ACTIONS
```

但当前 `existingCountGridTemplateColumns` 的总最小宽度过大，叠加 row padding 和 column gap 后，在当前工作台右侧 panel 宽度下会横向溢出。溢出的最后一列是 `ACTIONS`，所以表头和 icon 被裁切。

## 目标

- `EXISTING ... PROPERTIES` 表头完整显示 `ACTIONS`。
- 编辑 / 查看 / 删除等 icon 完整可见，不贴边、不被裁切。
- `COUNT` 列保留独立宽度，不挤压 `ACTIONS`。
- `BID` 仍然吃剩余宽度，但不能抢占右侧固定功能列。
- 修复应作用于 Pairing 专用 existing table layout，避免影响 Days Off / Line / Reserve 等共享 RuleBid 页面。

## 非目标

- 不改变 actions 的业务行为。
- 不改变 icon 数量、权限、点击逻辑。
- 不重做整张表样式。
- 不改 Days Off / Line / Reserve 的业务数据或规则。

## 推荐方案

### 方案 C：收紧 Pairing existing table 五列宽度（推荐）

Pairing existing table 已经是 5 列：

```text
PROPERTY | BID | TIERS | COUNT | ACTIONS
```

调整点：

1. 收紧 `getPairingRightPanelTableLayout()` 的 `existingCountGridTemplateColumns`：
   - `BID` 降低最小宽度，但仍保留最大剩余空间。
   - `COUNT` 降低固定最小宽度到足够显示 `25 pairings` 的范围。
   - `ACTIONS` 保留稳定宽度，足够容纳 edit / preview / delete 三个 icon。
   - 适度降低 existing row 的 `columnGap`。
2. `ExistingPairingPropertyRow` 中：
   - count block 的 `min-width` 与新 count 列宽同步。
   - actions 容器设置稳定最小宽度和 `shrink-0`，避免图标被裁切。
3. 更新 Pairing layout unit test，确保 compact / medium / wide 三档都是 5 列且总宽不会过大。
4. 更新 Pairing 页面 Vitest / Playwright，断言 `ACTIONS` 表头完整可见，actions icon 不被裁切。

推荐原因：

- 这是根因修复：降低 existing table 的最小总宽度，让五列在实际 panel 内可见。
- 不靠扩大右侧 padding 或缩小 `BID` 文本硬凑。
- 只修 Pairing 专用表，不把 Pairing 的 count/actions 布局约束扩散到其他 RuleBid 页面。

## 备选方案

### 方案 A：只加右侧 padding / overflow visible

- 优点：改动最小。
- 缺点：没有修复列数不匹配；不同宽度下仍可能挤压。

### 方案 B：缩小 `BID` 卡片宽度

- 优点：截图场景可能立即缓解。
- 缺点：牺牲用户最需要阅读的 bid 内容；本质上仍没给 actions 独立列。

## 验收标准

- `ACTIONS` 表头完整显示。
- 第一行和第二行 actions icon 完整可见，不被右侧裁切。
- `COUNT` 和 `ACTIONS` 是两个独立视觉列。
- `BID` 文本卡片不压到 `TIERS / COUNT / ACTIONS`。
- 页面没有新增横向滚动。
- 现有 edit / view / delete 行为保持不变。

## 测试计划

- 更新 `pairing-right-panel-layout.test.ts`：
  - compact / medium / wide 的 `existingCountGridTemplateColumns` 都包含 5 列。
  - existing count layout 总最小宽度降低，actions 列保留稳定宽度。
- 更新 Pairing 页面单测：
  - `ACTIONS` 表头存在。
  - `COUNT` 表头存在。
  - existing row actions 仍可点击。
- 更新 Playwright：
  - `ACTIONS` header bounding box 在右侧 panel 可视区域内。
  - 第一行 actions buttons bounding box 在 row / panel 可视区域内。
  - 保留现有 Pairing Search 相关回归。
- 运行：
  - `pnpm exec vitest run src/features/pairing/pairing-right-panel-layout.test.ts src/features/pairing/pages/pairing-page.test.tsx --reporter=basic`
  - `npx playwright test tests/pbs-portal/pairing-search.spec.ts ...`
  - `npm run check:ui`
  - `pnpm lint`
  - `pnpm build`

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 Pairing 专用表格 layout、Pairing 页面测试和一条 Playwright 覆盖，拆分会增加冲突。
- Suggested split: 不拆。
- Write boundaries: `pairing-right-panel-layout.ts`、`pairing-property-table.tsx`、对应测试和版本号。
- Conflict risk: 低。限定在 Pairing 专用 layout，不影响 Days Off / Line / Reserve。
- Execution gate: 用户确认 spec 后再实现。
