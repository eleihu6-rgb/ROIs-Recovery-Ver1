# Gantt 排班前端开发规范

排班员操作界面，端口 5173。

## 技术栈

- React 19 + Vite + TypeScript
- 状态管理：Zustand
- UI 组件：`@rois/ui`（shadcn/ui + Tailwind CSS）
- Gantt 渲染：Canvas 自研

## 目录结构

```
src/
├── components/
│   ├── common/           # 通用组件（TimezoneSwitcher, ThemeSwitcher, ZoomControl 等）
│   ├── layout/           # 布局组件（app-layout, filter-dialog 等）
│   ├── shell/            # Shell 架构（app-shell, gantt-sub-toolbar 等）
│   └── [feature]/        # 本项目特有的功能组件（基于 @rois/ui 组合）
├── hooks/               # 自定义 hooks
├── stores/              # Zustand 状态管理
├── services/            # API 请求（axios）
├── types/               # 类型定义
├── locales/             # 业务文本国际化（通用文本在 @rois/ui）
├── utils/               # 工具函数
├── App.tsx
└── main.tsx
```

## 特有规范

- Gantt 核心渲染使用 Canvas，外围控件（工具栏、筛选、弹窗）使用 `@rois/ui` 组件
- 法规检查通过 `ruleSetId` 实现用户隔离，每个用户可选择独立法规集合
- 业务国际化文本放 `src/locales/`，通用 UI 文本从 `@rois/ui` 的 i18n 获取

## 工具栏组件

GanttSubToolbar（`src/components/shell/gantt-sub-toolbar.tsx`）包含以下组件：

| 组件 | 位置 | 说明 |
|------|------|------|
| DateRangePicker | 左侧 | 日期范围选择 |
| RefreshBtn + FilterBtn | 左侧 | 刷新、筛选 |
| DraftToolbar | 中部 | Undo/Redo/Save |
| ZoomControl | 中部 | 缩放控制 |
| RuleGroupSelector | 中部 | 法规集合选择 |
| TimezoneSwitcher | 中部 | 时区切换（详见下文） |
| PaneToggles | 右侧 | Roster/Pairing/Flight 面板开关 |

### §Pane-Toolbar-Home — 数据/动作按钮一律进 pane toolbar，禁止为单个按钮另起一整行（强制执行）

> 本系统是高密度航空运行界面（§First-Paint / Jeppesen 风格），**垂直空间是稀缺资源**。pane 上的
> 数据 / 动作类控件（Recheck、告警铃、质量 Gauge、Filter、Sort、Settings 等）都属于**该 pane 的
> toolbar 右侧 icon cluster**，**禁止**为任何单个按钮新建一条横向 band，也**禁止**把它散到顶部
> 视图 chrome 里。

**铁律**：

- pane 数据/动作按钮的唯一归处是 **pane toolbar 的右侧 icon cluster**——即 `pane-condition-strip.tsx`
  里铃铛（alert）/ Gauge（quality）/ Filter / Sort / Settings 那一排（Live 与 Scenario 共用此 strip）。
  新的 pane 级动作（如 Recheck）就加在这排，与它语义相邻的图标（Recheck 紧挨告警铃）放一起。
- **禁止**在顶部工具栏与甘特网格之间、或 pane 与 pane 之间，塞一条只为放 1 个按钮的 `<div>` band。
  一行只承载单个右对齐按钮 = 浪费整条竖向空间 = 样式 bug（违反 §First-Paint 高密度原则）。
- 顶部 `gantt-sub-toolbar.tsx` / `scenario-gantt-toolbar.tsx` 只放**视图级 chrome**
  （Zoom / Timezone / Save / 锁定 / pane 开关 / Reset）；**pane 级数据动作不要往顶部塞**，下沉到 pane toolbar。
- **状态/告警提示**（如「Legality may be outdated」param-stale 提示）不构成「需要一整行」的理由：
  做成按钮上的徽章 / 着色 / tooltip（与铃铛的 count 徽章同款），或仅在该状态出现时**临时**内联，
  而不是常驻一条空 band。判定标准：**当提示不出现时，这条 band 会不会变成「只剩一个孤零零的按钮」？**
  会，就不该有这条 band。
- 与 §Gantt-Unify 一致：Live 与 Scenario 的同类按钮落在共享 `pane-condition-strip` 的**同一位置**，
  不要一边进 strip、另一边自建 band。
- **进 cluster 的按钮必须沿用 cluster 既有形态**：pane toolbar 右侧 cluster 里的按钮是统一的
  **纯图标方形按钮**（`relative inline-flex h-5 w-5 items-center justify-center rounded-md
  text-muted-foreground hover:bg-accent/60 hover:text-foreground active:scale-95` + 图标 `h-3 w-3`）。
  新按钮**不要带文字标签**、不要换尺寸/配色——文案放 `title` tooltip，计数/状态用**绝对定位的角标**
  （仿告警铃的 count 徽章：`absolute -right-0.5 -top-0.5`，stale 用 `bg-amber-500` 小圆点）。带文字的
  按钮塞进图标 cluster 会明显出戏，视同样式 bug。

> 教训（2026-06-22）：Scenario gantt 的 Recheck 曾被放进一条专为 param-stale 告警新建的
> `scenario-legality-bar` band，告警不出现时整行只剩一个右对齐的 Recheck 按钮，白白吃掉一整条竖向
> 空间。正解：Recheck 进 pane toolbar 的 `pane-condition-strip` 右侧 cluster（紧挨告警铃），
> param-stale 改为按钮上的徽章 / 着色。

## 时区切换功能

**组件:** `TimezoneSwitcher` (`src/components/common/timezone-switcher.tsx`)

**功能:** 将航班/配对时间显示切换到选定机场时区

**API:** `GET /altair/live/base/timezone-options`（需认证）

**Store:** `useTimezoneStore` (`src/stores/timezone-store.ts`)

```typescript
interface TimezoneStore {
  timezone: string        // IANA zoneId (如 "America/Toronto")
  timezoneAirport: string // 显示代码 (如 "YOW")
  timezoneOptions: TzOption[]
}
```

**数据结构:**
```typescript
interface TzOption {
  airport: string      // 机场代码
  airportName: string  // 机场名称
  zoneId: string       // IANA 时区 ID
  utcOffset: string    // UTC 偏移 (如 "UTC-240")
  isBase: boolean      // 是否航司基地
}
```

**认证流程:**
1. 登录时设置 `api.defaults.headers.common['Authorization']`
2. 页面刷新时从 sessionStorage 恢复 token
3. TimezoneSwitcher 在组件挂载时调用 API（useEffect）
4. 401 错误静默处理，保持默认 UTC

**详细设计:** `docs/modules/gantt/timezone-switcher-design.md`

## E2E 测试

测试用例放在 `e2e/gantt/` 下，按功能分类：
- `auth/` — 登录/权限
- `roster/` — 排班操作（拖拽、增删改）
- `rule-check/` — 法规检查触发和告警展示
- `pairing/` — Pairing 管理
- `filter/` — 数据筛选
- `publish/` — 发布流程和快照对比

## Help 文档编写规范（Help Authoring，强制执行）

> Help 页面（`src/components/help/`）是给真实用户看的操作手册，**准确性高于一切**。
> 测试团队反馈反复出现的问题都是「手册和当前 UI/代码不一致」。下列规则必须遵守。

1. **每条说明都要回到组件代码核对**：字段标签、控件名称、下拉项顺序、上限数值、图标，全部以
   实现代码为准（如 `filter-dialog.tsx`、`ground-task-dialog.tsx`、`timezone-switcher.tsx`、
   `keyboard-shortcuts-dialog.tsx`、`types/layout.ts`）。禁止凭记忆或旧版本描述。
2. **手册用词必须与 UI 自身一致**：以界面里真实出现的文字为单一事实源——例如键盘快捷键页要逐条
   对齐 in-app 快捷键弹窗；表单字段名要用对话框里的标签（`Assignment` / `Group` / `Crew IDs`）。
3. **截图裁剪必须框住正文提到的所有元素**：正文提到的按钮/控件如果不在裁剪区内，要么扩大裁剪区
   （取多个元素 boundingBox 的并集），要么改正文。截图脚本是 `e2e/scripts/capture-help-screenshots.ts`。
4. **截图必须命中目标元素并人工核验**：纯 `div` 弹层没有 `role="menu"`，脚本会静默退化成整页截图。
   给目标加 `data-testid` 并按它定位；截完用 Read 工具肉眼确认 PNG 内容正确（不是整页 / 不是旧 UI）。
5. **每个 Help topic 都要有断言「具体文字」的回归测试**（不是只断言「能渲染」）；带截图的 topic 还要走
   已加载 + `naturalWidth ≥ 200px` 守卫。改 topic 标题时同步更新 spec 里的 nav 标题（§Stale-Test）。
6. **标题要覆盖内容范围**：步骤超出标题语义就改标题或拆分 topic；`help-data.ts` 里的 `stepCount`/
   `overview` 要与正文保持同步。
7. **手册与代码冲突时，若代码才是错的就一并修代码**（如本次 Flight pane 上限 2→1），并按版本规则
   让 `gantt` 的 dev / build / Vite HMR 自动递增 runtime frontend 版本号。
8. **处理测试团队反馈**：产品经理（Ryan）的批注按其答复执行；标注「enhanced / 旧快照」的 session
   要对照当前代码**整段重写**，而不是打补丁。
