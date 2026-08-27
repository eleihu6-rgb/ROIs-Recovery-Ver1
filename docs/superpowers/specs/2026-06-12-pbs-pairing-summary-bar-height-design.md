# PBS Pairing 汇总条高度对齐设计

## 背景

`/fpqe/pbs/pairing` 页面中，Existing Pairing Properties 顶部左侧汇总条展示当前 Tx、规则数量与筛选出的 pairing 数量。当前汇总条高度明显高于右侧 `REFRESH`、`VIEW RULES`、`SEARCH PAIRINGS` 按钮，导致同一操作行视觉不齐。

## 目标

- 左侧汇总条整体高度与右侧按钮视觉等高。
- 保留当前 Tx、规则数量、pairing 数量的展示内容。
- 不改变筛选计数逻辑、刷新逻辑、搜索逻辑或表格行计数逻辑。

## 方案

- 将左侧汇总条外层改为固定 `30px` 高，与右侧按钮当前高度一致。
- 收紧汇总条内部 pill：
  - Tx pill 高度从 `32px` 调整为 `24px`。
  - rules pill 高度从 `32px` 调整为 `24px`。
  - 字号略收紧，保持垂直居中与可读性。
- 保持边框、背景色和不同状态色不变，避免影响用户对 stale/loading/error 状态的识别。

## 验收标准

- 顶部左侧汇总条和右侧按钮在同一行内视觉等高。
- `T1 / 3 rules / 3 pairings` 等文本仍然清晰可见。
- 页面功能行为不变。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单组件样式微调，拆分会增加协作成本。
- Suggested split: 无
- Write boundaries: `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`
- Conflict risk: 低
- Execution gate: 用户已确认按方案 A 调整。
