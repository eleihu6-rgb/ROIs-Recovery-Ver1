# PBS Period 移除 Filiale 设计

## 背景

PBS Period 当前在新增、编辑、年度生成和列表中展示 `Filiale`，接口也收发该字段。但 Period 的真实数据源 `live.roster_period` 并不存在 `filiale` 列；当前值只是 Live Server 从系统配置读取后临时拼入查询结果，并没有参与 Period 的存储、筛选或周期匹配。

## 目标

- 用户不再查看或填写无实际作用的 `Filiale`。
- Period 前后端契约不再包含虚假的 `filiale` 字段。
- Period 仍然通过 `Period Code` 匹配或创建 `roster_period`。
- 不影响系统其他模块真实使用的 Filiale 配置和数据隔离逻辑。

## 方案比较

### 方案 A：完整移除（采用）

从 Period 页面、类型、请求、响应、年度生成及相关测试中移除 `filiale`。后端不再为了 Period 响应调用 `resolveFiliale`，也不再通过 SQL 常量伪造该字段。

优点：契约与真实数据模型一致，不留下误导字段。

### 方案 B：只隐藏页面字段

页面不展示，但请求和响应继续携带 `filiale`。

缺点：仍然保留无业务作用的接口字段，后续维护者容易误认为 Period 按 Filiale 隔离。

### 方案 C：保留只读 Filiale

禁止用户修改，但列表和响应继续展示系统 Filiale。

缺点：Period 记录本身并不拥有该属性，展示会错误表达数据归属。

## 变更范围

### Gantt

- Add/Edit Period 弹窗移除 `Filiale`。
- Generate PBS Year 弹窗移除 `Filiale`。
- Period 列表移除 `Filiale` 列，并同步调整空状态表格列数。
- `PbsPeriod`、`PbsPeriodInput`、年度生成输入和预览类型移除 `filiale`。
- 校验文案不再要求 Filiale。

### Live Server

- Period 列表查询 schema 显式拒绝旧 `filiale` 查询参数。
- Period 新增和年度生成请求 schema 移除 `filiale`，并显式拒绝旧请求中的该字段。
- Period 列表、新增、编辑和年度生成响应移除 `filiale`。
- 删除 Period 路由中仅用于伪造该字段的 `resolveFiliale` 读取及函数参数。
- `roster_period` 的匹配、创建、编辑、删除逻辑保持不变。

### 数据库

- 不修改 `roster_period` 表。
- 不新增或删除数据库字段。
- 不需要 migration。

### 非范围

- 不移除 Live Server 全局 Filiale 配置。
- 不修改 Crew、Pairing、Rule、Scenario 或其他真正按 Filiale 工作的模块。
- 不改变 Period 的权限、时间计算、System Stage 或 Portal 当前周期选择逻辑。

## 兼容与错误处理

- 新版 Period List、POST、PATCH、Generate Year Preview 和 Generate Year 接口若收到 `filiale`，返回 HTTP 400，避免旧客户端静默传递无效字段。
- 其他字段校验及既有全局错误提示方式保持不变。

## 验收标准

1. Period 列表、新增、编辑和年度生成页面均不出现 `Filiale`。
2. 前端所有 Period 请求体均不包含 `filiale`。
3. Period API 所有响应均不包含 `filiale`。
4. 列表查询或写请求携带旧 `filiale` 字段时返回 HTTP 400。
5. 新增、编辑、年度预览、年度生成和删除仍可正常完成。
6. `roster_period` 表结构和系统其他 Filiale 功能不受影响。

## 测试

- Live Server 单元测试覆盖响应契约、GET 与写请求的旧字段拒绝、Period Code 自动匹配/创建和年度生成。
- Playwright 通过真实 Gantt 页面验证新增、编辑和年度生成无 Filiale 控件、请求体无该字段。
- 运行 Gantt 与 Live Server TypeScript 检查、构建和 UI 标准检查。

## Multi-Agent Parallelism Assessment

- Recommendation：No
- Rationale：范围不大，前后端契约和测试必须同步，拆分收益低于协调成本。
- Suggested split：不拆分。
- Write boundaries：仅 Period 管理相关前端、后端、测试与文档。
- Conflict risk：工作区存在无关 Pairing 改动，实施时必须限定文件范围。
- Execution gate：本文档评审通过且用户明确批准实施后开始修改。
