# S1 — Headed controller walkthrough

Date: 2026-09-12, America/Vancouver. Real authenticated Chrome controlled with Playwright CDP on this Mac; public Live UI, Ryan account. No synthetic UI screenshots. This continues the J4002/ADD/152056 incident, not the historical failed absence-request submission.

## Scope and outcome

- Standby candidates J4011, J4012, J4013: selection, exact GH price breakdown, and before/after preview PASS.
- J4005 swap and flight delay: selectable proposals and previews PASS. **Not Apply/Save tested in this walkthrough.**
- J4011 standby: Apply (3 draft operations), Save (draft count zero), reload (six target legs, no source legs), persisted ASBY exception PASS.
- Reset: exact active roster, source/donor flights and composition match the pre-walkthrough manifest, excluding updated audit fields. UI shows source six legs, recoverable overlap, and zero draft operations.
- Browser left open on Alert Center for replay. No CCX, APIS, manifest reissue, transport cancellation, crew acceptance, or payroll posting is claimed.

## Roles and fixture

Controller: Ryan. Unavailable crew: J4002 Getnet Kifle, ADD captain, 7M8. Source pairing 152056: ET805/ET802/ET378/ET377/ET803/ET804, September 24–25. Prepared overlapping SL row 1355350, September 24 00:15–12:15 UTC; original source assignment rows 1355154–1355159.

This walkthrough begins at the existing overlap; it does **not** replay crew-mobile SL submission. The temporary SL is intentionally retained as the immediate replay trigger after this walkthrough, not described as a user-created mobile request. Final full-case cleanup must remove only this owned SL via the normal roster API. Prepared reserve and donor duties remain available.

| Candidate | Saved September credit before | Projected payable credit after | Incremental GH quote |
|---|---:|---:|---:|
| J4011 | 08:00 | 20:20 | USD 0.00 |
| J4012 | 76:35 | 88:55 | USD 470.00 |
| J4013 | 87:05 | 99:25 | USD 1,762.50 |

These are full-calendar-month saved planned credits, not already-flown hours or RP MCred. Existing ASBY credit is 04:00; calculation adds pairing 15:15 and payable callout standby 01:05, subtracting the already credited 04:00. Projected credit is a cost-policy calculation, not a promise that Save posts that exact manday/payroll total. J4013's former 88:30 fixture was adjusted to avoid a new consecutive-days violation.

## Step-by-step evidence

All image filenames below are under `docs/assets/screenshots/crew-recovery/`.

| Step | Crew control | Crew | Module/model | Exact action and observed result | Snapshot / remark |
|---|---|---|---|---|---|
| 1 | Ryan via Playwright | J4002/J4011 | Live roster + saved records | Verify previous standby execution before resetting. Six legs had transferred. A test incorrectly asserted preview-only `isCalloutStandby`; authoritative saved `exceptionCode` was correct. | Test assertion corrected in new save walkthrough; no product change claimed. |
| 2 | Test operator | J4002/J4011 | Scoped SQL restore, Redis, existing Rust manday driver | Lock and validate exact owned source/target rows; soft-delete test target legs, reactivate original source legs, clear ASBY exception, recompute coverage and invalidate affected caches. Preserve neighbouring duties. | Private manifests under `.local/s1-gh/`; not a controller UI action. |
| 3 | Ryan | J4002 | Live → Alert Center, rule 1001 | Reload, apply existing filters, click Alert Center. Observe recoverable SL/FLY overlap on September 24. | `s1-headed-start-alert-Ver1.png` |
| 4 | Ryan | J4002 | Alert Center → Recovery | Check J4002's recoverable row, click Recovery selected, choose Standby Crew callout. Wait for three executable candidates and exact quotes. | `s1-gh-standby-list-Ver5.png` |
| 5 | Ryan | J4011 | Recovery + GH Cost Library | Check J4011; click cost amount; inspect USD 0.00, credit and policy notes; close breakdown; click Preview; inspect before/after; click Options. | `s1-gh-J4011-cost-Ver2.png`, `s1-gh-J4011-preview-Ver2.png` |
| 6 | Ryan | J4012 | Same | Repeat selection, cost breakdown and preview. USD 470.00; 76:35 → 88:55. | `s1-gh-J4012-cost-Ver2.png`, `s1-gh-J4012-preview-Ver2.png` |
| 7 | Ryan | J4013 | Same | Repeat selection, cost breakdown and preview. USD 1,762.50; 87:05 → 99:25. | `s1-gh-J4013-cost-Ver2.png`, `s1-gh-J4013-preview-Ver2.png` |
| 8 | Ryan | J4005 + J4002 | Recovery → Swap duty | Select J4005; observe same base/rank, executable, two removals and two additions. Preview both rosters, return to Options. Price is Unpriced, not zero. | `s1-headed-swap-selection-Ver3.png`, `s1-headed-swap-preview-Ver1.png` |
| 9 | Ryan | J4002 | Recovery → Flight Delay | Open delay proposal; inspect all six timing changes; Preview, then Options. ET805 05:10Z → 13:16Z, +08:06. | `s1-headed-delay-selection-Ver1.png`, `s1-headed-delay-preview-Ver1.png` |
| 10 | Ryan | J4011 | Recovery → Standby Crew callout | Return to standby, explicitly check J4011 as execution target. | `s1-headed-final-standby-choice-Ver1.png` |
| 11 | Ryan | J4002/J4011 | Recovery → draft store | Click Apply selected option. Assert 3 draft operations. This is not yet saved. | `s1-headed-standby-draft-Ver1.png` |
| 12 | Ryan | J4002/J4011 | Live → Save | Click Save; wait for draft count zero. Reload, assert J4011 owns six source pairing legs and J4002 none. Read ASBY 1355089 and assert `exceptionCode=CALLOUT_STANDBY`. | `s1-headed-standby-saved-Ver1.png`, `s1-headed-standby-reloaded-Ver1.png` |
| 13 | Test operator | J4002/J4011 | Scoped reset + Rust manday | New target rows 1355363–1355368 were verified against before/after manifests, then soft-deleted; source rows restored and ASBY flag cleared. Restore policy is audit-preserving, not history erasure. | `.local/s1-gh/headed-option1-reset-receipt.json` |
| 14 | Ryan | J4002 | Live → Alert Center | Reload, verify source six legs and recoverable alert. Assert zero draft. Compare all 88 active scoped roster rows and source/donor flight/composition data against baseline, ignoring only update audit fields. | `s1-headed-restored-Ver1.png` |

## Operational gaps to explain in the client demo

1. Delay keeps the original crew after the recorded ground-task end (+01:01); it does not wait for reserve-pool refresh. A recorded SL end is not medical fitness confirmation.
2. Swap/delay prices are Unpriced. The star is the lowest **priced estimate**, not proof of a complete composite-score optimum.
3. Cost estimates exclude non-pay disruption costs; existing soft roster findings remain. Executable in the current Recovery gate is not full operational certification.
4. Swap/delay committed execution and full final SL cleanup remain outstanding for the complete case study.
5. Temporary test-runner Preview selectors twice matched background preview controls and timed out without mutation. Fixed by scoping to the Recovery dialog and exact button name. The successful run is recorded separately; screenshots retain versions.

## Commands and receipts

- `node .local/s1-gh/headed-walkthrough.cjs` — PASS all three standby selections, price breakdowns and previews; 650 ms slow motion plus six-second screenshot pauses.
- `node .local/s1-gh/headed-other-options.cjs` — initial selector FAIL (no saved changes); corrected rerun PASS swap/delay previews and return to J4011.
- `node .local/s1-gh/headed-save-standby.cjs` — PASS Apply, Save, reload and persisted exception assertion.
- `node .local/s1-gh/reset-headed-option1.cjs` — PASS exact owned-record restore and cache invalidation.
- `node --import ./live-server/node_modules/tsx/dist/loader.mjs .local/s1-gh/recompute.cjs` — PASS authoritative full-month credit recomputation for three standby crews.
- `node .local/s1-options/ui.cjs` — PASS restored source assignments and recoverable alert.
- Additional read-only manifest equality and final UI no-draft assertions — PASS.

These local scripts contain case-specific IDs; never reuse them as a generic cleanup command. No application code was edited in this walkthrough. Earlier GH implementation and Help delivery have separate outstanding checks.
