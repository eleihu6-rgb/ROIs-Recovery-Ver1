# ROIS Rule Studio — Guided Workbench Ver 2

2026-09-14 · Design proposal · Supersedes the seven-step exploration for future discussion only. Ver 1 is preserved unchanged in its original directory. No application implementation, engine changes, Git commits, customer data writes or deployments are part of this task.

## Selected direction and three-step process

1. **Define rule**: user describes the requirement in the chat/intake area → AI understands and matches → user inspects rule description, usage and Legality-style parameter tables → chooses Modify existing / Copy and enhance / Start new → confirms applicability, clarification decisions, visual logic, parameters and enforcement.
2. **Define test cases**: enumerate independent legal A and intentionally violating B cases, edge/data/scope/enforcement cases, real-Gantt steps and expected outcomes; define optimizer scope and measurable performance limits before coding. This same step becomes the test-results workspace after a run.
3. **Build and test**: show basic progress and main logic first; reveal candidate code and Git revision comparison on demand. Build the approved rule candidate and automatically execute every approved individual case. Run the approved optimizer benchmark only if prerequisite layers pass. Automatically return to step 2 showing per-case results, failure explanations, screenshots and animated step replays.

These are three lifecycle steps, not three separate systems. Inner tabs organize the larger rule-definition artifact without introducing more lifecycle gates. Chat is available alongside each step; notes are retained with step and revision, but only explicitly accepted decisions change the rule.

## Step 1: intake, matching and authoring choice

The intake accepts a basic natural-language rule and source reference. AI first returns its interpretation and unresolved questions, then semantic candidates. A match card must contain rule number/name, description, how to use, applicability, complete parameter tables with column descriptions, implementation availability, known differences and supporting tests. Similarity is never automatically considered full coverage.

The prototype accepts and stores text, then loads a clearly marked scripted days-off match; it does not pretend to understand arbitrary requirements. Production matching must use cited customer documents and curated rule-library metadata.

| Choice | Identity and version behavior | Engineering/review consequence |
|---|---|---|
| Modify existing | Same rule identity, new candidate version, original active version retained | Show all affected rulesets/customers and require impact/regression review before activation |
| Copy and enhance | New draft identity with immutable parent rule/version reference | Recommended for a customer variation; inherit relevant tests, then review changed expectations |
| Start new | New draft identity and fresh contract | Reuse trusted primitives if appropriate, but do not invent a claim of existing coverage |

No choice changes a deployed rule. The real product must expose version conflicts and prohibit overwriting someone else's concurrent edits. The mock demonstrates all three choices without writing Git or a ruleset.

### Source evidence

`gantt/src/components/legality/legality-param-table.tsx` renders one parameter row per entry and highlights Base/Rank/Fleet/Team columns. Its UI-only Row column is not stored in `param_json`. `rule-engine-rs/src/lib.rs::Rule8056Rule` explicitly contains `bases`, `ranks`, `fleets`, `teams`, plus activity A/B selection, spacing, unit, directional and rest fields. These are confirmed reference patterns; the new days-off rule does not inherit spacing logic.

Inspected days-off candidates remain 7505 (minimum off days in a roster period) and 7508 (rolling qualifying free days). No direct minimum-Y-consecutive-off implementation was identified in the prior bounded review. Source-dependent exceptions such as 7505 layover and post-rest treatment must be compared, not silently copied. Candidate values in this prototype are example metadata, not database reads.

## Mandatory rule envelope and parameters

Every roster rule must explicitly define Rule ID/draft identity, name, type, customer/ruleset, effective dates, Base, Rank, Fleet, Crew Team, evaluation timezone, severity/enforcement and version. Base/Rank/Fleet/Crew Team must never be silently empty: select values or explicitly select All (`*`). This is a new authoring requirement, not a claim that every historical rule already has these parameters.

Values within a dimension are OR; different dimensions are AND. Qualifications and group membership are effective-dated. An excluded crew member gets Not applicable, not a false legal decision. Multi-row contracts require explicit row combination and conflict policy; Ver 2 demonstrates one parameter row and specifies overlapping conflicting rows as a validation error until a precedence policy is agreed.

Use compact data tables, with applicability columns tinted like the Legality tab. Under each table, provide a column dictionary containing column name, meaning, valid values, units, default/required state and an example. Avoid hiding definitions only in tooltips. A single row contains the scope values; a separate rule-logic table contains X/Y and eligibility fields to avoid an unreadable 24-column view.

Proposed logic parameters: X positive calendar-day integer, Y positive integer ≤X, rolling-window mode, separate-total vs consecutive-run mode, blank-day eligibility, qualifying assignment group plus membership version, day timezone, full-day eligibility and missing-context treatment. The mock range 1–365 is only an input-control limit, not a benchmarked production range.

## Clarification and visual rule contract

The rule definition includes a decision table: question, proposed answer, impact/example and confirmation state. Confirm rolling vs fixed windows; at least vs exactly Y; separate total vs one consecutive run; home-base timezone and DST; group membership/effective dates; blank vs incomplete data; full-day vs partial off; duty/report/release overlap; lead-in/look-ahead; applicability dates; inherited violations and optimizer partial states. Any unanswered mandatory issue blocks definition approval.

The calendar is core logic, not decoration. Show each date's assignment and eligibility, distinct qualifying-day count, longest run, required Y, selected window and exact explanation. Change between A (legal) and B (violating) examples and switch separate/consecutive mode to expose the difference. Unknown data is indeterminate. A seven-day preview must declare insufficient preview when X differs from seven rather than presenting a false X-day verdict.

For the provisional rule: count complete home-base calendar days; a disqualifying duty overlap wins over an off code; missing data cannot count as blank; each date counts once. Consecutive mode requires one run of Y dates wholly inside each window. A day may be 23/25 elapsed hours across DST. These semantics still require airline confirmation and new-engine capability validation.

## Enforcement and override policy

The requested UI choices are Soft, Hard and Password override. Internally distinguish severity from authorization policy to avoid treating a password as a different legality calculation.

| Choice | Planner behavior when violated | Optimizer behavior | Evidence / permissions |
|---|---|---|---|
| Soft | Show warning; allow acknowledged assignment | Explicit configurable penalty/objective treatment; report remaining violations | Record warning, acknowledgment and penalty; no automatic claim of legal compliance |
| Hard | Show violation and block the operation | Hard constraint; final roster cannot pass with violations | No ordinary override; test blocking through the UI |
| Password override | Block until an authorized user reauthenticates and provides a reason | Remains hard by default; optimizer cannot supply a password or invent an exception | Single approved operation/crew/window, policy expiry, actor and audit trail; underlying violation remains visible |

Use existing authenticated-user reauthentication or a trusted credential flow. Never store a shared override password in rule parameters, chat, Git or test artifacts. The mock contains no password capture. Test valid authorized exception, wrong password, wrong role, expiry, cancellation, audit and optimizer refusal independently. Some statutory rules may not be legally waivable; the source authority must allow an exception before this option is enabled. This is a direct consequence of defining override behavior, not blanket permission to waive regulatory rules.

Soft mode must require an agreed penalty unit/weight and its measurable objective effect. Password exceptions are planner-only unless a separately approved explicit exception object is supported in the solver; no implicit transfer to optimization.

## Step 2: A/B tests and performance contract

A normally means an expected legal case; tolerance A-cases may instead be explicitly accepted with inherited violations. B is intentionally designed to violate or be rejected. Both tests pass when the actual result matches the approved expected result. A warning on B is often success, not a failed test. Additional cases may be Not applicable or Indeterminate rather than legal/illegal.

Every case has ID, parameter/scope snapshot, A/B pair or category, named crew and fixture, steps, expected legality, expected warning/block/penalty behavior, assertion result, execution layer, trace/screenshot/GIF links, run/build version and duration. Coverage shows required versus executed/failed/blocked/stale, not a decorative percentage.

Initial case families: separated count; consecutive count; blank on/off; group member/nonmember and overlap; included/excluded Base/Rank/Fleet/Crew Team; midnight/DST; exact Y and Y−1; invalid Y>X; missing history; hard/soft/password behavior; optimizer partial-candidate re-evaluation; other active rules; source/parameter/group changes invalidating evidence. Maintain an independent truth table/reference oracle. An AI may propose a fix, but cannot silently weaken approved expected outcomes.

Real test fixtures must contain real-shaped crew, qualifications, complete multi-leg base→base flight pairings, ground assignments and history. Playwright performs actual Gantt actions, triggers recheck, reads the exact warning/window, saves/reopens where relevant and captures results. The Ver 2 GIFs replay this documentation prototype only. They are genuine animated files made from browser captures, not evidence that real Gantt or Rust tests ran.

### Optimizer scope and measurements

Freeze the benchmark plan before build: crew and pairing scale, base/rank/fleet/team scope, date range plus history, ruleset, fixture/data hashes, engine and connector versions, hardware, warmup, run counts, identical paired seeds, timeout, candidate activity scope and baseline.

Use two comparisons: unchanged-semantics baseline vs new implementation (regression), and new constraint disabled vs enabled on identical inputs (added-rule cost). Constraints may legitimately change feasible coverage/objective; analyze that separately from runtime cost.

Proposed mock fixture: 500 crew, 8,000 pairings, a 28-day planning horizon, explicit scope from step 1, 2 warmups and 5 paired measured runs. These are illustrative, not measured production data. Both per-rule evaluation and full optimizer run are measured:

- Additional wall time = candidate wall time − baseline wall time, in seconds.
- Speed impact = additional wall time / baseline wall time ×100%; positive means slower.
- Per-call p95 latency, rule-call count and total attributable rule CPU; summed CPU across threads is not wall time.
- Time to first feasible roster, peak memory, final full-ruleset legality, coverage and comparable objective/cost.

Before approval, set maximum additional seconds AND maximum percentage impact, plus per-call budget; all required gates must pass. Mock defaults +5s, +5%, p95 +1µs are proposals, not accepted SLAs. Report distributions, variance and raw paired runs. Infeasible, timeout, cancelled and infrastructure error must not be labeled performance PASS. Candidate final legality remains mandatory even when performance passes.

## Step 3: coding, automatic testing and Git concepts

Default view: approved input revision, authoring choice, scope restrictions, main algorithm outline, progress, changed-file summary and current phase. Detailed code is collapsed by default. Expand to review the candidate module and diff. In this mock, code is a clearly labeled illustrative skeleton and never written to the Rust repository.

Explain Git in user terms: a branch is an isolated workspace; a commit identifies a saved code snapshot; a diff shows changes; the release tag identifies the activated package. Business draft version, Git commit and build artifact digest are different identifiers. Show their mapping. Modifying an existing rule retains its identity, while copying creates a new identity with parent provenance. No automatic merge, push or activation.

Build takes an immutable approved contract/test-plan manifest. Compile/static checks → unit/reference/property checks → Gantt cases → optimizer benchmark → report. Automatically return to step 2 for both success and failure. Each specified case remains visible; blocked cases carry a reason. A failure retains logs and evidence, links to the responsible definition/test/code change, and creates a new revision. Reruns never overwrite old evidence. Explicit cancel stops queued work and marks remaining cases cancelled/blocked; late callbacks cannot update another revision.

GIF playback must have play/pause or a static frame alternative, visible step labels, case ID, expected/actual result, captured version and a text transcript. The product should retain browser video/trace as source; GIF is a portable preview, not the sole evidence. Avoid credentials/personal information in recordings.

## Additional software-development requirements

- Revision manifest includes source, clarification, applicability, group snapshot, enforcement, parameters, test cases, benchmark plan, code/build identities and approvals. Changing any dependency invalidates relevant downstream evidence.
- Editing during a run is disabled for that revision; create a branch draft or cancel before changing. Background jobs use immutable revision IDs and idempotent start/retry keys.
- Server-side action allowlist confines rule-authoring sessions to permitted rule files, registration entries and tests. Isolated builds have no customer credentials or arbitrary network access. Shared UI/schema/connector changes become separate platform tasks.
- Independent reviewers approve business meaning and expected outcomes; engineers approve code/solver semantics; release owners approve deployment. The three-step UI ends with a review-ready package and handoff, not silent activation.
- Review-ready requires current input/build/test versions, all required assertions and benchmark gates, source-authorized enforcement and an acknowledged impact report. Define effective-date rollout, rollback compatibility and recheck scope in the handoff.
- Support retry/cancel, concurrency conflicts, data-load errors, unavailable model/engine, deterministic seeds, visible execution costs and telemetry without exposing sensitive roster data.
- Avoid hardcoding assignment groups or new business constants. No rule-owned duplication/migration of shared business data is included in this design.

## Prototype scope and approval state

All match data, approvals, code, Git IDs and test results are scripted demonstrations. HTML works offline; chat text is local session state. No actual AI interpretation, engine compilation, optimizer run or deployment occurs. Product architecture, performance budgets and exact business semantics remain proposals. The user has selected Guided Workbench and requested this three-step Ver 2 design; that is not authorization to implement the product.

## Ver 2 feedback addition: one-click references in AI discussion

Provide a visible “Discuss with AI” action beside major sections, and compact labeled reference buttons beside parameter cells and test cases. A click attaches a reference chip to the current step's chat, focuses the input and lets the user type only the requested change. No copy/paste is required. The chip includes the target label, stable artifact path/ID, selected text/value snapshot, draft revision and step. Examples: rule.parameters.window_days, applicability.bases, logic.eligibility, optimizer.tolerance, case.10B.expected.

The sent message preserves the reference and snapshot. Clicking/removing a chip does not edit the rule; the model proposes a targeted diff that the user explicitly accepts. If the underlying artifact has changed, show that the reference is from an earlier revision and ask the model to reconcile it before applying a change. Do not resolve references by screen coordinates or visible text alone in production. The mock attaches a label/value/revision snapshot and demonstrates the interaction, not a functioning LLM patch service.

## Ver 2 feedback addition: optimizer tolerance of inherited violations

The user explicitly requires tolerance for existing violations before optimization while prohibiting newly built pairings or roster assignments from creating new violations. This is independent of Soft/Hard/Password enforcement; it applies to optimizer candidate acceptance, not hiding planner warnings or granting a password exception.

Take an immutable complete pre-run baseline under the same rule instance, parameter values, group-membership version, crew scope, effective dates and data context. Identify each finding by crew + rule instance + canonical affected window/duties, and store its severity and violation magnitude (e.g. off-day deficit). Compare candidates against the same baseline throughout the run.

- Unchanged inherited finding with no larger deficit: tolerated and explicitly reported.
- Improved or removed inherited finding: allowed, subject to all other checks.
- New finding on any crew/window/duty: reject, even if another inherited finding was repaired and the total count is unchanged.
- A larger deficit, increased severity or expanded affected interval: reject as worsening, even when the finding key is otherwise unchanged.
- Missing/stale baseline, unknown history, parameter/group/rule change or incompatible window normalization: indeterminate/block, recapture baseline before restarting; never classify it as tolerated.

Use incremental checks for speed only if they are proven equivalent to full affected-window recomputation. New pairings can change report/release boundaries and off-day eligibility across adjacent dates; the candidate checker must include those effects. Pairing-level rules use stable pairing/duty lineage in their finding identity; roster-level rules use crew and calendar windows. Do not infer an exact implementation from a simple “all preassigned” flag.

Final validation recomputes all rules and partitions inherited, repaired, new and worsened findings. A result with inherited findings is **accepted under tolerance with inherited violations**, not fully legal. Report each inherited finding and its origin. Tolerance cannot silently override a source rule that forbids this policy; such rules stay strict. The product must review the scope of this policy by rule family/customer and preserve full auditability.

The mock defaults to “Ignore existing baseline violations,” with an explicit strict alternative. Six extra cases (10A/B, 11A/B, 12A/B) cover retained baseline, repaired baseline, new findings with equal total count, worsening, clean baseline and unavailable baseline. These are now part of the 24-case specification. Benchmark baseline refers to performance comparison; violation baseline refers to the pre-run finding set. They are related versioned inputs but different artifacts.
