# AI 开发文档迁移规整设计

日期：2026-05-18  
状态：已执行  
范围：第一轮只迁移 AI 开发文档和 handoff，不迁移所有长期项目文档

## 背景

项目已经确认新的统一规则：Codex、Claude 和其他 AI agent 生成或维护的开发文档，后续统一放在 `docs/` 下，不再新增 `doc/` 下的 AI 开发文档。

当前历史文档仍存在分散问题：

- `doc/superpowers/*` 与 `docs/superpowers/*` 并存。
- `docs/pbs-dev-handoff-*.md` 散在 `docs/` 根目录。
- `pbs-portal/docs/pbs-dev-handoff-*.md` 与根目录 handoff 重复。
- `pbs-portal/docs/current-state.md` 是模块当前状态文档，不是普通 handoff。

## 目标

1. 第一轮先把 AI 设计 / 计划 / 完成归档和 PBS handoff 收敛到新规范路径。
2. 更新仓库内引用，避免新旧路径断链。
3. 不碰业务代码，不修改文档正文业务结论。
4. 不迁移长期正式模块文档，例如 `doc/03-gantt`、`doc/04-rule-engine`、`doc/05-po-engine`、`doc/06-ro-engine`。

## 第一轮迁移范围

### 1. 迁移 `doc/superpowers`

迁移到对应的 `docs/superpowers` 子目录：

```text
doc/superpowers/specs/*      -> docs/superpowers/specs/
doc/superpowers/plans/*      -> docs/superpowers/plans/
doc/superpowers/completed/*  -> docs/superpowers/completed/
```

如果目标路径已存在同名文件：

- 先对比内容。
- 内容相同则删除旧路径。
- 内容不同则保留并人工判断，不强行覆盖。

### 2. 迁移 PBS handoff

迁移到：

```text
docs/handoff/pbs/
```

包含：

```text
docs/pbs-dev-handoff-*.md
docs/pbs-pairing-dev-handoff-*.md
pbs-portal/docs/pbs-dev-handoff-*.md
```

### 3. 暂不迁移 `pbs-portal/docs/current-state.md`

原因：

- 它更像 PBS Portal 模块状态文档。
- 当前多个旧 handoff 引用它。
- 后续可单独决定迁到 `docs/modules/pbs/portal-current-state.md`，或保留为模块本地状态说明。

## 引用更新范围

迁移后更新仓库内文本引用：

- `doc/superpowers/...` -> `docs/superpowers/...`
- `docs/pbs-dev-handoff-*.md` -> `docs/handoff/pbs/pbs-dev-handoff-*.md`
- `docs/pbs-pairing-dev-handoff-*.md` -> `docs/handoff/pbs/pbs-pairing-dev-handoff-*.md`
- `pbs-portal/docs/pbs-dev-handoff-*.md` -> `docs/handoff/pbs/pbs-dev-handoff-*.md`

不更新历史上下文里作为“当时 git status 快照”出现的路径，除非它明显是恢复流程说明。

## 非目标

- 不迁移整个 `doc/` 目录。
- 不删除 `doc/03-gantt`、`doc/04-rule-engine`、`doc/05-po-engine`、`doc/06-ro-engine` 等长期模块文档。
- 不修改数据库、代码、测试逻辑。
- 不自动重写历史 dev-context 的业务内容。

## 验收标准

1. `doc/superpowers` 下不再有文件。
2. PBS handoff 不再散落在 `docs/` 根目录或 `pbs-portal/docs/`。
3. `docs/handoff/pbs/` 包含迁移后的 PBS handoff。
4. 仓库中非历史快照引用不再指向旧 `doc/superpowers` 或旧 PBS handoff 路径。
5. `git status` 只显示文档移动、引用更新和本 spec。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是路径迁移与引用更新，文件多但逻辑线性，并行容易产生重复移动或引用冲突。
- Suggested split: 暂不拆。
- Write boundaries: 只动文档路径和文档内引用，不动代码。
- Conflict risk: 中等，主要风险是同名文件内容不同、历史引用误改。
- Execution gate: 用户已确认并执行迁移。
