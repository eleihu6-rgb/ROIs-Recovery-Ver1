# Case 1 — retained-duty mobile submission, Help rewrite and scoped reset

Date: 12 September 2026, America/Vancouver. Case: J4002 (Getnet Kifle), ADD, ET CA/7M8; source pairing152056, six legs. Controller: Ryan. Public controller/Help: https://cr.rois.one/altair/. iPhone Air simulator: Crew App121. Controller observed B261/F487/R40. This internal receipt supplements the client-facing 12-step Help article; it does not replace earlier option-execution evidence.

## Behavior delivered

Crew App sick leave submission creates an active absence and one ILL/GRD roster row per selected base-local day. It does **not** remove or alter original flying assignments or pairing coverage. The response keeps `removedPairingIds: []` and adds `retainedPairingIds`; the saved absence stores an empty actual-removals array. The app and submission notification say original duties remain assigned pending Crew Control recovery. Legality, manday and roster-notification postcommit hooks are independently caught/logged so a committed request is not presented as failed solely because a downstream hook failed.

## Two different replay windows — do not conflate them

- Prepared controller incident: existing SL1355350, 24 September00:15–12:15UTC. This is the baseline for three standby/six swap candidate comparisons and the documented ET80508:06 delay.
- Actual mobile test: inclusive24September ADD-local, equivalent to23September21:00UTC–24September20:59:59UTC. New request10 and ILL1355740. This full-day absence produced three standby candidates but **zero same-day swaps**. Do not alter absence end times or swap engine rules merely to force options. Medical fitness to resume is not established by the recorded end time.
- The prepared SL remained during this mobile validation. Thus the Alert Center additionally showed ILL/SL overlap; the selected recoverable row was specifically **ILL/FLY**, not the pre-existing SL/FLY incident.

## Detailed execution

All screenshot paths below are under `docs/assets/screenshots/crew-recovery/` and were captured by the actual UI drivers. Private run scripts/manifests are under `.local/s1-sl/`; they are run-specific, not generic reset tools.

| Step | Crew control | Crew | Module / model | Exact action and observed result | Evidence / boundary |
|---|---|---|---|---|---|
|1|—|J4002|Crew App / Maestro|Open ET login and Absence Request; choose Sick leave, set both dates to24September2026, enter unique note `S1-20260912-J4002-RETAIN-DUTY-UI`. Review dates before submitting.|`s1-retain-mobile-dates-Ver1.png`, `s1-retain-mobile-ready-Ver1.png`; no absence creation by API.|
|2|—|J4002|Crew App → absence service|Press Submit request **once**. Observe Request submitted and “Sick leave added. Original duties remain assigned pending Crew Control recovery.”|`s1-retain-mobile-success-Ver1.png`; Maestro submit PASS.|
|3|Test operator|J4002|Authoritative roster/absence read|Compare original manifest with post-submit state: source rows1355154–1355159 exact unchanged; all original J4002 active rows unchanged; source composition and linked flight records unchanged. One owned request10, one ILL1355740, removed-pairing IDs empty, notificationabsence-10 present.|`before.json`, `after.json`; timestamp comparisons preserve UTC. No flight restoration needed.|
|4|Ryan|J4002|Live / Playwright|Reload Live, apply saved ADD pilot filters, confirm six source legs still assigned and new ILL present. Open Alert Center; identify recoverable1001 row containing ILL and FLY.|`s1-retain-controller-1001-Ver1.png`; source check and real alert PASS.|
|5|Ryan|J4002 → candidates|Recovery loaded-data generator + current legality + GH Cost Library|Check the ILL/FLY row, click Recovery selected, choose Standby Crew callout. J4011/J4012/J4013 appear Executable; J4011 enabled. Screenshot shows three standby, zero swaps and one delay strategy proposal.|`s1-retain-controller-standby-Ver1.png`; no Apply or Save during this mobile proof.|
|6|Ryan|Candidate crews|Prepared timed-incident comparison|Earlier tests compared all three standby prices/previews; J4011 Apply+Save+reload+restore passed. Six swap crews each had both-crew cost review, Preview, Apply4draft operations and Undo; no swap Save. Delay was preview-only.|See linked earlier receipts below. These results are **not** attributed to the full-day mobile absence.|
|7|Help author / Ryan|—|Gantt Help / Playwright|Open Help, select Case study1 immediately after Comparing recovery costs. Assert exact title,12steps, four loaded images,3standby and6swap table rows/costs, retention and execution limits, no historical defect/YVR narrative, no horizontal article overflow at900px.|`s1-help-rewritten-top-Ver1.png`, `s1-help-mobile-success-Ver1.png`, `s1-help-standby-table-Ver1.png`, `s1-help-swap-table-Ver1.png`, `s1-help-verification-scope-Ver1.png`, `s1-help-rewritten-narrow-Ver1.png`; PASS.|
|8|Test operator|J4002|Scoped reset, normal roster API|Preflight all original J4002 rows and exact ownership of request10/ILL1355740. Confirm zero drafts. Remove onlyILL1355740 via `rosterApi.remove`, retaining its soft-deleted audit row and normal recheck/cache/manday side effects.|`reset-receipt.json`; PASS. This is test cleanup, not a claimed crew-facing cancellation workflow.|
|9|Test operator|J4002|Bounded absence cancellation|No supported cancellation endpoint was found. Exact ID/crew/unique-note/active-status guarded update marks request10 cancelled. Preserve original submission notification and request history. Older absence3 and prepared SL1355350 remain untouched.|Audit preservation intentionally means historical rows are not byte-for-byte pre-test state; **active operating state** is restored.|
|10|Test operator|J4002|Existing Rust manday driver|Recompute onlyJ4002 for1–30September. Driver returned1crew/14daily/1monthly/1yearly. Saved month credit77:35. No manual aggregate edits.|`recompute-receipt.json`; PASS.|
|11|Test operator|J4002|Manifest reset comparison|All original active roster rows, source composition, linked flights and older absences unchanged. Only this run’s request remains additionally as cancelled audit history; no additional active ILL.|`restored.json`; PASS. A harness Date-versus-ISO-string mismatch was corrected by serialization, not by changing baseline data.|

## Final replay state — verified

`node .local/s1-sl/final-check.cjs` **PASS** after fresh reload and applying saved Live filters. The first attempt correctly found no loaded data until filters were applied; this was a harness setup omission, not missing roster data.

- All six original source legs remain assigned to J4002; coverage CA2/2 and FO2/2.
- No active ILL1355740; prepared SL1355350 remains and is the sole recoverable J4002 overlap.
- Zero unsaved draft operations. Six swap candidates and three standby candidates are enabled.
- Headed browser is left on the prepared incident’s Standby Crew callout list, no crew selected, no Apply/Save.
- Captured and inspected `s1-retain-reset-roster-Ver1.png`, `s1-retain-reset-alert-Ver1.png`, `s1-retain-reset-six-swaps-Ver1.png`, `s1-retain-reset-three-standby-Ver1.png`.
- This is the **prepared controller incident** baseline, not an absence-free whole-story starting point. Cancelled request10 and its notification remain in history; a new mobile request for24September is no longer blocked by request10.

## Cost facts for client demo

Before figures are **assigned calendar-month credit**, not already-flown hours or rounded76/88 hours. GH-only incremental estimates are not total recovery costs.

- Standby J4011:08:00→20:20, USD0.00; J4012:76:35→88:55, USD470.00; J4013:87:05→99:25, USD1,762.50.
- Swap J4005:15:15→22:35, USD0; J4014:17:25→24:15, USD0; J4015:17:35→24:25, USD0; J4018:78:30→86:05, USD130; J4016:80:40→88:00, USD360; J4017:81:20→88:55, USD470.
- Swap pricing compares **both crews’** pay before versus after outgoing-credit removal/incoming-credit addition. Cost Library existing GH policy applies. Missing/unsupported context is Unpriced, never free.
- No optimization solver or language model chooses the crew. Loaded Live data scopes candidates; rule checks and the existing GH calculator are used. Do not claim CCX/APIS/hotel cancellation, acknowledgement or payroll posting.

## Verification receipts

| Exact command | Result |
|---|---|
|`/Users/kimi/.maestro/bin/maestro test .local/s1-sl/mobile-prepare.yaml`|PASS real mobile dates/submit-ready|
|`/Users/kimi/.maestro/bin/maestro test .local/s1-sl/mobile-submit.yaml`|PASS actual submit/success|
|`node .local/s1-sl/evidence.cjs after`|PASS committed retention and request ownership|
|`node .local/s1-sl/controller.cjs`|PASS real ILL1001 → standby; earlier retry required waiting for login completion|
|`node .local/s1-sl/help-validate.cjs`|PASS real public Help and six inspected screenshots|
|`node .local/s1-sl/reset.cjs`|PASS owned-record reset with audit preserved|
|`node --import ./live-server/node_modules/tsx/dist/loader.mjs .local/s1-sl/recompute.cjs`|PASS existing full-month driver|
|`node .local/s1-sl/evidence.cjs restored`|PASS active baseline / preserved older rows|
|`cd live-server && npm test -- src/services/absence/__tests__/crew-absence-service.test.ts src/services/crew-notify/__tests__/crew-notify-service.test.ts`|PASS20/20, independently rerun|
|`cd crew-app && npx jest __tests__/features/AbsenceScreen.test.tsx __tests__/features/absenceApi.test.ts --runInBand`|PASS15/15, independently rerun|
|`cd crew-app && npx tsc --noEmit`|PASS|
|`cd live-server && npx tsc --noEmit`|FAIL existing unrelated `legality-preview.ts:288` dimension typing mismatch|
|`npm run check:ui`|PASS0hard violations/124warnings|
|Scoped `git diff --check`|PASS|
|`PYTHONPATH=/tmp/rois-s1-skill-validator python3 /Users/kimi/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/145-crew-recovery-case-study`|PASS|

Dedicated real-UI runners above supplied the UI gates; the consolidated `recovery-case-001.spec.ts` suite and broad Help suite were not rerun in this final pass. Existing Help coverage check gaps (system-interface/Legality mappings and missing7509topic) remain outside this case. No durable postcommit retry/outbox or new concurrency/idempotency guarantee was introduced. No commit/push.

## Related evidence

- [Approved retained-duty design](../../superpowers/specs/2026-09-12-crew-sl-retain-duty-help-Ver1.md)
- [Headed standby Save and reset walkthrough](2026-09-12-1415-S1-headed-walkthrough-Ver1.md)
- [Six swap candidates, GH and Apply/Undo](2026-09-12-1445-S1-swap-gh-six-candidates-Ver1.md)
- [Recovery case skill](../../../.agents/skills/145-crew-recovery-case-study/SKILL.md)
- Client Help: https://cr.rois.one/altair/help → Recovery → Case study1 — J4002 unavailable at ADD.
