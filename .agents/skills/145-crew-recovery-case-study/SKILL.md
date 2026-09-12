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

The current Case 1 observation is recorded, not a claim of resolution:

- ET captain Getnet Kifle; crew identifier `J4002` (this is the crew, not a
  flight number); ADD base; pairing `152056`; six legs.
- Sick-leave request `9`, 25–26 September, persisted; the mobile app reported
  “Unable to submit” despite a committed stand-down, and notification `absence-9` was
  not present.
- Standby, swap, and delay were blocked by a missing recovery entry.
- The user requested restoration. Never imply that the incident is fixed or the
  demo reset is complete unless the later real-UI evidence proves it.

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

Cleanup is limited to the exact request-owned records and duties established by
the manifests. Do not “clean up” earlier absences, unrelated crew duties, or
unaffected pairings. Restore the requested baseline, then verify the restoration
through the real UI (mobile and controller as applicable), not only SQL/API
checks. A reset is incomplete until the UI shows the expected state. Stop and
report any mismatch instead of broadening deletion or restoration.

## Source and data traps

- At the Case 1 baseline, Recovery used `1001` ground/flying overlap or `8004`
  qualification alerts on assigned pairings. Absence stand-down removed the
  source assignment, so those entrances did not provide an open-seat recovery
  search. Recheck current code and actual UI before assuming that limitation persists.
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
  replay instructions and outstanding defects, not just the happy-path narrative.

Start each option from an equivalent incident state. Undo unsaved drafts through
existing UI controls; restore committed option effects only using a scoped,
preflight-checked reset. Never reuse Case 1's numeric IDs as a generic reset script.

After any direct authorized restoration, refresh the affected roster version,
pairing detail/composition **and pairing-list caches** using current invalidation
utilities. Case 1's first reset left a stale CA(2:1) list badge despite CA 2/2 in SQL.
Assert displayed coverage as well as assignment IDs after a fresh UI load. Preserve
honest audit timestamps; baseline restoration does not mean erasing audit history.
