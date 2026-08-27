-- [EVAFD] mantis 0012082: CR-法規7248需要增加footprint sub type參數欄位
-- 步骤1： 法规参数数据表备份
-- mysql
CREATE TABLE `rule_parameter_20260413_7248` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20260413_7248` SELECT * FROM `rule_parameter`;

select * from `rule_parameter_20260413_7248`;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- mysql 7248-------------------------------------------------------------
select *from rule_parameter where rule_id in (select id from rule where `function`=7248) and param_names like 'table%Header%' and param_values='Footprint Types,Program Status,Prohibited Course Codes,Prohibited Roles,Prohibited Assignment Groups,Prohibited Assignments,to First Duty Date(Y/N)';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where `function`=7248);

-- 7248 
select rule_id, param_values,
	CONCAT(SUBSTRING_INDEX(param_values, ',', 1),',*,',SUBSTRING_INDEX(param_values, ',', -6)) as new_param_values, 
	SUBSTRING_INDEX(param_values, ',', 1) as head, 
	SUBSTRING_INDEX(param_values, ',', -6) as tail 
from rule_parameter 
where rule_id in (select id from rule where `function`=7248) and param_names like 'table%Row%';	

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7248 更新 rule_parameter的table header，7248法规新增参数Footprint Subtypes
update rule_parameter 
set param_values='Footprint Types,Footprint Subtypes,Program Status,Prohibited Course Codes,Prohibited Roles,Prohibited Assignment Groups,Prohibited Assignments,to First Duty Date(Y/N)'
where rule_id in (select id from rule where `function`=7248) and param_names like 'table%Header%' 
	and param_values='Footprint Types,Program Status,Prohibited Course Codes,Prohibited Roles,Prohibited Assignment Groups,Prohibited Assignments,to First Duty Date(Y/N)';

-- 7248 更新 rule_parameter的table row
update rule_parameter 
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 1),',*,',SUBSTRING_INDEX(param_values, ',', -6))
where rule_id in (select id from rule where `function`=7248) and param_names like 'table%Row%';
