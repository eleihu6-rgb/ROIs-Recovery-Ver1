# 开发上下文（2026-09-13）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-13 19:43:59 PDT
- Wing：`gantt`
- Topic：`recovery-help-case-002-et`
- Title：recovery-help-case-002-et
- Git branch：`main`

## 本轮对话上下文

Recovery Help Case study 2 rewritten from the synthetic PI201/PI202 HKG-SIN narrative to the real ET/ADD published-delay case. No commit/push.

CASE 2 IS NOW THE ET CASE (verified on the live stack: gantt :5567, live-server :3000, f8_sit_live):
- Pairing 152675, base ADD, div P, B787, 2 duties / 4 segments.
- Flights ET2681 ADD-DXB + ET2682 DXB-ADD (duty 1, 29 Sep 2026), ET2683 ADD-JNB + ET2684 JNB-ADD (duty 2, 30 Sep 2026).
- Crew T2001 (CA), T2021 (FO), T2022 (FO). Dialog header "Rule 3007 / ET2681 / 2026-09-29 - 3 Crew, 1 Roster".
- Entry points: Alert Center (3 synthetic published-delay 3007 rows for the 3 crew -> tick -> Recovery selected), Pairing right-click, Roster right-click.
- Recovery dialog methods: FDP Discretion 1, Standby Crew callout 4 Executable / 2 Filtered, Swap duty 3 (J4021 Executable; K1014/K1015 Blocked), Flight Delay 0.
- Standby GH costs (saved calendar-month deltas): T2002 0.00, T2003 240.00, T2004 675.00, T2005 1,350.00 USD.
- Swap candidates all Unpriced, with fleet-mismatch warnings.

FILES: recovery-case-002.tsx rewritten (10 steps, 5 screenshots); help-data.ts Case 2 title/overview; gantt/public/help/screenshots/s2-et-*.png (5 real-UI captures); help-recovery.spec.ts image count 4->5 + new text/search assertions; FRONTEND_VERSION 453->454. Verification record: docs/modules/crew-recovery/2026-09-13-recovery-help-case-002-et-Ver1.md.

VERIFIED: e2e help suite PASS 75/75 (incl. help-recovery and the no-404 sweep over the 5 new PNGs); npm run check:ui PASS 0 hard violations; gantt tsc only the pre-existing service-status-pill errors; git diff --check PASS.

DO NOT RE-LITIGATE / BOUNDARIES:
- Case 2 stays Partial. FDP Discretion is communication only (Apply disabled until independent FDP legality execution is implemented).
- Flight Delay group is empty for a published-delay trigger: recovery-candidates.ts only builds a delay plan when trigger === 'assignment-overlap'; visiblePlanGroups still lists the group for published-delay-fdp.
- The three 3007 Alert Center rows for this pairing are frontend published-delay rows (from actual > scheduled), NOT persisted rule_violation FDP-exceedance rows (DB has no 3007 row for T2001/T2021/T2022).
- The ET2681 delay is fixture data in SIT. No Apply/Save/recheck demonstrated for Case 2.
- Candidate counts move with the loaded roster window; Help text says so instead of freezing numbers.

## 当前工作树快照

### git status --short

```text
 M CLAUDE.md
 M docs/assets/screenshots/gantt/help-recovery-cases-Ver1.png
 M docs/assets/screenshots/gantt/help-recovery-recovery-case-002-Ver1.png
 M docs/assets/screenshots/gantt/help-recovery-recovery-case-003-Ver1.png
 M docs/test-cases/crew-recovery/2026-09-13-case-003-preparation-Ver1.md
 M e2e/config/case3.config.ts
 M e2e/tests/gantt/help/help-recovery.spec.ts
 M gantt/src/components/help/help-data.ts
 M gantt/src/components/help/topics/recovery/recovery-case-002.tsx
 M gantt/src/components/help/topics/recovery/recovery-case-003.tsx
 M gantt/src/components/scenario-gantt/cross-rank-confirm-dialog.tsx
 M gantt/src/services/__tests__/recovery-swap-gh.test.ts
 M gantt/src/services/recovery-api.ts
 M gantt/src/services/recovery-candidates.ts
 M gantt/src/version.ts
 M live-server/src/__tests__/unit/crew-absence-history-route.test.ts
 M live-server/src/routes/recovery/recovery-cost.ts
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
?? docs/assets/screenshots/crew-recovery/case3-clear-baseline-alert-center-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-clear-final-alert-center-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-clear-final-alert-center-Ver1.png.review.txt
?? docs/assets/screenshots/crew-recovery/case3-clear-final-alert-center-Ver1.png.vision.txt
?? docs/assets/screenshots/crew-recovery/case3-clear-final-roster-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-clear-final-roster-Ver1.png.review.txt
?? docs/assets/screenshots/crew-recovery/case3-clear-final-roster-Ver1.png.vision.txt
?? docs/assets/screenshots/crew-recovery/case3-clear-option-7m8-Ver1.png
?? docs/assets/screenshots/crew-recovery/case3-options-cost-breakdown-Ver2.png
?? docs/assets/screenshots/crew-recovery/case3-options-cost-breakdown-over-gh-Ver2.png
?? docs/assets/screenshots/crew-recovery/case3-options-executable-Ver2.png
?? docs/assets/screenshots/crew-recovery/s2-et-alert-center-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-et-recovery-fdp-discretion-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-et-recovery-flight-delay-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-et-recovery-standby-Ver1.png
?? docs/assets/screenshots/crew-recovery/s2-et-recovery-swap-duty-Ver1.png
?? docs/assets/screenshots/gantt/app-dialog-standard-Ver1.png
?? docs/assets/screenshots/gantt/help-recovery-recovery-case-003-Ver1.png.review.txt
?? docs/assets/screenshots/gantt/help-recovery-recovery-case-003-Ver1.png.vision.txt
?? docs/assets/screenshots/gantt/recovery-cost-catalogue-Ver5.png
?? docs/assets/screenshots/gantt/recovery-cost-catalogue-Ver6.png
?? docs/assets/screenshots/gantt/recovery-cost-catalogue-Ver7.png
?? docs/assets/screenshots/gantt/recovery-cost-delay-Ver5.png
?? docs/assets/screenshots/gantt/recovery-cost-delay-Ver6.png
?? docs/assets/screenshots/gantt/recovery-cost-delay-Ver7.png
?? docs/assets/screenshots/gantt/recovery-cost-guarantee-Ver5.png
?? docs/assets/screenshots/gantt/recovery-cost-guarantee-Ver6.png
?? docs/assets/screenshots/gantt/recovery-cost-guarantee-Ver7.png
?? docs/assets/screenshots/gantt/recovery-cost-membership-Ver5.png
?? docs/assets/screenshots/gantt/recovery-cost-membership-Ver6.png
?? docs/assets/screenshots/gantt/recovery-cost-membership-Ver7.png
?? docs/assets/screenshots/gantt/recovery-cost-standby-Ver5.png
?? docs/assets/screenshots/gantt/recovery-cost-standby-Ver6.png
?? docs/assets/screenshots/gantt/recovery-cost-standby-Ver7.png
?? docs/dev-context/2026-09-13-gantt-case3-8004-transfer-cost-pricing.md
?? docs/modules/crew-recovery/2026-09-13-recovery-help-case-002-et-Ver1.md
?? docs/superpowers/specs/2026-09-13-app-popup-standard-status-card-Ver1.md
?? e2e/tests/gantt/app-dialog-standard.spec.ts
?? e2e/tests/gantt/recovery-case-003-clear.spec.ts
?? e2e/tests/gantt/recovery-case-003-costs.spec.ts
?? gantt/public/help/screenshots/recovery-cost-catalogue-Ver5.png
?? gantt/public/help/screenshots/recovery-cost-catalogue-Ver6.png
?? gantt/public/help/screenshots/recovery-cost-catalogue-Ver7.png
?? gantt/public/help/screenshots/recovery-cost-delay-Ver5.png
?? gantt/public/help/screenshots/recovery-cost-delay-Ver6.png
?? gantt/public/help/screenshots/recovery-cost-delay-Ver7.png
?? gantt/public/help/screenshots/recovery-cost-guarantee-Ver5.png
?? gantt/public/help/screenshots/recovery-cost-guarantee-Ver6.png
?? gantt/public/help/screenshots/recovery-cost-guarantee-Ver7.png
?? gantt/public/help/screenshots/recovery-cost-membership-Ver5.png
?? gantt/public/help/screenshots/recovery-cost-membership-Ver6.png
?? gantt/public/help/screenshots/recovery-cost-membership-Ver7.png
?? gantt/public/help/screenshots/recovery-cost-standby-Ver5.png
?? gantt/public/help/screenshots/recovery-cost-standby-Ver6.png
?? gantt/public/help/screenshots/recovery-cost-standby-Ver7.png
?? gantt/public/help/screenshots/s2-et-entry-alert-center-Ver1.png
?? gantt/public/help/screenshots/s2-et-recovery-fdp-discretion-Ver1.png
?? gantt/public/help/screenshots/s2-et-recovery-flight-delay-Ver1.png
?? gantt/public/help/screenshots/s2-et-recovery-standby-Ver1.png
?? gantt/public/help/screenshots/s2-et-recovery-swap-duty-Ver1.png
?? gantt/public/help/screenshots/s3-clear-after-alert-center-Ver1.png
?? gantt/public/help/screenshots/s3-clear-before-alert-center-Ver1.png
?? gantt/public/help/screenshots/s3-options-cost-breakdown-Ver1.png
?? gantt/public/help/screenshots/s3-options-executable-Ver2.png
?? gantt/src/services/__tests__/recovery-cost-batch.test.ts
?? live-server/src/services/recovery/transfer-gh-cost.test.ts
?? live-server/src/services/recovery/transfer-gh-cost.ts
?? sim_01_login.png
```

### unstaged changed files

```text
CLAUDE.md
docs/assets/screenshots/gantt/help-recovery-cases-Ver1.png
docs/assets/screenshots/gantt/help-recovery-recovery-case-002-Ver1.png
docs/assets/screenshots/gantt/help-recovery-recovery-case-003-Ver1.png
docs/test-cases/crew-recovery/2026-09-13-case-003-preparation-Ver1.md
e2e/config/case3.config.ts
e2e/tests/gantt/help/help-recovery.spec.ts
gantt/src/components/help/help-data.ts
gantt/src/components/help/topics/recovery/recovery-case-002.tsx
gantt/src/components/help/topics/recovery/recovery-case-003.tsx
gantt/src/components/scenario-gantt/cross-rank-confirm-dialog.tsx
gantt/src/services/__tests__/recovery-swap-gh.test.ts
gantt/src/services/recovery-api.ts
gantt/src/services/recovery-candidates.ts
gantt/src/version.ts
live-server/src/__tests__/unit/crew-absence-history-route.test.ts
live-server/src/routes/recovery/recovery-cost.ts
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
2. 本文件：`docs/dev-context/2026-09-13-gantt-recovery-help-case-002-et.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
