# PBS Pairing / Days Off 质量审计与交互反馈优化设计

## 状态

- 日期：2026-05-06
- 模块：`pbs-portal`、`pbs-server`
- 状态：已确认并实施

## 背景

近期 PBS Pairing 已补齐多项 AA 对齐能力，包括 Pairing Number 日期添加、同日期多个 pairing 合并展示、左侧日历蓝色 pairing bid 的 Tx 编辑等。用户反馈现在需要做一次质量审计，重点是性能、代码规范、无用代码残留、接口耗时，以及操作时的 loading / disabled / message 体验。

Days Off 之前也改过左侧日历逻辑，本轮顺带检查，但不把 Days Off 右侧规则面板的 Tx autosave 模式一起重构，避免牵连 `RuleBidRightPanel` 的通用行为。

## 目标

1. Pairing 操作有明确的保存中状态、禁用状态和 message 提示。
2. Pairing 右侧 `EXISTING PAIRING PROPERTIES` 点击 Tx 时不再静默 autosave，而是立即保存并反馈成功/失败。
3. Pairing 左侧日历添加、编辑 Tx、清空 Tx 删除 bid 时都有 loading、disabled、message。
4. Days Off 左侧日历保存失败不再静默吞掉，至少给用户明确错误反馈。
5. 优化 `/api/bidding-calendar/current` 的已知性能风险，尽量稳定在 2 秒内。
6. 对本轮触达代码做可读性和简化审计：减少重复状态、重复 JSX、无用代码残留和过长组件压力，保证后续人工维护能读得懂、改得动。
7. 简化代码不能改坏现有业务功能；所有简化都必须有测试或现有回归覆盖。

## 范围

### 本轮包含

- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`
  - Existing Pairing Tx 点击改为立即保存。
  - 保存中禁用 Existing/Available 的结构性操作。
  - 成功/失败使用现有 `@rois/ui` `message`。

- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`
  - Pairing 日历添加弹窗保存中禁用 checkbox、Clear、Cancel、ADD BID。
  - Pairing 蓝条详情 Tx 编辑保存中禁用 checkbox、Clear、Close、SAVE BID。
  - 保存成功/失败补 message。
  - Days Off 日历草稿保存失败补 message，不改变 debounce 保存模型。
  - 审计该文件继续膨胀的问题；把 Pairing 日历弹窗/详情中明显独立、重复或阅读负担重的逻辑拆到本地小组件或本地 helper。
  - 拆分只服务本轮 touched 区域，不把整个 Dashboard calendar 做大范围重构。

- `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx`
  - 支持 pending/disabled 入参，避免保存中继续改选择。
  - 保持展示组件职责单一，只负责渲染 occurrence 选择、Tx 选择和错误状态，不放保存业务逻辑。

- `pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx`
  - 通用 action popover 支持 pending/confirm label/取消禁用等最小能力。
  - 只加入通用、低耦合的 popover 状态能力，不把 Pairing / Days Off 业务判断塞进 shared calendar。

- `pbs-server/src/services/calendar/bidding-calendar-service.ts`
  - planned absence 数据源探测做短期缓存/降级缓存。
  - 当前 `roster_flight` permission denied 会反复耗时约 0.8-1.3 秒，本轮避免每次请求都重复探测。
  - SQL 侧以性能为第一目标；能用一次查询/缓存解决的问题，不用循环查询或异常驱动的高频探测。

- 对应单元/组件测试。

### 本轮不包含

- 不重构 Days Off / Line 右侧通用 `RuleBidRightPanel` 的 Tx autosave 行为。
- 不新增数据库字段或 migration。
- 不实现 planned absence 真实业务接入。
- 不改变 Pairing / Days Off 的业务语义和 AA 功能范围。
- 不引入新依赖。

## 当前发现

1. Pairing 右侧 add/delete/favorite 已经有 pending 和 message，但 Existing Tx 点击仍然只改本地 state，靠 250ms autosave 保存；失败时 `.catch(() => return)`，用户看不到错误。
2. Pairing 日历添加与蓝条详情编辑已有基本 disabled 和内联错误，但没有全局 message，保存中也没有完整锁住 checkbox / Clear / Cancel。
3. Days Off 左侧日历保存失败会被静默吞掉，容易让用户误以为已保存。
4. 性能 baseline 主脚本未覆盖 `/api/bidding-calendar/current`；手动补测发现该接口最高约 2 秒，主要慢点来自 planned absence 数据源 `roster_flight` 探测权限失败。
5. Pairing occurrence/date 查询当前在 0.2-0.6 秒区间，暂不作为第一优先优化点。

## 代码质量与简化要求

本轮不是只补 loading/message，也要把触达区域整理到后续人工可维护的状态。

### 前端阅读性

- `DashboardSchedulePanel` 当前承载了共享日历、Days Off 编辑、Pairing 日期添加、Pairing 详情编辑等多类职责，已经有继续变大的风险。
- 本轮会优先把 Pairing 日期添加和 Pairing 详情编辑中重复的 Tx checkbox、Clear、pending 禁用、错误展示逻辑收敛。
- 如果拆组件，只拆 feature-local 组件，例如：
  - Pairing 日历添加内容继续放在 `pairing-calendar-bid-popover-content.tsx`。
  - Pairing 蓝条详情可拆为本地 `PairingCalendarBidDetailDialog` 或同目录 helper，避免主 panel 继续堆 JSX。
- 不把只在 Pairing 日历里使用的逻辑上提到 `shared`，除非它已经明显跨 Days Off / Pairing 复用。
- 不为了“抽象”引入复杂通用框架；优先小函数、小组件、清晰命名。

### 状态简化

- pending 状态要有明确含义，避免同一个保存流程散落多个布尔值。
- 如果可以用已有 `pendingDraftMutationKey` 表达，就不新增平行状态。
- 对日历弹窗这类局部状态，允许保留局部 pending，但要保证命名能看出对应操作，例如 add pairing bid / save pairing event tiers。
- 失败处理不能再 `.catch(() => return)` 静默吞掉；必须至少有 message 或内联错误。

### 后端与 SQL

- SQL 优先性能和可解释性，不为了 TypeScript 代码好看牺牲查询效率。
- 避免 N+1、避免每次请求重复探测已知不可用的数据源。
- planned absence 本轮只缓存“数据源不可用”的探测结果，不改变输出语义。
- 如果发现需要数据库索引或 schema/migration 才能真正解决性能，本轮必须明确指出；但当前设计不预期新增 migration。

### 不改坏功能的约束

- Pairing Number、specific date、entire month、同日期多 pairing 合并展示、Tx 全空保存等价删除，这些语义必须保持。
- Days Off 左侧日历多 Tx 选择、Clear、星期头批量添加/删除语义必须保持。
- Pairing / Days Off / Tier calendar query cache invalidation 必须保持，否则左侧日历和右侧列表会不同步。
- 任何简化后必须跑对应回归测试，不允许只凭手动阅读判断。

## 设计方案

### 1. Pairing 右侧 Existing Tx 立即保存

`handleExistingTierToggle` 改为：

1. 找到目标 property。
2. 计算 next tiers。
3. 运行现有冲突校验。
4. 生成 next existing properties。
5. 调用已有 `persistExistingPropertiesImmediately` 保存。

保存反馈：

- 成功：`message.success("Pairing property updated.")`
- 失败：`message.error("Unable to update pairing property.")`

保存中：

- `pendingDraftMutationKey` 设置为 `tier-${propertyId}`。
- Existing rows 的 delete / Tx 禁用。
- Available rows 的 add 禁用。
- 避免用户连续点击造成 draftVersion 冲突或覆盖。

### 2. Pairing 日历添加弹窗 pending 状态

新增或扩展 action popover 能力：

- `confirmPending`
- `confirmPendingLabel`
- `cancelDisabled`

保存中行为：

- ADD BID 文案切换为 `ADDING...`。
- ADD BID disabled。
- Cancel disabled。
- occurrence checkbox disabled。
- Tx checkbox disabled。
- Clear disabled。
- 成功关闭弹窗，并弹 `Pairing bid added.`
- 失败保留弹窗，显示内联错误，并弹 `Unable to add pairing bid.`

### 3. Pairing 蓝条详情 Tx 编辑 pending 状态

保存中行为：

- SAVE BID 文案切换为 `SAVING...`。
- SAVE BID disabled。
- Close disabled。
- Tx checkbox disabled。
- Clear disabled。
- 成功关闭详情，并弹 `Pairing bid updated.`
- 如果 Tx 全部清空，保存语义仍然是删除该 pairing bid，成功文案仍可用 `Pairing bid updated.`，避免用户理解成另一个删除流程。
- 失败保留详情，显示内联错误，并弹 `Unable to save pairing bid.`

### 4. Days Off 左侧日历失败反馈

保留现有 debounce autosave：

- 用户在日期/星期头弹窗中 SAVE BID 后，仍然先更新本地 calendar draft。
- 后台保存失败时弹 `Unable to save days off calendar bid.`
- 保留或新增一个轻量内联错误，避免 toast 消失后完全无痕。
- 不改 Days Off 右侧规则列表的 Tx autosave。

### 5. Bidding Calendar 性能优化

`loadPlannedAbsenceEvents` 当前每次请求都会：

```sql
select 1 from <live_schema>.roster_flight where false
```

在当前环境中会 permission denied，且异常返回耗时约 0.8-1.3 秒。

本轮改为在 `createPbsBiddingCalendarService` 内维护 planned absence source 状态缓存：

- 缓存内容：`available | unavailable`、过期时间、warning。
- 当探测失败时，短期内直接返回空 events + warning，不重复打 DB。
- TTL 先用服务内常量，例如 60 秒，与当前 period cache 一致。
- 这样不改变现有业务输出，只减少重复失败探测成本。

后续 planned absence 真接入时，再把该缓存替换成真实查询缓存/参数开关。

## 测试计划

### 前端

- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
  - Existing Tx 点击保存中禁用 Tx/delete/add。
  - Existing Tx 保存成功显示 message。
  - Existing Tx 保存失败显示 message，并不悄悄吞错。
  - 确认 Existing Tx 立即保存后仍保留冲突校验和现有 add/delete/favorite 行为。

- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`
  - Pairing 日历 ADD BID 保存中禁用 checkbox / Clear / Cancel / ADD BID。
  - Pairing 日历 ADD BID 成功/失败 message。
  - Pairing 蓝条详情 SAVE BID 保存中禁用 checkbox / Clear / Close / SAVE BID。
  - Pairing 蓝条详情保存成功/失败 message。
  - Days Off 日历保存失败 message。
  - 确认 Days Off 原有多 Tx、Clear、weekday header 行为不被本轮简化破坏。

### 后端

- `pbs-server/src/services/calendar/bidding-calendar-service.test.ts`
  - planned absence source 首次失败后，缓存期内再次加载不重复查询 `roster_flight`。
  - 返回 warning 语义保持不变。

### 验证命令

实施后优先运行：

```bash
npm run verify:pbs
```

必要时补跑：

```bash
npm run perf:pbs -- --samples=3 --budget-ms=2000
```

并手动补测：

- `GET /api/bidding-calendar/current`
- `GET /api/pairing-search/pairing-occurrences/by-date`

## 验收标准

1. Pairing 右侧 Existing Tx 点击保存时，用户能看到禁用状态和成功/失败提示。
2. Pairing 小日历添加和蓝条详情编辑保存时，不允许重复点击或边保存边改选择。
3. Pairing 相关成功/失败 message 能被测试覆盖。
4. Days Off 左侧日历保存失败不会静默。
5. `/api/bidding-calendar/current` 不再因为 planned absence 权限失败每次额外耗费约 1 秒。
6. `npm run verify:pbs` 通过。
7. 不新增 `Layer/Lx` 术语，不引入新依赖，不改数据库结构。
8. `DashboardSchedulePanel` 本轮新增逻辑不能继续无序堆在主组件里；Pairing 日历相关重复 JSX/状态处理要收敛到本地小组件或 helper。
9. 触达文件里不保留明显无用变量、无用 import、空 catch、调试输出或重复 helper。
10. SQL/后端性能优化以减少实际耗时为准，不为了代码形式简洁牺牲查询速度。

## 风险与控制

- `DashboardSchedulePanel` 已经偏大，本轮必须做局部整理；拆分控制在 Pairing calendar popover/detail 附近，不做跨页面大抽象。
- Pairing Existing Tx 从 autosave 改成立即保存，会改变交互节奏，但符合用户明确要求的禁用/loading/message。
- Days Off 不改右侧 Tx 行为，避免影响 Line 页面和通用 RuleBid 面板。
- planned absence 缓存只是缓存失败探测结果，当前 planned absence 真实返回本来就是空 events，因此不改变业务结果。
