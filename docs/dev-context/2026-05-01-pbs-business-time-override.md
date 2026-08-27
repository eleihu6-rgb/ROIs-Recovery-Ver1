# 开发上下文（2026-05-01）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-01 20:29:06 CST
- Wing：`pbs`
- Topic：`business-time-override`
- Title：business-time-override
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Business Time Override 第一版：
- 新增 pbs-server/src/services/business-time/business-clock.ts，业务时间配置来自 dictionary/SYS_PARAM：PBS_BUSINESS_TIME_MODE、PBS_BUSINESS_TIME_ANCHOR、PBS_BUSINESS_TIME_ANCHOR_REAL。
- 第一版只支持 ROLLING：business_now = anchor_business_time + (real_now - anchor_real_time)。anchor 为空或配置非法时 fallback 到真实时间，并返回 warning。
- 审计字段 created_at/updated_at/last_modified_at、JWT、日志、cache TTL 继续使用真实时间；business time 只接入 current period/current draft/calendar 等业务判断。
- 已把 business clock 接到 Line、Days Off、Pairing、Calendar Days Off、Bidding Calendar、Lineholder Summary 的 current period 入口；loadCurrentPeriodAndExistingBid 也支持 businessNow。
- resolveCurrentPeriod 现在优先选覆盖 businessNow 的 OPEN period；没有匹配 OPEN 时仍按 latest period fallback；pbs_period 为空时用 businessNow 生成 Apr 2026 这类 fallback periodCode。
- 新增 migration：sql/migration/2026-05-01-add-pbs-business-time-override-config.sql。该脚本会确保 PBS schema 中基础 dictionary 表存在，然后注册三个 SYS_PARAM key，默认 anchor 为空，不启用 override。
- 已在 f8_pbs 执行该 migration；当前值为 MODE=ROLLING，ANCHOR=''，ANCHOR_REAL=''。因此生产行为默认未回拨。
- 需要临时回到 4 月测试时，更新 dictionary 中 PBS_BUSINESS_TIME_ANCHOR='2026-04-01T12:00:00Z'，PBS_BUSINESS_TIME_ANCHOR_REAL=当前真实 UTC 时间即可。清空两个 anchor 关闭。
- 验证：pbs-server npm test 137 passed；pbs-server build 通过；npm run verify:pbs 通过；migration 重复执行通过。
- 注意：pbs-portal/tsconfig.tsbuildinfo 是 build 生成变更，已恢复，不应提交。

## 当前工作树快照

### git status --short

```text
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 M pbs-server/src/services/calendar/calendar-days-off-service.ts
 M pbs-server/src/services/days-off/days-off-bid-service.ts
 M pbs-server/src/services/line/line-bid-service.ts
 M pbs-server/src/services/lineholder/current-period-bid.test.ts
 M pbs-server/src/services/lineholder/lineholder-summary-service.ts
 M pbs-server/src/services/lineholder/shared.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
 M sql/migration/README.md
?? docs/superpowers/specs/2026-05-01-pbs-business-time-override-design.md
?? pbs-server/src/services/business-time/
?? sql/migration/2026-05-01-add-pbs-business-time-override-config.sql
```

### unstaged changed files

```text
pbs-server/src/services/calendar/bidding-calendar-service.ts
pbs-server/src/services/calendar/calendar-days-off-service.ts
pbs-server/src/services/days-off/days-off-bid-service.ts
pbs-server/src/services/line/line-bid-service.ts
pbs-server/src/services/lineholder/current-period-bid.test.ts
pbs-server/src/services/lineholder/lineholder-summary-service.ts
pbs-server/src/services/lineholder/shared.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
sql/migration/README.md
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-01-pbs-business-time-override.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
