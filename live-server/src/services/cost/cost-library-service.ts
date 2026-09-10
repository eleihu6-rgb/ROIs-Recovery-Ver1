import type pg from 'pg'
import { calculateCost } from './cost-calculator.js'
import { revisionSchema, validateParameters } from './cost-validation.js'
import type { RevisionInput, SetInput } from './cost-validation.js'

type Db = pg.Pool | pg.PoolClient
type Row = Record<string, unknown>
export class CostLibraryError extends Error { constructor(readonly statusCode: number, message: string) { super(message) } }
const reject = (status: number, message: string): never => { throw new CostLibraryError(status, message) }
const camel = (row: Row): Row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
  const name = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
  const numeric = key === 'id' || key.endsWith('_id') || key === 'unit_price'
  return [name, value === null ? null : numeric ? Number(value) : value instanceof Date ? value.toISOString() : value]
}))
const revision = (row: Row): RevisionInput & { id: number; costInstanceId: number; revisionNo: number } => camel(row) as RevisionInput & { id: number; costInstanceId: number; revisionNo: number }

export class CostLibraryService {
  constructor(private readonly pool: pg.Pool) {}
  private async transaction<T>(fn: (db: pg.PoolClient) => Promise<T>, readOnly = false): Promise<T> {
    const db = await this.pool.connect()
    try { await db.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN'); const value = await fn(db); await db.query('COMMIT'); return value }
    catch (err) { await db.query('ROLLBACK'); if ((err as { code?: string }).code === '23503') reject(409, 'Cost is referenced and cannot be deleted'); throw err }
    finally { db.release() }
  }
  private async one(db: Db, sql: string, values: unknown[]): Promise<Row> { const { rows } = await db.query<Row>(sql, values); return rows[0] ?? reject(404, 'Cost record not found') }
  private async instance(db: Db, id: number): Promise<Row> {
    const row = await this.one(db, `SELECT i.*,t.type_code,t.category_code FROM cost_instance i JOIN cost_type t ON t.id=i.cost_type_id WHERE i.id=$1`, [id])
    const latest = await this.one(db, 'SELECT * FROM cost_revision WHERE cost_instance_id=$1 ORDER BY revision_no DESC LIMIT 1', [id])
    return { ...camel(row), latestRevision: revision(latest) }
  }
  private async set(db: Db, id: number): Promise<Row> {
    const row = await this.one(db, 'SELECT * FROM cost_set WHERE id=$1', [id])
    const members = await db.query<Row>('SELECT cost_instance_id,cost_revision_id,enabled,sort_order FROM cost_set_member WHERE cost_set_id=$1 ORDER BY sort_order,id', [id])
    return { ...camel(row), members: members.rows.map(camel) }
  }
  async catalog(): Promise<Row> {
    return this.transaction(async db => {
    const [types, instances, revisions, sets, members] = await Promise.all([
      db.query<Row>('SELECT id,type_code,name,category_code,calculator_code,parameter_schema_json FROM cost_type ORDER BY type_code'),
      db.query<Row>('SELECT i.*,t.type_code,t.category_code FROM cost_instance i JOIN cost_type t ON t.id=i.cost_type_id ORDER BY t.type_code,i.instance_no'),
      db.query<Row>('SELECT DISTINCT ON (cost_instance_id) * FROM cost_revision ORDER BY cost_instance_id,revision_no DESC'),
      db.query<Row>('SELECT * FROM cost_set ORDER BY is_default DESC,id'),
      db.query<Row>('SELECT cost_set_id,cost_instance_id,cost_revision_id,enabled,sort_order FROM cost_set_member ORDER BY sort_order,id'),
    ])
    const latest = new Map(revisions.rows.map(row => [String(row.cost_instance_id), revision(row)]))
    const grouped = new Map<string, Row[]>()
    for (const row of members.rows) { const key = String(row.cost_set_id); const list = grouped.get(key) ?? []; list.push(camel(row)); grouped.set(key, list) }
    return { types: types.rows.map(camel), instances: instances.rows.map(row => ({ ...camel(row), latestRevision: latest.get(String(row.id)) })), sets: sets.rows.map(row => ({ ...camel(row), members: grouped.get(String(row.id)) ?? [] })) }
    }, true)
  }
  async revisions(id: number): Promise<Row[]> { await this.one(this.pool, 'SELECT id FROM cost_instance WHERE id=$1', [id]); return (await this.pool.query<Row>('SELECT * FROM cost_revision WHERE cost_instance_id=$1 ORDER BY revision_no DESC', [id])).rows.map(camel) }
  private async insertRevision(db: Db, id: number, no: number, input: RevisionInput, user: string): Promise<Row> {
    const row = await this.one(db, `INSERT INTO cost_revision (cost_instance_id,revision_no,calculator_code,effective_from,effective_to,currency_code,unit_code,unit_price,params_json,applicability_json,reference,gh_policy_revision_id,created_by,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING *`, [id,no,input.calculatorCode,input.effectiveFrom,input.effectiveTo,input.currencyCode,input.unitCode,input.unitPrice,JSON.stringify(input.paramsJson),JSON.stringify(input.applicabilityJson),input.reference,input.ghPolicyRevisionId,user])
    return camel(row)
  }
  async addRevision(id: number, raw: unknown, user: string): Promise<Row> {
    const input = revisionSchema.parse(raw); validateParameters(input.calculatorCode, input.paramsJson)
    return this.transaction(async db => {
      const instance = await this.one(db, 'SELECT * FROM cost_instance WHERE id=$1 FOR UPDATE', [id])
      const type = await this.one(db, 'SELECT parameter_schema_json FROM cost_type WHERE id=$1', [instance.cost_type_id])
      const allowed = (type.parameter_schema_json as { calculatorCodes?: string[] }).calculatorCodes
      if (!allowed?.includes(input.calculatorCode)) reject(400, 'Calculator is not allowed for this cost type')
      const latest = await this.one(db, 'SELECT revision_no FROM cost_revision WHERE cost_instance_id=$1 ORDER BY revision_no DESC LIMIT 1', [id])
      if (Number(latest.revision_no) !== input.expectedRevisionNo) reject(409, 'Cost changed; reload before saving')
      if (input.calculatorCode === 'standby' && !input.ghPolicyRevisionId) reject(400, 'Standby requires a GH policy revision')
      if (input.calculatorCode !== 'standby' && input.ghPolicyRevisionId !== null) reject(400, 'Only standby costs can reference GH policies')
      if (input.ghPolicyRevisionId) {
        const gh = await this.one(db, 'SELECT calculator_code,currency_code FROM cost_revision WHERE id=$1 FOR KEY SHARE', [input.ghPolicyRevisionId])
        if (gh.calculator_code !== 'guarantee' || gh.currency_code !== input.currencyCode) reject(400, 'GH policy must be a guarantee with matching currency')
      }
      return this.insertRevision(db, id, input.expectedRevisionNo + 1, input, user)
    })
  }
  async updateInstance(id: number, input: { name: string; enabled: boolean }, user: string): Promise<Row> {
    return this.transaction(async db => { await this.one(db, 'UPDATE cost_instance SET name=$2,enabled=$3,updated_by=$4,updated_at=now() WHERE id=$1 RETURNING id', [id,input.name,input.enabled,user]); return this.instance(db,id) })
  }
  private async copyRevision(db: Db, source: Row, user: string, ghId?: number): Promise<{ instanceId: number; revisionId: number }> {
    const original = await this.one(db, 'SELECT * FROM cost_instance WHERE id=$1', [source.cost_instance_id])
    const type = await this.one(db, 'UPDATE cost_type SET next_instance_no=next_instance_no+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING next_instance_no-1 AS instance_no', [original.cost_type_id,user])
    const copy = await this.one(db, 'INSERT INTO cost_instance (cost_type_id,instance_no,name,source_instance_id,enabled,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id', [original.cost_type_id,type.instance_no,`${original.name} (copy)`,original.id,original.enabled,user])
    const input = revision(source)
    if (ghId !== undefined) input.ghPolicyRevisionId = ghId
    const copied = await this.insertRevision(db,Number(copy.id),1,input,user)
    return { instanceId: Number(copy.id), revisionId: Number(copied.id) }
  }
  async copyInstance(id: number, user: string): Promise<Row> { return this.transaction(async db => {
    await this.one(db, 'SELECT id FROM cost_instance WHERE id=$1', [id])
    const source = await this.one(db, 'SELECT * FROM cost_revision WHERE cost_instance_id=$1 ORDER BY revision_no DESC LIMIT 1', [id])
    return this.instance(db,(await this.copyRevision(db,source,user)).instanceId)
  }) }
  async deleteInstance(id: number): Promise<null> { return this.transaction(async db => {
    const row = await this.one(db, 'SELECT * FROM cost_instance WHERE id=$1 FOR UPDATE', [id])
    if (Number(row.instance_no) === 1) reject(409, 'Template instances cannot be deleted')
    const refs = await db.query(`SELECT 1 FROM cost_set_member WHERE cost_instance_id=$1 UNION ALL SELECT 1 FROM cost_instance WHERE source_instance_id=$1 UNION ALL SELECT 1 FROM cost_revision WHERE gh_policy_revision_id IN (SELECT id FROM cost_revision WHERE cost_instance_id=$1) LIMIT 1`, [id])
    if (refs.rowCount) reject(409, 'Cost instance is referenced')
    await db.query('DELETE FROM cost_revision WHERE cost_instance_id=$1', [id]); await db.query('DELETE FROM cost_instance WHERE id=$1', [id]); return null
  }) }
  private async insertSet(db: Db, input: SetInput, user: string): Promise<number> { return Number((await this.one(db, 'INSERT INTO cost_set (name,description,division,enabled,is_default,version,created_by,updated_by) VALUES ($1,$2,$3,$4,false,1,$5,$5) RETURNING id', [input.name,input.description,input.division,input.enabled,user])).id) }
  async createSet(input: SetInput, user: string): Promise<Row> { return this.transaction(async db => {
    const id = await this.insertSet(db,input,user)
    await db.query(`INSERT INTO cost_set_member (cost_set_id,cost_instance_id,cost_revision_id,enabled,sort_order,created_by,updated_by) SELECT $1,r.cost_instance_id,r.id,true,(row_number() OVER (ORDER BY r.cost_instance_id))::integer,$2,$2 FROM (SELECT DISTINCT ON (cost_instance_id) * FROM cost_revision ORDER BY cost_instance_id,revision_no DESC) r`,[id,user])
    return this.set(db,id)
  }) }
  private async lockSet(db: Db,id: number, expected?: number): Promise<Row> { const row = await this.one(db,'SELECT * FROM cost_set WHERE id=$1 FOR UPDATE',[id]); if (expected !== undefined && Number(row.version) !== expected) reject(409,'Cost set changed; reload before saving'); return row }
  async updateSet(id: number,input: SetInput & { expectedVersion: number },user: string): Promise<Row> { return this.transaction(async db => {
    await this.lockSet(db,id,input.expectedVersion)
    await db.query('UPDATE cost_set SET name=$2,description=$3,division=$4,enabled=$5,version=version+1,updated_by=$6,updated_at=now() WHERE id=$1',[id,input.name,input.description,input.division,input.enabled,user]); return this.set(db,id)
  }) }
  async setMembers(id: number, revisionIds: number[],expected: number,user: string): Promise<Row> { return this.transaction(async db => {
    await this.lockSet(db,id,expected)
    const revisions = await db.query<Row>('SELECT id,cost_instance_id FROM cost_revision WHERE id=ANY($1::bigint[]) FOR KEY SHARE',[revisionIds])
    if (revisions.rows.length !== revisionIds.length || new Set(revisions.rows.map(r => String(r.cost_instance_id))).size !== revisionIds.length) reject(400,'Membership requires distinct instances and valid revision IDs')
    await db.query('DELETE FROM cost_set_member WHERE cost_set_id=$1',[id])
    await db.query(`INSERT INTO cost_set_member (cost_set_id,cost_instance_id,cost_revision_id,enabled,sort_order,created_by,updated_by) SELECT $1,r.cost_instance_id,r.id,true,u.ordinality::integer,$3,$3 FROM unnest($2::bigint[]) WITH ORDINALITY u(id,ordinality) JOIN cost_revision r ON r.id=u.id`,[id,revisionIds,user])
    await db.query('UPDATE cost_set SET version=version+1,updated_by=$2,updated_at=now() WHERE id=$1',[id,user]); return this.set(db,id)
  }) }
  async copySet(id: number,name: string,mode: 'shared'|'independent',user: string): Promise<Row> { return this.transaction(async db => {
    const source = await this.lockSet(db,id)
    const copyId = await this.insertSet(db,{name,description:String(source.description),division:String(source.division),enabled:Boolean(source.enabled)},user)
    const members = await db.query<Row>('SELECT m.enabled AS member_enabled,m.sort_order,r.* FROM cost_set_member m JOIN cost_revision r ON r.id=m.cost_revision_id WHERE m.cost_set_id=$1 ORDER BY r.cost_instance_id',[id])
    const mapped = new Map<number,{instanceId:number;revisionId:number}>()
    if (mode === 'independent') {
      // Consistent lock order prevents simultaneous cross-type set copies deadlocking.
      await db.query('SELECT id FROM cost_type ORDER BY id FOR UPDATE')
      const byId = new Map(members.rows.map(row => [Number(row.id),row]))
      const copy = async (row: Row): Promise<{instanceId:number;revisionId:number}> => {
        const prior = mapped.get(Number(row.id)); if (prior) return prior
        let ghId: number | undefined
        const internal = byId.get(Number(row.gh_policy_revision_id))
        if (internal) ghId = (await copy(internal)).revisionId
        const result = await this.copyRevision(db,row,user,ghId); mapped.set(Number(row.id),result); return result
      }
      for (const row of members.rows) await copy(row)
    }
    for (const row of members.rows) {
      const target = mapped.get(Number(row.id)) ?? {instanceId:Number(row.cost_instance_id),revisionId:Number(row.id)}
      await db.query('INSERT INTO cost_set_member (cost_set_id,cost_instance_id,cost_revision_id,enabled,sort_order,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$6)',[copyId,target.instanceId,target.revisionId,row.member_enabled,row.sort_order,user])
    }
    return this.set(db,copyId)
  }) }
  async deleteSet(id: number): Promise<null> { return this.transaction(async db => { await this.lockSet(db,id); await db.query('DELETE FROM cost_set_member WHERE cost_set_id=$1',[id]); await db.query('DELETE FROM cost_set WHERE id=$1',[id]); return null }) }
  async calculate(id: number,inputs: unknown): Promise<ReturnType<typeof calculateCost>> {
    const row = await this.one(this.pool,'SELECT r.*,i.enabled FROM cost_revision r JOIN cost_instance i ON i.id=r.cost_instance_id WHERE r.id=$1',[id])
    const gh = row.gh_policy_revision_id ? await this.one(this.pool,'SELECT r.*,i.enabled FROM cost_revision r JOIN cost_instance i ON i.id=r.cost_instance_id WHERE r.id=$1',[row.gh_policy_revision_id]) : undefined
    try { return calculateCost({...revision(row),enabled:Boolean(row.enabled)},inputs,gh ? {...revision(gh),enabled:Boolean(gh.enabled)} : undefined) }
    catch (err) { throw new CostLibraryError(400,err instanceof Error ? err.message : 'Invalid calculation') }
  }
}
