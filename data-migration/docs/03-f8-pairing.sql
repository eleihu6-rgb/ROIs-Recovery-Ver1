-- -- 从f8 pairing 表导入 pairing 和 flight -- --

-- 更新导数据用自定义函数，取id值
update sequence s set s.current_val=IFNULL((select max(id) from roster), 0)  where s.seq_name='ROSTER_SEQ';
select nextval('ROSTER_SEQ');
update sequence s set s.current_val=IFNULL((select max(id) from roster_flight), 0)  where s.seq_name='ROSTER_FLIGHT_SEQ';
select nextval('ROSTER_FLIGHT_SEQ');
update sequence s set s.current_val=IFNULL((select max(id) from roster_ground), 0)  where s.seq_name='ROSTER_GROUND_SEQ';
select nextval('ROSTER_GROUND_SEQ');
update sequence s set s.current_val=IFNULL((select max(id) from pairing), 0)  where s.seq_name='PAIRING_SEQ';
select nextval('PAIRING_SEQ');
update sequence s set s.current_val=IFNULL((select max(id) from pairing_duty), 0)  where s.seq_name='PAIRING_DUTY_SEQ';
select nextval('PAIRING_DUTY_SEQ');
update sequence s set s.current_val=IFNULL((select max(id) from pairing_duty_node), 0)  where s.seq_name='PAIRING_DUTY_NODE_SEQ';
select nextval('PAIRING_DUTY_NODE_SEQ');
update sequence s set s.current_val=IFNULL((select max(id) from pairing_composition), 0)  where s.seq_name='PAIRING_COMP_SEQ';
select nextval('PAIRING_COMP_SEQ');
update sequence s set s.current_val=IFNULL((select max(id) from pairing_duty_segment), 0)  where s.seq_name='PAIRING_SEG_SEQ';
select nextval('PAIRING_SEG_SEQ');
update sequence s set s.current_val=IFNULL((select max(id) from flight), 0) where s.seq_name='FLT_SEQ';
select nextval('FLT_SEQ');
update sequence s set s.current_val=IFNULL((select max(id) from flight_composition), 0)  where s.seq_name='FLT_COMP_SEQ';
select nextval('FLT_COMP_SEQ');


-- 一个pairing 同时存在P和C的情况，先临时处理
select pc.* from f8_pairingcompositions pc where pc.pairingId in (
SELECT pairingId
FROM f8_pairingcompositions
GROUP BY pairingId
HAVING COUNT(DISTINCT division) = 2
);


INSERT INTO f8_pairing
(airline, base, credit_mn, fleet, label, pairingId, pairing_dt, sch_end_dt_utc, sch_str_dt_utc, id)
SELECT airline, base, credit_mn, fleet, label, nextval('WARN_SEQ'), pairing_dt, sch_end_dt_utc, sch_str_dt_utc, pairingId
	FROM f8_pairing p where p.pairingId in (107712,107848,109944);

INSERT INTO f8_pairingduty
(act_end_dt_utc, act_str_dt_utc, arr_arp, `assignment`, credit_min, duty_id, duty_seq, pairing_id, str_arp, id)
select act_end_dt_utc, act_str_dt_utc, arr_arp, `assignment`, credit_min, nextval('WARN_SEQ'), duty_seq, fp.pairingId, str_arp, duty_id
	from f8_pairingduty p inner join f8_pairing fp on fp.id=p.pairing_id where p.pairing_id in (107712,107848,109944);

INSERT INTO f8_pairingdutynodes
(airport, duty_id, end_utc, node, pairing_id, `sequence`, start_utc, `type`)
select airport, pd.duty_id, end_utc, node, pd.pairing_id, `sequence`, start_utc, `type` 
	from f8_pairingdutynodes p inner join f8_pairingduty pd on pd.id = p.duty_id where p.pairing_id in (107712,107848,109944);

INSERT INTO f8_pairingdutysegments
(pairingId, act_end_dt_utc, act_str_dt_utc, airline, arv_arp, `assignment`, dep_arp, duty_id, duty_seq, fleet, flt_dt, flt_id, flt_num, seg_seq)
select pd.pairing_id, p.act_end_dt_utc, p.act_str_dt_utc, airline, arv_arp, p.`assignment`, dep_arp, pd.duty_id, p.duty_seq, fleet, flt_dt, flt_id, flt_num, seg_seq 
from f8_pairingdutysegments p inner join f8_pairingduty pd on pd.id = p.duty_id where p.pairingId in (107712,107848,109944);

update f8_pairingcompositions pc set pc.pairingId=(select pairingId from f8_pairing p where p.id=pc.pairingId) where pc.pairingId in (107712,107848,109944) and pc.division='C';
-- 一个pairing 同时存在P和C的情况，先临时处理


-- 检查导入数据源，是否存在数据缺失
select * from f8_pairing p where p.pairingId not in (select pc.pairingId from f8_pairingcompositions pc );
select * from f8_pairing p where p.pairingId not in (select pd.pairing_id from  f8_pairingduty pd );
select * from f8_pairing p where p.pairingId not in (select pd.pairing_id from  f8_pairingdutynodes pd );
select * from f8_pairing p where p.pairingId not in (select pd.pairingId from  f8_pairingdutysegments pd );
-- 检查导入数据源，是否存在数据缺失

-- 开始导入Pairing 数据

-- nextval('PAIRING_SEQ')
INSERT INTO pairing
(id, ver, pairing_dt, label, filiale, division, base, sch_str_dt_utc, sch_end_dt_utc, assignment_group, `assignment`, `attributes`, fleet, duration_days, tafb, comments, preference, rank_comb_criteria_id, is_deleted, scenario_id, 
	rank_comb_c9a_p, rank_comb_c9a_c, rank_comb_c9a_a, live_id, created_by, created_dt, modified_by, last_modified, act_str_dt_utc, act_end_dt_utc, interface_id)
SELECT nextval('PAIRING_SEQ'), 0, p.pairing_dt, p.label, 'F8', (select distinct division from f8_pairingcompositions pc where pc.pairingId=p.pairingId) as division, p.base, p.sch_str_dt_utc, p.sch_end_dt_utc, 'FLY', 'FLY', '', p.fleet, 0, 0, null, null, 0, 0, 0, 0, 0, 0, 0, 'ZY_IMP', now(), 'ZY_IMP', now(), p.sch_str_dt_utc, p.sch_end_dt_utc, p.pairingId
FROM f8_pairing p ;

-- nextval('PAIRING_COMP_SEQ')
INSERT INTO pairing_composition
(id, scenario_id, pairing_id, division, modified_by, is_deleted, last_modified, acting_rank, plan_value)
select nextval('PAIRING_COMP_SEQ'), 0, p.id, pc.division, 'ZY_IMP', 0, now(), pc.acting_rank, pc.plan_value 
from f8_pairingcompositions pc inner join pairing p on p.interface_id = pc.pairingId;

-- nextval('PAIRING_DUTY_SEQ')
INSERT INTO pairing_duty
(id, pairing_id, duty_seq, hotel_id, is_deleted, `assignment`, fdp_discretion_min, max_fdp_min, scenario_id, is_manual_modify, created_by, created_dt, modified_by, last_modified, min_rest_min, act_rest_min, act_str_dt_utc, act_end_dt_utc, 
str_arp, end_arp, layover_nits, plan_flight_min, plan_fdp_min, actual_duty_minutes, credited_minutes, comments)
select nextval('PAIRING_DUTY_SEQ'), p.id, pd.duty_seq, 0, 0, CASE 
        WHEN pd.`assignment` = 'Reserve' THEN 'SBY'
        WHEN pd.`assignment` = 'Training' THEN 'GRD'
        WHEN pd.`assignment` = 'FLIGHT'  THEN 'FLY'
        WHEN pd.`assignment` = 'Transport'  THEN 'DHD'
        ELSE pd.`assignment`
    END AS `assignment`, 0,0, 0, 0, 'ZY_IMP', now(), 'ZY_IMP', now(), 0, 0, pd.act_str_dt_utc,pd.act_end_dt_utc,pd.str_arp, pd.arr_arp, 0, 0, 0, 0, pd.credit_min, pd.duty_id
from f8_pairingduty pd inner join pairing p on p.interface_id = pd.pairing_id;

-- pickup 
INSERT INTO pairing_duty_node
(id, pairing_id, duty_id, `sequence`, `type`, node, from_segment_id, to_segment_id, group_id, airport, start_utc, end_utc, scenario_id, modified_by, last_modified, is_manual_modify)
select nextval('PAIRING_DUTY_NODE_SEQ'), pd.pairing_id, pd.id, 1, 'DUTY', 'PICKUP', 0, 0, 1, pdn.airport, pdn.start_utc, pdn.start_utc, 0, 'ZY_IMP', now(), 0
from f8_pairingdutynodes pdn inner join pairing_duty pd on pd.comments = pdn.duty_id And  pdn.node='CheckIn';

-- brief
INSERT INTO pairing_duty_node
(id, pairing_id, duty_id, `sequence`, `type`, node, from_segment_id, to_segment_id, group_id, airport, start_utc, end_utc, scenario_id, modified_by, last_modified, is_manual_modify)
select nextval('PAIRING_DUTY_NODE_SEQ'), pd.pairing_id, pd.id, 2, 'DUTY', 'BRIEF', 0, 0, 1, pdn.airport, pdn.start_utc, pdn.end_utc, 0, 'ZY_IMP', now(), 0
from f8_pairingdutynodes pdn inner join pairing_duty pd on pd.comments = pdn.duty_id And  pdn.node='CheckIn';

-- debrief
INSERT INTO pairing_duty_node
(id, pairing_id, duty_id, `sequence`, `type`, node, from_segment_id, to_segment_id, group_id, airport, start_utc, end_utc, scenario_id, modified_by, last_modified, is_manual_modify)
select nextval('PAIRING_DUTY_NODE_SEQ'), pd.pairing_id, pd.id, 3, 'DUTY', 'DEBRIEF', 0, 0, 1, pdn.airport, pdn.start_utc, pdn.end_utc, 0, 'ZY_IMP', now(), 0
from f8_pairingdutynodes pdn inner join pairing_duty pd on pd.comments = pdn.duty_id And  pdn.node='CheckOut';

-- dropoff
INSERT INTO pairing_duty_node
(id, pairing_id, duty_id, `sequence`, `type`, node, from_segment_id, to_segment_id, group_id, airport, start_utc, end_utc, scenario_id, modified_by, last_modified, is_manual_modify)
select nextval('PAIRING_DUTY_NODE_SEQ'), pd.pairing_id, pd.id, 4, 'DUTY', 'DROPOFF', 0, 0, 1, pdn.airport, pdn.start_utc, pdn.end_utc, 0, 'ZY_IMP', now(), 0
from f8_pairingdutynodes pdn inner join pairing_duty pd on pd.comments = pdn.duty_id And  pdn.node='CheckOut';

-- 补充存在缺失pairing_duty_node 数据
-- pickup 4
INSERT INTO pairing_duty_node
(id, pairing_id, duty_id, `sequence`, `type`, node, from_segment_id, to_segment_id, group_id, airport, start_utc, end_utc, scenario_id, modified_by, last_modified, is_manual_modify)
select nextval('PAIRING_DUTY_NODE_SEQ'), pd.pairing_id, pd.id, 1, 'DUTY', 'PICKUP', 0, 0, 1, pd.str_arp, pd.act_str_dt_utc, pd.act_str_dt_utc, 0, 'ZY_IMP', now(), 0
from pairing_duty pd where pd.id not in (select p.duty_id from pairing_duty_node p where p.node='PICKUP' );

-- brief 4
INSERT INTO pairing_duty_node
(id, pairing_id, duty_id, `sequence`, `type`, node, from_segment_id, to_segment_id, group_id, airport, start_utc, end_utc, scenario_id, modified_by, last_modified, is_manual_modify)
select nextval('PAIRING_DUTY_NODE_SEQ'), pd.pairing_id, pd.id, 2, 'DUTY', 'BRIEF', 0, 0, 1, pd.str_arp, pd.act_str_dt_utc, pd.act_str_dt_utc, 0, 'ZY_IMP', now(), 0
from pairing_duty pd where pd.id not in (select p.duty_id from pairing_duty_node p where p.node='BRIEF' );

INSERT INTO pairing_duty_node
(id, pairing_id, duty_id, `sequence`, `type`, node, from_segment_id, to_segment_id, group_id, airport, start_utc, end_utc, scenario_id, modified_by, last_modified, is_manual_modify)
select nextval('PAIRING_DUTY_NODE_SEQ'), pd.pairing_id, pd.id, 3, 'DUTY', 'DEBRIEF', 0, 0, 1, pd.end_arp, pd.act_end_dt_utc, pd.act_end_dt_utc, 0, 'ZY_IMP', now(), 0
from pairing_duty pd where pd.id not in (select p.duty_id from pairing_duty_node p where p.node='DEBRIEF' );

INSERT INTO pairing_duty_node
(id, pairing_id, duty_id, `sequence`, `type`, node, from_segment_id, to_segment_id, group_id, airport, start_utc, end_utc, scenario_id, modified_by, last_modified, is_manual_modify)
select nextval('PAIRING_DUTY_NODE_SEQ'), pd.pairing_id, pd.id, 4, 'DUTY', 'DROPOFF', 0, 0, 1, pd.end_arp, pd.act_end_dt_utc, pd.act_end_dt_utc, 0, 'ZY_IMP', now(), 0
from pairing_duty pd where pd.id not in (select p.duty_id from pairing_duty_node p where p.node='DROPOFF' );
-- 补充存在缺失pairing_duty_node 数据

-- nextval('PAIRING_SEG_SEQ')
INSERT INTO pairing_duty_segment
(id, pairing_id, pairing_duty_id, duty_seq, seg_seq, flt_id, flt_dt, `assignment`, scenario_id, rank_comb_c9a_p, rank_comb_c9a_c, rank_comb_c9a_a, created_by, created_dt, modified_by, last_modified, airline, flt_num, dep_arp, arv_arp, fleet, act_str_dt_utc, act_end_dt_utc, is_deleted, interface_flt_id)
select nextval('PAIRING_SEG_SEQ'), pd.pairing_id, pd.id, ps.duty_seq, ps.seg_seq, 0, ps.flt_dt, case when ps.`assignment` = 'Transport' then 'DHD' when ps.`assignment` = 'Reserve' then 'SBY' when ps.`assignment` = 'FLIGHT' then 'FLY' ELSE ps.`assignment` END as assignments,
0, 0, 0, 0, 'ZY_IMP', now(), 'ZY_IMP', now(), 
case when ps.airline = 'FLE' or  ps.`assignment` = 'Reserve' THEN 'F8' when ps.flt_num REGEXP '^(?=.*[a-z])(?=.*[0-9])' THEN SUBSTR(ps.flt_num, 1, 2) ELSE 'F8' END as airline, 
case when ps.airline = 'FLE' THEN SUBSTR(ps.flt_num, 3) ELSE ps.flt_num END as flt_num, ps.dep_arp, ps.arv_arp, IF(ps.fleet = '' OR ps.fleet IS NULL, '-', ps.fleet) as fleet, ps.act_str_dt_utc, ps.act_end_dt_utc, 0, ps.flt_id
from f8_pairingdutysegments ps inner join pairing_duty pd on pd.comments = ps.duty_id and ps.assignment != 'Hotel';

-- 根据PairingDutySegment数据补充Flight FLY数据
-- nextval('FLT_SEQ')
INSERT INTO flight
(id, airline, flt_dt, flt_num, dep_arp, arv_arp, sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc, act_dep_arp, act_arv_arp, flight_flag, flight_assignment, blk_min, fleet, 
	ac_owner, pilot_owner, cabin_owner, commute_id, seg_type, flt_type, is_locked, sch_id, interface_flt_id, created_by, created_dt, modified_by, last_modified, service_type)
select nextval('FLT_SEQ'), pds.airline, pds.flt_dt, pds.flt_num, pds.dep_arp , pds.arv_arp, pds.act_str_dt_utc, pds.act_end_dt_utc, pds.act_str_dt_utc, pds.act_end_dt_utc, pds.dep_arp , pds.arv_arp, 'A', 'FLY',  TIMESTAMPDIFF(MINUTE, pds.act_str_dt_utc, pds.act_end_dt_utc) AS blk_min, pds.fleet,
'F8', 'F8', 'F8', 0, 'J', 'S', 0, 0, pds.interface_flt_id, 'ZY_IMP', now(), 'ZY_IMP', now(), 'S' 
from (select distinct ps.airline, ps.flt_dt, ps.flt_num, ps.dep_arp, ps.arv_arp, ps.act_str_dt_utc, ps.act_end_dt_utc, ps.fleet, ps.interface_flt_id
	from pairing_duty_segment ps where ps.interface_flt_id > 0) pds ;

-- 根据PairingDutySegment flt_id=0 补充Flight DHD/SBY 航段
INSERT INTO flight
(id, airline, flt_dt, flt_num, dep_arp, arv_arp, sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc, act_dep_arp, act_arv_arp, flight_flag, flight_assignment, blk_min, fleet, 
	ac_owner, pilot_owner, cabin_owner, commute_id, seg_type, flt_type, is_locked, sch_id, created_by, created_dt, modified_by, last_modified, service_type)
select nextval('FLT_SEQ'), pds.airline, pds.flt_dt, pds.flt_num, pds.dep_arp , pds.arv_arp, pds.act_str_dt_utc, pds.act_end_dt_utc, pds.act_str_dt_utc, pds.act_end_dt_utc, pds.dep_arp , pds.arv_arp, case when pds.`assignment`='DHD' then 'D' when pds.`assignment`='SBY' then 'B' ELSE '' END,
	pds.`assignment`,  TIMESTAMPDIFF(MINUTE, pds.act_str_dt_utc, pds.act_end_dt_utc) AS blk_min, pds.fleet,'F8', 'F8', 'F8', 0, 'J', 'S', 0, 0, 'ZY_IMP', now(), 'ZY_IMP', now(), 'S' 
from (select distinct ps.airline, ps.flt_dt, ps.`assignment`, ps.flt_num, ps.dep_arp, ps.arv_arp, ps.act_str_dt_utc, ps.act_end_dt_utc, ps.fleet
	from pairing_duty_segment ps where ps.interface_flt_id = 0) pds;

-- 根据生成的Flight (FLY) 回填真正的flight.id
-- 修正PairingDutySegment.flt_id
update pairing_duty_segment ps set ps.flt_id=(select id from flight f where f.interface_flt_id=ps.interface_flt_id and ps.airline = f.airline and ps.flt_dt = f.flt_dt 
	and ps.flt_num = f.flt_num and ps.dep_arp = f.dep_arp and ps.arv_arp =f.arv_arp and ps.act_str_dt_utc = f.sch_dep_dt_utc and ps.act_end_dt_utc = f.sch_arv_dt_utc and ps.fleet = f.fleet
) where ps.interface_flt_id > 0;

-- 根据生成的Flight (SBY/DHD) 回填真正的flight.id
-- 修正PairingDutySegment.flt_id
update pairing_duty_segment ps set ps.flt_id=(select id from flight f where ps.airline = f.airline and ps.flt_dt = f.flt_dt 
	and ps.flt_num = f.flt_num and ps.dep_arp = f.dep_arp and ps.arv_arp =f.arv_arp and ps.act_str_dt_utc = f.sch_dep_dt_utc and ps.act_end_dt_utc = f.sch_arv_dt_utc and ps.fleet = f.fleet
) where ps.interface_flt_id = 0;

-- check import data
select * from pairing p where p.id not in (select pc.pairing_id from pairing_composition pc );
select * from pairing p where p.id not in (select pd.pairing_id from  pairing_duty pd );
select * from pairing p where p.id not in (select pd.pairing_id from  pairing_duty_node pd );
select * from pairing p where p.id not in (select pd.pairing_id from  pairing_duty_segment pd );

select * from pairing_duty p where p.id not in (select pd.duty_id from  pairing_duty_node pd where pd.node='PICKUP' );
select * from pairing_duty p where p.id not in (select pd.duty_id from  pairing_duty_node pd where pd.node='BRIEF'  );
select * from pairing_duty p where p.id not in (select pd.duty_id from  pairing_duty_node pd where pd.node='DEBRIEF'  );
select * from pairing_duty p where p.id not in (select pd.duty_id from  pairing_duty_node pd where pd.node='DROPOFF'  );

select * from pairing_duty p where p.id not in (select pd.pairing_duty_id from  pairing_duty_segment pd );
select * from pairing_duty_segment p where p.flt_id not in (select id from  flight pd );
select * from flight f where f.id in (select flt_id from flight_composition fc);
select * from flight f where f.id not in (select flt_id from flight_composition fc);
select * from flight f where f.dep_arp not in (select airport from airport );
select * from flight f where f.arv_arp not in (select airport from airport );
select min(f.flt_dt), max(f.flt_dt) from flight f;

-- 修补发现flight_dt需要按计划utc时间转YVR local 时区日期
update flight f set f.flt_dt=DATE(DATE_SUB(f.sch_dep_dt_utc, INTERVAL 420 MINUTE)) ;


