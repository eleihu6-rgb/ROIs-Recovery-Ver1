# Flight Number Preference 手工测试

## 前置条件

- 当前 PBS bid period 为开放状态。
- 当前 base / period 至少有可搜索的航班号与 Pairing 航段。
- 已执行 `2026-07-13-pbs-flight-number-preference.sql`。

## 用例

1. 在 Pairing 的 All Properties 打开 `Flight Number Preference`。
   - 预期：Tier 初始均未选；Award 默认选中；Flight date 为 Any date；Minimum / Maximum 均为空；Add Bid 禁用。
2. 选择航班号 `0601`，Minimum 填 `1`，选择 T1。
   - 预期：Add Bid 可用；提交 payload 为 `flight-number-preference`，`dateScope` 为 `null`，不含 Any / Every。
3. 切换 Specific date 并选择一个日期，再切回 Any date。
   - 预期：日期选择器隐藏；保存的 payload 的 `dateScope` 为 `null`，不会保留原日期。
4. 切换 Date range，选择起止日期，Minimum 填 `1`、Maximum 填 `2`。
   - 预期：只有一个范围日历入口；结束日早于开始日或 Minimum 大于 Maximum 时不能保存。
5. 用 Award / Avoid 分别预览同一 flight-number/date/count 条件。
   - 预期：Award 返回满足条件的 Pairing；Avoid 对完整 flight number + date + count 条件取反。
6. 在 Search Pairings 打开同一条 criteria 的编辑弹窗。
   - 预期：与 Pairing 页面使用相同字段、日期控件、空值和有效性规则；已保存的 date scope / 数量完整回显。
7. 检查 migration 后的历史数据。
   - 预期：旧 property 116 `tag-list + any` bid、configured favorite、simple favorite 均不可见；其他 property 和 favorite 不受影响。
