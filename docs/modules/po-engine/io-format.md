# 优化输入输出文件格式设计

> 适用于 PO / RO / TO / BO 四大优化引擎，统一 I/O 规范

---

## 一、设计目标

| 目标 | 说明 |
|------|------|
| 完整可重现 | 拿到 `input.gz` 可以 100% 复现当时的优化结果 |
| 无依赖回写 | 拿到 `out.gz` 可以独立回写 Live Server，无需重新优化 |
| 多次运行保留 | 同一场景可运行多次，每次结果独立保留，支持多结果对比 |
| 引擎解耦 | RO 直接读 PO 的 `out.gz` 作为输入，无需 HTTP 调用 |
| 可调试 | `gunzip input.gz` 后直接用 Excel 打开 CSV 排查问题 |
| 轻量归档 | 500 航班 + 100 配对的文件 gzip 后约 50-100 KB |

---

## 二、文件存储结构

`workset_id`（即 `scenario.workset_id`）是优化任务的主键。同一场景可以运行多次，每次为一个独立 **run**，以自增序号（`001`、`002`…）区分。

```
{STORAGE_ROOT}/
└── {airline}/                  # 航司二字码（如 f8、tg）
    └── {engine}/               # po / ro / to / bo
        └── {workset_id}/       # 场景主键（scenario.workset_id）
            ├── runs.csv        # 运行记录索引（追加写入）
            ├── run_001/
            │   ├── input.gz    # 第 1 次运行的完整输入快照
            │   └── out.gz      # 第 1 次运行的完整输出结果
            ├── run_002/
            │   ├── input.gz
            │   └── out.gz
            └── run_003/
                └── input.gz    # 正在运行中，out.gz 尚未生成
```

### runs.csv（运行索引文件）

追加方式写入，记录每次运行的关键信息：

```csv
run_id,started_at,completed_at,status,solve_time_sec,total_pairings,coverage_pct,writeback_scenario_id,notes
001,2026-05-01T10:00:05Z,2026-05-01T10:03:12Z,DONE,187.3,98,100.0,42,
002,2026-05-01T14:22:00Z,2026-05-01T14:25:44Z,DONE,224.1,95,100.0,,更宽松的休息约束
003,2026-05-02T09:10:00Z,,RUNNING,,,,,
```

`writeback_scenario_id`：当某次运行被回写 Live 时填入对应的 `scenario_id`，空表示未回写。

---

**STORAGE_ROOT 配置**（via `.env`）：

```bash
# 本地文件系统（开发/单机生产）
OPTIMIZER_STORAGE_ROOT=/data/optimizer-jobs

# FTP/SFTP（多服务器生产）
OPTIMIZER_STORAGE_BACKEND=sftp
OPTIMIZER_SFTP_HOST=ftp.internal
OPTIMIZER_SFTP_USER=optimizer
OPTIMIZER_SFTP_KEY_FILE=/secrets/sftp_key
OPTIMIZER_SFTP_BASE_PATH=/opt/optimizer-jobs
```

RO 引擎读取 PO 输出只需配置同一个根目录：

```bash
OPTIMIZER_STORAGE_ROOT=/data/optimizer-jobs   # 所有引擎共用
```

---

## 三、`input.gz` 格式规范

### 3.1 物理格式

- 外层：gzip 压缩
- 内层：单个文本文件（UTF-8）
- 分节：`## SECTION_NAME` 行作为节头，每节内是标准 CSV（含表头行）
- 注释行：`# ...`（解析时跳过）

### 3.2 节结构

```csv
# PO Engine Input Snapshot
# Generated: 2026-05-01T10:00:05Z
# Engine: po-engine v2.0.0

## JOB_PARAMS
workset_id,run_id,engine,airline,start_date,end_date,fleet,division,rule_group_code,base_airports,time_limit_sec,w_pairings,w_deadhead,w_duty_time,w_penalty
99,001,po,f8,2026-05-01,2026-05-31,320,P,CAAC_FTL,"PEK,SHA",300,1000,500,1,100

## RULE_CONFIG_META
group_code,group_name,usage,filiale,division
CAAC_FTL,CCAR-121 飞行时间限制,PO,F8,P

## RULES
template_code,instance_code,name,category,check_type,severity,overridable,constraint_type,params_json
fdp_calculator,FDP_STD,FDP Standard,FDP,CALC,ERROR,false,TABLE,"{""fdp_table"":[...]}"
rest_calculator,REST_STD,Rest Standard,REST,CALC,ERROR,false,LINEAR,"{""minRestMinutes"":600}"
duty_time_calculator,DUTY_STD,Duty Time,DUTY,CALC,ERROR,false,LINEAR,"{""maxDutyMinutes"":840,""maxConsecutiveDutyDays"":7}"
flight_time_calculator,FLT_STD,Flight Time,FLIGHT_TIME,CALC,ERROR,false,LINEAR,"{""maxFlightTimePerDutyMinutes"":600}"

## OPERATIONAL_PARAMS
param_key,param_value
defaultMctMinutes,60
briefMinutes,60
debriefMinutes,30
maxPairingDays,5
maxTafbMinutes,4320

## FLIGHTS
id,airline,flt_dt,flt_num,dep_arp,arv_arp,sch_dep_dt_utc,sch_arv_dt_utc,blk_min,fleet,flt_type,seg_type,is_locked
1001,F8,2026-05-01,F8001,PEK,SHA,2026-05-01T06:00:00Z,2026-05-01T08:00:00Z,120,320,J,,0
1002,F8,2026-05-01,F8002,SHA,PEK,2026-05-01T10:00:00Z,2026-05-01T12:00:00Z,120,320,J,,0
```

### 3.3 字段说明

**JOB_PARAMS 节**（一行数据）

| 字段 | 类型 | 说明 |
|------|------|------|
| `workset_id` | int | 场景主键（`scenario.workset_id`） |
| `run_id` | string | 本次运行序号（`001`、`002`…） |
| `engine` | string | 引擎类型（`po` / `ro` / `to` / `bo`） |
| `airline` | string | 航司二字码（如 `f8`） |
| `start_date` / `end_date` | YYYY-MM-DD | 优化日期范围 |
| `fleet` | string | 机型（空 = 全机型） |
| `division` | P/C | 飞行员 / 客舱 |
| `rule_group_code` | string | 法规集合代码 |
| `base_airports` | 逗号分隔 | 基地机场列表（引号包裹） |
| `time_limit_sec` | int | 求解时间上限 |
| `w_pairings/deadhead/duty_time/penalty` | int | 目标函数权重 |

**RULES 节**（`params_json` 含完整 JSON 参数）

法规参数以 JSON 字符串形式嵌入 CSV，便于完整保留复杂结构（如 fdp_table 数组）。

**FLIGHTS 节**（航班数据，来自 Live Server）

---

## 四、`out.gz` 格式规范

### 4.1 当前实现（v2）节结构

```csv
## RESULT_META
status,solve_time_sec,total_pairings,generated_at
DONE,187.30,98,2026-05-01T10:03:12+00:00

## KPI
total_flights,total_pairings,coverage_pct,total_flt_min
486,98,100.0,58320

## PAIRINGS
pairing_id,dep_arp,arv_arp,tafb_minutes,total_flt_minutes,flight_ids
1,PEK,PEK,1830,480,1001,1003,1020,1021
2,PEK,PEK,840,240,1002,1004
```

### 4.2 字段说明

**RESULT_META 节**（一行数据）

| 字段 | 说明 |
|------|------|
| `status` | `DONE` / `TIMEOUT` / `INFEASIBLE` / `FAILED` |
| `solve_time_sec` | MIP 求解耗时（秒，2 位小数） |
| `total_pairings` | 选出的配对数 |
| `generated_at` | ISO 8601 UTC 时间戳 |

**KPI 节**（一行宽表格）

| 字段 | 说明 |
|------|------|
| `total_flights` | 输入航班总数 |
| `total_pairings` | 选出的配对数 |
| `coverage_pct` | 航班覆盖率（应为 100.0） |
| `total_flt_min` | 所有配对的总飞行分钟数 |

**PAIRINGS 节**（每行一个配对）

| 字段 | 说明 |
|------|------|
| `pairing_id` | 文件内自增序号（从 1 开始） |
| `dep_arp` | 第一个值勤期的出发机场 |
| `arv_arp` | 最后一个值勤期的到达机场（配对完整则等于 `dep_arp`） |
| `tafb_minutes` | TAFB（离基到返基总时间，分钟） |
| `total_flt_minutes` | 配对内所有航段总飞行分钟数 |
| `flight_ids` | 逗号分隔的航班 ID 列表 |

### 4.3 DUTIES 节

每行一个值勤期，duty_start/end 已含 brief/debrief 时间偏移：

```csv
## DUTIES
pairing_id,duty_seq,dep_arp,arv_arp,duty_start_utc,duty_end_utc,flt_minutes,fdp_minutes,rest_after_minutes
1,1,PEK,SHA,2026-05-01T05:00:00Z,2026-05-01T08:30:00Z,120,210,780
1,2,SHA,PEK,2026-05-02T09:00:00Z,2026-05-02T13:00:00Z,120,210,0
```

`rest_after_minutes`：与下一个值勤期之间的休息分钟数（末尾 duty 为 0）。

### 4.4 SEGMENTS 节

每行一个航段：

```csv
## SEGMENTS
pairing_id,duty_seq,seg_seq,flt_id,flt_num,dep_arp,arv_arp,sch_dep_dt_utc,sch_arv_dt_utc
1,1,1,1001,F8001,PEK,SHA,2026-05-01T06:00:00Z,2026-05-01T08:00:00Z
1,2,1,1002,F8002,SHA,PEK,2026-05-02T10:00:00Z,2026-05-02T12:00:00Z
```

---

## 五、文件读写实现

`src/io/job_io.py` 提供两个模块级函数，供 `__main__.py` 直接调用：

```python
# src/io/job_io.py（实际实现）

import csv, gzip, io
from typing import BinaryIO


def read_input_gz(source: BinaryIO) -> dict[str, list[dict]]:
    """
    读取 gzip 文件，返回 {section_name: [row_dict, ...]}。
    节以 '## SECTION_NAME' 行分隔，'#' 开头为注释跳过。
    """
    with gzip.GzipFile(fileobj=source, mode="rb") as gz:
        text = gz.read().decode("utf-8")

    sections: dict[str, list[dict]] = {}
    current_section: str | None = None
    current_lines: list[str] = []

    def _flush():
        if current_section is not None:
            sections[current_section] = list(csv.DictReader(current_lines))

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith("## "):
            _flush()
            current_section = line[3:].strip()
            current_lines = []
        elif not line or line.startswith("#"):
            continue
        else:
            current_lines.append(raw_line)

    _flush()
    return sections


def write_output_gz(dest: BinaryIO, sections: dict[str, list[dict]]) -> None:
    """
    将结果节写入 gzip 文件，格式与 input.gz 一致。
    sections: {section_name: [row_dict, ...]}，值必须可字符串化。
    """
    buf = io.StringIO()
    for section_name, rows in sections.items():
        buf.write(f"## {section_name}\n")
        if rows:
            writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()), lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
        buf.write("\n")

    with gzip.GzipFile(fileobj=dest, mode="wb") as gz:
        gz.write(buf.getvalue().encode("utf-8"))
```

> `JobIO` 类（含 `runs.csv` 管理、run 目录结构、回写逻辑）属于 **Optimizer Manager（另一仓库）** 的职责，不在本引擎中实现。

---

## 六、多次运行 + 结果对比

### 6.1 运行流程

```
第 1 次运行：workset_id=99 → run_001/input.gz + run_001/out.gz
第 2 次运行：workset_id=99 → run_002/input.gz + run_002/out.gz（不同权重）
第 3 次运行：workset_id=99 → run_003/input.gz（正在运行，out.gz 待生成）
```

**互斥锁**：同一 `workset_id` 不允许同时运行两个任务。
Worker 启动时在 Redis 设置锁：`SET optimizer:lock:{engine}:{workset_id} {run_id} NX EX 600`
任务完成/失败/取消时释放锁。

### 6.2 多结果对比

```python
async def compare_runs(
    job_io: JobIO,
    airline: str, engine: str, workset_id: int,
    run_ids: list[str],
) -> list[dict]:
    """读取多次运行的 KPI，返回对比数据"""
    comparison = []
    for run_id in run_ids:
        out_path = job_io.run_dir(airline, engine, workset_id, run_id) / "out.gz"
        if not out_path.exists():
            continue
        sections = job_io.read_sections(out_path)
        meta = sections.get("RESULT_META", [{}])[0]
        kpis = {r["metric_name"]: r["metric_value"] for r in sections.get("KPI", [])}
        comparison.append({"run_id": run_id, "meta": meta, "kpi": kpis})
    return comparison
```

---

## 七、PO → RO 文件传递

RO 引擎从 PO `out.gz` 的 `PAIRINGS`、`DUTIES`、`SEGMENTS` 节读取配对数据。

RO 引擎读取 PO `out.gz` 的 `PAIRINGS`、`DUTIES`、`SEGMENTS` 节，示例如下：

```python
# ro-engine 中的读取示例（Optimizer Manager 侧）
po_out_path = f"{storage_root}/f8/po/99/run_002/out.gz"
with open(po_out_path, "rb") as f:
    po_sections = read_input_gz(f)   # 复用相同解析函数

pairing_rows = po_sections["PAIRINGS"]
duty_rows    = po_sections["DUTIES"]     # 待实现
segment_rows = po_sections["SEGMENTS"]   # 待实现
```

RO 的 `input.gz` 中 `JOB_PARAMS` 节记录来源：

```csv
workset_id,run_id,engine,...,po_workset_id,po_run_id
101,001,ro,...,99,002
```

形成可追溯的任务链路：PO(workset=99, run=002) → RO(workset=101, run=001)

---

## 八、回写流程（选定 run → 回写 Live Server）

```python
# src/services/writeback_service.py

class WritebackService:
    """从指定 run 的 out.gz 回写到 Live Server"""

    async def writeback(
        self,
        airline: str, engine: str,
        workset_id: int, run_id: str,
    ) -> int:
        """返回创建的 scenario_id，并更新 runs.csv 的 writeback_scenario_id"""
        out_path = self.job_io.run_dir(airline, engine, workset_id, run_id) / "out.gz"
        sections = self.job_io.read_sections(out_path)

        meta = sections["RESULT_META"][0]
        kpi_rows = sections["KPI"]
        pairing_rows = sections["PAIRINGS"]
        duty_rows = sections["DUTIES"]
        segment_rows = sections["SEGMENTS"]

        # 1. 重建 Pairing 模型
        pairings = self._rebuild_pairings(pairing_rows, duty_rows, segment_rows)

        # 2. 写入 Live Server
        scenario_id = await self.result_service.create_scenario(
            workset_id=workset_id, ...
        )
        await self.result_service.save_pairings(pairings, scenario_id)
        kpi_data = {row["metric_name"]: row["metric_value"] for row in kpi_rows}
        await self.result_service.save_kpis(scenario_id, kpi_data)
        await self.result_service.update_scenario_status(scenario_id, "DONE")

        # 3. 更新 runs.csv 记录回写状态
        self.job_io.update_run_record(
            airline, engine, workset_id, run_id,
            updates={"writeback_scenario_id": str(scenario_id)}
        )
        return scenario_id
```

---

## 九、API 端点（文件操作相关）

详见 `api-spec.md`。关键端点：

```
POST   /api/{engine}/worksets/{workset_id}/runs          启动新运行
GET    /api/{engine}/worksets/{workset_id}/runs          列出所有运行
GET    /api/{engine}/worksets/{workset_id}/runs/{run_id} 查询指定运行状态
DELETE /api/{engine}/worksets/{workset_id}/runs/{run_id} 取消正在运行的任务
GET    /api/{engine}/worksets/{workset_id}/compare       对比多次运行 KPI
POST   /api/{engine}/worksets/{workset_id}/runs/{run_id}/writeback  回写指定运行
GET    /api/{engine}/worksets/{workset_id}/runs/{run_id}/input      下载 input.gz
GET    /api/{engine}/worksets/{workset_id}/runs/{run_id}/output     下载 out.gz
```

---

## 十、PO / RO / TO / BO 文件规范对比

| 引擎 | 存储路径 | input.gz 核心内容 | out.gz 核心内容 |
|------|---------|-----------------|----------------|
| PO | `{root}/f8/po/{workset_id}/run_NNN/` | 航班 + 法规配置 + 权重 | 配对 + 值勤期 + 航段 + KPI |
| RO | `{root}/f8/ro/{workset_id}/run_NNN/` | PO out.gz 引用 + 机组数据 + 资质 | 机组→配对分配 + 分配得分 + KPI |
| TO | `{root}/f8/to/{workset_id}/run_NNN/` | 培训需求 + 机组可用性 | 培训排班分配 + KPI |
| BO | `{root}/f8/bo/{workset_id}/run_NNN/` | 竞标结果 + 配对池 | 竞标分配结果 + KPI |

所有引擎均采用：`workset_id` 作主键、`run_id` 自增序号、`runs.csv` 索引文件、互斥锁防止并发运行。
