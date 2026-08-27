/**
 * Reusable helpers for the Pairing Info dialog (pairing-info-dialog.tsx).
 *
 * Centralises:
 *  - opening the dialog by scanning a pairing-pane canvas (pucks have no stable
 *    DOM, so we double-click across a row until the AppDialog appears),
 *  - column indices for the segment table (SEG_COLS order),
 *  - parsing the "M/D HH:mm" time cells and the "CODE(±H:MM)" DEP/ARR cells,
 *  - cross-validating a timezone mode against the UTC ground truth using the
 *    very offset the dialog prints in the DEP cell.
 *
 * The cross-check is genuine: the printed offset comes from the tz option's
 * `utcOffset` string, while the rendered time comes from converting the UTC
 * instant through the tz option's IANA `zoneId` via Intl. Agreement between the
 * two proves the IANA conversion matches the declared offset for that airport.
 */
import { expect, type Locator } from '@playwright/test'

const ROW_H = 42, HEADER_H = 30

/** 0-based column indices in SEG_COLS order. */
export const SEG = {
  QUAL: 0, ALN: 1, FLIGHT: 2, FLEET: 3, ACC: 4, REF: 5, DEP: 6, PCK: 7, RPT: 8,
  STD: 9, ATD: 10, ARR: 11, STA: 12, ATA: 13, DRP: 14, GT: 15, BH: 16, FT: 17,
  MRT: 18, DUTY: 19,
} as const

/**
 * Scan a canvas row left→right, double-clicking until `dialog` opens.
 * A row past the rendered pucks can land on an overlay that intercepts the
 * pointer; treat that as "no puck here" (return false) rather than throwing.
 */
export const openByScan = async (canvas: Locator, dialog: Locator, row: number): Promise<boolean> => {
  const y = HEADER_H + row * ROW_H + Math.floor(ROW_H / 2)
  for (let x = 8; x <= 360; x += 6) {
    try {
      await canvas.dblclick({ position: { x, y }, timeout: 3_000 })
    } catch {
      return false
    }
    if (await dialog.count() > 0) return true
  }
  return false
}

/** Read every segment row's cells (trimmed text), indexed by column, expanding row-spanned duty cells. */
export const readSegmentCells = async (dialog: Locator): Promise<string[][]> => {
  return dialog.getByTestId('pairing-info-segments').locator('tbody').evaluate((tbody) => {
    const activeSpans: Array<{ remaining: number; text: string }> = []

    return [...tbody.querySelectorAll('tr')].map((tr) => {
      const expanded: string[] = []
      let spanIdx = 0

      for (const td of [...tr.querySelectorAll('td')]) {
        while (activeSpans[spanIdx]?.remaining > 0) {
          expanded.push(activeSpans[spanIdx].text)
          activeSpans[spanIdx].remaining -= 1
          spanIdx += 1
        }

        const text = (td.textContent ?? '').trim()
        expanded.push(text)

        const rowSpan = Number(td.getAttribute('rowspan') ?? '1')
        if (rowSpan > 1) activeSpans[expanded.length - 1] = { remaining: rowSpan - 1, text }
        spanIdx += 1
      }

      while (activeSpans[spanIdx]?.remaining > 0) {
        expanded.push(activeSpans[spanIdx].text)
        activeSpans[spanIdx].remaining -= 1
        spanIdx += 1
      }

      return expanded
    })
  })
}

export interface MD { mo: number; d: number; h: number; m: number }

/** Parse a "M/D HH:mm" cell. Returns null for blank/unparseable. */
export const parseMD = (cell: string): MD | null => {
  const mt = cell.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/)
  if (!mt) return null
  return { mo: +mt[1], d: +mt[2], h: +mt[3], m: +mt[4] }
}

/** Parse the signed offset (minutes) from a DEP/ARR cell like "YEG(-6:00)". null if absent. */
export const parseOffsetMin = (depCell: string): number | null => {
  const mt = depCell.match(/\(([+-])(\d{1,2}):(\d{2})\)/)
  if (!mt) return null
  const sign = mt[1] === '-' ? -1 : 1
  return sign * (+mt[2] * 60 + +mt[3])
}

/** Airport code from a DEP/ARR cell like "YEG(-6:00)" → "YEG" (or "" if blank). */
export const parseAirport = (depCell: string): string => depCell.replace(/\(.*$/, '').trim()

/** Apply an offset (minutes) to a UTC M/D HH:mm instant; format back to M/D HH:mm. */
export const applyOffset = (utc: MD, offsetMin: number): string => {
  // Year is irrelevant for the displayed M/D HH:mm; use a fixed one so Date math
  // handles month/day rollover when the offset crosses midnight.
  const t = Date.UTC(2026, utc.mo - 1, utc.d, utc.h, utc.m) + offsetMin * 60_000
  const dt = new Date(t)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()} ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`
}

export interface TzValidation {
  rowsChecked: number
  cellsChecked: number
  airports: Set<string>
}

/** A time column to validate, paired with the offset (minutes) the mode applies to it. */
export interface CellCheck {
  col: number
  /** Offset minutes for this column on row `r`, or null to skip (no derivable offset). */
  offset: (rowIdx: number) => number | null
}

/**
 * Cross-validate a timezone mode against the UTC ground truth, per cell. For each
 * (column, offset) check and each row, asserts the mode's rendered value equals
 * UTC shifted by that column's offset. This lets departure cells validate against
 * the departure airport and arrival cells against the arrival airport.
 *
 * @param utcCells  segment cells captured in UTC mode (ground-truth instants)
 * @param modeCells segment cells captured in the mode under test
 * @param checks    columns to validate and how to derive each column's offset
 */
export const validateTzCells = (
  utcCells: string[][],
  modeCells: string[][],
  checks: CellCheck[],
  label: string,
): TzValidation => {
  expect(utcCells.length, `${label}: same row count in both modes`).toBe(modeCells.length)
  const airports = new Set<string>()
  let cellsChecked = 0
  let rowsChecked = 0
  for (let r = 0; r < utcCells.length; r++) {
    const dep = parseAirport(utcCells[r][SEG.DEP]); if (dep) airports.add(dep)
    const arr = parseAirport(utcCells[r][SEG.ARR]); if (arr) airports.add(arr)
    let rowHadCell = false
    for (const { col, offset } of checks) {
      const off = offset(r)
      if (off == null) continue
      const utc = parseMD(utcCells[r][col])
      const got = modeCells[r][col].trim()
      if (!utc) { expect(got, `${label}: row ${r} col ${col} blank in both modes`).toBe('') ; continue }
      const expected = applyOffset(utc, off)
      expect(got, `${label}: row ${r} col ${col} — UTC ${utcCells[r][col]} +(${off}m)`).toBe(expected)
      cellsChecked++
      rowHadCell = true
    }
    if (rowHadCell) rowsChecked++
  }
  return { rowsChecked, cellsChecked, airports }
}
