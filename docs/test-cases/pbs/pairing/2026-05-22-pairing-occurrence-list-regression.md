# PBS Pairing Number 多运行日回归测试案例

## 背景

本轮将 `Pairing Number` 的 specific date 保存结构从旧的 `tag-list-date` 升级为 `pairing-occurrence-list` + `pbs_bid_pairing_occurrence` 明细表。右侧 `ADD PAIRING PROPERTIES` 和左侧 `BIDDING CALENDAR` 快速添加必须写入同一套结构，并由 Existing、收藏、左侧日历和 Dashboard 共同读取。

## 测试环境

- 模块：`pbs-portal`、`pbs-server`
- 页面：
  - `/pairing`
  - `/dashboard`
- 数据：
  - 使用开发库当前 bid period，例如 `Apr 2026`
  - 至少存在两个可查询到 run date 的 pairing number，例如 `M4959`、`C4513`
  - 至少存在一个可编辑的 crew / bid draft

## 自动化验证要求

- 后端单元 / 集成测试：
  - `pbs-server/src/services/pairing/pairing-bid-service.test.ts`
  - `pbs-server/src/services/calendar/bidding-calendar-service.test.ts`
- 前端回归测试：
  - `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
  - `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`
- 构建与静态检查：
  - `npm --prefix pbs-server test`
  - `npm --prefix pbs-server build`
  - `npm --prefix pbs-portal test`
  - `npm --prefix pbs-portal lint`
  - `npm --prefix pbs-portal build`

## 手工回归用例

### 1. 右侧新增单 pairing 单日期

步骤：
1. 进入 `/pairing`。
2. 在 `ALL PROPERTIES` 中点击 `Pairing Number` 加号。
3. 选择至少一个 Tx。
4. 在 `BID` 搜索并选择 `M4959`。
5. 选择 `Specific Date`。
6. 在 `RUN DATE` 中选择 `2026-04-10`。
7. 确认 `CONFIRMED RUNS` 出现 `M4959 2026-04-10`。
8. 点击 `ADD BID`。

期望：
- 请求体 bid 为 `type: "pairing-occurrence-list"`。
- `occurrences` 包含 `{ pairingNumber: "M4959", originDate: "2026-04-10" }`。
- Existing 中展示该条件。
- 重新刷新 `/pairing` 后条件仍存在。
- 相关新增和刷新接口耗时目标 < 2s。

### 2. 右侧新增多 pairing 多日期

步骤：
1. 打开 `Pairing Number` 配置弹窗。
2. 在 `BID` 中选择 `M4959` 和 `C4513`。
3. 选择 `Specific Date`。
4. 选择 `M4959 -> 2026-04-10`。
5. 切换到 `C4513`。
6. 选择 `C4513 -> 2026-04-13`。
7. 确认 `CONFIRMED RUNS` 同时展示两条结果。
8. 点击 `ADD BID`。

期望：
- 保存为一条 Existing bid，而不是拆成两条用户不可见 bid。
- 请求体包含两条 occurrence。
- `GET /api/pairing-bids/current` 返回同一个 `propertyGroupKey` 下的 `pairing-occurrence-list`。
- 刷新后仍能回显两条 occurrence。
- 新增和读取接口耗时目标 < 2s。

### 3. 删除已确认 run date

步骤：
1. 编辑一条包含多条 occurrence 的 `Pairing Number` Existing。
2. 在 `CONFIRMED RUNS` 中点击其中一条右侧的删除按钮。
3. 点击保存。

期望：
- 被删除的 occurrence 不再出现在 Existing 摘要中。
- 重新打开编辑弹窗，被删除项不再回显。
- 左侧日历和 Dashboard 不再显示该 occurrence 对应事件。
- `PATCH /properties/:propertyGroupKey` 耗时目标 < 2s。

### 4. Existing 编辑保持同一条 bid

步骤：
1. 编辑已有 `Pairing Number` Existing。
2. 增加一个新的 run date。
3. 保存。

期望：
- 保存使用原 `propertyGroupKey`。
- Existing 列表中仍是一条 bid，只更新 occurrence 明细。
- 数据库 `pbs_bid_pairing_occurrence` 中旧明细被替换为最新集合。
- 编辑接口耗时目标 < 2s。

### 5. 收藏保存和直接添加 Existing

步骤：
1. 在 `Pairing Number` 配置弹窗中选择多条 occurrence。
2. 点击 `SAVE FAVORITE`。
3. 在 `FAVORITED PROPERTIES` 中确认收藏展示 Tx 禁用态和 occurrence 摘要。
4. 点击该收藏的添加按钮。

期望：
- 收藏保存完整 `pairing-occurrence-list` 快照。
- 从收藏添加时直接进入 Existing，不再二次确认。
- Existing 中保留完整 pairing number + run date 对应关系。
- 收藏保存、收藏添加、收藏删除接口耗时目标 < 2s。

### 6. 左侧 Bidding Calendar 快速添加

步骤：
1. 在 `/pairing` 左侧 `BIDDING CALENDAR` 点击某一天。
2. 选择一个 pairing occurrence 并添加。
3. 查看右侧 Existing。

期望：
- 左侧添加也保存为 `pairing-occurrence-list`。
- 右侧 Existing 能看到同一条 bid。
- 从右侧编辑该 bid 可以回显左侧添加的 occurrence。
- 左侧添加和日历刷新接口耗时目标 < 2s。

### 7. 右侧删除后左侧日历同步消失

步骤：
1. 使用左侧或右侧新增一条 Pairing Number occurrence。
2. 确认左侧日历显示对应 pairing 事件。
3. 在右侧 Existing 删除该 bid。

期望：
- Existing 删除成功。
- 左侧日历对应事件消失。
- Dashboard 对应事件也不再显示。
- 删除和刷新接口耗时目标 < 2s。

### 8. Dashboard 日历一致性

步骤：
1. 在 `/pairing` 新增或编辑 Pairing Number occurrence。
2. 强制刷新页面。
3. 进入 `/dashboard`。

期望：
- Dashboard 日历读取结果与 `/pairing` 左侧日历一致。
- 不出现 `/pairing` 与 `/dashboard` 读取不同数据源导致的展示差异。
- Dashboard 日历读取接口耗时目标 < 2s。

### 9. Prefer Off 冲突校验

步骤：
1. 为某个 Tx 添加一个 Prefer Off 日期。
2. 在 Pairing Number 中为同一 Tx 添加覆盖该日期的 occurrence。

期望：
- 后端返回统一错误响应 `{ code, data: null, message }`。
- 前端只展示统一 message，不出现重复 DOM 错误面板。
- 不保存冲突的 Pairing Number bid。

### 10. Entire Month 兼容

步骤：
1. 新增 `Pairing Number`。
2. 在 `BID` 选择一个或多个 pairing number。
3. 保持 `Entire Month`。
4. 点击 `ADD BID`。

期望：
- 仍保存为 `tag-list`。
- 不写入 `pbs_bid_pairing_occurrence` 明细。
- Existing、收藏和 Search Pairings 旧逻辑不被破坏。

## 性能观察记录

手工验证时在浏览器 Network 面板记录以下接口：

| 接口 | 操作 | 目标 |
| --- | --- | --- |
| `GET /api/pairing-bids/current` | 读取当前 draft | < 2s |
| `POST /api/pairing-bids/current/properties` | 新增 Existing | < 2s |
| `PATCH /api/pairing-bids/current/properties/:propertyGroupKey` | 编辑 Existing | < 2s |
| `DELETE /api/pairing-bids/current/properties/:propertyGroupKey` | 删除 Existing | < 2s |
| `POST /api/pairing-bids/current/favorites` | 保存收藏 | < 2s |
| `DELETE /api/pairing-bids/current/favorites/:favoriteKey` | 删除收藏 | < 2s |
| `GET /api/bidding-calendar/current` | 左侧日历刷新 | < 2s |
| Dashboard 日历相关读取接口 | Dashboard 日历刷新 | < 2s |

如果任一接口稳定超过 2s，需要继续定位数据库索引、N+1 查询、重复前端请求或 live occurrence 查询耗时，不能只记录为已知问题。
