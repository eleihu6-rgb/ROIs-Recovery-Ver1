-- 2025/12/xx Add maxFlyTimeInDuty, pureDeadheadDutyAllowed, and maxFdpWithAircraftChange to rule 2004
UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_names = CONCAT(rp.param_names, ',Max Fly Time In Duty,Pure Deadhead Duty Allowed,Max FDP With Aircraft Change'),
    rp.param_values = CONCAT(rp.param_values, ',*,Y,*')
WHERE r.`function` = 2004
  AND rp.param_names NOT LIKE '%maxFlyTimeInDuty%';
