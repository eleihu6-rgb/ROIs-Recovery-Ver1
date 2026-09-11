# Project rules

## Versioning (MANDATORY on every code change)
- The version is a **plain integer** in `rn-app/src/version.ts` (`APP_VERSION`).
- On **every** code change, **bump it by 1** (1 → 2 → 3 …).
- It is shown on the **Profile page** (Preferences → Version) so the installed
  build is identifiable on-device. Bump it as part of the same change set,
  before building/deploying.

## Testing (MANDATORY for every feature and bug fix)
- Every new feature and every bug fix **must** have a Jest test case that directly
  covers the added behaviour or the fixed scenario.
- **Definition of done: the test must pass** (`npx jest <test-file>`) before the
  work is considered complete. A fix without a passing test is not done.
- Test file location: `rn-app/__tests__/features/<featureName>.test.ts`.
- For a **bug fix**: reproduce the exact failure first (test should fail on the
  original code), then confirm it passes after the fix.
- For a **new feature**: cover the golden path and any edge cases stated in the
  requirements.
- `npx tsc --noEmit` must also pass (no new type errors) as part of done.

## Simulator validation (MANDATORY after every dev)
- After **every** change, validate on the iOS Simulator with **both accounts**:
  a **TG** (THAI) crew and a **PR** (Philippine Airlines) crew — never just one.
  Test creds live in `TEST_CREDENTIALS` (`rn-app/src/features/auth/airlines.ts`):
  TG `35459` / PR `433535`.
- The run must confirm the change works AND that switching accounts keeps data
  clean — **no mixing of PR/TG** in the app.
- Prefer the Maestro flows in `rn-app/.maestro/` (`tg_login.yaml`, `pr_login.yaml`,
  `switch_account.yaml`) for repeatable runs; fall back to a manual sim pass.
- Jest + `tsc` passing is **not** sufficient — a change isn't done until it has
  been seen working in the simulator on both airlines.

## UI / Style (MANDATORY for every screen)
- **Icons: always the nav-bar style.** Outline SVG glyphs (24-unit viewBox,
  ~1.9 stroke, rounded joins, colour from a theme token) — the shared set in
  `rn-app/src/features/travel/components/TripIcons.tsx`. **Never use emoji** as a
  UI icon; reuse the shared component so the same concept (e.g. hotel) looks
  identical on every page.
- **Fewer colours per page — ONE accent.** The app's single brand accent is
  **purple** (`primary`/`accent` + its tints). Lean on neutrals (`ink`/`inkSoft`/
  `muted`/`hairline`) + purple. **No second accent hue** — no gold, blue, orange
  or green (all removed). `danger` red is allowed in destructive modals only.
  Even when a second colour would technically pass, prefer reusing a colour
  already on the screen over adding one. All colours/fonts from `theme.ts`
  tokens — no inline hex/`fontSize` except translucent white over photos and SVG
  gradient stops.
- **No duplicated info on one screen.** If a value already reads off another
  element in view (e.g. dates shown on the flight legs), don't repeat it.
- **No overlap.** Text, images, and texture/pattern layers must not overlap each
  other, and must minimise overlap with the **dynamic island** (top-centre). When
  a header fills behind the island, keep its text + motifs to the sides/bottom so
  the island stays clear; pad content by the safe-area top inset.

## App
- The active app is the React Native app in `rn-app/` (`royce-travel-rn`).
- iOS device build is signed via the `/tmp/sign_install.sh` workaround (iCloud
  path adds xattrs that break codesign). Simulator builds use
  `-sdk iphonesimulator ... CODE_SIGNING_ALLOWED=NO`.
