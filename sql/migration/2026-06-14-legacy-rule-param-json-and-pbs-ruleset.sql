-- =============================================================================
-- 2026-06-14  Legacy rule param JSON + PBS Solver Ruleset
-- =============================================================================
-- 目的：恢复 / 增强旧法规表结构，为 cpp→python 法规再迁移建立单一参数权威源。
--
--  1. rule 表新增 param_json (jsonb) 列：忠实镜像旧 rule_parameter 的 CSV
--     （表头 + 数据行），关键是保留新模型 rule_instance.params 丢失的"适用范围"列
--     —— Bases / Ranks / Fleets / Crew Teams（如 rule 8002 此前在 UI 不显示适用定义）。
--     格式：{"tables":[{"header":[...],"rows":[[...]]}]}（单表一个元素；7500 双表两个元素）。
--  2. rule_set：workset_id=103 映射全部 14 条 F8 法规（已存在，此处幂等补齐）。
--  3. workset id=103 命名为 "PBS Solver Ruleset"（类比 scenario 命名，在 workset 表定义）。
--
-- 适用范围：F8 schema（search_path=f8）。幂等，可重复执行。
-- 无参数的 3 条规则（7272/7505/7506）param_json 置 NULL —— 其阈值来自 C++，属再迁移阶段。
-- =============================================================================

-- ── 1. 新增 param_json 列（幂等）──────────────────────────────────────────────
alter table rule add column if not exists param_json jsonb;
comment on column rule.param_json is '法规参数 JSON 镜像：{"tables":[{"header":[...],"rows":[[...]]}]}，忠实保留 rule_parameter 旧 CSV（表头含 Bases/Ranks/Fleets/Crew Teams 适用范围），是 cpp→python 再迁移的参数权威来源';

-- ── 1b. 为 14 条 F8 法规回填 param_json（按 function+instance 定位）─────────────

-- 2014 Local Night Definition（参数源 2014012）
update rule set param_json = '{"tables":[{"header":["Local Night Start","Local Night End","Min Interval Hours"],"rows":[["22:00","08:00","08:00"]]}]}'::jsonb
 where filiale='F8' and function=2014 and instance='014';

-- 7272 Calculate DP of the Reserves —— 旧表无参数（阈值来自 C++）
update rule set param_json = NULL
 where filiale='F8' and function=7272 and instance='001';

-- 7500 Basic definition of Acc State（双表）
update rule set param_json = '{"tables":[{"header":["TZ Diff","Stay Duration"],"rows":[["00:00-04:00","72:00-96:00"],["04:00-24:00","96:00-999:00"]]},{"header":["Stay Duration per X Hours","ACC Time Zone Adjust X Hours"],"rows":[["24:00","01:00"]]}]}'::jsonb
 where filiale='F8' and function=7500 and instance='002';

-- 7501 Single Day Free from Duty in Rolling Hours
update rule set param_json = '{"tables":[{"header":["Bases","Ranks","Fleets","Teams","Period","Unit","Duty End Buffer","Min Limits"],"rows":[["*","*","*","*","168","RH","00:30","1"],["*","*","*","*","672","RH","00:30","4"]]}]}'::jsonb
 where filiale='F8' and function=7501 and instance='004';

-- 7502 The Calculation of Credit Hours
update rule set param_json = '{"tables":[{"header":["Bases","Ranks","Fleets","Teams","Assignment Groups","Assignments","Minimum CH","FT Ratio","DP Ratio","Split Method(SPAN/START)"],"rows":[["*","*","*","*","DO|LO|LEA|SBY","*","04:00","*","*","START"],["*","*","*","*","FLY","*","*","1.0","*","START"],["*","*","*","*","GND","*","*","*","0.5","START"]]}]}'::jsonb
 where filiale='F8' and function=7502 and instance='002';

-- 7503 Limits of Consecutive WOCLs
update rule set param_json = '{"tables":[{"header":["Bases","Ranks","Fleets","Teams","WOCL Start","WOCL End","Max Consecutive WOCLs"],"rows":[["*","*","*","*","02:00","05:59","3"]]}]}'::jsonb
 where filiale='F8' and function=7503 and instance='003';

-- 7504 Spacing Rule - WOCL
update rule set param_json = '{"tables":[{"header":["Bases","Ranks","Fleets","Teams","Prev Assignment Groups","Next Assignment Groups","Prev Assignments","Next Assignments","Prev Attributes","Next Attributes","Apply Prelabelled Attributes","Utilize Post Rest","Level","Min Period","Unit"],"rows":[["*","*","*","*","*","*","FLY","FLY","WOCL","WOCL","N","Y","D","55","RH"]]}]}'::jsonb
 where filiale='F8' and function=7504 and instance='003';

-- 7505 Min # GDOs in a RP —— 旧表无参数（阈值来自 C++：12 GDOs/RP）
update rule set param_json = NULL
 where filiale='F8' and function=7505 and instance='002';

-- 7506 One Checkin Per Day —— 旧表无参数
update rule set param_json = NULL
 where filiale='F8' and function=7506 and instance='002';

-- 8002 Maximum Flight Time（BH，instance 006）
update rule set param_json = '{"tables":[{"header":["Bases","Ranks","Fleets","Crew Teams","Period","Unit","Prorated","Max Limits","Min Limits","Type"],"rows":[["*","*","*","*","28","CD","Y","112:00","00:00","BH"],["*","*","*","*","90","CD","Y","300:00","00:00","BH"],["*","*","*","*","365","CD","Y","1000:00","00:00","BH"]]}]}'::jsonb
 where filiale='F8' and function=8002 and instance='006';

-- 8002 Maximum Hours of Work（DP，instance 009）
update rule set param_json = '{"tables":[{"header":["Bases","Ranks","Fleets","Crew Teams","Period","Unit","Prorated","Max Limits","Min Limits","Type"],"rows":[["*","*","*","*","7","CD","Y","60:00","00:00","DP"],["*","*","*","*","28","CD","Y","192:00","00:00","DP"],["*","*","*","*","365","CD","Y","2200:00","00:00","DP"]]}]}'::jsonb
 where filiale='F8' and function=8002 and instance='009';

-- 8004 Basic Competency-F8
update rule set param_json = '{"tables":[{"header":["Base","Rank","Fleet","Type","Enable Check","Grace Period","Unit","Assignments"],"rows":[["*","*","*","BASE","Y","0","CD","FLY"],["*","*","*","RANK","N","0","CD","FLY"],["*","*","*","FLEET","N","0","CD","FLY"]]}]}'::jsonb
 where filiale='F8' and function=8004 and instance='004';

-- 8030 Age Restriction
update rule set param_json = '{"tables":[{"header":["Division","Airport","Age Define","Max Number"],"rows":[["P","*","65","1"]]}]}'::jsonb
 where filiale='F8' and function=8030 and instance='004';

-- 8056 Roster Spacing
update rule set param_json = '{"tables":[{"header":["Bases","Ranks","Fleets","Crew Teams","Attribute A","Label A","Assignment Group A","Qualifier A","Airport A","Roles A","Is Requested A","Attribute B","Label B","Assignment Group B","Qualifier B","Airport B","Roles B","Is Requested B","Space","Unit","Directional","Is Location Equal Base A","Is Location Equal Base B","Utilize Post Duty Rest"],"rows":[["*","*","*","*","*","*","FLY","*","*","*","*","*","*","FLY|SBY|SIM","*","*","*","*","13","RH","Y","*","*","Y"]]}]}'::jsonb
 where filiale='F8' and function=8056 and instance='006';

-- ── 2. rule_set：workset 103 → 全部 14 条 F8 法规（幂等补齐）────────────────────
-- rule_set.rule_id 使用复合码 function||instance（与 rule_parameter 一致）。
insert into rule_set (workset_id, rule_id)
select 103, v.rule_id
from (values
  (2014014),(7272001),(7500002),(7501004),(7502002),(7503003),(7504003),
  (7505002),(7506002),(8002006),(8002009),(8004004),(8030004),(8056006)
) as v(rule_id)
where not exists (
  select 1 from rule_set rs where rs.workset_id=103 and rs.rule_id=v.rule_id
);

-- ── 3. workset 103 命名 "PBS Solver Ruleset"（在 workset 表定义，类比 scenario 命名）─
update workset
   set name='PBS Solver Ruleset', category='PBS', type='CU', filiale='F8', division='P'
 where id=103;
