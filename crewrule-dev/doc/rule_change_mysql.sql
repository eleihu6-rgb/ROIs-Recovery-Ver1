-- 备份表
CREATE TABLE `rule_20240702_01` LIKE `rule`;
INSERT INTO `rule_20240702_01` SELECT * FROM `rule`;

CREATE TABLE `rule_parameter_20240702_01` LIKE `rule_parameter`;
INSERT INTO `rule_parameter_20240702_01` SELECT * FROM `rule_parameter`;

select * from `rule_20240702_01`;
select * from `rule_parameter_20240702_01`; 

-- 升级前检查Parameter Header一致性，必须一致才能升级。要求下面二个SELECT语句返回记录数一致，第一个SELECT语句：where条件为升级前的header信息
-- 以7016为例
select *from rule_parameter where rule_id in (select id from rule where `function`=7016) and param_names like 'table%Header%' and param_values='Bases,Ranks,Fleets,Teams,Assignments,Max Days Since Last Operating';

select distinct rule_id from rule_parameter where rule_id in (select id from rule where `function`=7016);

-- 2024/6/28 法规6021 ROSCRW-4770 【qqtest】6021，新建任务环，违反transit约束，未告警
-- 6021法规改名：Limit Transit Aircraft Change
update rule set description=replace(description,'Limit Aircraft Change','Limit Transit Aircraft Change'), detail= replace(detail,'Limit Aircraft Change','Limit Transit Aircraft Change') where `function`=6021;

-- 2024/6/28 法规6019 ROSCRW-4771 【qqtest】6019，长中转未超Max Connection，误告警
-- (1) 6019法规改名：Transit Connection Limits
update rule set description=replace(description,'Limits Layover/Transit','Transit Connection Limits'), detail= replace(detail,'Limits Layover/Transit','Transit Connection Limits') where `function`=6019;
-- (2) 法规参数： AC Chg Allowed 改成 Is AC Chg
-- update rule_parameter set  param_values = replace(param_values,',AC Chg Allowed,',',Is AC Chg,') where rule_id in ( select id from rule where `function`=6019) and param_names='table2Header';

-- 2024/7/2 法规7016 ROSCRW-4874 7016【QQ】【法规】1.17.4 Recency Check for CC 扩展
-- 7016法规新增参数：Operating Fleets、Operating Airports

update rule_parameter 
set param_values='Bases,Ranks,Fleets,Teams,Assignments,Max Days Since Last Operating,Operating Fleets,Operating Airports'
where rule_id in (select id from rule where `function`=7016) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Assignments,Max Days Since Last Operating';

update rule_parameter
set param_values=concat(param_values,',*,*') 
where rule_id in (select id from rule where `function`=7016) and param_names like 'table%Row%';

-- 2024/7/8 法规3021 ROSCRW-4946 【QQ】TRAINING-培训排班 Training Roster -- 法规brief和debrief重新计算
-- 3021法规新增参数：is Training
-- header部分
update rule_parameter 
set param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Airlines,is Training,Brief Time'
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Header%' 
	and param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Airlines,Brief Time';

-- value部分	
update rule_parameter
set param_values=concat(SUBSTRING_INDEX(param_values, ',', 8),',N,',SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Row%';

-- 3022法规新增参数：is Training
-- header部分
update rule_parameter 
set param_values='Airport,Duty Type,Flt Nums,Fleets,Assignment,Airlines,is Training,Debrief Time'
where rule_id in (select id from rule where `function`=3022) and param_names like 'table%Header%' 
	and param_values='Airport,Duty Type,Flt Nums,Fleets,Assignment,Airlines,Debrief Time';

-- value部分	
update rule_parameter
set param_values=concat(SUBSTRING_INDEX(param_values, ',', 6),',N,',SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=3022) and param_names like 'table%Row%';

-- 2024/8/5 法规6100 ROSCRW-5822 【QQUAT法规测试】6020新增参数Duty Assigments
-- 6100法规新增参数：Duty Assignments
-- header部分
update rule_parameter
set param_values='Bases,Ranks,Fleets,Duty Assignments,Is Home Base,Acclimatized State,FDP Threshold,Rest Time,FDP Times,Direction,Displacement Adjustment Reference Time'
where rule_id in (select id from rule where `function`=6100) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Is Home Base,Acclimatized State,FDP Threshold,Rest Time,FDP Times,Direction,Displacement Adjustment Reference Time';
	
-- value部分	
update rule_parameter
set param_values=concat(SUBSTRING_INDEX(param_values, ',', 3),',FLY|MVO|MVP,',SUBSTRING_INDEX(param_values, ',', -7)) 
where rule_id in (select id from rule where `function`=6100) and param_names like 'table%Row%';

-- 2024/10/16 法规7214 参数名称调整：No Of Pairing Sector 改成 Min Num of Pairing Sector 
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Segment Assignments,Min Num of Pairing Sector,Min Time Zone Gap,Layover Min Rest,Min WOCL Number' where rule_id in (select id from rule where `function`='7214') and param_names='tableHeader' and param_values = 'Bases,Ranks,Fleets,Teams,Segment Assignments,No Of Pairing Sector,Min Time Zone Gap,Layover Min Rest,Min WOCL Number';


-- 2024/12/19 法规3023 ROSCRW-7839 【法规】phase4【EVAFD】【公版】对3023 3024增加参数 Effective date和Expired Date
-- 3023法规新增参数：Effective date,Expired Date
-- header部分
update rule_parameter set param_values='Airport,DepStart,DepEnd,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Pickup Time,Effective date,Expired Date'
where rule_id in (select id from rule where `function`=3023) and param_names like 'table%Header%' 
	and param_values='Airport,DepStart,DepEnd,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Pickup Time';

-- value部分
update rule_parameter set param_values=CONCAT(param_values,',*,*') 
where rule_id in (select id from rule where `function`=3023) and param_names like 'table%Row%';


-- 2024/12/19 法规3023 ROSCRW-7839 【法规】phase4【EVAFD】【公版】对3023 3024增加参数 Effective date和Expired Date
-- 3024法规新增参数：Effective date,Expired Date
-- header部分
update rule_parameter set param_values='Airport,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Dropoff Time,Effective date,Expired Date'
where rule_id in (select id from rule where `function`=3024) and param_names like 'table%Header%' 
	and param_values='Airport,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Dropoff Time';

-- value部分
update rule_parameter set param_values=CONCAT(param_values,',*,*') 
where rule_id in (select id from rule where `function`=3024) and param_names like 'table%Row%';


-- 2024/12/19 法规3023 ROSCRW-9138 【EVAFD】【RULE】3023/3024 法规新增pairing base参数
-- 3023法规新增参数：Pairing Bases
-- header部分
update rule_parameter set param_values='Pairing Bases,Airport,DepStart,DepEnd,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Pickup Time,Effective date,Expired Date'
where rule_id in (select id from rule where `function`=3023) and param_names like 'table%Header%' 
	and param_values='Airport,DepStart,DepEnd,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Pickup Time,Effective date,Expired Date';

-- value部分
update rule_parameter set param_values=CONCAT('*,', param_values)
where rule_id in (select id from rule where `function`=3023) and param_names like 'table%Row%';


-- 2024/12/19 法规3023 ROSCRW-9138 【EVAFD】【RULE】3023/3024 法规新增pairing base参数
-- 3024法规新增参数：Pairing Bases
-- header部分
update rule_parameter set param_values='Pairing Bases,Airport,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Dropoff Time,Effective date,Expired Date'
where rule_id in (select id from rule where `function`=3024) and param_names like 'table%Header%' 
	and param_values='Airport,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Dropoff Time,Effective date,Expired Date';

-- value部分
update rule_parameter set param_values=CONCAT('*,', param_values)
where rule_id in (select id from rule where `function`=3024) and param_names like 'table%Row%';

-- 2025/01/04 法规8072 ROSCRW-9461 【EVAFD】【RULE】【8072】13.3 大陸航班最多1個外籍
-- 8072法规新增参数：Destination Countries
-- header部分
update rule_parameter set param_values='FLIGHT FLEETS,FLIGHT ASSIGNMENT GROUPS,CREW TEAMS,CREW NATIONALITY,DESTINATION COUNTRIES,ACTING RANKS,DEP,ARR,ATTRIBUTES,REQUIRED QUALIFICATIONS,MIN LIMITS,MAX LIMITS'
where rule_id in (select id from rule where `function`=8072) and param_names like 'table%Header%' 
	and param_values='FLIGHT FLEETS,FLIGHT ASSIGNMENT GROUPS,CREW TEAMS,CREW NATIONALITY,ACTING RANKS,DEP,ARR,ATTRIBUTES,REQUIRED QUALIFICATIONS,MIN LIMITS,MAX LIMITS';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 3) , ',*,' , SUBSTRING_INDEX(param_values, ',', -8))
where rule_id in (select id from rule where `function`=8072) and param_names like 'table%Row%';

-- 2024/01/23 法规8015 ROSCRW-9721 【EVAFD】RULE 8015 增加参数exception assignment groups
-- HEADER
update rule_parameter set param_values='Rest Type,Min Rest Length,Min Calendar Days,Min Local Nights,Location,Exception Assignment Groups'
where rule_id in (select id from rule where function=8015) and param_names like 'table2Header' 
	and param_values='Rest Type,Min Rest Length,Min Calendar Days,Min Local Nights,Location';
	
--value
update rule_parameter set param_values=CONCAT(param_values, ',*')
where rule_id in (select id from rule where function=8015) and param_names like 'table2Row%';

-- 2025/01/21 法规6024 ROSCRW-10075 [QQ] 6024法规standby抓飞法规参数调整
-- 6024法规新增参数：Standby Assignment Groups、Not in WOCL、Not in Early Start参数，移除Time Windows、Time Type(WOCL/ES)参数 2025/1/21 ROSCRW-10075
-- header部分
update rule_parameter set param_values='is Home Base,Compositions,Standby Assignment Groups,Standby Assignments,ACC State,Including Split Duty(Y/N),Split Rest Ranges,Rest Facility,Not in WOCL,Not in Early Start,Max Call out FDP,Extend Max FDP by Standby(Y/N)' where rule_id in (select id from rule where `function`=6024) and param_names like 'table%Header%' 
	and param_values='is Home Base,Compositions,Standby Assignments,ACC State,Including Split Duty(Y/N),Split Rest Ranges,Rest Facility,Time Windows,Time Type(WOCL/ES),Max Call out FDP,Extend Max FDP by Standby(Y/N)';
	
-- value部分
-- tableRow 原来应该有6行，修改后变成5行
-- select rule_id, count(*) from rule_parameter where rule_id in (select id from rule where `function`=6024) and param_names like 'table%Row%' group by rule_id;	
UPDATE `rule_parameter` SET `param_values` = '*,2P|3P,*,SBY03|SBY05|SBY06|SBY07|SBY08|SBY09|SBYAPT05|SBYAPT06|SBYAPT07|SBYAPT12|SBY04|SBY15|SBY16|SBY17|SBY18|SBY19|SBY20|SBY21|SBY,A,*,*,*,02:00-06:00,05:00-07:00,18:00,*' WHERE rule_id in (select id from rule where `function`=6024) and param_names='tableRow1';
UPDATE `rule_parameter` SET `param_values` = '*,2P|3P,*,SBY03|SBY05|SBY06|SBY07|SBY08|SBY09|SBYAPT05|SBYAPT06|SBYAPT07|SBYAPT12|SBY04|SBY15|SBY16|SBY17|SBY18|SBY19|SBY20|SBY21|SBY,A,Y,04:00-999:00,S,*,*,*,Y' WHERE rule_id in (select id from rule where `function`=6024) and param_names='tableRow2';
UPDATE `rule_parameter` SET `param_values` = '*,2P,*,SBY03|SBY05|SBY06|SBY07|SBY08|SBY09|SBYAPT05|SBYAPT06|SBYAPT07|SBYAPT12|SBY04|SBY15|SBY16|SBY17|SBY18|SBY19|SBY20|SBY21|SBY,*,Y,00:00-04:00,*,*,*,16:00,*'  WHERE rule_id in (select id from rule where `function`=6024) and param_names='tableRow3';
UPDATE `rule_parameter` SET `param_values` = '*,2P,*,SBY03|SBY05|SBY06|SBY07|SBY08|SBY09|SBYAPT05|SBYAPT06|SBYAPT07|SBYAPT12|SBY04|SBY15|SBY16|SBY17|SBY18|SBY19|SBY20|SBY21|SBY,*,N,*,*,*,*,16:00,*' WHERE rule_id in (select id from rule where `function`=6024) and param_names='tableRow4';
UPDATE `rule_parameter` SET `param_values` = '*,3P,*,SBY03|SBY05|SBY06|SBY07|SBY08|SBY09|SBYAPT05|SBYAPT06|SBYAPT07|SBYAPT12|SBY04|SBY15|SBY16|SBY17|SBY18|SBY19|SBY20|SBY21|SBY,*,*,*,*,*,*,*,Y' WHERE rule_id in (select id from rule where `function`=6024) and param_names='tableRow5';
delete from `rule_parameter` WHERE rule_id in (select id from rule where `function`=6024) and param_names='tableRow6';
	

-- 2024/01/23 法规8015 ROSCRW-9721 【EVAFD】RULE 8015 增加参数exception assignment groups
-- HEADER
update rule_parameter set param_values='Rest Type,Min Rest Length,Min Calendar Days,Min Local Nights,Location,Exception Assignment Groups'
where rule_id in (select id from rule where function=8015) and param_names like 'table2Header' 
	and param_values='Rest Type,Min Rest Length,Min Calendar Days,Min Local Nights,Location';
	
--value
update rule_parameter set param_values=CONCAT(param_values, ',*')
where rule_id in (select id from rule where function=8015) and param_names like 'table2Row%';


-- 2024/01/24 法规7229 ROSCRW-8712 【EVAFD】【RULE】【7229】8.10/8.11/8.12/8.13/8.14 证照更新期间任务限制
-- 7229法规新增参数：Qualification Or Certificate，Gap Days Without Holiday，Holiday Countries
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Nationalities,Qualification Or Certificate,Day Assignment Code,Gap Days,Prohibited Countries,Prohibited Airports,Prohibited Assignment Groups,Prohibited Assignments,Only Check Layover,Prohibited Layover Countries,Prohibited Layover Airports,Gap Days Without Holiday,Holiday Countries'
where rule_id in (select id from rule where function=7229) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Nationalities,Day Assignment Code,Gap Days,Prohibited Countries,Prohibited Airports,Prohibited Assignment Groups,Prohibited Assignments,Only Check Layover,Prohibited Layover Countries,Prohibited Layover Airports';
	
-- value部分
update rule_parameter set param_values=(SUBSTRING_INDEX(param_values, ',', 4) , ',*,' , SUBSTRING_INDEX(param_values, ',', -9) , ',Y,TW')
where rule_id in (select id from rule where function=7229) and param_names like 'table%Row%';


-- 2024/01/24 法规8048 ROSCRW-9198 【EVAFD】【RULE】8048增加参数
-- 8048法规新增参数：bases，ranks，fleets，teams
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Assignments:Only One Roster In One Day,Exception1(Non-Overlap)(Directional),Exception2(Overlap)(Directional)'
where rule_id in (select id from rule where function=8048) and param_names like 'table%Header%' 
	and param_values='Assignments:Only One Roster In One Day,Exception1(Non-Overlap)(Directional),Exception2(Overlap)(Directional)';
	
-- value部分
update rule_parameter set param_values=CONCAT('*,*,*,*,' ,param_values)
where rule_id in (select id from rule where function=8048) and param_names like 'table%Row%';


-- 2024/01/25 法规7221 ROSCRW-9688 【EVAFD】RULE 7221 增加参数exception assignments
-- 7221法规新增参数：Exception Assignments,Exception Assignment Groups
-- header部分
update rule_parameter set param_names='table2Header'
where rule_id in (select id from rule where function=7221) and param_names='tableHeader';


-- value部分
update rule_parameter set param_names=CONCAT('table2',SUBSTR(PARAM_NAMES, '6', 4))
where rule_id in (select id from rule where function=7221) and param_names like 'table%Row%';

-- 2025/2/5 法规6036 ROSCRW-10228 【QQ】【NLOQQ-401】6001/6036-新增排除Team列表参数
-- 6036,6001法规新增参数：Excluding Teams
-- 6036header部分
update rule_parameter
set param_values='Bases,Ranks,Fleets,Excluding Teams,Duty Assignments,Min Times'
where rule_id in (select id from rule where `function`=6036) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Duty Assignments,Min Times';
	
-- 6036value部分	
update rule_parameter
set param_values=concat(SUBSTRING_INDEX(param_values, ',', 3),',*,',SUBSTRING_INDEX(param_values, ',', -2)) 
where rule_id in (select id from rule where `function`=6036) and param_names like 'table%Row%';

-- 6001header部分
update rule_parameter
set param_values='Excluding Teams,RDO Lead In,Multiple RDO Lead Out,Single RDO Lead Out,Extended Length,Annual Leave Assignments,RDO Assignment,Unassigned Day Assignment,Ignore Length Check Assignment,Ignore Length Check Assignment Group,RDO Space'
where rule_id in (select id from rule where `function`=6001) and param_names like 'table1Header%' 
	and param_values='RDO Lead In,Multiple RDO Lead Out,Single RDO Lead Out,Extended Length,Annual Leave Assignments,RDO Assignment,Unassigned Day Assignment,Ignore Length Check Assignment,Ignore Length Check Assignment Group,RDO Space';
	
-- 6001value部分	
update rule_parameter
set param_values=concat('*,',param_values) 
where rule_id in (select id from rule where `function`=6001) and param_names like 'table1Row%';

-- 2025/02/05 法规6010 ROSCRW-10225 【QQ】【NLOQQ-384】6010-新增法规参数BASES/RANKS/FLEETS/TEAMS
-- 6010法规新增参数：Bases,Ranks,Fleets,Teams

-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Assignments,Min Period Days,Check Out Reference Time,Check In Reference Time' where rule_id in (select id from rule where `function`=6010) and param_names like 'table%Header%' 
	and param_values='Assignments,Min Period Days,Check Out Reference Time,Check In Reference Time';
	
-- value部分
update rule_parameter set param_values=CONCAT('*,*,*,*,' , param_values)
where rule_id in (select id from rule where `function`=6010) and param_names like 'table%Row%';

-- 2025/2/6 法规6115 ROSCRW-10229 【QQ】【NLOQQ-383】6115-新增法规参数
-- 6115法规新增参数：Max Consecutive Day In RP,Is Add Max In RP
-- 6115header部分
update rule_parameter
set param_values='bases,ranks,fleets,duty assignments,Max Consecutive Day,Max Consecutive Day In RP,Add Max Consecutive Day,Add Max Times,Unit,Is Add Max In RP'
where rule_id in (select id from rule where `function`=6115) and param_names like 'table%Header%' 
	and param_values='bases,ranks,fleets,duty assignments,Max Consecutive Day,Add Max Consecutive Day,Add Max Times,Unit';
	
update rule_parameter set  param_values=concat(SUBSTRING_INDEX(param_values, ',', 5),',*,',SUBSTRING_INDEX(param_values, ',', -3),',*')
where rule_id in (select id from rule where `function`=6115) and param_names like 'table%Row%';


-- 2025/2/8 法规6034 ROSCRW-10270 【QQ】6034-新增法规参数，去除LEAVE的检查
-- 6034法规新增参数：Check Assignments,Check Assignment Groups
-- header部分
update rule_parameter
set param_values='Bases,Ranks,Fleets,Duty Earier Than,Max Times,Period,Unit,Check Type,Check Assignments,Check Assignment Groups'
where rule_id in (select id from rule where `function`=6034) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Duty Earier Than,Max Times,Period,Unit,Check Type';
	
-- value部分
update rule_parameter set  param_values=concat(param_values,',FLY,*')
where rule_id in (select id from rule where `function`=6034) and param_names like 'table%Row%';


-- 2025/2/12 法规6026 ROSCRW-10412 【QQ】6026 SBY检查多机型
-- 6026法规
-- 6026 飞行FD
INSERT INTO rule(id, `function`, `instance`, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(6026001, 6026, '001', 'R', 'Limit Fleet Multi for Standby', 'QQ', 'Roster', 'Table', 'FRMS', 'Limit Fleet Multi for Standby', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002987, 6026001, 1, 'tableHeader', 'Segment Assignment Groups,Segment Assignments,Fleet,Required Fleets', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002988, 6026001, 1, 'tableRow1', 'SBY,*,Multi,100+F70+E90', null, 'ROIS', CURRENT_TIMESTAMP);

-- 6026 客舱CC
INSERT INTO rule(id, `function`, `instance`, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(6026002, 6026, '002', 'R', 'Limit Fleet Multi for Standby', 'QQ', 'Roster', 'Table', 'FRMS', 'Limit Fleet Multi for Standby', 'H', 2, 'QQ', 'C', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002989, 6026002, 1, 'tableHeader', 'Segment Assignment Groups,Segment Assignments,Fleet,Required Fleets', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002990, 6026002, 1, 'tableRow1', 'SBY,*,Multi,100+F70+E90', null, 'ROIS', CURRENT_TIMESTAMP);


-- 2025/2/21 法规6025 ROSCRW-10662 【QQ】6025 - 新增max duration参数
-- 6025 更新 rule_parameter的table header，新增参数Max Duration
update rule_parameter set param_values='is Home Base,Assignments,Max DP,Max Duration'
where rule_id in (select id from rule where `function`=6025) and param_names like 'table%Header%' 
	and param_values='is Home Base,Assignments,Max DP';

-- 6025 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(param_values,',9999:00') 
where rule_id in (select id from rule where `function`=6025) and param_names like 'table%Row%';

-- 2025/2/22 法规8008 ROSCRW-10687 【QQ】8008护照法规改进 - 消息描述和新增参数
-- 8008 更新 rule_parameter的table header，新增参数Not Check Countries
update rule_parameter set param_values='Crew Nationality,Destination Country,Travel Doc Types,Validity Unit,Number,Only Check Layover,Flight Numbers,Departure Country,Check on Type(S/D/P),Not Check Countries'
where rule_id in (select id from rule where `function`=8008) and param_names like 'table%Header%' 
	and param_values='Crew Nationality,Destination Country,Travel Doc Types,Validity Unit,Number,Only Check Layover,Flight Numbers,Departure Country,Check on Type(S/D/P)';

-- 8008 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(param_values,',*') 
where rule_id in (select id from rule where `function`=8008) and param_names like 'table%Row%';

-- 2025/2/22 法规8028 ROSCRW-10687 【QQ】8008护照法规改进 - 消息描述和新增参数
-- 8028法规
INSERT INTO rule(id, `function`, `instance`, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(8028001, 8028, '001', 'R', 'Restrict Duty by the Crew Nationality', 'QQ', 'Roster', 'Table', 'FRMS', 'Restrict Duty by the Crew Nationality', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003007, 8028001, 1, 'tableHeader', 'Crew Nationalities,Flight Numbers,Flight Countries,Flight Types', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003008, 8028001, 1, 'tableRow1', 'AU|NZ,*,*,I', null, 'ROIS', CURRENT_TIMESTAMP);

-- 2025/3/4 法规7215 mantis 0010977: 0225外base時數測試更新（情境3 SIM+FLT）
-- 7215 更新 rule_parameter的table header，新增参数Number Range of Segment in Duty
update rule_parameter set param_values='Assignment Groups,Assignments,Number Range of Segment in Duty,IP/CK&Chief Pilot Credit,Course Code,Role(Trainer/Trainee),IP/CK QUAL,Chief Pilot Rank,Credit,Credit BT Gap,Percent,Delay Buffer,Multiple'
where rule_id in (select id from rule where `function`=7215) and param_names like 'table%Header%' 
	and param_values='Assignment Groups,Assignments,IP/CK&Chief Pilot Credit,Course Code,Role(Trainer/Trainee),IP/CK QUAL,Chief Pilot Rank,Credit,Credit BT Gap,Percent,Delay Buffer,Multiple';

-- 7215 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 2) , ',*,' , SUBSTRING_INDEX(param_values, ',', -10))
where rule_id in (select id from rule where `function`=7215) and param_names like 'table%Row%';

-- 2025/3/4 法规7215 ROSCRW-10854 CR-【EVAFD】【RULE】7215 Credit hours：增加crew teams字段
-- 7215 更新 rule_parameter的table header，新增参数Teams
update rule_parameter set param_values='Teams,Assignment Groups,Assignments,Number Range of Segment in Duty,IP/CK&Chief Pilot Credit,Course Code,Role(Trainer/Trainee),IP/CK QUAL,Chief Pilot Rank,Credit,Credit BT Gap,Percent,Delay Buffer,Multiple'
where rule_id in (select id from rule where `function`=7215) and param_names like 'table%Header%' 
	and param_values='Assignment Groups,Assignments,Number Range of Segment in Duty,IP/CK&Chief Pilot Credit,Course Code,Role(Trainer/Trainee),IP/CK QUAL,Chief Pilot Rank,Credit,Credit BT Gap,Percent,Delay Buffer,Multiple';

-- 7215 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT('*,' , param_values)
where rule_id in (select id from rule where `function`=7215) and param_names like 'table%Row%';

-- 2025/3/11 法规6100 ROSCRW-10904 [TG][法规]6100 Rest Period增加功能：一个flight的FT>9:00或FT>8:00且侵占02:00-05:59时，设定Min Rest; Min Rest的基准为可配置
-- 6100 更新 rule_parameter的table header，新增参数Sector BLH Ranges, Encroach Time,Benchmark 修改FDP Thredhold到Period Thredhold 
update rule_parameter set param_values='Bases,Ranks,Fleets,Duty Assignments,Sector BLH Ranges,Encroach Time,Is Home Base,Acclimatized State,Benchmark,Period Threshold,Rest Time,FDP Times,Direction,Displacement Adjustment Reference Time'
where rule_id in (select id from rule where `function`=6100) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Duty Assignments,Is Home Base,Acclimatized State,FDP Threshold,Rest Time,FDP Times,Direction,Displacement Adjustment Reference Time';

-- 6100 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 4) , ',*,*,' , SUBSTRING_INDEX(SUBSTRING_INDEX(param_values, ',', -7), ',', 2) ,  ',*,', SUBSTRING_INDEX(param_values, ',', -5))
where rule_id in (select id from rule where `function`=6100) and param_names like 'table%Row%';


-- 2025/3/11 法规7222 ROSCRW-6546 【EVAFD】11.13 Max layovers in trips for certain stations
-- 7222 更新 rule_parameter的table header，新增参数Pairing Bases,Eff Date,Exp Date
update rule_parameter set param_values='Pairing Bases,Eff Date,Exp Date,Layover Stations,Max Layover Times'
where rule_id in (select id from rule where `function`=7222) and param_names like 'table%Header%' 
	and param_values='Layover Stations,Max Layover Times';

-- 7222 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT('*,2025-01-01,2025-12-31,', param_values) 
where rule_id in (select id from rule where `function`=7222) and param_names like 'table%Row%';

-- 2025/3/13 法规7231 ROSCRW-6551 【EVAFD】【training】【RULE】【7231】13.17/13.18/13.19/13.22 MC/ILC 要在過期前5天安排/MC需避开TW法定假日/VIS需避开US法定假日
-- 7231法规
INSERT INTO `rule`(`id`, `function`, `instance`, `class`, `description`, `reference`, `category`, `store_structure`, `source`, `detail`, `overridability`, `severity`, `filiale`, `division`, `owner`, `locked`, `modified_by`, `last_modified`) VALUES (7231001, 7231, '001', 'B', 'Renew Certificate in Advance', 'EVA', 'Training', 'Table', 'Company', 'Renew Certificate in Advance', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`) VALUES (200003009, 7231001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Certificate Types,Assignment,Course Codes,Skip Holiday(Y/N),Holiday Countries,Renewal Window,Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`) VALUES (200003010, 7231001, 1, 'tableRow1', '*,*,*,*,MCC,MC,*,Y,TW,5-30,WD', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`) VALUES (200003011, 7231001, 1, 'tableRow1', '*,*,*,*,VIS,VIS,*,Y,US|TW,5-30,WD', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO `rule_parameter`(`id`, `rule_id`, `phase_id`, `param_names`, `param_values`, `modified_by`, `last_modified`) VALUES (200003012, 7231001, 1, 'tableRow1', '*,*,*,*,IL4|IL5|IL6,ILC,*,Y,TW,5-30,WD', 'ROIS', CURRENT_TIMESTAMP);

-- 2025/3/14 法规6100 ROSCRW-10904 [TG][法规]6100 Rest Period增加功能：一个flight的FT>9:00或FT>8:00且侵占02:00-05:59时，设定Min Rest; Min Rest的基准为可配置
-- 6100 更新 rule_parameter的table header，新增参数Duty TZ Diff
update rule_parameter set param_values='Bases,Ranks,Fleets,Duty Assignments,Duty TZ Diff,Sector BLH Ranges,Encroach Time,Is Home Base,Acclimatized State,Benchmark,Period Threshold,Rest Time,FDP Times,Direction,Displacement Adjustment Reference Time'
where rule_id in (select id from rule where `function`=6100) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Duty Assignments,Sector BLH Ranges,Encroach Time,Is Home Base,Acclimatized State,Benchmark,Period Threshold,Rest Time,FDP Times,Direction,Displacement Adjustment Reference Time';

-- 6100 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 4) , ',*,' , SUBSTRING_INDEX(param_values, ',', -10))
where rule_id in (select id from rule where `function`=6100) and param_names like 'table%Row%';

-- 2025/3/18 法规7219 ROSCRW-11222 【EVAFD】【mantis 0010984】7219 WorkingHour计算新增Course Code参数
-- 7219 更新 rule_parameter的table1 header，新增参数Course Code
update rule_parameter set param_values='Segment Assignment Groups,Segment Assignments,Other Segment Assignments in Duty,Number Range of Segment in Duty,Any One of Segment in Duty Cross Months,Segment Cross Months,Course Code,Training Roles,Working Hour,Percent,Max Working Hour,Split Method'
where rule_id in (select id from rule where `function`=7219) and param_names like 'table1Header%' 
	and param_values='Segment Assignment Groups,Segment Assignments,Other Segment Assignments in Duty,Number Range of Segment in Duty,Any One of Segment in Duty Cross Months,Segment Cross Months,Training Roles,Working Hour,Percent,Max Working Hour,Split Method';

-- 7219 更新 rule_parameter的table2 header，新增参数Course Code
update rule_parameter set param_values='Roster Assignment Groups,Roster Assignments,Course Code,Working Hour'
where rule_id in (select id from rule where `function`=7219) and param_names like 'table2Header%' 
	and param_values='Roster Assignment Groups,Roster Assignments,Working Hour';

-- 7219 更新 rule_parameter的table1 row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 6) , ',*,' , SUBSTRING_INDEX(param_values, ',', -5))
where rule_id in (select id from rule where `function`=7219) and param_names like 'table1Row%';

-- 7219 更新 rule_parameter的table2 row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 2) , ',*,' , SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=7219) and param_names like 'table2Row%';

-- 2025/3/20 法规7219 ROSCRW-11380 [EVAFD] 7219 WH计算新增参数：是否紧接飞行航段
-- 7219 更新 rule_parameter的table1 header，新增参数Following Pairing(Y/N)
update rule_parameter set param_values='Segment Assignment Groups,Segment Assignments,Other Segment Assignments in Duty,Number Range of Segment in Duty,Any One of Segment in Duty Cross Months,Segment Cross Months,Following Pairing(Y/N),Course Code,Training Roles,Working Hour,Percent,Max Working Hour,Split Method'
where rule_id in (select id from rule where `function`=7219) and param_names like 'table1Header%' 
	and param_values='Segment Assignment Groups,Segment Assignments,Other Segment Assignments in Duty,Number Range of Segment in Duty,Any One of Segment in Duty Cross Months,Segment Cross Months,Course Code,Training Roles,Working Hour,Percent,Max Working Hour,Split Method';

-- 7219 更新 rule_parameter的table2 header，新增参数Following Pairing(Y/N)
update rule_parameter set param_values='Roster Assignment Groups,Roster Assignments,Following Pairing(Y/N),Course Code,Working Hour'
where rule_id in (select id from rule where `function`=7219) and param_names like 'table2Header%' 
	and param_values='Roster Assignment Groups,Roster Assignments,Course Code,Working Hour';

-- 7219 更新 rule_parameter的table1 row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 6) , ',*,' , SUBSTRING_INDEX(param_values, ',', -6))
where rule_id in (select id from rule where `function`=7219) and param_names like 'table1Row%';

-- 7219 更新 rule_parameter的table2 row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 2) , ',*,' , SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7219) and param_names like 'table2Row%';


-- 2025/3/25 法规8014 ROSCRW-11421 [TG][法规]11.6 General Qualification Check for operating cargo flights
-- 8014 更新 rule_parameter的table header，新增参数Service Type
update rule_parameter set param_values='Active Ranks,Acting Ranks,Flight Fleets,Seg Types,Registers,Quals,Assignment Groups,Alert Buffer,Alert Unit,Service Type'
where rule_id in (select id from rule where `function`=8014) and param_names like 'table%Header%' 
	and param_values='Active Ranks,Acting Ranks,Flight Fleets,Seg Types,Registers,Quals,Assignment Groups,Alert Buffer,Alert Unit';

-- 8014 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(param_values, ',*') 
where rule_id in (select id from rule where `function`=8014) and param_names like 'table%Row%';

-- 2025/04/14 法规7215 ROSCRW-11954 【EVAFD】【RULE】立荣B7(UNI)特有credit hour计算规则（7215）
-- 7215新增参数Segment from Departure to Arrival、Split Method(SPAN/START) 
-- header部分
update rule_parameter set param_values='Teams,Assignment Groups,Assignments,Segment from Departure to Arrival,Number Range of Segment in Duty,IP/CK&Chief Pilot Credit,Course Code,Role(Trainer/Trainee),IP/CK QUAL,Chief Pilot Rank,Credit,Credit BT Gap,Percent,Delay Buffer,Multiple,Split Method(SPAN/START)'
where rule_id in (select id from rule where `function`=7215) and param_names like 'table%Header%' 
	and param_values='Teams,Assignment Groups,Assignments,Number Range of Segment in Duty,IP/CK&Chief Pilot Credit,Course Code,Role(Trainer/Trainee),IP/CK QUAL,Chief Pilot Rank,Credit,Credit BT Gap,Percent,Delay Buffer,Multiple';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 3) , ',*,' , SUBSTRING_INDEX(param_values, ',', -11), ',*')
where rule_id in (select id from rule where `function`=7215) and param_names like 'table%Row%';

-- 2025/04/14 法规7219 ROSCRW-11228 CR-【EVAFD】【RULE】working hours 7219邏輯修訂
-- 7219table1 header，新增参数Min Working Hour
-- table1 header部分
update rule_parameter set param_values='Segment Assignment Groups,Segment Assignments,Other Segment Assignments in Duty,Number Range of Segment in Duty,Any One of Segment in Duty Cross Months,Segment Cross Months,Following Pairing(Y/N),Course Code,Training Roles,Working Hour,Percent,Min Working Hour,Max Working Hour,Split Method'
where rule_id in (select id from rule where `function`=7219) and param_names like 'table1Header%' 
	and param_values='Segment Assignment Groups,Segment Assignments,Other Segment Assignments in Duty,Number Range of Segment in Duty,Any One of Segment in Duty Cross Months,Segment Cross Months,Following Pairing(Y/N),Course Code,Training Roles,Working Hour,Percent,Max Working Hour,Split Method';

-- table1 value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 11) , ',*,' , SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7219) and param_names like 'table1Row%';

-- 2025/04/16 法规7212 ROSCRW-12008 【EVAFD】【RULE】7212/7214逻辑调整
-- 7214法规新增参数：sleep cycle start, sleep cycle end, 修改法规参数min wocl number -> min sleep cycle
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Last Duty Compositions,Segment Assignments,Sector BLH Ranges,Pairing End Stations,Layover Min Rest,Sleep Cycle Start,Sleep Cycle End,Min Sleep Cycles'
where rule_id in (select id from rule where `function`=7212) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Last Duty Compositions,Segment Assignments,Sector BLH Ranges,Pairing End Stations,Layover Min Rest,Min WOCL Number';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 9) , ',22:00,06:00,' , SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=7212) and param_names like 'table%Row%';


-- 2025/04/16 法规7212 ROSCRW-12008 【EVAFD】【RULE】7212/7214逻辑调整
-- 7214法规新增参数：sleep cycle start, sleep cycle end, 修改法规参数min wocl number -> min sleep cycle
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Segment Assignments,Min Num of Pairing Sector,Min Time Zone Gap,Layover Min Rest,Sleep Cycle Start,Sleep Cycle End,Min Sleep Cycles'
where rule_id in (select id from rule where `function`=7214) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Segment Assignments,Min Num of Pairing Sector,Min Time Zone Gap,Layover Min Rest,Min WOCL Number';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 8) , ',22:00,06:00,' , SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=7214) and param_names like 'table%Row%';

-- 2025/04/17 法规8008 ROSCRW-11339 【EVAFD】【RULE】【8008】增加参数airports
-- 8008法规新增参数：airports
-- header部分
update rule_parameter set param_values='Crew Nationality,Destination Country,Travel Doc Types,Validity Unit,Number,Only Check Layover,Flight Numbers,Airports,DEPARTURE COUNTRY,CHECK ON TYPE(S/D/P)'
where rule_id in (select id from rule where `function`=8008) and param_names like 'table%Header%' 
	and param_values='Crew Nationality,Destination Country,Travel Doc Types,Validity Unit,Number,Only Check Layover,Flight Numbers,DEPARTURE COUNTRY,CHECK ON TYPE(S/D/P)';
	
-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 7) , ',*,' , SUBSTRING_INDEX(PARAM_VALUES, ',' , -2))
where rule_id in (select id from rule where function=8008) and param_names like 'table%Row%';

-- 2025/04/17 法规8008 ROSCRW-11339 【EVAFD】【RULE】【8008】增加参数airports
-- 8008法规新增参数：airports
-- header部分
update rule_parameter set param_values='Assignments:Only One Roster In One Day,Exception1(Non-Overlap)(Directional),Exception2(Overlap)(Directional),Check By Brief'
where rule_id in (select id from rule where `function`=8048) and param_names like 'table%Header%' 
	and param_values='Assignments:Only One Roster In One Day,Exception1(Non-Overlap)(Directional),Exception2(Overlap)(Directional)';
	
-- value部分
update rule_parameter set param_values=CONCAT(param_values, ',N') 
where rule_id in (select id from rule where `function`=8048) and param_names like 'table%Row%';


-- 2025/05/19 法规3021 ROSCRW-12311 [TG][法规][OMA]Positioning duty check-in时间需要单独设定
-- 3021法规新增参数：duty assignments
-- header部分
update rule_parameter set param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Brief Time'
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Header%' 
	and param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Airlines,is Training,Brief Time';
	
-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 7) , ',*,' , SUBSTRING_INDEX(PARAM_VALUES, ',' , -3))
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Row%';


-- 2025/05/20 法规8023 ROSCRW-12858 【EVAFD】【RULE】8023增加参数控制具体月份
-- 8023法规新增参数：month numbers
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Crew Teams,DO Assignment Group,Min DO,Period,Unit,Month Numbers,Utilize Post Duty Rest,Count Blank Day,Count Layover,Layover Timemode'
where rule_id in (select id from rule where `function`=8023) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Crew Teams,DO Assignment Group,Min DO,Period,Unit,Utilize Post Duty Rest,Count Blank Day,Count Layover,Layover Timemode';
	
-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 8) , ',*,' , SUBSTRING_INDEX(PARAM_VALUES, ',' , -4))
where rule_id in (select id from rule where `function`=8023) and param_names like 'table%Row%';

-- 2025/05/20 法规7273 ROSCRW-12827 7273【3EVAFD】【RULE】增加type参数，用来控制pairing内航段衔接关系
-- 7273法规新增参数：type
-- header部分
update rule_parameter set param_values='Airports,Inbound Assignments,Inbound Flight Fleets,Inbound Flight DIR,Outbound Assignments,Outbound Flight Fleets,Outbound Flight DIR,Is Aircraft Change,MCT,Type'
where rule_id in (select id from rule where `function`=7273) and param_names like 'table%Header%' 
	and param_values='Airports,Inbound Assignments,Inbound Flight Fleets,Inbound Flight DIR,Outbound Assignments,Outbound Flight Fleets,Outbound Flight DIR,Is Aircraft Change,MCT';
	
-- value部分
update rule_parameter set param_values=CONCAT(PARAM_VALUES , ',DUTY')
where rule_id in (select id from rule where `function`=7273) and param_names like 'table%Row%';


-- 2025/06/04 法规8054 ROSCRW-12445 [TG][法规][OMA]Fleet recency 8054法规修改
-- 8054法规新增参数：unit,qual
-- header部分
update rule_parameter set param_values='Base,Rank,Acting Rank,Fleet,Recency Fleet,Operate,Assignment,Min Times,Backward Period,Unit,Qual'
where rule_id in (select id from rule where `function`=8054) and param_names like 'table%Header%' 
	and param_values='Base,Rank,Acting Rank,Fleet,Recency Fleet,Operate,Assignment,Min Times,Backward Period CD';
	
-- value部分
update rule_parameter set param_values=CONCAT(PARAM_VALUES , ',CD,*')
where rule_id in (select id from rule where `function`=8054) and param_names like 'table%Row%';


-- 2025/06/05 法规8022 ROSCRW-12443 [TG][法规][OMA]Airport/Enroute recency，8022修改
-- 8022法规新增参数：Enroute,Qualification
-- header部分
update rule_parameter set param_values='Rank,Fleet,Airport,Operate,Required Times,Recency Period,Unit,Use Projected Data,Renew Buffer,Renew Unit,Enroute,Qualification'
where rule_id in (select id from rule where `function`=8022) and param_names like 'table%Header%' 
	and param_values='Rank,Fleet,Airport,Operate,Required Times,Recency Period,Unit,Use Projected Data,Renew Buffer,Renew Unit';
	
-- value部分
update rule_parameter set param_values=CONCAT(PARAM_VALUES , ',*,*')
where rule_id in (select id from rule where `function`=8022) and param_names like 'table%Row%';

-- 2025/06/21 EVAFD mantis 0011179: 已創建完整composition的pairing，在split pairing後被刪除，系統沒有出現人數不足的相關告警(FDP/FT)
insert into system_parameter(id, param_name, param_values, app_ids, param_desc, modified_by, last_modified) values ('1002', 'DEFAULT_COMPOSITION_MODE', 'MIN', NULL, '默认配比处理方式 取值：MIN - 最小配比、FLT - 获得航班， NA - 返回空配比', 'ROIS', CURRENT_TIMESTAMP);

-- 2025/06/25 法规3001 CMSPAL-91 PCAR 1.10.2 - 改造 3001 法规 - min connection time
-- 3001法规新增参数：Fleets, Sub Fleets, Max Conn
-- header部分
update rule_parameter set param_values='Airport,Inbound Duty,Outbound Duty,Aircraft Change,FLT2FERRY,FERRY2FLT,DHD2FLT,FLT2DHD,TRAIN2FLT,FLT2TRAIN,Fleets,Sub Fleets,Mct,Airline Change,Max Conn'
where rule_id in (select id from rule where `function`=3001) and param_names like 'table%Header%' 
	and param_values='Airport,Inbound Duty,Outbound Duty,Aircraft Change,FLT2FERRY,FERRY2FLT,DHD2FLT,FLT2DHD,TRAIN2FLT,FLT2TRAIN,Mct,Airline Change';
	
-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(PARAM_VALUES, ',', 10) , '*,*,' , SUBSTRING_INDEX(PARAM_VALUES, ',', -2) , ',*')
where rule_id in (select id from rule where `function`=3001) and param_names like 'table%Row%';

-- 2025/06/26 法规3021 ROSCRW-12761 【法规】【IT】对3021 3022增加参数 Effective date和Expired Date
-- 3021法规新增参数：Effective date,Expired Date
-- header部分
update rule_parameter set param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Brief Time,Effective date,Expired Date'
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Header%' 
	and param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Brief Time';
	
update rule_parameter set param_values='Airport,Duty Type,Flt Nums,Fleets,Assignment,Airlines,is Training,Debrief Time,Effective date,Expired Date'
where rule_id in (select id from rule where `function`=3022) and param_names like 'table%Header%' 
	and param_values='Airport,Duty Type,Flt Nums,Fleets,Assignment,Airlines,is Training,Debrief Time';

-- value部分
update rule_parameter set param_values=CONCAT(param_values,',*,*') 
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Row%';

-- value部分
update rule_parameter set param_values=CONCAT(param_values,',*,*') 
where rule_id in (select id from rule where `function`=3022) and param_names like 'table%Row%';

-- 2025/07/04 法规6022 ROSCRW-13859 [TG][法规]延误航班Max FDP和Actual FDP计算规则
-- 6022法规新增参数：Amount of Delay Ranges
-- header部分
update rule_parameter set param_values='Is Home Base,Amount of Notification Ranges,Amount of Delay Ranges,Is Used New Reporting Time,Original Reporting Time Delta'
where rule_id in (select id from rule where `function`=6022) and param_names like 'tableHeader%' 
	and param_values='Is Home Base,Amount of Notification Ranges,Is Used New Reporting Time,Original Reporting Time Delta';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 2) , ',*,' , SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=6022) and param_names like 'tableRow%';


-- 2025/07/04 法规7219 ROSCRW-13841 [EVAFD] 7219 新增参数Pairing Assignments和Duty Assignments
-- 7219法规新增参数：Pairing Assignments,Duty Assignments
-- header部分 table1 header
update rule_parameter set param_values='Pairing Assignments,Duty Assignments,Segment Assignment Groups,Segment Assignments,Other Segment Assignments in Duty,Number Range of Segment in Duty,Any One of Segment in Duty Cross Months,Segment Cross Months,Following Pairing(Y/N),Course Code,Training Roles,Working Hour,Percent,Min Working Hour,Max Working Hour,Split Method'
where rule_id in (select id from rule where `function`=7219) and param_names like 'table1Header%' 
	and param_values='Segment Assignment Groups,Segment Assignments,Other Segment Assignments in Duty,Number Range of Segment in Duty,Any One of Segment in Duty Cross Months,Segment Cross Months,Following Pairing(Y/N),Course Code,Training Roles,Working Hour,Percent,Min Working Hour,Max Working Hour,Split Method';

-- value部分 table1 row
update rule_parameter set param_values=CONCAT('*,*,' , param_values)
where rule_id in (select id from rule where `function`=7219) and param_names like 'table1Row%';

-- 2025/07/10 法规6023 ROSCRW-14069 [TG][法规] 6023新增参数：是否使用计划起飞时间is Schedule Departure Time(Y/N)
-- 6023法规新增参数：is Schedule Departure Time(Y/N)
-- header部分 table header
update rule_parameter set param_values='Amount of Total Delay,Revised or Original FDP Start Time(R/O),FDP Start Time Delta,is Schedule Departure Time(Y/N)'
where rule_id in (select id from rule where `function`=6023) and param_names like 'tableHeader%' 
	and param_values='Amount of Total Delay,Revised or Original FDP Start Time(R/O),FDP Start Time Delta';

-- value部分 table row
update rule_parameter set param_values=CONCAT(param_values, ',*')
where rule_id in (select id from rule where `function`=6023) and param_names like 'tableRow%';

-- 2025/07/16 法规7251 ROSCRW-14063 【EVAFD】7251 training-web-pairing chart-PNR设定新增栏位 footprint-法规
-- 7251法规新增参数：PNR Exception Code
-- header部分 table header
update rule_parameter set param_values='Type,PNR Exception Code'
where rule_id in (select id from rule where `function`=7251) and param_names like 'tableHeader%' 
	and param_values='Type';
	
-- value部分 table row
update rule_parameter set param_values=CONCAT(param_values, ',*')
where rule_id in (select id from rule where `function`=7251) and param_names like 'tableRow%';

-- 2025/07/24 法规2124 CMSPAL-176 2124增强：根据attribute设置Min Rest At base
-- 2124法规新增参数：Attributes, DP Lower, DP Upper
update rule_parameter set param_values='Composition,ASSIGNMENTS,With_Bunk,Landing_Times_Lower,Landing_Times_Upper,BLH Lower,BLH Upper,FDP Lower,FDP Upper,DP Lower,DP Upper,Attributes,is Cross Midnight,is Delay,Min Rest'
where rule_id in (select id from rule where `function`=2124) and param_names like 'tableHeader%' 
	and param_values='Composition,ASSIGNMENTS,With_Bunk,Landing_Times_Lower,Landing_Times_Upper,BLH Lower,BLH Upper,FDP Lower,FDP Upper,is Cross Midnight,is Delay,Min Rest';

-- value部分 table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 9) , ',00:00,999:00,*,' , SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=2124) and param_names like 'tableRow%';

-- 2025/07/29 法规7257 ROSCRW-14515 【EVAFD】training rule 7257： 告警提示修改
-- 7257法规新增参数：Number of Days
-- header部分 table header
-- 7257 更新 rule_parameter的table header，新增参数：Number of Days
update rule_parameter set param_values='Course Codes,Course Local Dates,Number of Days,Number Range'
where rule_id in (select id from rule where `function`=7257) and param_names like 'tableHeader%' 
	and param_values='Course Codes,Course Local Dates,Number Range';

-- value部分 table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 2) , ',1,' , SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=7257) and param_names like 'tableRow%';

-- 2025/08/03 法规7249 ROSCRW-14464 EVAFD，7249，法规参数命名优化
-- 7249法规 参数修改：Period改成Unit，Min Number改成 Min Limits of Course，新增参数Period
-- header部分 table header
-- 7249 更新 rule_parameter的table header，参数修改：Period改成Unit，Min Number改成 Min Limits of Course，新增参数Period
update rule_parameter set param_values='Crew Fleets,Footprint Subtypes,Course Codes,Begin Reference Time(IOE/FDD),End Reference Time(IOE/FDD),Begin Day,End Day,Period,Unit,Min Limits of Course'
where rule_id in (select id from rule where `function`=7249) and param_names like 'tableHeader%' 
	and param_values='Crew Fleets,Footprint Subtypes,Course Codes,Begin Reference Time(IOE/FDD),End Reference Time(IOE/FDD),Begin Day,End Day,Period,Min Number';
	
-- value部分 table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 7) , ',1,' , SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7249) and param_names like 'tableRow%';


-- 2025/08/05 法规7274 ROSCRW-14469 EVAFD，7274，增加一个Sub Footprint Types参数
-- 法规7274 新增参数Sub Footprint Types
-- header部分 table header
-- 7274 新增参数Sub Footprint Types
update rule_parameter set param_values='Routes,Crew Roles,Acting Ranks,Footprint Types,Sub Footprint Types,IOE Phase,Course Codes,Min Composition Without TE'
where rule_id in (select id from rule where `function`=7274) and param_names like 'tableHeader%' 
	and param_values='Routes,Crew Roles,Acting Ranks,Footprint Types, IOE Phase,Course Codes,Min Composition Without TE';

-- value部分 table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 4) || ',*,' || SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=7274) and param_names like 'tableRow%';

-- 2025/08/05 法规7263 ROSCRW-14526 [UAT][TG][法规]7263法规修改可以设定在duty还是segment级别检查WOCL
-- 法规7263 新增参数Check Mode
-- header部分 table header
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Period,Unit,Min Limits,Max Limits,Check Type,Check Mode'
where rule_id in (select id from rule where `function`=7263) and param_names like 'tableHeader%' 
	and param_values='Bases,Ranks,Fleets,Teams,Period,Unit,Min Limits,Max Limits,Check Type';

-- value部分 table row
update rule_parameter set param_values=CONCAT(param_values , ',F')
where rule_id in (select id from rule where `function`=7263) and param_names like 'tableRow%';

-- 2025/08/05 法规7215 ROSCRW-14264 EVA test，外base到TPE执行SIM IP+SIM TE，去程HSR没有算到CH，SIM IP的CH算多了
-- 法规7215 新增参数Role(Trainer/Trainee) in Roster
-- header部分 table header
update rule_parameter set param_values='Teams,Assignment Groups,Assignments,Segment from Departure to Arrival,Number Range of Segment in Duty,IP/CK&Chief Pilot Credit,Course Code,Role(Trainer/Trainee),Role(Trainer/Trainee) in Roster,IP/CK QUAL,Chief Pilot Rank,Credit,Credit BT Gap,Percent,Delay Buffer,Multiple,Split Method(SPAN/START)'
where rule_id in (select id from rule where `function`=7215) and param_names like 'table%Header%' 
	and param_values='Teams,Assignment Groups,Assignments,Segment from Departure to Arrival,Number Range of Segment in Duty,IP/CK&Chief Pilot Credit,Course Code,Role(Trainer/Trainee),IP/CK QUAL,Chief Pilot Rank,Credit,Credit BT Gap,Percent,Delay Buffer,Multiple,Split Method(SPAN/START)';

-- value部分 table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 8) , ',*,' , SUBSTRING_INDEX(param_values, ',', -8))
where rule_id in (select id from rule where `function`=7215) and param_names like 'table%Row%';

-- 2025/08/05 法规2112 ROSCRW-14570 [UAT][TG][法规]2112增加参数可以设定在Duty或者Pairing级别混飞
-- 法规2112 新增参数Check Mode
-- header部分 table header
update rule_parameter set param_values='Comb,Allowable_Fleet_Mix,Check_Mode'
where rule_id in (select id from rule where `function`=2112) and param_names like 'table2Header%' 
	and param_values='Comb,Allowable_Fleet_Mix';

-- value部分 table row
update rule_parameter set param_values=CONCAT(param_values , ',D')
where rule_id in (select id from rule where `function`=2112) and param_names like 'table2Row%';

-- 2025/08/07 法规8023 ROSCRW-14635 8023法规新增固定周期逻辑
-- 法规8023 新增参数Ref Date,is Rolling
-- header部分 table header
update rule_parameter set param_values='Bases,Ranks,Fleets,Crew Teams,DO Assignment Group,Min DO,Period,Unit,Utilize Post Duty Rest,Count Blank Day,Count Layover,Layover Timemode,Ref Date,Is Rolling'
where rule_id in (select id from rule where `function`=8023) and param_names like 'tableHeader%' 
	and param_values='Bases,Ranks,Fleets,Crew Teams,DO Assignment Group,Min DO,Period,Unit,Utilize Post Duty Rest,Count Blank Day,Count Layover,Layover Timemode';

-- value部分 table row
update rule_parameter set param_values=CONCAT(param_values , ',*,Y')
where rule_id in (select id from rule where `function`=8023) and param_names like 'tableRow%';


-- 2025/08/14 法规7263 ROSCRW-14848 [UAT][TG][法规]7263法规修改添加assignment检查
-- 法规7263 新增参数Assignments
-- header部分 table header
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Assignments,Period,Unit,Min Limits,Max Limits,Check Type,Check Mode'
where rule_id in (select id from rule where `function`=7263) and param_names like 'tableHeader%' 
	and param_values='Bases,Ranks,Fleets,Teams,Period,Unit,Min Limits,Max Limits,Check Type,Check Mode';

-- value部分 table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 4) , ',*,' , SUBSTRING_INDEX(param_values, ',', -6))
where rule_id in (select id from rule where `function`=7263) and param_names like 'tableRow%';

-- 2025/08/17 法规7203 CMSPAL-204 Rule - 根据报到时间决定最大航段数(改造7203)
-- 法规7203 新增参数Bases,Compositions,Report Time Ranges
-- header部分 table header
update rule_parameter set param_values='Bases,Compositions,Duty Type,Segment Assignments,Report Time Ranges,Sector BLH Ranges,Max Sector'
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Header%' 
	and param_values='Duty Type,Segment Assignments,Sector BLH Ranges,Max Sector';

-- value部分 table row
update rule_parameter set param_values=CONCAT('*,*,' , SUBSTRING_INDEX(param_values, ',', 2),',*,',SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Row%';


-- 2025/08/20 法规7267 ROSCRW-14778 CR--【EVAFD】【RULE】7212及分身7267（基于计划时间）逻辑调整（7.6 Minimum Sleep Cycle at Layover Station）
-- 7267法规新增参数：sleep cycle start, sleep cycle end, 修改法规参数min wocl number -> min sleep cycle
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Last Duty Compositions,Segment Assignments,Sector BLH Ranges,Pairing End Stations,Layover Min Rest,Sleep Cycle Start,Sleep Cycle End,Min Sleep Cycles'
where rule_id in (select id from rule where `function`=7267) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Last Duty Compositions,Segment Assignments,Sector BLH Ranges,Pairing End Stations,Layover Min Rest,Min WOCL Number';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 9) , ',22:00,06:00,' , SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=7267) and param_names like 'table%Row%';

-- 2025/08/21 法规8001 ROSCRW-4493 【EVAFD】【RULE】7天30小时/7天1个DO如果是安排在第7天如何避免违规
-- 8001法规，新增参数Early Warning Time Range
-- header部分
update rule_parameter set param_values='Bases,Ranks,Position Ranks,Fleets,Min Limits,Period,Unit,Utilize Layover,L2D Warning,Early Warning Time Range'
where rule_id in (select id from rule where `function`=8001) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Position Ranks,Fleets,Min Limits,Period,Unit,Utilize Layover,L2D Warning';

-- value部分
update rule_parameter set param_values=CONCAT(param_values,',*')
where rule_id in (select id from rule where `function`=8001) and param_names like 'table%Row%';

-- 2025/08/27 法规6001 ROSCRW-15030 【QQ-CR5】6001法规同时支持Grey和UA分配与检查
-- 6001法规，新增参数Unassign Pattern
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Crew Teams,Approved Annual Leave Days,Acceptable RDO Compositions,Exceptional RDO Compostions,Unassigned Day,Unassign Pattern'
where rule_id in (select id from rule where `function`=6001) and param_names like 'table2Header%' 
	and param_values='Bases,Ranks,Fleets,Crew Teams,Approved Annual Leave Days,Acceptable RDO Compositions,Exceptional RDO Compostions,Unassigned Day';

-- value部分
update rule_parameter set param_values=CONCAT(param_values,',*')
where rule_id in (select id from rule where `function`=6001) and param_names like 'table2Row%';


-- 2025/08/27 法规7217 ROSCRW-13743 【EVAFD】【RULE】【7217/7218】perdiem逻辑调整&增加schedule time计算
-- 7217法规，新增参数Delay Buffer
-- header部分
update rule_parameter set param_values='Pairing Assignment Groups,Duty Assignments,Per Diem,Per Diem Gap,Delay Buffer'
where rule_id in (select id from rule where `function`=7217) and param_names like 'table%Header%' 
	and param_values='Pairing Assignment Groups,Duty Assignments,Per Diem,Per Diem Gap';

-- value部分
update rule_parameter set param_values=CONCAT(param_values, ',00:30')
where rule_id in (select id from rule where `function`=7217) and param_names like 'table%Row%';


-- 2025/08/27 法规7218 ROSCRW-13743 【EVAFD】【RULE】【7217/7218】perdiem逻辑调整&增加schedule time计算
-- 7218法规，新增参数Delay Buffer
-- header部分
update rule_parameter set param_values='Pairing Assignment Groups,Duty Assignments,Course Code,Role(Trainer/Trainee),IP/CK QUAL,Chief Pilot Rank,Segment Special Tag,Per Diem,Per Diem Gap,Delay Buffer'
where rule_id in (select id from rule where `function`=7218) and param_names like 'table%Header%' 
	and param_values='Pairing Assignment Groups,Duty Assignments,Course Code,Role(Trainer/Trainee),IP/CK QUAL,Chief Pilot Rank,Segment Special Tag,Per Diem,Per Diem Gap';

-- value部分
update rule_parameter set param_values=CONCAT(param_values, ',00:30')
where rule_id in (select id from rule where `function`=7218) and param_names like 'table%Row%';

-- 2025/09/10 法规3021,3022 ROSCRW-15239 【TG】SIM training 的签到时间配置-法规
-- 3021,3022法规，新增参数Courss
-- header部分
update rule_parameter set param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Courses,Brief Time,Effective date,Expired Date'
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Header%' 
	and param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Brief Time,Effective date,Expired Date';

update rule_parameter set param_values='Airport,Duty Type,Flt Nums,Fleets,Assignment,Airlines,is Training,Courses,Debrief Time,Effective date,Expired Date'
where rule_id in (select id from rule where `function`=3022) and param_names like 'table%Header%' 
	and param_values='Airport,Duty Type,Flt Nums,Fleets,Assignment,Airlines,is Training,Debrief Time,Effective date,Expired Date';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 10) , ',*,' , SUBSTRING_INDEX(PARAM_VALUES, ',' , -3))
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Row%';

update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 7) , ',*,' , SUBSTRING_INDEX(PARAM_VALUES, ',' , -3))
where rule_id in (select id from rule where `function`=3022) and param_names like 'table%Row%';

-- 2024/6/21 法规8030 ROSCRW-4331 【qqtest】8030，超龄crew分配国际航班，未告警（2025/09/11 补)
-- 8030法规，新增参数Assignment Group,Assignment
-- header部分
update rule_parameter set param_values='Division,Assignment Group,Assignment,Airport,Age Define,Max Number'
where rule_id in (select id from rule where `function`=8030) and param_names like 'table%Header%' 
	and param_values='Division,Airport,Age Define,Max Number';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 1) , ',*,*,' , SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=8030) and param_names like 'table%Row%';

-- 2025/9/11 法规8030 CMSPAL-279 [5J] [PR] Rule - 8030 Age Restriction 限制增强
-- 8030法规，新增参数DIR,Acting Ranks
-- header部分
update rule_parameter set param_values='Division,Assignment Group,Assignment,Airport,DIR,Acting Ranks,Age Define,Max Number'
where rule_id in (select id from rule where `function`=8030) and param_names like 'table%Header%' 
	and param_values='Division,Assignment Group,Assignment,Airport,Age Define,Max Number';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 4) , ',*,*,' , SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=8030) and param_names like 'table%Row%';

-- 2025/9/21 法规7017 ROSCRW-15647 【TG】prod 法规改造 7017 FDP extension 功能扩展
-- 7017法规，新增参数Duty by Flight Numbers
-- header部分
update rule_parameter set param_values='Segment Assignments,Duty by Flight Numbers,Duty Rest Range in Flight,Rest Facilty,FT Offset per Segment,FT Discount Divisor,Max FDP'
where rule_id in (select id from rule where `function`=7017) and param_names like 'table%Header%' 
	and param_values='Segment Assignments,Duty Rest Range in Flight,Rest Facilty,FT Offset per Segment,FT Discount Divisor,Max FDP';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 1) , ',*,' , SUBSTRING_INDEX(param_values, ',', -5))
where rule_id in (select id from rule where `function`=7017) and param_names like 'table%Row%';

-- 2025/9/25 法规8014 ROSCRW-15705 【EVAFD】【rule】8014增加exclude roles、exclude sub roles参数
-- 8014法规，新增参数Exclude Roles, Exclude Sub Roles
-- header部分
update rule_parameter set param_values='Active Ranks,Acting Ranks,Flight Fleets,Seg Types,Registers,Quals,Assignment Groups,Alert Buffer,Alert Unit,Exclude Roles,Exclude Subroles'
where rule_id in (select id from rule where `function`=8014) and param_names like 'table%Header%' 
	and param_values='Active Ranks,Acting Ranks,Flight Fleets,Seg Types,Registers,Quals,Assignment Groups,Alert Buffer,Alert Unit';

-- value部分
update rule_parameter set param_values=CONCAT(param_values , ',*,*')
where rule_id in (select id from rule where `function`=8014) and param_names like 'table%Row%';

-- 2025/09/25 ROSCRW-15602 【QQ】【Brief】航班提前起飞导致签到时间提前【CREWSE-223】
insert into system_parameter(id, param_name, param_values, app_ids, param_desc, modified_by, last_modified) values ('1003', 'EARLY_ETD_BRIEF_RECAL_HR', '3', NULL, '航班计划起飞前X小时变动ETD(提前起飞)，重新计算Brief', 'ROIS', CURRENT_TIMESTAMP);


-- 2025/9/28 法规7314 CMSPAL-255 Rule - Gender 分布 (PAL&CEB)
-- 7314法规，新增参数Include DHD
-- header部分
update rule_parameter set param_values='Pairing Bases,Flight Fleets,Acting Ranks,Flight Compositions,Min Male Crews,Layover,Even Distribution,Extra Distribution,Include DHD'
where rule_id in (select id from rule where `function`=7314) and param_names like 'table%Header%' 
	and param_values='Pairing Bases,Flight Fleets,Acting Ranks,Flight Compositions,Min Male Crews,Layover,Even Distribution,Extra Distribution';

-- value部分
update rule_parameter set param_values=CONCAT(param_values , ',*')
where rule_id in (select id from rule where `function`=7314) and param_names like 'table%Row%';

-- 2025/10/09 mantis-11441 法規7220，應該只判斷OPR且acting rank=FCN|SFO|FFO的組員
-- 7220法规，新增参数Acting Ranks
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Acting Ranks,Min BLH on Flight,Max Number of Crew on Flight'
where rule_id in (select id from rule where `function`=7220) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Min BLH on Flight,Max Number of Crew on Flight';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 4) , ',*,' , SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7220) and param_names like 'table%Row%';


-- 2025/10/13 ROSCRW-16033 【EVAFD】【RULE】法规3007/3008/3107/3108增加leg sch BLH start，leg sch BLH end
-- 3007,3008,3107,3108法规，新增参数Leg Sch BLH Start, Leg Sch BLH End
-- header部分
update rule_parameter set param_values='Composition,Duty Fleet,Duty Type,Departure Start,Departure End,Rpt Start,Rpt End,Landing Lower,Landings Upper,Rest Facility,Max FDP,Max Extension,Isaugment,LT Rest Threadhold,LT Rest Ratio,Extension TS Flags,At Base FDP Extension,Out of Base FDP Extension,Leg Sch BLH Start,Leg Sch BLH End'
where rule_id in (select id from rule where `function`=3007) and param_names like 'table%Header%' 
	and param_values='Composition,Duty Fleet,Duty Type,Departure Start,Departure End,Rpt Start,Rpt End,Landing Lower,Landings Upper,Rest Facility,Max FDP,Max Extension,Isaugment,LT Rest Threadhold,LT Rest Ratio,Extension TS Flags,At Base FDP Extension,Out of Base FDP Extension';

-- value部分
update rule_parameter set param_values=CONCAT(param_values , ',*,*')
where rule_id in (select id from rule where `function`=3007) and param_names like 'table%Row%';

update rule_parameter set param_values='Composition,Duty Type,Departure Start,Departure End,Rpt Start,Rpt End,Max BLH,Rest Facility,Isaugment,Extension TS Flags,BLH Extension,Leg Sch BLH Start,Leg Sch BLH End'
where rule_id in (select id from rule where `function`=3008) and param_names like 'table2Header%' 
	and param_values='Composition,Duty Type,Departure Start,Departure End,Rpt Start,Rpt End,Max BLH,Rest Facility,Isaugment,Extension TS Flags,BLH Extension';

-- value部分
update rule_parameter set param_values=CONCAT(param_values , ',*,*')
where rule_id in (select id from rule where `function`=3008) and param_names like 'table2Row%';

update rule_parameter set param_values='Composition,Duty Fleet,Duty Type,Departure Start,Departure End,Rpt Start,Rpt End,Landing Lower,Landings Upper,Rest Facility,Max FDP,Max Extension,Isaugment,LT Rest Threadhold,LT Rest Ratio,Extension TS Flags,At Base FDP Extension,Out of Base FDP Extension,Leg Sch BLH Start,Leg Sch BLH End'
where rule_id in (select id from rule where `function`=3107) and param_names like 'table%Header%' 
	and param_values='Composition,Duty Fleet,Duty Type,Departure Start,Departure End,Rpt Start,Rpt End,Landing Lower,Landings Upper,Rest Facility,Max FDP,Max Extension,Isaugment,LT Rest Threadhold,LT Rest Ratio,Extension TS Flags,At Base FDP Extension,Out of Base FDP Extension';

-- value部分
update rule_parameter set param_values=CONCAT(param_values , ',*,*')
where rule_id in (select id from rule where `function`=3107) and param_names like 'table%Row%';

update rule_parameter set param_values='Composition,Duty Type,Departure Start,Departure End,Rpt Start,Rpt End,Max BLH,Rest Facility,Isaugment,Extension TS Flags,BLH Extension,Leg Sch BLH Start,Leg Sch BLH End'
where rule_id in (select id from rule where `function`=3108) and param_names like 'table2Header%' 
	and param_values='Composition,Duty Type,Departure Start,Departure End,Rpt Start,Rpt End,Max BLH,Rest Facility,Isaugment,Extension TS Flags,BLH Extension';

-- value部分
update rule_parameter set param_values=CONCAT(param_values , ',*,*')
where rule_id in (select id from rule where `function`=3108) and param_names like 'table2Row%';


-- 2025/10/15 CMSPAL-364 Rule 7306 LEFS 任务最大连续次数-改进
-- 7306法规，新增参数Attributes,is Turnaround(Y/N)
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Duty Time Ranges,Attributes,is Turnaround(Y/N),Max Consecutive Times'
where rule_id in (select id from rule where `function`=7306) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Duty Time Ranges,Max Consecutive Times';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 5) , ',*,*,' , SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=7306) and param_names like 'table%Row%';

-- 2025/10/21 CMSPAL-92 Rule 7301 - DP 计算规则定制化
-- 7301法规，新增参数Callout Assignments
-- header部分
update rule_parameter set param_values='Flight Assignments,Flight Hours,DP Adjust Pct,Callout Assignments'
where rule_id in (select id from rule where `function`=7301) and param_names like 'table%Header%' 
	and param_values='Flight Assignments,Flight Hours,DP Adjust Pct';

-- value部分
update rule_parameter set param_values=CONCAT(param_values , ',SBY')
where rule_id in (select id from rule where `function`=7301) and param_names like 'table%Row%';

-- 2025/10/27 CMSPAL-425 Rule 7300 - Max Duty Time 法规定制化（PR CC）- 新增参数Overrideable
-- 7300法规，新增参数 Overrideable(Y/N)
-- header部分
update rule_parameter set param_values='Compositions,Options,Augmented(Y/N),Number of Operating Crew,Operating Airports,Operating Fleets,Sub Operating Fleets,Duty Assignments,Include DHD Flights(Y/N),Overrideable(Y/N),Max DP'
where rule_id in (select id from rule where `function`=7300) and param_names like 'table%Header%' 
	and param_values='Compositions,Options,Augmented(Y/N),Number of Operating Crew,Operating Airports,Operating Fleets,Sub Operating Fleets,Duty Assignments,Include DHD Flights(Y/N),Max DP';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 9) , ',*,' , SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=7300) and param_names like 'table%Row%';

-- 2025/10/28 CMSPAL-431 Rule6008 - 扩展参数
-- 6008法规，新增参数 Duty Type,DP Max Extension
-- header部分
update rule_parameter set param_values='ACC State,Compositions,Only Last Duty,Duty Type,FDP Max Extension,FT Max Extension,DP Max Extension'
where rule_id in (select id from rule where `function`=6008) and param_names like 'table%Header%' 
	and param_values='ACC State,Compositions,Only Last Duty,FDP Max Extension,FT Max Extension';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 3) , ',*,' , SUBSTRING_INDEX(param_values, ',', -2), ',02:00')
where rule_id in (select id from rule where `function`=6008) and param_names like 'table%Row%';

-- 2025/11/04 ROSCRW-12459 Rule8098 - 扩展参数
-- 8098法规，新增参数 Flight Fleet，Qual
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Crew Teams,Route,Min Limits,Period,Unit,Type,Flight Fleet,Qual'
where rule_id in (select id from rule where `function`=8098) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Crew Teams,Route,Min Limits,Period,Unit,Type';

-- value部分
update rule_parameter set param_values=CONCAT(param_value, ',*,*')
where rule_id in (select id from rule where `function`=8098) and param_names like 'table%Row%';

-- 2025/11/08 CMSPAL-470 Rule 7311 - Min Rest by block time - 新增 Overridable 参数
-- 7311法规，新增参数Overrideable(Y/N)
-- header部分
update rule_parameter set param_values='Bases,Compositions,Duty Type,Duty Assignments,Is Line Training,Flight No,Exclude Flight No,BLH Ranges,Is Layover Rest,Overrideable(Y/N),Base Rest,Rest Multiplied'
where rule_id in (select id from rule where `function`=7311) and param_names like 'table%Header%' 
	and param_values='Bases,Compositions,Duty Type,Duty Assignments,Is Line Training,Flight No,Exclude Flight No,BLH Ranges,Is Layover Rest,Base Rest,Rest Multiplied';

-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 9) , ',*,' , SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7311) and param_names like 'table%Row%';

-- 2025/11/13 mantis 0011342: 法規8001073，early warning time rang預先告警錯誤
-- 8001法规，新增参数Early Warning Assignments
-- header部分
update rule_parameter set param_values='Bases,Ranks,Position Ranks,Fleets,Min Limits,Period,Unit,Utilize Layover,L2D Warning,Early Warning Time Range,Early Warning Assignments'
where rule_id in (select id from rule where `function`=8001) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Position Ranks,Fleets,Min Limits,Period,Unit,Utilize Layover,L2D Warning,Early Warning Time Range';
	
-- value部分
update rule_parameter set param_values=CONCAT(param_values,',*')
where rule_id in (select id from rule where `function`=8001) and param_names like 'table%Row%';

-- 2025/11/18 CMSPAL-547 改造8002或新增法规：依据国际飞行和加强组等，决定飞时上限
-- 8002法规，新增参数 INT Operation BLH,Aug Operation BLH,Duty Alot Time
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Crew Teams,Period,Unit,Prorated,INT Operation BLH,Aug Operation BLH,Duty Alot Time,Max Limits,Min Limits,Type'
where rule_id in (select id from rule where `function`=8002) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Crew Teams,Period,Unit,Prorated,Max Limits,Min Limits,Type';
	
-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 7) , ',*,*,*,' , SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=8002) and param_names like 'table%Row%';

-- 2025/11/18 CMSCEB-158 Rule7203 - 新增参数DP Encroaching Period
-- 7203法规，新增参数 DP Encroaching Period
-- header部分
update rule_parameter set param_values='Bases,Compositions,Duty Type,Segment Assignments,Report Time Ranges,DP Encroaching Period,Sector BLH Ranges,Max Sector'
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Header%' 
	and param_values='Bases,Compositions,Duty Type,Segment Assignments,Report Time Ranges,Sector BLH Ranges,Max Sector';
	
-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 5) , ',*,' , SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Row%';


-- 2025/11/20 CMSCEB-152 Rule - 8072 新增配比参数
-- 8072法规，新增参数 Flight Compositions
-- header部分
update rule_parameter set param_values='Flight Fleets,Flight Assignment Groups,Crew Teams,Crew Nationality,Destination Countries,Acting Ranks,Flight Compositions,Required Qualifications,Attributes,Dep,Arr,Min Limits,Max Limits'
where rule_id in (select id from rule where `function`=8072) and param_names like 'table%Header%' 
	and param_values='Flight Fleets,Flight Assignment Groups,Crew Teams,Crew Nationality,Destination Countries,Acting Ranks,Required Qualifications,Attributes,Dep,Arr,Min Limits,Max Limits';
-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 5) , ',*,' , SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=8072) and param_names like 'table%Row%';

-- 2025/11/25 SGPO-58 法规 2124 - [CA] 5.3.	Minimum Rest Period for Narrow Boby PAX FD
-- 2124法规，新增参数 Fleets、Sub Fleets
-- header部分
update rule_parameter set param_values='Composition,ASSIGNMENTS,Fleets,Sub Fleets,With_Bunk,Landing_Times_Lower,Landing_Times_Upper,BLH Lower,BLH Upper,FDP Lower,FDP Upper,DP Lower,DP Upper,Attributes,is Cross Midnight,is Delay,Min Rest'
where rule_id in (select id from rule where `function`=2124) and param_names like 'table%Header%' 
	and param_values='Composition,ASSIGNMENTS,With_Bunk,Landing_Times_Lower,Landing_Times_Upper,BLH Lower,BLH Upper,FDP Lower,FDP Upper,DP Lower,DP Upper,Attributes,is Cross Midnight,is Delay,Min Rest';
	
-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 2) , ',*,*,' , SUBSTRING_INDEX(param_values, ',', -13))
where rule_id in (select id from rule where `function`=2124) and param_names like 'table%Row%';


-- 2025/11/26 SGPO-55 法规 7205 修改- [ANR] 4.8.	Duty Hour Rule
-- 7205法规，新增参数 Limit DP Range
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range'
where rule_id in (select id from rule where `function`=7205) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit BLH Range,Limit FDP Range';
	
-- value部分
update rule_parameter set param_values=CONCAT(param_values , ',00:00-999:00' )
where rule_id in (select id from rule where `function`=7205) and param_names like 'table%Row%';

-- 2025/11/27 ROSCRW-16873 法规 8023 - 【EVAFD】【rule】8023增加参数，检查manday或roster
-- 8023法规，新增参数 Check Type
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Crew Teams,DO Assignment Group,Min DO,Period,Unit,Utilize Post Duty Rest,Count Blank Day,Count Layover,Layover Timemode,Month Numbers,Check Type'
where rule_id in (select id from rule where `function`=8023) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Crew Teams,DO Assignment Group,Min DO,Period,Unit,Utilize Post Duty Rest,Count Blank Day,Count Layover,Layover Timemode,Month Numbers';
	
-- value部分
update rule_parameter set param_values=CONCAT(param_values , ',*')
where rule_id in (select id from rule where `function`=8023) and param_names like 'table%Row%';

-- 2025/12/03 ROSCRW-16706 CR-【EVAFD】【rule】7休1和14休2最后一个任务结束时间控制
-- 8023法规，新增参数 Last Roster Latest End Time
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Crew Teams,DO Assignment Group,Min DO,Period,Unit,Utilize Post Duty Rest,Count Blank Day,Count Layover,Layover Timemode,Month Numbers,Check Type,Last Roster Latest End Time'
where rule_id in (select id from rule where `function`=8023) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Crew Teams,DO Assignment Group,Min DO,Period,Unit,Utilize Post Duty Rest,Count Blank Day,Count Layover,Layover Timemode,Month Numbers,Check Type';
	
-- value部分
update rule_parameter set param_values=CONCAT(param_values , ',*')
where rule_id in (select id from rule where `function`=8023) and param_names like 'table%Row%';

-- 2025/12/03 CMSPAL-630 Rule 7311 - 实现Roster规则判断
-- 7311法规，新增参数 Working Assignment Groups
-- header部分
update rule_parameter set param_values='Bases,Compositions,Duty Type,Duty Assignments,Working Assignment Groups,Is Line Training,Flight No,Exclude Flight No,BLH Ranges,Is Layover Rest,Overrideable(Y/N),Base Rest,Rest Multiplied'
where rule_id in (select id from rule where `function`=7311) and param_names like 'table%Header%' 
	and param_values='Bases,Compositions,Duty Type,Duty Assignments,Is Line Training,Flight No,Exclude Flight No,BLH Ranges,Is Layover Rest,Overrideable(Y/N),Base Rest,Rest Multiplied';
	
-- value部分
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 4) , ',FLY,' , SUBSTRING_INDEX(param_values, ',', -8))
where rule_id in (select id from rule where `function`=7311) and param_names like 'table%Row%';

-- 2025/12/09 ROSCRW-17053 【Tiger】8001法规扩展参数，支持休息时间内必须满足N次规定的休息时段
-- 8001法规，新增参数 Rest Times,Rest Period
-- header部分
update rule_parameter set param_values='Bases,Ranks,Position Ranks,Fleets,Min Limits,Period,Unit,Utilize Layover,L2D Warning,Early Warning Time Range,Early Warning Assignments,Rest Times,Rest Period'
where rule_id in (select id from rule where `function`=8001) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Position Ranks,Fleets,Min Limits,Period,Unit,Utilize Layover,L2D Warning,Early Warning Time Range,Early Warning Assignments';
	
-- value部分
update rule_parameter set param_values=CONCAT(param_values, ',*,*')
where rule_id in (select id from rule where `function`=8001) and param_names like 'table%Row%';

-- 2025/12/03 ROSCRW-16706 CR-【EVAFD】【rule】7休1和14休2最后一个任务结束时间控制
-- 8023法规，新增参数 Last Roster Assignments
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Crew Teams,DO Assignment Group,Min DO,Period,Unit,Utilize Post Duty Rest,Count Blank Day,Count Layover,Layover Timemode,Month Numbers,Check Type,Last Roster Latest End Time,Last Roster Assignments'
where rule_id in (select id from rule where `function`=8023) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Crew Teams,DO Assignment Group,Min DO,Period,Unit,Utilize Post Duty Rest,Count Blank Day,Count Layover,Layover Timemode,Month Numbers,Check Type,Last Roster Latest End Time';
	
-- value部分
update rule_parameter set param_values=CONCAT(param_values , ',*')
where rule_id in (select id from rule where `function`=8023) and param_names like 'table%Row%';

-- 2025/12/18 SGPO-165 法规 3001 Min/Max connection time 增加Fleet Group change
-- 3001法规，新增参数 Fleet Group Change
-- header部分
update rule_parameter set param_values='Airport,Inbound Duty,Outbound Duty,Aircraft Change,FLT2FERRY,FERRY2FLT,DHD2FLT,FLT2DHD,TRAIN2FLT,FLT2TRAIN,Fleets,Sub Fleets,Mct,Airline Change,Max Conn,Fleet Group Change'
where rule_id in (select id from rule where `function`=3001) and param_names like 'table%Header%' 
	and param_values='Airport,Inbound Duty,Outbound Duty,Aircraft Change,FLT2FERRY,FERRY2FLT,DHD2FLT,FLT2DHD,TRAIN2FLT,FLT2TRAIN,Fleets,Sub Fleets,Mct,Airline Change,Max Conn';
	
-- value部分
update rule_parameter set param_values=CONCAT(param_values , ',*')
where rule_id in (select id from rule where `function`=3001) and param_names like 'table%Row%';

-- 2025/12/18 CMSCEB-282 Rule - 8106新增Assignments参数，支持飞行和地面任务
-- 8106法规，新增参数 Assignments
-- header部分
update rule_parameter set param_values='Pairing Attributes,Assignment Groups,Assignments,Crew Nationlities,Bases,Ranks,Fleets,Required Qualifications,Crew Teams'
where rule_id in (select id from rule where `function`=8106) and param_names like 'table%Header%' 
	and param_values='Pairing Attributes,Assignment Groups,Crew Nationlities,Bases,Ranks,Fleets,Required Qualifications,Crew Teams';

-- 8106 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 2) , ',*,' , SUBSTRING_INDEX(param_values, ',', -6))
where rule_id in (select id from rule where `function`=8106) and param_names like 'table%Row%';

-- 2026/01/14 HXCREW-77 【HKA】【Rule】14.【内规】關於證件的要求
-- 8008法规，新增参数 Flight Flag, Roster Flight Assignments
-- header部分
update rule_parameter set param_values='Crew Nationality,Destination Country,Travel Doc Types,Validity Unit,Number,Only Check Layover,Flight Numbers,Departure Country,Check on Type(S/D/P),Not Check Countries,Airports,Flight Flag,Roster Flight Assignments'
where rule_id in (select id from rule where `function`=8008) and param_names like 'table%Header%' 
	and param_values='Crew Nationality,Destination Country,Travel Doc Types,Validity Unit,Number,Only Check Layover,Flight Numbers,Departure Country,Check on Type(S/D/P),Not Check Countries,Airports';

-- 8008更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(param_values, ',*,*')
where rule_id in (select id from rule where `function`=8008) and param_names like 'table%Row%';

-- 2026/01/14 HXCREW-76 【HKA】【Rule】13.【内规】機型與航班經驗要求
-- 8069法规，新增参数 Date Of Join Range
-- header部分
update rule_parameter set param_values='Active Ranks,Acting Ranks,Current Rank Experienced Days,Pattern Attribute,Flight Fleets,Min Limits,Max Limits,Flight Assignment Groups,Utilize Previous Experience,Remark,Date Of Join Range'
where rule_id in (select id from rule where `function`=8069) and param_names like 'table%Header%' 
	and param_values='Active Ranks,Acting Ranks,Current Rank Experienced Days,Pattern Attribute,Flight Fleets,Min Limits,Max Limits,Flight Assignment Groups,Utilize Previous Experience,Remark';

-- 8069更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(param_values, ',*')
where rule_id in (select id from rule where `function`=8069) and param_names like 'table%Row%';

-- 2026/01/14 HXCREW-76 【HKA】【Rule】13.【内规】機型與航班經驗要求
-- 8030法规，新增参数 Composition, Active Ranks
-- header部分
update rule_parameter set param_values='Composition,Division,Assignment Group,Assignment,Airport,DIR,Active Ranks,Acting Ranks,Age Define,Max Number'
where rule_id in (select id from rule where `function`=8030) and param_names like 'table%Header%' 
	and param_values='Division,Assignment Group,Assignment,Airport,DIR,Acting Ranks,Age Define,Max Number';

-- 8030更新 rule_parameter的table row, 
update rule_parameter set param_values=CONCAT('*,', SUBSTRING_INDEX(param_values, ',', 5), ',*,', SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=8030) and param_names like 'table%Row%';

-- 2026/01/16 CMSPAL-885 Rule 7311 - 新增参数Override Duty Attributes
-- 7311法规，新增参数 Override Duty Attributes
-- header部分
update rule_parameter set param_values='Bases,Compositions,Duty Type,Duty Assignments,Working Assignment Groups,Is Line Training,Flight No,Exclude Flight No,BLH Ranges,Is Layover Rest,Overrideable(Y/N),Base Rest,Rest Multiplied,Override Duty Attributes'
where rule_id in (select id from rule where `function`=7311) and param_names like 'table%Header%' 
	and param_values='Bases,Compositions,Duty Type,Duty Assignments,Working Assignment Groups,Is Line Training,Flight No,Exclude Flight No,BLH Ranges,Is Layover Rest,Overrideable(Y/N),Base Rest,Rest Multiplied';

-- 8030更新 rule_parameter的table row, 
update rule_parameter set param_values=CONCAT(param_value, ',*')
where rule_id in (select id from rule where `function`=7311) and param_names like 'table%Row%';

-- 2026/01/03 CMSCEB-358 7326，告警文字有2处可改进
-- 7326法规，新增参数 新增参数Assignment Groups和Before/After Assignment Groups, 
-- Earliest Brief After Roster 改成 Earliest Start After Roster 和 Latest Debrief Before Roster改成Latest End Before Roster
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Attributes,Assignments,Assignment Groups,Before/After Assignments,Before/After Assignment Groups,Earliest Start After Roster,Latest End Before Roster'
where rule_id in (select id from rule where `function`=7326) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Attributes,Assignments,Before/After Assignments,Earliest Brief After Roster,Latest Debrief Before Roster';
	
-- 7326更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 6) , ',*,' , CONCAT(SUBSTRING_INDEX(SUBSTRING_INDEX(param_values, ',', -3), ',', 1) , ',*,' , SUBSTRING_INDEX(SUBSTRING_INDEX(param_values, ',', -3), ',', -2)))
where rule_id in (select id from rule where `function`=7326) and param_names like 'table%Row%';

-- 2026/01/19 mantis 0011706: CR---身分為under training的TE時，若為SIM PNR，不計算credit hour、perdime
-- 7215法规，新增参数 Footprint subtypes
-- header部分
update rule_parameter set param_values='Teams,Assignment Groups,Assignments,Segment from Departure to Arrival,Number Range of Segment in Duty,IP/CK&Chief Pilot Credit,Footprint subtypes,Course Code,Role(Trainer/Trainee),Role(Trainer/Trainee) in Roster,IP/CK QUAL,Chief Pilot Rank,Credit,Credit BT Gap,Percent,Delay Buffer,Multiple,Split Method(SPAN/START)'
where rule_id in (select id from rule where `function`=7215) and param_names like 'table%Header%' 
	and param_values='Teams,Assignment Groups,Assignments,Segment from Departure to Arrival,Number Range of Segment in Duty,IP/CK&Chief Pilot Credit,Course Code,Role(Trainer/Trainee),Role(Trainer/Trainee) in Roster,IP/CK QUAL,Chief Pilot Rank,Credit,Credit BT Gap,Percent,Delay Buffer,Multiple,Split Method(SPAN/START)';
	
-- 7215更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 6) , ',*,' , SUBSTRING_INDEX(param_values, ',', -11))
where rule_id in (select id from rule where `function`=7215) and param_names like 'table%Row%';


-- 2026/01/19 mantis 0011706: CR---身分為under training的TE時，若為SIM PNR，不計算credit hour、perdime
-- 7218法规，新增参数 Footprint subtypes
-- header部分
update rule_parameter set param_values='Pairing Assignment Groups,Duty Assignments,Other Duty Assignments in Pairing,Footprint subtypes,Course Code,Role(Trainer/Trainee),IP/CK QUAL,Role(Trainer/Trainee) in Roster,Chief Pilot Rank,Segment Special Tag,Per Diem,Per Diem Gap,Delay Buffer'
where rule_id in (select id from rule where `function`=7218) and param_names like 'table%Header%' 
	and param_values='Pairing Assignment Groups,Duty Assignments,Other Duty Assignments in Pairing,Course Code,Role(Trainer/Trainee),IP/CK QUAL,Role(Trainer/Trainee) in Roster,Chief Pilot Rank,Segment Special Tag,Per Diem,Per Diem Gap,Delay Buffer';
	
-- 7218更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 3) , ',*,' , SUBSTRING_INDEX(param_values, ',', -9))
where rule_id in (select id from rule where `function`=7218) and param_names like 'table%Row%';

-- 2026/01/20 CMSPAL-406 MCL 和 CTA 没有注册 Crew，分配到 US 和 AU 航班必须告警
-- 8008法规，新增参数 Check CTA/MCL,Ignore Certificates for CTA/MCL
-- header部分
update rule_parameter set param_values='Crew Nationality,Destination Country,Travel Doc Types,Validity Unit,Number,Only Check Layover,Flight Numbers,Departure Country,Check on Type(S/D/P),Not Check Countries,Airports,Flight Flag,Roster Flight Assignments,Check CTA/MCL,Ignore Certificate for CTA/MCL'
where rule_id in (select id from rule where `function`=8008) and param_names like 'table%Header%' 
	and param_values='Crew Nationality,Destination Country,Travel Doc Types,Validity Unit,Number,Only Check Layover,Flight Numbers,Departure Country,Check on Type(S/D/P),Not Check Countries,Airports,Flight Flag,Roster Flight Assignments';

-- 8008更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(param_values, ',*,*')
where rule_id in (select id from rule where `function`=8008) and param_names like 'table%Row%';

-- 2026/01/20 CMSCEB-407 Rule - 7326  新增参数 Consecutive Assignment Days
-- 7326法规，新增参数 Consecutive Assignment Days
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Attributes,Assignments,Assignment Groups,Before/After Assignments,Before/After Assignment Groups,Consecutive Assignment Days,Earliest Start After Roster,Latest End Before Roster'
where rule_id in (select id from rule where `function`=7326) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Attributes,Assignments,Assignment Groups,Before/After Assignments,Before/After Assignment Groups,Earliest Start After Roster,Latest End Before Roster';

-- 7326更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 9) , ',*,' , SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7326) and param_names like 'table%Row%';

-- 2026/01/26 CMSPAL-897 Rule7314-新增参数 Is Total Even
-- 7314法规，新增参数 Is Total Even
-- header部分
update rule_parameter set param_values='Pairing Bases,Flight Fleets,Acting Ranks,Flight Compositions,Min Male Crews,Max Male Crews,Layover,Even Distribution,Even On Gender,Include DHD,Is Total Even'
where rule_id in (select id from rule where `function`=7314) and param_names like 'table%Header%' 
	and param_values='Pairing Bases,Flight Fleets,Acting Ranks,Flight Compositions,Min Male Crews,Max Male Crews,Layover,Even Distribution,Even On Gender,Include DHD';

-- 7326更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(param_values , ',*,')
where rule_id in (select id from rule where `function`=7314) and param_names like 'table%Row%';


-- 2026/01/27 ROSCRW-17675 【TG-PROD】6120 法规 休息和飞行重叠没告警
-- 6120法规，新增参数 Ignore MRT Override(Y/N) 
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Duty Assignments,Duty TZ Diff,Sector BLH Ranges,Encroach Time,Is Home Base,Acclimatized State,Benchmark,Period Threshold,Rest Time,FDP Times,Direction,Displacement Adjustment Reference Time,Ignore MRT Override(Y/N)'
where rule_id in (select id from rule where `function`=6120) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Duty Assignments,Duty TZ Diff,Sector BLH Ranges,Encroach Time,Is Home Base,Acclimatized State,Benchmark,Period Threshold,Rest Time,FDP Times,Direction,Displacement Adjustment Reference Time';

-- 6120更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(param_values , ',*' )
where rule_id in (select id from rule where `function`=6120) and param_names like 'table%Row%';

-- 2026/01/28 SGPO-338 [SQ] 7009 法规 一日不二派 no duties on same day
-- 7009法规，新增参数 Fleet Groups, Level, Assignments(原Assignments改名AssignmentGroups)
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Assignment Groups,Prev Roster Start,Next Roster End'
where rule_id in (select id from rule where `function`=7009) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Assignments,Prev Roster Start,Next Roster End';
	
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Assignment Groups,Assignments,Fleet Groups,Level,Prev Roster Start,Next Roster End'
where rule_id in (select id from rule where `function`=7009) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Assignment Groups,Prev Roster Start,Next Roster End';

-- 7009更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 5) , ',*,*,R,' , SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7009) and param_names like 'table%Row%';

-- 2026/01/28 CMSCEB-460 Rule7014 - EASA RERRP assignments
-- 7014法规，新增参数 Fleet Groups, Level, Assignments(原Assignments改名AssignmentGroups)
-- header部分
update rule_parameter set param_values='RERRP Min Rest,RERRP No Of LNS,Max Span Between RERRPS,RERRP Min Local days,RERRP Assignments,RERRP Assignment Groups,Is Count Blank Day,Unit,Period,Min RERRP Num'
where rule_id in (select id from rule where `function`=7014) and param_names like 'table%Header%' 
	and param_values='RERRP Min Rest,RERRP No Of LNS,Max Span Between RERRPS,RERRP Min Local days,RERRP Assignments,Is Count Blank Day,Unit,Period,Min RERRP Num';

-- 7014更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 6) , ',*,' , SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=7014) and param_names like 'table%Row%';


-- 2026/02/02 CMSPAL-951 Rule7009 - 新增Prev Roster Threshold参数
-- 7009法规，新增参数Prev Roster Threshold
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Assignment Groups,Assignments,Fleet Groups,Level,Prev Roster Threshold,Prev Roster Start,Next Roster End'
where rule_id in (select id from rule where `function`=7009) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Assignment Groups,Assignments,Fleet Groups,Level,Prev Roster Start,Next Roster End';

-- 7009 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 8) , ',*,' , SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7009) and param_names like 'table%Row%';

-- 2026/02/04 Rule7009 - 新增Time Zone参数(BASE/LOCAL)
-- 7009法规，新增参数Time Zone
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Assignment Groups,Assignments,Fleet Groups,Level,Time Zone,Prev Roster Threshold,Prev Roster Start,Next Roster End'
where rule_id in (select id from rule where `function`=7009) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Assignment Groups,Assignments,Fleet Groups,Level,Prev Roster Threshold,Prev Roster Start,Next Roster End';

-- 7009 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 8) , ',LOCAL,' , SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=7009) and param_names like 'table%Row%';

-- 2026/02/02 CMSCEB-485 Rule - 7317 新增參數 Single BLH Range
-- 7317法规，新增參數 Single BLH Range
-- header部分
update rule_parameter set param_values='Acc States,Compositions,Duty Fleets,Duty Type,Departure Range,RPT Range,Landing Range,Rest Facility,Override Duty Attributes,Single BLH Range,Blh Range,WOCL Overlap Range,Max Sectors,Max FDP,Max Extension,Is Augment,Is Split'
where rule_id in (select id from rule where `function`=7317) and param_names like 'table%Header%' 
	and param_values='Acc States,Compositions,Duty Fleets,Duty Type,Departure Range,RPT Range,Landing Range,Rest Facility,Override Duty Attributes,BLH Range,WOCL Overlap Range,Max Sectors,Max FDP,Max Extension,Is Augment,Is Split';

-- 7317 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 9) , ',*,' , SUBSTRING_INDEX(param_values, ',', -7))
where rule_id in (select id from rule where `function`=7317) and param_names like 'table%Row%';

-- 2026/02/05 CMSCEB-486 Rule - 6007 EASA - Standard FDP Extension 新增參數
-- 6007法规，新增參數 Override Duty Attributes, Max FDP Extension
-- header1部分
update rule_parameter set param_values='Composition,RPT Start,RPT End,Landing Assignments,Landing Lower,Landings Upper,Max FDP,Max DP,Max FT,Override Duty Attributes,Max FDP Extension'
where rule_id in (select id from rule where `function`=6007) and param_names like 'table1Header%' 
	and param_values='Composition,RPT Start,RPT End,Landing Assignments,Landing Lower,Landings Upper,Max FDP,Max DP,Max FT';
	
-- header2部分
update rule_parameter set param_values='Composition,odp Start,odp End,Landing Assignments,Landing Lower,Landings Upper,Max FDP,Max DP,Max FT,Override Duty Attributes,Max FDP Extension'
where rule_id in (select id from rule where `function`=6007) and param_names like 'table2Header%' 
	and param_values='Composition,odp Start,odp End,Landing Assignments,Landing Lower,Landings Upper,Max FDP,Max DP,Max FT';

-- 6007 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(param_values, ',*,00:00')
where rule_id in (select id from rule where `function`=6007) and param_names like 'table%Row%';

-- 2026/02/26 CMSCEB-566 Rule 6025 新增參數 Assignment Groups 和 Min Duration
-- 6025法规，新增參數 Assignment Groups 和 Min Duration
-- header部分
update rule_parameter set param_values='is Home Base,Assignment Groups,Assignments,Max DP,Min Duration,Max Duration'
where rule_id in (select id from rule where `function`=6025) and param_names like 'table%Header%' 
	and param_values='is Home Base,Assignments,Max DP,Max Duration';

-- 6025 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 1) , ',*,' , CONCAT(SUBSTRING_INDEX(SUBSTRING_INDEX(param_values, ',', -3), ',', 2) , ',*,' , SUBSTRING_INDEX(SUBSTRING_INDEX(param_values, ',', -3), ',', -1)))
where rule_id in (select id from rule where `function`=6025) and param_names like 'table%Row%';

-- 2026/02/27 HXCREW-75 【HKA】【Rule 8002】12.Flying Hour Limitations/Duty Hour Limitations-7.22/7.23
-- 8002法规，新增參數 has SBY or FLY(Y/N)
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Crew Teams,Period,Unit,Prorated,INT Operation BLH,Aug Operation BLH,Duty Alot Time,has SBY or FLY(Y/N),Max Limits,Min Limits,Type'
where rule_id in (select id from rule where `function`=8002) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Crew Teams,Period,Unit,Prorated,INT Operation BLH,Aug Operation BLH,Duty Alot Time,Max Limits,Min Limits,Type';

-- 8002 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 10) , ',*,' , SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=8002) and param_names like 'table%Row%';

-- 2026/03/06 HXCREW-170 【HKA】【Rule 7450】5.长航线Long Rang Operations-7.11 - 检查单段飞时和Duty航段数量
-- 7450法规，新增參數 Sector BLH Lower和Sector BLH Upper
-- header部分
update rule_parameter set param_values='Composition,Sector BLH Lower,Sector BLH Upper,FDP Lower,FDP Upper,Max Sectors'
where rule_id in (select id from rule where `function`=7450) and param_names like 'table1Header%' 
	and param_values='Composition,FDP Lower,FDP Upper,Max Sectors';

-- 7450 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 1) , ',*,*,' , SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=7450) and param_names like 'table1Row%';

-- 2026/03/06 CMSPAL-1148 Rule 7307 - 修改LN逻辑和新增参数
-- 7307法规，新增參數 Reporting Range
-- header部分
update rule_parameter set param_values='Bases,Assignment Groups,Assignments,Reporting Range,Min Rest at Base Without Local Night,Min Rest at Layover Without Local Night'
where rule_id in (select id from rule where `function`=7307) and param_names like 'table%Header%' 
	and param_values='Bases,Assignment Groups,Assignments,Min Rest at Base Without Local Night,Min Rest at Layover Without Local Night';

-- 7307 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 3) , ',*,' , SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7307) and param_names like 'table%Row%';

-- 2026/03/06 CMSCEB-606 Rule 8071 - 增加OVERRIDE DUTY ATTRIBUTE
-- 8071法规，新增參數 Override Duty Attributes
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Crew Teams,Labels,Attributes,Override Duty Attributes,Assignment Groups,Qualifiers,Flights,Destinations,Positions,Period,Unit,Max Times,Min Times,Check Mode'
where rule_id in (select id from rule where `function`=8071) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Crew Teams,Labels,Attributes,Assignment Groups,Qualifiers,Flights,Destinations,Positions,Period,Unit,Max Times,Min Times,Check Mode';

-- 8071 更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 6) , ',*,' , SUBSTRING_INDEX(param_values, ',', -10))
where rule_id in (select id from rule where `function`=8071) and param_names like 'table%Row%';

-- 2026/03/14 CMSPAL-1199 Rule 7203 - 新增Flight Fleets参数
-- 7203法规，新增參數 Flight Fleets
-- header部分
update rule_parameter set param_values='Bases,Compositions,Duty Type,Segment Assignments,Flight Fleets,Report Time Ranges,DP Encroaching Period,Sector BLH Ranges,Max Sector'
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Header%' 
	and param_values='Bases,Compositions,Duty Type,Segment Assignments,Report Time Ranges,DP Encroaching Period,Sector BLH Ranges,Max Sector';

-- 7203更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 4) , ',*,' , SUBSTRING_INDEX(param_values, ',', -4))
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Row%';

-- 2026/03/18 CMSPAL-1271 Rule 7306 LEFS 任务最大连续次数 - 新增assignment等参数
-- 7306法规，新增參數 Duty Assignment Groups、 Duty Assignments
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Duty Assignment Groups,Duty Assignments,Duty Time Ranges,Attributes,is Turnaround(Y/N),Max Consecutive Times'
where rule_id in (select id from rule where `function`=7306) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Duty Time Ranges,Attributes,is Turnaround(Y/N),Max Consecutive Times';

-- 7306更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 4) , ',*,*,' , SUBSTRING_INDEX(param_values, ',', -4))
where rule_id in (select id from rule where `function`=7306) and param_names like 'table%Row%';


-- 2026/03/19 CMSCEB-688 8056 新增參數Course Code A和Course Code B
-- 8056法规，新增參數 Course Code A,Course Code B
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Crew Teams,Attribute A,Label A,Assignment Group A,Qualifier A,Airport A,Roles A,Is Requested A,Attribute B,Label B,Assignment Group B,Qualifier B,Airport B,Roles B,Is Requested B,Space,Unit,Directional,Is Location Equal Base A,Is Location Equal Base B,Utilize Post Duty Rest,is Line Training A,is Line Training B,Course Code A,Course Code B'
where rule_id in (select id from rule where `function`=8056) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Crew Teams,Attribute A,Label A,Assignment Group A,Qualifier A,Airport A,Roles A,Is Requested A,Attribute B,Label B,Assignment Group B,Qualifier B,Airport B,Roles B,Is Requested B,Space,Unit,Directional,Is Location Equal Base A,Is Location Equal Base B,Utilize Post Duty Rest,is Line Training A,is Line Training B';

-- 8056更新 rule_parameter的table row
update rule_parameter set param_values=concat(param_values,',*,*')
where rule_id in (select id from rule where `function`=8056) and param_names like 'table%Row%';

-- 2026/03/26 CMSPAL-1308 Rule8106 - 新增GracePeriod参数
-- 8106法规，新增參數 Grace Period、Unit
-- header部分
update rule_parameter set param_values='Pairing Attributes,Assignment Groups,Assignments,Crew Nationlities,Bases,Ranks,Fleets,Grace Period,Unit,Required Qualifications,Crew Teams'
where rule_id in (select id from rule where `function`=8106) and param_names like 'table%Header%' 
	and param_values='Pairing Attributes,Assignment Groups,Assignments,Crew Nationlities,Bases,Ranks,Fleets,Required Qualifications,Crew Teams';
	
-- 8106更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 7) , ',*,*,' , SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=8106) and param_names like 'table%Row%';

-- 2026/3/27 rule2003 append Fleets / Fleet Group with wildcard defaults
update rule_parameter
set param_values='Base,maxPairingLength,maxNrDutiesInPairing,allowReturnBaseWithinDuty,MaxPairingBLH,MaxPairingCalendarDays,Allowable Layover Stations,Fleets,Fleet Group'
where rule_id in (select id from rule where `function`=2003) and param_names like 'table%Header%'
	and param_values='Base,maxPairingLength,maxNrDutiesInPairing,allowReturnBaseWithinDuty,MaxPairingBLH,MaxPairingCalendarDays,Allowable Layover Stations';

update rule_parameter
set param_values=concat(param_values,',*,*')
where rule_id in (select id from rule where `function`=2003) and param_names like 'table%Row%'
	and (char_length(param_values) - char_length(replace(param_values, ',', ''))) < 8;

-- 2025/11/xx Add FDP parameters USE STICK TIME and MIN CONNECTION TIME (BASIC_DEFINITION 2107)
set @rp_max_id = (select ifnull(max(id), 0) from rule_parameter);
insert into rule_parameter (id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
select @rp_max_id := @rp_max_id + 1, r.id, 1, 'tableRowUseStickTime', concat(r.division, ',USE STICK TIME,N'), null, 'ROIS', current_timestamp
from rule r
where r.`function` = 2107
  and not exists (select 1 from rule_parameter rp where rp.rule_id = r.id and rp.param_values like '%,USE STICK TIME,%');

insert into rule_parameter (id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
select @rp_max_id := @rp_max_id + 1, r.id, 1, 'tableRowMinConnectionTime', concat(r.division, ',MIN CONNECTION TIME,0'), null, 'ROIS', current_timestamp
from rule r
where r.`function` = 2107
  and not exists (select 1 from rule_parameter rp where rp.rule_id = r.id and rp.param_values like '%,MIN CONNECTION TIME,%');

-- 2026/01/29 SQ: rule3001 normalize Fleet Group Change to be before Max Conn
-- Header update for rows without Fleet Group Change
update rule_parameter
set param_values='Airport,Inbound Duty,Outbound Duty,Aircraft Change,FLT2FERRY,FERRY2FLT,DHD2FLT,FLT2DHD,TRAIN2FLT,FLT2TRAIN,Fleets,Sub Fleets,Mct,Airline Change,Fleet Group Change,Max Conn'
where rule_id in (select id from rule where `function`=3001)
  and param_names like 'table%Header%'
  and param_values='Airport,Inbound Duty,Outbound Duty,Aircraft Change,FLT2FERRY,FERRY2FLT,DHD2FLT,FLT2DHD,TRAIN2FLT,FLT2TRAIN,Fleets,Sub Fleets,Mct,Airline Change,Max Conn';

-- Header reorder for rows where Fleet Group Change was appended after Max Conn
update rule_parameter
set param_values='Airport,Inbound Duty,Outbound Duty,Aircraft Change,FLT2FERRY,FERRY2FLT,DHD2FLT,FLT2DHD,TRAIN2FLT,FLT2TRAIN,Fleets,Sub Fleets,Mct,Airline Change,Fleet Group Change,Max Conn'
where rule_id in (select id from rule where `function`=3001)
  and param_names like 'table%Header%'
  and param_values='Airport,Inbound Duty,Outbound Duty,Aircraft Change,FLT2FERRY,FERRY2FLT,DHD2FLT,FLT2DHD,TRAIN2FLT,FLT2TRAIN,Fleets,Sub Fleets,Mct,Airline Change,Max Conn,Fleet Group Change';

-- Insert default Fleet Group Change before Max Conn for old rows with 15 columns
update rule_parameter
set param_values=concat(substring_index(param_values, ',', 14), ',*,' , substring_index(param_values, ',', -1))
where rule_id in (select id from rule where `function`=3001)
  and param_names like 'table%Row%'
  and (length(param_values) - length(replace(param_values, ',', ''))) = 14;

-- Reorder rows when Fleet Group Change was appended after Max Conn
update rule_parameter
set param_values=concat(
    substring_index(param_values, ',', 14), ',',
    substring_index(param_values, ',', -1), ',',
    substring_index(substring_index(param_values, ',', -2), ',', 1)
)
where rule_id in (select id from rule where `function`=3001)
  and param_names like 'table%Row%'
  and (length(param_values) - length(replace(param_values, ',', ''))) = 15;

-- 2026/01/21 Add DIVISION column to rule 3021 for SQ
update rule_parameter rp
join rule r on rp.rule_id = r.id
set rp.param_values = concat(rp.param_values, ',DIVISION')
where r.`function` = 3021
  and r.filiale = 'SQ'
  and rp.param_names like 'table%Header%'
  and rp.param_values not like '%DIVISION%';

update rule_parameter rowp
join rule r on rowp.rule_id = r.id
join rule_parameter headp
  on headp.rule_id = rowp.rule_id
 and headp.phase_id = rowp.phase_id
 and headp.param_names like 'table%Header%'
set rowp.param_values = concat(rowp.param_values, ',*')
where r.`function` = 3021
  and r.filiale = 'SQ'
  and rowp.param_names like 'table%Row%'
  and headp.param_values like '%DIVISION%'
  and (length(rowp.param_values) - length(replace(rowp.param_values, ',', '')))
      = (length(headp.param_values) - length(replace(headp.param_values, ',', '')) - 1);

-- Rule 7400 migration: add ACC STATE CURRENT TZ and ACC STATE PREV TZ
update rule_parameter rp
join rule r on rp.rule_id = r.id
set rp.param_values = concat(rp.param_values, ',ACC STATE CURRENT TZ,ACC STATE PREV TZ'),
    rp.last_modified = current_timestamp
where r.`function` = 7400
  and rp.phase_id = 1
  and (rp.param_names = 'tableHeader' or rp.param_names = 'table1Header')
  and upper(rp.param_values) not like '%ACC STATE CURRENT TZ%';

update rule_parameter rowp
join rule r on rowp.rule_id = r.id
join rule_parameter headp
  on headp.rule_id = rowp.rule_id
 and headp.phase_id = rowp.phase_id
 and (headp.param_names = 'tableHeader' or headp.param_names = 'table1Header')
set rowp.param_values = concat(rowp.param_values, ',A,B'),
    rowp.last_modified = current_timestamp
where r.`function` = 7400
  and rowp.phase_id = 1
  and (rowp.param_names like 'tableRow%' or rowp.param_names like 'table1Row%')
  and upper(headp.param_values) like '%ACC STATE CURRENT TZ%'
  and (length(rowp.param_values) - length(replace(rowp.param_values, ',', '')))
      = (length(headp.param_values) - length(replace(headp.param_values, ',', '')) - 2);

-- 2026/01/26 Rule 7410: add APPLY REPORT TIME DIFFERENCE in table2
update rule_parameter rp
join rule r on rp.rule_id = r.id
set rp.param_values = concat(rp.param_values, ',APPLY REPORT TIME DIFFERENCE')
where r.`function` = 7410
  and rp.param_names = 'table2Header'
  and upper(rp.param_values) not like '%REPORT TIME DIFFERENCE%';

update rule_parameter rowp
join rule r on rowp.rule_id = r.id
join rule_parameter headp
  on headp.rule_id = rowp.rule_id
 and headp.phase_id = rowp.phase_id
 and headp.param_names = 'table2Header'
set rowp.param_values = concat(rowp.param_values, ',N')
where r.`function` = 7410
  and rowp.param_names like 'table2Row%'
  and upper(headp.param_values) like '%REPORT TIME DIFFERENCE%'
  and (length(rowp.param_values) - length(replace(rowp.param_values, ',', '')))
      = (length(headp.param_values) - length(replace(headp.param_values, ',', '')) - 1);

-- Rule 7412 migration: prepend CURRENT/NEXT DUTY PATTERN columns for table1
update rule_parameter rp
join rule r on r.id = rp.rule_id
set rp.param_values = concat('CURRENT DUTY PATTERN,NEXT DUTY PATTERN,', rp.param_values),
    rp.last_modified = current_timestamp
where r.`function` = 7412
  and rp.phase_id = 1
  and (rp.param_names = 'table1Header' or rp.param_names = 'tableHeader')
  and rp.param_values not like 'CURRENT DUTY PATTERN,NEXT DUTY PATTERN,%';

update rule_parameter rp
join rule r on r.id = rp.rule_id
set rp.param_values = concat('*,*,', rp.param_values),
    rp.last_modified = current_timestamp
where r.`function` = 7412
  and rp.phase_id = 1
  and (rp.param_names like 'table1Row%' or rp.param_names like 'tableRow%')
  and rp.param_values not like '*,*,%';

-- 2026/02/25 Rule 7415: add WORK DAY ENDS AT
update rule_parameter rp
join rule r on rp.rule_id = r.id
set rp.param_values = 'SERVICE TYPE,FLEET GROUP,MAX WORKING DAYS,LAST DAY BUFFER HHMM,WORK DAY ENDS AT'
where r.`function` = 7415
  and rp.param_names in ('tableHeader', 'table1Header')
  and upper(rp.param_values) not like '%WORK DAY ENDS AT%';

update rule_parameter rp
join rule r on rp.rule_id = r.id
set rp.param_values = concat(rp.param_values, ',TRANSPORT')
where r.`function` = 7415
  and (rp.param_names like 'tableRow%' or rp.param_names like 'table1Row%')
  and (length(rp.param_values) - length(replace(rp.param_values, ',', ''))) = 3;

-- 2026/01/29 Rule 7421: add Departure time at base in table1
update rule_parameter
set param_values='Clause,Pattern,Slip station,Group,Priority,Slip Arr Is Operating,Slip Dep Is Operating,Duty Assignment before slip,Duty Assignment after slip,Reporting time at base,Departure time at base,Previous Slip Local Nights,Previous Slip had standby,Min slip hours,Min slip local nights,Max slip hours,Slip depart duty report time,Duty After Hours,Duty After Local Nights,Duty After local time,Max Standby periods,Max standby hours,Allowed duty within slip,DO after duty,Extra Condition'
where rule_id in (select id from rule where `function`=7421)
  and param_names = 'table1Header'
  and param_values='Clause,Pattern,Slip station,Group,Priority,Slip Arr Is Operating,Slip Dep Is Operating,Duty Assignment before slip,Duty Assignment after slip,Reporting time at base,Previous Slip Local Nights,Previous Slip had standby,Min slip hours,Min slip local nights,Max slip hours,Slip depart duty report time,Duty After Hours,Duty After Local Nights,Duty After local time,Max Standby periods,Max standby hours,Allowed duty within slip,DO after duty,Extra Condition';

update rule_parameter
set param_values=concat(substring_index(param_values, ',', 10), ',*,' , substring_index(param_values, ',', -14))
where rule_id in (select id from rule where `function`=7421)
  and param_names like 'table1Row%'
  and (length(param_values) - length(replace(param_values, ',', ''))) = 23;

-- 2026/01/31 Rule 7421: set 9AI_STBY extra condition for clause 9(a)(i)
update `rule_parameter`
set `param_values` =
  '9(a)(i),SIN-JNB-SIN,JNB,DUTY,1,*,*,*,*,*,*,*,*,*,*,*,*,*,1,*,1,6,Duty IN (JNB-CPT-JNB; JNB-DUR-JNB),*,9AI_STBY'
where `param_names` = 'table1Row22'
  and `param_values` like '9(a)(i),SIN-JNB-SIN,%'
  and `rule_id` in (select `id` from `rule` where `function` = 7421);

-- 2026/02/25 Rule 7421: add Slip Arr Flight No in table1
update rule_parameter rp
join rule r on r.id = rp.rule_id
set rp.param_values = concat(rp.param_values, ',Slip Arr Flight No')
where r.`function` = 7421
  and rp.param_names = 'table1Header'
  and rp.param_values not like '%Slip Arr Flight No%';

update rule_parameter rp
join rule r on r.id = rp.rule_id
join rule_parameter hdr on hdr.rule_id = rp.rule_id and hdr.param_names = 'table1Header'
set rp.param_values = concat(rp.param_values, ',*')
where r.`function` = 7421
  and rp.param_names like 'table1Row%'
  and hdr.param_values like '%Slip Arr Flight No%'
  and (length(rp.param_values) - length(replace(rp.param_values, ',', '')))
      = (length(hdr.param_values) - length(replace(hdr.param_values, ',', '')) - 1);

-- 2026/06/05 Rule 7421: add Slip Dep Flight No in table1
update rule_parameter rp
join rule r on r.id = rp.rule_id
set rp.param_values = concat(rp.param_values, ',Slip Dep Flight No')
where r.`function` = 7421
  and rp.param_names = 'table1Header'
  and rp.param_values not like '%Slip Dep Flight No%';

update rule_parameter rp
join rule r on r.id = rp.rule_id
join rule_parameter hdr on hdr.rule_id = rp.rule_id and hdr.param_names = 'table1Header'
set rp.param_values = concat(rp.param_values, ',*')
where r.`function` = 7421
  and rp.param_names like 'table1Row%'
  and hdr.param_values like '%Slip Dep Flight No%'
  and (length(rp.param_values) - length(replace(rp.param_values, ',', '')))
      = (length(hdr.param_values) - length(replace(hdr.param_values, ',', '')) - 1);

-- 2026/02/25 Add Pairing Length Ends At for 7422, 7435, 7465
update `rule_parameter` rp
join `rule` r on r.`id` = rp.`rule_id`
set rp.`param_values` = concat(rp.`param_values`, ',Pairing length ends at')
where r.`function` = 7422
  and rp.`param_names` = 'table2Header'
  and rp.`param_values` not like '%Pairing length ends at%'
  and rp.`param_values` not like '%Pairing Length Ends At%';

update `rule_parameter` rp
join `rule` r on r.`id` = rp.`rule_id`
set rp.`param_values` = concat(rp.`param_values`, ',DEBRIEF')
where r.`function` = 7422
  and rp.`param_names` like 'table2Row%'
  and (length(rp.`param_values`) - length(replace(rp.`param_values`, ',', ''))) = 5;

update `rule_parameter` rp
join `rule` r on r.`id` = rp.`rule_id`
set rp.`param_values` = concat(rp.`param_values`, ',Pairing Length Ends At')
where r.`function` = 7435
  and rp.`param_names` in ('tableHeader', 'table1Header')
  and rp.`param_values` not like '%Pairing Length Ends At%'
  and rp.`param_values` not like '%Pairing length ends at%';

update `rule_parameter` rp
join `rule` r on r.`id` = rp.`rule_id`
set rp.`param_values` = concat(rp.`param_values`, ',TRANSPORT')
where r.`function` = 7435
  and (rp.`param_names` like 'tableRow%' or rp.`param_names` like 'table1Row%')
  and (length(rp.`param_values`) - length(replace(rp.`param_values`, ',', ''))) = 6;

update `rule_parameter` rp
join `rule` r on r.`id` = rp.`rule_id`
set rp.`param_values` = concat(rp.`param_values`, ',Pairing Length Ends At')
where r.`function` = 7465
  and rp.`param_names` in ('tableHeader', 'table1Header')
  and rp.`param_values` not like '%Pairing Length Ends At%'
  and rp.`param_values` not like '%Pairing length ends at%';

update `rule_parameter` rp
join `rule` r on r.`id` = rp.`rule_id`
set rp.`param_values` = concat(rp.`param_values`, ',DEBRIEF')
where r.`function` = 7465
  and (rp.`param_names` like 'tableRow%' or rp.`param_names` like 'table1Row%')
  and (length(rp.`param_values`) - length(replace(rp.`param_values`, ',', ''))) = 4;

-- 2026/02/04 Rule 7423: rename Rest starts after -> DO starts after in header
update rule_parameter
set param_values=replace(param_values, 'Rest starts after', 'DO starts after')
where rule_id in (select id from rule where `function`=7423)
  and param_names like 'table%Header%'
  and param_values like 'Rest starts after%';

-- Rule 7462 migration: append Duty Operating Type for table1
update `rule_parameter` rp
join `rule` r on r.id = rp.rule_id
set rp.param_values = concat(rp.param_values, ',Duty Operating Type'),
    rp.last_modified = current_timestamp
where r.`function` = 7462
  and rp.phase_id = 1
  and (rp.param_names = 'tableHeader' or rp.param_names = 'table1Header')
  and rp.param_values = 'Service Type,Segment Number In Duty,Allowed Sectors';

update `rule_parameter` rp
join `rule` r on r.id = rp.rule_id
set rp.param_values = concat(rp.param_values, ',FLY'),
    rp.last_modified = current_timestamp
where r.`function` = 7462
  and rp.phase_id = 1
  and (rp.param_names like 'tableRow%' or rp.param_names like 'table1Row%')
  and rp.param_values not like '%,FLY'
  and rp.param_values not like '%,POS'
  and rp.param_values not like '%,ANY';

-- 2026/01/30 Rule 7464: add Service Type and Fleet Group as leading columns
update rule_parameter
set param_values='Service Type,Fleet Group,Flight Flags,Flight Assignments,Exception Flight Routes,Max Transport Length'
where rule_id in (select id from rule where `function`=7464)
  and param_names like 'table%Header%'
  and param_values='Flight Flags,Flight Assignments,Exception Flight Routes,Max Transport Length';

update rule_parameter
set param_values=concat('*,*,', param_values)
where rule_id in (select id from rule where `function`=7464)
  and param_names like 'table%Row%'
  and (length(param_values) - length(replace(param_values, ',', ''))) = 3;


-- 2026/03/31 CMSPAL-1343 Rule7309 - 新增Overridable Assignment Groups
-- 7309法规，新增參數 Overridable Assignment Groups
-- header部分
update rule_parameter set param_values='Assignments,Attributes,Overridable Assignment Groups,Consecutive Type,Consecutive Times,Include Pairing Rest(Y/N),Counting Rest from Pairing End Day(Y/N),Direction,Rest Type,Min Rest'
where rule_id in (select id from rule where `function`=7309) and param_names like 'table%Header%' 
	and param_values='Assignments,Attributes,Consecutive Type,Consecutive Times,Include Pairing Rest(Y/N),Counting Rest from Pairing End Day(Y/N),Direction,Rest Type,Min Rest';
	
-- 7309更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 2) , ',*,' , SUBSTRING_INDEX(param_values, ',', -7))
where rule_id in (select id from rule where `function`=7309) and param_names like 'table%Row%';

-- 2026/04/05 CMSPAL-1386 Rule7362-新增 Check Mode参数
-- 7362法规，新增參數 Check Mode
-- header部分
update rule_parameter set param_values='Pairing Bases,Airport Area,Check Mode,Entry Times'
where rule_id in (select id from rule where `function`=7362) and param_names like 'table%Header%' 
	and param_values='Pairing Bases,Airport Area,Entry Times';
	
-- 7362更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 2) , ',*,' , SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=7362) and param_names like 'table%Row%';

-- 2026/04/06 CMSPAL-1388 【2P】7324 法规 下个月过生日的人无法在当月分配RDO
-- 7362法规，新增參數 Before/After Birthday Assignments
-- header部分
update rule_parameter set param_values='Bases,Ranks,Fleets,Teams,Birthday Assignments,Before/After Birthday Assignments,Days Off Before Birthday,Days Off After Birthday,Latest End Time,Earliest Start Time'
where rule_id in (select id from rule where `function`=7324) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Birthday Assignments,Days Off Before Birthday,Days Off After Birthday,Latest End Time,Earliest Start Time';
	
-- 7362更新 rule_parameter的table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 5) , ',*,' , SUBSTRING_INDEX(param_values, ',', -4))
where rule_id in (select id from rule where `function`=7324) and param_names like 'table%Row%';


-- 2026/04/08 法规6023 ROSCRW-18283 [TG][TCAR]Max FDP after Delayed reporting time - 6023 变更
-- 6023法规新增参数：Amount of Notification Ranges
-- header部分 table header
update rule_parameter set param_values='Amount of Total Delay,Amount of Notification Ranges,Revised or Original FDP Start Time(R/O),FDP Start Time Delta,is Schedule Departure Time(Y/N)'
where rule_id in (select id from rule where `function`=6023) and param_names like 'table%Header%' 
	and param_values='Amount of Total Delay,Revised or Original FDP Start Time(R/O),FDP Start Time Delta,is Schedule Departure Time(Y/N)';

-- value部分 table row
update rule_parameter set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 1) , ',*,' , SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=6023) and param_names like 'table%Row%';

-- 2026/04/08 法规8015 mantis-0012216: CR--ULR法規8015需增加其他判斷條件--ROSCRW-18369
-- 8015法规新增参数：route
-- header部分 table header
update rule_parameter set param_values='Max Sector,Min Flight Time,Min FDP,(OR)SBY Qualifiers,(OR)Labels,Exception Code,Route'
where rule_id in (select id from rule where `function`=8015) and param_names like 'table%Header%' 
	and param_values='Max Sector,Min Flight Time,Min FDP,(OR)SBY Qualifiers,(OR)Labels,Exception Code';

-- value部分 table row
update rule_parameter set param_values=CONCAT(param_values, ',*')
where rule_id in (select id from rule where `function`=8015) and param_names like 'table%Row%';

-- 2026/04/13 法规7480 HXCREW-261 【HKA】【Rule7480】1.DDO限制-7.21 - 参数调整Excluding Recovery DO Index为Excluding First Recovery 6 offset DO(Y/N)
-- 7480法规参数调整Excluding Recovery DO Index改为Excluding First Recovery 6 offset DO(Y/N)，移除Excluding Recovery TZ Diff
-- header部分
update rule_parameter 
set param_values='Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding First Recovery 6 offset DO(Y/N),Min Consecutive DO,Min DO'
where rule_id in (select id from rule where `function`=7480) and param_names like 'table%Header%' 
	and param_values = 'Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding Recovery TZ Diff,Excluding Recovery DO Index,Min Consecutive DO,Min DO';

-- value部分
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 7),',*,',SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7480) and param_names like 'table%Row%';

-- 2026/04/13 法规7484 HXCREW-67 【HKA】【Rule】4.FDP扩展-7.10.5 - 新增参数Single Fly Sector Blh Range和Rest Facility
-- 7484法规table2新增参数：Single Fly Sector Blh Range,Rest Facility
-- header部分 table1Header
update rule_parameter set param_values='Compositions,Rpt Start,Rpt End,Duty Assignments,Landing Lower,Landing Upper,Max FDP,Single Fly Sector Blh Range,Rest Facility'
where rule_id in (select id from rule where `function`=7484) and param_names like 'table1Header%'
	and param_values='Compositions,Rpt Start,Rpt End,Duty Assignments,Landing Lower,Landing Upper,Max FDP';
-- header部分 table2Header
update rule_parameter set param_values='Compositions,Preceding Rest Range,Duty Assignments,Landing Lower,Landing Upper,Max FDP,Single Fly Sector Blh Range,Rest Facility'
where rule_id in (select id from rule where `function`=7484) and param_names like 'table2Header%'
	and param_values='Compositions,Preceding Rest Range,Duty Assignments,Landing Lower,Landing Upper,Max FDP';


-- value部分 table1Row
update rule_parameter set param_values=CONCAT(param_values, ',*,*')
where rule_id in (select id from rule where `function`=7484) and param_names like 'table1Row%';

-- value部分 table2Row
update rule_parameter set param_values=CONCAT(param_values, ',*,*')
where rule_id in (select id from rule where `function`=7484) and param_names like 'table2Row%';

-- 2026/04/13 法规7491 HXCREW-67 【HKA】【Rule】4.FDP扩展-7.10.5 - 新增参数Extended To FDP
-- 7491法规新增参数：Extended To FDP
-- header部分
update rule_parameter set param_values='Composition,Pre Rest Duration,Single Fly Sector BLH Range,Rest Facility,Total In-flight Rest Duration,Min Concurrent Crew On Board,Min Concurrent Crew At Landing,Max Working Time,Extend FDP Pct,Max FDP,Each Additional Fly Sector Max FDP Reduced HRS,Extended To Fdp'
where rule_id in (select id from rule where `function`=7491) and param_names like 'table%Header%'
	and param_values='Composition,Pre Rest Duration,Single Fly Sector BLH Range,Rest Facility,Total In-flight Rest Duration,Min Concurrent Crew On Board,Min Concurrent Crew At Landing,Max Working Time,Extend FDP Pct,Max FDP,Each Additional Fly Sector Max FDP Reduced HRS';

-- value部分
update rule_parameter set param_values=CONCAT(param_values, ',*')
where rule_id in (select id from rule where `function`=7491) and param_names like 'table%Row%';

-- 2026/04/13 法规7248 mantis 0012082: CR-法規7248需要增加footprint sub type參數欄位
-- 7248法规新增参数：Footprint Subtypes
-- header部分
update rule_parameter 
set param_values='Footprint Types,Footprint Subtypes,Program Status,Prohibited Course Codes,Prohibited Roles,Prohibited Assignment Groups,Prohibited Assignments,to First Duty Date(Y/N)'
where rule_id in (select id from rule where `function`=7248) and param_names like 'table%Header%' 
	and param_values='Footprint Types,Program Status,Prohibited Course Codes,Prohibited Roles,Prohibited Assignment Groups,Prohibited Assignments,to First Duty Date(Y/N)';

-- value部分
update rule_parameter 
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 1),',*,',SUBSTRING_INDEX(param_values, ',', -6))
where rule_id in (select id from rule where `function`=7248) and param_names like 'table%Row%';

-- 2026/04/13 法规7220 [EVAFD] mantis 0011689: CR--法規7220應只針對BR/B7航班做檢查
-- 7220法规新增参数：Flight Airline Codes
-- header部分
update rule_parameter 
set param_values='Bases,Ranks,Fleets,Teams,Flight Airline Codes,Acting Ranks,Min BLH on Flight,Max Number of Crew on Flight'
where rule_id in (select id from rule where `function`=7220) and param_names like 'table%Header%' 
	and param_values='Bases,Ranks,Fleets,Teams,Acting Ranks,Min BLH on Flight,Max Number of Crew on Flight';

-- value部分
update rule_parameter 
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 4),',*,',SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=7220) and param_names like 'table%Row%';

-- 新增系统参数RULE_PHASE
insert into system_parameter(id, param_name, param_values, app_ids, param_desc, modified_by, last_modified) values ('240003', 'RULE_PHASE', 'N', NULL, 'Rule Phase', 'ROIS', CURRENT_TIMESTAMP);

-- 2026/04/17 法规7361 参数调整
-- 7361法规table1删除参数：Consecutive Days, Duration, Local Nights；新增参数：Unavailable Assignment Groups, Unavailable Assignments, Check Period, Check Mode
-- table1Header: 删除Consecutive Days,Duration,Local Nights，新增Unavailable Assignment Groups,Unavailable Assignments,Check Period,Check Mode
update rule_parameter
set param_values='Unavailable Assignment Groups,Unavailable Assignments,Home Base,Include Blank Day,Include Layover Rest,Include Pairing Base Rest,Days Off Assignment Groups,Days Off Assignments,Check Period,Check Mode'
where rule_id in (select id from rule where `function`=7361) and param_names like 'table1Header%'
	and param_values='Consecutive Days,Duration,Local Nights,Home Base,Include Blank Day,Include Layover Rest,Include Pairing Base Rest,Days Off Assignment Groups,Days Off Assignments';

-- table1Row: 删除前3个参数值，新增4个参数值(*,*,1,CW)
update rule_parameter
set param_values=CONCAT('*,*,',SUBSTRING_INDEX(param_values, ',', -6),',1,CW')
where rule_id in (select id from rule where `function`=7361) and param_names like 'table1Row%';

-- 7361法规table2删除参数：Leave Assignment Groups, Leave Assignments；参数名从Leave改为Unavailable
-- table2Header: 删除Leave Assignment Groups,Leave Assignments，Leave Days改名为Unavailable Days
update rule_parameter
set param_values='Unavailable Days,Min Days Off'
where rule_id in (select id from rule where `function`=7361) and param_names like 'table2Header%'
	and param_values='Leave Assignment Groups,Leave Assignments,Leave Days,Min Days Off,Check Period';

-- table2Row: 删除前2个参数值
update rule_parameter
set param_values=SUBSTRING_INDEX(param_values, ',', -3)
where rule_id in (select id from rule where `function`=7361) and param_names like 'table2Row%';


-- CMSCEB-711 Rule 3021 新增篩選條件 Routes（CEBU专用）
-- 3021法规新增参数：Routes
-- header部分
update rule_parameter 
set param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Routes,Brief Time,Effective date,Expired Date'
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Header%' and 
	param_values='Airport,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Brief Time,Effective date,Expired Date';

-- value部分
update rule_parameter 
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 10),',*,',SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Row%';

-- CMSCEB-554 Rule3021/3022 - 新增参数Pairing Bases（CEBU专用）
-- 3021和3022法规 新增筛选参数：Pairing Bases
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

-- 2026/04/21 法规8027 CMSPAL-1510 【2P】云测试 法规 8027违规未告警
-- 8027法规新增参数：DO Assignment
-- header部分
update rule_parameter 
set param_values='No. Month,Pattern Attribute,Min DO,DO Assignment,DO Assignment Group,Utilize Post Duty Rest,Count Blank Day'
where rule_id in (select id from rule where `function`=8027) and param_names like 'table%Header%' and 
	param_values='No. Month,Pattern Attribute,Min DO,DO Assignment Group,Utilize Post Duty Rest,Count Blank Day';

-- value部分
update rule_parameter 
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 3),',*,',SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=8027) and param_names like 'table%Row%';


-- ROSCRW-18549 【TG】【TCAR】MAX FDP extension without in-flight rest restrict by WOCL - 扩展7203法规
-- 7203 更新 rule_parameter的table header，7203法规新增Override Duty Attributes参数（位于DP Encroaching Period之后，忽略Severity）
update rule_parameter
set param_values='Bases,Compositions,Duty Type,Segment Assignments,Flight Fleets,Report Time Ranges,DP Encroaching Period,Override Duty Attributes,Sector BLH Ranges,Max Sector'
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Header%'
	and param_values='Bases,Compositions,Duty Type,Segment Assignments,Flight Fleets,Report Time Ranges,DP Encroaching Period,Sector BLH Ranges,Max Sector';

-- 7203 更新 rule_parameter的table row，在DP Encroaching Period后添加*作为Override Duty Attributes的默认值
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 7),',*,',SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Row%';

-- 2026/04/23 3021新增参数：Max FDP Brief
-- 3021法规新增参数：Max FDP Brief，用于定义计算Max FDP时使用的Brief
-- header部分：在Brief Time后新增Max FDP Brief
update rule_parameter
set param_values='Pairing Bases,Airport,End Airport,Sector Blh Range,Duty BLH Range,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Routes,Brief Time,Max FDP Brief,Effective date,Expired Date'
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Header%'
	and param_values='Pairing Bases,Airport,End Airport,Sector Blh Range,Duty BLH Range,DepStart,DepEnd,Duty Type,Flt Nums,Fleets,Assignment,Duty Assignments,Airlines,is Training,Routes,Brief Time,Effective date,Expired Date';

-- value部分：在Brief Time后新增默认值*
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 16),',*,',SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=3021) and param_names like 'table%Row%';

-- 2026/04/24 ROSCRW-18231 [TG][法规][TCAR] 10.1 FDP Extension with in-flight rest for flight crew - 7021/7317法规修改
-- 7021 更新 rule_parameter的table header，7021法规新增Sectors和Single BLH Range参数
update rule_parameter
set param_values='is Home Base(Y/N),Compositions,Duty Assignment Groups,Duty Type,Sectors,Single BLH Range,Min Rest'
where rule_id in (select id from rule where `function`=7021) and param_names like 'table%Header%'
	and param_values='is Home Base(Y/N),Compositions,Duty Assignment Groups,Duty Type,Min Rest';

-- 7021 更新 rule_parameter的table row，在Duty Type后添加*,*作为Sectors和Single BLH Range的默认值
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 4),',*,*,' , SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=7021) and param_names like 'table%Row%';

-- HXCREW-302 【HKA】【Rule7480】1.DDO限制-7.21 - 连续14天检查DDO优化
-- 7480 更新 rule_parameter的table header，7480法规新增Following Start of DDO(Y/N)参数
update rule_parameter
set param_values='Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding First Recovery 6 offset DO(Y/N),Following Start of DDO(Y/N),Min Consecutive DO,Min DO'
where rule_id in (select id from rule where `function`=7480) and param_names like 'table%Header%' and param_values='Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding First Recovery 6 offset DO(Y/N),Min Consecutive DO,Min DO';

-- 7480 更新 rule_parameter的table row，在Excluding First Recovery 6 offset DO(Y/N)后添加*作为Following Start of DDO的默认值
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 8),',*,',SUBSTRING_INDEX(param_values, ',', -2)) 
where rule_id in (select id from rule where `function`=7480) and param_names like 'table%Row%';


-- ROSCRW-18570 【TCAR】Rule 7203 根据连续duty类型决定最大航段数 (改造7203)
-- 7203 更新 rule_parameter的table header，7203法规新增Consecutive Duty参数（位于Duty Type之后）、Encroaching Duration（位于Duty DP Encroaching Period之后）
update rule_parameter
set param_values='Bases,Compositions,Duty Type,Consecutive Duty,Segment Assignments,Flight Fleets,Report Time Ranges,DP Encroaching Period,Encroaching Duration,Override Duty Attributes,Sector BLH Ranges,Max Sector'
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Header%'
	and param_values='Bases,Compositions,Duty Type,Segment Assignments,Flight Fleets,Report Time Ranges,DP Encroaching Period,Override Duty Attributes,Sector BLH Ranges,Max Sector';

-- 7203 更新 rule_parameter的table row，在Duty Type后添加*作为Consecutive Duty的默认值, DP Encroaching Period后添加*作为Encroaching Duration的默认值
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 3),',*,',CONCAT(SUBSTRING_INDEX(SUBSTRING_INDEX(param_values, ',', -7), ',', 4),',*,',SUBSTRING_INDEX(SUBSTRING_INDEX(param_values, ',', -7), ',', -3)))
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Row%';

-- 2026/05/08 Rule7490/7491 Composition参数改为Compositions，支持多选
update rule_parameter
set param_values=CONCAT('Compositions,', SUBSTRING(param_values, LENGTH('Composition,') + 1))
where rule_id in (select id from rule where `function` in (7490, 7491))
	and param_names like 'table%Header%'
	and param_values like 'Composition,%';

update rule_parameter
set param_values=CONCAT('COMPOSITIONS,', SUBSTRING(param_values, LENGTH('COMPOSITION,') + 1))
where rule_id in (select id from rule where `function` in (7490, 7491))
	and param_names like 'table%Header%'
	and param_values like 'COMPOSITION,%';


-- CMSPAL-1682 Rule 7311 - 新增No Of Sectors参数
-- 7311 更新 rule_parameter的table header，在Working Assignment Groups后添加No of Sectors参数
update rule_parameter 
set param_values='Bases,Compositions,Duty Type,Duty Assignments,Working Assignment Groups,No of Sectors,Is Line Training,Flight No,Exclude Flight No,BLH Ranges,Is Layover Rest,Overrideable(Y/N),Base Rest,Rest Multiplied,Override Duty Attributes'
where rule_id in (select id from rule where `function`=7311) and param_names like 'table%Header%' and  
 param_values='Bases,Compositions,Duty Type,Duty Assignments,Working Assignment Groups,Is Line Training,Flight No,Exclude Flight No,BLH Ranges,Is Layover Rest,Overrideable(Y/N),Base Rest,Rest Multiplied,Override Duty Attributes';

-- 7311 更新 rule_parameter的table row，No of Sectors参数设置*作为默认值
update rule_parameter 
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 5),',*,',SUBSTRING_INDEX(param_values, ',', -9))
where rule_id in (select id from rule where `function`=7311) and param_names like 'table%Row%';

-- 2026/5/12 法规8003 8014 新增参数 Qual Fleets, Qual Fleet Groups, Crew Fleets
-- 8003 新增参数：Qual Fleets, Qual Fleet Groups, Crew Fleets
-- header部分
update rule_parameter
set param_values=concat(param_values, ',Qual Fleets,Qual Fleet Groups,Crew Fleets')
where rule_id in (select id from rule where `function`=8003)
	and param_names like 'table%Header%';

-- value部分
update rule_parameter
set param_values=concat(param_values, ',*,*,*')
where rule_id in (select id from rule where `function`=8003)
	and param_names like 'table%Row%';

-- 8014 新增参数：Qual Fleets, Qual Fleet Groups, Crew Fleets
-- header部分
update rule_parameter
set param_values=concat(param_values, ',Qual Fleets,Qual Fleet Groups,Crew Fleets')
where rule_id in (select id from rule where `function`=8014)
	and param_names like 'table%Header%';

-- value部分
update rule_parameter
set param_values=concat(param_values,',*,*,*')
where rule_id in (select id from rule where `function`=8014)
	and param_names like 'table%Row%';

-- 2026/5/12 7487法规新增参数：Standby Assignment Groups
-- header部分，新参数放在第一个
update rule_parameter
set param_values='Standby Assignment Groups,Standby Assignments,Flight Within The Planned Standby,Call Out To Flight Gap Range,Max Durition From Standby To Flight Duty End'
where rule_id in (select id from rule where `function`=7487)
	and param_names like 'table%Header%'
	and param_values='Standby Assignments,Flight Within The Planned Standby,Call Out To Flight Gap Range,Max Durition From Standby To Flight Duty End';

-- value部分
update rule_parameter
set param_values=concat('*,', param_values)
where rule_id in (select id from rule where `function`=7487)
	and param_names like 'table%Row%';

-- 2026/5/12 7372法规新增参数：Assignment Groups
-- header部分，新参数放在第一个
update rule_parameter
set param_values='Assignment Groups,Assignments, Ground Offset,Rate,Ground Limit'
where rule_id in (select id from rule where `function`=7372)
	and param_names like 'table%Header%'
	and param_values='Assignments, Ground Offset,Rate,Ground Limit';

-- value部分
update rule_parameter
set param_values=concat('*,', param_values)
where rule_id in (select id from rule where `function`=7372)
	and param_names like 'table%Row%';

-- 2026/5/18 7364法规新增参数：Acting Ranks
-- header部分 在Teams之后新增Acting Ranks参数
update rule_parameter 
set param_values='Bases,Ranks,Fleets,Teams,Acting Ranks,Routes,Assignment Groups,Assignments,Airport Categories,Max Inexperience Crews'
where rule_id in (select id from rule where `function`=7364) and param_names like 'table%Header%' 
	and param_values = 'Bases,Ranks,Fleets,Teams,Routes,Assignment Groups,Assignments,Airport Categories,Max Inexperience Crews';

-- value部分 为新增的Acting Ranks参数添加默认值*
update rule_parameter 
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 4),',*,',SUBSTRING_INDEX(param_values, ',', -5))
where rule_id in (select id from rule where `function`=7364) and param_names like 'table%Row%';

-- 2026/5/18 CMSCEB-867 [RULE] 7301增加參數 DIR 和Flight Service Type
-- header部分 新增DIR和Service Type参数（在Flight Assignments之后）
update rule_parameter
set param_values='Flight Assignments,DIR,Service Type,Flight Hours,DP Adjust Pct,Callout Assignments'
where rule_id in (select id from rule where `function`=7301) and param_names like 'table%Header%'
	and param_values = 'Flight Assignments,Flight Hours,DP Adjust Pct,Callout Assignments';

-- value部分 在Flight Assignments后插入*,*
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 1),',*,*,',SUBSTRING_INDEX(param_values, ',', -3))
where rule_id in (select id from rule where `function`=7301) and param_names like 'table%Row%';

-- 2026/5/20 CMSCEB-1080 [CEBU] 7309新增参数Assignment Groups
-- 注意：5J 7309没有Overridable Assignment Groups参数
-- 7309 更新 rule_parameter的tableHeader，在Assignments前添加Assignment Groups参数
update rule_parameter
set param_values='Assignment Groups,Assignments,Attributes,Overridable Assignment Groups,Consecutive Type,Consecutive Times,Include Pairing Rest(Y/N),Counting Rest from Pairing End Day(Y/N),Direction,Rest Type,Min Rest'
where rule_id in (select id from rule where `function`=7309) and param_names like 'table%Header%'
	and param_values='Assignments,Attributes,Overridable Assignment Groups,Consecutive Type,Consecutive Times,Include Pairing Rest(Y/N),Counting Rest from Pairing End Day(Y/N),Direction,Rest Type,Min Rest';

-- 7309 更新 rule_parameter的tableRow，在开头添加默认值*（Assignment Groups）
update rule_parameter
set param_values=CONCAT('*,', param_values)
where rule_id in (select id from rule where `function`=7309) and param_names like 'tableRow%';

-- 2026/5/21 [CEBU] 法规7205 Rule Rolling Hours FDP/DP/BLH 支持 discretion
-- 7205 更新 rule_parameter的table header，7205法规新增参数 Discretion Applicable(Y/N)，放在Duty Type之后
update rule_parameter
set param_values='Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Discretion Applicable(Y/N),Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range'
where rule_id in (select id from rule where `function`=7205) and param_names like 'table%Header%'
	and param_values='Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range';

-- 7205 更新 rule_parameter的table row，在Duty Type后添加新参数默认值 *
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 7), ',*,', SUBSTRING_INDEX(param_values, ',', -5))
where rule_id in (select id from rule where `function`=7205) and param_names like 'table%Row%';

-- 2026/5/22 CMSCEB-609 Rule 7021 - EASA Min Rest By DP
-- 7021 更新 rule_parameter的table header，7021法规新增DP Range、Multiplied Type、Rest Multiplied参数，放在Single BLH Range之后
update rule_parameter
set param_values='is Home Base(Y/N),Compositions,Duty Assignment Groups,Duty Type,Sectors,Single BLH Range,DP Range,Multiplied Type,Rest Multiplied,Min Rest'
where rule_id in (select id from rule where `function`=7021) and param_names like 'table%Header%'
	and param_values='is Home Base(Y/N),Compositions,Duty Assignment Groups,Duty Type,Sectors,Single BLH Range,Min Rest';

-- 7021 更新 rule_parameter的table row，在Single BLH Range后添加*,*,*作为DP Range、Multiplied Type、Rest Multiplied的默认值
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 6),',*,*,*,' , SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=7021) and param_names like 'table%Row%';

-- 2026/5/22 CMSCEB-1099 Rule7205 增加參數Service Type
-- 7205 更新 rule_parameter的table header，7205法规新增参数 Service Type，放在Discretion Applicable(Y/N)之后
update rule_parameter
set param_values='Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Discretion Applicable(Y/N),Service Type,Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range'
where rule_id in (select id from rule where `function`=7205) and param_names like 'table%Header%'
	and param_values='Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Discretion Applicable(Y/N),Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range';

-- 7205 更新 rule_parameter的table row，在Discretion Applicable(Y/N)后添加新参数默认值 *
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 8), ',*,', SUBSTRING_INDEX(param_values, ',', -5))
where rule_id in (select id from rule where `function`=7205) and param_names like 'table%Row%';


-- 2026/5/26 HXCREW-346 【HKA】【Rule7489】10.Rest Periods-7.19 - 新增14天EXB Layover至少34:00参数
-- 7489 更新 rule_parameter的tableHeader，在 is Physiological Rest Included in Count statistics(Y/N) 后添加 Layover Assignments, Min Layover Assignments Duration
UPDATE rule_parameter
SET param_values='Consecutive Days,ACC State,Rest Assignment Groups,Rest Duration,is Physiological Rest Included in Count statistics(Y/N),Layover Assignments,Min Layover Assignments Duration,Max Consecutive Rest Duration Times,Max Total Rest Duration Times'
WHERE rule_id IN (SELECT id FROM rule WHERE `function`=7489) AND param_names LIKE 'table%Header%'
	AND param_values='Consecutive Days,ACC State,Rest Assignment Groups,Rest Duration,is Physiological Rest Included in Count statistics(Y/N),Max Consecutive Rest Duration Times,Max Total Rest Duration Times';

-- 7489 更新 rule_parameter的tableRow，在 is Physiological Rest Included in Count statistics(Y/N) 后添加默认值 *,*
UPDATE rule_parameter
SET param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 5), ',*,*,', SUBSTRING_INDEX(param_values, ',', -2))
WHERE rule_id IN (SELECT id FROM rule WHERE `function`=7489) AND param_names LIKE 'tableRow%';


-- 2026/5/26 HXCREW-347 【HKA】【Rule7480】1.DDO限制-7.21 - 新增外站EXB可代替DDO参数
-- 7480 更新 rule_parameter的tableHeader，在 Following Start of DDO(Y/N) 后添加 Layover Assignments, Layover Assignments Duration
UPDATE rule_parameter
SET param_values='Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding First Recovery 6 offset DO(Y/N),Following Start of DDO(Y/N),Layover Assignments,Layover Assignments Duration,Min Consecutive DO,Min DO'
WHERE rule_id IN (SELECT id FROM rule WHERE `function`=7480) AND param_names LIKE 'table%Header%'
	AND param_values='Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding First Recovery 6 offset DO(Y/N),Following Start of DDO(Y/N),Min Consecutive DO,Min DO';

-- 7480 更新 rule_parameter的tableRow，在 Following Start of DDO(Y/N) 后添加默认值 *,*
UPDATE rule_parameter
SET param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 9), ',*,*,', SUBSTRING_INDEX(param_values, ',', -2))
WHERE rule_id IN (SELECT id FROM rule WHERE `function`=7480) AND param_names LIKE 'tableRow%';


-- 2026/5/28 CMSCEB-1152【CEB】【RULE】3023/3024法规增加isLayover属性
-- 3023 更新 rule_parameter的tableHeader，在 Pairing Bases 后添加 is Layover(Y/N)
UPDATE rule_parameter
SET param_values='Pairing Bases,is Layover(Y/N),Airport,DepStart,DepEnd,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Pickup Time,Effective date,Expired Date'
WHERE rule_id IN (SELECT id FROM rule WHERE `function`=3023) AND param_names LIKE 'table%Header%'
	AND param_values='Pairing Bases,Airport,DepStart,DepEnd,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Pickup Time,Effective date,Expired Date';

-- 3023 更新 rule_parameter的tableRow，在 Pairing Bases 后添加默认值 *
UPDATE rule_parameter
SET param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 1), ',*,', SUBSTRING_INDEX(param_values, ',', -11))
WHERE rule_id IN (SELECT id FROM rule WHERE `function`=3023) AND param_names LIKE 'tableRow%';


-- 3024 更新 rule_parameter的tableHeader，在 Pairing Bases 后添加 is Layover(Y/N)
UPDATE rule_parameter
SET param_values='Pairing Bases,is Layover(Y/N),Airport,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Dropoff Time,Effective date,Expired Date'
WHERE rule_id IN (SELECT id FROM rule WHERE `function`=3024) AND param_names LIKE 'table%Header%'
	AND param_values='Pairing Bases,Airport,Duty Type,Airlines,Flt Nums,Fleets,Assignment,Dropoff Time,Effective date,Expired Date';

-- 3024 更新 rule_parameter的tableRow，在 Pairing Bases 后添加默认值 *
UPDATE rule_parameter
SET param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 1), ',*,', SUBSTRING_INDEX(param_values, ',', -9))
WHERE rule_id IN (SELECT id FROM rule WHERE `function`=3024) AND param_names LIKE 'tableRow%';

-- 2026/05/29 Rule 7203 - 新增参数 Dep Arps, Arv Arps
-- 7203法规，新增参数 Dep Arps, Arv Arps
-- header部分
update rule_parameter
set param_values='Bases,Compositions,Duty Type,Consecutive Duty,Segment Assignments,Flight Fleets,Report Time Ranges,DP Encroaching Period,Encroaching Duration,Override Duty Attributes,Sector BLH Ranges,Max Sector,Dep Arps,Arv Arps'
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Header%'
	and param_values='Bases,Compositions,Duty Type,Consecutive Duty,Segment Assignments,Flight Fleets,Report Time Ranges,DP Encroaching Period,Encroaching Duration,Override Duty Attributes,Sector BLH Ranges,Max Sector';

-- value部分
update rule_parameter
set param_values=CONCAT(param_values, ',*,*')
where rule_id in (select id from rule where `function`=7203) and param_names like 'table%Row%';

-- 2026/05/29 Rule 7492 - 新增参数 Pre Split Max FDP, Post Split Max FDP
-- 7492法规，新增参数 Pre Split Max FDP, Post Split Max FDP
-- header部分
update rule_parameter
set param_values='Compositions,LT Rest Threadhold,LT Rest Ratio,Pre Split Max FDP,Post Split Max FDP'
where rule_id in (select id from rule where `function`=7492) and param_names like 'table%Header%'
	and param_values='Compositions,LT Rest Threadhold,LT Rest Ratio';

-- value部分
update rule_parameter
set param_values=CONCAT(param_values, ',*,*')
where rule_id in (select id from rule where `function`=7492) and param_names like 'table%Row%';


-- 2026/05/29 HXCREW-382 [HKA][Rule7488] 10.Rest Periods-7.19 DP Range
-- 7488 更新 rule_parameter的table1Header，在TZ Diff Range前添加DP Range参数
update rule_parameter
set param_values='DP Range,TZ Diff Range,ACC State,Unacc Away From Base Duration,Compare With Pre Duty DP(Y/N),Standard Min Rest,Physiological Rest(Y/N),Physiological Rest Time Zone(Base/Local)'
where rule_id in (select id from rule where `function`=7488) and param_names='table1Header'
	and param_values='TZ Diff Range,ACC State,Unacc Away From Base Duration,Compare With Pre Duty DP(Y/N),Standard Min Rest,Physiological Rest(Y/N),Physiological Rest Time Zone(Base/Local)';

-- 7488 更新 rule_parameter的table1Row，在开头添加默认值*（DP Range）
update rule_parameter
set param_values=CONCAT('*,', param_values)
where rule_id in (select id from rule where `function`=7488) and param_names like 'table1Row%';

-- 2026/05/31 CMSCEB-1026 [5J][Rule7387] Check Standby Callout Duration
-- 7387 更新 rule_parameter的tableHeader，在Call Out Assignments后添加Combined参数
update rule_parameter
set param_values='Standby Assignment Groups,Call Out Assignments,Combined,Max Duration'
where rule_id in (select id from rule where `function`=7387) and param_names like 'table%Header%'
	and param_values='Standby Assignment Groups,Call Out Assignments,Max Duration';

-- 7387 更新 rule_parameter的tableRow，在Call Out Assignments后添加*作为Combined的默认值
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 2), ',*,', SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=7387) and param_names like 'table%Row%';

-- 2026/06/01 CMSCEB-1173 Rule - 7302 Adjust Max FDP by standby callout - EASA扩展
-- 7302 更新 rule_parameter的tableHeader，在Standby Assignments后添加三个新参数
update rule_parameter
set param_values='Bases,Ranks,Fleets,Teams,Standby Assignment Groups,Standby Assignments,Standby Start Range,Standby Overlap Range,Callout FDP Type,Threshold,Adjustment PCT'
where rule_id in (select id from rule where `function`=7302) and param_names like 'table%Header%'
	and param_values='Bases,Ranks,Fleets,Teams,Standby Assignment Groups,Standby Assignments,Threshold,Adjustment PCT';

-- 7302 更新 rule_parameter的tableRow，在Standby Assignments后添加三个*作为默认值
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 6), ',*,*,*,', SUBSTRING_INDEX(param_values, ',', -2))
where rule_id in (select id from rule where `function`=7302) and param_names like 'table%Row%';
