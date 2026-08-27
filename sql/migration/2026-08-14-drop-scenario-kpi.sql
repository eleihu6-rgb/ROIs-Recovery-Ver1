-- 2026-08-14-drop-scenario-kpi.sql
-- Merge scenario_kpi into scenario_result type='kpi' (JSON array), then drop scenario_kpi.
-- Idempotent: re-running backfills into the existing scenario_result row and no-ops the drop.
--
-- Run BEFORE deploying the new live-server code so scenario_kpi still holds the data to backfill.

with kpi_rows as (
  select scenario_id, kpi_names, kpi_values, description, idx, type,
         row_number() over (partition by scenario_id order by idx, kpi_names) as rn
    from scenario_kpi
)
insert into scenario_result (scenario_id, type, json, created_by, updated_by)
select scenario_id, 'kpi',
       jsonb_agg(jsonb_build_object(
         'id', rn,
         'scenarioId', scenario_id,
         'kpiNames', kpi_names,
         'kpiValues', kpi_values,
         'description', description,
         'idx', idx,
         'type', type
       ) order by idx, kpi_names) as json,
       'system', 'system'
  from kpi_rows
 group by scenario_id
on conflict (scenario_id, type) do update set
  json = excluded.json, updated_by = excluded.updated_by, updated_at = now();

drop table if exists scenario_kpi;
