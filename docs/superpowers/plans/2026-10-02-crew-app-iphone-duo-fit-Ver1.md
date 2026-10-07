# crew-app — fit for iPhone Duo (and keep regular iPhones unchanged)

Status: PLAN (no code changed yet). Date: 2026-10-02. Owner: Ryan.
Mockups: `docs/assets/mockups/crew-app/duo-fit-mockups-Ver4-k1001.html` (real K1001 October roster; supersedes Ver1–Ver3). Wide rule from review: every wide page uses the full inner width — route map = 50% map / 50% route details; detail pages, profile, R'Bot, destination, home, schedule, calendar are multi-column.

## Hard constraint
Every change must be **additive and gated on window size**. Regular iPhones (reference: iPhone Air, 420x912pt)
keep today's layout pixel-for-pixel; only the wide (inner) Duo layout changes. Outer Duo screen is a regular
portrait phone and must need no special layout beyond a narrow-width check.

## Target form factors (measured from the simulator, `simctl io enumerate`)
| Form factor | Framebuffer px | Approx. pt (@3x) | Layout class |
|---|---|---|---|
| iPhone Air (baseline) | 1260x2736 | 420x912 portrait | `compact` (unchanged) |
| Duo outer screen | 1398x2034 | ~466x678 portrait | `compact` (short — verify height) |
| Duo inner screen (unfolded) | 2007x2853 | ~951x669 landscape (1.42:1) | `wide` (new) |

Layout class rule: `wide = windowWidth >= 700` via one `useWindowDimensions`-based hook (live, so fold/unfold and rotation re-render).

## Verified on device so far (Duo inner)
- App renders after the iOS 27 scene fix (stale build was the black screen).
- Login: card clipped at the bottom ("Login as Guest" cut off); content area looks smaller than the display (strip at right/bottom) — cause not yet confirmed.
- Simulator slow while the iOS 27.1 runtime pages in (low free RAM).
- Maestro attaches to the OUTER display, not the inner one — flows cannot drive the app on the inner screen as is.

## Findings from the static code audit (NOT yet verified on device)
Only v2 UI is live (`RootNavigator USE_V2 = true`).
Blockers: every `<Modal>` lacks `supportedOrientations` (AppDialog, Profile avatar sheet, AirlinePicker, PortalCapture) → rotation snap in landscape.
Major: no left/right safe-area use; PillDock full width + ~92pt lost at bottom; Home/Schedule single column stretched to ~850pt; RouteMap fixed 240pt height; Destination pager offset stale after width change + 54% info panel covers a wide photo; R'Bot bubbles ~730pt wide; PageShell content unbounded (affects ~10 pages); EkRosterLoginScreen has no cancel; AbsenceScreen note field hidden by keyboard.
Minor: Global not scrollable, calendar cells flat, AppDialog body not scrollable on short windows, gradient texture fixed size.
R'Bot "no return button": code has a chevron `rbot-close` at the header's right end — it must be checked on the Duo (may sit under the status/hinge area or off the visible region). Fix regardless: move to the left, match PageShell back.

## Plan (ordered, smallest safe steps)
1. **Foundation**: `useLayout()` hook (`wide`, `width`, `height`, insets) + `ContentColumn` (centered, `maxWidth`, left/right insets). No visual change on compact.
2. **Modals**: add `supportedOrientations` to all Modals.
3. **PageShell** wide = full-width multi-column body (no centered narrow strip; e.g. trip/duty detail = legs+timeline | facts+mini map) + `automaticallyAdjustKeyboardInsets`. Compact unchanged. (Revised 2026-10-07: user feedback — the 640 pt cap left most of the inner screen empty.)
4. **Login**: card `maxWidth 440` centered; wide = two columns (hero | card); never clip the guest button (scroll).
5. **PillDock**: wide = `maxWidth ~420`, centered (or left rail later); compact unchanged.
6. **R'Bot**: left back button, thread column `maxWidth 560`, tighter header when wide.
7. **Home / Schedule**: wide = two columns (trip + destinations | quick actions / list + selected day). Compact unchanged.
8. **Destination**: re-sync pager on width change; wide = info panel as side card.
9. **Route map / Calendar / Global / Profile / Alerts**: sized by width; scrollable.
10. **EkRosterLogin**: Cancel button.
Each step: Jest test for the layout hook/pure sizing logic; simulator pass on **Air (compact regression) + Duo inner + Duo outer**, TG and PR accounts (per crew-app/CLAUDE.md); APP_VERSION bump; screenshots versioned `-Ver<N>`.

## Test tooling gap
Maestro drives the Duo's outer display. Need either: run the app on the outer display for compact checks, or drive the inner display (cmux-cua on DeviceHub / `simctl io` screenshots + coordinate taps). Decide before step 1 lands.

## Open items
- K1001 (EK) roster seeding is blocked: no DB credentials on this machine (`live-server/.env` missing).
- Outer-screen exact pt size / safe area and hinge keep-out region on the inner screen: confirm on device.
