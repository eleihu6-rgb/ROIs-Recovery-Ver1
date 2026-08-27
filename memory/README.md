# ROIS-AI MemPalace 使用说明

## 用途

这套工具只用于 **开发侧记忆**：

- 挖掘仓库里的代码、文档、SQL
- 搜索历史决策和实现内容
- 给 AI / Agent 生成启动上下文

## 覆盖范围

会挖掘以下目录：

- `docs/`
- `doc/`
- `sql/`
- `gantt/`
- `live-server/`
- `pbs-server/`
- `pbs-portal/`
- `pbs-app/`
- `rule-engine/`
- `po-engine/`
- `ro-engine/`

## 首次使用

### 1. 安装

```bash
cd /Users/lei/Codehub/rois-ai
./scripts/memory/install-mempalace.sh
```

### 2. 检查环境

```bash
./scripts/memory/doctor-rois-ai.sh
```

### 3. 初始化 palace

```bash
./scripts/memory/init-rois-ai-palace.sh
```

### 4. 先预览要挖什么

```bash
./scripts/memory/mine-rois-ai.sh --dry-run
```

### 5. 正式挖掘

```bash
./scripts/memory/mine-rois-ai.sh
```

## 日常使用

### 搜索

```bash
./scripts/memory/search-rois-ai.sh "why did we move to /login?token"
```

### 生成启动上下文

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
./scripts/memory/wakeup-rois-ai.sh pbs
./scripts/memory/wakeup-rois-ai.sh gantt
./scripts/memory/wakeup-rois-ai.sh live-server
./scripts/memory/wakeup-rois-ai.sh engines
```

### 更新记忆

```bash
./scripts/memory/mine-rois-ai.sh
```

### 模版--复制到剪切板

```bash
cat <<EOF | tee /dev/tty | pbcopy
这是 rois-ai 项目的已有上下文，请先阅读并基于它继续：

$(./scripts/memory/wakeup-rois-ai.sh pbs)

当前我要处理的任务是：
[在这里写你的任务]

要求：
1. 先基于已有上下文理解项目
2. 如果上下文不够，再结合仓库代码继续判断
3. 不要重复做已经明确否定的方案
EOF
```

## 目录说明

- `memory/.venv`：本地 Python 环境
- `memory/.palace`：本地记忆库
- `scripts/memory/install-mempalace.sh`：安装 MemPalace
- `scripts/memory/doctor-rois-ai.sh`：检查环境
- `scripts/memory/init-rois-ai-palace.sh`：初始化 palace
- `scripts/memory/mine-rois-ai.sh`：挖掘仓库内容
- `scripts/memory/search-rois-ai.sh`：搜索记忆
- `scripts/memory/wakeup-rois-ai.sh`：生成启动上下文

## 常见问题

### 搜不到内容

先确认是否已经真正执行过：

```bash
./scripts/memory/mine-rois-ai.sh
```

### 命令找不到

重新执行：

```bash
./scripts/memory/install-mempalace.sh
```

### 环境检查失败

重新执行：

```bash
./scripts/memory/doctor-rois-ai.sh
```
