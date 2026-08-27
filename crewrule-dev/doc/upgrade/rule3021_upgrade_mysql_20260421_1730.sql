-- CMSCEB-554 Rule3021/3022 - 新增参数Pairing Bases
-- 3021和3022法规 新增筛选参数：Pairing Bases
-- 步骤1： 法规参数数据表备份(备份表后缀为当前时间，格式：YYYYMMDD_HHMM)
-- mysql
CREATE TABLE `rule_parameter_20260421_1727` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20260421_1727` SELECT * FROM `rule_parameter`;

select * from `rule_parameter_20260421_1727`;

-- 步骤2： 先执行select语句，返回记录数相同后才能执行update语句
-- mysql 3021-------------------------------------------------------------
select *from rule_parameter where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Header%' and 
	param_values='Airport,End Airport,Sector Blh Range,Duty BLH Range,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Routes,Brief Time,Effective date,Expired Date';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where `function`=3021);

-- 3021
select rule_id, param_values,
	CONCAT('*,',param_values) as new_param_values
from rule_parameter 
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Row%';


-- mysql 3022-------------------------------------------------------------
select *from rule_parameter where rule_id in (select id from rule where `function`=3022) and param_names like 'table%Header%' and 
	param_values='Airport,Duty Type,Flt Nums,Fleets,Assignment,Airlines,is Training,Debrief Time,Effective date,Expired Date';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where `function`=3022);

-- 3022
select rule_id, param_values,
	CONCAT('*,',param_values) as new_param_values
from rule_parameter 
where rule_id in (select id from rule where `function`=3022) and param_names like 'table%Row%';

-- 步骤3：执行update语句（重要：必须先执行步骤1备份，然后执行步骤2检查，后才能执行）
-- 3021 更新 rule_parameter的table header，添加Pairing Bases
update rule_parameter 
set param_values='Pairing Bases,Airport,End Airport,Sector Blh Range,Duty BLH Range,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Routes,Brief Time,Effective date,Expired Date'
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Header%' and 
	param_values='Airport,End Airport,Sector Blh Range,Duty BLH Range,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Routes,Brief Time,Effective date,Expired Date';

-- 3021 更新 rule_parameter的table row，添加默认值*
update rule_parameter 
set param_values=CONCAT('*,',param_values)
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Row%';



-- 3022 更新 rule_parameter的table header，添加Pairing Bases
update rule_parameter 
set param_values='Pairing Bases,Airport,Duty Type,Flt Nums,Fleets,Assignment,Airlines,is Training,Debrief Time,Effective date,Expired Date'
where rule_id in (select id from rule where `function`=3022) and param_names like 'table%Header%' and 
	param_values='Airport,Duty Type,Flt Nums,Fleets,Assignment,Airlines,is Training,Debrief Time,Effective date,Expired Date';

-- 3022 更新 rule_parameter的table row，添加默认值*
update rule_parameter 
set param_values=CONCAT('*,',param_values)
where rule_id in (select id from rule where `function`=3022) and param_names like 'table%Row%';