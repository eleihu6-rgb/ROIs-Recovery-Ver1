# Scenario 模块设计规范

**日期**：2026-04-14
**状态**：已批准
**作者**：Claude Sonnet 4.6 + yuan.zhu

---

## 背景与目标

ROIS-AI 排班系统后端已完整实现 Scenario（优化场景）的 CRUD API、状态机、KPI 存储，
但前端 gantt 尚无对应 UI。

本模块在顶部导航 Live 右侧新增 **Scenario** 入口，提供：

- 场景列表浏览、搜索、筛选
- 场景详情查看与编辑（基本信息 + 优化范围过滤条件）
- 启动/停止优化引擎
- 以场景数据打开 Gantt 视图

支持三种场景类型：**PO**（Pairing Optimizer 航班优化）、**RO**（Roster Optimizer 机组优化）、**TO**（Training Optimizer 培训优化）。

---

## 一、导航与整体布局

### 1.1 顶部导航

在 `shell-top-nav.tsx` 的 `NAV_ITEMS` 中，`live` 之后插入：

```ts
{ module: 'scenario', label: 'Scenario', Icon: FlaskConical }
```

最终顺序：**Dashboard | Live | Scenario | Rule | Data | System**

### 1.2 左侧 Sidebar 子菜单

进入 Scenario 模块时，Sidebar 展示 3 个子项（与 Live 子菜单风格一致）：

| item | label | Icon | 说明 |
|------|-------|------|------|
| `all` | All Scenarios | `Layers` | 显示全部类型（默认） |
| `po` | PO | `FlaskConical` | 仅显示 PO 场景 |
| `ro-to` | RO / TO | `Users` | 仅显示 RO 和 TO 场景 |

Sidebar 折叠时只显示图标，展开时显示文字，与现有 Live 菜单行为完全一致。

### 1.3 内容区主从双栏布局

```
┌──────────────────────────────────────────────────────────────┐
│  Top Nav + Tab Bar                                           │
├──────┬───────────────────────────────────────────────────────┤
│      │  ┌── List Panel (340px) ──┬── Detail Panel ─────────┐ │
│Side  │  │  搜索栏 + 筛选下拉     │  (空状态 / 场景详情)    │ │
│bar   │  │  ─────────────────     │                         │ │
│      │  │  场景列表（可滚动）    │                         │ │
│      │  │  ─────────────────     │                         │ │
│      │  │  分页控件              │                         │ │
│      │  └────────────────────────┴─────────────────────────┘ │
└──────┴───────────────────────────────────────────────────────┘
```

- List Panel：固定 340px 宽度
- Detail Panel：自适应剩余空间
- 分隔线：`border-r border-border`

---

## 二、场景状态字典

场景状态通过 `dictionary` 表统一管理，**禁止在代码中硬编码状态字符串**。

**`parent_code = 'SCENARIO_STATUS'`**：

| code | label_zh | label_en | 说明 |
|------|----------|----------|------|
| `DRAFT` | 草稿 | Draft | 初始状态，可编辑 |
| `RUNNING` | 运行中 | Running | 优化引擎执行中，不可编辑 |
| `DONE` | 已完成 | Done | 优化完成，可查看 KPI |
| `FAILED` | 失败 | Failed | 优化失败，可重新提交 |

**状态流转：**

```
DRAFT ──► RUNNING ──► DONE
                  └──► FAILED ──► DRAFT
```

种子数据写入 `sql/seed/` 目录，使用幂等写法（`INSERT ... ON CONFLICT DO NOTHING`）。

---

## 三、场景列表面板

### 3.1 搜索与筛选栏（顶部一行紧凑布局）

```
[🔍 搜索场景名称...]  [类型 ▼]  [状态 ▼]  [+ 新建场景]
```

| 控件 | 行为 |
|------|------|
| 搜索框 | 实时过滤场景名称，debounce 300ms |
| 类型下拉 | 全部 / PO / RO / TO；Sidebar 已选子类型时自动锁定 |
| 状态下拉 | 从 `dictionary` 表动态加载 `SCENARIO_STATUS` 字典项 |
| 新建按钮 | primary 色调，点击后右侧切换为新建表单 |

### 3.2 场景列表行（双行卡片，行高 64px）

```
┌────────────────────────────────────────────────┐
│ ● 场景名称                         [RO]  ●     │  第一行：名称 + 类型徽章 + 状态点
│   2025-01-01 ~ 2025-03-31  ·  已优化 3 次      │  第二行：时间范围 · 优化次数
│   引用 Live  ·  张三  ·  2 小时前  (hover 显示) │  第三行：来源·修改人·相对时间
└────────────────────────────────────────────────┘
```

**类型徽章颜色（符合航空软件专业色系）：**

| 类型 | 样式 |
|------|------|
| PO | `bg-blue-500/15 text-blue-400` |
| RO | `bg-emerald-500/15 text-emerald-400` |
| TO | `bg-violet-500/15 text-violet-400` |

**状态指示点：**

| 状态 | 样式 |
|------|------|
| DRAFT | 灰色 `text-muted-foreground` |
| RUNNING | 蓝色 + `animate-pulse`（呼吸动画） |
| DONE | 绿色 `text-emerald-400` |
| FAILED | 红色 `text-destructive` |

**行交互：**

- hover：`hover:bg-accent/50`
- selected：左侧 3px 蓝色竖线 + `bg-accent` 背景
- 三点菜单（`···`）：复制场景、删除场景（删除需确认对话框）

### 3.3 列表底部

固定底部分页控件，每页 20 条：

```
共 24 个场景                    [<  1  2  3  >]
```

---

## 四、场景详情面板

### 4.1 整体结构（从上到下可滚动）

```
┌──────────────────────────────────────────────────────────┐
│  [场景名称（行内可编辑）]              [DRAFT ▼]  [···]  │  ← 头部
├──────────────────────────────────────────────────────────┤
│  区块 1：基本信息                                [编辑]  │
│  类型 [RO]   开始 2025-01-01   结束 2025-03-31           │
│  引用 Live 数据 ●   法规集 [标准法规集A]                 │
├──────────────────────────────────────────────────────────┤
│  区块 2：优化范围过滤（动态，按场景类型渲染）            │
│  Accordion：机组过滤 (3) / 环过滤 (2) / 航班过滤 / 课程  │
├──────────────────────────────────────────────────────────┤
│  区块 3：KPI 指标                                        │
│  Done 时：4 格 KPI 卡片                                  │
│  Running 时：进度条 + 预计剩余时间                        │
├──────────────────────────────────────────────────────────┤
│  [修改人: 张三  最后修改: 2小时前]                        │  ← 底部固定操作栏
│                        [保存]  [启动优化]  [打开 Gantt]  │
└──────────────────────────────────────────────────────────┘
```

### 4.2 区块 2：优化范围过滤

采用 **Accordion + Tag 选择器**组合。每个 Accordion 折叠头显示已选条件数量徽章（如 `机组过滤 (3)`）。所有条件序列化为 JSONB 存入 `scenario.filter_params` 字段。

#### PO 场景 — 航班过滤

```
▼ 航班过滤
   日期范围    [2025-01-01] ~ [2025-03-31]
   航班号      [CA101 ×] [CA102 ×] [+ 添加]   支持通配符 CA1*
   出发机场    [PEK ×] [SHA ×] [+ 添加]
   到达机场    [PEK ×] [+ 添加]
   机队型号    [B737 ×] [A320 ×] [+ 添加]
   航班状态    ● 计划  ○ 实际  ○ 全部
```

#### RO 场景 — 机组过滤 + 环过滤

```
▼ 机组过滤
   机组类型    ● 飞行员  ○ 客舱  ○ 全部
   基地        [PEK ×] [SHA ×] [+ 添加]
   机队资质    [B737 ×] [+ 添加]
   在职状态    ● 在职  ○ 全部

▼ 环（Pairing）过滤
   基地        [PEK ×] [+ 添加]
   机队        [B737 ×] [A320 ×] [+ 添加]
   环来源      ☑ 手动  ☑ 优化  ☑ 导入（多选）
```

#### TO 场景 — 机组过滤 + 环过滤 + 培训课程

```
▼ 机组过滤    （同 RO）
▼ 环过滤      （同 RO）
▼ 培训课程
   课程类型    [年度复训 ×] [模拟机 ×] [+ 添加]
   有效期筛选  ● 即将到期（90天内）  ○ 全部
   优先级      [紧急 ×] [常规 ×] [+ 添加]
```

**Tag 选择器行为：**
- 已选条件显示为可删除 Tag：`[PEK ×]`
- 点击 `+ 添加` 弹出下拉搜索选择器

### 4.3 区块 3：KPI 展示

**Done 状态** — 4 格 KPI 卡片：

```
┌──────────┬──────────┬──────────┬──────────┐
│  利用率  │  成本    │  公平性  │  违规数  │
│  87.3%  │ -12.4%  │   0.82   │    0     │
│  ↑ 2.1% │ vs Live │          │          │
└──────────┴──────────┴──────────┴──────────┘
```

**Running 状态** — 进度条 + 预计剩余时间：

```
优化进行中...  ████████░░  78%    预计剩余 3 分钟
```

### 4.4 底部固定操作栏

| 按钮 | 样式 | 行为 |
|------|------|------|
| 保存 | `outline` 次级按钮 | 有未保存变更时高亮提示 |
| 启动优化 | `primary` 主按钮 | Running 中变为 `[停止优化]` |
| 打开 Gantt | `secondary` 按钮 | **始终可点击**，不限制场景状态；以当前场景过滤条件打开 Gantt |

### 4.5 空状态

未选中任何场景时，右侧详情面板显示引导空状态：

```
           ⬡  （场景图标）

        还没有选中场景

    从左侧选择一个场景查看详情
    或点击新建按钮创建新场景

           [+ 新建场景]
```

---

## 五、关键技术决策

### 5.1 状态管理

新建 `scenario-store.ts`（Zustand），管理：

```ts
{
  // 列表
  scenarios: ScenarioItem[]
  total: number
  page: number
  pageSize: number  // 固定 20
  searchName: string
  filterType: 'all' | 'PO' | 'RO' | 'TO'
  filterStatus: string  // SCENARIO_STATUS code 或空字符串

  // 详情
  selectedId: number | null
  detail: ScenarioDetail | null
  draftDetail: ScenarioDetail | null  // 编辑草稿
  isDirty: boolean  // 是否有未保存变更

  // 加载状态
  listLoading: boolean
  detailLoading: boolean
  saving: boolean
}
```

### 5.2 API 服务

新建 `scenario-api.ts`，复用 `http-client.ts` 工厂，对应后端已有端点：

| 方法 | 端点 | 说明 |
|------|------|------|
| `list(params)` | `GET /api/scenario` | 分页列表 |
| `getById(id)` | `GET /api/scenario/:id` | 详情 |
| `create(data)` | `POST /api/scenario` | 新建 |
| `update(id, data)` | `PUT /api/scenario/:id` | 更新 |
| `remove(id)` | `DELETE /api/scenario/:id` | 删除 |
| `transition(id, status)` | `POST /api/scenario/:id/transition` | 状态流转 |
| `getKpis(id)` | `GET /api/scenario/:id/kpi` | KPI 列表 |

### 5.3 过滤条件数据结构

`filter_params` JSONB 字段结构（按类型）：

```ts
// PO
interface PoFilterParams {
  flights: {
    flightNos: string[]        // 支持通配符
    depAirports: string[]
    arrAirports: string[]
    fleets: string[]
    flightStatus: 'SCHEDULED' | 'ACTUAL' | 'ALL'
  }
}

// RO
interface RoFilterParams {
  crew: {
    division: 'P' | 'C' | 'ALL'
    bases: string[]
    fleets: string[]
    status: 'ACTIVE' | 'ALL'
  }
  pairing: {
    bases: string[]
    fleets: string[]
    sources: Array<'MANUAL' | 'OPT' | 'IMPORT'>
  }
}

// TO 继承 RO 并增加
interface ToFilterParams extends RoFilterParams {
  training: {
    courseTypes: string[]
    expiryFilter: 'EXPIRING_90D' | 'ALL'
    priorities: string[]
  }
}
```

---

## 六、文件清单

### 需修改的文件

| 文件 | 修改内容 |
|------|---------|
| `gantt/src/components/shell/shell-top-nav.tsx` | NAV_ITEMS 插入 scenario |
| `gantt/src/components/shell/shell-sidebar.tsx` | 添加 scenario 子菜单 |
| `gantt/src/components/shell/app-shell.tsx` | 添加 scenario → ScenarioView 映射 |
| `gantt/src/stores/shell-store.ts` | 扩展 ActiveModule 类型 |

### 需新建的文件

| 文件 | 说明 |
|------|------|
| `gantt/src/types/scenario.ts` | TS 类型定义 |
| `gantt/src/services/scenario-api.ts` | API 服务 |
| `gantt/src/stores/scenario-store.ts` | Zustand Store |
| `gantt/src/components/shell/scenario-view.tsx` | 顶层双栏视图 |
| `gantt/src/components/scenario/scenario-list-panel.tsx` | 列表面板 |
| `gantt/src/components/scenario/scenario-search-bar.tsx` | 搜索筛选栏 |
| `gantt/src/components/scenario/scenario-list-item.tsx` | 单行卡片 |
| `gantt/src/components/scenario/scenario-detail-panel.tsx` | 详情面板容器 |
| `gantt/src/components/scenario/scenario-basic-info.tsx` | 基本信息区块 |
| `gantt/src/components/scenario/scenario-filter-section.tsx` | 过滤条件 Accordion |
| `gantt/src/components/scenario/filter/po-flight-filter.tsx` | PO 航班过滤 |
| `gantt/src/components/scenario/filter/ro-crew-filter.tsx` | RO/TO 机组过滤 |
| `gantt/src/components/scenario/filter/ro-pairing-filter.tsx` | RO/TO 环过滤 |
| `gantt/src/components/scenario/filter/to-training-filter.tsx` | TO 培训课程过滤 |
| `gantt/src/components/scenario/scenario-kpi-section.tsx` | KPI 展示区块 |
| `gantt/src/components/scenario/scenario-action-bar.tsx` | 底部操作栏 |
| `gantt/src/components/scenario/scenario-empty-state.tsx` | 空状态组件 |
| `sql/seed/XX-scenario-status-dict.sql` | SCENARIO_STATUS 字典种子数据 |

---

## 七、验证方案

1. **导航**：点击 Scenario 菜单，Tab Bar 出现标签，Sidebar 显示 All / PO / RO·TO 子菜单
2. **列表**：场景正确展示，搜索/类型/状态筛选有效，分页正常
3. **类型徽章与状态点**：PO 蓝 / RO 绿 / TO 紫；RUNNING 有呼吸动画
4. **详情**：点击场景行，右侧面板加载数据，字段可编辑，保存后持久化
5. **过滤条件**：PO/RO/TO 三种类型的 Accordion 按类型正确渲染
6. **状态下拉**：从 dictionary 动态加载，不硬编码
7. **新建场景**：点击新建，右侧显示空白表单，填写后可保存
8. **启动优化**：点击后状态变为 RUNNING，按钮变为 `停止优化`
9. **打开 Gantt**：任意状态均可点击，以场景过滤条件进入 Gantt
10. **类型检查**：`npx tsc --noEmit` 零错误
