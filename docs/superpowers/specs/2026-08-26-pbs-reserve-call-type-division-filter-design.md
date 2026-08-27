# PBS Reserve Preference Call Type 按机组类型筛选设计

## 背景

当前 PBS Portal 的 `Configure Reserve Preference` 弹窗中，`SHORT-CALL TYPE` 下拉展示的是 property 301 配置里的全量选项：

- `CRAM`
- `CRPM`
- `PRAM`
- `PRMM`
- `PRPM`
- `RESA`
- `RESB`

这会导致不同类型的机组看到不属于自己的 reserve call type。用户期望 Reserve Preference 根据当前 crew 的 `division` 和系统 reserve 配置进行筛选：

- Pilot / 飞行员只看到 P 系列 reserve call type。
- Cabin / 客舱只看到 C 系列 reserve call type。

当前系统已经有可复用配置来源：live schema 的 `dictionary` 表中 `parent_code = 'RES_CALL_TYPE'`。

现有 seed 中的配置语义为：

| dictionary code | name | code_value |
| --- | --- | --- |
| `P_AM` | Pilot Reserve AM | `PRAM|04:00|16:00|0` |
| `P_MM` | Pilot Reserve Mid | `PRMM|10:00|22:00|0` |
| `P_PM` | Pilot Reserve PM | `PRPM|14:00|23:59|0` |
| `C_AM` | Cabin Reserve AM | `CRAM|03:00|15:00|0` |
| `C_PM` | Cabin Reserve PM | `CRPM|10:00|22:00|0` |

其中 `P_* / C_*` 是配置分组，真正保存和展示的 call type 是 `code_value` 的第一段，例如 `PRAM`、`CRPM`。

## 目标

1. Current Bid 里的 `Reserve Preference` 下拉按当前 crew 的 division 展示可用 call type。
2. Standing Bid 里的 `Reserve Preference` 下拉使用同样规则。
3. 前端不硬编码 `P -> PRAM/PRMM/PRPM`、`C -> CRAM/CRPM`，而是消费后端按系统配置过滤后的 catalog。
4. 后端保存 Current Reserve 和 Standing Reserve 时做同样校验，防止绕过前端提交错误 call type。
5. Help 同步说明不同 crew 看到的 Reserve Preference call type 可能不同。
6. 不改变已保存 bid 的 payload 结构，不影响算法导出和 CSV 后续逻辑。

## 非目标

- 不新增数据库表。
- 不新增 migration，除非某个环境缺少 `RES_CALL_TYPE` 配置，需要单独执行现有 seed / 数据修复。
- 不修改 property 301 的持久化结构。
- 不自动清理历史已保存的跨 division call type。
- 不改变 Reserve Preference 的 date scope 行为。
- 不改 Pairing / Days Off / Dashboard 的日历显示。
- 不把 `RESA / RESB` 硬塞给任何 crew；如果配置里没有明确归属，本次不展示。

## 术语确认

用户口头提到的 “PM 开头 / CM 开头” 在当前系统中对应的是配置 code 前缀：

- Pilot 使用 `dictionary.code LIKE 'P_%'`，展示 `code_value` 第一段，如 `PRAM / PRMM / PRPM`。
- Cabin 使用 `dictionary.code LIKE 'C_%'`，展示 `code_value` 第一段，如 `CRAM / CRPM`。

最终用户看到的是 reserve call type 本身，不显示 `P_AM / C_PM` 这种配置 key。

## 数据来源

### Crew 身份

优先使用后端当前 actor 的 crew 身份解析结果：

- `crew_id`
- `division`
- `rank`

当前筛选主要依赖 `division`。`rank` 作为上下文保留，避免后续系统 reserve 配置扩展到 rank 维度时再次改接口结构。

### Reserve 配置

读取 live schema 的 `dictionary`：

```sql
select code, name, code_value, idx
from dictionary
where parent_code = 'RES_CALL_TYPE'
order by idx, code;
```

解析规则：

- `code` 的第一段决定适用 division：
  - `P_` -> `division = 'P'`
  - `C_` -> `division = 'C'`
- `code_value` 用 `|` 分割，第一段是保存用 call type。
- 空值、格式错误、重复 call type 过滤掉。
- 结果按 `idx`、`code` 排序。

如果当前 crew division 没有对应配置：

- catalog 返回空 options。
- 前端下拉 disabled 或显示空状态。
- `ADD BID / SAVE BID` disabled。
- 后端保存返回业务错误，例如 `Reserve Preference is not configured for this crew type.`

不回退到全量列表，避免把配置错误掩盖成业务正常。

## 方案比较

### 方案 A：后端下发筛选后的 catalog，前端只渲染

后端在 current reserve 和 standing reserve 的 catalog 构建阶段，根据 actor division 过滤 property 301 的 default bid options。

优点：

- Current Bid 和 Standing Bid 天然一致。
- 后端保存校验可以复用同一个配置解析逻辑。
- 前端不会重复维护一份业务规则。
- 防止用户绕过 UI 直接提交错误 call type。

缺点：

- `standing-bid-service` 需要补充读取 live `dictionary` / actor identity 的依赖。

### 方案 B：前端根据 session/profile 过滤 options

前端拿到全量 catalog 后，根据当前用户 division 自己过滤。

优点：

- 改动小。

缺点：

- 后端仍会接受错误 call type。
- Current Bid、Standing Bid、Line/Mixed Line 等入口容易各自漏改。
- 前端需要硬编码配置语义，不符合“根据系统 reserve 配置”的要求。

### 方案 C：改 property 301 的 validation_json

为不同 division 建多份 property 或在 validation_json 里写结构化 division options。

优点：

- property 自身表达更完整。

缺点：

- 会影响 property catalog / seed / migration，变更面大。
- 现有 `dictionary.RES_CALL_TYPE` 已经是 reserve 配置来源，重复建配置源会增加长期维护成本。

推荐方案：方案 A。

## 后端设计

### 1. 新增共享 resolver

新增一个 reserve call type resolver，例如：

`pbs-server/src/services/reserve/reserve-call-type-options.ts`

职责：

- 解析 actor crew 的 division / rank。
- 读取 `dictionary.RES_CALL_TYPE`。
- 按 division 筛选 call type。
- 返回：

```ts
type ReserveCallTypeOptionContext = {
  division: string | null;
  rank: string | null;
  options: string[];
};
```

### 2. Current Reserve catalog 过滤

修改 `createPbsReserveBidService`：

- `getCurrentDraft(actor)` 读取 property catalog 后，用 resolver 过滤 property 301 的 `defaultBid.options`。
- 如果默认 `callType` 不在过滤后 options 中，默认值改成过滤后第一项。
- 如果 options 为空，默认 `callType` 为空字符串。
- 已保存 draft 的 summary 可以继续展示历史值，但编辑弹窗和新增入口只使用过滤后 options。

### 3. Current Reserve 保存校验

在以下写入路径中校验 `Reserve Preference` 的 call type 必须属于当前 crew 可用 options：

- `saveCurrentDraft`
- `addCurrentDraftProperty`
- `patchCurrentDraftProperty`

校验失败返回 400 业务错误，不落库。

### 4. Standing Reserve catalog 过滤

修改 `createPbsStandingBidService` 的初始化参数，补充读取 live 配置所需上下文：

- `pgPool`
- `liveSchema`
- `pbsSchema` 如需要从 PBS 用户投影补充身份

`getCurrentStandingBid(actor)` 和 `saveStandingDraft(actor, request)` 都使用同一 resolver。

Standing Bid 的 reserve catalog 中：

- property 301 的 options 按 actor division 过滤。
- property 312 / 313 / 314 不受影响。
- lineholder catalog 不受影响。

### 5. Standing Reserve 保存校验

Standing Bid 保存时，如果 `mode = "reserve"` 或 draft 内有 `reserve-call-type-date-scope`：

- call type 必须属于当前 actor 可用 reserve call type options。
- 如果是 `reserve-flying-date-pattern` 的 reserve segment，也应使用同一 options 校验，避免 Standing Bid 中其它 reserve 类型入口绕过。

### 6. Contract 与 payload

不改 payload shape：

```json
{
  "type": "reserve-call-type-date-scope",
  "callType": "PRAM",
  "options": ["PRAM", "PRMM", "PRPM"],
  "dateScope": { "mode": "whole_month" }
}
```

只改变 `options` 的来源和合法范围。

## 前端设计

### 1. Reserve Preference 弹窗

`ReservePreferenceDialog` / `ReservePreferenceEditor` 保持使用 `property.bid.options`。

需要修正：

- 不再 fallback 到 contract 全量 `pbsReserveShortCallTypes` 作为 UI 下拉来源。
- 当 `property.bid.options` 为空：
  - 下拉 disabled。
  - `ADD BID / SAVE BID` disabled。
  - 显示项目风格的轻量提示：`No reserve call types are configured for your crew type.`

### 2. Standing Bid 弹窗

`StandingReserveCallTypeDateScopeControl` 继续使用 `bid.options`，但需补齐空 options 行为：

- options 为空时禁用保存。
- 不显示全量 fallback。

### 3. Existing bid 展示

历史已保存 bid 如果包含不属于当前 division 的 call type：

- Existing list 仍按原值展示，避免用户误以为数据消失。
- 进入编辑时只允许选择当前 division 合法 options。
- 后端不会允许再次保存非法 call type。

## Help 更新

更新 PBS Portal Help：

- `Reserve Preference` 说明：
  - `SHORT-CALL TYPE` 来自公司 reserve call type 配置。
  - Pilot crew 只看到 P 系列配置对应的 call type，例如 `PRAM / PRMM / PRPM`。
  - Cabin crew 只看到 C 系列配置对应的 call type，例如 `CRAM / CRPM`。
  - 不同 crew 看到的选项可能不同，这是按 crew type 控制的正常行为。
- Standing Bid 说明：
  - Standing Bid 的 Reserve Preference 也按同样规则筛选。
- Condition Reference 说明：
  - 不再写“such as PRAM, PRMM, PRPM, CRAM, CRPM, RESA, or RESB”这种全量暗示。

如果 Help 里有截图涉及 `Configure Reserve Preference`，需要在实现后用真实 UI 重新捕获或确认截图不误导。

## 测试要求

### 后端 Vitest

新增或更新：

- `pbs-server/src/services/reserve/reserve-validation.test.ts`
  - Pilot actor 允许 `PRAM / PRMM / PRPM`。
  - Pilot actor 拒绝 `CRAM / CRPM`。
  - Cabin actor 允许 `CRAM / CRPM`。
  - Cabin actor 拒绝 `PRAM / PRMM / PRPM`。
  - 无配置时拒绝保存。

- `pbs-server/src/services/reserve/reserve-bid-service.test.ts`
  - `getCurrentDraft` 返回过滤后的 property 301 options。

- `pbs-server/src/services/standing-bid/standing-bid-service.test.ts`
  - Standing Reserve catalog 返回过滤后的 property 301 options。
  - Standing Reserve 保存拒绝跨 division call type。

### 前端 Vitest

新增或更新：

- `pbs-portal/src/features/reserve/components/reserve-short-call-type-dialog.test.tsx`
  - options 为 `PRAM/PRMM/PRPM` 时只渲染 P 系列。
  - options 为空时保存按钮 disabled 并显示配置缺失提示。

- `pbs-portal/src/features/standing-bid/pages/standing-bid-page.test.tsx`
  - Standing Bid 打开 Reserve Preference 时只出现 catalog 返回的 options。

### Help 内容测试

更新 Help 相关 Playwright / content regression：

- 能在 Help 搜到 `Reserve Preference`。
- Help 中说明 Pilot / Cabin 的 short-call type 来源和筛选逻辑。
- 不再暗示所有 crew 都能看到全量 reserve call type。

### Playwright 回归

实现后至少跑：

- Pilot crew 登录：
  - Current Bid -> ROSTER -> Reserve Preference，只能看到 `PRAM / PRMM / PRPM`。
  - Standing Bid -> ROSTER -> Reserve Preference，只能看到 `PRAM / PRMM / PRPM`。

- Cabin crew 登录：
  - Current Bid -> ROSTER -> Reserve Preference，只能看到 `CRAM / CRPM`。
  - Standing Bid -> ROSTER -> Reserve Preference，只能看到 `CRAM / CRPM`。

- 回归确认：
  - Date Scope 行为不变。
  - T1-T7 选择行为不变。
  - 保存 payload 结构不变。
  - Bid / Standing Bid 页面其它 property 不受影响。

## 验收标准

1. Pilot crew 不会在 Reserve Preference 下拉中看到 `CRAM / CRPM`。
2. Cabin crew 不会在 Reserve Preference 下拉中看到 `PRAM / PRMM / PRPM`。
3. Current Bid 和 Standing Bid 行为一致。
4. 通过接口直接提交跨 division call type 会被后端拒绝。
5. `RESA / RESB` 不再无归属地默认展示。
6. Help 与实际 UI 一致。
7. 不需要数据库 migration；如果某环境缺配置，作为数据问题执行既有 seed / 数据修复。

## 风险与约束

- 不要只改前端，否则接口仍能保存错误数据。
- 不要写死 `PRAM / CRPM` 列表，必须从 `dictionary.RES_CALL_TYPE` 取。
- 不要把 `P_* / C_*` 展示给用户，它们只是配置 key。
- 不要自动修改历史 bid 数据。
- 不要因为 options 为空 fallback 到全量列表，这会掩盖配置问题。
- 注意 `standing-bid-service` 当前只注入 `db`，实现时需要补充 live 配置读取依赖，但不要顺手重构 standing service。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动跨前后端，但核心逻辑集中在 reserve call type resolver、Current Reserve、Standing Bid 和小范围前端/help。拆 agent 会增加 contract 对齐成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/reserve/*`、`pbs-server/src/services/standing-bid/*`、`pbs-server/src/app.ts`、`pbs-portal/src/features/reserve/*`、`pbs-portal/src/features/standing-bid/*`、`pbs-portal/src/features/help/*`、对应测试和 QA 文档。
- Conflict risk: 中等，主要是 Standing Bid 同时合并 lineholder/reserve catalog，不能误伤 Line / Pairing / Days Off。
- Execution gate: 用户确认本 spec 后再实现。
