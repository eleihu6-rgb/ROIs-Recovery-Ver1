# 开发上下文（2026-09-14）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-14 10:18:06 PDT
- Wing：`rois-ai`
- Topic：`rule-studio-ver2-design`
- Title：Rule Studio Guided Workbench Ver 2
- Git branch：`main`

## 本轮对话上下文

User selected Guided Workbench and requested a separate Ver 2 (correcting an initial Ver 1 request). Created docs/superpowers/specs/2026-09-14-rule-studio-Ver2/; preserved every original Ver 1 file, checked via SHA-256 manifest in new package. No product implementation authorized or performed.
Three steps: Define rule (intake/matching/modify-copy-new, mandatory Base Rank Fleet Crew Team patterned on 8056, table parameter guides, clarification, visual logic, enforcement); Define test cases (24 examples plus optimizer scope and runtime/per-call budgets); Build and test (basic progress, expandable illustrative skeleton and Git concepts/compare, automatic return to results, retained unique run attempts, GIF/static prototype replays). User also requested one-click item citations into LLM chat and optimizer tolerance of existing violations. Both included.
Tolerance proposal: immutable complete pre-run findings under same rule/params/group/scope. Match stable crew/rule/window identity and magnitude; allow unchanged/improved inherited finding; reject new/worsened findings even when total count is unchanged. Keep inherited warnings visible, not called fully legal. Missing/stale baseline blocks and requires recapture. Rule legality and planner Hard/Soft/Password exception policy remain distinct.
Source research: 8056 scope fields and param-format validation confirmed; current severity Soft/Overridable/Hard exists but no password capture in confirmation UI. Password authorization is a future design extension. Supporting read-only source research reviewed by primary agent.
Verification: node verify.cjs in new package PASS with three-step workflows, citations, tolerance modes, auto results, fail/performance/cancel, retained history, stale lock and comparison. All final screenshot paths under docs/assets/screenshots/rule-studio-ver2 listed in verification.json and visually inspected. 24 GIFs encode three captured prototype frames each, all validated; selected frames visually reviewed. Replays are fixed initial Hard-policy demo fixtures, not real Gantt/Rust evidence or live parameter-dependent capture. npm run check:ui PASS 0 hard,124 prior warnings. check-artifacts.py PASS links/whitespace/assets/old-package preservation. README records exact commands and limitations. No real engine or optimizer execution, Git commit/push or data writes. Preserve existing LATEST.md contents belonging to concurrent work.

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
?? docs/assets/screenshots/crew-recovery/case4-pairing-options-smoke-Ver2.png
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
?? docs/modules/crew-recovery/2026-09-13-recovery-fdp-discretion-request-Ver1.md
?? docs/modules/crew-recovery/2026-09-13-recovery-help-case-002-et-Ver1.md
?? docs/superpowers/plans/2026-09-14-recovery-case-004.md
?? docs/superpowers/specs/2026-09-13-app-popup-standard-status-card-Ver1.md
?? docs/superpowers/specs/2026-09-13-recovery-fdp-discretion-request-design.md
?? docs/superpowers/specs/2026-09-14-recovery-case-004-design-Ver1.md
?? docs/superpowers/specs/2026-09-14-rule-studio-Ver1/
?? docs/superpowers/specs/2026-09-14-rule-studio-Ver2/
?? docs/test-cases/crew-recovery/2026-09-13-S2-ET-discretion-send-reject-resend-Ver1.md
?? e2e/config/case1.config.ts
?? e2e/config/case2.config.ts
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
?? e2e/tests/gantt/recovery-case-004.spec.ts
?? e2e/tests/gantt/recovery-cases-1-3-readonly.spec.ts
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
?? gantt/src/services/__tests__/recovery-cost-batch.test.ts
?? gantt/src/services/open-pairing-recovery.ts
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
2. 本文件：`docs/dev-context/2026-09-14-rois-ai-rule-studio-ver2-design.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
