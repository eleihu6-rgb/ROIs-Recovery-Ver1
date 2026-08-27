import { and, eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { pairing } from '../../models/pairing/pairing.js'
import { pairingComposition } from '../../models/pairing/pairing-composition.js'
import { pairingSegment } from '../../models/pairing/pairing-segment.js'
import { dictionary } from '../../models/base/dictionary.js'
import { airport } from '../../models/base/airport.js'
import { assignment } from '../../models/base/assignment.js'
import { invalidatePattern } from '../../utils/cache.js'
import { localWallTimeToUtc } from '../../utils/zoned-time'
import { pairingService } from '../../services/pairing/pairing-service.js'
import { resolveFiliale } from '../../utils/filiale.js'

export interface ResCell {
  date: string
  base: string
  /** Reserve call code (PRAM / PRMM / PRPM / CRAM / CRPM …) — first-class assignment. */
  assignment: string
  window?: { start: string; end: string }
  composition: { rank: string; plan: number }[]
}
export interface GenerateInput {
  division: 'P' | 'C'
  conflictPolicy: 'skip' | 'overwrite' | 'add'
  cells: ResCell[]
  dryRun?: boolean
}
export interface ResSummaryRow {
  base: string
  rank: string
  assignment: string
  days: number
  slots: number
}

const hhmm = (t: string) => { const [h, m] = t.split(':').map(Number); return { h, m } }
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const hasPositiveCompositionPlan = (cell: ResCell) =>
  cell.composition.some((comp) => comp.plan > 0)

export const buildPairingRow = (
  cell: ResCell, division: 'P' | 'C', code: string, zoneId: string, fleet: string, group: string, username: string,
) => {
  const [y, mo, d] = cell.date.split('-').map(Number)
  const w = cell.window!
  const s = hhmm(w.start), e = hhmm(w.end)
  const crosses = (e.h * 60 + e.m) <= (s.h * 60 + s.m)
  const start = localWallTimeToUtc(y, mo, d, s.h, s.m, zoneId)
  const endDay = crosses ? d + 1 : d
  const end = localWallTimeToUtc(y, mo, endDay, e.h, e.m, zoneId)
  const now = new Date()
  return {
    ver: 1,
    pairingDt: cell.date,
    pairingLabel: code, // reserve code only; base is a separate column, not in the label
    division, base: cell.base, fleet,
    assignmentGroup: group, assignment: code,
    schStrDtUtc: start, schEndDtUtc: end,
    actStrDtUtc: start, actEndDtUtc: end,
    durationDays: crosses ? 2 : 1,
    tafb: 0,
    source: 'MANUAL' as const,
    comments: code,
    isDeleted: 0,
    createdBy: username, updatedBy: username, createdAt: now, updatedAt: now,
  }
}

// ─── summarize ─────────────────────────────────────────────────────────────
// Pure function: groups cells by base+rank+assignment, counting days and slots.

export const summarize = (cells: ResCell[], _division: 'P' | 'C'): ResSummaryRow[] => {
  const m = new Map<string, ResSummaryRow>()
  for (const c of cells) {
    if (!hasPositiveCompositionPlan(c)) continue

    for (const comp of c.composition) {
      if (comp.plan <= 0) continue

      const k = `${c.base}|${comp.rank}|${c.assignment}`
      const row = m.get(k) ?? {
        base: c.base,
        rank: comp.rank,
        assignment: c.assignment,
        days: 0,
        slots: 0,
      }
      row.days += 1
      row.slots += comp.plan
      m.set(k, row)
    }
  }
  return [...m.values()]
}

// ─── loadResConfig ──────────────────────────────────────────────────────────
// Reads RES_CALL_TYPE + RES_DEFAULTS + assignment fixed windows for the division.

export interface CallDef { code: string; start: string; end: string; crosses: boolean }

const parseCallDef = (codeValue: string): CallDef => {
  const [code, start, end, cross] = codeValue.split('|')
  return { code, start, end, crosses: cross === '1' }
}

export const loadResConfig = async (fastify: FastifyInstance, division: 'P' | 'C') => {
  const [callRows, defRows] = await Promise.all([
    fastify.db
      .select({ code: dictionary.code, codeValue: dictionary.codeValue })
      .from(dictionary)
      .where(eq(dictionary.parentCode, 'RES_CALL_TYPE')),
    fastify.db
      .select({ code: dictionary.code, codeValue: dictionary.codeValue })
      .from(dictionary)
      .where(eq(dictionary.parentCode, 'RES_DEFAULTS')),
  ])

  const defs = Object.fromEntries(defRows.map((r) => [r.code, r.codeValue ?? '']))

  // Division filter: dictionary code prefix P_ / C_ (e.g. P_AM, P_MM, C_PM).
  const divisionCallRows = callRows.filter((r) => r.code?.startsWith(`${division}_`))
  const callByCode = new Map<string, CallDef>()
  for (const row of divisionCallRows) {
    if (!row.codeValue) continue
    const def = parseCallDef(row.codeValue)
    if (def.code) callByCode.set(def.code, def)
  }
  const allowedCodes = [...callByCode.keys()]

  if (allowedCodes.length === 0) {
    throw new Error(`No RES_CALL_TYPE entries for division ${division}`)
  }

  const assignmentRows = await fastify.db
    .select({
      code: assignment.assignment,
      fixedCreditMin: assignment.fixedCreditMin,
      fixedStrTm: assignment.fixedStrTm,
      fixedEndTm: assignment.fixedEndTm,
    })
    .from(assignment)
    .where(inArray(assignment.assignment, allowedCodes))

  const creditMap = new Map(assignmentRows.map((r) => [r.code, r.fixedCreditMin]))
  const fixedWindowMap = new Map<string, { start: string; end: string }>()
  for (const r of assignmentRows) {
    if (
      r.fixedStrTm && r.fixedEndTm
      && HHMM_RE.test(r.fixedStrTm) && HHMM_RE.test(r.fixedEndTm)
    ) {
      fixedWindowMap.set(r.code, { start: r.fixedStrTm, end: r.fixedEndTm })
    }
  }

  const defaultCreditMin = Number(defs.DEFAULT_CREDIT_MIN ?? '240')
  const creditFor = (code: string): number => {
    const v = creditMap.get(code)
    return v != null && v > 0 ? v : defaultCreditMin
  }

  /** True if code is allowed for this division via RES_CALL_TYPE. */
  const isAllowed = (code: string): boolean => callByCode.has(code)

  /**
   * Window resolution: assignment.fixed_* → RES_CALL_TYPE → hard fallback.
   * (Caller may still override with cell.window.)
   */
  const windowFor = (code: string): { start: string; end: string } => {
    const fromAssignment = fixedWindowMap.get(code)
    if (fromAssignment) return fromAssignment
    const fromDict = callByCode.get(code)
    if (fromDict) return { start: fromDict.start, end: fromDict.end }
    return { start: '10:00', end: '22:00' }
  }

  const zoneByBase = async (base: string): Promise<string> => {
    const [row] = await fastify.db
      .select({ zoneId: airport.zoneId })
      .from(airport)
      .where(eq(airport.airport, base))
      .limit(1)
    return row?.zoneId ?? 'UTC'
  }

  return {
    group: defs.ASSIGNMENT_GROUP ?? 'RES',
    fleet: defs.DEFAULT_FLEET ?? '737',
    allowedCodes,
    isAllowed,
    windowFor,
    creditFor,
    zoneByBase,
  }
}

// ─── insertComposition ──────────────────────────────────────────────────────
// Inserts pairing_composition rows for a single cell. Never writes the `open`
// generated column.
// Uses the drizzle transaction type (PgTransaction) which shares the same insert
// API as the outer db but is a narrower TS type — captured via the callback parameter type.
type DrizzleTx = Parameters<Parameters<FastifyInstance['db']['transaction']>[0]>[0]

const insertComposition = async (
  tx: DrizzleTx,
  pairingId: number,
  division: string,
  cell: ResCell,
  username: string,
): Promise<void> => {
  const now = new Date()
  const rows = cell.composition
    .filter((c) => c.plan > 0)
    .map((c) => ({
      pairingId,
      division,
      actingRank: c.rank,
      plan: c.plan,
      fill: 0,
      isDeleted: 0 as const,
      createdBy: username,
      updatedBy: username,
      createdAt: now,
      updatedAt: now,
    }))
  if (rows.length > 0) await tx.insert(pairingComposition).values(rows)
}

// ─── buildSegmentRow ────────────────────────────────────────────────────────
// Constructs a pairing_segment row from a resolved pairing row.
// All required notNull fields on the model are populated.

export const buildSegmentRow = (
  pairingId: number,
  p: ReturnType<typeof buildPairingRow>,
  code: string,
  username: string,
  creditMin: number,
  airline: string,
) => {
  const now = new Date()
  return {
    pairingId,
    dutySeq: 1 as const,
    segSeq: 1 as const,
    // Duty-level fields (required notNull)
    dutyStrArp: p.base,
    dutyEndArp: p.base,
    dutySchStrDtUtc: p.schStrDtUtc,
    dutySchEndDtUtc: p.schEndDtUtc,
    dutyActStrDtUtc: p.actStrDtUtc,
    dutyActEndDtUtc: p.actEndDtUtc,
    dutyAccState: 'D' as const,
    dutyAssignment: 'SBY',
    dutyBriefMin: 0,
    dutyDebriefMin: 0,
    // Segment-level fields (required notNull)
    fltId: null,
    fltDt: p.pairingDt,
    fltNum: code,
    airline,
    depArp: p.base,
    arvArp: p.base,
    fleetSeg: p.fleet,
    schStrDtUtc: p.schStrDtUtc,
    schEndDtUtc: p.schEndDtUtc,
    actStrDtUtc: p.actStrDtUtc,
    actEndDtUtc: p.actEndDtUtc,
    segAssignment: code,
    // Fixed reserve credit (flat, e.g. 4h/240min) regardless of real duration — from assignment.fixed_credit_min.
    dutyActCreditedMinutes: String(creditMin),
    isDeleted: 0 as const,
    createdBy: username,
    updatedBy: username,
    createdAt: now,
    updatedAt: now,
  }
}

// ─── generate ──────────────────────────────────────────────────────────────
// Main transaction: expands ResCell[] into pairing + pairing_segment +
// pairing_composition rows with configurable conflict handling.

export const generate = async (
  fastify: FastifyInstance,
  input: GenerateInput,
  username: string,
): Promise<{ created: number; skipped: number; summary: ResSummaryRow[] }> => {
  const activeCells = input.cells.filter(hasPositiveCompositionPlan)
  const ignoredZeroPlanCells = input.cells.length - activeCells.length
  const summary = summarize(activeCells, input.division)

  if (input.dryRun) return { created: 0, skipped: ignoredZeroPlanCells, summary }
  if (activeCells.length === 0) return { created: 0, skipped: ignoredZeroPlanCells, summary }

  const cfg = await loadResConfig(fastify, input.division)
  const airline = await resolveFiliale(fastify)

  // ── Pre-fetch zone IDs for all unique bases (one query per unique base, not per cell). ──
  const uniqueBases = [...new Set(activeCells.map((c) => c.base))]
  const zoneCache = new Map<string, string>()
  await Promise.all(uniqueBases.map(async (base) => {
    zoneCache.set(base, await cfg.zoneByBase(base))
  }))

  // Validate every cell assignment is in RES_CALL_TYPE for this division.
  for (const cell of activeCells) {
    if (!cfg.isAllowed(cell.assignment)) {
      throw new Error(
        `Assignment ${cell.assignment} is not allowed for division ${input.division} (RES_CALL_TYPE)`,
      )
    }
  }

  // ── Pre-compute (date, base, assignment) keys for batch conflict fetch. ──
  type CellKey = { date: string; base: string; code: string }
  const cellKeys: CellKey[] = activeCells.map((cell) => ({
    date: cell.date,
    base: cell.base,
    code: cell.assignment,
  }))

  const allDates = [...new Set(cellKeys.map((k) => k.date))]
  const allCodes = [...new Set(cellKeys.map((k) => k.code))]
  const conflictRows = await fastify.db
    .select({ id: pairing.id, pairingDt: pairing.pairingDt, base: pairing.base, assignment: pairing.assignment })
    .from(pairing)
    .where(and(
      inArray(pairing.pairingDt, allDates),
      inArray(pairing.base, uniqueBases),
      eq(pairing.division, input.division),
      inArray(pairing.assignment, allCodes),
      eq(pairing.isDeleted, 0),
    ))

  const conflictMap = new Map<string, number>()
  for (const row of conflictRows) {
    conflictMap.set(`${String(row.pairingDt)}|${row.base}|${row.assignment}`, row.id)
  }

  let created = 0
  let skipped = ignoredZeroPlanCells

  await fastify.db.transaction(async (tx) => {
    for (const cell of activeCells) {
      const code = cell.assignment
      // cell.window override → assignment.fixed_* / RES_CALL_TYPE via windowFor
      const resolvedWindow = cell.window ?? cfg.windowFor(code)
      const zoneId = zoneCache.get(cell.base) ?? 'UTC'
      const row = buildPairingRow({ ...cell, window: resolvedWindow }, input.division, code, zoneId, cfg.fleet, cfg.group, username)

      const existingId = conflictMap.get(`${cell.date}|${cell.base}|${code}`)

      if (existingId !== undefined) {
        if (input.conflictPolicy === 'skip') {
          skipped++
          continue
        }
        if (input.conflictPolicy === 'overwrite') {
          await tx
            .update(pairingComposition)
            .set({ isDeleted: 1, updatedBy: username, updatedAt: new Date() })
            .where(eq(pairingComposition.pairingId, existingId))
          await insertComposition(tx, existingId, input.division, cell, username)
          created++
          continue
        }
        // 'add': fall through and insert a new duplicate pairing
      }

      const [ins] = await tx.insert(pairing).values(row).returning({ id: pairing.id })
      await tx.insert(pairingSegment).values(buildSegmentRow(ins.id, row, code, username, cfg.creditFor(code), airline))
      await insertComposition(tx, ins.id, input.division, cell, username)
      created++
    }
  })

  await invalidatePattern(fastify.redis, 'pairing:list:*')
  return { created, skipped, summary }
}

// ─── recomputeWindowTimes ───────────────────────────────────────────────────
// Pure helper: converts a wall-time window (HH:MM start / HH:MM end) on a
// given civil date into UTC Date values for sch_str_dt_utc / sch_end_dt_utc,
// and derives durationDays (1 unless end ≤ start, indicating PM midnight crossing).

export const recomputeWindowTimes = (
  date: string,
  window: { start: string; end: string },
  zoneId: string,
): { schStrDtUtc: Date; schEndDtUtc: Date; durationDays: number } => {
  const [y, mo, d] = date.split('-').map(Number)
  const [sh, sm] = window.start.split(':').map(Number)
  const [eh, em] = window.end.split(':').map(Number)
  const crosses = (eh * 60 + em) <= (sh * 60 + sm)
  return {
    schStrDtUtc: localWallTimeToUtc(y, mo, d, sh, sm, zoneId),
    schEndDtUtc: localWallTimeToUtc(y, mo, crosses ? d + 1 : d, eh, em, zoneId),
    durationDays: crosses ? 2 : 1,
  }
}

// ─── batchUpdate ────────────────────────────────────────────────────────────
// Updates plan slots per rank and/or recomputes pairing + segment UTC times
// for a list of pairing IDs. Runs in a single transaction.

export interface BatchUpdateInput {
  ids: number[]
  plan?: { rank: string; value: number }[]
  window?: { start: string; end: string }
}

export const batchUpdate = async (
  fastify: FastifyInstance,
  body: BatchUpdateInput,
  username: string,
): Promise<{ updated: number }> => {
  // Load config once for the zone lookup (division is irrelevant for zoneByBase)
  const cfg = body.window ? await loadResConfig(fastify, 'P') : null

  let updated = 0
  await fastify.db.transaction(async (tx: DrizzleTx) => {
    for (const id of body.ids) {
      if (body.plan) {
        for (const p of body.plan) {
          await tx
            .update(pairingComposition)
            .set({ plan: p.value, updatedBy: username, updatedAt: new Date() })
            .where(
              and(
                eq(pairingComposition.pairingId, id),
                eq(pairingComposition.actingRank, p.rank),
                eq(pairingComposition.isDeleted, 0),
              ),
            )
        }
      }

      if (body.window && cfg) {
        const [pr] = await tx
          .select({ base: pairing.base, dt: pairing.pairingDt })
          .from(pairing)
          .where(eq(pairing.id, id))
        if (!pr) continue
        const zoneId = await cfg.zoneByBase(pr.base)
        const t = recomputeWindowTimes(String(pr.dt), body.window, zoneId)
        await tx
          .update(pairing)
          .set({ schStrDtUtc: t.schStrDtUtc, schEndDtUtc: t.schEndDtUtc, durationDays: t.durationDays, updatedBy: username, updatedAt: new Date() })
          .where(eq(pairing.id, id))
        await tx
          .update(pairingSegment)
          .set({
            schStrDtUtc: t.schStrDtUtc,
            schEndDtUtc: t.schEndDtUtc,
            dutySchStrDtUtc: t.schStrDtUtc,
            dutySchEndDtUtc: t.schEndDtUtc,
            updatedBy: username,
            updatedAt: new Date(),
          })
          .where(eq(pairingSegment.pairingId, id))
      }

      updated++
    }
  })

  await invalidatePattern(fastify.redis, 'pairing:list:*')
  return { updated }
}

// ─── batchDelete ────────────────────────────────────────────────────────────
// Deletes a list of RES pairing IDs by delegating to pairingService.remove.
// Collects IDs that are blocked (409 — crew already assigned) rather than
// failing fast, so the caller can surface partial results to the client.

export interface BatchDeleteResult {
  deleted: number
  blocked: { id: number; reason: string }[]
}

export const batchDelete = async (
  fastify: FastifyInstance,
  ids: number[],
): Promise<BatchDeleteResult> => {
  // Run all deletes concurrently — each `pairingService.remove` opens its own
  // transaction (no shared lock contention for disjoint pairing IDs). Collecting
  // all results with allSettled keeps partial-success semantics: blocked IDs (409)
  // are surfaced without aborting the remaining deletes.
  const results = await Promise.allSettled(
    ids.map((id) => pairingService.remove(fastify, id).then(() => id)),
  )
  let deleted = 0
  const blocked: { id: number; reason: string }[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled') {
      deleted++
    } else {
      blocked.push({ id: ids[i], reason: (r.reason as Error)?.message ?? 'blocked' })
    }
  }
  return { deleted, blocked }
}
