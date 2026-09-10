-- 2026-09-05  Restore scheduler_job's conflict target in live schemas.
--
-- Run with the target live schema as current_schema(). The table can exist in
-- an older deployment without the constraints declared by its original DDL.

DO $$
DECLARE
  live_schema text := current_schema();
  table_name text := format('%I.scheduler_job', current_schema());
  duplicate_count integer;
BEGIN
  IF to_regclass(table_name) IS NULL THEN
    RAISE NOTICE 'Skipping scheduler repair: %.scheduler_job does not exist', live_schema;
    RETURN;
  END IF;

  EXECUTE format(
    'SELECT count(*) FROM (SELECT job_code FROM %s GROUP BY job_code HAVING count(*) > 1) duplicates',
    table_name
  ) INTO duplicate_count;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Cannot add scheduler_job unique key: % duplicate job_code groups exist', duplicate_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = table_name::regclass
       AND conname = 'uq_scheduler_job_code'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT uq_scheduler_job_code UNIQUE (job_code)',
      table_name
    );
  END IF;

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_scheduler_job_due ON %s (enabled, next_run_at)',
    table_name
  );
END $$;
