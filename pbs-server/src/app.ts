import compress from "@fastify/compress";
import cors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import formbody from "@fastify/formbody";
import Fastify from "fastify";
import { env } from "./config/index.js";
import databasePlugin from "./plugins/database.js";
import redisPlugin from "./plugins/redis.js";
import authPlugin from "./plugins/auth.js";
import metricsPlugin, { observePbsHttpResponse } from "./plugins/metrics.js";
import securityHeadersPlugin from "./plugins/security-headers.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import ssoRoutes from "./routes/sso.js";
import pairingBidRoutes from "./routes/pairing-bids.js";
import lineBidRoutes from "./routes/line-bids.js";
import daysOffBidRoutes from "./routes/days-off-bids.js";
import reserveBidRoutes from "./routes/reserve-bids.js";
import standingBidRoutes from "./routes/standing-bids.js";
import biddingCalendarRoutes from "./routes/bidding-calendar.js";
import lineholderSummaryRoutes from "./routes/lineholder-summary.js";
import algorithmExportRoutes from "./routes/algorithm-export.js";
import dashboardProfileRoutes from "./routes/dashboard-profile.js";
import dashboardSummaryRoutes from "./routes/dashboard-summary.js";
import portalBootstrapRoutes from "./routes/portal-bootstrap.js";
import pbsUserRoutes from "./routes/pbs-users.js";
import awardResultsRoutes from "./routes/award-results.js";
import bidFeedbackRoutes from "./routes/bid-feedback.js";
import bidFeedbackWsRoutes from "./routes/bid-feedback-ws.js";
import simulatedCrewPortalRoutes from "./routes/simulated-crew-portal.js";
import { createPbsAuthService } from "./services/auth/auth-service.js";
import type { PbsAuthService } from "./services/auth/types.js";
import { createSimulatedLoginReplayGuard } from "./services/simulated-crew-portal/simulated-crew-portal-replay-guard.js";
import { createPbsDashboardProfileService } from "./services/dashboard-profile/dashboard-profile-service.js";
import type { PbsDashboardProfileService } from "./services/dashboard-profile/types.js";
import { createPbsDashboardSummaryService } from "./services/dashboard-summary/dashboard-summary-service.js";
import type { PbsDashboardSummaryService } from "./services/dashboard-summary/types.js";
import { createPbsPairingBidService } from "./services/pairing/pairing-bid-service.js";
import type { PbsPairingBidService } from "./services/pairing/types.js";
import { createPbsLineBidService } from "./services/line/line-bid-service.js";
import type { PbsLineBidService } from "./services/line/types.js";
import { createPbsDaysOffBidService } from "./services/days-off/days-off-bid-service.js";
import type { PbsDaysOffBidService } from "./services/days-off/types.js";
import { createPbsReserveBidService } from "./services/reserve/reserve-bid-service.js";
import type { PbsReserveBidService } from "./services/reserve/types.js";
import { createPbsStandingBidService } from "./services/standing-bid/standing-bid-service.js";
import type { PbsStandingBidService } from "./services/standing-bid/types.js";
import { createPbsBiddingCalendarService } from "./services/calendar/bidding-calendar-service.js";
import type { PbsBiddingCalendarService } from "./services/calendar/types.js";
import { createPbsLineholderSummaryService } from "./services/lineholder/lineholder-summary-service.js";
import type { PbsLineholderSummaryService } from "./services/lineholder/types.js";
import pairingSearchRoutes from "./routes/pairing-search.js";
import { createPbsPairingSearchService } from "./services/pairing-search/pairing-search-service.js";
import type { PbsPairingSearchService } from "./services/pairing-search/types.js";
import { createPbsUserService } from "./services/pbs-user/pbs-user-service.js";
import type { PbsUserService } from "./services/pbs-user/types.js";
import { createPbsAwardResultsService } from "./services/award/award-results-service.js";
import type { PbsAwardResultsService } from "./services/award/types.js";
import { createPbsBidFeedbackService } from "./services/bid-feedback/bid-feedback-service.js";
import type { PbsBidFeedbackService } from "./services/bid-feedback/types.js";
import { createPbsCache, type PbsCache, type PbsCacheRedis } from "./utils/cache.js";

type BuildServerOptions = {
  authService?: PbsAuthService;
  dashboardProfileService?: PbsDashboardProfileService;
  dashboardSummaryService?: PbsDashboardSummaryService;
  pairingBidService?: PbsPairingBidService;
  lineBidService?: PbsLineBidService;
  daysOffBidService?: PbsDaysOffBidService;
  reserveBidService?: PbsReserveBidService;
  standingBidService?: PbsStandingBidService;
  biddingCalendarService?: PbsBiddingCalendarService;
  lineholderSummaryService?: PbsLineholderSummaryService;
  pairingSearchService?: PbsPairingSearchService;
  pbsUserService?: PbsUserService;
  awardResultsService?: PbsAwardResultsService;
  bidFeedbackService?: PbsBidFeedbackService;
  cache?: PbsCache;
  skipDatabase?: boolean;
  skipRedis?: boolean;
};

export const buildServer = async (options: BuildServerOptions = {}) => {
  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });
  const slowApiRequestThresholdMs = 2_000;

  server.addHook("onResponse", async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      // Use the matched route template (not request.url) to keep query strings
      // and path params out of the metric label — they are high-cardinality.
      const route = request.routeOptions.url ?? "unknown";
      const rawContentLength = reply.getHeader("content-length");
      const responseBytes = typeof rawContentLength === "number"
        ? rawContentLength
        : Number.parseInt(String(rawContentLength ?? "0"), 10) || 0;

      observePbsHttpResponse({
        method: request.method,
        route,
        statusCode: reply.statusCode,
        elapsedMs: reply.elapsedTime,
        responseBytes,
      });

      if (reply.elapsedTime >= slowApiRequestThresholdMs) {
        request.log.warn({
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          elapsedMs: Math.round(reply.elapsedTime),
        }, "Slow PBS API request");
      }
    }
  });

  // 安全响应头（helmet）：尽早注册，覆盖后续所有路由响应
  await server.register(securityHeadersPlugin);

  // 响应压缩：海外客户端缩小传输体积，gzip-only，仅压缩 >1KB 的响应
  await server.register(compress, {
    global: true,
    encodings: ["gzip"],
    threshold: 1024,
  });

  // WebSocket（异步 eligibility 结果推送）
  await server.register(fastifyWebsocket);

  await server.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await server.register(multipart, {
    limits: {
      files: 1,
      fileSize: 25 * 1024 * 1024,
      fields: 16,
      parts: 20,
    },
  });
  await server.register(formbody);

  await server.register(metricsPlugin);

  if (!options.skipDatabase) {
    await server.register(databasePlugin);
  }

  if (!options.skipDatabase && !options.skipRedis) {
    await server.register(redisPlugin);
  }

  const pbsCache = options.cache ?? (!options.skipDatabase && !options.skipRedis
    ? createPbsCache({
      redis: server.redis as unknown as PbsCacheRedis,
      schema: env.PBS_SCHEMA,
      logger: server.log,
    })
    : undefined);
  let defaultPairingBidService: PbsPairingBidService | undefined;

  if (options.authService) {
    server.decorate("authService", options.authService);
  } else {
    server.decorate("authService", createPbsAuthService({
      db: server.db,
      simulatedLoginReplayGuard: !options.skipDatabase && !options.skipRedis
        ? createSimulatedLoginReplayGuard({
          redis: server.redis as unknown as PbsCacheRedis,
          schema: env.PBS_SCHEMA,
        })
        : undefined,
    }));
  }

  if (options.dashboardProfileService) {
    server.decorate("dashboardProfileService", options.dashboardProfileService);
  } else if (options.skipDatabase) {
    server.decorate("dashboardProfileService", {
      async getCurrentProfile() {
        throw new Error("dashboardProfileService is unavailable when skipDatabase=true without an injected mock");
      },
    } satisfies PbsDashboardProfileService);
  } else {
    server.decorate("dashboardProfileService", createPbsDashboardProfileService({
      db: server.db,
      pgPool: server.pgPool,
      liveSchema: env.LIVE_SCHEMA,
      cache: pbsCache,
    }));
  }

  if (options.dashboardSummaryService) {
    server.decorate("dashboardSummaryService", options.dashboardSummaryService);
  } else if (options.skipDatabase) {
    server.decorate("dashboardSummaryService", {
      async getCurrentSummary() {
        throw new Error("dashboardSummaryService is unavailable when skipDatabase=true without an injected mock");
      },
    } satisfies PbsDashboardSummaryService);
  } else {
    server.decorate("dashboardSummaryService", createPbsDashboardSummaryService({
      db: server.db,
      pgPool: server.pgPool,
      liveSchema: env.LIVE_SCHEMA,
      pbsSchema: env.PBS_SCHEMA,
      dashboardProfileService: server.dashboardProfileService,
      cache: pbsCache,
    }));
  }

  if (options.pairingBidService) {
    server.decorate("pairingBidService", options.pairingBidService);
  } else {
    defaultPairingBidService = createPbsPairingBidService({
      db: server.db,
      pgPool: server.pgPool,
      liveSchema: env.LIVE_SCHEMA,
      cache: pbsCache,
    });
    server.decorate("pairingBidService", defaultPairingBidService);
  }

  if (options.lineBidService) {
    server.decorate("lineBidService", options.lineBidService);
  } else {
    server.decorate("lineBidService", createPbsLineBidService({
      db: server.db,
      cache: pbsCache,
    }));
  }

  if (options.daysOffBidService) {
    server.decorate("daysOffBidService", options.daysOffBidService);
  } else {
    server.decorate("daysOffBidService", createPbsDaysOffBidService({
      db: server.db,
      cache: pbsCache,
      mutationTimingLogger(event) {
        const payload = { daysOffMutation: event };

        if (event.elapsedMs >= slowApiRequestThresholdMs) {
          server.log.warn(payload, "Slow PBS days off mutation segment timing");
          return;
        }

        server.log.debug(payload, "PBS days off mutation segment timing");
      },
    }));
  }

  if (options.biddingCalendarService) {
    server.decorate("biddingCalendarService", options.biddingCalendarService);
  } else if (options.skipDatabase) {
    server.decorate("biddingCalendarService", {
      async getCurrentCalendar() {
        throw new Error("biddingCalendarService is unavailable when skipDatabase=true without an injected mock");
      },
    } satisfies PbsBiddingCalendarService);
  } else {
    server.decorate("biddingCalendarService", createPbsBiddingCalendarService({
      db: server.db,
      pgPool: server.pgPool,
      liveSchema: env.LIVE_SCHEMA,
      pbsSchema: env.PBS_SCHEMA,
      cache: pbsCache,
    }));
  }

  if (options.reserveBidService) {
    server.decorate("reserveBidService", options.reserveBidService);
  } else {
    server.decorate("reserveBidService", createPbsReserveBidService({
      db: server.db,
      pgPool: server.pgPool,
      liveSchema: env.LIVE_SCHEMA,
      pbsSchema: env.PBS_SCHEMA,
      cache: pbsCache,
    }));
  }

  if (options.standingBidService) {
    server.decorate("standingBidService", options.standingBidService);
  } else {
    server.decorate("standingBidService", createPbsStandingBidService({
      db: server.db,
      pgPool: server.pgPool,
      liveSchema: env.LIVE_SCHEMA,
      pbsSchema: env.PBS_SCHEMA,
    }));
  }

  if (options.lineholderSummaryService) {
    server.decorate("lineholderSummaryService", options.lineholderSummaryService);
  } else {
    server.decorate("lineholderSummaryService", createPbsLineholderSummaryService({
      db: server.db,
      cache: pbsCache,
    }));
  }

  if (options.pairingSearchService) {
    server.decorate("pairingSearchService", options.pairingSearchService);
  } else if (options.skipDatabase) {
    server.decorate("pairingSearchService", {
      async matchFeedbackPairings() {
        throw new Error("pairingSearchService is unavailable when skipDatabase=true without an injected mock");
      },
      async searchPairingIds() {
        throw new Error("pairingSearchService is unavailable when skipDatabase=true without an injected mock");
      },
      async getPairingNumberFilterOptions() {
        throw new Error("pairingSearchService is unavailable when skipDatabase=true without an injected mock");
      },
      async searchCrewIds() {
        throw new Error("pairingSearchService is unavailable when skipDatabase=true without an injected mock");
      },
      async searchFlightNumbers() {
        throw new Error("pairingSearchService is unavailable when skipDatabase=true without an injected mock");
      },
      async searchPairingOccurrences() {
        throw new Error("pairingSearchService is unavailable when skipDatabase=true without an injected mock");
      },
      async searchPairingOccurrencesByDate() {
        throw new Error("pairingSearchService is unavailable when skipDatabase=true without an injected mock");
      },
      async getPairingDetails() {
        throw new Error("pairingSearchService is unavailable when skipDatabase=true without an injected mock");
      },
      async previewPairings() {
        throw new Error("pairingSearchService is unavailable when skipDatabase=true without an injected mock");
      },
      async countCurrentRules() {
        throw new Error("pairingSearchService is unavailable when skipDatabase=true without an injected mock");
      },
      async countCurrentRuleTierPools() {
        throw new Error("pairingSearchService is unavailable when skipDatabase=true without an injected mock");
      },
      async getAirportOptions() {
        throw new Error("pairingSearchService is unavailable when skipDatabase=true without an injected mock");
      },
      async getTimeBetweenFlightsBounds() {
        throw new Error("pairingSearchService is unavailable when skipDatabase=true without an injected mock");
      },
    } satisfies PbsPairingSearchService);
  } else {
    server.decorate("pairingSearchService", createPbsPairingSearchService({
      pgPool: server.pgPool,
      liveSchema: env.LIVE_SCHEMA,
      pbsSchema: env.PBS_SCHEMA,
      cache: pbsCache,
    }));
  }

  if (options.pbsUserService) {
    server.decorate("pbsUserService", options.pbsUserService);
  } else if (options.skipDatabase) {
    server.decorate("pbsUserService", {
      async searchCrewOptions() {
        throw new Error("pbsUserService is unavailable when skipDatabase=true without an injected mock");
      },
    } satisfies PbsUserService);
  } else {
    server.decorate("pbsUserService", createPbsUserService({
      pgPool: server.pgPool,
      pbsSchema: env.PBS_SCHEMA,
    }));
  }

  if (options.awardResultsService) {
    server.decorate("awardResultsService", options.awardResultsService);
  } else if (options.skipDatabase) {
    server.decorate("awardResultsService", {
      async getCurrentAward() {
        throw new Error("awardResultsService is unavailable when skipDatabase=true without an injected mock");
      },
      async getAwardPeriods() {
        throw new Error("awardResultsService is unavailable when skipDatabase=true without an injected mock");
      },
      async getAwardByPeriodId() {
        throw new Error("awardResultsService is unavailable when skipDatabase=true without an injected mock");
      },
    } satisfies PbsAwardResultsService);
  } else {
    server.decorate("awardResultsService", createPbsAwardResultsService({
      db: server.db,
      pgPool: server.pgPool,
      liveSchema: env.LIVE_SCHEMA,
      pbsSchema: env.PBS_SCHEMA,
    }));
  }

  if (options.bidFeedbackService) {
    server.decorate("bidFeedbackService", options.bidFeedbackService);
  } else if (options.skipDatabase) {
    server.decorate("bidFeedbackService", {
      async getCurrentConflicts() {
        throw new Error("bidFeedbackService is unavailable when skipDatabase=true without an injected mock");
      },
      async getCurrentFeedback() {
        throw new Error("bidFeedbackService is unavailable when skipDatabase=true without an injected mock");
      },
      async getCurrentEligibility() {
        throw new Error("bidFeedbackService is unavailable when skipDatabase=true without an injected mock");
      },
      async startEligibilityRun() {
        throw new Error("bidFeedbackService is unavailable when skipDatabase=true without an injected mock");
      },
      async getEligibilityRun() {
        throw new Error("bidFeedbackService is unavailable when skipDatabase=true without an injected mock");
      },
    } satisfies PbsBidFeedbackService);
  } else {
    server.decorate("bidFeedbackService", createPbsBidFeedbackService({
      pairingBidService: server.pairingBidService,
      daysOffBidService: server.daysOffBidService,
      lineBidService: server.lineBidService,
      reserveBidService: server.reserveBidService,
      standingBidService: server.standingBidService,
      liveSchema: env.LIVE_SCHEMA,
      cache: pbsCache,
      db: server.db,
      pgPool: server.pgPool,
    }));
  }

  if (defaultPairingBidService?.warmUp && !options.skipDatabase) {
    try {
      await defaultPairingBidService.warmUp();
      server.log.info("PBS pairing bid service warmed");
    } catch (error) {
      server.log.warn({ err: error }, "PBS pairing bid service warmup failed");
    }
  }

  await server.register(authPlugin);
  await server.register(healthRoutes);
  await server.register(authRoutes, { prefix: "/api" });
  await server.register(simulatedCrewPortalRoutes, { prefix: "/api" });
  if (env.SSO_ENABLED) {
    await server.register(ssoRoutes, { prefix: "/api" });
  }
  await server.register(pairingBidRoutes, { prefix: "/api" });
  await server.register(lineBidRoutes, { prefix: "/api" });
  await server.register(daysOffBidRoutes, { prefix: "/api" });
  await server.register(reserveBidRoutes, { prefix: "/api" });
  await server.register(standingBidRoutes, { prefix: "/api" });
  await server.register(biddingCalendarRoutes, { prefix: "/api" });
  await server.register(lineholderSummaryRoutes, { prefix: "/api" });
  await server.register(algorithmExportRoutes, { prefix: "/api" });
  await server.register(dashboardProfileRoutes, { prefix: "/api" });
  await server.register(dashboardSummaryRoutes, { prefix: "/api" });
  await server.register(pairingSearchRoutes, { prefix: "/api" });
  await server.register(pbsUserRoutes, { prefix: "/api" });
  await server.register(portalBootstrapRoutes, { prefix: "/api" });
  await server.register(awardResultsRoutes, { prefix: "/api" });
  await server.register(bidFeedbackRoutes, { prefix: "/api" });
  await server.register(bidFeedbackWsRoutes, { prefix: "/api" });

  return server;
};
