# PBS Portal 隐藏 AON 摘要标签设计

## 目标

PBS Portal 的收藏卡片和只读摘要不再显示 `AON`（All or Nothing）标签，避免卡片信息过于突兀；可配置该行为的编辑开关保持不变。

## 范围

- 隐藏收藏卡片中的 `AON` 标签。
- 保留 `Min` 等其他现有可见条件。
- 覆盖 Bid 工作区内所有复用相同组件的 Days Off、Pairing、Roster 收藏展示。
- 核查 Existing Bid、Available Property、Add/Edit Workspace、Standing Bid 等复用摘要状态，确保不再将 AON 作为只读标签展示。

## 不变项

- 不修改 `allOrNothing` API 字段、数据库字段及持久化数据。
- 不改变 Prefer Off 自动使用 All or Nothing 的既有业务规则。
- 不删除、不隐藏通用条件编辑区域中现有的 AON checkbox，也不修改其 accessible name 和交互。
- 不修改 Standing Bid、算法导出或服务端校验逻辑。
- 不执行数据库 migration。

## 实现方案

在共享的 Rule Bid 条件展示组件中，仅从只读 modifier labels 中移除 `AON` 输出；收藏卡片的 modifier 仍可显示 `Min`。通用编辑区的 AON checkbox、内部类型和数据流全部保持不变。

不采用以下方案：

- 只对 Prefer Off 隐藏：其他收藏摘要仍会出现相同的突兀缩写。
- 删除 `allOrNothing` 字段：会扩大为后端、数据库和算法契约变更，且改变业务逻辑。
- 删除或隐藏编辑开关：超出本次“只隐藏标签”的范围，并会改变现有配置能力。

## 验收标准

- 收藏卡片和只读摘要中不再出现 `AON` 标签。
- 通用条件编辑区域原有的 AON checkbox 仍然可见、可操作并保留 accessible name。
- Prefer Off 收藏卡片仍正确显示条件摘要和 Tier。
- 其他收藏卡片仍正确显示名称、摘要、Tier、编辑、删除和添加图标。
- `Min N` 在适用条件中仍可正常显示和编辑。
- 原有 `allOrNothing` 数据能够继续读取和提交，不因前端隐藏而被意外改写。
- 加载 `allOrNothing=true` 的非 Prefer Off 条件后，修改 `Min`、Tier 或其他条件并保存，提交值仍为 `true`；原值为 `false` 时也不得被改成 `true`。
- Prefer Off 新建、编辑、从收藏添加及重新提交后，仍发送或由服务端归一化为 `allOrNothing=true`，并保持当前 `minimumN` / `maximumN` 规则。
- 更新与新行为冲突的旧 QA 用例 `docs/test-cases/pbs/condition-properties/2026-07-04-template-recommendation-favorite-redesign.md`，明确摘要标签不显示 AON、编辑开关仍可用、Min 仍可见且可编辑、内部数据保持不变。
- 相关组件测试、数据保留回归、PBS Portal UI 检查、构建和真实 Playwright 回归通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一个共享前端组件及其测试，拆分会增加同文件冲突。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal` 相关组件、测试和必要的 PBS Portal E2E。
- Conflict risk: 当前工作树已有收藏日期规则改动；实现时只修改 AON 展示相关代码，不覆盖现有未提交内容。
- Execution gate: 用户确认本 spec 后实施。
