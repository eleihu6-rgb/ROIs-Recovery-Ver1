# 开发上下文（2026-09-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-11 23:42:05 PDT
- Wing：`rois-ai`
- Topic：`crew-app-ek-crew-carrier-branding`
- Title：Crew app — EK crew (K1003) carries the Emirates brand, not Ethiopian
- Git branch：`feat/crew-app-rbot-assistant`

## 本轮对话上下文

Ryan 2026-09-11: "test basic feat for EK crew K1003" then "EK crew shows ET logo".

WHAT WAS WRONG
- The crew app branded from the SIGN-IN PICKER (`auth.airline`) only. Crew K1003
  (Khalid Al Nuaimi, CA, A380, DXB — one of the 40 UAE crew K1001-K1040 seeded by
  skill 141 on 2026-08-27) exists in the ROIS live DB, and the ROIS mobile-roster
  endpoint answers the ET and F8 options alike — so signing in "as ET" to reach
  K1003's roster stamped the app with the Ethiopian wordmark and the emerald
  ground, while the roster it displayed was Emirates (EK763/764, EK414/413,
  EK201/202).
- The Emirates option in the app points at the EVACC EK crew-app gateway
  (ai.rois.one -> :5566 -> :8000, /api/crew-app/v1/roster), whose dataset holds
  only the synthetic C9000xx demo crews, so a real EK crew cannot sign in "as EK"
  today. K1003 is unreachable through that path (401 / 404).

FIX (source of truth = the roster)
- live-server mobile-roster service: each flight now carries `carrier`
  (flight.airline) and the response's `crew.carrier` is the crew's own carrier,
  resolved as the most common flight carrier in the window (ties -> earliest
  first leg; null when the window has no flights).
- crew-app: `crewCarrierOf()` reads it; the login puts it on the session
  (`auth.carrier`) and into the EK roster snapshot session so "Keep Login" keeps
  the right brand. Every brand/theme consumer now reads `carrier ?? airline`
  (HomeScreen header, V2Navigator carrier theme, Appearance, Preferences).
- New asset src/assets/brand/emirates-white.png: the official Emirates
  calligraphy + wordmark recoloured pure white (from Wikimedia Commons
  "File:Emirates logo.svg"), wired into BrandLogo for code 'EK'.
- New carrier palette 'emirates' (Emirates red) with presetForAirline('EK') ->
  'emirates'. It is a CARRIER DEFAULT only: THEME_PRESETS is still the same four
  selectable swatches (sia/thai/emerald/graphite), and an explicit crew choice
  still wins. resolveTheme now validates carrier defaults against the palette map
  instead of the selectable list, and returns CarrierPreset.
- APP_VERSION 113 -> 114.

EVIDENCE (2026-09-11, iPhone 17 / iOS 26.5 simulator, app on Metro :8081)
- .maestro/k1003_basic.yaml PASS end to end: login as K1003 (through the ET
  roster option until the Emirates option is wired to real crews), Home shows the
  Emirates mark on the Emirates-red ground, R'Bot answers "what is my next duty?"
  on-device (EK414 11 Sep, DXB->SYD), "show me my route map" navigates, Schedule
  timeline/calendar/route map (DXB base; DXB->JNB 6,412 km, DXB->JFK 11,002 km,
  DXB->SYD 12,044 km; 10 flights / 95,830 km / 116:00 block / 144:00 duty),
  Profile shows "Khalid Al Nuaimi".
- Screenshots: docs/assets/screenshots/crew-app/crew-app-k1003-Ver1-00..07.
- Regression: ET crew J4002 still emerald with ET422/ET423
  (.maestro/et_j4002_sched_roster_views.yaml reaches roster + calendar; its final
  `cal-timeline` assert fails on a stale testID in the in-flight
  ScheduleScreen/roster-views work, not on this change — the day timeline renders).
- Tests: crew-app 68 suites / 648 tests PASS, npx tsc --noEmit clean;
  live-server mobile-roster service/route vitest PASS, npx tsc --noEmit clean.

OPEN (Ryan's call)
- Should the Emirates PICKER option itself serve real EK crews (route EK to the
  ROIS roster service, retire the EVACC demo path from the app), or stay on the
  EVACC EK demo? Branding is correct either way now.
- PR still has no white logo asset (Ryan's earlier "2 more for PR and EK").

## 当前工作树快照

### git status --short

```text
 M crew-app/.maestro/v2_tg_login.yaml
 M crew-app/__tests__/features/NotificationsScreen.test.tsx
 M crew-app/__tests__/features/dutyDisplay.test.ts
 M crew-app/__tests__/features/ekRosterLogin.test.ts
 M crew-app/__tests__/features/scheduleRosterViews.test.tsx
 M crew-app/src/components/v2/BrandLogo.tsx
 M crew-app/src/components/v2/icons.tsx
 M crew-app/src/components/v2/rows.tsx
 M crew-app/src/features/auth/LoginScreen.tsx
 M crew-app/src/features/auth/authSlice.ts
 M crew-app/src/features/auth/ekRosterLogin.ts
 M crew-app/src/features/auth/ekRosterSnapshot.ts
 M crew-app/src/features/auth/sessionStore.ts
 M crew-app/src/features/notifications/NotificationsScreen.tsx
 M crew-app/src/features/notifications/notificationsApi.ts
 M crew-app/src/features/roster/dutyDisplay.ts
 M crew-app/src/features/travel/ekRosterApi.ts
 M crew-app/src/features/v2/AppearanceScreen.tsx
 M crew-app/src/features/v2/HomeScreen.tsx
 M crew-app/src/features/v2/PreferencesScreen.tsx
 M crew-app/src/features/v2/ScheduleScreen.tsx
 M crew-app/src/features/v2/SpecPage.tsx
 M crew-app/src/features/v2/V2Navigator.tsx
 M crew-app/src/theme/carrier.ts
 M crew-app/src/version.ts
 M docs/dev-context/LATEST.md
 M docs/modules/gantt/live-scenario-gantt-playbook.md
 M docs/superpowers/completed/crew-app-v2-mock.html
 M gantt/src/components/data/crew-master-view.tsx
 M gantt/src/components/panes/pairing-pane.tsx
 M gantt/src/components/panes/pane-condition-strip.tsx
 M gantt/src/components/panes/roster-pane.tsx
 M gantt/src/components/panes/shared/roster-pane.tsx
 M gantt/src/components/roster/context-menu.tsx
 M gantt/src/components/shell/app-shell.tsx
 M gantt/src/config/data-entity-registry.ts
 M gantt/src/stores/ui-store.ts
 M gantt/src/types/data-maintenance.ts
 M live-server/scripts/legality-recheck-core.mjs
 M live-server/src/index.ts
 M live-server/src/plugins/auth.ts
 M live-server/src/routes/crew-notify/crew-notify.ts
 M live-server/src/routes/data/index.ts
 M live-server/src/services/crew-notify/__tests__/crew-notify-service.test.ts
 M live-server/src/services/crew-notify/crew-notify-service.ts
 M live-server/src/services/mobile-roster/mobile-roster-service.ts
 M live-server/src/services/roster/auto-assign-service.ts
?? crew-app/.maestro/et_j4002_absence.yaml
?? crew-app/.maestro/et_j4002_alerts.yaml
?? crew-app/.maestro/k1003_basic.yaml
?? crew-app/__tests__/features/AbsenceScreen.test.tsx
?? crew-app/__tests__/features/absenceApi.test.ts
?? crew-app/__tests__/features/brandLogo.test.tsx
?? crew-app/__tests__/features/crewCarrierBranding.test.ts
?? crew-app/__tests__/features/loginScreen.test.tsx
?? crew-app/__tests__/features/rbotAbsencePrefill.test.tsx
?? crew-app/__tests__/features/rosterChange.test.ts
?? crew-app/absence-02-from-plus-one.png
?? crew-app/absence-03-range-two-days.png
?? crew-app/etsched_00_timeline.png
?? crew-app/etsched_01_menu.png
?? crew-app/etsched_02_calendar.png
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
?? crew-app/src/assets/brand/emirates-white.png
?? crew-app/src/features/absence/
?? crew-app/src/features/notifications/rosterChange.ts
?? crew-app/src/features/v2/AbsenceScreen.tsx
?? crew-app/tgdest_00_home.png
?? crew-app/tgdest_01_home_destination_strip.png
?? crew-app/tgdest_02_city.png
?? crew-app/tgdest_03_next_city.png
?? crew-app/tgdest_04_back_to_first.png
?? crew-app/tgdest_05_hotel_transfer.png
?? crew-app/tgdest_06_trip_details.png
?? docs/assets/screenshots/crew-app/alerts-Ver1-00_home-rest.png
?? docs/assets/screenshots/crew-app/alerts-Ver1-01_roster-change-before-after.png
?? docs/assets/screenshots/crew-app/alerts-Ver1-02_home-scrolled-clear.png
?? docs/assets/screenshots/crew-app/crew-app-absence-Ver1-00_form.png
?? docs/assets/screenshots/crew-app/crew-app-absence-Ver1-01_filled-before-submit.png
?? docs/assets/screenshots/crew-app/crew-app-appicon-Ver1.png
?? docs/assets/screenshots/crew-app/crew-app-home-icon-ios-Ver1.png
?? docs/assets/screenshots/crew-app/crew-app-icon-Ver1-00_studio-header.png
?? docs/assets/screenshots/crew-app/crew-app-icon-Ver1-01_login-logo.png
?? docs/assets/screenshots/crew-app/crew-app-icon-Ver1-02_ver11-full.png
?? docs/assets/screenshots/crew-app/crew-app-icon-Ver1-03_ver10-no-chip.png
?? docs/assets/screenshots/crew-app/crew-app-k1003-Ver1-00_login.png
?? docs/assets/screenshots/crew-app/crew-app-k1003-Ver1-01_home-emirates-brand.png
?? docs/assets/screenshots/crew-app/crew-app-k1003-Ver1-02_rbot-local-answer.png
?? docs/assets/screenshots/crew-app/crew-app-k1003-Ver1-03_rbot-route-map.png
?? docs/assets/screenshots/crew-app/crew-app-k1003-Ver1-04_sched-timeline.png
?? docs/assets/screenshots/crew-app/crew-app-k1003-Ver1-05_calendar.png
?? docs/assets/screenshots/crew-app/crew-app-k1003-Ver1-06_route-map.png
?? docs/assets/screenshots/crew-app/crew-app-k1003-Ver1-07_profile.png
?? docs/assets/screenshots/crew-app/crew-app-login-Ver11.png
?? docs/assets/screenshots/crew-app/crew-app-login-ios-Ver1.png
?? docs/assets/screenshots/crew-app/crew-app-login-ios-Ver2-revealed.png
?? docs/assets/screenshots/crew-app/crew-app-login-ios-Ver2.png
?? docs/assets/screenshots/crew-app/crew-app-login-ios-Ver3-revealed.png
?? docs/assets/screenshots/crew-app/crew-app-login-ios-Ver3.png
?? docs/assets/screenshots/crew-app/login-Ver1-00_field_placeholders.png
?? docs/assets/screenshots/crew-app/pr-card-Ver1-00_no_white_box.png
?? docs/assets/screenshots/crew-app/pr-card-Ver1-01_no_duplicate_code.png
?? docs/assets/screenshots/crew-app/pr-card-Ver1-02_duty_cards.png
?? docs/assets/screenshots/crew-app/pr-home-Ver1-00_altair_mark_fallback.png
?? docs/assets/screenshots/crew-app/schedviews-Ver3-00_timeline_no_box.png
?? docs/assets/screenshots/gantt/best-fit-batch-Ver2.png
?? docs/assets/screenshots/gantt/best-fit-batch-Ver3.png
?? docs/assets/screenshots/gantt/best-fit-batch-Ver4.png
?? docs/assets/screenshots/gantt/best-fit-batch-mobile-Ver2.png
?? docs/assets/screenshots/gantt/best-fit-batch-mobile-Ver3.png
?? docs/assets/screenshots/gantt/best-fit-batch-mobile-Ver4.png
?? docs/assets/screenshots/gantt/best-fit-batch-mobile-candidates-Ver3.png
?? docs/assets/screenshots/gantt/best-fit-batch-mobile-candidates-Ver4.png
?? docs/assets/screenshots/gantt/best-fit-crew-live-Ver1.png
?? docs/assets/screenshots/gantt/best-fit-crew-live-Ver2.png
?? docs/assets/screenshots/gantt/best-fit-crew-option-a-backdrop-Ver1.png
?? docs/assets/screenshots/gantt/best-fit-crew-option-a-desktop.png
?? docs/assets/screenshots/gantt/best-fit-crew-option-a-mobile.png
?? docs/assets/screenshots/gantt/best-fit-crew-option-a-queue-Ver1.png
?? docs/assets/screenshots/gantt/best-fit-crew-option-b-backdrop-Ver1.png
?? docs/assets/screenshots/gantt/best-fit-crew-option-b-desktop.png
?? docs/assets/screenshots/gantt/best-fit-crew-option-b-mobile.png
?? docs/assets/screenshots/gantt/best-fit-crew-option-b-queue-Ver1.png
?? docs/assets/screenshots/gantt/best-fit-crew-option-b-step1-Ver1.png
?? docs/assets/screenshots/gantt/best-fit-crew-option-b-step2-Ver1.png
?? docs/assets/screenshots/gantt/best-fit-crew-option-b-step3-Ver1.png
?? docs/assets/screenshots/gantt/crew-absence-data-crew-master-Ver1.png
?? docs/assets/screenshots/gantt/crew-absence-data-crew-master-Ver2.png
?? docs/assets/screenshots/gantt/crew-absence-dialog-Ver1.png
?? docs/assets/screenshots/gantt/crew-absence-dialog-Ver2.png
?? docs/assets/screenshots/gantt/crew-absence-dialog-Ver3.png
?? docs/assets/screenshots/gantt/crew-absence-dialog-jump-Ver1.png
?? docs/assets/screenshots/gantt/crew-absence-dialog-jump-Ver2.png
?? docs/assets/screenshots/gantt/crew-absence-stand-down-j4002-Ver1.png
?? docs/dev-context/2026-09-11-crew-app-alerts-before-after-and-home-polish.md
?? docs/dev-context/2026-09-11-gantt-best-fit-apply-shortlist.md
?? docs/dev-context/2026-09-11-gantt-best-fit-batch-design-ver2.md
?? docs/dev-context/2026-09-11-gantt-best-fit-crew-implemented.md
?? docs/superpowers/specs/2026-09-11-best-fit-crew-batch-design-Ver2.md
?? docs/superpowers/specs/2026-09-11-best-fit-crew-mockups/
?? docs/superpowers/specs/2026-09-11-best-fit-crew-open-pairing-design.md
?? docs/superpowers/specs/2026-09-11-crew-recovery-story-101-sick-leave-stand-down.md
?? docs/test-cases/gantt/live-sync-cr-rois-one-signoff-gate.md
?? e2e/tests/gantt/best-fit-crew-open-pairings.spec.ts
?? e2e/tests/gantt/crew-absence-records.spec.ts
?? e2e/tests/gantt/crew-absence-stand-down.spec.ts
?? gantt/src/components/best-fit/
?? gantt/src/components/roster/crew-absence-dialog.tsx
?? gantt/src/services/__tests__/gantt-sync-manager-fallback.test.ts
?? gantt/src/services/best-fit-api.ts
?? gantt/src/services/crew-absence-api.ts
?? gantt/src/stores/best-fit-store.ts
?? gantt/src/utils/__tests__/best-fit-candidates.test.ts
?? gantt/src/utils/best-fit-apply.ts
?? gantt/src/utils/best-fit-candidates.ts
?? live-server/src/__tests__/services/mobile-roster-service-crew-carrier.test.ts
?? live-server/src/routes/absence/
?? live-server/src/routes/best-fit/
?? live-server/src/services/absence/
?? live-server/src/services/assignment/preview-roster-items.ts
?? live-server/src/services/best-fit/
?? live-server/tests/unit/best-fit-service.test.ts
?? sim_01_login.png
?? sql/migration/2026-09-11-crew-absence.sql
```

### unstaged changed files

```text
crew-app/.maestro/v2_tg_login.yaml
crew-app/__tests__/features/NotificationsScreen.test.tsx
crew-app/__tests__/features/dutyDisplay.test.ts
crew-app/__tests__/features/ekRosterLogin.test.ts
crew-app/__tests__/features/scheduleRosterViews.test.tsx
crew-app/src/components/v2/BrandLogo.tsx
crew-app/src/components/v2/icons.tsx
crew-app/src/components/v2/rows.tsx
crew-app/src/features/auth/LoginScreen.tsx
crew-app/src/features/auth/authSlice.ts
crew-app/src/features/auth/ekRosterLogin.ts
crew-app/src/features/auth/ekRosterSnapshot.ts
crew-app/src/features/auth/sessionStore.ts
crew-app/src/features/notifications/NotificationsScreen.tsx
crew-app/src/features/notifications/notificationsApi.ts
crew-app/src/features/roster/dutyDisplay.ts
crew-app/src/features/travel/ekRosterApi.ts
crew-app/src/features/v2/AppearanceScreen.tsx
crew-app/src/features/v2/HomeScreen.tsx
crew-app/src/features/v2/PreferencesScreen.tsx
crew-app/src/features/v2/ScheduleScreen.tsx
crew-app/src/features/v2/SpecPage.tsx
crew-app/src/features/v2/V2Navigator.tsx
crew-app/src/theme/carrier.ts
crew-app/src/version.ts
docs/dev-context/LATEST.md
docs/modules/gantt/live-scenario-gantt-playbook.md
docs/superpowers/completed/crew-app-v2-mock.html
gantt/src/components/data/crew-master-view.tsx
gantt/src/components/panes/pairing-pane.tsx
gantt/src/components/panes/pane-condition-strip.tsx
gantt/src/components/panes/roster-pane.tsx
gantt/src/components/panes/shared/roster-pane.tsx
gantt/src/components/roster/context-menu.tsx
gantt/src/components/shell/app-shell.tsx
gantt/src/config/data-entity-registry.ts
gantt/src/stores/ui-store.ts
gantt/src/types/data-maintenance.ts
live-server/scripts/legality-recheck-core.mjs
live-server/src/index.ts
live-server/src/plugins/auth.ts
live-server/src/routes/crew-notify/crew-notify.ts
live-server/src/routes/data/index.ts
live-server/src/services/crew-notify/__tests__/crew-notify-service.test.ts
live-server/src/services/crew-notify/crew-notify-service.ts
live-server/src/services/mobile-roster/mobile-roster-service.ts
live-server/src/services/roster/auto-assign-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-11-rois-ai-crew-app-ek-crew-carrier-branding.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
