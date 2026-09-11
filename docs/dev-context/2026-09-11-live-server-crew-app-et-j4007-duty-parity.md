# 开发上下文（2026-09-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-11 13:49:03 PDT
- Wing：`live-server`
- Topic：`crew-app-et-j4007-duty-parity`
- Title：Crew App ET J4007 — accounts + Sep 2026 duty parity
- Git branch：`feat/gantt/roundtrip-pairing-builder`

## 本轮对话上下文

## 目标
Ryan：1) 给所有 crew 设成同一个密码 Pier2026；2) 用 ET crew J4007 跑 crew app sim，核对 app 显示的 Sep 2026 勤务与 gantt 是否一致，不一致就修。

## 现状结论（勿反复推翻）
- crew app 的 F8/ET 登录走 live-server `POST /api/mobile-roster/session`，凭据闸门在 `verifyMobileCrewCredentials`（读 `<pbs>.pbs_user`：bcrypt password_hash + status/password_access/portal_access/app_access + eff_dt/exp_dt 窗口）。
- ET crew J4007 报 "invalid crew credentials" 的根因：`pbs_user` 里根本没有该账号。J4001–J4040 这批 ET ADD/7M8 crew 由 `sql/seed/2026-09-10-crew-add-j4001-j4040-add-7m8.sql` 只建了 crew/crew_base/crew_fleet/crew_rank，没有建 pbs_user；当时只有 J4002 被手工补过（created_by='claude_et_crew_app_seed'）。
- 密码现状：896 个账号里 894 个已经是 Pier2026（同一段 hash），1032(Jason Ly) 是别的 hash，J4002 是另一段 Pier2026 hash。

## 本轮改动
1. 新增 `sql/seed/2026-09-11-crew-app-accounts-and-password.sql`（幂等）：
   - 为每个缺账号的 crew 建 pbs_user（user_code=crew_id、bcrypt(Pier2026)、access 全 '1'、status 0、ad_active 1、is_first_login 'N'、token_version 1、division 取自 crew、branch_code: base=ADD→'ET' 其他→'F8'、eff_dt 用固定过去时刻避免 tz 陷阱）；
   - 把所有 crew 账号密码统一成同一个 bcrypt(Pier2026) hash；
   - 末尾审计 select 断言 crew_without_account / crew_with_other_password 都是 0。
   - 用 pbs-server/.env 的 DATABASE_URL 跑（f8_sit_live 角色对 pbs_user 无写权限）。实测 INSERT 39 / UPDATE 896 → 935 账号、1 个 hash、935 fully_enabled。
2. 修 live-server `mobile-roster-service.ts`（真实 bug）：
   - 时间列（`roster_flight.sch_str_dt_utc`、`pairing_segment.duty_sch_*_dt_utc`）是 `timestamp without time zone`（存 UTC 挂钟）。原来直接 select 由 node-postgres 按 **服务器本地时区** 解析，再 toISOString → API 输出的 UTC 被机器偏移污染（本机 Vancouver = +7h），app 因此把晚班勤务画到第二天。
   - 改为 SQL 内 `to_char(col, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`（与 `crew-memo/deassign-loader.ts` 同一规则），并让窗口边界也 UTC-to-UTC：`rf.sch_str_dt_utc >= ($2::timestamptz at time zone 'UTC')`。
   - 回归测试 2 条：SQL 必须用 to_char 渲染、窗口边界必须 at time zone 'UTC'。
3. crew-app `.maestro/et_j4007_login.yaml`（新 flow）：选 ET → crew id 改 J4007（`pressKey: Enter` 收键盘；`hideKeyboard` 对该页无效且后续滚动手势会敲出一个多余字符）→ 登录 → 关掉 dev LogBox → Sched 页截图。
4. e2e `tests/gantt/crew-app-duty-parity-j4007.spec.ts`（新）：cr.rois.one/altair/live 上把 J4007 提到顶部 + Sep 2026 区间，导出 gantt 侧 30 条 duty 到 `e2e/results/crew-app-parity/j4007-gantt-sep2026.json` 并截图。

## 验证结果（实测）
- PASS `psql` 审计：935 账号 / 1 hash / 0 crew 无账号 / 0 密码不符。
- PASS live-server `npx vitest run src/services/mobile-roster src/__tests__/services/mobile-roster-service-et.test.ts src/__tests__/unit/mobile-roster-route.test.ts` → 3 files / 17 tests；另 crew-notify 2 files / 14 tests；`npx tsc --noEmit` 干净。
- PASS API 对比（脚本）：app API 30 段 vs gantt 30 行，pairingId+start+end **0 mismatch**，13 个 pairing 一致。
- PASS crew app iOS 模拟器（iPhone 17 / iOS 26.5，Maestro）：J4007 + Pier2026 登录成功；Home 显示 ET348 11 Sep ADD 08:30→PZU 10:45；Sched Sep 2026 · 94 Credit（gantt 同行 94:25）；SUN 13 SEP ET857 19:15→FBM 23:05（修前显示 14 Sep）。
- 截图：docs/assets/screenshots/crew-app/et-j4007-login-home-Ver1.png、et-j4007-sched-sep2026-top-Ver1.png、et-j4007-sched-sep13-et857-Ver1.png、et-j4007-sched-sep20-et917-Ver1.png、gantt-j4007-sep2026-Ver1.png。

## 已知遗留（未做，勿默默忽略）
- app 默认时区模式是 `airport`，但 F8/ET 的 roster API 不返回 departureLocal/arrivalLocal，于是 app 用「UTC 挂钟」直接当作机场当地时刻显示（例：ADD 08:30 实际当地是 11:30）。gantt 默认显示 UTC，所以两者数值一致；若要让 app 显示机场当地时间，最小改法是让 live-server 在响应里补 `departureLocal`/`arrivalLocal`（app 的 normalizeF8RosterEnvelopeData 已支持）。
- Schedule 日卡表头用的是 `MON[new Date().getMonth()]`（当前月）而不是被浏览月份的月名，跨月浏览时表头月份会错。
- 模拟器 ET 登录快照仍无法持久化（keychain entitlement），会弹 dev LogBox；属既有问题。

## 未做
- 未 commit / 未 push（仓库规则要求显式指令）。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M live-server/src/index.ts
 M live-server/src/models/index.ts
 M live-server/src/plugins/auth.ts
 M live-server/src/services/mobile-roster/__tests__/mobile-roster-service.test.ts
 M live-server/src/services/mobile-roster/mobile-roster-service.ts
?? crew-app/.maestro/et_j4007_login.yaml
?? docs/assets/screenshots/crew-app/et-j4007-login-home-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4007-sched-sep13-et857-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4007-sched-sep20-et917-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4007-sched-sep2026-top-Ver1.png
?? docs/assets/screenshots/crew-app/gantt-j4007-sep2026-Ver1.png
?? docs/design/
?? docs/dev-context/2026-09-11-live-server-crew-app-notification-push.md
?? docs/handoff/agent-workflow/
?? docs/handoff/crew-app/
?? docs/superpowers/plans/2026-09-11-crew-app-live-notification-push.md
?? docs/superpowers/specs/2026-09-11-crew-app-live-notification-push-design.md
?? docs/test-cases/crew-app/
?? docs/test-cases/gantt/live-sync-cr-rois-one-signoff-gate.md
?? e2e/tests/gantt/crew-app-duty-parity-j4007.spec.ts
?? gantt/src/services/__tests__/gantt-sync-manager-fallback.test.ts
?? live-server/src/__tests__/unit/crew-notify-route.test.ts
?? live-server/src/models/crew/crew-notification.ts
?? live-server/src/routes/crew-notify/
?? live-server/src/services/crew-notify/
?? sql/migration/2026-09-11-crew-notification.sql
?? sql/seed/2026-09-11-crew-app-accounts-and-password.sql
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
live-server/src/index.ts
live-server/src/models/index.ts
live-server/src/plugins/auth.ts
live-server/src/services/mobile-roster/__tests__/mobile-roster-service.test.ts
live-server/src/services/mobile-roster/mobile-roster-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-11-live-server-crew-app-et-j4007-duty-parity.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh live-server
git status --short
```
