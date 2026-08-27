# PBS Avoid Pairing 日历隐藏设计

## 背景

当前 PBS bidding calendar 的 Pairing Number / Pairing ID bid 会由 `pbs-server` 生成 `pairing_bid` calendar event，再由 `pbs-portal` 的共享 `BIDDING CALENDAR` 和 Dashboard 日历渲染。

历史上 `2026-05-22-pbs-pairing-avoid-calendar-red-design.md` 曾定义过：

- `Award Pairing Number` 显示为蓝色。
- `Avoid Pairing Number` 显示为红色。
- 该规则通过 `actionId = 2 -> red` 实现。

现在产品规则已更新：**Avoid Pairing Number 不应出现在日历里**。这不是只取消红色，而是 Avoid 对应的 pairing bid calendar bar 在 Pairing 左侧共享日历和 Dashboard 日历中都不展示。

本设计取代 2026-05-22 的 Avoid 红色日历展示规则。

## 目标

- `Avoid Pairing Number` / `Avoid Pairing ID` 不在 `BIDDING CALENDAR` 左侧共享日历中显示。
- Dashboard 的 `BIDDING CALENDAR` 同样不显示 Avoid pairing bid calendar bar。
- `Award Pairing Number` 继续按现有规则显示为普通 pairing event。
- 避免 per-page 判断，让 Dashboard、Pairing、Days Off、Tier、Reserve 等共享日历入口看到同一份后端日历语义。
- 保持保存数据、右侧 Pairing properties、Existing properties、bid summary、algorithm export 不受影响。
- 不新增数据库表、不改 schema、不迁移历史 bid 数据。

## 非目标

- 不删除用户已经保存的 Avoid bid。
- 不改变 Avoid bid 在 Pairing 右侧 property 列表、编辑弹窗、Existing / Saved 状态中的存在。
- 不改变 pairing search、pairing pool count、pairing occurrence list、算法导出中的 Avoid 语义。
- 不把 Avoid 改成蓝色、灰色或其他颜色显示。
- 不为 Dashboard 单独写隐藏逻辑。

## 当前问题

当前后端在 `pbs-server/src/services/calendar/bidding-calendar-pairing-events.ts` 中按 `row.actionId` 计算 event tone：

- `actionId = 2` 表示 Avoid。
- `Avoid` 被映射为 `tone: "red"`。
- 前端 mapper 接受 `red`，并把它渲染成日历条和 tier cell。

这会导致用户在 Pairing 页面选择 Avoid 后，左侧日历出现红色条。由于当前产品语义中 Avoid 不应该在日历可视化展示，这个红色条会误导用户，以为日历需要表达“避开某个 pairing 的占用”。

## 方案对比

### 方案 A：前端按页面隐藏 Avoid / red event

在 Dashboard 或 `DashboardSchedulePanel` 中过滤 `tone: "red"` 或 `metadata.actionId = 2`。

优点：

- 改动看似小。

缺点：

- 后端仍返回不应展示的 event，接口语义继续误导。
- Dashboard、Pairing 左侧共享日历、未来其他消费者容易出现不一致。
- `red` 仍保留为 Avoid 日历语义，后续开发容易再次误用。

结论：不采用。

### 方案 B：后端生成日历事件时跳过 Avoid

在 `buildPairingEvents` 生成 pairing calendar event 时，遇到 `actionId = 2` 的 Avoid Pairing Number / Pairing ID bid，直接不生成 calendar event。

优点：

- 语义源头统一，所有页面自然一致。
- Dashboard 和共享左侧日历不需要分别判断。
- 不增加查询，不增加前端渲染成本；实际上减少了 event 数量。
- 更符合 PBS Portal 共享 `BIDDING CALENDAR` 的模块边界。

缺点：

- 需要更新后端和前端既有红色 Avoid 测试。
- 需要清理或替换 2026-05-22 的红色设计预期。

结论：推荐采用。

### 方案 C：后端继续返回 Avoid，但增加 `hidden` 或 `display=false`

保留 event，同时让前端根据显示标记隐藏。

优点：

- 保留了 Avoid event 元数据。

缺点：

- 当前没有任何页面需要这个隐藏 event。
- 引入新契约和兼容分支，增加后续维护成本。
- 仍可能被某个消费者误渲染。

结论：不采用。

## 推荐设计

采用方案 B：**后端不再为 Avoid Pairing Number / Pairing ID 生成 bidding calendar event**。

实现时应把过滤放在 `pbs-server` 的 calendar event 构建层，而不是在 `pbs-portal` 页面层处理。推荐在 `buildPairingEvents` 处理每个 `PairingBidRow` 时，先判断：

- 如果 `row.actionId === 2`，跳过该 row 的 calendar event 生成。
- 跳过时不记录 `missingPairingIds`。
- 跳过时不参与 overlap merge。
- 跳过时不产生 tier cell tone。

这样 Dashboard 与左侧共享 `BIDDING CALENDAR` 都会从同一个 API 响应中得到“没有 Avoid event”的结果。

## 前端设计

前端不新增页面级 Avoid 判断。

实施时应清理当前由 Avoid 红色展示引入的前端预期：

- 删除或改写 `bidding-calendar-mappers.test.ts` 中 “avoid pairing bid events to red schedule bars and tier cells” 的测试。
- 如果 `red` tone 在当前 PBS schedule 组件中只服务于 Avoid calendar event，应同步移除对应 mapper rank / type / class / contract 中的红色分支，避免后续开发误以为 calendar 仍支持 Avoid 红色语义。
- 如果实施前确认 `red` tone 已被其他真实功能使用，则保留通用 `red` tone，但必须删除 Avoid 触发 red 的路径和测试。

前端仍应能正常渲染：

- Award pairing event：蓝色。
- Prefer Off / Calendar Off：原有颜色。
- Weekend / muted：原有隐藏或弱化逻辑。

## 后端设计

后端应更新 `pbs-server/src/services/calendar/bidding-calendar-pairing-events.ts`：

- 移除或不再使用 `getPairingEventTone(actionId)` 的 Avoid 红色映射。
- 对 `actionId = 2` 的 Avoid row 直接跳过 calendar event 生成。
- 保持 `actionId = 1` Award row 继续生成 pairing event。
- 保持 specific-date occurrence 和 whole-month occurrence 的 Award 展示逻辑不变。
- 保持 day-off conflict 排除逻辑不变，但 Avoid row 不再参与 calendar event / conflict 展示。

后端 API 响应结果中不应包含 Avoid pairing bid event，因此 Dashboard 和共享左侧日历都不会显示 Avoid。

## 数据与兼容性

- 不做数据库 migration。
- 不删除历史 Avoid bid。
- 不改变 `pbs_bid_group.action_id` 的含义。
- 不改变 Pairing 页面右侧 property 的保存、编辑、删除能力。
- 不改变算法导出中 Avoid 的计数或评分语义。
- 不为旧红色显示保留兼容入口；Avoid 日历红色展示视为废弃行为。

## 性能

该改动不会增加数据库查询。

在后端尽早跳过 Avoid row 可以减少：

- occurrence 匹配计算。
- calendar event 数量。
- 前端 merge / layout / render 数量。

因此性能风险低，且方向上略有收益。

## 测试计划

### 后端单元测试

更新 `pbs-server/src/services/calendar/bidding-calendar-service.test.ts`：

- 将 “Avoid pairing bids map to red calendar events” 改为 “Avoid pairing bids do not produce calendar events”。
- 覆盖 `actionId = 2` 且 pairing occurrence 存在时，`events` 不包含对应 pairing bid event。
- 覆盖 Award + Avoid 混合时，只返回 Award 的 blue event，不返回 Avoid event。
- 覆盖 Avoid 不应进入 `missingPairingIds`。

### 前端单元测试

更新 `pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts`：

- 删除或替换 Avoid red schedule bar / red tier cell 断言。
- 保留 Award event 正常渲染测试。
- 如保留通用 red tone，应新增测试说明 red 不再由 Avoid 触发；如移除 red tone，应更新类型和样式测试。

### E2E / QA

新增或更新 PBS 人工测试用例，路径建议：

`docs/test-cases/pbs/pairing-calendar/2026-07-06-avoid-pairing-hidden-from-calendar.md`

测试要点：

1. 在 Pairing 页面添加 `Avoid Pairing Number`。
2. 保存后确认右侧 properties / Existing 中仍能看到该 Avoid bid。
3. 左侧 `BIDDING CALENDAR` 不出现该 pairing 的红色条，也不出现蓝色或其他颜色条。
4. 切到 Dashboard，确认 Dashboard `BIDDING CALENDAR` 同样不显示该 Avoid pairing bar。
5. 添加 `Award Pairing Number`，确认 Award 仍正常显示。
6. 混合 Award 和 Avoid 时，日历只展示 Award。

自动化 E2E 可根据现有 PBS Portal Playwright 基础补一条回归：

- 创建或定位可用 pairing。
- 添加 Avoid Pairing Number。
- 断言共享日历和 Dashboard 不出现对应 pairing event。
- 再添加 Award Pairing Number，断言 Award event 出现。

## 验收标准

- Pairing 页面选择 Avoid 后，左侧共享 `BIDDING CALENDAR` 不显示对应 pairing bar。
- Dashboard 不显示 Avoid pairing bar。
- Award pairing bar 仍正常显示。
- Avoid bid 本身仍保存、可编辑、可删除、可导出。
- 后端 API 不返回 Avoid pairing calendar event。
- 不存在 Avoid 红色日历展示的测试预期。
- 相关单元测试和 PBS Portal 回归测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动点集中在一个后端 event builder、一个前端 mapper/类型清理以及对应测试，拆分多 agent 的协调成本高于收益。
- Suggested split: 不建议拆分；由一个实现者完成后端、前端测试、QA 文档和验证。
- Write boundaries: 若必须拆分，后端只改 `pbs-server/src/services/calendar/*`，前端只改 `pbs-portal/src/features/dashboard/*` 与 shared schedule 类型；但两者契约耦合较强。
- Conflict risk: 中等，前后端都依赖 `PbsBiddingCalendarEventTone` 和 calendar event contract。
- Execution gate: 用户确认本 spec 后再进入实现；实现前对将修改的函数运行 GitNexus impact analysis。
