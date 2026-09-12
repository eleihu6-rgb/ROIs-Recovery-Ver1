# 开发上下文（2026-09-11 · Crew App 告警页重做 + Home 打磨）

> 手工记录（`./save-context.sh` 依赖的 `memory/.venv/bin/mempalace` 当前缺失）。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-11 21:45 PDT
- Wing：`live-server` + `crew-app`
- Topic：`crew-app-alerts-before-after-and-home-polish`
- Git branch：`feat/gantt/roundtrip-pairing-builder`（**未 commit、未 push**）
- 触发：Ryan 在模拟器上看到推送出来的 Alerts 页，提出 3 点 + “polish home tab”

## Ryan 的原话（勿反复推翻）

> polish home tab, alert
> 1. no way to return to home
> 2. plain text no design
> 3. for absence msg or duty change mes, design a before vs after style

## 根因（为什么 Alerts 是“裸文本”）

- v2 把 `NotificationsScreen` 当作 stack 屏幕 push（`V2Navigator` 的 `Alerts`），
  但 `headerShown: false`，而该屏幕自己没有返回控件 → **进去出不来**（只剩 iOS 侧滑）。
- 该屏幕仍是 legacy 皮肤（`colors.*` + 白底 + `INFO` 文字标签），与 v2 主题语言脱节。
- `crew_notification` 表早就有 `payload jsonb not null default '{}'`，
  `appendNotification()` 也一直在写，但 **读路径的 COLUMNS/DTO 把 payload 丢掉了**，
  所以 App 只能拿到 `body` 那句话 → 只能平铺文字。

## 数据契约（新增，勿随意改字段名）

`crew_notification.payload`，`notif_type = 'roster_change'`：

```json
{
  "kind": "absence",
  "absenceId": 3,
  "absenceType": "sick",
  "assignment": "ILL",
  "fromDate": "2026-09-11",
  "toDate": "2026-09-11",
  "removedPairingIds": [151529],
  "before": [
    { "pairingId": 151529, "date": "2026-09-11",
      "legs": [ { "fltNum": "ET895", "dep": "ADD", "arv": "BJM",
                  "std": "2026-09-11T14:15:00.000Z", "sta": "2026-09-11T17:00:00.000Z",
                  "register": null, "fleet": "7M8" } ] }
  ],
  "after": [
    { "date": "2026-09-11", "assignment": "ILL", "label": "Sick leave", "base": "ADD" }
  ]
}
```

- `before[].date` / `after[].date` = **机组基地当地日**（不是 UTC 日）；
- `before` 在事务内、soft-delete **之前**读取（`readRemovedDuties()`）；
- DTO 永远返回对象，历史行/异常值归一成 `{}`（App 侧回退成 body 文案）。

## 改动清单

### live-server

| 文件 | 改动 |
| --- | --- |
| `src/services/crew-notify/crew-notify-service.ts` | `COLUMNS` 读 `payload`；`CrewNotificationDto.payload`；`toPayload()` 归一化成对象（`{}` 兜底） |
| `src/services/absence/crew-absence-service.ts` | 新增 `readRemovedDuties()`（roster_flight ⋈ flight，事务内 soft-delete 前快照）+ `localDateOf()`；payload 增加 `kind/absenceType/assignment/before/after` |
| `src/services/absence/__tests__/crew-absence-service.test.ts` | 断言 payload 形状：`before` 一条配对 6 段、`date` 为 ADD 当地日、`after` 每天一条 ILL |
| `src/services/crew-notify/__tests__/crew-notify-service.test.ts` | 断言 payload 透传 + `null`/非对象归一成 `{}` |

### crew-app

| 文件 | 改动 |
| --- | --- |
| `src/features/notifications/notificationsApi.ts` | `NotificationType` 增加 `roster_change`；notification schema 增加 `payload`（默认 `{}`） |
| `src/features/notifications/rosterChange.ts` **(新)** | 纯解析/格式化：`parseRosterChange`、`formatDay`、`formatLegRoute`、`formatLegWindow`、`formatAfterDuty`、`describeRosterChange` |
| `src/features/notifications/NotificationsScreen.tsx` **(重写)** | v2 皮肤（GradientScreen + carrier palette + 线性图标）；返回键 `alerts-back`；卡片式列表；`BEFORE → AFTER` 区块；每行一个 `accessibilityLabel` |
| `src/features/v2/HomeScreen.tsx` | 打磨：`DOCK_CLEAR` 110→150，目的地卡 215→172，`sec/greet/trip/qa` 间距收紧 |
| `src/version.ts` | `APP_VERSION` 109 → 110 |
| `__tests__/features/rosterChange.test.ts` **(新)**、`__tests__/features/NotificationsScreen.test.tsx` | 12 个新/改断言 |
| `.maestro/et_j4002_alerts.yaml` **(新)**、`.maestro/et_j4002_absence.yaml` **(新)** | 真机流程 |

## 关键实现决定（勿反复推翻）

- **BEFORE → AFTER 用两栏**，不再是句子；`before` 的航班号带删除线（dimmed），
  `after` 用主题按钮色。中间一个 `chev` 图标（本身已指向右，**不要再 rotate**）。
- `before` 的 meta 行只放 **日期 + 时间窗**：之前带 `7M8 · ET-AVK` 会在半宽列里换行，
  出现 `· 7M8` 掉行；飞机注册号对“哪个 duty 变了”不是必要信息。
- 时间走**共享** `formatLegTime`（`src/features/settings/timeFormat.ts`），
  跟随机组的 Time zone 模式（默认 `airport`）→ ADD 的 14:15Z 显示成 `17:15L`。
  新增 `toRosterUtcString()` 把 ISO-8601 转成 `parseRosterUTC` 认识的 `DD MMM YYYY HHMM`。
- 告警行是**一个** accessible Pressable，配 `accessibilityLabel`（`describeRosterChange`）：
  RN 会把子节点并进父元素，所以不写 label 的话读屏只会念一堆碎片。
  ⚠️ 副作用：**Maestro 无法断言行内文字**（只认外层 `notif-row` id），
  所以行内容由 jest + 截图守护，不要为此把 Pressable 改成 `accessible={false}`。

## 验证（实际命令与结果）

| 检查 | 结果 |
| --- | --- |
| `cd crew-app && npx jest` | **58 suites / 568 tests PASS** |
| `cd crew-app && npx tsc --noEmit` | PASS |
| `cd live-server && npx tsc --noEmit` | PASS |
| `cd live-server && npx vitest run src/services/absence src/services/crew-notify` | **15 tests PASS** |
| `npm run check:ui`（仓库根） | PASS — 0 hard violations（124 既有 warnings） |
| `maestro test crew-app/.maestro/et_j4002_alerts.yaml` | PASS（iPhone 17 / iOS 26.5 / ET J4002） |
| `maestro test crew-app/.maestro/et_j4002_absence.yaml` | PASS（表单 + 日期步进 + 预览，**提交前停止**） |
| 截图 | `docs/assets/screenshots/crew-app/alerts-Ver1-00_home-rest.png`、`alerts-Ver1-01_roster-change-before-after.png`、`alerts-Ver1-02_home-scrolled-clear.png`、`crew-app-absence-Ver1-00_form.png`、`crew-app-absence-Ver1-01_filled-before-submit.png` |

**注意**：`cd live-server && npx vitest run`（全量）本机有 **72 个 DB 依赖用例失败**
（`42P01 relation does not exist`，scenario/gantt DB 集成用例），与本次改动无关；
本次涉及的两个目录全绿。

## 未做 / 风险（交接要点）

1. **未 commit、未 push**（Ryan 明确说 no push to git yet）。
2. 屏幕上用于验证的那条告警（`notif_id = absence-3`）的 `payload`
   是**从真实被 soft-delete 的 roster_flight 行回填**的（内容与新代码会写出的完全一致，
   因为历史行只存了旧的 4 个 key）。新提交的真实 absence 会由服务自己写全字段。
3. `crew_absence` 里仍留着测试用的 ET J4002 / 2026-09-11 记录（id=3，active），
   其配对 151529 的两段飞行仍是 `is_deleted=1`，并插入了 1 条 ILL。**没有清理。**
   要重跑同日 absence 会 409。需要清理请先确认（这是 SIT 共享库）。
4. Home 的 “See all”（Explore your destinations 右侧）仍然是**点不动的死链接**，
   本轮没动（没有“全部目的地”页面）。要么去掉，要么给一个落点。
5. 只验证了 ET（J4002）一个航司；TG/PR 未跑（告警页是 palette 驱动，
   `themeCoverage.test.ts` 守住没有硬编码颜色，但没有第二个航司的真机截图）。
6. `live-server/src/routes/crew-notify/crew-notify.ts` 的公开路由
   `POST /api/crew-app/v1/absence` 之前已注册；本次没有改路由层。
