# PBS Days Off Prefer Off API 与 Tx 语义修复设计

日期：2026-05-20

## 背景

当前 Days Off `Prefer Off` 保存出现了错误的硬校验：

- 用户只在 `T2` 添加 Prefer Off，系统仍可能因为已有 `T1` 数据报 `Prefer Off dates overlap for T1...`。
- 用户 PATCH 某条 `Prefer Off` 时，如果同一 Tx 下存在重复日期，也会被 400 拦截。
- 请求体把前端 UI property 对象几乎整体传给后端，包括 `name`、`suggestions`、`bidContext`、`periodCode` 等冗余字段。

这暴露了两个问题：

1. `Prefer Off overlap` 被误当成必须阻止保存的业务错误。
2. Days Off mutation API 契约过重，不符合资源化、轻量化和性能要求。

## 业务语义依据

参考资料：

- `init-docs/AA-Flight-Attendant-PBS-Guide_10JAN19.pdf`
- `init-docs/crew_bids_reference-2026-03-16-072929.xlsx`
- `init-docs/crew_bids_reference-2026-03-16-072929.md`
- `docs/superpowers/specs/2026-05-12-pbs-tier-aa-coverage-review.md`

结论：

- AA 文档使用 `Layer 1-7`，本项目 UI/API 统一表达为 `T1-T7 / Tx`。
- Tx 是 PBS bid 优先层，不是普通标签。不同 Tx 可以有不同规则。
- 同一 Tx 内的多个 preference 被视为 equal importance。
- PBS 是 cumulative 流程，后续 Tx 会在前面 Tx 处理结果基础上继续筛选或放宽。
- AA / 旧库都没有把 `Prefer Off` 日期重复描述为必须阻止保存的硬错误。
- 旧库 `crew_bids` 中同一 `crew + period + layer` 下可见大量 `Prefer Off` 日期重复、子集重复或不同形式重复，说明重复日期更接近冗余表达，不应被保存接口硬拒绝。

## 目标

- 修正 `Prefer Off` 的 Tx 语义：不同 Tx 相同日期允许；同 Tx 重复日期不再硬 400。
- 精简 Days Off mutation API 请求体，避免前端传 UI-only 或可由后端推导的字段。
- 使用更标准的资源化接口语义：新增用 `POST`，替换/更新用 `PUT`，删除用 `DELETE`。
- 保持单条 property mutation，不回退到整份 draft 保存。
- Days Off 读写接口正常场景响应时间目标小于 2 秒。
- 补齐单元测试、接口测试、前端回归测试和人工测试案例。

## 非目标

- 不重做整个 PBS bid 数据模型。
- 不恢复旧 `calendar-days-off` 前端存储路径。
- 不把 AA Layer Tab 的 pairing pool / award / reason report 一起实现。
- 不新增算法层 award 判断。
- 不把 `T1-T7` 改回 `L1-L7` 文案。

## API 契约设计

### 新增 property

`POST /api/days-off-bids/current/properties`

请求体只包含 mutation 必需字段：

```json
{
  "draftVersion": 1027,
  "propertyCode": 201,
  "bid": {
    "type": "tag-list",
    "values": ["2026-04-19", "2026-04-20"]
  },
  "tiers": ["T2"],
  "allOrNothing": false,
  "minimumN": null
}
```

说明：

- `propertyCode` 用于新增时定位 catalog definition。
- `name` 不从前端传，后端从 catalog 读取。
- `suggestions` 不传、不入库。
- `draftKey`、`bidId`、`periodCode`、`bidContext` 原则上不再作为 mutation body 必填。
- 如当前后端仍需要定位 current draft，优先从登录态和 current period 推导；保留兼容字段必须作为过渡方案，不作为前端新调用的主契约。

### 更新 property

`PUT /api/days-off-bids/current/properties/:propertyGroupKey`

请求体：

```json
{
  "draftVersion": 1027,
  "bid": {
    "type": "tag-list",
    "values": ["2026-04-19", "2026-04-20", "2026-04-21"]
  },
  "tiers": ["T1"],
  "allOrNothing": false,
  "minimumN": null
}
```

说明：

- `propertyCode` 不由前端重复传，后端通过 `propertyGroupKey` 查目标 property。
- `name`、`suggestions` 不传。
- PUT 表达“替换这条 property 的业务内容”，而不是 patch 整份 draft。
- 旧 `PATCH` 如需兼容，可短期保留并转发到同一 service；前端应切到 `PUT`。

### 删除 property

`DELETE /api/days-off-bids/current/properties/:propertyGroupKey?draftVersion=1027`

说明：

- 删除只需要 `propertyGroupKey + draftVersion`。
- 不传整份 draft。
- 删除成功后返回新的 `draftVersion` 和必要 mutation meta。

## Prefer Off 校验策略

### 允许

- `T1` 和 `T2` 同一天都有 `Prefer Off`。
- 同一 Tx 中同一天被多个 `Prefer Off` property 覆盖。
- 同一 property 内 values 有重复日期。
- `Dates` 与 `Date Range` 覆盖相同日期。
- `Weekends` / `Days of Week` 与具体日期覆盖相同日期。

### 处理方式

- 后端保存时可对同一 property 的 `Prefer Off` values 做稳定去重，保持顺序可预测。
- 日历事件生成按 `date + tier` 去重，避免左侧小日历重复事件或断裂。
- Existing property 列表保留用户创建的 property 结构，不因去重擅自合并不同 property，除非已有明确 merge 规则。
- 对重复 Prefer Off 不返回 400；如后续需要提醒，只做非阻断 warning。

### 继续硬校验

以下仍应阻止保存：

- Unsupported property code。
- 空 tiers。
- 非法 Tx，例如 `T0`、`T8` 进入当前 `T1-T7` 主流程。
- `Min Consecutive Days Off In Window` 日期窗口 start > end。
- `Days Off / Days On Pattern` 字段缺失或 `minDaysOn > maxDaysOn`。
- `Shared Days Off With Employee` 缺员工号或 minimumDays 小于 1。
- AA 明确的同 Tx incompatible properties，例如 maximize/string 类 Days Off property 冲突。
- `Minimum Days Off Between Work Blocks` 在后续 Tx 变得更严格。

## 前端改动范围

- `pbs-portal/src/shared/services/days-off-service.ts`
  - 新增/更新 payload mapper，移除 `name`、`suggestions`、整份 UI property 传输。
  - 更新 property mutation 改用 `PUT`。
- `pbs-portal/src/features/days-off/pages/days-off-page.tsx`
  - 删除 `Prefer Off overlap` 阻断式预校验。
  - 保留其他 Days Off existing property 校验。
  - mutation 失败只走统一 message，不在右侧 panel 重复 alert。
- `pbs-portal/src/features/days-off/days-off-validation.ts`
  - 移除或降级 `Prefer Off overlap` 错误。
  - 保留 AA 明确硬校验和 informational messages。
- 日历相关 mapper
  - 确认按 `date + tier` 去重并保持连续 Off 渲染。

## 后端改动范围

- `packages/contracts/pbs-days-off-bids.js`
- `packages/contracts/pbs-days-off-bids.d.ts`
  - 增加轻量 mutation schema。
  - `PUT` route contract 替代前端使用的 `PATCH` contract。
  - 不接受 UI-only 字段作为新 contract 必填。
- `pbs-server/src/routes/days-off-bids.ts`
  - 接入 `PUT /current/properties/:propertyGroupKey`。
  - 旧 `PATCH` 如保留，只作为兼容入口。
- `pbs-server/src/services/days-off/days-off-bid-service.ts`
  - 更新 add/update request normalization。
  - 更新 PUT 更新逻辑：后端按 key 查 propertyCode/catalog。
  - 避免整份 draft 重写，继续只写目标 property。
- `pbs-server/src/services/days-off/days-off-validation.ts`
  - 移除 `Prefer Off` overlap 硬错误。
  - 保留真正业务错误。
- `pbs-server/src/services/calendar/prefer-off-calendar-events.ts`
  - 确保 `prefer_off_bid` 事件按 `date + tier` 去重。

## 性能要求

目标：

- Days Off current draft 读取接口正常场景 `< 2s`。
- Days Off property `POST / PUT / DELETE` 正常场景 `< 2s`。

实现约束：

- mutation 不读取或写回整份 draft 的大对象。
- 更新单条 property 时只删除/插入该 `propertyGroupKey` 对应 group。
- catalog 使用现有缓存或轻量查询，不在每次 mutation 做昂贵全表处理。
- 日历 invalidation 保持必要范围，不做额外全量请求链。

验证方式：

- 保留或补充 service / route 层耗时基线测试。
- 本地无法稳定测数据库性能时，至少确认 SQL 路径为单 property mutation，并在人工测试中记录 Network timing。

## 测试计划

### 后端单元测试

- `validateDaysOffDraftProperties` 允许同 Tx `Prefer Off` 重复日期。
- `validateDaysOffDraftProperties` 允许不同 Tx `Prefer Off` 相同日期。
- 保留 incompatible Days Off properties 的失败测试。
- 保留 204 / 205 / 206 字段校验测试。

### 后端 route/service 测试

- `POST /current/properties` 支持轻量 payload，不需要 `name/suggestions`。
- `PUT /current/properties/:propertyGroupKey` 支持轻量 payload，不需要 `propertyCode/name/suggestions`。
- `DELETE` 只需要 key 和 draftVersion。
- 重复 Prefer Off 不返回 400。
- 旧 `PATCH` 如保留，行为与 `PUT` 一致或明确兼容期限。

### 前端单元/组件测试

- 新增 Prefer Off 时 payload 不包含 `name`、`suggestions`、UI-only tiers object。
- 更新 Prefer Off 使用 `PUT` 服务方法。
- 同 Tx 重复 Prefer Off 不触发前端 message error。
- 不同 Tx 相同 Prefer Off 日期允许保存。
- API mutation 失败只显示统一 message，不出现右侧 panel 红色 alert。

### 日历回归测试

- 同一 `date + tier` 多条 Prefer Off 只渲染一次。
- 连续日期仍连成一条视觉横条。
- Dashboard / Days Off / Tier 使用同一 Prefer Off 来源。

### 人工测试案例

新增或更新：

- `docs/test-cases/pbs/days-off/2026-05-20-prefer-off-api-and-tx-semantics.md`

覆盖：

1. T1 已有 `2026-04-21`，T2 再添加 `2026-04-21`，保存成功。
2. T1 已有具体日期，T1 再添加覆盖同一天的 Date Range，保存成功，日历不重复。
3. PUT 更新 T1 Prefer Off 不因另一条 T1 Prefer Off 覆盖同日而 400。
4. Network 面板确认 mutation payload 精简。
5. Network timing 正常场景小于 2 秒。

## 验收标准

- 用户能在不同 Tx 保存相同 Prefer Off 日期。
- 用户能保存同 Tx 重复/重叠 Prefer Off，不再出现 `Prefer Off dates overlap...` 400。
- 左侧小日历不重复、不断裂。
- mutation 请求体不再包含 `name`、`suggestions`、整份 UI property。
- 前端更新 property 使用 `PUT` 或服务层等价资源化方法。
- 后端 route/service/validation 测试通过。
- 前端组件/服务测试通过。
- `pbs-server` build/test 通过。
- `pbs-portal` lint/test/build 通过。
- `git diff --check` 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次接口契约、业务校验、前端服务和 UI 回归强耦合，拆多 agent 容易出现 contract 不一致。
- Suggested split: 不拆分，由主 agent 单线实现。
- Write boundaries: `packages/contracts`、`pbs-server` Days Off route/service/validation/calendar、`pbs-portal` Days Off service/page/validation/calendar tests、`docs/test-cases`。
- Conflict risk: Medium。当前工作树已有多处 Days Off / calendar 未提交改动，必须避免回滚用户或既有修改。
- Execution gate: 用户确认本 spec 后才进入代码实现。
