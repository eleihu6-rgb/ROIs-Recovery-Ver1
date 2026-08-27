import type { FlightImportRecord } from '../../../types/import-jobs.js'

interface F8FlightRaw {
  fltId: string
  fltNum?: string
  datOp: string
  depStn?: string
  arrStn?: string
  std?: string
  sta?: string
  atd?: string | null
  ata?: string | null
  etd?: string | null
  eta?: string | null
  toff?: string | null
  tdwn?: string | null
  stc?: string | null
  divCode?: string | null
  acGrp?: string
  acReg?: string | null
}

const toIso = (val: string | null | undefined): string | null => {
  if (!val) return null
  return new Date(val.replace(' ', 'T')).toISOString()
}

const diffMinutes = (start: string, end: string): number => {
  const diff = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(0, Math.round(diff / 60000))
}

export function transformF8Flights(
  raw: unknown[],
  airline: string,
): FlightImportRecord[] {
  const records: FlightImportRecord[] = []

  for (const item of raw) {
    const f = item as F8FlightRaw
    if (!f.fltId || !f.datOp) continue

    const schStrDtUtc = toIso(f.std)
    const schEndDtUtc = toIso(f.sta)
    if (!schStrDtUtc || !schEndDtUtc) continue

    const actStrDtUtc = toIso(f.atd) ?? schStrDtUtc
    const actEndDtUtc = toIso(f.ata) ?? schEndDtUtc

    records.push({
      interfaceFltId: String(f.fltId),
      fltNum: (f.fltNum ?? String(f.fltId)).replace(new RegExp(`^${airline}`, 'i'), ''),
      airline,
      fltDt: f.datOp.slice(0, 10),
      depArp: f.depStn ?? '',
      arvArp: f.arrStn ?? '',
      fleet: f.acGrp ?? '',
      tailNum: f.acReg ?? null,
      schStrDtUtc,
      schEndDtUtc,
      actStrDtUtc,
      actEndDtUtc,
      estStrDtUtc: toIso(f.etd),
      estEndDtUtc: toIso(f.eta),
      actTakeOffUtc: toIso(f.toff),
      actTouchDownUtc: toIso(f.tdwn),
      segType: f.stc ?? 'J',
      deviceCode: f.divCode ?? '',
      blkMin: diffMinutes(actStrDtUtc, actEndDtUtc),
      fltType: 'PAX',
      fltSts: null,
    })
  }

  return records
}
