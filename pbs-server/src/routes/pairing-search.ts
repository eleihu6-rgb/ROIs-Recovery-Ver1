import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  pbsFlightNumberSearchTypes,
  pbsSearchPairingRoutes,
  type PbsPairingCurrentRulesCountsRequest,
  type PbsPairingCurrentRulesCountsResponse,
  type PbsPairingDateOccurrencesResponse,
  type PbsPairingDetailsResponse,
  type PbsPairingDetailsRequest,
  type PbsPairingTierPoolsRequest,
  type PbsPairingTierPoolsResponse,
  type PbsCrewIdSearchResponse,
  type PbsFlightNumberSearchType,
  type PbsFlightNumberSearchResponse,
  type PbsPairingIdSearchResponse,
  type PbsPairingNumberFilterOptionsResponse,
  type PbsPairingOccurrencesResponse,
  type PbsTimeBetweenFlightsBoundsResponse,
  type PbsSearchPairingsPreviewRequest,
} from "../../../packages/contracts/pbs-search-pairings.js";
import { LineholderBidServiceError } from "../services/lineholder/shared.js";
import { pairingSearchBidValueSchema } from "./pairing-bid-route-schemas.js";
import { buildActorFromRequest } from "./lineholder-route-utils.js";
import { fail, success } from "../utils/response.js";

const searchPreviewPropertySchema = z.object({
  propertyCode: z.number().int().positive(),
  name: z.string().min(1),
  action: z.enum(["award", "avoid"]).nullable().optional(),
  quantifier: z.enum(["any", "every"]).nullable().optional(),
  bid: pairingSearchBidValueSchema,
});

const searchPreviewDraftPropertySchema = searchPreviewPropertySchema.extend({
  propertyGroupKey: z.string().min(1).max(36).optional(),
  rowSeq: z.number().int().positive(),
  tiers: z.array(z.string().min(2)),
});

const airportCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,4}$/);

const allPairingsFiltersSchema = z.object({
  pairingScope: z.literal("fly").optional(),
  pairingNumber: z.string().optional(),
  pairingNumbers: z.array(z.string().trim().min(1).max(32)).max(50).optional(),
  originDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  originDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  airport: z.string().optional(),
  airports: z.array(airportCodeSchema).max(50).optional(),
  layoverAirports: z.array(airportCodeSchema).max(50).optional(),
  timeFrom: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  timeTo: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  query: z.string().max(64).optional(),
  releaseTimeFrom: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  releaseTimeTo: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  durationDaysMin: z.number().int().positive().optional(),
  durationDaysMax: z.number().int().positive().optional(),
  creditMinutesMin: z.number().int().nonnegative().optional(),
  creditMinutesMax: z.number().int().nonnegative().optional(),
  layoverCountMin: z.number().int().nonnegative().optional(),
  layoverCountMax: z.number().int().nonnegative().optional(),
  hasRedeye: z.literal(true).optional(),
  hasDeadhead: z.literal(true).optional(),
}).superRefine((filters, context) => {
  const normalizedQuery = filters.query?.trim().replace(/\s+/g, " ") ?? "";

  if (normalizedQuery && normalizedQuery.split(" ").length > 6) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["query"],
      message: "Pairing search supports at most 6 search terms.",
    });
  }

  const ranges: Array<[number | string | undefined, number | string | undefined, string]> = [
    [filters.originDateFrom, filters.originDateTo, "originDateFrom"],
    [filters.releaseTimeFrom, filters.releaseTimeTo, "releaseTimeFrom"],
    [filters.durationDaysMin, filters.durationDaysMax, "durationDaysMin"],
    [filters.creditMinutesMin, filters.creditMinutesMax, "creditMinutesMin"],
    [filters.layoverCountMin, filters.layoverCountMax, "layoverCountMin"],
  ];

  for (const [from, to, path] of ranges) {
    if (from !== undefined && to !== undefined && from > to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message: "Range start cannot exceed range end.",
      });
    }
  }
});

const previewRequestSchema: z.ZodType<PbsSearchPairingsPreviewRequest> = z.object({
  rosterPeriodId: z.number().int().positive(),
  periodCode: z.string().min(1).optional(),
  preview: z.union([
    z.object({
      property: searchPreviewPropertySchema,
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().optional(),
    }),
    z.object({
      mode: z.literal("current_rules"),
      tier: z.string().min(2),
      properties: z.array(searchPreviewDraftPropertySchema),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().optional(),
    }),
    z.object({
      mode: z.literal("criteria"),
      properties: z.array(searchPreviewDraftPropertySchema),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().optional(),
    }),
    z.object({
      mode: z.literal("all_pairings"),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().optional(),
      filters: allPairingsFiltersSchema.optional(),
    }),
  ]),
});

const currentRulesCountsRequestSchema: z.ZodType<PbsPairingCurrentRulesCountsRequest> = z.object({
  rosterPeriodId: z.number().int().positive(),
  periodCode: z.string().min(1).optional(),
  tier: z.string().min(2),
  properties: z.array(searchPreviewDraftPropertySchema),
});

const currentRulesTierPoolsRequestSchema: z.ZodType<PbsPairingTierPoolsRequest> = z.object({
  rosterPeriodId: z.number().int().positive(),
  periodCode: z.string().min(1).optional(),
  tiers: z.array(z.string().min(2)).min(1),
  properties: z.array(searchPreviewDraftPropertySchema),
});

const pairingIdSearchQuerySchema = z.object({
  rosterPeriodId: z.coerce.number().int().positive(),
  query: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  periodCode: z.string().min(1).optional(),
});

const pairingNumberFilterOptionsQuerySchema = z.object({
  rosterPeriodId: z.coerce.number().int().positive(),
  periodCode: z.string().trim().min(1),
  query: z.string().max(64).optional(),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

const crewIdSearchQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

const flightNumberSearchQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  type: z.enum(pbsFlightNumberSearchTypes).optional(),
});

const pairingOccurrenceQuerySchema = z.object({
  pairingId: z.string().regex(/^\d+$/),
  rosterPeriodId: z.coerce.number().int().positive(),
  periodCode: z.string().min(1),
});

const pairingDateOccurrenceQuerySchema = z.object({
  originDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rosterPeriodId: z.coerce.number().int().positive(),
  periodCode: z.string().min(1),
});

const timeBetweenFlightsBoundsQuerySchema = z.object({
  rosterPeriodId: z.coerce.number().int().positive(),
  periodCode: z.string().min(1).optional(),
});

const airportOptionsQuerySchema = timeBetweenFlightsBoundsQuerySchema;

const pairingDetailsRequestSchema: z.ZodType<PbsPairingDetailsRequest> = z.object({
  rosterPeriodId: z.number().int().positive(),
  periodCode: z.string().min(1).optional(),
  targets: z.array(z.object({
    pairingId: z.string().regex(/^\d+$/),
    originDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })).min(1).max(50),
});

declare module "fastify" {
  interface FastifyInstance {
    pairingSearchService: import("../services/pairing-search/types.js").PbsPairingSearchService;
  }
}

export default async function pairingSearchRoutes(fastify: FastifyInstance) {
  fastify.get(
    pbsSearchPairingRoutes.pairingIds,
    async (
      request: FastifyRequest<{ Querystring: { rosterPeriodId?: string; query?: string; limit?: string; periodCode?: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = pairingIdSearchQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid pairing number search query.");
      }

      try {
        const result: PbsPairingIdSearchResponse = await fastify.pairingSearchService.searchPairingIds(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to search pairing numbers");
        return fail(reply, 500, "Failed to search pairing numbers.");
      }
    },
  );

  fastify.get(
    pbsSearchPairingRoutes.pairingNumberFilterOptions,
    async (
      request: FastifyRequest<{
        Querystring: { rosterPeriodId?: string; periodCode?: string; query?: string; cursor?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const parsed = pairingNumberFilterOptionsQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid Pairing Number option request.");
      }

      try {
        const result: PbsPairingNumberFilterOptionsResponse = await fastify.pairingSearchService
          .getPairingNumberFilterOptions(buildActorFromRequest(request), parsed.data);

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to load Pairing Number filter options");
        return fail(reply, 500, "Unable to load Pairing Numbers.");
      }
    },
  );

  fastify.get(
    pbsSearchPairingRoutes.crewIds,
    async (
      request: FastifyRequest<{ Querystring: { query?: string; limit?: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = crewIdSearchQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid crew id search query.");
      }

      try {
        const result: PbsCrewIdSearchResponse = await fastify.pairingSearchService.searchCrewIds(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        request.log.error({ error }, "Failed to search crew ids");
        return fail(reply, 500, "Failed to search crew ids.");
      }
    },
  );

  fastify.get(
    pbsSearchPairingRoutes.flightNumbers,
    async (
      request: FastifyRequest<{ Querystring: { query?: string; limit?: string; type?: PbsFlightNumberSearchType } }>,
      reply: FastifyReply,
    ) => {
      const parsed = flightNumberSearchQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid flight number search query.");
      }

      try {
        const result: PbsFlightNumberSearchResponse = await fastify.pairingSearchService.searchFlightNumbers(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to search flight numbers");
        return fail(reply, 500, "Failed to search flight numbers.");
      }
    },
  );

  fastify.get(
    pbsSearchPairingRoutes.pairingOccurrences,
    async (
      request: FastifyRequest<{ Querystring: { pairingId?: string; rosterPeriodId?: string; periodCode?: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = pairingOccurrenceQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid pairing occurrence query.");
      }

      try {
        const result: PbsPairingOccurrencesResponse = await fastify.pairingSearchService.searchPairingOccurrences(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to search pairing occurrences");
        return fail(reply, 500, "Failed to search pairing occurrences.");
      }
    },
  );

  fastify.get(
    pbsSearchPairingRoutes.pairingOccurrencesByDate,
    async (
      request: FastifyRequest<{ Querystring: { originDate?: string; rosterPeriodId?: string; periodCode?: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = pairingDateOccurrenceQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid pairing occurrence date query.");
      }

      try {
        const result: PbsPairingDateOccurrencesResponse = await fastify.pairingSearchService.searchPairingOccurrencesByDate(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to search pairing occurrences by date");
        return fail(reply, 500, "Failed to search pairing occurrences by date.");
      }
    },
  );

  fastify.post(
    pbsSearchPairingRoutes.pairingDetails,
    async (
      request: FastifyRequest<{ Body: PbsPairingDetailsRequest }>,
      reply: FastifyReply,
    ) => {
      const parsed = pairingDetailsRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid pairing details payload.");
      }

      try {
        const result: PbsPairingDetailsResponse = await fastify.pairingSearchService.getPairingDetails(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to load pairing details");
        return fail(reply, 500, "Failed to load pairing details.");
      }
    },
  );

  fastify.post(
    pbsSearchPairingRoutes.currentRulesCounts,
    async (
      request: FastifyRequest<{ Body: PbsPairingCurrentRulesCountsRequest }>,
      reply: FastifyReply,
    ) => {
      const parsed = currentRulesCountsRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid pairing current rules counts payload.");
      }

      try {
        const result: PbsPairingCurrentRulesCountsResponse = await fastify.pairingSearchService.countCurrentRules(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to count current pairing rules");
        return fail(reply, 500, "Failed to count current pairing rules.");
      }
    },
  );

  fastify.post(
    pbsSearchPairingRoutes.currentRulesTierPools,
    async (
      request: FastifyRequest<{ Body: PbsPairingTierPoolsRequest }>,
      reply: FastifyReply,
    ) => {
      const parsed = currentRulesTierPoolsRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid pairing current rules tier pools payload.");
      }

      try {
        const result: PbsPairingTierPoolsResponse = await fastify.pairingSearchService.countCurrentRuleTierPools(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to count current pairing rule tier pools");
        return fail(reply, 500, "Failed to count current pairing rule tier pools.");
      }
    },
  );

  fastify.get(
    pbsSearchPairingRoutes.airportOptions,
    async (
      request: FastifyRequest<{ Querystring: { rosterPeriodId?: string; periodCode?: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = airportOptionsQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid pairing airport options query.");
      }

      try {
        const result = await fastify.pairingSearchService.getAirportOptions(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to load pairing airport options");
        return fail(reply, 500, "Failed to load pairing airport options.");
      }
    },
  );

  fastify.get(
    pbsSearchPairingRoutes.timeBetweenFlightsBounds,
    async (
      request: FastifyRequest<{ Querystring: { rosterPeriodId?: string; periodCode?: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = timeBetweenFlightsBoundsQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid Time Between Flights bounds query.");
      }

      try {
        const result: PbsTimeBetweenFlightsBoundsResponse = await fastify.pairingSearchService.getTimeBetweenFlightsBounds(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to load Time Between Flights bounds");
        return fail(reply, 500, "Failed to load Time Between Flights bounds.");
      }
    },
  );

  fastify.post(
    pbsSearchPairingRoutes.preview,
    async (
      request: FastifyRequest<{ Body: PbsSearchPairingsPreviewRequest }>,
      reply: FastifyReply,
    ) => {
      const parsed = previewRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        return fail(reply, 400, "Invalid pairing search preview payload.");
      }

      try {
        const result = await fastify.pairingSearchService.previewPairings(
          buildActorFromRequest(request),
          parsed.data,
        );

        return success(reply, result);
      } catch (error) {
        if (error instanceof LineholderBidServiceError) {
          return fail(reply, error.statusCode, error.message);
        }

        request.log.error({ error }, "Failed to preview search pairings for a single property");
        return fail(reply, 500, "Failed to preview search pairings.");
      }
    },
  );
}
