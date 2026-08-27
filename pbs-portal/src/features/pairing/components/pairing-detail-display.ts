import type {
  PairingSearchLeg,
  PairingSearchResult,
} from "@/features/pairing/types";

export const PAIRING_GANTT_LEG_COLUMNS = [
  "QUAL",
  "ALN",
  "Flight",
  "Fleet",
  "ACC",
  "Ref",
  "DEP",
  "PCK",
  "RPT",
  "STD",
  "ATD",
  "ARR",
  "STA",
  "ATA",
  "DRP",
  "GT",
  "BH",
  "FT",
  "MRT",
  "Duty",
];

export type PairingSummaryItem = {
  label: string;
  value: string;
};

export type PairingGanttLegRow = {
  id: string;
  values: string[];
};

export type PairingPreviewLegRow = {
  airline: string;
  bh: string;
  duty: string;
  fleet: string;
  flight: string;
  id: string;
  pickup: string;
  report: string;
  route: string;
  sta: string;
  std: string;
};

const SUMMARY_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

export const normalizePairingDisplayValue = (value: string | null | undefined) => {
  const trimmedValue = value?.trim();

  return trimmedValue && trimmedValue.length > 0 ? trimmedValue : "-";
};

export const formatPairingDuration = (value: string) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "-";
  }

  const colonMatch = trimmedValue.match(/^(\d{1,3}):([0-5]\d)$/);

  if (colonMatch) {
    return `${Number(colonMatch[1])}:${colonMatch[2]}`;
  }

  const compactMatch = trimmedValue.match(/^(\d{1,})(\d{2})$/);

  if (compactMatch && Number(compactMatch[2]) < 60 && trimmedValue.length >= 4) {
    return `${Number(compactMatch[1])}:${compactMatch[2]}`;
  }

  const numericValue = Number(trimmedValue);

  if (!Number.isFinite(numericValue)) {
    return normalizePairingDisplayValue(trimmedValue);
  }

  if (trimmedValue.length === 3 && compactMatch && Number(compactMatch[2]) < 60 && numericValue < 600) {
    return `${Number(compactMatch[1])}:${compactMatch[2]}`;
  }

  const minutes = Math.max(0, Math.round(numericValue));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}:${String(remainder).padStart(2, "0")}`;
};

export const formatPairingClock = (value: string | null | undefined) => {
  const normalizedValue = normalizePairingDisplayValue(value);

  if (normalizedValue === "-") {
    return "-";
  }

  const colonMatch = normalizedValue.match(/^(\d{1,2}):([0-5]\d)$/);

  if (colonMatch) {
    return `${colonMatch[1].padStart(2, "0")}:${colonMatch[2]}`;
  }

  const compactMatch = normalizedValue.match(/^(\d{2})(\d{2})$/);

  if (compactMatch && Number(compactMatch[2]) < 60) {
    return `${compactMatch[1]}:${compactMatch[2]}`;
  }

  return normalizedValue;
};

export const formatPairingStartDate = (value: string | null | undefined) => {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return "-";
  }

  const compactMatch = trimmedValue.match(/^(\d{4})(\d{2})(\d{2})$/);
  const isoDate = compactMatch
    ? `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`
    : trimmedValue;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return trimmedValue;
  }

  const date = new Date(`${isoDate}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return trimmedValue;
  }

  return SUMMARY_DATE_FORMATTER.format(date);
};

const formatLegDuration = (value: string | null | undefined) => {
  const normalizedValue = normalizePairingDisplayValue(value);
  return normalizedValue === "-" ? "-" : formatPairingDuration(normalizedValue);
};

const joinFlightParts = (qual: string, flight: string) => {
  const parts = [qual, flight].filter((value) => value !== "-");
  return parts.length > 0 ? parts.join(" ") : "-";
};

const buildRoute = (dep: string, arr: string) => {
  if (dep !== "-" && arr !== "-") {
    return `${dep} → ${arr}`;
  }

  return dep !== "-" ? dep : arr;
};

const getGanttLegValues = (leg: PairingSearchLeg) => [
  normalizePairingDisplayValue(leg.ganttQual),
  normalizePairingDisplayValue(leg.ganttAirline),
  normalizePairingDisplayValue(leg.ganttFlight ?? leg.flightNumber),
  normalizePairingDisplayValue(leg.ganttFleet ?? leg.equipment),
  normalizePairingDisplayValue(leg.ganttAcc),
  normalizePairingDisplayValue(leg.ganttRef),
  normalizePairingDisplayValue(leg.ganttDep ?? leg.departureStation),
  formatPairingClock(leg.ganttPickup),
  formatPairingClock(leg.ganttReport),
  formatPairingClock(leg.ganttStd ?? leg.departureTime),
  formatPairingClock(leg.ganttAtd ?? leg.departureTime),
  normalizePairingDisplayValue(leg.ganttArr ?? leg.arrivalStation),
  formatPairingClock(leg.ganttSta ?? leg.arrivalTime),
  formatPairingClock(leg.ganttAta ?? leg.arrivalTime),
  formatPairingClock(leg.ganttDropoff),
  formatLegDuration(leg.ganttGroundTime),
  formatLegDuration(leg.ganttBlockHour ?? leg.blockTime),
  formatLegDuration(leg.ganttFlightTime ?? leg.dutyFlyingHour),
  normalizePairingDisplayValue(leg.ganttMinimumRest),
  normalizePairingDisplayValue(leg.ganttDuty),
];

export const buildPairingSummary = (result: PairingSearchResult): PairingSummaryItem[] => [
  {
    label: "Start",
    value: normalizePairingDisplayValue(result.startDateLabel) === "-"
      ? formatPairingStartDate(result.activeDates[0])
      : normalizePairingDisplayValue(result.startDateLabel),
  },
  { label: "Base", value: normalizePairingDisplayValue(result.base) },
  { label: "Composition", value: normalizePairingDisplayValue(result.compositionLabel) },
  { label: "Total Credit", value: formatPairingDuration(result.totalCredit) },
  { label: "Total BH", value: formatPairingDuration(result.totalBlock) },
  { label: "Total DP", value: formatPairingDuration(result.totalDp ?? "") },
];

export const buildGanttLegRows = (legs: PairingSearchLeg[]): PairingGanttLegRow[] =>
  legs.map((leg) => ({
    id: leg.id,
    values: getGanttLegValues(leg),
  }));

export const buildPairingPreviewLegRows = (legs: PairingSearchLeg[]): PairingPreviewLegRow[] =>
  legs.map((leg) => {
    const qual = normalizePairingDisplayValue(leg.ganttQual);
    const flight = normalizePairingDisplayValue(leg.ganttFlight ?? leg.flightNumber);
    const depStation = normalizePairingDisplayValue(leg.ganttDep ?? leg.departureStation);
    const arrStation = normalizePairingDisplayValue(leg.ganttArr ?? leg.arrivalStation);

    return {
      id: leg.id,
      flight: joinFlightParts(qual, flight),
      airline: normalizePairingDisplayValue(leg.ganttAirline),
      fleet: normalizePairingDisplayValue(leg.ganttFleet ?? leg.equipment),
      route: buildRoute(depStation, arrStation),
      pickup: formatPairingClock(leg.ganttPickup),
      report: formatPairingClock(leg.ganttReport),
      std: formatPairingClock(leg.ganttStd ?? leg.departureTime),
      sta: formatPairingClock(leg.ganttSta ?? leg.arrivalTime),
      bh: formatLegDuration(leg.ganttBlockHour ?? leg.blockTime),
      duty: normalizePairingDisplayValue(leg.ganttDuty),
    };
  });
