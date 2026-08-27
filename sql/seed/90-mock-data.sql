-- ============================================================
-- 90-mock-data.sql — 模拟测试数据（Gantt 展示用）
-- ============================================================
-- 功能：插入模拟的机组、航班、配对、排班数据
-- 表：  crew, crew_rank, crew_base, crew_fleet,
--       flight, flight_composition,
--       pairing, pairing_segment,
--       roster_flight
-- 幂等：INSERT ... ON CONFLICT DO NOTHING 或 NOT EXISTS
-- 日期范围：2026-03-31 ~ 2026-04-06（7 天）
-- 修改记录：
--   2026-03-31  初始创建
-- ============================================================

-- ============================================================
-- 1. 机组数据（30 人）
-- ============================================================

-- 10 Captains (CA), 10 First Officers (FO), 5 Pursers (PU), 5 Flight Attendants (FA)
INSERT INTO crew (crew_id, first_name, last_name, gender, division, empl_dt, filiale, seniority_num) VALUES
  ('CA001', 'Wei',      'Chen',   'M', 'P', '2010-01-15T00:00:00Z', 'F8', 1.00),
  ('CA002', 'Ming',     'Wang',   'M', 'P', '2011-03-20T00:00:00Z', 'F8', 2.00),
  ('CA003', 'Jun',      'Li',     'M', 'P', '2012-06-10T00:00:00Z', 'F8', 3.00),
  ('CA004', 'Hao',      'Zhang',  'M', 'P', '2013-08-05T00:00:00Z', 'F8', 4.00),
  ('CA005', 'Lei',      'Liu',    'M', 'P', '2014-02-28T00:00:00Z', 'F8', 5.00),
  ('CA006', 'Feng',     'Yang',   'M', 'P', '2015-05-12T00:00:00Z', 'F8', 6.00),
  ('CA007', 'Qiang',    'Huang',  'M', 'P', '2016-09-18T00:00:00Z', 'F8', 7.00),
  ('CA008', 'Yu',       'Zhao',   'F', 'P', '2017-04-22T00:00:00Z', 'F8', 8.00),
  ('CA009', 'Tao',      'Wu',     'M', 'P', '2018-11-30T00:00:00Z', 'F8', 9.00),
  ('CA010', 'Xin',      'Zhou',   'M', 'P', '2019-07-14T00:00:00Z', 'F8', 10.00),
  ('FO001', 'Jie',      'Sun',    'M', 'P', '2016-01-10T00:00:00Z', 'F8', 11.00),
  ('FO002', 'Bo',       'Ma',     'M', 'P', '2017-02-15T00:00:00Z', 'F8', 12.00),
  ('FO003', 'Kai',      'Zhu',    'M', 'P', '2018-04-20T00:00:00Z', 'F8', 13.00),
  ('FO004', 'Rui',      'Hu',     'F', 'P', '2019-06-25T00:00:00Z', 'F8', 14.00),
  ('FO005', 'Chao',     'Guo',    'M', 'P', '2020-08-30T00:00:00Z', 'F8', 15.00),
  ('FO006', 'Peng',     'Lin',    'M', 'P', '2020-10-05T00:00:00Z', 'F8', 16.00),
  ('FO007', 'Dong',     'He',     'M', 'P', '2021-01-12T00:00:00Z', 'F8', 17.00),
  ('FO008', 'Hua',      'Gao',    'F', 'P', '2021-05-18T00:00:00Z', 'F8', 18.00),
  ('FO009', 'Long',     'Zheng',  'M', 'P', '2022-03-22T00:00:00Z', 'F8', 19.00),
  ('FO010', 'Gang',     'Luo',    'M', 'P', '2022-09-28T00:00:00Z', 'F8', 20.00),
  ('PU001', 'Mei',      'Xu',     'F', 'C', '2012-03-10T00:00:00Z', 'F8', 21.00),
  ('PU002', 'Lan',      'Song',   'F', 'C', '2014-07-15T00:00:00Z', 'F8', 22.00),
  ('PU003', 'Fang',     'Tang',   'F', 'C', '2016-11-20T00:00:00Z', 'F8', 23.00),
  ('PU004', 'Na',       'Deng',   'F', 'C', '2018-01-25T00:00:00Z', 'F8', 24.00),
  ('PU005', 'Ting',     'Feng',   'F', 'C', '2019-05-30T00:00:00Z', 'F8', 25.00),
  ('FA001', 'Xue',      'Cao',    'F', 'C', '2018-02-14T00:00:00Z', 'F8', 26.00),
  ('FA002', 'Ying',     'Peng',   'F', 'C', '2019-06-20T00:00:00Z', 'F8', 27.00),
  ('FA003', 'Dan',      'Xiao',   'F', 'C', '2020-10-25T00:00:00Z', 'F8', 28.00),
  ('FA004', 'Li',       'Cheng',  'F', 'C', '2021-04-30T00:00:00Z', 'F8', 29.00),
  ('FA005', 'Juan',     'Yuan',   'F', 'C', '2022-08-05T00:00:00Z', 'F8', 30.00)
ON CONFLICT (crew_id) DO NOTHING;

-- crew_rank (current effective ranks)
INSERT INTO crew_rank (crew_id, rank, eff_dt, position, ac_type, division)
SELECT v.crew_id, v.rank, v.eff_dt::timestamptz, v.position, v.ac_type, v.division
FROM (VALUES
  ('CA001','CA','2010-01-15T00:00:00Z','1','B787','P'),
  ('CA002','CA','2011-03-20T00:00:00Z','1','B787','P'),
  ('CA003','CA','2012-06-10T00:00:00Z','1','B787','P'),
  ('CA004','CA','2013-08-05T00:00:00Z','1','A321','P'),
  ('CA005','CA','2014-02-28T00:00:00Z','1','A321','P'),
  ('CA006','CA','2015-05-12T00:00:00Z','1','B787','P'),
  ('CA007','CA','2016-09-18T00:00:00Z','1','A321','P'),
  ('CA008','CA','2017-04-22T00:00:00Z','1','B787','P'),
  ('CA009','CA','2018-11-30T00:00:00Z','1','A321','P'),
  ('CA010','CA','2019-07-14T00:00:00Z','1','B787','P'),
  ('FO001','FO','2016-01-10T00:00:00Z','1','B787','P'),
  ('FO002','FO','2017-02-15T00:00:00Z','1','B787','P'),
  ('FO003','FO','2018-04-20T00:00:00Z','1','B787','P'),
  ('FO004','FO','2019-06-25T00:00:00Z','1','A321','P'),
  ('FO005','FO','2020-08-30T00:00:00Z','1','A321','P'),
  ('FO006','FO','2020-10-05T00:00:00Z','1','B787','P'),
  ('FO007','FO','2021-01-12T00:00:00Z','1','A321','P'),
  ('FO008','FO','2021-05-18T00:00:00Z','1','B787','P'),
  ('FO009','FO','2022-03-22T00:00:00Z','1','A321','P'),
  ('FO010','FO','2022-09-28T00:00:00Z','1','B787','P'),
  ('PU001','PU','2012-03-10T00:00:00Z','1',NULL,'C'),
  ('PU002','PU','2014-07-15T00:00:00Z','1',NULL,'C'),
  ('PU003','PU','2016-11-20T00:00:00Z','1',NULL,'C'),
  ('PU004','PU','2018-01-25T00:00:00Z','1',NULL,'C'),
  ('PU005','PU','2019-05-30T00:00:00Z','1',NULL,'C'),
  ('FA001','FA','2018-02-14T00:00:00Z','1',NULL,'C'),
  ('FA002','FA','2019-06-20T00:00:00Z','1',NULL,'C'),
  ('FA003','FA','2020-10-25T00:00:00Z','1',NULL,'C'),
  ('FA004','FA','2021-04-30T00:00:00Z','1',NULL,'C'),
  ('FA005','FA','2022-08-05T00:00:00Z','1',NULL,'C')
) AS v(crew_id, rank, eff_dt, position, ac_type, division)
WHERE NOT EXISTS (
  SELECT 1 FROM crew_rank cr
  WHERE cr.crew_id = v.crew_id AND cr.rank = v.rank AND cr.position = v.position AND cr.eff_dt = v.eff_dt::timestamptz
    AND (cr.ac_type = v.ac_type OR (cr.ac_type IS NULL AND v.ac_type IS NULL))
);

-- crew_base (all based at TPE)
INSERT INTO crew_base (crew_id, base, eff_dt, is_prime_base)
SELECT v.crew_id, 'TPE', '2020-01-01T00:00:00Z'::timestamptz, 1
FROM (VALUES ('CA001'),('CA002'),('CA003'),('CA004'),('CA005'),('CA006'),('CA007'),('CA008'),('CA009'),('CA010'),
             ('FO001'),('FO002'),('FO003'),('FO004'),('FO005'),('FO006'),('FO007'),('FO008'),('FO009'),('FO010'),
             ('PU001'),('PU002'),('PU003'),('PU004'),('PU005'),
             ('FA001'),('FA002'),('FA003'),('FA004'),('FA005')
) AS v(crew_id)
WHERE NOT EXISTS (
  SELECT 1 FROM crew_base cb WHERE cb.crew_id = v.crew_id AND cb.base = 'TPE' AND cb.eff_dt = '2020-01-01T00:00:00Z'::timestamptz
);

-- crew_fleet
INSERT INTO crew_fleet (crew_id, fleet_specific, eff_dt, ac_type, fleet_grp)
SELECT v.crew_id, v.fleet, '2020-01-01T00:00:00Z'::timestamptz, v.fleet, v.fleet
FROM (VALUES
  ('CA001','B787'),('CA002','B787'),('CA003','B787'),('CA004','A321'),('CA005','A321'),
  ('CA006','B787'),('CA007','A321'),('CA008','B787'),('CA009','A321'),('CA010','B787'),
  ('FO001','B787'),('FO002','B787'),('FO003','B787'),('FO004','A321'),('FO005','A321'),
  ('FO006','B787'),('FO007','A321'),('FO008','B787'),('FO009','A321'),('FO010','B787'),
  ('PU001','B787'),('PU002','B787'),('PU003','A321'),('PU004','A321'),('PU005','B787'),
  ('FA001','B787'),('FA002','B787'),('FA003','A321'),('FA004','A321'),('FA005','B787')
) AS v(crew_id, fleet)
WHERE NOT EXISTS (
  SELECT 1 FROM crew_fleet cf WHERE cf.crew_id = v.crew_id AND cf.fleet_specific = v.fleet AND cf.eff_dt = '2020-01-01T00:00:00Z'::timestamptz
);

-- ============================================================
-- 2. 航班数据（7 天，约 70 个航班）
-- ============================================================
-- Routes with approximate flight times (UTC offset for TPE = +8):
--   TPE-NRT: 3h00 (BR001/BR002 outbound, BR011/BR012 return)
--   TPE-ICN: 2h30 (BR003/BR004 outbound, BR013/BR014 return)
--   TPE-SIN: 4h30 (BR005 outbound, BR015 return)
--   TPE-BKK: 3h30 (BR006 outbound, BR016 return)
--   TPE-HKG: 1h30 (BR007/BR008 outbound, BR017/BR018 return)
--   TPE-PVG: 2h00 (BR009/BR010 outbound, BR019/BR020 return)
--
-- Departures in UTC (TPE morning = UTC night before):
--   Morning flight TPE dep 08:00 local = 00:00 UTC
--   Afternoon flight TPE dep 14:00 local = 06:00 UTC
--   Return flights depart from destination a few hours after arrival

-- Helper: We generate flights using a DO block and insert
DO $$
DECLARE
  d INTEGER;
  base_date DATE := '2026-03-31';
  cur_date DATE;
  flt_id_map BIGINT[];
BEGIN
  FOR d IN 0..6 LOOP
    cur_date := base_date + d;

    -- BR001: TPE->NRT morning, dep 00:00 UTC, arr 03:00 UTC (B787)
    INSERT INTO flight (airline, flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, blk_min, fleet, flt_type)
    SELECT 'BR', cur_date, 'BR001', 'TPE', 'NRT',
      (cur_date || ' 00:00:00+00')::timestamptz, (cur_date || ' 03:00:00+00')::timestamptz,
      (cur_date || ' 00:00:00+00')::timestamptz, (cur_date || ' 03:00:00+00')::timestamptz,
      'TPE', 'NRT', 180, 'B787', 'J'
    WHERE NOT EXISTS (
      SELECT 1 FROM flight f WHERE f.airline='BR' AND f.flt_dt=cur_date AND f.flt_num='BR001'
    );

    -- BR011: NRT->TPE afternoon, dep 07:00 UTC, arr 10:00 UTC (B787)
    INSERT INTO flight (airline, flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, blk_min, fleet, flt_type)
    SELECT 'BR', cur_date, 'BR011', 'NRT', 'TPE',
      (cur_date || ' 07:00:00+00')::timestamptz, (cur_date || ' 10:00:00+00')::timestamptz,
      (cur_date || ' 07:00:00+00')::timestamptz, (cur_date || ' 10:00:00+00')::timestamptz,
      'NRT', 'TPE', 180, 'B787', 'J'
    WHERE NOT EXISTS (
      SELECT 1 FROM flight f WHERE f.airline='BR' AND f.flt_dt=cur_date AND f.flt_num='BR011'
    );

    -- BR002: TPE->NRT afternoon, dep 06:00 UTC, arr 09:00 UTC (B787)
    INSERT INTO flight (airline, flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, blk_min, fleet, flt_type)
    SELECT 'BR', cur_date, 'BR002', 'TPE', 'NRT',
      (cur_date || ' 06:00:00+00')::timestamptz, (cur_date || ' 09:00:00+00')::timestamptz,
      (cur_date || ' 06:00:00+00')::timestamptz, (cur_date || ' 09:00:00+00')::timestamptz,
      'TPE', 'NRT', 180, 'B787', 'J'
    WHERE NOT EXISTS (
      SELECT 1 FROM flight f WHERE f.airline='BR' AND f.flt_dt=cur_date AND f.flt_num='BR002'
    );

    -- BR012: NRT->TPE evening, dep 12:00 UTC, arr 15:00 UTC (B787)
    INSERT INTO flight (airline, flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, blk_min, fleet, flt_type)
    SELECT 'BR', cur_date, 'BR012', 'NRT', 'TPE',
      (cur_date || ' 12:00:00+00')::timestamptz, (cur_date || ' 15:00:00+00')::timestamptz,
      (cur_date || ' 12:00:00+00')::timestamptz, (cur_date || ' 15:00:00+00')::timestamptz,
      'NRT', 'TPE', 180, 'B787', 'J'
    WHERE NOT EXISTS (
      SELECT 1 FROM flight f WHERE f.airline='BR' AND f.flt_dt=cur_date AND f.flt_num='BR012'
    );

    -- BR003: TPE->ICN morning, dep 00:30 UTC, arr 03:00 UTC (A321)
    INSERT INTO flight (airline, flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, blk_min, fleet, flt_type)
    SELECT 'BR', cur_date, 'BR003', 'TPE', 'ICN',
      (cur_date || ' 00:30:00+00')::timestamptz, (cur_date || ' 03:00:00+00')::timestamptz,
      (cur_date || ' 00:30:00+00')::timestamptz, (cur_date || ' 03:00:00+00')::timestamptz,
      'TPE', 'ICN', 150, 'A321', 'J'
    WHERE NOT EXISTS (
      SELECT 1 FROM flight f WHERE f.airline='BR' AND f.flt_dt=cur_date AND f.flt_num='BR003'
    );

    -- BR013: ICN->TPE afternoon, dep 06:00 UTC, arr 08:30 UTC (A321)
    INSERT INTO flight (airline, flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, blk_min, fleet, flt_type)
    SELECT 'BR', cur_date, 'BR013', 'ICN', 'TPE',
      (cur_date || ' 06:00:00+00')::timestamptz, (cur_date || ' 08:30:00+00')::timestamptz,
      (cur_date || ' 06:00:00+00')::timestamptz, (cur_date || ' 08:30:00+00')::timestamptz,
      'ICN', 'TPE', 150, 'A321', 'J'
    WHERE NOT EXISTS (
      SELECT 1 FROM flight f WHERE f.airline='BR' AND f.flt_dt=cur_date AND f.flt_num='BR013'
    );

    -- BR005: TPE->SIN morning, dep 01:00 UTC, arr 05:30 UTC (B787)
    INSERT INTO flight (airline, flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, blk_min, fleet, flt_type)
    SELECT 'BR', cur_date, 'BR005', 'TPE', 'SIN',
      (cur_date || ' 01:00:00+00')::timestamptz, (cur_date || ' 05:30:00+00')::timestamptz,
      (cur_date || ' 01:00:00+00')::timestamptz, (cur_date || ' 05:30:00+00')::timestamptz,
      'TPE', 'SIN', 270, 'B787', 'J'
    WHERE NOT EXISTS (
      SELECT 1 FROM flight f WHERE f.airline='BR' AND f.flt_dt=cur_date AND f.flt_num='BR005'
    );

    -- BR015: SIN->TPE evening, dep 09:00 UTC, arr 13:30 UTC (B787)
    INSERT INTO flight (airline, flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, blk_min, fleet, flt_type)
    SELECT 'BR', cur_date, 'BR015', 'SIN', 'TPE',
      (cur_date || ' 09:00:00+00')::timestamptz, (cur_date || ' 13:30:00+00')::timestamptz,
      (cur_date || ' 09:00:00+00')::timestamptz, (cur_date || ' 13:30:00+00')::timestamptz,
      'SIN', 'TPE', 270, 'B787', 'J'
    WHERE NOT EXISTS (
      SELECT 1 FROM flight f WHERE f.airline='BR' AND f.flt_dt=cur_date AND f.flt_num='BR015'
    );

    -- BR006: TPE->BKK, dep 02:00 UTC, arr 05:30 UTC (A321)
    INSERT INTO flight (airline, flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, blk_min, fleet, flt_type)
    SELECT 'BR', cur_date, 'BR006', 'TPE', 'BKK',
      (cur_date || ' 02:00:00+00')::timestamptz, (cur_date || ' 05:30:00+00')::timestamptz,
      (cur_date || ' 02:00:00+00')::timestamptz, (cur_date || ' 05:30:00+00')::timestamptz,
      'TPE', 'BKK', 210, 'A321', 'J'
    WHERE NOT EXISTS (
      SELECT 1 FROM flight f WHERE f.airline='BR' AND f.flt_dt=cur_date AND f.flt_num='BR006'
    );

    -- BR016: BKK->TPE, dep 08:00 UTC, arr 11:30 UTC (A321)
    INSERT INTO flight (airline, flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, blk_min, fleet, flt_type)
    SELECT 'BR', cur_date, 'BR016', 'BKK', 'TPE',
      (cur_date || ' 08:00:00+00')::timestamptz, (cur_date || ' 11:30:00+00')::timestamptz,
      (cur_date || ' 08:00:00+00')::timestamptz, (cur_date || ' 11:30:00+00')::timestamptz,
      'BKK', 'TPE', 210, 'A321', 'J'
    WHERE NOT EXISTS (
      SELECT 1 FROM flight f WHERE f.airline='BR' AND f.flt_dt=cur_date AND f.flt_num='BR016'
    );

    -- BR007: TPE->HKG morning, dep 00:00 UTC, arr 01:30 UTC (A321)
    INSERT INTO flight (airline, flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, blk_min, fleet, flt_type)
    SELECT 'BR', cur_date, 'BR007', 'TPE', 'HKG',
      (cur_date || ' 00:00:00+00')::timestamptz, (cur_date || ' 01:30:00+00')::timestamptz,
      (cur_date || ' 00:00:00+00')::timestamptz, (cur_date || ' 01:30:00+00')::timestamptz,
      'TPE', 'HKG', 90, 'A321', 'J'
    WHERE NOT EXISTS (
      SELECT 1 FROM flight f WHERE f.airline='BR' AND f.flt_dt=cur_date AND f.flt_num='BR007'
    );

    -- BR017: HKG->TPE, dep 04:00 UTC, arr 05:30 UTC (A321)
    INSERT INTO flight (airline, flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, blk_min, fleet, flt_type)
    SELECT 'BR', cur_date, 'BR017', 'HKG', 'TPE',
      (cur_date || ' 04:00:00+00')::timestamptz, (cur_date || ' 05:30:00+00')::timestamptz,
      (cur_date || ' 04:00:00+00')::timestamptz, (cur_date || ' 05:30:00+00')::timestamptz,
      'HKG', 'TPE', 90, 'A321', 'J'
    WHERE NOT EXISTS (
      SELECT 1 FROM flight f WHERE f.airline='BR' AND f.flt_dt=cur_date AND f.flt_num='BR017'
    );

    -- BR009: TPE->PVG, dep 01:00 UTC, arr 03:00 UTC (A321)
    INSERT INTO flight (airline, flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, blk_min, fleet, flt_type)
    SELECT 'BR', cur_date, 'BR009', 'TPE', 'PVG',
      (cur_date || ' 01:00:00+00')::timestamptz, (cur_date || ' 03:00:00+00')::timestamptz,
      (cur_date || ' 01:00:00+00')::timestamptz, (cur_date || ' 03:00:00+00')::timestamptz,
      'TPE', 'PVG', 120, 'A321', 'J'
    WHERE NOT EXISTS (
      SELECT 1 FROM flight f WHERE f.airline='BR' AND f.flt_dt=cur_date AND f.flt_num='BR009'
    );

    -- BR019: PVG->TPE, dep 06:00 UTC, arr 08:00 UTC (A321)
    INSERT INTO flight (airline, flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, blk_min, fleet, flt_type)
    SELECT 'BR', cur_date, 'BR019', 'PVG', 'TPE',
      (cur_date || ' 06:00:00+00')::timestamptz, (cur_date || ' 08:00:00+00')::timestamptz,
      (cur_date || ' 06:00:00+00')::timestamptz, (cur_date || ' 08:00:00+00')::timestamptz,
      'PVG', 'TPE', 120, 'A321', 'J'
    WHERE NOT EXISTS (
      SELECT 1 FROM flight f WHERE f.airline='BR' AND f.flt_dt=cur_date AND f.flt_num='BR019'
    );

  END LOOP;
END
$$;

-- ============================================================
-- 2b. Flight compositions (crew requirements per flight)
-- ============================================================
-- For each flight: 1 CA, 1 FO (Pilot division), 1 PU, 2 FA (Cabin division)
INSERT INTO flight_composition (flt_id, division, acting_rank, plan_value)
SELECT f.id, 'P', 'CA', 1
FROM flight f
WHERE f.airline = 'BR' AND f.flt_dt >= '2026-03-31' AND f.flt_dt <= '2026-04-06'
  AND NOT EXISTS (
    SELECT 1 FROM flight_composition fc WHERE fc.flt_id = f.id AND fc.acting_rank = 'CA'
  );

INSERT INTO flight_composition (flt_id, division, acting_rank, plan_value)
SELECT f.id, 'P', 'FO', 1
FROM flight f
WHERE f.airline = 'BR' AND f.flt_dt >= '2026-03-31' AND f.flt_dt <= '2026-04-06'
  AND NOT EXISTS (
    SELECT 1 FROM flight_composition fc WHERE fc.flt_id = f.id AND fc.acting_rank = 'FO'
  );

INSERT INTO flight_composition (flt_id, division, acting_rank, plan_value)
SELECT f.id, 'C', 'PU', 1
FROM flight f
WHERE f.airline = 'BR' AND f.flt_dt >= '2026-03-31' AND f.flt_dt <= '2026-04-06'
  AND NOT EXISTS (
    SELECT 1 FROM flight_composition fc WHERE fc.flt_id = f.id AND fc.acting_rank = 'PU'
  );

INSERT INTO flight_composition (flt_id, division, acting_rank, plan_value)
SELECT f.id, 'C', 'FA', 2
FROM flight f
WHERE f.airline = 'BR' AND f.flt_dt >= '2026-03-31' AND f.flt_dt <= '2026-04-06'
  AND NOT EXISTS (
    SELECT 1 FROM flight_composition fc WHERE fc.flt_id = f.id AND fc.acting_rank = 'FA'
  );

-- ============================================================
-- 3. Pairing data (15 pairings)
-- ============================================================
-- Pairing types:
--   1-day turn: TPE->NRT->TPE (same day)
--   1-day turn: TPE->ICN->TPE (same day)
--   1-day turn: TPE->HKG->TPE (same day)
--   1-day turn: TPE->PVG->TPE (same day)
--   2-day layover: TPE->SIN (day1), SIN->TPE (day2)
--   2-day layover: TPE->BKK (day1), BKK->TPE (day2)
--   2-day layover: TPE->NRT (day1, afternoon), NRT->TPE (day2)

-- We use a DO block to create pairings that reference flight IDs
DO $$
DECLARE
  p_id BIGINT;
  f1_id BIGINT;
  f2_id BIGINT;
  f3_id BIGINT;
  f4_id BIGINT;
  base_date DATE := '2026-03-31';
  the_epoch TIMESTAMPTZ := '1970-01-01 00:00:00+00';
BEGIN

  -- -------------------------------------------------------
  -- Pairing P01: Day 1 (Mar 31), TPE->NRT->TPE same day (B787)
  -- BR001: TPE->NRT 00:00-03:00, BR011: NRT->TPE 07:00-10:00
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-03-31' AND flt_num='BR001';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-03-31' AND flt_num='BR011';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P01-NRT-0331', 'F8', 'P', 'TPE', 'B787', 'FLIGHT', 'FLT',
      '2026-03-30 23:00:00+00', '2026-03-31 10:30:00+00',
      '2026-03-30 23:00:00+00', '2026-03-31 10:30:00+00',
      1, 690, 1, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        -- Seg 1: TPE->NRT
        (p_id, 1, 'TPE', 'TPE',
         '2026-03-30 23:00:00+00', '2026-03-31 10:30:00+00',
         '2026-03-30 23:00:00+00', '2026-03-31 10:30:00+00',
         60, 30, 690, 630, 360, 0,
         690, 630, 360, 0,
         '2026-03-30 23:00:00+00','2026-03-30 23:00:00+00','TPE','2026-03-30 23:00:00+00','2026-03-31 00:00:00+00',
         'TPE','2026-03-31 10:00:00+00','2026-03-31 10:30:00+00','2026-03-31 10:30:00+00','2026-03-31 10:30:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-03-31', 'BR001', 'BR', 'TPE', 'NRT', 'B787',
         '2026-03-31 00:00:00+00','2026-03-31 03:00:00+00',
         '2026-03-31 00:00:00+00','2026-03-31 03:00:00+00', 'FLT'),
        -- Seg 2: NRT->TPE
        (p_id, 1, 'TPE', 'TPE',
         '2026-03-30 23:00:00+00', '2026-03-31 10:30:00+00',
         '2026-03-30 23:00:00+00', '2026-03-31 10:30:00+00',
         60, 30, 690, 630, 360, 0,
         690, 630, 360, 0,
         '2026-03-30 23:00:00+00','2026-03-30 23:00:00+00','TPE','2026-03-30 23:00:00+00','2026-03-31 00:00:00+00',
         'TPE','2026-03-31 10:00:00+00','2026-03-31 10:30:00+00','2026-03-31 10:30:00+00','2026-03-31 10:30:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         2, f2_id, '2026-03-31', 'BR011', 'BR', 'NRT', 'TPE', 'B787',
         '2026-03-31 07:00:00+00','2026-03-31 10:00:00+00',
         '2026-03-31 07:00:00+00','2026-03-31 10:00:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Pairing P02: Day 1 (Mar 31), TPE->ICN->TPE same day (A321)
  -- BR003: TPE->ICN 00:30-03:00, BR013: ICN->TPE 06:00-08:30
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-03-31' AND flt_num='BR003';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-03-31' AND flt_num='BR013';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P02-ICN-0331', 'F8', 'P', 'TPE', 'A321', 'FLIGHT', 'FLT',
      '2026-03-30 23:30:00+00', '2026-03-31 09:00:00+00',
      '2026-03-30 23:30:00+00', '2026-03-31 09:00:00+00',
      1, 570, 1, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        (p_id, 1, 'TPE', 'TPE',
         '2026-03-30 23:30:00+00', '2026-03-31 09:00:00+00',
         '2026-03-30 23:30:00+00', '2026-03-31 09:00:00+00',
         60, 30, 570, 510, 300, 0, 570, 510, 300, 0,
         '2026-03-30 23:30:00+00','2026-03-30 23:30:00+00','TPE','2026-03-30 23:30:00+00','2026-03-31 00:30:00+00',
         'TPE','2026-03-31 08:30:00+00','2026-03-31 09:00:00+00','2026-03-31 09:00:00+00','2026-03-31 09:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-03-31', 'BR003', 'BR', 'TPE', 'ICN', 'A321',
         '2026-03-31 00:30:00+00','2026-03-31 03:00:00+00',
         '2026-03-31 00:30:00+00','2026-03-31 03:00:00+00', 'FLT'),
        (p_id, 1, 'TPE', 'TPE',
         '2026-03-30 23:30:00+00', '2026-03-31 09:00:00+00',
         '2026-03-30 23:30:00+00', '2026-03-31 09:00:00+00',
         60, 30, 570, 510, 300, 0, 570, 510, 300, 0,
         '2026-03-30 23:30:00+00','2026-03-30 23:30:00+00','TPE','2026-03-30 23:30:00+00','2026-03-31 00:30:00+00',
         'TPE','2026-03-31 08:30:00+00','2026-03-31 09:00:00+00','2026-03-31 09:00:00+00','2026-03-31 09:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         2, f2_id, '2026-03-31', 'BR013', 'BR', 'ICN', 'TPE', 'A321',
         '2026-03-31 06:00:00+00','2026-03-31 08:30:00+00',
         '2026-03-31 06:00:00+00','2026-03-31 08:30:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Pairing P03: Day 1-2 (Mar 31-Apr 1), TPE->SIN (day1), SIN->TPE (day2) (B787)
  -- Duty 1: BR005 TPE->SIN 01:00-05:30
  -- Duty 2: BR015 SIN->TPE 09:00-13:30 (next day Apr 1)
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-03-31' AND flt_num='BR005';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-01' AND flt_num='BR015';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P03-SIN-0331', 'F8', 'P', 'TPE', 'B787', 'FLIGHT', 'FLT',
      '2026-03-31 00:00:00+00', '2026-04-01 14:00:00+00',
      '2026-03-31 00:00:00+00', '2026-04-01 14:00:00+00',
      2, 2280, 2, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        -- Duty 1, Seg 1: TPE->SIN
        (p_id, 1, 'TPE', 'SIN',
         '2026-03-31 00:00:00+00', '2026-03-31 06:00:00+00',
         '2026-03-31 00:00:00+00', '2026-03-31 06:00:00+00',
         60, 30, 360, 330, 270, 1080,
         360, 330, 270, 1080,
         '2026-03-31 00:00:00+00','2026-03-31 00:00:00+00','TPE','2026-03-31 00:00:00+00','2026-03-31 01:00:00+00',
         'SIN','2026-03-31 05:30:00+00','2026-03-31 06:00:00+00','2026-03-31 06:00:00+00','2026-03-31 06:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-03-31', 'BR005', 'BR', 'TPE', 'SIN', 'B787',
         '2026-03-31 01:00:00+00','2026-03-31 05:30:00+00',
         '2026-03-31 01:00:00+00','2026-03-31 05:30:00+00', 'FLT'),
        -- Duty 2, Seg 1: SIN->TPE (next day)
        (p_id, 2, 'SIN', 'TPE',
         '2026-04-01 08:00:00+00', '2026-04-01 14:00:00+00',
         '2026-04-01 08:00:00+00', '2026-04-01 14:00:00+00',
         60, 30, 360, 330, 270, 0,
         360, 330, 270, 0,
         '2026-04-01 08:00:00+00','2026-04-01 08:00:00+00','SIN','2026-04-01 08:00:00+00','2026-04-01 09:00:00+00',
         'TPE','2026-04-01 13:30:00+00','2026-04-01 14:00:00+00','2026-04-01 14:00:00+00','2026-04-01 14:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f2_id, '2026-04-01', 'BR015', 'BR', 'SIN', 'TPE', 'B787',
         '2026-04-01 09:00:00+00','2026-04-01 13:30:00+00',
         '2026-04-01 09:00:00+00','2026-04-01 13:30:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Pairing P04: Day 1-2 (Mar 31-Apr 1), TPE->BKK (day1), BKK->TPE (day2) (A321)
  -- Duty 1: BR006 TPE->BKK 02:00-05:30
  -- Duty 2: BR016 BKK->TPE 08:00-11:30 (next day Apr 1)
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-03-31' AND flt_num='BR006';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-01' AND flt_num='BR016';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P04-BKK-0331', 'F8', 'P', 'TPE', 'A321', 'FLIGHT', 'FLT',
      '2026-03-31 01:00:00+00', '2026-04-01 12:00:00+00',
      '2026-03-31 01:00:00+00', '2026-04-01 12:00:00+00',
      2, 2100, 2, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        (p_id, 1, 'TPE', 'BKK',
         '2026-03-31 01:00:00+00', '2026-03-31 06:00:00+00',
         '2026-03-31 01:00:00+00', '2026-03-31 06:00:00+00',
         60, 30, 300, 270, 210, 1080,
         300, 270, 210, 1080,
         '2026-03-31 01:00:00+00','2026-03-31 01:00:00+00','TPE','2026-03-31 01:00:00+00','2026-03-31 02:00:00+00',
         'BKK','2026-03-31 05:30:00+00','2026-03-31 06:00:00+00','2026-03-31 06:00:00+00','2026-03-31 06:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-03-31', 'BR006', 'BR', 'TPE', 'BKK', 'A321',
         '2026-03-31 02:00:00+00','2026-03-31 05:30:00+00',
         '2026-03-31 02:00:00+00','2026-03-31 05:30:00+00', 'FLT'),
        (p_id, 2, 'BKK', 'TPE',
         '2026-04-01 07:00:00+00', '2026-04-01 12:00:00+00',
         '2026-04-01 07:00:00+00', '2026-04-01 12:00:00+00',
         60, 30, 300, 270, 210, 0,
         300, 270, 210, 0,
         '2026-04-01 07:00:00+00','2026-04-01 07:00:00+00','BKK','2026-04-01 07:00:00+00','2026-04-01 08:00:00+00',
         'TPE','2026-04-01 11:30:00+00','2026-04-01 12:00:00+00','2026-04-01 12:00:00+00','2026-04-01 12:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f2_id, '2026-04-01', 'BR016', 'BR', 'BKK', 'TPE', 'A321',
         '2026-04-01 08:00:00+00','2026-04-01 11:30:00+00',
         '2026-04-01 08:00:00+00','2026-04-01 11:30:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Pairing P05: Day 2 (Apr 1), TPE->HKG->TPE same day (A321)
  -- BR007: TPE->HKG 00:00-01:30, BR017: HKG->TPE 04:00-05:30
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-01' AND flt_num='BR007';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-01' AND flt_num='BR017';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P05-HKG-0401', 'F8', 'P', 'TPE', 'A321', 'FLIGHT', 'FLT',
      '2026-03-31 23:00:00+00', '2026-04-01 06:00:00+00',
      '2026-03-31 23:00:00+00', '2026-04-01 06:00:00+00',
      1, 420, 1, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        (p_id, 1, 'TPE', 'TPE',
         '2026-03-31 23:00:00+00', '2026-04-01 06:00:00+00',
         '2026-03-31 23:00:00+00', '2026-04-01 06:00:00+00',
         60, 30, 420, 360, 180, 0, 420, 360, 180, 0,
         '2026-03-31 23:00:00+00','2026-03-31 23:00:00+00','TPE','2026-03-31 23:00:00+00','2026-04-01 00:00:00+00',
         'TPE','2026-04-01 05:30:00+00','2026-04-01 06:00:00+00','2026-04-01 06:00:00+00','2026-04-01 06:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-04-01', 'BR007', 'BR', 'TPE', 'HKG', 'A321',
         '2026-04-01 00:00:00+00','2026-04-01 01:30:00+00',
         '2026-04-01 00:00:00+00','2026-04-01 01:30:00+00', 'FLT'),
        (p_id, 1, 'TPE', 'TPE',
         '2026-03-31 23:00:00+00', '2026-04-01 06:00:00+00',
         '2026-03-31 23:00:00+00', '2026-04-01 06:00:00+00',
         60, 30, 420, 360, 180, 0, 420, 360, 180, 0,
         '2026-03-31 23:00:00+00','2026-03-31 23:00:00+00','TPE','2026-03-31 23:00:00+00','2026-04-01 00:00:00+00',
         'TPE','2026-04-01 05:30:00+00','2026-04-01 06:00:00+00','2026-04-01 06:00:00+00','2026-04-01 06:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         2, f2_id, '2026-04-01', 'BR017', 'BR', 'HKG', 'TPE', 'A321',
         '2026-04-01 04:00:00+00','2026-04-01 05:30:00+00',
         '2026-04-01 04:00:00+00','2026-04-01 05:30:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Pairing P06: Day 2 (Apr 1), TPE->NRT->TPE same day (B787)
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-01' AND flt_num='BR001';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-01' AND flt_num='BR011';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P06-NRT-0401', 'F8', 'P', 'TPE', 'B787', 'FLIGHT', 'FLT',
      '2026-03-31 23:00:00+00', '2026-04-01 10:30:00+00',
      '2026-03-31 23:00:00+00', '2026-04-01 10:30:00+00',
      1, 690, 1, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        (p_id, 1, 'TPE', 'TPE',
         '2026-03-31 23:00:00+00', '2026-04-01 10:30:00+00',
         '2026-03-31 23:00:00+00', '2026-04-01 10:30:00+00',
         60, 30, 690, 630, 360, 0, 690, 630, 360, 0,
         '2026-03-31 23:00:00+00','2026-03-31 23:00:00+00','TPE','2026-03-31 23:00:00+00','2026-04-01 00:00:00+00',
         'TPE','2026-04-01 10:00:00+00','2026-04-01 10:30:00+00','2026-04-01 10:30:00+00','2026-04-01 10:30:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-04-01', 'BR001', 'BR', 'TPE', 'NRT', 'B787',
         '2026-04-01 00:00:00+00','2026-04-01 03:00:00+00',
         '2026-04-01 00:00:00+00','2026-04-01 03:00:00+00', 'FLT'),
        (p_id, 1, 'TPE', 'TPE',
         '2026-03-31 23:00:00+00', '2026-04-01 10:30:00+00',
         '2026-03-31 23:00:00+00', '2026-04-01 10:30:00+00',
         60, 30, 690, 630, 360, 0, 690, 630, 360, 0,
         '2026-03-31 23:00:00+00','2026-03-31 23:00:00+00','TPE','2026-03-31 23:00:00+00','2026-04-01 00:00:00+00',
         'TPE','2026-04-01 10:00:00+00','2026-04-01 10:30:00+00','2026-04-01 10:30:00+00','2026-04-01 10:30:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         2, f2_id, '2026-04-01', 'BR011', 'BR', 'NRT', 'TPE', 'B787',
         '2026-04-01 07:00:00+00','2026-04-01 10:00:00+00',
         '2026-04-01 07:00:00+00','2026-04-01 10:00:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Pairing P07: Day 2 (Apr 1), TPE->PVG->TPE same day (A321)
  -- BR009: TPE->PVG 01:00-03:00, BR019: PVG->TPE 06:00-08:00
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-01' AND flt_num='BR009';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-01' AND flt_num='BR019';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P07-PVG-0401', 'F8', 'P', 'TPE', 'A321', 'FLIGHT', 'FLT',
      '2026-04-01 00:00:00+00', '2026-04-01 08:30:00+00',
      '2026-04-01 00:00:00+00', '2026-04-01 08:30:00+00',
      1, 510, 1, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        (p_id, 1, 'TPE', 'TPE',
         '2026-04-01 00:00:00+00', '2026-04-01 08:30:00+00',
         '2026-04-01 00:00:00+00', '2026-04-01 08:30:00+00',
         60, 30, 510, 450, 240, 0, 510, 450, 240, 0,
         '2026-04-01 00:00:00+00','2026-04-01 00:00:00+00','TPE','2026-04-01 00:00:00+00','2026-04-01 01:00:00+00',
         'TPE','2026-04-01 08:00:00+00','2026-04-01 08:30:00+00','2026-04-01 08:30:00+00','2026-04-01 08:30:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-04-01', 'BR009', 'BR', 'TPE', 'PVG', 'A321',
         '2026-04-01 01:00:00+00','2026-04-01 03:00:00+00',
         '2026-04-01 01:00:00+00','2026-04-01 03:00:00+00', 'FLT'),
        (p_id, 1, 'TPE', 'TPE',
         '2026-04-01 00:00:00+00', '2026-04-01 08:30:00+00',
         '2026-04-01 00:00:00+00', '2026-04-01 08:30:00+00',
         60, 30, 510, 450, 240, 0, 510, 450, 240, 0,
         '2026-04-01 00:00:00+00','2026-04-01 00:00:00+00','TPE','2026-04-01 00:00:00+00','2026-04-01 01:00:00+00',
         'TPE','2026-04-01 08:00:00+00','2026-04-01 08:30:00+00','2026-04-01 08:30:00+00','2026-04-01 08:30:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         2, f2_id, '2026-04-01', 'BR019', 'BR', 'PVG', 'TPE', 'A321',
         '2026-04-01 06:00:00+00','2026-04-01 08:00:00+00',
         '2026-04-01 06:00:00+00','2026-04-01 08:00:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Pairing P08: Day 3 (Apr 2), TPE->NRT->TPE (B787)
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-02' AND flt_num='BR001';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-02' AND flt_num='BR011';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P08-NRT-0402', 'F8', 'P', 'TPE', 'B787', 'FLIGHT', 'FLT',
      '2026-04-01 23:00:00+00', '2026-04-02 10:30:00+00',
      '2026-04-01 23:00:00+00', '2026-04-02 10:30:00+00',
      1, 690, 1, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        (p_id, 1, 'TPE', 'TPE',
         '2026-04-01 23:00:00+00', '2026-04-02 10:30:00+00',
         '2026-04-01 23:00:00+00', '2026-04-02 10:30:00+00',
         60, 30, 690, 630, 360, 0, 690, 630, 360, 0,
         '2026-04-01 23:00:00+00','2026-04-01 23:00:00+00','TPE','2026-04-01 23:00:00+00','2026-04-02 00:00:00+00',
         'TPE','2026-04-02 10:00:00+00','2026-04-02 10:30:00+00','2026-04-02 10:30:00+00','2026-04-02 10:30:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-04-02', 'BR001', 'BR', 'TPE', 'NRT', 'B787',
         '2026-04-02 00:00:00+00','2026-04-02 03:00:00+00',
         '2026-04-02 00:00:00+00','2026-04-02 03:00:00+00', 'FLT'),
        (p_id, 1, 'TPE', 'TPE',
         '2026-04-01 23:00:00+00', '2026-04-02 10:30:00+00',
         '2026-04-01 23:00:00+00', '2026-04-02 10:30:00+00',
         60, 30, 690, 630, 360, 0, 690, 630, 360, 0,
         '2026-04-01 23:00:00+00','2026-04-01 23:00:00+00','TPE','2026-04-01 23:00:00+00','2026-04-02 00:00:00+00',
         'TPE','2026-04-02 10:00:00+00','2026-04-02 10:30:00+00','2026-04-02 10:30:00+00','2026-04-02 10:30:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         2, f2_id, '2026-04-02', 'BR011', 'BR', 'NRT', 'TPE', 'B787',
         '2026-04-02 07:00:00+00','2026-04-02 10:00:00+00',
         '2026-04-02 07:00:00+00','2026-04-02 10:00:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Pairing P09: Day 3 (Apr 2), TPE->ICN->TPE same day (A321)
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-02' AND flt_num='BR003';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-02' AND flt_num='BR013';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P09-ICN-0402', 'F8', 'P', 'TPE', 'A321', 'FLIGHT', 'FLT',
      '2026-04-01 23:30:00+00', '2026-04-02 09:00:00+00',
      '2026-04-01 23:30:00+00', '2026-04-02 09:00:00+00',
      1, 570, 1, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        (p_id, 1, 'TPE', 'TPE',
         '2026-04-01 23:30:00+00', '2026-04-02 09:00:00+00',
         '2026-04-01 23:30:00+00', '2026-04-02 09:00:00+00',
         60, 30, 570, 510, 300, 0, 570, 510, 300, 0,
         '2026-04-01 23:30:00+00','2026-04-01 23:30:00+00','TPE','2026-04-01 23:30:00+00','2026-04-02 00:30:00+00',
         'TPE','2026-04-02 08:30:00+00','2026-04-02 09:00:00+00','2026-04-02 09:00:00+00','2026-04-02 09:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-04-02', 'BR003', 'BR', 'TPE', 'ICN', 'A321',
         '2026-04-02 00:30:00+00','2026-04-02 03:00:00+00',
         '2026-04-02 00:30:00+00','2026-04-02 03:00:00+00', 'FLT'),
        (p_id, 1, 'TPE', 'TPE',
         '2026-04-01 23:30:00+00', '2026-04-02 09:00:00+00',
         '2026-04-01 23:30:00+00', '2026-04-02 09:00:00+00',
         60, 30, 570, 510, 300, 0, 570, 510, 300, 0,
         '2026-04-01 23:30:00+00','2026-04-01 23:30:00+00','TPE','2026-04-01 23:30:00+00','2026-04-02 00:30:00+00',
         'TPE','2026-04-02 08:30:00+00','2026-04-02 09:00:00+00','2026-04-02 09:00:00+00','2026-04-02 09:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         2, f2_id, '2026-04-02', 'BR013', 'BR', 'ICN', 'TPE', 'A321',
         '2026-04-02 06:00:00+00','2026-04-02 08:30:00+00',
         '2026-04-02 06:00:00+00','2026-04-02 08:30:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Pairing P10: Day 3-4 (Apr 2-3), TPE->SIN / SIN->TPE (B787)
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-02' AND flt_num='BR005';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-03' AND flt_num='BR015';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P10-SIN-0402', 'F8', 'P', 'TPE', 'B787', 'FLIGHT', 'FLT',
      '2026-04-02 00:00:00+00', '2026-04-03 14:00:00+00',
      '2026-04-02 00:00:00+00', '2026-04-03 14:00:00+00',
      2, 2280, 2, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        (p_id, 1, 'TPE', 'SIN',
         '2026-04-02 00:00:00+00', '2026-04-02 06:00:00+00',
         '2026-04-02 00:00:00+00', '2026-04-02 06:00:00+00',
         60, 30, 360, 330, 270, 1080, 360, 330, 270, 1080,
         '2026-04-02 00:00:00+00','2026-04-02 00:00:00+00','TPE','2026-04-02 00:00:00+00','2026-04-02 01:00:00+00',
         'SIN','2026-04-02 05:30:00+00','2026-04-02 06:00:00+00','2026-04-02 06:00:00+00','2026-04-02 06:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-04-02', 'BR005', 'BR', 'TPE', 'SIN', 'B787',
         '2026-04-02 01:00:00+00','2026-04-02 05:30:00+00',
         '2026-04-02 01:00:00+00','2026-04-02 05:30:00+00', 'FLT'),
        (p_id, 2, 'SIN', 'TPE',
         '2026-04-03 08:00:00+00', '2026-04-03 14:00:00+00',
         '2026-04-03 08:00:00+00', '2026-04-03 14:00:00+00',
         60, 30, 360, 330, 270, 0, 360, 330, 270, 0,
         '2026-04-03 08:00:00+00','2026-04-03 08:00:00+00','SIN','2026-04-03 08:00:00+00','2026-04-03 09:00:00+00',
         'TPE','2026-04-03 13:30:00+00','2026-04-03 14:00:00+00','2026-04-03 14:00:00+00','2026-04-03 14:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f2_id, '2026-04-03', 'BR015', 'BR', 'SIN', 'TPE', 'B787',
         '2026-04-03 09:00:00+00','2026-04-03 13:30:00+00',
         '2026-04-03 09:00:00+00','2026-04-03 13:30:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Pairing P11: Day 4 (Apr 3), TPE->HKG->TPE (A321)
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-03' AND flt_num='BR007';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-03' AND flt_num='BR017';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P11-HKG-0403', 'F8', 'P', 'TPE', 'A321', 'FLIGHT', 'FLT',
      '2026-04-02 23:00:00+00', '2026-04-03 06:00:00+00',
      '2026-04-02 23:00:00+00', '2026-04-03 06:00:00+00',
      1, 420, 1, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        (p_id, 1, 'TPE', 'TPE',
         '2026-04-02 23:00:00+00', '2026-04-03 06:00:00+00',
         '2026-04-02 23:00:00+00', '2026-04-03 06:00:00+00',
         60, 30, 420, 360, 180, 0, 420, 360, 180, 0,
         '2026-04-02 23:00:00+00','2026-04-02 23:00:00+00','TPE','2026-04-02 23:00:00+00','2026-04-03 00:00:00+00',
         'TPE','2026-04-03 05:30:00+00','2026-04-03 06:00:00+00','2026-04-03 06:00:00+00','2026-04-03 06:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-04-03', 'BR007', 'BR', 'TPE', 'HKG', 'A321',
         '2026-04-03 00:00:00+00','2026-04-03 01:30:00+00',
         '2026-04-03 00:00:00+00','2026-04-03 01:30:00+00', 'FLT'),
        (p_id, 1, 'TPE', 'TPE',
         '2026-04-02 23:00:00+00', '2026-04-03 06:00:00+00',
         '2026-04-02 23:00:00+00', '2026-04-03 06:00:00+00',
         60, 30, 420, 360, 180, 0, 420, 360, 180, 0,
         '2026-04-02 23:00:00+00','2026-04-02 23:00:00+00','TPE','2026-04-02 23:00:00+00','2026-04-03 00:00:00+00',
         'TPE','2026-04-03 05:30:00+00','2026-04-03 06:00:00+00','2026-04-03 06:00:00+00','2026-04-03 06:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         2, f2_id, '2026-04-03', 'BR017', 'BR', 'HKG', 'TPE', 'A321',
         '2026-04-03 04:00:00+00','2026-04-03 05:30:00+00',
         '2026-04-03 04:00:00+00','2026-04-03 05:30:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Pairing P12: Day 4-5 (Apr 3-4), TPE->BKK / BKK->TPE (A321)
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-03' AND flt_num='BR006';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-04' AND flt_num='BR016';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P12-BKK-0403', 'F8', 'P', 'TPE', 'A321', 'FLIGHT', 'FLT',
      '2026-04-03 01:00:00+00', '2026-04-04 12:00:00+00',
      '2026-04-03 01:00:00+00', '2026-04-04 12:00:00+00',
      2, 2100, 2, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        (p_id, 1, 'TPE', 'BKK',
         '2026-04-03 01:00:00+00', '2026-04-03 06:00:00+00',
         '2026-04-03 01:00:00+00', '2026-04-03 06:00:00+00',
         60, 30, 300, 270, 210, 1080, 300, 270, 210, 1080,
         '2026-04-03 01:00:00+00','2026-04-03 01:00:00+00','TPE','2026-04-03 01:00:00+00','2026-04-03 02:00:00+00',
         'BKK','2026-04-03 05:30:00+00','2026-04-03 06:00:00+00','2026-04-03 06:00:00+00','2026-04-03 06:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-04-03', 'BR006', 'BR', 'TPE', 'BKK', 'A321',
         '2026-04-03 02:00:00+00','2026-04-03 05:30:00+00',
         '2026-04-03 02:00:00+00','2026-04-03 05:30:00+00', 'FLT'),
        (p_id, 2, 'BKK', 'TPE',
         '2026-04-04 07:00:00+00', '2026-04-04 12:00:00+00',
         '2026-04-04 07:00:00+00', '2026-04-04 12:00:00+00',
         60, 30, 300, 270, 210, 0, 300, 270, 210, 0,
         '2026-04-04 07:00:00+00','2026-04-04 07:00:00+00','BKK','2026-04-04 07:00:00+00','2026-04-04 08:00:00+00',
         'TPE','2026-04-04 11:30:00+00','2026-04-04 12:00:00+00','2026-04-04 12:00:00+00','2026-04-04 12:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f2_id, '2026-04-04', 'BR016', 'BR', 'BKK', 'TPE', 'A321',
         '2026-04-04 08:00:00+00','2026-04-04 11:30:00+00',
         '2026-04-04 08:00:00+00','2026-04-04 11:30:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Pairing P13: Day 5 (Apr 4), TPE->NRT->TPE (B787)
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-04' AND flt_num='BR001';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-04' AND flt_num='BR011';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P13-NRT-0404', 'F8', 'P', 'TPE', 'B787', 'FLIGHT', 'FLT',
      '2026-04-03 23:00:00+00', '2026-04-04 10:30:00+00',
      '2026-04-03 23:00:00+00', '2026-04-04 10:30:00+00',
      1, 690, 1, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        (p_id, 1, 'TPE', 'TPE',
         '2026-04-03 23:00:00+00', '2026-04-04 10:30:00+00',
         '2026-04-03 23:00:00+00', '2026-04-04 10:30:00+00',
         60, 30, 690, 630, 360, 0, 690, 630, 360, 0,
         '2026-04-03 23:00:00+00','2026-04-03 23:00:00+00','TPE','2026-04-03 23:00:00+00','2026-04-04 00:00:00+00',
         'TPE','2026-04-04 10:00:00+00','2026-04-04 10:30:00+00','2026-04-04 10:30:00+00','2026-04-04 10:30:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-04-04', 'BR001', 'BR', 'TPE', 'NRT', 'B787',
         '2026-04-04 00:00:00+00','2026-04-04 03:00:00+00',
         '2026-04-04 00:00:00+00','2026-04-04 03:00:00+00', 'FLT'),
        (p_id, 1, 'TPE', 'TPE',
         '2026-04-03 23:00:00+00', '2026-04-04 10:30:00+00',
         '2026-04-03 23:00:00+00', '2026-04-04 10:30:00+00',
         60, 30, 690, 630, 360, 0, 690, 630, 360, 0,
         '2026-04-03 23:00:00+00','2026-04-03 23:00:00+00','TPE','2026-04-03 23:00:00+00','2026-04-04 00:00:00+00',
         'TPE','2026-04-04 10:00:00+00','2026-04-04 10:30:00+00','2026-04-04 10:30:00+00','2026-04-04 10:30:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         2, f2_id, '2026-04-04', 'BR011', 'BR', 'NRT', 'TPE', 'B787',
         '2026-04-04 07:00:00+00','2026-04-04 10:00:00+00',
         '2026-04-04 07:00:00+00','2026-04-04 10:00:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Pairing P14: Day 5 (Apr 4), TPE->ICN->TPE (A321)
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-04' AND flt_num='BR003';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-04' AND flt_num='BR013';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P14-ICN-0404', 'F8', 'P', 'TPE', 'A321', 'FLIGHT', 'FLT',
      '2026-04-03 23:30:00+00', '2026-04-04 09:00:00+00',
      '2026-04-03 23:30:00+00', '2026-04-04 09:00:00+00',
      1, 570, 1, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        (p_id, 1, 'TPE', 'TPE',
         '2026-04-03 23:30:00+00', '2026-04-04 09:00:00+00',
         '2026-04-03 23:30:00+00', '2026-04-04 09:00:00+00',
         60, 30, 570, 510, 300, 0, 570, 510, 300, 0,
         '2026-04-03 23:30:00+00','2026-04-03 23:30:00+00','TPE','2026-04-03 23:30:00+00','2026-04-04 00:30:00+00',
         'TPE','2026-04-04 08:30:00+00','2026-04-04 09:00:00+00','2026-04-04 09:00:00+00','2026-04-04 09:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-04-04', 'BR003', 'BR', 'TPE', 'ICN', 'A321',
         '2026-04-04 00:30:00+00','2026-04-04 03:00:00+00',
         '2026-04-04 00:30:00+00','2026-04-04 03:00:00+00', 'FLT'),
        (p_id, 1, 'TPE', 'TPE',
         '2026-04-03 23:30:00+00', '2026-04-04 09:00:00+00',
         '2026-04-03 23:30:00+00', '2026-04-04 09:00:00+00',
         60, 30, 570, 510, 300, 0, 570, 510, 300, 0,
         '2026-04-03 23:30:00+00','2026-04-03 23:30:00+00','TPE','2026-04-03 23:30:00+00','2026-04-04 00:30:00+00',
         'TPE','2026-04-04 08:30:00+00','2026-04-04 09:00:00+00','2026-04-04 09:00:00+00','2026-04-04 09:00:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         2, f2_id, '2026-04-04', 'BR013', 'BR', 'ICN', 'TPE', 'A321',
         '2026-04-04 06:00:00+00','2026-04-04 08:30:00+00',
         '2026-04-04 06:00:00+00','2026-04-04 08:30:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Pairing P15: Day 6 (Apr 5), TPE->NRT->TPE (B787)
  -- -------------------------------------------------------
  SELECT id INTO f1_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-05' AND flt_num='BR001';
  SELECT id INTO f2_id FROM flight WHERE airline='BR' AND flt_dt='2026-04-05' AND flt_num='BR011';

  IF f1_id IS NOT NULL AND f2_id IS NOT NULL THEN
    INSERT INTO pairing (pairing_label, filiale, division, base, fleet, assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count)
    VALUES ('P15-NRT-0405', 'F8', 'P', 'TPE', 'B787', 'FLIGHT', 'FLT',
      '2026-04-04 23:00:00+00', '2026-04-05 10:30:00+00',
      '2026-04-04 23:00:00+00', '2026-04-05 10:30:00+00',
      1, 690, 1, 2)
    RETURNING id INTO p_id;

    IF p_id IS NOT NULL THEN
      INSERT INTO pairing_segment (pairing_id, duty_seq, duty_str_arp, duty_end_arp,
        duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
        duty_brief_min, duty_debrief_min, duty_sch_duty_min, duty_sch_fdp_min, duty_sch_flt_min, duty_sch_rest_min,
        duty_act_duty_min, duty_act_fdp_min, duty_act_flt_min, duty_act_rest_min,
        pickup_1_start_utc, pickup_1_end_utc, brief_1_airport, brief_1_start_utc, brief_1_end_utc,
        debrief_1_airport, debrief_1_start_utc, debrief_1_end_utc, dropoff_1_start_utc, dropoff_1_end_utc,
        pickup_2_start_utc, pickup_2_end_utc, brief_2_airport, brief_2_start_utc, brief_2_end_utc,
        debrief_2_airport, debrief_2_start_utc, debrief_2_end_utc, dropoff_2_start_utc, dropoff_2_end_utc,
        pickup_3_start_utc, pickup_3_end_utc, brief_3_airport, brief_3_start_utc, brief_3_end_utc,
        debrief_3_airport, debrief_3_start_utc, debrief_3_end_utc, dropoff_3_start_utc, dropoff_3_end_utc,
        seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
        act_str_dt_utc, act_end_dt_utc, sch_str_dt_utc, sch_end_dt_utc, seg_assignment)
      VALUES
        (p_id, 1, 'TPE', 'TPE',
         '2026-04-04 23:00:00+00', '2026-04-05 10:30:00+00',
         '2026-04-04 23:00:00+00', '2026-04-05 10:30:00+00',
         60, 30, 690, 630, 360, 0, 690, 630, 360, 0,
         '2026-04-04 23:00:00+00','2026-04-04 23:00:00+00','TPE','2026-04-04 23:00:00+00','2026-04-05 00:00:00+00',
         'TPE','2026-04-05 10:00:00+00','2026-04-05 10:30:00+00','2026-04-05 10:30:00+00','2026-04-05 10:30:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         1, f1_id, '2026-04-05', 'BR001', 'BR', 'TPE', 'NRT', 'B787',
         '2026-04-05 00:00:00+00','2026-04-05 03:00:00+00',
         '2026-04-05 00:00:00+00','2026-04-05 03:00:00+00', 'FLT'),
        (p_id, 1, 'TPE', 'TPE',
         '2026-04-04 23:00:00+00', '2026-04-05 10:30:00+00',
         '2026-04-04 23:00:00+00', '2026-04-05 10:30:00+00',
         60, 30, 690, 630, 360, 0, 690, 630, 360, 0,
         '2026-04-04 23:00:00+00','2026-04-04 23:00:00+00','TPE','2026-04-04 23:00:00+00','2026-04-05 00:00:00+00',
         'TPE','2026-04-05 10:00:00+00','2026-04-05 10:30:00+00','2026-04-05 10:30:00+00','2026-04-05 10:30:00+00',
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         the_epoch,the_epoch,'---',the_epoch,the_epoch,'---',the_epoch,the_epoch,the_epoch,the_epoch,
         2, f2_id, '2026-04-05', 'BR011', 'BR', 'NRT', 'TPE', 'B787',
         '2026-04-05 07:00:00+00','2026-04-05 10:00:00+00',
         '2026-04-05 07:00:00+00','2026-04-05 10:00:00+00', 'FLT')
      ON CONFLICT (pairing_id, duty_seq, seg_seq) DO NOTHING;
    END IF;
  END IF;

END
$$;

-- ============================================================
-- 4. Roster data (flight assignments + ground duties)
-- ============================================================

-- 4a. Flight roster assignments — assign pairings to crew
-- Each pairing gets a CA + FO pair, and for some a PU + FA
DO $$
DECLARE
  p_rec RECORD;
  ps_rec RECORD;
  flt_rec RECORD;
BEGIN
  -- For each pairing, assign crew based on fleet
  FOR p_rec IN
    SELECT p.id AS pairing_id, p.pairing_label, p.fleet, p.division,
           p.sch_str_dt_utc, p.sch_end_dt_utc, p.base, p.assignment_group, p.assignment
    FROM pairing p
    WHERE p.is_deleted = 0
    ORDER BY p.id
  LOOP
    -- For each segment in the pairing
    FOR ps_rec IN
      SELECT ps.duty_seq, ps.seg_seq, ps.flt_id, ps.flt_dt, ps.flt_num,
             ps.sch_str_dt_utc, ps.sch_end_dt_utc
      FROM pairing_segment ps
      WHERE ps.pairing_id = p_rec.pairing_id AND ps.is_deleted = 0
      ORDER BY ps.duty_seq, ps.seg_seq
    LOOP
      -- Determine crew based on pairing label prefix
      -- P01,P06,P08,P13,P15 -> NRT (B787): CA001+FO001, CA002+FO002, CA001+FO001, CA002+FO002, CA003+FO003
      -- P03,P10 -> SIN (B787): CA003+FO003, CA006+FO006
      -- P02,P09,P14 -> ICN (A321): CA004+FO004, CA005+FO005, CA004+FO004
      -- P04,P12 -> BKK (A321): CA005+FO005, CA007+FO007
      -- P05,P11 -> HKG (A321): CA007+FO007, CA009+FO009
      -- P07 -> PVG (A321): CA009+FO009

      -- CA assignment
      IF p_rec.pairing_label LIKE 'P01%' OR p_rec.pairing_label LIKE 'P08%' THEN
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'CA001', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'CA', 'CA', 'P', 'PIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (
          SELECT 1 FROM roster_flight rf WHERE rf.crew_id = 'CA001' AND rf.pairing_id = p_rec.pairing_id
            AND rf.duty_seq = ps_rec.duty_seq AND rf.seg_seq = ps_rec.seg_seq
        );
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'FO001', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'FO', 'FO', 'P', 'SIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (
          SELECT 1 FROM roster_flight rf WHERE rf.crew_id = 'FO001' AND rf.pairing_id = p_rec.pairing_id
            AND rf.duty_seq = ps_rec.duty_seq AND rf.seg_seq = ps_rec.seg_seq
        );
        -- Cabin crew
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'PU001', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'PU', 'PU', 'C', 'PU',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (
          SELECT 1 FROM roster_flight rf WHERE rf.crew_id = 'PU001' AND rf.pairing_id = p_rec.pairing_id
            AND rf.duty_seq = ps_rec.duty_seq AND rf.seg_seq = ps_rec.seg_seq
        );
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'FA001', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'FA', 'FA', 'C', 'FA',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (
          SELECT 1 FROM roster_flight rf WHERE rf.crew_id = 'FA001' AND rf.pairing_id = p_rec.pairing_id
            AND rf.duty_seq = ps_rec.duty_seq AND rf.seg_seq = ps_rec.seg_seq
        );

      ELSIF p_rec.pairing_label LIKE 'P06%' OR p_rec.pairing_label LIKE 'P13%' THEN
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'CA002', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'CA', 'CA', 'P', 'PIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (
          SELECT 1 FROM roster_flight rf WHERE rf.crew_id = 'CA002' AND rf.pairing_id = p_rec.pairing_id
            AND rf.duty_seq = ps_rec.duty_seq AND rf.seg_seq = ps_rec.seg_seq
        );
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'FO002', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'FO', 'FO', 'P', 'SIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (
          SELECT 1 FROM roster_flight rf WHERE rf.crew_id = 'FO002' AND rf.pairing_id = p_rec.pairing_id
            AND rf.duty_seq = ps_rec.duty_seq AND rf.seg_seq = ps_rec.seg_seq
        );
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'PU002', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'PU', 'PU', 'C', 'PU',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (
          SELECT 1 FROM roster_flight rf WHERE rf.crew_id = 'PU002' AND rf.pairing_id = p_rec.pairing_id
            AND rf.duty_seq = ps_rec.duty_seq AND rf.seg_seq = ps_rec.seg_seq
        );
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'FA002', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'FA', 'FA', 'C', 'FA',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (
          SELECT 1 FROM roster_flight rf WHERE rf.crew_id = 'FA002' AND rf.pairing_id = p_rec.pairing_id
            AND rf.duty_seq = ps_rec.duty_seq AND rf.seg_seq = ps_rec.seg_seq
        );

      ELSIF p_rec.pairing_label LIKE 'P03%' OR p_rec.pairing_label LIKE 'P15%' THEN
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'CA003', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'CA', 'CA', 'P', 'PIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='CA003' AND rf.pairing_id=p_rec.pairing_id AND rf.duty_seq=ps_rec.duty_seq AND rf.seg_seq=ps_rec.seg_seq);
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'FO003', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'FO', 'FO', 'P', 'SIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='FO003' AND rf.pairing_id=p_rec.pairing_id AND rf.duty_seq=ps_rec.duty_seq AND rf.seg_seq=ps_rec.seg_seq);

      ELSIF p_rec.pairing_label LIKE 'P02%' OR p_rec.pairing_label LIKE 'P09%' THEN
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'CA004', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'CA', 'CA', 'P', 'PIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='CA004' AND rf.pairing_id=p_rec.pairing_id AND rf.duty_seq=ps_rec.duty_seq AND rf.seg_seq=ps_rec.seg_seq);
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'FO004', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'FO', 'FO', 'P', 'SIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='FO004' AND rf.pairing_id=p_rec.pairing_id AND rf.duty_seq=ps_rec.duty_seq AND rf.seg_seq=ps_rec.seg_seq);

      ELSIF p_rec.pairing_label LIKE 'P04%' OR p_rec.pairing_label LIKE 'P14%' THEN
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'CA005', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'CA', 'CA', 'P', 'PIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='CA005' AND rf.pairing_id=p_rec.pairing_id AND rf.duty_seq=ps_rec.duty_seq AND rf.seg_seq=ps_rec.seg_seq);
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'FO005', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'FO', 'FO', 'P', 'SIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='FO005' AND rf.pairing_id=p_rec.pairing_id AND rf.duty_seq=ps_rec.duty_seq AND rf.seg_seq=ps_rec.seg_seq);

      ELSIF p_rec.pairing_label LIKE 'P10%' THEN
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'CA006', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'CA', 'CA', 'P', 'PIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='CA006' AND rf.pairing_id=p_rec.pairing_id AND rf.duty_seq=ps_rec.duty_seq AND rf.seg_seq=ps_rec.seg_seq);
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'FO006', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'FO', 'FO', 'P', 'SIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='FO006' AND rf.pairing_id=p_rec.pairing_id AND rf.duty_seq=ps_rec.duty_seq AND rf.seg_seq=ps_rec.seg_seq);

      ELSIF p_rec.pairing_label LIKE 'P05%' OR p_rec.pairing_label LIKE 'P12%' THEN
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'CA007', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'CA', 'CA', 'P', 'PIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='CA007' AND rf.pairing_id=p_rec.pairing_id AND rf.duty_seq=ps_rec.duty_seq AND rf.seg_seq=ps_rec.seg_seq);
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'FO007', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'FO', 'FO', 'P', 'SIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='FO007' AND rf.pairing_id=p_rec.pairing_id AND rf.duty_seq=ps_rec.duty_seq AND rf.seg_seq=ps_rec.seg_seq);

      ELSIF p_rec.pairing_label LIKE 'P07%' OR p_rec.pairing_label LIKE 'P11%' THEN
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'CA009', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'CA', 'CA', 'P', 'PIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='CA009' AND rf.pairing_id=p_rec.pairing_id AND rf.duty_seq=ps_rec.duty_seq AND rf.seg_seq=ps_rec.seg_seq);
        INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
          flt_id, duty_seq, seg_seq, flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
        SELECT 'FO009', p_rec.pairing_id, 'TPE', p_rec.assignment_group, p_rec.assignment, 'FO', 'FO', 'P', 'SIC',
          ps_rec.flt_id, ps_rec.duty_seq, ps_rec.seg_seq, ps_rec.flt_dt,
          ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc, ps_rec.sch_str_dt_utc, ps_rec.sch_end_dt_utc,
          p_rec.pairing_label, 'CREW', 1
        WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='FO009' AND rf.pairing_id=p_rec.pairing_id AND rf.duty_seq=ps_rec.duty_seq AND rf.seg_seq=ps_rec.seg_seq);
      END IF;

    END LOOP;
  END LOOP;
END
$$;

-- 4b. Ground duties (training, standby, day off)
-- CA008: Training on Apr 1
INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
  flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
SELECT 'CA008', 0, 'TPE', 'TRAINING', 'TRN', 'CA', 'CA', 'P', 'PIC',
  '2026-04-01', '2026-04-01 00:00:00+00', '2026-04-01 08:00:00+00', '2026-04-01 00:00:00+00', '2026-04-01 08:00:00+00',
  'TRN-SIM', 'CREW', 1
WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='CA008' AND rf.assignment='TRN' AND rf.flt_dt='2026-04-01');

-- CA010: Standby on Apr 2
INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
  flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
SELECT 'CA010', 0, 'TPE', 'STANDBY', 'SBY', 'CA', 'CA', 'P', 'PIC',
  '2026-04-02', '2026-04-02 00:00:00+00', '2026-04-02 12:00:00+00', '2026-04-02 00:00:00+00', '2026-04-02 12:00:00+00',
  'SBY', 'CREW', 1
WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='CA010' AND rf.assignment='SBY' AND rf.flt_dt='2026-04-02');

-- FO008: Training on Apr 1
INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
  flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
SELECT 'FO008', 0, 'TPE', 'TRAINING', 'SIM', 'FO', 'FO', 'P', 'SIC',
  '2026-04-01', '2026-04-01 00:00:00+00', '2026-04-01 04:00:00+00', '2026-04-01 00:00:00+00', '2026-04-01 04:00:00+00',
  'SIM', 'CREW', 1
WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='FO008' AND rf.assignment='SIM' AND rf.flt_dt='2026-04-01');

-- FO010: Day Off on Apr 3-4
INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
  flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
SELECT 'FO010', 0, 'TPE', 'LEAVE', 'DO', 'FO', 'FO', 'P', 'SIC',
  '2026-04-03', '2026-04-02 16:00:00+00', '2026-04-03 16:00:00+00', '2026-04-02 16:00:00+00', '2026-04-03 16:00:00+00',
  'DO', 'CREW', 1
WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='FO010' AND rf.assignment='DO' AND rf.flt_dt='2026-04-03');

INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
  flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
SELECT 'FO010', 0, 'TPE', 'LEAVE', 'DO', 'FO', 'FO', 'P', 'SIC',
  '2026-04-04', '2026-04-03 16:00:00+00', '2026-04-04 16:00:00+00', '2026-04-03 16:00:00+00', '2026-04-04 16:00:00+00',
  'DO', 'CREW', 1
WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='FO010' AND rf.assignment='DO' AND rf.flt_dt='2026-04-04');

-- PU003: Standby on Apr 2
INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
  flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
SELECT 'PU003', 0, 'TPE', 'STANDBY', 'SBY', 'PU', 'PU', 'C', 'PU',
  '2026-04-02', '2026-04-02 00:00:00+00', '2026-04-02 12:00:00+00', '2026-04-02 00:00:00+00', '2026-04-02 12:00:00+00',
  'SBY', 'CREW', 1
WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='PU003' AND rf.assignment='SBY' AND rf.flt_dt='2026-04-02');

-- FA003: Annual leave Apr 1-3
INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
  flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
SELECT 'FA003', 0, 'TPE', 'LEAVE', 'AL', 'FA', 'FA', 'C', 'FA',
  to_char(d, 'YYYY-MM-DD'), d::timestamptz, (d + interval '1 day')::timestamptz,
  d::timestamptz, (d + interval '1 day')::timestamptz,
  'AL', 'CREW', 1
FROM generate_series('2026-04-01'::date, '2026-04-03'::date, '1 day'::interval) AS d
WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='FA003' AND rf.assignment='AL' AND rf.flt_dt=to_char(d, 'YYYY-MM-DD'));

-- PU004: Training on Apr 3
INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
  flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
SELECT 'PU004', 0, 'TPE', 'TRAINING', 'TRN', 'PU', 'PU', 'C', 'PU',
  '2026-04-03', '2026-04-03 00:00:00+00', '2026-04-03 08:00:00+00', '2026-04-03 00:00:00+00', '2026-04-03 08:00:00+00',
  'TRN', 'CREW', 1
WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='PU004' AND rf.assignment='TRN' AND rf.flt_dt='2026-04-03');

-- FA004: Sick leave on Apr 2
INSERT INTO roster_flight (crew_id, pairing_id, base, assignment_group, assignment, acting_rank, active_rank, division, position,
  flt_dt, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, label, role, ver)
SELECT 'FA004', 0, 'TPE', 'LEAVE', 'SL', 'FA', 'FA', 'C', 'FA',
  '2026-04-02', '2026-04-02 00:00:00+00', '2026-04-03 00:00:00+00', '2026-04-02 00:00:00+00', '2026-04-03 00:00:00+00',
  'SL', 'CREW', 1
WHERE NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id='FA004' AND rf.assignment='SL' AND rf.flt_dt='2026-04-02');

-- ============================================================
-- end of 90-mock-data.sql
-- ============================================================
