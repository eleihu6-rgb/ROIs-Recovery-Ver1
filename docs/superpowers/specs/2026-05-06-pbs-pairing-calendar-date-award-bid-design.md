# PBS Pairing 日历点击添加 Specific Pairing Bid 设计

日期：2026-05-06  
作者：Codex  
状态：已确认，待实施

## 背景

当前 `Pairing` 页面已经支持通过 `Pairing Number` 添加 bid，并且已有 `Entire Month / Specific Date` occurrence 选择弹窗。左侧 `BIDDING CALENDAR` 已能展示蓝色 `pairing_bid` event，并支持点击查看只读详情。

下一步需要补齐 AA 风格的快捷入口：用户在 `Pairing` 页面左侧日历点某一天，可以直接为这一天添加具体 pairing。这个入口不是泛泛规则编辑器，而是一个更轻的 `Award Pairing Number on a Specific Date` 操作。

本项目术语中，AA 的 `Layer` 已统一对应为 `Tier / Tx`。

## 目标

1. 在 `Pairing` 页面左侧 `BIDDING CALENDAR` 点击某个日期时，打开 `Add Pairing Bid` 浮层。
2. 浮层只查询并展示 `originDate = 点击日期` 的 pairing occurrence。
3. 用户可以多选 pairing occurrence。
4. 用户可以多选 `Tx`。
5. 保存时固定创建 `Award Pairing Number on selected date`，不在 UI 上显示 `Award / Avoid`。
6. 同一天、同 action、同 property、同日期、同 `Tx` 集合的 pairing number bid 自动合并为一行。
7. 左侧日历同一天同 `Tx` 的多个 pairing bid 合并显示为 `M4959 +2` 这类标签。
8. 交互风格尽量贴近 Days Off 日历弹窗：`Clear`、`Cancel`、`ADD BID` 的操作习惯保持一致。

## AA 日期口径

点击某一天时，只搜索这一天 originate 的 pairing。

示例：

- 点 `2026-05-01`：只显示 `originDate = 2026-05-01` 的 pairing。
- `2026-04-30 - 2026-05-01` 的 pairing 算 `2026-04-30` originate，点 `2026-05-01` 不显示。
- `2026-05-01 - 2026-05-03` 的 pairing 点 `2026-05-01` 显示。

这样可以避免同一趟跨多天 pairing 在多个日期重复出现，也与当前 `Specific Date` occurrence bid 的 `originDate` 语义保持一致。

## 用户交互

### 打开浮层

入口：`Pairing` 页面左侧 `BIDDING CALENDAR` 日期格。

点击日期后打开浮层：

- 标题：`Add Pairing Bid`
- 日期说明：显示用户点击的日期
- Pairing 列表：展示当天 originate 的 pairing occurrence
- `Tx` 选择：显示 `T1` 到 `T7` 复选项
- `Clear`：清空所有 `Tx` 勾选
- 底部按钮：`Cancel` / `ADD BID`

### Pairing 选择

Pairing 列表支持多选。

每个选项建议展示：

- Pairing Number
- 起止日期，例如 `2026-05-01 - 2026-05-03`
- 可选的内部 id 仅用于 debug 或详情，不作为用户主要识别字段

空状态：

```text
No pairing runs found for this date.
```

加载失败：

```text
Unable to load pairing runs for this date.
```

### `Tx` 选择

`Tx` 选择沿用 Days Off 的习惯：

- 默认可先选当前 active `Tx` 到 `T7`，保持和 Days Off 的默认层级扩展习惯一致。
- 用户可以手动勾选或取消任意 `Tx`。
- `Clear` 只清空勾选，不自动保存。

### 保存按钮状态

`ADD BID` 在以下情况下不可用：

- Pairing 列表仍在加载。
- 没有选中任何 pairing。
- 没有选中任何 `Tx`。
- 当前保存请求正在执行。

## 保存语义

保存固定为 `Award Pairing Number on Specific Date`。

数据表达继续使用现有 `propertyCode = 102`：

```text
propertyCode = 102
name = Pairing Number
action = award
bid.type = tag-list-date
bid.values = selected pairing numbers
bid.date = clicked origin date
tiers = selected Tx list
```

示例：

```text
Pairing Number | M4959, V4146, T1234 on 2026-05-01 | T1/T2
```

## 合并规则

### Existing Pairing Properties 合并

新增 pairing bid 时，如果 draft 中已有一条满足以下条件的 row，则合并到这条 row，而不是新增重复 row：

- `propertyCode = 102`
- `action = award`
- `bid.type = tag-list-date`
- `bid.date = 点击日期`
- `tiers` 集合完全相同

合并时：

- `values` 使用去重后的 Pairing Number 列表。
- 保持稳定排序，避免 UI 抖动。
- 已存在的 Pairing Number 不重复插入。

不能合并的情况：

- 日期不同。
- `Tx` 集合不同。
- action 不同。
- 一个是 `Entire Month`，一个是 `Specific Date`。

这些情况保持独立 row，避免语义被错误扩散。

### 左侧日历显示合并

左侧日历不应为同一天同 `Tx` 的多个 pairing 挤出多条蓝色 event。

显示规则：

- 同一天、同 `Tx`、同 specific-date pairing bid 组合为一条蓝色 event。
- label 使用第一个 Pairing Number 加数量后缀。
- 多于 1 个时显示 `M4959 +2`。
- 只有 1 个时显示 `M4959`。

点击蓝色 event 后，详情弹窗需要能展示所有 pairing：

- Pairing Number 列表
- `Tx`
- Origin Date
- 每个 occurrence 的 Date Range
- Mode = `Specific Date`

## API / 后端设计

### 日期查询

复用或扩展现有 occurrence 查询能力。

当前已有：

```text
GET /api/pairing-search/pairing-occurrences
```

本功能需要一个按日期查询当天 originate pairings 的能力。推荐在现有 `pairing-search` service 内新增轻量 endpoint 或扩展查询参数：

```text
GET /api/pairing-search/pairing-occurrences?originDate=2026-05-01&periodCode=May%202026
```

返回字段可继续复用 `PbsPairingOccurrence`：

```ts
type PbsPairingOccurrence = {
  occurrenceId: string;
  pairingNumber: string;
  pairingId: string;
  originDate: string;
  startDate: string;
  endDate: string;
  label: string;
};
```

查询要求：

- 必须带 `periodCode`。
- 必须按 `originDate` 过滤。
- 不允许扫全量 pairing 后在前端过滤。
- 只按业务 Pairing Number，也就是 live `pairing.pairing_label` 作为用户识别字段。

### 保存合并

保存可以有两种落地方式：

1. 前端读取现有 draft 后合并，再调用现有保存能力。
2. 后端新增 merge-aware add endpoint，把“同日期同 `Tx` 合并”做在服务端。

推荐实现时优先评估后端合并，因为它能避免并发下重复 row。若第一阶段使用前端合并，也必须保留后端重复校验或冲突处理。

## 前端设计

建议新增一个小组件：

```text
PairingCalendarBidPopover
```

职责：

- 接收点击日期、anchor、active `Tx`
- 拉取当天 occurrence
- 维护 selected occurrence ids
- 维护 selected tiers
- 渲染 `Clear`、`Cancel`、`ADD BID`
- 确认后交给上层执行保存

`ScheduleEventCalendar` 保持通用，不直接认识 Pairing 业务，只暴露日期点击回调。`DashboardSchedulePanel` 或 Pairing 页面容器负责判断当前页面是否允许 pairing date add。

## 非目标

本轮不做：

- `Avoid Pairing Number`。
- planned absence 冲突禁用。
- Days Off override 语义。
- 查询 touch 这一天但不是当天 originate 的 pairing。
- 完整 legs 详情。
- 从蓝色 event 里编辑、删除、改 `Tx`。
- `View Pairing Set` 最终 pool 计算。

## 边界情况

1. 当天没有 pairing：显示空状态，不能保存。
2. 用户清空所有 `Tx`：`ADD BID` 不可用。
3. 用户取消所有 pairing：`ADD BID` 不可用。
4. 重复添加同一 pairing：合并去重。
5. 不同 `Tx` 集合的同日期 pairing：保持两条 row，不强行合并。
6. 跨月 carry-out pairing：只有 originate 日期在点击日时才出现。

## 测试计划

后端：

- 按 `originDate` 查询当天 occurrence。
- 不返回跨过当天但 originate 不在当天的 pairing。
- 查询结果只使用业务 Pairing Number。
- 合并保存时同日期同 `Tx` 去重。
- 不同 `Tx` 集合不误合并。

前端：

- `Pairing` 页面点击日期打开 `Add Pairing Bid` 浮层。
- 浮层加载当天 occurrence。
- 支持多选 pairing。
- 支持多选 `Tx` 和 `Clear`。
- 未选 pairing 或未选 `Tx` 时禁用 `ADD BID`。
- 保存后 `EXISTING PAIRING PROPERTIES` 合并为一行。
- 保存后左侧日历显示 `M4959 +2`。
- 点击合并蓝条展示多个 pairing 的详情。

回归：

- Days Off 页面日期点击行为不变。
- Pairing 蓝色 event 只读详情不回退。
- 现有 `PairingOccurrenceBidDialog` 的 `Entire Month / Specific Date` 流程不回退。
- Search Pairings 的 `BID THESE PROPERTIES` 流程不回退。

## 验收标准

1. 在 `Pairing` 页面点某天，只展示这一天 originate 的 pairing。
2. 用户可以一次选择多个 pairing。
3. 用户可以一次选择多个 `Tx`。
4. 保存固定为 `Award Pairing Number on Specific Date`，UI 不显示 `Award / Avoid`。
5. 同一天同 `Tx` 集合的多个 pairing 合并为一条 `EXISTING PAIRING PROPERTIES` row。
6. 左侧日历合并显示为 `M4959 +2`。
7. 点击蓝色合并 event 能看到包含的所有 pairing。
8. Days Off 日历编辑能力不受影响。
