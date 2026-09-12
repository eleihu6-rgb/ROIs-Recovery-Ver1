# 开发上下文（2026-09-12）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-12 04:49:16 PDT
- Wing：`gantt`
- Topic：`recovery-help-102-104`
- Title：Recovery cases, reusable workflow and Cost Library Help
- Git branch：`HEAD`

## 本轮对话上下文

Added six lazy Recovery Help articles between Live and Scenario. Cost Library intro directly after workflow covers all 19 pushed types and seven calculation methods. Cases102 standby,103 complete pairing swap,104 delay actual times. See docs/modules/crew-recovery/2026-09-12-cases-102-104-study-Ver1.md and verification receipt beside it. Public Help Playwright passed; 22 final scroll screenshots inspected. Cost Workbench public examples passed,15 calculator tests and66 recovery tests passed. Public recovery business implementation is older than audited origin/main; no live Save,commit,push,merge,or deployment performed. Global Help menu coverage has baseline failures. Isolated worktree holds patch at98f63ec; original checkout includes corresponding Help source/evidence only, preserving unrelated changes. Frontend adapter sends changed=1 for Flight Delay despite metric0; backend can charge1015. Default fixed1009 rejects swap qty2 as unpriced. Type1007 fixed recall does not invoke1003 standby/GH. Seven embedded assets total666376 bytes. Do not mistake submitted case screenshots for fresh public operational execution.

## 当前工作树快照

### git status --short

```text
 M docs/modules/gantt/live-scenario-gantt-playbook.md
 M e2e/tests/gantt/help/help-navigation.spec.ts
 M gantt/src/components/help/help-data.ts
 M gantt/src/components/help/help-view.tsx
?? docs/assets/screenshots/gantt/recovery-cost-catalogue-Ver1.png
?? docs/assets/screenshots/gantt/recovery-cost-catalogue-Ver2.png
?? docs/assets/screenshots/gantt/recovery-cost-catalogue-Ver3.png
?? docs/assets/screenshots/gantt/recovery-cost-delay-Ver1.png
?? docs/assets/screenshots/gantt/recovery-cost-delay-Ver2.png
?? docs/assets/screenshots/gantt/recovery-cost-delay-Ver3.png
?? docs/assets/screenshots/gantt/recovery-cost-guarantee-Ver1.png
?? docs/assets/screenshots/gantt/recovery-cost-guarantee-Ver2.png
?? docs/assets/screenshots/gantt/recovery-cost-guarantee-Ver3.png
?? docs/assets/screenshots/gantt/recovery-cost-membership-Ver1.png
?? docs/assets/screenshots/gantt/recovery-cost-membership-Ver2.png
?? docs/assets/screenshots/gantt/recovery-cost-membership-Ver3.png
?? docs/assets/screenshots/gantt/recovery-cost-standby-Ver1.png
?? docs/assets/screenshots/gantt/recovery-cost-standby-Ver2.png
?? docs/assets/screenshots/gantt/recovery-cost-standby-Ver3.png
?? docs/assets/screenshots/gantt/recovery-help-102-104-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-102-104-Ver2.png
?? docs/assets/screenshots/gantt/recovery-help-102-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-102-Ver2.png
?? docs/assets/screenshots/gantt/recovery-help-102-Ver3.png
?? docs/assets/screenshots/gantt/recovery-help-103-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-103-Ver2.png
?? docs/assets/screenshots/gantt/recovery-help-103-Ver3.png
?? docs/assets/screenshots/gantt/recovery-help-104-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-104-Ver2.png
?? docs/assets/screenshots/gantt/recovery-help-104-Ver3.png
?? docs/assets/screenshots/gantt/recovery-help-overview-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-overview-Ver2.png
?? docs/assets/screenshots/gantt/recovery-help-overview-Ver3.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-102-page-1-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-102-page-2-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-103-page-1-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-103-page-2-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-103-page-3-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-104-page-1-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-104-page-2-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-104-page-3-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-cost-library-page-1-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-cost-library-page-2-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-cost-library-page-3-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-cost-library-page-4-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-cost-library-page-5-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-cost-library-page-6-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-cost-library-page-7-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-cost-library-page-8-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-cost-library-page-9-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-costs-page-1-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-costs-page-2-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-overview-page-1-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-overview-page-2-Ver1.png
?? docs/assets/screenshots/gantt/recovery-help-recovery-overview-page-3-Ver1.png
?? docs/modules/crew-recovery/2026-09-12-cases-102-104-study-Ver1.md
?? docs/modules/crew-recovery/2026-09-12-recovery-help-verification-Ver1.md
?? e2e/node_modules
?? e2e/tests/gantt/help/help-recovery-cost-capture.spec.ts
?? e2e/tests/gantt/help/help-recovery.spec.ts
?? gantt/node_modules
?? gantt/public/help/screenshots/recovery-103-submitted-Ver1.png
?? gantt/public/help/screenshots/recovery-104-submitted-Ver1.png
?? gantt/public/help/screenshots/recovery-cost-catalogue-Ver1.png
?? gantt/public/help/screenshots/recovery-cost-delay-Ver1.png
?? gantt/public/help/screenshots/recovery-cost-guarantee-Ver3.png
?? gantt/public/help/screenshots/recovery-cost-membership-Ver1.png
?? gantt/public/help/screenshots/recovery-cost-standby-Ver3.png
?? gantt/src/components/help/topics/recovery/
?? live-server/node_modules
?? node_modules
?? packages/ui/node_modules
```

### unstaged changed files

```text
docs/modules/gantt/live-scenario-gantt-playbook.md
e2e/tests/gantt/help/help-navigation.spec.ts
gantt/src/components/help/help-data.ts
gantt/src/components/help/help-view.tsx
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-12-gantt-recovery-help-102-104.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
