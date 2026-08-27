# PBS Award 发布 Credit/Fleet 完整性测试案例

## 前置条件

- 已部署包含 `roster_publish.fleet_seg` 的版本。
- 已获得远端数据库变更批准，并执行
  `2026-07-28-award-published-credit-fleet-completeness.sql`。
- crew `19` 的 `Jun 2026` 已发布 roster 可用。
- 使用具有 Award 页面访问权限的 crew 账号登录 PBS Portal。

## 主流程

1. 打开 PBS Portal `/award`。
2. 确认页面显示 `Published · Jun 2026`。
3. 查看顶部 `Credit Hours`。
4. 在 Roster Details 中选择 `T4528 #10924`。
5. 查看 pairing Credit、Selected Duty 底部 `CREDIT` 和两个航段的 `CRD`。
6. 查看两个航段的 `Fleet`。

## 预期结果

- 月度 `Credit Hours` 为 `77:09`。
- `T4528 #10924` 的 pairing Credit 和 Selected Duty `CREDIT` 均为 `8:05`。
- 第一个航段 `CRD` 使用 actual-first 口径，显示 `8:05`；同一 Duty 的后续航段
  显示 `--`，且不再显示含义不清的 `Duty` 文案。
- 两个航段 Fleet 均为 `7M8`。
- 页面不存在由 Credit/Fleet 引起的 `Missing` 或黄色缺失警告。
- Day Off 行中不适用的字段仍显示 `--`。
- Reason Report 继续保持当前未发布状态，本案例不要求生成 Award Result。

## 异常与边界场景

1. 构造 actual 与 scheduled Credit 同时非空且数值不同的数据。
   - 预期：Pairing、首个航段 `CRD`、Duty 总 Credit 均使用 actual；同一 Duty
     的后续航段显示 `--`。
2. 重复执行 migration/backfill。
   - 预期：不报错，不覆盖已有非空 Credit/Fleet，不产生额外变化。
3. 同步源 Credit/Fleet 为 `NULL`，快照已有非空值。
   - 预期：PBS Server 同步 upsert 不以 `NULL` 覆盖快照值。
4. 同一发布行匹配多个 active `pairing_segment`。
   - 预期：migration 明确失败并提示重复匹配，不静默任选数据。
5. 源 segment 确实没有 Fleet/Credit。
   - 预期：页面保留现有持久数据质量警告，不伪造 `pairing_fleet`。

## 回归范围

- Live Server Publish Roster。
- PBS Server roster publish 同步脚本。
- PBS Server `/api/award/current`。
- PBS Portal Award Summary、Roster Details、Selected Duty。
- Day Off、Activity、时区和 Reason Report 现有行为。
