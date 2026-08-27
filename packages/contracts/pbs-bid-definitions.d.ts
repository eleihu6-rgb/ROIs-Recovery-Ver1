export declare const pbsBidDefinitionCodes: {
  readonly redeyeParent: "PBS_PAIRING_REDEYE_CONFIG";
  readonly redeyeStartTime: "START_TIME";
  readonly redeyeEndTime: "END_TIME";
  readonly weekendParent: "PBS_PREFER_OFF";
  readonly weekendStartDay: "WEEKEND_START_DOW";
  readonly weekendStartTime: "WEEKEND_START_TIME";
  readonly weekendEndDay: "WEEKEND_END_DOW";
  readonly weekendEndTime: "WEEKEND_END_TIME";
  readonly creditWindowParent: "PBS_LINE_CREDIT_WINDOW_CONFIG";
  readonly creditWindowDeltaHours: "DELTA_HOURS";
  readonly minimumBaseLayoverParent: "SYS_PARAM";
  readonly minimumBaseLayoverDuration: "PBS_LINE_MINIMUM_BASE_LAYOVER";
  readonly minimumTimeBetweenFlightsParent: "SYS_PARAM";
  readonly minimumTimeBetweenFlightsMinutes: "PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES";
  readonly efficientFlyingParent: "PBS_EFFICIENT_FLYING_CONFIG";
  readonly efficientFlyingPercentile: "PERCENTILE";
};

export type PbsMinimumTimeBetweenFlightsDefinition =
  | { available: false }
  | { available: true; minimumMinutes: number };

export declare const parsePbsMinimumTimeBetweenFlightsDefinition: (input: {
  minimumMinutes?: unknown;
} | null | undefined) => PbsMinimumTimeBetweenFlightsDefinition;

export declare const formatPbsMinimumTimeBetweenFlightsDefinition: (
  definition?: PbsMinimumTimeBetweenFlightsDefinition | null,
) => string;

export type PbsEfficientFlyingPercentileDefinition =
  | { available: false }
  | { available: true; percentile: number };

export declare const parsePbsEfficientFlyingPercentileDefinition: (input: {
  percentile?: unknown;
} | null | undefined) => PbsEfficientFlyingPercentileDefinition;

export declare const formatPbsEfficientFlyingPercentileDefinition: (
  definition?: PbsEfficientFlyingPercentileDefinition | null,
) => string;

export type PbsMinimumBaseLayoverDefinition =
  | { available: false }
  | { available: true; minDuration: string };

export declare const parsePbsMinimumBaseLayoverDefinition: (input: {
  minDuration?: unknown;
} | null | undefined) => PbsMinimumBaseLayoverDefinition;

export declare const formatPbsMinimumBaseLayoverDefinition: (
  definition?: PbsMinimumBaseLayoverDefinition | null,
) => string;

export type PbsRedeyeDefinition =
  | { available: false }
  | {
      available: true;
      startTime: string;
      endTime: string;
      crossesMidnight: boolean;
      version: string;
    };

export declare const parsePbsRedeyeDefinition: (input: {
  startTime?: unknown;
  endTime?: unknown;
} | null | undefined) => PbsRedeyeDefinition;

export declare const formatPbsRedeyeDefinition: (definition?: PbsRedeyeDefinition | null) => string;

export declare const getPbsWeekendDurationMinutes: (input: {
  startDayIso: number;
  startTime: string;
  endDayIso: number;
  endTime: string;
}) => number | null;

export declare const formatPbsWeekendDefinition: (definition?: {
  available: boolean;
  startDayName?: string;
  startTime?: string;
  endDayName?: string;
  endTime?: string;
} | null) => string;
