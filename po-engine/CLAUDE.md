# PO 优化引擎开发规范

PO（Pairing Optimizer）配对优化引擎，v2 架构。将航班组成最优飞行配对（Pairing）。

## 技术栈

- Python 3.12+ / OR-Tools CBC（pywraplp）/ Pydantic v2

## 架构说明

**PO Engine 是纯命令行黑盒进程**，无 HTTP 服务、无 Worker、无 Redis、无数据库连接。

```
输入：python -m src --input /path/input.gz --output /path/out.gz
进度：stdout JSON Lines
输出：out.gz 文件
退出码：0=DONE  1=INFEASIBLE  2=TIMEOUT  3=INTERNAL_ERROR
```

所有 HTTP API、生命周期管理、互斥锁、运行历史、回写逻辑均由 **Optimizer Manager（另一 Git 仓库）** 负责。

## 目录结构

```
src/
├── __main__.py      # 入口：解析 --input/--output，调用 pipeline
├── io/
│   └── job_io.py    # 读写 input.gz / out.gz（模块级函数）
├── optimizer/
│   ├── pipeline.py  # OptimizationPipeline（总调度）
│   └── ...
├── constraints/
│   ├── compiler.py  # RuleConfig → CompiledConstraints
│   └── fdp_table.py # FDP 查表逻辑
├── algorithm/
│   ├── flight_network.py    # 航班时空连接图
│   ├── duty_generator.py    # 值勤期候选生成（DFS + 剪枝）
│   ├── pairing_generator.py # 配对候选生成
│   └── mip_solver.py        # 集合分割 MIP（CBC）
├── models/          # Pydantic 数据模型
├── utils/
│   ├── progress.py  # stdout JSON Lines 进度上报
│   └── time_utils.py
└── main.py          # （FastAPI 桩，暂未使用）
```

## 算法流程

```
input.gz → 解析 flights + rule_config + job_params
         → ConstraintCompiler.compile() → CompiledConstraints
         → build_connection_graph()     → 航班连接有向图
         → generate_duties()            → 值勤期候选池（DFS 剪枝）
         → generate_pairings()          → 配对候选池
         → solve_set_partitioning()     → MIP 集合分割（CBC）
         → 组装 out.gz 各节
```

规则配置由 Optimizer Manager 在写入 `input.gz` 时从 Rule Engine 获取并嵌入 `RULES` 节。引擎运行时从 `input.gz` 读取，**无任何 HTTP 调用**。

## 进度上报格式

向 stdout 输出 JSON Lines，Optimizer Manager 逐行读取：

```json
{"event":"progress","phase":"loading","pct":5,"msg":"Parsing 200 flights"}
{"event":"progress","phase":"solving","pct":75,"msg":"MIP gap 3.2%"}
{"event":"done","status":"DONE","pct":100,"msg":"Optimization complete: 98 pairings"}
{"event":"error","code":"PARSE_ERROR","msg":"Failed to read input.gz: ..."}
```

## out.gz 当前格式（v2 实现）

`out.gz` 包含以下节（`## SECTION_NAME` 分隔的 CSV）：

| 节名 | 内容 |
|------|------|
| `RESULT_META` | workset_id / run_id / engine / airline / status / solver_status / solve_time_sec / writeback_scenario_id |
| `KPI` | key-value 行格式（metric_name / metric_value / metric_unit），含 8 个指标 |
| `PAIRINGS` | pairing_id / pairing_label / base / fleet / division / 时间 / tafb_minutes / duty_count / seg_count / source |
| `DUTIES` | pairing_id / duty_seq / dep_arp / arv_arp / duty_start_utc / duty_end_utc / flt_minutes / fdp_minutes / rest_after_minutes |
| `SEGMENTS` | pairing_id / duty_seq / seg_seq / flt_id / flt_num / dep_arp / arv_arp / sch_dep_dt_utc / sch_arv_dt_utc |

## 特有规范

- 约束阈值全部从 `input.gz` 的 `RULES` 节和 `OPERATIONAL_PARAMS` 节读取，禁止硬编码
- `_pairing_cost()` 权重来自 `JOB_PARAMS` 节（w_pairings / w_deadhead / w_duty_time / w_penalty）
- MIP 超时（CBC FEASIBLE 状态）返回当前最优解，状态为 `TIMEOUT`，exit code = 2
- SIGTERM 信号收到后将 MIP 时间限制压缩为 1 秒，让 CBC 快速返回当前最优解

## 测试

```bash
cd po-engine
python -m pytest src/tests/ -v
```

测试文件位于 `src/tests/`，命名规范 `test_<模块名>.py`。需包含已知最优解验证用例。
