# 开发上下文（2026-06-03）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-03 01:33:26 PDT
- Wing：`rois-ai`
- Topic：`enhance-Ver1-audit`
- Title：enhance-Ver1-audit
- Git branch：`feat/ai/ai-capabilities`

## 本轮对话上下文

Enhancement audit series started as enhance-Ver1.
User requested repeated enhancement rounds; future rounds should continue version naming as enhance-Ver2, enhance-Ver3, etc.
This round was a read-only senior staff audit with no code changes; only AUDIT_FINDINGS.md was created.
Top priorities recorded in AUDIT_FINDINGS.md: F-001 paginate/virtualize Crew Bids all-rows path, F-002 measure/add targeted PBS Crew Bids indexes after EXPLAIN, F-007 remove duplicate '* 2.*' files.
Other findings: F-003 memoize Crew Bids derived rows, F-004 stream/async RO export gzip, F-005 move engine cleanup blocking file work off event loop, F-006 batch F8 import inserts, F-008 remove production console logs, F-009 replace shared crew-service any casts.

## 当前工作树快照

### git status --short

```text
 M e2e/test-results/.last-run.json
 D e2e/test-results/nginx-headers-FULL-REPORT--a1d43-rs-for-all-JS-CSS-resources-chromium/error-context.md
 M gantt/src/components/shell/gantt-sub-toolbar.tsx
 M gantt/src/stores/layout-store.ts
 M gantt/src/types/layout.ts
?? AUDIT_FINDINGS.md
?? e2e/test-results/tests-gantt-roster-seniori-c132a-s-SEN-and-can-toggle-it-off/
?? e2e/test-results/tests-gantt-roster-seniori-cfdd3-nd-visible-by-default-smoke/
?? e2e/test-results/tests-gantt-roster-seniori-e1596-ss-checked-not-placeholder-/
?? e2e/tests/gantt/pane-limits.spec.ts
```

### unstaged changed files

```text
e2e/test-results/.last-run.json
e2e/test-results/nginx-headers-FULL-REPORT--a1d43-rs-for-all-JS-CSS-resources-chromium/error-context.md
gantt/src/components/shell/gantt-sub-toolbar.tsx
gantt/src/stores/layout-store.ts
gantt/src/types/layout.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-03-rois-ai-enhance-ver1-audit.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
