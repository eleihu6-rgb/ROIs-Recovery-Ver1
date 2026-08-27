# PBS Days Off Min Consecutive Window N 修复设计

日期：2026-05-19  
状态：已确认，实施中  
范围：只修复 `Min Consecutive Days Off In Window` 的 N + 日期窗口语义，不调整其他 Days Off property。

## 背景

当前 `Min Consecutive Days Off In Window` 只渲染两个日期输入，无法填写 “N 天连续休息” 的 N。旧库参考数据中该 property 的真实结构是：

- `param_a`：连续休息天数 N。
- `param_b`：窗口开始日期。
- `param_c`：窗口结束日期。
- `operator`：`Between`。

因此当前 `date-range` 模型只能表达窗口，不能完整表达业务语义。

## 目标

1. 弹窗中该条件可以填写连续休息天数 N。
2. 同时保留窗口开始 / 结束日期。
3. 保存序列化为 `param_a=N`, `param_b=from`, `param_c=to`。
4. 回显旧数据时按同一结构恢复。
5. 补日期窗口顺序校验：结束日期不能早于开始日期。

## 方案

- 新增 bid value 类型 `stepper-date-range`，结构为 `{ value, from, to, min, max }`。
- 将 property `204` 默认值从 `date-range` 改为 `stepper-date-range`。
- `PairingBidControl` 增加该类型的渲染：一个数字输入 + 两个日期输入。
- `serializeRuleBid` / `deserializeRuleBid` / `formatRuleBid` 增加该类型映射。
- Days Off 后端校验 property `204` 的类型、N 范围和日期顺序。

## 验收

- `Configure Days Off Bid` 打开 `Min Consecutive Days Off In Window` 时显示 N 输入和日期窗口。
- 用户可以修改 N。
- `from > to` 时保存被阻止。
- 新增和回显都不丢失 N。
