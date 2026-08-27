# PBS Line Mixed Line Bid 人工测试用例

## 范围

验证 Line 页面 `Mixed Line Bid`（底层 `propertyCode=427`，数据库 canonical 名称仍为 `Reserve`）按参考项目语义展示和保存：

- Current Line 与 Standing Lineholder 均显示 `Mixed Line Bid`。
- 新建默认选中 `Mixed Line`，该默认态不保存 427 bid。
- 可切换为 `Reserve Only`（保存 `action = "award"`）或 `Pairing Only`（保存 `action = "avoid"`）。
- Tier 初始为空；`ADD BID` 前必须选择至少一个 Tier。
- 保存 payload 使用 `bid.type = "flag"`，并只写入显式 `action = "award" | "avoid"`，不得写入 `mixed`。
- 已有 427 条件编辑回 `Mixed Line` 后应删除该 bid，而不是保存一条空 action 记录。
- Standing Reserve 继续隐藏 `propertyCode=427`。
- 旧 Reserve Avoidance 数据由 2026-08-12 migration guard 阻断，不允许静默删除 crew 数据。

## 前置条件

- 数据库已执行 `sql/migration/2026-08-12-pbs-line-reserve-reference-parity.sql`。
- `pbs_bid_property.property_code = 427`，`bid_type = 'Line'`，`property_name = 'Reserve'`。
- 当前用户可进入 PBS Portal 的 `Line` 页面。

## 用例 1：新增默认 Mixed Line Bid

1. 打开 `Line` 页面。
2. 在 `ADD LINE PROPERTIES` 中搜索 `Mixed Line`。
3. 点击 `Add Mixed Line Bid`。

预期：

- 弹出 `Configure Mixed Line Bid`。
- 显示 `TIERS` 和 `PREFERENCE`。
- Tier 初始均未选中，`ADD BID` disabled。
- `Mixed Line` 默认选中，`Reserve Only` / `Pairing Only` 未选中。
- 即使选择 Tier，只要仍为 `Mixed Line`，`ADD BID` 和 `SAVE FAVORITE` 仍 disabled。
- 不显示输入框或 `Whole bid month` 占位。

## 用例 2：保存 Reserve Only

1. 在弹窗中选择至少一个 Tier。
2. 选择 `Reserve Only`。
3. 点击 `ADD BID`。

预期：

- `EXISTING LINE PROPERTIES` 中出现 `Mixed Line Bid`。
- `BID` 摘要显示 `Reserve only for the whole bid month`。
- 请求 payload 中 427 条件的 `action` 为 `award`，`bid` 为：

```json
{
  "type": "flag"
}
```

## 用例 3：保存 Pairing Only

1. 删除当前 427 条件，或在新的 draft 中重新添加。
2. 打开 `Configure Mixed Line Bid`。
3. 选择 `Pairing Only`。
4. 点击 `ADD BID`。

预期：

- `BID` 摘要显示 `Pairing only for the whole bid month`。
- 请求 payload 中 427 条件的 `action` 为 `avoid`，`bid.type = "flag"`。

## 用例 4：编辑回 Mixed Line 删除 427

1. 准备已有 `Mixed Line Bid` 且 `action = "award"` 或 `action = "avoid"` 的 Line draft。
2. 点击 existing row 的 Edit。
3. 在弹窗中选择 `Mixed Line`。
4. 点击 `UPDATE BID`。

预期：

- Current Line 发送 427 existing row 的 delete 请求，或 Standing Lineholder 保存时移除该 row。
- 不发送 `action = null` / `action = "mixed"` 的 427 保存 payload。
- existing list 中该 `Mixed Line Bid` 消失。

## 用例 5：收藏回填

1. 配置 `Mixed Line Bid` 为 `Pairing Only`。
2. 点击 `SAVE FAVORITE`。
3. 从 `FAVORITED PROPERTIES` 再次添加该收藏。

预期：

- 收藏在 UI 中显示为 `Mixed Line Bid`。
- Favorite 保存 action 与 bid，但不保存 Tier。
- 从收藏打开弹窗后 `Pairing Only` 保持选中，Tier 初始为空。
- 添加后的 existing 条件摘要仍为 `Pairing only for the whole bid month`。

## 用例 6：Algorithm Export

1. 准备包含 `Reserve Only` 的 Line draft 并导出。
2. 准备包含 `Pairing Only` 的 Line draft 并导出。
3. 准备默认 `Mixed Line`，确认不产生 427 draft row 后导出。

预期：

- `Reserve Only` 导出：
  - `Code_ID = 427`
  - `Rule_ID = 427`
  - `Rule_Type = RESERVE`
  - `Parameters_JSON = {"action":"award","scope":"whole_bid_month"}`
- `Pairing Only` 导出：
  - `Code_ID = 427`
  - `Rule_ID = 427`
  - `Rule_Type = RESERVE`
  - `Parameters_JSON = {"action":"avoid","scope":"whole_bid_month"}`
- `Mixed Line` 不导出 427 row。

## 回归范围

- `Efficient Flying First` 继续使用 `Award / Avoid`。
- `Reserve / Flying Date Pattern` 继续使用 `propertyCode=410`。
- `Reserve` 页面里的 Reserve 条件不受 427 Line 条件影响。
