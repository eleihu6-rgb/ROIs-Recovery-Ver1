import { eq, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { FastifyInstance } from 'fastify'
import type { DataChange, DataValidationIssue } from './data-validation-service.js'
import { dataValidationService } from './data-validation-service.js'
import { composition, compositionLoad, compositionRank } from '../../models/base/composition.js'
import { rank } from '../../models/base/rank.js'
import { assignment, assignmentGroup } from '../../models/base/assignment.js'
import { rosterPeriod as rosterPeriodTable, rosterPeriodConfig as rosterPeriodConfigTable } from '../../models/base/roster-period.js'
import { crewBase } from '../../models/crew/crew-base.js'
import { crewRank } from '../../models/crew/crew-rank.js'
import { crewFleet } from '../../models/crew/crew-fleet.js'
import { crewQualification } from '../../models/crew/crew-qualification.js'
import { crewTeam } from '../../models/crew/crew-team.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'
import { invalidatePattern } from '../../utils/cache.js'

export interface SaveResult {
  revisionId: number
  committed: number
  issues: DataValidationIssue[]
}

// Transaction type matches what Drizzle passes to the transaction callback
type Tx = NodePgDatabase<Record<string, unknown>>

const DATA_ENTITY_TABLES: Record<string, string> = {
  filiale: 'filiale',
  base: 'base',
  department: 'crew_department',
  division: 'division',
  division_construction: 'division_construction',
  team: 'team',
  rank: 'rank',
  rank_acting: 'rank_acting',
  rank_position: 'rank_position',
  fleet: 'fleet',
  aircraft: 'aircraft',
  airport: 'airport',
  route: 'route',
  hotel: 'hotel',
  assignment: 'assignment',
  assignment_group: 'assignment_group',
  assignment_group_map: 'assignment_group_map',
  qualification: 'qualification',
  qualification_projection: 'qualification_projection',
  certificate: 'certificate',
  language: 'language',
  port_qual_reqmnt: 'port_qual_reqmnt',
  composition: 'composition',
  composition_rank: 'composition_rank',
  composition_load: 'composition_load',
  roster_period: 'roster_period',
  roster_period_config: 'roster_period_config',
  dictionary: 'dictionary',
  attribute: 'attribute',
  live_config: 'live_config',
  severity: 'severity',
  pane_header: 'pane_header',
  query_criteria: 'query_criteria',
  sort_criteria: 'sort_criteria',
  user_query: 'user_query',
  query: 'query',
  holiday: 'holiday',
  crew: 'crew',
  crew_base: 'crew_base',
  crew_rank: 'crew_rank',
  crew_fleet: 'crew_fleet',
  crew_qualification: 'crew_qualification',
  crew_team: 'crew_team',
  crew_status: 'crew_status',
  crew_certificate: 'crew_certificate',
  crew_license: 'crew_license',
  crew_lic_instructor: 'crew_lic_instructor',
  crew_language: 'crew_language',
  crew_entitlement: 'crew_entitlement',
  crew_memo: 'crew_memo',
  crew_profile: 'crew_profile',
  crew_seniority: 'crew_seniority',
  crew_kpi_adjust: 'crew_kpi_adjust',
}

const READONLY_GENERIC_FIELDS = new Set([
  'id',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
  'created_by',
  'created_at',
  'updated_by',
  'updated_at',
])

const camelToSnake = (key: string): string =>
  key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

const assertSafeIdentifier = (identifier: string): string => {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe data entity identifier '${identifier}'`)
  }
  return identifier
}

export class DataSaveService {
  async save(
    fastify: FastifyInstance,
    changes: DataChange[],
    userId: string,
  ): Promise<SaveResult> {
    // 1. Re-run full validation
    const issues = await dataValidationService.validate(fastify, changes)
    const hasErrors = issues.some((i) => i.severity === 'error')

    // 2. If any errors, return without saving
    if (hasErrors) {
      return { revisionId: 0, committed: 0, issues }
    }

    // 3. Save in one transaction — any thrown error rolls back the whole batch
    let committed = 0
    await fastify.db.transaction(async (tx) => {
      for (const change of changes) {
        await this.applyChange(tx, change, userId)
        committed++
      }
    })

    // 4. Invalidate Redis caches for changed entity families
    await this.invalidateCaches(fastify, changes)

    // 5. Return result
    const revisionId = Date.now()
    return { revisionId, committed, issues: [] }
  }

  private async applyChange(tx: Tx, change: DataChange, userId: string): Promise<void> {
    const { entityId, action, rowId, after } = change
    const now = new Date()

    // Helper: coerce a value to Date or null
    const toDate = (v: unknown): Date | null => {
      if (v === null || v === undefined || v === '') return null
      const d = new Date(String(v))
      return Number.isNaN(d.getTime()) ? null : d
    }

    // Helper: coerce a value to number or null
    const toNum = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null
      const n = Number(v)
      return Number.isNaN(n) ? null : n
    }

    switch (entityId) {
      // ── composition ──────────────────────────────────────────────────────────

      case 'composition': {
        if (action === 'create') {
          await tx.insert(composition).values({
            division: String(after.division ?? ''),
            name: String(after.name ?? ''),
            nameDesc: after.nameDesc != null ? String(after.nameDesc) : null,
            displayOrder: toNum(after.displayOrder) ?? 0,
            hierarchy: toNum(after.hierarchy) != null ? (toNum(after.hierarchy) as number) : null,
            filiale: after.filiale != null ? String(after.filiale) : null,
            ...auditCreate(userId),
          })
        } else if (action === 'update') {
          if (!rowId) throw new Error(`composition update requires rowId`)
          await tx
            .update(composition)
            .set({
              division: after.division != null ? String(after.division) : undefined,
              name: after.name != null ? String(after.name) : undefined,
              nameDesc: after.nameDesc !== undefined ? (after.nameDesc != null ? String(after.nameDesc) : null) : undefined,
              displayOrder: after.displayOrder != null ? (toNum(after.displayOrder) ?? undefined) : undefined,
              hierarchy: after.hierarchy !== undefined ? (toNum(after.hierarchy) as number | null) : undefined,
              filiale: after.filiale !== undefined ? (after.filiale != null ? String(after.filiale) : null) : undefined,
              ...auditUpdate(userId),
            })
            .where(eq(composition.id, rowId))
        } else if (action === 'delete') {
          if (!rowId) throw new Error(`composition delete requires rowId`)
          // Delete child records first within the same tx
          await tx.delete(compositionRank).where(eq(compositionRank.compId, rowId))
          await tx.delete(compositionLoad).where(eq(compositionLoad.compId, rowId))
          await tx.delete(composition).where(eq(composition.id, rowId))
        } else {
          throw new Error(`composition does not support action '${action}'`)
        }
        break
      }

      // ── composition_rank ─────────────────────────────────────────────────────

      case 'composition_rank': {
        if (action === 'create') {
          const compId = toNum(after.compId ?? after.comp_id)
          if (!compId) throw new Error('composition_rank create requires compId')
          await tx.insert(compositionRank).values({
            compId,
            rank: String(after.rank ?? ''),
            planValue: toNum(after.planValue ?? after.plan_value) ?? 0,
            planValueExtra: toNum(after.planValueExtra ?? after.plan_value_extra) ?? 0,
            options: (toNum(after.options) ?? 1) as number,
            ...auditCreate(userId),
          })
        } else if (action === 'update') {
          if (!rowId) throw new Error(`composition_rank update requires rowId`)
          await tx
            .update(compositionRank)
            .set({
              rank: after.rank != null ? String(after.rank) : undefined,
              planValue: after.planValue != null || after.plan_value != null
                ? (toNum(after.planValue ?? after.plan_value) ?? undefined)
                : undefined,
              planValueExtra: after.planValueExtra != null || after.plan_value_extra != null
                ? (toNum(after.planValueExtra ?? after.plan_value_extra) ?? undefined)
                : undefined,
              options: after.options != null ? (toNum(after.options) as number | undefined) : undefined,
              ...auditUpdate(userId),
            })
            .where(eq(compositionRank.id, rowId))
        } else if (action === 'delete') {
          if (!rowId) throw new Error(`composition_rank delete requires rowId`)
          await tx.delete(compositionRank).where(eq(compositionRank.id, rowId))
        } else {
          throw new Error(`composition_rank does not support action '${action}'`)
        }
        break
      }

      // ── composition_load ─────────────────────────────────────────────────────

      case 'composition_load': {
        if (action === 'create') {
          const compId = toNum(after.compId ?? after.comp_id)
          if (!compId) throw new Error('composition_load create requires compId')
          const effDt = toDate(after.effDt ?? after.eff_dt)
          if (!effDt) throw new Error('composition_load create requires effDt')
          await tx.insert(compositionLoad).values({
            compId,
            division: String(after.division ?? ''),
            filiale: String(after.filiale ?? ''),
            sequence: (toNum(after.sequence) ?? 0) as number,
            fltNum: after.fltNum != null ? String(after.fltNum) : null,
            fleet: after.fleet != null ? String(after.fleet) : null,
            flightFlag: after.flightFlag != null ? String(after.flightFlag) : null,
            fltType: after.fltType != null ? String(after.fltType) : null,
            segType: after.segType != null ? String(after.segType) : null,
            loadFactor: after.loadFactor != null ? String(after.loadFactor) : null,
            effDt,
            expDt: toDate(after.expDt ?? after.exp_dt),
            dow: after.dow != null ? String(after.dow) : '1234567',
            description: after.description != null ? String(after.description) : null,
            ...auditCreate(userId),
          })
        } else if (action === 'update') {
          if (!rowId) throw new Error(`composition_load update requires rowId`)
          await tx
            .update(compositionLoad)
            .set({
              fleet: after.fleet !== undefined ? (after.fleet != null ? String(after.fleet) : null) : undefined,
              flightFlag: after.flightFlag !== undefined ? (after.flightFlag != null ? String(after.flightFlag) : null) : undefined,
              fltType: after.fltType !== undefined ? (after.fltType != null ? String(after.fltType) : null) : undefined,
              segType: after.segType !== undefined ? (after.segType != null ? String(after.segType) : null) : undefined,
              loadFactor: after.loadFactor !== undefined ? (after.loadFactor != null ? String(after.loadFactor) : null) : undefined,
              effDt: after.effDt != null || after.eff_dt != null
                ? (toDate(after.effDt ?? after.eff_dt) ?? undefined)
                : undefined,
              expDt: after.expDt !== undefined || after.exp_dt !== undefined
                ? toDate(after.expDt ?? after.exp_dt)
                : undefined,
              dow: after.dow != null ? String(after.dow) : undefined,
              description: after.description !== undefined
                ? (after.description != null ? String(after.description) : null)
                : undefined,
              sequence: after.sequence != null ? (toNum(after.sequence) as number | undefined) : undefined,
              ...auditUpdate(userId),
            })
            .where(eq(compositionLoad.id, rowId))
        } else if (action === 'delete') {
          if (!rowId) throw new Error(`composition_load delete requires rowId`)
          await tx.delete(compositionLoad).where(eq(compositionLoad.id, rowId))
        } else {
          throw new Error(`composition_load does not support action '${action}'`)
        }
        break
      }

      // ── crew_base ────────────────────────────────────────────────────────────

      case 'crew_base': {
        if (action === 'create') {
          const crewId = String(after.crewId ?? after.crew_id ?? '')
          if (!crewId) throw new Error('crew_base create requires crewId')
          const effDt = toDate(after.effDt ?? after.eff_dt)
          if (!effDt) throw new Error('crew_base create requires effDt')
          await tx.insert(crewBase).values({
            crewId,
            base: String(after.base ?? ''),
            effDt,
            expDt: toDate(after.expDt ?? after.exp_dt),
            isPrimeBase: (toNum(after.isPrimeBase ?? after.is_prime_base) ?? 1) as number,
            ...auditCreate(userId),
          })
        } else if (action === 'update') {
          if (!rowId) throw new Error(`crew_base update requires rowId`)
          await tx
            .update(crewBase)
            .set({
              base: after.base != null ? String(after.base) : undefined,
              effDt: after.effDt != null || after.eff_dt != null
                ? (toDate(after.effDt ?? after.eff_dt) ?? undefined)
                : undefined,
              expDt: after.expDt !== undefined || after.exp_dt !== undefined
                ? toDate(after.expDt ?? after.exp_dt)
                : undefined,
              isPrimeBase: after.isPrimeBase != null || after.is_prime_base != null
                ? (toNum(after.isPrimeBase ?? after.is_prime_base) as number | undefined)
                : undefined,
              ...auditUpdate(userId),
            })
            .where(eq(crewBase.id, rowId))
        } else if (action === 'expire') {
          if (!rowId) throw new Error(`crew_base expire requires rowId`)
          await tx
            .update(crewBase)
            .set({
              expDt: toDate(after.expDt ?? after.exp_dt) ?? now,
              ...auditUpdate(userId),
            })
            .where(eq(crewBase.id, rowId))
        } else if (action === 'delete') {
          if (!rowId) throw new Error(`crew_base delete requires rowId`)
          await tx.delete(crewBase).where(eq(crewBase.id, rowId))
        }
        break
      }

      // ── crew_rank ────────────────────────────────────────────────────────────

      case 'crew_rank': {
        if (action === 'create') {
          const crewId = String(after.crewId ?? after.crew_id ?? '')
          if (!crewId) throw new Error('crew_rank create requires crewId')
          const effDt = toDate(after.effDt ?? after.eff_dt)
          if (!effDt) throw new Error('crew_rank create requires effDt')
          await tx.insert(crewRank).values({
            crewId,
            rank: String(after.rank ?? ''),
            effDt,
            expDt: toDate(after.expDt ?? after.exp_dt),
            position: after.position != null ? String(after.position) : '1',
            preCumulatedExpDays: after.preCumulatedExpDays != null
              ? String(after.preCumulatedExpDays)
              : '0',
            fleetGrp: after.fleetGrp != null ? String(after.fleetGrp) : null,
            acType: after.acType != null ? String(after.acType) : null,
            division: after.division != null ? String(after.division) : null,
            ...auditCreate(userId),
          })
        } else if (action === 'update') {
          if (!rowId) throw new Error(`crew_rank update requires rowId`)
          await tx
            .update(crewRank)
            .set({
              rank: after.rank != null ? String(after.rank) : undefined,
              effDt: after.effDt != null || after.eff_dt != null
                ? (toDate(after.effDt ?? after.eff_dt) ?? undefined)
                : undefined,
              expDt: after.expDt !== undefined || after.exp_dt !== undefined
                ? toDate(after.expDt ?? after.exp_dt)
                : undefined,
              position: after.position != null ? String(after.position) : undefined,
              fleetGrp: after.fleetGrp !== undefined
                ? (after.fleetGrp != null ? String(after.fleetGrp) : null)
                : undefined,
              acType: after.acType !== undefined
                ? (after.acType != null ? String(after.acType) : null)
                : undefined,
              ...auditUpdate(userId),
            })
            .where(eq(crewRank.id, rowId))
        } else if (action === 'expire') {
          if (!rowId) throw new Error(`crew_rank expire requires rowId`)
          await tx
            .update(crewRank)
            .set({
              expDt: toDate(after.expDt ?? after.exp_dt) ?? now,
              ...auditUpdate(userId),
            })
            .where(eq(crewRank.id, rowId))
        } else if (action === 'delete') {
          if (!rowId) throw new Error(`crew_rank delete requires rowId`)
          await tx.delete(crewRank).where(eq(crewRank.id, rowId))
        }
        break
      }

      // ── crew_fleet ───────────────────────────────────────────────────────────

      case 'crew_fleet': {
        if (action === 'create') {
          const crewId = String(after.crewId ?? after.crew_id ?? '')
          if (!crewId) throw new Error('crew_fleet create requires crewId')
          const effDt = toDate(after.effDt ?? after.eff_dt)
          if (!effDt) throw new Error('crew_fleet create requires effDt')
          await tx.insert(crewFleet).values({
            crewId,
            fleetSpecific: String(after.fleetSpecific ?? after.fleet_specific ?? ''),
            effDt,
            expDt: toDate(after.expDt ?? after.exp_dt),
            acType: after.acType != null ? String(after.acType) : null,
            fleetGrp: after.fleetGrp != null ? String(after.fleetGrp) : null,
            ...auditCreate(userId),
          })
        } else if (action === 'update') {
          if (!rowId) throw new Error(`crew_fleet update requires rowId`)
          await tx
            .update(crewFleet)
            .set({
              fleetSpecific: after.fleetSpecific != null || after.fleet_specific != null
                ? String(after.fleetSpecific ?? after.fleet_specific)
                : undefined,
              effDt: after.effDt != null || after.eff_dt != null
                ? (toDate(after.effDt ?? after.eff_dt) ?? undefined)
                : undefined,
              expDt: after.expDt !== undefined || after.exp_dt !== undefined
                ? toDate(after.expDt ?? after.exp_dt)
                : undefined,
              acType: after.acType !== undefined
                ? (after.acType != null ? String(after.acType) : null)
                : undefined,
              fleetGrp: after.fleetGrp !== undefined
                ? (after.fleetGrp != null ? String(after.fleetGrp) : null)
                : undefined,
              ...auditUpdate(userId),
            })
            .where(eq(crewFleet.id, rowId))
        } else if (action === 'expire') {
          if (!rowId) throw new Error(`crew_fleet expire requires rowId`)
          await tx
            .update(crewFleet)
            .set({
              expDt: toDate(after.expDt ?? after.exp_dt) ?? now,
              ...auditUpdate(userId),
            })
            .where(eq(crewFleet.id, rowId))
        } else if (action === 'delete') {
          if (!rowId) throw new Error(`crew_fleet delete requires rowId`)
          await tx.delete(crewFleet).where(eq(crewFleet.id, rowId))
        }
        break
      }

      // ── crew_qualification ───────────────────────────────────────────────────

      case 'crew_qualification': {
        if (action === 'create') {
          const crewId = String(after.crewId ?? after.crew_id ?? '')
          if (!crewId) throw new Error('crew_qualification create requires crewId')
          const effDt = toDate(after.effDt ?? after.eff_dt)
          if (!effDt) throw new Error('crew_qualification create requires effDt')
          await tx.insert(crewQualification).values({
            crewId,
            qualification: String(after.qualification ?? ''),
            effDt,
            expDt: toDate(after.expDt ?? after.exp_dt),
            renewedDt: toDate(after.renewedDt ?? after.renewed_dt),
            fleetSpecific: after.fleetSpecific != null ? String(after.fleetSpecific) : null,
            acType: after.acType != null ? String(after.acType) : null,
            rank: after.rank != null ? String(after.rank) : null,
            position: after.position != null ? String(after.position) : null,
            isValid: (toNum(after.isValid ?? after.is_valid) ?? 0) as number,
            remarks: after.remarks != null ? String(after.remarks) : null,
            ...auditCreate(userId),
          })
        } else if (action === 'update') {
          if (!rowId) throw new Error(`crew_qualification update requires rowId`)
          await tx
            .update(crewQualification)
            .set({
              qualification: after.qualification != null ? String(after.qualification) : undefined,
              effDt: after.effDt != null || after.eff_dt != null
                ? (toDate(after.effDt ?? after.eff_dt) ?? undefined)
                : undefined,
              expDt: after.expDt !== undefined || after.exp_dt !== undefined
                ? toDate(after.expDt ?? after.exp_dt)
                : undefined,
              renewedDt: after.renewedDt !== undefined || after.renewed_dt !== undefined
                ? toDate(after.renewedDt ?? after.renewed_dt)
                : undefined,
              isValid: after.isValid != null || after.is_valid != null
                ? (toNum(after.isValid ?? after.is_valid) as number | undefined)
                : undefined,
              remarks: after.remarks !== undefined
                ? (after.remarks != null ? String(after.remarks) : null)
                : undefined,
              ...auditUpdate(userId),
            })
            .where(eq(crewQualification.id, rowId))
        } else if (action === 'expire') {
          if (!rowId) throw new Error(`crew_qualification expire requires rowId`)
          await tx
            .update(crewQualification)
            .set({
              expDt: toDate(after.expDt ?? after.exp_dt) ?? now,
              ...auditUpdate(userId),
            })
            .where(eq(crewQualification.id, rowId))
        } else if (action === 'delete') {
          if (!rowId) throw new Error(`crew_qualification delete requires rowId`)
          await tx.delete(crewQualification).where(eq(crewQualification.id, rowId))
        }
        break
      }

      // ── crew_team ────────────────────────────────────────────────────────────

      case 'crew_team': {
        if (action === 'create') {
          const crewId = String(after.crewId ?? after.crew_id ?? '')
          if (!crewId) throw new Error('crew_team create requires crewId')
          const effDt = toDate(after.effDt ?? after.eff_dt)
          if (!effDt) throw new Error('crew_team create requires effDt')
          const team = String(after.team ?? '').trim()
          if (!team) throw new Error('crew_team create requires team')
          await tx.insert(crewTeam).values({
            crewId,
            team,
            effDt,
            expDt: toDate(after.expDt ?? after.exp_dt),
            isValid: (toNum(after.isValid ?? after.is_valid) ?? 1) as number,
            remarks: after.remarks != null ? String(after.remarks) : null,
            source: after.source != null ? String(after.source) : null,
            ...auditCreate(userId),
          })
        } else if (action === 'update') {
          if (!rowId) throw new Error(`crew_team update requires rowId`)
          await tx
            .update(crewTeam)
            .set({
              team: after.team != null
                ? String(after.team).trim()
                : undefined,
              effDt: after.effDt != null || after.eff_dt != null
                ? (toDate(after.effDt ?? after.eff_dt) ?? undefined)
                : undefined,
              expDt: after.expDt !== undefined || after.exp_dt !== undefined
                ? toDate(after.expDt ?? after.exp_dt)
                : undefined,
              isValid: after.isValid != null || after.is_valid != null
                ? (toNum(after.isValid ?? after.is_valid) as number | undefined)
                : undefined,
              remarks: after.remarks !== undefined
                ? (after.remarks != null ? String(after.remarks) : null)
                : undefined,
              ...auditUpdate(userId),
            })
            .where(eq(crewTeam.id, rowId))
        } else if (action === 'expire') {
          if (!rowId) throw new Error(`crew_team expire requires rowId`)
          await tx
            .update(crewTeam)
            .set({
              expDt: toDate(after.expDt ?? after.exp_dt) ?? now,
              ...auditUpdate(userId),
            })
            .where(eq(crewTeam.id, rowId))
        } else if (action === 'delete') {
          if (!rowId) throw new Error(`crew_team delete requires rowId`)
          await tx.delete(crewTeam).where(eq(crewTeam.id, rowId))
        }
        break
      }

      // ── assignment (task-type definition) ─────────────────────────────────────

      case 'assignment': {
        // numeric(p,s) columns must be persisted as strings (Drizzle node-postgres)
        const numStr = (v: unknown): string | null => {
          const n = toNum(v)
          return n === null ? null : String(n)
        }
        const str = (v: unknown): string | null =>
          v === null || v === undefined || v === '' ? null : String(v)

        if (action === 'create') {
          await tx.insert(assignment).values({
            assignment: String(after.assignment ?? ''),
            description: String(after.description ?? ''),
            type: String(after.type ?? ''),
            isRest: (toNum(after.isRest ?? after.is_rest) ?? 0) as number,
            colorHex: String(after.colorHex ?? after.color_hex ?? ''),
            label: str(after.label),
            standalone: str(after.standalone),
            btPct: numStr(after.btPct ?? after.bt_pct),
            fdpPct: numStr(after.fdpPct ?? after.fdp_pct),
            dpPct: numStr(after.dpPct ?? after.dp_pct),
            isAdhoc: (toNum(after.isAdhoc ?? after.is_adhoc) ?? 0) as number,
            defaultLocation: str(after.defaultLocation ?? after.default_location),
            isRecency: (toNum(after.isRecency ?? after.is_recency) ?? 0) as number,
            fixedStrTm: str(after.fixedStrTm ?? after.fixed_str_tm),
            fixedEndTm: str(after.fixedEndTm ?? after.fixed_end_tm),
            fixedDurationMin: toNum(after.fixedDurationMin ?? after.fixed_duration_min),
            fixedCreditMin: toNum(after.fixedCreditMin ?? after.fixed_credit_min),
            displayLabelWhenAvailable: String(after.displayLabelWhenAvailable ?? after.display_label_when_available ?? 'N'),
            defaultAssignmentGroup: str(after.defaultAssignmentGroup ?? after.default_assignment_group),
            ftPct: numStr(after.ftPct ?? after.ft_pct) ?? '0',
            isQualifier: (toNum(after.isQualifier ?? after.is_qualifier) ?? 0) as number,
            wpPct: numStr(after.wpPct ?? after.wp_pct) ?? '0',
            restTime: toNum(after.restTime ?? after.rest_time),
            divideCrewManday: String(after.divideCrewManday ?? after.divide_crew_manday ?? 'E'),
            recaLabel: String(after.recaLabel ?? after.reca_label ?? 'Y'),
            orientation: str(after.orientation),
            pairingLabelColorHex: str(after.pairingLabelColorHex ?? after.pairing_label_color_hex),
            segmentLabelColorHex: str(after.segmentLabelColorHex ?? after.segment_label_color_hex),
            tmCreditFlag: toNum(after.tmCreditFlag ?? after.tm_credit_flag),
            assignmentUnitType: str(after.assignmentUnitType ?? after.assignment_unit_type),
            dpGap: (toNum(after.dpGap ?? after.dp_gap) ?? 0) as number,
            beforePctDpGapMin: toNum(after.beforePctDpGapMin ?? after.before_pct_dp_gap_min),
            afterPctDpGapMin: toNum(after.afterPctDpGapMin ?? after.after_pct_dp_gap_min),
            ...auditCreate(userId),
          })
        } else if (action === 'update') {
          if (!rowId) throw new Error('assignment update requires rowId')
          // The edit dialog submits the full row, so every editable column is set.
          await tx
            .update(assignment)
            .set({
              assignment: after.assignment != null ? String(after.assignment) : undefined,
              description: after.description != null ? String(after.description) : undefined,
              type: after.type != null ? String(after.type) : undefined,
              isRest: after.isRest != null || after.is_rest != null ? (toNum(after.isRest ?? after.is_rest) as number | undefined) : undefined,
              colorHex: after.colorHex != null || after.color_hex != null ? String(after.colorHex ?? after.color_hex) : undefined,
              label: after.label !== undefined ? str(after.label) : undefined,
              standalone: after.standalone !== undefined ? str(after.standalone) : undefined,
              btPct: after.btPct !== undefined || after.bt_pct !== undefined ? numStr(after.btPct ?? after.bt_pct) : undefined,
              fdpPct: after.fdpPct !== undefined || after.fdp_pct !== undefined ? numStr(after.fdpPct ?? after.fdp_pct) : undefined,
              dpPct: after.dpPct !== undefined || after.dp_pct !== undefined ? numStr(after.dpPct ?? after.dp_pct) : undefined,
              isAdhoc: after.isAdhoc != null || after.is_adhoc != null ? (toNum(after.isAdhoc ?? after.is_adhoc) as number | undefined) : undefined,
              defaultLocation: after.defaultLocation !== undefined || after.default_location !== undefined ? str(after.defaultLocation ?? after.default_location) : undefined,
              isRecency: after.isRecency != null || after.is_recency != null ? (toNum(after.isRecency ?? after.is_recency) as number | undefined) : undefined,
              fixedStrTm: after.fixedStrTm !== undefined || after.fixed_str_tm !== undefined ? str(after.fixedStrTm ?? after.fixed_str_tm) : undefined,
              fixedEndTm: after.fixedEndTm !== undefined || after.fixed_end_tm !== undefined ? str(after.fixedEndTm ?? after.fixed_end_tm) : undefined,
              fixedDurationMin: after.fixedDurationMin !== undefined || after.fixed_duration_min !== undefined ? toNum(after.fixedDurationMin ?? after.fixed_duration_min) : undefined,
              fixedCreditMin: after.fixedCreditMin !== undefined || after.fixed_credit_min !== undefined ? toNum(after.fixedCreditMin ?? after.fixed_credit_min) : undefined,
              displayLabelWhenAvailable: after.displayLabelWhenAvailable != null || after.display_label_when_available != null ? String(after.displayLabelWhenAvailable ?? after.display_label_when_available) : undefined,
              defaultAssignmentGroup: after.defaultAssignmentGroup !== undefined || after.default_assignment_group !== undefined ? str(after.defaultAssignmentGroup ?? after.default_assignment_group) : undefined,
              ftPct: after.ftPct != null || after.ft_pct != null ? (numStr(after.ftPct ?? after.ft_pct) ?? undefined) : undefined,
              isQualifier: after.isQualifier != null || after.is_qualifier != null ? (toNum(after.isQualifier ?? after.is_qualifier) as number | undefined) : undefined,
              wpPct: after.wpPct != null || after.wp_pct != null ? (numStr(after.wpPct ?? after.wp_pct) ?? undefined) : undefined,
              restTime: after.restTime !== undefined || after.rest_time !== undefined ? toNum(after.restTime ?? after.rest_time) : undefined,
              divideCrewManday: after.divideCrewManday != null || after.divide_crew_manday != null ? String(after.divideCrewManday ?? after.divide_crew_manday) : undefined,
              recaLabel: after.recaLabel != null || after.reca_label != null ? String(after.recaLabel ?? after.reca_label) : undefined,
              orientation: after.orientation !== undefined ? str(after.orientation) : undefined,
              pairingLabelColorHex: after.pairingLabelColorHex !== undefined || after.pairing_label_color_hex !== undefined ? str(after.pairingLabelColorHex ?? after.pairing_label_color_hex) : undefined,
              segmentLabelColorHex: after.segmentLabelColorHex !== undefined || after.segment_label_color_hex !== undefined ? str(after.segmentLabelColorHex ?? after.segment_label_color_hex) : undefined,
              tmCreditFlag: after.tmCreditFlag !== undefined || after.tm_credit_flag !== undefined ? toNum(after.tmCreditFlag ?? after.tm_credit_flag) : undefined,
              assignmentUnitType: after.assignmentUnitType !== undefined || after.assignment_unit_type !== undefined ? str(after.assignmentUnitType ?? after.assignment_unit_type) : undefined,
              dpGap: after.dpGap != null || after.dp_gap != null ? (toNum(after.dpGap ?? after.dp_gap) as number | undefined) : undefined,
              beforePctDpGapMin: after.beforePctDpGapMin !== undefined || after.before_pct_dp_gap_min !== undefined ? toNum(after.beforePctDpGapMin ?? after.before_pct_dp_gap_min) : undefined,
              afterPctDpGapMin: after.afterPctDpGapMin !== undefined || after.after_pct_dp_gap_min !== undefined ? toNum(after.afterPctDpGapMin ?? after.after_pct_dp_gap_min) : undefined,
              ...auditUpdate(userId),
            })
            .where(eq(assignment.id, rowId))
        } else if (action === 'delete') {
          if (!rowId) throw new Error('assignment delete requires rowId')
          await tx.delete(assignment).where(eq(assignment.id, rowId))
        } else {
          throw new Error(`assignment does not support action '${action}'`)
        }
        break
      }

      // ── assignment_group ──────────────────────────────────────────────────────

      case 'assignment_group': {
        if (action === 'create') {
          await tx.insert(assignmentGroup).values({
            assignmentGroup: String(after.assignmentGroup ?? after.assignment_group ?? ''),
            name: String(after.name ?? ''),
            color: after.color != null && after.color !== '' ? String(after.color) : null,
            allowOverlap: (toNum(after.allowOverlap ?? after.allow_overlap) ?? 0) as number,
            optimizerIndicator: (toNum(after.optimizerIndicator ?? after.optimizer_indicator) ?? 0) as number,
            ...auditCreate(userId),
          })
        } else if (action === 'update') {
          if (!rowId) throw new Error('assignment_group update requires rowId')
          await tx
            .update(assignmentGroup)
            .set({
              assignmentGroup: after.assignmentGroup != null || after.assignment_group != null ? String(after.assignmentGroup ?? after.assignment_group) : undefined,
              name: after.name != null ? String(after.name) : undefined,
              color: after.color !== undefined ? (after.color != null && after.color !== '' ? String(after.color) : null) : undefined,
              allowOverlap: after.allowOverlap != null || after.allow_overlap != null ? (toNum(after.allowOverlap ?? after.allow_overlap) as number | undefined) : undefined,
              optimizerIndicator: after.optimizerIndicator != null || after.optimizer_indicator != null ? (toNum(after.optimizerIndicator ?? after.optimizer_indicator) as number | undefined) : undefined,
              ...auditUpdate(userId),
            })
            .where(eq(assignmentGroup.id, rowId))
        } else if (action === 'delete') {
          if (!rowId) throw new Error('assignment_group delete requires rowId')
          await tx.delete(assignmentGroup).where(eq(assignmentGroup.id, rowId))
        } else {
          throw new Error(`assignment_group does not support action '${action}'`)
        }
        break
      }

      // ── roster_period ─────────────────────────────────────────────────────────

      case 'roster_period': {
        if (action === 'create') {
          await tx.insert(rosterPeriodTable).values({
            year:                  String(after.year ?? ''),
            name:                  String(after.name ?? ''),
            rosterPeriod:          String(after.rosterPeriod ?? after.roster_period ?? ''),
            rpStart:               toDate(after.rpStart ?? after.rp_start) ?? new Date(),
            rpEnd:                 toDate(after.rpEnd ?? after.rp_end) ?? new Date(),
            rosterPublicationDate: toDate(after.rosterPublicationDate ?? after.roster_publication_date),
            paidDate:              toDate(after.paidDate ?? after.paid_date),
            lockStatus:            (toNum(after.lockStatus ?? after.lock_status) ?? 0) as number,
            ...auditCreate(userId),
          })
        } else if (action === 'update') {
          if (!rowId) throw new Error('roster_period update requires rowId')
          await tx
            .update(rosterPeriodTable)
            .set({
              rpStart:               after.rpStart !== undefined || after.rp_start !== undefined
                                       ? (toDate(after.rpStart ?? after.rp_start) ?? undefined)
                                       : undefined,
              rpEnd:                 after.rpEnd !== undefined || after.rp_end !== undefined
                                       ? (toDate(after.rpEnd ?? after.rp_end) ?? undefined)
                                       : undefined,
              rosterPublicationDate: after.rosterPublicationDate !== undefined || after.roster_publication_date !== undefined
                                       ? toDate(after.rosterPublicationDate ?? after.roster_publication_date)
                                       : undefined,
              paidDate:              after.paidDate !== undefined || after.paid_date !== undefined
                                       ? toDate(after.paidDate ?? after.paid_date)
                                       : undefined,
              lockStatus:            after.lockStatus !== undefined || after.lock_status !== undefined
                                       ? (toNum(after.lockStatus ?? after.lock_status) as number | undefined)
                                       : undefined,
              ...auditUpdate(userId),
            })
            .where(eq(rosterPeriodTable.id, rowId))
        } else if (action === 'delete') {
          if (!rowId) throw new Error('roster_period delete requires rowId')
          await tx.delete(rosterPeriodTable).where(eq(rosterPeriodTable.id, rowId))
        } else {
          throw new Error(`roster_period does not support action '${action}'`)
        }
        break
      }

      // ── roster_period_config ──────────────────────────────────────────────────

      case 'roster_period_config': {
        const has = (camelKey: string, snakeKey: string): boolean =>
          after[camelKey] !== undefined || after[snakeKey] !== undefined
        const value = (camelKey: string, snakeKey: string): unknown =>
          after[camelKey] ?? after[snakeKey]
        const toNullableString = (v: unknown): string | null =>
          v === null || v === undefined || v === '' ? null : String(v)

        if (action === 'create') {
          await tx.insert(rosterPeriodConfigTable).values({
            name:       toNullableString(after.name),
            nameType:   toNum(after.nameType ?? after.name_type),
            rpType:     toNum(after.rpType ?? after.rp_type),
            period:     toNum(after.period),
            periodType: toNum(after.periodType ?? after.period_type),
            startTime:  toDate(after.startTime ?? after.start_time),
            endTime:    toDate(after.endTime ?? after.end_time),
            ...auditCreate(userId),
          })
        } else if (action === 'update') {
          if (!rowId) throw new Error('roster_period_config update requires rowId')
          await tx
            .update(rosterPeriodConfigTable)
            .set({
              name:       has('name', 'name') ? toNullableString(after.name) : undefined,
              nameType:   has('nameType', 'name_type') ? toNum(value('nameType', 'name_type')) : undefined,
              rpType:     has('rpType', 'rp_type') ? toNum(value('rpType', 'rp_type')) : undefined,
              period:     has('period', 'period') ? toNum(after.period) : undefined,
              periodType: has('periodType', 'period_type') ? toNum(value('periodType', 'period_type')) : undefined,
              startTime:  has('startTime', 'start_time') ? toDate(value('startTime', 'start_time')) : undefined,
              endTime:    has('endTime', 'end_time') ? toDate(value('endTime', 'end_time')) : undefined,
              ...auditUpdate(userId),
            })
            .where(eq(rosterPeriodConfigTable.id, rowId))
        } else if (action === 'delete') {
          if (!rowId) throw new Error('roster_period_config delete requires rowId')
          await tx.delete(rosterPeriodConfigTable).where(eq(rosterPeriodConfigTable.id, rowId))
        } else {
          throw new Error(`roster_period_config does not support action '${action}'`)
        }
        break
      }

      // Rank is intentionally a single-table delete. The rank table has no
      // inbound FK; do not cascade or rewrite code-based business records.
      case 'rank': {
        if (action === 'create') {
          await tx.insert(rank).values({
            rank: String(after.rank ?? ''),
            division: String(after.division ?? ''),
            displayOrder: toNum(after.displayOrder ?? after.display_order) ?? 0,
            description: after.description == null ? null : String(after.description),
            isIncludeInFt: toNum(after.isIncludeInFt ?? after.is_include_in_ft) ?? 1,
            isActingRank: toNum(after.isActingRank ?? after.is_acting_rank) ?? 1,
            isCrewRank: toNum(after.isCrewRank ?? after.is_crew_rank) ?? 1,
            isMustCrewRank: toNum(after.isMustCrewRank ?? after.is_must_crew_rank) ?? 0,
            ...auditCreate(userId),
          })
        } else if (action === 'update') {
          if (!rowId) throw new Error('rank update requires rowId')
          await tx.update(rank).set({
            rank: after.rank == null ? undefined : String(after.rank),
            division: after.division == null ? undefined : String(after.division),
            displayOrder: after.displayOrder == null && after.display_order == null
              ? undefined
              : (toNum(after.displayOrder ?? after.display_order) ?? undefined),
            description: after.description === undefined ? undefined : (after.description == null ? null : String(after.description)),
            isIncludeInFt: after.isIncludeInFt == null && after.is_include_in_ft == null ? undefined : (toNum(after.isIncludeInFt ?? after.is_include_in_ft) ?? undefined),
            isActingRank: after.isActingRank == null && after.is_acting_rank == null ? undefined : (toNum(after.isActingRank ?? after.is_acting_rank) ?? undefined),
            isCrewRank: after.isCrewRank == null && after.is_crew_rank == null ? undefined : (toNum(after.isCrewRank ?? after.is_crew_rank) ?? undefined),
            isMustCrewRank: after.isMustCrewRank == null && after.is_must_crew_rank == null ? undefined : (toNum(after.isMustCrewRank ?? after.is_must_crew_rank) ?? undefined),
            ...auditUpdate(userId),
          }).where(eq(rank.id, rowId))
        } else if (action === 'delete') {
          if (!rowId) throw new Error('rank delete requires rowId')
          await tx.delete(rank).where(eq(rank.id, rowId))
        } else {
          throw new Error(`rank does not support action '${action}'`)
        }
        break
      }

      default:
        await this.applyGenericChange(tx, change, userId)
    }
  }

  private async applyGenericChange(tx: Tx, change: DataChange, userId: string): Promise<void> {
    const tableName = DATA_ENTITY_TABLES[change.entityId]
    if (!tableName) {
      throw new Error(
        `Unsupported entity '${change.entityId}' — save not implemented; transaction rolled back`,
      )
    }

    if (change.action === 'create') {
      await this.createGenericEntity(tx, tableName, change.after, userId)
      return
    }
    if (change.action === 'update') {
      if (!change.rowId) throw new Error(`${change.entityId} update requires rowId`)
      await this.updateGenericEntity(tx, tableName, change.rowId, change.after, userId)
      return
    }
    if (change.action === 'delete') {
      if (!change.rowId) throw new Error(`${change.entityId} delete requires rowId`)
      await this.deleteGenericEntity(tx, tableName, change.rowId)
      return
    }

    throw new Error(`${change.entityId} does not support action '${change.action}'`)
  }

  private async createGenericEntity(
    tx: Tx,
    tableName: string,
    after: Record<string, unknown>,
    userId: string,
  ): Promise<void> {
    const values = this.buildGenericValues(after, auditCreate(userId))
    const columns = Object.keys(values).map((key) => sql.identifier(assertSafeIdentifier(key)))
    const params = Object.values(values).map((value) => sql`${value}`)

    await tx.execute(sql`
      insert into ${sql.identifier(assertSafeIdentifier(tableName))}
      (${sql.join(columns, sql`, `)})
      values (${sql.join(params, sql`, `)})
    `)
  }

  private async updateGenericEntity(
    tx: Tx,
    tableName: string,
    rowId: number,
    after: Record<string, unknown>,
    userId: string,
  ): Promise<void> {
    const values = this.buildGenericValues(after, auditUpdate(userId))
    const assignments: SQL[] = Object.entries(values).map(([column, value]) =>
      sql`${sql.identifier(assertSafeIdentifier(column))} = ${value}`,
    )

    await tx.execute(sql`
      update ${sql.identifier(assertSafeIdentifier(tableName))}
      set ${sql.join(assignments, sql`, `)}
      where ${sql.identifier('id')} = ${rowId}
    `)
  }

  private async deleteGenericEntity(tx: Tx, tableName: string, rowId: number): Promise<void> {
    await tx.execute(sql`
      delete from ${sql.identifier(assertSafeIdentifier(tableName))}
      where ${sql.identifier('id')} = ${rowId}
    `)
  }

  private buildGenericValues(
    after: Record<string, unknown>,
    auditValues: Record<string, unknown>,
  ): Record<string, unknown> {
    const values: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(after)) {
      if (READONLY_GENERIC_FIELDS.has(key)) continue
      const column = assertSafeIdentifier(camelToSnake(key))
      values[column] = value === '' ? null : value
    }
    for (const [key, value] of Object.entries(auditValues)) {
      const column = assertSafeIdentifier(camelToSnake(key))
      values[column] = value
    }
    return values
  }

  private async invalidateCaches(fastify: FastifyInstance, changes: DataChange[]): Promise<void> {
    const entityFamilies = new Set(changes.map((c) => c.entityId))

    const cachePatterns: Record<string, string[]> = {
      rank: ['rank:*'],
      assignment: ['assignment:*'],
      assignment_group: ['assignment:*'],
      composition: ['composition:*'],
      composition_rank: ['composition:rank:*', 'composition:detail:*'],
      composition_load: ['composition:load:*', 'composition:detail:*'],
      crew_base: ['crew:base:*', 'crew:detail:*'],
      crew_rank: ['crew:rank:*', 'crew:detail:*'],
      crew_fleet: ['crew:fleet:*', 'crew:detail:*'],
      crew_qualification: ['crew:qual:*', 'crew:detail:*'],
      crew_team: ['crew:team:*', 'crew:detail:*'],
      roster_period: ['roster_period:*'],
      roster_period_config: ['roster_period:*', 'roster_period_config:*'],
    }

    for (const entity of entityFamilies) {
      const patterns = cachePatterns[entity] ?? []
      for (const pattern of patterns) {
        try {
          await invalidatePattern(fastify.redis, pattern)
        } catch {
          // Cache invalidation failure is non-fatal
        }
      }
    }
  }
}

export const dataSaveService = new DataSaveService()
