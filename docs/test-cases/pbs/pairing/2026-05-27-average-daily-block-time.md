# PBS Pairing - Average Daily Block Time 回归测试

## 前置条件

- 已登录 PBS Portal。
- 当前页面可打开 Pairing 条件配置弹窗。
- 存在可编辑的 Current pairing draft。

## 测试步骤

1. 在 Pairing 属性列表中搜索 `Average Daily Block Time`。
2. 打开该条件的配置弹窗。
3. 观察 `BID` 控件形态与 operator 选项。
4. 输入一个合法时长，例如 `006:00`。
5. 选择 `>` 或 `<`，保存条件。
6. 再次打开该条件，确认保存后的值能正常回显。

## 预期结果

- 弹窗中的 `BID` 是 duration 输入，不是普通文本框。
- operator 只显示 `<` 和 `>`。
- 不显示 `=` 和 `Between`。
- 合法 duration 可以正常保存并回显。

## 异常与边界

- 输入 `08:75`、`abc`、空值时，应无法正常保存为有效条件。
- 若通过接口提交 `type=text`，后端应拒绝并返回清晰错误。
- 若通过接口提交 `operator==`，后端应拒绝并返回清晰错误。

## 回归范围

- Pairing 条件配置弹窗
- Current draft 保存
- Property catalog 回显
- Search Pairings 预览条件生成
