import type {
  PbsAwardCalendarEvent,
  PbsAwardCurrentResponse,
  PbsAwardItem,
  PbsAwardItemType,
  PbsAwardLeg,
  PbsAwardReasonReportItem,
  PbsAwardTimeZoneInfo,
} from "../../../../packages/contracts/pbs-award-results.js";
import { parsePbsAwardExplanationComment } from "../../../../packages/contracts/pbs-award-results.js";
import type { PbsCurrentPeriod } from "../../../../packages/contracts/pbs-current-period.js";
import type { AwardResultRow, AwardRosterRow } from "./types.js";

const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_OFF_CODES = new Set(["DO", "GDO", "OFF"]);
const REASON_REPORT_UNAVAILABLE = "No award explanations are available for this period.";
const CREDIT_MISSING_DUTY_SEQ = "Published roster snapshot is missing duty_seq, so pairing credit cannot be safely deduplicated.";
const CREDIT_MISSING_DUTY_VALUE = "Published roster snapshot is missing duty credit minutes.";
const CREDIT_INCONSISTENT_DUTY_VALUE = "Published roster snapshot has inconsistent credit minutes within the same duty.";
const LEG_EQUIPMENT_MISSING = "Leg equipment is missing from the published roster snapshot.";
const DEFAULT_TIME_ZONE: PbsAwardTimeZoneInfo = {
  base: null,
  zoneId: "UTC",
  timezoneLabel: "UTC",
  fallback: true,
};
const MS_PER_DAY = 86_400_000;
const MINUTES_PER_DAY = 1_440;
const GROUND_CALENDAR_CONTIGUITY_TOLERANCE_MS = 60_000;

type ParsedDateTime = {
  date: string;
  time: string | null;
  timestampMs: number;
};

type GroundRowIdentity = {
  itemId: string;
  groupKey: string;
  runKey: string;
  type: "day_off" | "activity";
};

type GroundCalendarCandidate = {
  ownerItemId: string;
  sourceId: string;
  runKey: string;
  event: PbsAwardCalendarEvent;
  start: ParsedDateTime;
  end: ParsedDateTime;
};

type PeriodBounds = {
  startIsoDate: string;
  nextIsoDate: string;
  startMinuteIndex: number;
  endMinuteIndex: number;
};

const dateTimeFormatterByZone = new Map<string, Intl.DateTimeFormat>();

const normalizeText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

const normalizeCode = (value: string | null | undefined) =>
  normalizeText(value)?.toUpperCase() ?? null;

const getDateTimeFormatter = (zoneId: string): Intl.DateTimeFormat => {
  const normalizedZoneId = normalizeText(zoneId) ?? DEFAULT_TIME_ZONE.zoneId;
  const cachedFormatter = dateTimeFormatterByZone.get(normalizedZoneId);

  if (cachedFormatter) {
    return cachedFormatter;
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: normalizedZoneId,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

    dateTimeFormatterByZone.set(normalizedZoneId, formatter);
    return formatter;
  } catch {
    return getDateTimeFormatter(DEFAULT_TIME_ZONE.zoneId);
  }
};

const toBaseLocalDateTime = (
  parsed: ParsedDateTime | null,
  zoneId: string,
): ParsedDateTime | null => {
  if (!parsed) {
    return null;
  }

  const parts = new Map(
    getDateTimeFormatter(zoneId)
      .formatToParts(new Date(parsed.timestampMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  const hour = parts.get("hour");
  const minute = parts.get("minute");

  if (!year || !month || !day || !hour || !minute) {
    return parsed;
  }

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}${minute}`,
    timestampMs: parsed.timestampMs,
  };
};

const parsePeriodBounds = (rpStart: string | null, rpEnd: string | null): PeriodBounds | null => {
  if (!rpStart || !rpEnd) return null;
  const startTime = Date.parse(rpStart);
  const endTime = Date.parse(rpEnd);
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) return null;
  const nextTime = endTime + MS_PER_DAY;
  const startDayIndex = Math.floor(startTime / MS_PER_DAY);
  const nextDayIndex = Math.floor(nextTime / MS_PER_DAY);

  return {
    startIsoDate: new Date(startTime).toISOString().slice(0, 10),
    nextIsoDate: new Date(nextTime).toISOString().slice(0, 10),
    startMinuteIndex: startDayIndex * MINUTES_PER_DAY,
    endMinuteIndex: nextDayIndex * MINUTES_PER_DAY,
  };
};

const timeToMinutes = (time: string | null | undefined, fallback: number): number => {
  if (!time || !/^\d{4}$/.test(time)) {
    return fallback;
  }

  const hours = Number.parseInt(time.slice(0, 2), 10);
  const minutes = Number.parseInt(time.slice(2), 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return fallback;
  }

  return Math.min(Math.max(hours * 60 + minutes, 0), MINUTES_PER_DAY);
};

const dateToDayIndex = (isoDate: string): number | null => {
  const parsed = Date.parse(`${isoDate}T00:00:00.000Z`);

  return Number.isNaN(parsed) ? null : Math.floor(parsed / MS_PER_DAY);
};

const localDateTimeMinuteIndex = (
  isoDate: string,
  time: string | null,
  fallbackMinute: number,
): number | null => {
  const dayIndex = dateToDayIndex(isoDate);

  if (dayIndex === null) {
    return null;
  }

  return dayIndex * MINUTES_PER_DAY + timeToMinutes(time, fallbackMinute);
};

const itemOverlapsPeriod = (item: PbsAwardItem, periodBounds: PeriodBounds | null): boolean => {
  if (!periodBounds) {
    return true;
  }

  const startMinuteIndex = localDateTimeMinuteIndex(item.startDate, item.startTime, 0);
  const rawEndMinuteIndex = localDateTimeMinuteIndex(item.endDate, item.endTime, MINUTES_PER_DAY);

  if (startMinuteIndex === null || rawEndMinuteIndex === null) {
    return true;
  }

  const endMinuteIndex = rawEndMinuteIndex <= startMinuteIndex
    ? startMinuteIndex + 1
    : rawEndMinuteIndex;

  return startMinuteIndex < periodBounds.endMinuteIndex
    && endMinuteIndex > periodBounds.startMinuteIndex;
};

const parseDateText = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const dateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return dateMatch?.[1] ?? null;
};

const parseDateTime = (value: string | Date | null | undefined, fallbackDate?: string | null): ParsedDateTime | null => {
  if (!value && !fallbackDate) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return fallbackDate ? {
        date: fallbackDate,
        time: null,
        timestampMs: Date.parse(`${fallbackDate}T00:00:00.000Z`),
      } : null;
    }

    return {
      date: value.toISOString().slice(0, 10),
      time: value.toISOString().slice(11, 16).replace(":", ""),
      timestampMs: value.getTime(),
    };
  }

  const trimmed = value?.trim();

  if (!trimmed) {
    return fallbackDate ? {
      date: fallbackDate,
      time: null,
      timestampMs: Date.parse(`${fallbackDate}T00:00:00.000Z`),
    } : null;
  }

  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  const date = match?.[1] ?? fallbackDate ?? null;

  if (!date) {
    return null;
  }

  const time = match?.[2] && match?.[3] ? `${match[2]}${match[3]}` : null;
  const timestampMs = Date.parse(time ? `${date}T${match![2]}:${match![3]}:00.000Z` : `${date}T00:00:00.000Z`);

  return {
    date,
    time,
    timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
  };
};

const parseNumericMinutes = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed);
};

const minutesBetween = (start: ParsedDateTime | null, end: ParsedDateTime | null): number | null => {
  if (!start || !end || end.timestampMs <= start.timestampMs) {
    return null;
  }

  return Math.round((end.timestampMs - start.timestampMs) / 60_000);
};

const minByTimestamp = (dates: ParsedDateTime[]) =>
  dates.reduce<ParsedDateTime | null>((current, next) => (
    !current || next.timestampMs < current.timestampMs ? next : current
  ), null);

const maxByTimestamp = (dates: ParsedDateTime[]) =>
  dates.reduce<ParsedDateTime | null>((current, next) => (
    !current || next.timestampMs > current.timestampMs ? next : current
  ), null);

const sumNullableMinutes = (values: Array<number | null>): number | null => {
  const presentValues = values.filter((value): value is number => value !== null);
  return presentValues.length > 0
    ? presentValues.reduce((total, value) => total + value, 0)
    : null;
};

const uniqueNormalizedValues = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const resolvedValues: string[] = [];

  for (const value of values) {
    const normalizedValue = normalizeText(value);

    if (!normalizedValue || seen.has(normalizedValue)) {
      continue;
    }

    seen.add(normalizedValue);
    resolvedValues.push(normalizedValue);
  }

  return resolvedValues;
};

const toTierLabel = (value: string | number | null | undefined): string | null => {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? `T${parsed}` : null;
};

const isDayOffRow = (row: AwardRosterRow): boolean => {
  const codes = [
    normalizeCode(row.assignment),
    normalizeCode(row.assignment_group),
    normalizeCode(row.label),
  ];

  return codes.some((code) => Boolean(code && DAY_OFF_CODES.has(code)));
};

const resolveStart = (row: AwardRosterRow) =>
  parseDateTime(row.start_utc, parseDateText(row.flt_dt));

const resolveEnd = (row: AwardRosterRow) =>
  parseDateTime(row.end_utc, parseDateText(row.flt_dt));

const resolveLocalStart = (row: AwardRosterRow, zoneId: string) =>
  toBaseLocalDateTime(resolveStart(row), zoneId);

const resolveRowDate = (row: AwardRosterRow, zoneId: string): string | null =>
  resolveLocalStart(row, zoneId)?.date ?? parseDateText(row.flt_dt);

const resolveGroundRowIdentity = (
  row: AwardRosterRow,
  zoneId: string,
): GroundRowIdentity | null => {
  const date = resolveRowDate(row, zoneId);

  if (!date) {
    return null;
  }

  if (isDayOffRow(row)) {
    return {
      itemId: `day-off-${date}`,
      groupKey: date,
      runKey: "day_off:DO",
      type: "day_off",
    };
  }

  const activityCode = normalizeCode(row.assignment)
    ?? normalizeCode(row.assignment_group)
    ?? normalizeCode(row.label)
    ?? "activity";
  const groupKey = `${date}-${activityCode}`;

  return {
    itemId: `activity-${groupKey}`,
    groupKey,
    runKey: `activity:${activityCode.toUpperCase()}`,
    type: "activity",
  };
};

const buildMatchedTierLookup = (awardRows: AwardResultRow[]) => {
  const lookup = new Map<string, string>();

  for (const row of awardRows) {
    const matchedTier = toTierLabel(row.matched_tier);

    if (!matchedTier) {
      continue;
    }

    if (row.pairing_id) {
      lookup.set(`pairing:${row.pairing_id}`, matchedTier);
    }

    const dateOff = parseDateText(row.date_off);

    if (dateOff) {
      lookup.set(`day_off:${dateOff}`, matchedTier);
    }
  }

  return lookup;
};

const extractFlightNumber = (row: AwardRosterRow): string | null => {
  const label = normalizeText(row.label);
  const match = label?.match(/\b([A-Z]?\d{2,5}[A-Z]?)\b/);
  return match?.[1] ?? normalizeText(row.flt_id);
};

const resolvePairingPosition = (rows: AwardRosterRow[]): string | null => {
  for (const fieldValues of [
    rows.map((row) => row.acting_rank),
    rows.map((row) => row.position),
    rows.map((row) => row.active_rank),
  ]) {
    const values = uniqueNormalizedValues(fieldValues);

    if (values.length > 0) {
      return values.join(" / ");
    }
  }

  return null;
};

const resolvePairingExplanation = (rows: AwardRosterRow[]): string | null => {
  const explanations = rows.map((row) => {
    const hasOptimizerProvenance = normalizeCode(row.source) === "CR"
      && normalizeCode(row.request_source) === "SCENARIO"
      && normalizeText(row.request_id) !== null;

    return hasOptimizerProvenance
      ? parsePbsAwardExplanationComment(row.comments)
      : null;
  });

  if (explanations.some((explanation) => explanation === null)) {
    return null;
  }

  const distinctExplanations = new Set(explanations);

  return distinctExplanations.size === 1
    ? explanations[0] ?? null
    : null;
};

const rowCreditMinutes = (row: AwardRosterRow): number | null =>
  parseNumericMinutes(row.act_credit_minutes) ?? parseNumericMinutes(row.sch_credit_minutes);

const resolvePairingCredit = (rows: AwardRosterRow[]): {
  creditMinutes: number | null;
  missingReason: string | null;
} => {
  if (rows.length === 0) {
    return { creditMinutes: null, missingReason: null };
  }

  if (rows.length === 1) {
    const creditMinutes = rowCreditMinutes(rows[0]!);

    return {
      creditMinutes,
      missingReason: creditMinutes === null ? CREDIT_MISSING_DUTY_VALUE : null,
    };
  }

  if (rows.some((row) => row.duty_seq === null || row.duty_seq === undefined)) {
    return { creditMinutes: null, missingReason: CREDIT_MISSING_DUTY_SEQ };
  }

  const rowsByDuty = new Map<number, AwardRosterRow[]>();

  for (const row of rows) {
    const dutyRows = rowsByDuty.get(row.duty_seq!) ?? [];

    dutyRows.push(row);
    rowsByDuty.set(row.duty_seq!, dutyRows);
  }

  let creditMinutes = 0;

  for (const dutyRows of rowsByDuty.values()) {
    const dutyCreditValues = dutyRows
      .map(rowCreditMinutes)
      .filter((value): value is number => value !== null);

    if (dutyCreditValues.length === 0) {
      return { creditMinutes: null, missingReason: CREDIT_MISSING_DUTY_VALUE };
    }

    if (new Set(dutyCreditValues).size > 1) {
      return { creditMinutes: null, missingReason: CREDIT_INCONSISTENT_DUTY_VALUE };
    }

    creditMinutes += dutyCreditValues[0]!;
  }

  return { creditMinutes, missingReason: null };
};

const buildLeg = (row: AwardRosterRow, zoneId: string): PbsAwardLeg => {
  const start = resolveStart(row);
  const end = resolveEnd(row);
  const localStart = toBaseLocalDateTime(start, zoneId);
  const localEnd = toBaseLocalDateTime(end, zoneId);
  const creditMinutes = rowCreditMinutes(row);
  const equipment = normalizeText(row.fleet_seg);

  return {
    id: row.roster_id ?? row.publish_id ?? `${row.pairing_id ?? "activity"}-${row.flt_id ?? row.label ?? "leg"}`,
    dutySeq: row.duty_seq,
    segmentSeq: row.seg_seq,
    day: localStart?.date.slice(8, 10) ?? parseDateText(row.flt_dt)?.slice(8, 10) ?? "--",
    flightNumber: extractFlightNumber(row),
    deadhead: normalizeCode(row.assignment)?.includes("DH") ?? false,
    depAirport: normalizeText(row.dep_arp),
    arrAirport: normalizeText(row.arv_arp),
    depTime: localStart?.time ?? null,
    arrTime: localEnd?.time ?? null,
    blockMinutes: minutesBetween(start, end),
    creditMinutes,
    equipment,
    equipmentMissing: equipment === null,
  };
};

const sortRowsByStart = (rows: AwardRosterRow[]) =>
  [...rows].sort((left, right) => {
    const leftStart = resolveStart(left)?.timestampMs ?? 0;
    const rightStart = resolveStart(right)?.timestampMs ?? 0;

    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }

    return Number(left.roster_id ?? left.publish_id ?? 0) - Number(right.roster_id ?? right.publish_id ?? 0);
  });

const buildPairingItem = (
  pairingId: string,
  rows: AwardRosterRow[],
  matchedTierLookup: Map<string, string>,
  zoneId: string,
): PbsAwardItem | null => {
  const sortedRows = sortRowsByStart(rows);
  const starts = sortedRows.map(resolveStart).filter((value): value is ParsedDateTime => value !== null);
  const ends = sortedRows.map(resolveEnd).filter((value): value is ParsedDateTime => value !== null);
  const start = minByTimestamp(starts);
  const end = maxByTimestamp(ends) ?? start;
  const localStart = toBaseLocalDateTime(start, zoneId);
  const localEnd = toBaseLocalDateTime(end, zoneId);

  if (!start || !end || !localStart || !localEnd) {
    return null;
  }

  const firstRow = sortedRows[0]!;
  const legs = sortedRows.map((row) => buildLeg(row, zoneId));
  const creditResolution = resolvePairingCredit(sortedRows);
  const blockMinutes = sumNullableMinutes(legs.map((leg) => leg.blockMinutes));
  const pairingCode = normalizeText(firstRow.pairing_label) ?? normalizeText(firstRow.label) ?? `Pairing ${pairingId}`;
  const legEquipmentMissingReason = legs.some((leg) => leg.equipmentMissing) ? LEG_EQUIPMENT_MISSING : null;

  return {
    id: `pairing-${pairingId}`,
    type: "pairing",
    label: pairingCode,
    pairingId,
    pairingCode,
    assignment: normalizeText(firstRow.assignment),
    assignmentGroup: normalizeText(firstRow.assignment_group),
    startDate: localStart.date,
    endDate: localEnd.date,
    startTime: localStart.time,
    endTime: localEnd.time,
    base: normalizeText(firstRow.base),
    fleet: normalizeText(firstRow.fleet),
    position: resolvePairingPosition(sortedRows),
    matchedTier: matchedTierLookup.get(`pairing:${pairingId}`) ?? null,
    awardPriority: null,
    explanation: resolvePairingExplanation(sortedRows),
    creditMinutes: creditResolution.creditMinutes,
    creditMissingReason: creditResolution.missingReason,
    blockMinutes,
    tafbDays: firstRow.tafb_days == null ? null : Number.parseInt(String(firstRow.tafb_days), 10),
    legEquipmentMissingReason,
    legs,
  };
};

const buildDayOffItem = (
  date: string,
  rows: AwardRosterRow[],
  matchedTierLookup: Map<string, string>,
  zoneId: string,
): PbsAwardItem | null => {
  const firstRow = sortRowsByStart(rows)[0]!;
  const starts = rows.map(resolveStart).filter((value): value is ParsedDateTime => value !== null);
  const ends = rows.map(resolveEnd).filter((value): value is ParsedDateTime => value !== null);
  const start = minByTimestamp(starts);
  const end = maxByTimestamp(ends) ?? start;
  const localStart = toBaseLocalDateTime(start, zoneId);
  const localEnd = toBaseLocalDateTime(end, zoneId);

  if (!localStart || !localEnd) {
    return null;
  }

  return {
    id: `day-off-${date}`,
    type: "day_off",
    label: "Day Off",
    pairingId: null,
    pairingCode: null,
    assignment: normalizeText(firstRow.assignment),
    assignmentGroup: normalizeText(firstRow.assignment_group),
    startDate: localStart.date,
    endDate: localEnd.date,
    startTime: localStart.time,
    endTime: localEnd.time,
    base: normalizeText(firstRow.base),
    fleet: normalizeText(firstRow.fleet),
    position: null,
    matchedTier: matchedTierLookup.get(`day_off:${date}`) ?? null,
    awardPriority: null,
    explanation: null,
    creditMinutes: null,
    creditMissingReason: null,
    blockMinutes: null,
    tafbDays: null,
    legEquipmentMissingReason: null,
    legs: [],
  };
};

const buildActivityItem = (key: string, rows: AwardRosterRow[], zoneId: string): PbsAwardItem | null => {
  const sortedRows = sortRowsByStart(rows);
  const starts = sortedRows.map(resolveStart).filter((value): value is ParsedDateTime => value !== null);
  const ends = sortedRows.map(resolveEnd).filter((value): value is ParsedDateTime => value !== null);
  const start = minByTimestamp(starts);
  const end = maxByTimestamp(ends) ?? start;
  const localStart = toBaseLocalDateTime(start, zoneId);
  const localEnd = toBaseLocalDateTime(end, zoneId);

  if (!start || !end || !localStart || !localEnd) {
    return null;
  }

  const firstRow = sortedRows[0]!;
  const label = normalizeText(firstRow.label)
    ?? normalizeText(firstRow.assignment)
    ?? normalizeText(firstRow.assignment_group)
    ?? "Activity";

  return {
    id: `activity-${key}`,
    type: "activity",
    label,
    pairingId: null,
    pairingCode: null,
    assignment: normalizeText(firstRow.assignment),
    assignmentGroup: normalizeText(firstRow.assignment_group),
    startDate: localStart.date,
    endDate: localEnd.date,
    startTime: localStart.time,
    endTime: localEnd.time,
    base: normalizeText(firstRow.base),
    fleet: normalizeText(firstRow.fleet),
    position: normalizeText(firstRow.position),
    matchedTier: null,
    awardPriority: null,
    explanation: null,
    creditMinutes: sumNullableMinutes(sortedRows.map((row) =>
      parseNumericMinutes(row.sch_credit_minutes) ?? parseNumericMinutes(row.act_credit_minutes),
    )),
    creditMissingReason: null,
    blockMinutes: null,
    tafbDays: null,
    legEquipmentMissingReason: null,
    legs: [],
  };
};

const buildCalendarEvent = (item: PbsAwardItem): PbsAwardCalendarEvent => {
  const toneByType: Record<PbsAwardItemType, PbsAwardCalendarEvent["tone"]> = {
    pairing: "blue",
    day_off: "green",
    activity: "yellow",
  };

  return {
    id: item.id,
    type: item.type,
    label: item.type === "day_off" ? "DO" : item.label,
    startDate: item.startDate,
    endDate: item.endDate,
    startTime: item.startTime,
    endTime: item.endTime,
    tone: toneByType[item.type],
    readonly: true,
    sourceItemIds: [item.id],
    metadata: {
      pairingId: item.pairingId,
      pairingCode: item.pairingCode,
      matchedTier: item.matchedTier,
    },
  };
};

const resolveStableRowId = (row: AwardRosterRow): string =>
  row.roster_id
  ?? row.publish_id
  ?? [
    normalizeCode(row.assignment) ?? "ACTIVITY",
    parseDateText(row.flt_dt) ?? "NO_DATE",
    normalizeText(row.start_utc instanceof Date ? row.start_utc.toISOString() : row.start_utc) ?? "NO_START",
    normalizeText(row.end_utc instanceof Date ? row.end_utc.toISOString() : row.end_utc) ?? "NO_END",
  ].join("-");

const hasValidDateTimeParts = (value: ParsedDateTime): boolean => {
  if (!value.time || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !/^\d{4}$/.test(value.time)) {
    return false;
  }

  const year = Number.parseInt(value.date.slice(0, 4), 10);
  const monthIndex = Number.parseInt(value.date.slice(5, 7), 10) - 1;
  const day = Number.parseInt(value.date.slice(8, 10), 10);
  const hour = Number.parseInt(value.time.slice(0, 2), 10);
  const minute = Number.parseInt(value.time.slice(2), 10);

  return Math.floor(Date.UTC(year, monthIndex, day, hour, minute) / 60_000)
    === Math.floor(value.timestampMs / 60_000);
};

const resolveReliableCalendarInterval = (
  row: AwardRosterRow,
  zoneId: string,
): { start: ParsedDateTime; end: ParsedDateTime } | null => {
  if (!row.start_utc || !row.end_utc) {
    return null;
  }

  const start = parseDateTime(row.start_utc);
  const end = parseDateTime(row.end_utc);

  if (
    !start
    || !end
    || !hasValidDateTimeParts(start)
    || !hasValidDateTimeParts(end)
    || end.timestampMs <= start.timestampMs
  ) {
    return null;
  }

  const localStart = toBaseLocalDateTime(start, zoneId);
  const localEnd = toBaseLocalDateTime(end, zoneId);

  if (!localStart?.time || !localEnd?.time) {
    return null;
  }

  return {
    start: localStart,
    end: localEnd,
  };
};

const toCalendarRunIdPart = (value: string): string =>
  value.replace(/[^A-Za-z0-9_-]+/g, "_");

const buildGroundCalendarEvents = (
  rows: AwardRosterRow[],
  items: PbsAwardItem[],
  zoneId: string,
): PbsAwardCalendarEvent[] => {
  const groundItems = items.filter((item) => item.type !== "pairing");
  const groundItemById = new Map(groundItems.map((item) => [item.id, item]));
  const rowsByOwnerItemId = new Map<string, Array<{
    identity: GroundRowIdentity;
    row: AwardRosterRow;
  }>>();

  for (const row of rows) {
    if (row.pairing_id) {
      continue;
    }

    const identity = resolveGroundRowIdentity(row, zoneId);

    if (!identity || !groundItemById.has(identity.itemId)) {
      continue;
    }

    const ownerRows = rowsByOwnerItemId.get(identity.itemId) ?? [];

    ownerRows.push({ identity, row });
    rowsByOwnerItemId.set(identity.itemId, ownerRows);
  }

  const candidates: GroundCalendarCandidate[] = [];
  const fallbackEvents: PbsAwardCalendarEvent[] = [];

  for (const item of groundItems) {
    const ownerRows = rowsByOwnerItemId.get(item.id) ?? [];
    const intervals = ownerRows.map(({ row }) => resolveReliableCalendarInterval(row, zoneId));

    if (ownerRows.length === 0 || intervals.some((interval) => interval === null)) {
      fallbackEvents.push(buildCalendarEvent(item));
      continue;
    }

    const event = buildCalendarEvent(item);

    ownerRows.forEach(({ identity, row }, index) => {
      const interval = intervals[index]!;

      candidates.push({
        ownerItemId: item.id,
        sourceId: resolveStableRowId(row),
        runKey: identity.runKey,
        event,
        start: interval!.start,
        end: interval!.end,
      });
    });
  }

  const candidatesByRunKey = new Map<string, GroundCalendarCandidate[]>();

  for (const candidate of candidates) {
    const runCandidates = candidatesByRunKey.get(candidate.runKey) ?? [];

    runCandidates.push(candidate);
    candidatesByRunKey.set(candidate.runKey, runCandidates);
  }

  const mergedEvents: PbsAwardCalendarEvent[] = [];

  for (const [runKey, runCandidates] of candidatesByRunKey) {
    const sortedCandidates = [...runCandidates].sort((left, right) =>
      left.start.timestampMs - right.start.timestampMs
      || left.end.timestampMs - right.end.timestampMs
      || left.sourceId.localeCompare(right.sourceId));
    let currentRun: GroundCalendarCandidate & {
      candidateCount: number;
      ownerItemIds: Set<string>;
    } | null = null;

    const finishCurrentRun = () => {
      if (!currentRun) {
        return;
      }

      const keepOriginalId = currentRun.candidateCount === 1
        && currentRun.ownerItemIds.size === 1;
      const id = keepOriginalId
        ? currentRun.event.id
        : [
            "calendar",
            currentRun.event.type,
            toCalendarRunIdPart(runKey.split(":").slice(1).join(":")),
            `${currentRun.start.date}T${currentRun.start.time}`,
            `${currentRun.end.date}T${currentRun.end.time}`,
            toCalendarRunIdPart(currentRun.sourceId),
          ].join("-");

      mergedEvents.push({
        ...currentRun.event,
        id,
        startDate: currentRun.start.date,
        endDate: currentRun.end.date,
        startTime: currentRun.start.time,
        endTime: currentRun.end.time,
        sourceItemIds: Array.from(currentRun.ownerItemIds),
      });
    };

    for (const candidate of sortedCandidates) {
      if (
        !currentRun
        || candidate.start.timestampMs - currentRun.end.timestampMs
          > GROUND_CALENDAR_CONTIGUITY_TOLERANCE_MS
      ) {
        finishCurrentRun();
        currentRun = {
          ...candidate,
          candidateCount: 1,
          ownerItemIds: new Set([candidate.ownerItemId]),
        };
        continue;
      }

      currentRun.candidateCount += 1;
      currentRun.ownerItemIds.add(candidate.ownerItemId);

      if (candidate.end.timestampMs > currentRun.end.timestampMs) {
        currentRun.end = candidate.end;
      }
    }

    finishCurrentRun();
  }

  return [...fallbackEvents, ...mergedEvents];
};

const buildCalendarEvents = (
  rows: AwardRosterRow[],
  items: PbsAwardItem[],
  zoneId: string,
): PbsAwardCalendarEvent[] =>
  [
    ...items.filter((item) => item.type === "pairing").map(buildCalendarEvent),
    ...buildGroundCalendarEvents(rows, items, zoneId),
  ].sort((left, right) =>
    left.startDate.localeCompare(right.startDate)
    || (left.startTime ?? "9999").localeCompare(right.startTime ?? "9999")
    || left.id.localeCompare(right.id));

const groupRosterRows = (
  rows: AwardRosterRow[],
  matchedTierLookup: Map<string, string>,
  zoneId: string,
  periodBounds: PeriodBounds | null,
) => {
  const pairingRows = new Map<string, AwardRosterRow[]>();
  const dayOffRows = new Map<string, AwardRosterRow[]>();
  const activityRows = new Map<string, AwardRosterRow[]>();

  for (const row of rows) {
    if (row.pairing_id) {
      const currentRows = pairingRows.get(row.pairing_id) ?? [];
      currentRows.push(row);
      pairingRows.set(row.pairing_id, currentRows);
      continue;
    }

    const identity = resolveGroundRowIdentity(row, zoneId);

    if (!identity) {
      continue;
    }

    if (identity.type === "day_off") {
      const currentRows = dayOffRows.get(identity.groupKey) ?? [];
      currentRows.push(row);
      dayOffRows.set(identity.groupKey, currentRows);
      continue;
    }

    const currentRows = activityRows.get(identity.groupKey) ?? [];

    currentRows.push(row);
    activityRows.set(identity.groupKey, currentRows);
  }

  const items = [
    ...Array.from(pairingRows.entries()).map(([pairingId, groupedRows]) =>
      buildPairingItem(pairingId, groupedRows, matchedTierLookup, zoneId),
    ),
    ...Array.from(dayOffRows.entries()).map(([date, groupedRows]) =>
      buildDayOffItem(date, groupedRows, matchedTierLookup, zoneId),
    ),
    ...Array.from(activityRows.entries()).map(([key, groupedRows]) =>
      buildActivityItem(key, groupedRows, zoneId),
    ),
  ].filter((item): item is PbsAwardItem => item !== null)
    .filter((item) => itemOverlapsPeriod(item, periodBounds))
    .sort((left, right) => {
      if (left.startDate !== right.startDate) {
        return left.startDate.localeCompare(right.startDate);
      }

      return (left.startTime ?? "9999").localeCompare(right.startTime ?? "9999");
    });

  return items;
};

const resolveAwardTier = (awardRows: AwardResultRow[]): string | null => {
  for (const row of awardRows) {
    const tier = toTierLabel(row.awarded_tier);

    if (tier) {
      return tier;
    }
  }

  return null;
};

const buildReasonReportItems = (items: PbsAwardItem[]): PbsAwardReasonReportItem[] =>
  items
    .filter(
      (item): item is PbsAwardItem & {
        pairingId: string;
        explanation: string;
      } =>
        item.type === "pairing"
        && item.pairingId !== null
        && item.explanation !== null,
    )
    .map((item) => ({
      id: item.id,
      kind: "awarded_pairing" as const,
      pairingId: item.pairingId,
      pairingCode:
        item.pairingCode === `Pairing ${item.pairingId}`
          ? item.pairingId
          : item.pairingCode ?? item.pairingId,
      startDate: item.startDate,
      endDate: item.endDate,
      explanation: item.explanation,
    }))
    .sort((left, right) =>
      left.startDate.localeCompare(right.startDate)
      || left.pairingCode.localeCompare(right.pairingCode)
      || left.pairingId.localeCompare(right.pairingId)
      || left.id.localeCompare(right.id));

export const buildAwardCurrentResponse = ({
  periodCode,
  rosterPeriodId = null,
  currentPeriod,
  rosterRows,
  awardRows,
  timeZone = DEFAULT_TIME_ZONE,
  availability = "AVAILABLE",
  awardPublishAt = null,
  awardFinalAt = null,
  misAwardDeadlineAt = null,
  lifecycleStage,
  upcomingPeriod = null,
  firstPublishedAt = null,
  latestPublishedAt = null,
  rpStart = null,
  rpEnd = null,
}: {
  periodCode: string;
  rosterPeriodId?: number | null;
  currentPeriod?: PbsCurrentPeriod;
  rosterRows: AwardRosterRow[];
  awardRows: AwardResultRow[];
  timeZone?: PbsAwardTimeZoneInfo;
  availability?: PbsAwardCurrentResponse["availability"];
  awardPublishAt?: string | null;
  awardFinalAt?: string | null;
  misAwardDeadlineAt?: string | null;
  lifecycleStage?: PbsAwardCurrentResponse["lifecycleStage"];
  upcomingPeriod?: PbsAwardCurrentResponse["upcomingPeriod"];
  firstPublishedAt?: string | null;
  latestPublishedAt?: string | null;
  rpStart?: string | null;
  rpEnd?: string | null;
}): PbsAwardCurrentResponse => {
  const matchedTierLookup = buildMatchedTierLookup(awardRows);
  const periodBounds = parsePeriodBounds(rpStart, rpEnd);
  const items = groupRosterRows(rosterRows, matchedTierLookup, timeZone.zoneId, periodBounds);
  const creditMissingReasons = uniqueNormalizedValues(items.map((item) => item.creditMissingReason ?? null));
  const creditMinutes = creditMissingReasons.length > 0 ? null : sumNullableMinutes(items.map((item) => item.creditMinutes));
  const hasRosterRowsWithoutCredit = items.length > 0 && creditMinutes === null && creditMissingReasons.length === 0;
  const warnings = creditMissingReasons.length > 0
    ? creditMissingReasons
    : hasRosterRowsWithoutCredit
    ? ["Roster credit minutes are not available for this award period."]
    : [];
  const reasonReportItems = buildReasonReportItems(items);
  const reasonReportAvailable = reasonReportItems.length > 0;

  return {
    currentPeriod,
    rosterPeriodId,
    periodCode,
    published: availability === "AVAILABLE",
    availability,
    lifecycleStage,
    upcomingPeriod,
    rpStart,
    rpEnd,
    awardPublishAt,
    awardFinalAt,
    misAwardDeadlineAt,
    firstPublishedAt,
    latestPublishedAt,
    timeZone,
    summary: {
      tier: resolveAwardTier(awardRows),
      offDays: items.filter((item) => item.type === "day_off").length,
      creditMinutes,
      premiumMinutes: null,
      pairingCount: items.filter((item) => item.type === "pairing").length,
      activityCount: items.filter((item) => item.type === "activity").length,
      warnings,
    },
    calendar: {
      monthLabel: periodCode.toUpperCase(),
      weekdayLabels: WEEKDAY_LABELS,
      events: buildCalendarEvents(rosterRows, items, timeZone.zoneId),
    },
    items,
    reasonReport: {
      available: reasonReportAvailable,
      ...(reasonReportAvailable ? {} : { disabledReason: REASON_REPORT_UNAVAILABLE }),
      items: reasonReportItems,
    },
  };
};
