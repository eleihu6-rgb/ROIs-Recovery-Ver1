# Pairing Check-In / Check-Out Time 精简界面实施计划

关联设计：`docs/superpowers/specs/2026-07-12-pbs-pairing-check-time-compact-ui-design.md`

## 1. 收紧 editor 结构

文件：`pbs-portal/src/features/pairing/components/pairing-check-time-editor.tsx`

- 将 Time Type 与 Date 的 section 文案改为紧凑标题，减少区块垂直留白。
- 保留时间 operator 与输入；删除 `Quick range` 文字，保留 AM / PM / Custom 按钮。
- 删除日期开关、`LIMIT TO PAIRING DATE` 和 Optional 文案。
- 使用 `Any date | Specific date | Date range` 三选一；以 `dateScope` 推导当前选择。

## 2. 保持 payload 与校验不变

- `Any date` 写入 `dateScope: null`。
- Specific / Range 分别创建空的既有 scope 结构；切换模式不保留隐藏日期。
- 不更改 Tier、Award、Check-In、Between、AM/PM 或 footer 的现有默认/禁用规则。

## 3. 回归测试

- 更新 Portal Playwright `PBS-3514`：检查初始 Any date、三种日期模式的展开/清除行为，以及既有 PM / Tier / submit 状态。
- 运行针对性 Portal Vitest、Playwright、Portal build 和根目录 `check:ui`。

## 4. 交付边界

- 不修改后端、contract、migration 或通用 dialog。
- Git 提交仅在用户明确授权后执行。
