# Duo portrait navigation and trip information — 2026-10-09, Ver1

## Changes

- The unfolded Duo's four main tabs now form one right-edge group in both inner-screen orientations. The AI control is a separate circle beneath them. The Schedule view selector remains a distinct upper group. Normal iPhones, the Duo cover, and iPads keep their existing bottom navigation.
- A rotated inner screen can report a zero right safe-area inset. The 669×951 layout reserves an 84pt action strip in that case and keeps tab-page content clear of it.
- Trip Details omits TCD and TSAT cells. The wide Destination information pane uses available rotation route, crew timing, and onward-flight details to fill the open area. It does not invent trip values.
- `APP_VERSION` is 195.

## Evidence

- `docs/assets/screenshots/crew-app/duo-home-portrait-nav-final-Ver1.png` — installed v195 on the unfolded Duo, portrait. Four tabs are grouped on the right; AI is outside the group. Visually inspected.
- `docs/assets/screenshots/crew-app/duo-home-landscape-nav-final-Ver1.png` — installed v195 on the unfolded Duo, landscape. The same grouping is visible. Visually inspected.
- `npx jest __tests__/features/duoNavRail.test.tsx __tests__/features/duoLayout.test.ts __tests__/features/duoPageLayouts.test.tsx __tests__/features/tripDetailsOps.test.tsx __tests__/features/destinationView.test.tsx --runInBand --silent` — PASS, 5 suites / 77 tests.
- `./node_modules/.bin/tsc --noEmit --project /tmp/crew-light-source-tsconfig.json` — PASS.
- `npm run check:ui` — PASS, zero hard violations and 124 existing warnings.
- `git diff --check` — PASS.

The final Trip Details and Destination pages were validated by focused component tests, but a fresh native screenshot of those pages was not captured. The Duo's inner-screen touch helper returned `no touchscreen for display` after rotation, preventing navigation to them in this simulator. Earlier full-suite Jest status remains 5 calendar suites / 16 tests failing; this pass used focused suites.
