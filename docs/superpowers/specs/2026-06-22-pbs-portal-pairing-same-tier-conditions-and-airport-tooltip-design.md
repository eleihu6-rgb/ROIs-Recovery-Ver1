# PBS Portal Pairing 同 Tier 多条件与机场提示设计

> 日期：2026-06-22  
> 状态：用户已确认，按纠偏方案实现  
> 范围：PBS Portal Pairing bid 配置、Employee `19` E2E 测试、机场选项提示

## 1. 背景

Employee `19` 的 T5 legacy 条件为：

`Award Pairings If Departing On Monday, Wednesday If Any Landing In YVR`

用户澄清后，本次“组合条件”不是指在 contract / server / DB 中新增 nested `conditions[]` 或写入 `pbs_bid_condition`，而是指 Portal UI 可以通过多条独立 bid row 共同表达同一个 tier 的筛选条件。

因此 T5 应录入为两条普通 `T5` bid：

1. `Departing On`，`Award · Mon, Wed`
2. `Any Landing In Airport`，`Award · Any · YVR`

这两条都在 `T5`，由现有 current rules 逻辑在同一 tier 下组合计算，不新增后端协议或数据结构。

## 2. 正确实现范围

本次只做两件事：

- 更新 `PBS-3325` Playwright 测试，把 T5 拆成两条普通 T5 UI bid row。
- 在 airport multi-select 的 `BID` label 旁增加可 hover / focus 的问号 tooltip，说明 airport options 的来源。

不再做以下改动：

- 不扩展 `packages/contracts` 的 pairing draft property。
- 不给 Portal property 增加 `conditions` 字段。
- 不修改 PBS Server add / patch / save draft payload。
- 不新增手工写入 `pbs_bid_condition` 的逻辑。
- 不在配置弹窗新增 `AND CONDITIONS` 子配置区。

## 3. T5 UI 录入规则

来源语义映射如下：

| UI Row | Tier | Property | Action / Bid |
|---|---|---|---|
| 1 | `T5` | `106 Departing On` | `Award · Mon, Wed` |
| 2 | `T5` | `101 Any Landing In Airport` | `Award · Any · YVR` |

E2E 断言需要注意：

- `Any Landing In Airport` 同时会出现在 T4 和 T5，因此断言 Existing row 时不能只取同名第一行。
- 断言必须定位到“同名且目标 tier active”的 row。
- 来源条件数量仍为 5 条，但 UI replay property 数量为 6 条。

## 4. Airport Tooltip

T4 当前缺口不是机场基础表完全缺失，而是 airport multi-select 选项来自当前 base + 当前 bid period 的 pairing 数据集合。若当前 YYZ / June pairing 数据里没有某些 legacy 机场，用户在下拉中搜不到。

本次只加说明，不改变过滤策略。

位置：

- Pairing property config dialog 中，airport multi-select 的 `BID` label 右侧。

交互：

- 使用问号 icon。
- 支持 hover 显示。
- 支持 keyboard focus 显示。
- 使用页面内文本 tooltip，不依赖浏览器原生 `title`。

英文文案：

`Airport options are limited to airports found within pairings for the current base and bid period.`

## 5. 验收标准

- `PBS-3325` 中 T5 通过两条普通 T5 bid row 完成录入。
- `PBS-3325` 报告区分 `totalSourceConditions = 5` 和 `totalUiProperties = 6`。
- T4 / T5 两条 `Any Landing In Airport` 断言都能定位到各自 active tier row。
- Airport property 弹窗里 `BID` label 旁显示问号。
- hover 或 focus 问号时显示英文 tooltip。
- 不再有 contract、pbs-server、search builder、Portal 状态模型层面的 nested `conditions` 改动。

## 6. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是对上一版误解的收敛修正，范围小且需要保证 diff 最小化。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal` tooltip、`e2e` 专项测试、相关文档。
- Conflict risk: 低；主要风险是同名 airport row 断言误命中。
- Execution gate: 用户已通过“去做吧”确认进入实现。
