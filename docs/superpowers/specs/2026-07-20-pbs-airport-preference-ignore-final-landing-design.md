# PBS Airport Preference 忽略最终 Landing 设计

## 背景

`Airport Preference` 当前把 pairing 中每个 `pairing_segment.arv_arp` 都当作 `Landing` 事件。对 F8 这类 pairing 来说，最后一段通常会回到 crew 本基地。如果 crew 配置 `Avoid + Landing + 本基地机场`，现有搜索会因为每个 pairing 最后都会回基地而命中，最终可能把所有 pairing 都 avoid 掉。

用户确认的新语义是：`Airport Preference` 判断 `Landing` 时，不检查每个 pairing 的最后一个 landing。该规则对 `Award` 和 `Avoid` 都生效。

## 目标

- `Airport Preference` 的 `Landing` 事件集排除每个 pairing 最后一段的到达机场。
- `Avoid Landing <base airport>` 不再因为 pairing 正常结束回基地而过滤掉全部 pairing。
- 如果 pairing 中间过程曾 landing 到同一机场，仍然算命中。
- `Layover` 事件语义不变。
- `Both` 语义中只有 landing 分支排除最终 landing；layover 分支照常判断。
- `Preferred layover hours` 仍只限制 layover 分支，不限制 landing 分支。
- 不改前端 UI、payload、property code、数据库 schema 或 migration。

## 非目标

- 不新增 Airport Preference 开关、提示文案或员工端说明。
- 不改变 `Airport Preference` 的保存格式。
- 不改变 `Pairing Number` / 旧 `101` 这类普通到达机场条件，除非后续需求明确要求。
- 不根据 crew base 做特判。实现应排除“最后 segment”，不是只排除“等于 base 的最后 landing”。
- 不执行数据库 migration。

## 当前实现事实

- `propertyCode=168 Airport Preference` 的搜索条件在：
  - `pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts`
  - `live-server/src/services/pairing-search/pairing-search-detail-conditions.ts`
- 两处 `buildAirportPreferenceRowsQuery` 都把所有非删除 `pairing_segment` 的 `arv_arp` 放入 `airport_events`：
  - `event_type='landing'`
  - `airport_code=upper(s.arv_arp)`
  - `event_date` 使用到达机场本地日期
- `Avoid` 是在外层通过 intent wrapper 反转正向匹配结果，所以 Airport Preference 的正向事件集必须先正确。
- `pairing_segment` 有唯一键 `(pairing_id, duty_seq, seg_seq)`，可以用同一 pairing 下最大的 `duty_seq/seg_seq` 稳定定义“最后一段”。
- Portal 的 `Airport Preference` 专用下拉使用 `pbs-server/src/services/pairing-search/pairing-airport-options-query.ts` 返回的 `airportPreferenceOptions`。该 options 的每个 airport/city 带有 `events: ["landing" | "layover"]`。如果 `airportPreferenceOptions` 仍把最终 landing 计入 `landing` event，UI 会展示实际不可匹配的 Airport Preference landing 选项。
- 同一接口也返回通用 `landingAirports`，它仍服务旧通用机场选择，例如旧 `101 Any Landing In Airport`。本次不改变 `landingAirports` 的旧语义。

## 方案比较

### 方案 A：只对 `Avoid + crew base` 特判

做法：当 action 是 `avoid` 且机场等于 crew base 时，在 SQL 中排除最终 landing。

优点：改动看起来最小。

问题：需要在 search builder 里引入 crew base/action/location 的耦合，`Award` 和 `Avoid` 语义不一致，`Both`、city 选择和 algorithm export 容易分叉。不推荐。

### 方案 B：统一改变 `Airport Preference Landing` 事件集（推荐）

做法：`Airport Preference` 中所有 landing 匹配都只使用非最终 segment；`Layover` 不变。

优点：业务定义清晰，Award/Avoid、Pairing 页面、Search Pairings 和 export 一致；不改 payload，不需要数据迁移。

风险：如果用户曾期望 `Award Landing <base>` 命中 pairing 最终回基地，这个行为会改变。但用户已确认 Award/Avoid 都应遵守新语义。

### 方案 C：只改 Portal Search，不改 algorithm export

做法：只修 `pbs-server` 的搜索结果，暂不改 live-server/export。

优点：改动少。

问题：员工端看到的 pairing 与导出给算法的 `PAIRING_SCORE.csv` 可能不一致，尤其 Airport Preference 是过滤后再写 pairing counter。不推荐。

## 推荐设计

采用方案 B。

### Landing 事件定义

对 `Airport Preference`，一个 segment 只有在满足以下条件时才是可匹配 landing：

1. `s.pairing_id = p.id`
2. `s.is_deleted = 0`
3. `s.arv_arp is not null`
4. 同一 pairing 中存在一个更晚的非删除 segment：
   - `later_s.duty_seq > s.duty_seq`
   - 或 `later_s.duty_seq = s.duty_seq and later_s.seg_seq > s.seg_seq`

换句话说，最后一段没有后续 segment，因此不会进入 `landing` 事件集。

### Both / Layover

- `event="landing"`：只看非最终 landing。
- `event="layover"`：只看 layover，完全不受本次影响。
- `event="landing_or_layover"`：landing 分支只看非最终 landing；layover 分支照常保留。
- 配置 `minimumLayoverDuration` 时，保留当前逻辑：landing 分支无须满足 layover hours；layover 分支必须满足 hours。

### Date Scope

`LIMIT TO EVENT DATE` 继续按事件发生地本地日期判断：

- landing 使用到达机场本地日期，但只对非最终 landing 生效。
- layover 使用 layover 机场本地日期，不变。

### Airport Options

`/pairing-search/airport-options` 中的 `airportPreferenceOptions` 应使用同一套非最终 landing 事件定义：

- 只因为最终 landing 出现的 airport/city，不应带 `landing` event。
- 如果同一 airport/city 有中间 landing，仍应带 `landing` event。
- 如果同一 airport/city 有 layover，`layover` event 不受影响。

通用 `landingAirports` 暂时保持旧语义，避免误改旧 `101 Any Landing In Airport` / `AirportMultiSelect` 等非 Airport Preference 路径。

这样做是为了避免 `Airport Preference` 专用 UI 展示“只因为最终回基地才存在”的 landing airport，导致用户能选择但保存后搜索不到。

## 拟修改文件

### PBS Server

- `pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts`
  - 修改 `buildAirportPreferenceRowsQuery` 的 landing 子查询，排除最终 segment。
  - 保持 layover 子查询不变。

- `pbs-server/src/services/pairing-search/pairing-airport-options-query.ts`
  - 修改 `airportPreferenceOptions` 的 landing event 来源，排除最终 segment。
  - `landingAirports`、`layoverAirports` 和 `workStartStations` 保持现状，避免影响旧通用机场条件。

- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`
  - 新增/更新断言：Airport Preference landing SQL 包含非最终 segment 过滤。
  - 覆盖 `Both + preferred layover hours` 仍保留 landing 分支且 layover hours 只限制 layover。

- `pbs-server/src/services/pairing-search/pairing-search-service.test.ts` 或 `pbs-server/src/routes/pairing-search.test.ts`
  - 补 airport options 回归：最终 landing 不进入 `airportPreferenceOptions.events=["landing"]`，中间 landing 仍进入。
  - 覆盖同一 airport/city 如果仍有 layover，`layover` event 不受影响。
  - 保留通用 `landingAirports` 不回归断言。

- `pbs-server/src/services/algorithm-export/pairing-score-export.test.ts`
  - 补 Airport Preference export 回归，确认导出使用同一 search condition。

### Live Server

- `live-server/src/services/pairing-search/pairing-search-detail-conditions.ts`
  - 与 PBS Server 同步修改 Airport Preference landing 事件定义。

- `live-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`
  - 补同等 SQL 断言。

- `live-server/src/services/algorithm-export/pairing-score-export.test.ts`
  - 确认 algorithm export 的 Airport Preference 搜索条件也排除最终 landing。

### 文档 / QA

- 新增 `docs/test-cases/pbs/pairing/2026-07-20-airport-preference-ignore-final-landing.md`
  - 人工测试覆盖 Avoid base landing、mid-pairing landing、Both + layover hours、date scope、Search Pairings 与导出一致性。

## 验收标准

1. `Avoid + Landing + base airport`
   - pairing 只有最后一段 landing 到 base：不命中 Airport Preference，因此不会被 Avoid 过滤掉。
   - pairing 中间段 landing 到 base：命中 Airport Preference，会被 Avoid 过滤。

2. `Award + Landing + base airport`
   - pairing 只有最后一段 landing 到 base：不命中。
   - pairing 中间段 landing 到 base：命中。

3. `Both`
   - 非最终 landing 可命中。
   - 最终 landing 不命中。
   - layover 仍可命中。
   - `Preferred layover hours` 只限制 layover。

4. `LIMIT TO EVENT DATE`
   - landing 日期只对非最终 landing 生效。
   - layover 日期不变。

5. Airport options
   - `airportPreferenceOptions` 不应只因为最终回基地而给 base airport/city 标记 `landing` event。
   - 如果确有中间 landing 到 base，base airport/city 仍可带 `landing` event。
   - 如果 base airport/city 同时存在 layover，`layover` event 保留。
   - 通用 `landingAirports` 保持旧语义，旧 `101` 等非 Airport Preference 路径不受影响。

6. Export
   - PBS / live algorithm export 使用和 Search Pairings 一致的 Airport Preference filtering。

## 测试计划

- `cd pbs-server && node --test src/services/pairing-search/pairing-search-condition-builder.test.ts`
- `cd pbs-server && node --test src/services/pairing-search/pairing-search-service.test.ts src/routes/pairing-search.test.ts`
- `cd pbs-server && node --test src/services/algorithm-export/pairing-score-export.test.ts`
- `cd pbs-server && npm run build`
- `cd live-server && npx vitest run src/services/pairing-search/pairing-search-condition-builder.test.ts src/services/algorithm-export/pairing-score-export.test.ts`
- `cd live-server && npm run build`
- `cd pbs-portal && npm run build`
- `npm run check:ui`（如果实现过程中没有前端样式变更，可作为确认性 gate）
- `git diff --check`

如果实现触达前端或机场 option mock，需要补跑相关 Playwright，例如 Airport Preference 的 Pairing / Search Pairings 路径。

## 风险与注意事项

- 这是搜索语义变更，不是 UI 变更。历史保存的 Airport Preference bid 会自动按新语义生效。
- 不应把“最后 landing”定义成“到达 crew base”，因为异常数据或非基地结束 pairing 也应该统一排除最后 segment。
- 不应只改 `pbs-server`，否则 Portal Search 与 live algorithm export 会不一致。
- 不应只改 `airport-options`，否则 UI 选项和实际搜索仍会分叉。
- `airport-options` 有缓存 key：`pbs:<schema>:pairing-search:airport-options:v1:<base>:<periodStart>:<periodEnd>`，TTL 为 10 分钟。实现时如果只改 SQL 而不 bump cache version，部署后可能有最多 10 分钟旧 options 窗口。推荐 bump pairing search cache version 或同步清理 airport-options cache。
- SQL 需要保持索引友好，优先使用现有 `(pairing_id, duty_seq, seg_seq)` 唯一键/索引相关字段。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一条 Airport Preference 搜索语义上，`pbs-server` / `live-server` 两份实现需要保持一致；多人并行容易造成 SQL 或测试断言不一致。
- Suggested split: 不拆分实现。可在主实现完成后单独做只读 review。
- Write boundaries: `pbs-server` pairing search/options/export tests、`live-server` pairing search/export tests、QA 文档。
- Conflict risk: Medium。当前工作树已有其它 Pairing Preference 相关 dirty 文件，实施时必须避免混入无关改动。
- Execution gate: 用户确认本 spec 后，再进入实现；实现前对要修改的符号跑 GitNexus impact，提交前跑 detect_changes。
