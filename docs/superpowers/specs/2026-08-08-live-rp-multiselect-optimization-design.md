# Live Toolbar RP Multi-Select 优化设计

- 日期：2026-08-08
- 模块：gantt（Live toolbar）＋ live-server（`GET /api/roster-periods`）
- 状态：Design approved（用户 2026-08-08 确认）

## 背景

Live Gantt Toolbar 上的 RP 多选控件（`gantt/src/components/common/rp-multi-select.tsx`）当前行为：

- 选项来自共享 store（`useRosterPeriodStore`），一次性加载 `GET /api/roster-periods` 返回的窗口
  （`current − RP_SELECT_BACK_COUNT(6) ~ current + RP_SELECT_FORWARD_COUNT(6)`，默认 13 个 RP）。
- 选择上限是**数量**上限：`maxPeriods`（`RP_GANTT_MAX_PERIODS`，默认 5），勾选超过即丢弃本次点击。
- trigger 的选中 chip 显示**数字 id**（如 `8`），且按点击先后顺序渲染（乱序）。
- 选项行只有 `rosterPeriod` 代码（如 `2026RP08`），不显示日期。
- 没有任何分页，历史 RP 早于窗口最早项即不可选（数据实际到 2025-01，深度足够）。

## 需求

1. **Load more 历史**：下拉增加 "Load more" 行，点击往前（更早）加载 12 个 RP 可选项；往未来不增加。
2. **日期显示**：下拉选项显示每个 RP 的**原始**起止区间；trigger 显示当前选中**合并后**的总加载区间（含前后 ±7 天）。
3. **6-RP 跨度控制**：勾选后跨度 `max − min + 1 ≤ 6`。
   - 跨度 ≤ 6：不做自动调整，允许空缺（例：`{01,02,03,04}` + 点 06 → `{01,02,03,04,06}` 不动）。
   - 跨度 > 6：自动重置为以新点选 RP 为锚、向已有选择方向补齐的**连续 6 个 RP** 窗口。
   - trigger 内选中 chip 按时间先后排序。
4. **性能提示**：控件上提示「为了性能，最长跨度 6 个 RP 区间」。

## 关键决策（已与用户确认）

- **共享 store**：load more 加载的历史 RP 追加到 `useRosterPeriodStore`，所有消费方（GO TO RPDate 菜单、`rp-select`、发布/导入对话框、`time-axis` 等约 15 处）都能看到历史 RP。副作用（菜单变长）用户接受。
- **连续补齐**：跨度 > 6 时以新点选 RP 为锚，自动勾选中间空缺，结果始终是连续 6 个 RP。
- **日期显示位置**：选项显示原始区间；trigger 显示合并总区间（含 ±7 天）。

## 架构落点

| 文件 | 改动 |
|------|------|
| `live-server/src/routes/base/roster-periods.ts` | API 增加 `before`/`limit` 分页；响应增加 `maxSpan`/`loadMoreCount`/`hasMore`；移除 `maxPeriods` |
| `live-server/src/__tests__/unit/roster-periods-route.test.ts` | 更新新字段 + 分页用例 |
| `gantt/src/services/roster-period-api.ts` | 类型扩展 + `fetchOlderRosterPeriods` |
| `gantt/src/stores/roster-period-store.ts` | `maxSpan`/`loadMoreCount`/`hasOlder`/`loadOlderRosterPeriods()` |
| `gantt/src/utils/rp-span.ts`（新） | `applyMaxSpan` 纯函数 + 单测 |
| `gantt/src/components/common/multi-select-dropdown.tsx` | 可选 props：选项日期 hint、load-more 行、trigger 汇总区间 + tooltip、chip 按 options 顺序渲染 |
| `gantt/src/components/common/rp-multi-select.tsx` | 组装：span 规则、日期显示、load more、提示 |
| `gantt/src/components/common/__tests__/multi-select-dropdown.test.tsx` | 更新 + 新用例 |
| `e2e/tests/gantt/toolbar-rp-multiselect.spec.ts` | 新用例（load more / 跨度 / 排序 / 日期 / 提示） |

## 后端 API

`GET /api/roster-periods`，两种模式，响应统一：

```ts
interface RosterPeriodsResponse {
  maxSpan: number        // 跨度上限（RP_GANTT_MAX_PERIODS，默认 6）
  loadMoreCount: number  // 每次 load more 批量（RP_SELECT_LOAD_MORE_COUNT，默认 12）
  items: RosterPeriodOption[]  // 升序（rp_start asc, id asc）
  hasMore: boolean       // 是否存在比本批最早更老的 RP
}
```

- **无参**：保持现有窗口查询（back/forward 不变）。`hasMore` = 存在 `rp_start <` 窗口最早项。
- **`?before=<YYYY-MM-DD>&limit=N`**：返回 `rp_start < before` 的最早 `N` 条（升序），`hasMore` = 本批是否未取尽（查询 `N+1` 判定）。`limit` 上限 `loadMoreCount`。
- `maxSpan` 取自 `RP_GANTT_MAX_PERIODS`（默认由 5 改为 6）；`loadMoreCount` 取自新增 `RP_SELECT_LOAD_MORE_COUNT`（默认 12）。两者走 `getSysParamMap`，与现有 `RP_SELECT_BACK_COUNT` 一致，字典缺失时用默认值。
- 移除 `maxPeriods` 字段（唯一消费者就是本控件，同步改为 `maxSpan`）。

### 判定说明

- `is_current` 逻辑、`name` 回退、`asDateOnly` 序列化等保持现状。
- 数据源按 `request.authUser?.schema ?? env.LIVE_SCHEMA`，`asSafeIdentifier` 校验不变。
- `before` 用 `rp_start`（日期，独占比较）；RP 边界互斥，不会重复取到已加载项。

## 前端 span 规则（`applyMaxSpan` 纯函数）

```ts
applyMaxSpan(
  nextIds: string[],   // 点击后的完整选择（含新点选，可能乱序）
  prevIds: string[],   // 点击前的完整选择
  items: RosterPeriodOption[],  // 升序
  maxSpan: number,     // 默认 6
): string[]            // 返回升序的 id 数组
```

算法：

1. 将 `nextIds` 按 `items` 顺序（rp_start 升序）排序，得到有序 id 列表与 `minIndex`/`maxIndex`。
2. 若 `maxIndex − minIndex + 1 ≤ maxSpan` → 返回排序后的 `nextIds`（空缺保留，不做任何自动调整）。
3. 否则：`newlyAdded = nextIds` 中不在 `prevIds` 里的那一个；`anchor = its index`。
4. 两个候选连续窗口（各含 anchor，长度 == maxSpan）：
   - `[anchor − (maxSpan−1), anchor]`
   - `[anchor, anchor + (maxSpan−1)]`
   - 越界时该候选不合法；只取合法的。
5. 选与 `nextIds`（含 prev 共同部分）重叠数最多的；平局取更靠近已有选择（prevIds）的一端。
6. 返回该窗口全部 id（按 items 升序）。

已验证例子：

| 当前选中 | 点选 | 结果 | 说明 |
|---------|------|------|------|
| `{08}` | 01 | `{01..06}` | 01 为最老锚，向前补足 6 |
| `{01,02,03,04}` | 06 | `{01,02,03,04,06}` | 跨度 6，不动 |
| `{01,02,03,04,06}` | 07 | `{02..07}` | 01 去、05 自动补 |
| `{02,03,04,06,07}` | 08 | `{03..08}` | 02 去、05 自动补 |

约束：

- 勾选后从 `nextIds` 中找 `newlyAdded` 时必须先排除「纯移除」场景：若 `nextIds ⊂ prevIds`（本次是取消勾选），跨度只会缩小，直接返回排序结果即可，不触发重置。
- 只对**新增**触发重置；重置结果必定 ≤ maxSpan，数量自然 ≤ 6。

## UI

### 选项行

```
[✓] 2026RP08          08-01 ~ 08-31
```

- 左侧 checkbox + RP 代码；右侧右对齐 `MM-DD ~ MM-DD`（原始 `rpStart ~ rpEnd`），`font-mono tabular-nums text-2xs text-muted-foreground`。
- 展示用 `rpStart`/`rpEnd`（`YYYY-MM-DD` 字符串）直接格式化，不涉及时区转换。

### trigger

- chip 按 `items`（时间）升序渲染，文字显示 RP 代码（如 `2026RP08`）——**从数字 id 修正为代码**。
- 选中非空时，chip 下方加一行小字显示合并总区间：`min(rpStart)−7d ~ max(rpEnd)+7d`（`YYYY-MM-DD ~ YYYY-MM-DD`，mono 小字）。
- trigger 加 `title` tooltip：`Select up to 6 roster periods (max span, for performance)`。

### load more 行

- 位于下拉选项列表顶部（search 框与选项之间），`hasMore` 时显示。
- 文案 `Load earlier RPs`；点击调 `loadOlderRosterPeriods()`，加载中显示 spinner 并禁用。
- 历史耗尽（`hasMore=false`）后隐藏。
- 说明：历史项追加在升序列表顶部，故按钮放顶部；不随 search 过滤隐藏。

### footer

- 在现有 `Clear all / N selected` 行下加一行：`Max 6 RPs span (performance)`（`text-2xs text-muted-foreground/50`）。

## 状态流转

- 首次加载：现 `loadRosterPeriods()` 不变，store 新增 `maxSpan`/`loadMoreCount`/`hasOlder`。
- load more：`loadOlderRosterPeriods()` 用当前最早 `rpStart` 作 `before` 请求，`hasOlder` 更新为响应 `hasMore`，新项 `unshift` 到 `items`（保持升序）。
- 选择变更：`handleChange` 内先 `applyMaxSpan`，再用调整后集合计算 `[min−7d, max+7d]`，走现有 `setSelectedRosterPeriodSelection` + `setDateRange` + `applyGanttFilters` + `zoomToRp` 链路，不新增路径。
- 首次默认选中（含 now 的当前 RP）逻辑不变；load more 只追加 items，不会因 `items` 变化重置选择（`selected.length > 0` 守卫已存在）。

## 测试

### 后端（Vitest）

- `roster-periods-route.test.ts`：
  - 无参响应包含 `maxSpan=6`、`loadMoreCount=12`、`hasMore`。
  - `before`+`limit` 查询：断言 SQL 含 `rp_start < $1`、`order by ... desc limit`，参数正确。
  - `RP_GANTT_MAX_PERIODS` 缺失 → `maxSpan` 默认 6。
  - `RP_SELECT_LOAD_MORE_COUNT` 缺失 → `loadMoreCount` 默认 12。
  - 无当前 RP 时 404 行为保持。

### 前端单元（Vitest）

- 新 `gantt/src/utils/__tests__/rp-span.test.ts`：
  - 上述 4 个例子。
  - anchor 在列表两端（只有 1 个合法候选）。
  - 平局取更靠近已有选择（prevIds）的一端。
  - 纯移除（取消勾选）不触发重置。
  - `nextIds` 乱序输入返回升序。
- `multi-select-dropdown.test.tsx`：
  - chip 按 options 顺序渲染。
  - 选项日期 hint 渲染。
  - trigger 汇总区间渲染（有/无选择）。
  - load-more 行显示/隐藏、点击回调、loading 态。
  - footer 性能提示。

### E2E（Playwright，`toolbar-rp-multiselect.spec.ts`）

- 打开下拉 → 点 `Load earlier RPs` → 选项数比原来多 12（或出现更早的 RP 项）。
- 选满 6 后勾第 7 个更老的 → 断言自动变为连续 6 窗口（具体选项勾选态）。
- trigger chip 数量/内容按时间升序，且显示 RP 代码。
- trigger 显示合并日期区间（含 ±7 天）。
- footer 性能提示可见。

E2E 遵循 §Playwright-Required / §Simulate-User（真实 UI 点击驱动，不直连 API 写业务）。可用现有 `page.route('**/api/roster-periods', ...)` mock 控制返回。

## 可见变化与风险

1. **chip 文字从数字 id → RP 代码**：更清晰；相关 E2E 断言（`toolbar-rp-multiselect-remove-*` 计数不受影响，若有文本断言需同步）。
2. **共享 store 追加历史**：GO TO RPDate 菜单、`rp-select`、发布/导入对话框等一并获得历史 RP（用户确认接受）。
3. **`maxPeriods` → `maxSpan` 字段改名**：同步更新 route 测试；该字段前端仅本控件消费。
4. `MultiSelectDropdown` 为通用组件，新 props 全部可选，filter-dialog / roster-publish / roster-bulk-delete 等既有调用不受影响。
5. 新增字典参数 `RP_SELECT_LOAD_MORE_COUNT`：与现有 `RP_SELECT_BACK_COUNT` 等一致，字典缺失时回落默认 12；不改 `sql/` 下已确认脚本（参数表为数据，走应用层默认）。
