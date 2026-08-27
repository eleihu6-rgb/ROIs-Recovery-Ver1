# PBS Pairing Count 列左对齐设计

## 背景

`/fpqe/pbs/pairing` 页面 Existing Pairing Properties 表格中，`COUNT` 列表头是左对齐的，但每行 count pill 内部文字居中显示。不同位数的 count 文本起点不一致，视觉上像没有按同一列对齐。

## 目标

- `COUNT` 列表头与每行 count 文本形成统一的左对齐视觉线。
- 保留现有 count pill 的高度、宽度、边框、背景色和状态表现。
- 不改变 pairing count 的数据来源、计算逻辑或刷新逻辑。

## 方案

- 仅调整 Existing Pairing Properties 行内 count pill 的内容对齐方式。
- 将 count pill 从居中对齐改为左对齐：
  - `justify-center` 改为 `justify-start`
  - 增加 `text-left`
- 保留现有 `px-3`，让 count 文本与表头 `COUNT` 的起点保持一致，同时避免文字贴边。

## 验收标准

- `COUNT` 表头和每行 count 文本左侧视觉起点一致。
- 不同位数的 count 文本不再围绕 pill 中心漂移。
- 其它列布局和业务逻辑不变。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单组件样式微调，拆分会增加协调成本。
- Suggested split: 无
- Write boundaries: `pbs-portal/src/features/pairing/components/pairing-property-table.tsx`
- Conflict risk: 低
- Execution gate: 用户已确认实施。
