# 开发上下文（2026-09-12）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-12 17:25:50 PDT
- Wing：`gantt`
- Topic：`recovery-s1-retained-duty-help-reset`
- Title：recovery-s1-retained-duty-help-reset
- Git branch：`main`

## 本轮对话上下文

Completed user-authorized crew-app SL retain-duty change, Help Case1 rewrite and skill145 update. No commit or push. Preserve concurrent crew-app/auto-assign changes.

Canonical execution receipt: docs/test-cases/crew-recovery/2026-09-12-1730-S1-retained-duty-help-reset-Ver1.md. See also 1415 headed walkthrough and1445 swap GH receipts. Real Maestro submitted24Sep2026 full ADD-local day for J4002; request10/ILL1355740; original six source rows1355154–1355159 and pairing152056 coverage/flight times unchanged. Playwright verified genuineILL/FLY1001 ->3standbyselectable. Full-dayILL gives0same-day swaps; preparedSL1355350 at00:15–12:15UTC gives6. Do not change swap engine or pretend these windows are the same.

RESET COMPLETE: removed onlyILL1355740 using normal roster API; exact owned request10 cancelled with guarded update because no cancellation endpoint exists. Preserve cancelled request, original submission notification and soft-deleted ILL as audit. Older absence3 and preparedSL1355350 unchanged. Existing Rust driver recomputed onlyJ4002 Sep1–30:77:35. Private restored.json proves original active rows, composition, flights and older absences unchanged. Fresh public Live Playwright verifies6source legs, CA2/2FO2/2, zero drafts, preparedSL1001only,6swaps+3standbyenabled. Browser left on standby list without selecting/applying. This is prepared-controller-incident baseline, not absence-free baseline. Do not run obsolete absence9 reset scripts.

Online Help verified at https://cr.rois.one/altair/help: Case study1—J4002 unavailable at ADD immediately after Comparing recovery costs;12steps,4real images total752729bytes, no historical defect/YVR narrative,3standby+6swapGHtables, explicit Preview/Apply/Save boundaries. All3standby previewed; J4011saved/reloaded/restored earlier. All6swapsboth-crewcost/preview/Apply4draftops/Undo; swapSaveuntested. Delaypreviewonly. No claims of CCX/APIS/hotel/payroll/crewack.

Backend absence+notification20/20PASS, crew-appJest15/15PASS, appTSC PASS, check:uiPASS0hard124warnings, scoped diffPASS, skillvalidatorPASS. BackendTSC existing unrelatedlegality-preview.ts288fails. Dedicated realUI scripts passed; consolidated case/spec and broadHelp suite not rerun. Existing Help coverage gaps remain. Failed postcommit hooks are logged independently, no durable outbox/new idempotency guarantee.

SwapGH implementation from earlier work uncommitted: bothcrewCostLibrary guarantee after(before-removed+added)-before, missingcontextUnpriced; GHonly excludes otherfees. J4012before76:35after88:55USD470; J4013before87:05after99:25USD1762.50; J4011USD0. Six swapsJ4005/J4014/J4015USD0,J4018USD130,J4016USD360,J4017USD470. Assignedmonthcredit, not alreadyflown hours. Candidate discovery depends on loaded data; preview onlyshows2affectedcrews.

## 当前工作树快照

### git status --short

```text
 M .agents/skills/144-auto-assign-base-crew/SKILL.md
 M .agents/skills/145-crew-recovery-case-study/SKILL.md
 M crew-app/.maestro/et_j4002_absence.yaml
 M crew-app/__tests__/features/AbsenceScreen.test.tsx
 M crew-app/__tests__/features/absenceApi.test.ts
 M crew-app/__tests__/features/schedRosterViews.test.ts
 M crew-app/__tests__/features/scheduleMeetings.test.tsx
 M crew-app/ios/RoyceTravelTemplate/MeetingBackgroundSync.swift
 M crew-app/src/features/absence/absenceApi.ts
 M crew-app/src/features/v2/AbsenceScreen.tsx
 M crew-app/src/features/v2/CalendarView.tsx
 M crew-app/src/features/v2/PreferencesScreen.tsx
 M crew-app/src/features/v2/ScheduleScreen.tsx
 M crew-app/src/features/v2/model.ts
 M crew-app/src/features/v2/schedView.ts
 M crew-app/src/version.ts
 M docs/assets/screenshots/gantt/auto-assign-7305-max-consec-j4006-Ver2.png
 M docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md
 D e2e/node_modules
 M e2e/tests/gantt/auto-assign-7305-max-consec-j4006.spec.ts
 M e2e/tests/gantt/auto-assign-even-distribution-j4002.spec.ts
 M e2e/tests/gantt/auto-assign-even-distribution-j4007.spec.ts
 M e2e/tests/gantt/auto-assign-open-pairings-j4001.spec.ts
 M e2e/tests/gantt/help/help-recovery.spec.ts
 M e2e/tests/gantt/rbot-auto-assign-crew.spec.ts
 D gantt/node_modules
 M gantt/src/components/dev/dev-skills-data.generated.ts
 M gantt/src/components/help/help-data.ts
 M gantt/src/components/help/topics/recovery/recovery-102.tsx
 M gantt/src/components/help/topics/recovery/recovery-103.tsx
 M gantt/src/components/help/topics/recovery/recovery-costs.tsx
 M gantt/src/components/recovery/recovery-cost-breakdown-dialog.tsx
 M gantt/src/components/recovery/recovery-violation-dialog.tsx
 M gantt/src/components/roster/auto-assign-dialog.tsx
 M gantt/src/services/auto-assign-api.ts
 M gantt/src/services/recovery-api.ts
 M gantt/src/services/recovery-candidates.ts
 M gantt/src/stores/roster-store.ts
 M gantt/src/utils/assign-pairing-op.ts
 M gantt/src/utils/auto-assign-driver.ts
 D live-server/node_modules
 M live-server/src/routes/crew-notify/crew-notify.ts
 M live-server/src/routes/recovery/recovery-cost.ts
 M live-server/src/services/absence/__tests__/crew-absence-service.test.ts
 M live-server/src/services/absence/crew-absence-service.ts
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
?? docs/assets/screenshots/crew-recovery/s1-gh-J4011-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4011-cost-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4011-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4011-preview-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4012-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4012-cost-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4012-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4012-preview-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4013-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4013-cost-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4013-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4013-preview-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-gh-option1-applied-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-standby-list-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-standby-list-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-gh-standby-list-Ver3.png
?? docs/assets/screenshots/crew-recovery/s1-gh-standby-list-Ver4.png
?? docs/assets/screenshots/crew-recovery/s1-gh-standby-list-Ver5.png
?? docs/assets/screenshots/crew-recovery/s1-headed-delay-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-delay-selection-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-final-standby-choice-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-restored-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-standby-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-standby-reloaded-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-standby-saved-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-start-alert-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-swap-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-swap-selection-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-swap-selection-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-headed-swap-selection-Ver3.png
?? docs/assets/screenshots/crew-recovery/s1-help-mobile-success-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-help-narrow-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-help-narrow-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-help-published-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-help-published-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-help-rewritten-narrow-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-help-rewritten-top-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-help-standby-table-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-help-swap-table-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-help-verification-scope-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-option1-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-option1-selectable-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-option2-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-option2-selectable-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-options-before-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-options-ready-baseline-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-retain-controller-1001-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-retain-controller-standby-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-retain-mobile-dates-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-retain-mobile-ready-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-retain-mobile-success-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-retain-reset-alert-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-retain-reset-roster-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-retain-reset-six-swaps-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-retain-reset-three-standby-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-standby-verified-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-standby-verified-selectable-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-duty-verified-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-duty-verified-selectable-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4005-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4005-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4005-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4014-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4014-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4014-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4015-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4015-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4015-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4016-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4016-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4016-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4017-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4017-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4017-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4018-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4018-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4018-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-list-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-list-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-list-Ver3.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-list-Ver4.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-restored-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-six-selectable-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-absence-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-absence-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-verified-stand-down-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-stand-down-absence-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-analyse-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-applied-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-configure-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-13crew-analyse-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-13crew-applied-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-13crew-configure-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-analyse-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-applied-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-configure-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-six-crew-Ver1.png
?? docs/assets/screenshots/gantt/cr-public-login-20260912-Ver1.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-applied-Ver5.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week1-Ver4.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week2-Ver4.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week3-Ver4.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week4-Ver4.png
?? docs/assets/screenshots/gantt/res-pairing-dxb-sep2026-Ver1.png
?? docs/assets/screenshots/gantt/startup-gantt-20260912-Ver2.png
?? docs/assets/screenshots/gantt/startup-gantt-20260912-Ver3.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver1.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver2.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver3.png
?? docs/dev-context/2026-09-12-gantt-crew-recovery-case-001.md
?? docs/dev-context/2026-09-12-gantt-recovery-s1-options-ready.md
?? docs/handoff/crew-app/2026-09-12-crew-app-social-login-provisioning-handoff.md
?? docs/superpowers/specs/2026-09-12-auto-assign-duties-design.md
?? docs/superpowers/specs/2026-09-12-auto-assign-duties-mock.html
?? docs/superpowers/specs/2026-09-12-crew-sl-retain-duty-help-Ver1.md
?? docs/superpowers/specs/2026-09-12-recovery-standby-gh-demo-Ver1.md
?? docs/superpowers/specs/2026-09-12-recovery-swap-gh-demo-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-1415-S1-headed-walkthrough-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-1445-S1-swap-gh-six-candidates-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-1730-S1-retained-duty-help-reset-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-S1-1001-options-setup-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-S1-case-001-execution-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-S1-crew-unavailable-preparation-Ver1.md
?? e2e/config/recovery-case-study.config.ts
?? e2e/docs/
?? e2e/scripts/recovery-s1-gh-readonly.cjs
?? e2e/scripts/recovery-s1-options-readonly.cjs
?? e2e/scripts/recovery-s1-swap-gh.cjs
?? e2e/tests/gantt/auto-assign-duties-show-crew.spec.ts
?? e2e/tests/gantt/auto-assign-duties.spec.ts
?? e2e/tests/gantt/recovery-case-001.spec.ts
?? e2e/tests/gantt/res-pairing-dxb-sep2026-seed.spec.ts
?? e2e/tests/gantt/res-pairing-dxb-sep2026-verify.spec.ts
?? gantt/public/help/screenshots/s1-absence-dates-Ver1.jpg
?? gantt/public/help/screenshots/s1-absence-record-Ver1.png
?? gantt/public/help/screenshots/s1-add-filter-Ver1.png
?? gantt/public/help/screenshots/s1-crew-alerts-Ver1.jpg
?? gantt/public/help/screenshots/s1-delay-comparison-Ver1.png
?? gantt/public/help/screenshots/s1-gh-standby-list-Ver1.png
?? gantt/public/help/screenshots/s1-mobile-error-Ver1.jpg
?? gantt/public/help/screenshots/s1-option1-Ver1.png
?? gantt/public/help/screenshots/s1-option2-Ver1.png
?? gantt/public/help/screenshots/s1-option3-Ver1.png
?? gantt/public/help/screenshots/s1-retain-mobile-success-Ver1.jpg
?? gantt/public/help/screenshots/s1-stand-down-Ver1.png
?? gantt/public/help/screenshots/s1-swap-gh-list-Ver1.png
?? gantt/src/components/help/topics/recovery/recovery-case-001.tsx
?? gantt/src/services/__tests__/gantt-sync-manager-fallback.test.ts
?? gantt/src/services/__tests__/recovery-standby-gh.test.ts
?? gantt/src/services/__tests__/recovery-swap-gh.test.ts
?? live-server/src/services/recovery/standby-gh-cost.test.ts
?? live-server/src/services/recovery/standby-gh-cost.ts
?? live-server/src/services/recovery/swap-gh-cost.test.ts
?? live-server/src/services/recovery/swap-gh-cost.ts
?? packages/legality-messages/pnpm-lock.yaml
?? sim_01_login.png
```

### unstaged changed files

```text
.agents/skills/144-auto-assign-base-crew/SKILL.md
.agents/skills/145-crew-recovery-case-study/SKILL.md
crew-app/.maestro/et_j4002_absence.yaml
crew-app/__tests__/features/AbsenceScreen.test.tsx
crew-app/__tests__/features/absenceApi.test.ts
crew-app/__tests__/features/schedRosterViews.test.ts
crew-app/__tests__/features/scheduleMeetings.test.tsx
crew-app/ios/RoyceTravelTemplate/MeetingBackgroundSync.swift
crew-app/src/features/absence/absenceApi.ts
crew-app/src/features/v2/AbsenceScreen.tsx
crew-app/src/features/v2/CalendarView.tsx
crew-app/src/features/v2/PreferencesScreen.tsx
crew-app/src/features/v2/ScheduleScreen.tsx
crew-app/src/features/v2/model.ts
crew-app/src/features/v2/schedView.ts
crew-app/src/version.ts
docs/assets/screenshots/gantt/auto-assign-7305-max-consec-j4006-Ver2.png
docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md
e2e/node_modules
e2e/tests/gantt/auto-assign-7305-max-consec-j4006.spec.ts
e2e/tests/gantt/auto-assign-even-distribution-j4002.spec.ts
e2e/tests/gantt/auto-assign-even-distribution-j4007.spec.ts
e2e/tests/gantt/auto-assign-open-pairings-j4001.spec.ts
e2e/tests/gantt/help/help-recovery.spec.ts
e2e/tests/gantt/rbot-auto-assign-crew.spec.ts
gantt/node_modules
gantt/src/components/dev/dev-skills-data.generated.ts
gantt/src/components/help/help-data.ts
gantt/src/components/help/topics/recovery/recovery-102.tsx
gantt/src/components/help/topics/recovery/recovery-103.tsx
gantt/src/components/help/topics/recovery/recovery-costs.tsx
gantt/src/components/recovery/recovery-cost-breakdown-dialog.tsx
gantt/src/components/recovery/recovery-violation-dialog.tsx
gantt/src/components/roster/auto-assign-dialog.tsx
gantt/src/services/auto-assign-api.ts
gantt/src/services/recovery-api.ts
gantt/src/services/recovery-candidates.ts
gantt/src/stores/roster-store.ts
gantt/src/utils/assign-pairing-op.ts
gantt/src/utils/auto-assign-driver.ts
live-server/node_modules
live-server/src/routes/crew-notify/crew-notify.ts
live-server/src/routes/recovery/recovery-cost.ts
live-server/src/services/absence/__tests__/crew-absence-service.test.ts
live-server/src/services/absence/crew-absence-service.ts
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
2. 本文件：`docs/dev-context/2026-09-12-gantt-recovery-s1-retained-duty-help-reset.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
