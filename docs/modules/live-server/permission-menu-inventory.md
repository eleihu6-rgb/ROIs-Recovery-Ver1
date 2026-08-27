# 权限菜单盘点清单（2026-08-11）

> 菜单/按钮盘点来源：gantt 前端真实组件（`gantt/src/components/shell/*` 导航 + 各页面组件）。
> 用途：作为 `sql/seed/05-system-menu.sql` 重建依据，以及后续「新增接口需登记 api_uris」的对照表。

## 菜单树（3 级）

```
ROOT
├── DASHBOARD                (DashboardView)
├── LIVE                     (容器)
│   └── LIVE_ROSTER          (RosterView)
├── SCENARIO                 (容器)
│   └── SCENARIO_LIST        (ScenarioView)
│       ├── SCENARIO_ALL / SCENARIO_PO / SCENARIO_RO / SCENARIO_CREW_BIDS
├── DATA                     (容器)
│   ├── DATA_ORG_BASE / DATA_RANK / DATA_FLEET_AIRCRAFT / DATA_LOCATION_ROUTE
│   ├── DATA_ASSIGNMENT / DATA_QUALIFICATION / DATA_COMPOSITION / DATA_ROSTER_PERIOD
│   ├── DATA_CONFIG_DICTIONARY / DATA_QUERY / DATA_HOLIDAY
│   └── DATA_CREW_MASTER / DATA_CREW_WORKLOAD
├── LEGALITY                 (容器)
│   ├── LEGALITY_RULE_SETS / LEGALITY_RULE_INSTANCES
│   └── LEGALITY_COMPOSITION / LEGALITY_COMP_LOAD
├── SYSTEM                   (容器)
│   ├── SYSTEM_SCHEDULER / SYSTEM_QUEUE_TASKS / SYSTEM_GRAFANA
│   ├── SYSTEM_PROMETHEUS / SYSTEM_WINDMILL / SYSTEM_DATA_QUALITY
│   └── SYSTEM_USER_MGMT / SYSTEM_PROFILE_MGMT / SYSTEM_MENU_MGMT
│       └── SYSTEM_PBS_USER_MGMT / SYSTEM_DEPT_MGMT
├── PBS                      (容器)
│   ├── PBS_PERIOD / PBS_BID_DEFINITIONS / PBS_BUSINESS_TIME / PBS_ADMIN_TOOLS
└── HELP                     (HelpView)
```

## 按钮清单（system_menu_ctrl）

详见 `sql/seed/05-system-menu.sql` 的 INSERT 块。来源组件：

| 菜单 | 组件 |
|---|---|
| LIVE_ROSTER | `shell/gantt-sub-toolbar.tsx`、`roster/context-menu.tsx`、`roster/roster-publish-dialog.tsx`、`roster/ground-task-dialog.tsx`、`roster/swap-dialog.tsx` |
| SCENARIO_* | `scenario/scenario-list-panel.tsx`、`scenario/scenario-toolbar.tsx`、`scenario-gantt/scenario-gantt-toolbar.tsx`、`scenario-gantt/scenario-context-menu.tsx` |
| DATA_* | `data/data-view.tsx`、`data/basic-table-page.tsx`（通用增改删复制）、`data/data-edit-dialog.tsx`、`data/crew-master-view.tsx` |
| LEGALITY_* | `legality/legality-rule-sets-view.tsx`、`legality/rule-instances-view.tsx`、`legality/rule-set-dialogs.tsx` |
| SYSTEM_* | `system/scheduler-view.tsx`、`system/data-quality-monitor.tsx`（其余为 iframe 外链工具） |
| PBS_* | `pbs/pbs-period-view.tsx`、`pbs/pbs-bid-definitions-view.tsx`、`pbs/pbs-business-time-view.tsx`、`pbs/pbs-admin-tools.tsx` |

## 说明

- **api_uris 使用归一化路径**（`/api/...`，不含 `/altair/live` 代理前缀）；支持 `*` 通配。
- **UI-only 按钮**（缩放/布局/选择等，不触发后端接口）在 seed 中 `api_uris` 留空，仅前端控制可见性，不走后端门禁。
- **iframe 外链工具**（Grafana/Prometheus/Queue Tasks/Windmill）与静态 Help 无后端读接口，菜单 `api_uris` 为 null。
- 新增后端接口时，若该接口应受权限门禁，必须在此盘点表 + seed 中登记对应 `api_uris`，否则 fail-open（不受门禁）。
