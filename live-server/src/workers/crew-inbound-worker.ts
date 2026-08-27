import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { Worker } from 'bullmq'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { env } from '../config/index.js'
import { attachBullmqErrorLogger, getBullmqRedisConnection } from '../utils/bullmq-redis.js'
import { publishWriteProgress, publishWriteRunning, publishWriteTerminal } from '../utils/import-progress-write.js'
import type { CrewImportJob, CrewImportRecord } from '../types/import-jobs.js'
import { refreshLiveLegalityAndManday } from '../services/manday/manday-operation-service.js'

type Tx = NodePgDatabase<Record<string, unknown>>

const PBS_USER_PASSWORD_PLACEHOLDER = 'F8_IMPORT_NO_PASSWORD'

interface CrewJobResult {
  entity: string
  imported: number
  added: number
  updated: number
  deleted: number
  success: number
  failed: number
  skipped: number
  errors: Array<{ id: string; reason: string }>
}

interface CrewImportProcessOptions {
  pbsSchema: string
}

const validateSchemaName = (schemaName: string): string => {
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new Error(`Invalid PBS schema name: ${schemaName}`)
  }
  return schemaName
}

const displayNameForCrew = (rec: CrewImportRecord): string => {
  const name = [rec.firstName, rec.middleName, rec.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
  return (rec.preferredName.trim() || name || rec.crewId).slice(0, 100)
}

interface CrewCodeDefs {
  certificates: Map<string, string>   // certificate 代码 → divisions
  qualifications: Map<string, string> // qualification 代码 → division(s)
  teams: Map<string, string>          // `${filiale}|${team}` → division(s)
}

/** divisions 规范顺序：P < C < A */
const DIVISION_ORDER: Record<string, number> = { P: 0, C: 1, A: 2 }

/** 合并两段 divisions：去重、按 P<C<A 排序、逗号连接。existing 为空视为空串。 */
const mergeDivisions = (existing: string, incoming: string): string => {
  const set = new Set<string>()
  for (const part of `${existing},${incoming}`.split(',')) {
    const d = part.trim().toUpperCase()
    if (d) set.add(d)
  }
  return [...set].sort((a, b) => (DIVISION_ORDER[a] ?? 99) - (DIVISION_ORDER[b] ?? 99)).join(',')
}

/** rank 定义表 division 可能是 'P,C'，解析出该机组应写的单值 division。 */
const resolveCrewDivision = (rankDivisions: string, crewDivision: string): string => {
  const divs = rankDivisions.split(',').map((d) => d.trim()).filter(Boolean)
  if (divs.includes(crewDivision)) return crewDivision
  return divs[0] ?? crewDivision
}

/** team 唯一键：${filiale}|${team}（一个 code 一行，不再带 division）。 */
const teamCodeKey = (filiale: string, team: string): string => `${filiale}|${team}`

async function loadCrewCodeDefs(db: NodePgDatabase<Record<string, unknown>>): Promise<CrewCodeDefs> {
  const defs: CrewCodeDefs = {
    certificates: new Map(),
    qualifications: new Map(),
    teams: new Map(),
  }
  const certRows = await db.execute(sql`SELECT certificate, divisions FROM certificate`)
  for (const r of certRows.rows as Array<{ certificate: string; divisions: string }>) {
    defs.certificates.set(String(r.certificate), String(r.divisions))
  }
  const qualRows = await db.execute(sql`SELECT qualification, division FROM qualification`)
  for (const r of qualRows.rows as Array<{ qualification: string; division: string }>) {
    defs.qualifications.set(String(r.qualification), String(r.division))
  }
  const teamRows = await db.execute(sql`SELECT filiale, team, division FROM team`)
  for (const r of teamRows.rows as Array<{ filiale: string; team: string; division: string }>) {
    defs.teams.set(teamCodeKey(String(r.filiale), String(r.team)), String(r.division))
  }
  return defs
}

/**
 * 批量导入前补齐 code 定义表：certificate/qualification/team 中缺失的 code 插入，
 * 已存在但缺当前 division 的合并（UPDATE divisions='P,C'），已含则跳过。
 * 同一 batch 内同一 code 被 P/C 两条记录引用时，Map 状态就地更新，第二条自然触发 UPDATE 合并。
 * 置于每行 SAVEPOINT 之前，单行失败回滚不影响定义行。
 */
async function ensureBatchCodeDefs(
  tx: Tx,
  records: CrewImportRecord[],
  defs: CrewCodeDefs,
): Promise<void> {
  for (const rec of records) {
    for (const ct of rec.certificates) {
      const code = ct.certificate
      const existing = defs.certificates.get(code)
      const merged = existing === undefined ? rec.division : mergeDivisions(existing, rec.division)
      if (existing === undefined) {
        await tx.execute(sql`
          INSERT INTO certificate (certificate, divisions, certificate_type, created_by, updated_by)
          VALUES (${code}, ${merged}, 'O', 'F8_IMPORT', 'F8_IMPORT')
        `)
      } else if (merged !== existing) {
        await tx.execute(sql`
          UPDATE certificate SET divisions = ${merged}, updated_by = 'F8_IMPORT', updated_at = now()
          WHERE certificate = ${code}
        `)
      }
      defs.certificates.set(code, merged)
    }
    for (const q of rec.qualifications) {
      const code = q.qualification
      const existing = defs.qualifications.get(code)
      const merged = existing === undefined ? rec.division : mergeDivisions(existing, rec.division)
      if (existing === undefined) {
        await tx.execute(sql`
          INSERT INTO qualification (qualification, filiale, division, created_by, updated_by)
          VALUES (${code}, ${rec.filiale}, ${merged}, 'F8_IMPORT', 'F8_IMPORT')
        `)
      } else if (merged !== existing) {
        await tx.execute(sql`
          UPDATE qualification SET division = ${merged}, updated_by = 'F8_IMPORT', updated_at = now()
          WHERE qualification = ${code}
        `)
      }
      defs.qualifications.set(code, merged)
    }
    for (const t of rec.teams ?? []) {
      const key = teamCodeKey(rec.filiale, t.team)
      const existing = defs.teams.get(key)
      const merged = existing === undefined ? rec.division : mergeDivisions(existing, rec.division)
      if (existing === undefined) {
        await tx.execute(sql`
          INSERT INTO team (filiale, team, division, created_by, updated_by)
          VALUES (${rec.filiale}, ${t.team}, ${merged}, 'F8_IMPORT', 'F8_IMPORT')
        `)
      } else if (merged !== existing) {
        await tx.execute(sql`
          UPDATE team SET division = ${merged}, updated_by = 'F8_IMPORT', updated_at = now()
          WHERE filiale = ${rec.filiale} AND team = ${t.team}
        `)
      }
      defs.teams.set(key, merged)
    }
  }
}

async function upsertCrew(tx: Tx, rec: CrewImportRecord): Promise<void> {
  await tx.execute(sql`
    INSERT INTO crew (
      crew_id, first_name, middle_name, last_name, preferred_name,
      birthday, gender, division, empl_dt, seniority_num,
      home_address, tel, email_addr, contract_type, filiale, interface_id,
      status, created_by, updated_by
    ) VALUES (
      ${rec.crewId}, ${rec.firstName}, ${rec.middleName || null}, ${rec.lastName}, ${rec.preferredName || null},
      ${rec.birthday}, ${rec.gender}, ${rec.division}, COALESCE(${rec.emplDt}::timestamptz, now()), ${rec.seniorityNum},
      ${rec.homeAddress || null}, ${rec.tel || null}, ${rec.email || null}, ${rec.contractType || null}, ${rec.filiale}, ${rec.interfaceId},
      0, 'F8_IMPORT', 'F8_IMPORT'
    )
    ON CONFLICT (crew_id) DO UPDATE SET
      first_name = EXCLUDED.first_name,
      middle_name = EXCLUDED.middle_name,
      last_name = EXCLUDED.last_name,
      preferred_name = EXCLUDED.preferred_name,
      birthday = EXCLUDED.birthday,
      gender = EXCLUDED.gender,
      division = EXCLUDED.division,
      empl_dt = EXCLUDED.empl_dt,
      seniority_num = EXCLUDED.seniority_num,
      home_address = EXCLUDED.home_address,
      tel = EXCLUDED.tel,
      email_addr = EXCLUDED.email_addr,
      contract_type = EXCLUDED.contract_type,
      interface_id = EXCLUDED.interface_id,
      updated_by = 'F8_IMPORT',
      updated_at = now()
  `)
}

async function upsertPbsUser(tx: Tx, rec: CrewImportRecord, pbsSchemaName: string): Promise<void> {
  const pbsSchema = validateSchemaName(pbsSchemaName)
  const table = sql.raw(`${pbsSchema}.pbs_user`)
  const userName = displayNameForCrew(rec)

  await tx.execute(sql`
    INSERT INTO ${table} AS pbs_user (
      created_by,
      updated_by,
      crew_id,
      user_code,
      user_name,
      password_hash,
      branch_code,
      py_abbr,
      gender,
      tel,
      eff_dt,
      exp_dt,
      ad_active,
      status,
      is_admin,
      interface_user_id,
      password_access,
      portal_access,
      app_access,
      is_first_login,
      email,
      failed_login_count,
      token_version,
      division
    ) VALUES (
      'F8_IMPORT',
      'F8_IMPORT',
      ${rec.crewId},
      ${rec.crewId},
      ${userName},
      ${PBS_USER_PASSWORD_PLACEHOLDER},
      ${rec.filiale || 'F8'},
      ${rec.crewId},
      ${rec.gender || null},
      ${rec.tel || null},
      COALESCE(${rec.emplDt}::timestamptz, now()),
      null,
      0,
      0,
      0,
      ${rec.interfaceId || null},
      'N',
      'Y',
      'Y',
      'Y',
      ${rec.email || null},
      0,
      0,
      ${rec.division || null}
    )
    ON CONFLICT (crew_id) DO UPDATE SET
      updated_by = 'F8_IMPORT',
      updated_at = now(),
      user_name = EXCLUDED.user_name,
      branch_code = EXCLUDED.branch_code,
      py_abbr = EXCLUDED.py_abbr,
      gender = EXCLUDED.gender,
      tel = EXCLUDED.tel,
      eff_dt = EXCLUDED.eff_dt,
      exp_dt = EXCLUDED.exp_dt,
      interface_user_id = EXCLUDED.interface_user_id,
      password_access = COALESCE(pbs_user.password_access, EXCLUDED.password_access),
      portal_access = COALESCE(pbs_user.portal_access, EXCLUDED.portal_access),
      app_access = COALESCE(pbs_user.app_access, EXCLUDED.app_access),
      is_first_login = COALESCE(pbs_user.is_first_login, EXCLUDED.is_first_login),
      email = EXCLUDED.email,
      division = EXCLUDED.division
  `)
}

async function syncChildren(
  tx: Tx,
  rec: CrewImportRecord,
  rankPos: Map<string, string>,
  rankDiv: Map<string, string>,
  fleetMaster: Map<string, { ac: string | null; grp: string | null }>,
): Promise<void> {
  const cid = rec.crewId

  await tx.execute(sql`DELETE FROM crew_base WHERE crew_id = ${cid}`)
  for (const b of rec.bases) {
    await tx.execute(sql`
      INSERT INTO crew_base (crew_id, base, eff_dt, exp_dt, is_prime_base, created_by, updated_by)
      VALUES (${cid}, ${b.base}, ${b.effDt}, ${b.expDt}, ${b.isPrimary ? 1 : 0}, 'F8_IMPORT', 'F8_IMPORT')
    `)
  }

  await tx.execute(sql`DELETE FROM crew_rank WHERE crew_id = ${cid}`)
  await tx.execute(sql`DELETE FROM crew_status WHERE crew_id = ${cid}`)
  for (const r of rec.ranks) {
    const position = rankPos.get(r.rank.toUpperCase()) ?? 'UNK'
    const division = resolveCrewDivision(rankDiv.get(r.rank.toUpperCase()) ?? '', rec.division)
    await tx.execute(sql`
      INSERT INTO crew_rank (crew_id, rank, eff_dt, exp_dt, position, pre_cumulated_exp_days, division, created_by, updated_by)
      VALUES (${cid}, ${r.rank}, ${r.effDt}, ${r.expDt}, ${position}, 0, ${division}, 'F8_IMPORT', 'F8_IMPORT')
    `)
    await tx.execute(sql`
      INSERT INTO crew_status (crew_id, status, eff_dt, exp_dt, disable, created_by, updated_by)
      VALUES (${cid}, '1', ${r.effDt}, ${r.expDt}, 0, 'F8_IMPORT', 'F8_IMPORT')
    `)
  }

  await tx.execute(sql`DELETE FROM crew_certificate WHERE crew_id = ${cid}`)
  for (const ct of rec.certificates) {
    await tx.execute(sql`
      INSERT INTO crew_certificate (crew_id, certificate, eff_dt, exp_dt, is_valid, first_name, middle_name, last_name, created_by, updated_by)
      VALUES (${cid}, ${ct.certificate}, ${ct.effDt}, ${ct.expDt}, ${ct.isValid ? 1 : 0}, ${ct.firstName || null}, ${ct.middleName || null}, ${ct.lastName || null}, 'F8_IMPORT', 'F8_IMPORT')
    `)
  }

  await tx.execute(sql`DELETE FROM crew_fleet WHERE crew_id = ${cid}`)
  for (const f of rec.fleets) {
    const m = fleetMaster.get(f.fleet.toUpperCase())
    await tx.execute(sql`
      INSERT INTO crew_fleet (crew_id, fleet_specific, eff_dt, exp_dt, ac_type, fleet_grp, created_by, updated_by)
      VALUES (${cid}, ${f.fleet}, ${f.effDt}, ${f.expDt}, ${m?.ac ?? null}, ${m?.grp ?? null}, 'F8_IMPORT', 'F8_IMPORT')
    `)
  }

  await tx.execute(sql`DELETE FROM crew_qualification WHERE crew_id = ${cid}`)
  for (const q of rec.qualifications) {
    await tx.execute(sql`
      INSERT INTO crew_qualification (crew_id, qualification, eff_dt, exp_dt, is_valid, created_by, updated_by)
      VALUES (${cid}, ${q.qualification}, ${q.effDt}, ${q.expDt}, ${q.isValid ? 1 : 0}, 'F8_IMPORT', 'F8_IMPORT')
    `)
  }

  await tx.execute(sql`DELETE FROM crew_team WHERE crew_id = ${cid}`)
  for (const t of rec.teams ?? []) {
    await tx.execute(sql`
      INSERT INTO crew_team (crew_id, team, eff_dt, exp_dt, is_valid, remarks, source, created_by, updated_by)
      VALUES (${cid}, ${t.team}, ${t.effDt}, ${t.expDt}, ${t.isValid ? 1 : 0}, ${t.remarks || null}, 'interface', 'F8_IMPORT', 'F8_IMPORT')
    `)
  }
}

export async function processCrewImportJob(
  job: CrewImportJob,
  db: NodePgDatabase<Record<string, unknown>>,
  options: CrewImportProcessOptions,
): Promise<CrewJobResult> {
  const result: CrewJobResult = {
    entity: 'crew',
    imported: 0,
    added: 0,
    updated: 0,
    deleted: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }
  const total = job.records.length
  const publishEvery = 500
  const countedCrewIds = new Set<string>()

  const existingCrewIds = new Set<string>()
  if (job.records.length > 0) {
    const crewIds = [...new Set(job.records.map((record) => record.crewId))]
    const chunks = 1000
    for (let i = 0; i < crewIds.length; i += chunks) {
      const idList = sql.join(crewIds.slice(i, i + chunks).map((id) => sql`${id}`), sql`, `)
      const rows = await db.execute(sql`SELECT crew_id FROM crew WHERE crew_id IN (${idList})`)
      for (const row of rows.rows as Array<{ crew_id: string }>) {
        existingCrewIds.add(String(row.crew_id))
      }
    }
  }

  // Load lookups once: rank → position, rank → division, fleet master.
  const rankPos = new Map<string, string>()
  const rpRows = await db.execute(sql`SELECT rank, position FROM rank_position ORDER BY rank, display_order`)
  for (const r of rpRows.rows as Array<{ rank: string; position: string | null }>) {
    const rk = String(r.rank).toUpperCase()
    if (!rankPos.has(rk) && r.position) rankPos.set(rk, String(r.position).slice(0, 20))
  }
  const rankDivMap = new Map<string, string>()
  const rdRows = await db.execute(sql`SELECT rank, division FROM rank`)
  for (const r of rdRows.rows as Array<{ rank: string; division: string | null }>) {
    if (r.division) rankDivMap.set(String(r.rank).toUpperCase(), String(r.division))
  }
  const fleetMaster = new Map<string, { ac: string | null; grp: string | null }>()
  const flRows = await db.execute(sql`SELECT fleet, ac_type, fleet_grp FROM fleet`)
  for (const r of flRows.rows as Array<{ fleet: string; ac_type: string | null; fleet_grp: string | null }>) {
    fleetMaster.set(String(r.fleet).toUpperCase(), { ac: r.ac_type ?? null, grp: r.fleet_grp ?? null })
  }
  const defs = await loadCrewCodeDefs(db)

  await db.transaction(async (tx) => {
    await ensureBatchCodeDefs(tx, job.records, defs)
    for (let index = 0; index < job.records.length; index += 1) {
      const rec = job.records[index]!
      try {
        await tx.execute(sql`SAVEPOINT crew_sp`)
        await upsertCrew(tx, rec)
        await syncChildren(tx, rec, rankPos, rankDivMap, fleetMaster)
        await upsertPbsUser(tx, rec, options.pbsSchema)
        await tx.execute(sql`RELEASE SAVEPOINT crew_sp`)
        if (!countedCrewIds.has(rec.crewId)) {
          countedCrewIds.add(rec.crewId)
          result.imported++
          result.success++
          if (existingCrewIds.has(rec.crewId)) {
            result.updated++
          } else {
            result.added++
            existingCrewIds.add(rec.crewId)
          }
        }
      } catch (err) {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT crew_sp`)
        result.failed++
        result.errors.push({ id: rec.crewId, reason: err instanceof Error ? err.message : String(err) })
      }
      const processed = index + 1
      if (processed === total || processed % publishEvery === 0) {
        await publishWriteProgress(job.importId, 'crew', {
          processed,
          total,
          added: result.added,
          updated: result.updated,
          deleted: result.deleted,
          success: result.success,
          failed: result.failed,
          skipped: result.skipped,
        })
      }
    }
  })

  return result
}

export function startCrewInboundWorker(fastify: FastifyInstance): Worker {
  const worker = new Worker(withBullmqPrefix('connector.crew.inbound'),
    async (job) => {
      const data = job.data as CrewImportJob
      fastify.log.info({ syncId: data.syncId }, 'crew-inbound-worker processing')
      try {
        await publishWriteRunning(data.importId, 'crew')
        const result = await processCrewImportJob(data, fastify.db, { pbsSchema: env.PBS_SCHEMA })
        await refreshLiveLegalityAndManday(fastify, {
          crewIds: data.records.map((record) => record.crewId),
          legalityDates: [data.syncRangeDt[0], data.syncRangeDt[1]],
          startDt: data.syncRangeDt[0],
          endDt: data.syncRangeDt[1],
          updatedBy: 'CREW_IMPORT',
        })
        await publishWriteTerminal(data.importId, 'crew', 'done', undefined, {
          processed: data.records.length,
          total: data.records.length,
          added: result.added,
          updated: result.updated,
          deleted: result.deleted,
          success: result.success,
          failed: result.failed,
          skipped: result.skipped,
        })
        return result
      } catch (err) {
        await publishWriteTerminal(
          data.importId,
          'crew',
          'fail',
          err instanceof Error ? err.message : String(err),
        )
        throw err
      }
    },
    { connection: getBullmqRedisConnection(), concurrency: 1 },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, error: err.message }, 'crew-inbound job failed')
  })
  attachBullmqErrorLogger(worker, fastify.log, 'crew-inbound worker')

  return worker
}
