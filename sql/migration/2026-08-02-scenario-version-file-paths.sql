-- 2026-08-02
-- Scenario optimizer version history:
-- replace scenario.file_path with a JSONB array containing every archived run.
-- The legacy value is copied into v0 before the old column is removed.

alter table scenario
  add column if not exists file_paths jsonb not null default '[]'::jsonb;

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = current_schema()
       and table_name = 'scenario'
       and column_name = 'file_path'
  ) then
    update scenario
       set file_paths = jsonb_build_array(jsonb_build_object(
         'version', 'v0',
         'taskId', task_id,
         'filePath', file_path,
         'fileSize', file_size,
         'checksum', checksum,
         'executedBy', updated_by,
         'executedAt', updated_at,
         'fileTimestamp', to_char(updated_at, 'YYYYMMDD_HH24MISS'),
         'archivePath', regexp_replace(coalesce(file_path, ''), '/output\.gz$', ''),
         'status', status
       ))
     where file_path is not null
       and coalesce(jsonb_array_length(file_paths), 0) = 0;

    alter table scenario drop column file_path;
  end if;
end $$;

comment on column scenario.file_paths is
  'JSONB 数组，记录场景每次优化运行的版本、执行人、时间和归档文件路径';
