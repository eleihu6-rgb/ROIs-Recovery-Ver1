# LINE_RULES.csv Rule ID Reference

This file documents the rule identifiers exported by PBS algorithm export.
LINE_RULES.csv contains rule-level constraints used when constructing a full line. Some source rules may come from the DaysOff tab when they cannot be represented as concrete date rows in DAYSOFF.csv.

## CSV Columns

| Column | Description |
| --- | --- |
| Crew_ID | PBS bid crew id. |
| Code_ID | Source PBS property code from the portal configuration. Use this for tracing the exported row back to the original bid rule. |
| Rule_ID | Algorithm rule id used for parsing. Some source Code_ID values are remapped to the algorithm's requested Rule_ID. |
| Rule_Type | Stable uppercase algorithm rule type. |
| Parameters_JSON | Stable JSON payload for algorithm parsing. |
| T1_Counter ... T7_Counter | Number of times the same crew/rule/params appears in each tier. |
| Description | Human-readable full sentence for debugging; algorithms should not parse it. |

## Rule IDs

The table below lists source Code_ID values. For algorithm parsing, Code_ID 202, 203, and 205 are exported as Rule_ID 408 / Rule_Type COMMUTER_PATTERN with Parameters_JSON using minDaysOn, maxDaysOn, minDaysOff, and maxDaysOff.

| Code_ID | Default Rule_ID | Default Rule_Type | UI Name | Source | Parameters_JSON |
| --- | --- | --- | --- | --- | --- |
| 301 | 301 | RESERVE_SHORT_CALL_TYPE | Short Call Type | Reserve | Reserve line-level call type rule for whole-month only reserve call type preferences. Parameters_JSON is {"action":"award\|avoid","callType":"PRAM","dateScope":{"mode":"whole_month"}}. |
| 202 | 408 | COMMUTER_PATTERN | Max Consecutive Days On | DaysOff | DaysOff rule-level constraint. Parameters_JSON is {"minDaysOn":number,"maxDaysOn":number,"minDaysOff":0,"maxDaysOff":0}. |
| 203 | 408 | COMMUTER_PATTERN | Min Consecutive Days Off | DaysOff | DaysOff rule-level constraint. Parameters_JSON is {"minDaysOn":1,"maxDaysOn":bid month days,"minDaysOff":number,"maxDaysOff":number}. |
| 204 | 204 | MIN_CONSECUTIVE_DAYS_OFF_IN_WINDOW | Min Consecutive Days Off In Window | DaysOff | DaysOff rule-level constraint. Parameters_JSON is {"minimumDaysOff":number,"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}. |
| 205 | 408 | COMMUTER_PATTERN | Days Off / Days On Pattern | DaysOff | DaysOff rule-level constraint. Parameters_JSON has minDaysOn, maxDaysOn, minDaysOff, maxDaysOff. |
| 206 | 206 | SHARED_DAYS_OFF_WITH_EMPLOYEE | Shared Days Off With Employee | DaysOff | DaysOff rule-level constraint. Parameters_JSON is {"employeeNumber":"string","minimumDays":number}. |
| 401 | 401 | MAX_CREDIT_WINDOW | Max Credit Window | Legacy | Flag rule. Parameters_JSON is {}. |
| 402 | 402 | MIN_CREDIT_WINDOW | Min Credit Window | Legacy | Flag rule. Parameters_JSON is {}. |
| 403 | 403 | CLEAR_SCHEDULE_AND_START_NEXT_BID_GROUP | Clear Schedule and Start Next Bid Group | Legacy | Flag rule. Parameters_JSON is {}. |
| 404 | 404 | NO_SAME_DAY_PAIRINGS | No Same Day Pairings | Legacy | Flag rule. Parameters_JSON is {}. |
| 405 | 405 | WAIVE_NO_SAME_DAY_DUTY_STARTS | Waive No Same Day Duty Starts | Legacy | Flag rule. Parameters_JSON is {}. |
| 406 | 406 | FORGET_LINE | Forget Line | Legacy | Stepper rule. Parameters_JSON is {"operator":"=","value":number}. |
| 407 | 407 | MIN_BASE_LAYOVER | Min Base Layover | Legacy | Text duration rule. Parameters_JSON is {"value":"HHH:MM"}. |
| 408 | 408 | COMMUTER_PATTERN | Commuter Pattern | Legacy | Pattern rule. Parameters_JSON has minDaysOff, minDaysOn, maxDaysOn. |
| 409 | 409 | MOST_FLYING_IN_LEAST_DAYS | Most Flying In Least Days | Legacy | Credit density rule. Parameters_JSON has minimumTotalCredit, maximumWorkingDays, strength. |
| 410 | 410 | RESERVE_FLYING_DATE_PATTERN | Reserve / Flying Date Pattern | Legacy | Line reserve/flying pattern. Parameters_JSON has segments and strength. |
| 411 | 411 | TARGET_CREDIT_RANGE | Target Credit Range | AA | Range rule. Parameters_JSON is {"from":number,"to":number}. |
| 412 | 412 | MAXIMIZE_CREDIT | Maximize Credit | AA | Flag rule. Parameters_JSON is {}. |
| 413 | 413 | MAXIMIZE_INTERNATIONAL_CREDIT | Maximize International Credit | AA | Flag rule. Parameters_JSON is {}. |
| 414 | 414 | WORK_BLOCK_SIZE | Work Block Size | AA | Range rule. Parameters_JSON is {"from":number,"to":number}. |
| 415 | 415 | PREFER_CADENCE_ON_DAY_OF_WEEK | Prefer Cadence on Day-of-Week | AA | Select rule. Parameters_JSON is {"value":"Mon"}. |
| 416 | 416 | COMMUTABLE_WORK_BLOCK | Commutable Work Block | AA | Time range rule. Parameters_JSON is {"from":"HH:MM","to":"HH:MM"}. |
| 417 | 417 | PAIRING_MIX_IN_WORK_BLOCK | Pairing Mix in a Work Block | AA | Tag list rule. Parameters_JSON is {"values":["3,1"]}. |
| 418 | 418 | ALLOW_DOUBLE_UP_ON_DATE | Allow Double-Up on Date | AA | Date rule. Parameters_JSON is {"date":"YYYY-MM-DD","operator":"="}. |
| 419 | 419 | ALLOW_MULTIPLE_PAIRINGS | Allow Multiple Pairings | AA | Flag rule. Parameters_JSON is {}. |
| 420 | 420 | ALLOW_MULTIPLE_PAIRINGS_ON_DATE | Allow Multiple Pairings on Date | AA | Date rule. Parameters_JSON is {"date":"YYYY-MM-DD","operator":"="}. |
| 421 | 421 | ALLOW_CO_TERMINAL_MIX_IN_WORK_BLOCK | Allow Co-Terminal Mix in Work Block | AA | Flag rule. Parameters_JSON is {}. |
| 422 | 422 | CLEAR_BIDS | Clear Bids | AA | Flag rule. Parameters_JSON is {}. |
| 423 | 423 | WAIVE_24_HOURS_REST_IN_DOMICILE | Waive 24 hrs Rest in Domicile | AA | Flag rule. Parameters_JSON is {}. |
| 424 | 424 | WAIVE_MINIMUM_DOMICILE_REST | Waive Minimum Domicile Rest | AA | Flag rule. Parameters_JSON is {}. |
| 425 | 425 | WAIVE_30_HOURS_IN_7_DAYS | Waive 30 hrs in 7 Days | AA | Flag rule. Parameters_JSON is {}. |
| 426 | 426 | WAIVE_CARRY_OVER_CREDIT | Waive Carry-Over Credit | AA | Flag rule. Parameters_JSON is {}. |
| 427 | 427 | RESERVE | Reserve | AA | Award/Avoid rule. Parameters_JSON is {"action":"award\|avoid","scope":"whole_bid_month"}. |

## Reserve Notes

Whole-month Reserve call type structure from the Reserve tab is exported as Rule_ID 301 when the date scope is whole_month.
First-half, second-half, date-range, and specific-date Reserve call type requests remain in RESERVE_SCORE.csv.
Reserve / Flying Date Pattern remains exported as Rule_ID 410.
Whole-month Only Reserve / No Reserve is exported as Rule_ID 427 with action award or avoid.
