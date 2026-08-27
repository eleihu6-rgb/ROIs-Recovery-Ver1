# RO 优化引擎开发规范

Roster 分配优化。将 Pairing 分配给合适机组。

## 架构

黑盒 CLI 进程，与 po-engine 完全一致：

```
python -m src --input /path/input.gz --output /path/out.gz
stdout: JSON Lines 进度上报
exit:   0=DONE  1=INFEASIBLE  2=TIMEOUT  3=INTERNAL_ERROR
```

不依赖：HTTP 服务、Redis、数据库连接。

## 技术栈

- Python 3.12+ / Google OR-Tools CP-SAT / numpy
- 算法：Lagrangian Relaxation + 每机组 DP + CP-SAT Polish

## 目录结构

```
src/
├── __main__.py          # CLI 入口，SIGTERM 处理
├── io/
│   └── job_io.py        # 读写 input.gz / out.gz
├── models/
│   ├── crew.py          # Crew, LockedAssignment 数据类
│   ├── pairing.py       # Pairing, PairingDuty, PairingComposition 数据类
│   └── rule_config.py   # RuleConfig（Pydantic，与 po-engine 共享）
├── constraints/
│   └── compiler.py      # FTLCompiler → CompiledFTL
├── algorithm/
│   ├── eligibility.py   # 预过滤：构建 crew-pairing 可行矩阵
│   ├── crew_scheduler.py # 每机组 DP 子问题
│   ├── lagrangian.py    # Lagrangian 主循环
│   ├── primal_recovery.py # 对偶解 → 原始可行解
│   └── cpsat_polish.py  # CP-SAT 三阶段精修
├── optimizer/
│   └── pipeline.py      # AllocationPipeline — 总调度
└── utils/
    ├── progress.py      # stdout JSON Lines 进度
    └── ftl_state.py     # DPState + epoch 时间工具
```

## 测试

- 单元测试 (pytest)：各算法模块
- 测试文件：`src/tests/test_<模块名>.py`
