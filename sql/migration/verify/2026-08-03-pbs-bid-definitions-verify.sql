\if :{?live_schema}
\else
\set live_schema f8
\endif

\if :{?pbs_schema}
\else
\set pbs_schema f8_pbs
\endif

select parent_code, code, count(*) as row_count, min(code_value) as code_value
from :"live_schema".dictionary
where (parent_code = 'PBS_PAIRING_REDEYE_CONFIG' and code in ('START_TIME', 'END_TIME'))
   or (parent_code = 'PBS_PREFER_OFF' and code in ('WEEKEND_START_DOW', 'WEEKEND_START_TIME', 'WEEKEND_END_DOW', 'WEEKEND_END_TIME'))
   or (parent_code = 'PBS_LINE_CREDIT_WINDOW_CONFIG' and code = 'DELTA_HOURS')
group by parent_code, code
order by parent_code, code;

select property_code, validation_json, tooltip
from :"pbs_schema".pbs_bid_property
where bid_type = 'Pairing' and property_code = 117;
