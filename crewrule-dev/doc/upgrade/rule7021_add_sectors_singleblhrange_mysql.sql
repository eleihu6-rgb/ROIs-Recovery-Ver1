-- ROSCRW-18231 [TG][法规][TCAR] 10.1 FDP Extension with in-flight rest for flight crew - 7021/7317法规修改
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- mysql
CREATE TABLE `rule_parameter_20260424_2219` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20260424_2219` SELECT * FROM `rule_parameter`;

select * from `rule_parameter_20260424_2219`;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- mysql 7021-------------------------------------------------------------
-- 查询7021法规当前的table header
select *from rule_parameter where rule_id in (select id from rule where `function`=7021) and param_names like 'table%Header%' and param_values='is Home Base(Y/N),Compositions,Duty Assignment Groups,Duty Type,Min Rest';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where `function`=7021);

-- 7021 查询 rule_parameter的table row
select rule_id, param_values,
	CONCAT(SUBSTRING_INDEX(param_values, ',', 4),',*,*,' , SUBSTRING_INDEX(param_values, ',', -1)) as new_param_values
from rule_parameter
where rule_id in (select id from rule where `function`=7021) and param_names like 'table%Row%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7021 更新 rule_parameter的table header，7021法规新增Sectors和Single BLH Range参数
update rule_parameter
set param_values='is Home Base(Y/N),Compositions,Duty Assignment Groups,Duty Type,Sectors,Single BLH Range,Min Rest'
where rule_id in (select id from rule where `function`=7021) and param_names like 'table%Header%'
	and param_values='is Home Base(Y/N),Compositions,Duty Assignment Groups,Duty Type,Min Rest';

-- 7021 更新 rule_parameter的table row，在Duty Type后添加*,*作为Sectors和Single BLH Range的默认值
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 4),',*,*,' , SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=7021) and param_names like 'table%Row%';
