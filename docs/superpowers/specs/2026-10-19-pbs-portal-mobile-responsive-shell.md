# PBS Portal Mobile Responsive Shell

## Goal

Make the PBS Portal usable on phone-sized viewports (portrait, ~360-430 CSS px)
without changing the existing desktop workbench baseline.

## Scope

- Add a phone layout branch below the Tailwind `md` breakpoint (768px).
- Keep the current scaled 1888x968 desktop canvas at `md` and above.
- Replace the scaled desktop header with a compact mobile header and navigation
  drawer on phones.
- Let dashboard, award, standing bid, help, bid, and pairing-search pages flow
  vertically instead of fitting a fixed desktop canvas.
- Stack dense bid/pairing rows into readable cards on phones.
- Preserve desktop layout, selectors used by existing tests, and shared data
  state (bidding calendar store + TanStack Query cache).

## Out of Scope

- New UI dependencies or a second design system.
- Native app behavior in `pbs-app`.
- Redesigning desktop information architecture or business workflows.

## Affected Modules

- `pbs-portal/src/app/layout` (shell, mobile navigation)
- `pbs-portal/src/shared/components/layout/scaled-page-canvas.tsx`
- `pbs-portal/src/features/dashboard`
- `pbs-portal/src/features/award`
- `pbs-portal/src/features/bid`
- `pbs-portal/src/features/pairing`
- `pbs-portal/src/features/help`
- `pbs-portal/src/features/auth`

## Verification

- Unit tests for the viewport hook, mobile navigation, shell padding, and mobile
  canvas bypass.
- Playwright at a phone viewport: login, dashboard layout, nav drawer, Bid,
  Award, and Help.
- Screenshot captured from the same Playwright run under
  `docs/assets/screenshots/pbs-portal/`.
- `npm test`, `npm run lint`, `npm run build`, and `npm run check:ui`.

## Risks

- Dense operational tables remain information-heavy; phones get stacked cards
  rather than a full table redesign.
- Very small windows between 768px and the desktop design width still use the
  existing scaled canvas by design.
