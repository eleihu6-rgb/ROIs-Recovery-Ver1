# PBS Pairing - Any/Every Layover On Date / Day 回归测试

## 前置条件

- 已登录 PBS Portal。
- 当前存在可编辑的 Current pairing draft。
- Pairing 条件列表中可看到 `Any/Every Layover On Date / Day`。

## 测试步骤

1. 打开 `Any/Every Layover On Date / Day` 配置弹窗。
2. 确认弹窗显示 `Award / Avoid` 和 `Any / Every`。
3. 确认 `BID` 为 `In` 时显示日期 / 星期几选择控件。
4. 确认页面不显示 `Type airport or city code` 输入框。
5. 选择一个日期，例如 `2026-04-10`，保存。
6. 重新打开该条件，确认日期能回显。
7. 再选择一个星期几，例如 `Sat`，保存并确认回显。
8. 将 `BID` 切换为 `Between`，输入开始日期和结束日期后保存。
9. 分别验证 `Any`、`Every`、`Award`、`Avoid` 均可保存。

## 预期结果

- 123 使用日期 / 星期几控件，不使用 airport / city code 输入。
- `In` 支持一个或多个日期、星期几。
- `Between` 显示日期范围输入。
- `Any / Every` 语义可以保存并回显。
- `Award / Avoid` 语义可以保存并回显。

## 异常与边界

- 未选择日期也未选择星期几时，应无法保存为有效条件。
- `Between` 的结束日期早于开始日期时，后端应拒绝。
- 如果通过接口提交旧 `tag-list-date`，后端应返回 `Any/Every Layover On Date / Day requires date-or-dow bid.`。
- 如果通过接口提交缺少 `quantifier` 的 123，后端应返回 `Any/Every Layover On Date / Day requires Any or Every.`。

## 回归范围

- Pairing 条件配置弹窗
- Current draft 保存与回显
- Search Pairings 预览条件生成
- `Any/Every Duty On Date / Day` 的日期 / 星期控件回归
- `Any/Every Layover In Airport` 和 `Layover at City on Date` 的机场类条件回归
