export type RuleBidValue =
  | { type: "flag" }
  | { type: "efficient-flying-preference"; mode: "efficient" | "inefficient" }
  | { type: "date"; value: string; operator?: "=" | "<" | ">" }
  | { type: "stepper"; value: number; min?: number; max?: number; operator?: "=" | "<" | ">" }
  | { type: "stepper-range"; from: number; to: number; min?: number; max?: number }
  | { type: "stepper-date"; value: number; date: string; min?: number; max?: number; operator?: "=" | "<" | ">" }
  | { type: "stepper-range-date"; from: number; to: number; date: string; min?: number; max?: number }
  | { type: "stepper-date-range"; value: number; from: string; to: string; min?: number; max?: number }
  | { type: "days-off-on-pattern"; minDaysOff: number; minDaysOn: number; maxDaysOn: number; dateRange?: { from: string; to: string } | null; min?: number; max?: number }
  | { type: "credit-density-preference"; minimumTotalCredit: string; maximumWorkingDays: number; strength: "normal" | "strong" | "must_try" }
  | { type: "minimum-base-layover"; minimumDuration: string }
  | { type: "credit-window-preference"; direction: "more" | "less" }
  | { type: "time"; value: string; operator?: "=" | "<" | ">" }
  | { type: "time-range"; from: string; to: string }
  | { type: "time-condition-list"; conditions: ({ operator: "=" | "<" | ">"; value: string } | { operator: "Between"; from: string; to: string })[] }
  | { type: "duration"; value: string; operator?: "=" | "<" | ">"; creditPriority?: "higher" | "lower" }
  | { type: "duration-range"; from: string; to: string; creditPriority?: "higher" | "lower" }
  | { type: "time-date"; value: string; date: string; operator?: "=" | "<" | ">" }
  | { type: "time-range-date"; from: string; to: string; date: string }
  | { type: "date-range"; from: string; to: string }
  | { type: "date-or-dow-list"; dates: string[]; daysOfWeek: ("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[] }
  | {
      type: "work-day-preference";
      days: {
        dayOfWeek: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
        checkInFrom: string | null;
        checkInTo: string | null;
      }[];
      dateScope?:
        | { mode: "specific_dates"; dates: string[] }
        | { mode: "date_range"; from: string; to: string }
        | null;
    }
  | {
      type: "pairing-preference";
      pairingIds: string[];
      pairingLabels?: string[];
    }
  | {
      type: "airport-preference";
      event: "landing" | "layover" | "landing_or_layover";
      locations: { code: string; kind: "airport" | "city" }[];
      dateScope?:
        | { mode: "specific_dates"; dates: string[] }
        | { mode: "date_range"; from: string; to: string }
      | null;
      minimumLayoverDuration?: string | null;
    }
  | {
      type: "pairing-check-time";
      timeType: "check_in" | "check_out";
      operator: "=" | "<" | ">";
      value: string;
      dateScope?:
        | { mode: "specific_dates"; dates: string[] }
        | { mode: "date_range"; from: string; to: string }
        | null;
    }
  | {
      type: "pairing-check-time";
      timeType: "check_in" | "check_out";
      operator: "Between";
      from: string;
      to: string;
      dateScope?:
        | { mode: "specific_dates"; dates: string[] }
        | { mode: "date_range"; from: string; to: string }
        | null;
    }
  | (
      | {
          type: "flight-legs-per-duty";
          operator: "=" | "<" | ">";
          legs: number;
          dateScope?:
            | { mode: "specific_dates"; dates: string[] }
            | { mode: "date_range"; from: string; to: string }
            | null;
        }
      | {
          type: "flight-legs-per-duty";
          operator: "Between";
          from: number;
          to: number;
          dateScope?:
            | { mode: "specific_dates"; dates: string[] }
            | { mode: "date_range"; from: string; to: string }
            | null;
        }
    )
  | {
      type: "pairing-length-preference";
      minDays: number | null;
      maxDays: number | null;
      dateScope?:
        | { mode: "specific_dates"; dates: string[] }
        | { mode: "date_range"; from: string; to: string }
        | null;
      min?: number;
      max?: number;
    }
  | (
      | {
          type: "month-end-carryover";
          operator: "<" | "=" | ">";
          days: number | null;
        }
      | {
          type: "month-end-carryover";
          operator: "Between";
          from: number | null;
          to: number | null;
        }
    )
  | {
      type: "deadhead-flying";
      mode: "any-deadhead" | "deadhead-only-duty";
      dateScope?:
        | { mode: "specific_dates"; dates: string[] }
        | { mode: "date_range"; from: string; to: string }
        | null;
    }
  | {
      type: "flight-number-preference";
      flightNumbers: string[];
      dateScope?:
        | { mode: "specific_dates"; dates: string[] }
        | { mode: "date_range"; from: string; to: string }
        | null;
    }
  | {
      type: "redeye-preference";
      dateScope?:
        | { mode: "specific_dates"; dates: string[] }
        | { mode: "date_range"; from: string; to: string }
        | null;
    }
  | { type: "select"; value: string; options: string[] }
  | { type: "reserve-call-type-date-scope"; callType: string; options: string[]; dateScope: ReserveDateScope }
  | {
      type: "reserve-flying-date-pattern";
      segments: (
        | { workType: "reserve"; callType: string; dateScope: ReserveDateScope }
        | { workType: "flying"; dateScope: ReserveDateScope }
      )[];
      callTypeOptions: string[];
      strength: "normal" | "strong" | "must_try";
    }
  | { type: "tag-list"; values: string[]; suggestions?: string[] }
  | { type: "tag-list-date"; values: string[]; date: string; suggestions?: string[] }
  | { type: "pairing-id-list"; pairingIds: string[]; pairingLabels?: string[] }
  | {
      type: "pairing-occurrence-list";
      occurrences: {
        pairingNumber: string;
        originDate: string;
        pairingId: string;
        occurrenceId?: string;
      }[];
      suggestions?: string[];
    }
  | { type: "crew-days-off-share"; employeeNumber: string; minimumDays: number; min?: number; max?: number }
  | {
      type: "employee-schedule-preference";
      crewId: string;
      crewName?: string;
      relationship: "together" | "apart";
      scheduleType: "work" | "days_off";
      thresholdType: "minimum" | "maximum";
      days: number;
      min?: number;
      max?: number;
    }
  | { type: "percent"; value: string; operator?: "=" | "<" | ">" }
  | { type: "percent-range"; from: string; to: string }
  | { type: "percent-or-duration"; unit: "percent" | "duration"; value: string; operator?: "<" | ">"; creditPriority?: "higher" | "lower" }
  | { type: "text"; value: string };

export type ReserveDateScope =
  | { mode: "whole_month" }
  | { mode: "first_half" }
  | { mode: "second_half" }
  | { mode: "date_range"; from: string; to: string }
  | { mode: "specific_dates"; dates: string[] };

export type RulePropertyDefinition<TBidValue extends RuleBidValue> = {
  propertyCode: number;
  name: string;
  defaultBid: TBidValue;
};

export type SerializedBid = {
  operator: string | null;
  paramA: string | null;
  paramB: string | null;
  paramC: string | null;
};
