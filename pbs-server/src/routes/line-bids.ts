import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  pbsLineBidRoutes,
  type PbsAddLineCurrentPropertyRequest,
  type PbsPatchLineCurrentPropertyRequest,
  type PbsPatchLineConfiguredFavoritePropertyRequest,
  type PbsSaveLineConfiguredFavoritePropertyRequest,
  type PbsSaveLineCurrentDraftRequest,
} from "../../../packages/contracts/pbs-line-bids.js";
import { LineholderBidServiceError } from "../services/lineholder/shared.js";
import { buildActorFromRequest, ruleBidValueSchema } from "./lineholder-route-utils.js";
import { fail, success } from "../utils/response.js";
import { sendPrivateJsonWithEtag } from "../utils/private-etag.js";

const lineBidActionSchema = z.enum(["award", "avoid"]).nullable().optional();

const lineDraftPropertySchema = z.object({
  propertyCode: z.number().int().positive(),
  name: z.string().min(1),
  action: lineBidActionSchema,
  bid: ruleBidValueSchema,
  tiers: z.array(z.string().min(2)),
});

const lineFavoritePropertySchema = z.object({
  propertyCode: z.number().int().positive(),
  name: z.string().min(1),
  action: lineBidActionSchema,
  bid: ruleBidValueSchema,
}).strict();

const saveCurrentDraftSchema: z.ZodType<PbsSaveLineCurrentDraftRequest> = z.object({
  draft: z.object({
    draftKey: z.string().min(1).optional(),
    bidId: z.number().int().positive().optional(),
    periodId: z.number().int().positive().nullable().optional(),
    draftVersion: z.number().int().nonnegative(),
    periodCode: z.string().min(1),
    bidContext: z.literal("Current"),
    remarks: z.string().optional(),
    properties: z.array(lineDraftPropertySchema.extend({
      rowSeq: z.number().int().positive(),
      propertyGroupKey: z.string().min(1).optional(),
    })),
  }),
});

const addCurrentPropertySchema: z.ZodType<PbsAddLineCurrentPropertyRequest> = z.object({
  draftKey: z.string().min(1).optional(),
  bidId: z.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
  bidContext: z.literal("Current"),
  draftVersion: z.number().int().nonnegative(),
  remarks: z.string().optional(),
  property: lineDraftPropertySchema,
});

const patchCurrentPropertySchema: z.ZodType<PbsPatchLineCurrentPropertyRequest> = z.object({
  draftKey: z.string().min(1).optional(),
  bidId: z.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
  bidContext: z.literal("Current"),
  draftVersion: z.number().int().nonnegative(),
  remarks: z.string().optional(),
  property: lineDraftPropertySchema,
});

const currentPropertyParamsSchema = z.object({
  propertyGroupKey: z.string().min(1).max(36),
});

const removeCurrentPropertyQuerySchema = z.object({
  draftKey: z.string().min(1).optional(),
  bidId: z.coerce.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
  draftVersion: z.coerce.number().int().nonnegative(),
});

const saveConfiguredFavoritePropertySchema: z.ZodType<PbsSaveLineConfiguredFavoritePropertyRequest> = z.object({
  draftKey: z.string().min(1).optional(),
  bidId: z.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
  draftVersion: z.number().int().nonnegative(),
  property: lineFavoritePropertySchema,
}).strict();

const removeFavoritePropertyQuerySchema = z.object({
  draftKey: z.string().min(1).optional(),
  bidId: z.coerce.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
  draftVersion: z.coerce.number().int().nonnegative(),
}).strict();

const removeFavoritePropertyByKeyParamsSchema = z.object({
  favoriteKey: z.string().regex(/^line-configured-\d+$/),
});

declare module "fastify" {
  interface FastifyInstance {
    lineBidService: import("../services/line/types.js").PbsLineBidService;
  }
}

export default async function lineBidRoutes(fastify: FastifyInstance) {
  fastify.get(pbsLineBidRoutes.creditWindowConfig, async (request, reply) => {
    try {
      buildActorFromRequest(request);
      return success(reply, await fastify.lineBidService.getCreditWindowConfig());
    } catch (error) {
      if (error instanceof LineholderBidServiceError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "Failed to load the line credit window configuration");
      return fail(reply, 500, "Failed to load the line credit window configuration.");
    }
  });

  fastify.get(pbsLineBidRoutes.minimumBaseLayoverConfig, async (request, reply) => {
    try {
      buildActorFromRequest(request);
      return success(reply, await fastify.lineBidService.getMinimumBaseLayoverConfig());
    } catch (error) {
      if (error instanceof LineholderBidServiceError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "Failed to load the line minimum base layover configuration");
      return fail(reply, 500, "Failed to load the line minimum base layover configuration.");
    }
  });

  fastify.get(pbsLineBidRoutes.current, async (request, reply) => {
    try {
      const result = await fastify.lineBidService.getCurrentDraft(buildActorFromRequest(request));
      return sendPrivateJsonWithEtag(request, reply, result);
    } catch (error) {
      if (error instanceof LineholderBidServiceError) {
        return fail(reply, error.statusCode, error.message);
      }

      request.log.error({ error }, "Failed to load the current line draft");
      return fail(reply, 500, "Failed to load the current line draft.");
    }
  });

  fastify.put(
    pbsLineBidRoutes.current,
    async (
      request: FastifyRequest<{ Body: PbsSaveLineCurrentDraftRequest }>,
      reply: FastifyReply,
    ) => {
      const parsed = saveCurrentDraftSchema.safeParse(request.body);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid line draft payload.");
      }

      try {
        const result = await fastify.lineBidService.saveCurrentDraft(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to save the current line draft");
        return fail(reply, 500, "Failed to save the current line draft.");
      }
    },
  );

  fastify.post(
    pbsLineBidRoutes.currentProperties,
    async (
      request: FastifyRequest<{ Body: PbsAddLineCurrentPropertyRequest }>,
      reply: FastifyReply,
    ) => {
      const parsed = addCurrentPropertySchema.safeParse(request.body);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid line property payload.");
      }

      try {
        const result = await fastify.lineBidService.addCurrentDraftProperty(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to add the current line property");
        return fail(reply, 500, "Failed to add the current line property.");
      }
    },
  );

  fastify.patch(
    pbsLineBidRoutes.favoriteByKey(":favoriteKey"),
    async (
      request: FastifyRequest<{
        Body: PbsPatchLineConfiguredFavoritePropertyRequest;
        Params: { favoriteKey: string };
      }>,
      reply: FastifyReply,
    ) => {
      const parsedBody = saveConfiguredFavoritePropertySchema.safeParse(request.body);
      const parsedParams = removeFavoritePropertyByKeyParamsSchema.safeParse(request.params);

      if (!parsedBody.success || !parsedParams.success) {
        return fail(reply, 400, "Invalid line favorite payload.");
      }

      try {
        return success(reply, await fastify.lineBidService.patchFavoritePropertyByKey(
          buildActorFromRequest(request),
          parsedParams.data.favoriteKey,
          parsedBody.data,
        ));
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to patch the current line favorite");
        return fail(reply, 500, "Failed to patch the current line favorite.");
      }
    },
  );

  fastify.patch(
    pbsLineBidRoutes.currentPropertyByKey(":propertyGroupKey"),
    async (
      request: FastifyRequest<{
        Body: PbsPatchLineCurrentPropertyRequest;
        Params: { propertyGroupKey: string };
      }>,
      reply: FastifyReply,
    ) => {
      const parsedBody = patchCurrentPropertySchema.safeParse(request.body);
      const parsedParams = currentPropertyParamsSchema.safeParse(request.params);

      if (!parsedBody.success || !parsedParams.success) {
        return fail(reply, 400, "Invalid line property patch payload.");
      }

      try {
        const result = await fastify.lineBidService.patchCurrentDraftProperty(
          buildActorFromRequest(request),
          parsedParams.data.propertyGroupKey,
          parsedBody.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to patch the current line property");
        return fail(reply, 500, "Failed to patch the current line property.");
      }
    },
  );

  fastify.delete(
    pbsLineBidRoutes.currentPropertyByKey(":propertyGroupKey"),
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
        return fail(reply, 400, "Invalid line property delete payload.");
      }

      try {
        const result = await fastify.lineBidService.removeCurrentDraftProperty(
          buildActorFromRequest(request),
          parsedParams.data.propertyGroupKey,
          parsedQuery.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to remove the current line property");
        return fail(reply, 500, "Failed to remove the current line property.");
      }
    },
  );

  fastify.post(
    pbsLineBidRoutes.currentFavorites,
    async (
      request: FastifyRequest<{ Body: PbsSaveLineConfiguredFavoritePropertyRequest }>,
      reply: FastifyReply,
    ) => {
      const parsed = saveConfiguredFavoritePropertySchema.safeParse(request.body);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid line favorite payload.");
      }

      try {
        const result = await fastify.lineBidService.saveConfiguredFavoriteProperty(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to save the current configured line favorite");
        return fail(reply, 500, "Failed to save the current line favorite.");
      }
    },
  );

  fastify.delete(
    pbsLineBidRoutes.favoriteByKey(":favoriteKey"),
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
        return fail(reply, 400, "Invalid line favorite payload.");
      }

      try {
        const result = await fastify.lineBidService.removeFavoritePropertyByKey(
          buildActorFromRequest(request),
          parsedParams.data.favoriteKey,
          parsedQuery.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to remove the current line favorite");
        return fail(reply, 500, "Failed to remove the current line favorite.");
      }
    },
  );
}
