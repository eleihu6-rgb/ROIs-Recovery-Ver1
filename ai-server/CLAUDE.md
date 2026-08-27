# ai-server 模块规范

> AI 服务 (FastAPI + Python, 端口 3005)。遵循根目录 `CLAUDE.md` 的全局规范与 Python 通用规范。

## 用途

`ai-server` 是一个独立的 FastAPI 服务，提供两类能力：

1. **AI 聊天工具调用** — `POST /ai/chat`：把自然语言指令翻译成 Gantt 看板的过滤 / 排序 / 重置操作（`AiAction[]`），由前端 dispatch 到 Zustand store。
2. **回归测试生成 / 运行** — `POST /ai/regression/*`：把自然语言测试用例转成可运行的 Playwright 规格（NL → spec），并支持 UI 触发运行，JSON 文件存储。

端口：**3005**（uvicorn）。

## Provider 自动探测（环境变量）

LLM provider 通过环境变量自动探测，配置来自 `ai-server/.env`（**已 gitignore，禁止提交**）。探测顺序：

1. `AI_PROVIDER` 显式覆盖（`anthropic` / `qwen` / `deepseek`）
2. 否则按 key 存在性：`DEEPSEEK_API_KEY` → `DASHSCOPE_API_KEY`（Qwen）→ `ANTHROPIC_API_KEY`
3. 都没有时回退 `deepseek`

模型 / base URL 变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ANTHROPIC_API_KEY` | — | Anthropic key |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Anthropic 模型 |
| `DEEPSEEK_API_KEY` | — | DeepSeek key |
| `DEEPSEEK_MODEL` | `deepseek-chat` | DeepSeek 模型 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek OpenAI-compat base URL |
| `DASHSCOPE_API_KEY` | — | Qwen / DashScope key |
| `QWEN_MODEL` | `qwen-plus` | Qwen 模型 |
| `DASHSCOPE_BASE_URL` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | Qwen OpenAI-compat base URL |
| `CORS_ORIGINS` | `http://localhost:5173` | 逗号分隔的 CORS 白名单 |
| `PORT` | `3005` | 监听端口 |
| `REPO_ROOT` | 空（默认 ai-server 上级目录） | 运行 Playwright / 定位 `regression_tests.json` 用 |

> **To run:** copy the EVACC `.env` provider keys into `ai-server/.env`（参考 `ai-server/.env.example`）。

## 路由汇总

### Chat

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/ai/health` | 健康检查 `{status: 'ok'}` |
| `POST` | `/ai/chat` | 工具调用：`{messages[]}` → `{role, content, actions: AiAction[]}`。只读/视图工具：`filter_crew` / `filter_pairing` / `filter_flight` / `sort_roster` / `reset_filters` / `set_date_range` / `prepare_pa_removal`（只写 memo，不改排班）；Live Roster 编辑工具（Phase 1，只 stage 进 draft store，从不 save/commit）：`move_task` / `swap_tasks` / `unassign_task` / `add_ground_task`；`create_crew_bids` 服务端专用，不下发 `AiAction` |

### Regression

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/ai/regression/tests` | 列出全部用例 |
| `POST` | `/ai/regression/tests` | 新建用例（title/category/priority/description） |
| `PUT` | `/ai/regression/tests/{id}` | 更新用例 |
| `DELETE` | `/ai/regression/tests/{id}` | 删除用例 |
| `POST` | `/ai/regression/generate-playwright` | NL → Playwright 代码；信息不足时返回 `{questions[]}` |
| `POST` | `/ai/regression/tests/{id}/apply-generated` | 通过质量门后写入 `e2e/tests/gantt/user-tests.spec.ts` 的 `// user-test-{id}-start/end` 区段 |
| `GET` | `/ai/regression/tests/{id}/detail` | 用例详情（含 versions 历史） |
| `POST` | `/ai/regression/import-specs` | 幂等导入 `e2e/tests/gantt/*.spec.ts` 既有用例 |
| `POST` | `/ai/regression/runs` | 异步运行：`{test_ids[], order?, scope?}` → `{run_id}`；quarantined 用例在 all/related scope 下自动排除 |
| `GET` | `/ai/regression/runs/{run_id}` | 轮询运行结果（status: running/done/error） |
| `GET` | `/ai/regression/runs/{run_id}/trace/{test_id}` | 下载失败用例的 Playwright trace.zip |

## 质量门（quality bar，回归规格 v2 §10）

生成的测试必须**量化**，否则被 `validate_generated` 门拒绝。拒绝项：

- `waitForTimeout`（硬等待）— 改用 `expect.poll` / `toPass` + timeout
- 缺少断言（无 `expect(`）
- 仅 `toBeVisible`（纯可见性"证明"）— 必须补一条可度量断言（`toHaveCount` / `toHaveText` / `.status()` / `<N ms` 等）

运行策略：

- **failure-first**：默认按失败历史排序（`order: 'failing-first'`），先跑最可能失败的用例。
- **scope ladder**：`selected`（直接改动的用例）→ `related`（同 `category` 的关联用例）→ `all`（全量）。`apply-generated` 同样在写盘前过质量门（不达标返回 422）。
- **flake 检测**：运行带 `--retries=1`（fail→pass 记为 `flaky`）+ `--trace=on-first-retry`；不稳定度按状态翻转计算，支持隔离（quarantine）与连续 5 次通过自动解除。

## gitignore 约定

`regression_tests.json`（JSON 文件存储）、`artifacts/`（Playwright trace 产物）与 `.env`（provider keys）均已 gitignore，**禁止提交**。

## nginx（部署步骤，带外完成）

nginx 必须把 `/altair/ai/` 反向代理到 `http://localhost:3005/ai/`，前端才能访问到本服务。它与 `/altair/live`、`/altair/rule`、`/altair/engine`（见 `gantt/src/config/api-paths.ts`）一致。**这是带外的部署步骤，不属于代码改动**，仅在此记录。

## 运行测试

```bash
cd ai-server && .venv/bin/python -m pytest -v
# 若无 venv：
python -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python -m pytest -v
```

## 启动服务

```bash
cd ai-server && python main.py   # uvicorn 监听 3005
```
