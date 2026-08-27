# PBS Pairing 条件弹窗默认 Tier 单选修正设计

## 背景

当前在 `Average Daily Block Time` 等新增条件的配置弹窗里，打开后会默认同时选中多个 tier（例如 `T1`、`T2`）。

这不是业务规则本身要求，而是前端页面在构造可配置条件时，错误继承了本地 fallback/mock 模板里的 tier 激活状态，导致真实用户界面也被带入了多选默认值。

## 目标

- 新增/打开 Pairing 条件配置弹窗时，默认只选中一个 tier。
- 默认 tier 采用单选语义，不再默认同时激活多个 tier。
- 保持现有条件内容、mode、bid 控件和后端提交结构不变。

## 范围

### 需要调整

- 前端 Pairing 条件页面的 available property 默认 tier 构造逻辑
- 相关测试数据与回归测试
- 必要时补充 QA 人工测试说明

### 不需要调整

- 后端 property catalog 定义
- 条件 SQL 生成逻辑
- `Average Daily Block Time` 的 bid 语义
- 其他已有条件的业务规则

## 现状与原因

目前页面在把后端返回的 `propertyCatalog` 转换成可配置条件时，会参考本地 fallback/template 数据。

fallback/template 里某些 property 的 `tiers` 被预置成多个 active，例如 `["T1", "T2"]`，于是弹窗打开时会直接显示多个 tier 被选中。

因此问题本质上不是“条件是 mock 的”，而是“前端默认模板把 tier 状态带进了真实配置弹窗”。

## 方案

### 方案 A：统一改为单个默认 tier

- 在前端构造可配置 property 时，默认只激活一个 tier
- 若没有更明确上下文，默认使用 `T1`
- 保留现有页面/后端数据流不变

优点：
- 改动最小
- 不影响现有提交结构
- 符合“新增一个条件默认只占一个 tier”的用户预期

缺点：
- 依赖当前默认 tier 选择策略，后续若要按页面上下文自动带入选中 tier，还需再扩展

### 方案 B：按当前工作台激活 tier 作为默认值

- 新增条件时默认继承当前工作台选中的 tier
- 不再使用 mock/template 中的多 tier 默认值

优点：
- 更贴近当前操作上下文

缺点：
- 需要从共享状态读取当前 tier，涉及更多联动
- 这次问题的修复成本高于必要范围

## 推荐方案

采用方案 A。

原因是当前问题的核心是“不要默认多选”，不是“要智能推导更复杂的 tier 归属”。先把默认值收敛为单选，最稳也最符合当前确认范围。

## 验收标准

- 打开 `Average Daily Block Time` 配置弹窗时，只默认选中一个 tier
- 不再出现默认同时选中 `T1`、`T2`
- 其他条件的配置弹窗也保持单一默认 tier 行为
- 保存和回显逻辑不受影响

## 测试计划

- 更新前端单测，覆盖新增/打开条件时只默认一个 tier
- 更新页面回归测试，确认弹窗默认只选一个 tier
- 必要时补 QA 测试说明

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单点前端默认值修正，范围很小，不适合拆分。
- Suggested split: 不拆分。
- Write boundaries: 单 agent 顺序实施。
- Conflict risk: 低。
- Execution gate: 仅在用户确认本 spec 后开始实现。
