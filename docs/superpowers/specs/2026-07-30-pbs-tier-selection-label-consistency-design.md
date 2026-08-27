# PBS Bid Tier 选择标题统一设计

## 状态

- 日期：2026-07-30
- 状态：已确认并实施
- 范围：PBS Portal

## 背景

PBS Portal 的 Pairing、Days Off、Line、Standing Bid 等入口都会选择 Bid 适用的 Tier，但当前标题存在 `Apply to Tiers`、`TIERS · REQUIRED` 等不同表达。Tier 按钮已经部分复用 `TierToggleGroup`，弹窗也使用统一壳层，但标题仍由各业务组件分别渲染，因此容易出现体验不一致。

## 目标

- 所有需要选择 Tier 的 Bid 界面使用统一标题。
- 明确区分“提交 Bid 必须选择 Tier”和“保存 Favorite 可暂不选择 Tier”。
- 不改变现有 Tier 选择、校验、保存和后端数据结构。

## 统一规则

| 场景 | 标题 |
|---|---|
| 当前界面的主 Bid 操作要求至少选择一个 Tier | `APPLY TO TIERS · REQUIRED` |
| 当前界面允许零 Tier，或是显示 Tier 区域的 Favorite-only 模式 | `APPLY TO TIERS` |

`REQUIRED` 由当前界面的实际提交守卫决定，不能只根据新增、修改、弹窗名称或当前是否已经选中 Tier 判断。选择 Tier 前后，标题必须保持不变。

### 入口语义矩阵

| 入口/模式 | 当前行为 | 预期标题 |
|---|---|---|
| Pairing / Days Off / Line 新增配置弹窗 | `ADD BID` 要求 Tier；同窗 `SAVE FAVORITE` 可不选 Tier | `APPLY TO TIERS · REQUIRED`；Favorite 例外不改变主 Bid 操作的必选提示 |
| Standing Bid 新增或配置 | 提交要求 Tier | `APPLY TO TIERS · REQUIRED` |
| Reserve Preference 新增或配置 | 提交要求 Tier | `APPLY TO TIERS · REQUIRED` |
| Reserve Coverage Calendar 新增快捷入口 | 提交要求 Tier | `APPLY TO TIERS · REQUIRED` |
| Dashboard Pairing 新增快捷入口 | 提交要求 Tier | `APPLY TO TIERS · REQUIRED` |
| Dashboard Pairing 详情编辑 | 允许清空全部 Tier | `APPLY TO TIERS` |
| Dashboard Days Off 日历编辑 | 清空 Tier 表示从所有 Tier 移除日期，是有效操作 | `APPLY TO TIERS` |
| Favorite-only 编辑 | 现有实现隐藏 Tier 区域 | 继续隐藏，不新增标题或 Tier 选择区 |
| 显示 Tier 区域的 Favorite-only 模式 | Tier 可选 | `APPLY TO TIERS` |
| Search Pairings 中不要求 Tier 的 Favorite 条件编辑 | Tier 非必选或区域隐藏 | 显示区域时使用 `APPLY TO TIERS`；隐藏时保持隐藏 |

## 实现方案

新增一个 PBS Portal 内部共享的 Tier 区域标题组件，只负责：

- 渲染 `APPLY TO TIERS`；
- 根据 `required` 参数追加 `· REQUIRED`；
- 统一大小写、字号、字重、字距和语义颜色；
- 通过 `as="legend" | "p"` 保持现有结构的正确标题语义；
- `fieldset` 场景必须渲染真实 `legend`；
- `required` 是稳定的业务契约，不随当前选中数量变化。

该组件只统一 Tier 区域标题，不替代面向其他偏好字段的 `PreferenceSectionTitle`，也不接管 Tier 选择控件。

现有业务组件继续负责：

- Tier 数据和选中状态；
- 单选或多选交互；
- 必选校验；
- Favorite 与 Bid 的保存行为；
- 禁用、加载和错误状态。

本次不统一重构完整 Tier 选择控件，因为 Dashboard 日历使用 checkbox，配置弹窗使用 `TierToggleGroup`，交互结构不同；只共享语义和视觉完全相同的标题层，避免扩大回归范围。

## 影响范围

- Pairing Bid 与 Pairing Preference 配置弹窗；
- Dashboard Pairing Bid 快捷入口；
- Days Off 快捷入口与配置弹窗；
- Line Bid；
- Standing Bid；
- Reserve Preference 与 Reserve Coverage Calendar；
- 其他已经使用 Tier 选择标题的 PBS Portal Bid 入口。

Favorite-only 编辑当前隐藏 Tier 区域的行为保持不变。显示 Tier 区域且允许零 Tier 的 Favorite 场景必须隐藏 `REQUIRED`。

## 不在范围内

- 不修改后端 API、数据库或 Bid payload；
- 不修改 Tier 选择规则；
- 不统一重构 checkbox 与 `TierToggleGroup`；
- 不修改 Award、Tier 页面或纯展示型 Tier 信息；
- 不改变 Favorite 和 Bid 的业务校验。

## 验收标准

1. 所有当前主操作要求 Tier 的 Bid 提交入口显示 `APPLY TO TIERS · REQUIRED`。
2. 所有显示 Tier 区域且允许零 Tier 的入口显示 `APPLY TO TIERS`，不显示 `REQUIRED`。
3. T1–T7 的选中、取消、禁用和保存行为与修改前一致。
4. 未选择 Tier 时，原有提交按钮禁用或校验逻辑保持不变。
5. 必选标题在选择或取消 Tier 后保持不变。
6. 混合弹窗无 Tier 时仍可保存 Favorite，但不可添加 Bid。
7. Favorite-only 模式原本隐藏 Tier 区域时继续隐藏。
8. Dashboard Pairing 新增、Dashboard Pairing 清空编辑、Dashboard Days Off 清空移除分别显示符合其实际语义的标题。
9. `fieldset` 中标题使用真实 `legend`，保持可访问名称。
10. 不产生新的 UI Standard Gate 硬违规。

## 测试

- 新增共享 Tier 标题组件的单元测试，覆盖 `required=true/false` 和 `as="legend" | "p"`。
- 更新 Pairing、Days Off、Line、Standing Bid、Reserve 的相关组件测试，确认标题与业务上下文一致。
- 覆盖必选标题在选中/取消 Tier 后保持不变，以及混合弹窗 Favorite 可保存、Bid 不可提交。
- 覆盖 Dashboard Pairing 新增、Pairing 清空编辑、Days Off 清空移除三种语义。
- 增加或更新 Playwright：真实打开 Bid、Favorite 和 Reserve 界面，分别验证必选和可选标题。
- 更新 `docs/test-cases/pbs/...` 对应 QA 人工测试案例。
- 更新受影响的 Help 文案与既有测试断言，清理面向 Tier 选择区域的旧 `TIERS`、`TIERS · REQUIRED`、`Apply to Tx` 文案。
- 运行 PBS Portal 相关 Vitest、Playwright、lint、build 和根目录 `npm run check:ui`。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在共享 Tier 标题及其消费者，文件之间契约紧密，并行编辑容易产生重复修改。
- Suggested split: 不拆分。
- Write boundaries: 单一实现者负责共享组件、消费者和测试。
- Conflict risk: 低。
- Execution gate: spec 审查通过且用户确认后实施。
