# 优化引擎黑盒接口契约

> 本文档定义 Optimizer Manager 与各优化引擎（PO / RO / TO / BO）之间的接口协议。
> 引擎只与文件打交道，不涉及 HTTP、Redis、数据库等任何外部服务。

---

## 一、核心设计原则

```
Optimizer Manager（另一个 Git 仓库）
    │
    ├── 管理生命周期（提交、轮询、取消、回写）
    ├── 管理文件目录（创建 input.gz，读取 out.gz）
    ├── 管理互斥锁（同一 workset 不并发运行）
    ├── 提供 HTTP API（供 Live Server / Gantt 调用）
    └── 回写结果到 Live Server
         │
         │ 进程调用 (subprocess / Docker run / K8s Job)
         ▼
    PO Engine（本仓库）
    ├── 输入：读取 input.gz
    ├── 计算：列生成 + MIP 求解
    ├── 输出：写入 out.gz
    └── 无 HTTP / 无 Redis / 无数据库连接
```

**引擎的唯一职责**：给定合法的 `input.gz`，生成 `out.gz`，然后退出。

---

## 二、引擎启动协议

### 2.1 命令行接口

Optimizer Manager 通过以下命令启动引擎进程：

```bash
python -m po_engine \
  --input  /data/optimizer/f8/po/99/run_002/input.gz \
  --output /data/optimizer/f8/po/99/run_002/out.gz
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--input` | 是 | `input.gz` 文件的绝对路径 |
| `--output` | 是 | `out.gz` 文件的目标绝对路径 |

引擎不接受其他网络/数据库配置参数，所有运行参数均从 `input.gz` 的 `JOB_PARAMS` 节读取。

### 2.2 退出码

| 退出码 | 含义 | out.gz 状态 |
|--------|------|------------|
| `0` | 成功，找到最优或可行解 | 已写入，`status=DONE` |
| `1` | 无可行解（INFEASIBLE） | 已写入，`status=INFEASIBLE` |
| `2` | 求解超时，返回当前最优解 | 已写入，`status=TIMEOUT` |
| `3` | 内部错误（数据问题、内存溢出等） | 尽力写入，`status=FAILED` |

> Optimizer Manager 通过进程退出码快速判断结果类型，同时解析 `out.gz` 的 `RESULT_META` 节获取详情。

---

## 三、进度上报协议

引擎向 **stdout** 输出 JSON Lines 格式的进度事件，每行一个 JSON 对象。
Optimizer Manager 捕获 stdout 并实时更新任务进度（供前端轮询）。

### 3.1 进度事件格式

```jsonl
{"event":"progress","phase":"loading","pct":5,"msg":"Loaded 486 flights, 4 rules"}
{"event":"progress","phase":"compiling","pct":8,"msg":"Compiled FDP table: 5 sector rows × 4 time windows"}
{"event":"progress","phase":"building_graph","pct":15,"msg":"Built flight network: 486 nodes, 1240 edges"}
{"event":"progress","phase":"generating_duties","pct":40,"msg":"Generated 3,847 duty candidates"}
{"event":"progress","phase":"generating_pairings","pct":60,"msg":"Generated 12,341 pairing candidates"}
{"event":"progress","phase":"solving","pct":75,"msg":"MIP: 98 pairings selected, gap 2.1%, elapsed 74s"}
{"event":"progress","phase":"solving","pct":88,"msg":"MIP: gap 0.3%, elapsed 142s"}
{"event":"progress","phase":"extracting","pct":95,"msg":"Extracting 98 pairings"}
{"event":"done","status":"DONE","pct":100,"msg":"Optimization complete: 98 pairings, 100% coverage"}
```

### 3.2 事件类型

| `event` | 说明 | 必填字段 |
|---------|------|---------|
| `progress` | 阶段进度更新 | `phase`, `pct`, `msg` |
| `done` | 引擎正常完成 | `status`, `pct`, `msg` |
| `error` | 引擎遇到错误 | `code`, `msg` |

```jsonl
{"event":"error","code":"NO_FLIGHTS","msg":"No flights found in input.gz FLIGHTS section"}
{"event":"error","code":"PARSE_ERROR","msg":"input.gz RULES section missing fdp_calculator row"}
```

### 3.3 引擎内部实现

```python
# src/utils/progress.py

import json
import sys

def emit(event: str, **kwargs) -> None:
    """向 stdout 输出一条进度事件"""
    print(json.dumps({"event": event, **kwargs}), flush=True)

def progress(phase: str, pct: int, msg: str) -> None:
    emit("progress", phase=phase, pct=pct, msg=msg)

def done(status: str, msg: str) -> None:
    emit("done", status=status, pct=100, msg=msg)

def error(code: str, msg: str) -> None:
    emit("error", code=code, msg=msg)
```

---

## 四、引擎入口实现

```python
# src/__main__.py  （python -m po_engine 的入口）

import argparse
import sys
from pathlib import Path

from src.io.job_io import JobIO
from src.optimizer.pipeline import OptimizationPipeline
from src.utils.progress import progress, done, error


def main() -> int:
    parser = argparse.ArgumentParser(description="PO Engine — black box optimizer")
    parser.add_argument("--input",  required=True, type=Path, help="Path to input.gz")
    parser.add_argument("--output", required=True, type=Path, help="Path to output out.gz")
    args = parser.parse_args()

    # 1. 读取 input.gz
    progress("loading", 2, "Reading input.gz")
    try:
        job_io = JobIO(storage_root=str(args.input.parent.parent.parent.parent))
        sections = job_io.read_sections(args.input)
    except Exception as e:
        error("PARSE_ERROR", f"Failed to read input.gz: {e}")
        return 3

    # 2. 运行优化 pipeline
    pipeline = OptimizationPipeline()
    try:
        result = pipeline.run(sections)
    except Exception as e:
        error("INTERNAL_ERROR", str(e))
        # 尽力写入 out.gz 记录失败状态
        _write_failure(args.output, str(e), sections)
        return 3

    # 3. 写入 out.gz
    progress("extracting", 95, f"Writing out.gz: {len(result.pairings)} pairings")
    job_io.write_output_to_path(args.output, result)
    done(result.status, result.summary_message())

    # 4. 返回退出码
    exit_codes = {"DONE": 0, "INFEASIBLE": 1, "TIMEOUT": 2, "FAILED": 3}
    return exit_codes.get(result.status, 3)


if __name__ == "__main__":
    sys.exit(main())
```

---

## 五、取消机制

Optimizer Manager 通过操作系统信号取消正在运行的引擎进程：

```
SIGTERM → 引擎优雅退出：停止求解，保存当前最优解到 out.gz（status=TIMEOUT），退出码 2
SIGKILL → 强制终止（超过 15 秒未响应 SIGTERM 时使用）
```

引擎内部注册 SIGTERM 处理器：

```python
import signal

def _handle_sigterm(signum, frame):
    """收到 SIGTERM 时，通知求解器停止并写入当前最优解"""
    _solver_stop_flag.set()  # 向 MIP 求解器发送停止信号

signal.signal(signal.SIGTERM, _handle_sigterm)
```

OR-Tools CP-SAT 支持 `solver.StopSearch()` 方法，可在 SIGTERM 后被调用以触发提前退出并返回当前最优解。

---

## 六、引擎与 Manager 的职责边界

| 职责 | 引擎（本仓库） | Optimizer Manager（另一仓库） |
|------|--------------|---------------------------|
| 读取 input.gz | ✅ | ✗ |
| 执行优化算法 | ✅ | ✗ |
| 写入 out.gz | ✅ | ✗ |
| 输出 stdout 进度 | ✅ | 捕获并解析 |
| 创建 input.gz | ✗ | ✅（从 Live Server 获取数据后写入） |
| 启动引擎进程 | ✗ | ✅ |
| 监控进程存活 | ✗ | ✅ |
| 取消进程（SIGTERM） | 处理信号 | ✅（发送信号） |
| 维护运行历史（runs.csv） | ✗ | ✅ |
| 维护互斥锁 | ✗ | ✅（Redis / 文件锁） |
| HTTP API | ✗ | ✅ |
| 回写结果到 Live Server | ✗ | ✅（读取 out.gz 后调用） |
| 多结果对比 | ✗ | ✅ |

---

## 七、Docker 化运行（可选）

Optimizer Manager 也可以将引擎作为 Docker 容器运行，隔离依赖环境：

```bash
# Optimizer Manager 启动 PO Engine 容器
docker run --rm \
  -v /data/optimizer:/data/optimizer \
  rois/po-engine:2.0.0 \
  --input  /data/optimizer/f8/po/99/run_002/input.gz \
  --output /data/optimizer/f8/po/99/run_002/out.gz
```

引擎镜像只包含 Python 运行时 + OR-Tools + 算法代码，不含任何网络服务依赖。

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml requirements.txt ./
RUN pip install -r requirements.txt
COPY src/ ./src/
ENTRYPOINT ["python", "-m", "po_engine"]
```

---

## 八、测试方式

黑盒架构让引擎测试极为简单：

```bash
# 准备测试 input.gz（可以从历史运行中复制）
cp /data/optimizer/f8/po/99/run_001/input.gz /tmp/test_input.gz

# 直接运行引擎
python -m po_engine \
  --input  /tmp/test_input.gz \
  --output /tmp/test_output.gz

# 检查退出码
echo "Exit code: $?"

# 检查输出
python -c "
import gzip
with gzip.open('/tmp/test_output.gz', 'rt') as f:
    print(f.read()[:2000])
"
```

完全不需要启动任何服务（不需要 Live Server、Rule Engine、Redis）即可运行和调试引擎。
