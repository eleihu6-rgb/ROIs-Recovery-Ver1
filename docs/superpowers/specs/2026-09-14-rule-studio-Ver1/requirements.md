# ROIS Rule Studio — requirements and design exploration

Date: 2026-09-14 · Version: 1 · Status: proposed, awaiting product design selection.

Deliverables: three interactive HTML design alternatives and this requirements brief. All data, chats, approvals, builds and test results in the HTML are scripted demonstrations. No application, Rust, optimizer, service or database changes are authorized by this design exercise.

## 1. Product direction and name

**Recommended: ROIS Rule Studio** — “From airline policy to tested roster rules.” AI is the assistant inside the workflow; the durable product is a controlled rule lifecycle.

Alternatives: **ROIS RuleLab** emphasizes experimentation and evidence; **ROIS Policy-to-Roster** emphasizes the customer outcome but is less suitable as a concise navigation label. These are working names, not trademark checks.

Today, according to the product owner, Legend C++ covers major FAA, EASA and CAP371 rule families and multiple airline union agreements. Customer onboarding requires manual interpretation, matching, gap development and limited automated unit/optimization testing. This is the starting business context, not an independently audited coverage claim.

The opportunity is to let airline rule specialists and capable IT users express and maintain policy, with engineers responsible for executable correctness. Success means faster onboarding, more reuse, visible evidence and controlled change. Do not promise that generated rules are automatically regulator-approved.

## 2. Research and competitive context

Read on 2026-09-14:

1. [User-supplied Rave developer guide](https://olect.github.io/become-rave-developer/): an independent educational resource, not official Jeppesen product documentation.
2. [Testing and simulation discussion](https://olect.github.io/become-rave-developer/02_Jeppesen_Ecosystem/04_Testing_and_Simulation/).
3. [Rules and search-space discussion](https://olect.github.io/become-rave-developer/04_Rave_Language_Reference/05_Rules_Legality_and_Search_Space_Dynamics/).
4. [Performance profiling discussion](https://olect.github.io/become-rave-developer/04_Rave_Language_Reference/14_Performance_Profiling/).

The useful comparison is user-authored domain rules integrated with scheduling and optimization, accompanied by debugging and performance visibility. The proposed ROIS differentiation is a source-linked requirement interview, reuse analysis, an approved semantic contract, executable evidence and revision-aware review. These are product proposals, not claims that RAVE lacks AI or equivalent features. Official vendor validation is still needed for external comparison material. The guide's implementation/classification claims are not authoritative specifications for ROIS. No guide code or diagrams are reproduced in these artifacts.

Current repository guide identifies `rule-engine-rs/` as active legality, `pbs-engine/` as active optimization, and `crewrule-dev/` as legacy C++ reference. This checkout does not contain `pbs-engine/`; optimizer integration cannot be verified here. `ai-server/` is retained for future workflows and is not implicitly reactivated by this proposal. See `source-inventory.md` for inspected local evidence.

## 3. Users, boundaries and lifecycle

| Role | Responsibility |
|---|---|
| Airline rule specialist | Source clauses, interpretation, parameters, accepted examples and business approval |
| Rule engineer | Reuse/port/new decision, implementation review, solver semantics, performance |
| QA reviewer | Independent expected outcomes, fixture validity, regression evidence |
| Release owner | Select customer/environment, effective date, approvals and rollback package |
| AI assistant | Ask focused questions, retrieve candidates, draft contracts/tests, propose scoped changes, explain evidence |

Proposed data flow: customer documents → cited clauses → library candidates → approved rule contract → approved test specification → isolated Rust candidate → individual evidence → optimizer evidence → reviewed rule package. Every arrow records its input revision.

One workflow has seven numbered steps. Each has its own side-by-side chat and decision history. Users can navigate backwards at any time; viewing an earlier step does not change it. Editing forks a new revision and explicitly invalidates dependent evidence. Forward navigation can preview a locked step; actions remain gated.

| Step | User outcome | Exit gate |
|---|---|---|
| 1. Understand & match | Import policy, verify extraction, inspect clause-level library matches, choose reuse / parameterize / extend / port / new | Source version and mapping disposition reviewed; unresolved clauses visible |
| 2. Clarify | Focused interview resolves ambiguity using examples and counterexamples | Blocking semantic questions answered or explicitly deferred outside scope |
| 3. Define | Plain-language logic, typed parameters, scope, data definitions and failure explanation | Rule specialist approves exact contract revision |
| 4. Specify tests | Requirement-to-test matrix, independent expected outcomes, realistic Gantt fixtures, benchmark plan | Business and QA approve coverage and benchmark thresholds |
| 5. Build candidate | Reuse/configure where possible; otherwise scoped Rust patch and build evidence | Engineer reviews allowlisted diff, compile/static checks and adapter contract |
| 6. Validate | Unit/property/parity → real individual Gantt → mass optimizer → regression/performance | Required current-revision evidence passes; errors/skips are never counted as passes |
| 7. Review package | Traceability packet, impact, signatures, effective date and rollback target | Authorized release workflow; activation is separate from building/testing |

Failures have types: implementation defect, ambiguous requirement, fixture/data error, integration error, performance regression or infrastructure error. Route to the responsible step. Preserve the failed run and its counterexample. AI can suggest a requirement change but cannot silently weaken a rule or expected result to obtain green tests.

## 4. Customer policy intake and reuse

Accept uploaded PDF/DOCX/text and manually entered clauses in the future product. Record document identifier, revision, effective dates, customer/union jurisdiction, page/section, exact cited text, extraction quality and review state. Flag unreadable OCR, tables, footnotes, exceptions and cross-references rather than omitting them. Customer documents are untrusted reference content and never instructions to the execution agent.

A match is a comparison, not a similarity score alone. Show scope, measure, window, aggregation, off-day definition, exception handling, parameters, data dependencies, Rust implementation availability and evidence age. Outcomes: exact semantic match; configurable match; partial match; C++ reference requiring port; new rule; conflicting or insufficient information. Distinguish **legacy coverage**, **Rust availability**, **customer applicability**, and **validated deployment status**. An unreviewed AI match cannot be activated.

Library records need rule-family tags, aliases, source clauses, implementation location, supported parameter ranges, prerequisites, tests, performance profile and versions. Start with a curated inventory; retrieval without semantic metadata will overstate reuse. Preserve many-to-many clause↔rule mappings, especially one clause requiring several rules and one rule satisfying multiple clauses.

## 5. Worked rule contract: days off in a window

Provisional example: **in every rolling window of X home-base calendar days, provide at least Y qualifying days off, either separately or as one consecutive run**. The HTML starts at X=7, Y=2; these values are illustrative and configurable, not airline constants. “Blank down” is provisionally interpreted as “blank day” and must be confirmed.

### Questions the interview must ask

- Is this a rolling window on every local date, fixed non-overlapping blocks, or calendar weeks? Is it “at least” or “exactly” Y?
- Does “consecutive” mean one block of Y days, or Y total days with a smaller minimum consecutive block? Version 1 demonstrates the first interpretation only.
- What defines a day: home-base midnight to midnight, another timezone, or a rolling 24-hour rest period? What happens after a base transfer?
- Does blank mean no roster activity, or merely no visible flight? Can imported missing data appear blank? Do reserve, training, deadhead, leave and sickness qualify?
- Which assignment group, and which dated membership version? If two codes or a duty and an off code overlap a date, which wins?
- Must the whole day be free? How do previous-day release and next-day report buffers, cross-midnight duties and DST affect it?
- What history/look-ahead is required at the roster-period edges? What should happen if context is missing?
- Which crew/ranks/bases/contracts and effective dates apply? Is this a hard legality constraint, a soft preference, or both as separately modeled rules?
- During optimization, when are blank dates still assignable? At what evaluation stage is the roster complete enough to decide?

### Proposed explicit semantics for discussion

A window is [local midnight at date D, local midnight at D+X), evaluated for every applicable start date in the agreed evaluation range. Midnight is timezone-aware; a calendar day may be 23 or 25 hours. Calendar-day rest must not be silently substituted for elapsed-hour rest.

A date qualifies only when complete roster data is known and no disqualifying activity interval overlaps the day, using report/release boundaries from the approved roster model. It qualifies if either (a) blank-day counting is enabled and the complete day has no assignments, or (b) an approved qualifying assignment code in the selected group covers the full day. Partial off assignments do not count in this initial proposal. Multiple qualifying codes count the date once. Disqualifying duty takes precedence over a qualifying off code. Other precedence or coverage-union behavior requires an explicit contract revision.

For separate days: count distinct qualifying dates inside the window ≥ Y. For consecutive days: the longest consecutive qualifying run wholly inside the window ≥ Y. A run outside the window cannot supply missing in-window days. A rule failure reports crew, exact local window, required count/run, observed count/run, qualifying dates and reasons excluded dates do not qualify.

Incomplete history is **indeterminate / insufficient data**, not legal or illegal. It blocks release evidence until resolved. Load X−1 days of lead-in for end-anchored windows; if the agreed evaluation set includes starts near the planning end, load the corresponding look-ahead or explicitly defer those windows. Never manufacture edge days as blank.

| Parameter / dependency | Proposed definition |
|---|---|
| X, Y | Positive integers, 1 ≤ Y ≤ X; supported X maximum to be benchmarked and published |
| Window mode | Rolling local calendar days in initial slice; fixed/calendar modes are separate future semantics |
| Count mode | Separate total / one consecutive run |
| Blank-day eligibility | Explicit boolean; requires completeness evidence |
| Qualifying assignment group | Stable group identity plus immutable membership snapshot and effective dates; codes are data, not hard-coded strings |
| Day timezone | Crew home-base timezone at evaluated date; transfer policy must be resolved |
| Activity precedence | Full-day eligibility; overlapping disqualifying activity wins |
| Applicability | Customer, rule-set, crew scope, effective dates and severity |
| Evaluation stage | Final roster vs partial optimizer candidate; explicitly reviewed |

### Critical optimizer distinction

A current candidate with too few off days can become feasible later if more off days enter the relevant window. Conversely, an unassigned date counted as blank now can be filled by work later. Final-roster legality and partial-candidate pruning cannot use an unqualified boolean interchangeably. The engineer must define safe partial-state feasibility, re-evaluation/invalidation, and final validation using the actual PBS connector. Do not prune a branch unless infeasibility is proven for every allowed completion; test both false rejection and false acceptance. This design requirement does not assume that the current connector supports a three-state result.

## 6. Coverage and evidence

“Full coverage” means a declared, reviewable coverage model. Exhaustively testing an unbounded Cartesian product of X, Y, rosters, timezones and group memberships is impossible. Publish the supported domain, missing coverage, generated case count and execution budget. Never show “100%” without the denominator and coverage definition.

For bounded domains exhaustively test valid X/Y pairs and small daily-state sequences. For large domains combine boundary analysis, equivalence classes, pairwise or higher-order combinations selected by risk, property-based generation, mutation tests and independent reference evaluation. Pin random seeds and shrink failures to a minimal counterexample. Expected outcomes must come from an approved truth table/reference evaluator or specialist review, not only the same AI implementation that is under test.

| ID | Business example / assertion | Layers |
|---|---|---|
| DO-01 | X=7,Y=2: exactly two separated eligible dates passes separate mode | Unit + Gantt |
| DO-02 | Same roster fails consecutive mode; expected violation window is shown | Unit + Gantt |
| DO-03 | Two adjacent dates pass both modes; Y−1 fails; Y+1 passes | Unit + generated |
| DO-04 | X=1,Y=1; X=Y; reject zero, negative, fractional and Y>X configuration | Parameter + unit |
| DO-05 | Blank enabled/disabled with complete data changes eligibility; incomplete blank is indeterminate | Unit + Gantt |
| DO-06 | Group member/nonmember, mixed qualifying codes, duplicate assignment, version change and effective-date boundary | Unit + adapter + Gantt |
| DO-07 | Off code plus overlapping flight/reserve/training does not qualify | Unit + Gantt |
| DO-08 | Midnight, report/release buffer, cross-midnight duty, DST, month/year/leap-day and base timezone | Unit + Gantt |
| DO-09 | X−1 history, missing history, planning-end look-ahead and consecutive run crossing window edge | Unit + Gantt |
| DO-10 | Crew scope/effective dates, non-applicable crew, other rules still enforced | Integration + Gantt |
| DO-11 | Partial candidates: repairable failures retained; later assignments invalidate formerly blank dates | Connector + optimizer |
| DO-12 | Same final roster has identical decisions in standalone Rust and optimizer route | Integration + optimizer |
| DO-13 | Candidate rule with existing rules; feasible and deliberately infeasible mass schedules; timeout vs infeasible distinguished | Optimizer |
| DO-14 | Microbenchmark and representative end-to-end benchmark against pinned baseline | Performance |
| DO-15 | Historical C++ cases where semantics match; mismatches triaged, never blindly inherited | Differential |
| DO-16 | Change requirement after passing tests; dependent evidence becomes stale and release locks | Workflow Playwright |

Real individual Gantt proof must open an isolated test scenario, find the named crew, display the relevant dates, perform assignments/deassignments through actual UI, recheck, inspect exact violation details/window, revise the roster and show the expected cleared or remaining result. Include complete multi-leg base→base flight pairings with real route/fleet shapes, qualifying ground codes, lead-in and conflicting duties. Exercise Save/reopen and relevant Live/Scenario adapters when claiming support. Screenshots are evidence of the visible outcome, not proof by themselves. This design's HTML roster is illustrative only and does not satisfy future product E2E gates.

Every case record includes case/revision ID, clause IDs, parameter snapshot, fixture hash, expected decision, actual decision, assertion result, execution status, rule/build version, engine/connector version, environment, seed, timestamps, logs and screenshot/trace links. A successful test may assert an **illegal** roster. Distinguish roster legality from test PASS/FAIL. Run statuses: not run, queued, running, passed, failed, error, blocked, skipped, stale, cancelled. Retain run history and per-layer progress.

## 7. Performance and optimizer acceptance

Agree the baseline and gates at step 4, before generating implementation. Measure both unchanged-semantics regressions (old vs new implementation) and added-constraint behavior (new rule enabled vs disabled). New restrictions may legitimately change coverage and objective; never label all such changes bugs, or remove constraints to preserve coverage.

Pin dataset/crew/pairing scale, rule-set and group versions, executable hashes, hardware, concurrency, timeout, warmup and solver seeds. Use repeated paired runs; report median/p95 rule-call latency, call count, allocations/memory, wall time, time to first feasible roster, coverage, objective/cost, final legality and incomplete/infeasible status. Use identical compatible objective definitions for comparisons.

The mock uses an explicitly illustrative +5% p95 and end-to-end tolerance and +3% sample outcome. These are NOT measured or accepted product SLAs. The product owner wants no degradation; define whether that means no statistically significant regression within measured noise, or a specific accepted engineering budget. Both micro and end-to-end gates must pass for all required benchmark cohorts. Thresholds cannot be relaxed by AI after a failure. Strict rule correctness and final full-rule-set feasibility remain mandatory independently of performance.

## 8. Versioning, collaboration and return-to-step behavior

A Rule Package revision is an immutable manifest linking source snapshots, interview decisions, formal contract, parameter/group versions, test specifications, fixture snapshots, candidate commit/build hash, run evidence and approvals. Chat messages attach to stage and revision; accepted decisions are promoted into the contract. Chat text alone is not authoritative behavior.

Example: v1 allows separate days and passes → specialist forks v2 requiring consecutive days → source citation retained; logic/test expectations updated → build, individual runs, optimizer runs and release approval become stale → v1 evidence remains readable → v2 must pass fresh gates. Restoring v1 creates a new revision based on v1, rather than deleting v2 history. Show dependency impact before applying changes. Group membership and source effective-date changes trigger the same impact analysis. Concurrent edits use revision checks and explicit merge review.

Business approval, engineering approval and release authorization are distinct. Capture actor, role, time and exact revision. Activation is a separate authorized action with customer/environment and effective date. Rollback selects a known version, validates schema/connector compatibility, preserves audit history and rechecks affected rosters; it cannot blindly override currently applicable legal policy.

## 9. Rule-only AI execution boundary

A system prompt saying “only edit rules” is insufficient. Proposed enforcement is outside the LLM:

- AI can read only customer-authorized source excerpts, curated rule references and approved anonymized fixtures; retrieval is isolated by tenant and version.
- A server-side action broker exposes typed rule actions: propose contract, propose parameter schema, propose test, request isolated candidate build, request approved test suite, explain evidence. No general production shell, SQL console or arbitrary file write.
- Prefer parameterized reuse. For new Rust logic, an isolated worktree/container receives a policy allowlist of rule module/registry entries and rule-specific tests. Deny path escapes, symlinks to outside scope, dependencies, build scripts, unsafe/native escape mechanisms and arbitrary network/process access unless separately engineered and reviewed.
- Trusted CI checks the complete diff, build manifest and artifact provenance; untrusted generated Rust compiles/runs without production credentials or external network, with CPU/memory/time limits. Tests cannot change their own acceptance thresholds or expected outcomes without approved specification revision.
- Existing fixed Gantt/optimizer test harnesses accept approved fixture manifests. The AI may request those operations but cannot change UI code, scheduling algorithms, auth, shared schema or customer live data.
- If a rule requires a new shared data field, connector change or unsupported primitive, mark **Platform extension required** and create a separately reviewed engineering requirement. Never widen the rule agent's permissions automatically.
- Release credentials are held by the authorized deployment service, never the model. Record model/prompt/tool versions and decisions without storing secrets or unnecessary crew personal data.

The eventual Studio shell, orchestration and test adapters themselves require ordinary scoped product implementation; the “rules only” boundary governs ongoing rule-authoring sessions. This proposal does not pretend a prompt can create that platform without system engineering.

## 10. Three distinct interaction designs

| Mock | Primary organization | Strength | Trade-off |
|---|---|---|---|
| A. Guided Workbench | Seven-step rail; editable artifact in center; stage assistant on right | Best onboarding and clearest controlled process; recommended MVP | Complex cross-rule comparison needs a secondary view |
| B. Evidence Dossier | Source/contract/evidence ledger with review sheet and traceability | Best specialist/compliance review; clear provenance and sign-off | Less immediate for a novice starting from a blank page |
| C. Visual Rule Lab | Clickable rule graph and editable seven-day roster; tests remain in context | Best for understanding separate vs consecutive days and counterexamples | Cannot express every aviation rule as a simple calendar graph |

All three demonstrate backward navigation, X/Y and count-mode edits, stage-local scripted chat, revision records, downstream invalidation, case outcomes, gated optimizer evidence and a review package. Prefer A as the product shell, then adopt B's evidence ledger and C's visual examples within relevant steps. Do not implement three separate rule-authoring systems.

## 11. Initial delivery slices and open choices

First slice: one curated rolling-days-off family, one customer test ruleset, source-linked manual/assisted matching, structured interview, approved contract and case matrix, isolated Rust candidate, individual Gantt proof, one pinned optimizer benchmark, versioned review packet. Automation begins with trusted templates and parameterized reuse; arbitrary novel rule generation stays engineer-reviewed.

Later slices: batch policy ingestion, broader family inventory and C++ parity corpus; richer group/effective-date support; broader benchmark cohorts and reusable approved rule primitives. A general-purpose RAVE-like DSL is a separate product decision, not an MVP prerequisite.

Decisions for design review: select A/B/C shell; confirm blank-day interpretation, rolling/day timezone/consecutive semantics; choose the first customer document/rule family; define independent reviewer responsibilities; agree measurable performance acceptance. These are proposal assumptions, not hidden business approvals. No implementation estimate is credible until the missing optimizer checkout, rule inventory and execution isolation integration are assessed.

Acceptance for a future implementation: a specialist can carry this example from cited source to reviewed package, revisit any step without losing history, see why every tested roster is legal/illegal/indeterminate, cannot release stale or incomplete evidence, and cannot use the rule assistant to mutate another subsystem. Measure onboarding lead time, reviewed reuse rate, escaped rule defects, coverage completeness, reviewer rework, and performance against baseline.
