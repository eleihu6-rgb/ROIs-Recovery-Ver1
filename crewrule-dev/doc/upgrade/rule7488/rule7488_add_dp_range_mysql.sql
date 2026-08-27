-- HXCREW-382 [HKA][Rule7488] 10.Rest Periods-7.19 DP Range
-- 7488 table1 新增参数 DP Range，过滤参数，格式HH:MM-HH:MM，支持*表示忽略
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- mysql
CREATE TABLE `rule_parameter_20260529_2025` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20260529_2025` SELECT * FROM `rule_parameter`;

select * from `rule_parameter_20260529_2025`;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- mysql 7488-------------------------------------------------------------
-- 查询7488法规当前的table1Header
select *from rule_parameter where rule_id in (select id from rule where `function`=7488) and param_names='table1Header' and param_values='TZ Diff Range,ACC State,Unacc Away From Base Duration,Compare With Pre Duty DP(Y/N),Standard Min Rest,Physiological Rest(Y/N),Physiological Rest Time Zone(Base/Local)';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where `function`=7488);

-- 7488 查询 rule_parameter的table1Row
select rule_id, param_values,
	CONCAT('*,', param_values) as new_param_values
from rule_parameter
where rule_id in (select id from rule where `function`=7488) and param_names like 'table1Row%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7488 更新 rule_parameter的table1Header，在TZ Diff Range前添加DP Range参数
update rule_parameter
set param_values='DP Range,TZ Diff Range,ACC State,Unacc Away From Base Duration,Compare With Pre Duty DP(Y/N),Standard Min Rest,Physiological Rest(Y/N),Physiological Rest Time Zone(Base/Local)'
where rule_id in (select id from rule where `function`=7488) and param_names='table1Header'
	and param_values='TZ Diff Range,ACC State,Unacc Away From Base Duration,Compare With Pre Duty DP(Y/N),Standard Min Rest,Physiological Rest(Y/N),Physiological Rest Time Zone(Base/Local)';

-- 7488 更新 rule_parameter的table1Row，在开头添加默认值*（DP Range）
update rule_parameter
set param_values=CONCAT('*,', param_values)
where rule_id in (select id from rule where `function`=7488) and param_names like 'table1Row%';