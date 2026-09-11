# 开发上下文（2026-09-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-11 14:39:08 PDT
- Wing：`live-server`
- Topic：`crew-app-et-j4002-ground-duty-parity`
- Title：Crew App ET J4002 — Sep 9 Day Off + Sep 17 Annual Leave parity
- Git branch：`feat/gantt/roundtrip-pairing-builder`

## 本轮对话上下文

## 目标
Ryan：继续 crew app 测试，用 ET crew J4002 —— 他在 9 Sep / 17 Sep 各加了 1 条 ground duty，核对 app 是否显示在正确的日期。

## Ground truth（勿反复推翻）
- f8_sit_live.roster_flight（planner 2026-09-11 20:35 UTC 从 Live gantt 添加，cr.rois.one/altair/live）：
  - id 1354915 assignment=DO ADD→ADD 2026-09-08 21:00Z → 2026-09-09 20:59Z（= ADD 当地 9 Sep 全天）
  - id 1354916 assignment=AL ADD→ADD 2026-09-16 21:00Z → 2026-09-17 20:59Z（= ADD 当地 17 Sep 全天）
  - 两条 pairing_id/flt_id 均为 NULL，label 为 NULL → mobile-roster 把它们放进 groundDuties。
- 结论：**app 显示正确，无需改代码**。UTC 窗口先经 airportZones(ADD=+03:00) → wallClockInZone 转成 ADD 当地挂钟 00:00–23:59，再按 localStart 归日；所以 09-08T21:00Z 落在 9 Sep 卡片，09-16T21:00Z 落在 17 Sep 卡片。dayOff 走 groundKind 'off'（标题 Day Off），AL 走 category 'leave' → kind 'ground'（标题 Annual Leave），两者 sub 都是 All day。
- 依赖不变式：ground-duty 归日依赖 crew-app/src/features/settings/airportZones.ts 的 AIRPORT_TZ（ADD→Africa/Addis_Ababa, 固定 +180）；若把当地挂钟当 UTC 用，两条都会早一天。

## 本轮新增（测试资产，无产品代码改动）
- crew-app/.maestro/et_j4002_ground_duties.yaml：J4002/Pier2026 登录 → Schedule → 点 day-9 断言 "Day Off"+"All day" → scrollUntilVisible "Annual Leave" 断言 + 截图。PASS。
- e2e/tests/gantt/crew-app-duty-parity-j4002.spec.ts：从 cr.rois.one/altair/live 把 J4002 提到顶部 + Sep 2026，断言 gantt 有 DO/AL 两条 ground duty 及其精确 UTC 窗口，导出 e2e/results/crew-app-parity/j4002-gantt-sep2026.json。PASS（38 行 = 36 飞行 + 2 ground）。

## 实测结果
- PASS crew app iOS 模拟器（iPhone 17 / iOS 26.5，Maestro）：J4002 登录成功，Sched Sep 2026 · 103 Credit；WED 9 SEP 卡 = Day Off / All day / DO；THU 17 SEP 卡 = Annual Leave / All day / AL；16 Sep 无误挂 duty。
- PASS gantt：cr.rois.one 上 J4002 行 9 Sep 有 DO、17 Sep 有 AL。
- PASS API：POST http://127.0.0.1:3000/api/mobile-roster/session（ET/J4002/Pier2026）→ 16 pairings + 2 groundDuties（窗口与 DB 一致）。
- PASS crew-app jest：ekRosterApi + v2Model + dutyDisplay 3 suites / 82 tests；npx tsc --noEmit 干净。
- PASS live-server vitest：src/services/mobile-roster + mobile-roster-service-et → 2 files / 10 tests。
- 截图：docs/assets/screenshots/crew-app/et-j4002-sched-sep09-dayoff-Ver1.png、et-j4002-sched-sep17-annualleave-Ver1.png、et-j4002-sched-sep2026-top-Ver1.png、et-j4002-home-Ver1.png、gantt-j4002-sep2026-Ver1.png。

## 未做
- 未 commit / 未 push（仓库规则要求显式指令）。

## 当前工作树快照

### git status --short

```text
 M crew-app/.maestro/et_login_storage_failure_2_login.yaml
 M crew-app/__tests__/features/dutyDisplay.test.ts
 M crew-app/__tests__/features/ekRosterApi.test.ts
 M crew-app/__tests__/features/ekRosterLogin.test.ts
 M crew-app/__tests__/features/etAirlineSelection.test.ts
 M crew-app/__tests__/features/timeFormat.test.ts
 M crew-app/__tests__/features/v2Model.test.ts
 M crew-app/__tests__/store/authSlice.test.ts
 M crew-app/src/components/v2/rows.tsx
 M crew-app/src/features/auth/EkRosterLoginScreen.tsx
 M crew-app/src/features/auth/LoginScreen.tsx
 M crew-app/src/features/auth/airlines.ts
 M crew-app/src/features/auth/authSlice.ts
 M crew-app/src/features/auth/ekRosterLogin.ts
 M crew-app/src/features/roster/dutyDisplay.ts
 M crew-app/src/features/settings/alarmSetup.ts
 M crew-app/src/features/settings/settingsSlice.ts
 M crew-app/src/features/settings/timeFormat.ts
 M crew-app/src/features/travel/ekRosterApi.ts
 M crew-app/src/features/travel/portalCapture.ts
 M crew-app/src/features/v2/ScheduleScreen.tsx
 M crew-app/src/features/v2/TimeZoneScreen.tsx
 M crew-app/src/features/v2/model.ts
 M crew-app/src/features/v2/useV2.ts
 M crew-app/src/version.ts
 M docs/dev-context/LATEST.md
 M live-server/src/index.ts
 M live-server/src/models/index.ts
 M live-server/src/plugins/auth.ts
 M live-server/src/services/mobile-roster/__tests__/mobile-roster-service.test.ts
 M live-server/src/services/mobile-roster/mobile-roster-service.ts
?? crew-app/.maestro/et_crew_duty_sim.yaml
?? crew-app/.maestro/et_j4002_ground_duties.yaml
?? crew-app/.maestro/et_j4007_login.yaml
?? crew-app/.maestro/ui_theme_and_timezone.yaml
?? crew-app/src/features/settings/airportZones.ts
?? docs/assets/screenshots/crew-app/et-j4002-home-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep09-dayoff-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep17-annualleave-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep2026-top-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4007-login-home-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4007-sched-sep13-et857-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4007-sched-sep20-et917-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4007-sched-sep2026-top-Ver1.png
?? docs/assets/screenshots/crew-app/gantt-j4002-sep2026-Ver1.png
?? docs/assets/screenshots/crew-app/gantt-j4007-sep2026-Ver1.png
?? docs/design/
?? docs/dev-context/2026-09-11-live-server-crew-app-et-j4007-duty-parity.md
?? docs/dev-context/2026-09-11-live-server-crew-app-notification-push.md
?? docs/handoff/agent-workflow/
?? docs/handoff/crew-app/
?? docs/superpowers/plans/2026-09-11-crew-app-live-notification-push.md
?? docs/superpowers/specs/2026-09-11-crew-app-duty-cards-timezone-theme-design.md
?? docs/superpowers/specs/2026-09-11-crew-app-live-notification-push-design.md
?? docs/test-cases/crew-app/
?? docs/test-cases/gantt/live-sync-cr-rois-one-signoff-gate.md
?? e2e/tests/gantt/crew-app-duty-parity-j4002.spec.ts
?? e2e/tests/gantt/crew-app-duty-parity-j4007.spec.ts
?? gantt/src/services/__tests__/gantt-sync-manager-fallback.test.ts
?? live-server/src/__tests__/unit/crew-notify-route.test.ts
?? live-server/src/models/crew/crew-notification.ts
?? live-server/src/routes/crew-notify/
?? live-server/src/services/crew-notify/
?? sim_01_login.png
?? sql/migration/2026-09-11-crew-notification.sql
?? sql/seed/2026-09-11-crew-app-accounts-and-password.sql
```

### unstaged changed files

```text
crew-app/.maestro/et_login_storage_failure_2_login.yaml
crew-app/__tests__/features/dutyDisplay.test.ts
crew-app/__tests__/features/ekRosterApi.test.ts
crew-app/__tests__/features/ekRosterLogin.test.ts
crew-app/__tests__/features/etAirlineSelection.test.ts
crew-app/__tests__/features/timeFormat.test.ts
crew-app/__tests__/features/v2Model.test.ts
crew-app/__tests__/store/authSlice.test.ts
crew-app/src/components/v2/rows.tsx
crew-app/src/features/auth/EkRosterLoginScreen.tsx
crew-app/src/features/auth/LoginScreen.tsx
crew-app/src/features/auth/airlines.ts
crew-app/src/features/auth/authSlice.ts
crew-app/src/features/auth/ekRosterLogin.ts
crew-app/src/features/roster/dutyDisplay.ts
crew-app/src/features/settings/alarmSetup.ts
crew-app/src/features/settings/settingsSlice.ts
crew-app/src/features/settings/timeFormat.ts
crew-app/src/features/travel/ekRosterApi.ts
crew-app/src/features/travel/portalCapture.ts
crew-app/src/features/v2/ScheduleScreen.tsx
crew-app/src/features/v2/TimeZoneScreen.tsx
crew-app/src/features/v2/model.ts
crew-app/src/features/v2/useV2.ts
crew-app/src/version.ts
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
2. 本文件：`docs/dev-context/2026-09-11-live-server-crew-app-et-j4002-ground-duty-parity.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh live-server
git status --short
```
