# PBS 左侧日历性能优化与 PBS 代码清理设计

日期：2026-05-07  
作者：Codex + lei  
状态：已确认，准备实施

## 背景

用户明确反馈 PBS 左侧 `BIDDING CALENDAR` 相关操作接口非常慢，没有稳定满足 2 秒内完成的要求。同时希望进行一轮性能优化、代码简化，并清理没有使用的僵尸文件。

本轮清理范围只限 PBS 相关模块，不做全仓库激进清理。

## 目标

1. 左侧日历相关接口和操作稳定低于 2 秒。
2. 优先优化真实慢链路，不用假 loading 掩盖后端慢。
3. 补齐左侧日历性能基线，让后续回归能覆盖核心接口。
4. 清理 PBS 范围内明确无用的文件、临时文件、无引用代码。
5. 简化本轮触达的 PBS 代码，降低维护负担。
6. 不改变已确认的 Pairing / Days Off / Tier 业务语义。

## 范围

### 包含

- `pbs-portal`
  - 左侧 `BIDDING CALENDAR` 查询、保存、刷新链路。
  - `DashboardSchedulePanel`、`SharedBiddingWorkbenchLayout`、calendar hooks、calendar services。
  - PBS 相关无用文件和触达代码清理。

- `pbs-server`
  - `/api/bidding-calendar/current`
  - `/api/calendar-days-off/current`
  - `/api/calendar-days-off/current/dates`
  - Pairing 日历 add/edit/delete 后会触发的相关 draft/calendar 查询。
  - PBS 性能 baseline 脚本。

- `packages/contracts`
  - 仅 PBS contract 中被本轮触达且明确需要调整的部分。

- `docs`
  - 本轮 spec、dev-context。

### 不包含

- 不清理 `gantt`、`live-server`、`rule-engine`、`po-engine`、`ro-engine` 等非 PBS 模块。
- 不重构非 PBS 页面。
- 不改数据库 schema，除非性能定位证明必须新增索引；如需索引必须另行说明并走 migration。
- 不删除后端兼容接口，例如整份 `PUT /current`。
- 不移除业务校验换速度。
- 不引入新依赖。

## 当前初步发现

只读测量 3002 后端本体发现：

- `GET /api/bidding-calendar/current`
  - 冷启动约 `1567ms`
  - 第二次约 `795ms`
  - 后续约 `168ms`
- `GET /api/calendar-days-off/current`
  - 冷启动约 `670ms`
  - 后续约 `168ms`
- `GET /api/pairing-bids/current`
  - 冷启动约 `1168ms`
  - 后续约 `166-326ms`
- `POST /api/pairing-search/preview` 精确 pairing number 查询约 `335-508ms`

现有 `pbs-server npm run perf:pbs` 未覆盖 `GET /api/bidding-calendar/current`，而这是左侧日历核心接口。

前端左侧日历操作可能还会在一次保存后触发多个 query invalidate/refetch，因此用户感知慢可能来自：

- 单个后端接口慢。
- 后端冷启动或缓存未命中慢。
- 前端串行等待多个刷新。
- 不必要的重复 refetch。

## 设计方案

### 1. 先补性能基线

扩展 PBS 性能 baseline，让它覆盖左侧日历核心读取：

- `GET /api/bidding-calendar/current`
- `GET /api/calendar-days-off/current`
- `GET /api/pairing-bids/current`

后续根据实现风险，考虑补充安全的写入基线：

- `PATCH /api/calendar-days-off/current/dates`

写入基线必须避免污染用户真实数据。若需要执行真实 mutation，应优先设计可回滚或使用测试 draft 的脚本，不直接拿用户当前草稿做破坏性压测。

### 2. 定位左侧日历慢链路

后端侧：

- 查看 `/api/bidding-calendar/current` 内部是否仍有重复 live schema 探测、N+1 查询、重复加载 draft、重复加载 pairing occurrences。
- 检查 planned absence 数据源不可用缓存是否仍有效。
- 检查 calendar days off patch 是否走了局部 patch 快路径。

前端侧：

- 梳理左侧日历保存后 invalidate/refetch 链路。
- 确认保存按钮是否等待非关键 query 完成后才恢复。
- 保留必要同步：左侧日历、Pairing draft、Tier summary 不能出现数据不一致。
- 将可后台刷新的 query 改为后台 invalidate，不阻塞用户操作完成。

### 3. 性能优化原则

- 优先减少实际数据库往返和重复 refetch。
- 能复用已有缓存就复用已有缓存。
- 后端不能为了代码形式简洁牺牲 SQL 性能。
- 前端不能通过提前关闭弹窗但后端仍慢来假装性能提升。
- 对 mutation 保留 `draftVersion` 并发保护。
- 对 Pairing / Days Off 保留冲突校验。

### 4. PBS 僵尸文件与无用代码清理

清理规则：

- 明确无用的 `.DS_Store` 等系统临时文件可以删除。
- 删除无引用文件前必须用 `rg` 或 TypeScript 编译确认。
- 名称里有 `mock`、`legacy`、`compatibility` 不代表废弃；必须确认无业务责任。
- 只删除 PBS 范围文件。
- 如果发现非 PBS 僵尸文件，只记录，不删除。

优先候选：

- `pbs-portal/src/**/.DS_Store`
- `pbs-server/src/**/.DS_Store`
- PBS 范围内无引用的临时 helper、测试残留或旧 mock 分支。

### 5. 代码简化边界

本轮只简化触达代码：

- 左侧日历 hook/service/refetch 逻辑。
- 后端 calendar service 性能相关 helper。
- PBS 性能脚本 endpoint 定义。

不做大范围重构：

- 不重写 `DashboardSchedulePanel`。
- 不拆后端大 service 架构。
- 不迁移目录结构。

## 验收标准

1. `GET /api/bidding-calendar/current` 纳入性能 baseline。
2. 左侧日历核心接口连续样本 max `< 2000ms`。
3. 左侧日历保存类操作用户感知完成时间稳定 `< 2000ms`，目标 `500ms-1500ms`。
4. Pairing add/edit/delete 后左侧日历和右侧 draft 仍同步。
5. Days Off calendar patch 仍保留冲突校验和 `draftVersion` 保护。
6. PBS 范围内明确无用文件被清理。
7. 非 PBS 文件不被本轮清理。
8. 不新增依赖，不改数据库结构。
9. 不引入 `Layer/Lx` 术语。
10. `npm run verify:pbs` 通过。
11. `git diff --check` 通过。

## 验证计划

实施前后都需要对比：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm run perf:pbs -- --base-url=http://localhost:3002 --samples=5 --budget-ms=2000
```

实施后：

```bash
cd /Users/lei/Codehub/rois-ai
npm run verify:pbs
git diff --check
```

必要时补充前端针对左侧日历刷新链路的组件测试，确保不出现保存后数据不同步。

## 风险与控制

- 风险：误删仍被测试或运行时动态使用的文件。  
  控制：删除前先做引用搜索，删除后跑 `verify:pbs`。

- 风险：前端减少等待后导致 UI 数据短暂不一致。  
  控制：只把非关键刷新后台化，必要同步仍保留。

- 风险：后端接口冷启动仍接近 2 秒。  
  控制：把冷启动样本纳入 baseline，优先消除重复探测和无必要串行查询。

- 风险：性能脚本写入污染真实草稿。  
  控制：本轮先补读接口 baseline；写接口压测需要可回滚设计后再执行。
