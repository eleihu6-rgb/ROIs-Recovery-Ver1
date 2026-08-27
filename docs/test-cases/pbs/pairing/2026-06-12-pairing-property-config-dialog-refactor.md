# Pairing 配置弹窗拆分回归测试案例

日期：2026-06-12  
范围：PBS Portal Pairing 页面配置弹窗，覆盖普通 Pairing bid、Pairing Number、specific-date run、favorite 保存。

## 前置条件

- PBS Portal 可正常访问 Pairing 页面。
- 当前 bid period 有 Pairing Number 可搜索结果，且至少一个 pairing number 存在多个 origin date。
- 当前账号有可编辑 tier 和 Pairing available properties。

## 操作步骤与预期结果

1. 打开 Pairing 页面，从 Available Properties 添加普通 property。
   - 预期：弹窗标题、property name、tiers、action、quantifier、bid control 正常显示。
   - 预期：未满足必填项时确认按钮禁用，满足后可保存。

2. 配置支持 credit priority 的 Pairing bid。
   - 预期：Higher / Lower credit priority 可切换。
   - 预期：修改 bid value 后已选 credit priority 不丢失。

3. 配置 Pairing Number entire-month bid。
   - 预期：Pairing Number 输入后显示 bid mode。
   - 预期：多个 pairing number 可在 entire-month 模式下多选。
   - 预期：保存 payload 使用 pairing-id-list，label 与展示一致。

4. 配置 Pairing Number specific-date bid。
   - 预期：切换 specific date 后加载 run dates。
   - 预期：可添加多个 confirmed runs，重复点击不产生重复项。
   - 预期：可移除 confirmed run，全部移除后确认按钮禁用。

5. 保存 configured favorite。
   - 预期：Save Favorite pending 时取消、保存、确认按钮状态正确。
   - 预期：保存 favorite 不直接加入 existing bids。

6. 编辑 existing Pairing bid。
   - 预期：弹窗打开时 draft 从当前 bid 克隆，取消不污染原始 bid。
   - 预期：确认后列表展示和服务端保存结果一致。

## 异常与边界场景

- Pairing run 查询 loading / error / empty 状态文案正常。
- 只有一个 pairing number 时不显示多选 chip，但 mode 切换仍可用。
- 只剩一个 active tier 时再次点击该 tier 不应让 tiers 为空。

## 自动化验证

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- --run src/features/pairing/pages/pairing-page.test.tsx src/features/pairing/components/pairing-bid-control.test.tsx
npm run lint
npm run build
```

## 全量回归

```bash
cd /Users/lei/Codehub/rois-ai
set -a; source pbs-server/.env; set +a; SOURCE_DATABASE_URL="$DATABASE_URL" TARGET_DATABASE_URL="$DATABASE_URL" npm run verify:pbs
```
