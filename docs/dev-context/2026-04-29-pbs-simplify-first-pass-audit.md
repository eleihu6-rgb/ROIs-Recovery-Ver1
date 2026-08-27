# PBS 简化与性能治理第一批审计记录

时间：2026-04-29
范围：`pbs-portal`、`pbs-server`

## 本批目标

- 只处理静态证据明确、影响面小的冗余。
- 不改变 PBS 用户可见功能、接口 contract、稳定身份、draftVersion 或并发语义。
- 修改后通过 PBS 全量回归。

## 已处理项

### 1. 删除 `pbs-portal` 孤立 service

删除文件：

- `pbs-portal/src/shared/services/pbs-service.ts`
- `pbs-portal/src/shared/services/messages-service.ts`
- `pbs-portal/src/shared/services/notices-service.ts`
- `pbs-portal/src/shared/services/user-service.ts`

处理依据：

- `rg` 确认对应导出只在文件自身出现，没有运行时或测试引用。
- 这些文件是早期 `/portal/*` 占位接口 service，当前 PBS 主流程已经使用 `auth-service`、`pairing-service`、`days-off-service`、`line-service`、`layer-service` 等专用 service。
- 删除后 `pbs-portal` lint、build、测试均通过。

### 2. 开启 `pbs-server` unused 编译护栏

修改文件：

- `pbs-server/tsconfig.json`

改动：

- 开启 `noUnusedLocals`
- 开启 `noUnusedParameters`

处理依据：

- `pbs-portal` 已经开启这两个检查。
- `pbs-server` 之前未开启，导致未使用 import / 参数可以通过常规 build。
- 开启后可在后端 build 阶段提前阻止新增死代码。

### 3. 清理 `pbs-server` 可证明未使用项

修改文件：

- `pbs-server/src/app.test.ts`
- `pbs-server/src/services/auth/auth-service.ts`
- `pbs-server/src/services/line/line-bid-service.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
- `pbs-server/src/services/pairing/pairing-bid-service.ts`

处理内容：

- 移除 4 个未使用 type import。
- 删除测试 mock 中未使用的 `actor` 参数。
- 修正 `pbs-server/src/app.ts` 中一处缩进漂移。

处理依据：

- `npx tsc --noEmit --noUnusedLocals true --noUnusedParameters true --pretty false` 首次审计只报告 5 个 unused 问题。
- 清理后 `pbs-server` build 与 unused 检查均通过。

### 4. 拆分 `pbs-portal` 生产 bundle vendor chunk

修改文件：

- `pbs-portal/vite.config.ts`

处理内容：

- 添加 Rollup `manualChunks`：
  - `react-vendor`
  - `query-vendor`
  - `http-vendor`

处理依据：

- 修改前 `pbs-portal` build 提示主入口 chunk 超过 500KB。
- 拆分后主入口 chunk 从约 `544.48KB` 降为约 `416.03KB`，不再触发 500KB 警告。
- 该改动不改变运行时业务逻辑，只改善依赖缓存与入口 chunk 尺寸。

## 暂不处理项

- `pbs-server/src/services/days-off/days-off-bid-service.ts`、`pbs-server/src/services/pairing/pairing-bid-service.ts`、`pbs-server/src/services/pairing-search/pairing-search-service.ts` 仍然偏大，但本批不做服务拆分，避免影响事务边界和 SQL 语义。
- `pbs-portal` 的 Pairing / Rule Bids 大组件仍然偏大，本批不拆组件，后续应先补更细的交互测试再处理。
- Dashboard / Award / Reserve 仍有 mock 数据作为当前页面运行数据，本批不删除，因为运行时仍有引用。

## 验证结果

局部验证：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test
npm run build -- --pretty false
npx tsc --noEmit --noUnusedLocals true --noUnusedParameters true --pretty false

cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test
npm run lint -- --quiet
npm run build
```

结果：

- `pbs-server`：33 tests passed。
- `pbs-portal`：30 test files passed，138 tests passed。
- `pbs-portal` build 通过，主入口 chunk 约 `416.03KB`。

全量 PBS 验证：

```bash
cd /Users/lei/Codehub/rois-ai
PATH="/Users/lei/.nvm/versions/node/v22.21.1/bin:$PATH" npm run verify:pbs
```

结果：

- `pbs-server` test/build/sync dry-run 通过。
- `pbs-portal` test/lint/build 通过。
- `verify:pbs completed`。

注意：

- 仓库根目录 shell 默认没有解析到 `npm`，本次通过补齐 Node `PATH` 执行根验证。
