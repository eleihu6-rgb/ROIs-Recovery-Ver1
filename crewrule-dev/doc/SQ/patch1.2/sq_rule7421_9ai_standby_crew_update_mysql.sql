-- 2026/01/31 Add 9(a)(i) standby crew-composition extra condition for rule 7421.
-- Sets Extra Condition to 9AI_STBY for clause 9(a)(i) (JNB standby row).


UPDATE `rule_parameter`
SET `param_values` =
  '9(a)(i),SIN-JNB-SIN,JNB,DUTY,1,*,*,*,*,*,*,*,*,*,*,*,*,*,1,*,1,6,Duty IN (JNB-CPT-JNB; JNB-DUR-JNB),*,9AI_STBY'
WHERE `param_names` = 'table1Row22'
  AND `param_values` LIKE '9(a)(i),SIN-JNB-SIN,%'
  AND `rule_id` IN (SELECT `id` FROM `rule` WHERE `function` = 7421);

