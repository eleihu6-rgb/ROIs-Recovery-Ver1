# 开发上下文（2026-09-11 · 第二轮）

> 手工记录（`./save-context.sh` 依赖的 `memory/.venv/bin/mempalace` 当前缺失，MemPalace 索引不可用）。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-11 17:20 PDT
- Wing：`live-server`
- Topic：`crew-app-destination-view-and-flight-ops`
- Title：Crew App — 目的地全屏大图（可左右滑）+ ETD/ETA·ATD/ATA·酒店·登机口·接送信息，顺序按真实事件排列
- Git branch：`feat/gantt/roundtrip-pairing-builder`

## 本轮对话上下文

Ryan 在主题色那一轮之后追加：

1. Home ▸ Explore your destinations 点图片 → 近似全屏放大城市照片（Ver1 风格），补 ETD/ETA、ATD/ATA、HOTEL/GATE 等信息；有 layover 时 mock 酒店信息。
2. 全屏页支持左右滑动切换城市。
3. Schedule 的 Trip Details 保留原航班信息，并补 ETD/ETA、ATD/ATA、HOTEL、GATE、pick up、drop off、机队、机号（aircraft registration）。
4. 顺序按真实事件：先 STD → 再 ETD → 再 ATD；先 wake up → 再 leave home → 再 check-in。
5. 「add API to pull these info from live if possible」。
6. mock pick up / drop off 相关信息：车型、车牌、司机、联系电话等。

## 逐条结论（勿反复推翻）

### 1. 真实数据：live-server 已经把能给的都给了

- `live-server` `mobile-roster-service.ts`：`MobileRosterFlight` 新增 6 个字段
  `register / estStartUtc / estEndUtc / actStartUtc / actEndUtc / blockMinutes`，
  SQL 从 `flight` 表读取 `f.register / f.est_dep_dt_utc / f.est_arv_dt_utc / f.act_dep_dt_utc / f.act_arv_dt_utc / f.blk_min`（用同样的 `to_char(... 'Z')` 防时区漂移；可选列用新的 `optionalUtcString`）。
- crew-app：`EkRosterFlight`（+ zod schema 可选字段）→ `normalizeF8RosterEnvelopeData` → `mapEkRosterToTrips` → `TripLeg.register / estDepUtc / estArvUtc / actDepUtc / actArvUtc / blockMinutes`。
- 结论：**ETD/ETA、ATD/ATA、机号、block time 都是真实 live 数据**；ETD/ETA 在航司没给 estimate 时回落到计划时间（UI 不写 "live estimate"）。

### 2. 仍然是 mock 的（以及为什么）

- **登机口 / 航站楼**：`flight` 表没有 gate/stand/terminal 列 → 确定性 mock（`mockGate(airport, fltNumber)`），UI 标 `expected`。
- **酒店**：live schema 里确实有 `hotel` 表（airport / hotel / phone / address / pick_up / drop_off / fleet），`pairing_segment.duty_hotel_id` 也有外键——但 SIT 数据库里 `select count(*) from hotel` = **0**，所以现在用确定性 mock（按机场给可信酒店名），UI 标 `expected`；有真实 `hotelBooking`（TG 门户抓取）时优先用真实值并标 `booked`。
- **接送（pick up / drop off）**：车型 / 车牌 / 司机 / 联系电话在任何表里都不存在 → 全部 mock：
  `mockTransfer()` / `hotelTransfer()`（车牌、司机名、按机场的国家码生成电话）——同样是 deterministic，UI 标 `expected`。
- 所有 mock 都在 `crew-app/src/features/travel/opsInfo.ts` 顶部注明 REAL vs MOCKED，后续接 NOC 数据时只改这一个文件。

### 3. 顺序（Ryan 明确要求，勿改回）

- 航班三段时间：**STD/STA → ETD/ETA → ATD/ATA**（计划 → 预计 → 实际），目的地页与 Trip Details 都是这个顺序。
- 值勤标记：**Wake up / Get Ready → Leave home → Check-in / report**。
- ATD/ATA **只在实际时间已经过去**才显示（`act_*` 在计划航班里会被填成计划值，直接显示会变成假“实际”）。

### 4. 目的地全屏页 `DestinationScreen.tsx`

- Home 卡片改为 `nav.navigate('Destination', { index })`（原来直接跳 Trip Details），列表由共享 hook `useV2.useDestinations(now)` 提供——**Home 与全屏页用的是同一份列表**，所以点第 3 张就是第 3 页。
- 结构：`FlatList horizontal pagingEnabled` 只渲染照片页；**详情面板与头部是单实例**（跟随当前页），避免重复 testID / 读屏重复；底部面板 `PANEL_H = 300` 可上下滚动。
- 面板内容：FLIGHT（STD/STA、ETD/ETA、ATD/ATA、Aircraft:fleet·tail、Block、两端 terminal/gate）→ LAYOVER HOTEL（名称/地址/check-in-out/班车/电话）→ TRANSFER（pick-up/drop-off 时间、车型、车牌、司机、电话）→ 「View trip details」。
- 「Day return — no hotel」用于当天往返（不再假装有酒店）。

### 5. Trip Details 新增行

按事件顺序：Wake up → Leave home → Check-in/report → STD → STA → ETD/ETA → ATD/ATA → Gate(出发/到达) → Aircraft(fleet · tail) → Block time →（若从外站起飞）Hotel pick-up / Airport drop-off / Transfer(车型·车牌) / Driver(司机·电话)；最后是 Layover 卡片（真实 booking 或 mock 酒店 + 接送）。

## 验证

- `cd live-server && npx tsc --noEmit` → PASS；`npx vitest run src/__tests__/services/mobile-roster-service-et.test.ts` → PASS（新增断言：register/est/act/blockMinutes 透传，缺值保持 null）。
- `cd crew-app && npx tsc --noEmit` → PASS；`npx jest` → **50 suites / 493 tests PASS**
  - 新增 `__tests__/features/destinationView.test.tsx`（opsInfo 单元 + 全屏页渲染 + 左右滑翻页 + 行顺序 + 跳转 TripDetails）
  - 新增 `__tests__/features/tripDetailsOps.test.tsx`（事件顺序 wake up→leave home→check-in→STD→ETD→ATD；真实 tail/block；mock 酒店与接送）
  - `themeCoverage.test.ts` 仍然守住「没有硬编码颜色」（本轮它真的抓到 DestinationScreen 面板的偏白 tint，已改成中性白 alpha）。
- 真机（iPhone 17 模拟器，ET J4002 / Pier2026）：`maestro test crew-app/.maestro/et_j4002_destination_view.yaml`，截图 `docs/assets/screenshots/crew-app/dest-Ver1-*.png`。

## 追加轮次（同日稍晚）：Ver1 样式 + 顺序修正 + 接送信息 + TG 真实走查

Ryan 看过第一版后追加了三点，已全部落地：

### 1. 样式改成 Ver1（文字写在图片上）

- **去掉底部白色大面板**（Ryan: "big white box not fits the picture"）。现在整屏就是照片，底部一层 SVG 渐变压暗（`Scrim`，黑 0 → 88%），信息以白字直接写在图片上——与 mock Ver1 的 `.dest .grad`（`linear-gradient(180deg, rgba(20,50,80,.05) 30%, rgba(15,35,60,.85))`）同一语言。
- 层级：照片页（FlatList 分页）→ 渐变遮罩 → 顶部浮层（返回 / 圆点 / `1 / N` / Trip details）→ 可滚动信息块（`maxHeight: 62%`）。
- 只保留顶部 "Trip details ›" 一个入口（面板可滚动，所以 CTA 不能放在底部，否则又要滚动才能点到）。

### 2. 顺序（Ryan 明确要求，勿改回）

- 航班：**STD/STA → ETD/ETA → ATD/ATA → Aircraft → Block → Gate（两端）**。
- 值勤：**Wake up / Get Ready → Leave home → Check-in / report**，然后才是航班段。
- 顺序由测试守住：`destinationView.test.tsx`（页面行序）与 `tripDetailsOps.test.tsx`（Trip Details 行序）。

### 3. 接送（pick up / drop off）mock

- `mockTransfer()` 生成：pick-up 时间、drop-off 时间、车型（Toyota Hiace / Ford Transit / Mercedes Vito / Coaster）、车牌、司机姓名、联系电话；`hotelTransfer()` 用于「到达后进酒店 / 离开酒店去机场」这一侧。
- **地区相关**：电话国际码与车牌前缀按**中转机场**取（DIAL_CODES / ISO_BY_DIAL）——上海显示 `+86 … / CN …`，不再出现埃塞俄比亚号码；酒店电话同理。
- 酒店名按机场给可信预设（ET：ADD/NBO/BJM/DMM/DAR/KGL/MPM/MGQ/GIZ/HRE/LUN/LOS/ACC/JNB/ZRH/LHR/CAN/HKG；TG：BKK/PVG/PEK/NRT/NGO/ICN/SIN/CGK/DPS/DAC/OSL/ARN/DXB/DEL），UI 标注 `expected`。

### 4. 关键数据结论（J4002 · Sep 2026）

从模拟器 AsyncStorage 读回的**真实 ET 排班**说明：

- `ET422/ET423 ADD→DMM→ADD`（13 Sep）是**当天往返**：到 DMM 22:55Z、23:55Z 就走 → 页面正确显示 "Day return — no hotel"（不是 bug）。
- 真正的过夜在中转站：`ET819/ET818 ADD→MPM→ADD`（29–30 Sep）与 `ET378/ET377 ADD→MGQ→ADD`（24–25 Sep）。酒店判定逻辑因此重写为「找中转停留点 + 次日才走才算过夜」（`layoverStop()`），并有单测覆盖。

### 5. TG（Thai Airways）真机走查

- `.maestro/tg_destination_view.yaml`：先显式选 TG（app 会记住上次航司，clearState 后仍是 ET，直接点 Log in 会因空 crew id 失败——这是本轮踩到的坑），登录 → Home → 目的地卡 → 全屏页 → 左右滑 → 酒店/接送 → Trip Details，全绿。
- 截图 `docs/assets/screenshots/crew-app/tgdest-Ver1-*.png`（PVG 上海为落地城市，酒店 `Crowne Plaza Shanghai Pudong Airport`、车牌 `CN …`、电话 `+86 …`）。
- TG crew 35459 的排班是 portal 抓取（8–9 月），酒店 booking 为空，所以 TG 也走 mock 酒店分支。

## 追加轮次 2：紧凑化 + 线性图标 + Upcoming Alarms 分组

Ryan 再提两条，已落地：

### A. 城市大图上的文字「紧凑 + 线性图标」

- 信息块上限从 62% 降到 **54%**，行距 6pt；不再用 label/value 两栏 + 分隔线，改成 **一行一个 icon + 文字**（`Line` 组件）：
  `[plane] STD 21:55L → 01:55L +1` · `[clock] ETD … · ETA …`（没有更新时显示 `ETD / ETA · no update yet` 灰色）· `[clock] ATD … · ATA …`（只有飞过才出现）· `[checkin] Gate T2·D20 → T1·C21 expected` · `[jet] 7M8 · ET-AVK · 4h 00m`。
- 酒店/接送合并成 5 行：`[bed] 酒店名 expected` · `[house] 地址` · `[clock] Check-in … · out … · 1 night` · `[car] 车型 · 车牌 expected` · `[user] 司机 · 电话 · pick-up … · drop-off …`；无过夜时只留 `[bed] Day return — no hotel`。
- 新增两个线性图标：**bed**（酒店）、**car**（接送），与既有图标同一 24 网格 / 1.6 描边（`components/v2/icons.tsx`）。
- 顶部只保留一个 `Trip details ›` 胶囊入口（信息块可滚动，CTA 放底部会点不到）。

### B. Trip Details 同样「线性图标」

- `KvRow` 新增可选 `icon`（`PageShell.tsx`），Trip Details 每行都带上线性图标：`alarm`(Get Ready/Wake Up) → `run`(Leave home) → `checkin`(Check-in/report) → `plane`(STD/STA) → `clock`(ETD/ETA、ATD/ATA) → `checkin`(Gate) → `jet`(Aircraft · Block) → `car`/`user`(接送) → `bed`/`house`/`moon`/`headset`(酒店)。
- 顺带合并了两行冗余：Gate 出发/到达合成一行，Aircraft 与 Block time 合成一行（信息不减）。

### C. Upcoming Alarms（Home ▸ 闹钟）按航班分组

- 之前每条闹钟都重复一遍航班（"Get Ready · TG662 BKK – PVG" / "Leave Home · TG662 BKK – PVG"）。现在 **一个 duty 一个组头**：`TG662  BKK → PVG` + `15 Sep 2230 · Asia/Bangkok`，下面三行紧凑闹钟：`[alarm] Get Ready 20:30` · `[run] Leave Home 21:30` · `[checkin] Check-in 22:30`。
- `groupAlarmsByFlight()` 是纯函数（key = 航班号 + dep + arv + check-in 时间戳），同航班不同日期不混组；分组数 / 闹钟条数显示在 section 标题上；会议列表也换成同样的紧凑行。
- 测试：`__tests__/features/upcomingAlarms.test.tsx`（分组、跨日期不合并、缺 leaveHome 时少一行、屏幕上航班号只出现一次）。

## 未做 / 风险

- 本轮改动**未 commit、未 push**（等 Ryan 指示）。
- 酒店/登机口/接送仍是 mock（原因见上）；`hotel` 表一旦有数据，可把 `hotelFor()` 换成 API 返回值即可（接口已经能带 `duty_hotel_id`，只是当前为空）。
- 目的地列表上限 6 个、按机场去重，与 Home 卡片一致；跨月（下个月的目的地）暂时不显示。
