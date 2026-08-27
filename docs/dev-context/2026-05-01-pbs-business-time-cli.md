# 开发上下文（2026-05-01）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-01 22:04:01 CST
- Wing：`pbs`
- Topic：`business-time-cli`
- Title：business-time-cli
- Git branch：`main`

## 本轮对话上下文

本轮在上一轮 PBS Business Time Override 基础上新增便捷 CLI：
- 新增 npm script：在 pbs-server 下执行 npm run business-time。
- 无参数或 clear：清空 PBS_BUSINESS_TIME_ANCHOR / PBS_BUSINESS_TIME_ANCHOR_REAL，恢复真实当前时间。
- 带紧凑时间参数：npm run business-time -- 20260401120000，按 Asia/Shanghai 解释为 2026-04-01 12:00:00，并转换为 UTC ISO 存入 PBS_BUSINESS_TIME_ANCHOR；PBS_BUSINESS_TIME_ANCHOR_REAL 自动写脚本执行时真实 UTC 时间；MODE 写 ROLLING。
- status：npm run business-time -- status，只读查看 source/mode/businessNow/realNow/anchor/anchorReal。
- 文件：pbs-server/src/scripts/pbs-business-time.ts、pbs-business-time-core.ts、pbs-business-time.test.ts；pbs-server/package.json 增加 business-time script。
- CLI set/clear 会幂等确保 dictionary 基础表和三个 SYS_PARAM key 存在；status 保持只读。
- 输入格式固定 YYYYMMDDHHmmss；非法格式不写库并退出非 0。
- 实测：npm run business-time -- status 成功；npm run business-time -- 20260401120000 成功进入 override；随后 npm run business-time 恢复 system，最终 anchor 为空。
- 验证：pbs-server npm test 143 passed；pbs-server build 通过；npm run verify:pbs 通过；git diff --check 通过。
- 注意：运行中的 PBS Server 对 business clock/current period 有 60s TTL cache，脚本执行后页面/接口可能最多等约 60 秒才完全反映；如果急用可重启 pbs-server。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M pbs-server/package.json
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 M pbs-server/src/services/calendar/calendar-days-off-service.ts
 M pbs-server/src/services/days-off/days-off-bid-service.ts
 M pbs-server/src/services/line/line-bid-service.ts
 M pbs-server/src/services/lineholder/current-period-bid.test.ts
 M pbs-server/src/services/lineholder/lineholder-summary-service.ts
 M pbs-server/src/services/lineholder/shared.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
 M sql/migration/README.md
?? docs/dev-context/2026-05-01-pbs-business-time-override.md
?? docs/superpowers/specs/2026-05-01-pbs-business-time-cli-design.md
?? docs/superpowers/specs/2026-05-01-pbs-business-time-override-design.md
?? pbs-server/src/scripts/pbs-business-time-core.ts
?? pbs-server/src/scripts/pbs-business-time.test.ts
?? pbs-server/src/scripts/pbs-business-time.ts
?? pbs-server/src/services/business-time/
?? sql/migration/2026-05-01-add-pbs-business-time-override-config.sql
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
pbs-server/package.json
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
2. 本文件：`docs/dev-context/2026-05-01-pbs-business-time-cli.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
