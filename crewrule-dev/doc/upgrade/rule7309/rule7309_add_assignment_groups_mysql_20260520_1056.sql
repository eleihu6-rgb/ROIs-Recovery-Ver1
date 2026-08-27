-- CMSCEB-1080 [CEBU] 7309新增参数Assignment Groups
-- 7309新增参数：Assignment Groups（任务类型组），多个值使用|分割，支持*表示所有
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- mysql
CREATE TABLE `rule_parameter_20260520_1056` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20260520_1056` SELECT * FROM `rule_parameter`;

select * from `rule_parameter_20260520_1056`;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- mysql 7309-------------------------------------------------------------
select *from rule_parameter where rule_id in (select id from rule where `function`=7309) and param_names like 'table%Header%' and param_values='Assignments,Attributes,Consecutive Type,Consecutive Times,Include Pairing Rest(Y/N),Counting Rest from Pairing End Day(Y/N),Direction,Rest Type,Min Rest';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where `function`=7309);

-- 7309
select rule_id, param_values,
	CONCAT('*,', param_values) as new_param_values
from rule_parameter
where rule_id in (select id from rule where `function`=7309) and param_names like 'table%Row%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7309 更新 rule_parameter的tableHeader，在Assignments前添加Assignment Groups参数
update rule_parameter
set param_values='Assignment Groups,Assignments,Attributes,Consecutive Type,Consecutive Times,Include Pairing Rest(Y/N),Counting Rest from Pairing End Day(Y/N),Direction,Rest Type,Min Rest'
where rule_id in (select id from rule where `function`=7309) and param_names like 'table%Header%'
	and param_values='Assignments,Attributes,Consecutive Type,Consecutive Times,Include Pairing Rest(Y/N),Counting Rest from Pairing End Day(Y/N),Direction,Rest Type,Min Rest';

-- 7309 更新 rule_parameter的tableRow，在开头添加默认值*（Assignment Groups）
update rule_parameter
set param_values=CONCAT('*,', param_values)
where rule_id in (select id from rule where `function`=7309) and param_names like 'tableRow%';
