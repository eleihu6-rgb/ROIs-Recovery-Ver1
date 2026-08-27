# App Shell 架构

> 2026-04-14 实现；2026-05-29 合并 TopNav+TabBar

## 概述

登录后默认进入 Dashboard 页。Gantt（排班）作为 Live → Roster 子视图嵌入 App Shell。Shell 支持 TopNav / Sidebar 两层布局独立切换，所有状态通过 ShellStore 管理并持久化至 localStorage。

## 组件结构

```
AppShell
├── ShellTopNav          # 44px 顶部导航栏（含 Tab 功能，可隐藏）
└── div.workspace
    ├── ShellSidebar     # 三态侧边栏（expanded/collapsed/hidden）
    └── main
        └── ContentArea  # keep-alive 内容区域
            ├── DashboardView     (module === 'dashboard')
            ├── RosterView        (module === 'live')
            ├── ScenarioView      (module === 'scenario')
            └── PlaceholderView   (其他模块)
```

## ShellTopNav 合并设计

原 `ShellTabBar`（34px）已合并入 `ShellTopNav`，节省 34px 竖向空间。

- 6 个模块按钮均以 Tab 样式渲染（`h-[28px]` 圆角胶囊）
- 已打开的模块（`openTabs`）在多 Tab 时显示关闭 `×` 按钮
- 未打开的模块以半透明样式展示，点击即打开并跳转
- 右侧保留 ThemeSwitcher / 用户信息 / 登出 / Hide Nav 按钮

## ShellStore

文件：`gantt/src/stores/shell-store.ts`

| 状态 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `activeModule` | `ActiveModule` | `'dashboard'` | 当前激活模块 |
| `openTabs` | `ActiveModule[]` | `['dashboard']` | 已打开（挂载中）的 Tab 列表 |
| `activeLiveItem` | `ActiveLiveItem` | `'roster'` | Live 模块子视图 |
| `activeScenarioItem` | `ActiveScenarioItem` | `'all'` | Scenario 模块子菜单选项 |
| `topNavVisible` | `boolean` | `true` | TopNav（含 Tab）可见性 |
| `sidebarState` | `SidebarState` | `'expanded'` | 侧边栏三态 |
| `sidebarUserOverride` | `boolean` | `false` | 阻止模块切换自动改 sidebar |

**类型定义：**

```typescript
type ActiveModule = 'dashboard' | 'live' | 'scenario' | 'rule' | 'data' | 'system'
type ActiveScenarioItem = 'all' | 'po' | 'ro' | 'to'
```

### 关键方法

- **`setModule(module)`** — 切换活跃模块，自动将 module 加入 `openTabs`；切换到 `live` 时自动折叠 sidebar（除非用户手动覆盖）
- **`closeTab(module)`** — 从 `openTabs` 移除，对应视图卸载释放内存；如关闭的是当前活跃 Tab，自动切换到相邻 Tab；至少保留 1 个 Tab
- `setLiveItem / setScenarioItem / toggleTopNav / setSidebarState` — 对应状态变更 + localStorage 持久化

## Tab Keep-Alive 机制

**问题**：普通条件渲染（if/else）在切换 Tab 时卸载旧视图，触发 useEffect 重新 fetch 数据。

**方案**：所有 `openTabs` 中的视图同时挂载，通过 CSS 控制可见性而非挂载状态：

```tsx
// app-shell.tsx — ContentArea
<div className="relative h-full w-full overflow-hidden">
  {openTabs.map((module) => (
    <div
      key={module}
      className={[
        'absolute inset-0',
        module === activeModule ? '' : 'invisible pointer-events-none',
      ].join(' ')}
    >
      <ModuleView module={module} />
    </div>
  ))}
</div>
```

**为什么用 `visibility:hidden` 而非 `display:none`**：Canvas 元素在 `display:none` 时 `offsetWidth/Height = 0`，会导致 ResizeObserver 将 canvas 缩为 0 像素。`visibility:hidden` 保留布局尺寸，Canvas 正常工作。

**内存释放**：`closeTab(module)` 将 module 从 `openTabs` 移除，React 销毁对应组件树，Canvas context、store 订阅、定时器等随组件生命周期清理。

## Dashboard View

文件：`gantt/src/components/shell/dashboard-view.tsx`

- 组件挂载时一次性 fetch `/api/dashboard/overview`
- 卡片立即渲染（不等待数据）
- 数据加载中：每张卡片底部显示 2px 滑动进度条（`rois-bar` keyframe）+ skeleton 占位
- 数据到达后：skeleton 替换为真实数值，进度条消失

## Pane 加载条

文件：`gantt/src/components/panes/pane-loading-bar.tsx`

三个 Gantt Pane（Roster / Pairing / Flight）均集成 `<PaneLoadingBar>`，仅在**首次加载**时显示（`loading && !hasData`），后续 zoom/scroll 触发的 refetch 不显示。

## 侧边栏三态

| 状态 | 宽度 | 触发条件 |
|------|------|---------|
| `expanded` | 200px | 默认（非 Live 模块） |
| `collapsed` | 48px | 切换到 Live 模块时自动；或用户手动点击 |
| `hidden` | 0px | 用户手动彻底隐藏 |

折叠态显示一个绝对定位的展开 tab（`translate-x-full` 贴右边），点击恢复。

## 全局 CSS Keyframe

文件：`packages/ui/src/styles/globals.css`

```css
@keyframes rois-bar {
  0%   { left: -40%; width: 40%; }
  50%  { left: 60%;  width: 40%; }
  100% { left: 110%; width: 40%; }
}
```

被 DashboardView `CardProgress` 和 `PaneLoadingBar` 共用。
