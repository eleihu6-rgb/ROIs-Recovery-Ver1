# PBS Preference Condition 标准化 Batch 2 QA 用例

## 范围

本批覆盖 Pairing 中等复杂条件：

- Pairing Preference
- Airport Preference
- Pairing Check-In / Check-Out Time

## 前置条件

- 使用 PBS Portal Pairing 页面。
- 当前 bid period 有 pairing、airport / city options 和可选日期。
- 用户可进入 Current Bid，并能新增 / 编辑 Pairing bid。

## Pairing Preference

### 最小有效保存

1. 打开 `Add Pairing Preference`。
2. 确认 `TIERS` 默认未选，`Award` 默认选中。
3. 搜索并选择至少一个 pairing number。
4. 选择 `T1`。
5. 点击 `ADD BID`。

预期：

- 未选 tier 或未选 pairing number 时 `ADD BID` disabled。
- 保存后 summary 显示 Pairing Preference 和选中数量。
- 编辑该 bid 时 pairing number、Award/Avoid、date limit 和 fulfilment 正确回显。

### Pairing Preference modifiers removed

1. 选择一个 pairing number。
2. 使用 Search / Filters 改变候选列表。
3. 保存并重新编辑。

预期：

- 不显示 `LIMIT TO RUN DATE`、`FULFILMENT`、Minimum / Maximum required。
- 保存 payload 仅包含 stable Pairing IDs 和 labels。
- Search Pairings criteria 中编辑同一 bid 时回显一致，筛选状态不进入 payload。

## Airport Preference

### Location required

1. 打开 `Add Airport Preference`。
2. 确认 `Award` 和 `Landing` 默认选中，`TIERS` 未选。
3. 选择 `T1`，但不选 airport / city。
4. 再选择一个支持当前 event 的 airport 或 city。

预期：

- locations 为空时 `ADD BID` disabled。
- 选择 location 后 `ADD BID` enabled。
- 切换 event 后，不支持该 event 的 location 被清理。

### Optional fields

1. 打开 `LIMIT TO EVENT DATE`。
2. 在 `Specific Dates` 下不选日期。
3. 选择一个日期后关闭 switch。
4. 切换到 `Layover`。
5. 打开 `MINIMUM LAYOVER DURATION`，先留空，再填入 `12:00`。
6. 关闭 duration switch。

预期：

- event date scope 不完整时 `ADD BID` disabled。
- 关闭 event date switch 后 payload 不包含旧 date scope。
- layover duration 开启且空值 / 非 `HH:MM` 时 `ADD BID` disabled。
- 关闭 duration switch 后 payload 不包含旧 duration。

## Pairing Check-In / Check-Out Time

### 最小有效保存

1. 打开 `Add Pairing Check-In / Check-Out Time`。
2. 确认 `Check-In`、`Between`、`Any date` 默认态。
3. 选择 `T1`。
4. 选择 quick range，例如 `PM 14:00–22:00`。
5. 点击 `ADD BID`。

预期：

- time 为空时 `ADD BID` disabled。
- quick range 填充 from/to 后 `ADD BID` enabled。
- 切换 `Check-Out` 后保存 payload 的 `timeType` 正确。

### Date scope 清理

1. 选择一个合法 time。
2. 切换到 `Specific date`，不选日期。
3. 选择一个日期。
4. 切回 `Any date`。

预期：

- `Specific date` 不完整时 `ADD BID` disabled。
- 选择日期后 enabled。
- 切回 `Any date` 后 payload 的 `dateScope` 为 `null`，不残留旧日期。

## 回归范围

- Pairing 页面新增 bid、编辑 existing bid、Save Favorite。
- Search Pairings criteria 编辑回显。
- Footer 的 `Save Favorite` 和 `ADD BID` 使用同一 validity。
- segmented 控件的白色选中态与 `aria-pressed` 保持一致。
