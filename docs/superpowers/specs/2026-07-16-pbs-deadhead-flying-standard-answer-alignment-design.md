# PBS Deadhead Flying 标准答案对齐设计

## 背景

当前 `propertyCode = 122` 的 `Deadhead Flying` 是一个三选一下拉框：

- `Any deadhead`
- `Deadhead-only duty`
- `Deadhead legs`

其中 `Deadhead legs` 还会展开 `< / = / > / Between` 和数字输入。该实现来自 2026-07-14 的合并设计，但与本轮确认的标准答案不一致。

本轮标准答案要求：

- `Deadhead Flying` 只保留两个固定显示的选择：`Any deadhead` 与 `Deadhead-only duty`。
- 两个选项互斥单选，不再使用下拉框。
- 删除 `Deadhead legs` 数字比较能力。
- 增加可选的 `LIMIT TO FLIGHT DATE`，并与 Flight Number Preference / Redeye Preference 已统一的日期控件一致。

项目尚未上线，本轮不兼容旧 `deadhead-legs` payload，也不迁移旧 property 122 bids/favorites。

本 spec 取代 `docs/superpowers/specs/2026-07-14-pbs-deadhead-flying-design.md` 中关于三种 mode 和 `Deadhead legs` 数字比较的员工端设计；旧文档中的 `seg_assignment = 'DHD'` 数据口径及 `deadhead-only duty` 定义继续有效。

## 目标

1. 将 `Deadhead Flying` 收敛为两个固定、互斥的单选项。
2. 默认选择 `Any deadhead`。
3. 保留 `Award / Avoid`，新增条件默认 `Award`。
4. 增加默认关闭的 `LIMIT TO FLIGHT DATE`。
5. 日期限制开启后支持 Specific Dates 多选和 Date Range。
6. Pairing、Search Pairings、Pool Count、summary 和算法导出共享同一个正向 Deadhead 匹配集合；Search/Pool Count 再应用 Award/Avoid，算法导出则把正向命中写入对应 action counter。
7. 严格拒绝旧 `deadhead-legs` 和旧数字比较字段。
8. 通过幂等 migration 清理 property 122 的旧 bids/favorites/default 数据。

## 非目标

- 不新增 property code。
- 不恢复旧 `Deadhead Day`、`Prefer Deadheads` 或 `Avoid Deadheads` 入口。
- 不保留 `Deadhead legs` 的 `< / = / > / Between` 能力。
- 不兼容旧 `stepper`、`stepper-range`、`flag`、`select` 或 `deadhead-legs` payload。
- 不改变 `pairing` / `pairing_segment` 表结构。
- 不改变 `seg_assignment = 'DHD'` 作为 deadhead segment 的既有判断口径。
- 不处理其他 property 中的 `Counting Deadhead Legs` 扩展语义。
- 不新增管理端配置页面。

## 已确认的产品决定

### Preference

- 保留 `Award` 与 `Avoid`。
- 新增 `Deadhead Flying` 默认选择 `Award`。
- 编辑已有合法条件时保留已保存的 action。

### Deadhead Flying

- 固定显示两个选项，不使用下拉框：
  - `Any deadhead`
  - `Deadhead-only duty`
- 两个选项互斥单选。
- 默认选择 `Any deadhead`。
- 完全移除 `Deadhead legs`、operator、legs、from/to 和 Between UI。

### Flight Date

- 标题：`LIMIT TO FLIGHT DATE`。
- 默认关闭；关闭表示不限制 flight date。
- 开启后默认显示 `Specific Dates`。
- 支持：
  - `Specific Dates`：可选择多个当前 bid period 内日期。
  - `Date Range`：选择当前 bid period 内的 From / To。
- 复用现有 `OptionalEventDateScopeEditor`，不另建日期组件。

## UI 设计

弹窗顺序：

1. `Configure Deadhead Flying`
2. `TIERS`
3. `PREFERENCE`
4. `DEADHEAD FLYING`
5. `LIMIT TO FLIGHT DATE`
6. Footer

### TIERS

- 使用现有 Tier toggle。
- 默认不选。
- Add Bid / Save Favorite 前至少选择一个 Tier。

### PREFERENCE

- 使用现有 Award/Avoid segmented control。
- 新增条件默认 `Award`。
- 切换 action 不清空 Deadhead mode 或日期。

### DEADHEAD FLYING

- 使用固定可见的单选控件。
- 选项顺序固定为：
  1. `Any deadhead`
  2. `Deadhead-only duty`
- 默认 `Any deadhead`。
- 不展示解释性段落。
- 不再渲染 `DEADHEAD LEGS` 区块。

### LIMIT TO FLIGHT DATE

- 使用 switch，默认关闭。
- 关闭时不显示日期内容，payload `dateScope = null`。
- 开启后复用统一日期控件：
  - `Specific Dates` / `Date Range` segmented tabs。
  - Specific Dates 支持多选。
  - 在两种模式之间切换时清理另一种模式的隐藏日期字段。

### Footer 门禁

Add Bid / Save Favorite 仅在以下条件同时满足时启用：

- 至少选择一个 Tier。
- action 是 `award` 或 `avoid`。
- mode 是 `any-deadhead` 或 `deadhead-only-duty`。
- 日期限制关闭；或开启后的日期 scope 完整有效。

## Payload 设计

推荐 contract：

```ts
type DeadheadFlyingBid = {
  type: "deadhead-flying";
  mode: "any-deadhead" | "deadhead-only-duty";
  dateScope: null | PairingSpecificDatesScope | PairingDateRangeScope;
};
```

日期结构沿用现有共享类型：

```ts
type PairingSpecificDatesScope = {
  mode: "specific_dates";
  dates: string[];
};

type PairingDateRangeScope = {
  mode: "date_range";
  from: string;
  to: string;
};
```

规则：

- `dateScope = null` 表示不限制 flight date。
- 日期字符串只接受严格 `YYYY-MM-DD`。
- `specific_dates` 必须至少包含一个合法 ISO 日期。
- specific dates 在 normalize / clone / serialize 时去重并排序。
- `date_range` 必须同时包含 From / To，且 `from <= to`；From/To 两端均包含。
- 所有日期必须位于当前 bid period。
- property 122 只接受上述严格 contract。
- Deadhead bid 对象和 `dateScope` 对象都必须拒绝未知字段，等价于 JSON Schema `additionalProperties: false` / Zod `.strict()`。
- 以下内容一律拒绝：
  - `mode = "deadhead-legs"`
  - `operator`
  - `legs`
  - Deadhead bid 顶层的旧数字比较 `from/to`
  - 旧 `stepper` / `stepper-range` / `flag` / `select` payload

`dateScope.mode = "date_range"` 内部的字符串日期 `from/to` 是合法字段；它们与 Deadhead bid 顶层旧数字比较 `from/to` 不属于同一层级。

## 匹配语义

### Any deadhead

无日期限制时，正向集合为 pairing 中存在任意 active DHD segment：

```sql
exists (
  select 1
  from <schema>.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and s.seg_assignment = 'DHD'
)
```

有日期限制时，同一个命中的 DHD segment 的 flight date 必须落入 date scope。

### Deadhead-only duty

无日期限制时，正向集合为 pairing 中存在至少一个 duty，且该 duty 的所有 active segments 都是 DHD：

```sql
exists (
          select 1
          from <schema>.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and s.duty_seq is not null
          group by s.duty_seq
          having count(*) > 0
             and count(*) filter (where s.seg_assignment = 'DHD') = count(*)
)
```

有日期限制时：

- duty 仍必须满足“所有 active segments 都是 DHD”。
- 该 duty 内至少一个 DHD segment 的 flight date 必须落入 date scope。
- 跨日纯 DHD duty 只要其中一个 DHD segment 命中所选 flight date 即命中。
- 权威 duty key 是同一 pairing 内的 `pairing_segment.duty_seq`。
- 当前权威 schema `sql/schema/live/02-crew-roster.sql` 将 `pairing_segment.duty_seq` 定义为 `NOT NULL`；SQL 仍显式排除 null，防止非权威旧数据或测试 fixture 形成假阳性。

### Flight date 数据口径

- 日期限制作用于 DHD 航段自身的 `pairing_segment.flt_dt`，不作用于 pairing origin date、UTC timestamp 或 duty start date。
- Specific Dates 使用 `s.flt_dt = any($dates::date[])`；Date Range 使用包含两端的 `s.flt_dt between $from::date and $to::date`。
- Portal 不计算业务日期，只提交严格 ISO 日期。
- SQL 必须使用参数化日期数组或参数化 range，不拼接用户输入。

### Period 权威上下文

- Pairing 新增/修改、Save Favorite、Search Pairings、current-rules counts 和 tier pools 都以请求中的 `periodCode` 为权威，并先通过现有 `normalizePreviewPeriodCode` / bid-period 解析流程。
- Portal 回显以当前页面所加载的 current bid period 为上下文；把 favorite 应用到草稿时，必须针对目标草稿的 `periodCode` 重新校验，不能沿用 favorite 创建时的月份假设。
- 算法导出以 `loadPairingScoreCsv(options.periodCode)` 为权威；其读取的 bid rows 同时受 `pbs_bid.period_code = options.periodCode` 限制。
- PBS Search、current-rules counts、tier pools 和算法导出必须复用 `buildPreviewCondition(..., { periodCode })` 所走的 property 122 flight-date clause。
- Live Search 使用相同的严格 ISO、period 与 `s.flt_dt` 表达式；两套 runtime 各自保留实现，但以共享 contract 和同一组跨模块 fixture/断言锁定语义，避免复制后漂移。

### Award / Avoid

- `Award`：Search Pairings 与 Pool Count 使用正向 Deadhead 集合。
- `Avoid`：Search Pairings 与 Pool Count 使用正向 Deadhead 集合的补集。
- 补集 universe 是已先通过公共资格过滤的候选 pairing：当前 period、actor base/rank、active/cancelled 状态以及入口已有的公共 scope；不得对全库 pairing 直接取补集。
- 算法导出不查询 Avoid 补集。它始终以 `action: "award"` 构造 property 122 的正向匹配条件，再根据保存的 action 把每个正向命中写入 award 或 avoid counter。这与现有 PAIRING_SCORE 设计一致。

### Pool Count contract

- `POST /api/pairing-search/current-rules/counts` 的 row rule、funnel 和 summary 必须通过 `buildCurrentRulesCondition` 使用上述 property 122 条件。
- `POST /api/pairing-search/current-rules/tier-pools` 的 Tx set、total pairings 和 pairings by Tx 必须使用同一条件。
- 对同一个 actor/base/rank/period/property 输入，单条 rule count 必须等于 Search Pairings 相同条件返回集合的总数。
- 分别覆盖两个 mode、Specific Dates、Date Range、Award 与 Avoid；Avoid count 应等于公共候选 universe 中不属于正向集合的数量。

### Algorithm export contract

- 用户已明确确认：保持现有 `PAIRING_SCORE` 文件格式和 counter 机制。Search/Pool Count 的 Avoid 使用补集；算法导出是必要例外，只对正向命中的 pairing 写 avoid counter，不能把补集写入 avoid counter，否则会反向惩罚不含 deadhead 的 pairing。
- 输入仍是 property 122 保存后的 group fields，经 `deserializeRuleBid` 恢复 `{ type, mode, dateScope }`；不新增 Deadhead 专用 CSV 列。
- `loadPairingScoreCsv` 使用 `buildSearchProperty` 强制 `action: "award"` 查询正向集合，并以保存的 `action_id` 解析最终 counter 类型。
- 输出继续使用现有 `PAIRING_SCORE` 行：`crewId, pairingId, interfaceId, award/avoid higher-credit tiers, T1 award counter, T1 avoid counter ...`。
- 示例：
  - T2 `Award + Any deadhead + Jul 03/Jul 08`：每个正向命中 pairing 的 T2 award counter `+1`，T2 avoid counter 不变。
  - T3 `Avoid + Deadhead-only duty + Jul 03-Jul 08`：每个正向命中 pairing 的 T3 avoid counter `+1`，T3 award counter 不变；不对未命中的 pairing 写 avoid counter。
- cache key / serialization 必须包含 mode 与完整 dateScope，两个日期条件不能错误复用同一个匹配集合。

## Summary 与回显

建议 summary：

- `Any deadhead`
- `Deadhead-only duty`
- `Any deadhead · Jul 03, Jul 08`
- `Deadhead-only duty · Jul 03–Jul 08`

要求：

- 已保存 action 必须原样回显。
- 已保存 mode 必须原样回显。
- Specific Dates 多选必须完整回显。
- Date Range 必须完整回显。
- Pairing 页面和 Search Pairings 使用同一 editor 与 formatter。

## 校验与错误处理

Portal：

- 非专用 payload 视为无效，不静默转成默认值后允许保存。
- 新增 draft 可以初始化为 `Award + Any deadhead + dateScope null`。
- Specific Dates 开启后为空时禁用保存。
- Date Range 缺少端点、范围反转或超出 period 时禁用保存。

PBS Server：

- route schema 和业务 validation 都使用严格 payload。
- date scope 必须通过当前 bid period 校验。
- 返回 Deadhead Flying 专属错误，不退化成通用成功或 Any date。

Search / Algorithm：

- Search Pairings、Pool Count 和算法导出必须在应用 action / counter 前硬拒绝无效 property 122 payload，不能把“无效正向条件 = false”再包装成 Avoid 的 `not(false)`。
- 若内部防御路径无法返回结构化错误，最终 action predicate 必须固定为 `false`，不能放宽为全部 pairing。
- Search/Pool Count 的 Avoid 不能通过修改 mode 来模拟，必须对正向集合取补集；算法导出按已确认的 counter 例外处理。

## 数据清理与 Catalog

更新 `propertyCode = 122`：

- `property_name = 'Deadhead Flying'`
- `award_or_avoid = '["award","avoid"]'`
- `any_or_every = null`
- `operator_options = null`
- `validation_json` 仅声明两个 mode 与可选 flight date scope。
- tooltip 更新为两个固定模式与可选 flight date 的描述。

### 旧数据策略

项目未上线，不兼容旧数据：

- 清理 property 122 的 configured favorites、simple favorites、generic favorites。
- 清理 property 122 相关 occurrences、conditions 和 groups。
- 删除清理后为空的 tier / bid 容器，并重算计数。
- 不把 `deadhead-legs` 自动转换为 `any-deadhead`。
- 不尝试保留旧 any/deadhead-only payload；统一清理可避免同一 property 混用新旧 contract。
- migration 必须幂等，可重复执行。
- migration 只能在隔离测试 schema 双跑验证后按部署流程执行，不直接对共享业务 schema 试跑。

### Migration 精确删除边界

- migration 整体放在单个事务中；任意断言或 FK 操作失败时整体回滚。
- 先解析 property 122 的 definition id，再建立目标 `property_group_key` 临时表；身份匹配同时覆盖 legacy `property_id = 122` 与 stable `property_definition_id`。
- group 是当前 Pairing property 的持久化原子：若 group 本身或 group 内任一 condition 指向 property 122，则删除该 `property_group_key` 对应的整个 group、其 occurrences 和全部 conditions。不得只留下缺少主条件的残缺 mixed group。
- 如果目标 group 内存在非 122 condition，它随整个目标 group 删除；这是原子 group 清理的预期结果，不承诺保留目标 `property_group_key` 内的其他子记录。
- 同一个 bid/tier 中位于其他 `property_group_key` 的非 122 groups、conditions、occurrences 必须完整保留。
- favorite 只按 property 122 的 `property_code` 或 definition id 删除，不按 bid 整体删除。
- 删除顺序固定为：
  1. `pbs_bid_pairing_configured_favorite`
  2. `pbs_bid_pairing_favorite`
  3. `pbs_bid_property_favorite`
  4. `pbs_bid_pairing_occurrence`
  5. `pbs_bid_condition`
  6. `pbs_bid_group`
  7. 重算受影响 tier 的 `total_groups`
  8. 仅删除没有 group 且没有 days-off 内容的空 tier
  9. 重算受影响 bid 的 `total_tiers`
  10. 仅在所有 tier/group/occurrence/favorite/day-off/line 关联都为空时删除 bid
- 本轮“default 数据”仅指 property 122 catalog 的 `defaultBid/defaultAction` 与 seed/migration metadata，不新增也不猜测独立 default 表；如 schema 中发现额外持久化 default 关系，必须先回到 spec 确认，不能扩大删除范围。
- 计数的权威来源是清理后实际 `pbs_bid_group` / `pbs_bid_tier` 行数，不使用删除前缓存值。

### Migration 双跑验证

隔离 schema fixture 至少包含：

- 纯 property 122 group。
- 同一 bid/tier 中 property 122 group 与另一个非 122 group 并存。
- property 122 目标 group 内含一个非 122 condition 的 mixed-group 防御 fixture。
- property 122 的三类 favorite。
- occurrence 与 condition 子记录。
- 含 days-off 或 line/favorite 关联、不得误删的 bid 容器。

第一次执行后断言：

- property 122 叶子记录和目标 groups 为 0。
- 目标 `property_group_key` 整体删除，包括 mixed-group fixture 内的非 122 condition。
- 目标 `property_group_key` 之外的非 122 groups/conditions/occurrences/favorites 行数与内容不变。
- 无孤儿 FK。
- `total_groups` / `total_tiers` 等于实际 count。
- 仅真正空的 tier/bid 被删除。

第二次执行后断言：

- 所有表行数、非 122 内容和计数与第一次执行后完全一致。
- migration 成功提交且删除计数为 0。

## 影响范围

预计涉及：

### Shared contract

- `packages/contracts/pbs-pairing-bids.js`
- `packages/contracts/pbs-pairing-bids.d.ts`

### PBS Portal

- `pbs-portal/src/features/pairing/types.ts`
- `pbs-portal/src/features/pairing/components/deadhead-flying-editor.tsx`
- `pbs-portal/src/features/pairing/components/deadhead-flying-editor.test.tsx`
- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
- `pbs-portal/src/features/pairing/pairing-bid-control-logic.ts`
- `pbs-portal/src/features/pairing/pairing-bid-summary.ts`
- catalog / clone / draft mapper 及相关测试

### PBS Server

- route schemas 与 route tests
- pairing property validation
- pairing search condition builder / detail conditions
- `pairing-search-service.ts` 的 current-rules counts / tier pools
- `routes/pairing-search.ts` 与 `routes/pairing-search.test.ts`
- rule bid clone / serialize / format
- algorithm export tests

### Live Server

- rule bid types / clone / serialize / format
- pairing search condition builder / detail conditions
- algorithm export tests

### SQL / Docs / E2E

- `sql/seed/10-pbs-bid-property.sql`
- 新的幂等 migration
- Deadhead Flying QA 文档
- Pairing / Search Pairings Playwright 回归

## 测试计划

### Portal 单元 / 组件测试

- 只显示两个固定 mode，不存在 mode 下拉框。
- 默认 `Any deadhead`。
- `Deadhead legs`、operator 和数字输入不存在。
- `LIMIT TO FLIGHT DATE` 默认关闭。
- 开启后默认 Specific Dates，可多选。
- Specific Dates 与 Date Range 互切时清理隐藏值。
- 已有 Award/Avoid、mode、多日期和 range 正确回显。
- 不完整日期使 Add Bid / Save Favorite 禁用。
- summary 正确。

### PBS Server 测试

- 接受两个 mode + `dateScope = null`。
- 接受 Specific Dates 多选并去重排序。
- 接受合法 Date Range。
- 拒绝空 Specific Dates、反转 range 和 period 外日期。
- 拒绝 `deadhead-legs` 与任何数字比较字段。
- Search SQL 对 `any-deadhead` 限制命中 DHD segment flight date。
- Search SQL 对 `deadhead-only-duty` 同时约束纯 DHD duty 与命中日期的 DHD segment。
- Award 使用正向集合，Avoid 使用补集。
- current-rules counts 和 tier pools 分别验证两个 mode、两种 date scope、Award/Avoid，并与 Search Pairings 总数一致。
- 算法导出验证上述 T2 Award 与 T3 Avoid counter 样例，确认 Avoid 只给正向命中 pairing 写 avoid counter。

### Live Server / Algorithm 测试

- clone / serialize / deserialize 保留 date scope。
- summary / formatter 展示 mode 和日期。
- Live Search 与 PBS Search 语义一致。
- Award/Avoid 算法 counter 都以相同正向匹配集合为基础。

### Playwright

真实 Portal 路径至少覆盖：

1. Pairing 页面新增 Deadhead Flying：默认 Award、Any deadhead、日期关闭。
2. 固定两个 mode 可切换，页面不存在 Deadhead legs 数字输入。
3. 开启 `LIMIT TO FLIGHT DATE`，选择两个 Specific Dates 并保存。
4. 请求 payload 包含两个 mode 之一和多日期 scope。
5. Search Pairings 打开已有 Avoid / Deadhead-only duty / Date Range 条件并正确回显。
6. 对受控 mock 候选集合验证 Search 结果总数和 Pool Count 一致，并验证 Award/Avoid 在公共候选 universe 内互为补集。

### QA 文档

新增或更新独立 QA 文档，覆盖：

- 默认值。
- 两个固定 mode。
- Specific Dates 多选。
- Date Range。
- Award/Avoid。
- Search Pairings 回显。
- 旧 deadhead-legs payload 拒绝。
- period 边界和无效日期。

## 验证命令

按最小相关范围开始，再扩大：

```bash
cd pbs-portal && npm test -- --run <deadhead-focused-tests>
cd pbs-server && node --import tsx --test <deadhead-focused-tests>
cd live-server && npx vitest run <deadhead-focused-tests>
cd pbs-portal && npx tsc --noEmit
cd pbs-server && npx tsc --noEmit
cd live-server && npx tsc --noEmit
cd pbs-portal && npm run lint -- --quiet
cd pbs-portal && npm run build
cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal <deadhead-tests>
# 仅在隔离 TEST_DATABASE_URL / test schema 中执行：
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migration/tests/<deadhead-fixture.sql>
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migration/<deadhead-migration.sql>
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migration/tests/<deadhead-verify.sql>
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migration/<deadhead-migration.sql>
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migration/tests/<deadhead-verify-second-run.sql>
npm run check:ui
git diff --check
```

完整模块测试的既有基线失败必须与本次聚焦回归分开报告。

## 验收标准

- 员工端 `Deadhead Flying` 只固定显示 `Any deadhead` 与 `Deadhead-only duty`。
- 两个 mode 互斥单选，默认 `Any deadhead`。
- 不再出现 Deadhead mode 下拉框、Deadhead legs、operator、数字或 Between 输入。
- 新增条件默认 Award，已有合法 action 正确回显。
- `LIMIT TO FLIGHT DATE` 默认关闭；开启后支持 Specific Dates 多选和 Date Range。
- 日期限制按 DHD segment flight date 匹配。
- Deadhead-only duty 同时满足“全 duty 为 DHD”和“至少一个 DHD segment 日期命中”。
- Pairing、Search Pairings、Pool Count 和算法导出语义一致。
- 旧 deadhead-legs 及数字比较 payload 被严格拒绝。
- migration 幂等清理 property 122 旧数据。
- Portal / Server 聚焦测试、Playwright、lint、build、TypeScript 和 UI gate 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: contract、Portal editor、PBS/Live Search 和 migration 围绕同一个严格 payload 同步变化，写入范围高度耦合；并行实现容易造成 date scope 或 mode 语义漂移。
- Suggested split: 单 agent 顺序完成 contract → Portal → PBS Server → Live Server → SQL/Docs → tests。
- Write boundaries: 只修改 Deadhead Flying 相关合同、UI、服务端逻辑、迁移和测试；不触碰当前工作区中的 Dashboard、日历、Dialog、AGENTS/CLAUDE 或其他任务文件。
- Conflict risk: 中高；共享 pairing contract、config dialog、search builder 和 seed 都是热点文件，提交前必须显式暂存并审查文件清单。
- Execution gate: 本 spec 经独立审查通过且用户明确批准后才能开始实施。
