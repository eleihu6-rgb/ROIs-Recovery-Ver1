# 开发上下文（2026-10-09）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-10-09 00:49:57 +07
- Wing：`rois-ai`
- Topic：`crew-app-daylight-duo-navigation`
- Title：Crew app Daylight and Duo navigation
- Git branch：`main`

## 本轮对话上下文

This session implemented and reviewed a product-wide Daylight appearance audit, preserved dark appearance, and optimized Duo-specific layouts in crew-app. Daylight neutral surfaces and semantic colors were adjusted; Home now has a compact Trip details action and more destination cards, without the Rotation summary; Check-In MapKit light style now uses a muted light map; Duo inner landscape main navigation and page actions use the existing right safe-area rail; outer portrait Schedule view switching also uses its right rail; final same-day flight cards share a row in the wide timeline. APP_VERSION is 193. Four delegated supporting tasks were reviewed and integrated. No commit or push was made.
Verification: source tsc PASS; root npm run check:ui PASS with 124 pre-existing warnings; git diff --check PASS; focused Home, Check-In, navigation, Schedule/light Jest suites PASS. Full crew-app Jest remains FAIL in five pre-existing calendar-related suites (16 failed, 954 passed, 101 suites passed). Native Duo screenshots were inspected for Daylight and dark regression, including final v193 Home and Schedule. See docs/test-cases/crew-app/2026-10-09-daylight-duo-navigation-Ver1.md for precise evidence and limits. User Check-In request contained an empty item 2; only item 1 was implemented.

## 当前工作树快照

### git status --short

```text
 M crew-app/.maestro/pr_392923_duty_swap.yaml
 M crew-app/.maestro/pr_392923_duty_swap_rbot.yaml
 M crew-app/.maestro/pr_392923_duty_swap_send_withdraw.yaml
 M crew-app/CLAUDE.md
 M crew-app/__tests__/features/appDialogPolish.test.tsx
 M crew-app/__tests__/features/crewCarrierBranding.test.ts
 M crew-app/__tests__/features/destinationView.test.tsx
 M crew-app/__tests__/features/duoLayout.test.ts
 M crew-app/__tests__/features/duoPageLayouts.test.tsx
 M crew-app/__tests__/features/dutySwap.test.ts
 M crew-app/__tests__/features/portalClient.test.ts
 M crew-app/__tests__/features/portalInjectedJs.test.ts
 M crew-app/__tests__/features/routeMapStatsCard.test.tsx
 M crew-app/__tests__/features/schedRosterViews.test.ts
 M crew-app/__tests__/features/scheduleRosterViews.test.tsx
 M crew-app/__tests__/features/tripDetailsOps.test.tsx
 M crew-app/__tests__/themeCoverage.test.ts
 M crew-app/__tests__/themeSelector.test.tsx
 M crew-app/ios/Podfile.lock
 M crew-app/ios/RoyceTravelTemplate.xcodeproj/project.pbxproj
 M crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/Contents.json
 M crew-app/ios/RoyceTravelTemplate/Info.plist
 M crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift
 M crew-app/ios/make_app_icon.py
 M crew-app/package.json
 M crew-app/scripts/data/extraAirports.txt
 M crew-app/scripts/genAirportCoords.mjs
 M crew-app/src/components/v2/AppDialog.tsx
 M crew-app/src/components/v2/GradientScreen.tsx
 M crew-app/src/components/v2/PillDock.tsx
 M crew-app/src/components/v2/TicketCard.tsx
 M crew-app/src/components/v2/icons.tsx
 M crew-app/src/components/v2/useLayout.ts
 M crew-app/src/features/auth/LoginScreen.tsx
 M crew-app/src/features/dutySwap/DutySwapScreen.tsx
 M crew-app/src/features/dutySwap/components/CrewMatrix.tsx
RM crew-app/src/features/dutySwap/components/SearchSheet.tsx -> crew-app/src/features/dutySwap/components/SearchForm.tsx
 M crew-app/src/features/dutySwap/components/SwapRbotPanel.tsx
 M crew-app/src/features/dutySwap/dutySwapApi.ts
 M crew-app/src/features/dutySwap/dutySwapModel.ts
 M crew-app/src/features/dutySwap/dutySwapSlice.ts
 M crew-app/src/features/dutySwap/swapRbot.ts
 M crew-app/src/features/home/cities.ts
 M crew-app/src/features/portal/portalClient.ts
 M crew-app/src/features/rbot/RBotEntry.tsx
 M crew-app/src/features/settings/airportCoords.ts
 M crew-app/src/features/travel/PortalCaptureScreen.tsx
 M crew-app/src/features/travel/portalCapture.ts
 M crew-app/src/features/travel/portalInjectedJs.ts
 M crew-app/src/features/v2/AbsenceScreen.tsx
 M crew-app/src/features/v2/AppearanceScreen.tsx
 M crew-app/src/features/v2/CalendarView.tsx
 M crew-app/src/features/v2/DestinationScreen.tsx
 M crew-app/src/features/v2/HomeScreen.tsx
 M crew-app/src/features/v2/MeetingCard.tsx
 M crew-app/src/features/v2/PageShell.tsx
 M crew-app/src/features/v2/ProfileScreen.tsx
 M crew-app/src/features/v2/RouteMapView.tsx
 M crew-app/src/features/v2/ScheduleScreen.tsx
 M crew-app/src/features/v2/TripDetailsScreen.tsx
 M crew-app/src/features/v2/V2Navigator.tsx
 M crew-app/src/features/v2/nav.ts
 M crew-app/src/features/v2/schedView.ts
 M crew-app/src/store/index.ts
 M crew-app/src/theme/carrier.ts
 M crew-app/src/version.ts
 M docs/dev-context/LATEST.md
 M docs/modules/crew-app/duo-simulator-control.md
 M docs/superpowers/specs/2026-10-07-crew-app-duo-per-page-layouts-design.md
 M docs/superpowers/specs/2026-10-07-crew-app-duty-swap-concept-d-design.md
?? crew-app/.maestro/destination_qa_entry.js
?? crew-app/.maestro/glass_floating_panel.yaml
?? crew-app/.maestro/pr_392923_meal_trip_ops.yaml
?? crew-app/.maestro/pr_392923_swap_close_checkin.yaml
?? crew-app/.maestro/pr_473006_ipad.yaml
?? crew-app/.maestro/pr_487424_duty_swap_market.yaml
?? crew-app/.maestro/tg_destination_polish.yaml
?? crew-app/.maestro/tg_glass_surfaces.yaml
?? crew-app/__tests__/features/HomeCheckInQuickAction.test.tsx
?? crew-app/__tests__/features/HomeMealQuickAction.test.tsx
?? crew-app/__tests__/features/calendarMonthDetail.test.tsx
?? crew-app/__tests__/features/checkIn.test.tsx
?? crew-app/__tests__/features/duoNavRail.test.tsx
?? crew-app/__tests__/features/dutySwapCabinCrew.test.tsx
?? crew-app/__tests__/features/dutySwapMarket.test.tsx
?? crew-app/__tests__/features/dutySwapSearchFirst.test.tsx
?? crew-app/__tests__/features/flightOpsDemo.test.tsx
?? crew-app/__tests__/features/glassSurfaces.test.ts
?? crew-app/__tests__/features/ipadGradient.test.tsx
?? crew-app/__tests__/features/meal.test.tsx
?? crew-app/__tests__/features/portalCaptureCompletion.test.tsx
?? crew-app/__tests__/features/portalLoginAttempts.test.ts
?? crew-app/__tests__/features/portalLoginFailure.test.tsx
?? crew-app/__tests__/features/prRouteMap.test.ts
?? crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/AppIcon-76@2x.png
?? crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/AppIcon-83.5@2x.png
?? crew-app/src/features/checkIn/
?? crew-app/src/features/dutySwap/market/
?? crew-app/src/features/meal/
?? crew-app/src/features/v2/flightOpsDemo.ts
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-01_home_quick_actions.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-02_saved_dialog.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-03_saved_row.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-04_trip_ops_grid.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-05_tg_no_pr_meal.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-06_tg_trip_ops_grid.png
?? docs/assets/screenshots/crew-app/appearance-dark-audit-Ver1.png
?? docs/assets/screenshots/crew-app/appearance-daylight-Ver1.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-month-detail-grid-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-month-detail-grid-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-month-detail-grid-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-returned-month-detail-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-returned-month-detail-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-selected-day-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-selected-day-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-selected-day-hours-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-selected-day-hours-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-stacked-month-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-stacked-month-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-stacked-month-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-month-detail-grid-Ver1.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-month-detail-grid-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-returned-month-detail-Ver1.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-returned-month-detail-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-selected-day-Ver1.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-selected-day-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-selected-day-hours-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-stacked-month-Ver1.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-stacked-month-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-month-detail-grid-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-month-detail-grid-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-month-detail-grid-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-month-detail-grid-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-month-detail-grid-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-returned-month-detail-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-returned-month-detail-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-returned-month-detail-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-selected-day-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-selected-day-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-selected-day-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-selected-day-hours-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-selected-day-hours-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-selected-day-hours-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-stacked-month-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-stacked-month-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-stacked-month-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-stacked-month-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-stacked-month-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-540753-month-detail-grid-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-540753-returned-month-detail-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-540753-selected-day-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-540753-selected-day-hours-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-540753-stacked-month-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-month-detail-grid-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-month-detail-grid-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-month-detail-grid-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-month-detail-grid-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-month-detail-grid-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-month-detail-grid-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-returned-month-detail-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-returned-month-detail-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-returned-month-detail-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-returned-month-detail-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-returned-month-detail-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-returned-month-detail-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-hours-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-hours-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-hours-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-hours-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-hours-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-hours-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-stacked-month-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-stacked-month-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-stacked-month-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-stacked-month-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-stacked-month-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-stacked-month-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-month-detail-grid-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-month-detail-grid-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-returned-month-detail-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-returned-month-detail-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-selected-day-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-selected-day-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-selected-day-hours-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-selected-day-hours-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-stacked-month-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-stacked-month-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-month-detail-grid-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-month-detail-grid-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-month-detail-grid-Ver6.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-month-detail-grid-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-month-detail-grid-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-month-detail-grid-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-returned-month-detail-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-returned-month-detail-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-Ver6.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-hours-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-hours-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-hours-Ver6.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-hours-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-hours-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-hours-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver6.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-month-detail-grid-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-month-detail-grid-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-month-detail-grid-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-month-detail-grid-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-returned-month-detail-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-returned-month-detail-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-hours-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-hours-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-hours-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-hours-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-stacked-month-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-stacked-month-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-stacked-month-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-stacked-month-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-month-detail-grid-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-month-detail-grid-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-month-detail-grid-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-month-detail-grid-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-returned-month-detail-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-returned-month-detail-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-hours-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-hours-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-hours-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-hours-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-stacked-month-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-stacked-month-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-stacked-month-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-stacked-month-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-month-detail-grid-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-month-detail-grid-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-month-detail-grid-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-month-detail-grid-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-returned-month-detail-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-returned-month-detail-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-hours-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-hours-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-hours-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-hours-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-stacked-month-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-stacked-month-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-stacked-month-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-stacked-month-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-month-detail-grid-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-month-detail-grid-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-returned-month-detail-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-returned-month-detail-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-selected-day-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-selected-day-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-selected-day-hours-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-selected-day-hours-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-stacked-month-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-stacked-month-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-month-detail-grid-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-month-detail-grid-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-returned-month-detail-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-returned-month-detail-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-selected-day-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-selected-day-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-selected-day-hours-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-selected-day-hours-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-stacked-month-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-stacked-month-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-563044-month-detail-grid-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-563044-returned-month-detail-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-563044-selected-day-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-563044-selected-day-hours-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-563044-stacked-month-Ver5.png
?? docs/assets/screenshots/crew-app/checkin-dark-map-Ver1.png
?? docs/assets/screenshots/crew-app/checkin-daylight-map-Ver1.png
?? docs/assets/screenshots/crew-app/checkin-native-wide-Ver1.png
?? docs/assets/screenshots/crew-app/checkin-native-wide-Ver2.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-appearance-Ver1.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-home-Ver1.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-home-Ver2.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-preferences-Ver1.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-preferences-Ver2.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-profile-Ver1.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-profile-Ver2.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-profile-Ver3.png
?? docs/assets/screenshots/crew-app/destination-daylight-landscape-Ver1.png
?? docs/assets/screenshots/crew-app/destination-photo-blend-tall-Ver1.png
?? docs/assets/screenshots/crew-app/destination-photo-blend-wide-Ver1.png
?? docs/assets/screenshots/crew-app/destination-polish-tg-Ver1.png
?? docs/assets/screenshots/crew-app/dialog-daylight-audit-Ver1.png
?? docs/assets/screenshots/crew-app/duo-home-dark-final-Ver1.png
?? docs/assets/screenshots/crew-app/duo-home-tall-aligned-Ver1.png
?? docs/assets/screenshots/crew-app/duo-home-wide-aligned-Ver1.png
?? docs/assets/screenshots/crew-app/duo-meal-L-Ver1.png
?? docs/assets/screenshots/crew-app/duo-meal-T-Ver1.png
?? docs/assets/screenshots/crew-app/duo-nav-inner-portrait-Ver1.png
?? docs/assets/screenshots/crew-app/duo-nav-outer-portrait-Ver2.png
?? docs/assets/screenshots/crew-app/duo-nav-outer-portrait-Ver3.png
?? docs/assets/screenshots/crew-app/duo-nav-outer-portrait-Ver4.png
?? docs/assets/screenshots/crew-app/duo-nav-rail-landscape-Ver1.png
?? docs/assets/screenshots/crew-app/duo-nav-rail-profile-Ver1.png
?? docs/assets/screenshots/crew-app/duo-nav-rail-schedule-Ver1.png
?? docs/assets/screenshots/crew-app/duo-nav-rail-schedule-map-Ver1.png
?? docs/assets/screenshots/crew-app/duo-nav-trip-details-cover-Ver2.png
?? docs/assets/screenshots/crew-app/duo-profile-L-Ver3.png
?? docs/assets/screenshots/crew-app/duo-profile-T-Ver2.png
?? docs/assets/screenshots/crew-app/duo-route-map-L-Ver3.png
?? docs/assets/screenshots/crew-app/duo-route-map-T-Ver2.png
?? docs/assets/screenshots/crew-app/duo-schedule-calendar-L-Ver1.png
?? docs/assets/screenshots/crew-app/duo-schedule-dark-final-Ver1.png
?? docs/assets/screenshots/crew-app/duo-schedule-timeline-L-Ver3.png
?? docs/assets/screenshots/crew-app/duo-schedule-timeline-T-Ver2.png
?? docs/assets/screenshots/crew-app/duo-swap-market-T-Ver1.png
?? docs/assets/screenshots/crew-app/duo-test-version173-installed-Ver1.png
?? docs/assets/screenshots/crew-app/duo-trip-details-L-Ver3.png
?? docs/assets/screenshots/crew-app/duo-trip-details-T-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-compare-air-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-matrix_tall-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-matrix_wide-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-matrix_wide-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_local_tall-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_local_wide-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_local_wide-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_open_tall-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_open_wide-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_open_wide-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_server_tall-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_server_wide-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_server_wide-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-search_tall-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-search_wide-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-matrix-air-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-rbot-1-search-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-rbot-2-crews-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-rbot-3-picked-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-rbot-landscape-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-rbot-server-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-search-air-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-calendar-graphite-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-calendar-tg-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-duo-calendar-65pct-transparent-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-duo-login-65pct-transparent-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-duo-month-detail-65pct-transparent-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-duo-schedule-55pct-transparent-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-duo-schedule-60pct-transparent-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-duo-schedule-65pct-transparent-Ver2.png
?? docs/assets/screenshots/crew-app/glass-surfaces-home-graphite-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-home-tg-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-login-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-menu-graphite-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-menu-graphite-Ver2.png
?? docs/assets/screenshots/crew-app/glass-surfaces-menu-graphite-Ver3.png
?? docs/assets/screenshots/crew-app/global-daylight-landscape-Ver1.png
?? docs/assets/screenshots/crew-app/home-dark-audit-Ver1.png
?? docs/assets/screenshots/crew-app/home-daylight-ios-neutral-Ver1.png
?? docs/assets/screenshots/crew-app/home-daylight-landscape-Ver1.png
?? docs/assets/screenshots/crew-app/home-landscape-destination-grid-Ver1.png
?? docs/assets/screenshots/crew-app/home-landscape-destination-grid-Ver2.png
?? docs/assets/screenshots/crew-app/home-landscape-destination-grid-Ver3.png
?? docs/assets/screenshots/crew-app/home-landscape-destination-grid-Ver4.png
?? docs/assets/screenshots/crew-app/home-landscape-destination-grid-Ver5.png
?? docs/assets/screenshots/crew-app/home-portrait-destination-row-Ver1.png
?? docs/assets/screenshots/crew-app/ipad-landmark-DAD-landscape-Ver2.png
?? docs/assets/screenshots/crew-app/ipad-landmark-DAD-portrait-Ver2.png
?? docs/assets/screenshots/crew-app/ipad-landmark-DOH-landscape-Ver2.png
?? docs/assets/screenshots/crew-app/ipad-landmark-DOH-portrait-Ver2.png
?? docs/assets/screenshots/crew-app/ipad-landmark-SEA-landscape-Ver2.png
?? docs/assets/screenshots/crew-app/ipad-landmark-SEA-portrait-Ver2.png
?? docs/assets/screenshots/crew-app/ipad-pr-avatar-picker-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-avatar-picker-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-avatar-picker-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-avatar-picker-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-landscape-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-portrait-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-portrait-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-portrait-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-destination-portrait-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-destination-portrait-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-destination-portrait-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-destination-portrait-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-duty-swap-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-duty-swap-landscape-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-duty-swap-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-duty-swap-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-duty-swap-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-landscape-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-portrait-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-portrait-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-portrait-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-portrait-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-portrait-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-modal-upside-down-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-modal-upside-down-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-modal-upside-down-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-landscape-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-portrait-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-portrait-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-route-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-route-landscape-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-route-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-route-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-route-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-schedule-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-schedule-landscape-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-schedule-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-schedule-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-schedule-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-trip-details-portrait-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-trip-details-portrait-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-tg-home-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-tg-profile-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/iphone-air-release-170-checkin-Ver1.png
?? docs/assets/screenshots/crew-app/portal-452320-auto-import-home-Ver1.png
?? docs/assets/screenshots/crew-app/portal-452320-auto-import-home-Ver2.done
?? docs/assets/screenshots/crew-app/portal-452320-auto-import-home-Ver2.png
?? docs/assets/screenshots/crew-app/portal-452320-auto-import-profile-Ver2.done
?? docs/assets/screenshots/crew-app/portal-452320-auto-import-profile-Ver2.png
?? docs/assets/screenshots/crew-app/portal-452320-refresh-before-Ver1.png
?? docs/assets/screenshots/crew-app/portal-auth-486541-response-Ver1.json
?? docs/assets/screenshots/crew-app/portal-login-rejection-ipad-Ver1.png
?? docs/assets/screenshots/crew-app/profile-dark-audit-Ver1.png
?? docs/assets/screenshots/crew-app/profile-daylight-audit-Ver1.png
?? docs/assets/screenshots/crew-app/profile-daylight-landscape-Ver1.png
?? docs/assets/screenshots/crew-app/profile-daylight-landscape-Ver2.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver1.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver2.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver3.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver4.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver5.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver6.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver7.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver8.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver9.png
?? docs/assets/screenshots/crew-app/profile-preferences-dark-audit-Ver1.png
?? docs/assets/screenshots/crew-app/profile-preferences-daylight-audit-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-air-35459-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-air-465800-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-air-465800-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-air-473006-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-air-473006-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-air-487424-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-air-487424-Ver2.png
?? docs/assets/screenshots/crew-app/route-map-dark-audit-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-daylight-grey-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver2.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver4.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver5.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/route-map-daylight-portrait-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-daylight-portrait-Ver2.png
?? docs/assets/screenshots/crew-app/route-map-daylight-portrait-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-duo-35459-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-duo-35459-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-duo-465800-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-duo-473006-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-duo-473006-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-duo-487424-Ver1.png
?? docs/assets/screenshots/crew-app/schedule-dark-last-two-flights-row-Ver1.png
?? docs/assets/screenshots/crew-app/schedule-daylight-last-two-flights-row-Ver1.png
?? docs/assets/screenshots/crew-app/schedule-outer-daylight-calendar-rail-Ver1.png
?? docs/assets/screenshots/crew-app/schedule-outer-daylight-rail-Ver1.png
?? docs/assets/screenshots/crew-app/schedule-outer-daylight-rail-Ver2.png
?? docs/assets/screenshots/crew-app/trip-details-dark-audit-Ver1.png
?? docs/dev-context/2026-10-08-rois-ai-crew-app-daylight-route-map.md
?? docs/dev-context/2026-10-08-rois-ai-crew-app-ipad-support.md
?? docs/dev-context/2026-10-08-rois-ai-crew-app-pr-landmarks.md
?? docs/superpowers/specs/2026-10-08-crew-app-calendar-month-detail-design.md
?? docs/superpowers/specs/2026-10-08-crew-app-check-in-map-layout-design.md
?? docs/superpowers/specs/2026-10-08-crew-app-daylight-route-map-design.md
?? docs/superpowers/specs/2026-10-08-crew-app-duty-swap-market-design.md
?? docs/superpowers/specs/2026-10-08-crew-app-ipad-support-design.md
?? docs/test-cases/crew-app/2026-10-08-1216-ipad-support-Ver1.md
?? docs/test-cases/crew-app/2026-10-08-2116-portal-capture-refresh-Ver1.md
?? docs/test-cases/crew-app/2026-10-08-calendar-month-detail-Ver1.md
?? docs/test-cases/crew-app/2026-10-08-pr-route-map-Ver1.md
?? docs/test-cases/crew-app/2026-10-09-daylight-duo-navigation-Ver1.md
```

### unstaged changed files

```text
crew-app/.maestro/pr_392923_duty_swap.yaml
crew-app/.maestro/pr_392923_duty_swap_rbot.yaml
crew-app/.maestro/pr_392923_duty_swap_send_withdraw.yaml
crew-app/CLAUDE.md
crew-app/__tests__/features/appDialogPolish.test.tsx
crew-app/__tests__/features/crewCarrierBranding.test.ts
crew-app/__tests__/features/destinationView.test.tsx
crew-app/__tests__/features/duoLayout.test.ts
crew-app/__tests__/features/duoPageLayouts.test.tsx
crew-app/__tests__/features/dutySwap.test.ts
crew-app/__tests__/features/portalClient.test.ts
crew-app/__tests__/features/portalInjectedJs.test.ts
crew-app/__tests__/features/routeMapStatsCard.test.tsx
crew-app/__tests__/features/schedRosterViews.test.ts
crew-app/__tests__/features/scheduleRosterViews.test.tsx
crew-app/__tests__/features/tripDetailsOps.test.tsx
crew-app/__tests__/themeCoverage.test.ts
crew-app/__tests__/themeSelector.test.tsx
crew-app/ios/Podfile.lock
crew-app/ios/RoyceTravelTemplate.xcodeproj/project.pbxproj
crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/Contents.json
crew-app/ios/RoyceTravelTemplate/Info.plist
crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift
crew-app/ios/make_app_icon.py
crew-app/package.json
crew-app/scripts/data/extraAirports.txt
crew-app/scripts/genAirportCoords.mjs
crew-app/src/components/v2/AppDialog.tsx
crew-app/src/components/v2/GradientScreen.tsx
crew-app/src/components/v2/PillDock.tsx
crew-app/src/components/v2/TicketCard.tsx
crew-app/src/components/v2/icons.tsx
crew-app/src/components/v2/useLayout.ts
crew-app/src/features/auth/LoginScreen.tsx
crew-app/src/features/dutySwap/DutySwapScreen.tsx
crew-app/src/features/dutySwap/components/CrewMatrix.tsx
crew-app/src/features/dutySwap/components/SearchForm.tsx
crew-app/src/features/dutySwap/components/SwapRbotPanel.tsx
crew-app/src/features/dutySwap/dutySwapApi.ts
crew-app/src/features/dutySwap/dutySwapModel.ts
crew-app/src/features/dutySwap/dutySwapSlice.ts
crew-app/src/features/dutySwap/swapRbot.ts
crew-app/src/features/home/cities.ts
crew-app/src/features/portal/portalClient.ts
crew-app/src/features/rbot/RBotEntry.tsx
crew-app/src/features/settings/airportCoords.ts
crew-app/src/features/travel/PortalCaptureScreen.tsx
crew-app/src/features/travel/portalCapture.ts
crew-app/src/features/travel/portalInjectedJs.ts
crew-app/src/features/v2/AbsenceScreen.tsx
crew-app/src/features/v2/AppearanceScreen.tsx
crew-app/src/features/v2/CalendarView.tsx
crew-app/src/features/v2/DestinationScreen.tsx
crew-app/src/features/v2/HomeScreen.tsx
crew-app/src/features/v2/MeetingCard.tsx
crew-app/src/features/v2/PageShell.tsx
crew-app/src/features/v2/ProfileScreen.tsx
crew-app/src/features/v2/RouteMapView.tsx
crew-app/src/features/v2/ScheduleScreen.tsx
crew-app/src/features/v2/TripDetailsScreen.tsx
crew-app/src/features/v2/V2Navigator.tsx
crew-app/src/features/v2/nav.ts
crew-app/src/features/v2/schedView.ts
crew-app/src/store/index.ts
crew-app/src/theme/carrier.ts
crew-app/src/version.ts
docs/dev-context/LATEST.md
docs/modules/crew-app/duo-simulator-control.md
docs/superpowers/specs/2026-10-07-crew-app-duo-per-page-layouts-design.md
docs/superpowers/specs/2026-10-07-crew-app-duty-swap-concept-d-design.md
```

### staged files

```text
crew-app/src/features/dutySwap/components/SearchForm.tsx
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-10-09-rois-ai-crew-app-daylight-duo-navigation.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
