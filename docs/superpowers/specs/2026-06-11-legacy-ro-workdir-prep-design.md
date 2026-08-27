# LegacyRO 运行目录准备改进(tzdata / Database_connection.txt / PBS 偏好包)

> 日期:2026-06-11
> 模块:engine-server(LegacyRO 临时方案路径)
> 状态:已确认

## 背景

engine-server 的 LegacyRO 临时方案(`task_manager._fetch_input_legacy_java` → `F8/legacy_ro.sh` → `_submit_output_data` LegacyRO 分支归档 complete/)运行外部 PBS rostering 优化器。优化器运行时需要:

1. `tzdata/` 时区数据目录和 `Database_connection.txt` 连接配置(现存于 `engine-server/F8/`);
2. 四个偏好文件 `DAYSOFF.csv` / `LINE_RULES.csv` / `PAIRING_SCORE.csv` / `RESERVE_SCORE.csv`,由 pbs-server 临时接口 `GET /api/admin/algorithm-export/yeg-test-package?periodCode=...` 打包为 tgz 提供。

这些文件目前没有自动放入运行目录。

## 需求

- 任务启动取得 input.gz 后,将 `engine-server/<airline>/tzdata/` 和 `engine-server/<airline>/Database_connection.txt` 复制到运行目录。
- 调用 pbs-server yeg-test-package 接口(admin 登录)下载 tgz,解压到运行目录根(含 4 个偏好 CSV,附带 LINE_RULES_README.md 一并解出,无害)。
- 运行完成归档时,`tzdata/` 与 `Database_connection.txt` **不**随目录进入 complete/(归档前删除);偏好 CSV 保留并随目录归档(体积小,利于结果排查)。
- 辅助文件缺失或偏好包下载失败(pbs-server 未启动、登录失败等)→ 任务直接失败,错误信息写明原因。

## 设计

### 1. 配置

`config.yaml` LegacyRO 块新增 `pbs_server` 节点(模式与 `legacy_java` 一致):

```yaml
pbs_server:
  url: "http://localhost:3002"
  username: "admin"
  password: "${PBS_ADMIN_PASSWORD:Admin@2026}"
  period_code: "Jun 2026"   # periodCode 默认值,任务 parameters.periodCode 可覆盖
```

`config.py` 新增 `PbsServerConfig(BaseSettings)`,挂载为 `OptimizerTypeConfig.pbs_server: Optional[PbsServerConfig] = None`,不配置则跳过偏好包下载。

### 2. 新工具 `src/utils/pbs_server_client.py`

对照 `legacy_java_client.py` 模式:

- `login(base_url, user_code, password) -> str`:POST `/api/auth/session`,body `{userCode, password}`,响应 `{code, data: {token}, message}`,取 `data.token`。
- `fetch_yeg_test_package(base_url, token, period_code) -> bytes`:GET `/api/admin/algorithm-export/yeg-test-package?periodCode=<urlencoded>`,`Authorization: Bearer <token>`,返回 tgz 字节。

### 3. `task_manager._fetch_input_legacy_java` 扩展

input.gz 保存成功后:

1. **复制辅助文件**:源目录为 engine-server 根下 `./<airline>/`(与优化器路径 `./F8/legacy_ro.sh` 同约定)。`copytree(tzdata)` + `copy(Database_connection.txt)` 至 working_dir。源缺失 → `InputFetchError`。
2. **下载偏好包**:`pbs_server` 已配置时,periodCode 取 `parameters.periodCode` 或配置默认值;登录 → 下载 → `tarfile` 解压至 working_dir 根。解压前校验成员路径(拒绝绝对路径与 `..`,防目录穿越)。任何失败 → `InputFetchError`。

### 4. 归档前清理(`_submit_output_data` LegacyRO 分支)

`move_to_complete` 之前删除 working_dir 下 `tzdata/`(rmtree)与 `Database_connection.txt`(remove);清理失败仅 warning,不阻断归档。

### 5. 测试

pytest 扩展(conftest mock 体系):

- mock pbs-server:登录端点 + tgz 下载端点(打包 4 个 CSV)。
- 用例:辅助文件复制到位;tgz 解压出 4 个 CSV;登录/下载失败 → 任务 FAILED 且错误信息含原因;归档后 complete/ 目录无 tzdata 与 Database_connection.txt、偏好 CSV 保留;tzdata 源缺失 → 任务 FAILED。

### 6. 版本

后端改动:`gantt/src/version.ts` `BACKEND_VERSION` +1。

## 不做的事

- 不改 PO/RO/TO/Rule 正常流。
- 不在 legacy_ro.sh 内做下载/复制(逻辑集中在 Python,配置驱动)。
- 偏好 CSV 不做内容校验(优化器自行消费)。
