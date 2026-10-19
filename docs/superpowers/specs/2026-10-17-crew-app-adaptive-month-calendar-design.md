# Crew App adaptive month calendar

## Goal

Give the Schedule calendar more room and make the month useful at first glance on both portrait and landscape displays.

## Behavior

- Calendar opens in **Month detail**, with duty title/route and time previews inside each date. Leading and trailing cells show dim dates from the adjacent months so every visible week is complete.
- The former full-width Stacked / Month detail segmented row becomes one compact layout control beside the calendar instruction.
- The calendar follows three progressive levels: rich full month, compressed full month with event lines and a selected-day agenda, then one selected week with a larger agenda.
- Compact event lines are five points thick, inset from cell edges, and use tonal shades from the active carrier palette. Flights receive the strongest shade while other duty categories use secondary theme shades and neutral ink.
- Swiping up advances one level and swiping down reverses one level. Pinching outward increases calendar row height to reveal more duty previews; pinching inward reduces it. The compact control cycles the layout levels as an accessible alternative. When a date still has hidden duties, its overflow label ends in an ellipsis.
- Tapping a current-month date selects it. The agenda is filtered to that date in the two collapsed levels; tapping a selected date keeps the selection stable.
- The clock action opens the separate hourly/day-detail view for the selected date.
- Wider portrait cells allow preview titles to wrap to two lines so route information survives instead of truncating after the flight number.

## Scope and risks

The change is local to `CalendarView`; it does not change roster data, month navigation, timezone handling, or the Timeline and Route views. Gesture recognition is the main regression risk, so swipe level switching, pinch density changes, reverse transitions, date selection, adjacent-month numbering, and portrait/landscape rendering require focused Jest and simulator coverage.

## Verification

- Jest: default mode, all three levels, compact toggle, pinch in/out, adjacent-month dates, crowded-date overflow, and date-to-agenda/detail behavior across phone, Duo, and iPad dimensions.
- TypeScript compile.
- Real iOS UI validation in the required iPhone Air, iPhone Duo, and iPad order for TG and PR, with portrait and landscape screenshots saved under `docs/assets/screenshots/crew-app/`.
