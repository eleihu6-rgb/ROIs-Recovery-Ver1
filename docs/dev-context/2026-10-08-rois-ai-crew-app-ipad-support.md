# 开发上下文（2026-10-08）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-10-08 12:26:14 +07
- Wing：`rois-ai`
- Topic：`crew-app-ipad-support`
- Title：Crew app iPad Pro M5 support and compact Profile
- Git branch：`main`

## 本轮对话上下文

Implemented and installed crew-app version 162 on the connected iPad Pro 11-inch M5. Physical launch remains blocked by iPadOS security/profile trust; user must unlock and trust Developer App in Settings > General > VPN & Device Management. Do not claim launched. Local codesign verification passes; provisioning contains the iPad and matching application identifier, expires Oct 15 2026 04:48:48 UTC.
Preserved substantial pre-existing/concurrent Duo and duty-swap changes; no commits or pushes. Completed pending native universal family, four iPad orientations/icons and modal upside-down support. Profile only when both axes >=700: avatar64 (Air/Duo80 unchanged), compact horizontal identity, natural settings rows, max page1040 and picker520. Schedule wide toolbar gets safe-area top outside Duo strip. Gradient SVG AND Rect need explicit live numeric dimensions; changing just SVG did not fix rotation seam. Destination header must render after InfoBlock as well as raised zIndex; zIndex alone did not fix native taps.
57 focused Jest tests pass, UI style check passes with124 existing warnings, diff/plist checks pass. TypeScript remains failing only in unrelated test declarations/mocks. Native final test-without-building PASSED: /tmp/crew-ipad-ui-162-v10.xcresult, PR473006 full walkthrough then TG35459 clean Profile identity. Visually inspected screenshots under docs/assets/screenshots/crew-app/ipad-*-Ver10.png, plus Ver8 runtime-identical detailed screens. XCUIScreen.main required for rotation captures; app.screenshot crops stale bounds. Ver9 hit transient captured-roster helper double-tap race; same162 rerun passed. Meal action is shared, NOT PR-only; do not use its absence as account isolation test.
Device artifact /tmp/crew-ipad-device-155/Build/Products/Release-iphoneos/RoyceTravelTemplate.app is version162 (cache directory name155 historical). Incremental Xcode skipped outer signature after JS bundle update; re-signed with existing Apple Development identity preserving entitlements/requirements, codesign --verify --deep --strict passed. devicectl install succeeded, launch denied trust/security. Connected CoreDevice ID9BF95E4A-D933-5F5A-B261-93454C5CFEC0; hardware00008142-000668392198401C. Simulator7E7EB9CC-3407-4103-9959-E159E143B68A. Do not disturb Air/Duo sims or other agents.
Details and exact commands: docs/test-cases/crew-app/2026-10-08-1216-ipad-support-Ver1.md. Design docs/superpowers/specs/2026-10-08-crew-app-ipad-support-design.md. No native Split View/Stage Manager/mini/13-inch or new Air/Duo UI pass; width and geometry unit coverage only. Next action is user trust/unlock and launch verification, not another rebuild unless source changes.

## 当前工作树快照

### git status --short

```text
 M crew-app/.maestro/pr_392923_duty_swap.yaml
 M crew-app/.maestro/pr_392923_duty_swap_rbot.yaml
 M crew-app/.maestro/pr_392923_duty_swap_send_withdraw.yaml
 M crew-app/__tests__/features/destinationView.test.tsx
 M crew-app/__tests__/features/duoLayout.test.ts
 M crew-app/__tests__/features/duoPageLayouts.test.tsx
 M crew-app/__tests__/features/dutySwap.test.ts
 M crew-app/__tests__/features/portalClient.test.ts
 M crew-app/__tests__/features/portalInjectedJs.test.ts
 M crew-app/__tests__/features/schedRosterViews.test.ts
 M crew-app/__tests__/features/tripDetailsOps.test.tsx
 M crew-app/ios/RoyceTravelTemplate.xcodeproj/project.pbxproj
 M crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/Contents.json
 M crew-app/ios/RoyceTravelTemplate/Info.plist
 M crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift
 M crew-app/ios/make_app_icon.py
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
 M crew-app/src/features/portal/portalClient.ts
 M crew-app/src/features/settings/airportCoords.ts
 M crew-app/src/features/travel/PortalCaptureScreen.tsx
 M crew-app/src/features/travel/portalCapture.ts
 M crew-app/src/features/travel/portalInjectedJs.ts
 M crew-app/src/features/v2/AbsenceScreen.tsx
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
 M docs/modules/crew-app/duo-simulator-control.md
 M docs/superpowers/specs/2026-10-07-crew-app-duo-per-page-layouts-design.md
 M docs/superpowers/specs/2026-10-07-crew-app-duty-swap-concept-d-design.md
?? crew-app/.maestro/pr_392923_meal_trip_ops.yaml
?? crew-app/.maestro/pr_392923_swap_close_checkin.yaml
?? crew-app/.maestro/pr_473006_ipad.yaml
?? crew-app/.maestro/pr_487424_duty_swap_market.yaml
?? crew-app/__tests__/features/HomeCheckInQuickAction.test.tsx
?? crew-app/__tests__/features/HomeMealQuickAction.test.tsx
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
?? docs/assets/screenshots/crew-app/route-map-duo-35459-Ver1.done
?? docs/assets/screenshots/crew-app/route-map-duo-35459-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-duo-465800-Ver1.done
?? docs/assets/screenshots/crew-app/route-map-duo-465800-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-duo-473006-Ver1.done
?? docs/assets/screenshots/crew-app/route-map-duo-473006-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-duo-487424-Ver1.done
?? docs/assets/screenshots/crew-app/route-map-duo-487424-Ver1.png
?? docs/superpowers/specs/2026-10-08-crew-app-duty-swap-market-design.md
?? docs/superpowers/specs/2026-10-08-crew-app-ipad-support-design.md
?? docs/test-cases/crew-app/2026-10-08-1216-ipad-support-Ver1.md
?? docs/test-cases/crew-app/2026-10-08-pr-route-map-Ver1.md
```

### unstaged changed files

```text
crew-app/.maestro/pr_392923_duty_swap.yaml
crew-app/.maestro/pr_392923_duty_swap_rbot.yaml
crew-app/.maestro/pr_392923_duty_swap_send_withdraw.yaml
crew-app/__tests__/features/destinationView.test.tsx
crew-app/__tests__/features/duoLayout.test.ts
crew-app/__tests__/features/duoPageLayouts.test.tsx
crew-app/__tests__/features/dutySwap.test.ts
crew-app/__tests__/features/portalClient.test.ts
crew-app/__tests__/features/portalInjectedJs.test.ts
crew-app/__tests__/features/schedRosterViews.test.ts
crew-app/__tests__/features/tripDetailsOps.test.tsx
crew-app/ios/RoyceTravelTemplate.xcodeproj/project.pbxproj
crew-app/ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/Contents.json
crew-app/ios/RoyceTravelTemplate/Info.plist
crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift
crew-app/ios/make_app_icon.py
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
crew-app/src/features/portal/portalClient.ts
crew-app/src/features/settings/airportCoords.ts
crew-app/src/features/travel/PortalCaptureScreen.tsx
crew-app/src/features/travel/portalCapture.ts
crew-app/src/features/travel/portalInjectedJs.ts
crew-app/src/features/v2/AbsenceScreen.tsx
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
2. 本文件：`docs/dev-context/2026-10-08-rois-ai-crew-app-ipad-support.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
