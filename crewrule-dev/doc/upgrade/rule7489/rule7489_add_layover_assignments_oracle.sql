-- HXCREW-346 【HKA】【Rule7489】10.Rest Periods-7.19 - 新增14天EXB Layover至少34:00参数
-- 7489新增参数：Layover Assignments, Min Layover Assignments Duration
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- oracle 备份
CREATE TABLE rule_parameter_20260526_0944 AS SELECT * FROM rule_parameter;
SELECT * FROM rule_parameter_20260526_0944;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- oracle 7489-------------------------------------------------------------
-- 检查当前的tableHeader
SELECT * FROM rule_parameter WHERE rule_id IN (SELECT id FROM rule WHERE function=7489) AND param_names LIKE 'table%Header%' AND param_values='Consecutive Days,ACC State,Rest Assignment Groups,Rest Duration,is Physiological Rest Included in Count statistics(Y/N),Max Consecutive Rest Duration Times,Max Total Rest Duration Times';

SELECT DISTINCT rule_id FROM rule_parameter WHERE rule_id IN (SELECT id FROM rule WHERE function=7489);

-- 7489
-- 检查当前的tableRow
SELECT rule_id, param_values,
	(SUBSTRING_INDEX2(param_values, ',', 5) || ',*,*,' || SUBSTRING_INDEX2(param_values, ',', -5)) AS new_param_values
FROM rule_parameter
WHERE rule_id IN (SELECT id FROM rule WHERE function=7489) AND param_names LIKE 'tableRow%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7489 更新 rule_parameter的tableHeader，在 is Physiological Rest Included in Count statistics(Y/N) 后添加 Layover Assignments, Min Layover Assignments Duration
UPDATE rule_parameter
SET param_values='Consecutive Days,ACC State,Rest Assignment Groups,Rest Duration,is Physiological Rest Included in Count statistics(Y/N),Layover Assignments,Min Layover Assignments Duration,Max Consecutive Rest Duration Times,Max Total Rest Duration Times'
WHERE rule_id IN (SELECT id FROM rule WHERE function=7489) AND param_names LIKE 'table%Header%'
	AND param_values='Consecutive Days,ACC State,Rest Assignment Groups,Rest Duration,is Physiological Rest Included in Count statistics(Y/N),Max Consecutive Rest Duration Times,Max Total Rest Duration Times';

-- 7489 更新 rule_parameter的tableRow，在 is Physiological Rest Included in Count statistics(Y/N) 后添加默认值 *,*
UPDATE rule_parameter
SET param_values=(SUBSTRING_INDEX2(param_values, ',', 5) || ',*,*,' || SUBSTRING_INDEX2(param_values, ',', -5))
WHERE rule_id IN (SELECT id FROM rule WHERE function=7489) AND param_names LIKE 'tableRow%';
