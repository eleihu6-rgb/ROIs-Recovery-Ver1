# PBS Pairing Search Criteria 编辑弹窗化设计

## 背景

`/fpqe/pbs/pairing/search`（当前 React 路由为 `/pairing/search`）页面的 `SEARCH CRITERIA` 区域目前在点击编辑按钮后，会在条件行下方展开行内 `EDIT BID` 面板。

用户期望这里与外层 Pairing 页面保持一致：点击修改按钮时弹出配置弹窗，而不是在表格内展开编辑区域。

## 目标

- `SEARCH CRITERIA` 中每条条件的编辑按钮打开弹窗。
- 弹窗交互、视觉和外层 Pairing 页面配置属性的弹窗保持一致。
- 用户在弹窗内调整 `Award / Avoid`、`Any / Every`、bid value、Pairing Number 特殊模式等内容。
- 点击 `Cancel` 不改变当前条件。
- 点击确认后一次性更新该条 Search Criteria，并触发已有 preview 刷新逻辑。

## 非目标

- 不改 Search Pairings 的筛选算法和后端接口。
- 不改 Pairing 主页面的新增属性、收藏、已有属性编辑流程。
- 不新增 property catalog 或数据库字段。
- 不调整 Search Results 表格布局。
- 不改变当前 `Add More Criteria`、favorite、remove、`Bid These Properties` 的业务语义。

## 当前实现理解

- `SearchPairingsPage` 持有 `criteriaItems` 和 `editingCriteriaId`。
- `PairingSearchPanel` 将 `editingCriteriaId` 传给 `PairingSearchCriteriaRow`。
- `PairingSearchCriteriaRow` 根据 `isEditing` 在行下方渲染行内编辑面板。
- 行内编辑时，`onCriteriaActionChange`、`onCriteriaQuantifierChange`、`onCriteriaBidChange` 会直接修改 `criteriaItems`。
- 外层 Pairing 页面已经使用 `PairingPropertyConfigDialog` 处理新增属性和已有属性编辑。

## 方案比较

### 方案 A：复用 `PairingPropertyConfigDialog`，为 Search Criteria 做轻量适配

将 `PairingSearchCriteriaItem` 转成弹窗需要的 `PairingAvailableProperty` 形状，弹窗确认后再转回并更新原 criteria item。

优点：
- 与外层页面视觉和交互一致性最高。
- 复用 Pairing Number 特殊处理、autocomplete、operator、action、quantifier 等已有能力。
- 改动集中在 Search 页面和少量 adapter，风险较低。

缺点：
- `PairingSearchCriteriaItem` 和 `PairingAvailableProperty` 类型相似但不完全相同，需要明确转换边界。

### 方案 B：为 Search Criteria 新建一个独立弹窗组件

复制当前行内编辑逻辑到新弹窗组件中。

优点：
- 对现有外层弹窗零影响。

缺点：
- 会复制 bid 编辑逻辑，Pairing Number 等特殊能力容易与外层页面不一致。
- 后续维护成本更高。

### 方案 C：直接把行内编辑面板包进通用 Modal 容器

保留 `PairingSearchCriteriaRow` 内部编辑逻辑，只改变容器为 overlay。

优点：
- 初始改动较小。

缺点：
- 仍然保留 Search Criteria 专属编辑实现，不能真正做到“跟外面页面一样”。
- 当前行内编辑是即时修改，弹窗里 Cancel 不容易做到不变更。

## 推荐方案

采用方案 A：复用 `PairingPropertyConfigDialog`，为 Search Criteria 增加轻量 adapter。

## 设计细节

### 状态流

- `SearchPairingsPage` 不再用 `editingCriteriaId` 控制行内展开。
- 新增当前正在编辑的 `PairingSearchCriteriaItem | null` 状态。
- 点击 criteria row 的编辑按钮时，设置当前编辑项并打开 `PairingPropertyConfigDialog`。
- 弹窗内部继续使用 draft state；在确认前不写回 `criteriaItems`。
- 点击 `Cancel` 关闭弹窗，不更新 criteria。
- 点击确认后，用弹窗返回的属性值更新对应 `criteriaItems` 项。

### 类型适配

- 增加局部转换函数：
  - `buildPairingAvailablePropertyFromSearchCriteria(item)`
  - `buildPairingSearchCriteriaItemFromDialogDraft(originalItem, draft)`
- 转换应保留：
  - `id`
  - `favoriteKey`
  - `propertyId`
  - `propertyCode`
  - `name`
  - `favorited`
  - `action`
  - `quantifier`
  - `bid`
  - `tiers`
  - `pairingNumber`
  - `pairingType`
  - `effectiveDateRange`
- `actions` 可在 adapter 中提供为 `["add", "preview"]`，用于满足弹窗类型，不改变 Search Criteria 的业务动作。

### UI 行为

- `SEARCH CRITERIA` 行内不再渲染 `EDIT BID` 面板。
- 编辑按钮仍保留当前图标位置和 aria label。
- 弹窗标题、关闭按钮、Cancel、确认按钮沿用外层配置弹窗。
- Search Criteria 编辑弹窗不显示 `Save Favorite` 按钮，避免把“编辑当前筛选条件”和“保存收藏条件”混在一起。收藏仍通过 criteria row 的心形按钮完成。
- `showTiers=false` 的 Search Criteria 仍不在 row 中显示 tier 列；弹窗如果沿用通用组件显示 tier，需保持现有默认 tier 至少一个 active，避免确认按钮不可用。若实现时发现 Search Criteria 不应该让用户在这里改 tier，则可以在 adapter 或弹窗参数中增加只读/隐藏 tier 的小扩展，但不改变外层页面默认行为。

### 数据与刷新

- 确认后更新 `criteriaItems`，沿用现有 `debouncedCriteriaItems` 和 preview query 刷新机制。
- `currentPage` 应重置为 1，避免条件变化后仍停留在旧页码。
- Pairing Number 条件继续使用通用弹窗里的 entire month / specific date 逻辑，并使用当前 `previewPeriodCode` 加载 occurrence。

### 测试

需要更新或新增 `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx` 覆盖：

- 点击 `SEARCH CRITERIA` 行编辑按钮会打开配置弹窗。
- 在弹窗修改 bid 后点击 `Cancel`，原 criteria 文案不变。
- 在弹窗修改 bid 后点击确认，criteria row 更新，并触发 preview 相关状态更新。
- 行内 `EDIT BID` 面板不再出现。
- Pairing Number 类型条件仍可进入弹窗并保留已有特殊编辑入口。

QA 人工测试案例应新增到 `docs/test-cases/pbs/pairing/`，覆盖：

- 普通 criteria 编辑确认。
- 普通 criteria 编辑取消。
- Pairing Number criteria 编辑。
- Favorite、Remove、Add More Criteria、Bid These Properties 回归。

## 验收标准

- 在 `/fpqe/pbs/pairing/search` 页面点击 `SEARCH CRITERIA` 任一条件的编辑按钮，会打开弹窗。
- 页面不再出现行内 `EDIT BID` 编辑面板。
- 弹窗 `Cancel` 不修改当前条件。
- 弹窗确认后才更新当前条件，并刷新 matching pairings preview。
- 收藏、删除、添加更多条件、`Bid These Properties` 行为不退化。
- Pairing Number 条件仍支持选择 whole month / specific date。
- 自动化测试和 QA 测试文档同步更新。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是一个范围较小、文件耦合紧密的前端交互变更，主要集中在 Search 页面、criteria row 和测试。
- Suggested split: 不建议拆分；单 agent 完成更容易保持类型转换和测试一致。
- Write boundaries: 若必须拆分，可让一个 agent 只写测试，另一个 agent 只改实现，但 coordination 成本高于收益。
- Conflict risk: 中等；多个 agent 可能同时修改同一个页面测试文件。
- Execution gate: 用户确认本 spec 后，由当前 agent 直接实现并验证。

