# PBS Pairing — Deadhead Flying 标准答案对齐回归

## 目标

验证 `Deadhead Flying` 仅保留固定的 `Any deadhead` / `Deadhead-only duty`，支持 Award/Avoid 与可选 `LIMIT TO FLIGHT DATE`，并保证 Pairing、Search Pairings、Pool Count、summary 和算法导出语义一致。

## 前置条件

- 使用包含 DHD 航段、全 DHD duty、混合 duty 的测试月份。
- 至少准备两个不同 `pairing_segment.flt_dt` 的 DHD 航段。
- property 122 migration 仅在隔离测试 schema 执行。

## Portal

1. 打开 Pairing，添加 `Deadhead Flying`。
2. 确认默认 `Award`、`Any deadhead`，日期限制关闭。
3. 确认页面没有下拉框、数字输入、operator 或 `Deadhead Legs`。
4. 切换 `Deadhead-only duty`，确认与 `Any deadhead` 互斥。
5. 开启 `LIMIT TO FLIGHT DATE`，分别保存：
   - Specific Dates：选择多个日期；
   - Date Range：选择含首尾边界的范围。
6. 分别用 Award、Avoid 保存；重新编辑，确认 action、mode 和日期完整恢复。

## Search Pairings / Pool Count

1. `Any deadhead`、无日期：结果只需包含至少一个有效 DHD 航段。
2. `Any deadhead`、多日期：只命中 `flt_dt` 等于任一所选日期的 DHD 航段。
3. `Deadhead-only duty`：至少一个 duty 的全部有效航段都是 DHD；混合 duty 不命中。
4. `Deadhead-only duty`、日期范围：全 DHD duty 内至少一个 DHD 航段日期命中闭区间。
5. Award 显示正向命中集合；Avoid 显示当前候选全集内的补集。
6. 相同条件下，Search Pairings 数量与 Pool Count 一致。

## Summary / 算法导出

1. Summary 同时显示 mode 和 Specific Dates / Date Range。
2. `PAIRING_SCORE` 格式不增加列。
3. Award 正向命中写入 award counter；Avoid 仍查询正向命中并写入 avoid counter，不导出补集。
4. 两个不同日期条件不得错误复用同一个匹配缓存。

## API 负向用例

- 拒绝 `mode = deadhead-legs`。
- 拒绝旧顶层 `operator`、`legs`、`from`、`to`。
- 拒绝空 Specific Dates、倒序 Date Range、月份外日期和未知字段。
- 拒绝 Any/Every quantifier。

## Migration 隔离双跑

按顺序执行：

```bash
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migration/tests/2026-07-16-pbs-deadhead-flying-standard-answer-fixture.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migration/2026-07-16-pbs-deadhead-flying-standard-answer.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migration/tests/2026-07-16-pbs-deadhead-flying-standard-answer-verify.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migration/2026-07-16-pbs-deadhead-flying-standard-answer.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migration/tests/2026-07-16-pbs-deadhead-flying-standard-answer-verify-second-run.sql
```

预期：property 122 的三类 favorite、纯 122 group、包含 122 condition 的整个 mixed group 及对应 occurrence 被删除；其他 `property_group_key` 与非 122 favorites 保留；第二次 migration 无额外变化。
