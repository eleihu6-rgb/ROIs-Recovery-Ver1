# 开发上下文（2026-09-12）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-12 13:34:09 PDT
- Wing：`rois-ai`
- Topic：`crew-app-guest-social-login`
- Title：Crew App — Guest login + Google/Apple/Facebook entry
- Git branch：`main`

## 本轮对话上下文

## 需求（Ryan 2026-09-12）
crew app 登录页在 Log in 按钮下方加 "Or" 分隔 + Login as Guest；支持 Google / Apple / Facebook 登录；
社交登录拿到的用户名显示在 Profile；Guest 登录跳过航司登录与 roster 拉取，但其余功能（iOS 日历同步、
闹钟、会议提醒、时区、Explore、R'Bot）都能用。Ryan 确认三项选择：1a（先出 UI + provider 层，
凭据到位后再接原生 SDK）、2a（沿用 Keep me logged in 复选框决定是否持久化 guest 会话）、
3a（Guest 的 Profile 增加 "Sign in with your airline" 行，回到航司登录，无后端改动）。

## 设计（spec: docs/superpowers/specs/2026-09-12-crew-app-guest-and-social-login-design.md）
- authSlice 增加 `mode: 'crew' | 'guest'`、`provider`、`displayName`、`email`、`photoUrl`。
  guest 与社交会话都是**正常登录会话**（loggedIn=true），只是没有航司：不经过 Capture/EkRoster，
  不设置 roster。航司相关界面留空并说明原因。
- `selectIsGuest` = mode==='guest'（guest 与社交都算），用于空态说明与 Profile 回航司入口。
- sessionStore：guest 会话只写 AsyncStorage（无密码、无 Keychain），crew 路径不变；
  写 guest 会话时清掉 crew 记录 + EK roster snapshot（否则下次启动会被旧快照顶回航司会话）；
  `clearSession()` 两者都清。
- `presetForAirline('')` 返回 'altair'（guest 用登录页同款 sage 主题，不借用某个航司配色）。
  注意：只有空字符串走这条；null/undefined 仍按原 'sia'（themeSelector 测试断言了这个契约）。
- `_clearSession` 现在同时清 `base`：之前登出不清 base，会让下一位 guest 继承前一位机组的基地。
- socialAuth.ts：唯一懂 Google/Apple/FB 的模块。provider 未配齐（原生模块或客户端 ID）时抛
  SocialAuthUnavailableError 并点名缺什么（如 GoogleIosClientId）；**不伪造登录成功**。
- 登录页品牌图标（ProviderGlyph）是唯一允许的非 nav-bar 图标例外（第三方品牌规范）。
- Home 增加 guest 提示条；Profile 用 identity 名字 + provider chip，并把 block-hours 卡换成
  "Sign in with your airline"；PersonalInfo 改为 Name/Email/Signed in with/Airline；
  AbsenceScreen 对 guest 明确提示需要 crew ID（不再发一个必然失败的请求）；SpecPage 空 crewId 时用 identity 名。

## 验证
- `npx jest`：70 suites / 664 tests PASS（新增 __tests__/features/guestLogin.test.tsx 9 例）。
- `npx tsc --noEmit`：PASS。
- iOS 模拟器（iPhone Air, iOS 26.5）：`.maestro/guest_login.yaml` PASS（登录页 → Guest → Home →
  Profile → Personal Information）；`.maestro/et_login.yaml` PASS（真实 ET 机组 J4002 roster 仍正常，
  Home 出现真实航班 ET376/DAR/MGQ）。
- 截图：docs/assets/screenshots/crew-app/crew-app-guest-login-Ver1-0{0..4}_*.png。
- 修复：首轮截图发现 "Or" 与 guest 提示用了 LOGIN.inkSoft（白色 82%）而卡片是白底 → 文字不可见；
  改用 colors.muted 后 OCR 确认 "Or" 可见。

## 待办 / 阻塞
- 真实社交登录仍需凭据：Google iOS OAuth client ID + reversed client ID URL scheme；
  Facebook App ID + fb<appid> URL scheme；Apple Developer team 打开 Sign in with Apple capability。
  之后加 SDK（google-signin / apple-authentication / fbsdk-next）即可，socialAuth.ts 已留好接头。
- Apple 登录无法在模拟器完整验证（需真机 + sandbox Apple ID）。

## 参考图注意
Ryan 2026-09-12 13:28 提供的 clipboard-...-BBEAD4C8.png 实际是 macOS "SpringBoard quit unexpectedly"
崩溃弹窗（抓错了窗口），不是设计稿；另一张 Snipaste 与 13:11 的 clipboard 图内容完全相同。

## 当前工作树快照

### git status --short

```text
 M .agents/skills/144-auto-assign-base-crew/SKILL.md
 M crew-app/__tests__/features/loginScreen.test.tsx
 M crew-app/src/features/auth/LoginScreen.tsx
 M crew-app/src/features/auth/authSlice.ts
 M crew-app/src/features/auth/sessionStore.ts
 M crew-app/src/features/v2/AbsenceScreen.tsx
 M crew-app/src/features/v2/HomeScreen.tsx
 M crew-app/src/features/v2/PersonalInfoScreen.tsx
 M crew-app/src/features/v2/ProfileScreen.tsx
 M crew-app/src/features/v2/SpecPage.tsx
 M crew-app/src/features/v2/useV2.ts
 M crew-app/src/theme/carrier.ts
 M crew-app/src/version.ts
 M docs/assets/screenshots/gantt/auto-assign-7305-max-consec-j4006-Ver2.png
 M docs/dev-context/LATEST.md
 M docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md
 D e2e/node_modules
 M e2e/tests/gantt/auto-assign-7305-max-consec-j4006.spec.ts
 M e2e/tests/gantt/auto-assign-even-distribution-j4002.spec.ts
 M e2e/tests/gantt/auto-assign-even-distribution-j4007.spec.ts
 M e2e/tests/gantt/auto-assign-open-pairings-j4001.spec.ts
 M e2e/tests/gantt/rbot-auto-assign-crew.spec.ts
 D gantt/node_modules
 M gantt/src/components/dev/dev-skills-data.generated.ts
 M gantt/src/components/help/topics/recovery/recovery-102.tsx
 M gantt/src/components/help/topics/recovery/recovery-costs.tsx
 M gantt/src/components/recovery/recovery-cost-breakdown-dialog.tsx
 M gantt/src/components/recovery/recovery-violation-dialog.tsx
 M gantt/src/components/roster/auto-assign-dialog.tsx
 M gantt/src/services/auto-assign-api.ts
 M gantt/src/services/recovery-api.ts
 M gantt/src/services/recovery-candidates.ts
 M gantt/src/stores/roster-store.ts
 M gantt/src/utils/auto-assign-driver.ts
 D live-server/node_modules
 M live-server/src/routes/recovery/recovery-cost.ts
 M live-server/src/services/roster/auto-assign-service.ts
 M live-server/tests/unit/auto-assign-service.test.ts
 D node_modules
 D packages/ui/node_modules
 D rule-engine-rs/target
?? crew-app/.maestro/guest_login.yaml
?? crew-app/__tests__/features/guestLogin.test.tsx
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
?? crew-app/sched_04_meeting_card_on_flight_day.png
?? crew-app/sim_01_login.png
?? crew-app/sim_02_home.png
?? crew-app/sim_03_sched_open.png
?? crew-app/sim_04_sched_day09.png
?? crew-app/sim_05_sched_fwd1.png
?? crew-app/sim_06_sched_fwd3.png
?? crew-app/src/features/auth/ProviderGlyph.tsx
?? crew-app/src/features/auth/identity.ts
?? crew-app/src/features/auth/socialAuth.ts
?? crew-app/tgdest_00_home.png
?? crew-app/tgdest_01_home_destination_strip.png
?? crew-app/tgdest_02_city.png
?? crew-app/tgdest_03_next_city.png
?? crew-app/tgdest_04_back_to_first.png
?? crew-app/tgdest_05_hotel_transfer.png
?? crew-app/tgdest_06_trip_details.png
?? docs/ai/2026-09-12-0606-iphone-crew-app-login-build-provenance-audit-Ver1.md
?? docs/ai/2026-09-12-0608-project-startup-validation-Ver1.md
?? docs/assets/screenshots/crew-app/crew-app-guest-login-Ver1-00_login.png
?? docs/assets/screenshots/crew-app/crew-app-guest-login-Ver1-01_guest-home.png
?? docs/assets/screenshots/crew-app/crew-app-guest-login-Ver1-02_guest-profile.png
?? docs/assets/screenshots/crew-app/crew-app-guest-login-Ver1-03_guest-personal-info.png
?? docs/assets/screenshots/crew-app/crew-app-guest-login-Ver1-04_airline-crew-home-regression.png
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
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-absence-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-restored-absence-Ver2.png
?? docs/assets/screenshots/crew-recovery/s1-verified-stand-down-Ver1.png
?? docs/assets/screenshots/crew-recovery/s1-verified-stand-down-absence-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-analyse-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-applied-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-add-configure-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-analyse-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-applied-Ver1.png
?? docs/assets/screenshots/gantt/auto-assign-duties-dxb-configure-Ver1.png
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
?? docs/superpowers/specs/2026-09-12-auto-assign-duties-design.md
?? docs/superpowers/specs/2026-09-12-auto-assign-duties-mock.html
?? docs/superpowers/specs/2026-09-12-crew-app-guest-and-social-login-design.md
?? docs/superpowers/specs/2026-09-12-recovery-standby-gh-demo-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-S1-1001-options-setup-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-S1-case-001-execution-Ver1.md
?? docs/test-cases/crew-recovery/2026-09-12-S1-crew-unavailable-preparation-Ver1.md
?? e2e/config/recovery-case-study.config.ts
?? e2e/docs/
?? e2e/scripts/recovery-s1-options-readonly.cjs
?? e2e/tests/gantt/auto-assign-duties-show-crew.spec.ts
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
?? gantt/src/services/__tests__/recovery-standby-gh.test.ts
?? live-server/src/services/recovery/standby-gh-cost.test.ts
?? live-server/src/services/recovery/standby-gh-cost.ts
?? packages/legality-messages/pnpm-lock.yaml
?? sim_01_login.png
```

### unstaged changed files

```text
.agents/skills/144-auto-assign-base-crew/SKILL.md
crew-app/__tests__/features/loginScreen.test.tsx
crew-app/src/features/auth/LoginScreen.tsx
crew-app/src/features/auth/authSlice.ts
crew-app/src/features/auth/sessionStore.ts
crew-app/src/features/v2/AbsenceScreen.tsx
crew-app/src/features/v2/HomeScreen.tsx
crew-app/src/features/v2/PersonalInfoScreen.tsx
crew-app/src/features/v2/ProfileScreen.tsx
crew-app/src/features/v2/SpecPage.tsx
crew-app/src/features/v2/useV2.ts
crew-app/src/theme/carrier.ts
crew-app/src/version.ts
docs/assets/screenshots/gantt/auto-assign-7305-max-consec-j4006-Ver2.png
docs/dev-context/LATEST.md
docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md
e2e/node_modules
e2e/tests/gantt/auto-assign-7305-max-consec-j4006.spec.ts
e2e/tests/gantt/auto-assign-even-distribution-j4002.spec.ts
e2e/tests/gantt/auto-assign-even-distribution-j4007.spec.ts
e2e/tests/gantt/auto-assign-open-pairings-j4001.spec.ts
e2e/tests/gantt/rbot-auto-assign-crew.spec.ts
gantt/node_modules
gantt/src/components/dev/dev-skills-data.generated.ts
gantt/src/components/help/topics/recovery/recovery-102.tsx
gantt/src/components/help/topics/recovery/recovery-costs.tsx
gantt/src/components/recovery/recovery-cost-breakdown-dialog.tsx
gantt/src/components/recovery/recovery-violation-dialog.tsx
gantt/src/components/roster/auto-assign-dialog.tsx
gantt/src/services/auto-assign-api.ts
gantt/src/services/recovery-api.ts
gantt/src/services/recovery-candidates.ts
gantt/src/stores/roster-store.ts
gantt/src/utils/auto-assign-driver.ts
live-server/node_modules
live-server/src/routes/recovery/recovery-cost.ts
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
2. 本文件：`docs/dev-context/2026-09-12-rois-ai-crew-app-guest-social-login.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```

## 追加（同一轮，设备实测后）
**Bug：guest 会话在真机/模拟器上不保持。** 首次 Maestro 重启用例失败：重启回到登录页。
排查：AsyncStorage 是 `Library/Application Support/<bundle>/RCTAsyncLocalStorage_V1/manifest.json`
（不是 Preferences plist；plist 里那两个 royce_* 是历史遗留，误导过一次）。用临时探针把错误写进
AsyncStorage 后拿到根因：

    @royce_probe = error Error: Internal error when a required entitlement isn't present.

即 **iOS Keychain 调用被拒（errSecMissingEntitlement，iOS 26 模拟器上出现）**。原实现在写会话**之前**
先做 `Keychain.resetGenericPassword` 清理旧机组密码，Keychain 抛错被 catch 吞掉 → 整个 guest 会话
（含 AsyncStorage 写入）被丢掉 → 下次启动回到登录页。

修复（sessionStore.saveIdentitySession）：**先写会话，清理动作放最后且各自 best-effort**；
`clearSession()` 的 Keychain 重置同样改为 best-effort，避免登出 thunk 被拒。
回归测试：`guestLogin.test.tsx` 新增 "still stores the session when the device Keychain refuses"，
已用「临时还原旧顺序」验证它在旧代码上 **FAIL**、在新代码上 PASS。

设备证据（修复后）：
- `.maestro/guest_login.yaml` PASS；随后不 clearState 直接重启 —— `.maestro` 临时用例
  `/tmp/guest_resume.yaml` PASS：回到 Home 且 `home-guest-strip` 在、`login-screen` 不在。
- app 容器 manifest.json 实测：`@royce_auth_mode = guest`，
  `@royce_identity = {"provider":"guest","displayName":null,...}`。
- 截图新增 `crew-app-guest-login-Ver1-05_relaunch-guest-session-restored.png`。

## 第二轮（Ryan 2026-09-12 看真机后）
1. `Log in` → **`Login As Crew`**（旁边是 guest 这条不同性质的入口，旧文案没说清登录的是"机组"）。
2. **Login as Guest 改成与 Login As Crew 完全同一个按钮**：JSX 直接用 `style={[styles.loginBtn, styles.guestBtnGap]}`，
   只差 marginTop。填色/圆角/高度/字重/字色单一来源，两者不会再各自漂移（新增测试断言 resolved style 相同）。
3. 删掉 guest 按钮下面的说明行（"No airline sign-in needed …"）。空态与 Profile 的
   "Sign in with your airline" 已经解释了 guest 模式。
- 验证：`npx jest` 70 suites / 666 tests PASS；`npx tsc --noEmit` PASS；
  `.maestro/guest_login.yaml` PASS；APP_VERSION 118 → 119。
- 截图：`docs/assets/screenshots/crew-app/crew-app-guest-login-Ver2-00_login.png`
  （像素核实：两个按钮填色均 `#3d7367`、均 51pt 高 × 339pt 宽；guest 按钮下方卡片内无任何文字；
  OCR 读到 "Login As Crew" / "Login as Guest" / "Or"）。
