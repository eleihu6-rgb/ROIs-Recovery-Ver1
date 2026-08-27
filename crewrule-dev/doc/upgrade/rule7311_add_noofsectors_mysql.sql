-- CMSPAL-1682 Rule 7311 - 新增No Of Sectors参数
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- mysql
CREATE TABLE `rule_parameter_20260509_1925` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20260509_1925` SELECT * FROM `rule_parameter`;

select * from `rule_parameter_20260509_1925`;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- mysql 7311-------------------------------------------------------------
select * from rule_parameter where rule_id in (select id from rule where `function`=7311) and param_names like 'table%Header%' and 
 param_values='Bases,Compositions,Duty Type,Duty Assignments,Working Assignment Groups,Is Line Training,Flight No,Exclude Flight No,BLH Ranges,Is Layover Rest,Overrideable(Y/N),Base Rest,Rest Multiplied,Override Duty Attributes';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where `function`=7311);

-- 7311 查看现有的table row
select rule_id, param_values,
	CONCAT(SUBSTRING_INDEX(param_values, ',', 5),',*,',SUBSTRING_INDEX(param_values, ',', -9)) as new_param_values, 
	SUBSTRING_INDEX(param_values, ',', 5) as head, 
	SUBSTRING_INDEX(param_values, ',', -9) as tail 
from rule_parameter 
where rule_id in (select id from rule where `function`=7311) and param_names like 'table%Row%';	

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 7311 更新 rule_parameter的table header，在Working Assignment Groups后添加No of Sectors参数
update rule_parameter 
set param_values='Bases,Compositions,Duty Type,Duty Assignments,Working Assignment Groups,No of Sectors,Is Line Training,Flight No,Exclude Flight No,BLH Ranges,Is Layover Rest,Overrideable(Y/N),Base Rest,Rest Multiplied,Override Duty Attributes'
where rule_id in (select id from rule where `function`=7311) and param_names like 'table%Header%' and  
 param_values='Bases,Compositions,Duty Type,Duty Assignments,Working Assignment Groups,Is Line Training,Flight No,Exclude Flight No,BLH Ranges,Is Layover Rest,Overrideable(Y/N),Base Rest,Rest Multiplied,Override Duty Attributes';

-- 7311 更新 rule_parameter的table row，No of Sectors参数设置*作为默认值
update rule_parameter 
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 5),',*,',SUBSTRING_INDEX(param_values, ',', -9))
where rule_id in (select id from rule where `function`=7311) and param_names like 'table%Row%';
