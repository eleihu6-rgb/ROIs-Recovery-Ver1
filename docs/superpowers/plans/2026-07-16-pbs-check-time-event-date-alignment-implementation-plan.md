# PBS Check-In / Check-Out Time 事件日期统一实施计划

## 目标

按已批准的设计，将 `Pairing Check-In / Check-Out Time` 的日期限制与 `Airport Preference` 统一为 `LIMIT TO EVENT DATE`：默认 Any，开启后支持 Specific Dates 多选与 Date Range，并完整覆盖旧数据、搜索和算法导出。

设计依据：

- `docs/superpowers/specs/2026-07-16-pbs-check-time-event-date-alignment-design.md`

## 实施顺序

### 1. 共享 contract

- 定义共享 `PbsPairingEventDateScope` / Portal 对应类型。
- Airport 与 Check-Time 的 `dateScope` 使用同一 union。
- normalizer 只产生 `specific_dates` / `date_range`。
- 测试旧 `specific_date` 仅在读取边界归一化为单元素数组。

验证：contract tests、TypeScript build。

### 2. 服务端读取、保存与展示

- 更新 lineholder deserialize / clone / serialize / summary。
- 更新 Pairing validation 与 legacy crew-bid import。
- 保持旧格式兼容限制在 Check-Time 读取边界。
- 日期按 periodCode 自然月校验。

验证：lineholder、Pairing validation、crew-bid import focused tests。

### 3. Search 与算法导出

- Check-In 取最早 brief 事件及其 `dep_arp` 时区。
- Check-Out 取最晚 debrief 事件及其 `arv_arp` 时区。
- 日期与时间均按同一事件机场本地时区；非法/缺失 zone fallback UTC。
- `specific_dates` 使用参数化 `ANY(date[])`，range 使用参数化 `BETWEEN`。
- `PAIRING_SCORE` 继续复用 `buildPreviewCondition`，补多日期、范围、Check-In/Out 与跨午夜测试。

验证：pairing search condition builder、pairing-score-export focused tests。

### 4. Portal UI

- 新建最小共享 Optional Event Date editor，避免改动正在开发的 slider primitive。
- Check-Time 用 switch 替换 DATE 三段控件。
- Airport 日期区改为复用共享 editor，保持现有用户行为。
- 更新有效性、summary、mapper 和 component tests。

验证：Check-Time、Airport editor tests；Pairing/Search page tests。

### 5. E2E 与 QA

- 更新真实 Pairing UI Playwright：默认关闭、多日期、范围、关闭清理、保存回显。
- 覆盖 Search Pairings 复用路径。
- 新增 QA 文档。

验证：目标 Playwright spec。

### 6. 交付检查

- focused tests 先行。
- `pbs-portal` test / lint / build。
- `pbs-server` test / build。
- `npm run check:ui`。
- `git diff --check`。
- GitNexus `detect_changes --scope unstaged`，确认影响范围符合预期。

## 工作树保护

当前已有 Airport Preference layover slider 相关未提交改动，涉及 Airport editor、shared preference primitives、Search service 和同一 E2E 文件。本功能：

- 不回滚、不重写这些改动；
- 新共享日期组件放在独立文件；
- 对重叠文件只做日期区的最小增量；
- 最终 diff 与测试结果区分本功能和既有未提交工作。
