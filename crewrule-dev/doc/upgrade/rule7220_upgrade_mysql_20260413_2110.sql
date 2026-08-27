-- [EVAFD] mantis 0011689: CR--法規7220應只針對BR/B7航班做檢查
-- 步骤1： 法规参数数据表备份
-- mysql
CREATE TABLE `rule_parameter_20260413_2110` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20260413_2110` SELECT * FROM `rule_parameter`;

select * from `rule_parameter_20260413_2110`;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- mysql 7220-------------------------------------------------------------
select *from rule_parameter where rule_id in (select id from rule where `function`=7220) and param_names like 'table%Header%' and param_values='Bases,Ranks,Fleets,Teams,Acting Ranks,Min BLH on Flight,Max Number of Crew on Flight';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where `function`=7220);

-- 7220 
select rule_id, param_values,
	CONCAT(SUBSTRING_INDEX(param_values, ',', 4),',*,',SUBSTRING_INDEX(param_values, ',', -3)) as new_param_values, 
	SUBSTRING_INDEX(param_values, ',', 4) as head, 
	SUBSTRING_INDEX(param_values, ',', -3) as tail 
from rule_parameter 
where rule_id in (select id from rule where `function`=7220) and param_names like 'table%Row%';	

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7220 更新 rule_parameter的table header，7220法规新增参数Flight Airline Codes
update rule_parameter 
set param_values='Bases,Ranks,Fleets,Teams,Flight Airline Codes,Acting Ranks,Min BLH on Flight,Max Number of Crew on Flight'
where rule_id in (select id from rule where `function`=7220) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Acting Ranks,Min BLH on Flight,Max Number of Crew on Flight';

-- 7220 更新 rule_parameter的table row
update rule_parameter 
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 4),',*,',SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=7220) and param_names like 'table%Row%';
