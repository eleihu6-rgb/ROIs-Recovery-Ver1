# AI 文档放置规范

本目录记录 ROIS-AI 项目中 Codex、Claude 和其他 AI agent 生成/维护开发文档时必须遵守的路径规则。

## 总原则

- 所有 AI 生成或维护的开发文档统一放在根目录 `docs/` 下。
- 后续禁止新增 `doc/` 下的 AI 开发文档。
- 旧 `doc/`、`doc/superpowers/`、模块私有 `docs/` 中的历史文档暂不自动搬迁；迁移必须单独规划，避免破坏历史引用。
- 文档中不得写入 `.env`、数据库密码、Token、生产账号、明文凭据或其他敏感信息。
- 用户可读的开发文档默认使用简体中文；代码标识符、命令、路径、API 名称和错误原文可保留英文。

## 目录职责

| 目录 | 放什么 |
|------|--------|
| `docs/ai/` | AI 文档放置规范、协作约定、目录说明 |
| `docs/dev-context/` | AI 对话上下文、开发决策快照、`save-context.sh` 产物 |
| `docs/superpowers/specs/` | 需求确认、设计文档、brainstorming 输出的正式 spec |
| `docs/superpowers/plans/` | 实施计划、分阶段开发计划 |
| `docs/superpowers/completed/` | 已完成设计 / 计划归档 |
| `docs/handoff/` | 跨窗口、跨人、跨 agent 交接文档 |
| `docs/test-cases/` | 人工测试用例、回归测试说明 |
| `docs/modules/` | 模块级长期文档，例如 PBS、Gantt、engines、live-server |
| `docs/architecture/` | 全局架构、技术决策、系统级设计 |

## 写入规则

### 需求与设计

新功能、行为变更、流程变更、API/schema/workflow 变化的正式设计文档写入：

```text
docs/superpowers/specs/YYYY-MM-DD-<module>-<topic>-design.md
```

### 实施计划

设计确认后的实施计划写入：

```text
docs/superpowers/plans/YYYY-MM-DD-<module>-<topic>.md
```

### 对话上下文

大任务结束、跨文件/跨模块改动结束、形成长期决策、用户准备新开窗口时，使用：

```bash
./save-context.sh <wing> <topic>
```

脚本会写入：

```text
docs/dev-context/YYYY-MM-DD-<wing>-<topic>.md
docs/dev-context/LATEST.md
```

### Handoff

跨窗口、跨人、跨 agent 的正式交接文档写入：

```text
docs/handoff/<module>/YYYY-MM-DD-<topic>.md
```

不要再新增：

```text
docs/pbs-dev-handoff-*.md
pbs-portal/docs/pbs-dev-handoff-*.md
doc/*handoff*.md
```

### 测试用例

人工测试、回归测试说明写入：

```text
docs/test-cases/<module>/<area>/YYYY-MM-DD-<topic>.md
```

### 长期模块文档

模块长期说明写入：

```text
docs/modules/<module>/
```

全局架构与技术决策写入：

```text
docs/architecture/
```

## 旧文档处理

旧文档迁移不在日常开发中顺手完成。需要迁移时，应先做只读盘点，再形成迁移清单，至少确认：

- 旧路径。
- 新路径。
- 是否有代码、README、AGENTS、CLAUDE、NEXT_CONTEXT 或其他文档引用旧路径。
- 是否需要保留跳转说明或历史索引。

已完成迁移：

1. `doc/superpowers/*` -> `docs/superpowers/*`
2. `docs/pbs-dev-handoff-*.md` 和 `pbs-portal/docs/pbs-dev-handoff-*.md` -> `docs/handoff/pbs/`
3. 旧 `doc/03-gantt`、`doc/04-rule-engine`、`doc/05-po-engine`、`doc/06-ro-engine` -> `docs/modules/<module>/`
4. `doc/01-architecture/*` 和根部架构 / 需求 / 部署 / 计划文档 -> `docs/architecture/`、`docs/requirements/`、`docs/deployment/`、`docs/plans/`
5. 旧截图素材、engine-server / connector-server / monitoring / e2e 文档 -> `docs/assets/`、`docs/modules/`、`docs/test-cases/e2e/`
6. 旧 `doc/` 目录已清空并删除

后续迁移建议：

1. `data-migration/docs/`、`pbs-portal/docs/current-state.md` 等模块私有资料单独盘点后再迁移
