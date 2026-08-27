-- CMSCEB-1018 Rule7364 新增parameter Acting Rank
-- 7364 法规新增参数 Acting Ranks

-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- oracle 备份
CREATE TABLE rule_parameter_20260518_1304 as select * from rule_parameter;
select * from rule_parameter_20260518_1304;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- oracle 7364-------------------------------------------------------------
select * from rule_parameter where rule_id in (select id from rule where function=7364) and param_names like 'table%Header%' and param_values='Bases,Ranks,Fleets,Teams,Routes,Assignment Groups,Assignments,Airport Categories,Max Inexperience Crews';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where function=7364);

-- 7364 验证新参数值
select rule_id, param_values,
	(SUBSTRING_INDEX2(param_values, ',', 4)||',*,'||SUBSTRING_INDEX2(param_values, ',', -4)) as new_param_values, 
	SUBSTRING_INDEX2(param_values, ',', 4) as head, 
	SUBSTRING_INDEX2(param_values, ',', -4) as tail 
from rule_parameter 
where rule_id in (select id from rule where function=7364) and param_names like 'table%Row%';	

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7364 更新 rule_parameter的table header，在Teams之后新增Acting Ranks参数
update rule_parameter 
set param_values='Bases,Ranks,Fleets,Teams,Acting Ranks,Routes,Assignment Groups,Assignments,Airport Categories,Max Inexperience Crews'
where rule_id in (select id from rule where function=7364) and param_names like 'table%Header%' 
	and param_values = 'Bases,Ranks,Fleets,Teams,Routes,Assignment Groups,Assignments,Airport Categories,Max Inexperience Crews';

-- 7364 更新 rule_parameter的table row，为新增的Acting Ranks参数添加默认值*
update rule_parameter 
set param_values=(SUBSTRING_INDEX2(param_values, ',', 4)||',*,'||SUBSTRING_INDEX2(param_values, ',', -4))
where rule_id in (select id from rule where function=7364) and param_names like 'table%Row%';
