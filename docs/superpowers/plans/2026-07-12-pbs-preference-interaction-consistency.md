# PBS Preference 交互一致性实施计划

**Spec：** `docs/superpowers/specs/2026-07-12-pbs-preference-interaction-consistency-design.md`
**目标：** 将 Prefer Off、Long Stretch、Commuter Pattern、Pairing Preference 的共享交互原语与状态规则收口；不改变后端 payload 或算法语义。
**限制：** 不执行 Git 提交；保留工作树中与本任务无关的用户改动。

## 实施顺序

- [ ] 1. 为共享日期 picker 添加 / 调整组件测试：覆盖 range 的起点、终点、自动排序、第二次选择关闭与覆盖式弹层行为。
- [ ] 2. 将 picker 迁入 `src/shared/components`，移除 `reservePopoverSpace` 这种会改变布局流的接口；保留兼容 re-export，避免未迁移调用点中断。
- [ ] 3. 新建 `PbsInputNumber` 与 `AwardAvoidSegmentedControl`，为 nullable 输入、blur clamp、箭头边界、键盘和 disabled 写组件测试。
- [ ] 4. 替换 Prefer Off、Long Stretch、Commuter 的本地数字 / Award-Avoid 调用；保留各 feature 的业务校验和 payload。
- [ ] 5. 修 Pairing Preference：使用共享控件、删除日历占位、将日期验证拆为 Incomplete / Resolving / Resolved / Failed，调整 quantity 错误时机。
- [ ] 6. 在 Pairing dialog 采用与 Prefer Off / Long Stretch / Commuter 一致的空 Tier 策略；不改 `TierToggleGroup` 公共组件。
- [ ] 7. 补 / 更新页面与 E2E 回归：日历不挤压布局、日期中间态、Tier 清空、输入边界和 Pairing 错误态；新增 QA 用例。
- [ ] 8. 执行 focused Vitest、`pbs-portal` lint / build / `check:ui` 与实际 Playwright 用例；用 GitNexus `detect_changes` 复核影响范围。

## 写入边界

- 公共层：`pbs-portal/src/shared/components/**`
- 调用层：`pbs-portal/src/features/days-off/**`、`line/**`、`pairing/**`
- 测试：以上组件测试、`e2e/tests/pbs-portal/**`（以现有结构为准）
- QA：`docs/test-cases/pbs/portal/**`

## 风险控制

- `TierToggleGroup` 的影响分析为 CRITICAL，不修改其 API / 行为。
- Date picker 的影响分析为 HIGH，先以兼容 re-export 迁移；每个现有调用点保持相同 props 和可见行为。
- Pairing occurrence N+1 与 legacy `pairing-occurrence-list` 迁移不包含在此计划；发现与 UI 改动耦合时停止并另起设计。
