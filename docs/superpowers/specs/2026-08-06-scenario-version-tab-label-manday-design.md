# Scenario 版本 Gantt：导航标签版本前缀 + 版本 Manday 计算 设计

> 日期：2026-08-06 · 状态：已批准，进入实现

## 背景

一个 Scenario 经过多次优化会产生多个归档版本（`v0`/`v1`/`v2`…）。用户可从 Scenario 详情
Versions 页签「Open Gantt」打开任意历史版本的只读 Gantt，形成同一场景多个版本 tab 并存。

现状两个问题：

1. **版本标签无法区分**：所有场景 Gantt tab（当前场景 + 每个版本）的标签都是
   `#<id> <name>`（`scenario-gantt-view.tsx` 统一设置），Scenario 导航下拉里多个版本长得一样，
   用户切换时无法分辨当前是哪个版本的 Gantt。
2. **版本 Gantt 缺 Manday**：版本 gantt-data 走 `buildGanttDataFromSnapshotFiles`，
   返回 `crewStats: {}`（output.gz 本身不含 Manday 字段），且版本路由没有像当前场景
   （live-refresh 路径）那样调用 `computeScenarioCrewStats` 计算。Crew Header 因此不显示 Manday。

已与用户确认：版本「变一样」仅指标签无法区分，数据本身是正确的，**不**做前端 store 隔离重构。

## Feature A — 导航下拉版本前缀（前端）

**目标**：版本 tab 标签在场景 ID 前带版本前缀，如 `v1 #123 Scenario Name`；当前场景标签不变。

### 新增共享 util：`gantt/src/utils/scenario-module.ts`

两个纯函数：

```ts
const SCENARIO_MODULE_PREFIX = 'scenario-gantt:'

/** 解析 `scenario-gantt:123@v1` → { id: 123, version: 'v1' }（无版本 → version: undefined）。 */
export const parseScenarioModuleKey = (module: string): { id: number; version?: string } => {
  const [idText, version] = module.slice(SCENARIO_MODULE_PREFIX.length).split('@', 2)
  return { id: Number(idText), version: version || undefined }
}

/** 导航标签：`v1 #123 Alpha`（有版本）/ `#123 Alpha`（当前场景）/ `#123`（无 name 的 fallback）。 */
export const scenarioTabLabel = (id: number, name: string, version?: string): string => {
  const base = `${version ? `${version} ` : ''}#${id}`
  return name ? `${base} ${name}` : base
}
```

顺带修复：`scenario-nav-dropdown.tsx` 现 `scenarioIdOf` 对版本 key（`Number('123@v1')`）返回
`NaN`，fallback 标签会显示 `#NaN`。改为 `parseScenarioModuleKey` 后一并修复。

### 改动文件

1. `gantt/src/components/shell/scenario-gantt-view.tsx`（标签设置 effect，约 213-220 行）：
   `setScenarioTabLabel(moduleKey, scenarioTabLabel(scenarioId, data.scenarioName, version))`。
2. `gantt/src/components/shell/scenario-nav-dropdown.tsx`：
   - `scenarioIdOf` → `parseScenarioModuleKey(...).id`
   - 触发器 fallback（49 行）与列表项 fallback（108 行）改
     `scenarioTabLabel(id, '', version)`

### 持久化标签

已打开版本 tab 的旧标签存在 localStorage（shell store `scenarioTabLabels`）。`ScenarioGanttView`
每次数据加载都会重设标签，应用启动后所有已渲染 tab 都会刷新为新格式，无需迁移。

## Feature B — 版本 Gantt 计算 Manday（后端）

**目标**：版本 gantt-data 返回带 `crewStats` 的数据，Crew Header 显示 Manday。

### 改动文件：`live-server/src/routes/scenario/scenario.ts` 版本 gantt-data 路由（771-818 行）

1. 在 `buildGanttDataFromSnapshotFiles` 之后加（与 live-refresh 路径 1536 行一致）：

   ```ts
   const { computeScenarioCrewStats } = await import('../../services/scenario/scenario-crew-stats-service.js')
   data.crewStats = await computeScenarioCrewStats(fastify.db, data)
   ```

   `computeScenarioCrewStats` 从 gantt data（crew / assignments / pairingSegments / groundItems）
   计算 per-crew per-month 的 credit / dayOffCount / alCount / leaveCount，即「根据 Roster 数据
   计算 Manday」。output.gz 不直接提供 Manday。
2. 场景名不再拼版本后缀（796 行）：`name: sc.name`。否则与前端 `v1 #` 前缀叠加成冗余的
   `v1 #123 Alpha v1`。版本标识由前缀 + 工具栏「Historical v1」徽章承担。

版本 Gantt 只读、无 recompute WS push，故 crewStats 必须随 gantt-data 一次返回。

## 测试计划

| 层 | 覆盖 |
|---|---|
| 前端单元 | 新增 `gantt/src/utils/__tests__/scenario-module.test.ts`；扩展 `scenario-nav-dropdown.test.tsx`（版本模块触发器/列表项显示 `v1 #596`、无持久化标签时 fallback 显示 `v1 #596`） |
| 后端单元 | 版本 gantt-data 路由测试断言有作业的 crew 的 `crewStats` 非空 |
| E2E | 当前场景标签格式不变，现有断言 `module-nav-scenario` 含场景名的 e2e 回归（版本 tab 的 e2e 依赖后端有归档版本文件，本地不可得，标注为环境限制） |

## 不做的事（明确排除）

- 前端版本 store 隔离重构（`getScenarioGanttStore` 显式传 version）——用户确认数据未串，
  不属本次问题。
- 版本 Gantt 编辑 / save / recompute（只读，既有行为）。
