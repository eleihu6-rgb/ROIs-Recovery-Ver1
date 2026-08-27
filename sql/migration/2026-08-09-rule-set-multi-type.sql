-- 2026-08-09: Rule Set 支持多类型（LIVE/PBS/RO 逗号分隔串）。
-- 背景：一套法规集可同时用于 LIVE/PBS/RO，F8 只需维护 P/C 两套。
-- type 由 varchar(4) 扩宽到 varchar(20)；存量单值数据无需改动。
ALTER TABLE workset ALTER COLUMN type TYPE varchar(20);

-- 部分唯一索引对多值语义失效（LIVE 与 LIVE,PBS 都声称 LIVE 却字符串不同，索引拦不住；
-- 仍会误挡“同字符串同 division 两个启用集”造成误导）。互斥改由应用层逐 type 校验（POST/PATCH）。
DROP INDEX IF EXISTS uq_workset_enabled_rule_type_division;
CREATE INDEX IF NOT EXISTS idx_workset_rule_type_division
  ON workset (type, division) WHERE category = 'RULE';
