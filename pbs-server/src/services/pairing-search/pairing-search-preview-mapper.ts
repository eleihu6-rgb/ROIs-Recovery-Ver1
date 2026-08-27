import type { PbsSearchPairingsResult } from "../../../../packages/contracts/pbs-search-pairings.js";

export type PairingSummaryRow = {
  id: string;
  pairing_label: string | null;
  base: string;
  base_zone_id: string | null;
  pairing_start_utc: Date | string | null;
  composition_label: string | null;
  division: string;
  duration_days: number;
  duty_count: number;
  fleet: string;
  active_start_date: string | null;
  report_start_utc: Date | string | null;
  release_end_utc: Date | string | null;
};

export type PairingSegmentRow = {
  pairing_id: string;
  duty_seq: number;
  seg_seq: number;
  flt_num: string | null;
  airline: string | null;
  dep_arp: string;
  arv_arp: string;
  duty_start_utc: Date | string | null;
  duty_end_utc: Date | string | null;
  duty_assignment: string | null;
  duty_acc_state: string | null;
  duty_ref_tz: number | null;
  duty_etr_tz: number | null;
  duty_layover_nits: number | null;
  duty_sch_dp_min: string | null;
  duty_act_dp_min: string | null;
  duty_sch_rest_min: string | null;
  duty_act_rest_min: string | null;
  pickup_start_utc: Date | string | null;
  pickup_end_utc: Date | string | null;
  brief_start_utc: Date | string | null;
  brief_end_utc: Date | string | null;
  debrief_start_utc: Date | string | null;
  debrief_end_utc: Date | string | null;
  dropoff_start_utc: Date | string | null;
  dropoff_end_utc: Date | string | null;
  sch_str_dt_utc: Date | string;
  sch_end_dt_utc: Date | string;
  act_str_dt_utc: Date | string | null;
  act_end_dt_utc: Date | string | null;
  fleet_seg: string | null;
  seg_assignment: string | null;
  duty_sch_fdp_min: string | null;
  duty_act_fdp_min: string | null;
  duty_sch_flt_min: string | null;
  duty_act_flt_min: string | null;
  duty_sch_duty_min: string | null;
  duty_act_duty_min: string | null;
  duty_sch_credited_minutes: string | null;
  duty_act_credited_minutes: string | null;
  act_credited_minutes_seg: string | null;
};

const UTC_TIMESTAMP_SQL_FORMAT = `YYYY-MM-DD"T"HH24:MI:SS.MS"Z"`;
const MS_PER_DAY = 86_400_000;
const TIMESTAMP_WITHOUT_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/;

export const formatUtcTimestampSql = (expression: string) =>
  `to_char(${expression}, '${UTC_TIMESTAMP_SQL_FORMAT}')`;

const toDate = (value: Date | string | null) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const trimmedValue = value.trim();
  const normalizedValue = TIMESTAMP_WITHOUT_ZONE_PATTERN.test(trimmedValue)
    ? `${trimmedValue.replace(" ", "T")}Z`
    : trimmedValue;
  const date = new Date(normalizedValue);

  return Number.isNaN(date.getTime()) ? null : date;
};

type ZoneDateTimeParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

const dateTimePartsFormatterByZone = new Map<string, Intl.DateTimeFormat>();

const getDateTimePartsFormatter = (zoneId: string): Intl.DateTimeFormat => {
  const normalizedZoneId = zoneId.trim();

  if (!normalizedZoneId) {
    throw new Error("Pairing base timezone is required.");
  }
  const cachedFormatter = dateTimePartsFormatterByZone.get(normalizedZoneId);

  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizedZoneId,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  dateTimePartsFormatterByZone.set(normalizedZoneId, formatter);
  return formatter;
};

const getZoneDateTimeParts = (
  date: Date,
  zoneId: string,
): ZoneDateTimeParts => {
  const values: Partial<ZoneDateTimeParts> = {};

  for (const part of getDateTimePartsFormatter(zoneId).formatToParts(date)) {
    if (part.type !== "literal") {
      values[part.type as keyof ZoneDateTimeParts] = part.value;
    }
  }

  return {
    year: values.year ?? "0000",
    month: values.month ?? "00",
    day: values.day ?? "00",
    hour: values.hour ?? "00",
    minute: values.minute ?? "00",
    second: values.second ?? "00",
  };
};

const getPairingZoneId = (pairing: PairingSummaryRow) => {
  const zoneId = pairing.base_zone_id?.trim();

  if (!zoneId) {
    throw new Error(`Pairing ${pairing.id} base timezone is required.`);
  }

  return zoneId;
};

const formatClock = (value: Date | string | null, zoneId: string) => {
  const date = toDate(value);

  if (!date) {
    return "0000";
  }

  const parts = getZoneDateTimeParts(date, zoneId);
  return `${parts.hour}${parts.minute}`;
};

const formatMinutesAsHhmm = (minutes: number) => {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}${String(remainder).padStart(2, "0")}`;
};

const formatMinutesAsDuration = (minutes: number) => {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return `${hours}:${String(remainder).padStart(2, "0")}`;
};

const formatPositiveMinutesAsDuration = (minutes: number | null) =>
  minutes !== null && minutes > 0 ? formatMinutesAsDuration(minutes) : "";

const formatNullableMinutesAsHhmm = (value: string | null) => {
  if (value === null) {
    return "--";
  }

  const minutes = Number.parseFloat(value);
  return Number.isNaN(minutes) ? "--" : formatMinutesAsHhmm(minutes);
};

const coalesceMinutes = (...values: Array<string | null>) =>
  values.find((value) => value !== null) ?? null;

const parseNullableMinutes = (value: string | null) => {
  if (value === null) {
    return null;
  }

  const minutes = Number.parseFloat(value);
  return Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : null;
};

const formatNullableMinutesAsDuration = (value: string | null) => {
  const minutes = parseNullableMinutes(value);
  return minutes === null ? "" : formatMinutesAsDuration(minutes);
};

const formatClockOrEmpty = (value: Date | string | null, zoneId: string) => {
  const date = toDate(value);

  if (!date) {
    return "";
  }

  const parts = getZoneDateTimeParts(date, zoneId);
  return `${parts.hour}:${parts.minute}`;
};

const normalizeCode = (value: string | null | undefined) =>
  value?.trim().toUpperCase() ?? "";

const formatSegmentQual = (segment: PairingSegmentRow) => {
  const assignment = normalizeCode(
    segment.seg_assignment || segment.duty_assignment,
  );

  if (assignment === "FLT") {
    return "";
  }

  return assignment;
};

const formatDutyLabel = (
  segment: PairingSegmentRow,
  isLastLegOfDuty: boolean,
) => {
  if (!isLastLegOfDuty) {
    return "";
  }

  const labelParts: string[] = [];
  const dutyFdp = formatNullableMinutesAsDuration(segment.duty_sch_fdp_min);
  const dutyDp = formatNullableMinutesAsDuration(segment.duty_sch_dp_min);

  if (segment.duty_layover_nits) {
    labelParts.push(`LO ${segment.duty_layover_nits}`);
  }

  if (dutyFdp) {
    labelParts.push(`FDP ${dutyFdp}`);
  }

  if (dutyDp) {
    labelParts.push(`DP ${dutyDp}`);
  }

  if (segment.duty_etr_tz != null) {
    labelParts.push(`ETRTZ ${segment.duty_etr_tz}`);
  }

  return labelParts.join(" · ");
};

const formatRestPair = (
  segment: PairingSegmentRow,
  isLastLegOfDuty: boolean,
) => {
  if (!isLastLegOfDuty) {
    return "";
  }

  const scheduledRest = formatNullableMinutesAsDuration(
    segment.duty_sch_rest_min,
  );
  const actualRest = formatNullableMinutesAsDuration(segment.duty_act_rest_min);

  if (scheduledRest && actualRest) {
    return `${scheduledRest}|${actualRest}`;
  }

  return scheduledRest || actualRest;
};

const formatDateAsIso = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const summaryDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const formatIsoSummaryDateLabel = (value: string) => {
  const date = parseIsoDate(value);
  return date ? summaryDateFormatter.format(date) : "";
};

const addUtcDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
};

const getUtcDateOnlyTime = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

const diffUtcDays = (left: Date, right: Date) =>
  Math.round(
    (getUtcDateOnlyTime(left) - getUtcDateOnlyTime(right)) / MS_PER_DAY,
  );

const diffIsoDays = (left: string, right: string) => {
  const leftDate = parseIsoDate(left);
  const rightDate = parseIsoDate(right);

  if (!leftDate || !rightDate) {
    return 0;
  }

  return diffUtcDays(leftDate, rightDate);
};

const addIsoDays = (value: string, days: number) => {
  const date = parseIsoDate(value);
  return date ? formatDateAsIso(addUtcDays(date, days)) : value;
};

const formatZoneIsoDate = (value: Date | string | null, zoneId: string) => {
  const date = toDate(value);

  if (!date) {
    return null;
  }

  const parts = getZoneDateTimeParts(date, zoneId);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const formatIsoDateAsMmdd = (value: string) =>
  value.slice(5, 7) + value.slice(8, 10);

const formatDutyDate = (value: Date | string | null, zoneId: string) => {
  const localDate = formatZoneIsoDate(value, zoneId);

  if (!localDate) {
    return "";
  }

  return formatIsoDateAsMmdd(localDate);
};

type DutyCoverage = {
  start: Date;
  end: Date | null;
};

const collectDutyCoverageDates = (
  segments: PairingSegmentRow[],
  zoneId: string,
) => {
  const coveragesByDutySeq = new Map<number, DutyCoverage>();

  for (const segment of segments) {
    const start = toDate(segment.duty_start_utc ?? segment.sch_str_dt_utc);
    const end = toDate(segment.duty_end_utc ?? segment.sch_end_dt_utc);

    if (!start) {
      continue;
    }

    const existing = coveragesByDutySeq.get(segment.duty_seq);

    if (!existing) {
      coveragesByDutySeq.set(segment.duty_seq, { start, end });
      continue;
    }

    if (start.getTime() < existing.start.getTime()) {
      existing.start = start;
    }

    if (end && (!existing.end || end.getTime() > existing.end.getTime())) {
      existing.end = end;
    }
  }

  const dates = new Set<string>();
  const coverages = Array.from(coveragesByDutySeq.values()).sort(
    (left, right) => left.start.getTime() - right.start.getTime(),
  );

  for (const coverage of coverages) {
    const startDate = formatZoneIsoDate(coverage.start, zoneId);
    const endDate = formatZoneIsoDate(coverage.end ?? coverage.start, zoneId);

    if (!startDate || !endDate) {
      continue;
    }

    const dayCount = Math.max(0, diffIsoDays(endDate, startDate));

    for (let index = 0; index <= dayCount; index += 1) {
      dates.add(addIsoDays(startDate, index));
    }
  }

  return Array.from(dates).sort();
};

const buildDutyDateContext = (
  pairing: PairingSummaryRow,
  segments: PairingSegmentRow[],
) => {
  const zoneId = getPairingZoneId(pairing);
  const coverageDates = collectDutyCoverageDates(segments, zoneId);
  const activeDates =
    coverageDates.length > 0
      ? coverageDates
      : pairing.active_start_date
        ? [pairing.active_start_date]
        : [];

  return {
    activeDates,
    zoneId,
  };
};

export const mapPairingResult = (
  pairing: PairingSummaryRow,
  segments: PairingSegmentRow[],
): PbsSearchPairingsResult => {
  const dutyDateContext = buildDutyDateContext(pairing, segments);
  const { activeDates, zoneId } = dutyDateContext;

  let totalBlockMinutes = 0;
  const dpMinutesByDutySeq = new Map<number, number>();
  const creditMinutesByDutySeq = new Map<number, number>();
  const seenDutySeqs = new Set<number>();

  const legs = segments.map((segment, index) => {
    const start = toDate(segment.sch_str_dt_utc);
    const end = toDate(segment.sch_end_dt_utc);
    const blockMinutes =
      start && end
        ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
        : 0;

    totalBlockMinutes += blockMinutes;

    const isFirstLegOfDuty = !seenDutySeqs.has(segment.duty_seq);
    seenDutySeqs.add(segment.duty_seq);
    if (isFirstLegOfDuty) {
      creditMinutesByDutySeq.set(
        segment.duty_seq,
        parseNullableMinutes(segment.duty_act_credited_minutes) ?? 0,
      );
      dpMinutesByDutySeq.set(
        segment.duty_seq,
        parseNullableMinutes(segment.duty_sch_dp_min) ?? 0,
      );
    }

    const nextSegment = segments[index + 1];
    const isLastLegOfDuty =
      !nextSegment || nextSegment.duty_seq !== segment.duty_seq;
    const nextStart =
      nextSegment && nextSegment.duty_seq === segment.duty_seq
        ? toDate(nextSegment.sch_str_dt_utc)
        : null;
    const groundMinutes =
      nextStart && end
        ? Math.max(0, Math.round((nextStart.getTime() - end.getTime()) / 60000))
        : null;
    const actualStart = toDate(segment.act_str_dt_utc);
    const actualEnd = toDate(segment.act_end_dt_utc);
    const flightMinutes =
      actualStart && actualEnd
        ? Math.max(
            0,
            Math.round((actualEnd.getTime() - actualStart.getTime()) / 60000),
          )
        : null;
    const dutyFdp = coalesceMinutes(
      segment.duty_sch_fdp_min,
      segment.duty_act_fdp_min,
    );
    const dutyFlyingHour = coalesceMinutes(
      segment.duty_sch_flt_min,
      segment.duty_act_flt_min,
    );
    const dutyHour = coalesceMinutes(
      segment.duty_sch_duty_min,
      segment.duty_act_duty_min,
    );
    const dutyCredit = coalesceMinutes(
      segment.duty_sch_credited_minutes,
      segment.duty_act_credited_minutes,
    );
    const blockDuration = formatPositiveMinutesAsDuration(blockMinutes);

    return {
      id: `${pairing.id}-${segment.duty_seq}-${segment.seg_seq}`,
      day: segment.duty_seq,
      dutyDate: isFirstLegOfDuty
        ? formatDutyDate(
            segment.duty_start_utc ?? segment.sch_str_dt_utc,
            zoneId,
          )
        : "",
      dutyFdp: isFirstLegOfDuty ? formatNullableMinutesAsHhmm(dutyFdp) : "",
      dutyFlyingHour: isFirstLegOfDuty
        ? formatNullableMinutesAsHhmm(dutyFlyingHour)
        : "",
      dutyHour: isFirstLegOfDuty ? formatNullableMinutesAsHhmm(dutyHour) : "",
      dutyCredit: isFirstLegOfDuty
        ? formatNullableMinutesAsHhmm(dutyCredit)
        : "",
      flightNumber: segment.flt_num ?? "—",
      departureStation: segment.dep_arp,
      arrivalStation: segment.arv_arp,
      departureTime: formatClock(segment.sch_str_dt_utc, zoneId),
      arrivalTime: formatClock(segment.sch_end_dt_utc, zoneId),
      blockTime: formatMinutesAsHhmm(blockMinutes),
      equipment: segment.fleet_seg ?? pairing.fleet,
      ganttQual: formatSegmentQual(segment),
      ganttAirline: normalizeCode(segment.airline),
      ganttFlight: segment.flt_num ?? "—",
      ganttFleet: segment.fleet_seg ?? pairing.fleet,
      ganttAcc: normalizeCode(segment.duty_acc_state),
      ganttRef: segment.duty_ref_tz == null ? "" : String(segment.duty_ref_tz),
      ganttDep: segment.dep_arp,
      ganttPickup: isFirstLegOfDuty
        ? formatClockOrEmpty(segment.pickup_start_utc, zoneId)
        : "",
      ganttReport: isFirstLegOfDuty
        ? formatClockOrEmpty(segment.brief_start_utc, zoneId)
        : "",
      ganttStd: formatClockOrEmpty(segment.sch_str_dt_utc, zoneId),
      ganttAtd: formatClockOrEmpty(segment.act_str_dt_utc, zoneId),
      ganttArr: segment.arv_arp,
      ganttSta: formatClockOrEmpty(segment.sch_end_dt_utc, zoneId),
      ganttAta: formatClockOrEmpty(segment.act_end_dt_utc, zoneId),
      ganttDropoff: isLastLegOfDuty
        ? formatClockOrEmpty(segment.dropoff_end_utc, zoneId)
        : "",
      ganttGroundTime: formatPositiveMinutesAsDuration(groundMinutes),
      ganttBlockHour: blockDuration,
      ganttFlightTime: formatPositiveMinutesAsDuration(flightMinutes),
      ganttMinimumRest: formatRestPair(segment, isLastLegOfDuty),
      ganttDuty: formatDutyLabel(segment, isLastLegOfDuty),
    };
  });
  const totalCreditMinutes = [...creditMinutesByDutySeq.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const totalDpMinutes = [...dpMinutesByDutySeq.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const originDate = pairing.active_start_date
    ? pairing.active_start_date
    : (activeDates[0] ?? "");
  const endDate = activeDates.at(-1) ?? originDate;
  const routeStations = segments.reduce<string[]>((stations, segment) => {
    if (stations.length === 0) {
      stations.push(segment.dep_arp);
    } else if (stations.at(-1) !== segment.dep_arp) {
      stations.push(segment.dep_arp);
    }

    if (stations.at(-1) !== segment.arv_arp) {
      stations.push(segment.arv_arp);
    }

    return stations;
  }, []);

  return {
    id: pairing.id,
    pairingId: pairing.id,
    pairingNumber: pairing.pairing_label ?? pairing.id,
    base: pairing.base,
    originDate,
    endDate,
    startDateLabel: formatIsoSummaryDateLabel(originDate),
    endDateLabel: formatIsoSummaryDateLabel(endDate),
    compositionLabel: pairing.composition_label?.trim() ?? "",
    reportTime: formatClock(pairing.report_start_utc, zoneId),
    releaseTime: formatClock(pairing.release_end_utc, zoneId),
    durationDays: pairing.duration_days,
    routeLabel: routeStations.join("-"),
    priorityLabel: `P${pairing.duration_days}`,
    prioritySequence: String(pairing.duty_count).padStart(2, "0"),
    totalBlock: formatMinutesAsDuration(totalBlockMinutes),
    totalCredit: formatPositiveMinutesAsDuration(totalCreditMinutes),
    totalDp: formatPositiveMinutesAsDuration(totalDpMinutes),
    totalPay: formatPositiveMinutesAsDuration(totalCreditMinutes),
    legs,
    activeDates,
  };
};
