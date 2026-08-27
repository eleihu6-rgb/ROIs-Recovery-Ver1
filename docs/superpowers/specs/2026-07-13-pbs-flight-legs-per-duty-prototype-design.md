# PBS Flight Legs per Duty 空白态原型设计

日期：2026-07-13
状态：已由正式实现 spec 取代
范围：仅生成 PBS Portal 的可视化原型；不修改产品代码、后端、数据库或现有条件行为，且不创建 Git 提交。

## 目标

用一个直接、可从空白开始填写的配置弹窗，表达 Jen 对 `Flight Legs per Duty` 的核心意图：用户按每个 duty 的 flight leg 数表达偏好或规避，而不是在 total / first / last duty 等多个技术入口间选择。

## Jen 的业务表达

- 主入口为 `Flight Legs per Duty`（property code `107`）。
- 用户可表达例如 `Avoid + Any duty + > 3`，即避免出现 4-leg day 或更多 legs 的 pairing。
- 原有 `Total Legs In Pairing`、`Total Legs In First Duty`、`Total Legs In Last Duty` 不出现在这个原型中。
- 本轮不加入日期、日期范围或其他额外限制。

## 原型布局与默认状态

1. 标题：`Configure Flight Legs per Duty`。
2. `Tiers · Required`：T1–T7 全部未选。
3. `Preference`：原型初稿为两项均未选；最终产品默认规则已改为 `Award`，见正式 spec。
4. `Duty match`：原型初稿为两项均未选；最终产品默认规则已改为 `Any duty`，见正式 spec。
5. `Legs per duty`：比较符 `< / = / >` 未选；数值输入为空。
6. 不显示日期区、说明小字、默认值或其他 legs 条件。
7. `ADD BID`、`SAVE FAVORITE` 初始禁用；最终启用规则与默认值以正式 spec 为准。
8. 保留 PBS Portal 已有的 modal shell、Tier 按钮、分段控制和 footer 语言/视觉，不另起一套产品风格。

## 交互边界

- 此原型展示候选交互，不能视为已改动生产默认值。
- 原型可点击 Tier、Preference、Duty match、operator 与数值输入，用于用户检查信息层级和填写路径。
- `ADD BID` 与 `SAVE FAVORITE` 只演示禁用/启用视觉状态；无论状态如何均不可提交、保存、发请求或写入任何产品数据。
- 若用户认可原型，再另行进入产品实现 spec；届时需要核对当前 `107` 的 `value=1` 默认值是否应按本原型改为空值，并补齐 Portal / server 回归测试。

## 验收

1. 打开时所有选择与数值都为空，用户可自行填写。
2. 用户能一眼辨认出“偏好/规避什么 duty leg 数”的填写顺序。
3. 没有与 Jen 当前要求无关的日期、旧 legs 条件或冗余辅助文字。
4. 原型视觉贴合当前 PBS Portal，而非独立营销页或通用 HTML 表单。

## Multi-Agent Parallelism Assessment

- Recommendation: No。
- Rationale: 原型是单一弹窗的单一路径，拆分不会缩短关键路径。
- Suggested split: 不拆分。
- Write boundaries: 原型 HTML 与本设计文档。
- Conflict risk: Low。
- Execution gate: 用户已确认上述原型布局；产品实现仍需在原型审阅后单独确认。
