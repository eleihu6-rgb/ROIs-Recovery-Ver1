# 开发上下文（2026-09-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-11 15:03:03 PDT
- Wing：`live-server`
- Topic：`crew-app-sched-review-fixes`
- Title：Crew App Sched tab review fixes (Ryan 2026-09-11) — dup info, fleet, crash, duty markers, header, dock contrast
- Git branch：`feat/gantt/roundtrip-pairing-builder`

## 本轮对话上下文

## 目标
Ryan 在 crew app（ET/F8）走查后提了 7 条反馈，本轮全部处理并真机（iOS 模拟器）验证。

## 逐条结论（勿反复推翻）
1. **重复信息**：Schedule 卡片下方又印了一遍 assignment code（"Annual Leave" + "AL"、"Day Off" + "DO"）。修法：dutyDisplay 新增 `codeAddsInfo()` —— CODE_MAP 里我们能自己humanize的码视为冗余不显示，fuzzy fallback 的码保留（那才是唯一身份）。Flight 卡原来「jet 图标 + Flight 文字 + 航班号」，去掉 "Flight" 文字。
2. **机型缺失**：mobile-roster API 之前根本不返回 fleet。live-server `mobile-roster-service.ts` 现在 select `f.fleet` 并进 `MobileRosterFlight.fleet`（可为 null）；app 侧 `ekRosterApi.normalizeF8RosterEnvelopeData` 本就会透传，Schedule 卡把机型做成航班号右侧的小 chip（ET805 [7M8]），Trip Details 的 Aircraft 行也随之有值。
3. **崩溃**：切到「没有任何排班发布的月份」（如 J4002 的 Aug 2026）→ `scrollToIndex out of range: item length 0 but minimum is 1`，栈顶 `ScheduleScreen.tsx:66 focus()`（mount 的 useEffect 无条件 scrollToIndex(0)）。修法：model.ts 新增纯函数 `resolveCardIndex(cardsByStripIndex, stripIndex, cardCount)`，空列表返回 null（跳过滚动），越界夹到末尾。先复现（截图 repro_02_prev_month）再修。
4. **10 Sep ET805 无 WAKE UP/LEAVE HOME**：根因有两个，都已修。
   - (a) `tripCsv.parseTripDate` 用 date-fns `parse`（**设备本地时区**）解析列名写死 "… UTC" 的字符串 → 「已结束/未结束」边界被手机时区平移。Vancouver 机器上 15:00Z 结束的 duty 到 21:50Z 仍算 upcoming。已改成走 `settings/timeFormat.parseRosterUTC`（alarmSetup 早就为此自带 UTC parser）。这也解释了「10 号没有、11 号却有」的不一致。
   - (b) 产品行为：alarm 标记只对未结束的 duty 计算，飞完的卡只剩 CHECK-IN。Schedule/TripDetails 现在是「记录视图」：新增 `model.dutyAlarmsByTrip()`（全量 duty）+ `useV2.useDutyAlarms()`，卡片三个标记（Wake Up → Leave Home → Check-in）永远齐全；iOS 实际排闹钟仍然只用 `alarmsByTrip`（upcoming only），不能给过去 duty 排闹钟。
5. **Sched 标题**：去掉 "· 103 Credit"，只留 `Sched Sep 2026`（credit 在 Profile ▸ Block hours）。
6. **底部导航看不清/不好点**：duty 卡是近白色（palette.card #f1f5f9），frosted dock（rgba(255,255,255,.2) + 白图标）压在上面几乎不可见。已实现 `components/v2/BottomFade.tsx`（190–200px，底部 60% 处即接近实色 g1）+ dock 原有阴影增强；Schedule 列表 paddingBottom 110→150。**备选方案（未采用，等 Ryan 定）**：PillDock 加 tone=darker 只在 Sch tab 用深灰底、或所有 tab 都换实色 dock。
7. **Trip Details 顺序不对**：行序原来是 Leave home → Wake Up（时间上倒的），已改为 Get Ready/Wake Up → Leave home → Check-in/report → STD → STA → Aircraft。Hero 也修了：原来显示 `ET895 · ADD → ADD`（base→base 看不出去哪），现在按真实航段拼 `ET895 · ADD → BJM → ADD`；同日往返的日期显示成单日。
   Home 的 Upcoming Trip 卡同样把 Ready 调到 Check-in 之前。

## 关键文件
- crew-app: src/features/v2/{ScheduleScreen,model,useV2,TripDetailsScreen,HomeScreen}.tsx|ts、src/features/roster/dutyDisplay.ts、src/features/travel/tripCsv.ts、src/components/v2/{BottomFade,PillDock}、src/version.ts（版本 102 → 105）
- live-server: src/services/mobile-roster/mobile-roster-service.ts（fleet）
- 新增 Maestro flows: crew-app/.maestro/et_j4002_ground_duties.yaml、et_j4002_schedule_empty_month.yaml、et_j4002_trip_details.yaml（含 assertNotVisible "^DO$"/"^AL$"/"^Flight$"、7M8 断言、空月不崩断言）

## 验证（实测）
- PASS crew-app `npx tsc --noEmit`；`npx jest` 45 suites / 463 tests（新增 codeAddsInfo、resolveCardIndex、flown-duty markers、tripCsv UTC 解析与边界回归）。
- PASS live-server `npx tsc --noEmit`；`npx vitest run src/services/mobile-roster src/__tests__/services/mobile-roster-service-et.test.ts src/__tests__/unit/mobile-roster-route.test.ts` → 3 files / 17 tests；curl 实测 API 已返回 `fleet: "7M8"`。
- PASS 模拟器（iPhone 17 / iOS 26.5，Maestro）：J4002 9/17 Sep ground duties 仍在正确日期且不再重复 code；机型 chip 显示；Aug 2026 空月不再红屏；Trip Details 顺序与 ADD→BJM→ADD 正确；10/11 Sep 卡的 WAKE UP→LEAVE HOME→CHECK-IN 齐全；J4007 同样通过（另一 crew 回归）。
- 截图（docs/assets/screenshots/crew-app/）：et-j4002-sched-sep09-dayoff-Ver1/2/3、et-j4002-sched-sep17-annualleave-Ver1/2/3、et-j4002-sched-sep2026-top-Ver1/2/3、et-j4002-trip-details-Ver1、et-j4002-sched-aug2026-empty-Ver1、et-j4007-sched-sep2026-top-Ver2（Ver1=修复前，Ver2=去重+机型，Ver3=+标题/底部渐隐/标记齐全）。

## 未做 / 待 Ryan 决定
- 底部导航的备选方案（Sch tab 专用深色 dock vs 全局实色 dock）未采用。
- 未 commit / 未 push。

## 当前工作树快照

### git status --short

```text
 M crew-app/.maestro/et_login_storage_failure_2_login.yaml
 M crew-app/__tests__/features/dutyDisplay.test.ts
 M crew-app/__tests__/features/ekRosterApi.test.ts
 M crew-app/__tests__/features/ekRosterLogin.test.ts
 M crew-app/__tests__/features/etAirlineSelection.test.ts
 M crew-app/__tests__/features/timeFormat.test.ts
 M crew-app/__tests__/features/tripCsv.test.ts
 M crew-app/__tests__/features/v2Model.test.ts
 M crew-app/__tests__/store/authSlice.test.ts
 M crew-app/src/components/v2/PillDock.tsx
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
 M crew-app/src/features/travel/tripCsv.ts
 M crew-app/src/features/v2/HomeScreen.tsx
 M crew-app/src/features/v2/ScheduleScreen.tsx
 M crew-app/src/features/v2/TimeZoneScreen.tsx
 M crew-app/src/features/v2/TripDetailsScreen.tsx
 M crew-app/src/features/v2/model.ts
 M crew-app/src/features/v2/useV2.ts
 M crew-app/src/version.ts
 M docs/dev-context/LATEST.md
 M live-server/src/__tests__/services/mobile-roster-service-et.test.ts
 M live-server/src/index.ts
 M live-server/src/models/index.ts
 M live-server/src/plugins/auth.ts
 M live-server/src/services/mobile-roster/__tests__/mobile-roster-service.test.ts
 M live-server/src/services/mobile-roster/mobile-roster-service.ts
?? crew-app/.maestro/et_crew_duty_sim.yaml
?? crew-app/.maestro/et_j4002_ground_duties.yaml
?? crew-app/.maestro/et_j4002_schedule_empty_month.yaml
?? crew-app/.maestro/et_j4002_trip_details.yaml
?? crew-app/.maestro/et_j4007_login.yaml
?? crew-app/.maestro/ui_theme_and_timezone.yaml
?? crew-app/src/components/v2/BottomFade.tsx
?? crew-app/src/features/settings/airportZones.ts
?? docs/assets/screenshots/crew-app/et-j4002-home-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-home-Ver2.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-aug2026-empty-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep09-dayoff-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep09-dayoff-Ver2.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep09-dayoff-Ver3.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep17-annualleave-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep17-annualleave-Ver2.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep17-annualleave-Ver3.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep2026-top-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep2026-top-Ver2.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep2026-top-Ver3.png
?? docs/assets/screenshots/crew-app/et-j4002-trip-details-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4007-login-home-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4007-sched-sep13-et857-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4007-sched-sep20-et917-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4007-sched-sep2026-top-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4007-sched-sep2026-top-Ver2.png
?? docs/assets/screenshots/crew-app/gantt-j4002-sep2026-Ver1.png
?? docs/assets/screenshots/crew-app/gantt-j4007-sep2026-Ver1.png
?? docs/design/
?? docs/dev-context/2026-09-11-live-server-crew-app-et-j4002-ground-duty-parity.md
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
crew-app/__tests__/features/tripCsv.test.ts
crew-app/__tests__/features/v2Model.test.ts
crew-app/__tests__/store/authSlice.test.ts
crew-app/src/components/v2/PillDock.tsx
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
crew-app/src/features/travel/tripCsv.ts
crew-app/src/features/v2/HomeScreen.tsx
crew-app/src/features/v2/ScheduleScreen.tsx
crew-app/src/features/v2/TimeZoneScreen.tsx
crew-app/src/features/v2/TripDetailsScreen.tsx
crew-app/src/features/v2/model.ts
crew-app/src/features/v2/useV2.ts
crew-app/src/version.ts
docs/dev-context/LATEST.md
live-server/src/__tests__/services/mobile-roster-service-et.test.ts
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
2. 本文件：`docs/dev-context/2026-09-11-live-server-crew-app-sched-review-fixes.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh live-server
git status --short
```
