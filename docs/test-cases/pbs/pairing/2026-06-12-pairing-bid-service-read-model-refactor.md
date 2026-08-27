# Pairing Bid Service 读模型拆分回归测试案例

日期：2026-06-12  
范围：PBS Server Pairing current draft 读取、draft properties 聚合、configured favorites 读取。

## 前置条件

- PBS Server 使用远程数据库环境变量运行回归脚本。
- 当前账号存在 Pairing current draft。
- draft 中至少包含一个多 tier property、一个 Pairing Number specific-date occurrence-list property、一个 configured favorite。

## 操作步骤与预期结果

1. 调用 `GET /api/pairing-bids/current`。
   - 预期：返回 draft identity、periodCode、remarks、properties、propertyCatalog、favoriteProperties、favoritePropertyCodes。
   - 预期：多 tier property 聚合为一个 property，tiers 按既有格式返回。

2. 检查 Pairing Number occurrence-list property。
   - 预期：occurrence rows 正确映射回 bid。
   - 预期：originDate、pairingId、occurrenceId、pairingNumber 不丢失。

3. 检查 configured favorites。
   - 预期：favoriteKey、propertyId、propertyCode、name、action、quantifier、bid、tiers 正常返回。
   - 预期：tiers 为空或 catalog 缺失的数据不会进入 favoriteProperties。

4. 新增、编辑、删除 Pairing property 后再次读取 current draft。
   - 预期：draftVersion 更新策略不变。
   - 预期：读模型反映最新 properties。

5. 保存 configured favorite 后再次读取 current draft。
   - 预期：favoriteProperties 和 favoritePropertyCodes 包含新 favorite。
   - 预期：保存 favorite 不直接改变 existing properties。

## 异常与边界场景

- 未找到 current draft 时仍返回 empty draft 和完整 catalog。
- Unsupported property code 在读取时跳过，不应导致整个 current draft 失败。
- 多个 occurrence rows 应按 propertyGroupKey 归属到对应 property，不应串到其他 property。

## 自动化验证

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test -- --run src/routes/pairing-bids.test.ts
npm run build
```

## 全量回归

```bash
cd /Users/lei/Codehub/rois-ai
set -a; source pbs-server/.env; set +a; SOURCE_DATABASE_URL="$DATABASE_URL" TARGET_DATABASE_URL="$DATABASE_URL" npm run verify:pbs
```
