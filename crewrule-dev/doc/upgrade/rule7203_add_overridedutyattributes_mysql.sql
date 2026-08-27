-- ROSCRW-18549 【TG】【TCAR】MAX FDP extension without in-flight rest restrict by WOCL - 扩展7203法规
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- mysql
CREATE TABLE `rule_parameter_20260422_0001` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20260422_0001` SELECT * FROM `rule_parameter`;

select * from `rule_parameter_20260422_0001`;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- mysql 7203-------------------------------------------------------------
-- 查询7203法规当前的table header
select *from rule_parameter where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Header%' and param_values='Bases,Compositions,Duty Type,Segment Assignments,Flight Fleets,Report Time Ranges,DP Encroaching Period,Sector BLH Ranges,Max Sector';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where `function`=7203);

-- 7203 查询 rule_parameter的table row
select rule_id, param_values,
	CONCAT(SUBSTRING_INDEX(param_values, ',', 7),',*,',SUBSTRING_INDEX(param_values, ',', -2)) as new_param_values
from rule_parameter
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Row%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7203 更新 rule_parameter的table header，7203法规新增Override Duty Attributes参数（位于DP Encroaching Period之后，忽略Severity）
update rule_parameter
set param_values='Bases,Compositions,Duty Type,Segment Assignments,Flight Fleets,Report Time Ranges,DP Encroaching Period,Override Duty Attributes,Sector BLH Ranges,Max Sector'
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Header%'
	and param_values='Bases,Compositions,Duty Type,Segment Assignments,Flight Fleets,Report Time Ranges,DP Encroaching Period,Sector BLH Ranges,Max Sector';

-- 7203 更新 rule_parameter的table row，在DP Encroaching Period后添加*作为Override Duty Attributes的默认值
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 7),',*,',SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Row%';
