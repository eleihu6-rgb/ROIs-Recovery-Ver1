# PBS Work Day Preference 实施计划

日期：2026-07-13
状态：实施完成，待用户审阅差异

1. 前端：新增 `WorkDayPreferenceEditor`，由 `PairingPropertyConfigDialog` 仅为 property `110` 分支使用；复用已验收 Pairing 条件的 UI 基线，并完成 Portal 单元测试。
2. 数据与后端：统一 property `110` 的显示名称，新增幂等 migration，保持 payload / SQL 不变，更新 validation 与 focused tests；不执行远端 migration。
3. 集成：增加真实 Pairing UI E2E，覆盖 Any / Every、日期与星期 OR、范围、Save Favorite 和编辑回填；更新手工 QA。
4. 验证：运行 focused tests、build、UI 标准、E2E、diff check；仅在用户后续明确要求时提交 Git。
