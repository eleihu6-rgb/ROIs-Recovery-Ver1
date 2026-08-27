# PBS Portal Bidding Calendar 周期提示移除设计

## 背景

第一阶段已把 PBS Portal 的当前可申请周期接入后端生命周期控制，并在页面上显示 `ActivePeriodBanner`。用户反馈：`BIDDING CALENDAR` 左侧日历区域不应出现固定周期提示，避免干扰日历本身的阅读。

## 目标

- 移除 `DashboardSchedulePanel` 中 `BIDDING CALENDAR` 左侧日历顶部的固定周期提示条。
- 保留后端周期生命周期校验：只有 `OPEN` 且当前时间在 `bid_open_at` / `bid_close_at` 窗口内才允许写入。
- 保留前端只读控制：只读周期下日历点击、添加、保存入口仍不可用。
- 保留用户触发不可用操作时的 `message.warning` 提示。

## 非目标

- 不移除 Line / Days Off / Pairing / Reserve 右侧申请面板里的周期提示。
- 不改变 `ActivePeriodBanner` 共享组件。
- 不改变 active period API、后端校验、当前周期选择逻辑或管理端配置。

## 实现方案

在 `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx` 中移除 `ActivePeriodBanner` 的 import 和 JSX 渲染。保留该文件内 `activePeriod`、`canEditCurrentBid`、`readOnlyMessage` 的计算，因为它们仍用于禁用日历写入和弹出警告。

## 验收标准

- `BIDDING CALENDAR` 左侧日历顶部不再显示 `Bidding open` / `Read-only` 固定提示条。
- 只读周期下日历写入入口仍不可用。
- 其它申请页面的周期提示不受影响。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动范围很小，只涉及单个 Dashboard 日历组件。
- Suggested split: 不拆分。
- Write boundaries: 只修改 Dashboard 日历组件和本设计文档。
- Conflict risk: 低。
- Execution gate: 用户已确认移除范围后执行。
