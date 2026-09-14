# ROIS Rule Studio — Guided Workbench Ver 2 development handoff

Date: 2026-09-14 · Status: design handoff; product implementation has not started.

## 1. Start here

Ryan selected **Guided Workbench**, requested the three-step redesign, and corrected the deliverable version to **Ver 2**. Preserve both the original Ver 1 exploration and the separate Ver 2 review package. This memo prepares future development; it does not authorize application implementation, deployment, commits or pushes.

Read in order:

1. Root [AGENTS.md](../../../AGENTS.md) and the applicable contract sections in [CLAUDE.md](../../../CLAUDE.md); read module guides before editing.
2. [Ver 2 interactive mock](../../superpowers/specs/2026-09-14-rule-studio-Ver2/index.html).
3. [Ver 2 requirements](../../superpowers/specs/2026-09-14-rule-studio-Ver2/requirements.md), including the two feedback additions at the end.
4. [Ver 2 walkthrough, verification and limitations](../../superpowers/specs/2026-09-14-rule-studio-Ver2/README.md).
5. [Inspected source references](../../superpowers/specs/2026-09-14-rule-studio-Ver2/source-reference.md).
6. [Saved development context](../../dev-context/2026-09-14-rois-ai-rule-studio-ver2-design.md). Read `NEXT_CONTEXT.md` when resuming, but do not let unrelated history replace this task.

The product name **ROIS Rule Studio** is a recommendation used in the mock; no final branding decision or trademark check is recorded.

## 2. User-directed requirements to preserve

| Area | Required behavior |
|---|---|
| Three-step lifecycle | **1. Define rule → 2. Define test cases → 3. Build and test.** Do not revert to the earlier seven-step primary navigation. |
| Initial interaction | User supplies a basic requirement in chat/intake. AI understands it, clarifies it and searches existing rules. |
| Match inspection | Show rule description, how to use, applicability, rule parameters and differences. Follow the Legality tab's table-oriented presentation. |
| Authoring choices | Modify an existing rule; copy and enhance an existing rule; start a new rule. Make identity/version and impact differences clear. |
| Mandatory roster scope | Bases, Ranks, Fleets and Crew Teams, following the 8056 pattern. Explicit values or explicit All; no hidden empty defaults. |
| Definition content | Clarification, parameter definition, a visual explanation of the core logic, enforcement/overrideability and optimizer tolerance all belong inside step 1. |
| Tables | Prefer tables for parameters and comparable information. Explain the function of every column below its table. |
| Enforcement | Define Soft, Hard and password-authorized override behavior. |
| AI references | User can cite a section, parameter, clarification or case directly into chat without copying/pasting. |
| Individual tests | Enumerate multiple cases. Include legal cases and intentional violations that should produce warnings. A correct warning can mean test PASS. |
| Optimizer tests | Define explicit scope, speed impact and additional runtime attributable to the rule before coding. |
| Coding presentation | Show basic progress and main logic by default; full candidate code and version comparison are expandable. Explain Git versions in accessible language. |
| Automatic testing | After build, automatically run specified tests. Return to step 2 with individual results and GIF previews of test steps. |
| Revision control | User can revisit steps. Preserve versions, stage discussions and each run's evidence; edits invalidate dependent approvals/results. |
| Scope restriction | Rule-authoring AI must be restricted to rule work and cannot change unrelated system components. |
| Preserve prior design | Ver 1 stays untouched; Ver 2 is a separate artifact. |

The original business motivation is customer-rule onboarding: compare customer policies against broad Legend C++ coverage, reuse what matches, and implement/test gaps in Rust. Legacy coverage and customer applicability are separate claims. Customer self-service must retain engineering and business review of executable meaning.

## 3. Worked rule: agreed topic versus proposed semantics

The example is **at least Y days off within an X-day window**, where an off day can be blank or use an assignment code belonging to a qualifying group; support separate dates and consecutive dates.

The following are design proposals that need customer-rule confirmation, not facts established by the HTML:

- Every rolling home-base calendar-day window; inclusive start, exclusive end.
- Consecutive means one in-window run of at least Y dates.
- Off eligibility requires a full local day. Overlapping disqualifying report/release activity wins over an off code.
- Blank is eligible only when roster data is known complete. Unknown data is indeterminate, not blank or legal.
- Group membership and qualifications are versioned/effective-dated. Values within a scope column combine with OR; columns combine with AND.
- Timezone, DST, base transfers, partial off assignments, multi-row overlap/precedence, history/look-ahead and inherited-warning policy require an explicit contract.

The mock starts with X=7/Y=2. Its X≤365 control limit is not an approved supported range. Its two example assignment groups, sample crew and dates are not authoritative business data.

Do not copy the mock's small calendar calculation into the production engine. It illustrates a seven-day slice; real logic must evaluate all applicable windows and correctly handle timezone/context boundaries.

## 4. Optimizer tolerance — critical additional user requirement

**Ignore qualifying violations already present before optimization, but reject new violations created by generated pairings or roster assignments.** The proposed contract also rejects worsening an inherited finding. Preserve this distinction independently from planner severity and password overrides.

Use an immutable pre-run finding baseline under the same rule instance/version, parameters, assignment-group snapshot, crew applicability, dates and complete roster context. Each finding needs a stable identity and a comparable magnitude. Proposed identity: crew + rule instance + canonical affected window/duty lineage; proposed magnitude: deficit, exceeded duration or another rule-specific measure.

| Baseline → candidate | Proposed decision |
|---|---|
| Same finding, same deficit, no new finding | Tolerate and retain visible inherited warning |
| Existing finding improves or disappears, no new finding | Allow |
| Old finding repaired but new finding appears elsewhere; total count unchanged | Reject — aggregate counts are insufficient |
| Same finding identity but larger deficit, greater severity or expanded affected interval | Reject as worsened |
| Missing/stale baseline or changed rule/parameters/group/context | Block/indeterminate; recapture baseline and restart evaluation |

Final validation recomputes the full applicable ruleset and separates inherited, repaired, new and worsened findings. Label a tolerated result **accepted with inherited violations**, not fully legal. Strict enforcement without tolerance requires no hard violations; an explicitly permitted tolerance policy allows only qualifying inherited findings. This resolves the otherwise ambiguous “hard rules must have zero violations” wording in the initial design table.

Do not substitute “all activities were preassigned” for a finding-level comparison. Newly generated duties can affect previous/next-day windows and report/release boundaries. Pairing-level and roster-level rules need appropriate stable finding identity; define this before implementing incremental optimization checks.

Also distinguish final-roster legality from partial-candidate feasibility. A partial roster can later gain off dates or lose currently blank dates. Reject/prune only when the approved solver semantics justify it. Existing-violation baseline and runtime-performance baseline are different versioned artifacts.

## 5. Fast AI references and accepted edits

Each “Discuss with AI” action should attach a stable target reference, artifact revision, step, displayed value/text snapshot and enough local context. Example targets: `applicability.bases`, `parameters.window_days`, `logic.eligibility`, `optimizer.tolerance`, `cases.10B.expected`.

User types only the desired change. The AI proposes a targeted diff, explains affected cases/runs, and the user accepts it into a new revision. Sent citations keep their original snapshots. Stale citations must be reconciled against the current revision before applying edits. A citation or chat note alone never silently changes a rule.

The mock uses labels/value snapshots; production needs stable artifact IDs, not DOM coordinates or visible text matching. Preserve unsent form/chat edits when attaching references. Decide whether multi-item citations and cross-step citations are part of the first delivery; single-item stage-aware citation is the demonstrated baseline.

## 6. Current source evidence and limitations

| Source | What was established | Development consequence |
|---|---|---|
| [Legality parameter table](../../../gantt/src/components/legality/legality-param-table.tsx) | Header/rows presentation, applicability tint and UI-only row numbers | Reuse current product patterns; do not treat row numbers as stored parameter identity |
| [Parameter validation](../../../gantt/src/utils/param-format.ts) | Required applicability cells, `*` wildcard convention | Reuse validation where compatible with the new typed contract |
| [Rust library](../../../rule-engine-rs/src/lib.rs) — `Rule8056Rule` | Bases/ranks/fleets/teams are explicit fields | Reference for scope; do not import unrelated spacing semantics |
| Same library — `count_days_off`, `check_min_days_off_app` | 7505 counts minimum off days in a roster period; legacy eligibility exceptions exist | Partial reuse candidate, not exact rolling/consecutive equivalence |
| [7508](../../../rule-engine-rs/src/rules/rule7508.rs) | Rolling qualifying calendar free-day logic | Related capability; rest/eligibility semantics require comparison |
| [PyO3 connector](../../../rule-engine-rs/py/src/lib.rs) | Rust-side rule dispatch/integration exists | Inspect actual current PBS caller before designing adapter changes |
| [Severity labels](../../../gantt/src/utils/severity-labels.ts) | Soft=1/INFO, Overridable=2/WARNING, Hard=3/ERROR | Keep semantic compatibility; do not casually change stored enum meanings |
| [Rule confirmation](../../../gantt/src/components/roster/rule-confirm-dialog.tsx) | Nonblocking Continue Anyway flow; no password/reason input found | Password authorization is new functionality, not a completed capability |

No exact minimum-Y-consecutive-off implementation was identified in bounded research. This is not an exhaustive audit of Legend intellectual property. Some existing date arithmetic uses fixed offsets/86,400 seconds; verify DST independently. A Help/source mismatch was observed for 8056 post-rest meaning, so do not use Help wording alone as the semantic oracle.

`pbs-engine/` was absent in this checkout during design. Root guidance identifies it as active F8 optimization and `rule-engine-rs/` as active legality. Confirm current checkout/submodule status and actual solver interfaces before implementation. Do not replace it with retained `ro-engine/` or `po-engine/`. `ai-server/` is future-workflow material, not automatically the chosen home for this product.

The supplied [RAVE guide](https://olect.github.io/become-rave-developer/) is independent educational material, not official Jeppesen product documentation. Use it as background, not proof of vendor feature gaps or authoritative pruning semantics.

## 7. Architecture work required before coding

The following are logical responsibilities, not approved new services or database tables:

| Responsibility | Required contract |
|---|---|
| Rule library / matching | Clause citations; semantic capability metadata; legacy/Rust availability; parameter schema; candidate differences and evidence |
| Revision persistence | Immutable source, clarification, rule parameters/scope/enforcement/tolerance, test plan and approvals; optimistic concurrency |
| Conversation / references | Tenant-scoped stage history; stable citations; proposed/accepted/rejected changes; stale-target reconciliation |
| Rule execution broker | Typed permitted actions; explicit file/path allowlist; no arbitrary production shell/SQL or unrelated edits |
| Isolated build worker | Approved revision manifest; clean workspace; scoped diff review; code snapshot and artifact digest; resource limits |
| Test orchestration | Unique run/attempt IDs; immutable inputs; queued/running/pass/fail/error/blocked/cancelled/stale states; idempotent retry/cancel |
| Evidence storage | Case results, logs, source fixtures, trace/video, screenshot/GIF, execution metadata and retention/access policy |
| Review/release handoff | Independent business/QA/engineering approval; effective date, customer/ruleset scope and compatible rollback package |

Reuse existing architecture and shared UI where appropriate; inspect the chosen module's guides first. If a business field changes ownership, apply the repository source-of-truth migration gate before design approval. No schema or API placement was approved in this session.

The rule-only restriction must be enforced outside the LLM. Trusted orchestration checks tenant, artifact revision, allowed actions and complete code diff. Generated builds get no production credentials, arbitrary network or unrestricted process access. New shared UI/schema/connector requirements become separate platform work, rather than silently widening authoring permissions.

Password override should use an authorized user's reauthentication and a scoped reason/audit record. Never put a shared password into rule parameters, prompts, chat, Git or recordings. A password exception does not make the underlying roster legal and does not grant the optimizer blanket permission. Source-authorized exceptions and allowed roles remain product decisions.

## 8. Suggested delivery sequence

Prepare an implementation plan in `docs/superpowers/plans/` once implementation is requested. Recommended sequence:

1. **Confirm one vertical slice.** Choose the actual customer source clause, rule family, runtime/solver checkout, business reviewer and baseline fixture. Resolve the semantic/performance decisions below.
2. **Define typed artifacts and state transitions.** Rule definition, case specification, reference target, revision manifest, run result and approval binding; explicitly test invalidation/concurrency/cancellation.
3. **Build step 1 against a curated library.** Real requirement persistence, candidate details, authoring choices, typed parameter/scope validation, citations, decisions and visual explanation. Start with trusted reuse/templates.
4. **Build step 2 with an independent oracle.** Enumerate fixtures and expected outcomes, create scoped real-Gantt test operations and freeze benchmark inputs/budgets.
5. **Integrate an isolated Rust candidate build.** Engineer-reviewed diff and explicit full/partial-check contracts. Implement baseline tolerance with rule-specific stable finding identity and magnitude.
6. **Orchestrate automatic tests and evidence.** Individual prerequisites before optimizer; return to step 2; preserve every attempt and attach recordings to the actual matching revision.
7. **Validate a complete real run.** Prove both intended legal and violating cases, baseline tolerance and performance. Produce a review-ready package. Activation is separate from build/test and requires its own authorization.

Do not port the offline prototype wholesale into production. Reuse its interaction decisions; implement with current components, services, typed data and security boundaries.

## 9. Decisions still needed

| Decision | Why it matters |
|---|---|
| First customer document, ruleset and supported family | Establishes the actual semantic contract and accountable reviewer |
| Rolling/calendar boundaries, timezone/base transfers, full/partial off and assignment precedence | Determines eligibility and window correctness |
| Consecutive interpretation, effective dates and multi-row conflict policy | Determines count/run and scope behavior |
| Tolerance eligibility by rule family; stable identity and worsening measure | Determines safe optimizer acceptance and final result labeling |
| Soft penalty units/weight and authorized password-exception policy | Determines planner/solver behavior and audit requirements |
| Host module/service, persistence and worker/artifact infrastructure | No production placement/schema was approved |
| Runtime/per-call/memory budgets and statistical acceptance | “No degradation” needs an agreed measurable gate; mock defaults are not SLAs |
| Fixture/environment access and data isolation | Shared SIT data must not be disturbed by automated test generation |

Use existing authorization for routine reversible engineering work when future implementation is requested. Ask only for unresolved business/platform choices that materially block that scope; do not make the user approve previously settled layout decisions again.

## 10. Verification required for a real implementation

- Independent expected outcomes, parameter boundaries, scope combinations, group membership/versions, overnight duty and DST, lead-in/look-ahead, and missing-data states.
- A/B legal/violating examples; treat expected warnings as assertion success. Tolerance positives can retain inherited illegality and must be labeled accordingly.
- Tolerance regressions: unchanged, repaired, new with equal total count, worsened deficit, expanded window, stale/missing baseline and changes caused by adjacent pairings.
- Partial optimizer candidate repairability, blank-date invalidation and final full-ruleset recheck; no false pruning or acceptance.
- Real Playwright Gantt operations on valid multi-leg base→base fixtures: assign/deassign, recheck, exact crew/window warnings, save/reopen where relevant. Verify affected adjacent duties/KPIs for changed flight boundaries.
- Hard blocking, Soft warning/penalty, authorized override, wrong role/password, cancellation, expiry, audit and solver refusal to invent authorization.
- Per-case evidence is keyed to actual definition/test/fixture/build/run versions. Record trace/video and render GIF previews from that run; provide static alternatives and text transcripts.
- Paired optimizer tests: unchanged semantics regression AND new-rule overhead. Measure wall-time delta/percentage, per-call latency/call count, attributable CPU, memory, time to first accepted roster, coverage and comparable objective. Final findings must satisfy strict or explicitly approved tolerance policy.
- Scoped builds/tests using actual module commands; real-UI Playwright plus versioned, visually inspected screenshots; `npm run check:ui` for frontend styles. Consider PBS manual QA cases. Report errors/skips/timeouts as such, not PASS.

Exhaustive testing is only meaningful over a declared bounded domain. Expand the 24 example rows using reviewed boundary/equivalence/combination/property tests, deterministic seeds and an independent oracle; do not claim those mock rows are full production coverage.

## 11. What has actually been delivered and verified

Delivered: standalone Ver 2 HTML/CSS/JS design, requirements/source notes, 24 three-frame prototype GIFs plus static images, browser-verification script, artifact/preservation checks and development context. No application code, database, engine build, optimizer, real AI integration or release was implemented.

The [Ver 2 receipt](../../superpowers/specs/2026-09-14-rule-studio-Ver2/README.md#verification-receipt) records exact commands and screenshot paths. Prototype Playwright PASS covers the three-step flow, choices, parameter validation, citations, tolerance controls, automatic results, benchmark deltas, failures, cancellation, run history and stale gates. All ten final browser screenshots were inspected. UI standard gate passed with zero hard violations and 124 existing warnings outside this package.

Important mock limitations to avoid inheriting:

- Matching/assistant replies and code/build/test/Git outcomes are scripted.
- The expanded code is an illustrative skeleton, not a compiling candidate module.
- The GIFs use fixed example fixtures and initial Hard-policy behavior. Changing draft enforcement/parameters can make the visible expected-response column differ from the reference GIF. Production must reject mismatched evidence.
- The seven-day visual preview and test examples do not evaluate arbitrary configured rosters.
- Revisions/runs/chat are browser-session state; refresh resets them. Production needs durable, tenant-scoped storage.
- Benchmark values (500 crew, 8,000 pairings, 28 days, 5 measured runs, +5s/+5%/+1µs limits) are illustrative only.
- Code graph was unavailable; discovery used source reads. Memory context files were saved, but MemPalace indexing was unavailable because its executable was missing. Existing `LATEST.md` contents were preserved to avoid overwriting concurrent work.

## 12. Future-session starter

> Resume ROIS Rule Studio from `docs/handoff/rule-studio/2026-09-14-guided-workbench-Ver2-development-handoff.md`. Preserve Ver 1 and Ver 2 design artifacts. The selected UX is the three-step Guided Workbench with direct AI citations and optimizer baseline tolerance. Read the Ver 2 requirements and current repository/module instructions, inspect current worktree and active Rust/PBS interfaces, distinguish explicit user requirements from proposed semantics, and prepare the next authorized development slice. Do not treat prototype PASS results as real engine evidence, or begin deployment/commit/push without the relevant instruction.
