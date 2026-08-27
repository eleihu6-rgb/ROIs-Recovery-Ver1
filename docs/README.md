# ROIS-AI 文档目录说明

本目录是 ROIS-AI 项目的统一文档入口。后续 AI、开发者、产品讨论、交接、设计、测试用例、架构资料、截图素材都应优先放在 `docs/` 下，避免重新散落到旧路径或模块私有目录。

## 总原则

- 新增开发文档默认写入 `docs/`，不要再新增旧 `doc/` 目录。
- 用户可读的开发文档默认使用简体中文。
- 需求确认、设计 spec、实施计划、交接、上下文快照要分目录保存，不要混放。
- 正式产品 / 架构 / 模块长期文档和临时 AI 对话上下文要分开。
- 文档中不要写入 `.env`、数据库密码、Token、生产账号、明文凭据或其他敏感信息。
- 如果不确定放哪里，先放到最接近职责的目录，并在文档标题和文件名中写清模块与主题。

## 一级目录总览

| 目录 | 用途 |
|------|------|
| `docs/ai/` | AI agent 文档规范、协作约定、目录治理说明 |
| `docs/architecture/` | 全局架构、数据库设计、技术架构、架构图和系统级技术决策 |
| `docs/assets/` | 文档引用的静态素材，例如截图、架构图、参考图片 |
| `docs/deployment/` | 部署、上线、环境准备、运行维护相关文档 |
| `docs/dev-context/` | AI 对话上下文、阶段性开发记忆、跨窗口恢复资料 |
| `docs/handoff/` | 跨人、跨窗口、跨 agent 的正式交接文档 |
| `docs/modules/` | 各业务 / 技术模块的长期文档 |
| `docs/params/` | 系统参数、功能配置、航司参数、法规参数、优化参数说明 |
| `docs/plans/` | 项目级长期开发计划、路线图、里程碑计划 |
| `docs/requirements/` | 产品需求、技术需求、需求清单、已确认规格 |
| `docs/superpowers/` | brainstorming 产出的 spec、实施 plan、已完成设计归档 |
| `docs/test-cases/` | 人工测试用例、回归测试清单、模块验收用例 |

## 目录详细说明

### `docs/ai/`

存放 AI 文档放置规则和协作规范。

适合放：

- AI / Codex / Claude 文档目录规范。
- 文档治理规则。
- agent 协作约定。
- “以后文档应该放哪里”的说明。

当前核心文件：

- `docs/ai/README.md`

### `docs/architecture/`

存放系统级、全局级架构资料。

适合放：

- 系统整体技术架构。
- 数据库设计。
- 新旧系统对照。
- 架构图、数据层设计图、路线图 SVG / PNG。
- 跨模块技术决策。

不适合放：

- 某个单独模块的详细实现说明；应放到 `docs/modules/<module>/`。
- 某次临时开发上下文；应放到 `docs/dev-context/`。

### `docs/assets/`

存放文档引用的静态素材。

当前子目录：

| 目录 | 用途 |
|------|------|
| `docs/assets/screenshots/new-system/` | 新系统界面截图、原型截图、当前系统视觉资料 |
| `docs/assets/screenshots/old-javafx-system/` | 旧 JavaFX 系统截图和功能参考图 |

使用建议：

- 文档中引用截图时使用相对路径。
- 不要把运行时上传文件、生产数据截图、含敏感信息的图片放进仓库。
- 新增截图文件名尽量使用英文或清晰业务名，避免只有随机截图名。

### `docs/deployment/`

存放部署和运维交付资料。

适合放：

- 部署指南。
- 服务器准备说明。
- 上线步骤。
- 环境变量说明模板。
- 运维启动 / 停止 / 回滚流程。

当前核心文件：

- `docs/deployment/deployment-guide.md`

### `docs/dev-context/`

存放 AI 对话上下文和阶段性开发记忆。

适合放：

- `save-context.sh` 生成的上下文。
- 新窗口恢复开发状态所需的摘要。
- 本轮做了什么、为什么这么做、下次从哪里继续。
- 重要技术 / 产品决策的阶段性记录。

不适合放：

- 正式需求 spec；应放到 `docs/superpowers/specs/`。
- 长期模块文档；应放到 `docs/modules/<module>/`。
- 测试用例；应放到 `docs/test-cases/`。

重要文件：

- `docs/dev-context/LATEST.md`：最近一次开发上下文入口。
- `docs/dev-context/README.md`：上下文目录说明。

### `docs/handoff/`

存放正式交接文档。

当前子目录：

| 目录 | 用途 |
|------|------|
| `docs/handoff/pbs/` | PBS 相关跨窗口 / 跨人交接文档 |

适合放：

- 交给下一位开发者或下一个 AI 窗口继续工作的文档。
- 阶段性功能完成后的交接说明。
- 当前已知风险、未完成项、下一步建议。

### `docs/modules/`

存放模块级长期文档。这里是各模块“稳定知识”的主要归档位置。

当前子目录：

| 目录 | 用途 |
|------|------|
| `docs/modules/gantt/` | Gantt 排班前端长期文档、交互设计、Pane 设计、Canvas 技术说明 |
| `docs/modules/rule-engine/` | 法规引擎设计、规则目录、数据模型、实现指南 |
| `docs/modules/po-engine/` | Legacy PO engine reference; temporarily retained and outside current F8 delivery scope |
| `docs/modules/ro-engine/` | Legacy RO engine/baseline reference; current F8 optimization uses `pbs-engine/` |
| `docs/modules/engine-server/` | 优化服务 engine-server 的接口、认证、部署和架构资料 |
| `docs/modules/connector-server/` | 外部系统连接器文档，例如 F8 接口说明 |
| `docs/modules/monitoring/` | 监控系统架构、Prometheus / Loki / Grafana / Windmill 说明 |

适合放：

- 模块长期设计。
- 模块 API 说明。
- 模块内部架构和实现约定。
- 模块功能说明。
- 模块历史决策中仍然有效的资料。

不适合放：

- 一次性的开发计划；优先放 `docs/superpowers/plans/`。
- AI 对话上下文；放 `docs/dev-context/`。
- 用户验收测试步骤；放 `docs/test-cases/`。

### `docs/params/`

存放参数化配置说明。

适合放：

- 系统参数说明。
- 功能开关说明。
- 航司参数说明。
- 法规参数说明。
- 优化参数说明。
- UI 参数说明。

当前说明：

- 旧 `doc/params/` 只有空占位文件，没有实际可迁移内容。
- 后续新增参数文档统一放这里。

### `docs/plans/`

存放项目级长期计划。

适合放：

- 项目总体开发计划。
- 阶段路线图。
- 里程碑计划。
- 跨模块长期规划。

不适合放：

- 某个具体功能的实施 plan；应放到 `docs/superpowers/plans/`。

当前核心文件：

- `docs/plans/development-plan.md`

### `docs/requirements/`

存放产品和技术需求资料。

适合放：

- 功能需求文档。
- 技术需求文档。
- 需求对齐清单。
- 用户已确认规格。
- Gantt 等核心界面的确认规格和问题清单。

当前核心文件：

- `docs/requirements/functional-requirements.md`
- `docs/requirements/technical-requirements.md`
- `docs/requirements/requirements-checklist.md`
- `docs/requirements/gantt-confirmed-spec.md`
- `docs/requirements/gantt-ui-questions.md`

### `docs/superpowers/`

存放按照 brainstorming / spec / plan 流程生成的开发设计文档。

当前子目录：

| 目录 | 用途 |
|------|------|
| `docs/superpowers/specs/` | 需求确认、设计文档、方案说明 |
| `docs/superpowers/plans/` | 设计确认后的实施计划 |
| `docs/superpowers/completed/` | 已完成的设计 / 计划归档 |

适合放：

- 新功能开发前的正式 spec。
- 行为变更、API 变更、schema 变更前的设计文档。
- 多文件改动前的实施计划。
- 已完成方案的归档。

命名建议：

```text
docs/superpowers/specs/YYYY-MM-DD-<module>-<topic>-design.md
docs/superpowers/plans/YYYY-MM-DD-<module>-<topic>.md
```

### `docs/test-cases/`

存放人工测试、回归测试和验收用例。

当前子目录：

| 目录 | 用途 |
|------|------|
| `docs/test-cases/e2e/` | E2E 测试说明和端到端验证资料 |
| `docs/test-cases/pbs/` | PBS 人工测试和回归测试用例 |
| `docs/test-cases/pbs/line/` | PBS Line 相关测试用例 |
| `docs/test-cases/pbs/tier/` | PBS Tier 相关测试用例 |

适合放：

- 人工验收步骤。
- 回归测试清单。
- Playwright / E2E 场景说明。
- bug 修复后的复测步骤。

## 常见文档应该放哪里

| 场景 | 推荐目录 |
|------|----------|
| 新功能需求确认 | `docs/superpowers/specs/` |
| 新功能实施计划 | `docs/superpowers/plans/` |
| 大任务结束保存上下文 | `docs/dev-context/` |
| 跨窗口交接 | `docs/handoff/<module>/` |
| 模块长期设计 | `docs/modules/<module>/` |
| 全局架构图 / 技术架构 | `docs/architecture/` |
| 产品需求 / 技术需求 | `docs/requirements/` |
| 部署上线说明 | `docs/deployment/` |
| 参数说明 | `docs/params/` |
| 截图素材 | `docs/assets/screenshots/` |
| 人工测试用例 | `docs/test-cases/<module>/` |

## 迁移状态

旧 `doc/` 目录已经完成迁移并删除。

主要迁移结果：

- AI 设计 / 计划 / 完成归档迁入 `docs/superpowers/`。
- PBS handoff 迁入 `docs/handoff/pbs/`。
- Gantt、Rule Engine、PO Engine、RO Engine 等模块文档迁入 `docs/modules/`。
- 架构、需求、部署、开发计划迁入对应 `docs/` 目录。
- 截图素材迁入 `docs/assets/screenshots/`。
- E2E 文档迁入 `docs/test-cases/e2e/`。
- 参数文档入口迁入 `docs/params/`。

仍需单独决定是否迁移的模块私有资料：

- `data-migration/docs/`
- `pbs-portal/docs/current-state.md`
