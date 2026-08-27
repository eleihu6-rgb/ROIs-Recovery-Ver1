# Canvas 渲染引擎技术细节

## 渲染架构

- **虚拟化渲染**：只渲染可见行和任务块
- **RAF 驱动**：requestAnimationFrame + dirty flag 重绘
- **DPI 适配**：devicePixelRatio 高清屏
- **多 Pane**：每个 Pane 独立 Canvas，共享水平滚动
- **分层渲染**：base → task → overlay

## Dirty Flag 机制

- 数据变化 / 主题切换 / 缩放 / **滚动** → `markDirty()` 设置 `dirty = true`
- 各 Canvas 组件 `useEffect` 监听 dirty → 调度 RAF 重绘
- PaneCanvas 与 PaneHeaderCanvas 各自的 render 跑完都会调 `markClean()`（同一个全局 flag）
- SummaryBar / TimeAxis 不调 markClean

### RAF 调度纪律（重要）

由于 Header canvas 与右侧内容 canvas **共享** `dirty` flag，Header 先完成的 render 会立即 `markClean()` 把 dirty 置回 false。如果内容 canvas 的 effect cleanup 简单地 `cancelAnimationFrame` 已排队的 RAF，就会在它还没 fire 之前就被"对方"的 markClean 连锁取消，导致滚动时右侧画不出来。

`pane-canvas.tsx` 为避免此竞态采用以下规则：

- 用 `if (dirty && !rafRef.current)` 去重，**一次 dirty 周期最多排一个 RAF**
- effect cleanup **不取消** RAF（只有 unmount 的专用 effect 才取消）——pending RAF 不会被对方的 markClean 中断
- RAF 回调第一行就 `rafRef.current = 0`，之后再跑 render —— 若 render 中又触发了 re-render 也不会误排第二个
- 用 `renderRef` 捕获最新的 render 闭包，避免 RAF 使用陈旧的 props

不要把 `scrollY` 加进 RAF effect 的 deps：这样会在每个 wheel tick 触发 cleanup→cancel→reschedule，突发滚动时 RAF 会被连续 cancel 直到用户停手才画一帧。render 函数内部用 `useLayoutStore.getState()` 直接读最新 scrollY 即可。

## 主题色桥接

```
主题切换 → applyThemeToDOM() 修改 :root class
         → markDirty() 触发重绘
         → getGanttColors() 读取 --gantt-* CSS 变量
         → Canvas 用新颜色绘制
```

CSS 变量定义：`packages/ui/src/styles/globals.css`（5 主题 × light/dark）

## 连续缩放

| 参数 | 说明 |
|------|------|
| pxPerHour | 像素/小时，store 直接存储 |
| zoomMin | viewportWidth / totalHours |
| zoomMax | viewportWidth / 24 |
| 步长 | × 1.4 / ÷ 1.4 |

`timeToX(time, rangeStart, pxPerHour)` 直接使用 pxPerHour 参数。

## 锁指示器

- `drawLockIndicator(ctx, x, y, width, height, 'mine'|'other')`
- 蓝色 `#3b82f6` = 当前用户，红色 `#ef4444` = 其他用户
- 2px 下划线在任务块底部

## 违规指示器

- `drawViolationBadge(ctx, x, y, severity)` — 10px 圆 + "!" 符号
- severity 颜色：1-2 黄, 3 橙, 4-5 红

## 关键文件

| 文件 | 职责 |
|------|------|
| `gantt-constants.ts` | 尺寸/颜色常量 + getGanttColors() |
| `pane-canvas.tsx` | 通用 Pane Canvas（RAF + dirty） |
| `pane-header-canvas.tsx` | 左侧固定列 Canvas（含行选择/pin 图标/冻结分隔线） |
| `time-axis.tsx` | 共享时间轴 |
| `renderers/base-renderer.ts` | 背景/网格/今日高亮/now 线/冻结行坐标计算 |
| `renderers/roster-renderer.ts` | Roster 任务块 |
| `renderers/pairing-renderer.ts` | Pairing 块 |
| `renderers/flight-renderer.ts` | Flight 块 |
| `renderers/summary-renderer.ts` | 汇总条 |
| `violation-overlay.ts` | 铃铛图标 |
| `lock-overlay.ts` | 蓝/红下划线 |

## TimeAxis 渲染（drawTimelineHeader）

### 自适应策略

`dayWidth = pxPerHour * 24` 决定显示密度：

- 每天竖线贯穿 header + Gantt 区域对齐
- 上行：月份标签居中（`MMM yyyy`），月份变化时显示
- 下行：按 dayWidth 切换（yyyy-MM-dd / EEE / 数字 / 隐藏）
- 网格线同步：缩小时只画天线（hourStep=24）

### 颜色系统

通过 CSS 变量适配 5 套主题：

| 变量 | 用途 | 亮色 | 暗色 |
|------|------|------|------|
| `--gantt-text-secondary` | 工作日 | 灰色 | 浅灰 |
| `--gantt-text-weekend` | 周末 | #818cf8 | #a5b4fc |
| `--gantt-text-red` | 假日（预留） | #dc2626 | #f87171 |

## Toast 通知（notify.tsx）

4 种语义类型，全部使用主题色：

| 类型 | 颜色 | 图标 | 停留 | 复制按钮 |
|------|------|------|------|---------|
| success | primary | CheckCircle2 | 4s | 无 |
| error | destructive | XCircle | 8s | 有 |
| warning | ring | AlertTriangle | 4s | 有 |
| info | muted | Info | 4s | 无 |

复制按钮：优先 navigator.clipboard，fallback execCommand('copy')。
点击后图标变 ✓ 绿色 1.5 秒。
