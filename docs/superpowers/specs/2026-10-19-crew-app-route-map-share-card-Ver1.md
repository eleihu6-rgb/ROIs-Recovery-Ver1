# Crew App — Route map share card (Ver1)

## Goal

Let a crew member share the month's Route map from Schedule ▸ Route map as a
ready-to-post picture. Instagram is the first target; the picture must look
worth posting on its own, without the app around it.

## Format

- **1080 × 1350 px PNG (4:5)** — Instagram's feed portrait format. It also
  works in Stories, where Instagram adds its own background.
- The picture carries **the roster month and year** (`SEP 2026`) prominently,
  the base, the month's map, the month's headline numbers and the destinations.
- No crew id, name, email, flight numbers or times are drawn. The card is
  shareable without exposing personal or operational detail beyond the route
  network the crew already chose to post.

## Card design

Carrier theme colours, one accent:

1. Carrier-gradient ground with two soft glow discs and sparkles.
2. Airline name + a paper-plane mark on the top row.
3. `SEP 2026` as a tracked eyebrow above a two-line title, `MY MONTH / IN THE
   SKY`.
4. `BKK · SUVARNABHUMI` subtitle.
5. Rounded map postcard with a perforated stamp border: the same world outline,
   great-circle routes, destination dots and base ring the in-app map draws.
6. Three headline figures: flights, kilometres flown, countries.
7. Destination "stamps" — up to eight (code + km), the ninth slot becomes
   `+N` when the month has more airports.
8. Daylight (light) palette gets a paper-white/blue poster instead of the dark
   carrier ground.

## Flow

1. A share button (paper-plane icon) sits in the map's top-right chrome.
2. It opens the standard `AppDialog` with a live preview of the card.
3. **Share** renders the SVG card to PNG at 1080 × 1350 through
   `react-native-svg`'s `toDataURL` (no new JS dependency). The dialog keeps an
   off-screen copy of the card laid out at `1080 ÷ screenScale` ×
   `1350 ÷ screenScale` points and captures that: `toDataURL` draws at the
   native view's own bounds and uses the requested size only for the canvas, so
   capturing the 210 pt on-screen preview produced a correctly sized but mostly
   blank file.
4. The PNG is handed to a small native `ShareModule`, which writes it to a
   temporary `.png` file and presents the iOS share sheet with the file URL.
   Instagram, Messages, Photos etc. accept the item as an image; Instagram is
   the first target of the sheet. The temp file is deleted when the sheet
   closes.
5. If image rendering or sharing fails, the dialog stays open with an inline
   message; the crew can retry.
6. The native promise resolves only when the share sheet finishes, so the
   dialog (and the view controller presenting the sheet) stays mounted while
   the sheet is open. Closing the dialog first would dismiss the sheet with it.

The dialog's card is `accessible={false}`: it exists to swallow taps that land
on the card instead of the backdrop. Leaving it accessible made iOS merge the
title, message and both pills into one VoiceOver element, so Share/Close could
not be focused or pressed. The pills carry explicit `accessibilityLabel`s.

Why a native module instead of `Share.share({ url: 'data:…' })`: React Native's
iOS share bridge accepts data URLs but hands UIKit raw `NSData`, which is typed
as `public.data` and is not reliably accepted by image-only share extensions
(including Instagram). A real `.png` file URL is typed `public.png`.

## Files

- `crew-app/src/features/v2/routeShare.ts` — model, stamp list, SVG capture
  helper, native-share wrapper.
- `crew-app/src/features/v2/RouteShareCard.tsx` — the pure SVG poster.
- `crew-app/src/features/v2/RouteMapView.tsx` — share button + preview dialog.
- `crew-app/ios/RoyceTravelTemplate/ShareModule.swift` /
  `ShareModule.m` — temp-file write + `UIActivityViewController`.
- Tests: `routeShare.test.ts`, `routeShareCard.test.tsx`.

## Verification

- Jest + `tsc` for the model, overflow, capture contract and the full
  open → preview → share flow.
- Real UI on the iOS simulator: Air (TG + PR), Duo (landscape + tall), iPad
  (TG + PR), dark and Daylight. Tap Share, confirm the preview, confirm the
  system sheet opens with the generated image, and save the PNG to Photos to
  inspect the actual 1080 × 1350 output.
