import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { LineholderBidServiceError } from "../services/lineholder/shared.js";

export const ruleBidValueSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("flag"),
  }),
  z.object({
    type: z.literal("date"),
    value: z.string().min(1),
    operator: z.enum(["=", "<", ">"]).optional(),
  }),
  z.object({
    type: z.literal("stepper"),
    value: z.number().int(),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
    operator: z.enum(["=", "<", ">"]).optional(),
  }),
  z.object({
    type: z.literal("stepper-range"),
    from: z.number().int(),
    to: z.number().int(),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("stepper-date"),
    value: z.number().int(),
    date: z.string().min(1),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
    operator: z.enum(["=", "<", ">"]).optional(),
  }),
  z.object({
    type: z.literal("stepper-range-date"),
    from: z.number().int(),
    to: z.number().int(),
    date: z.string().min(1),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("stepper-date-range"),
    value: z.number().int(),
    from: z.string().min(1),
    to: z.string().min(1),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("days-off-on-pattern"),
    minDaysOff: z.number().int(),
    minDaysOn: z.number().int(),
    maxDaysOn: z.number().int(),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("credit-density-preference"),
    minimumTotalCredit: z.string().min(1),
    maximumWorkingDays: z.number().int(),
    strength: z.enum(["normal", "strong", "must_try"]),
  }),
  z.object({
    type: z.literal("minimum-base-layover"),
    minimumDuration: z.string(),
  }),
  z.object({
    type: z.literal("credit-window-preference"),
    direction: z.enum(["more", "less"]),
  }),
  z.object({
    type: z.literal("time"),
    value: z.string().min(1),
    operator: z.enum(["=", "<", ">"]).optional(),
  }),
  z.object({
    type: z.literal("time-range"),
    from: z.string().min(1),
    to: z.string().min(1),
  }),
  z.object({
    type: z.literal("time-date"),
    value: z.string().min(1),
    date: z.string().min(1),
    operator: z.enum(["=", "<", ">"]).optional(),
  }),
  z.object({
    type: z.literal("time-range-date"),
    from: z.string().min(1),
    to: z.string().min(1),
    date: z.string().min(1),
  }),
  z.object({
    type: z.literal("date-range"),
    from: z.string().min(1),
    to: z.string().min(1),
  }),
  z.object({
    type: z.literal("select"),
    value: z.string().min(1),
    options: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    type: z.literal("reserve-call-type-date-scope"),
    callType: z.string().min(1),
    options: z.array(z.string().min(1)).min(1),
    dateScope: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("whole_month") }),
      z.object({ mode: z.literal("first_half") }),
      z.object({ mode: z.literal("second_half") }),
      z.object({
        mode: z.literal("date_range"),
        from: z.string().min(1),
        to: z.string().min(1),
      }),
      z.object({
        mode: z.literal("specific_dates"),
        dates: z.array(z.string().min(1)),
      }),
    ]),
  }),
  z.object({
    type: z.literal("reserve-flying-date-pattern"),
    segments: z.array(z.discriminatedUnion("workType", [
      z.object({
        workType: z.literal("reserve"),
        callType: z.string().min(1),
        dateScope: z.discriminatedUnion("mode", [
          z.object({ mode: z.literal("whole_month") }),
          z.object({ mode: z.literal("first_half") }),
          z.object({ mode: z.literal("second_half") }),
          z.object({
            mode: z.literal("date_range"),
            from: z.string().min(1),
            to: z.string().min(1),
          }),
          z.object({
            mode: z.literal("specific_dates"),
            dates: z.array(z.string().min(1)),
          }),
        ]),
      }),
      z.object({
        workType: z.literal("flying"),
        dateScope: z.discriminatedUnion("mode", [
          z.object({ mode: z.literal("whole_month") }),
          z.object({ mode: z.literal("first_half") }),
          z.object({ mode: z.literal("second_half") }),
          z.object({
            mode: z.literal("date_range"),
            from: z.string().min(1),
            to: z.string().min(1),
          }),
          z.object({
            mode: z.literal("specific_dates"),
            dates: z.array(z.string().min(1)),
          }),
        ]),
      }),
    ])).min(1),
    callTypeOptions: z.array(z.string().min(1)),
    strength: z.enum(["normal", "strong", "must_try"]),
  }),
  z.object({
    type: z.literal("tag-list"),
    values: z.array(z.string().min(1)),
    suggestions: z.array(z.string().min(1)).optional(),
  }),
  z.object({
    type: z.literal("tag-list-date"),
    values: z.array(z.string().min(1)),
    date: z.string().min(1),
    suggestions: z.array(z.string().min(1)).optional(),
  }),
  z.object({
    type: z.literal("crew-days-off-share"),
    employeeNumber: z.string(),
    minimumDays: z.number().int(),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("employee-schedule-preference"),
    crewId: z.string(),
    crewName: z.string().optional(),
    relationship: z.enum(["together", "apart"]),
    scheduleType: z.enum(["work", "days_off"]),
    thresholdType: z.enum(["minimum", "maximum"]),
    days: z.number().int(),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("percent"),
    value: z.string().min(1),
    operator: z.enum(["=", "<", ">"]).optional(),
  }),
  z.object({
    type: z.literal("percent-range"),
    from: z.string().min(1),
    to: z.string().min(1),
  }),
  z.object({
    type: z.literal("text"),
    value: z.string(),
  }),
]);

export const buildActorFromRequest = (request: FastifyRequest) => {
  if (!request.authUser) {
    throw new LineholderBidServiceError(401, "Not authenticated.");
  }

  return {
    crewId: request.authUser.employeeNo,
    userCode: request.authUser.userCode,
    isAdmin: Boolean(request.authUser.isAdmin),
  };
};
