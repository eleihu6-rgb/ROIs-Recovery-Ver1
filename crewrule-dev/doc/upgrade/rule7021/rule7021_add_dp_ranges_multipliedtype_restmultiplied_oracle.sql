-- CMSCEB-609 Rule 7021 - EASA Min Rest By DP
-- 7021法规新增参数：DP Range、Multiplied Type、Rest Multiplied
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- oracle 备份
CREATE TABLE rule_parameter_20260522_0934 as select * from rule_parameter;
select * from rule_parameter_20260522_0934;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- oracle 7021-------------------------------------------------------------
select *from rule_parameter where rule_id in (select id from rule where function=7021) and param_names like 'table%Header%' and param_values='is Home Base(Y/N),Compositions,Duty Assignment Groups,Duty Type,Sectors,Single BLH Range,Min Rest';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where function=7021);

-- 7021 查询 rule_parameter的table row
select rule_id, param_values,
	(SUBSTRING_INDEX2(param_values, ',', 6)||',*,*,*,'||SUBSTRING_INDEX2(param_values, ',', -6)) as new_param_values
from rule_parameter
where rule_id in (select id from rule where function=7021) and param_names like 'table%Row%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7021 更新 rule_parameter的table header，7021法规新增DP Range、Multiplied Type、Rest Multiplied参数，放在Single BLH Range之后
update rule_parameter
set param_values='is Home Base(Y/N),Compositions,Duty Assignment Groups,Duty Type,Sectors,Single BLH Range,DP Range,Multiplied Type,Rest Multiplied,Min Rest'
where rule_id in (select id from rule where function=7021) and param_names like 'table%Header%'
	and param_values='is Home Base(Y/N),Compositions,Duty Assignment Groups,Duty Type,Sectors,Single BLH Range,Min Rest';

-- 7021 更新 rule_parameter的table row，在Single BLH Range后添加*,*,*作为DP Range、Multiplied Type、Rest Multiplied的默认值
update rule_parameter
set param_values=(SUBSTRING_INDEX2(param_values, ',', 6)||',*,*,*,'||SUBSTRING_INDEX2(param_values, ',', -6))
where rule_id in (select id from rule where function=7021) and param_names like 'table%Row%';
