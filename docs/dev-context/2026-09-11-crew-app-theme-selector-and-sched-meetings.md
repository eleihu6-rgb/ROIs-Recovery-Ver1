# 开发上下文（2026-09-11）

> 手工记录（`./save-context.sh` 依赖的 `memory/.venv/bin/mempalace` 当前缺失，MemPalace 索引不可用）。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-11 16:45 PDT
- Wing：`live-server`
- Topic：`crew-app-theme-selector-and-sched-meetings`
- Title：Crew App 走查第三轮 — 主题色选择器、Schedule dock 浅色化、会议卡片（独立卡 / Join / 闹钟可关）、月份可往后翻
- Git branch：`feat/gantt/roundtrip-pairing-builder`

## 本轮对话上下文

Ryan 在对 J4002（ET）真机走查后又提了 4 条，本轮全部实现并真机验证：

1. **主题色选择器**（按 mock Ver9 的四个色块）：四种颜色可选、记住用户选择、并验证**所有元素**都跟随主题色。
2. **Schedule tab 的导航条底色太深**：改为「主题色的浅色版本」作背景（原先是固定深灰 `rgba(26,34,32,.9)`）。
3. **Schedule tab 的 iOS 日历活动**：
   a. 当天有飞行 duty 时，会议必须是**独立卡片**；非飞行日可混在当天卡片里（day off / standby 风格）。
   b. 恢复「加入 Teams 会议」链接。
   c. 恢复「会议闹钟」，并且可以点一下关掉。
4. **Bug**：Schedule 只能往前一个月看（`<`），不能往后翻 → 加 `>`。

## 逐条结论（勿反复推翻）

### 1. 主题色选择器

- `crew-app/src/theme/carrier.ts`
  - 新增 `THEME_PRESETS = ['sia','thai','emerald','graphite']`、`ThemePreset`、`THEME_LABELS`（与 mock swatch 标题逐字一致：Reference blue / Thai violet / Emerald / Graphite）、`isThemePreset()`。
  - 新增 `resolveTheme(chosen, airline)`：**显式选择优先，否则跟随航司**（ET→emerald、TG→sia、其它→sia）。
  - `altair` 仍然是登录页固定配色，**不参与选择**（登录页是品牌页，刻意不跟随主题）。
- `settingsSlice`：新增 `themePreset: ThemePreset | null`，持久化 key `@royce_theme`；`setThemePreset(null)` 会 `removeItem`（回到航司默认）；`loadSettings()` 里用 `isThemePreset()` 过滤脏值（例如以后删掉某个主题，老 key 不会让 app 无主题）。
- `V2Navigator`：`paletteFor(resolveTheme(chosenTheme, airline))` 提供 `CarrierContext` —— 这是**唯一的调色板入口**，所以换主题后所有页面（Home/Schedule/Global/Profile + 全部详情页）立即重绘，无需重启。
- 新页面 `crew-app/src/features/v2/AppearanceScreen.tsx`（`Profile ▸ Preferences ▸ Appearance`）：四个圆形渐变 swatch + 当前项打勾 + 航司默认项标注 "Your airline's colour"；有覆盖时底部出现 "Use airline default (Emerald)" 复位入口。
- `PreferencesScreen` 的 Appearance 行从静态 KvRow 改成 `NavRow`（`testID="row-appearance"`），右侧显示当前主题名 —— 与 mock 一致。

### 2. Schedule dock（导航条）

- `CarrierPalette` 新增 `dockLight`（主题色的浅色 tint）与 `dockInk`（主题深色 ink）；`PillDock` 在 **Schedule tab** 用 `dockLight` 作背景、未选中图标用 `dockInk`、选中 tab 用实心 `btn` + 白字。其它 tab 仍是磨砂玻璃（`rgba(255,255,255,.2)`）浮在渐变上。
- 结论：深灰固定色 **不要**再回来；浅色 tint 由 `themeCoverage.test.ts` 的对比度断言守住（亮度 > 0.4、比 `g3` 更亮、与 ink 对比度 > 4.5）。

### 3. 会议卡片

- `model.ts`：`DayMeeting` 增加 `startMs / joinUrl / alarmHhmm / muted`；`buildMonth()` 末尾新增可选参数 `meetingPrefs: { minutesBefore, mutedIds }`（有默认值，老测试调用不用改）；会议时间统一走「App 时区设置」（airport 模式下用事件自身时区，这是会议的「当地」等价物）；`cancelled` 事件不再出卡（与 `computeMeetingAlarms` 规则一致）。
- 新组件 `crew-app/src/features/v2/MeetingCard.tsx`：`MeetingRow`（行内用）+ `MeetingCard`（独立卡用）。Join 用 `Linking.openURL(joinUrl)`；闹钟 chip 显示 "Alarm 16:35"，点一下走 `meetingsSlice.toggleMeetingMute(id)`（会持久化 `@royce_meetings_muted` 并 `reconcileAlarms()` 真正删掉 iOS 闹钟），再点恢复。
- `ScheduleScreen`：飞行日 → 会议渲染成**独立卡片放在航班卡上方**（与 mock Ver10 的 `meetCard+flightCard` 一致）；非飞行日 → 会议行仍在该日卡片内部（`day off` / `standby` / `training`）。
- 无障碍：Join 的 `accessibilityLabel` = 可见文字 "Join meeting"，会议标题放 `accessibilityHint`；闹钟 chip 同理（label = "Alarm HH:MM" / "Alarm off"）。**这样 Maestro 的文案断言与屏幕文字一致**（上一版把上下文塞进 label，导致 `assertVisible: "Join"` 失败）。
- `PreferencesScreen` 的 dev 种子会议（`Add demo meetings (dev)`）现在写入两条带真实 Teams 链接的 notes —— 真机可以点 Join / 点闹钟。

### 4. 月份可以往后翻

- `ScheduleScreen` 头部新增 `sched-next-month`（`>`），与 `sched-prev-month` 组成 stepper；`shiftMonth(delta)` 处理跨年（12 月 +1 → 次年 1 月，1 月 −1 → 上年 12 月）。
- 布局：左端放一个 40pt 空 spacer 抵消右侧 bell 的宽度，标题才真正屏幕居中。

## 验证（本轮实测）

- `cd crew-app && npx tsc --noEmit` → PASS
- `cd crew-app && npx jest` → **48 suites / 481 tests PASS**（新增 `themeSelector.test.tsx` 8 条、`themeCoverage.test.ts` 3 条、`features/scheduleMeetings.test.tsx` 6 条）
  - `themeCoverage.test.ts` 是「所有元素跟随主题」的守护测试：扫描 `src/features/v2`、`src/components/v2`、`src/features/notifications`、`src/features/settings`，除白名单（卡通头像 / 日程插画 / logo 金色 / 中性白黑 alpha）外**不允许出现硬编码颜色**；新增硬编码色会直接 fail，必须写明理由再加白名单。
  - 渲染层断言：四套调色板分别渲染 gradient/card/button/dock/context，并断言**别的主题颜色一个都不许出现**（含 SVG gradient 的 ARGB 解码）。
- 真机（iPhone 17 模拟器 + iOS 26.5，ET `J4002` / `Pier2026`）：
  - `maestro test crew-app/.maestro/et_j4002_theme_selector.yaml` → 86 步全过；24 张截图 `docs/assets/screenshots/crew-app/theme-Ver1-*.png`（含四套主题 × Appearance/Preferences/Home/Schedule/Profile，以及冷启动后主题仍为 Graphite 的证明）。
  - `maestro test crew-app/.maestro/et_j4002_sched_meetings.yaml` → 月份前后翻（Sep↔Oct/Aug）、独立会议卡 + Join + Alarm chip、点击 silence/re-arm。
- 产品侧结论（对 Ryan）：
  - 主题选择只作用于**登录后的 app**；登录页是 Altair 品牌页，固定配色。
  - 会议在飞行日独立成卡（在航班卡上方），非飞行日混排。

## 未做 / 风险

- 本轮改动**未 commit、未 push**（等 Ryan 明确指示；上一轮"merge to main and push"只针对上一批）。
- 「加入会议」的真机证据：flow 最后点击 Join 会跳到 Teams/Safari，因此断言只验证按钮存在 + jest 断言 `Linking.openURL(url)` 被调用。
- 主题选择是**单机偏好**（AsyncStorage），没有同步到 live-server；换手机/重装会回到航司默认色。
- iOS 模拟器 keychain 不能保存 ET session（冷启动会回登录页，日志有 entitlement warning），所以冷启动验证里需要再登录一次，这是模拟器限制而不是 app bug。
