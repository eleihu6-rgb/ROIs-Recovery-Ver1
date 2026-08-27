# data-migration 模块 — AI / 开发者速览

## 必读运维细节

- **`flight.interface_flt_id`**：与 F8 客户 **`fltId` 一致**（唯一外键，不再使用 `fltId_YYYYMMDD`）。改规则后需 **重导受影响日期区间的 Flight**，并再跑 Pairing / RosterFlight 回填 `flt_id`。详见设计文档 **§9.2**。

- **Flight 同步与 Navblue**：按日期拉取 Flight 时，若单次请求跨度较大，上游可能返回 **HTTP 500**；客户端会记 warning 并返回空列表，**`sync_flight` 的 JSON 结果里不一定有 warnings**。补跑时请 **先拆 5 天，再必要时按单日** 调用 `sync_flight(start, end)`。完整说明、示例与与 `SYNC_CHUNK_DAYS` 的关系见：

  **`docs/2026-05-07-f8-data-migration-design.md` → 章节「9.2.1 Flight 拉取：Navblue HTTP 500 与补跑策略」**

## 其它

- 根目录 `AGENTS.md` / `CLAUDE.md` 为全仓库规范；本目录实现以 `config.py`、`.env.example` 及 `docs/` 下设计文档为准。
