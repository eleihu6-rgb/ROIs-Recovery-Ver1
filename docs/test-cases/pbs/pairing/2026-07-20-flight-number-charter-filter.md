# Flight Number Preference Type 搜索过滤 QA

## 范围

验证 `Pairing > Flight Number Preference` 中新增的可清空 `TYPE` 下拉。该选择只限制下方 `FLIGHT NUMBERS` autocomplete 候选，不作为独立 bid 条件保存。

## 前置条件

- 当前 bid period 有 Pairing 数据。
- live schema 的 `dictionary` 已配置 `PBS_FLIGHT_NUMBER_CATEGORY_RANGE`，至少包含：
  - `CHARTER_MAIN = 7000-7999`
  - `CHARTER_POSITIONING_NETWORK = 9900-9949`

## 用例

### FN-C01 默认状态

1. 打开 `Pairing` 页面。
2. 点击 `Add Flight Number Preference`。

预期：

- `TIERS` 默认未选。
- `PREFERENCE` 默认 `Award`。
- `TYPE` 下拉默认空值，显示选择提示。
- 下拉选项只包含 `Charter`、`Positioning Flights - Charter Network`。
- 下拉选项不包含 `Recovery Flights - Charter Network`。
- `ADD BID` 禁用，因为还没有选择具体 flight number。

### FN-C02 Type 限制搜索候选

1. 在 `TYPE` 下拉选择 `Charter`。
2. 在 `FLIGHT NUMBERS` 搜索框输入 `70`。

预期：

- 请求 `GET /api/pairing-search/flight-numbers` 带 `type=charter`。
- 候选只返回 numeric flight number 落在 `7000-7999` 的号码。
- `8000-8999 ACMI out` 不应因为 STC Code 为 `C` 而出现在 Charter 候选里。

重复验证：

- 选择 `Positioning Flights - Charter Network`，请求带 `type=positioning-charter-network`，候选落在 `9900-9949`。

### FN-C03 保存 payload

1. 选择 `Charter`。
2. 选择一个候选，例如 `7001`。
3. 选择一个 Tier。
4. 点击 `ADD BID`。

预期：

- 保存 payload 仍为：

```json
{
  "type": "flight-number-preference",
  "flightNumbers": ["7001"],
  "dateScope": null
}
```

- `type: "flight-number-preference"` 是 bid 类型 discriminator，必须保留。
- payload 不包含 autocomplete 搜索类型字段，也不包含 `charter`、`positioning-charter-network`、
  `recovery-charter-network`、`selectedType`、`category`、`preset` 或 `presets` 值。

### FN-C04 切换/清空 Type 不清已有选择

1. 选择 `Charter` 并选择一个 Charter flight number。
2. 切换到 `Positioning Flights - Charter Network`。
3. 点击清空按钮清空 `TYPE`。

预期：

- 已选 flight number tag 在切换或清空 Type 时都不被自动删除。
- 清空后，后续 autocomplete 恢复全量 flight number 候选。

### FN-C05 Search Pairings 回显

1. 在 Pairing 页面保存一个 `Flight Number Preference`。
2. 进入 Search Pairings 编辑该条件。

预期：

- 已选 flight number 和日期限制正常回显。
- `TYPE` 下拉默认空值，因为它不是持久化 payload。

## 回归范围

- `Flight Number Preference` 的 Award/Avoid、Tier、日期限制和保存按钮禁用态不变。
- Search Pairings 最终过滤仍按具体 `flightNumbers` 精确匹配，不按 Type 搜索。
- `PAIRING_SCORE.csv` schema 不变。
- 后端继续兼容 `recovery-charter-network` 请求，但该能力不属于本次 Portal UI 验收范围。
