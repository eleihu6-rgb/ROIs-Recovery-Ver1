# PBS Favorite 卡片编辑与展示重设计实施计划

## 目标

依据 `docs/superpowers/specs/2026-07-27-pbs-favorite-card-edit-redesign-design.md`，
让 Days Off、Pairing、Line Favorite 可编辑，并统一卡片的信息层级、临时 Tx 与 Add 操作。

## 步骤

1. **补齐契约与后端 PATCH**
   - 为 Days Off、Line 增加按 `favoriteKey` 的 PATCH contract、route 和 service。
   - Pairing PATCH 对齐身份不可变、strict no-tiers、审计与 draftVersion 语义。
   - 验证：三类 route/service focused tests。

2. **统一前端 Favorite 编辑数据流**
   - 三类 service 暴露 PATCH。
   - 配置弹窗增加 Favorite edit 模式，隐藏 Tx，使用 `UPDATE FAVORITE`。
   - PATCH 成功先合并最新 draft meta，再刷新卡片。
   - 验证：service、mapper、page tests。

3. **重设计 Favorite 卡片**
   - Header：名称、Preview（Pairing）、Edit、Delete。
   - Body：`CONDITION` 自然语言摘要。
   - Footer：`SELECT TX`、T1–T7、`ADD TO BID`。
   - Pending 纳入统一 draft 结构写入边界。
   - 验证：组件测试、UI gate。

4. **错误恢复与路由状态**
   - 409 reload 使用服务端模板替换本地未提交内容。
   - 404 reload 移除卡片并清理临时 Tx。
   - Pairing Preview 往返保留同 draft/period 临时 Tx。
   - 验证：page tests、Playwright。

5. **交付验证**
   - 更新 QA 文档与 Help。
   - 运行 focused tests、完整 Portal tests、PBS Server tests、Playwright、lint、build、
     `npm run check:ui`、`git diff --check`、GitNexus detect-changes。
   - 不主动提交 Git，等待用户明确要求。
