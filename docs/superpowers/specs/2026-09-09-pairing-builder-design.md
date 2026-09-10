# Round-trip Pairing Builder: Design for Review

Date: 2026-09-09
Status: Draft; Option C selected and revised as Option C Ver2. Production implementation approval pending.
Scope of this delivery: three interactive HTML design mockups and this specification.
No runtime application changes, database writes, or pairing repair runs are included.

## Goal and interaction

A planner opens Build Round-trip Pairings from the Pairing pane's existing right-side
icon cluster, configures a scope and rule parameters, and builds valid rotations.
Every successfully committed pairing appears at row 1 immediately; its predecessor
moves to row 2. The action can be repeated with settings retained for the open Gantt.

Use a Lucide Route icon with the current 20px square button / 12px icon and tooltip
"Build round-trip pairings". No extra toolbar row. Production dialog must use
@rois/ui AppDialog: blue title bar, title icon, close control, draggable window,
scrollable body, bottom-right actions, existing typography and theme tokens.

## Three HTML alternatives

### Selected revision: Option C Ver2

The user selected C and requested a search-first workflow. Current review artifact:
`./2026-09-09-pairing-builder-mockups/option-c-ver2.html`.
Original A/B/C remain available as historical design alternatives.

This revision supersedes the original C direct-build and static-preview descriptions:

1. Configure scope and rules, then click **Find open flights**. Results are not
   loaded or buildable before this action. Changing scope/rules invalidates the search.
2. Results list individual open flights, dates, routes, departure times and whether
   a valid return rotation exists. Results contain both outbound and connecting flights.
3. Select one flight to preview a complete base-to-base pairing containing it.
   Selecting a flight at an outstation includes earlier/later connecting segments
   as required. It does not authorize a stranded one-segment pairing.
4. Selected flight: **Build pairing** creates only its complete previewed rotation.
   No selection: **Build all (N)** processes all eligible open flights in scope,
   deduplicating shared rotation segments. **Clear selection** restores batch mode.
5. No valid rotation: selected build is disabled and the reason is visible.
   Batch mode leaves such flights unpaired rather than violating the build rules.
6. The preview explicitly supports two sample patterns:
   - DXB -> LHR, **layover at LHR**, LHR -> DXB. Two duties, 20:00 ground
     interval and 17:45 free rest after 15-minute debrief and before 120-minute
     next check-in. Ground interval and free rest are shown separately.
   - DXB -> MCT -> DOH -> MCT -> DXB. **Four segments, one duty, no layover**,
     04:00 total block, three 00:45 turns. A segment table shows the complete chain.
     Short turns never appear as rest or new duties.
7. Each completed sample build inserts a full pairing at the pane top and consumes
   its fixture flights so subsequent searches cannot build the same flights again.

The Ver2 prototype filters a fixed local sample fixture by base/fleet/date and
checks its pre-grouped rotations against edited block/rest settings. It demonstrates
candidate states and UI behavior, not a general flight-search or optimization engine.
Pilot composition controls remain editable. No live search or database writes occur.
The production selector/rest accounting decisions below still require implementation
review; prototype fixture behavior does not certify real-world crew legality.

Ver2 validation command:
`node docs/superpowers/specs/2026-09-09-pairing-builder-mockups/verify-c-ver2.cjs`.
PASS: search/date guards; scope filtering; explicit layover; four-segment no-layover
preview; cap failure; unclosable flight; single/batch builds; deselection; newest-first
ordering; reuse prevention; empty results; mobile bounds and no JavaScript errors.
Screenshots from the same runs:
`docs/assets/screenshots/gantt/pairing-builder-option-c-ver2-*-Ver<N>.png`.

### Original alternatives

- A: Compact form. Scope, composition and rules together. Recommended for frequent
  planner use: least navigation and easy inspection of all editable inputs.
- B: Guided steps. Scope & crew, Rules, Review & build. Less simultaneous information;
  additional navigation. Previous values remain editable using Back or step navigation.
- C: Review workspace. Settings on the left, scope summary and route preview on the
  right. Better for inspecting candidate details, but requires a wider dialog and a
  real preview contract if selected. Narrow screens stack the two regions.

Files: ./2026-09-09-pairing-builder-mockups/option-{a,b,c}.html.
The HTML files share local CSS, JavaScript and Lucide artwork; no network dependency.
All route examples, counts, IDs and build outcomes are explicitly sample data.
The prototype does not implement flight selection or validate sample routes against
edited settings. Its Build action demonstrates progress and row ordering only.

## Scope and settings

- Date range: initialize from the active Gantt's selected working range, not the
  horizontally zoomed viewport and not extra loaded lead-in/out buffers.
  Both bounds must remain within that open range; start <= end.
- Display the active Gantt timezone beside the date controls. Convert calendar bounds
  to UTC using existing timezone utilities; do not parse local dates as UTC.
  Prototype uses an illustrative 01-30 September 2026 UTC open Gantt.
- Proposed strict containment: first check-in through final debrief must fit inside
  the selected range. Final trailing home-base rest is displayed but does not extend
  flight-search scope. No out-of-range continuation legs to force a return.
- Pairing base: one per run. Defaults to current pane base when unambiguous.
  Skill 143 examples use DXB/EK and ADD/ET. Production options must come from
  authorized reference data and available flights, never a new airline hardcode.
- Fleet: one per run; eligible flights stay within that fleet.
- Division/ranks: initial proposal is Pilot, CA/FO as in skill 143.
  Choose included ranks and positive integer required counts; no crew assignment.
  Narrow-body profile defaults CA1/FO1; wide-body profile CA2/FO2.
  Production ranks, fleets, bases and profile defaults come from reference/config data.
- Flight availability: unpaired active flights only, within airline/fleet/date scope.
  "Unpaired" means flight not used by another applicable active pairing, NOT a pairing
  whose crew coverage is Open/Partial. Pilot/cabin applicability must follow current
  domain coverage rules rather than assuming global uniqueness across all divisions.
- Rule 143 baseline: check-in 120 min, debrief 15 min, minimum rest 720 min,
  multi-segment duty block cap 480 min; single-segment long-haul exemption enabled.
- Proposed profile editing: minimum rest can increase; multi-leg block cap can decrease;
  single-leg exemption can be disabled. Profile guardrails cannot be weakened.
  Check-in and debrief are editable nonnegative integer minutes, subject to configured
  organizational limits. Numeric limits must be server enforced and config sourced.
- Reset restores profile defaults; close/reopen retains session choices. Changing
  context/range revalidates scope. Changing fleet proposes its composition defaults.
  Production must preserve explicitly customized counts or clearly confirm replacement.

## Mandatory rule semantics

1. Ordered first departure and last arrival must equal selected base.
2. Every adjacent segment connects at the same airport, including across duties.
3. No temporal overlap; each selected flight occurs once within a run and is
   rechecked for applicable existing coverage before persistence.
4. Duty boundaries require real elapsed ground time meeting the configured minimum.
   Block caps never create rest or fictitious duty boundaries.
5. Multi-segment duties obey configured block cap. When a chain exceeds it,
   search a later continuation with a real qualifying layover.
6. Single-segment long-haul exemption does not waive rest, continuity or return to base.
7. Flights without a valid in-range return remain unpaired, with a reason count.
8. Do not delete or reshape existing pairings. Repair/full rebuild from the skill's
   destructive test sweep is explicitly outside this feature.

Rule 143 is a development reference, not a callable production skill runtime.
Extract/reuse its chooser logic as tested application code; do not launch an AI
agent or invoke an E2E test from the user action.

## Existing service details that affect correctness

The current POST /api/pairing/build accepts flightIds and builds as-is with warnings.
It does not enforce the new automated chooser's hard constraints.
Existing manual build behavior must remain compatible; do not silently tighten it.

pairing-build-service.ts currently separates CHECKOUT_MIN=0 (duty accounting)
from DEBRIEF_MIN=15 (display/dropoff), and computes post-duty rest as
max(REST_FLOOR_MIN, duty period). Its duty splitter tests arrival-to-departure gap.
Those are different time concepts. The eventual selector and persisted timestamps
must share a reviewed parameter definition; do not assume a 12h ground gap means
12h free of duty after debrief and before the next check-in.
Recommendation: preserve existing accounting semantics, apply the stronger applicable
rest requirement during candidate selection, and cover long-haul boundary examples
with focused tests. This remains a design decision before implementation approval.

The skill's statement that pairing_segment.flt_id has no FK is stale:
sql/schema/live/02-crew-roster.sql declares fk_ps_flight and fk_ps_pairing.
Use the authoritative schema and existing write service, including composition rows.

## Proposed integration

Shared pane action/dialog, gated by a source capability for build support.
Initial recommendation: Live write support only, because the existing build endpoint
writes Live pairings. Scenario must not call that endpoint accidentally; adding Scenario
writes requires a scenario-specific adapter and edit-lock/persistence contract.
This delivery does not assume Scenario build support has been approved.

Expected touched areas during implementation:
- pane-condition-strip.tsx and the actual Live/shared Pairing pane entry paths.
- Gantt source capability and context-scoped build/row-order state.
- New shared AppDialog, existing reference APIs and pairing API client.
- live-server pairing routes/services, validated scope/config loading and chooser.
- Existing pairing content writer, cache invalidation and update notification pattern.
- Focused backend tests and real Gantt Playwright coverage.

Server flow: validate context/permission and parameters; query scoped eligible flights
in batches; index connections by station/time/fleet; choose base loops; revalidate and
commit one pairing atomically; return its complete canonical row and a monotonic build
sequence; repeat and report created/unpaired/failed totals.
Use authenticated source context, no client-selected database schema.
Selection is deterministic with stable flight-ID tie-breaking.
Implementation plan must select the smallest existing progress transport that supports
incremental commit receipts and reconnect/reconciliation without duplicate creation.
Do not promise a greedy chooser covers all flights or finds an optimal solution.

One committed pairing is one visible success. Partial failure preserves committed
rows and reports the failing/remaining candidates. Repeated submissions require an
idempotency mechanism; concurrent builders must atomically prevent conflicting
applicable flight use. Client-only disabled buttons are insufficient.
No full dataset refresh per row. Insert returned entities incrementally and invalidate
the appropriate caches after commit.

## Newest-first ordering

Maintain deduplicated newly-created IDs in context-local completion order:
[C,B,A] after A, B, C complete. Never infer creation order from bigint IDs.
Resolve rows by stable pairing identity. Render header, pucks, selection and hit-testing
from the same ordered collection. Scroll to row 1 on a committed creation.
A temporary "newly built" top tier takes precedence over saved sort and frozen/found
tiers during the run; restore normal tier behavior when the planner clears the result
focus or explicitly sorts again. Preserve existing frozen IDs, never rewrite them.

To meet unconditional visibility without silently changing filters, result focus shows
the returned created rows even when current pane filters would exclude them, labels
that focus, and allows clearing it. This is an explicit proposed overlay; it does not
change stored filter settings. Reconcile rows without duplicates after refresh.
This tier is view state, never a database ordering field.

## States and validation

Production states: loading reference options, ready, invalid scope, searching,
no candidates, building with committed count, completed with unpaired reasons,
partial failure, stale scope/flight conflict, permission denied.
Do not show guessed preview counts as authoritative. B/C previews must be generated
from current settings; editing settings invalidates prior preview.
Progress closes only after committed rows are reconciled. An eventual stop action
would stop future work, not undo committed pairings; not included in the mockup.
Prototype disables closing during its short sample build.

## Acceptance and verification scope for implementation

Backend unit/integration:
- Base return, cross-duty station continuity, overlap, unique applicable coverage.
- 480-minute boundary, single-leg exemption, later-day valid continuation.
- No fabricated rest; long-haul required-rest and check-in/debrief boundaries.
- Timezone/DST, inclusive date boundaries, invalid ranks/fleet/base/parameters.
- Atomic content/composition writes, conflicts, idempotency and cache consistency.
- Existing manual build/warning behavior remains compatible.

Real UI Playwright:
- Exact pane cluster placement, AppDialog opening, edit all settings, reset/reopen.
- Out-of-Gantt dates blocked; in-range controls work in active timezone.
- Real build through UI yields committed server IDs, complete rendered segments.
- A -> B -> C produces [C,B,A] at top, even with existing sort/filter/frozen state.
- Subsequent build prepends again, refresh deduplicates, partial failure stays truthful.
- Context switch and Scenario capability isolation.
- Desktop/narrow layout, keyboard focus and screenshots in the same run.
- No full-data reload per created pairing; existing first-paint budget unchanged.

Run focused existing planDuties/build tests and warning/integrity tests, then
npm run check:ui and relevant module checks. Read-only audit uses an explicitly
coordinated remote fixture scope. Never run the destructive full rebuild sweep
as routine feature verification.

## Design review decisions

Select A, B or C first. Before implementation, confirm the proposed Live-first scope,
strict date containment, stronger-only rule adjustments and result-focus precedence.
Resolve rest-time accounting above using a concrete multi-duty example.
No implementation approval is inferred from merely viewing an HTML option.

## Prototype verification receipt

- PASS: `node --check docs/superpowers/specs/2026-09-09-pairing-builder-mockups/mockup.js`
- PASS: `node docs/superpowers/specs/2026-09-09-pairing-builder-mockups/verify.cjs`
  All three layouts: date bounds, editable settings, crew defaults, reset/reopen,
  two consecutive sample builds with newest-first order, closing, no JavaScript errors,
  desktop 1440x1000 and narrow 390x844 bounds. These are prototype UI tests, not live builds.
- PASS: `npm run check:ui` with 0 hard violations and 124 existing warnings.
  This repository gate scans product source; it is not a standalone HTML validator.
- Screenshots: `docs/assets/screenshots/gantt/pairing-builder-option-{a,b,c}-{desktop,mobile,results}-Ver1.png`.
  Desktop A/B/C, narrow C and sample-result A images were visually inspected.
- The in-app browser was unavailable; local Chromium Playwright was used instead.
- No backend tests or real database build were run because this delivery is design-only.
