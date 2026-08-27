# PBS Pairing Search Actor Context Live Identity 修复设计

状态：已实施并完成 focused build / test 验证。

## 背景

`POST /api/pairing-search/current-rules/counts` 在 crew 19 / Jun 2026 下返回 500。
临时 3012 pbs-server debug 复现得到 PostgreSQL `42703`：查询仍引用
`f8_pbs.pbs_user.base` / `f8_pbs.pbs_user.rank`。远端 `f8_pbs.pbs_user`
已按既有迁移删除这两个列，Base / Rank 的权威来源应改为 live
`crew_base` / `crew_rank`。

## 目标

- 修复 pairing-search 当前规则 counts、tier pools、preview 等共享 actor context 解析，避免 SQL 500。
- 与 `pbs_user.base/rank` 移除方向统一：Base / Rank 从 live schema 读取。
- 保留已有业务错误语义：缺有效 Base / Rank / timezone 时返回明确业务错误，不吞掉数据问题。

## 范围

- 修改 `pbs-server/src/services/pairing-search/actor-base.ts`。
- 更新 pairing-search 相关单元测试中关于 actor base/rank 来源的断言。
- 不修改前端请求、Bid Feedback Days Off 行为、`DAYSOFF.csv` 导出、数据库 schema/migration。

## 设计

1. `resolvePairingSearchActorBase`
   - 不再 join `f8_pbs.pbs_user`。
   - 从 live `crew_base` 读取当前有效 Base，优先 `is_prime_base desc, eff_dt desc, id desc`。

2. `resolvePairingSearchActorContext`
   - 从 live `crew_base` 读取当前有效 Base，并 join `airport` / `pg_timezone_names` 得到 `zone_id`。
   - 从 live `crew_rank` 读取当前有效 Rank，取最新 `eff_dt desc, id desc`。
   - 继续返回 `{ base, rank, zoneId }`，供 current-rules counts / tier pools / preview 使用。

3. `resolveSinglePropertyPreviewActorContext`
   - 维持 bid-period overlap 的 effective base 范围逻辑。
   - Rank 改为从 live `crew_rank` 查 period 内有效记录，取最新一条。

## 验收

- crew 19 / Jun 2026 / T1 调用 `/api/pairing-search/current-rules/counts` 返回 200。
- 针对 actor-base 的测试覆盖不再包含 `pu.base` / `pu.rank`。
- `pbs-server` pairing-search 相关测试通过。
- `pbs-server npm run build` 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 修复范围集中在一个 resolver 文件和对应测试，拆分会增加协调成本。
- Suggested split: 不拆。
- Write boundaries: `pbs-server/src/services/pairing-search/actor-base.ts` 与相关测试。
- Conflict risk: 低；需避开当前工作树中已有 Bid Feedback 未提交改动。
- Execution gate: 用户已确认按 live `crew_base` / `crew_rank` 方向修复。
