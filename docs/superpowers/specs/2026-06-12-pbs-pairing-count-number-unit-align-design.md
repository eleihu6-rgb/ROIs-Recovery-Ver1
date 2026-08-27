# PBS Pairing Count 数字与单位对齐设计

## 背景

`/fpqe/pbs/pairing` 页面 Existing Pairing Properties 表格的 `COUNT` 列展示 `2 pairings`、`1 pairings`、`12159 pairings`。当整串文本左对齐时，不同位数数字会让 `pairings` 单位的位置漂移；当整串居中时，数字位置也不稳定，整体看起来杂乱。

## 目标

- 数字固定放在 count pill 左侧，保持左边界稳定。
- `pairings` 单位固定放在 count pill 右侧，单位位置稳定。
- 保留 count pill 当前高度、边框、背景色和整体宽度。
- 不改变 count 数据来源、计算逻辑或刷新逻辑。

## 方案

- 将 count pill 内部展示从单个字符串改为两段：
  - 数字 span：固定宽度、`tabular-nums`、左对齐。
  - 单位 span：固定宽度、右对齐。
- 使用 flex `justify-between` 让数字贴左、单位贴右，中间由可用空间自动撑开。
- 保留一个视觉隐藏空格，让测试和辅助技术仍能读到 `12 pairings`。

## 验收标准

- `2 pairings`、`1 pairings`、`12159 pairings` 的数字左边界纵向对齐。
- `pairings` 单位右边界纵向对齐。
- Count pill 外观和业务逻辑不变。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单组件展示微调，拆分会增加协调成本。
- Suggested split: 无
- Write boundaries: `pbs-portal/src/features/pairing/components/pairing-property-table.tsx`
- Conflict risk: 低
- Execution gate: 用户已确认实施。
