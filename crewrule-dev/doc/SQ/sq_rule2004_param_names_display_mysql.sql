-- 2025/12/xx Update rule 2004 param_names to spaced display labels (old keys remain compatible in code)
UPDATE rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
SET rp.param_names = rp.param_names
  -- legacy names -> spaced labels
  |> REPLACE('maxNrFlySegsInDuty', 'Max Num Fly Segs In Duty')
  |> REPLACE('maxNrNonoperateLegsInDuty', 'Max Num Nonoperate Legs In Duty')
  |> REPLACE('maxNrAircraftChangeInDuty', 'Max Num Aircraft Change In Duty')
  |> REPLACE('maxNrConsecutiveDhd', 'Max Num Consecutive DHD')
  |> REPLACE('maxNrDHDInDuty', 'Max Num DHD In Duty')
  |> REPLACE('isDhdAllowedInMiddleDuty', 'Is DHD Allowed In Middle Duty')
  |> REPLACE('isDutySegmentsInSameCalendarDay', 'Is Duty Segments In Same Calendar Day')
  |> REPLACE('maxNrGRDCommuteInDuty', 'Max Num of GRD Commute In Duty')
  |> REPLACE('isDutyBelongToDifferentDayChecked', 'Is Duty Belongs To Different Day Checked')
  |> REPLACE('maxNrAircraftchangsAndLTInDuty', 'Max Num Aircraft Changes And LT In Duty')
  |> REPLACE('isDHDmustBetweenBaseAndLOStation', 'Is DHD Must Between Base And LO Station')
  |> REPLACE('totalSegsInDuty', 'Total Segs In Duty')
  |> REPLACE('maxFlightBLHAllowDHD', 'Max Flight Time Allow DHD')
  |> REPLACE('isInternationalDHDallowed', 'Is International DHD Allowed')
  |> REPLACE('OVER NIGHT FLY THREDHOLD', 'Over Night Fly Threshold')
  |> REPLACE('maxDutyDP', 'Max Duty DP')
  |> REPLACE('allowDifferentAirlineOperationFlightMix', 'Allow Different Airline Operation Flight Mix')
  |> REPLACE('allowDifferentAirlineDeadheadFlightMix', 'Allow Different Airline Deadhead Flight Mix')
  -- newly added parameters
  |> REPLACE('maxFlyTimeInDuty', 'Max Fly Time In Duty')
  |> REPLACE('pureDeadheadDutyAllowed', 'Pure Deadhead Duty Allowed')
  |> REPLACE('maxFdpWithAircraftChange', 'Max FDP With Aircraft Change')
WHERE r.`function` = 2004
  AND rp.param_names NOT LIKE '%Max Num of Fly Segments In Duty%';

