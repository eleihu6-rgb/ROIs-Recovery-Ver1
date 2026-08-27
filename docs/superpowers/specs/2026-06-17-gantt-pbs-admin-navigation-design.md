# Gantt PBS 管理端导航骨架设计

## 背景

当前 PBS Portal 与 PBS Server 已经持续开发，但用户希望后续“管理端 PBS 功能”放在 Gantt 管理端中逐步建设，而不是继续沿用 PBS Portal 顶部导航作为本次入口。

Gantt 当前登录后使用 App Shell 架构：

- 顶部导航由 `gantt/src/components/shell/shell-top-nav.tsx` 的 `NAV_ITEMS` 管理。
- 当前模块与已打开 tab 由 `gantt/src/stores/shell-store.ts` 管理。
- 内容区域由 `gantt/src/components/shell/app-shell.tsx` 的 `ModuleView` 分发。
- 左侧子导航由 `gantt/src/components/shell/shell-sidebar.tsx` 根据 `activeModule` 渲染。

本次需求只建立 PBS 管理端的导航骨架，后续功能再逐步挂载。

## 目标

1. 在 Gantt 顶部导航新增一级导航 `PBS`。
2. `PBS` 在顶部导航中的位置放在 `Dev` 左边。
3. 点击 `PBS` 后进入 Gantt 内部 PBS 管理模块。
4. PBS 模块左侧显示子导航。
5. 第一版只新增一个子导航项：`Period`。
6. `Period` 对应右侧内容区先显示空白页或极简占位，不接业务 API。
7. 保持 Gantt 现有 TopNav、Tab keep-alive、Sidebar 状态管理模式。

## 非目标

本次不做以下内容：

- 不嵌入或跳转到 `pbs-portal`。
- 不复用 `Scenario > Crew Bids` 页面。
- 不新增 `pbs-server` 或 `live-server` API。
- 不实现 Period 业务表格、表单、保存、删除、查询等功能。
- 不改数据库 schema。
- 不调整 PBS Portal 导航。

## 设计方案

### 1. Shell Store 扩展

在 `gantt/src/stores/shell-store.ts` 中新增 PBS 模块状态：

- `KnownModule` 增加 `'pbs'`。
- 新增类型：

```typescript
export type ActivePbsItem = 'period'
```

- `ShellStore` 增加：

```typescript
activePbsItem: ActivePbsItem
setPbsItem: (item: ActivePbsItem) => void
```

- `KEYS` 增加 PBS 子导航持久化 key，例如：

```typescript
pbsItem: 'rois-shell-pbs-item'
```

- 默认值：

```typescript
activePbsItem: 'period'
```

- `loadFromStorage()` 中校验 PBS 子导航，只允许 `period`，非法值回退到 `period`。

### 2. 顶部导航新增 PBS

在 `gantt/src/components/shell/shell-top-nav.tsx` 的 `NAV_ITEMS` 中新增：

```typescript
{ module: 'pbs', label: 'PBS', Icon: ... }
```

插入位置必须在 `Dev` 左边。按当前导航顺序，建议放在 `Regression` 与 `Dev` 之间：

```text
... System / Regression / PBS / Dev / Help / Release
```

图标建议使用 `lucide-react` 中的管理/日历语义图标，例如：

- `BriefcaseBusiness`
- `CalendarCog`
- `DatabaseZap`

第一版推荐 `CalendarCog` 或 `BriefcaseBusiness`，保持 `PBS` 作为管理端入口，不与现有 `Live` 的 `CalendarDays` 完全重复。

### 3. 内容分发新增 PBS View

在 `gantt/src/components/shell/app-shell.tsx` 的 `ModuleView` 中增加：

```tsx
if (module === 'pbs') return <PbsView />
```

新增文件：

```text
gantt/src/components/pbs/pbs-view.tsx
```

`PbsView` 只读取 `activePbsItem`，第一版只处理 `period`：

- `activePbsItem === 'period'` 时渲染 `Period` 空白/占位内容。
- 未知 item 返回同一占位，避免后续状态异常导致白屏。

### 4. 左侧子导航新增 PBS 菜单

在 `gantt/src/components/shell/shell-sidebar.tsx` 中新增 PBS 菜单定义：

```typescript
interface PbsMenuItem {
  item: ActivePbsItem
  label: string
  Icon: React.ElementType
}

const PBS_MENU: PbsMenuItem[] = [
  { item: 'period', label: 'Period', Icon: CalendarDays },
]
```

在 sidebar body 中新增：

```tsx
{activeModule === 'pbs' && (...)}
```

展示规则沿用 `rule`、`system`、`data` 的当前样式：

- 展开态显示 section title 和文字。
- 折叠态显示 icon + tooltip。
- 当前选中项使用 `border-sidebar-primary bg-sidebar-accent font-semibold`。
- 点击 `Period` 调用 `setPbsItem('period')`。

建议 sidebar 分组标题：

```text
PBS Admin
```

### 5. Sidebar 默认行为

PBS 是管理端模块，点击后应保留左侧子导航可见。

`applySidebarForModule()` 中对 `pbs` 的处理建议与 `data`、`rule`、`system` 一致：

- 默认 `expanded`
- 不隐藏
- 不自动折叠

如果用户手动折叠/隐藏，则沿用当前 `sidebarUserOverride` 规则，不强制覆盖用户选择。

### 6. Period 占位页面

第一版 `Period` 只做页面骨架，避免让用户误以为功能已完成。

建议右侧内容：

- 标题：`PBS Period`
- 内容区先保持空白，后续再逐步加真实功能。
- 不出现表格、按钮、假的数据、不可用表单。

页面布局应简洁，遵循 Gantt 管理端工作台风格：

- 全宽工作区。
- 不做营销式 hero。
- 不嵌套大卡片。
- 文案克制，后续有真实功能后再替换。

## 文件范围

预计修改：

```text
gantt/src/stores/shell-store.ts
gantt/src/components/shell/shell-top-nav.tsx
gantt/src/components/shell/app-shell.tsx
gantt/src/components/shell/shell-sidebar.tsx
gantt/src/components/pbs/pbs-view.tsx
```

不修改：

```text
pbs-portal/
pbs-server/
live-server/
sql/
```

## 验收标准

1. Gantt 顶部导航出现 `PBS`。
2. `PBS` 位于 `Dev` 左边。
3. 点击 `PBS` 后打开 PBS tab，并将 `activeModule` 切换为 `pbs`。
4. PBS tab 行为与其他静态 tab 一致：
   - 可以加入 `openTabs`。
   - 多 tab 时可以关闭。
   - 切换到其他 tab 再回来，PBS tab 保持挂载。
5. 左侧 sidebar 显示 PBS 子导航。
6. 子导航第一项为 `Period`，默认选中。
7. 点击 `Period` 不报错，右侧显示 Period 空白/占位页。
8. 页面不请求 PBS Portal，不打开新窗口，不跳转外部地址。
9. 不新增任何后端 API 调用。
10. TypeScript 编译通过。

## 验证计划

实现后建议执行：

```bash
cd /Users/lei/Codehub/rois-ai/gantt
npx tsc --noEmit
```

手工验证：

1. 启动 `live-server` 与 `gantt`。
2. 登录 Gantt。
3. 点击顶部 `PBS`。
4. 确认左侧出现 `Period`。
5. 点击 `Period`。
6. 切换到 `Live`、`Data` 等 tab，再回到 `PBS`。
7. 多 tab 场景下关闭 `PBS`，确认不会影响其他 tab。

## 风险与注意事项

- `shell-store` 使用 localStorage 持久化，如果用户本地已有旧状态，新增 `pbs` 后要保证读取异常时安全回退。
- 顶部导航项较多，新增 `PBS` 后可能进一步挤压右侧用户信息和版本号区域；第一版先沿用当前样式，如出现窄屏拥挤再单独设计 overflow。
- `KnownModule` 虽然只是类型辅助，但 `ActiveModule` 当前是 `string`，仍应把 `pbs` 加入 `KnownModule` 方便后续静态模块维护。
- 本次只做导航骨架，Period 业务功能必须后续单独设计，不在本次实现里顺手添加。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 Gantt Shell 导航、store 和一个空白模块，文件少且耦合紧，单人实现更稳。
- Suggested split: 不拆分。
- Write boundaries: `gantt/src/stores/shell-store.ts`、`gantt/src/components/shell/*`、`gantt/src/components/pbs/*`。
- Conflict risk: 多人同时改 `shell-store`、`app-shell`、`shell-top-nav`、`shell-sidebar` 容易冲突。
- Execution gate: 用户确认本 spec 后再进入实现。
