import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const schemaIndex = args.indexOf('--schema');
const schema = schemaIndex >= 0 ? args[schemaIndex + 1] : '';
const apply = args.includes('--apply');
const verifyRepeat = args.includes('--verify-repeat');
const allowedArgs = new Set(['--schema', schema, '--apply', '--verify-repeat']);
if (!schema || !/^[a-z][a-z0-9_]*$/.test(schema) || ['public', 'pg_catalog', 'information_schema'].includes(schema) || args.some(arg => !allowedArgs.has(arg))) {
  console.error('Usage: node --env-file=.env scripts/install-cost-library.mjs --schema <application_schema> [--apply] [--verify-repeat]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required. Supply it securely or use --env-file.');
  process.exit(1);
}

const files = ['sql/migration/2026-09-10-cost-library.sql', 'sql/seed/2026-09-10-cost-library.sql'];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
const snapshot = async () => {
  const { rows } = await client.query(`
    select 'cost_type' as name, coalesce(jsonb_agg(t order by id),'[]'::jsonb) as records from cost_type t
    union all select 'cost_instance',coalesce(jsonb_agg(t order by id),'[]'::jsonb) from cost_instance t
    union all select 'cost_revision',coalesce(jsonb_agg(t order by id),'[]'::jsonb) from cost_revision t
    union all select 'cost_set',coalesce(jsonb_agg(t order by id),'[]'::jsonb) from cost_set t
    union all select 'cost_set_member',coalesce(jsonb_agg(t order by id),'[]'::jsonb) from cost_set_member t
    order by name`);
  return { counts: Object.fromEntries(rows.map(r => [r.name, r.records.length])), digest: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
};
const verifyStructure = async () => {
  await client.query(`explain select t.type_code,i.instance_no,r.revision_no,r.unit_price,
    r.params_json,r.applicability_json,r.gh_policy_revision_id,s.version,m.enabled
    from cost_set s join cost_set_member m on m.cost_set_id=s.id
    join cost_revision r on r.id=m.cost_revision_id and r.cost_instance_id=m.cost_instance_id
    join cost_instance i on i.id=m.cost_instance_id join cost_type t on t.id=i.cost_type_id`);
  const result = await client.query(`select count(*)::int as invalid from cost_set_member m
    left join cost_revision r on r.id=m.cost_revision_id and r.cost_instance_id=m.cost_instance_id where r.id is null`);
  if (result.rows[0].invalid !== 0) throw new Error('Membership integrity check failed');
  const dependencies = await client.query(`select count(*)::int as invalid from cost_revision r
    left join cost_revision gh on gh.id=r.gh_policy_revision_id where r.calculator_code='standby'
    and (gh.id is null or gh.calculator_code <> 'guarantee' or gh.currency_code <> r.currency_code)`);
  if (dependencies.rows[0].invalid !== 0) throw new Error('Standby GH dependency check failed');
};
const install = async (commit) => {
  await client.query('begin');
  try {
    await client.query("select set_config('search_path',$1,true),set_config('lock_timeout','5s',true),set_config('statement_timeout','60s',true)", [schema]);
    const target = await client.query('select current_schema() as schema, to_regclass($1) as rule_table', [`${schema}.rule`]);
    if (target.rows[0].schema !== schema || !target.rows[0].rule_table) throw new Error('Target must be an existing application schema with a rule table');
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`${schema}:cost-library-install`]);
    for (const file of files) await client.query(await readFile(path.join(root, file), 'utf8'));
    await verifyStructure();
    const result = await snapshot();
    await client.query(commit ? 'commit' : 'rollback');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
};
try {
  await client.connect();
  const first = await install(apply);
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run rolled back', schema, ...first }));
  if (verifyRepeat) {
    if (!apply) throw new Error('--verify-repeat requires --apply');
    const second = await install(true);
    if (first.digest !== second.digest) throw new Error('Repeat install changed existing business rows');
    console.log('PASS repeat installation: identical business rows; FK/dependency checks and PostgreSQL EXPLAIN passed');
  }
} catch (error) {
  console.error(`Cost library installation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
