# 开发上下文（2026-09-14）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-14 10:44:49 PDT
- Wing：`gantt`
- Topic：`recovery-case4-complete`
- Title：Recovery Case 4: build, staff, protect and restore
- Git branch：`main`

## 本轮对话上下文

Implemented and verified approved Recovery Case4. Read docs/test-cases/crew-recovery/2026-09-14-case4-delivery-Ver1.md and the Sept14 design/plan before resuming. Unpaired flight Recovery lists anchored same-airline/exact-fleet base-return options with timeline/details. Build saves immediately, focuses row1, closing preserves the pairing. Any open/partial pairing enters roster-only workspace. Standby/available/move-up use Cost Library, authoritative legality, Preview Apply normal draft Save. Donor vacancy remains Partial. Original Case1–3 violation branch is retained.
ET demo search17–25Sep2026, ADD/738, ET895/ET894 on17Sep. Isolated C4001–C4020 cohort; protected actual record hash unchanged throughout. All three staffing methods saved both ranks and reloaded through real UI, with baseline resets between methods. Read-only legacy Cases1–3 UI regressions passed. Final target152686 soft-deleted; target flights unpaired, donor152683 restored,305 active C4 roster baseline rows semantically equal, no drafts. Actual history of executed target152685 retained. Private baseline/reset scripts live .local/case4; do not publish raw records or rerun seeds indiscriminately.
Important fixes: report05:15 requires ASBY04–12UTC; raw pg timestamps must be checked as text on Mac; undefined donor must not match unrelated unpaired task; own-save WS list can overwrite fresh coverage, so Case4 waits for active list refresh then reconciles affected details only. Reset cannot use generic removeFlight (historical roster guard) or generic physical pairing delete (history loss); exact target soft-deletion under lock follows no-active-roster validation.
Evidence:69 frontend unit tests and37 backend tests PASS; Build/reopen, three2-rank staffing runs, final restored-state UI, illustrated Help and3 protected UI regressions PASS; screenshots visually inspected. UI gate PASS0 hard/124 existing warnings; diff PASS. Broad tsc still fails only pre-existing service-status-pill and backend test types; Help menu coverage still has pre-existing Legality and system-interface gaps. Skill145 updated and validated. No commit/push; many unrelated pre-existing changes preserved. Agents assisted bounded tasks; primary corrected their scope/fixture/test issues and owns final reviewed evidence. Freeze source edits during Vite UI tests: even test edits can trigger reload/version update.

## 当前工作树快照

### git status --short

```text
 M .agents/skills/145-crew-recovery-case-study/SKILL.md
 M CLAUDE.md
 M docs/assets/screenshots/crew-recovery/case3-options-applied-draft-Ver1.png
 M docs/assets/screenshots/crew-recovery/case3-options-cost-breakdown-Ver1.png
 M docs/assets/screenshots/crew-recovery/case3-options-executable-Ver1.png
 M docs/assets/screenshots/crew-recovery/case3-options-preview-Ver1.png
 M docs/assets/screenshots/crew-recovery/case3-options-saved-Ver1.png
 M docs/assets/screenshots/gantt/help-recovery-cases-Ver1.png
 M docs/assets/screenshots/gantt/help-recovery-recovery-case-002-Ver1.png
 M docs/assets/screenshots/gantt/help-recovery-recovery-case-003-Ver1.png
 M docs/dev-context/LATEST.md
 M docs/test-cases/crew-recovery/2026-09-13-case-003-preparation-Ver1.md
 M e2e/config/case3.config.ts
 M e2e/tests/gantt/help/help-recovery.spec.ts
 M gantt/src/components/dev/dev-skills-data.generated.ts
 M gantt/src/components/help/help-data.ts
 M gantt/src/components/help/help-view.tsx
 M gantt/src/components/help/topics/recovery/recovery-case-002.tsx
 M gantt/src/components/help/topics/recovery/recovery-case-003.tsx
 M gantt/src/components/panes/shared/roster-pane.tsx
 M gantt/src/components/recovery/recovery-cost-breakdown-dialog.tsx
 M gantt/src/components/recovery/recovery-violation-dialog.tsx
 M gantt/src/components/roster/context-menu.tsx
 M gantt/src/components/scenario-gantt/cross-rank-confirm-dialog.tsx
 M gantt/src/components/shell/dashboard-view.tsx
 M gantt/src/services/__tests__/recovery-candidates.test.ts
 M gantt/src/services/__tests__/recovery-swap-gh.test.ts
 M gantt/src/services/__tests__/recovery-trigger.test.ts
 M gantt/src/services/dashboard-service.ts
 M gantt/src/services/recovery-api.ts
 M gantt/src/services/recovery-candidates.ts
 M gantt/src/services/roundtrip-api.ts
 M gantt/src/utils/assign-pairing-op.ts
 M gantt/src/utils/gantt-test-hook.ts
 M gantt/src/version.ts
 M live-server/src/__tests__/unit/crew-absence-history-route.test.ts
 M live-server/src/models/index.ts
 M live-server/src/routes/dashboard/dashboard.ts
 M live-server/src/routes/pairing/pairing.ts
 M live-server/src/routes/recovery/recovery-cost.ts
 M live-server/src/services/crew-notify/__tests__/discretion-consent-service.test.ts
 M live-server/src/services/crew-notify/discretion-consent-service.ts
 M live-server/src/services/pairing/roundtrip-service.ts
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
?? .agents/skills/146-recovery-case-1-overlap-standby/
?? .agents/skills/147-recovery-case-2-delay-standby/
?? .agents/skills/148-recovery-case-3-fleet-standby/
?? docs/assets/screenshots/crew-app/absence-history-Ver1-00-icon.png
?? docs/assets/screenshots/crew-app/absence-history-Ver1-01-list.png
?? docs/assets/screenshots/crew-app/absence-history-Ver1-02-empty.png
?? docs/assets/screenshots/crew-app/ek-absence-Ver1-00-login.png
?? docs/assets/screenshots/crew-app/ek-absence-Ver1-01-form.png
?? docs/assets/screenshots/crew-app/ek-absence-Ver1-02-submitted.png
?? docs/assets/screenshots/crew-app/ek-absence-Ver1-03-history.png
?? docs/assets/screenshots/crew-app/popup-standard-Ver1-01-success.png
?? docs/assets/screenshots/crew-app/s2-msg-alerts-details-Ver2.png.review.txt
?? docs/assets/screenshots/crew-app/s2-msg-alerts-details-Ver2.png.vision.txt
?? docs/assets/screenshots/crew-app/s2-msg-decision-sent-Ver2.png.review.txt
?? docs/assets/screenshots/crew-app/s2-msg-decision-sent-Ver2.png.vision.txt
?? docs/assets/screenshots/crew-app/s2-msg-home-quick-action-Ver2.png.review.txt
?? docs/assets/screenshots/crew-app/s2-msg-home-quick-action-Ver2.png.vision.txt
?? docs/assets/screenshots/crew-recovery/case1-standby-ca-pool-Ver1.png
?? docs/assets/screenshots/crew-recovery/case2-fdp-discretion-rejected-Ver1.png
?? docs/assets/screenshots/crew-recovery/case2-fdp-discretion-rejected-Ver1.png.review.txt
?? docs/assets/screenshots/crew-recovery/case2-fdp-discretion-rejected-Ver1.png.vision.txt
?? docs/assets/screenshots/crew-recovery/case2-fdp-request-dialog-Ver1.png
?? docs/assets/screenshots/crew-recovery/case2-fdp-standby-recommended-Ver1.png
?? docs/assets/screenshots/crew-recovery/case2-fdp-standby-recommended-Ver1.png.review.txt
?? docs/assets/screenshots/crew-recovery/case2-fdp-standby-recommended-Ver1.png.vision.txt
?? docs/assets/screenshots/crew-recovery/case2-standby-ca-pool-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-clear-baseline-alert-center-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-clear-final-alert-center-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-clear-final-alert-center-Ver1.png.review.txt
?? docs/assets/screenshots/crew-recovery/case3-clear-final-alert-center-Ver1.png.vision.txt
?? docs/assets/screenshots/crew-recovery/case3-clear-final-roster-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-clear-final-roster-Ver1.png.review.txt
?? docs/assets/screenshots/crew-recovery/case3-clear-final-roster-Ver1.png.vision.txt
?? docs/assets/screenshots/crew-recovery/case3-clear-option-7m8-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-clear-option-7m8-Ver2.png
?? docs/assets/screenshots/crew-recovery/case3-clear-option-7m8-Ver2.png.review.txt
?? docs/assets/screenshots/crew-recovery/case3-options-cost-breakdown-Ver2.png
?? docs/assets/screenshots/crew-recovery/case3-options-cost-breakdown-over-gh-Ver2.png
?? docs/assets/screenshots/crew-recovery/case3-options-executable-Ver2.png
?? docs/assets/screenshots/crew-recovery/case3-options-executable-Ver2.png.review.txt
?? docs/assets/screenshots/crew-recovery/case3-standby-ca-J4041-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-standby-ca-pool-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-standby-fo-J4042-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-cost-Ver2.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-cost-Ver3.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-cost-Ver4.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-cost-Ver5.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-cost-Ver6.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-cost-Ver7.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-preview-Ver2.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-preview-Ver3.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-preview-Ver4.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-preview-Ver5.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-preview-Ver6.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-preview-Ver7.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-reloaded-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-saved-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-saved-Ver2.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-saved-Ver3.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-saved-Ver4.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-saved-Ver5.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-saved-Ver6.png
?? docs/assets/screenshots/crew-recovery/case4-C4001-saved-Ver7.png
?? docs/assets/screenshots/crew-recovery/case4-C4002-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4002-cost-Ver2.png
?? docs/assets/screenshots/crew-recovery/case4-C4002-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4002-preview-Ver2.png
?? docs/assets/screenshots/crew-recovery/case4-C4002-reloaded-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4002-saved-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4002-saved-Ver2.png
?? docs/assets/screenshots/crew-recovery/case4-C4009-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4009-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4009-reloaded-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4009-saved-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-cost-Ver2.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-cost-Ver3.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-cost-Ver4.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-cost-Ver5.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-cost-Ver6.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-cost-Ver7.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-preview-Ver2.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-preview-Ver3.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-preview-Ver4.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-preview-Ver5.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-preview-Ver6.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-preview-Ver7.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-saved-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4011-saved-Ver2.png
?? docs/assets/screenshots/crew-recovery/case4-C4018-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4018-cost-Ver2.png
?? docs/assets/screenshots/crew-recovery/case4-C4018-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4018-preview-Ver2.png
?? docs/assets/screenshots/crew-recovery/case4-C4018-saved-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4019-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4019-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-C4019-saved-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-help-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-help-Ver2.png
?? docs/assets/screenshots/crew-recovery/case4-pairing-options-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-pairing-options-Ver2.png
?? docs/assets/screenshots/crew-recovery/case4-pairing-options-smoke-Ver2.png
?? docs/assets/screenshots/crew-recovery/case4-restored-initial-Ver1.png
?? docs/assets/screenshots/crew-recovery/case4-saved-open-pairing-Ver1.png
?? docs/assets/screenshots/crew-recovery/cases-1-3-readonly-J4002-152056-Ver1.png
?? docs/assets/screenshots/crew-recovery/cases-1-3-readonly-J4002-152056-Ver2.png
?? docs/assets/screenshots/crew-recovery/cases-1-3-readonly-J4002-152056-Ver3.png
?? docs/assets/screenshots/crew-recovery/cases-1-3-readonly-L3002-152227-Ver1.png
?? docs/assets/screenshots/crew-recovery/cases-1-3-readonly-L3002-152227-Ver2.png
?? docs/assets/screenshots/crew-recovery/cases-1-3-readonly-L3002-152227-Ver3.png
?? docs/assets/screenshots/crew-recovery/cases-1-3-readonly-L3002-152227-Ver4.png
?? docs/assets/screenshots/crew-recovery/cases-1-3-readonly-T2001-152675-Ver1.png
?? docs/assets/screenshots/crew-recovery/cases-1-3-readonly-T2001-152675-Ver2.png
?? docs/assets/screenshots/crew-recovery/cases-1-3-readonly-T2001-152675-Ver3.png
?? docs/assets/screenshots/crew-recovery/cases-1-3-readonly-T2001-152675-Ver4.png
?? docs/assets/screenshots/crew-recovery/s2-et-alert-center-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-et-recovery-fdp-discretion-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-et-recovery-flight-delay-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-et-recovery-standby-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-et-recovery-swap-duty-Ver1.png
?? docs/assets/screenshots/gantt/app-dialog-standard-Ver1.png
?? docs/assets/screenshots/gantt/dashboard-handover-added-Ver1.png
?? docs/assets/screenshots/gantt/dashboard-quicklink-live-Ver1.png
?? docs/assets/screenshots/gantt/dashboard-recovery-cases-Ver1.png
?? docs/assets/screenshots/gantt/help-recovery-recovery-case-003-Ver1.png.review.txt
?? docs/assets/screenshots/gantt/help-recovery-recovery-case-003-Ver1.png.vision.txt
?? docs/assets/screenshots/gantt/recovery-cost-catalogue-Ver10.png
?? docs/assets/screenshots/gantt/recovery-cost-catalogue-Ver11.png
?? docs/assets/screenshots/gantt/recovery-cost-catalogue-Ver5.png
?? docs/assets/screenshots/gantt/recovery-cost-catalogue-Ver6.png
?? docs/assets/screenshots/gantt/recovery-cost-catalogue-Ver7.png
?? docs/assets/screenshots/gantt/recovery-cost-catalogue-Ver8.png
?? docs/assets/screenshots/gantt/recovery-cost-catalogue-Ver9.png
?? docs/assets/screenshots/gantt/recovery-cost-delay-Ver10.png
?? docs/assets/screenshots/gantt/recovery-cost-delay-Ver11.png
?? docs/assets/screenshots/gantt/recovery-cost-delay-Ver5.png
?? docs/assets/screenshots/gantt/recovery-cost-delay-Ver6.png
?? docs/assets/screenshots/gantt/recovery-cost-delay-Ver7.png
?? docs/assets/screenshots/gantt/recovery-cost-delay-Ver8.png
?? docs/assets/screenshots/gantt/recovery-cost-delay-Ver9.png
?? docs/assets/screenshots/gantt/recovery-cost-guarantee-Ver10.png
?? docs/assets/screenshots/gantt/recovery-cost-guarantee-Ver11.png
?? docs/assets/screenshots/gantt/recovery-cost-guarantee-Ver5.png
?? docs/assets/screenshots/gantt/recovery-cost-guarantee-Ver6.png
?? docs/assets/screenshots/gantt/recovery-cost-guarantee-Ver7.png
?? docs/assets/screenshots/gantt/recovery-cost-guarantee-Ver8.png
?? docs/assets/screenshots/gantt/recovery-cost-guarantee-Ver9.png
?? docs/assets/screenshots/gantt/recovery-cost-membership-Ver10.png
?? docs/assets/screenshots/gantt/recovery-cost-membership-Ver11.png
?? docs/assets/screenshots/gantt/recovery-cost-membership-Ver5.png
?? docs/assets/screenshots/gantt/recovery-cost-membership-Ver6.png
?? docs/assets/screenshots/gantt/recovery-cost-membership-Ver7.png
?? docs/assets/screenshots/gantt/recovery-cost-membership-Ver8.png
?? docs/assets/screenshots/gantt/recovery-cost-membership-Ver9.png
?? docs/assets/screenshots/gantt/recovery-cost-standby-Ver10.png
?? docs/assets/screenshots/gantt/recovery-cost-standby-Ver11.png
?? docs/assets/screenshots/gantt/recovery-cost-standby-Ver5.png
?? docs/assets/screenshots/gantt/recovery-cost-standby-Ver6.png
?? docs/assets/screenshots/gantt/recovery-cost-standby-Ver7.png
?? docs/assets/screenshots/gantt/recovery-cost-standby-Ver8.png
?? docs/assets/screenshots/gantt/recovery-cost-standby-Ver9.png
?? docs/assets/screenshots/rule-studio-ver2/
?? docs/assets/screenshots/rule-studio/
?? docs/dev-context/2026-09-13-gantt-case3-8004-transfer-cost-pricing.md
?? docs/dev-context/2026-09-13-gantt-recovery-fdp-discretion-request.md
?? docs/dev-context/2026-09-13-gantt-recovery-help-case-002-et.md
?? docs/dev-context/2026-09-14-rois-ai-rule-studio-design.md
?? docs/dev-context/2026-09-14-rois-ai-rule-studio-ver2-design.md
?? docs/modules/crew-recovery/2026-09-13-recovery-fdp-discretion-request-Ver1.md
?? docs/modules/crew-recovery/2026-09-13-recovery-help-case-002-et-Ver1.md
?? docs/superpowers/plans/2026-09-14-recovery-case-004.md
?? docs/superpowers/specs/2026-09-13-app-popup-standard-status-card-Ver1.md
?? docs/superpowers/specs/2026-09-13-recovery-fdp-discretion-request-design.md
?? docs/superpowers/specs/2026-09-14-recovery-case-004-design-Ver1.md
?? docs/superpowers/specs/2026-09-14-rule-studio-Ver1/
?? docs/superpowers/specs/2026-09-14-rule-studio-Ver2/
?? docs/test-cases/crew-recovery/2026-09-13-S2-ET-discretion-send-reject-resend-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-14-case4-delivery-Ver1.md
?? e2e/config/case1.config.ts
?? e2e/config/case2.config.ts
?? e2e/config/case4-help.config.ts
?? e2e/config/case4.config.ts
?? e2e/config/cases-1-3-readonly.config.ts
?? e2e/output/recovery-cases-1-3-readonly/
?? e2e/tests/gantt/app-dialog-standard.spec.ts
?? e2e/tests/gantt/dashboard-recovery-cases.spec.ts
?? e2e/tests/gantt/recovery-case-001-standby.spec.ts
?? e2e/tests/gantt/recovery-case-002-fdp-discretion.spec.ts
?? e2e/tests/gantt/recovery-case-002-standby.spec.ts
?? e2e/tests/gantt/recovery-case-003-clear.spec.ts
?? e2e/tests/gantt/recovery-case-003-costs.spec.ts
?? e2e/tests/gantt/recovery-case-003-standby.spec.ts
?? e2e/tests/gantt/recovery-case-004-help.spec.ts
?? e2e/tests/gantt/recovery-case-004.spec.ts
?? e2e/tests/gantt/recovery-cases-1-3-readonly.spec.ts
?? gantt/public/help/screenshots/recovery-case4-moveup-preview-Ver1.png
?? gantt/public/help/screenshots/recovery-case4-pairing-options-Ver1.png
?? gantt/public/help/screenshots/recovery-case4-standby-cost-Ver1.png
?? gantt/public/help/screenshots/recovery-cost-catalogue-Ver10.png
?? gantt/public/help/screenshots/recovery-cost-catalogue-Ver11.png
?? gantt/public/help/screenshots/recovery-cost-catalogue-Ver5.png
?? gantt/public/help/screenshots/recovery-cost-catalogue-Ver6.png
?? gantt/public/help/screenshots/recovery-cost-catalogue-Ver7.png
?? gantt/public/help/screenshots/recovery-cost-catalogue-Ver8.png
?? gantt/public/help/screenshots/recovery-cost-catalogue-Ver9.png
?? gantt/public/help/screenshots/recovery-cost-delay-Ver10.png
?? gantt/public/help/screenshots/recovery-cost-delay-Ver11.png
?? gantt/public/help/screenshots/recovery-cost-delay-Ver5.png
?? gantt/public/help/screenshots/recovery-cost-delay-Ver6.png
?? gantt/public/help/screenshots/recovery-cost-delay-Ver7.png
?? gantt/public/help/screenshots/recovery-cost-delay-Ver8.png
?? gantt/public/help/screenshots/recovery-cost-delay-Ver9.png
?? gantt/public/help/screenshots/recovery-cost-guarantee-Ver10.png
?? gantt/public/help/screenshots/recovery-cost-guarantee-Ver11.png
?? gantt/public/help/screenshots/recovery-cost-guarantee-Ver5.png
?? gantt/public/help/screenshots/recovery-cost-guarantee-Ver6.png
?? gantt/public/help/screenshots/recovery-cost-guarantee-Ver7.png
?? gantt/public/help/screenshots/recovery-cost-guarantee-Ver8.png
?? gantt/public/help/screenshots/recovery-cost-guarantee-Ver9.png
?? gantt/public/help/screenshots/recovery-cost-membership-Ver10.png
?? gantt/public/help/screenshots/recovery-cost-membership-Ver11.png
?? gantt/public/help/screenshots/recovery-cost-membership-Ver5.png
?? gantt/public/help/screenshots/recovery-cost-membership-Ver6.png
?? gantt/public/help/screenshots/recovery-cost-membership-Ver7.png
?? gantt/public/help/screenshots/recovery-cost-membership-Ver8.png
?? gantt/public/help/screenshots/recovery-cost-membership-Ver9.png
?? gantt/public/help/screenshots/recovery-cost-standby-Ver10.png
?? gantt/public/help/screenshots/recovery-cost-standby-Ver11.png
?? gantt/public/help/screenshots/recovery-cost-standby-Ver5.png
?? gantt/public/help/screenshots/recovery-cost-standby-Ver6.png
?? gantt/public/help/screenshots/recovery-cost-standby-Ver7.png
?? gantt/public/help/screenshots/recovery-cost-standby-Ver8.png
?? gantt/public/help/screenshots/recovery-cost-standby-Ver9.png
?? gantt/public/help/screenshots/s2-et-entry-alert-center-Ver1.png
?? gantt/public/help/screenshots/s2-et-recovery-fdp-discretion-Ver1.png
?? gantt/public/help/screenshots/s2-et-recovery-fdp-discretion-Ver2.png
?? gantt/public/help/screenshots/s2-et-recovery-flight-delay-Ver1.png
?? gantt/public/help/screenshots/s2-et-recovery-standby-Ver1.png
?? gantt/public/help/screenshots/s2-et-recovery-standby-Ver2.png
?? gantt/public/help/screenshots/s2-et-recovery-swap-duty-Ver1.png
?? gantt/public/help/screenshots/s3-clear-after-alert-center-Ver1.png
?? gantt/public/help/screenshots/s3-clear-before-alert-center-Ver1.png
?? gantt/public/help/screenshots/s3-options-cost-breakdown-Ver1.png
?? gantt/public/help/screenshots/s3-options-executable-Ver2.png
?? gantt/public/help/screenshots/s3-options-executable-Ver3.png
?? gantt/src/components/help/topics/recovery/recovery-case-004.tsx
?? gantt/src/components/recovery/__tests__/fdp-discretion-action.test.ts
?? gantt/src/components/recovery/fdp-discretion-action.tsx
?? gantt/src/components/recovery/open-recovery-workspace.tsx
?? gantt/src/components/recovery/recovery-pairing-options.tsx
?? gantt/src/components/recovery/recovery-rotation-chart.tsx
?? gantt/src/components/shell/disruption-cases-panel.tsx
?? gantt/src/components/shell/shift-handover-panel.tsx
?? gantt/src/config/recovery-cases.ts
?? gantt/src/services/__tests__/open-pairing-recovery.test.ts
?? gantt/src/services/__tests__/open-recovery-save-reconcile.test.ts
?? gantt/src/services/__tests__/recovery-cost-batch.test.ts
?? gantt/src/services/open-pairing-recovery.ts
?? gantt/src/services/open-recovery-save-reconcile.ts
?? gantt/src/utils/open-recovery-case-in-live.ts
?? live-server/src/__tests__/routes/dashboard-handover.test.ts
?? live-server/src/__tests__/services/pairing/recovery-rotations.test.ts
?? live-server/src/models/dashboard/
?? live-server/src/routes/recovery/recovery-cost.test.ts
?? live-server/src/services/dashboard/handover-service.ts
?? live-server/src/services/pairing/recovery-rotations.ts
?? live-server/src/services/recovery/open-pairing-gh-cost.test.ts
?? live-server/src/services/recovery/open-pairing-gh-cost.ts
?? live-server/src/services/recovery/transfer-gh-cost.test.ts
?? live-server/src/services/recovery/transfer-gh-cost.ts
?? sim_01_login.png
?? sql/migration/2026-09-14-crew-control-handover-seed.sql
?? sql/migration/2026-09-14-crew-control-handover.sql
```

### unstaged changed files

```text
.agents/skills/145-crew-recovery-case-study/SKILL.md
CLAUDE.md
docs/assets/screenshots/crew-recovery/case3-options-applied-draft-Ver1.png
docs/assets/screenshots/crew-recovery/case3-options-cost-breakdown-Ver1.png
docs/assets/screenshots/crew-recovery/case3-options-executable-Ver1.png
docs/assets/screenshots/crew-recovery/case3-options-preview-Ver1.png
docs/assets/screenshots/crew-recovery/case3-options-saved-Ver1.png
docs/assets/screenshots/gantt/help-recovery-cases-Ver1.png
docs/assets/screenshots/gantt/help-recovery-recovery-case-002-Ver1.png
docs/assets/screenshots/gantt/help-recovery-recovery-case-003-Ver1.png
docs/dev-context/LATEST.md
docs/test-cases/crew-recovery/2026-09-13-case-003-preparation-Ver1.md
e2e/config/case3.config.ts
e2e/tests/gantt/help/help-recovery.spec.ts
gantt/src/components/dev/dev-skills-data.generated.ts
gantt/src/components/help/help-data.ts
gantt/src/components/help/help-view.tsx
gantt/src/components/help/topics/recovery/recovery-case-002.tsx
gantt/src/components/help/topics/recovery/recovery-case-003.tsx
gantt/src/components/panes/shared/roster-pane.tsx
gantt/src/components/recovery/recovery-cost-breakdown-dialog.tsx
gantt/src/components/recovery/recovery-violation-dialog.tsx
gantt/src/components/roster/context-menu.tsx
gantt/src/components/scenario-gantt/cross-rank-confirm-dialog.tsx
gantt/src/components/shell/dashboard-view.tsx
gantt/src/services/__tests__/recovery-candidates.test.ts
gantt/src/services/__tests__/recovery-swap-gh.test.ts
gantt/src/services/__tests__/recovery-trigger.test.ts
gantt/src/services/dashboard-service.ts
gantt/src/services/recovery-api.ts
gantt/src/services/recovery-candidates.ts
gantt/src/services/roundtrip-api.ts
gantt/src/utils/assign-pairing-op.ts
gantt/src/utils/gantt-test-hook.ts
gantt/src/version.ts
live-server/src/__tests__/unit/crew-absence-history-route.test.ts
live-server/src/models/index.ts
live-server/src/routes/dashboard/dashboard.ts
live-server/src/routes/pairing/pairing.ts
live-server/src/routes/recovery/recovery-cost.ts
live-server/src/services/crew-notify/__tests__/discretion-consent-service.test.ts
live-server/src/services/crew-notify/discretion-consent-service.ts
live-server/src/services/pairing/roundtrip-service.ts
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
2. 本文件：`docs/dev-context/2026-09-14-gantt-recovery-case4-complete.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
