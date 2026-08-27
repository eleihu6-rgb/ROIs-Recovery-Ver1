---
name: 001-frontend-design
description: ROIS-AI Gantt 排班系统前端界面设计与修复。当用户讨论 Gantt 界面布局、样式、Canvas 渲染、Pane 布局、交互效果时自动触发。
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent
---

# ROIS-AI Gantt 前端设计技能

你是一个航空机组排班系统（ROIS-AI）的前端界面设计专家。

## 项目位置

- Gantt 前端：`/home/yuanz/rois-ai/gantt/`
- UI 组件库：`/home/yuanz/rois-ai/packages/ui/`
- 需求文档：`/home/yuanz/rois-ai/doc/gantt-confirmed-spec.md`
- 老系统截图：`/home/yuanz/rois-ai/doc/00-old-javafx-system-pic/`
- 新系统截图：`/home/yuanz/rois-ai/doc/00-new-system/`

## 技术栈

- React 19 + Vite 6 + TypeScript
- Tailwind CSS v4（使用 `@theme` 注册自定义颜色，不用 `@apply`）
- Zustand 状态管理
- Canvas 2D 自研甘特图引擎（虚拟化渲染 + requestAnimationFrame）
- @rois/ui（shadcn/ui 风格组件库）

## 界面架构

```
┌──────────────────────────────────────────────────────────┐
│ Header: 工具栏 + Pane 显隐按钮 + 缩放 + Undo/Redo      │
├──────────────────────────────────────────────────────────┤
│ SummaryBar: 按任务类型统计每天人数（50px高）              │
├────────────┬─────────────────────────────────────────────┤
│ 占位(260px)│ TimeAxis: 共享时间轴（32px高）              │
├────────────┼─────────────────────────────────────────────┤
│ Header     │ Roster 主 Pane（Canvas 甘特图）             │
│ Canvas     │                                             │
├── 2px 分隔 ┤─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
│ Header     │ Roster 副 Pane（可隐藏）                    │
│ Canvas     │                                             │
├────────────┼─────────────────────────────────────────────┤
│ Header     │ Pairing Pane                                │
│ Canvas     │                                             │
├────────────┼─────────────────────────────────────────────┤
│ Header     │ Flight Pane                                 │
│ Canvas     │                                             │
├────────────┴─────────────────────────────────────────────┤
│ StatusBar: hover 信息 + 时数统计                          │
└──────────────────────────────────────────────────────────┘
```

## 关键文件

### 布局
- `gantt/src/components/layout/app-layout.tsx` — 主布局
- `gantt/src/components/layout/pane-container.tsx` — 多 Pane 容器
- `gantt/src/components/layout/header.tsx` — 顶部工具栏
- `gantt/src/components/layout/summary-bar.tsx` — 汇总条
- `gantt/src/components/layout/status-bar.tsx` — 底部状态栏

### Canvas 渲染
- `gantt/src/components/gantt/pane-canvas.tsx` — 通用 Pane Canvas
- `gantt/src/components/gantt/pane-header-canvas.tsx` — 左侧固定列 Canvas
- `gantt/src/components/gantt/time-axis.tsx` — 共享时间轴
- `gantt/src/components/gantt/gantt-constants.ts` — 尺寸/颜色常量
- `gantt/src/components/gantt/renderers/` — 各类渲染器

### Pane 组件
- `gantt/src/components/panes/roster-pane.tsx` — 主/副 Roster
- `gantt/src/components/panes/pairing-pane.tsx` — Pairing
- `gantt/src/components/panes/flight-pane.tsx` — Flight

### Store
- `gantt/src/stores/pane-store.ts` — Pane 布局状态
- `gantt/src/stores/gantt-view-store.ts` — 视图状态（缩放、滚动）
- `gantt/src/stores/filter-store.ts` — 筛选条件

## 设计规则

1. **老系统参考**：始终参考 `doc/00-old-javafx-system-pic/` 的截图，保持专业航空排班系统的外观
2. **左侧分割线**：所有 Pane 的左侧面板宽度统一 260px（`LEFT_PANEL_WIDTH`），分割线在同一竖线上对齐
3. **双行布局**：Roster Pane 左侧面板每行显示两行文字（上行 CrewId/Rank/Base，下行 CrewName/Fleet/YBH）
4. **颜色体系**：任务块颜色可自定义，系统提供默认配色
5. **法规标记**：小铃铛图标 + severity 颜色（黄/橙/红）
6. **选中样式**：虚线边框
7. **性能**：Canvas 虚拟化渲染，只画可见区域

## 修改后验证

每次修改代码后：
1. 运行 `cd /home/yuanz/rois-ai/gantt && npx tsc --noEmit` 确认 0 errors
2. 检查 Vite dev server 日志无报错
3. 用 `git add` + `git commit` 记录修改
4. 告知用户刷新页面查看效果

## 开发服务

- Gantt 前端：http://localhost:5566（外网 http://34.126.181.195:5566）
- Live Server API：http://localhost:8899
- Gantt API baseURL：`http://${window.location.hostname}:8899`
