# PBS Award 页面 publish-only 展示对齐设计

日期：2026-07-24
状态：已确认并实施
相关模块：`pbs-portal`、`pbs-server`
明确不改：`live-server`、live schema、`roster_publish` 发布逻辑、数据库 migration

## 背景

用户在 Award 页面检查 crew `533` 的 pairing `V4109` 时，发现 `ROSTER DETAILS` 和下方 `SELECTED DUTY` 与 Gantt `Pairing Info` 的展示口径不一致：

1. `Route / Location` 只显示 `YVR-YVR`，看不出实际飞到哪里。
2. `Position` 显示 `--`，应优先展示机上岗位 / acting rank。
3. `Credit` 显示 `21:00`，而 Pairing Info 的 `Total Credit` 为 `10:30`，明显是多航段 duty credit 被重复加总。
4. `Fleet / EQP` 与 Pairing Info 不一致。
5. `TAFB` 不应显示 `0:01` 这类 HH:MM，Award 页应显示 pairing start 到 pairing end 覆盖的整数天数，不包含航后 rest。
6. Award 页标题 / 明细表头与 Pairing Info 不一致，需要确认并统一。

用户补充的硬约束：

- Award 页面只能取 `roster_publish` publish 快照表。
- 只修改 Portal 侧，不修改 `live-server`。
- 不为对齐 Pairing Info 去 join live 原表，例如 `pairing`、`pairing_segment`、`roster_flight`。
- 不修改 publish 表结构，不执行 migration。
- 如果 Award 页面需要的字段在 publish 快照中不存在，页面可以明确展示字段缺失；不能静默伪造，也不能为了补字段绕开 publish-only 边界。
- 本次不是 MVP 占位页，而是要达到生产可用标准：所有展示字段必须真实、可解释、可回归；缺数据也是正式的数据质量状态，不是临时 placeholder。

## 生产可用原则

Award 页面是给真实用户查看最终发布 roster 的页面，不能用“看起来差不多”的数据替代真实字段。

本次遵守以下原则：

- 正确性优先于填满表格。宁可显示缺字段，也不展示一个看似精确但实际口径错误的值。
- publish-only 是硬边界。页面和 Award API 只能使用 `roster_publish` 中已有的发布快照字段。
- 缺字段要可见、可解释。字段缺失应在对应单元格和 selected duty 区域以专业、紧凑的方式提示，例如 `Missing published data`，并说明是 published roster snapshot 缺少该字段。
- 不能把 `--` 用作所有问题的统一遮盖。`--` 只用于业务上确实不适用的字段；数据本应存在但 publish 快照没有时，显示缺字段状态。
- 自动化和 Playwright 必须覆盖这些生产语义，不能只覆盖页面能渲染。

## 当前代码事实

当前 Award API 的 roster 主数据已经来自 `roster_publish`：

- `pbs-server/src/services/award/award-results-service.ts` 中 `loadRosterRows()` 查询 `${schema}.roster_publish rp`。
- 当前 service 没有 join `pairing` / `pairing_segment` / `roster_flight`。

但 mapper / UI 目前存在几个口径问题：

- `flight_acting_rank` 已从 `roster_publish` 查询出来为 `acting_rank`，但 `buildPairingItem()` 没有使用它，仍使用 `position`。
- `creditMinutes` 当前按 `legs.map(leg.creditMinutes)` 直接求和；如果同一 duty 的 credit 重复出现在多个 segment，就会把 `10:30` 加成 `21:00`。
- route 当前前端只取第一段出发机场 + 最后一段到达机场，因此 `YVR-GDL-YVR` 会被压成 `YVR-YVR`。
- `fleet` 当前来自 `roster_publish.pairing_fleet`，这是 pairing header fleet 快照；`roster_publish` 现有 schema 没有 `fleet_seg` / leg-level equipment 字段，因此本次不能从 publish-only 数据里恢复 Pairing Info 的 `7M8`。
- `tafbMinutes` 当前被前端统一按 minutes 格式化成 `H:MM`，不符合 Award 页需要的“整数天数”。

## 目标

1. Award 页面在不改 live、不 join live 原表的前提下，修正可由 `roster_publish` 支撑的展示口径。
2. `Route / Location` 改为能看出实际路径的 route chain，例如 `YVR-GDL-YVR`。
3. `Position` 改为优先展示 publish 快照里的 `flight_acting_rank`，例如 `CA`；如果多段不一致，显示合并值，例如 `CA / FO`。
4. `Credit` 改为按 publish 快照中的 `duty_seq` 去重加总，同一 duty 只计一次。
5. `TAFB` 改为整数天数，按 selected pairing 的本地 start date 到本地 end date inclusive 计算，例如同一天为 `1 day`，跨两天为 `2 days`。
6. 标题和表头改为更接近 Pairing Info 的可读口径，但不误导用户以为数据来自 Pairing Info。
7. 对 publish 快照不具备的数据，不伪造、不从 live 补、不显示为看似精确的错误值；页面明确提示 `Missing published data` / `Field missing from published roster snapshot`。

## 非目标

- 不修改 `live-server`。
- 不修改 `roster_publish` 表结构。
- 不修改 publish / sync / outbound 逻辑。
- 不新增 `fleet_seg`、`duration_days` 或其他 publish 快照字段。
- 不为了显示 `7M8` 去 join `pairing_segment` 或 `flight`。
- 不改 Pairing Info 弹窗。
- 不改 solver / award result 生成逻辑。
- 不改 Reason Report。

## 推荐方案

采用“publish-only mapper 修正 + Portal 展示重排”方案。

### 1. Route / Location

使用 `item.legs` 中的 publish 快照机场序列构造 route chain：

- `YVR -> GDL -> YVR` 显示为 `YVR-GDL-YVR`。
- 如果出现空机场，跳过空值。
- 如果只有起终点，显示 `DEP-ARR`。
- 如果 route 过长，表格行中可压缩为首末 + 中间计数，例如 `YVR-...-YVR`，`title` / selected duty 中显示完整 route。

这只依赖 `roster_publish.dep_arp` / `roster_publish.arv_arp`。

### 2. Position

后端 Award mapper 在 `buildPairingItem()` 中使用 publish 行的 acting rank：

优先级：

1. `flight_acting_rank` / query alias `acting_rank`
2. `roster_publish.position`
3. `active_rank`
4. `null`

多段处理：

- 所有非空 rank 一致：显示该 rank，例如 `CA`。
- 多个非空 rank 不一致：显示去重后 `CA / FO`。
- 全部为空：显示 `--`。

这只依赖 `roster_publish` 已有字段。

### 3. Credit

Pairing item 的 `creditMinutes` 按 duty 去重：

- 对有 `duty_seq` 的 publish 行，以 `duty_seq` 为 key。
- 每个 duty 只取一个 credit 值，优先 `act_credited_minutes`，其次 `sch_credited_minutes`。
- 如果 pairing 有多条 publish 行但 `duty_seq` 缺失，不能 fallback 到 leg-level 求和，因为这会重新制造 `21:00` 这类错误；pairing total credit 显示 `Missing published data`，并在 selected duty 中说明缺少 `duty_seq`，无法安全去重。
- 如果 pairing 只有一条 publish 行，且该行有 credit，可直接显示该 credit；这是单行事实，不涉及去重风险。
- leg row 的 `CRD` 是否继续显示，需要区分：
  - 如果 publish 行上的 credit 是 duty-level 值，多个 leg 都显示同一个 `10:30` 会误导。
  - 推荐：leg row 的 `CRD` 对重复 duty credit 显示 `Duty credit` 或空列，pairing footer / roster row 显示去重后的 `CREDIT: 10:30`。

这只依赖 `roster_publish.duty_seq`、`act_credited_minutes`、`sch_credited_minutes`。

### 4. Fleet / EQP

硬约束下不能直接对齐 Pairing Info 的 leg-level `7M8`，因为当前 `roster_publish` 只有：

- `pairing_fleet`：发布时快照 `pairing.fleet`

当前没有：

- `fleet_seg`
- leg-level equipment

因此本次推荐：

- selected duty 顶部继续显示 publish 快照的 `FLEET`，但该值代表 pairing-level publish fleet。
- leg 表格里的 `EQP` 不再复用 pairing-level fleet 填每一行；否则会制造“每段 EQP 都是 737”的假象。
- 如果 contract 没有真正 leg equipment，则 leg `EQP` 显示字段缺失状态，例如 `Missing published data`，并在 selected duty 区域显示一条紧凑提示：`Leg equipment is missing from the published roster snapshot.`。

如果业务必须在 Award 页显示 `7M8`，需要后续单独做 publish schema 增强，把 `pairing_segment.fleet_seg` 快照进 `roster_publish`。这不属于本次范围，因为用户明确不改 live / 不改 publish 表。

### 5. TAFB

Award 页面不再把 `tafbMinutes` 格式化为 `H:MM`。

推荐显示：

- `TAFB: 1 day`
- `TAFB: 2 days`

计算方式：

- 使用 pairing item 的本地 `startDate` 和 `endDate`。
- inclusive calendar day count：`endDate - startDate + 1`。
- 这符合用户描述的“pairing 开始到结束一共几天”，并自然排除航后 rest，因为 Award item 的 end 来自最后一段 flight / duty 的 publish end，而不是 rest end。

如果未来确认 TAFB 必须是 24 小时向上取整，可以单独改 spec；本次按 calendar day count。

### 6. 标题和列名

Award 页面本身是 published roster 页面，不完全等同于 Gantt Pairing Info 弹窗，但命名不应造成差异感。

推荐：

- `Selected Duty` 的 pairing 标题改为 `V4109`；如果 publish/API 有 pairing id，可显示 `V4109 #12793`。
- 如果 publish/API 没有 pairing id，不伪造 `#12793`。
- leg 表头从 `FLTN` 改为 `Flight`。
- 如果保留 equipment 列，表头用 `Fleet` 或 `EQP` 必须与数据来源一致；没有 leg equipment 时不显示假 `EQP`。

## 接口与合同影响

允许修改 `pbs-server` Award API 和 shared contract，但只读取 `roster_publish`：

- `packages/contracts/pbs-award-results.d.ts`
- `pbs-server/src/services/award/types.ts`
- `pbs-server/src/services/award/award-results-service.ts`
- `pbs-server/src/services/award/award-results-mapper.ts`

可新增 / 调整字段：

- `PbsAwardLeg.dutySeq?: number | null`
- `PbsAwardLeg.equipment` 保持 `null`，除非来自 publish 快照真实字段。
- `PbsAwardItem.position` 使用 acting rank 聚合结果。
- 如需要避免误用，可新增 `PbsAwardItem.routeLabel?: string`，但优先在前端从 legs 构造，减少 contract 扩张。

禁止：

- 在 Award API 中 join `pairing_segment`。
- 在 Award API 中 join `roster_flight`。
- 在 Award API 中读取 `pairing.fleet` 来覆盖 publish 快照。

## 前端影响

预计修改：

- `pbs-portal/src/features/award/award-mappers.ts`
  - `tafbLabel` 改为 days label。
  - 如需，增加 route chain helper。
- `pbs-portal/src/features/award/components/award-right-panel.tsx`
  - `Route / Location` 用完整 route chain。
  - selected duty header 文案对齐。
- `pbs-portal/src/features/award/components/award-trip-card.tsx`
  - `TAFB` 显示整数天数。
  - `FLTN` 改为 `Flight`。
  - 避免把 pairing-level fleet 当 leg `EQP` 展示。

## 测试计划

后端：

```bash
npm --prefix pbs-server test -- src/services/award/award-results-mapper.test.ts src/services/award/award-results-service.test.ts src/routes/award-results.test.ts
npm --prefix pbs-server run build
```

前端：

```bash
npm --prefix pbs-portal test -- src/features/award
npm --prefix pbs-portal run build
npm run check:ui
```

UI 回归：

- 使用 Playwright 打开 `/award`，验证真实页面中：
  - route chain 不再压成 `YVR-YVR`。
  - Position 显示 acting rank。
  - Credit 不重复加总。
  - TAFB 显示整数天数。
  - 没有展示来自非 publish 表的假 fleet / EQP。
  - publish 快照缺少必要展示字段时，页面出现明确字段缺失状态，而不是静默显示错误值或统一 `--`。

## 验收标准

- Award 页面 roster 数据只来自 `roster_publish` publish 快照。
- 不修改 `live-server`。
- 不修改 publish 表结构或 migration。
- 不 join `pairing` / `pairing_segment` / `roster_flight`。
- `Route / Location` 对 pairing 显示可理解路线，例如 `YVR-GDL-YVR`。
- `Position` 优先显示 publish 快照中的 `flight_acting_rank`。
- `Credit` 按 duty 去重，不把同一 duty 的 credit 重复加总。
- `TAFB` 显示整数天数，不显示 `0:01`。
- Fleet / EQP 不再展示为看似精确但实际来自 pairing-level 快照的错误 leg equipment；publish 缺 leg equipment 时显示字段缺失。
- 如果缺少 `duty_seq` 导致无法安全去重 credit，pairing total credit 显示缺字段状态，不 fallback 到错误求和。
- 标题和表头比当前页面更接近 Pairing Info 的业务语义，但不伪造缺失的 `#id` 或 leg equipment。
- 页面没有 MVP / placeholder 语义；所有缺失值都有明确生产可用的解释和测试覆盖。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该任务集中在 Award API contract / mapper 与 Award UI 展示之间，字段口径强耦合，拆分后容易出现前后端对字段来源理解不一致。
- Suggested split: 不拆；单 agent 先改 mapper/contract，再改 UI，再补测试。
- Write boundaries: `pbs-server` Award service/tests、`packages/contracts/pbs-award-results.*`、`pbs-portal/src/features/award/*`、必要 QA 文档。
- Conflict risk: Medium。当前工作树已有其他 PBS 未提交改动，实施时必须只 stage 本任务相关文件。
- Execution gate: 用户确认本 spec 后再实施。
