# 开发上下文（2026-09-12）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-12 12:44:49 PDT
- Wing：`rois-ai`
- Topic：`crew-app-timing-report-time`
- Title：Crew app timing — check-in must be the duty report time (EK + ET)
- Git branch：`main`

## 本轮对话上下文

Ryan 2026-09-12: "timing analyse and fix: check in should not be identical to flight time, also
check ready, leave time. pass by full validation on both EK and ET crew." (screenshot IMG_7927:
crew K1003 Home card showed Ready 22:00L / Check-in 02:00L on EK414 DXB–SYD.)

ROOT CAUSE (data model, not the app)
- /api/mobile-roster/session read the duty boundary from `pairing_segment.duty_sch_str_dt_utc`
  (min over the pairing) and `duty_sch_end_dt_utc` (max).
- `duty_sch_str_dt_utc` is NOT uniformly the report time: the airline import (source='F8',
  27,604/27,605 duties) stores the REPORT time there, but the gantt build service
  (`pairing-build-service.ts` → `writePairingContents`, source='MANUAL', 4,338/4,338 duties)
  stores the duty's FIRST SCHEDULED DEPARTURE. Every EK/ET pairing the crew app serves is
  source='MANUAL', so the crew app printed check-in == the flight's departure time
  (K1003 152375 EK414: checkInUtc = dep = 2026-09-10T22:00Z = 02:00L DXB).
- The real anchors were already on the same rows: `brief_start_utc`/`pickup_start_utc`
  (dep − brief; 120 min on the current builder, 60 min on pre-2026-09-09 rows) and
  `debrief_end_utc`/`dropoff_end_utc` (last arrival + 15 min) — the same anchors the Gantt
  canvas draws the duty box from (`gantt/src/utils/duty-node-utils.ts`).

FIX (live-server only, no crew-app source change, no API contract change)
- `live-server/src/services/mobile-roster/mobile-roster-service.ts`: new helpers
  `dutyReportExpr` = coalesce(brief_start_utc, pickup_start_utc, duty_sch_str_dt_utc) and
  `dutyReleaseExpr` = coalesce(debrief_end_utc, dropoff_end_utc, duty_sch_end_dt_utc); used for
  the segment columns AND the pairing_boundaries min/max. Falls back to the old flight-time
  column only when a row has no brief/debrief (1,429 older MANUAL duties).
- Ready / Leave home needed no change: they are the app's Wake Up (dep − 4h) / Leave Home
  (dep − 3h) alarms; with check-in at dep − 2h the four anchors now form a real countdown.

DELIBERATELY NOT CHANGED
- `pairing-build-service.ts` still writes duty_sch_str/end = first dep / last arr. Aligning it
  to the F8 convention would shift duty-period arithmetic (manday DP credit, rule 8056 pairing
  bounds, pairing-search duty-on-time) for new builds — a business change outside this ask.
  Report as follow-up: either fix the builder or backfill MANUAL duty_sch_* from brief/debrief.
- `/roster/pairings/by-crew` has the same duty_sch_str-as-report read but no caller today.

EVIDENCE (2026-09-12, iPhone Air / iOS 26.5 sim 50EBA799, Metro :8081, live-server :3000 dev)
- API: EK K1003 5/5 pairings and ET J4002 15/15 pairings now answer checkInUtc != departureUtc
  (report lead 60–120 min).
- crew-app jest: 69 suites / 655 tests PASS; `npx tsc --noEmit` clean.
- live-server: mobile-roster service + route 17 tests PASS. `npx tsc --noEmit` still fails on the
  PRE-EXISTING unrelated `src/services/rule/legality-preview.ts:288` dimension-union error.
- Real UI (Maestro, screenshots in docs/assets/screenshots/crew-app/crew-app-timing-checkin-Ver1-*):
  EK K1003 Home "Ready 22:00L / Check-in 00:00L" (dep 02:00L); Trip Details EK763 19 Sep
  Wake Up 04:15L / Leave home 05:15L / Check-in 06:15L / STD 08:15L DXB.
  ET J4002 Home "Ready 17:55L / Check-in 19:55L" (ADD dep 21:55L); Trip Details ET805 15 Sep
  Wake Up 04:10L / Leave home 05:10L / Check-in 06:10L / STD 08:10L ADD.
- Regression flows re-run green: crew-app/.maestro/ek_login.yaml (EK) and
  crew-app/.maestro/et_crew_duty_sim.yaml -e CREW_ID=J4002 (ET).
- New flow: crew-app/.maestro/crew_timing_card.yaml (parameterised AIRLINE/CREW_ID/DUTY/SHOT).

## 当前工作树快照

### git status --short

```text
 M crew-app/__tests__/features/v2Model.test.ts
 M docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md
 D e2e/node_modules
 D gantt/node_modules
 M gantt/src/components/dev/dev-skills-data.generated.ts
 D live-server/node_modules
 M live-server/src/services/mobile-roster/__tests__/mobile-roster-service.test.ts
 M live-server/src/services/mobile-roster/mobile-roster-service.ts
 M live-server/src/services/roster/auto-assign-service.ts
 M live-server/tests/unit/auto-assign-service.test.ts
 D node_modules
 D packages/ui/node_modules
 D rule-engine-rs/target
?? crew-app/.maestro/crew_timing_card.yaml
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
?? crew-app/k1003_00_login.png
?? crew-app/k1003_01_home.png
?? crew-app/k1003_02_rbot_local_answer.png
?? crew-app/k1003_03_rbot_route_map.png
?? crew-app/k1003_04_sched_timeline.png
?? crew-app/k1003_05_calendar.png
?? crew-app/k1003_06_route_map.png
?? crew-app/k1003_07_profile.png
?? crew-app/maestro_et_home.png
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
?? docs/assets/screenshots/crew-app/crew-app-timing-checkin-Ver1-ek-00_login.png
?? docs/assets/screenshots/crew-app/crew-app-timing-checkin-Ver1-ek-01_home.png
?? docs/assets/screenshots/crew-app/crew-app-timing-checkin-Ver1-ek-02_schedule_duty.png
?? docs/assets/screenshots/crew-app/crew-app-timing-checkin-Ver1-ek-03_trip_details.png
?? docs/assets/screenshots/crew-app/crew-app-timing-checkin-Ver1-et-00_login.png
?? docs/assets/screenshots/crew-app/crew-app-timing-checkin-Ver1-et-01_home.png
?? docs/assets/screenshots/crew-app/crew-app-timing-checkin-Ver1-et-02_schedule_duty.png
?? docs/assets/screenshots/crew-app/crew-app-timing-checkin-Ver1-et-03_trip_details.png
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
?? docs/assets/screenshots/crew-recovery/s1-help-narrow-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-help-narrow-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-help-published-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-help-published-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-absence-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-absence-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-verified-stand-down-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-stand-down-absence-Ver1.png
?? docs/assets/screenshots/gantt/cr-public-login-20260912-Ver1.png
?? docs/assets/screenshots/gantt/res-pairing-dxb-sep2026-Ver1.png
?? docs/assets/screenshots/gantt/startup-gantt-20260912-Ver2.png
?? docs/assets/screenshots/gantt/startup-gantt-20260912-Ver3.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver1.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver2.png
?? docs/assets/screenshots/gantt/startup-login-20260912-Ver3.png
?? docs/dev-context/2026-09-12-gantt-crew-recovery-case-001.md
?? docs/superpowers/specs/2026-09-12-auto-assign-duties-design.md
?? docs/superpowers/specs/2026-09-12-auto-assign-duties-mock.html
?? docs/test-cases/crew-recovery/2026-09-12-S1-case-001-execution-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-S1-crew-unavailable-preparation-Ver1.md
?? e2e/config/recovery-case-study.config.ts
?? e2e/docs/
?? e2e/tests/gantt/auto-assign-duties.spec.ts
?? e2e/tests/gantt/recovery-case-001.spec.ts
?? e2e/tests/gantt/res-pairing-dxb-sep2026-seed.spec.ts
?? e2e/tests/gantt/res-pairing-dxb-sep2026-verify.spec.ts
?? gantt/public/help/screenshots/s1-absence-dates-Ver1.jpg
?? gantt/public/help/screenshots/s1-absence-record-Ver1.png
?? gantt/public/help/screenshots/s1-add-filter-Ver1.png
?? gantt/public/help/screenshots/s1-crew-alerts-Ver1.jpg
?? gantt/public/help/screenshots/s1-mobile-error-Ver1.jpg
?? gantt/public/help/screenshots/s1-option1-Ver1.png
?? gantt/public/help/screenshots/s1-option2-Ver1.png
?? gantt/public/help/screenshots/s1-option3-Ver1.png
?? gantt/public/help/screenshots/s1-stand-down-Ver1.png
?? gantt/src/components/help/topics/recovery/recovery-case-001.tsx
?? gantt/src/services/__tests__/gantt-sync-manager-fallback.test.ts
?? packages/legality-messages/pnpm-lock.yaml
?? sim_01_login.png
```

### unstaged changed files

```text
crew-app/__tests__/features/v2Model.test.ts
docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md
e2e/node_modules
gantt/node_modules
gantt/src/components/dev/dev-skills-data.generated.ts
live-server/node_modules
live-server/src/services/mobile-roster/__tests__/mobile-roster-service.test.ts
live-server/src/services/mobile-roster/mobile-roster-service.ts
live-server/src/services/roster/auto-assign-service.ts
live-server/tests/unit/auto-assign-service.test.ts
node_modules
packages/ui/node_modules
rule-engine-rs/target
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-12-rois-ai-crew-app-timing-report-time.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
