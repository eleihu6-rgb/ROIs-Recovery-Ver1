# Rule Bid Value 契约拆分回归测试案例

日期：2026-06-12  
范围：PBS Server Lineholder Rule Bid value 格式化、序列化、反序列化和深拷贝契约。

## 前置条件

- PBS Server 使用远程数据库环境变量启动或执行测试。
- Rule Bid 页面可创建 Days Off / Line / Reserve 相关 bid。
- 已存在可覆盖普通 text/number/time/date-or-dow/tag-list/reserve date scope 的 property 配置。

## 操作步骤与预期结果

1. 在 Days Off / Line / Reserve 页面分别新增一个普通 Rule Bid。
   - 预期：保存请求 payload 与重构前字段结构一致。
   - 预期：刷新页面后 bid 内容可正常反序列化并显示。

2. 新增或编辑包含 compare operator 的数值 / 时间类 Rule Bid。
   - 预期：operator 与 value 分别保存和读取。
   - 预期：展示文本不丢失符号、不改变顺序。

3. 新增或编辑 date-or-dow 类型 Rule Bid。
   - 预期：具体日期和星期选择均可保存。
   - 预期：再次打开编辑弹窗时，已选日期 / 星期完整恢复。

4. 新增或编辑 reserve date scope Rule Bid。
   - 预期：single / range / days-of-week 等 scope 正常格式化。
   - 预期：clone 后编辑不会污染原始 bid value。

5. 执行收藏、复制配置、删除后重新新增的组合操作。
   - 预期：序列化后的 bid value 不出现共享引用导致的串改。
   - 预期：列表展示文本和保存后的服务端数据一致。

## 异常与边界场景

- 空值、未知 operator、缺失 scope 字段时仍保持既有兜底表现。
- 多选 tag-list 不应因为重复格式化产生重复标签。
- 反序列化 legacy payload 时不改变原有兼容行为。

## 自动化验证

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test -- --run src/services/lineholder/rule-bid-value.test.ts
npm run build
```

## 全量回归

```bash
cd /Users/lei/Codehub/rois-ai
set -a; source pbs-server/.env; set +a; SOURCE_DATABASE_URL="$DATABASE_URL" TARGET_DATABASE_URL="$DATABASE_URL" npm run verify:pbs
```
