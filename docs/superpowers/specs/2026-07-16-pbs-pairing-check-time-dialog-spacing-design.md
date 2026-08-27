# PBS Pairing Check-In / Check-Out Time 弹窗疏开设计

## 背景

`Configure Check-In / Check-Out Time` 弹窗在 `TIME` 区域偏挤：operator/时间输入与 AM/PM/Custom 快捷按钮几乎贴在一起，视觉上像两行表单而非「主输入 + 快捷辅助」。

## 方案（已确认）

**局部疏开 + 快捷条弱化**（方案 1）：

- 不改业务逻辑、operator 选项、payload、日期限制语义。
- 仅调整 `PairingCheckTimeEditor` 内间距与快捷条视觉。

## 改动

1. Editor 根 section：`space-y-3.5` → `space-y-4`。
2. `TIME` section：使用 `contentClassName="space-y-3"`，主输入行与快捷条之间留出垂直空隙。
3. 快捷条：包在浅灰托盘（`bg-[#f8f9fb]` + 轻边框）内；按钮字重降为 `font-medium`，默认更浅；选中仍用紫边 + 白底。
4. 快捷条加 `role="group"` + `aria-label` 便于测试与无障碍。

## 非目标

- 不改弹窗 shell、TIERS、PREFERENCE 布局。
- 不把快捷条移到输入上方。
- 不改 `OptionalEventDateScopeEditor`。

## 验收

- Vitest：`pairing-check-time-editor.test.tsx` 通过。
- `npm run check:ui` 无新增硬违规。
- 现有 Playwright `condition-default-favorites` Check-In/Out 路径仍通过。
