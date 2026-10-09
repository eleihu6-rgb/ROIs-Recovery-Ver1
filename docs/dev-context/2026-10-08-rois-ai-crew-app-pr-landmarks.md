# 开发上下文（2026-10-08）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-10-08 14:48:33 +07
- Wing：`rois-ai`
- Topic：`crew-app-pr-landmarks`
- Title：PR destination landmarks and supplied SIN photo — native validation blocked
- Git branch：`main`

## 本轮对话上下文

User requested PR crew destination landmark coverage from ten screenshot IDs, then supplied a Merlion/Marina Bay Sands photo to replace SIN. Implemented catalog mappings SEA/DOH/DAD/RUH plus previously missing BKK (reuse Bangkok image). Downloaded public-domain/CC0 photos and recorded provenance in crew-app/scripts/data/cityPhotoSources.json. Seattle uses centered Caleb Ekeroth photo after native crop review. SIN exact user image JPEG encoded at original dimensions, no retouch/crop, hash regression added. Catalog total13.49MB below14MB; SIN886KB advisorywarning. Source version advanced163,164 then concurrentagents165166, ours167. Preserve all concurrent edits/no commits.
Destination screenshot revealed stale percentage SVG scrim bounds after rotation; changed SVG and Rect to numeric pane dimensions and size-key remount, regressiontest. Existing top header tint unchanged. Native helper conditionally taps static login heading to dismiss floating iPad keyboard if login button not hittable; scoped IPAD_SHOT_DIR. New testIPadPRDestinationLandmarks in existing DuoFitUITests covers465800SEA/540753DOH/563044DAD/532510RUH/452320SIN thenTG35459, portraitlandscape/tripdetails/accountisolation.
Read-only supporting agent audited ten PR Oct2026 accounts via existing portal protocol. Eight readable; 486541 HTTP200code0no token,493055 HTTP200code1no token; no roster requests for those two. Primary reviewed protocol/mappings and selectedphotos; coverage unit test caughtBKK missedinitialaudit. Do not treat two failures as emptyrosters. Details table in docs/test-cases/crew-app/2026-10-08-1435-pr-landmarks-Ver1.md.
Tests PASS62 focused city/destination/layout plus36 additional Duo/iPad tests=98. UIgatePASS0hard124warnings. TSfails existing unrelatedtesttypes. Firstnative163failed keyboard;164Ver2 reachedSEA/DOH/DAD and screenshots but otheragents started sameiPadsim tests/installations and interruptedrun. Stopped onlyownxcodebuildPID81906. Created dedicatedsim B184E6C6-CF48-4BDB-B0ED-5CEF2429354B (iPadPro11M5iOS26.5),cache/tmp/crew-landmarks-sim-167 clonedfromexisting; absolute stalepathwarnings. Firstboot stucklocationmigration,shutdownrequested. Final167 simulatorbuildFAILEDmissingjsi/jsi.h;devicebuildFAILEDmissingReact/RCTThirdPartyFabricComponentsProvider.h. SharedPods/generatedheaderschangedmidbuild by concurrentwork; inspectedmissingfiles, didNOTpodinstallorrepairwhileotherjobsactive. Logs/tmp/crew-landmarks-build-167.log,/tmp/crew-landmarks-device-167.log. No finalVer3UIrun or deviceinstall. Earlier164devicebuildsignedverifiedbut not deployedafterchanges.
Need coordinatedexclusivecrew-appnativebuildwindow(orfullyisolatedworkspacePods), restoregeneratedheadersnormally, freshcachebuild, fivecities+TGnativeUIandinspectversionedshots, thenverifycodesigninstallconnectedM5iPad. Do not claimdone/deployed. Source/report saved; see report exactcommandsandtestgaps.

## 当前工作树快照

### git status --short

```text
 M crew-app/.maestro/pr_392923_duty_swap.yaml
 M crew-app/.maestro/pr_392923_duty_swap_rbot.yaml
 M crew-app/.maestro/pr_392923_duty_swap_send_withdraw.yaml
 M crew-app/__tests__/features/citiesPR.test.ts
 M crew-app/__tests__/features/destinationView.test.tsx
 M crew-app/__tests__/features/duoLayout.test.ts
 M crew-app/__tests__/features/duoPageLayouts.test.tsx
 M crew-app/__tests__/features/dutySwap.test.ts
 M crew-app/__tests__/features/portalClient.test.ts
 M crew-app/__tests__/features/portalInjectedJs.test.ts
 M crew-app/__tests__/features/schedRosterViews.test.ts
 M crew-app/__tests__/features/scheduleRosterViews.test.tsx
 M crew-app/__tests__/features/tripDetailsOps.test.tsx
 M crew-app/ios/Podfile.lock
 M crew-app/ios/RoyceTravelTemplate.xcodeproj/project.pbxproj
 M crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/Contents.json
 M crew-app/ios/RoyceTravelTemplate/Info.plist
 M crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift
 M crew-app/ios/make_app_icon.py
 M crew-app/package.json
 M crew-app/scripts/data/extraAirports.txt
 M crew-app/scripts/genAirportCoords.mjs
 M crew-app/src/components/v2/GradientScreen.tsx
 M crew-app/src/components/v2/TicketCard.tsx
 M crew-app/src/components/v2/icons.tsx
 M crew-app/src/components/v2/useLayout.ts
 M crew-app/src/features/dutySwap/DutySwapScreen.tsx
 M crew-app/src/features/dutySwap/components/CrewMatrix.tsx
RM crew-app/src/features/dutySwap/components/SearchSheet.tsx -> crew-app/src/features/dutySwap/components/SearchForm.tsx
 M crew-app/src/features/dutySwap/components/SwapRbotPanel.tsx
 M crew-app/src/features/dutySwap/dutySwapApi.ts
 M crew-app/src/features/dutySwap/dutySwapModel.ts
 M crew-app/src/features/dutySwap/dutySwapSlice.ts
 M crew-app/src/features/dutySwap/swapRbot.ts
 M crew-app/src/features/home/cities.ts
 M crew-app/src/features/home/cityImages/singapore.jpg
 M crew-app/src/features/portal/portalClient.ts
 M crew-app/src/features/settings/airportCoords.ts
 M crew-app/src/features/travel/PortalCaptureScreen.tsx
 M crew-app/src/features/travel/portalCapture.ts
 M crew-app/src/features/travel/portalInjectedJs.ts
 M crew-app/src/features/v2/AbsenceScreen.tsx
 M crew-app/src/features/v2/CalendarView.tsx
 M crew-app/src/features/v2/DestinationScreen.tsx
 M crew-app/src/features/v2/HomeScreen.tsx
 M crew-app/src/features/v2/PageShell.tsx
 M crew-app/src/features/v2/ProfileScreen.tsx
 M crew-app/src/features/v2/RouteMapView.tsx
 M crew-app/src/features/v2/ScheduleScreen.tsx
 M crew-app/src/features/v2/TripDetailsScreen.tsx
 M crew-app/src/features/v2/V2Navigator.tsx
 M crew-app/src/features/v2/nav.ts
 M crew-app/src/features/v2/schedView.ts
 M crew-app/src/store/index.ts
 M crew-app/src/version.ts
 M docs/dev-context/LATEST.md
 M docs/modules/crew-app/duo-simulator-control.md
 M docs/superpowers/specs/2026-10-07-crew-app-duo-per-page-layouts-design.md
 M docs/superpowers/specs/2026-10-07-crew-app-duty-swap-concept-d-design.md
?? crew-app/.maestro/pr_392923_meal_trip_ops.yaml
?? crew-app/.maestro/pr_392923_swap_close_checkin.yaml
?? crew-app/.maestro/pr_473006_ipad.yaml
?? crew-app/.maestro/pr_487424_duty_swap_market.yaml
?? crew-app/__tests__/features/HomeCheckInQuickAction.test.tsx
?? crew-app/__tests__/features/HomeMealQuickAction.test.tsx
?? crew-app/__tests__/features/calendarMonthDetail.test.tsx
?? crew-app/__tests__/features/checkIn.test.tsx
?? crew-app/__tests__/features/dutySwapCabinCrew.test.tsx
?? crew-app/__tests__/features/dutySwapMarket.test.tsx
?? crew-app/__tests__/features/dutySwapSearchFirst.test.tsx
?? crew-app/__tests__/features/flightOpsDemo.test.tsx
?? crew-app/__tests__/features/ipadGradient.test.tsx
?? crew-app/__tests__/features/meal.test.tsx
?? crew-app/__tests__/features/prRouteMap.test.ts
?? crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/AppIcon-76@2x.png
?? crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/AppIcon-83.5@2x.png
?? crew-app/scripts/data/cityPhotoSources.json
?? crew-app/src/features/checkIn/
?? crew-app/src/features/dutySwap/market/
?? crew-app/src/features/home/cityImages/danang.jpg
?? crew-app/src/features/home/cityImages/doha.jpg
?? crew-app/src/features/home/cityImages/riyadh.jpg
?? crew-app/src/features/home/cityImages/seattle.jpg
?? crew-app/src/features/meal/
?? crew-app/src/features/v2/flightOpsDemo.ts
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-01_home_quick_actions.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-02_saved_dialog.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-03_saved_row.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-04_trip_ops_grid.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-05_tg_no_pr_meal.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-06_tg_trip_ops_grid.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-month-detail-grid-Ver1.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-returned-month-detail-Ver1.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-selected-day-Ver1.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-stacked-month-Ver1.png
?? docs/assets/screenshots/crew-app/duo-home-tall-aligned-Ver1.png
?? docs/assets/screenshots/crew-app/duo-home-wide-aligned-Ver1.png
?? docs/assets/screenshots/crew-app/duo-meal-L-Ver1.png
?? docs/assets/screenshots/crew-app/duo-meal-T-Ver1.png
?? docs/assets/screenshots/crew-app/duo-profile-L-Ver3.png
?? docs/assets/screenshots/crew-app/duo-profile-T-Ver2.png
?? docs/assets/screenshots/crew-app/duo-route-map-L-Ver3.png
?? docs/assets/screenshots/crew-app/duo-route-map-T-Ver2.png
?? docs/assets/screenshots/crew-app/duo-schedule-calendar-L-Ver1.png
?? docs/assets/screenshots/crew-app/duo-schedule-timeline-L-Ver3.png
?? docs/assets/screenshots/crew-app/duo-schedule-timeline-T-Ver2.png
?? docs/assets/screenshots/crew-app/duo-swap-market-T-Ver1.png
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
?? docs/assets/screenshots/crew-app/route-map-air-35459-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-air-465800-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-air-465800-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-air-473006-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-air-473006-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-air-487424-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-air-487424-Ver2.png
?? docs/assets/screenshots/crew-app/route-map-duo-35459-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-duo-35459-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-duo-465800-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-duo-473006-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-duo-473006-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-duo-487424-Ver1.png
?? docs/dev-context/2026-10-08-rois-ai-crew-app-ipad-support.md
?? docs/superpowers/specs/2026-10-08-crew-app-calendar-month-detail-design.md
?? docs/superpowers/specs/2026-10-08-crew-app-check-in-map-layout-design.md
?? docs/superpowers/specs/2026-10-08-crew-app-duty-swap-market-design.md
?? docs/superpowers/specs/2026-10-08-crew-app-ipad-support-design.md
?? docs/test-cases/crew-app/2026-10-08-1216-ipad-support-Ver1.md
?? docs/test-cases/crew-app/2026-10-08-1435-pr-landmarks-Ver1.md
?? docs/test-cases/crew-app/2026-10-08-pr-route-map-Ver1.md
```

### unstaged changed files

```text
crew-app/.maestro/pr_392923_duty_swap.yaml
crew-app/.maestro/pr_392923_duty_swap_rbot.yaml
crew-app/.maestro/pr_392923_duty_swap_send_withdraw.yaml
crew-app/__tests__/features/citiesPR.test.ts
crew-app/__tests__/features/destinationView.test.tsx
crew-app/__tests__/features/duoLayout.test.ts
crew-app/__tests__/features/duoPageLayouts.test.tsx
crew-app/__tests__/features/dutySwap.test.ts
crew-app/__tests__/features/portalClient.test.ts
crew-app/__tests__/features/portalInjectedJs.test.ts
crew-app/__tests__/features/schedRosterViews.test.ts
crew-app/__tests__/features/scheduleRosterViews.test.tsx
crew-app/__tests__/features/tripDetailsOps.test.tsx
crew-app/ios/Podfile.lock
crew-app/ios/RoyceTravelTemplate.xcodeproj/project.pbxproj
crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/Contents.json
crew-app/ios/RoyceTravelTemplate/Info.plist
crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift
crew-app/ios/make_app_icon.py
crew-app/package.json
crew-app/scripts/data/extraAirports.txt
crew-app/scripts/genAirportCoords.mjs
crew-app/src/components/v2/GradientScreen.tsx
crew-app/src/components/v2/TicketCard.tsx
crew-app/src/components/v2/icons.tsx
crew-app/src/components/v2/useLayout.ts
crew-app/src/features/dutySwap/DutySwapScreen.tsx
crew-app/src/features/dutySwap/components/CrewMatrix.tsx
crew-app/src/features/dutySwap/components/SearchForm.tsx
crew-app/src/features/dutySwap/components/SwapRbotPanel.tsx
crew-app/src/features/dutySwap/dutySwapApi.ts
crew-app/src/features/dutySwap/dutySwapModel.ts
crew-app/src/features/dutySwap/dutySwapSlice.ts
crew-app/src/features/dutySwap/swapRbot.ts
crew-app/src/features/home/cities.ts
crew-app/src/features/home/cityImages/singapore.jpg
crew-app/src/features/portal/portalClient.ts
crew-app/src/features/settings/airportCoords.ts
crew-app/src/features/travel/PortalCaptureScreen.tsx
crew-app/src/features/travel/portalCapture.ts
crew-app/src/features/travel/portalInjectedJs.ts
crew-app/src/features/v2/AbsenceScreen.tsx
crew-app/src/features/v2/CalendarView.tsx
crew-app/src/features/v2/DestinationScreen.tsx
crew-app/src/features/v2/HomeScreen.tsx
crew-app/src/features/v2/PageShell.tsx
crew-app/src/features/v2/ProfileScreen.tsx
crew-app/src/features/v2/RouteMapView.tsx
crew-app/src/features/v2/ScheduleScreen.tsx
crew-app/src/features/v2/TripDetailsScreen.tsx
crew-app/src/features/v2/V2Navigator.tsx
crew-app/src/features/v2/nav.ts
crew-app/src/features/v2/schedView.ts
crew-app/src/store/index.ts
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
2. 本文件：`docs/dev-context/2026-10-08-rois-ai-crew-app-pr-landmarks.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
