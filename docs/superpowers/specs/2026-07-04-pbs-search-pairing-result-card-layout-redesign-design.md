# PBS Search Pairings 结果卡片布局重设计

## 阅读说明

这份 spec 用于确认 `Pairing > Search Pairings` 结果卡片的视觉布局重设计。本文只描述设计，不包含代码实现。

前一份 spec 已经解决“Search Pairings 结果卡片字段要与左侧日历 Pairing Bid 弹窗对齐”的问题。这次要解决的是新的 UI 问题：字段虽然对齐了，但完整 Gantt 宽表直接塞进搜索结果卡片后，卡片变得别扭、拥挤，并出现横向滚动条。

## 背景

当前搜索结果卡片已经改为使用 Gantt 对齐字段：

- 摘要：`Start / Base / Composition / Total Credit / Total BH / Total DP`
- 明细表头：`QUAL / ALN / Flight / Fleet / ACC / Ref / DEP / PCK / RPT / STD / ATD / ARR / STA / ATA / DRP / GT / BH / FT / MRT / Duty`
- Search 卡片和左侧日历弹窗开始复用同一套 `PairingCompactDetail`

但实际页面展示效果不理想：

- Search 结果卡片左侧要放 pairing 明细，右侧还要放 mini calendar。
- 完整 Gantt 表有 20 列，天然适合弹窗或宽面板，不适合卡片。
- 表格被压缩后，右侧列被截断，只能横向滚动。
- 横向滚动条出现在结果卡片内部，用户扫列表时很不舒服。
- 摘要区换行不稳定，看起来像字段散落在卡片里。

结论：字段对齐是对的，但 Search 卡片不应该直接复用弹窗的完整宽表视觉。

## 当前问题

### 1. Search 卡片承载了不该承载的完整表

完整 Gantt 表的目标是“查详情”，不是“扫列表”。Search 结果页的目标是让用户快速判断：

- 这是哪个 pairing？
- 哪天开始？
- 从哪个 base 出发？
- 总 credit / block / DP 大概是多少？
- 大概经过哪些机场？
- 有几段 flight？
- 我要不要点 `ADD PAIRING`？

当前卡片把所有列一次性铺出来，导致用户反而看不到重点。

### 2. Mini calendar 和宽表互相抢空间

右侧 mini calendar 对搜索结果有价值，因为它直观展示 active dates。但它占据固定宽度后，左侧完整宽表空间不足。

现在的效果是：

- calendar 看起来正常；
- detail 表格被压缩；
- 表格出现横向滚动；
- 右侧字段被截断；
- 用户会觉得页面“不整齐”。

### 3. 摘要层级不清

`Start / Base / Composition / Total Credit / Total BH / Total DP` 是高价值摘要字段，应该像卡片 header 的信息区，而不是混在表格上方。

当前布局中这些字段虽然存在，但视觉上不够像“摘要”，更像被表格挤出来的一排文本。

### 4. 共享组件边界过粗

`PairingCompactDetail` 当前同时承担：

- 字段格式化
- Gantt 字段映射
- 弹窗 detail 表展示
- Search 卡片 detail 表展示

这里边界需要调整：

- 数据映射和格式化应该共享。
- 视觉布局不应该强行共享。
- Search 卡片需要 card mode。
- 弹窗需要 dialog mode。

## 目标

- Search 结果卡片不再出现内部横向滚动条。
- Search 卡片一眼能看懂 pairing 的核心信息。
- Search 卡片仍然使用真实 Gantt 字段，不回退到旧字段。
- 左侧日历 Pairing Bid 弹窗继续保留完整 Gantt 宽表。
- Search 卡片和弹窗继续共享字段映射、日期格式、duration 格式，避免两套字段逻辑再次不同步。
- `ADD PAIRING`、mini calendar、分页、筛选、搜索接口行为不变。

## 非目标

- 不改 pairing search API。
- 不改 pbs-server 返回字段。
- 不改搜索条件、筛选条件、rank/base/RP 过滤逻辑。
- 不改左侧日历弹窗的业务交互。
- 不重新设计整个 Search Pairings 页面。
- 不引入新 UI 依赖。

## 推荐方案

采用“共享数据映射 + 分离视觉布局”的方案。

### 核心设计

将当前 `PairingCompactDetail` 拆成两层：

1. 共享数据层
   - 负责把 `PairingSearchResult` 转成可展示字段。
   - 负责 duration、date、clock、fallback 值格式化。
   - 负责 Gantt leg columns 的字段映射。

2. 两套视觉组件
   - `PairingDialogDetail`：用于左侧日历弹窗，保留完整 Gantt 宽表。
   - `PairingResultCardDetail`：用于 Search 结果卡片，改成紧凑卡片展示，不使用完整 20 列宽表。

## 方案对比

### 方案 A：继续用完整宽表，但调整宽度和字体

做法：

- 缩小字体。
- 缩小列宽。
- 增加卡片宽度。
- 尝试隐藏滚动条。

优点：

- 改动最小。
- 字段展示最完整。

缺点：

- 根因没变：20 列宽表仍然不适合卡片。
- 字体再小会影响可读性。
- 隐藏滚动条会造成内容不可发现。

结论：不推荐。这是局部修补，不是正确设计。

### 方案 B：Search 卡片改为紧凑摘要 + 航段简表（推荐）

做法：

- Search 卡片展示摘要字段：
  - `Start`
  - `Base`
  - `Composition`
  - `Total Credit`
  - `Total BH`
  - `Total DP`
- 航段明细改为紧凑简表，只展示用户扫列表最需要的字段：
  - `Flight`
  - `Route`
  - `DEP`
  - `ARR`
  - `BH`
  - `Duty`
- 如果有 deadhead / positioning，可在 `Flight` 或 `Route` 附近显示 `QUAL`，例如 `DH ST`、`FLY 626`。
- 卡片内最多展示前 4-5 行 legs。
- 超过数量时显示 `+N more legs`，用户需要完整表时打开详情。
- Search 卡片不显示横向滚动条。
- 左侧 mini calendar 保留在右侧。

优点：

- 符合 Search 结果页“快速扫列表”的目标。
- 信息密度高但不拥挤。
- 不丢核心业务信息。
- 不影响弹窗完整明细。

缺点：

- Search 卡片不再直接展示完整 20 列。
- 如果用户想看 `ACC / Ref / PCK / RPT / ATD / ATA / GT / MRT` 等完整字段，需要打开详情。

结论：推荐。它把“列表预览”和“完整详情”职责分开。

### 方案 C：Search 卡片只显示摘要，完整详情全部放弹窗

做法：

- Search 卡片只显示 pairing number、摘要、mini calendar。
- 不展示任何 leg 行。
- 点击卡片或 `View Details` 打开完整弹窗。

优点：

- 卡片最干净。
- 布局最稳定。

缺点：

- 用户无法在列表中快速比较 route / flight。
- 对 pairing 搜索结果来说信息太少。

结论：不作为当前方案。可以作为移动端或极窄屏幕 fallback。

## 目标布局

### Search 结果卡片结构

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ EB8052     [ADD PAIRING]                                      mini calendar │
│                                                                             │
│ Start Jun 1, 2026   Base YEG   Composition CA(1)                            │
│ Total Credit 6:38   Total BH 10:31   Total DP -                             │
│                                                                             │
│ Flight        Route          DEP      ARR      BH      Duty                 │
│ DH ST         YEG → YYC      06:00    06:01    0:01    -                    │
│ FLY 626       YYC → YYZ      06:52    11:10    4:18    -                    │
│ FLY 601       YYZ → YVR      06:08    10:50    4:42    -                    │
│ DH ST         YYC → YEG      15:21    15:22    0:01    -                    │
│ +1 more leg                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 宽度策略

- 外层卡片继续保持当前左右布局。
- 左侧 detail 区使用 `minmax(0, 1fr)`，确保不会撑破卡片。
- 右侧 mini calendar 固定宽度，但可以在窄屏下移到下方。
- 卡片内 leg 简表使用固定 6 列或 flex grid，不使用横向滚动。
- 每个值允许单行截断，但关键字段有 `title` tooltip。

### 字段策略

Search 卡片展示：

| 区域 | 字段 |
|---|---|
| Badge | `pairingNumber` |
| Summary | `Start / Base / Composition / Total Credit / Total BH / Total DP` |
| Leg preview | `QUAL + Flight / Route / DEP / ARR / BH / Duty` |
| Calendar | `activeDates` |

弹窗展示：

| 区域 | 字段 |
|---|---|
| Summary | `Start / Base / Composition / Total Credit / Total BH / Total DP` |
| Full Gantt Table | `QUAL / ALN / Flight / Fleet / ACC / Ref / DEP / PCK / RPT / STD / ATD / ARR / STA / ATA / DRP / GT / BH / FT / MRT / Duty` |

## 组件设计

### 新增或调整的数据 helper

建议新增：

```text
pbs-portal/src/features/pairing/components/pairing-detail-display.ts
```

职责：

- `buildPairingSummary(result)`
- `buildGanttLegRows(result.legs)`
- `buildPairingPreviewLegRows(result.legs)`
- `formatPairingDuration(value)`
- `formatPairingClock(value)`
- `formatPairingStartDate(value)`

注意：

- 不放 React JSX。
- 只做展示数据转换。
- Search 卡片和弹窗都依赖它。

### Search 卡片组件

建议新增：

```text
pbs-portal/src/features/pairing/components/pairing-result-card-detail.tsx
```

职责：

- 渲染 Search 结果卡片内的紧凑 detail。
- 不使用横向滚动。
- 展示最多 4-5 行 leg preview。
- 超出显示 `+N more legs`。

### 弹窗完整 detail 组件

建议保留或重命名当前完整表组件：

```text
pbs-portal/src/features/pairing/components/pairing-dialog-detail.tsx
```

职责：

- 渲染完整 Gantt 宽表。
- 允许在弹窗内横向滚动，因为弹窗是查详情场景。
- 保持当前完整字段对齐能力。

## 交互设计

### 默认状态

- Search 结果卡片默认展示紧凑预览。
- 不出现横向滚动条。
- `ADD PAIRING` 位置保持不变。
- mini calendar 继续显示 active dates。

### 查看完整信息

当前阶段不强制新增 `View Details`，因为 Search 卡片已经能展示核心信息，完整信息仍可通过左侧日历 Pairing Bid 弹窗查看。

如果后续用户反馈 Search 结果页也需要完整详情，可新增：

- 点击 pairing number 打开完整 detail dialog。
- 或增加 `VIEW DETAILS` 按钮。

这个不纳入当前第一阶段，避免范围扩大。

## 数据与 API

不改 API。

使用现有 `PairingSearchResult` 字段：

- summary：
  - `startDateLabel`
  - `base`
  - `compositionLabel`
  - `totalCredit`
  - `totalBlock`
  - `totalDp`
- leg preview：
  - `ganttQual`
  - `ganttFlight`
  - `ganttDep`
  - `ganttArr`
  - `ganttStd`
  - `ganttSta`
  - `ganttBlockHour`
  - `ganttDuty`
  - fallback 到旧字段：
    - `flightNumber`
    - `departureStation`
    - `arrivalStation`
    - `departureTime`
    - `arrivalTime`
    - `blockTime`

## 验收标准

### UI 验收

- Search 结果卡片内不出现横向滚动条。
- Search 结果卡片右侧字段不再被截断到不可读。
- Summary 字段分组清晰，能快速读出 `Start / Base / Composition / Credit / BH / DP`。
- Leg preview 能清晰读出每段的 flight、route、DEP、ARR、BH。
- 多于展示上限的 legs 显示 `+N more legs`。
- `ADD PAIRING` 按钮仍可用。
- mini calendar 仍高亮 active dates。
- 左侧日历 Pairing Bid 弹窗仍显示完整 Gantt 表头。

### 功能验收

- 不改变 Search Pairings 查询结果。
- 不改变 `ADD PAIRING` 添加行为。
- 不改变 current rules / all pairings / criteria preview 的请求 payload。
- 不改变分页和 filters 行为。

### 回归验收

- 左侧日历 Pairing Bid 弹窗仍通过原有字段对齐测试。
- Search Pairings 卡片测试更新为验证紧凑布局，而不是完整 20 列宽表。
- Playwright 应覆盖：
  - Search 卡片不显示旧无意义 square。
  - Search 卡片不出现完整宽表模式。
  - Search 卡片显示紧凑 leg preview。
  - Search 卡片没有水平滚动。
  - 弹窗仍显示完整 Gantt columns。

## 测试计划

### Unit / Component Tests

更新：

```text
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
```

新增断言：

- Search card 显示 `Flight / Route / DEP / ARR / BH / Duty`。
- Search card 不显示完整宽表全部 columns。
- Search card 不显示横向滚动容器。
- Dialog detail 仍显示完整 `QUAL / ALN / Flight / ... / Duty`。

### Playwright

更新：

```text
e2e/tests/pbs-portal/pairing-search.spec.ts
```

新增或调整用例：

- `PBS-3602` 改为验证 Search result card 紧凑布局。
- 新增断言：结果卡片内没有 horizontal scroll。
- 保留真实数据测试中 rank/base/RP filter 校验。
- mock-driven UI test 保证样式和字段不依赖远程库当天是否有数据。

### UI Gate

需要运行：

```bash
npm run check:ui
```

### pbs-portal 验证

需要运行：

```bash
cd pbs-portal
pnpm lint
pnpm build
pnpm exec vitest run src/features/pairing/pages/search-pairings-page.test.tsx src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx --reporter=basic
```

## 版本号

这是 PBS Portal 前端 UI 行为改动，需要递增：

- `pbs-portal/src/version.ts` 的 `PBS_FRONTEND_VERSION`
- `gantt/src/version.ts` 的 `FRONTEND_VERSION`
- `gantt/src/version.ts` 的 `PBS_FRONTEND_VERSION`

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是一个集中在 PBS Portal pairing UI 的小范围布局重构，主要文件高度相关，拆多 agent 会增加冲突。
- Suggested split: 不建议拆分；由一个 agent 完成组件拆分、测试更新、验证。
- Write boundaries: 主要限于 `pbs-portal/src/features/pairing/components/`、相关测试、E2E、版本号、QA 文档。
- Conflict risk: 多 agent 同时改 `PairingDetailCard` / shared detail helper 容易冲突。
- Execution gate: 用户确认本 spec 后再实现。

## 风险与注意事项

- 不能因为 Search 卡片改紧凑，就删除弹窗完整字段能力。
- 不能回退到旧字段名，例如 `DUTY DATE / F/H / D/H / CRD`。
- 不能用假数据或硬编码字段；所有展示必须来自 `PairingSearchResult`。
- 不能隐藏真实数据问题；如果某字段后端为空，显示 `-`，但不写死值。
- 不要把 mini calendar 删除，它仍然是 Search 结果卡片的重要辅助信息。

## 推荐实施顺序

1. 抽出 pairing detail display helper。
2. 把当前完整 Gantt 表组件调整为 dialog detail。
3. 新增 Search card compact detail。
4. Search result card 改用 compact detail。
5. 弹窗继续用 dialog detail。
6. 更新 unit tests。
7. 更新 Playwright。
8. 跑 UI gate / lint / build / targeted tests。

## 结论

当前 Search Pairings 结果卡片的问题不是字段错，而是展示场景错。完整 Gantt 宽表适合弹窗，不适合搜索结果卡片。

推荐把共享边界从“共享完整组件”调整为“共享数据映射和格式化”，然后让 Search 卡片使用紧凑预览，让弹窗继续使用完整宽表。这样既保留字段一致性，又解决卡片拥挤、截断和横向滚动的问题。
