# Month-End Carryover 人工验收用例

## 范围

- 页面：`/pairing`、`/pairing/search`
- 条件：`Month-End Carryover`（propertyCode `163`）
- 目标：确认员工端不再显示旧 `Carry-Out Days` 条件名，不使用旧 `stepper` payload，统一使用数字比较 UI。

## 用例 1：Pairing 页面新增条件

1. 打开 Pairing 页面。
2. 在 Add Pairing Properties 中搜索 `Month-End`。
3. 点击 `Add Month-End Carryover`。
4. 验证弹窗标题为 `Configure Month-End Carryover`。
5. 验证默认 `Award` 选中，`Avoid` 未选中。
6. 验证 `T1` 默认未选中。
7. 验证比较符号下拉为空，天数输入框 placeholder 为 `Enter`，页面不显示 `1-5`。
8. 选择 `T1`、选择 `>`、输入 `6`。
9. 验证 `ADD BID` 可点击并保存成功。

预期 payload：

```json
{
  "propertyCode": 163,
  "action": "award",
  "quantifier": null,
  "tiers": ["T1"],
  "bid": {
    "type": "month-end-carryover",
    "operator": ">",
    "days": 6
  }
}
```

## 用例 2：Between 模式

1. 打开 `Configure Month-End Carryover`。
2. 选择 `Between`。
3. 输入 `From = 2`、`To = 4`。
4. 选择至少一个 tier。
5. 验证 `ADD BID` 可点击。

预期 payload：

```json
{
  "bid": {
    "type": "month-end-carryover",
    "operator": "Between",
    "from": 2,
    "to": 4
  }
}
```

## 用例 3：校验

- 未选择 tier：`ADD BID` 禁用。
- 未选择比较符号：`ADD BID` 禁用。
- 未输入天数：`ADD BID` 禁用。
- 输入 `0` 或负数：`ADD BID` 禁用。
- `Between` 中 `From > To`：`ADD BID` 禁用。

## 用例 4：Search Pairings 复水

1. 将一个 `Month-End Carryover` 条件 preview 到 Search Pairings。
2. 点击 Search Criteria 中的编辑按钮。
3. 验证弹窗仍显示 `Configure Month-End Carryover`。
4. 验证 `Avoid/Award`、比较符号、天数、tier 与原条件一致。

## 用例 5：搜索语义

- `Month-End Carryover > 5` 只匹配真正跨出当前 bid month 且 carry-out days 大于 5 的 pairing。
- carry-out days = `0` 的普通 pairing 不属于 Month-End Carryover，不应被 `<`、`=`、`>` 或 `Between` 命中。
