import { z } from "zod";
import {
  pbsPairingPropertyCatalog,
  type PbsPairingBidValue,
} from "../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsPairingSearchPreviewProperty } from "../../../packages/contracts/pbs-search-pairings.js";
import { ruleBidValueSchema } from "./lineholder-route-utils.js";

const dateValueSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeOfDaySchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const pairingOccurrenceListBidSchema = z.object({
  type: z.literal("pairing-occurrence-list"),
  occurrences: z.array(z.object({
    pairingNumber: z.string().min(1),
    originDate: z.string().min(1),
    pairingId: z.string().regex(/^\d+$/),
    occurrenceId: z.string().min(1).optional(),
  })).min(1),
  suggestions: z.array(z.string().min(1)).optional(),
});

export const pairingIdListBidSchema = z.object({
  type: z.literal("pairing-id-list"),
  pairingIds: z.array(z.string().regex(/^[A-Za-z0-9_-]+$/)).min(1),
  pairingLabels: z.array(z.string().min(1)).optional(),
});

export const pairingPreferenceBidSchema = z.object({
  type: z.literal("pairing-preference"),
  pairingIds: z.array(z.string().regex(/^\d+$/)).min(1),
  pairingLabels: z.array(z.string().min(1)).optional(),
}).strict();

export const efficientFlyingPreferenceBidSchema = z.object({
  type: z.literal("efficient-flying-preference"),
  mode: z.enum(["efficient", "inefficient"]),
}).strict() as z.ZodType<Extract<PbsPairingBidValue, { type: "efficient-flying-preference" }>>;

export const pairingTimeConditionListBidSchema = z.object({
  type: z.literal("time-condition-list"),
  conditions: z.array(z.union([
    z.object({
      operator: z.enum(["=", "<", ">"]),
      value: z.string().min(1),
    }),
    z.object({
      operator: z.literal("Between"),
      from: z.string().min(1),
      to: z.string().min(1),
    }),
  ])).min(1),
});

const pairingCheckTimeDateScopeSchema = z.union([
  z.object({
    mode: z.literal("specific_dates"),
    dates: z.array(dateValueSchema).min(1),
  }),
  z.object({
    mode: z.literal("date_range"),
    from: dateValueSchema,
    to: dateValueSchema,
  }),
]).superRefine((scope, context) => {
  if (scope.mode === "date_range" && scope.to < scope.from) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Pairing Check-In / Check-Out Time date range end must be on or after start.",
    });
  }
});

export const pairingCheckTimeBidSchema = z.discriminatedUnion("operator", [
  z.object({
    type: z.literal("pairing-check-time"),
    timeType: z.enum(["check_in", "check_out"]),
    operator: z.enum(["=", "<", ">"]),
    value: timeOfDaySchema,
    dateScope: pairingCheckTimeDateScopeSchema.nullable().optional(),
  }).strict(),
  z.object({
    type: z.literal("pairing-check-time"),
    timeType: z.enum(["check_in", "check_out"]),
    operator: z.literal("Between"),
    from: timeOfDaySchema,
    to: timeOfDaySchema,
    dateScope: pairingCheckTimeDateScopeSchema.nullable().optional(),
  }).strict(),
]) as z.ZodType<Extract<PbsPairingBidValue, { type: "pairing-check-time" }>>;

const flightLegsNumericBounds = pbsPairingPropertyCatalog.find(
  (property) => property.propertyCode === 107,
)?.numericBounds;

if (!flightLegsNumericBounds) {
  throw new Error("Flight Legs per Duty numeric bounds are missing from the property catalog.");
}

const flightLegCountSchema = z.number()
  .int()
  .min(flightLegsNumericBounds.min)
  .max(flightLegsNumericBounds.max);

export const flightLegsPerDutyBidSchema = z.union([
  z.object({
    type: z.literal("flight-legs-per-duty"),
    operator: z.enum(["=", "<", ">"]),
    legs: flightLegCountSchema,
    dateScope: pairingCheckTimeDateScopeSchema.nullable().optional(),
  }).strict(),
  z.object({
    type: z.literal("flight-legs-per-duty"),
    operator: z.literal("Between"),
    from: flightLegCountSchema,
    to: flightLegCountSchema,
    dateScope: pairingCheckTimeDateScopeSchema.nullable().optional(),
  }).strict().superRefine((bid, context) => {
    if (bid.from > bid.to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Flight Legs per Duty from legs cannot exceed to legs.",
      });
    }
  }),
]) as z.ZodType<Extract<PbsPairingBidValue, { type: "flight-legs-per-duty" }>>;

const pairingLengthDateScopeSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("specific_dates"),
    dates: z.array(dateValueSchema).min(1),
  }),
  z.object({
    mode: z.literal("date_range"),
    from: dateValueSchema,
    to: dateValueSchema,
  }),
]).superRefine((scope, context) => {
  if (scope.mode === "date_range" && scope.to < scope.from) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Pairing Length date range end must be on or after start.",
    });
  }
});

export const pairingLengthBidSchema = z.object({
  type: z.literal("pairing-length-preference"),
  minDays: z.number().int().positive().nullable(),
  maxDays: z.number().int().positive().nullable(),
  dateScope: pairingLengthDateScopeSchema.nullable().optional(),
  min: z.number().int().positive().optional(),
  max: z.number().int().positive().optional(),
}).strict().superRefine((bid, context) => {
  if (bid.minDays == null && bid.maxDays == null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Pairing Length requires minimum days or maximum days." });
  }

  if (bid.minDays != null && bid.maxDays != null && bid.minDays > bid.maxDays) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Pairing Length minimum days cannot exceed maximum days." });
  }
}) as z.ZodType<Extract<PbsPairingBidValue, { type: "pairing-length-preference" }>>;

const monthEndCarryoverDaysSchema = z.number().int().positive();

export const monthEndCarryoverBidSchema = z.union([
  z.object({
    type: z.literal("month-end-carryover"),
    operator: z.enum(["<", "=", ">"]),
    days: monthEndCarryoverDaysSchema,
  }).strict(),
  z.object({
    type: z.literal("month-end-carryover"),
    operator: z.literal("Between"),
    from: monthEndCarryoverDaysSchema,
    to: monthEndCarryoverDaysSchema,
  }).strict().superRefine((bid, context) => {
    if (bid.from > bid.to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Month-End Carryover from days cannot exceed to days.",
      });
    }
  }),
]) as z.ZodType<Extract<PbsPairingBidValue, { type: "month-end-carryover" }>>;

const flightNumberPreferenceDateScopeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("specific_dates"), dates: z.array(dateValueSchema).min(1) }),
  z.object({ mode: z.literal("date_range"), from: dateValueSchema, to: dateValueSchema }),
]).superRefine((scope, context) => {
  if (scope.mode === "date_range" && scope.to < scope.from) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Flight Number Preference date range end must be on or after start." });
  }
});

export const flightNumberPreferenceBidSchema = z.object({
  type: z.literal("flight-number-preference"),
  flightNumbers: z.array(z.string().trim().min(1).transform((value) => value.toUpperCase()))
    .min(1)
    .transform((values) => [...new Set(values)]),
  dateScope: flightNumberPreferenceDateScopeSchema.nullable().optional(),
}).strict() as z.ZodType<Extract<PbsPairingBidValue, { type: "flight-number-preference" }>>;

const redeyePreferenceDateScopeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("specific_dates"), dates: z.array(dateValueSchema).min(1) }),
  z.object({ mode: z.literal("date_range"), from: dateValueSchema, to: dateValueSchema }),
]).superRefine((scope, context) => {
  if (scope.mode === "date_range" && scope.to < scope.from) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Redeye Preference date range end must be on or after start." });
  }
});

export const redeyePreferenceBidSchema = z.object({
  type: z.literal("redeye-preference"),
  dateScope: redeyePreferenceDateScopeSchema.nullable().optional(),
}).strict() as z.ZodType<Extract<PbsPairingBidValue, { type: "redeye-preference" }>>;

const deadheadFlyingDateScopeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("specific_dates"), dates: z.array(dateValueSchema).min(1) }).strict(),
  z.object({ mode: z.literal("date_range"), from: dateValueSchema, to: dateValueSchema }).strict(),
]).superRefine((scope, context) => {
  if (scope.mode === "date_range" && scope.to < scope.from) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Deadhead Flying date range end must be on or after start." });
  }
});

export const deadheadFlyingBidSchema = z.object({
  type: z.literal("deadhead-flying"),
  mode: z.enum(["any-deadhead", "deadhead-only-duty"]),
  dateScope: deadheadFlyingDateScopeSchema.nullable().optional(),
}).strict() as z.ZodType<Extract<PbsPairingBidValue, { type: "deadhead-flying" }>>;

export const pairingDateOrDowListBidSchema = z.object({
  type: z.literal("date-or-dow-list"),
  dates: z.array(dateValueSchema),
  daysOfWeek: z.array(z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])),
}).refine((bid) => bid.dates.length > 0 || bid.daysOfWeek.length > 0);

const workDayPreferenceDateScopeSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("specific_dates"),
    dates: z.array(dateValueSchema).min(1),
  }).strict(),
  z.object({
    mode: z.literal("date_range"),
    from: dateValueSchema,
    to: dateValueSchema,
  }).strict(),
]);

export const workDayPreferenceBidSchema = z.object({
  type: z.literal("work-day-preference"),
  days: z.array(z.object({
    dayOfWeek: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
    checkInFrom: timeOfDaySchema.nullable(),
    checkInTo: timeOfDaySchema.nullable(),
  }).strict()).min(1),
  dateScope: workDayPreferenceDateScopeSchema.nullable().optional(),
}).strict().superRefine((bid, context) => {
  const weekdays = new Set<string>();
  for (const day of bid.days) {
    if (weekdays.has(day.dayOfWeek)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Work Day Preference weekdays must be unique." });
    }
    weekdays.add(day.dayOfWeek);

    if (day.checkInFrom != null && day.checkInTo != null && day.checkInFrom === day.checkInTo) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Work Day Preference check-in start and end cannot be equal." });
    }
  }

  if (bid.dateScope?.mode === "date_range" && bid.dateScope.to < bid.dateScope.from) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Work Day Preference date range end must be on or after start." });
  }
}) as z.ZodType<Extract<PbsPairingBidValue, { type: "work-day-preference" }>>;

const durationValueSchema = z.string()
  .regex(/^\d{1,3}:\d{2}$/)
  .refine((value) => Number.parseInt(value.split(":")[1] ?? "", 10) < 60);

const creditPrioritySchema = z.enum(["higher", "lower"]);
export const pairingDurationBidSchema = z.object({
  type: z.literal("duration"),
  value: durationValueSchema,
  operator: z.enum(["=", "<", ">"]).optional(),
  creditPriority: creditPrioritySchema.optional(),
});

export const pairingDurationRangeBidSchema = z.object({
  type: z.literal("duration-range"),
  from: durationValueSchema,
  to: durationValueSchema,
  creditPriority: creditPrioritySchema.optional(),
});

export const pairingPercentOrDurationBidSchema = z.object({
  type: z.literal("percent-or-duration"),
  unit: z.enum(["percent", "duration"]),
  value: z.string().min(1),
  operator: z.enum(["=", ">", "<"]).optional(),
  creditPriority: creditPrioritySchema.optional(),
}) as z.ZodType<Extract<PbsPairingBidValue, { type: "percent-or-duration" }>>;

const airportPreferenceDateScopeSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("specific_dates"),
    dates: z.array(dateValueSchema).min(1),
  }),
  z.object({
    mode: z.literal("date_range"),
    from: dateValueSchema,
    to: dateValueSchema,
  }),
]);

export const pairingAirportPreferenceBidSchema = z.object({
  type: z.literal("airport-preference"),
  event: z.enum(["landing", "layover", "landing_or_layover"]),
  locations: z.array(z.object({
    code: z.string().regex(/^[A-Za-z]{3}$/),
    kind: z.enum(["airport", "city"]),
  })).min(1),
  dateScope: airportPreferenceDateScopeSchema.nullable().optional(),
  minimumLayoverDuration: durationValueSchema.nullable().optional(),
}).strict().superRefine((bid, context) => {
  if (bid.event === "landing" && bid.minimumLayoverDuration != null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Landing Airport Preference cannot include layover duration." });
  }
}) as z.ZodType<Extract<PbsPairingBidValue, { type: "airport-preference" }>>;

export const pairingBidValueSchema = z.union([
  ruleBidValueSchema,
  pairingIdListBidSchema,
  pairingOccurrenceListBidSchema,
  pairingPreferenceBidSchema,
  efficientFlyingPreferenceBidSchema,
  pairingCheckTimeBidSchema,
  flightLegsPerDutyBidSchema,
  pairingLengthBidSchema,
  monthEndCarryoverBidSchema,
  flightNumberPreferenceBidSchema,
  redeyePreferenceBidSchema,
  deadheadFlyingBidSchema,
  pairingTimeConditionListBidSchema,
  pairingDateOrDowListBidSchema,
  workDayPreferenceBidSchema,
  pairingDurationBidSchema,
  pairingDurationRangeBidSchema,
  pairingPercentOrDurationBidSchema,
  pairingAirportPreferenceBidSchema,
]) as z.ZodType<PbsPairingBidValue>;

export const pairingSearchBidValueSchema = pairingBidValueSchema as z.ZodType<PbsPairingSearchPreviewProperty["bid"]>;
