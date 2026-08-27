# PBS Days Off 日历多 Tier 选择设计

日期：2026-04-30
作者：Codex
状态：已实施

## 背景

AA PBS 文档中，Lineholder Monthly Calendar 支持直接点击日期或星期头添加 specific day off bid。弹窗会让用户选择 Layer；在本项目术语中，AA 的 Layer 已统一对应为 Tier。

当前 PBS Portal 已经支持在 Days Off 页面左侧日历点击日期添加/删除 `Off`，但行为基本只作用于当前 active Tier。AA 语义是：新增 day off 时默认应用到当前 Layer/Tier 以及后续 Layer/Tier；再次点击可编辑这个日期保留在哪些 Layer/Tier。

本项目交互做一处产品化调整：不使用独立 `DELETE BID` 按钮，Tier 勾选状态就是最终状态；如果用户取消全部 Tier 后保存，即表示从全部 Tier 删除该日期。

本设计只覆盖第一条补齐：Days Off 日历上的日期 / 星期头多 Tier 选择与删除语义。

## 目标

1. 点击单个日期时，弹窗展示 `T1` 到 `T7` 勾选项。
2. 新增日期 Off 时，默认勾选当前 active Tier 到 `T7`。
3. 已存在的日期 Off 再次点击时，弹窗按实际 draft 数据预勾选已有 Tier。
4. 用户通过勾选 / 取消勾选 Tier 来编辑该日期保留在哪些 Tier。
5. 允许全部 Tier 取消勾选后保存；保存空勾选等同于删除目标日期在所有 Tier 的 Off。
6. 在 `T7` 后提供 `Clear` 快捷按钮，清空当前弹窗的所有 Tier 勾选，但不自动保存。
7. 点击星期头时，支持把该星期对应的所有当前月日期批量应用到选中的 Tier。
8. 保存后左侧日历、Tier 色条、综合 bidding calendar、Tier 页面数据同步刷新。

## 不做范围

- 不实现跨月 carry-out day off 选择；后端当前仍只允许当前 bid period 日期。
- 不实现 day off 对 pairing pool / award engine 的最终过滤语义。
- 不实现 `Clear Bids`。
- 不实现 planned absence 对 Days Off 规则的影响。
- 不修改 `Off` 与 `DO` 语义；`Off` 仍代表 PBS day-off bid，`DO` 仍留给未来 roster/award 实际排班结果。
- 不新增后端接口，不修改数据库结构。

## AA 语义校准

- `Off` 是用户在 PBS 里提出的 specific day-off bid，不是最终实际排班结果。
- 点日期新增 Off 时，默认选择当前 Tier 和之后所有 Tier。
- 再点同一日期时，可以通过 Tier 勾选编辑这个 Off 属于哪些 Tier。
- 取消全部 Tier 勾选后保存，删除该日期在所有 Tier 的 Off。
- 星期头是快捷批量操作，例如点 `SAT` 可以批量处理当月所有 Saturday。
- `Clear` 只改变弹窗内的勾选状态；真正写入或删除仍由 `SAVE BID` 触发。

## 现有数据结构

前端当前通过 `calendar-days-off/current` 读取和保存 draft：

```ts
type PbsCalendarDaysOffDraft = {
  tiers: Array<{
    tier: "T1" | "T2" | "T3" | "T4" | "T5" | "T6" | "T7";
    dates: string[];
  }>;
};
```

该结构已经可以表达“同一个日期属于多个 Tier”，因此本次不需要后端 contract 变化。

## 交互设计

### 单日期新增

用户在 `T3` active 时点击 `2026-05-05`：

- 弹窗标题显示 `T3 · 2026-05-05`。
- Tier 勾选项默认选中 `T3/T4/T5/T6/T7`。
- 点击 `SAVE BID` 后，将 `2026-05-05` 写入这些 Tier 的 `dates`。

### 单日期编辑

如果 `2026-05-05` 已存在于 `T1/T2/T4`：

- 弹窗预勾选 `T1/T2/T4`。
- 用户取消 `T2`，保留 `T1/T4` 后点击确认。
- 保存结果为：`2026-05-05` 只存在于 `T1/T4`。

### 单日期删除

如果 `2026-05-05` 存在于任何 Tier：

- 用户取消所有 Tier 勾选。
- 点击 `SAVE BID` 后从 `T1-T7` 全部移除 `2026-05-05`。
- 如果不想逐个取消，可以点击 `Clear` 快速清空勾选，再点击 `SAVE BID`。

### 星期头批量新增 / 编辑

点击 `SAT` 时：

- 系统先列出当前月所有未 muted 的 Saturday 日期。
- 如果这些日期没有已有 Off，默认勾选当前 active Tier 到 `T7`。
- 点击确认后，把这些 Saturday 日期写入选中的 Tier。
- 对未选中的 Tier，移除这些 Saturday 日期。

如果这些 Saturday 日期已有部分 Tier 数据：

- Tier 复选框按“这些日期中至少有一个日期已经属于该 Tier”预勾选。
- 点击确认后，选中的 Tier 会包含这些 Saturday 日期；未选中的 Tier 会移除这些 Saturday 日期。
- 这是一种批量覆盖语义，后续如需更精细的 mixed state，可单独设计三态 checkbox。

### 星期头删除

点击星期头后，如果取消全部 Tier 勾选并保存：

- 从所有 Tier 删除当前月该星期对应的全部日期。
- 不删除其他星期的日期。

## 前端实现设计

主要修改 `DashboardSchedulePanel`：

- 扩展 `PendingCalendarAction`，增加 `selectedTiers` 和 `targetDates`。
- 新增工具函数：
  - `buildTierKeys()`：生成 `T1-T7`。
  - `getTierNumber(tier)`：解析 Tier 序号。
  - `buildDefaultSelectedTiers(activeTier)`：当前 active Tier 到 `T7`。
  - `findTiersContainingDates(draft, dates)`：根据 draft 计算已有 Tier。
  - `applyDatesToSelectedTiers(draft, dates, selectedTiers)`：把目标日期集合应用到勾选 Tier，并从未勾选 Tier 移除。
- 弹窗中使用 `Cancel / SAVE BID`，新增 Tier checkbox 区域。
- `T7` 后追加 `Clear` 按钮，调用本地状态更新清空 `selectedTiers`，不触发保存请求。
- 当前 active date 高亮仍由 active Tier 的 dates 决定，但 Tier 色条会根据所有 Tier 数据更新。

## 后端影响

后端 `calendar-days-off/current` 已经支持保存多 Tier 日期集合，本次不需要新增 route、字段或 migration。

需要保持现有校验：

- Tier 只能是 `T1-T7`。
- 日期必须是合法 ISO date。
- 日期仍必须在当前 bid period 内。

## 测试计划

前端测试优先：

1. `T1` 点击单日，弹窗默认勾选 `T1-T7`，确认后保存 draft 包含 7 个 Tier。
2. `T3` 点击单日，默认勾选 `T3-T7`。
3. 已有日期分布在 `T1/T3` 时，再点日期预勾选 `T1/T3`。
4. 编辑取消 `T3` 后保存，该日期只留在 `T1`。
5. 取消全部 Tier 勾选并点击 `SAVE BID` 后，该日期从所有 Tier 删除。
6. 点击 `Clear` 后，`T1-T7` 全部取消勾选，且不会立即调用保存接口。
7. 点击星期头批量添加，所有对应 weekday 日期写入选中 Tier。
8. 点击星期头后取消全部 Tier 勾选并点击 `SAVE BID`，对应 weekday 日期从所有 Tier 删除。
9. 保存成功后 invalidate `calendar-days-off/current`、`bidding-calendar/current`、Tier 页面 query。

后端测试暂不新增，除非前端暴露出现有 contract 无法表达的场景。

## 验收标准

- 用户在 Days Off 页面可以按 AA 语义给日期选择多个 Tier。
- 默认勾选范围与当前 active Tier 一致：当前 Tier 到 `T7`。
- 取消全部 Tier 勾选并保存，会删除目标日期在全部 Tier 的 Off。
- 单日期和星期头批量操作都不会影响非目标日期。
- `Off` 显示保持为 `Off`，不会被改成 `DO`。
- 不引入新的数据库迁移或 API contract 变化。
