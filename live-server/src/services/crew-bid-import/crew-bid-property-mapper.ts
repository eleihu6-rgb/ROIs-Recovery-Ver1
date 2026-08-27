import type {
  CrewBidImportIssue,
  CrewBidImportMappedCondition,
  CrewBidImportMappedPreference,
  CrewBidImportPairingReference,
  CrewBidImportPreferenceMapResult,
  ParsedCrewBidBlock,
  ParsedCrewBidPreference,
} from "./types.js";

type DateMappingResult =
  | { status: "ok"; isoDate: string }
  | { status: "invalid"; message: string };

type DateClauseResult =
  | {
      status: "ok";
      operator: "In" | "Between";
      paramA: string;
      paramB: string | null;
      warnings: CrewBidImportIssue[];
    }
  | {
      status: "failed";
      issues: CrewBidImportIssue[];
    };

type CriterionResult =
  | {
      status: "ok";
      condition: CrewBidImportMappedCondition;
      pairingReferences: CrewBidImportPairingReference[];
      warnings: CrewBidImportIssue[];
      preferenceJson?: Record<string, unknown> | null;
    }
  | {
      status: "failed";
      issues: CrewBidImportIssue[];
    };

type MapContext = {
  block: ParsedCrewBidBlock;
  preference: ParsedCrewBidPreference;
  targetPeriodCode: string;
  targetPeriodStartDate: string;
  targetPeriodEndDate: string;
};

const MONTH_LABEL_BY_INDEX = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const MONTH_INDEX_BY_LABEL = new Map(MONTH_LABEL_BY_INDEX.map((label, index) => [label.toUpperCase(), index]));
const DATE_PATTERN = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+\\d{1,2}(?:,\\s*\\d{4})?";
const DATE_REGEX = new RegExp(DATE_PATTERN, "gi");
const DAY_OF_WEEK_MAP = new Map([
  ["MONDAY", "MON"],
  ["MON", "MON"],
  ["TUESDAY", "TUE"],
  ["TUE", "TUE"],
  ["WEDNESDAY", "WED"],
  ["WED", "WED"],
  ["THURSDAY", "THU"],
  ["THU", "THU"],
  ["FRIDAY", "FRI"],
  ["FRI", "FRI"],
  ["SATURDAY", "SAT"],
  ["SAT", "SAT"],
  ["SUNDAY", "SUN"],
  ["SUN", "SUN"],
]);
const DAY_OF_WEEK_LABEL_BY_CODE = new Map([
  ["MON", "Monday"],
  ["TUE", "Tuesday"],
  ["WED", "Wednesday"],
  ["THU", "Thursday"],
  ["FRI", "Friday"],
  ["SAT", "Saturday"],
  ["SUN", "Sunday"],
]);

const emptySerialized = {
  operator: null,
  paramA: null,
  paramB: null,
  paramC: null,
};

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const buildIssue = (
  context: MapContext,
  severity: "warning" | "error",
  code: string,
  message: string,
): CrewBidImportIssue => ({
  crewId: context.block.crewId,
  category: context.block.category,
  bidContext: context.block.bidContext,
  sourceLineNumber: context.preference.sourceLineNumber,
  sourceSeq: context.preference.sourceSeq,
  severity,
  code,
  message,
  rawText: context.preference.rawText,
});

const normalizeOperator = (value: string) => {
  if (value === "<" || value === ">" || value === "=") {
    return value;
  }

  return "=";
};

const extractLimit = (text: string) => {
  const match = text.match(/\s+Limit\s+(\d+)\s*$/i);

  if (!match) {
    return {
      text,
      limitN: null,
    };
  }

  return {
    text: text.slice(0, match.index).trim(),
    limitN: Number.parseInt(match[1] ?? "", 10),
  };
};

const stripElseStartNextGroup = (context: MapContext, text: string) => {
  if (!/\s+Else Start Next Bid Group\s*$/i.test(text)) {
    return {
      text,
      warning: null,
    };
  }

  return {
    text: text.replace(/\s+Else Start Next Bid Group\s*$/i, "").trim(),
    warning: buildIssue(
      context,
      "warning",
      "else_start_next_group_ignored",
      "客户 bid 行包含 Else Start Next Bid Group；本次只导入第一个 Pairing Bid Group，因此该跳转语义已作为提示记录。",
    ),
  };
};

const stripAllOrNothing = (text: string) => {
  if (!/\s+All or Nothing\s*$/i.test(text)) {
    return {
      text,
      allOrNothing: null,
    };
  }

  return {
    text: text.replace(/\s+All or Nothing\s*$/i, "").trim(),
    allOrNothing: 1,
  };
};

const stripPreferenceModifiers = (context: MapContext, rawText: string) => {
  let text = rawText;
  let allOrNothing: number | null = null;
  const warnings: CrewBidImportIssue[] = [];

  for (let index = 0; index < 4; index += 1) {
    const allOrNothingResult = stripAllOrNothing(text);

    if (allOrNothingResult.allOrNothing !== null) {
      text = allOrNothingResult.text;
      allOrNothing = allOrNothingResult.allOrNothing;
      continue;
    }

    const elseResult = stripElseStartNextGroup(context, text);

    if (elseResult.warning) {
      text = elseResult.text;
      warnings.push(elseResult.warning);
      continue;
    }

    break;
  }

  return {
    text,
    allOrNothing,
    warnings,
  };
};

const toIsoDate = (year: number, monthIndex: number, day: number) => {
  const date = new Date(Date.UTC(year, monthIndex, day));
  const isoDate = date.toISOString().slice(0, 10);

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) {
    return null;
  }

  return isoDate;
};

const mapLegacyDateToTarget = (
  dateText: string,
  context: MapContext,
): DateMappingResult => {
  const match = dateText.trim().match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);

  if (!match) {
    return {
      status: "invalid",
      message: `Unsupported date format: ${dateText}.`,
    };
  }

  const sourceMonthIndex = MONTH_INDEX_BY_LABEL.get((match[1] ?? "").slice(0, 3).toUpperCase());
  const day = Number.parseInt(match[2] ?? "", 10);
  const explicitYear = match[3] ? Number.parseInt(match[3], 10) : null;
  const startYear = Number.parseInt(context.targetPeriodStartDate.slice(0, 4), 10);
  const endYear = Number.parseInt(context.targetPeriodEndDate.slice(0, 4), 10);

  if (
    sourceMonthIndex === undefined
    || Number.isNaN(day)
    || Number.isNaN(startYear)
    || Number.isNaN(endYear)
    || (explicitYear !== null && Number.isNaN(explicitYear))
  ) {
    return {
      status: "invalid",
      message: `Unsupported date format: ${dateText}.`,
    };
  }

  const candidateYears = explicitYear === null
    ? Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index)
    : [explicitYear];
  const matchingDates = candidateYears
    .map((year) => toIsoDate(year, sourceMonthIndex, day))
    .filter((isoDate): isoDate is string => Boolean(isoDate))
    .filter((isoDate) => isoDate >= context.targetPeriodStartDate && isoDate <= context.targetPeriodEndDate);

  if (matchingDates.length !== 1) {
    return {
      status: "invalid",
      message: `${dateText} is outside target period ${context.targetPeriodCode} (${context.targetPeriodStartDate} to ${context.targetPeriodEndDate}); source dates are not shifted.`,
    };
  }

  const isoDate = matchingDates[0];

  if (!isoDate) {
    return {
      status: "invalid",
      message: `${dateText} is not a valid calendar date.`,
    };
  }

  return {
    status: "ok",
    isoDate,
  };
};

const parseDateMatches = (value: string) => Array.from(value.matchAll(DATE_REGEX)).map((match) => match[0]);

const parseDaysOfWeek = (value: string) => {
  if (/^Weekends?$/i.test(value.trim())) {
    return ["SAT", "SUN"];
  }

  return Array.from(new Set(
    value
      .split(/[,\s]+/)
      .map((part) => DAY_OF_WEEK_MAP.get(part.trim().toUpperCase()))
      .filter((day): day is string => Boolean(day)),
  ));
};

const buildDateListParam = (dates: string[], daysOfWeek: string[]) =>
  JSON.stringify({
    dates,
    daysOfWeek,
  });

const buildPreferOffTagListParam = (dateClause: Extract<DateClauseResult, { status: "ok" }>) => {
  if (dateClause.operator === "Between") {
    return `Between ${dateClause.paramA} - ${dateClause.paramB ?? dateClause.paramA}`;
  }

  const parsed = parseDateListParam(dateClause.paramA);

  return [
    ...parsed.dates,
    ...parsed.daysOfWeek.map((day) => DAY_OF_WEEK_LABEL_BY_CODE.get(day) ?? day),
  ].join(",");
};

const parseDateClause = (
  context: MapContext,
  clause: string,
): DateClauseResult => {
  const normalizedClause = normalizeText(clause);
  const betweenRegex = new RegExp(`^Between\\s+(${DATE_PATTERN})\\s+And\\s+(${DATE_PATTERN})$`, "i");
  const hyphenRegex = new RegExp(`^(${DATE_PATTERN})\\s+-\\s+(${DATE_PATTERN})$`, "i");
  const betweenMatch = normalizedClause.match(betweenRegex) ?? normalizedClause.match(hyphenRegex);

  if (betweenMatch) {
    const fromDate = mapLegacyDateToTarget(betweenMatch[1] ?? "", context);
    const toDate = mapLegacyDateToTarget(betweenMatch[2] ?? "", context);
    const issues = [fromDate, toDate].flatMap((result) =>
      result.status === "invalid"
        ? [buildIssue(context, "error", "invalid_mapped_date", result.message)]
        : [],
    );

    if (issues.length > 0 || fromDate.status !== "ok" || toDate.status !== "ok") {
      return {
        status: "failed",
        issues,
      };
    }

    if (fromDate.isoDate > toDate.isoDate) {
      return {
        status: "failed",
        issues: [buildIssue(context, "error", "reversed_date_range", "客户日期范围的起始日期晚于结束日期；导入不会自动交换。")],
      };
    }

    return {
      status: "ok",
      operator: "Between",
      paramA: fromDate.isoDate,
      paramB: toDate.isoDate,
      warnings: [],
    };
  }

  const rawDates = parseDateMatches(normalizedClause);
  const mappedDates: string[] = [];
  const issues: CrewBidImportIssue[] = [];

  for (const rawDate of rawDates) {
    const mappedDate = mapLegacyDateToTarget(rawDate, context);

    if (mappedDate.status === "ok") {
      mappedDates.push(mappedDate.isoDate);
      continue;
    }

    issues.push(buildIssue(context, "error", "invalid_source_date", mappedDate.message));
  }

  if (issues.length > 0) {
    return { status: "failed", issues };
  }

  const withoutDates = normalizeText(normalizedClause.replace(DATE_REGEX, "").replace(/\bBetween\b/gi, ""));
  const daysOfWeek = parseDaysOfWeek(withoutDates.replace(/[,-]/g, " "));

  if (mappedDates.length === 0 && daysOfWeek.length === 0) {
    return {
      status: "failed",
      issues: [buildIssue(context, "error", "unsupported_date_clause", `Unsupported date/day clause: ${clause}.`)],
    };
  }

  return {
    status: "ok",
    operator: "In",
    paramA: buildDateListParam(Array.from(new Set(mappedDates)).sort(), daysOfWeek),
    paramB: null,
    warnings: [],
  };
};

const parseComparison = (value: string) => {
  const betweenMatch = value.match(/^Between\s+(.+?)\s+And\s+(.+)$/i);

  if (betweenMatch) {
    return {
      operator: "Between",
      left: normalizeComparisonValue(betweenMatch[1] ?? ""),
      right: normalizeComparisonValue(betweenMatch[2] ?? ""),
    };
  }

  const comparisonMatch = value.match(/^(?:In\s+)?(.+?)?\s*(<|>|=)\s*(.+)$/i);

  if (comparisonMatch) {
    return {
      operator: normalizeOperator(comparisonMatch[2] ?? "="),
      left: normalizeComparisonValue(comparisonMatch[3] ?? ""),
      right: null,
    };
  }

  return {
    operator: "=",
    left: normalizeComparisonValue(value),
    right: null,
  };
};

const normalizeComparisonValue = (value: string) =>
  normalizeText(value)
    .replace(/\s+(days?|legs?)$/i, "")
    .replace(/\s*%$/i, "%");

const parseAirportList = (value: string) =>
  Array.from(new Set(
    value
      .replace(/^In\s+/i, "")
      .split(",")
      .map((airport) => airport.trim().toUpperCase())
      .filter(Boolean),
  ));

const condition = (
  propertyCode: number,
  operator: string | null,
  paramA: string | null,
  paramB: string | null,
  paramC: string | null,
): CrewBidImportMappedCondition => ({
  propertyCode,
  operator,
  paramA,
  paramB,
  paramC,
});

const parseDateListParam = (value: string): { dates: string[]; daysOfWeek: string[] } => {
  const parsed = JSON.parse(value) as Partial<{ dates: unknown; daysOfWeek: unknown }>;
  const dates = Array.isArray(parsed.dates)
    ? parsed.dates.filter((date): date is string => typeof date === "string")
    : [];
  const daysOfWeek = Array.isArray(parsed.daysOfWeek)
    ? parsed.daysOfWeek.filter((day): day is string => typeof day === "string")
    : [];

  return {
    dates,
    daysOfWeek,
  };
};

const jsonCondition = (
  propertyCode: number,
  bid: Record<string, unknown>,
): CrewBidImportMappedCondition => condition(propertyCode, "Json", JSON.stringify(bid), null, null);

const WORK_DAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const WORK_DAY_BY_UTC_DAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

const workDayForIsoDate = (isoDate: string) =>
  WORK_DAY_BY_UTC_DAY[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];

const datesInRange = (from: string, to: string) => {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
};

const mapAnyDutyOnCriterion = (
  context: MapContext,
  rawDateClause: string,
): CriterionResult => {
  const dateClause = parseDateClause(context, rawDateClause);

  if (dateClause.status === "failed") {
    return dateClause;
  }

  const explicitDays = new Set<string>();
  let dateScope: Record<string, unknown> | null = null;

  if (dateClause.operator === "Between") {
    const to = dateClause.paramB ?? dateClause.paramA;
    for (const date of datesInRange(dateClause.paramA, to)) {
      explicitDays.add(workDayForIsoDate(date));
    }
    dateScope = {
      mode: "date_range",
      from: dateClause.paramA,
      to,
    };
  } else {
    const parsed = parseDateListParam(dateClause.paramA);
    parsed.daysOfWeek.forEach((day) => explicitDays.add(day));
    parsed.dates.forEach((date) => explicitDays.add(workDayForIsoDate(date)));
    dateScope = parsed.dates.length > 0
      ? {
          mode: "specific_dates",
          dates: parsed.dates,
        }
      : null;
  }

  const days = WORK_DAY_ORDER
    .filter((day) => explicitDays.has(day))
    .map((dayOfWeek) => ({
      dayOfWeek,
      checkInFrom: "00:00",
      checkInTo: "23:59",
    }));

  if (days.length === 0) {
    return {
      status: "failed",
      issues: [buildIssue(context, "error", "unsupported_date_clause", `Unsupported date/day clause: ${rawDateClause}.`)],
    };
  }

  return {
    status: "ok",
    condition: jsonCondition(110, {
      type: "work-day-preference",
      days,
      dateScope,
    }),
    pairingReferences: [],
    warnings: dateClause.warnings,
  };
};

const hiddenCurrentCatalogCriterion = (
  context: MapContext,
  propertyName: string,
): CriterionResult => ({
  status: "failed",
  issues: [buildIssue(context, "error", "hidden_current_catalog", `${propertyName} is not visible in the current Portal catalog.`)],
});

const hiddenCurrentCatalogPreference = (
  context: MapContext,
  propertyName: string,
): CrewBidImportPreferenceMapResult => ({
  status: "failed",
  issues: [buildIssue(context, "error", "hidden_current_catalog", `${propertyName} is not visible in the current Portal catalog.`)],
});

const parseStrictPositiveInteger = (value: string) => {
  const normalized = normalizeText(value).replace(/\s+(?:days?|legs?)$/i, "");
  const parsed = Number.parseInt(normalized, 10);
  return /^\d+$/.test(normalized) && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const mapPairingCheckTimeCriterion = (
  context: MapContext,
  timeType: "check_in" | "check_out",
  clause: string,
): CriterionResult => {
  const comparison = parseComparison(clause);
  const bid = comparison.operator === "Between"
    ? {
        type: "pairing-check-time",
        timeType,
        operator: "Between",
        from: comparison.left,
        to: comparison.right ?? "",
        dateScope: null,
      }
    : {
        type: "pairing-check-time",
        timeType,
        operator: comparison.operator,
        value: comparison.left,
        dateScope: null,
      };

  if (!/^\d{2}:\d{2}$/.test(comparison.left) || (comparison.operator === "Between" && !/^\d{2}:\d{2}$/.test(comparison.right ?? ""))) {
    return {
      status: "failed",
      issues: [buildIssue(context, "error", "invalid_pairing_check_time", `Invalid Pairing Check-In / Check-Out Time: ${clause}.`)],
    };
  }

  return { status: "ok", condition: jsonCondition(103, bid), pairingReferences: [], warnings: [] };
};

const parsePairingReferences = (
  context: MapContext,
  value: string,
): CriterionResult => {
  const pairingReferences: CrewBidImportPairingReference[] = [];
  const referenceRegex = new RegExp(`(?:^|,\\s*)([A-Z0-9_-]+)(?:\\s+Check-In Date\\s+(${DATE_PATTERN}))?`, "gi");

  for (const match of value.matchAll(referenceRegex)) {
    const pairingNumber = (match[1] ?? "").trim().toUpperCase();
    if (!pairingNumber) continue;
    const sourceOriginDate = match[2]?.trim();
    if (!sourceOriginDate) {
      pairingReferences.push({ pairingNumber });
      continue;
    }
    const mappedDate = mapLegacyDateToTarget(sourceOriginDate, context);
    if (mappedDate.status === "invalid") {
      return {
        status: "failed",
        issues: [buildIssue(context, "error", "invalid_pairing_origin_date", mappedDate.message)],
      };
    }
    pairingReferences.push({ pairingNumber, sourceOriginDate, targetOriginDate: mappedDate.isoDate });
  }

  if (pairingReferences.length === 0) {
    return {
      status: "failed",
      issues: [buildIssue(context, "error", "invalid_pairing_reference", `No Pairing Number could be parsed from: ${value}.`)],
    };
  }

  return {
    status: "ok",
    condition: jsonCondition(102, {
      type: "pairing-preference",
      pairingIds: [],
      pairingLabels: pairingReferences.map((reference) => reference.pairingNumber),
    }),
    pairingReferences,
    warnings: [],
  };
};

const expandCombinedPairingCriterionParts = (rawText: string) =>
  rawText
    .split(/\s+If\s+/i)
    .map(normalizeText)
    .filter(Boolean)
    .flatMap((part) => {
      const layoverDurationMatch = part.match(/^(Any|Every) Layover In\s+(.+?)\s+And\s+Of\s+Duration\s+(.+)$/i);

      if (!layoverDurationMatch) {
        return [part];
      }

      const quantifier = layoverDurationMatch[1] ?? "Any";
      const airports = layoverDurationMatch[2] ?? "";
      const durationClause = layoverDurationMatch[3] ?? "";

      return [
        `${quantifier} Layover In ${airports}`,
        `${quantifier} Layover Of Duration ${durationClause}`,
      ];
    });

const mapPairingCriterion = (
  context: MapContext,
  rawCriterion: string,
): CriterionResult => {
  const criterionText = normalizeText(rawCriterion);

  if (
    /^(?:Most Flying(?: Hours)? In (?:The )?Least(?: Amount Of)? (?:(?:Flying|Working) )?Days?|Efficient Flying(?: First)?)$/i
      .test(criterionText)
  ) {
    return {
      status: "ok",
      condition: jsonCondition(428, {
        type: "efficient-flying-preference",
        mode: "efficient",
      }),
      pairingReferences: [],
      warnings: [],
    };
  }

  if (
    /^(?:Inefficient Flying|Lowest Average Daily Credit(?: First)?|Least Efficient Flying)$/i
      .test(criterionText)
  ) {
    return {
      status: "ok",
      condition: jsonCondition(428, {
        type: "efficient-flying-preference",
        mode: "inefficient",
      }),
      pairingReferences: [],
      warnings: [],
    };
  }

  const airportCriterion = (
    event: "landing" | "layover",
    value: string,
  ): CriterionResult => ({
    status: "ok",
    condition: jsonCondition(168, {
      type: "airport-preference",
      event,
      locations: parseAirportList(value).map((code) => ({ code, kind: "airport" })),
      dateScope: null,
      minimumLayoverDuration: null,
    }),
    pairingReferences: [],
    warnings: [],
  });

  let match = criterionText.match(/^Pairing Number(?:\s+\(Ordered\))?\s+(.+)$/i);

  if (match) {
    return parsePairingReferences(context, match[1] ?? "");
  }

  match = criterionText.match(/^Any Landing In(\s+\(Counting Deadhead Legs\))?\s+(.+)$/i);

  if (match) {
    if (match[1]) {
      return {
        status: "failed",
        issues: [buildIssue(context, "error", "counting_deadhead_legs_not_supported", "Counting Deadhead Legs cannot be represented by Airport Preference without changing its meaning.")],
      };
    }
    return airportCriterion("landing", match[2] ?? "");
  }

  match = criterionText.match(/^(Any|Every) Layover In\s+(.+)$/i);

  if (match) {
    return airportCriterion("layover", match[2] ?? "");
  }

  match = criterionText.match(/^Work Start Station\s+(.+)$/i);

  if (match) {
    return {
      status: "failed",
      issues: [buildIssue(context, "error", "hidden_current_catalog", "Work Start Station is not visible in the current Portal catalog.")],
    };
  }

  match = criterionText.match(/^Pairing Check-In Time\s+(.+)$/i);

  if (match) {
    return mapPairingCheckTimeCriterion(context, "check_in", match[1] ?? "");
  }

  match = criterionText.match(/^Pairing Check-Out Time\s+(.+)$/i);

  if (match) {
    return mapPairingCheckTimeCriterion(context, "check_out", match[1] ?? "");
  }

  match = criterionText.match(/^(Any|Every) Enroute Check-In Time\s+(.+)$/i);

  if (match) {
    return hiddenCurrentCatalogCriterion(context, "Any/Every Enroute Check-In Time");
  }

  match = criterionText.match(/^Any Enroute Check-Out Time\s+(.+)$/i);

  if (match) {
    return hiddenCurrentCatalogCriterion(context, "Any Enroute Check-Out Time");
  }

  match = criterionText.match(/^Any Duty On Time\s+(.+)$/i);

  if (match) {
    return hiddenCurrentCatalogCriterion(context, "Any Duty On Time");
  }

  match = criterionText.match(/^Departing On\s+(.+)$/i);

  if (match) {
    return {
      status: "failed",
      issues: [buildIssue(context, "error", "hidden_current_catalog", "Departing On is not visible in the current Portal catalog.")],
    };
  }

  match = criterionText.match(/^(Any|Every) Layover On\s+(.+)$/i);

  if (match) {
    return hiddenCurrentCatalogCriterion(context, "Any/Every Layover On");
  }

  match = criterionText.match(/^Any Duty On\s+(.+)$/i);

  if (match) {
    return mapAnyDutyOnCriterion(context, match[1] ?? "");
  }

  match = criterionText.match(/^Every Duty On\s+(.+)$/i);

  if (match) {
    return {
      status: "failed",
      issues: [buildIssue(
        context,
        "error",
        "unsupported_every_duty_on",
        "Every Duty On cannot be represented by the award-only Work Day Preference without changing its meaning.",
      )],
    };
  }

  match = criterionText.match(/^(Any|Every) Duty Legs\s+(.+)$/i);

  if (match) {
    const comparison = parseComparison(match[2] ?? "");
    const legs = parseStrictPositiveInteger(comparison.left);
    const to = comparison.operator === "Between" ? parseStrictPositiveInteger(comparison.right ?? "") : null;
    if (legs === null || (comparison.operator === "Between" && to === null)) {
      return { status: "failed", issues: [buildIssue(context, "error", "invalid_flight_legs_per_duty", `Invalid Flight Legs per Duty value: ${match[2] ?? ""}.`)] };
    }
    const bid = comparison.operator === "Between"
      ? { type: "flight-legs-per-duty", operator: "Between", from: legs, to, dateScope: null }
      : { type: "flight-legs-per-duty", operator: comparison.operator, legs, dateScope: null };
    return { status: "ok", condition: jsonCondition(107, bid), pairingReferences: [], warnings: [] };
  }

  match = criterionText.match(/^(Any|Every) Duty Duration\s+(.+)$/i);

  if (match) {
    return hiddenCurrentCatalogCriterion(context, "Any/Every Duty Duration");
  }

  match = criterionText.match(/^(Any|Every) Layover (?:Of )?Duration\s+(.+)$/i);

  if (match) {
    return hiddenCurrentCatalogCriterion(context, "Any/Every Layover Duration");
  }

  match = criterionText.match(/^Pairing Length\s+(.+)$/i);
  if (match) {
    const comparison = parseComparison(match[1] ?? "");
    const days = parseStrictPositiveInteger(comparison.left);
    if (days === null || comparison.operator === "Between") {
      return { status: "failed", issues: [buildIssue(context, "error", "invalid_pairing_length", `Invalid Pairing Length value: ${match[1] ?? ""}.`)] };
    }
    const minDays = comparison.operator === ">" ? days + 1 : comparison.operator === "=" ? days : null;
    const maxDays = comparison.operator === "<" ? Math.max(1, days - 1) : comparison.operator === "=" ? days : null;
    return {
      status: "ok",
      condition: jsonCondition(112, { type: "pairing-length-preference", minDays, maxDays, dateScope: null }),
      pairingReferences: [],
      warnings: [],
    };
  }

  match = criterionText.match(/^Any Flight Number\s+(.+)$/i);
  if (match) {
    const flightNumbers = parseAirportList(match[1] ?? "");
    if (flightNumbers.length === 0) {
      return { status: "failed", issues: [buildIssue(context, "error", "invalid_flight_number", "Flight Number Preference requires at least one flight number.")] };
    }
    return {
      status: "ok",
      condition: jsonCondition(116, { type: "flight-number-preference", flightNumbers, dateScope: null }),
      pairingReferences: [],
      warnings: [],
    };
  }

  match = criterionText.match(/^Credit Per Time Away From Base\s+(.+)$/i);

  if (match) {
    return hiddenCurrentCatalogCriterion(context, "Credit Per Time Away From Base");
  }

  const redeyeMatch = criterionText.match(/^Any Leg Is Redeye(\s+\(Counting Deadhead Legs\))?$/i);

  if (redeyeMatch) {
    if (redeyeMatch[1]) {
      return {
        status: "failed",
        issues: [buildIssue(context, "error", "counting_deadhead_legs_not_supported", "Counting Deadhead Legs cannot be represented by Redeye Preference without changing its meaning.")],
      };
    }

    return {
      status: "ok",
      condition: jsonCondition(117, { type: "redeye-preference", dateScope: null }),
      pairingReferences: [],
      warnings: [],
    };
  }

  if (/^Deadhead Day$/i.test(criterionText)) {
    return {
      status: "ok",
      condition: jsonCondition(122, {
        type: "deadhead-flying",
        mode: "deadhead-only-duty",
        dateScope: null,
      }),
      pairingReferences: [],
      warnings: [],
    };
  }

  return {
    status: "failed",
    issues: [buildIssue(context, "error", "unsupported_pairing_criterion", `Unsupported Pairing criterion: ${criterionText}.`)],
  };
};

const mapPairingPreference = (
  context: MapContext,
  actionId: number,
  text: string,
  limitN: number | null,
): CrewBidImportPreferenceMapResult => {
  const parts = expandCombinedPairingCriterionParts(text);
  const mainCriterion = parts.shift();

  if (!mainCriterion) {
    return {
      status: "failed",
      issues: [buildIssue(context, "error", "missing_pairing_criterion", "Award/Avoid Pairings 行缺少 If 条件。")],
    };
  }

  const mappedMain = mapPairingCriterion(context, mainCriterion);

  if (mappedMain.status === "failed") {
    return mappedMain;
  }

  if (mappedMain.condition.propertyCode === 110 && actionId !== 1) {
    return {
      status: "failed",
      issues: [buildIssue(
        context,
        "error",
        "unsupported_avoid_any_duty_on",
        "Avoid Any Duty On cannot be represented because Work Day Preference supports Award only.",
      )],
    };
  }

  if (mappedMain.condition.propertyCode === 428 && actionId !== 1) {
    return {
      status: "failed",
      issues: [buildIssue(
        context,
        "error",
        "efficient_flying_mode_ambiguous",
        "Avoid Efficient Flying First cannot be converted to Inefficient flying without changing its meaning.",
      )],
    };
  }

  const pairingReferences = [...mappedMain.pairingReferences];
  const warnings = [...mappedMain.warnings];

  for (const part of parts) {
    warnings.push(buildIssue(
      context,
      "warning",
      "secondary_pairing_clause_dropped",
      `Only the primary Pairing clause is imported; secondary clause was dropped: ${part}.`,
    ));
  }

  return {
    status: "importable",
    preference: {
      sourceLineNumber: context.preference.sourceLineNumber,
      sourceSeq: context.preference.sourceSeq,
      rawText: context.preference.rawText,
      bidType: "Pairing",
      propertyCode: mappedMain.condition.propertyCode,
      actionId,
      operator: mappedMain.condition.operator,
      paramA: mappedMain.condition.paramA,
      paramB: mappedMain.condition.paramB,
      paramC: mappedMain.condition.paramC,
      preferenceJson: mappedMain.preferenceJson ?? null,
      limitN,
      allOrNothing: null,
      minimumN: null,
      conditions: [],
      pairingReferences,
      warnings,
    },
  };
};

const mapPreferOff = (
  context: MapContext,
  rawClause: string,
): CrewBidImportPreferenceMapResult => {
  let clause = normalizeText(rawClause);
  let minimumN: number | null = null;
  let timeWindow: { from: string; to: string } | null = null;
  const minimumMatch = clause.match(/\s+Minimum\s+(\d+)\s*$/i);

  if (minimumMatch) {
    minimumN = Number.parseInt(minimumMatch[1] ?? "", 10);
    clause = clause.slice(0, minimumMatch.index).trim();
  }

  const timeWindowMatch = clause.match(/\s+Between\s+(\d{1,2}:\d{2})\s+And\s+(\d{1,2}:\d{2})$/i);
  if (timeWindowMatch) {
    const normalizeTime = (value: string) => {
      const [hours, minutes] = value.split(":");
      return `${hours?.padStart(2, "0")}:${minutes}`;
    };
    const from = normalizeTime(timeWindowMatch[1] ?? "");
    const to = normalizeTime(timeWindowMatch[2] ?? "");
    const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

    if (!validTime.test(from) || !validTime.test(to) || from >= to) {
      return {
        status: "failed",
        issues: [buildIssue(
          context,
          "error",
          "invalid_prefer_off_time_window",
          `Prefer Off time window must be a same-day range with start before end: ${from}-${to}.`,
        )],
      };
    }

    timeWindow = { from, to };
    clause = clause.slice(0, timeWindowMatch.index).trim();
  }

  if (/^Weekends?$/i.test(clause)) {
    return {
      status: "importable",
      preference: {
        sourceLineNumber: context.preference.sourceLineNumber,
        sourceSeq: context.preference.sourceSeq,
        rawText: context.preference.rawText,
        bidType: "DaysOff",
        propertyCode: 201,
        actionId: null,
        operator: "In",
        paramA: timeWindow
          ? `Weekends,Window ${timeWindow.from}-${timeWindow.to}`
          : "Weekends",
        paramB: null,
        paramC: null,
        preferenceJson: null,
        limitN: null,
        allOrNothing: null,
        minimumN,
        conditions: [],
        pairingReferences: [],
        warnings: [],
      },
    };
  }

  const parsedDateClause = parseDateClause(context, clause);

  if (parsedDateClause.status === "failed") {
    return {
      status: "failed",
      issues: parsedDateClause.issues,
    };
  }

  return {
    status: "importable",
    preference: {
      sourceLineNumber: context.preference.sourceLineNumber,
      sourceSeq: context.preference.sourceSeq,
      rawText: context.preference.rawText,
      bidType: "DaysOff",
      propertyCode: 201,
      actionId: null,
      operator: "In",
      paramA: [
        buildPreferOffTagListParam(parsedDateClause),
        ...(timeWindow ? [`Window ${timeWindow.from}-${timeWindow.to}`] : []),
      ].join(","),
      paramB: null,
      paramC: null,
      preferenceJson: null,
      limitN: null,
      allOrNothing: null,
      minimumN,
      conditions: [],
      pairingReferences: [],
      warnings: parsedDateClause.warnings,
    },
  };
};

const buildFlagPreference = (
  context: MapContext,
  bidType: CrewBidImportMappedPreference["bidType"],
  propertyCode: number,
): CrewBidImportPreferenceMapResult => ({
  status: "importable",
  preference: {
    sourceLineNumber: context.preference.sourceLineNumber,
    sourceSeq: context.preference.sourceSeq,
    rawText: context.preference.rawText,
    bidType,
    propertyCode,
    actionId: null,
    ...emptySerialized,
    preferenceJson: null,
    limitN: null,
    allOrNothing: null,
    minimumN: null,
    conditions: [],
    pairingReferences: [],
    warnings: [],
  },
});

const buildScalarPreference = (
  context: MapContext,
  bidType: CrewBidImportMappedPreference["bidType"],
  propertyCode: number,
  operator: string | null,
  paramA: string | null,
  paramB: string | null,
  paramC: string | null,
): CrewBidImportPreferenceMapResult => ({
  status: "importable",
  preference: {
    sourceLineNumber: context.preference.sourceLineNumber,
    sourceSeq: context.preference.sourceSeq,
    rawText: context.preference.rawText,
    bidType,
    propertyCode,
    actionId: null,
    operator,
    paramA,
    paramB,
    paramC,
    preferenceJson: null,
    limitN: null,
    allOrNothing: null,
    minimumN: null,
    conditions: [],
    pairingReferences: [],
    warnings: [],
  },
});

const buildEfficientFlyingPreference = (
  context: MapContext,
  mode: "efficient" | "inefficient",
  legacyNormalized = false,
): CrewBidImportPreferenceMapResult => {
  const result = buildScalarPreference(
    context,
    "Pairing",
    428,
    "Json",
    JSON.stringify({
      type: "efficient-flying-preference",
      mode,
    }),
    null,
    null,
  );

  if (result.status !== "importable") {
    return result;
  }

  return {
    ...result,
    preference: {
      ...result.preference,
      actionId: 1,
      warnings: legacyNormalized
        ? [buildIssue(
          context,
          "warning",
          "efficient_flying_legacy_normalized",
          "Legacy Efficient Flying preference was normalized to the current Pairing bid.",
        )]
        : [],
    },
  };
};

const buildLineReservePreference = (
  context: MapContext,
  actionId: 1 | 2,
): CrewBidImportPreferenceMapResult => {
  const result = buildScalarPreference(context, "Line", 427, null, null, null, null);

  if (result.status !== "importable") {
    return result;
  }

  return {
    ...result,
    preference: {
      ...result.preference,
      actionId,
    },
  };
};

const mapSetCondition = (
  context: MapContext,
  rawClause: string,
): CrewBidImportPreferenceMapResult => {
  const clause = normalizeText(rawClause);

  if (/^Minimum Credit Window$/i.test(clause)) {
    return buildScalarPreference(context, "Line", 429, "Json", JSON.stringify({
      type: "credit-window-preference",
      direction: "less",
    }), null, null);
  }

  if (/^Maximum Credit Window$/i.test(clause)) {
    return buildScalarPreference(context, "Line", 429, "Json", JSON.stringify({
      type: "credit-window-preference",
      direction: "more",
    }), null, null);
  }

  if (/^No Same Day Pairings$/i.test(clause)) {
    return hiddenCurrentCatalogPreference(context, "No Same Day Pairings");
  }

  if (/^Most Flying(?: Hours)? In (?:The )?Least(?: Amount Of)? (?:(?:Flying|Working) )?Days?$/i.test(clause)) {
    return buildEfficientFlyingPreference(context, "efficient", true);
  }

  let match = clause.match(/^Short Call Type\s+([A-Z0-9]+)$/i);

  if (match) {
    const callType = (match[1] ?? "").toUpperCase();
    const options = ["CRAM", "CRPM", "PRAM", "PRMM", "PRPM", "RESA", "RESB"];
    if (!options.includes(callType)) {
      return {
        status: "failed",
        issues: [buildIssue(context, "error", "unsupported_reserve_call_type", `Unsupported Reserve call type: ${callType}.`)],
      };
    }
    return buildScalarPreference(
      context,
      "Reserve",
      301,
      "In",
      callType,
      JSON.stringify({ mode: "whole_month" }),
      null,
    );
  }

  match = clause.match(/^(?:Minimum Days Off In A Row|(\d+)\s+Consecutive Days Off In A Row)\s*(\d+)?$/i);

  if (match) {
    const value = match[1] ?? match[2];

    return hiddenCurrentCatalogPreference(context, `Minimum Days Off In A Row ${value ?? ""}`.trim());
  }

  match = clause.match(/^(\d+)\s+Consecutive Days Off In A Row Between\s+(.+)$/i);

  if (match) {
    const dateClause = parseDateClause(context, `Between ${match[2] ?? ""}`);

    if (dateClause.status === "failed") {
      return {
        status: "failed",
        issues: dateClause.issues,
      };
    }

    return buildScalarPreference(
      context,
      "DaysOff",
      204,
      "Between",
      match[1] ?? null,
      dateClause.paramA,
      dateClause.paramB,
    );
  }

  match = clause.match(/^Maximum Days On In A Row\s+(\d+)$/i);

  if (match) {
    return hiddenCurrentCatalogPreference(context, "Maximum Days On In A Row");
  }

  match = clause.match(/^Pattern Between\s+(\d+)\s+and\s+(\d+)\s+Days On,\s+with\s+(\d+)\s+Days Off(?: \(Minimum\))?$/i);

  if (match) {
    return buildScalarPreference(
      context,
      "Line",
      408,
      "Json",
      JSON.stringify({
        type: "days-off-on-pattern",
        minDaysOff: Number.parseInt(match[3] ?? "", 10),
        minDaysOn: Number.parseInt(match[1] ?? "", 10),
        maxDaysOn: Number.parseInt(match[2] ?? "", 10),
        dateRange: null,
      }),
      null,
      null,
    );
  }

  match = clause.match(/^Minimum Base Layover\s+(\d{1,3}:\d{2})$/i);

  if (match) {
    return buildScalarPreference(context, "Line", 407, "=", match[1] ?? null, null, null);
  }

  match = clause.match(/^Days Off Opposite Employee\s+([A-Z0-9_-]+)\s+Minimum\s+(\d+)$/i);

  if (match) {
    return hiddenCurrentCatalogPreference(context, "Days Off Opposite Employee");
  }

  return {
    status: "failed",
    issues: [buildIssue(context, "error", "unsupported_set_condition", `Unsupported Set Condition: ${clause}.`)],
  };
};

export const mapCrewBidPreference = (
  block: ParsedCrewBidBlock,
  preference: ParsedCrewBidPreference,
  targetPeriodCode: string,
  targetPeriodStartDate: string,
  targetPeriodEndDate: string,
): CrewBidImportPreferenceMapResult => {
  const context: MapContext = {
    block,
    preference,
    targetPeriodCode,
    targetPeriodStartDate,
    targetPeriodEndDate,
  };
  const groupWarning = preference.groupIndex && preference.groupIndex > 1
    ? buildIssue(context, "warning", "additional_pairing_bid_group_ignored", "该行属于第一个 Pairing Bid Group 之后的 group，本次按需求忽略。")
    : null;

  if (preference.groupIndex && preference.groupIndex > 1) {
    return {
      status: "skipped",
      issues: groupWarning ? [groupWarning] : [],
    };
  }

  if (preference.rawText === "Pairing Bid Group" || preference.rawText === "Reserve Bid Group") {
    return {
      status: "skipped",
      issues: [],
    };
  }

  const strippedModifiers = stripPreferenceModifiers(context, preference.rawText);
  const limitResult = extractLimit(strippedModifiers.text);
  const text = limitResult.text;
  const preWarnings = strippedModifiers.warnings;

  let result: CrewBidImportPreferenceMapResult;
  let match: RegExpMatchArray | null;

  if (/^Award Efficient Flying First$/i.test(text)) {
    result = buildEfficientFlyingPreference(context, "efficient");
  } else if (/^Award Inefficient Flying$/i.test(text)) {
    result = buildEfficientFlyingPreference(context, "inefficient");
  } else if (/^Efficient Flying$/i.test(text)) {
    result = buildEfficientFlyingPreference(context, "efficient", true);
  } else if (
    /^(?:Avoid Efficient Flying(?: First)?|Efficient Flying First|Inefficient Flying)$/i
      .test(text)
  ) {
    result = {
      status: "failed",
      issues: [buildIssue(
        context,
        "error",
        "efficient_flying_mode_ambiguous",
        `Efficient Flying direction is ambiguous: ${text}.`,
      )],
    };
  } else if (/^Award Reserve$/i.test(text)) {
    result = buildLineReservePreference(context, 1);
  } else if (/^Avoid Reserve$/i.test(text)) {
    result = buildLineReservePreference(context, 2);
  } else if (/^Reserve Avoidance No Matter What$/i.test(text)) {
    result = buildLineReservePreference(context, 2);
  } else if (/^Reserve Avoidance If Possible$/i.test(text)) {
    result = {
      status: "skipped",
      issues: [buildIssue(
        context,
        "warning",
        "reserve_avoidance_if_possible_unsupported",
        "Reserve Avoidance If Possible cannot be converted to Award or Avoid Reserve, so it was not imported.",
      )],
    };
  } else if ((match = text.match(/^Award Pairings If\s+(.+)$/i))) {
    result = mapPairingPreference(context, 1, match[1] ?? "", limitResult.limitN);
  } else {
    match = text.match(/^Avoid Pairings If\s+(.+)$/i);

    if (match) {
      result = mapPairingPreference(context, 2, match[1] ?? "", limitResult.limitN);
    } else {
      match = text.match(/^Prefer Off\s+(.+)$/i);

      if (match) {
        result = mapPreferOff(context, match[1] ?? "");
      } else {
        match = text.match(/^Award Reserve Day On\s+(.+)$/i);

        if (match) {
          result = hiddenCurrentCatalogPreference(context, "Reserve Day On");
        } else if (/^Award Pairings$/i.test(text)) {
          result = { status: "skipped", issues: [] };
        } else {
          match = text.match(/^Set Condition\s+(.+)$/i);

          if (match) {
            result = mapSetCondition(context, match[1] ?? "");
          } else if (/^Clear Schedule and Start Next Bid Group$/i.test(text)) {
            result = hiddenCurrentCatalogPreference(context, "Clear Schedule and Start Next Bid Group");
          } else if (/^Waive No Same Day Duty Starts$/i.test(text)) {
            result = hiddenCurrentCatalogPreference(context, "Waive No Same Day Duty Starts");
          } else {
            match = text.match(/^Forget Line\s+(\d+)$/i);
            result = match
              ? hiddenCurrentCatalogPreference(context, "Forget Line")
              : {
                  status: "failed",
                  issues: [buildIssue(context, "error", "unsupported_preference", `Unsupported preference: ${text}.`)],
                };
          }
        }
      }
    }
  }

  if (result.status === "importable" && (preWarnings.length > 0 || strippedModifiers.allOrNothing !== null)) {
    return {
      ...result,
      preference: {
        ...result.preference,
        allOrNothing: strippedModifiers.allOrNothing ?? result.preference.allOrNothing,
        warnings: [...preWarnings, ...result.preference.warnings],
      },
    };
  }

  if ((result.status === "failed" || result.status === "skipped") && preWarnings.length > 0) {
    return {
      ...result,
      issues: [...preWarnings, ...result.issues],
    };
  }

  return result;
};
