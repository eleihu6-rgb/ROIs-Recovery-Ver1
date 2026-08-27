# PBS Portal Bid Feedback UI 参考站对齐修正规格

## 背景

用户已根据参考站真实截图确认：PBS Portal Bid Feedback 需要保留 Award 表格最右状态列，但不能持续显示问号。Calendar 需要按参考站的周分段布局显示完整 Award Pairings 与 Days Off，不能因为密集数据覆盖后续周。

## 目标

1. Award 表格最右状态列保留，只展示明确的可飞/不可飞视觉状态。
2. Eligibility 三态在不伪装检查结果的前提下清晰展示。
3. Calendar 保留完整 Award Pairings + Days Off 数据集，按日期和周分段，动态计算每周高度。
4. 只做前端组件和最小相关测试修复，不改数据库、migration、API/schema 或数据流。

## 状态映射

| API 状态 | 表格状态列 | 行背景 | 详情顶部 | Eligibility 卡片 |
| --- | --- | --- | --- | --- |
| `eligible` | 中性 `✓` | 普通；选中浅蓝 | 绿色 `Eligible` | 绿色 `PASS` + 成功文案 |
| `ineligible` | 红色 `✗` | 未选中浅红；选中浅蓝 | 红色 `Not eligible` | 红色 `FAIL` + 原因标签和原因文案 |
| `unknown` | 空白，不显示问号，不显示对号 | 普通；选中浅蓝 | 中性 `Eligibility unavailable` | 中性 `N/A`，说明 Team Rule 未检查，不能验证 |

只有真正加载中才允许出现 `...` / Checking 类状态。当前 API 已返回但 Team Rule 不可用时，属于完成态不可判定，不能显示 PASS 或持续问号。

## Calendar 方案

- Calendar 输入继续使用完整 `awardPairings` 和可见 Days Off。
- 不隐藏、不截断、不改成 assigned-only。
- 按当前 Bid Period 构建周；每周内按事件日期范围裁剪为 segment。
- 每周独立做 lane packing；每周高度由该周 lane 数动态决定。
- 密集周只增加本周高度，不能覆盖后续周。

## 验收标准

1. Award 表格状态列存在，最终只出现 `✓` 或红色 `✗` 两个明确状态；`unknown` 为空白且无持续问号。
2. 未选中的 `ineligible` 行为浅红背景；选中任意行均为浅蓝背景。
3. `eligible` 详情显示绿色 `Eligible`、绿色 `PASS` 和成功文案。
4. `ineligible` 详情显示红色 `Not eligible`、红色 `FAIL`、原因标签和原因文案。
5. `unknown` 详情显示中性 `Eligibility unavailable`、`N/A`，并明确 Team Rule 未检查，不能验证。
6. Calendar 仍渲染全部 Award Pairings + Days Off，2617 条不会被隐藏或错误删除。
7. Calendar 按日期和周分段；密集多周数据不会互相覆盖。

## 验证范围

- 单测覆盖 eligibility 三态、选中/不可用背景优先级、Calendar 多周密集布局。
- Playwright 覆盖 Bid Feedback 弹窗中的表格状态列、详情状态和 Calendar 多周不覆盖。
- UI 样式改动后运行 `npm run check:ui`，并运行 focused 单测/E2E/lint/build 中与改动直接相关的最小集合。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动集中在同一组 Bid Feedback 组件和测试，并行开发会增加同文件冲突。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/bid/components/` 下 Bid Feedback 组件、对应 portal 单测、Bid Feedback E2E。
- Conflict risk: Medium，当前工作区已有相关文件未提交改动。
- Execution gate: 用户已批准实施。
