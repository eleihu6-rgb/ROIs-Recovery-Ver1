import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyPluginAsync } from "fastify";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";
process.env.PBS_INTERNAL_API_SECRET ||= "test-internal-secret";

const createConfigDb = () => {
  const updates: Record<string, unknown>[] = [];
  return {
    updates,
    select() {
      return {
        from() {
          return {
            where() {
              return {
                async limit() {
                  return [
                    { code: "PBS_PORTAL_PUBLIC_URL", codeValue: "https://crew-f8-usva-sit.roiscloud.com/pbs" },
                    { code: "PBS_SIMULATED_LOGIN_TTL_SECONDS", codeValue: "300" },
                  ];
                },
              };
            },
          };
        },
      };
    },
    update() {
      return {
        set(value: Record<string, unknown>) {
          return {
            where() {
              return {
                async returning() {
                  updates.push(value);
                  return [{ id: updates.length }];
                },
              };
            },
          };
        },
      };
    },
    insert() {
      return {
        async values() {
          throw new Error("insert should not be used when update succeeds");
        },
      };
    },
  };
};

const buildApp = async (
  db: unknown = createConfigDb(),
  options: { withAuthPlugin?: boolean } = {},
) => {
  const module = await import("./simulated-crew-portal.js") as unknown as { default: FastifyPluginAsync };
  const simulatedCrewPortalRoutes = module.default;
  const app = Fastify();
  app.decorate("db", db as never);
  if (options.withAuthPlugin) {
    const authModule = await import("../plugins/auth.js") as unknown as { default: FastifyPluginAsync };
    await app.register(authModule.default);
  }
  await app.register(simulatedCrewPortalRoutes, { prefix: "/api" });
  return app;
};

test("GET /api/internal/simulated-crew-portal/config requires internal access", async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/internal/simulated-crew-portal/config",
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().message, "Internal access required.");
  await app.close();
});

test("GET /api/internal/simulated-crew-portal/config stays public to global auth and is gated by internal secret", async () => {
  const app = await buildApp(createConfigDb(), { withAuthPlugin: true });

  const missingSecret = await app.inject({
    method: "GET",
    url: "/api/internal/simulated-crew-portal/config",
  });

  assert.equal(missingSecret.statusCode, 403);
  assert.equal(missingSecret.json().message, "Internal access required.");

  const response = await app.inject({
    method: "GET",
    url: "/api/internal/simulated-crew-portal/config",
    headers: { "X-Internal-Secret": "test-internal-secret" },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, {
    portalPublicUrl: "https://crew-f8-usva-sit.roiscloud.com/pbs",
    loginTtlSeconds: 300,
  });
  await app.close();
});

test("GET /api/internal/simulated-crew-portal/config returns current configuration", async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/internal/simulated-crew-portal/config",
    headers: { "X-Internal-Secret": "test-internal-secret" },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, {
    portalPublicUrl: "https://crew-f8-usva-sit.roiscloud.com/pbs",
    loginTtlSeconds: 300,
  });
  await app.close();
});

test("PUT /api/internal/simulated-crew-portal/config saves configuration", async () => {
  const db = createConfigDb();
  const app = await buildApp(db);

  const response = await app.inject({
    method: "PUT",
    url: "/api/internal/simulated-crew-portal/config",
    headers: { "X-Internal-Secret": "test-internal-secret" },
    payload: {
      portalPublicUrl: "https://crew-f8-usva-sit.roiscloud.com/pbs/",
      loginTtlSeconds: 600,
      updatedBy: "admin",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data, {
    portalPublicUrl: "https://crew-f8-usva-sit.roiscloud.com/pbs",
    loginTtlSeconds: 600,
  });
  assert.equal(db.updates.length, 2);
  assert.equal(db.updates[0].codeValue, "https://crew-f8-usva-sit.roiscloud.com/pbs");
  assert.equal(db.updates[1].codeValue, "600");
  await app.close();
});
