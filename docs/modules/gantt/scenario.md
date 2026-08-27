# Scenario 优化场景模块

> 实现日期：2026-04-15 · 最后更新：2026-04-16

## 概述

Scenario 模块为排班优化提供场景管理能力，支持三种场景类型：

| 类型 | 全称 | 说明 |
|------|------|------|
| `PO` | Pairing Optimization | 航班配对/组环优化 |
| `RO` | Roster Optimization | 机组排班分配优化 |
| `TO` | Training Optimization | 复训/模拟机培训优化 |

顶部导航位置：Dashboard | Live | **Scenario** | Rule | Data | System

## 界面布局

```
┌──────────────────────────────────────────────────────────────┐
│  Top Nav + Tab Bar                                           │
├──────┬───────────────────────────────────────────────────────┤
│      │  ┌── List Panel (380px) ──┬── Detail Panel ─────────┐ │
│Side  │  │  Search + Filters      │  Header (name / status) │ │
│bar   │  │  ────────────────      │  Basic Info             │ │
│      │  │  Scenario list rows    │  Scope Filters          │ │
│      │  │  ...                   │  KPI Results            │ │
│      │  │  ────────────────      │  ─────────────────────  │ │
│      │  │  Pagination            │  Action bar             │ │
│      │  └────────────────────────┴─────────────────────────┘ │
└──────┴───────────────────────────────────────────────────────┘
```

## 场景状态

| 状态码 | 界面显示 | 说明 | 视觉样式 |
|--------|----------|------|----------|
| `DRAFT` | **Draft** | 草稿，可编辑 | 灰色徽章 |
| `RUNNING` | **Running** | 优化引擎执行中 | 蓝色徽章 |
| `DONE` | **Done** | 优化完成，展示 KPI | 绿色徽章 |
| `FAILED` | **Failed** | 执行失败，可重新提交 | 红色徽章 |

状态流转：`DRAFT → RUNNING → DONE / FAILED → DRAFT`

## Sidebar 子菜单

| item | 界面标签 | 图标 |
|------|----------|------|
| `all` | **All Scenarios** | `Layers` |
| `po`  | **PO** | `FlaskConical` |
| `ro`  | **RO** | `Users` |
| `to`  | **TO** | `GraduationCap` |

RO 与 TO 拆分为独立菜单项，便于后续分别扩展功能。

## 场景列表面板

- 搜索框（300 ms 防抖）+ **Type** 下拉 + **Status** 下拉 + **New Scenario** 按钮（列表面板右上角，唯一入口）
- 列表行三行布局：名称 + 类型徽章 + 状态点 / 日期范围 + 优化次数 / 来源 + 修改人 + 相对时间（hover 显示）
- 类型徽章色系：PO = 蓝色 / RO = 绿色 / TO = 紫色
- 行交互：选中 = 左侧 3px 蓝线 + `bg-accent`；悬停 = `bg-accent/50`
- 三点菜单：**Duplicate**（已禁用，待后端实现）/ **Delete**（需二次确认 Dialog）
- 底部分页：每页 20 条

## 场景详情面板

### 区块 1 — Basic Info

只读类型徽章、开始/结束日期选择器、**Lead-in Live** 复选框。  
所有变更通过 `patchDraft()` 写入 `draftDetail`，保存前不提交到服务器。

### 区块 2 — Scope Filters

根据 `fileType` 动态渲染 `CollapsibleSection`（自定义折叠组件，非 Radix Accordion）。

**PO 场景 — Flight Filters**

| 字段 | 界面标签 | 说明 |
|------|----------|------|
| flightNos | **Flight Nos** | TagInput 多值输入 |
| depAirports | **Dep Airports** | TagInput |
| arrAirports | **Arr Airports** | TagInput |
| fleets | **Fleets** | TagInput |
| flightStatus | **Flight Status** | 下拉：Scheduled / Actual / All |

**RO 场景 — Crew Filters + Pairing Filters**

*Crew Filters：*

| 字段 | 界面标签 | 说明 |
|------|----------|------|
| division | **Division** | Basic Info；来源 workset.division（Division 表） |
| bases | **Bases** | TagInput |
| fleets | **Fleet Qualifications** | TagInput |
| status | **Status** | 下拉：Active / All |

*Pairing Filters：*

| 字段 | 界面标签 | 说明 |
|------|----------|------|
| bases | **Bases** | TagInput |
| fleets | **Fleets** | TagInput |
| sources | **Pairing Source** | 多选：Manual / Optimized / Imported |

**TO 场景 — Crew Filters + Pairing Filters + Training Filters**

在 RO 基础上增加 *Training Filters：*

| 字段 | 界面标签 | 说明 |
|------|----------|------|
| courseTypes | **Course Types** | TagInput，如 Annual Recurrent / Sim Check |
| expiryFilter | **Expiry Filter** | 下拉：Expiring within 90 days / All |
| priorities | **Priorities** | TagInput，如 Urgent / High |

过滤条件序列化为 JSONB 存入 `scenario.filter_params`。

> **实现注意：** `filter_params` 在数据库中定义为 `NOT NULL DEFAULT '{}'`，空对象是 truthy 值，
> `??` 操作符不会触发默认值回退。`scenario-filter-section.tsx` 使用深合并（shallow spread per
> sub-object）将存储值与默认值合并，确保所有缺失的数组字段都被安全初始化，避免运行时 crash。

### 区块 3 — KPI Results

| 场景状态 | 展示内容 |
|----------|----------|
| DRAFT | 不显示 |
| RUNNING | 动画进度条 + "**Optimization in progress…**" |
| DONE | 2 列 KPI 卡片网格 |
| FAILED | 错误横幅 + "**Optimization failed. Review the configuration and resubmit.**" |

### 底部操作栏 — Action Bar

| 按钮标签 | 状态说明 |
|----------|----------|
| **Save** / **Save \*** | `isDirty` 时显示 "**Save \***"；提交中显示 "**Saving…**" |
| **Run Optimization** | DRAFT 状态可点击，触发 DRAFT→RUNNING 状态流转 |
| **Stop** | RUNNING 状态可点击（当前调用 transition→FAILED 作为占位） |
| **Open Gantt** | 始终可点击，切换到 Live 模块 |

## Keep-alive 重进刷新

本 App 采用 keep-alive tab 架构，所有已打开模块保持挂载（visibility hidden）。  
`ScenarioListPanel` 监听 shell store 的 `activeModule`，每次 Scenario tab 被激活时重新调用 `fetchList()`，确保列表数据在切换后始终是最新的。

## 文件结构

```
gantt/src/
├── types/scenario.ts                          # 类型定义
├── services/scenario-api.ts                   # REST API 客户端
├── stores/scenario-store.ts                   # Zustand store
└── components/
    ├── shell/
    │   └── scenario-view.tsx                  # 顶层双栏布局
    └── scenario/
        ├── scenario-empty-state.tsx
        ├── scenario-search-bar.tsx
        ├── scenario-list-item.tsx
        ├── scenario-list-panel.tsx
        ├── scenario-basic-info.tsx
        ├── scenario-filter-section.tsx        # filterParams 深合并
        ├── scenario-kpi-section.tsx
        ├── scenario-action-bar.tsx
        ├── scenario-detail-panel.tsx
        └── filter/
            ├── tag-input.tsx                  # 可复用 Tag 输入组件
            ├── collapsible-section.tsx        # 自定义折叠节
            ├── po-flight-filter.tsx
            ├── ro-crew-filter.tsx
            ├── ro-pairing-filter.tsx
            └── to-training-filter.tsx
```

## ScenarioStore

文件：`gantt/src/stores/scenario-store.ts`

**列表状态：** `items / total / page / pageSize / searchName / filterType / filterStatus / listLoading`

**详情状态：** `selectedId / detail / kpis / draftDetail / isDirty / detailLoading / saving`

**编辑模式：** `patchDraft(patch)` 将变更写入 `draftDetail`（`isDirty = true`）；  
`saveDetail()` 批量提交 `UpdateScenarioInput` 到服务器。

## 后端 API 端点

Base URL：`/fpqe/live`（live-server，端口 3000）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/scenario` | 分页列表（支持 name / fileType / status 筛选） |
| GET | `/api/scenario/:id` | 场景详情 |
| POST | `/api/scenario` | 创建场景（未传 workset_id 时自动创建 workset） |
| PUT | `/api/scenario/:id` | 更新场景 |
| DELETE | `/api/scenario/:id` | 删除场景 |
| POST | `/api/scenario/:id/transition` | 状态流转 |
| GET | `/api/scenario/:id/kpi` | KPI 列表 |

### Workset 自动创建

`scenarioService.create()` 在 `workset_id` 未传时自动插入一条 `workset` 记录，  
`division` 和 `type` 由 `fileType` 推导：PO → division=P，RO/TO → division=A。

## 种子/测试数据

文件：`sql/seed/95-scenario-mock.sql`

- 12 条 workset 记录（ID 9001–9012，使用 `OVERRIDING SYSTEM VALUE` 显式插入）
- 12 条 scenario 记录，覆盖 PO / RO / TO 的全部状态值
- 3 组 KPI 数据（对应 workset 9004、9008、9011 的 DONE 场景）
- 所有名称、注释、过滤条件值均使用英文

## 已知限制 / 后续扩展

- **Duplicate** 菜单项已预留（`disabled`），待后端接口就绪后实现
- **Stop** 当前调用 `transition(id, 'FAILED')` 作为占位；上线前需与后端确认专用停止端点
- **Open Gantt** 目前仅切换模块；后续可扩展为将 `filterParams` 注入 `filter-store`，实现数据范围联动
