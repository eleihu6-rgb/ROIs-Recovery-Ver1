# 开发上下文留痕说明

> 本目录用于保存 AI / Codex 与用户之间的大任务对话上下文。
> 这里记录的是开发侧上下文，不是产品运行时用户记忆。

## 用途

当一次任务较大、跨多个文件或形成了重要决策时，把本轮对话里的关键信息保存成文档，方便下一次新开对话窗口时直接接上。

适合保存的内容：

- 用户最初的目标和约束。
- 本轮形成的产品 / 技术决定。
- 代码改动逻辑和涉及文件。
- 已运行的测试和验证结果。
- 后续继续开发前必须知道的注意事项。
- 不要重复推翻的结论。

不适合保存的内容：

- 数据库密码、Token、明文账号密码。
- 产品用户个人记忆或运行时敏感信息。
- 没有长期价值的小修小补。

## 保存方式

在大任务结束时运行：

```bash
./save-context.sh <wing> <topic> <<'EOF'
本轮对话上下文、关键决定、代码改动逻辑、验证结果、不要重复推翻的结论。
EOF
```

示例：

```bash
./save-context.sh pbs pairing-stable-identity <<'EOF'
本轮完成 PBS Pairing 稳定身份治理：
- 后续 CRUD 默认使用稳定 id/key。
- favorite 删除使用 favoriteKey。
- full draft save 使用 draftVersion，旧版本返回 409。
- npm run verify:pbs 通过。
EOF
```

脚本会：

- 生成 `docs/dev-context/YYYY-MM-DD-<wing>-<topic>.md`
- 更新 `docs/dev-context/LATEST.md`
- 将 `docs/dev-context` 挖进对应 MemPalace wing
- 输出下一窗口提示

## 新窗口恢复方式

新开 AI / Codex 对话窗口时，让对方先读：

```text
先读 /Users/lei/Codehub/rois-ai/NEXT_CONTEXT.md，恢复项目和上次对话上下文。先不要改代码。
```

然后按里面的只读流程恢复上下文。

恢复阶段只用于理解项目和上次对话，不应默认运行 `verify`、`build`、`test`、lint、数据库脚本，也不应默认改代码。等用户给出下一步任务后，再进入实现或验证。

## Wing 约定

常用 wing：

- `rois-ai`：全项目 / 跨模块
- `pbs`：`pbs-server`、`pbs-portal`、`pbs-app`
- `gantt`：Gantt 前端
- `live-server`：实时排班服务
- `engines`：rule-engine、po-engine、ro-engine

## 使用边界

这套流程只用于开发侧协作，不替代：

- 正式 spec / design 文档。
- module handoff 文档。
- 数据库 migration 说明。
- Git commit message。

如果某次任务形成了长期产品或架构设计，仍应写入 `docs/superpowers/specs/` 或对应模块 handoff；`docs/dev-context` 负责保存“这轮对话怎么走到这些结论”的上下文。

## 与统一 AI 文档目录的关系

`docs/dev-context/` 是 `docs/` 统一文档体系的一部分，但职责只限于“对话上下文”和“开发决策快照”。不要把正式需求设计、实施计划、handoff 或测试用例直接写进本目录。

- 正式 spec / design：`docs/superpowers/specs/`
- 实施计划：`docs/superpowers/plans/`
- 交接文档：`docs/handoff/<module>/`
- 测试用例：`docs/test-cases/<module>/`
- AI 文档目录规范：`docs/ai/README.md`
