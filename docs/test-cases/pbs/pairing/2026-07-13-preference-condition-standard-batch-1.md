# PBS Preference Condition 标准化 Batch 1 QA 用例

## 范围

本批覆盖：

- Flight Legs per Duty
- Work Day Preference
- Pairing Length 回归检查

## 前置条件

- 使用 PBS Portal Pairing 页面。
- 当前 bid period 有可选日期。
- 用户可进入 Current Bid，并能新增 / 编辑 Pairing bid。

## Flight Legs per Duty

### 最小有效保存

1. 打开 Pairing 页面。
2. 搜索并点击 `Add Flight Legs per Duty`。
3. 确认 `TIERS` 默认未选，`Award` 和 `Any duty` 默认选中。
4. 选择 `T1`。
5. 选择 operator，例如 `More than`。
6. 输入合法 legs 数值，例如 `3`。
7. 点击 `ADD BID`。

预期：

- 未选 tier、未选 operator 或 legs 为空时 `ADD BID` disabled。
- legs 超出 min/max 时 `ADD BID` disabled。
- 保存后的 bid summary 不显示技术 preview 文案。
- 编辑该 bid 时 action、duty match、operator 和 legs value 正确回显。

## Work Day Preference

### Specific dates / weekdays

1. 打开 `Add Work Day Preference`。
2. 确认 `TIERS` 默认未选，`Award`、`Any work day`、`Specific dates / weekdays` 默认选中。
3. 选择 `T1`。
4. 在 date picker 中选择一个日期。
5. 点击 `ADD BID`。

预期：

- 只选 tier、未选日期或 weekday 时 `ADD BID` disabled。
- 选择日期后 `ADD BID` enabled。
- 保存 payload 只包含 `date-or-dow-list` 当前值。

### Mode 清理

1. 打开 `Add Work Day Preference`。
2. 选择一个 specific date 和一个 weekday。
3. 切换到 `Date range`。
4. 选择 range start/end。
5. 再切回 `Specific dates / weekdays`。

预期：

- 切到 `Date range` 后旧 specific date 和 weekday 不显示、不提交。
- 只选 range start、未选 end 时 `ADD BID` disabled。
- 切回 `Specific dates / weekdays` 后旧 range 不残留。

### 编辑回显

1. 准备一个已有 Work Day Preference date range bid。
2. 点击 edit。

预期：

- `Date range` 处于选中态。
- start/end 日期正确回显。
- 不显示技术 operator 文案，例如 `Between`。

## Pairing Length 回归

1. 打开 `Add Pairing Length`。
2. 确认不显示重复的 `PAIRING LENGTH · REQUIRED` section。
3. 选择 tier。
4. 输入 `Min days` 或 `Max days`。
5. 开启 `LIMIT TO PAIRING START DATE`。
6. 不完整选择 date range。

预期：

- date limit 默认关闭。
- 未完整选择 date range 时 `ADD BID` disabled。
- 关闭 date limit 后旧 date range 不进入保存 summary/payload。

## 回归范围

- Pairing 页面新增 bid。
- Search Pairings criteria 编辑回显。
- Save Favorite / Add Bid 使用同一 validity。
- `Cancel` 不保存局部修改。
