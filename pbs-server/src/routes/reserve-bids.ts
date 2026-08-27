import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  pbsReserveBidRoutes,
  type PbsAddReserveCurrentPropertyRequest,
  type PbsPatchReserveCurrentPropertyRequest,
  type PbsSaveReserveCurrentDraftRequest,
} from "../../../packages/contracts/pbs-reserve-bids.js";
import { LineholderBidServiceError } from "../services/lineholder/shared.js";
import { buildActorFromRequest } from "./lineholder-route-utils.js";
import { fail, success } from "../utils/response.js";

const reserveBidValueSchema = z.union([
  z.object({
    type: z.literal("select"),
    value: z.string(),
    options: z.array(z.string()),
  }),
  z.object({
    type: z.literal("reserve-call-type-date-scope"),
    callType: z.string(),
    options: z.array(z.string()),
    dateScope: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("whole_month") }),
      z.object({ mode: z.literal("first_half") }),
      z.object({ mode: z.literal("second_half") }),
      z.object({ mode: z.literal("date_range"), from: z.string(), to: z.string() }),
      z.object({ mode: z.literal("specific_dates"), dates: z.array(z.string()) }),
    ]),
  }),
  z.object({
    type: z.literal("tag-list"),
    values: z.array(z.string()),
    suggestions: z.array(z.string()).optional(),
  }),
]);

const reserveDraftPropertySchema = z.object({
  propertyGroupKey: z.string().min(1).optional(),
  rowSeq: z.number().int().positive().optional(),
  propertyCode: z.number().int().positive(),
  name: z.string().min(1),
  bid: reserveBidValueSchema,
  tiers: z.array(z.string().min(2)),
});

const saveCurrentDraftSchema: z.ZodType<PbsSaveReserveCurrentDraftRequest> = z.object({
  draft: z.object({
    draftKey: z.string().min(1).optional(),
    bidId: z.number().int().positive().optional(),
    periodId: z.number().int().positive().nullable().optional(),
    draftVersion: z.number().int().nonnegative(),
    periodCode: z.string().min(1),
    bidContext: z.literal("Current"),
    mode: z.union([z.literal("legacy"), z.literal("aa-prefer-off")]),
    remarks: z.string().optional(),
    properties: z.array(reserveDraftPropertySchema.extend({
      rowSeq: z.number().int().positive(),
    })),
  }),
});

const addCurrentPropertySchema: z.ZodType<PbsAddReserveCurrentPropertyRequest> = z.object({
  draftKey: z.string().min(1).optional(),
  bidId: z.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
  bidContext: z.literal("Current"),
  draftVersion: z.number().int().nonnegative(),
  remarks: z.string().optional(),
  property: reserveDraftPropertySchema.omit({ propertyGroupKey: true, rowSeq: true }),
});

const patchCurrentPropertySchema: z.ZodType<PbsPatchReserveCurrentPropertyRequest> = addCurrentPropertySchema;

const currentPropertyParamsSchema = z.object({
  propertyGroupKey: z.string().min(1).max(36),
});

const removeCurrentPropertyQuerySchema = z.object({
  draftKey: z.string().min(1).optional(),
  bidId: z.coerce.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
  draftVersion: z.coerce.number().int().nonnegative(),
});

declare module "fastify" {
  interface FastifyInstance {
    reserveBidService: import("../services/reserve/types.js").PbsReserveBidService;
  }
}

const handleReserveError = (
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

export default async function reserveBidRoutes(fastify: FastifyInstance) {
  fastify.get(pbsReserveBidRoutes.current, async (request, reply) => {
    try {
      return success(reply, await fastify.reserveBidService.getCurrentDraft(buildActorFromRequest(request)));
    } catch (error) {
      return handleReserveError(request, reply, error, "Failed to load the current reserve draft");
    }
  });

  fastify.put(
    pbsReserveBidRoutes.current,
    async (
      request: FastifyRequest<{ Body: PbsSaveReserveCurrentDraftRequest }>,
      reply: FastifyReply,
    ) => {
      const parsed = saveCurrentDraftSchema.safeParse(request.body);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid reserve draft payload.");
      }

      try {
        return success(
          reply,
          await fastify.reserveBidService.saveCurrentDraft(buildActorFromRequest(request), parsed.data),
        );
      } catch (error) {
        return handleReserveError(request, reply, error, "Failed to save the current reserve draft");
      }
    },
  );

  fastify.get(pbsReserveBidRoutes.currentCoverage, async (request, reply) => {
    try {
      return success(reply, await fastify.reserveBidService.getCurrentCoverage(buildActorFromRequest(request)));
    } catch (error) {
      return handleReserveError(request, reply, error, "Failed to load reserve coverage");
    }
  });

  fastify.post(
    pbsReserveBidRoutes.currentProperties,
    async (
      request: FastifyRequest<{ Body: PbsAddReserveCurrentPropertyRequest }>,
      reply: FastifyReply,
    ) => {
      const parsed = addCurrentPropertySchema.safeParse(request.body);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid reserve property payload.");
      }

      try {
        return success(
          reply,
          await fastify.reserveBidService.addCurrentDraftProperty(buildActorFromRequest(request), parsed.data),
        );
      } catch (error) {
        return handleReserveError(request, reply, error, "Failed to add the current reserve property");
      }
    },
  );

  fastify.patch(
    pbsReserveBidRoutes.currentPropertyByKey(":propertyGroupKey"),
    async (
      request: FastifyRequest<{
        Body: PbsPatchReserveCurrentPropertyRequest;
        Params: { propertyGroupKey: string };
      }>,
      reply: FastifyReply,
    ) => {
      const parsedBody = patchCurrentPropertySchema.safeParse(request.body);
      const parsedParams = currentPropertyParamsSchema.safeParse(request.params);

      if (!parsedBody.success || !parsedParams.success) {
        return fail(reply, 400, "Invalid reserve property patch payload.");
      }

      try {
        return success(
          reply,
          await fastify.reserveBidService.patchCurrentDraftProperty(
            buildActorFromRequest(request),
            parsedParams.data.propertyGroupKey,
            parsedBody.data,
          ),
        );
      } catch (error) {
        return handleReserveError(request, reply, error, "Failed to patch the current reserve property");
      }
    },
  );

  fastify.delete(
    pbsReserveBidRoutes.currentPropertyByKey(":propertyGroupKey"),
    async (
      request: FastifyRequest<{
        Params: { propertyGroupKey: string };
        Querystring: { draftKey?: string; bidId?: number; periodCode?: string; draftVersion?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const parsedQuery = removeCurrentPropertyQuerySchema.safeParse(request.query);
      const parsedParams = currentPropertyParamsSchema.safeParse(request.params);

      if (!parsedQuery.success || !parsedParams.success) {
        return fail(reply, 400, "Invalid reserve property delete payload.");
      }

      try {
        return success(
          reply,
          await fastify.reserveBidService.removeCurrentDraftProperty(
            buildActorFromRequest(request),
            parsedParams.data.propertyGroupKey,
            parsedQuery.data,
          ),
        );
      } catch (error) {
        return handleReserveError(request, reply, error, "Failed to remove the current reserve property");
      }
    },
  );
}
