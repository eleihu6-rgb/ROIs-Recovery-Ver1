# 最终旧 doc 目录清理迁移设计

日期：2026-05-18  
状态：已执行  
范围：迁移旧 `doc/` 剩余截图素材、模块资料、E2E 文档和空占位目录，目标是让旧 `doc/` 目录消失

## 背景

前三轮已经迁移：

- AI 设计 / 计划 / 完成归档到 `docs/superpowers/`。
- PBS handoff 到 `docs/handoff/pbs/`。
- Gantt、Rule Engine、PO Engine、RO Engine 模块文档到 `docs/modules/`。
- 全局架构、需求、部署、开发计划文档到 `docs/architecture/`、`docs/requirements/`、`docs/deployment/`、`docs/plans/`。

旧 `doc/` 目录剩余内容已经不多。用户明确希望继续迁移，争取最终让 `doc/` 目录消失。

## 目标

1. 将剩余截图素材迁入 `docs/assets/screenshots/`。
2. 将剩余模块资料迁入 `docs/modules/`。
3. 将 E2E 文档迁入 `docs/test-cases/e2e/`。
4. 删除只剩 `.gitkeep` 的旧空目录。
5. 更新所有旧路径引用，避免断链。
6. 不动业务代码逻辑、数据库结构和测试逻辑。

## 迁移范围

```text
doc/00-new-system/*              -> docs/assets/screenshots/new-system/
doc/00-old-javafx-system-pic/*   -> docs/assets/screenshots/old-javafx-system/
doc/07-engine-server/*           -> docs/modules/engine-server/
doc/08-connector-server/*        -> docs/modules/connector-server/
doc/09-monitoring/*              -> docs/modules/monitoring/
doc/e2e/*                        -> docs/test-cases/e2e/
doc/02-pbs/.gitkeep              -> delete
doc/params/.gitkeep              -> delete
doc/.DS_Store                    -> delete
```

## 引用更新规则

- `doc/00-new-system/...` -> `docs/assets/screenshots/new-system/...`
- `doc/00-old-javafx-system-pic/...` -> `docs/assets/screenshots/old-javafx-system/...`
- `doc/07-engine-server/...` -> `docs/modules/engine-server/...`
- `doc/08-connector-server/...` -> `docs/modules/connector-server/...`
- `doc/09-monitoring/...` -> `docs/modules/monitoring/...`
- `doc/e2e/...` -> `docs/test-cases/e2e/...`
- `doc/params/...` -> `docs/params/...`

`docs/params` 当前只有 `.gitkeep`，没有实际参数文档。本轮只更新引用到未来规范路径 `docs/params/`，不凭空补写参数文档。

## 验收标准

1. `doc/` 目录下不再有文件。
2. 如果 `doc/` 目录为空，则删除该目录。
3. 迁移后的截图、模块文档和 E2E 文档都在 `docs/` 下对应位置。
4. 仓库中非迁移记录说明不再引用旧 `doc/` 路径。
5. Markdown 本地相对链接检查通过。
6. 不产生业务逻辑改动。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是最后一轮路径迁移和引用更新，单线操作更容易保证 `doc/` 清空和链接修正。
- Suggested split: 不拆分。
- Write boundaries: 只动文档、截图素材路径和文档引用。
- Conflict risk: 中等，主要风险是截图路径引用和监控文档引用漏改。
- Execution gate: 用户已确认继续迁移，目标是让旧 `doc/` 目录消失。
