-- ROSCRW-18570 【TCAR】Rule 7203 根据连续duty类型决定最大航段数 (改造7203)
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- oracle 备份
CREATE TABLE rule_parameter_20260506_1411 as select * from rule_parameter;
select * from rule_parameter_20260506_1411;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- oracle 7203-------------------------------------------------------------
-- 查询7203法规当前的table header
select *from rule_parameter where rule_id in (select id from rule where function=7203) and param_names like 'table%Header%' and param_values='Bases,Compositions,Duty Type,Segment Assignments,Flight Fleets,Report Time Ranges,DP Encroaching Period,Override Duty Attributes,Sector BLH Ranges,Max Sector';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where function=7203);

-- 7203 查询 rule_parameter的table row
select rule_id, param_values,
	(SUBSTRING_INDEX2(param_values, ',', 3) || ',*,' || (SUBSTRING_INDEX2(SUBSTRING_INDEX2(param_values, ',', -3), ',', 4) || ',*,' || SUBSTRING_INDEX2(SUBSTRING_INDEX2(param_values, ',', -3), ',', -4))) as new_param_values, 
	SUBSTRING_INDEX2(param_values, ',', 3) as head, 
	SUBSTRING_INDEX2(param_values, ',', -3) as tail 
from rule_parameter
where rule_id in (select id from rule where function=7203) and param_names like 'table%Row%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7203 更新 rule_parameter的table header，7203法规新增Consecutive Duty参数（位于Duty Type之后）、Encroaching Duration（位于Duty DP Encroaching Period之后）
update rule_parameter
set param_values='Bases,Compositions,Duty Type,Consecutive Duty,Segment Assignments,Flight Fleets,Report Time Ranges,DP Encroaching Period,Encroaching Duration,Override Duty Attributes,Sector BLH Ranges,Max Sector,Consecutive Duty'
where rule_id in (select id from rule where function=7203) and param_names like 'table%Header%'
	and param_values='Bases,Compositions,Duty Type,Segment Assignments,Flight Fleets,Report Time Ranges,DP Encroaching Period,Override Duty Attributes,Sector BLH Ranges,Max Sector';

-- 7203 更新 rule_parameter的table row，在Duty Type后添加*作为Consecutive Duty的默认值, DP Encroaching Period后添加*作为Encroaching Duration的默认值
update rule_parameter
set param_values=(SUBSTRING_INDEX2(param_values, ',', 3) || ',*,' || (SUBSTRING_INDEX2(SUBSTRING_INDEX2(param_values, ',', -3), ',', 4) || ',*,' || SUBSTRING_INDEX2(SUBSTRING_INDEX2(param_values, ',', -3), ',', -4)))
where rule_id in (select id from rule where function=7203) and param_names like 'table%Row%';
