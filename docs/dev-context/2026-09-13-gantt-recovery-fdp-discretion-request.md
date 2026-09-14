# 开发上下文（2026-09-13）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-13 23:50:22 PDT
- Wing：`gantt`
- Topic：`recovery-fdp-discretion-request`
- Title：recovery-fdp-discretion-request
- Git branch：`main`

## 本轮对话上下文

Recovery UI now lets the controller request the crew FDP-discretion agreement from the option row. No commit/push.

SHIPPED
- New gantt/src/components/recovery/fdp-discretion-action.tsx: deriveFdpConsentStatus / fdpConsentStatusLabel / fdpConsentActionLabel / fdpConsentNeedsFallback, FdpConsentChip, FdpDiscretionActionButton, useFdpDiscretionConsent (loads GET /crew-app/v1/discretion-duty/:pairingId/:dutySeq, POST /crew-app/v1/discretion-requests, GET .../discretion-requests/:proposalId for refresh) + the request dialog (extension minutes, reply deadline UTC, reason).
- recovery-violation-dialog.tsx: FDP Discretion option row now renders a status chip + a Request/Resend action in the ACTIONS cell BEFORE the Preview button; the dialog lifts fdpConsentStatus so the Standby group shows "Recommended next" after a rejection/expiry, with an inline hint + one-click switch. FDP rows use a wider ACTIONS grid (literal Tailwind classes so the scanner keeps them).
- live-server/src/services/crew-notify/discretion-consent-service.ts: prepareConsent derives the operated FDP from the authoritative duty window when duty_act_fdp_min is empty (was a hard 409 for app-built pairings).
- Statuses: not-sent / sent / partial / accepted / rejected / expired / superseded, all tooltipped with "Crew agreement communication only; Apply remains disabled until independent FDP legality execution is implemented."
- FRONTEND_VERSION 456, BACKEND_VERSION 232. Help case-002 steps 5-6 + overview + 2 refreshed screenshots (Ver2). New spec e2e/tests/gantt/recovery-case-002-fdp-discretion.spec.ts.

VERIFIED (all PASS)
- gantt vitest src/components/recovery/__tests__ (6), live-server vitest discretion-consent-service.test.ts (8, incl. the new derived-FDP case), the new Playwright spec (1/1: action before Preview via boundingBox().x, Crew rejected chip, Standby fallback hint, Recommended next badge), help suite 75/75, case3-options spec 1/1 (no regression), npm run check:ui 0 hard violations, gantt tsc only the pre-existing service-status-pill errors, git diff --check.

FIXTURE (SIT)
- .local/s2-et-consent/prepare-consent-duty.cjs stamps pairing 152675 duty 1 duty_act_fdp_min=855 (restore-consent-duty.cjs reverts). T2001 has two rejected proposals for this duty so the row shows a real "Crew rejected".
- The live-server watcher restarted during this work; it is running again on :3000 (session started with pnpm run dev).

OPEN FINDING — do NOT just delay the last leg
check-3007 reads duty_sch_fdp_min (live-server/scripts/legality-recheck-core.mjs fdpMin: r.duty_sch_fdp_min) and the delay propagation overwrites that same column with the post-delay duty period; the consent proposal reads duty_sch_fdp_min as before and duty_act_fdp_min as after. So a genuine 3007 and a non-zero before->after delta cannot both hold unless check-3007 reads the operated FDP (coalesce(duty_act_fdp_min, duty_sch_fdp_min)) and the planned column keeps the pre-delay value. That is a legality-engine input change and needs the C++ parity owner. Delaying duty-1 last leg ET2682 would also cut the duty-1 -> duty-2 rest to ~9h45; delaying the pairing's last leg ET2684 avoids rest but firstDutySeq means the FDP row proposes duty 1. Recommendation: option 2 (recheck reads the operated FDP). Record: docs/modules/crew-recovery/2026-09-13-recovery-fdp-discretion-request-Ver1.md, design docs/superpowers/specs/2026-09-13-recovery-fdp-discretion-request-design.md.

## 当前工作树快照

### git status --short

```text
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
 M gantt/src/components/help/help-data.ts
 M gantt/src/components/help/topics/recovery/recovery-case-002.tsx
 M gantt/src/components/help/topics/recovery/recovery-case-003.tsx
 M gantt/src/components/recovery/recovery-violation-dialog.tsx
 M gantt/src/components/scenario-gantt/cross-rank-confirm-dialog.tsx
 M gantt/src/services/__tests__/recovery-candidates.test.ts
 M gantt/src/services/__tests__/recovery-swap-gh.test.ts
 M gantt/src/services/recovery-api.ts
 M gantt/src/services/recovery-candidates.ts
 M gantt/src/version.ts
 M live-server/src/__tests__/unit/crew-absence-history-route.test.ts
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
?? docs/assets/screenshots/crew-recovery/case2-fdp-discretion-rejected-Ver1.png
?? docs/assets/screenshots/crew-recovery/case2-fdp-discretion-rejected-Ver1.png.review.txt
?? docs/assets/screenshots/crew-recovery/case2-fdp-discretion-rejected-Ver1.png.vision.txt
?? docs/assets/screenshots/crew-recovery/case2-fdp-request-dialog-Ver1.png
?? docs/assets/screenshots/crew-recovery/case2-fdp-standby-recommended-Ver1.png
?? docs/assets/screenshots/crew-recovery/case2-fdp-standby-recommended-Ver1.png.review.txt
?? docs/assets/screenshots/crew-recovery/case2-fdp-standby-recommended-Ver1.png.vision.txt
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
?? docs/assets/screenshots/crew-recovery/case3-standby-fo-J4042-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-et-alert-center-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-et-recovery-fdp-discretion-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-et-recovery-flight-delay-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-et-recovery-standby-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-et-recovery-swap-duty-Ver1.png
?? docs/assets/screenshots/gantt/app-dialog-standard-Ver1.png
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
?? docs/dev-context/2026-09-13-gantt-case3-8004-transfer-cost-pricing.md
?? docs/dev-context/2026-09-13-gantt-recovery-help-case-002-et.md
?? docs/modules/crew-recovery/2026-09-13-recovery-fdp-discretion-request-Ver1.md
?? docs/modules/crew-recovery/2026-09-13-recovery-help-case-002-et-Ver1.md
?? docs/superpowers/specs/2026-09-13-app-popup-standard-status-card-Ver1.md
?? docs/superpowers/specs/2026-09-13-recovery-fdp-discretion-request-design.md
?? docs/test-cases/crew-recovery/2026-09-13-S2-ET-discretion-send-reject-resend-Ver1.md
?? e2e/tests/gantt/app-dialog-standard.spec.ts
?? e2e/tests/gantt/recovery-case-002-fdp-discretion.spec.ts
?? e2e/tests/gantt/recovery-case-003-clear.spec.ts
?? e2e/tests/gantt/recovery-case-003-costs.spec.ts
?? e2e/tests/gantt/recovery-case-003-standby.spec.ts
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
?? gantt/src/components/recovery/__tests__/fdp-discretion-action.test.ts
?? gantt/src/components/recovery/fdp-discretion-action.tsx
?? gantt/src/services/__tests__/recovery-cost-batch.test.ts
?? live-server/src/services/recovery/transfer-gh-cost.test.ts
?? live-server/src/services/recovery/transfer-gh-cost.ts
?? sim_01_login.png
```

### unstaged changed files

```text
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
gantt/src/components/help/help-data.ts
gantt/src/components/help/topics/recovery/recovery-case-002.tsx
gantt/src/components/help/topics/recovery/recovery-case-003.tsx
gantt/src/components/recovery/recovery-violation-dialog.tsx
gantt/src/components/scenario-gantt/cross-rank-confirm-dialog.tsx
gantt/src/services/__tests__/recovery-candidates.test.ts
gantt/src/services/__tests__/recovery-swap-gh.test.ts
gantt/src/services/recovery-api.ts
gantt/src/services/recovery-candidates.ts
gantt/src/version.ts
live-server/src/__tests__/unit/crew-absence-history-route.test.ts
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
2. 本文件：`docs/dev-context/2026-09-13-gantt-recovery-fdp-discretion-request.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
