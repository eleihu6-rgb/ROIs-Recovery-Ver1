# PBS Work Day Preference UI 一致性修复计划

日期：2026-07-13
状态：已实施并完成验证，待用户审阅

1. 将 `WorkDayPreferenceEditor` 的具体日期与范围路径替换为共享 `PbsDatePicker`，保留既有 payload 与模式草稿。验证：编辑器单测。
2. 将 `WORK-DAY MATCH` 改为与 Award/Avoid 相同的 segmented 选中态，确保视觉、`aria-pressed` 和 `quantifier` 同步。验证：单测与 Pairing/Search 回归。
3. 通过真实 Pairing 页面验证日期多选、范围、Any/Every、favorite 与编辑回显；运行 lint、build、UI gate、diff check。

不执行远端 migration，不自行提交或推送 Git。
