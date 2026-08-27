-- CMSCEB-711 Rule 3021 新增篩選條件 Is Base
-- 3021法规 新增筛选参数：Routes
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- oracle 备份
CREATE TABLE rule_parameter_20260417_1453 as select * from rule_parameter;
select * from rule_parameter_20260417_1453;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- oracle 3021-------------------------------------------------------------
select *from rule_parameter where rule_id in (select id from rule where function=3021) and param_names like 'table%Header%' and 
	param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Brief Time,Effective date,Expired Date';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where function=3021);

-- 3021
select rule_id, param_values,
	(SUBSTRING_INDEX2(param_values, ',', 10)||',*,'||SUBSTRING_INDEX2(param_values, ',', -10)) as new_param_values, 
	SUBSTRING_INDEX2(param_values, ',', 10) as head, 
	SUBSTRING_INDEX2(param_values, ',', -10) as tail 
from rule_parameter 
where rule_id in (select id from rule where function=3021) and param_names like 'table%Row%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 3021 更新 rule_parameter的table header，添加Routes
update rule_parameter 
set param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Routes,Brief Time,Effective date,Expired Date'
where rule_id in (select id from rule where function=3021) and param_names like 'table%Header%' and 
	param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Brief Time,Effective date,Expired Date';

-- 3021 更新 rule_parameter的table row，添加默认值*
update rule_parameter 
set param_values=(SUBSTRING_INDEX2(param_values, ',', 10)||',*,'||SUBSTRING_INDEX2(param_values, ',', -10))
where rule_id in (select id from rule where function=3021) and param_names like 'table%Row%';