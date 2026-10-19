# Duty Swap Ticket polish verification

## Manual acceptance

Use PR 473006 (Ryan's replacement for the rejected PR test login). Ryan explicitly waived TG testing. No live swap requests should be sent during visual review.

1. Open Duty Swap > Ticket: all four numbers and labels remain readable, including current Give. Next is disabled with nothing selected.
2. Select two unlocked round-trip duties; remain on Give, both checkboxes selected. Deselect/reselect one. Crew-control locks remain unavailable.
3. Next to Want: both give duties remain visible above the existing filters. Change target filters. Back to Give preserves selection; forward preserves filters. Reset remains accessible. Only one Find matches action is shown.
4. Find matches: You give appears once. Each crew is represented once under You take, including the full take bundle. Search errors display their message and cannot expose stale selectable matches.
5. Choose a crew: stay on Match until Next. Review shows one give/take comparison, one note and one send action. Back/Next preserves note and selection. Changing Give or searching again clears the match.
6. Check compact, tall and wide layouts; the AI launcher must not overlap the navigation. Review is stacked on phone, side by side on larger screens.
7. Submission payload/legality handling is verified with mocked portal tests, without sending real requests.

## Automated commands and evidence

- `cd crew-app && npx jest __tests__/features/dutySwapTicket.test.tsx __tests__/features/dutySwapMarket.test.tsx __tests__/features/dutySwapCabinCrew.test.tsx --runInBand --silent` — PASS, 41 tests. Initial navigation regression: six failures against original code before implementation.
- `cd crew-app && npx tsc --noEmit` — PASS.
- `npm run check:ui` — PASS, zero hard violations; 124 pre-existing warnings.
- `git diff --check` — PASS.
- `cd e2e && npx playwright test --config=config/playwright.crew-ticket.config.ts` — PASS, six viewport tests at 420×912, 912×420, 669×951, 951×669, 834×1210 and 1210×834. Uses installed Chrome because bundled Chromium is absent. This tests the HTML mockup, not the native app.
- Playwright screenshots: `docs/assets/screenshots/crew-app/ticket-mockup-<width>x<height>-Ver2.png`, all visually inspected. Content scrolls inside the viewport while Back/Next remain visible; no page overflow. Ver1 captures retained.

## Native validation

Command pattern (run from root, set device and unique evidence version):

```sh
TEST_RUNNER_TICKET_DEVICE=air TEST_RUNNER_TICKET_PR_CREW=473006 \
TEST_RUNNER_TICKET_VERSION=2 \
TEST_RUNNER_TICKET_SHOT_DIR="$PWD/docs/assets/screenshots/crew-app" \
xcodebuild test -workspace crew-app/ios/RoyceTravelTemplate.xcworkspace \
-scheme RoyceTravelTemplateUITests -configuration Debug \
-destination 'id=D8409020-8121-4F25-AC0F-A6C1ABA9B12F' \
-derivedDataPath /tmp/crew-app-ticket-air -parallel-testing-enabled NO \
-only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testTicketPolishNavigation \
CODE_SIGNING_ALLOWED=NO
```

The executed Air Ver2 method was originally named `testTicketPolishNavigationAndIsolation`. PR 473006 completed Give (two duties), Want, Match, Review and Back/Next. Screenshots `ticket-polish-air-{give,want,match,review}-Ver2.png` were captured in that run and inspected. Both offered duties reached the review and the AI launcher no longer overlaps navigation. The combined suite FAILED afterward waiting for Home during TG switching. The method is now PR-only per Ryan's explicit direction; do not report that combined run as a full PASS.

Duo PR login did not finish; the run was interrupted instead of extending retries. A read-only portal probe returned HTTP 502 from Microsoft Azure Application Gateway, and a subsequent probe timed out. This is external availability evidence, not proof of the authentication failure's cause. Remaining native validation status is recorded in the delivery/context note.

## Mockup provenance

Original online artifact, found in the existing MHTML archive: https://claude.ai/artifact/V5KkTbgqi2H1PGwFAZVQAi

Local updated interactive Ticket mockup: `docs/assets/mockups/crew-app/duty-swap-mockups-Ver2.html`. Ver1 retains the original concept collection. No authenticated editor was available to replace the hosted artifact; no online update is claimed.

Final native gap: the PR-only iPad command used the same command pattern with `TEST_RUNNER_TICKET_DEVICE=ipad`, `TEST_RUNNER_IPAD_SHOT_DIR` set to the screenshots directory, destination `7E7EB9CC-3407-4103-9959-E159E143B68A`, and `testTicketPolishNavigation`. It FAILED in existing login automation: `airline-search did not appear`. It never reached Ticket. Do not attribute this iPad failure to the portal or claim iPad native validation passed. TG is excluded by explicit user instruction. Duo and iPad native verification remain incomplete; all six geometry checks are covered by Jest and the HTML mockup, which do not replace native evidence.
