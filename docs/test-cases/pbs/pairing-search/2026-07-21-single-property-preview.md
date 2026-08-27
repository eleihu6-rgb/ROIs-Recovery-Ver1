# Pairing 单条件 PREVIEW 回归测试

## 目标

确认 Pairing 列表每一行的 `PREVIEW` 只评估该行条件，并且结果始终限制在当前 Crew 于所选 bid period 内可申请的 pairing 池中。

## 前置条件

- Crew 在 `f8_pbs.pbs_user` 中有 Rank。
- Crew 在 `f8.crew_base` 中至少有一条与测试 period 重叠、且 Base 可以解析 IANA 时区的记录。
- 测试 period 内存在与 Crew 有效 Base、Rank 匹配的 pairing。

## 用例

1. 在 Pairing 页面点击任一条件行的 `PREVIEW`。
   - 预期：请求包含 `periodCode` 和一个 `preview.property`。
   - 预期：请求不包含 `preview.mode=criteria`，也不包含 `preview.properties` 数组。
2. 分别测试 Award 与 Avoid。
   - 预期：Award 返回满足该条件的可申请 pairing。
   - 预期：Avoid 返回可申请池内不满足该条件的 pairing，包括缺少该属性事实的 pairing。
   - 预期：两组无交集，数量之和等于同一可申请池总数。
3. 修改 PREVIEW 页面中的当前条件并确认。
   - 预期：只用修改后的单个条件重新查询，不混入其他 Pairing 条件。
4. 测试跨 Base 生效日期的 period。
   - 预期：每个 pairing 按其 Base 本地起始日解析 Crew 的有效 Base。
   - 预期：同一天多条 Base 记录按 `is_prime_base DESC, eff_dt DESC, id DESC` 选择。
5. Crew 某段日期没有 Base，或 Base 没有有效时区。
   - 预期：仅排除这些日期的 pairing，不回退 UTC，不产生服务端错误。
   - 预期：如果整个 period 都没有可用 Base，接口返回 400。
6. Crew 没有 `pbs_user.rank`。
   - 预期：接口返回 400，不返回未按 Rank 限制的结果。
7. 不提供 `periodCode`。
   - 预期：单条件 PREVIEW 返回 400，不回退当前月份。
8. 依次验证当前可见条件：102、103、107、110、112、116、117、122、129、163、168。
   - 预期：每个条件均可执行；Any 使用存在语义，Every 要求适用集合非空且不存在不匹配项。
9. 翻页并重复同一请求。
   - 预期：排序固定为 Base 本地起始日、UTC 开始时间、Pairing Label、内部 ID。
   - 预期：同一页请求可命中 30 秒 `v3` Crew 级缓存。

## 自动化对应

- Portal 单元回归：`pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`
- Portal 服务契约：`pbs-portal/src/shared/services/pairing-service.test.ts`
- Server 条件与资格池：`pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`、`pairing-search-service.test.ts`
- Playwright：`e2e/tests/pbs-portal/pairing-search.spec.ts` 中 `PBS-3603`
- 远端数据 oracle：11 个可见条件分别验证 `Award + Avoid = eligible pool`，且 eligible pool 非空。
