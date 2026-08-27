# Pairing Check-In / Check-Out Time 精简界面设计

日期：2026-07-12
状态：已实施，待用户验收
范围：PBS Portal 的 `Pairing Check-In / Check-Out Time` 配置弹窗视觉层级与日期选择交互

## 目标

将当前弹窗从“说明文字和分区很多”的表单，收敛为用户能快速扫读的配置界面：先选择偏好与时间，再按需选择日期范围。

## 已确认的产品决定

- 日期限制不再使用开关。
- 日期模式改为三选一：`Any date`、`Specific date`、`Date range`。
- 新增默认选中 `Any date`，对应已有 payload 的 `dateScope: null`。
- `Specific date` 和 `Date range` 才显示对应日期输入；切回 `Any date` 立即清除 `dateScope`。
- 继续保留：无默认 Tier、默认 Award、默认 Check-In、默认 Between、空时间。
- 不改变 contract、后端校验、搜索 SQL、保存/收藏或 migration 语义。

## 推荐布局

1. 标题使用 `Configure Check-In / Check-Out Time`。
2. `TIERS`、`PREFERENCE`、`TIME TYPE` 保留为短标签，但取消大间距的字母追踪和冗余留白。
3. 时间区只保留：operator、一个或两个时间输入、`AM 03:00–11:00` / `PM 14:00–22:00` / `Custom` 按钮。
   - 删除 `Quick range` 说明文字。
4. 日期区标签为 `DATE`，使用同一行 segmented control：`Any date | Specific date | Date range`。
   - `Any date` 不显示任何解释文本或日期输入。
   - `Specific date` 显示单日 `PbsDatePicker`。
   - `Date range` 显示范围 `PbsDatePicker`。
5. 删除 `LIMIT TO PAIRING DATE`、开关和 `Optional: restrict…` 辅助文案。
6. 保持既有 footer、禁用规则与键盘/ARIA 标签；未选 Tier 或时间不完整时仍不可提交。

## 交互与数据映射

| 可见模式 | `dateScope` |
| --- | --- |
| Any date | `null` |
| Specific date | `{ mode: "specific_date", date }` |
| Date range | `{ mode: "date_range", from, to }` |

- Date mode 之间切换时，新的模式从空日期开始，避免将隐藏日期带入另一模式。
- 编辑已有 bid 时，根据已保存 `dateScope` 回显正确 mode；`null` 回显 `Any date`。
- AM / PM / Custom 与现有时间 payload 行为保持不变。

## 实现边界

- 主修改文件：`pbs-portal/src/features/pairing/components/pairing-check-time-editor.tsx`。
- 在 `PairingPropertyConfigDialog` 中仅为 `propertyCode=103` 使用专用标题 `Configure Check-In / Check-Out Time`；不影响其他 property 的标题。
- 调整该 editor 的 Playwright 覆盖。
- 不修改默认值、通用 dialog 行为、Tier 控件、contract、server 或 SQL migration。

## 验收

1. 弹窗没有 `Quick range`、日期开关或 Optional 辅助文案。
2. 默认显示 `Any date`，不显示日期输入，保存 payload 为 `dateScope: null`。
3. Specific date 与 Date range 仅在被选中时显示对应 picker；切回 Any date 清除日期。
4. Tier、Award、Check-In、Between、AM/PM/Custom、保存禁用状态均不回归。
5. 真实 Playwright 流程覆盖三种日期模式与时间快捷范围；`npm run check:ui` 无 hard violation。

## Multi-Agent Parallelism Assessment

- Recommendation: No。
- Rationale: 单一 editor 的布局与交互调整，拆分会增加协调成本。
- Write boundaries: 一个 Portal editor 与其测试。
- Conflict risk: Low。
