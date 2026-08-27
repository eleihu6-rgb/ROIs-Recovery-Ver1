import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  pbsPairingBidRoutes,
  type PbsAddPairingCurrentPropertyRequest,
  type PbsPatchPairingFavoritePropertyRequest,
  type PbsPatchPairingCurrentPropertyRequest,
  type PbsSavePairingFavoritePropertyRequest,
  type PbsSavePairingCurrentDraftRequest,
} from "../../../packages/contracts/pbs-pairing-bids.js";
import { pairingBidValueSchema } from "./pairing-bid-route-schemas.js";
import { LineholderBidServiceError } from "../services/lineholder/shared.js";
import { validatePairingPropertyPayload } from "../services/pairing/pairing-property-validation.js";
import { buildActorFromRequest } from "./lineholder-route-utils.js";
import { fail, success } from "../utils/response.js";

const saveCurrentDraftSchema: z.ZodType<PbsSavePairingCurrentDraftRequest> = z.object({
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
      propertyGroupKey: z.string().min(1).max(36).optional(),
      name: z.string().min(1),
      action: z.enum(["award", "avoid"]).nullable().optional(),
      quantifier: z.enum(["any", "every"]).nullable().optional(),
      bid: pairingBidValueSchema,
      tiers: z.array(z.string().min(2)),
    })),
  }),
});

const saveFavoritePropertySchema: z.ZodType<PbsSavePairingFavoritePropertyRequest> = z.object({
  draftKey: z.string().min(1).optional(),
  bidId: z.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
  draftVersion: z.number().int().nonnegative(),
  property: z.object({
    propertyCode: z.number().int().positive(),
    name: z.string().min(1),
    action: z.enum(["award", "avoid"]).nullable().optional(),
    quantifier: z.enum(["any", "every"]).nullable().optional(),
    bid: pairingBidValueSchema,
  }).strict(),
}).strict();

const addCurrentPropertySchema: z.ZodType<PbsAddPairingCurrentPropertyRequest> = z.object({
  draftKey: z.string().min(1).optional(),
  bidId: z.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
  bidContext: z.literal("Current"),
  draftVersion: z.number().int().nonnegative(),
  remarks: z.string().optional(),
  property: z.object({
    propertyCode: z.number().int().positive(),
    name: z.string().min(1),
    action: z.enum(["award", "avoid"]).nullable().optional(),
    quantifier: z.enum(["any", "every"]).nullable().optional(),
    bid: pairingBidValueSchema,
    tiers: z.array(z.string().min(2)),
  }),
});

const patchCurrentPropertySchema: z.ZodType<PbsPatchPairingCurrentPropertyRequest> = z.object({
  draftKey: z.string().min(1).optional(),
  bidId: z.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
  bidContext: z.literal("Current"),
  draftVersion: z.number().int().nonnegative(),
  property: z.object({
    propertyCode: z.number().int().positive(),
    name: z.string().min(1),
    action: z.enum(["award", "avoid"]).nullable().optional(),
    quantifier: z.enum(["any", "every"]).nullable().optional(),
    bid: pairingBidValueSchema,
    tiers: z.array(z.string().min(2)),
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
    pairingBidService: import("../services/pairing/types.js").PbsPairingBidService;
  }
}

export default async function pairingBidRoutes(fastify: FastifyInstance) {
  fastify.get(pbsPairingBidRoutes.redeyeConfig, async (request, reply) => {
    try {
      const config = await fastify.pairingBidService.getRedeyeConfig();
      if (!config.available) {
        return fail(reply, 503, "Redeye configuration is unavailable.");
      }
      return success(reply, config);
    } catch (caught) {
      request.log.error({ error: caught }, "Failed to load Redeye configuration");
      return fail(reply, 500, "Failed to load Redeye configuration.");
    }
  });

  fastify.get(pbsPairingBidRoutes.efficientFlyingConfig, async (request, reply) => {
    try {
      return success(reply, await fastify.pairingBidService.getEfficientFlyingConfig());
    } catch (error) {
      if (error instanceof LineholderBidServiceError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "Failed to load efficient flying configuration");
      return fail(reply, 500, "Failed to load efficient flying configuration.");
    }
  });

  fastify.get(pbsPairingBidRoutes.referenceOptions, async (request, reply) => {
    try {
      const result = await fastify.pairingBidService.getReferenceOptions();
      return success(reply, result);
    } catch (error) {
      request.log.error({ error }, "Failed to load pairing reference options");
      return fail(reply, 500, "Failed to load pairing reference options.");
    }
  });

  fastify.get(pbsPairingBidRoutes.current, async (request, reply) => {
    try {
      const result = await fastify.pairingBidService.getCurrentDraft(buildActorFromRequest(request));
      return success(reply, result);
    } catch (error) {
      if (error instanceof LineholderBidServiceError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "Failed to load the current pairing draft");
      return fail(reply, 500, "Failed to load the current pairing draft.");
    }
  });

  fastify.put(
    pbsPairingBidRoutes.current,
    async (
      request: FastifyRequest<{ Body: PbsSavePairingCurrentDraftRequest }>,
      reply: FastifyReply,
    ) => {
      const parsed = saveCurrentDraftSchema.safeParse(request.body);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid pairing draft payload.");
      }

      const validationMessage = parsed.data.draft.properties
        .map((property) => validatePairingPropertyPayload(property, parsed.data.draft.periodCode))
        .find((message) => message !== null);

      if (validationMessage) {
        return fail(reply, 400, validationMessage);
      }

      try {
        const result = await fastify.pairingBidService.saveCurrentDraft(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to save the current pairing draft");
        return fail(reply, 500, "Failed to save the current pairing draft.");
      }
    },
  );

  fastify.post(
    pbsPairingBidRoutes.currentProperties,
    async (
      request: FastifyRequest<{ Body: PbsAddPairingCurrentPropertyRequest }>,
      reply: FastifyReply,
    ) => {
      const parsed = addCurrentPropertySchema.safeParse(request.body);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid pairing property payload.");
      }

      const validationMessage = validatePairingPropertyPayload(parsed.data.property, parsed.data.periodCode);

      if (validationMessage) {
        return fail(reply, 400, validationMessage);
      }

      try {
        const result = await fastify.pairingBidService.addCurrentDraftProperty(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to add the current pairing property");
        return fail(reply, 500, "Failed to add the current pairing property.");
      }
    },
  );

  fastify.patch(
    pbsPairingBidRoutes.currentPropertyByKey(":propertyGroupKey"),
    async (
      request: FastifyRequest<{
        Body: PbsPatchPairingCurrentPropertyRequest;
        Params: { propertyGroupKey: string };
      }>,
      reply: FastifyReply,
    ) => {
      const parsedBody = patchCurrentPropertySchema.safeParse(request.body);
      const parsedParams = removeCurrentPropertyParamsSchema.safeParse(request.params);

      if (!parsedBody.success || !parsedParams.success) {
        return fail(reply, 400, "Invalid pairing property patch payload.");
      }

      const validationMessage = validatePairingPropertyPayload(parsedBody.data.property, parsedBody.data.periodCode);

      if (validationMessage) {
        return fail(reply, 400, validationMessage);
      }

      try {
        const result = await fastify.pairingBidService.patchCurrentDraftProperty(
          buildActorFromRequest(request),
          parsedParams.data.propertyGroupKey,
          parsedBody.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to patch the current pairing property");
        return fail(reply, 500, "Failed to patch the current pairing property.");
      }
    },
  );

  fastify.delete(
    pbsPairingBidRoutes.currentPropertyByKey(":propertyGroupKey"),
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
        return fail(reply, 400, "Invalid pairing property delete payload.");
      }

      try {
        const result = await fastify.pairingBidService.removeCurrentDraftProperty(
          buildActorFromRequest(request),
          parsedParams.data.propertyGroupKey,
          parsedQuery.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to remove the current pairing property");
        return fail(reply, 500, "Failed to remove the current pairing property.");
      }
    },
  );

  fastify.post(
    pbsPairingBidRoutes.currentFavorites,
    async (
      request: FastifyRequest<{
        Body: PbsSavePairingFavoritePropertyRequest;
      }>,
      reply: FastifyReply,
    ) => {
      const parsedBody = saveFavoritePropertySchema.safeParse(request.body);

      if (!parsedBody.success) {
        return fail(reply, 400, "Invalid pairing favorite payload.");
      }

      const validationMessage = validatePairingPropertyPayload(parsedBody.data.property, parsedBody.data.periodCode);

      if (validationMessage) {
        return fail(reply, 400, validationMessage);
      }

      try {
        const result = await fastify.pairingBidService.saveConfiguredFavoriteProperty(
          buildActorFromRequest(request),
          parsedBody.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to save the current pairing favorite");
        return fail(reply, 500, "Failed to save the current pairing favorite.");
      }
    },
  );

  fastify.patch(
    pbsPairingBidRoutes.favoriteByKey(":favoriteKey"),
    async (
      request: FastifyRequest<{
        Body: PbsPatchPairingFavoritePropertyRequest;
        Params: { favoriteKey: string };
      }>,
      reply: FastifyReply,
    ) => {
      const parsedBody = saveFavoritePropertySchema.safeParse(request.body);
      const parsedParams = removeFavoritePropertyByKeyParamsSchema.safeParse(request.params);

      if (!parsedBody.success || !parsedParams.success) {
        return fail(reply, 400, "Invalid pairing favorite payload.");
      }

      const validationMessage = validatePairingPropertyPayload(parsedBody.data.property, parsedBody.data.periodCode);

      if (validationMessage) {
        return fail(reply, 400, validationMessage);
      }

      try {
        const result = await fastify.pairingBidService.patchFavoritePropertyByKey(
          buildActorFromRequest(request),
          parsedParams.data.favoriteKey,
          parsedBody.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to patch the current pairing favorite");
        return fail(reply, 500, "Failed to patch the current pairing favorite.");
      }
    },
  );

  fastify.delete(
    pbsPairingBidRoutes.favoriteByKey(":favoriteKey"),
    async (
      request: FastifyRequest<{
        Params: { favoriteKey: string };
        Querystring: { draftKey?: string; periodCode?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const parsedQuery = removeFavoritePropertyQuerySchema.safeParse(request.query);
      const parsedParams = removeFavoritePropertyByKeyParamsSchema.safeParse(request.params);

      if (!parsedQuery.success || !parsedParams.success) {
        return fail(reply, 400, "Invalid pairing favorite payload.");
      }

      try {
        const result = await fastify.pairingBidService.removeFavoritePropertyByKey(
          buildActorFromRequest(request),
          parsedParams.data.favoriteKey,
          parsedQuery.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to remove the current pairing favorite");
        return fail(reply, 500, "Failed to remove the current pairing favorite.");
      }
    },
  );

}
