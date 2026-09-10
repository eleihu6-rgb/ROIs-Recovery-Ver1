/**
 * Static OPS simulation values.
 *
 * These options intentionally do not depend on a live reference-data request:
 * the simulation page must remain usable when the reference-data services are
 * unavailable. Keep the values aligned with the aircraft types and tail
 * numbers used by the recovery demo dataset.
 */
export const OPS_FLEET_OPTIONS = [
  '__NO_FLEET__',
  '-',
  '320',
  '737',
  '777',
  '787',
  'A320',
  'A330',
  'A350',
  '733',
  '734',
  '738',
  '73G',
  '73H',
  '73W',
  '788',
  '789',
  '7M8',
  'A380',
] as const

export const OPS_TAIL_NUMBER_OPTIONS = [
  'C-FHCN',
  'C-FHNH',
  'C-FHNL',
  'C-FHNN',
  'C-FHNP',
  'C-FHNX',
  'C-GCUA',
  'C-GFOF',
  'C-GGWF',
  'C-GGWV',
  'C-GICN',
  'C-FFBC',
  'C-FFEL',
  'C-FFFX',
  'C-FFLC',
  'C-FFLJ',
  'C-FFLZ',
  'C-FLBG',
  'C-FLDX',
  'C-FLEJ',
  'C-FLGD',
  'C-FLHI',
  'C-FLKA',
  'C-FLKC',
  'C-FLKJ',
  'C-FLKO',
  'C-FLQO',
  'C-FLQZ',
  'C-FLUJ',
  'C-FLUT',
] as const

export const OPS_EMPTY_TAIL_NUMBER = '__NO_TAIL__'
export const OPS_EMPTY_FLEET = '__NO_FLEET__'
