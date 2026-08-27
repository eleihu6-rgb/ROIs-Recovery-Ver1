# Pairing Search Preview Mapper 性能重构回归测试案例

日期：2026-06-12  
范围：PBS Server pairing search preview / details 结果映射，覆盖 PBS Portal Search Pairings 结果卡片。

## 前置条件

- 测试环境连接可用的远程 PBS / live 数据库。
- 当前账号可访问 PBS Portal Pairing Search 页面。
- live schema 中至少存在包含多 duty、多 segment、跨日或跨月的 pairing。

## 操作步骤与预期结果

1. 在 Pairing 主页面通过单个 property 点击 eye 进入 search preview。
   - 预期：preview 请求成功返回。
   - 预期：summary、pagination、pairing card 数量正常。
   - 预期：pairing number、base、report time、total block、total credit 与重构前语义一致。

2. 在 Search Pairings 页面执行 criteria preview。
   - 预期：结果卡片中的 legs 表格按 duty / segment 顺序展示。
   - 预期：同一 duty 的 FDP / F/H / D/H / CRD 只在该 duty 第一段显示，后续 segment 留空。
   - 预期：flight number、DPS、ARS、DEP、ARR、BLKT、EQP 正常。

3. 打开 Current Rules preview。
   - 预期：current tier 的匹配结果与单 property / criteria preview 一致使用同一结果映射。
   - 预期：空结果时不报错，返回空列表和正确分页。

4. 搜索一个 base 时区不是 UTC、且 duty 覆盖跨本地日期的 pairing。
   - 预期：DATE / REPORT / DEP / ARR 使用 pairing base 时区。
   - 预期：右侧 active dates 覆盖所有 duty 日期，不漏掉跨日日期。

5. 打开 Pairing Details 复用入口。
   - 预期：details 结果与 preview card 的 pairing number、legs、active dates 一致。
   - 预期：重复 pairing target 不导致重复 details card。

## 异常与边界场景

- 无匹配结果时不加载 segments，页面显示空结果。
- 无法解析时间或缺失分钟字段时，相关时间字段显示既有 fallback，不抛异常。
- 非法 periodCode 仍返回既有校验错误，不因为 mapper 拆分改变错误消息。

## 回归范围

- `/api/pairing-search/preview`
- `/api/pairing-search/details`
- Search Pairings 结果卡片。
- Pairing 主页面 eye preview。
- Current Rules preview。

## 自动化验证

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test -- --run src/services/pairing-search/pairing-search-service.test.ts src/services/pairing-search/pairing-search-condition-builder.test.ts src/routes/pairing-search.test.ts
npm test
npm run build
```
