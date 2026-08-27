# 第二轮模块文档迁移规整设计

日期：2026-05-18  
状态：已执行  
范围：只迁移旧 `doc/` 下的长期模块开发文档，不迁移截图素材、全局架构文档和业务代码

## 背景

第一轮已经完成 AI 开发文档和 PBS handoff 的收敛：

- `doc/superpowers/*` 已迁到 `docs/superpowers/*`。
- PBS handoff 已迁到 `docs/handoff/pbs/`。
- 新规范要求后续 AI / Codex / Claude 生成或维护的开发文档统一放在 `docs/` 下。

当前旧 `doc/` 中仍有多组长期模块文档，其中 `doc/03-gantt`、`doc/04-rule-engine`、`doc/05-po-engine`、`doc/06-ro-engine` 与新规范中的 `docs/modules/<module>/` 目录职责最匹配。

## 目标

1. 将四个长期模块文档目录迁入 `docs/modules/`。
2. 更新仓库内指向旧路径的文本引用，避免迁移后断链。
3. 保持文档正文业务结论不变，只做路径和必要引用调整。
4. 不迁移图片资料、历史截图、全局架构文档、部署文档和其他未确认目录。

## 迁移范围

本轮只迁移：

```text
doc/03-gantt/*        -> docs/modules/gantt/
doc/04-rule-engine/*  -> docs/modules/rule-engine/
doc/05-po-engine/*    -> docs/modules/po-engine/
doc/06-ro-engine/*    -> docs/modules/ro-engine/
```

包含这些目录下的 `.md`、`.html`、`.gitkeep` 等模块文档文件。

## 不迁移范围

本轮不迁移：

- `docs/assets/screenshots/new-system/`
- `docs/assets/screenshots/old-javafx-system/`
- `docs/architecture/`
- `docs/modules/pbs/`
- `docs/modules/engine-server/`
- `docs/modules/connector-server/`
- `docs/modules/monitoring/`
- `docs/params/`
- `docs/test-cases/e2e/`
- `doc/*.md`
- `data-migration/docs/`
- `pbs-portal/docs/current-state.md`

这些目录和文件后续需要单独盘点：有些是截图素材，有些是全局架构或模块私有资料，不应在第二轮里混着搬。

## 引用更新规则

迁移后更新仓库内文本引用：

- `doc/03-gantt/...` -> `docs/modules/gantt/...`
- `doc/04-rule-engine/...` -> `docs/modules/rule-engine/...`
- `doc/05-po-engine/...` -> `docs/modules/po-engine/...`
- `doc/06-ro-engine/...` -> `docs/modules/ro-engine/...`

更新范围包括：

- `AGENTS.md` / `CLAUDE.md` / `NEXT_CONTEXT.md`
- `docs/` 下的 spec、plan、dev-context、handoff
- 其他 `.md`、`.html`、脚本或配置中显式引用这些旧路径的文本

不主动重写历史上下文里纯粹作为“当时终端输出快照”的路径，除非该路径会被后续恢复流程或规范说明使用。

## 风险与处理

### HTML 文档中的相对资源

`doc/03-gantt` 中包含多个 `.html` mockup / demo。迁移后如果 HTML 内部使用相对资源路径，需要检查并更新。若没有相对资源引用，则只迁移文件。

### 文档间相互引用

模块文档可能互相引用旧路径。迁移后统一改成新路径，避免新旧路径混杂。

### Git rename 识别

迁移会在未 staged 状态下表现为旧文件删除、新文件新增。最终 `git add -A` 后 Git 才可能识别为 rename；不强制依赖 rename 展示。

## 验收标准

1. `doc/03-gantt`、`doc/04-rule-engine`、`doc/05-po-engine`、`doc/06-ro-engine` 下不再有实际文档文件。
2. `docs/modules/gantt/`、`docs/modules/rule-engine/`、`docs/modules/po-engine/`、`docs/modules/ro-engine/` 包含迁移后的文件。
3. 仓库中非历史快照引用不再指向旧四个模块路径。
4. `doc/00-*`、`docs/architecture`、`docs/modules/engine-server` 等非本轮范围保持不动。
5. 不产生业务代码、数据库、测试逻辑改动。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是文档路径迁移和引用更新，虽然文件数量较多，但操作线性；并行容易产生重复移动或引用冲突。
- Suggested split: 不拆分。
- Write boundaries: 只动文档路径和文档内引用，不动代码、数据库、测试。
- Conflict risk: 中等，主要风险是旧路径引用漏改、HTML 相对路径误判。
- Execution gate: 用户确认本 spec 后执行迁移。
