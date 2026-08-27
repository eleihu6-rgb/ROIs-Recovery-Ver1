export type PbsBusinessTimeCommand =
  | {
    action: "clear";
  }
  | {
    action: "status";
  }
  | {
    action: "set";
    input: string;
    anchorBusinessTime: Date;
  };

export type PbsBusinessTimeConfig = {
  mode: string;
  anchor: string;
  anchorReal: string;
};

export type PbsBusinessTimeStatus = PbsBusinessTimeConfig & {
  realNowIso: string;
  businessNowIso: string;
  source: "system" | "override";
  warnings: string[];
};

export type PbsBusinessTimeUpdate = {
  code: string;
  codeValue: string;
};

const COMPACT_SHANGHAI_TIMESTAMP_PATTERN = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;
const SHANGHAI_UTC_OFFSET_HOURS = 8;

export const PBS_BUSINESS_TIME_MODE_KEY = "PBS_BUSINESS_TIME_MODE";
export const PBS_BUSINESS_TIME_ANCHOR_KEY = "PBS_BUSINESS_TIME_ANCHOR";
export const PBS_BUSINESS_TIME_ANCHOR_REAL_KEY = "PBS_BUSINESS_TIME_ANCHOR_REAL";
export const PBS_BUSINESS_TIME_KEYS = [
  PBS_BUSINESS_TIME_MODE_KEY,
  PBS_BUSINESS_TIME_ANCHOR_KEY,
  PBS_BUSINESS_TIME_ANCHOR_REAL_KEY,
] as const;

const shanghaiDateTimeParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", string>;
};

export const parseCompactShanghaiBusinessTime = (value: string): Date => {
  const match = value.match(COMPACT_SHANGHAI_TIMESTAMP_PATTERN);

  if (!match) {
    throw new Error("Business time must use YYYYMMDDHHmmss, for example 20260401120000.");
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw] = match;
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  const second = Number.parseInt(secondRaw, 10);
  const date = new Date(Date.UTC(year, month - 1, day, hour - SHANGHAI_UTC_OFFSET_HOURS, minute, second));
  const parts = shanghaiDateTimeParts(date);

  if (
    parts.year !== yearRaw
    || parts.month !== monthRaw
    || parts.day !== dayRaw
    || parts.hour !== hourRaw
    || parts.minute !== minuteRaw
    || parts.second !== secondRaw
  ) {
    throw new Error(`Invalid business time: ${value}.`);
  }

  return date;
};

export const parsePbsBusinessTimeArgs = (args: string[]): PbsBusinessTimeCommand => {
  if (args.length === 0) {
    return { action: "clear" };
  }

  if (args.length !== 1) {
    throw new Error("Usage: npm run business-time -- [status|clear|YYYYMMDDHHmmss]");
  }

  const [arg] = args;
  const normalizedArg = arg.trim().toLowerCase();

  if (normalizedArg === "status") {
    return { action: "status" };
  }

  if (normalizedArg === "clear") {
    return { action: "clear" };
  }

  return {
    action: "set",
    input: arg,
    anchorBusinessTime: parseCompactShanghaiBusinessTime(arg),
  };
};

export const buildPbsBusinessTimeUpdates = (
  command: Exclude<PbsBusinessTimeCommand, { action: "status" }>,
  realNow: Date,
): PbsBusinessTimeUpdate[] => {
  if (command.action === "clear") {
    return [
      { code: PBS_BUSINESS_TIME_MODE_KEY, codeValue: "ROLLING" },
      { code: PBS_BUSINESS_TIME_ANCHOR_KEY, codeValue: "" },
      { code: PBS_BUSINESS_TIME_ANCHOR_REAL_KEY, codeValue: "" },
    ];
  }

  return [
    { code: PBS_BUSINESS_TIME_MODE_KEY, codeValue: "ROLLING" },
    { code: PBS_BUSINESS_TIME_ANCHOR_KEY, codeValue: command.anchorBusinessTime.toISOString() },
    { code: PBS_BUSINESS_TIME_ANCHOR_REAL_KEY, codeValue: realNow.toISOString() },
  ];
};

const parseConfigDate = (value: string) => {
  if (value.trim().length === 0) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

export const buildPbsBusinessTimeStatus = (
  config: PbsBusinessTimeConfig,
  realNow: Date,
): PbsBusinessTimeStatus => {
  const warnings: string[] = [];
  const mode = config.mode.trim() || "ROLLING";
  const anchorBusinessTime = parseConfigDate(config.anchor);
  const anchorRealTime = parseConfigDate(config.anchorReal);

  if (config.anchor.trim().length === 0) {
    return {
      ...config,
      mode,
      realNowIso: realNow.toISOString(),
      businessNowIso: realNow.toISOString(),
      source: "system",
      warnings,
    };
  }

  if (mode !== "ROLLING") {
    warnings.push(`Unsupported PBS business time mode: ${mode}.`);
  }

  if (!anchorBusinessTime) {
    warnings.push("Invalid PBS business time anchor.");
  }

  if (!anchorRealTime) {
    warnings.push("Invalid PBS business time real anchor.");
  }

  if (warnings.length > 0 || mode !== "ROLLING" || !anchorBusinessTime || !anchorRealTime) {
    return {
      ...config,
      mode,
      realNowIso: realNow.toISOString(),
      businessNowIso: realNow.toISOString(),
      source: "system",
      warnings,
    };
  }

  const elapsedMs = realNow.getTime() - anchorRealTime.getTime();

  return {
    ...config,
    mode,
    realNowIso: realNow.toISOString(),
    businessNowIso: new Date(anchorBusinessTime.getTime() + elapsedMs).toISOString(),
    source: "override",
    warnings,
  };
};
