# PBS Pairing Preference 日历 ID 往返修复设计

状态：已确认，已实施

## 1. 背景

`Pairing Preference`（`propertyCode=102`）已经按照标准答案收口为只保存 stable Pairing IDs：

```ts
type PairingPreferenceBid = {
  type: "pairing-preference"
  pairingIds: string[]
  pairingLabels?: string[]
}
```

日期、天数、Credit、Route、Rank 等只用于筛选候选 Pairing，不属于最终 bid scope。项目尚未上线，因此 property 102 不兼容旧 `pairing-id-list` 或 `pairing-occurrence-list` payload。

左侧 `BIDDING CALENDAR` 的 Pairing date action popover 是本次语义收口中遗漏的入口。用户在日历里选择 Pairing 并点击 `ADD BID` 时，Portal 仍发送旧结构：

```json
{
  "type": "pairing-occurrence-list",
  "occurrences": [
    {
      "pairingNumber": "CRPM",
      "originDate": "2026-06-06",
      "pairingId": "147164",
      "occurrenceId": "147164:2026-06-06"
    }
  ]
}
```

Server 对 property 102 按新合同校验，因此返回：

```text
Pairing Preference must use Pairing IDs selected from the list.
```

同时，日历读取已有 property 102 时只显式识别旧 `pairing-id-list`，没有从新 `pairing-preference` JSON 中提取 `pairingIds`。如果只修写入端，保存虽然成功，刷新后日历蓝色条仍可能因无法重新解析 ID 而消失。

本修复必须同时完成写入和读取两端，形成完整 ID round-trip。

## 2. 根因

### 2.1 写入端遗漏

`DashboardSchedulePanel` 的 `buildPairingCalendarAwardProperty` 仍把日历选择结果构造成 `pairing-occurrence-list`。该实现早于 property 102 的标准答案语义收口，没有随新合同一起迁移。

### 2.2 读取端遗漏

`bidding-calendar-pairing-events.ts` 会反序列化 property 102，但 `extractSpecificPairingIds` 只显式读取 `pairing-id-list`。新 `pairing-preference` 被序列化为 JSON 后，当前 fallback 会错误地把整段 JSON 当作逗号分隔 ID，导致 occurrence 查询无法命中。

### 2.3 与 crew-bid import 的关系

请求中的 `remarks=crew-bid-import:<runKey>` 只说明当前 draft 最初由 crew-bid import 创建，不代表这次 `POST /pairing-bids/current/properties` 由 importer 生成。

本次失败 payload 来自左侧日历 Add Bid 路径。现行 crew-bid import 已按标准答案规则拒绝无法解析为 stable IDs 的 legacy Pairing Number 文本，本次不恢复该兼容行为。

## 3. 目标

- 左侧日历添加 Pairing Preference 时只提交 stable `pairingIds` 和同序 `pairingLabels`。
- 不持久化 `originDate`、`occurrenceId` 或 date scope。
- Server 日历读取新 `pairing-preference` 时能正确提取 IDs。
- 日历通过 stable IDs 查询当月 Pairing 数据，重新生成蓝色条、日期跨度和详情 metadata。
- 保存后立即同步、刷新页面、重新登录和重新加载 draft 后，日历蓝色条与详情均保持一致。
- 保持 property 102 的“不兼容旧 payload”规则，不以修复为名恢复 `pairing-occurrence-list` 接受能力。

## 4. 不在范围内

- 不修改 Pairing Preference picker 的搜索、筛选、分页或多选行为。
- 不恢复 `LIMIT TO RUN DATE`、`FULFILMENT`、Minimum/Maximum。
- 不改变 `propertyCode=102`、名称、Award/Avoid 或 Tier 语义。
- 不改变日历 Pairing Numbers 内部列表、blocked-by-days-off 规则或自适应定位规则。
- 不改变 `pairing-occurrence-list` 在其他仍有合法用途的内部类型和历史读取工具。
- 不修改 crew-bid import 对 legacy Pairing Number 文本的拒绝策略。
- 不执行数据库 migration；该问题是代码读写合同遗漏，不是 schema 问题。

## 5. 方案比较

### 方案 A：Server 接受旧 `pairing-occurrence-list`

优点：前端不用修改，当前请求可以立即保存。

缺点：重新引入已经明确删除的 run-date 语义；同一个 property 出现两个合同；Search Pairings、Favorite、算法导出和日历回显会继续分叉。

结论：拒绝。

### 方案 B：只修改 Portal 写入

优点：改动最少，POST 可以通过。

缺点：日历读取端仍无法从 JSON 正确提取 `pairingIds`；保存后蓝色条可能消失，形成“新增成功但回显失败”的假修复。

结论：拒绝。

### 方案 C：写入和读取双向收口（推荐）

Portal 将选中的 occurrences 映射为 `pairing-preference`；Server 日历读取该结构并按 IDs 查询当月 occurrences。日期只从 Pairing 数据源派生，不进入 bid payload。

优点：与标准答案合同一致；写入、搜索、日历和详情共享 stable ID；不需要兼容旧 payload；能从根本上解决保存 400 和刷新后蓝色条消失。

结论：采用。

## 6. 最终数据流

### 6.1 用户添加

1. 用户点击左侧日历某一天。
2. Portal 请求并展示该日期可选 Pairing occurrences。
3. 用户勾选 Pairing，例如 `CRPM` 与 `F8623`。
4. Portal 从选择项提取：
   - `pairingIds = ["147164", "144130"]`
   - `pairingLabels = ["CRPM", "F8623"]`
5. Portal 调用 `POST /api/pairing-bids/current/properties`，发送：

```json
{
  "propertyCode": 102,
  "name": "Pairing Preference",
  "action": "award",
  "quantifier": null,
  "bid": {
    "type": "pairing-preference",
    "pairingIds": ["147164", "144130"],
    "pairingLabels": ["CRPM", "F8623"]
  },
  "tiers": ["T2"]
}
```

6. Server 使用现有 `normalizePairingPreferenceBid` 去空白、验证 stable IDs、去重并保持 labels 对齐。

### 6.2 保存后即时回显

Portal query cache 中的 pending/existing property 必须保留 `pairing-preference`，不能为了日历展示再转换回 occurrence payload。

成功响应后，当前页面重新渲染 Existing Pairing Properties。日历数据仍以 Server 返回的 bidding calendar 为权威，不能根据提交日期制造仅前端存在的蓝色条。

### 6.3 页面刷新后的日历回显

1. Server 从 property 102 group 反序列化出：

```json
{
  "type": "pairing-preference",
  "pairingIds": ["147164", "144130"],
  "pairingLabels": ["CRPM", "F8623"]
}
```

2. `extractSpecificPairingIds` 显式识别 `pairing-preference` 并返回 `pairingIds`。
3. `loadPairingOccurrences` 使用 IDs、period 和 actor base 查询权威 Pairing 数据。
4. 日历从查询结果派生 `originDate / startDate / endDate / pairingNumber / detail metadata`。
5. 蓝色条显示在 Pairing 自身的实际日期，不使用用户最初打开 popover 的日期作为持久化 scope。

## 7. Portal 修改

### 7.1 DashboardSchedulePanel

修改 `buildPairingCalendarAwardProperty`：

- 输入仍可使用 popover 已选 `PairingOccurrenceBidItem[]`，因为 UI 列表需要日期和详情。
- 输出 bid 改用现有 `buildPairingPreferenceBid` 或等价共享 helper。
- `pairingIds` 与 `pairingLabels` 必须按同一选择顺序构造。
- 按 stable Pairing ID 去重；同一个 ID 不因重复出现而生成重复 selection。
- 不把 `originDate`、`occurrenceId`、popover date 写入 property bid。
- 继续保留当前 Award-only calendar shortcut 和用户选择的 tiers。

不得在 `DashboardSchedulePanel` 内复制一份 Pairing Preference normalization；优先复用 `pairing-number-occurrences.ts` 已有的 `buildPairingPreferenceBid`。

### 7.2 Query cache 与 summary

- 日历 Add Bid 成功后的 query cache property 必须保持 `pairing-preference`。
- Existing summary 使用 `pairingLabels` 显示 `CRPM, F8623`；labels 缺失时才回退显示 IDs。
- 日历详情仍从 Server calendar event metadata 打开，不依赖 bid 中保存日期。

## 8. Server 修改

### 8.1 Calendar ID extraction

修改 `extractSpecificPairingIds`：

- 当反序列化结果为 `pairing-preference` 时，返回规范化后的 `bid.pairingIds`。
- 可保留现有 `pairing-id-list` 读取分支，前提是它只服务非 property 102 的历史工具或测试；property 102 写入仍必须拒绝旧类型。
- 不允许新 `pairing-preference` 落入 `row.paramA.split(",")` fallback。
- 对空值和非法 IDs 保持现有安全过滤与 warning 行为。

### 8.2 Calendar occurrence reconstruction

保持当前权威查询路径：

- 使用 stable IDs 查询 live Pairing 数据。
- 使用 periodCode 和 actor base 限定查询范围。
- 从查询结果生成蓝色条的真实日期跨度与详情 metadata。
- Pairing ID 查询不到时继续返回明确 warning，不制造虚假日期事件。

### 8.3 Property validation

Server property 102 validation 不放宽：

- 只接受 `type="pairing-preference"`。
- 至少一个 stable Pairing ID。
- labels 存在时数量与 IDs 对齐。
- 继续拒绝 `pairing-occurrence-list`、`pairing-id-list` 和 tag-list。

## 9. 错误处理

- Portal 若 occurrence 缺少 stable `pairingId`，该项不能进入提交 payload，并应阻止空 selection 提交。
- `pairingLabels` 缺失不应阻断保存；summary 可回退到 ID。
- Server 查询不到某个已保存 ID 时：
  - 不删除用户 bid。
  - 不生成错误日期蓝条。
  - 在 calendar response warnings 中报告 missing IDs。
- Add Bid API 失败时保留 popover 选择和 Tier，让用户可以重试；不得静默关闭。

## 10. 测试设计

### 10.1 Portal unit tests

更新 `shared-bidding-workbench-layout.test.tsx`：

- 日历选择两个 Pairing 后，`addCurrentDraftProperty` 收到 `pairing-preference`。
- payload 只包含 IDs/labels，不包含 occurrences、originDate 或 occurrenceId。
- IDs 与 labels 同序并按 ID 去重。
- Tier、Award 和 footer 行为保持不变。
- API 失败后选择仍保留，可再次提交。

必要时为 `buildPairingPreferenceBid` 增加 focused test，覆盖去空白、去重和 labels 对齐。

### 10.2 Server unit tests

为 calendar pairing events 增加回归：

- `operator=Json + pairing-preference` 能提取 stable IDs。
- IDs 能驱动 occurrence 查询并生成正确蓝色条日期。
- 多个 IDs 生成各自事件或按现有规则合并。
- 找不到的 ID 进入 warning，不生成事件。
- property 102 normalization 仍拒绝 `pairing-occurrence-list`。

### 10.3 Playwright

真实 UI 至少覆盖：

1. 打开 Pairing 页。
2. 在左侧某天打开 Pairing Bid popover。
3. 选择两个 Pairing 和一个可用 Tier。
4. 点击 `ADD BID`。
5. 断言 request payload 为 `pairing-preference`，没有日期字段。
6. mock/实际响应成功后刷新页面或重新请求 calendar。
7. 断言对应 Pairing 的蓝色条仍显示在权威 Pairing 日期。
8. 点击蓝色条，确认全屏详情可以匹配到 Pairing 数据。
9. 回归 blocked-by-days-off、API error 和三种视口自适应，确保本修复不破坏刚修正的日历布局。

### 10.4 QA 人工测试

新增或更新 `docs/test-cases/pbs/pairing/` 用例，至少检查：

- Add Bid 不再返回 400。
- Network payload 只有 stable IDs/labels。
- 保存后、刷新后、重新登录后蓝色条都存在。
- Existing Property summary 与选择一致。
- 蓝色条详情能打开并匹配正确 Pairing。
- 选择项包含多个日期时，日历使用权威 Pairing 日期而不是 popover 打开日期。

## 11. 验收标准

- 用户给出的 payload 场景不再返回 400。
- 左侧日历 property 102 请求使用 `pairing-preference`。
- payload 不包含 `originDate`、`occurrenceId` 或 date scope。
- 保存后和刷新后日历蓝色条一致，不出现“添加时有、添加后消失”。
- 蓝色条点击详情能通过 stable Pairing ID 匹配权威数据。
- Pairing Preference picker、Existing、Favorite、Search Pairings 与日历入口共享同一 bid contract。
- Server 继续拒绝旧 property 102 payload，不恢复未上线项目的旧数据兼容。
- Pairing date popover 的内部列表滚动、外层无滚动条和多视口自适应回归通过。
- Portal focused Vitest、Server focused tests、Pairing Playwright、Portal/Server build、lint、`npm run check:ui`、`git diff --check` 全部通过。

## 12. 影响范围与风险

### 高风险点

- `DashboardSchedulePanel` 同时服务 Dashboard 和 Pairing 工作台，修改 Add Bid property shape 会影响共享日历流程。
- calendar pairing event reconstruction 决定蓝色条日期和详情 metadata，读取错误会造成“保存成功但看不见”。

### 风险控制

- 不修改 `ScheduleEventCalendar` 的布局、popover 定位或 canvas 缩放。
- 不修改 Pairing Preference 主 picker 的 UI 和 filter 逻辑。
- 不修改数据库 schema、migration 或 property catalog。
- 用 ID round-trip Playwright 同时验证写入和刷新读取，不能只 mock `addCurrentDraftProperty` 成功。

## 13. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Portal 日历写入、Server 日历读取和同一条 Playwright round-trip 紧密耦合；当前工作区还有未提交的日历布局与详情修复，并行编辑容易相互覆盖。
- Suggested split: 单 agent 按 Portal 写入 → Server 读取 → unit tests → Playwright 顺序实施。
- Write boundaries: `pbs-portal/src/features/dashboard/`、`pbs-server/src/services/calendar/`、对应 tests、E2E 和 QA 文档。
- Conflict risk: Medium；共享日历文件当前已有未提交改动，必须基于现状做小 patch，不能回滚或重排无关代码。
- Execution gate: 本 spec 经用户明确确认后才能修改功能代码；没有用户明确指令不得 stage 或 commit。
