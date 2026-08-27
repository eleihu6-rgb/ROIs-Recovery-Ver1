-- CMSPAL-1510 【2P】云测试 法规 8027违规未告警
-- 8027法规 新增筛选参数：DO Assignment
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- mysql
CREATE TABLE `rule_parameter_20260421_2241` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20260421_2241` SELECT * FROM `rule_parameter`;

select * from `rule_parameter_20260421_2241`;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- mysql 8027-------------------------------------------------------------
select *from rule_parameter where rule_id in (select id from rule where `function`=8027) and param_names like 'table%Header%' and 
	param_values='No. Month,Pattern Attribute,Min DO,DO Assignment Group,Utilize Post Duty Rest,Count Blank Day';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where `function`=8027);

-- 8027
select rule_id, param_values,
	CONCAT(SUBSTRING_INDEX(param_values, ',', 3),',*,',SUBSTRING_INDEX(param_values, ',', -3)) as new_param_values, 
	SUBSTRING_INDEX(param_values, ',', 3) as head, 
	SUBSTRING_INDEX(param_values, ',', -3) as tail 
from rule_parameter 
where rule_id in (select id from rule where `function`=8027) and param_names like 'table%Row%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 8027 更新 rule_parameter的table header，添加DO Assignment
update rule_parameter 
set param_values='No. Month,Pattern Attribute,Min DO,DO Assignment,DO Assignment Group,Utilize Post Duty Rest,Count Blank Day'
where rule_id in (select id from rule where `function`=8027) and param_names like 'table%Header%' and 
	param_values='No. Month,Pattern Attribute,Min DO,DO Assignment Group,Utilize Post Duty Rest,Count Blank Day';

-- 8027 更新 rule_parameter的table row，添加默认值*
update rule_parameter 
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 3),',*,',SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=8027) and param_names like 'table%Row%';