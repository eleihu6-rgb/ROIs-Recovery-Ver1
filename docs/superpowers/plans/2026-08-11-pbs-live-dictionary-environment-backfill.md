# PBS Live Dictionary 环境隔离修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 DEV、SIT、UAT 的 Live `dictionary` 补齐 Minimum Base Layover 与 Time Between Flights 配置，并提供可重复执行、可验证的环境隔离 migration。

**Architecture:** 新增一个纯 PostgreSQL corrective migration，通过 session setting 接收并白名单校验目标 Live schema；每次执行仅处理一个 schema，并在同一事务内完成重复检查、缺失/空值回填与提交前断言。新增独立验证 SQL 和 PBS QA 用例，不修改历史 migration 或常驻服务代码。

**Tech Stack:** PostgreSQL 16、SQL migration、Node.js `pg`（本机无 `psql` 时用于执行）、PBS Portal/Server HTTP smoke。

---

### Task 1: 新增幂等 corrective migration

**Files:**
- Create: `sql/migration/2026-08-11-pbs-live-dictionary-environment-backfill.sql`

- [ ] **Step 1: 写入 schema 白名单、重复键检查和配置值校验**

Migration 从 `current_setting('pbs.live_dictionary_backfill_schema', true)` 读取目标 schema，只允许 `f8`、`f8_sit_live`、`f8_uat_live`。使用 `format('%I.dictionary', target_schema)` 引用目标表；任一目标键存在重复或非空非法值时抛错。

- [ ] **Step 2: 写入最小幂等回填逻辑**

仅当目标值缺失或为空时分别写入：

```text
SYS_PARAM / PBS_LINE_MINIMUM_BASE_LAYOVER = 013:00
SYS_PARAM / PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES = 45
```

已有合法非空值保持不变。冲突目标使用现有唯一表达式索引：

```sql
on conflict (coalesce(parent_code, '___NULL___'), code)
```

- [ ] **Step 3: 增加提交前断言**

在同一事务提交前断言两个目标键各一条，并分别满足 `^[0-9]{3}:[0-5][0-9]$` 与正整数规则；失败则事务回滚。

### Task 2: 新增验证与人工测试凭证

**Files:**
- Create: `sql/migration/tests/2026-08-11-pbs-live-dictionary-environment-backfill-verify.sql`
- Create: `docs/test-cases/pbs/bid-definitions/2026-08-11-live-dictionary-environment-backfill.md`

- [ ] **Step 1: 编写独立验证 SQL**

验证 SQL 使用相同 session setting 与白名单，检查两个键各一条且值合法，并输出目标 schema 的通过通知。

- [ ] **Step 2: 编写中文 QA 用例**

覆盖三环境数据库检查、SIT/UAT `Minimum Base Layover` 与 `Time Between Flights` 页面/接口检查、重复执行幂等性以及其他 PBS Definition 参数回归。

### Task 3: 执行前安全检查

**Files:**
- Read: `sql/migration/2026-08-11-pbs-live-dictionary-environment-backfill.sql`
- Read: `sql/migration/tests/2026-08-11-pbs-live-dictionary-environment-backfill-verify.sql`

- [ ] **Step 1: 扫描危险范围**

Run:

```bash
rg -n "delete|truncate|drop|pbs_bid|favorite|roster|award" \
  sql/migration/2026-08-11-pbs-live-dictionary-environment-backfill.sql
```

Expected: 只允许注释中的说明；不得出现业务表写入或破坏性语句。

- [ ] **Step 2: 保存执行前快照**

使用远端 PostgreSQL 查询三个 Live schema 的两个目标键，记录行数、值、`updated_by`、`updated_at`；不得输出连接密码。

### Task 4: 顺序执行三环境 migration

**Files:**
- Execute: `sql/migration/2026-08-11-pbs-live-dictionary-environment-backfill.sql`

- [ ] **Step 1: 执行 DEV**

在同一数据库会话设置 `pbs.live_dictionary_backfill_schema=f8` 后执行 migration。Expected: 成功；已有合法值保持不变。

- [ ] **Step 2: 执行 SIT**

设置 `pbs.live_dictionary_backfill_schema=f8_sit_live` 后执行 migration。Expected: 成功并新增两个缺失参数。

- [ ] **Step 3: 执行 UAT**

设置 `pbs.live_dictionary_backfill_schema=f8_uat_live` 后执行 migration。Expected: 成功并新增两个缺失参数。

- [ ] **Step 4: 重复执行验证幂等性**

对三个 schema 再执行一次。Expected: 全部成功，目标键仍各一条，合法非空值不变。

### Task 5: 数据库与应用验收

**Files:**
- Execute: `sql/migration/tests/2026-08-11-pbs-live-dictionary-environment-backfill-verify.sql`

- [ ] **Step 1: 执行三环境验证 SQL**

Expected: DEV、SIT、UAT 均输出验证通过；两个目标键各一条。

- [ ] **Step 2: 核对其他 PBS Definition 参数**

比较三个 Live schema 的 PBS 参数。Expected: 除各环境独立 Business Time Anchor 外，其余已配置参数没有新增缺失或被本 migration 改写。

- [ ] **Step 3: 执行 SIT/UAT 接口与页面 smoke**

Expected:

- Minimum Base Layover 接口返回 `available: true`。
- Time Between Flights bounds 接口返回 200，不再出现配置缺失 500。
- 对应 Portal 弹窗可正常显示限制值。

若部署或认证阻塞，只报告数据库修复完成，并明确保留应用验收项，不宣告整体完成。

### Task 6: 变更范围检查

- [ ] **Step 1: 检查工作区差异**

Run:

```bash
git diff -- \
  docs/superpowers/specs/2026-08-11-pbs-live-dictionary-environment-backfill-design.md \
  docs/superpowers/plans/2026-08-11-pbs-live-dictionary-environment-backfill.md \
  sql/migration/2026-08-11-pbs-live-dictionary-environment-backfill.sql \
  sql/migration/tests/2026-08-11-pbs-live-dictionary-environment-backfill-verify.sql \
  docs/test-cases/pbs/bid-definitions/2026-08-11-live-dictionary-environment-backfill.md
```

Expected: 仅包含本修复的 spec、计划、migration、验证 SQL 和 QA 文档；不包含 Bid Feedback 或其他业务代码修改。

- [ ] **Step 2: 保持未提交状态**

本轮不执行 `git commit`；只有用户在当前对话明确授权后才能提交。
