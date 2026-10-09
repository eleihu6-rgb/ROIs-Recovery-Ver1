# Crew app: Daylight theme and route summary in map

## Product decision

Appearance offers **Daylight** as a saved, explicit choice alongside the four existing colour themes. It changes the shared screen gradient, ink, glass surfaces, controls, dock and status bar immediately. The existing airline default remains the reset choice. Photos keep white labels and their dark scrim for legibility.

Daylight uses the iOS grouped colour hierarchy: neutral near-white ground, white grouped cards, charcoal primary text, grey secondary text and separators, and blue only for interactive emphasis. Its cards remain 55% opaque (45% transparent). The blue button shade is darker than the typical system tint so white button labels retain small-text contrast.

The Route map keeps a dark chart surface in every theme. Its month summary sits over the bottom of the map, with white values and labels. Portrait uses one row of seven figures; landscape uses the existing two tier grid. Route cards remain below the map in portrait and beside it in landscape. Zoom controls and selected airport badges sit above the summary.

## Data and edge cases

The summary and route lines continue to derive from the same month model. A guest demo has no crew base, so this map alone uses the first flight departure as its starting airport and labels it `START`; other screens do not assign the guest a base. When there are no coordinates or flights, the existing empty state remains.

## Verification

Check theme selection and persistence, all seven map figures within the map, portrait and landscape on the Duo simulator, photo label contrast, source TypeScript, focused Jest tests and the repository UI style gate. Full TypeScript currently includes unrelated preexisting test file errors; verify production source separately and report the full gate result.
