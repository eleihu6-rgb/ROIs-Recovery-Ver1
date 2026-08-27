# PBS Existing Property 名称显示完整修复设计

## 背景

PBS Portal 的 Days Off 页面中，`EXISTING DAYS OFF PROPERTIES` 表格第二行 property 名称显示为 `Min Consecutive Days Off I...`，完整名称应为 `Min Consecutive Days Off In Window`。同类 existing property 表格也出现在 Pairing、Line 等模块，需要一起核对，避免只修复 Days Off 后其他页面继续截断。

排查结果：

- Days Off、Line 等 Rule Bid 页面使用共享组件 `pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx` 渲染 existing property 行。
- Pairing 页面使用独立组件 `pbs-portal/src/features/pairing/components/pairing-property-table.tsx` 渲染 existing pairing property 行。
- 两处 existing property name 当前都使用 `truncate` class，浏览器会强制单行显示，超出列宽后显示省略号。
- 表格列宽本身已有固定分配；如果直接扩大 `PROPERTY` 列，会压缩 `BID` 列，带来新的显示风险。

## 目标

- Existing property 的名称在当前列宽内完整可读。
- 不通过扩大 `PROPERTY` 列来挤压 `BID`。
- 不影响 `TIERS` 的 T1-T7 一行展示和 `ACTIONS` 图标位置。
- 保持现有业务行为、数据结构、保存逻辑不变。

## 非目标

- 不重做 Days Off 页面整体布局。
- 不调整 existing table 的 grid column 分配。
- 不修改 available property 列表的显示规则。
- 不改变 bid summary 的格式、省略或换行策略。
- 不新增 tooltip / popover 交互作为主要解决方案。

## 方案

采用最小 DOM/CSS 修复：

1. 修改共享 Rule Bid existing property row 中 property name 的 class，覆盖 Days Off、Line 等页面。
2. 修改 Pairing existing property row 中 property name 的 class，覆盖 Pairing 页面。
3. 将两处 `truncate` 改为允许自然换行的样式，例如 `whitespace-normal break-words`。
4. 保留 `title={property.name}`，方便用户悬停查看完整名称，也保留无障碍与浏览器原生提示能力。
5. 保持 existing table 的 `gridTemplateColumns` 不变，避免 property / bid / tiers / count / actions 列之间重新抢空间。

预期显示效果：

- `Min Consecutive Days Off In Window` 在当前 property 列中换成两行显示。
- Pairing / Line 中同类长 existing property name 也在当前 property 列中换行显示。
- row 高度随内容自然增加一点。
- `BID` 列宽不变，仍显示完整 bid summary。
- `TIERS`、`COUNT` 和 `ACTIONS` 保持当前位置。

## 影响范围

- 直接影响共享的 Rule Bid existing property row：Days Off、Line 以及其他复用该 shared row 的 Rule Bid 页面。
- 直接影响 Pairing existing property row：Pairing 页面 existing table。
- 不影响 favorite / available property rows。
- 不改变 Pairing rule expression view、pool count 计算、preview / edit / delete 行为。

## 测试计划

- 更新或新增 `pbs-portal` 相关单元测试，覆盖长 existing property name 不再使用强制单行省略。
- 测试至少覆盖共享 Rule Bid existing row 和 Pairing existing row 两条路径。
- 保留或更新现有 grid layout 断言，确认本次不改变列宽模板。
- 运行最小相关测试：
  - `pnpm test -- <相关 rule-bids / days-off / line / pairing 测试>`
- 运行模块验收命令：
  - `pnpm run lint`
  - `pnpm run build`
- 如果实现后涉及真实 UI 验证，使用 Playwright 打开 Days Off 页面确认截图位置名称完整显示。

## 验收标准

- 截图中的 `Min Consecutive Days Off In Window` 不再显示为 `Min Consecutive Days Off I...`。
- Pairing、Line existing property 表格中的长 property name 同样不再强制单行省略。
- `BID` 列没有因为本次修复变窄。
- T1-T7 tier toggle 仍保持一行展示；Pairing 的 count 列仍保持原有位置。
- Edit / Delete action 图标仍右对齐且可点击。
- 相关测试通过，最终汇报包含实际执行命令和 PASS / FAIL 结果。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是两个 existing row 文本节点的样式修复和小范围测试更新，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx`、`pbs-portal/src/features/pairing/components/pairing-property-table.tsx`、相关测试文件、必要的 PBS QA 测试说明。
- Conflict risk: 低；主要风险是 shared row 和 Pairing 独立 row 的行为需要保持一致。
- Execution gate: 用户确认本 spec 后再进入实现。
