# 开发上下文（2026-09-12）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-12 13:13:44 PDT
- Wing：`gantt`
- Topic：`recovery-s1-options-ready`
- Title：recovery-s1-options-ready
- Git branch：`main`

## 本轮对话上下文

Prepared Ryan's new J4002 1001 SL fixture, not prior mobile absence. Preserve SL1354958 and source1354952-57. Added ASBY J4011 row1355089 Sep24 02-10 UTC and donor J4005 pairing152097 rows1355090-91 using existing APIs. UI independently selected and previewed both methods; no Apply/Save. Retain setup for demo, draft0; SQL exact original rows preserved. Read-only script e2e/scripts/recovery-s1-options-readonly.cjs PASS; six screenshots visually inspected. Memo docs/test-cases/crew-recovery/2026-09-12-S1-1001-options-setup-Ver1.md. Unresolved zero delay/swap pricing, mixed currency tree, source qualification/base/rank metadata warnings; do not claim operational legality or best scoring. Old reset script INVALID for current baseline. Private manifest .local/s1-options. No commit/push.

## 当前工作树快照

### git status --short

```text
 M docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md
 D e2e/node_modules
 M e2e/tests/gantt/auto-assign-7305-max-consec-j4006.spec.ts
 M e2e/tests/gantt/auto-assign-even-distribution-j4002.spec.ts
 M e2e/tests/gantt/auto-assign-even-distribution-j4007.spec.ts
 M e2e/tests/gantt/auto-assign-open-pairings-j4001.spec.ts
 M e2e/tests/gantt/rbot-auto-assign-crew.spec.ts
 D gantt/node_modules
 M gantt/src/components/dev/dev-skills-data.generated.ts
 M gantt/src/components/roster/auto-assign-dialog.tsx
 M gantt/src/services/auto-assign-api.ts
 M gantt/src/stores/roster-store.ts
 M gantt/src/utils/auto-assign-driver.ts
 D live-server/node_modules
 M live-server/src/services/roster/auto-assign-service.ts
 M live-server/tests/unit/auto-assign-service.test.ts
 D node_modules
 D packages/ui/node_modules
 D rule-engine-rs/target
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
?? crew-app/tgdest_00_home.png
?? crew-app/tgdest_01_home_destination_strip.png
?? crew-app/tgdest_02_city.png
?? crew-app/tgdest_03_next_city.png
?? crew-app/tgdest_04_back_to_first.png
?? crew-app/tgdest_05_hotel_transfer.png
?? crew-app/tgdest_06_trip_details.png
?? docs/ai/2026-09-12-0606-iphone-crew-app-login-build-provenance-audit-Ver1.md
?? docs/ai/2026-09-12-0608-project-startup-validation-Ver1.md
?? docs/assets/screenshots/crew-app/iphone-air-login-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-01-crew-home-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-01-crew-home-Ver3.png
?? docs/assets/screenshots/crew-recovery/s1-02-absence-dates-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-02-absence-dates-Ver3.png
?? docs/assets/screenshots/crew-recovery/s1-03-submit-ready-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-03-submit-ready-Ver3.png
?? docs/assets/screenshots/crew-recovery/s1-03-submit-ready-Ver4.png
?? docs/assets/screenshots/crew-recovery/s1-04-add-filter-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-05-baseline-roster-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-05-baseline-roster-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-05-no-absence-before-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-06-mobile-error-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-07-absence-record-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-08-stand-down-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-08-stand-down-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-08-stand-down-Ver3.png
?? docs/assets/screenshots/crew-recovery/s1-08-stand-down-Ver4.png
?? docs/assets/screenshots/crew-recovery/s1-09-option1-roster-menu-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-10-option2-pairing-menu-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-10-option2-pairing-menu-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-11-option2-alert-center-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-12-option3-ill-menu-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-13-crew-alerts-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-help-narrow-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-help-narrow-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-help-published-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-help-published-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-option1-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-option1-selectable-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-option2-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-option2-selectable-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-options-before-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-options-ready-baseline-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-standby-verified-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-standby-verified-selectable-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-duty-verified-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-duty-verified-selectable-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-absence-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-absence-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-verified-stand-down-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-stand-down-absence-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-analyse-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-applied-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-configure-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-analyse-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-applied-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-configure-Ver1.png
?? docs/assets/screenshots/gantt/cr-public-login-20260912-Ver1.png
?? docs/assets/screenshots/gantt/res-pairing-dxb-sep2026-Ver1.png
?? docs/assets/screenshots/gantt/startup-gantt-20260912-Ver2.png
?? docs/assets/screenshots/gantt/startup-gantt-20260912-Ver3.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver1.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver2.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver3.png
?? docs/dev-context/2026-09-12-gantt-crew-recovery-case-001.md
?? docs/superpowers/specs/2026-09-12-auto-assign-duties-design.md
?? docs/superpowers/specs/2026-09-12-auto-assign-duties-mock.html
?? docs/test-cases/crew-recovery/2026-09-12-S1-1001-options-setup-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-S1-case-001-execution-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-S1-crew-unavailable-preparation-Ver1.md
?? e2e/config/recovery-case-study.config.ts
?? e2e/scripts/recovery-s1-options-readonly.cjs
?? e2e/tests/gantt/auto-assign-duties.spec.ts
?? e2e/tests/gantt/recovery-case-001.spec.ts
?? e2e/tests/gantt/res-pairing-dxb-sep2026-seed.spec.ts
?? e2e/tests/gantt/res-pairing-dxb-sep2026-verify.spec.ts
?? gantt/public/help/screenshots/s1-absence-dates-Ver1.jpg
?? gantt/public/help/screenshots/s1-absence-record-Ver1.png
?? gantt/public/help/screenshots/s1-add-filter-Ver1.png
?? gantt/public/help/screenshots/s1-crew-alerts-Ver1.jpg
?? gantt/public/help/screenshots/s1-mobile-error-Ver1.jpg
?? gantt/public/help/screenshots/s1-option1-Ver1.png
?? gantt/public/help/screenshots/s1-option2-Ver1.png
?? gantt/public/help/screenshots/s1-option3-Ver1.png
?? gantt/public/help/screenshots/s1-stand-down-Ver1.png
?? gantt/src/components/help/topics/recovery/recovery-case-001.tsx
?? gantt/src/services/__tests__/gantt-sync-manager-fallback.test.ts
?? packages/legality-messages/pnpm-lock.yaml
?? sim_01_login.png
```

### unstaged changed files

```text
docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md
e2e/node_modules
e2e/tests/gantt/auto-assign-7305-max-consec-j4006.spec.ts
e2e/tests/gantt/auto-assign-even-distribution-j4002.spec.ts
e2e/tests/gantt/auto-assign-even-distribution-j4007.spec.ts
e2e/tests/gantt/auto-assign-open-pairings-j4001.spec.ts
e2e/tests/gantt/rbot-auto-assign-crew.spec.ts
gantt/node_modules
gantt/src/components/dev/dev-skills-data.generated.ts
gantt/src/components/roster/auto-assign-dialog.tsx
gantt/src/services/auto-assign-api.ts
gantt/src/stores/roster-store.ts
gantt/src/utils/auto-assign-driver.ts
live-server/node_modules
live-server/src/services/roster/auto-assign-service.ts
live-server/tests/unit/auto-assign-service.test.ts
node_modules
packages/ui/node_modules
rule-engine-rs/target
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-12-gantt-recovery-s1-options-ready.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
