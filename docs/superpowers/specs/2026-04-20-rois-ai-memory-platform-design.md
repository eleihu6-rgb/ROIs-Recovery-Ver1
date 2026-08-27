# ROIS-AI 平台级 Memory 设计文档

**日期：** 2026-04-20  
**作者：** Codex + lei  
**状态：** 草案，待确认  
**优先级：** 平台能力定义 → 开发侧接入 → 服务侧 PoC → 产品侧试点

---

## 背景

当前 `rois-ai` 已经不是单一应用，而是一个多项目 monorepo：

- `gantt`：运营/排班前端
- `live-server`：实时排班主服务
- `pbs-server`：PBS 后端
- `pbs-portal`：员工门户
- `pbs-app`：员工移动端
- `rule-engine / po-engine / ro-engine`：规则与优化引擎
- `docs / doc / sql`：大量项目文档、架构说明与业务定义

随着系统和文档增长，团队已经出现明显的“上下文易丢失”问题：

- 设计决策散落在多个 spec、plan、聊天与代码中
- AI / agent 每次进新会话都需要重新理解项目历史
- 不同子系统后续都可能需要“可检索记忆”，而不是只在单一前端里临时拼装

用户提出引入 [MemPalace](https://github.com/MemPalace/mempalace) 的原因，本质上不是“某个页面要加一个新功能”，而是希望 `rois-ai` 具备统一、可持续的 memory 能力。

---

## MemPalace 评估结论

根据官方仓库和文档，MemPalace 的定位是：

- 本地优先的 AI memory 系统
- 原文存储，不做总结性改写
- 通过语义检索找回历史上下文
- 可插拔后端，默认 `ChromaDB`
- 内置 temporal knowledge graph
- 提供 CLI、Python API、MCP server、Claude/Codex hooks

相关来源：

- GitHub README：<https://github.com/MemPalace/mempalace>
- CLI 文档：<https://mempalaceofficial.com/reference/cli>
- 搜索与 Python API：<https://mempalaceofficial.com/guide/searching>
- 配置文档：<https://mempalaceofficial.com/guide/configuration>
- Module Map / MCP server：<https://mempalaceofficial.com/reference/modules>

### 对本项目的判断

MemPalace 适合做 `rois-ai` 的 **memory kernel**，但不适合直接等同于最终产品能力。

原因：

1. 它本质上是 Python memory 引擎，不是 React 组件库，也不是 TypeScript SDK 主导的 SaaS 平台。
2. 它更适合承担“存储、检索、上下文唤醒、知识图谱”这类底层职责。
3. `rois-ai` 仍然需要自己补齐企业级运行要求：
   - 多系统接入协议
   - 用户/租户隔离
   - 审计
   - 敏感信息治理
   - 删除与保留策略
   - 产品态权限控制

因此，推荐方案不是“把 MemPalace 直接塞进某个前端”，而是把它作为平台级 memory 内核，在外层包一层 `rois-ai` 自己的能力边界。

---

## 目标

1. 为整个 `rois-ai` monorepo 建立统一的 memory 能力，而不是只服务单个项目。
2. 先提升开发侧 AI / agent 的长期记忆能力。
3. 再为 `live-server`、`pbs-server` 等服务提供可调用的 memory 检索能力。
4. 最终为 `gantt`、`pbs-portal`、`pbs-app` 等产品前端提供一致的“AI 助手记忆”后端基础。
5. 在引入能力的同时，预先定义隔离、权限、审计和数据治理边界。

---

## 非目标

- 本阶段不把 MemPalace 直接嵌进 `pbs-portal` 或 `gantt` 前端运行。
- 本阶段不让每个业务服务各自直接维护一套 MemPalace 集成。
- 本阶段不把开发侧记忆与产品侧用户记忆混在一个无边界的空间里。
- 本阶段不立即上线“面向员工的长期个性化记忆”，除非先补齐合规与治理能力。
- 本阶段不把数据库原始业务表直接裸喂给 memory 系统。

---

## 为什么必须做成平台能力

如果只在 `pbs-portal` 局部接入，会立刻遇到这些问题：

- `gantt` 后续也会需要 AI 助手和历史解释能力
- `live-server` 可能需要运营上下文检索
- `pbs-server` 可能需要 PBS 规则/帮助问答/用户会话记忆
- 开发团队本身就已经需要 repo 级长期记忆

这意味着 memory 需求天然跨项目。

如果每个项目各自接一套，会出现：

- 不同运行时混乱：Node/React/Python 各自做一份
- 权限模型分裂
- 记忆写入规范不一致
- 无法统一审计与删除
- 无法统一搜索与检索语义

因此推荐把目标升级为：

**建设 `rois-ai` 的平台级 memory layer。**

---

## 总体方案

采用 **三层式平台方案**：

1. **开发侧 Memory**
   服务整个 monorepo 的研发与 AI/agent 协作。
2. **共享 Memory Service**
   对业务服务暴露统一搜索/写入/上下文接口。
3. **各业务系统按需消费**
   `live-server`、`pbs-server` 作为服务消费者；
   `gantt`、`pbs-portal`、`pbs-app` 通过业务服务间接消费。

### 推荐架构

```text
                      +----------------------+
                      |   MemPalace Kernel   |
                      | Python + ChromaDB    |
                      | SQLite KG + CLI/MCP  |
                      +----------+-----------+
                                 |
                    +------------v------------+
                    |   rois-ai memory-service |
                    | Auth / Scope / Audit     |
                    | Search / Write / Context |
                    +------+---------+---------+
                           |         |
              +------------+         +-------------------+
              |                                          |
   +----------v----------+                   +-----------v-----------+
   |    live-server      |                   |      pbs-server       |
   | orchestration layer |                   | PBS assistant layer   |
   +----------+----------+                   +-----------+-----------+
              |                                          |
      +-------v-------+                          +-------v-------+
      |    gantt      |                          | pbs-portal    |
      |  operator UI  |                          | pbs-app       |
      +---------------+                          +---------------+
```

### 关键原则

- 前端不直接访问 MemPalace。
- Node 服务不直接嵌入 Python 内核。
- 通过统一 `memory-service` 暴露平台协议。
- 开发侧记忆和产品侧记忆必须分层隔离。

---

## 分层设计

## 第一层：开发侧 Memory

### 目标

让开发 AI / agent 记住：

- 架构文档
- spec / plan / decision
- 关键代码结构
- 模块之间的历史设计选择
- 之前会话中的问题与结论

### 范围

建议优先纳入：

- `docs/`
- `doc/`
- `sql/`
- `gantt/`
- `live-server/`
- `pbs-server/`
- `pbs-portal/`
- `pbs-app/`
- `rule-engine/`
- `po-engine/`
- `ro-engine/`

### 建议组织方式

按 MemPalace 的 `wing / room` 组织：

- wings
  - `rois-ai`
  - `gantt`
  - `live-server`
  - `pbs`
  - `engines`
- rooms
  - `architecture`
  - `auth`
  - `ui`
  - `pbs-domain`
  - `roster`
  - `pairing`
  - `sql-schema`
  - `decisions`

### 作用

- 这是最先落地的阶段
- 不涉及产品用户数据
- 见效最快，风险最低
- 直接提升后续 agent 开发效率

---

## 第二层：共享 Memory Service

### 为什么需要这一层

如果直接让 `pbs-server` 或 `live-server` 调 Python CLI/MCP，会带来：

- Node/Python 深耦合
- 调用协议不统一
- 错误处理和审计难以一致
- 每个服务都要重复实现 scope、权限、日志和重试

因此需要一层共享服务来承担平台职责。

### 推荐职责

- 统一调用 MemPalace 内核
- 屏蔽 Python 内部细节
- 提供统一 API
- 做 scope 校验
- 做访问控制
- 做审计日志
- 做敏感信息过滤
- 做数据生命周期管理

### 推荐技术形态

推荐新建独立服务：

- 名称建议：`memory-service`
- 运行时建议：Python
- 内核：MemPalace
- 封装方式：HTTP API

不推荐：

- 直接嵌入前端
- 直接在 `pbs-server` / `live-server` 中用 child process 到处调用
- 每个服务各自维护一套 Python bridge

---

## 第三层：业务系统消费方式

### `live-server`

适合接入的场景：

- 调度操作解释
- dashboard / scenario 相关知识问答
- 运营助手上下文搜索
- 操作过程中的可解释说明生成前检索

建议方式：

- `live-server` 调 `memory-service`
- `gantt` 通过 `live-server` 间接拿到结果

### `pbs-server`

适合接入的场景：

- PBS 帮助问答
- PBS 规则解释
- 用户历史咨询上下文
- PBS 申请相关的辅助说明

建议方式：

- `pbs-server` 调 `memory-service`
- `pbs-portal` / `pbs-app` 通过 `pbs-server` 间接消费

### `gantt`

不直接接 MemPalace。

推荐通过 `live-server` 使用 memory 能力。

理由：

- 权限和业务上下文都在服务侧
- 前端只负责交互展示
- 避免把 memory 边界和敏感数据控制放到浏览器端

### `pbs-portal` / `pbs-app`

也不直接接 MemPalace。

推荐通过 `pbs-server` 消费 memory 能力。

理由：

- 员工侧权限、用户身份、审计要求更强
- 需要由后端决定什么内容可写、可查、可删除

### `rule-engine / po-engine / ro-engine`

短期不作为主要 consumer。

中期可作为：

- 结构化解释结果的生产者
- 规则说明文档的知识源
- 优化过程摘要的写入端

即：

- 它们更适合作为 memory 的 **source** 或 **producer**
- 不一定一开始就是直接 query 的主要 consumer

---

## 数据域与隔离模型

这是平台级接入最关键的设计之一。

### 至少需要的隔离维度

- `system`
  - `gantt`
  - `live`
  - `pbs`
  - `engines`
  - `dev`
- `environment`
  - `dev`
  - `test`
  - `prod`
- `tenant`
  - 航司/组织
- `user_id`
- `session_id`
- `memory_scope`
  - `developer_shared`
  - `system_knowledge`
  - `team_shared`
  - `user_private`
  - `audit_explain`

### 原则

- 开发记忆与产品记忆必须分开。
- 不同系统的数据不能裸混。
- 个人私有记忆与公共知识不能裸混。
- 不同环境必须隔离，禁止 dev 数据污染 prod。

### 推荐实现

可以在平台层维护统一 metadata：

```json
{
  "system": "pbs",
  "environment": "prod",
  "tenant": "f8",
  "user_id": "12345",
  "session_id": "abc-001",
  "memory_scope": "user_private",
  "source_type": "chat_message"
}
```

该 metadata 既用于检索过滤，也用于审计与生命周期控制。

---

## Memory 类型划分

不建议把所有内容都当成一种记忆。

建议区分为四类：

### 1. 开发记忆

- spec
- plan
- 架构文档
- 代码决策
- agent 会话摘要或原文

### 2. 系统知识

- 帮助文档
- 规则说明
- 业务流程说明
- 航司/模块配置文档

### 3. 用户私有记忆

- 用户与 AI 助手的历史对话
- 用户自己保存的偏好说明
- 用户发起的查询上下文

### 4. 审计/解释型记忆

- 操作说明
- 关键解释结果
- 场景级辅助上下文

不同类型记忆的 retention、权限和检索范围不应相同。

---

## 建议接口

平台层建议统一提供如下 API：

### `POST /v1/memory/search`

用途：

- 搜索指定 scope 内的记忆

输入示例：

```json
{
  "query": "why did we switch to /login?token",
  "system": "dev",
  "environment": "dev",
  "memory_scope": "developer_shared",
  "tenant": null,
  "user_id": null,
  "limit": 5
}
```

### `POST /v1/memory/write`

用途：

- 写入一条或一组新记忆

### `POST /v1/memory/context`

用途：

- 获取某个场景启动时的 bounded context
- 类似 MemPalace 的 `wake-up`

### `POST /v1/memory/ingest`

用途：

- 内部导入文档、日志、说明文本

### `DELETE /v1/memory/items/:id`

用途：

- 删除或失效单条记忆

### `GET /v1/health`

用途：

- 服务健康检查

---

## 安全与合规要求

如果 memory 进入产品面，这是硬约束。

### 基本要求

- 前端不直接访问 memory 内核
- 所有产品态访问都必须经业务服务鉴权
- 所有 search / write 都要有审计
- 明确记录是谁、在什么系统、以什么 scope 访问了哪些记忆

### 敏感信息治理

- 默认不要把数据库原始记录全文写入 memory
- 先走 allowlist，而不是先全量写入再补过滤
- 对涉及机组隐私、排班敏感信息的内容，必须先定义允许写入的字段范围

### 生命周期

- 开发记忆可长期保留
- 用户私有记忆需支持删除、过期和撤回
- 审计型记忆要与业务日志策略协调

---

## 部署建议

## 开发环境

- 每个开发者本地可独立运行 MemPalace
- palace path 使用本地目录
- 用于 repo 级开发记忆

## 测试环境

- 单独 palace
- 单独向量索引
- 不与开发环境共享

## 生产环境

建议：

- 独立部署 `memory-service`
- 独立持久化卷
- 环境隔离
- 系统/租户 metadata 强隔离

不建议：

- 生产直接共用开发者本地 palace
- 把所有系统内容塞进一个无边界目录

---

## 分阶段实施计划

## P0：Repo 级开发记忆

目标：

- 给整个 `rois-ai` 开发流程加 memory

范围：

- mine 文档、spec、plan、关键代码目录
- 建立统一 wing/room 规范
- 验证开发问答效果

交付：

- 本地安装指引
- repo 级初始化与 mining 约定
- 开发 AI 检索示例

## P1：共享 Memory Service PoC

目标：

- 建立统一平台接口

范围：

- 新建 `memory-service`
- 实现 `search / write / context`
- 定义 metadata 与 scope 协议
- 仅服务内部开发与试验场景

交付：

- 最小 HTTP API
- MemPalace bridge
- 基础日志与错误处理

## P2：业务服务试点

目标：

- 先让服务端具备调用能力

优先顺序建议：

1. `pbs-server`
2. `live-server`

原因：

- 两者都是清晰的服务边界
- 比前端更适合先接权限与审计

## P3：产品侧试点

建议优先系统：

1. `pbs-portal`
2. `gantt`
3. `pbs-app`

原因：

- `pbs-portal` 的帮助/规则问答更容易先验证价值
- `gantt` 涉及更复杂的运营语义和敏感数据边界
- `pbs-app` 依赖移动端产品节奏，适合后置

---

## 成功标准

### P0 成功标准

- AI / agent 能可靠回答项目历史决策问题
- 开发者能检索到 spec、plan 和关键代码上下文

### P1 成功标准

- 存在统一 `memory-service`
- `pbs-server` 或 `live-server` 至少一个完成 PoC 调用

### P2/P3 成功标准

- 前端用户能在单一业务入口里使用 memory-backed assistant
- 检索与写入都具备权限、审计与隔离

---

## 风险

1. **把开发记忆和产品记忆混在一起**
   会直接造成权限和治理失控。

2. **过早让前端直连 memory**
   会把安全与权限问题暴露到浏览器端。

3. **多个服务各自直接集成 MemPalace**
   会导致协议分裂和重复实现。

4. **在没有脱敏策略前写入敏感业务数据**
   会造成高风险数据泄露面。

5. **把 memory 当成数据库镜像**
   Memory 适合知识、上下文、解释和对话，不适合作为业务主数据副本。

---

## 建议结论

最终建议如下：

1. **接受 MemPalace 作为 `rois-ai` 的 memory kernel**
2. **不要把它定义成单项目局部能力**
3. **先做 repo 级开发记忆**
4. **再建设统一的 `memory-service`**
5. **优先接 `pbs-server` 与 `live-server`**
6. **最后再让 `pbs-portal`、`gantt`、`pbs-app` 作为产品消费者接入**

这条路线兼顾：

- 当前可快速落地
- 多项目复用
- 长期治理
- 企业级安全边界

---

## 下一步

建议下一份文档直接进入 implementation plan，拆成两条并行线：

1. `P0 Repo 级开发记忆接入计划`
2. `P1 memory-service PoC 设计与实施计划`
