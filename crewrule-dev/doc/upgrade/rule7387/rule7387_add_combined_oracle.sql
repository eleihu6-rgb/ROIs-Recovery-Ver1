-- CMSCEB-1026 [5J][Rule7387] Check Standby Callout Duration
-- 7387 新增参数Combined，取值DP或FDP，在Call Out Assignments之后添加
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- oracle
CREATE TABLE rule_parameter_20260531_2311 as select * from rule_parameter;
select * from rule_parameter_20260531_2311;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- oracle 7387-------------------------------------------------------------
-- 查询7387法规当前的tableHeader
select *from rule_parameter where rule_id in (select id from rule where function=7387) and param_names like 'table%Header%' and param_values='Standby Assignment Groups,Call Out Assignments,Max Duration';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where function=7387);

-- 7387 查询 rule_parameter的tableRow
select rule_id, param_values,
	(SUBSTRING_INDEX2(param_values, ',', 2) || ',*,' || SUBSTRING_INDEX2(param_values, ',', -2)) as new_param_values
from rule_parameter
where rule_id in (select id from rule where function=7387) and param_names like 'table%Row%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7387 更新 rule_parameter的tableHeader，在Call Out Assignments后添加Combined参数
update rule_parameter
set param_values='Standby Assignment Groups,Call Out Assignments,Combined,Max Duration'
where rule_id in (select id from rule where function=7387) and param_names like 'table%Header%'
	and param_values='Standby Assignment Groups,Call Out Assignments,Max Duration';

-- 7387 更新 rule_parameter的tableRow，在Call Out Assignments后添加*作为Combined的默认值
update rule_parameter
set param_values=(SUBSTRING_INDEX2(param_values, ',', 2) || ',*,' || SUBSTRING_INDEX2(param_values, ',', -2))
where rule_id in (select id from rule where function=7387) and param_names like 'table%Row%';