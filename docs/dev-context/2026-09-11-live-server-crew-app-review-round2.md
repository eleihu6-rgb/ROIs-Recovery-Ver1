# 开发上下文（2026-09-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-11 15:33:11 PDT
- Wing：`live-server`
- Topic：`crew-app-review-round2`
- Title：Crew App review round 2 — fleet/nationality in API, dark dock on Schedule, translucent cards, profile identity + avatars, home straight to trip
- Git branch：`feat/gantt/roundtrip-pairing-builder`

## 本轮对话上下文

## 目标
Ryan 第二批 crew-app 走查（2026-09-11 下午）：API 是否送更多信息、Sch tab 深色 nav、卡片透明度、Profile 身份行与头像、Home 直达行程。

## 逐条结论（勿反复推翻）
- **#2 API 送了什么**：`POST /api/mobile-roster/session` 现在返回
  - crew: crewId / firstName / lastName / base / rank / **nationality**（本轮新增，来自 live_schema.crew.nationality）
  - pairings[]: pairingId / label / checkInUtc / releaseUtc / assignment / flights[]，flight 含 flightId / flightNumber / **fleet** / departureAirport / arrivalAirport / startUtc / endUtc
  - groundDuties[]: assignment / label / startUtc / endUtc / departureAirport / arrivalAirport
  还没送的：registration（flight.register，ET 数据为空）、机场当地时间字符串（app 自己用 airportZones 从 UTC 换算）、terminal/gate。
- **#6**：Sch tab 专用深色 dock（PillDock 读 state.routes[state.index].name === 'Schedule' → rgba(26,34,32,0.9)）。之前试的底部渐隐（BottomFade）已删除，采用 Ryan 指定的方案。
- **#8**：卡片 20% 透明 —— theme/carrier.ts `card: 'rgba(241,245,249,0.8)'`（所有 v2 卡）；Schedule 卡内嵌面（图标圆盘 / 标记条 / meeting 行）用 `CARD_INSET = 'rgba(255,255,255,0.72)'`。
- **#9**：Profile 第一行改为 crew 姓名（Getnet Kifle），第二行 `J4002 · ADD · Ethiopia`（countries.ts 用 Intl.DisplayNames + 离线表）。头像点按打开选择器：10 个角色 × 3 底色 = 30 个（avatars.tsx 导出 CHARACTER_COUNT/AVATAR_COUNT/avatarParts），选择存 settingsSlice.avatarIndex（AsyncStorage @royce_avatar），"Use my crew default" 回落到 crewId 哈希。
  - **未做**：上传自己的照片 —— 需要 native image picker（react-native-image-picker）→ pod install + 原生重建，等 Ryan 决定。
- **#10**：Home 去掉 greeting 下的 "airline crew · id · base" 行；没有 upcoming trip 时不再显示 "No upcoming duty" 空卡，直接进 Explore。

## 重要环境事故（必须知道）
- 期间 macOS 数据卷一度 100% 满（ENOSPC），把 **live-server 与 Metro 都打挂了**（live-server 日志报 pino SonicBoom ENOSPC、redis 报 MISCONF AOF 写入失败）。
- 处置：删掉可再生的 Xcode 构建缓存 `crew-app/ios/build/DerivedData`（1.7GB，下次原生构建要重建，JS 改动不需要）；redis 已自行恢复（PONG / aof ok）；live-server 与 Metro 用 python 双 fork + setsid 重新拉起（普通 nohup 会被 exec 会话回收），日志 /tmp/live-server-3000.log 与 /tmp/metro-8081.log。旧 live-server 日志备份为 /tmp/live-server-3000.log.prev。
- 结论：以后遇到 "app 白屏/No bundle URL present" 先看 8081/3000 是否还活着。

## 验证（实测）
- PASS crew-app `npx tsc --noEmit`；`npx jest` 45 suites / **464 tests**（新增 avatarParts 30 头像集、ekRosterLogin 的 setCrewProfile 断言）。
- PASS live-server `npx tsc --noEmit`；`npx vitest run src/services/mobile-roster …` 2 files / 10 tests（含 nationality 断言）。
- PASS 模拟器 Maestro（iPhone 17 / iOS 26.5）：
  - `et_j4002_profile.yaml`（新）：Home 无 "…crew · J4002…" 行 → Profile 显示 Getnet Kifle / J4002 · ADD · Ethiopia → 点头像出 30 格选择器 → 选第 2 格后头像从北极熊变猫 → 重开选择器选中态保持。
  - `et_j4002_ground_duties.yaml`：Sch tab 深色 dock 可读、卡片半透明、7M8 机型 chip、9/17 Sep ground duty 正确。
- 截图（docs/assets/screenshots/crew-app/）：et-j4002-profile-Ver1、et-j4002-avatar-picker-Ver1、et-j4002-avatar-picked-Ver1、et-j4002-sched-*-Ver4（Ver4 = 深色 dock + 半透明卡）。
- 注意：RN Modal 里的头像选择器 **Maestro 的 iOS 快照看不到**（文本断言会失败），flow 里改用坐标点击 + 截图取证。

## 未做
- 未 commit / 未 push；未做头像照片上传（等决定）。

## 当前工作树快照

### git status --short

```text
 M crew-app/.maestro/et_login_storage_failure_2_login.yaml
 M crew-app/__tests__/features/avatars.test.ts
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
 M crew-app/src/features/settings/avatars.tsx
 M crew-app/src/features/settings/settingsSlice.ts
 M crew-app/src/features/settings/timeFormat.ts
 M crew-app/src/features/travel/ekRosterApi.ts
 M crew-app/src/features/travel/portalCapture.ts
 M crew-app/src/features/travel/tripCsv.ts
 M crew-app/src/features/v2/HomeScreen.tsx
 M crew-app/src/features/v2/ProfileScreen.tsx
 M crew-app/src/features/v2/ScheduleScreen.tsx
 M crew-app/src/features/v2/TimeZoneScreen.tsx
 M crew-app/src/features/v2/TripDetailsScreen.tsx
 M crew-app/src/features/v2/model.ts
 M crew-app/src/features/v2/useV2.ts
 M crew-app/src/theme/carrier.ts
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
?? crew-app/.maestro/et_j4002_profile.yaml
?? crew-app/.maestro/et_j4002_schedule_empty_month.yaml
?? crew-app/.maestro/et_j4002_trip_details.yaml
?? crew-app/.maestro/et_j4007_login.yaml
?? crew-app/.maestro/ui_theme_and_timezone.yaml
?? crew-app/src/features/settings/airportZones.ts
?? crew-app/src/features/settings/countries.ts
?? docs/assets/screenshots/crew-app/et-j4002-avatar-picked-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-avatar-picker-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-home-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-home-Ver2.png
?? docs/assets/screenshots/crew-app/et-j4002-profile-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-aug2026-empty-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep09-dayoff-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep09-dayoff-Ver2.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep09-dayoff-Ver3.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep09-dayoff-Ver4.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep17-annualleave-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep17-annualleave-Ver2.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep17-annualleave-Ver3.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep17-annualleave-Ver4.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep2026-top-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep2026-top-Ver2.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep2026-top-Ver3.png
?? docs/assets/screenshots/crew-app/et-j4002-sched-sep2026-top-Ver4.png
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
?? docs/dev-context/2026-09-11-live-server-crew-app-sched-review-fixes.md
?? docs/handoff/agent-workflow/
?? docs/handoff/crew-app/
?? docs/superpowers/completed/crew-app-v2-mock.html
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
crew-app/__tests__/features/avatars.test.ts
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
crew-app/src/features/settings/avatars.tsx
crew-app/src/features/settings/settingsSlice.ts
crew-app/src/features/settings/timeFormat.ts
crew-app/src/features/travel/ekRosterApi.ts
crew-app/src/features/travel/portalCapture.ts
crew-app/src/features/travel/tripCsv.ts
crew-app/src/features/v2/HomeScreen.tsx
crew-app/src/features/v2/ProfileScreen.tsx
crew-app/src/features/v2/ScheduleScreen.tsx
crew-app/src/features/v2/TimeZoneScreen.tsx
crew-app/src/features/v2/TripDetailsScreen.tsx
crew-app/src/features/v2/model.ts
crew-app/src/features/v2/useV2.ts
crew-app/src/theme/carrier.ts
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
2. 本文件：`docs/dev-context/2026-09-11-live-server-crew-app-review-round2.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh live-server
git status --short
```
