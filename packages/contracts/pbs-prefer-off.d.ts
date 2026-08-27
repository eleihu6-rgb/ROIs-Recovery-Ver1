export type PbsPreferOffMode = "specific_dates" | "date_range" | "days_of_week" | "weekends" | "empty" | "mixed";

export type PbsPreferOffWeekday = {
  code: string;
  name: string;
  order: number;
  isoDay: number;
};

export type PbsPreferOffWeekendConfig = {
  available: boolean;
  startDayCode?: string;
  startDayName?: string;
  startTime?: string;
  endDayCode?: string;
  endDayName?: string;
  endTime?: string;
};

export type PbsPreferOffConfig = {
  weekdays: PbsPreferOffWeekday[];
  weekend: PbsPreferOffWeekendConfig;
};

export type ParsedPreferOffBidValues = {
  mode: PbsPreferOffMode;
  specificDates: string[];
  rangeFrom: string;
  rangeTo: string;
  weekdays: string[];
  timeWindow: { from: string; to: string } | null;
  isTimeWindowValid: boolean;
  invalidValues: string[];
};

export type ExpandedPreferOffBidValues = ParsedPreferOffBidValues & {
  dates: string[];
  periodCount: number;
  isValid: boolean;
  error: string | null;
};

export type PbsWeekendInterval = {
  anchorDate: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  dates: string[];
};

export declare const listPbsPeriodDates: (rangeStart: string, rangeEnd: string) => string[];
export declare const isValidIsoDate: (value: string) => boolean;
export declare const parsePreferOffBidValues: (
  values: string[],
  config?: PbsPreferOffConfig,
) => ParsedPreferOffBidValues;
export declare const expandPbsWeekendIntervals: (
  rangeStart: string,
  rangeEnd: string,
  config?: PbsPreferOffConfig,
) => PbsWeekendInterval[];
export declare const expandPreferOffBidValues: (
  values: string[],
  rangeStart: string,
  rangeEnd: string,
  config?: PbsPreferOffConfig,
) => ExpandedPreferOffBidValues;
