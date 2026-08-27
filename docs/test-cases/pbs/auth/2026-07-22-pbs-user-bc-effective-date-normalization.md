# PBS 用户 BC 生效日期规范化人工测试

## 目标

验证开发、SIT、UAT 的 BC `pbs_user.eff_dt` 已统一转换为 `1900-01-01`，
用户同步不会重新产生 BC 日期，受影响账号可以正常登录。

## 环境

| 环境 | PBS schema |
|---|---|
| Development | `f8_pbs` |
| SIT | `f8_sit_pbs` |
| UAT | `f8_uat_pbs` |

## 用例 1：只读预检

1. 使用目标环境的 `pbs-server` 私有配置运行：

   ```bash
   npm run normalize:pbs-user-effective-dates -- --environment <environment>
   ```

2. 确认输出的数据库、角色和 schema 与环境一致。
3. 记录 `BC rows` 和 `enabled BC rows`。
4. 确认输出包含 `mode: read-only`，数据库数据未被修改。

预期：命令成功，未执行 UPDATE。

## 用例 2：规范化存量数据

1. 使用用例 1 的 `BC rows` 作为 expected count：

   ```bash
   npm run normalize:pbs-user-effective-dates -- \
     --environment <environment> \
     --apply \
     --expected-count <BC rows>
   ```

2. 确认输出 `result: PASS`，`updated rows` 等于 expected count。
3. 再次运行用例 1。

预期：BC rows 为 0；发生数量变化、锁超时、字段类型错误或环境不匹配时事务回滚。

## 用例 3：受影响账号登录

依次验证 `2156`、`1703`、`13376`。若目标环境不存在某账号，记录该事实并选择该环境
另一名原 BC 且启用的账号替代。

预期：

- 登录接口返回 HTTP 200。
- 返回有效 JWT/会话。
- 会话 `userCode` 和员工身份与登录账号一致。
- 不再返回 `This PBS account cannot access the portal.`。

## 用例 4：正常 AD 日期账号回归

选择一名修改前 `eff_dt` 为正常 AD 日期且可登录的账号。

预期：仍返回 HTTP 200，账号身份正确，`eff_dt` 未变化。

## 用例 5：同步防复发

1. 运行新版 `sync-pbs-users`。
2. 再次运行规范化脚本的只读模式。

预期：同步成功，BC rows 仍为 0。

## 用例 6：幂等性

在 BC rows 已为 0 时执行：

```bash
npm run normalize:pbs-user-effective-dates -- \
  --environment <environment> \
  --apply \
  --expected-count 0
```

预期：updated rows 为 0，result 为 PASS。

## 用例 7：并发锁

在一个事务中持有同一环境的 `pg_advisory_xact_lock`，同时运行规范化 apply。

预期：达到配置的 `lock_timeout` 后失败并回滚，不产生部分更新；释放锁后可重新执行。

## 2026-07-23 执行记录

| 环境 | 修改前 BC | 更新数 | 修改后 BC | 结果 |
|---|---:|---:|---:|---|
| Development `f8_pbs` | 612 | 612 | 0 | PASS |
| SIT `f8_sit_pbs` | 612 | 612 | 0 | PASS |
| UAT `f8_uat_pbs` | 612 | 612 | 0 | PASS |

- `2156`、`1703`、`13376`：三个环境均 HTTP 200 登录，JWT 存在，员工号匹配。
- 正常 AD 日期账号 `247`：三个环境均 HTTP 200 登录，原日期未变化。
- Development 幂等 apply：expected count 0，updated rows 0，PASS。
- expected count 不匹配：事务回滚，随后只读检查 BC rows 仍为 0，PASS。
- 真实 PostgreSQL advisory lock：并发等待超时、事务结束自动释放，PASS。
- `f8_sit_live.users`、`f8_uat_live.users`：各 20 行，BC rows 0。
- 未实际运行全量 `sync-pbs-users`：当前 Live 源仅 20 行，而 PBS 目标为 816 行，
  全量同步可能停用大量 PBS 账号；本任务只完成日期投影 dry-run，未触发该独立风险。
