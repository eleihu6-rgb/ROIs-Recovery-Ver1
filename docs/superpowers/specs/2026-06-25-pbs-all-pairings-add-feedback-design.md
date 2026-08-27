# PBS All Pairings 添加后留在搜索页反馈设计

## 背景

当前 `ALL PAIRINGS` 入口允许用户在 Search Pairings 页面浏览当前 bid period、当前用户可见的 pairing，并通过结果卡片上的 `ADD PAIRING` 保存为标准 `Pairing Number` bid。

现有行为是保存成功后返回 Pairing 工作台。用户反馈希望保存成功后继续停留在搜索页，并在 `SEARCH CRITERIA` 区域显示本次添加过的 pairing，方便连续挑选多个任务环。

## 目标

- `ALL PAIRINGS` 模式下，添加成功后不跳回上一页。
- 在 `SEARCH CRITERIA` 区域显示本次页面会话中已添加的 pairing。
- 显示内容只作为当前搜索页反馈，不改变真实保存结构。
- 真实保存仍复用现有 `Pairing Number` 标准结构：
  - `propertyCode = 102`
  - `bid.type = "pairing-id-list"`
  - `pairingIds` 保存真实 `pairingId`
  - `pairingLabels` 保存显示用 pairing number

## 范围

本次只改 `ALL PAIRINGS` 搜索模式下的添加后页面反馈。

不改：

- 普通单条件 preview 的 Search Criteria 行为。
- Current Rules preview 行为。
- Pairing Number 后端保存结构。
- Existing Pairing Properties 的展示逻辑。
- Pairing 搜索过滤逻辑。

## 交互设计

进入 `ALL PAIRINGS` 后，`SEARCH CRITERIA` 区域在未添加任何 pairing 时继续显示：

`Showing all pairings available for this bid period.`

当用户从结果卡片点击 `ADD PAIRING`、选择 tier 并保存成功后：

- 仍停留在 Search Pairings 页面。
- `SEARCH CRITERIA` 区域显示本次已添加的 pairing 行。
- 行内容使用现有 criteria row 的视觉结构，语义为：
  - Property：`Pairing Number`
  - Bid：`Award · <tier> · <pairingNumber>`
- 多次添加时按添加顺序追加显示。

该反馈列表仅表示“本页本次操作已保存成功的 pairing”，不是搜索过滤条件。

## 数据流

1. 用户点击结果卡片 `ADD PAIRING`。
2. 用户在 tier dialog 选择 tier 并确认。
3. 页面构造标准 `Pairing Number` criteria item。
4. 调用 `pairingService.addCurrentDraftProperty(criteria, draftMeta)` 保存。
5. 保存成功后：
   - 更新 pairing page query cache，使返回工作台时 Existing Pairing Properties 已有新 bid。
   - 不再调用 `navigate("/pairing")`。
   - 将刚保存的 criteria item 追加到本地 `addedAllPairingCriteriaItems`。
   - 保持当前结果列表、分页、搜索上下文不变。

## 错误处理

- 保存失败时保持当前行为：显示 `pairing.message.addPropertyError`，不追加到反馈列表。
- draft meta 缺失时保持当前行为：显示错误，不追加反馈。
- 保存按钮 pending 时禁用结果卡片 action，避免重复提交。

## 测试

需要补充/调整测试：

- Search Pairings 页面：
  - `ALL PAIRINGS` 添加成功后不返回 `/pairing`。
  - `SEARCH CRITERIA` 区域显示新增 `Pairing Number` 行。
  - 多次添加时保留已添加列表。
  - 保存 payload 仍使用真实 `pairingId` 和 `pairingLabels`。
- Pairing 页面入口测试保持不变：`ALL PAIRINGS` 仍进入 all-pairings preview。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个页面状态和少量展示测试，拆分会增加协调成本。
- Suggested split: 不拆。
- Write boundaries: `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`、`pairing-search-panel` 相关展示、Search Pairings 测试。
- Conflict risk: 低。
- Execution gate: 用户确认本 spec 后开始实现。
