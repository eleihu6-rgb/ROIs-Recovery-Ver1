# PBS Bid Feedback Days Off 排序设计

## 背景

Bid Feedback 弹窗的 Days Off tab 当前按后端返回的 bid/property 展开顺序渲染。多个 Days Off bid 覆盖不同日期时，列表可能出现 `2026-06-03` 排在 `2026-06-01` 前面的情况，影响用户按日期扫描。

## 目标

- Days Off tab 的列表按日期全局升序展示。
- 同一天多条记录保持稳定、可预测排序。
- 不改变后端接口、数量统计、Award/Avoid pairing 排序或 Calendar 视图。

## 方案

在前端生成 `dayOffRows` 后做展示层排序：

1. `date` 升序。
2. 同日期按 `tier` 自然排序，例如 `T2` 在 `T10` 前。
3. 仍相同则按 `propertyName` 和稳定 `key` 排序，保证顺序确定。

排序只作用于 Bid Feedback 弹窗的 Days Off list，不修改原始 `data.daysOff`。

## 验收

- Days Off 列表显示为 `2026-06-01, 2026-06-02, 2026-06-03...` 的日期顺序。
- 同一天多条记录顺序稳定。
- 现有 Award/Avoid 表格样式统一不回退。
- 补充 component test 和 Playwright 对 Days Off 排序的断言。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单组件排序修复，拆分会增加协调成本。
- Suggested split: 不拆。
- Write boundaries: `pbs-portal` Bid Feedback 组件和现有测试。
- Conflict risk: 低。
- Execution gate: 用户已确认“要做排序”。
