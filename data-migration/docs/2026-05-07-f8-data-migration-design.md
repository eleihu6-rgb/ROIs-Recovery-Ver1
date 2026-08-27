# F8 数据迁移工具设计文档

**版本**：V1.0  
**日期**：2026-05-07  
**目录**：`data-migration/`

---

## 一、背景与目标

从 F8 航空第三方接口拉取 Crew、Flight、Pairing、RosterFlight 数据，直接转换写入老系统 MySQL 数据库，替代原有手工 SQL 导入流程。

**目标**：
- 支持手动按日期范围触发 Flight / Pairing / RosterFlight 同步
- 支持 Crew 全量拉取，并由定时任务每日自动执行
- 所有接口均可通过开关随时启停定时任务
- 每次 API 调用原始 JSON 独立存档，方便问题排查
- 数据校验友好提示，跳过异常记录并汇总告警

---

## 二、全局数据原则

**ID 管理**：F8 JSON 中所有 id 字段（`crewId`、`pairingId`、`rosterFlightId`、`fltId` 等）均为外部系统 ID，一律存入对应表的 `interface_id` / `interface_flt_id` 字段，用于后续增量同步时的匹配去重。我们自身表的主键 `id` 统一通过 `nextval()` 生成，与 F8 ID 完全解耦。

表间关联一律通过我方内部 `id` 建立（如 `roster_flight.roster_id` 指向 `roster.id`），查找已导入记录时通过 `interface_id` 定位后取内部 `id` 使用。

---

## 三、技术栈


| 组件 | 选型 |
|------|------|
| 语言 | Python 3.12+ |
| HTTP 框架 | FastAPI |
| 定时任务 | APScheduler |
| MySQL 客户端 | PyMySQL |
| 数据校验 | Pydantic v2 |
| 配置管理 | pydantic-settings（读取 `.env`） |
| HTTP 客户端 | httpx（支持超时/重试） |

---

## 四、项目结构

```
data-migration/
├── .env                            # 环境变量（不提交 git）
├── .env.example                    # 配置模板
├── AGENTS.md                       # 本模块 AI 速览（含 Flight/Navblue 补跑要点）
├── .scheduler_state.json           # 定时任务开关持久化状态
├── requirements.txt
├── main.py                         # FastAPI app + APScheduler 启动入口
├── config.py                       # 环境变量读取（pydantic-settings）
├── scheduler.py                    # APScheduler 初始化 + 开关管理
│
├── f8/
│   ├── client.py                   # Token 管理 + HTTP 请求（重试/刷新）
│   ├── crew.py                     # Crew 全量拉取 + 转换 + 写库
│   ├── flight.py                   # Flight 拉取 + 转换 + 写库
│   ├── pairing.py                  # Pairing 拉取 + 转换 + 写库
│   └── roster_flight.py            # RosterFlight 拉取 + 转换 + 写库
│
├── db/
│   └── mysql.py                    # 连接池 + nextval() 封装
│
├── routes/
│   └── sync.py                     # HTTP 触发接口
│
├── storage/
│   └── raw/                        # 原始 JSON 按批次存储
│       └── 2026-05-07/
│           ├── crew_20260507_143022/
│           │   └── full.json
│           ├── pairing_20260507_143210/
│           │   ├── 2026-03-01_2026-03-10.json
│           │   ├── 2026-03-11_2026-03-20.json
│           │   └── 2026-03-21_2026-03-25.json
│           ├── flight_20260507_150000/
│           │   └── 2026-05-07_2026-05-16.json
│           └── roster_flight_20260507_160000/
│               └── 2026-05-07_2026-05-16.json
│
└── docs/
    ├── 03-f8-pairing.sql           # 历史参考 SQL
    └── 2026-05-07-f8-data-migration-design.md  # 本文档
```

---

## 五、环境变量配置（`.env`）

```env
# F8 API
F8_AUTH_URL=https://ceje1h57tg.execute-api.ca-central-1.amazonaws.com/Dev/third/auth/getToken
F8_BASE_URL=https://87kbu8v1m6.execute-api.ca-central-1.amazonaws.com/Dev/rois/out
F8_CLIENT_ID=ROIS
F8_SIGN=f7a2c9e1b4d83f6a0e5c2b7d9f1a4e8c

# MySQL 老系统数据库
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=rois
MYSQL_PASSWORD=<password>
MYSQL_DATABASE=rois_legacy

# 同步配置
SYNC_DAYS_AHEAD=10          # 定时任务滚动天数
SYNC_CHUNK_DAYS=10          # 超长范围切分步长

# 日志
LOG_LEVEL=INFO
```

---

## 六、F8 API 客户端设计

### Token 管理

- 启动时自动获取一次 Token，存内存
- Token 过期前 30 秒触发异步刷新
- 所有业务请求携带 `AuthorizationToken: <token>` 请求头
- 收到 401/403：立即放弃当前请求 → 重新获取 Token → 重试一次

### 重试策略

| 接口 | 超时 | 重试次数 | 重试间隔 |
|------|------|---------|---------|
| Crew | 60s | 3 次 | 2s |
| Flight / Pairing / RosterFlight | 30s | 3 次 | 2s |

---

## 七、JSON 原始数据存储

**规则**：
- 每次调用 API 独立存一个批次目录，永不覆盖历史记录
- 目录命名：`{entity}_{YYYYMMDD}_{HHMMSS}/`
- Crew（全量）：目录下存 `full.json`
- 有日期范围的接口：每个 10 天分段存一个文件，文件名 `{startDt}_{endDt}.json`
- **JSON 写入在写库之前执行**，写库失败不影响原始数据留档

---

## 八、日期范围切分逻辑

适用于 Flight / Pairing / RosterFlight 的手动触发与定时任务：

```
输入: startDt, endDt
若 (endDt - startDt) <= 10天:
    直接请求，单文件存储
否则:
    按 10 天切块: [start, start+9], [start+10, start+19], ...
    最后一段不足 10 天按实际天数
    每段独立调 API、独立存 JSON
    所有段全部拉完后，统一做转换写库（整批成功或整批回滚）
```

定时任务默认范围：`today → today + SYNC_DAYS_AHEAD`（默认 10 天）。

---

## 九、数据库层

### nextval() 封装

老系统使用自定义 `sequence` 表模拟序列：

```sql
UPDATE sequence SET current_val = current_val + 1 WHERE seq_name = ?
SELECT current_val FROM sequence WHERE seq_name = ?
```

`db/mysql.py` 封装 `nextval(seq_name)` 方法，在事务内批量预取 ID（`batch_nextval(seq_name, n)`），避免每行单独请求。

### 序列名称

| 目标表 | 序列名 |
|--------|--------|
| `crew` | `CREW_SEQ` |
| `pairing` | `PAIRING_SEQ` |
| `pairing_composition` | `PAIRING_COMP_SEQ` |
| `pairing_duty` | `PAIRING_DUTY_SEQ` |
| `pairing_duty_node` | `PAIRING_DUTY_NODE_SEQ` |
| `pairing_duty_segment` | `PAIRING_SEG_SEQ` |
| `flight` | `FLT_SEQ` |
| `roster` | `ROSTER_SEQ` |
| `roster_flight` | `ROSTER_FLIGHT_SEQ` |

---

## 十、字段映射

### 9.1 Crew → 6 张表

F8 Crew API 返回根对象及五个子集合：

**`crew` 表**

| F8 字段 | `crew` 字段 | 备注 |
|---------|------------|------|
| `crewId` | `interface_id` | 外部 ID，用于关联子表 |
| `firstName` | `first_name` | |
| `middleName` | `middle_name` | |
| `lastName` | `last_name` | |
| `gender` | `gender` | |
| `telephone` | `telephone` | |
| `workEmail` | `work_email` | |
| 固定值 | `created_by = 'ZY_IMP'`, `modified_by = 'ZY_IMP'` | |

**`crew_base` 表**（来自 `bases[]`）

| F8 字段 | `crew_base` 字段 |
|---------|----------------|
| crew 主键 | `crew_id` |
| `base` | `base` |
| `effDt` | `eff_dt` |
| `expDt` | `exp_dt` |
| `isPrimary` | `is_primary` |

**`crew_rank` 表**（来自 `ranks[]`）

| F8 字段 | `crew_rank` 字段 | 备注 |
|---------|----------------|------|
| crew 主键 | `crew_id` | |
| `rank` | `rank` | CAP→CA，CP→FO 规范化 |
| `effDt` | `eff_dt` | |
| `expDt` | `exp_dt` | |

过滤规则：只保留 `expDt > now()` 的有效职级；同一人存在多个有效职级时保留最高级（CA > FO）写入主档，其余仍按行写入 `crew_rank`。

**`crew_fleet` 表**（来自 `fleets[]`）

字段按 MySQL 实际表结构映射，以 `fleets[]` 数组元素一一写入。

**`crew_certificate` 表**（来自 `certificates[]`）

| F8 字段 | `crew_certificate` 字段 | 备注 |
|---------|------------------------|------|
| crew 主键 | `crew_id` | |
| `certificate` | `certificate` | |
| `isValid` | `is_valid` | |
| `expDt` | `exp_dt` | |

过滤规则：只写入 `isValid = true` 的记录。

**`crew_qualification` 表**（来自 `qualifications[]`）

字段按 MySQL 实际表结构映射，以 `qualifications[]` 数组元素一一写入。

---

### 9.2 Flight（FLY）→ `flight`

直接使用 Flight API 数据，不再从 PairingDutySegment 反推 FLY 航班。

| F8 字段 | `flight` 字段 | 备注 |
|---------|-------------|------|
| `legNo` | `flt_num` | |
| `fltId` | `interface_flt_id` | 客户侧唯一外键：**直接使用 `fltId`**（`normalize_interface_flt_id` 规范化）；**不再**使用 `fltId_YYYYMMDD` 拼接。缺失则该航班转换失败并入 `sync_flight` 告警 |
| `datOp` | `flt_dt` | UTC 转 YVR local date（UTC-7） |
| `depStn` | `dep_arp` | |
| `arrStn` | `arv_arp` | |
| `std` | `sch_dep_dt_utc` | |
| `sta` | `sch_arv_dt_utc` | |
| `atd` | `act_dep_dt_utc` | |
| `ata` | `act_arv_dt_utc` | |
| `acGrp` | `fleet` | |
| `acReg` | `ac_reg` | |
| 固定值 | `flight_flag='A'`, `flight_assignment='FLY'` | |
| 固定值 | `filiale='F8'`, `ac_owner='F8'`, `pilot_owner='F8'`, `cabin_owner='F8'` | |
| 固定值 | `seg_type='J'`, `flt_type='S'`, `service_type='S'` | |
| 固定值 | `created_by='ZY_IMP'`, `modified_by='ZY_IMP'` | |

#### 9.2.1 Flight 拉取：Navblue HTTP 500 与补跑策略（运维 / AI 必读）

**现象**：Flight 请求经网关转发至 **Navblue**。当单次请求的 **日期跨度较大**（例如默认按 `SYNC_CHUNK_DAYS=10` 一次 POST 连续 10 个日历日）时，个别区间可能返回 **HTTP 500**（日志类似 `Navblue API returned HTTP 500` / `API_ERROR`）。

**与当前代码行为**：`f8/client.py` 在收到错误体时打 **warning** 日志，并对该次请求返回 **空列表** `[]`。`f8/flight.py` 的 `sync_flight` 会把空列表当作「本 chunk 无航班」继续执行，**不会向 `SyncResult.warnings` 写入上游失败**；因此若未看日志，容易误以为该日期段真的没有数据。

**补跑顺序（人工或脚本）**：

1. 先对失败闭区间 **拆成 5 个日历日** 一段，多次调用 `sync_flight(start, end)`。
2. 若某 5 日仍整段失败，再对该段 **按单日**（`start == end`）逐日调用 `sync_flight`。

**已验证示例**（2026-02）：`sync_flight('2026-02-10', '2026-02-19')` 整段 500；拆为 `02-10~02-14` 与 `02-15~02-19` 后前者成功、后者仍 500；对 `02-15~02-19` 再按日逐日调用后数据可写全。

**命令行**（在仓库 `data-migration/` 下、已配置 `.env`）：

```bash
python -c "from f8.flight import sync_flight; print(sync_flight('2026-02-10', '2026-02-19').to_dict())"
python -c "from f8.flight import sync_flight; print(sync_flight('2026-02-10', '2026-02-14').to_dict()); print(sync_flight('2026-02-15', '2026-02-19').to_dict())"
```

**与 `SYNC_CHUNK_DAYS` 的关系**：该环境变量只控制本工具对大日期范围的 **分片步长**，**不能**保证 Navblue 对任意 10 日窗口都稳定；大范围重载后应 **检索日志** 是否出现 `flight ... upstream error`，并对缺口按上表补跑。

**可选后续改进**（非必须）：客户端区分「HTTP 错误」与「真无数据」并写入 `SyncResult.warnings`，或在本服务内对失败 chunk 自动降级重试更小窗口。

---

### 9.3 Pairing → 5 张表

**`pairing` 表**

| F8 字段 | `pairing` 字段 | 备注 |
|---------|--------------|------|
| `pairingId` | `interface_id` | |
| `pairingDt` | `pairing_dt` | |
| `label` | `label` | |
| `base` | `base` | |
| `fleet` | `fleet` | |
| `durationDays` | `duration_days` | |
| 从 dutyList 推算 | `sch_str_dt_utc` | dutyList 第一个 duty 的开始时间 |
| 从 dutyList 推算 | `sch_end_dt_utc` | dutyList 最后一个 duty 的结束时间 |
| 从 compositions 取 | `division` | P（Pilot）或 C（Cabin） |
| 固定值 | `filiale='F8'`, `assignment_group='FLY'`, `assignment='FLY'` | |
| 固定值 | `ver=0`, `scenario_id=0`, `is_deleted=0` | |
| 固定值 | `created_by='ZY_IMP'`, `modified_by='ZY_IMP'` | |

**`pairing_composition` 表**（来自 `pairingCompositions[]`）

| F8 字段 | `pairing_composition` 字段 | 备注 |
|---------|--------------------------|------|
| 主键 | `pairing_id` | 关联 `pairing.id` |
| `actingRank` | `acting_rank` | CAP→CA，CP→FO 规范化 |
| `planValue` / `plan_value` | `plan_value` | |
| `division`（可选） | `division` | 有则写入 **P/C**；无则按职级推断（CA/FO→P，否则→C） |
| 固定值 | `is_deleted=0`, `scenario_id=0` | |

**`pairing_duty` 表**（来自 `pairingDutyList[]`，兼容 `pairingDuties` / `duties`）

导入实现同时接受 **camelCase** 与 **snake_case** 字段名（如 `creditMin` / `credit_min`，`dutyId` / `duty_id`，`actStrDtUtc` / `act_str_dt_utc`）；航站 **`endArp` / `arrArp`** 均映射到 `end_arp`。

| F8 字段 | `pairing_duty` 字段 | 备注 |
|---------|-------------------|------|
| 主键 | `pairing_id` | |
| `dutySeq` | `duty_seq` | |
| `strArp` | `str_arp` | |
| `arrArp` | `end_arp` | |
| `actStrDtUtc` | `act_str_dt_utc` | |
| `actEndDtUtc` | `act_end_dt_utc` | |
| `creditMin` | `credited_minutes` | |
| `assignment` | `assignment` | 见映射表 |
| 外部 duty_id | `comments` | 存原始 duty_id，用于关联 duty_node/segment |
| 固定值 | `is_deleted=0`, `scenario_id=0`, `is_manual_modify=0` | |

Assignment 映射：

| F8 值 | 目标值 |
|-------|--------|
| `FLIGHT` | `FLY` |
| `Reserve` | `SBY` |
| `Training` | `GRD` |
| `Transport` | `DHD` |
| 其他 | 原值 |

**`pairing_duty_node` 表**（从 duty 推算）

每个 duty 生成节点：优先使用 API 的 **`pairingDutyNodes`** 或 **`nodes`**。若仅含 **CheckIn / CheckOut**（Navblue 常见），则展开为 4 个标准节点 **PICKUP / BRIEF / DEBRIEF / DROPOFF**；若两者皆无，则用 duty 起止时间与航站合成 4 节点。

| sequence | node | 来源 |
|----------|------|------|
| 1 | `PICKUP` | CheckIn 节点 `start_utc`，无则用 `duty.act_str_dt_utc` |
| 2 | `BRIEF` | CheckIn 节点 `start_utc` ~ `end_utc`，无则用 `duty.act_str_dt_utc` |
| 3 | `DEBRIEF` | CheckOut 节点 `start_utc` ~ `end_utc`，无则用 `duty.act_end_dt_utc` |
| 4 | `DROPOFF` | CheckOut 节点 `end_utc`，无则用 `duty.act_end_dt_utc` |

**`pairing_duty_segment` 表**（来自 duty 内 **`pairingDutySegments`** 或 **`segments`**）

| F8 字段 | `pairing_duty_segment` 字段 | 备注 |
|---------|---------------------------|------|
| 主键 | `pairing_id`, `pairing_duty_id` | |
| `dutySeq` | `duty_seq` | |
| `segSeq` | `seg_seq` | |
| `fltDt` | `flt_dt` | |
| `fltId` / `flt_id` | `interface_flt_id` | FLY：与 Flight 同步相同，存 **`normalize_interface_flt_id(...)`**；非 FLY 写空串 |
| `assignment` | `assignment` | 同上映射表 |
| `airline` | `airline` | FLE→F8；含字母数字混合时取前2位 |
| `fltNum` | `flt_num` | airline=FLE 时取第3位起 |
| `depArp` / `dep_arp` | `dep_arp` | |
| `arvArp` / `arrArp` 等 | `arv_arp` | |
| `fleet` | `fleet` | 空值用 `'-'` |
| `actStrDtUtc` | `act_str_dt_utc` | |
| `actEndDtUtc` | `act_end_dt_utc` | |
| Hotel 类型 | 过滤，不写入 | |

写入 segment 后回填 `flt_id`：
- **FLY** 且 `interface_flt_id` 非空：`JOIN flight ON flight.interface_flt_id = pairing_duty_segment.interface_flt_id`；若无匹配再按 `flt_num` + `flt_dt` + 航站 fallback。
- **SBY/DHD**：本段先插入衍生 `flight` 行，再 `UPDATE` 本 segment 的 `flt_id`。

---

### 9.4 RosterFlight → `roster` / `roster_flight`

**层级关系**：
- `roster`（头） = `pairing` + `crew` —— 一条 roster 对应一名机组成员的一次 pairing 任务
- `roster_flight`（明细） = `pairing_duty_segment` + `crew` —— 一条 roster_flight 对应该 pairing 下的一个航段

**过滤规则**：`pairingId = 0` 的记录（SIM/DHD）直接跳过，不写入。

**`roster` 表**（来自 `pairing` + `crew`）

通过 RosterFlight 记录中的 `pairingId` 关联已写入的 `pairing` 表，结合 `crewId` 关联 `crew` 表，生成 roster 头记录。复用 pairing 的 `pairing_dt`、`label`、`base`、`fleet`、`sch_str_dt_utc`、`sch_end_dt_utc` 等字段，加上 crew 的 `acting_rank`（来自 `crew.actingRank`，CAP→CA 规范化）。具体字段在实现阶段对照 MySQL 表结构确认。

校验：`pairingId` 在 `pairing` 表不存在，或 `crewId` 在 `crew` 表不存在，均跳过 + 告警。

**`roster_flight` 表**（来自 `pairing_duty_segment` + `crew`）

通过 RosterFlight 记录中的 `fltId` / `depArp` / `arrArp` / `dutyStrUtc` 匹配已写入的 `pairing_duty_segment`，关联 `crew` 表，生成 roster_flight 明细记录。解析 `flt_id` 时，以 **`fltId` 与 `flight.interface_flt_id` 一致**（`normalize_interface_flt_id`）查询 `flight` 表，规则与 Flight 同步相同（**不再**使用 `fltId_YYYYMMDD` 拼接）。

| 来源 | `roster_flight` 字段 | 备注 |
|------|---------------------|------|
| `rosterFlightId` | `interface_id` | |
| 关联 `roster.id` | `roster_id` | |
| 关联 `pairing_duty_segment.id` | `segment_id` | 匹配 fltId / dep / arr / 时间 |
| 关联 `crew.id` | `crew_id` | |
| `crew.actingRank` | `acting_rank` | CAP→CA，CP→FO 规范化 |
| `depArp` | `dep_arp` | |
| `arrArp` | `arr_arp` | |
| `dutyStrUtc` | `duty_str_utc` | |
| 固定值 | `created_by='ZY_IMP'`, `modified_by='ZY_IMP'` | |

---

## 十一、数据校验与告警

### 校验规则

| 实体 | 校验项 | 处理方式 |
|------|--------|---------|
| Pairing | segment 回填 `flt_id` 时，找不到对应 `flight` 记录 | 跳过该 segment，收集警告 |
| RosterFlight | `pairingId` 在 `pairing` 表中不存在 | 跳过该条，收集警告 |
| RosterFlight | `crewId` 在 `crew` 表中不存在 | 跳过该条，收集警告 |

### 同步结果报告

```json
{
  "status": "completed_with_warnings",
  "entity": "pairing",
  "date_range": "2026-03-01 ~ 2026-03-10",
  "imported": 1520,
  "skipped": 3,
  "warnings": [
    "Pairing 101198: segment (F8804 YVR→YYC 2026-03-04) not found in flight table, segment skipped",
    "RosterFlight 2656138: pairing 99999 not found in pairing table, record skipped",
    "RosterFlight 2656139: crew 535 not found in crew table, record skipped"
  ]
}
```

- `status` 枚举：`completed` / `completed_with_warnings` / `failed`
- 警告信息包含业务字段（航班号、日期、ID），方便定位
- 完整告警同步写入日志文件

---

## 十二、HTTP 接口

### 手动同步

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| POST | `/sync/crew` | 无 | 全量同步 Crew |
| POST | `/sync/flight` | `start`, `end`（yyyy-MM-dd） | 按日期同步 Flight |
| POST | `/sync/pairing` | `start`, `end` | 按日期同步 Pairing |
| POST | `/sync/roster-flight` | `start`, `end` | 按日期同步 RosterFlight |

所有 `/sync/*` 接口异步执行（`BackgroundTasks`），立即返回：
```json
{ "status": "started", "job_id": "pairing_20260507_143210" }
```

### 定时任务开关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/scheduler/status` | 查看所有任务开关状态 |
| POST | `/scheduler/crew/enable` | 开启 Crew 定时任务 |
| POST | `/scheduler/crew/disable` | 关闭 Crew 定时任务 |
| POST | `/scheduler/flight/enable` | 开启 Flight 定时任务 |
| POST | `/scheduler/flight/disable` | 关闭 Flight 定时任务 |
| POST | `/scheduler/pairing/enable` | 开启 Pairing 定时任务 |
| POST | `/scheduler/pairing/disable` | 关闭 Pairing 定时任务 |
| POST | `/scheduler/roster-flight/enable` | 开启 RosterFlight 定时任务 |
| POST | `/scheduler/roster-flight/disable` | 关闭 RosterFlight 定时任务 |

开关状态持久化到 `.scheduler_state.json`，服务重启后自动恢复。

---

## 十三、定时任务

| 任务 | 执行时间（UTC） | 范围 | 默认开关 |
|------|--------------|------|---------|
| Crew 全量同步 | 每天 00:00 | 全量 | 开启 |
| Flight 同步 | 每天 01:00 | today ~ today+10天 | 开启 |
| Pairing 同步 | 每天 01:30 | today ~ today+10天 | 开启 |
| RosterFlight 同步 | 每天 02:00 | today ~ today+10天 | 开启 |

滚动天数由 `SYNC_DAYS_AHEAD` 环境变量控制，默认 10。

---

## 十四、幂等性设计

- 写库前检查 `interface_id` 是否已存在，已存在则 `UPDATE`，不存在则 `INSERT`（upsert）
- 同一批次重复运行不产生重复数据
- JSON 文件存储不受幂等影响，每次调用独立存档
