# PBS Portal 新增 Bid 不默认选择 T1 设计说明

## 背景

当前 PBS Portal 在新增部分 bid 条件时，会默认把 `T1` 选中。用户如果实际要提交的不是 `T1`，需要先取消或切换，容易误提交。

已确认存在默认 `T1` 的入口：

- Days Off：新增属性弹窗内部在没有 active tier 时会补 `T1`。
- Line：新增属性弹窗内部在没有 active tier 时会补 `T1`。
- Pairing：新增 catalog property 时，前端 mapper 默认生成 active `T1`，配置弹窗继承该状态。
- Reserve：Calendar 点击弹出的 Reserve Day On / Prefer Off 操作默认 `T1`；Add Short Call Type 弹窗默认 `T1`。

## 目标

新增 bid 条件时，不再自动选择 `T1`。用户必须自己明确选择一个或多个 `Tx`，才能提交新增 bid。

## 范围

包含：

- Days Off 新增属性配置弹窗。
- Line 新增属性配置弹窗。
- Pairing 新增属性配置弹窗。
- Reserve calendar 点击后弹出的 `Apply to Tx` 选择。
- Reserve `ADD SHORT CALL TYPE` 弹窗的 `Apply to Tx` 选择。

不包含：

- 已存在 bid 的编辑弹窗。编辑时应继续保留该 bid 已保存的 tiers。
- Tier 页面默认选中的 review tab。
- Pairing Pool Counts / 当前规则统计默认查看哪个 tier。
- 已保存 Favorite 的 saved tier 含义。推荐保持 Favorite 按它保存的 tiers 直接添加，因为 Favorite 本身就是用户保存过的配置。

## 期望行为

- 新增普通 property 打开弹窗时，`T1` 到 `T7` 全部未选中。
- 新增 Reserve calendar bid 时，popover 里的 `Apply to Tx` 全部未选中。
- 新增 Short Call Type 时，`Apply to Tx` 全部未选中。
- `ADD BID` 在没有任何 tier 时保持 disabled，避免提交空 tiers。
- 用户选择至少一个 tier 后，才允许提交。
- 编辑已有 bid 时，仍显示已有 active tiers，不被清空。
- Favorite 保持保存时的 tiers；如果需要 Favorite 每次也重新选 tier，需要单独改交互，因为现在 Favorite add 会跳过配置弹窗直接加入。

## 实现思路

- 增加或复用一个小的 tier 工具函数，用于生成“全部 inactive”的 `T1` 到 `T7` tier options，避免每个页面散落手写清空逻辑。
- Days Off / Line 弹窗区分新增与编辑：
  - 新增时允许初始 tiers 全 inactive。
  - 编辑时继续保留传入 property 的 active tiers。
- Pairing 新增 catalog property 打开配置弹窗前清空 active tiers，或在 mapper 里不再给 catalog property 默认 `T1`；需要避免影响 Favorite 与已有 bid。
- Reserve calendar 初始 `selectedTiers` 从 `["T1"]` 改为 `[]`。
- Reserve Short Call Type 初始 `selectedTiers` 从 `["T1"]` 改为 `[]`。

## 验收标准

- Days Off 新增弹窗打开后没有任何 tier 被选中，`ADD BID` disabled；选择 tier 后可提交。
- Line 新增弹窗打开后没有任何 tier 被选中，`ADD BID` disabled；选择 tier 后可提交。
- Pairing 新增 catalog property 弹窗打开后没有任何 tier 被选中，`ADD BID` disabled；选择 tier 后可提交。
- Reserve calendar popover 打开后没有任何 tier 被选中，`ADD BID` disabled；选择 tier 后可提交。
- Reserve Short Call Type 弹窗打开后没有任何 tier 被选中，`ADD BID` disabled；选择 tier 后可提交。
- 编辑已有 bid 时，原本保存的 tiers 仍然显示为选中。
- 不引入 mock 数据，不改变服务端数据结构。

## 测试计划

- 更新 Days Off 页面测试，覆盖新增弹窗不默认 `T1`。
- 更新 Line 页面测试，覆盖新增弹窗不默认 `T1`。
- 更新 Pairing 页面测试，覆盖新增 catalog property 弹窗不默认 `T1`。
- 更新 Reserve 页面/组件测试，覆盖 calendar popover 与 Short Call Type 不默认 `T1`。
- 运行 pbs-portal 相关 Vitest。
- 如改动触达真实页面交互，补一个 Playwright 回归用例或运行现有 PBS Portal E2E 覆盖实际打开弹窗行为。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一个前端交互链路和共享 tier 数据结构，拆分会增加集成成本。
- Suggested split: 不建议拆分。
- Write boundaries: 单 agent 修改 `pbs-portal` 前端组件、mapper 和测试即可。
- Conflict risk: 多 agent 容易同时改同一批页面测试和共享工具。
- Execution gate: 等用户确认本 spec 后再实现。

## 待确认

- 默认推荐：普通新增和 Reserve 新增不默认 `T1`；已保存 Favorite 继续按保存的 tiers 直接添加。
- 如果希望 Favorite 也不直接带 saved tiers，而是每次都让用户重新选择 tier，需要把 Favorite add 从“直接添加”改成“打开配置弹窗”，这会是额外交互变更。
