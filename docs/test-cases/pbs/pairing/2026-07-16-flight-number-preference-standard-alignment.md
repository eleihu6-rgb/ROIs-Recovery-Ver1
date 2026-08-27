# Flight Number Preference 标准答案对齐测试用例

## 目标

验证 property 116 不再包含 `MATCHING FLIGHTS`，并且可选的 `LIMIT TO FLIGHT DATE` 与 Airport Preference 日期控件保持一致。

## 前置条件

- 使用包含 Flight Number Preference 的 PBS 测试环境。
- 当前 bid period 内至少有两个可选择日期。
- 测试数据包含同一 flight number 的 FLY/FLT 航段以及 DHD 航段。

## Portal 配置

1. 打开 Pairing 页面，新增 Flight Number Preference。
2. 确认默认 Action 为 Award，`LIMIT TO FLIGHT DATE` 默认关闭。
3. 确认页面没有 `MATCHING FLIGHTS`、Minimum、Maximum 数量输入。
4. 输入并选择一个或多个 flight number。
5. 开启 `LIMIT TO FLIGHT DATE`，确认默认显示 `Specific Dates`。
6. 选择两个不同日期，保存。

预期：

- 请求 payload 仅包含 `type`、`flightNumbers`、`dateScope`，不包含 `minimumRequired` 或 `maximumRequired`。
- `dateScope` 为 `{ "mode": "specific_dates", "dates": [...] }`。
- 切换到 `Date Range` 会清空 Specific Dates；切回 Specific Dates 会清空 Date Range。
- 关闭日期限制后 `dateScope` 为 `null`。

## 搜索与匹配

1. 分别以 Award、Avoid 创建相同 flight number 条件。
2. 不限制日期时执行 Search Pairings。
3. 分别使用 Specific Dates 多选和 Date Range 再次搜索。

预期：

- Award 预览返回至少包含一个匹配实际飞行航段的 pairing。
- Avoid 预览返回 Award 结果的补集。
- 仅 `seg_assignment` 为 `FLT` 或 `FLY` 的航段参与匹配；DHD 不参与。
- 日期限制使用 `pairing_segment.flt_dt`；任一所选日期命中即可匹配。
- 算法导出始终以正向匹配集合为基础，再由 Award/Avoid 决定计分方向。

## 旧数据清理

执行 `sql/migration/2026-07-16-pbs-flight-number-preference-standard-answer-semantics.sql` 后验证：

- property 116 的普通收藏、配置收藏、通用收藏均被删除。
- 包含 property 116 的完整 property group、condition 与 occurrence 被删除。
- 受影响 tier 的 `total_groups`、bid 的 `total_tiers` 已重新计算。
- 空 tier 和空 bid 被安全删除。
- 重复执行迁移不会报错，也不会产生额外变化。
