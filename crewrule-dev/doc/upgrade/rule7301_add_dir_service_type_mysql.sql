-- CMSCEB-867 [RULE] 7301增加參數 DIR 和Flight Service Type
-- 7301法规参数新增DIR和Service Type字段
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- mysql
CREATE TABLE `rule_parameter_20260518_2358` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20260518_2358` SELECT * FROM `rule_parameter`;

select * from `rule_parameter_20260518_2358`;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- mysql 7301-------------------------------------------------------------
select *from rule_parameter where rule_id in (select id from rule where `function`=7301) and param_names like 'table%Header%' and param_values='Flight Assignments,Flight Hours,DP Adjust Pct,Callout Assignments';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where `function`=7301);

-- 7301
select rule_id, param_values,
	CONCAT(SUBSTRING_INDEX(param_values, ',', 1),',*,*,',SUBSTRING_INDEX(param_values, ',', -3)) as new_param_values,
	SUBSTRING_INDEX(param_values, ',', 1) as head,
	SUBSTRING_INDEX(param_values, ',', -3) as tail
from rule_parameter
where rule_id in (select id from rule where `function`=7301) and param_names like 'table%Row%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7301 更新 rule_parameter的table header，新增DIR和Service Type参数（在Flight Assignments之后）
update rule_parameter
set param_values='Flight Assignments,DIR,Service Type,Flight Hours,DP Adjust Pct,Callout Assignments'
where rule_id in (select id from rule where `function`=7301) and param_names like 'table%Header%'
	and param_values = 'Flight Assignments,Flight Hours,DP Adjust Pct,Callout Assignments';

-- 7301 更新 rule_parameter的table row，在Flight Assignments后插入*,*
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 1),',*,*,',SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=7301) and param_names like 'table%Row%';