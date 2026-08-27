# 开发上下文（2026-07-22）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-22 01:58:43 UTC
- Wing：`engines`
- Topic：`sit-ro-concurrency-runtime-patch`
- Title：sit-ro-concurrency-runtime-patch
- Git branch：`main`

## 本轮对话上下文

本轮处理 SIT LegacyRO 并发导致主机不可访问的排查后续：

SIT 事实与操作：
- SSH 已恢复，主机在 2026-07-22 01:28 UTC 被阿里云控制台强制重启。
- 故障窗口关联两个 LegacyRO 任务并发启动：scenario 693/task 6f60b88c-426d-4f2e-b65b-900a99a42315 与 scenario 694/task 5d111efb-e928-4e7b-a568-fe4a823d5a8e。
- 未发现 OOM killer、kernel panic、graceful shutdown 或用户 reboot 命令证据；sysstat 在硬挂窗口缺样本。
- SIT runtime-only 修改，不提交：
  - /home/rois/PBS_column_based_algorithm-main/run_solver.py：solver rotating file sink 从固定 DEBUG 改成跟随 level，减少非 debug 运行的日志量。
  - /home/yuan.z/rois/sit/engine-server/F8/ro_rust.sh：加 resource_monitor.log 采样（before/during/after solver，每 10 秒默认），并在 Hydra 命令中覆盖 solver.assignment_trace_enabled=false、solver.enable_tqdm=false、solver.enable_mip_spinner=false。
  - 备份文件：run_solver.py.bak_20260722_0155、ro_rust.sh.bak_20260722_0155。
  - 留档：/home/rois/SIT_RO_RUNTIME_PATCH_20260722.md（root owned，普通用户可读）。
- SIT 验证通过：python3 -m py_compile run_solver.py；bash -n ro_rust.sh。

本机仓库 durable fix：
- engine-server/src/config/config.py：TasksConfig 新增 optimizer_max_concurrent: Dict[str,int] = Field(default_factory=dict)。
- engine-server/src/tasks/task_manager.py：保留全局 tasks.max_concurrent，并叠加可选 per optimizer cap；大小写不敏感匹配 optimizer_type，limit <= 0 视为未配置。
- engine-server/src/config/config.yaml.example：示例添加 tasks.optimizer_max_concurrent.LegacyRO: 1。
- engine-server/tests/test_config.py / tests/test_task.py：增加配置解析断言和 LegacyRO 单类型限流回归测试。
- 当前设计按本实例内 RUNNING 任务限流，保持原有 Task.start() 状态语义；并发 start 的极端竞态没有重构为队列化，后续如需要严格跨线程/跨实例资源调度需单独设计。

验证：
- 本机 python3 -m py_compile src/config/config.py src/tasks/task_manager.py tests/test_config.py tests/test_task.py 通过。
- pytest tests/test_config.py tests/test_task.py -q 未能运行：系统 python3 无 pytest；可用 ../.venv-rule-engine 有 pytest 但缺 pyyaml，收集阶段 ModuleNotFoundError: yaml。

## 当前工作树快照

### git status --short

```text
 M engine-server/src/config/config.py
 M engine-server/src/config/config.yaml.example
 M engine-server/src/tasks/task_manager.py
 M engine-server/tests/test_config.py
 M engine-server/tests/test_task.py
```

### unstaged changed files

```text
engine-server/src/config/config.py
engine-server/src/config/config.yaml.example
engine-server/src/tasks/task_manager.py
engine-server/tests/test_config.py
engine-server/tests/test_task.py
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-22-engines-sit-ro-concurrency-runtime-patch.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh engines
git status --short
```
