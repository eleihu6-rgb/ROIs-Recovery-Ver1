# PBS Dashboard Pairing Bid Detail Gantt Leg Grid QA 测试案例

日期：2026-07-02  
范围：PBS Portal Dashboard / shared Bidding Calendar 中 Pairing Bid 详情弹窗的 Pairing Details 表头、字段顺序、真实数据来源、Credit/BH/DP 展示口径。

## 前置条件

- PBS Portal 可正常访问并登录。
- 当前 bid period 有至少一条 calendar pairing bid。
- 测试 pairing 最好包含多航段 duty，便于验证 `Total Credit` 不按 segment 重复累计。
- 测试 pairing 应包含 `pairing_composition`、`duty_sch_dp_min`、`duty_ref_tz`，便于验证字段不是硬编码占位。
- 可同时打开 Gantt 的 Pairing Info 作为人工对照。
- 建议使用宽屏视口验证，例如 1920×1080 或更高。

## 场景 1：Pairing Details 表头与 Gantt 对齐

1. 打开 PBS Portal Dashboard 或任一包含左侧 `BIDDING CALENDAR` 的 PBS 工作台页面。
2. 在左侧 `BIDDING CALENDAR` 点击一条 pairing bid。
3. 查看 `Pairing Details` 中 legs 明细表头。

预期结果：

- 表头顺序为：

  ```text
  QUAL / ALN / Flight / Fleet / ACC / Ref / DEP / PCK / RPT / STD / ATD / ARR / STA / ATA / DRP / GT / BH / FT / MRT / Duty
  ```

- 旧表头不再出现：

  ```text
  Day / FDP / F/H / D/H / CRD / FLTN / DPS / ARS / BLKT / EQP
  ```

- 表头与数据列一一对齐，不出现被压缩到不可读的列名。

## 场景 2：时间和 duration 展示可读

1. 保持 `Pairing Bid` 弹窗打开。
2. 查看 `PCK / RPT / STD / ATD / STA / ATA / DRP`。
3. 查看 `GT / BH / FT / MRT / Duty / Total Credit / Total BH`。

预期结果：

- 时刻字段显示为类似 `06:15`、`07:35` 的可读格式。
- duration 字段显示为类似 `5:31`、`10:00|10:00`、`29:20` 的可读格式。
- 页面不显示裸 compact 数字，例如 `0609`、`3226`、`1476`。
- 缺失字段显示为 `-` 或空白，不显示 `undefined` / `null`。

## 场景 3：摘要字段全部使用活数据

1. 保持 `Pairing Bid` 弹窗打开。
2. 查看 `Start / Base / Composition / Total Credit / Total BH / Total DP`。
3. 对照 Gantt 同一 pairing 的 Pairing Info。

预期结果：

- `Composition` 有源数据时显示真实编组，例如 `CA(1)`、`CA(1)FO(1)` 或 `IFD(1)FA(3)`，不再固定显示 `-`。
- `Total DP` 有源数据时显示真实 duty-level DP 汇总，格式为 `H:MM`，不再固定显示 `-`。
- `Start` 使用 pairing 实际开始日期，不用旧的 calendar active date 伪装。
- 源数据为空时可以显示 `-` 或空白，但不能把未接字段伪装成空。

## 场景 4：Total Credit 按 duty 去重

1. 选择一个同一 duty 下有多段 flight leg 的 pairing。
2. 在 Gantt Pairing Info 中记录 `Total Credit`。
3. 在 PBS Portal `Pairing Bid` 弹窗中查看 `Total Credit`。

预期结果：

- PBS Portal 的 `Total Credit` 与 Gantt Pairing Info 的 duty-level credit 口径一致。
- 同一个 `duty_seq` 下的多条 segment 不重复计入 `Total Credit`。
- `Total BH` 仍按 segment block time 求和。

## 场景 5：leg 列字段来自真实来源

1. 选择一个同一 duty 下有多段 flight leg 的 pairing。
2. 查看 `Ref / PCK / RPT / DRP / GT / FT / MRT / Duty`。
3. 对照 Gantt 同一 pairing 的 Pairing Info。

预期结果：

- `Ref` 有 `duty_ref_tz` 源数据时显示真实值。
- `PCK` 只在 duty 第一段显示 `pickup_start_utc`。
- `RPT` 只在 duty 第一段显示 `brief_start_utc`。
- `DRP` 只在 duty 最后一段显示 `dropoff_end_utc`。
- `GT` 在同一 duty 内相邻航段之间显示真实间隔。
- `FT` 使用实际起落时间 `act_str_dt_utc -> act_end_dt_utc`，不是简单复制 `BH`。
- `Duty` 显示在 duty 最后一段，包含真实 `LO / FDP / DP / ETRTZ` 片段。

## 场景 6：tier 编辑回归

1. 在可编辑 period 内打开一条可修改 tier 的 pairing bid。
2. 修改 `APPLY TO TIERS` 勾选。
3. 点击 `SAVE BID`。

预期结果：

- tier 勾选、清空、保存行为保持不变。
- 保存后日历数据刷新。
- 新的 Gantt-style legs grid 不影响 pairing bid 保存。

## 异常与边界场景

- Pairing Details loading / error / empty 状态仍正常显示。
- 缺少 actual time 的 leg 显示 `-` 或空白，不能报错，不能用 scheduled time 假装 actual time。
- 窄屏视口允许表格内部横向滚动，但弹窗本身仍居中，背景遮罩仍覆盖到底。

## 自动化验证

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/pairing-search/pairing-search-service.test.ts
node --import tsx --test src/routes/pairing-search.test.ts
npm test
npm run build

cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx src/app/layout/shared-bidding-workbench-layout.test.tsx src/features/dashboard/pages/dashboard-page.test.tsx
npm test
npm run lint
npm run build
```

## UI 与 E2E 回归

```bash
cd /Users/lei/Codehub/rois-ai
npm run check:ui

cd /Users/lei/Codehub/rois-ai/e2e
PBS_PORTAL_BASE_URL=http://localhost:3030/pbs npm run test:pbs-portal -- --no-deps portal-smoke.spec.ts
```
