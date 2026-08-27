# PBS Dashboard USER INFORMATION live 字段人工测试用例

## 范围

- 页面：`pbs-portal` Dashboard
- 区域：左侧 `USER INFORMATION`
- 接口：`GET /api/dashboard/profile`
- 本轮验证字段：`FLEET`、`LANGUAGE`、`SENIORITY`、`EXISTING CREDIT`
- 本轮不实现字段：`STATUS`、`TRAINING MONTH`，应继续显示 `-`

## 前置条件

- 已登录 PBS Portal。
- 当前账号在 `pbs_user` 中存在，并有 `crew_id`。
- live schema 中可按该 `crew_id` 查询相关机组资料。
- PBS 当前 bid period 可通过 `roster_period.pbs_period_code` 解析到月份，例如 `Apr 2026` 对应 `2026-04`。

## 用例 1：完整 live 机组资料

测试数据：

- `pbs_user.base` 有值。
- `pbs_user.rank` 有值。
- live `crew_fleet` 有当前有效 `fleet_specific`。
- live `crew_language` 有当前有效语言记录。
- live `crew.seniority_num` 有值。
- live 月度 manday 表有当前 bid month 的 `credit`。

预期结果：

- `BASE` 显示 `pbs_user.base`。
- `POSITION` 显示 `pbs_user.rank`。
- `FLEET` 显示当前有效机队，多值换行。
- `LANGUAGE` 显示当前有效语言，多值换行；有等级时显示为 `language language_level`。
- `SENIORITY` 显示 live `crew.seniority_num`，无意义尾零被去掉。
- `STATUS` 显示 `-`，不显示 `crew.status` 或 `crew_status.status` 的原始码。
- `EXISTING CREDIT` 显示当前 bid month 的 monthly `credit`，最多两位小数并去掉尾零。
- 页面不出现旧 mock 值，例如 `LAX`、`646/2132`、`LINEHOLDER`。

## 用例 2：缺少 fleet/language 明细

测试数据：

- `pbs_user.base/rank` 有值。
- live `crew` 存在。
- `crew_fleet`、`crew_language` 没有当前有效记录。

预期结果：

- `BASE`、`POSITION` 正常显示。
- `FLEET` 显示 `-`。
- `LANGUAGE` 显示 `-`。
- `STATUS` 显示 `-`。
- 页面不报错。

## 用例 3：客舱或安全员 credit

测试数据：

- `pbs_user.division = C` 或 `A`。
- live `crew_manday_cc_am_monthly` 中有 `crew_id + year_month + scenario_id = 0` 的记录。

预期结果：

- `EXISTING CREDIT` 使用 `crew_manday_cc_am_monthly.credit`。
- 不读取飞行员月度表作为该账号的 credit 来源。

## 用例 4：飞行员 credit

测试数据：

- `pbs_user.division = P`。
- live `crew_manday_fd_monthly` 中有 `crew_id + year_month + scenario_id = 0` 的记录。

预期结果：

- `EXISTING CREDIT` 使用 `crew_manday_fd_monthly.credit`。
- 不读取客舱/安全员月度表作为该账号的 credit 来源。

## 用例 5：period 或 monthly credit 缺失

测试数据：

- 当前 `roster_period.pbs_period_code` 无法解析为月份，或对应 live monthly manday 表没有记录。

预期结果：

- `EXISTING CREDIT` 显示 `-`。
- 其他可用字段仍正常显示。
- 页面不报错。

## 用例 6：STATUS 和 TRAINING MONTH 保持未实现

测试数据：

- 任意有效登录账号。

预期结果：

- `STATUS` 显示 `-`。
- `TRAINING MONTH` 显示 `-`。
- 不从 `crew.status`、`crew_status.status`、PBS 账号状态推导 Dashboard `STATUS`。
- 不从培训任务、roster task 或其他字段推导 training month。
