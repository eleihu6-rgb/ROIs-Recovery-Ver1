-- Normalize roster_flight.source to PA/MA/CR.
-- Execute once with search_path pointing at the target live schema, and once with
-- search_path pointing at the target scenario schema.

update roster_flight
set source = case
  when source is null or btrim(source) = '' then null
  when upper(source) in ('PA', 'MA', 'CR') then upper(source)
  when upper(source) in ('F8', 'IMPORT', 'IMPORTED', 'INTERFACE') then 'PA'
  when upper(source) in ('MANUAL', 'GANTT') then 'MA'
  when upper(source) in ('OPT', 'RO', 'PO', 'PBS', 'SCENARIO') then 'CR'
  when lower(source) = 'leadin' then 'PA'
  when created_by in ('F8_IMPORT', 'F8_IMPORT_GND') then 'PA'
  when created_by in ('scenario_loader', 'legacy-ro') then 'CR'
  else source
end
where source is distinct from case
  when source is null or btrim(source) = '' then null
  when upper(source) in ('PA', 'MA', 'CR') then upper(source)
  when upper(source) in ('F8', 'IMPORT', 'IMPORTED', 'INTERFACE') then 'PA'
  when upper(source) in ('MANUAL', 'GANTT') then 'MA'
  when upper(source) in ('OPT', 'RO', 'PO', 'PBS', 'SCENARIO') then 'CR'
  when lower(source) = 'leadin' then 'PA'
  when created_by in ('F8_IMPORT', 'F8_IMPORT_GND') then 'PA'
  when created_by in ('scenario_loader', 'legacy-ro') then 'CR'
  else source
end;

do $$
declare
  bad_count integer;
begin
  select count(*)::integer
    into bad_count
    from roster_flight
   where source is not null
     and source not in ('PA', 'MA', 'CR');

  if bad_count > 0 then
    raise exception 'roster_flight.source contains % non-PA/MA/CR values in schema %',
      bad_count, current_schema();
  end if;
end $$;

alter table roster_flight
  drop constraint if exists chk_roster_flight_source_pa_ma_cr;

comment on column roster_flight.source is
  '排班来源：PA=预分配/外部接口或文件导入，MA=Gantt人工分配或批量创建，CR=优化器计算结果';

alter table roster_flight
  add constraint chk_roster_flight_source_pa_ma_cr
  check (source is null or source in ('PA', 'MA', 'CR'));
