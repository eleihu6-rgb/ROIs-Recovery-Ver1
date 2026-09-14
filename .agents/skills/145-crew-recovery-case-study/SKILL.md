---
name: 145-crew-recovery-case-study
description: Prepare and test crew recovery cases for unavailability, flight delay, unpaired flights and open or partially staffed pairings; reuse recovery approaches, isolate fixtures, record UI evidence, publish supported Help and restore baselines.
---

# Crew recovery case studies

Use this skill when preparing or documenting a concrete crew-unavailable, flight-delay or related recovery incident for
Gantt Help, especially when the case must be reproduced through the real mobile
crew UI and the real controller/Recovery UI. This is a case-study workflow, not
a generic recovery explanation and not permission to mutate unrelated roster data.

## Shared Cases 1–4 workflow and Case 4 decisions

Ryan confirmed these product decisions on 2026-09-14. Case 4 implementation and
real-UI build/staffing/reset evidence are recorded in
`docs/test-cases/crew-recovery/2026-09-14-case4-delivery-Ver1.md`.
Always recheck current source and prepared data before replay.

- Reuse the existing Recovery UI and common roster strategies across Cases 1–4.
  Once a pairing has an open required seat, standby callout is a common approach;
  select it by actual availability, location, qualification, legality and cost,
  not by incident number. For Cases 1–3, retain the existing assigned-source
  replacement/absence workflow; do not de-assign crews merely to manufacture an
  open-pairing entry.
- Unpaired flight → right-click Recovery → **Pairing Options** first in the left
  strategy list. Show alternative complete rotations containing the selected flight
  on the right, with a chart and segment/duty/rest details. Reuse the round-trip
  builder and its validation; a skill is development guidance, not a runtime API.
- Case 4 construction uses **unpaired flights only**. Never extend, split or reshape
  an existing pairing. Each option must be a same-airline, exact-fleet base-to-base
  loop; explain when no valid option exists. Its prepared case uses ET flights in
  **17–25 September 2026**; ADD is the prepared home base. These fixture dates and
  airline are not universal product restrictions.
- Confirming **Build pairing** commits a real pairing and brings it to row 1 of
  the Pairing pane, then populates roster options from its persisted composition.
  Closing Recovery preserves that pairing even if no crew assignment is saved.
- Any open or partially staffed pairing can reopen Recovery directly at roster
  options, **without Pairing Options**. Fill remaining required rank seats only;
  preserve existing assignments and never overfill the composition.
- Reuse standby eligibility, authoritative legality preview, Cost Library pricing
  and breakdowns, and **Preview → Apply draft → Save**. Case 4 standby pricing has
  no special tariff: use the same applicable GH/standby-credit calculation as the
  other cases. Missing cost inputs remain Unpriced, not zero. Pairing construction
  validation alone does not establish a particular crew's roster legality.
- Evaluate available-crew assignment, standby and move-up/transfer where supported.
  A move-up must expose donor changes and remaining vacancies; it is not a two-way
  swap when the new open pairing has no source crew. Ryan allows a move-up to leave
  a donor vacancy only with a prominent remaining-vacancy warning and overall
  **Partial** recovery status. Filling one seat is also Partial until every required
  seat is covered; a fully staffed target does not clear an unresolved donor vacancy.
- Prepare independent Case 4 flights, crews, candidate duties and a scoped baseline
  manifest. **Never reuse any Case 1–3 flight, pairing or crew for Case 4**, including
  standby candidates, donor crews and their linked duties. Enforce disjoint ID sets
  against all three protected manifests before fixture writes; separate pairing IDs
  do not isolate shared physical flights or shared crews. Cases 1 and 3 overlap the
  requested dates. Compare the protected records before and after testing/reset.
  Test each roster strategy from
  an equivalent baseline through Save/reload, then restore Case 4 to its prepared
  **unpaired-flight** state for Ryan's replay, preserving Cases 1–3 and audit history.
  This deliberate test reset is separate from normal close behavior, which keeps
  the created pairing saved.

### Shared staffing presentation standard (Cases 1–4)

- All three open-seat strategies — Standby Crew, Available Crew and Move-up / Roster
  Transfer — use the existing `PlanGroup` and `RecoveryDetailDialog` from the
  Recovery wrapper, injected into `OpenRecoveryWorkspace` to avoid a runtime import
  cycle. Do not reintroduce a separate minimal candidate-card implementation.
- `open-recovery-presentation.ts` adapts open-seat candidates to `RecoveryOption`;
  keep the source crew empty (no displaced crew), retain the standby and show the
  donor release as a vacancy, not a fictitious two-way swap. Cost rows/notes come
  directly from the Cost Library; null cost remains Unpriced.
- The left rail is also shared: inject existing `PlanTree` after pairing creation,
  including **By strategy**, **By cost tier**, method counts and cheapest-method star.
  Cost tiers bucket each method by its minimum priced executable option; selecting
  a leaf selects that entire method, not only candidates within the numeric tier.
  Exclude unpriced/non-executable options and do not compare mixed currencies.
  Pairing Options stays first only while no pairing exists.
- Automatically detect all three staffing strategies when saved pairing details load
  (including immediately after Build pairing); default to the first open rank and
  refresh automatically on rank or ruleset changes. No Find roster options button.
  Keep discovery stable during Preview/crew floating and method switching; actual
  roster changes are guarded by Preview/Apply fingerprints, not array ordering.
- Standard controls: All / Executable / Filtered, crew/name/rank, Cancel / Add /
  Stability / Cost, execution checkbox, row Preview / Detail and clickable cost.
  `RecoveryPreviewDock` is shared across incident types. Eligibility checks must
  finish before showing Executable; Preview and Apply still revalidate.
- Regress every strategy’s cost dialog, before/after details and compact preview,
  plus Cases 1–3. For UI-only follow-ups, use an existing saved Case 4 pairing
  read-only and leave it intact; do not reset user-created pairings. Report Save
  as unrun when the validation stops at Preview rather than claiming full execution.

### Wide-window search and display regression

- Anchor recovery searches at the selected flight, connecting backwards to base then
  forwards to base. Seeding every earlier base departure can exhaust the search budget
  before the incident is visited. Prefer direct base connections within the bounded search;
  incomplete search is not proof that no valid route exists.
- Verify the actual anchor date and exact fleet, not flight number alone. Include wide
  Gantt-scope replay (Aug25–Oct07, ET895 Sep19) as well as the Sep17 prepared fixture.
- Match Cases 1–3 shell, compact strategy rail and fixed footer without modifying their
  legacy workflow. Long layovers use explicit gaps between duty-local chart scales;
  keep flight labels outside bars and disclose independent scales.

### Dashboard handover entry point

- `gantt/src/config/recovery-cases.ts` feeds both Disruption Cases and the handover
  Related case dropdown. Case4 points to prepared Sep17 ET895 flight159578, never
  a deleted test pairing. Show unassigned/build-first until the planner builds.
- Operational causes are sick leave, flight delay, aircraft fleet change and ad hoc
  new flight; rule codes are diagnostic context, not the disruption cause.
- A new follow-up found shared data drift against the older protected snapshot.
  Audit first; do not overwrite newer scenario/crew changes with a historical reset.

### Implemented Case 4 references and replay cautions

- Runtime: `recovery-pairing-options.tsx`, `open-recovery-workspace.tsx`,
  `open-pairing-recovery.ts`, backend `pairing/recovery-rotations.ts` and
  `recovery/open-pairing-gh-cost.ts`. The exported Recovery wrapper preserves
  legacy violation recovery; the open-incident branch is separate.
- Prepared target: ET895/ET894, ADD–BJM–ADD, 17 September; search window 17–25
  September 2026. C4001–C4020 are the isolated candidate cohort, fleet 738.
  ASBY must cover the **05:15 UTC report**, not merely 07:15 departure;
  the prepared standby window is **04:00–12:00 UTC**.
- Preserve saved calendar-month credit for pricing. Available pilots also need
  a genuine saved/recomputed credit baseline; never replace missing inputs by zero.
- On macOS, raw pg `timestamp without time zone` can appear shifted in JSON.
  Verify `column::text`/`to_char` before correcting times; do not "fix" a parser offset.
- After normal Save, Case 4 waits for the in-flight pairing-list refresh and then
  reconciles only its affected pairing details. Without that ordering, a stale
  own-save WebSocket list response can overwrite the new full-seat coverage.
- Private protected records, fixture baseline and audited reset scripts live in
  `.local/case4/`; do not publish their raw snapshots. Reset donor assignments
  through the roster service, restore callout markers, and verify semantic roster
  equality (IDs/audit stamps and derived duty timezone cache fields may change).
  Soft-delete the exact test target only after it has no active assignments; retain
  its execution history. Generic pairing delete physically removes history, while
  generic remove-flight currently rejects even historical deleted roster rows.
- Cases 1–3 read-only regression lives in `recovery-cases-1-3-readonly.spec.ts`.
  Case 1 uses Alert Center’s selected SL/FLY overlap; Case 3 source is L3002,
  not the previously transferred L3001. Do not reseed protected cases to make a test pass.

## Choose the approach from the incident

Establish the disruption's effective time, crew's physical location, flown versus
future legs, complete duty/report history, qualification and seat requirements,
previous/following rest, and all linked crews/pairings before choosing a method.
Distinguish the operational trigger from a recovery action: publishing a delay
that creates FDP exceedance is different from delaying a flight to clear an overlap.

| Incident | Approaches to evaluate | Decisive constraints |
|---|---|---|
| Before-report illness/no-show | Standby, available-crew move-up, delay with a qualified replacement, cancellation | Keep source assignments for the approved SL/1001 workflow. An unavailable crew cannot receive the donor duty during the absence; a move-up may need a third crew or leave an explicit vacancy. |
| Qualification expiry/mismatch | Qualified replacement, compatible duty swap, positioned replacement | Verify effective qualifications and rank on every received segment. An enabled button or soft fleet warning does not prove compliance. |
| Published delay before departure | Discretion where permitted, standby, compatible swap, cancellation | Recompute complete FDP and downstream rest using the revised estimate. Both crews must be at the handover location and legal for their received duties. |
| Outstation delay/AOG or illness after departure | Local ready reserve/donor, positioned replacement, eligible rest/split-duty plan, cancellation/release | Preserve flown legs. Include positioning time/duty and connections; home-base reserve is not local reserve. Do not exchange already-operated complete pairings. |
| Extended ground hold | Split duty or delayed reporting only where the applicable rules allow; replacement/cancellation | Verify qualifying break, facilities, notice and actual report history. A long wait is not automatically rest or an FDP reset. |
| Diversion/misconnection | Future-leg reassignment, positioning, revised connection, cancellation/release | Use actual arrival airport/time, minimum connections and remaining FDP; protect the operated history and evaluate donor coverage. |
| Stranding/pay-protected release | Release with onward recovery/transport/accommodation as needed | Validate governing contract/pay policy separately from roster legality. A roster removal or GH estimate does not establish pay protection or a booking. |

These are evaluation routes, not claims that each is implemented. Inspect current
UI/service support and the active governing rules before promising execution.
Record rejected strategies with reasons; do not force a narrative's fixed number
of feasible candidates. Discretion cannot exceed the legally permitted extended
limit even with consent. Augmentation requires the applicable staffing, facilities
and rule conditions; extra crew or a later departure alone does not establish it.

Distinguish **swap** (two-way future-duty exchange) from **move-up** (replacement
with donor coverage handled separately). Show all removed/received duties, required
seats, and residual vacancies. Legal assigned duties with an open required seat
are a Partial recovery, not a fully covered departure. Reassignment never resets
elapsed FDP or supplies physical positioning by itself.

## Protect existing cases; reuse creation functions

For Case 2, Ryan explicitly requires Case 1 to remain uninterrupted and a different
crew set. Exclude the source, reserve and donor crews from the protected Case 1
manifest, not just J4002. Use separate pairings/rosters and physical flight records:
distinct pairing IDs alone do not isolate a shared-flight delay cascade. Keep
Case 2 setup/reset manifests independent and compare Case 1 before/after writes.
Apply equivalent isolation to later cases when earlier demos must remain available.

Use existing application functions to create needed pairings and roster assignments,
as authorized for Case 2; discover the current build/assign paths and their module
instructions first. Use complete base-to-base fixtures with valid rank/seat/fleet
coverage. Verify any candidate crew's other assignments before reuse. Do not clone
Case 1 IDs, introduce a parallel creator, or bypass application invariants with raw
inserts. Exercise user-facing creation/recovery through real UI and validate its
visible outcome; record separately any authorized fixture setup done through services.

## Published-delay cases: source and execution boundaries

### Reuse the existing recovery framework

Ryan directs Case 2 to reuse QIUXIA81's functions and substantially the same UI as
Case 1. The [implementation study](../../../docs/modules/crew-recovery/2026-09-12-cases-102-104-study-Ver1.md)
maps QIUXIA81 to Git author `xigang.hang`; commits `dcc2cb5` and `6237137` contain
the overlap trigger, swap/delay options and Apply integration. Verify current source,
since later shared-framework and cost fixes supersede parts of that historical study.

Reuse `recovery-trigger.ts` for entry eligibility, `recovery-candidates.ts` for
candidate/before-after models, `RecoveryViolationDialog` for the option tree,
All/Executable/Filtered lists, details, cost breakdown and Preview, and
`buildRecoveryDraftPlan` in `recovery-draft.ts` for execution plans. Preserve the
existing lock acquisition, draft store, Undo and Save paths. Swap duty uses two
removals plus two assignments; flight edits use the existing propagation service.
Do not build a separate Case 2 dialog or bypass the draft/Save boundary.

Adapt only the genuine case-specific trigger, eligibility, legal checks and option
data where existing functions need extension. Do not fabricate a 1001 overlap to
stand in for FDP exceedance or relabel the overlap delay method as S2 support.
The study's method numbers 102/103/104 are standby/swap/delay documentation IDs;
they are not incident numbers S1/S2 or proof of four S2 strategies.

For S2 preparation read the [case-specific feasibility record](../../../docs/superpowers/specs/2026-09-12-1744-S2-flight-delay-preparation-Ver1.md).
It leaves a business choice open between a before-departure SIN swap and the supplied
HKG-stranding story, which requires a physically reachable replacement. Do not
silently change the incident's location to make a candidate work.

At the September 2026 source review, Recovery's entry/method routing supports
1001/8004; `planFlightDelay` in `gantt/src/services/recovery-candidates.ts` handles a
ground-task overlap using ATD/ATA-shaped fields. Do not reuse that as proof of
published-ETD → FDP-alert recovery. Recheck current code before implementation.
`live-server/src/services/flight/flight-delay-propagation-service.ts` propagates a
physical flight change to linked pairing/roster records; manual and imported duty
windows have different handling. Inspect the flight route's recompute hooks and
verify the whole estimate → duty calculation → alert chain, including failures.

Keep scheduled, estimated and actual timestamps semantically distinct. Never write
a forecast as an actual departure merely to trigger a supported cascade. Preserve
report history and completed segments, and discover all linked duties before saving
the incident. Use the authoritative rule calculation per affected crew; do not infer
FDP legality from turnaround preservation or a generic maximum-hours constant.

Filter feasibility before ranking. Record direct-cost components, currency, roster
changes, reserve hours and passenger impact with actual configured scoring weights
and normalization. Missing commercial inputs remain Unpriced; GH-only savings do
not prove lowest total composite cost. Keep eligibility, legality, pricing and
execution state separate so a cheap invalid plan cannot become the recommendation.

Test publication, alert visibility and options readiness as distinct timestamped
events. User-story seconds are targets until measured. For multi-crew recovery,
verify Save/reload and failure behavior, no partially applied exchange, full required
coverage or explicit remaining work, and downstream rest. Keep notification/job
queued, sent, delivered, acknowledged and completed states distinct; customs/APIS,
passenger rebooking and pay posting require their own observed integration evidence.

## Discretion agreement: communication is not execution

Use the current crew-notify/mobile notification flow rather than a parallel inbox.
The controller sends one immutable proposal to **every assigned recipient**; crew
see the exact before/proposed report, release and FDP, requested extension, reason
and deadline, then reply Yes or No. Preserve recipient, actor, time and idempotency
key. One No, a missing reply, expiry or a changed operational snapshot prevents
reusing that consent. A new proposal supersedes the old one without deleting its
original decisions. Reloaded feedback must refer to the original requested snapshot,
not silently substitute current duty values.

Current S2 implementation is in `discretion-consent-service.ts`, the crew-app Alerts
screen, and the reusable `DiscretionConsentComposer` mounted under **Edit Duty
Nodes → Request FDP agreement**. It is not yet an Option 1 entry in Recovery.
Controller feedback and returning to review do not apply a roster change: the
server's `proceedAllowed` remains false until an independent, authoritative legality
execution contract exists. Verify the integration before describing it as supported.
Tests using identical before/after windows establish communication only; they do not
prove revised-ETD recalculation, extension eligibility or delay recovery. Do not
invent an extension limit, infer one from the requested minutes, or use consent to
bypass a failed extended-FDP check. Check active crew-app session credentials as
well as remembered-login credentials when validating receipt and reply.

## Required references

- Follow the Help authoring rules in [003-online-help-writing](../003-online-help-writing/SKILL.md),
  including code verification, lazy topic registration, screenshots, content
  regression tests, and user-supplied screenshot/versioning conventions.
- Read current source for the relevant Recovery, Alert Center, roster, and mobile
  request/submit paths before describing behavior.
- Use the case records:
  - [preparation memo](../../../docs/test-cases/crew-recovery/2026-09-12-S1-crew-unavailable-preparation-Ver1.md)
  - [execution memo](../../../docs/test-cases/crew-recovery/2026-09-12-S1-case-001-execution-Ver1.md)
    (when present; create/update it only under the user's explicit document scope).

## Case boundary and provenance

Anchor each case to one coherent incident: identify the unavailable crew, home base,
source pairing, affected dates and request identifier. List replacement crews, donor
pairings and any legitimate positioning bases separately by role. Preserve the
fixture provenance in before/after manifests. Do not blend another base,
pairing, or prior regression into the case as a continuation. If another issue
is relevant, link it as a separate case rather than silently enlarging this one.

Case 1 is ET captain Getnet Kifle, `J4002`, ADD, pairing `152056`, six legs.
Historical failed mobile submission and stand-down evidence stays in internal
execution memos; it is not the current client-facing story. Do not recycle old
request IDs or reset scripts as the current incident baseline.

## Case 1 retained-duty contract

The user-approved behavior is: **crew submits SL → original flying duty remains
assigned → SL/flying overlap triggers rule 1001 → controller opens Recovery →
compares standby, swap and delay → Preview → Apply draft → Save**. Retaining the
duty preserves the recovery source; submitting SL must not itself de-assign it.
The 2026-09-12 real Maestro submission showed “Request submitted” and “Sick leave
added. Original duties remain assigned pending Crew Control recovery.” Owned absence
10 / ILL row 1355740 preserved all six original source rows; controller Playwright
verified genuine ILL/FLY 1001 and three selectable standby candidates. Public Help
was checked separately. See the [retained-duty execution and reset receipt](../../../docs/test-cases/crew-recovery/2026-09-12-1730-S1-retained-duty-help-reset-Ver1.md)
for final evidence. A separate fresh-UI reset check verified the prepared controller
incident baseline: six original legs, CA 2/2 and FO 2/2 coverage, zero drafts,
prepared timed SL as the sole recoverable 1001, six swaps and three standby choices.
Submission success alone does not establish a completed reset. A controller/API-created SL is a separate setup method, never
evidence of successful mobile submission.

Distinguish absence windows: the mobile inclusive-date request creates a whole-day
ILL. In this fixture it leaves **zero same-day swap candidates**. The prepared timed
SL ends early enough for **six** same-day swaps. These are different test starting
conditions, not an engine change or interchangeable screenshots. Explain the timed
variant explicitly when demonstrating swap; never shorten real sick leave merely
to manufacture a candidate or infer medical fitness from a recorded end time.

Before submission capture the source assignment IDs, coverage and existing SL.
After submission assert one owned request and its linked SL, unchanged active
source assignments, and a recoverable 1001 in a freshly loaded Alert Center.
Only claim notifications, automatic recheck or crew-app confirmation when observed.
Test controller recovery one option at a time from an equivalent incident state;
an enabled candidate is not proof of successful committed execution.

## Evidence workflow

1. Capture the actual crew mobile UI and controller Playwright evidence. Record
   the request payload/result, visible errors, commit state, and timestamps.
2. Build before/after manifests for the owned crew, pairing, request, and only
   the directly affected duties. Preserve earlier absences and unaffected duties
   as explicit assertions.
3. Evaluate recovery options one at a time: option 1, preview, draft, and the
   Save boundary before moving to the next option. Keep preview/draft evidence
   separate from committed state.
4. Report failed or blocked options as failed/blocked. Never fabricate a
   candidate, cost, notification, coverage result, or successful recovery.
5. An after-submit error can occur after the server committed the change. Read
   authoritative state and compare it with the manifest before retrying; a retry
   can duplicate or overwrite the incident.

## Cleanup and demo reset

Maintain two explicit checkpoints: **prepared pre-submit baseline** (source duty,
reserve/donor duties and GH-credit fixtures) and **incident baseline** (same state
plus the owned submitted SL/request and 1001). State which checkpoint is left for
the client. Immediate controller replay needs the incident; a whole-story replay
needs pre-submit. Do not silently leave temporary SL behind or remove prepared
candidate duties that the next demonstration needs.

Reset in stages:
1. Undo unsaved drafts using the UI; assert zero draft operations.
2. For a saved option, preflight exact IDs and expected current values against the
   incident manifest. Restore only test-created target assignments, original source
   assignments and changed standby exception flags. A swap also requires the donor
   pairing and both crews. A saved delay requires a captured expanded baseline of
   affected flights, linked pairings and every impacted crew before execution.
3. Restore affected coverage, authoritative manday credit and legality using current
   application utilities; invalidate the caches listed below. Preserve audit history.
4. Compare owned and neighbouring records, reload Live, and assert original coverage,
   assignments, the expected incident alert and zero draft.
5. For whole-story replay, remove only this run's request/SL using the supported
   lifecycle, preserving older absences; verify pre-submit state in crew and controller
   UIs. If the lifecycle is unavailable, document the bounded reset and its receipt.

Stop on concurrent-state mismatch rather than expanding cleanup. Never restore an
obsolete fixture over another user's edits. SQL/API equality alone is not UI reset
verification, and cleanup does not authorize erasing audit or unrelated notifications.

For the retained-duty run, no absence cancellation endpoint was available: the
owned ILL was removed through `rosterApi.remove`, then the exact absence ID and owned
note were checked before marking that request cancelled. The soft-deleted ILL and
original submission notification were retained as audit. This is an internal scoped
reset, not a crew-app cancellation feature or a generic SQL recipe. The existing
full-month manday driver recomputed J4002 to 77:35. The manifest comparison preserved
older rows; `node .local/s1-sl/final-check.cjs` passed after fresh reload and saved
filter application. The remaining timed SL is the prepared controller-replay incident,
not the cancelled mobile ILL and not a claim of a pre-submit/no-absence baseline.

## Source and data traps

- Recovery entry and candidate discovery depend on current assigned-pairing alert
  support (`1001` overlap and `8004` qualification in the Case 1 implementation).
  Do not de-assign the source as fixture preparation for this overlap workflow.
- For date/timestamp fields that have no timezone, query or compare as
  `column::text` where appropriate. Avoid machine-local timezone conversion
  changing the observed date.
- Keep credentials, tokens, passwords, and private connection strings out of
  skill files, Help articles, manifests, screenshots, and test fixtures.
- The root runtime `version.tmp` policy overrides stale Help-skill instructions
  that require bumping a tracked `FRONTEND_VERSION`; follow the current root
  policy for versioning.

## Help delivery

Write only what the case evidence supports. Mark incomplete UI/backend behavior
as `Partial` and state the limitation. Follow the user’s requested ordering (Case 1 follows Comparing recovery costs);
append later numbered cases in a coherent case-study sequence, register its body with a lazy import, and add a
specific content regression assertion. Capture only real UI screenshots, put
them at the user-supplied/versioned locations, inspect them, and keep unrelated
topic images unloaded until the topic is opened. Run the focused Help checks and
report exact PASS/FAIL receipts and any unrun UI/reset verification.

For a client-facing case, narrate the current operational path and decision, not
obsolete defect investigation. Omit the historical “Unable to submit” screenshot
and stand-down failure narrative from Case 1 as requested. Keep those original
artifacts/internal memos rather than deleting history. Separately label verification
scope: previewed, applied/undone, saved/reloaded, and restored. A clean narrative
does not permit claiming untested Save, CCX, APIS, crew acceptance or payroll posting.

## Reusable case record

For each new case, record:

- Case number, business objective, observed status, environment/version and clock/timezone.
- Unavailable crew ID/name/base/rank/fleet, source pairing and every affected leg;
  identify replacement and donor crews separately. Verify effective qualifications,
  not merely fleet labels or the ability to click Apply.
- Baseline manifest, allowed mutations, reset method and preserved neighbouring duties.
- Step table: **step / crew-control actor / crew actor / module or model / exact UI action /
  expected result / actual result / status / screenshot / persistent IDs / remarks**.
  “Model” means the actual component/engine used; write “not invoked” where no
  engine ran. Do not substitute an assumed AI model for the application's workflow.
- Per-option evidence: eligibility, legality result, cost currency and components,
  score weights, reserve hours, donor/downstream changes, preview/draft/Save result,
  notification/execution state and reset receipt. Use “not generated” rather than zero
  when costs or candidates are unavailable.
- Separate functional pass, blocked workflow, and client-demo readiness. Include
  replay instructions and operational limitations; retain investigation details and
  outstanding defect evidence in the internal execution memo.

Start each option from an equivalent incident state. Undo unsaved drafts through
existing UI controls; restore committed option effects only using a scoped,
preflight-checked reset. Never reuse Case 1's numeric IDs as a generic reset script.

After any direct authorized restoration, refresh the affected roster version,
pairing detail/composition **and pairing-list caches** using current invalidation
utilities. Case 1's first reset left a stale CA(2:1) list badge despite CA 2/2 in SQL.
Assert displayed coverage as well as assignment IDs after a fresh UI load. Preserve
honest audit timestamps; baseline restoration does not mean erasing audit history.

## Roster / manday integrity — mandatory for cost fixtures

Never create dummy `crew_manday_*` totals to manufacture GH prices. First persist
real roster duties/complete valid pairings, then run the existing Rust manday driver.
Verify actual assignment IDs and duty-grained credit against recomputed daily credit;
recompute in a rolled-back transaction to prove saved totals reproduce from roster.
Saved future duties contribute planned calendar-month credit, not already-flown time.
Do not change tariffs, standby duration or qualification labels to force a spread.

Case4 GH pool follow-up: C4002–C4008 are seven existing isolated CA standby crews.
Six supporting saved pairings were added only to C4004/5/6; recomputed September
credits83:20/84:15/89:25 produce USD75/185/326.25 for Sep17 pairing152689, while
C4002/3/7/8 remain USD0. All seven passed real UI Preview and a full Rust manday
reproduction test. Keep these supporting assignments for review, and do not apply
older Case4 baseline/reset scripts over the enhanced fixture. See
`docs/test-cases/crew-recovery/2026-09-14-1540-case4-gh-pool-Ver1.md`.

## GH comparison and candidate visibility

- Case 2 requires **at least six selectable candidates per crew-based method**
  (standby and swap/move-up) with materially distinct calculated costs. Filtered rows
  do not count. Build valid distinct crew/roster contexts using existing functions
  and pricing inputs; do not invent prices or change shared tariffs/rules to force
  differences. Verify each breakdown and preview in fresh UI from the same incident.
  Six individual pilots do not prove six complete augmented-crew solutions: track
  every required seat and distinguish individual choices from complete team plans.
  Discretion/cancellation have no replacement-crew selection requirement. A story
  claiming no qualified reserve must be revised if its fixture supplies six choices;
  do not present both claims as the same incident. See the S2 preparation for scope.
- Use saved **calendar-month** roster credit from the existing manday driver, not
  RP MCred or invented aggregate edits. Assigned future credit is not already-flown hours.
- Airport standby pricing deducts the previously credited ASBY duty. Swap-duty
  pricing must calculate **both** crews' `Pay(before − removed + added) − Pay(before)`
  through the Cost Library guarantee calculator, retaining source savings. Show
  GH-only estimates as such; they exclude other operational costs.
- Read `standby-gh-cost.ts` / `swap-gh-cost.ts` under live-server recovery services
  for current supported context and policy rules; unsupported/missing data is
  Unpriced, never a free option. Do not map an incomplete swap into ordinary fees.
- Check donor **fleet on every segment**, effective crew qualifications, base-return
  routing, report date in the actual UI business date, and both crews' rule results.
  A fleet warning can coexist with an Executable badge. Later UTC report can fall
  on the next base-local date and disappear from same-day candidate search.
- Fill only available rank seats. Multiple candidates may legitimately hold
  different captain seats on one donor pairing; do not overfill or manufacture duties.
- Recovery currently searches loaded Live crew/roster data. If a second browser
  shows fewer candidates, refresh its roster scope (including candidate crews) and
  reopen Recovery; an already-open dialog can retain an old snapshot. The preview
  shows the two affected crews, not the full candidate list.
- See the [six-candidate swap evidence](../../../docs/test-cases/crew-recovery/2026-09-12-1445-S1-swap-gh-six-candidates-Ver1.md)
  for the case-specific fixture, failures corrected, and Apply/Undo versus Save limits.
