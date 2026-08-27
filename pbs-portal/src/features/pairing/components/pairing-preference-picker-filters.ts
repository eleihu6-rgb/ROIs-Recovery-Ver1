import type { PbsSearchPairingsPreviewFilters } from "../../../../../packages/contracts/pbs-search-pairings.js";

export type PairingPreferencePickerFilterDraft = {
  originDateFrom: string;
  originDateTo: string;
  checkInFrom: string;
  checkInTo: string;
  checkOutFrom: string;
  checkOutTo: string;
  daysMin: string;
  daysMax: string;
  routeStations: string[];
  layoverStations: string[];
  layoverCountMin: string;
  layoverCountMax: string;
  creditMin: string;
  creditMax: string;
  hasRedeye: boolean;
  hasDeadhead: boolean;
};

export type PairingPreferencePeriodBounds = {
  min: string;
  max: string;
};

export const EMPTY_PAIRING_PREFERENCE_FILTER_DRAFT: PairingPreferencePickerFilterDraft = {
  originDateFrom: "",
  originDateTo: "",
  checkInFrom: "",
  checkInTo: "",
  checkOutFrom: "",
  checkOutTo: "",
  daysMin: "",
  daysMax: "",
  routeStations: [],
  layoverStations: [],
  layoverCountMin: "",
  layoverCountMax: "",
  creditMin: "",
  creditMax: "",
  hasRedeye: false,
  hasDeadhead: false,
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9]\d*)$/;
const CREDIT_DURATION_PATTERN = /^\d{1,3}:[0-5]\d$/;
const AIRPORT_CODE_PATTERN = /^[A-Z0-9]{2,4}$/;
const PERIOD_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const isEmptyOr = (value: string, predicate: (candidate: string) => boolean) =>
  value.trim().length === 0 || predicate(value.trim());

const isOrdered = (from: string, to: string) =>
  !from.trim() || !to.trim() || from.trim() <= to.trim();

const parseInteger = (value: string) => value.trim() ? Number.parseInt(value.trim(), 10) : undefined;

const parseCreditMinutes = (value: string) => {
  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  const [hours, minutes] = normalized.split(":");
  return (Number.parseInt(hours!, 10) * 60) + Number.parseInt(minutes!, 10);
};

const normalizeStationCodes = (values: string[]) => Array.from(new Set(
  values.map((value) => value.trim().toUpperCase()).filter(Boolean),
));

export const buildPairingPreferencePeriodBounds = (
  periodCode: string,
): PairingPreferencePeriodBounds | null => {
  const match = /^([A-Za-z]{3})\s+(\d{4})$/.exec(periodCode.trim());
  const monthIndex = match ? PERIOD_MONTHS.indexOf(match[1]!.toLowerCase()) : -1;
  const year = match ? Number.parseInt(match[2]!, 10) : Number.NaN;

  if (monthIndex < 0 || !Number.isInteger(year)) {
    return null;
  }

  const month = String(monthIndex + 1).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

  return {
    min: `${year}-${month}-01`,
    max: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
};

export const validatePairingPreferencePickerFilters = (
  draft: PairingPreferencePickerFilterDraft,
  periodBounds?: PairingPreferencePeriodBounds | null,
): string => {
  if (!isEmptyOr(draft.originDateFrom, (value) => ISO_DATE_PATTERN.test(value))
    || !isEmptyOr(draft.originDateTo, (value) => ISO_DATE_PATTERN.test(value))) {
    return "Pairing start dates must use YYYY-MM-DD.";
  }

  if (!isOrdered(draft.originDateFrom, draft.originDateTo)) {
    return "Pairing start date From cannot exceed To.";
  }

  if (periodBounds && [draft.originDateFrom, draft.originDateTo]
    .some((value) => value.trim() && (value < periodBounds.min || value > periodBounds.max))) {
    return "Pairing start dates must stay within the current bid period.";
  }

  const timeValues = [draft.checkInFrom, draft.checkInTo, draft.checkOutFrom, draft.checkOutTo];
  if (timeValues.some((value) => !isEmptyOr(value, (candidate) => CLOCK_PATTERN.test(candidate)))) {
    return "Check-in and check-out times must use HH:MM.";
  }

  if (!isOrdered(draft.checkOutFrom, draft.checkOutTo)) {
    return "Check-out time From cannot exceed To.";
  }

  if (![draft.daysMin, draft.daysMax]
    .every((value) => isEmptyOr(value, (candidate) => POSITIVE_INTEGER_PATTERN.test(candidate)))) {
    return "Pairing days must be positive whole numbers.";
  }

  const daysMin = parseInteger(draft.daysMin);
  const daysMax = parseInteger(draft.daysMax);
  if (daysMin !== undefined && daysMax !== undefined && daysMin > daysMax) {
    return "Pairing days Min cannot exceed Max.";
  }

  if (![draft.layoverCountMin, draft.layoverCountMax]
    .every((value) => isEmptyOr(value, (candidate) => NON_NEGATIVE_INTEGER_PATTERN.test(candidate)))) {
    return "Layover count must be whole numbers.";
  }

  const layoverCountMin = parseInteger(draft.layoverCountMin);
  const layoverCountMax = parseInteger(draft.layoverCountMax);
  if (layoverCountMin !== undefined && layoverCountMax !== undefined && layoverCountMin > layoverCountMax) {
    return "Layover count Min cannot exceed Max.";
  }

  if (![draft.creditMin, draft.creditMax]
    .every((value) => isEmptyOr(value, (candidate) => CREDIT_DURATION_PATTERN.test(candidate)))) {
    return "Credit range must use HH:MM.";
  }

  const creditMin = parseCreditMinutes(draft.creditMin);
  const creditMax = parseCreditMinutes(draft.creditMax);
  if (creditMin !== undefined && creditMax !== undefined && creditMin > creditMax) {
    return "Credit Min cannot exceed Max.";
  }

  const stationValues = [
    ...normalizeStationCodes(draft.routeStations),
    ...normalizeStationCodes(draft.layoverStations),
  ];
  if (stationValues.some((value) => !AIRPORT_CODE_PATTERN.test(value))) {
    return "Station filters must use 2-4 character airport codes.";
  }

  return "";
};

export const buildPairingPreferencePickerFilters = (
  draft: PairingPreferencePickerFilterDraft,
): PbsSearchPairingsPreviewFilters => {
  const routeStations = normalizeStationCodes(draft.routeStations);
  const layoverStations = normalizeStationCodes(draft.layoverStations);
  const layoverCountMin = parseInteger(draft.layoverCountMin);
  const layoverCountMax = parseInteger(draft.layoverCountMax);
  const creditMinutesMin = parseCreditMinutes(draft.creditMin);
  const creditMinutesMax = parseCreditMinutes(draft.creditMax);

  return {
    ...(draft.originDateFrom.trim() ? { originDateFrom: draft.originDateFrom.trim() } : {}),
    ...(draft.originDateTo.trim() ? { originDateTo: draft.originDateTo.trim() } : {}),
    ...(draft.checkInFrom.trim() ? { timeFrom: draft.checkInFrom.trim() } : {}),
    ...(draft.checkInTo.trim() ? { timeTo: draft.checkInTo.trim() } : {}),
    ...(draft.checkOutFrom.trim() ? { releaseTimeFrom: draft.checkOutFrom.trim() } : {}),
    ...(draft.checkOutTo.trim() ? { releaseTimeTo: draft.checkOutTo.trim() } : {}),
    ...(parseInteger(draft.daysMin) !== undefined ? { durationDaysMin: parseInteger(draft.daysMin) } : {}),
    ...(parseInteger(draft.daysMax) !== undefined ? { durationDaysMax: parseInteger(draft.daysMax) } : {}),
    ...(routeStations.length > 0 ? { airports: routeStations } : {}),
    ...(layoverStations.length > 0 ? { layoverAirports: layoverStations } : {}),
    ...(layoverCountMin !== undefined ? { layoverCountMin } : {}),
    ...(layoverCountMax !== undefined ? { layoverCountMax } : {}),
    ...(creditMinutesMin !== undefined ? { creditMinutesMin } : {}),
    ...(creditMinutesMax !== undefined ? { creditMinutesMax } : {}),
    ...(draft.hasRedeye ? { hasRedeye: true } : {}),
    ...(draft.hasDeadhead ? { hasDeadhead: true } : {}),
  };
};

export const countActivePairingPreferencePickerFilters = (
  draft: PairingPreferencePickerFilterDraft,
) => [
  draft.originDateFrom || draft.originDateTo,
  draft.checkInFrom || draft.checkInTo,
  draft.checkOutFrom || draft.checkOutTo,
  draft.daysMin || draft.daysMax,
  draft.routeStations.length > 0,
  draft.layoverStations.length > 0,
  draft.layoverCountMin || draft.layoverCountMax,
  draft.creditMin || draft.creditMax,
  draft.hasRedeye,
  draft.hasDeadhead,
].filter(Boolean).length;

export const arePairingPreferencePickerFilterDraftsEqual = (
  left: PairingPreferencePickerFilterDraft,
  right: PairingPreferencePickerFilterDraft,
) => JSON.stringify({
  ...left,
  routeStations: normalizeStationCodes(left.routeStations),
  layoverStations: normalizeStationCodes(left.layoverStations),
}) === JSON.stringify({
  ...right,
  routeStations: normalizeStationCodes(right.routeStations),
  layoverStations: normalizeStationCodes(right.layoverStations),
});
