# PBS Search Pairings 标题结构调整设计

日期：2026-04-24
作者：Codex
状态：已实现

## 背景

当前 `/pairing/search` 右侧页面出现三处标题：

- 顶部 `SEARCH PAIRINGS`
- 条件区 `SEARCH CRITERIA`
- 结果区前的 `SEARCH PAIRINGS`

其中只有 `SEARCH CRITERIA` 和结果列表区域承载明确业务内容。顶部 `SEARCH PAIRINGS` 实际是页面主标题，但现在使用了和业务 section 相同的视觉样式，容易让用户误以为它下面还缺少一块内容。

## 目标

将 `/pairing/search` 调整为更清晰的两层结构：

- 顶部保留弱化的页面标题，用于说明当前模块是 Search Pairings
- 业务 section 保留 `SEARCH CRITERIA`
- 结果 section 改名为 `SEARCH RESULTS` 或同等语义，承载统计、操作按钮和 pairing 结果卡片

## 范围

本次只调整 `/pairing/search` 右侧内容区标题结构与文案，不改变：

- 单条 property preview 查询链路
- mock fallback 行为
- 后端接口
- pairing result card
- mini calendar
- `BID THESE PROPERTIES`
- `ADD MORE SEARCH CRITERIA`

## 验收标准

- 顶部页面标题不再像一个空业务 section
- 页面中保留清晰的 `SEARCH CRITERIA`
- 结果区域标题明确表达结果含义，不再与页面标题重复
- 现有 Search Pairings 页面测试更新并通过
