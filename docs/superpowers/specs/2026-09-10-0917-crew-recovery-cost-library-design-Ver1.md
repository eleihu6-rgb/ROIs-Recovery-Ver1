# Crew Recovery Cost Library: Research and Design

Date: 2026-09-10, 09:17 America/Vancouver  
Version: 1  
Status: Research complete; Ryan requested implementation after review; three HTML prototypes delivered with a separate verification receipt.  
Scope: Daily crew disruption recovery, configurable cost library, three interactive HTML design alternatives, and development business knowledge.

Update: GH and airport standby implementation now follow `2026-09-10-crew-cost-standby-tiers-Ver2.md`: GH 85, editable marginal tiers 85-90 at 1.2x and above 90 at 1.5x, plus standby credit with X=0.5/Y=1. Earlier 75-hour and fixed airport-fee examples below remain historical research examples, not current prototype defaults.

## 1. Recommendation

Ryan's clarified product target is daily recovery through this flow:

**Rust rule warning / actual violation, or a direct operational event -> disruption case -> case-specific recovery options -> legality and cost validation -> KPI comparison -> user decision or explicitly configured automatic selection.**

The user remains the decision authority: either selecting an option directly or delegating selection through a predefined policy. A warning identifies possible disruption; it is not automatically an actual violation. Major-disruption/storm optimization is outside this target and is retained below only as reference knowledge from R1.

Build one explainable, versioned cost model with three different user experiences: a catalogue for maintaining prices, a rule workbench for configuring calculations, and a recovery comparison workspace for understanding the resulting decisions. All three mockups must expose both prices and calculation logic, and all must reproduce the same results for the same inputs.

The fundamental pricing question is **what financial obligation changes because this recovery option is selected?** It is not the crew member's full salary, and it is not simply flight hours multiplied by an average hourly rate.

Keep four outputs separate:

1. Incremental crew cash cost: pay, premiums, positioning, accommodation, allowances and booking changes.
2. Other incremental operating cash cost: aircraft, ground and passenger expenditure, where available.
3. Economic effects: foregone contribution, displaced passenger-seat value and explicitly modelled future risk.
4. Operational measures: reserve consumption, distinct rosters changed, days off used, discretion events and remaining legal margin.

Legality, qualifications, required consent and mandatory contractual assignment order are eligibility gates. A cheap cost must never purchase an exception to these gates.

This is a design prototype, not an operational recovery engine, payroll implementation or new airline deployment. Demonstration values are synthetic or explicitly labelled source examples. No live roster, payroll or supplier writes are in scope.

## 2. Sources and Evidence Boundaries

### R1: JetBlue Recovery Manager Crew IP Recommendations

Local source: `/Users/kimi/Downloads/JetBlue Recovery Manager Crew IP Recommendations v5.1.docx`.

The filename says v5.1, while the document cover identifies version 3.0 dated 7 September 2012 and software version 2010. Treat its practices as historical JetBlue assessment material, including proposed capabilities and unresolved implementation notes, not present-day regulations or proof that all described features shipped.

Most relevant anchors:

| Anchor | Evidence relevant to this design |
|---|---|
| Sections 4.3.1 and 6.8 | Cabin working positions affect pay; F1 additional pay is explicitly not always protected after cancellation or modification. Equipment changes can change position assignments. |
| Sections 5.1.2, 5.1.20, 5.1.22 | Inter-airport transport differs from hotel transfer; transport affects usable rest; long ground sits can require rooms. Historical thresholds are not defaults for this design. |
| Section 6.2 | Accurate monthly credit comes from Rainmaker/FLICA rather than assuming the roster system owns current pay credit. |
| Sections 6.4-6.6 | Ordinary recovery horizons differ from major-event horizons; reserve types, report buffers, remaining reserve days, credit and seniority influence assignment. |
| Sections 6.6.3-6.6.4 | Reserve hierarchy and tie-break order differ for pilots and cabin crew. Lowest credit is one ordered criterion, not permission to bypass the others. |
| Sections 6.6.5-6.6.6 | Original pairing footprint, return-to-base, pay-protected release, reserve coverage and move-up consent matter. |
| Sections 6.7.1-6.7.3 | Language premiums, optional excess-language penalties, co-terminal transport, own/other-airline deadheads and seat availability. |
| Sections 6.7.5-6.7.6 | Team-split penalties and hotel availability by station/date; the historical solver could not share the layover limit across independently solved ranks. |
| Sections 6.7.7-6.7.12 | Protected activities, training partnerships and satellite-base positioning must survive recovery. |
| Section 6.9 | Operating/deadhead conversions need special off-plan/penalty treatment; move-up penalties can influence use of already assigned crew. These penalties are not invoices. |
| Section 6.10 | Deployment into the roster system and open-time availability periods are separate from generating a solution. |
| Appendix 9.1 | Pay-related codes include premium assignments, pay protection, trip-rig additions, additional reserve-day pay and paid absences. Code names alone do not specify the payable formula. |

Embedded UI images were inspected, especially the recovery parameter screen with primary objectives, overall cost tolerance, deadhead/ground-transfer placement controls, conversion controls and layover tolerance. These are evidence of configurable recovery preferences, not an actual unit-price tariff.

### R2: Ethiopian Crew Recovery Case Samples

Local source: `/Users/kimi/Downloads/Crew-Recovery-Case-Samples-Ethiopian-Airlines-Ver10.docx`.

Dated 31 August 2026. A proposed daily-recovery case library: five worked examples, with additional scenarios listed for future customer discovery. It explicitly calls names, flights and prices illustrative and excludes mass disruption from its immediate scope.

Use section 1.2 for the action toolbox; sections 1.3-1.5 for feasibility, costs and approval; T1-01, T2-01, T2-02, T3-03 and T4-01 for worked cases; sections 3-4 for execution and KPIs. Do not represent these as validated Ethiopian payroll rules or measured operational outcomes.

### R3: iFlight Recovery Crew

Local source: `/Users/kimi/Downloads/IFLIGHT RECOVERY CREW.pdf`.

Three-page Chinese analytical narrative, not an identified official IBS product manual. Text and all three rendered pages were reviewed. It describes event detection, legality, reserve/swap/deadhead choices, logistics, decision packages, costs and controlled publication.

Page 2 introduces direct overtime/hotel costs and a weighted objective incorporating OTP and fatigue/satisfaction. Page 3 discusses contractual compensation, a USD 200 standby example, potential avoided delay compensation, notifications and downstream execution.

Its algorithm, latency, customer performance, certification and Copilot claims are **unverified statements in the supplied narrative**. Do not use the stated 3-10 second performance or customer improvements as an acceptance promise. Weighted objective scores must not be presented as monetary totals.

### Evidence Labels

- **R1/R2/R3:** explicit source concept, with section/page anchor.
- **U:** Ryan's requirement, notably individual guarantee-hour and higher-rate behaviour.
- **D:** proposed design extension needed to make the concepts operational; requires airline contract or supplier validation before production.

No source provides a complete authoritative tariff or guaranteed-hour payroll formula. The model below combines sourced cost categories with clearly identified design rules.

## 3. Findings to Resolve Before Operational Use

| ID | Source issue | Design treatment |
|---|---|---|
| F01 | R2 says delay cost rises steeply after two hours but specifies USD 60/min for the first 120 minutes and USD 25/min thereafter. | Preserve the published example as a declining marginal-rate curve, label the contradiction, and let users configure an approved curve. Do not silently reverse the rates. |
| F02 | R2 T2-01 shares a 120-minute unavoidable delay. Its additional 20-minute standby delay is priced at USD 1,200, but its published curve gives `D(140)-D(120) = 500`. | Compare full before/after cumulative cost, not an added-duration calculation that restarts the first band. Under the stated curve, USD 250 callout plus USD 500 delay would be USD 750. |
| F03 | R2 defines callout per person and rosters touched as people, but T2-02 prices a six-person standby team at USD 250 and counts a team as one reserve/roster. | Store person, team and duty counts separately. Expand a team into actual people before pricing. A six-person callout is USD 1,500 only if all six independently qualify for that USD 250 rate. |
| F04 | R2 T3-03 labels two actual callouts and two avoided callouts as near-zero net reserves, although the two belong to different qualification pools. | Display actual consumption by base/rank/fleet/time and avoided future demand separately. Do not restore two TYPE-L reserves because two TYPE-S callouts were avoided. |
| F05 | R2's cash total includes lost revenue/goodwill. T4-01 has a USD 45,000 ACMI total while the three displayed cash columns are zero. | Separate actual payable amounts, opportunity effects and nonfinancial scores. Every displayed total must reconcile to visible line items; ACMI belongs in an external-operations category. |
| F06 | R2 says always show at least three options. Some events have fewer feasible options. | Show the actual feasible options plus rejected reasons and search scope. Never fabricate alternatives or imply exhaustive global search. |
| F07 | R2 describes four downstream actions as firing together, and fallback to the next option after no acknowledgement. | Use explicit dependencies and partial-completion states. Revalidate and compensate prior commitments before any fallback; supplier actions are not one database transaction. |
| F08 | R1 describes ignoring some violations outside a legality window and changing rules with severity. | Preserve all history/future context needed to prove legality of changed assignments. Severity may select approved contractual policies, never suppress applicable statutory limits. |
| F09 | R1 uses historical rules and incomplete future-state notes; R3 has unsupported vendor claims. | Record source/version and validation status for every adopted rule. Neither is an operational regulatory authority. |
| F10 | R2 combines own-airline seat expense, passenger displacement, sick pay and pay protection without full before/after obligations. | Distinguish sunk cost, marginal cash, recoverable refunds and opportunity cost; never treat a released salary as automatically saved. |

These issues do not invalidate the case narratives. They establish why an executable, unit-aware cost library is needed before the examples become software requirements.

## 4. Daily Recovery Business Knowledge

### Event Matrix

| Event | Checks before selecting a recovery | Candidate actions and cost exposure |
|---|---|---|
| Sick call / no-show before report | Minimum complement, qualified replacement, contact and travel deadline, reserve eligibility | Airport/home/long-call reserve, swap with backfill, voluntary pickup/day-off recall; premiums, pay delta, transport |
| Sickness at layover / gate incapacity | Actual location, fitness, medical handling, border documents, remaining team legality | Local qualified relief, reposition replacement, rest/re-time/cancel; rooms, positioning, allowances and repatriation |
| Licence/medical/visa/recency issue | Validity through the whole proposed assignment; expiry and qualification authority | Replace or redesign assignment; a payment cannot override invalid qualification |
| Technical delay / retiming | Actual report, revised operating and release times, FDP/rest/connection margins, downstream duty | Keep legal crew, swap, reserve, lawful split duty, rest-and-return; additional credit, compensation, accommodation |
| Outstation breakdown | Aircraft ready time, legal crew-ready time, transport/seats/rooms available | Rest original crew, bring replacement, return original crew, rescue option; price both teams and the onward roster |
| Diversion / missed crew connection | Balanced revised aircraft path, actual crew location, duty consumed by positioning, documents | Deadhead/ground transfer, swap, overnight, rebuild pairing and return to base |
| Same-type tail swap | Current type/differences qualification, cabin complement, rest facility, equipment restrictions | Often no crew action and zero incremental crew cost, but only after checks |
| Type/variant or gauge change | Flight-deck qualification, cabin count and working positions, rest facility and augmentation | Qualified replacement, add/release cabin positions, reuse stood-down crew; position pay/protection and backfill |
| Flight cancellation / broken pairing | Crew return, remaining footprint, protected next duties, ticket/room refund conditions | Reassign, deadhead home, overnight, paid release; no automatic salary saving |
| Ad-hoc sector / demand up-gauge | Complement, augmentation, qualification, weekly reserve cover and commercial deadline | Reserve or volunteer crew, extra pilot, positioning, accommodation; separately compare charter/tech-stop economics |

The future case library also needs explicit split-duty, reduced-cabin-complement, poor-rest-facility and no-reserve-with-move-up cases listed in R2. These are not fully worked or customer-validated examples yet.

### Decision Sequence

1. Capture a Rust rule advance warning or actual violation, or a direct event such as sick call, flight retiming or aircraft change, with its source revision and timestamps.
2. Establish an operationally coherent aircraft plan and lock the committed actions.
3. Find directly affected crew and downstream dependencies through return-to-base and the next protected duty, extending context for cumulative legality.
4. Classify the disruption and generate its specific recovery options from an enabled option catalogue within a recorded search scope. Include the full backfill chain when moving an already assigned crew member.
5. Apply legality, qualifications, contractual selection order, callout deadlines and resource capacity.
6. Obtain required consent or mark the option conditional. Pending consent is not executable eligibility.
7. Calculate before/after crew financial obligations, logistics and separate operational impacts.
8. Present decision-supporting KPIs for eligible options. Let the controller choose, or apply their explicitly enabled selection policy. Record when a controller chooses a costlier option to preserve reserve coverage or reduce disruption.
9. Revalidate the selected option against current versions, approvals, seats/rooms and deadlines.
10. Commit and track roster, crew acknowledgement, travel/accommodation and station/border outputs until confirmed or escalated.

Callout time is more than the nominal reserve response: contact/acknowledgement allowance and travel must fit before the required report. Avoid adding briefing twice when it is already inside the definition of report time. Airport reserve time and positioning may consume duty limits differently under different agreements.

For crew recovery, an available hotel is both a priced service and a feasibility resource. A cheap room that cannot provide the required usable rest is not a feasible alternative. Bookings shared by flight deck and cabin require one capacity ledger.

Contractual seniority and reserve hierarchy can override the cheapest otherwise qualified crew member. The UI must explain an out-of-order selection prohibition rather than silently replacing the order with cost ranking.

### Rust Rule Signals and Disruption Cases

The existing Rust rule engine is the intended legality authority. This document has not inspected its current warning payloads or asserted that a particular advance-warning API already exists. Before integration, map the real signals and covered rules; any missing early-warning capability must be identified as separate work.

The conceptual signal needs rule identity, warning/violation classification, affected crew/assignment, observed or projected value, limit, projected breach time when known, current data revision and assessment time. Warning lead time and classification should follow the rule service's supported semantics, not a second inconsistent threshold calculator in the cost UI.

A disruption case groups related signals around the same affected duty/flight and event so one retiming event does not create independent competing recoveries for every rule it triggers. Retain the individual rule explanations. Operational events also open cases directly: a sick call should not wait for a duty-time violation.

Warnings can prompt preventive options before the violation happens. A `Monitor / keep current plan` option is only available where the current/proposed operation remains legal and policy allows monitoring; it shows the projected breach and next assessment time. It is not an acceptable executable answer to an actual uncorrected violation.

Updated flight estimates or crew data supersede old candidate assessments. If a warning clears, mark it cleared and re-evaluate any draft recovery; do not automatically undo already committed recovery actions. Distinguish forecast-based legality from a guarantee about future actual operations.

### Disruption-Specific Recovery Option Catalogue

Each option definition declares supported disruption types, preconditions, allowed roster transformations, required inputs, legality checks, cost components and execution dependencies. The generic action toolbox is a library from which each case selects applicable options, not an identical menu imposed on every case.

| Disruption type | Specific option families | Mandatory scope of option validation |
|---|---|---|
| Absence / no-show | Airport reserve; home reserve; qualified swap plus backfill; legal voluntary/day-off pickup; re-time to available replacement | Qualifications, complement, report reachability, reserve order, consent and whole replacement duty |
| Forecast or actual duty/rest breach after delay | Keep/monitor when legal; re-time within legal range; swap shorter/longer duties; replacement crew; lawful split duty; rest-and-return | Report/release, rest facility and travel, downstream duties, all crew affected by swaps |
| Crew misconnection / diversion / stranded crew | Ground reposition; own/other-airline deadhead; local replacement; overnight and rebuild | Location continuity, seat/vehicle capacity, positioning duty effect, rest, documents and return-to-base |
| Aircraft type/complement/rest-facility change | Keep qualified crew; add qualified positions; replace affected crew; reuse stood-down crew; re-time for available qualified crew | Actual aircraft qualification, working positions, minimum complement, augmentation/rest facilities and the backfill chain |
| Cancelled flight / broken pairing | Reassign within footprint; deadhead home; overnight; pay-protected release | Remaining work, return obligations, protected credit, future reserve cover and booking changes |
| Added flight / up-gauge | Standby assignment; voluntary pickup; augmented crew; position qualified crew | Full proposed assignment, qualifications, reserve cover and actual added pay/logistics |

Cancellation, rescue and commercial alternatives remain escalated options where applicable, with external operating costs visible; they must not overwhelm the everyday crew-repair choices. Discretion is only conditional on the governing rule and genuine required consent, never a general remedy for an illegal roster.

### Decision-Supporting KPIs

Every option presents legality status and unresolved conditions first, then comparable KPIs on the same baseline:

- Incremental crew cash, separately showing pay/premiums and logistics.
- Other operating cash and total incremental cash where fully priced; economic effects remain separate.
- Departure delay added/avoided and affected flights/passengers where known.
- Actual reserves consumed and remaining cover by relevant base/rank/fleet/time.
- Distinct crew rosters changed, days off used and future duties affected.
- Minimum remaining duty/rest margin with the binding rule, and return-to-plan time.
- Required consent/acknowledgements, latest decision time and travel/booking readiness.
- Cost completeness, estimate/quote freshness and forecast assumptions.

Unknown passenger effects or legal margin display `Unavailable`, not a made-up zero. Show line-item calculation and failed rule explanations on demand. A cheaper option need not be the selected option; the user's selection and reason are retained.

### Daily Operations Versus a Major East Coast Snowstorm

This subsection is retained business knowledge, outside the requested daily-case prototype and initial recovery scope.

Daily mode should favour small repairs, predictable rosters and return to the original plan. Retain R1's major-event learning as a stress case: JFK/BOS closures, mass cancellations, hotels filling across ranks, deadhead flights failing, displaced aircraft and crew, and loss of next-morning coverage.

In the storm case, widen the search horizon and reassess capacity collectively. Validate commute/ground-travel estimates against actual conditions; stale seat inventory and assumed rooms become material failure risks. Use supplier quotes or explicitly approved event-effective rates, not an automatic arbitrary weather multiplier. Protect restart waves and avoid assigning the same crew, seat or hotel inventory twice across cases.

The same cost library remains valid. What changes is the quantity, available inventory, approved tariffs, dependency scope and decision policy. A day-by-day reserve measure alone is insufficient; coverage needs base/rank/fleet/time buckets. Severe disruption is not permission to price legal violations or assume missing consent.

## 5. Cost Inventory

The following inventory captures the identifiable cost concepts in the supplied text, embedded recovery controls and Ryan's request. Bundled costs are decomposed for configuration; they must not be charged both as a package and as its components.

### Crew Pay and Contractual Payments

| ID | Cost type | Quantity / configurable calculation | Evidence |
|---|---|---|---|
| P01 | Baseline salary / guarantee | Pay-period obligation before recovery, normally reference-only in marginal ranking | R2 1.4; U |
| P02 | Additional pay above guarantee / tier threshold | Difference between whole-period payable amounts before and after | U; R1 6.2 supports individual current credit |
| P03 | Airport standby activation | Eligible people or qualifying callouts times applicable fee | R2 1.4 |
| P04 | Home/short-call standby activation | Eligible people/callouts times applicable fee | R2 1.4; R3 p.3 |
| P05 | Hotel/long-call reserve activation | Contract-specific fee or credit treatment, possibly zero | R1 6.5 reserve concepts; amount/formula D |
| P06 | Additional reserve day / reserve augmentation premium | Qualifying days, minimum credit or premium assignment | R1 Appendix 9.1 ADR/RSX; D formula |
| P07 | Day-off recall / voluntary day-off assignment | Flat amount, minimum callout credit, hourly premium or contract-specific combination | R2 1.2-1.4; R1 6.6.5; U |
| P08 | Open-time voluntary pickup premium | Qualifying assignment credit times premium, or fixed pickup fee | R2 T4-01; R1 Appendix premium codes |
| P09 | Short-notice change compensation | Qualifying change per distinct person/duty within notice band | R2 1.4; R3 p.3 |
| P10 | Emergency move-up / extended footprint payment | Contract-triggered payment, separately from consent limit and policy penalty | R1 6.6.5-6.6.6 and EMA/EPS codes; D payable terms |
| P11 | Pay protection on cancellation/release/reassignment | Recompute protected obligation, credited work and offsets | R1 6.6.5, APY/PAY; R2 1.2 |
| P12 | Working-position / lead-cabin premium | Eligible worked/protected position credit or sector fee | R1 4.3.1, 6.8 |
| P13 | Language-of-destination premium | Eligible route/language/assignment units times rate | R1 6.7.1 |
| P14 | Augmentation allowance / extra pilot pay | Extra eligible crew, sector or payable credit; identify any included allowances | R2 1.4, T4-01 |
| P15 | Trip/duty rig or minimum credit | Contract-derived credited units before/after, fed into P02/P11 | R1 Appendix RIG/NRG; exact rig formula D |
| P16 | Deadhead pay credit | Paid positioning credit included in whole-period pay recomputation | R1 6.7.3 payroll-code handling; D contract formula |
| P17 | Reduced cabin complement compensation | Eligible remaining crew or duty allowance, only if operation is legal | R2 1.2 |
| P18 | Sick/fatigue/paid-absence obligation | Baseline or changed paid-absence obligation; no diagnosis used as a pricing attribute | R1 Appendix; R2 T1-01; D accounting treatment |
| P19 | Replacement day off / compensatory entitlement | Obligation in days, plus future cash only when a payable liability is contractually established | U day-off focus; D extension |

P15 and P16 are normally credit inputs, not independent additional cash lines. P11 can modify protected credit or a separate entitlement according to the contract. The calculation trace must identify the owning payable component to prevent duplication.

### Crew Logistics and Allowances

| ID | Cost type | Quantity / configurable calculation | Evidence |
|---|---|---|---|
| L01 | Hotel night / unscheduled overnight | Billable room-nights times station/date/vendor tariff plus applicable tax | R1 6.7.6; R2 1.4 |
| L02 | Day room / split-duty accommodation | Rooms times approved day-use block or hourly tariff | R1 5.1.22; R2 1.2-1.4 |
| L03 | Per diem / subsistence | Eligible elapsed hours, calendar days or contract units, with meal deductions | R2 1.4; granular policy D |
| L04 | Own-airline deadhead | Actual seats/segments times marginal service expense | R1 6.7.3; R2 1.4 |
| L05 | Other-airline deadhead | Fare plus taxes/fees for each ticketed person and itinerary | R1 6.7.3; R2 1.4 |
| L06 | Co-terminal / inter-airport ground transfer | Vehicle journeys or person journeys according to vendor tariff | R1 5.1.2, 6.7.2; R2 1.2 |
| L07 | Airport-hotel transfer | Shared vehicles, legs or passenger units; exclude when included in room rate | R1 5.1.2 distinction; R2 3; R3 p.2 |
| L08 | Hotel cancellation / amendment / no-show fee | Booking-specific deadline bands less confirmed refundable value | R2 1.4, 3; no-show detail D |
| L09 | Deadhead ticket change / cancellation | Fare difference, change fee, usable refund or credit | R2 1.4 booking-fee concept; detailed decomposition D |
| L10 | Ground transport cancellation / amendment | Supplier commitment before/after and applicable fee | R2 booking changes; D tariff |
| L11 | Crew meals / catering change | Additional meals or cancellation units, net of prepaid/included meals | R2 3 |
| L12 | Repatriation / return to original plan | Composite of pay, transport, seats, rooms and per diem; never an extra duplicate total | R1 6.6.5, 6.7.12; R2 1.2 |

### Related Non-Crew Costs and Economic Effects

| ID | Type | Treatment | Evidence |
|---|---|---|---|
| X01 | Incremental delay | Configurable cumulative cost curve or itemized ground/passenger expense; exclude crew pay already counted | R2 1.4, T2 cases |
| X02 | Passenger overnight, meals and care | Passenger counts times eligible expense; separate goodwill score from payable compensation | R2 1.4 |
| X03 | Rebooking / cancellation expenditure | Actual projected expense by affected passenger/sector or approved aggregate package | R2 1.4 |
| X04 | Statutory/contractual passenger compensation | Jurisdiction/eligibility-specific payable component; not assumed for every weather delay | R3 p.3; D eligibility rules |
| X05 | Aircraft ferry / rescue | Actual sectors and external operating costs; exclude separately counted crew components | R2 1.4, T2-02 |
| X06 | Tech stop | Handling, landing, fuel and extra operating time; expose bundled inclusions | R2 1.4, T4-01 |
| X07 | ACMI / sub-charter | Supplier operation quote; crew included in quote must not be added again | R2 T4-01 |
| X08 | Foregone revenue / contribution | Separate economic measure; do not equate gross revenue with avoided loss or cash expenditure | R2 1.4, T4-01 |
| X09 | Own-airline seat displacement | Opportunity cost only when passenger capacity is displaced; distinct from L04 | R2 own-seat concept; D decomposition |

### Non-Cash Measures and Solver Preferences

| ID | Measure | Unit and interpretation | Evidence |
|---|---|---|---|
| M01 | Reserves consumed | Distinct people and reserve-duty capacity by base/rank/fleet/time | R2 1.4 |
| M02 | Rosters changed | Distinct people relative to the same baseline, not count of edit operations | R2 1.4 |
| M03 | Crew teams split | Changed team relationships; optional explicit policy score | R1 6.7.5 |
| M04 | Off-plan / time to return to plan | Assignment-change count and minutes; exclude conversions where approved policy says so | R1 6.9 and embedded parameter screen |
| M05 | Move-up usage | Events per crew/time period, with separate consent/contract limit | R1 6.6.6, 6.9 |
| M06 | Excess language-qualified assignment | Optional count/score or configured limit, separate from actual language premium | R1 6.7.1 |
| M07 | Deadhead / ground-transfer preferences | Placement/conversion/count penalties, separately from fare/pay | R1 6.7.3, 6.9 and embedded screen |
| M08 | Layover excess / scarcity | Count relative to planned target; actual room availability is a capacity gate | R1 6.7.6 and embedded screen |
| M09 | Days off consumed / fairness | Distinct local days and entitlement units; real recall payment remains P07 | U; R2 1.2 |
| M10 | Discretion / fatigue margin / stability | Consent state, event count, legal margin, next-duty risk; never a licence to violate limits | R2 T2-01; R3 p.2 |
| M11 | OTP and passenger impact | Delay minutes, affected passengers and connections; avoid duplicating X01 monetary components | R2 1.4; R3 p.2 |

## 6. Published Illustrative Prices

These are R2 section 1.4 examples, **not airline tariffs**. USD is assumed for demonstration because the source uses a dollar sign; currency needs explicit confirmation for production.

| Type | Source example | Interpretation / issue |
|---|---|---|
| Airport standby activation | 250 | Per eligible person called |
| Home standby activation | 200 | Per eligible person called |
| Day-off recall | 600 cabin / 900 flight crew | Example band; exact contract basis absent |
| Short-notice change | 150 | Per qualifying crew member; notice threshold unspecified |
| Own / other-airline deadhead | 120 / 600 | Per seat; actual inventory and itinerary matter |
| Hotel night / day room / per diem | 140 / 90 / 60 | Source says per crew member; hotel invoice unit and per-diem duration policy require definition |
| Delay | 60/min first 120 min, 25/min thereafter | Source curve, contrary to its description of steeper late delay |
| Passenger overnight | 260 | Bundles hotel/meals/goodwill; decompose before cash reporting |
| Cancellation of 150-seat sector | 35,000 | Bundles expense and lost revenue; not a pure cash tariff |
| Narrowbody ferry | 9,000 | Per empty sector; scope of included crew costs unspecified |
| Third pilot augmentation | 1,200 plus 200/night abroad | Pay/allowance package; do not automatically add per diem/hotel a second time |
| Tech stop | 12,000 | Landing/handling/fuel/additional block-time package |

Mockups may prefill a clearly labelled demonstration rate set using these amounts. For items with no amount in the documents, use `Unpriced` until configured or a separately identified synthetic test value. Never silently default missing prices to zero.

## 7. Cost Model and Calculation Rules

### 7.1 Whole-Period Marginal Pay

For each affected crew member, construct a baseline pay-period state and a candidate state from the same data revision. Candidate state applies additions, removals, protected credits, rigs, deadhead credits and relevant premium events. Historical earned credit is not deleted when a future assignment is removed.

`incremental_pay = payable(candidate_state, contract_version) - payable(baseline_state, contract_version)`

The baseline includes approved future commitments in the same pay period where those affect the forecast. Separate earned-to-date, scheduled future, pending and protected credit, so it is clear which figures are actual and which are projections. Recompute future-credit changes caused by recovery. A comparison based only on month-to-date hours can misrank someone already forecast to exceed guarantee.

Define guaranteed payable credit `G`, before/after payable credit `C`, hourly base rate `r`, upper-tier threshold `T >= G` and total rate multiplier `m`. One supported illustrative marginal-tier template is:

`P(C) = G*r + max(0, min(C,T)-G)*r + max(0,C-T)*r*m`

Use `T = G` when all credit above guarantee earns the higher rate. This is a demonstration contract template, not an asserted JetBlue/Ethiopian/F8 rule. Real agreements can pay base-rate overage, premium outside guarantee, minimum callout credit or retroactive tiers; each needs an explicit template.

### 7.2 Ryan's Crew A / Crew B Example

Synthetic fixture: both qualified and equally eligible under assignment order; guarantee 75 h; premium threshold 75 h; base USD 100/h; total over-threshold multiplier 1.5; airport activation USD 250; new duty adds 5 payable credit hours; no other premium or guarantee change.

| Crew | Baseline credit | Candidate credit | Added above-threshold hours | Incremental pay | Activation | Total crew cash |
|---|---:|---:|---:|---:|---:|---:|
| A | 74 h | 79 h | 4 h | 600 | 250 | 850 |
| B | 65 h | 70 h | 0 h | 0 | 250 | 250 |

Crew B saves USD 600 in this fixture. A does not earn premium on all five hours: one hour is still inside the guarantee. If A instead starts at 78 h and ends at 83 h, added premium pay is USD 750, not the USD 1,200 total overage liability at 83 h.

Two added 3-hour assignments to A at 74 h must be evaluated together: final 80 h gives five over-threshold hours and USD 750 incremental pay. Summing two independent quotes against 74 h would give USD 600 and understate the result. The evaluator must recalculate combined options at person/pay-period level.

### 7.3 Configurable Template Types

| Template | User controls | Typical uses |
|---|---|---|
| Fixed per event | Eligible event, amount, person/team basis, once-per key | Activation or change fee |
| Quantity times rate | Quantity source, unit, tariff lookup, rounding | Rooms, seats, meals |
| Minimum / maximum | Payable quantity minimum or maximum, eligible activity | Minimum recall credit |
| Piecewise marginal bands | Boundaries, unit rate per band, boundary convention | Pay overage and cumulative delay |
| Whole-period pay difference | Guarantee, credit rules, rate/tier lookup, premiums/protection | Individual A/B comparisons |
| Conditional payment | Allowed attributes, comparison operators, all/any conditions | Notice bands, working position, route allowances |
| Booking difference | Original obligation, retained booking, cancellation/refund rules, new booking | Hotel and ticket changes |
| Allowance duration | Eligible start/end, elapsed/calendar basis, partial-day rule, deductions | Per diem |
| Composite | Referenced components, inclusion/exclusion and ownership | Recovery package, augmentation package |

Users configure structured rules and see the resulting readable formula plus a worked calculation. Do not execute arbitrary JavaScript, SQL or expressions supplied in a text box. Initially support a bounded set of typed templates and condition fields. Advanced arbitrary formula language is a separate design decision.

Each premium declares whether it is a total rate or an increment over base; whether it is inside/outside guarantee; whether it stacks, takes the maximum, or replaces a named component; and the unit/event key that triggers it. For example, `1.5x total` is not an extra `1.5x` added to already-paid base.

### 7.4 Logistics and Time

Hotel price uses billable room-nights, day-use blocks or hours based on the supplier contract. A stay crossing midnight is not automatically two nights, nor does every 24-hour elapsed period define a hotel night. Occupancy and suitable-rest rules determine room quantity. Track tax, meal/transfer inclusions, early/late checkout and cancellation deadlines.

Example: six crew, one approved room each, two billable nights at USD 140 gives USD 1,680 before tax. If the tariff includes transport, L07 is zero by inclusion, not because a quote is missing.

Ground transport can be per vehicle rather than per person. Six crew in two approved four-seat vehicles at a synthetic USD 80/journey cost USD 160 for one leg, not USD 480. Group by compatible route/time and account for luggage/capacity; do not combine unrelated journeys.

Booking replacement compares obligations: a nonrefundable original room remains in both baseline and candidate, so only the new room and extra fees are incremental. With a refundable USD 140 old room and a USD 160 replacement, the incremental amount is USD 20 only when the refund is actually available. A refund cannot be both netted into a line and subtracted again at total level.

Use UTC instants for elapsed duration and explicit IANA time zones for contract/calendar boundaries. Pay-period crossing must split or allocate credit according to contract, not flight departure date alone. Round at the approved unit and currency stage; do not round every intermediate hour calculation by default.

For the R2 illustrative cumulative delay curve:

`D(t) = min(t,120)*60 + max(t-120,0)*25`

For a baseline delay `b` and candidate delay `c`, use `D(c)-D(b)`. Identify whether a curve is per flight or per passenger and its included cost components. It must not charge incremental crew payroll again.

### 7.5 Ranking

Recommended daily policy: enforce eligibility and contractual order, then compare incremental cash within policy limits while displaying separate operational measures. Controller selection of a costlier plan records the reason. For a configured automatic preference, use explicit constraints or ordered tie-breaks, not undocumented monetary weights.

Weighted solver preferences may be supported as a separate policy profile. Store their unit/normalization and show an objective score distinct from all currency totals. Hard reserve minima and supplier availability must not be converted into soft preferences accidentally.

Unknown price produces an incomplete quote with identified missing inputs. It cannot win a cost ranking by becoming zero. Source estimates, supplier quotes and settled actuals have different status and timestamps.

### 7.6 User-Defined Automatic Selection

Support manual decision and explicit delegation using the same validated option set and KPIs. No separate automation path may bypass legality or use a different cost calculation.

A policy records its owner and version, enabled state, disruption scope, selection objective, ordered tie-breaks, eligibility restrictions, decision limits and delegated action. Example: `For daily absence cases, select the lowest incremental crew cash option; break ties by fewer reserve people used, then fewer rosters changed; only select complete, currently legal and executable options.`

`Lowest cost` must name the metric: incremental crew cash or total incremental operating cash. These can choose different solutions when a cheaper crew arrives late. Display the selected metric in the UI; do not infer it silently from a generic cost label. The controller can configure either.

Distinguish automatic selection from automatic application. `Auto-select` marks the winning option without changing the roster. `Auto-apply` is a separate explicit delegation if later required, and would require the same pre-commit checks and downstream confirmation as a manual application. The HTML can demonstrate both states but performs no real application.

Before a policy selects, require current applicable legality checks, mandatory contractual selection order, satisfied resource/consent prerequisites, complete cost under its allowed estimate policy, and compliance with configured limits. If no option qualifies, send the case to the user with the reason. Ties use the configured order; a remaining tie goes to the user unless their policy explicitly supplies a deterministic final tie-break.

Selection is the best among the generated and validated options within the recorded search scope, not a claim of global optimality. Store rejected candidates, scores/costs, winning rule, policy version and selection timestamp. Before application, recheck source versions and resource availability; an invalidated selection returns to comparison or fresh policy evaluation.

## 8. Conceptual Library Structure

These are conceptual records for the design and mockups, not proposed database migrations or claims about existing ROIS schema.

| Record | Required information |
|---|---|
| Cost type | Stable ID, family, name, description, money/credit/measure classification, quantity unit, supported templates |
| Rate record | Type, currency, amount or rate bands, contract/rank/grade/working-position/base/station/vendor scope as applicable, effective interval, source, approval state |
| Calculation rule version | Template, quantity source, conditions, referenced rates, rounding, thresholds, stacking, exclusions and required inputs |
| Policy profile | Eligibility/assignment-order reference, permitted actions, decision caps, tie-breaks and optional score weights |
| Crew pay state | Crew reference, pay period, grade/contract version, earned and projected credit, protected credit, guarantee, rate inputs and freshness |
| Resource quote | Hotel/seat/transport reference, quantity, availability, amount, expiry, cancellation/refund terms and included components |
| Cost evaluation | Baseline/candidate versions, rule/rate versions, line-item calculations, original/reporting currency, subtotal classifications, uncertainty and totals |
| Operational impact | Actual reserve consumption by pool/time, avoided demand, changed people, days off, discretion, legal margins and downstream duties |

Rate matching uses declared dimensions and deterministic priority. Resolve effective time first, then explicit priority and specificity. Conflicting equally eligible rate records block publication or evaluation; do not arbitrarily select one. A missing specific tariff may use an approved general tariff only if the rule explicitly allows that fallback and shows it in the trace.

Do not maintain a copied price row per crew member. Resolve individual rate using the crew's effective pay grade/contract and legitimate approved exceptions. Identical rank or fleet does not imply identical pay rate.

Rates and calculation versions have draft/approved/retired status. Existing evaluations retain their pinned versions. Proposed production permissions: finance/payroll owns pay tariffs; crew agreements owner approves contract logic; OCC maintains operational policies; procurement owns vendor rates. Mockup status transitions are demonstrations, not real authorization.

Every line item explains: trigger, person/resource, quantity and unit, matched rate, before amount, after amount, delta, formula, inclusions/exclusions, source and version. Retain native currency; use an explicit dated FX snapshot for a reporting-currency comparison. Missing FX blocks mixed-currency aggregation.

## 9. Design Alternatives and Trade-Offs

Three architecture approaches considered:

1. **Typed templates plus rate tables: recommended.** Enough flexibility for the identified cases, unit validation and explainable results without a new programming language.
2. Flat price table only. Quick to maintain but insufficient for guarantee hours, compound entitlements and before/after booking costs.
3. Arbitrary scripting rules. Maximum flexibility but introduces validation, security, audit and support complexity disproportionate to this prototype.

Implement all three requested HTML alternatives using approach 1. They are different information architectures, not three colour themes.

### A. Cost Catalogue

Primary user: cost administrator. First screen is a dense searchable catalogue with category navigation and columns for cost type, unit, rate, scope, effective dates, formula template and status.

Selecting a row opens an inline detail area with rate conditions and calculation controls. Tabs contain Pricing, Calculation and Test Case. Include a sample calculation beside the fields and a before/after amount when editing. Support add/duplicate, filter, enable/disable, save draft, restore demo and JSON export/import.

Visual direction: white work surface, neutral separators, restrained green action accents and amber draft states. No marketing hero. Recommended foundation for the eventual cost-maintenance screen because scanning and maintaining many rates is the primary workflow.

### B. Calculation Workbench

Primary user: payroll/business-rule specialist. First screen selects a cost rule, with unframed sections for applicability, quantity/credit, guarantee/tier parameters, premium combination and result. The editable rules use familiar fields and selectors; generated formulas are readable and traceable.

The default test compares Crew A and Crew B. Include editable guarantee, baseline/projected credit, added/removed credit, hourly rate, multiplier and activation fee. Show a real data visualization of before/after credit against the guarantee boundary and a line-item comparison. Invalid units or tiers produce field-level errors and prevent saving.

Visual direction: light neutral workbench, charcoal typography, teal calculation accents and restrained red invalid states. The rule editor and test results have independent responsive space; no decorative nested cards.

### C. Recovery Cost Comparison

Primary user: OCC controller. First screen contains a selectable daily disruption case with its originating advance warning, actual violation or operational event, plus a side-by-side or tabular comparison of disruption-specific feasible options: incremental crew cash, other cash, economic effects, delay, remaining legal margin, reserves by pool, changed people, consent and eligibility.

Selecting an option exposes its crew/resource line items. A cost line leads directly to editable unit price and rule-template controls; changes recalculate all alternatives and show the effect on ranking. Preserve a visible baseline and distinguish conditional from executable options. Include daily case presets for sick call, retiming, outstation recovery and aircraft change. Forecast and actual-violation examples are labelled simulated rule results, not a live Rust call.

Include manual selection and a configurable automatic-selection policy with objective, scope, limits and tie-breaks. Running the policy shows which option was selected and why, or a specific manual-review reason. Changing the chosen cost metric must be demonstrable with a fixture where cheaper crew pay causes more flight delay. Show user confirmation/selection separately from any simulated application state.

Visual direction: compact operations workspace with neutral surfaces, burgundy case markers, green eligible status and amber conditional status. Show useful cost comparison bars and resource counts, not decorative photography or an atmospheric background.

### Shared Prototype Contract

- Three `.html` entry points, directly openable from disk, with adjacent shared local assets and classic scripts where needed; no application server, CDN or backend dependency.
- Shared synthetic fixture and deterministic calculation behaviour across the three alternatives; use existing local icon assets where feasible.
- Visible `Demo data` status and clear price provenance. Product labels remain English.
- Editable type, unit rate, template, conditions, thresholds, rounding and combination logic. Unsupported template/unit combinations are rejected.
- Retain edits locally where browser storage is available; show unsaved/storage-unavailable state if it is not. Validated JSON export/import provides an explicit portable saved configuration.
- Baseline reset, filtered empty state, missing-rate state, invalid-input state and import error are functional.
- Prefer native form controls and accessible tables. Full keyboard access, labelled inputs and focus visibility.
- Desktop 1440x1000 and mobile 390x844 validation. Wide comparison tables may scroll within a labelled region; the page itself must not overflow or obscure controls.
- Use charts/credit bars as meaningful domain visuals. No source screenshots are copied into the product UI.
- Do not simulate a successful real booking, payroll run, legal certification or roster publication.

Proposed location after approval: `docs/superpowers/specs/2026-09-10-crew-recovery-cost-library-mockups/` with three HTML files, shared assets and local verification code. Source documents stay in Downloads; do not duplicate them into the repository.

## 10. Verification Scope After Approval

Tests must cover user-visible behaviour and independent expected arithmetic, not simply repeat an implementation function.

| Test | Required expected result |
|---|---|
| GH A/B fixture | A USD 850; B USD 250; delta USD 600 |
| Already above guarantee | 78 to 83 hours at stated fixture gives USD 750 additional pay before activation |
| At threshold / zero added credit | No artificial premium at the boundary; no repeat charge for an existing activation |
| Combined assignments | 74 plus 3 plus 3 gives USD 750 pay delta, not USD 600 |
| Removed/protected credit | Whole-period recalculation respects earned/protected credit and does not invent salary savings |
| Configured rate/template change | All applicable views recalculate; incompatible unit/template rejected |
| Hotel quantities | Six rooms times two nights times USD 140 equals USD 1,680 |
| Shared transport | Two vehicles times USD 80 equals USD 160, not a per-person charge |
| Booking replacement | Nonrefundable old cost retained; refundable USD 140 to USD 160 gives USD 20 only with valid refund |
| Delay band crossing | D(140)-D(120) equals USD 500 under the R2 example curve |
| Premium combinations | Additive versus maximum/replacement changes result without double-counting base |
| Missing rate / conflicting tariff | Quote marked incomplete or configuration rejected; never zero-cost winner |
| Currency mismatch / missing FX | No invalid cross-currency total |
| Conditional / illegal candidate | Cannot be selected as executable merely because it is cheaper |
| Advance warning versus actual violation | Distinct states and projected breach detail; monitor unavailable for unresolved actual violation |
| Disruption-specific options | Absence, retiming, outstation and aircraft-change cases show their applicable option families |
| Manual selection | User can select a higher-cost eligible option with a recorded reason |
| Automatic lowest-cost policy | Selects minimum on explicitly chosen metric after all eligibility restrictions |
| Crew-only versus total-cash objective | Fixture changes winner when delay cash is included, with visible explanation |
| Automation exception and tie | Incomplete/conditional options excluded; no eligible option or unresolved tie returns to user |
| Stale option | Data revision change invalidates prior selection and requires revalidation |
| Reserve pools | TYPE-L consumption stays visible when TYPE-S demand is avoided |
| Save/export/import/reset | Visible edits retained or exported; valid round-trip reproduces result; malformed configuration rejected |
| UI responsive review | All three views tested in real browser at desktop/mobile sizes; keyboard and controls work |

Use Playwright to edit controls, change templates, compare candidates, export/import and verify displayed arithmetic in each HTML. Capture versioned screenshots in the same runs under `docs/assets/screenshots/crew-recovery/`. Report exact executed commands and PASS/FAIL receipts at delivery. No Playwright pass is claimed at this research stage.

## 11. Development Handoff and Open Contract Inputs

Before connecting to production data, obtain the governing pay agreements and payroll examples for: guarantee basis, premium thresholds, earned-versus-projected credit, credit rigs, protected pay, partial periods, working-position/language allowance, recall minimums, stacking and replacement-day-off entitlements. The synthetic GH example allows mockup development without pretending these are settled.

Also obtain supplier billing/cancellation terms; approved FX source; contract assignment order; authoritative crew location and credit freshness; and the real authority/deadline for acknowledgement, manifest, border-data and booking updates.

Production integration should reuse existing roster/crew identifiers and legality services after reviewing the data model and module guides. The cost evaluator should consume versioned snapshots and return an explanation; it should not mutate roster or payroll. A separate execution coordinator would own commitments and reconciliation. No production API or schema is selected in this design.

Suggested later discovery sequence: validate pay examples with payroll; validate daily recovery options with OCC; validate travel inventory/quotes with procurement; reconcile calculation outputs to actual liabilities; then connect the approved library to recovery generation and controlled deployment.

Track cost estimate versus settled actual, time to acknowledged recovery, no-delay sick-call resolution, reserve coverage after recovery, downstream failures within 24 hours, discretion usage and controller overrides. Savings need a named feasible comparator and the same scope and price revision.

## 12. Review State

Completed: source text extraction; targeted historical-rule/cost review; embedded recovery UI inspection; three-page PDF visual review; source discrepancy analysis; crew cost inventory; GH and logistics formulas; daily-recovery knowledge; three UI designs and acceptance scope.

Delivered after Ryan's request to provide the mockups: three HTML alternatives in `2026-09-10-crew-recovery-cost-library-mockups/`, with 24 passing Playwright checks recorded in `verification.json` and desktop/mobile screenshots. No production runtime code, schema or live data was changed.

Prototype scope: 17 initial cost entries; six bounded templates; editable prices, thresholds, quantities and formulas through template controls; individual GH comparison; four daily-case fixtures; manual selection and automatic lowest-cost selection; local save and validated export/import. The broader inventory remains the future production design. Contract-specific premium stacking, effective-dated tariff resolution, multiple currencies, live Rust validation and operational deployment are not implemented in these static prototypes.
