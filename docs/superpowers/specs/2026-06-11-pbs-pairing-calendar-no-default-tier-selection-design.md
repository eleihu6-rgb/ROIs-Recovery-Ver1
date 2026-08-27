# PBS Pairing Calendar 新增 Pairing 不默认选择 Tier 设计

日期：2026-06-11  
范围：PBS Portal 左侧 `BIDDING CALENDAR` 在 Pairing 页面点击日期新增 Pairing bid 的 tier 选择行为

## 背景

左侧 `BIDDING CALENDAR` 在 Days Off 页面之前已经调整过：用户点击一个没有已有 day off bid 的日期时，不再按当前 active tier 自动勾选 tier，而是默认不选，让用户自己勾选。已有 day off bid 的日期仍会显示已有 tier。

继续检查 Pairing 页面后，发现新增 Pairing 的点击日期链路仍保留旧逻辑：

文件：`pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`

```ts
setPendingPairingCalendarAction({
  isoDate,
  selectedOccurrenceIds: [],
  selectedTiers: buildDefaultSelectedTiers(activeDraftTierLabel),
  anchor,
});
```

其中 `buildDefaultSelectedTiers(activeDraftTierLabel)` 会按当前 active tier 自动生成默认选择：

- 当前 active tier 是 `T1`，默认选择 `T1-T7`。
- 当前 active tier 是 `T4`，默认选择 `T4-T7`。

这和客户对 Days Off 的最新偏好不一致。客户希望打开新增弹窗时不要替用户做默认 tier 选择，避免用户以为自己只是在查看或选择 pairing，实际已经带上了一批 tier。

## 目标

- Pairing 页面左侧日历点击某一天新增 Pairing bid 时，tier checkbox 默认全部不选。
- 用户必须自己勾选一个或多个 tier 后才能保存。
- 已有 Pairing bid 的详情/编辑仍然显示已有 active tier，不受本需求影响。
- Days Off 已有行为保持不变：没有已有记录默认不选，已有记录显示已有 tier。
- 不改变 Pairing occurrence 搜索、日期时区搜索、pairing detail 展示逻辑。

## 非目标

- 不修改后端 API contract。
- 不修改数据库 schema。
- 不修改 Pairing Search 页面中的 Pairing Number / occurrence 选择逻辑。
- 不修改已有 Pairing bid 的读取、合并、详情展示规则。
- 不改变 `buildDefaultSelectedTiers` 的全局含义，避免影响其他仍依赖它的模块；本需求只在 Pairing calendar 新增入口停止使用它。

## 当前行为

### 新增 Pairing

用户在 `/pairing` 页面点击左侧日历日期时：

1. 前端清掉 Days Off pending action。
2. 打开 Pairing occurrence 选择 popover。
3. `selectedOccurrenceIds` 初始化为空。
4. `selectedTiers` 初始化为 `buildDefaultSelectedTiers(activeDraftTierLabel)`。

结果是：即使用户还没勾选 tier，popover 打开时也已经有一批 tier 被选中。

### 已有 Pairing

用户点击已有 Pairing bid 事件时，详情编辑弹窗的 tier 来自当前 draft property：

```ts
selectedPairingEventProperty.tiers
  .filter((tier) => tier.active)
  .map((tier) => tier.label)
```

这属于“已有记录显示已有 tier”，符合客户要求，不应改成空选。

### Days Off 对照

Days Off 当前打开 pending action 时，会通过已有 draft 日期反查 selected tier：

```ts
const existingTiers = findTiersContainingDates(editableCalendarDraft, isoDates);
const selectedTiers = existingTiers.filter(...);
```

如果该日期没有已有 day off bid，`existingTiers` 为空，所以默认不选。这是 Pairing 新增入口应对齐的交互方向。

## 方案比较

### 方案 A：新增 Pairing 默认 `selectedTiers: []`（推荐）

只修改 `handleRequestPairingDateAction`，把新增 Pairing 的 pending action 初始化为：

```ts
selectedTiers: []
```

优点：

- 最符合客户要求：打开弹窗不替用户选择 tier。
- 改动范围最小，不影响已有 Pairing bid 的详情编辑。
- 保存按钮当前已经依赖 `selectedTiers.length > 0`，默认空选会自然保持 disabled。
- 不改变共享函数 `buildDefaultSelectedTiers`，兼容风险低。

缺点：

- 用户每次新增 Pairing 都必须手动勾选 tier，多一次显式操作。

### 方案 B：删除或改写 `buildDefaultSelectedTiers`

把 `buildDefaultSelectedTiers` 改成总是返回空数组。

优点：

- 名义上能统一所有使用点。

缺点：

- 该函数可能仍被其他流程依赖，改全局函数容易造成无关模块行为变化。
- 函数名和行为会不匹配，后续维护容易误解。
- 本需求只要求 Pairing calendar 新增入口，不适合扩大影响面。

### 方案 C：提供配置开关控制默认 tier

通过参数或配置决定是否默认选择 active tier range。

优点：

- 看似灵活，后续可以按入口配置。

缺点：

- 当前客户已经明确不需要默认选择；加配置会增加复杂度。
- 多一层配置会让行为更难审查，容易出现“看着对、实际错”的问题。

推荐采用方案 A。

## 前端设计

### 新增 Pairing pending action

修改文件：

- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`

将新增 Pairing 点击日期时的初始化行为从：

```ts
selectedTiers: buildDefaultSelectedTiers(activeDraftTierLabel),
```

改为：

```ts
selectedTiers: [],
```

这样 popover 打开后：

- occurrence 默认不选。
- tier 默认不选。
- `SAVE BID` 保持 disabled。
- 用户选择 occurrence 并勾选 tier 后，才能保存。

### 已有 Pairing 详情编辑

保留当前逻辑：

- 点击已有 Pairing event 后，从 draft property 的 active tiers 初始化 `selectedPairingEventTiers`。
- 这表示“已有的就要显示已有的”，不和新增入口混用。

### 清空与禁用逻辑

当前已有逻辑可以继续复用：

- `handleClearPendingPairingTiers` 继续把 pending selected tiers 清空。
- `isPairingCalendarAddDisabled` 已经检查：
  - 没有 selected occurrence 时禁用。
  - 没有 selected tier 时禁用。
  - selected tier 全部被 day off block 时禁用。

因此新增入口默认空选后，不需要额外增加保存校验。

## 测试设计

### 前端自动化测试

建议更新或新增 `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`：

1. 进入 `/pairing`。
2. 切换当前 active tier 到 `T3` 或其他非 `T1`。
3. 点击左侧日历某个可新增 Pairing 的日期。
4. 等待 Pairing occurrence popover 打开。
5. 断言 `T1-T7` checkbox 全部未选中。
6. 断言 `SAVE BID` 为 disabled。
7. 手动选择一个 occurrence，再勾选 `T3` 和 `T7`。
8. 点击保存。
9. 断言保存 payload / draft patch 中只包含用户手动选择的 tier。

### 回归测试

需要确认以下行为不被误伤：

- Days Off 新增日期仍默认不选 tier。
- Days Off 已有日期仍显示已有 tier。
- Pairing 已有 event 的详情编辑仍显示已有 active tier。
- Pairing 新增时，如果 day off 与某些 tier 冲突，被 block 的 tier 仍 disabled。

## 人工 QA 用例

后续实施时应新增或更新 `docs/test-cases/pbs/pairing-calendar/`：

- 在 `/pairing` 页面切到 `T3`，点击一个没有已有 Pairing bid 的日期，弹窗中的 `T1-T7` 都不应默认勾选。
- 不选择 tier 时，`SAVE BID` 不可点击。
- 勾选 `T3`、选择 occurrence 后保存，只新增到 `T3`，不应自动扩展到 `T3-T7`。
- 点击已有 Pairing bid 事件，详情弹窗仍应显示该 bid 已有的 tier。

## 验收标准

- 新增 Pairing 日期点击弹窗打开时，不再根据当前 active tier 默认勾选任何 tier。
- 用户手动勾选哪些 tier，保存时就只提交哪些 tier。
- 已有 Pairing bid 的 tier 展示和编辑不变。
- Days Off 当前默认不选 tier 的行为不被回退。
- 前端自动化测试覆盖新增 Pairing 默认空选和已有 Pairing 显示已有 tier。

## 风险与注意事项

- 当前 `DashboardSchedulePanel` 同时承载 Days Off 和 Pairing calendar 行为，修改时必须只动 Pairing 新增入口，避免回退 Days Off 已修好的默认空选行为。
- `buildDefaultSelectedTiers` 暂时不要删除，因为其他页面或后续逻辑可能仍引用；若后续确认全项目都不需要 active tier range 默认选择，再单独清理。
- 如果测试 mock 中默认假设 Pairing 新增会自动选择 tier，需要同步更新测试断言。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本需求是一个非常集中的前端行为修正，核心只在 `DashboardSchedulePanel` 的 Pairing 新增 pending action 初始化和对应测试。拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`、相关 shared workbench 测试、QA 文档。
- Conflict risk: 中。当前工作区已有 PBS Pairing calendar base 日期搜索相关未提交改动，实施时不能回退这些变更。
- Execution gate: 用户确认本 spec 后再实施。
