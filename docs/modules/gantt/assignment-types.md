# 任务类型体系（Assignment Group + Assignment）

## 两层结构

| 层级 | 存储 | 说明 |
|------|------|------|
| **assignment_group** | `assignment_group` 表 | 高层分类（FLT/DHD/TRN/SBY/LVE/GND/ADM） |
| **assignment** | `assignment` 表 | 细分代码（FLT/DH/PAX/SBY/TRN/SIM/DO/AL/SL...） |

法规检查用 `assignment_group` 判断大类（FLT/DHD 需要检查）。
颜色显示用 `assignment_group` 的 `color` 字段（数据库驱动）。

## assignment_group 定义

| 代码 | 名称 | 颜色 | 法规检查 | 说明 |
|------|------|------|---------|------|
| FLT | Flight Duties | #3b82f6 蓝 | ✅ 需要 | 飞行任务 |
| DHD | Deadhead | #60a5fa 浅蓝 | ✅ 需要 | 调机/定位 |
| GND | Ground Duties | #a855f7 紫 | ❌ | 地面值勤 |
| TRN | Training | #22c55e 绿 | ❌ | 训练 |
| SBY | Standby | #f97316 橙 | ❌ | 待命 |
| LVE | Leave | #9ca3af 灰 | ❌ | 假期 |
| ADM | Administration | #ec4899 粉 | ❌ | 行政 |

## assignment 代码映射

| assignment_group | assignment 代码 | 说明 |
|-----------------|----------------|------|
| FLT | FLT（飞行）, IOE（航线运行检查） | |
| DHD | DH（调机）, PAX（定位乘客） | |
| GND | OFC（办公）, BRF（简报） | |
| TRN | TRN（训练）, SIM（模拟机）, CRE（复训） | |
| SBY | SBY（待命）, ASBY（机场待命） | |
| LVE | DO（休息日）, AL（年假）, SL（病假）, ML（产假）, CL（事假）, PH（公假） | |
| ADM | MTG（会议）, MED（体检） | |

## 参数化原则

- **禁止**在代码中硬编码 assignment_group 值
- 颜色从 `assignment_group.color` 字段读取（`useAssignmentStore.getColor()`）
- 法规检查过滤通过 `useAssignmentStore.isFlightGroup()` 判断
- 前端下拉选项从 `GET /assignment/group` API 动态加载
- 新航司上线只需修改 seed 数据，零代码改动

## 数据流

```
数据库 assignment_group 表（含 color 字段）
  ↓
GET /assignment/group API
  ↓
Gantt assignment-store（缓存 colorMap）
  ↓
├─ roster-renderer: getTaskBaseColor() → 任务块颜色
├─ roster-to-check-input: isFlightGroup() → 法规检查过滤
├─ add-task-dialog: getGroups() → 下拉选项
└─ summary-store: getColor() → 汇总条颜色
```

## 关键文件

| 文件 | 职责 |
|------|------|
| `sql/seed/03-assignment.sql` | 数据库 seed（assignment_group + assignment + mapping） |
| `sql/migration/001-assignment-group-color.sql` | 迁移脚本（加 color 字段 + 短代码） |
| `live-server/src/models/base/assignment.ts` | ORM 模型（含 color 字段） |
| `gantt/src/stores/assignment-store.ts` | 前端 store（API 加载 + colorMap） |
| `gantt/src/components/gantt/renderers/roster-renderer.ts` | 颜色渲染 |
| `gantt/src/utils/roster-to-check-input.ts` | 法规检查过滤 |
