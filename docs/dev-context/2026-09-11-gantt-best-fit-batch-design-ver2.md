# 开发上下文（2026-09-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-11 21:05:51 PDT
- Wing：`gantt`
- Topic：`best-fit-batch-design-ver2`
- Title：Best-fit multi-pairing design and prototype
- Git branch：`feat/gantt/roundtrip-pairing-builder`

## 本轮对话上下文

Design-only work. Current spec docs/superpowers/specs/2026-09-11-best-fit-crew-batch-design-Ver2.md supersedes single-pairing Ver1. User requested multiple open pairings at once and concrete Rust simulation design. One AppDialog-shaped prototype docs/superpowers/specs/2026-09-11-best-fit-crew-mockups/batch-Ver2.html supports toolbar multi-select and right-click one, per-slot rankings, shared recommendations, shortlist and combined preview. Preserve old options as historical.
Verified source: previewDraftLegality creates temporary roster/source, invokes computeViolations (Rust check binaries), rolls back; returns all after findings, not delta. Empty afterItems shortcut is not a baseline. Alternative assignments require isolated previews with common before/after snapshot, explicit rule/focus/RP scopes and new/worsened findings. Combining alternatives contaminates cumulative/co-crew checks. Only explicit shortlist combinations receive a joint preview. Cost library guarantee/standby use payable credit hours, not MBH. Joint cost must recompute per crew; do not sum independent marginal costs. Production APIs not implemented.
Delegate batch_mockup produced HTML and Playwright test; primary reviewed code and requested fixes including retry preserving choices, disabled unknown/hard, combined payroll and simultaneous left-list winners. Test command node docs/superpowers/specs/2026-09-11-best-fit-crew-mockups/batch-Ver2.verify.cjs PASS; exact combined fixture cost CAD1697 asserted. Primary inspected screenshots best-fit-batch-Ver4.png and best-fit-batch-mobile-candidates-Ver4.png under docs/assets/screenshots/gantt. npm run check:ui PASS 0 hard/124 existing warnings. git diff --check PASS. Prototype uses illustrative payroll and overlap-only combined legality fixture, not real Rust. No public deployment validation or roster writes. No commit/push. Preserve unrelated dirty worktree.

## 当前工作树快照

### git status --short

```text
 M crew-app/.maestro/v2_tg_login.yaml
 M crew-app/__tests__/features/dutyDisplay.test.ts
 M crew-app/__tests__/features/scheduleRosterViews.test.tsx
 M crew-app/src/components/v2/BrandLogo.tsx
 M crew-app/src/components/v2/icons.tsx
 M crew-app/src/components/v2/rows.tsx
 M crew-app/src/features/auth/LoginScreen.tsx
 M crew-app/src/features/roster/dutyDisplay.ts
 M crew-app/src/features/v2/ScheduleScreen.tsx
 M crew-app/src/features/v2/SpecPage.tsx
 M docs/modules/gantt/live-scenario-gantt-playbook.md
 M docs/superpowers/completed/crew-app-v2-mock.html
 M gantt/src/components/data/crew-master-view.tsx
 M gantt/src/components/panes/pane-condition-strip.tsx
 M gantt/src/components/panes/roster-pane.tsx
 M gantt/src/components/panes/shared/roster-pane.tsx
 M gantt/src/components/shell/app-shell.tsx
 M gantt/src/config/data-entity-registry.ts
 M gantt/src/stores/ui-store.ts
 M gantt/src/types/data-maintenance.ts
 M live-server/src/index.ts
 M live-server/src/plugins/auth.ts
 M live-server/src/routes/crew-notify/crew-notify.ts
 M live-server/src/routes/data/index.ts
?? crew-app/__tests__/features/AbsenceScreen.test.tsx
?? crew-app/__tests__/features/absenceApi.test.ts
?? crew-app/__tests__/features/brandLogo.test.tsx
?? crew-app/__tests__/features/loginScreen.test.tsx
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
?? crew-app/scripts/genAppIcons.mjs
?? crew-app/src/features/absence/
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
?? docs/superpowers/specs/2026-09-11-best-fit-crew-batch-design-Ver2.md
?? docs/superpowers/specs/2026-09-11-best-fit-crew-mockups/
?? docs/superpowers/specs/2026-09-11-best-fit-crew-open-pairing-design.md
?? docs/superpowers/specs/2026-09-11-crew-recovery-story-101-sick-leave-stand-down.md
?? docs/test-cases/gantt/live-sync-cr-rois-one-signoff-gate.md
?? e2e/tests/gantt/crew-absence-records.spec.ts
?? e2e/tests/gantt/crew-absence-stand-down.spec.ts
?? gantt/src/components/roster/crew-absence-dialog.tsx
?? gantt/src/services/__tests__/gantt-sync-manager-fallback.test.ts
?? gantt/src/services/crew-absence-api.ts
?? live-server/src/routes/absence/
?? live-server/src/services/absence/
?? sim_01_login.png
?? sql/migration/2026-09-11-crew-absence.sql
```

### unstaged changed files

```text
crew-app/.maestro/v2_tg_login.yaml
crew-app/__tests__/features/dutyDisplay.test.ts
crew-app/__tests__/features/scheduleRosterViews.test.tsx
crew-app/src/components/v2/BrandLogo.tsx
crew-app/src/components/v2/icons.tsx
crew-app/src/components/v2/rows.tsx
crew-app/src/features/auth/LoginScreen.tsx
crew-app/src/features/roster/dutyDisplay.ts
crew-app/src/features/v2/ScheduleScreen.tsx
crew-app/src/features/v2/SpecPage.tsx
docs/modules/gantt/live-scenario-gantt-playbook.md
docs/superpowers/completed/crew-app-v2-mock.html
gantt/src/components/data/crew-master-view.tsx
gantt/src/components/panes/pane-condition-strip.tsx
gantt/src/components/panes/roster-pane.tsx
gantt/src/components/panes/shared/roster-pane.tsx
gantt/src/components/shell/app-shell.tsx
gantt/src/config/data-entity-registry.ts
gantt/src/stores/ui-store.ts
gantt/src/types/data-maintenance.ts
live-server/src/index.ts
live-server/src/plugins/auth.ts
live-server/src/routes/crew-notify/crew-notify.ts
live-server/src/routes/data/index.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-11-gantt-best-fit-batch-design-ver2.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
