# 开发上下文（2026-09-13）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-13 10:21:44 PDT
- Wing：`gantt`
- Topic：`case3-8004-fleet-recovery-options`
- Title：case3-8004-fleet-recovery-options
- Git branch：`main`

## 本轮对话上下文

Case 3 (8004 crew-fleet mismatch) — fleet-check scoping + option-level verification COMPLETE. Both requester items done. No commit/push.

(b) FLEET rule scope: first scoped Base=ADD, but that gave case-2 crew T2001 a collateral 8004 (T2001 is rostered on 738 pairing 150406 and is only B787-qualified). Tightened to row ["ADD","*","788","FLEET","Y","0","CD","FLY"] on rule id 22 (8004001, instance 8004/001, workset 103). After recheck the ONLY fleet-8004 rows in f8_sit_live are the 4 case-3 crew; case 1/2 carry none. Scripts .local/case3/scope-fleet-add.mjs, scope-fleet-add-788.mjs, verify-scope2.mjs.

(a) Option-level verification: e2e/tests/gantt/recovery-case-003-options.spec.ts PASS (40.2s). Drove one roster-transfer option through the full chain: Executable/Filtered/Best-cost tabs; Executable candidate L3003 (CA, ADD, 788) with Unpriced cost; recovery-option-cost-dialog opens (Unpriced — no cost-library entry, honest not free); recovery-preview-* -> in-memory Preview mode ("Recovery Roster is simulated and not saved", "Transfer to L3003"); recovery-apply -> draft only ("applied to the unsaved Gantt draft", draftOps non-empty, source released / target holds pairing in draft); draft-save-btn -> "Changes saved successfully", draftOps 0. Screenshots docs/assets/screenshots/crew-recovery/case3-options-{executable,cost-breakdown,preview,applied-draft,saved}-Ver1.png (OCR-inspected).

Soft-fleet finding: after Save the roster is L3002/L3003 (CA) + L3006/L3007 (FO) and the 8004 REMAINS for L3003 (788 candidate cannot clear a 7M8 mismatch). Fleet is a SOFT constraint (product decision 2026-09-12) so the transfer commits anyway. A fully-clearing transfer needs a 7M8-qualified candidate; the ADD 7M8 pool J40xx is busy in 2026-09-17..21.

Reset: .local/case3/reset-152227.cjs releases any crew that took pairing 152227 and re-assigns L3001/L3002/L3006/L3007 + recheck. Fixture was reset after the Save run; e2e/tests/gantt/recovery-case-003.spec.ts re-run afterwards -> PASS (58.8s). Current fixture state: roster L3001/L3002/L3006/L3007, 4 x 8004 fleet alerts on 152227, no collateral.

Specs/config: e2e/config/case3.config.ts (testMatch recovery-case-003(?:-options)?.spec.ts), e2e/tests/gantt/recovery-case-003.spec.ts (entry points), recovery-case-003-options.spec.ts (options). Run: cd e2e && GANTT_BASE_URL=http://localhost:5567 GANTT_API_URL=http://localhost:3000 npx playwright test --config=config/case3.config.ts.

Record updated: docs/test-cases/crew-recovery/2026-09-13-case-003-preparation-Ver1.md. Code change (earlier turn): gantt/src/components/roster/context-menu.tsx pairing-pane 8004 recovery entry. Gantt tsc clean except pre-existing service-status-pill errors.

Still open: 8004 clearance by a qualified replacement; standby/cross-base option execution; crew-app notification; Help case article. No commits.

## 当前工作树快照

### git status --short

```text
 M .agents/skills/144-auto-assign-base-crew/SKILL.md
 M .agents/skills/145-crew-recovery-case-study/SKILL.md
 M .gitignore
 M AGENTS.md
 M CLAUDE.md
 M crew-app/__tests__/features/meetingSetup.test.ts
 M crew-app/__tests__/features/notificationsApi.test.ts
 M crew-app/__tests__/features/schedRosterViews.test.ts
 M crew-app/__tests__/features/scheduleMeetings.test.tsx
 M crew-app/__tests__/themeCoverage.test.ts
 M crew-app/ios/RoyceTravelTemplate/MeetingBackgroundSync.swift
 M crew-app/src/features/meetings/meetingSetup.ts
 M crew-app/src/features/notifications/NotificationsScreen.tsx
 M crew-app/src/features/notifications/notificationsApi.ts
 M crew-app/src/features/v2/CalendarView.tsx
 M crew-app/src/features/v2/ScheduleScreen.tsx
 M crew-app/src/features/v2/model.ts
 M crew-app/src/features/v2/schedView.ts
 M crew-app/src/version.ts
 M docs/dev-context/LATEST.md
 M docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md
 M docs/superpowers/specs/2026-09-12-auto-assign-duties-design.md
 M e2e/tests/gantt/auto-assign-duties.spec.ts
 M e2e/tests/gantt/help/help-recovery.spec.ts
 M gantt/src/components/dev/dev-skills-data.generated.ts
 M gantt/src/components/gantt/source/__tests__/live-violation-attribution.test.ts
 M gantt/src/components/gantt/source/live-gantt-source.ts
 M gantt/src/components/help/help-data.ts
 M gantt/src/components/help/help-view.tsx
 M gantt/src/components/pairing/duty-node-dialog.tsx
 M gantt/src/components/panes/pairing-pane.tsx
 M gantt/src/components/panes/shared/pairing-pane.tsx
 M gantt/src/components/panes/shared/roster-pane.tsx
 M gantt/src/components/panes/violation-list-dialog.tsx
 M gantt/src/components/recovery/recovery-violation-dialog.tsx
 M gantt/src/components/roster/auto-assign-dialog.tsx
 M gantt/src/components/roster/context-menu.tsx
 M gantt/src/services/auto-assign-api.ts
 M gantt/src/services/recovery-api.ts
 M gantt/src/services/recovery-candidates.ts
 M gantt/src/services/recovery-rules.ts
 M gantt/src/services/recovery-trigger.ts
 M gantt/src/version.ts
 M live-server/src/__tests__/unit/crew-notify-route.test.ts
 M live-server/src/plugins/auth.ts
 M live-server/src/routes/crew-notify/crew-notify.ts
 M live-server/src/routes/recovery/recovery-cost.ts
 M live-server/src/services/flight/flight-delay-propagation-service.ts
 M live-server/src/services/roster/auto-assign-service.ts
 M live-server/tests/unit/auto-assign-service.test.ts
 M package.json
?? .agents/skills/141-crew-seed-generator/fixtures/ethiopia-add-788.json
?? crew-app/__tests__/features/discretionScreen.test.tsx
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
?? docs/assets/screenshots/crew-app/s2-consent-mobile-no-Ver1.png
?? docs/assets/screenshots/crew-app/s2-consent-mobile-no-confirm-Ver1.png
?? docs/assets/screenshots/crew-app/s2-consent-mobile-no-confirm-Ver2.png
?? docs/assets/screenshots/crew-app/s2-consent-mobile-request-Ver1.png
?? docs/assets/screenshots/crew-app/s2-consent-mobile-unanimous-S21001-request-Ver1.png
?? docs/assets/screenshots/crew-app/s2-consent-mobile-unanimous-S21001-yes-Ver1.png
?? docs/assets/screenshots/crew-app/s2-consent-mobile-unanimous-S21014-request-Ver1.png
?? docs/assets/screenshots/crew-app/s2-consent-mobile-unanimous-S21014-yes-Ver1.png
?? docs/assets/screenshots/crew-app/s2-consent-mobile-unanimous-S21015-request-Ver1.png
?? docs/assets/screenshots/crew-app/s2-consent-mobile-unanimous-S21015-yes-Ver1.png
?? docs/assets/screenshots/crew-app/s2-consent-mobile-yes-Ver1.png
?? docs/assets/screenshots/crew-app/v2-day-off-art-Ver1-01_cafe.png
?? docs/assets/screenshots/crew-app/v2-day-off-art-Ver1-02_mountain.png
?? docs/assets/screenshots/crew-app/v2-guest-meeting-only-Ver1-01_no-day-off.png
?? docs/assets/screenshots/crew-app/v2-meeting-overlap-Ver1-01_two-events-1900.png
?? docs/assets/screenshots/crew-app/v2-meeting-short-event-Ver1-01_full-title-location.png
?? docs/assets/screenshots/crew-recovery/case3-entry1-alert-center-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-entry2-pairing-pane-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-entry3-roster-pane-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-options-applied-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-options-cost-breakdown-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-options-executable-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-options-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-options-saved-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-roster-4-pilots-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-add-basic-delay-ghost-panes-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-add-basic-delay-ghost-panes-Ver2.png
?? docs/assets/screenshots/crew-recovery/s2-add-basic-delay-ghost-panes-Ver3.png
?? docs/assets/screenshots/crew-recovery/s2-add-basic-delay-ghost-panes-Ver4.png
?? docs/assets/screenshots/crew-recovery/s2-add-basic-delay-ghost-panes-Ver5.png
?? docs/assets/screenshots/crew-recovery/s2-add-debug-after-filter.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-context-menu-debug-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-context-menu-debug-Ver2.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-context-menu-debug-Ver3.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver10.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver11.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver12.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver13.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver14.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver15.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver2.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver3.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver4.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver5.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver6.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver7.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver8.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-Ver9.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-standby-costs-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-add-pairing-right-click-recovery-standby-costs-click2-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry1-roster-right-click-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry1-roster-right-click-Ver2.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry1-roster-right-click-Ver3.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry1-roster-right-click-Ver4.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry1-roster-right-click-Ver5.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry2-pairing-right-click-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry2-pairing-right-click-Ver2.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry2-pairing-right-click-Ver3.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry2-pairing-right-click-Ver4.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry2-pairing-right-click-Ver5.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry3-alert-center-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry3-alert-center-Ver2.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry3-alert-center-Ver3.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry3-alert-center-Ver4.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry3-alert-center-Ver5.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry3-alert-center-recovery-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-fdp-entry3-alert-center-recovery-Ver2.png
?? docs/assets/screenshots/crew-recovery/s2-isolated-crew-pool-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-isolated-crew-pool-Ver2.png
?? docs/assets/screenshots/crew-recovery/s2-recovery-skill-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-roster-right-click-recovery-entry-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-3-crew-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-analyse-Ver2.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-applied-Ver2.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-configure-Ver2.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-glance-Ver2.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-analyse-Ver2.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-applied-Ver2.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-configure-Ver2.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-glance-Ver2.png
?? docs/assets/screenshots/gantt/cr-public-login-20260912-Ver1.png
?? docs/assets/screenshots/gantt/help-recovery-cases-Ver1.png
?? docs/assets/screenshots/gantt/help-recovery-recovery-102-Ver1.png
?? docs/assets/screenshots/gantt/help-recovery-recovery-103-Ver1.png
?? docs/assets/screenshots/gantt/help-recovery-recovery-104-Ver1.png
?? docs/assets/screenshots/gantt/help-recovery-recovery-case-001-Ver1.png
?? docs/assets/screenshots/gantt/help-recovery-recovery-case-002-Ver1.png
?? docs/assets/screenshots/gantt/help-recovery-recovery-cost-library-Ver1.png
?? docs/assets/screenshots/gantt/help-recovery-recovery-costs-Ver1.png
?? docs/assets/screenshots/gantt/help-recovery-recovery-overview-Ver1.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-applied-Ver5.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week1-Ver4.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week2-Ver4.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week3-Ver4.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week4-Ver4.png
?? docs/assets/screenshots/gantt/rule-3007-dxb-delay-alert-center-Ver1.png
?? docs/assets/screenshots/gantt/rule-3007-dxb-delay-alert-center-Ver1.png.review.txt
?? docs/assets/screenshots/gantt/rule-3007-dxb-delay-alert-center-Ver1.png.vision.txt
?? docs/assets/screenshots/gantt/rule-3007-dxb-single-leg-delay-Ver1.png
?? docs/assets/screenshots/gantt/s2-consent-controller-compose-Ver1.png
?? docs/assets/screenshots/gantt/s2-consent-controller-feedback-Ver1.png
?? docs/assets/screenshots/gantt/s2-consent-controller-initial-Ver1.png
?? docs/assets/screenshots/gantt/s2-consent-controller-returned-Ver1.png
?? docs/assets/screenshots/gantt/s2-consent-controller-sent-Ver1.png
?? docs/assets/screenshots/gantt/s2-consent-controller-unanimous-Ver1.png
?? docs/assets/screenshots/gantt/startup-gantt-20260912-Ver2.png
?? docs/assets/screenshots/gantt/startup-gantt-20260912-Ver3.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver1.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver2.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver3.png
?? docs/dev-context/2026-09-12-gantt-s2-preparation-crew-consent.md
?? docs/dev-context/2026-09-13-gantt-case3-8004-fleet-recovery.md
?? docs/dev-context/2026-09-13-live-server-rule-3007-fdp-delay.md
?? docs/handoff/agent-workflow/2026-09-13-deepseek-native-view-image.md
?? docs/handoff/crew-app/2026-09-12-crew-app-social-login-provisioning-handoff.md
?? docs/superpowers/specs/2026-09-12-1744-S2-flight-delay-preparation-Ver1.md
?? docs/superpowers/specs/2026-09-12-S2-discretion-consent-design.md
?? docs/test-cases/crew-recovery/2026-09-12-1817-S2-prepared-fixtures-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-S2-discretion-consent-evidence-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-13-case-003-preparation-Ver1.md
?? docs/test-cases/crew-recovery/fixtures/
?? e2e/config/case3.config.ts
?? e2e/docs/
?? e2e/scripts/recovery-s1-gh-readonly.cjs
?? e2e/scripts/recovery-s1-options-readonly.cjs
?? e2e/tests/gantt/recovery-case-003-options.spec.ts
?? e2e/tests/gantt/recovery-case-003.spec.ts
?? gantt/public/help/screenshots/s1-absence-dates-Ver1.jpg
?? gantt/public/help/screenshots/s1-absence-record-Ver1.png
?? gantt/public/help/screenshots/s1-add-filter-Ver1.png
?? gantt/public/help/screenshots/s1-crew-alerts-Ver1.jpg
?? gantt/public/help/screenshots/s1-mobile-error-Ver1.jpg
?? gantt/public/help/screenshots/s1-option1-Ver1.png
?? gantt/public/help/screenshots/s1-option2-Ver1.png
?? gantt/public/help/screenshots/s1-option3-Ver1.png
?? gantt/public/help/screenshots/s1-stand-down-Ver1.png
?? gantt/public/help/screenshots/s2-consent-controller-feedback-Ver1.png
?? gantt/public/help/screenshots/s2-consent-controller-unanimous-Ver1.png
?? gantt/public/help/screenshots/s2-consent-mobile-request-Ver1.png
?? gantt/public/help/screenshots/s2-isolated-crew-pool-Ver1.png
?? gantt/src/components/help/topics/recovery/recovery-case-002.tsx
?? gantt/src/components/recovery/__tests__/discretion-consent-panel.test.tsx
?? gantt/src/components/recovery/discretion-consent-panel.tsx
?? gantt/src/services/__tests__/gantt-sync-manager-fallback.test.ts
?? live-server/src/services/crew-notify/__tests__/discretion-consent-service.test.ts
?? live-server/src/services/crew-notify/discretion-consent-service.ts
?? packages/legality-messages/pnpm-lock.yaml
?? scripts/__tests__/screenshot-review.test.mjs
?? scripts/screenshot-review/
?? sim_01_login.png
```

### unstaged changed files

```text
.agents/skills/144-auto-assign-base-crew/SKILL.md
.agents/skills/145-crew-recovery-case-study/SKILL.md
.gitignore
AGENTS.md
CLAUDE.md
crew-app/__tests__/features/meetingSetup.test.ts
crew-app/__tests__/features/notificationsApi.test.ts
crew-app/__tests__/features/schedRosterViews.test.ts
crew-app/__tests__/features/scheduleMeetings.test.tsx
crew-app/__tests__/themeCoverage.test.ts
crew-app/ios/RoyceTravelTemplate/MeetingBackgroundSync.swift
crew-app/src/features/meetings/meetingSetup.ts
crew-app/src/features/notifications/NotificationsScreen.tsx
crew-app/src/features/notifications/notificationsApi.ts
crew-app/src/features/v2/CalendarView.tsx
crew-app/src/features/v2/ScheduleScreen.tsx
crew-app/src/features/v2/model.ts
crew-app/src/features/v2/schedView.ts
crew-app/src/version.ts
docs/dev-context/LATEST.md
docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md
docs/superpowers/specs/2026-09-12-auto-assign-duties-design.md
e2e/tests/gantt/auto-assign-duties.spec.ts
e2e/tests/gantt/help/help-recovery.spec.ts
gantt/src/components/dev/dev-skills-data.generated.ts
gantt/src/components/gantt/source/__tests__/live-violation-attribution.test.ts
gantt/src/components/gantt/source/live-gantt-source.ts
gantt/src/components/help/help-data.ts
gantt/src/components/help/help-view.tsx
gantt/src/components/pairing/duty-node-dialog.tsx
gantt/src/components/panes/pairing-pane.tsx
gantt/src/components/panes/shared/pairing-pane.tsx
gantt/src/components/panes/shared/roster-pane.tsx
gantt/src/components/panes/violation-list-dialog.tsx
gantt/src/components/recovery/recovery-violation-dialog.tsx
gantt/src/components/roster/auto-assign-dialog.tsx
gantt/src/components/roster/context-menu.tsx
gantt/src/services/auto-assign-api.ts
gantt/src/services/recovery-api.ts
gantt/src/services/recovery-candidates.ts
gantt/src/services/recovery-rules.ts
gantt/src/services/recovery-trigger.ts
gantt/src/version.ts
live-server/src/__tests__/unit/crew-notify-route.test.ts
live-server/src/plugins/auth.ts
live-server/src/routes/crew-notify/crew-notify.ts
live-server/src/routes/recovery/recovery-cost.ts
live-server/src/services/flight/flight-delay-propagation-service.ts
live-server/src/services/roster/auto-assign-service.ts
live-server/tests/unit/auto-assign-service.test.ts
package.json
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-13-gantt-case3-8004-fleet-recovery-options.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
