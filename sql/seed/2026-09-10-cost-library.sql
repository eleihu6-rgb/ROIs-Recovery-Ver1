-- Illustrative library only. No verified airline tariffs or automatic charging.
-- Insert missing defaults, never overwrite configured prices, revisions or membership.
create temporary table _cost_library_seed (
    type_code integer, name text, category text, unit text, price numeric,
    calculator text, allowed jsonb, params jsonb, reference text
) on commit drop;
insert into _cost_library_seed values
    (1002,'Pay above guaranteed hours','Crew pay','credit hour',100,'guarantee','["guarantee"]','{"guaranteeHours":85,"tiers":[{"upToHours":90,"multiplier":1.2},{"upToHours":null,"multiplier":1.5}]}','Illustrative user-defined GH policy; not a verified tariff'),
    (1003,'Airport standby credit','Crew pay','credit hour',null,'standby','["standby"]','{"creditFactor":0.5,"departureCutoffMinutes":60}','User-defined standby-who-flies formula'),
    (1004,'Home standby activation','Crew pay','callout',200,'fixed','["quantity","fixed","minimum"]','{"minimumQuantity":4}','Illustrative price; R2 section 1.4'),
    (1007,'Day-off recall','Crew pay','callout',600,'fixed','["quantity","fixed","minimum"]','{"minimumQuantity":4}','Illustrative price; R2 cabin example'),
    (1009,'Short-notice roster change','Crew pay','change',150,'fixed','["quantity","fixed","minimum"]','{"minimumQuantity":4}','Illustrative price; R2 section 1.4'),
    (1012,'Lead cabin position premium','Crew pay','credit hour',null,'quantity','["quantity","fixed","minimum"]','{"minimumQuantity":4}','Unpriced; R1 section 4.3.1'),
    (1013,'Language allowance','Crew pay','sector',null,'quantity','["quantity","fixed","minimum"]','{"minimumQuantity":4}','Unpriced; R1 section 6.7.1'),
    (1014,'Third-pilot augmentation','Crew pay','sector',1200,'fixed','["quantity","fixed","minimum"]','{"minimumQuantity":4}','Illustrative price; R2 section 1.4'),
    (2001,'Hotel accommodation','Accommodation','room-night',140,'quantity','["quantity","fixed","minimum"]','{"minimumQuantity":4}','Illustrative price; R2 section 1.4'),
    (2002,'Day-use room','Accommodation','room-block',90,'quantity','["quantity","fixed","minimum"]','{"minimumQuantity":4}','Illustrative price; R2 section 1.4'),
    (2003,'Per diem','Accommodation','person-day',60,'quantity','["quantity","fixed","minimum"]','{"minimumQuantity":4}','Illustrative price; R2 section 1.4'),
    (2004,'Own-airline deadhead','Positioning','seat-sector',120,'quantity','["quantity","fixed","minimum"]','{"minimumQuantity":4}','Illustrative price; R2 section 1.4'),
    (2005,'Other-airline deadhead','Positioning','seat-sector',600,'quantity','["quantity","fixed","minimum"]','{"minimumQuantity":4}','Illustrative price; R2 section 1.4'),
    (2006,'Ground transfer','Positioning','vehicle-trip',80,'quantity','["quantity","fixed","minimum"]','{"minimumQuantity":4}','Synthetic illustrative price'),
    (2008,'Hotel booking replacement','Accommodation','booking',160,'booking','["booking"]','{"originalAmount":140,"refundAmount":140,"changeFee":0}','Synthetic illustrative price'),
    (3001,'Incremental flight delay','Other operating cash','minute',60,'bands','["bands","quantity"]','{"threshold":120,"upperRate":25}','Illustrative curve; R2'),
    (3005,'Aircraft ferry sector','Other operating cash','sector',9000,'quantity','["quantity","fixed","minimum"]','{"minimumQuantity":4}','Illustrative price; R2 section 1.4'),
    (1015,'Roster change stability penalty','Recovery stability','change',260,'quantity','["quantity","fixed","minimum"]','{"minimumQuantity":1}','Illustrative price; replaces hard-coded frontend virtualCost component (quantity so swap with qty=2 still prices)'),
    (1016,'Follow-on impact stability penalty','Recovery stability','impact',1800,'quantity','["quantity","fixed","minimum"]','{"minimumQuantity":1}','Illustrative price; replaces hard-coded frontend virtualCost component (quantity so multiple follow-on impacts price correctly)');

insert into cost_type (type_code,name,category_code,calculator_code,parameter_schema_json)
select type_code,name,category,calculator,jsonb_build_object('calculatorCodes',allowed)
from _cost_library_seed on conflict (type_code) do nothing;

insert into cost_instance (cost_type_id,instance_no,name)
select t.id,1,s.name from _cost_library_seed s join cost_type t using (type_code)
on conflict (cost_type_id,instance_no) do nothing;

insert into cost_revision (cost_instance_id,revision_no,calculator_code,effective_from,
    currency_code,unit_code,unit_price,params_json,applicability_json,reference)
select i.id,1,s.calculator,'2026-09-10T00:00:00Z','USD',s.unit,s.price,
    case when s.calculator in ('quantity','fixed') then '{}'::jsonb else s.params end,'{}',s.reference
from _cost_library_seed s join cost_type t using(type_code)
join cost_instance i on i.cost_type_id=t.id and i.instance_no=1
where s.calculator <> 'standby'
on conflict (cost_instance_id,revision_no) do nothing;

insert into cost_revision (cost_instance_id,revision_no,calculator_code,effective_from,
    currency_code,unit_code,unit_price,params_json,applicability_json,reference,gh_policy_revision_id)
select i.id,1,s.calculator,'2026-09-10T00:00:00Z','USD',s.unit,null,s.params,'{}',s.reference,
    (select r.id from cost_revision r join cost_instance gi on gi.id=r.cost_instance_id
     join cost_type gt on gt.id=gi.cost_type_id where gt.type_code=1002 and gi.instance_no=1
     and r.calculator_code='guarantee' order by r.revision_no desc limit 1)
from _cost_library_seed s join cost_type t using(type_code)
join cost_instance i on i.cost_type_id=t.id and i.instance_no=1
where s.calculator='standby'
on conflict (cost_instance_id,revision_no) do nothing;

-- Only a freshly installed default set receives initial membership. Reruns do not
-- restore deliberately removed costs or replace a set's pinned configuration.
create temporary table _cost_library_new_set (id bigint) on commit drop;
with inserted as (
    insert into cost_set (name,description,division,enabled,is_default)
    select 'Daily Recovery','Illustrative initial cost library; configure tariffs before operational use','',true,true
    where not exists (select 1 from cost_set where is_default)
    on conflict do nothing returning id
) insert into _cost_library_new_set select id from inserted;

insert into cost_set_member (cost_set_id,cost_instance_id,cost_revision_id,sort_order)
select ns.id,i.id,r.id,t.type_code from _cost_library_new_set ns cross join cost_instance i
join cost_type t on t.id=i.cost_type_id
join lateral (select id from cost_revision where cost_instance_id=i.id order by revision_no desc limit 1) r on true
on conflict (cost_set_id,cost_instance_id) do nothing;

-- Reconciliation pass for cost types added after the original default set was
-- seeded. cost_set_member inserts above only target a freshly created set; if
-- the default set already existed (e.g. the DB was seeded earlier), it does
-- not retroactively gain the new members. The reconciliation below is
-- idempotent and pulls in any missing cost types whose default instance + an
-- enabled revision exist.
insert into cost_set_member (cost_set_id,cost_instance_id,cost_revision_id,sort_order)
select cs.id,i.id,r.id,t.type_code
  from cost_set cs
  join cost_type t on true
  join cost_instance i on i.cost_type_id=t.id and i.instance_no=1
  join lateral (select id from cost_revision where cost_instance_id=i.id and enabled order by revision_no desc limit 1) r on true
 where cs.is_default
   and not exists (
     select 1 from cost_set_member csm
       where csm.cost_set_id=cs.id and csm.cost_instance_id=i.id
   )
on conflict (cost_set_id,cost_instance_id) do nothing;
