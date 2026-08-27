export interface S3PrgPairingRecord {
  recordType: '1'
  rawLineNo: number
  rawLine: string
  pairingNumber: string
  pairingDate: string
  effectiveFromDate: string
  effectiveToDate: string
  frequency: string
  pairingNoOpDatesRaw: string
  reportDate: string
  reportMinutes: number
  pairingEndDate: string
  pairingEndMinutes: number
  firstFlightNumber: string
  firstDepartureMinutes: number
  dutyCount: number
  tafbMinutes: number
  standupOvernightIndicator: string
  positionsRaw: string
  restRequiredAfterPairingMinutes: number
  totalBlockMinutes: number
  deadheadCreditMinutes: number
  languagePositionsRaw: string
}

export interface S3PrgOnlineSegmentRecord {
  recordType: '2'
  rawLineNo: number
  rawLine: string
  pairingNumber: string
  pairingDate: string
  flightNumber: string
  flightSegmentDate: string
  departureAirport: string
  departureDate: string
  departureMinutes: number
  arrivalAirport: string
  arrivalDate: string
  arrivalMinutes: number
  pairingSequenceNumber: number
  deadheadIndicator: string
  legBreakIndicator: string
  farDomesticInternationalIndicator: string
  blockMinutes: number
  blockCrossoverMinutes: number
  legCreditMinutes: number
  legDeadheadPayMinutes: number
  farType: string
  pilotCrewComplement: number | null
  departureUtcOffsetMinutes: number | null
  arrivalUtcOffsetMinutes: number | null
  equipmentType: string
  contractDomesticInternationalIndicator: string
}

export interface S3PrgDutyRecord {
  recordType: '3'
  rawLineNo: number
  rawLine: string
  pairingNumber: string
  pairingDate: string
  pairingSequenceNumber: number
  dutyPeriodNumber: number
  dutyStartDate: string
  dutyStartMinutes: number
  dutyEndDate: string
  dutyEndMinutes: number
  farDomesticInternationalIndicator: string
  scheduledDutyMinutes: number
  scheduledLayoverMinutes: number | null
  layoverCity: string
  hotelName: string
  hotelPhoneNumber: string
  restFarType: string
  restFarTypeNumber: string
  restFarMustBeginMinutes: number | null
  restFarRequiredMinutes: number | null
  dutyPeriodGuaranteeMinutes: number | null
  totalBlockMinutes: number
  totalDeadheadCreditMinutes: number
  totalDeadheadPayMinutes: number
  totalDutyCreditMinutes: number
  totalDutyPayMinutes: number
  dutyPeriodTypeDayNight: string
  fatigueUnitsRaw: string
}

export interface S3PrgOfflineSegmentRecord {
  recordType: '4'
  rawLineNo: number
  rawLine: string
  pairingNumber: string
  pairingDate: string
  pairingSequenceNumber: number
  carrier: string
  transportCode: string
  flightSegmentDate: string
  departureAirport: string
  departureDate: string
  departureMinutes: number
  arrivalAirport: string
  arrivalDate: string
  arrivalMinutes: number
  tailAssignment: string
  assignment: string
}

export interface S3PairingPrgRecordsParseResult {
  pairings: S3PrgPairingRecord[]
  onlineSegments: S3PrgOnlineSegmentRecord[]
  duties: S3PrgDutyRecord[]
  offlineSegments: S3PrgOfflineSegmentRecord[]
  warnings: string[]
}
export interface S3PairingCompositionInput {
  rank: string
  plan: number
}

export interface S3PairingSegmentInput {
  dutySeq: number
  segSeq: number
  fltNum: string
  fltDt: string
  airline: string
  depArp: string
  arvArp: string
  fleet: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string
  actEndDtUtc: string
  segAssignment: string
}

export interface S3DutyBreakInput {
  dutySeq: number
  dutyStrArp: string
  dutyEndArp: string
  dutySchStrDtUtc: string
  dutySchEndDtUtc: string
  dutyActStrDtUtc: string
  dutyActEndDtUtc: string
  dutySchFdpMin: number
  dutyActCreditedMinutes: number
  dutySchRestMin: number | null
  dutyActRestMin: number | null
  dutyLayoverNits: number | null
}

export type S3PairingDivision = 'P' | 'C'

export interface S3PairingFileProfile {
  division: S3PairingDivision
  ranks: string[]
}

export interface S3PairingInput {
  logicalKey: string
  pairingLabel: string
  pairingDate: string
  interfaceId: string
  filiale: string
  division: string
  base: string
  fleet: string
  assignmentGroup: string
  assignment: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc: string
  actEndDtUtc: string
  durationDays: number
  tafb: number
  restAfterPairingMinutes: number
  dutyCount: number
  segCount: number
  comments: string | null
  compositions: S3PairingCompositionInput[]
  segments: S3PairingSegmentInput[]
  duties: Map<number, S3DutyBreakInput>
}

export interface S3PairingParseResult {
  pairings: S3PairingInput[]
  warnings: string[]
}

interface SegmentWithKey extends S3PairingSegmentInput {
  key: string
}

interface DutyWithKey extends S3DutyBreakInput {
  key: string
}

const slice1 = (line: string, start: number, end: number): string => line.slice(start - 1, end)
const trimSlice = (line: string, start: number, end: number): string => slice1(line, start, end).trim()

const toNumber = (value: string, field: string): number => {
  const n = Number(value.trim())
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric PRG field ${field}: ${value}`)
  return n
}

const optionalNumber = (value: string): number | null => {
  const trimmed = value.trim()
  return trimmed ? toNumber(trimmed, 'optional numeric field') : null
}

const parseSignedOffset = (value: string): number | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

const normalizeSequence = (value: number): number => value > 0 && value % 10 === 0 ? value / 10 : value

const PILOT_RANKS = new Set(['CA', 'FO'])
const CABIN_RANKS = ['IFD', 'FA', 'D'] as const

const parsePilotPlanPositions = (compact: string): S3PairingCompositionInput[] | null => {
  if (compact.length === 0 || compact.length % 4 !== 0) return null
  const out: S3PairingCompositionInput[] = []
  for (let i = 0; i + 4 <= compact.length; i += 4) {
    const rank = compact.slice(i, i + 2)
    const planText = compact.slice(i + 2, i + 4)
    if (!PILOT_RANKS.has(rank) || !/^\d{2}$/.test(planText)) return null
    const plan = Number(planText)
    if (plan > 0) out.push({ rank, plan })
  }
  return out
}

const parseCabinPlanPositions = (compact: string): S3PairingCompositionInput[] | null => {
  if (compact.length === 0) return null

  const parseFrom = (offset: number): S3PairingCompositionInput[] | null => {
    if (offset === compact.length) return []

    for (const rank of CABIN_RANKS) {
      if (!compact.startsWith(rank, offset)) continue
      const planStart = offset + rank.length
      for (const planLength of [2, 1]) {
        const planText = compact.slice(planStart, planStart + planLength)
        if (!/^\d+$/.test(planText)) continue
        const rest = parseFrom(planStart + planLength)
        if (!rest) continue
        const plan = Number(planText)
        return plan > 0 ? [{ rank, plan }, ...rest] : rest
      }
    }

    return null
  }

  const parsed = parseFrom(0)
  return parsed && parsed.length > 0 ? parsed : null
}

const parsePositionLayout = (raw: string): S3PairingFileProfile => {
  const compact = raw.replace(/\s/g, '').toUpperCase()
  const pilot = parsePilotPlanPositions(compact)
  if (pilot && pilot.length > 0) {
    return { division: 'P', ranks: pilot.map((slot) => slot.rank) }
  }

  const cabin = parseCabinPlanPositions(compact)
  if (cabin && cabin.length > 0) {
    return { division: 'C', ranks: cabin.map((slot) => slot.rank) }
  }

  throw new Error(`Unable to parse PRG crew positions: ${raw.trim() || '<empty>'}`)
}

export const parseCrewPlanPositions = (raw: string): S3PairingCompositionInput[] => {
  const compact = raw.replace(/\s/g, '').toUpperCase()
  const pilot = parsePilotPlanPositions(compact)
  if (pilot) return pilot
  const cabin = parseCabinPlanPositions(compact)
  if (cabin) return cabin
  throw new Error(`Unable to parse PRG crew positions: ${raw.trim() || '<empty>'}`)
}

export const getS3PairingFileProfile = (pairings: S3PairingInput[]): S3PairingFileProfile => {
  const divisions = new Set(pairings.map((pairing) => pairing.division))
  if (divisions.size !== 1) {
    throw new Error('PRG file contains both Pilot and Cabin ranks; import the file separately')
  }
  return {
    division: (pairings[0]?.division ?? 'P') as S3PairingDivision,
    ranks: [...new Set(pairings.flatMap((pairing) => pairing.compositions.map((slot) => slot.rank)))],
  }
}

const positionProfileForRaw = (raw: string): S3PairingFileProfile => parsePositionLayout(raw)

export const toUtcFromYmdMinutes = (ymd: string, minutesText: string): string => {
  if (!/^\d{8}$/.test(ymd)) throw new Error(`Invalid PRG date: ${ymd}`)
  const minutes = toNumber(minutesText, 'minutes')
  const year = Number(ymd.slice(0, 4))
  const month = Number(ymd.slice(4, 6)) - 1
  const day = Number(ymd.slice(6, 8))
  const d = new Date(Date.UTC(year, month, day, 0, minutes, 0, 0))
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid PRG date/minutes: ${ymd} ${minutesText}`)
  return d.toISOString()
}

const toDate = (ymd: string): string => {
  if (!/^\d{8}$/.test(ymd)) throw new Error(`Invalid PRG date: ${ymd}`)
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
}

const logicalKey = (pairingNumber: string, pairingYmd: string): string => `${pairingNumber}:${pairingYmd}`

const parseMaster = (line: string): S3PairingInput => {
  const pairingLabel = trimSlice(line, 2, 7)
  const pairingYmd = trimSlice(line, 8, 15)
  const startDate = trimSlice(line, 71, 78)
  const startMin = trimSlice(line, 79, 82)
  const endDate = trimSlice(line, 83, 90)
  const endMin = trimSlice(line, 91, 94)
  const dutyCount = toNumber(trimSlice(line, 104, 106), 'duty count')
  const positionRaw = slice1(line, 114, 145)
  const positionProfile = positionProfileForRaw(positionRaw)
  const compositions = parseCrewPlanPositions(positionRaw)
  const schStrDtUtc = toUtcFromYmdMinutes(startDate, startMin)
  const schEndDtUtc = toUtcFromYmdMinutes(endDate, endMin)

  return {
    logicalKey: logicalKey(pairingLabel, pairingYmd),
    pairingLabel,
    pairingDate: toDate(pairingYmd),
    interfaceId: `S3:${pairingLabel}:${pairingYmd}`,
    filiale: 'F8',
    division: positionProfile.division,
    base: '',
    fleet: '',
    assignmentGroup: 'FLY',
    assignment: 'FLY',
    schStrDtUtc,
    schEndDtUtc,
    actStrDtUtc: schStrDtUtc,
    actEndDtUtc: schEndDtUtc,
    durationDays: Math.max(1, Math.ceil((new Date(schEndDtUtc).getTime() - new Date(schStrDtUtc).getTime()) / 86_400_000)),
    tafb: Math.max(1, Math.ceil((new Date(schEndDtUtc).getTime() - new Date(schStrDtUtc).getTime()) / 86_400_000)),
    restAfterPairingMinutes: toNumber(trimSlice(line, 146, 149), 'rest required after pairing'),
    dutyCount,
    segCount: 0,
    comments: null,
    compositions,
    segments: [],
    duties: new Map<number, S3DutyBreakInput>(),
  }
}

const parseSegment = (line: string): SegmentWithKey => {
  const pairingLabel = trimSlice(line, 2, 7)
  const pairingYmd = trimSlice(line, 8, 15)
  const fltNum = trimSlice(line, 16, 20)
  const fltDate = trimSlice(line, 21, 28)
  const depArp = trimSlice(line, 29, 31)
  const depDate = trimSlice(line, 32, 39)
  const depMin = trimSlice(line, 40, 43)
  const arvArp = trimSlice(line, 44, 46)
  const arvDate = trimSlice(line, 47, 54)
  const arvMin = trimSlice(line, 55, 58)
  const rawSegSeq = toNumber(trimSlice(line, 59, 61), 'segment sequence')
  const segSeq = normalizeSequence(rawSegSeq)
  const fleet = trimSlice(line, 94, 96) || 'UNK'
  const schStrDtUtc = toUtcFromYmdMinutes(depDate, depMin)
  const schEndDtUtc = toUtcFromYmdMinutes(arvDate, arvMin)

  return {
    key: logicalKey(pairingLabel, pairingYmd),
    dutySeq: 1,
    segSeq,
    fltNum,
    fltDt: toDate(fltDate),
    airline: 'F8',
    depArp,
    arvArp,
    fleet,
    schStrDtUtc,
    schEndDtUtc,
    actStrDtUtc: schStrDtUtc,
    actEndDtUtc: schEndDtUtc,
    segAssignment: 'FLY',
  }
}

const parseOfflineSegment = (line: string): SegmentWithKey => {
  const pairingLabel = trimSlice(line, 2, 7)
  const pairingYmd = trimSlice(line, 8, 15)
  const rawSegSeq = toNumber(trimSlice(line, 16, 18), 'offline segment sequence')
  const segSeq = normalizeSequence(rawSegSeq)
  const carrier = trimSlice(line, 19, 22)
  const transportCode = trimSlice(line, 23, 26)
  const transportLabel = `${carrier}${transportCode}`.trim()
  const isGroundTransport = transportLabel === 'LIMO'
  const fltDate = trimSlice(line, 27, 34)
  const depArp = trimSlice(line, 35, 37)
  const depDate = trimSlice(line, 38, 45)
  const depMin = trimSlice(line, 46, 49)
  const arvArp = trimSlice(line, 50, 52)
  const arvDate = trimSlice(line, 53, 60)
  const arvMin = trimSlice(line, 61, 64)
  const tailAssignment = trimSlice(line, 84, 86)
  const assignment = tailAssignment || (isGroundTransport ? transportLabel : carrier || transportCode) || 'OFFLINE'
  const airline = !isGroundTransport && carrier.length <= 3 ? carrier : 'F8'
  const schStrDtUtc = toUtcFromYmdMinutes(depDate, depMin)
  const schEndDtUtc = toUtcFromYmdMinutes(arvDate, arvMin)

  return {
    key: logicalKey(pairingLabel, pairingYmd),
    dutySeq: 1,
    segSeq,
    fltNum: isGroundTransport ? transportLabel : transportCode || assignment,
    fltDt: toDate(fltDate),
    airline,
    depArp,
    arvArp,
    fleet: 'GRD',
    schStrDtUtc,
    schEndDtUtc,
    actStrDtUtc: schStrDtUtc,
    actEndDtUtc: schEndDtUtc,
    segAssignment: assignment,
  }
}

const parseDuty = (line: string): DutyWithKey => {
  const pairingLabel = trimSlice(line, 2, 7)
  const pairingYmd = trimSlice(line, 8, 15)
  const dutySeq = toNumber(trimSlice(line, 19, 22), 'duty sequence')
  const startDate = trimSlice(line, 23, 30)
  const startMin = trimSlice(line, 31, 34)
  const endDate = trimSlice(line, 35, 42)
  const endMin = trimSlice(line, 43, 46)
  const dutySchStrDtUtc = toUtcFromYmdMinutes(startDate, startMin)
  const dutySchEndDtUtc = toUtcFromYmdMinutes(endDate, endMin)

  return {
    key: logicalKey(pairingLabel, pairingYmd),
    dutySeq,
    dutyStrArp: '',
    dutyEndArp: '',
    dutySchStrDtUtc,
    dutySchEndDtUtc,
    dutyActStrDtUtc: dutySchStrDtUtc,
    dutyActEndDtUtc: dutySchEndDtUtc,
    dutySchFdpMin: toNumber(trimSlice(line, 48, 51), 'scheduled duty time'),
    dutyActCreditedMinutes: toNumber(trimSlice(line, 127, 130), 'duty credit'),
    dutySchRestMin: optionalNumber(slice1(line, 52, 56)),
    dutyActRestMin: null,
    dutyLayoverNits: null,
  }
}

const addSegmentToPairing = (pairing: S3PairingInput, segment: S3PairingSegmentInput): void => {
  pairing.segments.push(segment)
  pairing.segCount = pairing.segments.length
  if (!pairing.base) pairing.base = segment.depArp
  if (!pairing.fleet || pairing.fleet === 'UNK' || (pairing.fleet === 'GRD' && segment.fleet !== 'GRD')) {
    pairing.fleet = segment.fleet
  }
}

const parsePairingRecord = (line: string, rawLineNo: number): S3PrgPairingRecord => ({
  recordType: '1',
  rawLineNo,
  rawLine: line,
  pairingNumber: trimSlice(line, 2, 7),
  pairingDate: trimSlice(line, 8, 15),
  effectiveFromDate: trimSlice(line, 16, 23),
  effectiveToDate: trimSlice(line, 24, 31),
  frequency: trimSlice(line, 32, 38),
  pairingNoOpDatesRaw: slice1(line, 39, 70).trim(),
  reportDate: trimSlice(line, 71, 78),
  reportMinutes: toNumber(trimSlice(line, 79, 82), 'pairing report minutes'),
  pairingEndDate: trimSlice(line, 83, 90),
  pairingEndMinutes: toNumber(trimSlice(line, 91, 94), 'pairing end minutes'),
  firstFlightNumber: trimSlice(line, 95, 99),
  firstDepartureMinutes: toNumber(trimSlice(line, 100, 103), 'first departure minutes'),
  dutyCount: toNumber(trimSlice(line, 104, 106), 'duty count'),
  tafbMinutes: toNumber(trimSlice(line, 108, 112), 'tafb'),
  standupOvernightIndicator: trimSlice(line, 113, 113),
  positionsRaw: slice1(line, 114, 145),
  restRequiredAfterPairingMinutes: toNumber(trimSlice(line, 146, 149), 'rest required after pairing'),
  totalBlockMinutes: optionalNumber(slice1(line, 288, 291)) ?? 0,
  deadheadCreditMinutes: optionalNumber(slice1(line, 292, 295)) ?? 0,
  languagePositionsRaw: slice1(line, 328, 343).trim(),
})

const parseOnlineSegmentRecord = (line: string, rawLineNo: number): S3PrgOnlineSegmentRecord => ({
  recordType: '2',
  rawLineNo,
  rawLine: line,
  pairingNumber: trimSlice(line, 2, 7),
  pairingDate: trimSlice(line, 8, 15),
  flightNumber: trimSlice(line, 16, 20),
  flightSegmentDate: trimSlice(line, 21, 28),
  departureAirport: trimSlice(line, 29, 31),
  departureDate: trimSlice(line, 32, 39),
  departureMinutes: toNumber(trimSlice(line, 40, 43), 'departure minutes'),
  arrivalAirport: trimSlice(line, 44, 46),
  arrivalDate: trimSlice(line, 47, 54),
  arrivalMinutes: toNumber(trimSlice(line, 55, 58), 'arrival minutes'),
  pairingSequenceNumber: toNumber(trimSlice(line, 59, 61), 'pairing sequence number'),
  deadheadIndicator: trimSlice(line, 62, 62),
  legBreakIndicator: trimSlice(line, 63, 63),
  farDomesticInternationalIndicator: trimSlice(line, 64, 64),
  blockMinutes: toNumber(trimSlice(line, 65, 68), 'block minutes'),
  blockCrossoverMinutes: toNumber(trimSlice(line, 69, 72), 'block crossover minutes'),
  legCreditMinutes: toNumber(trimSlice(line, 73, 76), 'leg credit minutes'),
  legDeadheadPayMinutes: toNumber(trimSlice(line, 77, 80), 'leg deadhead pay minutes'),
  farType: trimSlice(line, 81, 81),
  pilotCrewComplement: optionalNumber(slice1(line, 82, 83)),
  departureUtcOffsetMinutes: parseSignedOffset(slice1(line, 84, 88)),
  arrivalUtcOffsetMinutes: parseSignedOffset(slice1(line, 89, 93)),
  equipmentType: trimSlice(line, 94, 96),
  contractDomesticInternationalIndicator: trimSlice(line, 97, 97),
})

const parseDutyRecord = (line: string, rawLineNo: number): S3PrgDutyRecord => ({
  recordType: '3',
  rawLineNo,
  rawLine: line,
  pairingNumber: trimSlice(line, 2, 7),
  pairingDate: trimSlice(line, 8, 15),
  pairingSequenceNumber: toNumber(trimSlice(line, 16, 18), 'duty pairing sequence number'),
  dutyPeriodNumber: toNumber(trimSlice(line, 19, 22), 'duty period number'),
  dutyStartDate: trimSlice(line, 23, 30),
  dutyStartMinutes: toNumber(trimSlice(line, 31, 34), 'duty start minutes'),
  dutyEndDate: trimSlice(line, 35, 42),
  dutyEndMinutes: toNumber(trimSlice(line, 43, 46), 'duty end minutes'),
  farDomesticInternationalIndicator: trimSlice(line, 47, 47),
  scheduledDutyMinutes: toNumber(trimSlice(line, 48, 51), 'scheduled duty minutes'),
  scheduledLayoverMinutes: optionalNumber(slice1(line, 52, 56)),
  layoverCity: trimSlice(line, 57, 59),
  hotelName: trimSlice(line, 60, 85),
  hotelPhoneNumber: trimSlice(line, 86, 99),
  restFarType: trimSlice(line, 100, 101),
  restFarTypeNumber: trimSlice(line, 102, 102),
  restFarMustBeginMinutes: optionalNumber(slice1(line, 103, 106)),
  restFarRequiredMinutes: optionalNumber(slice1(line, 107, 110)),
  dutyPeriodGuaranteeMinutes: optionalNumber(slice1(line, 111, 114)),
  totalBlockMinutes: optionalNumber(slice1(line, 115, 118)) ?? 0,
  totalDeadheadCreditMinutes: optionalNumber(slice1(line, 119, 122)) ?? 0,
  totalDeadheadPayMinutes: optionalNumber(slice1(line, 123, 126)) ?? 0,
  totalDutyCreditMinutes: toNumber(trimSlice(line, 127, 130), 'total duty credit minutes'),
  totalDutyPayMinutes: optionalNumber(slice1(line, 131, 134)) ?? 0,
  dutyPeriodTypeDayNight: trimSlice(line, 135, 135),
  fatigueUnitsRaw: trimSlice(line, 136, 139),
})

const parseOfflineSegmentRecord = (line: string, rawLineNo: number): S3PrgOfflineSegmentRecord => {
  const carrier = trimSlice(line, 19, 22)
  const transportCode = trimSlice(line, 23, 26)
  const transportLabel = `${carrier}${transportCode}`.trim()
  const tailAssignment = trimSlice(line, 84, 86)
  return {
    recordType: '4',
    rawLineNo,
    rawLine: line,
    pairingNumber: trimSlice(line, 2, 7),
    pairingDate: trimSlice(line, 8, 15),
    pairingSequenceNumber: toNumber(trimSlice(line, 16, 18), 'offline pairing sequence number'),
    carrier,
    transportCode,
    flightSegmentDate: trimSlice(line, 27, 34),
    departureAirport: trimSlice(line, 35, 37),
    departureDate: trimSlice(line, 38, 45),
    departureMinutes: toNumber(trimSlice(line, 46, 49), 'offline departure minutes'),
    arrivalAirport: trimSlice(line, 50, 52),
    arrivalDate: trimSlice(line, 53, 60),
    arrivalMinutes: toNumber(trimSlice(line, 61, 64), 'offline arrival minutes'),
    tailAssignment,
    assignment: tailAssignment || transportLabel || 'OFFLINE',
  }
}

export const parseS3PairingPrgRecords = (content: string): S3PairingPrgRecordsParseResult => {
  const records: S3PairingPrgRecordsParseResult = {
    pairings: [],
    onlineSegments: [],
    duties: [],
    offlineSegments: [],
    warnings: [],
  }
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)
  for (const [index, line] of lines.entries()) {
    const rawLineNo = index + 1
    const recordType = line[0]
    if (recordType === '1') records.pairings.push(parsePairingRecord(line, rawLineNo))
    else if (recordType === '2') records.onlineSegments.push(parseOnlineSegmentRecord(line, rawLineNo))
    else if (recordType === '3') records.duties.push(parseDutyRecord(line, rawLineNo))
    else if (recordType === '4') records.offlineSegments.push(parseOfflineSegmentRecord(line, rawLineNo))
    else throw new Error(`Unsupported PRG record type ${recordType || '<empty>'} at line ${rawLineNo}`)
  }
  return records
}

const compareBySegmentTime = (a: S3PairingSegmentInput, b: S3PairingSegmentInput): number =>
  new Date(a.schStrDtUtc).getTime() - new Date(b.schStrDtUtc).getTime() || a.segSeq - b.segSeq

const normalizeDutiesAndAssignSegments = (pairing: S3PairingInput, warnings: string[]): void => {
  const originalDuties = [...pairing.duties.values()].sort((a, b) =>
    new Date(a.dutySchStrDtUtc).getTime() - new Date(b.dutySchStrDtUtc).getTime() || a.dutySeq - b.dutySeq,
  )
  if (originalDuties.length === 0) return

  const normalizedDuties = new Map<number, S3DutyBreakInput>()
  const windows = originalDuties.map((duty, index) => {
    const normalizedSeq = index + 1
    const normalizedDuty = { ...duty, dutySeq: normalizedSeq }
    normalizedDuties.set(normalizedSeq, normalizedDuty)
    return {
      normalizedSeq,
      startMs: new Date(duty.dutySchStrDtUtc).getTime(),
      endMs: new Date(duty.dutySchEndDtUtc).getTime(),
    }
  })

  const sortedSegments = [...pairing.segments].sort(compareBySegmentTime)
  for (const segment of sortedSegments) {
    const segStart = new Date(segment.schStrDtUtc).getTime()
    const segEnd = new Date(segment.schEndDtUtc).getTime()
    const matches = windows.filter((window) => segStart >= window.startMs && segEnd <= window.endMs)
    if (matches.length === 1) {
      segment.dutySeq = matches[0].normalizedSeq
    } else if (matches.length > 1) {
      matches.sort((a, b) => (a.endMs - a.startMs) - (b.endMs - b.startMs))
      segment.dutySeq = matches[0].normalizedSeq
      warnings.push(`Pairing ${pairing.logicalKey} segment ${segment.segSeq} matched multiple duty windows; used duty ${segment.dutySeq}`)
    } else {
      const fallback = windows.find((window) => segStart <= window.endMs) ?? windows[windows.length - 1]
      segment.dutySeq = fallback.normalizedSeq
      warnings.push(`Pairing ${pairing.logicalKey} segment ${segment.segSeq} did not match a duty window; used duty ${segment.dutySeq}`)
    }
  }

  for (const duty of normalizedDuties.values()) {
    const dutySegments = pairing.segments.filter((segment) => segment.dutySeq === duty.dutySeq).sort(compareBySegmentTime)
    duty.dutyStrArp = dutySegments[0]?.depArp ?? pairing.base
    duty.dutyEndArp = dutySegments[dutySegments.length - 1]?.arvArp ?? pairing.base
  }
  const orderedDuties = [...normalizedDuties.values()].sort((a, b) => a.dutySeq - b.dutySeq)
  for (let index = 0; index < orderedDuties.length; index += 1) {
    const duty = orderedDuties[index]
    const nextDuty = orderedDuties[index + 1]
    const derivedGap = nextDuty
      ? Math.max(0, Math.round((new Date(nextDuty.dutySchStrDtUtc).getTime() - new Date(duty.dutySchEndDtUtc).getTime()) / 60_000))
      : pairing.restAfterPairingMinutes
    duty.dutySchRestMin = nextDuty ? (duty.dutySchRestMin ?? derivedGap) : derivedGap
    duty.dutyActRestMin = derivedGap
    duty.dutyLayoverNits = nextDuty && derivedGap > 0 ? 1 : 0
  }
  pairing.duties = normalizedDuties
}
export const parseS3PairingPrg = (content: string): S3PairingParseResult => {
  const pairings = new Map<string, S3PairingInput>()
  const warnings: string[] = []
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)

  for (const [index, line] of lines.entries()) {
    const recordType = line[0]
    if (recordType === '5') {
      throw new Error(`Unsupported PRG record type ${recordType} at line ${index + 1}`)
    }

    if (recordType === '1') {
      const pairing = parseMaster(line)
      pairings.set(pairing.logicalKey, pairing)
      continue
    }

    if (recordType === '2') {
      const { key, ...segment } = parseSegment(line)
      const pairing = pairings.get(key)
      if (!pairing) throw new Error(`Segment row has no matching pairing master at line ${index + 1}`)
      addSegmentToPairing(pairing, segment)
      continue
    }

    if (recordType === '4') {
      const { key, ...segment } = parseOfflineSegment(line)
      const pairing = pairings.get(key)
      if (!pairing) throw new Error(`Offline segment row has no matching pairing master at line ${index + 1}`)
      addSegmentToPairing(pairing, segment)
      continue
    }

    if (recordType === '3') {
      const { key, ...duty } = parseDuty(line)
      const pairing = pairings.get(key)
      if (!pairing) throw new Error(`Duty row has no matching pairing master at line ${index + 1}`)
      pairing.duties.set(duty.dutySeq, duty)
      continue
    }

    throw new Error(`Unsupported PRG record type ${recordType || '<empty>'} at line ${index + 1}`)
  }

  for (const pairing of pairings.values()) {
    if (!pairing.base) throw new Error(`Pairing ${pairing.logicalKey} has no segment base`)
    if (!pairing.fleet) pairing.fleet = 'UNK'

    normalizeDutiesAndAssignSegments(pairing, warnings)

    if (pairing.duties.size === 0) {
      warnings.push(`Pairing ${pairing.logicalKey} has no duty break records; segment times will be used`)
    }
  }

  return { pairings: [...pairings.values()], warnings }
}
