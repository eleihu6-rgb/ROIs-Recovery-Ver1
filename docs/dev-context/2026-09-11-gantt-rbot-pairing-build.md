# 开发上下文（2026-09-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-11 05:43:14 PDT
- Wing：`gantt`
- Topic：`rbot-pairing-build`
- Title：R'Bot → Pairing Build Automation handoff
- Git branch：`feat/gantt/roundtrip-pairing-builder`

## 本轮对话上下文

Goal (Ryan 2026-09-11): let a planner give R'Bot a plain-English pairing-build order
("build pairings for ADD 7M8 from 2026-09-20 to 2026-09-30") and land in the existing
Live "Pairing Build Automation" dialog, pre-filled and already searched, with an in-dialog
progress + build summary.

Shipped:
- ai-server/src/chat/tools.py: new `build_pairings` tool (base required; start/end or
  month+year; optional fleets, composition[{rank,plan}], rule overrides restMin/
  maxDutyBlockMin/checkinMin/debriefMin/singleLegExemption). `build_pairings_params()`
  normalizes/validates; `build_pairings_missing_message()` drives the "which base /
  which period?" reply; `tool_call_to_action()` maps it to the client action.
- ai-server/src/chat/routes.py: system-prompt guidance + trigger phrases; incomplete
  orders return the ask-for-missing-piece text with NO action.
- gantt AiAction `{type:'build_pairings'}` (types.ts) → dispatch-ai-action.ts: sets the
  Gantt date range onto the request (the dialog clamps scope to the visible range) and
  calls useRoundtripBuilderStore.openWithPrefill({source:'rbot',...}).
  'build_pairings' added to RELOAD_ACTIONS in use-ai-chat.ts.
- roundtrip-builder-store.ts: `prefill` + `lastRun` (requested/built/failed/
  uncoveredFlights/warnings) + consumePrefill/openWithPrefill/setLastRun.
- roundtrip-builder-dialog.tsx: applies the prefill once options load, auto-runs the
  open-flight search ONCE, renders rt-rbot-banner / rt-progress-card / rt-summary
  (built vs requested, unpaired flights, warnings). DELIBERATE CHANGE: the dialog now
  STAYS OPEN during/after a run (it used to close) so progress + summary are visible;
  the planner closes it with "View Gantt". Only the summary bar/warnings are new UI.
- ai-chat-panel.tsx: added a rotating tip `"build pairings for <base> <fleet>"`.
- Decision: R'Bot PREPARES the build; the human presses "Build all" (pairing build writes
  real rows, no draft/Save step). Flip to auto-build only if Ryan asks.

Backend robustness fix (needed for arbitrary user date ranges):
- live-server/src/services/pairing/roundtrip-chooser.ts `chooseRotations()` used to abort
  the WHOLE search with 400 "Check-in is outside selected scope" when any seed rotation's
  check-in landed before the scope start. It now SKIPS those candidates and only rethrows
  when nothing at all is buildable (message preserved). Unit tests added; probe: ADD 7M8
  2026-09-20..30 now returns 614 flights / 133 rotations instead of a 400.

Verification:
- ai-server: `.venv/bin/python -m pytest tests/test_chat_tools.py tests/test_chat_route.py` → 73 passed.
- Real LLM smoke (ai-server restarted on :3005): "build pairings for ADD 7M8 from
  2026-09-20 to 2026-09-30" → action build_pairings{ADD,2026-09-20,2026-09-30,fleets:[7M8]};
  "…for ADD for September" → month resolved; "build pairings for DXB" → asks for the period;
  "ADD A380 … 2 CA 2 FO … 10 hours minimum rest" → fleets+composition+rules{restMin:600}.
- gantt: tsc clean; `npx vitest run src/components/ai-chat/__tests__/dispatch-ai-action.test.ts` → 31 passed;
  `npm run check:ui` → PASS (0 hard violations).
- live-server: `npx vitest run src/__tests__/services/pairing/roundtrip-chooser.test.ts` → 17 passed.
- Playwright (LOCAL, this repo's vite on :5567 + live-server :3000; the e2e/.env public
  target cr.rois.one serves OLD code and was therefore NOT used):
  `GANTT_BASE_URL=http://localhost:5567 GANTT_API_URL=http://localhost:3000 GANTT_TEST_USER=admin
   GANTT_TEST_PASS=123456 npx playwright test tests/gantt/rbot-pairing-build.spec.ts
   --config=config/playwright.config.ts --project=gantt --reporter=list` → 2 passed.
  Types the plain-English order into the real chat box, asserts prefill/banner/auto-search,
  builds ONE rotation, asserts the summary. Screenshot:
  docs/assets/screenshots/gantt/rbot-pairing-build-built-152217-Ver1.png (visual checked).
  Writes 1 real pairing per run (precedent = roundtrip-builder.spec.ts). Two pairings
  (#152216, #152217) and the auto-assign/other agent's rows were left in the SIT DB.

Unfinished / known:
- `e2e/tests/gantt/roundtrip-builder.spec.ts` was updated for the new "dialog stays open"
  behaviour (assert rt-summary then click rt-show-results). That suite CANNOT run green in
  the current SIT data state: it requires >=3 four-segment ADD rotations departing
  2026-09-20 and the schedule has 0 left (37 layover + 3 two-segment remain) — verified
  identical failure with the chooser change stashed, i.e. pre-existing data attrition, not
  this change. Needs a reseed or a different outbound date before that suite is meaningful.
- The ai-server on :3005 was restarted to load the new tool (old PID 8538 killed).
- Scope warnings are empty for scoped (round-trip) builds because pairing-build-service
  only runs validateBuildRules for unscoped builds; the summary shows warnings when present.

## 当前工作树快照

### git status --short

```text
 M ai-server/src/chat/routes.py
 M ai-server/src/chat/tools.py
 M ai-server/tests/test_chat_route.py
 M ai-server/tests/test_chat_tools.py
 M e2e/tests/gantt/roundtrip-builder.spec.ts
 M gantt/src/components/ai-chat/__tests__/dispatch-ai-action.test.ts
 M gantt/src/components/ai-chat/ai-chat-panel.tsx
 M gantt/src/components/ai-chat/dispatch-ai-action.ts
 M gantt/src/components/ai-chat/types.ts
 M gantt/src/components/ai-chat/use-ai-chat.ts
 M gantt/src/components/roundtrip-pairing/roundtrip-builder-dialog.tsx
 M gantt/src/services/roundtrip-api.ts
 M gantt/src/stores/roundtrip-builder-store.ts
 M live-server/src/__tests__/services/pairing/roundtrip-chooser.test.ts
 M live-server/src/__tests__/unit/mobile-roster-route.test.ts
 M live-server/src/routes/mobile-roster/mobile-roster.ts
 M live-server/src/services/mobile-roster/mobile-roster-service.ts
 M live-server/src/services/pairing/roundtrip-chooser.ts
?? crew-app/
?? docs/assets/screenshots/crew-app/
?? docs/assets/screenshots/gantt/auto-assign-7305-max-consec-j4006-Ver1.png
?? docs/assets/screenshots/gantt/rbot-pairing-build-built-152216-Ver1.png
?? docs/assets/screenshots/gantt/rbot-pairing-build-built-152217-Ver1.png
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
?? docs/handoff/agent-workflow/
?? docs/superpowers/specs/2026-09-11-rbot-pairing-build-design.md
?? docs/test-cases/gantt/live-sync-cr-rois-one-signoff-gate.md
?? e2e/docs/assets/screenshots/crew-recovery/
?? e2e/tests/gantt/rbot-pairing-build.spec.ts
?? gantt/src/services/__tests__/gantt-sync-manager-fallback.test.ts
?? live-server/probe-7305-timing.mjs
?? live-server/scratch-7305-fix.mjs
?? live-server/scratch-7305-j4006.mjs
?? live-server/scratch-7305-params.mjs
?? live-server/scratch-7305-viol.mjs
?? live-server/scratch-7305-when.mjs
?? live-server/src/__tests__/services/mobile-roster-service-et.test.ts
```

### unstaged changed files

```text
ai-server/src/chat/routes.py
ai-server/src/chat/tools.py
ai-server/tests/test_chat_route.py
ai-server/tests/test_chat_tools.py
e2e/tests/gantt/roundtrip-builder.spec.ts
gantt/src/components/ai-chat/__tests__/dispatch-ai-action.test.ts
gantt/src/components/ai-chat/ai-chat-panel.tsx
gantt/src/components/ai-chat/dispatch-ai-action.ts
gantt/src/components/ai-chat/types.ts
gantt/src/components/ai-chat/use-ai-chat.ts
gantt/src/components/roundtrip-pairing/roundtrip-builder-dialog.tsx
gantt/src/services/roundtrip-api.ts
gantt/src/stores/roundtrip-builder-store.ts
live-server/src/__tests__/services/pairing/roundtrip-chooser.test.ts
live-server/src/__tests__/unit/mobile-roster-route.test.ts
live-server/src/routes/mobile-roster/mobile-roster.ts
live-server/src/services/mobile-roster/mobile-roster-service.ts
live-server/src/services/pairing/roundtrip-chooser.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-11-gantt-rbot-pairing-build.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
