-- HXCREW-347 【HKA】【Rule7480】1.DDO限制-7.21 - 新增外站EXB可代替DDO参数
-- 7480新增参数：Layover Assignments, Layover Assignments Duration
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- oracle 备份
CREATE TABLE rule_parameter_20260526_1944 AS SELECT * FROM rule_parameter;
SELECT * FROM rule_parameter_20260526_1944;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- oracle 7480-------------------------------------------------------------
-- 检查当前的tableHeader
SELECT * FROM rule_parameter WHERE rule_id IN (SELECT id FROM rule WHERE function=7480) AND param_names LIKE 'table%Header%' AND param_values='Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding First Recovery 6 offset DO(Y/N),Following Start of DDO(Y/N),Min Consecutive DO,Min DO';

SELECT DISTINCT rule_id FROM rule_parameter WHERE rule_id IN (SELECT id FROM rule WHERE function=7480);

-- 7480
-- 检查当前的tableRow
SELECT rule_id, param_values,
	(SUBSTRING_INDEX2(param_values, ',', 9) || ',*,*,' || SUBSTRING_INDEX2(param_values, ',', -9)) AS new_param_values
FROM rule_parameter
WHERE rule_id IN (SELECT id FROM rule WHERE function=7480) AND param_names LIKE 'tableRow%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7480 更新 rule_parameter的tableHeader，在 Following Start of DDO(Y/N) 后添加 Layover Assignments, Layover Assignments Duration
UPDATE rule_parameter
SET param_values='Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding First Recovery 6 offset DO(Y/N),Following Start of DDO(Y/N),Layover Assignments,Layover Assignments Duration,Min Consecutive DO,Min DO'
WHERE rule_id IN (SELECT id FROM rule WHERE function=7480) AND param_names LIKE 'table%Header%'
	AND param_values='Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding First Recovery 6 offset DO(Y/N),Following Start of DDO(Y/N),Min Consecutive DO,Min DO';

-- 7480 更新 rule_parameter的tableRow，在 Following Start of DDO(Y/N) 后添加默认值 *,*
UPDATE rule_parameter
SET param_values=(SUBSTRING_INDEX2(param_values, ',', 9) || ',*,*,' || SUBSTRING_INDEX2(param_values, ',', -9))
WHERE rule_id IN (SELECT id FROM rule WHERE function=7480) AND param_names LIKE 'tableRow%';