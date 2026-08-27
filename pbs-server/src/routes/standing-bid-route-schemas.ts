import { z } from "zod";
import type { PbsStandingBidValue } from "../../../packages/contracts/pbs-standing-bids.js";
import { pairingBidValueSchema } from "./pairing-bid-route-schemas.js";

const reusableStepperDateRangeBidSchema = z.object({
  type: z.literal("stepper-date-range"),
  value: z.number().int(),
  from: z.literal(""),
  to: z.literal(""),
  min: z.number().int().optional(),
  max: z.number().int().optional(),
}).strict();

export const standingBidValueSchema = z.union([
  reusableStepperDateRangeBidSchema,
  pairingBidValueSchema,
]) as z.ZodType<PbsStandingBidValue>;
