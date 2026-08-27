# PBS Flight Legs per Duty 区间与事件日期统一实施计划

## 目标

按已批准设计实现 `Flight Legs per Duty`：支持 `< / = / > / Between`、共享 `LIMIT TO EVENT DATE`、duty 开始机场本地 check-in 日期、FLY-only 计数及旧 `stepper` 兼容。

设计依据：

- `docs/superpowers/specs/2026-07-16-pbs-flight-legs-per-duty-between-event-date-design.md`
- `docs/superpowers/specs/2026-07-16-pbs-check-time-event-date-alignment-design.md`

## 实施顺序

### 1. Contract 与 catalog

- 增加 `PbsFlightLegsPerDutyBid`。
- 为 property definition 增加可选 `numericBounds`，只在 property 107 使用。
- property 107 的 default bid 改为专属合法 payload，operators 增加 `Between`。
- normalization 仅对 property 107 兼容旧 `stepper / stepper-range`。

验证：contract/catalog focused tests、Portal/Server build。

### 2. Portal editor

- Flight Legs editor 使用独立 draft，避免未完成值进入严格 payload。
- 单值 operator 显示一个输入；Between 显示 From/To。
- 复用 `OptionalEventDateScopeEditor`。
- 更新 validity、summary、clone/mapper 和 Search Pairings 回显。

验证：editor、Pairing page、Search Pairings focused tests。

### 3. Server 保存与回显

- 更新 route schema、property validation。
- 更新 lineholder clone / serialize / deserialize / format。
- 旧 stepper 缺失 operator 归一化为 `=`；非法历史值拒绝重存。
- 日期验证复用共享 Event Date 规则。

验证：validation、lineholder、route focused tests。

### 4. Search 与算法导出

- property 107 按 duty 建立候选集合。
- Event Date 复用 Check-In event-date expression。
- `FLT/FLY` 计作 FLY；`DH/DHD/TRN/未知` 不计；Deadhead-only duty 保留为 0 legs。
- Any/Every 与 Between 使用 spec 确认的闭区间语义。
- Pairing preview、Search Pairings 和 `PAIRING_SCORE` 复用同一条件构造。

验证：condition builder 与 pairing-score-export focused tests。

### 5. E2E 与 QA

- 更新真实 Pairing UI Playwright，覆盖 Between、多日期、范围、关闭清理和回显。
- 覆盖 Search Pairings 同一 editor。
- 新增 Flight Legs 手工 QA 文档。

验证：目标 Playwright spec。

### 6. 交付门禁

- focused Portal/Server tests。
- `pbs-portal` lint/build。
- `pbs-server` build。
- `npm run check:ui`。
- `git diff --check`。
- GitNexus `detect-changes --scope unstaged`。

## 工作树保护

当前工作树同时存在 Airport Preference、Check-Time Event Date 与 Pairing Preference 的未提交改动。本任务：

- 不回滚、不覆盖、不格式化无关区域；
- 直接消费已经存在的共享 Event Date contract/component；
- 对重叠文件只修改 Flight Legs 分支；
- 每次修改重叠文件前重新读取当前内容；
- 不替其他任务提交代码。
