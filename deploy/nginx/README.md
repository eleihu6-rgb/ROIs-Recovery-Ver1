# nginx 配置版本管理（WebServer 10.15.12.2）

本目录是 WebServer `yuan.z@10.15.12.2` 上 nginx 配置的**版本管理唯一事实源**（tracked in git）。

| 文件 | 对应服务器位置 | 说明 |
|---|---|---|
| `nginx.conf` | `/etc/nginx/nginx.conf` | 主配置（Ubuntu 默认 + include） |
| `conf.d/f8-sit.conf` | `/etc/nginx/conf.d/f8-sit.conf` | SIT vhost |
| `conf.d/f8-uat.conf` | `/etc/nginx/conf.d/f8-uat.conf` | UAT vhost |
| `conf.d/plan.conf` | `/etc/nginx/conf.d/plan.conf` | TST vhost：Plane（443 根）+ PentAGI 直连端口 8443 |
| `conf.d/pentagi.conf` | `/etc/nginx/conf.d/pentagi.conf` | PentAGI UI（→ PortalServer 10.15.12.4:8081）|

`.bak` 文件**不入库**——git 历史就是版本，每次部署自动备份到 `/etc/nginx/.backup/<时间戳>/`。

## PentAGI 访问路径（tst 域，独立 hostname）

- **`https://crew-f8-usva-penai.roiscloud.com/`** —— PentAGI 唯一对外访问路径
  （`conf.d/pentagi.conf` → PortalServer 10.15.12.4:8081，根路径直连，无任何改写）。
  PentAGI 前端硬编码 `/api/v1` + 根绝对资源路径，**必须占根路径**，所以不能用 443 子路径。
- 曾尝试 443 子路径 `/pentagi/`（`conf.d/plan.conf` 内 sub_filter 改写 JS bundle +
  `proxy_cookie_path`），因 nginx 无法表达字面反引号（`\`` 实际输出 `\`+`` ` ``）等先天限制
  **已整体删除**（2026-08-13）。若 PentAGI 前端升级，也只影响 `pentagi.conf`，无需再碰
  sub_filter。
- `https://crew-f8-usva-tst.roiscloud.com:8443/` —— 独立端口直连（内网可用；公网 8443 被云安全组
  拦截，需开安全组入方向 TCP 8443 才能在外部访问）。
- 旧 `https://crew-f8-usva-pentagi.roiscloud.com/` 域名（拼写 pentagi）未配置，勿用。
- DNS：`crew-f8-usva-penai → 47.89.181.217`（已生效）；证书 `*.roiscloud.com` 通配覆盖。
- PentAGI 登录：`admin@pentagi.com`（首登 UI 强制改密）；API token 走
  `createAPIToken`，token 失效通常因 `COOKIE_SIGNING_SALT` 变更（JWT 签名失效）。
- **持久化提醒**：WebServer 每 10 分钟 `git reset --hard` + pull，改 nginx 配置必须
  走「本地编辑 → commit+push → WebServer `git pull` → deploy-nginx.sh」，不能只 scp（会被回滚）。

## 改配置的流程

1. 编辑本目录下的文件
2. `git add` + commit + push 到 `main`
3. 在 webserver 上应用（repo 已在 `~/rois/rois-ai`）：

```bash
ssh yuan.z@10.15.12.2
cd ~/rois/rois-ai && git pull
sudo ./deploy/nginx/deploy-nginx.sh          # 备份 → 应用 → nginx -t → reload
# 或只检查：
sudo ./deploy/nginx/deploy-nginx.sh --check  # 漂移 + nginx -t，不改动
sudo ./deploy/nginx/deploy-nginx.sh --diff   # 看 tracked vs live 的差异
```

## UAT Gantt 维护模式（`rois.sh maintain`）

向 UAT 手工导入数据期间，可把前端 Gantt 切到**站点维护模式**：访问
`https://crew-f8-usva-uat.roiscloud.com/altair/` 返回 503 并渲染维护页
（`maintenance.html`）；**后端代理（`/live/` `/rule/` `/engine/` `/ai/` `/pbs/api/`）不受影响，
维护期间可继续手工导数据**。

- **gate**：`conf.d/f8-uat.conf` 的 `/altair/` location 内
  `if (-f /home/yuan.z/rois/uat/maintenance.flag) { return 503; }`；
  503 经 `error_page 503 @altair_maintenance` 内部重定向渲染 `maintenance.html`
  （`Cache-Control: no-store`，供维护页 10s 轮询探测恢复）。
- **维护页源码**：`maintenance.html`（自包含静态页，固定英文提示 + 自动刷新恢复）。
  经 `rois.sh maintain on` 部署到 `/home/yuan.z/rois/uat/maintenance.html`
  （gantt dist 的兄弟目录，`rois.sh build gantt` 的 `rm -rf` 不会波及）。
- **开关命令**（per-host `~/rois/rois.sh`，不入库）：

```bash
~/rois/rois.sh maintain on        # 进入维护：scp 维护页 + 创建 marker + curl 验证 503 & 维护文案
~/rois/rois.sh maintain off       # 退出维护：删除 marker + curl 验证 200
~/rois/rois.sh maintain status    # 显示 marker 状态 + 实际 HTTP code
```

- **设计文档**：`docs/superpowers/specs/2026-08-07-uat-gantt-maintenance-mode-design.md`

## 安全与注意

- 目录内**不含任何密钥/证书内容**：SSL 配置只引用证书文件路径
  （`/home/piercrew/software/web/ssl/roiscloud.com.pem` / `.key`），证书本身在服务器上，不入库。
- 部署脚本有 `nginx -t` 兜底：配置非法会自动回滚到备份，不会 reload。
- 历史教训：gantt SPA 路由 `/altair/help`、`/altair/release` 与 dist 内真实静态目录
  `help/`、`release/`（截图）冲突 → `try_files $uri $uri/` 会命中目录返回 403，
  所以 gantt 块固定为 `try_files $uri /altair/index.html;`（无 `$uri/`）。见
  `conf.d/f8-*.conf` 里对应位置的注释。
