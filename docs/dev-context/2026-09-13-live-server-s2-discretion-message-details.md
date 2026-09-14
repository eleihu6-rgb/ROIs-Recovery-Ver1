# 开发上下文（2026-09-13）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-13 15:46:35 PDT
- Wing：`live-server`
- Topic：`s2-discretion-message-details`
- Title：S2 discretion crew message detail + Home quick action
- Git branch：`main`

## 本轮对话上下文

Ryan's 2026-09-13 review of the crew-app discretion card (3 points) is implemented and validated: (1) FDP is duty-level, so the consent message now carries a full duty snapshot; (2) the card shows a real FDP before→after difference and duty context (check-in, per-leg delayed times) instead of two identical timestamps; (3) Yes is the left pill; plus a Home ▸ Quick actions ▸ Discretion entry (pending + history) mirroring the Absence history page.

Contract (live-server): `ConsentDutyDetail` {pairingLabel, dutySeq, reportUtc, releaseUtc, fdpBeforeMin, fdpAfterMin, legs[{fltNum,depArp,arvArp,schDep/ArvUtc,revisedDep/ArvUtc,delayMin,operated}]} built by `buildDutyDetail` from the same pairing_segment+flight rows the sourceHash hashes, stored immutably under `crew_notification.payload.duty` by `createConsent`, returned by `/discretion/{id}`, `/notifications` openDiscretions and the new crew-owned `POST /crew-app/v1/discretions` (pending + terminal, recipient-scoped). Rows written before the field have no `duty`; the card falls back to the flat schDep/estDep snapshot.

crew-app: DiscretionCard.tsx (new; duty window grid, FLIGHTS rows with DELAYED +Nm and revised clock, FDP current→proposed +Δ, recalculation note, Yes left / No right; showActions=false renders terminal history), DiscretionScreen.tsx (new; ACTION REQUIRED + HISTORY via useFocusEffect), HomeScreen Discretion QA, nav/V2Navigator route, notificationsApi duty zod schema + fetchDiscretionHistory, notificationsSlice discretionHistory/loadDiscretionHistory. NotificationsScreen now reuses the same card.

Verification (2026-09-13): live-server vitest crew-notify 33 PASS; gantt discretion-consent-panel 2 PASS; crew-app jest discretionScreen+HomeDiscretionQuickAction+notificationsApi+notificationsSlice 22 PASS; crew-app tsc PASS; git diff --check PASS. Real path: `.local/s2-msg/prepare-and-create.ts` calls the real prepareConsent/createConsent for pairing 152548 duty 1 (PI201/PI202, crew S21001/14/15) after a fixture +2h delay on PI202 (est 13:00Z→17:00Z, duty_act_fdp_min 780) → FDP 660(11h00)→780(13h00), 3 recipients each with duty + 2 legs. Maestro on iPhone Air simulator: `.local/s2-msg/f8-discretion-details.yaml` (read-only, 5 assertions on duty detail + FDP pair) PASS and `f8-discretion-decide.yaml` (Alerts card + Yes → Decision sent → HISTORY Agreed) PASS; 5 screenshots docs/assets/screenshots/crew-app/s2-msg-*.png inspected with scripts/screenshot-review --vision. Evidence doc: docs/test-cases/crew-recovery/2026-09-13-S2-discretion-message-details-evidence-Ver1.md. Design addendum appended to docs/superpowers/specs/2026-09-12-S2-discretion-consent-design.md.

Do not re-litigate: the card must show duty-level context and the Yes-left layout; the duty snapshot is immutable per request (a later duty change supersedes it — seq 24-26 prove supersession keeps replies); the delayed estimate here is SIT fixture data, not a legality result. Unchanged: live-server tsc pre-existing errors (legality-preview.ts:288 + transfer-gh-cost.test.ts), EK/EVACC gateway has no `duty` (flat fallback), controller panel untouched. Final fixture armed: proposal b0b8796f-17bc-4d5e-9d82-0a85f7db986c Pending for S21001/S21014/S21015; revert the delay with `.local/s2-msg/restore-consent-duty.cjs` (will supersede pending requests by design). No commit/push.

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
 M docs/superpowers/specs/2026-09-12-S2-discretion-consent-design.md
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
?? docs/assets/screenshots/gantt/roster-ghost-std-label-Ver1.png
?? docs/assets/screenshots/gantt/roster-puck-width-responsive-Ver1-z18-minimal.png
?? docs/assets/screenshots/gantt/roster-puck-width-responsive-Ver1-z40-airports.png
?? docs/assets/screenshots/gantt/roster-puck-width-responsive-Ver1-z90-full.png
?? docs/assets/screenshots/gantt/top-nav-brand-icon-Ver1.png
?? docs/superpowers/specs/2026-09-13-app-popup-standard-status-card-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-13-S2-discretion-message-details-evidence-Ver1.md
?? e2e/tests/gantt/app-dialog-standard.spec.ts
?? e2e/tests/gantt/recovery-case-003-costs.spec.ts
?? e2e/tests/gantt/roster-puck-width-responsive.spec.ts
?? e2e/tests/gantt/top-nav-brand-icon.spec.ts
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
docs/superpowers/specs/2026-09-12-S2-discretion-consent-design.md
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
2. 本文件：`docs/dev-context/2026-09-13-live-server-s2-discretion-message-details.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh live-server
git status --short
```
