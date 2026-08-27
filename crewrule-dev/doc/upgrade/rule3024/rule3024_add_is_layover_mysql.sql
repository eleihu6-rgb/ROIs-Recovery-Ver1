-- [可选]重新调整3024参数顺序,必须先备份rule_parameter表，才能重新刷新参数
CREATE TABLE `rule_parameter_20260528_0001` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20260528_0001` SELECT * FROM `rule_parameter`;

SELECT * FROM `rule_parameter_20260528_0001`;

select CONCAT('call AdjustTableHeaderOrder(''',param_values,''',',
'''Pairing Bases,Airport,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Dropoff Time,Effective date,Expired Date'',',
rule_id, ',''table'', true);') 
from rule_parameter where rule_id in (select id from rule where `function`=3024) and param_names like 'table%Header%';

-- CMSCEB-1152【CEB】【RULE】3023/3024法规增加isLayover属性
-- 3024（DropOff）法规新增参数：is Layover(Y/N)
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- mysql
CREATE TABLE `rule_parameter_20260528_1604` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20260528_1604` SELECT * FROM `rule_parameter`;

SELECT * FROM `rule_parameter_20260528_1604`;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- mysql 3024-------------------------------------------------------------
-- 检查当前的tableHeader
SELECT * FROM rule_parameter WHERE rule_id IN (SELECT id FROM rule WHERE `function`=3024) AND param_names LIKE 'table%Header%' AND param_values='Pairing Bases,Airport,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Dropoff Time,Effective date,Expired Date';

SELECT DISTINCT rule_id FROM rule_parameter WHERE rule_id IN (SELECT id FROM rule WHERE `function`=3024);

-- 3024
-- 检查当前的tableRow
SELECT rule_id, param_values,
	CONCAT(SUBSTRING_INDEX(param_values, ',', 1), ',*,', SUBSTRING_INDEX(param_values, ',', -9)) AS new_param_values,
	SUBSTRING_INDEX(param_values, ',', 1) AS head,
	SUBSTRING_INDEX(param_values, ',', -9) AS tail
FROM rule_parameter
WHERE rule_id IN (SELECT id FROM rule WHERE `function`=3024) AND param_names LIKE 'tableRow%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 3024 更新 rule_parameter的tableHeader，在 Pairing Bases 后添加 is Layover(Y/N)
UPDATE rule_parameter
SET param_values='Pairing Bases,is Layover(Y/N),Airport,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Dropoff Time,Effective date,Expired Date'
WHERE rule_id IN (SELECT id FROM rule WHERE `function`=3024) AND param_names LIKE 'table%Header%'
	AND param_values='Pairing Bases,Airport,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Dropoff Time,Effective date,Expired Date';

-- 3024 更新 rule_parameter的tableRow，在 Pairing Bases 后添加默认值 *
UPDATE rule_parameter
SET param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 1), ',*,', SUBSTRING_INDEX(param_values, ',', -9))
WHERE rule_id IN (SELECT id FROM rule WHERE `function`=3024) AND param_names LIKE 'tableRow%';