# PBS Pairing Length 112 老格式数据修正设计

## 问题

`/api/pairing-search/current-rules/counts` 在 73 账号上返回 400，原因是远端 PBS schema 的 `pbs_bid_group` 中仍有 Pairing property 112 的旧格式数据：

- `operator` 为 `=`, `<`, `>`, `Between`
- `param_a` / `param_b` 存数值

当前代码已要求 property 112 使用 `operator = 'Json'`，并在 `param_a` 中保存 `pairing-length-preference` JSON。老格式被读成默认空值后，会触发 `minDays/maxDays` 校验失败。

## 范围

只新增 SQL 数据修正与验证文件，不修改前后端运行时代码，不新增旧格式兼容逻辑。

## 修正规则

将 property 112 的旧格式转换为新 JSON：

- `>` N -> `minDays = N + 1`, `maxDays = null`
- `<` N -> `minDays = null`, `maxDays = N - 1`
- `=` N -> `minDays = N`, `maxDays = N`
- `Between` A/B -> `minDays = A`, `maxDays = B`

转换后统一写入：

- `operator = 'Json'`
- `param_a = '{"type":"pairing-length-preference",...}'`
- `param_b = null`
- `param_c = null`
- `updated_by = 'migration'`

新 JSON 中 `minDays`、`maxDays` 和 `dateScope` 是运行时合同字段。`min` / `max` 是默认编辑器可携带的辅助元字段，不作为已有 JSON bid payload 的必填字段。

## 约束

- 只转换可证明有效的数据：数值必须为整数，结果必须在 1 到 7 天内，且 `minDays <= maxDays`。
- 如存在不可转换的旧格式 112，migration 必须抛错并停止。
- 保留原 bid、tier、group、action、property_group_key，不删除业务数据。

## 验收标准

- property 112 的 `pbs_bid_group` 不再存在旧 `operator/param` 格式。
- 73 账号原 `operator='>' param_a='2'` 转换后为 `minDays=3, maxDays=null`。
- 验证 SQL 通过，证明 112 payload 满足当前运行时 JSON 合同：`type='pairing-length-preference'`、`minDays/maxDays` 至少一个有效、`dateScope` 缺省/null/合法日期范围均可。
- 远端实际执行 schema 为 `f8_dev_pbs`、`f8_sit_pbs`、`f8_uat_pbs`；当前 47.253 远端库没有旧文档中的 `f8_pbs.pbs_bid_group`。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 范围集中在 SQL migration 和验证脚本，拆分成本高于收益。
- Suggested split: 不拆。
- Write boundaries: `sql/migration/` 与 `sql/migration/tests/`。
- Conflict risk: 低。
- Execution gate: 用户已确认可以实现。
