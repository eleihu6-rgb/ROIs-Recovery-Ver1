# LINE_RULES 导出拆分回归测试案例

日期：2026-06-12  
范围：PBS Server Algorithm Export 中 `LINE_RULES.csv` 与 `LINE_RULES.md` 的导出 contract。

## 前置条件

- PBS Server 使用远程数据库环境变量执行导出或回归脚本。
- 当前 bid period 存在 Line、DaysOff、Reserve 类型的 current bid 数据。
- 测试账号包含至少一个 supported line rule、一个 DaysOff line-level rule、一个 Reserve short call type whole-month rule。

## 操作步骤与预期结果

1. 触发 algorithm export package 生成。
   - 预期：导出包包含 `LINE_RULES.csv` 和 `LINE_RULES.md`。
   - 预期：文件名、列名、顺序与重构前一致。

2. 检查 `LINE_RULES.csv` 的重复规则聚合。
   - 预期：同 crew、code、rule、params 的重复命中按 T1-T7 counter 聚合。
   - 预期：不同 params 不被错误合并。

3. 检查 DaysOff 规则映射。
   - 预期：Code_ID 202 / 203 / 205 仍映射为算法 Rule_ID 408 / `COMMUTER_PATTERN`。
   - 预期：204 / 206 保持各自 Rule_ID 与参数结构。

4. 检查 Reserve 规则映射。
   - 预期：Reserve tab whole-month Short Call Type 导出为 Rule_ID 301。
   - 预期：Line tab Reserve 导出为 Rule_ID 427，Parameters_JSON action 分别为 award / avoid。
   - 预期：非 whole-month Reserve call type 不进入 `LINE_RULES.csv`。

5. 检查 `LINE_RULES.md`。
   - 预期：Rule ID 表格仍包含所有 documented code。
   - 预期：Reserve Notes 仍说明 301、410、427 的导出边界。

## 异常与边界场景

- Unsupported Line property code 应通过 skip event 记录，不应让导出失败。
- Tier 小于 1 或大于 7 的数据不应进入 counter。
- CSV cell 中存在逗号、引号或换行时应正确转义。

## 自动化验证

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test -- --run src/services/algorithm-export/line-rules-export.test.ts
npm run build
```

## 全量回归

```bash
cd /Users/lei/Codehub/rois-ai
set -a; source pbs-server/.env; set +a; SOURCE_DATABASE_URL="$DATABASE_URL" TARGET_DATABASE_URL="$DATABASE_URL" npm run verify:pbs
```
