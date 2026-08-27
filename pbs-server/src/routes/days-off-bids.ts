import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  pbsDaysOffBidRoutes,
  type PbsAddDaysOffCurrentPropertyRequest,
  type PbsDaysOffBidValue,
  type PbsLegacyDaysOffCurrentPropertyMutationRequest,
  type PbsPatchDaysOffCurrentPropertyRequest,
  type PbsPatchDaysOffFavoritePropertyRequest,
  type PbsPutDaysOffCurrentPropertyRequest,
  type PbsSaveDaysOffFavoritePropertyRequest,
  type PbsSaveDaysOffCurrentDraftRequest,
} from "../../../packages/contracts/pbs-days-off-bids.js";
import { LineholderBidServiceError } from "../services/lineholder/shared.js";
import { buildActorFromRequest, ruleBidValueSchema } from "./lineholder-route-utils.js";
import { fail, success } from "../utils/response.js";
import { sendPrivateJsonWithEtag } from "../utils/private-etag.js";

const daysOffBidValueSchema: z.ZodType<PbsDaysOffBidValue> = ruleBidValueSchema
  .refine((bid) => bid.type !== "credit-window-preference", {
    message: "Credit Window Preference bids are not valid for Days Off.",
  }) as z.ZodType<PbsDaysOffBidValue>;

const saveCurrentDraftSchema: z.ZodType<PbsSaveDaysOffCurrentDraftRequest> = z.object({
  draft: z.object({
    draftKey: z.string().min(1).optional(),
    bidId: z.number().int().positive().optional(),
    periodId: z.number().int().positive().nullable().optional(),
    draftVersion: z.number().int().nonnegative(),
    periodCode: z.string().min(1),
    bidContext: z.literal("Current"),
    remarks: z.string().optional(),
    properties: z.array(z.object({
      rowSeq: z.number().int().positive(),
      propertyCode: z.number().int().positive(),
      name: z.string().min(1),
      bid: daysOffBidValueSchema,
      tiers: z.array(z.string().min(2)),
      allOrNothing: z.boolean().optional(),
      minimumN: z.number().int().positive().nullable().optional(),
      maximumN: z.number().int().positive().nullable().optional(),
    })),
  }),
});

const currentPropertyMutationReferenceSchema = z.object({
  draftKey: z.string().min(1).optional(),
  bidId: z.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
  draftVersion: z.number().int().nonnegative(),
});

const currentPropertyMutationPayloadSchema = z.object({
  bid: daysOffBidValueSchema,
  tiers: z.array(z.string().min(2)),
  allOrNothing: z.boolean().optional(),
  minimumN: z.number().int().positive().nullable().optional(),
  maximumN: z.number().int().positive().nullable().optional(),
});

const addCurrentPropertySchema: z.ZodType<PbsAddDaysOffCurrentPropertyRequest> = currentPropertyMutationReferenceSchema.extend({
  remarks: z.string().optional(),
  propertyCode: z.number().int().positive(),
  ...currentPropertyMutationPayloadSchema.shape,
});

const putCurrentPropertySchema: z.ZodType<PbsPutDaysOffCurrentPropertyRequest> = currentPropertyMutationReferenceSchema.extend({
  ...currentPropertyMutationPayloadSchema.shape,
});

const patchCurrentPropertySchema: z.ZodType<PbsLegacyDaysOffCurrentPropertyMutationRequest> = z.object({
  draftKey: z.string().min(1).optional(),
  bidId: z.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
  bidContext: z.literal("Current"),
  draftVersion: z.number().int().nonnegative(),
  property: z.object({
    propertyCode: z.number().int().positive(),
    name: z.string().min(1),
    bid: daysOffBidValueSchema,
    tiers: z.array(z.string().min(2)),
    allOrNothing: z.boolean().optional(),
    minimumN: z.number().int().positive().nullable().optional(),
    maximumN: z.number().int().positive().nullable().optional(),
  }),
});

const removeCurrentPropertyQuerySchema = z.object({
  draftKey: z.string().min(1).optional(),
  bidId: z.coerce.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
  draftVersion: z.coerce.number().int().nonnegative(),
});

const removeCurrentPropertyParamsSchema = z.object({
  propertyGroupKey: z.string().min(1).max(36),
});

const saveFavoritePropertySchema: z.ZodType<PbsSaveDaysOffFavoritePropertyRequest> = z.object({
  ...currentPropertyMutationReferenceSchema.shape,
  propertyCode: z.number().int().positive(),
  action: z.enum(["award", "avoid"]).nullable().optional(),
  bid: daysOffBidValueSchema,
  allOrNothing: z.boolean().optional(),
  minimumN: z.number().int().positive().nullable().optional(),
  maximumN: z.number().int().positive().nullable().optional(),
}).strict();

const removeFavoritePropertyQuerySchema = z.object({
  draftKey: z.string().min(1).optional(),
  bidId: z.coerce.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
  draftVersion: z.coerce.number().int().nonnegative(),
}).strict();

const removeFavoritePropertyByKeyParamsSchema = z.object({
  favoriteKey: z.string().regex(/^\d+$/),
});

declare module "fastify" {
  interface FastifyInstance {
    daysOffBidService: import("../services/days-off/types.js").PbsDaysOffBidService;
  }
}

export default async function daysOffBidRoutes(fastify: FastifyInstance) {
  fastify.get(pbsDaysOffBidRoutes.current, async (request, reply) => {
    try {
      const result = await fastify.daysOffBidService.getCurrentDraft(buildActorFromRequest(request));
      return sendPrivateJsonWithEtag(request, reply, result);
    } catch (error) {
      if (error instanceof LineholderBidServiceError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "Failed to load the current days off draft");
      return fail(reply, 500, "Failed to load the current days off draft.");
    }
  });

  fastify.put(
    pbsDaysOffBidRoutes.current,
    async (
      request: FastifyRequest<{ Body: PbsSaveDaysOffCurrentDraftRequest }>,
      reply: FastifyReply,
    ) => {
      const parsed = saveCurrentDraftSchema.safeParse(request.body);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid days off draft payload.");
      }

      try {
        const result = await fastify.daysOffBidService.saveCurrentDraft(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to save the current days off draft");
        return fail(reply, 500, "Failed to save the current days off draft.");
      }
    },
  );

  fastify.post(
    pbsDaysOffBidRoutes.currentProperties,
    async (
      request: FastifyRequest<{ Body: PbsAddDaysOffCurrentPropertyRequest }>,
      reply: FastifyReply,
    ) => {
      const parsed = addCurrentPropertySchema.safeParse(request.body);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid days off property payload.");
      }

      try {
        const result = await fastify.daysOffBidService.addCurrentDraftProperty(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to add the current days off property");
        return fail(reply, 500, "Failed to add the current days off property.");
      }
    },
  );

  fastify.patch(
    pbsDaysOffBidRoutes.favoriteByKey(":favoriteKey"),
    async (
      request: FastifyRequest<{
        Body: PbsPatchDaysOffFavoritePropertyRequest;
        Params: { favoriteKey: string };
      }>,
      reply: FastifyReply,
    ) => {
      const parsedBody = saveFavoritePropertySchema.safeParse(request.body);
      const parsedParams = removeFavoritePropertyByKeyParamsSchema.safeParse(request.params);

      if (!parsedBody.success || !parsedParams.success) {
        return fail(reply, 400, "Invalid days off favorite payload.");
      }

      try {
        return success(reply, await fastify.daysOffBidService.patchFavoritePropertyByKey(
          buildActorFromRequest(request),
          parsedParams.data.favoriteKey,
          parsedBody.data,
        ));
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to patch the current days off favorite");
        return fail(reply, 500, "Failed to patch the current days off favorite.");
      }
    },
  );

  fastify.put(
    pbsDaysOffBidRoutes.currentPropertyByKey(":propertyGroupKey"),
    async (
      request: FastifyRequest<{
        Body: PbsPutDaysOffCurrentPropertyRequest;
        Params: { propertyGroupKey: string };
      }>,
      reply: FastifyReply,
    ) => {
      const parsedBody = putCurrentPropertySchema.safeParse(request.body);
      const parsedParams = removeCurrentPropertyParamsSchema.safeParse(request.params);

      if (!parsedBody.success || !parsedParams.success) {
        return fail(reply, 400, "Invalid days off property payload.");
      }

      try {
        const result = await fastify.daysOffBidService.patchCurrentDraftProperty(
          buildActorFromRequest(request),
          parsedParams.data.propertyGroupKey,
          parsedBody.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to update the current days off property");
        return fail(reply, 500, "Failed to update the current days off property.");
      }
    },
  );

  fastify.patch(
    pbsDaysOffBidRoutes.currentPropertyByKey(":propertyGroupKey"),
    async (
      request: FastifyRequest<{
        Body: PbsPatchDaysOffCurrentPropertyRequest;
        Params: { propertyGroupKey: string };
      }>,
      reply: FastifyReply,
    ) => {
      const parsedBody = patchCurrentPropertySchema.safeParse(request.body);
      const parsedParams = removeCurrentPropertyParamsSchema.safeParse(request.params);

      if (!parsedBody.success || !parsedParams.success) {
        return fail(reply, 400, "Invalid days off property patch payload.");
      }

      try {
        const result = await fastify.daysOffBidService.patchCurrentDraftProperty(
          buildActorFromRequest(request),
          parsedParams.data.propertyGroupKey,
          parsedBody.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to patch the current days off property");
        return fail(reply, 500, "Failed to patch the current days off property.");
      }
    },
  );

  fastify.delete(
    pbsDaysOffBidRoutes.currentPropertyByKey(":propertyGroupKey"),
    async (
      request: FastifyRequest<{
        Params: { propertyGroupKey: string };
        Querystring: { draftKey?: string; bidId?: number; periodCode?: string; draftVersion?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const parsedQuery = removeCurrentPropertyQuerySchema.safeParse(request.query);
      const parsedParams = removeCurrentPropertyParamsSchema.safeParse(request.params);

      if (!parsedQuery.success || !parsedParams.success) {
        return fail(reply, 400, "Invalid days off property delete payload.");
      }

      try {
        const result = await fastify.daysOffBidService.removeCurrentDraftProperty(
          buildActorFromRequest(request),
          parsedParams.data.propertyGroupKey,
          parsedQuery.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to remove the current days off property");
        return fail(reply, 500, "Failed to remove the current days off property.");
      }
    },
  );

  fastify.post(
    pbsDaysOffBidRoutes.currentFavorites,
    async (
      request: FastifyRequest<{
        Body: PbsSaveDaysOffFavoritePropertyRequest;
      }>,
      reply: FastifyReply,
    ) => {
      const parsedBody = saveFavoritePropertySchema.safeParse(request.body);

      if (!parsedBody.success) {
        return fail(reply, 400, "Invalid days off favorite payload.");
      }

      try {
        const result = await fastify.daysOffBidService.saveFavoriteProperty(
          buildActorFromRequest(request),
          parsedBody.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to save the current days off favorite");
        return fail(reply, 500, "Failed to save the current days off favorite.");
      }
    },
  );

  fastify.delete(
    pbsDaysOffBidRoutes.favoriteByKey(":favoriteKey"),
    async (
      request: FastifyRequest<{
        Params: { favoriteKey: string };
        Querystring: { draftKey?: string; bidId?: number; periodCode?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const parsedQuery = removeFavoritePropertyQuerySchema.safeParse(request.query);
      const parsedParams = removeFavoritePropertyByKeyParamsSchema.safeParse(request.params);

      if (!parsedQuery.success || !parsedParams.success) {
        return fail(reply, 400, "Invalid days off favorite payload.");
      }

      try {
        const result = await fastify.daysOffBidService.removeFavoritePropertyByKey(
          buildActorFromRequest(request),
          parsedParams.data.favoriteKey,
          parsedQuery.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to remove the current days off favorite");
        return fail(reply, 500, "Failed to remove the current days off favorite.");
      }
    },
  );
}
