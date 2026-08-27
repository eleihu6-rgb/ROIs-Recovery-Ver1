# RO 引擎黑盒接口契约

> 通用接口原则详见 `docs/modules/po-engine/engine-interface.md`。本文档描述 RO 引擎的具体接口实现。

---

## 一、CLI 命令

```bash
python -m src \
  --input  /data/optimizer/f8/ro/101/run_001/input.gz \
  --output /data/optimizer/f8/ro/101/run_001/out.gz
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--input` | 是 | input.gz 文件绝对路径 |
| `--output` | 是 | out.gz 输出文件绝对路径（目标路径必须可写） |

所有运行参数均从 `input.gz` 的 `JOB_PARAMS` 节读取，无其他命令行参数。

---

## 二、退出码

| 退出码 | 含义 | out.gz 状态 |
|--------|------|------------|
| `0` | 成功，覆盖率 ≥ 99% | 已写入，`status=DONE` |
| `1` | 无可行解（覆盖率不足且未超时） | 已写入，`status=INFEASIBLE` |
| `2` | 超时，部分覆盖 | 已写入，`status=TIMEOUT` |
| `3` | 内部错误（解析失败/异常崩溃） | 尽力写入，`status=FAILED` |

---

## 三、进度上报（stdout JSON Lines）

```jsonl
{"event":"progress","phase":"loading","pct":1,"msg":"Reading /path/input.gz"}
{"event":"progress","phase":"loading","pct":2,"msg":"Compiling FTL constraints"}
{"event":"progress","phase":"loading","pct":5,"msg":"Parsing crews"}
{"event":"progress","phase":"loading","pct":8,"msg":"Parsing 350 pairings"}
{"event":"progress","phase":"loading","pct":10,"msg":"Loaded 200 crews, 350 pairings"}
{"event":"progress","phase":"eligibility","pct":12,"msg":"Building eligibility index"}
{"event":"progress","phase":"lagrangian","pct":15,"msg":"Starting Lagrangian (180s budget)"}
{"event":"progress","phase":"lagrangian","pct":27,"msg":"Iter 25/500: L=12500, covered=280/350"}
{"event":"progress","phase":"lagrangian","pct":39,"msg":"Iter 50/500: L=15200, covered=320/350"}
{"event":"progress","phase":"primal_recovery","pct":75,"msg":"Recovering primal solution"}
{"event":"progress","phase":"primal_recovery","pct":82,"msg":"Primal recovery: 412 assignments"}
{"event":"progress","phase":"cpsat_polish","pct":84,"msg":"CP-SAT polish (100s budget)"}
{"event":"progress","phase":"cpsat_polish","pct":85,"msg":"Phase A: FTL violation repair"}
{"event":"progress","phase":"cpsat_polish","pct":87,"msg":"Phase B: LNS fairness improvement"}
{"event":"progress","phase":"done","pct":98,"msg":"status=DONE, assignments=412"}
{"event":"progress","phase":"extracting","pct":99,"msg":"Writing /path/out.gz"}
{"event":"done","status":"DONE","pct":100,"msg":"Allocation complete: 412 assignments"}
```

### 错误事件示例

```jsonl
{"event":"error","code":"NO_PAIRINGS","msg":"No pairings found in PAIRINGS section"}
{"event":"error","code":"NO_CREWS","msg":"No crews found in CREWS section"}
{"event":"error","code":"PARSE_ERROR","msg":"Failed to read input.gz: [Errno 2] No such file"}
{"event":"error","code":"INTERNAL_ERROR","msg":"ZeroDivisionError in lagrangian iteration 23"}
```

### 进度阶段说明

| `phase` | pct 范围 | 对应代码模块 |
|---------|---------|------------|
| `loading` | 1–10 | `__main__.py` + `pipeline._parse_*` |
| `eligibility` | 12 | `algorithm.eligibility` |
| `lagrangian` | 15–74 | `algorithm.lagrangian` |
| `primal_recovery` | 75–83 | `algorithm.primal_recovery` |
| `cpsat_polish` | 84–97 | `algorithm.cpsat_polish` |
| `done` | 98 | `pipeline._determine_status` |
| `extracting` | 99 | `__main__.py` 写文件 |

---

## 四、SIGTERM 处理

```python
# src/__main__.py
_stop_requested = False

def _handle_sigterm(signum, frame):
    global _stop_requested
    _stop_requested = True

signal.signal(signal.SIGTERM, _handle_sigterm)

# 传递给 pipeline
pipeline.run(sections, is_stop=lambda: _stop_requested)
```

SIGTERM 被捕获后：
- `run_lagrangian()` 在每次迭代开始前检查 `is_stop()`，立即退出循环
- `polish()` 在 Phase A/B 进入前检查，跳过 polish 直接返回当前方案
- 系统在当前状态基础上完成原始恢复并写出 out.gz，退出码视覆盖率而定

---

## 五、错误处理与容错写出

任何未捕获异常都会触发 `_write_failure()`，确保 out.gz 始终存在：

```python
except Exception as exc:
    error("INTERNAL_ERROR", str(exc))
    _write_failure(args.output, str(exc))   # 写入 status=FAILED 的 out.gz
    return 3
```

`_write_failure` 写出包含 `status=FAILED` 的最小 out.gz，便于 Optimizer Manager 区分"进程崩溃"（无 out.gz）和"引擎内部错误"（有 out.gz 但 status=FAILED）。

---

## 六、输入验证

`__main__.py` 在进入 pipeline 前做两项快速检查：

```python
if not sections.get("PAIRINGS"):
    error("NO_PAIRINGS", "No pairings found in PAIRINGS section")
    return 3

if not sections.get("CREWS"):
    error("NO_CREWS", "No crews found in CREWS section")
    return 3
```

其余验证（字段格式、法规参数合法性）由 pipeline 内部处理，遇到异常通过 `INTERNAL_ERROR` 上报。

---

## 七、测试方法

```bash
# 进入 ro-engine 目录
cd ro-engine

# 单元测试
.venv/bin/python -m pytest src/tests/ -v

# 黑盒集成测试（需要准备 input.gz）
python -m src --input /tmp/test_input.gz --output /tmp/test_output.gz
echo "Exit code: $?"

# 检查输出
python -c "
import gzip
with gzip.open('/tmp/test_output.gz', 'rt') as f:
    print(f.read())
"
```
