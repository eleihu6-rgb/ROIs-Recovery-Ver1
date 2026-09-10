import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { config } from 'dotenv'

import { CostLibraryError, CostLibraryService } from './cost-library-service.js'
import type { CalculationRevision } from './cost-calculator.js'

config()

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})
const service = new CostLibraryService(pool)
const user = 'cost-test'
const marker = `cost-test-${Date.now()}`

const createdSets: number[] = []
const createdInstances: number[] = []
const createdTypes: number[] = []

const revisionInput = (overrides: Partial<CalculationRevision> & { expectedRevisionNo?: number }) => ({
  calculatorCode: 'quantity' as const,
  effectiveFrom: '2026-09-01T00:00:00.000Z',
  effectiveTo: null,
  currencyCode: 'CAD',
  unitCode: 'hour',
  unitPrice: 100,
  paramsJson: {},
  applicabilityJson: { test: marker },
  reference: marker,
  ghPolicyRevisionId: null,
  expectedRevisionNo: 0,
  ...overrides,
})

const expectCostError = async (promise: Promise<unknown>, statusCode: number): Promise<void> => {
  try {
    await promise
    throw new Error('Expected CostLibraryError')
  } catch (err) {
    expect(err).toBeInstanceOf(CostLibraryError)
    expect((err as CostLibraryError).statusCode).toBe(statusCode)
  }
}

const cleanupQuery = async (sql: string, values: unknown[]): Promise<void> => {
  try {
    await pool.query(sql, values)
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code !== '42P01' && code !== '23503') throw err
  }
}

const createType = async (calculatorCode: CalculationRevision['calculatorCode']): Promise<number> => {
  const typeCode = 800000 + createdTypes.length + Math.floor(Math.random() * 10000)
  const { rows } = await pool.query<{ id: string | number }>(
    `INSERT INTO cost_type
       (type_code,name,category_code,calculator_code,parameter_schema_json,next_instance_no,created_by,updated_by)
     VALUES ($1,$2,'test',$3,$4,2,$5,$5)
     RETURNING id`,
    [
      typeCode,
      `${marker}-${calculatorCode}`,
      calculatorCode,
      { calculatorCodes: [calculatorCode] },
      user,
    ],
  )
  const id = Number(rows[0].id)
  createdTypes.push(id)
  return id
}

const createInstance = async (
  calculatorCode: CalculationRevision['calculatorCode'],
  paramsJson: Record<string, unknown>,
  unitPrice: number | null,
  ghPolicyRevisionId: number | null = null,
): Promise<{ instanceId: number; revisionId: number }> => {
  const typeId = await createType(calculatorCode)
  const instanceNo = 900000 + createdInstances.length + Math.floor(Math.random() * 10000)
  const instance = await pool.query<{ id: string | number }>(
    `INSERT INTO cost_instance (cost_type_id,instance_no,name,source_instance_id,enabled,created_by,updated_by)
     VALUES ($1,$2,$3,NULL,true,$4,$4)
     RETURNING id`,
    [typeId, instanceNo, `${marker}-${calculatorCode}-${instanceNo}`, user],
  )
  const instanceId = Number(instance.rows[0].id)
  createdInstances.push(instanceId)
  const revision = await pool.query<{ id: string | number }>(
    `INSERT INTO cost_revision
       (cost_instance_id,revision_no,calculator_code,effective_from,effective_to,currency_code,unit_code,unit_price,params_json,applicability_json,reference,gh_policy_revision_id,created_by,updated_by)
     VALUES ($1,1,$2,$3,NULL,'CAD','hour',$4,$5,$6,$7,$8,$9,$9)
     RETURNING id`,
    [
      instanceId,
      calculatorCode,
      '2026-09-01T00:00:00.000Z',
      unitPrice,
      paramsJson,
      { test: marker },
      marker,
      ghPolicyRevisionId,
      user,
    ],
  )
  return { instanceId, revisionId: Number(revision.rows[0].id) }
}

describe('CostLibraryService PostgreSQL integration', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for cost library integration tests')
    }
    await pool.query('SELECT 1')
  })

  afterAll(async () => {
    for (const setId of createdSets.reverse()) {
      await cleanupQuery('DELETE FROM cost_set_member WHERE cost_set_id=$1', [setId])
      await cleanupQuery('DELETE FROM cost_set WHERE id=$1', [setId])
    }
    for (const instanceId of createdInstances.reverse()) {
      await cleanupQuery('DELETE FROM cost_set_member WHERE cost_instance_id=$1', [instanceId])
      await cleanupQuery('DELETE FROM cost_revision WHERE cost_instance_id=$1', [instanceId])
      await cleanupQuery('DELETE FROM cost_instance WHERE id=$1', [instanceId])
    }
    for (const typeId of createdTypes.reverse()) {
      await cleanupQuery('DELETE FROM cost_type WHERE id=$1', [typeId])
    }
    const leaks = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM (
         SELECT id FROM cost_type WHERE name LIKE $1
         UNION ALL
         SELECT id FROM cost_instance WHERE name LIKE $1
         UNION ALL
         SELECT id FROM cost_revision WHERE reference=$2
         UNION ALL
         SELECT id FROM cost_set WHERE name LIKE $1 OR description=$2
       ) leaked`,
      [`${marker}%`, marker],
    )
    expect(Number(leaks.rows[0].count)).toBe(0)
    await pool.end()
  })

  it('calculates through saved revisions for all calculator families', async () => {
    const quantity = await createInstance('quantity', {}, 12.5)
    const fixed = await createInstance('fixed', {}, 42)
    const minimum = await createInstance('minimum', { minimumQuantity: 4 }, 25)
    const guarantee = await createInstance('guarantee', {
      guaranteeHours: 85,
      tiers: [
        { upToHours: 90, multiplier: 1.2 },
        { upToHours: null, multiplier: 1.5 },
      ],
    }, 100)
    const standby = await createInstance('standby', { creditFactor: 0.5, departureCutoffMinutes: 60 }, null, guarantee.revisionId)
    const bands = await createInstance('bands', { threshold: 120, upperRate: 25 }, 10)
    const booking = await createInstance('booking', { originalAmount: 140, refundAmount: 100, changeFee: 25.555 }, 200)

    expect(await service.calculate(quantity.revisionId, { quantity: 2 })).toMatchObject({ amount: 25, status: 'priced' })
    await expectCostError(service.calculate(quantity.revisionId, {}), 400)
    expect(await service.calculate(fixed.revisionId, { quantity: 1 })).toMatchObject({ amount: 42, status: 'priced' })
    expect(await service.calculate(minimum.revisionId, { quantity: 0 })).toMatchObject({ amount: 0, status: 'priced' })
    expect(await service.calculate(guarantee.revisionId, { beforeCredit: 84, addedCredit: 6.75 })).toMatchObject({ amount: 712.5, status: 'priced' })
    expect(await service.calculate(standby.revisionId, {
      beforeCredit: 84,
      reportAt: '2026-09-10T07:00:00.000Z',
      departureAt: '2026-09-10T10:00:00.000Z',
      pairingCredit: 5.75,
    })).toMatchObject({ amount: 712.5, status: 'priced' })
    expect(await service.calculate(bands.revisionId, { delayBefore: 100, delayAfter: 150 })).toMatchObject({ amount: 950, status: 'priced' })
    expect(await service.calculate(booking.revisionId, {})).toMatchObject({ amount: 125.56, status: 'priced' })
  })

  it('rejects stale revision saves and preserves immutable revision history', async () => {
    const { instanceId } = await createInstance('quantity', {}, 10)

    const next = await service.addRevision(instanceId, revisionInput({ unitPrice: 11, expectedRevisionNo: 1 }), user)
    expect(next.revisionNo).toBe(2)

    await expectCostError(
      service.addRevision(instanceId, revisionInput({ unitPrice: 12, expectedRevisionNo: 1 }), user),
      409,
    )

    const revisions = await service.revisions(instanceId)
    expect(revisions.map((row) => row.revisionNo)).toEqual([2, 1])
  })

  it('allocates distinct instance numbers for concurrent copies', async () => {
    const source = await createInstance('quantity', {}, 10)

    const [copyA, copyB] = await Promise.all([
      service.copyInstance(source.instanceId, user),
      service.copyInstance(source.instanceId, user),
    ])
    createdInstances.push(Number(copyA.id), Number(copyB.id))

    expect(copyA.id).not.toBe(copyB.id)
    expect(copyA.instanceNo).not.toBe(copyB.instanceNo)
    expect(copyA.sourceInstanceId).toBe(source.instanceId)
    expect(copyB.sourceInstanceId).toBe(source.instanceId)
  })

  it('rejects deleting an instance referenced by a cost set, then allows deletion after membership cleanup', async () => {
    const source = await createInstance('quantity', {}, 10)
    const set = await service.createSet(
      { name: `${marker}-delete-protection`, description: marker, division: 'P', enabled: true },
      user,
    )
    createdSets.push(Number(set.id))

    await expectCostError(service.deleteInstance(source.instanceId), 409)

    await pool.query('DELETE FROM cost_set_member WHERE cost_set_id=$1 AND cost_instance_id=$2', [set.id, source.instanceId])
    await expect(service.deleteInstance(source.instanceId)).resolves.toBeNull()
    createdInstances.splice(createdInstances.indexOf(source.instanceId), 1)
  })

  it('rejects stale set membership updates', async () => {
    const source = await createInstance('quantity', {}, 10)
    const set = await service.createSet(
      { name: `${marker}-membership`, description: marker, division: 'P', enabled: true },
      user,
    )
    createdSets.push(Number(set.id))

    const updated = await service.setMembers(Number(set.id), [source.revisionId], Number(set.version), user)
    expect(updated.version).toBe(Number(set.version) + 1)

    await expectCostError(
      service.setMembers(Number(set.id), [source.revisionId], Number(set.version), user),
      409,
    )
  })

  it('rejects duplicate or mismatched membership revision lists', async () => {
    const source = await createInstance('quantity', {}, 10)
    const set = await service.createSet(
      { name: `${marker}-membership-invalid`, description: marker, division: 'P', enabled: true },
      user,
    )
    createdSets.push(Number(set.id))

    await expectCostError(
      service.setMembers(Number(set.id), [source.revisionId, source.revisionId], Number(set.version), user),
      400,
    )
    await expectCostError(
      service.setMembers(Number(set.id), [source.revisionId, 999999999999], Number(set.version), user),
      400,
    )
  })

  it('protects template instance 001 from deletion', async () => {
    const { rows } = await pool.query<{ id: string | number }>(
      'SELECT id FROM cost_instance WHERE instance_no=1 ORDER BY id LIMIT 1',
    )
    expect(rows[0], 'seeded template instance is required').toBeTruthy()

    await expectCostError(service.deleteInstance(Number(rows[0].id)), 409)
  })

  it('copySet shared pins selected revisions and independent remaps internal standby GH revision', async () => {
    const guarantee = await createInstance('guarantee', {
      guaranteeHours: 85,
      tiers: [
        { upToHours: 90, multiplier: 1.2 },
        { upToHours: null, multiplier: 1.5 },
      ],
    }, 100)
    const standby = await createInstance('standby', { creditFactor: 0.5, departureCutoffMinutes: 60 }, null, guarantee.revisionId)
    const guaranteeRev2 = await service.addRevision(
      guarantee.instanceId,
      revisionInput({
        calculatorCode: 'guarantee',
        unitPrice: 120,
        paramsJson: {
          guaranteeHours: 85,
          tiers: [
            { upToHours: 90, multiplier: 1.2 },
            { upToHours: null, multiplier: 1.5 },
          ],
        },
        expectedRevisionNo: 1,
      }),
      user,
    )
    const standbyRev2 = await service.addRevision(
      standby.instanceId,
      revisionInput({
        calculatorCode: 'standby',
        unitPrice: null,
        paramsJson: { creditFactor: 0.5, departureCutoffMinutes: 60 },
        ghPolicyRevisionId: Number(guaranteeRev2.id),
        expectedRevisionNo: 1,
      }),
      user,
    )
    const set = await service.createSet(
      { name: `${marker}-copy-source`, description: marker, division: 'P', enabled: true },
      user,
    )
    createdSets.push(Number(set.id))
    const pinned = await service.setMembers(
      Number(set.id),
      [guarantee.revisionId, standby.revisionId],
      Number(set.version),
      user,
    )

    const shared = await service.copySet(Number(set.id), `${marker}-copy-shared`, 'shared', user)
    createdSets.push(Number(shared.id))
    const sharedMembers = shared.members as Array<{ costRevisionId: number }>
    expect(sharedMembers.map((member) => member.costRevisionId).sort()).toEqual(
      [guarantee.revisionId, standby.revisionId].sort(),
    )

    const independent = await service.copySet(Number(set.id), `${marker}-copy-independent`, 'independent', user)
    createdSets.push(Number(independent.id))
    const independentMembers = independent.members as Array<{ costInstanceId: number; costRevisionId: number }>
    const copiedRevisionRows = await pool.query<{
      id: string | number
      cost_instance_id: string | number
      calculator_code: string
      gh_policy_revision_id: string | number | null
    }>(
      `SELECT id,cost_instance_id,calculator_code,gh_policy_revision_id
       FROM cost_revision
       WHERE id = ANY($1::bigint[])
       ORDER BY calculator_code`,
      [independentMembers.map((member) => member.costRevisionId)],
    )
    const copiedRevisions = copiedRevisionRows.rows
    const copiedInstances = independentMembers.map((member) => member.costInstanceId)
    createdInstances.push(...copiedInstances)
    expect(copiedInstances).not.toContain(guarantee.instanceId)
    expect(copiedInstances).not.toContain(standby.instanceId)
    expect(independentMembers.map((member) => member.costRevisionId)).not.toContain(Number(guaranteeRev2.id))
    expect(independentMembers.map((member) => member.costRevisionId)).not.toContain(Number(standbyRev2.id))

    const copiedGuarantee = copiedRevisions.find((row) => row.calculator_code === 'guarantee')
    const copiedStandby = copiedRevisions.find((row) => row.calculator_code === 'standby')
    expect(copiedGuarantee).toBeTruthy()
    expect(copiedStandby).toBeTruthy()
    expect(Number(copiedStandby!.gh_policy_revision_id)).toBe(Number(copiedGuarantee!.id))
    expect(Number(pinned.version)).toBe(Number(set.version) + 1)
  })
})
