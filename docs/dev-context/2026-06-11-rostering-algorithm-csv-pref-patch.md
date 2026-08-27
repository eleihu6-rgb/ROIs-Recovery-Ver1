# rostering_algorithm 补丁记录:PBS CSV 偏好支持 + COF 段解析修复

> 日期:2026-06-11
> 位置:`/home/piercrew/software/rostering_algorithm`(ryan 的外部优化器,不在本仓库)
> 备份:`ColumnModelSolver_python/ro_input_loader.py.bak-20260611`、`run_pipeline.sh.bak-20260611`

## 背景

LegacyRO 场景优化一直输出 0 结果(coverage 0%,output.gz 只有 leadin)。排查发现两个独立问题:

1. **COF 段覆盖 bug**:`_parse_ro_input` 以 `rest[:paren]` 取段名,`Crew(225)(COF)`(结转上下文机组)与场景段 `Crew(26)` 同名为 `Crew`,后者被覆盖 → 求解器拿错机组集合(16 个 COF 机组,与场景/偏好机组零交集)。
2. **偏好只读 .bin**:`_load_preferences` 只加载 `data/baisc_input_data/` 下的三个 pickle(2025 年旧数据),不读 engine-server 放进运行目录的 PBS 导出 CSV。

## 改动

### 1. `ColumnModelSolver_python/ro_input_loader.py`

- `_parse_ro_input`:段名含 `(COF)` 时 key 改为 `Crew(COF)` 等,不再覆盖场景段。
- 新增 `_load_preferences_from_csv(pref_dir)`:读 `PAIRING_SCORE.csv` / `RESERVE_SCORE.csv`(Crew_ID/Pairing_ID 为 live 整型 ID,强度 = T1..T7 Award/Avoid 计数之和)与 `DAYSOFF.csv`(UTC 起始时间取日期部分为本地日);产出与 .bin 相同的 `(crew_id, {pairing_id: strength})` / dayoff 结构。
- `_load_preferences`:CSV 存在则优先,否则回退 `.bin`(原逻辑移入 `_load_preferences_from_bin`)。
- `LINE_RULES.csv` 当前不消费(属规则约束,非偏好权重),待后续。

### 2. `run_pipeline.sh`

- `PREF_DIR="${RO_PREF_DIR:-$PROJECT_PATH/data/baisc_input_data}"` — 支持环境变量覆盖偏好目录。

### 3. 本仓库 `engine-server/F8/legacy_ro.sh`

- 调 pipeline 前 `export RO_PREF_DIR="$WORKING_DIR"`,指向含 4 个 CSV 的任务运行目录。

## 验证(2026-06-11)

场景 6(YEG, Jun 2026)端到端重跑,task b19f1184,归档 `complete/F8/6_20260611_074639`:

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 求解机组 | 16(错误的 COF 机组) | 26(场景机组) |
| 偏好命中 | award 560→0 全过滤 | award 5 / avoid 2 / dayoff 6 个机组全保留 |
| Coverage | 0%(0/1473) | 13.92%(205/1473) |
| ASSIGNMENTS | 38 条全 leadin | 205 条 CR(优化)+ 38 leadin |
| Award/Avoid 满足 | — | award 1/7,avoid 3/3 |

scenario 6 状态 DONE,file_path 指向新归档,live-server 已收到通知。

## 其他结论

- **input.gz**:优化器正确消费(49 段、26 机组、183 配对解析正常)。
- **tzdata / Database_connection.txt**:当前 `run_pipeline.sh` 链路**不使用**(时区取自 ro_input 的 Airport 段);它们是 `PBS_column_based_algorithm` 子流程(内嵌 rule engine 在 cwd 找 `Database_connection.txt`)所需。复制无害,保留。
