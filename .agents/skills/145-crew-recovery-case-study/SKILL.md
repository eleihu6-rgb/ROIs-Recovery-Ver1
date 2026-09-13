---
name: 145-crew-recovery-case-study
description: Build and test repeatable crew recovery demo cases, record detailed UI evidence, publish Gantt Help case studies, and restore the demo baseline.
---

# Crew recovery case studies

Use this skill when documenting a concrete crew-unavailable/recovery incident for
Gantt Help, especially when the case must be reproduced through the real mobile
crew UI and the real controller/Recovery UI. This is a case-study workflow, not
a generic recovery explanation and not permission to mutate unrelated roster data.

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

## Approved crew-to-controller workflow

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

## GH comparison and candidate visibility

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
