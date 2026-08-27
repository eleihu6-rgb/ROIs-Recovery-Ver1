# Live Server Scenario Package 导出条件 API 设计

## 背景

PBS 算法偏好包导出已经从 `pbs-server` 迁移到 `live-server`。当前 `live-server` 的普通导出接口 `GET /api/admin/algorithm-export` 已支持导出条件：

- `division`
- `status`
- `bases`
- `fleetQuals`

但场景导出接口 `POST /api/admin/algorithm-export/scenario-package` 目前只支持：

- `periodCode`
- `crewIds`
- `scenarioStart`
- `scenarioEnd`

场景导出会根据 `crewIds` 自动推导 crew 的 `base/division/rank` 和日期范围，用于缩小 `PAIRING_SCORE` 的 pairing 范围；但它还不能接收显式导出条件。

## 目标

让 `live-server` 的 scenario package API 支持与普通导出相同的导出条件，但第一阶段不改 Gantt 运行 scenario 页面。

API 支持后，调用方可以传：

```json
{
  "periodCode": "Jun 2026",
  "crewIds": ["536", "247"],
  "scenarioStart": "2026-06-01",
  "scenarioEnd": "2026-06-30",
  "filters": {
    "division": "P",
    "status": "ACTIVE",
    "bases": ["YEG"],
    "fleetQuals": ["737"]
  }
}
```

## 范围

### 本次做

- 扩展 `PbsAlgorithmExportScenarioBody`，新增可选 `filters` 字段。
- `live-server` scenario package route 校验 `filters`。
- `live-server` scenario package service 使用 `crewIds ∩ filters` 作为最终导出 crew 范围。
- `engine-server` client 支持传 filters，但默认不传，保持当前 Gantt scenario run 行为不变。
- 补充 route/service/client 相关测试。

### 本次不做

- 不改 Gantt 运行 scenario 页面。
- 不在页面上新增筛选控件。
- 不改变当前 engine 自动 scenario run 的默认行为。
- 不让 filters 覆盖 `crewIds`。
- 不恢复 `pbs-server` 旧导出逻辑。

## 核心规则

最终导出 crew 范围必须是交集：

```text
finalCrewIds = scenarioCrewIds ∩ filtersMatchedCrewIds
```

如果 `filters` 未传，行为等同当前实现：

```text
finalCrewIds = scenarioCrewIds
```

如果交集为空，API 应直接返回失败，不生成空偏好包。推荐返回 `400`，错误信息说明导出条件过滤后没有 crew。

## 数据流

1. `engine-server` 调用 `POST /api/admin/algorithm-export/scenario-package`。
2. 请求体包含 `periodCode`、`crewIds`、可选日期窗口、可选 `filters`。
3. `live-server` route 使用 Zod 校验请求体。
4. service 先基于 `crewIds` 和 `filters` 求最终 crew scope。
5. 后续 `DAYSOFF.csv`、`PAIRING_SCORE.csv`、`RESERVE_SCORE.csv`、`LINE_RULES.csv` 都使用最终 crew scope。
6. `PAIRING_SCORE.csv` 继续使用 scenario 日期窗口与 crew 推导出的 `base/division/rank` 缩小 pairing 范围。

## API 合同

### Request Body

```ts
type PbsAlgorithmExportScenarioBody = {
  periodCode: string;
  crewIds: string[];
  scenarioStart?: string;
  scenarioEnd?: string;
  filters?: {
    division?: "P" | "C" | "A" | "ALL";
    status?: "ACTIVE" | "ALL";
    bases?: string[];
    fleetQuals?: string[];
  };
};
```

### 校验规则

- `periodCode` 必填。
- `crewIds` 必填且至少一个。
- `scenarioStart/scenarioEnd` 如传入，必须是 `YYYY-MM-DD`。
- `filters` 可选。
- `filters.bases`、`filters.fleetQuals` 去空格、转大写、去重。
- `filters.division` 默认 `ALL`。
- `filters.status` 默认 `ALL`。

## 错误处理

- 请求结构错误：`400 periodCode and crewIds are required.` 或更具体的 validation message。
- filters 与 crewIds 交集为空：`400 No crews match the scenario package export filters.`
- 非 admin：保持 `403 Admin access required`。
- live-server 内部导出异常：保持 `500 Failed to export PBS scenario algorithm package.`
- 旧 pbs-server 入口继续返回 `410 PBS algorithm export has moved to live-server.`

## 测试计划

### live-server route tests

- admin 请求带 filters 时，route 把 filters 传给 service。
- filters 格式错误时返回 `400`。
- 空 `crewIds` 仍返回 `400`。

### live-server service tests

- `crewIds` 与 filters 取交集。
- filters 未传时保持当前 behavior。
- 交集为空时抛出业务错误并返回 `400`。
- scenario window 未传时仍按 `periodCode` 推导月份窗口。

### engine-server tests

- `bid_package_client.fetch_scenario_package` 支持可选 filters payload。
- 当前 task manager 默认不传 filters，现有 scenario run 行为不变。

## 风险与约束

- 如果未来 Gantt 页面新增条件控件，必须明确告诉用户：条件会缩小偏好包 crew 范围，可能导致某些 scenario crew 没有偏好数据。
- 当前第一阶段不改页面，避免影响正在使用的 scenario run 流程。
- 需要保持普通导出与 scenario 导出的 filters 语义一致，避免两个接口同名字段行为不同。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动范围小，主要是一个 API contract、一个 service scope 过滤、少量测试；多 agent 协调成本高于收益。
- Suggested split: 不建议拆分。
- Write boundaries: 单 agent 依次修改 contracts、live-server、engine-server tests 即可。
- Conflict risk: 多 agent 同时改同一批导出文件，冲突风险较高。
- Execution gate: 用户确认本 spec 后再开始实现。
