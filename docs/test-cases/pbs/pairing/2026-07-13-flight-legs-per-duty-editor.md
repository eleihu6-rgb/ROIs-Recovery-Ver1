# Flight Legs per Duty 专用编辑器 QA 用例

日期：2026-07-13
范围：PBS Portal › Pairing › Add Properties › `Flight Legs per Duty`（property code 107）

## 前置条件

- 使用可编辑的 Current bid period 登录 PBS Portal。
- Pairing catalog 中能看到 `Flight Legs per Duty`。
- 当前用户至少可操作 T1–T7 中的一个 Tier。

## 用例 1：新增默认状态

1. 打开 Pairing 页面，进入 `ALL PROPERTIES`。
2. 点击 `Add Flight Legs per Duty`。

预期：

- 标题为 `Configure Flight Legs per Duty`，没有泛化副标题。
- 点击 legs 输入后，四边蓝色焦点边框完整可见，不被 `<`、`=`、`>` 控件遮挡；右侧 `legs` 后缀持续可见。
- T1–T7 全部未选，出现 `REQUIRED`，`ADD BID` 与 `SAVE FAVORITE` 禁用。
- `Award` 默认选中，`Avoid` 未选。
- `Any duty` 默认选中，`Every duty` 未选。
- `<`、`=`、`>` 均未选，legs 输入为空；不显示日期或旧的 total / first / last legs 条件。

## 用例 2：Jen 典型规则

1. 在新增弹窗中选择 T1。
2. 选择 `Avoid`，保持 `Any duty`。
3. 选择 `>`，输入 `3`。

预期：

- 不显示 `Avoid pairings with any duty having more than 3 legs.` 等自然语言提示句。
- `ADD BID` 与 `SAVE FAVORITE` 启用。
- 点击 `ADD BID` 后，Existing Properties 出现 `Flight Legs per Duty`；规则含 T1、Avoid、Any 与 `> 3`。
- 该规则表示避免任一 duty 有 4 legs 或以上的 pairing。

## 用例 3：Every duty 与边界值

1. 新增或编辑 `Flight Legs per Duty`。
2. 选择 `Every duty`、`=`，输入 catalog 允许范围内的整数。

预期：

- 不显示任何实时自然语言结果句。
- 不在允许范围内、非整数或清空 legs 值时，按钮禁用；已有可提交数值不会被空值提交。

## 用例 4：编辑回显与回归

1. 编辑已保存的 `Flight Legs per Duty` rule。
2. 检查 Award/Avoid、Any/Every、comparison、legs 和 Tier。

预期：

- 全部按已保存值回显，不套用新增时的空 legs 状态。
- 修改后可正常 `UPDATE BID`。
- Add Properties 不出现 `Total Legs In Pairing`、`Total Legs In First Duty`、`Total Legs In Last Duty`。

## 回归范围

- Pairing Preference、Airport Preference、Pairing Check-In / Check-Out Time 与其他通用 Pairing stepper 条件的默认值不改变。
- Search Pairings 编辑已有 `107` criterion 时同样回显既有值。
