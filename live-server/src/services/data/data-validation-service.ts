import { eq, and } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { base } from '../../models/base/base.js'
import { rank } from '../../models/base/rank.js'
import { fleet } from '../../models/base/fleet.js'
import { composition } from '../../models/base/composition.js'
import { assignment, assignmentGroup } from '../../models/base/assignment.js'
import { crew } from '../../models/crew/crew.js'
import { crewBase } from '../../models/crew/crew-base.js'
import { crewRank } from '../../models/crew/crew-rank.js'
import { crewFleet } from '../../models/crew/crew-fleet.js'

export interface DataChange {
  clientChangeId: string
  entityId: string
  action: 'create' | 'update' | 'expire' | 'delete'
  rowId?: number
  crewId?: string
  before?: Record<string, unknown>
  after: Record<string, unknown>
}

export interface DataValidationIssue {
  severity: 'error' | 'warning'
  code: 'missing_parent' | 'duplicate_key' | 'invalid_effective_range' | 'overlap_effective_range' | 'parent_in_use' | 'invalid_value'
  entityId: string
  rowId?: number
  clientChangeId?: string
  field?: string
  message: string
  parentEntityId?: string
  parentField?: string
  parentValue?: string
}

const EFFECTIVE_DATED_ENTITIES = new Set([
  'crew_base',
  'crew_rank',
  'crew_fleet',
  'crew_qualification',
  'crew_team',
  'crew_status',
])

const ASSIGNMENT_RATIO_FIELDS = new Map([
  ['btPct', 'BT %'],
  ['bt_pct', 'BT %'],
  ['fdpPct', 'FDP %'],
  ['fdp_pct', 'FDP %'],
  ['dpPct', 'DP %'],
  ['dp_pct', 'DP %'],
  ['ftPct', 'FT %'],
  ['ft_pct', 'FT %'],
  ['wpPct', 'WP %'],
  ['wp_pct', 'WP %'],
])

export class DataValidationService {
  async validate(fastify: FastifyInstance, changes: DataChange[]): Promise<DataValidationIssue[]> {
    if (changes.length === 0) return []

    const issues: DataValidationIssue[] = []

    await this.checkParentKeys(fastify, changes, issues)
    await this.checkDuplicateKeys(fastify, changes, issues)
    this.checkEffectiveDates(changes, issues)
    this.checkAssignmentRatios(changes, issues)

    return issues
  }

  private checkAssignmentRatios(changes: DataChange[], issues: DataValidationIssue[]): void {
    for (const change of changes) {
      if (change.entityId !== 'assignment' || change.action === 'delete') continue
      for (const [field, label] of ASSIGNMENT_RATIO_FIELDS) {
        if (!(field in change.after)) continue
        const raw = change.after[field]
        if (raw === null || raw === undefined || raw === '') continue
        const value = Number(raw)
        if (!Number.isFinite(value) || value < 0 || value > 1) {
          issues.push({
            severity: 'error',
            code: 'invalid_value',
            entityId: change.entityId,
            rowId: change.rowId,
            clientChangeId: change.clientChangeId,
            field,
            message: `${label} must be between 0 and 1. Use 0.33 for 33%.`,
          })
        }
      }
    }
  }

  private async checkParentKeys(
    fastify: FastifyInstance,
    changes: DataChange[],
    issues: DataValidationIssue[],
  ): Promise<void> {
    for (const change of changes) {
      if (change.action === 'delete') continue

      const after = change.after

      // Helper: check a single parent reference safely
      const checkParent = async (
        parentEntityId: string,
        parentField: string,
        value: unknown,
        lookupFn: (val: string) => Promise<boolean>,
      ) => {
        if (value === null || value === undefined || value === '') return
        const strVal = String(value)
        try {
          const exists = await lookupFn(strVal)
          if (!exists) {
            issues.push({
              severity: 'error',
              code: 'missing_parent',
              entityId: change.entityId,
              rowId: change.rowId,
              clientChangeId: change.clientChangeId,
              field: parentField,
              message: `${parentEntityId}.${parentField} not found`,
              parentEntityId,
              parentField,
              parentValue: strVal,
            })
          }
        } catch {
          // DB error: emit warning rather than throwing
          issues.push({
            severity: 'warning',
            code: 'missing_parent',
            entityId: change.entityId,
            rowId: change.rowId,
            clientChangeId: change.clientChangeId,
            field: parentField,
            message: `Could not verify ${parentEntityId}.${parentField} (DB error)`,
            parentEntityId,
            parentField,
          })
        }
      }

      switch (change.entityId) {
        case 'crew_base': {
          const crewIdVal = after.crewId ?? after.crew_id
          await checkParent('crew', 'crew_id', crewIdVal, async (v) => {
            const rows = await fastify.db.select({ c: crew.crewId }).from(crew).where(eq(crew.crewId, v)).limit(1)
            return rows.length > 0
          })
          const baseVal = after.base
          await checkParent('base', 'base', baseVal, async (v) => {
            const rows = await fastify.db.select({ b: base.base }).from(base).where(eq(base.base, v)).limit(1)
            return rows.length > 0
          })
          break
        }

        case 'crew_rank': {
          const crewIdVal = after.crewId ?? after.crew_id
          await checkParent('crew', 'crew_id', crewIdVal, async (v) => {
            const rows = await fastify.db.select({ c: crew.crewId }).from(crew).where(eq(crew.crewId, v)).limit(1)
            return rows.length > 0
          })
          const rankVal = after.rank
          await checkParent('rank', 'rank', rankVal, async (v) => {
            const rows = await fastify.db.select({ r: rank.rank }).from(rank).where(eq(rank.rank, v)).limit(1)
            return rows.length > 0
          })
          break
        }

        case 'crew_fleet': {
          const crewIdVal = after.crewId ?? after.crew_id
          await checkParent('crew', 'crew_id', crewIdVal, async (v) => {
            const rows = await fastify.db.select({ c: crew.crewId }).from(crew).where(eq(crew.crewId, v)).limit(1)
            return rows.length > 0
          })
          const fleetVal = after.fleetSpecific ?? after.fleet_specific
          await checkParent('fleet', 'fleet', fleetVal, async (v) => {
            const rows = await fastify.db.select({ f: fleet.fleet }).from(fleet).where(eq(fleet.fleet, v)).limit(1)
            return rows.length > 0
          })
          break
        }

        case 'crew_qualification': {
          const crewIdVal = after.crewId ?? after.crew_id
          await checkParent('crew', 'crew_id', crewIdVal, async (v) => {
            const rows = await fastify.db.select({ c: crew.crewId }).from(crew).where(eq(crew.crewId, v)).limit(1)
            return rows.length > 0
          })
          break
        }

        case 'crew_team': {
          const crewIdVal = after.crewId ?? after.crew_id
          await checkParent('crew', 'crew_id', crewIdVal, async (v) => {
            const rows = await fastify.db.select({ c: crew.crewId }).from(crew).where(eq(crew.crewId, v)).limit(1)
            return rows.length > 0
          })
          break
        }

        case 'composition_rank': {
          const compIdVal = after.compId ?? after.comp_id
          if (compIdVal !== null && compIdVal !== undefined) {
            const numId = Number(compIdVal)
            if (!Number.isNaN(numId)) {
              try {
                const rows = await fastify.db.select({ c: composition.id }).from(composition).where(eq(composition.id, numId)).limit(1)
                if (rows.length === 0) {
                  issues.push({
                    severity: 'error',
                    code: 'missing_parent',
                    entityId: change.entityId,
                    rowId: change.rowId,
                    clientChangeId: change.clientChangeId,
                    field: 'comp_id',
                    message: 'composition.id not found',
                    parentEntityId: 'composition',
                    parentField: 'id',
                  })
                }
              } catch {
                issues.push({
                  severity: 'warning',
                  code: 'missing_parent',
                  entityId: change.entityId,
                  rowId: change.rowId,
                  clientChangeId: change.clientChangeId,
                  field: 'comp_id',
                  message: 'Could not verify composition.id (DB error)',
                  parentEntityId: 'composition',
                  parentField: 'id',
                })
              }
            }
          }
          const rankVal = after.rank
          await checkParent('rank', 'rank', rankVal, async (v) => {
            const rows = await fastify.db.select({ r: rank.rank }).from(rank).where(eq(rank.rank, v)).limit(1)
            return rows.length > 0
          })
          break
        }

        case 'composition_load': {
          const compIdVal = after.compId ?? after.comp_id
          if (compIdVal !== null && compIdVal !== undefined) {
            const numId = Number(compIdVal)
            if (!Number.isNaN(numId)) {
              try {
                const rows = await fastify.db.select({ c: composition.id }).from(composition).where(eq(composition.id, numId)).limit(1)
                if (rows.length === 0) {
                  issues.push({
                    severity: 'error',
                    code: 'missing_parent',
                    entityId: change.entityId,
                    rowId: change.rowId,
                    clientChangeId: change.clientChangeId,
                    field: 'comp_id',
                    message: 'composition.id not found',
                    parentEntityId: 'composition',
                    parentField: 'id',
                  })
                }
              } catch {
                issues.push({
                  severity: 'warning',
                  code: 'missing_parent',
                  entityId: change.entityId,
                  rowId: change.rowId,
                  clientChangeId: change.clientChangeId,
                  field: 'comp_id',
                  message: 'Could not verify composition.id (DB error)',
                  parentEntityId: 'composition',
                  parentField: 'id',
                })
              }
            }
          }
          const fleetVal = after.fleet
          if (fleetVal !== null && fleetVal !== undefined && fleetVal !== '') {
            await checkParent('fleet', 'fleet', fleetVal, async (v) => {
              const rows = await fastify.db.select({ f: fleet.fleet }).from(fleet).where(eq(fleet.fleet, v)).limit(1)
              return rows.length > 0
            })
          }
          break
        }

        default:
          break
      }
    }
  }

  private async checkDuplicateKeys(
    fastify: FastifyInstance,
    changes: DataChange[],
    issues: DataValidationIssue[],
  ): Promise<void> {
    for (const change of changes) {
      if (change.action !== 'create') continue

      const after = change.after

      const pushDuplicate = (field: string, message: string) => {
        issues.push({
          severity: 'error',
          code: 'duplicate_key',
          entityId: change.entityId,
          rowId: change.rowId,
          clientChangeId: change.clientChangeId,
          field,
          message,
        })
      }

      try {
        switch (change.entityId) {
          case 'base': {
            const filialeVal = String(after.filiale ?? '')
            const baseVal = String(after.base ?? '')
            if (filialeVal && baseVal) {
              const rows = await fastify.db
                .select({ b: base.base })
                .from(base)
                .where(and(eq(base.filiale, filialeVal), eq(base.base, baseVal)))
                .limit(1)
              if (rows.length > 0) pushDuplicate('base', `Base '${baseVal}' already exists for filiale '${filialeVal}'`)
            }
            break
          }

          case 'rank': {
            const rankVal = String(after.rank ?? '')
            if (rankVal) {
              const rows = await fastify.db
                .select({ r: rank.rank })
                .from(rank)
                .where(eq(rank.rank, rankVal))
                .limit(1)
              if (rows.length > 0) pushDuplicate('rank', `Rank '${rankVal}' already exists`)
            }
            break
          }

          case 'fleet': {
            const fleetVal = String(after.fleet ?? '')
            if (fleetVal) {
              const rows = await fastify.db
                .select({ f: fleet.fleet })
                .from(fleet)
                .where(eq(fleet.fleet, fleetVal))
                .limit(1)
              if (rows.length > 0) pushDuplicate('fleet', `Fleet '${fleetVal}' already exists`)
            }
            break
          }

          case 'crew': {
            const crewIdVal = String(after.crewId ?? after.crew_id ?? '')
            if (crewIdVal) {
              const rows = await fastify.db
                .select({ c: crew.crewId })
                .from(crew)
                .where(eq(crew.crewId, crewIdVal))
                .limit(1)
              if (rows.length > 0) pushDuplicate('crew_id', `Crew ID already exists`)
            }
            break
          }

          case 'assignment': {
            const codeVal = String(after.assignment ?? '')
            if (codeVal) {
              const rows = await fastify.db
                .select({ a: assignment.assignment })
                .from(assignment)
                .where(eq(assignment.assignment, codeVal))
                .limit(1)
              if (rows.length > 0) pushDuplicate('assignment', `Assignment '${codeVal}' already exists`)
            }
            break
          }

          case 'assignment_group': {
            const groupVal = String(after.assignmentGroup ?? after.assignment_group ?? '')
            if (groupVal) {
              const rows = await fastify.db
                .select({ g: assignmentGroup.assignmentGroup })
                .from(assignmentGroup)
                .where(eq(assignmentGroup.assignmentGroup, groupVal))
                .limit(1)
              if (rows.length > 0) pushDuplicate('assignmentGroup', `Assignment Group '${groupVal}' already exists`)
            }
            break
          }

          case 'composition': {
            const nameVal = String(after.name ?? '')
            const divisionVal = String(after.division ?? '')
            if (nameVal && divisionVal) {
              const rows = await fastify.db
                .select({ c: composition.id })
                .from(composition)
                .where(and(eq(composition.name, nameVal), eq(composition.division, divisionVal)))
                .limit(1)
              if (rows.length > 0) pushDuplicate('name', `Composition '${nameVal}' already exists for division '${divisionVal}'`)
            }
            break
          }

          case 'crew_rank': {
            const crewIdVal = String(after.crewId ?? after.crew_id ?? '')
            const rankVal = String(after.rank ?? '')
            const effDtVal = after.effDt ?? after.eff_dt
            if (crewIdVal && rankVal && effDtVal) {
              const effDtDate = new Date(String(effDtVal))
              if (!Number.isNaN(effDtDate.getTime())) {
                const rows = await fastify.db
                  .select({ r: crewRank.id })
                  .from(crewRank)
                  .where(
                    and(
                      eq(crewRank.crewId, crewIdVal),
                      eq(crewRank.rank, rankVal),
                      eq(crewRank.effDt, effDtDate),
                    ),
                  )
                  .limit(1)
                if (rows.length > 0) pushDuplicate('rank', `Crew rank record already exists for this crew/rank/effective-date combination`)
              }
            }
            break
          }

          default:
            break
        }
      } catch {
        // DB error on duplicate check: emit warning, do not block
        issues.push({
          severity: 'warning',
          code: 'duplicate_key',
          entityId: change.entityId,
          rowId: change.rowId,
          clientChangeId: change.clientChangeId,
          message: `Could not verify uniqueness for ${change.entityId} (DB error)`,
        })
      }
    }
  }

  private checkEffectiveDates(changes: DataChange[], issues: DataValidationIssue[]): void {
    for (const change of changes) {
      if (!EFFECTIVE_DATED_ENTITIES.has(change.entityId)) continue
      if (change.action === 'delete') continue

      const effDt = change.after.effDt ?? change.after.eff_dt
      const expDt = change.after.expDt ?? change.after.exp_dt

      if (!effDt) {
        issues.push({
          severity: 'error',
          code: 'invalid_effective_range',
          entityId: change.entityId,
          rowId: change.rowId,
          clientChangeId: change.clientChangeId,
          field: 'eff_dt',
          message: 'Effective date is required',
        })
      }

      if (effDt && expDt) {
        if (new Date(expDt as string) <= new Date(effDt as string)) {
          issues.push({
            severity: 'error',
            code: 'invalid_effective_range',
            entityId: change.entityId,
            rowId: change.rowId,
            clientChangeId: change.clientChangeId,
            field: 'exp_dt',
            message: 'Expiry date must be after effective date',
          })
        }
      }
    }
  }
}

export const dataValidationService = new DataValidationService()
