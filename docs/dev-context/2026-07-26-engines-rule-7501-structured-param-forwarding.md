# 开发上下文（2026-07-26）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-26 14:23:55 EDT
- Wing：`engines`
- Topic：`rule-7501-structured-param-forwarding`
- Title：rule-7501-structured-param-forwarding
- Git branch：`main`

## 本轮对话上下文

本轮完成法规 7501 structured input 全链路透传：
- 目标：7501 不再依赖旧 duty-only TSV/标量 flags；Bases/Ranks/Fleets/Crew Teams、Period、Unit、Duty End Buffer、Min Limits 通过结构化 R/D/Q/T 输入进入 Rust checker。
- live/scenario shared recheck：live-server/scripts/legality-recheck-core.mjs 的 rule7501 改为一次构造所有合法 7501 row 的 R 行，按需加载 crewQualEntries/crewTeams，输出 row id 回填正确 rule_instance；新增多 instance row-id 回归测试。
- standalone live harness：live-server/scripts/check-7501-sdfd.mjs 和 persist-7501-violations.mjs 改为同样的结构化 TSV，保留低层 toTsv 仅供 legacy/manual 调用。
- Rust rule-engine：rule-engine-rs/src/rules/rule7501.rs 增加共享 structured scope 模型；check-7501 支持 R/D/Q/T structured stdin；PyO3 Engine 接收 sdfd_rule_rows 并优先用 structured 7501 path。
- PBS solver：pbs-engine rule_params.py 提取 sdfd_rule_rows，Crew Teams 是唯一 7501 team scope 名称，不兼容 legacy Teams；legacy sdfd_rows 只作为 fallback，structured rows 包含所有合法 7501 rows。
- 额外注意：PyO3 parse_rule8056_row 补了 assignment_a/assignment_b 字段以适配当前 Rule8056Rule 编译要求。
验证：live-server Vitest 18/18；standalone legality recheck TAP 48/48；cargo build --release rule-engine-rs；cargo check check-7501；cargo check PyO3（仅既有 duty_idx warning）；Rust structured 7501 test；PyO3 7501 tests；PBS 7501 params tests；node --check；py_compile；git diff --check。
GitNexus：本机未发现 .gitnexus/run.cjs 或 gitnexus CLI，未能运行 detect_changes；已用 git diff/name/status 做范围核对。

## 当前工作树快照

### git status --short

```text
 M live-server/scripts/__tests__/legality-recheck-core.test.mjs
 M live-server/scripts/check-7501-sdfd.mjs
 M live-server/scripts/legality-recheck-core.mjs
 M live-server/scripts/persist-7501-violations.mjs
 M live-server/tests/unit/legality-recheck-core-param.spec.ts
 m pbs-engine
 m rule-engine-rs
```

### unstaged changed files

```text
live-server/scripts/__tests__/legality-recheck-core.test.mjs
live-server/scripts/check-7501-sdfd.mjs
live-server/scripts/legality-recheck-core.mjs
live-server/scripts/persist-7501-violations.mjs
live-server/tests/unit/legality-recheck-core-param.spec.ts
pbs-engine
rule-engine-rs
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-26-engines-rule-7501-structured-param-forwarding.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh engines
git status --short
```
