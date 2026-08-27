# 开发上下文（2026-05-25）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-25 10:30:23 CST
- Wing：`pbs`
- Topic：`pairing-check-in-time-or-conditions`
- Title：PBS Pairing Check-In Time 多 OR 条件上下文
- Git branch：`main`

## 本轮对话上下文

# PBS Pairing / Days Off 开发上下文快照

时间：2026-05-25
模块：pbs-server / pbs-portal / packages/contracts

## 本轮前置规则与用户偏好

- 用户强调：所有会改行为、多文件、schema/API/workflow 的任务必须先走 brainstorming/spec，用户确认后才能实现。
- 用户明确要求：文档和开发说明默认中文；可保留代码字段、API、错误信息英文。
- 用户非常重视回归测试、单元测试、测试案例，尤其不能把 Days Off / Pairing 已经修好的功能改坏。
- 用户偏好：开发阶段可以清理历史无用数据/旧逻辑，但必须有文档确认；不要为了保守留下两套数据源。
- 用户要求：接口规范、模块边界、性能意识，关键 Pairing / Days Off 操作目标 < 2s。
- 用户提醒：可见 UI 文案必须走 i18n，不要写死文本。

## 近期已完成的重要背景

### Days Off

- Days Off 已经做过较大整理：左侧共享小日历统一以 Days Off 保存的 Prefer Off 规则为源头，不再使用旧 calendar/day_off_bid 数据源。
- 旧 day_off_bid 命名/数据源已按方向改为 prefer_off_bid / Prefer Off 语义，目的是避免左右两套数据不一致。
- Days Off 的 Prefer Off 重复规则最终决定：暂时不拦截同 tier / 不同 tier 的重复，保留 AA/旧库习惯，等客户反馈再动。
- Days Off 收藏逻辑已从“收藏 property 类型”调整为“收藏已配置好的 bid 条件”，入口在配置弹窗底部，外部小红心已不作为主要收藏入口。
- Favorited Properties 可显示 tiers，因为收藏的是已配置条件；All Properties 不显示 tiers，因为还未配置。
- 收藏删除需要二次确认；favorite tiers 是禁用状态但保留颜色，不给 hover 可点击误导。
- Days Off / Pairing 最近改动较多，注意避免触碰无关文件。

### Pairing 已完成方向

- Pairing Number 已与左侧日历入口讨论过：需要尽量统一路径，避免像 Days Off 以前一样出现两套数据源。
- Pairing Number 的交互已调整为单个 Configure Pairing Bid 弹窗中处理 Entire Month / Specific Date / Run Date。
- 用户最终选择长期结构方向：支持多个 pairing number + 多个 run date 组合，保存时拆成新 bid 类型/结构，而不是硬塞进旧表结构；如果后续继续这块，要沿用该方向。
- 左侧日历 Pairing 显示：award/avoid 语义要区分，avoid 可显示红色，避免语义混乱。
- Configure Pairing Bid 保存体验已调整：点击确认后弹窗保持打开并 loading，成功后关闭并顶部 message。
- Configure Pairing Bid 不希望默认值，新增时应干净；例如 Pairing Number / Prefer Off 类似显示 `--`。
- Pairing 机场/城市类条件已接数据库 reference options，避免硬编码机场表数据。

## 本轮完成：Pairing Check-In Time 支持多时间条件 OR

用户需求：
- `Configure Pairing Bid > Pairing Check-In Time` 允许设置多个时间子条件。
- 示例：`Between 10:00 - 11:00`、`= 14:00`、`> 13:00`。
- 这些条件在同一个 `Pairing Check-In Time` bid 中是 OR 关系。
- 用户明确：不要通过添加多条重复的 Pairing Check-In Time property 来表达；应该是一个 property 中包含多个子条件。

已完成 spec：
- `docs/superpowers/specs/2026-05-25-pbs-pairing-check-in-time-or-conditions-design.md`

核心数据结构：
```ts
type PbsPairingTimeCondition =
  | { operator: "=" | "<" | ">"; value: string }
  | { operator: "Between"; from: string; to: string };

type PbsPairingTimeConditionListBid = {
  type: "time-condition-list";
  conditions: PbsPairingTimeCondition[];
};
```

关键实现：
- `Pairing Check-In Time` propertyCode 103 默认 bid 已改为：
  `{ type: "time-condition-list", conditions: [] }`
- 前端 Configure 控件新增多条件 UI：operator select + time input/range input + ADD + chip list + remove。
- 空状态显示 `--`。
- summary 显示：`Between 10:00 - 11:00 OR = 14:00 OR > 13:00`。
- 完整性校验：至少有一条完整 condition 才允许保存。
- 后端 route schema 接受 `time-condition-list`，conditions 至少 1 条。
- 后端序列化：`operator: "Or"`，`paramA` 存 JSON conditions。
- 后端反序列化兼容旧数据：旧 `time` / `time-range` 可恢复成单条 condition。
- 后端 pairing search 对 propertyCode 103 支持 `time-condition-list` 并生成 OR SQL。
- i18n 已补：
  - `pairing.timeCondition.add`
  - `pairing.timeCondition.empty`
  - `pairing.timeCondition.remove`

主要文件：
- `packages/contracts/pbs-pairing-bids.js`
- `packages/contracts/pbs-pairing-bids.d.ts`
- `pbs-portal/src/features/pairing/types.ts`
- `pbs-portal/src/features/pairing/components/pairing-bid-control.tsx`
- `pbs-portal/src/features/pairing/pairing-bid-control-logic.ts`
- `pbs-portal/src/features/pairing/pairing-bid-summary.ts`
- `pbs-portal/src/features/pairing/pairing-property-catalog.ts`
- `pbs-portal/src/features/pairing/pairing-draft-mappers.ts`
- `pbs-portal/src/shared/i18n/locales/en.ts`
- `pbs-server/src/routes/pairing-bids.ts`
- `pbs-server/src/services/lineholder/rule-bid-value.ts`
- `pbs-server/src/services/pairing-search/pairing-search-condition-shared.ts`
- `pbs-server/src/services/pairing-search/pairing-search-time-conditions.ts`

注意事项：
- 因为前端 `RuleBid` 通用类型仍引用 `PairingBidValue`，新增 Pairing 专属类型后，Days Off / Line 的 mutation mapper 需要显式 reject `time-condition-list`，避免类型污染。已加防护：
  - `pbs-portal/src/shared/services/days-off-service.ts`
  - `pbs-portal/src/shared/services/line-service.ts`
  - `pbs-portal/src/features/line/line-draft-mappers.ts`
  - `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
- 这不是业务功能扩散到 Days Off / Line，只是类型收窄保护。

已补测试：
- 前端控件：`pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx`
  - 覆盖添加 Between、添加 `>`、删除 condition。
- 前端完整性/逻辑：`pbs-portal/src/features/pairing/pairing-bid-control-logic.test.ts`
- Pairing 页面回归：`pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
- 后端序列化/反序列化：`pbs-server/src/services/lineholder/rule-bid-value.test.ts`
  - 覆盖新 `time-condition-list`。
  - 覆盖旧 time / time-range 反序列化为单条 OR condition。
- 后端搜索 SQL：`pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`
  - 覆盖 OR 条件 SQL 和参数顺序。
- 后端 route schema：`pbs-server/src/routes/pairing-bids.test.ts`
  - 覆盖 POST current/properties 接受 Pairing Check-In Time OR payload。

已执行验证：
- `npm --prefix pbs-portal run build` 通过。
- `npm --prefix pbs-portal test -- pairing-bid-control pairing-bid-control-logic pairing-page` 通过，49 tests。
- `npm --prefix pbs-server test -- --test-reporter=spec pbs-server/src/routes/pairing-bids.test.ts pbs-server/src/services/lineholder/rule-bid-value.test.ts pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts` 通过，204 tests。
- `git diff --check` 通过。
- Vite build 有 chunk size warning，不是本次失败项。

## 当前工作树提醒

当前工作树已有许多前序 Pairing / Days Off 改动，部分文件状态为 `MM`，其中不少不是本轮 Check-In Time OR 新增造成的。新窗口继续时：
- 不要随意 revert。
- 先 `git status --short` 看清楚。
- 若继续开发 Pairing 条件，优先沿用本轮 `time-condition-list` 的模式：Pairing 专属 bid 类型 + route schema + serialize/deserialize + search SQL + front-end control + tests。
- 若继续做新功能，必须先走 brainstorming/spec 并等用户确认。

## 当前工作树快照

### git status --short

```text
A  docs/superpowers/specs/2026-05-22-pbs-pairing-no-defaults-airport-options-design.md
A  docs/test-cases/pbs/pairing/2026-05-22-pairing-no-defaults-airport-options-regression.md
MM packages/contracts/pbs-pairing-bids.d.ts
MM packages/contracts/pbs-pairing-bids.js
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/line/line-draft-mappers.ts
 M pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx
MM pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
MM pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx
 M pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
M  pbs-portal/src/features/pairing/mock.ts
M  pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
MM pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
MM pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
MM pbs-portal/src/features/pairing/pairing-bid-summary.ts
MM pbs-portal/src/features/pairing/pairing-draft-mappers.ts
M  pbs-portal/src/features/pairing/pairing-number-autocomplete.ts
 M pbs-portal/src/features/pairing/pairing-property-catalog.ts
A  pbs-portal/src/features/pairing/pairing-reference-autocomplete.test.ts
A  pbs-portal/src/features/pairing/pairing-reference-autocomplete.ts
 M pbs-portal/src/features/pairing/types.ts
MM pbs-portal/src/shared/i18n/locales/en.ts
 M pbs-portal/src/shared/services/days-off-service.ts
 M pbs-portal/src/shared/services/line-service.ts
M  pbs-portal/src/shared/services/pairing-service.ts
M  pbs-portal/tsconfig.tsbuildinfo
M  pbs-server/src/app.test.ts
MM pbs-server/src/routes/pairing-bids.test.ts
MM pbs-server/src/routes/pairing-bids.ts
 M pbs-server/src/services/lineholder/rule-bid-value.test.ts
 M pbs-server/src/services/lineholder/rule-bid-value.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-shared.ts
 M pbs-server/src/services/pairing-search/pairing-search-time-conditions.ts
M  pbs-server/src/services/pairing/pairing-bid-service.ts
A  pbs-server/src/services/pairing/pairing-reference-options.test.ts
A  pbs-server/src/services/pairing/pairing-reference-options.ts
M  pbs-server/src/services/pairing/types.ts
?? docs/superpowers/specs/2026-05-25-pbs-pairing-check-in-time-or-conditions-design.md
?? docs/superpowers/specs/2026-05-25-pbs-pairing-config-dialog-save-loading-design.md
```

### unstaged changed files

```text
packages/contracts/pbs-pairing-bids.d.ts
packages/contracts/pbs-pairing-bids.js
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/line/line-draft-mappers.ts
pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx
pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx
pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
pbs-portal/src/features/pairing/pairing-bid-summary.ts
pbs-portal/src/features/pairing/pairing-draft-mappers.ts
pbs-portal/src/features/pairing/pairing-property-catalog.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/shared/i18n/locales/en.ts
pbs-portal/src/shared/services/days-off-service.ts
pbs-portal/src/shared/services/line-service.ts
pbs-server/src/routes/pairing-bids.test.ts
pbs-server/src/routes/pairing-bids.ts
pbs-server/src/services/lineholder/rule-bid-value.test.ts
pbs-server/src/services/lineholder/rule-bid-value.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
pbs-server/src/services/pairing-search/pairing-search-condition-shared.ts
pbs-server/src/services/pairing-search/pairing-search-time-conditions.ts
```

### staged files

```text
docs/superpowers/specs/2026-05-22-pbs-pairing-no-defaults-airport-options-design.md
docs/test-cases/pbs/pairing/2026-05-22-pairing-no-defaults-airport-options-regression.md
packages/contracts/pbs-pairing-bids.d.ts
packages/contracts/pbs-pairing-bids.js
pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx
pbs-portal/src/features/pairing/mock.ts
pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
pbs-portal/src/features/pairing/pairing-bid-summary.ts
pbs-portal/src/features/pairing/pairing-draft-mappers.ts
pbs-portal/src/features/pairing/pairing-number-autocomplete.ts
pbs-portal/src/features/pairing/pairing-reference-autocomplete.test.ts
pbs-portal/src/features/pairing/pairing-reference-autocomplete.ts
pbs-portal/src/shared/i18n/locales/en.ts
pbs-portal/src/shared/services/pairing-service.ts
pbs-portal/tsconfig.tsbuildinfo
pbs-server/src/app.test.ts
pbs-server/src/routes/pairing-bids.test.ts
pbs-server/src/routes/pairing-bids.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
pbs-server/src/services/pairing/pairing-reference-options.test.ts
pbs-server/src/services/pairing/pairing-reference-options.ts
pbs-server/src/services/pairing/types.ts
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-25-pbs-pairing-check-in-time-or-conditions.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
