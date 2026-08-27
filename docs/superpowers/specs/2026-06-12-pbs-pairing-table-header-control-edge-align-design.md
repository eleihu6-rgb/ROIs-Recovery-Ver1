# PBS Pairing 表头与控件左边界对齐设计

## 背景

`/fpqe/pbs/pairing` 页面 Existing Pairing Properties 表格中，`PROPERTY`、`BID`、`TIERS`、`COUNT` 表头与下方控件仍有轻微横向偏移。原因是表头行自身带有横向 padding，而数据行 grid 没有同样的 padding，导致表头 label 和下方控件左边界使用了不同的对齐基准。

## 目标

- 表头 label 与下方对应控件左边界统一左对齐：
  - `PROPERTY` 对齐 property 输入框左边界。
  - `BID` 对齐 bid 控件左边界。
  - `TIERS` 对齐 T1 按钮左边界。
  - `COUNT` 对齐 count pill 左边界。
- 不改变列宽、count 数据、刷新逻辑或表格内容。

## 方案

- 仅调整 `PairingPropertyTableHeader` 的外层样式。
- 移除表头行的水平 padding，让表头 grid 的列起点与数据行 grid 的列起点一致。
- 保留表头高度、背景色、圆角、字号和垂直 padding，避免影响整体视觉层级。

## 验收标准

- Existing Pairing Properties 表头与首行控件左边界肉眼对齐。
- 各列宽度和内容布局不发生业务性变化。
- 页面现有测试保持通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单组件样式微调，拆分会增加协调成本。
- Suggested split: 无
- Write boundaries: `pbs-portal/src/features/pairing/components/pairing-property-table.tsx`
- Conflict risk: 低
- Execution gate: 用户已确认按控件左边界对齐。
