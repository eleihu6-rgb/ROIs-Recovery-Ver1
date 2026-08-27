# PBS Pairing Search Duty KPI 展示回归测试

## 前置条件

- PBS Portal 可正常进入 Pairing 模块。
- PBS Server 的 `/api/pairing-search/preview` 和 `/api/pairing-search/pairing-details` 可正常返回 pairing 数据。
- 测试 bid period 中至少有一个 pairing 的 `pairing_segment` 存在 duty 级字段：
  - `duty_sch_fdp_min` 或 `duty_act_fdp_min`
  - `duty_sch_flt_min` 或 `duty_act_flt_min`
  - `duty_sch_duty_min` 或 `duty_act_duty_min`
  - `duty_sch_credited_minutes` 或 `duty_act_credited_minutes`
- 测试数据中最好包含同一个 `duty_seq` 下多条 leg 的 pairing，用于确认 duty KPI 不重复展示。

## 测试范围

- `/fpqe/pbs/pairing/search` 搜索结果卡片。
- Dashboard / 左侧 bidding calendar 的 pairing bid 详情弹窗。
- Tier 页面 pairing set preview。
- Pairing search preview 后端返回 contract。

## 用例 1：搜索结果卡片显示 duty KPI 表头

1. 打开 `/fpqe/pbs/pairing/search`。
2. 使用任一可返回结果的 Search Criteria 触发 preview。
3. 查看第一张 pairing result card 的 leg 明细表头。

预期结果：

- 表头显示 `DAY / FDP / F/H / D/H / CRD / FLTN / DPS / ARS / DEP / ARR / BLKT / EQP`。
- 不显示旧 `DH` 表头。
- 不显示旧 `GRNT` 表头。

## 用例 2：每个 duty 只在第一条 leg 展示 KPI

1. 找到一个同一 `duty_seq` 下包含多条 leg 的 pairing。
2. 查看该 duty 的第一条 leg 和后续 leg。

预期结果：

- 第一条 leg 显示 `FDP / F/H / D/H / CRD`，格式为 `HHMM`，例如 `0830`。
- 同一 duty 的后续 leg 不重复显示 duty KPI。
- 后续 leg 的 `FLTN / DPS / ARS / DEP / ARR / BLKT / EQP` 仍正常显示。

## 用例 3：计划值为空时使用实际值兜底

1. 准备或查找一条 duty 计划字段为空、实际字段有值的数据。
2. 打开对应 pairing 的 search preview。

预期结果：

- `FDP` 使用 `duty_act_fdp_min` 格式化值。
- `F/H` 使用 `duty_act_flt_min` 格式化值。
- `D/H` 使用 `duty_act_duty_min` 格式化值。
- `CRD` 使用 `duty_act_credited_minutes` 格式化值。

## 用例 4：计划值优先于实际值

1. 准备或查找一条 duty 计划字段和实际字段都有值且数值不同的数据。
2. 打开对应 pairing 的 search preview。

预期结果：

- 页面展示计划字段的值。
- 不因实际字段存在而覆盖计划字段。

## 用例 5：字段缺失时显示占位

1. 准备或查找一条 duty 计划字段和实际字段都为空的数据。
2. 打开对应 pairing 的 search preview。

预期结果：

- 对应 duty KPI 显示 `--`。
- 页面不出现空白卡片、报错或布局错位。

## 用例 6：Calendar pairing 详情弹窗同步展示新表头

1. 在 Dashboard 或任意共享 bidding calendar 入口点击一个已有 pairing bid。
2. 打开 pairing bid detail dialog。
3. 查看 dialog 内 pairing leg 明细。

预期结果：

- 表头显示 `FDP / F/H / D/H / CRD`。
- 不显示旧 `DH`。
- 不显示旧 `GRNT`。
- 详情仍能正常显示 `BASE`、`REPORT`、`TBLK`、`TCRD`、`TPAY`。

## 用例 7：Tier pairing set preview 同步展示新表头

1. 打开 `/fpqe/pbs/tier`。
2. 进入包含 pairing set preview 的 tier 详情或右侧预览区域。
3. 查看 pairing leg 明细。

预期结果：

- 表头显示 `FDP / F/H / D/H / CRD`。
- 不显示旧 `DH`。
- 不显示旧 `Crdt` 或旧 leg-level credit 列。
- Tier 页面 pairing preview 不因字段契约变更出现空白或异常。

## 回归范围

- Deadhead 相关搜索条件仍按原有筛选逻辑工作，本轮只移除 pairing search 结果明细里的旧 `DH` 展示列。
- `TBLK`、`TCRD`、`TPAY` 汇总展示保持原有口径。
- Pairing Number preview、Favorite preview、Existing property preview 和 Criteria preview 都应返回相同的新 leg contract。
- 前端 mock、测试数据和共享 contract 不再包含 pairing search leg 旧字段 `deadhead` / `credit`。
