-- Fix deprecated IANA timezone names in airport table.
-- These old names are no longer recognized by PostgreSQL's tzdata and cause
-- "invalid time zone name" errors (PG error 22023) in AT TIME ZONE expressions.
--
-- Mappings:
--   Asia/Rangoon      → Asia/Yangon        (Myanmar, renamed 2016)
--   America/Godthab   → America/Nuuk       (Greenland capital, renamed 2020)
--   Europe/Kiev       → Europe/Kyiv        (Ukraine unified timezone, 2022)
--   Europe/Uzhgorod   → Europe/Kyiv        (Ukraine unified timezone, 2022)
--   Europe/Zaporozhye → Europe/Kyiv        (Ukraine unified timezone, 2022)
--   Asia/Choibalsan   → Asia/Ulaanbaatar   (Mongolia, merged in tzdata 2022g)
--   UA                → Australia/Perth    (WLO/Wallal Downs, Western Australia)

UPDATE airport SET zone_id = 'Asia/Yangon'       WHERE zone_id = 'Asia/Rangoon';
UPDATE airport SET zone_id = 'America/Nuuk'      WHERE zone_id = 'America/Godthab';
UPDATE airport SET zone_id = 'Europe/Kyiv'       WHERE zone_id = 'Europe/Kiev';
UPDATE airport SET zone_id = 'Europe/Kyiv'       WHERE zone_id = 'Europe/Uzhgorod';
UPDATE airport SET zone_id = 'Europe/Kyiv'       WHERE zone_id = 'Europe/Zaporozhye';
UPDATE airport SET zone_id = 'Asia/Ulaanbaatar'  WHERE zone_id = 'Asia/Choibalsan';
UPDATE airport SET zone_id = 'Australia/Perth'   WHERE zone_id = 'UA';
