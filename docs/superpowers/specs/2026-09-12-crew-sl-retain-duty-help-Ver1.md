# Crew sick leave retains duties; client Help case rewrite

User approval: change crew-app sick leave submission so original duty is not deassigned; rewrite Case study1 J4002 unavailable at ADD without defect screenshot/history; maintain skill for future recovery cases.

## Ownership and behavior

Absence submission owns the absence record and full base-local-day ILL ground tasks (existing sick-leave mapping), not flying-seat removal. Preserve original roster IDs, assignments, and coverage. Keep historical removed_pairing_ids semantics: new submissions have none. Add retainedPairingIds to response/notification where needed; do not relabel retained pairings as removed. Crew Control Recovery Apply+Save owns subsequent reassignment. No rule/qualification bypass or medical fitness inference. Use existing manday/recheck/broadcast mechanisms; isolate postcommit failures to avoid reporting failed submission after commit. Do not conceal failed downstream work in internal logs/tests.

## Scope boundary: date-only mobile vs controlled controller fixture

Mobile submits inclusive base-local dates, not the prepared Sep24 00:15–12:15 UTC partial-day SL interval. Real mobile end-to-end test must prove saved absence + original duty retained + actual1001 + standby recovery entry. It cannot claim the identical six swap options or08:06 delay from the prepared shorter absence window. Help labels prepared comparison values as such and explains candidates depend on absence window/loaded data. Changing swap same-business-date search or introducing partial-day mobile leave is outside this request.

## Parallel ownership

Backend/app agent: absence service/route/app screen + focused regression tests. Help agent: case topic/registry/content tests/public screenshot assets, no browser writes. Skill agent: reusable145 workflow. Primary: integration source review, real UI tests, baseline/reset, final evidence and context save. Preserve concurrent schedule/calendar changes and prior case evidence.

## Verification and cleanup

J4002 source152056 original rows1355154–1355159 and existing prepared SL1355350 preserved by manifest. New UI submission uses uniquely owned note/request ID, never retries blindly after an error. Verify all original assignments and coverage stay active. Capture success rather than prior error screenshot. Inspect actual persisted request/ground tasks and1001. Remove/cancel only new test-owned absence+ground tasks and notification after proof; preserve earlier absences and prepared comparison baseline. Final real controller UI must show expected recovery state and no draft. Unit tests, real SQL parsing/HTTP path, Help content/screenshot checks and inspected versioned screenshots required; report blocked simulator/network checks honestly.
