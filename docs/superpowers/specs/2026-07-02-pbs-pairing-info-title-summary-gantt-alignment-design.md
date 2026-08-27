# PBS Portal Pairing Info 标题与摘要对齐 Gantt 设计

## 背景

测试反馈：“Pairing info 的标题和甘特不一致”。结合截图，问题指向 PBS Portal Dashboard 日历点击 pairing 后打开的 `Pairing Bid` 详情弹层：

- Gantt Pairing Info 顶部标题显示 `O4102 #11103`。
- PBS Portal 当前弹层顶部主标题只显示 `O4102`，内部 ID `11103` 放在下方 summary 表格里。
- Gantt 摘要栏使用 `Start / Base / Composition / Total Credit / Total BH / Total DP`。
- PBS Portal 当前详情卡摘要使用 `BASE / REPORT / TBLK / TCRD / TPAY`。

本设计分两阶段：

- 第一阶段：对齐标题和 Pairing Details 摘要栏，不改 legs 明细表头、不改数据接口。
- 第二阶段补充：弹窗允许跨出左侧日历区域，修复文字被压缩；同时对齐 legs 明细表头。
- 第三阶段修正：弹窗必须在视口居中，并在打开时锁住背景页面滚动，避免出现页面级滚动条。
- 第四阶段修正：遮罩必须覆盖视口底部，点击背景遮罩可以关闭弹窗。

## 目标

1. PBS Portal Pairing Bid 详情弹层的主标题与 Gantt 对齐，显示为：
   - 单个 pairing：`<pairingNumber> #<internalId>`，例如 `O4102 #11103`。
   - 多个 pairing 或缺少 internal id 时保持安全 fallback，不显示错误空值。
2. Pairing Details 卡片摘要栏改为 Gantt 风格字段：
   - `Start`
   - `Base`
   - `Composition`
   - `Total Credit`
   - `Total BH`
   - `Total DP`
3. 保留当前 Pairing Bid summary grid（`PAIRING / ID / TX / ORIG / START / END / MODE`），因为这是 bid 行选择/改 tier 的业务信息，不属于 Gantt Pairing Info 摘要。
4. 第二阶段将 Pairing Details 下方 legs 明细表头改为更接近 Gantt 的语义。
5. 第二阶段将弹窗从左侧日历容器限制中释放出来，避免摘要和 legs 被压缩。
6. 第三阶段修正弹窗位置和滚动行为：居中显示，背景不滚，只有弹窗内部在必要时滚动。
7. 第四阶段修正遮罩交互：覆盖完整可视区域底部，背景点击关闭，弹窗内容点击不误关闭。

## 非目标

- 不修改 pbs-server 接口。
- 不修改 Pairing Search 的数据结构。
- 不修改 Dashboard 日历 event 的生成逻辑。
- 不修改保存 tier、删除 tier、readonly、错误状态等行为。
- 不在第二阶段补齐后端没有返回的数据字段；缺失字段不硬造。
- 不为了完全复制 Gantt 表格而修改 pbs-server 接口。

## 第三阶段修正：居中与背景滚动锁定

### 背景

第二阶段实现后，用户截图显示两个新的体验问题：

- 弹窗虽然已经脱离左侧日历宽度限制，但仍使用 `justify-start`，导致弹窗靠左而不是居中。
- 页面右侧仍出现浏览器级滚动条，说明弹窗打开时背景页面仍可滚动。

### 方案

在不改变数据结构、不改变保存逻辑的前提下，仅修正弹窗 overlay 行为：

- overlay 继续使用页面级 `fixed`，但改为水平居中。
- overlay 使用 `inset-x-0` 覆盖完整视口宽度，避免左侧偏移造成视觉不居中。
- 弹窗宽度继续使用 `min(1180px, calc(100vw - 96px))`，保证宽屏有足够空间、小屏不溢出。
- 弹窗打开时通过 React effect 暂时设置 `document.body.style.overflow = "hidden"`，卸载时恢复原值。
- 超高内容只允许弹窗内部滚动，不允许背景页面滚动。

### 验收标准

- 1920 宽屏下，`Pairing Bid` 弹窗相对浏览器视口居中。
- 打开弹窗时，浏览器右侧页面级滚动条消失。
- 如果 pairing details 内容高度超过可用视口，只在弹窗内部滚动。
- `Close`、`SAVE BID`、tier 编辑、readonly 模式行为不变。

### 测试补充

- 组件测试断言 overlay 使用居中布局，不再是 `justify-start`。
- 组件测试断言弹窗挂载时锁定 `document.body.style.overflow`，卸载后恢复。

## 第四阶段修正：遮罩覆盖到底与背景点击关闭

### 背景

第三阶段修正后，用户截图显示底部仍有一小条区域没有被遮罩/模糊覆盖。原因是 overlay 使用 `bottom-4`，底部保留了 16px 空隙。同时用户希望点击背景遮罩即可关闭弹窗，减少必须移动到 `Close` 按钮的操作成本。

### 方案

继续保持页面级 fixed overlay，不改变弹窗数据和保存逻辑：

- overlay 从 `bottom-4` 改为 `bottom-0`，遮罩覆盖到视口底部。
- overlay 绑定 `onClick={onClose}`，点击背景关闭弹窗。
- dialog 主体绑定 `onClick={(event) => event.stopPropagation()}`，点击弹窗内容、checkbox、radio、保存按钮等不会冒泡关闭。
- 保留 `Close` 按钮作为显式关闭方式。
- 保留 body scroll lock，关闭或卸载后继续恢复原 body overflow。

### 验收标准

- 弹窗打开后，底部没有未模糊/未遮罩的空白条。
- 点击弹窗外的背景遮罩关闭弹窗。
- 点击弹窗内部任意内容不会关闭弹窗，除非点击 `Close` 或保存成功后的业务关闭逻辑。
- 保存 tier、readonly 查看、加载/错误状态不受影响。

### 测试补充

- 组件测试断言 overlay 使用 `bottom-0`，不再包含 `bottom-4`。
- 组件测试模拟点击 overlay 背景，断言 `onClose` 被调用。
- 组件测试模拟点击 dialog 内容，断言 `onClose` 不被调用。
- QA 测试案例写入 `docs/test-cases/pbs/dashboard/`，覆盖视觉遮罩、背景关闭、内部点击不关闭、回归范围。

## 第二阶段补充：弹窗宽度与 legs 表头

### 背景

第一阶段实现后，实际 UI 截图暴露出两个问题：

- `Pairing Bid` 弹窗仍被左侧 `BIDDING CALENDAR` 卡片宽度限制，导致 `Composition / Total Credit` 等摘要文字被截断。
- `DAY / FDP / F/H / D/H / CRD / FLTN / DPS / ARS / DEP / ARR / BLKT / EQP` 仍是旧 Portal 表头，没有继续向 Gantt Pairing Info 靠拢。

用户确认的方向是：弹窗可以溢出左侧日历区域。这样在宽屏下不需要把所有信息挤在左栏内部，也尽量避免横向滚动条。

### 推荐方案：页面级固定弹窗 + 宽屏展开

将 `PairingCalendarBidDetailDialog` 从“左侧 schedule panel 内部 absolute overlay”调整为“页面级 fixed overlay”：

- 使用 `position: fixed` 覆盖当前页面视口，而不是依赖左侧 panel 的 `absolute inset-0`。
- 弹窗仍视觉上从左侧区域出现，但宽度允许向右覆盖到 Pairing 页面工作区。
- 建议宽度：
  - `width: min(1180px, calc(100vw - 96px))`
  - `max-height: calc(100vh - 96px)`
- overlay 背景仍保留半透明遮罩，右侧内容可被遮罩压暗，避免用户误以为右侧仍可操作。
- 小屏或极端数据时，内部明细表仍保留横向滚动 fallback，避免内容溢出屏幕。

优点：

- 根因解决左栏宽度限制，不靠继续压缩字体或字段。
- 宽屏下更接近 Gantt Pairing Info 的信息密度。
- 对现有 API、保存、readonly、tier 编辑逻辑影响最小。

缺点：

- 弹窗会覆盖右侧 Pairing 面板，需要明确遮罩和 z-index。
- 如果未来移动端或窄屏要支持，需要进一步做响应式布局。

### 备选方案 A：只扩大左侧 panel 内弹窗

通过 `overflow-visible` 和更大的 absolute 宽度让弹窗从左侧 panel 溢出。

不推荐：

- 父级链路里已有 `overflow-hidden`，需要改多个容器，容易影响左侧日历裁剪和页面布局。
- z-index 与右侧面板交叠更难稳定控制。

### 备选方案 B：保留当前宽度，只做内部滚动

在 Pairing Details 卡片内部加入横向滚动条。

不推荐作为主方案：

- 用户明确指出弹窗被左栏限制，宽屏下本不应该靠滚动解决。
- 滚动条会降低查看 pairing 明细的效率。

结论：采用“页面级 fixed overlay + 宽屏展开”，保留小屏滚动 fallback。

### 第二阶段字段显示规则

#### Pairing Details 摘要

摘要栏不再强制 `truncate`。推荐改成可换行的 key-value 区块：

- Pairing number badge 固定在左侧。
- `Start / Base / Composition / Total Credit / Total BH / Total DP` 使用自适应 grid 或 flex-wrap。
- 每个字段完整显示 label，value 可完整显示或在极端情况下通过 `title` 提供完整值。
- `Composition` 和 `Total DP` 当前没有可靠数据时继续显示 `-`，不硬编码假数据。

#### Legs 表头映射

第二阶段不修改后端数据，只基于现有 `PairingSearchResult.legs` 字段做前端表头映射：

| 当前 Portal 表头 | 当前字段 | 第二阶段显示 | 说明 |
| --- | --- | --- | --- |
| DAY | `leg.day` | Day | 保留业务含义，大小写改为更易读 |
| FDP | `leg.dutyFdp` | FDP | 保留 |
| F/H | `leg.dutyFlyingHour` | FT | Flying Time，向 Gantt 语义靠拢 |
| D/H | `leg.dutyHour` | Duty | Duty time |
| CRD | `leg.dutyCredit` | Credit | Credit |
| FLTN | `leg.flightNumber` | Flight | 航班号 |
| DPS | `leg.departureStation` | DEP | 起飞机场 |
| ARS | `leg.arrivalStation` | ARR | 到达机场 |
| DEP | `leg.departureTime` | STD | 计划起飞时间 |
| ARR | `leg.arrivalTime` | STA | 计划到达时间 |
| BLKT | `leg.blockTime` | BH | Block hour |
| EQP | `leg.equipment` | Fleet | 机型 / fleet |

说明：Gantt 截图里的 `QUAL / ALN / ACC / Ref / PCK / RPT / ATD / ATA / DRP / GT / MRT / Duty` 等字段，当前 Portal detail response 不一定都有可靠来源。本阶段不补接口，因此不显示这些缺失字段，避免空字段占位造成误导。

### 第二阶段 UI 行为

- 点击日历 pairing entry 后，弹窗覆盖在页面级 overlay 上。
- 弹窗主体宽度扩大，宽屏下不应出现摘要文字被截断。
- Pairing Details 中多个 pairing card 继续纵向排列。
- `Apply to Tiers` 和底部按钮继续保持在弹窗内容下方。
- 若内容高度超过视口，弹窗内部纵向滚动；页面本身不滚动。
- 小屏或内容过宽时，legs 表格区域允许横向滚动 fallback。

### 第二阶段测试

需要更新：

- `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx`
  - 断言摘要字段 label 完整渲染。
  - 断言 legs 新表头 `Day / Flight / DEP / ARR / STD / STA / BH / Fleet` 出现。
  - 断言旧表头 `FLTN / DPS / ARS / BLKT / EQP` 不再出现。
- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`
  - 断言 Dashboard 点击 pairing 后，页面级 dialog 仍可打开、选择行、保存 tier。
  - 断言多 pairing 标题仍为 `E4106 +N` 形式。

建议运行：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx src/app/layout/shared-bidding-workbench-layout.test.tsx
npm test
npm run lint
npm run build
cd /Users/lei/Codehub/rois-ai
npm run check:ui
```

如本地 PBS Portal Vite 已在正确 base 下运行，可继续跑轻量 Playwright smoke：

```bash
cd /Users/lei/Codehub/rois-ai/e2e
PBS_PORTAL_BASE_URL=http://localhost:3030/pbs npm run test:pbs-portal -- --no-deps portal-smoke.spec.ts
```

## 设计方案

### 推荐方案：前端展示层映射

只在 `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx` 增加展示格式化：

- 根据 `detailRows` 计算 dialog 主标题；当没有 bid 行时再 fallback 到 `detailResults`。
- 单 pairing 优先使用 bid 行的 `pairingNumber` 与 `internalId` 生成 `O4102 #11103`，避免异步 detail 结果把标题数量算错。
- 摘要栏仍使用现有 `PairingSearchResult` 数据，转换为 Gantt 风格 label。

优点：

- 改动最小。
- 不影响 API contract。
- 对当前测试最容易做回归。

缺点：

- `Composition / Total BH / Total DP` 需要基于现有字段做 best-effort 显示。当前 `PairingSearchResult` 已有 `base / totalCredit / legs / equipment / flightNumber` 等字段，但未必有完整 crew composition、total BH、total DP 原始字段。

### 备选方案：后端补齐 Gantt summary 字段

由 pbs-server pairing details endpoint 返回与 Gantt 完全一致的 summary 字段。

优点：字段来源更权威。

缺点：本次范围会扩大到后端 API、contract、测试和数据查询，不符合“先改标题和摘要”的第一阶段节奏。

结论：不采用。

## 字段显示规则

### 主标题

优先级：

1. 如果只有一个明确 pairing：显示 `<pairingNumber> #<id>`。
2. 如果有多个 pairing：显示 `<pairingNumber> +N`，避免标题误导成单个 id。
3. 如果没有 id：显示 `<pairingNumber>`。

### 摘要栏

字段建议：

| Gantt 字段 | Portal 来源 | 缺失时 |
| --- | --- | --- |
| Start | `detailRows[0].startDate` 或 `activeDates[0]` | `-` |
| Base | `result.base` | `-` |
| Composition | 先显示 `-`，除非现有 result 有可用 composition 字段 | `-` |
| Total Credit | `result.totalCredit` | `-` |
| Total BH | `result.totalBlock` | `-` |
| Total DP | 无可靠来源，显示 `-` | `-` |

说明：当前截图里 Gantt 的 `Total BH 32:26` 与 Portal 的 `TBLK 3226` 是同一类 block hour 信息，第一阶段可先映射为 `Total BH`。如果后续要做到完全一致的 `Composition CA(1)` 和 `Total DP`，需要后端补字段。

## 测试

需要更新：

- `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx`
  - 断言主标题包含 `C4101 #3055`。
  - 断言摘要栏出现 `Start / Base / Composition / Total Credit / Total BH / Total DP`。
  - 断言旧摘要 label `REPORT / TBLK / TCRD / TPAY` 不再出现在 Pairing Details 摘要栏。

建议运行：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
npm run build
```

如果涉及样式调整，再运行：

```bash
cd /Users/lei/Codehub/rois-ai
npm run check:ui
```

## 验收标准

- 从 Dashboard 日历点击 pairing bid 后，弹层顶部主标题与 Gantt 一样可见 `O4102 #11103` 形式。
- Pairing Details 卡片摘要显示 Gantt 风格字段名。
- Pairing Bid summary grid 仍保留 `PAIRING / ID / TX / ORIG / START / END / MODE`。
- 保存 tier、清空 tier、readonly 模式不受影响。
- 第二阶段后，弹窗不再被左侧日历宽度压缩，宽屏下摘要字段可读。
- 第二阶段后，legs 表头不再显示旧的 `FLTN / DPS / ARS / BLKT / EQP`，改为更接近 Gantt 的可读表头。
- 小屏下允许内部滚动 fallback，但不能让内容溢出浏览器视口。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 第二阶段仍集中在一个 PBS Portal 弹窗组件和它的测试，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx` 与对应测试。
- Conflict risk: 低。
- Execution gate: 用户确认本 spec 后再实现。
