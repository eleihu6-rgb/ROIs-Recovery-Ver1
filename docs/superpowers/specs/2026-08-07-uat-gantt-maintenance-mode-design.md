# UAT Gantt Maintenance Mode（站点维护模式）Design

> 状态：已确认 · 2026-08-07 · 适用：UAT Gantt (`https://crew-f8-usva-uat.roiscloud.com/altair/`)

## 背景与目标

往 UAT 手工导入数据期间（如基础数据、机组数据、排班数据），需要把 UAT 前端 Gantt 临时切到
**站点维护模式**：访问 `https://crew-f8-usva-uat.roiscloud.com/altair/` 时用户看到的是维护提示页，
而不是真实应用；数据导入完成后切回正常。

硬性约束（用户确认）：

1. **只隔离前端访问，后端继续服务**。`/live/` `/rule/` `/engine/` `/ai/` `/pbs/api/` 等后端代理
   在维护期间**必须继续可用**——手工导数据依赖后端服务。
2. 维护页为**固定通用提示**（英文），不做自定义消息。
3. 维护结束后维护页**自动刷新恢复**到应用，无需用户手动刷新。
4. 维护页代码**记录在本地仓库**（tracked）。
5. `~/rois/rois.sh` 增加**维护命令**（per-host、不入库）。

## 方案

**nginx marker gate（推荐方案 A）**：在 `f8-uat.conf` 的 `/altair/` location 加一个 marker 文件判断；
marker 存在时返回 503 并渲染独立维护页；marker 删除即恢复正常。只挡 `/altair/` SPA，后端代理不动。

### 为什么不是其他方案

- **B（index.html 交换）**：`rois.sh build gantt` 部署会 `rm -rf` 整个 gantt dist，静默清除交换状态，
  维护页还须在每次 gantt 部署后重推。脆弱。
- **C（SPA 层维护）**：应用仍需下载并加载 JS，不是真正的「站点下架」页面，且违反「只隔离前端」。
- **iframe / 整站 503**：过度；只挡 `/altair/` 即可满足需求。

## 架构

```
本地 / 开发机 (yuan.z)
  repo  tracked:
    deploy/nginx/conf.d/f8-uat.conf        ← 维护 gate（nginx 配置）
    deploy/nginx/maintenance.html          ← 维护页源码（自包含静态页）
    deploy/nginx/README.md                 ← 维护模式用法说明
    e2e/gantt/maintenance-page.spec.ts     ← Playwright 测试
  ~/rois/rois.sh                           ← maintain 命令（per-host, 不入库）

WebServer yuan.z@10.15.12.2
  /home/yuan.z/rois/uat/gantt/             ← gantt dist（不改动）
  /home/yuan.z/rois/uat/maintenance.html   ← 维护页（gantt dist 之外，部署产物）
  /home/yuan.z/rois/uat/maintenance.flag   ← marker：存在 = 维护中
  /etc/nginx/conf.d/f8-uat.conf            ← 维护 gate（经 deploy-nginx.sh 应用）

UAT 后端 10.15.12.3（/live /rule /engine /ai /pbs/api）→ 维护期间继续服务
```

两条部署路径：

- **一次性基础设施变更**：nginx gate → webserver 上 `git pull` + `sudo ./deploy/nginx/deploy-nginx.sh`
  （备份 → 应用 → `nginx -t` → reload，失败自动回滚）。
- **运行时开关**：`rois.sh maintain on|off` 只创建/删除 marker 文件（逐请求生效，**无需 nginx reload**）。

## 维护页 `deploy/nginx/maintenance.html`

- **自包含静态 HTML**：内联 CSS + JS，零外部依赖——无论应用/后端处于何种状态都能渲染。
- **固定英文通用提示**（用户确认）：
  - 标题：`System Under Maintenance`
  - 正文：`The system is currently undergoing scheduled maintenance. Please check back later.`
- **样式**：与应用的深色高密度风格一致（深色背景 + 强调色），内联实现。
- **自动刷新恢复**（用户确认）：JS 每 10s `fetch('/altair/', { cache: 'no-store' })`；
  响应状态从 503 变为 200（gate 已关）时 `location.reload()`。
  - nginx 为该响应设置 `Cache-Control: no-store`，保证轮询不被浏览器缓存拦截。
  - `/altair/` 由 nginx 静态 alias 直接服务、不依赖后端，后端宕机不影响维护页渲染。

## nginx gate（`deploy/nginx/conf.d/f8-uat.conf`，仅 `/altair/` location）

```nginx
location ^~ /altair/ {
    alias /home/yuan.z/rois/uat/gantt/;
    index index.html;
    if (-f /home/yuan.z/rois/uat/maintenance.flag) { return 503; }   # 维护 gate
    try_files $uri /altair/index.html;
}
error_page 503 @altair_maintenance;
location @altair_maintenance {
    internal;
    default_type text/html;
    # alias 禁止用于具名 location —— 用 root + try_files 解析到维护页文件
    root /home/yuan.z/rois/uat;
    try_files /maintenance.html =404;
    add_header Cache-Control "no-store";
}
```

要点：

- 仅挡 SPA 路由；`/altair/assets/` 与所有后端代理（`/live/` `/rule/` `/engine/` `/ai/` `/pbs/api/`）
  **不做任何改动**。
- `if (-f …) { return 503; }` 是 nginx 官方文档列出的 100% 安全 `if` 用法之一（仅含 `return`）。
  与同 location 的 `try_files` 共存：`if` 为假时走 `try_files`，为真时 `return 503` 触发 error_page。
- `error_page` + 具名 location 内部重定向，`internal;` 防外部直接访问。
- 根路径重定向（`location = /` → `/altair/`、`location = /altair` → `/altair/`）无需改动：
  访问站点根即被引到 `/altair/` → 命中维护页。

## `rois.sh maintain` 命令

新增顶层子命令（在 `case "${1:-}"` 中加入 `maintain` 分支；`is_action_token` 仅供 `build` 流程内部使用，无需加入 `maintain`）：

```bash
rois.sh maintain on        # 进入维护：部署 maintenance.html + 创建 marker + curl 验证 503
rois.sh maintain off       # 退出维护：删除 marker + curl 验证 200
rois.sh maintain status    # 显示 marker 状态 + 实际 HTTP code
```

配置区新增变量（复用现有 `REMOTE` / `check_ssh`）：

```bash
UAT_MAINT_SRC="$ROIS_AI/deploy/nginx/maintenance.html"
UAT_MAINT_PAGE="${UAT_MAINT_PAGE:-/home/yuan.z/rois/uat/maintenance.html}"
UAT_MAINT_FLAG="${UAT_MAINT_FLAG:-/home/yuan.z/rois/uat/maintenance.flag}"
UAT_URL="${UAT_URL:-https://crew-f8-usva-uat.roiscloud.com/altair/}"
```

行为：

- **`maintain on`**：`check_ssh` → `scp` maintenance.html 到 webserver（保证最新）→
  `ssh touch $UAT_MAINT_FLAG` → 验证：`curl -s -o /dev/null -w '%{http_code}' $UAT_URL` == `503`，
  且 `curl -s $UAT_URL | grep -q 'Under Maintenance'`（证明是维护页而非通用 503）。任一失败 → `log_fail` 退出非零。
- **`maintain off`**：`ssh rm -f $UAT_MAINT_FLAG` → 验证 `curl` 返回 `200`。
- **`maintain status`**：报告远端 marker 是否存在 + 实际 HTTP code。
- 幂等：`on` 重复执行无副作用（再 touch）；`off` 重复执行无副作用。
- marker 与维护页位于 `/home/yuan.z/rois/uat/`（gantt dist 的**兄弟目录**），`rois.sh build gantt`
  的 `rm -rf` 不会波及，维护中重部署 gantt 不会静默退出维护模式。

`rois.sh` 为 per-host、不入库（见 `docs/modules/` 部署架构与既有记忆）；维护命令落在 `~/rois/rois.sh`，
不入 git。

## 错误处理

| 场景 | 处理 |
|------|------|
| SSH 不可达 | `check_ssh` 先失败，响亮报错 |
| nginx 配置非法 | `deploy-nginx.sh` 自动回滚备份，不 reload（既有机制） |
| 开关后 curl 验证不符 | `log_fail` 打印实际 HTTP code，提示人工检查 |
| 维护期间轮询时后端宕机 | `/altair/` 是 nginx 静态服务，不依赖后端，维护页照常渲染 |
| 维护期间重部署 gantt | dist 被替换，但 marker/维护页在兄弟目录，维护状态保持 |

## 测试与验证

### Playwright（§Playwright-Required）

`e2e/gantt/maintenance-page.spec.ts`：

1. 加载维护页 HTML，断言固定英文提示渲染（`toContainText('System Under Maintenance')`）。
2. 自动刷新：`page.route` 拦截轮询请求——首次返回 503，后续返回 200 → 断言页面发生
   `framenavigated` / reload。

运行：`npx playwright test e2e/gantt/maintenance-page.spec.ts --reporter=list`，贴 PASS 结果。

### 上线验证（§No-Illusion，UAT 真实 curl）

部署后执行并在完成消息贴出：

- `rois.sh maintain on` →
  `curl -s -o /dev/null -w '%{http_code}' https://crew-f8-usva-uat.roiscloud.com/altair/` → `503`
  + 正文含 `Under Maintenance`。
- `rois.sh maintain off` → 同上 → `200`。

### 其他

- `nginx -t` 必须绿（`deploy-nginx.sh` 强制）。
- `npm run check:ui`：维护页位于 `gantt/src` / `packages/ui/src` 之外，UI 标准门禁不扫描；
  但页面样式仍遵循设计语言（深色高密度、语义配色）。

## 交付清单

| 文件 | 位置 | 状态 |
|------|------|------|
| `deploy/nginx/conf.d/f8-uat.conf` | repo tracked | 修改：加维护 gate |
| `deploy/nginx/maintenance.html` | repo tracked | 新增 |
| `deploy/nginx/README.md` | repo tracked | 修改：维护模式用法 |
| `e2e/gantt/maintenance-page.spec.ts` | repo tracked | 新增 |
| `~/rois/rois.sh` | per-host 不入库 | 修改：`maintain` 命令 |
| `/home/yuan.z/rois/uat/maintenance.html` | webserver | 部署产物（`maintain on` scp） |
| `/home/yuan.z/rois/uat/maintenance.flag` | webserver | 运行时 marker |

## 使用流程（运维）

1. 提交并推送仓库改动；webserver 上 `git pull` + `sudo ./deploy/nginx/deploy-nginx.sh`。
2. `rois.sh maintain on` → UAT 显示维护页。
3. 通过后端（仍在服务）手工导入数据。
4. `rois.sh maintain off` → UAT 恢复。

## 范围与后续（暂不做）

- 仅 UAT（`f8-uat.conf`）。SIT（`f8-sit.conf`）如需，复制相同 gate 块即可，本设计不覆盖。
- 不挡 `/pbs/`（PBS Portal）——用户需求限定 Gantt；如需可扩展。
- 不做自定义维护消息（用户确认固定通用提示）。
- 不做维护期登录/旁路（用户只需开关即可）。
- 不阻塞后端 API——这是**特性**而非缺陷（手工导数据依赖后端）。
