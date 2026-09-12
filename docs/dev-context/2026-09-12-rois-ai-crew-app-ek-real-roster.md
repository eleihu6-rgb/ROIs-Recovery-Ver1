# 开发上下文（2026-09-12）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-12 11:04:22 PDT
- Wing：`rois-ai`
- Topic：`crew-app-ek-real-roster`
- Title：Crew app — Emirates option signs in real EK crew K1003
- Git branch：`feat/crew-app-rbot-assistant`

## 本轮对话上下文

Ryan 2026-09-12: "crew app, set EK default login ID as K1003, pass the test by login and find schedule".

PROBLEM
- The Emirates option read its roster from the EVACC crew-app gateway
  (EKRosterApiBaseURL = https://ai.rois.one/api -> /api/crew-app/v1/roster),
  whose dataset only holds the synthetic C9000xx demo crews. A real Emirates
  crew (K1003) could not sign in "as EK" (401/404), which is why the earlier
  k1003_basic flow had to log in through the ET option. That gateway (:5566 ->
  :8000) was 502 on this machine too.

DECISION (resolves the OPEN question in the 2026-09-11 EK-branding context)
- Route the EK ROSTER to the ROIS live-server mobile-roster contract, keep EK
  notifications / FDP discretion on the EVACC gateway (live-server has no
  discretion endpoints; EK discretion is EVACC-only).
- Set EK's default login to real crew K1003 (Khalid Al Nuaimi, CA, A380, DXB).

CHANGES
- live-server: MobileRosterAirline + the /api/mobile-roster/session zod enum now
  accept 'EK' (service is carrier-agnostic, so this is just the enum + type).
- crew-app airlines.ts: new optional Airline.rosterApiBaseUrl. EK keeps
  apiBaseUrl = EVACC (notify/discretion/absence) and adds
  rosterApiBaseUrl = f8RosterApiBaseUrl (ROIS live-server, same base F8/ET use:
  https://cr.rois.one/api prod / http://127.0.0.1:3000/api dev).
  TEST_CREDENTIALS.EK.crewId C900001 -> K1003.
- crew-app ekRosterLogin.ts: loadEkRosterSession signs in against
  rosterApiBaseUrl ?? apiBaseUrl.
- crew-app ekRosterApi.ts: MOBILE_ROSTER_AIRLINES = {F8,ET,EK} (roster path
  /mobile-roster/session + envelope parse + baseOffsetMin 0). New
  usesLiveServerEnvelope = {F8,ET} so notificationsApi / absenceApi do NOT
  unwrap EK responses (EVACC returns them raw) — no notify/absence behavior
  change for EK, TG, or PR.
- APP_VERSION 114 -> 115.

EVIDENCE (2026-09-12, iPhone Air / iOS 26.5 simulator, Metro :8081, live-server :3000)
- .maestro/ek_login.yaml PASS end to end: EK picker -> default K1003 prefill ->
  login -> Home (Emirates brand, EK414/EK763) -> Schedule tab -> sched-list ->
  scroll to duty-EK763 -> Calendar grid -> Route map (DXB base, 10 flights /
  144:00 duty / 116:00 block / 95,830 km — same numbers as the 2026-09-11 run).
- .maestro/k1003_basic.yaml PASS end to end on the EK option now (R'Bot local
  answer + route map + Schedule timeline/calendar/route + Profile "Khalid Al
  Nuaimi").
- Cross-carrier regression: .maestro/et_crew_duty_sim.yaml -e CREW_ID=J4002 PASS
  (separate carrier on the same mobile-roster path; login shows J4002, no mixing).
- crew-app: 68 jest suites / 651 tests PASS, npx tsc --noEmit clean.
  live-server: mobile-roster route/service suites 19 tests PASS, tsc clean.
- Screenshots: docs/assets/screenshots/crew-app/crew-app-ek-login-Ver1-00..05.

NOT RUN / LIMITS
- TG and PR simulator passes were not re-run: this change only alters the EK
  airline entry and EK's roster transport; TG/PR use portalKind 'rois' (capture)
  and their usesLiveServerEnvelope value (false) is unchanged, so their paths are
  untouched by construction. crew-app jest still covers them.
- EK FDP discretion still needs the EVACC backend up (unchanged); it is not part
  of this flow.
- live-server `src/__tests__/services` has pre-existing unrelated failures
  (roster-publish-outbound BullMQ mocks) — not touched here.

## 当前工作树快照

### git status --short

```text
 M CLAUDE.md
 M crew-app/.maestro/ek_login.yaml
 M crew-app/.maestro/k1003_basic.yaml
 M crew-app/__tests__/features/ekAirlineSelection.test.ts
 M crew-app/__tests__/features/ekRosterApi.test.ts
 M crew-app/src/features/absence/absenceApi.ts
 M crew-app/src/features/auth/airlines.ts
 M crew-app/src/features/auth/ekRosterLogin.ts
 M crew-app/src/features/notifications/notificationsApi.ts
 M crew-app/src/features/travel/ekRosterApi.ts
 M crew-app/src/version.ts
 M live-server/src/__tests__/unit/mobile-roster-route.test.ts
 M live-server/src/routes/mobile-roster/mobile-roster.ts
 M live-server/src/services/mobile-roster/mobile-roster-service.ts
?? crew-app/absence-02-from-plus-one.png
?? crew-app/absence-03-range-two-days.png
?? crew-app/ek_login_00_default.png
?? crew-app/ek_login_01_home.png
?? crew-app/ek_login_02_schedule.png
?? crew-app/ek_login_03_schedule_ek763.png
?? crew-app/ek_login_04_calendar.png
?? crew-app/ek_login_05_route_map.png
?? crew-app/etsched_00_timeline.png
?? crew-app/etsched_01_menu.png
?? crew-app/etsched_02_calendar.png
?? crew-app/k1003_00_login.png
?? crew-app/k1003_01_home.png
?? crew-app/k1003_02_rbot_local_answer.png
?? crew-app/k1003_03_rbot_route_map.png
?? crew-app/k1003_04_sched_timeline.png
?? crew-app/k1003_05_calendar.png
?? crew-app/k1003_06_route_map.png
?? crew-app/k1003_07_profile.png
?? crew-app/maestro_et_home.png
?? crew-app/rbot-Ver1-00_dock-entry.png
?? crew-app/rbot-Ver1-01_open.png
?? crew-app/rbot-Ver1-02_action-applied.png
?? crew-app/rbot-Ver1-03_route-map.png
?? crew-app/rbot-Ver1-04_absence-prefill.png
?? crew-app/rbot-Ver1-05_composer-above-keyboard.png
?? crew-app/rbot-et-Ver1-00_home-dock.png
?? crew-app/rbot-et-Ver1-01_open.png
?? crew-app/rbot-et-Ver1-02_roster-calendar.png
?? crew-app/rbot2-Ver1-00_dock.png
?? crew-app/rbot2-Ver1-01_local-answer.png
?? crew-app/rbot2-Ver1-02_navigated-away.png
?? crew-app/rbot2-Ver1-03_dock-dot.png
?? crew-app/rbot2-Ver1-04_thread-survived.png
?? crew-app/rbot2-Ver1-05_step3-absence.png
?? crew-app/sim_01_login.png
?? crew-app/sim_02_home.png
?? crew-app/sim_03_sched_open.png
?? crew-app/sim_04_sched_day09.png
?? crew-app/sim_05_sched_fwd1.png
?? crew-app/sim_06_sched_fwd3.png
?? crew-app/tgdest_00_home.png
?? crew-app/tgdest_01_home_destination_strip.png
?? crew-app/tgdest_02_city.png
?? crew-app/tgdest_03_next_city.png
?? crew-app/tgdest_04_back_to_first.png
?? crew-app/tgdest_05_hotel_transfer.png
?? crew-app/tgdest_06_trip_details.png
?? docs/ai/2026-09-12-0606-iphone-crew-app-login-build-provenance-audit-Ver1.md
?? docs/ai/2026-09-12-0608-project-startup-validation-Ver1.md
?? docs/ai/rules/
?? docs/assets/screenshots/crew-app/crew-app-ek-login-Ver1-00_default-K1003.png
?? docs/assets/screenshots/crew-app/crew-app-ek-login-Ver1-01_home-emirates.png
?? docs/assets/screenshots/crew-app/crew-app-ek-login-Ver1-02_sched-timeline.png
?? docs/assets/screenshots/crew-app/crew-app-ek-login-Ver1-03_sched-EK763.png
?? docs/assets/screenshots/crew-app/crew-app-ek-login-Ver1-04_calendar.png
?? docs/assets/screenshots/crew-app/crew-app-ek-login-Ver1-05_route-map.png
?? docs/assets/screenshots/crew-app/iphone-air-login-Ver1.png
?? docs/assets/screenshots/gantt/cr-public-login-20260912-Ver1.png
?? docs/assets/screenshots/gantt/startup-gantt-20260912-Ver2.png
?? docs/assets/screenshots/gantt/startup-gantt-20260912-Ver3.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver1.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver2.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver3.png
?? gantt/src/services/__tests__/gantt-sync-manager-fallback.test.ts
?? sim_01_login.png
```

### unstaged changed files

```text
CLAUDE.md
crew-app/.maestro/ek_login.yaml
crew-app/.maestro/k1003_basic.yaml
crew-app/__tests__/features/ekAirlineSelection.test.ts
crew-app/__tests__/features/ekRosterApi.test.ts
crew-app/src/features/absence/absenceApi.ts
crew-app/src/features/auth/airlines.ts
crew-app/src/features/auth/ekRosterLogin.ts
crew-app/src/features/notifications/notificationsApi.ts
crew-app/src/features/travel/ekRosterApi.ts
crew-app/src/version.ts
live-server/src/__tests__/unit/mobile-roster-route.test.ts
live-server/src/routes/mobile-roster/mobile-roster.ts
live-server/src/services/mobile-roster/mobile-roster-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-12-rois-ai-crew-app-ek-real-roster.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
