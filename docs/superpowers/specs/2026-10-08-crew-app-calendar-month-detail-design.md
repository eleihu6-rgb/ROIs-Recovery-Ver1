# Schedule calendar: stacked and month detail

Requested: retain the compact calendar with simple duty indicators and a separate agenda; add an iOS-inspired monthly detail view, with full day details on date selection; fit iPhone Air, iPad and both Duo inner orientations.

Implementation uses the existing MonthModel, agendaRows and DayHours. Calendar owns a presentation-only Stacked / Month detail switch; existing calendar-detail navigation remains the hourly day view. Returning from a day preserves the chosen month presentation. Month detail shows up to three event previews per date plus an explicit overflow count. All items remain available in the selected day's agenda. Blank dates stay blank rather than becoming implied days off. Flight previews use current timezone-formatted leg times.

All devices and orientations: Month detail uses the full available screen width, with no selected-day pane beside it (Ryan’s updated requirement). The month scrolls vertically to preserve readable duty previews. Tapping a date replaces the grid with its full-day agenda; Back restores the monthly view. An Hourly timeline button switches to the existing hours view without duplicating events. The original Stacked presentation retains its wide-screen month/agenda layout. Weekdays and every week use explicit seven-cell flex rows; percentage wrapping is prohibited because native pixel rounding dropped Saturday to the next row in the first simulator capture. Compact dates retain deselect-to-month behavior. Reuse carrier palette and shared typography; no new dependency or roster data writes.

Scope: CalendarView presentation, focused Jest coverage, native UI automation, app version. Preserve concurrent ScheduleScreen and layout work. Risks: narrow cells, busy dates, six-week months, long meeting titles, selection after month/account changes. Validate month/day switching, full overflow contents, blank days, and the actual native app for multiple PR crews plus TG. Native simulator evidence is required; Playwright cannot directly operate React Native UIKit, so report the root Playwright gate as unavailable unless an existing bridge is found.

Brainstorming skill was not available in the session catalog or searched local skill paths; this design records the requested choices before implementation.

## Login rejection discovered during device validation

PR 486541 returned HTTP 200/code 0 with no token and `ERROR_WRONG_PASSWORD`. Ryan requested skipping that crew, preserving the response, and preventing endless login attempts. The submitted crew ID was exact in the diagnostic request; the known automation suffix bug is guarded by an additional identity assertion after keyboard dismissal.

Native portal login owns authentication for the ROIS WebView. Its injected script must not also submit the form or perform direct authentication, and must not recover a previous crew's storage token while waiting. A 30-second request deadline and explicit rejection both terminate the attempt. The failure screen unmounts the WebView, shows the requested crew ID and an actionable message, and returns to login on user action. Safe diagnostics retain HTTP status, business code and failure code, never credentials or tokens. Non-native fallback form submission is bounded to once per page. Existing authenticated API token refresh is unchanged.

Verification: executable injected-script polling tests, native-client wrong-password/deadline tests, rendered failure/recovery tests, and a single synthetic invalid-account native UI test. Do not retry 486541. Resume valid PR and TG calendar validation serially on iPad.

## 452320 refresh-loop correction (v174)

The native token authenticates direct roster API requests but is not a portal SPA login session. Therefore native capture must not navigate to the SPA roster page: the portal redirects to login, repeatedly recreating the capture script. Keep native capture on one document. Automatic import must be scheduled by roster responses, never postponed by unrelated page traffic; count unique roster URLs rather than repeated responses. Preserve the existing 4-second partial-roster fallback and 600ms completion window, with one-shot completion. Verify executable script navigation, capture timing amid unrelated JSON traffic, and real PR452320→TG on the same Duo, with manual Use roster disabled in the test.
