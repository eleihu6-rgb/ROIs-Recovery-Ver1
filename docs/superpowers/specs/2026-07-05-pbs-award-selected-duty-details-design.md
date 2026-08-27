# PBS Award Selected Duty Details 设计

## 背景

Award 页面现在已经能展示最终发布的整月 roster，并且右侧 `ROSTER DETAILS` 从纯占位控件清理成可滚动表格。用户进一步反馈：当前表格只能看到 duty 的概要字段，和参考系统 Roster 详情相比信息仍然偏薄。

参考系统的交互重点不是继续给列表加更多列，而是：

- 左侧或主区域显示整月 roster。
- 用户选中某一天 / 某个 duty。
- 右侧展示选中 duty 的详细卡片。
- Flight duty 会展示 route、时间、flight / duty 细节、credit / block 等。
- Ground / day off / activity 会展示更轻量的日期、时间、地点或活动信息。

当前本项目 Award 页面已有 `ROSTER DETAILS` 列表，也已有 `PbsAwardItem.legs`、`creditMinutes`、`blockMinutes`、`tafbMinutes` 等字段，因此可以先做一个基于现有数据的 Selected Duty Details MVP。

## 当前问题

当前 `ROSTER DETAILS` 表格字段包括：

- `CODE`
- `DUTY / ACTIVITY`
- `START`
- `ROUTE / LOCATION`
- `POSITION`
- `CREDIT`
- `TYPE`

这些字段适合作为索引，但不适合作为完整排班详情：

- Pairing 的 leg 明细没有显示。
- Pairing 的 block / TAFB 没有显示在行内。
- Activity / SIM / Training 的日期时间和地点语义不够清楚。
- Day Off 只作为一行文本，无法像参考系统那样明确展示 `Date / Time / Location`。
- 如果继续加列，会导致右侧表格横向拥挤，移动端或窄屏更难读。

## 目标

把 `ROSTER DETAILS` 从“纯表格列表”升级为“列表 + 选中详情”的只读结果查看区：

1. 保留当前可滚动 duties 列表，作为快速索引。
2. 支持点击 / 键盘选择某条 duty。
3. 在同一卡片内显示选中 duty 的详细内容。
4. Pairing 展示 flight legs 与 totals。
5. Activity / Day Off 展示日期、时间、location / assignment、credit 等轻量详情。
6. 不伪造当前没有的数据。
7. 不改 `View Reason Report` 的按钮逻辑。
8. 不实现 hotel / crew list / Flight Log 等暂无数据支持的深层功能。

## 推荐方案

采用“Roster list + Selected Duty Details”的方案。

### 页面结构

右侧仍保留 `ROSTER DETAILS` 卡片，但卡片内部拆成上下两块：

```text
ROSTER DETAILS                                      9 duties
┌─────────────────────────────────────────────────────────────┐
│ Compact duty list, scrollable                               │
│ - PD7440  Jun 04 20:15  DHD  4:00                           │
│ - SIM     Jun 05 13:00  SIM  4:00                           │
│ - M4114   Jun 27 19:10  YUL-YYZ --                          │
└─────────────────────────────────────────────────────────────┘

SELECTED DUTY
┌─────────────────────────────────────────────────────────────┐
│ M4114 · Pairing                                             │
│ Jun 27 19:10 - Jun 30 ...      YUL → YYZ                    │
│ Base / Fleet / Position / Credit / Block / TAFB             │
│ Legs table: Day, DH, Flight, Dep, Arr, Dep Time, Arr Time... │
└─────────────────────────────────────────────────────────────┘
```

如果列表为空，保持现有空态。

### 默认选中

当 `items.length > 0` 时，默认选中第一条 duty。

理由：

- 页面打开后立即有详情内容，不出现空白。
- 用户不需要先点击才能理解这个区域的用途。
- 和参考系统“点击某天后右侧显示详情”的交互一致，但更适合我们当前的表格入口。

### 选中交互

`ROSTER DETAILS` 中每行变成可选择行：

- 鼠标点击行：更新 selected item。
- 键盘 `Enter` / `Space`：更新 selected item。
- 当前选中行显示浅蓝底、左侧细色条或更深边框。
- hover 行显示轻量背景反馈。
- 不使用弹窗；详情直接在卡片内更新。

后续可扩展：

- 点击 Award Calendar 事件同步选择对应 duty。
- 点击详情中的 leg 可再打开 flight detail。

本次第一版可以只做列表行选择，不强行联动日历，避免扩大范围。

## 详情卡内容

### Pairing 详情

使用现有 `AwardDisplayItem` 字段展示：

| 区域 | 字段 |
|---|---|
| Header | `pairingCode ?? label`、`type`、`dateRangeLabel`、`timeRangeLabel` |
| Meta | `base`、`fleet`、`position`、`route`、`creditLabel`、`blockLabel`、`tafbLabel` |
| Legs | `day`、`deadhead`、`flightNumber`、`depAirport`、`arrAirport`、`depTime`、`arrTime`、`blockLabel`、`creditLabel`、`equipment` |

已有组件 `pbs-portal/src/features/award/components/award-trip-card.tsx` 已经包含 pairing/activity detail card 的雏形。实现时优先复用或收敛它，不再复制一套 detail UI。

### Activity / Ground 详情

Activity 包括 SIM、VAC、CRM、PD、AC、ST 等非 pairing row。

展示字段：

| 字段 | 说明 |
|---|---|
| Code | `label.slice(0, 3).toUpperCase()` 或业务 code |
| Duty / Activity | `label` |
| Date | `dateRangeLabel` |
| Time | `timeRangeLabel` |
| Location / Assignment | `base ?? assignment ?? assignmentGroup ?? "--"` |
| Credit | `creditLabel` |
| Type | `label` 或 `Activity` |

### Day Off 详情

展示字段：

| 字段 | 说明 |
|---|---|
| Code | `DO` |
| Date | `dateRangeLabel` |
| Time | `00:00 - 23:59` 或 `timeRangeLabel` |
| Location | `base ?? "--"` |
| Credit | `--` |
| Type | `Day Off` |

## 不做范围

本次不做：

- 不实现 `Flight Log` 按钮。
- 不实现 hotel / layover 酒店信息。
- 不实现 crew list。
- 不实现 duty period / FDP / rest / sign in / sign out 计算。
- 不新增后端接口。
- 不改 `roster_publish` schema。
- 不改 Reason Report 生成逻辑。
- 不把 `Reason Report Preview` 做成真实 report。
- 不实现日历事件与详情的强联动，除非现有代码改动很小且没有额外数据风险。

这些能力需要额外数据源，不应在当前 MVP 里用假数据补齐。

## 数据来源

第一版仅使用 `/api/award/current` 当前返回的字段：

- `items[].type`
- `items[].label`
- `items[].pairingCode`
- `items[].assignment`
- `items[].assignmentGroup`
- `items[].startDate`
- `items[].endDate`
- `items[].startTime`
- `items[].endTime`
- `items[].base`
- `items[].fleet`
- `items[].position`
- `items[].creditMinutes`
- `items[].blockMinutes`
- `items[].tafbMinutes`
- `items[].legs[]`

前端 mapper 已经生成：

- `dateRangeLabel`
- `timeRangeLabel`
- `creditLabel`
- `blockLabel`
- `tafbLabel`
- `legs[].blockLabel`
- `legs[].creditLabel`

因此第一版理论上不需要后端改动。

## UI 细节

### 列表

当前表格可以保留，但需要压缩高度，为详情卡留空间：

- 列表区域设置固定 / flex 高度并内部滚动。
- 表头继续 sticky。
- 当前选中行高亮。
- 行内信息保持 compact，不继续加列。

### 详情

详情区域放在同一个 `ROSTER DETAILS` 卡片下半部分：

- 标题使用 `Selected Duty`。
- Pairing 用蓝色 code badge。
- Day Off 用绿色 code badge。
- Activity 用黄色 / 橙色 code badge。
- 缺失值统一显示 `--`。
- Legs 多时，legs 表格内部横向滚动或纵向滚动，不能撑破页面。

### Reason Report

当前阶段 Reason Report 先放一放：

- 顶部 `View Reason Report` 保持现状。
- 如果现有 `Reason Report Preview` 仍然显示，不在本次改变其业务语义。
- 如果布局空间不足，优先保证 `Roster Details + Selected Duty` 能完整展示；是否隐藏/折叠 `Reason Report Preview` 需要单独确认。

推荐实现时先不扩大 Reason Report 的语义，只调整详情区。

## 方案对比

### 方案 A：表格行展开详情

点击某行后，在表格下方或当前行下展开详情。

优点：

- 不需要新增整体布局区域。
- 选中项和详情距离近。

缺点：

- 表格内展开复杂，容易让 sticky header、滚动高度、行高计算变乱。
- Pairing legs 表格嵌套在表格里，可读性一般。

### 方案 B：同一卡片内“上列表 + 下详情”（推荐）

`ROSTER DETAILS` 卡片上半部分是列表，下半部分是 selected duty detail。

优点：

- 信息结构清楚。
- 更接近参考系统“列表/日历 + 详情”的主从结构。
- 不继续把表格做宽。
- Pairing / Activity / Day Off 都可以用不同详情布局。

缺点：

- 需要重新分配右侧卡片高度。
- 如果保留 `Reason Report Preview`，右侧空间会更紧，需要处理滚动。

### 方案 C：点击行打开详情弹窗 / drawer

优点：

- 详情空间最大。
- 后续可以放 Flight Log / crew / hotel。

缺点：

- 结果页频繁查看 duty 不适合每次打开弹窗。
- 当前只是只读详情，不值得引入更重交互。
- 项目弹窗标准需要 `AppDialog`，会扩大实现范围。

## 推荐结论

采用方案 B。

理由：

- 用户当前要的是“这个卡片显示更详细”，不是新建大弹窗。
- 当前数据已经足够支持一版有价值的详情卡。
- 选中详情能明显贴近参考系统，但不承诺暂无数据的 hotel / crew / Flight Log。
- 实现范围主要集中在 `pbs-portal/src/features/award/**`，风险可控。

## 实现范围

预计修改：

- `pbs-portal/src/features/award/components/award-right-panel.tsx`
  - 为 `RosterDetailsPanel` 增加 selected item state。
  - duty rows 改为 selectable rows。
  - 在同一卡片内渲染 selected duty details。
  - 空态保持现有文案。
- `pbs-portal/src/features/award/components/award-trip-card.tsx`
  - 复用或调整为 selected duty detail card。
  - 确保 activity / day off / pairing 都有合适布局。
- `pbs-portal/src/features/award/pages/award-page.test.tsx`
  - 覆盖默认选中第一条 duty。
  - 覆盖点击其它 duty 后详情更新。
  - 覆盖 pairing legs 展示。
  - 覆盖 activity / day off 详情。

视实现情况可能需要：

- `pbs-portal/src/features/award/award-mappers.ts`
  - 如果现有 label 不足以展示 route/code，可补前端派生字段。

Runtime UI 改动需要按项目规则 bump frontend version。

## 测试方案

自动化：

- `npm --prefix pbs-portal test -- src/features/award/pages/award-page.test.tsx`
- `npm --prefix pbs-portal run build`
- `npm --prefix pbs-portal run lint`
- `npm run check:ui`

如实现 UI：

- 用 Playwright 打开真实 Award 页面。
- 验证默认选中第一条 duty。
- 点击 pairing row，详情展示 pairing code、route、credit/block、legs。
- 点击 activity row，详情展示日期、时间、location/assignment、credit。
- 点击 day off row，详情展示 Day Off 信息。
- 验证页面没有横向溢出，底部没有大面积空白。

## 验收标准

- `ROSTER DETAILS` 仍显示 duties 数量。
- duties 列表仍可内部滚动。
- 默认选中第一条 duty，并显示详情。
- 点击不同 duty 后详情内容更新。
- Pairing 详情显示 legs，不只显示一行概要。
- Activity / Day Off 详情不显示假 flight 字段。
- 缺失字段显示 `--`。
- 不出现 `Layer` 术语；如需层级，使用 `Tier`。
- 不新增 fake hotel / fake crew / fake Flight Log。
- `View Reason Report` 行为不被破坏。

## 风险与注意事项

- 当前 `roster_publish` 的部分 activity 字段语义可能不完整，前端只能按现有 `assignment/base/label` 展示。
- Pairing legs 如果数据为空，详情卡需要显示 `No legs available.`，不能空白。
- 右侧高度有限，需要避免“列表 + 详情 + Reason Preview”一起把页面撑出工作台。
- 如果实现过程中发现 `AwardTripCard` 是遗留组件且样式不适配，需要先收敛组件职责，而不是再新增重复组件。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单页 UI 信息架构调整，主要改动集中在 Award 组件和测试。拆给多 agent 会增加布局/状态集成成本。
- Suggested split: 不拆。
- Write boundaries: `pbs-portal/src/features/award/**`、必要的测试文件、version bump。
- Conflict risk: 中低；当前工作区已有无关未跟踪 spec，实施时不能误提交。
- Execution gate: 用户确认本 spec 后再实施。
