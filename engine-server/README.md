# Engine Server — 优化引擎调度服务

FastAPI 优化引擎调度服务，统一管理多航司（BR / F8）的 PO / RO / TO / Rule 四类优化器，
负责任务生命周期、文件归档、与 Live Server 的集成。是 ROIS-AI monorepo 中的 `engine-server` 模块（端口 3003）。

## 技术栈

Python 3.8+ · FastAPI · Pydantic · PyJWT · slowapi · Redis（可选）· PyInstaller

## 快速开始

### 开发模式（源码运行）

```bash
# 1) 准备配置
cp src/config/config.yaml.example src/config/config.yaml
vi src/config/config.yaml

# 2) 安装依赖并启动
pip install -r requirements.txt
python3 main.py
# 或
uvicorn main:app --host 0.0.0.0 --port 3003
```

健康检查：

```bash
curl http://localhost:3003/health
```

### 生产部署（PyInstaller 单文件，无源码）

在与目标客户机兼容的 Linux 上打发布包，产物为 `dist/rois-optimizer-server.tar.gz`：

```bash
./build.sh pack
scp dist/rois-optimizer-server.tar.gz user@server:<DEPLOY_DIR>/
ssh user@server
cd <DEPLOY_DIR> && tar xzf rois-optimizer-server.tar.gz && cd rois-optimizer-server
cp config.yaml.example config.yaml && vi config.yaml
./deploy.sh install && ./deploy.sh start
```

> 客户机无需安装 Python / pip / venv，仅要求 glibc ≥ 构建机版本（生产 `pr-server-01` 为 Ubuntu 24.04 / glibc 2.39）。
> 详见 [部署指南](../docs/modules/engine-server/documents/deployment_guide.md)。

## 核心特性

- **多航司隔离**：BR / F8 各自独立的优化器配置、工作目录、归档目录。
- **三层认证**（按优先级）：JWT (HS256 共享密钥) → API Key → Bearer Token；
  JWT 可直接复用 Live Server 签发的令牌并透传。
- **限流**：按 `X-Airline` 维度，默认 15 次 / 分钟（可配）。
- **任务执行链路**：从 Live Server 拉 `input.gz` → 子进程跑优化器 → 解析 `PROGRESS:N`
  推送进度 → 回传 `output.gz` → 按航司 / 日期归档。
- **跨日归档**：当天的任务次日才归档到 `archive/<airline>/<yyyymmdd>/<task>.tar.gz`。
- **可选 Redis**：开启后任务状态分布式存储，支持多实例部署。

## API 端点

所有 `/api/*` 端点需通过认证，并在 Header 中带 `X-Airline: BR|F8`。

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/health` | 健康检查（无需认证） |
| `POST` | `/api/optimize/start` | 启动优化任务（PO/RO/TO/Rule） |
| `POST` | `/api/optimize/stop/{task_id}` | 停止任务 |
| `GET` | `/api/optimize/status/{task_id}` | 任务状态 |
| `GET` | `/api/optimize/progress/{task_id}` | 实时进度 |
| `GET` | `/api/system/info` | 服务/版本信息 |
| `GET` | `/api/optimizers` | 列出当前航司可用优化器 |
| `GET` | `/api/tasks/running` | 正在运行的任务 |
| `GET` | `/api/tasks/all` | 全部任务 |

详见 [API 文档](../docs/modules/engine-server/documents/api_documentation.md)。

## 项目结构

```
main.py                          # FastAPI 入口
build.sh                         # 编译 / 打包入口 (./build.sh / ./build.sh pack)
scripts/
  build.bat                      # Windows 编译
  deploy.sh                      # 客户机运行时（install/start/stop/restart/status）
  start.sh / start.bat           # 源码直启（开发用）
src/
  api/        # 路由、认证、Pydantic 模型
  config/     # 配置管理（${ENV:default} 语法）
  optimizers/ # 策略模式：StandardOptimizer / RuleOptimizer
  tasks/      # 任务生命周期 + 可选 Redis
  files/      # 移动 / 归档 / 清理
  utils/      # HTTP 客户端、Rule 请求构建器
tests/        # 文件管理 / 接口 / 认证 / 端到端测试
```

> 模块长期文档统一存放于 monorepo 的 `docs/modules/engine-server/`。

## 测试

```bash
python3 -m pytest \
  tests/test_input_interface.py \
  tests/test_output_interface.py \
  tests/test_auth_and_errors.py \
  tests/test_file_management.py \
  tests/test_e2e_lifecycle.py \
  tests/test_jwt_auth.py \
  --cov=src --cov-fail-under=70 -v
```

## 构建与发布

```bash
./build.sh          # 仅编译 → dist/optimize_server
./build.sh pack     # 编译 + 打成 dist/rois-optimizer-server.tar.gz
```

> 构建机 glibc 必须 ≤ 客户机；推荐在与客户机同 OS 版本的 Docker 容器内构建。
> 详见 [部署指南](../docs/modules/engine-server/documents/deployment_guide.md)。

## 环境变量

```bash
JWT_SECRET=xxx          # 与 Live Server 共享的 JWT 签名密钥
ROIS_API_KEY=xxx        # Live Server 服务间调用的 API Key
ROIS_BEARER_TOKEN=xxx   # 静态 Bearer Token（向后兼容）
ROIS_CONFIG_PATH=xxx    # 显式指定 config.yaml 路径（运行时 deploy.sh 自动设置）
```

`config.yaml` 中以 `${VAR:default}` 语法引用。

## 文档索引

| 文档 | 用途 |
|---|---|
| [API 接口文档](../docs/modules/engine-server/documents/api_documentation.md) | 端点详情、请求/响应示例 |
| [系统架构](../docs/modules/engine-server/documents/system_architecture.md) | 分层、模块关系、分布式部署 |
| [认证方案](../docs/modules/engine-server/documents/auth_design_proposal.md) | JWT 设计与三层优先级 |
| [部署指南](../docs/modules/engine-server/documents/deployment_guide.md) | 环境准备、配置、多机部署 |
| [架构审查报告](../docs/modules/engine-server/documents/architecture_review.md) | 问题清单与修复记录 |
| [需求文档](../docs/modules/engine-server/documents/optimize_server_requirements.md) | 功能 / 非功能需求 |
| [CLAUDE.md](CLAUDE.md) | 模块开发指引（给 Claude Code 使用） |
