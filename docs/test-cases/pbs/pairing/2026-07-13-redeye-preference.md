# PBS Pairing Redeye Preference 测试用例

> 已被 `docs/test-cases/pbs/pairing/2026-07-16-redeye-preference-date-standardization.md` 取代。本文中的 `Any date / Specific date`、默认 Award 和 legacy `flag` 兼容步骤仅保留为历史记录，不再作为当前验收标准。

## 目标

验证 `Redeye Preference` 条件按 Jen 文档表达：

- 员工可 Award/Avoid redeye flights。
- 弹窗显示公司定义 `03:30-05:30 local time`。
- 员工可选择 `Any date` / `Specific date` / `Date range`。
- 保存 payload 使用新的 `redeye-preference` bid。
- 存量旧 `{ type: "flag" }` bid 不失效。

## 前置条件

- 当前 PBS period 处于可编辑状态。
- Pairing property catalog 中 `propertyCode=117` 名称为 `Redeye Preference`。
- 数据库已执行 migration：`sql/migration/2026-07-13-pbs-redeye-preference.sql`。

## 主流程

1. 进入 PBS Portal 的 `Pairing` 页面。
2. 在右侧可添加条件区域切到 `ALL PROPERTIES`。
3. 点击 `Add Redeye Preference`。
4. 验证弹窗标题为 `Configure Redeye Preference`。
5. 验证 `TIERS` 默认无选中且显示 required 状态。
6. 验证 `PREFERENCE` 默认选中 `Award`，`Avoid` 未选中。
7. 验证 `REDEYE` 区域显示 `03:30-05:30 local time`，不显示冗长的 `Redeye Definition` 说明。
8. 验证 `DATE` 默认选中 `Any date`。
9. 未选择 tier 时，`ADD BID` 不可点击。
10. 选择 `T1` 后，`ADD BID` 可点击。
11. 点击 `ADD BID`。

预期结果：

- 新增 bid 出现在当前 Pairing bid 列表中。
- 显示摘要包含 `Award` 和 `Redeye`。
- 保存 payload：

```json
{
  "propertyCode": 117,
  "action": "award",
  "quantifier": null,
  "tiers": ["T1"],
  "bid": {
    "type": "redeye-preference",
    "dateScope": null
  }
}
```

## 日期模式

### Specific date

1. 打开 `Redeye Preference` 弹窗。
2. 选择 `Specific date`。
3. 不选日期时确认 `ADD BID` 不可点击。
4. 选择 `2026-06-03`。
5. 选择 `T1` 后保存。

预期 payload：

```json
{
  "bid": {
    "type": "redeye-preference",
    "dateScope": {
      "mode": "specific_date",
      "date": "2026-06-03"
    }
  }
}
```

### Date range

1. 打开 `Redeye Preference` 弹窗。
2. 选择 `Date range`。
3. 只选开始日期时确认 `ADD BID` 不可点击。
4. 选择 `2026-06-03` 到 `2026-06-18`。
5. 选择 `Avoid` 和 `T1` 后保存。

预期 payload：

```json
{
  "action": "avoid",
  "bid": {
    "type": "redeye-preference",
    "dateScope": {
      "mode": "date_range",
      "from": "2026-06-03",
      "to": "2026-06-18"
    }
  }
}
```

### 清理隐藏值

1. 选择 `Specific date` 并选中 `2026-06-03`。
2. 切回 `Any date`。
3. 保存。

预期结果：

- payload 的 `dateScope` 为 `null`。
- 不保留隐藏的 `specific_date`。

## Search Pairings 验证

1. 对已有 `Redeye Preference` bid 点击 preview / search。
2. 验证 Search Pairings criteria card 可显示 Redeye 摘要。
3. 点击编辑 criteria。
4. 验证弹窗复用同一个 `Configure Redeye Preference` 编辑器。

预期结果：

- `Award` / `Avoid` 可正确回显。
- `Any date` / `Specific date` / `Date range` 可正确回显。
- 搜索条件使用 Redeye window overlap 语义，而不是简单跨夜。

## 存量兼容

准备一条旧数据：

```json
{
  "propertyCode": 117,
  "name": "Any Leg Is Redeye",
  "action": "award",
  "quantifier": "any",
  "bid": { "type": "flag" }
}
```

验证：

- 页面不报错。
- 打开编辑弹窗时显示为 `Configure Redeye Preference`。
- 默认 `Any date`。
- 保存后新 payload 转为 `redeye-preference`，`dateScope=null`。

## 回归范围

- `Flight Number Preference` 的日期模式和 matching flights 不受影响。
- `Pairing Length` 的 start date range 不受影响。
- `Work Day Preference` 的 date/day 选择不受影响。
- `Airport Preference` 的 event/date/quantity 不受影响。
