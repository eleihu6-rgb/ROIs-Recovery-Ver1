# 开发上下文（2026-09-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-11 06:12:05 PDT
- Wing：`gantt`
- Topic：`rbot-auto-assign`
- Title：R'Bot → Auto-assign open pairings (T2004/T2005 September)
- Git branch：`feat/gantt/roundtrip-pairing-builder`

## 本轮对话上下文

Ryan 2026-09-11: continue R'Bot abilities with auto-assign open pairings, PW test with crew T2004 /
T2005 (787-family crew), build 787 pairings if needed, snapshot both rosters for September and
expect a full month roster.

PART A - routing (option A, DONE):
- ~/.cloudflared/config.yml had cr.rois.one /altair/.* -> localhost:5173, which has NO listener;
  traffic only worked because the running tunnel connector predates that rule and falls through to
  the :5567 fallback. Changed that rule to http://localhost:5567 (backup: config.yml.bak-20260911-rbot).
- The tunnel was NOT restarted (port memo forbids restarting the rois-one tunnel casually; it also
  fronts ai/hz/pbs/swap/rois.one). Ryan restarts it when convenient; current behaviour is unchanged
  until then.
- Verified cr.rois.one ALREADY serves this worktree's latest code (vite dev server :5567, byte-
  identical modules) and that PW runs against it:
  GANTT_BASE_URL=https://cr.rois.one GANTT_API_URL=https://cr.rois.one ... rbot-pairing-build.spec.ts
  -> 2 passed. Correction to my earlier claim that it served older code.
- flair.rois.cloud/altair is 502 right now for the same reason (its tunnel has no 5173 fallback).

PART B - the feature (DONE):
- ai-server: new `auto_assign_pairings` tool (crewIds required; start/end or month+year), with
  auto_assign_params()/auto_assign_missing_message() and a tool_call_to_action branch; system prompt
  gains the trigger phrases and the "ask for the missing crew/period, never invent crew ids" rule.
- gantt: AiAction {type:'auto_assign_pairings', crewIds, start, end} -> dispatch-ai-action.ts moves
  the Gantt range onto the month (the dialog plans from the VIEWPORT month) and calls
  useUiStore.openAutoAssignDialog(crewIds, 'roster-main'); 'auto_assign_pairings' added to
  RELOAD_ACTIONS. Nothing is committed by R'Bot - the planner applies and Saves.

PART C - data prep (the "build 787 pairing if needed" step):
- T2004/T2005 = ADD base, CA, division P, crew_fleet.fleet_specific = 'B787'. The SSIM reload flies
  the 788/789 VARIANTS and there were ZERO B787 flights/pairings, so the planner had nothing to
  assign. DO NOT re-run the retired synthetic et-add-b787-737 fixture.
- Seeded a B787 schedule for ADD 2026-09-01..30 (skill 142 script + new fixture
  .agents/skills/142-flight-schedule-seed-generator/fixtures/add-b787-demo-sep2026.json;
  routes ADD<->IAD/LHR/PVG long-haul + ADD<->NBO/EBB/DAR short turns; 335 flight rows total).
  Cleared redis dev:fleet:list + dev:flight:* after.
- New reusable script live-server/scripts/seed-add-b787-pairing-ladder.mjs: drives the SAME public
  roundtrip search/build API to build a NON-OVERLAPPING ladder tiled ONE rotation per 7-day week
  bucket (that tiling matters: the auto-assign planner balances week buckets, so a ladder with two
  candidates in one bucket gets one skipped as an overlap and leaves a day empty). Built 40 B787
  pairings for Sep (#152244+). Crew quals were left as originally seeded (B787 only).
- Also built 8 788/789 pairings earlier (#152222-#152229) before switching approach - they are
  open/valid SSIM pairings; delete them if you want the demo limited to the B787 world.

PART D - verification:
- ai-server: `./.venv/bin/python -m pytest tests/test_chat_tools.py tests/test_chat_route.py` -> 81 passed.
  Full suite has 7 PRE-EXISTING failures in tests/test_regression_routes.py (verified identical with my
  changes stashed).
- gantt: `npx tsc --noEmit` clean; dispatch vitest 33 passed; `npm run check:ui` PASS (0 hard violations).
- Real LLM smoke (ai-server restarted on :3005, pid 6170):
  "auto assign open pairings to T2004 and T2005 for September 2026" -> action auto_assign_pairings
  {T2004,T2005,2026-09-01..30}; "fill the September roster for T2004 and T2005 from open pairings" ->
  same action; "auto assign pairings" (no crew/period) -> asks for crew + period, no action.
- PW e2e tests/gantt/rbot-auto-assign-crew.spec.ts (LOCAL stack, then also on cr.rois.one): 2 passed,
  run twice (it now resets its own precondition via /api/roster/bulk-delete). It types the English
  order into the real chat box, opens the dialog, applies 20/20, Saves, then asserts from
  __ganttTest.roster() that each crew has >=8 distinct pairings, >=8 duties, no overlaps, duty in
  every week of September, first duty <= Sep 3 and last duty >= Sep 20. Screenshots (inspected):
  docs/assets/screenshots/gantt/rbot-auto-assign-{applied,sep-week1..4}-Ver*.png
- Saved roster (asserted + DB): T2004 and T2005 each 10 pairings / 40 roster rows / Sep 1 -> Sep 26,
  duty days 01-04, 08-09, 11-12, 15-17, 19-20, 22-23, 25-26, RpCred 75:00.

WHAT "FULL MONTH" MEANS HERE (important, legality-bound):
The engine enforces rule 8002 (cumulative block <= 112:00 per 28-day window) and the free-day rule
(any single free day must be >=2 consecutive days in 168h). A literal every-day roster is ILLEGAL:
the planner packs the month's legal maximum (10 trips / 75 block hours / 17 duty days) spread across
every week, and the last days of September stay free (next trip would start in October). A denser
month would need shorter rotations or relaxed rules - flag to Ryan rather than "fixing" the data.

FOLLOW-UPS: restart the rois-one tunnel to activate the config.yml fix; consider deleting the 8
788/789 demo pairings; consider whether family quals (B787) should expand to fleet_grp variants in
the auto-assign matcher (exact-match today, affects ~40 crew).

## 当前工作树快照

### git status --short

```text
 M ai-server/src/chat/routes.py
 M ai-server/src/chat/tools.py
 M ai-server/tests/test_chat_route.py
 M ai-server/tests/test_chat_tools.py
 M docs/dev-context/LATEST.md
 M e2e/tests/gantt/roundtrip-builder.spec.ts
 M gantt/src/components/ai-chat/__tests__/dispatch-ai-action.test.ts
 M gantt/src/components/ai-chat/ai-chat-panel.tsx
 M gantt/src/components/ai-chat/dispatch-ai-action.ts
 M gantt/src/components/ai-chat/types.ts
 M gantt/src/components/ai-chat/use-ai-chat.ts
 M gantt/src/components/dev/dev-skills-data.generated.ts
 M gantt/src/components/roundtrip-pairing/roundtrip-builder-dialog.tsx
 M gantt/src/services/roundtrip-api.ts
 M gantt/src/stores/roundtrip-builder-store.ts
 M live-server/src/__tests__/services/pairing/roundtrip-chooser.test.ts
 M live-server/src/services/pairing/roundtrip-chooser.ts
?? .agents/skills/142-flight-schedule-seed-generator/fixtures/add-b787-demo-sep2026.json
?? docs/assets/screenshots/brand/
?? docs/assets/screenshots/gantt/auto-assign-7305-max-consec-j4006-Ver1.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-applied-Ver1.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-applied-Ver2.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-applied-Ver3.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week1-Ver1.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week1-Ver2.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week2-Ver1.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week2-Ver2.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week3-Ver1.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week3-Ver2.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week4-Ver1.png
?? docs/assets/screenshots/gantt/rbot-auto-assign-sep-week4-Ver2.png
?? docs/assets/screenshots/gantt/rbot-pairing-build-built-152216-Ver1.png
?? docs/assets/screenshots/gantt/rbot-pairing-build-built-152217-Ver1.png
?? docs/assets/screenshots/gantt/rbot-pairing-build-built-152218-Ver1.png
?? docs/assets/screenshots/gantt/rbot-pairing-build-built-152219-Ver1.png
?? docs/assets/screenshots/gantt/rbot-pairing-build-built-152220-Ver1.png
?? docs/assets/screenshots/gantt/rbot-pairing-build-built-152221-Ver1.png
?? docs/assets/screenshots/gantt/rbot-pairing-build-built-152284-Ver1.png
?? docs/assets/screenshots/gantt/roundtrip-builder-readonly-complete-Ver8.png
?? docs/assets/screenshots/gantt/roundtrip-builder-readonly-complete-Ver9.png
?? docs/assets/screenshots/gantt/roundtrip-builder-readonly-composition-preserved-Ver8.png
?? docs/assets/screenshots/gantt/roundtrip-builder-readonly-composition-preserved-Ver9.png
?? docs/assets/screenshots/gantt/roundtrip-builder-readonly-interior-preview-Ver8.png
?? docs/assets/screenshots/gantt/roundtrip-builder-readonly-interior-preview-Ver9.png
?? docs/assets/screenshots/gantt/roundtrip-builder-readonly-invalid-range-Ver8.png
?? docs/assets/screenshots/gantt/roundtrip-builder-readonly-invalid-range-Ver9.png
?? docs/assets/screenshots/gantt/roundtrip-builder-readonly-link-candidates-Ver5.png
?? docs/assets/screenshots/gantt/roundtrip-builder-readonly-link-candidates-Ver6.png
?? docs/assets/screenshots/gantt/roundtrip-builder-readonly-options-loading-Ver8.png
?? docs/assets/screenshots/gantt/roundtrip-builder-readonly-options-loading-Ver9.png
?? docs/assets/screenshots/gantt/roundtrip-builder-readonly-options-reopened-Ver8.png
?? docs/assets/screenshots/gantt/roundtrip-builder-readonly-options-reopened-Ver9.png
?? docs/assets/screenshots/gantt/roundtrip-builder-scope-Ver2.png
?? docs/assets/screenshots/gantt/roundtrip-builder-scope-Ver3.png
?? docs/design/
?? docs/dev-context/2026-09-11-gantt-rbot-pairing-build.md
?? docs/handoff/agent-workflow/
?? docs/superpowers/specs/2026-09-11-rbot-pairing-build-design.md
?? docs/test-cases/gantt/live-sync-cr-rois-one-signoff-gate.md
?? e2e/docs/assets/screenshots/crew-recovery/
?? e2e/tests/gantt/auto-assign-7305-max-consec-j4006.spec.ts
?? e2e/tests/gantt/rbot-auto-assign-crew.spec.ts
?? e2e/tests/gantt/rbot-pairing-build.spec.ts
?? gantt/src/services/__tests__/gantt-sync-manager-fallback.test.ts
?? live-server/probe-7305-timing.mjs
?? live-server/scratch-7305-fix.mjs
?? live-server/scratch-7305-j4006.mjs
?? live-server/scratch-7305-params.mjs
?? live-server/scratch-7305-viol.mjs
?? live-server/scratch-7305-when.mjs
?? live-server/scripts/seed-add-b787-pairing-ladder.mjs
```

### unstaged changed files

```text
ai-server/src/chat/routes.py
ai-server/src/chat/tools.py
ai-server/tests/test_chat_route.py
ai-server/tests/test_chat_tools.py
docs/dev-context/LATEST.md
e2e/tests/gantt/roundtrip-builder.spec.ts
gantt/src/components/ai-chat/__tests__/dispatch-ai-action.test.ts
gantt/src/components/ai-chat/ai-chat-panel.tsx
gantt/src/components/ai-chat/dispatch-ai-action.ts
gantt/src/components/ai-chat/types.ts
gantt/src/components/ai-chat/use-ai-chat.ts
gantt/src/components/dev/dev-skills-data.generated.ts
gantt/src/components/roundtrip-pairing/roundtrip-builder-dialog.tsx
gantt/src/services/roundtrip-api.ts
gantt/src/stores/roundtrip-builder-store.ts
live-server/src/__tests__/services/pairing/roundtrip-chooser.test.ts
live-server/src/services/pairing/roundtrip-chooser.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-11-gantt-rbot-auto-assign.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
