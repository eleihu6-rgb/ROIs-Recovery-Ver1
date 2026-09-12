# 开发上下文（2026-09-12）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-12 15:04:32 PDT
- Wing：`rois-ai`
- Topic：`crew-app-flight-calendar-restore`
- Title：Crew App — 恢复并加固「航司班表同步到 iOS 日历」（含 Preferences 总开关 B）
- Git branch：`main`

## 本轮对话上下文

## 需求（Ryan 2026-09-12）
第一轮："crew app ver 1, there was a sync airlines sch to ios calendar, bring it back"
第二轮："B, then merge to main and push" —— 选方案 B：在 Profile ▸ Preferences ▸ Sync 加
"iOS Calendar sync" 总开关（对应 mock Ver8/9 一直有、但没实现的那个开关），per-duty 图标保留为细粒度控制。

## 结论：v1 功能在 v2 重设计里只是丢了入口
- v1（USE_V2=false）My Trips 每张航班卡右上角日历图标：一次点击把**整个 duty** 写进 iOS 日历
  （Wake Up/Get Ready、Leave Home、Check-in 三个 15 分钟标记 + 每段航班一个时间块），
  再点删除刚写的那几条（flightCalendarSlice 持久化 eventIds）。
- v2 ScheduleScreen 换掉了旧页面、图标没了，但 slice / buildDutyCalendarEvents / 原生
  CalendarModule.saveEvents|removeEvents 都还在并仍随启动 hydrate。
- 本轮做法：在 v2 恢复入口而不是回到旧页面。两个入口共用 `useDutyCalendar()`：
  1) Schedule ▸ Timeline 航班卡（仅 duty 首段 + 今天/未来）右上的 `cal` → `calcheck`；
  2) Trip Details 一条带文字的 NavRow（Add to iPhone Calendar / In your iPhone Calendar）。

## 方案 B：Preferences 总开关
- flightCalendarSlice 新增 state：syncAll / syncing / hydrated；thunk：setCalendarSyncAll(on|off)、
  topUpCalendarSync()。
  - on → 把**未来 60 天内**且尚未被记录的所有 upcoming duty 一次写入（幂等：已 track 的跳过，
    所以手动加过的 duty 不会被写第二遍），持久化 ids + 开关标志。
  - off → 删除 app 写过的全部条目并清空 map。
  - hydrated 只在 loadFlightCalendar() 读完 map + 开关后才置 true —— 防止启动 top-up 在
    map 还空的时候跑一遍，把整个日历重复写一遍。
- App.tsx：hydrated 之后 + trips 每次变化（新 roster 捕获）跑一次 topUpCalendarSync()，静默执行，
  只有用户拨开关时才弹 alert。
- 文案抽到纯函数 describeCalendarSync()，可单测。

## 必须一起修的正确性问题：日历回环（第一轮做的）
CalendarModule.getEvents（会议读取）与原生 MeetingBackgroundSync 都扫描**所有**日历并当成
Outlook/Exchange 会议；我们写进去的航班条目会被读回来变成会议卡 + 会议卡闹钟。修法：app 写的每条
事件带 `EKEvent.url = royce://flight/<dutyId>`，两处读取都跳过该 scheme。
- 写侧：buildDutyCalendarEvents draft 增加 url（FLIGHT_EVENT_URL_PREFIX + isFlightCalendarEvent）。
- 读侧：fetchMeetings filter 掉 royce://；MeetingBackgroundSync.armMeetingAlarms 同样跳过。
- 原生：CalendarModule.saveEvents 设置 ev.url。

## 改动文件
源代码
- crew-app/src/features/calendar/{flightCalendar.ts, flightCalendarSlice.ts, dutyCalendarMessages.ts(新)}
- crew-app/src/features/meetings/calendarModule.ts
- crew-app/src/features/travel/MyTripsScreen.tsx（改用共享告警文案）
- crew-app/src/features/v2/{useV2.ts(useDutyCalendar), ScheduleScreen.tsx, TripDetailsScreen.tsx, PreferencesScreen.tsx(开关)}
- crew-app/src/App.tsx（启动/roster 变化自动 top-up）
- crew-app/src/version.ts（APP_VERSION 119 → 122；注意期间另一个并行 session 把 119 改成了 121）
- crew-app/ios/RoyceTravelTemplate/{CalendarModule.swift, MeetingBackgroundSync.swift}
测试（6 个新文件 + 5 个已有测试的 store 补 flightCalendar reducer）
- 新：dutyCalendarMessages / scheduleFlightCalendar / tripDetailsCalendar / meetingCalendarFilter /
  calendarSync / preferencesCalendarSync
- 改：rbotNavigation、scheduleRosterViews、tripDetailsOps、helpVersionDisplay、themeSelector
Maestro / 文档
- .maestro/{v2_tg_flight_calendar, v2_et_flight_calendar, v2_tg_calendar_sync}.yaml
- docs/superpowers/specs/2026-09-12-crew-app-flight-calendar-restore.md
- docs/assets/screenshots/crew-app/v2-{tg,et}-flight-calendar-Ver1-*.png、v2-tg-calendar-sync-Ver1-*.png

## 验证
- npx tsc --noEmit PASS；npx jest PASS（76 suites / 698 tests）。
- iPhone Air / iOS 26.5，含 Swift 改动的重建 + 授权 calendar：
  - TG 35459：v2_tg_flight_calendar PASS（图标 → "Added to Calendar · 5 entries" → 打勾 →
    Trip Details "In your iPhone Calendar" → 删除）。
  - ET J4002（API adapter）：v2_et_flight_calendar PASS（第二航司，图标加/删）。
  - TG 总开关：v2_tg_calendar_sync PASS。三段证据：
    (1) 开 → alert "15 entries ... across 3 duties"，DB 里 royce:// 行正好 20（15 新增 + 5 个旧孤儿）；
    (2) 不清状态重启并重新登录 → 静默 top-up，DB 仍 20（没有重复写）；
    (3) 关 → alert "15 entries removed"，DB 回到 5。
- ESLint：crew-app 无 eslint 配置（历史遗留），未运行。
- 截图是用 macOS Vision OCR + Maestro 可见性断言看的（本 session 不能直接显示图片）。

## 坑 / 不要重复推翻的结论
- Schedule 图标只在 **duty 首段** 且 day.key >= todayKey 时出现。
- Maestro 断言是**整串正则匹配**；iOS 会把 Pressable 的子文本合并成一个 accessibility 元素，
  所以要写 "In your iPhone Calendar.*" 这种带 .* 的写法。
- 登录页默认航司 = ET（DEFAULT_AIRLINE='ET'，guest-login 那次改动），v2_tg_login.yaml 直接点
  login-btn 已过时；TG 流程必须先 airline-dropdown → airline-TG 才有 prefill。
- ET 登录在模拟器会弹 "session snapshot was not persisted" 的 LogBox 遮挡层，需要 tap Dismiss。
- 模拟器日历里残留 5 条 royce://flight/151585（第一次 ET 跑到一半失败 + clearState 冲掉 id map 的
  孤儿事件）。产品逻辑只删自己记录过的 id；属模拟器脏数据，erase 模拟器即可清。

## 当前工作树快照

### git status --short

```text
 M .agents/skills/144-auto-assign-base-crew/SKILL.md
 M .agents/skills/145-crew-recovery-case-study/SKILL.md
A  crew-app/.maestro/v2_et_flight_calendar.yaml
A  crew-app/.maestro/v2_tg_calendar_sync.yaml
A  crew-app/.maestro/v2_tg_flight_calendar.yaml
 M crew-app/__tests__/features/AbsenceScreen.test.tsx
 M crew-app/__tests__/features/absenceApi.test.ts
A  crew-app/__tests__/features/calendarSync.test.ts
A  crew-app/__tests__/features/dutyCalendarMessages.test.ts
M  crew-app/__tests__/features/helpVersionDisplay.test.tsx
A  crew-app/__tests__/features/meetingCalendarFilter.test.ts
A  crew-app/__tests__/features/preferencesCalendarSync.test.tsx
M  crew-app/__tests__/features/rbotNavigation.test.tsx
A  crew-app/__tests__/features/scheduleFlightCalendar.test.tsx
M  crew-app/__tests__/features/scheduleRosterViews.test.tsx
A  crew-app/__tests__/features/tripDetailsCalendar.test.tsx
M  crew-app/__tests__/features/tripDetailsOps.test.tsx
M  crew-app/__tests__/themeSelector.test.tsx
M  crew-app/ios/RoyceTravelTemplate/CalendarModule.swift
M  crew-app/ios/RoyceTravelTemplate/MeetingBackgroundSync.swift
M  crew-app/src/App.tsx
 M crew-app/src/features/absence/absenceApi.ts
A  crew-app/src/features/calendar/dutyCalendarMessages.ts
M  crew-app/src/features/calendar/flightCalendar.ts
M  crew-app/src/features/calendar/flightCalendarSlice.ts
M  crew-app/src/features/meetings/calendarModule.ts
M  crew-app/src/features/travel/MyTripsScreen.tsx
 M crew-app/src/features/v2/AbsenceScreen.tsx
M  crew-app/src/features/v2/PreferencesScreen.tsx
M  crew-app/src/features/v2/ScheduleScreen.tsx
M  crew-app/src/features/v2/TripDetailsScreen.tsx
M  crew-app/src/features/v2/useV2.ts
M  crew-app/src/version.ts
A  docs/assets/screenshots/crew-app/v2-et-flight-calendar-Ver1-01_schedule-icon.png
A  docs/assets/screenshots/crew-app/v2-et-flight-calendar-Ver1-02_added-to-calendar-alert.png
A  docs/assets/screenshots/crew-app/v2-et-flight-calendar-Ver1-03_icon-ticked.png
A  docs/assets/screenshots/crew-app/v2-et-flight-calendar-Ver1-04_removed.png
A  docs/assets/screenshots/crew-app/v2-tg-calendar-sync-Ver1-01_preferences-sync-off.png
A  docs/assets/screenshots/crew-app/v2-tg-calendar-sync-Ver1-02_sync-on-15-entries.png
A  docs/assets/screenshots/crew-app/v2-tg-calendar-sync-Ver1-03_switch-on.png
A  docs/assets/screenshots/crew-app/v2-tg-calendar-sync-Ver1-04_sync-off-15-removed.png
A  docs/assets/screenshots/crew-app/v2-tg-calendar-sync-Ver1-05_switch-off.png
A  docs/assets/screenshots/crew-app/v2-tg-flight-calendar-Ver1-01_schedule-icon.png
A  docs/assets/screenshots/crew-app/v2-tg-flight-calendar-Ver1-02_added-to-calendar-alert.png
A  docs/assets/screenshots/crew-app/v2-tg-flight-calendar-Ver1-03_icon-ticked.png
A  docs/assets/screenshots/crew-app/v2-tg-flight-calendar-Ver1-04_trip-details-in-calendar.png
A  docs/assets/screenshots/crew-app/v2-tg-flight-calendar-Ver1-05_trip-details-removed.png
 M docs/assets/screenshots/gantt/auto-assign-7305-max-consec-j4006-Ver2.png
A  docs/dev-context/2026-09-12-rois-ai-crew-app-flight-calendar-restore.md
M  docs/dev-context/LATEST.md
 M docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md
AM docs/superpowers/specs/2026-09-12-crew-app-flight-calendar-restore.md
 D e2e/node_modules
 M e2e/tests/gantt/auto-assign-7305-max-consec-j4006.spec.ts
 M e2e/tests/gantt/auto-assign-even-distribution-j4002.spec.ts
 M e2e/tests/gantt/auto-assign-even-distribution-j4007.spec.ts
 M e2e/tests/gantt/auto-assign-open-pairings-j4001.spec.ts
 M e2e/tests/gantt/help/help-recovery.spec.ts
 M e2e/tests/gantt/rbot-auto-assign-crew.spec.ts
 D gantt/node_modules
 M gantt/src/components/dev/dev-skills-data.generated.ts
 M gantt/src/components/help/help-data.ts
 M gantt/src/components/help/topics/recovery/recovery-102.tsx
 M gantt/src/components/help/topics/recovery/recovery-103.tsx
 M gantt/src/components/help/topics/recovery/recovery-costs.tsx
 M gantt/src/components/recovery/recovery-cost-breakdown-dialog.tsx
 M gantt/src/components/recovery/recovery-violation-dialog.tsx
 M gantt/src/components/roster/auto-assign-dialog.tsx
 M gantt/src/services/auto-assign-api.ts
 M gantt/src/services/recovery-api.ts
 M gantt/src/services/recovery-candidates.ts
 M gantt/src/stores/roster-store.ts
 M gantt/src/utils/assign-pairing-op.ts
 M gantt/src/utils/auto-assign-driver.ts
 D live-server/node_modules
 M live-server/src/routes/crew-notify/crew-notify.ts
 M live-server/src/routes/recovery/recovery-cost.ts
 M live-server/src/services/absence/__tests__/crew-absence-service.test.ts
 M live-server/src/services/absence/crew-absence-service.ts
 M live-server/src/services/roster/auto-assign-service.ts
 M live-server/tests/unit/auto-assign-service.test.ts
 D node_modules
 D packages/ui/node_modules
 D rule-engine-rs/target
?? crew-app/absence-02-from-plus-one.png
?? crew-app/absence-03-range-two-days.png
?? crew-app/ek_login_00_default.png
?? crew-app/ek_login_01_home.png
?? crew-app/ek_login_02_schedule.png
?? crew-app/ek_login_03_schedule_ek763.png
?? crew-app/ek_login_04_calendar.png
?? crew-app/ek_login_05_route_map.png
?? crew-app/etsched_00_timeline.png
?? crew-app/etsched_01_menu.png
?? crew-app/etsched_02_calendar.png
?? crew-app/guest_00_login.png
?? crew-app/guest_01_home.png
?? crew-app/guest_02_profile.png
?? crew-app/guest_03_personal.png
?? crew-app/guest_04_relaunch.png
?? crew-app/k1003_00_login.png
?? crew-app/k1003_01_home.png
?? crew-app/k1003_02_rbot_local_answer.png
?? crew-app/k1003_03_rbot_route_map.png
?? crew-app/k1003_04_sched_timeline.png
?? crew-app/k1003_05_calendar.png
?? crew-app/k1003_06_route_map.png
?? crew-app/k1003_07_profile.png
?? crew-app/maestro_et_home.png
?? crew-app/prsched_00_calendar.png
?? crew-app/prsched_01_route_map.png
?? crew-app/prsched_02_back_to_timeline.png
?? crew-app/rbot-Ver1-00_dock-entry.png
?? crew-app/rbot-Ver1-01_open.png
?? crew-app/rbot-Ver1-02_action-applied.png
?? crew-app/rbot-Ver1-03_route-map.png
?? crew-app/rbot-Ver1-04_absence-prefill.png
?? crew-app/rbot-Ver1-05_composer-above-keyboard.png
?? crew-app/rbot-et-Ver1-00_home-dock.png
?? crew-app/rbot-et-Ver1-01_open.png
?? crew-app/rbot-et-Ver1-02_roster-calendar.png
?? crew-app/rbot2-Ver1-00_dock.png
?? crew-app/rbot2-Ver1-01_local-answer.png
?? crew-app/rbot2-Ver1-02_navigated-away.png
?? crew-app/rbot2-Ver1-03_dock-dot.png
?? crew-app/rbot2-Ver1-04_thread-survived.png
?? crew-app/rbot2-Ver1-05_step3-absence.png
?? crew-app/sched_01_next_month_oct.png
?? crew-app/sched_02_prev_month_aug.png
?? crew-app/sched_03_demo_meetings_added.png
?? crew-app/sched_04_meeting_card_on_flight_day.png
?? crew-app/sim_01_login.png
?? crew-app/sim_02_home.png
?? crew-app/sim_03_sched_open.png
?? crew-app/sim_04_sched_day09.png
?? crew-app/sim_05_sched_fwd1.png
?? crew-app/sim_06_sched_fwd3.png
?? crew-app/tgdest_00_home.png
?? crew-app/tgdest_01_home_destination_strip.png
?? crew-app/tgdest_02_city.png
?? crew-app/tgdest_03_next_city.png
?? crew-app/tgdest_04_back_to_first.png
?? crew-app/tgdest_05_hotel_transfer.png
?? crew-app/tgdest_06_trip_details.png
?? docs/ai/2026-09-12-0606-iphone-crew-app-login-build-provenance-audit-Ver1.md
?? docs/ai/2026-09-12-0608-project-startup-validation-Ver1.md
?? docs/assets/screenshots/crew-app/iphone-air-login-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-01-crew-home-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-01-crew-home-Ver3.png
?? docs/assets/screenshots/crew-recovery/s1-02-absence-dates-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-02-absence-dates-Ver3.png
?? docs/assets/screenshots/crew-recovery/s1-03-submit-ready-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-03-submit-ready-Ver3.png
?? docs/assets/screenshots/crew-recovery/s1-03-submit-ready-Ver4.png
?? docs/assets/screenshots/crew-recovery/s1-04-add-filter-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-05-baseline-roster-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-05-baseline-roster-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-05-no-absence-before-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-06-mobile-error-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-07-absence-record-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-08-stand-down-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-08-stand-down-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-08-stand-down-Ver3.png
?? docs/assets/screenshots/crew-recovery/s1-08-stand-down-Ver4.png
?? docs/assets/screenshots/crew-recovery/s1-09-option1-roster-menu-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-10-option2-pairing-menu-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-10-option2-pairing-menu-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-11-option2-alert-center-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-12-option3-ill-menu-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-13-crew-alerts-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4011-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4011-cost-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4011-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4011-preview-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4012-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4012-cost-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4012-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4012-preview-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4013-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4013-cost-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4013-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-J4013-preview-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-gh-option1-applied-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-standby-list-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-gh-standby-list-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-gh-standby-list-Ver3.png
?? docs/assets/screenshots/crew-recovery/s1-gh-standby-list-Ver4.png
?? docs/assets/screenshots/crew-recovery/s1-gh-standby-list-Ver5.png
?? docs/assets/screenshots/crew-recovery/s1-headed-delay-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-delay-selection-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-final-standby-choice-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-restored-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-standby-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-standby-reloaded-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-standby-saved-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-start-alert-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-swap-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-swap-selection-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-headed-swap-selection-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-headed-swap-selection-Ver3.png
?? docs/assets/screenshots/crew-recovery/s1-help-narrow-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-help-narrow-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-help-published-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-help-published-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-option1-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-option1-selectable-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-option2-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-option2-selectable-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-options-before-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-options-ready-baseline-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-standby-verified-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-standby-verified-selectable-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-duty-verified-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-duty-verified-selectable-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4005-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4005-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4005-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4014-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4014-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4014-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4015-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4015-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4015-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4016-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4016-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4016-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4017-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4017-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4017-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4018-cost-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4018-draft-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-J4018-preview-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-list-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-list-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-list-Ver3.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-list-Ver4.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-restored-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-swap-gh-six-selectable-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-absence-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-absence-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-verified-stand-down-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-stand-down-absence-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-analyse-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-applied-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-configure-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-13crew-analyse-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-13crew-applied-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-13crew-configure-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-analyse-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-applied-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-configure-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-six-crew-Ver1.png
?? docs/assets/screenshots/gantt/cr-public-login-20260912-Ver1.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-applied-Ver5.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week1-Ver4.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week2-Ver4.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week3-Ver4.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week4-Ver4.png
?? docs/assets/screenshots/gantt/res-pairing-dxb-sep2026-Ver1.png
?? docs/assets/screenshots/gantt/startup-gantt-20260912-Ver2.png
?? docs/assets/screenshots/gantt/startup-gantt-20260912-Ver3.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver1.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver2.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver3.png
?? docs/dev-context/2026-09-12-gantt-crew-recovery-case-001.md
?? docs/dev-context/2026-09-12-gantt-recovery-s1-options-ready.md
?? docs/handoff/crew-app/2026-09-12-crew-app-social-login-provisioning-handoff.md
?? docs/superpowers/specs/2026-09-12-auto-assign-duties-design.md
?? docs/superpowers/specs/2026-09-12-auto-assign-duties-mock.html
?? docs/superpowers/specs/2026-09-12-crew-sl-retain-duty-help-Ver1.md
?? docs/superpowers/specs/2026-09-12-recovery-standby-gh-demo-Ver1.md
?? docs/superpowers/specs/2026-09-12-recovery-swap-gh-demo-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-1415-S1-headed-walkthrough-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-1445-S1-swap-gh-six-candidates-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-S1-1001-options-setup-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-S1-case-001-execution-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-S1-crew-unavailable-preparation-Ver1.md
?? e2e/config/recovery-case-study.config.ts
?? e2e/docs/
?? e2e/scripts/recovery-s1-gh-readonly.cjs
?? e2e/scripts/recovery-s1-options-readonly.cjs
?? e2e/scripts/recovery-s1-swap-gh.cjs
?? e2e/tests/gantt/auto-assign-duties-show-crew.spec.ts
?? e2e/tests/gantt/auto-assign-duties.spec.ts
?? e2e/tests/gantt/recovery-case-001.spec.ts
?? e2e/tests/gantt/res-pairing-dxb-sep2026-seed.spec.ts
?? e2e/tests/gantt/res-pairing-dxb-sep2026-verify.spec.ts
?? gantt/public/help/screenshots/s1-absence-dates-Ver1.jpg
?? gantt/public/help/screenshots/s1-absence-record-Ver1.png
?? gantt/public/help/screenshots/s1-add-filter-Ver1.png
?? gantt/public/help/screenshots/s1-crew-alerts-Ver1.jpg
?? gantt/public/help/screenshots/s1-delay-comparison-Ver1.png
?? gantt/public/help/screenshots/s1-gh-standby-list-Ver1.png
?? gantt/public/help/screenshots/s1-mobile-error-Ver1.jpg
?? gantt/public/help/screenshots/s1-option1-Ver1.png
?? gantt/public/help/screenshots/s1-option2-Ver1.png
?? gantt/public/help/screenshots/s1-option3-Ver1.png
?? gantt/public/help/screenshots/s1-stand-down-Ver1.png
?? gantt/public/help/screenshots/s1-swap-gh-list-Ver1.png
?? gantt/src/components/help/topics/recovery/recovery-case-001.tsx
?? gantt/src/services/__tests__/gantt-sync-manager-fallback.test.ts
?? gantt/src/services/__tests__/recovery-standby-gh.test.ts
?? gantt/src/services/__tests__/recovery-swap-gh.test.ts
?? live-server/src/services/recovery/standby-gh-cost.test.ts
?? live-server/src/services/recovery/standby-gh-cost.ts
?? live-server/src/services/recovery/swap-gh-cost.test.ts
?? live-server/src/services/recovery/swap-gh-cost.ts
?? packages/legality-messages/pnpm-lock.yaml
?? sim_01_login.png
```

### unstaged changed files

```text
.agents/skills/144-auto-assign-base-crew/SKILL.md
.agents/skills/145-crew-recovery-case-study/SKILL.md
crew-app/__tests__/features/AbsenceScreen.test.tsx
crew-app/__tests__/features/absenceApi.test.ts
crew-app/src/features/absence/absenceApi.ts
crew-app/src/features/v2/AbsenceScreen.tsx
docs/assets/screenshots/gantt/auto-assign-7305-max-consec-j4006-Ver2.png
docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md
docs/superpowers/specs/2026-09-12-crew-app-flight-calendar-restore.md
e2e/node_modules
e2e/tests/gantt/auto-assign-7305-max-consec-j4006.spec.ts
e2e/tests/gantt/auto-assign-even-distribution-j4002.spec.ts
e2e/tests/gantt/auto-assign-even-distribution-j4007.spec.ts
e2e/tests/gantt/auto-assign-open-pairings-j4001.spec.ts
e2e/tests/gantt/help/help-recovery.spec.ts
e2e/tests/gantt/rbot-auto-assign-crew.spec.ts
gantt/node_modules
gantt/src/components/dev/dev-skills-data.generated.ts
gantt/src/components/help/help-data.ts
gantt/src/components/help/topics/recovery/recovery-102.tsx
gantt/src/components/help/topics/recovery/recovery-103.tsx
gantt/src/components/help/topics/recovery/recovery-costs.tsx
gantt/src/components/recovery/recovery-cost-breakdown-dialog.tsx
gantt/src/components/recovery/recovery-violation-dialog.tsx
gantt/src/components/roster/auto-assign-dialog.tsx
gantt/src/services/auto-assign-api.ts
gantt/src/services/recovery-api.ts
gantt/src/services/recovery-candidates.ts
gantt/src/stores/roster-store.ts
gantt/src/utils/assign-pairing-op.ts
gantt/src/utils/auto-assign-driver.ts
live-server/node_modules
live-server/src/routes/crew-notify/crew-notify.ts
live-server/src/routes/recovery/recovery-cost.ts
live-server/src/services/absence/__tests__/crew-absence-service.test.ts
live-server/src/services/absence/crew-absence-service.ts
live-server/src/services/roster/auto-assign-service.ts
live-server/tests/unit/auto-assign-service.test.ts
node_modules
packages/ui/node_modules
rule-engine-rs/target
```

### staged files

```text
crew-app/.maestro/v2_et_flight_calendar.yaml
crew-app/.maestro/v2_tg_calendar_sync.yaml
crew-app/.maestro/v2_tg_flight_calendar.yaml
crew-app/__tests__/features/calendarSync.test.ts
crew-app/__tests__/features/dutyCalendarMessages.test.ts
crew-app/__tests__/features/helpVersionDisplay.test.tsx
crew-app/__tests__/features/meetingCalendarFilter.test.ts
crew-app/__tests__/features/preferencesCalendarSync.test.tsx
crew-app/__tests__/features/rbotNavigation.test.tsx
crew-app/__tests__/features/scheduleFlightCalendar.test.tsx
crew-app/__tests__/features/scheduleRosterViews.test.tsx
crew-app/__tests__/features/tripDetailsCalendar.test.tsx
crew-app/__tests__/features/tripDetailsOps.test.tsx
crew-app/__tests__/themeSelector.test.tsx
crew-app/ios/RoyceTravelTemplate/CalendarModule.swift
crew-app/ios/RoyceTravelTemplate/MeetingBackgroundSync.swift
crew-app/src/App.tsx
crew-app/src/features/calendar/dutyCalendarMessages.ts
crew-app/src/features/calendar/flightCalendar.ts
crew-app/src/features/calendar/flightCalendarSlice.ts
crew-app/src/features/meetings/calendarModule.ts
crew-app/src/features/travel/MyTripsScreen.tsx
crew-app/src/features/v2/PreferencesScreen.tsx
crew-app/src/features/v2/ScheduleScreen.tsx
crew-app/src/features/v2/TripDetailsScreen.tsx
crew-app/src/features/v2/useV2.ts
crew-app/src/version.ts
docs/assets/screenshots/crew-app/v2-et-flight-calendar-Ver1-01_schedule-icon.png
docs/assets/screenshots/crew-app/v2-et-flight-calendar-Ver1-02_added-to-calendar-alert.png
docs/assets/screenshots/crew-app/v2-et-flight-calendar-Ver1-03_icon-ticked.png
docs/assets/screenshots/crew-app/v2-et-flight-calendar-Ver1-04_removed.png
docs/assets/screenshots/crew-app/v2-tg-calendar-sync-Ver1-01_preferences-sync-off.png
docs/assets/screenshots/crew-app/v2-tg-calendar-sync-Ver1-02_sync-on-15-entries.png
docs/assets/screenshots/crew-app/v2-tg-calendar-sync-Ver1-03_switch-on.png
docs/assets/screenshots/crew-app/v2-tg-calendar-sync-Ver1-04_sync-off-15-removed.png
docs/assets/screenshots/crew-app/v2-tg-calendar-sync-Ver1-05_switch-off.png
docs/assets/screenshots/crew-app/v2-tg-flight-calendar-Ver1-01_schedule-icon.png
docs/assets/screenshots/crew-app/v2-tg-flight-calendar-Ver1-02_added-to-calendar-alert.png
docs/assets/screenshots/crew-app/v2-tg-flight-calendar-Ver1-03_icon-ticked.png
docs/assets/screenshots/crew-app/v2-tg-flight-calendar-Ver1-04_trip-details-in-calendar.png
docs/assets/screenshots/crew-app/v2-tg-flight-calendar-Ver1-05_trip-details-removed.png
docs/dev-context/2026-09-12-rois-ai-crew-app-flight-calendar-restore.md
docs/dev-context/LATEST.md
docs/superpowers/specs/2026-09-12-crew-app-flight-calendar-restore.md
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-12-rois-ai-crew-app-flight-calendar-restore.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
