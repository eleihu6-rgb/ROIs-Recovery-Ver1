# 开发上下文（2026-09-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-11 09:16:14 PDT
- Wing：`live-server`
- Topic：`crew-app-notification-push`
- Title：Crew App Live Notification + Push (Phase 1 built)
- Git branch：`feat/gantt/roundtrip-pairing-builder`

## 本轮对话上下文

## 目标
让 Altair Live（/altair/live → live-server）的排班变更能送达 crew app，包括 app 未打开时。
本次先做「准备开发 + Phase 1 落地」。

## 现状结论（重要，勿反复推翻）
- 通知框架目前是 EVACC 的 backend/crew_notify（Redis 持久日志 + FDP discretion 状态机），只服务 EK，且 plan 明确写「stage 1 不做真正的 APNs/FCM push」。
- crew-app 只有轮询：fetchNotifications → POST {apiBaseUrl}/crew-app/v1/notifications，Alerts tab 聚焦时才刷新；app 内无 WebSocket/SSE。
- live-server 完全没有 crew-app 通知通道：notifyRosterTasksChanged 只做缓存失效 + WS 广播给 gantt 操作端（/ws/locks）。
- 因此 F8/ET 的 Alerts tab 一直是坏的：app 打 https://cr.rois.one/api/crew-app/v1/notifications 会 404。
- app 端完全没有 push：iOS 无 entitlements（无 aps-environment）、Android manifest 只有 INTERNET、无 Firebase/notifee 依赖。

## 关键设计决定（已写入 spec，待 Ryan 最终确认）
- Feed 是真相，push 只是唤醒；push 漏投不能丢通知。
- 推荐 FCM 同时覆盖 Android + iOS（一套凭据/一套 RN 库），APNs p8 上传到 Firebase。FCM 在官方定价页标注 No-cost；唯一成本是本来就需要的 Apple Developer Program。
- 自建 ntfy/Gotify/UnifiedPush 无法唤醒关闭的 iOS app，不满足需求。
- 未决：Phase 2 producer scope（哪些 Live 事件通知机组）、ET 是否与 F8 同期上线、store owner 已建议 live-server Postgres。

## 文档产物
- docs/superpowers/specs/2026-09-11-crew-app-live-notification-push-design.md（现状 + 差距 + 目标架构 + 成本可靠性对比 + 风险）
- docs/superpowers/plans/2026-09-11-crew-app-live-notification-push.md（Phase 1–4 任务、验证命令、回滚、Flair 凭据清单）

## 本次已实现（Phase 1 backend + app client）
- sql/migration/2026-09-11-crew-notification.sql：crew_notification 表（幂等、search_path 守卫、notif_id 唯一做幂等键、airline+crew_id+seq 索引）。**尚未执行**。
- live-server/src/models/crew/crew-notification.ts + models/index.ts 导出。
- live-server/src/services/crew-notify/crew-notify-service.ts：listForCrew（since 游标、按 airline+crew 作用域、单页 200 最新在前再反转）、markRead（幂等、按 airline+crew 作用域）、appendNotification（on conflict do nothing，重复 key 读回既有行）。
- live-server/src/routes/crew-notify/crew-notify.ts：POST /notifications、POST /notifications/:notifId/read；响应走 live-server {code,data,message} 信封；index.ts 注册到 /api/crew-app/v1。
- live-server/src/plugins/auth.ts：PUBLIC_EXACT_ROUTES 增加两条 crew-app 路由；新增 matchesRoutePattern 支持 :param 段（避免用前缀放行暴露其它方法/子路径）。
- live-server/src/services/mobile-roster/mobile-roster-service.ts：抽出 verifyMobileCrewCredentials，roster 与 notify 共用同一个凭据闸门（纯重构）。
- crew-app/src/features/notifications/notificationsApi.ts：F8/ET 拆 live-server 的 {code,data,message} 信封（EK 保持原样），非 200 code 抛出后端 message。
- crew-app/src/version.ts：98 → 99。

## 验证结果（实测）
- PASS: live-server `npx vitest run src/services/crew-notify src/__tests__/unit/crew-notify-route.test.ts src/services/mobile-roster src/__tests__/unit/mobile-roster-route.test.ts` → 4 files / 28 tests 全绿。
- PASS: live-server `npx tsc --noEmit`。
- PASS: crew-app `npx jest __tests__/features/notificationsApi.test.ts` → 9 tests；另 NotificationsScreen + notificationsSlice 7 tests 全绿；`npx tsc --noEmit` 通过。
- 已知既有失败（与本改动无关，已用 git stash 对照验证）：live-server src/__tests__/unit 有 3 files / 6 tests 失败（roster-inbound-worker、scenario-publish-roster-route、scenario-route-audit-user）。

## 尚未完成 / 下一步
- 迁移未执行：需在有 psql/DB 的环境跑 sql/migration/2026-09-11-crew-notification.sql（本机无 psql）。
- 真实 UI 验收未做：需要迁移生效 + 服务重启后，用 crew 113 走 Alerts tab，并按 Ryan 偏好跑 https://cr.rois.one/altair/live 的 Playwright + 截图（docs/assets/screenshots/crew-app/）。
- Phase 3 阻塞在 Flair 的 Firebase service-account JSON、APNs .p8 + Key ID + Team ID + bundle id、google-services.json。
- 未 commit / 未 push（仓库规则要求显式指令）。

## 当前工作树快照

### git status --short

```text
 M ai-server/src/chat/routes.py
 M ai-server/src/chat/tools.py
 M ai-server/tests/test_chat_route.py
 M ai-server/tests/test_chat_tools.py
 M crew-app/__tests__/features/ekRosterLogin.test.ts
 M crew-app/__tests__/features/ekRosterSnapshot.test.ts
 M crew-app/__tests__/features/notificationsApi.test.ts
 M crew-app/src/features/auth/EkRosterLoginScreen.tsx
 M crew-app/src/features/auth/authSlice.ts
 M crew-app/src/features/auth/ekRosterLogin.ts
 M crew-app/src/features/auth/ekRosterSnapshot.ts
 M crew-app/src/features/notifications/notificationsApi.ts
 M crew-app/src/version.ts
 M docs/dev-context/LATEST.md
 D e2e/docs/assets/screenshots/gantt/pairing-build-credit-Ver1.png
 D e2e/docs/assets/screenshots/gantt/pairing-build-credit-Ver2.png
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
 M live-server/src/index.ts
 M live-server/src/models/index.ts
 M live-server/src/plugins/auth.ts
 M live-server/src/services/mobile-roster/mobile-roster-service.ts
 M live-server/src/services/pairing/roundtrip-chooser.ts
?? .agents/skills/142-flight-schedule-seed-generator/fixtures/add-b787-demo-sep2026.json
?? crew-app/.maestro/et_login_storage_failure_1_launch.yaml
?? crew-app/.maestro/et_login_storage_failure_2_login.yaml
?? docs/assets/screenshots/brand/
?? docs/assets/screenshots/crew-app/et-j4002-login-home-Ver2.png
?? docs/assets/screenshots/crew-app/et-j4002-login-storage-failure-home-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-login-storage-failure-soft-notice-Ver1.png
?? docs/assets/screenshots/crew-app/et-j4002-login-upcoming-Ver2.png
?? docs/assets/screenshots/crew-app/redesign-Ver5-home-ids.png
?? docs/assets/screenshots/crew-app/redesign-Ver5-home.png
?? docs/assets/screenshots/crew-app/redesign-Ver5-profile.png
?? docs/assets/screenshots/crew-app/redesign-Ver5-sched.png
?? docs/assets/screenshots/crew-app/redesign-Ver5-vs-reference.png
?? docs/assets/screenshots/crew-app/redesign-Ver7-home-ids.png
?? docs/assets/screenshots/crew-app/redesign-Ver7-home.png
?? docs/assets/screenshots/crew-app/redesign-Ver7-profile.png
?? docs/assets/screenshots/crew-app/redesign-Ver7-sched.png
?? docs/assets/screenshots/crew-app/redesign-Ver7-vs-reference.png
?? docs/assets/screenshots/crew-app/redesign-Ver8-home-et.png
?? docs/assets/screenshots/crew-app/redesign-Ver8-home-ids.png
?? docs/assets/screenshots/crew-app/redesign-Ver8-home.png
?? docs/assets/screenshots/crew-app/redesign-Ver8-profile.png
?? docs/assets/screenshots/crew-app/redesign-Ver8-sched.png
?? docs/assets/screenshots/crew-app/redesign-Ver8-vs-reference.png
?? docs/assets/screenshots/gantt/auto-assign-7305-max-consec-j4006-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-7305-max-consec-j4006-Ver2.png
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
?? docs/dev-context/2026-09-11-gantt-rbot-auto-assign.md
?? docs/dev-context/2026-09-11-gantt-rbot-pairing-build.md
?? docs/handoff/agent-workflow/
?? docs/superpowers/plans/2026-09-11-crew-app-live-notification-push.md
?? docs/superpowers/specs/2026-09-11-crew-app-live-notification-push-design.md
?? docs/superpowers/specs/2026-09-11-rbot-pairing-build-design.md
?? docs/test-cases/crew-app/
?? docs/test-cases/gantt/live-sync-cr-rois-one-signoff-gate.md
?? e2e/tests/gantt/auto-assign-7305-max-consec-j4006.spec.ts
?? e2e/tests/gantt/rbot-auto-assign-crew.spec.ts
?? e2e/tests/gantt/rbot-pairing-build.spec.ts
?? gantt/src/services/__tests__/gantt-sync-manager-fallback.test.ts
?? live-server/scripts/seed-add-b787-pairing-ladder.mjs
?? live-server/src/__tests__/unit/crew-notify-route.test.ts
?? live-server/src/models/crew/crew-notification.ts
?? live-server/src/routes/crew-notify/
?? live-server/src/services/crew-notify/
?? sql/migration/2026-09-11-crew-notification.sql
```

### unstaged changed files

```text
ai-server/src/chat/routes.py
ai-server/src/chat/tools.py
ai-server/tests/test_chat_route.py
ai-server/tests/test_chat_tools.py
crew-app/__tests__/features/ekRosterLogin.test.ts
crew-app/__tests__/features/ekRosterSnapshot.test.ts
crew-app/__tests__/features/notificationsApi.test.ts
crew-app/src/features/auth/EkRosterLoginScreen.tsx
crew-app/src/features/auth/authSlice.ts
crew-app/src/features/auth/ekRosterLogin.ts
crew-app/src/features/auth/ekRosterSnapshot.ts
crew-app/src/features/notifications/notificationsApi.ts
crew-app/src/version.ts
docs/dev-context/LATEST.md
e2e/docs/assets/screenshots/gantt/pairing-build-credit-Ver1.png
e2e/docs/assets/screenshots/gantt/pairing-build-credit-Ver2.png
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
live-server/src/index.ts
live-server/src/models/index.ts
live-server/src/plugins/auth.ts
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
2. 本文件：`docs/dev-context/2026-09-11-live-server-crew-app-notification-push.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh live-server
git status --short
```
