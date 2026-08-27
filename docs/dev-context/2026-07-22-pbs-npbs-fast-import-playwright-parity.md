# 开发上下文（2026-07-22）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-22 17:37:21 CST
- Wing：`pbs`
- Topic：`npbs-fast-import-playwright-parity`
- Title：npbs-fast-import-playwright-parity
- Git branch：`main`

## 本轮对话上下文

本轮完成 July 2026 NPBS 高覆盖 Playwright 验证与 live-server 快速导入接口对齐：
- 正式 spec：docs/superpowers/specs/2026-07-22-npbs-fast-import-playwright-parity-design.md。
- 选择 crew 264、844、906、1131、1185，coverage 15/20（75%），源文件固定 no-shift，SHA-256 见 spec，不在上下文复制敏感数据。
- live-server importer 已对齐当前 Portal catalog、日期 blocker、严格 pairing/airport/flight number 校验；dry-run 为 importable 23、failed 3、skipped 7，未执行 confirm import。
- Playwright 最终 receipts 在 /tmp/npbs-july-high-coverage-20260722/final-parity-issues-clean：22/26（85%），4 blocker；其中 844 缺失 pairing、1185 两个 flight number 不在 pairing period、906 Redeye 的 ADD BID 在当前 Portal 真实 disabled。
- 修复 E2E Pairing Check-In/Out Existing 摘要断言；cleanup 现在等待 DELETE 2xx、重新拉取 current draft。发现 Pairing UI cleanup receipt 仍可能与服务端状态不一致，本轮最终通过正式 DELETE contract 精确比对 payload 后清理 264/844/906 残留；独立 API 核查 5 人全部相关 draft=0。
- Word 报告：docs/test-cases/pbs/NPBS-Bids-Simulation-Report-2026-07-22-high-coverage.docx。
- 验证：focused Vitest 48/48 PASS；Node NPBS tests 19/19 PASS；live-server build PASS；Playwright 264+906 2/2 PASS，完整运行中 4/5 + 844 单跑 PASS；GitNexus detect changes risk low；git diff --check PASS。
- 不要执行 confirm import 或全量导入，除非用户明确批准。AGENTS.md、CLAUDE.md 是用户原有修改，不要回退或纳入本任务提交。

## 当前工作树快照

### git status --short

```text
 M AGENTS.md
 M CLAUDE.md
 M e2e/pages/pbs-portal/bid-workbench-page.ts
 M e2e/tests/pbs-portal/npbs-crew-bids-simulation.spec.ts
 M e2e/utils/npbs/generate-report.mjs
 M live-server/src/routes/admin/pbs-crew-bid-imports.test.ts
 M live-server/src/routes/admin/pbs-crew-bid-imports.ts
 M live-server/src/services/crew-bid-import/__tests__/crew-bid-import-service.test.ts
 M live-server/src/services/crew-bid-import/__tests__/crew-bid-property-mapper.test.ts
 M live-server/src/services/crew-bid-import/crew-bid-import-service.ts
 M live-server/src/services/crew-bid-import/crew-bid-property-mapper.ts
 M packages/contracts/pbs-crew-bid-imports.d.ts
?? docs/superpowers/plans/2026-07-22-npbs-july-high-coverage-playwright-plan.md
?? docs/superpowers/specs/2026-07-22-npbs-fast-import-playwright-parity-design.md
?? docs/test-cases/pbs/NPBS-Bids-Simulation-Report-2026-07-22-high-coverage.docx
?? e2e/utils/npbs/generate-coverage-manifest.mjs
?? e2e/utils/npbs/generate-coverage-manifest.test.mjs
```

### unstaged changed files

```text
AGENTS.md
CLAUDE.md
e2e/pages/pbs-portal/bid-workbench-page.ts
e2e/tests/pbs-portal/npbs-crew-bids-simulation.spec.ts
e2e/utils/npbs/generate-report.mjs
live-server/src/routes/admin/pbs-crew-bid-imports.test.ts
live-server/src/routes/admin/pbs-crew-bid-imports.ts
live-server/src/services/crew-bid-import/__tests__/crew-bid-import-service.test.ts
live-server/src/services/crew-bid-import/__tests__/crew-bid-property-mapper.test.ts
live-server/src/services/crew-bid-import/crew-bid-import-service.ts
live-server/src/services/crew-bid-import/crew-bid-property-mapper.ts
packages/contracts/pbs-crew-bid-imports.d.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-22-pbs-npbs-fast-import-playwright-parity.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
