# 开发上下文（2026-09-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-11 21:59:23 PDT
- Wing：`gantt`
- Topic：`best-fit-apply-shortlist`
- Title：Best-fit: shortlist → assign draft hand-off
- Git branch：`feat/gantt/roundtrip-pairing-builder`

## 本轮对话上下文

Follow-up to 2026-09-11-gantt-best-fit-crew-implemented. Answering "after check combined solution, how to assign? any automation?".

Added the hands: gantt/src/utils/best-fit-apply.ts applyBestFitShortlist() replays the shortlist through assignPairingDraft (same path as drag-drop: optimistic draft op + precheck + live legality + rollback + crew lock + bringPairingIdToTop), and the store's applyShortlist() re-runs the combined preview FIRST and aborts with no writes if the fresh verdict is not ok. Dialog footer now has "Assign N to draft"; a completed applied check reports "queued in the draft ... press Save". No auto-save and no background assignment by design.

Store additions: applying / applySteps / applyResult. Dialog testids: best-fit-assign (new), best-fit-check-combined (unchanged), draft undo/save are draft-undo-btn / draft-save-btn.

Keep: modal dialog blocks the toolbar, so close the dialog before clicking draft-undo-btn (E2E hit this). E2E now covers the assign step and undoes it to leave a clean draft.

Evidence: live-server best-fit + auto-assign unit tests 25 passed; gantt best-fit-candidates 10 passed (3 new apply-path tests incl. refusal by fresh check and a partial refusal); e2e/tests/gantt/best-fit-crew-open-pairings.spec.ts passed 28.3s incl. assign + undo; npm run check:ui PASS; git diff --check PASS. Screenshot /tmp/bf_apply.png from the manual run (draft queued state).

## 当前工作树快照

### git status --short

```text
 M ai-server/main.py
 M crew-app/.maestro/v2_tg_login.yaml
 M crew-app/__tests__/features/NotificationsScreen.test.tsx
 M crew-app/__tests__/features/dutyDisplay.test.ts
 M crew-app/__tests__/features/scheduleRosterViews.test.tsx
 M crew-app/__tests__/themeCoverage.test.ts
 M crew-app/src/components/v2/BrandLogo.tsx
 M crew-app/src/components/v2/PillDock.tsx
 M crew-app/src/components/v2/icons.tsx
 M crew-app/src/components/v2/rows.tsx
 M crew-app/src/features/auth/LoginScreen.tsx
 M crew-app/src/features/notifications/NotificationsScreen.tsx
 M crew-app/src/features/notifications/notificationsApi.ts
 M crew-app/src/features/roster/dutyDisplay.ts
 M crew-app/src/features/v2/HomeScreen.tsx
 M crew-app/src/features/v2/ScheduleScreen.tsx
 M crew-app/src/features/v2/SpecPage.tsx
 M crew-app/src/features/v2/V2Navigator.tsx
 M crew-app/src/features/v2/nav.ts
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
 M live-server/src/index.ts
 M live-server/src/plugins/auth.ts
 M live-server/src/routes/crew-notify/crew-notify.ts
 M live-server/src/routes/data/index.ts
 M live-server/src/services/crew-notify/__tests__/crew-notify-service.test.ts
 M live-server/src/services/crew-notify/crew-notify-service.ts
 M live-server/src/services/roster/auto-assign-service.ts
?? ai-server/src/chat/crew_routes.py
?? ai-server/src/chat/crew_tools.py
?? ai-server/tests/test_crew_chat_routes.py
?? ai-server/tests/test_crew_chat_tools.py
?? crew-app/.maestro/et_j4002_absence.yaml
?? crew-app/.maestro/et_j4002_alerts.yaml
?? crew-app/.maestro/v2_tg_rbot.yaml
?? crew-app/__tests__/features/AbsenceScreen.test.tsx
?? crew-app/__tests__/features/absenceApi.test.ts
?? crew-app/__tests__/features/brandLogo.test.tsx
?? crew-app/__tests__/features/loginScreen.test.tsx
?? crew-app/__tests__/features/rbotChatApi.test.ts
?? crew-app/__tests__/features/rbotDispatch.test.ts
?? crew-app/__tests__/features/rbotScreen.test.tsx
?? crew-app/__tests__/features/rosterChange.test.ts
?? crew-app/absence-02-from-plus-one.png
?? crew-app/absence-03-range-two-days.png
?? crew-app/android/app/src/main/res/mipmap-hdpi/
?? crew-app/android/app/src/main/res/mipmap-mdpi/
?? crew-app/android/app/src/main/res/mipmap-xhdpi/
?? crew-app/android/app/src/main/res/mipmap-xxhdpi/
?? crew-app/android/app/src/main/res/mipmap-xxxhdpi/
?? crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/AppIcon-1024.png
?? crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/AppIcon-20@2x.png
?? crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/AppIcon-20@3x.png
?? crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/AppIcon-29@2x.png
?? crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/AppIcon-29@3x.png
?? crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/AppIcon-40@2x.png
?? crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/AppIcon-40@3x.png
?? crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/AppIcon-60@2x.png
?? crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/AppIcon-60@3x.png
?? crew-app/maestro_et_home.png
?? crew-app/scripts/genAppIcons.mjs
?? crew-app/src/features/absence/
?? crew-app/src/features/notifications/rosterChange.ts
?? crew-app/src/features/rbot/
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
?? docs/design/altair-crew-app-icon.svg
?? docs/design/altair-crew-app-mark.svg
?? docs/dev-context/2026-09-11-crew-app-alerts-before-after-and-home-polish.md
?? docs/dev-context/2026-09-11-gantt-best-fit-batch-design-ver2.md
?? docs/dev-context/2026-09-11-gantt-best-fit-crew-implemented.md
?? docs/superpowers/specs/2026-09-11-best-fit-crew-batch-design-Ver2.md
?? docs/superpowers/specs/2026-09-11-best-fit-crew-mockups/
?? docs/superpowers/specs/2026-09-11-best-fit-crew-open-pairing-design.md
?? docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md
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
ai-server/main.py
crew-app/.maestro/v2_tg_login.yaml
crew-app/__tests__/features/NotificationsScreen.test.tsx
crew-app/__tests__/features/dutyDisplay.test.ts
crew-app/__tests__/features/scheduleRosterViews.test.tsx
crew-app/__tests__/themeCoverage.test.ts
crew-app/src/components/v2/BrandLogo.tsx
crew-app/src/components/v2/PillDock.tsx
crew-app/src/components/v2/icons.tsx
crew-app/src/components/v2/rows.tsx
crew-app/src/features/auth/LoginScreen.tsx
crew-app/src/features/notifications/NotificationsScreen.tsx
crew-app/src/features/notifications/notificationsApi.ts
crew-app/src/features/roster/dutyDisplay.ts
crew-app/src/features/v2/HomeScreen.tsx
crew-app/src/features/v2/ScheduleScreen.tsx
crew-app/src/features/v2/SpecPage.tsx
crew-app/src/features/v2/V2Navigator.tsx
crew-app/src/features/v2/nav.ts
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
live-server/src/index.ts
live-server/src/plugins/auth.ts
live-server/src/routes/crew-notify/crew-notify.ts
live-server/src/routes/data/index.ts
live-server/src/services/crew-notify/__tests__/crew-notify-service.test.ts
live-server/src/services/crew-notify/crew-notify-service.ts
live-server/src/services/roster/auto-assign-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-11-gantt-best-fit-apply-shortlist.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
