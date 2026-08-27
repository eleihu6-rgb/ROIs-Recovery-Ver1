# 开发上下文（2026-07-16）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-16 15:35:30 CST
- Wing：`pbs`
- Topic：`work-day-preference-standard-alignment`
- Title：PBS Work Day Preference 标准语义对齐
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Pairing property 110（Work Day Preference）标准语义重构。

用户确认的产品决策：
- 固定 Award，不显示 Award/Avoid。
- 删除 Any/Every。
- Mon-Sun weekday 可独立选择，每个 weekday 有独立可选 Check-In From/To；两个时间为空表示 Any time，允许跨午夜，起止相等无效。
- LIMIT TO EVENT DATE 默认关闭表示 Any date；开启后复用现有 Specific Dates / Date Range。
- Event Date、weekday、Check-In time 必须由同一个 Duty 的起飞机场当地 Check-In event 同时满足。
- 删除 property 110 全部旧 bids、跨 Tier 同组记录、occurrences 和 favorites，不兼容旧 date-or-dow/date-range payload。

实现范围：
- Portal 新编辑器、固定动作/quantifier、回显、摘要、收藏和 Search Pairings。
- PBS/Live 序列化、回读、校验、Search SQL 与两套 PAIRING_SCORE 同事件语义。
- catalog seed 与破坏性 migration。
- 单元、API、真实 Playwright 和人工 QA 文档。

提交：
- d6d41221 feat: align Work Day Preference semantics
- 注意此前并行提交 acb7a347 已包含一部分共享 contract/dialog Work Day 基础代码，本提交补齐完整实现与验证。

验证：
- Portal focused Vitest：118/118 PASS。
- PBS Work Day API：4/4 PASS。
- Live focused serialization/search：10/10 PASS。
- Playwright PBS-3516~3519：5/5 PASS（含 setup）。
- npm run check:ui：PASS，0 hard violations。
- pbs-server 与 live-server TypeScript 检查 PASS。
- Portal 全量 TypeScript 被并行 Pairing Length 测试类型错误阻挡。
- pbs-server 全量 648/650 PASS，两个失败是无关的 Reserve Score 与 Pairing Length catalog 测试。
- live-server 全量失败来自既有环境、DB 和无关测试；本功能 focused tests PASS。

不要重复推翻的结论：Work Day 不使用 Pairing-span overlap，也不恢复 Avoid 或 Any/Every；日期、weekday、时间必须绑定同一个 Duty 本地 Check-In event。

## 当前工作树快照

### git status --short

```text
 M AGENTS.md
 M CLAUDE.md
 M live-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-portal/src/features/pairing/components/pairing-check-time-editor.test.tsx
 M pbs-portal/src/features/pairing/components/pairing-check-time-editor.tsx
?? docs/superpowers/specs/2026-07-16-pbs-pairing-check-time-dialog-spacing-design.md
```

### unstaged changed files

```text
AGENTS.md
CLAUDE.md
live-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
pbs-portal/src/features/pairing/components/pairing-check-time-editor.test.tsx
pbs-portal/src/features/pairing/components/pairing-check-time-editor.tsx
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-16-pbs-work-day-preference-standard-alignment.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
