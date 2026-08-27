# PBS Search Pairings 结果卡片与日历弹窗对齐设计

## 阅读说明

这份 spec 用于确认 `Pairing` 页面进入 `Search Pairings` 后，搜索结果卡片里的 pairing detail 展示如何与左侧 `BIDDING CALENDAR` pairing 弹窗保持一致。本文只描述设计，不包含代码实现。

## 背景

我们之前已经把左侧日历上的 pairing 弹窗改成 Gantt 对齐格式：

- 摘要区展示 `Start / Base / Composition / Total Credit / Total BH / Total DP`
- 明细表头展示 `QUAL / ALN / Flight / Fleet / ACC / Ref / DEP / PCK / RPT / STD / ATD / ARR / STA / ATA / DRP / GT / BH / FT / MRT / Duty`
- `Credit / BH / Composition` 等字段使用真实数据，不使用死数据

但 `Pairing` 页面点击 `SEARCH PAIRINGS` 后，搜索结果卡片仍然是旧格式：

- 摘要只展示 `BASE / REPORT / PRIORITY / PRIORITY`
- 明细表头仍是 `DUTY DATE / FDP / F/H / D/H / CRD / FLTN / DPS / ARS / DEP / ARR / BLKT / EQP`
- Pairing 编号 badge 里还有一个白色小方块，看起来像 checkbox 或状态标记，但实际没有业务含义

这会造成同一个 pairing 在两个入口看起来像两套系统，用户会怀疑字段含义和数据是否一致。

## 当前代码位置

### Search Pairings 结果卡片

- 文件：`pbs-portal/src/features/pairing/components/pairing-detail-card.tsx`
- 组件：`PairingDetailCard`
- 当前旧表头位置：`PairingDetailCard` 内的 `legHeader`
- 白色小方块：`styles.pairingBadgeSquare`
- 样式：`pbs-portal/src/features/pairing/components/pairing-search-panel.module.css`

### 左侧日历 pairing 弹窗

- 文件：`pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx`
- 组件：`PairingCalendarCompactDetail`
- Gantt 对齐表头：`LEG_COLUMNS`
- Gantt 对齐取值：`getGanttLegValues`

### 数据结构

两边都使用 `PairingSearchResult`。

`PairingSearchResult` 已经包含 Search 结果卡片需要的 Gantt 对齐字段，例如：

- `startDateLabel`
- `compositionLabel`
- `totalCredit`
- `totalBlock`
- `totalDp`
- `leg.ganttQual`
- `leg.ganttAirline`
- `leg.ganttFlight`
- `leg.ganttFleet`
- `leg.ganttAcc`
- `leg.ganttRef`
- `leg.ganttPickup`
- `leg.ganttReport`
- `leg.ganttStd`
- `leg.ganttAtd`
- `leg.ganttSta`
- `leg.ganttAta`
- `leg.ganttDropoff`
- `leg.ganttGroundTime`
- `leg.ganttBlockHour`
- `leg.ganttFlightTime`
- `leg.ganttMinimumRest`
- `leg.ganttDuty`

所以这不是后端缺字段问题，而是前端 `Search Pairings` 结果卡片还没有同步使用这套展示字段。

## 目标

- `Search Pairings` 结果卡片的 pairing detail 与左侧日历弹窗展示一致。
- 用户在两个入口看到同一个 pairing 时，摘要字段、表头、时间/credit 表达方式一致。
- 删除 pairing badge 中没有业务含义的白色小方块。
- 不改变搜索接口、不改变筛选逻辑、不改变添加 pairing 的业务逻辑。
- 保持 `ADD PAIRING` 操作和 mini calendar 高亮行为不回退。

## 非目标

- 不重新设计整个 `Search Pairings` 页面布局。
- 不改 pairing search API。
- 不改 pool count、rank/base/RP filter 逻辑。
- 不改左侧日历弹窗业务行为。
- 不引入新的 UI 依赖。

## 问题拆解

### 1. 两个入口字段语义不一致

左侧弹窗已经向 Gantt 对齐，Search 结果仍停留在简化字段。比如：

- 左侧弹窗显示 `Composition CA(1)FO(1)`，Search 结果不显示。
- 左侧弹窗显示 `Total Credit / Total BH / Total DP`，Search 结果只显示 `TBLK / TCRD / TPAY`。
- 左侧弹窗表头包含 `QUAL / ALN / ACC / Ref / PCK / RPT / ATD / ATA / GT / MRT / Duty`，Search 结果没有。

这会让用户觉得 Search 结果不完整，或者和弹窗数据不是同一来源。

### 2. 白色小方块没有业务含义

`_pairingBadgeSquare_...` 对应的是：

```tsx
<span className={styles.pairingBadgeSquare} />
```

它只是装饰，没有点击行为、没有状态含义、没有 aria label。放在 pairing number 前面容易被误解成：

- 可勾选 checkbox
- 状态标记
- pairing 类型标识

因此建议删除。

### 3. 代码重复导致后续继续不同步

左侧弹窗有一套 `LEG_COLUMNS / getGanttLegValues / formatCompactDuration`。

Search 结果卡片有另一套旧 `legHeader / legRow / summaryRow`。

如果继续各自维护，下次改字段或格式时还会漏一边。

## 方案对比

### 方案 A：只在 Search 卡片里复制左侧弹窗字段

做法：

- 直接修改 `PairingDetailCard`。
- 把表头替换成左侧弹窗同款。
- 复制 `getGanttLegValues` 和格式化函数。

优点：

- 改动最小。
- 不影响左侧弹窗。

缺点：

- 复制逻辑，后续容易再次不同步。
- 同样字段在两个文件各维护一套。

结论：不推荐，只适合临时修。

### 方案 B：抽共享 compact detail 组件（推荐）

做法：

- 新增共享组件，例如：
  - `pbs-portal/src/features/pairing/components/pairing-compact-detail.tsx`
- 把 Gantt 对齐的：
  - summary fields
  - leg columns
  - leg value mapping
  - duration/date formatting
  - empty legs state
  抽到这个组件内。
- 左侧日历弹窗和 Search 结果卡片都使用这个共享组件。
- `Search Pairings` 卡片外层仍保留自己的：
  - `ADD PAIRING` 按钮
  - mini calendar
  - result card layout

优点：

- 真正保证两个入口显示一致。
- 后续字段调整只改一个地方。
- 组件职责清晰：共享组件负责 pairing detail 内容，页面组件负责外壳和交互。

缺点：

- 需要移动一部分代码。
- 需要更新两边测试，避免抽取时破坏弹窗。

结论：推荐。它是最小但正确的长期方案。

### 方案 C：把 Search 结果卡片完全改成弹窗样式

做法：

- Search 结果卡片整体视觉完全模仿弹窗中的 pairing detail card。
- 右侧 mini calendar 和按钮位置也重新排。

优点：

- 页面视觉更统一。

缺点：

- 改动范围较大。
- 可能影响 Search 结果列表的信息密度和滚动体验。
- 当前用户只要求内容对齐，不要求整体重做。

结论：不作为第一阶段。

## 推荐方案

采用方案 B：抽共享 `PairingCompactDetail`，让 Search 结果卡片和左侧日历弹窗使用同一套 pairing detail 内容。

## 目标展示

### Search Pairings 结果卡片

结果卡片保留现在的外层结构：

- 左侧：pairing detail 内容
- 右侧：mini calendar
- 顶部：pairing number badge + `ADD PAIRING`

但 detail 内容改成：

```text
E4101   Start Jun 5, 2026   Base YEG   Composition CA(1)FO(1)   Total Credit 6:09   Total BH 6:09   Total DP -

QUAL  ALN  Flight  Fleet  ACC  Ref  DEP  PCK  RPT  STD  ATD  ARR  STA  ATA  DRP  GT  BH  FT  MRT  Duty
FLY   F8   827     7M8    D    -    YEG  06:00 06:00 06:47 06:47 YVR 08:45 08:45 -    0:38 1:58 1:58 -    -
...
```

### 白色小方块

删除。

Pairing badge 只显示：

```text
EB8052
```

不再显示一个没有含义的白色 square。

## 组件设计

### 新增共享组件

建议新增：

```text
pbs-portal/src/features/pairing/components/pairing-compact-detail.tsx
```

职责：

- 接收 `PairingSearchResult`
- 渲染 Gantt 对齐的 summary 和 legs table
- 处理 duration/date fallback
- 处理 no legs empty state
- 不包含 `ADD PAIRING` 按钮
- 不包含 mini calendar
- 不处理 Search 页面业务动作

建议 props：

```ts
type PairingCompactDetailProps = {
  result: PairingSearchResult;
  className?: string;
};
```

### Search Pairings 使用方式

`PairingDetailCard` 保留：

- result card 外框
- pairing number badge
- `ADD PAIRING` 按钮
- mini calendar

把旧的 `metaRow / legsTable / summaryRow` 替换为：

```tsx
<PairingCompactDetail result={result} />
```

### 左侧日历弹窗使用方式

`PairingCalendarBidDetailDialog` 删除内部私有的 `PairingCalendarCompactDetail`，改用共享组件：

```tsx
<PairingCompactDetail key={result.id} result={result} />
```

这样两个入口内容天然一致。

## 数据格式规则

沿用左侧弹窗已经确认过的格式：

- `Start`：优先用 `result.startDateLabel`，否则从 `activeDates[0]` 格式化
- `Base`：`result.base`
- `Composition`：`result.compositionLabel`
- `Total Credit`：`formatCompactDuration(result.totalCredit)`
- `Total BH`：`formatCompactDuration(result.totalBlock)`
- `Total DP`：`formatCompactDuration(result.totalDp ?? "")`
- leg 列优先使用 `gantt*` 字段，缺失时 fallback 到旧字段
- 空值统一显示 `-`

## 样式原则

- Search 结果卡片外层不大改，避免影响滚动密度。
- Pairing detail 内部保持与弹窗同样的字体大小、表头、列宽和 fallback。
- 删除白色 square 后，badge 左右 padding 适当保留，避免 pairing number 太挤。
- 表格可以横向滚动，不能压缩到字段不可读。
- mini calendar 仍在右侧，继续展示 active dates。

## 测试策略

### Vitest

更新或新增：

- `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`
- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`
- `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx`

覆盖：

- Search results 显示 `Composition`
- Search results 显示 `Total Credit / Total BH / Total DP`
- Search results 表头包含 `QUAL / ALN / Flight / Fleet / ACC / Ref / PCK / RPT / STD / ATD / STA / ATA / GT / BH / FT / MRT / Duty`
- Search results 不再显示旧表头 `DUTY DATE / FDP / F/H / D/H / CRD / FLTN / DPS / ARS / BLKT / EQP`
- Search results badge 不再渲染白色 square
- 左侧弹窗仍显示同一套字段

### Playwright

更新或新增 PBS Portal E2E：

- 打开 `Pairing`
- 进入 `Search Pairings`
- 找到一个结果卡片
- 断言 Gantt 对齐表头可见
- 断言 `Composition / Total Credit / Total BH / Total DP` 可见
- 断言 `ADD PAIRING` 仍可见
- 断言 mini calendar active dates 仍可见

建议优先扩展：

```text
e2e/tests/pbs-portal/pairing-search.spec.ts
```

如果当前 mock 更适合，也可以补充在现有 Search Pairings 相关 E2E 中。

### UI 标准验证

- `npm run check:ui`
- `pbs-portal pnpm lint`
- `pbs-portal pnpm build`
- `pbs-portal pnpm test`
- 相关 PBS Portal Playwright

## 验收标准

- `Search Pairings` 结果卡片内容与左侧日历 pairing 弹窗字段对齐。
- Search 卡片不再显示没有含义的白色 square。
- Search 卡片不再显示旧表头。
- `ADD PAIRING` 功能不回退。
- mini calendar 高亮不回退。
- 左侧日历弹窗显示不回退。
- 自动化测试覆盖 Search 卡片和日历弹窗两边。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动集中在 `pbs-portal` 前端两个紧密相关组件和对应测试。抽共享组件会同时影响 Search 结果卡片和日历弹窗，多 agent 并行容易编辑同一文件并产生冲突。
- Suggested split: 不建议拆分；单个实现者顺序完成共享组件抽取、两边接入、测试和验证即可。
- Write boundaries: `pbs-portal/src/features/pairing/components/*`、`pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx`、相关 tests、E2E、QA 文档、版本号。
- Conflict risk: Medium；主要风险来自抽取弹窗已有逻辑时影响已通过的 pairing popup 测试。
- Execution gate: 用户确认本 spec 后再实现。

## 实施顺序建议

1. 新增 `PairingCompactDetail` 共享组件。
2. 从 `PairingCalendarBidDetailDialog` 迁移 Gantt 对齐列、值映射和格式化逻辑。
3. 让左侧日历弹窗使用共享组件，确保现有弹窗测试不变。
4. 让 `PairingDetailCard` 使用共享组件。
5. 删除 `pairingBadgeSquare` DOM 和 CSS。
6. 更新 Search Pairings Vitest。
7. 更新 PBS Portal Playwright。
8. 更新 QA 测试用例和 PBS 前端版本号。

## 风险与注意事项

- Search 卡片比弹窗更窄，Gantt 对齐表格需要横向滚动，不能强行压缩列宽。
- 如果某些接口返回缺少 `gantt*` 字段，必须 fallback 到旧字段，不能显示空白。
- 删除白色 square 时不要影响 `ADD PAIRING` 按钮布局。
- 抽共享组件时不要改变左侧弹窗已确认的显示格式。
