# Crew App Home landscape dashboard and arrival weather

## Scope

Polish the active V2 Home screen for landscape viewports. iPhone Air landscape,
iPhone Duo inner landscape, and iPad landscape share one dense dashboard layout:

- carrier brand, greeting, alerts, and alarms share one header row;
- Upcoming Trip and Quick actions share one horizontal dashboard strip;
- Explore destinations becomes a full-width horizontal card row below the strip;
- Upcoming Trip shows the Apple Weather symbol and hourly temperature nearest
  the first leg's airport-local arrival time directly beside the arrival airport.
  Loading, unavailable, and out-of-range states add no separate placeholder row.

iPhone Air and iPad portrait structures remain unchanged. The Duo inner tall
portrait keeps its existing one-column order and three-card destination row, but
the cards grow vertically into the measured space above Quick Actions. Existing
navigation and trip selection behavior remain unchanged.

## Affected modules

- `crew-app/src/features/v2/HomeScreen.tsx`: responsive composition and compact
  arrival-weather presentation.
- `crew-app/__tests__/features/duoPageLayouts.test.tsx`: geometry, portrait
  isolation, iPad landscape, and arrival-airport WeatherKit regression coverage.
- `crew-app/ios/RoyceTravelTemplate.xcodeproj/project.pbxproj`: simulator and
  device builds share the WeatherKit-enabled `com.eleihu6.roycetravel` App ID.
- `crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift`: real Air,
  Duo, and iPad layout, weather, Reset, and screenshot validation.
- `crew-app/src/version.ts`: mandatory Crew App code-change version increment.

The existing WeatherKit hook, native bridge, cache, coordinate table, and calendar
weather presentation remain the source of truth and are reused rather than forked.

## Design decisions

1. The new structure is selected by geometry (`wide && width > height`), not a
   device name. This covers all requested landscape devices while excluding every
   portrait viewport.
2. Weather is keyed by the first leg's arrival IATA code and airport-local arrival
   date. The inline forecast selects the available WeatherKit hour nearest the
   scheduled airport-local arrival hour. It does not use the roster base, departure
   airport, or the user's selected display-time mode.
3. Portrait does not request or render Home weather. This prevents data work and
   visual drift in the explicitly protected phone portrait experience.
4. Destination cards remain horizontally scrollable after the first four visible
   cards, preserving access to all existing destinations without adding a second
   vertical grid.
5. Landscape destination height is derived from the measured Explore row top,
   live viewport height, and the device's real navigation clearance. The Duo-wide
   geometry fallback recognizes its physical right rail even when iOS reports a zero
   right inset, so Home neither reserves a nonexistent bottom dock nor leaves a blank
   band below the cards.
6. Duo inner portrait measures the Explore top and Quick Actions height, then gives
   the three destination cards the remaining usable height above the side-rail/home-
   indicator boundary. Air portrait and iPad portrait card sizes remain unchanged.

## Risks and verification

- WeatherKit may be unavailable outside Apple's forecast range. Home leaves the
  inline slot empty rather than inventing weather or adding a separate failure row;
  Calendar retains its detailed retry state. Simulator builds use the same registered,
  WeatherKit-enabled App ID as device builds so Apple's JWT service can authenticate
  the native request instead of rejecting the React Native template bundle ID.
- The short Air landscape viewport can scroll vertically; the first dashboard
  strip remains dense and the bottom dock clearance remains intact.
- Focused Jest must prove Air/Duo/iPad landscape selection, unchanged portrait
  composition, arrival-airport/date WeatherKit input, and visible forecast output.
- Run Crew App TypeScript, root UI-standard check, and `git diff --check`.
- Validate the real UI in order on iPhone Air and the automation-only iPhone Duo,
  then iPad when available; capture and visually inspect versioned screenshots.
  The Air landscape run must show an actual WeatherKit temperature, and the Duo
  portrait run must prove the three-card row extends vertically without colliding
  with Quick Actions.
