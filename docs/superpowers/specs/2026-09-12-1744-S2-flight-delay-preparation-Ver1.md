# S2 — Flight Delay: preparation and feasibility review

Prepared 2026-09-12, America/Vancouver. **Initial feasibility review**; the operational variant and governing FDP rules remain unresolved. Subsequent authorized preparation created isolated crew/pairing/roster fixtures and ran headless UI checks: see the [current fixture and verification receipt](../../test-cases/crew-recovery/2026-09-12-1817-S2-prepared-fixtures-Ver1.md). Statements below about no writes or runtime checks describe the initial review, not the later preparation. No Case 2 Help or completed recovery is claimed.

## Case 1 recap and reusable skill

Canonical workflow: crew submits SL → original flying duty remains assigned → ILL/FLY overlap rule 1001 → controller Recovery → compare → Preview → Apply draft → Save.

Case 1 is ET captain Getnet Kifle, J4002, ADD, pairing 152056, six legs. The latest execution record reports successful real mobile submission with the six original assignments retained. The owned full-day mobile absence was subsequently cancelled through the scoped reset; audit history was preserved.

The last verified controller incident baseline retains a separate prepared timed SL, full CA 2/2 and FO 2/2 coverage, zero drafts, three standby candidates and six swaps. A full-day mobile SL produces zero same-day swaps. Those are different incident windows; never shorten actual sickness to create a swap.

Recorded verification boundaries: all three standby previews; J4011 standby Save/reload/restoration; all six swaps Preview/Apply/Undo, but **swap Save untested**; delay preview only. GH estimates are assigned calendar-month incremental pay, with both crews included for swaps, not total commercial recovery cost. These are prior receipts, not tests rerun today.

Use [skill 145](../../../.agents/skills/145-crew-recovery-case-study/SKILL.md): one coherent incident, exact before/after manifests, equivalent starting state per option, separate preview/draft/commit evidence, complete affected-crew checks, real-UI evidence, scoped reset and cache/coverage verification. Its existing Case 1 IDs and reset routines are not S2 fixtures.

References:

- [Latest retained-duty and reset receipt](../../test-cases/crew-recovery/2026-09-12-1730-S1-retained-duty-help-reset-Ver1.md)
- [Six swaps and GH evidence](../../test-cases/crew-recovery/2026-09-12-1445-S1-swap-gh-six-candidates-Ver1.md)
- [Original preparation](../../test-cases/crew-recovery/2026-09-12-S1-crew-unavailable-preparation-Ver1.md): historical stand-down behavior is superseded by the retained-duty receipt.

## S2 business flow

Publish revised ETD/ETA → find every linked pairing and assigned crew → recalculate each complete duty and subsequent rest/roster effects → show a mandatory FDP alert → evaluate four strategies with reasons and costs → controller reviews a feasible plan → preview → apply draft → Save and recheck → verify persisted coverage and downstream outcomes → observe notifications/document processing separately.

Begin with one technical-delay incident. Split duty, diversion, minimum connection, outstation AOG and pay-protected release need separate variants because their eligibility, location and legal treatment differ.

PI201/PI202, PI205/PI206 and David Chen/Sarah Kim/James Lee are user-supplied narrative identities, not database-verified fixtures. Date, timezone, aircraft qualification, report/release, scheduled/estimated/actual leg times, prior rest, following duties and ruleset remain to be established. A captain plus two FOs does not alone prove approved augmentation or an increased FDP limit.

## Corrections needed before execution

| Narrative claim | Required treatment |
|---|---|
| Four feasible options | Four strategies evaluated. Retain infeasible strategies with explicit rejection reasons; rank only feasible, sufficiently priced plans. |
| Discretion still exceeds maximum FDP | Infeasible regardless of consent. Use actual governing rules and documented authorization requirements; consent cannot override the permitted limit. Do not assume a discretionary quota exists without policy evidence. |
| Outstation standby versus scarce SIN reserve | Distinguish HKG-ready qualified reserve from SIN reserve requiring positioning, readiness time and duty/rest checks. The narrative currently supplies no qualified available crew. |
| HKG crew swaps with SIN–DXB–SIN crew | No physical meeting point is established. Full-pairing reassignment cannot rewrite flown PI201 or move people instantly between airports. |
| Later augmented donor guarantees legality | Recalculate both groups separately, including report history, augmentation requirements, seats, facilities, qualifications, previous rest and subsequent duties. A swap does not reset elapsed FDP. |
| Both pairings legal; open position handled later | Legal assigned duties do not imply complete coverage. Identify every uncovered flight/rank/seat and its recovery owner. A plan leaving a required seat open is Partial, not a fully recovered departure. |
| Lowest composite score and zero reserve hours | Record actual cost components, currency, weights, normalization, passenger impact and reserve accounting. Missing values are Unpriced/not generated, not zero. |
| Cancellation means no crew impact | Zero reassignment may be possible, but release, stranded-crew transport/accommodation, onward rest and roster effects still require evaluation. Passenger rebooking needs execution evidence. |
| Notifications/customs completed at 13:02:45 | Separate queued, sent, delivered, acknowledged and document-job completion. Verify real interfaces before making those claims. |

## Operational variant decision

**Recommended S2-A: before-departure base swap.** The return delay is published while both complete crews remain at SIN and before PI201 is flown. Construct two compatible base-to-base pairings with precise timing such that the revised original duty breaches its limit, while each proposed reassignment passes its own full-duty and downstream checks. A later donor departure alone is insufficient. This changes the location/timing assumptions of the original story and needs business selection before fixture implementation.

**Alternative S2-B: retain HKG stranding.** Preserve flown legs. Supply a qualified donor already at HKG, or a realistic positioning itinerary arriving before report; account for positioning duty, minimum connections and rest. Recover future legs only and explicitly cover or defer donor vacancies. This is a larger recovery case than the existing whole-pairing exchange.

No variant is selected on the user's behalf. The supplied narrative cannot yet substantiate Option 3 as feasible or cheapest.

## Current implementation evidence and gaps

### Confirmed reuse direction

Ryan explicitly directs reuse of QIUXIA81's existing functions with substantially
the same UI/framework as Case 1. The [prior implementation study](../../modules/crew-recovery/2026-09-12-cases-102-104-study-Ver1.md)
identifies QIUXIA81 as Git author `xigang.hang`; local Git confirms `dcc2cb5` and
`6237137` introduced the relevant trigger/options and Apply integration. This is
a shared framework with additional contributors and later Case 1 improvements.

| Existing component | Case 2 reuse |
|---|---|
| `gantt/src/services/recovery-trigger.ts` | Extend genuine FDP entry eligibility if needed; preserve 1001/8004 behavior. |
| `gantt/src/services/recovery-candidates.ts` | Reuse candidate and before/after models; add only S2-specific timing/location/legality eligibility needed by the chosen incident. |
| `gantt/src/components/recovery/recovery-violation-dialog.tsx` | Same option tree, candidate lists, Detail, cost popup and Preview; adapt option data instead of creating a second dialog. |
| `gantt/src/services/recovery-draft.ts` | Reuse `buildRecoveryDraftPlan`; whole-pairing swap only when operated history and physical crew location permit. |
| Existing lock/draft store and backend draft routes | Same Apply → unsaved draft → Undo/Save lifecycle, with Save/reload evidence. |
| Existing flight edit/propagation services | Reuse valid mutation/recheck plumbing after verifying estimate semantics; do not force forecasts into actual-time fields. |

The existing 102/103/104 method labels mean standby/swap/delay, not the S2 incident.
Reuse does not require changing the user's HKG scenario to SIN or manufacturing an
overlap alert. Operational feasibility remains a separate decision. No fixture has
been created in this preparation, and Case 1 records remain untouched.

Source inspected for this preparation:

- `gantt/src/components/recovery/recovery-violation-dialog.tsx`: empty-selection guidance and current entry refer to recoverable 8004/1001 alerts.
- `gantt/src/services/recovery-candidates.ts`: 1001 has standby/swap/delay methods; `planFlightDelay` shifts flights after a ground-task overlap using ATD/ATA-shaped values. This is not evidence of a published-ETD FDP recovery path. Preserving turnaround does not establish FDP legality.
- `live-server/src/services/flight/flight-delay-propagation-service.ts`: flight changes propagate to linked pairing segments and roster rows in the transaction. Manual versus imported pairing duty-window handling differs; imported host-computed windows are retained in the documented branch.
- `live-server/src/routes/flight/flight.ts`: flight mutations have legality/KPI recomputation hooks. End-to-end revised-estimate semantics, failure handling, alert latency and S2 FDP entry require validation.

Do not write a forecast into an actual-departure field merely to trigger existing propagation. Verify estimate ownership and the correct publish UI first. If ownership/storage must change, follow the source-of-truth migration gate. Runtime legality must use the configured governing rules; no PBS optimization or language-model execution has been demonstrated here.

Existing test starting points: `e2e/tests/gantt/flight-delay-pairing-roster-propagation.spec.ts`, `e2e/tests/gantt/flight-delay-ghost-bar.spec.ts`, and `gantt/src/services/__tests__/recovery-flight-delay.test.ts`. None is claimed to prove this S2 story. FDP entry, discretion, commercial cancellation, multi-crew atomic recovery, scoring and external document/notification completion are open verification/implementation questions.

## Fixture and acceptance checklist

### Candidate count and meaningful cost differences

Ryan requires more than five crew selections per option, similar to Case 1, with
distinct cost differences. For each crew-selecting strategy (standby and swap/move-up),
prepare **at least six selectable, operationally eligible candidates**, not six rows
including filtered/unavailable crews. Each list must show materially distinct priced
totals across candidates using actual Cost Library inputs/policies; do not invent
display prices, change shared tariffs or manipulate legality parameters to obtain them.
Prefer six distinct totals where the valid fixture and existing pricing support it;
record any legitimate ties and explain their calculation rather than fabricate variation.

For standby, vary legitimate saved calendar-month credit and credited standby duty
within the existing guarantee-pay calculation. For swaps, calculate both crews'
before/after pay after removing outgoing and adding incoming duty credit. Verify
all six candidates' complete duty legality, readiness/location, qualification and
seat coverage independently. If recovering an augmented crew, six individual pilots
do not equal six complete replacement teams: show rank/seat selection and remaining
coverage explicitly, or supply six complete feasible plans as the UI supports.

Discretion and cancellation are not replacement-crew lists; retain their strategy
comparison and eligibility/cost evidence without manufacturing crew choices. This
new standby requirement supersedes the initial narrative's depleted/no-qualified-
reserve assumption for the prepared comparison fixture: suitable reserve availability
must be established and the final story updated honestly. If retaining that assumption
is essential, standby cannot simultaneously have six selectable candidates.

Acceptance: in a freshly loaded real Recovery UI, assert at least six selectable
entries per crew-based method, inspect each cost breakdown, verify meaningful cost
differences and consistent currency/pricing scope, and preview each candidate from
the same incident baseline. Candidate count must hold after reload with the complete
fixture scope loaded. Record actual IDs, names, computed totals, eligibility and
preview/Apply/Save status per candidate; selection count is not Save evidence.

User constraint confirmed after initial preparation: **do not interrupt Case 1 and do not reuse its crew set**. Exclude J4002 and all Case 1 standby/swap crews (J4011/J4012/J4013/J4005/J4014/J4015/J4018/J4016/J4017), plus any additional Case 1 participants identified in preflight. Use distinct Case 2 pairings/rosters and flight records so a flight-time cascade cannot alter Case 1 indirectly. Creating necessary Case 2 pairings and roster assignments through existing application functions is authorized. Do not invent parallel creation utilities or reuse Case 1 reset scripts. Check Case 1's protected manifest before and after any Case 2 writes; stop on a shared-record dependency or concurrent mismatch.

1. Select S2-A or S2-B; verify actual crew/flight identities and reserve a nonconflicting date/ID scope. Preserve Case 1 and concurrent work.
2. Capture baseline flight estimates and actuals, every linked pairing, all affected crew assignments, required/filled seats, effective qualifications, complete duty histories and following rest. Record rule parameters and legal FDP calculation inputs/outputs per pilot; do not assume an unverified rule number or universal FDP threshold.
3. Define pre-incident and post-delay checkpoints. Capture all downstream records before any saved delay or swap; reset only manifest-owned changes with concurrent-state preflight.
4. Through the real publish UI, revise only the intended estimate. Verify unchanged flown history, consistent Flight/Pairing/Roster views, persisted estimates, and genuine FDP alerts for every affected pilot. Measure publication acknowledgement → alert visibility → options ready; the user's 2-second/9-second timestamps are targets, not receipts.
5. Record four strategy evaluations, including rejected discretion and unavailable reserve if those assumptions stand. Assert candidate location/readiness, both crews' full legality, complete coverage or explicit residual vacancies, component costs and deterministic configured ranking. Do not force four executable results.
6. For the chosen plan, capture Preview, Apply draft, Save result and independent reload separately. Test no partial multi-crew write on failure, no rewriting completed legs, no new disallowed overlap/rest/qualification violation, preserved unrelated duties and correct coverage. Preview success cannot substitute for Save.
7. Record actual crew notifications and document-job states if available. Otherwise mark those steps not verified. Zero discretion/reserve consumption must be supported by the applied plan, not inferred from its label.
8. Restore the declared checkpoint; recompute affected legality/credit with existing utilities; invalidate roster, pairing detail/composition and pairing-list caches. Reload and verify coverage, alerts and zero drafts against the manifest. Preserve audit records.

Each execution row must include step, controller/crew actor, actual module/engine, exact UI action, expected/actual result, status, timestamp, screenshot, persistent IDs and remarks. Version real-UI screenshots under `docs/assets/screenshots/crew-recovery/`; visually inspect each. Add focused backend/regression checks for implemented behavior and publish Case 2 Help only after supported observations exist.

## Preparation verification

Development-documentation checks only: review this diff, verify relative reference paths and consistency with the cited source/receipts. Runtime and Playwright tests are not run because this preparation changes no product behavior. Code-graph tools and the brainstorming skill were unavailable in the current tool/catalog/local-skill checks; source reads and this written preparation were used. Remaining blocker: operational variant and complete feasible crew/flight timing fixture.
