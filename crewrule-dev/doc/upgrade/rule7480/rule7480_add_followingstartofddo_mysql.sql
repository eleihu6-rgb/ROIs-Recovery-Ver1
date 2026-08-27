-- HXCREW-302 【HKA】【Rule7480】1.DDO限制-7.21 - 连续14天检查DDO优化
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- mysql
CREATE TABLE `rule_parameter_20260428_1456` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20260428_1456` SELECT * FROM `rule_parameter`;

select * from `rule_parameter_20260428_1456`;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- mysql 7480-------------------------------------------------------------
-- 查询7480法规当前的table header
select *from rule_parameter where rule_id in (select id from rule where `function`=7480) and param_names like 'table%Header%' and param_values like 'Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding First Recovery 6 offset DO(Y/N),Min Consecutive DO,Min DO';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where `function`=7480);

-- 7480 查询 rule_parameter的table row
select rule_id, param_values,
	CONCAT(SUBSTRING_INDEX(param_values, ',', 8),',*,',SUBSTRING_INDEX(param_values, ',', -2)) as new_param_values, 
	SUBSTRING_INDEX(param_values, ',', 8) as head, 
	SUBSTRING_INDEX(param_values, ',', -2) as tail 
from rule_parameter
where rule_id in (select id from rule where `function`=7480) and param_names like 'table%Row%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7480 更新 rule_parameter的table header，7480法规新增Following Start of DDO(Y/N)参数
update rule_parameter
set param_values='Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding First Recovery 6 offset DO(Y/N),Following Start of DDO(Y/N),Min Consecutive DO,Min DO'
where rule_id in (select id from rule where `function`=7480) and param_names like 'table%Header%' and param_values='Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding First Recovery 6 offset DO(Y/N),Min Consecutive DO,Min DO';

-- 7480 更新 rule_parameter的table row，在Excluding First Recovery 6 offset DO(Y/N)后添加*作为Following Start of DDO的默认值
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 8),',*,',SUBSTRING_INDEX(param_values, ',', -2)) 
where rule_id in (select id from rule where `function`=7480) and param_names like 'table%Row%';