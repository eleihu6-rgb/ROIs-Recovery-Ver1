import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  pbsStandingBidContexts,
  pbsStandingBidRoutes,
  type PbsSaveStandingDraftRequest,
} from "../../../packages/contracts/pbs-standing-bids.js";
import { LineholderBidServiceError } from "../services/lineholder/shared.js";
import { buildActorFromRequest } from "./lineholder-route-utils.js";
import { standingBidValueSchema } from "./standing-bid-route-schemas.js";
import { fail, success } from "../utils/response.js";

const standingBidContextSchema = z.union([
  z.literal(pbsStandingBidContexts.lineholder),
  z.literal(pbsStandingBidContexts.reserve),
]);

const standingDraftPropertySchema = z.object({
  propertyGroupKey: z.string().min(1).optional(),
  rowSeq: z.number().int().positive(),
  bidType: z.enum(["DaysOff", "Pairing", "Line", "Reserve"]).optional(),
  propertyCode: z.number().int().positive(),
  name: z.string().min(1),
  action: z.enum(["award", "avoid"]).nullable().optional(),
  bid: standingBidValueSchema,
  tiers: z.array(z.string().min(2)),
}).refine((property) =>
  property.propertyCode !== 427 || property.action === "award" || property.action === "avoid",
);

const saveStandingDraftSchema: z.ZodType<PbsSaveStandingDraftRequest> = z.object({
  mode: z.enum(["lineholder", "reserve"]),
  draft: z.object({
    draftKey: z.string().min(1).optional(),
    bidId: z.number().int().positive().optional(),
    periodId: z.number().int().positive().nullable().optional(),
    draftVersion: z.number().int().nonnegative(),
    periodCode: z.string().min(1),
    bidContext: standingBidContextSchema,
    remarks: z.string().optional(),
    properties: z.array(standingDraftPropertySchema),
  }),
}).refine((payload) =>
  (payload.mode === "lineholder" && payload.draft.bidContext === pbsStandingBidContexts.lineholder)
  || (payload.mode === "reserve" && payload.draft.bidContext === pbsStandingBidContexts.reserve),
);

declare module "fastify" {
  interface FastifyInstance {
    standingBidService: import("../services/standing-bid/types.js").PbsStandingBidService;
  }
}

const handleStandingBidError = (
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  message: string,
) => {
  if (error instanceof LineholderBidServiceError) {
    return fail(reply, error.statusCode, error.message);
  }

  request.log.error({ error }, message);
  return fail(reply, 500, `${message}.`);
};

export default async function standingBidRoutes(fastify: FastifyInstance) {
  fastify.get(pbsStandingBidRoutes.current, async (request, reply) => {
    try {
      return success(reply, await fastify.standingBidService.getCurrentStandingBid(buildActorFromRequest(request)));
    } catch (error) {
      return handleStandingBidError(request, reply, error, "Failed to load Standing Bid");
    }
  });

  fastify.put(
    pbsStandingBidRoutes.current,
    async (
      request: FastifyRequest<{ Body: PbsSaveStandingDraftRequest }>,
      reply: FastifyReply,
    ) => {
      const parsed = saveStandingDraftSchema.safeParse(request.body);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid Standing Bid payload.");
      }

      try {
        return success(
          reply,
          await fastify.standingBidService.saveStandingDraft(buildActorFromRequest(request), parsed.data),
        );
      } catch (error) {
        return handleStandingBidError(request, reply, error, "Failed to save Standing Bid");
      }
    },
  );
}
