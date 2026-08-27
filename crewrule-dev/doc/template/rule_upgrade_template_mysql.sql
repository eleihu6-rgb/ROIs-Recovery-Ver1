-- HXCREW-261 【HKA】【Rule7480】1.DDO限制-7.21 - 参数调整Excluding Recovery DO Index为Excluding First Recovery 6 offset DO(Y/N)
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- mysql
CREATE TABLE `rule_parameter_20260413_1343` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20260413_1343` SELECT * FROM `rule_parameter`;

select * from `rule_parameter_20260413_1343`;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- mysql 7480-------------------------------------------------------------
select *from rule_parameter where rule_id in (select id from rule where `function`=7480) and param_names like 'table%Header%' and param_values='Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding Recovery TZ Diff,Excluding Recovery DO Index,Min Consecutive DO,Min DO';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where `function`=7480);

-- 7480 
select rule_id, param_values,
	CONCAT(SUBSTRING_INDEX(param_values, ',', 7),',*,',SUBSTRING_INDEX(param_values, ',', -2)) as new_param_values, 
	SUBSTRING_INDEX(param_values, ',', 7) as head, 
	SUBSTRING_INDEX(param_values, ',', -2) as tail 
from rule_parameter 
where rule_id in (select id from rule where `function`=7480) and param_names like 'table%Row%';	

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7480 更新 rule_parameter的table header，7480法规参数调整Excluding Recovery DO Index改为Excluding First Recovery 6 offset DO(Y/N)，移除Excluding Recovery TZ Diff
update rule_parameter 
set param_values='Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding First Recovery 6 offset DO(Y/N),Min Consecutive DO,Min DO'
where rule_id in (select id from rule where `function`=7480) and param_names like 'table%Header%' 
	and param_values = 'Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding Recovery TZ Diff,Excluding Recovery DO Index,Min Consecutive DO,Min DO';

-- 7480 更新 rule_parameter的table row
update rule_parameter 
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 7),',*,',SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7480) and param_names like 'table%Row%';


