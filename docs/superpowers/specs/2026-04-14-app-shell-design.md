# App Shell 改造设计文档

**日期**: 2026-04-14  
**分支**: `feat/rule-engine-upgrade`  
**状态**: 待实现

---

## 背景

当前登录后直接进入 Gantt 排班视图（`AppLayout`）。本次改造引入航空行业标准 App Shell 框架，登录后默认进入 Dashboard 总览页，Gantt 作为 Live → Roster 子视图嵌入其中。参考设计稿：`docs/modules/gantt/app-shell-design.html`。

---

## 目标

1. 登录后默认落地 Dashboard 页
2. Shell 框架支持 TopNav / TabBar / Sidebar 的独立隐藏/显示切换
3. Live → Roster 打开完整 Gantt（含现有全部交互）
4. Live 侧边栏列出 Pairing / Flight 菜单（标注 TODO，暂不可点击）
5. Dashboard 统计卡对接 live-server 真实 API

---

## 方案选择

**采用方案 A**：AppShell 作为顶层容器，现有 `AppLayout` 内嵌为 Roster 子视图。

- 零新依赖（不引入 React Router）
- Gantt 所有 Zustand store 状态跨模块切换不丢失
- 改动范围最小，后续加路由不影响架构

---

## 架构总览

```
App.tsx
└── AuthenticatedApp
    └── AppShell                      ← 新建，替换原 AppLayout 直接渲染
        ├── ShellTopNav               ← 新建，44px
        ├── ShellTabBar               ← 新建，34px，可隐藏
        └── workspace (flex row)
            ├── ShellSidebar          ← 新建，200/48/0px
            └── content area
                ├── DashboardView     ← 新建（默认）
                ├── RosterView        ← 新建，包裹现有 AppLayout
                └── PlaceholderView   ← 新建，Rule/Data/System 占位
```

---

## 一、Shell 状态管理

**新增文件**：`gantt/src/stores/shell-store.ts`

```typescript
interface ShellStore {
  activeModule: 'dashboard' | 'live' | 'rule' | 'data' | 'system'
  activeLiveItem: 'roster' | 'pairing' | 'flight'
  topNavVisible: boolean        // 默认 true
  tabBarVisible: boolean        // 默认 true
  sidebarState: 'expanded' | 'collapsed' | 'hidden'
  sidebarUserOverride: boolean  // 用户手动操作过 sidebar 后为 true，阻止自动覆盖

  setModule: (module: ActiveModule) => void
  setLiveItem: (item: ActiveLiveItem) => void
  toggleTopNav: () => void
  toggleTabBar: () => void
  setSidebarState: (state: SidebarState, byUser?: boolean) => void
  loadFromStorage: () => void
}
```

**持久化**：localStorage key 前缀 `rois-shell-*`，与现有 `rois-theme-*` 方式一致。

**自动行为**：
- `setModule('live')` → 若 `sidebarUserOverride === false`，自动将 sidebarState 设为 `'collapsed'`
- `setModule('dashboard' | 'rule' | 'data' | 'system')` → 若 `sidebarUserOverride === false`，自动将 sidebarState 恢复为 `'expanded'`
- `setSidebarState(state, byUser=true)` → 设置 `sidebarUserOverride = true`，后续模块切换不再自动覆盖
- `sidebarUserOverride` 也持久化到 localStorage

---

## 二、组件清单

全部新建于 `gantt/src/components/shell/` 目录：

| 文件 | 职责 |
|------|------|
| `app-shell.tsx` | 顶层容器，组合所有 shell 子组件 |
| `shell-top-nav.tsx` | ROIS logo + 模块导航 + 右侧控件（toggle icons、ThemeSwitcher、用户信息、登出） |
| `shell-tab-bar.tsx` | Tab 列表（静态，后续可动态扩展） |
| `shell-sidebar.tsx` | 左侧模块导航，含快捷折叠按钮，处理模块子菜单切换 |
| `dashboard-view.tsx` | Dashboard 内容区（统计卡 + 图表 + 近期排班表） |
| `roster-view.tsx` | GanttSubToolbar + 现有 AppLayout（h-full 模式） |
| `gantt-sub-toolbar.tsx` | 从现有 Header 提取的 Gantt 专用工具栏 |
| `placeholder-view.tsx` | Rule / Data / System 等暂未开发模块的占位页 |

---

## 三、TopNav 设计

**高度**：`h-11`（44px）  
**背景**：`bg-card border-b border-border shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]`

**左侧**：
- ROIS logo box（24×24，`bg-primary rounded-sm text-primary-foreground font-black text-xs`）
- "ROIS" 文字（`font-bold text-sm text-foreground`，"ROIS" 中 primary 色）
- 分隔线
- 模块导航项：Dashboard / Live / Rule / Data / System
  - 图标：`h-3.5 w-3.5`，Lucide：`LayoutDashboard` / `CalendarDays` / `ScrollText` / `Database` / `Settings2`
  - 激活样式：`text-primary border-b-2 border-primary font-semibold`
  - 普通样式：`text-muted-foreground hover:text-foreground hover:bg-muted`

**右侧**（`ml-auto flex items-center gap-1`）：
- `PanelTopClose/Open` → 隐藏/显示 TopNav 自身（通过 `ShellStore.toggleTopNav`）
- `PanelBottomClose/Open` → 隐藏/显示 TabBar
- 分隔线
- `ThemeSwitcher`（直接复用现有组件）
- 分隔线
- 用户信息：`text-[11px] text-muted-foreground`（`userCode · airline`）
- 登出按钮：`LogOut h-3.5 w-3.5`

---

## 四、TabBar 设计

**高度**：`h-[34px]`  
**背景**：`bg-card border-b border-border`  
**隐藏**：`h-0 opacity-0 overflow-hidden`，动画 `transition-[height,opacity] duration-200`

静态 tabs（当前阶段）：
```
● Dashboard  ×
● Roster     ×
● Rank       ×（占位）
● Crew Mgmt  ×（占位）
```

Tab 激活样式：`bg-accent text-foreground font-semibold`  
Tab 圆点颜色：`chart-1`（蓝）/ `chart-2`（绿）/ `chart-4`（橙）/ `chart-3`（紫）

---

## 五、Sidebar 设计

### 尺寸与动画
```
expanded:  w-[200px]
collapsed: w-12 (48px，icon-only)
hidden:    w-0 overflow-hidden
```
动画：`transition-[width] duration-200 ease-in-out`

### 头部（`h-9`）
```
[模块标签 text-[10px] font-extrabold uppercase tracking-widest text-sidebar-primary]
[PanelLeftClose/Open btn h-6 w-6]
[PanelBottomClose/Open btn h-6 w-6]
[PanelTopClose/Open btn h-6 w-6]
```
折叠态：标签 `opacity-0 max-w-0`，只显示三个按钮（靠 `justify-end`）。

折叠态右边缘展开 tab（参考 app-shell-design.html `#sb-expand-tab`）：
- 绝对定位，`right-0 translate-x-full`，14px 宽，44px 高
- `bg-card border border-border border-l-0 rounded-r-md`
- 仅在 `collapsed` 时显示

### Live 子菜单结构
```
── Scheduling ──（group label）
▶  Roster             ← 可点击，激活 RosterView
   Pairing  [Soon]    ← pointer-events-none opacity-50
   Flight   [Soon]    ← pointer-events-none opacity-50
```

"Soon" badge：`bg-muted text-muted-foreground text-[9px] font-semibold px-1 rounded ml-auto`

### 侧边栏 item 样式
```tsx
// 普通
"flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-sidebar-foreground/70
 cursor-pointer border-l-2 border-transparent
 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors duration-100"

// 激活
"bg-sidebar-accent text-sidebar-accent-foreground font-semibold border-l-2 border-sidebar-primary"
```

---

## 六、Dashboard 视图 + API

### 后端新增

**文件**：
- `live-server/src/routes/dashboard/dashboard.ts`
- `live-server/src/routes/dashboard/index.ts`
- `live-server/src/services/dashboard/dashboard-service.ts`
- 注册：`live-server/src/index.ts`（prefix `/api/dashboard`）

**接口**：`GET /api/dashboard/overview`

响应结构：
```typescript
{
  flightsToday: number          // roster_flight WHERE flt_dt = TODAY AND is_deleted = 0
  totalActiveCrew: number       // crew WHERE status = 0 AND is_deleted = 0
  violations: null              // 暂不入库，返回 null
  pendingApprovals: null        // PBS 系统，返回 null
  crewByRank: Array<{
    rank: string
    count: number
  }>
  flightsByDay: Array<{
    date: string                // YYYY-MM-DD
    count: number
  }>
}
```

**关键 SQL 逻辑**：

```sql
-- Flights Today
SELECT COUNT(*) FROM roster_flight
WHERE flt_dt = TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD')
  AND is_deleted = 0

-- Crew by Rank（当前有效 rank，关联 rank.display_order 排序）
SELECT r.rank, r.display_order, COUNT(DISTINCT cr.crew_id) AS count
FROM crew_rank cr
JOIN rank r ON r.rank = cr.rank
JOIN crew c ON c.crew_id = cr.crew_id
WHERE cr.eff_dt <= NOW()
  AND (cr.exp_dt IS NULL OR cr.exp_dt > NOW())
  AND c.status = 0 AND c.is_deleted = 0
GROUP BY r.rank, r.display_order
ORDER BY r.display_order

-- Flights last 14 days
SELECT flt_dt AS date, COUNT(*) AS count
FROM roster_flight
WHERE flt_dt >= TO_CHAR(NOW() - INTERVAL '13 days', 'YYYY-MM-DD')
  AND is_deleted = 0
GROUP BY flt_dt
ORDER BY flt_dt
```

`dashboard-service.ts` 使用 Drizzle `sql` tag 实现聚合查询。

### 前端 Dashboard 组件

**API 服务**：`gantt/src/services/dashboard-service.ts`
- `fetchOverview(): Promise<DashboardOverview>`
- 调用 `GET /api/dashboard/overview`，复用现有 `apiClient`

**`DashboardView` 组件结构**：
```
DashboardView
├── 页头（标题 "Overview" + 日期 + airline + Refresh 按钮）
├── StatGrid（4 列）
│   ├── StatCard: Flights Today   (chart-1 accent)
│   ├── StatCard: Active Crew     (chart-2 accent)
│   ├── StatCard: Violations      (destructive accent，null → "—")
│   └── StatCard: Pending         (chart-4 accent，null → "—")
├── ChartsRow（3 列）
│   ├── CrewByRankChart（水平条形图，SVG/div 实现）
│   ├── CrewStatusChart（占位，标注"待接入"）
│   └── FlightsByDayChart（14 天柱状图，div 实现）
└── RecentAssignmentsTable（最近5条 roster 数据）
```

**样式规范**：
- 容器：`p-5 overflow-y-auto` 
- 统计卡：`bg-card border border-border rounded-lg shadow-sm p-4 relative overflow-hidden`
- accent bar：`absolute inset-x-0 top-0 h-[3px] rounded-t-lg`
- 数值：`text-2xl font-bold tabular-nums tracking-tight text-foreground`
- 图表卡：`bg-card border border-border rounded-lg p-4 shadow-sm`
- 表格：复用现有 `<table>` 样式模式（见 app-shell-design.html）

---

## 七、RosterView 与 AppLayout 集成

### `roster-view.tsx`
```tsx
export const RosterView = () => (
  <div className="flex h-full flex-col overflow-hidden">
    <GanttSubToolbar />
    <AppLayout />          {/* AppLayout 已去掉内部 <Header /> */}
  </div>
)
```

### `app-layout.tsx` 改动
- 移除 `<Header />`（Header 内容迁移至 `GanttSubToolbar`）
- 最外层 `div` 的 `h-screen` → `h-full`
- 其余不变

### `gantt-sub-toolbar.tsx`
- 直接从 `header.tsx` 复制内容
- 移除登出按钮（登出移至 Shell TopNav）
- 移除 `ThemeSwitcher`（主题切换移至 Shell TopNav）
- 保留所有 Gantt 工具栏功能：日期范围选择、刷新、Filter、DraftToolbar、Zoom、RuleGroupSelector、Pane 开关、选中数量显示

---

## 八、App.tsx 改动

```tsx
// 改前
function AuthenticatedApp() {
  // ...
  return <AppLayout />
}

// 改后
function AuthenticatedApp() {
  // ...effects 不变
  return <AppShell />
}
```

---

## 九、UI/UX 硬性约束（实现检查清单）

- [ ] 所有颜色使用 CSS Token，禁止 `#hex` / `rgb()` 直接写色值
- [ ] `--radius: 0.125rem` 全局极小圆角，导航激活项用 `rounded-sm`
- [ ] Dashboard 卡片允许 `rounded-lg`（信息卡例外）
- [ ] Sidebar 宽度切换动画：`transition-[width] duration-200 ease-in-out`
- [ ] TopNav/TabBar 隐藏动画：`transition-[height,opacity] duration-200`
- [ ] 微交互统一 `transition-all duration-100`
- [ ] 图标全部 Lucide，TopNav `h-3.5 w-3.5`，Sidebar `h-4 w-4`
- [ ] `AppLayout` 最外层 `h-screen` → `h-full`（避免双滚动条）
- [ ] `npx tsc --noEmit` 通过

---

## 十、文件变更汇总

### 新增
```
gantt/src/stores/shell-store.ts
gantt/src/components/shell/app-shell.tsx
gantt/src/components/shell/shell-top-nav.tsx
gantt/src/components/shell/shell-tab-bar.tsx
gantt/src/components/shell/shell-sidebar.tsx
gantt/src/components/shell/dashboard-view.tsx
gantt/src/components/shell/roster-view.tsx
gantt/src/components/shell/gantt-sub-toolbar.tsx
gantt/src/components/shell/placeholder-view.tsx
gantt/src/services/dashboard-service.ts
live-server/src/routes/dashboard/dashboard.ts
live-server/src/routes/dashboard/index.ts
live-server/src/services/dashboard/dashboard-service.ts
```

### 修改
```
gantt/src/App.tsx                                   AuthenticatedApp 渲染 AppShell
gantt/src/components/layout/app-layout.tsx          移除 <Header />，h-screen → h-full
live-server/src/index.ts                            注册 /api/dashboard 路由
```

### 保留不动
```
gantt/src/components/layout/header.tsx              作为 gantt-sub-toolbar.tsx 的来源参考，不删除
gantt/src/stores/*.ts                               全部保留
gantt/src/components/gantt/**                       全部保留
gantt/src/components/panes/**                       全部保留
gantt/src/components/roster/**                      全部保留
```
