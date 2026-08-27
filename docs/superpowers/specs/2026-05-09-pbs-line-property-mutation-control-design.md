# PBS Line Property 删除与已有条件修改并发控制设计

## 背景

Line 模块已经把新增 property 接入了逐条接口和前端单飞控制，但删除 existing property、修改 existing property 的 Tx / bid / modifier 仍可能回落到整份 draft 保存。用户快速点击删除或右侧 Tx 时，容易出现重复请求、draftVersion 冲突、409，体验不稳定。

用户还指出一个业务边界：如果已生成条件从 `T1` 改为 `T2`，再用相同条件新增一个 `T1`，这不应该被误判为重复。重复判断应基于完整业务签名，而不是只看 property 或部分字段。

## 目标

- Line 的新增、删除、修改 existing property 都走逐条接口，避免整份 draft 保存带来的竞态。
- 删除按钮、existing Tx、available Tx、Add 按钮在草稿结构变更进行中保持 pending / disabled，避免接口风暴。
- 重复判断只拦截完全重复的 Line property：`propertyCode + bid + modifier + active tiers` 全部一致才算重复。
- 保持接口性能要求：新增、删除、修改相关接口在本地探针中应小于 2 秒。
- 不扩大到非 PBS 模块，不做无关重构。

## 范围

前端：

- `pbs-portal/src/features/line/pages/line-page.tsx`
- `pbs-portal/src/shared/services/line-service.ts`
- `pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx`
- `pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx`
- 相关 Line / RuleBid 测试

后端与 contract：

- `packages/contracts/pbs-line-bids.js`
- `packages/contracts/pbs-line-bids.d.ts`
- `pbs-server/src/routes/line-bids.ts`
- `pbs-server/src/services/line/types.ts`
- `pbs-server/src/services/line/line-bid-service.ts`
- 必要时新增 Line property write helper，但不为了减少行数硬拆。

文档：

- 新增或更新 `docs/test-cases/pbs/line/` 下 QA 测试案例。

## 推荐方案

采用与 DaysOff / Pairing 一致的逐条 mutation 模式。

### API

新增：

- `PATCH /api/line-bids/current/properties/:propertyGroupKey`
- `DELETE /api/line-bids/current/properties/:propertyGroupKey`

请求携带当前 draft 稳定信息：

- `draftKey`
- `bidId`
- `periodCode`
- `bidContext`
- `draftVersion`
- patch 时携带更新后的 property 内容

后端使用 `propertyGroupKey` 定位已有记录，用 `draftVersion` 做并发保护。版本不匹配返回 409；找不到目标 property 返回 404；重复 property 返回 409。

### 前端交互

- LinePage 接入 `onDeleteProperty` 和 `onUpdateProperty`。
- `RuleBidRightPanel` 已有的 pending key 继续作为单飞锁；新增覆盖 available Tx。
- 当任一草稿结构 mutation pending 时：
  - Add disabled
  - existing 删除 disabled
  - existing Tx readonly
  - available Tx readonly
- 失败时回滚 UI 状态并提示错误；成功后更新本地 cache 的 draft meta 和 existing properties。

### 重复规则

重复判断以完整 property 签名为准：

- propertyCode 相同
- bid 相同
- active tiers 集合相同
- modifier 字段相同（Line 当前主要为无 modifier，保留通用比较能力）

因此：

- 已有 `T2`，新增同条件 `T1`：允许。
- 已有 `T2`，新增完全相同 `T2`：拦截。
- 已有 `T1,T2`，新增 `T2,T1`：视为重复，因为 active tiers 集合一致。

## 验收标准

- 删除 Line existing property 时，只触发 DELETE 逐条接口，不触发整份 draft 保存。
- 修改 Line existing property 的 Tx 时，只触发 PATCH 逐条接口，不触发整份 draft 保存。
- 快速点击删除、existing Tx、available Tx、Add 时不会形成接口风暴。
- `T2 existing + 同条件 T1 add` 可以成功新增。
- 完全重复 property 仍会在前端或后端被拦截。
- `npm run verify:pbs` 通过。
- 本地接口探针验证 Line add / patch / delete 关键请求均小于 2 秒。

## 测试计划

自动化测试：

- pbs-server route 测试覆盖 Line `PATCH` / `DELETE`。
- pbs-server service 测试或 route mock 覆盖 draftVersion 冲突、找不到 property、正常响应。
- pbs-portal Line 页面测试覆盖：
  - 删除走 `lineService.removeCurrentDraftProperty`
  - existing Tx 修改走 `lineService.patchCurrentDraftProperty`
  - pending 期间禁用删除、existing Tx、available Tx、Add
  - existing 改为 `T2` 后，同条件 `T1` 可以新增
  - 快速点击不会重复调用 mutation

QA 人工测试案例：

- 新增 `docs/test-cases/pbs/line/2026-05-09-line-property-mutation-control.md`
- 覆盖添加、删除、修改 Tx、快速点击、重复判断、409 冲突提示和回归范围。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 Line property CRUD 与共享 RuleBid 面板，核心文件耦合较强，拆多代理会增加冲突和集成成本。
- Suggested split: 不拆。
- Write boundaries: PBS contracts、pbs-server Line route/service、pbs-portal line service/page/right panel/tests、QA 文档。
- Conflict risk: 中等，主要在 `rule-bid-right-panel.tsx` 与 Line service。
- Execution gate: 用户确认本 spec 后进入实现。
