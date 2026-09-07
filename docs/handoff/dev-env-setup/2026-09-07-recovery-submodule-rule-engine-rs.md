# Recovery 2026-09-07: rule-engine-rs 子模块初始化（其余两个本次跳过）

## 背景

2026-09-07 把 `https://github.com/eleihu6-rgb/ROIs-Recovery-Ver1.git`
重新 clone 到本机 `~/dev/recovery/`。`.gitmodules` 里登记了 3 个子模块：

| 子模块 | URL | 本次是否 init |
|--------|-----|---------------|
| `rule-engine-rs` | `https://github.com/yuanzhu-ai/rois-rule-engine-rs.git` | ✅ 已 init |
| `pbs-optimization-report` | `https://github.com/yuapply/Flair_PBS_Optimization_Report` | ⏸️ 跳过 |
| `pbs-engine` | `git@github.com:yuapply/PBS_column_based_algorithm.git` | ⏸️ 跳过 |

按 CLAUDE.md §Current F8 Engine Scope，本轮 recovery 范围只需要
active legality engine `rule-engine-rs`；另两个不在 F8 当前交付范围
（`pbs-optimization-report` 是文档/报告，`pbs-engine` 是 active PBS 优化
引擎，但本机本次不动 PBS 优化路径，故一并跳过）。

## 认证问题与解决

`rule-engine-rs` 是私有仓库，`https://` 形式直接 clone 会要求 GitHub 用户名：

```
fatal: could not read Username for 'https://github.com'
```

本机现状：
- `~/.ssh/id_ed25519`（9-02 本地生成）未注册到任何 GitHub 账号，`ssh -T git@github.com` 返回 `Permission denied (publickey)`。
- 没有 GitHub PAT，`gh` 未登录。

**最终采用：为本 workstation 生成专用 ed25519 key 并切 SSH URL。**

```bash
# 1. 生成 key（无 passphrase，本机单用户）
ssh-keygen -t ed25519 \
  -C "yuan.z@local for github.com/rois-recovery" \
  -f ~/.ssh/github_recovery -N "" -q

# 2. 写 SSH config，把 github.com 锁到新 key（避免误用 id_ed25519）
cat > ~/.ssh/config <<'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/github_recovery
    IdentitiesOnly yes
    StrictHostKeyChecking accept-new
EOF
chmod 600 ~/.ssh/config

# 3. 切换子模块 URL 到 SSH 形式（同步改 .gitmodules 和 .git/config）
cd ~/dev/recovery
git submodule set-url rule-engine-rs \
  git@github.com:yuanzhu-ai/rois-rule-engine-rs.git

# 4. 用户手动把 ~/.ssh/github_recovery.pub 加到 GitHub 账号 yuanzhu-ai 的 SSH keys

# 5. init
git submodule update --init rule-engine-rs
```

## 验证

```bash
$ ssh -T -i ~/.ssh/github_recovery git@github.com
Hi yuanzhu-ai! You've successfully authenticated, but GitHub does not provide shell access.

$ git submodule status rule-engine-rs
 a2ac567ec543d030dfa534d4d3cb6c455d3e64fe rule-engine-rs (remotes/origin/done/codex/roster-ground-dp-min-34-ga2ac567)

$ ls rule-engine-rs/
Cargo.lock  Cargo.toml  README.md  py  ro-tests  src  tests
```

HEAD `a2ac567` 落在 `done/codex/roster-ground-dp-min-34-ga2ac567` 归档分支
（CLAUDE.md「已合并分支归档规则」归档的分支），符合预期。

## 注意事项

- **`pbs-engine` 已经是 SSH URL**，未来要用同一个 `github_recovery` key 即可 init，
  `yuanzhu-ai` 账号必须对 `yuapply/PBS_column_based_algorithm` 有访问权。
- **`pbs-optimization-report` 仍是 HTTPS URL**，且属于 `yuapply/` 组织——和 `rule-engine-rs`
  的 `yuanzhu-ai/` 不是同一账号，未来 init 前需要确认有访问权的人是谁，并准备对应凭据
  （PAT 或 `gh` 登录态）。本机 SSH key 对 `yuapply/` 不保证可用。
- 重新跑 `git submodule update --init` 时若再次要求用户名，说明 URL 没切对——
  检查 `git config -f .gitmodules --get submodule.<name>.url` 和
  `git config --get submodule.<name>.url` 是否一致且为 SSH 形式。
- 本机 `~/.ssh/id_ed25519` 没动，仍是空权限 key；若新工作流要共用，单独配置 Host 块
  或换走 SSH config aliases，不要删旧 key（可能别的工具有用）。
- SSH config 的 `IdentitiesOnly yes` 很重要——没有它，ssh-agent 或 ssh 默认会按顺序
  尝试所有 key，`id_ed25519` 会被先试然后失败，导致迷惑性错误。

## 关联

- 项目规范：`CLAUDE.md` §Current F8 Engine Scope
- `.gitmodules`、`~/dev/recovery/.git/config` 中 `submodule.rule-engine-rs.url`
- 公钥已注册到 GitHub 账号：`yuanzhu-ai`（私钥 `~/.ssh/github_recovery`，mode 600）
