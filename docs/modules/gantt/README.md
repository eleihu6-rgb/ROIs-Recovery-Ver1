# Gantt 排班前端文档

> 功能规格 + 技术实现，按模块拆分

## 文档索引

### 功能规格

| 文档 | 内容 |
|------|------|
| [app-shell.md](app-shell.md) | App Shell 架构（TopNav/TabBar/Sidebar/Dashboard/Tab Keep-Alive） |
| [layout.md](layout.md) | 整体布局、Pane 架构、工具栏 |
| [pane-layout-design.md](pane-layout-design.md) | **Pane 布局解耦设计（2x2 网格 + 拖拽）** |
| [roster-pane.md](roster-pane.md) | Roster 主/副 Pane 功能 |
| [pairing-pane.md](pairing-pane.md) | Pairing Pane 功能 |
| [flight-pane.md](flight-pane.md) | Flight Pane 功能 |
| [draft-mode.md](draft-mode.md) | 草稿模式 + 任务锁定 + 多用户协同 |
| [rule-check.md](rule-check.md) | 法规检查集成 |
| [theme-zoom.md](theme-zoom.md) | 主题切换 + 缩放 + TimeAxis 交互 |
| [assignment-types.md](assignment-types.md) | 任务类型体系（参数化 + 颜色） |
| [frozen-rows.md](frozen-rows.md) | 冻结行（Excel 式行置顶 + 行选择 + 右键菜单） |
| [scenario.md](scenario.md) | Scenario 优化场景模块（列表/详情/过滤/KPI/操作栏） |
| [ground-task.md](ground-task.md) | **Ground Task 地面任务创建与编辑** |
| [pairing-duty-node-editor.md](pairing-duty-node-editor.md) | **Duty 进退场时间编辑器（Gantt 条渲染 + Double 模式）** |
| [timezone-switcher-design.md](timezone-switcher-design.md) | 时区切换功能 |
| [mvp-status.md](mvp-status.md) | MVP 功能优先级与完成状态 |

### Pane Layout 系列

| 文档 | 内容 |
|------|------|
| [pane-layout-design.md](pane-layout-design.md) | 设计概览、布局规则、设计决策 |
| [pane-layout-types.md](pane-layout-types.md) | 类型定义（PaneType, PaneInstance, LayoutGrid 等） |
| [pane-layout-components.md](pane-layout-components.md) | 组件实现（LayoutGrid, GridRow, PaneWrapper 等） |
| [pane-layout-stores.md](pane-layout-stores.md) | Store 实现（layout-store, pane-instance-store） |

### 技术实现

| 文档 | 内容 |
|------|------|
| [tech-canvas.md](tech-canvas.md) | Canvas 渲染引擎技术细节 |
| [tech-stores.md](tech-stores.md) | Zustand Store 架构 |

### 关联文档

| 文档 | 位置 |
|------|------|
| 法规引擎文档 | [../04-rule-engine/](../04-rule-engine/) |
| 系统技术需求 | [../technical-requirements.md](../technical-requirements.md) |
| 系统功能需求 | [../functional-requirements.md](../functional-requirements.md) |
