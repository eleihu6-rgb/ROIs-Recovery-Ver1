# PBS Days Off 全接口 2 秒内优化设计

日期：2026-04-28
作者：Codex
状态：已确认并实现

## 背景

用户在 `/days-off` 页面 Network 中继续看到 `properties` 等接口超过 3 秒。上一轮已经优化了 `GET current`、delete、favorite/unfavorite 的部分路径，但 `POST /days-off-bids/current/properties` 添加条件仍然会因为多次远程 DB round trip 超过 2 秒。

用户明确要求：Days Off 页面所有接口都不能超过 2 秒。经确认，这里的 2 秒目标不包含服务刚启动、连接池冷启动、远程 DB 网络突发抖动；目标对象是服务已启动、连接池已热后的正常页面操作。

同时，点击添加条件时出现的 `Only one maximize or string Days Off property can be active in L1.` 属于即时操作错误，应使用全局 `message` 提示，而不是占用页面顶部错误区域。

## 目标

1. `/days-off` 页面正常操作接口在暖连接下小于 2 秒。
2. 覆盖右侧 bid 接口：`GET current`、`PUT current`、`POST properties`、`DELETE properties`、favorite、unfavorite。
3. 覆盖左侧 calendar days off 接口：`GET /calendar-days-off/current`、`PUT /calendar-days-off/current`。
4. 添加 Days Off property 的冲突校验用 `message.error` 提示，不显示页面顶部红框。
5. 保持现有 API contract、业务规则、draftVersion、layer totals 和 stable key 语义。

## 不做范围

- 不承诺冷启动请求永远低于 2 秒。
- 不改数据库部署位置。
- 不改 UI 布局。
- 不做 Clear Bids 或 Layer 页面展示。
- 不移除 AA validation。

## 方案

### 1. 前端冲突提示

在 `RuleBidRightPanel.handleAddProperty` 的 add 前 validation 分支中：

- 如果 candidate property 与现有 Days Off rules 冲突，调用 `message.error(validationText)`。
- 不再 `setSaveErrorMessage(validationText)`。
- 页面顶部 alert 继续保留给已有 properties 本身处于非法状态或保存失败的场景。

### 2. Add property 后端优化

当前 add property 主要慢点：

- 有 `draftKey` 时仍先 `loadCurrentBidByReference` 查一次 bid。
- transaction 内部还要更新 bid、读取已有 properties、ensure layers、insert groups、sync layers 多次往返。

优化：

- 有 `draftKey/bidId` 时不再提前查 bid，直接交给 mutation 主路径定位。
- 保留 `loadDraftProperties` 用于 AA validation 和 rowSeq 计算。
- 将 ensure layer、insert group、更新 layer totals、更新 bid totals 尽量压成一条 CTE SQL，减少 add property 写入阶段的 round trip。
- 如果没有 draftKey 需要创建 draft，保留原有 `ensureCurrentBidByReference` 能力。

### 3. Calendar days off 优化

Calendar days off 当前每次仍会 resolve period、load bid、load dates；save 时会 delete/insert/sync layers 多步操作。

优化：

- 增加 current period 短 TTL cache，与 bid service 保持一致。
- 保存时在可控范围内减少多余查询；如果这轮风险较高，先保守保留行为，重点验证是否仍超过 2 秒。

### 4. 验证

自动验证：

- Days Off 页面测试覆盖 message 提示，不再断言顶部错误文本。
- `npm run verify:pbs` 通过。

真实接口验证：

- 使用 3002 测试 token，在服务已启动后连续调用 `/days-off` 相关接口。
- 重点观察 `POST /api/days-off-bids/current/properties` 暖连接是否小于 2 秒。

## 风险

- Add property CTE 如果写错，会影响 rowSeq、layer totals、draftVersion。需要测试和真实非破坏性路径验证。
- 远程 DB 网络偶发波动仍可能导致单次超过 2 秒；这属于部署/网络层风险，不是业务代码能完全保证。
