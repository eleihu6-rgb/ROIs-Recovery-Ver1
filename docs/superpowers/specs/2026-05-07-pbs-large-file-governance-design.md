# PBS 大文件治理设计

日期：2026-05-07  
作者：Codex + lei  
状态：已批准，第一批已完成

## 背景

PBS 模块已经出现多个 500 行以上、甚至 1500 行以上的大文件。用户担心这些文件继续累积后会演变成难以维护的代码山，因此需要启动一轮 PBS 大文件治理。

本治理不是为了追求单纯的行数下降，而是为了降低后续改动风险、让职责边界更清楚、让测试更容易定位回归问题。

## 目标

1. 盘点并治理 PBS 范围内的大文件。
2. 优先处理运行时代码，其次处理测试和 mock 文件。
3. 保持现有业务语义、接口契约、UI 行为不变。
4. 拆分后必须有回归测试兜底，不能因为重构破坏功能。
5. 建立后续维护红线，避免新功能继续堆到单个大文件。

## 范围

### 包含

- `pbs-portal`
  - 运行时页面、组件、mapper、service、mock、测试。
- `pbs-server`
  - route、service、script、测试。
- `packages/contracts`
  - PBS 相关 contract；仅在拆分需要时整理，不改契约语义。

### 不包含

- 非 PBS 模块，例如 `gantt`、`live-server`、`rule-engine`、`po-engine`、`ro-engine`。
- 数据库 schema / migration，除非后续发现必须配合修复明确问题。
- 新依赖。
- 为了重构而改变产品交互、API 响应、校验规则或错误文案。

## 核心原则

### 行数是信号，不是目标

大文件需要被审视，但不能为了减少行数硬拆。

如果一个文件虽然有 700-1500 行，但它的 DOM 结构、业务流程和阅读路径是连续的，拆开后会导致开发者频繁跨文件跳转、上下文更碎，那么不强制拆。此类文件可以选择：

- 保留主体文件。
- 只抽出清晰的纯函数、常量、类型或无状态子组件。
- 在文件内整理段落顺序和命名，让阅读路径更稳定。
- 标记为“可接受大文件”，并记录保留理由。

### 优先拆职责混杂

优先处理同时承担多类责任的文件，例如：

- UI 渲染 + 业务计算 + API mutation + cache 同步 + 数据解析混在一起。
- 后端 service 同时负责 catalog、draft normalization、校验、持久化、事务、错误格式化。
- 测试文件同时覆盖多个大流程，失败时难以定位。

### 行为不变

本轮是结构治理，不是产品改造。

- 不改变 Pairing、Days Off、Tier 的业务语义。
- 不改变 stable id/key、draftVersion、并发冲突保护。
- 不改变左侧 `BIDDING CALENDAR` 的共享工作台语义。
- 不引入 `Layer/Lx` 术语。

## 大文件清单

当前 PBS 运行时代码里需要纳入治理视野的文件：

| 文件 | 当前行数 | 初步分类 |
| --- | ---: | --- |
| `pbs-server/src/services/pairing/pairing-bid-service.ts` | 1833 | 高优先级，职责混杂 |
| `pbs-server/src/services/days-off/days-off-bid-service.ts` | 1786 | 高优先级，职责混杂 |
| `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx` | 1551 | 高优先级，但需避免硬拆 DOM |
| `pbs-portal/src/features/pairing/components/pairing-bid-control.tsx` | 945 | 中高优先级，控件与解析逻辑可分离 |
| `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx` | 909 | 中高优先级，面板状态和子视图可分离 |
| `pbs-server/src/services/calendar/bidding-calendar-service.ts` | 876 | 中高优先级，calendar mapper/merge/conflict 可分离 |
| `pbs-server/src/services/lineholder/shared.ts` | 807 | 中优先级，需先确认共享职责 |
| `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx` | 786 | 中优先级 |
| `pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx` | 712 | 中优先级 |
| `pbs-portal/src/features/pairing/components/pairing-search-panel.tsx` | 687 | 中优先级 |
| `pbs-portal/src/features/pairing/mock.ts` | 668 | 低优先级，仍被引用，不是僵尸文件 |
| `pbs-server/src/scripts/pbs-performance-baseline-core.ts` | 601 | 低优先级，脚本配置可后置 |
| `pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts` | 596 | 中优先级，纯 mapper 可按领域拆 |
| `pbs-server/src/services/calendar/calendar-days-off-service.ts` | 515 | 中优先级 |
| `pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts` | 503 | 中优先级 |

测试大文件也纳入后续治理，但不作为第一刀：

- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`
- `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
- `pbs-portal/src/features/rule-bids/utils.test.ts`

## 分批方案

采用“全量纳入治理、按业务链路分批落地”的方案。

### 第一批：左侧日历和 Pairing calendar 链路

目标文件：

- `dashboard-schedule-panel.tsx`
- `bidding-calendar-service.ts`
- `bidding-calendar-mappers.ts`
- 必要时触达相关测试。

治理方向：

- 抽出日历 days off 纯计算 helper。
- 抽出 pairing calendar detail 解析和展示数据构造。
- 抽出 query invalidation / mutation helper。
- 后端拆出 pairing event merge、metadata parse、day off conflict helper。
- 对 DOM 连续且阅读清楚的区域保持主体结构，不为行数硬拆。

回归重点：

- 左侧日历读取、Days Off patch、Pairing add/edit/delete。
- 一个格子一个蓝条、重复合并、多 pairing 一次添加。
- `perf:pbs --budget-ms=2000` 仍通过。

### 第二批：Pairing bid 保存链路

目标文件：

- `pairing-bid-service.ts`
- `pairing-bid-control.tsx`
- `pairing-right-panel.tsx`
- Pairing 页面相关测试。

治理方向：

- 后端按 catalog、request normalization、rule validation、specific-date merge、day-off conflict、write sync 分离。
- 前端把 bid value 解析、输入控件、autocomplete、右侧面板状态分离。
- 保留现有组件视觉和交互顺序。

回归重点：

- Pairing property add/patch/delete。
- Favorite、specific-date pairing、Tx 编辑。
- AA 文档对齐后的 Pairing detail 展示不回退。

### 第三批：Days Off bid 保存链路

目标文件：

- `days-off-bid-service.ts`
- `calendar-days-off-service.ts`
- Days Off 相关前端和测试。

治理方向：

- 拆出 catalog、draft property load、tier sync、stable save、date patch 相关 helper。
- 确保 `draftVersion`、冲突校验和局部 patch 快路径不丢失。

回归重点：

- Days Off add/patch/delete/save。
- 左侧日历冲突阻止。
- 与 Pairing specific-date 的冲突保护。

### 第四批：剩余 500-900 行文件与测试拆分

目标文件：

- `lineholder/shared.ts`
- `search-pairings-page.tsx`
- `rule-bid-right-panel.tsx`
- `pairing-search-panel.tsx`
- `pairing/mock.ts`
- 大测试文件。

治理方向：

- 只拆职责明确的部分。
- mock 文件优先拆 seed/factory，而不是删除。
- 测试按用户流程拆文件，减少单个测试文件上下文负担。

## 可接受保留标准

文件满足以下条件时，可以在本轮不强拆：

1. 文件虽然大，但职责单一，阅读顺序自然。
2. 大部分行数来自连续 UI DOM、表格列定义、静态配置或测试数据。
3. 拆分会显著增加 props 传递、状态穿透或跨文件跳转。
4. 已有测试覆盖充分，近期改动风险可控。
5. 在治理记录中写明保留理由和后续观察点。

## 测试要求

每一批改动完成后都必须执行对应验证。

前端：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test
npm run lint
npm run build
```

后端：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test
npm run build
```

跨模块：

```bash
cd /Users/lei/Codehub/rois-ai
npm run verify:pbs
```

涉及左侧日历性能链路时补充：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm run perf:pbs -- --base-url=http://127.0.0.1:3002 --samples=5 --budget-ms=2000
```

测试新增或调整原则：

- 抽纯函数时优先补轻量 unit test。
- 拆 UI 组件时保留原有用户流程测试，必要时增加关键交互测试。
- 拆 service helper 时补 service 层测试或保留现有 route/service 测试覆盖。
- 不为了拆分删除断言。

## 验收标准

1. PBS 大文件治理清单被纳入文档。
2. 每批改动都有明确目标文件、拆分边界和回归范围。
3. 不为了行数减少硬拆结构清晰的文件。
4. 第一批完成后，核心左侧日历和 Pairing calendar 功能不回退。
5. 第二批完成后，Pairing bid 保存链路不回退。
6. 第三批完成后，Days Off bid 保存链路不回退。
7. 第四批完成后，剩余大文件要么拆分，要么记录可接受保留理由。
8. 每批必须通过对应测试；最终必须通过 `npm run verify:pbs`。

## 实施顺序

1. 先完成第一批左侧日历和 Pairing calendar 链路治理。
2. 每批完成后保存开发上下文，记录已拆文件、保留文件和验证结果。
3. 下一批开始前先查看工作树和上一批上下文，不覆盖未提交改动。
4. 如果某一批发现拆分会改变行为，停止并重新确认设计。
