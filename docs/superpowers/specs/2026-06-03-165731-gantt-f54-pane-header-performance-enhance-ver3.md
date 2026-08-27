# Gantt F54 Pane Header Performance Suggestions

> 2026-06-03 · enhance-Ver3 · read-only recommendation after commit `846a018` / F54

## Scope

This document captures performance enhancement suggestions for the F54 pane-header refinement:

- Commit: `846a018` (`feat: move gantt timeline into pane title row; chips + actions into old band`)
- Area: Gantt pane chrome, pane header canvas, `TimeAxis`, `PaneToolbar`, `PaneConditionStrip`
- Goal: improve large-data scroll smoothness, especially horizontal scroll, without changing behavior

No implementation is included in this document.

## F54 Performance Impact Summary

F54 is directionally positive for performance because the main pane canvas no longer draws the full timeline header on every content render. `PaneCanvas` now calls `drawHeaderBand(...)` instead of `drawTimelineHeader(...)`, and the old canvas-side header drag overlay was removed.

The main performance risk moved from the content canvas into pane chrome:

- each pane now embeds a `TimeAxis` in `PaneToolbar`;
- `TimeAxis` still redraws on shared Gantt view changes such as `scrollX`, `pxPerHour`, and `dirty`;
- pane components still subscribe to scroll state, so scroll can re-run React render work around toolbar/strip/chips;
- some header-wheel paths still call global `markDirty()`, causing more panes to redraw than necessary.

## Suggested Enhancements

| id | priority | category | problem | evidence | proposed_change | impact | effort | risk | verify |
|---|---|---|---|---|---|---|---|---|---|
| F54-P01 | 1 | performance | Header-wheel vertical scroll still marks the whole Gantt view dirty. | `roster-pane.tsx`, `pairing-pane.tsx`, and `flight-pane.tsx` header wheel handlers call `setViewport(...)` and then `useGanttViewStore.getState().markDirty()`. `PaneCanvas` already redraws the owning pane when its own `scrollY` changes. | Remove the global `markDirty()` from pane header wheel handlers and rely on pane-scoped `scrollY` redraw. Keep explicit dirty only for actions that affect shared horizontal/time state or selection. | high - avoids all-pane redraws during left-header vertical scrolling, which matters with multiple panes open and large row counts. | S | Header and right canvas can desync if `PaneHeaderCanvas` depends on global dirty instead of pane `scrollY`; verify wheel scroll over left header keeps left/right rows aligned in roster, pairing, and flight panes. | Playwright scroll-sync test plus render stats proving only the active pane redraws. |
| F54-P02 | 2 | performance | Timeline drawing recomputes date boundaries and labels on every axis redraw. | `drawTimelineHeader(...)` calls `localDayBoundaries(rangeStart, rangeEnd, timezone)` and loops day/hour ranges each render. After F54, each pane has its own `TimeAxis`, so repeated redraw cost can multiply by pane count. | Cache the timeline model by `rangeStart`, `rangeEnd`, `timezone`, and zoom bucket; derive visible day/hour slices from `scrollX` and `canvasWidth` before drawing. Avoid `new Date(...)` inside hot loops where epoch milliseconds are enough. | high - reduces horizontal scroll CPU in every pane toolbar; most useful for wide date ranges and multi-pane layouts. | M | Incorrect cache keys can show stale labels after timezone/date-range changes; verify timezone switch, zoom-to-month, drag zoom, double-click reset, and range changes. | Measure FPS/long tasks during 3,000px horizontal scroll before/after. |
| F54-P03 | 3 | performance | Scroll state can re-render pane chrome even when only the canvas needs fresh scroll values. | Pane components subscribe to `scrollY` and `scrollX`, then return `PaneToolbar`, `PaneConditionStrip`, `PaneHeaderCanvas`, and `PaneCanvas`. Roster also derives `viewportLeftDate` from `scrollX`. | Split scroll-sensitive canvas/header pieces from static chrome, or memoize `PaneToolbar` and `PaneConditionStrip` after stabilizing their props. Move frequently changing scroll reads into refs or canvas-only children where possible. | medium-high - reduces React work during scroll, especially with chips, toolbar badges, and multiple panes. | M | Over-memoization can leave badge/chip state stale; verify filter chips, sort chips, loaded counts, quick filter state, close/settings buttons, and drag handles update correctly. | React Profiler should show pane chrome not committing on every scroll frame. |
| F54-P04 | 4 | performance | `PaneConditionStrip` receives unstable inline callbacks, limiting memoization benefits. | The panes pass inline functions such as `onQueryModeToggle={() => ...}`, `onQuickFilterToggle={() => ...}`, and inline `onRemoveFilter` handlers. | Wrap condition-strip callbacks in `useCallback`, then wrap `PaneConditionStrip` in `React.memo`. Keep chip arrays memoized. | medium - lowers DOM/chip render churn after F54 moved chips into an always-mounted overlay. | S | Missing dependencies can produce stale query mode or stale remove handlers; verify replace/append toggle, chip removal, sort dialog opening, quick filter toggle, and pane close. | React Profiler should show no condition-strip commit on plain horizontal scroll. |
| F54-P05 | 5 | quality/performance | Month label hit regions are shared globally across all `TimeAxis` instances. | `monthLabelHits` is a module-level mutable array reset inside `drawTimelineHeader(...)`, while F54 creates one `TimeAxis` per pane toolbar. The last-rendered axis owns the global hit list. | Replace the global `monthLabelHits` with a per-axis ref returned or filled by `drawTimelineHeader(...)`, and have each `TimeAxis` use its own hit regions for click detection. | medium - mostly correctness, but it removes cross-axis mutable coupling during frequent redraws. | S-M | Month-click zoom could stop working if hit regions are not populated before interaction; verify month-click on each visible pane axis. | E2E month-click zoom for roster, pairing, and flight toolbar axes. |
| F54-P06 | 6 | performance | Condition strip chip layout can still do unnecessary wrapping work in a fixed 30px band. | `PaneConditionStrip` uses `flex-wrap` inside a 30px overlay; with many chips, hidden wrapped rows can still cost layout. | Use nowrap for the visible strip and collapse overflow into a `+N` menu or popover. Keep visible chip count bounded. | medium for heavy filter/sort sessions; low for normal chip counts. | M | Users may lose quick visibility into all filters if overflow affordance is poor; verify keyboard/mouse access to all chips and clear/remove actions. | Layout profiling with many filter/sort chips; visual checks at narrow pane widths. |

## Recommended Order

1. Do `F54-P01` first. It is small and directly targets unnecessary all-pane redraws during left-header vertical scrolling.
2. Do `F54-P02` next for horizontal smoothness, because every toolbar `TimeAxis` currently repeats date-boundary and label work.
3. Do `F54-P03` and `F54-P04` together so pane chrome stops committing during scroll.
4. Do `F54-P05` as a correctness cleanup before adding more TimeAxis interactions.
5. Do `F54-P06` if real users often have many active filter/sort chips.

## Benchmark Targets

Use representative large data before claiming success:

- crew roster: 5,000 crew
- pairings: 10,000 pairings
- flights: 5,000 flights
- panes open: roster main, pairing, flight

Suggested measurements:

- horizontal scroll FPS over a 3,000px left/right scroll
- vertical scroll FPS over each pane and over each left header
- long tasks greater than 50ms
- React commits during scroll
- number of pane canvas renders per scroll frame
- JS heap after initial load and after 60 seconds of scrolling

Target behavior:

- horizontal scroll should not commit static pane chrome on every frame;
- left-header vertical wheel should redraw only the active pane;
- timeline axis work should scale with visible ticks, not full date range times pane count.

---

## Execution Record（2026-06-03 · F55 · 已实施）

| id | 状态 | 实施摘要 |
|----|------|---------|
| F54-P01 | ✅ 已实施 | 三个 pane 的 header-wheel / canvas-wheel 纵向滚动不再 `markDirty()`（横向 `scroll(dx,0)` 仅在 dx≠0 时调用，由 store 自己置 dirty）。**规格修正**：`PaneHeaderCanvas` 此前只靠全局 dirty 重绘（RAF effect 无 scrollY 触发）——即规格 risk 栏所述风险是现状而非假设；已为其补上 pane-scoped scrollY 重绘 + `<paneId>:header` 绘制回执。 |
| F54-P02 | ✅ 已实施 | `localDayBoundaries` 按 (range, timezone) 记忆化（容量 16）；`getTimezoneOffset` 的 `Intl.DateTimeFormat` 按时区缓存；`drawTimelineHeader` / `drawGridLines` 小时循环按可见窗口裁剪（保持 midnight 锚点对齐）；热路径 `timeToX(new Date(ms))` → `msToX` 纯算术。 |
| F54-P03 | ✅ 已实施 | roster-pane 改订阅「日桶时间戳」替代裸 scrollX/pxPerHour（横向滚动不再每像素重渲染整个 pane）；getHitTest / interactionCallbacks 改读 getState()（消除每帧 identity 变化导致的交互 handler 重挂载）；`PaneHeaderCanvas.visibleColumns` useMemo（此前每次 React 重渲染都强制左表头整画布重绘）；`PaneToolbar` / `PaneConditionStrip` React.memo。 |
| F54-P04 | ✅ 已实施 | 三个 pane 的 strip 回调全部 useCallback、quickFilterChips useMemo。附带修复：`setHoveredCrew` 补 QW5 同值守卫（此前左表头每次 mousemove 全面板重绘）。 |
| F54-P05 | ✅ 已实施 | `monthLabelHits` 模块级全局数组移除；`drawTimelineHeader(rc, hitsOut)` 出参，每个 TimeAxis 持有自己的 hits ref。 |
| F54-P06 | ✅ 已实施（第二轮 F56） | strip 改单行 nowrap + overflow-hidden；被裁剪 chips 折叠为「+N」按钮，点击弹出 popover 列出**全部** chips（含移除按钮，规格 risk 中的可达性已被 e2e 证明）；溢出计数用 getBoundingClientRect + ResizeObserver。 |

### 测量结果（§No-Illusion 实测）

- 微基准（npx tsx，92 天范围 / America/Toronto，×1000 次）：
  - `localDayBoundaries`：**4910.7ms → 0.2ms**（缓存命中；改前每次调用 ≈4.9ms，即每帧每 pane 4 个绘制函数 ≈20ms —— 非 UTC 时区下直接吃光帧预算）
  - `getTimezoneOffset`：43.4ms → 4.4ms（≈10×）
- e2e 横向滚动 150 帧墙钟时间（demo 数据集 100 crew 窗口）：改前后均 ≈13.3ms/帧、0 long task —— 该数据集下两版都被 vsync 限制，墙钟无差异；收益体现在 CPU 余量与大数据/非 UTC 场景（本环境无法 seed 5000 crew，未按规格基准量测）。
- 新增 e2e `pane-header-performance.spec.ts`（3 用例全绿）：左表头/画布纵向滚轮仅本 pane 的 content+header 画布重绘（绘制回执计数，pairing 计数零增量）；roster/pairing 各自 TimeAxis 月份点击缩放可用。
- 全量 gantt 套件：110 passed；3 fail = scenario-run（既有，已 stash 验证）+ tunnel @local（既有环境）+ query-filter（并发 flake，单独运行通过）。

### 第二轮执行（2026-06-03 · F56 · "more to check and execute"）

第一轮遗留项补全：

- **P03 全 pane 扫尾**：pairing/flight 此前仍订阅裸 `scrollX`/`pxPerHour` 镜像进 ref（每个横向滚动像素整 pane 重渲染）→ 改为事件时 getState() 读取，删除订阅与 ref。
- **P03/P04 verify 落地（替代手工 React Profiler）**：test hook 新增 `chromeCommits()`（PaneToolbar/PaneConditionStrip render-body 计数，生产 no-op）；e2e 断言横向+纵向滚动期间 4 个 chrome 计数零增量。
- **该断言抓出两个真实泄漏并修复**：
  1. `PaneWrapper` 订阅整个 pane 对象（每次 setViewport 都换 identity）→ 每个滚动 tick 重渲染并重建 onDragStart/onClose 闭包，击穿整条 memo 链 → 改订阅 `pane.type` 字符串 + dragProps useMemo。
  2. `layout-store.setViewport` 无 no-op 守卫（clamp 后零增量也重建 Map/pane 对象）→ 补值相等早退。
- **P06 实施**（见上表）+ 新 e2e `pane-chips-overflow.spec.ts`（760px 窄视口 7 chips：+N 出现且计数正确、popover 全量列出 7 chips、popover 内移除生效（activeCrewFilter 真值）、点击外部关闭）。
- 既有用例加固：chips-in-band 断言改为 poll canvas 回位（消除 2px PaneLoadingBar 暂态 flake，crew-store loading 不在 `loading()` 暴露范围内）。
- 全量 gantt 套件：**113 passed**；2 fail 均为既有环境项（scenario-run、tunnel @local）。
