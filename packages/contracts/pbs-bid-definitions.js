const CLOCK_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DURATION_PATTERN = /^(\d{1,3}):([0-5]\d)$/;

export const pbsBidDefinitionCodes = Object.freeze({
  redeyeParent: "PBS_PAIRING_REDEYE_CONFIG",
  redeyeStartTime: "START_TIME",
  redeyeEndTime: "END_TIME",
  weekendParent: "PBS_PREFER_OFF",
  weekendStartDay: "WEEKEND_START_DOW",
  weekendStartTime: "WEEKEND_START_TIME",
  weekendEndDay: "WEEKEND_END_DOW",
  weekendEndTime: "WEEKEND_END_TIME",
  creditWindowParent: "PBS_LINE_CREDIT_WINDOW_CONFIG",
  creditWindowDeltaHours: "DELTA_HOURS",
  minimumBaseLayoverParent: "SYS_PARAM",
  minimumBaseLayoverDuration: "PBS_LINE_MINIMUM_BASE_LAYOVER",
  minimumTimeBetweenFlightsParent: "SYS_PARAM",
  minimumTimeBetweenFlightsMinutes: "PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES",
  efficientFlyingParent: "PBS_EFFICIENT_FLYING_CONFIG",
  efficientFlyingPercentile: "PERCENTILE",
});

export const parsePbsMinimumTimeBetweenFlightsDefinition = (input) => {
  const rawMinimumMinutes = input?.minimumMinutes;
  const normalized = typeof rawMinimumMinutes === "string" ? rawMinimumMinutes.trim() : rawMinimumMinutes;

  if (
    (typeof normalized === "string" && !/^\d+$/.test(normalized))
    || (typeof normalized !== "string" && typeof normalized !== "number")
  ) {
    return { available: false };
  }

  const minimumMinutes = Number(normalized);
  return Number.isSafeInteger(minimumMinutes) && minimumMinutes >= 1 && minimumMinutes <= 59_999
    ? { available: true, minimumMinutes }
    : { available: false };
};

export const formatPbsMinimumTimeBetweenFlightsDefinition = (definition) => {
  if (!definition?.available) {
    return "Unavailable";
  }

  const hours = Math.floor(definition.minimumMinutes / 60);
  const minutes = definition.minimumMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} minimum`;
};

export const parsePbsEfficientFlyingPercentileDefinition = (input) => {
  const rawPercentile = input?.percentile;
  const normalized = typeof rawPercentile === "string" ? rawPercentile.trim() : rawPercentile;

  if (
    (typeof normalized === "string" && !/^\d+$/.test(normalized))
    || (typeof normalized !== "string" && typeof normalized !== "number")
  ) {
    return { available: false };
  }

  const percentile = Number(normalized);
  return Number.isSafeInteger(percentile) && percentile >= 1 && percentile <= 50
    ? { available: true, percentile }
    : { available: false };
};

export const formatPbsEfficientFlyingPercentileDefinition = (definition) =>
  definition?.available ? `${definition.percentile}%` : "Unavailable";

export const parsePbsMinimumBaseLayoverDefinition = (input) => {
  const rawDuration = String(input?.minDuration ?? "").trim();
  const match = rawDuration.match(DURATION_PATTERN);

  if (!match) {
    return { available: false };
  }

  const hours = Number.parseInt(match[1] ?? "", 10);
  const minutes = Number.parseInt(match[2] ?? "", 10);
  if (hours * 60 + minutes <= 0) {
    return { available: false };
  }

  return {
    available: true,
    minDuration: `${String(hours).padStart(3, "0")}:${String(minutes).padStart(2, "0")}`,
  };
};

export const formatPbsMinimumBaseLayoverDefinition = (definition) => {
  if (!definition?.available) {
    return "Unavailable";
  }

  const match = definition.minDuration.match(DURATION_PATTERN);
  return match ? `${Number.parseInt(match[1] ?? "0", 10)}:${match[2]} minimum` : "Unavailable";
};

export const parsePbsRedeyeDefinition = (input) => {
  const startTime = String(input?.startTime ?? "").trim();
  const endTime = String(input?.endTime ?? "").trim();

  if (!CLOCK_TIME_PATTERN.test(startTime) || !CLOCK_TIME_PATTERN.test(endTime) || startTime === endTime) {
    return { available: false };
  }

  return {
    available: true,
    startTime,
    endTime,
    crossesMidnight: endTime < startTime,
    version: `${startTime}|${endTime}`,
  };
};

export const formatPbsRedeyeDefinition = (definition) => definition?.available
  ? `${definition.startTime}–${definition.endTime} local time${definition.crossesMidnight ? " · Crosses midnight" : ""}`
  : "Unavailable";

export const getPbsWeekendDurationMinutes = ({
  endDayIso,
  endTime,
  startDayIso,
  startTime,
}) => {
  if (
    !Number.isInteger(startDayIso)
    || startDayIso < 1
    || startDayIso > 7
    || !Number.isInteger(endDayIso)
    || endDayIso < 1
    || endDayIso > 7
    || !CLOCK_TIME_PATTERN.test(startTime)
    || !(CLOCK_TIME_PATTERN.test(endTime) || endTime === "24:00")
  ) {
    return null;
  }

  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const start = (startDayIso - 1) * 1440 + startHour * 60 + startMinute;
  const normalizedEnd = (endDayIso - 1) * 1440 + endHour * 60 + endMinute;
  const duration = (normalizedEnd - start + 10080) % 10080;

  return duration > 0 ? duration : null;
};

export const formatPbsWeekendDefinition = (definition) => definition?.available
  ? `${definition.startDayName} ${definition.startTime} – ${definition.endDayName} ${definition.endTime}`
  : "Unavailable";
