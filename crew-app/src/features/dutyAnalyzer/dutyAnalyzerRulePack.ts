import type { CrewComposition, RestFacility } from './dutyAnalyzerTypes';

export interface FdpRuleRow {
  startMinute: number;
  endMinute: number;
  limits: number[];
  composition: CrewComposition;
  restFacility: RestFacility;
  ruleId: string;
}

const mins = (value: string): number => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

export const EASA_BASIC_FDP_ROWS: FdpRuleRow[] = [
  ['06:00', '13:29', ['13:00', '12:30', '12:00', '11:30', '11:00', '10:30', '10:00', '09:30', '09:00']],
  ['13:30', '13:59', ['12:45', '12:15', '11:45', '11:15', '10:45', '10:15', '09:45', '09:15', '09:00']],
  ['14:00', '14:29', ['12:30', '12:00', '11:30', '11:00', '10:30', '10:00', '09:30', '09:00', '09:00']],
  ['14:30', '14:59', ['12:15', '11:45', '11:15', '10:45', '10:15', '09:45', '09:15', '09:00', '09:00']],
  ['15:00', '15:29', ['12:00', '11:30', '11:00', '10:30', '10:00', '09:30', '09:00', '09:00', '09:00']],
  ['15:30', '15:59', ['11:45', '11:15', '10:45', '10:15', '09:45', '09:15', '09:00', '09:00', '09:00']],
  ['16:00', '16:29', ['11:30', '11:00', '10:30', '10:00', '09:30', '09:00', '09:00', '09:00', '09:00']],
  ['16:30', '16:59', ['11:15', '10:45', '10:15', '09:45', '09:15', '09:00', '09:00', '09:00', '09:00']],
  ['17:00', '04:59', ['11:00', '10:30', '10:00', '09:30', '09:00', '09:00', '09:00', '09:00', '09:00']],
  ['05:00', '05:14', ['12:00', '11:30', '11:00', '10:30', '10:00', '09:30', '09:00', '09:00', '09:00']],
  ['05:15', '05:29', ['12:15', '11:45', '11:15', '10:45', '10:15', '09:45', '09:15', '09:00', '09:00']],
  ['05:30', '05:44', ['12:30', '12:00', '11:30', '11:00', '10:30', '10:00', '09:30', '09:00', '09:00']],
  ['05:45', '05:59', ['12:45', '12:15', '11:45', '11:15', '10:45', '10:15', '09:45', '09:15', '09:00']],
].map(([start, end, limits]) => ({
  startMinute: mins(start as string),
  endMinute: mins(end as string),
  limits: (limits as string[]).map(mins),
  composition: 'basic' as const,
  restFacility: null,
  ruleId: '7005',
}));

export const EASA_AUGMENTED_FDP_ROWS: FdpRuleRow[] = [
  { startMinute: 0, endMinute: 1439, limits: [mins('14:00'), mins('14:00')], composition: '3P', restFacility: 3, ruleId: '7005' },
  { startMinute: 0, endMinute: 1439, limits: [mins('15:00'), mins('15:00')], composition: '3P', restFacility: 2, ruleId: '7005' },
  { startMinute: 0, endMinute: 1439, limits: [mins('16:00'), mins('16:00')], composition: '3P', restFacility: 1, ruleId: '7005' },
  { startMinute: 0, endMinute: 1439, limits: [mins('15:00'), mins('15:00')], composition: '4P', restFacility: 3, ruleId: '7005' },
  { startMinute: 0, endMinute: 1439, limits: [mins('16:00'), mins('16:00')], composition: '4P', restFacility: 2, ruleId: '7005' },
  { startMinute: 0, endMinute: 1439, limits: [mins('17:00'), mins('17:00')], composition: '4P', restFacility: 1, ruleId: '7005' },
];

export const EASA_BASIC_SECTOR_RANGES = [
  { label: '1–2', min: 1, max: 2 },
  { label: '3', min: 3, max: 3 },
  { label: '4', min: 4, max: 4 },
  { label: '5', min: 5, max: 5 },
  { label: '6', min: 6, max: 6 },
  { label: '7', min: 7, max: 7 },
  { label: '8', min: 8, max: 8 },
  { label: '9', min: 9, max: 9 },
  { label: '10', min: 10, max: 10 },
] as const;

export interface EasaBasicFdpSelection {
  bandIndex: number;
  sectorIndex: number;
  start: string;
  end: string;
  sectorLabel: string;
  maxFdpMinutes: number;
}

const clock = (minuteOfDay: number): string =>
  `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;

export const easaBasicFdpSelection = (
  reportMinuteOfDay: number,
  sectors: number,
): EasaBasicFdpSelection | null => {
  const bandIndex = EASA_BASIC_FDP_ROWS.findIndex(row =>
    minuteInBand(reportMinuteOfDay, row.startMinute, row.endMinute),
  );
  const sectorIndex = EASA_BASIC_SECTOR_RANGES.findIndex(range =>
    sectors >= range.min && sectors <= range.max,
  );
  if (bandIndex < 0 || sectorIndex < 0) return null;
  const row = EASA_BASIC_FDP_ROWS[bandIndex];
  return {
    bandIndex,
    sectorIndex,
    start: clock(row.startMinute),
    end: clock(row.endMinute),
    sectorLabel: EASA_BASIC_SECTOR_RANGES[sectorIndex].label,
    maxFdpMinutes: row.limits[sectorIndex],
  };
};

export const EASA_UNKNOWN_LIMITS = ['12:00', '11:30', '11:00', '10:30', '10:00', '09:30', '09:00'].map(mins);

export interface Operator6007Row {
  startMinute: number;
  endMinute: number;
  minLandings: number;
  maxLandings: number;
  maxFdpMinutes: number;
  maxDpMinutes: number;
  maxBlockMinutes: number;
}

export interface Operator6007UnknownRow {
  minOdpMinutes: number;
  maxOdpMinutes: number;
  minLandings: number;
  maxLandings: number;
  maxFdpMinutes: number;
  maxDpMinutes: number;
  maxBlockMinutes: number;
}

export interface AppliedBasicFdpBand {
  start: string;
  end: string;
  limits: string[];
}

export const APPLIED_BASIC_FDP_BANDS: AppliedBasicFdpBand[] = [
  { start: '05:00', end: '05:59', limits: ['12:00', '12:00', '10:00', '09:30', '09:00', '08:30'] },
  { start: '06:00', end: '06:59', limits: ['12:00', '12:00', '11:00', '10:30', '10:00', '09:30'] },
  { start: '07:00', end: '12:59', limits: ['13:00', '12:30', '12:00', '11:30', '11:00', '10:30'] },
  { start: '13:00', end: '13:59', limits: ['12:00', '11:30', '11:00', '10:30', '10:00', '09:30'] },
  { start: '14:00', end: '14:59', limits: ['11:00', '10:30', '10:00', '09:30', '09:00', '08:30'] },
  { start: '15:00', end: '16:59', limits: ['10:30', '09:30', '09:00', '08:30', '08:00', '07:30'] },
  { start: '17:00', end: '04:59', limits: ['10:00', '09:30', '09:00', '08:30', '08:00', '07:30'] },
];

export const APPLIED_LANDING_RANGES = [
  { label: '1–3', min: 1, max: 3 },
  { label: '4', min: 4, max: 4 },
  { label: '5', min: 5, max: 5 },
  { label: '6', min: 6, max: 6 },
  { label: '7', min: 7, max: 7 },
  { label: '8+', min: 8, max: 99 },
] as const;

export interface AppliedBasicFdpSelection {
  bandIndex: number;
  landingIndex: number;
  start: string;
  end: string;
  landingLabel: string;
  maxFdpMinutes: number;
}

export const appliedBasicFdpSelection = (
  reportMinuteOfDay: number,
  landings: number,
): AppliedBasicFdpSelection | null => {
  const bandIndex = APPLIED_BASIC_FDP_BANDS.findIndex(band =>
    minuteInBand(reportMinuteOfDay, mins(band.start), mins(band.end)),
  );
  const landingIndex = APPLIED_LANDING_RANGES.findIndex(range =>
    landings >= range.min && landings <= range.max,
  );
  if (bandIndex < 0 || landingIndex < 0) return null;
  const band = APPLIED_BASIC_FDP_BANDS[bandIndex];
  return {
    bandIndex,
    landingIndex,
    start: band.start,
    end: band.end,
    landingLabel: APPLIED_LANDING_RANGES[landingIndex].label,
    maxFdpMinutes: mins(band.limits[landingIndex]),
  };
};

export const OPERATOR_6007_ROWS: Operator6007Row[] = APPLIED_BASIC_FDP_BANDS.flatMap(({ start, end, limits }) =>
  limits.map((limit, index) => ({
    startMinute: mins(start),
    endMinute: mins(end),
    minLandings: APPLIED_LANDING_RANGES[index].min,
    maxLandings: APPLIED_LANDING_RANGES[index].max,
    maxFdpMinutes: mins(limit),
    maxDpMinutes: mins('16:00'),
    maxBlockMinutes: mins('23:00'),
  })),
);

const operatorUnknownLimits = ['10:00', '09:30', '09:00', '08:30', '08:00', '07:30'];

export const OPERATOR_6007_UNKNOWN_ROWS: Operator6007UnknownRow[] = operatorUnknownLimits.map((limit, index) => ({
  minOdpMinutes: mins('00:00'),
  maxOdpMinutes: mins('30:00'),
  minLandings: APPLIED_LANDING_RANGES[index].min,
  maxLandings: APPLIED_LANDING_RANGES[index].max,
  maxFdpMinutes: mins(limit),
  maxDpMinutes: mins('16:00'),
  maxBlockMinutes: mins('23:00'),
}));

export const OPERATOR_6008_FDP_EXTENSION_MINUTES = mins('02:00');
export const OPERATOR_6008_BLOCK_EXTENSION_MINUTES = mins('00:30');

export const minuteInBand = (minute: number, start: number, end: number): boolean =>
  start <= end ? minute >= start && minute <= end : minute >= start || minute <= end;
