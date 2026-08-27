# PBS Pairing「Any/Every Duty Duration」测试用例

## 前置条件

- PBS Portal 和 PBS Server 正常启动。
- 当前用户已登录 PBS Portal。
- Pairing 页面可正常加载当前 bid period。
- 测试数据中包含至少一个 duty duration 不同的 pairing。

## 测试范围

- Pairing property `118 Any/Every Duty Duration`。
- 配置窗口控件形态。
- `Any / Every` 语义。
- `Award / Avoid` 语义。
- `> / < / Between` operator。
- 与其他 Pairing 条件组合后的 preview 回归。

## 用例 1：配置窗口控件形态

步骤：

1. 打开 Pairing 页面。
2. 找到 `Any/Every Duty Duration`。
3. 打开配置窗口。

预期结果：

- `MODE` 只显示 `Award / Avoid`。
- `QUANTIFIER` 显示 `Any / Every`。
- `BID` 区域显示 duration 输入控件，不是普通空白文本框。
- `BID` 输入框 placeholder 为 `HH:MM`。
- `operator` 只显示 `<`、`>`、`Between`。
- 不显示 `=`。

## 用例 2：Any Duty Duration

步骤：

1. 选择 `Any`。
2. 选择 `>`。
3. 输入 `11:30`。
4. 保存或进入 Search Pairings preview。

预期结果：

- 结果包含任意一个 duty duration 大于 11:30 的 pairing。
- 不满足该条件的 pairing 不应命中。

## 用例 3：Every Duty Duration

步骤：

1. 选择 `Every`。
2. 选择 `<`。
3. 输入 `10:00`。
4. 保存或进入 Search Pairings preview。

预期结果：

- 结果只包含每个 duty duration 都小于 10:00 的 pairing。
- 只要有一个 duty 不满足就应被排除。

## 用例 4：Between

步骤：

1. 选择 `Any` 或 `Every`。
2. 切换 operator 为 `Between`。
3. 输入 from `08:00`、to `12:00`。
4. 保存或进入 Search Pairings preview。

预期结果：

- 弹窗显示两个 duration 输入框。
- preview 成功。
- 参数按 duration 分钟正确比较。

## 用例 5：非法输入

步骤：

1. 输入空值。
2. 输入 `08:75`。
3. 输入 `abc`。
4. 尝试保存。

预期结果：

- 非法值不能保存为有效 bid。
- 后端不应接受旧 `text` 结构。

## 边界场景

- `11:30` 应视为 690 分钟。
- `112:30` 这类三位小时 duration 应可保存。
- 单个 duty 缺少计划 duty duration 时，应尽量用实际 duty duration 回退，不应导致整个 preview 失败。

## 回归范围

- `Pairing Total Credit`
- `Average Daily Credit`
- `TAFB`
- `Pairing Check-In Time`
- `Any Flight Number`
- `Any Leg Is Redeye`

