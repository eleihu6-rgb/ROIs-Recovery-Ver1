# PBS Pairing Number Entire Month 多选模式设计

## 背景

Pairing Number 配置弹窗中，BID 输入框支持一次选择多个 pairing。当前 Entire Month 模式下，下方 pairing 按钮仍表现为单选高亮，容易让用户误解为最终只会保存当前高亮的一个 pairing。

用户希望 Entire Month 与 Specific Date 的交互更相似：下方 pairing 按钮在 Entire Month 下改为多选，用户选择哪些 pairing，就保存哪些 pairing。

## 目标

- Entire Month 模式下，下方 pairing 按钮从单选改为多选。
- 默认选中 BID 输入框中的全部 pairing。
- 用户可以取消某些 pairing，本次保存时只保存仍被选中的 pairing。
- Specific Date 模式保持单选切换，用于选择当前正在配置 run date 的 pairing。
- 不影响 Pairing Number 的稳定 ID 保存语义：保存仍使用 `pairing-id-list.pairingIds`。

## 交互设计

### BID 输入框

- 仍然负责搜索和添加 Pairing Number。
- 添加新的 Pairing Number 后，Entire Month 模式下该 pairing 默认加入已选保存集合。
- 删除 BID chip 后，该 pairing 同时从 Entire Month 已选保存集合和 Specific Date 已确认 run 中移除。

### Entire Month

- 下方 pairing 按钮变成多选按钮。
- 已选按钮高亮，未选按钮普通样式。
- 点击按钮切换选中 / 未选中。
- `ADD BID` / `SAVE FAVORITE` 只保存已选按钮对应的 pairing IDs。
- 如果没有任何 pairing 被选中，按钮禁用。

### Specific Date

- 下方 pairing 按钮继续是单选。
- 当前高亮 pairing 用于加载该 pairing 的 run dates。
- 用户可以切换 pairing 后继续添加具体 run date。
- 保存仍使用 `pairing-occurrence-list`。

## 数据流

- 新增前端状态：Entire Month selected pairing IDs。
- 状态来源：
  - 初始化：如果 bid 是 `pairing-id-list`，默认选中其中全部 `pairingIds`。
  - BID 变化：保留仍存在的已选 ID，新加入的 ID 默认选中。
  - BID 删除：同步删除对应 ID。
- 保存：
  - Entire Month：用 selected pairing IDs 构造 `pairing-id-list`，并按 ID 对齐 `pairingLabels`。
  - Specific Date：继续用 confirmed occurrences 构造 `pairing-occurrence-list`。

## 验收标准

- 选择两个 Pairing Number 后，Entire Month 下两个按钮默认都高亮。
- 取消其中一个后，点击 `ADD BID` 只保存仍高亮的那个 pairing ID。
- 再次点击未选按钮后，它重新加入保存集合。
- Specific Date 下仍只能高亮一个当前 pairing，用于加载 run dates。
- Pairing Number 保存 payload 不出现 `tag-list` / `tag-list-date`。
- Pairing 页面添加、编辑、收藏相关测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 Pairing Number 配置弹窗状态和测试，拆分会增加状态语义同步成本。
- Suggested split: 不拆。
- Write boundaries: 单人修改 `pairing-property-config-dialog.tsx` 和 Pairing 页面相关测试。
- Conflict risk: 中等，当前 Pairing Number 相关文件已有未提交改动，需要在同一上下文里继续。
- Execution gate: 用户确认该 spec 后开始实现。
