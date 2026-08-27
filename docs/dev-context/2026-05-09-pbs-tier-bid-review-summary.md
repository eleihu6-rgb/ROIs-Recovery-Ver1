# 开发上下文（2026-05-09）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-09 15:57:57 CST
- Wing：`pbs`
- Topic：`tier-bid-review-summary`
- Title：PBS Tier Bid Review/Summary 基础功能
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Tier 基础功能开发，范围是将 /tier 从早期占位/假编辑页面改为 AA Layer Tab 对应的只读 Bid Review / Summary 视图。

关键决策：
- 项目内统一使用 Tier / TIERS / Tx 术语，不新增 Layer UI/API 命名。
- Excel crew_bids_reference-2026-03-16-072929.xlsx 只作为参考，不导入，不把旧数据直接写入系统。
- 当前主 UI 只展示 T1-T7；后端若读取到 T8-T24，前端放入 legacy review-only warning 区，不静默丢弃。
- Tier 页面只读，不实现新增、删除、拖拽、重排、保存，不做 Award/Reason Report。

已落地文件：
- packages/contracts/pbs-lineholder-summary.d.ts：扩展 lineholder summary contract，增加 readableText、conditions、groupKey、action、warnings 等字段。
- pbs-server/src/services/lineholder/lineholder-summary-service.ts：summary 查询 join pbs_bid_condition，生成可读条件、动作、分组键与 T8+ legacy warning。
- pbs-server/src/routes/lineholder-summary.test.ts：补充 summary contract 形态测试。
- pbs-portal/src/features/tier/*：/tier 页面改为只读 Bid Review/Summary UI，移除旧的假编辑控件和假保存行为，mapper 将 summary 按 tier 分组并处理 legacyItems。
- docs/superpowers/specs/2026-05-09-pbs-tier-bid-review-summary-design.md：已获用户确认的实现规格。
- docs/test-cases/pbs/tier/2026-05-09-tier-bid-review-summary.md：QA 测试说明。

验证结果：
- npm run verify:pbs 通过。
- git diff --check 通过。
- 单独 pbs-server build/test、pbs-portal test/build 在实现过程中也通过。

后续建议：
- 下一阶段可以继续做 Tier 更细的真实 DB service 单元测试，尤其覆盖 bid_condition 组合、T8+ 数据、空 summary、跨多个 tier 的同一 item。
- 再往后可基于 AA 文档推进 Award/Reason Report 或 Tier 只读详情展开，但不要把编辑能力混进本阶段。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-lineholder-summary.d.ts
 M pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
 M pbs-portal/src/features/tier/components/tier-right-panel.tsx
 M pbs-portal/src/features/tier/mock.ts
 M pbs-portal/src/features/tier/pages/tier-page.test.tsx
 M pbs-portal/src/features/tier/pages/tier-page.tsx
 M pbs-portal/src/features/tier/tier-draft-mappers.test.ts
 M pbs-portal/src/features/tier/tier-draft-mappers.ts
 M pbs-portal/src/features/tier/types.ts
 M pbs-server/src/routes/lineholder-summary.test.ts
 M pbs-server/src/services/lineholder/lineholder-summary-service.ts
?? docs/superpowers/specs/2026-05-09-pbs-tier-bid-review-summary-design.md
?? docs/test-cases/pbs/tier/
```

### unstaged changed files

```text
packages/contracts/pbs-lineholder-summary.d.ts
pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
pbs-portal/src/features/tier/components/tier-right-panel.tsx
pbs-portal/src/features/tier/mock.ts
pbs-portal/src/features/tier/pages/tier-page.test.tsx
pbs-portal/src/features/tier/pages/tier-page.tsx
pbs-portal/src/features/tier/tier-draft-mappers.test.ts
pbs-portal/src/features/tier/tier-draft-mappers.ts
pbs-portal/src/features/tier/types.ts
pbs-server/src/routes/lineholder-summary.test.ts
pbs-server/src/services/lineholder/lineholder-summary-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-09-pbs-tier-bid-review-summary.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
