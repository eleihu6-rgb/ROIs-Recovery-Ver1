# PBS Portal — Phone Responsive Shell

## Preconditions

- PBS Portal is running and reachable.
- A valid crew account is available.
- Test on a phone-sized viewport (375-430 CSS px wide), preferably both
  Chrome device emulation and one real handset.

## Cases

### MOBILE-01 — Login fits the phone

1. Open `/pbs/login` at 390x844.
2. Confirm the Sign In and SSO Login buttons are fully visible.
3. Confirm the page does not scroll horizontally.
4. Sign in with a valid crew account.

Expected: the form fits the viewport, all fields and buttons are reachable, and
login redirects to Dashboard.

### MOBILE-02 — Compact header and navigation drawer

1. Open Dashboard at 390x844.
2. Confirm the header shows the Flair mark, current section, avatar, and menu
   button.
3. Tap the menu button.
4. Switch between Dashboard, Bid, Award, Standing Bid, and Help.
5. Open the menu again and choose Log out.

Expected: the drawer contains every portal section; selecting one closes the
drawer and navigates to that section; logout shows the confirmation dialog and
returns to Login after confirming.

### MOBILE-03 — Dashboard stacking

1. Open Dashboard at 390x844.
2. Scroll from top to bottom.

Expected: the bidding calendar appears first, followed by the crew profile and
pre-assigned duties. Panels use full width, no text is clipped horizontally, and
the page scrolls vertically.

### MOBILE-04 — Award stacking

1. Open Award at 390x844.
2. Confirm the summary cards use two columns.
3. Scroll to the Award calendar and roster details.
4. Change the Award period.

Expected: the calendar appears above the roster details; the reason report
button is fully visible; tables scroll horizontally inside their own card rather
than widening the page.

### MOBILE-05 — Bid workbench

1. Open Bid at 390x844.
2. Confirm the bidding calendar starts collapsed.
3. Tap Show and confirm the calendar opens in its own horizontal scroller.
4. Tap Hide.
5. Switch between the existing bid summary and Add Bid Properties tabs.
6. Add or edit one bid property.

Expected: the calendar toggle works; bid rows render as stacked cards with
property, bid, tiers, and actions readable; dialogs fit the viewport.

### MOBILE-06 — Help

1. Open Help at 390x844.
2. Use the topic search.
3. Select an article.

Expected: the topic navigation occupies the upper portion of the screen and the
article scrolls below it; no horizontal page overflow.

## Edge Cases

- Rotate the phone to landscape and confirm the layout remains usable.
- Open a dialog with the on-screen keyboard visible; confirm actions remain
  reachable.
- Confirm iPhone safe-area insets do not obscure the last page action.
- Confirm a 768px-wide desktop window still uses the existing scaled desktop
  layout.

## Regression Scope

- Desktop Dashboard, Award, Bid, Standing Bid, and Help remain unchanged.
- Bidding calendar data and selected tier persist while switching sections.
- Logout confirmation remains clickable above the dim overlay.
