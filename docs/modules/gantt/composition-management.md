# Composition Management

> 配比管理功能 — Gantt Rule 模块子页面

## 功能概述

Composition Management 提供两个子页面：

1. **Composition Load** — 配比规则匹配表，定义航班属性与配比方案的对应关系
2. **Composition** — 配比方案管理，定义各职级在不同选项下的配比人数

## 页面导航

Rule 模块侧边栏包含三个导航项：
- **Rule Manager** — 法规配置管理（原有功能）
- **Composition Load** — 配比规则匹配表
- **Composition** — 配比方案管理

导航状态通过 `shell-store` 的 `ActiveRuleItem` 管理，持久化到 localStorage。

## Composition Load（配比规则匹配表）

### 功能

管理 `composition_load` 表数据，定义航班匹配规则：

- 根据航班属性（Division、Fleet、Flight No.、Sub Fleet 等）匹配对应的配比方案
- 支持优先级排序（Sequence 字段）
- 支持生效日期范围（effDt ~ expDt）
- 支持星期过滤（dow）

### UI 组件

| 组件 | 文件 | 功能 |
|------|------|------|
| Filter Bar | `composition-load-view.tsx` | 7 个过滤条件，Reset 按钮 |
| Data Table | `composition-load-view.tsx` | 22 列数据展示，Edit/Del 操作 |
| CRUD Dialog | `composition-load-dialog.tsx` | 新增/编辑规则对话框 |

### 数据流

```
CompositionLoadView → useCompositionLoadStore → compositionApi → /api/composition/load
```

## Composition（配比方案管理）

### 功能

管理 `composition` 和 `composition_rank` 表数据：

- 左侧树形面板展示配比方案列表，按 Division 分组
- 右侧详情面板展示选中方案的属性和 Rank×Option 矩阵
- 矩阵支持动态添加/删除 Rank 列和 Option 行
- 单元格支持内联编辑，点击即编辑，Enter 保存

### UI 组件

| 组件 | 文件 | 功能 |
|------|------|------|
| Tree Panel | `composition-tree.tsx` | 搜索、Add 按钮、Division 分组、SBY 标签 |
| Detail Panel | `composition-detail.tsx` | 属性展示、Edit/Delete、嵌入矩阵 |
| Rank×Option Matrix | `rank-option-matrix.tsx` | 动态网格、内联编辑、Add/Delete Rank/Option |
| Create Dialog | `composition-create-dialog.tsx` | 新建配比方案对话框 |

### 数据流

```
CompositionView → useCompositionStore → compositionApi → /api/composition
                                                    → /api/composition/rank
```

## Rank×Option 矩阵

### 设计

- **列（Columns）**：Rank 代码（CA, FO, FA 等）
- **行（Rows）**：Option 编号（1, 2, 3...）
- **单元格**：planValue（该职级在该选项下的配比人数）

### 交互

| 操作 | 效果 |
|------|------|
| 点击单元格 | 进入编辑模式，显示数字输入框 |
| Enter / Blur | 提交修改，调用 API 创建/更新/删除 rank 行 |
| Escape | 取消编辑 |
| Add Rank | 弹出输入框，新增 Rank 列（UI-only，无 API 调用） |
| Add Option | 新增 Option 行（UI-only） |
| Delete Rank | 确认后删除该 Rank 所有 rank 行（API 调用） |
| Delete Option | 确认后删除该 Option 所有 rank 行（API 调用） |

### 数据约定

- 空单元格（虚线框）表示数据库中无对应 `composition_rank` 行
- 有值的单元格一定有对应的数据库行
- 清空单元格（输入空值）会删除数据库行

## 类型定义

```typescript
// gantt/src/types/composition.ts

interface Composition {
  id: number
  filiale: string | null
  division: string
  name: string
  nameDesc: string | null
  displayOrder: number
  hierarchy: number | null  // 1=Standard, 2=Enhanced
  // audit fields...
}

interface CompositionRank {
  id: number
  compId: number
  rank: string           // 职级代码
  planValue: number      // 配比人数
  planValueExtra: number // 额外人数
  options: number        // Option 编号（1-based）
}

interface CompositionLoad {
  id: number
  filiale: string
  division: string
  sequence: number       // 优先级
  fleet: string | null
  fltNum: string | null
  // 20+ other matching fields...
  compId: number | null  // 关联的配比方案
}
```

## API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/composition` | GET | 列出所有配比方案 |
| `/api/composition` | POST | 创建配比方案 |
| `/api/composition/:id` | PUT | 更新配比方案 |
| `/api/composition/:id` | DELETE | 删除配比方案 |
| `/api/composition/load` | GET | 列出所有配比规则 |
| `/api/composition/load` | POST | 创建配比规则 |
| `/api/composition/load/:id` | PUT | 更新配比规则 |
| `/api/composition/load/:id` | DELETE | 删除配比规则 |
| `/api/composition/rank/comp/:compId` | GET | 获取方案的 rank 数据 |
| `/api/composition/rank` | POST | 创建 rank 行 |
| `/api/composition/rank/:id` | PUT | 更新 rank 行（仅 planValue） |
| `/api/composition/rank/:id` | DELETE | 删除 rank 行 |

## 文件清单

```
gantt/src/
├── types/composition.ts
├── services/composition-api.ts
├── stores/
│   ├── composition-store.ts
│   └── composition-load-store.ts
├── stores/shell-store.ts        (添加 ActiveRuleItem)
├── components/shell/shell-sidebar.tsx  (添加 Rule 导航)
├── components/rule/
│   ├── rule-view.tsx            (添加视图切换)
│   └── rule-manager-view.tsx    (提取原有 RuleView)
└── components/composition/
    ├── composition-view.tsx
    ├── composition-tree.tsx
    ├── composition-detail.tsx
    ├── composition-load-view.tsx
    ├── composition-load-dialog.tsx
    ├── composition-create-dialog.tsx
    └── rank-option-matrix.tsx
```

## 实现日期

- 设计：2026-05-08
- 实现：2026-05-10
- 状态：已完成