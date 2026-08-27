# PBS Days Off / Pairing 局部草稿写入设计

日期：2026-05-06  
作者：Codex  
状态：已确认，已实施

## 背景

当前 PBS Portal 的 `Days Off` 和 `Pairing` 相关操作里，还存在几类“整份 draft 保存”的路径：

- 左侧 `BIDDING CALENDAR` 的 Off 日期保存，会把整份 calendar days off draft 重新提交。
- Pairing 日历蓝色 bid 详情里编辑 Tx，会根据 `propertyGroupKey` 改本地数组后调用整份 pairing draft 保存。
- Pairing 右侧 `EXISTING PAIRING PROPERTIES` 的 Tx toggle，仍会通过整份 pairing draft 保存。
- Days Off 右侧 `EXISTING DAYS OFF PROPERTIES` 的已有 property 编辑，由通用 `RuleBidRightPanel` 自动保存整份 days off draft。
- Pairing / Days Off 的新增、删除 property 虽然已经是局部接口，但目前没有强制携带 `draftVersion`，并发保护不完整。

这会带来几个长期问题：

1. 高频点击会传输和重写整份 draft，数据越多越慢。
2. 两个客户端同时操作时，容易用旧快照覆盖新内容。
3. 前端为了保存一个 Tx，需要构造整份业务文档，后续接代码的人会把 CRUD 边界越写越乱。
4. 后端会出现“局部修改但全量删除重建”的实现，性能和可读性都不好。

本次设计的目标是把 `Days Off` 和 `Pairing` 两个页面的日常增删改查，统一改成稳定 `id/key` + 局部 mutation + `draftVersion` 并发保护。

## 目标

1. Pairing property 的新增、删除、更新都使用稳定 `propertyGroupKey` 或后端返回的 key，不再用行号、索引或整份数组定位。
2. Days Off property 的新增、删除、更新也使用稳定 `propertyGroupKey`。
3. 左侧日历 Off 日期使用自然唯一键 `(date, tier)` 做局部 set / clear，不再提交整份 calendar draft。
4. 所有会改变 current draft 的局部接口都携带 `draftVersion`，版本不一致返回 `409`。
5. 前端在 Days Off / Pairing 两个页面的日常操作中，不再调用整份 `saveCurrentDraft`。
6. 保留整份 `PUT` 接口作为兼容、导入、批量重排或未来明确批量保存入口，但不作为这两个页面高频交互的默认路径。
7. 继续保留现有 Pairing / Days Off 冲突规则：same Tx 下 Off 和 Specific Date Pairing 互斥，Entire Month Pairing 展开时排除 touch Off 的 occurrence。

## 非目标

- 不调整 Line / Reserve / Award 等其他模块的保存方式。
- 不改变 AA 文档业务规则，只治理当前页面的写入契约和实现边界。
- 不新增数据库业务字段。当前已有 `pbs_bid.draft_version`、`pbs_bid_group.property_group_key`、`pbs_bid_day_off` 唯一约束，足够支撑本轮局部写入。
- 不做跨月 day off、planned absence、final award pool 等后续功能。

## 方案对比

### 方案 A：继续整份 draft 保存

优点是改动少，当前代码路径最熟悉。缺点是会继续传整份数据、全量比较、全量删除重建，并发覆盖风险长期存在。这个方案不符合后续维护方向，不建议继续。

### 方案 B：每个 UI 操作都新建独立 endpoint

例如 `toggle-tier`、`clear-tier`、`add-calendar-date`、`remove-calendar-date` 各自一套接口。优点是前端调用非常直观；缺点是 endpoint 太碎，后端验证和并发逻辑容易重复，后续扩展 property 编辑时会变散。

### 方案 C：按业务对象建立稳定局部 mutation

推荐采用这个方案：

- property 类对象统一通过 `propertyGroupKey` 定位。
- calendar day off 通过 `(date, tier)` 定位。
- 统一请求携带 current draft identity 和 `draftVersion`。
- 后端在事务里锁定 draft、验证版本、只修改目标对象。

它兼顾性能、可读性和后续演进，能把“业务对象是谁”和“这次只改什么”讲清楚。

## API 设计

### 共同请求身份

所有局部 mutation 都携带以下字段：

```ts
type PbsCurrentDraftMutationReference = {
  draftKey?: string;
  bidId?: number;
  periodCode?: string;
  bidContext: "Current";
  draftVersion: number;
};
```

后端定位顺序：

1. 优先使用 `bidId` 或 `draftKey` 找当前用户的 current bid。
2. 没有 `bidId` / `draftKey` 时使用 `periodCode` 和当前用户定位。
3. 写入前必须检查 `draftVersion`。
4. 版本不一致返回 `409`，前端刷新相关 query 并提示用户当前草稿已变化。

### Pairing property 新增

保留路径：

```text
POST /api/pairing-bids/current/properties
```

请求新增必填 `draftVersion`：

```ts
type PbsAddPairingCurrentPropertyRequest = PbsCurrentDraftMutationReference & {
  remarks?: string;
  property: Omit<PbsPairingDraftProperty, "propertyGroupKey" | "rowSeq">;
};
```

语义：

- 新增前验证当前 draft version。
- Pairing Number Specific Date 仍执行 Off 冲突校验。
- 如果能与已有相同 Pairing Number Specific Date property 合并，则只更新该 `propertyGroupKey` 对应的 groups。
- 返回后端稳定 `propertyGroupKey`、`rowSeq` 和新 `draftVersion`。

### Pairing property 删除

保留路径：

```text
DELETE /api/pairing-bids/current/properties/:propertyGroupKey
```

query 或 body 必须包含：

```ts
type PbsDeletePairingCurrentPropertyRequest = PbsCurrentDraftMutationReference;
```

语义：

- 通过 `propertyGroupKey` 删除该 property 的 groups 和 conditions。
- 只调整受影响 property 后面的 `groupSeq`。
- 同步 `pbs_bid_tier`，递增 `draftVersion`。
- 找不到 `propertyGroupKey` 返回 `404`，避免静默吞掉前端旧状态。

### Pairing property 局部更新

新增路径：

```text
PATCH /api/pairing-bids/current/properties/:propertyGroupKey
```

请求：

```ts
type PbsPatchPairingCurrentPropertyRequest = PbsCurrentDraftMutationReference & {
  property: Omit<PbsPairingDraftProperty, "propertyGroupKey" | "rowSeq">;
};
```

语义：

- 目标 property 由 path 上的 `propertyGroupKey` 定位。
- body 只传这一条 property 的新内容，不传整份 draft。
- 后端加载当前 properties 用于规则冲突校验，但数据库只删除并重建该 `propertyGroupKey` 对应的 groups / conditions。
- `tiers=[]` 表示删除该 property，兼容 Pairing 日历详情“全不选后保存等价删除”的交互。
- 非空 `tiers` 时保留原 `rowSeq`，只更新该 property 的 tier 覆盖、bid 值、action、quantifier 等内容。
- 成功返回：

```ts
type PbsPatchPairingCurrentPropertyResponse = PbsPairingDraftMutationResponse & {
  propertyGroupKey: string;
  deleted: boolean;
  tiers: string[];
};
```

当前实现优先用这个接口替代：

- Pairing 右侧 Existing row Tx toggle。
- Pairing 左侧日历蓝条详情 Tx 保存。

### Days Off property 新增

保留路径：

```text
POST /api/days-off-bids/current/properties
```

请求新增必填 `draftVersion`：

```ts
type PbsAddDaysOffCurrentPropertyRequest = PbsCurrentDraftMutationReference & {
  remarks?: string;
  property: Omit<PbsDaysOffDraftProperty, "propertyGroupKey" | "rowSeq">;
};
```

语义：

- 新增前验证 draft version。
- 继续执行 Days Off property 的互斥和唯一规则校验。
- 返回 `propertyGroupKey`、`rowSeq` 和新 `draftVersion`。

### Days Off property 删除

保留路径：

```text
DELETE /api/days-off-bids/current/properties/:propertyGroupKey
```

请求必须包含 `draftVersion`。

语义：

- 通过 `propertyGroupKey` 删除该 property。
- 只删除目标 groups / conditions，并调整后续 `groupSeq`。
- 同步 `pbs_bid_tier`，递增 `draftVersion`。
- 找不到目标返回 `404`。

### Days Off property 局部更新

新增路径：

```text
PATCH /api/days-off-bids/current/properties/:propertyGroupKey
```

请求：

```ts
type PbsPatchDaysOffCurrentPropertyRequest = PbsCurrentDraftMutationReference & {
  property: Omit<PbsDaysOffDraftProperty, "propertyGroupKey" | "rowSeq">;
};
```

语义：

- 用 path 上的 `propertyGroupKey` 定位已有 property。
- 只传一条 property 的完整新值，包括 `bid`、`tiers`、`allOrNothing`、`minimumN`。
- 后端加载当前 properties 做 Days Off 规则校验，但只重写该 property 的 groups / conditions。
- `tiers=[]` 不作为删除语义；Days Off property 删除必须走 `DELETE`，避免用户误取消所有 Tx 后隐藏规则。
- 成功返回：

```ts
type PbsPatchDaysOffCurrentPropertyResponse = PbsDaysOffDraftMutationResponse & {
  propertyGroupKey: string;
  tiers: string[];
};
```

当前实现用这个接口替代 `RuleBidRightPanel` 在 Days Off 页面上的整份 autosave。

### Calendar Days Off 日期局部更新

新增路径：

```text
PATCH /api/calendar-days-off/current/dates
```

请求：

```ts
type PbsPatchCalendarDaysOffDatesRequest = PbsCurrentDraftMutationReference & {
  changes: Array<{
    date: string;
    tier: string;
    selected: boolean;
  }>;
};
```

语义：

- `(date, tier)` 是自然唯一业务 key。
- `selected=true` 表示设置该 Tx 在该日期 Off。
- `selected=false` 表示清除该 Tx 在该日期 Off。
- 同一请求中重复 `(date, tier)` 由后端按最后一条归一化处理，前端也应避免重复生成。
- 新增 Off 前继续检查 same Tx 是否已有 pairing 覆盖；冲突返回 `409`。
- 删除不存在的 Off 是幂等 no-op，但如果 target bid 已存在且版本匹配，仍返回成功。
- 后端只插入或删除受影响的 `pbs_bid_day_off` 行，不再整表删除重建。
- 成功返回：

```ts
type PbsPatchCalendarDaysOffDatesResponse = {
  saved: true;
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  periodCode?: string;
  draftVersion?: number;
  applied: {
    added: number;
    removed: number;
    unchanged: number;
  };
};
```

当前实现用这个接口替代：

- Days Off 页面点击单日弹窗保存。
- Days Off 页面点击星期表头批量保存。
- 共享左侧日历中所有 Off 日期 set / clear 操作。

## 后端实现设计

### 事务与并发

每个 mutation 都遵循同一顺序：

1. 解析并校验 body / query / params。
2. 根据 actor + draft reference 定位 current bid。
3. 使用现有 advisory lock 锁定当前 draft。
4. 校验 `draftVersion`。
5. 执行业务冲突校验。
6. 只修改目标 property 或目标 day off dates。
7. 同步 `pbs_bid_tier`。
8. 递增并返回新的 `draftVersion`。

`draftVersion` 不匹配统一返回：

```text
409 Draft has changed. Please refresh and try again.
```

### Pairing property patch

后端可以复用现有 mapper：

- 读取当前 `loadDraftProperties`。
- 找到 path 指定 `propertyGroupKey`。
- 用 body property 替换该 property 的可编辑字段。
- 复用 `assertPairingRulePropertiesValid` 检查替换后的 properties。
- 复用 Specific Date Pairing / Off 冲突校验，只校验替换后的目标 property。
- 删除该 `propertyGroupKey` 对应的旧 groups / conditions。
- 非空 tiers 时使用原 rowSeq 重建该 property 的 groups。

注意：这里允许“为了校验加载当前 properties”，但不允许“为了保存传整份 draft、删除所有 Pairing groups 再重建”。

### Days Off property patch

后端与 Pairing 类似：

- 读取当前 Days Off properties。
- 找到目标 `propertyGroupKey`。
- 合并 body property。
- 复用 Days Off property 互斥/唯一校验。
- 删除并重建目标 property 的 groups / conditions。
- 非空 tiers 才允许保存；空 tiers 返回 `400`，提示至少选择一个 Tx 或使用删除。

### Calendar Days Off dates patch

后端新增专用 service 方法：

```ts
patchCurrentDraftDates(
  actor: PbsActor,
  request: PbsPatchCalendarDaysOffDatesRequest,
): Promise<PbsPatchCalendarDaysOffDatesResponse>
```

实现要点：

- 先把 `T1` 解析成数字 tier。
- 归一化 `YYYY-MM-DD` 日期并复用当前 bid period 校验。
- 批量查询现有 `(tier, bid_date)`，避免逐项 N+1。
- 对新增项调用现有 pairing 冲突校验。
- `selected=true` 使用 `insert ... on conflict do nothing`。
- `selected=false` 使用批量 `delete where (tier, bid_date) in (...)`。
- 操作完成后 `syncBidTiers`。

## 前端实现设计

### service 层

新增或调整：

- `pairingService.addCurrentDraftProperty`：payload 带 `draftVersion`。
- `pairingService.removeCurrentDraftProperty`：请求带 `draftVersion`。
- `pairingService.patchCurrentDraftProperty`：按 `propertyGroupKey` 局部更新。
- `daysOffService.addCurrentDraftProperty`：payload 带 `draftVersion`。
- `daysOffService.removeCurrentDraftProperty`：请求带 `draftVersion`。
- `daysOffService.patchCurrentDraftProperty`：按 `propertyGroupKey` 局部更新。
- `calendarDaysOffService.patchCurrentDraftDates`：按 `(date, tier)` set / clear。

所有请求继续通过 `src/shared/services/request`，不在页面里直接写裸 `fetch` / `axios`。

### Pairing 页面

调整点：

- 删除 `PairingRightPanel` 里针对 `existingProperties` 的整份 autosave effect。
- Existing row Tx toggle 直接调用 `pairingService.patchCurrentDraftProperty`。
- 删除仍调用 `removeCurrentDraftProperty`，但带 `draftVersion`。
- 新增 property 仍调用 `addCurrentDraftProperty`，但带 `draftVersion`。
- mutation pending 期间禁用同一 row 的 Tx toggle / delete，保留当前 message 提示。
- 成功后更新 `pairingPageDataQueryKey` 的 draft meta，并 invalidate：
  - `biddingCalendarQueryKey`
  - `tierPageDataQueryKey`

### Pairing 日历详情

调整点：

- `SAVE BID` 使用 `propertyGroupKey` 调用 `pairingService.patchCurrentDraftProperty`。
- 如果用户清空所有 Tx，body 传 `tiers=[]`，后端删除该 property。
- 成功后关闭详情、刷新 Pairing 页面数据、日历和 Tier 数据。
- 失败时保留详情弹窗，使用全局 `message.error` 和现有错误状态。

### Days Off 页面 Existing Properties

调整通用 `RuleBidRightPanel`：

- 为组件增加可选 `onUpdateProperty`。
- Days Off 页面传入 `onUpdateProperty`，内部调用 `daysOffService.patchCurrentDraftProperty`。
- 当已有 property 的 bid / tier / modifier 改变时，只 patch 当前 property，不再 `onSave(existingProperties, draftMeta)`。
- Line 等未迁移页面仍可继续使用原 `onSave`，但 Days Off 页面不再走整份 save。
- pending 期间禁用对应 row 的编辑控件，失败时回滚该 row 或重新拉取 Days Off page data。

### Calendar Days Off 左侧日历

调整点：

- 点击单日弹窗保存时，把用户勾选结果转成 `changes`：
  - 选中 Tx：`selected=true`
  - 未选中 Tx：`selected=false`
- 点击星期表头批量操作时，一次请求提交所有可应用的 date + Tx changes。
- 如果同一 date + Tx 被 pairing 覆盖，前端继续禁用；后端仍做最终 409 校验。
- 成功后局部更新本地 calendar draft 或直接 invalidate `calendarDaysOffDraftQueryKey`，并刷新：
  - `biddingCalendarQueryKey`
  - `tierPageDataQueryKey`
- 保存期间禁用弹窗 `SAVE` / `Cancel` 中可能重复触发的控件，保持现有 message 反馈。

## 错误处理

- `400`：入参无效，例如 tier 格式错误、date 格式错误、Days Off property patch 传空 tiers。
- `404`：目标 `propertyGroupKey` 不存在，提示用户该 property 已被删除并刷新。
- `409`：draftVersion 过期或 Off / Pairing 业务冲突。前端展示明确 message，并重新拉取相关 query。
- `500`：保留统一错误响应，前端展示通用失败提示。

前端不新增红色 inline error，除非当前面板已有设计需要展示校验列表；操作反馈优先使用项目已有 `message`。

## 性能要求

1. 后端不能为了更新一个 property 删除整份 `Pairing` / `DaysOff` groups。
2. 后端不能为了更新一个 Off 日期删除整张 `pbs_bid_day_off`。
3. Calendar dates patch 必须批量查询、批量插入、批量删除，避免按日期循环查库。
4. Pairing / Days Off property patch 可以加载当前 properties 做规则校验，但写入范围必须限定在目标 `propertyGroupKey`。
5. 前端不能通过刷新整块工作台掩盖写入状态；mutation 期间要有明确 pending / disabled。
6. 目标接口在正常数据量下应控制在 2 秒内，常见单条 property / 单日 date mutation 应明显低于 2 秒。

## 数据库与 migration

本设计默认不需要数据库 schema 变更：

- `pbs_bid.draft_version` 已存在，可用于并发保护。
- `pbs_bid_group.property_group_key` 已存在，并有 `(bid_id, bid_type, property_group_key, tier_id)` 唯一索引。
- `pbs_bid_day_off` 已有 `(bid_id, tier, bid_date, request_type)` 唯一索引。

如果实施中发现缺少必要索引或约束，必须先回到 spec 补充说明，再在 `sql/migration/` 新增幂等 migration SQL。

## 测试计划

### 后端

新增或更新 route / service tests：

- Pairing add property 必须携带 `draftVersion`，版本过期返回 `409`。
- Pairing delete property 使用 `propertyGroupKey + draftVersion`，只删除目标 property。
- Pairing patch property tiers 成功更新 Tx。
- Pairing patch property `tiers=[]` 成功删除 property。
- Pairing patch Specific Date 时 same Tx Off 冲突返回 `409`。
- Days Off add/delete property 必须携带 `draftVersion`。
- Days Off patch property 成功更新 bid / tiers / modifiers。
- Days Off patch property 空 tiers 返回 `400`。
- Calendar days off dates patch 新增、删除、重复 no-op、版本过期、pairing 冲突都覆盖。

### 前端

新增或更新组件测试：

- Pairing Existing row Tx toggle 调用 `patchCurrentDraftProperty`，不调用 `saveCurrentDraft`。
- Pairing 日历详情保存 Tx 调用 `patchCurrentDraftProperty`；全空保存删除。
- Pairing add/delete 请求带最新 `draftVersion`。
- Days Off Existing row 编辑调用 `patchCurrentDraftProperty`，不调用 `saveCurrentDraft`。
- Days Off 单日弹窗保存调用 `patchCurrentDraftDates`。
- Days Off 星期表头批量保存调用 `patchCurrentDraftDates`，并跳过 pairing-covered date + Tx。
- pending 时相关按钮和 Tx toggle 禁用，成功/失败都有 message。

### 验证命令

优先执行目标测试：

```bash
# pbs-server targeted tests
DATABASE_URL=postgresql://test:test@localhost:5432/rois \
PBS_SCHEMA=f8_pbs JWT_SECRET=test-secret CORS_ORIGIN=http://localhost:3030 \
node --import tsx --test \
src/services/pairing/pairing-bid-service.test.ts \
src/services/days-off/days-off-bid-service.test.ts \
src/services/calendar/bidding-calendar-service.test.ts \
src/routes/pairing-bids.test.ts \
src/routes/days-off-bids.test.ts \
src/routes/calendar-days-off.test.ts

# pbs-portal targeted tests
npm test -- --run \
src/app/layout/shared-bidding-workbench-layout.test.tsx \
src/features/pairing/pages/pairing-page.test.tsx

npm run lint
npm run build
git diff --check
```

本轮最终验证已执行：

- `pbs-server`: `npm test`、`npm run build`
- `pbs-portal`: `npm test`、`npm run lint`、`npm run build`
- 仓库根目录：`git diff --check`

## 验收标准

1. Days Off / Pairing 两个页面的日常增删改查不再传整份 draft。
2. `rg "saveCurrentDraft" pbs-portal/src/features/dashboard pbs-portal/src/features/pairing pbs-portal/src/features/days-off` 后，只允许出现兼容、测试 mock 或非本轮页面高频路径的保留引用。
3. 所有局部写入都带 `draftVersion`，过期保存不会覆盖新数据。
4. Pairing 日历详情、Pairing Existing row、Days Off Existing row、Days Off 日历弹窗都有 pending 禁用和 message 反馈。
5. Off / Pairing 冲突规则不退化。
6. 不新增 `Layer / Lx` 术语，继续使用 `Tier / Tx`。
7. 不新增数据库 schema；如新增索引，必须配套 `sql/migration` 幂等 SQL。

## 实施顺序

1. 扩展 contracts 和后端 route schema，加入局部 PATCH 类型与 route 常量。
2. 后端 Pairing service 增加 versioned add/delete 和 property patch。
3. 后端 Days Off property service 增加 versioned add/delete 和 property patch。
4. 后端 Calendar Days Off service 增加 dates patch。
5. 前端 shared services 增加局部 mutation 方法，并把 add/delete 请求补上 `draftVersion`。
6. 替换 Pairing 页面和 Pairing 日历详情里的整份保存调用。
7. 替换 Days Off 页面 `RuleBidRightPanel` 的 existing property autosave。
8. 替换左侧 Days Off 日历的整份 calendar draft 保存。
9. 补测试、跑目标验证、用 `rg` 检查整份保存残留。

## 已确认决策

本轮已按以下决策实施：

- Pairing property patch 的 `tiers=[]` 表示删除，匹配 Pairing 日历详情现有交互。
- Days Off property patch 的 `tiers=[]` 返回 `400`，删除必须显式点删除按钮。
- Calendar Days Off dates patch 的删除不存在记录是 no-op。
