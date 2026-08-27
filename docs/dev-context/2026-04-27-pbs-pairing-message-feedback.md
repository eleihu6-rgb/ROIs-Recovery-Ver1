# 开发上下文（2026-04-27）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-04-27 15:58:41 CST
- Wing：`pbs`
- Topic：`pairing-message-feedback`
- Title：pairing-message-feedback
- Git branch：`main`

## 本轮对话上下文

本轮继续修复 PBS Pairing message 视觉回归。

用户反馈：message 成功提示在页面上变成竖排，一列字母显示。根因是上一版把 Sonner 外层 toaster 的 CSS 变量 --width 设置成 fit-content，同时 toast 本身也用 fit-content。Sonner 的 toast 默认有 overflow-wrap:anywhere，fit-content 在该场景下按 min-content 收缩，英文短句会被压到极窄宽度，导致逐字竖排。

修复：
- packages/ui/src/components/message.tsx 中 MESSAGE_TOASTER_STYLE 的 --width 改为 MESSAGE_MAX_WIDTH，即 min(500px, calc(100vw - 32px))，外层只负责顶部居中定位和最大可用宽度。
- MESSAGE_TOAST_STYLE 改为 width:max-content + maxWidth:MESSAGE_MAX_WIDTH，并加 left:50%、translate:-50% 0，让实际 message 条目在外层容器内居中。
- 保留 fontSize:14、padding:10px 16px、minWidth:auto、whiteSpace:normal。
- richColors=true 和 currentColor 图标保留，success/error 颜色仍由 sonner richColors 提供并同步到 icon。
- 设计文档补充：不要把 Sonner 外层 --width 设为 fit-content，避免 min-content 收缩造成竖排。

验证：
- pbs-portal: rm -rf node_modules/.vite dist && pnpm test -- src/features/pairing/pages/pairing-page.test.tsx src/features/pairing/pages/search-pairings-page.test.tsx 通过，30 files / 110 tests。
- pbs-portal: pnpm lint 第一次与并行 Vite build/cache 临时文件冲突，单独重跑通过。
- pbs-portal: pnpm build 通过，仍有既有主 chunk >500k warning。
- 浏览器实际验证：启动 dev server 后，在 http://localhost:3031/login?redirect=%2Fdashboard 通过当前 @rois/ui 模块触发 message.success/error。success: text=Pairing property deleted., toastWidth≈221px, color/iconColor=rgb(0,138,46), background=rgb(236,253,243)。error: text=Unable to delete pairing property., toastWidth≈279px, color/iconColor=rgb(230,0,0), background=rgb(255,240,240)。不再竖排。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M docs/superpowers/specs/2026-04-27-pbs-pairing-delete-toast-feedback-design.md
 M packages/ui/src/index.ts
 M pbs-portal/package.json
 M pbs-portal/pnpm-lock.yaml
 M pbs-portal/src/app/providers/app-providers.tsx
 M pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
 M pbs-portal/src/shared/i18n/locales/en.ts
?? .playwright-mcp/
?? docs/dev-context/2026-04-27-pbs-pairing-message-feedback.md
?? packages/ui/src/components/message.tsx
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
docs/superpowers/specs/2026-04-27-pbs-pairing-delete-toast-feedback-design.md
packages/ui/src/index.ts
pbs-portal/package.json
pbs-portal/pnpm-lock.yaml
pbs-portal/src/app/providers/app-providers.tsx
pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
pbs-portal/src/shared/i18n/locales/en.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-04-27-pbs-pairing-message-feedback.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
