# PBS Portal Pairing Info 表头与 Credit/BH 对齐 Gantt 设计

## 背景

在 PBS Portal 的 `BIDDING CALENDAR` 中点击 pairing bid 后，会打开 `Pairing Bid` 详情弹窗。上一轮已经完成了：

- 弹窗标题、宽度、居中、遮罩、背景点击关闭。
- Pairing Details 摘要栏初步改为 `Start / Base / Composition / Total Credit / Total BH / Total DP`。
- legs 明细表头临时改为 `Day / FDP / FT / Duty / Credit / Flight / DEP / ARR / STD / STA / BH / Fleet`。

用户指出红框对比后，当前明细表头仍然没有对齐 Gantt 的 Pairing Info。

Gantt Pairing Info 的目标表头是：

```text
QUAL / ALN / Flight / Fleet / ACC / Ref / DEP / PCK / RPT / STD / ATD / ARR / STA / ATA / DRP / GT / BH / FT / MRT / Duty
```

PBS Portal 当前表头是：

```text
Day / FDP / FT / Duty / Credit / Flight / DEP / ARR / STD / STA / BH / Fleet
```

这两者不是同一套结构。当前 Portal 只是把旧 AA compact 表头替换成较新的英文名，但没有按 Gantt 的列顺序、列语义和时间展示方式重建。

同时截图显示两个数值问题：

- `Total BH`：Gantt 显示 `32:26`，Portal 历史显示可能是 `3226` 或局部格式不一致，需要统一成 `H:MM` / `HH:MM`。
- `Total Credit`：Gantt 显示 `29:20`，Portal 当前出现 `4270` / `1476` 这类明显不一致的值。初步代码核查显示，PBS 后端当前 `totalCredit` 是按 segment 累加 `act_credited_minutes_seg`，而 Gantt credit 口径是 duty-level 去重，按 `duty_seq` 聚合 `duty_act_credited_minutes`，避免一个多航段 duty 被重复计入。

## 目标

1. PBS Portal Pairing Bid 详情弹窗中的 legs 明细表头按 Gantt Pairing Info 结构对齐。
2. 时间和时长字段按 Gantt 可读格式展示，避免 `3226` / `0609` 这类紧凑数字直接暴露给用户。
3. `Total Credit` 和明细 `Duty`/credit 相关展示采用 Gantt 同口径：按 duty 去重，不按 segment 重复累加。
4. 不为了视觉一致而伪造不存在的数据；当前后端没有的字段先返回空值或 `-`，但列结构先对齐。
5. 保持现有 tier 编辑、保存、readonly、loading/error、弹窗遮罩交互不变。

## 非目标

- 不重做整个 Gantt Pairing Info 弹窗样式。
- 不引入 Gantt 前端组件到 PBS Portal。
- 不改变 Pairing Bid 保存模型。
- 不改变 Search Pairings 条件筛选语义。
- 不在前端硬编码航空公司专有业务规则。
- 不用前端推断无法从后端确定的 `QUAL / ACC / Ref / PCK / RPT / ATD / ATA / DRP / GT / MRT` 字段；应由后端 contract best-effort 返回。

## 方案比较

### 方案 A：只改前端表头文字

把当前 Portal 表头强行改成 Gantt 表头。

优点：

- 改动最小。
- 不动 API。

缺点：

- 列语义不真实，例如 `Day` 不能变成 `QUAL`，`FDP` 也不是 Gantt 的 `Duty`。
- 缺失列只能乱映射，会制造错误信息。
- `Total Credit` 口径仍然错误。

结论：不推荐。

### 方案 B：后端扩展 detail leg contract，前端按 Gantt 列渲染

`pbs-server` 的 pairing search detail result 增加 Gantt-style leg display fields。前端不再把旧字段硬拼成 Gantt 表，而是直接消费后端给出的列值。

优点：

- 列语义清楚，后续维护成本低。
- credit/BH 口径可以在后端统一，多个 PBS 页面共用。
- 前端只负责展示，不猜业务。

缺点：

- 需要修改 pbs-server contract、mapper、测试。
- 影响 Search Pairings / Tier preview 等复用 `PairingSearchResult` 的位置，需要回归。

结论：推荐。

### 方案 C：新增专用 Dashboard pairing detail API

为 Bidding Calendar 弹窗新增一个只服务 Dashboard 的 API，返回完全贴近 Gantt 的表格数据。

优点：

- 对现有 Pairing Search contract 影响小。

缺点：

- 与 Search Pairings detail 形成两套数据模型。
- 后续同一个 pairing detail 在不同页面可能再次不一致。
- 增加接口和测试维护面。

结论：当前不推荐，除非后续证明 Search Pairings 与 Bidding Calendar 详情确实需要完全不同的数据契约。

## 推荐设计

采用方案 B：扩展现有 pairing search detail contract，并让 PBS Portal 的 Pairing Bid 弹窗按 Gantt-style detail fields 渲染。

### 后端 contract

在 `PairingSearchLeg` 上增加 Gantt-style 展示字段，保留旧字段兼容现有页面。

建议新增字段：

| 字段 | UI 列 | 来源 / 规则 |
|---|---|---|
| `qual` | `QUAL` | 优先使用 segment assignment / deadhead/fly 语义；无法判断时 `""` 或 `"-"` |
| `airline` | `ALN` | `pairing_segment.airline`；没有时 `""` |
| `flightNumber` | `Flight` | 现有 `flt_num` |
| `fleet` | `Fleet` | `fleet_seg` fallback `pairing.fleet` |
| `acc` | `ACC` | `pairing_segment.duty_acc_state`，与 Gantt 的 `ACC` 列一致；没有时 `""` |
| `ref` | `Ref` | 参考字段；当前没有可靠来源时 `""` |
| `dep` | `DEP` | `dep_arp`，保留机场 + offset 需要后端有 zone 信息；没有 offset 时先显示机场 |
| `pickupTime` | `PCK` | `pickup_*` 或 duty pickup 字段；没有时 `""` |
| `reportTime` | `RPT` | duty/report/brief start；没有时 `""` |
| `scheduledDepartureTime` | `STD` | `sch_str_dt_utc` 按 pairing/base zone 格式化 |
| `actualDepartureTime` | `ATD` | actual start；没有时 fallback scheduled 或 `""` |
| `arr` | `ARR` | `arv_arp`，同 DEP |
| `scheduledArrivalTime` | `STA` | `sch_end_dt_utc` 按 pairing/base zone 格式化 |
| `actualArrivalTime` | `ATA` | actual end；没有时 fallback scheduled 或 `""` |
| `dropoffTime` | `DRP` | debrief/dropoff 字段；没有时 `""` |
| `groundTime` | `GT` | 与下一段/下一 duty 的间隔；第一阶段可 `""` |
| `blockHour` | `BH` | segment block minutes 格式化为 `H:MM` |
| `flightTime` | `FT` | segment flight/block minutes，若无单独 FT 字段，第一阶段同 BH 或 `""` 需明确 |
| `minimumRestTime` | `MRT` | duty rest / legal rest；没有时 `""` |
| `dutyLabel` | `Duty` | duty-level label，例如 `LO 1 · FDP 3:15`；当前无法完整时至少显示 `FDP H:MM` |

旧字段继续保留：

- `day`
- `dutyDate`
- `dutyFdp`
- `dutyFlyingHour`
- `dutyHour`
- `dutyCredit`
- `departureStation`
- `arrivalStation`
- `departureTime`
- `arrivalTime`
- `blockTime`
- `equipment`

这样可以避免一次改动影响 Search Pairings / Tier preview 的旧展示。

### 后端 Credit/BH 口径

`totalBlock`：

- 继续使用所有 segment 的 block minutes 求和。
- 返回值改为统一可读 duration 格式，建议服务端返回 `H:MM`，例如 `32:26`。
- 如果 contract 暂时保持 compact `HHMM`，前端必须统一格式化成 `H:MM`。

`totalCredit`：

- 改为按 duty 去重求和。
- 对每个 `duty_seq` 取 duty credit：优先 `duty_act_credited_minutes`，fallback `duty_sch_credited_minutes`。
- 同一个 duty 的多条 segment 不重复累计。
- 返回统一 duration 格式，建议服务端返回 `H:MM`。

伪代码：

```text
credit_by_duty = Map<duty_seq, minutes>
for segment in segments:
  if duty_seq not seen:
    minutes = duty_act_credited_minutes ?? duty_sch_credited_minutes ?? 0
    credit_by_duty[duty_seq] = round(minutes)
total_credit = sum(credit_by_duty.values)
```

这与 Gantt `sumPairingCreditMinutes` 的 duty-level 去重模型一致。

### 前端展示

`PairingCalendarCompactDetail` 调整为 Gantt-style grid：

表头顺序固定为：

```text
QUAL / ALN / Flight / Fleet / ACC / Ref / DEP / PCK / RPT / STD / ATD / ARR / STA / ATA / DRP / GT / BH / FT / MRT / Duty
```

展示规则：

- 表格宽度允许横向滚动；不要为了塞进弹窗而压缩到不可读。
- 表头大小写、顺序必须与 Gantt 一致。
- 时间列优先显示 `M/D HH:mm` 或 `HH:mm`，以 Gantt 当前实际显示为准；同一天可保留 `HH:mm`。
- duration 列统一显示 `H:MM`，例如 `1:58`、`6:09`、`29:20`。
- 空值显示为空或 `-`，不能显示 `undefined` / `null` / `0000`。
- `Duty` 列允许宽一些，展示类似 Gantt 的 `LO 1 · FDP 3:15`。

### 数据流

```text
PBS Portal Bidding Calendar click
  -> dashboard schedule panel loads pairing details
  -> pbs-server pairing-search detail
  -> mapper builds Gantt-style leg fields and duty-level totalCredit
  -> portal dialog renders Gantt-style columns
```

### 兼容影响

需要检查以下复用点：

- `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx`
- `pbs-portal/src/features/pairing/components/pairing-detail-card.tsx`
- `pbs-portal/src/features/tier/components/tier-pairing-set-preview.tsx`
- `pbs-portal/src/features/pairing/types.ts`
- `packages/contracts/pbs-search-pairings.js`
- `pbs-server/src/services/pairing-search/pairing-search-preview-mapper.ts`
- `pbs-server/src/routes/pairing-search.test.ts`

如果其他页面仍需要旧 AA compact 显示，可以继续用旧字段；本次只让 Dashboard Pairing Bid detail 使用新增 Gantt-style 字段。

## 验收标准

### UI 验收

1. PBS Portal Pairing Bid 详情弹窗中，legs 表头与 Gantt Pairing Info 表头一致：

   ```text
   QUAL / ALN / Flight / Fleet / ACC / Ref / DEP / PCK / RPT / STD / ATD / ARR / STA / ATA / DRP / GT / BH / FT / MRT / Duty
   ```

2. 当前旧表头不再出现在该弹窗主 legs grid 中：

   ```text
   Day / FDP / Credit
   ```

3. `BH / FT / Duty / Total Credit / Total BH` 的 duration 展示不再出现裸 `0609`、`3226`、`1476` 这类 compact 数字。
4. 多航段 duty 的 `Total Credit` 不重复计入每个 segment。
5. 点击背景关闭、弹窗居中、底部遮罩覆盖、保存 tier 行为保持不变。

### 数据验收

1. 对包含多航段 duty 的 pairing，`totalCredit` 等于 duty-level credit 求和。
2. 对单航段 duty，`totalCredit` 与旧结果一致或只发生格式变化。
3. `totalBlock` 仍等于 segment block minutes 求和。
4. 缺失字段不报错，显示空值或 `-`。

### 回归验收

1. Search Pairings 页面仍能显示 pairing result card。
2. Tier pairing set preview 仍能显示旧 compact detail。
3. Dashboard calendar pairing bid 保存 tier 不受影响。

## 测试计划

### pbs-server 自动化测试

更新或新增：

- `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`
- `pbs-server/src/routes/pairing-search.test.ts`

覆盖：

- 多 segment / 同 duty 的 `totalCredit` 去重。
- `totalBlock` 仍按 segment 累加。
- 新增 Gantt-style leg 字段存在且 fallback 安全。
- 缺失 actual time / pickup / dropoff 字段时不返回 `undefined`。

### pbs-portal 自动化测试

更新：

- `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx`
- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`
- 必要时更新 `pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx`

覆盖：

- 表头顺序完整匹配 Gantt columns。
- 旧 `Day / Credit` 不再作为主 grid 表头出现。
- duration 从 compact format 渲染为 `H:MM`。
- 背景点击关闭、内部点击不关闭、body scroll lock 仍通过。

### QA 人工测试案例

新增或扩展：

```text
docs/test-cases/pbs/dashboard/2026-07-02-pairing-bid-detail-gantt-leg-grid.md
```

覆盖：

- 与 Gantt 同一个 pairing 对比表头顺序。
- 对比 `Total Credit`、`Total BH`。
- 多航段 duty 不重复计算 credit。
- 空字段展示。
- 保存 tier 回归。

### 验证命令

建议执行：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test -- src/services/pairing-search/pairing-search-service.test.ts src/routes/pairing-search.test.ts
npm test
npm run lint
npm run build

cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx src/app/layout/shared-bidding-workbench-layout.test.tsx src/features/dashboard/pages/dashboard-page.test.tsx
npm test
npm run lint
npm run build

cd /Users/lei/Codehub/rois-ai
npm run check:ui
```

如果本地 PBS Portal 和 pbs-server 可用，再补 Playwright smoke：

```bash
cd /Users/lei/Codehub/rois-ai/e2e
PBS_PORTAL_BASE_URL=http://localhost:3030/pbs npm run test:pbs-portal -- --no-deps portal-smoke.spec.ts
```

## 风险与处理

### 风险 1：Gantt 字段比 PBS 当前 API 更丰富

处理：

- 第一阶段只映射当前能可靠获得的字段。
- 缺失字段返回空值或 `-`。
- 不在前端猜测 `QUAL / ACC / Ref / MRT`。

### 风险 2：修改 `totalCredit` 影响 Search Pairings 其他页面

处理：

- 这是正确口径修复，不是 Dashboard 私有显示修复。
- 需要明确更新测试预期。
- 若 Search Pairings 历史文档要求 segment credit 累加，需要单独确认；当前 Gantt 和 crew credit 模型都支持 duty-level 去重。

### 风险 3：表格列数增加导致宽度变大

处理：

- 弹窗保持当前 viewport-level 宽弹窗。
- 明细表允许横向滚动。
- 不压缩字体到不可读。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 前后端 contract、credit 口径和 UI 展示强耦合，拆多 agent 容易产生 schema / 测试预期不一致。
- Suggested split: 不拆。由一个实现过程串行修改 contract、mapper、前端展示和测试。
- Write boundaries: `pbs-server` pairing-search mapper/tests、`pbs-portal` pairing detail dialog/types/tests、`docs/test-cases/pbs/dashboard`。
- Conflict risk: Medium。`PairingSearchResult` 被多个 PBS 页面复用，需要谨慎回归。
- Execution gate: 用户确认本 spec 后再开始实现。

## 实施边界

本 spec 只定义下一阶段修复。实现前必须再次确认：

- 是否接受 `totalCredit` 从 segment 累加改为 duty-level 去重。
- 是否接受当前后端没有的 Gantt 列第一阶段显示空值或 `-`。
- 是否只在 Dashboard Pairing Bid detail 使用 Gantt-style grid，其他页面暂时保留旧 compact grid。
