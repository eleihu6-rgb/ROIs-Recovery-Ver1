# PBS Pairing Search Result Card 布局修复设计

日期：2026-06-10  
范围：PBS Portal `/fpqe/pbs/pairing/search` 任务环搜索结果卡片

## 背景

任务环详情卡片新增 `FDP / F/H / D/H / CRD` 后，leg 明细从 10 列增加到 12 列。当前卡片左侧内容区域仍固定为 `472px`，导致明细表格被压缩，航班号、机场三字码和时间列视觉上挤在一起；同时卡片右侧和中间仍有较大空白未被使用。

后续检查发现，当前第一列标题为 `DAY`，但该列实际显示的是 duty sequence，不是日历日期。对于 `P4` pairing 中存在 5 个 duty 的情况，用户容易误以为右侧 mini calendar 少亮了一天。因此需要把第一列改为 `DUTY`，并额外显示 duty 对应的日期。

## 目标

- 让左侧 pairing 明细区域使用卡片中除 mini calendar 外的剩余空间。
- 提升 12 列 leg 明细的可读性，避免列之间挤压。
- 保持右侧 mini calendar 固定在右侧，不改变现有卡片信息结构。
- 容器变窄时优先允许明细横向滚动，不把文字压到重叠。
- 将第一列从 `DAY` 改为 `DUTY`，准确表达它是 duty sequence。
- 新增 duty 日期列，用短日期格式显示 duty start date，帮助解释多个 duty 可以落在同一 calendar day。

## 非目标

- 不修改 duty KPI 口径，也不保留旧字段兼容层；字段要么按新 contract 正确返回，要么由测试暴露问题后继续修。
- 不调整 mini calendar 的日期逻辑。
- 不重做 Search Pairings 页面整体布局。
- 不修改 Award 页面自己的 trip card 展示。
- 不把 duty sequence 当作 calendar day，也不因为 duty 数量大于 `duration_days` 而改变 active dates 点亮口径。

## 方案

1. 移除 `.resultMain` 的固定 `width: 472px`，保留 `min-width: 0`，让它跟随 `.resultCard` 的左侧 grid column 自适应。
2. `.resultCard` 保持两列结构：左侧 `minmax(0, 1fr)`，右侧 mini calendar 固定宽度；增加合理 `column-gap`。
3. 新增局部 leg 明细滚动容器，仅包住表头和 leg 行；主内容区域本身不作为滚动容器，避免出现内部竖向滚动条。
4. 调整 `.legHeader` / `.legRow` 的 grid 列宽和列间距：
   - 第一列表头改为 `DUTY`，值仍显示 duty sequence。
   - 第二列新增 `DATE`，显示 duty start date 的 `MMDD` 格式，例如 `0427`。
   - duty KPI、日期和时间列使用稳定宽度。
   - 航班号列使用更宽的固定宽度，避免 `F82612` 这类长航班号贴到下一列。
   - 机场列保持足够三字码宽度。
5. 给 leg 明细滚动容器增加 `overflow-x: auto`，在较窄宽度下保护表格不重叠。
6. 后端 leg 数据新增 duty date 字段：
   - 日期来源优先使用 duty start date；如无 duty start date，fallback 到该 duty 第一段的 segment start date。
   - 日期需要映射到当前 `periodCode` 的年月，口径与 mini calendar active dates 一致。
   - 返回给前端的展示值使用 `MMDD`，保持与 `HHMM` 时间字段相同的短数字风格。
7. 同一个 calendar day 上存在多个 duty 时，每个 duty 第一行显示同一个 `MMDD`；同一 duty 的后续 leg 行可以留空，保持与 `FDP / F/H / D/H / CRD` 只在 duty 首行显示的视觉分组一致。

## 验收标准

- 搜索结果卡片内 `DUTY / DATE / FDP / F/H / D/H / CRD / FLTN / DPS / ARS / DEP / ARR / BLKT / EQP` 不再拥挤。
- `DUTY` 显示 duty sequence，不再使用 `DAY` 文案。
- `DATE` 显示 `MMDD`，例如 Apr 27 显示为 `0427`。
- 当 5 个 duty 分布在 4 个 calendar day 时，右侧 mini calendar 仍按 active dates 点亮 4 天，左侧通过 `DATE` 展示哪些 duty 落在同一日期。
- 左侧明细明显使用 mini calendar 左侧的剩余空间。
- 右侧 mini calendar 位置保持稳定。
- `pbs-portal` 相关 pairing search 测试通过。
- `pbs-portal npm run build` 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单个卡片 CSS 布局修复，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `packages/contracts/pbs-search-pairings.d.ts`、`pbs-server/src/services/pairing-search/`、`pbs-portal/src/features/pairing/` 及相关测试 fixture。
- Conflict risk: 低。
- Execution gate: 用户已确认可以实施。
