# PBS Line 添加属性防连点与持久化链路设计

日期：2026-05-09  
作者：Codex + lei  
状态：已确认，实施中

## 背景

`/line` 页面在 Add Line Properties 区域快速点击 `+` 时，会连续触发多次 `PUT /api/line-bids/current`。这些请求携带的 `draftVersion` 可能相同，后端正确返回 409 防止旧草稿覆盖新草稿，但用户看到的是接口暴走和偶发保存失败。

根因是 Line 当前没有像 Days Off 一样接入逐条属性 mutation：

- Add 先本地追加到 existing list。
- 再由通用面板的 250ms 自动保存整份 draft。
- 快速点击会制造重复 existing property、并发整份保存和 stale draftVersion。

## 目标

1. 快速点击 Line 属性 `+` 时，同一时间只允许一个 draft 结构 mutation 在飞行中。
2. 重复点击同一个 property / bid / tiers 不应重复调用接口。
3. Line 添加属性走专门接口，行为对齐 Days Off，不再依赖整份 draft 自动保存。
4. 正常用户快速点击不应产生 409；后端仍保留 stale draftVersion 的 409 保护。
5. 接口性能继续满足 PBS 要求：单次相关接口小于 2 秒。
6. 补自动化测试和 QA 人工测试案例。

## 非目标

- 不重做 Line UI 布局。
- 不修改 Pairing / Days Off 业务行为。
- 不改 AA Line 属性范围和开关策略。
- 不为了文件行数做额外拆分。

## 方案

采用推荐方案：Line 添加属性接入专门 `POST /line-bids/current/properties` 接口，并在通用面板补充重复添加拦截。

### 前端

- `LinePage` 传入 `onAddProperty`。
- `lineService` 新增 `addCurrentDraftProperty(property, draftMeta)`。
- `RuleBidRightPanel` 在 `handleAddProperty` 里先做本地重复判断：
  - `propertyCode` 相同；
  - active tiers 相同；
  - bid value 相同；
  - modifier 相同。
- 重复时只提示已存在，不发请求。
- mutation pending 时 Add 按钮保持禁用，快速连点不会继续发请求。
- 添加成功后使用服务端返回的 `propertyGroupKey` 更新 query cache 和本地 existing list。

### 后端

- Contract 增加 Line properties route 和 mutation 类型。
- Route 增加 `POST /line-bids/current/properties`。
- Service 增加 `addCurrentDraftProperty(actor, request)`。
- 后端加载当前 draft、追加待添加 property、复用 Line draft 校验，再保存。
- 后端仍通过 `draftVersion` 做并发保护；如果请求来自旧草稿，继续返回 409。

## 验收标准

1. 快速双击同一个 Line property，只调用一次添加接口。
2. 已存在的同配置 property 再点 `+`，不调用接口，并提示已存在。
3. 正常添加一个 property 后，刷新页面仍可看到。
4. stale draftVersion 的后端请求仍返回 409。
5. `npm run verify:pbs` 通过。
6. 真实性能探针中添加接口小于 2 秒。

## 测试计划

### 自动化测试

- `pbs-portal/src/features/line/pages/line-page.test.tsx`
  - Line 添加走 `lineService.addCurrentDraftProperty`。
  - 快速双击只调用一次。
  - 重复 existing property 不调用接口。
- `pbs-server/src/routes/line-bids.test.ts`
  - `POST /api/line-bids/current/properties` 正常添加并返回 `propertyGroupKey`。
  - stale draftVersion 返回 409。

### QA 人工测试

- 在 `/line` 页面打开浏览器 Network。
- 快速双击 `Max Credit Window` 的 `+`。
- 预期只看到一次添加请求，不出现重复 property，不出现 409。
- 刷新页面，已添加属性仍存在。
