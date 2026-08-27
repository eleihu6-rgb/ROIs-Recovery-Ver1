# Flight Legs per Duty：Jen 对齐实施计划

关联 spec：`docs/superpowers/specs/2026-07-13-pbs-flight-legs-per-duty-jen-aligned-editor-design.md`

状态：已实施、验证通过，待用户验收

## 1. 专用 Portal editor

- 新增 feature-local `FlightLegsPerDutyEditor`，复用现有 `TierToggleGroup`、`AwardAvoidSegmentedControl`、dialog footer 与 catalog options。
- 新增时显示 `Award` 与 `Any duty`；Tier、operator、legs 输入保持空白。
- 数字输入以 local raw string 保存空白态；在 catalog `min/max` 内成为有效整数后才写入已有 stepper bid。
- 视觉补充：数值输入聚焦时提升其层级，避免焦点边框被比较符控件遮挡；不显示实时英文结果句。

## 2. Dialog 接入与完成度

- 在 `PairingPropertyConfigDialog` 中将 `propertyCode=107` 接入专用 title/editor。
- 新增时仅对 107 设 `Award` 与 `Any` 默认；编辑路径不重置已保存值。
- footer 完成度增加专用有效 legs 值条件，沿用已有 add/update/favorite service 链路。

## 3. 回归覆盖

- 更新 Portal Vitest：默认、完整填写、不渲染结果句与已保存值回显。
- 更新 / 新增 PBS Portal Playwright：真实 UI 中新增 107、验证聚焦输入的层级、填写 `Avoid + Any + > 3`、提交并检查 current bid。
- 新增 Flight Legs per Duty QA 手工用例。

## 4. 验证

- 针对性 Vitest、Playwright、Portal build、`npm run check:ui`、`git diff --check`。
- 不修改 `pbs-server`、contract、SQL 或 migration；不创建 Git 提交或推送，除非用户后续明确要求。
