# PBS Pairing Search Duty KPI 展示设计

日期：2026-06-10  
范围：PBS Portal `/fpqe/pbs/pairing/search` 任务环搜索结果详情卡片

## 背景

`/fpqe/pbs/pairing/search` 页面当前展示的是 Pairing / 任务环结果卡片。卡片里已经有环号、基地、report 时间、priority、航段列表、`TBLK`、`TCRD`、`TPAY` 和右侧 mini calendar，但每个 duty 的关键工作量指标不足。

客户希望在任务环详情里增加 duty level KPI：

- `FDP`
- `F/H`
- `D/H`
- `CRD`

同时，当前航段表头里的 `DH` 不再展示。

需要注意：当前页面里的 `DH` 不是 `Duty Hour`，而是 Deadhead 标记列。现有实现只显示 `Y` 或空值，不会显示小时数。后端当前判断 deadhead 的逻辑为 `seg_assignment === "DHD"`，而数据库注释和部分 seed 配置里存在 `DH` / `DHD` 两种命名线索。既然本轮客户明确不要显示 `DH`，本轮不继续修复该列展示，而是直接移除该列，避免和 `D/H` 产生语义冲突。

## 目标

- 在 pairing search 结果卡片中增加 duty level KPI 展示。
- 新增 KPI 缩写固定为：
  - `FDP`
  - `F/H`
  - `D/H`
  - `CRD`
- 移除现有 leg 明细中的 `DH` 表头和对应 deadhead 标记值。
- KPI 使用 `pairing_segment` 中 duty 级字段，按 `pairing_id + duty_seq` 口径展示。
- 保持现有 pairing search 查询、分页、criteria preview 和 pairing details 能力不变。
- 保持现有 `TBLK`、`TCRD`、`TPAY`、mini calendar、航段起降信息展示不变。

## 非目标

- 不修改数据库 schema。
- 不新增 migration。
- 不改变 pairing search 的筛选条件语义。
- 不修改 Deadhead Legs / Deadhead Day 等搜索条件，搜索条件仍可继续按现有 `seg_assignment` 逻辑工作。
- 不新增独立 duty 展开面板或新页面。
- 不改 PBS bid draft 保存结构。
- 不在本轮继续展示或保留 deadhead 明细字段；如果后续确认 Deadhead 搜索条件的取值判断本身有 bug，应按独立 bug 修复，而不是在本轮 KPI 契约里保留模糊字段。

## 当前实现定位

前端页面：

- `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`
- `pbs-portal/src/features/pairing/components/pairing-search-panel.tsx`
- `pbs-portal/src/features/pairing/components/pairing-detail-card.tsx`
- `pbs-portal/src/features/pairing/types.ts`

前端服务：

- `pbs-portal/src/shared/services/pairing-service.ts`

后端接口与查询：

- `packages/contracts/pbs-search-pairings.d.ts`
- `pbs-server/src/routes/pairing-search.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`

数据库字段主要来自 live schema 的 `pairing_segment`：

- `duty_seq`
- `duty_sch_fdp_min`
- `duty_act_fdp_min`
- `duty_sch_flt_min`
- `duty_act_flt_min`
- `duty_sch_duty_min`
- `duty_act_duty_min`
- `duty_sch_credited_minutes`
- `duty_act_credited_minutes`

## 推荐方案

按 duty 分组，把 duty KPI 展示在该 duty 的第一条 leg 行上。同一个 `duty_seq` 下的后续 leg 行不重复展示 KPI，只展示航段自身信息。

推荐表头调整为：

```text
DAY | FDP | F/H | D/H | CRD | FLTN | DPS | ARS | DEP | ARR | BLKT | EQP
```

说明：

- `DAY` 继续显示 `duty_seq`。
- `FDP`、`F/H`、`D/H`、`CRD` 只在每个 duty 的第一条 leg 行显示。
- 原 `DH` deadhead 列移除。
- 原 `GRNT` 列同步移除，因为新增 `CRD` 已承担本轮确认的 duty-level credit 展示；本轮不保留 segment-level grant/credit 的旧展示入口。
- `BLKT` 保持 segment-level block time，不变。
- `EQP` 保持 segment-level equipment，不变。

这个方案可以在不引入新 UI 区块的前提下，把 duty KPI 贴近航段明细展示，用户扫描一个 pairing 时可以直接看到每个 duty 的核心指标。

## 备选方案

### 方案 A：KPI 放在 duty 第一条 leg 行（推荐）

每个 `duty_seq` 的第一条 leg 展示 `FDP / F/H / D/H / CRD`，后续同 duty leg 留空。

优点：

- 改动小，沿用现有表格结构。
- 不重复刷屏，视觉密度可控。
- 用户能看出 KPI 属于哪个 duty。

缺点：

- 如果用户没有意识到后续空白表示同 duty，可能需要通过视觉分组或轻微样式区分。

### 方案 B：每条 leg 都重复 duty KPI

同一个 duty 下每条 leg 都显示同一组 KPI。

优点：

- 每行信息完整，不需要理解空白含义。

缺点：

- 多 leg duty 会重复很多值，卡片更拥挤。
- KPI 是 duty-level，不是 segment-level，重复展示容易误导。

### 方案 C：新增 duty summary 行

在每个 duty 开始前插入一行 duty summary，例如 `D1 FDP 0830 F/H 0520 D/H 0930 CRD 0600`。

优点：

- 语义最清晰，duty KPI 和 segment 明细分层明确。

缺点：

- UI 改动比本轮需求大。
- 需要更多 CSS 和测试覆盖，可能影响卡片高度和分页体验。

## 字段口径

本轮按计划口径优先，因为 pairing search 是 PBS bid 前查看任务环，用户通常关注计划排班信息。

| KPI | 缩写 | 首选字段 | fallback 字段 | 含义 |
| --- | --- | --- | --- | --- |
| FDP | `FDP` | `duty_sch_fdp_min` | `duty_act_fdp_min` | duty 的 Flight Duty Period，分钟 |
| Flying Hour | `F/H` | `duty_sch_flt_min` | `duty_act_flt_min` | duty 飞行时间，分钟 |
| Duty Hour | `D/H` | `duty_sch_duty_min` | `duty_act_duty_min` | duty 总时长，分钟 |
| Credit Hour | `CRD` | `duty_sch_credited_minutes` | `duty_act_credited_minutes` | duty credit，分钟 |

如果首选字段和 fallback 字段都为空：

- 前端显示空字符串或 `--`。
- 推荐使用 `--`，避免表格列宽因完全空白难以识别。

## 展示格式

`FDP`、`F/H`、`D/H`、`CRD` 都按紧凑 hour 格式展示：

```text
HHMM
```

示例：

- `510` 分钟展示为 `0830`
- `360` 分钟展示为 `0600`
- `75` 分钟展示为 `0115`

原因：

- 现有 pairing 卡片里 `BLKT` / `TBLK` 已使用类似紧凑时间风格。
- 客户明确要求使用缩写，整体应保持航空排班界面常见的紧凑信息密度。
- `CRD` 虽然底层是 credit minutes，也按 hour 格式展示，以匹配 “credit hour” 的需求描述。

## 数据结构设计

后端返回的 leg 明细需要增加 duty KPI 字段，并同步清理旧字段。`PbsSearchPairingsLeg` 调整为：

```ts
export type PbsSearchPairingsLeg = {
  id: string;
  day: number;
  dutyFdp: string;
  dutyFlyingHour: string;
  dutyHour: string;
  dutyCredit: string;
  flightNumber: string;
  departureStation: string;
  arrivalStation: string;
  departureTime: string;
  arrivalTime: string;
  blockTime: string;
  equipment: string;
};
```

同时从 contract、后端返回 mapper、前端类型、mock 和测试数据中同步移除：

```ts
deadhead: boolean;
credit: string;
```

其中：

- `deadhead` 对应旧 `DH` 列，本轮确认移除，不再作为 pairing search leg 契约字段返回。
- `credit` 对应旧 leg row 的 `GRNT`，本轮确认移除，不再作为 pairing search leg 契约字段返回。
- 实施时不保留“前端不用但后端还返回”的过渡字段。调用点、mock 和测试必须同步改干净；如果后续发现业务口径错了，再按错误口径修正，而不是保留旧字段制造假正确。

## 后端映射设计

`loadSegmentsByPairingId()` 查询 `pairing_segment` 时，需要额外选择 duty 级字段：

- `duty_sch_fdp_min`
- `duty_act_fdp_min`
- `duty_sch_flt_min`
- `duty_act_flt_min`
- `duty_sch_duty_min`
- `duty_act_duty_min`
- `duty_sch_credited_minutes`
- `duty_act_credited_minutes`

`mapPairingResult()` 处理每个 pairing 的 segments 时：

1. 按 `duty_seq` 排序，保持现有 `duty_seq asc, seg_seq asc`。
2. 判断当前 segment 是否为该 `duty_seq` 的第一条 segment。
3. 如果是第一条，输出 duty KPI 格式化值。
4. 如果不是第一条，输出空字符串或 `--`，推荐空字符串，让第一条 duty KPI 更突出。

示例逻辑：

```text
seenDutySeq = Set()

for segment in segments:
  isFirstLegOfDuty = !seenDutySeq.has(segment.duty_seq)
  if isFirstLegOfDuty:
    seenDutySeq.add(segment.duty_seq)
    dutyFdp = formatMinutes(coalesce(duty_sch_fdp_min, duty_act_fdp_min))
  else:
    dutyFdp = ""
```

`totalCredit` / `totalPay` 的现有汇总逻辑暂不改变，避免本轮展示需求影响页面统计口径。

## 前端展示设计

`PairingDetailCard` 表头从：

```text
DAY | DH | FLTN | DPS | ARS | DEP | ARR | BLKT | GRNT | EQP
```

调整为：

```text
DAY | FDP | F/H | D/H | CRD | FLTN | DPS | ARS | DEP | ARR | BLKT | EQP
```

每行展示：

- `DAY`：`leg.day`
- `FDP`：`leg.dutyFdp`
- `F/H`：`leg.dutyFlyingHour`
- `D/H`：`leg.dutyHour`
- `CRD`：`leg.dutyCredit`
- `FLTN`：`leg.flightNumber`
- `DPS`：`leg.departureStation`
- `ARS`：`leg.arrivalStation`
- `DEP`：`leg.departureTime`
- `ARR`：`leg.arrivalTime`
- `BLKT`：`leg.blockTime`
- `EQP`：`leg.equipment`

CSS 需要同步调整 grid columns，保证新增 4 列后卡片仍能在当前结果面板宽度内可读。

如果宽度不足，推荐策略：

- KPI 列使用短宽度，例如 `FDP/F/H/D/H/CRD` 固定 34-42px。
- 航班号、机场、时间列沿用现有紧凑宽度。
- 避免横向滚动，优先通过更紧凑的 column template 适配。

## 错误处理

- duty KPI 字段为空或无法解析为数字时，展示 `--` 或空字符串，不阻断整张 pairing 卡片展示。
- 某个 pairing 没有 segment 时，保持现有空 legs 行为，不额外抛错。
- 后端查询字段类型为 numeric / integer 时统一转成 number 后格式化；无法解析时按缺失处理。
- 不因为旧 `seg_assignment` 的 `DH` / `DHD` 差异影响本轮展示。

## 测试计划

后端测试：

- 更新 `pairing-search-service.test.ts` 或相关 route/service 测试：
  - mock segment 带 duty KPI 字段时，返回 `dutyFdp / dutyFlyingHour / dutyHour / dutyCredit`。
  - 同一个 duty 多条 segment 时，只有第一条 leg 展示 duty KPI，后续 leg 为空。
  - 计划字段为空时 fallback 到实际字段。
  - 计划和实际字段都为空时返回缺失占位。

前端测试：

- 更新 `pairing-detail-card` 或 `search-pairings-page` 相关测试：
  - 表头显示 `FDP / F/H / D/H / CRD`。
  - 表头不再显示旧 `DH`。
  - leg row 不再显示 deadhead `Y`。
  - duty KPI 正确渲染到对应行。
  - `TBLK / TCRD / TPAY` 仍正常显示。

回归验证建议：

- `npm test -- pairing-search`
- `npm test -- search-pairings-page`
- 如果 contract 类型改动较多，补跑 `pbs-server` 和 `pbs-portal` 相关 typecheck。

人工 QA 建议：

1. 打开 `/fpqe/pbs/pairing/search`。
2. 进入 current rules preview 或 criteria search，确保结果卡片正常出现。
3. 确认航段表头不再有 `DH`。
4. 确认航段表头显示 `FDP / F/H / D/H / CRD`。
5. 找一个多 duty pairing，确认每个 duty 的第一条 leg 显示 KPI。
6. 确认同 duty 后续 leg 不重复显示 KPI。
7. 确认 `BLKT`、`TBLK`、`TCRD`、`TPAY`、mini calendar 仍正常。

## 验收标准

- `/fpqe/pbs/pairing/search` 的 pairing 详情卡片不再展示旧 `DH` 列。
- pairing 详情卡片展示 `FDP / F/H / D/H / CRD` 四个 duty KPI 缩写。
- KPI 数据来自 `pairing_segment` duty 级字段，并按 `duty_seq` 展示。
- 同一个 duty 下 KPI 不被错误计算成 segment-level 值。
- KPI 时间格式和现有卡片风格一致，使用紧凑 `HHMM` 风格。
- 现有搜索条件、分页、pairing details 加载、summary 统计不回退。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本需求影响范围清晰，主要是 pairing search contract、后端 mapper、前端卡片展示和测试，串行实现更快且不容易产生字段契约冲突。
- Suggested split: 不拆分。
- Write boundaries: 后续实现主要涉及 `packages/contracts/pbs-search-pairings.d.ts`、`pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`、`pbs-portal/src/features/pairing/components/pairing-detail-card.tsx`、`pbs-portal/src/features/pairing/types.ts` 及相关测试。
- Conflict risk: 中。旧 `deadhead` / `credit` 字段必须从 contract、mapper、前端类型、mock 和测试中同步移除，需要实施时完整检查调用点，避免留下看似无害但语义过期的字段。
- Execution gate: 用户审核并确认本 spec 后，再进入代码实现。
