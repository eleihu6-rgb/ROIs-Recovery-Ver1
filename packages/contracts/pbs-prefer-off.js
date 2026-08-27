const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_RANGE_PATTERN = /^Between (\d{4}-\d{2}-\d{2}) - (\d{4}-\d{2}-\d{2})$/;
const WINDOW_PATTERN = /^Window (\d{2}:\d{2})-(\d{2}:\d{2})$/;
const toIsoDate = (date) => date.toISOString().slice(0, 10);

export const isValidIsoDate = (value) => {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && toIsoDate(date) === value;
};

const isValidClockTime = (value) => {
  const match = value.match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    return false;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
};

export const listPbsPeriodDates = (rangeStart, rangeEnd) => {
  if (!isValidIsoDate(rangeStart) || !isValidIsoDate(rangeEnd) || rangeStart > rangeEnd) {
    return [];
  }

  const dates = [];
  const cursor = new Date(`${rangeStart}T00:00:00.000Z`);
  const end = new Date(`${rangeEnd}T00:00:00.000Z`);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
};

export const parsePreferOffBidValues = (values, config) => {
  const specificDates = [];
  const weekdays = [];
  const ranges = [];
  const windows = [];
  const unknownValues = [];
  let weekendCount = 0;
  const weekdayNames = new Set((config?.weekdays ?? []).map((weekday) => weekday.name));

  for (const rawValue of values) {
    const value = rawValue.trim();
    const rangeMatch = value.match(DATE_RANGE_PATTERN);
    const windowMatch = value.match(WINDOW_PATTERN);

    if (isValidIsoDate(value)) {
      specificDates.push(value);
    } else if (rangeMatch && isValidIsoDate(rangeMatch[1]) && isValidIsoDate(rangeMatch[2])) {
      ranges.push({ from: rangeMatch[1], to: rangeMatch[2] });
    } else if (value === "Weekends") {
      weekendCount += 1;
    } else if (weekdayNames.has(value)) {
      weekdays.push(value);
    } else if (windowMatch) {
      windows.push({ from: windowMatch[1], to: windowMatch[2] });
    } else {
      unknownValues.push(value);
    }
  }

  const modeKinds = [
    specificDates.length > 0 ? "specific_dates" : null,
    ranges.length > 0 ? "date_range" : null,
    weekdays.length > 0 ? "days_of_week" : null,
    weekendCount > 0 ? "weekends" : null,
  ].filter(Boolean);
  const mode = modeKinds.length === 0
    ? "empty"
    : modeKinds.length === 1 && ranges.length <= 1 && weekendCount <= 1
      ? modeKinds[0]
      : "mixed";
  const timeWindow = windows.length === 1 ? windows[0] : null;
  const isTimeWindowValid = windows.length <= 1
    && (!timeWindow
      || (isValidClockTime(timeWindow.from)
        && isValidClockTime(timeWindow.to)
        && timeWindow.from < timeWindow.to));

  return {
    mode,
    specificDates: [...new Set(specificDates)].sort(),
    rangeFrom: ranges[0]?.from ?? "",
    rangeTo: ranges[0]?.to ?? "",
    weekdays: [...new Set(weekdays)],
    timeWindow,
    isTimeWindowValid,
    invalidValues: [
      ...unknownValues,
      ...(windows.length > 1 ? windows.slice(1).map((window) => `Window ${window.from}-${window.to}`) : []),
    ],
  };
};

const listDatesInRange = (from, to) => {
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) {
    return [];
  }

  const dates = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
};

const getIsoWeekday = (isoDate) => {
  const day = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
};

const addLocalMinutes = (date, time, minutes) => {
  const [hour, minute] = time.split(":").map(Number);
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCMinutes((hour * 60) + minute + minutes);
  return {
    date: toIsoDate(value),
    time: `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`,
  };
};

const listTouchedLocalDates = (startDate, startTime, endDate, endTime) => {
  const lastTouchedDate = endTime === "00:00"
    ? toIsoDate(new Date(new Date(`${endDate}T00:00:00.000Z`).getTime() - 1))
    : endDate;
  return listDatesInRange(startDate, lastTouchedDate);
};

export const expandPbsWeekendIntervals = (rangeStart, rangeEnd, config) => {
  const weekend = config?.weekend;
  const startDay = config?.weekdays.find((weekday) => weekday.code === weekend?.startDayCode)?.isoDay;
  const endDay = config?.weekdays.find((weekday) => weekday.code === weekend?.endDayCode)?.isoDay;
  const durationMinutes = weekend?.startTime && weekend?.endTime && startDay && endDay
    ? getPbsWeekendDurationMinutes({
        startDayIso: startDay,
        startTime: weekend.startTime,
        endDayIso: endDay,
        endTime: weekend.endTime,
      })
    : null;
  const periodDates = listPbsPeriodDates(rangeStart, rangeEnd);

  if (!weekend?.available || !startDay || !weekend.startTime || !durationMinutes || periodDates.length === 0) {
    return [];
  }

  const periodStart = periodDates[0];
  const periodEnd = periodDates.at(-1);
  const scanStart = new Date(`${periodStart}T00:00:00.000Z`);
  scanStart.setUTCDate(scanStart.getUTCDate() - 7);
  const scanDates = listDatesInRange(toIsoDate(scanStart), periodEnd);
  const periodDateSet = new Set(periodDates);
  const intervals = [];

  for (const anchorDate of scanDates) {
    if (getIsoWeekday(anchorDate) !== startDay) {
      continue;
    }

    const end = addLocalMinutes(anchorDate, weekend.startTime, durationMinutes);
    const touchedDates = listTouchedLocalDates(anchorDate, weekend.startTime, end.date, end.time)
      .filter((date) => periodDateSet.has(date));

    if (touchedDates.length === 0) {
      continue;
    }

    const startDate = anchorDate < periodStart ? periodStart : anchorDate;
    const startTime = anchorDate < periodStart ? "00:00" : weekend.startTime;
    const periodEndExclusive = addLocalMinutes(periodEnd, "00:00", 24 * 60);
    const endsAfterPeriod = end.date > periodEndExclusive.date
      || (end.date === periodEndExclusive.date && end.time > periodEndExclusive.time);

    intervals.push({
      anchorDate,
      startDate,
      startTime,
      endDate: endsAfterPeriod ? periodEndExclusive.date : end.date,
      endTime: endsAfterPeriod ? periodEndExclusive.time : end.time,
      dates: touchedDates,
    });
  }

  return intervals;
};

export const expandPreferOffBidValues = (values, rangeStart, rangeEnd, config) => {
  const parsed = parsePreferOffBidValues(values, config);
  const periodDates = listPbsPeriodDates(rangeStart, rangeEnd);
  const periodDateSet = new Set(periodDates);

  if (periodDates.length === 0) {
    return { ...parsed, dates: [], periodCount: 0, isValid: false, error: "invalid_period" };
  }

  if (!parsed.isTimeWindowValid || parsed.invalidValues.length > 0) {
    return { ...parsed, dates: [], periodCount: 0, isValid: false, error: "invalid_values" };
  }

  if (parsed.mode === "specific_dates") {
    const isInsidePeriod = parsed.specificDates.every((date) => periodDateSet.has(date));
    return {
      ...parsed,
      dates: parsed.specificDates,
      periodCount: parsed.specificDates.length,
      isValid: isInsidePeriod && parsed.specificDates.length > 0,
      error: isInsidePeriod ? null : "outside_period",
    };
  }

  if (parsed.mode === "date_range") {
    const dates = listDatesInRange(parsed.rangeFrom, parsed.rangeTo);
    const isInsidePeriod = dates.length > 0 && dates.every((date) => periodDateSet.has(date));
    return {
      ...parsed,
      dates,
      periodCount: dates.length,
      isValid: isInsidePeriod,
      error: isInsidePeriod ? null : "invalid_range",
    };
  }

  if (parsed.mode === "days_of_week") {
    const isoDays = new Set(parsed.weekdays.map((name) =>
      config?.weekdays.find((weekday) => weekday.name === name)?.isoDay).filter(Boolean));
    const dates = periodDates.filter((date) => isoDays.has(getIsoWeekday(date)));
    const isValid = isoDays.size === parsed.weekdays.length && dates.length > 0;
    return { ...parsed, dates, periodCount: dates.length, isValid, error: isValid ? null : "invalid_weekdays" };
  }

  if (parsed.mode === "weekends") {
    const intervals = expandPbsWeekendIntervals(rangeStart, rangeEnd, config);
    const dates = [...new Set(intervals.flatMap((interval) => interval.dates))].sort();
    const periodCount = intervals.length;
    const isValid = Boolean(config?.weekend.available) && periodCount > 0;
    return { ...parsed, dates, periodCount, isValid, error: isValid ? null : "weekend_unavailable" };
  }

  return { ...parsed, dates: [], periodCount: 0, isValid: false, error: parsed.mode };
};
import { getPbsWeekendDurationMinutes } from "./pbs-bid-definitions.js";
