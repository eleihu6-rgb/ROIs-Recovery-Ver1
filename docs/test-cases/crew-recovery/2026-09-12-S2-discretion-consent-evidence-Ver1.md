# S2 crew agreement communication — validation receipt

## Scope and state

The implemented controller → crew → controller loop reuses Live's durable `crew_notification`, crew-app Alerts, and the existing Edit Duty Nodes dialog. This is consent communication, not an executed regulatory override or a published-delay recovery demonstration. The source pairing remained at its planned baseline throughout this validation.

Fixture: pairing **152548**, duty **1**, **PI201/PI202 SIN–HKG–SIN**, 28 September 2026. Required crew are **S21001**, **S21014**, **S21015**. Server-owned report **04:00 UTC**, release **15:15 UTC**, calculated FDP **660 minutes**; both before/proposed operational windows remain identical in this consent-only exercise. Requested extension **60 minutes** is a controller proposal, not an approved regulatory allowance. Notification carrier is the crews' **F8** ownership; PI flight numbers were not relabelled.

Three insert-only test accounts, IDs **936–938**, were provisioned for these crew following the existing crew-app account seed. Existing accounts were preflighted and not overwritten. Access flags were corrected on only these new owned accounts to the existing `1` convention after the first mobile login exposed the wrong `Y` fixture flags. No real email was configured. Private credentials and setup manifests remain in ignored `.local/s2-consent/` and are excluded from this document.

## Observed operations

| Actor | Real UI operation | Observed result | Evidence |
|---|---|---|---|
| Controller | Headless Chromium, Live pairing context menu → Edit Duty Nodes → Request FDP agreement → enter extension/deadline/reason → Send request to crew | One group with all three server-derived recipients Pending. No roster/flight write. | `docs/assets/screenshots/gantt/s2-consent-controller-sent-Ver1.png` |
| S21001 | iOS Simulator, sign in → Alerts → view before/proposed → Yes → confirm | Decision sent, accepted; actionable request disappears. | `docs/assets/screenshots/crew-app/s2-consent-mobile-request-Ver1.png`, `s2-consent-mobile-yes-Ver1.png` |
| S21014 | iOS Simulator, separate account sign in → Alerts → No → confirm | Decision sent, rejected; actionable request disappears. | `docs/assets/screenshots/crew-app/s2-consent-mobile-no-confirm-Ver2.png`, `s2-consent-mobile-no-Ver1.png` |
| Controller | Fresh headless login → reopen same duty → Refresh crew feedback | S21001 Yes, S21014 No, S21015 Pending; return-to-review completion action disabled. Previously sent windows remain immutable. | `docs/assets/screenshots/gantt/s2-consent-controller-feedback-Ver1.png` |
| Controller | Prepare new request → Send request to crew | New group starts with three Pending replies, superseding earlier group without deleting earlier decisions. | Real HTTP response asserted by `.local/s2-consent/controller-newgroup.cjs`; final receipt retained locally. |

First proposal ID: `2359ad36-48c9-48d8-91e1-6cb6ea60b6db`. The initial screenshot predates the review of button wording: the final action is **Return to controller review**, not the old disabled **Proceed with discretion**. That action does not write FDP discretion fields.

All listed screenshots were captured by the same Playwright/Maestro run as their assertions and visually inspected. The first mobile captures were written by Maestro to an unintended parent docs path and copied, unchanged, into the required repository screenshot directory. Later captures use the absolute repository path.

## Commands and results

- `cd live-server && npx vitest run src/services/crew-notify/__tests__/discretion-consent-service.test.ts src/services/crew-notify/__tests__/crew-notify-service.test.ts src/__tests__/unit/crew-notify-route.test.ts` — **PASS**, 23 tests.
- `cd crew-app && npx jest __tests__/features/discretionScreen.test.tsx __tests__/features/notificationsApi.test.ts __tests__/features/notificationsSlice.test.ts --runInBand` — **PASS**, 21 tests. Existing Jest configuration warnings remain.
- `cd gantt && npx vitest run src/components/recovery/__tests__/discretion-consent-panel.test.tsx` — **PASS**, 2 tests: immutable sent snapshot despite changed current duty; refreshed all-Yes state invokes review callback without an execution API call.
- `cd crew-app && npx tsc --noEmit` — **PASS**.
- `cd live-server && npx tsc --noEmit` — **FAIL**, unchanged `src/services/rule/legality-preview.ts:288` dimension string/union mismatch. No consent-file errors.
- `cd gantt && npx tsc --noEmit` — **FAIL**, unchanged `src/components/shell/service-status-pill.tsx:104,115,116` missing `livePort`/`checkedAt` properties. No consent-file errors.
- `npm run check:ui` — **PASS**, zero hard violations; 124 existing warnings.
- `git diff --check` — **PASS**.
- `node .local/s2-consent/controller.cjs` — **PASS** actual headless send and Pending assertions at the initial checkpoint.
- `node .local/s2-consent/controller-newgroup.cjs` — **PASS** actual headless reopened Yes/No/Pending feedback and new-group creation. This script sends another proposal; do not rerun casually against a completed checkpoint.
- `maestro test -e S2_CREW_ID=S21001 -e S2_CREW_PASSWORD=<private-local-value> .local/s2-consent/mobile-yes.yaml` — **PASS**, real Yes reply. Actual invocation supplies the secret from the private local fixture, not this document.
- `maestro test .local/s2-consent/mobile-no-resume.yaml` — **PASS**, real No reply from the already authenticated S21014 session.
- Remote SQL read + canonical snapshot smoke used the configured Live service connection and **PASS** on source152548. The actual controller send/feedback endpoints additionally exercised the parameterized JSON SQL against SIT, including the new-group atomic supersession statement.

## Defects found and boundaries

The real simulator run exposed a pre-existing Alerts authentication gap: it loaded only a persisted Keychain session, even after successful in-memory crew login. Alerts now passes the active authenticated crew credentials for feed, decision and read receipt; the rendered Jest regression covers a non-persisted session. Before/after and decision responses now unwrap Live's response envelope. Naive UTC duty timestamps are explicitly interpreted as UTC rather than Mac local time.

A first No automation attempt matched the underlying No control rather than the native confirmation, and a concurrent diagnostic Maestro hierarchy call caused a native test connection failure. No rejection was claimed until a serialized confirmation run submitted and displayed **Decision sent**. Keep Maestro operations serial on this simulator.

The current SIT configuration has no approved applicable rule3007 instance/parameters established for this S2 fixture. No code here grants extension permission, writes `duty_fdp_discretion_min`, resets elapsed FDP, sends customs documents or changes a flight. The execution owner remains the existing pairing-duty fields and legality engine. A changed estimate without an authoritative recalculated actual FDP is blocked instead of substituting invented counters; unchanged schedule may use its calculated scheduled FDP as the current baseline.

Fingerprint invalidation covers the pairing, selected duty segments, linked physical flights, recipients and all their current roster rows. It is deliberately conservative. Fresh regulatory validation remains separate, including any ruleset parameter changes. Pending, rejected, expired and superseded requests do not complete agreement. New requests invalidate older requests by the same controller for that duty without erasing their replies. Closed-app push delivery was not tested; the existing feed/focus refresh is the observed transport.

Case1 protected crew/pairing/flight records were not written by this subtask. TG/PR simulator regression has not yet been run for this change; F8 three-account isolation and existing notification unit tests are the validated mobile scope. This receipt does not claim full cross-carrier validation.

## Final unanimous checkpoint

Second proposal **6352fbb8-4f2d-4f3c-ac79-a5a944dcfb8b** received real **Yes** replies from all three source crew through separate authenticated simulator logins. `python3 .local/s2-consent/run-unanimous.py` — **PASS**, Maestro exit0 for S21001, S21014 and S21015. Per-crew screenshots are under `docs/assets/screenshots/crew-app/s2-consent-mobile-unanimous-<crewId>-request-Ver1.png` and `...-yes-Ver1.png`; the final S21015 accepted confirmation was visually inspected.

`node .local/s2-consent/controller-unanimous.cjs` — **PASS**, fresh headless controller UI showed three Yes replies, enabled **Return to controller review**, and clicking it closed Edit Duty Nodes. The test asserted **zero draft operations**. Screenshots `docs/assets/screenshots/gantt/s2-consent-controller-unanimous-Ver1.png` and `s2-consent-controller-returned-Ver1.png` were captured in that run and visually inspected. The UI explicitly retained “Independent regulatory validation is still required before execution.”

Final data checkpoint: two durable request groups (six notification records), first group superseded with earlier Yes/No replies retained, second group all accepted. The source roster and flights remain unchanged; no flight-delay publication or FDP-discretion execution occurred. The simulator is left signed in as the isolated S21015 test crew.
