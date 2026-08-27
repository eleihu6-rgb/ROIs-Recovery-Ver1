# PBS Pairing 日历重复添加去重与蓝条合并设计

## 状态

- 日期：2026-05-07
- 模块：`pbs-portal` / `pbs-server`
- 状态：待实施

## 背景

在 `/pairing` 页面左侧 `BIDDING CALENDAR` 添加 specific-date `Pairing Number` bid 时，如果用户不是一次性添加，而是先添加一次、再添加一次相同或部分相同的 pairing/tier 组合，当前系统可能把重复内容继续保存进 draft。

用户观察到的表现是：同一个日历格子里出现多条蓝色 pairing 条，例如先显示 `C4101`，后面又显示一条 `C4101 +2`。这会导致格子空间不够，也让用户误以为同一个 pairing bid 被重复 award。

当前代码已有部分能力：

- 后端 `buildMergedPairingNumberSpecificDateProperty` 已能在某些场景下合并同日期 `Pairing Number` property。
- 后端 `buildPairingEvents` 已能把同一个 property row 内同日期多个 pairing number 显示成 `C4101 +N`。

缺口是：

- 保存侧没有完整按 `origin date + pairing number + tier` 去重。
- 跨多次添加后，可能形成多个 property row。
- 日历显示侧只合并同一事件或同一 row 内的数据，不能保证同一个格子最多一条蓝条。

## 目标

1. 添加 specific-date `Pairing Number` bid 时，按 `origin date + pairingNumber + tier` 去重。
2. 如果一次添加多个 `Tx`，已存在的 `date + pairingNumber + tier` 组合跳过，缺失的 tier 正常补齐。
3. 重复添加不报错，不新增重复记录。
4. 同一个 active tier 的日历格子里最多显示一条蓝色 pairing 条。
5. 多个 pairing 命中同一格子时，按覆盖日期并集显示一条蓝条，标签使用第一个 pairing number 加数量，例如 `C4101 +2`。
6. 即使 pairing 不是一次性添加，而是分多次保存，也能合并显示。
7. 不改数据库结构，不新增依赖。

## 非目标

- 不做历史数据 migration 或一次性清理脚本。
- 不改变 Pairing Search 的筛选逻辑。
- 不改变 `Pairing Number` property code：仍使用 `102`。
- 不改变 Days Off 的保存规则。
- 不改变 entire-month pairing bid 的 day off 冲突过滤规则。
- 不把 `rowSeq`、展示行号、label 或临时 UI 位置作为业务身份。

## 业务身份规则

本轮明确 specific-date pairing 添加的最小身份为：

```text
originDate + normalizedPairingNumber + tier
```

其中：

- `originDate` 来自 `tag-list-date.date`。
- `normalizedPairingNumber` 使用 trim + uppercase 后的 pairing number。
- `tier` 使用 `T1` / `T2` / ... 格式。

处理示例：

- 已存在：`2026-04-08 + C4101 + T2`
- 本次添加：`C4101`，tiers 为 `T2/T3/T4`
- 结果：跳过 `T2`，新增 `T3/T4`

## 保存侧设计

### 新增请求处理

后端 `POST /api/pairing-bids/current/properties` 处理 `Pairing Number` + `tag-list-date` + `award` 时，应在构造最终 draft property 前执行去重与合并。

流程：

1. 加载当前 draft existing properties。
2. 从 existing properties 中提取同 `originDate` 的 specific-date `Pairing Number` award 组合。
3. 将 candidate property 的 pairing numbers 与 tiers 展开成组合集合。
4. 按 `originDate + pairingNumber + tier` 删除已存在组合。
5. 如果删除后没有任何新增组合：
   - 不写入新 property。
   - 不 bump draft version。
   - 返回现有匹配 property 的 `propertyGroupKey` / `rowSeq`，保持当前 add-property 响应契约不变。
   - `draftVersion` 返回当前版本，不伪造新增版本。
6. 如果存在新增组合：
   - 合并到同日期的现有 specific-date `Pairing Number` property。
   - 保持 property 内 pairing numbers 去重排序。
   - 保持 tiers 去重排序。
   - 写入时继续使用稳定 `propertyGroupKey`。

### 避免交叉组合误加

如果 property row 同时用 `values[]` 和 `tiers[]` 表达多 pairing + 多 tier，会天然表示笛卡尔积。实现时必须避免因为简单合并 `values` 和 `tiers` 而引入用户没有选择过的组合。

推荐实现策略：

- 对同日期 specific-date `Pairing Number` award bids 做规范化分组。
- 优先合并“同日期、同组合语义可安全合并”的 property。
- 当合并会产生未选择过的交叉组合时，保留为多个 property row，但仍确保每个 `date + pairingNumber + tier` 唯一。

这样保存侧先保证数据正确，显示侧再负责把同格子视觉合并。

### 并发与版本

- 继续沿用当前 `draftVersion` 并发控制。
- stale draft 仍返回 `409 Current draft has changed. Please refresh before saving again.`
- no-op 重复添加不应 bump draft version，避免用户连续重复点击导致无意义版本增长。
- no-op 响应不新增字段，优先复用现有 `PbsPairingDraftPropertyMutationResponse`。

## 日历显示设计

### 合并规则

在构造左侧 `BIDDING CALENDAR` 的 active tier events 时，pairing 蓝条需要做同格合并：

1. 只处理 `type === "pairing_bid"` 且同一个 active tier 的事件。
2. 如果多个 pairing 事件的日期范围有交集，则合并为一个显示事件。
3. 合并后的 `startDate` 是所有事件开始日期最小值。
4. 合并后的 `endDate` 是所有事件结束日期最大值。
5. 标签使用排序后的第一个 pairing number；总数大于 1 时显示 `+N`。
6. 合并后的事件 metadata 保留全部 pairing numbers、internal ids、date ranges 和 property keys，供详情弹窗展示。

### 用户确认的显示规则

一个 active tier 的同一个日历格子只能有一条蓝条。

如果 `C4101` 覆盖 `2026-04-08` 到 `2026-04-10`，`C4102` 只覆盖 `2026-04-08`，合并后显示一条 `2026-04-08` 到 `2026-04-10` 的蓝条，标签类似：

```text
C4101 +1
```

## 详情与编辑

点击合并蓝条后：

- 详情弹窗应展示全部 pairing numbers。
- internal ids 和 date ranges 也应展示全部合并内容。
- 如果合并蓝条来自多个 property row，详情需要能表达多个 property keys。

本轮的最小实现可以保持现有“编辑 tier”入口只对可安全定位的 property 生效；如果合并事件对应多个 property keys，推荐先禁用单条 property 的 tier 编辑，或在实现计划中拆出多 property 编辑逻辑，避免错误修改其中一部分。

## 前端交互

- 用户添加重复 pairing 时，不显示错误 toast。
- 如果本次操作全部是重复组合，建议显示已有成功体系中的轻量反馈，例如 `Pairing bid already exists.` 或复用成功提示但不改变 draft。
- 如果本次操作部分重复、部分新增，提示仍可使用 `Pairing bid added.`。
- 保存中 pending/disabled 状态保持现有行为。

## 测试计划

### 后端

新增或扩展 `pbs-server/src/services/pairing/pairing-bid-service.test.ts`：

- 同 `originDate + pairingNumber + tier` 重复添加时不新增重复组合。
- 同一 pairing number 多选 tiers 时，已存在 tier 跳过，缺失 tier 补齐。
- 同一 origin date 分多次添加不同 pairing number 时，数据保持唯一。
- no-op 重复添加不 bump draft version。
- 合并逻辑不产生未选择过的 `pairingNumber × tier` 交叉组合。

新增或扩展 `pbs-server/src/services/calendar/bidding-calendar-service.test.ts`：

- 多个 property row 命中同一格子时，合并成一条 calendar event。
- 日期覆盖不完全一致时，合并事件使用日期并集。
- metadata 包含全部 pairing numbers / ids / date ranges / property keys。

### 前端

扩展 `pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts`：

- 同 active tier、同格多个蓝色 pairing event 最终只生成一条 `ScheduleCalendarEvent`。
- 合并蓝条 label 使用 `C4101 +N`。
- 合并蓝条 colSpan 覆盖日期并集。

扩展 `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`：

- 从 calendar 添加同一 pairing number 到已存在 tier 时不会触发重复显示。
- 多选 tiers 时只补齐未存在 tier。

## 验收标准

- 重复添加同一个 `originDate + pairingNumber + tier` 不会新增重复记录。
- 多选 `Tx` 时，重复 tier 跳过，未存在 tier 正常补齐。
- 同一个 active tier 的同一个日期格子最多显示一条蓝条。
- 多个 pairing 即使分多次添加，也合并显示为一条 `C4101 +N`。
- 合并蓝条按覆盖日期并集展示。
- 不改数据库结构。
- 不引入新依赖。
- 相关 `pbs-server` 测试通过。
- 相关 `pbs-portal` 测试、lint、build 不回退。
