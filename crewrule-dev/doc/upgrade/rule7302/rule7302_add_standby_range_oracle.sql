-- CMSCEB-1173 [EASA扩展] Rule 7302 Adjust Max FDP by standby callout - 新增参数
-- 7302 tableHeader新增参数：Standby Start Range、Standby Overlap Range、Callout FDP Type
-- 添加到Standby Assignments之后

-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- oracle
CREATE TABLE rule_parameter_20260601_1404 as select * from rule_parameter;
select * from rule_parameter_20260601_1404;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- oracle 7302-------------------------------------------------------------
-- 查询7302法规当前的tableHeader
select *from rule_parameter where rule_id in (select id from rule where function=7302) and param_names like 'table%Header%' and param_values='Bases,Ranks,Fleets,Teams,Standby Assignment Groups,Standby Assignments,Threshold,Adjustment PCT';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where function=7302);

-- 7302 查询 rule_parameter的tableRow
select rule_id, param_values,
	(SUBSTRING_INDEX2(param_values, ',', 6) || ',*,*,*,') || SUBSTRING_INDEX2(param_values, ',', -6) as new_param_values
from rule_parameter
where rule_id in (select id from rule where function=7302) and param_names like 'table%Row%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7302 更新 rule_parameter的tableHeader，在Standby Assignments后添加三个新参数
update rule_parameter
set param_values='Bases,Ranks,Fleets,Teams,Standby Assignment Groups,Standby Assignments,Standby Start Range,Standby Overlap Range,Callout FDP Type,Threshold,Adjustment PCT'
where rule_id in (select id from rule where function=7302) and param_names like 'table%Header%'
	and param_values='Bases,Ranks,Fleets,Teams,Standby Assignment Groups,Standby Assignments,Threshold,Adjustment PCT';

-- 7302 更新 rule_parameter的tableRow，在Standby Assignments后添加三个*作为默认值
update rule_parameter
set param_values=(SUBSTRING_INDEX2(param_values, ',', 6) || ',*,*,*,') || SUBSTRING_INDEX2(param_values, ',', -6)
where rule_id in (select id from rule where function=7302) and param_names like 'table%Row%';