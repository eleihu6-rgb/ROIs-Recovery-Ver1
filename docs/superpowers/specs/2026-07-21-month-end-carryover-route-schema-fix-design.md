# Month-End Carryover 路由校验修复设计

## 问题

`POST /api/pairing-bids/current/properties` 收到合法的 `month-end-carryover` bid 时返回：

```json
{"code":400,"data":null,"message":"Invalid pairing property payload."}
```

共享 TypeScript contract 和业务校验器已经支持以下两种结构，但 HTTP 入口使用的 `pairingBidValueSchema` 没有包含对应 Zod schema，因此请求在进入业务校验前被拒绝。

- `<`、`=`、`>`：使用 `days`
- `Between`：使用 `from` 和 `to`

## 目标

让所有复用 `pairingBidValueSchema` 的 pairing bid 入口一致识别 Month-End Carryover，同时继续拒绝不完整或非法的数据。

## 实现设计

在 `pbs-server/src/routes/pairing-bid-route-schemas.ts` 中新增专用的 `monthEndCarryoverBidSchema`：

- 单值分支：`type = "month-end-carryover"`，`operator` 为 `<`、`=` 或 `>`，`days` 为正整数。
- 区间分支：`operator = "Between"`，`from`、`to` 为正整数，并验证 `from <= to`。
- 使用 `.strict()` 拒绝与当前 operator 不匹配的多余字段。
- 将该 schema 加入共享 `pairingBidValueSchema`，不在各 route 中复制定义。

这样会统一覆盖 Current property、Favorite property、整份 Current draft、Standing Bid 保存入口，以及通过 `pairingSearchBidValueSchema` 复用它的 PREVIEW 入口。

Zod schema 只负责 bid 的结构和不依赖上下文的基础字段约束，包括正整数与区间顺序。现有 `validatePairingPropertyPayload` 继续负责第二层上下文业务校验，包括 `propertyCode = 163` 与 bid type 的对应关系、action、quantifier 和 property catalog 规则；不能用新增 Zod schema 替代或删除该校验。不修改前端 payload、共享 contract 或数据库。

## 测试

增加以下回归覆盖：

1. 直接测试 `monthEndCarryoverBidSchema`：接受合法单值和区间结构，拒绝非正整数、缺失字段、operator/字段不匹配及反向区间。
2. 用户提供的 `< 2 days` Current property payload 返回成功。
3. PREVIEW route 接受合法 Month-End Carryover property。
4. Standing Bid 保存 route 接受合法 Month-End Carryover property。
5. 非法 payload 在对应 HTTP 入口继续返回 400。

先运行相关路由和业务校验单测，再运行 `pbs-server` TypeScript build。

## 验收标准

- 用户提供的请求不再返回 `Invalid pairing property payload.`。
- Month-End Carryover 在 Current、Favorite、整份 Current draft、Standing Bid 和 PREVIEW 等共享 pairing bid 入口中的结构校验一致。
- 非法 Month-End Carryover payload 仍被拒绝。
- 不改变其他 pairing property 的现有行为。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: schema 与路由测试高度集中，工作量小，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: pairing route schema 与相关测试。
- Conflict risk: 低。
- Execution gate: 用户批准本规格后实施。
