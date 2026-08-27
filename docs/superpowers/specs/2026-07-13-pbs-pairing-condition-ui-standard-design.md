# PBS Pairing 条件 UI 标准固化设计

日期：2026-07-13
状态：已获用户批准，已实施

## 目标

将已验收的 `Pairing Preference`、`Airport Preference`、`Pairing Check-In / Check-Out Time`、`Flight Legs per Duty` 与 `Work Day Preference` 的共同界面规则固化，避免后续条件重复实现日期控件、默认值或分段选中态而产生不一致。

## 决策

采用双层规范：

1. `pbs-portal/AGENTS.md` 提供强制入口规则，所有 Portal 改动前均可见。
2. `docs/modules/pbs/pairing-condition-ui-standard.md` 作为 Pairing 条件的规范正文，定义可复用组件、允许的例外、验收项与测试要求。

## 范围

- 覆盖 Pairing 条件配置弹窗与 Search Pairings 中共享的配置路径。
- 不改变现有 property code、数据模型、后端 payload 或数据库 schema。
- 后续需求若明确指定不同交互，可以例外，但必须在 spec 中记录原因并更新回归测试。

## 验收

- 模块入口能够直接链接到规范正文。
- 规范明确默认值、日期组件、日期范围、分段按钮、可选范围、焦点/布局和测试门槛。
- 不要求本次重构现有已验收条件；后续修改时按规范收敛。

## Multi-Agent Parallelism Assessment

- Recommendation: No。
- Rationale: 规则正文和模块入口必须一致，由同一人维护可避免相互矛盾。
- Execution gate: 用户已明确批准固化后实施；不自行创建 Git 提交。
