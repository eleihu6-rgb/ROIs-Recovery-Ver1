# 开发上下文（2026-07-28）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-28 11:21:28 CST
- Wing：`pbs`
- Topic：`standing-bid-unified-page`
- Title：Standing Bid 单页合并
- Git branch：`main`

## 本轮对话上下文

本轮完成 Standing Bid 单页合并：
- 删除页面顶部 Lineholder / Reserve Tab，统一为一个 Existing 和一个 Add 工作区。
- Add 分类固定为 All Properties / Days Off / Pairing / Roster / Reserve，使用 Current Bid 下划线 Tab 风格；无 Standing 分类、收藏和 Bidding Calendar。
- Reserve 301/312/313/314 全部归入 Reserve。
- UI 统一不等于业务合并：页面模型保留 StandingLineholder 与 StandingReserve 两份独立 draft metadata、版本号和 remarks。
- 新增、编辑、删除只重建并保存目标 context 的 properties；Standing query key 独立，不触碰 Current Bid cache。
- 409 冲突只刷新 Standing current query，不自动覆盖。
- Existing 使用 Bid 风格扁平行、类型标签、Tier、编辑和删除操作。
- 设计 commit c7b26aae；实现 commit c5d3287a。
- 验证：Standing focused 13 tests PASS；共享 focused 89 tests PASS；完整 pbs-portal Vitest PASS；Standing Playwright 12 PASS；lint 0 errors；UI gate 0 hard violations；production build PASS；真实本地 Portal 页面和 Reserve 四项已检查。
- 后续独立阶段才处理 Standing editor 与 Current Bid editor 的完整统一，以及 solver fallback；不要在本功能中把 Standing 写入 Current。

## 当前工作树快照

### git status --short

```text
 M AGENTS.md
 M CLAUDE.md
```

### unstaged changed files

```text
AGENTS.md
CLAUDE.md
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-28-pbs-standing-bid-unified-page.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
