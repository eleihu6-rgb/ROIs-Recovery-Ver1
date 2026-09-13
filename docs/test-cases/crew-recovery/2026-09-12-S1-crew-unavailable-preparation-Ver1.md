# S1 — Crew unavailable: test preparation

Prepared 2026-09-12 from current source and existing test fixtures. Status: **ready for fixture preflight and test construction; full S1 acceptance is blocked by workflow gaps**. No runtime test or current database inventory was performed for this document. Existing fixture IDs below are test-source evidence, not a guarantee of today's database state.

## 1. Scope and corrections to the narrative

Start with **S1-A: base sick call before report**. Outstation illness, illness during duty, no-show, certificate expiry and reserve depletion need separate cases: their location, availability time, flown-leg treatment and recovery constraints differ.

Use “Module / screen” for the requested “which model” column. Record the decision engine separately: current Recovery builds candidates in Gantt TypeScript, calls Live for cost-library pricing and legality preview, and uses draft operations for execution. This is not evidence of an LLM or PBS optimization run generating S1 solutions.

The PI-4821 / Lim Wei Ming / Raj Patel / PI382 / SIN–LHR narrative has not been matched to existing data. Do not use these as executable fixture identities until verified. Preserve it as a business example; use the fixture cases below for preparation.

Important story corrections:

- Three method groups do not guarantee three feasible options. Record zero/one/many candidates, filtered reasons, rule warnings and actual rank.
- Immediate sickness stand-down is implemented, but the absence-to-open-pairing replacement search is not connected to the existing violation-triggered three-option dialog.
- A sick captain cannot receive a later pairing while still unavailable. A genuine move-up needs coverage for the donor captain's original pairing by another available crew, or a documented cancellation/delay. Today's two-way swap returns a pairing to the original crew.
- Waiting for a fresh reserve shift still requires assigning the fresh reserve crew. “Zero crew reassignment” is incompatible with replacing an unavailable captain. Today's Flight Delay instead keeps the original crew and delays past an overlapping ground task.
- “Following rosters automatically de-assigned” and “zero downstream roster impact” cannot both describe the chosen result. For the zero-impact case, assert no following duties change. Add a separate case requiring follow-on removal and coverage.
- Fleet mismatch is currently a soft warning and can remain executable. An executable badge alone does not establish the A350-qualified/compliant claim. Strict S1 acceptance must require actual valid qualifications.
- Treat the 3-second / 8-second timeline as proposed targets, not measured performance. Define start/end events and capture observed durations.

## 2. Existing fixture inventory and preflight

| Case | Existing test fixture | Intended use | Required preflight |
|---|---|---|---|
| A: absence | ET crew **J4002 / Getnet Kifle** (name asserted by the records test), ADD, CA; pairing **152056**, six legs over **24–25 Sep 2026**; absence **25–26 Sep** | Partial-date overlap removes the whole pairing and creates two ILL days | Read current crew display name, fleet/rank/base effective dates, all six flights and times, coverage, active absences and complete surrounding roster. This is a whole-pairing boundary regression, not the final before-report golden case. |
| B: recovery methods | Crew **113**, YVR, pairing **136149** on **16 Sep 2026**; MTG **14:00–15:00 UTC** | Existing rule **1001 Assignment Overlap** entrance | Confirm current schema, crew identity/rank/fleet, MTG and both flying rows, active ruleset/parameters and candidate scope. |
| B1: standby | Crew **529** | Standby call-out candidate for B | Verify airport presence, standby type/window, report readiness, full roster, rank/fleet qualification, seniority policy and remaining reserve capacity. Source fixture alone does not prove these business facts. |
| B2: swap | Crew **656**, pairing **136152** | Later-duty exchange candidate for B | Read its complete route/times and both crews' qualification validity. Existing tests intentionally allow fleet warnings; this is not a compliant S1 fixture. |
| B3: flights | **78053 / 1888 YVR–LAX**, 14:50–17:45 UTC; **78059 / 1889 LAX–YVR**, 18:30–21:30 UTC | Two-leg return-to-base delay assertions | Confirm source times and every other crew/pairing using the same flight IDs. |

For the actual S1-A golden run, select a future complete base-to-base pairing and submit before its first report. Capture the absence date in the crew-base timezone and all event timestamps in UTC plus local time. Do not silently relabel case A as a pre-report operational recovery.

Preflight must use the target service's configured DATABASE_URL and confirm schema alignment with both UIs. Historical recovery tests mention `dev_live`; the root guide specifies shared SIT schemas. Stop on missing/mismatched fixtures. Do not copy unrelated airline fixtures together or silently modify rules to make candidates pass.

Record actual displayed names instead of inventing them. Use Ryan's authorized controller account; keep credentials out of this document. Confirm no other test uses the reserved crew/date/flight set before any fixture writes. Existing absence tests have broad crew-level cleanup: narrow restoration to the test-owned request and exact changed rows before reuse.

## 3. Case A — crew request and controller discovery

| Step | Crew control | Crew | Module / screen | How to do it | Expected result / remark |
|---|---|---|---|---|---|
| A0 | Ryan / tester | J4002 | Crew App Schedule; Live Gantt | Confirm same backend dataset; capture baseline six-leg pairing 152056 and affected seat coverage. | Record original assignments, ruleset, app versions, base timezone and notification state. |
| A1 | — | J4002 | Crew App → Quick actions → Absence Request | Select Sick leave; From 2026-09-25, To 2026-09-26; enter a unique test note; review Affects; press Submit request once. | Success; record absence ID and observed duration. Dates mean ADD-local dates, not device-local or UTC dates. |
| A2 | System | J4002 | Live absence service → roster | No controller approval action. | Active sick absence recorded; all six crew rows for 152056 cancelled, including day-one rows; two ILL ground rows inserted; other crew assignments unchanged. Pairing itself remains. |
| A3 | Ryan | J4002 | Live → Roster pane → Crew Absence | Filter Crew ID J4002, Active, exact date range; Search. | Matching record shows ILL, ADD, dates, note, submitted time and removed pairing 152056. |
| A4 | Ryan | J4002 | Crew Absence → roster / pairing | Click absence row; inspect crew roster. Click removed pairing 152056 chip. | Crew comes to top; removed flying duty absent; two ILL days visible; pairing loads and affected CA coverage decreases correctly on every relevant segment. |
| A5 | — | J4002 | Crew App → Alerts / Schedule | Refresh or reopen the feed and schedule. | Original-duty removal and sick leave are visible. Capture notification ID/content separately from device push delivery; push is not proven by a stored notification. |
| A6 | Ryan | Replacement crew TBD | Crew Absence / open pairing | Attempt to continue to ranked replacement options for that removed pairing. | **Workflow gap:** current absence dialog navigates only. Do not recreate an overlap on the sick crew to manufacture an S1 pass. |

The current Playwright absence test submits through an API and then inspects the real Gantt. It is backend-to-planner evidence, not proof of A1 through the mobile UI. Build the crew-side run with the actual app (Maestro/simulator/device), followed by real-UI Playwright for Ryan's actions.

## 4. Case B — try existing recovery methods independently

This is a separate **ground-task overlap** regression. It does not continue case A and does not prove recovery after sickness stand-down.

| Step | Crew control | Crew | Module / screen | How to do it | Expected result / remark |
|---|---|---|---|---|---|
| B0 | Ryan | 113, 529, 656 | Live → Filter | Load Pilot division, YVR base, 14–18 Sep 2026, including candidate crews and surrounding duties. | Confirm baseline 113/136149 and MTG overlap; record exact loaded candidate scope. Existing test documents duplicate roster IDs; YVR filtering avoids one collision but does not repair data. |
| B1 | Ryan | 113 | Roster → Alert Center | Select recoverable rule 1001 row for crew 113 and pairing 136149; open Recovery. | Standby Crew callout, Swap duty and Flight Delay groups appear. Do not select an unrelated 8004 row: it opens a different method set. |
| B2 | Ryan | All candidates | Recovery → methods / Detail / cost / Preview | Review each group's candidates; wait for checking to settle; inspect before/after duties, warnings, costs and follow-on impact. | Record reasons for filtered candidates and actual ranking; do not force three feasible results. Preview changes remain in memory. |
| B3 | Ryan | 529 replaces 113 | Standby Crew callout | Select crew 529 using execution checkbox; Preview; Apply. | Unsaved draft removes 113's pairing, assigns all its legs to 529 and retains SBY marked CALLOUT_STANDBY. MTG remains. Check surrounding duties explicitly. |
| B4 | Ryan | 113, 529 | Live draft controls | Undo/discard all B3 operations and confirm baseline before trying another method. | No persisted change from browsing/applying; no leftover callout marker or assignment. |
| B5 | Ryan | 113 ↔ 656 | Recovery → Swap duty | Reopen same alert; inspect 656/136152; select, Preview, Apply. | Draft exchanges complete pairings: two removals and two assignments. Capture fleet warning. This fixture can demonstrate wiring but fails strict qualification acceptance when mismatch remains. |
| B6 | Ryan | 113, 656 | Live draft controls | Undo/discard B5 and verify baseline. | Both crews recover original pairings and no residual draft operations remain. |
| B7 | Ryan | 113 retained | Recovery → Flight Delay | Reopen same alert; select Flight Delay group, inspect flights, Preview, Apply. No execution checkbox is used for this method. | One edit-flight draft: flight 78053 ATD/ATA becomes 16:01/18:56 UTC; 78059 becomes 19:41/22:41 UTC. STD/STA remain unchanged; turnaround remains 45 minutes. Formula uses MTG end + 61 minutes. |
| B8 | Ryan | 113 plus all affected crews | Live draft controls / three panes | Undo/discard B7; verify original flight times and all linked roster/pairing views. | Baseline restored. This does not demonstrate reserve shift refresh, passenger re-accommodation or full delay legality. |
| B9 | Ryan | Selected crew(s) | Recovery → Apply → Live Save | In a reserved acceptance run, start from baseline; choose one operationally valid option, Apply, then Save. | Apply is not commit. Capture save result; reload independently; verify persisted all-leg coverage, no double assignment, rule recheck and downstream duties/KPIs. Existing B tests stop at unsaved draft. |
| B10 | Ryan; affected crew | Selected crew(s) | Live; Crew App | Inspect durable roster result and crew-visible change notification; capture evidence. | Record actual delivery/ack status. For full S1, require sick crew stays unavailable and receives no replacement flying assignment. |

For “try each option,” use three isolated baseline runs if each must be Saved. Undo of an unsaved draft is not rollback of a saved operational change. Restore only test-owned changes with a verified before-state manifest.

## 5. Missing acceptance fields and assertions

Add these columns to each execution record: **expected result, actual result, PASS/FAIL/BLOCKED, evidence link, timestamp/duration, defect ID**. Keep the step table's remarks for constraints rather than hiding pass criteria there.

Case header must capture:

- Case ID/variant, purpose, owner, environment/schema, frontend/backend versions, ruleset ID/version, business date and timezone.
- Unavailable crew, each proposed replacement, rank/seat, fleet and certificate effective dates, current location, standby type and readiness time.
- Complete pairing and flight IDs, base-to-base route, report/release, scheduled/estimated/actual timestamps, required versus filled seats, previous rest and subsequent duties.
- Absence ID, effective interval, original-duty IDs and audit actor; after-save request/draft/notification identifiers.
- Cost currency, cost-library revision, component amounts, actual ranking rules, reserve hours before/after and protected minimum pool, seniority/union rule and evidence.
- Measured submit-to-stand-down, search-to-options, approve-to-save and save-to-crew-visible times; agreed maximum for each. Do not prefill measured values from the narrative.
- Snapshot/reset ownership and exact affected records, screenshots, logs with secrets removed, and whether notifications/integrations use a test destination.

Minimum negative/regression cases: duplicate or overlapping absence; invalid/reversed dates; cross-midnight/DST; no available reserve; standby outside readiness window; expired qualification; replacement already assigned or sick; donor pairing left uncovered; insufficient rest/FDP; no feasible options; stale data after another controller saves; duplicate Apply/Save; failed save; unavailable cost service; notification failure after successful save. During-duty illness must preserve flown work and recover the remaining operation; the current whole-pairing removal behavior requires a distinct design before that variant is accepted.

## 6. Gaps required for full S1 acceptance

| Gap | Acceptance needed |
|---|---|
| Absence → recovery search | Search receives absence ID, open pairing/seat and unavailability interval without relying on a still-assigned violation. Sick crew excluded for the whole interval. |
| Compliant move-up | Donor crew covers disrupted duty; donor duty has an explicit available replacement or other resolved outcome. No return duty to unavailable crew. |
| Reserve-refresh delay | Real next-shift crew, readiness time and full delayed pairing legality; assignment of that crew and passenger impact explicitly accounted for. Current delay preview skips candidate rule-check execution. |
| Compliance and ranking | Prove applicable qualifications, union/seniority and reserve limits; document the scoring formula. Current cost-first candidate ordering is not evidence of the narrative's four-factor composite score. |
| Downstream closure | Confirm every changed duty is either covered or explicitly unresolved; full pairing/flight ripple and persistence validated after Save. |
| CCX execution | No connected automatic hotel/transport cancellation, manifest reissue or APIS-update chain was found in the inspected absence/recovery paths. Require per-action package ID, recipient/system, payload scope, delivery/ack, retry/idempotency and partial-failure state before claiming success. |

Recommendation: build A and B first as honest component workflows, then add the missing absence-to-recovery handoff and S1-specific move-up/delay behavior. Do not label the combined component demonstrations a passed end-to-end S1.

## 7. Source evidence and planned verification

- `crew-app/src/features/v2/AbsenceScreen.tsx`, `crew-app/src/features/absence/absenceApi.ts`: real absence form and submission.
- `live-server/src/services/absence/crew-absence-service.ts`: sick-only range, transaction, whole-pairing cancellation, ILL rows, coverage/recheck/notification side effects.
- `gantt/src/components/roster/crew-absence-dialog.tsx`: Search, crew navigation and removed-pairing navigation; no replacement-search button.
- `gantt/src/services/recovery-trigger.ts`, `recovery-candidates.ts`, `recovery-draft.ts`: entrance requirements, candidate generation/ranking, delay planning and draft operations.
- `gantt/src/components/recovery/recovery-violation-dialog.tsx`: previews, execution selection and Apply behavior.
- `live-server/src/routes/recovery/recovery-cost.ts`: cost-library pricing bridge.
- `e2e/tests/gantt/crew-absence-stand-down.spec.ts`, `crew-absence-records.spec.ts`: existing absence fixtures; API submission is not mobile UI proof.
- `e2e/tests/gantt/recovery-1001-flight-delay-crew-113.spec.ts`: real-data three-method draft assertions; no persisted Save proof.

Planned commands (NOT RUN in this preparation; preflight and cleanup review required first):

```sh
cd e2e
npx playwright test --config=config/playwright.local.config.ts tests/gantt/crew-absence-stand-down.spec.ts tests/gantt/crew-absence-records.spec.ts --reporter=list
npx playwright test --config=config/playwright.local.config.ts tests/gantt/recovery-1001-flight-delay-crew-113.spec.ts --reporter=list
```

Extend with mobile UI submission, actual controller login, saved-state assertions and same-run versioned screenshots under `docs/assets/screenshots/crew-recovery/`; visually inspect each. Revalidate current service routing before running. This preparation changes documentation only: no runtime PASS or new screenshot is claimed.
