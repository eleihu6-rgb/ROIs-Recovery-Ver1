# 开发上下文（2026-09-12）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-12 12:29:22 PDT
- Wing：`gantt`
- Topic：`crew-recovery-case-001`
- Title：Crew recovery Case 001 evidence and reusable skill
- Git branch：`main`

## 本轮对话上下文

Created .agents/skills/145-crew-recovery-case-study/SKILL.md and detailed execution memo docs/test-cases/crew-recovery/2026-09-12-S1-case-001-execution-Ver1.md. Published recovery-case-001 Help directly after recovery-costs; nine genuine images, marked Partial. Case belongs exclusively to ADD J4002 Getnet Kifle, pairing 152056, six legs. Actual absence 9 Sep25–26 persisted despite mobile Unable to submit; no absence-9 notification; Alerts requires sign-in. All three requested recovery methods blocked at entry; no generated candidates, cost, Apply, Save or external execution. Do not claim successful recovery or use unrelated YVR fixture.
Restored exact original six assignments and removed only absence 9 / two new ILL rows; older absence 3 and neighbouring pairings preserved. Initial restoration left stale pairing-list CA(2:1); invalidated one cached list containing target 152056. Extended focused Playwright to assert CA 2/2 FO 2/2. Final public-UI suite 2/2 PASS, screenshot s1-verified-restored-Ver2.png visually confirms full badge; empty absence screenshot Ver2 inspected. Mobile post-reset view not separately verified. All nine Help assets inspected. Skill validator and git diff --check PASS. Existing help-menu-coverage gate fails unrelated Legality and System Interface gaps. No commit/push. Concurrent auto-assign changes and node_modules symlinks/deletions are not this task; preserve them. Private local reset/baseline scripts under .local/s1-case must never be reused for new incident IDs without ownership preflight. Full receipts and replay limitations in execution memo.

## 当前工作树快照

### git status --short

```text
 M crew-app/__tests__/features/rbotChatApi.test.ts
 M crew-app/src/features/rbot/crewChatApi.ts
 M crew-app/src/features/v2/MeetingCard.tsx
 M crew-app/src/version.ts
 D e2e/node_modules
 M e2e/tests/gantt/auto-assign-7305-max-consec-j4006.spec.ts
 M e2e/tests/gantt/auto-assign-even-distribution-j4002.spec.ts
 M e2e/tests/gantt/auto-assign-even-distribution-j4007.spec.ts
 M e2e/tests/gantt/auto-assign-open-pairings-j4001.spec.ts
 M e2e/tests/gantt/help/help-recovery.spec.ts
 M e2e/tests/gantt/rbot-auto-assign-crew.spec.ts
 D gantt/node_modules
 M gantt/src/components/help/help-data.ts
 M gantt/src/components/help/help-view.tsx
 M gantt/src/components/roster/auto-assign-dialog.tsx
 M gantt/src/components/roster/context-menu.tsx
 M gantt/src/services/auto-assign-api.ts
 M gantt/src/utils/auto-assign-driver.ts
 D live-server/node_modules
 M live-server/src/routes/roster/roster.ts
 M live-server/src/services/roster/auto-assign-service.ts
 M live-server/tests/unit/auto-assign-service.test.ts
 D node_modules
 D packages/ui/node_modules
?? .agents/skills/145-crew-recovery-case-study/
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
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-absence-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-absence-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-verified-stand-down-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-stand-down-absence-Ver1.png
?? docs/assets/screenshots/gantt/cr-public-login-20260912-Ver1.png
?? docs/assets/screenshots/gantt/res-pairing-dxb-sep2026-Ver1.png
?? docs/assets/screenshots/gantt/startup-gantt-20260912-Ver2.png
?? docs/assets/screenshots/gantt/startup-gantt-20260912-Ver3.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver1.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver2.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver3.png
?? docs/superpowers/specs/2026-09-12-auto-assign-duties-design.md
?? docs/superpowers/specs/2026-09-12-auto-assign-duties-mock.html
?? docs/test-cases/crew-recovery/2026-09-12-S1-case-001-execution-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-S1-crew-unavailable-preparation-Ver1.md
?? e2e/config/recovery-case-study.config.ts
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
crew-app/__tests__/features/rbotChatApi.test.ts
crew-app/src/features/rbot/crewChatApi.ts
crew-app/src/features/v2/MeetingCard.tsx
crew-app/src/version.ts
e2e/node_modules
e2e/tests/gantt/auto-assign-7305-max-consec-j4006.spec.ts
e2e/tests/gantt/auto-assign-even-distribution-j4002.spec.ts
e2e/tests/gantt/auto-assign-even-distribution-j4007.spec.ts
e2e/tests/gantt/auto-assign-open-pairings-j4001.spec.ts
e2e/tests/gantt/help/help-recovery.spec.ts
e2e/tests/gantt/rbot-auto-assign-crew.spec.ts
gantt/node_modules
gantt/src/components/help/help-data.ts
gantt/src/components/help/help-view.tsx
gantt/src/components/roster/auto-assign-dialog.tsx
gantt/src/components/roster/context-menu.tsx
gantt/src/services/auto-assign-api.ts
gantt/src/utils/auto-assign-driver.ts
live-server/node_modules
live-server/src/routes/roster/roster.ts
live-server/src/services/roster/auto-assign-service.ts
live-server/tests/unit/auto-assign-service.test.ts
node_modules
packages/ui/node_modules
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-12-gantt-crew-recovery-case-001.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
