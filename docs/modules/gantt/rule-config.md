# Rule Config Page — 法规配置页面

> Two-panel master-detail UI for managing rule sets and per-set overrides

---

## 功能概述

Rule Config Page 提供法规集合（Rule Group）的管理界面，支持：

- 创建/编辑/删除法规集合
- 复制法规集合（Duplicate）
- 配置集合内法规的启用状态、参数覆盖、严重级别覆盖
- 自定义违规消息模板
- 拖拽排序法规执行顺序

---

## 页面布局

```
┌─────────────────────────────────────────────────────────────────┐
│  Top Nav  [Dashboard] [Live] [Scenario] [Rule ●] [Data] [System]│
├─────────────────────────────────────────────────────────────────┤
├──────────────┬──────────────────────────────────────────────────┤
│  Left Panel  │  Right Panel                                     │
│  264px fixed │  flex-1, min-width 0                             │
│              │                                                  │
│  [Rule Sets] │  [Group Header]                                  │
│  + New Set   │  [Rules Toolbar — search, filters, + Add Rules]  │
│              │  [Rules Table — draggable rows, scrollable]      │
│  ▸ CCAR Full │                                                  │
│    CCAR Lite │                                                  │
│    Training  │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

---

## 左侧面板 — 法规集合列表

### RuleGroupCard

每张卡片显示：
- 集合名称（active 时主色高亮）
- Default badge（绿色，仅默认集合显示）
- Usage badge（GANTT/PO/RO/PBS/ALL，不同颜色）
- Division badge（Pilot/Cabin）
- 规则数量

### NewGroupDialog

创建新法规集合的模态框：

| 字段 | 类型 | 说明 |
|------|------|------|
| Name | text (required) | 集合名称 |
| Code | text (auto-gen) | 集合编码，从名称自动生成 |
| Usage | select | GANTT / PO / RO / PBS / ALL |
| Division | select | Pilot (P) / Cabin (C) |
| Description | textarea | 可选描述 |
| Set as Default | checkbox | 是否设为默认集合 |

---

## 右侧面板 — 集合详情

### RuleGroupHeader

显示选中集合的详情：

- 集合名称（大字体） + group_code（monospace）
- Usage + Division badges
- 统计行：总规则数、启用数、有覆盖的规则数、filiale
- 操作按钮：Edit、Duplicate、Set as Default、Delete
- 描述文本

### 操作按钮说明

| 按钮 | 功能 | 条件 |
|------|------|------|
| **Edit** | 打开编辑对话框，修改名称/描述 | 始终可用（不含 Default） |
| **Duplicate** | 复制当前集合，生成新 Code 和 Name | 始终可用 |
| **Set as Default** | 设为该 Usage+Division 的默认集合 | 仅非默认集合显示 |
| **Delete** | 删除集合 | 仅非默认集合可用（默认集合禁用） |

### EditGroupDialog

编辑现有集合的模态框（**不支持修改 Default 状态**）：

| 字段 | 说明 |
|------|------|
| Code | 显示但不可修改 |
| Name | 可修改 |
| Description | 可修改 |
| Usage/Division/Filiale/Rules/Default | 只读信息展示 |

**Default 状态管理**：
- 通过 "Set as Default" 按钮设置（非默认集合显示）
- 设置新 Default 只影响**同 usage + 同 division** 的其他集合
- 例如：设置 GANTT+Pilot 的 Default 不会影响 PBS+Pilot 或 PO+Cabin

**删除流程**：
1. 点击 "Set as Default" 按钮取消 Default（或设置其他集合为 Default）
2. 当前集合变为非 Default 后，Delete 按钮可用
3. 点击 Delete 删除

### Rules Toolbar

- 搜索框：按名称或 instance_code 过滤
- "Enabled only" 筛选芯片：只显示启用的规则
- "Overrides only" 筛选芯片：只显示有覆盖的规则
- "+ Add Rules" 按钮：打开 AddRulesDialog
- 规则计数：`12 rules · 10 enabled`

### Rules Table

可拖拽排序的表格，列：

| 列 | 内容 |
|----|------|
| ⠿ | 拖拽手柄（CALC 行和筛选时不显示） |
| Rule | 名称 + instance_code + CCAR 引用 |
| Category | 分类 badge（FDP/REST/FLIGHT_TIME 等） |
| Severity | 严重级别 badge（ERROR/WARNING/INFO） |
| Overrides | 覆盖指示器（params/msg/sev badge 或 "+ Add override"） |
| Enabled | 开关切换（立即保存） |
| Actions | Edit 按钮（展开 OverrideEditor） |

**CALC 行特殊处理**：
- opacity 0.6（视觉弱化）
- 不可拖拽排序（always 在依赖的 checker 前执行）
- 无覆盖编辑

---

## Inline OverrideEditor

点击 Edit 后展开的行内编辑面板：

### 1. Param Override

- 根据 `param_schema` 动态渲染字段
- 数字类型 → `<input type="number">`
- 枚举类型 → `<select>`
- 修改的字段高亮（border-primary + bg-primary-bg）
- 留空 = 使用实例默认值
- Severity Override 下拉：ERROR / WARNING / INFO / 空（实例默认）

### 2. Alert Message Template

- 文本输入（monospace 字体）
- 语法：`{variable}` 占位符
- Variable Picker："{ }" 按钮，点击插入变量
- Preview：实时预览（替换变量为示例值）

### 3. 操作

- Save：保存覆盖
- Cancel：取消编辑
- Reset all overrides：清除所有覆盖

---

## 数据模型变更

### rule_group_item 新增列

```sql
ALTER TABLE rule_group_item
  ADD COLUMN message_template text;

COMMENT ON COLUMN rule_group_item.message_template
  IS '自定义违规消息模板，null=使用checker内置消息';
```

### rule_template 新增列

```sql
ALTER TABLE rule_template
  ADD COLUMN template_vars jsonb NOT NULL DEFAULT '[]';

COMMENT ON COLUMN rule_template.template_vars
  IS '模板变量JSON数组，定义{name, label, example}用于UI变量选择器';
```

### template_vars 结构

```json
[
  { "name": "fdp_minutes",  "label": "FDP duration (min)",    "example": 745 },
  { "name": "limit_minutes","label": "FDP limit (min)",        "example": 780 },
  { "name": "duty_seq",     "label": "Duty sequence number",   "example": 1 },
  { "name": "crew_code",    "label": "Crew member code",       "example": "CA001" }
]
```

---

## API 端点

### live-server `/api/rule/`

| Method | Path | 说明 |
|--------|------|------|
| GET | `/groups` | 获取所有法规集合 |
| POST | `/groups` | 创建新集合 |
| PATCH | `/groups/:groupCode` | 更新集合（name/description/isDefault） |
| DELETE | `/groups/:groupCode` | 删除集合（默认集合返回 409） |
| POST | `/groups/:groupCode/duplicate` | 复制集合及其所有规则项 |
| GET | `/groups/:groupCode/items` | 获取集合内规则项 |
| POST | `/groups/:groupCode/items` | 添加规则到集合 |
| PATCH | `/groups/:groupCode/items/:instanceCode` | 更新规则项覆盖 |
| DELETE | `/groups/:groupCode/items/:instanceCode` | 移除规则项 |
| PATCH | `/groups/:groupCode/items/reorder` | 重新排序 |
| GET | `/instances` | 获取可添加的规则实例 |

### Duplicate API

```typescript
// POST /api/rule/groups/:groupCode/duplicate
// Request
{
  newGroupCode: string,  // 新集合编码（必须唯一）
  newName: string        // 新集合名称
}

// Response
{
  code: 200,
  data: {
    id: number,
    groupCode: string,
    name: string,
    description: string | null,
    usage: string,
    filiale: string,
    division: string,
    isDefault: false,    // 复制的集合始终非默认
    itemCount: number    // 复制的规则数量
  }
}
```

### rule-engine `/admin/cache/invalidate`

POST 端点，用于刷新法规引擎内存缓存：

```typescript
// Request
{ groupCode?: string }  // 空则刷新全部

// Response
{ invalidated: string | 'all' }
```

---

## 前端组件清单

```
gantt/src/components/rule/
├── rule-view.tsx                # 顶层模块视图
├── rule-group-list.tsx          # 左侧集合列表
├── rule-group-card.tsx          # 集合卡片
├── new-group-dialog.tsx         # 创建集合弹窗
├── edit-group-dialog.tsx        # 编辑集合弹窗
├── rule-group-header.tsx        # 集合详情头部（含 Edit/Duplicate/Delete）
├── rule-group-rules.tsx         # 规则表格容器
├── rule-group-row.tsx           # 可排序表格行
├── override-editor.tsx          # 行内覆盖编辑器
├── template-var-picker.tsx      # 变量选择 Popover
└── add-rules-dialog.tsx         # 添加规则弹窗
```

---

## Default 状态管理规则

### 核心原则

每个 **Usage + Division** 组合只能有一个默认集合：

| Usage | Division | Default 领域 |
|-------|----------|-------------|
| GANTT | Pilot (P) | 独立 Default |
| GANTT | Cabin (C) | 独立 Default |
| PBS | Pilot (P) | 独立 Default |
| PO | Cabin (C) | 独立 Default |
| ... | ... | ... |

**示例**：设置 `GANTT + Pilot` 的 Default **不会影响** `PBS + Pilot` 或 `PO + Cabin`

### 操作流程

| 操作 | 流程 |
|------|------|
| **创建 Default** | NewGroupDialog勾选 → 只取消同组合的其他 Default |
| **设置 Default** | "Set as Default" 按钮 → 只取消同组合的其他 Default |
| **取消 Default** | 设置其他集合为 Default → 当前自动变为非 Default |
| **删除集合** | 必先取消 Default → Delete 按钮可用 |

| 规则 | 说明 |
|------|------|
| 默认集合不能删除 | Delete 按钮禁用 |
| 设置新默认只取消同组合的旧默认 | 后端自动处理 |
| Edit 对话框不含 Default 选项 | 通过 "Set as Default" 按钮操作 |

---

## 消息模板插值

### 规则引擎实现

```typescript
// BaseChecker.ts
export const interpolate = (
  template: string | null | undefined,
  vars: Record<string, string | number>,
  fallback: string,
): string => {
  if (!template) return fallback
  return template.replace(/{(\w+)}/g, (_, key) => String(vars[key] ?? ''))
}
```

### Checker 调用示例

```typescript
// FdpChecker.ts
ctx.addCheckResult(
  this.fail(
    rule, fdpMinutes, limitMinutes, 'minutes',
    `Duty ${dutySeq}: FDP ${fdpMinutes}min exceeds ${limitMinutes}min`,
    { duty_seq: dutySeq, fdp_minutes: fdpMinutes, limit_minutes: limitMinutes },
  ),
)
```

---

## 常见问题排查

### Rule 列表显示空

| 现象 | 可能原因 | 解决方案 |
|------|----------|----------|
| Groups 列表空 | filiale 大小写不匹配 | 确保数据库值大写 + CHECK 约束 |
| Items 列表空 | message_template 列缺失 | 执行 migration 添加列 |
| 401 错误 | Token 无效或未登录 | 刷新页面重新登录 |

### Duplicate 按钮无效

| 现象 | 原因 | 解决方案 |
|------|------|----------|
| 点击无反应 | 缺少 onClick（已修复） | 刷新页面 |
| Code 已存在 | 新 Code 重复 | 输入唯一 Code |

### Delete 按钮禁用

| 现象 | 原因 | 解决方案 |
|------|------|----------|
| 按钮 grey | 集合是 Default | 设置其他集合为 Default |

### Default 状态异常

| 现象 | 原因 | 解决方案 |
|------|------|----------|
| 多个同组合 Default | 后端旧逻辑未按 usage 过滤（已修复） | 刷新列表 |
| PBS Default 被 GANTT 取消 | 同上（已修复） | 刷新列表 |

---

## 相关文档

- [法规检查集成](./rule-check.md)
- [法规数据模型](../04-rule-engine/rule-data-model-redesign.md)
- [法规条目目录](../04-rule-engine/rule-catalog.md)
- [数据库设计规范](../01-architecture/database-design.md)
- [部署实施指南](../deployment-guide.md)