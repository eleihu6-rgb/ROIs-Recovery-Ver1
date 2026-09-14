# Case 4 — shared By cost tier navigation

## Delivered

Case4 now injects the **same PlanTree** as Cases1–3 after pairing creation.
Includes By strategy, By cost tier, method counts and the cheapest-method star.
No duplicate tier rules or alternative Case4 navigation implementation.

Cost tiers group **methods by their cheapest priced executable candidate**, not
individual candidate prices. A method selected under USD0 still shows its higher-cost
crew alternatives. This exactly retains legacy semantics. Unpriced, pending and
failed candidates never establish a tier minimum; mixed currencies are not compared.
Before construction, Pairing Options remains first and staffing remains disabled.

Current read-only fixture152689: Standby under USD0, Available Crew USD410 and
Move-up USD2470 under USD0–10k. The standby list retains C4006 USD326.25 when
selected through the USD0 leaf. Prior real-roster GH preparation remains intact.

## Verification

From gantt:
- `npx vitest run src/components/recovery/__tests__/recovery-plan-tree.test.tsx src/services/__tests__/open-recovery-presentation.test.ts src/services/__tests__/recovery-candidates.test.ts` — PASS32.
  New tests cover minimum-cost grouping, method selection, unpriced/failed/pending,
  mixed currencies, disabled loading controls and preservation of candidates.
- `npx tsc --noEmit` — FAIL only the same3 existing service-status-pill.tsx
  ServiceEntry.livePort/SystemStatus.checkedAt errors. No recovery errors.

From e2e:
- `npx playwright test -c config/case4-standard.config.ts` — PASS1, all three
  cost-tier leaves select the corresponding real method; cost/detail/preview pass.
- `RUN_CASES_1_3_READONLY=1 npx playwright test -c config/cases-1-3-readonly.config.ts`
  — PASS3 legacy recovery entries and costed options.
- `npx playwright test -c config/case4-help.config.ts` — PASS1, including the final added cost-tier screenshot.

From root:
- `npm run check:ui` — PASS0 hard/124 existing warnings.
- `git diff --check` — PASS.
- Skill145 quick_validate — PASS.

## Screenshots inspected

`docs/assets/screenshots/crew-recovery/case4-by-cost-tier-Ver1.png` — shared left
rail, real method prices, star, and unchanged higher-cost standby alternatives.
Legacy J4002/152056 Ver6, T2001/152675 Ver7, L3002/152227 Ver7 screenshots inspected;
Help Ver7 and final Ver8 inspected. Final Help revalidation also checks the new cost-tier image.

Help and skill145 explicitly explain method-minimum semantics. Existing legacy
best-cost fallback for non-executable group summaries was noted by the supporting
read-only agent; tier membership already excludes those candidates and that unrelated
fallback was not changed. Primary implemented/reviewed the integration and evidence.

No DB business writes, Apply, Save or reset in this navigation follow-up. User pairing
and the seven-crew real-roster GH fixture are retained. No commit/push.
