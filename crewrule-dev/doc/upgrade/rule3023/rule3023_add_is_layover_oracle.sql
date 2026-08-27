-- CMSCEB-1152【CEB】【RULE】3023/3024法规增加isLayover属性
-- 3023（Pickup）法规新增参数：is Layover(Y/N)
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- oracle 备份
CREATE TABLE rule_parameter_20260528_1602 AS SELECT * FROM rule_parameter;
SELECT * FROM rule_parameter_20260528_1602;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- oracle 3023-------------------------------------------------------------
-- 检查当前的tableHeader
SELECT * FROM rule_parameter WHERE rule_id IN (SELECT id FROM rule WHERE function=3023) AND param_names LIKE 'table%Header%' AND param_values='Pairing Bases,Airport,DepStart,DepEnd,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Pickup Time,Effective date,Expired Date';

SELECT DISTINCT rule_id FROM rule_parameter WHERE rule_id IN (SELECT id FROM rule WHERE function=3023);

-- 3023
-- 检查当前的tableRow
SELECT rule_id, param_values,
	(SUBSTRING_INDEX2(param_values, ',', 1) || ',*,' || SUBSTRING_INDEX2(param_values, ',', -1)) AS new_param_values
FROM rule_parameter
WHERE rule_id IN (SELECT id FROM rule WHERE function=3023) AND param_names LIKE 'tableRow%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 3023 更新 rule_parameter的tableHeader，在 Pairing Bases 后添加 is Layover(Y/N)
UPDATE rule_parameter
SET param_values='Pairing Bases,is Layover(Y/N),Airport,DepStart,DepEnd,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Pickup Time,Effective date,Expired Date'
WHERE rule_id IN (SELECT id FROM rule WHERE function=3023) AND param_names LIKE 'table%Header%'
	AND param_values='Pairing Bases,Airport,DepStart,DepEnd,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Pickup Time,Effective date,Expired Date';

-- 3023 更新 rule_parameter的tableRow，在 Pairing Bases 后添加默认值 *
UPDATE rule_parameter
SET param_values=(SUBSTRING_INDEX2(param_values, ',', 1) || ',*,' || SUBSTRING_INDEX2(param_values, ',', -1))
WHERE rule_id IN (SELECT id FROM rule WHERE function=3023) AND param_names LIKE 'tableRow%';