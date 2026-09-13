# S1 continuation — make the existing 1001 alternatives selectable

Status: **setup and independent selection/preview PASS; recovery Apply/Save not tested in this continuation**.
Environment: https://cr.rois.one/altair/live, Ryan, F8_SIT_LIVE, observed B252/F454/R40. All times below UTC; Gantt displays ADD local time (UTC+3).

## New baseline — do not run the previous absence reset

Ryan created SL `1354958` for J4002, Sep24 00:15–12:15, overlapping assigned pairing 152056. Current source rows are **1354952–1354957**, not the earlier case's restored IDs. This is a deliberate 1001 overlap fixture, not another mobile absence submission. Preserve the earlier Case 001 Partial history.

Pairing 152056: report Sep24 03:10, stored release Sep26 06:25. Six flights run Sep24 05:10 through Sep25 18:25. Do not confuse segment endpoints with the wider stored pairing window.

## Setup and test steps

| Step | Crew control / crew | Module or model | Action and actual result | Remark |
|---|---|---|---|---|
| 1 | Ryan / J4002 | Live Alert Center | Load ADD pilots, include Full pairing coverage; select J4002's recoverable 1001 row → Recovery. | Before: standby 0, swap 0, delay 1. |
| 2 | Test operator / J4011, J4005 | Read-only SQL + current candidate code | Verify ADD, CA, 7M8 and clear candidate roster windows; snapshot existing active rows and composition. | Independent read-only supporting audit reviewed against current DB and UI. |
| 3 | Test operator / J4011 Beniam Yimer | Existing roster API, not an AI solver | Create ASBY at ADD–ADD, Sep24 02:00–10:00. Created row **1355089**. | ASBY maps to SBY; covers report 03:10. Ordinary RES does not satisfy current standby filter. Setup via API, not claimed as manual UI creation. |
| 4 | Test operator / J4005 Tsegaye Wondimu | Existing assign-pairing API | Assign existing open ADD/7M8 pairing **152097**, CA seat. Created rows **1355090–1355091**. | No existing duties deleted. Report Sep24 16:55; stored release Sep25 15:50. |
| 5 | Ryan / J4002 + J4011 | Recovery candidate builder | Fresh Live load → 1001 → Standby Crew callout. Tick J4011; assert checkbox and Apply enabled. | 1 executable option, cancel 1/add 1, US$600, stability 99.03%; UI eligibility is not complete legality certification. |
| 6 | Ryan / J4011 | Recovery Preview | Click Preview; inspect original pairing before/after on J4002/J4011 and retained standby callout marker. Close dialog without Apply. | No recovery draft or committed changes. |
| 7 | Ryan / J4002 + J4005 | Recovery candidate builder | Reopen the original 1001 from unchanged baseline → Swap duty. Tick J4005; assert checkbox and Apply enabled. | 1 executable option; cancel 2/add 2, displayed ¥0, stability 98.06%. |
| 8 | Ryan / J4005 | Recovery Preview | Preview whole-pairing exchange, then close without Apply. | Returning duty requires J4002 to be fit after SL; clock expiry alone is not medical clearance. |
| 9 | Test operator / all three | Playwright + read-only SQL | Assert original source rows/SL remain, standby and donor setup remain, draft opCount 0. Compare all original active rows byte-for-byte with baseline. | PASS: only the three intended setup rows were added. Prepared alternatives retained for Ryan's demo. |

Donor flights: ET422 ADD–DMM Sep24 18:55–22:55; ET423 DMM–ADD Sep24 23:55–Sep25 03:50. Existing complete base-to-base pairing; not fabricated legs.

## Evidence, visually inspected

All under `docs/assets/screenshots/crew-recovery/`:

- `s1-options-before-Ver1.png`: 0 / 0 / 1, delay BEST COST ¥0.
- `s1-standby-verified-selectable-Ver1.png`: selected J4011 and enabled Apply.
- `s1-standby-verified-preview-Ver1.png`: before/after standby preview.
- `s1-swap-duty-verified-selectable-Ver1.png`: selected J4005 and enabled Apply.
- `s1-swap-duty-verified-preview-Ver1.png`: two-way preview.
- `s1-options-ready-baseline-Ver1.png`: preview closed, source assignment and SL remain.

Verification command (requires authenticated, loaded Chrome CDP tab):

```sh
NODE_PATH=/tmp/rois-s1-tools/node_modules node e2e/scripts/recovery-s1-options-readonly.cjs
```

**PASS**, both methods independently selected and previewed, baseline assertions after each. Script is read-only and versions screenshots on rerun. Initial ad-hoc automation hit an ambiguous Close locator after successful setup; corrected to explicit dialog-close test ID. No duplicate setup call was made.

## Findings — unresolved, not operational approval

1. **Delay price is not a real passenger-disruption estimate.** Before setup, the UI called an 8:06 shift of all six flights BEST COST ¥0. `buildMetrics` initializes delay costs at zero; current cost bridge does not send passenger count/delay-duration inputs in `optionToLibraryCostInput`. After setup swap and delay both display ¥0 and swap receives the star. Adding candidates does not fix pricing.
2. **Currency inconsistency:** standby detail/row shows US$600 while tree shows ¥600. Do not compare different currencies as raw numbers or interpret missing costs as zero.
3. **Crew metadata inconsistency:** standby describes J4011 as “rank adjustment · cross base” despite ADD/CA roster labels; swap warns J4002 is not qualified for 7M8 despite stored fleet assignment. Root cause not diagnosed. This warning is soft and checkbox remains enabled. Qualification/seniority/medical validity has not been fully certified.
4. **Selection persists while browsing another method:** changing method can leave the earlier crew as the Apply target until a new checkbox is checked. Always read footer and tick the intended candidate; the final independent test closes/reopens between methods.
5. **Recommendation:** assess qualified available airport standby first for this sick-crew narrative. Do not hard-code a winner or invent tariffs. Fix missing/unpriced cost semantics and metadata before presenting automatic “best option” selection to a client.

No production behavior or tariffs changed. No recovery Apply, Save, flight delay, crew notifications or CCX execution performed. Backend regression tests are not applicable to a behavior change here (none made); end-to-end committed recovery and full legality remain unverified.

## Reset boundary

Current desired replay baseline includes the newly prepared standby/donor duties and Ryan's SL conflict. Closing previews restores this baseline; exact UI/SQL checks passed. Private ownership manifest and API receipts are in `.local/s1-options/` (do not publish raw manifests). If later asked to remove setup, preflight current ownership and use normal roster deletion APIs only for 1355089 and J4005/152097 rows 1355090–1355091. If recovery has since been saved, those IDs are not sufficient: capture its actual effects first. Never reuse `.local/s1-case/restore.cjs` against this new baseline.
