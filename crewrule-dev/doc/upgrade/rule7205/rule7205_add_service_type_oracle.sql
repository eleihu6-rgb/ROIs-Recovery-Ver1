-- CMSCEB-1099 Rule7205 增加參數Service Type
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- oracle 备份
CREATE TABLE rule_parameter_20260522_1500 as select * from rule_parameter;
select * from rule_parameter_20260522_1500;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- oracle 7205-------------------------------------------------------------
-- 查询7205法规当前的table header（应该是Discretion Applicable(Y/N)在Duty Type之后）
select *from rule_parameter where rule_id in (select id from rule where function=7205) and param_names like 'table%Header%' and param_values='Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Discretion Applicable(Y/N),Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where function=7205);

-- 7205 查询 rule_parameter的table row
select rule_id, param_values,
	(SUBSTRING_INDEX2(param_values, ',', 8)||',*,'||SUBSTRING_INDEX2(param_values, ',', -8)) as new_param_values
from rule_parameter
where rule_id in (select id from rule where function=7205) and param_names like 'table%Row%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7205 更新 rule_parameter的table header，7205法规新增参数 Service Type，放在Discretion Applicable(Y/N)之后
update rule_parameter
set param_values='Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Discretion Applicable(Y/N),Service Type,Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range'
where rule_id in (select id from rule where function=7205) and param_names like 'table%Header%'
	and param_values='Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Discretion Applicable(Y/N),Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range';

-- 7205 更新 rule_parameter的table row，在Discretion Applicable(Y/N)后添加新参数默认值 *
update rule_parameter
set param_values=SUBSTRING_INDEX2(param_values, ',', 8)||',*,'||SUBSTRING_INDEX2(param_values, ',', -8)
where rule_id in (select id from rule where function=7205) and param_names like 'table%Row%';
