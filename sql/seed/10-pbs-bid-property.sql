-- ============================================================
-- 10-pbs-bid-property.sql — PBS 申请条件属性定义
-- ============================================================
-- 功能：初始化 pbs_bid_property 表，定义 PBS 竞标属性
--       涵盖 Pairing(101-130)、DaysOff(201-206)、
--       Reserve(301-302, 311-314)、Line(401-408) 四大类型；
--       AA 扩展属性默认入库隐藏，由 is_visible_in_portal 控制展示
-- 表：  pbs_bid_property
-- 幂等：INSERT ... ON CONFLICT (property_code) DO NOTHING
-- 修改记录：
--   2026-03-25  初始创建
-- ============================================================

-- ============================================================
-- Pairing 类属性（101-130）— 航班环偏好
-- ============================================================
INSERT INTO pbs_bid_property (property_code, bid_type, property_name, award_or_avoid, any_or_every, operator_options, validation_json, tooltip, is_active) VALUES

    -- 机场相关
    (101, 'Pairing', 'Any Landing In Airport',
     '["award","avoid"]', '["any","every"]', '["In"]',
     '{"type":"multi_select","label":"Airport","format":"IATA"}',
     'Award/Avoid pairings with any landing in specified airports. Example: Award Pairings IF Any Landing In SFO,LAX', 1),

    (102, 'Pairing', 'Any Departure From Airport',
     '["award","avoid"]', '["any","every"]', '["In"]',
     '{"type":"multi_select","label":"Airport","format":"IATA"}',
     'Award/Avoid pairings departing from specified airports', 1),

    (103, 'Pairing', 'Any Layover At Airport',
     '["award","avoid"]', '["any","every"]', '["In"]',
     '{"type":"multi_select","label":"Airport","format":"IATA"}',
     'Award/Avoid pairings with layover at specified airports', 1),

    (104, 'Pairing', 'Pairing Departs From Base',
     '["award","avoid"]', null, '["="]',
     '{"type":"select","label":"Base","format":"IATA"}',
     'Pairing originates from specific base airport', 1),

    -- 时间相关
    (105, 'Pairing', 'Check-In Time',
     '["award","avoid"]', null, '["<",">","=","Between"]',
     '{"type":"time","label":"Time","format":"HH:mm"}',
     'Check-in (report) time. Example: Award Pairings IF Check-In Time > 10:00', 1),

    (106, 'Pairing', 'Check-Out Time',
     '["award","avoid"]', null, '["<",">","=","Between"]',
     '{"type":"time","label":"Time","format":"HH:mm"}',
     'Check-out (release) time at end of pairing', 1),

    (107, 'Pairing', 'Departure Time',
     '["award","avoid"]', '["any","every"]', '["<",">","=","Between"]',
     '{"type":"time","label":"Time","format":"HH:mm"}',
     'First departure time of pairing or any segment', 1),

    (108, 'Pairing', 'Arrival Time',
     '["award","avoid"]', '["any","every"]', '["<",">","=","Between"]',
     '{"type":"time","label":"Time","format":"HH:mm"}',
     'Last arrival time of pairing or any segment', 1),

    (109, 'Pairing', 'Report Day of Week',
     '["award","avoid"]', null, '["In"]',
     '{"type":"multi_select","label":"Day","format":"DOW"}',
     'Day of week the pairing report falls on. Example: Avoid Pairings IF Report Day of Week In Mon,Tue', 1),

    (110, 'Pairing', 'Release Day of Week',
     '["award","avoid"]', null, '["In"]',
     '{"type":"multi_select","label":"Day","format":"DOW"}',
     'Day of week the pairing release falls on', 1),

    -- 数量/时长相关
    (111, 'Pairing', 'Number of Legs',
     '["award","avoid"]', null, '["<",">","=","Between"]',
     '{"type":"integer","label":"Legs","min":1,"max":20}',
     'Total number of flight legs in the pairing', 1),

    (112, 'Pairing', 'Number of Duty Days',
     '["award","avoid"]', null, '["<",">","=","Between"]',
     '{"type":"integer","label":"Days","min":1,"max":7}',
     'Total number of duty days in the pairing', 1),

    (113, 'Pairing', 'Number of Layovers',
     '["award","avoid"]', null, '["<",">","=","Between"]',
     '{"type":"integer","label":"Layovers","min":0,"max":6}',
     'Number of overnight layovers in the pairing', 1),

    (114, 'Pairing', 'Block Time',
     '["award","avoid"]', null, '["<",">","=","Between"]',
     '{"type":"duration","label":"Block Time","format":"HH:mm"}',
     'Total block (flight) time of the pairing. Example: Award Pairings IF Block Time > 08:00', 1),

    (115, 'Pairing', 'Credit Time',
     '["award","avoid"]', null, '["<",">","=","Between"]',
     '{"type":"duration","label":"Credit","format":"HH:mm"}',
     'Total credit time (pay hours) of the pairing', 1),

    (116, 'Pairing', 'TAFB',
     '["award","avoid"]', null, '["<",">","=","Between"]',
     '{"type":"duration","label":"TAFB","format":"HH:mm"}',
     'Time Away From Base — total elapsed time from check-in to final release', 1),

    (117, 'Pairing', 'Duty Period Length',
     '["award","avoid"]', '["any","every"]', '["<",">","=","Between"]',
     '{"type":"duration","label":"Duty Period","format":"HH:mm"}',
     'Length of any/every individual duty period within the pairing', 1),

    (118, 'Pairing', 'Layover Duration',
     '["award","avoid"]', '["any","every"]', '["<",">","=","Between"]',
     '{"type":"duration","label":"Layover","format":"HH:mm"}',
     'Duration of any/every layover rest period', 1),

    -- 航班特征
    (119, 'Pairing', 'Flight Number',
     '["award","avoid"]', '["any","every"]', '["In"]',
     '{"type":"multi_input","label":"Flight No.","format":"TEXT"}',
     'Specific flight numbers. Example: Award Pairings IF Any Flight Number In CA101,CA102', 1),

    (120, 'Pairing', 'Fleet Type',
     '["award","avoid"]', null, '["In"]',
     '{"type":"multi_select","label":"Fleet","format":"FLEET"}',
     'Aircraft fleet type for the pairing', 1),

    (121, 'Pairing', 'Segment Type',
     '["award","avoid"]', '["any","every"]', '["In"]',
     '{"type":"multi_select","label":"Seg Type","format":"SEG_TYPE"}',
     'Domestic/International segment type', 1),

    (122, 'Pairing', 'Pairing Date',
     '["award","avoid"]', null, '["In","Between"]',
     '{"type":"date","label":"Date","format":"YYYY-MM-DD"}',
     'Specific dates the pairing operates on', 1),

    (123, 'Pairing', 'Deadhead Indicator',
     '["award","avoid"]', null, '["="]',
     '{"type":"boolean","label":"Has Deadhead"}',
     'Whether the pairing contains any deadhead segments', 1),

    (124, 'Pairing', 'Red-Eye Indicator',
     '["award","avoid"]', null, '["="]',
     '{"type":"boolean","label":"Red-Eye"}',
     'Whether the pairing contains red-eye (overnight) flights', 1),

    (125, 'Pairing', 'International Indicator',
     '["award","avoid"]', null, '["="]',
     '{"type":"boolean","label":"International"}',
     'Whether the pairing contains any international segments', 1),

    -- 高级组合
    (126, 'Pairing', 'Legs Per Duty Day',
     '["award","avoid"]', '["any","every"]', '["<",">","=","Between"]',
     '{"type":"integer","label":"Legs/Day","min":1,"max":8}',
     'Number of legs in any/every individual duty day', 1),

    (127, 'Pairing', 'Ground Time',
     '["award","avoid"]', '["any","every"]', '["<",">","=","Between"]',
     '{"type":"duration","label":"Ground Time","format":"HH:mm"}',
     'Ground time (sit time) between consecutive legs', 1),

    (128, 'Pairing', 'Deadhead Day',
     '["award","avoid"]', null, null,
     '{"type":"flag"}',
     'Award/Avoid pairings containing a deadhead day', 1),

    (129, 'Pairing', 'Carry-In / Carry-Out',
     '["award","avoid"]', null, '["="]',
     '{"type":"select","label":"Carry Type","options":["carry_in","carry_out","both"]}',
     'Pairings that start before or end after the bid period', 1),

    (130, 'Pairing', 'Position',
     '["award","avoid"]', null, '["In"]',
     '{"type":"multi_select","label":"Position","format":"POSITION"}',
     'Crew position in the pairing (PIC, SIC, RP, etc.)', 1)
ON CONFLICT (property_code) DO NOTHING;

-- ============================================================
-- DaysOff 类属性（201-206）— 休息日偏好
-- ============================================================
INSERT INTO pbs_bid_property (property_code, bid_type, property_name, award_or_avoid, any_or_every, operator_options, validation_json, tooltip, is_active) VALUES

    (201, 'DaysOff', 'Prefer Off On Date',
     null, null, '["In"]',
     '{"type":"date","label":"Date","format":"YYYY-MM-DD","multi":true}',
     'Request specific dates off. Example: Prefer Off On Date In 2025-12-25,2025-12-26', 1),

    (202, 'DaysOff', 'Prefer Off On Day of Week',
     null, null, '["In"]',
     '{"type":"multi_select","label":"Day","format":"DOW"}',
     'Request specific days of week off. Example: Prefer Off On Day of Week In Sat,Sun', 1),

    (203, 'DaysOff', 'Prefer Off Weekends',
     null, null, null,
     '{"type":"none"}',
     'Request weekends (Sat+Sun pairs) off. Supports minimum_n parameter.', 1),

    (204, 'DaysOff', 'Prefer Consecutive Days Off',
     null, null, '[">="]',
     '{"type":"integer","label":"Min Days","min":2,"max":7}',
     'Request consecutive days off of at least N days', 1),

    (205, 'DaysOff', 'Prefer Off Period',
     null, null, '["Between"]',
     '{"type":"date_range","label":"Period","format":"YYYY-MM-DD"}',
     'Request a continuous period off between two dates', 1),

    (206, 'DaysOff', 'Maximum Working Days Before Off',
     null, null, '["<="]',
     '{"type":"integer","label":"Max Days","min":1,"max":14}',
     'Limit maximum consecutive working days before a day off', 1)
ON CONFLICT (property_code) DO NOTHING;

-- ============================================================
-- Legacy catalog alignment — 旧库 crew_bids_reference 默认展示
-- ============================================================
UPDATE pbs_bid_property AS property
SET
  bid_type = legacy.bid_type,
  property_name = legacy.property_name,
  award_or_avoid = legacy.award_or_avoid,
  any_or_every = legacy.any_or_every,
  operator_options = legacy.operator_options,
  validation_json = legacy.validation_json,
  tooltip = legacy.tooltip,
  source_type = 'legacy',
  is_visible_in_portal = case
    when legacy.bid_type = 'DaysOff' and legacy.property_code not in (201, 204) then 0
    else 1
  end,
  display_order = legacy.property_code,
  is_active = 1,
  updated_at = now()
FROM (
  VALUES
    (101, 'Pairing', 'Any Landing In Airport', '["award","avoid"]', '["any"]', '["In"]', '{"type":"airport","format":"IATA","label":"Airports","multi":true}', 'Award/Avoid Pairings If Any Landing In airport.'),
    (102, 'Pairing', 'Pairing Preference', '["award","avoid"]', null, '["In"]', '{"type":"pairing","label":"Pairings","multi":true,"stableIds":true}', 'Award/Avoid selected pairings. Search and filters only help choose Pairing IDs and do not add bid conditions.'),
    (103, 'Pairing', 'Pairing Check-In / Check-Out Time', '["award","avoid"]', null, '["=","<",">","Between"]', '{"type":"pairing-check-time","timeType":["check_in","check_out"],"timeWindow":["=","<",">","Between"],"dateScope":["specific_dates","date_range"]}', 'Award or avoid pairings by check-in or check-out time, optionally limited to pairing dates.'),
    (104, 'Pairing', 'Any/Every Layover In Airport', '["award","avoid"]', '["any","every"]', '["In"]', '{"type":"airport","format":"IATA","label":"Airports","multi":true}', 'Award/Avoid pairings by layover airport.'),
    (105, 'Pairing', 'Pairing Total Credit', '["award","avoid"]', null, '["<","=",">","Between"]', '{"type":"credit","format":"HH:MM","label":"Credit"}', 'Award/Avoid pairings by total credit.'),
    (106, 'Pairing', 'Departure Date / Day', '["award","avoid"]', null, '["In","Between"]', '{"type":"date_or_dow","label":"Date / Day","multi":true}', 'Award/Avoid pairings by departure date or day.'),
    (107, 'Pairing', 'Flight Legs per Duty', '["award","avoid"]', '["any","every"]', '["<","=",">","Between"]', '{"type":"flight-legs-per-duty","label":"Legs","min":1,"max":8,"dateScope":["specific_dates","date_range"]}', 'Award or avoid pairings by FLY legs per duty, optionally limited to event dates.'),
    (108, 'Pairing', 'Total Legs In Pairing', '["award","avoid"]', null, '["<","=",">"]', '{"type":"int","label":"Legs","min":1}', 'Award/Avoid pairings by total legs.'),
    (109, 'Pairing', 'Average Daily Credit', '["award","avoid"]', null, '["<","=",">","Between"]', '{"type":"credit","format":"HH:MM","label":"Average Daily Credit"}', 'Award/Avoid pairings by average daily credit.'),
    (110, 'Pairing', 'Work Day Preference', '["award"]', null, null, '{"type":"work_day_preference","label":"Work Days & Check-In Window","weekdays":true,"checkInWindow":true,"checkInWindowRequired":true,"checkInWindowEndpoints":"both","dateScope":["specific_dates","date_range"]}', 'Award pairings when a duty check-in matches a selected weekday and its required local check-in From/To window, optionally limited to event dates.'),
    (111, 'Pairing', 'Pairing Check-Out Time', '["award","avoid"]', null, '["<","=",">","Between"]', '{"type":"time_of_day","format":"HH:MM","label":"Check-Out Time"}', 'Award/Avoid pairings by check-out time.'),
    (112, 'Pairing', 'Pairing Length', '["award","avoid"]', null, null, '{"type":"pairing_length_preference","label":"Days","min":1,"max":7,"dateScope":["specific_dates","date_range"]}', 'Award or avoid pairings by pairing length, optionally limited to pairing start dates.'),
    (113, 'Pairing', 'TAFB', '["award","avoid"]', null, '["<",">","Between"]', '{"type":"int","label":"Days","min":1,"max":14}', 'Award/Avoid pairings by time away from base.'),
    (114, 'Pairing', 'Any/Every Enroute Check-In Time', '["award","avoid"]', '["any","every"]', '["<","=",">"]', '{"type":"time_of_day","format":"HH:MM","label":"Enroute Check-In Time"}', 'Award/Avoid pairings by any or every enroute check-in time.'),
    (115, 'Pairing', 'Any/Every Leg With Employee Number', '["award"]', '["any","every"]', '["In"]', '{"type":"crew_id","label":"Employee Number","multi":true}', 'Award pairings with another employee number.'),
    (116, 'Pairing', 'Flight Number Preference', '["award","avoid"]', null, null, '{"type":"flight-number-preference","label":"Flight Numbers","multi":true,"dateScope":["specific_dates","date_range"]}', 'Award/Avoid pairings containing a selected actual flight, optionally limited to flight operating dates.'),
    (117, 'Pairing', 'Redeye Preference', '["award","avoid"]', null, null, '{"type":"redeye_preference","dateScope":["specific_dates","date_range"]}', 'Award/Avoid pairings with a flight operating within the company-defined Redeye window, optionally limited to flight dates.'),
    (118, 'Pairing', 'Any/Every Duty Duration', '["award","avoid"]', '["any","every"]', '["<",">","Between"]', '{"type":"duration","format":"HH:MM","label":"Duty Duration"}', 'Award/Avoid pairings by duty duration.'),
    (119, 'Pairing', 'Any/Every Layover Duration', '["award","avoid"]', '["any","every"]', '["<",">"]', '{"type":"duration","format":"HH:MM","label":"Layover Duration"}', 'Award/Avoid pairings by layover duration.'),
    (120, 'Pairing', 'Any Duty On Time', '["award","avoid"]', '["any"]', '["<","=",">","Between"]', '{"type":"time_of_day","format":"HH:MM","label":"Duty Time"}', 'Award/Avoid pairings by duty time.'),
    (121, 'Pairing', 'Average Daily Block Time', '["award","avoid"]', null, '["<",">"]', '{"type":"credit","format":"HH:MM","label":"Average Daily Block Time"}', 'Award/Avoid pairings by average daily block time.'),
    (122, 'Pairing', 'Deadhead Flying', '["award","avoid"]', null, null, '{"type":"deadhead_flying","label":"Deadhead Flying","modes":["any-deadhead","deadhead-only-duty"],"dateScope":["specific_dates","date_range"],"dateField":"pairing_segment.flt_dt"}', 'Award/Avoid pairings by deadhead flying, optionally limited to flight dates.'),
    (123, 'Pairing', 'Any/Every Layover On Date / Day', '["award","avoid"]', '["any","every"]', '["In","Between"]', '{"type":"date_or_dow","label":"Layover Date / Day","multi":true}', 'Award/Avoid pairings by layover date or day.'),
    (124, 'Pairing', 'Total Legs In First Duty', '["award","avoid"]', null, '["<",">"]', '{"type":"int","label":"Legs","min":1}', 'Award/Avoid pairings by first duty legs.'),
    (125, 'Pairing', 'Credit Per Time Away From Base', '["award","avoid"]', null, '["<",">"]', '{"type":"percent_or_time","label":"Credit / TAFB"}', 'Award/Avoid pairings by credit per TAFB.'),
    (126, 'Pairing', 'Any/Every Enroute Check-Out Time', '["award","avoid"]', '["any","every"]', '["<","Between"]', '{"type":"time_of_day","format":"HH:MM","label":"Enroute Check-Out Time"}', 'Award/Avoid pairings by any or every enroute check-out time.'),
    (127, 'Pairing', 'Pairing Total Block Time', '["award"]', null, '[">","Between"]', '{"type":"credit","format":"HH:MM","label":"Block Time"}', 'Award pairings by total block time.'),
    (128, 'Pairing', 'Deadhead Day', '["award","avoid"]', null, null, '{"type":"flag"}', 'Award/Avoid pairings containing a deadhead day.'),
    (129, 'Pairing', 'Time Between Flights', '["award","avoid"]', '["any","every"]', '["<","=",">"]', '{"type":"duration","format":"HH:MM","label":"Time Between Flights"}', 'Award/Avoid pairings by time between same-duty consecutive flights.'),
    (130, 'Pairing', 'Total Legs In Last Duty', '["avoid"]', null, '[">"]', '{"type":"int","label":"Legs","min":1}', 'Avoid pairings by last duty legs.'),
    (201, 'DaysOff', 'Prefer Off', null, null, '["In","Between"]', '{"type":"date_or_dow","label":"Dates / Days","multi":true}', 'Prefer off on dates or days.'),
    (202, 'DaysOff', 'Max Consecutive Days On', null, null, null, '{"type":"int","label":"Max Days On","min":1}', 'Set maximum consecutive days on.'),
    (203, 'DaysOff', 'Min Consecutive Days Off', null, null, null, '{"type":"int","label":"Min Days Off","min":1}', 'Set minimum consecutive days off.'),
    (204, 'DaysOff', 'Long Stretch Off / Compressed Flying', null, null, '["Between"]', '{"type":"date_range","label":"Window"}', 'Request a long block of consecutive days off inside a window.'),
    (205, 'DaysOff', 'Days Off / Days On Pattern', null, null, '["Between"]', '{"A":{"type":"int","label":"Min Days Off","min":1},"B":{"type":"int","label":"Min Days On","min":1},"C":{"type":"int","label":"Max Days On","min":1}}', 'Set days off / days on pattern.'),
    (206, 'DaysOff', 'Employee Schedule Preference', null, null, null, '{"type":"employee_schedule_preference","label":"Employee Schedule Preference","min":1,"max":31}', 'Set a schedule preference relative to another employee.')
) AS legacy(property_code, bid_type, property_name, award_or_avoid, any_or_every, operator_options, validation_json, tooltip)
WHERE property.property_code = legacy.property_code;

-- AA 文档 property 保留入库，默认隐藏，后续可通过开关启用。
INSERT INTO pbs_bid_property (
  property_code,
  bid_type,
  property_name,
  award_or_avoid,
  any_or_every,
  operator_options,
  validation_json,
  tooltip,
  source_type,
  is_visible_in_portal,
  display_order,
  is_active
) VALUES
  (211, 'DaysOff', 'Minimum Days Off Between Work Blocks', null, null, null, '{"type":"integer","label":"Minimum Days Off","min":1,"max":12}', 'AA days off property retained but hidden by default.', 'aa', 0, 211, 1),
  (212, 'DaysOff', 'Maximize Weekend Days Off', null, null, null, '{"type":"none"}', 'AA days off property retained but hidden by default.', 'aa', 0, 212, 1),
  (213, 'DaysOff', 'Maximize Total Days Off', null, null, null, '{"type":"none"}', 'AA days off property retained but hidden by default.', 'aa', 0, 213, 1),
  (214, 'DaysOff', 'Maximize Block of Days Off', null, null, null, '{"type":"none"}', 'AA days off property retained but hidden by default.', 'aa', 0, 214, 1),
  (215, 'DaysOff', 'String of Days Off Starting on Date', null, null, null, '{"type":"date","label":"Start Date"}', 'AA days off property retained but hidden by default.', 'aa', 0, 215, 1),
  (216, 'DaysOff', 'String of Days Off Ending on Date', null, null, null, '{"type":"date","label":"End Date"}', 'AA days off property retained but hidden by default.', 'aa', 0, 216, 1),
  (217, 'DaysOff', 'Waive Minimum Days Off', null, null, null, '{"type":"none"}', 'AA days off property retained but hidden by default.', 'aa', 0, 217, 1)
ON CONFLICT (property_code) DO UPDATE SET
  bid_type = excluded.bid_type,
  property_name = excluded.property_name,
  award_or_avoid = excluded.award_or_avoid,
  any_or_every = excluded.any_or_every,
  operator_options = excluded.operator_options,
  validation_json = excluded.validation_json,
  tooltip = excluded.tooltip,
  source_type = excluded.source_type,
  is_visible_in_portal = excluded.is_visible_in_portal,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  updated_at = now();

INSERT INTO pbs_bid_property (
  property_code,
  bid_type,
  property_name,
  award_or_avoid,
  any_or_every,
  operator_options,
  validation_json,
  tooltip,
  source_type,
  is_visible_in_portal,
  display_order,
  is_active
) VALUES
  (131, 'Pairing', 'Prefer Pairing Length', '["award","avoid"]', null, '["<","=",">","Between"]', '{"type":"int","label":"Days","min":1,"max":7}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 131, 1),
  (132, 'Pairing', 'Prefer Pairing Length on Date', '["award","avoid"]', null, '["<","=",">","Between"]', '{"type":"int_date","label":"Days","min":1,"max":7}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 132, 1),
  (133, 'Pairing', 'Prefer Duty Period', null, null, '["<","=",">","Between"]', '{"type":"int","label":"Duty Periods","min":1,"max":4}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 133, 1),
  (134, 'Pairing', 'Report Between', '["award","avoid"]', null, '["<","=",">","Between"]', '{"type":"time_of_day","label":"Report Time"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 134, 1),
  (135, 'Pairing', 'Release Between', '["award","avoid"]', null, '["<","=",">","Between"]', '{"type":"time_of_day","label":"Release Time"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 135, 1),
  (136, 'Pairing', 'Mid-Pairing Report After', null, null, '[">"]', '{"type":"time_of_day","label":"Mid-Pairing Report"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 136, 1),
  (137, 'Pairing', 'Prefer Pairing Type', null, null, '["In"]', '{"type":"enum","label":"Pairing Type"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 137, 1),
  (139, 'Pairing', 'Report Between on Date', '["award","avoid"]', null, '["<","=",">","Between"]', '{"type":"time_date","label":"Report Time"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 139, 1),
  (140, 'Pairing', 'Release Between on Date', '["award","avoid"]', null, '["<","=",">","Between"]', '{"type":"time_date","label":"Release Time"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 140, 1),
  (141, 'Pairing', 'Mid-Pairing Release Before', null, null, '["<"]', '{"type":"time_of_day","label":"Mid-Pairing Release"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 141, 1),
  (142, 'Pairing', 'Minimum Avg Credit per Duty', null, null, null, '{"type":"credit","label":"Average Credit"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 142, 1),
  (143, 'Pairing', 'Maximum Duty Time per Duty', null, null, null, '{"type":"duration","label":"Duty Time"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 143, 1),
  (144, 'Pairing', 'Maximum Block per Duty', null, null, null, '{"type":"duration","label":"Block Time"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 144, 1),
  (145, 'Pairing', 'Minimum Connection Time', null, null, null, '{"type":"duration","label":"Connection Time"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 145, 1),
  (146, 'Pairing', 'Maximum Connection Time', null, null, null, '{"type":"duration","label":"Connection Time"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 146, 1),
  (147, 'Pairing', 'Prefer Deadheads', null, null, null, '{"type":"flag"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 147, 1),
  (148, 'Pairing', 'Avoid Deadheads', null, null, null, '{"type":"flag"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 148, 1),
  (149, 'Pairing', 'Co-Terminal / Satellite Airport', null, null, '["In"]', '{"type":"airport","label":"Airport"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 149, 1),
  (150, 'Pairing', 'Layover at City', '["award","avoid"]', '["any","every"]', '["In"]', '{"type":"airport","label":"Layover City","multi":true}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 150, 1),
  (151, 'Pairing', 'Avoid Layover at City', '["award","avoid"]', null, '["In"]', '{"type":"airport","label":"Layover City"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 151, 1),
  (152, 'Pairing', 'Layover at City on Date', '["award","avoid"]', '["any","every"]', '["In"]', '{"type":"airport_date","label":"Layover City","multi":true}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 152, 1),
  (153, 'Pairing', 'Minimum Layover Time', null, null, null, '{"type":"duration","label":"Layover Time"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 153, 1),
  (154, 'Pairing', 'Maximum Layover Time', null, null, null, '{"type":"duration","label":"Layover Time"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 154, 1),
  (155, 'Pairing', 'Prefer Landing at City', '["award","avoid"]', '["any"]', '["In"]', '{"type":"airport","label":"Landing City","multi":true}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 155, 1),
  (156, 'Pairing', 'Avoid Landing at City', '["award","avoid"]', '["any"]', '["In"]', '{"type":"airport","label":"Landing City","multi":true}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 156, 1),
  (157, 'Pairing', 'Prefer One Landing on First Duty', null, null, null, '{"type":"flag"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 157, 1),
  (158, 'Pairing', 'Prefer One Landing on Last Duty', null, null, null, '{"type":"flag"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 158, 1),
  (159, 'Pairing', 'Prefer Aircraft', '["award","avoid"]', null, '["In"]', '{"type":"aircraft","label":"Aircraft","multi":true}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 159, 1),
  (160, 'Pairing', 'Avoid Aircraft', '["award","avoid"]', null, '["In"]', '{"type":"aircraft","label":"Aircraft","multi":true}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 160, 1),
  (161, 'Pairing', 'Maximum Landing per Duty', null, null, null, '{"type":"int","label":"Landings","min":1,"max":4}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 161, 1),
    (162, 'Pairing', 'Prefer Positions Order', null, null, null, '{"type":"position_order","label":"Positions"}', 'AA-style migrated property retained but hidden by default.', 'aa', 0, 162, 1)
ON CONFLICT (property_code) DO UPDATE SET
  bid_type = excluded.bid_type,
  property_name = excluded.property_name,
  award_or_avoid = excluded.award_or_avoid,
  any_or_every = excluded.any_or_every,
  operator_options = excluded.operator_options,
  validation_json = excluded.validation_json,
  tooltip = excluded.tooltip,
  source_type = excluded.source_type,
  is_visible_in_portal = excluded.is_visible_in_portal,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  updated_at = now();

-- PBS Portal 可见扩展 property：用 Pairing 条件表达跨月 pairing 过滤，避免把下月占位显示在日历里。
INSERT INTO pbs_bid_property (
  property_code,
  bid_type,
  property_name,
  award_or_avoid,
  any_or_every,
  operator_options,
  validation_json,
  tooltip,
  source_type,
  is_visible_in_portal,
  display_order,
  is_active
) VALUES
  (163, 'Pairing', 'Month-End Carryover', '["award","avoid"]', null, '["<","=",">","Between"]', '{"type":"month_end_carryover","label":"Month-End Carryover","fieldLabel":"Carry-Out Days","min":1}', 'Award/Avoid pairings carrying into the next bid month by selected carry-out days.', 'legacy', 1, 163, 1),
  (164, 'Pairing', 'Departure Time', '["award","avoid"]', null, '["<","=",">","Between"]', '{"type":"time_of_day","format":"HH:MM","label":"Departure Time"}', 'Award/Avoid pairings by first scheduled flight departure time.', 'legacy', 1, 164, 1),
  (165, 'Pairing', 'Work Start Station', '["award","avoid"]', null, '["In"]', '{"type":"airport","format":"IATA","label":"Work Start Station","multi":true}', 'Award/Avoid pairings by the first duty work start station.', 'legacy', 1, 165, 1),
  (166, 'Pairing', 'Any/Every Enroute Check-In Date / Day', '["award","avoid"]', '["any","every"]', '["In","Between"]', '{"type":"date_or_dow","label":"Enroute Check-In Date / Day","multi":true}', 'Award/Avoid pairings by any or every enroute check-in date or day.', 'legacy', 1, 166, 1),
  (167, 'Pairing', 'Any/Every Enroute Check-Out Date / Day', '["award","avoid"]', '["any","every"]', '["In","Between"]', '{"type":"date_or_dow","label":"Enroute Check-Out Date / Day","multi":true}', 'Award/Avoid pairings by any or every enroute check-out date or day.', 'legacy', 1, 167, 1),
  (168, 'Pairing', 'Airport Preference', '["award","avoid"]', null, null, '{"type":"airport_preference","label":"Airport Preference","events":["landing","layover"],"dateCondition":["specific_dates","day","date_range"],"matchingCount":["=","<",">","Between"],"layoverDuration":["=","<",">","Between"]}', 'Award/Avoid pairings by landing or layover airport with optional date, count, and layover duration filters.', 'legacy', 1, 101, 1)
ON CONFLICT (property_code) DO UPDATE SET
  bid_type = excluded.bid_type,
  property_name = excluded.property_name,
  award_or_avoid = excluded.award_or_avoid,
  any_or_every = excluded.any_or_every,
  operator_options = excluded.operator_options,
  validation_json = excluded.validation_json,
  tooltip = excluded.tooltip,
  source_type = excluded.source_type,
  is_visible_in_portal = excluded.is_visible_in_portal,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  updated_at = now();

-- Jen Pairing catalog consolidation: only the Excel-approved Pairing conditions are visible/active.
UPDATE pbs_bid_property
SET
  is_visible_in_portal = case
    when property_code in (102, 103, 107, 110, 112, 116, 117, 122, 129, 163, 168) then 1
    else 0
  end,
  is_active = case
    when property_code in (102, 103, 107, 110, 112, 116, 117, 122, 129, 163, 168) then 1
    else 0
  end,
  updated_at = now()
WHERE bid_type = 'Pairing';

-- ============================================================
-- Reserve 类属性（301-302）— 旧库备勤偏好；311 为 AA Reserve Prefer Off
-- ============================================================
INSERT INTO pbs_bid_property (property_code, bid_type, property_name, award_or_avoid, any_or_every, operator_options, validation_json, tooltip, is_active) VALUES

    (301, 'Reserve', 'Reserve Preference',
     null, null, null,
     '{"type":"reserve_preference","label":"Reserve Preference","options":["CRAM","CRPM","PRAM","PRMM","PRPM","RESA","RESB"],"dateScope":["whole_month","first_half","second_half","date_range","specific_dates"],"shortCallType":true}',
     'Crew bids for reserve periods by short-call type and date scope.', 1),

    (302, 'Reserve', 'Reserve Day On',
     null, null, '["In"]',
     '{"type":"date","format":"MM/DD/YYYY","label":"Dates","multi":true}',
     'Award Reserve Day On Dec 5, 2025, Dec 6, 2025', 1),

    (311, 'Reserve', 'Reserve Prefer Off',
     null, null, '["In"]',
     '{"type":"date","format":"YYYY-MM-DD","label":"Dates","multi":true}',
     'AA Reserve Prefer Off dates. Example: Prefer Off 2026-04-05', 1)
ON CONFLICT (property_code) DO NOTHING;

UPDATE pbs_bid_property
SET
  property_name = 'Reserve Preference',
  award_or_avoid = null,
  any_or_every = null,
  operator_options = null,
  validation_json = '{"type":"reserve_preference","label":"Reserve Preference","options":["CRAM","CRPM","PRAM","PRMM","PRPM","RESA","RESB"],"dateScope":["whole_month","first_half","second_half","date_range","specific_dates"],"shortCallType":true}',
  tooltip = 'Crew bids for reserve periods by short-call type and date scope.',
  is_visible_in_portal = 1,
  is_active = 1,
  updated_at = now()
WHERE bid_type = 'Reserve'
  AND property_code = 301;

UPDATE pbs_bid_property
SET
  is_visible_in_portal = 0,
  is_active = 0,
  recommended_order = null,
  recommended_usage_count = 0,
  updated_at = now()
WHERE bid_type = 'Reserve'
  AND property_code IN (302, 311);

-- ============================================================
-- Line 类属性（401-429）— 旧库排班线偏好 + F8 员工端配置项
-- ============================================================
INSERT INTO pbs_bid_property (
  property_code,
  bid_type,
  property_name,
  award_or_avoid,
  any_or_every,
  operator_options,
  validation_json,
  tooltip,
  source_type,
  is_visible_in_portal,
  display_order,
  is_active
) VALUES

    (401, 'Line', 'Max Credit Window',
     null, null, null,
     '{"type":"flag"}',
     'Legacy Line property from crew_bids_reference. Hidden in Portal; retained for historical drafts.', 'legacy', 0, 401, 1),

    (402, 'Line', 'Min Credit Window',
     null, null, null,
     '{"type":"flag"}',
     'Legacy Line property from crew_bids_reference. Hidden in Portal; retained for historical drafts.', 'legacy', 0, 402, 1),

    (429, 'Line', 'Credit Window Preference',
     null, null, null,
     '{"type":"credit_window_preference","directions":["more","less"]}',
     'Choose More credit or Less credit. The adjustment is company-defined.', 'app', 1, 1, 1),

    (403, 'Line', 'Clear Schedule and Start Next Bid Group',
     null, null, null,
     '{"type":"flag"}',
     'Legacy Line property hidden by Jen Line catalog cleanup.', 'legacy', 0, 403, 0),

    (404, 'Line', 'No Same Day Pairings',
     null, null, null,
     '{"type":"flag"}',
     'Legacy Line property hidden by Jen Line catalog cleanup.', 'legacy', 0, 404, 0),

    (405, 'Line', 'Waive No Same Day Duty Starts',
     null, null, null,
     '{"type":"flag"}',
     'Legacy Line property hidden by Jen Line catalog cleanup.', 'legacy', 0, 405, 0),

    (406, 'Line', 'Forget Line',
     null, null, '["In"]',
     '{"type":"int","label":"Line Number","min":1}',
     'Legacy Line property hidden by Jen Line catalog cleanup.', 'legacy', 0, 406, 0),

    (407, 'Line', 'Minimum Base Layover',
     null, null, null,
     '{"type":"minimum_base_layover","format":"HHH:MM","minDuration":"013:00"}',
     'Set the minimum home-base spacing between pairings. Must be at least 13:00.', 'legacy', 1, 2, 1),

    (408, 'Line', 'Commuter Pattern',
     null, null, null,
     '{"type":"days_off_on_pattern","label":"Commuter Pattern","min":1,"max":14}',
     'Prefer line work/off blocks such as 5 on / 4 off or 4 on / 4 off.', 'legacy', 1, 3, 1),

    (409, 'Line', 'Most Flying In Least Working Days (Configured)',
     null, null, null,
     '{"type":"credit_density_preference","label":"Most Flying In Least Working Days (Configured)","minimumTotalCredit":{"min":"40:00","max":"120:00"},"maximumWorkingDays":{"min":1,"max":31},"strength":["normal","strong","must_try"]}',
     'Legacy configured credit-density condition; hidden from the Portal.', 'app', 0, 409, 0),

    (410, 'Line', 'Mixed Block Pattern',
     null, null, null,
     '{"type":"reserve_flying_date_pattern","label":"Mixed Block Pattern"}',
     'Prefer a mix of reserve and flying blocks.', 'app', 0, 5, 1)
ON CONFLICT (property_code) DO UPDATE SET
  bid_type = excluded.bid_type,
  property_name = excluded.property_name,
  award_or_avoid = excluded.award_or_avoid,
  any_or_every = excluded.any_or_every,
  operator_options = excluded.operator_options,
  validation_json = excluded.validation_json,
  tooltip = excluded.tooltip,
  source_type = excluded.source_type,
  is_visible_in_portal = excluded.is_visible_in_portal,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  updated_at = now();

-- AA Line 扩展属性（411-427）— 默认隐藏；427 Reserve 在 Line catalog 展示
INSERT INTO pbs_bid_property (
  property_code,
  bid_type,
  property_name,
  award_or_avoid,
  any_or_every,
  operator_options,
  validation_json,
  tooltip,
  source_type,
  is_visible_in_portal,
  display_order,
  is_active
) VALUES
  (411, 'Line', 'Target Credit Range', null, null, '["Between"]', '{"type":"credit_range","label":"Credit","min":40,"max":110}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 411, 0),
  (412, 'Line', 'Maximize Credit', null, null, null, '{"type":"flag"}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 412, 0),
  (413, 'Line', 'Maximize International Credit', null, null, null, '{"type":"flag"}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 413, 0),
  (414, 'Line', 'Work Block Size', null, null, '["Between"]', '{"type":"int_range","label":"Work Block Size","min":1,"max":12}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 414, 0),
  (415, 'Line', 'Prefer Cadence on Day-of-Week', null, null, '["In"]', '{"type":"dow","label":"Day"}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 415, 0),
  (416, 'Line', 'Commutable Work Block', null, null, '["Between"]', '{"type":"time_range","label":"Report / Release Window"}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 416, 0),
  (417, 'Line', 'Pairing Mix in a Work Block', null, null, '["In"]', '{"type":"pair_length_tuple","label":"Pairing Mix"}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 417, 0),
  (418, 'Line', 'Allow Double-Up on Date', null, null, '["In"]', '{"type":"date","label":"Date"}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 418, 0),
  (419, 'Line', 'Allow Multiple Pairings', null, null, null, '{"type":"flag"}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 419, 0),
  (420, 'Line', 'Allow Multiple Pairings on Date', null, null, '["In"]', '{"type":"date","label":"Date"}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 420, 0),
  (421, 'Line', 'Allow Co-Terminal Mix in Work Block', null, null, null, '{"type":"flag"}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 421, 0),
  (422, 'Line', 'Clear Bids', null, null, null, '{"type":"flag"}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 422, 0),
  (423, 'Line', 'Waive 24 hrs Rest in Domicile', null, null, null, '{"type":"flag"}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 423, 0),
  (424, 'Line', 'Waive Minimum Domicile Rest', null, null, null, '{"type":"flag"}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 424, 0),
  (425, 'Line', 'Waive 30 hrs in 7 Days', null, null, null, '{"type":"flag"}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 425, 0),
  (426, 'Line', 'Waive Carry-Over Credit', null, null, null, '{"type":"flag"}', 'AA Line extension retained but hidden by Jen Line catalog cleanup.', 'aa', 0, 426, 0),
  (427, 'Line', 'Reserve', '["award","avoid"]', null, null, '{"type":"flag"}', 'Line whole-month Reserve preference; Award means reserve-only and Avoid means no reserve.', 'aa', 1, 5, 1)
ON CONFLICT (property_code) DO UPDATE SET
  bid_type = excluded.bid_type,
  property_name = excluded.property_name,
  award_or_avoid = excluded.award_or_avoid,
  any_or_every = excluded.any_or_every,
  operator_options = excluded.operator_options,
  validation_json = excluded.validation_json,
  tooltip = excluded.tooltip,
  source_type = excluded.source_type,
  is_visible_in_portal = excluded.is_visible_in_portal,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  updated_at = now();

-- F8 Pairing property: company-defined Efficient / Inefficient Daily Credit bands.
INSERT INTO pbs_bid_property (
  property_code,
  bid_type,
  property_name,
  award_or_avoid,
  any_or_every,
  operator_options,
  validation_json,
  tooltip,
  source_type,
  is_visible_in_portal,
  display_order,
  is_active
) VALUES (
  428,
  'Pairing',
  'Efficient Flying First',
  '["award"]',
  null,
  null,
  '{"type":"efficient_flying_preference","modes":["efficient","inefficient"]}',
  'Choose the company-defined top or bottom average daily credit band.',
  'app',
  1,
  6,
  1
)
ON CONFLICT (property_code) DO UPDATE SET
  bid_type = excluded.bid_type,
  property_name = excluded.property_name,
  award_or_avoid = excluded.award_or_avoid,
  any_or_every = excluded.any_or_every,
  operator_options = excluded.operator_options,
  validation_json = excluded.validation_json,
  tooltip = excluded.tooltip,
  source_type = excluded.source_type,
  is_visible_in_portal = excluded.is_visible_in_portal,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  updated_at = now();

-- Standing Bid 专属属性（长期备用 bid，可在 Portal 展示）
INSERT INTO pbs_bid_property (
  property_code,
  bid_type,
  property_name,
  award_or_avoid,
  any_or_every,
  operator_options,
  validation_json,
  tooltip,
  source_type,
  is_visible_in_portal,
  display_order,
  is_active
) VALUES
  (218, 'DaysOff', 'Day of Week Off', null, null, '["In"]',
   '{"type":"dow","label":"Day of Week"}',
   'Standing Bid day-of-week off preference.', 'aa', 1, 218, 1),
  (312, 'Reserve', 'Reserve Day of Week Off', null, null, '["In"]',
   '{"type":"dow","label":"Day of Week"}',
   'Standing Reserve day-of-week off preference.', 'aa', 1, 312, 1),
  (313, 'Reserve', 'Reserve Work Block Size', null, null, '["Between"]',
   '{"type":"int_range","label":"Work Block Size","min":3,"max":6}',
   'Standing Reserve preferred reserve work block size.', 'aa', 1, 313, 1),
  (314, 'Reserve', 'Waive to Allow Carry over to be Days Off', null, null, null,
   '{"type":"flag"}',
   'Standing Reserve waiver allowing carry-over to be days off.', 'aa', 1, 314, 1)
ON CONFLICT (property_code) DO UPDATE SET
  bid_type = excluded.bid_type,
  property_name = excluded.property_name,
  award_or_avoid = excluded.award_or_avoid,
  any_or_every = excluded.any_or_every,
  operator_options = excluded.operator_options,
  validation_json = excluded.validation_json,
  tooltip = excluded.tooltip,
  source_type = excluded.source_type,
  is_visible_in_portal = excluded.is_visible_in_portal,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  updated_at = now();

-- ============================================================
-- Recommended properties — derived from CLASS-BidsReport_March2026.txt
-- ============================================================
UPDATE pbs_bid_property
SET
  recommended_order = null,
  recommended_usage_count = null,
  updated_at = now()
WHERE bid_type IN ('DaysOff', 'Pairing', 'Line');

UPDATE pbs_bid_property AS property
SET
  recommended_order = defaults.recommended_order,
  recommended_usage_count = defaults.recommended_usage_count,
  updated_at = now()
FROM (
  VALUES
    ('DaysOff', 201, 1, 1583),
    ('DaysOff', 204, 2, 175),
    ('Pairing', 102, 1, 2094),
    ('Pairing', 168, 2, 1186),
    ('Pairing', 103, 3, 625),
    ('Pairing', 107, 4, 332),
    ('Pairing', 110, 5, 295),
    ('Pairing', 428, 6, 0),
    ('Line', 429, 1, 122),
    ('Line', 407, 2, 0),
    ('Line', 408, 3, 0),
    ('Line', 410, 4, 0),
    ('Line', 427, 5, 0)
) AS defaults(bid_type, property_code, recommended_order, recommended_usage_count)
WHERE property.bid_type = defaults.bid_type
  AND property.property_code = defaults.property_code;

-- ============================================================
-- Property visibility by bid context
-- ============================================================
INSERT INTO pbs_bid_property_context (
  property_id,
  bid_context,
  is_visible_in_portal,
  display_order,
  created_by,
  updated_by
)
SELECT
  property.id,
  context.bid_context,
  CASE
    WHEN context.bid_context = 'Current'
      AND (
        (property.bid_type = 'DaysOff' AND property.property_code IN (201, 204))
        OR (property.bid_type = 'Pairing' AND property.property_code IN (102, 103, 107, 110, 112, 116, 117, 122, 129, 163, 168, 428))
        OR (property.bid_type = 'Line' AND property.property_code IN (407, 408, 427, 429))
        OR (property.bid_type = 'Reserve' AND property.property_code = 301)
      )
      THEN 1
    WHEN context.bid_context = 'StandingLineholder'
      AND (
        (property.bid_type = 'DaysOff' AND property.property_code IN (201, 204))
        OR (property.bid_type = 'Pairing' AND property.property_code IN (103, 107, 110, 112, 116, 117, 122, 129, 163, 168, 428))
        OR (property.bid_type = 'Line' AND property.property_code IN (407, 408, 427, 429))
      )
      THEN 1
    WHEN context.bid_context = 'StandingReserve'
      AND property.bid_type = 'Reserve'
      AND property.property_code = 301
      THEN 1
    ELSE 0
  END,
  property.display_order,
  'seed',
  'seed'
FROM pbs_bid_property property
CROSS JOIN (
  VALUES
    ('Current'::varchar(24)),
    ('StandingLineholder'::varchar(24)),
    ('StandingReserve'::varchar(24))
) AS context(bid_context)
ON CONFLICT (property_id, bid_context) DO NOTHING;

-- ============================================================
-- end of 10-pbs-bid-property.sql
-- ============================================================
