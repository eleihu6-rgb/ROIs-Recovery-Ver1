# 数据库外键约束实施设计

**日期**：2026-04-19
**模块**：sql / live-server
**状态**：待实施

---

## 背景与目标

系统现有 schema 只有主键（`bigint GENERATED ALWAYS AS IDENTITY`），所有 `_id` 关联字段均为普通 `bigint`，无任何外键约束。这导致：

- AI 生成代码或手动脚本可能写入不存在的 ID，DB 不会拦截
- 删除父记录时子记录可能变成孤儿数据
- 缺少 DB 层最后的安全兜底

目标：在关键业务表之间建立外键约束，让数据库成为数据一致性的最后防线，同时不引入额外的应用层查询开销（FK 检查在 DB 内部完成，无网络往返）。

---

## 核心设计决策

### 为什么选 ON DELETE RESTRICT

`RESTRICT` 精确对应业务规则：

- 有 `pairing_segment` 时不能删 `pairing` → RESTRICT
- 有 `roster_flight` 关联时不能删 `pairing` → 应用层提前检查后给用户友好提示，DB 的 RESTRICT 作为最后兜底
- 不使用 `CASCADE`：级联删除的范围难以预判，业务规则比 DB 能表达的更复杂

### 哨兵值 0 → NULL

原 schema 中用 `DEFAULT 0` 表示"无对应关系"（如地面任务 `pairing_id=0`），FK 无法兼容非零哨兵值。

解决方案：改为 `NULL` 表示"无对应关系"。PostgreSQL FK 对 NULL 值免检——`NULL` 的列不要求父表存在对应行，正好符合"地面任务不属于任何 pairing"的语义。

涉及字段：
- `roster_flight.pairing_id`：0 → NULL（地面任务）
- `roster_publish.pairing_id`：0 → NULL（地面任务）
- `pairing_segment.flt_id`：0 → NULL（地面任务段）

### 不加 FK 的字段

| 字段 | 原因 |
|------|------|
| `roster_publish.duty_id` | 无独立 duty 表（duty 数据内嵌 pairing_segment），无父表可引用 |
| `flight.sch_id` | 无对应计划排班表 |
| `roster_publish_adjust.*_id` | 历史审计记录，允许引用已删除的记录 |

---

## 实施步骤

### Step 1 — 清空业务数据

在加约束前清空所有业务数据（主数据如 crew、aircraft、airport 保留不动）：

```sql
TRUNCATE TABLE
  roster_flight,
  roster_publish,
  pairing_segment,
  pairing_composition,
  pairing,
  flight_composition,
  flight;
```

> 理由：现有数据含历史哨兵值 0，TRUNCATE 后直接以新规则录入，无需处理历史脏数据。

### Step 2 — 修改字段定义

```sql
-- roster_flight.pairing_id：地面任务用 NULL 表示
ALTER TABLE roster_flight
  ALTER COLUMN pairing_id DROP NOT NULL,
  ALTER COLUMN pairing_id DROP DEFAULT;

-- roster_publish.pairing_id：同上
ALTER TABLE roster_publish
  ALTER COLUMN pairing_id DROP NOT NULL,
  ALTER COLUMN pairing_id DROP DEFAULT;

-- pairing_segment.flt_id：地面任务段用 NULL 表示
ALTER TABLE pairing_segment
  ALTER COLUMN flt_id DROP NOT NULL;
```

### Step 3 — 添加外键约束

```sql
-- ── pairing 内部结构 ────────────────────────────────────────────
ALTER TABLE pairing_segment
  ADD CONSTRAINT fk_ps_pairing
  FOREIGN KEY (pairing_id) REFERENCES pairing(id) ON DELETE RESTRICT;

ALTER TABLE pairing_composition
  ADD CONSTRAINT fk_pc_pairing
  FOREIGN KEY (pairing_id) REFERENCES pairing(id) ON DELETE RESTRICT;

-- ── 航班结构 ────────────────────────────────────────────────────
ALTER TABLE flight_composition
  ADD CONSTRAINT fk_fc_flight
  FOREIGN KEY (flt_id) REFERENCES flight(id) ON DELETE RESTRICT;

ALTER TABLE pairing_segment
  ADD CONSTRAINT fk_ps_flight
  FOREIGN KEY (flt_id) REFERENCES flight(id) ON DELETE RESTRICT;

-- ── 排班关联 ────────────────────────────────────────────────────
ALTER TABLE roster_flight
  ADD CONSTRAINT fk_rf_crew
  FOREIGN KEY (crew_id) REFERENCES crew(crew_id) ON DELETE RESTRICT;

ALTER TABLE roster_flight
  ADD CONSTRAINT fk_rf_pairing
  FOREIGN KEY (pairing_id) REFERENCES pairing(id) ON DELETE RESTRICT;

-- ── 模板结构 ────────────────────────────────────────────────────
ALTER TABLE pairing_template_detail
  ADD CONSTRAINT fk_ptd_template
  FOREIGN KEY (template_id) REFERENCES pairing_template(id) ON DELETE RESTRICT;
```

---

## 应用层同步改动

### 判断地面任务的代码

所有判断"是否地面任务/地面航段"的地方必须同步修改：

| 场景 | 改前 | 改后 |
|------|------|------|
| 判断地面任务 | `pairingId === 0` | `pairingId === null` |
| 判断地面航段 | `fltId === 0` | `fltId === null` |
| 插入地面任务 | `pairing_id = 0` | `pairing_id = NULL` |
| SQL 查询地面任务 | `WHERE pairing_id = 0` | `WHERE pairing_id IS NULL` |

### 删除操作的业务校验

FK RESTRICT 会在删除父记录时抛 DB 错误。应用层应在删除前先检查并返回用户友好提示：

| 删除操作 | 应用层预检查 | 提示文案 |
|---------|------------|---------|
| 删除 pairing | 查 `roster_flight WHERE pairing_id = ?` | "该环已有机组排班，无法删除" |
| 删除 pairing | 查 `pairing_segment WHERE pairing_id = ?` | "该环内有航班段，请先清空环内容" |
| 删除 flight | 查 `flight_composition WHERE flt_id = ?` | "该航班已有编组配置，无法删除" |
| 删除 flight | 查 `pairing_segment WHERE flt_id = ?` | "该航班已组入任务环，无法删除" |

> 预检查是为了给用户友好提示；FK 约束是最后兜底，防止代码绕过预检查直接写 DB。

### Drizzle schema 同步

`live-server` 和 `pbs-server` 的 Drizzle schema 文件需同步更新：

- `pairing_id` 字段类型从 `bigint().notNull().default(0)` 改为 `bigint()`（可空）
- `flt_id` 字段类型从 `bigint().notNull()` 改为 `bigint()`（可空）
- 添加对应的 `.references()` 关系声明

---

## 约束覆盖范围总览

| 表 | 约束字段 | 父表 | 类型 |
|----|---------|------|------|
| `pairing_segment` | `pairing_id` | `pairing` | RESTRICT，NOT NULL |
| `pairing_segment` | `flt_id` | `flight` | RESTRICT，可空（地面任务段） |
| `pairing_composition` | `pairing_id` | `pairing` | RESTRICT，NOT NULL |
| `flight_composition` | `flt_id` | `flight` | RESTRICT，NOT NULL |
| `roster_flight` | `crew_id` | `crew(crew_id)` | RESTRICT，NOT NULL |
| `roster_flight` | `pairing_id` | `pairing` | RESTRICT，可空（地面任务） |
| `roster_publish` | `pairing_id` | `pairing` | 无 FK 弱引用，可空（地面任务），允许发布快照保留已清理 pairing id |
| `pairing_template_detail` | `template_id` | `pairing_template` | RESTRICT，NOT NULL |

---

## 迁移脚本文件位置

实施脚本放在：

```
sql/migration/
  YYYY-MM-DD-add-fk-constraints.sql
```

脚本包含 Step 1（TRUNCATE）、Step 2（ALTER COLUMN）、Step 3（ADD CONSTRAINT）三个阶段，在同一事务中执行，失败自动回滚。
