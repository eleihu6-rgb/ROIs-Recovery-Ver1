# PBS 用户 BC 生效日期规范化实施计划

## 目标

按照已批准的设计，将 PBS 用户 BC `eff_dt` 规范化为
`1900-01-01 00:00:00+00`，先堵住同步入口，再依次修正开发、SIT、UAT 存量数据。

## 步骤

1. 在 `sync-pbs-users-core.ts` 增加共享的 BC 边界、目标日期、锁 key 和源查询表达式，
   并用单元测试覆盖 BC、AD 边界和正常日期。
2. 在 `sync-pbs-users.ts` 的目标连接上增加显式事务、有限 `lock_timeout` 和
   `pg_advisory_xact_lock`，保证一次同步的目标写入原子且与规范化脚本互斥。
3. 新增 `normalize-pbs-user-effective-dates.ts` 管理脚本：默认只读；只有
   `--apply --expected-count N --environment <development|sit|uat>` 才允许写入。
4. 增加管理脚本的 SQL/参数/环境门禁测试，以及真实 PostgreSQL 只读边界验证。
5. 新增 `docs/test-cases/pbs/auth/` 人工 QA 用例。
6. 运行 PBS 聚焦测试、完整模块测试、lint、build、动态 SQL 验证和
   `git diff --check`。
7. 先部署同步防复发逻辑并确认旧同步已结束；然后按开发、SIT、UAT 顺序执行
   dry-run、带 expected count 的 apply、同步后复查和登录验证。
8. 运行 GitNexus `detect-changes`，检查最终差异，仅报告结果，不提交 Git。

## 成功标准

- 新版同步不会把 BC `eff_dt` 写入 `pbs_user`。
- 三个环境存量 BC 数量均为 0。
- 2156、1703、13376（若环境存在）HTTP 200 登录且会话身份正确。
- 正常 AD 日期账号不受影响。
- 第二次规范化执行更新数为 0。
