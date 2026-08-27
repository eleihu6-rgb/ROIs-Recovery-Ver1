# PBS Reserve 日历点击选择 Tx 弹窗设计

日期：2026-05-28  
状态：待用户确认  
范围：Reserve 页面 coverage 日历点击新增 bid 的前端交互；本文件只定义需求和方案，不包含实现改动。

## 背景

当前 Reserve 页面已经支持：

- `Legacy Reserve` / `AA Prefer Off` 两种模式切换。
- coverage 日历展示每日 `Need` 和 `Off`。
- 点击日期直接新增当前顶部 Tx 对应的 Reserve 条件：
  - Legacy：`302 Reserve Day On`
  - AA：`311 Reserve Prefer Off`
- 页面顶部目前有 Tx/Tier 选择器，用户先选 Tx，再点击日期。

用户希望 Reserve 日历新增方式对齐 Pairing 左侧日历：

```text
点击日期后先弹出一个选择框，在弹窗里选择 Tx，再确认添加。
```

同时顶部 Tx/Tier 选择器去掉。

## 目标

1. 保留顶部 `Legacy Reserve` / `AA Prefer Off` 模式按钮。
2. 去掉顶部 Tx/Tier 选择器。
3. 点击 coverage 日历日期时不立即保存。
4. 点击日期后弹出一个类似 Pairing 左侧日历新增 bid 的 popover。
5. popover 内选择 Tx/Tier。
6. 用户点击 `Add Bid` 后才保存。
7. 保存仍走现有 `reserveService.addCurrentDraftProperty`。
8. Legacy / AA 模式的 property 语义不变：
   - Legacy 添加 `302 Reserve Day On`
   - AA 添加 `311 Reserve Prefer Off`
9. 已有日期 + Tx 重复时阻止保存并提示。

## 不做范围

- 不新增后端接口。
- 不改变 `301/302/311` 的后端校验。
- 不恢复 `ADD RESERVE BID` 手动新增区。
- 不把 Reserve coverage 日历迁到左侧共享 bidding calendar。
- 不实现 Reserve award engine。
- 不实现复杂 pattern 选择。

## Pairing 对齐点

Pairing 左侧日历当前行为：

- 点击某一天。
- 打开 anchored popover。
- 在 popover 中选择要添加的内容和 Tx。
- 点击确认后保存。
- 保存 pending 时禁用操作。
- 取消后关闭 popover。

Reserve 应采用同类交互：

- 点击 coverage 日历某一天。
- 打开 anchored popover。
- 在 popover 中选择 Tx。
- 点击确认后保存 `302` 或 `311`。
- 保存 pending 时禁用操作。
- 取消后关闭 popover。

## 交互设计

### 顶部区域

保留：

```text
Legacy Reserve | AA Prefer Off
```

去掉：

```text
T1 T2 T3 T4 T5 T6 T7
```

### 日历日期按钮

日期按钮仍展示：

- 日期数字。
- `Need: <requiredReserveCount>`
- `Off: <availableOffCount>`

点击日期按钮：

- 不直接调用保存。
- 打开该日期旁边的 popover。
- 如果已有 popover 打开，点击另一个日期时先切换到新日期。

### Popover 内容

标题建议：

```text
Add Reserve Day On
```

或 AA 模式：

```text
Add Reserve Prefer Off
```

内容：

- 日期：`YYYY-MM-DD`
- Coverage 摘要：
  - `Need: n`
  - `Off: n`
- Tx/Tier 多选：
  - `T1` 到 `T7`
  - 默认可选中 `T1`，或默认不选但禁用 `Add Bid`；推荐默认选中 `T1`，减少点击。
- 操作按钮：
  - `Cancel`
  - `Add Bid`

保存 pending 时：

- 禁用 Tx 按钮。
- 禁用 Cancel / Add Bid。
- Add Bid 显示 pending 文案，例如 `Adding...`。

### 重复处理

保存前检查：

```text
同一 propertyCode + 同一日期 + 同一 Tx 已存在
```

如果所有选择的 Tx 都已存在：

- 不调用 API。
- toast 提示已存在。

如果用户选择多个 Tx，且部分已存在：

- 推荐第一阶段：只保存未存在的 Tx。
- 已存在的 Tx 跳过。
- 如果后端当前一次 add 只能保存一个 property，可把未存在 Tx 合并为一个 property 的 active tiers。

## 数据流

1. 用户点击日期按钮。
2. `ReservePage` 保存 pending calendar action：

```text
{
  date,
  selectedTiers,
  anchor
}
```

3. popover 展示对应日期和 Tx 选择。
4. 用户选择 Tx 后点击 `Add Bid`。
5. 前端根据当前 mode 找到 property template：
   - Legacy：`302`
   - AA：`311`
6. 生成 `RuleBidAvailableProperty`：
   - `bid.type = "tag-list"`
   - `bid.values = [date]`
   - `tiers = createRuleBidTierOptions(selectedTiers)`
7. 调用现有 `handleAddProperty`。
8. 成功后：
   - 更新 query cache。
   - invalidate coverage / tier query。
   - 关闭 popover。
   - toast 成功。
9. 失败后：
   - popover 保持打开。
   - toast 或错误状态提示。

## 组件设计

### ReserveCoverageCalendar

当前只接收：

```text
activeTier
onSelectDate(date)
```

建议调整为：

```text
actionPopover?: ReserveCalendarActionPopover | null
onSelectDate(date, anchor)
```

其中 `anchor` 用于定位 popover，结构可参考共享 `ScheduleCalendarActionAnchor`，或简化为 button rect / day id。

### ReserveCalendarBidPopover

建议新增：

```text
pbs-portal/src/features/reserve/components/reserve-calendar-bid-popover.tsx
```

职责：

- 展示日期、Need/Off。
- 展示 Tx/Tier 多选。
- 发出 confirm / cancel。
- 不直接调用 API。

### ReservePage

新增状态：

```text
pendingCalendarAction
isCalendarActionPending
```

移除：

```text
activeTier
setActiveTier
ReserveTierSelector
```

保留 mode。

## 测试设计

更新 `reserve-page.test.tsx`：

1. 页面顶部不再显示 Tx/Tier selector。
2. 点击日期不会立即调用 `addCurrentDraftProperty`。
3. 点击日期后显示 popover。
4. popover 默认选择 `T1`。
5. 用户切换/选择 `T2` 后点击 `Add Bid`：
   - Legacy 模式保存 `propertyCode=302`
   - bid 日期为所点日期
   - active tier 为 `T2`
6. AA 模式下同样流程保存 `propertyCode=311`。
7. 重复日期 + Tx 不调用 API，并提示重复。
8. pending 时 Add Bid 禁用或显示 pending 状态。

## 验收标准

1. Reserve 顶部不再显示 Tx/Tier 选择器。
2. 点击 coverage 日期时不立即保存。
3. 点击日期后弹出选择 Tx 的 popover。
4. 在 popover 里选择 Tx 后点击 `Add Bid` 才保存。
5. Legacy 模式保存 `302 Reserve Day On`。
6. AA 模式保存 `311 Reserve Prefer Off`。
7. 重复日期 + Tx 不重复添加。
8. 现有 `EXISTING RESERVE PROPERTIES` bid 弹窗编辑不受影响。
9. `pnpm --dir pbs-portal exec vitest run src/features/reserve/pages/reserve-page.test.tsx` 通过。
10. `pnpm --dir pbs-portal build` 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 变更集中在 Reserve 前端日历组件、页面状态和测试，拆分多 agent 会增加合并成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/reserve/*`，必要时少量复用共享 schedule popover 类型。
- Conflict risk: 中低。需注意不影响 Pairing / Days Off 左侧共享日历。
- Execution gate: 用户确认本 spec 后再开始实现。

