# PBS Rule Bid 收藏文案 i18n 补救设计

## 背景

最近在 `FAVORITED PROPERTIES` 删除确认、收藏删除状态、收藏提示信息中新增了多处英文硬编码文案。项目已有 `shared/i18n` 基础，继续把用户可见文案散落在组件中，不利于后续语言切换，也不符合当前开发规范。

## 目标

- 将本轮新增的收藏删除确认文案、收藏成功/失败消息、动态 aria-label 迁入 `shared/i18n/locales/en.ts`。
- 组件通过 `useI18n().t(...)` 获取文案。
- 支持最小必要的动态变量插值，用于 `{{propertyName}}` 这类 aria-label。
- 保持当前英文 UI 展示不变，不扩大到全站文案重构。

## 范围

- 更新 `shared/i18n` 的 `t` 方法，使其支持可选变量参数。
- 新增 Rule Bid favorite 相关 translation keys。
- 更新 `rule-bid-property-table.tsx` 与 `rule-bid-right-panel.tsx` 中由本轮引入/触及的 favorite 文案。
- 更新现有 Days Off 测试，继续验证删除确认、取消确认、确认删除、禁用 tier 选中态。

## 不做

- 不重构全站已有硬编码文案。
- 不改变收藏、删除、添加、禁用 tier 的业务行为。
- 不改变当前英文文案内容。
- 不新增其他语言包。

## 验收标准

- 新增/触及的 favorite 文案不再在业务组件里硬编码。
- 动态 aria-label 通过 i18n key + 参数生成。
- 当前默认英文界面和测试期望保持一致。
- `pbs-portal` 相关单元测试、lint、build 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 范围很小，主要是 i18n helper、两个组件和测试的串联修改，多 agent 协调成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: `shared/i18n/*`、`rule-bids` 组件、Days Off 测试。
- Conflict risk: 低，单人顺序修改更稳。
- Execution gate: 用户已要求“补救”，按本设计执行并验证。
