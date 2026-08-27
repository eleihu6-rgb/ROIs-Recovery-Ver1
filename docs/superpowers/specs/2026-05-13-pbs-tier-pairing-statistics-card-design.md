# PBS Tier Pairing Statistics 卡片样式调整设计

> 状态：已废弃。经确认，`PAIRING STATISTICS` 与 `BID STATISTICS` 重复且数据来源容易误解，后续以 `2026-05-13-pbs-tier-remove-pairing-statistics-design.md` 为准。

## 背景

当前 `/tier` 页面里的 `PAIRING STATISTICS` 使用表格展示 `Tier / Pairing Numbers / Total Results / Status / Action`。用户希望它改成 AA 截图中的横向统计卡样式：一个区域内横向排列 7 个卡片，每个卡片顶部有颜色条，卡片中间展示两组核心数字。

## 目标

- 将 `PAIRING STATISTICS` 从表格改成横向 7 张统计卡。
- 每张卡对应一个 Tx：`TIER-1` 到 `TIER-7`，保持 PBS 当前 Tier/Tx 术语，不引入 AA 的 `Layer/Lx` 命名。
- 卡片中的数字映射：
  - `TOTAL` = 当前 Tx 规则预览返回的 `total results`
  - `BY TIER` = 当前 Tx 规则预览返回的 `pairing numbers`
- 保留现有自动加载 pairing pool、错误重试、点击查看 Pairing Set preview 的功能。
- 不改接口、不改 mapper、不改算法职责。

## UI 设计

- 外层仍沿用当前白色 panel 和 `PanelStripHeader`。
- 内容区改为 7 列卡片网格，宽度不足时允许横向滚动，避免挤压文字。
- 每张卡：
  - 顶部 24px 左右的彩色条，展示 `TIER-n`。
  - 顶部颜色跟数据状态走：有可预览结果的 Tier 使用彩色条；没有 active pairing rules、还在加载、加载失败或预览结果为空的 Tier 使用灰色条。
  - 中间展示 `TOTAL` 和粗体大数字。
  - 下方分隔线后展示 `BY TIER` 和粗体数字。
  - 卡片高度保持不变，只调整现有高度内的上下留白。
  - 可点击的卡片使用按钮语义，点击打开对应 Tx 的 Pairing Set preview。
  - 没有 active pairing rules 的卡片展示 `0 / 0`，不提供点击。
  - loading 状态使用 skeleton 占位，避免布局跳动。
  - error 状态显示错误文案和 `Retry`。

## 验收标准

- `PAIRING STATISTICS` 看起来接近截图：横向卡片、彩色顶部条、两组数字。
- T1-T7 都始终可见或可横向滚动访问。
- `TOTAL` 与 `BY TIER` 的数据映射正确。
- 原有 `View Pairing Set` 能力仍保留，只是入口变成点击卡片。
- 类型检查、lint、Tier 相关测试和 PBS 总验证通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一个 Tier 右侧面板组件和对应测试，拆分会增加协调成本。
- Suggested split: 不建议拆分。
- Write boundaries: `pbs-portal/src/features/tier/components/` 及相关测试。
- Conflict risk: 低。
- Execution gate: 用户已确认按截图卡片样式修改。
