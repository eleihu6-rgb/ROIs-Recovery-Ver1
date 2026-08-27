# 开发上下文（2026-05-09）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-09 13:45:17 CST
- Wing：`pbs`
- Topic：`tier-start-after-line`
- Title：PBS Line 收口与 Tier 启动上下文
- Git branch：`main`

## 本轮对话上下文

本轮上下文保存用于新开窗口继续 PBS Tier 功能开发。

用户意图：
- 用户认为 Line 模块当前测试起来没有明显 bug，询问对比 AA 文档还差哪些。
- 结论：Line 作为 PBS Portal 的出价录入模块已经足够支撑 Tier；剩余 AA 差距主要属于 Award Engine、Reason Report、复杂规则解释，不应卡住 Tier。
- 用户确认可以开始 Tier，并表示因为是新功能希望新开上下文。

本轮重要结论：
- 下一步建议进入 Tier 功能开发。
- Tier 首期定位建议为 AA Layer Tab 对应的 Bid Review / Summary 页面：按 Tx/Tier 汇总 Pairing、DaysOff、Line、Calendar bid，不优先做重编辑入口。
- Pairing、DaysOff、Line 当前都已能保存到 Lineholder Current draft，Tier summary 已有基础读取链路。
- Line 剩余 AA 差距包括：AA Line 扩展属性默认未开放、TCR 完整引擎语义、Restrictive/Persistent 跨 Tx 语义、Clear Bids 真实撕毁前序 bid、Buddy/Avoid Person、Double-Up 合法性校验、Award/Reason Report。这些更偏后续 hardening / award engine，不应阻塞 Tier。

最近完成的 Line 相关改动概览：
- Line 旧库 401-407 兼容，AA 411-426 扩展预埋，默认由 is_visible_in_portal 控制是否展示。
- Line 新增、删除、已有 Tx 修改走逐条接口，避免整份 draft 保存导致接口风暴和 409。
- Line 添加/删除/修改已有条件、右侧 available Tx 快速点击都有 pending/disabled 控制。
- Line 同 property + 同 BID + 同 modifier、仅 tier 不同会合并成一行；前端 Add 转 PATCH，加载时合并旧分裂数据，后端 POST 兜底合并。
- 完全重复同 tier 仍拦截，BID 不同不合并。

已新增/更新的重要文档：
- docs/superpowers/specs/2026-05-08-pbs-line-aa-alignment-design.md
- docs/superpowers/specs/2026-05-08-pbs-line-favorite-persistence-design.md
- docs/superpowers/specs/2026-05-09-pbs-line-add-singleflight-design.md
- docs/superpowers/specs/2026-05-09-pbs-line-property-mutation-control-design.md
- docs/superpowers/specs/2026-05-09-pbs-line-identical-property-tier-merge-design.md
- docs/test-cases/pbs/line/2026-05-08-line-legacy-catalog-and-aa-extension.md
- docs/test-cases/pbs/line/2026-05-08-line-favorite-persistence.md
- docs/test-cases/pbs/line/2026-05-09-line-add-singleflight.md
- docs/test-cases/pbs/line/2026-05-09-line-property-mutation-control.md
- docs/test-cases/pbs/line/2026-05-09-line-identical-property-tier-merge.md

最近验证结果：
- npm run verify:pbs 通过。
- git diff --check 通过。
- Line 真实接口探针 5 轮通过，全部低于 2 秒：add max 约 1077ms，merge add max 约 919ms，patch max 约 946ms，delete max 约 596ms。

当前工作树注意事项：
- 仍有大量 PBS Line 相关未提交改动和新文档，未 stage、未 commit。
- 新窗口不要随意 revert；先读 NEXT_CONTEXT.md 和 docs/dev-context/LATEST.md，再按 AGENTS.md 规则继续。
- 如果要真正开始 Tier 新功能，按仓库规则需要 brainstorming/spec 先行，用户确认后再实现。

建议新窗口第一步：
1. 阅读 NEXT_CONTEXT.md。
2. 阅读 docs/dev-context/LATEST.md。
3. 阅读 pbs-portal/AGENTS.md 与 pbs-server/AGENTS.md（如果存在）。
4. 只读梳理现有 Tier：pbs-portal/src/features/tier、pbs-server/src/services/lineholder/lineholder-summary-service.ts、packages/contracts/pbs-lineholder-summary.*。
5. 给用户确认 Tier 首期 spec：只读 summary 页面、按 Tx 分组、bid readable formatter、Line/Pairing/DaysOff/Calendar 全量汇总、空层/警告提示、测试案例。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-line-bids.d.ts
 M packages/contracts/pbs-line-bids.js
 M pbs-portal/src/features/line/line-draft-mappers.ts
 M pbs-portal/src/features/line/pages/line-page.test.tsx
 M pbs-portal/src/features/line/pages/line-page.tsx
 M pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
 M pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
 M pbs-portal/src/features/rule-bids/utils.test.ts
 M pbs-portal/src/features/rule-bids/utils.ts
 M pbs-portal/src/shared/services/line-service.ts
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/src/routes/line-bids.test.ts
 M pbs-server/src/routes/line-bids.ts
 M pbs-server/src/services/line/line-bid-service.ts
 M pbs-server/src/services/line/types.ts
 M sql/seed/10-pbs-bid-property.sql
?? docs/superpowers/specs/2026-05-08-pbs-line-aa-alignment-design.md
?? docs/superpowers/specs/2026-05-08-pbs-line-favorite-persistence-design.md
?? docs/superpowers/specs/2026-05-09-pbs-line-add-singleflight-design.md
?? docs/superpowers/specs/2026-05-09-pbs-line-identical-property-tier-merge-design.md
?? docs/superpowers/specs/2026-05-09-pbs-line-property-mutation-control-design.md
?? docs/test-cases/
?? pbs-portal/src/features/line/line-draft-mappers.test.ts
?? pbs-server/src/services/line/line-validation.test.ts
?? pbs-server/src/services/line/line-validation.ts
?? sql/migration/2026-05-08-pbs-line-legacy-aa-catalog.sql
```

### unstaged changed files

```text
packages/contracts/pbs-line-bids.d.ts
packages/contracts/pbs-line-bids.js
pbs-portal/src/features/line/line-draft-mappers.ts
pbs-portal/src/features/line/pages/line-page.test.tsx
pbs-portal/src/features/line/pages/line-page.tsx
pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
pbs-portal/src/features/rule-bids/utils.test.ts
pbs-portal/src/features/rule-bids/utils.ts
pbs-portal/src/shared/services/line-service.ts
pbs-portal/tsconfig.tsbuildinfo
pbs-server/src/routes/line-bids.test.ts
pbs-server/src/routes/line-bids.ts
pbs-server/src/services/line/line-bid-service.ts
pbs-server/src/services/line/types.ts
sql/seed/10-pbs-bid-property.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-09-pbs-tier-start-after-line.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
