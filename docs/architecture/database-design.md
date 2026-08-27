# 数据库设计规范

> ROIS-AI PostgreSQL 数据库设计约定

---

## Schema 与航司隔离

系统采用 PostgreSQL Schema 隔离多航司数据：

| Schema 名 | 航司 | 说明 |
|----------|------|------|
| `f8` | F8 航司 | 飞行员 + 乘务员数据 |
| `tg` | TG 航司 | 飞行员 + 乘务员数据 |
| `ca` | CA 航司 | （待初始化） |

每个航司 Schema 包含完整的业务表集合，通过 `search_path` 切换。

---

## filiale 字段规范

### 问题背景

2026-05-06 发现 Rule 界面无法显示数据库数据，根因分析：

```
数据库 rule_group.filiale = 'f8' (小写)
后端查询 WHERE filiale = 'F8' (schema.toUpperCase())
结果：0 条匹配 → 界面显示空
```

### 解决方案

**数据库级约束**：所有含 `filiale` 字段的表添加 CHECK 约束，强制大写。

```sql
-- 每个航司 schema 初始化时自动执行
ALTER TABLE <table_name> 
ADD CONSTRAINT chk_<table_name>_filiale_upper 
CHECK (filiale = UPPER(filiale));
```

### 设计原则

| 原则 | 说明 |
|------|------|
| **不设置 DEFAULT** | 不同航司默认值不同，表定义不应有航司特定的默认值 |
| **CHECK 约束强制大写** | 所有航司通用，小写值被拒绝 |
| **Seed 脚本显式提供值** | 不依赖 DEFAULT，脚本中写 `filiale = 'F8'` |
| **后端使用 toUpperCase()** | 查询时 schema.toUpperCase() 保证匹配 |

---

## Migration 执行检查清单

新航司初始化或现有航司更新时，必须确认以下 Migration 已执行：

### 1. filiale 大写约束

| 文件 | 说明 | 状态 |
|------|------|------|
| `sql/migration/2026-05-06-filiale-uppercase-default.sql` | 所有表的 CHECK 约束 | f8 已执行 |

**验证**：
```sql
SELECT conname, conrelid::regclass
FROM pg_constraint
WHERE conname LIKE 'chk_%_filiale_upper';
```

### 2. rule_group_item 扩展列

| 文件 | 说明 | 状态 |
|------|------|------|
| `sql/migration/2026-05-06-rule-group-item-message-template.sql` | message_template + template_vars | f8 已执行 |

**验证**：
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'rule_group_item' AND column_name = 'message_template';
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'rule_template' AND column_name = 'template_vars';
```

---

## 已修复的问题

### 2026-05-06: filiale 大小写不匹配

**问题**：Rule 界面无法显示数据库数据

**根因**：
- 数据库 `rule_group.filiale = 'f8'` (小写)
- 后端查询 `WHERE filiale = 'F8'` (toUpperCase())
- 结果：0 条匹配

**修复**：
1. 更新数据库现有数据为大写
2. 添加 CHECK 约束强制大写
3. 后端保持 `toUpperCase()` 查询

### 2026-05-06: Default 状态跨 Usage 影响

**问题**：创建 GANTT Default 会把 PBS/PO/RO 的 Default 也取消

**根因**：后端取消 Default 时未按 `usage` 过滤

**修复**：
```sql
-- 修复前
WHERE filiale = ? AND division = ?

-- 修复后  
WHERE filiale = ? AND division = ? AND usage = ?
```

**影响**：每个 `Usage + Division` 组合独立管理 Default

---

## 受影响的表

f8 schema 中含 `filiale` 字段的表（共 29 张）：

| 类别 | 表名 |
|------|------|
| 基础数据 | `aircraft`, `attribute`, `base`, `route`, `team` |
| 机组数据 | `crew`, `crew_entitlement`, `qualification`, `cqf`, `rank_acting` |
| 航班数据 | `pairing`, `composition`, `composition_load` |
| 法规数据 | `rule`, `rule_instance`, `rule_group` |
| 配置数据 | `live_config`, `profile`, `workset`, `user_department`, `department` |
| 其他 | `language`, `holiday`, `hotel`, `port_qual_reqmnt`, `tag_definition`, `tag_opt_filter`, `tag_category` |

> `filiale` 表本身是航司定义表，不添加约束。

### 验证方法

```sql
-- 查看所有约束
SELECT conname, conrelid::regclass AS table
FROM pg_constraint
WHERE conname LIKE 'chk_%_filiale_upper' 
  AND connamespace = 'f8'::regnamespace;

-- 测试约束（应报错）
INSERT INTO rule_group (group_code, name, usage, filiale, division, is_default, created_by, updated_by)
VALUES ('test', 'Test', 'GANTT', 'f8', 'P', false, 'system', 'system');
-- ERROR: violates check constraint

-- 正确写法
INSERT INTO rule_group (group_code, name, usage, filiale, division, is_default, created_by, updated_by)
VALUES ('test', 'Test', 'GANTT', 'F8', 'P', false, 'system', 'system');
```

---

## 航司初始化流程

使用 `sql/init-airline.sh <航司二字码>` 脚本：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 创建 Schema | `CREATE SCHEMA <code>` |
| 2 | 建表 | 执行 `sql/schema/*.sql` |
| 3 | Seed 数据 | 执行 `sql/seed/*.sql`，显式提供大写 filiale |
| 4 | filiale 约束 | 添加 CHECK 约束到所有含 filiale 字段的表 |

脚本自动转换航司代码为大写（如输入 `ca` → 转换为 `'CA'`）。

---

## 命名规范

### 所有数据库对象统一小写

- Schema 名：小写（`f8`, `tg`, `ca`）
- 表名：小写 + 下划线（`rule_group`, `crew_rank`）
- 字段名：小写 + 下划线（`filiale`, `group_code`）
- 索引名：小写 + 下划线（`uq_rule_group_code`）
- 约束名：小写 + 下划线（`chk_rule_group_filiale_upper`）

**例外**：`filiale` 字段**值**必须大写（如 `'F8'`），这是业务约定，不是命名规范。

---

## 审计字段

每张表必须有审计字段：

```sql
created_by   varchar(30)  not null default 'system',
created_at   timestamptz  not null default now(),
updated_by   varchar(30)  not null default 'system',
updated_at   timestamptz  not null default now(),
```

---

## 删除标记

`is_deleted` 字段：**取消状态标记**，不是软删除。

| 值 | 含义 |
|----|------|
| 0 | 正常 |
| 1 | 已取消 |

DELETE 操作执行**真实物理删除**，不是设置 is_deleted = 1。

---

## 相关文档

- [部署实施指南](../deployment/deployment-guide.md) — 航司初始化步骤
- [法规数据模型](../modules/rule-engine/rule-data-model-redesign.md) — rule 表结构设计
- [Migration 脚本](../../sql/migration/2026-05-06-filiale-uppercase-default.sql) — filiale 约束执行脚本
