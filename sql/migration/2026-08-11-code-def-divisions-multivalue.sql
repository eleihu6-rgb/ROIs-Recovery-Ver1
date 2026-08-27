-- 2026-08-11-code-def-divisions-multivalue.sql
-- team/qualification/rank.division 与 certificate.divisions 改为逗号分隔多值 ('P,C')
-- 顺序：加宽列 → 折叠重复 → 改索引 → 注释

-- 1) 加宽列
ALTER TABLE team          ALTER COLUMN division TYPE varchar(10);
ALTER TABLE qualification ALTER COLUMN division TYPE varchar(10);
ALTER TABLE rank          ALTER COLUMN division TYPE varchar(10);

-- 2) 折叠重复行为单行（先 UPDATE 合并到 keep 行，再 DELETE 冗余行；每表按各自 code 键分组）
UPDATE team t SET division = (
  SELECT string_agg(s.division, ',' ORDER BY CASE s.division WHEN 'P' THEN 0 WHEN 'C' THEN 1 WHEN 'A' THEN 2 ELSE 3 END)
  FROM (SELECT DISTINCT t2.division FROM team t2 WHERE t2.filiale = t.filiale AND t2.team = t.team) s
)
WHERE t.id IN (SELECT min(id) FROM team GROUP BY filiale, team HAVING count(*) > 1);

DELETE FROM team t
USING (SELECT min(id) AS keep_id, filiale, team FROM team GROUP BY filiale, team HAVING count(*) > 1) g
WHERE t.filiale = g.filiale AND t.team = g.team AND t.id <> g.keep_id;

UPDATE qualification t SET division = (
  SELECT string_agg(s.division, ',' ORDER BY CASE s.division WHEN 'P' THEN 0 WHEN 'C' THEN 1 WHEN 'A' THEN 2 ELSE 3 END)
  FROM (SELECT DISTINCT t2.division FROM qualification t2 WHERE t2.qualification = t.qualification) s
)
WHERE t.id IN (SELECT min(id) FROM qualification GROUP BY qualification HAVING count(*) > 1);

DELETE FROM qualification t
USING (SELECT min(id) AS keep_id, qualification FROM qualification GROUP BY qualification HAVING count(*) > 1) g
WHERE t.qualification = g.qualification AND t.id <> g.keep_id;

UPDATE certificate t SET divisions = (
  SELECT string_agg(s.divisions, ',' ORDER BY CASE s.divisions WHEN 'P' THEN 0 WHEN 'C' THEN 1 WHEN 'A' THEN 2 ELSE 3 END)
  FROM (SELECT DISTINCT t2.divisions FROM certificate t2 WHERE t2.certificate = t.certificate) s
)
WHERE t.id IN (SELECT min(id) FROM certificate GROUP BY certificate HAVING count(*) > 1);

DELETE FROM certificate t
USING (SELECT min(id) AS keep_id, certificate FROM certificate GROUP BY certificate HAVING count(*) > 1) g
WHERE t.certificate = g.certificate AND t.id <> g.keep_id;

-- 3) 索引
DROP INDEX uq_team;
CREATE UNIQUE INDEX uq_team ON team (filiale, team);
CREATE UNIQUE INDEX uq_qualification ON qualification (qualification);

-- 4) 注释
COMMENT ON COLUMN team.division IS '适用机组类型，逗号分隔可多值：P=飞行员 C=客舱 A=空中安全员，可组合如 ''P,C''';
COMMENT ON COLUMN qualification.division IS '适用机组类型，逗号分隔可多值：P=飞行员 C=客舱，可组合如 ''P,C''';
COMMENT ON COLUMN rank.division IS '该职级适用的机组类型，逗号分隔可多值：P=飞行员 C=客舱，可组合如 ''P,C''';
COMMENT ON COLUMN certificate.divisions IS '适用机组类型，逗号分隔可多值：P=飞行员 C=客舱 A=空中安全员，可组合如 ''P,C''';
