# 第三轮架构与需求文档迁移规整设计

日期：2026-05-18  
状态：已执行  
范围：迁移旧 `doc/` 下的全局架构、需求、部署和开发计划类文档

## 背景

前两轮已经完成：

- AI 设计 / 计划 / 完成归档迁移到 `docs/superpowers/`。
- PBS handoff 迁移到 `docs/handoff/pbs/`。
- Gantt、Rule Engine、PO Engine、RO Engine 长期模块文档迁移到 `docs/modules/`。

旧 `doc/` 下仍有一组全局架构、需求、部署和计划类文档，适合迁入 `docs/architecture/`、`docs/requirements/`、`docs/deployment/`、`docs/plans/`。

## 目标

1. 将全局架构类文档收敛到 `docs/architecture/`。
2. 将需求类文档收敛到 `docs/requirements/`。
3. 将部署说明收敛到 `docs/deployment/`。
4. 将全局开发计划收敛到 `docs/plans/`。
5. 更新仓库内旧路径引用，避免断链。
6. 不迁移截图素材、其他未确认模块资料和私有模块 docs。

## 迁移范围

```text
doc/01-architecture/*                 -> docs/architecture/
doc/tech-architecture.md              -> docs/architecture/tech-architecture.md
doc/frontend-framework-comparison.md  -> docs/architecture/frontend-framework-comparison.md
doc/functional-requirements.md        -> docs/requirements/functional-requirements.md
doc/technical-requirements.md         -> docs/requirements/technical-requirements.md
doc/requirements-checklist.md         -> docs/requirements/requirements-checklist.md
doc/gantt-confirmed-spec.md           -> docs/requirements/gantt-confirmed-spec.md
doc/gantt-ui-questions.md             -> docs/requirements/gantt-ui-questions.md
doc/development-plan.md               -> docs/plans/development-plan.md
doc/deployment-guide.md               -> docs/deployment/deployment-guide.md
```

## 不迁移范围

本轮不迁移：

- `docs/assets/screenshots/new-system/`
- `docs/assets/screenshots/old-javafx-system/`
- `docs/modules/pbs/`
- `docs/modules/engine-server/`
- `docs/modules/connector-server/`
- `docs/modules/monitoring/`
- `docs/params/`
- `docs/test-cases/e2e/`
- `data-migration/docs/`
- `pbs-portal/docs/current-state.md`

## 引用更新规则

迁移后更新仓库内文本引用：

- `doc/01-architecture/...` -> `docs/architecture/...`
- `doc/tech-architecture.md` -> `docs/architecture/tech-architecture.md`
- `doc/frontend-framework-comparison.md` -> `docs/architecture/frontend-framework-comparison.md`
- `doc/functional-requirements.md` -> `docs/requirements/functional-requirements.md`
- `doc/technical-requirements.md` -> `docs/requirements/technical-requirements.md`
- `doc/requirements-checklist.md` -> `docs/requirements/requirements-checklist.md`
- `doc/gantt-confirmed-spec.md` -> `docs/requirements/gantt-confirmed-spec.md`
- `doc/gantt-ui-questions.md` -> `docs/requirements/gantt-ui-questions.md`
- `doc/development-plan.md` -> `docs/plans/development-plan.md`
- `doc/deployment-guide.md` -> `docs/deployment/deployment-guide.md`

如果迁移后的 Markdown 内部存在相对链接，按新位置修正；图片和 SVG 等资源随 `doc/01-architecture/` 整体迁移，优先保持相对引用可用。

## 验收标准

1. `doc/01-architecture` 下不再有文件。
2. 本轮列出的根部 `doc/*.md` 不再保留在旧路径。
3. `docs/architecture/`、`docs/requirements/`、`docs/deployment/`、`docs/plans/` 包含迁移后的文件。
4. 仓库中非历史说明引用不再指向本轮旧路径。
5. `doc/00-*`、`docs/modules/engine-server`、`docs/modules/connector-server`、`docs/modules/monitoring`、`data-migration/docs`、`pbs-portal/docs/current-state.md` 保持不动。
6. 不产生业务代码、数据库、测试逻辑改动。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是路径迁移和引用更新，单线执行更容易控制引用修正和相对链接。
- Suggested split: 不拆分。
- Write boundaries: 只动文档路径和文档内引用，不动代码、数据库、测试。
- Conflict risk: 中等，主要风险是 Markdown 图片链接或 SVG 资源引用漏改。
- Execution gate: 用户已确认第三轮范围后执行迁移。
