
select * from rule_parameter where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Header%' ;

-- 先查询，new_param_values 参数为最新参数值
select rule_id, param_values,
	concat(SUBSTRING_INDEX(param_values, ',', 7),',*,',SUBSTRING_INDEX(param_values, ',', -1)) as new_param_values, 
	SUBSTRING_INDEX(param_values, ',', 7) as head, 
	SUBSTRING_INDEX(param_values, ',', -1) as tail  
from rule_parameter 
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Row%';


-- 备份表
CREATE TABLE `rule_parameter_20240127_01` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20240127_01` SELECT * FROM `rule_parameter`;


-- 修改数据


-- 3021
-- header部分
update rule_parameter 
set param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Airlines,Brief Time'
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Header%' 
	and param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Brief Time';

-- value部分	
update rule_parameter
set param_values=concat(SUBSTRING_INDEX(param_values, ',', 7),',*,',SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Row%';
	