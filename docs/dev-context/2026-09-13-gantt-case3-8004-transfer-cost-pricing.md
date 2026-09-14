# 开发上下文（2026-09-13）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-13 15:57:03 PDT
- Wing：`gantt`
- Topic：`case3-8004-transfer-cost-pricing`
- Title：case3-8004-transfer-cost-pricing
- Git branch：`main`

## 本轮对话上下文

Case 3 (Rule 8004 crew-fleet mismatch, pairing 152227 / source L3001) — the roster-transfer
recovery options were all "Unpriced"; they are now library-priced. Resumed after the previous
run was killed mid-verification.

WHAT CHANGED
- live-server/src/services/recovery/transfer-gh-cost.ts (new): GH-only transfer estimate —
  receiving crew's incremental guaranteed-hours pay + source released-duty saving, priced through
  the Cost Library guarantee calculator via swapPolicySql. Throws (route → "Calculation
  unavailable: ...") for cross-base/cross-role/multi-rank/non-pilot, target already on the pairing,
  non-ADD-based target, or a pairing spanning months. A crew with no saved credit rows is priced
  from a documented 0h baseline.
- live-server/src/routes/recovery/recovery-cost.ts: transferContext added to costInputSchema;
  priceComponents() extracted; new transfer branch = configured roster-change components +
  transfer GH rows (currency must match). Unit test transfer-gh-cost.test.ts.
- gantt/src/services/recovery-candidates.ts: optionToLibraryCostInput emits transferContext for
  mode 'transfer'. gantt/src/services/recovery-api.ts: chunkRecoveryCostInputs — live-server caps
  calculate-cost/batch at 128 inputs, and a bigger Live option list 400'd, marking EVERY candidate
  Unpriced. That cap was a second root cause; do not revert the chunking.
- e2e/config/case3.config.ts testMatch extended with -costs.
- Cost library components: 1009 Roster transfer base (150) + 1015 Roster change penalty (260) =
  US$410.00 under-GH; 1016 follow-on (1800) when follow-ons exist.

VERIFIED (all PASS)
- live-server vitest transfer-gh-cost + swap-gh-cost = 33 passed. gantt vitest
  recovery-swap-gh = 4 passed (transfer-context mapping).
- Real UI read-only: e2e/tests/gantt/recovery-case-003-costs.spec.ts → 1 passed (45.5s),
  run via `cd e2e && GANTT_BASE_URL=http://localhost:5567 GANTT_API_URL=http://localhost:3000
  npx playwright test --config=config/case3.config.ts tests/gantt/recovery-case-003-costs.spec.ts`.
  Observed 35 transfer quotes, 25 under-GH at US$410.00, 10 over-GH (430/450/540/800/810/880/
  1235/1415/1460/1547.50). Breakdown dialog: 4 priced rules, PRICED TOTAL US$410.00. Over-GH
  example J4002 = base 410 + 20 incremental GH pay = 430. draftOps === 0 (read-only honoured).
  Non-ADD-based candidates correctly report "requires the receiving crew to be based at the
  pairing base". Screenshots (visually inspected): docs/assets/screenshots/crew-recovery/
  case3-options-executable-Ver2.png, case3-options-cost-breakdown-Ver2.png,
  case3-options-cost-breakdown-over-gh-Ver2.png.
- Help suite: `cd e2e && GANTT_BASE_URL=http://localhost:5567 GANTT_API_URL=http://localhost:3000
  npx playwright test -c config/playwright.config.ts --project=gantt tests/gantt/help/ --reporter=list --no-deps`
  → 75 passed (1.0m), including the no-404 sweep over every topic and the new 6-image count.
- gantt tsc: only the pre-existing service-status-pill errors (livePort / checkedAt), nothing new.

STALE HELP CORRECTED
recovery-case-003.tsx said "Cost is Unpriced because no cost-library entry exists for an ADD
transfer" — false now. Step 6 explains the priced composition (roster-change components + each
crew's incremental GH pay, US$410.00, US$430.00 over-GH) and keeps Unpriced as the state for
contexts with no tariff (the exchange candidates in this fixture are still Unpriced). Topic now
has 6 screenshots: added s3-options-executable-Ver2.png and s3-options-cost-breakdown-Ver1.png
(under gantt/public/help/screenshots/). help-recovery.spec.ts image count 5 → 6 and text
assertions now include 'US$410.00' and 'incremental guaranteed-hours pay'. FRONTEND_VERSION
451 → 452. stepCount stays 10 (no renumbering).

DATA SIDE-EFFECT (SIT, shared schema)
.local/case3/recompute-pool.ts recomputed crew_manday_fd_daily September-2026 credit for the
L3/T2/J4 candidate pool so receiving crews have a saved baseline. Scratch probes live in
.local/case3/ (gitignored). Case-3 fixture unchanged: pairing 152227 rostered
L3001/L3002/L3006/L3007, 4 x 8004 fleet alerts; the read-only run created no draft ops.

Record: docs/test-cases/crew-recovery/2026-09-13-case-003-preparation-Ver1.md §8.
STILL OPEN: a fully clearing (7M8-qualified) replacement is not demonstrated; Standby / Cross-base
options not executed; nothing committed or pushed.

## 当前工作树快照

### git status --short

```text
 M CLAUDE.md
 M crew-app/__tests__/features/AbsenceScreen.test.tsx
 M crew-app/__tests__/features/NotificationsScreen.test.tsx
 M crew-app/__tests__/features/absenceApi.test.ts
 M crew-app/__tests__/features/crewCarrierBranding.test.ts
 M crew-app/__tests__/features/discretionScreen.test.tsx
 M crew-app/__tests__/features/dutyCalendarMessages.test.ts
 M crew-app/__tests__/features/guestLogin.test.tsx
 M crew-app/__tests__/features/loginScreen.test.tsx
 M crew-app/__tests__/features/notificationsApi.test.ts
 M crew-app/__tests__/features/preferencesCalendarSync.test.tsx
 M crew-app/__tests__/features/scheduleFlightCalendar.test.tsx
 M crew-app/__tests__/features/tripDetailsCalendar.test.tsx
 M crew-app/__tests__/features/upcomingAlarms.test.tsx
 M crew-app/src/components/v2/icons.tsx
 M crew-app/src/features/absence/absenceApi.ts
 M crew-app/src/features/auth/EkRosterLoginScreen.tsx
 M crew-app/src/features/auth/LoginScreen.tsx
 M crew-app/src/features/calendar/dutyCalendarMessages.ts
 M crew-app/src/features/notifications/NotificationsScreen.tsx
 M crew-app/src/features/notifications/notificationsApi.ts
 M crew-app/src/features/notifications/notificationsSlice.ts
 M crew-app/src/features/settings/ProfileScreen.tsx
 M crew-app/src/features/travel/MyTripsScreen.tsx
 M crew-app/src/features/travel/PortalCaptureScreen.tsx
 M crew-app/src/features/travel/ekRosterApi.ts
 M crew-app/src/features/tripTrade/MyDutyScreen.tsx
 M crew-app/src/features/v2/AbsenceScreen.tsx
 M crew-app/src/features/v2/AlarmsSettingsScreen.tsx
 M crew-app/src/features/v2/HomeScreen.tsx
 M crew-app/src/features/v2/PreferencesScreen.tsx
 M crew-app/src/features/v2/ProfileScreen.tsx
 M crew-app/src/features/v2/ScheduleScreen.tsx
 M crew-app/src/features/v2/SpecPage.tsx
 M crew-app/src/features/v2/TripDetailsScreen.tsx
 M crew-app/src/features/v2/UpcomingAlarmsScreen.tsx
 M crew-app/src/features/v2/V2Navigator.tsx
 M crew-app/src/features/v2/nav.ts
 M crew-app/src/features/v2/useV2.ts
 M crew-app/src/version.ts
 M docs/assets/screenshots/gantt/help-recovery-cases-Ver1.png
 M docs/assets/screenshots/gantt/help-recovery-recovery-case-003-Ver1.png
 M docs/dev-context/LATEST.md
 M docs/superpowers/specs/2026-09-12-S2-discretion-consent-design.md
 M docs/test-cases/crew-recovery/2026-09-13-case-003-preparation-Ver1.md
 M e2e/config/case3.config.ts
 M e2e/tests/gantt/help/help-recovery.spec.ts
 M gantt/src/components/gantt/renderers/flight-renderer.ts
 M gantt/src/components/gantt/renderers/roster-renderer.ts
 M gantt/src/components/help/topics/recovery/recovery-case-003.tsx
 M gantt/src/components/scenario-gantt/cross-rank-confirm-dialog.tsx
 M gantt/src/components/shell/shell-top-nav.tsx
 M gantt/src/services/__tests__/recovery-swap-gh.test.ts
 M gantt/src/services/recovery-api.ts
 M gantt/src/services/recovery-candidates.ts
 M gantt/src/version.ts
 M live-server/src/__tests__/unit/crew-absence-history-route.test.ts
 M live-server/src/__tests__/unit/crew-notify-route.test.ts
 M live-server/src/plugins/auth.ts
 M live-server/src/routes/crew-notify/crew-notify.ts
 M live-server/src/routes/recovery/recovery-cost.ts
 M live-server/src/services/crew-notify/__tests__/discretion-consent-service.test.ts
 M live-server/src/services/crew-notify/discretion-consent-service.ts
 M packages/ui/src/composites/app-dialog.tsx
 M packages/ui/src/styles/globals.css
 M pbs-portal/src/app/layout/dashboard-top-nav.tsx
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/bid/components/bid-review-panel.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx
 M pbs-portal/src/features/days-off/components/prefer-off-calendar-picker.tsx
 M pbs-portal/src/features/pairing/components/airport-preference-editor.tsx
 M pbs-portal/src/features/pairing/components/pairing-bid-airport-select.tsx
 M pbs-portal/src/features/pairing/components/pairing-bid-tag-list-control.tsx
 M pbs-portal/src/features/pairing/components/pairing-preference-filter-dialog.tsx
 M pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/standing-bid/pages/standing-bid-page.test.tsx
 M pbs-portal/src/features/tier/components/tier-detail-dialog.tsx
 M pbs-portal/src/shared/components/ui/pbs-dialog-frame.test.tsx
 M pbs-portal/src/shared/components/ui/pbs-dialog-frame.tsx
 M pbs-portal/src/shared/components/ui/portal-date-picker.tsx
 M scripts/check-ui-standard.mjs
?? crew-app/.maestro/ek_k1014_absence_history.yaml
?? crew-app/.maestro/ek_k1015_popup_standard.yaml
?? crew-app/__tests__/features/HomeDiscretionQuickAction.test.tsx
?? crew-app/__tests__/features/myDutyScreen.test.tsx
?? crew-app/__tests__/features/myTripsMenus.test.tsx
?? crew-app/absence-02-from-plus-one.png
?? crew-app/absence-03-range-two-days.png
?? crew-app/absence-history-Ver1-00-icon.png
?? crew-app/absence-history-Ver1-01-list.png
?? crew-app/absence-history-Ver1-02-empty.png
?? crew-app/ek-absence-Ver1-00-login.png
?? crew-app/ek-absence-Ver1-01-form.png
?? crew-app/ek-absence-Ver1-02-submitted.png
?? crew-app/ek-absence-Ver1-03-history.png
?? crew-app/ek_login_00_default.png
?? crew-app/ek_login_01_home.png
?? crew-app/ek_login_02_schedule.png
?? crew-app/ek_login_03_schedule_ek763.png
?? crew-app/ek_login_04_calendar.png
?? crew-app/ek_login_05_route_map.png
?? crew-app/etsched_00_timeline.png
?? crew-app/etsched_01_menu.png
?? crew-app/etsched_02_calendar.png
?? crew-app/guest_00_login.png
?? crew-app/guest_01_home.png
?? crew-app/guest_02_profile.png
?? crew-app/guest_03_personal.png
?? crew-app/guest_04_relaunch.png
?? crew-app/k1003_00_login.png
?? crew-app/k1003_01_home.png
?? crew-app/k1003_02_rbot_local_answer.png
?? crew-app/k1003_03_rbot_route_map.png
?? crew-app/k1003_04_sched_timeline.png
?? crew-app/k1003_05_calendar.png
?? crew-app/k1003_06_route_map.png
?? crew-app/k1003_07_profile.png
?? crew-app/maestro_et_home.png
?? crew-app/popup-standard-Ver1-01-success.png
?? crew-app/popup-standard-Ver1-02-error.png
?? crew-app/prsched_00_calendar.png
?? crew-app/prsched_01_route_map.png
?? crew-app/prsched_02_back_to_timeline.png
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
?? crew-app/sched_01_next_month_oct.png
?? crew-app/sched_02_prev_month_aug.png
?? crew-app/sched_03_demo_meetings_added.png
?? crew-app/sched_04_meeting_card_on_flight_day.png
?? crew-app/sim_01_login.png
?? crew-app/sim_02_home.png
?? crew-app/sim_03_sched_open.png
?? crew-app/sim_04_sched_day09.png
?? crew-app/sim_05_sched_fwd1.png
?? crew-app/sim_06_sched_fwd3.png
?? crew-app/src/components/v2/AppDialog.tsx
?? crew-app/src/features/notifications/DiscretionCard.tsx
?? crew-app/src/features/v2/DiscretionScreen.tsx
?? crew-app/tgdest_00_home.png
?? crew-app/tgdest_01_home_destination_strip.png
?? crew-app/tgdest_02_city.png
?? crew-app/tgdest_03_next_city.png
?? crew-app/tgdest_04_back_to_first.png
?? crew-app/tgdest_05_hotel_transfer.png
?? crew-app/tgdest_06_trip_details.png
?? docs/assets/screenshots/crew-app/absence-history-Ver1-00-icon.png
?? docs/assets/screenshots/crew-app/absence-history-Ver1-01-list.png
?? docs/assets/screenshots/crew-app/absence-history-Ver1-02-empty.png
?? docs/assets/screenshots/crew-app/ek-absence-Ver1-00-login.png
?? docs/assets/screenshots/crew-app/ek-absence-Ver1-01-form.png
?? docs/assets/screenshots/crew-app/ek-absence-Ver1-02-submitted.png
?? docs/assets/screenshots/crew-app/ek-absence-Ver1-03-history.png
?? docs/assets/screenshots/crew-app/popup-standard-Ver1-01-success.png
?? docs/assets/screenshots/crew-app/s2-msg-alerts-details-Ver2.png
?? docs/assets/screenshots/crew-app/s2-msg-alerts-details-Ver2.png.review.txt
?? docs/assets/screenshots/crew-app/s2-msg-alerts-details-Ver2.png.vision.txt
?? docs/assets/screenshots/crew-app/s2-msg-decision-sent-Ver2.png
?? docs/assets/screenshots/crew-app/s2-msg-decision-sent-Ver2.png.review.txt
?? docs/assets/screenshots/crew-app/s2-msg-decision-sent-Ver2.png.vision.txt
?? docs/assets/screenshots/crew-app/s2-msg-discretion-details-Ver2.png
?? docs/assets/screenshots/crew-app/s2-msg-discretion-history-Ver2.png
?? docs/assets/screenshots/crew-app/s2-msg-home-quick-action-Ver2.png
?? docs/assets/screenshots/crew-app/s2-msg-home-quick-action-Ver2.png.review.txt
?? docs/assets/screenshots/crew-app/s2-msg-home-quick-action-Ver2.png.vision.txt
?? docs/assets/screenshots/crew-recovery/case3-options-cost-breakdown-Ver2.png
?? docs/assets/screenshots/crew-recovery/case3-options-cost-breakdown-over-gh-Ver2.png
?? docs/assets/screenshots/crew-recovery/case3-options-executable-Ver2.png
?? docs/assets/screenshots/gantt/app-dialog-standard-Ver1.png
?? docs/assets/screenshots/gantt/recovery-cost-catalogue-Ver5.png
?? docs/assets/screenshots/gantt/recovery-cost-delay-Ver5.png
?? docs/assets/screenshots/gantt/recovery-cost-guarantee-Ver5.png
?? docs/assets/screenshots/gantt/recovery-cost-membership-Ver5.png
?? docs/assets/screenshots/gantt/recovery-cost-standby-Ver5.png
?? docs/assets/screenshots/gantt/roster-ghost-std-label-Ver1.png
?? docs/assets/screenshots/gantt/roster-puck-width-responsive-Ver1-z18-minimal.png
?? docs/assets/screenshots/gantt/roster-puck-width-responsive-Ver1-z40-airports.png
?? docs/assets/screenshots/gantt/roster-puck-width-responsive-Ver1-z90-full.png
?? docs/assets/screenshots/gantt/top-nav-brand-icon-Ver1.png
?? docs/dev-context/2026-09-13-live-server-s2-discretion-message-details.md
?? docs/superpowers/specs/2026-09-13-app-popup-standard-status-card-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-13-S2-discretion-message-details-evidence-Ver1.md
?? e2e/tests/gantt/app-dialog-standard.spec.ts
?? e2e/tests/gantt/recovery-case-003-costs.spec.ts
?? e2e/tests/gantt/roster-puck-width-responsive.spec.ts
?? e2e/tests/gantt/top-nav-brand-icon.spec.ts
?? gantt/public/help/screenshots/recovery-cost-catalogue-Ver5.png
?? gantt/public/help/screenshots/recovery-cost-delay-Ver5.png
?? gantt/public/help/screenshots/recovery-cost-guarantee-Ver5.png
?? gantt/public/help/screenshots/recovery-cost-membership-Ver5.png
?? gantt/public/help/screenshots/recovery-cost-standby-Ver5.png
?? gantt/public/help/screenshots/s3-options-cost-breakdown-Ver1.png
?? gantt/public/help/screenshots/s3-options-executable-Ver2.png
?? gantt/src/assets/images/logo/altair-crew-app-icon.svg
?? gantt/src/services/__tests__/recovery-cost-batch.test.ts
?? live-server/src/services/recovery/transfer-gh-cost.test.ts
?? live-server/src/services/recovery/transfer-gh-cost.ts
?? sim_01_login.png
```

### unstaged changed files

```text
CLAUDE.md
crew-app/__tests__/features/AbsenceScreen.test.tsx
crew-app/__tests__/features/NotificationsScreen.test.tsx
crew-app/__tests__/features/absenceApi.test.ts
crew-app/__tests__/features/crewCarrierBranding.test.ts
crew-app/__tests__/features/discretionScreen.test.tsx
crew-app/__tests__/features/dutyCalendarMessages.test.ts
crew-app/__tests__/features/guestLogin.test.tsx
crew-app/__tests__/features/loginScreen.test.tsx
crew-app/__tests__/features/notificationsApi.test.ts
crew-app/__tests__/features/preferencesCalendarSync.test.tsx
crew-app/__tests__/features/scheduleFlightCalendar.test.tsx
crew-app/__tests__/features/tripDetailsCalendar.test.tsx
crew-app/__tests__/features/upcomingAlarms.test.tsx
crew-app/src/components/v2/icons.tsx
crew-app/src/features/absence/absenceApi.ts
crew-app/src/features/auth/EkRosterLoginScreen.tsx
crew-app/src/features/auth/LoginScreen.tsx
crew-app/src/features/calendar/dutyCalendarMessages.ts
crew-app/src/features/notifications/NotificationsScreen.tsx
crew-app/src/features/notifications/notificationsApi.ts
crew-app/src/features/notifications/notificationsSlice.ts
crew-app/src/features/settings/ProfileScreen.tsx
crew-app/src/features/travel/MyTripsScreen.tsx
crew-app/src/features/travel/PortalCaptureScreen.tsx
crew-app/src/features/travel/ekRosterApi.ts
crew-app/src/features/tripTrade/MyDutyScreen.tsx
crew-app/src/features/v2/AbsenceScreen.tsx
crew-app/src/features/v2/AlarmsSettingsScreen.tsx
crew-app/src/features/v2/HomeScreen.tsx
crew-app/src/features/v2/PreferencesScreen.tsx
crew-app/src/features/v2/ProfileScreen.tsx
crew-app/src/features/v2/ScheduleScreen.tsx
crew-app/src/features/v2/SpecPage.tsx
crew-app/src/features/v2/TripDetailsScreen.tsx
crew-app/src/features/v2/UpcomingAlarmsScreen.tsx
crew-app/src/features/v2/V2Navigator.tsx
crew-app/src/features/v2/nav.ts
crew-app/src/features/v2/useV2.ts
crew-app/src/version.ts
docs/assets/screenshots/gantt/help-recovery-cases-Ver1.png
docs/assets/screenshots/gantt/help-recovery-recovery-case-003-Ver1.png
docs/dev-context/LATEST.md
docs/superpowers/specs/2026-09-12-S2-discretion-consent-design.md
docs/test-cases/crew-recovery/2026-09-13-case-003-preparation-Ver1.md
e2e/config/case3.config.ts
e2e/tests/gantt/help/help-recovery.spec.ts
gantt/src/components/gantt/renderers/flight-renderer.ts
gantt/src/components/gantt/renderers/roster-renderer.ts
gantt/src/components/help/topics/recovery/recovery-case-003.tsx
gantt/src/components/scenario-gantt/cross-rank-confirm-dialog.tsx
gantt/src/components/shell/shell-top-nav.tsx
gantt/src/services/__tests__/recovery-swap-gh.test.ts
gantt/src/services/recovery-api.ts
gantt/src/services/recovery-candidates.ts
gantt/src/version.ts
live-server/src/__tests__/unit/crew-absence-history-route.test.ts
live-server/src/__tests__/unit/crew-notify-route.test.ts
live-server/src/plugins/auth.ts
live-server/src/routes/crew-notify/crew-notify.ts
live-server/src/routes/recovery/recovery-cost.ts
live-server/src/services/crew-notify/__tests__/discretion-consent-service.test.ts
live-server/src/services/crew-notify/discretion-consent-service.ts
packages/ui/src/composites/app-dialog.tsx
packages/ui/src/styles/globals.css
pbs-portal/src/app/layout/dashboard-top-nav.tsx
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/bid/components/bid-review-panel.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx
pbs-portal/src/features/days-off/components/prefer-off-calendar-picker.tsx
pbs-portal/src/features/pairing/components/airport-preference-editor.tsx
pbs-portal/src/features/pairing/components/pairing-bid-airport-select.tsx
pbs-portal/src/features/pairing/components/pairing-bid-tag-list-control.tsx
pbs-portal/src/features/pairing/components/pairing-preference-filter-dialog.tsx
pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/standing-bid/pages/standing-bid-page.test.tsx
pbs-portal/src/features/tier/components/tier-detail-dialog.tsx
pbs-portal/src/shared/components/ui/pbs-dialog-frame.test.tsx
pbs-portal/src/shared/components/ui/pbs-dialog-frame.tsx
pbs-portal/src/shared/components/ui/portal-date-picker.tsx
scripts/check-ui-standard.mjs
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-13-gantt-case3-8004-transfer-cost-pricing.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```

---

## 追加：2026-09-13 晚 — 8004 全清 + 车队硬过滤（Ryan feedback）

衔接上文同一 topic（Case 3 / pairing 152227 / L3001–L3010 vs J40xx）。

### 1) 补上并验证最后一个缺口：8004 可被"合格替换"彻底清除（DONE）

* 新增 `e2e/tests/gantt/recovery-case-003-clear.spec.ts`（`case3.config.ts` testMatch 增加 `-clear`）。
* 真实 Live UI 连续 4 次 Roster transfer + Apply + Save：`L3001→J4003`、`L3002→J4005`（CA）、
  `L3006→J4024`、`L3007→J4025`（FO），Alert Center 8004 行数 **4 → 3 → 2 → 1 → 0**，
  配对 152227 最终为 4 名 7M8 crew。**PASS 1 passed（2.7m / 复跑 40.5s）**。
* 关键更正：`J4001–J4018`(CA) 与 `J4023–J4040`(FO) 在 2026-09-19 是**空闲**的，只有
  `J4020–J4022` 当天有 duty（早先"J40xx busy"的判断是错的）。
* 证据：`docs/assets/screenshots/crew-recovery/case3-clear-{baseline-alert-center,option-7m8-Ver2,
  final-alert-center,final-roster}-*.png`（已目视/视觉模型检查）。
* 跑完用 `.local/case3/reset-152227.cjs` 复位（tsx 执行），baseline 4×8004 完整。

### 2) Ryan feedback：8004 车队必须匹配 → 不合格 crew 直接不列出（DONE）

* `gantt/src/services/recovery-candidates.ts`：新增 `fleetHardBlocked(crew)`，仅对
  `trigger === 'roster-qualification'`（Rule 8004）生效；Roster transfer / swap 与 Standby
  候选若不具备 `requiredFleets` 资质则**整个剔除**（此前是软约束＋橙色警告）。其它 trigger
  保持软约束。`fleetMismatchWarning` 仍供软场景使用。
* **补漏（第一遍漏了 swap 的返程方向）**：swap 是双向的——放出配对的一侧会把候选人的配对接过来。
  8004 场景下那仍是一条 7M8 配对，788 的源机组把告警原样搬过去（行内仍显示
  `Fleet mismatch (8004) … on 2026-09-20`）。现在只要
  `trigger === 'roster-qualification'` 且源机组对候选配对的机队不合格，swap 也一并剔除——
  机队类 swap 必须**双向**都合格。Case 3 结果：Roster 计划只剩 transfer（18 条），所有 swap 行消失。
* 单测：`recovery-candidates.test.ts` 两条软约束用例改为硬过滤断言；
  另加一条 swap 双向用例；`npx vitest run recovery-candidates.test.ts recovery-swap-gh.test.ts` → **30 passed**。
* 真机读数：transfer 候选 **36 → 18**（788 的 L3003/4/5 与 T20xx 消失），
  **non-transfer（swap）报价为 `[]`**，报价区间 US$410.00 … US$1,547.50，最便宜仍排最前。
* Help 同步：`recovery-case-003.tsx` 改为"fleet matching is mandatory / 不合格不列出"，
  新截图 `gantt/public/help/screenshots/s3-options-executable-Ver3.png`，`help-data.ts` overview 更正，
  `help-recovery.spec.ts` 断言更新；Help 全量 **75 passed**。`FRONTEND_VERSION` → **455**
  （454 已被并发的 Case-2 Help 改动占用，保留其内容，我在此基础上 +1）。

### 3) Ryan feedback：设计更有层次的成本（OPEN，待业务决定）

见 `docs/test-cases/crew-recovery/2026-09-13-case-003-preparation-Ver1.md` §10.2：报价 =
US$410 固定组件 + 接收机组增量 GH 工资；GH 门槛 85h（cost_type 1002 / instance 1 / guarantee）。
当前最便宜 8 行都是 US$410（这些 crew 月 credit 远低于 77:25 的交叉点），要让他们"过 GH"需
大量加飞行（或改 GH 参数/减少低价候选）。已给出 A/B/C 三个方案与推荐（A）。

### 并发注意

同一 worktree 有另一 agent 在改 Case-2 Help（`recovery-case-002.tsx`、`help-data.ts`、
`version.ts`）。`docs/dev-context/LATEST.md` 现由该 agent 的 `save-context.sh` 写入（topic
recovery-help-case-002-et）。**不要**用 `git checkout`/整体回退这些文件。我的 Case-3 改动全部
在上述具体文件里，未被覆盖（version 号已在其基础上叠加）。
