-- 30-res-pairing-config.sql — RES Pairing Creator parameters (idempotent)
-- code_value packs '<callCode>|<start>|<end>|<crossesMidnight>' for RES_CALL_TYPE; plain value for RES_DEFAULTS
insert into dictionary (parent_code, code, name, idx, code_value)
select v.parent_code, v.code, v.name, v.idx, v.code_value
from (values
  ('RES_CALL_TYPE','P_AM','Pilot Reserve AM',1,'PRAM|04:00|16:00|0'),
  ('RES_CALL_TYPE','P_MM','Pilot Reserve Mid',2,'PRMM|10:00|22:00|0'),
  ('RES_CALL_TYPE','P_PM','Pilot Reserve PM',3,'PRPM|14:00|23:59|0'),
  ('RES_CALL_TYPE','C_AM','Cabin Reserve AM',4,'CRAM|03:00|15:00|0'),
  ('RES_CALL_TYPE','C_PM','Cabin Reserve PM',5,'CRPM|10:00|22:00|0'),
  ('RES_DEFAULTS','ASSIGNMENT_GROUP','RES assignment group',1,'RES'),
  ('RES_DEFAULTS','DEFAULT_FLEET','Default fleet for reserve',2,'737'),
  ('RES_DEFAULTS','CONFLICT_POLICY','Default conflict policy',3,'skip'),
  ('RES_DEFAULTS','DEFAULT_CREDIT_MIN','Fallback fixed credit minutes for reserve (4h)',4,'240')
) as v(parent_code, code, name, idx, code_value)
where not exists (select 1 from dictionary d where d.parent_code = v.parent_code and d.code = v.code);
