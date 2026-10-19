# Trip Details Ver2

## Scope
Create a separate local HTML design exploration at `docs/assets/mockups/crew-app/trip-details-redesign-Ver2.html`. Preserve Ver1 and all existing application work. This is a standalone prototype, not an implementation in the React Native app.

## Design
Replace Ver1's gradient and floating translucent cards with an opaque journey sheet. Use the existing purple and neutral theme tokens, system sans for UI, and monospace for aligned times. A compact header contains the calendar action. A horizontal itinerary becomes a vertical navigation rail on wide viewports. Duties read as continuous sections with crew preparation and totals beside flight tables on wide screens, stacked on compact screens. Layover information remains between duties. Nothing is hidden behind flight accordions.

## Information and interactions
Preserve both complete Ver1 examples, PR501/PR512 and TG662/TG663, including trip metadata, all duty markers and FDP/DP/Block/Rest values, flight index/number/route/date/fleet, scheduled/estimated/actual pairs, block durations, boarding/door close/off-block, terminal/gate/stand/belt, rest interval, and hotel/check-in/check-out/night count. Preserve the data source mapping and missing-value guidance in an expandable design note. Calendar opens an inline event preview and does not write to a calendar. Trip switching, section navigation and theme switching work.

## Risks
Ver1 values are illustrative and contain local-time/date/block inconsistencies. Preserve them rather than invent corrections. Label the entire prototype as sample data and the airport operations explicitly as demo. Do not imply that the example rest gap proves legal rest, that a hotel is confirmed, or that calendar entries have been saved. No external resources, network calls, or real crew records are needed.

## Verification
Use Playwright real clicks on the local file at 420×912, 912×420, 669×951, 951×669, 834×1210, and 1210×834. Verify both trips, all information groups, section navigation, inline calendar preview and theme switching. Capture versioned screenshots in the same runs and inspect their pixels. Check page overflow, JavaScript errors, root UI standard and diff whitespace. Native simulator and app build checks do not apply because app code is unchanged.
