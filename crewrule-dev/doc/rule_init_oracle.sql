
select max(id) from rule_parameter;

-- 备份
create table rule_202400604_01 as select * from rule;

create table rule_parameter_202400604_01 as select * from rule_parameter;

select * from rule_202400604_01;
select * from rule_parameter_202400604_01;

-- 自定义函数substring_index2 
CREATE OR REPLACE function substring_index2(f_string in varchar2, f_delimiter in varchar2, f_position in number) return varchar2 
as
o_string varchar2(4000);
v_direction int;
v_instr_pos int;
BEGIN 
IF f_position = 0 THEN
		RETURN '';
END IF;
IF f_position > 0 THEN
	v_direction := 1;
	select INSTR(f_string, f_delimiter,v_direction,f_position) into v_instr_pos from dual;
	select SUBSTR(f_string, 1,CASE WHEN v_instr_pos = 0 THEN LENGTH(f_string) ELSE v_instr_pos-1 END) INTO o_string from dual;
ELSE
	v_direction := 1;
	select INSTR(f_string, f_delimiter,v_direction,ABS(f_position)) into v_instr_pos from dual;
	select SUBSTR(f_string, v_instr_pos+1,LENGTH(f_string)) INTO o_string from dual;
END IF;
RETURN o_string;
END substring_index2;

-- 6005法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6005001, 6005, '001', 'R', 'Basic definition of Acc State and adaption ', 'FRMS', 'FDP', 'MultiTable', 'Company', 'Basic definition of Split duty/Long transit', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089485, 6005001, 1, 'table1Header', 'TZ Diff,Time Since Last ACC,ACC State,ACC Port', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089486, 6005001, 1, 'table1Row1', '00:00-02:00,00:00-999:00,A,C', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089487, 6005001, 1, 'table1Row2', '02:00-24:00,00:00-36:00,A,L', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089488, 6005001, 1, 'table1Row3', '02:00-24:00,36:00-99:00,U,L', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089489, 6005001, 1, 'table2Header', 'TZ Diff,Direction,Adaption Period', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089490, 6005001, 1, 'table2Row1', '02:00-03:00,W,24:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089491, 6005001, 1, 'table2Row2', '03:00-04:00,W,36:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089492, 6005001, 1, 'table2Row3', '04:00-05:00,W,48:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089493, 6005001, 1, 'table2Row4', '05:00-06:00,W,48:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089494, 6005001, 1, 'table2Row5', '06:00-07:00,W,48:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089495, 6005001, 1, 'table2Row6', '07:00-08:00,W,72:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089496, 6005001, 1, 'table2Row7', '08:00-09:00,W,72:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089497, 6005001, 1, 'table2Row8', '09:00-10:00,W,72:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089498, 6005001, 1, 'table2Row9', '10:00-24:00,W,96:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089499, 6005001, 1, 'table2Row10', '02:00-03:00,E,30:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089500, 6005001, 1, 'table2Row11', '03:00-04:00,E,45:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089501, 6005001, 1, 'table2Row12', '04:00-05:00,E,60:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089502, 6005001, 1, 'table2Row13', '05:00-06:00,E,60:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089503, 6005001, 1, 'table2Row14', '06:00-07:00,E,60:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089504, 6005001, 1, 'table2Row15', '07:00-08:00,E,90:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089505, 6005001, 1, 'table2Row16', '08:00-09:00,E,90:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089506, 6005001, 1, 'table2Row17', '09:00-10:00,W,90:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208089507, 6005001, 1, 'table2Row18', '10:00-24:00,E,120:00', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 6006法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6006001, 6006, '001', 'P', 'Configure Airport Rest Facilty', 'FRMS', 'FDP', 'Table', 'Company', 'Configure Airport Rest Facilty', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000006, 6006001, 1, 'tableHeader', 'Pairing Bases,Airports,Transit Duration Ranges,Airport Rest Facilty', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000007, 6006001, 1, 'tableRow1', 'BNE|PER,WLG|PER,02:00-05:35,R', 'ROIS', CURRENT_TIMESTAMP);

-- 6007法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6007001, 6007, '001', 'P', 'FDP Limits for FCM in ACC or Unknown(A.5|A.6)', 'FRMS', 'FDP', 'MultiTable', 'Company', 'Max Number of Duty in Pairing', 'S', 4, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105048, 6007001, 1, 'table1Header', 'Composition,Rpt Start,Rpt End,Landing Lower,Landings Upper,Max FDP,Max DP,Max FT', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105049, 6007001, 1, 'table1Row1', '2P,05:00,05:59,1,3,12:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105050, 6007001, 1, 'table1Row2', '2P,05:00,05:59,4,4,12:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105051, 6007001, 1, 'table1Row3', '2P,05:00,05:59,5,5,10:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105052, 6007001, 1, 'table1Row4', '2P,05:00,05:59,6,6,9:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105053, 6007001, 1, 'table1Row5', '2P,05:00,05:59,7,7,9:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105054, 6007001, 1, 'table1Row6', '2P,05:00,05:59,8,99,8:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105055, 6007001, 1, 'table1Row7', '2P,06:00,06:59,1,3,12:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105056, 6007001, 1, 'table1Row8', '2P,06:00,06:59,4,4,12:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105057, 6007001, 1, 'table1Row9', '2P,06:00,06:59,5,5,11:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105058, 6007001, 1, 'table1Row10', '2P,06:00,06:59,6,6,10:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105059, 6007001, 1, 'table1Row11', '2P,06:00,06:59,7,7,10:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105060, 6007001, 1, 'table1Row12', '2P,06:00,06:59,8,99,9:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105061, 6007001, 1, 'table1Row13', '2P,07:00,12:59,1,3,13:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105062, 6007001, 1, 'table1Row14', '2P,07:00,12:59,4,4,12:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105063, 6007001, 1, 'table1Row15', '2P,07:00,12:59,5,5,12:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105064, 6007001, 1, 'table1Row16', '2P,07:00,12:59,6,6,11:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105065, 6007001, 1, 'table1Row17', '2P,07:00,12:59,7,7,11:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105066, 6007001, 1, 'table1Row18', '2P,07:00,12:59,8,99,10:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105067, 6007001, 1, 'table1Row19', '2P,13:00,13:59,1,3,12:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105068, 6007001, 1, 'table1Row20', '2P,13:00,13:59,4,4,11:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105069, 6007001, 1, 'table1Row21', '2P,13:00,13:59,5,5,11:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105070, 6007001, 1, 'table1Row22', '2P,13:00,13:59,6,6,10:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105071, 6007001, 1, 'table1Row23', '2P,13:00,13:59,7,7,10:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105072, 6007001, 1, 'table1Row24', '2P,13:00,13:59,8,99,9:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105073, 6007001, 1, 'table1Row25', '2P,14:00,14:59,1,3,11:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105074, 6007001, 1, 'table1Row26', '2P,14:00,14:59,4,4,10:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105075, 6007001, 1, 'table1Row27', '2P,14:00,14:59,5,5,10:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105076, 6007001, 1, 'table1Row28', '2P,14:00,14:59,6,6,9:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105077, 6007001, 1, 'table1Row29', '2P,14:00,14:59,7,7,9:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105078, 6007001, 1, 'table1Row30', '2P,14:00,14:59,8,99,8:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105079, 6007001, 1, 'table1Row31', '2P,15:00,16:59,1,3,10:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105080, 6007001, 1, 'table1Row32', '2P,15:00,16:59,4,4,9:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105081, 6007001, 1, 'table1Row33', '2P,15:00,16:59,5,5,9:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105082, 6007001, 1, 'table1Row34', '2P,15:00,16:59,6,6,8:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105083, 6007001, 1, 'table1Row35', '2P,15:00,16:59,7,7,8:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105084, 6007001, 1, 'table1Row36', '2P,15:00,16:59,8,99,7:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105085, 6007001, 1, 'table1Row37', '2P,17:00,4:59,1,3,10:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105086, 6007001, 1, 'table1Row38', '2P,17:00,4:59,4,4,9:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105087, 6007001, 1, 'table1Row39', '2P,17:00,4:59,5,5,9:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105088, 6007001, 1, 'table1Row40', '2P,17:00,4:59,6,6,8:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105089, 6007001, 1, 'table1Row41', '2P,17:00,4:59,7,7,8:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105090, 6007001, 1, 'table1Row42', '2P,17:00,4:59,8,99,7:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105091, 6007001, 1, 'table2Header', 'Composition,odp Start,odp End,Landing Lower,Landings Upper,Max FDP,Max DP,Max FT', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105092, 6007001, 1, 'table2Row1', '2P,00:00,30:00,1,3,10:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105093, 6007001, 1, 'table2Row2', '2P,00:00,30:00,4,4,9:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105094, 6007001, 1, 'table2Row3', '2P,00:00,30:00,5,5,9:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105095, 6007001, 1, 'table2Row4', '2P,00:00,30:00,6,6,8:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105096, 6007001, 1, 'table2Row5', '2P,00:00,30:00,7,7,8:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105097, 6007001, 1, 'table2Row6', '2P,00:00,30:00,8,99,7:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105098, 6007001, 1, 'table2Row7', '2P,99:00,99:00,1,3,12:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105099, 6007001, 1, 'table2Row8', '2P,99:00,99:00,4,4,11:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105100, 6007001, 1, 'table2Row9', '2P,99:00,99:00,5,5,11:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105101, 6007001, 1, 'table2Row10', '2P,99:00,99:00,6,6,10:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105102, 6007001, 1, 'table2Row11', '2P,99:00,99:00,7,7,10:00,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208105103, 6007001, 1, 'table2Row12', '2P,99:00,99:00,8,99,9:30,16:00,23:00', NULL, 'ROIS', CURRENT_TIMESTAMP);


-- 6008法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6008001, 6008, '001', 'P', 'FDP/FT Discretion for FD', 'QQ', 'FDP', 'Table', 'Company', 'FDP/FT Discretion for FD', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000016, 6008001, 1, 'tableHeader', 'ACC State,Compositions,Only Last Duty,FDP Max Extension,FT Max Extension', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000017, 6008001, 1, 'tableRow1', '*,*,*,02:00,00:30', 'ROIS', CURRENT_TIMESTAMP);

-- 6009法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6009001, 6009, '001', 'P', 'FDP/FT Discretion for CC', 'QQ', 'FDP', 'Table', 'Company', 'FDP/FT Discretion for CC', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000018, 6009001, 1, 'tableHeader', 'Maximum Duty Period,Flown Segment Ranges,Min ODP before Duty,FDP Max Extension,FT Max Extension', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000019, 6009001, 1, 'tableRow1', '18:00,0-7,*,02:00,00:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000020, 6009001, 1, 'tableRow2', '18:00,7-999,*,01:00,00:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000021, 6009001, 1, 'tableRow3', '18:00,*,04:00,04:00,00:00', 'ROIS', CURRENT_TIMESTAMP);

-- 6010法规
insert into rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) values ('6010001', '6010', '001', 'R', 'Limits before Annual Leave', 'QQ', 'FDP', 'Table', 'Company', 'Limits before Annual Leave', 'S', '1', 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

insert into rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) values ('208093980', '6010001', '1', 'tableHeader', 'Assignments,Min Period Days,Check Out Reference Time,Check In Reference Time', 'ROIS', CURRENT_TIMESTAMP);
insert into rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) values ('208093981', '6010001', '1', 'tableRow1', 'AL|RDO,7,14:00,12:00', 'ROIS', CURRENT_TIMESTAMP);

-- 6013法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6103001, 6103, '001', 'R', 'Off Duty Periods for Cumulative Fatigue Recovery（7Days）', 'QQ', 'Rest', 'Table', 'Company', 'Off Duty Periods for Cumulative Fatigue Recovery（7Days）', 'S', 1, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);


INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208096242, 6103001, 1, 'tableRow1', '*,*,*,7,36,2,CD,FLY|SBY,D,E,RDO,Y,Y,Y', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208096243, 6103001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Time Period,Min Rest,Min Local Night,Time Period Unit,Assignment Groups,Assignment Level(P/D),Check Period By Start Or End(S/E),DO Assignment Groups,Utilize Post Duty Rest,Ultilize Layover,Count Blank Day', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 6018法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6018001, 6018, '001', 'P', 'Limits Long Transit', 'FRMS', 'FDP', 'Table', 'Company', 'Limits Long Transit', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000000, 6018001, 1, 'tableHeader', 'Pairing Bases,Long Transit Airports', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000001, 6018001, 1, 'tableRow1', 'BNE|PER,WLG|PER', 'ROIS', CURRENT_TIMESTAMP);


-- 6019法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6019001, 6019, '001', 'P', 'Transit Connection Limits', 'FRMS', 'FDP', 'MultiTable', 'Company', 'Transit Connection Limits', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000002, 6019001, 1, 'table1Header', 'Pairing Bases,Layover Airports', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000003, 6019001, 1, 'table1Row1', 'BNE|PER,WLG|PER', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000004, 6019001, 1, 'table2Header', 'Pairing Bases,Transit Airports,Is AC Chg,Min Connection,Max Connection,Check Group(Any)', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000005, 6019001, 1, 'table2Row1', 'ADL,*,N,00:01,03:01,B', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000032, 6019001, 1, 'table2Row2', '*,*,N,00:01,02:01,A', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000033, 6019001, 1, 'table2Row3', '*,*,N,05:35,10:01,A|B', 'ROIS', CURRENT_TIMESTAMP);


-- 6020法规：飞行岗位配置
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6020001, 6020, '001', 'P', 'Increase Maximum Flight Duty Time Limits by Split Duty', 'QQ', 'FDP', 'Table', 'Company', 'Increase Maximum Flight Duty Time Limits by Split Duty for FD', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000008, 6020001, 1, 'tableHeader', 'Include Split Duty Period Ranges,Exclude Split Duty Period Ranges,Station Rest Facilty,Split Duty Rest Duration Ranges,Min Rest,Increase in FDP,Percent Increase in FDP,Max Increase in FDP,Max FDP,Max FDP After Split Duty Rest Period,Delta FDP After Rest', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000009, 6020001, 1, 'tableRow1', '*,*,R,02:00-999:00,*,*,0.5,02:00,16:00,*,00:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000010, 6020001, 1, 'tableRow2', '*,23:00-05:30,S,04:00-999:00,*,04:00,*,*,16:00,07:00,02:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000011, 6020001, 1, 'tableRow3', '23:00-05:30,*,S,04:00-999:00,*,16:00,*,*,16:00,06:00,00:00', 'ROIS', CURRENT_TIMESTAMP);


-- 6020法规：客舱配置
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6020002, 6020, '002', 'P', 'Increase Maximum Flight Duty Time Limits by Split Duty', 'QQ', 'FDP', 'Table', 'Company', 'Increase Maximum Flight Duty Time Limits by Split Duty for CC', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000012, 6020002, 1, 'tableHeader', 'Include Split Duty Period Ranges,Exclude Split Duty Period Ranges,Station Rest Facilty,Split Duty Rest Duration Ranges,Min Rest,Increase in FDP,Percent Increase in FDP,Max Increase in FDP,Max FDP,Max FDP After Split Duty Rest Period,Delta FDP After Rest', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000013, 6020002, 1, 'tableRow1', '*,*,S,*,*,04:00,*,*,16:00,*,00:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000014, 6020002, 1, 'tableRow2', '*,*,R,*,*,02:00,*,*,16:00,*,00:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000015, 6020002, 1, 'tableRow3', '23:00-05:30,*,S,*,07:00,16:00,*,*,16:00,*,00:00', 'ROIS', CURRENT_TIMESTAMP);


-- 6021法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6021001, 6021, '001', 'P', 'Limit Transit Aircraft Change', 'FRMS', 'FDP', 'Table', 'Company', 'Limit Transit Aircraft Change', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000030, 6021001, 1, 'tableHeader', 'Pairing Bases,Transit Airports,AC Chg Allowed', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000031, 6021001, 1, 'tableRow1', 'BNE|PER,WLG|PER,Y', 'ROIS', CURRENT_TIMESTAMP);

-- 6022法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6022001, 6022, '001', 'P', 'Change Duty Time of Delayed Flight', 'FRMS', 'FDP', 'Table', 'Company', 'Change Duty Time of Delayed Flight', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000034, 6022001, 1, 'tableHeader', 'Is Home Base,Amount of Notification Ranges,Is Used New Reporting Time,Original Reporting Time Delta', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000035, 6022001, 1, 'tableRow1', 'Y,02:00-999:00,Y,00:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000036, 6022001, 1, 'tableRow2', 'Y,00:00-02:00,N,00:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000037, 6022001, 1, 'tableRow3', 'N,01:00-999:00,Y,00:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000038, 6022001, 1, 'tableRow4', 'N,00:00-01:00,N,00:00', 'ROIS', CURRENT_TIMESTAMP);

-- 6023法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6023001, 6023, '001', 'P', 'Maximum FDP after Delay', 'QQ', 'Definition', 'Table', 'Company', 'Maximum FDP after Delay', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000053, 6023001, 1, 'tableHeader', 'Amount of Total Delay,Revised or Original FDP Start Time(R/O),FDP Start Time Delta', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000054, 6023001, 1, 'tableRow1', '00:00-04:00,R,00:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000055, 6023001, 1, 'tableRow2', '04:00-10:00,O,04:00', 'ROIS', CURRENT_TIMESTAMP);

-- 6032法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6032001, 6032, '001', 'R', 'Max Consecutive WOCL Duty Limit', 'QQ', 'Roster', 'Table', 'Company', 'Max Consecutive WOCL Duty Limit', 'S', 1, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208094807, 6032001, 1, 'tableHeader', 'WOCL Start,WOCL End,Allowed Consecutive Times,First Max Consecutive Times,First Reduce FDP Time,Need Local Night Num,Second Max Consecutive Times,Second Reduce FDP Time', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208094808, 6032001, 1, 'tableRow1', '02:00,05:59,3,4,2:00,1,5,4:00', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 6033法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6033001, 6033, '001', 'R', 'Max Consecutive Early Duty Limit', 'QQ', 'Duty', 'Table', 'Company', 'Max Consecutive Early Duty Limit', 'S', 1, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208087072, 6033001, 1, 'tableHeader', 'Duty Start Loc Range Start,Duty Start Loc Range End,Allowed Consecutive Times,First Max Consecutive Times,First Reduce FDP Time,Second Max Consecutive Times,Second Reduce FDP Time', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208087073, 6033001, 1, 'tableRow', '05:00,06:59,3,4,2:00,5,4:00', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 6034法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6034001, 6034, '001', 'R', 'No more than 3 rosters start before 0600 in any 7 Calendar Days', 'QQ', 'Roster', 'Table', 'Company', 'Max Duty In 7 Day Limit', 'S', 1, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208095044, 6034001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Duty Earier Than,Max Times,Period,Unit,Check Type', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208095045, 6034001, 1, 'tableRow1', '*,*,*,06:00,3,7,CD,D', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 6035法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6035001, 6035, '001', 'R', 'Max Consecutive Nights away from Base', 'QQ', 'Roster', 'Table', 'Company', 'Max Consecutive Nights away from Base', 'S', 1, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208095046, 6035001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Max Times', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208095047, 6035001, 1, 'tableRow1', '*,*,*,6', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 6036法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6036001, 6036, '001', 'R', 'Working Days Limit For CC', 'QQ', 'Roster', 'Table', 'Company', 'Working Days Limit For CC', 'S', 1, 'QQ', 'C', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208095050, 6036001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Duty Assignments,Min Times', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208095051, 6036001, 1, 'tableRow1', '*,*,*,FLY|SBY,16', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208095052, 6036001, 1, 'tableRow2', '*,*,*,U/A,4', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208095053, 6036001, 1, 'tableRow3', '*,*,*,RDO,8', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 6100法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6100001, 6100, '001', 'R', 'Calculation of Off Duty Period', 'QQ', 'Rest', 'Table', 'Company', 'Calculation of Off Duty Period', 'S', 1, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (100002012, 6100001, 1, 'tableRow1', '*,*,*,FLY|MVO|MVP,Y,A,12:00-999:00,12:00,1.5,E,2:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (100002013, 6100001, 1, 'tableRow2', '*,*,*,FLY|MVO|MVP,Y,A,00:00-12:00,12:00,0,E,2:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (100002014, 6100001, 1, 'tableRow3', '*,*,*,FLY|MVO|MVP,Y,A,12:00-999:00,12:00,1.5,W,-3:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (100002015, 6100001, 1, 'tableRow4', '*,*,*,FLY|MVO|MVP,Y,A,00:00-12:00,12:00,0,W,-3:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (100002016, 6100001, 1, 'tableRow5', '*,*,*,FLY|MVO|MVP,N,A,12:00-999:00,10:00,1.5,E,2:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (100002017, 6100001, 1, 'tableRow6', '*,*,*,FLY|MVO|MVP,N,A,00:00-12:00,10:00,0,E,2:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (100002018, 6100001, 1, 'tableRow7', '*,*,*,FLY|MVO|MVP,N,A,12:00-999:00,10:00,1.5,W,-3:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (100002019, 6100001, 1, 'tableRow8', '*,*,*,FLY|MVO|MVP,N,A,00:00-12:00,10:00,0,W,-3:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (100002020, 6100001, 1, 'tableRow9', '*,*,*,FLY|MVO|MVP,*,U,12:00-999:00,14:00,1.5,*,*', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (100002021, 6100001, 1, 'tableRow10', '*,*,*,FLY|MVO|MVP,Y,U,00:00-12:00,14:00,0,*,*', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (100002022, 6100001, 1, 'tableRow11', '*,*,*,FLY|MVO|MVP,N,U,00:00-12:00,14:00,0,*,*', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (100002023, 6100001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Duty Assignments,Is Home Base,Acclimatized State,FDP Threshold,Rest Time,FDP Times,Direction,Displacement Adjustment Reference Time', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 6101法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6101001, 6101, '001', 'P', 'Reduction in Off Duty Period at Base', 'QQ', 'Rest', 'Table', 'Company', 'Reduction in Off Duty Period at Base', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000024, 6101001, 1, 'tableHeader', 'Bases,Min ODP Ranges,Min ODP Reduced to Minimum', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000025, 6101001, 1, 'tableRow1', '*,11:00-12:01,11:00', 'ROIS', CURRENT_TIMESTAMP);

-- 6102法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6102001, 6102, '001', 'P', 'Reduction in Off Duty Period away from Base', 'QQ', 'Rest', 'MultiTable', 'Company', 'Reduction in Off Duty Period away from Base', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000026, 6102001, 1, 'table1Header', 'First ODP Minimum,First FDP Maximum,Second ODP Minimum,Second ODP ACC State,Second FDP Maximum,Third ODP Minimum,Second ODP Reduced to Minimum', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000027, 6102001, 1, 'table1Row1', '12:00,10:00,09:00,A,*,12:00,09:00', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000028, 6102001, 1, 'table2Header', 'First FDP Maximum,First ODP Minimum,Second FDP Maximum,Second FDP ACC State,Second ODP Minimum,Second ODP Local Nights,First ODP Reduced to Minimum', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000029, 6102001, 1, 'table2Row1', '16:00,14:00,*,A,36:00,2,14:00', 'ROIS', CURRENT_TIMESTAMP);


-- 6105法规
INSERT INTO RULE(ID, FUNCTION, INSTANCE, CLASS, DESCRIPTION, REFERENCE, CATEGORY, STORE_STRUCTURE, SOURCE, DETAIL, OVERRIDABILITY, SEVERITY, FILIALE, DIVISION, OWNER, LOCKED, MODIFIED_BY, LAST_MODIFIED) VALUES ('6105001', '6105', '001', 'R', 'Min Rest At Base Or Layover Stations', 'QQ', 'Rest', 'Table', 'Company', 'Min Rest At Base Or Layover Stations', 'S', '1', 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO RULE_PARAMETER(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED) VALUES ('208093977', '6105001', '1', 'tableHeader', 'Compositions,Assignments,Bases,Rest Bunk,Segments,BLH Ranges,FDP Ranges,Is Cross Midnight,Is Delay,Layover Stations,Min Rest At Base,Min Rest At Layover', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO RULE_PARAMETER(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED) VALUES ('208093978', '6105001', '1', 'tableRow1', '*,*,PER|CNS|TSV|ADL|DRW|ROK|BNE,0,00-12,00:00-12:00,00:00-12:00,Y,N,*,08:00,08:00', 'ROIS', CURRENT_TIMESTAMP);

-- 6107法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6107001, 6107, '001', 'C', 'FDP Limit-QQ-Acclim For CC', 'QQ', 'Tracking', 'MultiTable', 'Company', 'Max Number of Duty in Pairing', 'S', 2, 'QQ', 'C', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093940, 6107001, 1, 'tableHeader', 'Composition,Rpt Start,Rpt End,Landing Lower,Landings Upper,Rest Facility,Max FDP,Max Extension,Max DP,Max FT', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093941, 6107001, 1, 'tableRow1', 'CC2P,05:00,05:59,1,2,*,13:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093942, 6107001, 1, 'tableRow2', 'CC2P,05:00,05:59,3,3,*,12:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093943, 6107001, 1, 'tableRow3', 'CC2P,05:00,05:59,4,4,*,12:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093944, 6107001, 1, 'tableRow4', 'CC2P,05:00,05:59,5,5,*,11:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093945, 6107001, 1, 'tableRow5', 'CC2P,05:00,05:59,6,6,*,11:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093946, 6107001, 1, 'tableRow6', 'CC2P,05:00,05:59,7,99,*,10:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093947, 6107001, 1, 'tableRow7', 'CC2P,06:00,12:59,1,2,*,14:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093948, 6107001, 1, 'tableRow8', 'CC2P,06:00,12:59,3,3,*,13:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093949, 6107001, 1, 'tableRow9', 'CC2P,06:00,12:59,4,4,*,13:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093950, 6107001, 1, 'tableRow10', 'CC2P,06:00,12:59,5,5,*,12:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093951, 6107001, 1, 'tableRow11', 'CC2P,06:00,12:59,6,6,*,11:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093952, 6107001, 1, 'tableRow12', 'CC2P,06:00,12:59,7,99,*,10:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093953, 6107001, 1, 'tableRow13', 'CC2P,13:00,14:59,1,2,*,13:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093954, 6107001, 1, 'tableRow14', 'CC2P,13:00,14:59,3,3,*,12:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093955, 6107001, 1, 'tableRow15', 'CC2P,13:00,14:59,4,4,*,12:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093956, 6107001, 1, 'tableRow16', 'CC2P,13:00,14:59,5,5,*,11:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093957, 6107001, 1, 'tableRow17', 'CC2P,13:00,14:59,6,6,*,11:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093958, 6107001, 1, 'tableRow18', 'CC2P,13:00,14:59,7,99,*,11:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093959, 6107001, 1, 'tableRow19', 'CC2P,15:00,04:59,1,2,*,12:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093960, 6107001, 1, 'tableRow20', 'CC2P,15:00,04:59,3,3,*,11:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093961, 6107001, 1, 'tableRow21', 'CC2P,15:00,04:59,4,4,*,11:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093962, 6107001, 1, 'tableRow22', 'CC2P,15:00,04:59,5,5,*,10:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093963, 6107001, 1, 'tableRow23', 'CC2P,15:00,04:59,6,6,*,10:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208093964, 6107001, 1, 'tableRow24', 'CC2P,15:00,04:59,6,6,*,10:00,2:00,16:00,16:00', NULL, 'ROIS', CURRENT_TIMESTAMP);


-- 6109法规
INSERT INTO RULE(ID, FUNCTION, INSTANCE, CLASS, DESCRIPTION, REFERENCE, CATEGORY, STORE_STRUCTURE, SOURCE, DETAIL, OVERRIDABILITY, SEVERITY, FILIALE, DIVISION, OWNER, LOCKED, MODIFIED_BY, LAST_MODIFIED) VALUES ('6109001', '6109', '001', 'R', 'Min ODP between Duties for CC', 'QQ', 'Rest', 'Table', 'Company', 'Min ODP between Duties for CC', 'S', '1', 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO RULE_PARAMETER(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED) VALUES ('208084675', '6109001', '1', 'tableHeader', 'PREV DP,MAX REF REST DP,FACTOR DP,SPLIT DUTY LIMIT START TIME,SPLIT DUTY LIMIT END TIME,SPLIT DUTY MIN REF REST,SPLIT REST PERIOD DISCOUNT FACTOR', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO RULE_PARAMETER(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED) VALUES ('208084676', '6109001', '1', 'tableRow1', '12:00,10:00,1.5,23:00,05:30,4,0.5', 'ROIS', CURRENT_TIMESTAMP);

-- 6110法规

INSERT INTO RULE(ID, FUNCTION, INSTANCE, CLASS, DESCRIPTION, REFERENCE, CATEGORY, STORE_STRUCTURE, SOURCE, DETAIL, OVERRIDABILITY, SEVERITY, FILIALE, DIVISION, OWNER, LOCKED, MODIFIED_BY, LAST_MODIFIED) VALUES ('6110001', '6110', '001', 'R', 'Min ODP in a Period for CC', 'QQ', 'Rest', 'Table', 'Company', 'Min ODP in a Period for CC', 'S', '1', 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO RULE_PARAMETER(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED) VALUES ('208084677', '6110001', '1', 'tableHeader', 'MAX PERIOD DAYS,MIN CONSECUTIVE HOURS PER PERIOD,MAX PERIOD NIGHTS,MIN CONSECUTIVE NIGHTS PER PERIOD,NIGHT START TIME,NIGHT END TIME,MAX ROSTER PERIOD,MIN DAYS FREE OF DUTY', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO RULE_PARAMETER(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED) VALUES ('208084678', '6110001', '1', 'tableRow1', '7,36,8,2,22:00,05:00,28,6', 'ROIS', CURRENT_TIMESTAMP);


-- 6115法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6115001, 6115, '001', 'R', 'Max Consecutive Days-QQ', 'QQ', 'Tracking', 'Table', 'Company', NULL, 'S', 5, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208094371, 6115001, 1, 'tableHeader', 'bases,ranks,fleets,duty assignments,Max Consecutive Day,Add Max Consecutive Day,Add Max Times,Unit', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208094372, 6115001, 1, 'tableRow1', '*,*,*,FLY|MVO|MVP|SBY|TGP|SIM,4,5,1,CD', NULL, 'ROIS', CURRENT_TIMESTAMP);




-- 6111法规

INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6111001, 6111, '001', 'P', 'Rest Discretion', 'QQ', 'Rest', 'Table', 'Company', 'Rest Discretion', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200000022, 6111001, 1, 'tableHeader', 'is Home Base,ACC State,Compositions,Min ODP Ranges,Reduction Type,Rest Max Reduction', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200000023, 6111001, 1, 'tableRow1', 'Y,*,*,11:00-12:01,T,11:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002276, 6111001, 1, 'tableRow2', '*,*,*,*,R,02:00', NULL, 'ROIS', CURRENT_TIMESTAMP);


-- 7006法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7006001, 7006, '1', 'B', '累计飞时计算法规-TG', 'Charpte-7-OM-A', '派遣', 'Table', 'Charpte-7-OM-A_Rev24_15AUG22', '累计飞时计算法规-TG', 'S', 1, 'QQ', 'P', 'S', '',  '7C', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200000056, 7006001, 1, 'tableHeader', 'Division,Flight Time Start,Flight Time End,Composition,Percent', '', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200000057, 7006001, 1, 'tableRow1', 'C,08:00,10:00,*,0.8', '', '7C', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200000058, 7006001, 1, 'tableRow2', 'C,10:00,12:00,*,0.75', '', '7C', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200000059, 7006001, 1, 'tableRow3', 'C,10:00,99:00,*,0.7', '', '7C', CURRENT_TIMESTAMP);

-- 7007法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7007001, 7007, '001', 'B', 'Limit On Local Day Free', 'OSQM', 'Roster', 'Table', 'OSQM_R20_20OCT23', 'Limit On Local Day Free-TG', 'S', 1, 'QQ', 'P', 'S', '', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (7007001, 7007001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,DO Assignments,DO Assignment Groups,Period,Unit,Min Local Day Free,Utilize Post Duty Rest,Count Blank Day', '', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (7007002, 7007001, 1, 'tableRow1', '*,*,*,*,DO,*,1,CM,8,N,N', '', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (7007003, 7007001, 1, 'tableRow2', '*,*,*,*,DO,*,7,CD,1,N,N', '', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (7007004, 7007001, 1, 'tableRow3', '*,*,*,*,DO,*,1,CQ,26,N,N', '', 'ROIS', CURRENT_TIMESTAMP);

-- 7008法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7008001, 7008, '001', 'B', 'Standby Limit-TG', 'OSQM', 'Roster', 'Table', 'OSQM_R20_20OCT23', 'Standby限制-TG', 'S', 1, 'QQ', 'P', 'S', '', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (7008001, 7008001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Assignments,Assignment Groups,Max Consecutive Day,Min Rest Days', '', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (7008002, 7008001, 1, 'tableRow1', '*,*,*,*,*,SBY,3,1', '', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (7008003, 7008001, 1, 'tableRow2', '*,*,*,*,*,FLY,2,2', '', 'ROIS', CURRENT_TIMESTAMP);

-- 7009法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7009001, 7009, '001', 'B', 'Single Duty Per Day', 'OSQM', 'Roster', 'Table', 'OSQM_R20_20OCT23', 'Single Duty Per Day-TG', 'S', 1, 'QQ', 'P', 'S', '', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (7009001, 7009001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Assignments,Prev Roster Start,Next Roster End', '', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (7009002, 7009001, 1, 'tableRow1', '*,*,*,*,FLY|TRG|GND|SBY,E,S', '', 'ROIS', CURRENT_TIMESTAMP);

-- 7011法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7011001, 7011, '001', 'B', 'Crew Country Limitation', 'OSQM', 'Roster', 'Table', 'OSQM_R20_20OCT23', 'Crew Country Limitation-TG', 'S', 1, 'QQ', 'P', 'S', '', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (7011001, 7011001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Crew Nationality,Countries,Quals', '', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (7011002, 7011001, 1, 'tableRow1', '*,*,*,*,NZ,AU|ID,*', '', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (7011003, 7011001, 1, 'tableRow2', '*,*,*,*,ES,ID,PID', '', 'ROIS', CURRENT_TIMESTAMP);

-- 7013法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7013001, 7013, '001', 'B', 'COF Multiple Quals For TG', 'OSQM', 'Roster', 'Table', 'OSQM_R20_20OCT23', 'COF Multiple Quals For TG', 'S', 5, 'QQ', 'P', 'S', '0', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208112556, 7013001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Pilot,Flight Number,Airports,Attributes,Assignments,Acting Ranks,Quals', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208112558, 7013001, 1, 'tableRow1', '*,CPT,*,*,0,*,*,*,FLY|MVO,*,DG+FCCTPP+FCEPC', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 7014法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7014001, 7014, '001', 'B', 'Recurrent Extended Recovery Rest Period', 'TG', 'EASA', 'Table', 'TCAR', 'Recurrent Extended Recovery Rest Period', 'S', 1, 'QQ', 'P', 'S', '', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (7014001, 7014001, 1, 'tableHeader', 'RERRP Min Rest,RERRP No Of LNS,Max Span Between RERRPS,RERRP Min Local days,RERRP Assignments,Is Count Blank Day,Unit,Period,Min RERRP Num', '', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (7014002, 7014001, 1, 'tableRow1', '36:00,2,168:00,2,DO,Y,CM,1,2', '', 'ROIS', CURRENT_TIMESTAMP);

-- 7015法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7015001, 7015, '001', 'P', 'Rest for the Late Arrival/Early Start', 'TG', 'Roster', 'Table', 'Company', 'Rest for the Late Arrival/Early Start', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000049, 7015001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Assignments,Next Roster Assignments,Start or End(S/E),Local Start Time,Local End Time,Min Gap Between Rosters,Including Rest At Base(Y/N),Next Roster Should Not Before Time', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000050, 7015001, 1, 'tableRow1', '*,*,*,*,*,*,E,22:00,05:00,24:00,Y,14:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7016法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7016001, 7016, '001', 'P', 'Crew Operating Recency', 'TG', 'Roster', 'Table', 'Company', 'Crew Operating Recency', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000051, 7016001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Assignments,Max Days Since Last Operating,Operating Fleets,Operating Airports', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000052, 7016001, 1, 'tableRow1', '*,*,*,*,FLY|MVO,60,*,*', 'ROIS', CURRENT_TIMESTAMP);


-- 7100法规

INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7100001, 7100, '001', 'P', 'Min Rest Post Duty', 'EVA', 'Rest', 'Table', 'Company', 'Min Rest Post Duty', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000040, 7100001, 1, 'tableHeader', 'Compositions,Duty Assignment Groups,Duty Fleet,Duty Type,BLH Range,FDP Range,Based Min Rest,Increment of FDP', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000041, 7100001, 1, 'tableRow1', '*,FLY,*,*,00:00-08:00,*,11:00,02:30', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000042, 7100001, 1, 'tableRow2', '2P,FLY,*,I,08:01-99:00,*,18:00,02:30', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000043, 7100001, 1, 'tableRow3', '3P,FLY,*　,*,08:01-12:00,*,18:00,02:30', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000044, 7100001, 1, 'tableRow4', '3P,FLY,*,*,12:01-99:00,*,24:00,02:30', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000045, 7100001, 1, 'tableRow5', '4P,FLY,*,*,08:01-16:00,*,18:00,02:30', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000046, 7100001, 1, 'tableRow6', '4P,FLY,*　,*,12:01-99:00,*,22:00,02:30', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000047, 7100001, 1, 'tableRow7', '*,PNC,*,*,00:00-99:00,*,11:00,02:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000048, 7100001, 1, 'tableRow8', '*,SNY,*,*,00:00-99:00,*,10:00,02:00', 'ROIS', CURRENT_TIMESTAMP);

-- 6024法规 2024/06/13
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6024001, 6024, '001', 'P', 'Max FDP for Standby', 'QQ', 'FDP', 'Table', 'Company', 'Max FDP for Standby', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000060, 6024001, 1, 'tableHeader', 'Compositions,Standby Assignments,ACC State,Including Split Duty(Y/N),Min Split Rest,Rest Facility,Overlap Time Windows,Max Call out FDP', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200000061, 6024001, 1, 'tableRow1', '2P,SBY03|SBY04|SBY05,A,Y,04:00,S,02:00-06:59,16:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7202法规 2024/06/13
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7202001, 7202, '001', 'B', 'X-Days Cumulative BLH Limit', 'EVA', 'FDP', 'Table', 'Company', 'X-Days Cumulative BLH Limit', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002000, 7202001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Assignments,Compositions,Period,Unit,Max BLH', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002001, 7202001, 1, 'tableRow1', '*,*,*,*,2P,7,CD,32:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7203法规 2024/06/19
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7203001, 7203, '001', 'B', 'Duty Sector Restriction', 'EVA', 'Duty', 'Table', 'Company', 'Duty Sector Restriction', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002002, 7203001, 1, 'tableHeader', 'Duty Type,Segment Assignments,Sector BLH Ranges,Max Sector', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002003, 7203001, 1, 'tableRow1', 'D,OPR|FRY,00:00-00:20,16', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002004, 7203001, 1, 'tableRow2', 'D,OPR|FRY,00:20-999:00,12', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002005, 7203001, 1, 'tableRow3', 'I,OPR|FRY,*,6', 'ROIS', CURRENT_TIMESTAMP);


-- 7204法规 2024/06/19
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7204001, 7204, '001', 'P', 'Duty Sector Restriction With Sleep Cycle', 'EVA', 'Duty', 'MultiTable', 'Company', 'Duty Sector Restriction With Sleep Cycle', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002006, 7204001, 1, 'table1Header', 'Compositions,Duty Assignments,Departure Start,Departure End,Min Duty BLH,Min Duty FDP,Max Sector', 'Day-night Time Restriction', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002007, 7204001, 1, 'table1Row1', '2P,*,22:00,06:00,08:01,*,1', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002008, 7204001, 1, 'table1Row2', '2P,*,22:00,06:00,*,12:01,1', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002009, 7204001, 1, 'table1Row3', '3P|4P,*,06:00,22:00,10:01,*,3', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002010, 7204001, 1, 'table1Row4', '3P|4P,*,06:00,22:00,*,14:01,3', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002011, 7204001, 1, 'table1Row5', '3P,*,22:00,06:00,*,*,1', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002012, 7204001, 1, 'table1Row6', '4P,*,22:00,06:00,*,*,2', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002013, 7204001, 1, 'table2Header', 'Compositions,Duty Assignments,FDP Local Start,FDP Local End,Max Sector', 'FDP Restriction', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002014, 7204001, 1, 'table2Row1', '3P,*,22:00,06:01,1', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002015, 7204001, 1, 'table2Row2', '4P,*,22:00,06:01,2', 'ROIS', CURRENT_TIMESTAMP);


-- 7210法规
INSERT INTO RULE
(ID, "FUNCTION", "INSTANCE", CLASS, DESCRIPTION, REFERENCE, CATEGORY, STORE_STRUCTURE, "SOURCE", DETAIL, OVERRIDABILITY, SEVERITY, FILIALE, DIVISION, OWNER, LOCKED, MODIFIED_BY, LAST_MODIFIED)
VALUES(7210001, 7210, '001', 'B', 'Check Consecutive WOCL Rest', 'EVA DEFINITION', 'Rest', 'Table', 'Company', 'Check Consecutive WOCL Rest', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO RULE_PARAMETER
(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA)
VALUES(200002256, 7210001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,WOCL Start,WOCL End,Max Space Between WOCLs,Consecutive WOCL Number,Min Rest', 'ROIS', TIMESTAMP '2024-06-25 23:57:42.000000', NULL);
INSERT INTO RULE_PARAMETER
(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA)
VALUES(200002257, 7210001, 1, 'tableRow1', '*,*,*,*,02:00,05:00,14:00,2,34:00', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO RULE_PARAMETER
(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA)
VALUES(200002258, 7210001, 1, 'tableRow2', '*,*,*,*,02:00,05:00,14:00,3,54:00', 'ROIS', CURRENT_TIMESTAMP, NULL);

-- 7205法规
INSERT INTO rule
(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(7205001, 7205, '001', 'B', 'Max BLH in X Period', 'EVA', 'Duty', 'Table', 'Company', 'Max BLH in X Period', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter
(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
VALUES(200002262, 7205001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit BLH Range,Limit FDP Range', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter
(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
VALUES(200002263, 7205001, 1, 'tableRow1', '*,*,*,*,2P,*,D,24,RH,00:00-08:01,00:00-999:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter
(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
VALUES(200002264, 7205001, 1, 'tableRow2', '*,*,*,*,2P,*,I,24,RH,00:00-10:01,00:00-999:00', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7211法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(7211001, 7211, '001', 'B', 'Min Rest after Cumulative FT in Consecutive Hours', 'EVA', 'Duty', 'Table', 'Company', 'Min Rest after Cumulative FT in Consecutive Hours', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002265, 7211001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Consecutive Hours,Cumulative Max BLH,Min Rest', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002266, 7211001, 1, 'tableRow1', '*,*,*,*,2P,*,I,24:00,08:00,18:00', null, 'ROIS', CURRENT_TIMESTAMP);

-- 6037法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(6037001, 6037, '001', 'P', 'Limit Flight DHD', 'QQ', 'Duty', 'Table', 'Company', 'Limit Flight DHD', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);
-- INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
-- VALUES(6037002, 6037, '002', 'P', 'Limit Flight DHD', 'QQ', 'Duty', 'Table', 'Company', 'Limit Flight DHD', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002267, 6037001, 1, 'tableHeader', 'Pairing Bases,Flight Airline,Flight Number,International/Domestic,Allow used as DHD(Y/N)', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002268, 6037001, 1, 'tableRow1', '*,QQ,*,*,N', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002269, 6037001, 1, 'tableRow2', '*,*,*,I,N', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002270, 6037001, 1, 'tableRow3', '*,*,*,*,Y', null, 'ROIS', CURRENT_TIMESTAMP);

-- INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002271, 6037002, 2, 'tableHeader', 'Pairing Bases,Flight Airline,Flight Number,International/Domestic,Allow used as DHD(Y/N)', null, 'ROIS', CURRENT_TIMESTAMP);
-- INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002272, 6037002, 2, 'tableRow1', 'PER,*,*,D,Y', null, 'ROIS', CURRENT_TIMESTAMP);
-- INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002273, 6037002, 2, 'tableRow2', '*,*,*,*,N', null, 'ROIS', CURRENT_TIMESTAMP);

-- 6038法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(6038001, 6038, '001', 'P', 'Min Rest for Unknown State of ACC in Consecutive Duties', 'QQ', 'Duty', 'Table', 'FRMS', 'Min Rest for Unknown State of ACC in Continuous Duties', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002274, 6038001, 1, 'tableHeader', 'Max Consecutive Duties,Max Unknown States of ACC', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002275, 6038001, 1, 'tableRow1', '4,1', null, 'ROIS', CURRENT_TIMESTAMP);


-- 6025法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(6025001, 6025, '001', 'P', 'Limit Max Duty Period', 'QQ', 'Duty', 'Table', 'FRMS', 'Limit Max Duty Period', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002277, 6025001, 1, 'tableHeader', 'is Home Base,Assignments,Max DP', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002278, 6025001, 1, 'tableRow1', '*,SBY03|SBY05|SBY06|SBY07|SBY08|SBY09|SBYAPT05|SBYAPT06|SBYAPT07|SBYAPT12|SBY04|SBY15|SBY16|SBY17|SBY18|SBY19|SBY20|SBY21|SBY,12:00', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7212法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(7212001, 7212, '001', 'B', 'Minimum Sleep Cycle at Layover Station', 'EVA', 'Duty', 'Table', 'Company', 'Minimum Sleep Cycle at Layover Station', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002279, 7212001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Last Duty Compositions,Segment Assignments,Sector BLH Ranges,Pairing End Stations,Layover Min Rest,Min WOCL Number', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002280, 7212001, 1, 'tableRow1', '*,*,*,*,3P,*,11:00-999:00,TPE,36:00,2', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002281, 7212001, 1, 'tableRow2', '*,*,*,*,4P,*,11:00-999:00,TPE,*,1', null, 'ROIS', CURRENT_TIMESTAMP);

-- 2040法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (2040001, 2040, '001', 'B', 'WOCL Definition', 'QQ', 'Define', 'Table', 'Company', 'WOCL Definition', 'S', 1, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002282, 2040001, 1, 'tableRow1', '02:00,05:59', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002283, 2040001, 1, 'tableHeader', 'WOCL Start,WOCL End', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2041法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (2041001, 2041, '001', 'B', 'Early Start Definition', 'QQ', 'Define', 'Table', 'Company', 'Early Start Definition', 'S', 1, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002284, 2041001, 1, 'tableRow1', '05:00,06:59', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002285, 2041001, 1, 'tableHeader', 'Early Start Start,Early Start End', NULL, 'ROIS', CURRENT_TIMESTAMP);


-- 2042??
-- Late finish definition: duties ending between 01:00 and 01:59 acclimated time are flagged as late finishes
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (2042001, 2042, '001', 'B', 'Late Finish Definition', 'SQ', 'Define', 'Table', 'Company', 'Defines a late finish as a scheduled arrival ending between 01:00 and 01:59 acclimated time', 'S', 1, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003407, 2042001, 1, 'tableHeader', 'Late Finish Start,Late Finish End', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003408, 2042001, 1, 'tableRow1', '01:00,01:59', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 7214法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(7214001, 7214, '001', 'B', 'Layover Rest Limitation by Time Zone', 'EVA', 'Duty', 'Table', 'Company', 'Layover Rest Limitation by Time Zone', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002288, 7214001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Segment Assignments,Min Num of Pairing Sector,Min Time Zone Gap,Layover Min Rest,Min WOCL Number', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002289, 7214001, 1, 'tableRow1', '*,*,*,*,OPR|FRY,3,06:00,36:00,2', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7215法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(7215001, 7215, '001', 'B', 'Definition of Credit Hours', 'EVA', 'Duty', 'Table', 'Company', 'Definition of Credit Hours', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002916, 7215001, 1, 'tableHeader', 'Assignment Groups,Assignments,IP/CK&Chief Pilot Credit,Course Code,Role(Trainer/Trainee),IP/CK QUAL,Chief Pilot Rank,Credit,Credit BT Gap,Percent,Delay Buffer,Multiple', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002873, 7215001, 1, 'tableRow1', 'FLY|MVO,FLY|OPR,*,*,*,*,AW|AU|AX,BT,00:00,1,0:30,1.35', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002874, 7215001, 1, 'tableRow2', 'FLY|MVO,FLY|OPR,*,*,*,*,!(AW|AU|AX),BT,00:00,1,0:30,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002875, 7215001, 1, 'tableRow3', 'MVP,DHD|PNC,*,*,*,*,AW|AU|AX,BT,00:00,0.5,0:30,1.35', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002876, 7215001, 1, 'tableRow4', 'MVP,DHD|PNC,*,*,*,*,!(AW|AU|AX),BT,00:00,0.5,0:30,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002877, 7215001, 1, 'tableRow5', 'MVP,SNY|PSG,*,*,*,*,*,BT,00:00,0,0:30,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002878, 7215001, 1, 'tableRow6', 'FLY|MVO,FLY|OPR,*,OBS,IP|OIP|STD|XIP,*,AW|AU|AX,BT,00:00,1,0:30,1.35', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002879, 7215001, 1, 'tableRow7', 'FLY|MVO,FLY|OPR,*,OBS,IP|OIP|STD|XIP,LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM,!(AW|AU|AX),BT,00:00,1,0:30,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002880, 7215001, 1, 'tableRow8', 'FLY|MVO,FLY|OPR,*,OBS,TE|PBN,*,*,BT,00:00,0,0:30,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002881, 7215001, 1, 'tableRow9', 'FLY|MVO,FLY|OPR,*,OBS,IP|OIP|STD|XIP,!(LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM),!(AW|AU|AX),BT,00:00,0,0:30,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002882, 7215001, 1, 'tableRow10', 'FLY|MVO,FLY|OPR,*,SPP,IP|OIP|STD|XIP,*,AW|AU|AX,BT,00:00,1,0:30,1.2', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002883, 7215001, 1, 'tableRow11', 'FLY|MVO,FLY|OPR,*,SPP,IP|OIP|STD|XIP,LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM,!(AW|AU|AX),BT,00:00,1,0:30,1.2', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002884, 7215001, 1, 'tableRow12', 'FLY|MVO,FLY|OPR,*,SPP,TE|PBN,*,*,BT,00:00,1,0:30,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002885, 7215001, 1, 'tableRow13', 'FLY|MVO,FLY|OPR,*,SPP,IP|OIP|STD|XIP,!(LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM),!(AW|AU|AX),BT,00:00,1,0:30,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002886, 7215001, 1, 'tableRow14', 'FLY|MVO,FLY|OPR,*,!(OBS|SPP|LOT|LOC),IP|OIP|STD|XIP,*,AW|AU|AX,BT,00:00,1,0:30,1.35', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002887, 7215001, 1, 'tableRow15', 'FLY|MVO,FLY|OPR,*,!(OBS|SPP|LOT|LOC),IP|OIP|STD|XIP,LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM,!(AW|AU|AX),BT,00:00,1,0:30,1.2', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002888, 7215001, 1, 'tableRow16', 'FLY|MVO,FLY|OPR,*,!(OBS|SPP|LOT|LOC),IP|OIP|STD|XIP,!(LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM),!(AW|AU|AX),BT,00:00,1,0:30,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002889, 7215001, 1, 'tableRow17', 'FLY|MVO,FLY|OPR,*,!(OBS|SPP|LOT|LOC),TE,*,*,BT,00:00,1,0:30,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002890, 7215001, 1, 'tableRow18', 'FLY|MVO,FLY|OPR,*,!(OBS|SPP|LOT|LOC),PBN,*,*,BT,00:00,1,0:30,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002891, 7215001, 1, 'tableRow19', 'FLY|MVO,FLY|OPR,*,LOT|LOC,IP|OIP|STD|XIP,*,AW|AU|AX,BT,00:00,1,0:30,1.35', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002892, 7215001, 1, 'tableRow20', 'FLY|MVO,FLY|OPR,*,LOT|LOC,PBN,*,*,BT,00:00,1,0:30,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002893, 7215001, 1, 'tableRow21', 'FLY|MVO,FLY|OPR,*,LOT|LOC,IP|OIP|STD|XIP,LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM,!(AW|AU|AX),BT,00:00,1,0:30,1.2', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002894, 7215001, 1, 'tableRow22', 'FLY|MVO,FLY|OPR,*,LOT|LOC,IP|OIP|STD|XIP,!(LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM),!(AW|AU|AX),BT,00:00,1,0:30,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002895, 7215001, 1, 'tableRow23', 'FLY|MVO,FLY|OPR,*,LOT|LOC,TE,*,*,BT,00:00,0,0:30,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002896, 7215001, 1, 'tableRow24', 'SIM,SIM,*,EM1|EM2|TM1|TM2|EX1|EX2,IP|OIP|STD|XIP,*,AW|AU|AX,BT,01:00,1,*,1.35', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002897, 7215001, 1, 'tableRow25', 'SIM,SIM,*,EM1|EM2|TM1|TM2|EX1|EX2,IP|OIP|STD|XIP,LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM,!(AW|AU|AX),BT,01:00,1,*,1.3', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002898, 7215001, 1, 'tableRow26', 'SIM,SIM,*,EM1|EM2|TM1|TM2|EX1|EX2,IP|OIP|STD|XIP,!(LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM),!(AW|AU|AX),BT,01:00,1,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002899, 7215001, 1, 'tableRow27', 'SIM,SIM,*,EM1|EM2|TM1|TM2|EX1|EX2,PNR,*,AW|AU|AX,BT,01:00,1,*,1.35', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002900, 7215001, 1, 'tableRow28', 'SIM,SIM,*,EM1|EM2|TM1|TM2|EX1|EX2,PNR,*,!(AW|AU|AX),BT,01:00,1,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002901, 7215001, 1, 'tableRow29', 'SIM,SIM|FTD,*,!(EM1|EM2|TM1|TM2|EX1|EX2),IP|OIP|STD|XIP,*,AW|AU|AX,BT,00:00,1,*,1.35', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002902, 7215001, 1, 'tableRow30', 'SIM,SIM|FTD,*,!(EM1|EM2|TM1|TM2|EX1|EX2),IP|OIP|STD|XIP,LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM,!(AW|AU|AX),BT,00:00,1,*,1.3', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002903, 7215001, 1, 'tableRow31', 'SIM,SIM|FTD,*,!(EM1|EM2|TM1|TM2|EX1|EX2),IP|OIP|STD|XIP,!(LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM),!(AW|AU|AX),BT,00:00,1,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002904, 7215001, 1, 'tableRow32', 'SIM,SIM|FTD,*,!(EM1|EM2|TM1|TM2|EX1|EX2),PNR,*,AW|AU|AX,BT,00:00,1,*,1.35', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002905, 7215001, 1, 'tableRow33', 'SIM,SIM|FTD,*,!(EM1|EM2|TM1|TM2|EX1|EX2),PNR,*,!(AW|AU|AX),BT,00:00,1,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002906, 7215001, 1, 'tableRow34', 'SIM,*,*,*,TE|PBN,*,*,BT,00:00,0,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002907, 7215001, 1, 'tableRow35', 'SIM,*,*,TST,*,*,*,BT,00:00,1,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002908, 7215001, 1, 'tableRow36', 'LEA,AL,*,*,*,*,*,AGH,00:00,1,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002909, 7215001, 1, 'tableRow37', 'LEA,OL,*,*,*,*,*,AGH,00:00,1,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002910, 7215001, 1, 'tableRow38', 'ADM|GND|MTG|TRG,*,Y,*,*,*,AW|AU|AX,GND,00:00,1,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002911, 7215001, 1, 'tableRow39', 'ADM|GND|MTG|TRG,*,Y,*,*,*,AW|AU|AX,GND,00:00,1,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002912, 7215001, 1, 'tableRow40', 'ADM|GND|MTG|TRG,*,Y,*,*,LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM,!(AW|AU|AX),GND,00:00,1,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002913, 7215001, 1, 'tableRow41', 'ADM|GND|MTG|TRG,*,N,*,*,!(LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM),!(AW|AU|AX),GND,00:00,0,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002914, 7215001, 1, 'tableRow42', 'TRAIN,HR,*,*,*,*,AW|AU|AX,BT,00:00,0.5,*,1.35', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002915, 7215001, 1, 'tableRow43', 'TRAIN,HR,*,*,*,*,!(AW|AU|AX),BT,00:00,0.5,*,1', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7217法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(7217001, 7217, '001', 'B', 'Definition of Pairing Per Diem Hour', 'EVA', 'Pairing', 'Table', 'Company', 'Definition of Pairing Per Diem Hour', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002917, 7217001, 1, 'tableHeader', 'Pairing Assignment Groups,Duty Assignments,Per Diem,Per Diem Gap', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002918, 7217001, 1, 'tableRow1', 'MVP,SNY|PSG,0,00:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002919, 7217001, 1, 'tableRow2', 'MVP,PNC|MVP,D-B,00:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002920, 7217001, 1, 'tableRow3', 'FLY|MVO,FLY|OPR,D-B,01:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002921, 7217001, 1, 'tableRow4', 'SIM,SIM,D-B,00:00', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7218法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(7218001, 7218, '001', 'B', 'Definition of Per Diem Hour', 'EVA', 'Pairing', 'Table', 'Company', 'Definition of Per Diem Hour', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002922, 7218001, 1, 'tableHeader', 'Pairing Assignment Groups,Duty Assignments,Course Code,Role(Trainer/Trainee),IP/CK QUAL,Chief Pilot Rank,Segment Special Tag,Per Diem,Per Diem Gap', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002923, 7218001, 1, 'tableRow1', 'MVP,SNY|PSG,*,*,*,*,X,0,00:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002924, 7218001, 1, 'tableRow2', 'MVP,PNC|MVP,*,*,*,*,X,D-B,00:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002925, 7218001, 1, 'tableRow3', 'FLY|MVO,FLY|OPR,LOT|LOC,*,*,*,X,D-B,01:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002926, 7218001, 1, 'tableRow4', 'FLY|MVO,FLY|OPR,OBS,TE|PBN,*,*,X,0,00:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002927, 7218001, 1, 'tableRow5', 'FLY|MVO,FLY|OPR,OBS,IP|OIP|STD|XIP,!(LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM),!(AW|AU|AX),X,0,00:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002928, 7218001, 1, 'tableRow6', 'FLY|MVO,FLY|OPR,OBS,IP|OIP|STD|XIP,LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM,*,X,D-B,00:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002929, 7218001, 1, 'tableRow7', 'FLY|MVO,FLY|OPR,OBS,IP|OIP|STD|XIP,*,AW|AU|AX,X,D-B,00:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002930, 7218001, 1, 'tableRow8', 'FLY|MVO,FLY|OPR,*,*,*,*,X,D-B,00:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002931, 7218001, 1, 'tableRow9', 'SIM,SIM,*,TE|PBN,*,*,X,0,00:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002932, 7218001, 1, 'tableRow10', 'SIM,SIM,*,*,*,*,X,D-B,00:00', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7220法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(7220001, 7220, '001', 'B', '(FOM 3.19) Max 1 crew with less than 75hrs flight time on a flight', 'EVA', 'Pairing', 'Table', 'Company', '(FOM 3.19) Max 1 crew with less than 75hrs flight time on a flight', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002933, 7220001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Min BLH on Flight,Max Number of Crew on Flight', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002934, 7220001, 1, 'tableRow1', '*,*,*,*,75:00,1', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7219法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7219001, 7219, '001', 'P', 'Definition of Working Hour', 'EVA', 'Roster', 'MultiTable', 'Company', 'Definition of Working Hour', 'S', 4, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002935, 7219001, 1, 'table1Header', 'Segment Assignment Groups,Segment Assignments,Other Segment Assignments in Duty,Number Range of Segment in Duty,Any One of Segment in Duty Cross Months,Segment Cross Months,Training Roles,Working Hour,Percent,Max Working Hour,Split Method', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002936, 7219001, 1, 'table1Row1', '*,FLY|MVO|MVP|OPR,*,*,*,*,*,BT,*,*,SPAN', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002937, 7219001, 1, 'table1Row2', '*,DHD|PNC,*,1-2,N,N,*,BT,0.5,04:00,AVG', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002938, 7219001, 1, 'table1Row3', '*,DHD|PNC,*,2-99,Y,Y,*,ACC,0.5,04:00,AVG', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002939, 7219001, 1, 'table1Row4', '*,DHD|PNC,*,2-99,Y,N,*,0,*,*,AVG', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002940, 7219001, 1, 'table1Row5', '*,DHD|PNC,*,2-99,N,N,*,AVG,0.5,04:00,AVG', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002941, 7219001, 1, 'table1Row6', '*,SIM,*,1-2,*,*,*,D-B,*,*,SPAN', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002942, 7219001, 1, 'table1Row7', '*,SIM,FLY|MVO|MVP|OPR,2-99,*,*,*,BT,*,*,SPAN', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002943, 7219001, 1, 'table1Row8', '*,OBS,*,*,*,*,TR,BT,*,*,SPAN', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002944, 7219001, 1, 'table1Row9', '*,OBS,*,*,*,*,TE,00:00,*,*,SPAN', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002945, 7219001, 1, 'table1Row10', '*,GND|ADW,*,*,*,*,*,04:00,*,*,SPAN', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002946, 7219001, 1, 'table1Row11', '*,OW,*,*,*,*,*,06:00,*,*,SPAN', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002947, 7219001, 1, 'table1Row12', '*,OWA|OWB,*,*,*,*,*,03:00,*,*,SPAN', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002948, 7219001, 1, 'table1Row13', '*,MC|ORT|NYR|MON,*,*,*,*,*,02:00,*,*,SPAN', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002949, 7219001, 1, 'table1Row14', '*,ORT|NYR|MON,!(FLY|MVO|MVP|OPR),*,*,*,*,02:00,*,*,SPAN', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002950, 7219001, 1, 'table1Row15', '*,ORT|NYR|MON,FLY|MVO|MVP|OPR,*,*,*,*,00:00,*,*,SPAN', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002951, 7219001, 1, 'table1Row16', '*,HR|BUS|TAXI,*,*,*,*,*,BT,0.5,*,AVG', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002952, 7219001, 1, 'table1Row17', '*,SBY,*,*,*,*,*,03:00,*,*,SPAN', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002953, 7219001, 1, 'table2Header', 'Roster Assignment Groups,Roster Assignments,Working Hour', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002954, 7219001, 1, 'table2Row1', 'GND|ADW,*,04:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002955, 7219001, 1, 'table2Row2', 'RD,Reserve,02:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002956, 7219001, 1, 'table2Row3', '*,OW,06:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002957, 7219001, 1, 'table2Row4', '*,OWA|OWB,03:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002958, 7219001, 1, 'table2Row5', '*,MC,02:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002959, 7219001, 1, 'table2Row6', '*,ORT|NYR|MON,02:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002960, 7219001, 1, 'table2Row7', '*,SBY,03:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200002961, 7219001, 1, 'table2Row8', '*,OL,06:00', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 7200法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7200001, 7200, '001', 'B', 'Check Min Rest Post Duty', 'EVA', 'Rest', 'Table', 'Company', 'Check Min Rest Post Duty', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002962, 7200001, 1, 'tableHeader', 'Compositions,Duty Assignment Groups,Duty Fleet,Duty Type,BLH Range,FDP Range,Based Min Rest,Increment of FDP', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002963, 7200001, 1, 'tableRow1', '*,FLY,*,*,00:00-08:00,*,11:00,02:30', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002964, 7200001, 1, 'tableRow2', '2P,FLY,*,I,08:01-99:00,*,18:00,02:30', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002965, 7200001, 1, 'tableRow3', '3P,FLY,*　,*,08:01-12:00,*,18:00,02:30', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002966, 7200001, 1, 'tableRow4', '3P,FLY,*,*,12:01-99:00,*,24:00,02:30', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002967, 7200001, 1, 'tableRow5', '4P,FLY,*,*,08:01-16:00,*,18:00,02:30', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002968, 7200001, 1, 'tableRow6', '4P,FLY,*　,*,12:01-99:00,*,22:00,02:30', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002969, 7200001, 1, 'tableRow7', '*,PNC,*,*,00:00-99:00,*,11:00,02:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002970, 7200001, 1, 'tableRow8', '*,SNY,*,*,00:00-99:00,*,10:00,02:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7225法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7225001, 7225, '001', 'B', 'Check Training Roster', 'EVA', 'Training', 'Table', 'Company', 'Check Training Roster', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002971, 7225001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002972, 7225001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7226法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7226001, 7226, '001', 'B', 'Check Training Program End', 'EVA', 'Training', 'Table', 'Company', 'Check Training Program End', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002973, 7226001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002974, 7226001, 1, 'tableRow1', 'TRAINING_END', 'ROIS', CURRENT_TIMESTAMP);

-- 7228法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7228001, 7228, '001', 'B', 'Training Brief & Debrief', 'EVA', 'Training', 'Table', 'Company', 'Training Brief & Debrief', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002975, 7228001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002976, 7228001, 1, 'tableRow1', 'BRIEF_DEBRIEF', 'ROIS', CURRENT_TIMESTAMP);

-- ROSCRW-9426 【EVAFD】【7230】training rule:EM/TM的PNR限制
-- 7230法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7230001, 7230, '001', 'B', 'Limits Program Course Role', 'EVA', 'Training', 'Table', 'Company', 'Limits Program Course Role', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002977, 7230001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Course Codes,Program Statuses,Footprint Types,Roles', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002978, 7230001, 1, 'tableRow1', '*,*,*,*,EM1|EM2|TM1|TM2,!(Completed|Manual End),Transition|Transition upgrade|New hire,!(PNR)', 'ROIS', CURRENT_TIMESTAMP);

-- 2025/01/13 ROSCRW-8845 【EVAFD】【RULE】11.10 Layover restriction
-- 7227法规
INSERT INTO "rule"("id", "function", "instance", "class", "description", "reference", "category", "store_structure", "source", "detail", "overridability", "severity", "filiale", "division", "owner", "locked", "modified_by", "last_modified") VALUES ('7227001', '7227', '001', 'R', '11.10 （UE）Layover restriction', 'EVAFD', 'Pairing', 'Table', 'Company', 'Layover restriction', 'H', '2', 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO "rule_parameter"("id", "rule_id", "phase_id", "param_names", "param_values", "modified_by", "last_modified", "param_extra") VALUES ('200002979', '7227001', '1', 'tableHeader', 'Pairing Base,Assignments,Airline Code,Flight Fleets,Flight Numbers,Deps,Arvs,Start Date,End Date,Force Layover,Force Not Layover', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO "rule_parameter"("id", "rule_id", "phase_id", "param_names", "param_values", "modified_by", "last_modified", "param_extra") VALUES ('200002980', '7227001', '1', 'tableRow2', '*,*,BR,B77X,*,*,PVG,01-01,12-31,Y,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO "rule_parameter"("id", "rule_id", "phase_id", "param_names", "param_values", "modified_by", "last_modified", "param_extra") VALUES ('200002981', '7227001', '1', 'tableRow3', '*,*,*,*,*,TPE,NRT,10-01,03-30,Y,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO "rule_parameter"("id", "rule_id", "phase_id", "param_names", "param_values", "modified_by", "last_modified", "param_extra") VALUES ('200002982', '7227001', '1', 'tableRow1', '*,*,BR,*,*,*,PEK,06-01,08-31,Y,*', 'ROIS', CURRENT_TIMESTAMP, NULL);

-- 2025/01/13 ROSCRW-8712 【EVAFD】【RULE】8.10/8.11/8.12/8.13/8.14 证照更新期间任务限制
-- 7229法规
INSERT INTO "rule"("ID", "FUNCTION", "INSTANCE", "CLASS", "DESCRIPTION", "REFERENCE", "CATEGORY", "STORE_STRUCTURE", "SOURCE", "DETAIL", "OVERRIDABILITY", "SEVERITY", "FILIALE", "DIVISION", "OWNER", "LOCKED", "MODIFIED_BY", "LAST_MODIFIED") VALUES ('7229001', '7229', '001', 'R', 'check passport and visa for EVAFD', 'EVAFD', 'ROSTER', 'Table', 'Company', 'Check passport and visa for EVAFD', 'H', '2', 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO "rule_parameter"("id", "rule_id", "phase_id", "param_names", "param_values", "modified_by", "last_modified", "param_extra") VALUES ('200002983', '7229001', '1', 'tableRow1', '*,*,*,*,TWN,PPS,10,*,PEK,*,*,Y,*,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO "rule_parameter"("id", "rule_id", "phase_id", "param_names", "param_values", "modified_by", "last_modified", "param_extra") VALUES ('200002984', '7229001', '1', 'tableRow2', '*,*,*,*,!(TWN),VIS,10,*,*,FLY,*,N,*,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO "rule_parameter"("id", "rule_id", "phase_id", "param_names", "param_values", "modified_by", "last_modified", "param_extra") VALUES ('200002985', '7229001', '1', 'tableHeader', 'Bases,Ranks,Fleets,Teams,Nationalities,Day Assignment Code,Gap Days,Prohibited Countries,Prohibited Airports,Prohibited Assignment Groups,Prohibited Assignments,Only Check Layover,Prohibited Layover Countries,Prohibited Layover Airports', 'ROIS', CURRENT_TIMESTAMP, NULL);


-- 6026法规
-- 6026 飞行FD
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(6026001, 6026, '001', 'R', 'Limit Fleet Multi for Standby', 'QQ', 'Roster', 'Table', 'FRMS', 'Limit Fleet Multi for Standby', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002987, 6026001, 1, 'tableHeader', 'Segment Assignment Groups,Segment Assignments,Fleet,Required Fleets', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002988, 6026001, 1, 'tableRow1', 'SBY,*,Multi,100+F70+E90', null, 'ROIS', CURRENT_TIMESTAMP);

-- 6026 客舱CC
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(6026002, 6026, '002', 'R', 'Limit Fleet Multi for Standby', 'QQ', 'Roster', 'Table', 'FRMS', 'Limit Fleet Multi for Standby', 'H', 2, 'QQ', 'C', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002989, 6026002, 1, 'tableHeader', 'Segment Assignment Groups,Segment Assignments,Fleet,Required Fleets', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200002990, 6026002, 1, 'tableRow1', 'SBY,*,Multi,100+F70+E90', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7233法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7233001, 7233, '001', 'B', 'Limit Training Course Time Period', 'EVA', 'Training', 'Table', 'Company', 'Limit Training Course Time Period', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002991, 7233001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002992, 7233001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7234法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7234001, 7234, '001', 'B', 'Limit Training Course Role Qualification', 'EVA', 'Training', 'Table', 'Company', 'Limit Training Course Role Qualification', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002993, 7234001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002994, 7234001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7235法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7235001, 7235, '001', 'B', 'Limit Training Course Role Numbers', 'EVA', 'Training', 'Table', 'Company', 'Limit Training Course Role Numbers', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002995, 7235001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002996, 7235001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7236法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7236001, 7236, '001', 'B', 'Limit Days between Training Courses', 'EVA', 'Training', 'Table', 'Company', 'Limit Days between Training Courses', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002997, 7236001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002998, 7236001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7237法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7237001, 7237, '001', 'B', 'Limit Dependency between Training Courses', 'EVA', 'Training', 'Table', 'Company', 'Limit Dependency between Training Courses', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200002999, 7237001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003000, 7237001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7238法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7238001, 7238, '001', 'B', 'Limit Training Course Start Time', 'EVA', 'Training', 'Table', 'Company', 'Limit Training Course Start Time', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003001, 7238001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003002, 7238001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7239法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7239001, 7239, '001', 'B', 'Limit Training Course Device Type', 'EVA', 'Training', 'Table', 'Company', 'Limit Training Course Device Type', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003003, 7239001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003004, 7239001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7240法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7240001, 7240, '001', 'B', 'Check Training Course Device Availability', 'EVA', 'Training', 'Table', 'Company', 'Check Training Course Device Availability', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003005, 7240001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003006, 7240001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 8028法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(8028001, 8028, '001', 'R', 'Restrict Duty by the Crew Nationality', 'QQ', 'Roster', 'Table', 'FRMS', 'Restrict Duty by the Crew Nationality', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003007, 8028001, 1, 'tableHeader', 'Crew Nationalities,Flight Numbers,Flight Countries,Flight Types', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003008, 8028001, 1, 'tableRow1', 'AU|NZ,*,*,I', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7231法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7231001, 7231, '001', 'B', 'Renew Certificate in Advance', 'EVA', 'Training', 'Table', 'Company', 'Renew Certificate in Advance', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003009, 7231001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Certificate Types,Assignment,Course Codes,Skip Holiday(Y/N),Holiday Countries,Renewal Window,Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003010, 7231001, 1, 'tableRow1', '*,*,*,*,MCC,MC,*,Y,TW,5-30,WD', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003011, 7231001, 1, 'tableRow2', '*,*,*,*,VIS,VIS,*,Y,US|TW,5-30,WD', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003012, 7231001, 1, 'tableRow3', '*,*,*,*,IL4|IL5|IL6,ILC,*,Y,TW,5-30,WD', 'ROIS', CURRENT_TIMESTAMP);

-- 7261法规
INSERT INTO RULE
(ID, "FUNCTION", "INSTANCE", CLASS, DESCRIPTION, REFERENCE, CATEGORY, STORE_STRUCTURE, "SOURCE", DETAIL, OVERRIDABILITY, SEVERITY, FILIALE, DIVISION, OWNER, LOCKED, MODIFIED_BY, LAST_MODIFIED)
VALUES(7261001, 7261, '001', 'R', '7.2-Acclimatized Time Zone Rest', 'FOM', 'Min Rest Time', 'Table', 'EVA', 'Acclimatized Time Zone Rest', 'S', 4, 'BR', 'P', 'U', NULL, 'ROIS', TIMESTAMP '2024-07-30 10:42:58.000000');
INSERT INTO RULE_PARAMETER
(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA)
VALUES(200003013, 7261001, 1, 'tableRow1', '*,*,*,*,48:00,06:00,48:00,GND|LEA|MVP|OFF,03:01', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO RULE_PARAMETER
(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA)
VALUES(200003014, 7261001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Outstation Acclimatized Condition,Min Time Zone Gap,Min Rest At Home Base,Override Exception Assignment Groups,Override Exception Time Zone Gap', 'ROIS', CURRENT_TIMESTAMP, NULL);

-- 7241法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7241001, 7241, '001', 'B', 'Limit Training Course PIP Numbers', 'EVA', 'Training', 'Table', 'Company', 'Limit Training Course PIP Numbers', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003015, 7241001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003016, 7241001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7017法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7017001, 7017, '001', 'P', 'FDP Extension for Cabin Crew', 'TG', 'FDP', 'Table', 'Company', 'FDP Extension for Cabin Crew', 'H', 2, 'TG', 'C', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003017, 7017001, 1, 'tableHeader', 'Segment Assignments,Duty Rest Range in Flight,Rest Facilty,FT Offset per Segment,FT Discount Divisor,Max FDP', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003018, 7017001, 1, 'tableRow1', '*,02:00-03:00,R,05:00,2,14:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003019, 7017001, 1, 'tableRow2', '*,03:00-04:00,R,05:00,2,16:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003020, 7017001, 1, 'tableRow3', '*,04:00-99:00,R,05:00,2,18:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003021, 7017001, 1, 'tableRow4', '*,02:00-03:00,S,05:00,2,16:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003022, 7017001, 1, 'tableRow5', '*,03:00-04:00,S,05:00,2,18:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003023, 7017001, 1, 'tableRow6', '*,04:00-99:00,S,05:00,2,20:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7242法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7242001, 7242, '001', 'B', 'Limit Training Course Duration', 'EVA', 'Training', 'Table', 'Company', 'Limit Training Course Duration', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003024, 7242001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003025, 7242001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7264法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7264001, 7264, '001', 'B', 'Schedule Time Abnormality', 'EVA', 'Pairing', 'Table', 'Company', 'Schedule Time Abnormality', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003026, 7264001, 1, 'tableHeader', 'Duty Assignments,Flight Fleet in Duty,Time Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003027, 7264001, 1, 'tableRow1', '*,B77X,SCH', 'ROIS', CURRENT_TIMESTAMP);

-- 7265法规
INSERT INTO rule(ID, FUNCTION, INSTANCE, CLASS, DESCRIPTION, REFERENCE, CATEGORY, STORE_STRUCTURE, SOURCE, DETAIL, OVERRIDABILITY, SEVERITY, FILIALE, DIVISION, OWNER, LOCKED, MODIFIED_BY, LAST_MODIFIED) VALUES ('7265001', '7265', '001', 'B', 'Check Min Rest Post Duty by Schedule Time (Schedule Time)', 'FOM', 'Min Rest Time', 'Table', 'Company', 'Check Min Rest Post Duty (Schedule Time)', 'S', '5', 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003028', '7265001', '1', 'tableHeader', 'Compositions,Duty Assignment Groups,Duty Fleet,Duty Type,BLH Range,FDP Range,Based Min Rest,Increment of FDP', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003029', '7265001', '1', 'tableRow1', '*,SIM,*,*,00:00-99:00,*,11:00,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003030', '7265001', '1', 'tableRow2', '*,SBY|HSB,*,*,00:00-99:00,*,11:00,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003031', '7265001', '1', 'tableRow3', '*,GND|ADM|TRG|MTG,*,*,00:00-99:00,*,11:00,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003032', '7265001', '1', 'tableRow4', '*,PNC|DHD|MVP,*,*,00:00-99:00,*,11:00,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003033', '7265001', '1', 'tableRow5', '*,SNY|PSG,*,*,00:00-99:00,*,10:00,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003034', '7265001', '1', 'tableRow6', '*,FLY|OPR|MVO,*,*,00:00-08:00,*,11:00,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003035', '7265001', '1', 'tableRow7', 'Single,FLY|OPR|MVO,*,*,08:01-99:00,*,18:00,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003036', '7265001', '1', 'tableRow8', 'Multiple,FLY|OPR|MVO,*,*,08:01-12:00,*,18:00,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003037', '7265001', '1', 'tableRow9', 'Multiple,FLY|OPR|MVO,*,*,12:01-99:00,*,24:00,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003038', '7265001', '1', 'tableRow10', 'Double,FLY|OPR|MVO,*,*,08:01-16:00,*,18:00,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003039', '7265001', '1', 'tableRow11', 'Double,FLY|OPR|MVO,*,*,16:01-99:00,*,22:00,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003040', '7265001', '1', 'tableRow12', '*,FLY|OPR|MVO,*,*,00:00-99:00,*,11:00,*', 'ROIS', CURRENT_TIMESTAMP, NULL);

-- 7266法规
INSERT INTO rule(ID, FUNCTION, INSTANCE, CLASS, DESCRIPTION, REFERENCE, CATEGORY, STORE_STRUCTURE, SOURCE, DETAIL, OVERRIDABILITY, SEVERITY, FILIALE, DIVISION, OWNER, LOCKED, MODIFIED_BY, LAST_MODIFIED) VALUES ('7266001', '7266', '001', 'S', '7.9 國際Single連續24小時BLH超8小時，應給予18小時休息(计划时间)', 'EVAFD', 'Rest', 'Table', 'Company', 'Min Rest after Cumulative FT in Consecutive Hours (Schedule Time)', 'S', '5', 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003041', '7266001', '1', 'tableHeader', 'Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Consecutive Hours,Cumulative Max BLH,Min Rest', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003042', '7266001', '1', 'tableRow1', '*,*,*,*,Single,*,I,24:00,08:00,18:00', 'ROIS', CURRENT_TIMESTAMP, NULL);

-- 7267法规
INSERT INTO rule(ID, FUNCTION, INSTANCE, CLASS, DESCRIPTION, REFERENCE, CATEGORY, STORE_STRUCTURE, SOURCE, DETAIL, OVERRIDABILITY, SEVERITY, FILIALE, DIVISION, OWNER, LOCKED, MODIFIED_BY, LAST_MODIFIED) VALUES ('7267001', '7267', '001', 'B', '7.6 Minimum Sleep Cycle at Layover Station (Schedule Time)', 'EVAFD', 'Rest', 'Table', 'Company', 'Minimum Sleep Cycle at Layover Station (Schedule Time)', 'S', '3', 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003043', '7267001', '1', 'tableHeader', 'Bases,Ranks,Fleets,Teams,Last Duty Compositions,Segment Assignments,Sector BLH Ranges,Pairing End Stations,Layover Min Rest,Min WOCL Number', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003044', '7267001', '1', 'tableRow1', '*,*,*,*,Double,*,11:00-999:00,TPE,00:01,1', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003045', '7267001', '1', 'tableRow2', '*,*,*,*,Multiple,*,11:00-999:00,TPE,36:00,2', 'ROIS', CURRENT_TIMESTAMP, NULL);

-- 7268法规
INSERT INTO rule(ID, FUNCTION, INSTANCE, CLASS, DESCRIPTION, REFERENCE, CATEGORY, STORE_STRUCTURE, SOURCE, DETAIL, OVERRIDABILITY, SEVERITY, FILIALE, DIVISION, OWNER, LOCKED, MODIFIED_BY, LAST_MODIFIED) VALUES ('7268001', '7268', '001', 'S', '7.2 連續紅眼（WOCL）航班休息期(计划时间)', 'FOM', 'Red-eye duties ', 'Table', 'Company', 'Check Consecutive WOCL Rest (Schedule Time)', 'S', '5', 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003046', '7268001', '1', 'tableHeader', 'Bases,Ranks,Fleets,Teams,WOCL Start,WOCL End,Max Consecutive WOCL Number,Min Rest', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003047', '7268001', '1', 'tableRow1', '*,*,*,*,02:00,05:00,3,14|34|54', 'ROIS', CURRENT_TIMESTAMP, NULL);

-- 7269法规
INSERT INTO rule(ID, FUNCTION, INSTANCE, CLASS, DESCRIPTION, REFERENCE, CATEGORY, STORE_STRUCTURE, SOURCE, DETAIL, OVERRIDABILITY, SEVERITY, FILIALE, DIVISION, OWNER, LOCKED, MODIFIED_BY, LAST_MODIFIED) VALUES ('7269001', '7269', '001', 'R', '[ULR_Rest]-ULR Operation Limiation (Schedule Time)', 'EVAFD', 'Rest', 'MultiTable', 'Company', 'Pre and post ULR operation rest requirement (Schedule Time)', 'S', '5', 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003048', '7269001', '1', 'table1Header', 'Max Sector,Min Flight Time,Min FDP,(OR)SBY Qualifiers,(OR)Labels,Exception Code', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003049', '7269001', '1', 'table1Row1', '1,16:00,30:00,*,*,TEST-EXCEPTION', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003050', '7269001', '1', 'table2Header', 'Rest Type,Min Rest Length,Min Calendar Days,Min Local Nights,Location,Exception Assignment Groups', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003051', '7269001', '1', 'table2Row1', 'PRE-ULR,11:00,0,2,PTN BASE,GND|ADM|MEG|SIM|TRG|MTG|SIM', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003052', '7269001', '1', 'table2Row2', 'POST-ULR,72:00,0,4,CREW BASE,*', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003053', '7269001', '1', 'table2Row3', 'POST-ULR,48:00,0,2,REST LOCATION,GND|ADM|MEG|SIM', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003054', '7269001', '1', 'table2Row4', 'LAYOVER,48:00,0,2,REST LOCATION,GND|ADM|MEG|SIM', 'ROIS', CURRENT_TIMESTAMP, NULL);

-- 7270法规
INSERT INTO rule(ID, FUNCTION, INSTANCE, CLASS, DESCRIPTION, REFERENCE, CATEGORY, STORE_STRUCTURE, SOURCE, DETAIL, OVERRIDABILITY, SEVERITY, FILIALE, DIVISION, OWNER, LOCKED, MODIFIED_BY, LAST_MODIFIED) VALUES ('7270001', '7270', '001', 'R', '12.2  UE前後需滿足指定休息時間（计划时间）', 'EVAFD', 'Rest', 'Table', 'General', '12.2  UE前後需滿足指定休息時間（计划时间）', 'S', '1', 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003055', '7270001', '1', 'tableHeader', 'Bases,Ranks,Fleets,Crew Teams,Attribute A,Label A,Airport A,Assignment Group A,Qualifier A,Roles A,Is Line Training A,Is Requested A,Attribute B,Label B,Airport B,Assignment Group B,Qualifier B,Roles B,Is Line Training B,Is Requested B,Space,Unit,Directional,Is Location Equal Base A,Is Location Equal Base B,Utilize Post Duty Rest', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003056', '7270001', '1', 'tableRow1', '*,*,*,*,*,*,*,FLY|MVO|PNC|GND,*,*,*,*,*,*,*,*,UE,*,*,*,11,RH,N,*,*,Y', 'ROIS', CURRENT_TIMESTAMP, NULL);

-- 7271法规
INSERT INTO rule(ID, FUNCTION, INSTANCE, CLASS, DESCRIPTION, REFERENCE, CATEGORY, STORE_STRUCTURE, SOURCE, DETAIL, OVERRIDABILITY, SEVERITY, FILIALE, DIVISION, OWNER, LOCKED, MODIFIED_BY, LAST_MODIFIED) VALUES ('7271001', '7271', '001', 'R', '7.2-Acclimatized Time Zone Rest-EVA (Schedule Time)', 'FOM', 'Min Rest Time', 'Table', 'EVA', 'Acclimatized Time Zone Rest (Schedule Time)', 'S', '5', 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003057', '7271001', '1', 'tableHeader', 'Bases,Ranks,Fleets,Teams,Outstation Acclimatized Condition,Min Time Zone Gap,Min Rest At Home Base,Override Exception Assignment Groups,Override Exception Time Zone Gap', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO rule_parameter(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA) VALUES ('200003058', '7271001', '1', 'tableRow1', '*,*,*,*,48:00,06:00,48:00,GND|LEA|MVP|OFF|DHD|PNC|SNY,03:01', 'ROIS', CURRENT_TIMESTAMP, NULL);

-- 6039法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(6039001, 6039, '001', 'P', 'Check Min Number of Crew Rank', 'QQ', 'Duty', 'Table', 'FRMS', 'Check Min Number of Crew Rank', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003059, 6039001, 1, 'tableHeader', 'Segment Assignments,Crew Ranks,Min Num', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003060, 6039001, 1, 'tableRow1', 'FLY,CM,1', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7224法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES(7224001, 7224, '001', 'B', 'Definition of Freighter Credit Hours', 'EVA', 'Duty', 'Table', 'Company', 'Definition of Freighter Credit Hours', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003061, 7224001, 1, 'tableHeader', 'Teams,Assignment Groups,Assignments,Segment Fleets,Segment from Departure to Arrival,Number Range of Segment in Duty,IP/CK&Chief Pilot Credit,Footprint Types,Course Code,Extra Course(Y/N),Role(Trainer/Trainee),IP/CK QUAL,Chief Pilot Rank,Credit,Credit BT Gap,Percent,Delay Buffer,Multiple,Split Method(SPAN/START)', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003062, 7224001, 1, 'tableRow1', '*,*,*,B77X,*,*,*,New hire,*,*,TE,*,*,00:00,00:00,1,00:00,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003063, 7224001, 1, 'tableRow2', '*,*,*,B77X,*,*,*,*,*,Y,TE,*,*,00:00,00:00,1,00:00,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003064, 7224001, 1, 'tableRow3', '*,*,*,B77X,*,*,*,*,LOC|LOT|QLC|RLC|XLC|LTR|LTK|XLA,*,TE,*,*,00:00,00:00,1,00:00,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003065, 7224001, 1, 'tableRow4', '*,*,*,B77X,*,*,*,*,CFI|SPP|OBS,*,*,*,*,00:00,00:00,1,00:00,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003066, 7224001, 1, 'tableRow5', '*,FLY|MVO|MVP,DHD|PNC|SNY|PSG,B77X,*,*,*,*,*,*,*,*,*,00:00,00:00,1,00:00,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003067, 7224001, 1, 'tableRow6', '*,FLY|MVO,FLY|OPR,B77X,*,*,*,*,!(OBS|SPP|LOT|LOC),N,IP|OIP|STD|XIP,LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM,!(AW|AU|AX),BT,00:00,1,00:30,1.2,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003068, 7224001, 1, 'tableRow7', '*,FLY|MVO,FLY|OPR,B77X,*,*,*,*,!(OBS|SPP|LOT|LOC),N,IP|OIP|STD|XIP,!(LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM),!(AW|AU|AX),BT,00:00,1,00:30,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003069, 7224001, 1, 'tableRow8', '*,FLY|MVO,FLY|OPR,B77X,*,*,*,*,!(OBS|SPP|LOT|LOC),N,TE,*,*,BT,00:00,1,00:30,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003070, 7224001, 1, 'tableRow9', '*,FLY|MVO,FLY|OPR,B77X,*,*,*,*,!(OBS|SPP|LOT|LOC),N,PBN,*,*,BT,00:00,1,00:30,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003071, 7224001, 1, 'tableRow10', '*,FLY|MVO,FLY|OPR,B77X,*,*,*,*,*,N,*,*,AW|AU|AX,BT,00:00,1,00:30,1.35,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003072, 7224001, 1, 'tableRow11', '*,FLY|MVO,FLY|OPR,B77X,*,*,*,*,*,N,*,*,!(AW|AU|AX),BT,00:00,1,00:30,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003073, 7224001, 1, 'tableRow12', '*,SIM,*,B77X,*,*,*,*,TST,N,*,*,*,BT,00:00,1,*,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003074, 7224001, 1, 'tableRow13', '*,SIM,SIM,B77X,*,*,*,*,EM1|EM2|TM1|TM2|EX1|EX2,N,IP|OIP|STD|XIP,*,AW|AU|AX,BT,01:00,1,*,1.35,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003075, 7224001, 1, 'tableRow14', '*,SIM,SIM,B77X,*,*,*,*,EM1|EM2|TM1|TM2|EX1|EX2,N,IP|OIP|STD|XIP,LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM,!(AW|AU|AX),BT,01:00,1,*,1.3,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003076, 7224001, 1, 'tableRow15', '*,SIM,SIM,B77X,*,*,*,*,EM1|EM2|TM1|TM2|EX1|EX2,N,IP|OIP|STD|XIP,!(LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM),!(AW|AU|AX),BT,01:00,1,*,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003077, 7224001, 1, 'tableRow16', '*,SIM,SIM,B77X,*,*,*,*,EM1|EM2|TM1|TM2|EX1|EX2,N,PNR,*,AW|AU|AX,BT,01:00,1,*,1.35,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003078, 7224001, 1, 'tableRow17', '*,SIM,SIM,B77X,*,*,*,*,EM1|EM2|TM1|TM2|EX1|EX2,N,PNR,*,!(AW|AU|AX),BT,01:00,1,*,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003079, 7224001, 1, 'tableRow18', '*,SIM,SIM|FTD,B77X,*,*,*,*,!(EM1|EM2|TM1|TM2|EX1|EX2),N,IP|OIP|STD|XIP,*,AW|AU|AX,BT,00:00,1,*,1.35,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003080, 7224001, 1, 'tableRow19', '*,SIM,SIM|FTD,B77X,*,*,*,*,!(EM1|EM2|TM1|TM2|EX1|EX2),N,IP|OIP|STD|XIP,LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM,!(AW|AU|AX),BT,00:00,1,*,1.3,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003081, 7224001, 1, 'tableRow20', '*,SIM,SIM|FTD,B77X,*,*,*,*,!(EM1|EM2|TM1|TM2|EX1|EX2),N,IP|OIP|STD|XIP,!(LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM),!(AW|AU|AX),BT,00:00,1,*,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003082, 7224001, 1, 'tableRow21', '*,SIM,SIM|FTD,B77X,*,*,*,*,!(EM1|EM2|TM1|TM2|EX1|EX2),N,PNR,*,AW|AU|AX,BT,00:00,1,*,1.35,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003083, 7224001, 1, 'tableRow22', '*,SIM,SIM|FTD,B77X,*,*,*,*,!(EM1|EM2|TM1|TM2|EX1|EX2),N,PNR,*,!(AW|AU|AX),BT,00:00,1,*,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003084, 7224001, 1, 'tableRow23', '*,SIM,*,B77X,*,*,*,*,*,N,TE|PBN,*,*,BT,00:00,0,*,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003085, 7224001, 1, 'tableRow24', '*,SIM,SIM|FTD,B77X,*,*,*,*,*,N,*,*,*,BT,00:00,1,*,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003086, 7224001, 1, 'tableRow25', '*,FLY|MVO,FLY|OPR,B77X,*,*,*,*,SPP|CFI,N,IP|OIP|STD|XIP,*,AW|AU|AX,BT,00:00,1,00:30,1.2,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003087, 7224001, 1, 'tableRow26', '*,FLY|MVO,FLY|OPR,B77X,*,*,*,*,SPP|CFI,N,IP|OIP|STD|XIP,LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM,!(AW|AU|AX),BT,00:00,1,00:30,1.2,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003088, 7224001, 1, 'tableRow27', '*,FLY|MVO,FLY|OPR,B77X,*,*,*,*,SPP|CFI,N,TE|PBN,*,*,BT,00:00,1,00:30,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003089, 7224001, 1, 'tableRow28', '*,FLY|MVO,FLY|OPR,B77X,*,*,*,*,SPP|CFI,N,IP|OIP|STD|XIP,!(LIP|SIP|AIP|LCK|SCK|ACK|FIP|RIP|ADK|CRM),!(AW|AU|AX),BT,00:00,1,00:30,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003090, 7224001, 1, 'tableRow29', '*,FLY|MVO,FLY|OPR,B77X,*,*,*,*,!(OBS|SPP|LOT|LOC),N,IP|OIP|STD|XIP,*,AW|AU|AX,BT,00:00,1,00:30,1.35,*', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7243 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7243001, 7243, '001', 'B', 'Limit Same Instructor as X Role in Program Courses', 'EVA', 'Training', 'Table', 'Company', 'Limit Same Instructor as X Role in Program Courses', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003091, 7243001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003092, 7243001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7244 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES (7244001, 7244, '001', 'B', 'Limit Crew Program Course on Flight', 'EVA', 'Training', 'Table', 'Company', 'Limit Crew Program Course on Flight', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003112, 7244001, 1, 'tableHeader', 'Course Type,Crew Fleets,Crew A Course Codes,Crew B Prohibited Course Codes,Crew B Prohibited Footprint Types', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003113, 7244001, 1, 'tableRow1', 'LINE,*,OBS,LIC|ALC|CFI|LOC|LOT|LT2|QLC|RLC|UTG|SPP|STD|XLC|XLA,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003114, 7244001, 1, 'tableRow2', 'LINE,B77A|B77M|B77B|B77X,OBS,*,New Hire', 'ROIS', CURRENT_TIMESTAMP);

-- 7245 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES (7245001, 7245, '001', 'B', 'Limit Training Role in Team', 'EVA', 'Training', 'Table', 'Company', 'Limit Training Role in Team', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003115, 7245001, 1, 'tableHeader', 'Crew Teams,Crew Roles', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003116, 7245001, 1, 'tableRow1', 'Inexperience,SP', 'ROIS', CURRENT_TIMESTAMP);

-- 7246 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES (7246001, 7246, '001', 'B', 'Limit the Same Device in Program', 'EVA', 'Training', 'Table', 'Company', 'Limit the Same Device in Program', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003117, 7246001, 1, 'tableHeader', 'Crew Fleets,Footprint Types,Course Codes,Device Types', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003118, 7246001, 1, 'tableRow1', 'B77A|B77M|B77B|B77X,*,M23|M24|M25,787 FFS|777 FFS', 'ROIS', CURRENT_TIMESTAMP);

-- 7247 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES (7247001, 7247, '001', 'B', 'Restrict Instructors to Hold X Role', 'EVA', 'Training', 'Table', 'Company', 'Restrict Instructors to Hold X Role', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003119, 7247001, 1, 'tableHeader', 'Crew Qualifications,Recurrent Training Course Codes,Prohibited Roles', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003120, 7247001, 1, 'tableRow1', 'EM1|EM2|TM1|TM2,EM1|EM2|TM1|TM2,IP', 'ROIS', CURRENT_TIMESTAMP);

-- 7248 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES (7248001, 7248, '001', 'B', 'Restrict Trainee to Hold Assignment', 'EVA', 'Training', 'Table', 'Company', 'Restrict Trainee to Hold Assignment', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003121, 7248001, 1, 'tableHeader', 'Footprint Types,Program Status,Prohibited Course Codes,Prohibited Roles,Prohibited Assignment Groups,Prohibited Assignments,to First Duty Date(Y/N)', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003122, 7248001, 1, 'tableRow1', 'New Hire,*,*,IP|PNR,*,*,Y', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003123, 7248001, 1, 'tableRow2', 'New Hire,*,*,*,*,FLY|DHD,Y', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003124, 7248001, 1, 'tableRow3', 'New Hire,*,*,*,SBY,*,Y', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003132, 7248001, 1, 'tableRow4', 'New Hire,Not Scheduled|Partially Scheduled|Scheduled,EM1|EM2|TM1|TM2,PNR,*,*,Y', 'ROIS', CURRENT_TIMESTAMP);

-- 7249 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES (7249001, 7249, '001', 'B', 'Required the Minimum Number of Courses', 'EVA', 'Training', 'Table', 'Company', 'Required the Minimum Number of Courses', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003125, 7249001, 1, 'tableHeader', 'Crew Fleets,Footprint Subtypes,Course Codes,Begin Reference Time(IOE/FDD),End Reference Time(IOE/FDD),Begin Day,End Day,Period,Min Number', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003126, 7249001, 1, 'tableRow1', '*,FCN upgrade|MPL new hire,TLP,IOE,FDD,0,90,M,1', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003127, 7249001, 1, 'tableRow2', '*,FCN upgrade|MPL new hire,PET,FDD,FDD,90,120,P,1', 'ROIS', CURRENT_TIMESTAMP);

-- 7250法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7250001, 7250, '001', 'B', 'Check Unassigned Program Courses', 'EVA', 'Training', 'Table', 'Company', 'Check Unassigned Program Courses', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003128, 7250001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003129, 7250001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7251法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7251001, 7251, '001', 'B', 'Limit Training Course Role Qualification and Numbers', 'EVA', 'Training', 'Table', 'Company', 'Limit Training Course Role Qualification and Numbers', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003130, 7251001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003131, 7251001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7252 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7252001, 7252, '001', 'B', 'Check Failed Program Courses', 'EVA', 'Training', 'Table', 'Company', 'Check Failed Program Courses', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003133, 7252001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003134, 7252001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7253 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7253001, 7253, '001', 'B', 'Limit Legs and Stations on Line Course', 'EVA', 'Training', 'Table', 'Company', 'Limit Legs and Stations on Line Course', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003135, 7253001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003136, 7253001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7254 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7254001, 7254, '001', 'B', 'Buddies Must Be in the Same Course', 'EVA', 'Training', 'Table', 'Company', 'Buddies Must Be in the Same Course', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003137, 7254001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003138, 7254001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7000法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7000001, 7000, '001', 'P', 'Acclimatization Definition', 'EASA', 'ORO.FTL', 'Table', 'Company', 'Definitions', 'H', 5, 'TG', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);


INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003139, 7000001, 1, 'tableHeader', 'Ref TZ Start,Ref TZ End,ETRTZ Start,ETRTZ End,ACC State', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003140, 7000001, 1, 'tableRow1', '00:00,04:00,00:00,48:00,B', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003141, 7000001, 1, 'tableRow2', '00:00,04:00,48:00,72:00,D', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003142, 7000001, 1, 'tableRow3', '00:00,04:00,72:00,96:00,D', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003143, 7000001, 1, 'tableRow4', '00:00,04:00,96:00,120:00,D', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003144, 7000001, 1, 'tableRow5', '00:00,04:00,120:00,999:00,D', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003145, 7000001, 1, 'tableRow6', '04:00,06:01,00:00,48:00,B', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003146, 7000001, 1, 'tableRow7', '04:00,06:01,48:00,72:00,X', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003147, 7000001, 1, 'tableRow8', '04:00,06:01,72:00,96:00,D', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003148, 7000001, 1, 'tableRow9', '04:00,06:01,96:00,120:00,D', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003149, 7000001, 1, 'tableRow10', '04:00,06:01,120:00,999:00,D', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003150, 7000001, 1, 'tableRow11', '06:01,09:01,00:00,48:00,B', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003151, 7000001, 1, 'tableRow12', '06:01,09:01,48:00,72:00,X', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003152, 7000001, 1, 'tableRow13', '06:01,09:01,72:00,96:00,X', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003153, 7000001, 1, 'tableRow14', '06:01,09:01,96:00,120:00,D', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003154, 7000001, 1, 'tableRow15', '06:01,09:01,120:00,999:00,D', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003155, 7000001, 1, 'tableRow16', '09:01,12:01,00:00,48:00,B', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003156, 7000001, 1, 'tableRow17', '09:01,12:01,48:00,72:00,X', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003157, 7000001, 1, 'tableRow18', '09:01,12:01,72:00,96:00,X', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003158, 7000001, 1, 'tableRow19', '09:01,12:01,96:00,120:00,X', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003159, 7000001, 1, 'tableRow20', '09:01,12:01,120:00,999:00,D', NULL, 'ROIS', CURRENT_TIMESTAMP);


-- 7255 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7255001, 7255, '001', 'B', 'Course codes must be the same in duty', 'EVA', 'Training', 'Table', 'Company', 'Course codes must be the same in duty', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003160, 7255001, 1, 'tableHeader', 'Footprint Types,Footprint Subtypes,Course Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003161, 7255001, 1, 'tableRow1', 'New hire,*,SIM', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003162, 7255001, 1, 'tableRow2', 'Upgrade,SFO upgrade|FCN upgrade,SIM', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003163, 7255001, 1, 'tableRow3', 'Transition upgrade,*,SIM', 'ROIS', CURRENT_TIMESTAMP);


-- 7260 法规
INSERT INTO RULE
(ID, "FUNCTION", "INSTANCE", CLASS, DESCRIPTION, REFERENCE, CATEGORY, STORE_STRUCTURE, "SOURCE", DETAIL, OVERRIDABILITY, SEVERITY, FILIALE, DIVISION, OWNER, LOCKED, MODIFIED_BY, LAST_MODIFIED)
VALUES(7260001, 7260, '001', 'B', 'Definition of PIC', 'EVA DEFINITION', 'PIC', 'Table', 'Company', 'Definition of Pairing Per Diem Hour', 'S', 1, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO RULE_PARAMETER
(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA)
VALUES(200003164, 7260001, 1, 'tableHeader', 'Definition', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO RULE_PARAMETER
(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA)
VALUES(200003165, 7260001, 1, 'tableRow1', 'PIC', 'ROIS', CURRENT_TIMESTAMP, NULL);

-- 7274 法规
INSERT INTO RULE
(ID, "FUNCTION", "INSTANCE", CLASS, DESCRIPTION, REFERENCE, CATEGORY, STORE_STRUCTURE, "SOURCE", DETAIL, OVERRIDABILITY, SEVERITY, FILIALE, DIVISION, OWNER, LOCKED, MODIFIED_BY, LAST_MODIFIED)
VALUES(7274001, 7274, '001', 'R', 'Check IOE phase flight composition', 'EVAFD', 'Roster', 'Table', 'Company', 'Check IOE phase flight composition', 'S', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO RULE_PARAMETER
(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA)
VALUES(200003166, 7274001, 1, 'tableHeader', 'Routes,Crew Roles,Acting Ranks,Footprint Types, IOE Phase,Course Codes,Min Composition Without TE', 'ROIS', CURRENT_TIMESTAMP, NULL);
INSERT INTO RULE_PARAMETER
(ID, RULE_ID, PHASE_ID, PARAM_NAMES, PARAM_VALUES, MODIFIED_BY, LAST_MODIFIED, PARAM_EXTRA)
VALUES(200003167, 7274001, 1, 'tableRow1', '*,TE,FCN,Upgrade,1,LT3,FCN:1+SFO:1+FFO:1|FCN:1+SFO:1+FFO:2', 'ROIS', CURRENT_TIMESTAMP, NULL);

-- 7256 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7256001, 7256, '001', 'B', 'Limit Max Gap Days between Training Courses', 'EVA', 'Training', 'Table', 'Company', 'Limit Max Gap Days between Training Courses', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003168, 7256001, 1, 'tableHeader', 'Course A Codes,Max Gap Days,Course B Codes', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003169, 7256001, 1, 'tableRow1', 'LOC,21,LT3|LTA|LT2', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003170, 7256001, 1, 'tableRow2', 'PAT,21,LT3|LTA|LT2', 'ROIS', CURRENT_TIMESTAMP);

-- 7018法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7018001, 7018, '001', 'P', 'Calculate MaxFDP on Standby for Cabin Crew', 'TG', 'FDP', 'Table', 'Company', 'Calculate MaxFDP on Standby for Cabin Crew', 'H', 2, 'TG', 'C', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003171, 7018001, 1, 'tableHeader', 'is Home Base(Y/N),Standby Assignment Groups,Standby Assignments,Standby Start Time Ranges,Including Split Duty(Y/N),Segment Assignments,Rest Facilty,Duty Rest Range in Flight,FT Offset per Segment,FT Discount Divisor,Standby Duration after HH:mm,Gap of Standby Duration', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003172, 7018001, 1, 'tableRow1', 'Y,*,CSB,*,*,*,*,*,*,*,*,04:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003173, 7018001, 1, 'tableRow2', 'Y,*,HSB,07:01-23:00,N,*,*,00:00-01:30,05:00,2,*,06:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003174, 7018001, 1, 'tableRow3', 'Y,*,HSB,07:01-23:00,Y,*,*,*,*,*,*,08:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003175, 7018001, 1, 'tableRow4', 'Y,*,HSB,07:01-23:00,*,*,*,01:30-99:00,05:00,2,*,08:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003176, 7018001, 1, 'tableRow5', 'Y,*,HSB,23:00-07:01,N,*,*,00:00-01:30,05:00,2,07:00,06:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003177, 7018001, 1, 'tableRow6', 'Y,*,HSB,23:00-07:01,Y,*,*,*,*,*,07:00,08:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003178, 7018001, 1, 'tableRow7', 'Y,*,HSB,23:00-07:01,*,*,*,01:30-99:00,05:00,2,07:00,08:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7019法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7019001, 7019, '001', 'P', 'Limit Actual FDP on Standby for Cabin Crew', 'TG', 'FDP', 'Table', 'Company', 'Limit Actual FDP on Standby for Cabin Crew', 'H', 2, 'TG', 'C', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003179, 7019001, 1, 'tableHeader', 'is Home Base(Y/N),Standby Assignment Groups,Standby Assignments,Max Combined Duration', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003180, 7019001, 1, 'tableRow1', 'Y,*,CSB|HSB,16:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7021法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7021001, 7021, '001', 'B', 'Calculate Min Rest by Duty Period', 'TG', 'FDP', 'Table', 'Company', 'Calculate Min Rest by Duty Period', 'H', 2, 'TG', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003181, 7021001, 1, 'tableHeader', 'is Home Base(Y/N),Compositions,Duty Assignment Groups,Duty Type,Min Rest', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003182, 7021001, 1, 'tableRow1', 'Y,*,*,*,12:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003183, 7021001, 1, 'tableRow2', 'N,*,*,*,10:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7022法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7022001, 7022, '001', 'B', '8.2 Reduced rest', 'TG', 'Rest', 'Table', 'TCAR', '8.2 Reduced rest', 'H', 2, 'TG', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003184, 7022001, 1, 'tableHeader', 'is Home Base,Rest Min,Max Times Between DO,DO Assignments,DO Assignment Groups,Is Reduce Next Duty Max FDP,Is Add Next Duty Min Rest', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003185, 7022001, 1, 'tableRow1', 'Y,12:00,2,DO,*,Y,Y', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003186, 7022001, 1, 'tableRow2', 'N,10:00,2,DO,*,Y,Y', 'ROIS', CURRENT_TIMESTAMP);

-- 7275法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7275001, 7275, '001', 'B', 'Check Days Off for Trade', 'EVA', 'Rest', 'Table', 'Company', 'Check Days Off for Trade', 'H', 2, 'EVA', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003187, 7275001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,DO Assignment Groups,Min DO,Utilize Post Duty Rest,Count Blank Day,Count Layover,Layover Timemode,Start Month,End Month', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003188, 7275001, 1, 'tableRow1', '*,*,*,*,DO,97,Y,Y,Y,LOCAL TIME,1,10', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003189, 7275001, 1, 'tableRow2', '*,*,*,*,DO,106,Y,Y,Y,LOCAL TIME,1,11', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003190, 7275001, 1, 'tableRow2', '*,*,*,*,DO,116,Y,Y,Y,LOCAL TIME,1,12', 'ROIS', CURRENT_TIMESTAMP);

-- 7257 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7257001, 7257, '001', 'R', 'Limit Number of Trainees for Courses on Same Day', 'EVA', 'Training', 'Table', 'Company', 'Limit Number of Trainees for Courses on Same Day', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003191, 7257001, 1, 'tableHeader', 'Course Codes,Course Local Dates,Number Range', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003192, 7257001, 1, 'tableRow1', 'AGM|CJE,2025-07-01|2025-07-10,4-15', 'ROIS', CURRENT_TIMESTAMP);

-- 7300 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7300001, 7300, '001', 'B', 'Calculate Max Duty Time', 'PR', 'Duty', 'Table', 'Company', 'Calculate Max Duty Time', 'H', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003193, 7300001, 1, 'tableHeader', 'Compositions,Options,Augmented(Y/N),Number of Operating Crew,Operating Airports,Operating Fleets,Sub Operating Fleets,Duty Assignments,Include DHD Flights(Y/N),Max DP', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003194, 7300001, 1, 'tableRow1', '2P,*,*,2,*,*,*,FLY|MVO,*,14:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003195, 7300001, 1, 'tableRow2', '3P-WB,*,*,3,*,*,*,FLY|MVO,*,18:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003196, 7300001, 1, 'tableRow3', '4P-WB,*,*,4,*,*,*,FLY|MVO,*,22:00', 'ROIS', CURRENT_TIMESTAMP);


-- 7115 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7115001, 7115, '001', 'B', 'Check Consecutive Duty Days', 'IT', 'ROSTER', 'Table', 'Company', 'Check Consecutive Duty Days', 'H', 2, 'IT', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003197, 7115001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Duty Assignments,Next Day Extension,Not Allowed Days,Not Allowed Attributes,Not Allowed Assignments', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003198, 7115001, 1, 'tableRow1', '*,*,*,FLY,22:00,3|4,*,SBY', 'ROIS', CURRENT_TIMESTAMP);

-- 7301 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7301001, 7301, '001', 'B', 'Calculate DP For RP', 'PR', 'Duty', 'Table', 'Company', 'Calculate DP For RP', 'H', 2, 'PR', 'P', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003199, 7301001, 1, 'tableHeader', 'Flight Assignments,Flight Hours,DP Adjust Pct', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003200, 7301001, 1, 'tableRow1', 'DHD,04:00,-0.5', 'ROIS', CURRENT_TIMESTAMP);

-- 7310 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7310001, 7310, '001', 'B', 'Calculate Duty Aloft', 'PR', 'Duty', 'Table', 'Company', 'Calculate Duty Aloft', 'H', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003202, 7310001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Duty Compositions,Duty Assignments,Segment Assignments,Segment Fleets,Segment Sub-Fleets,In-Flight Wait Time,Post-Activity Time', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003203, 7310001, 1, 'tableRow1', '*,*,*,*,2P,FLY|MVO,*,*,*,02:00,00:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7023法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7023001, 7023, '001', 'B', 'Calculate Min Rest At Layover', 'TG', 'Rest', 'Table', 'TCAR', 'Calculate Min Rest At Layover', 'H', 2, 'TG', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003204, 7023001, 1, 'tableHeader', 'is Home Base(Y/N),Duty Assignments,TZ Diff,Min Rest', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003205, 7023001, 1, 'tableRow1', 'N,*,04:00-99:00,14:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7024法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7024001, 7024, '001', 'B', 'Check Min Rest at Base', 'TG', 'Rest', 'Table', 'TCAR', 'Check Min Rest at Base', 'H', 2, 'TG', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003206, 7024001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Pairing Assignments,Pairing Duration,TZ Diff,E-W or W-E Transition(Y/N),Min Local Nights', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003207, 7024001, 1, 'tableRow1', '*,*,*,*,*,04:00-06:01,00:00-72:00,*,2', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003208, 7024001, 1, 'tableRow2', '*,*,*,*,*,04:00-06:01,72:01-999:00,*,3', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003209, 7024001, 1, 'tableRow3', '*,*,*,*,*,06:01-09:01,00:00-48:00,*,2', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003210, 7024001, 1, 'tableRow4', '*,*,*,*,*,06:01-09:01,48:00-96:00,*,3', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003211, 7024001, 1, 'tableRow5', '*,*,*,*,*,06:01-09:01,96:00-999:00,*,4', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003212, 7024001, 1, 'tableRow6', '*,*,*,*,*,09:01-12:01,00:00-48:00,*,2', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003213, 7024001, 1, 'tableRow7', '*,*,*,*,*,09:01-12:01,48:00-72:00,*,3', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003214, 7024001, 1, 'tableRow8', '*,*,*,*,*,09:01-12:01,72:00-96:00,*,4', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003215, 7024001, 1, 'tableRow9', '*,*,*,*,*,09:01-12:01,96:00-999:00,*,5', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003216, 7024001, 1, 'tableRow10', '*,*,*,*,*,*,*,Y,3', 'ROIS', CURRENT_TIMESTAMP);

-- 7309 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7309001, 7309, '001', 'R', 'Minimum Rest After Ultra Long Haul Flight', 'PR', 'Rest', 'Table', 'Company', 'Minimum Rest After Ultra Long Haul Flight', 'H', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003217, 7309001, 1, 'tableHeader', 'Assignments,Attributes,Consecutive Type,Consecutive Times,Include Pairing Rest(Y/N),Counting Rest from Pairing End Day(Y/N),Direction,Rest Type,Min Rest', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003218, 7309001, 1, 'tableRow1', 'FLY|MVO,*,D,2,Y,N,Before,D,1.5', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003219, 7309001, 1, 'tableRow2', 'FLY|MVO,*,T,3,Y,Y,After,R,10:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003220, 7309001, 1, 'tableRow3', 'FLY|MVO,*,T,4,Y,Y,*,R,12:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7258 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7258001, 7258, '001', 'R', 'Limit Same Instructor as X Role on Extra Course', 'EVA', 'Training', 'Table', 'Company', 'Limit Same Instructor as X Role on Extra Course', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003221, 7258001, 1, 'tableHeader', 'Course Codes,Training Roles', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003222, 7258001, 1, 'tableRow1', 'FBK|LOE|FFK|RQK|M2K|M3K|MK1|MK2|ATK,*', 'ROIS', CURRENT_TIMESTAMP);

-- 7305 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7305001, 7305, '001', 'R', 'Max Consecutive Duty Times Limitation', 'PR', 'Duty', 'Table', 'Company', 'Max Consecutive Duty Times Limitation', 'S', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003223, 7305001, 1, 'tableHeader', 'Bases,Ranks,Positions,Fleets,Teams,Assignment Groups,Assignments,Labels,Attributes,Consecutive Type(T/D),Max Consecutive Times', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003224, 7305001, 1, 'tableRow1', '*,*,*,*,*,FLY,*,*,*,T,5', 'ROIS', CURRENT_TIMESTAMP);

-- 7311 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7311001, 7311, '001', 'R', 'Min Rest By Block Time', 'PR', 'Duty', 'Table', 'Company', 'Min Rest By Block Time', 'S', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003225, 7311001, 1, 'tableHeader', 'Bases,Compositions,Duty Type,Duty Assignments,Is Line Training,Flight No,Exclude Flight No,BLH Ranges,Is Layover Rest,Base Rest,Rest Multiplied', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003226, 7311001, 1, 'tableRow1', '*,*,*,*,N,*,*,*,N,24:00,0.5', 'ROIS', CURRENT_TIMESTAMP);

-- 7312 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7312001, 7312, '001', 'R', 'Max Landing in 18 hours', 'PR', 'Duty', 'Table', 'Company', 'Max Landing in 18 hours', 'S', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003227, 7312001, 1, 'tableHeader', 'Flight Assignments,Period,Unit,Type,Max Flights', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003228, 7312001, 1, 'tableRow1', '*,18,RH,S,7', 'ROIS', CURRENT_TIMESTAMP);

-- 7259 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7259001, 7259, '001', 'R', 'Check Training Course Only Assigned to Instructor', 'EVA', 'Training', 'Table', 'Company', 'Check Training Course Only Assigned to Instructor', 'S', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003229, 7259001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003230, 7259001, 1, 'tableRow1', 'TRAINING', 'ROIS', CURRENT_TIMESTAMP);

-- 7276 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7276001, 7276, '001', 'R', 'Check Disruptive Schedule', 'TG', 'Roster', 'Table', 'Company', 'Check Disruptive Schedule', 'S', 2, 'TG', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003231, 7276001, 1, 'tableHeader', 'Duty A Assignments,Duty A Type,Is Duty A Home Base,Duty B Assignments,Duty B Type,Is Duty B Home Base,Min Local Night', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003232, 7276001, 1, 'tableRow1', 'FLY,LFD|ND,*,FLY,ESD,Y,1', 'ROIS', CURRENT_TIMESTAMP);

-- 7277 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7277001, 7277, '001', 'R', 'Check Disruptive Schedule', 'TG', 'Roster', 'Table', 'Company', 'Check Disruptive Schedule', 'S', 2, 'TG', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003233, 7277001, 1, 'tableHeader', 'Assignments,Types,Duty Number Range,Next RERRP Min Rest', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003234, 7277001, 1, 'tableRow1', 'FLY,LFD|ESD|ND,4-999,60:00', 'ROIS', CURRENT_TIMESTAMP);


-- 2043法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (2043001, 2043, '001', 'B', 'Night Duty Definition', 'TG', 'Define', 'Table', 'Company', 'Night Duty Definition', 'S', 1, 'TG', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES VALUES (200003235, 2043001, 1, 'tableRow1', '02:00,04:59', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES VALUES (200003236, 2043001, 1, 'tableHeader', 'Night Duty Start,Night Duty End', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 7313法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7313001, 7313, '001', 'B', 'Max DP by complement', 'PR', 'Duty', 'Table', 'Company', 'Max DP by complement', 'S', 1, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003237, 7313001, 1, 'tableRow1', '2P,*,*,*,*,*,*,14:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003238, 7313001, 1, 'tableHeader', 'Compositions,Ref Composition,Additional Crews,Fleets,Flights,Deps,Arrs,Max DP', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 7308 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7308001, 7308, '001', 'R', 'Earned Days Off', 'PR', 'Duty', 'Table', 'Company', 'Earned Days Off', 'S', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003239, 7308001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Working Assignment Groups,Working Assignments,Working Level,DO Assignment Groups,DO Assignments,Blank Day Counted as DO(Y/N),Consecutive Working Days,Fixed Required DO,DO%', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003240, 7308001, 1, 'tableRow1', '*,*,*,*,FLY|MVP|MVO,*,P,REST|DO|LEAVE,*,Y,0-3,1,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003241, 7308001, 1, 'tableRow2', '*,*,*,*,FLY|MVP|MVO,*,P,REST|DO|LEAVE,*,Y,3-99,*,50', 'ROIS', CURRENT_TIMESTAMP);

-- 6041 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6041001, 6041, '001', 'R', 'Max number of DP over 10.5 hour  in a RP', 'QQ', 'Roster', 'Table', 'Company', 'Max number of DP over 10.5 hour  in a RP', 'S', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003242, 6041001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Duty Assignment Groups,Duty Assignments,DP Ranges,Max Limitation', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003243, 6041001, 1, 'tableRow1', '*,*,*,*,*,FLY,10:30-99:00,8', 'ROIS', CURRENT_TIMESTAMP);

-- 7307 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7307001, 7307, '001', 'P', 'Min Local Night Requirements', 'PR', 'Duty', 'Table', 'Company', 'Min Local Night Requirements', 'S', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003245, 7307001, 1, 'tableHeader', 'Bases,Min Rest at Base Without Local Night,Min Rest at Layover Without Local Night', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003246, 7307001, 1, 'tableRow1', '*,16:00,16:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7314 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7314001, 7314, '001', 'P', 'Gender Restriction', 'PR', 'Duty', 'Table', 'Company', 'Gender Restriction', 'S', 2, 'PR', 'P', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003247, 7314001, 1, 'tableHeader', 'Pairing Bases,Flight Fleets,Acting Ranks,Flight Compositions,Min Male Crews,Layover,Even Distribution,Extra Distribution', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003248, 7314001, 1, 'tableRow1', '*,*,*,*,*,*,Y,M', 'ROIS', CURRENT_TIMESTAMP);


-- 7315 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7315001, 7315, '001', 'R', 'Crew cannot operate flight categories (F) or flight can only be operated by crew categories (C)', 'PR', 'Duty', 'Table', 'Company', 'Crew cannot operate flight categories (F) or flight can only be operated by crew categories (C)', 'S', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003249, 7315001, 1, 'tableHeader', 'Crew Bases,Crew Ranks,Crew Fleets,Crew Teams,Crew Quals,Crew Nationalities,Flight Compositions,Flight Composition Options,Flight Assignments,Flight Countries,Flight Airport Categories,Flight Airports,Flight Airlines,Flight Numbers,Flight Types,Flight Fleets,Flight Sub-Fleets,Tail Numbers,Service Types,Acting Ranks,Pairing Attributes,Restict Crew or Flight(C/F)', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003250, 7315001, 1, 'tableRow1', '*,*,*,*,NQ,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,F', 'ROIS', CURRENT_TIMESTAMP);

-- 6120法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6120001, 6120, '001', 'B', 'Check Off Duty Period', 'TG', 'Rest', 'Table', 'Company', 'Check Off Duty Period', 'S', 1, 'TG', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003251, 6120001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Duty Assignments,Duty TZ Diff,Sector BLH Ranges,Encroach Time,Is Home Base,Acclimatized State,Benchmark,Period Threshold,Rest Time,FDP Times,Direction,Displacement Adjustment Reference Time', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003252, 6120001, 1, 'tableRow1', 'BKK,*,*,FLY|MVO|MVP|DHD,*,10:01-99:00,*,Y,*,DP,10:00-99:01,48:00,0,*,99:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003253, 6120001, 1, 'tableRow2', 'BKK,*,*,FLY|MVO|MVP|DHD,04:00-12:00,00:01-99:00,*,Y,*,DP,00:00-99:01,48:00,0,*,99:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003254, 6120001, 1, 'tableRow3', 'BKK,*,*,FLY|MVO|MVP|SIM|DHD,*,*,*,Y,*,DP,00:00-12:01,12:00,0,*,99:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003255, 6120001, 1, 'tableRow4', '*,*,*,FLY|MVO|MVP|DHD,*,08:01-9:01,02:00-05:59,N,*,DP,08:01-99:99,18:00,0,*,99:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003256, 6120001, 1, 'tableRow5', '*,*,*,FLY|MVO|MVP|DHD,*,09:01-99:00,*,N,*,DP,09:01-99:99,18:00,0,*,99:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003257, 6120001, 1, 'tableRow6', '*,*,*,FLY|MVO|MVP|SIM|DHD,*,*,*,N,*,DP,00:00-08:01,08:00,0,*,99:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003258, 6120001, 1, 'tableRow7', '*,*,*,FLY|MVO|MVP|DHD,*,*,*,N,*,DP,08:01-10:01,10:00,0,*,99:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003259, 6120001, 1, 'tableRow8', '*,*,*,FLY|MVO|MVP|DHD,*,*,*,N,*,DP,10:01-12:01,12:00,0,*,99:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003260, 6120001, 1, 'tableRow9', '*,*,*,FLY|MVO|MVP|DHD,*,*,*,*,*,DP,12:01-14:01,14:00,0,*,99:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003261, 6120001, 1, 'tableRow10', '*,*,*,FLY|MVO|MVP|DHD,*,*,*,*,*,DP,14:01-16:01,16:00,0,*,99:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003262, 6120001, 1, 'tableRow11', '*,*,*,FLY|MVO|MVP|DHD,*,*,*,*,*,DP,16:01-20:01,24:00,0,*,99:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003263, 6120001, 1, 'tableRow12', 'BKK,*,*,CSB|PAPSB1|PAPSB2,*,*,*,Y,*,DP,00:00-23:59,12:00,0,*,99:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (200003264, 6120001, 1, 'tableRow13', 'BKK,*,*,HSB|SBY|PHMSB1|PHMSB2|PHMSB3|PHMSB3B|PHMSBA|PHMSBB|SBS,*,*,*,Y,*,DP,00:00-23:59,10:00,0,*,99:00', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 7278 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7278001, 7278, '001', 'R', 'Calculate FDP For SIM-F Training', 'TG', 'Duty', 'Table', 'Company', 'Calculate FDP For SIM-F Training', 'S', 2, 'TG', 'P', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003265, 7278001, 1, 'tableHeader', 'Courses,FDP Pct,Before Pct FDP Gap,After Pct FDP Gap', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003266, 7278001, 1, 'tableRow1', 'SIM,0.2,2:00,2:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7273 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES(7273001, 7273, '001', 'P', ' Min conncection time ', 'PR', 'Connection', 'Table', 'Company', 'Min conncection time ', 'S', 1, 'PR', 'P', 'S', '', 'cp.liu', '2025-03-18 14:04:29', NULL);

INSERT INTO rule_parameter (id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003267, 7273001, 1, 'tableHeader', 'Airports,Inbound Assignments,Inbound Flight Fleets,Inbound Flight DIR,Inbound Sub Fleets,Outbound Assignments,Outbound Flight Fleets,Outbound Flight DIR,Outbound Sub Fleets,Is Aircraft Change,Type,MCT,Max Conn', '', 'cp.liu', '2025-06-03 08:19:53');
INSERT INTO rule_parameter (id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003268, 7273001, 1, 'tableRow1', '*,*,*,*,*,*,*,*,*,*,Duty,01:00,*', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 7306 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7306001, 7306, '001', 'R', 'Minimum Rest after LFES Flight', 'PR', 'Duty', 'Table', 'Company', 'Minimum Rest after LFES Flight', 'S', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003269, 7306001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Duty Time Ranges,Max Consecutive Times', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003270, 7306001, 1, 'tableRow1', '*,*,*,*,22:00-06:00,2', 'ROIS', CURRENT_TIMESTAMP);

-- 8173 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (8173001, 8173, '001', 'R', 'Max Pattern By Date', 'EVA', 'Roster', 'Table', 'Company', 'Max Pattern By Date', 'S', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003271, 8173001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Crew Teams,Days,Attributes,Assignments,Max Times', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003272, 8173001, 1, 'tableRow1', '*,*,*,*,*,.SBY.,*,7', 'ROIS', CURRENT_TIMESTAMP);

-- 7320 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7320001, 7320, '001', 'R', 'Filtered Crew Can Only Perform Specific Flights or Ground Duties', 'PR', 'Duty', 'Table', 'Company', 'Filtered Crew Can Only Perform Specific Flights or Ground Duties', 'S', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003273, 7320001, 1, 'tableHeader', 'Crew Bases,Crew Ranks,Crew Fleets,Crew Nationalities,With Teams,Without Teams,With Quals,Without Quals,Flight Types,Service Types,Airlines,Flight Numbers,Flight Fleets,Flight Sub-Fleets,Airports,Routes,Airport Categories,Tail Numbers,Pairing Attributes,Acting Ranks,Assignment Groups,Assignments,Is Training(Y/N),Training Roles', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003274, 7320001, 1, 'tableRow1', '*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*', 'ROIS', CURRENT_TIMESTAMP);

-- 7321 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7321001, 7321, '001', 'R', 'Flight or Ground Duty Can Only Be Operated by the Filtered Crew', 'PR', 'Duty', 'Table', 'Company', 'Flight or Ground Duty Can Only Be Operated by the Filtered Crew', 'S', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003275, 7321001, 1, 'tableHeader', 'Flight Types,Service Types,Airlines,Flight Numbers,Flight Fleets,Flight Sub-Fleets,Airports,Routes,Airport Categories,Tail Numbers,Pairing Attributes,Acting Ranks,Assignment Groups,Assignments,Is Training(Y/N),Training Roles,Crew Bases,Crew Ranks,Crew Fleets,Crew Nationalities,With Teams,Without Teams,With Quals,Without Quals', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003276, 7321001, 1, 'tableRow1', '*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*', 'ROIS', CURRENT_TIMESTAMP);

-- 7322 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7322001, 7322, '001', 'R', 'Filtered Crew Cannot Operate Flights or Ground Duties', 'PR', 'Duty', 'Table', 'Company', 'Filtered Crew Cannot Operate Flights or Ground Duties', 'S', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003277, 7322001, 1, 'tableHeader', 'Crew Bases,Crew Ranks,Crew Fleets,Crew Nationalities,With Teams,Without Teams,With Quals,Without Quals,Flight Types,Service Types,Airlines,Flight Numbers,Flight Fleets,Flight Sub-Fleets,Airports,Routes,Airport Categories,Tail Numbers,Pairing Attributes,Acting Ranks,Assignment Groups,Assignments,Is Training(Y/N),Training Roles', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003278, 7322001, 1, 'tableRow1', '*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*', 'ROIS', CURRENT_TIMESTAMP);

-- 7028 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7028001, 7028, '001', 'R', 'Increase in FDP Limits by Split Duty', 'TG', 'Duty', 'Table', 'TCAR', 'Increase in FDP Limits by Split Duty', 'S', 2, 'TG', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003279, 7028001, 1, 'tableHeader', 'Post Flight Assignments,Dummy Release Time,Pre Flight Assignments,Dummy Brief Time,Total Hotel Travel Time,Min Split Duty Length,Max Split Duty Length,Extension Max Fdp Pct', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003280, 7028001, 1, 'tableRow1', '*,00:30,*,01:00,01:00,03:00,06:00,0.5', 'ROIS', CURRENT_TIMESTAMP);

-- 7323 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7323001, 7323, '001', 'R', 'Min Rest for Same-Day Report and Release', 'PR', 'Roster', 'Table', 'Company', 'Min Rest for Same-Day Report and Release', 'S', 2, 'PR', 'P', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003281, 7323001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Prev Duty Assignment Groups,Next Duty Assignment Groups,Prev Duty Assignments,Next Duty Assignments,Prev Duty Time Range,Next Duty Time Range,Min Rest Period,Rest Unit', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003282, 7323001, 1, 'tableRow1', '*,*,*,*,FLY,FLY,*,*,02:00-05:00,18:00-22:00,18,RH', 'ROIS', CURRENT_TIMESTAMP);


-- 7324 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7324001, 7324, '001', 'R', 'Birthday Days Off', 'PR', 'Roster', 'Table', 'Company', 'Birthday Days Off', 'S', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003284, 7324001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Birthday Assignments,Days Off Before Birthday,Days Off After Birthday,Latest End Time,Earliest Start Time', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003285, 7324001, 1, 'tableRow1', '*,*,*,*,DO,0,0,17:00,9:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7400 法规
-- ANR (Singapore) acclimatisation definition (Rule 7400)
-- Requires LOCAL_NIGHT_DEFINITION (2014) to be present for local night windows

-- Backup (optional)
-- CREATE TABLE rule_backup_7400 LIKE rule;
-- INSERT INTO rule_backup_7400 SELECT * FROM rule;
-- CREATE TABLE rule_parameter_backup_7400 LIKE rule_parameter;
-- INSERT INTO rule_parameter_backup_7400 SELECT * FROM rule_parameter;

-- Insert rule definition
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES (7400001, 7400, '001', 'P', 'ANR Acclimatization Definition', 'ANR', 'Duty', 'Table', 'ANR', 'Acclimatized time changes after N consecutive local nights free of duty within a timezone', 'S', 2, 'ANR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Parameters: single table with MIN LN and SEVERITY
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200003313, 7400001, 1, 'tableHeader', 'MIN LN', 'ROIS', CURRENT_TIMESTAMP);

-- Default: 3 consecutive local nights, severity 2
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200003314, 7400001, 1, 'tableRow1', '3', 'ROIS', CURRENT_TIMESTAMP);


-- 7401 法规
-- ANR (Singapore) day off definition (Rule 7401)
-- Shared by downstream ANR rules that need to identify how many
-- days off a rest period contains.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE rule_backup_7401 LIKE rule;
-- INSERT INTO rule_backup_7401 SELECT * FROM rule;
-- CREATE TABLE rule_parameter_backup_7401 LIKE rule_parameter;
-- INSERT INTO rule_parameter_backup_7401 SELECT * FROM rule_parameter;

-- 1) Rule definition
INSERT INTO rule(
  id, function, instance, class,
  description, reference, category,
  store_structure, source, detail,
  overridability, severity,
  filiale, division, owner,
  locked, modified_by, last_modified
)
VALUES
  (7401001, 7401, '001', 'P',
   'ANR Day Off Definition', 'ANR',
   'REST',
   'Table',
   'ANR',
   'Defines minimum rest hours and local nights for each ANR day-off sequence',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   DAY OFF SEQUENCE : sequence index or range (e.g. 1, 2-99) within a consecutive block
--   MIN REST TIME    : minimum hours free of duty for that sequence (HH or HH:MM)
--   MIN LOCAL NIGHTS : minimum number of local nights that must be included
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003315, 7401001, 1,
   'table1Header',
   'DAY OFF SEQUENCE,MIN REST TIME,MIN LOCAL NIGHTS',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Table rows
-- Row 1: First day off requires at least 34 hours of rest and one local night.
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003316, 7401001, 1,
   'table1Row1',
   '1,34:00,1',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 2: Subsequent consecutive days off need 24 hours and a local night each.
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003317, 7401001, 1,
   'table1Row2',
   '2-99,24:00,1',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003524, 7401001, 1, 'table2Header', 'DO Assignment Groups,DO Extension Assignment Groups,Blank Day Counted as DO(Y/N)', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003525, 7401001, 1, 'table2Row1', 'DO,LEA,Y', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7410 法规
-- ANR (Singapore) FDP limit definition (Rule 7410)
-- Depends on ANR acclimatisation (7400) for ref timezone and QQ FDP setup if used together.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE rule_backup_7410 LIKE rule;
-- INSERT INTO rule_backup_7410 SELECT * FROM rule;
-- CREATE TABLE rule_parameter_backup_7410 LIKE rule_parameter;
-- INSERT INTO rule_parameter_backup_7410 SELECT * FROM rule_parameter;

-- 1) Rule definition
INSERT INTO rule(
  id, function, instance, class,
  description, reference, category,
  store_structure, source, detail,
  overridability, severity,
  filiale, division, owner,
  locked, modified_by, last_modified
)
VALUES
  (7410001, 7410, '001', 'P',
   'ANR Maximum FDP per duty', 'ANR',
   'FDP',
   'MultiTable',
   'ANR',
   'Maximum permitted FDP by TZ diff, composition, rest facility, report time, and sector count',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table 1 header (Max FDP rows)
-- Columns:
--   TZ Diff:         time zone difference between acclimated time and local time at report (HH:MM-HH:MM, inclusive lower, inclusive upper)
--   COMPOSITION:     crew composition (e.g. 2P, 3P), '|' separated, '*' for any
--   REST FACILITY:   rest facility code (integer), '*' or empty for any
--   REPORT START:    report local time lower bound (HHMM)
--   REPORT END:      report local time upper bound (HHMM)
--   SECTOR LOWER:    inclusive lower bound of total sectors (including DHD if enabled)
--   SECTORS UPPER:   inclusive upper bound of total sectors
--   MAX FDP:         maximum FDP in HH:MM
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003318, 7410001, 1,
   'table1Header',
   'TZ DIFF,COMPOSITION,REST FACILITY,REPORT START,REPORT END,SECTOR LOWER,SECTORS UPPER,MAX FDP',
   'ROIS', CURRENT_TIMESTAMP);

-- ===================================================
-- (2.1) Rows from Table A (TZ Diff 00:00-02:00, Basic)
-- ===================================================

-- Local time of start 0600-0759
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003319, 7410001, 1,
   'table1Row1',
   '00:00-02:00,2P,*,0600,0759,1,1,13:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003320, 7410001, 1,
   'table1Row2',
   '00:00-02:00,2P,*,0600,0759,2,2,12:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003321, 7410001, 1,
   'table1Row3',
   '00:00-02:00,2P,*,0600,0759,3,3,11:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003322, 7410001, 1,
   'table1Row4',
   '00:00-02:00,2P,*,0600,0759,4,4,10:45',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003323, 7410001, 1,
   'table1Row5',
   '00:00-02:00,2P,*,0600,0759,5,5,10:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003324, 7410001, 1,
   'table1Row6',
   '00:00-02:00,2P,*,0600,0759,6,6,09:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003325, 7410001, 1,
   'table1Row7',
   '00:00-02:00,2P,*,0600,0759,7,7,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003326, 7410001, 1,
   'table1Row8',
   '00:00-02:00,2P,*,0600,0759,8,99,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- Local time of start 0800-1459
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003327, 7410001, 1,
   'table1Row9',
   '00:00-02:00,2P,*,0800,1459,1,1,14:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003328, 7410001, 1,
   'table1Row10',
   '00:00-02:00,2P,*,0800,1459,2,2,13:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003329, 7410001, 1,
   'table1Row11',
   '00:00-02:00,2P,*,0800,1459,3,3,12:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003330, 7410001, 1,
   'table1Row12',
   '00:00-02:00,2P,*,0800,1459,4,4,11:45',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003331, 7410001, 1,
   'table1Row13',
   '00:00-02:00,2P,*,0800,1459,5,5,11:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003332, 7410001, 1,
   'table1Row14',
   '00:00-02:00,2P,*,0800,1459,6,6,10:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003333, 7410001, 1,
   'table1Row15',
   '00:00-02:00,2P,*,0800,1459,7,7,09:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003334, 7410001, 1,
   'table1Row16',
   '00:00-02:00,2P,*,0800,1459,8,99,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- Local time of start 1500-2159
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003335, 7410001, 1,
   'table1Row17',
   '00:00-02:00,2P,*,1500,2159,1,1,13:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003336, 7410001, 1,
   'table1Row18',
   '00:00-02:00,2P,*,1500,2159,2,2,12:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003337, 7410001, 1,
   'table1Row19',
   '00:00-02:00,2P,*,1500,2159,3,3,11:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003338, 7410001, 1,
   'table1Row20',
   '00:00-02:00,2P,*,1500,2159,4,4,10:45',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003339, 7410001, 1,
   'table1Row21',
   '00:00-02:00,2P,*,1500,2159,5,5,10:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003340, 7410001, 1,
   'table1Row22',
   '00:00-02:00,2P,*,1500,2159,6,6,09:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003341, 7410001, 1,
   'table1Row23',
   '00:00-02:00,2P,*,1500,2159,7,7,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003342, 7410001, 1,
   'table1Row24',
   '00:00-02:00,2P,*,1500,2159,8,99,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- Local time of start 2200-0559
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003343, 7410001, 1,
   'table1Row25',
   '00:00-02:00,2P,*,2200,0559,1,1,11:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003344, 7410001, 1,
   'table1Row26',
   '00:00-02:00,2P,*,2200,0559,2,2,10:15',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003345, 7410001, 1,
   'table1Row27',
   '00:00-02:00,2P,*,2200,0559,3,3,09:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003346, 7410001, 1,
   'table1Row28',
   '00:00-02:00,2P,*,2200,0559,4,4,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003347, 7410001, 1,
   'table1Row29',
   '00:00-02:00,2P,*,2200,0559,5,5,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003348, 7410001, 1,
   'table1Row30',
   '00:00-02:00,2P,*,2200,0559,6,6,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003349, 7410001, 1,
   'table1Row31',
   '00:00-02:00,2P,*,2200,0559,7,7,09:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003350, 7410001, 1,
   'table1Row32',
   '00:00-02:00,2P,*,2200,0559,8,99,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- ===================================================
-- (2.2) Rows from Table B (TZ Diff 02:01-24:00, Basic)
--     Applies all day (0000-2359)
-- ===================================================

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003351, 7410001, 1,
   'table1Row33',
   '02:01-24:00,2P,*,0000,2359,1,1,12:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003352, 7410001, 1,
   'table1Row34',
   '02:01-24:00,2P,*,0000,2359,2,2,12:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003353, 7410001, 1,
   'table1Row35',
   '02:01-24:00,2P,*,0000,2359,3,3,11:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003354, 7410001, 1,
   'table1Row36',
   '02:01-24:00,2P,*,0000,2359,4,4,10:30',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003355, 7410001, 1,
   'table1Row37',
   '02:01-24:00,2P,*,0000,2359,5,5,10:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003356, 7410001, 1,
   'table1Row38',
   '02:01-24:00,2P,*,0000,2359,6,99,09:00',
   'ROIS', CURRENT_TIMESTAMP);

-- ===================================================
-- (2.3) Rows from Augmented Crew (3 pilots and 4 pilots, TZ Diff 00:00-24:00, 3P/4P)
--     Applies all day (0000-2359)
-- ===================================================

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003357, 7410001, 1,
   'table1Row39',
   '00:00-24:00,3P,3,0000,2359,1,1,15:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003358, 7410001, 1,
   'table1Row40',
   '00:00-24:00,4P,3,0000,2359,1,1,18:00',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Table 2 header (control parameters)
-- INCLUDE DEADHEAD SECTORS WITHIN FDP: Y/N; when Y, non-operating flight sectors count towards sector total.
-- GLOBAL BUFFER MINUTES: integer buffer to apply in checks (duty may exceed MAX FDP by this many minutes before violation).
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003359, 7410001, 1,
   'table2Header',
   'INCLUDE DEADHEAD SECTORS WITHIN FDP,GLOBAL BUFFER MINUTES',
   'ROIS', CURRENT_TIMESTAMP);

-- Table 2 - single control row: include DHD sectors, 30-minute global buffer
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003360, 7410001, 1,
   'table2Row1',
   'Y,30',
   'ROIS', CURRENT_TIMESTAMP);


-- 7411 法规
-- ANR (Singapore) sector counting definition (Rule 7411)
-- Used by rule 7410 to adjust the effective number of sectors for long sectors
-- based on sector length and time zone difference.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE rule_backup_7411 LIKE rule;
-- INSERT INTO rule_backup_7411 SELECT * FROM rule;
-- CREATE TABLE rule_parameter_backup_7411 LIKE rule_parameter;
-- INSERT INTO rule_parameter_backup_7411 SELECT * FROM rule_parameter;

-- 1) Rule definition
INSERT INTO rule(
  id, function, instance, class,
  description, reference, category,
  store_structure, source, detail,
  overridability, severity,
  filiale, division, owner,
  locked, modified_by, last_modified
)
VALUES
  (7411001, 7411, '001', 'P',
   'ANR FDP Limit Sector Adjustment Definition', 'ANR',
   'FDP',
   'Table',
   'ANR',
   'Sector length and TZ-diff based sector count adjustment for ANR FDP limit',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   SECTOR LENGTH LOWER : inclusive lower bound of sector length (HHMM)
--   SECTOR LENGTH UPPER : inclusive upper bound of sector length (HHMM)
--   TZ DIFF             : time zone difference between acclimated time and local time (HH:MM-HH:MM, both inclusive)
--   SECTOR VALUE        : adjusted sector value (e.g. 2,3,4)
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003361, 7411001, 1,
   'tableHeader',
   'SECTOR LENGTH LOWER,SECTOR LENGTH UPPER,TZ DIFF,SECTOR VALUE',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Table rows (example from Table B)
-- Long sector adjustment table (2-pilot only)
-- Format: BLOCK LOWER, BLOCK UPPER, TZ DIFF, SECTOR COUNT

-- Row 1: 07:00 <= length <= 09:00, TZ diff 00:00-02:00 (Table A), counts as 2 sectors
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003362, 7411001, 1,
   'tableRow1',
   '0701,0900,00:00-02:00,2',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 2: 09:00 < length <= 11:00, TZ diff 00:00-02:00 (Table A), counts as 3 sectors
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003363, 7411001, 1,
   'tableRow2',
   '0901,1100,00:00-02:00,3',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 3: length > 11:00 (11:00-24:00], TZ diff 00:00-02:00 (Table A), counts as 4 sectors
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003364, 7411001, 1,
   'tableRow3',
   '1101,9900,00:00-02:00,4',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 4: 07:00 < length <= 09:00, TZ diff 02:01-24:00 (Table B), counts as 3 sectors
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003365, 7411001, 1,
   'tableRow4',
   '0701,0900,02:01-24:00,3',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 5: 09:00 < length <= 11:00, TZ diff 02:01-24:00 (Table B), counts as 4 sectors
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003366, 7411001, 1,
   'tableRow5',
   '0901,1100,02:01-24:00,4',
   'ROIS', CURRENT_TIMESTAMP);

-- Row 6: length > 11:00 (11:00-24:00], TZ diff 02:01-24:00 (Table B), counts as 5 sectors
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003367, 7411001, 1,
   'tableRow6',
   '1101,9900,02:01-24:00,5',
   'ROIS', CURRENT_TIMESTAMP);

-- 7205 ??
-- ANR (Singapore) duty-period limits in consecutive 14 local days (Rule 7205)
-- Based on ANR-121 Section 12:
--   * Flight crew: cumulative DP must not exceed 90 hours in any 14 consecutive days
--   * Cabin crew: cumulative DP must not exceed 100 hours in any 14 consecutive days
-- The rule is configured as a sliding window (UNIT=CD) with the DP ceiling encoded
-- through the new "Limit DP Range" column (HH:mm-HH:mm, inclusive lower bound,
-- exclusive upper bound).

-- OPTIONAL: backup existing rule records before applying (adjust table names as needed)
-- CREATE TABLE rule_backup_7205 AS SELECT * FROM rule WHERE function = 7205;
-- CREATE TABLE rule_parameter_backup_7205 AS SELECT * FROM rule_parameter WHERE rule_id IN (SELECT id FROM rule WHERE function = 7205);

-- ---------------------------------------------------------------------------
-- Flight Crew (division P) - 90 hours DP in any 14 consecutive local days
-- ---------------------------------------------------------------------------
INSERT INTO rule(
  id, function, instance, class,
  description, reference, category,
  store_structure, source, detail,
  overridability, severity,
  filiale, division, owner,
  locked, modified_by, last_modified
)
VALUES
  (7205010, 7205, '001', 'B',
   'ANR Max Duty Period - Flight Crew (14 Consecutive Days)', 'ANR',
   'Duty',
   'Table',
   'ANR',
   'Ensures each flight crew member accumulates no more than 90 duty hours in any consecutive 14 local days',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003381, 7205010, 1,
   'Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range',
   'Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003382, 7205010, 1,
   'tableRow1',
   '*,FD,*,*,*,*,*,14,CD,*,*,00:00-90:01',
   'ROIS', CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------------
-- Cabin Crew (division C) - 100 hours DP in any 14 consecutive local days
-- ---------------------------------------------------------------------------
INSERT INTO rule(
  id, function, instance, class,
  description, reference, category,
  store_structure, source, detail,
  overridability, severity,
  filiale, division, owner,
  locked, modified_by, last_modified
)
VALUES
  (7205011, 7205, '001', 'B',
   'ANR Max Duty Period - Cabin Crew (14 Consecutive Days)', 'ANR',
   'Duty',
   'Table',
   'ANR',
   'Ensures each cabin crew member accumulates no more than 100 duty hours in any consecutive 14 local days',
   'S', 2,
   'ANR', 'C', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003383, 7205011, 1,
   'Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range',
   'Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Period,Unit,Limit BLH Range,Limit FDP Range,Limit DP Range',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003384, 7205011, 1,
   'tableRow1',
   '*,CC,*,*,*,*,*,14,CD,*,*,00:00-100:01',
   'ROIS', CURRENT_TIMESTAMP);


-- 7405 ??
-- ANR ULR duty definition (Rule 7405)
-- Identifies ULR duties based on division, duty endpoints, and FDP threshold.

INSERT INTO rule(
  id, function, instance, class,
  description, reference, category,
  store_structure, source, detail,
  overridability, severity,
  filiale, division, owner,
  locked, modified_by, last_modified
)
VALUES
  (7405001, 7405, '001', 'P',
   'ANR ULR Duty Definition', 'ANR',
   'ANR',
   'Table',
   'ANR',
   'Defines when a duty is treated as ULR based on division, endpoints, and FDP length',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003385, 7405001, 1,
   'tableHeader',
   'Division,Duty Start Station,Duty End Station,MIN FDP (HH:MM)',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003386, 7405001, 1,
   'tableRow1',
   'P,*,*,18:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003387, 7405001, 1,
   'tableRow2',
   'C,SIN,*,19:00',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003388, 7405001, 1,
   'tableRow3',
   'C,*,SIN,18:00',
   'ROIS', CURRENT_TIMESTAMP);


-- 7412 ??
-- ANR (Singapore) minimum rest period between duties (Rule 7412)

INSERT INTO rule(
  id, function, instance, class,
  description, reference, category,
  store_structure, source, detail,
  overridability, severity,
  filiale, division, owner,
  locked, modified_by, last_modified
)
VALUES
  (7412001, 7412, '001', 'P',
   'ANR Minimum Rest Between Consecutive Duties', 'ANR',
   'Rest',
   'Table',
   'ANR',
   'Minimum rest between consecutive duties based on duty assignments, DP length, and local night coverage',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003389, 7412001, 1,
   'tableHeader',
   'CURRENT DUTY ASSIGNMENTS,NEXT DUTY ASSIGNMENTS,DP RANGE,has Local Night(Y/N),MIN REST TIME,MIN LOCAL NIGHTS',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id,rule_id,phase_id,param_names,param_values,modified_by,last_modified) VALUES
  (200003390, 7412001, 1, 'tableRow1',  'FLY|MVO,*,*,Y,10:00,*',       'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id,rule_id,phase_id,param_names,param_values,modified_by,last_modified) VALUES
  (200003391, 7412001, 1, 'tableRow2',  'FLY|MVO,*,*,N,12:00,*',       'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id,rule_id,phase_id,param_names,param_values,modified_by,last_modified) VALUES
  (200003392, 7412001, 1, 'tableRow3',  'FLY|MVO,*,10:01-11:00,*,11:00,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id,rule_id,phase_id,param_names,param_values,modified_by,last_modified) VALUES
  (200003393, 7412001, 1, 'tableRow4',  'FLY|MVO,*,11:01-12:00,*,12:00,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id,rule_id,phase_id,param_names,param_values,modified_by,last_modified) VALUES
  (200003394, 7412001, 1, 'tableRow5',  'FLY|MVO,*,12:01-13:00,*,13:00,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id,rule_id,phase_id,param_names,param_values,modified_by,last_modified) VALUES
  (200003395, 7412001, 1, 'tableRow6',  'FLY|MVO,*,13:01-14:00,*,14:00,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id,rule_id,phase_id,param_names,param_values,modified_by,last_modified) VALUES
  (200003396, 7412001, 1, 'tableRow7',  'FLY|MVO,*,14:01-15:00,*,15:00,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id,rule_id,phase_id,param_names,param_values,modified_by,last_modified) VALUES
  (200003397, 7412001, 1, 'tableRow8',  'FLY|MVO,*,15:01-16:00,*,16:00,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id,rule_id,phase_id,param_names,param_values,modified_by,last_modified) VALUES
  (200003398, 7412001, 1, 'tableRow9',  'FLY|MVO,*,16:01-99:00,*,24:00,1', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id,rule_id,phase_id,param_names,param_values,modified_by,last_modified) VALUES
  (200003399, 7412001, 1, 'tableRow10', '*,FLY|MVO,*,Y,10:00,*',       'ROIS', CURRENT_TIMESTAMP);


-- 7414 ??
-- ANR (Singapore) consecutive special duty rest requirement (Rule 7414)

INSERT INTO rule(
  id, function, instance, class,
  description, reference, category,
  store_structure, source, detail,
  overridability, severity,
  filiale, division, owner,
  locked, modified_by, last_modified
)
VALUES
  (7414001, 7414, '001', 'P',
   'ANR Consecutive Special Duty Rest Requirement', 'ANR',
   'ANR',
   'Table',
   'ANR',
   'Ensure rest between consecutive early start/late finish/WOCL duties meets ANR limits',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003400, 7414001, 1,
   'tableHeader',
   'INCLUDE TRAILING DEADHEAD,CONSECUTIVE TIMES,MIN REST TIME,MIN LOCAL NIGHTS',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003401, 7414001, 1,
   'tableRow1',
   'Y,3,24:00,1',
   'ROIS', CURRENT_TIMESTAMP);

-- 7415 法规
-- ANR (Singapore) consecutive working day limit between days off (Rule 7415)
-- Relies on the ANR day off definition (Rule 7401) to determine whether a rest
-- period qualifies as a day off.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE rule_backup_7415 LIKE rule;
-- INSERT INTO rule_backup_7415 SELECT * FROM rule;
-- CREATE TABLE rule_parameter_backup_7415 LIKE rule_parameter;
-- INSERT INTO rule_parameter_backup_7415 SELECT * FROM rule_parameter;

-- 1) Rule definition
INSERT INTO rule(
  id, function, instance, class,
  description, reference, category,
  store_structure, source, detail,
  overridability, severity,
  filiale, division, owner,
  locked, modified_by, last_modified
)
VALUES
  (7415001, 7415, '001', 'P',
   'ANR Max Consecutive Working Days Between Day Offs', 'ANR',
   'ANR',
   'Table',
   'ANR',
   'Checks that no more than 7 consecutive working days occur between ANR day offs',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   MAX WORKING DAYS       : maximum allowed consecutive working days (default 7)
--   LAST DAY BUFFER HHMM   : latest allowed rest-start time on the 7th day (default 21:00)
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003368, 7415001, 1,
   'tableHeader',
   'MAX WORKING DAYS,LAST DAY BUFFER HHMM',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Configuration row
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003369, 7415001, 1,
   'tableRow1',
   '7,21:00',
   'ROIS', CURRENT_TIMESTAMP);


-- 7416 法规
-- ANR (Singapore) minimum days off in consecutive periods (Rule 7416)
-- Relies on the ANR day off definition (Rule 7401) to determine whether rest
-- periods qualify as ANR day offs.

-- OPTIONAL: backup existing rule records before applying
-- CREATE TABLE rule_backup_7416 LIKE rule;
-- INSERT INTO rule_backup_7416 SELECT * FROM rule;
-- CREATE TABLE rule_parameter_backup_7416 LIKE rule_parameter;
-- INSERT INTO rule_parameter_backup_7416 SELECT * FROM rule_parameter;

-- 1) Rule definition
INSERT INTO rule(
  id, function, instance, class,
  description, reference, category,
  store_structure, source, detail,
  overridability, severity,
  filiale, division, owner,
  locked, modified_by, last_modified
)
VALUES
  (7416001, 7416, '001', 'P',
   'ANR Min Days Off In Consecutive Periods', 'ANR',
   'ANR',
   'Table',
   'ANR',
   'Checks that each rolling period has at least the configured number of ANR day offs',
   'S', 2,
   'ANR', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 2) Table header
-- Columns:
--   UNIT          : CD (consecutive days), CW (consecutive weeks), CM (consecutive months)
--   PERIOD        : length of the window expressed in UNIT
--   MIN DAYS OFF  : minimum number of ANR day offs required in each window
--   WEEK START ON : 1=Monday, 0 or 7=Sunday (only used when UNIT = CW)
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003370, 7416001, 1,
   'tableHeader',
   'UNIT,PERIOD,MIN DAYS OFF,WEEK START ON',
   'ROIS', CURRENT_TIMESTAMP);

-- 3) Configuration row
-- Example: at least 2 ANR day offs in every 2 consecutive calendar weeks,
-- with calendar week starting on Monday.
INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003371, 7416001, 1,
   'tableRow1',
   'CW,2,2,1',
   'ROIS', CURRENT_TIMESTAMP);

-- 7435 法规
-- CA ULR standby pairing minimum calendar days (Rule 7435)
-- Pairings containing ULR duties and standby must span the configured base-local calendar days.
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES (7435001, 7435, '001', 'P', 'CA ULR Standby Pairing Minimum Days', 'SQ', 'Pairing', 'Table', 'Company', 'Pairings with ULR duties and standby must span the configured base-local calendar days', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200003375, 7435001, 1, 'tableHeader', 'Has ULR Duty,Layover Airport,Layover Country,Has Duty Assignment,Min Pairing Days', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200003376, 7435001, 1, 'tableRow1', 'Y,*,*,SBY,6', 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200003377, 7435001, 1, 'tableRow2', '*,*,US,SBY,6', 'ROIS', CURRENT_TIMESTAMP);


-- 7450 ??
-- SQ (Collective Agreement) FDP-based sector limitation (Rule 7450)
-- Limits augmented (3P/4P) duties by FDP duration and sector count.

INSERT INTO rule(
  id, function, instance, class,
  description, reference, category,
  store_structure, source, detail,
  overridability, severity,
  filiale, division, owner,
  locked, modified_by, last_modified
)
VALUES
  (7450001, 7450, '001', 'P',
   'SQ FDP-based sector limit', 'SQ',
   'CA',
   'Table',
   'SQ',
   'Augmented (3P/4P) duties are limited to 1 or 2 sectors based on FDP duration; last deadhead beyond FDP is excluded.',
   'H', 2,
   'SQ', 'P', 'S',
   NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003402, 7450001, 1,
   'tableHeader',
   'FLEET,COMPOSITION,FDP LOWER,FDP UPPER,MAX SECTORS',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003403, 7450001, 1,
   'tableRow1',
   '*,3P|4P,00:00,13:00,2',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003404, 7450001, 1,
   'tableRow2',
   '*,3P|4P,13:01,99:00,1',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003405, 7450001, 1,
   'table2Header',
   'COUNT DEADHEAD SECTORS,EXCLUDE FINAL DEADHEAD SECTORS',
   'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(
  id, rule_id, phase_id, param_names, param_values,
  modified_by, last_modified
)
VALUES
  (200003406, 7450001, 1,
   'table2Row1',
   'Y,N',
   'ROIS', CURRENT_TIMESTAMP);

-- 7460 法规
-- SQ mid-duty base turn restriction (Rule 7460)
-- Restricts duties that pass through crew base mid-duty when
-- the duty does not start or end at the base.

-- Optional backup
-- CREATE TABLE rule_backup_7460 LIKE rule;
-- INSERT INTO rule_backup_7460 SELECT * FROM rule;
-- CREATE TABLE rule_parameter_backup_7460 LIKE rule_parameter;
-- INSERT INTO rule_parameter_backup_7460 SELECT * FROM rule_parameter;

-- Insert rule definition
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES (7460001, 7460, '001', 'P', 'Restrict Mid Duty Base Turn', 'SQ', 'Duty', 'Table', 'Company', 'Restrict duties that pass through crew base mid-duty when the duty does not start or end at base', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- Parameters: restrict duty patterns where mid-duty base turns are enforced
-- Only rows with ACTIVE = 'Y' are loaded by the engine (others may hold comments).
-- Duty Start Station,Duty End Station,ACTIVE
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200003372, 7460001, 1, 'tableHeader', 'Duty Start Station,Duty End Station,ACTIVE', 'ROIS', CURRENT_TIMESTAMP);

-- Example of a comment/inactive row (ignored by backend)
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200003373, 7460001, 1, 'tableRow1', '*,!(SIN|KUL),N', 'ROIS', CURRENT_TIMESTAMP);

-- Active restriction
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (200003374, 7460001, 1, 'tableRow2', '!(SIN),!(SIN),Y', 'ROIS', CURRENT_TIMESTAMP);

-- 7356 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7356001, 7356, '001', 'R', 'Attributes Spacing in a Period', '5J', 'Roster', 'Table', 'Company', 'Attributes Spacing in a Period', 'S', 2, '5J', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003288, 7356001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Attributes A,Attributes B,Min Period,Unit', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003289, 7356001, 1, 'tableRow1', '*,*,*,*,LabelA,LabelB,30,CD', 'ROIS', CURRENT_TIMESTAMP);

-- 7357 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7357001, 7357, '001', 'R', 'Max Crew Roster Attributes in a Period', '5J', 'Roster', 'Table', 'Company', 'Max Crew Roster Attributes in a Period', 'S', 2, '5J', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003290, 7357001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Attribute List,Unique Day Attribute(Y/N),Period,Unit,Max Attributes', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003291, 7357001, 1, 'tableRow1', '*,*,*,*,LableA|LabelB,Y,93,CD,1', 'ROIS', CURRENT_TIMESTAMP);

-- 7302 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7302001, 7302, '001', 'R', 'Adjust Max FDP by Callout Standby', '5J', 'Roster', 'Table', 'Company', 'Adjust Max FDP by Callout Standby', 'S', 2, '5J', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003310, 7302001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Standby Assignment Groups,Standby Assignments,Threshold,Adjustment PCT', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003311, 7302001, 1, 'tableRow1', '*,*,*,*,*,ASBQ,04:00,100', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003312, 7302001, 1, 'tableRow2', '*,*,*,*,*,HSBQ,06:00,100', 'ROIS', CURRENT_TIMESTAMP);

-- 7325 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7325001, 7325, '001', 'R', 'Days Off Pattern In Month', 'PR', 'Roster', 'Table', 'Company', 'Days Off Pattern In Month', 'S', 2, 'PR', 'P', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003292, 7325001, 1, 'table1Header', 'Bases,Ranks,Fleets,Teams,Exclude Teams,Leave Assignment Groups,Leave Assignments,Days Off Assignment Groups,Days Off Assignments,Latest Debrief Before First DO,Earliest Brief After Last DO,Include Blank Days,Days In Month,Max Consecutive Working Days Btw DO,Spacing,Coverd Weekends', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003293, 7325001, 1, 'table1Row1', '*,*,*,*,*,LEA,*,DO,*,22:00,06:00,Y,*,6,2,Y', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003294, 7325001, 1, 'table2Header', 'Leave Days,Preferred DO Patterns,Exceptional DO Patterns', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003295, 7325001, 1, 'table2Row1', '1-4,2+2+2+2|3+1+3+1,1+3+3+1', 'ROIS', CURRENT_TIMESTAMP);

-- 7303 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7303001, 7303, '001', 'B', 'CBA Max DP Per Avergage BLH', 'PR', 'Duty', 'Table', 'Company', 'CBA Max DP Per Avergage BLH', 'H', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003378, 7303001, 1, 'tableHeader', 'Bases,Fleets,Duty Types,Avg BLH Range,Total BLH Range,Max DP', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003379, 7303001, 1, 'tableRow1', '*,*,*,08:00-11:00,*,14:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7462 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7462001, 7462, '001', 'P', 'Allowed Multi-Sector Duty For Freighter', 'SQ', 'Duty', 'Table', 'Company', 'Allowed Multi-Sector Duty For Freighter', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003408, 7462001, 1, 'tableHeader', 'Service Type,Segment Number In Duty,Allowed Sectors', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003409, 7462001, 1, 'tableRow1', 'F,2-99,SIN-CAN-SIN|SIN-BLR-SHJ|AMS-LHR-SHJ|JNB-NBO-AMS|SYD-MEL-AKL|SYD-AKL-MEL', 'ROIS', CURRENT_TIMESTAMP);

-- 7461 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7461001, 7461, '001', 'P', 'Deadhead and Positioning Restriction On Freight Aircraft', 'SQ', 'Duty', 'Table', 'Company', 'Deadhead and Positioning Restriction On Freight Aircraft', 'H', 2, 'SQ', 'P', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003410, 7461001, 1, 'tableHeader', 'Is Home Base,Deadhead And Positioning Assignments', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003411, 7461001, 1, 'tableRow1', 'Y,DHD', 'ROIS', CURRENT_TIMESTAMP);

-- 7463 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7463001, 7463, '001', 'P', 'Limit Swingback', 'SQ', 'Duty', 'Table', 'Company', 'Limit Swingback', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003412, 7463001, 1, 'tableHeader', 'Swingback TZ Diff,Same TZ Tolerance,Max Swingback', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003413, 7463001, 1, 'tableRow1', '03:00-99:00,00:00,1', 'ROIS', CURRENT_TIMESTAMP);

-- 7464 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7464001, 7464, '001', 'P', 'Limit Ground Transport Length', 'SQ', 'Duty', 'Table', 'Company', 'Limit Ground Transport Length', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003414, 7464001, 1, 'tableHeader', 'Service Type,Fleet Group,Flight Flags,Flight Assignments,Exception Flight Routes,Max Transport Length', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003415, 7464001, 1, 'tableRow1', '*,*,D,BUS|HSR|TRAIN,BSL-ZRH|AUH-DXB|AUH-DWC|FUK-NGS,02:30', 'ROIS', CURRENT_TIMESTAMP);

-- 3003 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (3003001, 3003, '001', 'P', 'Limit Departure/Arrival Station for Pairing', 'SQ', 'Duty', 'Table', 'Company', 'Limit Departure/Arrival Station for Pairing', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003416, 3003001, 1, 'tableHeader', 'Pairing Assignments,Bases', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003417, 3003001, 1, 'tableRow1', '*,SIN', 'ROIS', CURRENT_TIMESTAMP);


-- 7326 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7326001, 7326, '001', 'R', 'Earlies Brief Time Before or Latest Debrief Time After a Roster with Attribute', '5J', 'Roster', 'Table', 'Company', 'Earlies Brief Time Before or Latest Debrief Time After a Roster with Attribute', 'S', 2, '5J', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003418, 7326001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Attributes,Assignments,Before/After Assignments,Earliest Brief After Roster,Latest Debrief Before Roster', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003419, 7326001, 1, 'tableRow1', '*,*,*,*,VRC|SJI,FLY|MVO|MVP,FLY|MVO|MVP,06:00,22:00', 'ROIS', CURRENT_TIMESTAMP);

-- 7465 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7465001, 7465, '001', 'P', 'Minimum Scheduled Days Off at Base', 'SQ', 'Duty', 'Table', 'Company', 'Minimum Scheduled Days Off at Base', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003424, 7465001, 1, 'tableHeader', 'COP Length Range,Fleets,Service Type,Do Starts After,Min Days Off', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003425, 7465001, 1, 'tableRow1', '6-6,*,J,TRANSPORT,2', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003426, 7465001, 1, 'tableRow2', '7-7,*,J,TRANSPORT,3', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003427, 7465001, 1, 'tableRow3', '8-10,*,J,TRANSPORT,4', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003428, 7465001, 1, 'tableRow4', '11-13,*,J,TRANSPORT,5', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003429, 7465001, 1, 'tableRow5', '14-15,*,J,TRANSPORT,6', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003430, 7465001, 1, 'tableRow6', '16-18,*,J,TRANSPORT,7', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003431, 7465001, 1, 'tableRow7', '19-99,*,J,TRANSPORT,8', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003432, 7465001, 1, 'tableRow8', '5-6,*,F,TRANSPORT,2', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003433, 7465001, 1, 'tableRow9', '7-10,*,F,TRANSPORT,3', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003434, 7465001, 1, 'tableRow10', '11-13,*,F,TRANSPORT,4', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003435, 7465001, 1, 'tableRow11', '14-17,*,F,TRANSPORT,5', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003436, 7465001, 1, 'tableRow12', '18-99,*,F,TRANSPORT,8', null, 'ROIS', CURRENT_TIMESTAMP);


-- 7466 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7466001, 7466, '001', 'P', 'Extra Days Off at Base', 'SQ', 'Duty', 'Table', 'Company', 'Extra Days Off at Base', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003437, 7466001, 1, 'tableHeader', 'COP Length Range,Flight Numbers,Period Start Date,Period End Date,Do Starts After,Extra Days Off', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003438, 7466001, 1, 'tableRow1', '3-4,392,2024-06-05,2025-03-27,TRANSPORT,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003439, 7466001, 1, 'tableRow2', '7-7,392,2025-03-30,2035-12-31,TRANSPORT,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003440, 7466001, 1, 'tableRow3', '7-7,304,2024-04-07,2035-12-31,TRANSPORT,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003441, 7466001, 1, 'tableRow4', '1-7,34,2025-03-28,2025-10-23,TRANSPORT,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003442, 7466001, 1, 'tableRow5', '1-7,32,2024-03-30,2035-12-31,TRANSPORT,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003443, 7466001, 1, 'tableRow6', '5-5,36,2023-03-24,2035-12-31,TRANSPORT,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003444, 7466001, 1, 'tableRow7', '3-3,36,2023-03-24,2035-12-31,TRANSPORT,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003445, 7466001, 1, 'tableRow8', '1-7,24,2023-10-02,2035-12-31,TRANSPORT,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003446, 7466001, 1, 'tableRow9', '4-5,28,2025-05-29,2035-12-31,TRANSPORT,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003447, 7466001, 1, 'tableRow10', '6-6,338,2025-10-30,2025-11-09,TRANSPORT,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003448, 7466001, 1, 'tableRow11', '1-1,338,2025-11-24,2025-12-21,TRANSPORT,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003449, 7466001, 1, 'tableRow12', '3-3,32,2026-01-05,2026-03-01,TRANSPORT,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003450, 7466001, 1, 'tableRow13', '2-2,366,2026-03-29,2035-12-31,TRANSPORT,1', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7317 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7317001, 7317, '001', 'P', 'Planned Extension', '5J', 'Duty', 'Table', 'Company', 'Planned Extension ', 'H', 2, '5J', 'P', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003451, 7317001, 1, 'tableHeader', 'Acc States,Compositions,Duty Fleets,Duty Type,Departure Range,RPT Range,Landing Range,Rest Facility,Override Duty Attributes,BLH Range,WOCL Overlap Range,Max Sectors,Max FDP,Max Extension,Is Augment,Is Split', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003452, 7317001, 1, 'tableRow1', '*,*,*,*,06:00-18:00,05:00-07:00,1-99,1,*,*,*,99,12:00,02:00,N,*', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7327 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7327001, 7327, '001', 'R', 'Min Rest After a Base Change', '5J', 'Roster', 'Table', 'Company', 'Min Rest After a Base Change', 'H', 2, '5J', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003453, 7327001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Working Assignment Groups,Min Rest,Rest Type,Including Local Nights', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003454, 7327001, 1, 'tableRow1', '*,*,*,*,FLY|MVO|MVP|SBY,72,RH,3', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7480 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7480001, 7480, '001', 'R', 'Limit Duty Days Off', 'HX', 'Roster', 'Table', 'Company', 'Limit Duty Days Off', 'H', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 7480 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7480001, 7480, '001', 'R', 'Limit Duty Days Off', 'HX', 'Roster', 'Table', 'Company', 'Limit Duty Days Off', 'H', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003455, 7480001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding First Recovery 6 offset DO(Y/N),Min Consecutive DO,Min DO', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003456, 7480001, 1, 'tableRow1', '*,*,*,*,7,*,*,*,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003457, 7480001, 1, 'tableRow2', '*,*,*,*,7,N,Y,*,2,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003458, 7480001, 1, 'tableRow3', '*,*,*,*,7,Y,N,*,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003459, 7480001, 1, 'tableRow4', '*,*,*,*,7,Y,Y,*,*,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003460, 7480001, 1, 'tableRow5', '*,*,*,*,14,*,*,*,2,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003461, 7480001, 1, 'tableRow6', '*,*,*,*,28,*,*,Y,*,7', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003462, 7480001, 1, 'tableRow7', '*,*,*,*,84,*,*,*,*,24', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7467 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7467001, 7467, '001', 'P', 'Limit Rest Time Before/After/Between Flights', 'SQ', 'Duty', 'Table', 'Company', 'Limit Rest Time Before/After/Between Flights', 'H', 2, 'SQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003463, 7467001, 1, 'tableHeader', 'Type,Flight No A,Dep-Arr A,Flight No B,Dep-Arr B,Min Time Limit,Max Time Limit,Penalty,Active(Y/N),Comment', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003464, 7467001, 1, 'tableRow1', 'BEFORE,*,SHJ-BRU,*,*,*,*,0,N,', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003465, 7467001, 1, 'tableRow2', 'AFTER,11,LAX-NRT,*,*,15:00,*,0,N,Rest after LAX-NRT', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003466, 7467001, 1, 'tableRow3', 'AFTER,*,AMS-SHJ,*,*,10:00,*,0,Y,', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003467, 7467001, 1, 'tableRow4', 'AFTER,7366,SIN-HKG,*,*,10:00,*,0,Y,', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003468, 7467001, 1, 'tableRow5', 'AFTER,243,SIN-PER,*,*,12:00,*,0,Y,Layover in PER', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003469, 7467001, 1, 'tableRow6', 'AFTER,*,SIN-BNE,*,*,15:00,*,0,N,Rest in BNE before SBY', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003470, 7467001, 1, 'tableRow7', 'AFTER,878,*,*,*,12:00,*,0,N,TPE Layover', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003471, 7467001, 1, 'tableRow8', 'AFTER,*,SIN-PVG,*,*,12:00,*,3000,Y,PVG layover', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003472, 7467001, 1, 'tableRow9', 'AFTER,452,*,*,*,12:00,*,0,Y,MLE Layover', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003473, 7467001, 1, 'tableRow10', 'AFTER,422,*,*,*,12:00,*,500,Y,BOM Layover', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003474, 7467001, 1, 'tableRow11', 'BEFORE,*,HKG-ANC,*,*,10:00,*,0,Y,', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003475, 7467001, 1, 'tableRow12', 'BEFORE,*,BRU-SHJ,*,*,5:00,*,0,N,', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003476, 7467001, 1, 'tableRow13', 'BEFORE,*,SHJ-SIN,*,*,5:00,*,0,Y,', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003477, 7467001, 1, 'tableRow14', 'BEFORE,7343,AMS-SIN,*,*,10:00,*,0,N,', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003478, 7467001, 1, 'tableRow15', 'CONN,295,*,296,*,*,*,20,Y,SQ295-296 CXN', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003479, 7467001, 1, 'tableRow16', 'CONN,213,*,226,*,12:00,*,500,Y,PER Layover', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003480, 7467001, 1, 'tableRow17', 'CONN,308,*,321,*,*,*,50,N,', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003481, 7467001, 1, 'tableRow18', 'CONN,237,*,228,*,*,30:00:00,30,Y,SQ237-228 Pairing wo SBY', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003482, 7467001, 1, 'tableRow19', 'CONN,217,*,218,*,*,*,0,N,To force MEL 217 with 218 instead of 238 ', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003483, 7467001, 1, 'tableRow20', 'CONN,221,*,222,*,*,*,50,Y,221-222 SYD CXN', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003484, 7467001, 1, 'tableRow21', 'AFTER,*,AMS-SHJ,*,*,10:00,*,0,N,', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003485, 7467001, 1, 'tableRow22', 'AFTER,*,HKG-ANC,*,*,10:00,*,0,N,', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003486, 7467001, 1, 'tableRow23', 'CONN,227,*,238,*,*,30:00:00,30,Y,SQ227-238 Pairing wo SBY', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003487, 7467001, 1, 'tableRow24', 'CONN,211,*,242,*,*,*,150,Y,SQ211-242 Pairing wo SBY', null, 'ROIS', CURRENT_TIMESTAMP);


-- 6121 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (6121001, 6121, '001', 'R', 'Check Assignment Overlappable', 'QQ', 'Roster', 'Table', 'Company', 'Check Assignment Overlappable', 'H', 2, 'QQ', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003488, 6121001, 1, 'table1Header', 'Only Check Overlappable Table', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003489, 6121001, 1, 'table1Row1', 'N', null, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003490, 6121001, 1, 'table2Header', 'Bases,Ranks,Fleets,Teams,Assignments A,Assignment Groups A,Is Training A,Assignments B,Assignment Groups B,Is Training B', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(20000348791, 6121001, 1, 'table2Row1', '*,*,*,*,SIM,*,Y,*,DO,N', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7358 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7358001, 7358, '001', 'R', 'Check Max Fatigue Score', '5J', 'Roster', 'Table', 'Company', 'Check Max Fatigue Score', 'H', 2, '5J', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003492, 7358001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Max Duty Fatigue,Fatigue Discretion,Fatigue Discretion Attributes', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003493, 7358001, 1, 'tableRow1', '*,*,*,*,5.6,*,*', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7481 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7481001, 7481, '001', 'R', 'Redeye Definition', 'HX', 'Roster', 'Table', 'Company', 'Redeye Definition', 'H', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003494, 7481001, 1, 'table1Header', 'is Base(Y/N),PickUp Time Range,SCH FDP WOCL Start,SCH FDP WOCL End', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003495, 7481001, 1, 'table1Row1', 'Y,00:00-99:00,01:00,06:59', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003496, 7481001, 1, 'table1Row2', 'N,00:00-00:15,01:00,05:59', null, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003497, 7481001, 1, 'table2Header', 'TZ Diff,Duty Cycle in Unacclimatized State,is Recovery Location at Base(Y/N),TZ Diff Between Recovery Location and Base,Min DO,Min Consecutive Local Night Times,ACC State', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003498, 7481001, 1, 'table2Row1', 'Y,N,HSB|CSB', null, 'ROIS', CURRENT_TIMESTAMP);


-- 7482 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7482001, 7482, '001', 'R', 'Unacclimatised/Acclimatised Definition', 'HX', 'Roster', 'Table', 'Company', 'Unacclimatised/Acclimatised Definition', 'H', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003499, 7482001, 1, 'table1Header', 'TZ Diff,Return to Base Duration Range,ACC State', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003500, 7482001, 1, 'table1Row1', '00:00-03:00,*,A', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003501, 7482001, 1, 'table1Row2', '04:00-99:00,00:00-48:00,A', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003502, 7482001, 1, 'table1Row3', '04:00-99:00,48:01-999:00,U', null, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003503, 7482001, 1, 'table2Header', 'TZ Diff,Duty Cycle in Unacclimatized State,is Recovery Location at Base(Y/N),TZ Diff Between Recovery Location and Base,Min DO,Min Consecutive Local Night Times', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003504, 7482001, 1, 'table2Row1', '03:01-05:00,48:01-72:00,Y,*,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003505, 7482001, 1, 'table2Row2', '05:00-06:00,48:01-72:00,Y,*,1,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003506, 7482001, 1, 'table2Row3', '06:00-07:00,48:01-72:00,Y,*,2,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003507, 7482001, 1, 'table2Row4', '07:00-99:00,48:01-72:00,Y,*,2,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003508, 7482001, 1, 'table2Row5', '03:01-05:00,72:01-96:00,Y,*,3,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003509, 7482001, 1, 'table2Row6', '05:00-06:00,72:01-96:00,Y,*,3,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003510, 7482001, 1, 'table2Row7', '06:00-07:00,72:01-96:00,Y,*,3,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003511, 7482001, 1, 'table2Row8', '07:00-99:00,72:01-96:00,Y,*,3,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003512, 7482001, 1, 'table2Row9', '03:01-05:00,96:01-120:00,Y,*,3,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003513, 7482001, 1, 'table2Row10', '05:00-06:00,96:01-120:00,Y,*,4,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003514, 7482001, 1, 'table2Row11', '06:00-07:00,96:01-120:00,Y,*,4,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003515, 7482001, 1, 'table2Row12', '07:00-99:00,96:01-120:00,Y,*,4,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003516, 7482001, 1, 'table2Row13', '03:01-05:00,120:01-144:00,Y,*,3,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003517, 7482001, 1, 'table2Row14', '05:00-06:00,120:01-144:00,Y,*,4,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003518, 7482001, 1, 'table2Row15', '06:00-07:00,120:01-144:00,Y,*,5,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003519, 7482001, 1, 'table2Row16', '07:00-99:00,120:01-144:00,Y,*,5,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003520, 7482001, 1, 'table2Row17', '03:01-05:00,144:01-999:00,Y,*,3,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003521, 7482001, 1, 'table2Row18', '05:00-06:00,144:01-999:00,Y,*,4,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003522, 7482001, 1, 'table2Row19', '06:00-07:00,144:01-999:00,Y,*,5,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003523, 7482001, 1, 'table2Row20', '07:00-99:00,144:01-999:00,Y,*,6,*', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7372 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7372001, 7372, '001', 'B', 'Calculate DP of the Ground Duty more than 8 hours', 'TG', 'Duty', 'Table', 'Company', 'Calculate DP of the Ground Duty more than 8 hours', 'H', 2, 'TG', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003526, 7372001, 1, 'tableHeader', 'Assignments, Ground Offset,Rate,Ground Limit', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003527, 7372001, 1, 'tableRow1', 'TRG|GROUND|GT788|GT789|GT77E|GT77B|GT77W|GT777Y|GT35A|GT359|GT33R|GT320|GT734|GT788#|GT789#|GT77E#|GT77B#|GT77W#|GT777Y#|GT35A#|GT359#|GT33R#|GT320#|GT734#|GT787|GT787#|GT777|GT777#,01:00,1.0,08:00', 'ROIS', CURRENT_TIMESTAMP);


-- 7483 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7483001, 7483, '001', 'B', 'Standby FDP And Rest Definition', 'HX', 'Duty', 'Table', 'Company', 'Standby FDP And Rest Definition', 'H', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003528, 7483001, 1, 'tableHeader', 'Standby Assignments,Duty Within The Planned Standby,Call Out To Flight Gap Range,Actual FDP Calc Start,Actual FDP Calc End,Actual DP Calc Start,Actual DP Calc End,FDP Reporting Time Start,Actual Rest Calculate,Standby Ratio,Exclude SBY Window', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003529, 7483001, 1, 'tableRow1', 'HSB,Y,00:00-99:00,DutyStart,DutyEnd,DutyStart,DutyEnd,DutyStart,DutyRest,*,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003530, 7483001, 1, 'tableRow1', 'HSB,N,00:00-09:59,DutyStart,DutyEnd,DutyStart,DutyEnd,DutyStart,DutyRest+SBY,0.5,22:00-08:00', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003531, 7483001, 1, 'tableRow1', 'HSB,N,10:00-99:00,DutyStart,DutyEnd,DutyStart,DutyEnd,DutyStart,DutyRest,*,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003532, 7483001, 1, 'tableRow1', 'CSB,Y,00:00-99:00,StandbyDutyStart,DutyEnd,StandbyDutyStart,DutyEnd,StandbyDutyStart,SbyStart~DutyEnd,*,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003533, 7483001, 1, 'tableRow1', 'CSB,N,00:00-12:00,StandbyDutyStart,DutyEnd,StandbyDutyStart,DutyEnd,StandbyDutyStart,SbyStart~DutyEnd,*,*', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003534, 7483001, 1, 'tableRow1', 'CSB,N,12:00-99:00,DutyStart,DutyEnd,DutyStart,DutyEnd,DutyStart,DutyRest,*,*', 'ROIS', CURRENT_TIMESTAMP);

-- 7328 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7328001, 7328, '001', 'R', 'Credit Hours Calculation', 'PR', 'Roster', 'Table', 'Company', 'Credit Hours Calculation', 'H', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003535, 7328001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Assignments,is Position(Y/N),Training Roles,Percentage(%)', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003536, 7328001, 1, 'tableRow1', '*,*,*,*,FLY,*,*,100', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003537, 7328001, 1, 'tableRow2', '*,*,*,*,DHD,Y,*,50', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003538, 7328001, 1, 'tableRow3', '*,*,*,*,DHD,N,*,100', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003539, 7328001, 1, 'tableRow4', '*,*,*,*,SIM,*,IP,100', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7484 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7484001, 7484, '001', 'R', 'Duty FDP上限Acclimatised/Unacclimatised-7.10', 'HX', 'Duty', 'Table', 'Company', 'Duty FDP上限Acclimatised/Unacclimatised-7.10', 'H', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003540, 7484001, 1, 'table1Header', 'Compositions,Rpt Start,Rpt End,Duty Assignments,Landing Lower,Landing Upper,Max FDP', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003541, 7484001, 1, 'table1Row1', '2P,07:00,07:59,FLY,1,1,13:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003542, 7484001, 1, 'table1Row2', '2P,07:00,07:59,FLY,2,2,12:15', null, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003543, 7484001, 1, 'table2Header', 'Compositions,Preceding Rest Range,Duty Assignments,Landing Lower,Landing Upper,Max FDP', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003544, 7484001, 1, 'table2Row1', '2P,01:00-18:00,FLY,1,1,13:00', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7485 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7485001, 7485, '001', 'R', 'Duty FDP上限Acclimatised/Unacclimatised-7.10-Composition Requirement', 'HX', 'Duty', 'Table', 'Company', 'Duty FDP上限Acclimatised/Unacclimatised-7.10-Composition Requirement', 'H', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003546, 7485001, 1, 'table1Header', 'Composition,Rpt Start,Rpt End,Duty Assignments,Landing Lower,Landing Upper,Duty Blh Range,Sch Flt Window Range,Sector Blh Range,Composition Requirement', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003547, 7485001, 1, 'table1Row1', '2P,07:00,07:59,FLY,2,6,08:30-99:00,02:00-05:59,00:01-99:00,3P', null, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003548, 7485001, 1, 'table2Header', 'Composition,Preceding Rest Range,Duty Assignments,Landing Lower,Landing Upper,Duty Blh Range,Sector Blh Range,Composition Requirement', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003549, 7485001, 1, 'table2Row1', '2P,00:01-08:59,FLY,1,1,09:00-99:00,09:00-99:00,3P', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7232 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7232001, 7232, '001', 'R', 'Check Consecutive Roster', 'TI', 'Roster', 'Table', 'Company', 'Check Consecutive Roster', 'H', 2, 'IT', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003550, 7232001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Assignments,Assignment Groups,Attributes,Max Consecutive Roster,Consecutive Definition', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003551, 7232001, 1, 'tableRow1', '*,*,*,*,*,FLY,*,4,B', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7486 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7486001, 7486, '001', 'R', 'Limit Late Finish and Early Start for Red-Eye Duty', 'HX', 'Roster', 'Table', 'Company', 'Limit Late Finish and Early Start for Red-Eye Duty', 'H', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003552, 7486001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,ACC State,Consecutive Days,Allowed LNP Consecutive Times,LNP Times Range,Pre Min Rest,Pre LocalNight Times,Post Min Rest,Post LocalNight Times,Every Duty Max FDP Range,Exception Codes', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003553, 7486001, 1, 'tableRow1', '*,*,*,*,A,*,5,*,36:00,1,63:00,*,00:00-08:00,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003554, 7486001, 1, 'tableRow2', '*,*,*,*,A,*,4,*,36:00,1,63:00,*,00:00-08:00,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003555, 7486001, 1, 'tableRow3', '*,*,*,*,A,*,3,*,*,1,48:00,2,*,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003556, 7486001, 1, 'tableRow4', '*,*,*,*,A,*,2,*,*,1,*,*,*,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003557, 7486001, 1, 'tableRow5', '*,*,*,*,A,6,*,4-5,*,*,48:00,2,*,*', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7359 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7359001, 7359, '001', 'R', 'Standard FDP Extension Rest requirement', '5J', 'Roster', 'Table', 'Company', 'Standard FDP Extension Rest requirement', 'H', 2, '5J', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003558, 7359001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Compositions,Override Duty Attributes,Extended Rest Distribution,Rest Extention', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003559, 7359001, 1, 'tableRow1', '*,*,*,*,*,*,*,04:00', null, 'ROIS', CURRENT_TIMESTAMP);


-- 7487 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7487001, 7487, '001', 'R', 'Max Durition From Standby To Flight Duty End', 'HX', 'Roster', 'Table', 'Company', 'Max Durition From Standby To Flight Duty End', 'H', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (200003561, 7487001, 1, 'tableHeader', 'Standby Assignments,Flight Within The Planned Standby,Call Out To Flight Gap Range,Max Durition From Standby To Flight Duty End', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003562, 7487001, 1, 'tableRow1', 'HSB,Y,00:00-99:00,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003563, 7487001, 1, 'tableRow2', 'HSB,N,00:00-09:59,23:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003564, 7487001, 1, 'tableRow3', 'HSB,N,10:00-99:00,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003565, 7487001, 1, 'tableRow4', 'CSB,Y,00:00-99:00,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003566, 7487001, 1, 'tableRow5', 'CSB,N,00:00-11:59,23:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(200003567, 7487001, 1, 'tableRow6', 'CSB,N,12:00-99:00,*', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7360 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7360001, 7360, '001', 'B', 'Aircraft Change Alert', 'PR', 'Duty', 'Table', 'Company', 'Aircraft Change Alert', 'S', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300247, 7360001, 1, 'tableHeader', 'Current Assignments,Next Assignments,Check Level(D/P)', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300248, 7360001, 1, 'tableRow1', 'FLY|DHD,FLY|DHD,D', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7488 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7488001, 7488, '001', 'R', 'Min Rest Post Duty', 'HX', 'Roster', 'Table', 'Company', 'Min Rest Post Duty', 'H', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300249, 7488001, 1, 'table1Header', 'TZ Diff Range,ACC State,Unacc Away From Base Duration,Compare With Pre Duty DP(Y/N),Standard Min Rest,Physiological Rest(Y/N),Physiological Rest Time Zone(Base/Local)', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300250, 7488001, 1, 'table1Row1', '01:00-05:00,*,*,Y,12:00,N,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300251, 7488001, 1, 'table1Row2', '06:00-12:00,U,00:00-72:00,Y,14:00,Y,Base', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300252, 7488001, 1, 'table1Row3', '06:00-12:00,U,72:00-999:00,Y,14:00,Y,Local', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300253, 7488001, 1, 'table1Row4', '*,*,*,Y,12:00,N,*', null, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300284, 7488001, 1, 'table2Header', 'Min Rest Range,Hotel Min Rest', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300285, 7488001, 1, 'table2Row1', '12:00-12:00,10:00', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7361 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7361001, 7361, '001', 'R', 'Check Days Off', '5J', 'ROSTER', 'Table', 'Company', 'Check Days Off', 'S', 2, '5J', 'P', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300254, 7361001, 1, 'table1Header', 'Consecutive Days,Duration,Local Nights,Home Base,Include Blank Day,Include Layover Rest,Include Pairing Base Rest,Days Off Assignment Groups,Days Off Assignments', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300255, 7361001, 1, 'table1Row1', '1-2,36:00,2,Y,Y,Y,Y,DO,*', null, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300256, 7361001, 1, 'table2Header', 'Leave Assignment Groups,Leave Assignments,Leave Days,Min Days Off,Check Period', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300257, 7361001, 1, 'table2Row1', 'LVE,*,8,3,RP', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7489 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7489001, 7489, '001', 'R', 'Limit Consecutive Day Min Rest', 'HX', 'Roster', 'Table', 'Company', 'Limit Consecutive Day Min Rest', 'H', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300258, 7489001, 1, 'tableHeader', 'Consecutive Days,ACC State,Rest Assignment Groups,Rest Duration,is Physiological Rest Included in Count statistics(Y/N),Max Consecutive Rest Duration Times,Max Total Rest Duration Times', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300259, 7489001, 1, 'tableRow1', '14,U,REST|DO|AL,18:00-30:00,N,3,4', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7362 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7362001, 7362, '001', 'B', 'Only One Entry in a Pairing to a Certain Area', 'PR', 'Duty', 'Table', 'Company', 'Only One Entry in a Pairing to a Certain Area', 'S', 2, 'PR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300260, 7362001, 1, 'tableHeader', 'Pairing Bases,Airport Area,Entry Times', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300261, 7362001, 1, 'tableRow1', 'MNL|CEB,CGY|BXU,1', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7500法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7500001, 7500, '001', 'R', 'Basic definition of Acc State', 'Duty', 'Duty', 'MultiTable', 'Company', 'Basic definition of Acc State', 'H', 2, 'F8', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208300262, 7500001, 1, 'table1Header', 'TZ Diff,Stay Duration', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208300263, 7500001, 1, 'table1Row1', '00:00-04:00,72:00-96:00', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208300264, 7500001, 1, 'table1Row2', '04:00-24:00,96:00-999:00', NULL, 'ROIS', CURRENT_TIMESTAMP);


INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208300265, 7500001, 1, 'table2Header', 'Stay Duration per X Hours,ACC Time Zone Adjust X Hours', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208300266, 7500001, 1, 'table2Row1', '24:00,01:00', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 7501法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7501001, 7501, '001', 'R', 'Limit Single Day Free From Duty Rolling Days', 'Rest', 'Duty', 'MultiTable', 'Company', 'Limit Single Day Free From Duty Rolling Days', 'H', 2, 'F8', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208300267, 7501001, 1, 'table1Header', 'Bases,Ranks,Fleets,Teams,Period,Unit,Duty End Buffer,Min Limits', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208300268, 7501001, 1, 'table1Row1', '*,*,*,*,7,CD,00:30,1', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208300269, 7501001, 1, 'table1Row2', '*,*,*,*,28,CD,00:30,4', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 7504 法规 - Check Min Space Between Duty for F8 (no prev/next duty local time windows)
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7504001, 7504, '001', 'R', 'Min Rest Between Duties (F8)', 'Rest', 'Roster', 'Table', 'Company', 'Min Rest Between Duties for Flair (F8)', 'S', 2, 'F8', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300296, 7504001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Prev Assignment Groups,Next Assignment Groups,Prev Assignments,Next Assignments,Prev Attributes,Next Attributes,Apply Prelabelled Attributes,Utilize Post Rest,Level,Min Period,Unit', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300297, 7504001, 1, 'tableRow1', '*,*,*,*,FLY,FLY,*,*,*,*,Y,Y,*,18,RH', 'ROIS', CURRENT_TIMESTAMP);

-- 7363 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7363001, 7363, '001', 'B', 'Inexperienced crew and green line indication', '5J', 'Crew', 'Table', 'Company', 'Inexperienced crew and green line indication', 'S', 2, '5J', 'P', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300270, 7363001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Airport List,BLH Range,Min Airport Operating,Min Operating Leg', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300271, 7363001, 1, 'tableRow1', '*,*,*,*,MNL,100:00-999:00,5,20', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7358法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES(7358001, 7358, '001', 'R', 'Check Max Fatigue Score', '5J', 'Roster', 'Table', 'Company', 'Check Max Fatigue Score', 'H', 2, '5J', 'P', 'U', NULL, 'ROIS', '2026-02-27 17:16:25');

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)VALUES(208300272, 7358001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Max Duty Fatigue,Fatigue Discretion,Fatigue Discretion Attributes', NULL, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)VALUES(208300273, 7358001, 1, 'tableRow1', '*,*,*,*,5.6,*,*', NULL, 'ROIS', '2026-02-27 17:16:25');

-- 7364 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7364001, 7364, '001', 'B', 'Check Inexperienced crew and green line indication', '5J', 'Crew', 'Table', 'Company', 'Check Inexperienced crew and green line indication', 'S', 2, '5J', 'P', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300275, 7364001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Routes,Assignment Groups,Assignments,Airports Categories,Max Inexperience Crews', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300276, 7364001, 1, 'tableRow1', '*,*,*,*,*,*,*,*,2', null, 'ROIS', CURRENT_TIMESTAMP);

-- 2126法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (2126001, 2126, '001', 'R', 'Check Min Rest Post Ground Roster', 'EVA', 'Rest', 'Table', 'Company', 'Check Min Rest Post Ground Roster', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300278, 2126001, 1, 'tableHeader', 'Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300279, 2126001, 1, 'tableRow1', 'GND', 'ROIS', CURRENT_TIMESTAMP);


-- 7490法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7490001, 7490, '001', 'R', 'Max FDP Extension For FD', 'HX', 'FDP', 'Table', 'Company', 'Max FDP Extension For FD', 'H', 2, 'HX', 'P', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300280, 7490001, 1, 'tableHeader', 'Composition,Pre Rest Duration,Single Fly Sector BLH Range,Rest Facility,Total In-flight Rest Duration,Min Concurrent Crew On Board,Max Continuous Working Time,Max Working Time,Extend FDP Pct,Max FDP,Each Additional Fly Sector Max FDP Reduced HRS', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300281, 7490001, 1, 'tableRow1', '3P,34:00-99:00,10:00-16:00,*,*,*,*,*,1/3,14:45,00:45', 'ROIS', CURRENT_TIMESTAMP);

-- 7491法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7491001, 7491, '001', 'R', 'Max FDP Extension For CC', 'HX', 'FDP', 'Table', 'Company', 'Max FDP Extension For CC', 'H', 2, 'HX', 'C', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300282, 7491001, 1, 'tableHeader', 'Composition,Pre Rest Duration,Single Fly Sector BLH Range,Rest Facility,Total In-flight Rest Duration,Min Concurrent Crew On Board,Min Concurrent Crew At Landing,Max Working Time,Extend FDP Pct,Max FDP,Each Additional Fly Sector Max FDP Reduced HRS', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300283, 7491001, 1, 'tableRow1', '3P,34:00-99:00,10:00-16:00,*,*,*,*,*,1/3,14:45,00:45', 'ROIS', CURRENT_TIMESTAMP);

-- 7492法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7492001, 7492, '001', 'R', 'Max FDP Extension For Split Duty', 'HX', 'FDP', 'Table', 'Company', 'Calculate Max FDP extension for split duty based on LT rest time', 'H', 2, 'HX', 'C', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300287, 7492001, 1, 'tableHeader', 'Compositions,LT Rest Threadhold,LT Rest Ratio', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300288, 7492001, 1, 'tableRow1', '*,06:00,0.5', 'ROIS', CURRENT_TIMESTAMP);

-- 7502 法规 - Calculate Credit Hours for CARS
-- Credit Hours Calculation for CARS based on minimum credit, flight time ratio, and duty period ratio
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES (7502001, 7502, '001', 'R', 'The Calculation of Credit Hours', 'CARS', 'Roster', 'Table', 'Company', 'The Calculation of Credit Hours', 'S', 2, 'F8', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
VALUES (208300289, 7502001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Assignment Groups,Assignments,Minimum CH,FT Ratio,DP Ratio,Split Method(SPAN/START)', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
VALUES(208300290, 7502001, 1, 'tableRow1', '*,*,*,*,DO|LO|LEA|SBY,*,04:00,*,*,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
VALUES(208300291, 7502001, 1, 'tableRow2', '*,*,*,*,FLY,*,*,1.0,*,*', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
VALUES(208300292, 7502001, 1, 'tableRow3', '*,*,*,*,GND,*,*,*,0.5,*', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7365 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7365001, 7365, '001', 'R', 'Check Legal Days Off', '5J', 'ROSTER', 'Table', 'Company', 'Check Legal Days Off', 'S', 2, '5J', 'P', 'U', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300293, 7365001, 1, 'table1Header', 'Days Off Assignment Groups,Days Off Assignments,Day Off Duration,Local Nights,Additional Day Off Duration,Additional Day Off Local Night,Include Blank Day,Include Layover Rest,Include Pairing Base Rest', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300294, 7365001, 1, 'table1Row1', 'DO,*,36:00,2,*,*,Y,Y,Y', null, 'ROIS', CURRENT_TIMESTAMP);

-- [EVAFD] mantis 0012237: CR--訓練需要新的法規偵測出符合定義中的ULR航班，不得在升訓機長IOE最後phase作為訓練
-- 7279 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7279001, 7279, '001', 'B', 'Limit ULR on Training Flights', 'EVAFD', 'Training', 'Table', 'Company', 'Limit ULR on Training Flights', 'H', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300295, 7279001, 1, 'tableHeader', 'Footprint Types,Footprint Subtypes,IOE Phase,Course Codes,Routes', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300296, 7279001, 1, 'tableRow1', '*,*,*,*,*', 'ROIS', CURRENT_TIMESTAMP);

-- 8107 法规 - Roster FDP Merge
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES (8107001, 8107, '001', 'R', 'Roster FDP Merge', 'Company', 'Roster', 'Table', 'Company', 'Merge FDP/DP Between Overlapped Rosters', 'S', 2, 'BR', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (208300298, 8107001, 1, 'tableHeader', 'Assignment Group A,Assignment Group B,Qualifier A,Qualifier B,Is Merge Fdp,Merge Fdp Logic,Is Merge Dp,Merge Dp Logic,Group Gap Range', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
VALUES (208300299, 8107001, 1, 'tableRow1', '*,*,*,*,Y,DUTYBLOCK,Y,DUTYBLOCK,*', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7373 法规：Calculate Ground Roster Min Rest For 5J
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7373001, 7373, '001', 'R', 'Calculate Ground Roster Min Rest For 5J', '5J', 'Rest', 'Table', 'Company', 'Calculate Ground Roster Min Rest For 5J', 'S', 2, '5J', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300300, 7373001, 1, 'tableHeader', 'Assignment Groups,Assignments,Min Rest', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208300301, 7373001, 1, 'tableRow1', 'GND,GND,04:00', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7387 娉曡锛欳heck Standby Callout Duration For 5J
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7387001, 7387, '001', 'R', 'Check Standby Callout Duration For 5J', '5J', 'Roster', 'Table', 'Company', 'Check Standby Callout Duration For 5J', 'H', 2, '5J', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300302, 7387001, 1, 'tableHeader', 'Standby Assignment Groups,Call Out Assignments,Max Duration', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208300303, 7387001, 1, 'tableRow1', '*,HSB,18:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208300304, 7387001, 1, 'tableRow2', '*,ASB,16:00', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7374 法规：Calculate Max FDP By Callout For 5J
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7374001, 7374, '001', 'R', 'Calculate Max FDP By Callout For 5J', '5J', 'Roster', 'Table', 'Company', 'Calculate Max FDP By Callout For 5J', 'S', 2, '5J', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300305, 7374001, 1, 'tableHeader', 'Assignment Groups,Standby Start Range,Standby Overlap Range,Standby Length Threshold', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES (208300306, 7374001, 1, 'tableRow1', 'HSB,23:00-07:00,23:00-07:00,06:00', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7493 法规：Limit Consecutive Days Off in Period（一个日历月最少N次连续X个DDO/DO）
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) 
VALUES (7493001, 7493, '001', 'R', 'Limit Consecutive Days Off in Period', 'HX', 'Roster', 'Table', 'Company', 'Limit Consecutive Days Off in Period', 'S', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) 
VALUES (208300307, 7493001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Consecutive Days Off,Period,Unit,Min Times,Max Times', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) 
VALUES(208300308, 7493001, 1, 'tableRow1', '*,*,*,*,3,1,CM,3,4', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 7494 法规：Limit Fleet Sector By Qualification（只检查 Qualification 生效窗口内的目标机队 sector 数）
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified)
VALUES (7494001, 7494, '001', 'R', 'Limit Fleet Sector By Qualification', 'HX', 'Roster', 'Table', 'Company', 'Limit Fleet Sector By Qualification', 'S', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified)
VALUES (208300309, 7494001, 1, 'tableHeader', 'Bases,Ranks,Fleet,Crew Teams,Qualifications,After Qual EffDt Days,Flight Fleets,Min Fly Sectors', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified)
VALUES(208300310, 7494001, 1, 'tableRow1', '*,*,*,*,CHECKA330,30,330,10', NULL, 'ROIS', CURRENT_TIMESTAMP);

-- 7495 法规:Limit Pre/Post Days Off for Consecutive Duty
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7495001, 7495, '001', 'R', 'Limit Pre/Post Days Off for Consecutive Duty', 'HX', 'Roster', 'Table', 'Company', 'Limit Pre/Post Days Off for Consecutive Duty', 'S', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300311, 7495001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Assignment Groups,Assignments,Attributes,Consecutive Days Range,Min Pre Days Off,Min Post Days Off', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300312, 7495001, 1, 'tableRow1', '*,*,*,*,HSB,*,*,3-*,*,2', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300313, 7495001, 1, 'tableRow2', '*,*,*,*,*,ABL,*,7-13,1,1', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300314, 7495001, 1, 'tableRow3', '*,*,*,*,*,ABL,*,14-*,2,2', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7496 法规:Limit Minimum Working Days Between Assignments
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7496001, 7496, '001', 'R', 'Limit Minimum Working Days Between Assignments', 'HX', 'Roster', 'Table', 'Company', 'Limit Minimum Working Days Between Assignments', 'S', 2, 'HX', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300315, 7496001, 1, 'tableHeader', 'Consecutive Assignment Group A,Consecutive Assignment A,Consecutive Assignment Group B,Consecutive Assignment B,Directional(Y/N),Min Working Days,Working Assignment Group,Working Assignments,Count Blank Day(Y/N)', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300316, 7496001, 1, 'tableRow1', 'LEA,*,LEA,*,N,3,FLY|GND,*,Y', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7388 法规：Course Allowed Weekdays
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7388001, 7388, '001', 'R', 'Course Allowed Weekdays', '5J', 'Roster', 'Table', 'Company', 'Course Allowed Weekdays', 'S', 2, '5J', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300317, 7388001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300318, 7388001, 1, 'tableRow1', '*,*,*,*,TRAINING', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7389 法规:Training Consecutive Days Rest
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7389001, 7389, '001', 'R', 'Training Consecutive Days Rest', '5J', 'Roster', 'Table', 'Company', 'Training consecutive days rest requirement', 'S', 2, '5J', 'P', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300319, 7389001, 1, 'tableHeader', 'Bases,Ranks,Fleets,Teams,Type', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300320, 7389001, 1, 'tableRow1', '*,*,*,*,TRAINING', null, 'ROIS', CURRENT_TIMESTAMP);

-- 7029 法规
INSERT INTO rule(id, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, modified_by, last_modified) VALUES (7029001, 7029, '001', 'R', 'FDP Extension with in-flight rest', 'TG', 'FDP', 'Table', 'Company', 'FDP extension with in-flight rest for cabin crew', 'S', 2, 'TG', 'C', 'S', NULL, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300321, 7029001, 1, 'table1Header', 'Acc State,Sectors Range,Rest Facility,Override Duty Attributes,In-flight Rest Range,Group,Max FDP,Min Rest', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300322, 7029001, 1, 'table1Row1', 'D|B,1-1,1,*,01:30-01:45,2,14:30,14:00', null, 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300323, 7029001, 1, 'table1Row2', 'D|B,1-1,1,*,01:45-02:00,2,15:00,14:00', null, 'ROIS', CURRENT_TIMESTAMP);

INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, modified_by, last_modified) VALUES (208300324, 7029001, 1, 'table2Header', 'Flight Numbers,Fleets,Take Off Time,Landing Time,Service Time', 'ROIS', CURRENT_TIMESTAMP);
INSERT INTO rule_parameter(id, rule_id, phase_id, param_names, param_values, param_extra, modified_by, last_modified) VALUES(208300325, 7029001, 1, 'table2Row1', '*,*,00:30,00:30,01:00', null, 'ROIS', CURRENT_TIMESTAMP);COMMIT;

-- id max 208300326