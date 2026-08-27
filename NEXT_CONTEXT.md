# ROIS-AI 新窗口上下文入口

> 新开 AI / Codex 对话窗口时，先让对方阅读这个文件。
> 这个文件不保存具体业务细节，而是规定如何恢复最近开发上下文。

## 新窗口启动方式

推荐直接复制这段作为新窗口第一条消息：

```text
先读 /Users/lei/Codehub/rois-ai/NEXT_CONTEXT.md，恢复项目和上次对话上下文。先不要改代码。
```

如果已经知道要继续哪个模块，可以补充：

```text
我要继续的模块是：[pbs / gantt / live-server / engines / rois-ai]
```

## 新窗口恢复原则

- 先恢复上下文，只读理解，不立即改代码。
- 用户偏好：审计、review、性能分析、enhancement 建议等发现项必须同步写入 `docs/` 下的正式文档或 `AUDIT_FINDINGS.md`，不要只留在聊天里；新增 findings/enhancement 文档文件名要包含 timestamp 和版本号。
- 不默认运行 `verify`、`build`、`test`、lint 或数据库脚本。
- 不默认做大范围 `diff` 分析。
- 不默认创建文件、编辑文件、提交或回滚。
- 读完后先用几句话总结理解到的项目状态、最近上下文和下一步需要用户确认的内容。
- 等用户给出明确任务后，再按 `AGENTS.md` 的规则决定是否需要 brainstorming / confirmation。

## AI 应执行的只读恢复流程

1. 先阅读根目录 `AGENTS.md`，理解全项目开发规范。
2. 阅读最近一次正式开发上下文：

   ```bash
   sed -n '1,220p' docs/dev-context/LATEST.md
   ```

   如果 `docs/dev-context/LATEST.md` 不存在，则改为阅读 `docs/handoff/` 或 `docs/superpowers/specs/` 下最新的 handoff / spec。

3. 如果用户指定了模块，继续阅读对应模块的 `AGENTS.md`。
   - `pbs`：优先读 `pbs-portal/AGENTS.md` 和 `pbs-server/AGENTS.md`
   - `gantt`：优先读 `gantt/AGENTS.md`（如果存在）
   - `live-server`：优先读 `live-server/AGENTS.md`（如果存在）
4. 如需更多背景，再生成启动上下文：

   ```bash
   ./scripts/memory/wakeup-rois-ai.sh <wing>
   ```

   常用 `<wing>`：

   - `pbs`
   - `gantt`
   - `live-server`
   - `engines`
   - `rois-ai`

5. 只在准备真正改代码前，才查看当前工作树：

   ```bash
   git status --short
   ```

6. 恢复上下文后先回复用户：当前理解、最近保存的开发上下文、是否还需要读取某个模块文件。不要自行开始实现。

## AI 文档目录规范

- 所有 AI / Codex / Claude 生成或维护的开发文档统一放在 `docs/` 下。
- 新需求或设计 spec 写入 `docs/superpowers/specs/`。
- 实施计划写入 `docs/superpowers/plans/`。
- 对话上下文只写入 `docs/dev-context/`。
- handoff 写入 `docs/handoff/<module>/`。
- 测试用例写入 `docs/test-cases/<module>/`。
- 不再新增 `doc/` 下的 AI 开发文档；旧 `doc/` 内容仅作为历史资料，迁移需单独规划。
- 详细规则见 `AGENTS.md` 和 `docs/ai/README.md`。

## 大任务收尾方式

大任务结束时，AI 应保存“本次对话上下文”，而不是保存产品运行时用户记忆。

使用：

```bash
./save-context.sh <wing> <topic> <<'EOF'
这里写本轮对话上下文、关键决定、代码改动逻辑、验证结果、不要重复推翻的结论。
EOF
```

示例：

```bash
./save-context.sh pbs pairing-stable-identity <<'EOF'
本轮完成 PBS Pairing 稳定身份治理：
- 删除已有记录必须用 stable id/key，不用 rowSeq/code。
- favorite 删除改用 favoriteKey。
- full draft save 使用 draftVersion，过期返回 409。
- npm run verify:pbs 通过。
EOF
```

## 什么时候需要保存上下文

需要保存：

- 大任务结束。
- 跨多文件、跨模块或跨前后端的改动结束。
- 形成了以后不能重复推翻的产品 / 技术结论。
- 修改了 API、schema、数据库约束、并发策略、关键交互流程。
- 用户准备新开对话窗口继续开发。

不需要保存：

- 简单解释代码。
- 单个小 bug 的局部修复。
- 没有长期决策的小样式调整。
- 临时排查但没有代码或结论沉淀。

## 安全边界

- 只记录开发侧上下文，不记录产品用户长期记忆。
- 不写数据库密码、Token、明文账号密码或其他运行时敏感信息。
- 工作树里已有未提交改动时，不要随意 revert；先理解再继续。
