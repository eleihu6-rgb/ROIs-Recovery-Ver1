# PBS Days Off 新 bid 类型路由校验与错误提示修复

日期：2026-05-20  
状态：已确认并实施  
范围：修复 Days Off 新增/更新 property 时，新增 bid value 类型未进入 route schema 导致接口 400；同时修复 API mutation 失败时 toast/message 与右侧面板错误重复展示。

## 问题

用户在新增 `Days Off / Days On Pattern` (`propertyCode=205`) 时，请求：

```json
{
  "property": {
    "propertyCode": 205,
    "bid": {
      "type": "days-off-on-pattern",
      "minDaysOff": 3,
      "minDaysOn": 3,
      "maxDaysOn": 5,
      "min": 1,
      "max": 14
    },
    "tiers": ["T1"]
  }
}
```

接口返回：

```json
{"code":400,"data":null,"message":"Invalid days off property payload."}
```

根因不是请求字段过多，而是 `pbs-server/src/routes/lineholder-route-utils.ts` 的 `ruleBidValueSchema` 没有同步新增 bid 类型，导致请求在进入 service 之前被 Zod schema 拦截。

同时前端 mutation 失败时既调用 `message.error(...)`，又把接口错误写入 `saveErrorMessage`，导致右侧面板出现 `role="alert"` 红色错误块，形成重复错误提示。

## 修复目标

1. `ruleBidValueSchema` 支持本轮新增的结构：
   - `stepper-date-range`
   - `days-off-on-pattern`
   - `crew-days-off-share`
2. Days Off route 层测试覆盖 204 / 205 / 206 payload，确保以后不会只测 service 层而漏 route schema。
3. API mutation 失败时统一走 `message.error(...)`，不再额外渲染右侧面板错误块。
4. 请求中的 draft identity 字段保留，用于 current draft 定位和版本并发控制；不在本轮改 API contract。

## 不做范围

- 不修改 205 的字段语义、UI 文案或保存映射。
- 不修改数据库 schema。
- 不移除 `draftKey`、`bidId`、`periodCode`、`bidContext`、`draftVersion`。
- 不改非 API mutation 的页面级校验提示。

## 验收标准

1. `POST /api/days-off-bids/current/properties` 能接受 205 `days-off-on-pattern` payload。
2. route 测试覆盖 204 / 205 / 206 三类新结构。
3. add/update API 失败时不会再渲染右侧面板 `role="alert"` 错误块。
4. 相关测试、build/lint 和 `git diff --check` 通过。

## 实施记录

1. 在 `pbs-server/src/routes/lineholder-route-utils.ts` 中同步扩展 route 层 `ruleBidValueSchema`，支持：
   - `stepper-date-range`
   - `days-off-on-pattern`
   - `crew-days-off-share`
2. 在 `pbs-server/src/routes/days-off-bids.test.ts` 增加 route 级新增 property 测试，直接覆盖 204 / 205 / 206 三类结构化 `bid` payload，防止只测 service 层而漏掉 route schema。
3. 在 `pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx` 调整 mutation 失败处理：API 返回错误时只走 `message.error(serverMessage)`，不再把同一条接口错误写入右侧面板 `saveErrorMessage`。
4. 在 `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx` 增加前端回归测试，确认 API add 失败时不会渲染右侧面板 `role="alert"` 错误块。

## 验证记录

1. `pnpm --dir pbs-server test -- routes/days-off-bids.test.ts days-off/days-off-validation.test.ts lineholder/rule-bid-value.test.ts`：通过，实际执行 195 个测试。
2. `pnpm --dir pbs-portal test -- days-off-page.test.tsx pairing-bid-control.test.tsx`：通过，实际执行 302 个测试。
3. `pnpm --dir pbs-portal lint -- src/features/rule-bids/components/rule-bid-right-panel.tsx src/features/days-off/pages/days-off-page.test.tsx src/features/pairing/components/pairing-bid-control.tsx`：通过。
4. `pnpm --dir pbs-server build`：通过。
5. `pnpm --dir pbs-portal exec tsc --noEmit --pretty false`：通过。
6. `pnpm --dir pbs-portal build`：通过；Vite 仍有既有 chunk size warning。
7. `git diff --check`：通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 小范围 bug fix，涉及 route schema、共享右侧面板和测试，拆分会增加同步成本。
- Suggested split: 不拆分。
- Write boundaries: 主 agent 修改 route schema、route/UI 测试、`RuleBidRightPanel` mutation catch 逻辑。
- Conflict risk: 中等；当前工作树已有 205 相关未提交改动，实施时只在现有 diff 上增量修复。
- Execution gate: 用户已明确要求继续修复。
