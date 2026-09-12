# 开发上下文（2026-09-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-11 21:42:06 PDT
- Wing：`gantt`
- Topic：`best-fit-crew-implemented`
- Title：Best-fit crew for open pairings — Live slice implemented
- Git branch：`feat/gantt/roundtrip-pairing-builder`

## 本轮对话上下文

Implemented the Ver2 best-fit design end to end for the Live Gantt (docs/superpowers/specs/2026-09-11-best-fit-crew-batch-design-Ver2.md §Implemented).

Backend (live-server): src/services/assignment/preview-roster-items.ts is now the ONE definition of "crew C takes pairing P" (auto-assign-service.expandAccepted delegates to it); src/services/best-fit/best-fit-service.ts holds Stage 1 eligibility via the shared validateAssignment, per-candidate isolated Rust preview with a before/after delta, cost evaluation, and the joint combined preview; src/routes/best-fit/best-fit.ts registers POST /api/best-fit/pairing and /combined-preview (read-only planner, same brain/hands split as /api/roster/auto-assign/plan).

Frontend (gantt): services/best-fit-api.ts, stores/best-fit-store.ts, components/best-fit/best-fit-dialog.tsx (one screen worklist + per-slot ranking + detail + combined bar), utils/best-fit-candidates.ts, entry points in pane-condition-strip (best-fit-button icon in the Live pairing pane cluster) and roster/context-menu (Find best-fit crew...), mounted once in app-shell.

Key correctness decisions to keep: (1) baseline and after must BOTH use the pairing-scoped overlay with focusPairingIds; a window overlay drops duties at slice edges and invents new findings. (2) delta identity is rule+instance+scope+pairing+duty+flight+window; identical = existing (visible, never blocking). (3) engine failure = unknown, never pass, not shortlistable. (4) combined preview must diff against the same baseline or pre-existing crew findings block the shortlist. (5) cost: only the guarantee member is priced (credit hours); hotel/per-diem/DHD/callout/booking/bands/standby are not-applicable with a reason. A first cut fed credit hours into every member and billed USD 57,645 for one pairing — do not repeat that. (6) missing manday data is NOT zero: statsAvailable=false ranks after known crew, otherwise an unknown crew looks free-est.

Deviations from the design text (deliberate, recorded in the doc): Live-only v1 (Scenario needs scenario-context preview + display-id mapping), per-pairing endpoints + a 5-pairing client batch instead of a job queue, cost limited to guarantee.

Evidence: live-server/tests/unit/best-fit-service.test.ts 19 passed; gantt/src/utils/__tests__/best-fit-candidates.test.ts 7 passed; e2e/tests/gantt/best-fit-crew-open-pairings.spec.ts passed 23.8s against the real Live Gantt + Rust engine (GANTT_BASE_URL=http://127.0.0.1:5273, --project=gantt --no-deps); npm run check:ui PASS 0 hard violations; git diff --check PASS. Screenshot docs/assets/screenshots/gantt/best-fit-crew-live-Ver2.png (real pairing V4152 with real rule codes).

Environment notes: the gantt dev server is NOT on 5566 (that port serves another project). Run it on a free port, e.g. cd gantt && npx vite --port 5273 --host 127.0.0.1 (foreground session; it dies if backgrounded from a short-lived shell) with VITE_LIVE_TARGET=http://127.0.0.1:3000. Login through the real form (testids login-user-code/login-password/login-sign-in); seeding sessionStorage directly did not authenticate.

Known pre-existing failures unrelated to this work: live-server/tests/unit/legality-recheck-core-param.spec.ts has 10 failures (Rust binary staleness vs rule-engine-rs/src); pairing-canvas right-click is unreliable in demo data so Entry 1 is unit-covered rather than E2E-driven. Data finding: only 343 crew have 2026 manday rows out of ~9,178 loaded, so both ranking bases degenerate on the demo DB until manday coverage improves. No commit/push.

## 当前工作树快照

### git status --short

```text
 M crew-app/.maestro/v2_tg_login.yaml
 M crew-app/__tests__/features/NotificationsScreen.test.tsx
 M crew-app/__tests__/features/dutyDisplay.test.ts
 M crew-app/__tests__/features/scheduleRosterViews.test.tsx
 M crew-app/src/components/v2/BrandLogo.tsx
 M crew-app/src/components/v2/icons.tsx
 M crew-app/src/components/v2/rows.tsx
 M crew-app/src/features/auth/LoginScreen.tsx
 M crew-app/src/features/notifications/NotificationsScreen.tsx
 M crew-app/src/features/notifications/notificationsApi.ts
 M crew-app/src/features/roster/dutyDisplay.ts
 M crew-app/src/features/v2/HomeScreen.tsx
 M crew-app/src/features/v2/ScheduleScreen.tsx
 M crew-app/src/features/v2/SpecPage.tsx
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
?? crew-app/.maestro/et_j4002_absence.yaml
?? crew-app/.maestro/et_j4002_alerts.yaml
?? crew-app/__tests__/features/AbsenceScreen.test.tsx
?? crew-app/__tests__/features/absenceApi.test.ts
?? crew-app/__tests__/features/brandLogo.test.tsx
?? crew-app/__tests__/features/loginScreen.test.tsx
?? crew-app/__tests__/features/rosterChange.test.ts
?? crew-app/alerts-01-home-rest.png
?? crew-app/alerts-02-roster-change.png
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
?? crew-app/src/features/v2/AbsenceScreen.tsx
?? crew-app/tgdest_00_home.png
?? crew-app/tgdest_01_home_destination_strip.png
?? crew-app/tgdest_02_city.png
?? crew-app/tgdest_03_next_city.png
?? crew-app/tgdest_04_back_to_first.png
?? crew-app/tgdest_05_hotel_transfer.png
?? crew-app/tgdest_06_trip_details.png
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
?? docs/dev-context/2026-09-11-gantt-best-fit-batch-design-ver2.md
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
crew-app/.maestro/v2_tg_login.yaml
crew-app/__tests__/features/NotificationsScreen.test.tsx
crew-app/__tests__/features/dutyDisplay.test.ts
crew-app/__tests__/features/scheduleRosterViews.test.tsx
crew-app/src/components/v2/BrandLogo.tsx
crew-app/src/components/v2/icons.tsx
crew-app/src/components/v2/rows.tsx
crew-app/src/features/auth/LoginScreen.tsx
crew-app/src/features/notifications/NotificationsScreen.tsx
crew-app/src/features/notifications/notificationsApi.ts
crew-app/src/features/roster/dutyDisplay.ts
crew-app/src/features/v2/HomeScreen.tsx
crew-app/src/features/v2/ScheduleScreen.tsx
crew-app/src/features/v2/SpecPage.tsx
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
2. 本文件：`docs/dev-context/2026-09-11-gantt-best-fit-crew-implemented.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
