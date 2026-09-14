# Recovery Case 4: unpaired flights and open pairing staffing

Date: 2026-09-14
Status: Product decisions confirmed in conversation; implementation and real-UI validation pending.

## Objective and confirmed scope

A planner starts from an unpaired flight, compares complete pairing alternatives,
builds one real pairing, then compares costed crew recovery options. Existing open
or partially staffed pairings enter the same Recovery UI directly at roster options.
Standby callout is a shared method across Cases 1–4, not a separate Case 4 implementation.

The Case 4 demonstration uses ET flights within 17–25 September 2026, with ADD as
the working home-base assumption. Airline/date settings belong to the fixture and
search context, not hardcoded product restrictions. Display the selected timezone.
Use the current Gantt timezone for date bounds; keep the complete pairing's report
through release within the chosen window.

Confirmed boundaries:

- Construct pairings from unpaired flights only. Do not extend, split or rebuild an
  existing pairing. Every alternative includes the clicked flight.
- Confirming Build pairing persists it immediately and brings it to row 1 of the
  Pairing pane. Closing Recovery leaves that open pairing saved.
- Any open or partially staffed pairing may reopen Recovery directly at roster
  options, without Pairing Options. Preserve existing assignments and fill only
  missing required rank seats.
- Roster changes retain Preview → Apply draft → Save and existing Undo behavior.
- Move-up may leave a donor vacancy, with a prominent warning and overall Partial
  status. Fully staffing the target does not resolve an outstanding donor vacancy.
- Case 4 must never use any Case 1–3 flight, pairing or crew, including reserves,
  donors and linked duties. This is fixture isolation, not a production rule that
  excludes demo IDs from normal candidate searches.
- Test every delivered roster strategy through real UI and Save/reload; restore
  Case 4 to its prepared unpaired-flight state for Ryan to replay.

## User flow

1. Right-click an eligible unpaired Flight pane flight and choose Recovery.
2. The existing Recovery dialog opens with Pairing Options first in its left
   strategy list. Roster strategies explain that a pairing must be built first.
3. The right side lists distinct valid rotations containing the selected flight.
   Selecting an option shows its route chart and ordered flights, airports,
   departures/arrivals, fleet, required ranks, duties, block time, report/release,
   turns and actual free rest. Highlight the initiating flight.
4. Build pairing revalidates current flight availability and the selected rotation,
   persists one pairing using the existing writer, and focuses its canonical row
   at the top of the Pairing pane. Failed or conflicting builds keep the planner
   in pairing selection with an actionable explanation.
5. The same Recovery dialog switches to roster strategies using the saved pairing
   and current required-seat deficits. Pairing Options disappears. Standby Crew is
   the default roster strategy for this new entry path; retain Cases 1–3 ordering.
6. The planner selects a missing rank seat and compares candidates, cost breakdown,
   before/after roster, legality and coverage effects. After Preview, Apply creates
   normal roster drafts. Save persists through the current application pipeline.
7. Closing before roster Save keeps the built pairing and follows existing draft
   handling. Reopening an open/partial pairing requires no earlier dialog session.
   Recompute deficits after each change; include applicable pending drafts so a
   second selection cannot fill a seat already filled by an unsaved operation.

## Pairing alternatives and search boundaries

Reuse round-trip scope/profile validation, chain validation, duty/rest accounting,
preview rendering and the existing transactional pairing writer. The current
coverage chooser selects rotations; it is not an exhaustive alternative enumerator.
Add an anchor-flight search that retains distinct alternatives rather than marking
their shared flights consumed while merely previewing them.

Every returned option must be a complete base-return chain with airport continuity,
chronological connections, one airline, one exact known fleet, real rest and the
configured duty/block constraints. Do not create fictitious rest to satisfy a cap.
An outstation anchor requires preceding and following legs to close the base loop.
Do not use scheduled times as proof of availability when current operational times
or completed/cancelled state make a chain unusable.

Search all eligible routes within the configured date/profile bounds, with stable
ordering and existing/configured resource limits. If a search limit is reached,
report incomplete results explicitly; never label a truncated list as all possible
pairings. No valid route yields a reason and no Build action. Reuse the domain's
active operating-flight coverage semantics, including division and deadhead rules.
Prevent repeat/concurrent submissions from creating duplicate operating coverage.

## Shared roster strategies, costs and execution

| Strategy | Candidate and effects | Pricing and coverage |
|---|---|---|
| Standby Crew | Qualified, physically available reserve; apply existing callout/standby exception behavior | Existing Cost Library standby/GH calculation, including previously credited standby; fill one eligible seat |
| Available crew assignment | Qualified crew with a legal free window and no donor removal | Existing applicable assignment pricing; missing inputs remain Unpriced |
| Move-up / roster transfer | Move an eligible crew from a future donor duty into the target pairing; show exact donor removals | Existing transfer pricing with removed and added credit; show donor vacancy and Partial status |

Consider existing cross-base/positioned options only where physical positioning,
timing, legality, pricing and execution are supported end to end. A cross-base name
alone does not establish an executable option. A two-way swap is not applicable to
an empty source seat without another actual assignment to exchange. Discretion,
delay and cancellation are not substitutes for filling a new pairing's empty seat.

Eligibility, legality, pricing and coverage are separate states. Use authoritative
legality preview for the complete changed roster, not builder validation or a fleet
label. Do not inherit any soft qualification exception that would allow an
unqualified new assignment. Keep local feasibility and rule results visible.
Costs use the existing library currency, tariff and credit basis; no Case 4 tariff
or invented zero-cost fallback. Revalidate seats and operational snapshots before
Apply/Save and use existing locks and transactional draft execution.

Coverage must be reported for the target and affected donor pairings, by required
rank and applicable segments. No overfilling, no replacement of already assigned
crew in the open-seat path, and no completed-duty reassignment. A legal individual
assignment can still leave overall recovery Partial.

## Integration and compatibility

Source inspection found no Case 4 entry/fixture/Help topic. Reuse these existing areas:

- `gantt/src/components/roster/context-menu.tsx`: flight and pairing entries.
- `gantt/src/components/recovery/recovery-violation-dialog.tsx`: common Recovery
  presentation, costs and preview; retain the existing alert entry contract.
- `gantt/src/services/recovery-candidates.ts`, `recovery-draft.ts`,
  `recovery-trigger.ts`: current alert-based strategies and execution.
- `gantt/src/services/roundtrip-api.ts`, `components/roundtrip-pairing/`,
  `stores/roundtrip-builder-store.ts`, `utils/pairing-build-focus.ts`: creation,
  preview and top-row focus.
- `live-server/src/services/pairing/roundtrip-service.ts`, `roundtrip-chooser.ts`
  and `pairing-build-service.ts`: search validation and persistence.
- Existing assign-pairing draft utility, best-fit candidate support and Recovery
  Cost Library routes/services: reuse where their contracts fit an empty seat.

Introduce explicit incident context for unpaired-flight, open-pairing and existing
violation-based recovery. Do not synthesize a crew assignment or fake rule 1001/8004
to drive the old planner. Keep source differences behind Gantt capabilities. Initial
write scope is Live because the current writer persists Live pairings; Scenario must
not invoke Live writes. Shared presentation remains reusable.

Preserve Cases 1–3 entry conditions, strategy order, costs, retained-duty behavior,
legality checks, locks and draft semantics. Reuse common helpers without broad
refactoring. Keep candidate search on demand so Gantt first paint is unaffected.
Respect concurrent uncommitted work in Recovery, pricing, Help and case tests.

## Fixture isolation and restoration

Before writes, assemble protected manifests for all three cases, expanding source,
reserve and donor crews to their linked roster/pairing/physical flight records.
Case 1 (152056, Sep 24–25) and Case 3 (152227, Sep 18–19) overlap this window;
Case 2 (152675, Sep 29–30) remains protected despite being outside it. Existing
Case 1 manifest and Case 3 reset files are references, not generic reset commands.

Choose or seed a disjoint ET flight set and fresh qualified crew set, with genuine
standby and donor assignments and configured credit inputs that yield a visible
cost spread. Seed multiple valid alternative loops around one anchor flight, plus
an unclosable flight. Use application builders/assignment utilities for pairings
and roster setup. Never borrow a protected flight to complete a loop or protected
crew to increase candidate counts. Preflight explicit disjoint-ID assertions.

Capture prepared baseline and each strategy's changed record IDs/current values.
Test from equivalent starting states, then undo drafts or restore only owned saved
effects with concurrency checks. Restore crew credit, coverage, legality and relevant
caches through current utilities. Preserve audit history. Final replay state has
the Case 4 target flights unpaired, candidate crews/duties prepared, no pending
drafts, and Cases 1–3 unchanged. Verify through a fresh Live UI load.

## Verification and delivery

- Focused backend tests: anchor included in all options; alternate routes sharing
  legs; outstation anchor closure; airline/fleet/rest/time boundaries; unavailable
  flights; search-limit reporting; duplicate/concurrent builds; cache consistency.
- Focused recovery tests: true empty-seat context; partial rank deficits; preserved
  assignments; draft-aware capacity; standby costs; transfer removal/addition costs;
  target/donor Partial status; authoritative legality blocking; stale snapshots.
- Real Playwright: flight right-click → alternatives/chart → confirmed real build →
  row 1 → standby/available/move-up preview → draft → Save → reload. Independently
  exercise each delivered strategy, closing/resuming from a saved open pairing,
  partial pairing entry, no-route/conflict cases, and final reset.
- Re-run relevant Cases 1–3 UI regressions and compare protected manifests before
  and after every Case 4 write/reset phase. Do not run their seed/reset scripts
  indiscriminately. Report baseline failures separately from introduced failures.
- Capture and inspect versioned screenshots under `docs/assets/screenshots/crew-recovery/`.
  Update lazy Case 4 Help with only verified behavior and efficient real screenshots;
  add content/image assertions and run Help menu coverage and `npm run check:ui`.
- Update the recovery skill with delivered behavior and evidence links; record exact
  commands, PASS/FAIL, limitations and restoration receipt. Save durable development
  context after implementation. No commit or push is authorized.

This document is a design, not a claim of working Case 4 recovery, successful tests
or prepared database fixtures. Runtime implementation, Help publication and data
preparation remain outstanding.
