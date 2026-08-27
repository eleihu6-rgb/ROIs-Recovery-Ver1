# PBS Pairing Search Base 时区与 Duty Calendar QA 用例

日期：2026-06-11  
范围：PBS Portal `/fpqe/pbs/pairing/search`

## 前置条件

- 测试环境已连接包含 pairing / pairing_segment / airport 时区数据的 live schema。
- 当前 bid period 使用可覆盖跨月 pairing 的月份，例如 `Jun 2026`。
- Pairing Search 页面可正常加载搜索结果卡片。

## 用例 1：Duty report 在第一段航班前一天

操作步骤：

1. 进入 `/fpqe/pbs/pairing/search`。
2. 搜索一个 base 为 `YYC`，且 duty brief/report UTC 转 base 后落到第一段航班起飞前一天的 pairing。
3. 查看结果卡片左侧 `DATE / DEP / ARR` 与右侧 mini calendar。

预期结果：

- 左侧 `DATE` 显示 duty brief/report 在 base 时区下的日期，例如 `0627`。
- 第一段航班 `DEP` 可显示为下一天凌晨，例如 `0024`。
- 右侧 mini calendar 同步点亮 `0627`，不能从 `0628` 才开始点亮。
- `REPORT`、`DEP`、`ARR` 均按 pairing base 时区显示。

## 用例 2：最后一个 duty 跨到下一天

操作步骤：

1. 搜索一个最后 duty 或最后一段航班/签出跨到下一天的 pairing。
2. 查看右侧 mini calendar 的下月 trailing 日期。

预期结果：

- 如果最后 duty start 映射为 `0701`，右侧应点亮 `0701`。
- 如果最后航班结束或 debrief/sign-out 在 base 时区落到 `0702` 或 `0703`，对应 trailing 日期也应点亮。
- 不应只按 `duration_days` 展开，导致最后实际 duty 覆盖日期漏亮。

## 用例 3：横向滚动条

操作步骤：

1. 在常规桌面宽度打开 Search Pairings 结果列表。
2. 查看每张结果卡片左侧 legs 表格。

预期结果：

- 常规桌面宽度下不出现不必要的横向滚动条。
- `DUTY / DATE / FDP / F/H / D/H / CRD / FLTN / DPS / ARS / DEP / ARR / BLKT / EQP` 字段不重叠。
- 极窄宽度下允许表格横向滚动兜底。

## 回归范围

- Search Pairings 单条件 preview。
- Current Rules preview。
- Criteria preview。
- Calendar / Dashboard 中复用 pairing details card 的展示入口。
